"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/app/misc/AuthContext";
import { useNotification } from "@/app/misc/NotificationContext";
import { DynamicIcon } from "./DynamicIcon";
import {
  SamplingSettings,
  SamplingPreset,
  DEFAULT_SAMPLING_SETTINGS,
  BUILT_IN_SAMPLING_PRESETS,
  getSamplingSettings,
  saveSamplingSettings,
  getCurrentSamplingPresetId,
  saveCurrentSamplingPresetId,
  getCustomSamplingPresets,
  saveCustomSamplingPresets,
  validateSamplingSettings,
  exportPresetAsJson,
  importPresetFromJson,
} from "@/app/misc/samplingSettings";

interface SliderControlProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  description: string;
  leftLabel?: string;
  rightLabel?: string;
  disabled?: boolean;
  provider?: "mistral" | "deepinfra" | "both";
}

function SliderControl({
  label,
  value,
  min,
  max,
  step,
  onChange,
  description,
  leftLabel,
  rightLabel,
  disabled,
  provider = "both",
}: SliderControlProps) {
  return (
    <div className={`space-y-1 ${disabled ? "opacity-50" : ""}`}>
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
          {label}
          {provider !== "both" && (
            <span className="text-xs px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded">
              {provider === "deepinfra" ? "DeepInfra only" : "Mistral only"}
            </span>
          )}
        </label>
        <span className="text-sm text-purple-600 dark:text-purple-400 font-mono">
          {value.toFixed(step < 1 ? 2 : 0)}
        </span>
      </div>
      <div className="flex items-center gap-2">
        {leftLabel && (
          <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap w-16">
            {leftLabel}
          </span>
        )}
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          disabled={disabled}
          className="flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-purple-500 disabled:cursor-not-allowed"
        />
        {rightLabel && (
          <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap w-16 text-right">
            {rightLabel}
          </span>
        )}
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400">{description}</p>
    </div>
  );
}

interface SamplingSettingsTabProps {
  byokMode: boolean;
}

