/**
 * Manual, user-triggered story compaction - distinct from compaction.ts's
 * automatic per-turn rolling summary (which only manages the AI's context
 * window and never shrinks anything on disk). This module is for a player
 * who wants their saved story itself to get lighter, invoked from the Story
 * Editor's "Compact Story" action rather than run every turn.
 *
 * Three independent levers, from safest to most destructive:
 *  1. pruneScenePartMetadata - strips internal-only fields (raw model
 *     output, tool-call/reasoning traces) from old parts. The visible
 *     narrative text a player scrolls through is never touched.
 *  2. archiveResolvedProgress - folds resolved threads/fulfilled goals into
 *     scene.summary as a one-line record, then removes them from the active
 *     lists. Nothing is silently lost, just decluttered.
 *  3. summarizeOldNarrative - opt-in only: replaces old scene.parts with a
 *     rolled-up scene.summary, actually shrinking the parts array. This is
 *     the one that can't be undone (old prose is gone, only its summary
 *     remains), so callers must ask for it explicitly.
 *
 * buildCondensedStorySeed is the other half - "spin off a new story" -
 * which never touches the original story at all.
 */

import { StoryData, ScenePart, MemoryEntry } from "./structs";
import {
  CompactionApiOptions,
  planManualCompaction,
  runCompactionPlan,
} from "./compaction";

// How many of the most recent parts stay fully live (both metadata-intact
// and, if narrative summarization is requested, un-summarized) by default.
// Generous enough that "what just happened" and any in-flight thread stay
// completely untouched.
export const DEFAULT_KEEP_RECENT_PARTS = 20;

// Internal-only fields on ScenePart that exist purely to build AI context /
// power the per-message "GM thinking" debug panel (see story.tsx) for
// *recent* turns. None of them affect what's rendered as the story's visible
// text, choices, or state changes, so they're safe to drop once a turn has
// aged well past the live tail.
const PRUNABLE_PART_FIELDS: (keyof ScenePart)[] = [
  "reasoning",
  "reasoning_details",
  "toolCalls",
  "toolResponses",
  "gmToolCalls",
  "gmConversation",
  "gmStoryContext",
  "gmThinking",
  "raw",
  "commands",
];

export function estimateStoryDataSize(storyData: StoryData): number {
  return JSON.stringify(storyData).length;
}

export interface PruneMetadataResult {
  partsPruned: number;
}

/**
 * Strip heavy internal-only fields from parts older than `keepRecentParts`.
 * Mutates storyData in place. Idempotent - already-pruned parts have
 * nothing left to remove and are skipped.
 */
export function pruneScenePartMetadata(
  storyData: StoryData,
  keepRecentParts: number = DEFAULT_KEEP_RECENT_PARTS
): PruneMetadataResult {
  const parts = storyData.scene.parts;
  const cutoff = Math.max(0, parts.length - Math.max(0, keepRecentParts));
  let partsPruned = 0;

  for (let i = 0; i < cutoff; i++) {
    const part = parts[i];
    let touched = false;
    for (const field of PRUNABLE_PART_FIELDS) {
      if (part[field] !== undefined) {
        delete part[field];
        touched = true;
      }
    }
    if (touched) partsPruned++;
  }

  return { partsPruned };
}

export interface ArchiveProgressResult {
  archivedThreads: number;
  archivedGoals: number;
}

/**
 * Fold resolved/abandoned threads and fulfilled goals into scene.summary as
 * a compact record, then remove them from the active arrays. Safe to call
 * repeatedly - once archived, an entry is gone from the active list so a
 * second pass has nothing left to find.
 */
