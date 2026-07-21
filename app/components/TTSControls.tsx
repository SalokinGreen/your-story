"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { useNotification } from "../misc/NotificationContext";
import { useAPIKeys } from "../misc/APIKeysContext";
import { DynamicIcon } from "./DynamicIcon";
import { ttsFetch } from "../misc/ttsFetch";
import { TTSModelKey } from "../misc/ai_prices";

interface TTSControlsProps {
  text: string;
  disabled?: boolean;
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
// runtime doesn't expose a readable stream. Returns the number of chunks.
async function streamChunksToPlayer(
  response: Response,
  onChunk: (blob: Blob) => void,
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
    const { done, value } = await reader.read();
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

export default function TTSControls({
  text,
  disabled = false,
}: TTSControlsProps) {
  const { addNotification } = useNotification();
  const { keys: apiKeys } = useAPIKeys();
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
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
  const lastTextRef = useRef<string>("");
  const isGeneratingRef = useRef<boolean>(false);
  const pendingAutoGenerateRef = useRef<boolean>(false);

  const ttsEnabled = isTTSEnabled();

  // Update volume when it changes in localStorage
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = getVolume();
    }
  }, []);

  // Clean up the persistent audio element and any buffered chunk URLs when
  // this component unmounts.
  useEffect(() => {
    return () => {
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
        setIsPaused(false);
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
      setIsPaused(false);
    } else {
      waitingForNextRef.current = true;
    }
  }, [playChunkAt]);

  useEffect(() => {
    advanceToNextChunkRef.current = advanceToNextChunk;
  }, [advanceToNextChunk]);

  // Called as each chunk finishes streaming in. Starts playback the moment
  // the first chunk lands, and auto-plays any later chunk that arrives
  // while playback is waiting on it.
  const onChunkArrived = useCallback(
    (blob: Blob) => {
      const url = URL.createObjectURL(blob);
      audioUrlsRef.current.push(url);
      const idx = audioUrlsRef.current.length - 1;

      if (idx === 0) {
        setHasAudio(true);
        setIsPlaying(true);
        setIsPaused(false);
        setIsLoading(false);
        playChunkAt(0);
      } else if (waitingForNextRef.current && idx === currentChunkIndexRef.current) {
        waitingForNextRef.current = false;
        playChunkAt(idx);
      }
    },
    [playChunkAt],
  );

  const handlePlay = useCallback(async () => {
    if (disabled || !text.trim() || isGeneratingRef.current) return;

    const selectedVoice = getSelectedVoice();
    const selectedModel = getSelectedModel();
    const volume = getVolume();

    if (audioRef.current && isPaused) {
      await audioRef.current.play();
      setIsPlaying(true);
      setIsPaused(false);
      return;
    }

    if (hasAudio && audioUrlsRef.current.length > 0) {
      currentChunkIndexRef.current = 0;
      waitingForNextRef.current = false;
      setIsPlaying(true);
      setIsPaused(false);
      playChunkAt(0);
      return;
    }

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

    try {
      isGeneratingRef.current = true;
      setIsLoading(true);

      const providerKey = getProviderKeyForModel(selectedModel);
      const apiKey = apiKeys[providerKey];
      if (!apiKey) {
        throw new Error(
          `${PROVIDER_LABELS[selectedModel]} API key is required. Please add your own key in Settings.`
        );
      }

      const response = await ttsFetch({
        text,
        voiceId: selectedVoice,
        model: selectedModel,
        deepinfraKey: providerKey === "deepinfraKey" ? apiKey : undefined,
        cartesiaKey: providerKey === "cartesiaKey" ? apiKey : undefined,
        elevenlabsKey: providerKey === "elevenlabsKey" ? apiKey : undefined,
      });

      if (!response.ok) {
        const error = await response.json();
        if (response.status === 402) {
          throw new Error(
            error.error || "Insufficient tokens for TTS generation"
          );
        }
        throw new Error(error.error || "Failed to generate speech");
      }

      // Reset chunk state and start consuming the framed stream - playback
      // begins as soon as onChunkArrived sees the first chunk, without
      // waiting for the rest of the text to finish generating.
      audioUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      audioUrlsRef.current = [];
      currentChunkIndexRef.current = 0;
      waitingForNextRef.current = false;
      isStreamingRef.current = true;

      const chunkCount = await streamChunksToPlayer(response, onChunkArrived);
      isStreamingRef.current = false;

      if (chunkCount === 0) {
        throw new Error("No audio generated");
      }

      // If playback already caught up to the end while the last chunk was
      // still in flight, finish here rather than leaving isPlaying stuck on
      // an onended that has nothing left to advance to.
      if (waitingForNextRef.current) {
        waitingForNextRef.current = false;
        setIsPlaying(false);
        setIsPaused(false);
      }
    } catch (error: unknown) {
      console.error("TTS error:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Failed to generate speech";
      addNotification(errorMessage, "failure");
      setIsPlaying(false);
      setIsPaused(false);
    } finally {
      setIsLoading(false);
      isGeneratingRef.current = false;
    }
  }, [
    disabled,
    text,
    isPaused,
    hasAudio,
    onChunkArrived,
    playChunkAt,
    addNotification,
    apiKeys.deepinfraKey,
    apiKeys.cartesiaKey,
    apiKeys.elevenlabsKey,
    getAudioElement,
  ]);

  // Handle text changes - clear audio and mark pending auto-generate
  useEffect(() => {
    if (text !== lastTextRef.current) {
      lastTextRef.current = text;

      // Stop and reset the existing (persistent) audio element. We
      // intentionally keep the same <audio> element around instead of
      // discarding it, since a previously "unlocked" element (one that has
      // already played as a direct result of a user gesture) can keep
      // playing new sources later without needing another gesture.
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.removeAttribute("src");
      }
      audioUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      audioUrlsRef.current = [];
      currentChunkIndexRef.current = 0;
      isStreamingRef.current = false;
      waitingForNextRef.current = false;
      setHasAudio(false);
      setIsPlaying(false);
      setIsPaused(false);

      // Mark that we should auto-generate when conditions are met
      const autoGenerate = localStorage.getItem("ttsAutoGenerate") === "true";
      if (autoGenerate && text.trim() && ttsEnabled) {
        pendingAutoGenerateRef.current = true;
      }
    }
  }, [text, ttsEnabled]);

  // Trigger auto-generate when not disabled and pending
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
        handlePlay();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [disabled, text, ttsEnabled, handlePlay]);

  const handlePause = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      setIsPlaying(false);
      setIsPaused(true);
    }
  };

  const handleStop = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      setIsPlaying(false);
      setIsPaused(false);
    }
  };

  if (!ttsEnabled) {
    return null;
  }

  const canReplay = !isPlaying && hasAudio;

  return (
    <div className="flex items-center gap-2">
      {!isPlaying ? (
        <button
          onClick={handlePlay}
          disabled={disabled || isLoading || !text.trim()}
          className={`flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
            disabled || isLoading || !text.trim()
              ? "bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed"
              : "bg-purple-600 hover:bg-purple-700 text-white"
          }`}
          title={isPaused ? "Resume" : canReplay ? "Replay" : "Read aloud"}
        >
          {isLoading ? (
            <>
              <DynamicIcon name="Loader2" className="animate-spin h-4 w-4" />
              <span className="hidden sm:inline">Generating...</span>
            </>
          ) : canReplay ? (
            <>
              <DynamicIcon name="RotateCcw" className="w-4 h-4" />
              <span className="hidden sm:inline">Replay</span>
            </>
          ) : (
            <>
              <DynamicIcon name="Play" className="w-4 h-4" />
              <span className="hidden sm:inline">
                {isPaused ? "Resume" : "TTS"}
              </span>
            </>
          )}
        </button>
      ) : (
        <>
          <button
            onClick={handlePause}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-amber-500 hover:bg-amber-600 text-white rounded-lg transition-colors"
            title="Pause"
          >
            <DynamicIcon name="Pause" className="w-4 h-4" />
          </button>
          <button
            onClick={handleStop}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors"
            title="Stop"
          >
            <DynamicIcon name="Square" className="w-4 h-4" />
          </button>
        </>
      )}
    </div>
  );
}
