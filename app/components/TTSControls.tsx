"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { useNotification } from "../misc/NotificationContext";
import { useAPIKeys } from "../misc/APIKeysContext";
import { DynamicIcon } from "./DynamicIcon";
import { ttsFetch } from "../misc/ttsFetch";
import { cleanTextForSpeech } from "../misc/ai";
import { TTSModelKey } from "../misc/ai_prices";

interface TTSControlsProps {
  // Raw (uncleaned) narration text - cleaning happens inside this component,
  // once per finalized sentence during live narration, rather than by the
  // caller. See feedLiveText for why: cleanTextForSpeech isn't prefix-stable
  // (e.g. a ||spoiler|| tag that hasn't closed yet leaves the raw markers in
  // place, then disappears retroactively once it closes), so re-cleaning the
  // whole growing text on every chunk and slicing by absolute offset would
  // desync and silently drop everything after the first such tag.
  text: string;
  disabled?: boolean;
  // Narrower than `disabled`: true once `text` reflects the final,
  // finished narration for this turn, false while it's still streaming in.
  // Drives the live sentence-by-sentence auto-narration pipeline below -
  // unset callers just never enter that mode (text is always treated as
  // already-final).
  storyTextReady?: boolean;
}

const getSelectedVoice = (): string => {
  if (typeof window === "undefined") return "21m00Tcm4TlvDq8ikWAM";
  return localStorage.getItem("ttsLastVoice") || "21m00Tcm4TlvDq8ikWAM";
};

const getSelectedModel = (): TTSModelKey => {
  if (typeof window === "undefined") return "elevenlabs";
  const model = localStorage.getItem("ttsModel");
  if (model === "cartesia") return "cartesia";
  return "elevenlabs";
};

const getProviderKeyForModel = (
  model: TTSModelKey,
): "cartesiaKey" | "elevenlabsKey" => {
  if (model === "cartesia") return "cartesiaKey";
  return "elevenlabsKey";
};

const PROVIDER_LABELS: Record<TTSModelKey, string> = {
  cartesia: "Cartesia",
  elevenlabs: "ElevenLabs",
};

const getVolume = (): number => {
  if (typeof window === "undefined") return 1.0;
  return parseFloat(localStorage.getItem("ttsVolume") || "1.0");
};

const isTTSEnabled = (): boolean => {
  if (typeof window === "undefined") return true;
  return localStorage.getItem("ttsEnabled") !== "false";
};

const isAutoGenerateEnabled = (): boolean => {
  if (typeof window === "undefined") return false;
  return localStorage.getItem("ttsAutoGenerate") === "true";
};

// A tiny (near-silent) WAV data URI used to "unlock" an <audio> element.
// Browsers such as Safari/iOS only allow `play()` to succeed when it is
// invoked synchronously inside a user-gesture handler; once an element has
// successfully played (even a fraction of a second of silence) as a direct
// result of a gesture, that same element remains allowed to play new
// sources later on without requiring another gesture.
const SILENT_AUDIO_DATA_URI =
  "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=";

// Reads the framed chunk stream from /api/tts/generate (see frameChunk() in
// ttsCall.ts: each chunk is a 4-byte big-endian length prefix followed by
// that many bytes of independently-playable MP3), handing each chunk to
// onChunk as soon as it's fully received rather than waiting for the whole
// response. Falls back to treating the whole body as one chunk if the
// runtime doesn't expose a readable stream. Stops early (without treating it
// as an error) once `signal` is aborted, so deactivating mid-stream doesn't
// keep pulling and playing further chunks. Returns the number of chunks.
async function streamChunksToPlayer(
  response: Response,
  onChunk: (blob: Blob) => void,
  signal?: AbortSignal,
): Promise<number> {
  const reader = response.body?.getReader();
  if (!reader) {
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength === 0) return 0;
    onChunk(new Blob([buffer], { type: "audio/mpeg" }));
    return 1;
  }

  let buffered = new Uint8Array(0);
  let count = 0;

  const append = (data: Uint8Array) => {
    const merged = new Uint8Array(buffered.length + data.length);
    merged.set(buffered);
    merged.set(data, buffered.length);
    buffered = merged;
  };

  while (true) {
    if (signal?.aborted) {
      await reader.cancel().catch(() => {});
      break;
    }

    let done: boolean;
    let value: Uint8Array | undefined;
    try {
      ({ done, value } = await reader.read());
    } catch (err) {
      if (signal?.aborted) break;
      throw err;
    }

    if (value && value.length > 0) append(value);

    while (buffered.length >= 4) {
      const view = new DataView(buffered.buffer, buffered.byteOffset, buffered.length);
      const chunkLength = view.getUint32(0, false);
      if (buffered.length < 4 + chunkLength) break;

      const chunkBytes = buffered.slice(4, 4 + chunkLength);
      onChunk(new Blob([chunkBytes], { type: "audio/mpeg" }));
      count += 1;
      buffered = buffered.slice(4 + chunkLength);
    }

    if (done) break;
  }

  return count;
}

