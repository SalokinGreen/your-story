/**
 * Rolling names (randomness plan R2, design 3.2): from the story's name tables
 * or its system's declared ones, else from the built-in lists. Pure but for
 * the injected `rng`; the caller records what it offers on the ledger.
 */
import type { StoryData } from "../structs";
import { parseTableNote, rollTable, selectTable } from "../tableRoll";
import { resolveSystem } from "../systems/resolve";
import { recordNames } from "./accept";
import {
  BUILTIN_NAME_LISTS,
  DEFAULT_NAME_STYLE,
  NAME_STYLES,
  type NameStyle,
} from "./builtinLists";
import { nameSourcesFor, type NameKind, type NameSource } from "./sources";

export interface RollNamesOptions {
  rng?: () => number;
  /** An explicit style asks for the built-in lists in that style. */
  style?: NameStyle;
}

export function isNameStyle(x: unknown): x is NameStyle {
  return typeof x === "string" && (NAME_STYLES as readonly string[]).includes(x);
}

function pick<T>(items: readonly T[], rng: () => number): T {
  return items[Math.min(items.length - 1, Math.floor(rng() * items.length))];
}

/** A table entry as a name: its text up to a dash or parenthesis. */
export function entryName(text: string): string {
  return text.split(/\s[—–-]\s|\s\(/)[0].replace(/[.,;:]+$/, "").trim();
}

function rollFromSource(source: NameSource, rng: () => number): string | null {
  const parsed = parseTableNote(source.note.content ?? "");
  if (!parsed.ok) return null;
  const parts: string[] = [];
  for (const path of source.compose) {
    const picked = selectTable(parsed.tables, path.join(" > "));
    if (!picked.ok) return null;
    const name = entryName(rollTable(picked.table, rng).entry.text);
    if (!name) return null;
    parts.push(name);
  }
  return parts.join(" ");
}

function rollFromLists(kind: NameKind, style: NameStyle, rng: () => number): string {
  const list = BUILTIN_NAME_LISTS[style];
  return kind === "place"
    ? pick(list.places, rng)
    : `${pick(list.given, rng)} ${pick(list.family, rng)}`;
}

/**
 * `count` names for a new person or place, none already in the record or on
 * the ledger, none twice. Declared or story tables first, the built-in lists
 * (the story's `nameStyle`, else fantasy) when there are none or they run dry.
 */
const PLACE_SUFFIXES = ["Cross", "Hollow", "Ford", "Reach", "Rest", "Bridge", "End", "Fell", "Marsh", "Gate", "Hill", "Wick"];

export function rollNames(
  story: StoryData,
  kind: NameKind,
  count: number,
  options: RollNamesOptions = {},
): string[] {
  const rng = options.rng ?? Math.random;
  const style =
    options.style ??
    story.nameStyle ??
    resolveSystem(story).system?.defaultNameStyle ??
    DEFAULT_NAME_STYLE;
  const sources = options.style ? [] : nameSourcesFor(story, kind);
  const record = new Set(recordNames(story).map((n) => n.trim().toLowerCase()));
  const ledger = new Set((story.nameLedger ?? []).map((n) => n.trim().toLowerCase()));
  const out: string[] = [];
  const chosen = new Set<string>();
  // Names the story already has are never offered; ledger names only when
  // nothing else is left (`allowLedger`); a name is never offered twice in a call.
  const take = (name: string | null, allowLedger: boolean): void => {
    if (!name) return;
    const key = name.toLowerCase();
    if (chosen.has(key) || record.has(key) || (!allowLedger && ledger.has(key))) return;
    chosen.add(key);
    out.push(name);
  };
  const fromSources = (): string | null =>
    sources.length > 0 ? rollFromSource(pick(sources, rng), rng) : rollFromLists(kind, style, rng);

  for (let i = 0; out.length < count && i < count * 25; i++) take(fromSources(), false);
  // A small table can run dry: top up from the built-in lists.
  for (let i = 0; out.length < count && i < count * 50; i++) take(rollFromLists(kind, style, rng), false);
  // Then let the ledger's names come back, then combine list words.
  for (let i = 0; out.length < count && i < count * 25; i++) take(fromSources(), true);
  const list = BUILTIN_NAME_LISTS[style];
  for (let i = 0; out.length < count && i < count * 50; i++) {
    take(
      kind === "place"
        ? `${pick(list.family, rng)} ${pick(PLACE_SUFFIXES, rng)}`
        : `${pick(list.given, rng)} ${pick(list.family, rng)}`,
      true,
    );
  }
  // Never an empty answer: number what is left.
  for (let n = 2; out.length < count; n++) {
    take(`${rollFromLists(kind, style, rng)} ${n}`, true);
  }
  return out;
}
