import { describe, it, expect } from "vitest";
import { planCompaction, applyCompaction } from "../app/misc/compaction";
import { StoryData, ScenePart } from "../app/misc/structs";

function createMockStoryData(overrides: Partial<StoryData> = {}): StoryData {
  return {
    story_name: "Test Story",
    player_name: "Hero",
    premise: "A test adventure",
    scene: { parts: [] },
    stats: [],
    resources: [],
    inventory: [],
    abilities: [],
    achievements: [],
    lore: [],
    memory: [],
    ...overrides,
  } as StoryData;
}

// A long paragraph so a handful of parts comfortably exceeds both the small
// token budgets and the MIN_UNCOVERED_TOKENS_TO_SUMMARIZE threshold used in
// these tests, regardless of exactly how tokens are counted.
const LONG_PARAGRAPH = "The party pressed onward through the ancient ruins, wary of traps. ".repeat(400);

function part(content: string, user = false): ScenePart {
  return { content, imageUrl: "", user, role: user ? "user" : "assistant" } as ScenePart;
}

describe("planCompaction", () => {
  it("returns null when there is no scene history", () => {
    const storyData = createMockStoryData();
    expect(planCompaction(storyData, 10000)).toBeNull();
  });

  it("returns null when everything already fits the budget", () => {
    const storyData = createMockStoryData({
      scene: { parts: [part("short line 1"), part("short line 2")] },
    });
    expect(planCompaction(storyData, 10000)).toBeNull();
  });

  it("plans a summary for parts that fall outside a small budget", () => {
    const parts = [
      part(LONG_PARAGRAPH),
      part(LONG_PARAGRAPH),
      part(LONG_PARAGRAPH),
      part("recent short line"),
    ];
    const storyData = createMockStoryData({ scene: { parts } });

    // Budget small enough that only the last part fits.
    const plan = planCompaction(storyData, 50);

    expect(plan).not.toBeNull();
    expect(plan!.cutoffIndex).toBe(3);
    expect(plan!.textToSummarize).toContain("ruins");
    expect(plan!.priorSummary).toBeUndefined();
  });

  it("returns null when the newly-dropped content is too small to bother with", () => {
    const parts = [part("a short early line"), part("recent short line")];
    const storyData = createMockStoryData({ scene: { parts } });

    // Budget tiny enough to exclude part 0, but part 0's content is tiny too.
    const plan = planCompaction(storyData, 1);
    expect(plan).toBeNull();
  });

  it("does not re-plan parts already covered by a prior summary", () => {
    const parts = [
      part(LONG_PARAGRAPH),
      part(LONG_PARAGRAPH),
      part(LONG_PARAGRAPH),
      part("recent short line"),
    ];
    const storyData = createMockStoryData({
      scene: {
        parts,
        summary: "Earlier events already summarized.",
        summarizedThroughIndex: 3,
      },
    });

    const plan = planCompaction(storyData, 50);
    expect(plan).toBeNull();
  });

  it("only summarizes the newly-dropped slice when a prior summary exists", () => {
    const parts = [
      part(LONG_PARAGRAPH), // already covered
      part(LONG_PARAGRAPH), // newly dropped
      part(LONG_PARAGRAPH), // newly dropped
      part("recent short line"),
    ];
    const storyData = createMockStoryData({
      scene: {
        parts,
        summary: "Summary of part 0.",
        summarizedThroughIndex: 1,
      },
    });

    const plan = planCompaction(storyData, 50);
    expect(plan).not.toBeNull();
    expect(plan!.cutoffIndex).toBe(3);
    expect(plan!.priorSummary).toBe("Summary of part 0.");
  });
});

describe("applyCompaction", () => {
  it("writes the summary and coverage index onto storyData", () => {
    const parts = [part(LONG_PARAGRAPH), part(LONG_PARAGRAPH), part("recent")];
    const storyData = createMockStoryData({ scene: { parts } });
    const plan = planCompaction(storyData, 50)!;
    expect(plan).not.toBeNull();

    applyCompaction(storyData, plan, "  The party explored ancient ruins.  ");

    expect(storyData.scene.summary).toBe("The party explored ancient ruins.");
    expect(storyData.scene.summarizedThroughIndex).toBe(plan.cutoffIndex);
  });
});
