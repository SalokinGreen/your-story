/**
 * Tolerant reader for a half-written extraction response.
 *
 * The summarize model answers with one big JSON object per round (see
 * ocrSummarizeCall.ts). While that object is still streaming in it is, by
 * definition, invalid JSON - but everything the model has already finished
 * writing is sitting right there in the buffer. This pulls those finished
 * entries out, plus the one currently being written, so the importer can
 * show notes appearing live instead of a spinner.
 *
 * Nothing here feeds the actual import: the authoritative result is still
 * whatever the server returns when the call completes. This is a preview,
 * so it errs towards showing something rather than being exact.
 */

import { CustomTableEntry } from "./structs";
import { renderTableEntries } from "./tableNotes";

export interface PartialNote {
  title: string;
  content: string;
  type?: string;
  folder?: string;
  tags?: string[];
  aliases?: string[];
  keys?: string[];
  relatedCharacters?: string[];
  relatedLocations?: string[];
  secrtet?: boolean;
  /** True while the model is still writing this entry. */
  streaming?: boolean;
}

export interface PartialExtraction {
  summary: string;
  lore: PartialNote[];
  mechanicNotes: PartialNote[];
  /** Random tables - notes like any other (see tableNotes.ts). */
  tableNotes: PartialNote[];
}

export function emptyPartialExtraction(): PartialExtraction {
  return { summary: "", lore: [], mechanicNotes: [], tableNotes: [] };
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Parse whatever the model has streamed so far. Entries the model finished
 * come back as-is; the one it is midway through comes back with
 * `streaming: true` and whatever text it has written by now.
 */
export function parsePartialExtraction(buffer: string): PartialExtraction {
  const result = emptyPartialExtraction();
  if (!buffer) return result;

  const roots = findRootValues(buffer);
  const valueFor = (key: string) => roots.find((r) => r.key === key);

  const summary = valueFor("summary");
  if (summary && buffer[summary.start] === '"') {
    result.summary = readStringValue(buffer, summary.start);
  }

  // The preview has to agree with what the import will commit, so entries
  // are sorted the same way `processParserResult` sorts them: a table goes
  // under Tables whichever list it arrived in and whichever shape it was
  // written in, and the rest stay where they were put.
  type NoteList = "lore" | "mechanicNotes" | "tableNotes";
  const push = (key: NoteList, obj: JSONObject, streaming: boolean) => {
    const list = key === "tableNotes" || obj.type === "table" ? "tableNotes" : key;
    result[list].push(
      list === "tableNotes" ? toTableNote(obj, streaming) : toNote(obj, streaming),
    );
  };

  for (const key of ["lore", "mechanicNotes", "tableNotes", "customTables"] as const) {
    const root = valueFor(key);
    if (!root || buffer[root.start] !== "[") continue;
    // A model answering with the structured table shape the extractor used
    // to ask for is previewed as the note it will be imported as.
    const target = key === "customTables" ? "tableNotes" : key;
    const { complete, partial } = splitArrayElements(buffer, root.start);
    for (const src of complete) {
      const obj = parseObject(src);
      if (obj) push(target, obj, false);
    }
    if (partial) {
      const obj = parsePartialObject(partial);
      if (obj) push(target, obj, true);
    }
  }

  return result;
}

/**
 * Fold one extraction into another, the way the server folds continuation
 * rounds together: entries are keyed by title, and a longer version of an
 * entry replaces a shorter one (that's a note that got cut off mid-sentence
 * and was re-sent in full).
 */
export function mergePartialExtraction(
  base: PartialExtraction,
  next: PartialExtraction,
): PartialExtraction {
  return {
    summary: base.summary || next.summary,
    lore: mergeNotes(base.lore, next.lore),
    mechanicNotes: mergeNotes(base.mechanicNotes, next.mechanicNotes),
    tableNotes: mergeNotes(base.tableNotes, next.tableNotes),
  };
}

/** Total entries across all three note lists. */
export function countPartialExtraction(extraction: PartialExtraction): number {
  return (
    extraction.lore.length +
    extraction.mechanicNotes.length +
    extraction.tableNotes.length
  );
}

// ============================================================================
// Merging
// ============================================================================

function titleKey(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ");
}

function mergeNotes(base: PartialNote[], next: PartialNote[]): PartialNote[] {
  const out = [...base];
  const index = new Map<string, number>();
  out.forEach((note, i) => {
    const key = titleKey(note.title);
    if (key) index.set(key, i);
  });

  for (const note of next) {
    const key = titleKey(note.title);
    // An entry with no title yet is the one being written right now - there
    // is nothing to match it against, so it just goes on the end.
    if (!key) {
      out.push(note);
      continue;
    }
    const existing = index.get(key);
    if (existing === undefined) {
      index.set(key, out.length);
      out.push(note);
    } else if (note.content.length >= out[existing].content.length) {
      out[existing] = note;
    }
  }
  return out;
}

// ============================================================================
// Shape conversion
// ============================================================================

type JSONObject = Record<string, unknown>;

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items = value.filter((v): v is string => typeof v === "string");
  return items.length > 0 ? items : undefined;
}

