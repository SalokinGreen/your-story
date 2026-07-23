"use client";

import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  useImperativeHandle,
} from "react";
import { useNotification } from "../misc/NotificationContext";
import { useAPIKeys } from "../misc/APIKeysContext";
import { DynamicIcon } from "./DynamicIcon";
import { ttsFetch } from "../misc/ttsFetch";
import { cleanTextForSpeech } from "../misc/ai";
import { TTSModelKey } from "../misc/ai_prices";

// Imperative handle a networked guest uses to feed the host's relayed audio
// chunks straight into this player's playback queue (see relayMode). The host
// generates TTS once and forwards each MP3 chunk; guests play them without
// needing their own TTS key.
export interface TTSRelayHandle {
  // Push one base64-encoded MP3 chunk for `turnId` at play order `index`. A new
  // turnId resets the queue (a fresh narration is starting).
  push: (turnId: string, index: number, base64: string) => void;
  // No more chunks are coming for `turnId` - let playback finish.
  end: (turnId: string) => void;
}

// base64 <-> bytes helpers for relaying MP3 chunks over the JSON-safe wire.
function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

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
  // Host relay (networked co-op): called with each generated MP3 chunk as
  // base64, tagged with a per-session turnId and its play order, so the host
  // can forward the audio to guests. onAudioEnd fires once generation for that
  // session finishes.
  onAudioChunk?: (turnId: string, index: number, base64: string) => void;
  onAudioEnd?: (turnId: string) => void;
  // Guest relay: when true this component never generates its own audio - it
  // only plays chunks pushed in through relayHandleRef (the host's narration).
  relayMode?: boolean;
  relayHandleRef?: React.Ref<TTSRelayHandle>;
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

