"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useAPIKeys } from "@/app/misc/APIKeysContext";
import { useNotification } from "@/app/misc/NotificationContext";
import { DynamicIcon } from "./DynamicIcon";
import AIConfigTab from "./AIConfigTab";
import ArchitectureSettingsTab from "./ArchitectureSettingsTab";
import CustomVoiceManager from "./CustomVoiceManager";
import FontSettingsTab from "./FontSettingsTab";
import { TTSModelKey } from "@/app/misc/ai_prices";

interface APIKeysModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function APIKeysModal({ isOpen, onClose }: APIKeysModalProps) {
  const { addNotification } = useNotification();
  const {
    keys,
    isLoaded,
    setKey,
    hasKey,
    connectOpenRouter,
    disconnectOpenRouter,
    isConnectingOpenRouter,
  } = useAPIKeys();

  const [showKeys, setShowKeys] = useState(false);
  const [activeTab, setActiveTab] = useState<
    "config" | "llm" | "services" | "display" | "game" | "architecture"
  >("config");

  // TTS Settings state (read from localStorage)
  const [ttsEnabled, setTtsEnabled] = useState(true);
  const [ttsAutoGenerate, setTtsAutoGenerate] = useState(false);
  const [ttsVoice, setTtsVoice] = useState("21m00Tcm4TlvDq8ikWAM");
  const [ttsModel, setTtsModel] = useState<TTSModelKey>("elevenlabs");
  const [ttsVolume, setTtsVolume] = useState(1.0);
  const [sttEnabled, setSttEnabled] = useState(true);
  const [showHiddenMessages, setShowHiddenMessages] = useState(false);
  const [customVoices, setCustomVoices] = useState<string[]>([]);
  const [defaultUserNotes, setDefaultUserNotes] = useState("");
  const [webResearchEnabled, setWebResearchEnabled] = useState(false);

