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

// The strip above the composer offers the two ways to set up (SetupStrip.tsx).
export const SETUP_STYLE_POINTER =
  "Pick how you'd like to set up below - quick, or step by step - or just tell me what you're in the mood for.";

/**
 * The first thing an adventure's new story shows (decision 197): what the
 * adventure is, who the player will be, and how setup goes. The authored
 * opening waits for start_game (authoredOpeningForStart), so the player is
 * welcomed and set up before the story drops them anywhere.
 */
export function buildAdventureWelcome(
  story: Pick<StoryData, "story_name" | "premise">,
  preset: Pick<Preset, "id" | "name">,
): string {
  // A new story is named "<adventure title> - <date>" (localStoryManager);
  // the welcome names the adventure.
  const title = story.story_name?.trim().replace(/\s+-\s+\d[\d./\-\s]*$/, "");
  const lines = [title ? `Welcome to **${title}**.` : "Welcome."];
  if (story.premise?.trim()) lines.push(story.premise.trim());
  lines.push(
    (preset.id !== "custom"
      ? `You'll be playing ${preset.name}. Before the story starts, we'll go over your character and the campaign together.`
      : "Before the story starts, we'll make your character and set up the campaign together.") +
      ` ${SETUP_STYLE_POINTER}`,
  );
  return lines.join("\n\n");
}

/**
 * The authored opening start_game hands the GM to play after its briefing
 * (decision 197), or null when the story has none, or did not begin with the
 * welcome: a story begun before the welcome existed already showed an opening
 * as its first part (the adventure's, or a preset's own), and handing one over
 * again would repeat the scene or play a second one.
 */
export function authoredOpeningForStart(
  story: Pick<StoryData, "intro" | "scene">,
): string | null {
  const intro = story.intro?.trim();
  if (!intro) return null;
  const first = story.scene?.parts?.[0]?.content ?? "";
  return first.includes(SETUP_STYLE_POINTER) ? intro : null;
}
