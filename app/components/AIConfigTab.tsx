"use client";

import { useState, useEffect } from "react";
import { useAPIKeys, APIKeys } from "@/app/misc/APIKeysContext";
import { DynamicIcon } from "./DynamicIcon";
import { AI_MODELS } from "@/app/misc/ai_prices";
import { REASONING_TIERS, NARRATION_MODEL_KEY } from "@/app/misc/reasoningTiers";
import { getUserSettings, updateUserSettings, AIConfig } from "@/app/misc/user_settings";
import { logger, LogEntry } from "@/app/misc/logger";
import SamplingSettingsTab from "./SamplingSettingsTab";

// Maps an AI_MODELS provider string to the APIKeys field that must be
// configured for that provider - used to flag tiers with a missing key.
const PROVIDER_KEY_FIELD: Record<string, keyof APIKeys | undefined> = {
  openrouter: "openRouterKey",
  deepseek: "deepseekKey",
  google: "googleKey",
  mistral: "mistralKey",
  deepinfra: "deepinfraKey",
  novelai: "novelaiKey",
};

export default function AIConfigTab() {
  const { hasKey } = useAPIKeys();

  // Generation settings
  const toolCallingEnabled = true;
  const [maxToolLoops, setMaxToolLoops] = useState(() => {
    if (typeof window !== "undefined") {
      return parseInt(localStorage.getItem("maxToolLoops") || "10", 10);
    }
    return 10;
  });
  const [embeddingsEnabled, setEmbeddingsEnabled] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("embeddingsEnabled") === "true";
    }
    return false;
  });
  const [embeddingThreshold, setEmbeddingThreshold] = useState(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("embeddingThreshold");
      return stored ? parseFloat(stored) : 0.25;
    }
    return 0.25;
  });
  const [usePrefill, setUsePrefill] = useState(() => {
    if (typeof window !== "undefined") {
      // Default to true (enabled)
      return localStorage.getItem("usePrefill") !== "false";
    }
    return true;
  });
  // GM stage + GM thinking display are always enabled
  const displayGMThinking = true;
  const [customMaxContext, setCustomMaxContext] = useState(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("customMaxContext");
      return stored ? parseInt(stored, 10) : 36000;
    }
    return 36000;
  });
  const [customMaxOutput, setCustomMaxOutput] = useState(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("customMaxOutput");
      return stored ? parseInt(stored, 10) : 8000;
    }
    return 8000;
  });
  // Track if user is in custom input mode (separate from the value)
  const [isCustomContextMode, setIsCustomContextMode] = useState(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("customMaxContext");
      return (
        stored === "-1" ||
        (stored !== null &&
          ![8000, 16000, 36000, 72000, 120000, 200000].includes(
            parseInt(stored, 10)
          ))
      );
    }
    return false;
  });
  const [isCustomOutputMode, setIsCustomOutputMode] = useState(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("customMaxOutput");
      return (
        stored === "-1" ||
        (stored !== null &&
          ![1000, 2000, 4000, 8000].includes(parseInt(stored, 10)))
      );
    }
    return false;
  });
  // Temporary input values for custom fields - initialize from stored values if in custom mode
  const [customContextInput, setCustomContextInput] = useState(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("customMaxContext");
      const storedVal = stored ? parseInt(stored, 10) : 0;
      // If stored value is not a preset, show it in custom input
      if (
        stored &&
        ![8000, 16000, 36000, 72000, 120000, 200000].includes(storedVal)
      ) {
        return stored;
      }
    }
    return "";
  });
  const [customOutputInput, setCustomOutputInput] = useState(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("customMaxOutput");
      const storedVal = stored ? parseInt(stored, 10) : 0;
      // If stored value is not a preset, show it in custom input
      if (stored && ![1000, 2000, 4000, 8000].includes(storedVal)) {
        return stored;
      }
    }
    return "";
  });

  // NovelAI settings
  const [novelaiEnabled, setNovelaiEnabled] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("novelaiEnabled") === "true";
    }
    return false;
  });
  const [novelaiTemperature, setNovelaiTemperature] = useState(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("novelaiTemperature");
      return stored ? parseFloat(stored) : 1;
    }
    return 1;
  });

  const [isLoadingSettings, setIsLoadingSettings] = useState(false);
  const [hasLoadedSettings, setHasLoadedSettings] = useState(() => {
    // Check if we've already loaded settings this session
    if (typeof window !== "undefined") {
      return sessionStorage.getItem("aiConfigLoaded") === "true";
    }
    return false;
  });

  // Recent reasoning-tier calls, for cost-tuning visibility (replaces the old
  // per-model coin-cost estimate UI). Sourced from the existing session log
  // (app/misc/logger.ts) - generation.ts logs a tier resolution on every GM
  // stage round and dispatch.
  const [recentTierLogs, setRecentTierLogs] = useState<LogEntry[]>([]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const refresh = () => {
      const logs = logger.getLogs();
      const tierLogs = logs
        .filter(
          (l) =>
            l.message === "Reasoning tier resolved for GM stage" ||
            l.message.startsWith("GM stage round") ||
            l.message.startsWith("GM stage model unavailable")
        )
        .slice(-8)
        .reverse();
      setRecentTierLogs(tierLogs);
    };
    refresh();
    window.addEventListener("story-log-update", refresh);
    return () => window.removeEventListener("story-log-update", refresh);
  }, []);

  // Load settings from local storage (AI config) - only once per session
  useEffect(() => {
    if (!hasLoadedSettings) {
      setIsLoadingSettings(true);
      getUserSettings()
        .then((settings) => {
          if (settings?.ai_config) {
            const config = settings.ai_config;

            // Only apply cloud settings if localStorage is empty for that key
            if (
              config.customMaxContext !== undefined &&
              !localStorage.getItem("customMaxContext")
            ) {
              setCustomMaxContext(config.customMaxContext);
              localStorage.setItem(
                "customMaxContext",
                config.customMaxContext.toString()
              );
            }
            if (
              config.customMaxOutput !== undefined &&
              !localStorage.getItem("customMaxOutput")
            ) {
              setCustomMaxOutput(config.customMaxOutput);
              localStorage.setItem(
                "customMaxOutput",
                config.customMaxOutput.toString()
              );
            }
          }
          setHasLoadedSettings(true);
          // Mark as loaded for this session
          if (typeof window !== "undefined") {
            sessionStorage.setItem("aiConfigLoaded", "true");
          }
        })
        .finally(() => setIsLoadingSettings(false));
    }
  }, [hasLoadedSettings]);

  // Persist NovelAI settings
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("novelaiEnabled", novelaiEnabled.toString());
    }
  }, [novelaiEnabled]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("novelaiTemperature", novelaiTemperature.toString());
    }
  }, [novelaiTemperature]);

  // Auto-save context settings (after initial load)
  useEffect(() => {
    if (typeof window !== "undefined" && hasLoadedSettings) {
      localStorage.setItem("customMaxContext", customMaxContext.toString());
      const timeoutId = setTimeout(() => {
        const aiConfig: AIConfig = {
          currentPreset: "auto", // reasoning-tier router manages model selection now
          customMaxContext:
            customMaxContext !== 36000 ? customMaxContext : undefined,
          customMaxOutput:
            customMaxOutput !== 8000 ? customMaxOutput : undefined,
        };
        updateUserSettings({ ai_config: aiConfig });
      }, 1000); // Debounce 1 second
      return () => clearTimeout(timeoutId);
    }
  }, [customMaxContext, hasLoadedSettings]);

  useEffect(() => {
    if (typeof window !== "undefined" && hasLoadedSettings) {
      localStorage.setItem("customMaxOutput", customMaxOutput.toString());
      const timeoutId = setTimeout(() => {
        const aiConfig: AIConfig = {
          currentPreset: "auto",
          customMaxContext:
            customMaxContext !== 36000 ? customMaxContext : undefined,
          customMaxOutput:
            customMaxOutput !== 8000 ? customMaxOutput : undefined,
        };
        updateUserSettings({ ai_config: aiConfig });
      }, 1000); // Debounce 1 second
      return () => clearTimeout(timeoutId);
    }
  }, [customMaxOutput, hasLoadedSettings]);

  if (isLoadingSettings) {
    return (
      <div className="flex items-center justify-center py-8">
        <DynamicIcon
          name="Loader2"
          className="w-6 h-6 text-purple-500 animate-spin"
        />
      </div>
    );
  }

  const narrationModelConfig = AI_MODELS[NARRATION_MODEL_KEY];

  return (
    <div className="space-y-6">
      {/* Narration Voice Banner */}
      <div className="bg-linear-to-r from-purple-600 to-blue-600 rounded-lg p-4 text-white">
        <div className="text-xl font-bold flex items-center gap-2">
          {narrationModelConfig.name}
          <span className="text-xs bg-white/20 px-2 py-0.5 rounded-full">
            Narration Voice
          </span>
        </div>
        <div className="text-sm text-white/70 mt-1">
          Always used for player-facing prose, no matter which reasoning tier
          handles adjudication - this is what keeps the GM&rsquo;s voice
          consistent even during a boss fight.
        </div>
      </div>

      {/* Reasoning Tier Ladder */}
      <div className="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg space-y-3">
        <h4 className="text-sm font-medium text-gray-900 dark:text-white flex items-center gap-2">
          <DynamicIcon name="Brain" className="w-4 h-4" />
          Reasoning Tiers
        </h4>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          The GM automatically picks a model per turn based on what&rsquo;s
          happening - banter runs cheap, combat and boss fights escalate
          automatically. Tier selection isn&rsquo;t manual anymore.
        </p>
        <div className="space-y-2">
          {REASONING_TIERS.map((tier, index) => {
            const config = AI_MODELS[tier.modelKey];
            const keyField = PROVIDER_KEY_FIELD[config.provider];
            const keyConfigured = keyField ? hasKey(keyField) : true;
            return (
              <div
                key={index}
                className="flex items-center justify-between p-3 bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 px-1.5 py-0.5 rounded">
                      Tier {index}
                    </span>
                    <span className="text-sm font-medium text-gray-900 dark:text-white">
                      {config.name}
                    </span>
                    <span className="text-[10px] uppercase tracking-wide text-gray-400 dark:text-gray-500">
                      {config.provider}
                    </span>
                    {!keyConfigured && (
                      <span className="text-[10px] bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 px-1.5 py-0.5 rounded-full flex items-center gap-1">
                        <DynamicIcon name="AlertTriangle" className="w-2.5 h-2.5" />
                        no key
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    {tier.note}
                  </p>
                </div>
                <div className="text-right text-xs text-gray-400 shrink-0">
                  <div>{(config.maxTokens / 1000).toFixed(0)}K context</div>
                  <div className="capitalize">{tier.reasoningEffort} effort</div>
                </div>
              </div>
            );
          })}
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Tiers with &ldquo;no key&rdquo; will automatically fall back to the
          next-lower tier until one has a configured key. Add provider keys
          in the API Keys tab.
        </p>
      </div>

      {/* Recent Reasoning Tier Calls */}
      {recentTierLogs.length > 0 && (
        <div className="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg space-y-2">
          <h4 className="text-sm font-medium text-gray-900 dark:text-white flex items-center gap-2">
            <DynamicIcon name="History" className="w-4 h-4" />
            Recent Tier Calls
          </h4>
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {recentTierLogs.map((log, i) => (
              <div
                key={`${log.timestamp}-${i}`}
                className="text-xs text-gray-500 dark:text-gray-400 font-mono"
              >
                {log.data?.describe || log.message}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Memory Size Slider */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Memory Size
          </label>
          <span className="text-sm text-purple-600 dark:text-purple-400 font-medium">
            {isCustomContextMode
              ? customMaxContext > 0
                ? `${(customMaxContext / 1000).toFixed(0)}K tokens`
                : "Custom"
              : `${(customMaxContext / 1000).toFixed(0)}K tokens`}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-green-600 dark:text-green-400 whitespace-nowrap">
            💰 Cheap
          </span>
          <div className="flex-1 relative">
            <div className="h-2 rounded-full bg-linear-to-r from-green-500 via-yellow-500 to-purple-600" />
            <div className="absolute top-0 left-0 right-0 h-2 flex justify-between px-0">
              {[8000, 16000, 36000, 72000, 120000, 200000, -1].map((val) => (
                <button
                  key={val}
                  onClick={() => {
                    if (val === -1) {
                      setIsCustomContextMode(true);
                      setCustomContextInput(
                        customMaxContext > 0 ? String(customMaxContext) : ""
                      );
                    } else {
                      setIsCustomContextMode(false);
                      setCustomMaxContext(val);
                      if (typeof window !== "undefined") {
                        localStorage.setItem("customMaxContext", String(val));
                      }
                    }
                  }}
                  className={`w-4 h-4 rounded-full border-2 -mt-1 transition-all ${
                    (val === -1 && isCustomContextMode) ||
                    (val !== -1 &&
                      !isCustomContextMode &&
                      customMaxContext === val)
                      ? "bg-white border-white scale-125 shadow-lg"
                      : "bg-gray-800 border-gray-500 hover:border-white hover:scale-110"
                  }`}
                  title={val === -1 ? "Custom" : `${(val / 1000).toFixed(0)}K`}
                />
              ))}
            </div>
            <div className="flex justify-between mt-3 text-[10px] text-gray-500 dark:text-gray-400">
              <span>8K</span>
              <span>16K</span>
              <span>36K</span>
              <span>72K</span>
              <span>120K</span>
              <span>200K</span>
              <span>⚙️</span>
            </div>
          </div>
          <span className="text-xs text-purple-600 dark:text-purple-400 whitespace-nowrap">
            🧠 Memory
          </span>
        </div>
        {isCustomContextMode && (
          <div className="flex items-center gap-2 mt-2 pl-16">
            <input
              type="number"
              value={customContextInput}
              onChange={(e) => {
                setCustomContextInput(e.target.value);
                const val = parseInt(e.target.value, 10) || 0;
                if (val > 0) {
                  setCustomMaxContext(val);
                  if (typeof window !== "undefined") {
                    localStorage.setItem("customMaxContext", String(val));
                  }
                }
              }}
              min="1000"
              step="1000"
              placeholder="Enter tokens..."
              className="w-32 px-2 py-1 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded text-sm text-center focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
            <span className="text-xs text-gray-500">tokens</span>
          </div>
        )}
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Lower = cheaper & faster • Higher = better story memory
        </p>
      </div>

      {/* Response Length Slider */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Response Length
          </label>
          <span className="text-sm text-purple-600 dark:text-purple-400 font-medium">
            {isCustomOutputMode
              ? customMaxOutput > 0
                ? `${(customMaxOutput / 1000).toFixed(0)}K tokens`
                : "Custom"
              : `${(customMaxOutput / 1000).toFixed(0)}K tokens`}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-green-600 dark:text-green-400 whitespace-nowrap">
            ⚡ Fast
          </span>
          <div className="flex-1 relative">
            <div className="h-2 rounded-full bg-linear-to-r from-green-500 via-blue-500 to-purple-600" />
            <div className="absolute top-0 left-0 right-0 h-2 flex justify-between px-0">
              {[1000, 2000, 4000, 8000, -1].map((val) => (
                <button
                  key={val}
                  onClick={() => {
                    if (val === -1) {
                      setIsCustomOutputMode(true);
                      setCustomOutputInput(
                        customMaxOutput > 0 ? String(customMaxOutput) : ""
                      );
                    } else {
                      setIsCustomOutputMode(false);
                      setCustomMaxOutput(val);
                      if (typeof window !== "undefined") {
                        localStorage.setItem("customMaxOutput", String(val));
                      }
                    }
                  }}
                  className={`w-4 h-4 rounded-full border-2 -mt-1 transition-all ${
                    (val === -1 && isCustomOutputMode) ||
                    (val !== -1 &&
                      !isCustomOutputMode &&
                      customMaxOutput === val)
                      ? "bg-white border-white scale-125 shadow-lg"
                      : "bg-gray-800 border-gray-500 hover:border-white hover:scale-110"
                  }`}
                  title={val === -1 ? "Custom" : `${(val / 1000).toFixed(0)}K`}
                />
              ))}
            </div>
            <div className="flex justify-between mt-3 text-[10px] text-gray-500 dark:text-gray-400">
              <span>1K</span>
              <span>2K</span>
              <span>4K</span>
              <span>8K</span>
              <span>⚙️</span>
            </div>
          </div>
          <span className="text-xs text-purple-600 dark:text-purple-400 whitespace-nowrap">
            📝 Length
          </span>
        </div>
        {isCustomOutputMode && (
          <div className="flex items-center gap-2 mt-2 pl-16">
            <input
              type="number"
              value={customOutputInput}
              onChange={(e) => {
                setCustomOutputInput(e.target.value);
                const val = parseInt(e.target.value, 10) || 0;
                if (val >= 1000) {
                  setCustomMaxOutput(val);
                  if (typeof window !== "undefined") {
                    localStorage.setItem("customMaxOutput", String(val));
                  }
                }
              }}
              min="1000"
              step="500"
              placeholder="Enter tokens..."
              className="w-32 px-2 py-1 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded text-sm text-center focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
            <span className="text-xs text-gray-500">tokens</span>
          </div>
        )}
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Lower = faster responses • Higher = longer story passages
        </p>
        <p className="text-xs text-amber-500/80 dark:text-amber-400/60 mt-1">
          ⚠️ Minimum 1000 tokens recommended. Some providers count prefill
          against output limit.
        </p>
      </div>

      {/* Sampling Settings - all reasoning tiers are Mistral/DeepInfra (Coins mode) */}
      <SamplingSettingsTab byokMode={false} hasOpenRouterKey={hasKey("openRouterKey")} />

      {/* Tool Calling Settings */}
      <div className="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg space-y-4">
        <h4 className="text-sm font-medium text-gray-900 dark:text-white flex items-center gap-2">
          <DynamicIcon name="Wrench" className="w-4 h-4" />
          Tool Calling
        </h4>

        <div className="space-y-1">
          <p className="text-sm text-gray-700 dark:text-gray-300">
            Tool calling is always enabled.
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            The AI can modify stats, inventory, and story state.
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            GM thinking display is always enabled.
          </p>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex-1">
            <p className="text-sm text-gray-700 dark:text-gray-300">
              Max Tool Rounds
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Higher = more state changes but slower generation
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                const newValue = Math.max(1, maxToolLoops - 1);
                setMaxToolLoops(newValue);
                if (typeof window !== "undefined") {
                  localStorage.setItem("maxToolLoops", String(newValue));
                }
              }}
              disabled={maxToolLoops <= 1}
              className="w-8 h-8 flex items-center justify-center rounded bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              -
            </button>
            <span className="w-8 text-center font-medium text-gray-900 dark:text-white">
              {maxToolLoops}
            </span>
            <button
              onClick={() => {
                const newValue = Math.min(50, maxToolLoops + 1);
                setMaxToolLoops(newValue);
                if (typeof window !== "undefined") {
                  localStorage.setItem("maxToolLoops", String(newValue));
                }
              }}
              disabled={maxToolLoops >= 50}
              className="w-8 h-8 flex items-center justify-center rounded bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              +
            </button>
          </div>
        </div>
      </div>

      {/* Semantic Search (Embeddings) Section */}
      <div className="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg space-y-4">
        <h4 className="text-sm font-medium text-gray-900 dark:text-white flex items-center gap-2">
          <DynamicIcon name="Search" className="w-4 h-4" />
          Semantic Search
        </h4>

        <div className="flex items-center justify-between">
          <div className="flex-1">
            <p className="text-sm text-gray-700 dark:text-gray-300">
              Enable Embeddings
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Use AI to find relevant lore and memories contextually
            </p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={embeddingsEnabled}
              onChange={(e) => {
                const newValue = e.target.checked;
                setEmbeddingsEnabled(newValue);
                if (typeof window !== "undefined") {
                  localStorage.setItem("embeddingsEnabled", String(newValue));
                }
              }}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-purple-500 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:start-0.5 after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-purple-600" />
          </label>
        </div>

        {embeddingsEnabled && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm text-gray-700 dark:text-gray-300">
                Similarity Threshold
              </label>
              <span className="text-sm text-purple-600 dark:text-purple-400 font-medium">
                {embeddingThreshold.toFixed(2)}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-blue-600 dark:text-blue-400 whitespace-nowrap">
                🌊 Relaxed
              </span>
              <input
                type="range"
                min="0.1"
                max="0.5"
                step="0.05"
                value={embeddingThreshold}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  setEmbeddingThreshold(val);
                  if (typeof window !== "undefined") {
                    localStorage.setItem("embeddingThreshold", String(val));
                  }
                }}
                className="flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-purple-500"
              />
              <span className="text-xs text-green-600 dark:text-green-400 whitespace-nowrap">
                🎯 Precise
              </span>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Lower = more results (broader matching) • Higher = fewer results
              (stricter matching)
            </p>
          </div>
        )}

        <div className="p-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
          <p className="text-xs text-blue-700 dark:text-blue-300 flex items-start gap-1.5">
            <DynamicIcon name="Info" className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span>
              When enabled, uses Mistral embeddings to semantically search lore
              and memories for more relevant context. Cost: ~0.5 coins per 100
              turns.
            </span>
          </p>
        </div>
      </div>

      {/* Role Affirmation (Prefill) Section */}
      <div className="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg space-y-4">
        <h4 className="text-sm font-medium text-gray-900 dark:text-white flex items-center gap-2">
          <DynamicIcon name="MessageSquare" className="w-4 h-4" />
          Role Affirmation
        </h4>

        <div className="flex items-center justify-between">
          <div className="flex-1">
            <p className="text-sm text-gray-700 dark:text-gray-300">
              Enable Prefill Messages
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Prime AI to follow output format by adding commitment messages
            </p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={usePrefill}
              onChange={(e) => {
                const newValue = e.target.checked;
                setUsePrefill(newValue);
                if (typeof window !== "undefined") {
                  localStorage.setItem("usePrefill", String(newValue));
                }
              }}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-purple-500 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:start-0.5 after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-purple-600" />
          </label>
        </div>

        <div className="p-2 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg">
          <p className="text-xs text-purple-700 dark:text-purple-300 flex items-start gap-1.5">
            <DynamicIcon
              name="Sparkles"
              className="w-3.5 h-3.5 mt-0.5 shrink-0"
            />
            <span>
              Adds assistant messages like &ldquo;Understood. I will follow the
              rules...&rdquo; before generation. This technique improves output
              consistency by making the AI &ldquo;commit&rdquo; to constraints.
              Disable for A/B testing.
            </span>
          </p>
        </div>
      </div>

      {/* NovelAI Section */}
      <div className="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-medium text-gray-900 dark:text-white flex items-center gap-2">
            <span>📖</span> NovelAI (Story Stage)
          </h4>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={novelaiEnabled}
              onChange={(e) => setNovelaiEnabled(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-purple-500 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:start-0.5 after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-purple-600" />
          </label>
        </div>

        <p className="text-xs text-gray-500 dark:text-gray-400">
          Use your NovelAI API key for story generation. Tools and choices will
          still use the reasoning-tier router.
        </p>

        {novelaiEnabled && (
          <>
            {!hasKey("novelaiKey") && (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                ⚠️ Enter your NovelAI API key in the AI Models tab to use this
                feature
              </p>
            )}

            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                Temperature: {novelaiTemperature.toFixed(2)}
              </label>
              <input
                type="range"
                min="0.1"
                max="2"
                step="0.05"
                value={novelaiTemperature}
                onChange={(e) =>
                  setNovelaiTemperature(parseFloat(e.target.value))
                }
                className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-purple-500"
              />
              <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mt-1">
                <span>Focused</span>
                <span>Balanced</span>
                <span>Creative</span>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