// Formats a seconds count as m:ss for the seek bar's time readouts.
const formatTime = (seconds: number): string => {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
  const total = Math.floor(seconds);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
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
  onAudioChunk,
  onAudioEnd,
  relayMode = false,
  relayHandleRef,
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
  // Continuous-timeline state driving the scrubbable seek bar. The narration
  // is really many independent per-sentence MP3 chunks, but we present them
  // as one seekable track: `totalDuration` is the summed length of every
  // chunk buffered so far (grows as more stream in), `globalTime` is the
  // playhead's position across that whole timeline, and while the user is
  // dragging the bar we show `dragTime` instead so the thumb tracks the
  // pointer without committing a seek until release.
  const [totalDuration, setTotalDuration] = useState(0);
  const [globalTime, setGlobalTime] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [dragTime, setDragTime] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  // Object URLs for each chunk received so far, in order - populated
  // progressively as the stream arrives, and replayed from index 0 on
  // "Replay" without re-fetching.
  const audioUrlsRef = useRef<string[]>([]);
  // Per-chunk duration in seconds, parallel to audioUrlsRef - filled in
  // asynchronously as each chunk's metadata loads (see probeChunkDuration).
  // An entry is 0 until its duration is known (or if it can't be read); the
  // seek math tolerates that and self-corrects once the metadata lands.
  const chunkDurationsRef = useRef<number[]>([]);
  const seekBarRef = useRef<HTMLDivElement | null>(null);
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

  // Recompute the total (summed) duration of every buffered chunk into state
  // so the seek bar's length/labels update as durations resolve.
  const recomputeTotalDuration = useCallback(() => {
    const total = chunkDurationsRef.current.reduce(
      (sum, d) => sum + (d > 0 ? d : 0),
      0,
    );
    setTotalDuration(total);
  }, []);

  // Sum of the durations of every chunk *before* `index` - i.e. the global
  // timeline offset at which chunk `index` begins. Reads the ref directly so
  // it needs no re-render to stay correct.
  const cumulativeBefore = useCallback((index: number): number => {
    let acc = 0;
    for (let i = 0; i < index; i++) acc += chunkDurationsRef.current[i] || 0;
    return acc;
  }, []);

  // Load a chunk's duration off-screen (a throwaway metadata-only <audio>)
  // and fold it into the timeline once known. `durationchange` catches the
  // case where a duration first reports Infinity/NaN and is corrected later.
  const probeChunkDuration = useCallback(
    (index: number, url: string) => {
      const probe = new Audio();
      probe.preload = "metadata";
      const record = () => {
        const d = probe.duration;
        if (Number.isFinite(d) && d > 0) {
          chunkDurationsRef.current[index] = d;
          recomputeTotalDuration();
        }
      };
      probe.addEventListener("loadedmetadata", record);
      probe.addEventListener("durationchange", record);
      probe.addEventListener("error", () => {
        // Leave the duration at 0 - the seek math treats unknown chunks as
        // zero-length rather than breaking the whole timeline.
        recomputeTotalDuration();
      });
      probe.src = url;
    },
    [recomputeTotalDuration],
  );

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

  // Host relay: the current generation session's id (fresh per narration) and
  // whether we've emitted any chunk for it yet, so onAudioEnd only fires for
  // sessions that actually produced audio.
  const relaySessionIdRef = useRef<string>("");
  const relayEmittedRef = useRef<boolean>(false);
  // Guest relay: the turnId currently being played, so a new turnId resets the
  // queue. Refs so the imperative handle callbacks stay stable.
  const relayCurrentTurnRef = useRef<string>("");

  const ttsEnabled = isTTSEnabled();

  const emitAudioEnd = useCallback(() => {
    if (relayEmittedRef.current && relaySessionIdRef.current) {
      onAudioEnd?.(relaySessionIdRef.current);
    }
    relayEmittedRef.current = false;
  }, [onAudioEnd]);

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
    (index: number, offsetSeconds = 0) => {
      const url = audioUrlsRef.current[index];
      if (!url) return;

      const audio = getAudioElement();
      audio.volume = getVolume();

      audio.onended = () => advanceToNextChunkRef.current();
      audio.onerror = () => {
        addNotification("Failed to play audio", "failure");
        setIsPlaying(false);
      };

      const startPlayback = () => {
        audio.play().catch((err) => {
          console.error("TTS playback error:", err);
          // A rejected play() (e.g. the browser's autoplay policy blocking a
          // call that isn't tied to a user gesture) leaves nothing actually
          // audible - don't leave the button showing "Stop" for playback that
          // never started. The audio is still cached (hasAudio/audioUrlsRef),
          // so the next real click will play it as a genuine gesture instead.
          setIsPlaying(false);
        });
      };

      audio.src = url;

      if (offsetSeconds > 0) {
        // Seeking into the middle of a chunk: currentTime can only be set
        // once the chunk's metadata is loaded, so defer the seek + play
        // until then (guarded so a rapid re-seek that swapped src first
        // doesn't get hijacked by a stale metadata event).
        const onMeta = () => {
          audio.removeEventListener("loadedmetadata", onMeta);
          if (audio.src !== url) return;
          try {
            audio.currentTime = offsetSeconds;
          } catch {
            // Ignore - fall back to playing from the chunk start.
          }
          startPlayback();
        };
        audio.addEventListener("loadedmetadata", onMeta);
        audio.load();
      } else {
        startPlayback();
      }
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

  // Commit a scrub to an absolute position on the continuous timeline: find
  // which buffered chunk that time falls in, then play it from the matching
  // in-chunk offset. Clamped to what's actually buffered so far, so dragging
  // past the streamed-in portion just lands at the latest available point.
  const seekToGlobalTime = useCallback(
    (targetSeconds: number) => {
      const buffered = audioUrlsRef.current.length;
      if (buffered === 0) return;

      const durations = chunkDurationsRef.current;
      const target = Math.max(0, targetSeconds);
      let acc = 0;
      let targetIndex = buffered - 1;
      let offset = 0;

      for (let i = 0; i < buffered; i++) {
        const d = durations[i] || 0;
        if (target < acc + d || i === buffered - 1) {
          targetIndex = i;
          // Keep a hair away from the very end of the chunk so playback
          // doesn't instantly fire `ended` and skip the chunk.
          offset = d > 0 ? Math.max(0, Math.min(target - acc, d - 0.05)) : 0;
          break;
        }
        acc += d;
      }

      waitingForNextRef.current = false;
      finishedRef.current = false;
      playbackMutedRef.current = false;
      setIsMuted(false);
      setCurrentChunkIndex(targetIndex);
      setGlobalTime(cumulativeBefore(targetIndex) + offset);
      setIsPlaying(true);
      playChunkAt(targetIndex, offset);
    },
    [playChunkAt, setCurrentChunkIndex, cumulativeBefore],
  );

  // Translate a pointer x-position over the seek bar into a timeline second.
  const timeFromPointer = useCallback(
    (clientX: number): number => {
      const el = seekBarRef.current;
      if (!el || totalDuration <= 0) return 0;
      const rect = el.getBoundingClientRect();
      const frac = (clientX - rect.left) / rect.width;
      return Math.max(0, Math.min(1, frac)) * totalDuration;
    },
    [totalDuration],
  );

  // Pointer-driven scrubbing: while dragging we only move the visual thumb
  // (dragTime) so we're not thrashing the <audio> src on every pixel; the
  // actual seek is committed once on release. Pointer capture keeps the drag
  // tracking even when the pointer leaves the (thin) bar.
  const handleSeekPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (totalDuration <= 0) return;
      e.preventDefault();
      const el = seekBarRef.current;
      el?.setPointerCapture?.(e.pointerId);
      setIsDragging(true);
      setDragTime(timeFromPointer(e.clientX));
    },
    [totalDuration, timeFromPointer],
  );

  const handleSeekPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!isDragging) return;
      setDragTime(timeFromPointer(e.clientX));
    },
    [isDragging, timeFromPointer],
  );

  const handleSeekPointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!isDragging) return;
      const el = seekBarRef.current;
      el?.releasePointerCapture?.(e.pointerId);
      const target = timeFromPointer(e.clientX);
      setIsDragging(false);
      seekToGlobalTime(target);
    },
    [isDragging, timeFromPointer, seekToGlobalTime],
  );

  // Keyboard scrubbing (bar is focusable and exposed as a slider): arrows
  // nudge by 5s, Home/End jump to the ends.
  const handleSeekKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (totalDuration <= 0) return;
      const current = cumulativeBefore(currentChunkIndexRef.current) +
        (audioRef.current?.currentTime || 0);
      let next: number | null = null;
      if (e.key === "ArrowRight" || e.key === "ArrowUp") next = current + 5;
      else if (e.key === "ArrowLeft" || e.key === "ArrowDown") next = current - 5;
      else if (e.key === "Home") next = 0;
      else if (e.key === "End") next = totalDuration;
      if (next === null) return;
      e.preventDefault();
      seekToGlobalTime(Math.max(0, Math.min(next, totalDuration)));
    },
    [totalDuration, cumulativeBefore, seekToGlobalTime],
  );

  // Smoothly track the playhead across the timeline while playing. Reading
  // the live element position each animation frame (rather than relying on
  // the sparse `timeupdate` event) keeps the thumb gliding. We only push a
  // new value into state when it moved enough to matter (~30ms) so we're not
  // forcing a re-render on every single frame. Paused/dragging states
  // intentionally freeze the displayed position.
  useEffect(() => {
    if (!isPlaying || isDragging) return;
    let raf = 0;
    let lastEmitted = -1;
    const tick = () => {
      const audio = audioRef.current;
      if (audio) {
        const t = cumulativeBefore(currentChunkIndexRef.current) + audio.currentTime;
        if (Math.abs(t - lastEmitted) >= 0.03) {
          lastEmitted = t;
          setGlobalTime(t);
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [isPlaying, isDragging, cumulativeBefore]);

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
      probeChunkDuration(idx, url);

      // Host relay: forward this freshly-generated chunk to guests. Skipped in
      // relayMode (a guest never re-relays), and only when a host callback is
      // wired up.
      if (onAudioChunk && !relayMode) {
        blob.arrayBuffer().then((buf) => {
          relayEmittedRef.current = true;
          onAudioChunk(
            relaySessionIdRef.current,
            idx,
            bytesToBase64(new Uint8Array(buf)),
          );
        });
      }

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
    [playChunkAt, probeChunkDuration, onAudioChunk, relayMode],
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
          // Host relay: the live narration queue has fully drained - no more
          // chunks are coming for this session.
          emitAudioEnd();
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
    chunkDurationsRef.current = [];
    setCurrentChunkIndex(0);
    setChunkCountState(0);
    setTotalDuration(0);
    setGlobalTime(0);
    setDragTime(0);
    setIsDragging(false);
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
        // Pause in place (don't rewind the chunk) so resume can pick up
        // exactly where it left off - important now that the seek bar shows a
        // continuous playhead the user expects Play to continue from.
        audioRef.current.pause();
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
      const audio = audioRef.current;
      const currentUrl = audioUrlsRef.current[currentChunkIndexRef.current];
      if (!finishedRef.current && audio && audio.src === currentUrl) {
        // Paused mid-sentence: continue from the exact same spot rather than
        // reloading the chunk and restarting the sentence.
        waitingForNextRef.current = false;
        setIsPlaying(true);
        audio.play().catch(() => setIsPlaying(false));
        return;
      }
      // Finished naturally -> Play restarts from the top, like a podcast
      // player; otherwise resume at the start of the current sentence.
      const resumeIndex = finishedRef.current ? 0 : currentChunkIndexRef.current;
      setCurrentChunkIndex(resumeIndex);
      waitingForNextRef.current = false;
      setIsPlaying(true);
      playChunkAt(resumeIndex);
      return;
    }

    // Guest relay: never generate locally - the button only ever plays the
    // host's pushed audio, handled by the cached-audio branches above.
    if (relayMode) return;

    // Fresh activation: turn on auto-narrate so future streamed turns start
    // reading themselves too, in addition to reading the current text now.
    if (typeof window !== "undefined") {
      localStorage.setItem("ttsAutoGenerate", "true");
    }
    // Fresh relay session for the host (manual read-aloud).
    relaySessionIdRef.current = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    relayEmittedRef.current = false;

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
      chunkDurationsRef.current = [];
      setChunkCountState(0);
      setCurrentChunkIndex(0);
      setTotalDuration(0);
      setGlobalTime(0);
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

      // Host relay: whole-text generation done - tell guests no more chunks
      // are coming for this session.
      emitAudioEnd();

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
    relayMode,
    emitAudioEnd,
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
    // Guest relay: this component's `text` prop is the streamed narration, but
    // playback is driven entirely by the host's pushed audio chunks (see the
    // imperative handle) - never by this device's own generation. Ignore all
    // text-driven pipelines so a text change from story_stream doesn't reset
    // the relayed audio.
    if (relayMode) return;

    const textChanged = text !== lastTextRef.current;
    lastTextRef.current = text;

    const isStreaming = !storyTextReady;
    const wasStreaming = liveWasStreamingRef.current;
    liveWasStreamingRef.current = isStreaming;

    if (isStreaming && !wasStreaming) {
      stopAndResetPlayback();
      liveSentCharsRef.current = 0;
      // Fresh relay session for the host - a new narration is starting.
      relaySessionIdRef.current = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      relayEmittedRef.current = false;
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
  }, [text, storyTextReady, ttsEnabled, relayMode, stopAndResetPlayback, feedLiveText]);

  // Guest relay: expose an imperative handle so the page can feed the host's
  // relayed audio chunks straight into this player's playback queue. A new
  // turnId resets playback (a fresh narration); end() lets it finish.
  useImperativeHandle(
    relayHandleRef,
    () => ({
      push: (turnId: string, index: number, base64: string) => {
        if (!base64) return;
        if (turnId !== relayCurrentTurnRef.current) {
          relayCurrentTurnRef.current = turnId;
          stopAndResetPlayback();
          isStreamingRef.current = true;
        }
        try {
          const bytes = base64ToBytes(base64);
          onChunkArrived(
            new Blob([bytes.buffer as ArrayBuffer], { type: "audio/mpeg" }),
          );
        } catch (err) {
          console.error("Failed to decode relayed TTS chunk", err);
        }
      },
      end: (turnId: string) => {
        if (turnId !== relayCurrentTurnRef.current) return;
        isStreamingRef.current = false;
        if (waitingForNextRef.current) {
          waitingForNextRef.current = false;
          setIsPlaying(false);
          finishedRef.current = true;
        }
      },
    }),
    [stopAndResetPlayback, onChunkArrived],
  );

  // Trigger auto-generate (non-live case: text arrived already-finished,
  // e.g. navigation/undo/edit) when not disabled and pending
  useEffect(() => {
    if (
      !disabled &&
      !relayMode &&
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
  }, [disabled, text, ttsEnabled, relayMode, handleToggle]);

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
  // Scrub bar geometry: while dragging, follow the pointer (dragTime) so the
  // thumb stays glued to the finger even though the seek only commits on
  // release; otherwise follow the live playhead (globalTime).
  const displayTime = isDragging ? dragTime : globalTime;
  const seekPct =
    totalDuration > 0
      ? Math.max(0, Math.min(100, (displayTime / totalDuration) * 100))
      : 0;
  const seekable = totalDuration > 0;

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
    <div className="flex items-center gap-1.5 bg-white/5 border border-white/10 rounded-full pl-1 pr-3 py-1 flex-1 min-w-0 max-w-[20rem] ml-2">
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

      {/* Scrubbable timeline across the whole narration (all per-sentence
          chunks stitched into one continuous track). Drag or click anywhere
          to jump; the thumb only appears once there's a known duration. */}
      <div
        ref={seekBarRef}
        onPointerDown={handleSeekPointerDown}
        onPointerMove={handleSeekPointerMove}
        onPointerUp={handleSeekPointerUp}
        onPointerCancel={handleSeekPointerUp}
        onKeyDown={handleSeekKeyDown}
        role="slider"
        aria-label="Seek narration"
        aria-valuemin={0}
        aria-valuemax={Math.round(totalDuration)}
        aria-valuenow={Math.round(displayTime)}
        aria-valuetext={`${formatTime(displayTime)} of ${formatTime(totalDuration)}`}
        tabIndex={seekable ? 0 : -1}
        className={`group relative flex-1 min-w-[3rem] h-6 flex items-center touch-none select-none focus:outline-none ${
          seekable ? "cursor-pointer" : "cursor-default"
        }`}
      >
        <div className="w-full h-1.5 rounded-full bg-white/10 overflow-hidden">
          <div
            className={`h-full bg-purple-400/80 ${isDragging ? "" : "transition-[width] duration-75"}`}
            style={{ width: `${seekPct}%` }}
          />
        </div>
        {seekable && (
          <div
            className={`absolute w-3 h-3 rounded-full bg-white shadow-md shadow-purple-950/40 ring-2 ring-purple-500/70 -translate-x-1/2 transition-transform ${
              isDragging ? "scale-125" : "scale-0 group-hover:scale-100 group-focus:scale-100"
            }`}
            style={{ left: `${seekPct}%` }}
          />
        )}
      </div>

      <span className="shrink-0 text-[10px] leading-none tabular-nums text-blue-100/60 min-w-[4.5rem] text-right">
        {formatTime(displayTime)} / {formatTime(totalDuration)}
      </span>
    </div>
  );
}
