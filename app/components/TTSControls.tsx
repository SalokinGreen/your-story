"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { useNotification } from "../misc/NotificationContext";
import { getAuthToken } from "../misc/getAuthToken";

interface TTSControlsProps {
  text: string;
  disabled?: boolean;
}

const VOICES = [
  { id: "henry", name: "Henry (British)", emoji: "🇬🇧" },
  { id: "snoop", name: "Snoop", emoji: "🎤" },
  { id: "gwyneth", name: "Gwyneth", emoji: "🎭" },
  { id: "cliff", name: "Cliff (Deep)", emoji: "🎙️" },
  { id: "george", name: "George (US)", emoji: "🇺🇸" },
];

const getCustomVoices = (): Array<{
  id: string;
  name: string;
  emoji: string;
}> => {
  if (typeof window === "undefined") return [];
  const saved = localStorage.getItem("ttsCustomVoices");
  if (!saved) return [];
  try {
    const voiceIds = JSON.parse(saved) as string[];
    return voiceIds.map((id) => ({ id, name: id, emoji: "🎤" }));
  } catch {
    return [];
  }
};

const getAllVoices = () => {
  return [...VOICES, ...getCustomVoices()];
};

const getTTSSettings = () => {
  if (typeof window === "undefined")
    return { enabled: true, customVoice: "", volume: 1.0 };
  const enabled = localStorage.getItem("ttsEnabled") !== "false";
  const customVoice = localStorage.getItem("ttsCustomVoice") || "";
  const volume = parseFloat(localStorage.getItem("ttsVolume") || "1.0");
  return { enabled, customVoice, volume };
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
  const [selectedVoice, setSelectedVoice] = useState(() => {
    if (typeof window !== "undefined") {
      const lastVoice = localStorage.getItem("ttsLastVoice");
      if (lastVoice) return lastVoice;
    }
    const allVoices = getAllVoices();
    const settings = getTTSSettings();
    return settings.customVoice || allVoices[0]?.id || VOICES[0].id;
  });
  const [volume, setVolume] = useState(() => getTTSSettings().volume);
  const [showVoiceMenu, setShowVoiceMenu] = useState(false);
  const [showVolumeSlider, setShowVolumeSlider] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const savedAudioBlobRef = useRef<Blob | null>(null);
  const lastTextRef = useRef<string>("");
  const autoGenerateTriggeredRef = useRef<boolean>(false);

  const ttsEnabled = getTTSSettings().enabled;

  // Clear saved audio when voice changes and save to localStorage
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("ttsLastVoice", selectedVoice);
    }
    savedAudioBlobRef.current = null;
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
      setAudioUrl(null);
    }
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setIsPlaying(false);
    setIsPaused(false);
  }, [selectedVoice]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
    localStorage.setItem("ttsVolume", volume.toString());
  }, [volume]);

  const handlePlay = useCallback(async () => {
    if (disabled || !text.trim()) return;

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
        // Keep audio for replay
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

      // Get auth token
      const token = await getAuthToken();
      if (!token) {
        throw new Error("Authentication required. Please sign in to use TTS.");
      }

      const response = await fetch("/api/tts/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ text, voiceId: selectedVoice }),
      });

      if (!response.ok) {
        const error = await response.json();
        if (response.status === 402) {
          // Payment required - insufficient tokens
          throw new Error(
            error.error || "Insufficient tokens for TTS generation"
          );
        }
        throw new Error(error.error || "Failed to generate speech");
      }

      // Get token info from headers
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
        // Keep audio for replay
      };

      audio.onerror = () => {
        addNotification("Failed to play audio", "failure");
        setIsPlaying(false);
        setIsPaused(false);
      };

      await audio.play();
      setIsPlaying(true);
      setIsPaused(false);

      // Show success notification with token info
      if (tokenCost && tokenBalance) {
        addNotification(
          `🎧 Playing narration (-${tokenCost} tokens, ${tokenBalance} remaining)`,
          "success"
        );
      } else {
        addNotification("🎧 Playing narration", "success");
      }
    } catch (error: any) {
      console.error("TTS error:", error);
      addNotification(error.message || "Failed to generate speech", "failure");
    } finally {
      setIsLoading(false);
    }
  }, [
    disabled,
    text,
    isPaused,
    audioUrl,
    volume,
    selectedVoice,
    addNotification,
  ]);

  // Handle text changes - clear audio and trigger auto-generate
  useEffect(() => {
    // Check if text has changed
    if (text !== lastTextRef.current) {
      lastTextRef.current = text;

      // Clear everything when text changes
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

      // Auto-generate TTS if enabled
      const autoGenerate = localStorage.getItem("ttsAutoGenerate") === "true";
      if (
        autoGenerate &&
        text.trim() &&
        ttsEnabled &&
        !disabled &&
        !autoGenerateTriggeredRef.current
      ) {
        autoGenerateTriggeredRef.current = true;
        // Small delay to ensure component is ready
        const timer = setTimeout(() => {
          handlePlay();
        }, 500);
        return () => clearTimeout(timer);
      }
    }
  }, [text, disabled, ttsEnabled, handlePlay, audioUrl]);

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

  const allVoices = getAllVoices();
  const currentVoice =
    allVoices.find((v) => v.id === selectedVoice) || allVoices[0] || VOICES[0];

  if (!ttsEnabled) {
    return null;
  }

  const hasAudio = savedAudioBlobRef.current !== null;
  const canReplay = !isPlaying && hasAudio;

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {!isPlaying && (
        <>
          <div className="relative">
            <button
              onClick={() => setShowVoiceMenu(!showVoiceMenu)}
              disabled={disabled}
              className={`flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg border transition-all ${
                disabled
                  ? "bg-gray-100 dark:bg-gray-700 text-gray-400 border-gray-300 dark:border-gray-600 cursor-not-allowed"
                  : "bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:border-blue-400 dark:hover:border-blue-500"
              }`}
              title="Select voice"
            >
              <span>{currentVoice.emoji}</span>
              <span className="hidden sm:inline">{currentVoice.name}</span>
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                  clipRule="evenodd"
                />
              </svg>
            </button>

            {showVoiceMenu && (
              <div className="absolute top-full mt-2 left-0 z-10 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 py-1 min-w-[180px]">
                {allVoices.map((voice) => (
                  <button
                    key={voice.id}
                    onClick={() => {
                      setSelectedVoice(voice.id);
                      setShowVoiceMenu(false);
                    }}
                    className={`w-full text-left px-4 py-2 text-sm flex items-center gap-2 transition-colors ${
                      voice.id === selectedVoice
                        ? "bg-blue-100 dark:bg-blue-900/50 text-blue-900 dark:text-blue-200"
                        : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                    }`}
                  >
                    <span>{voice.emoji}</span>
                    <span>{voice.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="relative">
            <button
              onClick={() => setShowVolumeSlider(!showVolumeSlider)}
              disabled={disabled}
              className={`flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg border transition-all ${
                disabled
                  ? "bg-gray-100 dark:bg-gray-700 text-gray-400 border-gray-300 dark:border-gray-600 cursor-not-allowed"
                  : "bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:border-blue-400 dark:hover:border-blue-500"
              }`}
              title="Volume"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM14.657 2.929a1 1 0 011.414 0A9.972 9.972 0 0119 10a9.972 9.972 0 01-2.929 7.071 1 1 0 01-1.414-1.414A7.971 7.971 0 0017 10c0-2.21-.894-4.208-2.343-5.657a1 1 0 010-1.414zm-2.829 2.828a1 1 0 011.415 0A5.983 5.983 0 0115 10a5.984 5.984 0 01-1.757 4.243 1 1 0 01-1.415-1.415A3.984 3.984 0 0013 10a3.983 3.983 0 00-1.172-2.828 1 1 0 010-1.415z"
                  clipRule="evenodd"
                />
              </svg>
              <span className="hidden sm:inline text-xs">
                {Math.round(volume * 100)}%
              </span>
            </button>

            {showVolumeSlider && (
              <div className="absolute top-full mt-2 left-0 z-10 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 p-4 min-w-[200px]">
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">
                  Volume: {Math.round(volume * 100)}%
                </label>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={volume}
                  onChange={(e) => setVolume(parseFloat(e.target.value))}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700"
                />
                <div className="flex justify-between mt-2 text-xs text-gray-500 dark:text-gray-400">
                  <button
                    onClick={() => setVolume(0)}
                    className="hover:text-blue-500"
                  >
                    🔇 Mute
                  </button>
                  <button
                    onClick={() => setVolume(1)}
                    className="hover:text-blue-500"
                  >
                    🔊 Max
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {!isPlaying ? (
        <button
          onClick={handlePlay}
          disabled={disabled || isLoading || !text.trim()}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all ${
            disabled || isLoading || !text.trim()
              ? "bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed"
              : "bg-blue-500 hover:bg-blue-600 text-white shadow-md hover:shadow-lg"
          }`}
          title={
            isPaused ? "Resume" : canReplay ? "Replay" : "Read story aloud"
          }
        >
          {isLoading ? (
            <>
              <svg
                className="animate-spin h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                ></circle>
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                ></path>
              </svg>
              <span className="hidden sm:inline">Generating...</span>
            </>
          ) : canReplay ? (
            <>
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" />
              </svg>
              <span className="hidden sm:inline">Replay</span>
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z"
                  clipRule="evenodd"
                />
              </svg>
              <span className="hidden sm:inline">
                {isPaused ? "Resume" : "Play"}
              </span>
            </>
          )}
        </button>
      ) : (
        <>
          <button
            onClick={handlePause}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-orange-500 hover:bg-orange-600 text-white rounded-lg transition-all shadow-md hover:shadow-lg"
            title="Pause"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z"
                clipRule="evenodd"
              />
            </svg>
            <span className="hidden sm:inline">Pause</span>
          </button>
          <button
            onClick={handleStop}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-red-500 hover:bg-red-600 text-white rounded-lg transition-all shadow-md hover:shadow-lg"
            title="Stop"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zM8 7a1 1 0 00-1 1v4a1 1 0 001 1h4a1 1 0 001-1V8a1 1 0 00-1-1H8z"
                clipRule="evenodd"
              />
            </svg>
            <span className="hidden sm:inline">Stop</span>
          </button>
        </>
      )}
    </div>
  );
}
