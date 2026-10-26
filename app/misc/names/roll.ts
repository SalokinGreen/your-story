/**
 * Rolling names (randomness plan R2, design 3.2): from the story's name tables
 * or its system's declared ones, else from the built-in lists. Pure but for
 * the injected `rng`; the caller records what it offers on the ledger.
 */
import type { StoryData } from "../structs";
import { parseTableNote, rollTable, selectTable } from "../tableRoll";
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
function entryName(text: string): string {
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
export function rollNames(
  story: StoryData,
  kind: NameKind,
  count: number,
  options: RollNamesOptions = {},
): string[] {
  const rng = options.rng ?? Math.random;
  const style = options.style ?? story.nameStyle ?? DEFAULT_NAME_STYLE;
  const sources = options.style ? [] : nameSourcesFor(story, kind);
  const taken = new Set(
    [...recordNames(story), ...(story.nameLedger ?? [])].map((n) => n.trim().toLowerCase()),
  );
  const out: string[] = [];
  const take = (name: string | null): void => {
    if (!name) return;
    const key = name.toLowerCase();
    if (taken.has(key)) return;
    taken.add(key);
    out.push(name);
  };
  for (let attempts = 0; out.length < count && attempts < count * 25; attempts++) {
    take(sources.length > 0 ? rollFromSource(pick(sources, rng), rng) : rollFromLists(kind, style, rng));
  }
  // A small table can run dry: top up from the built-in lists.
  for (let attempts = 0; out.length < count && attempts < count * 50; attempts++) {
    take(rollFromLists(kind, style, rng));
  }
  return out;
}
