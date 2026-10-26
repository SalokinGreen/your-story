/**
 * Rolling a table note in one call (docs/randomness-design.md 3.3, plan R1).
 *
 * A table note (`type: "table"`) is prose, and the GM used to read it and roll
 * the die it names with `formula_roll`. This module reads the layouts the
 * shipped packs and the old-table migration (`tableNotes.ts`) actually use, so
 * `roll_table` can do it in one call. The contract is bounded on purpose;
 * anything else comes back `ok: false` and the GM falls back to read-and-roll.
 *
 * Understood:
 *  - `## Name (1dN)`, `## Name (2d6)`,
 *    `## Name (d66: roll ["1d6","1d6"], first die is the tens)` and
 *    `## Name (1d6, on the Kind's list)` headings, with `### Sub` headings
 *    nested under them (a path is written "A > B");
 *  - a `Roll 1dN:` lead-in, as `tableNotes.ts` writes for migrated tables;
 *  - entries `N. text`, `a-b. text` (hyphen or en dash) and `NN text` for d66,
 *    an entry running over several lines (no blank line between them).
 * Text that is not an entry is kept as `instructions` and left for the GM.
 *
 * Pure: no React, no storage. `rng` defaults to `Math.random`, the seam the
 * tests use.
 */

export type TableDie =
  | { kind: "nd"; count: number; sides: number } // 1d6, 1d20, 1d100, 2d6
  | { kind: "d66" }; // two d6, the first is the tens

export interface TableEntry {
  lo: number;
  hi: number;
  text: string;
}

export interface TableSpec {
  /** Headings from the top: ["Names"], or ["Feature", "Ghost"]; [] for a note with no heading. */
  path: string[];
  die: TableDie;
  entries: TableEntry[];
  /** Text inside the table that is not an entry: "roll again...", cross-references. */
  instructions?: string;
}

export type ParsedTableNote =
  | {
      ok: true;
      tables: TableSpec[];
      /** The note's own intro and its closing paragraph ("Use when ..."), outside any table. */
      noteInstructions?: string;
    }
  | { ok: false; reason: string };

export type SelectResult =
  | { ok: true; table: TableSpec }
  | { ok: false; candidates: string[] };

const MAX_DICE_FOR_TABLE = 4;

export function dieLabel(die: TableDie): string {
  return die.kind === "d66" ? "d66" : `${die.count === 1 ? "" : die.count}d${die.sides}`;
}

export function tablePathLabel(path: string[]): string {
  return path.join(" > ");
}

interface Section {
  level: number;
  name: string;
  /** Heading text in parentheses that names a die, if any. */
  dieText?: string;
  perKind: boolean;
  /** Words in the heading's parenthesis after the die, e.g. "roll twice and combine". */
  extra?: string;
  body: string[];
}

function parseDie(text: string): TableDie | null {
  const t = text.trim();
  if (/^d66\b/i.test(t)) return { kind: "d66" };
  const m = /^(\d*)d(\d+)\b/i.exec(t);
  if (!m) return null;
  const count = m[1] === "" ? 1 : Number(m[1]);
  const sides = Number(m[2]);
  if (!(count >= 1 && count <= MAX_DICE_FOR_TABLE) || !(sides >= 2 && sides <= 1000)) return null;
  return { kind: "nd", count, sides };
}