// Sentence-end markers used to split streaming narration into speakable
// units as it arrives - mirrors the boundary heuristic ttsCall.ts's
// splitTextIntoChunks already uses server-side for size-based chunking, so
// both share the same (imperfect - doesn't special-case abbreviations,
// decimals, etc.) notion of "sentence."
const SENTENCE_END_MARKERS = [". ", ".\n", "! ", "!\n", "? ", "?\n"];

// Splits every complete sentence off the front of `pending`, left to right,
// leaving any trailing incomplete sentence in `remainder` for next time.
// Exported for direct unit testing (tests/ttsControls.sentences.test.ts).
export function extractCompleteSentences(
  pending: string,
): { sentences: string[]; remainder: string } {
  const sentences: string[] = [];
  let remaining = pending;

  while (true) {
    let cutAt = -1;
    let markerLength = 0;
    for (const marker of SENTENCE_END_MARKERS) {
      const idx = remaining.indexOf(marker);
      if (idx !== -1 && (cutAt === -1 || idx < cutAt)) {
        cutAt = idx;
        markerLength = marker.length;
      }
    }
    if (cutAt === -1) break;

    const sentence = remaining.slice(0, cutAt + 1).trim();
    if (sentence) sentences.push(sentence);
    remaining = remaining.slice(cutAt + markerLength);
  }

  return { sentences, remainder: remaining };
}

// A "||" spoiler tag that hasn't closed yet must not be spoken past (its
// contents may include punctuation that looks like a sentence end, and
// cleanTextForSpeech can't strip it until the closing "||" shows up) - this
// holds back everything from an odd (unclosed) "||" onward so the caller
// only ever extracts sentences from text with no dangling spoiler markers.
export function withholdOpenSpoiler(pending: string): { safe: string; held: string } {
  const markerCount = (pending.match(/\|\|/g) || []).length;
  if (markerCount % 2 === 0) return { safe: pending, held: "" };
  const lastMarker = pending.lastIndexOf("||");
  return { safe: pending.slice(0, lastMarker), held: pending.slice(lastMarker) };
}

