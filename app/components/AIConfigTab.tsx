"use client";

import { useState, useEffect, useCallback } from "react";
import { useAPIKeys, APIKeys } from "@/app/misc/APIKeysContext";
import { DynamicIcon } from "./DynamicIcon";
import { getModelConfig } from "@/app/misc/ai_prices";
import {
  REASONING_TIERS,
  REASONING_EFFORTS,
  REASONING_CONFIG_CHANGED_EVENT,
  ModelSlot,
  SLOT_TIERS,
  getSlotOverride,
  setSlotOverride,
  getDefaultSlotMix,
  getTierModelDisplayName,
  isReasoningEffort,
} from "@/app/misc/reasoningTiers";
import { SYNC_COMPLETED_EVENT } from "@/app/misc/syncManager";
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
import { SideAgentPickers } from "./ArchitectureSettingsTab";
import ClaudeSubscriptionPanel, {
  useClaudeCliStatus,
  useOnlineSessionActive,
} from "./ClaudeSubscriptionPanel";
import { notifyTurnCostInputsChanged } from "@/app/misc/turnCost";
import {
  describeClaudeCliStatus,
  isClaudeCliAvailablePlatform,
  isClaudeCliUsable,
} from "@/app/misc/claudeCliModels";

// Maps an AI_MODELS provider string to the APIKeys field that must be
// configured for that provider - used to flag slots with a missing key.
const PROVIDER_KEY_FIELD: Record<string, keyof APIKeys | undefined> = {
  openrouter: "openRouterKey",
  deepseek: "deepseekKey",
  google: "googleKey",
  mistral: "mistralKey",
  deepinfra: "deepinfraKey",
  zai: "zaiKey",
};

/**
 * One slot of the Models card (decisions 118-124): a model, an effort, the
 * "No key" and subscription badges, and Reset once the player has chosen. The
 * slot writes every tier entry it owns (setSlotOverride), and re-reads on a
 * config change and on an incoming sync, which writes localStorage directly.
 */
export function ModelSlotRow({
  slot,
  title,
  description,
  customModels,
}: {
  slot: ModelSlot;
  title: string;
  description: string;
  customModels: CustomModel[];
}) {
  const { hasKey } = useAPIKeys();
  const cliStatus = useClaudeCliStatus();
  const onlineSession = useOnlineSessionActive();
  const [, setVersion] = useState(0);
  useEffect(() => {
    const refresh = () => setVersion((n) => n + 1);
    window.addEventListener(REASONING_CONFIG_CHANGED_EVENT, refresh);
    window.addEventListener(SYNC_COMPLETED_EVENT, refresh);
    return () => {
      window.removeEventListener(REASONING_CONFIG_CHANGED_EVENT, refresh);
      window.removeEventListener(SYNC_COMPLETED_EVENT, refresh);
    };
  }, []);

  // Default is tier 1 and only tier 1 (the baseline); Advanced is tier 3.
  const override = getSlotOverride(slot);
  const shipped =
    REASONING_TIERS[slot === "default" ? 1 : REASONING_TIERS.length - 1];
  const shown = override ?? shipped;
  const mix = slot === "default" ? getDefaultSlotMix() : [];

  const config = getModelConfig(shown.modelKey);
  const isSubscription = config.provider === "claude-cli";
  const keyField = PROVIDER_KEY_FIELD[config.provider];
  const keyConfigured = keyField ? hasKey(keyField) : true;
  // A subscription slot needs no key but a signed-in CLI, and the turn stops
  // (no fallback to a paid model) when it has none.
  const cliProblem = !isSubscription
    ? null
    : !isClaudeCliAvailablePlatform()
      ? "Desktop only"
      : onlineSession
        ? "Not used online"
        : isClaudeCliUsable(cliStatus)
          ? null
          : describeClaudeCliStatus(cliStatus);

  return (
    <div className="p-3 bg-white/5 rounded-lg border border-white/10 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-medium text-white">{title}</span>
          <span className="text-[10px] font-medium uppercase tracking-wide text-blue-300/50 truncate">
            {isSubscription ? "claude subscription" : config.provider}
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
          {cliProblem && (
            <span
              title="This slot runs through the claude CLI on your Claude plan - see Claude subscription below"
              className="flex items-center gap-1 text-[10px] text-amber-300"
            >
              <DynamicIcon name="TriangleAlert" className="w-3 h-3" />
              {cliProblem}
            </span>
          )}
          {override && (
            <button
              onClick={() => {
                setSlotOverride(slot, null);
                setVersion((n) => n + 1);
              }}
              className="text-[10px] text-purple-300 hover:text-purple-200 hover:underline"
              title={`Reset ${title} to its default model`}
            >
              Reset
            </button>
          )}
        </div>
      </div>
      <p className="text-xs text-blue-300/60">{description}</p>
      <div className="flex items-center gap-2">
        <ModelSelect
          value={shown.modelKey}
          onChange={(modelKey) => {
            setSlotOverride(slot, {
              modelKey,
              reasoningEffort: shown.reasoningEffort,
            });
            setVersion((n) => n + 1);
          }}
          customModels={customModels}
          requireToolCalling
          className="flex-1 min-w-0 text-xs bg-white/5 border border-white/10 rounded-md px-2 py-1.5 text-white"
        />
        <select
          aria-label={`${title} effort`}
          value={shown.reasoningEffort}
          onChange={(e) => {
            if (!isReasoningEffort(e.target.value)) return;
            setSlotOverride(slot, {
              modelKey: shown.modelKey,
              reasoningEffort: e.target.value,
            });
            setVersion((n) => n + 1);
          }}
          className="w-24 shrink-0 text-xs bg-white/5 border border-white/10 rounded-md px-2 py-1.5 text-white capitalize"
        >
          {REASONING_EFFORTS.map((effort) => (
            <option key={effort} value={effort}>
              {effort}
            </option>
          ))}
        </select>
      </div>
      {mix.length > 0 && (
        <p className="text-xs text-amber-300/80">
          Mixed:{" "}
          {mix
            .map(
              (m) =>
                `tier ${m.tier} runs ${getTierModelDisplayName(m.modelKey)}`,
            )
            .join(", ")}
          . Saving here sets all three.
        </p>
      )}
    </div>
  );
}