function toNote(obj: JSONObject, streaming: boolean): PartialNote {
  const note: PartialNote = {
    title: asString(obj.title),
    content: asString(obj.content),
    type: typeof obj.type === "string" ? obj.type : undefined,
    folder: asString(obj.folder) || undefined,
    tags: asStringArray(obj.tags),
    aliases: asStringArray(obj.aliases),
    keys: asStringArray(obj.keys),
    relatedCharacters: asStringArray(obj.relatedCharacters),
    relatedLocations: asStringArray(obj.relatedLocations),
    secrtet: obj.secrtet === true || obj.secret === true,
  };
  if (streaming) note.streaming = true;
  return note;
}

/**
 * A table, whichever way the model wrote it: as the prose note that was
 * asked for, or as a title plus a list of rows (the shape the extractor used
 * to want, which models still reach for). Rows are rendered into the same
 * listing the committed import produces, so the preview shows what will
 * actually be saved rather than nothing at all.
 */
function toTableNote(obj: JSONObject, streaming: boolean): PartialNote {
  const note = toNote(obj, streaming);
  note.type = "table";
  note.title = note.title || asString(obj.name);

  if (!note.content.trim()) {
    const rawEntries = obj.entries ?? obj.rows ?? obj.results;
    const entries: CustomTableEntry[] = [];
    for (const raw of Array.isArray(rawEntries) ? rawEntries : []) {
      const entry = (raw && typeof raw === "object" ? raw : {}) as JSONObject;
      const text =
        typeof raw === "string" ? raw : asString(entry.text) || asString(entry.result);
      if (!text) continue;
      const weight = Number(entry.weight);
      entries.push({ text, weight: Number.isFinite(weight) && weight > 0 ? weight : 1 });
    }

    const description = asString(obj.description).trim();
    const listing = renderTableEntries(entries);
    note.content = [description, listing].filter(Boolean).join("\n\n");
  }

  return note;
}

// ============================================================================
// Scanning
// ============================================================================

/**
 * Walk a JSON string literal starting at `start` (which must be its opening
 * quote), respecting backslash escapes. `terminated` is false when the
 * buffer ran out before the closing quote - i.e. the model is still typing.
 */
function readStringAt(
  src: string,
  start: number,
): { end: number; terminated: boolean } {
  let i = start + 1;
  while (i < src.length) {
    const ch = src[i];
    if (ch === "\\") {
      i += 2;
      continue;
    }
    if (ch === '"') return { end: i + 1, terminated: true };
    i++;
  }
  return { end: src.length, terminated: false };
}

/** Decode a (possibly unterminated) JSON string literal to its text. */
function readStringValue(src: string, start: number): string {
  const { end, terminated } = readStringAt(src, start);
  const literal = terminated ? src.slice(start, end) : `${src.slice(start, end)}"`;
  try {
    const parsed = JSON.parse(literal);
    return typeof parsed === "string" ? parsed : "";
  } catch {
    // A trailing lone backslash (an escape the model hasn't finished) is the
    // one case JSON.parse rejects here - drop it and retry.
    try {
      const parsed = JSON.parse(`${literal.slice(0, -2)}"`);
      return typeof parsed === "string" ? parsed : "";
    } catch {
      return "";
    }
  }
}

interface RootValue {
  key: string;
  /** Index of the first non-space character of this key's value. */
  start: number;
}

/**
 * Find where each top-level key's value begins. Done with a proper scan
 * rather than a regex so a `"lore": [` that happens to appear *inside* one
 * of the notes' prose can't be mistaken for the real array.
 */
function findRootValues(src: string): RootValue[] {
  const out: RootValue[] = [];
  const rootStart = src.indexOf("{");
  if (rootStart === -1) return out;

  let i = rootStart + 1;
  let depth = 1;
  let pendingKey: string | null = null;

  while (i < src.length) {
    const ch = src[i];

    if (ch === '"') {
      const { end, terminated } = readStringAt(src, i);
      // At the root, the first string after a comma is a key; anything else
      // (including a string *value*) is skipped over.
      if (depth === 1 && pendingKey === null && terminated) {
        pendingKey = readStringValue(src, i);
      }
      i = end;
      continue;
    }

    if (ch === "{" || ch === "[") {
      depth++;
      i++;
      continue;
    }

    if (ch === "}" || ch === "]") {
      depth--;
      i++;
      if (depth <= 1) pendingKey = null;
      continue;
    }

    if (depth === 1 && ch === ",") {
      pendingKey = null;
      i++;
      continue;
    }

    if (depth === 1 && ch === ":" && pendingKey !== null) {
      let j = i + 1;
      while (j < src.length && /\s/.test(src[j])) j++;
      if (!out.some((v) => v.key === pendingKey)) {
        out.push({ key: pendingKey, start: j });
      }
      i = j;
      continue;
    }

    i++;
  }

  return out;
}

