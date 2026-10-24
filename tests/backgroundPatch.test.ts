/**
 * A late result from a turn's background wave lands on the turn it judged, or
 * nowhere (judge-layer design 3.1, Codex finding 1). The scenario that broke
 * before: Undo followed by Retry puts a different assistant turn at the same
 * array position, and a rewrite aimed at "part index 1" revised the wrong one.
 */
import { describe, it, expect } from "vitest";
import {
  applyBackgroundFlags,
  applyBackgroundLayersDelta,
  applyBackgroundRewrite,
  backgroundRewriteTarget,
  findPartIndexById,
  hashNarration,
  isEmptyLayersDelta,
  type BackgroundRewritePatch,
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
function patchFor(
  partId: string,
  judgedContent: string,
  extra: Partial<BackgroundRewritePatch> = {},
): BackgroundRewritePatch {
  return {
    partId,
    expectedHash: hashNarration(judgedContent),
    narration: "You force the lock.",
    flag: FLAG,
    allFlags: [FLAG, OTHER_FLAG],
    survivingFlags: [OTHER_FLAG],
    original: { content: judgedContent, flag: FLAG },
    ...extra,
  };
}

describe("applyBackgroundRewrite", () => {
  it("lands on the part it judged, found by id, with the original kept for Undo revision", () => {
    const story = storyOf([playerPart(">go"), gmPart("a", "Draft A")]);
    const next = applyBackgroundRewrite(story, patchFor("a", "Draft A"));

    const part = next.scene.parts[1];
    expect(part.content).toBe("You force the lock.");
    expect(part.observerRewriteOriginal?.content).toBe("Draft A");
    expect(part.correctedObserverFlags?.[0].type).toBe("player_agency");
    expect(part.observerFlags?.map((f) => f.type)).toEqual(["outcome_narration_mismatch"]);
    // Never mutates the story it was given.
    expect(story.scene.parts[1].content).toBe("Draft A");
  });

  it("lands nowhere after Undo then Retry put a different turn at the same position", () => {
    // Turn A is judged while it sits at index 1. The player undoes it and
    // retries: index 1 now holds turn B, with its own id and text.
    const patch = patchFor("a", "Draft A");
    const afterRetry = storyOf([playerPart(">go"), gmPart("b", "Draft B")]);

    expect(backgroundRewriteTarget(afterRetry, patch)).toBeNull();
    expect(applyBackgroundRewrite(afterRetry, patch)).toBe(afterRetry);
  });

  it("lands nowhere when the player edited the turn since the judge read it", () => {
    const edited = storyOf([playerPart(">go"), gmPart("a", "Draft A, as the player edited it")]);
    const patch = patchFor("a", "Draft A");

    expect(backgroundRewriteTarget(edited, patch)).toBeNull();
    expect(applyBackgroundRewrite(edited, patch)).toBe(edited);
  });

  it("lands nowhere when the turn is gone, and when the id is not a GM turn", () => {
    const patch = patchFor("a", "Draft A");
    expect(applyBackgroundRewrite(storyOf([playerPart(">go")]), patch)).toEqual(
      storyOf([playerPart(">go")]),
    );
    const userPartWithId: ScenePart = { ...playerPart("Draft A"), id: "a" };
    const story = storyOf([userPartWithId]);
    expect(applyBackgroundRewrite(story, patch)).toBe(story);
  });

  it("still lands on an earlier turn, but leaves that turn's choices alone", () => {
    const story = storyOf([
      playerPart(">one"),
      gmPart("a", "Draft A", { choices: [{ text: "old choice" }] }),
      playerPart(">two"),
      gmPart("b", "Draft B"),
    ]);
    const patch = patchFor("a", "Draft A", { choices: [{ text: "new choice" }] });

    expect(backgroundRewriteTarget(story, patch)).toBe("older");
    const next = applyBackgroundRewrite(story, patch);
    expect(next.scene.parts[1].content).toBe("You force the lock.");
    expect(next.scene.parts[1].choices).toEqual([{ text: "old choice" }]);
    // The newer turn is untouched.
    expect(next.scene.parts[3]).toBe(story.scene.parts[3]);
  });

  it("applies the re-derived choices only to the newest turn", () => {
    const story = storyOf([playerPart(">go"), gmPart("a", "Draft A", { choices: [{ text: "old" }] })]);
    const patch = patchFor("a", "Draft A", { choices: [{ text: "new" }] });

    expect(backgroundRewriteTarget(story, patch)).toBe("newest");
    expect(applyBackgroundRewrite(story, patch).scene.parts[1].choices).toEqual([{ text: "new" }]);
  });

  it("applies to the CURRENT story, not an older copy it was judged against", () => {
    // The judged object and the live one diverge (each tool batch clones the
    // state): the patch must keep everything the live one has.
    const judged = storyOf([playerPart(">go"), gmPart("a", "Draft A")], { lore: [] } as Partial<StoryData>);
    const live = storyOf([playerPart(">go"), gmPart("a", "Draft A")], {
      lore: [{ title: "Newer note" }],
      reasoningTierState: { currentTier: 2 },
    } as unknown as Partial<StoryData>);

    const next = applyBackgroundRewrite(live, patchFor("a", "Draft A"));
    expect((next as unknown as { lore: unknown[] }).lore).toHaveLength(1);
    expect((next as unknown as { reasoningTierState: unknown }).reasoningTierState).toEqual({
      currentTier: 2,
    });
    expect(judged.scene.parts[1].content).toBe("Draft A");
  });
});

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

  it("drops part notes whose turn is gone but keeps the rest", () => {
    const story = storyOf([gmPart("b", "B")]);
    const next = applyBackgroundLayersDelta(story, {
      partId: "a",
      newMemory: [],
      turnsSinceStoryProgressCheck: 1,
      partNotes: { storyProgressNote: "Pace is fine." },
    });
    expect(next.turnsSinceStoryProgressCheck).toBe(1);
    expect(next.scene.parts[0].storyProgressNote).toBeUndefined();
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
