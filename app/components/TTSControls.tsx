"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useNotification } from "../misc/NotificationContext";
import { useAPIKeys } from "../misc/APIKeysContext";
import { ttsFetch } from "../misc/ttsFetch";
import { TTSModelKey } from "../misc/ai_prices";

interface TTSControlsProps {
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
  if (typeof window === "undefined") return "af_heart";
  return localStorage.getItem("ttsLastVoice") || "af_heart";
};

const getSelectedModel = (): TTSModelKey => {
  if (typeof window === "undefined") return "kokoro";
  const model = localStorage.getItem("ttsModel");
  if (model === "orpheus" || model === "cartesia" || model === "elevenlabs") return model;
  return "kokoro";
};

const getProviderKeyForModel = (
  model: TTSModelKey,
): "deepinfraKey" | "cartesiaKey" | "elevenlabsKey" => {
  if (model === "cartesia") return "cartesiaKey";
  if (model === "elevenlabs") return "elevenlabsKey";
  return "deepinfraKey";
};

const PROVIDER_LABELS: Record<TTSModelKey, string> = {
  kokoro: "DeepInfra",
  orpheus: "DeepInfra",
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
  const audioRef = useRef<HTMLAudioElement | null>(null);
  // Object URLs for each chunk received so far, in order - populated
  // progressively as the stream arrives, and replayed from index 0 on
  // "Replay" without re-fetching.
  const audioUrlsRef = useRef<string[]>([]);
  const currentChunkIndexRef = useRef<number>(0);
  const isStreamingRef = useRef<boolean>(false);
  // True when playback has caught up to a chunk that hasn't arrived yet -
  // onChunkArrived plays it immediately once it lands.
  const waitingForNextRef = useRef<boolean>(false);
  const playbackMutedRef = useRef<boolean>(false);
  // Aborts the in-flight request/stream when `text` itself is about to
  // change (new turn, navigation, undo/edit).
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
      });
    },
    [getAudioElement, addNotification],
  );

  const advanceToNextChunk = useCallback(() => {
    currentChunkIndexRef.current += 1;
    const nextUrl = audioUrlsRef.current[currentChunkIndexRef.current];

    if (nextUrl) {
      playChunkAt(currentChunkIndexRef.current);
    } else if (!isStreamingRef.current) {
      setIsPlaying(false);
    } else {
      waitingForNextRef.current = true;
    }
  }, [playChunkAt]);

  useEffect(() => {
    advanceToNextChunkRef.current = advanceToNextChunk;
  }, [advanceToNextChunk]);

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

      if (idx === 0) {
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
          deepinfraKey: providerKey === "deepinfraKey" ? apiKey : undefined,
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
    [apiKeys.deepinfraKey, apiKeys.cartesiaKey, apiKeys.elevenlabsKey, onChunkArrived],
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
          playbackMutedRef.current = false;
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
          }
        }
      });
  };

  // Consumes newly-arrived streaming text: splits off every complete
  // sentence since the last call and queues it for audio. `flush` (called
  // once narration finishes) also queues whatever trailing partial
  // sentence is left, even without closing punctuation.
  const feedLiveText = useCallback((fullText: string, flush: boolean) => {
    const pending = fullText.slice(liveSentCharsRef.current);
    const { sentences, remainder } = extractCompleteSentences(pending);

    for (const sentence of sentences) {
      liveDispatchQueueRef.current.push(sentence);
    }
    liveSentCharsRef.current = fullText.length - remainder.length;

    if (flush) {
      const trimmedRemainder = remainder.trim();
      if (trimmedRemainder) {
        liveDispatchQueueRef.current.push(trimmedRemainder);
      }
      liveSentCharsRef.current = fullText.length;
    }

    if (liveDispatchQueueRef.current.length > 0) {
      processLiveQueueRef.current();
    } else if (flush && !liveDispatchBusyRef.current) {
      isStreamingRef.current = false;
      if (waitingForNextRef.current) {
        waitingForNextRef.current = false;
        setIsPlaying(false);
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
    currentChunkIndexRef.current = 0;
    isStreamingRef.current = false;
    waitingForNextRef.current = false;
    isGeneratingRef.current = false;
    playbackMutedRef.current = false;
    setHasAudio(false);
    setIsPlaying(false);
    setIsLoading(false);
  }, []);

  // Starts narration for the current text. There's no manual button anymore
  // - this only fires automatically (see the pending-auto-generate effect
  //   below), so in practice only the "fresh activation" branch at the
  //   bottom ever runs. The earlier branches (stop-while-active,
  //   resume-while-muted, replay-when-cached) are defensive leftovers from
  //   when this was reachable from a click at any playback state; harmless
  //   since generateAndQueueAudio's own callback (onChunkArrived) is what
  //   actually drives playback.
  const startNarration = useCallback(async () => {
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
      }
      return;
    }

    if (disabled || !text.trim()) return;

    if (playbackMutedRef.current) {
      // Resuming a muted, still-generating (or since-finished) session -
      // checked against audioUrlsRef directly (not the `hasAudio` state)
      // since this can fire before a render has caught up with it.
      playbackMutedRef.current = false;
      if (audioUrlsRef.current.length === 0) {
        // Nothing has arrived yet - wait for onChunkArrived to play chunk 0
        // once it lands, now that we're unmuted.
        setIsLoading(true);
        return;
      }
      currentChunkIndexRef.current = 0;
      waitingForNextRef.current = false;
      setIsPlaying(true);
      playChunkAt(0);
      return;
    }

    if (hasAudio && audioUrlsRef.current.length > 0) {
      currentChunkIndexRef.current = 0;
      waitingForNextRef.current = false;
      setIsPlaying(true);
      playChunkAt(0);
      return;
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
      currentChunkIndexRef.current = 0;
      waitingForNextRef.current = false;
      isStreamingRef.current = true;

      const chunkCount = await generateAndQueueAudio(text, controller.signal);
      isStreamingRef.current = false;

      if (controller.signal.aborted) {
        // Deactivated mid-stream - playback/loading state was already reset
        // by the toggle-off branch above.
        return;
      }

      if (chunkCount === 0) {
        throw new Error("No audio generated");
      }

      // If playback already caught up to the end while the last chunk was
      // still in flight, finish here rather than leaving isPlaying stuck on
      // an onended that has nothing left to advance to.
      if (waitingForNextRef.current) {
        waitingForNextRef.current = false;
        setIsPlaying(false);
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
        playbackMutedRef.current = false;
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
      if (ttsEnabled) {
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

      if (text.trim() && ttsEnabled && !isStreaming) {
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
        startNarration();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [disabled, text, ttsEnabled, startNarration]);

  // No visible UI - narration just plays automatically per the effects
  // above, the same way the couch co-op/multiplayer bubbles need no on/off
  // control of their own.
  return null;
}
