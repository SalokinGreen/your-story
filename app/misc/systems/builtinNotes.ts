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
 * - City notes are not pushed (scope is a place name); they stay in the
 *   library to import.
 */
import type { StoryData, StoryLore } from "../structs";
import { BUILTIN_SYSTEMS } from "./index";
import { resolveSystem } from "./resolve";
import type { BuiltinNote, BuiltinSystem } from "./types";

/** The scope of the setting notes every story of the setting uses. */
export const CROSS_SETTING_SCOPE = "cross-europe";

function heldIds(story: Pick<StoryData, "lore">): Set<string> {
  const ids = new Set<string>();
  for (const l of story.lore ?? []) if (l.libraryNoteId) ids.add(l.libraryNoteId);
  return ids;
}

/** The notes a story of this system is given on load: the Rules pack and the cross-setting notes. */
export function pushedBuiltinNotes(system: BuiltinSystem): BuiltinNote[] {
  const out: BuiltinNote[] = [];
  for (const pack of system.packs) {
    const isRules = pack.id.endsWith(":rules");
    for (const n of pack.notes) {
      if (isRules || n.scope === CROSS_SETTING_SCOPE) out.push(n);
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
  return pushedBuiltinNotes(system).filter(
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
