"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useAPIKeys } from "@/app/misc/APIKeysContext";
import { useAuth } from "@/app/misc/AuthContext";
import { DynamicIcon } from "./DynamicIcon";
import AIConfigTab from "./AIConfigTab";

interface APIKeysModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function APIKeysModal({ isOpen, onClose }: APIKeysModalProps) {
  const { user } = useAuth();
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
  const [activeTab, setActiveTab] = useState<"config" | "llm" | "services">(
    "config"
  );
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
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
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
        <div className="flex border-b border-gray-200 dark:border-gray-700 px-6">
          <button
            onClick={() => setActiveTab("config")}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
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
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
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
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === "services"
                ? "border-purple-500 text-purple-600 dark:text-purple-400"
                : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
            }`}
          >
            <span className="flex items-center gap-2">
              <DynamicIcon name="Mic" className="w-4 h-4" />
              Voice
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
              {/* OpenRouter Section */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-linear-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                      <span className="text-white text-xs font-bold">OR</span>
                    </div>
                    <div>
                      <h3 className="text-sm font-medium text-gray-900 dark:text-white">
                        OpenRouter
                      </h3>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Access 100+ AI models
                      </p>
                    </div>
                  </div>
                  {hasKey("openRouterKey") ? (
                    <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                      <DynamicIcon name="CheckCircle" className="w-3.5 h-3.5" />
                      Connected
                    </span>
                  ) : (
                    <span className="text-xs text-gray-400">Not connected</span>
                  )}
                </div>

                {/* OAuth Connect Button */}
                {!hasKey("openRouterKey") ? (
                  <button
                    onClick={connectOpenRouter}
                    disabled={isConnectingOpenRouter}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-linear-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white rounded-lg font-medium text-sm transition-all disabled:opacity-50"
                  >
                    {isConnectingOpenRouter ? (
                      <>
                        <DynamicIcon
                          name="Loader2"
                          className="w-4 h-4 animate-spin"
                        />
                        Connecting...
                      </>
                    ) : (
                      <>
                        <DynamicIcon name="ExternalLink" className="w-4 h-4" />
                        Connect with OpenRouter
                      </>
                    )}
                  </button>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <input
                        type={showKeys ? "text" : "password"}
                        value={keys.openRouterKey}
                        onChange={(e) =>
                          setKey("openRouterKey", e.target.value)
                        }
                        placeholder="sk-or-..."
                        className="flex-1 px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm font-mono"
                      />
                      <button
                        onClick={disconnectOpenRouter}
                        className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                        title="Disconnect"
                      >
                        <DynamicIcon name="Unlink" className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}

                <p className="text-xs text-gray-500 dark:text-gray-400">
                  <a
                    href="https://openrouter.ai/keys"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-purple-500 hover:underline"
                  >
                    Get an API key →
                  </a>
                </p>
              </div>

              {/* Divider with "or" */}
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-200 dark:border-gray-700" />
                </div>
                <div className="relative flex justify-center">
                  <span className="px-2 text-xs text-gray-400 bg-white dark:bg-gray-900">
                    or enter manually
                  </span>
                </div>
              </div>

              {/* DeepSeek Section */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-linear-to-br from-cyan-500 to-blue-600 flex items-center justify-center">
                      <span className="text-white text-xs font-bold">DS</span>
                    </div>
                    <div>
                      <h3 className="text-sm font-medium text-gray-900 dark:text-white">
                        DeepSeek
                      </h3>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Cost-effective reasoning models
                      </p>
                    </div>
                  </div>
                  {hasKey("deepseekKey") && (
                    <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                      <DynamicIcon name="CheckCircle" className="w-3.5 h-3.5" />
                      Configured
                    </span>
                  )}
                </div>
                <input
                  type={showKeys ? "text" : "password"}
                  value={keys.deepseekKey}
                  onChange={(e) => setKey("deepseekKey", e.target.value)}
                  placeholder="sk-..."
                  className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm font-mono"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  <a
                    href="https://platform.deepseek.com/api_keys"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-purple-500 hover:underline"
                  >
                    Get an API key →
                  </a>{" "}
                  • Required to use DeepSeek models
                </p>
              </div>

              {/* NovelAI Section */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-linear-to-br from-orange-500 to-red-600 flex items-center justify-center">
                      <span className="text-white text-xs font-bold">📖</span>
                    </div>
                    <div>
                      <h3 className="text-sm font-medium text-gray-900 dark:text-white">
                        NovelAI
                      </h3>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Creative writing focused
                      </p>
                    </div>
                  </div>
                  {hasKey("novelaiKey") && (
                    <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                      <DynamicIcon name="CheckCircle" className="w-3.5 h-3.5" />
                      Configured
                    </span>
                  )}
                </div>
                <input
                  type={showKeys ? "text" : "password"}
                  value={keys.novelaiKey}
                  onChange={(e) => setKey("novelaiKey", e.target.value)}
                  placeholder="pst-..."
                  className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm font-mono"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Requires NovelAI subscription • Story generation only
                </p>
              </div>
            </>
          ) : (
            <>
              {/* Speechify Section */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-linear-to-br from-green-500 to-emerald-600 flex items-center justify-center">
                      <DynamicIcon
                        name="Volume2"
                        className="w-4 h-4 text-white"
                      />
                    </div>
                    <div>
                      <h3 className="text-sm font-medium text-gray-900 dark:text-white">
                        Speechify
                      </h3>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Text-to-Speech
                      </p>
                    </div>
                  </div>
                  {hasKey("speechifyKey") && (
                    <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                      <DynamicIcon name="CheckCircle" className="w-3.5 h-3.5" />
                      Configured
                    </span>
                  )}
                </div>
                <input
                  type={showKeys ? "text" : "password"}
                  value={keys.speechifyKey}
                  onChange={(e) => setKey("speechifyKey", e.target.value)}
                  placeholder="speechify-..."
                  className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm font-mono"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  <a
                    href="https://speechify.com/api/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-purple-500 hover:underline"
                  >
                    Get an API key →
                  </a>
                </p>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 space-y-4">
          {/* Show/Hide Keys Toggle */}
          <div className="flex items-center justify-between">
            <button
              onClick={() => setShowKeys(!showKeys)}
              className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
            >
              <DynamicIcon
                name={showKeys ? "EyeOff" : "Eye"}
                className="w-4 h-4"
              />
              {showKeys ? "Hide API Keys" : "Show API Keys"}
            </button>
          </div>

          {/* Global Keys Toggle */}
          {user && (
            <div className="flex items-center justify-between p-3 bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-3">
                <div className="p-1.5 bg-blue-100 dark:bg-blue-900/30 rounded">
                  <DynamicIcon
                    name="Cloud"
                    className="w-4 h-4 text-blue-600 dark:text-blue-400"
                  />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">
                    Sync across devices
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Keys are encrypted and stored securely
                  </p>
                </div>
              </div>
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
          )}

          {/* Info */}
          <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
            <DynamicIcon name="Shield" className="w-3 h-3 inline mr-1" />
            Your API keys are never shared and are used only for your requests
          </p>
        </div>
      </div>
    </div>
  );

  // Use portal to render outside of any stacking context (like sticky header)
  return createPortal(modalContent, document.body);
}