const HEADING = /^(#{1,3}) +(.+?)\s*$/;
const HEAD_DIE = /\s*\(((?:\d*d\d+|d66)[^()]*)\)\s*$/i;
const LEAD_IN = /^Roll\s+((?:\d*d\d+|d66))\s*:\s*$/i;
const RANGE_ENTRY = /^(\d+)(?:\s*[-–]\s*(\d+))?\.\s+(\S.*)$/;
const D66_ENTRY = /^([1-6])([1-6])\s+(\S.*)$/;

function splitSections(content: string): { preface: string[]; sections: Section[] } {
  const preface: string[] = [];
  const sections: Section[] = [];
  let current: Section | null = null;
  let inFence = false;
  for (const raw of content.replace(/\r\n/g, "\n").split("\n")) {
    const line = raw.replace(/\s+$/, "");
    if (/^```/.test(line)) inFence = !inFence;
    const h = inFence ? null : HEADING.exec(line);
    if (h && h[1].length >= 2) {
      const level = h[1].length;
      let name = h[2];
      let dieText: string | undefined;
      let perKind = false;
      let extra: string | undefined;
      const d = HEAD_DIE.exec(name);
      if (d) {
        dieText = d[1];
        perKind = /on the [\w' ]*list/i.test(d[1]);
        const rest = d[1]
          .replace(/^(?:\d*d\d+|d66)/i, "")
          .replace(/:?\s*roll \["1d6","1d6"\],?\s*first die is the tens/i, "")
          .replace(/,?\s*on the [\w' ]*list/i, "")
          .replace(/^[\s,:;]+|[\s,:;]+$/g, "");
        if (rest) extra = rest;
        name = name.slice(0, d.index).trim();
      }
      current = { level, name, dieText, perKind, extra, body: [] };
      sections.push(current);
    } else if (h && h[1].length === 1) {
      // A "# Title" line is the note's own heading, not a table.
      if (!current) preface.push(`# ${h[2]}`);
      else current.body.push(line);
    } else if (current) {
      current.body.push(line);
    } else {
      preface.push(line);
    }
  }
  return { preface, sections };
}

interface BodyParse {
  die?: TableDie; // from a Roll 1dN: lead-in
  entries: Array<{ lo: number; hi: number; text: string; d66: boolean }>;
  /** Paragraphs that are not entries, in order; `trailing` are those after the last entry. */
  lead: string[];
  trailing: string[];
  middleProse: string[];
}

function parseBody(body: string[]): BodyParse {
  const out: BodyParse = { entries: [], lead: [], trailing: [], middleProse: [] };
  let open = false; // the previous non-blank line was an entry (or its continuation)
  const proseLines: Array<{ text: string; afterEntries: boolean }> = [];
  for (const line of body) {
    if (line.trim() === "") {
      open = false;
      continue;
    }
    const lead = LEAD_IN.exec(line.trim());
    if (lead && out.entries.length === 0) {
      const die = parseDie(lead[1]);
      if (die) out.die = die;
      continue;
    }
    const r = RANGE_ENTRY.exec(line);
    if (r) {
      const lo = Number(r[1]);
      const hi = r[2] === undefined ? lo : Number(r[2]);
      out.entries.push({ lo, hi, text: r[3].trim(), d66: false });
      open = true;
      continue;
    }
    const d = D66_ENTRY.exec(line);
    if (d) {
      const key = Number(d[1]) * 10 + Number(d[2]);
      out.entries.push({ lo: key, hi: key, text: d[3].trim(), d66: true });
      open = true;
      continue;
    }
    if (open && out.entries.length > 0) {
      // A continuation line of the entry above.
      const last = out.entries[out.entries.length - 1];
      last.text = `${last.text} ${line.trim()}`;
      continue;
    }
    proseLines.push({ text: line.trim(), afterEntries: out.entries.length > 0 });
  }
  out.lead = proseLines.filter((p) => !p.afterEntries).map((p) => p.text);
  out.trailing = proseLines.filter((p) => p.afterEntries).map((p) => p.text);
  return out;
}

function checkEntries(
  die: TableDie,
  entries: Array<{ lo: number; hi: number; text: string; d66: boolean }>,
): string | null {
  if (entries.length === 0) return "it lists no entries";
  if (die.kind === "d66") {
    if (entries.some((e) => !e.d66)) return "a d66 table must list its entries as 11 ... 66";
    const keys = new Set(entries.map((e) => e.lo));
    if (entries.length !== 36 || keys.size !== 36) return "a d66 table must list all 36 entries, 11 to 66";
    return null;
  }
  if (entries.some((e) => e.d66)) return "its entries are not numbered as the die needs";
  const min = die.count;
  const max = die.count * die.sides;
  let next = min;
  for (const e of entries) {
    if (e.hi < e.lo) return `entry ${e.lo}-${e.hi} runs backwards`;
    if (e.lo !== next) return `expected an entry starting at ${next}, found ${e.lo}`;
    next = e.hi + 1;
  }
  if (next - 1 !== max) return `entries run ${min} to ${next - 1}, but the die gives ${min} to ${max}`;
  return null;
}

export function parseTableNote(content: string): ParsedTableNote {
  if (typeof content !== "string" || !content.trim()) return { ok: false, reason: "the note is empty" };
  const { preface, sections } = splitSections(content);
  const noteBits: string[] = [];
  const intro = preface
    .filter((l) => l.trim() && !/^# /.test(l))
    .join(" ")
    .trim();
  if (intro) noteBits.push(intro);

  const tables: TableSpec[] = [];

  if (sections.length === 0) {
    // A lead-in table with no heading, as tableNotes.ts writes.
    const parsed = parseBody(preface);
    if (!parsed.die) return { ok: false, reason: 'it names no die (no heading like "## Name (1d20)" and no "Roll 1dN:" line)' };
    const err = checkEntries(parsed.die, parsed.entries);
    if (err) return { ok: false, reason: err };
    const instructions = parsed.lead.join(" ").trim();
    const trailing = parsed.trailing.join(" ").trim();
    return {
      ok: true,
      tables: [
        {
          path: [],
          die: parsed.die,
          entries: parsed.entries.map(({ lo, hi, text }) => ({ lo, hi, text })),
          ...(instructions ? { instructions } : {}),
        },
      ],
      ...(trailing ? { noteInstructions: trailing } : {}),
    };
  }

  // Headed sections. A section with neither a die nor entries is prose (or a
  // parent of nested tables); a section with entries and no die is unreadable.
  const stack: Section[] = [];
  const parents = new Map<Section, Section | undefined>();
  for (const s of sections) {
    while (stack.length && stack[stack.length - 1].level >= s.level) stack.pop();
    parents.set(s, stack[stack.length - 1]);
    stack.push(s);
  }
  const pathOf = (s: Section): string[] => {
    const path: string[] = [];
    for (let cur: Section | undefined = s; cur; cur = parents.get(cur)) path.unshift(cur.name);
    return path;
  };
  const dieOf = (s: Section, parsed: BodyParse): TableDie | null => {
    if (s.dieText) return parseDie(s.dieText);
    if (parsed.die) return parsed.die;
    const parent = parents.get(s);
    if (parent?.perKind && parent.dieText) return parseDie(parent.dieText);
    return null;
  };

  const lastIndex = sections.length - 1;
  for (let i = 0; i < sections.length; i++) {
    const s = sections[i];
    const parsed = parseBody(s.body);
    const tail = parsed.trailing.join(" ").trim();
    if (parsed.entries.length === 0) {
      // Prose or a parent. A perKind parent's lead is the children's instructions.
      if (s.dieText && !s.perKind) {
        return { ok: false, reason: `"${s.name}" names a die but lists no entries` };
      }
      continue;
    }
    const die = dieOf(s, parsed);
    if (!die) {
      return { ok: false, reason: `"${tablePathLabel(pathOf(s))}" lists entries but names no die I can read` };
    }
    if (s.perKind) return { ok: false, reason: `"${s.name}" is a per-Kind list with entries of its own` };
    const err = checkEntries(die, parsed.entries);
    if (err) return { ok: false, reason: `"${tablePathLabel(pathOf(s))}": ${err}` };

    const parent = parents.get(s);
    const inherited: string[] = [];
    if (parent?.perKind) {
      const pp = parseBody(parent.body);
      if (parent.extra) inherited.push(parent.extra);
      inherited.push(...pp.lead);
    }
    const lastOfNote = i === lastIndex || sections.slice(i + 1).every((x) => parseBody(x.body).entries.length === 0 && !x.dieText);
    const ownInstructions = [
      ...(s.extra ? [s.extra] : []),
      ...inherited,
      ...parsed.lead,
      ...(lastOfNote ? [] : parsed.trailing),
    ]
      .join(" ")
      .trim();
    if (lastOfNote && tail) noteBits.push(tail);
    tables.push({
      path: pathOf(s),
      die,
      entries: parsed.entries.map(({ lo, hi, text }) => ({ lo, hi, text })),
      ...(ownInstructions ? { instructions: ownInstructions } : {}),
    });
  }

  if (tables.length === 0) return { ok: false, reason: "it holds no table I can read (no heading names a die)" };
  const noteInstructions = noteBits.join(" ").trim();
  return { ok: true, tables, ...(noteInstructions ? { noteInstructions } : {}) };
}

function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/[_\s]+/g, " ")
    .replace(/\s*[>/]\s*/g, " > ")
    .trim();
}