export function archiveResolvedProgress(
  storyData: StoryData
): ArchiveProgressResult {
  const threads = storyData.threads || [];
  const goals = storyData.goals || [];

  const threadsToArchive = threads.filter(
    (t) => t.status === "resolved" || t.status === "abandoned"
  );
  const goalsToArchive = goals.filter((g) => g.fulfilled);

  if (threadsToArchive.length === 0 && goalsToArchive.length === 0) {
    return { archivedThreads: 0, archivedGoals: 0 };
  }

  const lines: string[] = [];
  for (const t of threadsToArchive) {
    lines.push(`- Thread "${t.title}" (${t.status}): ${t.description}`);
  }
  for (const g of goalsToArchive) {
    lines.push(`- Goal completed: "${g.title}" - ${g.shortDescription}`);
  }

  const archiveNote = `Previously resolved:\n${lines.join("\n")}`;
  storyData.scene.summary = storyData.scene.summary
    ? `${storyData.scene.summary}\n\n${archiveNote}`
    : archiveNote;

  if (threadsToArchive.length > 0) {
    const archivedIds = new Set(threadsToArchive.map((t) => t.id));
    storyData.threads = threads.filter((t) => !archivedIds.has(t.id));
  }
  if (goalsToArchive.length > 0) {
    const archivedIds = new Set(goalsToArchive.map((g) => g.id));
    storyData.goals = goals.filter((g) => !archivedIds.has(g.id));
  }

  return {
    archivedThreads: threadsToArchive.length,
    archivedGoals: goalsToArchive.length,
  };
}

/**
 * Opt-in, destructive: folds every part older than `keepRecentParts` into
 * scene.summary via the same summarize/validate/revise pipeline the
 * automatic per-turn compaction uses, then actually truncates scene.parts
 * to the live tail. Unlike the automatic pass, this shrinks stored data -
 * the old prose is replaced by its summary and is not recoverable from this
 * story (use buildCondensedStorySeed beforehand, or Save Copy, to keep an
 * untouched copy first).
 */
export async function summarizeOldNarrative(
  storyData: StoryData,
  apiOptions: CompactionApiOptions,
  keepRecentParts: number = DEFAULT_KEEP_RECENT_PARTS
): Promise<{ ran: boolean; partsRemoved: number }> {
  const plan = planManualCompaction(storyData, keepRecentParts);
  if (!plan) return { ran: false, partsRemoved: 0 };

  const result = await runCompactionPlan(storyData, plan, apiOptions);
  if (!result.ran) return { ran: false, partsRemoved: 0 };

  const partsRemoved = plan.cutoffIndex;
  storyData.scene.parts = storyData.scene.parts.slice(plan.cutoffIndex);
  // Indices below were relative to the pre-truncation array; the summary
  // now covers everything up to the new tail's start, so the "already
  // summarized" pointer resets to 0 rather than pointing past the array.
  storyData.scene.summarizedThroughIndex = 0;
  if (
    storyData.scene.lastSceneBoundaryIndex !== undefined
  ) {
    storyData.scene.lastSceneBoundaryIndex = Math.max(
      0,
      storyData.scene.lastSceneBoundaryIndex - plan.cutoffIndex
    );
  }

  return { ran: true, partsRemoved };
}

export interface CompactStoryOptions {
  keepRecentParts?: number;
  summarizeNarrative?: boolean;
}

export interface CompactStoryResult {
  sizeBeforeBytes: number;
  sizeAfterBytes: number;
  partsPruned: number;
  archivedThreads: number;
  archivedGoals: number;
  narrativeSummarized: boolean;
  partsRemoved: number;
}

/**
 * Run the in-place compaction levers against storyData (mutates it) and
 * report what changed. apiOptions is only required when
 * options.summarizeNarrative is true.
 */
