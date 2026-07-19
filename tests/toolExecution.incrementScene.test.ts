/**
 * Integration test for increment_scene, which now runs a real Mythic-style
 * scene check and adjusts chaos from its result instead of the old,
 * practically-inert skill-check-streak heuristic (calculateChaosAdjustment
 * always returned 0 in production since nothing ever populated
 * skillCheckHistory).
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { executeTools, ToolCall } from "@/app/misc/toolExecutor";
import type { StoryData } from "@/app/misc/structs";

function createTestStory(overrides: Partial<StoryData> = {}): StoryData {
  return {
    story_name: "Test Story",
    premise: "Test premise",
    player_name: "Test Player",
    player_summary: "Test summary",
    intro: "Test intro",
    points: 0,
    earnedPointsFromQuests: [],
    earnedPointsFromChapters: [],
    currentChapter: 0,
    max_chapters: 10,
    scene: { parts: [] },
    chapters: [],
    quests: [],
    stats: [],
    resources: [],
    inventory: [],
    achievements: [],
    lore: [],
    memory: [],
    momentum: 0,
    maxMomentum: 10,
    relationships: [],
    rpgSystem: "3d6",
    abilities: [],
    level: 1,
    upgradesSpent: 0,
    conditions: [],
    npcs: [],
    ...overrides,
  } as StoryData;
}

function mockRandom(value: number) {
  vi.spyOn(Math, "random").mockReturnValue(value);
}

const incrementSceneCall: ToolCall = {
  type: "function",
  function: { name: "increment_scene", arguments: {} },
};

describe("increment_scene", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("increments sceneCount", () => {
    mockRandom(0.99); // Normal scene
    const storyData = createTestStory({
      agmtState: {
        chaosFactor: 5,
        sceneCount: 2,
        skillCheckHistory: [],
        currentStreak: 0,
        lastChaosAdjustment: -999,
      },
    });

    const { responses } = executeTools([incrementSceneCall], storyData);

    expect(responses[0].success).toBe(true);
    expect(storyData.agmtState!.sceneCount).toBe(3);
  });

  it("decreases chaos on a Normal scene resolution", () => {
    mockRandom(0.99); // roll 10 -> Normal at chaos 5
    const storyData = createTestStory({
      agmtState: {
        chaosFactor: 5,
        sceneCount: 0,
        skillCheckHistory: [],
        currentStreak: 0,
        lastChaosAdjustment: -999,
      },
    });

    const { responses } = executeTools([incrementSceneCall], storyData);

    expect(storyData.agmtState!.chaosFactor).toBe(4);
    expect(responses[0].message).toContain("Normal");
    expect(responses[0].message).toContain("decreased");
  });

  it("increases chaos and surfaces a random event on an Interrupted scene", () => {
    mockRandom(0); // roll 1 -> Interrupted at chaos 5
    const storyData = createTestStory({
      agmtState: {
        chaosFactor: 5,
        sceneCount: 0,
        skillCheckHistory: [],
        currentStreak: 0,
        lastChaosAdjustment: -999,
      },
    });

    const { responses } = executeTools([incrementSceneCall], storyData);

    expect(storyData.agmtState!.chaosFactor).toBe(6);
    expect(responses[0].message).toContain("INTERRUPTED");
    expect(responses[0].message).toContain("increased");
  });

  it("clamps chaos at the 1-9 boundary", () => {
    mockRandom(0.99); // Normal -> would decrease
    const storyData = createTestStory({
      agmtState: {
        chaosFactor: 1,
        sceneCount: 0,
        skillCheckHistory: [],
        currentStreak: 0,
        lastChaosAdjustment: -999,
      },
    });

    executeTools([incrementSceneCall], storyData);

    expect(storyData.agmtState!.chaosFactor).toBe(1);
  });

  it("initializes agmtState with defaults if missing", () => {
    mockRandom(0.99);
    const storyData = createTestStory();

    const { responses } = executeTools([incrementSceneCall], storyData);

    expect(responses[0].success).toBe(true);
    expect(storyData.agmtState).toBeDefined();
    expect(storyData.agmtState!.sceneCount).toBe(1);
  });
});