export default function AIConfigTab() {
  const { hasKey } = useAPIKeys();

  // User-added custom (OpenRouter BYOK) models, persisted to localStorage - see
  // app/misc/user_settings.ts. The Default and Advanced slots are read by
  // ModelSlotRow itself (app/misc/reasoningTiers.ts).
  const [customModels, setCustomModelsState] = useState<CustomModel[]>(() =>
    getCustomModels(),
  );
  const [showAddCustomModel, setShowAddCustomModel] = useState(false);
  const [newModelName, setNewModelName] = useState("");
  const [newModelId, setNewModelId] = useState("");
  const [newModelContext, setNewModelContext] = useState(128000);
  const [newModelMaxOutput, setNewModelMaxOutput] = useState(8000);

  // The side-agent pickers read their state once; an incoming sync remounts
  // them (key) so a choice made on another device shows without reopening.
  const [syncTick, setSyncTick] = useState(0);
  useEffect(() => {
    const bump = () => setSyncTick((n) => n + 1);
    window.addEventListener(SYNC_COMPLETED_EVENT, bump);
    return () => window.removeEventListener(SYNC_COMPLETED_EVENT, bump);
  }, []);

  const refreshCustomModels = useCallback(
    () => setCustomModelsState(getCustomModels()),
    [],
  );
  useEffect(() => {
    window.addEventListener("custom-models-changed", refreshCustomModels);
    return () =>
      window.removeEventListener("custom-models-changed", refreshCustomModels);
  }, [refreshCustomModels]);

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
    // Clear any slot choice that pointed at the removed model so it cleanly
    // falls back to the slot's default instead of dangling.
    (Object.keys(SLOT_TIERS) as ModelSlot[]).forEach((slot) => {
      if (getSlotOverride(slot)?.modelKey === id) setSlotOverride(slot, null);
    });
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

  return (
    <div className="space-y-6">
      {/* What the configuration below actually costs to play. Sits above the
          Models card on purpose - every control on this tab moves this
          number. */}
      <TurnCostPanel />

      <div className="p-4 bg-white/[0.03] backdrop-blur-md border border-white/10 rounded-lg space-y-3">
        <h4 className="text-sm font-medium text-white flex items-center gap-2">
          <DynamicIcon name="Brain" className="w-4 h-4" />
          Models
        </h4>
        <div className="space-y-2">
          <ModelSlotRow
            slot="default"
            title="Default"
            description="Everyday turns, combat and rules, and the story's prose. Combat and rules always think at high or more."
            customModels={customModels}
          />
          <ModelSlotRow
            slot="advanced"
            title="Advanced"
            description="Session zero, boss fights, deadly stakes and campaign-shaping moments. The game switches to it by itself."
            customModels={customModels}
          />
        </div>
        <p className="text-xs text-blue-300/60">
          A slot whose model has no key can&rsquo;t run. Pick a model you have a
          key for. Add provider keys in the API Keys tab.
        </p>
      </div>

      <ClaudeSubscriptionPanel />

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
          Register any OpenRouter model ID to use it for Default or Advanced
          above, in addition to the built-in models. Requires an
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

      {/* Advanced settings: the side agents and the tier log. Closed by
          default (decision 121). */}
      <details className="p-4 bg-white/[0.03] backdrop-blur-md border border-white/10 rounded-lg">
        <summary className="cursor-pointer select-none text-sm font-medium text-white flex items-center gap-2">
          <DynamicIcon name="Settings" className="w-4 h-4" />
          Advanced settings
        </summary>
        <div className="mt-4 space-y-6">
          <SideAgentPickers key={syncTick} customModels={customModels} />

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
        </div>
      </details>

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

      {/* Sampling Settings - only some providers accept these parameters */}
      <SamplingSettingsTab
        hasSamplingCapableKey={
          hasKey("openRouterKey") ||
          hasKey("mistralKey") ||
          hasKey("deepinfraKey")
        }
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
              and memories for more relevant context. Billed to your own
              Mistral key - a fraction of a cent per hundred turns.
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
