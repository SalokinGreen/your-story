/**
 * What the E5 starters share (docs/bb-starters-design.md §2, §5): which of
 * the Rules pack's notes a starter in its own world copies, and how a built-in
 * note becomes a story note. The Hollow Hour keeps its own copy of these
 * (hollowHour.ts), since it also carries Europe by Night.
 */
import type { StoryLore } from "../../../structs";
import type { BuiltinNote } from "../../types";

/**
 * The twelve E1 table families. They are Europe by Night's (the Concord, the
 * Vigil, the Masquerade, the Hollow Roads, European names and places), so a
 * starter set in its own world leaves them out and brings its own tables.
 */
export const EUROPE_TABLE_FAMILY_IDS: ReadonlySet<string> = new Set(
  [
    "people",
    "night",
    "places",
    "factions",
    "vigil",
    "masquerade",
    "rumours",
    "feeding",
    "hooks",
    "objects",
    "investigation",
    "roads",
  ].map((slug) => `builtin:blood-and-bone:oracles-${slug}`),
);

/**
 * The Rules notes a starter in its own world copies: every unscoped note but
 * the E1 table families. The mechanics, the miss tables, the three oracles and
 * the creation prompts stay.
 */
export function ownWorldRulesNotes(packNotes: BuiltinNote[]): BuiltinNote[] {
  return packNotes.filter(
    (n) => n.scope === undefined && !EUROPE_TABLE_FAMILY_IDS.has(n.id),
  );
}

/** A built-in note as a story note, linked back by `libraryNoteId`. */
export function builtinToLore(n: BuiltinNote): StoryLore {
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

/** A starter's own note (no built-in id: it belongs to the story, not a pack). */
export function starterNote(
  title: string,
  type: StoryLore["type"],
  content: string,
  opts: { keys?: string[]; secret?: boolean; characters?: string[] } = {},
): StoryLore {
  return {
    title,
    content,
    relatedCharacters: opts.characters ?? [],
    relatedLocations: [],
    secrtet: !!opts.secret,
    keys: opts.keys ?? [],
    type,
    on: true,
    ...(opts.secret ? { visibility: "hidden" as const } : {}),
  };
}
