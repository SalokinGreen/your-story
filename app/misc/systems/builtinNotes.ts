/**
 * New built-in notes reaching older stories (Blood & Bone expansion E1,
 * design 3.2, decision 156). A story copies a pack's notes when it starts, so
 * a note added to the pack later would never reach it. On load, a story that
 * runs a built-in system gains the system's rules notes and its cross-setting
 * notes it does not hold yet.
 *
 * - A note the story holds is never touched, edited or not (matched by
 *   `libraryNoteId`).
 * - A note the player deleted stays deleted: `systemState.builtinNotesOffered`
 *   records every built-in id the story has been given, and only ids outside
 *   it are added.
 * - A story saved before the list existed starts with the ids it holds.
 * - Only a story that holds the system's core note and has not switched the
 *   system tools off is touched; a story that merely imported a setting note
 *   or one oracle is left alone.
 * - A note of a pinned type (dm_instructions, character_sheet, gm_plan) is
 *   never pushed: the GM carries those in full every turn.
 * - A story created from an adventure or starter is seeded with every id
 *   that would be pushed (`seedBuiltinNotesOffered`), so notes the author left
 *   out count as offered and only notes shipped later arrive.
 * - City notes are not pushed (scope is a place name); they stay in the
 *   library to import.
 */
import type { StoryData, StoryLore } from "../structs";
import { BUILTIN_SYSTEMS } from "./index";
import { resolveSystem } from "./resolve";
import { EUROPE_BY_NIGHT_SETTING, type BuiltinNote, type BuiltinSystem } from "./types";

/** The core note's id: a story holding it runs the system (design 3.2). */
export const BLOOD_AND_BONE_CORE_ID = "builtin:blood-and-bone:core";

const PINNED_TYPES = new Set(["dm_instructions", "character_sheet", "gm_plan"]);

/** The scope of the setting notes every story of the setting uses. */
export const CROSS_SETTING_SCOPE = "cross-europe";

/** Whether a story's built-in notes are kept up to date: it holds the core and the tools are not off. */
function keepsBuiltinNotes(story: Pick<StoryData, "lore" | "systemState">): boolean {
  if (story.systemState?.usesSystemTools === false) return false;
  return (story.lore ?? []).some((l) => l.libraryNoteId === BLOOD_AND_BONE_CORE_ID);
}

function heldIds(story: Pick<StoryData, "lore">): Set<string> {
  const ids = new Set<string>();
  for (const l of story.lore ?? []) if (l.libraryNoteId) ids.add(l.libraryNoteId);
  return ids;
}

export { EUROPE_BY_NIGHT_SETTING };

/** Whether a story's setting is Europe by Night: unset is (every story before E5). */
function inCrossSetting(setting: string | undefined): boolean {
  return setting === undefined || setting === EUROPE_BY_NIGHT_SETTING;
}

/**
 * The notes a story of this system is given on load: the Rules pack, and the
 * cross-setting notes when the story is played in that setting (a Grave
 * Watcher story is not given Europe by Night's notes; design E5 §5).
 */
export function pushedBuiltinNotes(
  system: BuiltinSystem,
  setting?: string,
): BuiltinNote[] {
  const cross = inCrossSetting(setting);
  const storySetting = setting ?? EUROPE_BY_NIGHT_SETTING;
  const out: BuiltinNote[] = [];
  for (const pack of system.packs) {
    const isRules = pack.id.endsWith(":rules");
    for (const n of pack.notes) {
      if (PINNED_TYPES.has(n.type)) continue;
      if (n.setting !== undefined && n.setting !== storySetting) continue;
      if (isRules || (cross && n.scope === CROSS_SETTING_SCOPE)) out.push(n);
    }
  }
  return out;
}

/**
 * The pushed notes the story neither holds nor has been offered. Pure: reads
 * the story, changes nothing.
 */
export function missingBuiltinNotes(
  story: Pick<StoryData, "lore" | "systemState">,
  system: BuiltinSystem,
): BuiltinNote[] {
  const held = heldIds(story);
  const offered = new Set(story.systemState?.builtinNotesOffered ?? [...held]);
  return pushedBuiltinNotes(system, story.systemState?.setting).filter(
    (n) => !held.has(n.id) && !offered.has(n.id),
  );
}

function builtinNoteToLore(n: BuiltinNote): StoryLore {
  return {
    title: n.title,
    content: n.content,
    relatedCharacters: [],
    relatedLocations: [],
    secrtet: n.type === "secret",
    keys: n.keys ?? [],
    type: n.type,
    on: true,
    tags: n.tags ?? [],
    libraryNoteId: n.id,
    ...(n.visibility ? { visibility: n.visibility } : {}),
  };
}

/**
 * Appends the missing built-in notes to the story's lore (in place, like
 * ensureStoryDataArrays), records every built-in id now held or added in
 * `systemState.builtinNotesOffered`, and returns how many notes were added.
 * Does nothing to a story that runs no built-in system. A missing note whose
 * title is already taken by a note the story wrote is not added (two notes
 * with one title cannot both be read), but counts as offered.
 */
export function addMissingBuiltinNotes(
  story: StoryData,
  systems: BuiltinSystem[] = BUILTIN_SYSTEMS,
): number {
  if (!keepsBuiltinNotes(story)) return 0;
  const { system } = resolveSystem(story, systems);
  if (!system) return 0;
  const missing = missingBuiltinNotes(story, system);
  const lore = story.lore ?? [];
  const taken = new Set(lore.map((l) => l.title.trim().toLowerCase()));
  const toAdd = missing.filter((n) => !taken.has(n.title.trim().toLowerCase()));
  if (toAdd.length > 0) {
    story.lore = [...lore, ...toAdd.map(builtinNoteToLore)];
  }
  const offered = new Set(
    story.systemState?.builtinNotesOffered ?? [...heldIds(story)],
  );
  for (const id of heldIds(story)) offered.add(id);
  for (const n of missing) offered.add(n.id);
  const next = [...offered];
  const prev = story.systemState?.builtinNotesOffered;
  if (!prev || prev.length !== next.length) {
    story.systemState = {
      sessionCount: 0,
      dedupKeys: [],
      ...story.systemState,
      builtinNotesOffered: next,
    };
  }
  return toAdd.length;
}

/**
 * For a story just created from an adventure or starter: records every id
 * `pushedBuiltinNotes` would push as offered (plus what the story holds), so
 * a note the author left out stays out and only notes shipped later arrive.
 * Does nothing to a story that would not be kept up to date.
 */
export function seedBuiltinNotesOffered(
  story: StoryData,
  systems: BuiltinSystem[] = BUILTIN_SYSTEMS,
): void {
  if (!keepsBuiltinNotes(story)) return;
  const { system } = resolveSystem(story, systems);
  if (!system) return;
  const offered = new Set(story.systemState?.builtinNotesOffered ?? []);
  for (const id of heldIds(story)) offered.add(id);
  for (const n of pushedBuiltinNotes(system, story.systemState?.setting)) offered.add(n.id);
  story.systemState = {
    sessionCount: 0,
    dedupKeys: [],
    ...story.systemState,
    builtinNotesOffered: [...offered],
  };
}
