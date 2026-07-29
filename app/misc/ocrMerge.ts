/**
 * Post-import merge pass for OCR-extracted content.
 *
 * Large PDFs are OCR'd and summarized in independent chunks (see
 * PDFImporter.tsx), each with no visibility into any other chunk. A topic
 * spanning a chunk boundary (an NPC, location, or rule split across pages)
 * routinely comes back as two fragmented or duplicate-titled entries once
 * every chunk's results are concatenated. This module merges those back
 * together in two passes:
 *
 * 1. `mergeDeterministic` - pure string-similarity grouping (title/alias
 *    overlap), no AI involved. Catches same-or-near-identical titles.
 * 2. The AI pass (see ocrMergeCall.ts) - catches same-subject entries under
 *    different names (e.g. a nickname vs a formal name) that string
 *    similarity can't. `applyMergeGroups` in this file applies its output
 *    using the same merge logic as pass 1.
 */

import { StoryLore } from "./structs";
import { calculateSimilarity } from "./fuzzyMatch";
import { ocrFetch } from "./ocrFetch";
import { AIProvider } from "./ocrSummarizeCall";
import { MergeCandidateEntry, MergeGroup } from "./ocrMergeCall";

// Stricter than fuzzyMatch's usual 0.6 default: this runs unsupervised, with
// no user confirming the match before entries get combined.
export const DETERMINISTIC_MATCH_THRESHOLD = 0.7;

const MERGE_SEPARATOR = "\n\n---\n\n";

function normalizeKey(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ");
}

function uniqueStrings(...arrays: (string[] | undefined)[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const arr of arrays) {
    for (const raw of arr || []) {
      const trimmed = raw.trim();
      if (!trimmed) continue;
      const key = trimmed.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        result.push(trimmed);
      }
    }
  }
  return result;
}

/**
 * Groups items whose name candidates (e.g. title + aliases) are similar
 * enough to be considered the same entry, via union-find over pairwise
 * similarity. Unlike `findBestMatch`, which returns a single best match,
 * this finds every item that belongs in the same group, so 3+ fragments of
 * the same entry (e.g. from 3 different chunks) all end up together.
 */
function groupBySimilarity<T>(
  items: T[],
  getNames: (item: T) => string[],
  threshold: number,
): T[][] {
  const n = items.length;
  const parent = Array.from({ length: n }, (_, i) => i);
  function find(x: number): number {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  }
  function union(a: number, b: number) {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  }

  const namesList = items.map((item) =>
    getNames(item).filter((name) => name && name.trim()),
  );
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      let matched = false;
      for (const a of namesList[i]) {
        for (const b of namesList[j]) {
          if (calculateSimilarity(a, b) >= threshold) {
            matched = true;
            break;
          }
        }
        if (matched) break;
      }
      if (matched) union(i, j);
    }
  }

  const groups = new Map<number, T[]>();
  for (let i = 0; i < n; i++) {
    const root = find(i);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root)!.push(items[i]);
  }
  return Array.from(groups.values());
}

/**
 * Merge a group of 2+ StoryLore entries (title/mechanic notes) into one.
 * Content is concatenated (same convention as the `merge_lore` tool in
 * toolExecutor.ts); unlike that tool, aliases/tags/keys/related-entity
 * fields are unioned rather than dropped, since there's no user present to
 * re-add them afterward. Exported so the AI merge pass (ocrMergeCall.ts)
 * can apply its own groups with identical logic.
 */
export function mergeLoreEntries(
  group: StoryLore[],
  targetTitle?: string,
): StoryLore {
  if (group.length === 1) return group[0];
  const first = group[0];
  return {
    ...first,
    title: targetTitle?.trim() || first.title,
    content: group
      .map((entry) => `## ${entry.title}\n\n${entry.content}`)
      .join(MERGE_SEPARATOR),
    aliases: uniqueStrings(...group.map((entry) => entry.aliases)),
    tags: uniqueStrings(...group.map((entry) => entry.tags)),
    keys: uniqueStrings(...group.map((entry) => entry.keys)),
    relatedCharacters: uniqueStrings(
      ...group.map((entry) => entry.relatedCharacters),
    ),
    relatedLocations: uniqueStrings(
      ...group.map((entry) => entry.relatedLocations),
    ),
    folder: group.find((entry) => entry.folder)?.folder ?? first.folder,
    type: group.find((entry) => entry.type)?.type ?? first.type,
    secrtet: group.some((entry) => entry.secrtet),
    on: true,
  };
}

