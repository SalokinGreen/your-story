/**
 * Sampling Settings for AI Generation
 *
 * Controls how the AI generates text by adjusting probability distributions.
 * These settings only apply to the story stage for creative narrative generation.
 *
 * Provider support:
 * - DeepInfra: All parameters supported
 * - Mistral: temperature, top_p, presence_penalty, frequency_penalty
 */

export interface SamplingSettings {
  // Temperature: Controls randomness (0-2)
  // Higher = more creative/random, Lower = more focused/deterministic
  temperature: number;

  // Top P (nucleus sampling): Only consider tokens with top_p probability mass (0-1)
  // 0.1 = only top 10% probability tokens, 1.0 = all tokens
  top_p: number;

  // Min P: Minimum probability relative to most likely token (0-1)
  // DeepInfra only - filters out very low probability tokens
  min_p: number;

  // Top K: Sample from best K tokens (0-1000, 0 = disabled)
  // DeepInfra only - hard cutoff on number of tokens to consider
  top_k: number;

  // Presence Penalty: Penalize tokens that appear in text (-2 to 2)
  // Positive = encourage new topics, Negative = allow repetition
  presence_penalty: number;

  // Frequency Penalty: Penalize based on frequency in text (-2 to 2)
  // Positive = reduce repetition, Negative = allow frequent words
  frequency_penalty: number;

  // Repetition Penalty: Multiplicative penalty for repetition (0.01-5)
  // DeepInfra only - >1 penalizes, <1 encourages repetition
  repetition_penalty: number;
}

export interface SamplingPreset {
  id: string;
  name: string;
  description: string;
  settings: SamplingSettings;
  isBuiltIn?: boolean; // System presets cannot be deleted
  authorId?: string; // User who created this preset (for shared presets)
  authorName?: string; // Display name of author
  isPublic?: boolean; // Whether this preset is shared publicly
  createdAt?: string;
}

// Default sampling settings (balanced)
export const DEFAULT_SAMPLING_SETTINGS: SamplingSettings = {
  temperature: 1.0,
  top_p: 1.0,
  min_p: 0,
  top_k: 0,
  presence_penalty: 0,
  frequency_penalty: 0,
  repetition_penalty: 1.0,
};

// Built-in sampling presets
export const BUILT_IN_SAMPLING_PRESETS: SamplingPreset[] = [
  {
    id: "default",
    name: "Default",
    description: "Balanced settings for general storytelling",
    isBuiltIn: true,
    settings: {
      temperature: 1.0,
      top_p: 1.0,
      min_p: 0,
      top_k: 0,
      presence_penalty: 0,
      frequency_penalty: 0,
      repetition_penalty: 1.0,
    },
  },
  {
    id: "creative",
    name: "Creative",
    description: "Higher randomness for imaginative and unpredictable stories",
    isBuiltIn: true,
    settings: {
      temperature: 1.3,
      top_p: 0.95,
      min_p: 0,
      top_k: 0,
      presence_penalty: 0.3,
      frequency_penalty: 0.3,
      repetition_penalty: 1.1,
    },
  },
  {
    id: "focused",
    name: "Focused",
    description: "More deterministic output for coherent narratives",
    isBuiltIn: true,
    settings: {
      temperature: 0.7,
      top_p: 0.9,
      min_p: 0.05,
      top_k: 50,
      presence_penalty: 0,
      frequency_penalty: 0.1,
      repetition_penalty: 1.0,
    },
  },
  {
    id: "vivid",
    name: "Vivid",
    description: "Rich vocabulary with varied word choices",
    isBuiltIn: true,
    settings: {
      temperature: 1.1,
      top_p: 0.92,
      min_p: 0,
      top_k: 0,
      presence_penalty: 0.5,
      frequency_penalty: 0.5,
      repetition_penalty: 1.15,
    },
  },
  {
    id: "chaotic",
    name: "Chaotic",
    description: "Maximum creativity - expect the unexpected!",
    isBuiltIn: true,
    settings: {
      temperature: 1.8,
      top_p: 0.98,
      min_p: 0,
      top_k: 0,
      presence_penalty: 0.6,
      frequency_penalty: 0.4,
      repetition_penalty: 1.2,
    },
  },
  {
    id: "precise",
    name: "Precise",
    description: "Very focused output, minimal randomness",
    isBuiltIn: true,
    settings: {
      temperature: 0.4,
      top_p: 0.8,
      min_p: 0.1,
      top_k: 30,
      presence_penalty: 0,
      frequency_penalty: 0,
      repetition_penalty: 1.0,
    },
  },
];

