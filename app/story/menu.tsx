"use client";

import {
  StoryData,
  Stat,
  Resource,
  InventoryItem,
  Achievement,
  StoryLore,
  PlotBeat,
  Quest,
  Relationship,
} from "../misc/structs";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { useNotification } from "../misc/NotificationContext";
import { supabase } from "../misc/supabase";
import { compressImage } from "../misc/imageCompression";
import CustomVoiceManager from "../components/CustomVoiceManager";
import { AI_MODELS } from "../misc/ai_prices";
import ConfirmDialog from "../components/ConfirmDialog";
import {
  getUserSettings,
  updateUserSettings,
  CustomModel,
} from "../misc/user_settings";
import { useAuth } from "../misc/AuthContext";
import { DynamicIcon } from "../components/DynamicIcon";
import { IconPicker } from "../components/IconPicker";

// AI Model Selector Component with state management
function AIModelSelector({
  addNotification,
}: {
  addNotification: (
    message: string,
    type: "success" | "failure" | "warning"
  ) => void;
}) {
  const { user } = useAuth();
  const [currentModelKey, setCurrentModelKey] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("aiModel") || "Prometheus";
    }
    return "Prometheus";
  });

  // BYOK State
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [openRouterKey, setOpenRouterKey] = useState("");
  const [speechifyKey, setSpeechifyKey] = useState("");
  const [byokEnabled, setByokEnabled] = useState(false);
  const [isSubscriber, setIsSubscriber] = useState(false);

  // Custom Models State (array of models)
  const [customModels, setCustomModels] = useState<CustomModel[]>([]);
  const [editingModelId, setEditingModelId] = useState<string | null>(null);
  const [newModelId, setNewModelId] = useState("");
  const [newModelName, setNewModelName] = useState("");
  const [newContextSize, setNewContextSize] = useState(4096);
  const [newMaxOutput, setNewMaxOutput] = useState(1000);

  const [isLoadingSettings, setIsLoadingSettings] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [hasLoadedSettings, setHasLoadedSettings] = useState(false);

  // Show keys toggle
  const [showKeys, setShowKeys] = useState(false);

  // Load settings
  useEffect(() => {
    if (user && !hasLoadedSettings) {
      setIsLoadingSettings(true);
      // Load keys from localStorage
      if (typeof window !== "undefined") {
        setOpenRouterKey(localStorage.getItem("openRouterKey") || "");
        setSpeechifyKey(localStorage.getItem("speechifyKey") || "");
      }

      getUserSettings(user.id, supabase)
        .then((settings) => {
          if (settings) {
            setByokEnabled(settings.byok_enabled || false);
            setIsSubscriber(settings.is_subscriber || false);
            setCustomModels(settings.custom_models || []);
          }
          setHasLoadedSettings(true);
        })
        .finally(() => setIsLoadingSettings(false));
    }
  }, [user, hasLoadedSettings]);

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
    };

    setCustomModels([...customModels, newModel]);
    // Clear form
    setNewModelId("");
    setNewModelName("");
    setNewContextSize(4096);
    setNewMaxOutput(1000);
    addNotification("Model added! Click Save Settings to persist.", "success");
  };

  const handleDeleteModel = (id: string) => {
    setCustomModels(customModels.filter((m) => m.id !== id));
    addNotification(
      "Model removed! Click Save Settings to persist.",
      "warning"
    );
  };

  const handleSaveSettings = async () => {
    if (!user) return;
    setIsSaving(true);

    // Save keys to localStorage
    if (typeof window !== "undefined") {
      localStorage.setItem("openRouterKey", openRouterKey);
      localStorage.setItem("speechifyKey", speechifyKey);
    }

    const { error } = await updateUserSettings(
      user.id,
      {
        byok_enabled: byokEnabled,
        is_subscriber: isSubscriber,
        custom_models: customModels,
      },
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
      cost: 0, // BYOK models don't cost tokens
      maxTokens: model.contextSize,
    };
  });

  const currentModel = availableModels[currentModelKey] || AI_MODELS.Prometheus;
  AI_MODELS.Prometheus;

  const handleModelChange = (newModelKey: string) => {
    if (typeof window !== "undefined") {
      localStorage.setItem("aiModel", newModelKey);
      setCurrentModelKey(newModelKey);

      const selectedModel = availableModels[newModelKey];
      if (selectedModel) {
        const isByok = customModels.some((m) => m.id === newModelKey);
        addNotification(
          `Model changed to ${selectedModel.name}${
            isByok ? " (BYOK - FREE)" : ""
          }`,
          "success"
        );
      }
    }
  };

  return (
    <div className="bg-gray-50 dark:bg-gray-700 rounded-lg overflow-hidden">
      <label className="p-4 pb-3 text-sm font-semibold text-gray-700 dark:text-gray-300 flex justify-between items-center">
        <span className="flex items-center gap-2">
          <DynamicIcon name="Bot" className="w-4 h-4" /> AI Model Selection
        </span>
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
        >
          {showAdvanced ? "Hide BYOK & Settings" : "BYOK & Settings"}
        </button>
      </label>

      <div className="px-4 pb-4">
        {/* Current Model Banner */}
        <div
          className={`bg-linear-to-r ${
            isSubscriber &&
            byokEnabled &&
            (openRouterKey || currentModelKey === "custom")
              ? "from-green-600 to-teal-600"
              : "from-purple-600 to-blue-600"
          } rounded-lg p-4 text-white mb-4`}
        >
          <div className="flex items-center justify-between mb-2">
            <div>
              <div className="text-xl font-bold">{currentModel.name}</div>
              <div className="text-sm text-purple-100">
                {currentModel.original_model}
              </div>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold">
                {isSubscriber &&
                byokEnabled &&
                (openRouterKey || currentModelKey === "custom")
                  ? "FREE"
                  : currentModel.cost}
              </div>
              <div className="text-xs text-purple-100">
                {isSubscriber &&
                byokEnabled &&
                (openRouterKey || currentModelKey === "custom")
                  ? "(BYOK)"
                  : "coins/gen"}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <div>
              <span className="text-purple-100">Context:</span>{" "}
              <span className="font-semibold">
                {(currentModel.maxTokens / 1000).toFixed(0)}K tokens
              </span>
            </div>
          </div>
        </div>

        {/* Model Selection Dropdown */}
        <select
          value={currentModelKey}
          onChange={(e) => handleModelChange(e.target.value)}
          className="w-full px-4 py-3 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
        >
          {Object.entries(AI_MODELS).map(([key, config]) => (
            <option key={key} value={key}>
              {config.name} - {config.original_model} ({config.cost} coin
              {config.cost > 1 ? "s" : ""},{" "}
              {(config.maxTokens / 1000).toFixed(0)}K context)
            </option>
          ))}
          {isSubscriber && byokEnabled && customModels.length > 0 && (
            <optgroup label="Custom Models (BYOK)">
              {customModels.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.name} - {model.modelId} (FREE,{" "}
                  {(model.contextSize / 1000).toFixed(0)}K context)
                </option>
              ))}
            </optgroup>
          )}
        </select>

        {/* Advanced Settings / BYOK Section */}
        {showAdvanced && (
          <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-600 space-y-4">
            <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded text-sm text-blue-800 dark:text-blue-200 mb-2">
              <strong>Bring Your Own Key (BYOK)</strong> allows you to use your
              own API keys. When active, story generation costs{" "}
              <strong>0 coins</strong>. Keys are stored locally in your browser.
            </div>

            {/* Enable BYOK Toggle */}
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Enable BYOK
              </span>
              <button
                onClick={() => setByokEnabled(!byokEnabled)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  byokEnabled ? "bg-green-600" : "bg-gray-400"
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    byokEnabled ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </div>

            {/* Subscription Status (Mock Toggle for now) */}
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Subscription Status (Mock)
              </span>
              <button
                onClick={() => setIsSubscriber(!isSubscriber)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  isSubscriber ? "bg-blue-600" : "bg-gray-400"
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    isSubscriber ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </div>

            {/* API Keys */}
            <div className="space-y-3">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  API Keys
                </h4>
                <button
                  onClick={() => setShowKeys(!showKeys)}
                  className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                >
                  <DynamicIcon
                    name={showKeys ? "EyeOff" : "Eye"}
                    className="w-3 h-3"
                  />
                  {showKeys ? "Hide Keys" : "Show Keys"}
                </button>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-400 mb-1">
                  OpenRouter API Key
                </label>
                <input
                  type={showKeys ? "text" : "password"}
                  value={openRouterKey}
                  onChange={(e) => setOpenRouterKey(e.target.value)}
                  placeholder="sk-or-..."
                  className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded text-sm font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-400 mb-1">
                  Speechify API Key
                </label>
                <input
                  type={showKeys ? "text" : "password"}
                  value={speechifyKey}
                  onChange={(e) => setSpeechifyKey(e.target.value)}
                  placeholder="speechify-..."
                  className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded text-sm font-mono"
                />
              </div>
            </div>

            {/* Custom Model Config */}
            <div className="space-y-3 pt-2 border-t border-gray-200 dark:border-gray-600">
              <h4 className="text-sm font-bold text-gray-900 dark:text-white">
                Custom Models
              </h4>

              {/* Existing Custom Models */}
              {customModels.length > 0 && (
                <div className="space-y-2">
                  {customModels.map((model) => (
                    <div
                      key={model.id}
                      className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-700 rounded border border-gray-200 dark:border-gray-600"
                    >
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-900 dark:text-white">
                          {model.name}
                        </p>
                        <p className="text-xs text-gray-600 dark:text-gray-400">
                          {model.modelId} • {model.contextSize} tokens
                        </p>
                      </div>
                      <button
                        onClick={() => handleDeleteModel(model.id)}
                        className="ml-2 px-2 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-xs"
                      >
                        Delete
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Add New Model Form */}
              <div className="space-y-2 pt-2 border-t border-gray-200 dark:border-gray-600">
                <p className="text-xs font-medium text-gray-700 dark:text-gray-400">
                  Add New Model
                </p>
                <div>
                  <input
                    type="text"
                    value={newModelId}
                    onChange={(e) => setNewModelId(e.target.value)}
                    placeholder="Model ID (e.g., anthropic/claude-3-opus)"
                    className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded text-sm"
                  />
                </div>
                <div>
                  <input
                    type="text"
                    value={newModelName}
                    onChange={(e) => setNewModelName(e.target.value)}
                    placeholder="Display Name (e.g., Claude 3 Opus)"
                    className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded text-sm"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="number"
                    value={newContextSize}
                    onChange={(e) =>
                      setNewContextSize(parseInt(e.target.value) || 4096)
                    }
                    placeholder="Context Size"
                    className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded text-sm"
                  />
                  <input
                    type="number"
                    value={newMaxOutput}
                    onChange={(e) =>
                      setNewMaxOutput(parseInt(e.target.value) || 1000)
                    }
                    placeholder="Max Output"
                    className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded text-sm"
                  />
                </div>
                <button
                  onClick={handleAddModel}
                  className="w-full py-2 bg-green-600 hover:bg-green-700 text-white rounded text-sm font-medium"
                >
                  Add Model
                </button>
              </div>
            </div>

            <button
              onClick={handleSaveSettings}
              disabled={isSaving}
              className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium text-sm disabled:opacity-50"
            >
              {isSaving ? "Saving..." : "Save Settings"}
            </button>
          </div>
        )}

        <p className="text-xs text-gray-600 dark:text-gray-400 mt-2">
          Select the AI model used for story generation. Different models have
          unique strengths and context sizes.
        </p>
      </div>
    </div>
  );
}

// Basic Settings Component
interface BasicSettingsForm {
  story_name: string;
  player_name: string;
  player_summary: string;
  premise: string;
  max_chapters: number;
  points: number;
  momentum: number;
  maxMomentum: number;
}

function BasicSettings({
  form,
  onChange,
}: {
  form: BasicSettingsForm;
  onChange: (form: BasicSettingsForm) => void;
}) {
  return (
    <div className="space-y-5">
      <div>
        <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
          Story Name
        </label>
        <input
          type="text"
          value={form.story_name}
          onChange={(e) => onChange({ ...form, story_name: e.target.value })}
          className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
        />
      </div>
      <div>
        <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
          Player/Character Name
        </label>
        <input
          type="text"
          value={form.player_name}
          onChange={(e) => onChange({ ...form, player_name: e.target.value })}
          className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
        />
      </div>
      <div>
        <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
          Character Description
        </label>
        <textarea
          value={form.player_summary}
          onChange={(e) =>
            onChange({ ...form, player_summary: e.target.value })
          }
          className="w-full h-32 px-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
        />
      </div>
      <div>
        <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
          Story Premise
        </label>
        <textarea
          value={form.premise}
          onChange={(e) => onChange({ ...form, premise: e.target.value })}
          className="w-full h-24 px-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
        />
      </div>
      <div>
        <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
          Max Chapters
        </label>
        <input
          type="number"
          value={form.max_chapters}
          onChange={(e) =>
            onChange({ ...form, max_chapters: parseInt(e.target.value) || 0 })
          }
          className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
            Starting Points
          </label>
          <input
            type="number"
            min={0}
            value={form.points}
            onChange={(e) =>
              onChange({ ...form, points: parseInt(e.target.value) || 0 })
            }
            className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
        </div>
        <div>
          <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
            Starting Momentum
          </label>
          <input
            type="number"
            min={0}
            value={form.momentum}
            onChange={(e) =>
              onChange({ ...form, momentum: parseInt(e.target.value) || 0 })
            }
            className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
        </div>
        <div>
          <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
            Max Momentum
          </label>
          <input
            type="number"
            min={1}
            value={form.maxMomentum}
            onChange={(e) =>
              onChange({ ...form, maxMomentum: parseInt(e.target.value) || 1 })
            }
            className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
        </div>
      </div>
    </div>
  );
}

// Stats & Resources Editor
function StatsResourcesEditor({
  stats,
  resources,
  achievements,
  onUpdate,
}: {
  stats: Stat[];
  resources: Resource[];
  achievements: Achievement[];
  onUpdate: (updates: Partial<StoryData>) => void;
}) {
  const [localStats, setLocalStats] = useState<Stat[]>([...stats]);
  const [localResources, setLocalResources] = useState<Resource[]>([
    ...resources,
  ]);
  const [localAchievements, setLocalAchievements] = useState<Achievement[]>([
    ...achievements,
  ]);

  // Drag and edit state for stats
  const [draggedStatIndex, setDraggedStatIndex] = useState<number | null>(null);
  const [editingStatIndex, setEditingStatIndex] = useState<number | null>(null);
  const [editStat, setEditStat] = useState<Partial<Stat>>({});

  // Drag and edit state for resources
  const [draggedResourceIndex, setDraggedResourceIndex] = useState<
    number | null
  >(null);
  const [editingResourceIndex, setEditingResourceIndex] = useState<
    number | null
  >(null);
  const [editResource, setEditResource] = useState<Partial<Resource>>({});

  // Drag and edit state for achievements
  const [draggedAchievementIndex, setDraggedAchievementIndex] = useState<
    number | null
  >(null);
  const [editingAchievementIndex, setEditingAchievementIndex] = useState<
    number | null
  >(null);
  const [editAchievement, setEditAchievement] = useState<Partial<Achievement>>(
    {}
  );

  const updateStat = (index: number, field: keyof Stat, value: any) => {
    const updated = [...localStats];
    (updated[index] as any)[field] = value;
    setLocalStats(updated);
    onUpdate({ stats: updated });
  };

  const updateResource = (index: number, field: keyof Resource, value: any) => {
    const updated = [...localResources];
    (updated[index] as any)[field] = value;
    setLocalResources(updated);
    onUpdate({ resources: updated });
  };

  const addStat = () => {
    const newStat: Stat = {
      name: "New Stat",
      value: 50,
      description: "",
      symbol: "Star",
    };
    const updated = [...localStats, newStat];
    setLocalStats(updated);
    onUpdate({ stats: updated });
  };

  const removeStat = (index: number) => {
    const updated = localStats.filter((_, i) => i !== index);
    setLocalStats(updated);
    onUpdate({ stats: updated });
  };

  const addResource = () => {
    const newResource: Resource = {
      name: "New Resource",
      value: 100,
      maxValue: 100,
      description: "",
      symbol: "Gem",
    };
    const updated = [...localResources, newResource];
    setLocalResources(updated);
    onUpdate({ resources: updated });
  };

  const removeResource = (index: number) => {
    const updated = localResources.filter((_, i) => i !== index);
    setLocalResources(updated);
    onUpdate({ resources: updated });
  };

  const updateAchievement = (
    index: number,
    field: keyof Achievement,
    value: any
  ) => {
    const updated = [...localAchievements];
    (updated[index] as any)[field] = value;
    setLocalAchievements(updated);
    onUpdate({ achievements: updated });
  };

  const toggleAchievement = (index: number, achieved: boolean) => {
    const updated = [...localAchievements];
    updated[index] = {
      ...updated[index],
      dateAchieved: achieved ? new Date() : null,
    };
    setLocalAchievements(updated);
    onUpdate({ achievements: updated });
  };

  const addAchievement = () => {
    const newAchievement: Achievement = {
      title: "New Achievement",
      description: "",
      dateAchieved: null,
      points: 10,
      symbol: "Trophy",
    };
    const updated = [...localAchievements, newAchievement];
    setLocalAchievements(updated);
    onUpdate({ achievements: updated });
  };

  const removeAchievement = (index: number) => {
    const updated = localAchievements.filter((_, i) => i !== index);
    setLocalAchievements(updated);
    onUpdate({ achievements: updated });
  };

  // Stat drag-and-drop and edit handlers
  const handleStatDragStart = (index: number) => setDraggedStatIndex(index);
  const handleStatDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedStatIndex === null || draggedStatIndex === index) return;
    const updated = [...localStats];
    const [moved] = updated.splice(draggedStatIndex, 1);
    updated.splice(index, 0, moved);
    setLocalStats(updated);
    setDraggedStatIndex(index);
    onUpdate({ stats: updated });
  };
  const handleStatDragEnd = () => setDraggedStatIndex(null);
  const moveStatUp = (index: number) => {
    if (index === 0) return;
    const updated = [...localStats];
    [updated[index - 1], updated[index]] = [updated[index], updated[index - 1]];
    setLocalStats(updated);
    onUpdate({ stats: updated });
  };
  const moveStatDown = (index: number) => {
    if (index === localStats.length - 1) return;
    const updated = [...localStats];
    [updated[index], updated[index + 1]] = [updated[index + 1], updated[index]];
    setLocalStats(updated);
    onUpdate({ stats: updated });
  };
  const startEditStat = (index: number) => {
    setEditingStatIndex(index);
    setEditStat({ ...localStats[index] });
  };
  const cancelEditStat = () => {
    setEditingStatIndex(null);
    setEditStat({});
  };
  const saveEditStat = () => {
    if (editingStatIndex !== null && editStat.name && editStat.description) {
      const updated = [...localStats];
      updated[editingStatIndex] = editStat as Stat;
      setLocalStats(updated);
      onUpdate({ stats: updated });
      setEditingStatIndex(null);
      setEditStat({});
    }
  };

  // Resource drag-and-drop and edit handlers
  const handleResourceDragStart = (index: number) =>
    setDraggedResourceIndex(index);
  const handleResourceDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedResourceIndex === null || draggedResourceIndex === index) return;
    const updated = [...localResources];
    const [moved] = updated.splice(draggedResourceIndex, 1);
    updated.splice(index, 0, moved);
    setLocalResources(updated);
    setDraggedResourceIndex(index);
    onUpdate({ resources: updated });
  };
  const handleResourceDragEnd = () => setDraggedResourceIndex(null);
  const moveResourceUp = (index: number) => {
    if (index === 0) return;
    const updated = [...localResources];
    [updated[index - 1], updated[index]] = [updated[index], updated[index - 1]];
    setLocalResources(updated);
    onUpdate({ resources: updated });
  };
  const moveResourceDown = (index: number) => {
    if (index === localResources.length - 1) return;
    const updated = [...localResources];
    [updated[index], updated[index + 1]] = [updated[index + 1], updated[index]];
    setLocalResources(updated);
    onUpdate({ resources: updated });
  };
  const startEditResource = (index: number) => {
    setEditingResourceIndex(index);
    setEditResource({ ...localResources[index] });
  };
  const cancelEditResource = () => {
    setEditingResourceIndex(null);
    setEditResource({});
  };
  const saveEditResource = () => {
    if (
      editingResourceIndex !== null &&
      editResource.name &&
      editResource.description
    ) {
      const updated = [...localResources];
      updated[editingResourceIndex] = editResource as Resource;
      setLocalResources(updated);
      onUpdate({ resources: updated });
      setEditingResourceIndex(null);
      setEditResource({});
    }
  };

  // Achievement drag-and-drop and edit handlers
  const handleAchievementDragStart = (index: number) =>
    setDraggedAchievementIndex(index);
  const handleAchievementDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedAchievementIndex === null || draggedAchievementIndex === index)
      return;
    const updated = [...localAchievements];
    const [moved] = updated.splice(draggedAchievementIndex, 1);
    updated.splice(index, 0, moved);
    setLocalAchievements(updated);
    setDraggedAchievementIndex(index);
    onUpdate({ achievements: updated });
  };
  const handleAchievementDragEnd = () => setDraggedAchievementIndex(null);
  const moveAchievementUp = (index: number) => {
    if (index === 0) return;
    const updated = [...localAchievements];
    [updated[index - 1], updated[index]] = [updated[index], updated[index - 1]];
    setLocalAchievements(updated);
    onUpdate({ achievements: updated });
  };
  const moveAchievementDown = (index: number) => {
    if (index === localAchievements.length - 1) return;
    const updated = [...localAchievements];
    [updated[index], updated[index + 1]] = [updated[index + 1], updated[index]];
    setLocalAchievements(updated);
    onUpdate({ achievements: updated });
  };
  const startEditAchievement = (index: number) => {
    setEditingAchievementIndex(index);
    setEditAchievement({ ...localAchievements[index] });
  };
  const cancelEditAchievement = () => {
    setEditingAchievementIndex(null);
    setEditAchievement({});
  };
  const saveEditAchievement = () => {
    if (
      editingAchievementIndex !== null &&
      editAchievement.title &&
      editAchievement.description
    ) {
      const updated = [...localAchievements];
      updated[editingAchievementIndex] = editAchievement as Achievement;
      setLocalAchievements(updated);
      onUpdate({ achievements: updated });
      setEditingAchievementIndex(null);
      setEditAchievement({});
    }
  };

  return (
    <div className="space-y-6">
      {/* Stats Section */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h4 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <DynamicIcon name="BarChart2" className="w-6 h-6" /> Stats
          </h4>
          <button
            onClick={addStat}
            className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white text-sm rounded-lg"
          >
            + Add Stat
          </button>
        </div>
        <div className="space-y-3">
          <p className="text-xs text-gray-600 dark:text-gray-400">
            <DynamicIcon name="Lightbulb" className="w-3 h-3 inline mr-1" />{" "}
            Drag and drop to reorder (or use arrow buttons on mobile)
          </p>
          {localStats.map((stat, index) =>
            editingStatIndex === index ? (
              // Edit mode
              <div
                key={index}
                className="p-4 bg-blue-100 dark:bg-blue-900/40 rounded-lg border-2 border-blue-400"
              >
                <h5 className="text-sm font-bold mb-3 text-gray-900 dark:text-white">
                  <DynamicIcon name="Edit" className="w-4 h-4" /> Editing Stat
                </h5>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
                  <input
                    type="text"
                    value={editStat.name || ""}
                    onChange={(e) =>
                      setEditStat({ ...editStat, name: e.target.value })
                    }
                    placeholder="Stat name"
                    className="px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded text-gray-900 dark:text-white"
                  />
                  <div className="relative z-50">
                    <IconPicker
                      value={editStat.symbol || "Star"}
                      onChange={(icon) =>
                        setEditStat({ ...editStat, symbol: icon })
                      }
                    />
                  </div>
                  <input
                    type="number"
                    value={editStat.value || 0}
                    onChange={(e) =>
                      setEditStat({
                        ...editStat,
                        value: parseInt(e.target.value) || 0,
                      })
                    }
                    placeholder="Value"
                    className="px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded text-gray-900 dark:text-white"
                  />
                </div>
                <textarea
                  value={editStat.description || ""}
                  onChange={(e) =>
                    setEditStat({ ...editStat, description: e.target.value })
                  }
                  placeholder="Description"
                  className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded text-gray-900 dark:text-white mb-3"
                  rows={2}
                />
                <div className="flex gap-2">
                  <button
                    onClick={saveEditStat}
                    disabled={!editStat.name || !editStat.description}
                    className="flex-1 px-3 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white rounded"
                  >
                    <DynamicIcon name="Check" className="w-4 h-4 inline mr-1" />{" "}
                    Save
                  </button>
                  <button
                    onClick={cancelEditStat}
                    className="flex-1 px-3 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              // View mode with drag-drop
              <div
                key={index}
                draggable
                onDragStart={() => handleStatDragStart(index)}
                onDragOver={(e) => handleStatDragOver(e, index)}
                onDragEnd={handleStatDragEnd}
                className="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg cursor-move"
                style={{ opacity: draggedStatIndex === index ? 0.5 : 1 }}
              >
                <div className="flex items-start gap-3">
                  <div className="text-gray-400 dark:text-gray-500 cursor-grab active:cursor-grabbing mt-2">
                    <DynamicIcon name="GripVertical" className="w-5 h-5" />
                  </div>
                  <div className="flex-1 space-y-3">
                    <div className="flex items-center gap-2">
                      <DynamicIcon
                        name={stat.symbol}
                        className="w-8 h-8 text-blue-600 dark:text-blue-400"
                      />
                      <div>
                        <div className="font-bold text-gray-900 dark:text-white">
                          {stat.name}
                        </div>
                        <div className="text-sm text-gray-600 dark:text-gray-400">
                          {stat.description}
                        </div>
                        <div className="text-sm text-blue-600 dark:text-blue-400 font-semibold">
                          Value: {stat.value}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2">
                    <button
                      onClick={() => moveStatUp(index)}
                      disabled={index === 0}
                      className="w-8 h-8 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded text-xs"
                    >
                      <DynamicIcon name="ChevronUp" className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => moveStatDown(index)}
                      disabled={index === localStats.length - 1}
                      className="w-8 h-8 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded text-xs"
                    >
                      <DynamicIcon name="ChevronDown" className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => startEditStat(index)}
                      className="px-3 py-1 bg-yellow-600 hover:bg-yellow-700 text-white rounded text-xs"
                    >
                      <DynamicIcon name="Edit" className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => removeStat(index)}
                      className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-xs"
                    >
                      <DynamicIcon name="X" className="w-4 h-4 inline mr-1" />
                    </button>
                  </div>
                </div>
              </div>
            )
          )}
        </div>
      </div>

      {/* Resources Section */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h4 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <DynamicIcon name="Gem" className="w-6 h-6" /> Resources
          </h4>
          <button
            onClick={addResource}
            className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white text-sm rounded-lg"
          >
            + Add Resource
          </button>
        </div>
        <div className="space-y-3">
          {localResources.map((resource, index) =>
            editingResourceIndex === index ? (
              <div
                key={index}
                className="p-4 bg-blue-100 dark:bg-blue-900/40 border-2 border-blue-400 rounded-lg"
              >
                <div className="space-y-3">
                  <input
                    type="text"
                    value={editResource.name || ""}
                    onChange={(e) =>
                      setEditResource({ ...editResource, name: e.target.value })
                    }
                    placeholder="Resource name"
                    className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded text-gray-900 dark:text-white"
                  />
                  <div className="relative z-50">
                    <IconPicker
                      value={editResource.symbol || "Gem"}
                      onChange={(icon) =>
                        setEditResource({ ...editResource, symbol: icon })
                      }
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <input
                      type="number"
                      value={editResource.value ?? 0}
                      onChange={(e) =>
                        setEditResource({
                          ...editResource,
                          value: parseInt(e.target.value) || 0,
                        })
                      }
                      placeholder="Current"
                      className="px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded text-gray-900 dark:text-white"
                    />
                    <input
                      type="number"
                      value={editResource.maxValue ?? 0}
                      onChange={(e) =>
                        setEditResource({
                          ...editResource,
                          maxValue: parseInt(e.target.value) || 0,
                        })
                      }
                      placeholder="Max"
                      className="px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded text-gray-900 dark:text-white"
                    />
                  </div>
                  <textarea
                    value={editResource.description || ""}
                    onChange={(e) =>
                      setEditResource({
                        ...editResource,
                        description: e.target.value,
                      })
                    }
                    placeholder="Description"
                    className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded text-gray-900 dark:text-white"
                    rows={3}
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => saveEditResource()}
                      className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg"
                    >
                      Save
                    </button>
                    <button
                      onClick={cancelEditResource}
                      className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div
                key={index}
                draggable
                onDragStart={() => handleResourceDragStart(index)}
                onDragOver={(e) => handleResourceDragOver(e, index)}
                onDragEnd={handleResourceDragEnd}
                className={`p-4 bg-gray-50 dark:bg-gray-700 rounded-lg cursor-move flex items-center gap-3 ${
                  draggedResourceIndex === index ? "opacity-50" : ""
                }`}
              >
                <span className="text-gray-400 select-none">
                  <DynamicIcon name="GripVertical" className="w-5 h-5" />
                </span>
                <div className="flex-1">
                  <div className="font-medium text-gray-900 dark:text-white flex items-center gap-2">
                    <DynamicIcon
                      name={resource.symbol}
                      className="w-5 h-5 text-blue-600 dark:text-blue-400"
                    />
                    <span>
                      {resource.name}: {resource.value}/{resource.maxValue}
                    </span>
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">
                    {resource.description}
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  <button
                    onClick={() => moveResourceUp(index)}
                    disabled={index === 0}
                    className="w-8 h-8 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded flex items-center justify-center"
                    title="Move up"
                  >
                    <DynamicIcon name="ChevronUp" className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => moveResourceDown(index)}
                    disabled={index === localResources.length - 1}
                    className="w-8 h-8 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded flex items-center justify-center"
                    title="Move down"
                  >
                    <DynamicIcon name="ChevronDown" className="w-5 h-5" />
                  </button>
                </div>
                <button
                  onClick={() => startEditResource(index)}
                  className="px-3 py-1 bg-yellow-600 hover:bg-yellow-700 text-white rounded"
                >
                  <DynamicIcon name="Edit" className="w-4 h-4" />
                </button>
                <button
                  onClick={() => removeResource(index)}
                  className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded"
                >
                  Remove
                </button>
              </div>
            )
          )}
        </div>
      </div>

      {/* Achievements Editor */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h4 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <DynamicIcon name="Trophy" className="w-6 h-6" /> Achievements
          </h4>
          <button
            onClick={addAchievement}
            className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white text-sm rounded-lg"
          >
            + Add Achievement
          </button>
        </div>
        <div className="space-y-3">
          {localAchievements.map((achievement, index) =>
            editingAchievementIndex === index ? (
              <div
                key={index}
                className="p-4 bg-blue-100 dark:bg-blue-900/40 border-2 border-blue-400 rounded-lg"
              >
                <div className="space-y-3">
                  <input
                    type="text"
                    value={editAchievement.title || ""}
                    onChange={(e) =>
                      setEditAchievement({
                        ...editAchievement,
                        title: e.target.value,
                      })
                    }
                    placeholder="Title"
                    className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded text-gray-900 dark:text-white"
                  />
                  <div className="relative z-50">
                    <IconPicker
                      value={editAchievement.symbol || "Trophy"}
                      onChange={(icon) =>
                        setEditAchievement({ ...editAchievement, symbol: icon })
                      }
                    />
                  </div>
                  <input
                    type="number"
                    value={editAchievement.points ?? 0}
                    onChange={(e) =>
                      setEditAchievement({
                        ...editAchievement,
                        points: parseInt(e.target.value) || 0,
                      })
                    }
                    placeholder="Points"
                    className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded text-gray-900 dark:text-white"
                  />
                  <textarea
                    value={editAchievement.description || ""}
                    onChange={(e) =>
                      setEditAchievement({
                        ...editAchievement,
                        description: e.target.value,
                      })
                    }
                    placeholder="Description (shown to players)"
                    className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded text-gray-900 dark:text-white"
                    rows={3}
                  />
                  <input
                    type="text"
                    value={editAchievement.ai_hint || ""}
                    onChange={(e) =>
                      setEditAchievement({
                        ...editAchievement,
                        ai_hint: e.target.value,
                      })
                    }
                    placeholder="AI Hint (optional precise trigger conditions)"
                    className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded text-gray-900 dark:text-white"
                  />
                  <label className="flex items-center gap-2 text-gray-900 dark:text-white">
                    <input
                      type="checkbox"
                      checked={!!editAchievement.hidden}
                      onChange={(e) =>
                        setEditAchievement({
                          ...editAchievement,
                          hidden: e.target.checked,
                        })
                      }
                      className="w-4 h-4 rounded"
                    />
                    <span>
                      <DynamicIcon
                        name="Lock"
                        className="inline-block w-3 h-3 mr-1"
                      />
                      Hidden Achievement
                    </span>
                  </label>
                  <label className="flex items-center gap-2 text-gray-900 dark:text-white">
                    <input
                      type="checkbox"
                      checked={!!editAchievement.dateAchieved}
                      onChange={(e) =>
                        setEditAchievement({
                          ...editAchievement,
                          dateAchieved: e.target.checked ? new Date() : null,
                        })
                      }
                      className="w-4 h-4 rounded"
                    />
                    <span>Achieved</span>
                  </label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => saveEditAchievement()}
                      className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg"
                    >
                      Save
                    </button>
                    <button
                      onClick={cancelEditAchievement}
                      className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div
                key={index}
                draggable
                onDragStart={() => handleAchievementDragStart(index)}
                onDragOver={(e) => handleAchievementDragOver(e, index)}
                onDragEnd={handleAchievementDragEnd}
                className={`p-4 bg-gray-50 dark:bg-gray-700 rounded-lg cursor-move flex items-center gap-3 ${
                  draggedAchievementIndex === index ? "opacity-50" : ""
                }`}
              >
                <span className="text-gray-400 select-none">
                  <DynamicIcon name="GripVertical" className="w-5 h-5" />
                </span>
                <div className="flex-1">
                  <div className="flex items-center gap-2 font-medium text-gray-900 dark:text-white">
                    <div className="flex items-center gap-2">
                      <DynamicIcon
                        name={achievement.symbol}
                        className="w-5 h-5 text-yellow-600 dark:text-yellow-400"
                      />
                      <span>
                        {achievement.title} ({achievement.points} pts)
                      </span>
                      {achievement.dateAchieved && (
                        <span className="ml-2 text-green-500">
                          <DynamicIcon
                            name="Check"
                            className="w-4 h-4 inline mr-1"
                          />
                        </span>
                      )}
                    </div>
                    {achievement.hidden && (
                      <span className="px-2 py-0.5 bg-purple-200 dark:bg-purple-800/50 text-purple-800 dark:text-purple-200 rounded-full text-xs font-bold">
                        <DynamicIcon
                          name="Lock"
                          className="inline-block w-3 h-3 mr-1"
                        />
                        Hidden
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">
                    {achievement.description}
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  <button
                    onClick={() => moveAchievementUp(index)}
                    disabled={index === 0}
                    className="w-8 h-8 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded flex items-center justify-center"
                    title="Move up"
                  >
                    <DynamicIcon name="ChevronUp" className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => moveAchievementDown(index)}
                    disabled={index === localAchievements.length - 1}
                    className="w-8 h-8 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded flex items-center justify-center"
                    title="Move down"
                  >
                    <DynamicIcon name="ChevronDown" className="w-5 h-5" />
                  </button>
                </div>
                <button
                  onClick={() => startEditAchievement(index)}
                  className="px-3 py-1 bg-yellow-600 hover:bg-yellow-700 text-white rounded"
                >
                  <DynamicIcon name="Edit" className="w-4 h-4" />
                </button>
                <button
                  onClick={() => removeAchievement(index)}
                  className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded"
                >
                  Remove
                </button>
              </div>
            )
          )}
          {localAchievements.length === 0 && (
            <p className="text-sm text-gray-600 dark:text-gray-400">
              No achievements yet.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// Quest Editor
function QuestEditor({
  quests,
  onUpdate,
}: {
  quests: Quest[];
  onUpdate: (quests: Quest[]) => void;
}) {
  const [localQuests, setLocalQuests] = useState([...quests]);
  const [draggedQuestIndex, setDraggedQuestIndex] = useState<number | null>(
    null
  );
  const [editingQuestIndex, setEditingQuestIndex] = useState<number | null>(
    null
  );
  const [editQuest, setEditQuest] = useState<Quest | null>(null);

  useEffect(() => {
    onUpdate(localQuests);
  }, [localQuests, onUpdate]);

  const addQuest = () => {
    const newQuest: Quest = {
      id: `quest_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      title: "New Quest",
      shortDescription: "Quest objective",
      description: "Detailed quest description",
      active: true,
      fulfilled: false,
      points: 10,
      createdAt: new Date(),
    };
    setLocalQuests([...localQuests, newQuest]);
  };

  const removeQuest = (index: number) => {
    setLocalQuests(localQuests.filter((_, i) => i !== index));
  };

  const startEditQuest = (index: number) => {
    setEditingQuestIndex(index);
    setEditQuest({ ...localQuests[index] });
  };

  const saveEditQuest = () => {
    if (editingQuestIndex !== null && editQuest) {
      const updated = [...localQuests];
      updated[editingQuestIndex] = editQuest;
      setLocalQuests(updated);
      setEditingQuestIndex(null);
      setEditQuest(null);
    }
  };

  const cancelEditQuest = () => {
    setEditingQuestIndex(null);
    setEditQuest(null);
  };

  const moveQuestUp = (index: number) => {
    if (index > 0) {
      const updated = [...localQuests];
      [updated[index - 1], updated[index]] = [
        updated[index],
        updated[index - 1],
      ];
      setLocalQuests(updated);
    }
  };

  const moveQuestDown = (index: number) => {
    if (index < localQuests.length - 1) {
      const updated = [...localQuests];
      [updated[index], updated[index + 1]] = [
        updated[index + 1],
        updated[index],
      ];
      setLocalQuests(updated);
    }
  };

  const handleQuestDragStart = (index: number) => {
    setDraggedQuestIndex(index);
  };

  const handleQuestDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedQuestIndex === null || draggedQuestIndex === index) return;

    const updated = [...localQuests];
    const draggedQuest = updated[draggedQuestIndex];
    updated.splice(draggedQuestIndex, 1);
    updated.splice(index, 0, draggedQuest);

    setLocalQuests(updated);
    setDraggedQuestIndex(index);
  };

  const handleQuestDragEnd = () => {
    setDraggedQuestIndex(null);
  };

  return (
    <div>
      {/* Quests Editor */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h4 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <DynamicIcon name="Scroll" className="w-6 h-6" /> Quests
          </h4>
          <button
            onClick={addQuest}
            className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white text-sm rounded-lg"
          >
            + Add Quest
          </button>
        </div>
        <div className="space-y-3">
          {localQuests.map((quest, index) =>
            editingQuestIndex === index ? (
              <div
                key={quest.id}
                className="p-4 bg-blue-100 dark:bg-blue-900/40 border-2 border-blue-400 rounded-lg"
              >
                <div className="space-y-3">
                  <input
                    type="text"
                    value={editQuest?.title || ""}
                    onChange={(e) =>
                      setEditQuest({ ...editQuest!, title: e.target.value })
                    }
                    placeholder="Quest Title"
                    className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded text-gray-900 dark:text-white"
                  />
                  <input
                    type="text"
                    value={editQuest?.shortDescription || ""}
                    onChange={(e) =>
                      setEditQuest({
                        ...editQuest!,
                        shortDescription: e.target.value,
                      })
                    }
                    placeholder="Short Description"
                    className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded text-gray-900 dark:text-white"
                  />
                  <textarea
                    value={editQuest?.description || ""}
                    onChange={(e) =>
                      setEditQuest({
                        ...editQuest!,
                        description: e.target.value,
                      })
                    }
                    placeholder="Full Description"
                    className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded text-gray-900 dark:text-white"
                    rows={4}
                  />
                  <input
                    type="number"
                    value={editQuest?.points ?? 0}
                    onChange={(e) =>
                      setEditQuest({
                        ...editQuest!,
                        points: parseInt(e.target.value) || 0,
                      })
                    }
                    placeholder="Points"
                    className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded text-gray-900 dark:text-white"
                  />
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 text-gray-900 dark:text-white">
                      <input
                        type="checkbox"
                        checked={!!editQuest?.active}
                        onChange={(e) =>
                          setEditQuest({
                            ...editQuest!,
                            active: e.target.checked,
                          })
                        }
                        className="rounded"
                      />
                      <span>Active</span>
                    </label>
                    <label className="flex items-center gap-2 text-gray-900 dark:text-white">
                      <input
                        type="checkbox"
                        checked={!!editQuest?.fulfilled}
                        onChange={(e) =>
                          setEditQuest({
                            ...editQuest!,
                            fulfilled: e.target.checked,
                          })
                        }
                        className="rounded"
                      />
                      <span>Fulfilled</span>
                    </label>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => saveEditQuest()}
                      className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg"
                    >
                      Save
                    </button>
                    <button
                      onClick={cancelEditQuest}
                      className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div
                key={quest.id}
                draggable
                onDragStart={() => handleQuestDragStart(index)}
                onDragOver={(e) => handleQuestDragOver(e, index)}
                onDragEnd={handleQuestDragEnd}
                className={`p-4 bg-gray-50 dark:bg-gray-700 rounded-lg cursor-move flex items-center gap-3 ${
                  draggedQuestIndex === index ? "opacity-50" : ""
                }`}
              >
                <span className="text-gray-400 select-none">
                  <DynamicIcon name="GripVertical" className="w-5 h-5" />
                </span>
                <div className="flex-1">
                  <div className="flex items-center gap-2 font-medium text-gray-900 dark:text-white">
                    <span className="flex items-center gap-2">
                      <DynamicIcon
                        name="Scroll"
                        className="w-5 h-5 text-amber-600 dark:text-amber-400"
                      />
                      {quest.title} ({quest.points} pts)
                    </span>
                    {quest.active && !quest.fulfilled && (
                      <span className="px-2 py-0.5 bg-blue-200 dark:bg-blue-800/50 text-blue-800 dark:text-blue-200 rounded-full text-xs font-bold">
                        Active
                      </span>
                    )}
                    {quest.fulfilled && (
                      <span className="text-green-500">
                        <DynamicIcon
                          name="Check"
                          className="w-4 h-4 inline mr-1"
                        />
                      </span>
                    )}
                    {!quest.active && !quest.fulfilled && (
                      <span className="px-2 py-0.5 bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300 rounded-full text-xs font-bold">
                        Inactive
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">
                    {quest.shortDescription}
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  <button
                    onClick={() => moveQuestUp(index)}
                    disabled={index === 0}
                    className="w-8 h-8 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded flex items-center justify-center"
                    title="Move up"
                  >
                    <DynamicIcon name="ChevronUp" className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => moveQuestDown(index)}
                    disabled={index === localQuests.length - 1}
                    className="w-8 h-8 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded flex items-center justify-center"
                    title="Move down"
                  >
                    <DynamicIcon name="ChevronDown" className="w-5 h-5" />
                  </button>
                </div>
                <button
                  onClick={() => startEditQuest(index)}
                  className="px-3 py-1 bg-yellow-600 hover:bg-yellow-700 text-white rounded"
                >
                  <DynamicIcon name="Edit" className="w-4 h-4" />
                </button>
                <button
                  onClick={() => removeQuest(index)}
                  className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded"
                >
                  Remove
                </button>
              </div>
            )
          )}
          {localQuests.length === 0 && (
            <p className="text-sm text-gray-600 dark:text-gray-400">
              No quests yet.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// Inventory Editor
function InventoryEditor({
  inventory,
  onUpdate,
}: {
  inventory: InventoryItem[];
  onUpdate: (inventory: InventoryItem[]) => void;
}) {
  const [localInventory, setLocalInventory] = useState([...inventory]);
  const [draggedInventoryIndex, setDraggedInventoryIndex] = useState<
    number | null
  >(null);
  const [editingInventoryIndex, setEditingInventoryIndex] = useState<
    number | null
  >(null);
  const [editInventoryItem, setEditInventoryItem] = useState<
    Partial<InventoryItem>
  >({});

  // Drag-and-drop handlers for inventory
  const handleInventoryDragStart = (index: number) => {
    setDraggedInventoryIndex(index);
  };

  const handleInventoryDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedInventoryIndex === null || draggedInventoryIndex === index)
      return;

    const items = [...localInventory];
    const draggedItem = items[draggedInventoryIndex];
    items.splice(draggedInventoryIndex, 1);
    items.splice(index, 0, draggedItem);

    setLocalInventory(items);
    setDraggedInventoryIndex(index);
    onUpdate(items);
  };

  const handleInventoryDragEnd = () => {
    setDraggedInventoryIndex(null);
  };

  // Arrow button handlers for inventory
  const moveInventoryUp = (index: number) => {
    if (index === 0) return;
    const items = [...localInventory];
    [items[index - 1], items[index]] = [items[index], items[index - 1]];
    setLocalInventory(items);
    onUpdate(items);
  };

  const moveInventoryDown = (index: number) => {
    if (index === localInventory.length - 1) return;
    const items = [...localInventory];
    [items[index], items[index + 1]] = [items[index + 1], items[index]];
    setLocalInventory(items);
    onUpdate(items);
  };

  // Edit mode handlers for inventory
  const startEditInventoryItem = (index: number) => {
    setEditingInventoryIndex(index);
    setEditInventoryItem({ ...localInventory[index] });
  };

  const cancelEditInventoryItem = () => {
    setEditingInventoryIndex(null);
    setEditInventoryItem({});
  };

  const saveEditInventoryItem = (index: number) => {
    const items = [...localInventory];
    items[index] = { ...items[index], ...editInventoryItem };
    setLocalInventory(items);
    onUpdate(items);
    setEditingInventoryIndex(null);
    setEditInventoryItem({});
  };

  const updateItem = (
    index: number,
    field: keyof InventoryItem,
    value: any
  ) => {
    const updated = [...localInventory];
    (updated[index] as any)[field] = value;
    setLocalInventory(updated);
    onUpdate(updated);
  };

  const addItem = () => {
    const newItem: InventoryItem = {
      name: "New Item",
      quantity: 1,
      description: "",
      type: "normal",
      symbol: "Package",
    };
    const updated = [...localInventory, newItem];
    setLocalInventory(updated);
    onUpdate(updated);
  };

  const removeItem = (index: number) => {
    const updated = localInventory.filter((_, i) => i !== index);
    setLocalInventory(updated);
    onUpdate(updated);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <DynamicIcon name="Backpack" className="w-6 h-6" /> Inventory (
          {localInventory.length} items)
        </h4>
        <button
          onClick={addItem}
          className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white text-sm rounded-lg"
        >
          + Add Item
        </button>
      </div>
      <div className="space-y-3">
        {localInventory.map((item, index) =>
          editingInventoryIndex === index ? (
            <div
              key={index}
              className="p-4 bg-blue-100 dark:bg-blue-900/40 border-2 border-blue-400 rounded-lg"
            >
              <div className="space-y-3">
                <input
                  type="text"
                  value={editInventoryItem.name || ""}
                  onChange={(e) =>
                    setEditInventoryItem({
                      ...editInventoryItem,
                      name: e.target.value,
                    })
                  }
                  placeholder="Item name"
                  className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded text-gray-900 dark:text-white"
                />
                <div className="relative z-50">
                  <IconPicker
                    value={editInventoryItem.symbol || "Package"}
                    onChange={(icon) =>
                      setEditInventoryItem({
                        ...editInventoryItem,
                        symbol: icon,
                      })
                    }
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <input
                    type="number"
                    value={editInventoryItem.quantity ?? 1}
                    onChange={(e) =>
                      setEditInventoryItem({
                        ...editInventoryItem,
                        quantity: parseInt(e.target.value) || 1,
                      })
                    }
                    placeholder="Quantity"
                    className="px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded text-gray-900 dark:text-white"
                  />
                  <input
                    type="text"
                    value={editInventoryItem.type || ""}
                    onChange={(e) =>
                      setEditInventoryItem({
                        ...editInventoryItem,
                        type: e.target.value as
                          | "normal"
                          | "consumable"
                          | "story"
                          | "misc",
                      })
                    }
                    placeholder="Type"
                    className="px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded text-gray-900 dark:text-white"
                  />
                </div>
                <textarea
                  value={editInventoryItem.description || ""}
                  onChange={(e) =>
                    setEditInventoryItem({
                      ...editInventoryItem,
                      description: e.target.value,
                    })
                  }
                  placeholder="Description"
                  className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded text-gray-900 dark:text-white"
                  rows={3}
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => saveEditInventoryItem(index)}
                    className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg"
                  >
                    Save
                  </button>
                  <button
                    onClick={cancelEditInventoryItem}
                    className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div
              key={index}
              draggable
              onDragStart={() => handleInventoryDragStart(index)}
              onDragOver={(e) => handleInventoryDragOver(e, index)}
              onDragEnd={handleInventoryDragEnd}
              className={`p-4 bg-gray-50 dark:bg-gray-700 rounded-lg cursor-move flex items-center gap-3 ${
                draggedInventoryIndex === index ? "opacity-50" : ""
              }`}
            >
              <span className="text-gray-400 select-none">
                <DynamicIcon name="GripVertical" className="w-5 h-5" />
              </span>
              <div className="flex-1">
                <div className="font-medium text-gray-900 dark:text-white flex items-center gap-2">
                  <DynamicIcon
                    name={item.symbol}
                    className="w-5 h-5 text-gray-600 dark:text-gray-400"
                  />
                  <span>
                    {item.name} x{item.quantity} {item.type && `(${item.type})`}
                  </span>
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  {item.description}
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <button
                  onClick={() => moveInventoryUp(index)}
                  disabled={index === 0}
                  className="w-8 h-8 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded flex items-center justify-center"
                  title="Move up"
                >
                  <DynamicIcon name="ChevronUp" className="w-4 h-4" />
                </button>
                <button
                  onClick={() => moveInventoryDown(index)}
                  disabled={index === localInventory.length - 1}
                  className="w-8 h-8 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded flex items-center justify-center"
                  title="Move down"
                >
                  <DynamicIcon name="ChevronDown" className="w-5 h-5" />
                </button>
              </div>
              <button
                onClick={() => startEditInventoryItem(index)}
                className="px-3 py-1 bg-yellow-600 hover:bg-yellow-700 text-white rounded"
              >
                <DynamicIcon name="Edit" className="w-4 h-4" />
              </button>
              <button
                onClick={() => removeItem(index)}
                className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded"
              >
                Remove
              </button>
            </div>
          )
        )}
      </div>
    </div>
  );
}

// Lore Editor
function LoreEditor({
  lore,
  plotBeats,
  onUpdate,
}: {
  lore: StoryLore[];
  plotBeats: PlotBeat[];
  onUpdate: (lore: StoryLore[]) => void;
}) {
  const [localLore, setLocalLore] = useState([...lore]);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const [draggedLoreIndex, setDraggedLoreIndex] = useState<number | null>(null);
  const [editingLoreIndex, setEditingLoreIndex] = useState<number | null>(null);
  const [editLore, setEditLore] = useState<Partial<StoryLore>>({});
  const [editLoreAdvancedExpanded, setEditLoreAdvancedExpanded] =
    useState(false);
  const { addNotification } = useNotification();

  // Drag-and-drop handlers for lore
  const handleLoreDragStart = (index: number) => {
    setDraggedLoreIndex(index);
  };

  const handleLoreDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedLoreIndex === null || draggedLoreIndex === index) return;

    const items = [...localLore];
    const draggedItem = items[draggedLoreIndex];
    items.splice(draggedLoreIndex, 1);
    items.splice(index, 0, draggedItem);

    setLocalLore(items);
    setDraggedLoreIndex(index);
    onUpdate(items);
  };

  const handleLoreDragEnd = () => {
    setDraggedLoreIndex(null);
  };

  // Arrow button handlers for lore
  const moveLoreUp = (index: number) => {
    if (index === 0) return;
    const items = [...localLore];
    [items[index - 1], items[index]] = [items[index], items[index - 1]];
    setLocalLore(items);
    onUpdate(items);
  };

  const moveLoreDown = (index: number) => {
    if (index === localLore.length - 1) return;
    const items = [...localLore];
    [items[index], items[index + 1]] = [items[index + 1], items[index]];
    setLocalLore(items);
    onUpdate(items);
  };

  // Edit mode handlers for lore
  const startEditLore = (index: number) => {
    setEditingLoreIndex(index);
    setEditLore({ ...localLore[index] });
  };

  const cancelEditLore = () => {
    setEditingLoreIndex(null);
    setEditLore({});
  };

  const saveEditLore = (index: number) => {
    const items = [...localLore];
    items[index] = { ...items[index], ...editLore };
    setLocalLore(items);
    onUpdate(items);
    setEditingLoreIndex(null);
    setEditLore({});
  };

  const updateLore = (index: number, field: keyof StoryLore, value: any) => {
    const updated = [...localLore];
    (updated[index] as any)[field] = value;
    setLocalLore(updated);
    onUpdate(updated);
  };

  const addLore = () => {
    const newLore: StoryLore = {
      title: "New Lore Entry",
      content: "",
      relatedCharacters: [],
      relatedLocations: [],
      secrtet: false,
      keys: [],
      thumbnailUrl: "",
      on: true,
      alwaysOn: false,
      on_triggers: [],
      off_triggers: [],
      trigger_lores: [],
      untrigger_lores: [],
      beats_trigger: [],
      beats_untrigger: [],
    };
    const updated = [...localLore, newLore];
    setLocalLore(updated);
    onUpdate(updated);
  };

  const removeLore = (index: number) => {
    const updated = localLore.filter((_, i) => i !== index);
    setLocalLore(updated);
    onUpdate(updated);
  };

  const handleLoreThumbnailUpload = async (index: number, file: File) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      addNotification("Please select an image file", "warning");
      return;
    }
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        addNotification("Not authenticated", "failure");
        return;
      }

      const compressed = await compressImage(file, 320, 180, 0.8);

      const ext = file.name.split(".").pop();
      const fileName = `${Date.now()}-lore-thumb.${ext}`;
      const filePath = `${session.user.id}/lore-thumbnails/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from("adventure-images")
        .upload(filePath, compressed, { cacheControl: "3600", upsert: false });

      if (uploadError) throw uploadError;

      const { data } = supabase.storage
        .from("adventure-images")
        .getPublicUrl(filePath);

      const updated = [...localLore];
      updated[index] = { ...updated[index], thumbnailUrl: data.publicUrl };
      setLocalLore(updated);
      onUpdate(updated);
      addNotification("Thumbnail uploaded!", "success");
    } catch (err: any) {
      console.error("Lore thumbnail upload failed:", err);
      addNotification(err.message || "Upload failed", "failure");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-lg font-bold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
          <DynamicIcon name="Book" className="w-6 h-6" /> Lore Entries (
          {localLore.length})
        </h4>
        <button
          onClick={addLore}
          className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white text-sm rounded-lg"
        >
          + Add Lore
        </button>
      </div>
      <div className="space-y-3">
        {localLore.map((loreItem, index) =>
          editingLoreIndex === index ? (
            <div
              key={index}
              className="p-4 bg-blue-100 dark:bg-blue-900/40 border-2 border-blue-400 rounded-lg"
            >
              <div className="space-y-3">
                <input
                  type="text"
                  value={editLore.title || ""}
                  onChange={(e) =>
                    setEditLore({ ...editLore, title: e.target.value })
                  }
                  placeholder="Lore title"
                  className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded text-gray-900 dark:text-white font-semibold"
                />
                <textarea
                  value={editLore.content || ""}
                  onChange={(e) =>
                    setEditLore({ ...editLore, content: e.target.value })
                  }
                  placeholder="Lore content (supports Markdown)"
                  className="w-full h-32 px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded text-gray-900 dark:text-white resize-none"
                />
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-start">
                  <div className="sm:col-span-2">
                    <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                      Thumbnail URL (optional)
                    </label>
                    <input
                      type="url"
                      value={editLore.thumbnailUrl || ""}
                      onChange={(e) =>
                        setEditLore({
                          ...editLore,
                          thumbnailUrl: e.target.value,
                        })
                      }
                      placeholder="https://..."
                      className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded text-gray-900 dark:text-white"
                    />
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      Shown in lore list and detail if provided (ideal
                      ~320×180px, max 5MB).
                    </p>
                    <div className="mt-2 flex items-center gap-2">
                      <input
                        id={`upload-lore-thumb-edit-${index}`}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) handleLoreThumbnailUpload(index, f);
                        }}
                      />
                      <label
                        htmlFor={`upload-lore-thumb-edit-${index}`}
                        className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded cursor-pointer text-sm"
                      >
                        <DynamicIcon
                          name="Upload"
                          className="inline-block w-4 h-4 mr-1"
                        />
                        Upload Thumbnail
                      </label>
                      {editLore.thumbnailUrl && (
                        <button
                          onClick={() =>
                            setEditLore({ ...editLore, thumbnailUrl: "" })
                          }
                          className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-sm"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center justify-center">
                    {editLore.thumbnailUrl ? (
                      <img
                        src={editLore.thumbnailUrl}
                        alt={editLore.title || ""}
                        className="w-24 h-24 object-cover rounded border border-gray-300 dark:border-gray-600"
                      />
                    ) : (
                      <div className="w-24 h-24 rounded border-2 border-dashed border-gray-300 dark:border-gray-600 flex items-center justify-center text-xs text-gray-500 dark:text-gray-400">
                        No Preview
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                    <input
                      type="checkbox"
                      checked={editLore.secrtet ?? false}
                      onChange={(e) =>
                        setEditLore({ ...editLore, secrtet: e.target.checked })
                      }
                      className="rounded"
                    />
                    <span>
                      <DynamicIcon
                        name="Lock"
                        className="inline-block w-3 h-3 mr-1"
                      />
                      Secret Lore (hidden until discovered)
                    </span>
                  </label>
                  <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                    <input
                      type="checkbox"
                      checked={editLore.on !== false}
                      onChange={(e) =>
                        setEditLore({ ...editLore, on: e.target.checked })
                      }
                      className="rounded"
                    />
                    <span>
                      <DynamicIcon
                        name="CheckCircle"
                        className="inline-block w-4 h-4 mr-1 text-green-600"
                      />
                      Enabled
                    </span>
                  </label>
                  <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                    <input
                      type="checkbox"
                      checked={!!editLore.alwaysOn}
                      onChange={(e) =>
                        setEditLore({ ...editLore, alwaysOn: e.target.checked })
                      }
                      className="rounded"
                    />
                    <span>
                      <DynamicIcon
                        name="Circle"
                        className="inline-block w-4 h-4 mr-1 text-blue-500"
                      />
                      Always On
                    </span>
                  </label>
                </div>

                {/* ON/OFF Trigger Words */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                      <DynamicIcon
                        name="CheckCircle"
                        className="inline-block w-4 h-4 mr-1 text-green-600"
                      />
                      ON Trigger Words
                    </label>
                    <div className="space-y-2">
                      <div className="flex gap-2">
                        <input
                          type="text"
                          placeholder="e.g., 'Found the Ancient Map'"
                          className="flex-1 px-3 py-2 text-sm bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded text-gray-900 dark:text-white"
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              const input = e.currentTarget;
                              const value = input.value.trim();
                              if (
                                value &&
                                !(editLore.on_triggers || []).includes(value)
                              ) {
                                setEditLore({
                                  ...editLore,
                                  on_triggers: [
                                    ...(editLore.on_triggers || []),
                                    value,
                                  ],
                                });
                                input.value = "";
                              }
                            }
                          }}
                        />
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {(editLore.on_triggers || []).map((trigger, idx) => (
                          <span
                            key={idx}
                            className="px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded-full text-xs flex items-center gap-1"
                          >
                            <DynamicIcon
                              name="CheckCircle"
                              className="w-3 h-3"
                            />
                            {trigger}
                            <button
                              onClick={() =>
                                setEditLore({
                                  ...editLore,
                                  on_triggers: (
                                    editLore.on_triggers || []
                                  ).filter((_, i) => i !== idx),
                                })
                              }
                              className="hover:text-green-900 dark:hover:text-green-100"
                            >
                              ×
                            </button>
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                      <DynamicIcon
                        name="XCircle"
                        className="inline-block w-4 h-4 mr-1 text-red-600"
                      />
                      OFF Trigger Words
                    </label>
                    <div className="space-y-2">
                      <div className="flex gap-2">
                        <input
                          type="text"
                          placeholder="e.g., 'Destroyed the Map'"
                          className="flex-1 px-3 py-2 text-sm bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded text-gray-900 dark:text-white"
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              const input = e.currentTarget;
                              const value = input.value.trim();
                              if (
                                value &&
                                !(editLore.off_triggers || []).includes(value)
                              ) {
                                setEditLore({
                                  ...editLore,
                                  off_triggers: [
                                    ...(editLore.off_triggers || []),
                                    value,
                                  ],
                                });
                                input.value = "";
                              }
                            }
                          }}
                        />
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {(editLore.off_triggers || []).map((trigger, idx) => (
                          <span
                            key={idx}
                            className="px-2 py-1 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-full text-xs flex items-center gap-1"
                          >
                            <DynamicIcon name="XCircle" className="w-3 h-3" />
                            {trigger}
                            <button
                              onClick={() =>
                                setEditLore({
                                  ...editLore,
                                  off_triggers: (
                                    editLore.off_triggers || []
                                  ).filter((_, i) => i !== idx),
                                })
                              }
                              className="hover:text-red-900 dark:hover:text-red-100"
                            >
                              ×
                            </button>
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Advanced Triggers Section (Expandable) */}
                <div className="border border-gray-300 dark:border-gray-600 rounded-lg">
                  <button
                    onClick={() =>
                      setEditLoreAdvancedExpanded(!editLoreAdvancedExpanded)
                    }
                    className="w-full px-4 py-3 flex items-center justify-between bg-gray-50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                  >
                    <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                      <DynamicIcon
                        name="Settings"
                        className="inline-block w-4 h-4 mr-1"
                      />
                      Advanced Section
                    </span>
                    <span className="text-gray-500 dark:text-gray-400">
                      {editLoreAdvancedExpanded ? (
                        <DynamicIcon name="ChevronDown" className="w-4 h-4" />
                      ) : (
                        <DynamicIcon name="ChevronRight" className="w-4 h-4" />
                      )}
                    </span>
                  </button>

                  {editLoreAdvancedExpanded && (
                    <div className="p-4 space-y-4">
                      {/* Lore-based Triggers */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                            <DynamicIcon
                              name="CheckCircle"
                              className="inline-block w-4 h-4 mr-1 text-green-600"
                            />
                            Lores that turn this ON
                          </label>
                          <div className="max-h-40 overflow-y-auto border border-gray-300 dark:border-gray-600 rounded-lg p-2 bg-white dark:bg-gray-700">
                            {localLore.filter((_, i) => i !== index).length ===
                            0 ? (
                              <p className="text-xs text-gray-500 dark:text-gray-400 italic">
                                No other lore entries.
                              </p>
                            ) : (
                              localLore
                                .filter((_, i) => i !== index)
                                .map((loreEntry, loreIdx) => (
                                  <label
                                    key={loreIdx}
                                    className="flex items-center gap-2 px-2 py-1 hover:bg-gray-100 dark:hover:bg-gray-600 rounded cursor-pointer"
                                  >
                                    <input
                                      type="checkbox"
                                      checked={(
                                        editLore.trigger_lores || []
                                      ).includes(loreEntry.title)}
                                      onChange={(e) => {
                                        const current =
                                          editLore.trigger_lores || [];
                                        setEditLore({
                                          ...editLore,
                                          trigger_lores: e.target.checked
                                            ? [...current, loreEntry.title]
                                            : current.filter(
                                                (t) => t !== loreEntry.title
                                              ),
                                        });
                                      }}
                                      className="w-4 h-4 text-green-600 rounded"
                                    />
                                    <span className="text-xs text-gray-900 dark:text-white">
                                      {loreEntry.title}
                                    </span>
                                  </label>
                                ))
                            )}
                          </div>
                        </div>
                        <div>
                          <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                            <DynamicIcon
                              name="XCircle"
                              className="inline-block w-4 h-4 mr-1 text-red-600"
                            />
                            Lores that turn this OFF
                          </label>
                          <div className="max-h-40 overflow-y-auto border border-gray-300 dark:border-gray-600 rounded-lg p-2 bg-white dark:bg-gray-700">
                            {localLore.filter((_, i) => i !== index).length ===
                            0 ? (
                              <p className="text-xs text-gray-500 dark:text-gray-400 italic">
                                No other lore entries.
                              </p>
                            ) : (
                              localLore
                                .filter((_, i) => i !== index)
                                .map((loreEntry, loreIdx) => (
                                  <label
                                    key={loreIdx}
                                    className="flex items-center gap-2 px-2 py-1 hover:bg-gray-100 dark:hover:bg-gray-600 rounded cursor-pointer"
                                  >
                                    <input
                                      type="checkbox"
                                      checked={(
                                        editLore.untrigger_lores || []
                                      ).includes(loreEntry.title)}
                                      onChange={(e) => {
                                        const current =
                                          editLore.untrigger_lores || [];
                                        setEditLore({
                                          ...editLore,
                                          untrigger_lores: e.target.checked
                                            ? [...current, loreEntry.title]
                                            : current.filter(
                                                (t) => t !== loreEntry.title
                                              ),
                                        });
                                      }}
                                      className="w-4 h-4 text-red-600 rounded"
                                    />
                                    <span className="text-xs text-gray-900 dark:text-white">
                                      {loreEntry.title}
                                    </span>
                                  </label>
                                ))
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Plot Beat Triggers */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                            <DynamicIcon
                              name="CheckCircle"
                              className="inline-block w-4 h-4 mr-1 text-green-600"
                            />
                            Beats that turn this lore ON
                          </label>
                          <div className="max-h-40 overflow-y-auto border border-gray-300 dark:border-gray-600 rounded-lg p-2 bg-white dark:bg-gray-700">
                            {plotBeats.length === 0 ? (
                              <p className="text-xs text-gray-500 dark:text-gray-400 italic">
                                No plot beats yet.
                              </p>
                            ) : (
                              plotBeats.map((beat, beatIndex) => (
                                <label
                                  key={beatIndex}
                                  className="flex items-center gap-2 px-2 py-1 hover:bg-gray-100 dark:hover:bg-gray-600 rounded cursor-pointer"
                                >
                                  <input
                                    type="checkbox"
                                    checked={(
                                      editLore.beats_trigger || []
                                    ).includes(beatIndex)}
                                    onChange={(e) => {
                                      const current =
                                        editLore.beats_trigger || [];
                                      setEditLore({
                                        ...editLore,
                                        beats_trigger: e.target.checked
                                          ? [...current, beatIndex]
                                          : current.filter(
                                              (i) => i !== beatIndex
                                            ),
                                      });
                                    }}
                                    className="w-4 h-4 text-green-600 rounded"
                                  />
                                  <span className="text-xs text-gray-900 dark:text-white">
                                    {beat.title || `Beat ${beatIndex + 1}`}
                                  </span>
                                </label>
                              ))
                            )}
                          </div>
                        </div>
                        <div>
                          <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                            <DynamicIcon
                              name="XCircle"
                              className="inline-block w-4 h-4 mr-1 text-red-600"
                            />
                            Beats that turn this lore OFF
                          </label>
                          <div className="max-h-40 overflow-y-auto border border-gray-300 dark:border-gray-600 rounded-lg p-2 bg-white dark:bg-gray-700">
                            {plotBeats.length === 0 ? (
                              <p className="text-xs text-gray-500 dark:text-gray-400 italic">
                                No plot beats yet.
                              </p>
                            ) : (
                              plotBeats.map((beat, beatIndex) => (
                                <label
                                  key={beatIndex}
                                  className="flex items-center gap-2 px-2 py-1 hover:bg-gray-100 dark:hover:bg-gray-600 rounded cursor-pointer"
                                >
                                  <input
                                    type="checkbox"
                                    checked={(
                                      editLore.beats_untrigger || []
                                    ).includes(beatIndex)}
                                    onChange={(e) => {
                                      const current =
                                        editLore.beats_untrigger || [];
                                      setEditLore({
                                        ...editLore,
                                        beats_untrigger: e.target.checked
                                          ? [...current, beatIndex]
                                          : current.filter(
                                              (i) => i !== beatIndex
                                            ),
                                      });
                                    }}
                                    className="w-4 h-4 text-red-600 rounded"
                                  />
                                  <span className="text-xs text-gray-900 dark:text-white">
                                    {beat.title || `Beat ${beatIndex + 1}`}
                                  </span>
                                </label>
                              ))
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => saveEditLore(index)}
                    className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg"
                  >
                    Save
                  </button>
                  <button
                    onClick={cancelEditLore}
                    className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div
              key={index}
              draggable
              onDragStart={() => handleLoreDragStart(index)}
              onDragOver={(e) => handleLoreDragOver(e, index)}
              onDragEnd={handleLoreDragEnd}
              className={`p-4 bg-gray-50 dark:bg-gray-700 rounded-lg cursor-move flex items-center gap-3 ${
                draggedLoreIndex === index ? "opacity-50" : ""
              }`}
            >
              <span className="text-gray-400 select-none">
                <DynamicIcon name="GripVertical" className="w-5 h-5" />
              </span>
              <div className="flex-1">
                <div className="font-medium text-gray-900 dark:text-white flex items-center gap-2">
                  {loreItem.secrtet && (
                    <DynamicIcon
                      name="Lock"
                      className="w-4 h-4 text-gray-500"
                    />
                  )}
                  {loreItem.title}
                  {/* On/Off Toggle */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      const updated = [...localLore];
                      updated[index] = { ...loreItem, on: !loreItem.on };
                      setLocalLore(updated);
                      onUpdate(updated);
                    }}
                    className={`px-2 py-1 rounded-full text-xs font-semibold transition-colors ${
                      loreItem.on
                        ? "bg-green-600 text-white hover:bg-green-700"
                        : "bg-gray-400 text-white hover:bg-gray-500"
                    }`}
                    title={loreItem.on ? "Lore is enabled" : "Lore is disabled"}
                  >
                    {loreItem.on ? "ON" : "OFF"}
                  </button>
                </div>
                {loreItem.thumbnailUrl && (
                  <img
                    src={loreItem.thumbnailUrl}
                    alt={loreItem.title}
                    className="mt-2 w-20 h-20 object-cover rounded border border-gray-300 dark:border-gray-600"
                  />
                )}
                <div className="text-sm text-gray-600 dark:text-gray-400 mt-1 line-clamp-2">
                  {loreItem.content}
                </div>
                {loreItem.on_triggers && loreItem.on_triggers.length > 0 && (
                  <div className="text-xs text-green-700 dark:text-green-400 mt-1 flex items-center gap-1">
                    <strong className="flex items-center gap-1">
                      <DynamicIcon name="CheckCircle" className="w-3 h-3" /> ON
                      Triggers:
                    </strong>{" "}
                    {loreItem.on_triggers.join(", ")}
                  </div>
                )}
                {loreItem.off_triggers && loreItem.off_triggers.length > 0 && (
                  <div className="text-xs text-red-700 dark:text-red-400 mt-1 flex items-center gap-1">
                    <strong className="flex items-center gap-1">
                      <DynamicIcon name="XCircle" className="w-3 h-3" /> OFF
                      Triggers:
                    </strong>{" "}
                    {loreItem.off_triggers.join(", ")}
                  </div>
                )}
                {loreItem.beats_trigger &&
                  loreItem.beats_trigger.length > 0 && (
                    <div className="text-xs text-green-700 dark:text-green-400 mt-1 flex items-center gap-1">
                      <strong className="flex items-center gap-1">
                        <DynamicIcon name="CheckCircle" className="w-3 h-3" />{" "}
                        Beats turning ON:
                      </strong>{" "}
                      {loreItem.beats_trigger
                        .map((i) => plotBeats[i]?.title || `Beat ${i + 1}`)
                        .join(", ")}
                    </div>
                  )}
                {loreItem.beats_untrigger &&
                  loreItem.beats_untrigger.length > 0 && (
                    <div className="text-xs text-red-700 dark:text-red-400 mt-1 flex items-center gap-1">
                      <strong className="flex items-center gap-1">
                        <DynamicIcon name="XCircle" className="w-3 h-3" /> Beats
                        turning OFF:
                      </strong>{" "}
                      {loreItem.beats_untrigger
                        .map((i) => plotBeats[i]?.title || `Beat ${i + 1}`)
                        .join(", ")}
                    </div>
                  )}
              </div>
              <div className="flex flex-col gap-1">
                <button
                  onClick={() => moveLoreUp(index)}
                  disabled={index === 0}
                  className="w-8 h-8 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded flex items-center justify-center"
                  title="Move up"
                >
                  <DynamicIcon name="ChevronUp" className="w-4 h-4" />
                </button>
                <button
                  onClick={() => moveLoreDown(index)}
                  disabled={index === localLore.length - 1}
                  className="w-8 h-8 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded flex items-center justify-center"
                  title="Move down"
                >
                  <DynamicIcon name="ChevronDown" className="w-5 h-5" />
                </button>
              </div>
              <button
                onClick={() => startEditLore(index)}
                className="px-3 py-1 bg-yellow-600 hover:bg-yellow-700 text-white rounded"
              >
                <DynamicIcon name="Edit" className="w-4 h-4" />
              </button>
              <button
                onClick={() => removeLore(index)}
                className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded"
              >
                Remove
              </button>
            </div>
          )
        )}
      </div>
    </div>
  );
}

// Relationships Editor
function RelationshipsEditor({
  relationships,
  onUpdate,
}: {
  relationships: Relationship[];
  onUpdate: (relationships: Relationship[]) => void;
}) {
  const { addNotification } = useNotification();
  const [localRelationships, setLocalRelationships] = useState<Relationship[]>([
    ...relationships,
  ]);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editRelationship, setEditRelationship] = useState<
    Partial<Relationship>
  >({});

  // Helper function to get relationship symbol based on value
  const getRelationshipSymbol = (value: number): string => {
    if (value >= 75) return "💚"; // Strong ally
    if (value >= 50) return "💙"; // Ally
    if (value >= 25) return "😊"; // Friendly
    if (value >= 0) return "🤝"; // Neutral/Acquaintance
    if (value >= -25) return "😐"; // Distant
    if (value >= -50) return "😠"; // Unfriendly
    if (value >= -75) return "💔"; // Hostile
    return "⚔️"; // Enemy
  };

  const addRelationship = () => {
    const newRel: Relationship = {
      name: "New Relationship",
      value: 0,
      description: "Describe this relationship...",
      symbol: "🤝",
    };
    const updated = [...localRelationships, newRel];
    setLocalRelationships(updated);
    onUpdate(updated);
  };

  const removeRelationship = (index: number) => {
    const updated = localRelationships.filter((_, i) => i !== index);
    setLocalRelationships(updated);
    onUpdate(updated);
  };

  const startEdit = (index: number) => {
    setEditingIndex(index);
    setEditRelationship({ ...localRelationships[index] });
  };

  const cancelEdit = () => {
    setEditingIndex(null);
    setEditRelationship({});
  };

  const saveEdit = () => {
    if (
      editingIndex !== null &&
      editRelationship.name &&
      editRelationship.description
    ) {
      const value = Math.max(-100, Math.min(100, editRelationship.value ?? 0));
      const updated = [...localRelationships];
      updated[editingIndex] = {
        ...editRelationship,
        value,
        symbol: getRelationshipSymbol(value),
      } as Relationship;
      setLocalRelationships(updated);
      onUpdate(updated);
      setEditingIndex(null);
      setEditRelationship({});
      addNotification("Relationship updated!", "success");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-lg font-bold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
          <DynamicIcon name="Users" className="w-6 h-6" /> Relationships (
          {localRelationships.length})
        </h4>
        <button
          onClick={addRelationship}
          className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white text-sm rounded-lg"
        >
          + Add Relationship
        </button>
      </div>
      <div className="space-y-3">
        {localRelationships.map((rel, index) =>
          editingIndex === index ? (
            <div
              key={index}
              className="p-4 bg-pink-100 dark:bg-pink-900/40 border-2 border-pink-400 rounded-lg"
            >
              <div className="space-y-3">
                <input
                  type="text"
                  value={editRelationship.name || ""}
                  onChange={(e) =>
                    setEditRelationship({
                      ...editRelationship,
                      name: e.target.value,
                    })
                  }
                  placeholder="Character/Faction/Organization Name"
                  className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded text-gray-900 dark:text-white font-semibold"
                />
                <div>
                  <label className="flex text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2 items-center justify-between">
                    <span>
                      Relationship Value: {editRelationship.value ?? 0}
                    </span>
                    <span className="text-2xl">
                      {getRelationshipSymbol(editRelationship.value ?? 0)}
                    </span>
                  </label>
                  <input
                    type="range"
                    min="-100"
                    max="100"
                    value={editRelationship.value ?? 0}
                    onChange={(e) =>
                      setEditRelationship({
                        ...editRelationship,
                        value: parseInt(e.target.value),
                      })
                    }
                    className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer"
                    style={{
                      background: `linear-gradient(to right, 
                        #ef4444 0%, 
                        #f59e0b 25%, 
                        #84cc16 50%, 
                        #10b981 75%, 
                        #06b6d4 100%)`,
                    }}
                  />
                  <div className="flex justify-between text-xs text-gray-600 dark:text-gray-400 mt-1">
                    <span>⚔️ -100 (Enemy)</span>
                    <span>🤝 0 (Neutral)</span>
                    <span>💚 +100 (Ally)</span>
                  </div>
                </div>
                <textarea
                  value={editRelationship.description || ""}
                  onChange={(e) =>
                    setEditRelationship({
                      ...editRelationship,
                      description: e.target.value,
                    })
                  }
                  placeholder="Describe the relationship..."
                  className="w-full h-24 px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded text-gray-900 dark:text-white resize-none"
                />
                <div className="flex gap-2">
                  <button
                    onClick={saveEdit}
                    disabled={
                      !editRelationship.name || !editRelationship.description
                    }
                    className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white rounded"
                  >
                    <DynamicIcon
                      name="Save"
                      className="inline-block w-4 h-4 mr-1"
                    />
                    Save
                  </button>
                  <button
                    onClick={cancelEdit}
                    className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div
              key={index}
              className="flex items-start gap-3 p-4 bg-pink-50 dark:bg-pink-900/20 rounded-lg border border-pink-200 dark:border-pink-800"
            >
              <div className="text-3xl shrink-0">{rel.symbol}</div>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-gray-900 dark:text-white flex items-center gap-2 flex-wrap mb-1">
                  <span>{rel.name}</span>
                  <span
                    className={`text-sm px-2 py-0.5 rounded-full ${
                      rel.value >= 50
                        ? "bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200"
                        : rel.value >= 0
                        ? "bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200"
                        : rel.value >= -50
                        ? "bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-200"
                        : "bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200"
                    }`}
                  >
                    {rel.value > 0 ? "+" : ""}
                    {rel.value}
                  </span>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {rel.description}
                </p>
              </div>
              <div className="flex gap-2 shrink-0">
                <button
                  onClick={() => startEdit(index)}
                  className="px-3 py-1 bg-yellow-600 hover:bg-yellow-700 text-white rounded"
                >
                  <DynamicIcon name="Edit" className="w-4 h-4" />
                </button>
                <button
                  onClick={() => removeRelationship(index)}
                  className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded"
                >
                  <DynamicIcon name="Trash2" className="w-4 h-4" />
                </button>
              </div>
            </div>
          )
        )}
        {localRelationships.length === 0 && (
          <div className="p-8 text-center rounded-lg bg-gray-50 dark:bg-gray-700/30 border-2 border-dashed border-gray-300 dark:border-gray-600">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              No relationships yet. Add relationships to track your standing
              with characters, factions, and organizations.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// Story Meta Editor
function StoryMetaEditor({
  plotBeats,
  memory,
  premise,
  authorNotes,
  onUpdate,
}: {
  plotBeats: PlotBeat[];
  memory: string[];
  premise: string;
  authorNotes?: string;
  onUpdate: (updates: Partial<StoryData>) => void;
}) {
  const [localPlotBeats, setLocalPlotBeats] = useState<PlotBeat[]>([
    ...plotBeats,
  ]);
  const [localAuthorNotes, setLocalAuthorNotes] = useState<string>(
    authorNotes || ""
  );
  const [localMemory, setLocalMemory] = useState<string[]>([...memory]);
  const [newMemoryEntry, setNewMemoryEntry] = useState<string>("");
  const [draggedPlotBeatIndex, setDraggedPlotBeatIndex] = useState<
    number | null
  >(null);
  const [editingPlotBeatIndex, setEditingPlotBeatIndex] = useState<
    number | null
  >(null);
  const [editPlotBeat, setEditPlotBeat] = useState<Partial<PlotBeat>>({});

  const updateBeat = (index: number, field: keyof PlotBeat, value: any) => {
    const updated = [...localPlotBeats];
    (updated[index] as any)[field] = value;
    setLocalPlotBeats(updated);
    onUpdate({ plot_beats: updated });
  };

  const addBeat = () => {
    const newBeat: PlotBeat = {
      title: "New plot beat",
      content: "Description...",
      fulfilled: false,
    };
    const updated = [...localPlotBeats, newBeat];
    setLocalPlotBeats(updated);
    onUpdate({ plot_beats: updated });
  };

  const removeBeat = (index: number) => {
    const updated = localPlotBeats.filter((_, i) => i !== index);
    setLocalPlotBeats(updated);
    onUpdate({ plot_beats: updated });
  };

  const handlePlotBeatDragStart = (index: number) => {
    setDraggedPlotBeatIndex(index);
  };

  const handlePlotBeatDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedPlotBeatIndex === null || draggedPlotBeatIndex === index) return;

    const newPlotBeats = [...localPlotBeats];
    const draggedItem = newPlotBeats[draggedPlotBeatIndex];
    newPlotBeats.splice(draggedPlotBeatIndex, 1);
    newPlotBeats.splice(index, 0, draggedItem);

    setLocalPlotBeats(newPlotBeats);
    setDraggedPlotBeatIndex(index);
    onUpdate({ plot_beats: newPlotBeats });
  };

  const handlePlotBeatDragEnd = () => {
    setDraggedPlotBeatIndex(null);
  };

  const movePlotBeatUp = (index: number) => {
    if (index === 0) return;
    const newPlotBeats = [...localPlotBeats];
    [newPlotBeats[index - 1], newPlotBeats[index]] = [
      newPlotBeats[index],
      newPlotBeats[index - 1],
    ];
    setLocalPlotBeats(newPlotBeats);
    onUpdate({ plot_beats: newPlotBeats });
  };

  const movePlotBeatDown = (index: number) => {
    if (index === localPlotBeats.length - 1) return;
    const newPlotBeats = [...localPlotBeats];
    [newPlotBeats[index], newPlotBeats[index + 1]] = [
      newPlotBeats[index + 1],
      newPlotBeats[index],
    ];
    setLocalPlotBeats(newPlotBeats);
    onUpdate({ plot_beats: newPlotBeats });
  };

  const startEditPlotBeat = (index: number) => {
    setEditingPlotBeatIndex(index);
    setEditPlotBeat({ ...localPlotBeats[index] });
  };

  const cancelEditPlotBeat = () => {
    setEditingPlotBeatIndex(null);
    setEditPlotBeat({});
  };

  const saveEditPlotBeat = () => {
    if (
      editingPlotBeatIndex !== null &&
      editPlotBeat.title &&
      editPlotBeat.content
    ) {
      const updated = [...localPlotBeats];
      updated[editingPlotBeatIndex] = editPlotBeat as PlotBeat;
      setLocalPlotBeats(updated);
      onUpdate({ plot_beats: updated });
      setEditingPlotBeatIndex(null);
      setEditPlotBeat({});
    }
  };

  return (
    <div className="space-y-6">
      {/* Plot Beats */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h4 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <DynamicIcon name="BookOpen" className="w-6 h-6" /> Plot Beats
          </h4>
          <button
            onClick={addBeat}
            className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white text-sm rounded-lg"
          >
            + Add Beat
          </button>
        </div>
        <p className="text-xs text-gray-600 dark:text-gray-400 mb-3">
          <DynamicIcon name="Lightbulb" className="w-3 h-3 inline mr-1" /> Drag
          and drop to reorder (or use arrow buttons on mobile)
        </p>
        <div className="space-y-3">
          {localPlotBeats.map((beat, index) => (
            <div
              key={index}
              draggable={editingPlotBeatIndex !== index}
              onDragStart={() => handlePlotBeatDragStart(index)}
              onDragOver={(e) => handlePlotBeatDragOver(e, index)}
              onDragEnd={handlePlotBeatDragEnd}
              className={`p-4 bg-gray-50 dark:bg-gray-700 rounded-lg transition-opacity ${
                editingPlotBeatIndex === index ? "" : "cursor-move"
              } ${
                draggedPlotBeatIndex === index ? "opacity-50" : "opacity-100"
              }`}
            >
              {editingPlotBeatIndex === index ? (
                // Edit mode
                <div className="space-y-3">
                  <h5 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
                    <DynamicIcon name="Edit" className="w-4 h-4" /> Editing Plot
                    Beat
                  </h5>
                  <input
                    type="text"
                    value={editPlotBeat.title || ""}
                    onChange={(e) =>
                      setEditPlotBeat({
                        ...editPlotBeat,
                        title: e.target.value,
                      })
                    }
                    placeholder="Title"
                    className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded text-gray-900 dark:text-white"
                  />
                  <textarea
                    value={editPlotBeat.content || ""}
                    onChange={(e) =>
                      setEditPlotBeat({
                        ...editPlotBeat,
                        content: e.target.value,
                      })
                    }
                    placeholder="Content"
                    rows={3}
                    className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded text-gray-900 dark:text-white resize-none"
                  />
                  <div>
                    <input
                      type="number"
                      value={editPlotBeat.points ?? ""}
                      onChange={(e) =>
                        setEditPlotBeat({
                          ...editPlotBeat,
                          points: e.target.value
                            ? parseInt(e.target.value)
                            : undefined,
                        })
                      }
                      placeholder="Points (default: 25)"
                      min="0"
                      className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded text-gray-900 dark:text-white"
                    />
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 flex items-center gap-1">
                      <DynamicIcon name="Coins" className="w-3 h-3" /> Custom
                      points reward
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={saveEditPlotBeat}
                      disabled={!editPlotBeat.title || !editPlotBeat.content}
                      className="flex-1 px-3 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white rounded"
                    >
                      <DynamicIcon
                        name="Check"
                        className="w-4 h-4 inline mr-1"
                      />{" "}
                      Save
                    </button>
                    <button
                      onClick={cancelEditPlotBeat}
                      className="flex-1 px-3 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                // View mode
                <div className="flex items-start gap-3">
                  <div className="text-xl cursor-grab active:cursor-grabbing select-none pt-1">
                    <DynamicIcon name="GripVertical" className="w-5 h-5" />
                  </div>
                  <div className="flex-1">
                    <div className="font-bold text-gray-900 dark:text-white mb-1">
                      {beat.title}
                    </div>
                    <div className="text-sm text-gray-600 dark:text-gray-300 mb-2">
                      {beat.content}
                    </div>
                    {beat.points !== undefined && (
                      <div className="text-xs text-orange-600 dark:text-orange-400 mb-2 font-semibold flex items-center gap-1">
                        <DynamicIcon name="Coins" className="w-3 h-3" />{" "}
                        {beat.points} points
                      </div>
                    )}
                    <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                      <input
                        type="checkbox"
                        checked={beat.fulfilled || false}
                        onChange={(e) =>
                          updateBeat(index, "fulfilled", e.target.checked)
                        }
                        className="rounded"
                      />
                      <span>
                        <DynamicIcon
                          name="Check"
                          className="w-4 h-4 inline mr-1"
                        />{" "}
                        Fulfilled
                      </span>
                    </label>
                  </div>
                  <div className="flex flex-col gap-2">
                    <div className="flex gap-1">
                      <button
                        onClick={() => movePlotBeatUp(index)}
                        disabled={index === 0}
                        className="px-2 py-1 bg-gray-600 hover:bg-gray-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded text-xs"
                        title="Move up"
                      >
                        <DynamicIcon name="ChevronUp" className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => movePlotBeatDown(index)}
                        disabled={index === localPlotBeats.length - 1}
                        className="px-2 py-1 bg-gray-600 hover:bg-gray-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded text-xs"
                        title="Move down"
                      >
                        <DynamicIcon name="ChevronDown" className="w-4 h-4" />
                      </button>
                    </div>
                    <button
                      onClick={() => startEditPlotBeat(index)}
                      className="px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs"
                    >
                      <DynamicIcon name="Edit" className="w-4 h-4" /> Edit
                    </button>
                    <button
                      onClick={() => removeBeat(index)}
                      className="px-2 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-xs"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Author Notes */}
      <div>
        <h4 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
          <DynamicIcon name="Edit3" className="w-6 h-6" /> Author Notes
        </h4>
        <textarea
          value={localAuthorNotes}
          onChange={(e) => {
            setLocalAuthorNotes(e.target.value);
            onUpdate({ author_notes: e.target.value });
          }}
          placeholder="Add notes for the adventure creator or AI storyteller (these notes guide the narrative direction)..."
          className="w-full h-32 px-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
        />
        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
          <DynamicIcon name="Lightbulb" className="w-3 h-3 inline mr-1" /> These
          notes help guide the AI in maintaining story consistency and tone
        </p>
      </div>

      {/* Memory Entries (Editable) */}
      <div>
        <h4 className="text-lg font-bold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
          <DynamicIcon name="Brain" className="w-6 h-6" /> Memory Entries (
          {localMemory.length})
        </h4>
        <div className="space-y-3">
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Add new memory entry..."
              value={newMemoryEntry}
              onChange={(e) => setNewMemoryEntry(e.target.value)}
              className="flex-1 px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded text-gray-900 dark:text-white"
            />
            <button
              onClick={() => {
                const trimmed = newMemoryEntry.trim();
                if (!trimmed) return;
                const updated = [...localMemory, trimmed];
                setLocalMemory(updated);
                onUpdate({ memory: updated });
                setNewMemoryEntry("");
              }}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded"
            >
              Add
            </button>
          </div>
          <div className="max-h-60 overflow-y-auto space-y-2">
            {localMemory.map((entry, index) => (
              <div
                key={index}
                className="p-3 bg-gray-50 dark:bg-gray-700 rounded text-sm text-gray-700 dark:text-gray-300 flex justify-between items-center"
              >
                <span className="pr-2 flex-1">{entry}</span>
                <button
                  onClick={() => {
                    const updated = localMemory.filter((_, i) => i !== index);
                    setLocalMemory(updated);
                    onUpdate({ memory: updated });
                  }}
                  className="px-2 py-1 bg-red-600 hover:bg-red-700 text-white text-xs rounded"
                >
                  Remove
                </button>
              </div>
            ))}
            {localMemory.length === 0 && (
              <p className="text-xs text-gray-500 dark:text-gray-400 italic">
                No memory entries yet.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

interface MenuProps extends StoryData {
  storyDbId: string | null;
  onSaveProgress: () => Promise<void>;
  onUpdateStoryData: (updates: Partial<StoryData>) => void;
  onViewLogs?: () => void;
  onViewContext?: () => void;
}

export default function MenuPage({
  storyDbId,
  onSaveProgress,
  onUpdateStoryData,
  onViewLogs,
  onViewContext,
  ...storyData
}: MenuProps) {
  const router = useRouter();
  const { addNotification } = useNotification();
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [editingNotes, setEditingNotes] = useState(false);
  const [playerNotes, setPlayerNotes] = useState(storyData.player_notes || "");

  // Settings form state
  const [settingsForm, setSettingsForm] = useState<BasicSettingsForm>({
    story_name: storyData.story_name,
    player_name: storyData.player_name,
    player_summary: storyData.player_summary,
    premise: storyData.premise,
    max_chapters: storyData.max_chapters,
    points: storyData.points,
    momentum: storyData.momentum,
    maxMomentum: storyData.maxMomentum,
  });

  // Advanced editing states
  const [editingStats, setEditingStats] = useState(false);
  const [editingResources, setEditingResources] = useState(false);
  const [editingInventory, setEditingInventory] = useState(false);
  const [editingAchievements, setEditingAchievements] = useState(false);
  const [editingLore, setEditingLore] = useState(false);
  const [editingPlotBeats, setEditingPlotBeats] = useState(false);
  const [activeTab, setActiveTab] = useState<
    | "basic"
    | "stats"
    | "inventory"
    | "quests"
    | "lore"
    | "relationships"
    | "story"
    | "tts"
  >("basic");
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    icon?: string;
    confirmText?: string;
    confirmButtonClass?: string;
  }>({
    isOpen: false,
    title: "",
    message: "",
    onConfirm: () => {},
  });

  const handleSaveProgress = async () => {
    setSaving(true);
    try {
      await onSaveProgress();
      addNotification("Progress saved successfully!", "success");
    } catch (error) {
      addNotification("Failed to save progress", "failure");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveNotes = async () => {
    try {
      onUpdateStoryData({ player_notes: playerNotes });
      await onSaveProgress();
      setEditingNotes(false);
      addNotification("Notes saved!", "success");
    } catch (error) {
      addNotification("Failed to save notes", "failure");
    }
  };

  const handleSaveSettings = async () => {
    try {
      onUpdateStoryData({
        story_name: settingsForm.story_name,
        player_name: settingsForm.player_name,
        player_summary: settingsForm.player_summary,
        premise: settingsForm.premise,
        max_chapters: settingsForm.max_chapters,
        points: settingsForm.points,
        momentum: settingsForm.momentum,
        maxMomentum: settingsForm.maxMomentum,
      });
      await onSaveProgress();
      setShowSettings(false);
      addNotification("Settings updated!", "success");
    } catch (error) {
      addNotification("Failed to update settings", "failure");
    }
  };

  const handleExportStory = () => {
    setExporting(true);
    try {
      const exportData = {
        story_name: storyData.story_name,
        player_name: storyData.player_name,
        exported_at: new Date().toISOString(),
        data: storyData,
      };

      const blob = new Blob([JSON.stringify(exportData, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${storyData.story_name.replace(
        /[^a-z0-9]/gi,
        "_"
      )}_${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      addNotification("Story exported successfully!", "success");
    } catch (error) {
      addNotification("Failed to export story", "failure");
    } finally {
      setExporting(false);
    }
  };

  const handleDeleteStory = async () => {
    if (!storyDbId) return;

    setDeleting(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        throw new Error("Not authenticated");
      }

      const response = await fetch(`/api/stories/${storyDbId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (!response.ok) {
        throw new Error("Failed to delete story");
      }

      addNotification("Story deleted", "info");
      router.push("/explorer");
    } catch (error: any) {
      addNotification(error.message || "Failed to delete story", "failure");
      setDeleting(false);
    }
  };

  const handleReturnToExplorer = () => {
    setConfirmDialog({
      isOpen: true,
      title: "Leave Story",
      message:
        "Are you sure you want to leave? Make sure your progress is saved!",
      icon: "AlertTriangle",
      confirmText: "Leave",
      confirmButtonClass: "bg-gray-600 hover:bg-gray-700",
      onConfirm: () => {
        setConfirmDialog({ ...confirmDialog, isOpen: false });
        router.push("/explorer");
      },
    });
  };

  const calculateStoryProgress = () => {
    const totalParts = storyData.scene.parts.length;
    const totalBeats = storyData.plot_beats.length;
    const fulfilledBeats = storyData.plot_beats.filter(
      (b) => b.fulfilled
    ).length;
    const achievementCount = storyData.achievements.length;

    return {
      totalParts,
      totalBeats,
      fulfilledBeats,
      achievementCount,
      progress:
        totalBeats > 0 ? Math.round((fulfilledBeats / totalBeats) * 100) : 0,
    };
  };

  const stats = calculateStoryProgress();
  const totalEarnedPoints =
    (storyData.earnedPointsFromBeats || []).reduce((a, b) => a + b, 0) +
    (storyData.earnedPointsFromChapters || []).reduce((a, b) => a + b, 0);
  const availablePoints = storyData.points;

  return (
    <div className="w-full space-y-6">
      {/* Story Info Card */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6 sm:p-8 border border-gray-200 dark:border-gray-700">
        <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white mb-2 flex items-center gap-2">
          <DynamicIcon name="Settings" className="w-8 h-8" /> Story Menu
        </h2>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Manage your adventure progress and settings
        </p>
      </div>

      {/* Actions Card */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6 border border-gray-200 dark:border-gray-700">
        <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
          <DynamicIcon name="Gamepad2" className="w-6 h-6" /> Actions
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Settings */}
          <button
            onClick={() => setShowSettings(true)}
            className="flex items-center justify-center gap-3 px-6 py-4 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg transition-colors shadow-md"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
            <span>Story Settings</span>
          </button>

          {/* View Logs */}
          {onViewLogs && (
            <button
              onClick={onViewLogs}
              className="flex items-center justify-center gap-3 px-6 py-4 bg-gray-600 hover:bg-gray-700 text-white font-semibold rounded-lg transition-colors shadow-md"
            >
              <DynamicIcon name="ClipboardList" className="w-5 h-5" />
              <span>View Debug Logs</span>
            </button>
          )}

          {/* View Context */}
          {onViewContext && (
            <button
              onClick={onViewContext}
              className="flex items-center justify-center gap-3 px-6 py-4 bg-gray-600 hover:bg-gray-700 text-white font-semibold rounded-lg transition-colors shadow-md"
            >
              <DynamicIcon name="Eye" className="w-5 h-5" />
              <span>View AI Context</span>
            </button>
          )}

          {/* Save Progress */}
          <button
            onClick={handleSaveProgress}
            disabled={saving || !storyDbId}
            className="flex items-center justify-center gap-3 px-6 py-4 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-semibold rounded-lg transition-colors shadow-md"
          >
            {saving ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                <span>Saving...</span>
              </>
            ) : (
              <>
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"
                  />
                </svg>
                <span>Save Progress</span>
              </>
            )}
          </button>

          {/* Export Story */}
          <button
            onClick={handleExportStory}
            disabled={exporting}
            className="flex items-center justify-center gap-3 px-6 py-4 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-semibold rounded-lg transition-colors shadow-md"
          >
            {exporting ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                <span>Exporting...</span>
              </>
            ) : (
              <>
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
                <span>Export Story</span>
              </>
            )}
          </button>

          {/* Return to Explorer */}
          <button
            onClick={handleReturnToExplorer}
            className="flex items-center justify-center gap-3 px-6 py-4 bg-gray-600 hover:bg-gray-700 text-white font-semibold rounded-lg transition-colors shadow-md"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10 19l-7-7m0 0l7-7m-7 7h18"
              />
            </svg>
            <span>Return to Explorer</span>
          </button>

          {/* Delete Story */}
          <button
            onClick={() => {
              setConfirmDialog({
                isOpen: true,
                title: "Delete Story?",
                message:
                  "Are you sure you want to permanently delete this story? This action cannot be undone.",
                icon: "AlertTriangle",
                confirmText: "Delete Forever",
                confirmButtonClass: "bg-red-600 hover:bg-red-700",
                onConfirm: async () => {
                  setConfirmDialog({ ...confirmDialog, isOpen: false });
                  if (!storyDbId) return;

                  setDeleting(true);
                  try {
                    const {
                      data: { session },
                    } = await supabase.auth.getSession();
                    if (!session) {
                      throw new Error("Not authenticated");
                    }

                    const response = await fetch(`/api/stories/${storyDbId}`, {
                      method: "DELETE",
                      headers: {
                        Authorization: `Bearer ${session.access_token}`,
                      },
                    });

                    if (!response.ok) {
                      throw new Error("Failed to delete story");
                    }

                    addNotification("Story deleted", "info");
                    router.push("/explorer");
                  } catch (error: any) {
                    addNotification(
                      error.message || "Failed to delete story",
                      "failure"
                    );
                    setDeleting(false);
                  }
                },
              });
            }}
            disabled={deleting || !storyDbId}
            className="flex items-center justify-center gap-3 px-6 py-4 bg-red-600 hover:bg-red-700 disabled:bg-gray-400 text-white font-semibold rounded-lg transition-colors shadow-md"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
              />
            </svg>
            <span>Delete Story</span>
          </button>
        </div>
      </div>

      {/* Story Progress Card */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6 border border-gray-200 dark:border-gray-700">
        <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
          <DynamicIcon name="BarChart2" className="w-6 h-6" /> Story Progress
        </h3>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          <div className="text-center p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
            <p className="text-3xl font-bold text-blue-600 dark:text-blue-400">
              {stats.totalParts}
            </p>
            <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
              Story Parts
            </p>
          </div>
          <div className="text-center p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
            <p className="text-3xl font-bold text-purple-600 dark:text-purple-400">
              {stats.fulfilledBeats}/{stats.totalBeats}
            </p>
            <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
              Plot Beats
            </p>
          </div>
          <div className="text-center p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
            <p className="text-3xl font-bold text-green-600 dark:text-green-400">
              {stats.achievementCount}
            </p>
            <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
              Achievements
            </p>
          </div>
          <div className="text-center p-4 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
            <p className="text-3xl font-bold text-amber-600 dark:text-amber-400">
              {stats.progress}%
            </p>
            <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
              Completion
            </p>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3 overflow-hidden">
          <div
            className="bg-linear-to-r from-purple-500 to-pink-500 h-3 transition-all duration-500"
            style={{ width: `${stats.progress}%` }}
          />
        </div>

        {/* Points & Momentum Summary */}
        <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="p-4 rounded-lg bg-purple-50 dark:bg-purple-900/20 text-center">
            <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">
              Available Points
            </p>
            <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">
              {availablePoints}
            </p>
          </div>
          <div className="p-4 rounded-lg bg-indigo-50 dark:bg-indigo-900/20 text-center">
            <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">
              Total Earned
            </p>
            <p className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">
              {totalEarnedPoints}
            </p>
          </div>
          <div className="p-4 rounded-lg bg-pink-50 dark:bg-pink-900/20 text-center">
            <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">
              Spent / Used
            </p>
            <p className="text-2xl font-bold text-pink-600 dark:text-pink-400">
              {Math.max(totalEarnedPoints - availablePoints, 0)}
            </p>
          </div>
          <div className="p-4 rounded-lg bg-blue-50 dark:bg-blue-900/20 text-center">
            <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">
              Momentum
            </p>
            <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
              {storyData.momentum}/{storyData.maxMomentum}
            </p>
          </div>
        </div>
      </div>

      {/* Player Notes Card */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6 border border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <DynamicIcon name="FileText" className="w-6 h-6" /> Player Notes
          </h3>
          <button
            onClick={() => setEditingNotes(!editingNotes)}
            className="px-3 py-1 text-sm bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 hover:bg-purple-200 dark:hover:bg-purple-900/50 rounded-lg transition-colors"
          >
            {editingNotes ? "Cancel" : "Edit"}
          </button>
        </div>

        {editingNotes ? (
          <div className="space-y-3">
            <textarea
              value={playerNotes}
              onChange={(e) => setPlayerNotes(e.target.value)}
              placeholder="Write your notes, strategies, or thoughts about the story..."
              className="w-full h-40 px-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => {
                  setPlayerNotes(storyData.player_notes || "");
                  setEditingNotes(false);
                }}
                className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveNotes}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg"
              >
                Save Notes
              </button>
            </div>
          </div>
        ) : (
          <div className="prose prose-sm dark:prose-invert max-w-none">
            {playerNotes ? (
              <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                {playerNotes}
              </p>
            ) : (
              <p className="text-gray-400 dark:text-gray-500 italic">
                No notes yet. Click Edit to add your thoughts!
              </p>
            )}
          </div>
        )}
      </div>

      {/* Replay & Restart Card */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6 border border-gray-200 dark:border-gray-700">
        <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
          <DynamicIcon name="RefreshCw" className="w-6 h-6" /> Replay & Restart
        </h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          Start your adventure anew with different options
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Restart Story (Full Reset) */}
          <button
            onClick={() => {
              setConfirmDialog({
                isOpen: true,
                title: "Restart Story",
                message:
                  "Are you sure you want to restart this story? All progress will be lost!",
                icon: "RefreshCw",
                confirmText: "Restart",
                confirmButtonClass: "bg-blue-600 hover:bg-blue-700",
                onConfirm: async () => {
                  setConfirmDialog({ ...confirmDialog, isOpen: false });
                  if (!storyDbId) return;

                  try {
                    const {
                      data: { session },
                    } = await supabase.auth.getSession();
                    if (!session) {
                      addNotification("Please sign in to restart", "warning");
                      return;
                    }

                    // Full reset - clear everything
                    const resetStoryData = {
                      ...storyData,
                      scene: { parts: [] },
                      memory: [],
                      currentChapter: 0,
                      chapters: [],
                      momentum: storyData.momentum,
                      points: 0,
                      earnedPointsFromBeats: [],
                      earnedPointsFromChapters: [],
                      earnedPointsFromQuests: [],
                      plot_beats: storyData.plot_beats.map((b) => ({
                        ...b,
                        fulfilled: false,
                      })),
                      achievements: storyData.achievements.map((a) => ({
                        ...a,
                        dateAchieved: null,
                      })),
                      quests:
                        storyData.quests?.map((q) => ({
                          ...q,
                          fulfilled: false,
                          active: false,
                        })) || [],
                      lore: storyData.lore.map((l) => ({
                        ...l,
                        on:
                          l.on_triggers && l.on_triggers.length > 0
                            ? false
                            : true,
                      })),
                      newGamePlusMode: false,
                    };

                    await fetch(`/api/stories/${storyDbId}`, {
                      method: "PATCH",
                      headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${session.access_token}`,
                      },
                      body: JSON.stringify({ storyData: resetStoryData }),
                    });

                    addNotification("Story restarted! Reloading...", "success");
                    window.location.reload();
                  } catch (error) {
                    console.error("Error restarting story:", error);
                    addNotification("Failed to restart story", "failure");
                  }
                },
              });
            }}
            className="flex flex-col items-center justify-center gap-2 px-6 py-6 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors shadow-md"
          >
            <DynamicIcon name="RefreshCw" className="w-8 h-8" />
            <div className="text-center">
              <div className="font-bold">Restart Story</div>
              <div className="text-xs opacity-80 mt-1">
                Fresh start, lose all progress
              </div>
            </div>
          </button>

          {/* New Game Plus */}
          <button
            onClick={() => {
              setConfirmDialog({
                isOpen: true,
                title: "New Game Plus",
                message:
                  "Start New Game Plus? You'll keep achievements, stats, resources, and items, plus get bonus rewards!",
                icon: "Star",
                confirmText: "Start NG+",
                confirmButtonClass:
                  "bg-linear-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700",
                onConfirm: async () => {
                  setConfirmDialog({ ...confirmDialog, isOpen: false });
                  if (!storyDbId) return;

                  try {
                    const {
                      data: { session },
                    } = await supabase.auth.getSession();
                    if (!session) {
                      addNotification(
                        "Please sign in for New Game Plus",
                        "warning"
                      );
                      return;
                    }

                    const ngPlusCount = (storyData.newGamePlusCount || 0) + 1;
                    const bonusPoints = ngPlusCount * 50;
                    const bonusMomentum = Math.min(ngPlusCount, 3);

                    // Reset with NG+ bonuses
                    const ngPlusStoryData = {
                      ...storyData,
                      scene: { parts: [] },
                      memory: [],
                      currentChapter: 0,
                      chapters: [],
                      momentum: storyData.momentum,
                      maxMomentum: storyData.maxMomentum + bonusMomentum,
                      points: bonusPoints,
                      earnedPointsFromBeats: [],
                      earnedPointsFromChapters: [],
                      earnedPointsFromQuests: [],
                      plot_beats: storyData.plot_beats.map((b) => ({
                        ...b,
                        fulfilled: false,
                      })),
                      // Keep achievements, stats, resources, and inventory!
                      achievements: storyData.achievements,
                      stats: storyData.stats, // Keep stats
                      resources: storyData.resources, // Keep resources
                      inventory: storyData.inventory, // Keep inventory
                      quests:
                        storyData.quests?.map((q) => ({
                          ...q,
                          fulfilled: false,
                          active: false,
                        })) || [],
                      lore: storyData.lore.map((l) => ({
                        ...l,
                        on:
                          l.on_triggers && l.on_triggers.length > 0
                            ? false
                            : true,
                      })),
                      newGamePlusCount: ngPlusCount,
                      newGamePlusMode: true,
                    };

                    await fetch(`/api/stories/${storyDbId}`, {
                      method: "PATCH",
                      headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${session.access_token}`,
                      },
                      body: JSON.stringify({ storyData: ngPlusStoryData }),
                    });

                    addNotification(
                      `New Game Plus ${ngPlusCount} activated! +${bonusPoints} points, +${bonusMomentum} max momentum`,
                      "success"
                    );
                    window.location.reload();
                  } catch (error) {
                    console.error("Error starting NG+:", error);
                    addNotification("Failed to start New Game Plus", "failure");
                  }
                },
              });
            }}
            className="flex flex-col items-center justify-center gap-2 px-6 py-6 bg-linear-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-semibold rounded-lg transition-colors shadow-md"
          >
            <DynamicIcon name="Star" className="w-8 h-8" />
            <div className="text-center">
              <div className="font-bold">New Game Plus</div>
              <div className="text-xs opacity-80 mt-1">
                Keep achievements + bonus rewards
              </div>
            </div>
          </button>
        </div>

        {/* NG+ Status Badge */}
        {storyData.newGamePlusCount && storyData.newGamePlusCount > 0 && (
          <div className="mt-4 p-3 bg-linear-to-r from-amber-50 to-purple-50 dark:from-amber-900/20 dark:to-purple-900/20 rounded-lg border border-amber-200 dark:border-amber-800 text-center">
            <div className="font-bold text-sm text-amber-900 dark:text-amber-200">
              <DynamicIcon name="Star" className="inline-block w-4 h-4 mr-1" />
              Current Run: New Game Plus #{storyData.newGamePlusCount}
            </div>
            <div className="text-xs text-amber-700 dark:text-amber-300 mt-1">
              {storyData.newGamePlusMode
                ? "Active NG+ bonuses"
                : "Completed playthroughs"}
              : {storyData.newGamePlusCount}
            </div>
          </div>
        )}
      </div>

      {/* Story Info Card */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6 border border-gray-200 dark:border-gray-700">
        <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
          <DynamicIcon name="Info" className="w-6 h-6" /> Story Information
        </h3>

        <div className="space-y-3 text-sm">
          <div className="flex justify-between py-2 border-b border-gray-200 dark:border-gray-700">
            <span className="text-gray-600 dark:text-gray-400">
              Story Name:
            </span>
            <span className="font-semibold text-gray-900 dark:text-white">
              {storyData.story_name}
            </span>
          </div>
          <div className="flex justify-between py-2 border-b border-gray-200 dark:border-gray-700">
            <span className="text-gray-600 dark:text-gray-400">
              Player Name:
            </span>
            <span className="font-semibold text-gray-900 dark:text-white">
              {storyData.player_name}
            </span>
          </div>
          <div className="flex justify-between py-2 border-b border-gray-200 dark:border-gray-700">
            <span className="text-gray-600 dark:text-gray-400">
              Total Memory Entries:
            </span>
            <span className="font-semibold text-gray-900 dark:text-white">
              {storyData.memory.length}
            </span>
          </div>
          <div className="flex justify-between py-2 border-b border-gray-200 dark:border-gray-700">
            <span className="text-gray-600 dark:text-gray-400">
              Inventory Items:
            </span>
            <span className="font-semibold text-gray-900 dark:text-white">
              {storyData.inventory.length}
            </span>
          </div>
          <div className="flex justify-between py-2">
            <span className="text-gray-600 dark:text-gray-400">
              Lore Entries:
            </span>
            <span className="font-semibold text-gray-900 dark:text-white">
              {storyData.lore.length}
            </span>
          </div>
        </div>
      </div>

      {/* Comprehensive Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-6xl w-full border border-gray-200 dark:border-gray-700 max-h-[90vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <DynamicIcon name="Settings" className="w-6 h-6" /> Story Editor
              </h3>
              <button
                onClick={() => setShowSettings(false)}
                className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              >
                <svg
                  className="w-6 h-6"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>

            {/* Tabs */}
            <div className="flex gap-3 px-6 py-4 border-b border-gray-200 dark:border-gray-700 overflow-x-auto overflow-y-hidden scrollbar-thin">
              {[
                { id: "basic", label: "Basic", icon: "FileText" },
                { id: "stats", label: "Stats & Resources", icon: "BarChart2" },
                { id: "inventory", label: "Inventory", icon: "Backpack" },
                { id: "quests", label: "Quests", icon: "Scroll" },
                { id: "lore", label: "Lore", icon: "Book" },
                { id: "relationships", label: "Relationships", icon: "Users" },
                { id: "story", label: "Story", icon: "BookOpen" },
                { id: "tts", label: "AI Config", icon: "Bot" },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`shrink-0 px-6 py-4 text-lg font-bold rounded-xl transition-colors whitespace-nowrap flex items-center gap-3 ${
                    activeTab === tab.id
                      ? "bg-purple-600 text-white"
                      : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
                  }`}
                >
                  <DynamicIcon name={tab.icon} className="w-6 h-6 shrink-0" />
                  <span>{tab.label}</span>
                </button>
              ))}
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto p-6">
              {activeTab === "basic" && (
                <BasicSettings form={settingsForm} onChange={setSettingsForm} />
              )}

              {activeTab === "stats" && (
                <StatsResourcesEditor
                  stats={storyData.stats}
                  resources={storyData.resources}
                  achievements={storyData.achievements}
                  onUpdate={(updates) => onUpdateStoryData(updates)}
                />
              )}

              {activeTab === "inventory" && (
                <InventoryEditor
                  inventory={storyData.inventory}
                  onUpdate={(inventory) => onUpdateStoryData({ inventory })}
                />
              )}

              {activeTab === "quests" && (
                <QuestEditor
                  quests={storyData.quests || []}
                  onUpdate={(quests) => onUpdateStoryData({ quests })}
                />
              )}

              {activeTab === "lore" && (
                <LoreEditor
                  lore={storyData.lore}
                  plotBeats={storyData.plot_beats}
                  onUpdate={(lore) => onUpdateStoryData({ lore })}
                />
              )}

              {activeTab === "relationships" && (
                <RelationshipsEditor
                  relationships={storyData.relationships}
                  onUpdate={(relationships) =>
                    onUpdateStoryData({ relationships })
                  }
                />
              )}

              {activeTab === "story" && (
                <StoryMetaEditor
                  plotBeats={storyData.plot_beats}
                  memory={storyData.memory}
                  premise={storyData.premise}
                  onUpdate={(updates) => onUpdateStoryData(updates)}
                />
              )}

              {activeTab === "tts" && (
                <div className="space-y-6">
                  <h4 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2 mb-4">
                    <DynamicIcon name="Bot" className="w-6 h-6" /> AI
                    Configuration
                  </h4>

                  <div className="space-y-4">
                    {/* AI Model Selection with Enhanced Details */}
                    <AIModelSelector addNotification={addNotification} />

                    {/* Raw Context Toggle */}
                    <label className="flex items-center gap-3 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600">
                      <input
                        type="checkbox"
                        checked={
                          typeof window !== "undefined" &&
                          localStorage.getItem("useRawContext") === "true"
                        }
                        onChange={(e) => {
                          if (typeof window !== "undefined") {
                            localStorage.setItem(
                              "useRawContext",
                              e.target.checked ? "true" : "false"
                            );
                            addNotification(
                              e.target.checked
                                ? "Raw context mode enabled"
                                : "Raw context mode disabled",
                              "success"
                            );
                          }
                        }}
                        className="w-5 h-5 rounded text-purple-600"
                      />
                      <div>
                        <span className="font-semibold text-gray-900 dark:text-white">
                          Use Raw AI Output in Context
                        </span>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          Send complete AI responses back to the model instead
                          of parsed content. Helps some AIs maintain
                          consistency.
                        </p>
                      </div>
                    </label>

                    <label className="flex items-center gap-3 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600">
                      <input
                        type="checkbox"
                        checked={
                          typeof window !== "undefined" &&
                          localStorage.getItem("ttsEnabled") !== "false"
                        }
                        onChange={(e) => {
                          if (typeof window !== "undefined") {
                            localStorage.setItem(
                              "ttsEnabled",
                              e.target.checked ? "true" : "false"
                            );
                            addNotification(
                              e.target.checked ? "TTS Enabled" : "TTS Disabled",
                              "success"
                            );
                            // Force re-render
                            window.location.reload();
                          }
                        }}
                        className="w-5 h-5 rounded text-blue-600"
                      />
                      <div>
                        <span className="font-semibold text-gray-900 dark:text-white">
                          Enable Text-to-Speech
                        </span>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          Show TTS controls for story narration
                        </p>
                      </div>
                    </label>

                    <label className="flex items-center gap-3 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600">
                      <input
                        type="checkbox"
                        checked={
                          typeof window !== "undefined" &&
                          localStorage.getItem("ttsAutoGenerate") === "true"
                        }
                        onChange={(e) => {
                          if (typeof window !== "undefined") {
                            localStorage.setItem(
                              "ttsAutoGenerate",
                              e.target.checked ? "true" : "false"
                            );
                            addNotification(
                              e.target.checked
                                ? "Auto-generate enabled"
                                : "Auto-generate disabled",
                              "success"
                            );
                          }
                        }}
                        className="w-5 h-5 rounded text-blue-600"
                      />
                      <div>
                        <span className="font-semibold text-gray-900 dark:text-white">
                          Auto-Generate Narration
                        </span>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          Automatically generate audio when new story content
                          appears
                        </p>
                      </div>
                    </label>

                    <div className="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                      <h5 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                        <DynamicIcon
                          name="Volume2"
                          className="inline-block w-4 h-4 mr-1"
                        />
                        TTS Voice Settings
                      </h5>

                      <CustomVoiceManager addNotification={addNotification} />

                      <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2 mt-4">
                        Default Volume:{" "}
                        {Math.round(
                          (typeof window !== "undefined"
                            ? parseFloat(
                                localStorage.getItem("ttsVolume") || "1.0"
                              )
                            : 1.0) * 100
                        )}
                        %
                      </label>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.05"
                        defaultValue={
                          typeof window !== "undefined"
                            ? localStorage.getItem("ttsVolume") || "1.0"
                            : "1.0"
                        }
                        onChange={(e) => {
                          if (typeof window !== "undefined") {
                            localStorage.setItem("ttsVolume", e.target.value);
                            // Update the label
                            e.currentTarget.previousElementSibling!.textContent = `Default Volume: ${Math.round(
                              parseFloat(e.target.value) * 100
                            )}%`;
                          }
                        }}
                        className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700"
                      />
                      <div className="flex justify-between mt-2 text-xs text-gray-500 dark:text-gray-400">
                        <span>
                          <DynamicIcon
                            name="VolumeX"
                            className="inline-block w-3 h-3"
                          />{" "}
                          0%
                        </span>
                        <span>
                          <DynamicIcon
                            name="Volume2"
                            className="inline-block w-3 h-3"
                          />{" "}
                          100%
                        </span>
                      </div>
                    </div>

                    <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                      <h5 className="font-semibold text-blue-900 dark:text-blue-200 mb-2">
                        <DynamicIcon
                          name="Info"
                          className="inline-block w-4 h-4 mr-1"
                        />
                        How TTS Works
                      </h5>
                      <ul className="text-sm text-blue-800 dark:text-blue-300 space-y-1">
                        <li>
                          • TTS controls appear at the top of the story when
                          enabled
                        </li>
                        <li>• Audio is generated once and saved for replay</li>
                        <li>• Volume and voice settings are saved locally</li>
                        <li>
                          • New story content generates new audio automatically
                        </li>
                      </ul>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3 p-6 border-t border-gray-200 dark:border-gray-700">
              <button
                onClick={() => {
                  setSettingsForm({
                    story_name: storyData.story_name,
                    player_name: storyData.player_name,
                    player_summary: storyData.player_summary,
                    premise: storyData.premise,
                    max_chapters: storyData.max_chapters,
                    points: storyData.points,
                    momentum: storyData.momentum,
                    maxMomentum: storyData.maxMomentum,
                  });
                  setShowSettings(false);
                }}
                className="flex-1 px-4 py-3 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-900 dark:text-white font-semibold rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  await handleSaveSettings();
                  await onSaveProgress();
                }}
                className="flex-1 px-4 py-3 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg transition-colors"
              >
                <DynamicIcon
                  name="Save"
                  className="inline-block w-4 h-4 mr-1"
                />
                Save All Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Dialog */}
      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        title={confirmDialog.title}
        message={confirmDialog.message}
        icon={confirmDialog.icon}
        confirmText={confirmDialog.confirmText}
        confirmButtonClass={confirmDialog.confirmButtonClass}
        onConfirm={confirmDialog.onConfirm}
        onCancel={() => setConfirmDialog({ ...confirmDialog, isOpen: false })}
      />
    </div>
  );
}
