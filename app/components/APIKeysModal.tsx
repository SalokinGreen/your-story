"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useAPIKeys } from "@/app/misc/APIKeysContext";
import { useAuth } from "@/app/misc/AuthContext";
import { useNotification } from "@/app/misc/NotificationContext";
import { DynamicIcon } from "./DynamicIcon";
import AIConfigTab from "./AIConfigTab";
import CustomVoiceManager from "./CustomVoiceManager";
import FontSettingsTab from "./FontSettingsTab";

interface APIKeysModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function APIKeysModal({ isOpen, onClose }: APIKeysModalProps) {
  const { user } = useAuth();
  const { addNotification } = useNotification();
  const {
    keys,
    isLoaded,
    useGlobalKeys,
    setKey,
    setUseGlobalKeys,
    hasKey,
    connectOpenRouter,
    disconnectOpenRouter,
    isConnectingOpenRouter,
  } = useAPIKeys();

  const [showKeys, setShowKeys] = useState(false);
  const [activeTab, setActiveTab] = useState<
    "config" | "llm" | "services" | "display"
  >("config");

  // TTS Settings state (read from localStorage)
  const [ttsEnabled, setTtsEnabled] = useState(true);
  const [ttsAutoGenerate, setTtsAutoGenerate] = useState(false);
  const [ttsVoice, setTtsVoice] = useState("af_heart");
  const [ttsModel, setTtsModel] = useState<"kokoro" | "orpheus">("kokoro");
  const [ttsVolume, setTtsVolume] = useState(1.0);
  const [sttEnabled, setSttEnabled] = useState(true);
  const [showHiddenMessages, setShowHiddenMessages] = useState(false);
  const [customVoices, setCustomVoices] = useState<string[]>([]);

