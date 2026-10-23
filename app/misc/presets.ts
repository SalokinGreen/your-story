// Adventure character presets - author-created presets for their specific adventures

import { Choice, Preset, StoryData } from "./structs";

// Default preset only - authors will create their own
export const DEFAULT_PRESET: Preset = {
  id: "custom",
  name: "Custom",
  description:
    "Build your character with the GM.",
  icon: "Sparkles",
  characterSheet: "",
  intro: "",
  stats: [],
  resources: [],
  inventory: [],
  relationships: [],
  authorNotes: "",
};

// True when the adventure offers at least one pre-made character. Only then
// does a new story show the preset picker; otherwise it starts as Custom.
export function hasPremadeCharacters(
  story: Pick<StoryData, "presets">
): boolean {
  return (story.presets ?? []).some((p) => p.id !== "custom");
}

// A starting choice's authored opening (intro_override) is inserted as the
// story's first reply without calling the GM. That shortcut is off while
// session zero is active: the choice goes to the GM, which still has the
// character, the plan and start_game to do.
export function shouldUseIntroOverride(
  story: Pick<StoryData, "sessionZeroActive">,
  choice: Pick<Choice, "text" | "intro_override">
): boolean {
  return !!choice.intro_override && !story.sessionZeroActive;
}

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

  if (preset.authorNotes !== undefined) setAuthorNotes(preset.authorNotes);
}