/**
 * Split the array starting at `bracketIdx` into its object elements: the
 * ones that are structurally finished, plus the trailing one that isn't.
 */
function splitArrayElements(
  src: string,
  bracketIdx: number,
): { complete: string[]; partial: string | null } {
  const complete: string[] = [];
  if (src[bracketIdx] !== "[") return { complete, partial: null };

  let i = bracketIdx + 1;
  let depth = 0;
  let elementStart = -1;

  while (i < src.length) {
    const ch = src[i];

    if (ch === '"') {
      i = readStringAt(src, i).end;
      continue;
    }

    if (ch === "{" || ch === "[") {
      if (depth === 0) elementStart = i;
      depth++;
      i++;
      continue;
    }

    if (ch === "}" || ch === "]") {
      if (depth === 0) return { complete, partial: null }; // array closed
      depth--;
      i++;
      if (depth === 0 && elementStart >= 0) {
        complete.push(src.slice(elementStart, i));
        elementStart = -1;
      }
      continue;
    }

    i++;
  }

  return {
    complete,
    partial: depth > 0 && elementStart >= 0 ? src.slice(elementStart) : null,
  };
}

function parseObject(src: string): JSONObject | null {
  try {
    const parsed = JSON.parse(src);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as JSONObject)
      : null;
  } catch {
    // A "complete" element can still be malformed (a raw newline inside a
    // string, say) - give it the same treatment as a partial one.
    return parsePartialObject(src);
  }
}

/** Structural state of a fragment: what's still open at the end of it. */
function scanState(src: string): { stack: string[]; stringOpen: boolean } {
  const stack: string[] = [];
  let i = 0;

  while (i < src.length) {
    const ch = src[i];
    if (ch === '"') {
      const { end, terminated } = readStringAt(src, i);
      if (!terminated) return { stack, stringOpen: true };
      i = end;
      continue;
    }
    if (ch === "{") stack.push("}");
    else if (ch === "[") stack.push("]");
    else if (ch === "}" || ch === "]") stack.pop();
    i++;
  }

  return { stack, stringOpen: false };
}

/** Close whatever the fragment left open, then try to parse it. */
function tryClose(src: string): JSONObject | null {
  const { stack, stringOpen } = scanState(src);
  let candidate = src;
  if (stringOpen) candidate += '"';
  candidate += stack.slice().reverse().join("");
  try {
    const parsed = JSON.parse(candidate);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as JSONObject)
      : null;
  } catch {
    return null;
  }
}

/** Cut a fragment back to just before its last (non-string) comma. */
function cutAtLastComma(src: string): string | null {
  let i = 0;
  let lastComma = -1;
  while (i < src.length) {
    const ch = src[i];
    if (ch === '"') {
      i = readStringAt(src, i).end;
      continue;
    }
    if (ch === ",") lastComma = i;
    i++;
  }
  return lastComma === -1 ? null : src.slice(0, lastComma);
}

/**
 * Parse an object the model is midway through writing.
 *
 * Escalating attempts: close what's open (covers a value cut off
 * mid-sentence, which is the common case and the one worth showing); give a
 * key that has no value yet an empty one, whether the key itself is
 * half-typed (`{"title":"Karth","conte`), just finished (`..."content"`) or
 * followed by a bare colon; and failing all that, drop the unfinished tail
 * pair by pair until what's left parses.
 *
 * The point is that the entry stays on screen for every prefix of the
 * stream - an entry that appeared and then vanished for a few frames while
 * the model typed a field name would read as a bug.
 */
function parsePartialObject(src: string): JSONObject | null {
  const direct = tryClose(src);
  if (direct) return direct;

  if (scanState(src).stringOpen) {
    const asKey = tryClose(`${src}":""`);
    if (asKey) return asKey;
  }

  // `{"title":"Karth","content"` / `{"title":"Karth","content":`
  const tail = src.replace(/\s+$/, "");
  const valueless = tryClose(`${tail.replace(/:$/, "")}:""`);
  if (valueless) return valueless;

  let trimmed: string | null = src;
  for (let attempt = 0; attempt < 3; attempt++) {
    trimmed = cutAtLastComma(trimmed);
    if (trimmed === null) break;
    const parsed = tryClose(trimmed);
    if (parsed) return parsed;
  }

  return null;
}
