/**
 * Tests for start_game - the session-zero -> real-play handoff tool. It
 * renames the story (replacing the generic "New Story" placeholder),
 * optionally records the premise, and clears sessionZeroActive so the
 * reasoning-tier router's hard floor (hardRuleFloor, reasoningTiers.ts)
 * stops forcing TOP_TIER.
 */
import { describe, it, expect } from "vitest";
import { executeGMTools } from "@/app/misc/gmExecutor";
import { StoryData } from "@/app/misc/structs";
import {
  hardRuleFloor,
  SCENE_BASELINE_TIER,
  TOP_TIER,
} from "@/app/misc/reasoningTiers";

function createMockStoryData(overrides: Partial<StoryData> = {}): StoryData {
  return {
    story_name: "New Story",
    player_name: "Hero",
    premise: "",
    sessionZeroActive: true,
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

function createToolCall(name: string, args: Record<string, unknown>) {
  return {
    id: `test_${Math.random().toString(36).slice(2)}`,
    function: { name, arguments: JSON.stringify(args) },
  };
}

describe("hardRuleFloor: session zero", () => {
  it("forces TOP_TIER while sessionZeroActive is true", () => {
    const storyData = createMockStoryData();
    expect(hardRuleFloor(storyData)).toBe(TOP_TIER);
  });

  it("does not force a tier once sessionZeroActive is false", () => {
    const storyData = createMockStoryData({ sessionZeroActive: false });
    expect(hardRuleFloor(storyData)).toBe(0);
  });

  it("does not force a tier for old saves with no sessionZeroActive field", () => {
    const storyData = createMockStoryData({ sessionZeroActive: undefined });
    expect(hardRuleFloor(storyData)).toBe(0);
  });
});

describe("start_game", () => {
  it("names the story and clears sessionZeroActive", async () => {
    const storyData = createMockStoryData();
    const result = await executeGMTools(
      [
        createToolCall("start_game", {
          story_name: "Ashes of the Ninth Legion",
          premise: "A disgraced legionnaire seeks redemption at the empire's edge.",
        }),
      ],
      storyData,
    );

    expect(result.results[0].success).toBe(true);
    expect(result.modifiedStoryData.story_name).toBe(
      "Ashes of the Ninth Legion",
    );
    expect(result.modifiedStoryData.premise).toBe(
      "A disgraced legionnaire seeks redemption at the empire's edge.",
    );
    expect(result.modifiedStoryData.sessionZeroActive).toBe(false);
  });

  it("resets reasoningTierState to baseline immediately", async () => {
    const storyData = createMockStoryData({
      reasoningTierState: {
        currentTier: TOP_TIER,
        tier3CallsInScene: 2,
        lastSceneKey: "freeform:0",
      },
    });
    const result = await executeGMTools(
      [createToolCall("start_game", { story_name: "The Long Road" })],
      storyData,
    );

    expect(result.modifiedStoryData.reasoningTierState?.currentTier).toBe(
      SCENE_BASELINE_TIER,
    );
    expect(hardRuleFloor(result.modifiedStoryData)).toBe(0);
  });

  it("leaves premise untouched when not provided", async () => {
    const storyData = createMockStoryData({ premise: "Existing premise" });
    const result = await executeGMTools(
      [createToolCall("start_game", { story_name: "Untitled Saga" })],
      storyData,
    );

    expect(result.modifiedStoryData.premise).toBe("Existing premise");
  });

  it("rejects a call missing the required story_name", async () => {
    const storyData = createMockStoryData();
    const result = await executeGMTools(
      [createToolCall("start_game", {})],
      storyData,
    );

    expect(result.results[0].success).toBe(false);
  });
});
