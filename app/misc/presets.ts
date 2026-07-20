// Adventure character presets - author-created presets for their specific adventures

import { Preset, Condition } from "./structs";

// Default preset only - authors will create their own
export const DEFAULT_PRESET: Preset = {
  id: "custom",
  name: "Custom",
  description:
    "Create your own character from scratch using the character sheet template.",
  icon: "Sparkles",
  characterSheet: "",
  intro: "",
  stats: [],
  resources: [],
  inventory: [],
  relationships: [],
  conditions: [],
  authorNotes: "",
};

// Get preset from adventure's preset list
export function getPresetById(
  presets: Preset[],
  id: string
): Preset | undefined {
  return presets.find((p) => p.id === id);
}

// Create a new preset from current adventure settings
export function createPresetFromCurrentSettings(
  name: string,
  description: string,
  icon: string,
  characterSheet: string,
  intro: string,
  stats: any[],
  resources: any[],
  relationships: any[],
  conditions: Condition[],
  authorNotes: string
): Preset {
  return {
    id: `preset-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    name,
    description,
    icon,
    characterSheet,
    intro,
    stats: JSON.parse(JSON.stringify(stats)), // Deep clone
    resources: JSON.parse(JSON.stringify(resources)),
    // Structured starting-inventory authoring has been removed; kept as an
    // empty array only to satisfy the Preset type (see structs.ts) for
    // backward compatibility with old saved presets that still carry items.
    inventory: [],
    relationships: JSON.parse(JSON.stringify(relationships)),
    conditions: JSON.parse(JSON.stringify(conditions)),
    authorNotes,
  };
}

// Apply a preset to current settings (for creator editing)
export function applyPreset(
  preset: Preset,
  setCharacterSheet: (val: string) => void,
  setIntro: (val: string) => void,
  setStats: (val: any[]) => void,
  setResources: (val: any[]) => void,
  setRelationships: (val: any[]) => void,
  setConditions: (val: Condition[]) => void,
  setAuthorNotes: (val: string) => void
) {
  if (preset.id === "custom") {
    // Don't modify anything for custom preset
    return;
  }

  if (preset.characterSheet !== undefined)
    setCharacterSheet(preset.characterSheet);
  // Only set intro if it exists in the preset (for backward compatibility)
  if (preset.intro !== undefined) setIntro(preset.intro);

  // Always apply arrays, even if empty, to correctly reflect the preset
  setStats(JSON.parse(JSON.stringify(preset.stats || [])));
  setResources(JSON.parse(JSON.stringify(preset.resources || [])));
  setRelationships(JSON.parse(JSON.stringify(preset.relationships || [])));
  setConditions(JSON.parse(JSON.stringify(preset.conditions || [])));

  if (preset.authorNotes !== undefined) setAuthorNotes(preset.authorNotes);
}