export default function SamplingSettingsTab({
  byokMode,
}: SamplingSettingsTabProps) {
  const { user } = useAuth();
  const { addNotification } = useNotification();

  // Current settings
  const [settings, setSettings] = useState<SamplingSettings>(
    DEFAULT_SAMPLING_SETTINGS
  );
  const [currentPresetId, setCurrentPresetId] = useState("default");
  const [customPresets, setCustomPresets] = useState<SamplingPreset[]>([]);

  // UI state
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showPresetManager, setShowPresetManager] = useState(false);
  const [newPresetName, setNewPresetName] = useState("");
  const [newPresetDescription, setNewPresetDescription] = useState("");
  const [importJson, setImportJson] = useState("");
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [editingPresetId, setEditingPresetId] = useState<string | null>(null);

  // Load settings from localStorage
  useEffect(() => {
    setSettings(getSamplingSettings());
    setCurrentPresetId(getCurrentSamplingPresetId());
    setCustomPresets(getCustomSamplingPresets());
  }, []);

  // Save settings when they change
  const updateSettings = (newSettings: Partial<SamplingSettings>) => {
    const validated = validateSamplingSettings({ ...settings, ...newSettings });
    setSettings(validated);
    saveSamplingSettings(validated);
    // When manually changing settings, switch to "custom" mode
    setCurrentPresetId("custom");
    saveCurrentSamplingPresetId("custom");
  };

  // Apply a preset
  const applyPreset = (preset: SamplingPreset) => {
    setSettings(preset.settings);
    saveSamplingSettings(preset.settings);
    setCurrentPresetId(preset.id);
    saveCurrentSamplingPresetId(preset.id);
    addNotification(`Applied "${preset.name}" sampling preset`, "success");
  };

  // Save current settings as a new preset
  const saveAsPreset = () => {
    if (!newPresetName.trim()) {
      addNotification("Please enter a preset name", "warning");
      return;
    }

    const newPreset: SamplingPreset = {
      id: crypto.randomUUID(),
      name: newPresetName.trim(),
      description: newPresetDescription.trim(),
      settings: { ...settings },
      isBuiltIn: false,
      authorId: user?.id,
      authorName: user?.user_metadata?.display_name || user?.email,
      createdAt: new Date().toISOString(),
    };

    const updatedPresets = [...customPresets, newPreset];
    setCustomPresets(updatedPresets);
    saveCustomSamplingPresets(updatedPresets);
    setCurrentPresetId(newPreset.id);
    saveCurrentSamplingPresetId(newPreset.id);
    setNewPresetName("");
    setNewPresetDescription("");
    addNotification(`Saved "${newPreset.name}" preset`, "success");
  };

  // Update an existing custom preset
  const updatePreset = (presetId: string) => {
    const updatedPresets = customPresets.map((p) =>
      p.id === presetId ? { ...p, settings: { ...settings } } : p
    );
    setCustomPresets(updatedPresets);
    saveCustomSamplingPresets(updatedPresets);
    setEditingPresetId(null);
    addNotification("Preset updated", "success");
  };

  // Delete a custom preset
  const deletePreset = (presetId: string) => {
    const preset = customPresets.find((p) => p.id === presetId);
    const updatedPresets = customPresets.filter((p) => p.id !== presetId);
    setCustomPresets(updatedPresets);
    saveCustomSamplingPresets(updatedPresets);
    if (currentPresetId === presetId) {
      setCurrentPresetId("default");
      saveCurrentSamplingPresetId("default");
      const defaultPreset = BUILT_IN_SAMPLING_PRESETS.find(
        (p) => p.id === "default"
      );
      if (defaultPreset) {
        setSettings(defaultPreset.settings);
        saveSamplingSettings(defaultPreset.settings);
      }
    }
    addNotification(`Deleted "${preset?.name}" preset`, "success");
  };

  // Export a preset
  const exportPreset = (preset: SamplingPreset) => {
    const json = exportPresetAsJson(preset);
    navigator.clipboard.writeText(json);
    addNotification("Preset copied to clipboard!", "success");
  };

  // Import a preset from JSON
  const handleImport = () => {
    const preset = importPresetFromJson(
      importJson,
      user?.id,
      user?.user_metadata?.display_name || user?.email
    );
    if (!preset) {
      addNotification("Invalid preset JSON", "failure");
      return;
    }

    const updatedPresets = [...customPresets, preset];
    setCustomPresets(updatedPresets);
    saveCustomSamplingPresets(updatedPresets);
    applyPreset(preset);
    setImportJson("");
    setShowImportDialog(false);
    addNotification(`Imported "${preset.name}" preset`, "success");
  };

  // Get all presets for display
  const allPresets = [...BUILT_IN_SAMPLING_PRESETS, ...customPresets];
  const currentPreset =
    allPresets.find((p) => p.id === currentPresetId) ||
    BUILT_IN_SAMPLING_PRESETS[0];

  // Only show for Coins mode (DeepInfra/Mistral)
  if (byokMode) {
    return (
      <div className="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
        <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
          <DynamicIcon name="Info" className="w-4 h-4" />
          <p className="text-sm">
            Sampling settings are only available for Coins mode models
            (DeepInfra/Mistral).
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Current Preset Banner */}
      <div className="bg-linear-to-r from-indigo-600 to-purple-600 rounded-lg p-4 text-white">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-lg font-bold flex items-center gap-2">
              {currentPreset?.name || "Custom"}
              {currentPresetId === "custom" && (
                <span className="text-xs bg-white/20 px-2 py-0.5 rounded-full">
                  Modified
                </span>
              )}
            </div>
            <div className="text-sm text-white/70">
              {currentPreset?.description || "Custom sampling settings"}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowPresetManager(!showPresetManager)}
              className="px-3 py-1.5 bg-white/20 hover:bg-white/30 rounded-lg text-sm font-medium transition-colors"
            >
              <DynamicIcon name="Settings2" className="w-4 h-4 inline mr-1" />
              Presets
            </button>
          </div>
        </div>
      </div>

      {/* Preset Manager */}
      {showPresetManager && (
        <div className="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg space-y-4">
          <h4 className="text-sm font-medium text-gray-900 dark:text-white flex items-center gap-2">
            <DynamicIcon name="Layers" className="w-4 h-4" />
            Sampling Presets
          </h4>

          {/* Preset Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {allPresets.map((preset) => (
              <div
                key={preset.id}
                className={`relative p-3 rounded-lg border cursor-pointer transition-all ${
                  currentPresetId === preset.id
                    ? "border-purple-500 bg-purple-50 dark:bg-purple-900/20"
                    : "border-gray-200 dark:border-gray-700 hover:border-purple-300 dark:hover:border-purple-700"
                }`}
                onClick={() => applyPreset(preset)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                      {preset.name}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                      {preset.description}
                    </p>
                  </div>
                  {!preset.isBuiltIn && (
                    <div className="flex gap-1 ml-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          exportPreset(preset);
                        }}
                        className="p-1 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded"
                        title="Copy to clipboard"
                      >
                        <DynamicIcon name="Copy" className="w-3 h-3" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deletePreset(preset.id);
                        }}
                        className="p-1 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                        title="Delete preset"
                      >
                        <DynamicIcon name="Trash2" className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                </div>
                {preset.authorName && !preset.isBuiltIn && (
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                    by {preset.authorName}
                  </p>
                )}
                {currentPresetId === preset.id && (
                  <div className="absolute top-1 right-1">
                    <DynamicIcon
                      name="Check"
                      className="w-4 h-4 text-purple-600"
                    />
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Save Current as Preset */}
          <div className="pt-3 border-t border-gray-200 dark:border-gray-700 space-y-2">
            <p className="text-xs font-medium text-gray-600 dark:text-gray-400">
              Save Current Settings as Preset
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                value={newPresetName}
                onChange={(e) => setNewPresetName(e.target.value)}
                placeholder="Preset name"
                className="flex-1 px-3 py-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg text-sm"
              />
              <button
                onClick={saveAsPreset}
                disabled={!newPresetName.trim()}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium disabled:opacity-50"
              >
                Save
              </button>
            </div>
            <input
              type="text"
              value={newPresetDescription}
              onChange={(e) => setNewPresetDescription(e.target.value)}
              placeholder="Description (optional)"
              className="w-full px-3 py-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg text-sm"
            />
          </div>

          {/* Import Preset */}
          <div className="pt-3 border-t border-gray-200 dark:border-gray-700">
            {showImportDialog ? (
              <div className="space-y-2">
                <textarea
                  value={importJson}
                  onChange={(e) => setImportJson(e.target.value)}
                  placeholder="Paste preset JSON here..."
                  className="w-full h-24 px-3 py-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg text-sm font-mono resize-none"
                />
                <div className="flex gap-2">
                  <button
                    onClick={handleImport}
                    disabled={!importJson.trim()}
                    className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium disabled:opacity-50"
                  >
                    Import
                  </button>
                  <button
                    onClick={() => {
                      setShowImportDialog(false);
                      setImportJson("");
                    }}
                    className="px-4 py-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg text-sm font-medium"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowImportDialog(true)}
                className="w-full py-2 border border-dashed border-gray-300 dark:border-gray-600 hover:border-purple-500 dark:hover:border-purple-500 rounded-lg text-sm text-gray-600 dark:text-gray-400 hover:text-purple-600 dark:hover:text-purple-400 transition-colors"
              >
                <DynamicIcon name="Download" className="w-4 h-4 inline mr-1" />
                Import Preset from JSON
              </button>
            )}
          </div>
        </div>
      )}

      {/* Quick Settings */}
      <div className="space-y-4">
        <SliderControl
          label="Temperature"
          value={settings.temperature}
          min={0}
          max={2}
          step={0.05}
          onChange={(v) => updateSettings({ temperature: v })}
          description="Controls randomness. Lower = more focused, Higher = more creative"
          leftLabel="Focused"
          rightLabel="Creative"
        />

        <SliderControl
          label="Top P"
          value={settings.top_p}
          min={0.1}
          max={1}
          step={0.05}
          onChange={(v) => updateSettings({ top_p: v })}
          description="Nucleus sampling - only consider tokens within this probability mass"
          leftLabel="Narrow"
          rightLabel="Wide"
        />
      </div>

      {/* Advanced Settings Toggle */}
      <button
        onClick={() => setShowAdvanced(!showAdvanced)}
        className="flex items-center gap-2 text-sm text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300"
      >
        <DynamicIcon
          name={showAdvanced ? "ChevronUp" : "ChevronDown"}
          className="w-4 h-4"
        />
        {showAdvanced ? "Hide" : "Show"} Advanced Settings
      </button>

      {/* Advanced Settings */}
      {showAdvanced && (
        <div className="space-y-4 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
          <h4 className="text-sm font-medium text-gray-900 dark:text-white flex items-center gap-2">
            <DynamicIcon name="SlidersHorizontal" className="w-4 h-4" />
            Advanced Sampling
          </h4>

          <SliderControl
            label="Presence Penalty"
            value={settings.presence_penalty}
            min={-2}
            max={2}
            step={0.1}
            onChange={(v) => updateSettings({ presence_penalty: v })}
            description="Penalize tokens that appear in text. Positive = new topics, Negative = allow repetition"
            leftLabel="Repetitive"
            rightLabel="Diverse"
          />

          <SliderControl
            label="Frequency Penalty"
            value={settings.frequency_penalty}
            min={-2}
            max={2}
            step={0.1}
            onChange={(v) => updateSettings({ frequency_penalty: v })}
            description="Penalize based on how often tokens appear. Reduces word repetition"
            leftLabel="Allow"
            rightLabel="Penalize"
          />

          <div className="pt-3 border-t border-gray-200 dark:border-gray-700">
            <p className="text-xs text-amber-600 dark:text-amber-400 mb-3 flex items-center gap-1">
              <DynamicIcon name="AlertTriangle" className="w-3.5 h-3.5" />
              The following settings only work with DeepInfra models
            </p>

            <div className="space-y-4">
              <SliderControl
                label="Min P"
                value={settings.min_p}
                min={0}
                max={1}
                step={0.01}
                onChange={(v) => updateSettings({ min_p: v })}
                description="Minimum probability threshold relative to most likely token"
                leftLabel="Off"
                rightLabel="Strict"
                provider="deepinfra"
              />

              <SliderControl
                label="Top K"
                value={settings.top_k}
                min={0}
                max={200}
                step={1}
                onChange={(v) => updateSettings({ top_k: v })}
                description="Only sample from top K tokens (0 = disabled)"
                leftLabel="Off"
                rightLabel="200"
                provider="deepinfra"
              />

              <SliderControl
                label="Repetition Penalty"
                value={settings.repetition_penalty}
                min={0.5}
                max={2}
                step={0.05}
                onChange={(v) => updateSettings({ repetition_penalty: v })}
                description="Multiplicative penalty for repetition. >1 penalizes, <1 encourages"
                leftLabel="Encourage"
                rightLabel="Penalize"
                provider="deepinfra"
              />
            </div>
          </div>
        </div>
      )}

      {/* Info Box */}
      <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
        <p className="text-xs text-blue-700 dark:text-blue-300 flex items-start gap-1.5">
          <DynamicIcon name="Info" className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span>
            Sampling settings only affect the <strong>story stage</strong> of
            generation. Tools and choices use fixed settings for consistency.
            Share presets by copying the JSON and sending to friends!
          </span>
        </p>
      </div>
    </div>
  );
}