/**
 * Picks one table. With no `path` a single-table note is returned; several
 * tables without a path, or a path that matches none or several, return the
 * candidates (their path labels) so the caller can list them.
 */
export function selectTable(tables: TableSpec[], path?: string): SelectResult {
  const all = tables.map((t) => tablePathLabel(t.path) || "(the whole note)");
  const wanted = path ? norm(path) : "";
  if (!wanted) {
    if (tables.length === 1) return { ok: true, table: tables[0] };
    return { ok: false, candidates: all };
  }
  const labels = tables.map((t) => norm(tablePathLabel(t.path)));
  const exact = tables.filter((_, i) => labels[i] === wanted);
  if (exact.length === 1) return { ok: true, table: exact[0] };
  // A trailing part of the path ("Ghost" for "Feature > Ghost"), a leading
  // part ("Feature"), or a word inside it.
  const partial = tables.filter((t, i) => {
    const label = labels[i];
    if (label.endsWith(` > ${wanted}`) || label.startsWith(`${wanted} > `)) return true;
    return t.path.some((p) => norm(p) === wanted);
  });
  if (partial.length === 1) return { ok: true, table: partial[0] };
  if (partial.length > 1) return { ok: false, candidates: partial.map((t) => tablePathLabel(t.path)) };
  const loose = tables.filter((_, i) => labels[i].includes(wanted));
  if (loose.length === 1) return { ok: true, table: loose[0] };
  if (loose.length > 1) return { ok: false, candidates: loose.map((t) => tablePathLabel(t.path)) };
  return { ok: false, candidates: all };
}

