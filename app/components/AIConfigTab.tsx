"use client";

import { useState, useEffect, useCallback } from "react";
import { useAPIKeys, APIKeys } from "@/app/misc/APIKeysContext";
import { DynamicIcon } from "./DynamicIcon";
import { getModelConfig } from "@/app/misc/ai_prices";
import {
  REASONING_TIERS,
  NARRATION_MODEL_KEY,
  ReasoningEffort,
  TierOverride,
  getTierOverrides,
  setTierOverride,
  resetTierOverrides,
  getNarrationModelOverride,
  setNarrationModelOverride,
} from "@/app/misc/reasoningTiers";
import {
  getUserSettings,
  updateUserSettings,
  AIConfig,
  CustomModel,
  getCustomModels,
  addCustomModel,
  removeCustomModel,
} from "@/app/misc/user_settings";
import { logger, LogEntry } from "@/app/misc/logger";
import SamplingSettingsTab from "./SamplingSettingsTab";
import ModelSelect from "./ModelSelect";
import TurnCostPanel from "./TurnCostPanel";
import { notifyTurnCostInputsChanged } from "@/app/misc/turnCost";

// Maps an AI_MODELS provider string to the APIKeys field that must be
// configured for that provider - used to flag tiers with a missing key.
const PROVIDER_KEY_FIELD: Record<string, keyof APIKeys | undefined> = {
  openrouter: "openRouterKey",
  deepseek: "deepseekKey",
  google: "googleKey",
  mistral: "mistralKey",
  deepinfra: "deepinfraKey",
};

const REASONING_EFFORTS: ReasoningEffort[] = [
  "none",
  "low",
  "normal",
  "high",
  "xhigh",
];

