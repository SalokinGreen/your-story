// Writes the visual description a picture is made from, for the two ways a
// picture starts without the GM writing one: the Illustrate this button (from a
// turn's prose) and the portrait buttons (from an NPC or the character sheet).
// A small side call on the side-agent model (decision 53: it names an effort),
// costing a fraction of a cent; on any failure it falls back to the start of the
// source text, so the button always has something to paint.

import { callSideModel, type ProviderKeys } from "./sideModelCall";
import { resolveSideCallModel } from "./layerSettings";
import type { StoryData } from "./structs";

export interface ImagePromptApiOptions {
  keys: ProviderKeys;
  costTurnId?: string;
  abortSignal?: AbortSignal;
}

const CONTENT_RULES = `Describe only what can be seen. No text, captions or lettering in the picture. Keep it non-explicit: nothing sexual, and no gore beyond what a fantasy book cover would show.`;

const SCENE_SYSTEM = `You write the brief for an illustrator. Given a passage from an interactive story, describe, in under 60 words, what a camera would see in its most picture-worthy moment: who is there, where, the light, the mood, the framing. Name each person by their appearance, not their backstory. ${CONTENT_RULES} Reply with the description only.`;

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
      maxTokens: 200,
      temperature: 0.5,
      abortSignal: api.abortSignal,
      costTurnId: api.costTurnId,
    });
    const text = result.ok ? (result.data.content || "").trim() : "";
    if (text) return text.slice(0, 400);
  } catch (error) {
    if ((error as { name?: unknown })?.name === "AbortError") throw error;
  }
  return fallbackDescription(fallbackSource);
}

/** What a camera would see in this turn's prose (the Illustrate this button). */
export function writeSceneDescription(
  prose: string,
  _storyData: StoryData,
  api: ImagePromptApiOptions,
): Promise<string> {
  return describe(SCENE_SYSTEM, prose.slice(-3000), "Picture description", api, prose);
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