  // Load settings from localStorage on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      setTtsEnabled(localStorage.getItem("ttsEnabled") !== "false");
      setTtsAutoGenerate(localStorage.getItem("ttsAutoGenerate") === "true");
      setTtsVoice(localStorage.getItem("ttsLastVoice") || "af_heart");
      setTtsModel(
        (localStorage.getItem("ttsModel") as "kokoro" | "orpheus") || "kokoro"
      );
      setTtsVolume(parseFloat(localStorage.getItem("ttsVolume") || "1.0"));
      setSttEnabled(localStorage.getItem("sttEnabled") !== "false");
      setShowHiddenMessages(
        localStorage.getItem("showHiddenMessages") === "true"
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
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="shrink-0 px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
              <DynamicIcon
                name="Settings"
                className="w-5 h-5 text-purple-600 dark:text-purple-400"
              />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                Settings
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                AI models and API keys
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
          >
            <DynamicIcon
              name="X"
              className="w-5 h-5 text-gray-500 dark:text-gray-400"
            />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex shrink-0 border-b border-gray-200 dark:border-gray-700 px-6 overflow-x-auto">
          <button
            onClick={() => setActiveTab("config")}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              activeTab === "config"
                ? "border-purple-500 text-purple-600 dark:text-purple-400"
                : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
            }`}
          >
            <span className="flex items-center gap-2">
              <DynamicIcon name="Sliders" className="w-4 h-4" />
              AI Config
            </span>
          </button>
          <button
            onClick={() => setActiveTab("llm")}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              activeTab === "llm"
                ? "border-purple-500 text-purple-600 dark:text-purple-400"
                : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
            }`}
          >
            <span className="flex items-center gap-2">
              <DynamicIcon name="Key" className="w-4 h-4" />
              API Keys
            </span>
          </button>
          <button
            onClick={() => setActiveTab("services")}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              activeTab === "services"
                ? "border-purple-500 text-purple-600 dark:text-purple-400"
                : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
            }`}
          >
            <span className="flex items-center gap-2">
              <DynamicIcon name="Volume2" className="w-4 h-4" />
              Voice
            </span>
          </button>
          <button
            onClick={() => setActiveTab("display")}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              activeTab === "display"
                ? "border-purple-500 text-purple-600 dark:text-purple-400"
                : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
            }`}
          >
            <span className="flex items-center gap-2">
              <DynamicIcon name="Monitor" className="w-4 h-4" />
              Display
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
          ) : activeTab === "llm" ? (
            <>
              {/* Sync Toggle - Prominent at top */}
              {user && (
                <div className="flex items-center justify-between p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-700/50 -mt-2 mb-4">
                  <div className="flex items-center gap-2">
                    <DynamicIcon
                      name="Cloud"
                      className="w-4 h-4 text-blue-600 dark:text-blue-400"
                    />
                    <div>
                      <p className="text-sm font-medium text-gray-900 dark:text-white">
                        Sync across devices
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Keys are encrypted and stored securely
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {useGlobalKeys && (
                      <button
                        onClick={async () => {
                          await setUseGlobalKeys(true);
                          addNotification("Keys synced to cloud", "success");
                        }}
                        className="px-2 py-1 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
                        title="Force sync all keys to cloud"
                      >
                        Sync Now
                      </button>
                    )}
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={useGlobalKeys}
                        onChange={(e) => setUseGlobalKeys(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-purple-500 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:start-0.5 after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-purple-600" />
                    </label>
                  </div>
                </div>
              )}

              {/* Compact API Keys Grid */}
              <div className="space-y-3">
                {/* OpenRouter */}
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 shrink-0 rounded-lg bg-linear-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                    <span className="text-white text-xs font-bold">OR</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-900 dark:text-white">
                        OpenRouter
                      </span>
                      {hasKey("openRouterKey") && (
                        <DynamicIcon
                          name="CheckCircle"
                          className="w-3.5 h-3.5 text-green-500"
                        />
                      )}
                    </div>
                    {!hasKey("openRouterKey") ? (
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
                            Connect with OAuth
                          </>
                        )}
                      </button>
                    ) : (
                      <div className="flex items-center gap-1 mt-1">
                        <input
                          type={showKeys ? "text" : "password"}
                          value={keys.openRouterKey}
                          onChange={(e) =>
                            setKey("openRouterKey", e.target.value)
                          }
                          placeholder="sk-or-..."
                          className="flex-1 px-2 py-1 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded text-xs font-mono"
                        />
                        <button
                          onClick={disconnectOpenRouter}
                          className="p-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                          title="Disconnect"
                        >
                          <DynamicIcon name="X" className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* DeepSeek */}
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 shrink-0 rounded-lg bg-linear-to-br from-cyan-500 to-blue-600 flex items-center justify-center">
                    <span className="text-white text-xs font-bold">DS</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-900 dark:text-white">
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
                      className="w-full mt-1 px-2 py-1 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded text-xs font-mono"
                    />
                  </div>
                </div>

                {/* NovelAI */}
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 shrink-0 rounded-lg bg-linear-to-br from-orange-500 to-red-600 flex items-center justify-center">
                    <span className="text-white text-xs font-bold">📖</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-900 dark:text-white">
                        NovelAI
                      </span>
                      {hasKey("novelaiKey") && (
                        <DynamicIcon
                          name="CheckCircle"
                          className="w-3.5 h-3.5 text-green-500"
                        />
                      )}
                      <span className="text-xs text-gray-400 ml-auto">
                        Story only
                      </span>
                    </div>
                    <input
                      type={showKeys ? "text" : "password"}
                      value={keys.novelaiKey}
                      onChange={(e) => setKey("novelaiKey", e.target.value)}
                      placeholder="pst-..."
                      className="w-full mt-1 px-2 py-1 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded text-xs font-mono"
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
                      <span className="text-sm font-medium text-gray-900 dark:text-white">
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
                      className="w-full mt-1 px-2 py-1 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded text-xs font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* Show/Hide Keys & Privacy Info */}
              <div className="flex items-center justify-between pt-3 border-t border-gray-200 dark:border-gray-700">
                <button
                  onClick={() => setShowKeys(!showKeys)}
                  className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
                >
                  <DynamicIcon
                    name={showKeys ? "EyeOff" : "Eye"}
                    className="w-3.5 h-3.5"
                  />
                  {showKeys ? "Hide" : "Show"}
                </button>
                <p className="text-xs text-gray-400 dark:text-gray-500 flex items-center gap-1">
                  <DynamicIcon name="Shield" className="w-3 h-3" />
                  Keys are never shared
                </p>
              </div>
            </>
          ) : activeTab === "services" ? (
            <>
              {/* TTS Provider Info */}
              <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-700/50 -mt-2 mb-4">
                <div className="flex items-center gap-2">
                  <DynamicIcon
                    name="Volume2"
                    className="w-4 h-4 text-blue-600 dark:text-blue-400"
                  />
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      Powered by DeepInfra
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Choose between fast Kokoro or premium Orpheus voices
                    </p>
                  </div>
                </div>
              </div>

              {/* TTS Settings Section */}
              <div className="space-y-4">
                <h3 className="text-sm font-medium text-gray-900 dark:text-white flex items-center gap-2">
                  <DynamicIcon name="Settings" className="w-4 h-4" />
                  Voice Settings
                </h3>

                {/* Enable TTS Toggle */}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-700 dark:text-gray-300">
                      Enable TTS
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
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
                          e.target.checked.toString()
                        );
                        addNotification(
                          e.target.checked ? "TTS Enabled" : "TTS Disabled",
                          "success"
                        );
                      }}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-purple-500 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:start-0.5 after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-purple-600" />
                  </label>
                </div>

                {/* Auto-Generate Toggle */}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-700 dark:text-gray-300">
                      Auto-Generate Audio
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
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
                          e.target.checked.toString()
                        );
                        addNotification(
                          e.target.checked
                            ? "Auto-generate enabled"
                            : "Auto-generate disabled",
                          "success"
                        );
                      }}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-purple-500 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:start-0.5 after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-purple-600" />
                  </label>
                </div>

                {/* TTS Model Selector */}
                <div>
                  <label className="block text-sm text-gray-700 dark:text-gray-300 mb-2">
                    TTS Model
                  </label>
                  <select
                    value={ttsModel}
                    onChange={(e) => {
                      const newModel = e.target.value as "kokoro" | "orpheus";
                      setTtsModel(newModel);
                      localStorage.setItem("ttsModel", newModel);
                      // Reset voice to default for new model
                      const defaultVoice =
                        newModel === "orpheus" ? "tara" : "af_heart";
                      setTtsVoice(defaultVoice);
                      localStorage.setItem("ttsLastVoice", defaultVoice);
                      addNotification(
                        `Switched to ${
                          newModel === "orpheus"
                            ? "Orpheus (Premium)"
                            : "Kokoro (Fast)"
                        }`,
                        "success"
                      );
                    }}
                    className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                  >
                    <option value="kokoro">
                      Kokoro - Fast & Affordable ($0.62/1M chars)
                    </option>
                    <option value="orpheus">
                      Orpheus - Premium Expressive ($7/1M chars)
                    </option>
                  </select>
                </div>

                {/* Voice Selector - Dynamic based on model */}
                <div>
                  <label className="block text-sm text-gray-700 dark:text-gray-300 mb-2">
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
                        "success"
                      );
                    }}
                    className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                  >
                    {ttsModel === "kokoro" ? (
                      <>
                        <optgroup label="American English - Female">
                          <option value="af_heart">Heart ❤️</option>
                          <option value="af_bella">Bella 🔥</option>
                          <option value="af_nicole">Nicole 🎧</option>
                          <option value="af_sarah">Sarah</option>
                          <option value="af_sky">Sky</option>
                        </optgroup>
                        <optgroup label="American English - Male">
                          <option value="am_adam">Adam</option>
                          <option value="am_michael">Michael</option>
                          <option value="am_fenrir">Fenrir</option>
                        </optgroup>
                        <optgroup label="British English">
                          <option value="bf_emma">Emma (Female)</option>
                          <option value="bf_isabella">Isabella (Female)</option>
                          <option value="bm_george">George (Male)</option>
                          <option value="bm_daniel">Daniel (Male)</option>
                        </optgroup>
                      </>
                    ) : (
                      <>
                        <optgroup label="Female Voices">
                          <option value="tara">Tara</option>
                          <option value="leah">Leah</option>
                          <option value="jess">Jess</option>
                          <option value="mia">Mia</option>
                          <option value="zoe">Zoe</option>
                        </optgroup>
                        <optgroup label="Male Voices">
                          <option value="leo">Leo</option>
                          <option value="dan">Dan</option>
                          <option value="zac">Zac</option>
                        </optgroup>
                      </>
                    )}
                    {customVoices.map((id) => (
                      <option key={id} value={id}>
                        {id} (Custom)
                      </option>
                    ))}
                  </select>
                </div>

                {/* Custom Voice Manager */}
                <CustomVoiceManager
                  addNotification={addNotification}
                  onVoicesChange={setCustomVoices}
                />

                {/* Volume Slider */}
                <div>
                  <label className="block text-sm text-gray-700 dark:text-gray-300 mb-2">
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
                    className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-purple-500"
                  />
                </div>
              </div>

              {/* Divider */}
              <hr className="border-gray-200 dark:border-gray-700" />

              {/* STT Settings Section */}
              <div className="space-y-4">
                <h3 className="text-sm font-medium text-gray-900 dark:text-white flex items-center gap-2">
                  <DynamicIcon name="Mic" className="w-4 h-4" />
                  Speech-to-Text
                </h3>

                {/* Enable STT Toggle */}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-700 dark:text-gray-300">
                      Enable Speech Input
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
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
                          e.target.checked.toString()
                        );
                        addNotification(
                          e.target.checked
                            ? "Speech input enabled"
                            : "Speech input disabled",
                          "success"
                        );
                        // Force re-render for story page
                        window.dispatchEvent(new Event("storage"));
                      }}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-purple-500 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:start-0.5 after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-purple-600" />
                  </label>
                </div>
              </div>
            </>
          ) : (
            <>
              {/* Display Settings Tab */}
              <div className="space-y-4">
                <h3 className="text-sm font-medium text-gray-900 dark:text-white flex items-center gap-2">
                  <DynamicIcon name="Monitor" className="w-4 h-4" />
                  Display Settings
                </h3>

                {/* Show Hidden Messages Toggle */}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-700 dark:text-gray-300">
                      Show Hidden Messages
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
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
                          e.target.checked.toString()
                        );
                        addNotification(
                          e.target.checked
                            ? "Hidden messages visible"
                            : "Hidden messages hidden",
                          "success"
                        );
                        // Force re-render for story page
                        window.dispatchEvent(new Event("storage"));
                      }}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-purple-500 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:start-0.5 after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-purple-600" />
                  </label>
                </div>

                {/* Divider */}
                <hr className="border-gray-200 dark:border-gray-700" />

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