/** Rolls the table's dice and returns the entry the total lands on. */
export function rollTable(
  table: TableSpec,
  rng: () => number = Math.random,
): { roll: number; dice: number[]; entry: TableEntry } {
  const throwDie = (sides: number): number => Math.min(sides, Math.floor(rng() * sides) + 1);
  let dice: number[];
  let roll: number;
  if (table.die.kind === "d66") {
    dice = [throwDie(6), throwDie(6)];
    roll = dice[0] * 10 + dice[1];
  } else {
    const { count, sides } = table.die;
    dice = Array.from({ length: count }, () => throwDie(sides));
    roll = dice.reduce((a, b) => a + b, 0);
  }
  const entry = table.entries.find((e) => roll >= e.lo && roll <= e.hi);
  if (!entry) throw new Error(`roll ${roll} lands on no entry of ${tablePathLabel(table.path)}`);
  return { roll, dice, entry };
}

/**
 * "Names d100, Looks d66": a table note's sub-tables and dice on one line. A
 * heading with several tables under it (the per-Kind lists) counts once.
 */
export function summarizeTables(tables: TableSpec[]): string {
  const groups = new Map<string, TableSpec[]>();
  for (const t of tables) {
    const key = t.path[0] ?? "";
    groups.set(key, [...(groups.get(key) ?? []), t]);
  }
  return [...groups.values()]
    .map((g) => {
      const first = g[0];
      if (g.length > 1 && first.path.length > 1) return `${first.path[0]} ${dieLabel(first.die)} by ${g.length} sub-headings`;
      const name = first.path.length ? first.path[first.path.length - 1] : "";
      return `${name ? `${name} ` : ""}${dieLabel(first.die)}`;
    })
    .join(", ");
}