/**
 * Get sampling settings from localStorage
 */
export function getSamplingSettings(): SamplingSettings {
  if (typeof window === "undefined") {
    return DEFAULT_SAMPLING_SETTINGS;
  }

  const stored = localStorage.getItem("samplingSettings");
  if (stored) {
    try {
      return { ...DEFAULT_SAMPLING_SETTINGS, ...JSON.parse(stored) };
    } catch {
      return DEFAULT_SAMPLING_SETTINGS;
    }
  }
  return DEFAULT_SAMPLING_SETTINGS;
}

/**
 * Save sampling settings to localStorage
 */
export function saveSamplingSettings(settings: SamplingSettings): void {
  if (typeof window === "undefined") return;
  localStorage.setItem("samplingSettings", JSON.stringify(settings));
}

/**
 * Get the current sampling preset ID from localStorage
 */
export function getCurrentSamplingPresetId(): string {
  if (typeof window === "undefined") return "default";
  return localStorage.getItem("samplingPresetId") || "default";
}

/**
 * Save the current sampling preset ID to localStorage
 */
export function saveCurrentSamplingPresetId(presetId: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem("samplingPresetId", presetId);
}

/**
 * Get custom sampling presets from localStorage
 */
export function getCustomSamplingPresets(): SamplingPreset[] {
  if (typeof window === "undefined") return [];
  const stored = localStorage.getItem("customSamplingPresets");
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch {
      return [];
    }
  }
  return [];
}

/**
 * Save custom sampling presets to localStorage
 */
export function saveCustomSamplingPresets(presets: SamplingPreset[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem("customSamplingPresets", JSON.stringify(presets));
}

/**
 * Get all available presets (built-in + custom + shared)
 */
export function getAllSamplingPresets(
  sharedPresets: SamplingPreset[] = []
): SamplingPreset[] {
  const customPresets = getCustomSamplingPresets();
  return [...BUILT_IN_SAMPLING_PRESETS, ...customPresets, ...sharedPresets];
}

/**
 * Find a preset by ID
 */
export function findSamplingPreset(
  presetId: string,
  sharedPresets: SamplingPreset[] = []
): SamplingPreset | undefined {
  return getAllSamplingPresets(sharedPresets).find((p) => p.id === presetId);
}

/**
 * Filter sampling settings for a specific provider
 * Mistral doesn't support min_p, top_k, repetition_penalty
 */
export function filterSettingsForProvider(
  settings: SamplingSettings,
  provider: "mistral" | "deepinfra"
): Partial<SamplingSettings> {
  if (provider === "mistral") {
    return {
      temperature: settings.temperature,
      top_p: settings.top_p,
      presence_penalty: settings.presence_penalty,
      frequency_penalty: settings.frequency_penalty,
    };
  }
  // DeepInfra supports all settings
  return settings;
}

/**
 * Validate and clamp sampling settings to valid ranges
 */
export function validateSamplingSettings(
  settings: Partial<SamplingSettings>
): SamplingSettings {
  return {
    temperature: Math.max(0, Math.min(2, settings.temperature ?? 1.0)),
    top_p: Math.max(0, Math.min(1, settings.top_p ?? 1.0)),
    min_p: Math.max(0, Math.min(1, settings.min_p ?? 0)),
    top_k: Math.max(0, Math.min(1000, Math.floor(settings.top_k ?? 0))),
    presence_penalty: Math.max(
      -2,
      Math.min(2, settings.presence_penalty ?? 0)
    ),
    frequency_penalty: Math.max(
      -2,
      Math.min(2, settings.frequency_penalty ?? 0)
    ),
    repetition_penalty: Math.max(
      0.01,
      Math.min(5, settings.repetition_penalty ?? 1.0)
    ),
  };
}

/**
 * Export a preset as a shareable JSON string
 */
export function exportPresetAsJson(preset: SamplingPreset): string {
  const exportData = {
    name: preset.name,
    description: preset.description,
    settings: preset.settings,
  };
  return JSON.stringify(exportData, null, 2);
}

/**
 * Import a preset from JSON string
 */
export function importPresetFromJson(
  json: string,
  authorId?: string,
  authorName?: string
): SamplingPreset | null {
  try {
    const data = JSON.parse(json);
    if (!data.name || !data.settings) {
      return null;
    }
    return {
      id: crypto.randomUUID(),
      name: data.name,
      description: data.description || "",
      settings: validateSamplingSettings(data.settings),
      isBuiltIn: false,
      authorId,
      authorName,
      createdAt: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}
