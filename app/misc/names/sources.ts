/**
 * Where a new name is rolled from (randomness plan R2, design 3.2, decision
 * 260). Sources are declared, never discovered: nothing scans arbitrary notes
 * for names. The order is
 *   1. the story's own table note whose title contains "Names" (not built in);
 *   2. the sources its system declares (`BuiltinSystem.nameSources`), a
 *      starter's own (matching `systemState.setting`) before the system's;
 *   3. the built-in fallback lists (builtinLists.ts), which is not a source here.
 * `rollNames` uses the first tier that has any source.
 */
import type { StoryData, StoryLore } from "../structs";
import { resolveSystem } from "../systems/resolve";
import type { NameSourceDecl } from "../systems/types";
import { parseTableNote, selectTable, tablePathLabel } from "../tableRoll";
import type { TableSpec } from "../tableRoll";

export type NameKind = "person" | "place";

export interface NameSource extends NameSourceDecl {
  tier: "story" | "declared";
  /** The note's library id, else its title. */
  noteRef: string;
  /** The note the tables are rolled from. */
  note: Pick<StoryLore, "title" | "content">;
}

const PLACE_WORDS = /place|town|city|village|region|street|location|land|settlement|hamlet|realm/i;
const FIRST_WORDS = /first|given|forename|personal/i;
const FAMILY_WORDS = /family|surname|last|house|clan/i;

function isBuiltin(l: Pick<StoryLore, "libraryNoteId">): boolean {
  return typeof l.libraryNoteId === "string" && l.libraryNoteId.startsWith("builtin:");
}

function labelOf(t: TableSpec): string {
  return tablePathLabel(t.path);
}

/** The compositions a story's own names note offers for a kind. */
function composeFromNote(tables: TableSpec[], kind: NameKind): string[][][] {
  const labels = tables.map(labelOf);
  if (kind === "place") {
    return labels.filter((l) => PLACE_WORDS.test(l)).map((l) => [[l]]);
  }
  const people = labels.filter((l) => !PLACE_WORDS.test(l));
  const first = people.filter((l) => FIRST_WORDS.test(l));
  const family = people.filter((l) => FAMILY_WORDS.test(l));
  if (first.length === 1 && family.length === 1) return [[[first[0]], [family[0]]]];
  return people.map((l) => [[l]]);
}

function storyOwnSources(story: StoryData, kind: NameKind): NameSource[] {
  const out: NameSource[] = [];
  for (const l of story.lore ?? []) {
    if (l.type !== "table" || l.enabled === false || isBuiltin(l)) continue;
    if (!/names?\b/i.test(l.title ?? "")) continue;
    const parsed = parseTableNote(l.content ?? "");
    if (!parsed.ok) continue;
    for (const compose of composeFromNote(parsed.tables, kind)) {
      out.push({
        kind,
        compose,
        tier: "story",
        noteRef: l.libraryNoteId ?? l.title,
        note: { title: l.title, content: l.content },
      });
    }
  }
  return out;
}

function composeResolves(tables: TableSpec[], compose: string[][]): boolean {
  return compose.every((path) => selectTable(tables, path.join(" > ")).ok);
}

function declaredSources(story: StoryData, kind: NameKind): NameSource[] {
  const system = resolveSystem(story).system;
  if (!system?.nameSources?.length) return [];
  const setting = story.systemState?.setting ?? system.defaultSetting;
  const decls = system.nameSources.filter(
    (d) => d.kind === kind && (d.setting === undefined || d.setting === setting),
  );
  // A starter's own source before the system's.
  decls.sort((a, b) => Number(b.setting !== undefined) - Number(a.setting !== undefined));

  const resolved: NameSource[] = [];
  for (const d of decls) {
    const note = (story.lore ?? []).find(
      (l) =>
        l.type === "table" &&
        l.enabled !== false &&
        ((d.noteId && l.libraryNoteId === d.noteId) || (d.noteTitle && l.title === d.noteTitle)),
    );
    if (!note) continue;
    const parsed = parseTableNote(note.content ?? "");
    if (!parsed.ok || !composeResolves(parsed.tables, d.compose)) continue;
    resolved.push({
      ...d,
      tier: "declared",
      noteRef: d.noteId ?? d.noteTitle ?? note.title,
      note: { title: note.title, content: note.content },
    });
  }

  // Fantastic Realms: the scene's realm, else every realm's list pooled (also
  // for a realm that has no names table).
  const realmBound = resolved.filter((s) => s.realm !== undefined);
  if (realmBound.length > 0) {
    const current = story.systemState?.fantasticRealms?.realm;
    const matching = current ? realmBound.filter((s) => s.realm === current) : [];
    const keep = matching.length > 0 ? matching : realmBound;
    return [...resolved.filter((s) => s.realm === undefined), ...keep];
  }
  return resolved;
}

/**
 * The sources for a kind, the first tier that has any first. An empty list
 * means the built-in fallback lists.
 */
export function nameSourcesFor(story: StoryData, kind: NameKind): NameSource[] {
  const own = storyOwnSources(story, kind);
  if (own.length > 0) return own;
  return declaredSources(story, kind);
}