export default function TTSControls({
  text,
  disabled = false,
  storyTextReady = true,
}: TTSControlsProps) {
  const { addNotification } = useNotification();
  const { keys: apiKeys } = useAPIKeys();
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [hasAudio, setHasAudio] = useState(false);
  // True after the user presses Stop while audio was still being generated
  // (manual whole-text stream or a live auto-narration session) - playback
  // is silenced but the underlying generation keeps running in the
  // background so all of it is ready the moment the user presses the button
  // again, rather than throwing away work just because they wanted a
  // moment of quiet. See handleToggle and onChunkArrived.
  const [isMuted, setIsMuted] = useState(false);
  // Mirror currentChunkIndexRef/audioUrlsRef.length into state purely so the
  // prev/next sentence buttons and progress bar can react to them - the refs
  // stay the source of truth (see setCurrentChunkIndex below).
  const [chunkIndex, setChunkIndexState] = useState(0);
  const [chunkCount, setChunkCountState] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  // Object URLs for each chunk received so far, in order - populated
  // progressively as the stream arrives, and replayed from index 0 on
  // "Replay" without re-fetching.
  const audioUrlsRef = useRef<string[]>([]);
  const currentChunkIndexRef = useRef<number>(0);
  // True once playback has run all the way to the end of the narration with
  // nothing left generating - distinguishes "finished, next Play should
  // restart from sentence 0" from "paused mid-way, next Play should resume
  // at the current sentence" in handleToggle.
  const finishedRef = useRef<boolean>(true);

  const setCurrentChunkIndex = useCallback((index: number) => {
    currentChunkIndexRef.current = index;
    setChunkIndexState(index);
  }, []);
  const isStreamingRef = useRef<boolean>(false);
  // True when playback has caught up to a chunk that hasn't arrived yet -
  // onChunkArrived plays it immediately once it lands.
  const waitingForNextRef = useRef<boolean>(false);
  const playbackMutedRef = useRef<boolean>(false);
  // Lets a press mid-generation cancel the in-flight request/stream instead
  // of just stopping playback of whatever's already landed. Only used when
  // `text` itself is about to change (new turn, navigation, undo/edit) -
  // the user pressing Stop no longer aborts anything, see handleToggle.
  const abortControllerRef = useRef<AbortController | null>(null);
  const lastTextRef = useRef<string>("");
  const isGeneratingRef = useRef<boolean>(false);
  const pendingAutoGenerateRef = useRef<boolean>(false);

  // Live narration (auto-narrate while the GM is still streaming): tracks
  // how much of `text` has already been dispatched as sentence-sized audio
  // requests, a queue of sentences waiting to be sent, and whether a
  // session is currently active - see the effect below and feedLiveText/
  // processLiveQueue.
  const liveWasStreamingRef = useRef<boolean>(false);
  const liveModeActiveRef = useRef<boolean>(false);
  const liveSentCharsRef = useRef<number>(0);
  const liveDispatchQueueRef = useRef<string[]>([]);
  const liveDispatchBusyRef = useRef<boolean>(false);
  const liveAbortControllerRef = useRef<AbortController | null>(null);

  const ttsEnabled = isTTSEnabled();

  // Update volume when it changes in localStorage
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = getVolume();
    }
  }, []);

  // Clean up the persistent audio element, any in-flight request, and any
  // buffered chunk URLs when this component unmounts.
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
      liveAbortControllerRef.current?.abort();
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.removeAttribute("src");
        audioRef.current = null;
      }
      audioUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      audioUrlsRef.current = [];
    };
  }, []);

  // Lazily get (or create) a single, persistent <audio> element that we
  // reuse for the lifetime of this component instead of constructing a new
  // Audio() for every playback. Reusing the same element matters because
  // once it has successfully played as a direct result of a user gesture,
  // browsers keep allowing that same element to play subsequent sources
  // (e.g. once the network request for a fresh generation finishes) even
  // though that later `play()` call is no longer synchronously tied to the
  // click.
  const getAudioElement = useCallback((): HTMLAudioElement => {
    if (!audioRef.current) {
      audioRef.current = new Audio();
    }
    return audioRef.current;
  }, []);

  // Auto-narrate's first playback attempt for a turn is never itself inside
  // a click handler (it's kicked off by the streaming-text effect below, or
  // by onChunkArrived once network audio lands) - without ever having played
  // as a direct result of a gesture, that first `play()` call is exactly the
  // case browsers block. Unlock the persistent element on the very first
  // pointer/key interaction anywhere on the page, so by the time a turn's
  // audio is ready to play (the player necessarily had to click a choice or
  // type something to trigger that turn in the first place) it's already
  // eligible - without requiring a manual press of this button first.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const unlock = () => {
      const audio = getAudioElement();
      // Only stomp the element's src if nothing real has ever been queued
      // on it yet - avoids clobbering an actual TTS chunk in the (very
      // unlikely) case this first-ever page interaction lands in the brief
      // async window between playChunkAt setting a real src and playback
      // actually starting (audio.paused stays true until then).
      if (audio.paused && audioUrlsRef.current.length === 0) {
        audio.src = SILENT_AUDIO_DATA_URI;
        audio.play().catch(() => {
          // Ignore - this is just a best-effort unlock attempt.
        });
      }
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, [getAudioElement]);

  // Forwarding ref so playChunkAt's onended handler can call the latest
  // advanceToNextChunk without the two useCallbacks needing to reference
  // each other before they're defined.
  const advanceToNextChunkRef = useRef<() => void>(() => {});

  const playChunkAt = useCallback(
    (index: number) => {
      const url = audioUrlsRef.current[index];
      if (!url) return;

      const audio = getAudioElement();
      audio.volume = getVolume();
      audio.src = url;

      audio.onended = () => advanceToNextChunkRef.current();
      audio.onerror = () => {
        addNotification("Failed to play audio", "failure");
        setIsPlaying(false);
      };

      audio.play().catch((err) => {
        console.error("TTS playback error:", err);
        // A rejected play() (e.g. the browser's autoplay policy blocking a
        // call that isn't tied to a user gesture) leaves nothing actually
        // audible - don't leave the button showing "Stop" for playback that
        // never started. The audio is still cached (hasAudio/audioUrlsRef),
        // so the next real click will play it as a genuine gesture instead.
        setIsPlaying(false);
      });
    },
    [getAudioElement, addNotification],
  );

  const advanceToNextChunk = useCallback(() => {
    const nextIndex = currentChunkIndexRef.current + 1;
    setCurrentChunkIndex(nextIndex);
    const nextUrl = audioUrlsRef.current[nextIndex];

    if (nextUrl) {
      playChunkAt(nextIndex);
    } else if (!isStreamingRef.current) {
      setIsPlaying(false);
      finishedRef.current = true;
    } else {
      waitingForNextRef.current = true;
    }
  }, [playChunkAt, setCurrentChunkIndex]);

  useEffect(() => {
    advanceToNextChunkRef.current = advanceToNextChunk;
  }, [advanceToNextChunk]);

  // Jumps playback directly to a given chunk (sentence) - shared by the
  // prev/next sentence buttons. Clamped to the chunks actually buffered so
  // far; does nothing if none have arrived yet.
  const skipToChunk = useCallback(
    (index: number) => {
      const maxIndex = audioUrlsRef.current.length - 1;
      if (maxIndex < 0) return;
      const clamped = Math.max(0, Math.min(index, maxIndex));
      waitingForNextRef.current = false;
      finishedRef.current = false;
      playbackMutedRef.current = false;
      setIsMuted(false);
      setCurrentChunkIndex(clamped);
      setIsPlaying(true);
      playChunkAt(clamped);
    },
    [playChunkAt, setCurrentChunkIndex],
  );

  const handleSkipBack = useCallback(() => {
    skipToChunk(currentChunkIndexRef.current - 1);
  }, [skipToChunk]);

  const handleSkipForward = useCallback(() => {
    skipToChunk(currentChunkIndexRef.current + 1);
  }, [skipToChunk]);

  // Called as each chunk finishes streaming in - whether from a single
  // whole-text generation or one of many live per-sentence requests, both
  // just append to the same ordered queue. Starts playback the moment the
  // first chunk lands, and auto-plays any later chunk that arrives while
  // playback is waiting on it - unless the user has muted playback (Stop
  // pressed mid-generation), in which case chunks keep accumulating for a
  // later Resume/Replay but nothing auto-plays.
  const onChunkArrived = useCallback(
    (blob: Blob) => {
      const url = URL.createObjectURL(blob);
      audioUrlsRef.current.push(url);
      const idx = audioUrlsRef.current.length - 1;
      setChunkCountState(audioUrlsRef.current.length);

      if (idx === 0) {
        finishedRef.current = false;
        setHasAudio(true);
        setIsLoading(false);
        if (!playbackMutedRef.current) {
          setIsPlaying(true);
          playChunkAt(0);
        }
      } else if (
        !playbackMutedRef.current &&
        waitingForNextRef.current &&
        idx === currentChunkIndexRef.current
      ) {
        waitingForNextRef.current = false;
        playChunkAt(idx);
      }
    },
    [playChunkAt],
  );

  // Shared by both the manual "activate" path and the live narration
  // pipeline: resolves the selected voice/model/key, requests audio for
  // `textToSpeak`, and streams the resulting chunk(s) into the playback
  // queue via onChunkArrived. Returns the chunk count.
  const generateAndQueueAudio = useCallback(
    async (textToSpeak: string, signal?: AbortSignal): Promise<number> => {
      const selectedVoice = getSelectedVoice();
      const selectedModel = getSelectedModel();
      const providerKey = getProviderKeyForModel(selectedModel);
      const apiKey = apiKeys[providerKey];
      if (!apiKey) {
        throw new Error(
          `${PROVIDER_LABELS[selectedModel]} API key is required. Please add your own key in Settings.`
        );
      }

      const response = await ttsFetch(
        {
          text: textToSpeak,
          voiceId: selectedVoice,
          model: selectedModel,
          cartesiaKey: providerKey === "cartesiaKey" ? apiKey : undefined,
          elevenlabsKey: providerKey === "elevenlabsKey" ? apiKey : undefined,
        },
        signal,
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to generate speech");
      }

      return streamChunksToPlayer(response, onChunkArrived, signal);
    },
    [apiKeys.cartesiaKey, apiKeys.elevenlabsKey, onChunkArrived],
  );

  // Drains liveDispatchQueueRef one sentence at a time (sequential, not
  // parallel, so audio always arrives - and therefore plays - in the same
  // order the sentences were written in). Marks isStreamingRef false once
  // the queue is empty and no more sentences will ever arrive, so the
  // playback queue's own "waiting for next" logic knows to finish up
  // instead of waiting forever.
  const processLiveQueueRef = useRef<() => void>(() => {});
  processLiveQueueRef.current = () => {
    if (liveDispatchBusyRef.current) return;
    const next = liveDispatchQueueRef.current.shift();
    if (!next) return;

    liveDispatchBusyRef.current = true;
    generateAndQueueAudio(next, liveAbortControllerRef.current?.signal)
      .catch((err: unknown) => {
        if (liveAbortControllerRef.current?.signal.aborted) return;
        console.error("Live narration error:", err);
        const message =
          err instanceof Error ? err.message : "Failed to generate speech";
        addNotification(message, "failure");
        // Stop the live session on error rather than retrying every
        // subsequent sentence and spamming notifications.
        liveDispatchQueueRef.current = [];
        liveModeActiveRef.current = false;
        if (audioUrlsRef.current.length === 0) {
          setIsLoading(false);
          setIsPlaying(false);
          // Nothing came through and nothing more is coming - don't leave
          // the button stuck offering to "Resume" a session that has
          // nothing left to generate.
          playbackMutedRef.current = false;
          setIsMuted(false);
        }
      })
      .finally(() => {
        liveDispatchBusyRef.current = false;
        if (liveDispatchQueueRef.current.length > 0) {
          processLiveQueueRef.current();
        } else if (!liveModeActiveRef.current) {
          isStreamingRef.current = false;
          if (waitingForNextRef.current) {
            waitingForNextRef.current = false;
            setIsPlaying(false);
            finishedRef.current = true;
          }
        }
      });
  };

  // Consumes newly-arrived RAW streaming text: splits off every complete
  // sentence since the last call and queues it for audio, cleaning each
  // sentence individually (once, right before it's queued) rather than
  // re-cleaning the whole growing text and slicing by absolute offset - the
  // latter breaks as soon as a ||spoiler|| tag closes, since cleaning the
  // fuller text then retroactively shrinks it and desyncs the offset,
  // silently dropping everything spoken after that point. `flush` (called
  // once narration finishes) also queues whatever trailing partial sentence
  // is left, even without closing punctuation.
  const feedLiveText = useCallback((fullRawText: string, flush: boolean) => {
    const pending = fullRawText.slice(liveSentCharsRef.current);

    // Don't split sentences out of an unclosed ||spoiler|| span - hold that
    // part back until its closing "||" arrives, so it's never spoken
    // half-hidden and its internal punctuation never gets mistaken for a
    // sentence boundary.
    const { safe, held } = flush
      ? { safe: pending, held: "" }
      : withholdOpenSpoiler(pending);
    const { sentences, remainder } = extractCompleteSentences(safe);

    for (const sentence of sentences) {
      const spoken = cleanTextForSpeech(sentence).trim();
      if (spoken) liveDispatchQueueRef.current.push(spoken);
    }
    liveSentCharsRef.current = fullRawText.length - (remainder.length + held.length);

    if (flush) {
      const trimmedRemainder = cleanTextForSpeech(remainder).trim();
      if (trimmedRemainder) {
        liveDispatchQueueRef.current.push(trimmedRemainder);
      }
      liveSentCharsRef.current = fullRawText.length;
    }

    if (liveDispatchQueueRef.current.length > 0) {
      processLiveQueueRef.current();
    } else if (flush && !liveDispatchBusyRef.current) {
      isStreamingRef.current = false;
      if (waitingForNextRef.current) {
        waitingForNextRef.current = false;
        setIsPlaying(false);
        finishedRef.current = true;
      }
    }
  }, []);

  // Stops any playback/generation in progress (manual or live) and clears
  // cached audio - used whenever `text` is about to represent something
  // different (a new turn starting, navigation, undo/retry/edit, etc.).
  const stopAndResetPlayback = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    liveAbortControllerRef.current?.abort();
    liveAbortControllerRef.current = null;
    liveModeActiveRef.current = false;
    liveDispatchQueueRef.current = [];
    liveDispatchBusyRef.current = false;

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.removeAttribute("src");
    }
    audioUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    audioUrlsRef.current = [];
    setCurrentChunkIndex(0);
    setChunkCountState(0);
    finishedRef.current = true;
    isStreamingRef.current = false;
    waitingForNextRef.current = false;
    isGeneratingRef.current = false;
    playbackMutedRef.current = false;
    setHasAudio(false);
    setIsPlaying(false);
    setIsLoading(false);
    setIsMuted(false);
  }, [setCurrentChunkIndex]);

  // Single toggle button behavior:
  // - idle, nothing cached -> activate: turn on auto-narrate (so future
  //   streamed turns start reading themselves too) and generate + stream +
  //   play the current text live.
  // - active (generating and/or playing, manually or via live narration) ->
  //   stop: pause playback immediately, but if audio is still being
  //   generated in the background (manual stream or live narration mid
  //   GM-response), let it keep generating rather than aborting it - the
  //   user may just have wanted a moment of quiet, not to throw the work
  //   away. `isMuted` tracks this "generating quietly" state.
  // - muted (stopped mid-generation) -> resume: unmute and either play what
  //   is already cached, or, if nothing has arrived yet, wait for the first
  //   chunk and play it when it lands.
  // - inactive with cached audio for this text (deactivated after
  //   generation finished, or playback finished naturally) -> replay the
  //   cached recording without regenerating.
  const handleToggle = useCallback(async () => {
    if (isPlaying || isLoading) {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
      setIsPlaying(false);
      setIsLoading(false);

      if (isStreamingRef.current) {
        // More audio is still on its way (manual stream or live
        // auto-narration) - mute instead of aborting so it all finishes
        // generating in the background.
        playbackMutedRef.current = true;
        setIsMuted(true);
      }
      return;
    }

    if (disabled || !text.trim()) return;

    if (playbackMutedRef.current) {
      // Resuming a muted, still-generating (or since-finished) session -
      // checked against audioUrlsRef directly (not the `hasAudio` state)
      // since this can fire before a render has caught up with it.
      playbackMutedRef.current = false;
      setIsMuted(false);
      if (audioUrlsRef.current.length === 0) {
        // Nothing has arrived yet - wait for onChunkArrived to play chunk 0
        // once it lands, now that we're unmuted.
        setIsLoading(true);
        return;
      }
      // Resume from wherever playback had gotten to when muted, rather than
      // restarting - muting only ever happens mid-generation, so this is
      // never a "finished" session.
      waitingForNextRef.current = false;
      setIsPlaying(true);
      playChunkAt(currentChunkIndexRef.current);
      return;
    }

    if (hasAudio && audioUrlsRef.current.length > 0) {
      // Paused mid-way -> resume at the current sentence; finished
      // naturally -> Play restarts from the top, like a podcast player.
      const resumeIndex = finishedRef.current ? 0 : currentChunkIndexRef.current;
      setCurrentChunkIndex(resumeIndex);
      waitingForNextRef.current = false;
      setIsPlaying(true);
      playChunkAt(resumeIndex);
      return;
    }

    // Fresh activation: turn on auto-narrate so future streamed turns start
    // reading themselves too, in addition to reading the current text now.
    if (typeof window !== "undefined") {
      localStorage.setItem("ttsAutoGenerate", "true");
    }

    const volume = getVolume();

    // Prime the persistent <audio> element synchronously, still within the
    // click's user-gesture call stack, before doing any async work (network
    // fetch). This "unlocks" the element for browsers (notably Safari/iOS)
    // that require play() to be invoked directly from a gesture handler.
    const audio = getAudioElement();
    audio.volume = volume;
    if (audio.paused) {
      audio.src = SILENT_AUDIO_DATA_URI;
      audio.play().catch(() => {
        // Ignore - this is just a best-effort unlock attempt.
      });
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      isGeneratingRef.current = true;
      setIsLoading(true);

      audioUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      audioUrlsRef.current = [];
      setChunkCountState(0);
      setCurrentChunkIndex(0);
      waitingForNextRef.current = false;
      isStreamingRef.current = true;

      const generatedChunkCount = await generateAndQueueAudio(
        cleanTextForSpeech(text),
        controller.signal,
      );
      isStreamingRef.current = false;

      if (controller.signal.aborted) {
        // Deactivated mid-stream - playback/loading state was already reset
        // by the toggle-off branch above.
        return;
      }

      if (generatedChunkCount === 0) {
        throw new Error("No audio generated");
      }

      // If playback already caught up to the end while the last chunk was
      // still in flight, finish here rather than leaving isPlaying stuck on
      // an onended that has nothing left to advance to.
      if (waitingForNextRef.current) {
        waitingForNextRef.current = false;
        setIsPlaying(false);
        finishedRef.current = true;
      }
    } catch (error: unknown) {
      if (controller.signal.aborted) {
        // User deactivated - not a real failure, already handled above.
        return;
      }
      console.error("TTS error:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Failed to generate speech";
      addNotification(errorMessage, "failure");
      setIsPlaying(false);
      if (audioUrlsRef.current.length === 0) {
        // Nothing came through and nothing more is coming - don't leave the
        // button stuck offering to "Resume" a session that has nothing left
        // to generate.
        playbackMutedRef.current = false;
        setIsMuted(false);
      }
    } finally {
      setIsLoading(false);
      isGeneratingRef.current = false;
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
    }
  }, [
    disabled,
    text,
    isPlaying,
    isLoading,
    hasAudio,
    generateAndQueueAudio,
    playChunkAt,
    addNotification,
    getAudioElement,
    setCurrentChunkIndex,
  ]);

  // Drives four things off changes to `text`/`storyTextReady`:
  // 1. A new turn's narration just started streaming (storyTextReady flips
  //    false) - reset everything, and if auto-narrate is on, start a live
  //    session.
  // 2. More text arrived mid-stream during an active live session - feed
  //    newly-completed sentences into the queue.
  // 3. Narration just finished streaming while a live session was active -
  //    flush the trailing partial sentence; playback keeps going via the
  //    existing queue until it drains.
  // 4. A plain text change with no live session involved (navigation, undo,
  //    edit, or text that was never streaming to begin with) - the original
  //    "wait for text to settle, then generate once" behavior.
  useEffect(() => {
    const textChanged = text !== lastTextRef.current;
    lastTextRef.current = text;

    const isStreaming = !storyTextReady;
    const wasStreaming = liveWasStreamingRef.current;
    liveWasStreamingRef.current = isStreaming;

    if (isStreaming && !wasStreaming) {
      stopAndResetPlayback();
      liveSentCharsRef.current = 0;
      if (ttsEnabled && isAutoGenerateEnabled()) {
        liveModeActiveRef.current = true;
        isStreamingRef.current = true;
        liveAbortControllerRef.current = new AbortController();
        setIsLoading(true);
      }
      return;
    }

    if (liveModeActiveRef.current && isStreaming) {
      feedLiveText(text, false);
      return;
    }

    if (!isStreaming && wasStreaming && liveModeActiveRef.current) {
      feedLiveText(text, true);
      liveModeActiveRef.current = false;
      return;
    }

    if (textChanged) {
      stopAndResetPlayback();

      const autoGenerate = isAutoGenerateEnabled();
      if (autoGenerate && text.trim() && ttsEnabled && !isStreaming) {
        pendingAutoGenerateRef.current = true;
      }
    }
  }, [text, storyTextReady, ttsEnabled, stopAndResetPlayback, feedLiveText]);

  // Trigger auto-generate (non-live case: text arrived already-finished,
  // e.g. navigation/undo/edit) when not disabled and pending
  useEffect(() => {
    if (
      !disabled &&
      pendingAutoGenerateRef.current &&
      !isGeneratingRef.current &&
      text.trim() &&
      ttsEnabled
    ) {
      pendingAutoGenerateRef.current = false;
      const timer = setTimeout(() => {
        handleToggle();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [disabled, text, ttsEnabled, handleToggle]);

  if (!ttsEnabled) {
    return null;
  }

  const isActive = isPlaying || isLoading;
  const isGeneratingOnly = isLoading && !isPlaying && !isMuted;
  // Once there's been any audio for this turn (playing, paused-with-cached-
  // audio, or muted mid-generation), show the full transport bar instead of
  // the plain activation button.
  const hasController = isActive || isMuted || hasAudio;
  // `disabled` blocks starting something new (text isn't ready yet), but
  // never blocks stopping something already active, and never blocks
  // resuming a muted session - both must stay clickable even while
  // narration is still streaming, since that's exactly when they apply.
  const buttonDisabled = (disabled || !text.trim()) && !isActive && !isMuted;
  const canSkipBack = hasController && chunkIndex > 0;
  const canSkipForward = hasController && chunkIndex < chunkCount - 1;
  const progressPct = chunkCount > 0 ? ((chunkIndex + 1) / chunkCount) * 100 : 0;

  const centerTitle = isGeneratingOnly
    ? "Generating..."
    : isPlaying
      ? "Pause"
      : isMuted
        ? "Resume playback"
        : finishedRef.current
          ? "Replay"
          : "Resume";

  if (!hasController) {
    return (
      <div className="flex items-center gap-2">
        <button
          onClick={handleToggle}
          disabled={buttonDisabled}
          className={`flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg transition-all ${
            buttonDisabled
              ? "bg-white/5 text-blue-300/40 cursor-not-allowed"
              : "bg-linear-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white shadow-md shadow-purple-950/40"
          }`}
          title="Read aloud"
        >
          <DynamicIcon name="Play" className="w-4 h-4" />
          <span className="hidden sm:inline">TTS</span>
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5 bg-white/5 border border-white/10 rounded-full pl-1 pr-2.5 py-1">
      <button
        onClick={handleSkipBack}
        disabled={!canSkipBack}
        className={`w-7 h-7 shrink-0 rounded-full flex items-center justify-center transition-colors ${
          canSkipBack
            ? "text-blue-100/80 hover:bg-white/10 hover:text-white"
            : "text-blue-300/25 cursor-not-allowed"
        }`}
        title="Previous sentence"
      >
        <DynamicIcon name="SkipBack" className="w-4 h-4" />
      </button>

      <button
        onClick={handleToggle}
        disabled={buttonDisabled}
        className={`w-8 h-8 shrink-0 rounded-full flex items-center justify-center transition-all shadow-md ${
          buttonDisabled
            ? "bg-white/5 text-blue-300/40 cursor-not-allowed"
            : "bg-linear-to-br from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white shadow-purple-950/40"
        }`}
        title={centerTitle}
      >
        {isGeneratingOnly ? (
          <DynamicIcon name="Loader2" className="animate-spin w-4 h-4" />
        ) : isPlaying ? (
          <DynamicIcon name="Pause" className="w-4 h-4" />
        ) : (
          <DynamicIcon name="Play" className="w-4 h-4 ml-0.5" />
        )}
      </button>

      <button
        onClick={handleSkipForward}
        disabled={!canSkipForward}
        className={`w-7 h-7 shrink-0 rounded-full flex items-center justify-center transition-colors ${
          canSkipForward
            ? "text-blue-100/80 hover:bg-white/10 hover:text-white"
            : "text-blue-300/25 cursor-not-allowed"
        }`}
        title="Next sentence"
      >
        <DynamicIcon name="SkipForward" className="w-4 h-4" />
      </button>

      {chunkCount > 1 && (
        <div
          className="w-10 h-1 rounded-full bg-white/10 overflow-hidden ml-0.5"
          aria-hidden="true"
        >
          <div
            className="h-full bg-purple-400/80 transition-[width]"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      )}
    </div>
  );
}
