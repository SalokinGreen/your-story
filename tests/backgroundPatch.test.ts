/**
 * A late result from a turn's background wave lands on the turn it judged, or
 * nowhere (judge-layer design 3.1, Codex finding 1). The scenario that broke
 * before: Undo followed by Retry puts a different assistant turn at the same
 * array position. The background wave no longer rewrites (decision 221), so
 * what is left to land is flags and the memory, director and progress deltas.
 */
import { describe, it, expect } from "vitest";
import {
  applyBackgroundFlags,
  applyBackgroundLayersDelta,
  findPartIndexById,
  hashNarration,
  isEmptyLayersDelta,
} from "@/app/misc/backgroundPatch";
import type { ObserverFlag, ScenePart, StoryData } from "@/app/misc/structs";

const FLAG: ObserverFlag = {
  type: "player_agency",
  severity: "major",
  detail: "Spoke for the player.",
  correctivePrompt: "x",
};
const OTHER_FLAG: ObserverFlag = {
  type: "outcome_narration_mismatch",
  severity: "major",
  detail: "Reversed a miss.",
  correctivePrompt: "x",
};

function gmPart(id: string, content: string, extra: Partial<ScenePart> = {}): ScenePart {
  return { id, content, imageUrl: "", user: false, role: "assistant", choices: [], ...extra };
}
function playerPart(content: string): ScenePart {
  return { content, imageUrl: "", user: true, role: "user", choices: [] };
}
function storyOf(parts: ScenePart[], extra: Partial<StoryData> = {}): StoryData {
  return { scene: { parts }, memory: [], ...extra } as unknown as StoryData;
}
describe("applyBackgroundFlags", () => {
  it("records the flags on the part with that id only", () => {
    const story = storyOf([gmPart("a", "A"), gmPart("b", "B")]);
    const next = applyBackgroundFlags(story, "b", [FLAG]);
    expect(next.scene.parts[0].observerFlags).toBeUndefined();
    expect(next.scene.parts[1].observerFlags).toEqual([FLAG]);
  });

  it("does nothing when the part is gone", () => {
    const story = storyOf([gmPart("a", "A")]);
    expect(applyBackgroundFlags(story, "zzz", [FLAG])).toBe(story);
  });
});

describe("applyBackgroundLayersDelta", () => {
  it("appends new memory once, even when the array already holds it", () => {
    const entry = { content: "The key is under the stone.", timestamp: 5, sceneIndex: 2 };
    // The Memory Keeper pushed to an array the live story still shares.
    const story = storyOf([gmPart("a", "A")], { memory: [entry] } as unknown as Partial<StoryData>);
    const next = applyBackgroundLayersDelta(story, { partId: "a", newMemory: [entry] });
    expect(next.memory).toHaveLength(1);

    const empty = storyOf([gmPart("a", "A")]);
    expect(applyBackgroundLayersDelta(empty, { partId: "a", newMemory: [entry] }).memory).toEqual([entry]);
  });

  it("folds in the director ledger, the progress counter and the part's notes by id", () => {
    const story = storyOf([gmPart("a", "A"), gmPart("b", "B")]);
    const next = applyBackgroundLayersDelta(story, {
      partId: "a",
      newMemory: [],
      directorAssistant: { threadSpotlight: { t: 0 } },
      turnsSinceStoryProgressCheck: 4,
      partNotes: { storyProgressNote: "Pace is fine." },
    });
    expect(next.directorAssistant).toEqual({ threadSpotlight: { t: 0 } });
    expect(next.turnsSinceStoryProgressCheck).toBe(4);
    expect(next.scene.parts[0].storyProgressNote).toBe("Pace is fine.");
    expect(next.scene.parts[1].storyProgressNote).toBeUndefined();
  });

  it("drops the whole delta, memory included, when its turn is gone", () => {
    const story = storyOf([gmPart("b", "B")]);
    const next = applyBackgroundLayersDelta(story, {
      partId: "a",
      newMemory: ["Remembered a thing from an undone turn"],
      turnsSinceStoryProgressCheck: 1,
      partNotes: { storyProgressNote: "Pace is fine." },
    });
    expect(next).toBe(story);
    expect(next.memory ?? []).toHaveLength(0);
  });

  it("knows when a delta carries nothing", () => {
    expect(isEmptyLayersDelta({ partId: "a", newMemory: [] })).toBe(true);
    expect(isEmptyLayersDelta({ partId: "a", newMemory: [], turnsSinceStoryProgressCheck: 0 })).toBe(
      false,
    );
  });
});

describe("hashNarration / findPartIndexById", () => {
  it("hashes the text, ignoring surrounding whitespace", () => {
    expect(hashNarration("  You go.  ")).toBe(hashNarration("You go."));
    expect(hashNarration("You go.")).not.toBe(hashNarration("You went."));
  });

  it("finds a part by id and reports -1 for none", () => {
    const story = storyOf([playerPart(">go"), gmPart("a", "A")]);
    expect(findPartIndexById(story, "a")).toBe(1);
    expect(findPartIndexById(story, "nope")).toBe(-1);
    expect(findPartIndexById(story, undefined)).toBe(-1);
  });
});

describe("value snapshots for in-place state (judge-layer review, finding 6)", () => {
  it("sees a mutation the object identity hides", async () => {
    const { snapshotValue, valueChanged } = await import("@/app/misc/backgroundPatch");
    const director = { spotlight: { a: 1 } } as { spotlight: Record<string, number> };
    const before = snapshotValue(director);
    expect(valueChanged(before, director)).toBe(false);
    director.spotlight.a = 2; // what directorAssistant.ts does, in place
    expect(valueChanged(before, director)).toBe(true);
    expect(valueChanged(snapshotValue(undefined), undefined)).toBe(false);
  });
});