export async function compactStoryInPlace(
  storyData: StoryData,
  options: CompactStoryOptions = {},
  apiOptions?: CompactionApiOptions
): Promise<CompactStoryResult> {
  const keepRecentParts = options.keepRecentParts ?? DEFAULT_KEEP_RECENT_PARTS;
  const sizeBeforeBytes = estimateStoryDataSize(storyData);

  const { partsPruned } = pruneScenePartMetadata(storyData, keepRecentParts);
  const { archivedThreads, archivedGoals } = archiveResolvedProgress(storyData);

  let narrativeSummarized = false;
  let partsRemoved = 0;
  if (options.summarizeNarrative) {
    if (!apiOptions) {
      throw new Error(
        "apiOptions is required when summarizeNarrative is enabled"
      );
    }
    const summarizeResult = await summarizeOldNarrative(
      storyData,
      apiOptions,
      keepRecentParts
    );
    narrativeSummarized = summarizeResult.ran;
    partsRemoved = summarizeResult.partsRemoved;
  }

  const sizeAfterBytes = estimateStoryDataSize(storyData);

  return {
    sizeBeforeBytes,
    sizeAfterBytes,
    partsPruned,
    archivedThreads,
    archivedGoals,
    narrativeSummarized,
    partsRemoved,
  };
}

// How many memory entries a condensed spin-off keeps, ranked by importance
// (falling back to recency for entries with no importance rating). Small
// enough to keep the new story light, generous enough that meaningfully
// significant memories survive the transition.
const CONDENSED_MEMORY_LIMIT = 20;

function rankMemoryEntries(
  memory: (string | MemoryEntry)[]
): (string | MemoryEntry)[] {
  const withScore = memory.map((entry, index) => {
    const importance = typeof entry === "string" ? 0 : entry.importance ?? 0;
    const timestamp = typeof entry === "string" ? 0 : entry.timestamp ?? 0;
    return { entry, importance, timestamp, index };
  });
  withScore.sort((a, b) => {
    if (b.importance !== a.importance) return b.importance - a.importance;
    if (b.timestamp !== a.timestamp) return b.timestamp - a.timestamp;
    return b.index - a.index;
  });
  return withScore.slice(0, CONDENSED_MEMORY_LIMIT).map((s) => s.entry);
}

/**
 * Build a fresh StoryData for "spin off a condensed copy": the original
 * story is never mutated. Keeps the character sheet, world lore, NPCs, and
 * a freshly-written summary of everything that happened; drops the raw
 * turn-by-turn transcript, resolved/inactive threads and goals, and
 * transient scene/combat/timer state so the new story starts clean.
 */
export async function buildCondensedStorySeed(
  storyData: StoryData,
  newName: string,
  apiOptions: CompactionApiOptions
): Promise<StoryData> {
  const seed = structuredClone(storyData);

  const fullPlan = planManualCompaction(storyData, 0);
  let summary = storyData.scene.summary;
  if (fullPlan) {
    const result = await runCompactionPlan(seed, fullPlan, apiOptions);
    if (result.ran && result.summary) {
      summary = result.summary;
    }
  }

  seed.story_name = newName;
  seed.scene = {
    parts: [],
    summary,
    summarizedThroughIndex: 0,
  };
  seed.memory = rankMemoryEntries(seed.memory || []);
  seed.memoryReflectedThroughIndex = undefined;
  seed.chapters = [];
  seed.currentChapter = 0;
  seed.threads = (seed.threads || []).filter((t) => t.status === "active");
  seed.goals = (seed.goals || []).filter((g) => g.active && !g.fulfilled);
  seed.gameOver = undefined;
  seed.activeChallenge = undefined;
  seed.timers = [];
  seed.combatState = undefined;
  seed.reasoningTierState = undefined;
  seed.pendingRandomEvents = [];
  seed.pendingDirectorMoves = [];
  seed.incidentalReactions = {};
  seed.newGamePlusMode = false;
  if (seed.restState) {
    seed.restState = { quickRestsUsed: 0, shortRestsUsed: 0 };
  }
  if (seed.agmtState) {
    seed.agmtState = {
      ...seed.agmtState,
      chaosFactor: 5,
      sceneCount: 0,
      skillCheckHistory: [],
      currentStreak: 0,
      lastChaosAdjustment: 0,
      tension: 5,
    };
  }

  return seed;
}
