// Adventure character presets - author-created presets for their specific adventures

import { Preset } from "./structs";

// Default preset only - authors will create their own
export const DEFAULT_PRESET: Preset = {
  id: "custom",
  name: "Custom",
  description: "Create your own character from scratch with no predefined attributes.",
  icon: "✨",
  playerSummary: "",
  stats: [],
  resources: [],
  inventory: [],
  authorNotes: "",
};

// Get preset from adventure's preset list
export function getPresetById(presets: Preset[], id: string): Preset | undefined {
  return presets.find(p => p.id === id);
}

// Create a new preset from current adventure settings
export function createPresetFromCurrentSettings(
  name: string,
  description: string,
  icon: string,
  playerSummary: string,
  stats: any[],
  resources: any[],
  inventory: any[],
  authorNotes: string
): Preset {
  return {
    id: `preset-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    name,
    description,
    icon,
    playerSummary,
    stats: JSON.parse(JSON.stringify(stats)), // Deep clone
    resources: JSON.parse(JSON.stringify(resources)),
    inventory: JSON.parse(JSON.stringify(inventory)),
    authorNotes,
  };
}

// Apply a preset to current settings
export function applyPreset(
  preset: Preset,
  setPlayerSummary: (val: string) => void,
  setStats: (val: any[]) => void,
  setResources: (val: any[]) => void,
  setInventory: (val: any[]) => void,
  setAuthorNotes: (val: string) => void
) {
  if (preset.id === "custom") {
    // Don't modify anything for custom preset
    return;
  }

  if (preset.playerSummary) setPlayerSummary(preset.playerSummary);
  if (preset.stats.length > 0) setStats(JSON.parse(JSON.stringify(preset.stats)));
  if (preset.resources.length > 0) setResources(JSON.parse(JSON.stringify(preset.resources)));
  if (preset.inventory.length > 0) setInventory(JSON.parse(JSON.stringify(preset.inventory)));
  if (preset.authorNotes) setAuthorNotes(preset.authorNotes);
}
