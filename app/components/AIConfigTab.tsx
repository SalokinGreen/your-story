"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/app/misc/AuthContext";
import { useAPIKeys } from "@/app/misc/APIKeysContext";
import { useNotification } from "@/app/misc/NotificationContext";
import { DynamicIcon } from "./DynamicIcon";
import {
  AI_MODELS,
  MODEL_PRESETS,
  getPresetEstimatedCost,
  getCustomEstimatedCost,
  getStoryStageCost,
  getModelConfig,
} from "@/app/misc/ai_prices";
import {
  getUserSettings,
  updateUserSettings,
  CustomModel,
  AIConfig,
} from "@/app/misc/user_settings";
import { supabase } from "@/app/misc/supabase";
import SamplingSettingsTab from "./SamplingSettingsTab";

export default function AIConfigTab() {
  const { user } = useAuth();
  const { keys, hasKey } = useAPIKeys();
  const { addNotification } = useNotification();

  // BYOK Mode toggle - true = use own keys, false = use coins
  const [byokMode, setByokMode] = useState(() => {
    if (typeof window !== "undefined") {
      // Default to BYOK if user has any keys configured
      const stored = localStorage.getItem("byokMode");
      if (stored !== null) return stored === "true";
      return true; // Default to BYOK for now
    }
    return true;
  });

  const [currentPreset, setCurrentPreset] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("aiPreset") || "custom";
    }
    return "custom";
  });

  // Model configuration - direct model selection (no presets)
  const [storyModel, setStoryModel] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("aiModelStory") || "mistralSmall";
    }
    return "mistralSmall";
  });
  const [toolsModel, setToolsModel] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("aiModelTools") || "mistralSmall";
    }
    return "mistralSmall";
  });
  const [choicesModel, setChoicesModel] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("aiModelChoices") || "";
    }
    return "";
  });

  // Advanced toggle states
  const [advancedTools, setAdvancedTools] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("advancedTools") === "true";
    }
    return false;
  });
  const [advancedChoices, setAdvancedChoices] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("advancedChoices") === "true";
    }
    return false;
  });

  // Generation settings
  const [toolCallingEnabled, setToolCallingEnabled] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("toolCallingEnabled") !== "false";
    }
    return true;
  });
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
  // GM Stage is now always enabled - removed the toggle
  // Keeping displayGMThinking for showing/hiding GM reasoning in UI
  const [displayGMThinking, setDisplayGMThinking] = useState(() => {
    if (typeof window !== "undefined") {
      // Default to false - GM thinking is hidden by default
      return localStorage.getItem("displayGMThinking") === "true";
    }
    return false;
  });
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
      return stored ? parseInt(stored, 10) : 4000;
    }
    return 4000;
  });
  // Story stage context size (separate from GM stage Memory Size)
  const [storyContextSize, setStoryContextSize] = useState(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("storyContextSize");
      return stored ? parseInt(stored, 10) : 16000; // Default 16K
    }
    return 16000;
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
  const [isCustomStoryContextMode, setIsCustomStoryContextMode] = useState(
    () => {
      if (typeof window !== "undefined") {
        const stored = localStorage.getItem("storyContextSize");
        return (
          stored === "-1" ||
          (stored !== null &&
            ![8000, 16000, 36000, 72000, 120000, 200000].includes(
              parseInt(stored, 10)
            ))
        );
      }
      return false;
    }
  );
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
  const [customStoryContextInput, setCustomStoryContextInput] = useState(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("storyContextSize");
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

  // Custom Models State
  const [customModels, setCustomModels] = useState<CustomModel[]>([]);
  const [showCustomModels, setShowCustomModels] = useState(false);
  const [showModelConfig, setShowModelConfig] = useState(false);
  const [editingModelId, setEditingModelId] = useState<string | null>(null);
  const [newModelId, setNewModelId] = useState("");
  const [newModelName, setNewModelName] = useState("");
  const [newContextSize, setNewContextSize] = useState(4096);
  const [newMaxOutput, setNewMaxOutput] = useState(1000);
  const [newInputPrice, setNewInputPrice] = useState(0);
  const [newOutputPrice, setNewOutputPrice] = useState(0);

  const [isLoadingSettings, setIsLoadingSettings] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [hasLoadedSettings, setHasLoadedSettings] = useState(false);

  // Load settings from Supabase (custom models + AI config)
  useEffect(() => {
    if (user && !hasLoadedSettings) {
      setIsLoadingSettings(true);
      getUserSettings(user.id, supabase)
        .then((settings) => {
          if (settings) {
            setCustomModels(settings.custom_models || []);
            // Cache custom models to localStorage for use in other components
            if (settings.custom_models?.length) {
              localStorage.setItem(
                "customModels",
                JSON.stringify(settings.custom_models)
              );
            }

            // Load AI config from cloud (overrides localStorage)
            if (settings.ai_config) {
              const config = settings.ai_config;
              if (config.currentPreset) {
                setCurrentPreset(config.currentPreset);
                localStorage.setItem("aiPreset", config.currentPreset);
              }
              if (config.storyModel !== undefined) {
                setStoryModel(config.storyModel);
                localStorage.setItem("aiModelStory", config.storyModel);
              }
              if (config.toolsModel !== undefined) {
                setToolsModel(config.toolsModel);
                localStorage.setItem("aiModelTools", config.toolsModel);
              }
              if (config.choicesModel !== undefined) {
                setChoicesModel(config.choicesModel);
                localStorage.setItem("aiModelChoices", config.choicesModel);
              }
              if (config.customMaxContext !== undefined) {
                setCustomMaxContext(config.customMaxContext);
                localStorage.setItem(
                  "customMaxContext",
                  config.customMaxContext.toString()
                );
              }
              if (config.customMaxOutput !== undefined) {
                setCustomMaxOutput(config.customMaxOutput);
                localStorage.setItem(
                  "customMaxOutput",
                  config.customMaxOutput.toString()
                );
              }
            }
          }
          setHasLoadedSettings(true);
        })
        .finally(() => setIsLoadingSettings(false));
    }
  }, [user, hasLoadedSettings]);

  // Persist stage model selections to localStorage
  useEffect(() => {
    if (typeof window !== "undefined" && hasLoadedSettings) {
      localStorage.setItem("aiModelStory", storyModel);
    }
  }, [storyModel, hasLoadedSettings]);

  useEffect(() => {
    if (typeof window !== "undefined" && hasLoadedSettings) {
      localStorage.setItem("aiModelTools", toolsModel);
    }
  }, [toolsModel, hasLoadedSettings]);

  useEffect(() => {
    if (typeof window !== "undefined" && hasLoadedSettings) {
      localStorage.setItem("aiModelChoices", choicesModel);
    }
  }, [choicesModel, hasLoadedSettings]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("advancedTools", advancedTools.toString());
    }
  }, [advancedTools]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("advancedChoices", advancedChoices.toString());
    }
  }, [advancedChoices]);

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

  // Persist BYOK mode
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("byokMode", byokMode.toString());
    }
  }, [byokMode]);

  // Auto-save context settings to cloud when they change (after initial load)
  useEffect(() => {
    if (typeof window !== "undefined" && hasLoadedSettings && user) {
      localStorage.setItem("customMaxContext", customMaxContext.toString());
      // Debounced cloud sync - only save if user is logged in
      const timeoutId = setTimeout(() => {
        const aiConfig: AIConfig = {
          currentPreset,
          storyModel: storyModel || undefined,
          toolsModel: toolsModel || undefined,
          choicesModel: choicesModel || undefined,
          customMaxContext:
            customMaxContext !== 36000 ? customMaxContext : undefined,
          customMaxOutput:
            customMaxOutput !== 4000 ? customMaxOutput : undefined,
        };
        updateUserSettings(user.id, { ai_config: aiConfig }, supabase);
      }, 1000); // Debounce 1 second
      return () => clearTimeout(timeoutId);
    }
  }, [customMaxContext, hasLoadedSettings, user]);

  useEffect(() => {
    if (typeof window !== "undefined" && hasLoadedSettings && user) {
      localStorage.setItem("customMaxOutput", customMaxOutput.toString());
      // Debounced cloud sync - only save if user is logged in
      const timeoutId = setTimeout(() => {
        const aiConfig: AIConfig = {
          currentPreset,
          storyModel: storyModel || undefined,
          toolsModel: toolsModel || undefined,
          choicesModel: choicesModel || undefined,
          customMaxContext:
            customMaxContext !== 36000 ? customMaxContext : undefined,
          customMaxOutput:
            customMaxOutput !== 4000 ? customMaxOutput : undefined,
        };
        updateUserSettings(user.id, { ai_config: aiConfig }, supabase);
      }, 1000); // Debounce 1 second
      return () => clearTimeout(timeoutId);
    }
  }, [customMaxOutput, hasLoadedSettings, user]);

  // Check if user has any AI keys configured
  const hasAnyAIKey = hasKey("openRouterKey") || hasKey("deepseekKey");

  // Get current preset configuration (for cost estimation only)
  const preset = MODEL_PRESETS[currentPreset] || MODEL_PRESETS["mistralLarge"];

  // Direct model selection - no preset fallback
  const effectiveStoryModel = storyModel;
  const effectiveToolsModel = toolsModel;

  // Apply advanced choices toggle - CHOICES NOW USES STORY MODEL
  // Choices stage uses the same model as Story stage for consistency
  const effectiveChoicesModel = effectiveStoryModel;

  // Helper to get display name for a model key (handles both built-in and custom models)
  const getModelDisplayName = (modelKey: string): string => {
    // Check if it's a built-in model
    if (modelKey in AI_MODELS) {
      return AI_MODELS[modelKey as keyof typeof AI_MODELS].name;
    }
    // Check if it's a custom model (by UUID)
    const customModel = customModels.find((m) => m.id === modelKey);
    if (customModel) {
      return customModel.name;
    }
    // Fallback to the key itself
    return modelKey;
  };

  const effectiveContextSize =
    customMaxContext > 0 ? customMaxContext : undefined;

  // Calculate dynamic estimated cost - always use effective models to account for advanced toggles
  const baseEstimatedCost = getCustomEstimatedCost(
    effectiveStoryModel,
    effectiveToolsModel,
    effectiveChoicesModel,
    effectiveContextSize
  );

  const contextForSavings = effectiveContextSize || 120000;
  const novelaiSavings =
    novelaiEnabled && hasKey("novelaiKey")
      ? getStoryStageCost(effectiveStoryModel, contextForSavings)
      : 0;

  const estimatedCost = Math.max(0, baseEstimatedCost - novelaiSavings);

  // Auto-sync AI config to cloud when preset changes
  const syncAIConfig = async (presetToSync?: string) => {
    if (!user) return;

    const aiConfig: AIConfig = {
      currentPreset: presetToSync || currentPreset,
      storyModel: storyModel || undefined,
      toolsModel: toolsModel || undefined,
      choicesModel: choicesModel || undefined,
      customMaxContext:
        customMaxContext !== 36000 ? customMaxContext : undefined,
      customMaxOutput: customMaxOutput !== 4000 ? customMaxOutput : undefined,
    };

    // Fire and forget - don't block UI
    updateUserSettings(user.id, { ai_config: aiConfig }, supabase).catch(
      (err) => console.error("Failed to sync AI config:", err)
    );
  };

  // Auto-sync custom model selections to cloud when they change
  // This effect runs AFTER initial cloud load (hasLoadedSettings) and only for custom preset
  useEffect(() => {
    if (hasLoadedSettings && user && currentPreset === "custom") {
      // Debounce the sync to avoid too many requests
      const timeoutId = setTimeout(() => {
        syncAIConfig();
      }, 500);
      return () => clearTimeout(timeoutId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    storyModel,
    toolsModel,
    choicesModel,
    hasLoadedSettings,
    currentPreset,
    user,
  ]);

  const handlePresetChange = (newPreset: string) => {
    if (typeof window !== "undefined") {
      localStorage.setItem("aiPreset", newPreset);
      setCurrentPreset(newPreset);
      addNotification(
        `Preset changed to ${MODEL_PRESETS[newPreset].name}`,
        "success"
      );
      // Auto-sync to cloud
      syncAIConfig(newPreset);
    }
  };

  const handleAddModel = () => {
    if (!newModelId || !newModelName) {
      addNotification("Please fill in model ID and name", "warning");
      return;
    }

    const newModel: CustomModel = {
      id: crypto.randomUUID(),
      modelId: newModelId,
      name: newModelName,
      contextSize: newContextSize,
      maxOutputTokens: newMaxOutput,
      inputPrice: newInputPrice,
      outputPrice: newOutputPrice,
    };

    const updatedModels = [...customModels, newModel];
    setCustomModels(updatedModels);
    // Update localStorage cache
    localStorage.setItem("customModels", JSON.stringify(updatedModels));
    setNewModelId("");
    setNewModelName("");
    setNewContextSize(4096);
    setNewMaxOutput(1000);
    setNewInputPrice(0);
    setNewOutputPrice(0);
    addNotification(
      "Model added! Click Sync to save to your account.",
      "success"
    );
  };

  const handleDeleteModel = (id: string) => {
    const updatedModels = customModels.filter((m) => m.id !== id);
    setCustomModels(updatedModels);
    // Update localStorage cache
    localStorage.setItem("customModels", JSON.stringify(updatedModels));
    addNotification(
      "Model removed! Click Sync to save to your account.",
      "warning"
    );
  };

  const handleEditModel = (model: CustomModel) => {
    setEditingModelId(model.id);
    setNewModelId(model.modelId);
    setNewModelName(model.name);
    setNewContextSize(model.contextSize);
    setNewMaxOutput(model.maxOutputTokens);
    setNewInputPrice(model.inputPrice || 0);
    setNewOutputPrice(model.outputPrice || 0);
  };

  const handleUpdateModel = () => {
    if (!editingModelId || !newModelId || !newModelName) {
      addNotification("Please fill in model ID and name", "warning");
      return;
    }

    const updatedModels = customModels.map((m) =>
      m.id === editingModelId
        ? {
            ...m,
            modelId: newModelId,
            name: newModelName,
            contextSize: newContextSize,
            maxOutputTokens: newMaxOutput,
            inputPrice: newInputPrice,
            outputPrice: newOutputPrice,
          }
        : m
    );

    setCustomModels(updatedModels);
    // Update localStorage cache
    localStorage.setItem("customModels", JSON.stringify(updatedModels));
    setEditingModelId(null);
    setNewModelId("");
    setNewModelName("");
    setNewContextSize(4096);
    setNewMaxOutput(1000);
    setNewInputPrice(0);
    setNewOutputPrice(0);
    addNotification(
      "Model updated! Click Sync to save to your account.",
      "success"
    );
  };

  const handleCancelEdit = () => {
    setEditingModelId(null);
    setNewModelId("");
    setNewModelName("");
    setNewContextSize(4096);
    setNewMaxOutput(1000);
    setNewInputPrice(0);
    setNewOutputPrice(0);
  };

  const handleSaveSettings = async () => {
    if (!user) return;
    setIsSaving(true);

    // Build AI config object
    const aiConfig: AIConfig = {
      currentPreset,
      storyModel: storyModel || undefined,
      toolsModel: toolsModel || undefined,
      choicesModel: choicesModel || undefined,
      customMaxContext:
        customMaxContext !== 36000 ? customMaxContext : undefined,
      customMaxOutput: customMaxOutput !== 4000 ? customMaxOutput : undefined,
    };

    const { error } = await updateUserSettings(
      user.id,
      { custom_models: customModels, ai_config: aiConfig },
      supabase
    );

    setIsSaving(false);

    if (error) {
      addNotification("Failed to save settings", "failure");
    } else {
      addNotification("AI presets synced to your account!", "success");
    }
  };

  // Build available models list including custom models
  const availableModels: Record<string, any> = { ...AI_MODELS };
  customModels.forEach((model) => {
    availableModels[model.id] = {
      name: model.name,
      original_model: model.modelId,
      cost: 0,
      maxTokens: model.contextSize,
      inputPrice: model.inputPrice || 0,
      outputPrice: model.outputPrice || 0,
    };
  });

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
      {/* BYOK Mode Toggle */}
      <div className="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className={`p-2 rounded-lg ${
                byokMode
                  ? "bg-green-100 dark:bg-green-900/30"
                  : "bg-amber-100 dark:bg-amber-900/30"
              }`}
            >
              <DynamicIcon
                name={byokMode ? "Key" : "Coins"}
                className={`w-5 h-5 ${
                  byokMode
                    ? "text-green-600 dark:text-green-400"
                    : "text-amber-600 dark:text-amber-400"
                }`}
              />
            </div>
            <div>
              <h3 className="text-sm font-medium text-gray-900 dark:text-white">
                {byokMode ? "Bring Your Own Key" : "Use Coins"}
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {byokMode
                  ? "Using your own API keys - free generation"
                  : "Using our API - costs coins per generation"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`text-xs font-medium ${
                !byokMode
                  ? "text-amber-600 dark:text-amber-400"
                  : "text-gray-400"
              }`}
            >
              Coins
            </span>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={byokMode}
                onChange={(e) => {
                  const newValue = e.target.checked;
                  setByokMode(newValue);
                  if (!newValue) {
                    // Switching to Coins mode - auto-select Mistral Large preset
                    handlePresetChange("mistralLarge");
                    addNotification(
                      "Switched to Coins mode with Mistral Large models",
                      "success"
                    );
                  } else {
                    // Switching to BYOK mode - switch to custom preset
                    handlePresetChange("custom");
                    addNotification(
                      "Switched to BYOK mode - use your own API keys",
                      "success"
                    );
                  }
                }}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-amber-500 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-purple-500 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:start-0.5 after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-600" />
            </label>
            <span
              className={`text-xs font-medium ${
                byokMode
                  ? "text-green-600 dark:text-green-400"
                  : "text-gray-400"
              }`}
            >
              BYOK
            </span>
          </div>
        </div>

        {/* Warning if no keys configured in BYOK mode */}
        {byokMode && !hasAnyAIKey && (
          <div className="mt-3 p-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
            <p className="text-xs text-amber-700 dark:text-amber-300 flex items-center gap-1.5">
              <DynamicIcon name="AlertTriangle" className="w-3.5 h-3.5" />
              No API keys configured. Add your OpenRouter or DeepSeek key in the
              API Keys tab.
            </p>
          </div>
        )}

        {/* Info about Coins mode */}
        {!byokMode && (
          <div className="mt-3 p-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
            <p className="text-xs text-blue-700 dark:text-blue-300 flex items-center gap-1.5">
              <DynamicIcon name="Coins" className="w-3.5 h-3.5" />
              Using Mistral models. Each generation costs coins based on token
              usage.
            </p>
          </div>
        )}
      </div>

      {/* Current Preset Banner */}
      <div
        className={`${
          novelaiEnabled && hasKey("novelaiKey")
            ? "bg-linear-to-r from-green-600 to-teal-600"
            : byokMode
            ? "bg-linear-to-r from-purple-600 to-blue-600"
            : "bg-linear-to-r from-amber-500 to-orange-600"
        } rounded-lg p-4 text-white`}
      >
        <div className="flex items-center justify-between mb-2">
          <div>
            <div className="text-xl font-bold flex items-center gap-2">
              {preset.name}
              {byokMode ? (
                <span className="text-xs bg-white/20 px-2 py-0.5 rounded-full">
                  BYOK
                </span>
              ) : (
                <span className="text-xs bg-white/20 px-2 py-0.5 rounded-full">
                  💰 Coins
                </span>
              )}
              {novelaiEnabled && hasKey("novelaiKey") && (
                <span className="text-xs bg-white/20 px-2 py-0.5 rounded-full">
                  + NovelAI
                </span>
              )}
            </div>
            <div className="text-sm text-white/70">{preset.description}</div>
          </div>
          <div className="text-right">
            {byokMode ? (
              <>
                <div className="text-2xl font-bold text-green-200">FREE</div>
                <div className="text-xs text-white/70">with your keys</div>
              </>
            ) : (
              <>
                <div className="text-2xl font-bold">~{estimatedCost}</div>
                <div className="text-xs text-white/70">
                  coins/gen
                  {novelaiEnabled &&
                    hasKey("novelaiKey") &&
                    novelaiSavings > 0 && (
                      <span className="text-green-200 ml-1">
                        (-{novelaiSavings})
                      </span>
                    )}
                </div>
              </>
            )}
          </div>
        </div>
        <div className="flex flex-col gap-1 text-xs mt-2">
          <div>
            <span className="text-white/60">Model:</span>{" "}
            {novelaiEnabled && hasKey("novelaiKey") ? (
              <span className="text-green-200">
                NovelAI GLM-4-6 (BYOK) - 28K context
              </span>
            ) : (
              <>
                {getModelDisplayName(effectiveStoryModel)}
                <span className="text-white/40 ml-1">
                  -{" "}
                  {Math.round(
                    getModelConfig(effectiveStoryModel).maxTokens / 1000
                  )}
                  K context
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Model Selection */}
      <div className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
            AI Model
          </label>
          <select
            value={storyModel}
            onChange={(e) => {
              const newModel = e.target.value;
              setStoryModel(newModel);
              // Also update GM model to match (merged GM+Story stages)
              setToolsModel(newModel);
              if (typeof window !== "undefined") {
                localStorage.setItem("aiModelStory", newModel);
                localStorage.setItem("aiModelTools", newModel);
              }
            }}
            className="w-full px-3 py-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
          >
            {Object.entries(AI_MODELS)
              .filter(([, config]) => {
                const isBYOKProvider =
                  config.provider === "openrouter" ||
                  config.provider === "deepseek" ||
                  config.provider === "novelai" ||
                  config.provider === "google";
                return byokMode ? isBYOKProvider : !isBYOKProvider;
              })
              .map(([key, config]) => (
                <option key={key} value={key}>
                  {config.name} ({config.cost} coin
                  {config.cost > 1 ? "s" : ""},{" "}
                  {(config.maxTokens / 1000).toFixed(0)}K)
                </option>
              ))}
            {byokMode && customModels.length > 0 && (
              <optgroup label="Custom Models">
                {[...customModels]
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.name} (FREE,{" "}
                      {(model.contextSize / 1000).toFixed(0)}K)
                    </option>
                  ))}
              </optgroup>
            )}
          </select>
        </div>
      </div>

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

      {/* Custom Models Management - Only in BYOK mode */}
      {byokMode && (
        <div className="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg space-y-4">
          <button
            onClick={() => setShowCustomModels(!showCustomModels)}
            className="flex items-center justify-between w-full text-left"
          >
            <h4 className="text-sm font-medium text-gray-900 dark:text-white flex items-center gap-2">
              <DynamicIcon name="Plus" className="w-4 h-4" />
              Custom Models
              {customModels.length > 0 && (
                <span className="text-xs bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 px-2 py-0.5 rounded-full">
                  {customModels.length}
                </span>
              )}
            </h4>
            <DynamicIcon
              name={showCustomModels ? "ChevronUp" : "ChevronDown"}
              className="w-4 h-4 text-gray-500"
            />
          </button>

          {showCustomModels && (
            <div className="space-y-4 pt-2">
              {/* Existing Custom Models */}
              {customModels.length > 0 && (
                <div className="space-y-2">
                  {[...customModels]
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .map((model) => (
                      <div
                        key={model.id}
                        className="p-3 bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700"
                      >
                        {editingModelId === model.id ? (
                          <div className="space-y-2">
                            <input
                              type="text"
                              value={newModelId}
                              onChange={(e) => setNewModelId(e.target.value)}
                              placeholder="Model ID"
                              className="w-full px-2 py-1.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded text-sm"
                            />
                            <input
                              type="text"
                              value={newModelName}
                              onChange={(e) => setNewModelName(e.target.value)}
                              placeholder="Display Name"
                              className="w-full px-2 py-1.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded text-sm"
                            />
                            <div className="grid grid-cols-2 gap-2">
                              <input
                                type="number"
                                value={newContextSize}
                                onChange={(e) =>
                                  setNewContextSize(
                                    parseInt(e.target.value) || 4096
                                  )
                                }
                                placeholder="Context Size"
                                className="px-2 py-1.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded text-sm"
                              />
                              <input
                                type="number"
                                value={newMaxOutput}
                                onChange={(e) =>
                                  setNewMaxOutput(
                                    parseInt(e.target.value) || 1000
                                  )
                                }
                                placeholder="Max Output"
                                className="px-2 py-1.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded text-sm"
                              />
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <input
                                type="text"
                                inputMode="decimal"
                                value={newInputPrice}
                                onChange={(e) => {
                                  const val = e.target.value.replace(",", ".");
                                  const num = parseFloat(val);
                                  setNewInputPrice(isNaN(num) ? 0 : num);
                                }}
                                placeholder="Input $/M tokens"
                                className="px-2 py-1.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded text-sm"
                              />
                              <input
                                type="text"
                                inputMode="decimal"
                                value={newOutputPrice}
                                onChange={(e) => {
                                  const val = e.target.value.replace(",", ".");
                                  const num = parseFloat(val);
                                  setNewOutputPrice(isNaN(num) ? 0 : num);
                                }}
                                placeholder="Output $/M tokens"
                                className="px-2 py-1.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded text-sm"
                              />
                            </div>
                            <div className="flex gap-2">
                              <button
                                onClick={handleUpdateModel}
                                className="flex-1 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded text-xs font-medium"
                              >
                                Save
                              </button>
                              <button
                                onClick={handleCancelEdit}
                                className="flex-1 py-1.5 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded text-xs font-medium"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-sm font-medium text-gray-900 dark:text-white">
                                {model.name}
                              </p>
                              <p className="text-xs text-gray-500 dark:text-gray-400">
                                {model.modelId} • {model.contextSize} tokens
                              </p>
                            </div>
                            <div className="flex gap-1">
                              <button
                                onClick={() => handleEditModel(model)}
                                className="p-1.5 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded"
                              >
                                <DynamicIcon
                                  name="Edit2"
                                  className="w-3.5 h-3.5"
                                />
                              </button>
                              <button
                                onClick={() => handleDeleteModel(model.id)}
                                className="p-1.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                              >
                                <DynamicIcon
                                  name="Trash2"
                                  className="w-3.5 h-3.5"
                                />
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                </div>
              )}

              {/* Add New Model Form */}
              {!editingModelId && (
                <div className="space-y-2 pt-2 border-t border-gray-200 dark:border-gray-700">
                  <p className="text-xs font-medium text-gray-600 dark:text-gray-400">
                    Add New Model
                  </p>
                  <input
                    type="text"
                    value={newModelId}
                    onChange={(e) => setNewModelId(e.target.value)}
                    placeholder="Model ID (e.g., anthropic/claude-3-opus)"
                    className="w-full px-3 py-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg text-sm"
                  />
                  <input
                    type="text"
                    value={newModelName}
                    onChange={(e) => setNewModelName(e.target.value)}
                    placeholder="Display Name (e.g., Claude 3 Opus)"
                    className="w-full px-3 py-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg text-sm"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">
                        Context Size
                      </label>
                      <input
                        type="number"
                        value={newContextSize}
                        onChange={(e) =>
                          setNewContextSize(parseInt(e.target.value) || 4096)
                        }
                        className="w-full px-3 py-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">
                        Max Output
                      </label>
                      <input
                        type="number"
                        value={newMaxOutput}
                        onChange={(e) =>
                          setNewMaxOutput(parseInt(e.target.value) || 1000)
                        }
                        className="w-full px-3 py-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg text-sm"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">
                        Input $/M tokens
                      </label>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={newInputPrice}
                        onChange={(e) => {
                          const val = e.target.value.replace(",", ".");
                          const num = parseFloat(val);
                          setNewInputPrice(isNaN(num) ? 0 : num);
                        }}
                        className="w-full px-3 py-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">
                        Output $/M tokens
                      </label>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={newOutputPrice}
                        onChange={(e) => {
                          const val = e.target.value.replace(",", ".");
                          const num = parseFloat(val);
                          setNewOutputPrice(isNaN(num) ? 0 : num);
                        }}
                        className="w-full px-3 py-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg text-sm"
                      />
                    </div>
                  </div>
                  <button
                    onClick={handleAddModel}
                    className="w-full py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium"
                  >
                    Add Model
                  </button>
                </div>
              )}

              {/* Sync Button */}
              {customModels.length > 0 && (
                <button
                  onClick={handleSaveSettings}
                  disabled={isSaving || !user}
                  className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium disabled:opacity-50"
                >
                  {isSaving ? "Saving..." : "Sync Custom Models"}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Sampling Settings - For Coins mode and OpenRouter */}
      <SamplingSettingsTab
        byokMode={byokMode}
        hasOpenRouterKey={hasKey("openRouterKey")}
      />

      {/* Tool Calling Settings */}
      <div className="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg space-y-4">
        <h4 className="text-sm font-medium text-gray-900 dark:text-white flex items-center gap-2">
          <DynamicIcon name="Wrench" className="w-4 h-4" />
          Tool Calling
        </h4>

        <div className="flex items-center justify-between">
          <div className="flex-1">
            <p className="text-sm text-gray-700 dark:text-gray-300">
              Enable Tool Calling
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Allow AI to modify stats, inventory, and story state
            </p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={toolCallingEnabled}
              onChange={(e) => {
                const newValue = e.target.checked;
                setToolCallingEnabled(newValue);
                if (typeof window !== "undefined") {
                  localStorage.setItem("toolCallingEnabled", String(newValue));
                }
              }}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-purple-500 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:start-0.5 after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-purple-600" />
          </label>
        </div>

        {toolCallingEnabled && (
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
        )}

        {toolCallingEnabled && (
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <p className="text-sm text-gray-700 dark:text-gray-300">
                Display GM Thinking
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Show AI&apos;s reasoning process in the story view
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={displayGMThinking}
                onChange={(e) => {
                  const newValue = e.target.checked;
                  setDisplayGMThinking(newValue);
                  if (typeof window !== "undefined") {
                    localStorage.setItem("displayGMThinking", String(newValue));
                    // Dispatch custom event for same-tab updates
                    window.dispatchEvent(new Event("displayGMThinkingChanged"));
                  }
                }}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-purple-500 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:start-0.5 after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-purple-600" />
            </label>
          </div>
        )}
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
          still use OpenRouter/DeepSeek.
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
