import { StoryData } from "./structs";

/**
 * Top-level StoryData keys the legacy removal deleted (decision 126). An old
 * arcade save still carries them; they are dropped on load, along with the
 * structured data they held (stats, resources, items, abilities, the shop and
 * skill trees, the game-over screen, New Game+). `customTables` is not here:
 * it is migration input for tableNotes.ts and stays until that runs.
 */
export const REMOVED_STORY_FIELDS = [
  "stats",
  "resources",
  "inventory",
  "abilities",
  "relationships",
  "variables",
  "skillTrees",
  "unlockedNodes",
  "nodeEffects",
  "restState",
  "stress",
  "maxStress",
  "reverseDC",
  "upgradeSettings",
  "newGamePlusCount",
  "newGamePlusMode",
  "gameOver",
  "pendingPlayerActions",
  "incidentalReactions",
] as const;

// The arcade tags a Choice or StartingChoice used to carry.
const REMOVED_CHOICE_FIELDS = [
  "skill_used",
  "skill_dc",
  "skill_dc_tier",
  "item_used",
  "item_loss",
  "resource_used",
  "ability_used",
  "stat_bonus",
  "agmt_check",
  "agmt_context_only",
  "agmt_table",
  "table",
  "custom_table",
  "rolls",
  "challenge_handling",
] as const;

const REMOVED_PRESET_FIELDS = [
  "stats",
  "resources",
  "inventory",
  "abilities",
  "relationships",
  "variables",
  "npcs",
] as const;

// The removed keys are no longer on the types, so reaching them takes a loose
// view of an object. Narrow on purpose: a bag of unknowns, never `any`.
type Loose = Record<string, unknown>;

function isObject(value: unknown): value is Loose {
  return typeof value === "object" && value !== null;
}

function deleteKeys(target: unknown, keys: readonly string[]): void {
  if (!isObject(target)) return;
  for (const key of keys) delete target[key];
}

function stripChoices(choices: unknown): void {
  if (!Array.isArray(choices)) return;
  for (const choice of choices) deleteKeys(choice, REMOVED_CHOICE_FIELDS);
}

function stripParts(parts: unknown): void {
  if (!Array.isArray(parts)) return;
  for (const part of parts) {
    if (!isObject(part)) continue;
    delete part.gameOver;
    stripChoices(part.choices);
    // A rewritten turn's saved first draft keeps its own choices.
    if (isObject(part.observerRewriteOriginal)) {
      stripChoices(part.observerRewriteOriginal.choices);
    }
  }
}

/**
 * Deletes, in place, every field the legacy removal took out of the data
 * model, and returns the same object: the removed top-level keys, a preset's
 * legacy arrays, a note's variable triggers, `agmtState.threads`, a scene
 * part's `gameOver`, and the arcade tags on saved choices and starting
 * choices. The nested places are why this is more than a key list: a story
 * snapshot restored by Undo, a synced blob from an older build and an old
 * save all carry them. Safe to run on a story that has none of them.
 */
export function stripRemovedFields(story: StoryData): StoryData {
  deleteKeys(story, REMOVED_STORY_FIELDS);
  if (Array.isArray(story.presets)) {
    for (const preset of story.presets) deleteKeys(preset, REMOVED_PRESET_FIELDS);
  }
  if (Array.isArray(story.lore)) {
    for (const note of story.lore) {
      deleteKeys(note, ["var_on_triggers", "var_off_triggers"]);
    }
  }
  deleteKeys(story.agmtState, ["threads"]);
  stripParts(story.scene?.parts);
  if (Array.isArray(story.chapters)) {
    for (const chapter of story.chapters) stripParts(chapter?.scene?.parts);
  }
  stripChoices(story.starting_choices);
  return story;
}

/**
 * Backfills every array StoryData declares as required, in place, and
 * returns the same object. It first strips the fields the legacy removal
 * deleted (stripRemovedFields), so this is the one place an old save, a
 * synced blob or a host's snapshot is brought up to the current shape.
 *
 * A story doesn't always arrive with all of them. The Game Designer's
 * draftToAdventure() only writes what the GM reads, and startAdventureLocally()
 * copies that template as-is, so it has no npcs when the cast is empty, and
 * older saves can predate goals. Code throughout the app still reads these as
 * plain arrays, so the story start and the story load both run this rather
 * than every reader guarding on its own. Existing values are never replaced.
 */
export function ensureStoryDataArrays(storyData: StoryData): StoryData {
  stripRemovedFields(storyData);
  storyData.memory ??= [];
  storyData.chapters ??= [];
  storyData.scene ??= { parts: [] };
  storyData.scene.parts ??= [];
  storyData.lore ??= [];
  storyData.goals ??= [];
  storyData.npcs ??= [];
  return storyData;
}

/**
 * The shape the host sends online guests: the story plus the six empty arrays
 * a build from before the legacy removal reads without guarding (its Story
 * Editor maps `resources` and spreads `relationships`, and a guest applies a
 * snapshot as it arrives, with no repair of its own). A copy, never the
 * host's own story, which stays stripped. A new guest strips them again on
 * receive (ensureStoryDataArrays). Drop this once builds from before the
 * removal are no longer around to join a room.
 */
export function withLegacyGuestShim(story: StoryData): StoryData {
  return {
    ...story,
    stats: [],
    resources: [],
    inventory: [],
    abilities: [],
    relationships: [],
    variables: [],
  } as unknown as StoryData;
}
