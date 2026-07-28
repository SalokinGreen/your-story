/**
 * Random tables as notes
 *
 * Tables used to be a structured type the engine owned: `CustomTable`, a
 * name plus `{text, weight}` entries, rolled by `roll_table` doing a weighted
 * pick. That shape could only ever hold the results themselves, so everything
 * around a table - when to roll it, what a result means, which entries send
 * you to another table - had nowhere to live except a one-line `description`.
 *
 * Tables are now ordinary `StoryLore` notes (`type: "table"`). The note names
 * a die, lists what each number gives, and says whatever else it needs to in
 * prose. The GM reads it like any other note and rolls it with `formula_roll`.
 * Nothing here is parsed at play time - this module only exists to render the
 * old structured tables into that prose form once, so existing adventures,
 * saves and library entries carry over.
 */

import { CustomTable, CustomTableEntry, StoryLore } from "./structs";

/**
 * Weights are authored as relative likelihoods ("this result is twice as
 * common"), but a note has to name a die a human can actually roll. Summing
 * the weights gives that die: three entries weighted 3/4/3 become a d10 with
 * the ranges 1-3, 4-7, 8-10, which is exactly the distribution the weighted
 * pick used to produce.
 *
 * Non-integer or non-positive weights would make the ranges meaningless, so
 * they're clamped to a whole number of at least 1 - an entry that can never
 * come up isn't a table row, it's a note.
 */
function normalizeWeight(entry: CustomTableEntry): number {
  const weight = Math.round(Number(entry.weight));
  return Number.isFinite(weight) && weight > 0 ? weight : 1;
}

/**
 * Renders the entries as a numbered listing, prefixed by the die to roll.
 * Even weights give the plain `1.` / `2.` / `3.` form; uneven ones give
 * ranges, since that's how a table with weighted results is written on paper.
 */
export function renderTableEntries(entries: CustomTableEntry[]): string {
  const usable = (entries || []).filter(
    (entry) => entry && typeof entry.text === "string" && entry.text.trim()
  );
  if (usable.length === 0) return "";

  const weights = usable.map(normalizeWeight);
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  const even = weights.every((weight) => weight === 1);

  const lines: string[] = [];
  let cursor = 1;
  usable.forEach((entry, i) => {
    const weight = weights[i];
    const from = cursor;
    const to = cursor + weight - 1;
    cursor = to + 1;
    const label = even || from === to ? `${from}` : `${from}-${to}`;
    lines.push(`${label}. ${entry.text.trim()}`);
  });

  return `Roll 1d${total}:\n${lines.join("\n")}`;
}

/**
 * Converts one legacy `CustomTable` into the note that replaces it.
 *
 * The note is a folder type (titles only in the player's note list, content
 * pulled on demand with `read_notes`), so a table-heavy import doesn't eat
 * the GM's context budget the way an always-on note would. The table's name
 * is also registered as a keyword trigger, so mentioning it in play brings
 * the table into context without the GM having to go looking for it.
 */
export function customTableToNote(table: CustomTable): StoryLore {
  const description = (table.description || "").trim();
  const listing = renderTableEntries(table.entries || []);
  const content = [description, listing].filter(Boolean).join("\n\n");

  return {
    title: table.name,
    content,
    relatedCharacters: [],
    relatedLocations: [],
    secrtet: false,
    keys: [table.name].filter(Boolean),
    type: "table",
    // A table is reference material the GM consults, not something the
    // player is meant to read ahead of - but it isn't a secret either, so
    // it keeps the default visibility and simply isn't pinned on.
    alwaysOn: false,
    enabled: true,
    on: false,
    // The Tables Library folded into the Notes Library, so a table that was
    // linked to a library entry stays linked through the note's own field.
    libraryNoteId: table.libraryTableId,
  };
}

/**
 * True once a note already exists for this table - by library link where
 * there is one, otherwise by title. Migration runs on every load, so it has
 * to be idempotent: a save that was already converted, then re-saved with
 * its legacy `customTables` still attached, must not grow a second copy of
 * every table.
 */
function noteExistsForTable(notes: StoryLore[], table: CustomTable): boolean {
  const title = (table.name || "").trim().toLowerCase();
  return notes.some((note) => {
    if (
      table.libraryTableId &&
      note.libraryNoteId &&
      note.libraryNoteId === table.libraryTableId
    ) {
      return true;
    }
    return (note.title || "").trim().toLowerCase() === title;
  });
}

/**
 * Converts any legacy `customTables` into `type: "table"` notes and returns
 * the merged note list, or null when there was nothing to migrate (so
 * callers can skip writing at all rather than dirtying an untouched save).
 *
 * Tables with no name are dropped: they were unrollable before - `roll_table`
 * matched on name - and they can't become a findable note either.
 */
export function migrateCustomTablesToNotes(
  lore: StoryLore[] | undefined,
  customTables: CustomTable[] | undefined
): StoryLore[] | null {
  if (!customTables || customTables.length === 0) return null;

  const notes = [...(lore || [])];
  let added = 0;

  for (const table of customTables) {
    if (!table || !(table.name || "").trim()) continue;
    if (noteExistsForTable(notes, table)) continue;
    notes.push(customTableToNote(table));
    added++;
  }

  return added > 0 ? notes : null;
}
