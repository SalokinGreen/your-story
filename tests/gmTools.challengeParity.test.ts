/**
 * Tests for three challenge-system fixes:
 * - Asymmetric required_successes/max_failures are honored instead of being
 *   silently collapsed into one symmetric majority derived from `rounds`.
 * - cancel_challenge gives the live GM-stage tool set a real escape hatch
 *   for a challenge that stops mattering narratively before either side
 *   reaches its threshold (previously: permanently stuck active).
 * - formula_challenge_check brought to parity with formula_roll/
 *   opposed_formula: reverse_dc, stakes, target/forces_choice hardness
 *   dimensions, stat_name integrity checking.
 */

import { describe, it, expect } from "vitest";
import { executeGMTools } from "@/app/misc/gmExecutor";
import { StoryData, SceneChallenge } from "@/app/misc/structs";

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
    function: { name, arguments: JSON.stringify(args) },
  };
}

function activeChallenge(overrides: Partial<SceneChallenge> = {}): SceneChallenge {
  return {
    id: "test_challenge",
    name: "Rooftop Chase",
    description: "Chasing the thief across rooftops",
    rounds: 9,
    currentSuccesses: 0,
    currentFailures: 0,
    active: true,
    createdAt: Date.now(),
    ...overrides,
  };
}

describe("start_challenge: asymmetric thresholds", () => {
  it("stores the declared required_successes/max_failures independently of rounds", async () => {
    const storyData = createMockStoryData();
    const toolCall = createToolCall("start_challenge", {
      name: "Lenient Negotiation",
      description: "Talk the guard down",
      required_successes: 3,
      max_failures: 5,
      primary_stat: "Charisma",
      difficulty: "medium",
    });

    const result = await executeGMTools([toolCall], storyData);

    expect(result.modifiedStoryData.activeChallenge?.requiredSuccesses).toBe(3);
    expect(result.modifiedStoryData.activeChallenge?.maxFailures).toBe(5);
  });

  it("wins at the declared required_successes, not a rounds-derived majority", async () => {
    const storyData = createMockStoryData({
      activeChallenge: activeChallenge({
        rounds: 9, // max(3,5)*2-1 - would derive a majority of 5 if used directly
        requiredSuccesses: 3,
        maxFailures: 5,
        currentSuccesses: 2,
      }),
    });
    const toolCall = createToolCall("formula_challenge_check", {
      formula: "1d20+100", // guaranteed success
      dc: 15,
      description: "One more push",
    });

    const result = await executeGMTools([toolCall], storyData);
    const checkResult = result.results[0].result as any;

    expect(checkResult.challengeProgress.successes).toBe(3);
    expect(checkResult.challengeProgress.required).toBe(3);
    expect(checkResult.challengeProgress.completed).toBe(true);
    expect(checkResult.challengeProgress.won).toBe(true);
  });

  it("loses at the declared max_failures, independent of required_successes", async () => {
    const storyData = createMockStoryData({
      activeChallenge: activeChallenge({
        rounds: 9,
        requiredSuccesses: 3,
        maxFailures: 5,
        currentFailures: 4,
      }),
    });
    const toolCall = createToolCall("formula_challenge_check", {
      formula: "1d1", // always rolls 1
      dc: 100, // guaranteed failure
      description: "Losing ground",
    });

    const result = await executeGMTools([toolCall], storyData);
    const checkResult = result.results[0].result as any;

    expect(checkResult.challengeProgress.failures).toBe(5);
    expect(checkResult.challengeProgress.maxFailures).toBe(5);
    expect(checkResult.challengeProgress.completed).toBe(true);
    expect(checkResult.challengeProgress.won).toBe(false);
  });

  it("falls back to the old rounds-derived majority for challenges started before this fix", async () => {
    const storyData = createMockStoryData({
      // No requiredSuccesses/maxFailures - simulates an in-flight challenge
      // from before this field existed.
      activeChallenge: activeChallenge({ rounds: 5, currentSuccesses: 1 }),
    });
    const toolCall = createToolCall("formula_challenge_check", {
      formula: "1d20+100",
      dc: 15,
      description: "Legacy challenge check",
    });

    const result = await executeGMTools([toolCall], storyData);
    const checkResult = result.results[0].result as any;

    // floor(5/2)+1 = 3, same as the pre-fix behavior
    expect(checkResult.challengeProgress.required).toBe(3);
  });
});

