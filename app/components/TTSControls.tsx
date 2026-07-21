"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { useNotification } from "../misc/NotificationContext";
import { useAPIKeys } from "../misc/APIKeysContext";
import { DynamicIcon } from "./DynamicIcon";

interface TTSControlsProps {
  text: string;
  disabled?: boolean;
}

const getSelectedVoice = (): string => {
  if (typeof window === "undefined") return "af_heart";
  return localStorage.getItem("ttsLastVoice") || "af_heart";
};

const getSelectedModel = (): "kokoro" | "orpheus" => {
  if (typeof window === "undefined") return "kokoro";
  const model = localStorage.getItem("ttsModel");
  return model === "orpheus" ? "orpheus" : "kokoro";
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

export default function TTSControls({
  text,
  disabled = false,
}: TTSControlsProps) {
  const { addNotification } = useNotification();
  const { keys: apiKeys } = useAPIKeys();
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const savedAudioBlobRef = useRef<Blob | null>(null);
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

  // Clean up the persistent audio element when this component unmounts.
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.removeAttribute("src");
        audioRef.current = null;
      }
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

    if (savedAudioBlobRef.current && audioUrl) {
      const audio = getAudioElement();
      audio.volume = volume;
      audio.src = audioUrl;

      audio.onended = () => {
        setIsPlaying(false);
        setIsPaused(false);
      };

      audio.onerror = () => {
        addNotification("Failed to play audio", "failure");
        setIsPlaying(false);
        setIsPaused(false);
      };

      await audio.play();
      setIsPlaying(true);
      setIsPaused(false);
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

      if (!apiKeys.deepinfraKey) {
        throw new Error(
          "DeepInfra API key is required. Please add your own key in Settings."
        );
      }

      const response = await fetch("/api/tts/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text,
          voiceId: selectedVoice,
          model: selectedModel,
          deepinfraKey: apiKeys.deepinfraKey,
        }),
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

      const tokenCost = response.headers.get("X-Token-Cost");
      const tokenBalance = response.headers.get("X-Token-Balance");
      const contentType = response.headers.get("Content-Type");
      const ttsModel = response.headers.get("X-TTS-Model");

      console.log("TTS Response headers:", {
        contentType,
        ttsModel,
        tokenCost,
      });

      // Get the raw array buffer and create blob with correct MIME type
      const arrayBuffer = await response.arrayBuffer();
      console.log("TTS Audio buffer size:", arrayBuffer.byteLength);

      // Check first few bytes to identify format
      const header = new Uint8Array(arrayBuffer.slice(0, 4));
      console.log(
        "TTS Audio header bytes:",
        Array.from(header)
          .map((b) => b.toString(16).padStart(2, "0"))
          .join(" ")
      );

      const audioBlob = new Blob([arrayBuffer], {
        type: contentType || "audio/mpeg",
      });
      savedAudioBlobRef.current = audioBlob;

      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }

      const url = URL.createObjectURL(audioBlob);
      setAudioUrl(url);

      // Reuse the same (already-primed) <audio> element rather than
      // constructing a new one, so the earlier gesture-tied play() call
      // keeps this playback allowed even though we're now past the network
      // request.
      const audio = getAudioElement();
      audio.volume = volume;
      audio.src = url;

      audio.onended = () => {
        setIsPlaying(false);
        setIsPaused(false);
      };

      audio.onerror = () => {
        addNotification("Failed to play audio", "failure");
        setIsPlaying(false);
        setIsPaused(false);
      };

      await audio.play();
      setIsPlaying(true);
      setIsPaused(false);

      // Log TTS cost for debugging, no notification needed - audio feedback is sufficient
      if (tokenCost && tokenBalance) {
        console.log(`TTS: -${tokenCost} tokens, ${tokenBalance} remaining`);
      }
    } catch (error: unknown) {
      console.error("TTS error:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Failed to generate speech";
      addNotification(errorMessage, "failure");
    } finally {
      setIsLoading(false);
      isGeneratingRef.current = false;
    }
  }, [
    disabled,
    text,
    isPaused,
    audioUrl,
    addNotification,
    apiKeys.deepinfraKey,
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
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
        setAudioUrl(null);
      }
      savedAudioBlobRef.current = null;
      setIsPlaying(false);
      setIsPaused(false);

      // Mark that we should auto-generate when conditions are met
      const autoGenerate = localStorage.getItem("ttsAutoGenerate") === "true";
      if (autoGenerate && text.trim() && ttsEnabled) {
        pendingAutoGenerateRef.current = true;
      }
    }
  }, [text, ttsEnabled, audioUrl]);

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

  const hasAudio = savedAudioBlobRef.current !== null;
  const canReplay = !isPlaying && hasAudio;

  return (
    <div className="flex items-center gap-2">
      {!isPlaying ? (
        <button
          onClick={handlePlay}
          disabled={disabled || isLoading || !text.trim()}
          className={`flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg transition-all ${
            disabled || isLoading || !text.trim()
              ? "bg-white/5 text-blue-300/40 cursor-not-allowed"
              : "bg-linear-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white shadow-md shadow-purple-950/40"
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
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-linear-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white rounded-lg shadow-md shadow-amber-950/40 transition-all"
            title="Pause"
          >
            <DynamicIcon name="Pause" className="w-4 h-4" />
          </button>
          <button
            onClick={handleStop}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-red-500/10 hover:bg-red-500/20 border border-red-400/20 text-red-300 rounded-lg transition-colors"
            title="Stop"
          >
            <DynamicIcon name="Square" className="w-4 h-4" />
          </button>
        </>
      )}
    </div>
  );
}
