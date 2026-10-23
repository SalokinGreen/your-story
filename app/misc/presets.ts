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