/**
 * Table notes are grouped on an exact (normalized) title match rather than
 * the fuzzy similarity used for lore, because near-identical table names are
 * routinely *different* tables - "Wilderness Encounters (Forest)" and
 * "Wilderness Encounters (Swamp)" are two rolls, and combining them would
 * quietly produce a table nobody wrote.
 */
function groupTableNotesByTitle(tableNotes: StoryLore[]): StoryLore[][] {
  const map = new Map<string, StoryLore[]>();
  for (const note of tableNotes) {
    const key = normalizeKey(note.title);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(note);
  }
  return Array.from(map.values());
}

export interface MergeResult {
  lore: StoryLore[];
  mechanicNotes: StoryLore[];
  tableNotes: StoryLore[];
  /** Number of entries collapsed into another (0 if nothing was merged). */
  mergedCount: number;
}

const loreNames = (entry: StoryLore) => [entry.title, ...(entry.aliases || [])];

/**
 * Pure, synchronous, no network - the deterministic merge pass. Always safe
 * to run; a passthrough (no groups found) leaves every entry unchanged.
 */
export function mergeDeterministic(
  lore: StoryLore[],
  mechanicNotes: StoryLore[],
  tableNotes: StoryLore[],
): MergeResult {
  let mergedCount = 0;

  const loreGroups = groupBySimilarity(
    lore,
    loreNames,
    DETERMINISTIC_MATCH_THRESHOLD,
  );
  const mechanicGroups = groupBySimilarity(
    mechanicNotes,
    loreNames,
    DETERMINISTIC_MATCH_THRESHOLD,
  );
  const tableGroups = groupTableNotesByTitle(tableNotes);

  const mergedLore = loreGroups.map((group) => {
    mergedCount += group.length - 1;
    return mergeLoreEntries(group);
  });
  const mergedMechanics = mechanicGroups.map((group) => {
    mergedCount += group.length - 1;
    return mergeLoreEntries(group);
  });
  const mergedTables = tableGroups.map((group) => {
    mergedCount += group.length - 1;
    // `mergeLoreEntries` switches the merged entry on, which is right for a
    // lore entry and wrong for a table: a table is reference material the GM
    // pulls in by keyword, and two halves of one arriving from different
    // chunks isn't a reason to start carrying it in every prompt.
    return { ...mergeLoreEntries(group), on: group[0].on ?? false };
  });

  return {
    lore: mergedLore,
    mechanicNotes: mergedMechanics,
    tableNotes: mergedTables,
    mergedCount,
  };
}

function toCandidate(
  index: number,
  kind: "lore" | "mechanic",
  entry: StoryLore,
): MergeCandidateEntry {
  return {
    index,
    kind,
    title: entry.title,
    folder: entry.folder,
    tags: entry.tags,
    aliases: entry.aliases,
    contentPreview: entry.content.slice(0, 200),
  };
}

/**
 * Applies AI-suggested merge groups (global indices spanning lore then
 * mechanicNotes, see `toCandidate`) using the same merge logic as the
 * deterministic pass. A group is only merged within a single kind - if the
 * model groups a lore entry with a mechanic note (it shouldn't, given the
 * prompt separates them, but isn't guaranteed), each kind's subset is merged
 * on its own and a subset of fewer than 2 is left untouched.
 */