export default function AIConfigTab() {
  const { hasKey } = useAPIKeys();

  // Reasoning-tier + narration model overrides, and user-added custom
  // (OpenRouter BYOK) models. All persisted to localStorage - see
  // app/misc/reasoningTiers.ts and app/misc/user_settings.ts.
  const [tierOverrides, setTierOverridesState] = useState<
    (TierOverride | null)[]
  >(() => getTierOverrides());
  const [narrationOverride, setNarrationOverrideState] = useState<
    string | null
  >(() => getNarrationModelOverride());
  const [customModels, setCustomModelsState] = useState<CustomModel[]>(() =>
    getCustomModels(),
  );
  const [showAddCustomModel, setShowAddCustomModel] = useState(false);
  const [newModelName, setNewModelName] = useState("");
  const [newModelId, setNewModelId] = useState("");
  const [newModelContext, setNewModelContext] = useState(128000);
  const [newModelMaxOutput, setNewModelMaxOutput] = useState(8000);

  const refreshCustomModels = useCallback(
    () => setCustomModelsState(getCustomModels()),
    [],
  );
  useEffect(() => {
    window.addEventListener("custom-models-changed", refreshCustomModels);
    return () =>
      window.removeEventListener("custom-models-changed", refreshCustomModels);
  }, [refreshCustomModels]);

  const handleTierModelChange = (index: number, modelKey: string) => {
    const effort =
      tierOverrides[index]?.reasoningEffort ??
      REASONING_TIERS[index].reasoningEffort;
    setTierOverride(index, { modelKey, reasoningEffort: effort });
    setTierOverridesState(getTierOverrides());
  };

  const handleTierEffortChange = (index: number, effort: ReasoningEffort) => {
    const modelKey =
      tierOverrides[index]?.modelKey ?? REASONING_TIERS[index].modelKey;
    setTierOverride(index, { modelKey, reasoningEffort: effort });
    setTierOverridesState(getTierOverrides());
  };

  const handleResetTier = (index: number) => {
    setTierOverride(index, null);
    setTierOverridesState(getTierOverrides());
  };

  const handleResetAllTiers = () => {
    resetTierOverrides();
    setTierOverridesState(getTierOverrides());
  };

  const handleNarrationChange = (modelKey: string) => {
    const override = modelKey === NARRATION_MODEL_KEY ? null : modelKey;
    setNarrationModelOverride(override);
    setNarrationOverrideState(getNarrationModelOverride());
  };

  const handleAddCustomModel = () => {
    if (!newModelName.trim() || !newModelId.trim()) return;
    addCustomModel({
      name: newModelName.trim(),
      modelId: newModelId.trim(),
      contextSize: newModelContext,
      maxOutputTokens: newModelMaxOutput,
    });
    refreshCustomModels();
    setNewModelName("");
    setNewModelId("");
    setNewModelContext(128000);
    setNewModelMaxOutput(8000);
    setShowAddCustomModel(false);
  };

  const handleRemoveCustomModel = (id: string) => {
    removeCustomModel(id);
    refreshCustomModels();
    // Clear any tier/narration overrides that pointed at the removed model
    // so they cleanly fall back to defaults instead of dangling.
    tierOverrides.forEach((o, i) => {
      if (o?.modelKey === id) handleResetTier(i);
    });
    if (narrationOverride === id) handleNarrationChange(NARRATION_MODEL_KEY);
  };

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
  const [deAiifyWords, setDeAiifyWords] = useState(() => {
    if (typeof window !== "undefined") {
      // Default to true (enabled)
      return localStorage.getItem("deAiifyWords") !== "false";
    }
    return true;
  });
  const [replyLength, setReplyLength] = useState<"short" | "medium" | "long">(
    () => {
      if (typeof window !== "undefined") {
        const stored = localStorage.getItem("replyLength");
        if (stored === "short" || stored === "medium" || stored === "long") {
          return stored;
        }
      }
      return "medium";
    },
  );
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
            parseInt(stored, 10),
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
            l.message.startsWith("GM stage model unavailable"),
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
                config.customMaxContext.toString(),
              );
            }
            if (
              config.customMaxOutput !== undefined &&
              !localStorage.getItem("customMaxOutput")
            ) {
              setCustomMaxOutput(config.customMaxOutput);
              localStorage.setItem(
                "customMaxOutput",
                config.customMaxOutput.toString(),
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

  // Auto-save context settings (after initial load)
  useEffect(() => {
    if (typeof window !== "undefined" && hasLoadedSettings) {
      localStorage.setItem("customMaxContext", customMaxContext.toString());
      // Every GM round resends this whole budget, so it's the biggest single
      // lever on a turn's cost - let the cost panel above re-price itself.
      notifyTurnCostInputsChanged();
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

  const effectiveNarrationKey = narrationOverride || NARRATION_MODEL_KEY;

  return (
    <div className="space-y-6">
      {/* Narration Voice Banner */}
      <div className="bg-linear-to-r from-purple-600 to-blue-600 rounded-lg p-4 text-white space-y-2.5">
        <span className="inline-block text-[11px] font-semibold uppercase tracking-wide bg-white/20 px-2 py-0.5 rounded-full">
          Narration Voice
        </span>
        <ModelSelect
          value={effectiveNarrationKey}
          onChange={handleNarrationChange}
          customModels={customModels}
          className="w-full text-sm font-semibold bg-white/15 border border-white/30 rounded-md px-3 py-2 text-white [&>option]:text-gray-900"
        />
        <p className="text-xs text-white/75">
          Always used for player-facing prose, no matter which reasoning tier
          handles adjudication - this is what keeps the GM&rsquo;s voice
          consistent even during a boss fight.
        </p>
      </div>

      {/* Reasoning Tier Ladder */}
      {/* What the configuration above and below actually costs to play.
          Sits between the narration voice and the tier ladder on purpose -
          every control on this tab moves this number. */}
      <TurnCostPanel />

      <div className="p-4 bg-white/[0.03] backdrop-blur-md border border-white/10 rounded-lg space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-medium text-white flex items-center gap-2">
            <DynamicIcon name="Brain" className="w-4 h-4" />
            Reasoning Tiers
          </h4>
          {tierOverrides.some((o) => o !== null) && (
            <button
              onClick={handleResetAllTiers}
              className="text-xs text-purple-300 hover:text-purple-200"
            >
              Reset all to defaults
            </button>
          )}
        </div>
        <p className="text-xs text-blue-300/60">
          The GM automatically escalates through these tiers per turn based on
          what&rsquo;s happening - banter runs cheap, combat and boss fights
          escalate automatically. Pick which model/effort fills each tier below,
          mixing any provider you like.
        </p>
        <div className="space-y-2">
          {REASONING_TIERS.map((defaultTier, index) => {
            const override = tierOverrides[index];
            const tier = override ?? defaultTier;
            const config = getModelConfig(tier.modelKey);
            const keyField = PROVIDER_KEY_FIELD[config.provider];
            const keyConfigured = keyField ? hasKey(keyField) : true;
            return (
              <div
                key={index}
                className="p-3 bg-white/5 rounded-lg border border-white/10 space-y-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="shrink-0 flex items-center justify-center w-5 h-5 rounded-full bg-purple-500/15 text-purple-300 text-[11px] font-bold">
                      {index}
                    </span>
                    <span className="text-[10px] font-medium uppercase tracking-wide text-blue-300/50 truncate">
                      {config.provider}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {!keyConfigured && (
                      <span
                        title="No API key configured for this provider"
                        className="flex items-center gap-1 text-[10px] text-amber-300"
                      >
                        <DynamicIcon name="AlertTriangle" className="w-3 h-3" />
                        No key
                      </span>
                    )}
                    {override && (
                      <button
                        onClick={() => handleResetTier(index)}
                        className="text-[10px] text-purple-300 hover:text-purple-200 hover:underline"
                        title="Reset this tier to its default model"
                      >
                        Reset
                      </button>
                    )}
                  </div>
                </div>
                <p className="text-xs text-blue-300/60">
                  {defaultTier.note}
                </p>
                <div className="flex items-center gap-2">
                  <ModelSelect
                    value={tier.modelKey}
                    onChange={(modelKey) =>
                      handleTierModelChange(index, modelKey)
                    }
                    customModels={customModels}
                    requireToolCalling
                    className="flex-1 min-w-0 text-xs bg-white/5 border border-white/10 rounded-md px-2 py-1.5 text-white"
                  />
                  <select
                    value={tier.reasoningEffort}
                    onChange={(e) =>
                      handleTierEffortChange(
                        index,
                        e.target.value as ReasoningEffort,
                      )
                    }
                    className="w-24 shrink-0 text-xs bg-white/5 border border-white/10 rounded-md px-2 py-1.5 text-white capitalize"
                  >
                    {REASONING_EFFORTS.map((effort) => (
                      <option key={effort} value={effort}>
                        {effort}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            );
          })}
        </div>
        <p className="text-xs text-blue-300/60">
          Tiers with &ldquo;no key&rdquo; will automatically fall back to the
          next-lower tier until one has a configured key. Add provider keys in
          the API Keys tab.
        </p>
      </div>

      {/* Custom Models */}
      <div className="p-4 bg-white/[0.03] backdrop-blur-md border border-white/10 rounded-lg space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-medium text-white flex items-center gap-2">
            <DynamicIcon name="Plus" className="w-4 h-4" />
            Custom Models
          </h4>
          <button
            onClick={() => setShowAddCustomModel((v) => !v)}
            className="text-xs text-purple-300 hover:text-purple-200"
          >
            {showAddCustomModel ? "Cancel" : "+ Add model"}
          </button>
        </div>
        <p className="text-xs text-blue-300/60">
          Register any OpenRouter model ID to use it for narration or any
          reasoning tier above, in addition to the built-in models. Requires an
          OpenRouter key in the API Keys tab.
        </p>

        {customModels.length > 0 && (
          <div className="space-y-1.5">
            {customModels.map((m) => (
              <div
                key={m.id}
                className="flex items-center justify-between gap-2 p-2 bg-white/5 rounded-lg border border-white/10"
              >
                <div className="min-w-0">
                  <div className="text-sm text-white truncate">
                    {m.name}
                  </div>
                  <div className="text-xs text-blue-300/40 font-mono truncate">
                    {m.modelId}
                  </div>
                </div>
                <button
                  onClick={() => handleRemoveCustomModel(m.id)}
                  className="text-blue-300/50 hover:text-red-400 shrink-0"
                  title="Remove custom model"
                >
                  <DynamicIcon name="Trash2" className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        {showAddCustomModel && (
          <div className="space-y-2 p-3 bg-white/5 rounded-lg border border-white/10">
            <input
              type="text"
              value={newModelName}
              onChange={(e) => setNewModelName(e.target.value)}
              placeholder="Display name (e.g. Claude Opus)"
              className="w-full px-2 py-1 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
            <input
              type="text"
              value={newModelId}
              onChange={(e) => setNewModelId(e.target.value)}
              placeholder="OpenRouter model ID (e.g. anthropic/claude-opus-4.1)"
              className="w-full px-2 py-1 bg-white/5 border border-white/10 rounded-lg text-sm font-mono text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
            <div className="flex items-center gap-2">
              <label className="text-xs text-blue-300/60 flex-1">
                Context size
                <input
                  type="number"
                  value={newModelContext}
                  onChange={(e) =>
                    setNewModelContext(parseInt(e.target.value, 10) || 0)
                  }
                  min="1000"
                  step="1000"
                  className="w-full mt-0.5 px-2 py-1 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </label>
              <label className="text-xs text-blue-300/60 flex-1">
                Max output tokens
                <input
                  type="number"
                  value={newModelMaxOutput}
                  onChange={(e) =>
                    setNewModelMaxOutput(parseInt(e.target.value, 10) || 0)
                  }
                  min="500"
                  step="500"
                  className="w-full mt-0.5 px-2 py-1 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </label>
            </div>
            <button
              onClick={handleAddCustomModel}
              disabled={!newModelName.trim() || !newModelId.trim()}
              className="w-full py-1.5 bg-linear-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 disabled:opacity-40 disabled:from-white/10 disabled:to-white/10 disabled:cursor-not-allowed text-white text-sm rounded-lg shadow-md shadow-purple-950/40 transition-all"
            >
              Add model
            </button>
          </div>
        )}
      </div>

      {/* Recent Reasoning Tier Calls */}
      {recentTierLogs.length > 0 && (
        <div className="p-4 bg-white/[0.03] backdrop-blur-md border border-white/10 rounded-lg space-y-2">
          <h4 className="text-sm font-medium text-white flex items-center gap-2">
            <DynamicIcon name="History" className="w-4 h-4" />
            Recent Tier Calls
          </h4>
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {recentTierLogs.map((log, i) => (
              <div
                key={`${log.timestamp}-${i}`}
                className="text-xs text-blue-300/60 font-mono"
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
          <label className="text-sm font-medium text-blue-200/80">
            Memory Size
          </label>
          <span className="text-sm text-purple-300 font-medium">
            {isCustomContextMode
              ? customMaxContext > 0
                ? `${(customMaxContext / 1000).toFixed(0)}K tokens`
                : "Custom"
              : `${(customMaxContext / 1000).toFixed(0)}K tokens`}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-green-400 whitespace-nowrap">
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
                        customMaxContext > 0 ? String(customMaxContext) : "",
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
                      : "bg-white/10 border-white/30 hover:border-white hover:scale-110"
                  }`}
                  title={val === -1 ? "Custom" : `${(val / 1000).toFixed(0)}K`}
                />
              ))}
            </div>
            <div className="flex justify-between mt-3 text-[10px] text-blue-300/50">
              <span>8K</span>
              <span>16K</span>
              <span>36K</span>
              <span>72K</span>
              <span>120K</span>
              <span>200K</span>
              <span>⚙️</span>
            </div>
          </div>
          <span className="text-xs text-purple-300 whitespace-nowrap">
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
              className="w-32 px-2 py-1 bg-white/5 border border-white/10 rounded-lg text-sm text-white text-center focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
            <span className="text-xs text-blue-300/50">tokens</span>
          </div>
        )}
        <p className="text-xs text-blue-300/60">
          Lower = cheaper & faster • Higher = better story memory
        </p>
      </div>

      {/* Response Length Slider */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-blue-200/80">
            Response Length
          </label>
          <span className="text-sm text-purple-300 font-medium">
            {isCustomOutputMode
              ? customMaxOutput > 0
                ? `${(customMaxOutput / 1000).toFixed(0)}K tokens`
                : "Custom"
              : `${(customMaxOutput / 1000).toFixed(0)}K tokens`}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-green-400 whitespace-nowrap">
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
                        customMaxOutput > 0 ? String(customMaxOutput) : "",
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
                      : "bg-white/10 border-white/30 hover:border-white hover:scale-110"
                  }`}
                  title={val === -1 ? "Custom" : `${(val / 1000).toFixed(0)}K`}
                />
              ))}
            </div>
            <div className="flex justify-between mt-3 text-[10px] text-blue-300/50">
              <span>1K</span>
              <span>2K</span>
              <span>4K</span>
              <span>8K</span>
              <span>⚙️</span>
            </div>
          </div>
          <span className="text-xs text-purple-300 whitespace-nowrap">
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
              className="w-32 px-2 py-1 bg-white/5 border border-white/10 rounded-lg text-sm text-white text-center focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
            <span className="text-xs text-blue-300/50">tokens</span>
          </div>
        )}
        <p className="text-xs text-blue-300/60">
          Lower = faster responses • Higher = longer story passages
        </p>
        <p className="text-xs text-amber-400/70 mt-1">
          ⚠️ Minimum 1000 tokens recommended. Some providers count prefill
          against output limit.
        </p>
      </div>

      {/* Sampling Settings - all reasoning tiers are Mistral/DeepInfra (Coins mode) */}
      <SamplingSettingsTab
        byokMode={false}
        hasOpenRouterKey={hasKey("openRouterKey")}
      />

      {/* Tool Calling Settings */}
      <div className="p-4 bg-white/[0.03] backdrop-blur-md border border-white/10 rounded-lg space-y-4">
        <h4 className="text-sm font-medium text-white flex items-center gap-2">
          <DynamicIcon name="Wrench" className="w-4 h-4" />
          Tool Calling
        </h4>

        <div className="space-y-1">
          <p className="text-sm text-blue-100">
            Tool calling is always enabled.
          </p>
          <p className="text-xs text-blue-300/60">
            The AI can modify stats, inventory, and story state.
          </p>
          <p className="text-xs text-blue-300/60">
            GM thinking display is always enabled.
          </p>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex-1">
            <p className="text-sm text-blue-100">
              Max Tool Rounds
            </p>
            <p className="text-xs text-blue-300/60">
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
                  notifyTurnCostInputsChanged();
                }
              }}
              disabled={maxToolLoops <= 1}
              className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/5 text-blue-200 hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              -
            </button>
            <span className="w-8 text-center font-medium text-white">
              {maxToolLoops}
            </span>
            <button
              onClick={() => {
                const newValue = Math.min(50, maxToolLoops + 1);
                setMaxToolLoops(newValue);
                if (typeof window !== "undefined") {
                  localStorage.setItem("maxToolLoops", String(newValue));
                  notifyTurnCostInputsChanged();
                }
              }}
              disabled={maxToolLoops >= 50}
              className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/5 text-blue-200 hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              +
            </button>
          </div>
        </div>
      </div>

      {/* Semantic Search (Embeddings) Section */}
      <div className="p-4 bg-white/[0.03] backdrop-blur-md border border-white/10 rounded-lg space-y-4">
        <h4 className="text-sm font-medium text-white flex items-center gap-2">
          <DynamicIcon name="Search" className="w-4 h-4" />
          Semantic Search
        </h4>

        <div className="flex items-center justify-between">
          <div className="flex-1">
            <p className="text-sm text-blue-100">
              Enable Embeddings
            </p>
            <p className="text-xs text-blue-300/60">
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
            <div className="w-11 h-6 bg-white/10 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-purple-500 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:start-0.5 after:bg-white after:border-white/20 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-linear-to-r peer-checked:from-purple-600 peer-checked:to-blue-600" />
          </label>
        </div>

        {embeddingsEnabled && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm text-blue-100">
                Similarity Threshold
              </label>
              <span className="text-sm text-purple-300 font-medium">
                {embeddingThreshold.toFixed(2)}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-blue-300 whitespace-nowrap">
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
                className="flex-1 h-2 bg-white/10 rounded-lg appearance-none cursor-pointer accent-purple-500"
              />
              <span className="text-xs text-green-400 whitespace-nowrap">
                🎯 Precise
              </span>
            </div>
            <p className="text-xs text-blue-300/60">
              Lower = more results (broader matching) • Higher = fewer results
              (stricter matching)
            </p>
          </div>
        )}

        <div className="p-2 bg-blue-500/[0.06] border border-blue-400/20 rounded-lg">
          <p className="text-xs text-blue-200/80 flex items-start gap-1.5">
            <DynamicIcon name="Info" className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span>
              When enabled, uses Mistral embeddings to semantically search lore
              and memories for more relevant context. Cost: ~0.5 coins per 100
              turns.
            </span>
          </p>
        </div>
      </div>

      {/* Reply Length Section */}
      <div className="p-4 bg-white/[0.03] backdrop-blur-md border border-white/10 rounded-lg space-y-4">
        <h4 className="text-sm font-medium text-white flex items-center gap-2">
          <DynamicIcon name="AlignLeft" className="w-4 h-4" />
          Reply Length
        </h4>

        <div>
          <p className="text-xs text-blue-300/60 mb-2">
            How much prose the narrator writes per turn. Shorter keeps the
            roleplay snappy and back-and-forth; longer writes fuller scenes.
          </p>
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                { value: "short", label: "Short", hint: "1 sentence" },
                { value: "medium", label: "Medium", hint: "1-2 sentences" },
                { value: "long", label: "Long", hint: "~1 paragraph" },
              ] as const
            ).map((opt) => {
              const active = replyLength === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => {
                    setReplyLength(opt.value);
                    if (typeof window !== "undefined") {
                      localStorage.setItem("replyLength", opt.value);
                    }
                  }}
                  className={`flex flex-col items-center justify-center gap-0.5 py-2 px-1 rounded-lg border text-sm transition-all ${
                    active
                      ? "bg-linear-to-r from-purple-600 to-blue-600 border-transparent text-white shadow-md shadow-purple-950/40"
                      : "bg-white/5 border-white/10 text-blue-200/70 hover:border-purple-400/40"
                  }`}
                >
                  <span className="font-medium">{opt.label}</span>
                  <span
                    className={`text-[10px] ${
                      active ? "text-purple-100" : "text-blue-300/50"
                    }`}
                  >
                    {opt.hint}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Role Affirmation (Prefill) Section */}
      <div className="p-4 bg-white/[0.03] backdrop-blur-md border border-white/10 rounded-lg space-y-4">
        <h4 className="text-sm font-medium text-white flex items-center gap-2">
          <DynamicIcon name="MessageSquare" className="w-4 h-4" />
          Role Affirmation
        </h4>

        <div className="flex items-center justify-between">
          <div className="flex-1">
            <p className="text-sm text-blue-100">
              Enable Prefill Messages
            </p>
            <p className="text-xs text-blue-300/60">
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
            <div className="w-11 h-6 bg-white/10 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-purple-500 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:start-0.5 after:bg-white after:border-white/20 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-linear-to-r peer-checked:from-purple-600 peer-checked:to-blue-600" />
          </label>
        </div>

        <div className="p-2 bg-purple-500/[0.06] border border-purple-400/20 rounded-lg">
          <p className="text-xs text-purple-200/80 flex items-start gap-1.5">
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

      {/* De-AI-ify Prose Section */}
      <div className="p-4 bg-white/[0.03] backdrop-blur-md border border-white/10 rounded-lg space-y-4">
        <h4 className="text-sm font-medium text-white flex items-center gap-2">
          <DynamicIcon name="Wand2" className="w-4 h-4" />
          De-AI-ify Prose
        </h4>

        <div className="flex items-center justify-between">
          <div className="flex-1">
            <p className="text-sm text-blue-100">
              Swap Out AI Vocabulary Tics
            </p>
            <p className="text-xs text-blue-300/60">
              Randomly replaces words the AI overuses (ozone, palpable,
              tapestry, testament, ...) with plainer synonyms
            </p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={deAiifyWords}
              onChange={(e) => {
                const newValue = e.target.checked;
                setDeAiifyWords(newValue);
                if (typeof window !== "undefined") {
                  localStorage.setItem("deAiifyWords", String(newValue));
                }
              }}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-white/10 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-purple-500 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:start-0.5 after:bg-white after:border-white/20 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-linear-to-r peer-checked:from-purple-600 peer-checked:to-blue-600" />
          </label>
        </div>

        <div className="p-2 bg-purple-500/[0.06] border border-purple-400/20 rounded-lg">
          <p className="text-xs text-purple-200/80 flex items-start gap-1.5">
            <DynamicIcon
              name="Sparkles"
              className="w-3.5 h-3.5 mt-0.5 shrink-0"
            />
            <span>
              Each flagged word has a chance to stay as-is, so the swap
              doesn&rsquo;t read as a mechanical find-and-replace.
            </span>
          </p>
        </div>
      </div>

    </div>
  );
}
