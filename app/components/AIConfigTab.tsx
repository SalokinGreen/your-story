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
} from "@/app/misc/ai_prices";
import {
  getUserSettings,
  updateUserSettings,
  CustomModel,
} from "@/app/misc/user_settings";
import { supabase } from "@/app/misc/supabase";

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
      return localStorage.getItem("aiPreset") || "main";
    }
    return "main";
  });

  // Model configuration for custom preset
  const [storyModel, setStoryModel] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("aiModelStory") || "";
    }
    return "";
  });
  const [toolsModel, setToolsModel] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("aiModelTools") || "";
    }
    return "";
  });
  const [choicesModel, setChoicesModel] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("aiModelChoices") || "";
    }
    return "";
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
      return parseInt(localStorage.getItem("maxToolLoops") || "1", 10);
    }
    return 1;
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
  // Temporary input values for custom fields
  const [customContextInput, setCustomContextInput] = useState("");
  const [customOutputInput, setCustomOutputInput] = useState("");

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

  // Load settings from Supabase
  useEffect(() => {
    if (user && !hasLoadedSettings) {
      setIsLoadingSettings(true);
      getUserSettings(user.id, supabase)
        .then((settings) => {
          if (settings) {
            setCustomModels(settings.custom_models || []);
          }
          setHasLoadedSettings(true);
        })
        .finally(() => setIsLoadingSettings(false));
    }
  }, [user, hasLoadedSettings]);

  // Persist stage model selections to localStorage
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("aiModelStory", storyModel);
    }
  }, [storyModel]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("aiModelTools", toolsModel);
    }
  }, [toolsModel]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("aiModelChoices", choicesModel);
    }
  }, [choicesModel]);

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

  // Check if user has any AI keys configured
  const hasAnyAIKey = hasKey("openRouterKey") || hasKey("deepseekKey");

  // Get current preset configuration
  const preset = MODEL_PRESETS[currentPreset] || MODEL_PRESETS["main"];
  const effectiveStoryModel =
    currentPreset === "custom" && storyModel ? storyModel : preset.storyModel;
  const effectiveToolsModel =
    currentPreset === "custom" && toolsModel ? toolsModel : preset.toolsModel;
  const effectiveChoicesModel =
    currentPreset === "custom" && choicesModel
      ? choicesModel
      : preset.choicesModel;

  const effectiveContextSize =
    customMaxContext > 0 ? customMaxContext : undefined;

  // Calculate dynamic estimated cost
  const baseEstimatedCost =
    currentPreset === "custom"
      ? getCustomEstimatedCost(
          effectiveStoryModel,
          effectiveToolsModel,
          effectiveChoicesModel,
          effectiveContextSize
        )
      : getPresetEstimatedCost(currentPreset, effectiveContextSize);

  const contextForSavings = effectiveContextSize || 120000;
  const novelaiSavings =
    novelaiEnabled && hasKey("novelaiKey")
      ? getStoryStageCost(effectiveStoryModel, contextForSavings)
      : 0;

  const estimatedCost = Math.max(0, baseEstimatedCost - novelaiSavings);

  const handlePresetChange = (newPreset: string) => {
    if (typeof window !== "undefined") {
      localStorage.setItem("aiPreset", newPreset);
      setCurrentPreset(newPreset);
      addNotification(
        `Preset changed to ${MODEL_PRESETS[newPreset].name}`,
        "success"
      );
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

    setCustomModels([...customModels, newModel]);
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
    setCustomModels(customModels.filter((m) => m.id !== id));
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

    const { error } = await updateUserSettings(
      user.id,
      { custom_models: customModels },
      supabase
    );

    setIsSaving(false);

    if (error) {
      addNotification("Failed to save settings", "failure");
    } else {
      addNotification("Settings saved successfully!", "success");
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
                    // Switching to Coins mode - auto-select Mistral preset
                    handlePresetChange("mistral");
                    addNotification(
                      "Switched to Coins mode with Mistral models",
                      "success"
                    );
                  } else {
                    // Switching to BYOK mode - switch to main preset if on mistral
                    if (currentPreset === "mistral") {
                      handlePresetChange("main");
                    }
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
          byokMode && novelaiEnabled && hasKey("novelaiKey")
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
              {byokMode && novelaiEnabled && hasKey("novelaiKey") && (
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
            <span className="text-white/60">Story:</span>{" "}
            {byokMode && novelaiEnabled && hasKey("novelaiKey") ? (
              <span className="text-green-200">NovelAI GLM-4-6 (BYOK)</span>
            ) : (
              effectiveStoryModel
            )}
          </div>
          <div>
            <span className="text-white/60">Tools:</span> {effectiveToolsModel}
          </div>
          <div>
            <span className="text-white/60">Choices:</span>{" "}
            {effectiveChoicesModel}
          </div>
        </div>
      </div>

      {/* Preset Selection */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
          Model Preset
        </label>
        <select
          value={currentPreset}
          onChange={(e) => handlePresetChange(e.target.value)}
          className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
        >
          {Object.entries(MODEL_PRESETS)
            .filter(([key]) => {
              // In BYOK mode, hide Mistral preset (coins only)
              // In Coins mode, show only Mistral preset
              if (byokMode) {
                return key !== "mistral";
              } else {
                return key === "mistral" || key === "custom";
              }
            })
            .map(([key, presetConfig]) => (
              <option key={key} value={key}>
                {presetConfig.name}
                {byokMode
                  ? " - FREE with your keys"
                  : ` - ~${getPresetEstimatedCost(
                      key,
                      effectiveContextSize
                    )} coins`}
              </option>
            ))}
        </select>
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
                if (val > 0) {
                  setCustomMaxOutput(val);
                  if (typeof window !== "undefined") {
                    localStorage.setItem("customMaxOutput", String(val));
                  }
                }
              }}
              min="500"
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
      </div>

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
                  const newValue = Math.min(5, maxToolLoops + 1);
                  setMaxToolLoops(newValue);
                  if (typeof window !== "undefined") {
                    localStorage.setItem("maxToolLoops", String(newValue));
                  }
                }}
                disabled={maxToolLoops >= 5}
                className="w-8 h-8 flex items-center justify-center rounded bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                +
              </button>
            </div>
          </div>
        )}
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

      {/* Custom Model Config (only for custom preset) */}
      {currentPreset === "custom" && (
        <div className="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg space-y-4">
          <button
            onClick={() => setShowModelConfig(!showModelConfig)}
            className="flex items-center justify-between w-full text-left"
          >
            <h4 className="text-sm font-medium text-gray-900 dark:text-white flex items-center gap-2">
              <DynamicIcon name="Settings" className="w-4 h-4" />
              Configure Custom Models
            </h4>
            <DynamicIcon
              name={showModelConfig ? "ChevronUp" : "ChevronDown"}
              className="w-4 h-4 text-gray-500"
            />
          </button>

          {showModelConfig && (
            <div className="space-y-4 pt-2">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Choose models for each generation stage
              </p>

              {/* Story Model */}
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                  Story Narration Model
                </label>
                <select
                  value={storyModel || preset.storyModel}
                  onChange={(e) => setStoryModel(e.target.value)}
                  className="w-full px-3 py-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                >
                  {Object.entries(AI_MODELS).map(([key, config]) => (
                    <option key={key} value={key}>
                      {config.name} ({config.cost} coin
                      {config.cost > 1 ? "s" : ""},{" "}
                      {(config.maxTokens / 1000).toFixed(0)}K)
                    </option>
                  ))}
                  {customModels.length > 0 && (
                    <optgroup label="Custom Models">
                      {customModels.map((model) => (
                        <option key={model.id} value={model.id}>
                          {model.name} (FREE,{" "}
                          {(model.contextSize / 1000).toFixed(0)}K)
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </div>

              {/* Tools Model */}
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                  Tools & Game State Model
                </label>
                <select
                  value={toolsModel || preset.toolsModel}
                  onChange={(e) => setToolsModel(e.target.value)}
                  className="w-full px-3 py-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                >
                  {Object.entries(AI_MODELS).map(([key, config]) => (
                    <option key={key} value={key}>
                      {config.name} ({(config as any).cost || 1} coin
                      {((config as any).cost || 1) > 1 ? "s" : ""},{" "}
                      {(config.maxTokens / 1000).toFixed(0)}K)
                    </option>
                  ))}
                  {customModels.length > 0 && (
                    <optgroup label="Custom Models">
                      {customModels.map((model) => (
                        <option key={model.id} value={model.id}>
                          {model.name} (FREE,{" "}
                          {(model.contextSize / 1000).toFixed(0)}K)
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </div>

              {/* Choices Model */}
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                  Player Choices Model
                </label>
                <select
                  value={choicesModel || preset.choicesModel}
                  onChange={(e) => setChoicesModel(e.target.value)}
                  className="w-full px-3 py-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                >
                  {Object.entries(AI_MODELS).map(([key, config]) => (
                    <option key={key} value={key}>
                      {config.name} ({(config as any).cost || 1} coin
                      {((config as any).cost || 1) > 1 ? "s" : ""},{" "}
                      {(config.maxTokens / 1000).toFixed(0)}K)
                    </option>
                  ))}
                  {customModels.length > 0 && (
                    <optgroup label="Custom Models">
                      {customModels.map((model) => (
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
          )}
        </div>
      )}

      {/* Custom Models Management */}
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
                {customModels.map((model) => (
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
                              setNewMaxOutput(parseInt(e.target.value) || 1000)
                            }
                            placeholder="Max Output"
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
                            <DynamicIcon name="Edit2" className="w-3.5 h-3.5" />
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
    </div>
  );
}
