"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { useNotification } from "../misc/NotificationContext";
import { getAuthToken } from "../misc/getAuthToken";
import { DynamicIcon } from "./DynamicIcon";

interface TTSControlsProps {
  text: string;
  disabled?: boolean;
}

const VOICES = [
  { id: "henry", name: "Henry (British)", icon: "Mic" },
  { id: "snoop", name: "Snoop", icon: "Mic2" },
  { id: "gwyneth", name: "Gwyneth", icon: "Mic" },
  { id: "cliff", name: "Cliff (Deep)", icon: "Mic2" },
  { id: "george", name: "George (US)", icon: "Mic" },
];

const getCustomVoices = (): Array<{
  id: string;
  name: string;
  icon: string;
}> => {
  if (typeof window === "undefined") return [];
  const saved = localStorage.getItem("ttsCustomVoices");
  if (!saved) return [];
  try {
    const voiceIds = JSON.parse(saved) as string[];
    return voiceIds.map((id) => ({ id, name: id, icon: "Mic" }));
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
              <DynamicIcon
                name={currentVoice.icon as any}
                className="w-4 h-4"
              />
              <span className="hidden sm:inline">{currentVoice.name}</span>
              <DynamicIcon name="ChevronDown" className="w-4 h-4" />
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
                    <DynamicIcon name={voice.icon as any} className="w-4 h-4" />
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
              <DynamicIcon
                name={
                  volume === 0
                    ? "VolumeX"
                    : volume < 0.5
                    ? "Volume1"
                    : "Volume2"
                }
                className="w-4 h-4"
              />
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
                    className="hover:text-blue-500 flex items-center gap-1"
                  >
                    <DynamicIcon name="VolumeX" className="w-3 h-3" /> Mute
                  </button>
                  <button
                    onClick={() => setVolume(1)}
                    className="hover:text-blue-500 flex items-center gap-1"
                  >
                    <DynamicIcon name="Volume2" className="w-3 h-3" /> Max
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
              <DynamicIcon
                name={isPaused ? "Play" : "Play"}
                className="w-4 h-4"
              />
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
            <DynamicIcon name="Pause" className="w-4 h-4" />
            <span className="hidden sm:inline">Pause</span>
          </button>
          <button
            onClick={handleStop}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-red-500 hover:bg-red-600 text-white rounded-lg transition-all shadow-md hover:shadow-lg"
            title="Stop"
          >
            <DynamicIcon name="Square" className="w-4 h-4" />
            <span className="hidden sm:inline">Stop</span>
          </button>
        </>
      )}
    </div>
  );
}