function applyMergeGroups(
  lore: StoryLore[],
  mechanicNotes: StoryLore[],
  groups: MergeGroup[],
): { lore: StoryLore[]; mechanicNotes: StoryLore[]; mergedCount: number } {
  const loreCount = lore.length;
  const resolve = (i: number) =>
    i < loreCount
      ? { kind: "lore" as const, localIndex: i }
      : { kind: "mechanic" as const, localIndex: i - loreCount };

  const removeLoreIndices = new Set<number>();
  const removeMechanicIndices = new Set<number>();
  const newLoreEntries: StoryLore[] = [];
  const newMechanicEntries: StoryLore[] = [];
  let mergedCount = 0;

  for (const group of groups) {
    const resolved = group.indices.map(resolve);
    const loreIdx = resolved
      .filter((r) => r.kind === "lore")
      .map((r) => r.localIndex);
    const mechanicIdx = resolved
      .filter((r) => r.kind === "mechanic")
      .map((r) => r.localIndex);

    if (loreIdx.length >= 2) {
      const entries = loreIdx.map((i) => lore[i]);
      newLoreEntries.push(mergeLoreEntries(entries, group.targetTitle));
      loreIdx.forEach((i) => removeLoreIndices.add(i));
      mergedCount += entries.length - 1;
    }
    if (mechanicIdx.length >= 2) {
      const entries = mechanicIdx.map((i) => mechanicNotes[i]);
      newMechanicEntries.push(mergeLoreEntries(entries, group.targetTitle));
      mechanicIdx.forEach((i) => removeMechanicIndices.add(i));
      mergedCount += entries.length - 1;
    }
  }

  return {
    lore: [
      ...lore.filter((_, i) => !removeLoreIndices.has(i)),
      ...newLoreEntries,
    ],
    mechanicNotes: [
      ...mechanicNotes.filter((_, i) => !removeMechanicIndices.has(i)),
      ...newMechanicEntries,
    ],
    mergedCount,
  };
}

export interface MergeExtractedContentOptions {
  model: string;
  provider: AIProvider;
  keys: {
    openRouterKey?: string;
    deepseekKey?: string;
    mistralKey?: string;
    googleKey?: string;
    deepinfraKey?: string;
  };
}

/**
 * Full merge pipeline: the deterministic pass always runs; the AI pass runs
 * on top of it when there's more than one entry to compare, and is entirely
 * non-fatal - any network error, non-OK response, or unexpected response
 * shape just falls back to the deterministic pass's result. An OCR import
 * must never fail because this optional cleanup step failed.
 */
export async function mergeExtractedContent(
  lore: StoryLore[],
  mechanicNotes: StoryLore[],
  tableNotes: StoryLore[],
  options: MergeExtractedContentOptions,
): Promise<MergeResult> {
  const step1 = mergeDeterministic(lore, mechanicNotes, tableNotes);

  if (step1.lore.length + step1.mechanicNotes.length < 2) {
    return step1;
  }

  try {
    const candidates: MergeCandidateEntry[] = [
      ...step1.lore.map((entry, i) => toCandidate(i, "lore", entry)),
      ...step1.mechanicNotes.map((entry, i) =>
        toCandidate(step1.lore.length + i, "mechanic", entry),
      ),
    ];

    const response = await ocrFetch("/api/ocr/merge", {
      entries: candidates,
      model: options.model,
      provider: options.provider,
      openRouterKey: options.keys.openRouterKey,
      deepseekKey: options.keys.deepseekKey,
      mistralKey: options.keys.mistralKey,
      googleKey: options.keys.googleKey,
      deepinfraKey: options.keys.deepinfraKey,
    });

    if (!response.ok) return step1;

    const result = await response.json();
    if (
      !result?.success ||
      !Array.isArray(result.groups) ||
      result.groups.length === 0
    ) {
      return step1;
    }

    const applied = applyMergeGroups(
      step1.lore,
      step1.mechanicNotes,
      result.groups,
    );

    return {
      lore: applied.lore,
      mechanicNotes: applied.mechanicNotes,
      tableNotes: step1.tableNotes,
      mergedCount: step1.mergedCount + applied.mergedCount,
    };
  } catch {
    return step1;
  }
}
