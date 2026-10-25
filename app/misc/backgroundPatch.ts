// How a late result from a turn's background wave lands on the story
// (judge-layer design 3.1, Codex review finding 1).
//
// The background wave (the Observer's flags, the Memory Keeper, the
// Director Assistant, the Story Progress Observer) finishes after the player
// has the turn, and often after the next one has started. It used to write
// into the StoryData object it captured and hand the page that whole object to
// publish and save. By then the object could be old: each tool batch clones
// the state and assigns it back, so a captured object diverges from the live
// one, and republishing it brought back older mechanics and history. And it
// found "its" part by array index, so an Undo followed by a Retry could put a
// different assistant turn at that position and the rewrite landed on it.
//
// Now a late result is a PATCH. It names the part by id and, for a rewrite, by
// a hash of the content the judge read. The page applies it to the CURRENT
// story, the way the picture queue does (imagePatcher.ts): the part with that
// id must still exist and still hold that content, or the patch is dropped.
// Nothing here ever saves, or returns, a captured whole-story object.

import { hashNotes } from "./campaignPlan";
import type {
  MemoryEntry,
  ObserverFlag,
  ScenePart,
  StoryData,
} from "./structs";

/** A stable hash of one narration, whitespace-trimmed (campaignPlan.ts's FNV-1a). */
export function hashNarration(text: string): string {
  return hashNotes([{ title: "narration", content: text.trim() }]);
}

/** The index of the part with this id, or -1. Ids, not positions: see above. */
export function findPartIndexById(
  story: Pick<StoryData, "scene">,
  partId: string | undefined,
): number {
  if (!partId) return -1;
  return (story.scene?.parts ?? []).findIndex((p) => p.id === partId);
}

/** A value-level snapshot, for state a layer mutates in place. */
export function snapshotValue(value: unknown): string {
  return JSON.stringify(value ?? null);
}

/** True when `current` no longer equals the value `snapshot` was taken of. */
export function valueChanged(snapshot: string, current: unknown): boolean {
  return snapshotValue(current) !== snapshot;
}

function isGmPart(part: ScenePart | undefined): part is ScenePart {
  return Boolean(part && !part.user && part.role === "assistant");
}

// ---- Flags the background pass could not fix --------------------------------

/** The story with `flags` recorded on the part with this id; unchanged if it is gone. */
export function applyBackgroundFlags(
  story: StoryData,
  partId: string,
  flags: ObserverFlag[],
): StoryData {
  const index = findPartIndexById(story, partId);
  if (index < 0 || !isGmPart(story.scene.parts[index])) return story;
  return {
    ...story,
    scene: {
      ...story.scene,
      parts: story.scene.parts.map((p, i) =>
        i === index
          ? {
              ...p,
              observerFlags: flags,
              // The turn's details say it was checked (a revised turn stays revised).
              publicNotice: p.publicNotice === "revised" ? "revised" : "checked",
            }
          : p,
      ),
    },
  };
}

// ---- The other background layers -------------------------------------------

/**
 * What the Memory Keeper, the Director Assistant and the Story Progress
 * Observer changed, as a delta rather than as the whole story they ran
 * against. They still run on the turn's own object (they need to read it);
 * generateStoryTurn measures what they wrote and hands the page only that.
 */
export interface BackgroundLayersDelta {
  /** The turn's part, for the Story Progress Observer's notes. */
  partId?: string;
  /** Memory entries the Memory Keeper added this wave. */
  newMemory: Array<string | MemoryEntry>;
  directorAssistant?: StoryData["directorAssistant"];
  turnsSinceStoryProgressCheck?: number;
  partNotes?: Pick<
    ScenePart,
    "storyProgressNote" | "repetitionNote" | "knowledgeNote"
  >;
}

function memoryKey(entry: MemoryEntry | string): string {
  if (typeof entry === "string") return `s:${entry}`;
  return `${entry.timestamp ?? ""}:${entry.sceneIndex ?? ""}:${entry.content}`;
}

/** True when the delta carries nothing the page needs to apply. */
export function isEmptyLayersDelta(delta: BackgroundLayersDelta): boolean {
  return (
    delta.newMemory.length === 0 &&
    delta.directorAssistant === undefined &&
    delta.turnsSinceStoryProgressCheck === undefined &&
    !delta.partNotes
  );
}

/**
 * The story with the delta folded in. Memory is appended by entry identity
 * (timestamp, scene index and text), so a delta that reaches a story whose
 * memory array is already the one the Memory Keeper pushed to adds nothing
 * twice.
 */
export function applyBackgroundLayersDelta(
  story: StoryData,
  delta: BackgroundLayersDelta,
): StoryData {
  // A turn that was undone or retried takes its memory with it.
  if (delta.partId && findPartIndexById(story, delta.partId) < 0) return story;
  let next = story;
  const have = new Set((story.memory ?? []).map(memoryKey));
  const fresh = delta.newMemory.filter((m) => !have.has(memoryKey(m)));
  if (fresh.length > 0) {
    next = { ...next, memory: [...(next.memory ?? []), ...fresh] };
  }
  if (delta.directorAssistant !== undefined) {
    next = { ...next, directorAssistant: delta.directorAssistant };
  }
  if (delta.turnsSinceStoryProgressCheck !== undefined) {
    next = {
      ...next,
      turnsSinceStoryProgressCheck: delta.turnsSinceStoryProgressCheck,
    };
  }
  if (delta.partNotes) {
    const index = findPartIndexById(next, delta.partId);
    if (index >= 0 && isGmPart(next.scene.parts[index])) {
      next = {
        ...next,
        scene: {
          ...next.scene,
          parts: next.scene.parts.map((p, i) =>
            i === index ? { ...p, ...delta.partNotes } : p,
          ),
        },
      };
    }
  }
  return next;
}
