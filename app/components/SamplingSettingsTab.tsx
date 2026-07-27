"use client";

import { useState, useEffect } from "react";
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
        <label className="text-sm font-medium text-blue-200/80 flex items-center gap-2">
          {label}
          {provider !== "both" && (
            <span className="text-xs px-1.5 py-0.5 bg-blue-500/10 text-blue-300 border border-blue-400/20 rounded-md">
              {provider === "deepinfra" ? "DeepInfra only" : "Mistral only"}
            </span>
          )}
        </label>
        <span className="text-sm text-purple-300 font-mono">
          {value.toFixed(step < 1 ? 2 : 0)}
        </span>
      </div>
      <div className="flex items-center gap-2">
        {leftLabel && (
          <span className="text-xs text-blue-300/50 whitespace-nowrap w-16">
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
          className="flex-1 h-2 bg-white/10 rounded-lg appearance-none cursor-pointer accent-purple-500 disabled:cursor-not-allowed"
        />
        {rightLabel && (
          <span className="text-xs text-blue-300/50 whitespace-nowrap w-16 text-right">
            {rightLabel}
          </span>
        )}
      </div>
      <p className="text-xs text-blue-300/50">{description}</p>
    </div>
  );
}

interface SamplingSettingsTabProps {
  /**
   * Whether the user has a key for a provider that accepts sampling
   * parameters (Mistral, DeepInfra, OpenRouter). DeepSeek and Google ignore
   * them, so with only those keys there's nothing to tune.
   */
  hasSamplingCapableKey?: boolean;
}

export default function SamplingSettingsTab({
  hasSamplingCapableKey = false,
}: SamplingSettingsTabProps) {
  const { addNotification } = useNotification();

  // Current settings
  const [settings, setSettings] = useState<SamplingSettings>(
    DEFAULT_SAMPLING_SETTINGS,
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
      p.id === presetId ? { ...p, settings: { ...settings } } : p,
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
        (p) => p.id === "default",
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
    const preset = importPresetFromJson(importJson);
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

  // Only Mistral, DeepInfra and OpenRouter accept these parameters - DeepSeek
  // and Google use their own defaults regardless of what's set here.
  if (!hasSamplingCapableKey) {
    return (
      <div className="p-4 bg-white/[0.03] backdrop-blur-md border border-white/10 rounded-lg">
        <div className="flex items-center gap-2 text-blue-300/60">
          <DynamicIcon name="Info" className="w-4 h-4" />
          <p className="text-sm">
            Sampling settings apply to Mistral, DeepInfra and OpenRouter models.
            Add one of those API keys in Settings to tune them - DeepSeek and
            Google use their own default sampling.
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
        <div className="p-4 bg-white/[0.03] backdrop-blur-md border border-white/10 rounded-lg space-y-4">
          <h4 className="text-sm font-medium text-white flex items-center gap-2">
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
                    ? "border-purple-400/50 bg-purple-500/10"
                    : "border-white/10 hover:border-purple-400/40"
                }`}
                onClick={() => applyPreset(preset)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">
                      {preset.name}
                    </p>
                    <p className="text-xs text-blue-300/50 truncate">
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
                        className="p-1 text-blue-400 hover:bg-blue-500/10 rounded-md"
                        title="Copy to clipboard"
                      >
                        <DynamicIcon name="Copy" className="w-3 h-3" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deletePreset(preset.id);
                        }}
                        className="p-1 text-red-400 hover:bg-red-500/10 rounded-md"
                        title="Delete preset"
                      >
                        <DynamicIcon name="Trash2" className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                </div>
                {preset.authorName && !preset.isBuiltIn && (
                  <p className="text-xs text-blue-300/40 mt-1">
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
          <div className="pt-3 border-t border-white/10 space-y-2">
            <p className="text-xs font-medium text-blue-300/60">
              Save Current Settings as Preset
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                value={newPresetName}
                onChange={(e) => setNewPresetName(e.target.value)}
                placeholder="Preset name"
                className="flex-1 px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white placeholder-blue-300/40"
              />
              <button
                onClick={saveAsPreset}
                disabled={!newPresetName.trim()}
                className="px-4 py-2 bg-linear-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white rounded-lg text-sm font-medium shadow-md shadow-purple-950/40 transition-all disabled:opacity-50"
              >
                Save
              </button>
            </div>
            <input
              type="text"
              value={newPresetDescription}
              onChange={(e) => setNewPresetDescription(e.target.value)}
              placeholder="Description (optional)"
              className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white placeholder-blue-300/40"
            />
          </div>

          {/* Import Preset */}
          <div className="pt-3 border-t border-white/10">
            {showImportDialog ? (
              <div className="space-y-2">
                <textarea
                  value={importJson}
                  onChange={(e) => setImportJson(e.target.value)}
                  placeholder="Paste preset JSON here..."
                  className="w-full h-24 px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm font-mono text-white resize-none"
                />
                <div className="flex gap-2">
                  <button
                    onClick={handleImport}
                    disabled={!importJson.trim()}
                    className="px-4 py-2 bg-linear-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-lg text-sm font-medium shadow-md shadow-emerald-950/40 transition-all disabled:opacity-50"
                  >
                    Import
                  </button>
                  <button
                    onClick={() => {
                      setShowImportDialog(false);
                      setImportJson("");
                    }}
                    className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 text-blue-200 rounded-lg text-sm font-medium transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowImportDialog(true)}
                className="w-full py-2 border border-dashed border-white/15 hover:border-purple-400 rounded-lg text-sm text-blue-300/60 hover:text-purple-300 transition-colors"
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
        className="flex items-center gap-2 text-sm text-purple-300 hover:text-purple-200"
      >
        <DynamicIcon
          name={showAdvanced ? "ChevronUp" : "ChevronDown"}
          className="w-4 h-4"
        />
        {showAdvanced ? "Hide" : "Show"} Advanced Settings
      </button>

      {/* Advanced Settings */}
      {showAdvanced && (
        <div className="space-y-4 p-4 bg-white/[0.03] backdrop-blur-md border border-white/10 rounded-lg">
          <h4 className="text-sm font-medium text-white flex items-center gap-2">
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

          <div className="pt-3 border-t border-white/10">
            <p className="text-xs text-amber-300 mb-3 flex items-center gap-1">
              <DynamicIcon name="AlertTriangle" className="w-3.5 h-3.5" />
              The following settings only work with DeepInfra and OpenRouter
              models
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
              />
            </div>
          </div>
        </div>
      )}

      {/* Info Box */}
      <div className="p-3 bg-blue-500/[0.06] border border-blue-400/20 rounded-lg">
        <p className="text-xs text-blue-200/80 flex items-start gap-1.5">
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