  // Load settings from localStorage on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      setTtsEnabled(localStorage.getItem("ttsEnabled") !== "false");
      setTtsAutoGenerate(localStorage.getItem("ttsAutoGenerate") === "true");
      setTtsVoice(localStorage.getItem("ttsLastVoice") || "21m00Tcm4TlvDq8ikWAM");
      {
        const storedModel = localStorage.getItem("ttsModel");
        setTtsModel(storedModel === "cartesia" ? "cartesia" : "elevenlabs");
      }
      setTtsVolume(parseFloat(localStorage.getItem("ttsVolume") || "1.0"));
      setSttEnabled(localStorage.getItem("sttEnabled") !== "false");
      setShowHiddenMessages(
        localStorage.getItem("showHiddenMessages") === "true",
      );
      setDefaultUserNotes(localStorage.getItem("defaultUserNotes") || "");
      setWebResearchEnabled(
        localStorage.getItem("webResearchEnabled") === "true",
      );
      try {
        const voices = localStorage.getItem("ttsCustomVoices");
        if (voices) setCustomVoices(JSON.parse(voices));
      } catch {
        /* ignore */
      }
    }
  }, []);
  const [mounted, setMounted] = useState(false);

  // Ensure we're on the client for portal rendering
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!isOpen || !mounted) return null;

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const modalContent = (
    <div
      className="fixed inset-0 z-100 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={handleBackdropClick}
    >
      <div className="bg-[#0d1829]/95 backdrop-blur-2xl rounded-2xl shadow-2xl shadow-black/50 border border-white/10 w-full max-w-lg mx-4 max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="shrink-0 px-6 py-4 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-500/10 ring-1 ring-purple-400/20 rounded-lg">
              <DynamicIcon
                name="Settings"
                className="w-5 h-5 text-purple-300"
              />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">
                Settings
              </h2>
              <p className="text-xs text-blue-300/60">
                AI models and API keys
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
          >
            <DynamicIcon
              name="X"
              className="w-5 h-5 text-blue-300/60"
            />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex shrink-0 border-b border-white/10 px-6 overflow-x-auto">
          <button
            onClick={() => setActiveTab("config")}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              activeTab === "config"
                ? "border-purple-400 text-purple-300"
                : "border-transparent text-blue-300/50 hover:text-blue-200"
            }`}
          >
            <span className="flex items-center gap-2">
              <DynamicIcon name="Sliders" className="w-4 h-4" />
              AI Config
            </span>
          </button>
          <button
            onClick={() => setActiveTab("display")}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              activeTab === "display"
                ? "border-purple-400 text-purple-300"
                : "border-transparent text-blue-300/50 hover:text-blue-200"
            }`}
          >
            <span className="flex items-center gap-2">
              <DynamicIcon name="Monitor" className="w-4 h-4" />
              Display
            </span>
          </button>
          <button
            onClick={() => setActiveTab("game")}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              activeTab === "game"
                ? "border-purple-400 text-purple-300"
                : "border-transparent text-blue-300/50 hover:text-blue-200"
            }`}
          >
            <span className="flex items-center gap-2">
              <DynamicIcon name="Gamepad2" className="w-4 h-4" />
              Game
            </span>
          </button>
          <button
            onClick={() => setActiveTab("services")}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              activeTab === "services"
                ? "border-purple-400 text-purple-300"
                : "border-transparent text-blue-300/50 hover:text-blue-200"
            }`}
          >
            <span className="flex items-center gap-2">
              <DynamicIcon name="Volume2" className="w-4 h-4" />
              Voice
            </span>
          </button>
          <button
            onClick={() => setActiveTab("llm")}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              activeTab === "llm"
                ? "border-purple-400 text-purple-300"
                : "border-transparent text-blue-300/50 hover:text-blue-200"
            }`}
          >
            <span className="flex items-center gap-2">
              <DynamicIcon name="Key" className="w-4 h-4" />
              API Keys
            </span>
          </button>
          <button
            onClick={() => setActiveTab("architecture")}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              activeTab === "architecture"
                ? "border-purple-400 text-purple-300"
                : "border-transparent text-blue-300/50 hover:text-blue-200"
            }`}
          >
            <span className="flex items-center gap-2">
              <DynamicIcon name="Layers" className="w-4 h-4" />
              Architecture
            </span>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {!isLoaded ? (
            <div className="flex items-center justify-center py-8">
              <DynamicIcon
                name="Loader2"
                className="w-6 h-6 text-purple-500 animate-spin"
              />
            </div>
          ) : activeTab === "config" ? (
            <AIConfigTab />
          ) : activeTab === "architecture" ? (
            <ArchitectureSettingsTab />
          ) : activeTab === "llm" ? (
            <>
              {/* Compact API Keys Grid */}
              <div className="space-y-3">
                {/* OpenRouter */}
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 shrink-0 rounded-lg bg-linear-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                    <span className="text-white text-xs font-bold">OR</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-white">
                        OpenRouter
                      </span>
                      {hasKey("openRouterKey") && (
                        <DynamicIcon
                          name="CheckCircle"
                          className="w-3.5 h-3.5 text-green-500"
                        />
                      )}
                      <a
                        href="https://openrouter.ai/keys"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-purple-500 hover:underline ml-auto"
                      >
                        Get key →
                      </a>
                    </div>
                    <div className="flex items-center gap-1 mt-1">
                      <input
                        type={showKeys ? "text" : "password"}
                        value={keys.openRouterKey}
                        onChange={(e) =>
                          setKey("openRouterKey", e.target.value)
                        }
                        placeholder="sk-or-..."
                        className="flex-1 px-2 py-1 bg-white/5 border border-white/10 rounded-lg text-xs font-mono text-white"
                      />
                      {hasKey("openRouterKey") && (
                        <button
                          onClick={disconnectOpenRouter}
                          className="p-1 text-red-400 hover:bg-red-500/10 rounded-lg"
                          title="Clear key"
                        >
                          <DynamicIcon name="X" className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                    <button
                      onClick={connectOpenRouter}
                      disabled={isConnectingOpenRouter}
                      className="mt-1 text-xs text-purple-500 hover:text-purple-600 flex items-center gap-1"
                    >
                      {isConnectingOpenRouter ? (
                        <>
                          <DynamicIcon
                            name="Loader2"
                            className="w-3 h-3 animate-spin"
                          />
                          Connecting...
                        </>
                      ) : (
                        <>
                          <DynamicIcon
                            name="ExternalLink"
                            className="w-3 h-3"
                          />
                          Or connect with OAuth instead
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* DeepSeek */}
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 shrink-0 rounded-lg bg-linear-to-br from-cyan-500 to-blue-600 flex items-center justify-center">
                    <span className="text-white text-xs font-bold">DS</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-white">
                        DeepSeek
                      </span>
                      {hasKey("deepseekKey") && (
                        <DynamicIcon
                          name="CheckCircle"
                          className="w-3.5 h-3.5 text-green-500"
                        />
                      )}
                      <a
                        href="https://platform.deepseek.com/api_keys"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-purple-500 hover:underline ml-auto"
                      >
                        Get key →
                      </a>
                    </div>
                    <input
                      type={showKeys ? "text" : "password"}
                      value={keys.deepseekKey}
                      onChange={(e) => setKey("deepseekKey", e.target.value)}
                      placeholder="sk-..."
                      className="w-full mt-1 px-2 py-1 bg-white/5 border border-white/10 rounded-lg text-xs font-mono text-white"
                    />
                  </div>
                </div>

                {/* Google AI Studio */}
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 shrink-0 rounded-lg bg-linear-to-br from-blue-500 to-green-500 flex items-center justify-center">
                    <span className="text-white text-xs font-bold">G</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-white">
                        Google AI Studio
                      </span>
                      {hasKey("googleKey") && (
                        <DynamicIcon
                          name="CheckCircle"
                          className="w-3.5 h-3.5 text-green-500"
                        />
                      )}
                      <a
                        href="https://aistudio.google.com/apikey"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-purple-500 hover:underline ml-auto"
                      >
                        Get key →
                      </a>
                    </div>
                    <input
                      type={showKeys ? "text" : "password"}
                      value={keys.googleKey}
                      onChange={(e) => setKey("googleKey", e.target.value)}
                      placeholder="AIza..."
                      className="w-full mt-1 px-2 py-1 bg-white/5 border border-white/10 rounded-lg text-xs font-mono text-white"
                    />
                  </div>
                </div>

                {/* Mistral */}
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 shrink-0 rounded-lg bg-linear-to-br from-orange-500 to-red-600 flex items-center justify-center">
                    <span className="text-white text-xs font-bold">M</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-white">
                        Mistral
                      </span>
                      {hasKey("mistralKey") && (
                        <DynamicIcon
                          name="CheckCircle"
                          className="w-3.5 h-3.5 text-green-500"
                        />
                      )}
                      <a
                        href="https://console.mistral.ai/api-keys"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-purple-500 hover:underline ml-auto"
                      >
                        Get key →
                      </a>
                    </div>
                    <input
                      type={showKeys ? "text" : "password"}
                      value={keys.mistralKey}
                      onChange={(e) => setKey("mistralKey", e.target.value)}
                      placeholder="..."
                      className="w-full mt-1 px-2 py-1 bg-white/5 border border-white/10 rounded-lg text-xs font-mono text-white"
                    />
                    <p className="text-xs text-blue-300/50 mt-1">
                      Used for Mistral models, OCR, and speech-to-text.
                    </p>
                  </div>
                </div>

                {/* DeepInfra */}
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 shrink-0 rounded-lg bg-linear-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
                    <span className="text-white text-xs font-bold">DI</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-white">
                        DeepInfra
                      </span>
                      {hasKey("deepinfraKey") && (
                        <DynamicIcon
                          name="CheckCircle"
                          className="w-3.5 h-3.5 text-green-500"
                        />
                      )}
                      <a
                        href="https://deepinfra.com/dash/api_keys"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-purple-500 hover:underline ml-auto"
                      >
                        Get key →
                      </a>
                    </div>
                    <input
                      type={showKeys ? "text" : "password"}
                      value={keys.deepinfraKey}
                      onChange={(e) => setKey("deepinfraKey", e.target.value)}
                      placeholder="..."
                      className="w-full mt-1 px-2 py-1 bg-white/5 border border-white/10 rounded-lg text-xs font-mono text-white"
                    />
                    <p className="text-xs text-blue-300/50 mt-1">
                      Used for image generation.
                    </p>
                  </div>
                </div>

                {/* Cartesia - TTS only */}
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 shrink-0 rounded-lg bg-linear-to-br from-teal-500 to-cyan-600 flex items-center justify-center">
                    <span className="text-white text-xs font-bold">CA</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-white">
                        Cartesia
                      </span>
                      {hasKey("cartesiaKey") && (
                        <DynamicIcon
                          name="CheckCircle"
                          className="w-3.5 h-3.5 text-green-500"
                        />
                      )}
                      <a
                        href="https://play.cartesia.ai/keys"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-purple-500 hover:underline ml-auto"
                      >
                        Get key →
                      </a>
                    </div>
                    <input
                      type={showKeys ? "text" : "password"}
                      value={keys.cartesiaKey}
                      onChange={(e) => setKey("cartesiaKey", e.target.value)}
                      placeholder="..."
                      className="w-full mt-1 px-2 py-1 bg-white/5 border border-white/10 rounded-lg text-xs font-mono text-white"
                    />
                    <p className="text-xs text-blue-300/50 mt-1">
                      Used for low-latency Sonic-3 text-to-speech.
                    </p>
                  </div>
                </div>

                {/* ElevenLabs - TTS only */}
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 shrink-0 rounded-lg bg-linear-to-br from-gray-700 to-gray-900 flex items-center justify-center">
                    <span className="text-white text-xs font-bold">EL</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-white">
                        ElevenLabs
                      </span>
                      {hasKey("elevenlabsKey") && (
                        <DynamicIcon
                          name="CheckCircle"
                          className="w-3.5 h-3.5 text-green-500"
                        />
                      )}
                      <a
                        href="https://elevenlabs.io/app/settings/api-keys"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-purple-500 hover:underline ml-auto"
                      >
                        Get key →
                      </a>
                    </div>
                    <input
                      type={showKeys ? "text" : "password"}
                      value={keys.elevenlabsKey}
                      onChange={(e) => setKey("elevenlabsKey", e.target.value)}
                      placeholder="..."
                      className="w-full mt-1 px-2 py-1 bg-white/5 border border-white/10 rounded-lg text-xs font-mono text-white"
                    />
                    <p className="text-xs text-blue-300/50 mt-1">
                      Used for premium Flash v2.5 text-to-speech.
                    </p>
                  </div>
                </div>

                {/* Brave Search - only used by the GM's optional web_research delegate_task */}
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 shrink-0 rounded-lg bg-linear-to-br from-orange-400 to-amber-600 flex items-center justify-center">
                    <span className="text-white text-xs font-bold">BS</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-white">
                        Brave Search
                      </span>
                      {hasKey("braveSearchKey") && (
                        <DynamicIcon
                          name="CheckCircle"
                          className="w-3.5 h-3.5 text-green-500"
                        />
                      )}
                      <a
                        href="https://api.search.brave.com/app/keys"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-purple-500 hover:underline ml-auto"
                      >
                        Get key →
                      </a>
                    </div>
                    <input
                      type={showKeys ? "text" : "password"}
                      value={keys.braveSearchKey}
                      onChange={(e) => setKey("braveSearchKey", e.target.value)}
                      placeholder="BSA..."
                      className="w-full mt-1 px-2 py-1 bg-white/5 border border-white/10 rounded-lg text-xs font-mono text-white"
                    />
                    <p className="text-xs text-blue-300/50 mt-1">
                      Only used if the GM delegates a web research task - enable that in
                      the Game tab.
                    </p>
                  </div>
                </div>
              </div>

              {/* Show/Hide Keys & Privacy Info */}
              <div className="flex items-center justify-between pt-3 border-t border-white/10">
                <button
                  onClick={() => setShowKeys(!showKeys)}
                  className="flex items-center gap-2 text-xs text-blue-300/60 hover:text-blue-200 transition-colors"
                >
                  <DynamicIcon
                    name={showKeys ? "EyeOff" : "Eye"}
                    className="w-3.5 h-3.5"
                  />
                  {showKeys ? "Hide" : "Show"}
                </button>
                <p className="text-xs text-blue-300/50 flex items-center gap-1">
                  <DynamicIcon name="Shield" className="w-3 h-3" />
                  Keys are never shared
                </p>
              </div>
            </>
          ) : activeTab === "services" ? (
            <>
              {/* TTS Provider Info */}
              <div className="p-3 bg-blue-500/10 rounded-lg border border-blue-400/20 -mt-2 mb-4">
                <div className="flex items-center gap-2">
                  <DynamicIcon
                    name="Volume2"
                    className="w-4 h-4 text-blue-300"
                  />
                  <div>
                    <p className="text-sm font-medium text-white">
                      Bring your own TTS provider
                    </p>
                    <p className="text-xs text-blue-300/60">
                      Cartesia Sonic-3 or ElevenLabs Flash -
                      add the matching key in the Keys tab
                    </p>
                  </div>
                </div>
              </div>

              {/* TTS Settings Section */}
              <div className="space-y-4">
                <h3 className="text-sm font-medium text-white flex items-center gap-2">
                  <DynamicIcon name="Settings" className="w-4 h-4" />
                  Voice Settings
                </h3>

                {/* Enable TTS Toggle */}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-blue-100">
                      Enable TTS
                    </p>
                    <p className="text-xs text-blue-300/60">
                      Show audio controls for story narration
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={ttsEnabled}
                      onChange={(e) => {
                        setTtsEnabled(e.target.checked);
                        localStorage.setItem(
                          "ttsEnabled",
                          e.target.checked.toString(),
                        );
                        addNotification(
                          e.target.checked ? "TTS Enabled" : "TTS Disabled",
                          "success",
                        );
                      }}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-white/10 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-purple-500 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:start-0.5 after:bg-white after:border-white/20 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-linear-to-r peer-checked:from-purple-600 peer-checked:to-blue-600" />
                  </label>
                </div>

                {/* Auto-Generate Toggle */}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-blue-100">
                      Auto-Generate Audio
                    </p>
                    <p className="text-xs text-blue-300/60">
                      Automatically narrate new story content
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={ttsAutoGenerate}
                      onChange={(e) => {
                        setTtsAutoGenerate(e.target.checked);
                        localStorage.setItem(
                          "ttsAutoGenerate",
                          e.target.checked.toString(),
                        );
                        addNotification(
                          e.target.checked
                            ? "Auto-generate enabled"
                            : "Auto-generate disabled",
                          "success",
                        );
                      }}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-white/10 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-purple-500 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:start-0.5 after:bg-white after:border-white/20 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-linear-to-r peer-checked:from-purple-600 peer-checked:to-blue-600" />
                  </label>
                </div>

                {/* TTS Model Selector */}
                <div>
                  <label className="block text-sm text-blue-100 mb-2">
                    TTS Model
                  </label>
                  <select
                    value={ttsModel}
                    onChange={(e) => {
                      const newModel = e.target.value as TTSModelKey;
                      setTtsModel(newModel);
                      localStorage.setItem("ttsModel", newModel);
                      // Reset voice to a sensible default for the new model
                      const defaultVoice = {
                        cartesia: "a0e99841-438c-4a64-b679-ae501e7d6091",
                        elevenlabs: "21m00Tcm4TlvDq8ikWAM",
                      }[newModel];
                      setTtsVoice(defaultVoice);
                      localStorage.setItem("ttsLastVoice", defaultVoice);
                      const modelLabel = {
                        cartesia: "Cartesia Sonic-3",
                        elevenlabs: "ElevenLabs Flash v2.5",
                      }[newModel];
                      addNotification(`Switched to ${modelLabel}`, "success");
                    }}
                    className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                  >
                    <option value="cartesia">
                      Cartesia Sonic-3 - Ultra Low Latency (Cartesia)
                    </option>
                    <option value="elevenlabs">
                      ElevenLabs Flash v2.5 - Best Quality (ElevenLabs)
                    </option>
                  </select>
                </div>

                {/* Voice Selector - Dynamic based on model */}
                <div>
                  <label className="block text-sm text-blue-100 mb-2">
                    Voice
                  </label>
                  <select
                    value={ttsVoice}
                    onChange={(e) => {
                      setTtsVoice(e.target.value);
                      localStorage.setItem("ttsLastVoice", e.target.value);
                      addNotification(
                        `Voice changed to ${
                          e.target.options[e.target.selectedIndex].text
                        }`,
                        "success",
                      );
                    }}
                    className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                  >
                    {ttsModel === "cartesia" ? (
                      <optgroup label="Sample Voices">
                        <option value="a0e99841-438c-4a64-b679-ae501e7d6091">
                          Barbershop Man
                        </option>
                        <option value="156fb8d2-335b-4950-9cb3-a2d33befec77">
                          Helpful Woman
                        </option>
                        <option value="f786b574-daa5-4673-aa0c-cbe3e8534c02">
                          Katie (Female)
                        </option>
                        <option value="db6b0ed5-d5d3-463d-ae85-518a07d3c2b4">
                          Skylar (Female)
                        </option>
                        <option value="a5136bf9-224c-4d76-b823-52bd5efcffcc">
                          Jameson (Male)
                        </option>
                      </optgroup>
                    ) : (
                      <optgroup label="Sample Voices">
                        <option value="21m00Tcm4TlvDq8ikWAM">Rachel (Female)</option>
                        <option value="EXAVITQu4vr4xnSDxMaL">Bella (Female)</option>
                        <option value="ErXwobaYiN019PkySvjV">Antoni (Male)</option>
                        <option value="pNInz6obpgDQGcFmaJgB">Adam (Male)</option>
                        <option value="TxGEqnHWrfWFTfGW9XjX">Josh (Male)</option>
                        <option value="yoZ06aMxZJJ28mfd3POQ">Sam (Male)</option>
                        <option value="AZnzlk1XvdvUeBnXmlld">Domi (Female)</option>
                      </optgroup>
                    )}
                    {customVoices.map((id) => (
                      <option key={id} value={id}>
                        {id} (Custom)
                      </option>
                    ))}
                  </select>
                  {(ttsModel === "cartesia" || ttsModel === "elevenlabs") && (
                    <p className="text-xs text-blue-300/50 mt-1">
                      Browse more voices at{" "}
                      {ttsModel === "cartesia" ? (
                        <a
                          href="https://play.cartesia.ai"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-purple-500 hover:underline"
                        >
                          play.cartesia.ai
                        </a>
                      ) : (
                        <a
                          href="https://elevenlabs.io/app/voice-library"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-purple-500 hover:underline"
                        >
                          elevenlabs.io/app/voice-library
                        </a>
                      )}{" "}
                      and add the voice ID below as a custom voice.
                    </p>
                  )}
                </div>

                {/* Custom Voice Manager */}
                <CustomVoiceManager
                  addNotification={addNotification}
                  onVoicesChange={setCustomVoices}
                  ttsModel={ttsModel}
                />

                {/* Volume Slider */}
                <div>
                  <label className="block text-sm text-blue-100 mb-2">
                    Volume: {Math.round(ttsVolume * 100)}%
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={ttsVolume}
                    onChange={(e) => {
                      const value = parseFloat(e.target.value);
                      setTtsVolume(value);
                      localStorage.setItem("ttsVolume", e.target.value);
                    }}
                    className="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer accent-purple-500"
                  />
                </div>
              </div>

              {/* Divider */}
              <hr className="border-white/10" />

              {/* STT Settings Section */}
              <div className="space-y-4">
                <h3 className="text-sm font-medium text-white flex items-center gap-2">
                  <DynamicIcon name="Mic" className="w-4 h-4" />
                  Speech-to-Text
                </h3>

                {/* Enable STT Toggle */}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-blue-100">
                      Enable Speech Input
                    </p>
                    <p className="text-xs text-blue-300/60">
                      Show microphone button for voice input (2 coins per use)
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={sttEnabled}
                      onChange={(e) => {
                        setSttEnabled(e.target.checked);
                        localStorage.setItem(
                          "sttEnabled",
                          e.target.checked.toString(),
                        );
                        addNotification(
                          e.target.checked
                            ? "Speech input enabled"
                            : "Speech input disabled",
                          "success",
                        );
                        // Force re-render for story page
                        window.dispatchEvent(new Event("storage"));
                      }}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-white/10 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-purple-500 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:start-0.5 after:bg-white after:border-white/20 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-linear-to-r peer-checked:from-purple-600 peer-checked:to-blue-600" />
                  </label>
                </div>
              </div>
            </>
          ) : activeTab === "game" ? (
            <>
              {/* Game Settings Tab */}
              <div className="space-y-4">
                <h3 className="text-sm font-medium text-white flex items-center gap-2">
                  <DynamicIcon name="Gamepad2" className="w-4 h-4" />
                  Game Settings
                </h3>

                {/* Default User Notes */}
                <div>
                  <label className="block text-sm text-blue-100 mb-2">
                    Default User Notes
                  </label>
                  <p className="text-xs text-blue-300/60 mb-2">
                    These notes will be automatically added to every new
                    story&apos;s author notes. Use this to set persistent
                    preferences like writing style, content boundaries, or
                    character guidelines.
                  </p>
                  <textarea
                    value={defaultUserNotes}
                    onChange={(e) => {
                      setDefaultUserNotes(e.target.value);
                      localStorage.setItem("defaultUserNotes", e.target.value);
                    }}
                    placeholder="e.g., Always write in first person. Include vivid sensory details. Keep dialogue natural and character-driven..."
                    className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500 resize-y min-h-[120px]"
                    rows={5}
                  />
                  <p className="text-xs text-blue-300/50 mt-1">
                    {defaultUserNotes.length} characters
                  </p>
                </div>

                {/* Divider */}
                <hr className="border-white/10" />

                {/* Web Research Toggle */}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-blue-100">
                      Enable Web Research
                    </p>
                    <p className="text-xs text-blue-300/60 max-w-sm">
                      Lets the GM delegate real-world research questions to a web
                      search (via your Brave Search key in API Keys). Off by
                      default - each search uses your own key.
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer shrink-0 ml-4">
                    <input
                      type="checkbox"
                      checked={webResearchEnabled}
                      onChange={(e) => {
                        setWebResearchEnabled(e.target.checked);
                        localStorage.setItem(
                          "webResearchEnabled",
                          e.target.checked.toString(),
                        );
                        addNotification(
                          e.target.checked
                            ? "Web research enabled"
                            : "Web research disabled",
                          "success",
                        );
                      }}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-white/10 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-purple-500 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:start-0.5 after:bg-white after:border-white/20 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-linear-to-r peer-checked:from-purple-600 peer-checked:to-blue-600" />
                  </label>
                </div>
              </div>
            </>
          ) : (
            <>
              {/* Display Settings Tab */}
              <div className="space-y-4">
                <h3 className="text-sm font-medium text-white flex items-center gap-2">
                  <DynamicIcon name="Monitor" className="w-4 h-4" />
                  Display Settings
                </h3>

                {/* Show Hidden Messages Toggle */}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-blue-100">
                      Show Hidden Messages
                    </p>
                    <p className="text-xs text-blue-300/60">
                      Reveal ||double pipe|| text (AI internal notes)
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showHiddenMessages}
                      onChange={(e) => {
                        setShowHiddenMessages(e.target.checked);
                        localStorage.setItem(
                          "showHiddenMessages",
                          e.target.checked.toString(),
                        );
                        addNotification(
                          e.target.checked
                            ? "Hidden messages visible"
                            : "Hidden messages hidden",
                          "success",
                        );
                        // Force re-render for story page
                        window.dispatchEvent(new Event("storage"));
                      }}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-white/10 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-purple-500 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:start-0.5 after:bg-white after:border-white/20 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-linear-to-r peer-checked:from-purple-600 peer-checked:to-blue-600" />
                  </label>
                </div>

                {/* Divider */}
                <hr className="border-white/10" />

                {/* Font Settings */}
                <FontSettingsTab addNotification={addNotification} />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );

  // Use portal to render outside of any stacking context (like sticky header)
  return createPortal(modalContent, document.body);
}
