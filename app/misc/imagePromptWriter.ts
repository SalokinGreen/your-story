// Writes the visual description a picture is made from, for the two ways a
// picture starts without the GM writing one: the Illustrate this button (from a
// turn's prose) and the portrait buttons (from an NPC or the character sheet).
// A small side call on the side-agent model (decision 53: it names an effort),
// costing a fraction of a cent; on any failure it falls back to the start of the
// source text, so the button always has something to paint.

import { callSideModel, type ProviderKeys } from "./sideModelCall";
import { resolveSideCallModel } from "./layerSettings";
import type { StoryData } from "./structs";
import { characterLine } from "./imageJobs";

export interface ImagePromptApiOptions {
  keys: ProviderKeys;
  costTurnId?: string;
  abortSignal?: AbortSignal;
}

const CONTENT_RULES = `Describe only what can be seen. No text, captions or lettering in the picture. Keep it non-explicit: nothing sexual, and no gore beyond what a fantasy book cover would show.`;

// Decision 111: the illustrator never sees the story, so the brief carries the
// setting and how each person looks, and states telling traits outright (a
// missing arm, a scar, grey hair) instead of leaving them to the prose.
const SCENE_SYSTEM = `You write the brief for an illustrator who has never read the story. Given a passage from an interactive story, the setting, and notes on how the people in it look, describe, in under 90 words, what a camera would see in its most picture-worthy moment: who is there and what they are doing, where, the period and place, the light, the mood, the framing. Name each person by their appearance, not their backstory, and state their telling physical traits plainly (age, build, hair, clothing, a missing limb, a scar), because the illustrator knows only what you write. Include only people who are actually in that moment. ${CONTENT_RULES} Reply with the description only.`;

/** The longest brief the button sends; the engine adds the character and style lines after it. */
const SCENE_DESCRIPTION_MAX_CHARS = 600;

const PORTRAIT_SYSTEM = `You write the brief for a character portrait. Given notes about a character, describe, in under 50 words, how they look: face, build, age, clothing, bearing, and one telling detail, framed from the chest up against a simple background that suits them. ${CONTENT_RULES} Reply with the description only.`;

/** The fallback description: the start of the source text, trimmed to a sentence boundary when it can be. */
export function fallbackDescription(source: string, max = 300): string {
  const text = source.replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const stop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "));
  return stop > max * 0.5 ? cut.slice(0, stop + 1) : cut.trimEnd();
}

async function describe(
  system: string,
  user: string,
  label: string,
  api: ImagePromptApiOptions,
  fallbackSource: string,
  maxChars = 400,
): Promise<string> {
  try {
    // An unpinned side agent: the side-agent default and its effort (decision
    // 53), or the narration voice when the player has no key for that default.
    const { model, reasoningEffort } = resolveSideCallModel(null, api.keys);
    const result = await callSideModel({
      stage: "image",
      label,
      model,
      reasoningEffort,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      keys: api.keys,
      maxTokens: 300,
      temperature: 0.5,
      abortSignal: api.abortSignal,
      costTurnId: api.costTurnId,
    });
    const text = result.ok ? (result.data.content || "").trim() : "";
    if (text) return text.slice(0, maxChars);
  } catch (error) {
    if ((error as { name?: unknown })?.name === "AbortError") throw error;
  }
  return fallbackDescription(fallbackSource);
}

/** What a camera would see in this turn's prose (the Illustrate this button). */
export function writeSceneDescription(
  prose: string,
  storyData: StoryData,
  api: ImagePromptApiOptions,
  context: {
    /** NPC ids (and "player") who may be in the picture; their looks go in the brief. */
    featuring?: string[];
    /** The turn before this one, usually the player's action, for what is going on. */
    previous?: string;
  } = {},
): Promise<string> {
  return describe(
    SCENE_SYSTEM,
    buildSceneBriefInput(prose, storyData, context.featuring ?? [], context.previous),
    "Picture description",
    api,
    prose,
    SCENE_DESCRIPTION_MAX_CHARS,
  );
}

/** The writer's input: setting, the people's looks, the turn before, then the passage. */
export function buildSceneBriefInput(
  prose: string,
  storyData: StoryData,
  featuring: string[],
  previous?: string,
): string {
  const sections: string[] = [];
  const premise = storyData.premise?.replace(/\s+/g, " ").trim();
  if (premise) sections.push(`Setting: ${premise.slice(0, 500)}`);
  const people = featuring
    .map((id) => characterLine(storyData, id))
    .filter((l): l is string => !!l);
  if (people.length > 0) {
    sections.push(`People who may appear, and how they look:\n${people.map((p) => `- ${p}`).join("\n")}`);
  }
  const before = previous?.replace(/\s+/g, " ").trim();
  if (before) sections.push(`Just before: ${before.slice(-600)}`);
  sections.push(`Passage:\n${prose.slice(-3000)}`);
  return sections.join("\n\n");
}

/** How a character looks, from their notes (NPC description or the character sheet). */
export function writePortraitDescription(
  name: string,
  notes: string,
  api: ImagePromptApiOptions,
): Promise<string> {
  return describe(
    PORTRAIT_SYSTEM,
    `Character: ${name}\n\n${notes.slice(0, 2000)}`,
    "Portrait description",
    api,
    `${name}. ${notes}`,
  );
}
