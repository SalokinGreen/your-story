// Adventure character presets - author-created presets for their specific adventures

import { Preset, Condition } from "./structs";

// Default preset only - authors will create their own
export const DEFAULT_PRESET: Preset = {
  id: "custom",
  name: "Custom",
  description:
    "Create your own character from scratch with no predefined attributes.",
  icon: "Sparkles",
  playerSummary: "",
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
  playerName: string,
  playerSummary: string,
  intro: string,
  stats: any[],
  resources: any[],
  inventory: any[],
  relationships: any[],
  conditions: Condition[],
  authorNotes: string
): Preset {
  return {
    id: `preset-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    name,
    description,
    icon,
    playerName,
    playerSummary,
    intro,
    stats: JSON.parse(JSON.stringify(stats)), // Deep clone
    resources: JSON.parse(JSON.stringify(resources)),
    inventory: JSON.parse(JSON.stringify(inventory)),
    relationships: JSON.parse(JSON.stringify(relationships)),
    conditions: JSON.parse(JSON.stringify(conditions)),
    authorNotes,
  };
}

// Apply a preset to current settings
export function applyPreset(
  preset: Preset,
  setPlayerName: (val: string) => void,
  setPlayerSummary: (val: string) => void,
  setIntro: (val: string) => void,
  setStats: (val: any[]) => void,
  setResources: (val: any[]) => void,
  setInventory: (val: any[]) => void,
  setRelationships: (val: any[]) => void,
  setConditions: (val: Condition[]) => void,
  setAuthorNotes: (val: string) => void
) {
  if (preset.id === "custom") {
    // Don't modify anything for custom preset
    return;
  }

  if (preset.playerName !== undefined) setPlayerName(preset.playerName);
  if (preset.playerSummary !== undefined)
    setPlayerSummary(preset.playerSummary);
  // Only set intro if it exists in the preset (for backward compatibility)
  if (preset.intro !== undefined) setIntro(preset.intro);

  // Always apply arrays, even if empty, to correctly reflect the preset
  setStats(JSON.parse(JSON.stringify(preset.stats || [])));
  setResources(JSON.parse(JSON.stringify(preset.resources || [])));
  setInventory(JSON.parse(JSON.stringify(preset.inventory || [])));
  setRelationships(JSON.parse(JSON.stringify(preset.relationships || [])));
  setConditions(JSON.parse(JSON.stringify(preset.conditions || [])));

  if (preset.authorNotes !== undefined) setAuthorNotes(preset.authorNotes);
}
