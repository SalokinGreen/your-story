"use client";

import { useState, useEffect } from "react";
import { DynamicIcon } from "./DynamicIcon";

interface CustomVoiceManagerProps {
  onVoicesChange?: (voices: string[]) => void;
  addNotification: (
    message: string,
    type: "success" | "failure" | "warning"
  ) => void;
  ttsModel?: string;
}

const VOICE_ID_HINTS: Record<string, string> = {
  kokoro: "Kokoro voices follow pattern: af_name, am_name, bf_name, bm_name",
  orpheus: "Orpheus voice IDs are short first names, e.g. tara, leo",
  cartesia: "Cartesia voice IDs are UUIDs, copy one from play.cartesia.ai",
  elevenlabs:
    "ElevenLabs voice IDs are ~20-character IDs from your voice library",
};

export default function CustomVoiceManager({
  onVoicesChange,
  addNotification,
  ttsModel = "kokoro",
}: CustomVoiceManagerProps) {
  const [customVoices, setCustomVoices] = useState<string[]>([]);
  const [newVoiceInput, setNewVoiceInput] = useState("");

  useEffect(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("ttsCustomVoices");
      if (saved) {
        try {
          setCustomVoices(JSON.parse(saved));
        } catch {
          setCustomVoices([]);
        }
      }
    }
  }, []);

  const saveCustomVoices = (voices: string[]) => {
    if (typeof window !== "undefined") {
      localStorage.setItem("ttsCustomVoices", JSON.stringify(voices));
      setCustomVoices(voices);
      onVoicesChange?.(voices);
    }
  };

  const addCustomVoice = () => {
    const voiceId = newVoiceInput.trim();
    if (voiceId && !customVoices.includes(voiceId)) {
      const updated = [...customVoices, voiceId];
      saveCustomVoices(updated);
      setNewVoiceInput("");
      addNotification(`Added voice: ${voiceId}`, "success");
    } else if (customVoices.includes(voiceId)) {
      addNotification("Voice already exists", "warning");
    }
  };

  const removeCustomVoice = (voiceId: string) => {
    const updated = customVoices.filter((v) => v !== voiceId);
    saveCustomVoices(updated);
    addNotification(`Removed voice: ${voiceId}`, "success");
  };

  return (
    <div>
      <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
        Custom Voices
      </label>
      <div className="space-y-2">
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Enter voice ID (e.g. af_nova)"
            value={newVoiceInput}
            onChange={(e) => setNewVoiceInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addCustomVoice()}
            className="flex-1 px-4 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
          <button
            onClick={addCustomVoice}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
          >
            Add
          </button>
        </div>
        {customVoices.length > 0 && (
          <div className="space-y-2 mt-3">
            {customVoices.map((voiceId) => (
              <div
                key={voiceId}
                className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900 rounded-lg"
              >
                <span className="font-mono text-sm text-gray-900 dark:text-white">
                  {voiceId}
                </span>
                <button
                  onClick={() => removeCustomVoice(voiceId)}
                  className="text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 font-medium text-sm"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
        <p className="text-xs text-gray-600 dark:text-gray-400 mt-2 flex items-center gap-1">
          <DynamicIcon name="Lightbulb" className="w-3 h-3" /> Add custom voice
          IDs. {VOICE_ID_HINTS[ttsModel] ?? VOICE_ID_HINTS.kokoro}
        </p>
      </div>
    </div>
  );
}