describe("cancel_challenge", () => {
  it("errors when there is no active challenge", async () => {
    const storyData = createMockStoryData();
    const toolCall = createToolCall("cancel_challenge", {
      reason: "Nothing to cancel",
    });

    const result = await executeGMTools([toolCall], storyData);

    expect(result.results[0].success).toBe(false);
    expect(result.storyContext).toContain("ERROR");
  });

  it("deactivates the challenge without setting won/lost", async () => {
    const storyData = createMockStoryData({
      activeChallenge: activeChallenge({ name: "Bar Brawl" }),
    });
    const toolCall = createToolCall("cancel_challenge", {
      reason: "The other patrons broke it up before it went anywhere",
    });

    const result = await executeGMTools([toolCall], storyData);

    expect(result.results[0].success).toBe(true);
    expect(result.modifiedStoryData.activeChallenge?.active).toBe(false);
    expect(result.modifiedStoryData.activeChallenge?.result).toBeUndefined();
    expect(result.storyContext).toContain("Challenge Cancelled");
  });

  it("frees the challenge slot so a new one can start", async () => {
    const storyData = createMockStoryData({
      activeChallenge: activeChallenge({ name: "Bar Brawl" }),
    });
    const cancelResult = await executeGMTools(
      [createToolCall("cancel_challenge", { reason: "Scene changed" })],
      storyData
    );

    const startResult = await executeGMTools(
      [
        createToolCall("start_challenge", {
          name: "New Challenge",
          description: "A fresh start",
          required_successes: 3,
          max_failures: 3,
          primary_stat: "Strength",
          difficulty: "medium",
        }),
      ],
      cancelResult.modifiedStoryData
    );

    expect(startResult.results[0].success).toBe(true);
    expect(startResult.modifiedStoryData.activeChallenge?.name).toBe("New Challenge");
  });
});

describe("formula_challenge_check parity with formula_roll", () => {
  it("supports reverse_dc (roll-under)", async () => {
    const storyData = createMockStoryData({
      activeChallenge: activeChallenge(),
    });
    const toolCall = createToolCall("formula_challenge_check", {
      formula: "1d1", // always rolls 1
      dc: 50,
      reverse_dc: true,
      description: "Sneak past the sentries",
    });

    const result = await executeGMTools([toolCall], storyData);
    const checkResult = result.results[0].result as any;

    expect(checkResult.reverseDC).toBe(true);
    expect(checkResult.success).toBe(true); // 1 <= 50 under reverse_dc
  });

  it("escalates the reasoning tier on high/deadly stakes, same as formula_roll", async () => {
    const storyData = createMockStoryData({
      activeChallenge: activeChallenge(),
    });
    const toolCall = createToolCall("formula_challenge_check", {
      formula: "1d20+100",
      dc: 15,
      description: "The final blow",
      stakes: "deadly",
    });

    const result = await executeGMTools([toolCall], storyData);
    const context = result.results[0].contextForStory || "";

    expect(context).toContain("[Stakes: deadly]");
    expect(
      result.modifiedStoryData.reasoningTierState?.highStakesSceneKey
    ).toBeDefined();
  });

  it("surfaces the target hardness dimension in contextForStory on failure", async () => {
    const storyData = createMockStoryData({
      activeChallenge: activeChallenge(),
    });
    const toolCall = createToolCall("formula_challenge_check", {
      formula: "1d1",
      dc: 100,
      description: "A desperate gambit",
      target: "someone_they_love",
    });

    const result = await executeGMTools([toolCall], storyData);
    const context = result.results[0].contextForStory || "";

    expect(context).toContain("[Target:");
  });

  it("flags a stat_name modifier that far exceeds the matched stat's value", async () => {
    const storyData = createMockStoryData({
      stats: [{ name: "Strength", value: 3, description: "", symbol: "" } as any],
      activeChallenge: activeChallenge(),
    });
    const toolCall = createToolCall("formula_challenge_check", {
      formula: "0+50",
      dc: 15,
      description: "An implausibly strong heave",
      stat_name: "Strength",
    });

    const result = await executeGMTools([toolCall], storyData);
    const context = result.results[0].contextForStory || "";

    expect(context).toContain("Roll integrity check");
  });
});
