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
  cartesia: "Cartesia voice IDs are UUIDs, copy one from play.cartesia.ai",
  elevenlabs:
    "ElevenLabs voice IDs are ~20-character IDs from your voice library",
};

export default function CustomVoiceManager({
  onVoicesChange,
  addNotification,
  ttsModel = "elevenlabs",
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
      <label className="block text-sm font-semibold text-ys-muted mb-2">
        Custom Voices
      </label>
      <div className="space-y-2">
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Enter voice ID (e.g. 21m00Tcm4TlvDq8ikWAM)"
            value={newVoiceInput}
            onChange={(e) => setNewVoiceInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addCustomVoice()}
            className="flex-1 px-4 py-2 ys-input"
          />
          <button
            onClick={addCustomVoice}
            className="ys-button ys-button--primary px-4 py-2 rounded-lg font-medium"
          >
            Add
          </button>
        </div>
        {customVoices.length > 0 && (
          <div className="space-y-2 mt-3">
            {customVoices.map((voiceId) => (
              <div
                key={voiceId}
                className="flex items-center justify-between p-3 bg-ys-surface rounded-lg"
              >
                <span className="font-mono text-sm text-ys-text">
                  {voiceId}
                </span>
                <button
                  onClick={() => removeCustomVoice(voiceId)}
                  className="text-ys-danger hover:text-ys-danger font-medium text-sm"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
        <p className="text-xs text-ys-muted mt-2 flex items-center gap-1">
          <DynamicIcon name="Lightbulb" className="w-3 h-3" /> Add custom voice
          IDs. {VOICE_ID_HINTS[ttsModel] ?? VOICE_ID_HINTS.elevenlabs}
        </p>
      </div>
    </div>
  );
}
