"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { useNotification } from "../misc/NotificationContext";
import { getAuthToken } from "../misc/getAuthToken";
import { DynamicIcon } from "./DynamicIcon";

interface TTSControlsProps {
  text: string;
  disabled?: boolean;
}

const getSelectedVoice = (): string => {
  if (typeof window === "undefined") return "henry";
  return localStorage.getItem("ttsLastVoice") || "henry";
};

const getVolume = (): number => {
  if (typeof window === "undefined") return 1.0;
  return parseFloat(localStorage.getItem("ttsVolume") || "1.0");
};

const isTTSEnabled = (): boolean => {
  if (typeof window === "undefined") return true;
  return localStorage.getItem("ttsEnabled") !== "false";
};

export default function TTSControls({
  text,
  disabled = false,
}: TTSControlsProps) {
  const { addNotification } = useNotification();
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const savedAudioBlobRef = useRef<Blob | null>(null);
  const lastTextRef = useRef<string>("");
  const autoGenerateTriggeredRef = useRef<boolean>(false);

  const ttsEnabled = isTTSEnabled();

  // Update volume when it changes in localStorage
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = getVolume();
    }
  }, []);

  const handlePlay = useCallback(async () => {
    if (disabled || !text.trim()) return;

    const selectedVoice = getSelectedVoice();
    const volume = getVolume();

    if (audioRef.current && isPaused) {
      await audioRef.current.play();
      setIsPlaying(true);
      setIsPaused(false);
      return;
    }

    if (savedAudioBlobRef.current && audioUrl) {
      const audio = new Audio(audioUrl);
      audioRef.current = audio;
      audio.volume = volume;

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

    try {
      setIsLoading(true);

      const token = await getAuthToken();
      if (!token) {
        throw new Error("Authentication required. Please sign in to use TTS.");
      }

      const speechifyKey =
        typeof window !== "undefined"
          ? localStorage.getItem("speechifyKey")
          : undefined;

      const response = await fetch("/api/tts/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ text, voiceId: selectedVoice, speechifyKey }),
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

      const audioBlob = await response.blob();
      savedAudioBlobRef.current = audioBlob;

      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }

      const url = URL.createObjectURL(audioBlob);
      setAudioUrl(url);

      const audio = new Audio(url);
      audioRef.current = audio;
      audio.volume = volume;

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
    } catch (error: any) {
      console.error("TTS error:", error);
      addNotification(error.message || "Failed to generate speech", "failure");
    } finally {
      setIsLoading(false);
    }
  }, [disabled, text, isPaused, audioUrl, addNotification]);

  // Handle text changes - clear audio and trigger auto-generate
  useEffect(() => {
    if (text !== lastTextRef.current) {
      lastTextRef.current = text;

      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
        setAudioUrl(null);
      }
      savedAudioBlobRef.current = null;
      setIsPlaying(false);
      setIsPaused(false);
      autoGenerateTriggeredRef.current = false;

      const autoGenerate = localStorage.getItem("ttsAutoGenerate") === "true";
      if (
        autoGenerate &&
        text.trim() &&
        ttsEnabled &&
        !autoGenerateTriggeredRef.current
      ) {
        autoGenerateTriggeredRef.current = true;
        const timer = setTimeout(() => {
          handlePlay();
        }, 500);
        return () => clearTimeout(timer);
      }
    }
  }, [text, disabled, ttsEnabled, handlePlay, audioUrl]);

  // Fallback auto-generate when loading finishes
  useEffect(() => {
    if (
      !disabled &&
      text.trim() &&
      ttsEnabled &&
      localStorage.getItem("ttsAutoGenerate") === "true" &&
      !autoGenerateTriggeredRef.current
    ) {
      autoGenerateTriggeredRef.current = true;
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
