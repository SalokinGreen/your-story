/**
 * Tests for H7: self-declared "high"/"deadly" roll stakes must be a
 * non-optional reasoning-tier floor, not decorative narration text.
 *
 * Covers the pure logic (stakesFloor, applyTierEscalation) directly, and
 * the wiring into formula_roll/opposed_formula via executeGMTools.
 */

import { describe, it, expect } from "vitest";
import {
  stakesFloor,
  applyTierEscalation,
  TOP_TIER,
  SCENE_BASELINE_TIER,
} from "@/app/misc/reasoningTiers";
import { executeGMTools } from "@/app/misc/gmExecutor";
import { StoryData } from "@/app/misc/structs";

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

function createToolCall(
  name: string,
  args: Record<string, unknown>
): { id: string; function: { name: string; arguments: string } } {
  return {
    id: `test_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    function: {
      name,
      arguments: JSON.stringify(args),
    },
  };
}

describe("stakesFloor", () => {
  it("floors deadly-stakes at the top tier", () => {
    expect(stakesFloor("deadly")).toBe(TOP_TIER);
  });

  it("floors high-stakes one tier below top (same severity as regular combat)", () => {
    expect(stakesFloor("high")).toBe(TOP_TIER - 1);
  });

  it("does not force any floor for medium/low/undefined stakes", () => {
    expect(stakesFloor("medium")).toBe(0);
    expect(stakesFloor("low")).toBe(0);
    expect(stakesFloor(undefined)).toBe(0);
  });
});

describe("applyTierEscalation", () => {
  it("escalates from the scene baseline and persists the new tier onto storyData", () => {
    const storyData = createMockStoryData();
    const decision = applyTierEscalation(storyData, TOP_TIER, "deadly-stakes roll");

    expect(decision.grantedTier).toBe(TOP_TIER);
    expect(decision.previousTier).toBe(SCENE_BASELINE_TIER);
    expect(storyData.reasoningTierState?.currentTier).toBe(TOP_TIER);
  });

  it("does not downgrade an already-higher tier", () => {
    const storyData = createMockStoryData({
      reasoningTierState: {
        currentTier: TOP_TIER,
        tier3CallsInScene: 1,
        lastSceneKey: "freeform:0",
      },
    });
    const decision = applyTierEscalation(storyData, TOP_TIER - 1, "high-stakes roll");

    expect(decision.grantedTier).toBe(TOP_TIER);
    expect(decision.previousTier).toBe(TOP_TIER);
  });

  it("respects the scene top-tier call cap (repeated deadly rolls can't bypass it)", () => {
    const storyData = createMockStoryData({
      reasoningTierState: {
        currentTier: SCENE_BASELINE_TIER,
        tier3CallsInScene: 3, // MAX_TIER3_CALLS_PER_SCENE
        lastSceneKey: "freeform:0",
      },
    });
    const decision = applyTierEscalation(storyData, TOP_TIER, "deadly-stakes roll");

    expect(decision.capped).toBe(true);
    expect(decision.grantedTier).toBeLessThan(TOP_TIER);
  });
});

describe("H7 wiring: formula_roll / opposed_formula force escalation on high/deadly stakes", () => {
  it("does NOT escalate the tier for a low-stakes formula_roll (baseline behavior unchanged)", async () => {
    const storyData = createMockStoryData();
    const toolCall = createToolCall("formula_roll", {
      formula: "1d20+5",
      reason: "Picking a simple lock",
      stakes: "low",
    });

    const result = await executeGMTools([toolCall], storyData);

    expect(result.modifiedStoryData.reasoningTierState).toBeUndefined();
  });

  it("forces a tier escalation for a 'high'-stakes formula_roll outside combat, with no set_reasoning_tier call from the model", async () => {
    const storyData = createMockStoryData();
    const toolCall = createToolCall("formula_roll", {
      formula: "1d20+3",
      reason: "Defusing a bomb under pressure",
      stakes: "high",
    });

    const result = await executeGMTools([toolCall], storyData);

    expect(result.modifiedStoryData.reasoningTierState?.currentTier).toBe(
      TOP_TIER - 1
    );
    expect(result.results[0].contextForStory).toContain("Reasoning tier escalated");
  });

  it("forces a top-tier escalation for a 'deadly'-stakes opposed_formula, with no set_reasoning_tier call from the model", async () => {
    const storyData = createMockStoryData();
    const toolCall = createToolCall("opposed_formula", {
      player_formula: "1d20+4",
      opponent_formula: "1d20+2",
      opponent_name: "Rival Duelist",
      reason: "A duel to the death",
      stakes: "deadly",
    });

    const result = await executeGMTools([toolCall], storyData);

    expect(result.modifiedStoryData.reasoningTierState?.currentTier).toBe(
      TOP_TIER
    );
    expect(result.results[0].contextForStory).toContain("Reasoning tier escalated");
  });

  it("does not escalate again once already at the tier a lower-severity stakes value would grant", async () => {
    const storyData = createMockStoryData({
      reasoningTierState: {
        currentTier: TOP_TIER,
        tier3CallsInScene: 1,
        lastSceneKey: "freeform:0",
      },
    });
    const toolCall = createToolCall("formula_roll", {
      formula: "1d20+3",
      reason: "A tense but lesser follow-up check",
      stakes: "high",
    });

    const result = await executeGMTools([toolCall], storyData);

    expect(result.modifiedStoryData.reasoningTierState?.currentTier).toBe(
      TOP_TIER
    );
    expect(result.results[0].contextForStory).not.toContain(
      "Reasoning tier escalated"
    );
  });
});
