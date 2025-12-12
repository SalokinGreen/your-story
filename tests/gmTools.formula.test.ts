/**
 * Tests for formula-based GM tools
 * Tests formula_roll, opposed_formula, and formula_challenge_check
 */

import { describe, it, expect, beforeEach } from "vitest";
import { executeGMTools } from "@/app/misc/gmExecutor";
import { StoryData, SceneChallenge } from "@/app/misc/structs";

// Mock story data with characterData (new schema system)
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

// Helper to create a tool call
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

describe("Formula Roll Tool", () => {
  it("should roll a simple formula without variables", async () => {
    const storyData = createMockStoryData();
    const toolCall = createToolCall("formula_roll", {
      formula: "1d20+5",
      reason: "Testing basic roll",
    });

    const result = await executeGMTools([toolCall], storyData);

    expect(result.results).toHaveLength(1);
    expect(result.results[0].toolName).toBe("formula_roll");
    expect(result.results[0].success).toBe(true);

    const rollResult = result.results[0].result as any;
    expect(rollResult.type).toBe("formula_roll");
    expect(rollResult.formula).toBe("1d20+5");
    expect(rollResult.total).toBeGreaterThanOrEqual(6); // 1+5
    expect(rollResult.total).toBeLessThanOrEqual(25); // 20+5
    expect(rollResult.rolls).toHaveLength(1);
  });

  it("should roll with DC and determine success", async () => {
    const storyData = createMockStoryData();
    const toolCall = createToolCall("formula_roll", {
      formula: "1d20+10", // Always beats DC 5
      dc: 5,
      reason: "Testing DC check",
    });

    const result = await executeGMTools([toolCall], storyData);

    const rollResult = result.results[0].result as any;
    expect(rollResult.dc).toBe(5);
    expect(rollResult.success).toBe(true);
    expect(rollResult.margin).toBeGreaterThanOrEqual(6); // minimum 11-5=6
  });

  it("should roll with direct numbers (variables removed)", async () => {
    // Variable substitution has been removed - GM must provide actual numbers
    const storyData = createMockStoryData();
    const toolCall = createToolCall("formula_roll", {
      formula: "1d20+4+3", // Direct numbers instead of variables
      dc: 15,
      reason: "Testing direct number roll",
    });

    const result = await executeGMTools([toolCall], storyData);

    const rollResult = result.results[0].result as any;
    // Total should be 1-20 + 4 + 3 = 8-27
    expect(rollResult.total).toBeGreaterThanOrEqual(8);
    expect(rollResult.total).toBeLessThanOrEqual(27);
  });

  it("should error when using variable syntax (variables removed)", async () => {
    // Variable substitution has been removed - {{var}} syntax should fail
    const storyData = createMockStoryData();
    const toolCall = createToolCall("formula_roll", {
      formula: "1d20+{{Strength_mod}}+{{proficiency}}", // This should fail now
      dc: 15,
      reason: "Testing that variables cause error",
    });

    const result = await executeGMTools([toolCall], storyData);

    // Should fail because variables are no longer resolved
    expect(result.results[0].success).toBe(false);
    expect(result.storyContext).toContain("ERROR");
  });

  it("should handle formula without variable substitution", async () => {
    // Even with characterData, formulas use direct numbers now
    const storyData = createMockStoryData({
      stats: [{ name: "Dexterity", value: 16, description: "", symbol: "🎯" }],
    });
    const toolCall = createToolCall("formula_roll", {
      formula: "1d20+3", // Direct number, not variable
      reason: "Testing direct number with stats present",
    });

    const result = await executeGMTools([toolCall], storyData);

    const rollResult = result.results[0].result as any;
    expect(rollResult.total).toBeGreaterThanOrEqual(4); // 1+3
    expect(rollResult.total).toBeLessThanOrEqual(23); // 20+3
  });

  it("should include consequences in context", async () => {
    const storyData = createMockStoryData();
    const toolCall = createToolCall("formula_roll", {
      formula: "1d20",
      dc: 100, // Impossible DC
      reason: "Testing consequences",
      stakes: "high",
      consequences: {
        success: "You succeed gloriously",
        failure: "You fail miserably",
      },
    });

    const result = await executeGMTools([toolCall], storyData);

    expect(result.storyContext).toContain("FAILURE");
    expect(result.storyContext).toContain("Stakes: high");
    expect(result.storyContext).toContain("You fail miserably");
  });

  it("should handle invalid formulas gracefully", async () => {
    const storyData = createMockStoryData();
    const toolCall = createToolCall("formula_roll", {
      formula: "invalid formula!!!",
      reason: "Testing error handling",
    });

    const result = await executeGMTools([toolCall], storyData);

    expect(result.results[0].success).toBe(false);
    expect(result.storyContext).toContain("ERROR");
  });
});

describe("Opposed Formula Tool", () => {
  it("should roll opposed formulas and determine winner", async () => {
    const storyData = createMockStoryData();
    const toolCall = createToolCall("opposed_formula", {
      player_formula: "1d20+8",
      opponent_formula: "1d20+5",
      opponent_name: "Guard",
      reason: "Sneaking past the guard",
    });

    const result = await executeGMTools([toolCall], storyData);

    expect(result.results).toHaveLength(1);
    const oppResult = result.results[0].result as any;
    expect(oppResult.type).toBe("opposed_formula");
    expect(oppResult.playerFormula).toBe("1d20+8");
    expect(oppResult.opponentName).toBe("Guard");
    expect(["player", "opponent", "tie"]).toContain(oppResult.winner);
    expect(oppResult.margin).toBeGreaterThanOrEqual(0);
  });

  it("should include player and opponent rolls in context", async () => {
    const storyData = createMockStoryData();
    const toolCall = createToolCall("opposed_formula", {
      player_formula: "2d6+3",
      opponent_formula: "2d6+2",
      opponent_name: "Rival Merchant",
      reason: "Haggling over prices",
    });

    const result = await executeGMTools([toolCall], storyData);

    expect(result.storyContext).toContain("Player:");
    expect(result.storyContext).toContain("Rival Merchant:");
    expect(result.storyContext).toContain("Winner:");
  });

  it("should include consequences based on winner", async () => {
    const storyData = createMockStoryData();
    const toolCall = createToolCall("opposed_formula", {
      player_formula: "1d20+100", // Guaranteed win
      opponent_formula: "1d20",
      opponent_name: "Weakling",
      reason: "Arm wrestling",
      consequences: {
        player_wins: "You slam their arm down",
        opponent_wins: "They beat you somehow",
        tie: "A perfect standoff",
      },
    });

    const result = await executeGMTools([toolCall], storyData);

    expect(result.storyContext).toContain("PLAYER");
    expect(result.storyContext).toContain("You slam their arm down");
  });
});

describe("Formula Challenge Check Tool", () => {
  it("should fail if no active challenge", async () => {
    const storyData = createMockStoryData();
    const toolCall = createToolCall("formula_challenge_check", {
      formula: "1d20+5",
      dc: 15,
      description: "Vault over the gap",
    });

    const result = await executeGMTools([toolCall], storyData);

    expect(result.results[0].success).toBe(false);
    expect(result.storyContext).toContain("ERROR");
    expect(result.storyContext).toContain("No active challenge");
  });

  it("should update challenge progress on success", async () => {
    const challenge: SceneChallenge = {
      id: "test_challenge",
      name: "Rooftop Chase",
      description: "Chasing the thief across rooftops",
      rounds: 5,
      currentSuccesses: 1,
      currentFailures: 0,
      active: true,
      createdAt: Date.now(),
    };
    const storyData = createMockStoryData({
      activeChallenge: challenge,
    });
    const toolCall = createToolCall("formula_challenge_check", {
      formula: "1d20+100", // Guaranteed success
      dc: 15,
      description: "Leap to the next building",
    });

    const result = await executeGMTools([toolCall], storyData);

    expect(result.results[0].success).toBe(true);
    const checkResult = result.results[0].result as any;
    expect(checkResult.challengeProgress.successes).toBe(2);
    expect(checkResult.challengeProgress.failures).toBe(0);
    // Modified storyData should reflect the change
    expect(result.modifiedStoryData.activeChallenge?.currentSuccesses).toBe(2);
  });

  it("should update challenge progress on failure", async () => {
    const challenge: SceneChallenge = {
      id: "test_challenge",
      name: "Rooftop Chase",
      description: "Chasing the thief across rooftops",
      rounds: 5,
      currentSuccesses: 0,
      currentFailures: 1,
      active: true,
      createdAt: Date.now(),
    };
    const storyData = createMockStoryData({
      activeChallenge: challenge,
    });
    const toolCall = createToolCall("formula_challenge_check", {
      formula: "1d20", // Roll against impossible DC
      dc: 100,
      description: "Try the impossible jump",
    });

    const result = await executeGMTools([toolCall], storyData);

    expect(result.results[0].success).toBe(false);
    const checkResult = result.results[0].result as any;
    expect(checkResult.challengeProgress.failures).toBe(2);
    expect(result.modifiedStoryData.activeChallenge?.currentFailures).toBe(2);
  });

  it("should resolve challenge when majority reached", async () => {
    const challenge: SceneChallenge = {
      id: "test_challenge",
      name: "Final Showdown",
      description: "The climactic battle",
      rounds: 5, // Need 3 to win
      currentSuccesses: 2, // One more for victory
      currentFailures: 0,
      active: true,
      createdAt: Date.now(),
    };
    const storyData = createMockStoryData({
      activeChallenge: challenge,
    });
    const toolCall = createToolCall("formula_challenge_check", {
      formula: "1d20+100", // Guaranteed success
      dc: 15,
      description: "Land the finishing blow",
    });

    const result = await executeGMTools([toolCall], storyData);

    const checkResult = result.results[0].result as any;
    expect(checkResult.challengeProgress.completed).toBe(true);
    expect(checkResult.challengeProgress.won).toBe(true);
    expect(result.storyContext).toContain("Challenge WON");
    expect(result.modifiedStoryData.activeChallenge?.active).toBe(false);
    expect(result.modifiedStoryData.activeChallenge?.result).toBe("won");
  });

  it("should use direct numbers (variables removed)", async () => {
    const challenge: SceneChallenge = {
      id: "test_challenge",
      name: "Athletic Challenge",
      description: "Test of strength",
      rounds: 3,
      currentSuccesses: 0,
      currentFailures: 0,
      active: true,
      createdAt: Date.now(),
    };
    const storyData = createMockStoryData({
      activeChallenge: challenge,
    });
    const toolCall = createToolCall("formula_challenge_check", {
      formula: "1d20+7", // Direct number instead of variable
      dc: 10,
      description: "Push through the barrier",
      display_name: "Athletics Check",
    });

    const result = await executeGMTools([toolCall], storyData);

    const checkResult = result.results[0].result as any;
    // Total should be 1-20 + 7 = 8-27
    expect(checkResult.total).toBeGreaterThanOrEqual(8);
    expect(checkResult.total).toBeLessThanOrEqual(27);
    expect(result.storyContext).toContain("Athletics Check");
  });
});

describe("Mixed GM Tools", () => {
  it("should handle multiple formula tool calls in sequence", async () => {
    const storyData = createMockStoryData();

    const toolCalls = [
      createToolCall("formula_roll", {
        formula: "1d20+3", // Direct numbers
        dc: 15,
        reason: "Break down the door",
      }),
      createToolCall("formula_roll", {
        formula: "1d20+2", // Direct numbers
        reason: "Tumble through",
      }),
    ];

    const result = await executeGMTools(toolCalls, storyData);

    expect(result.results).toHaveLength(2);
    expect(result.results[0].toolName).toBe("formula_roll");
    expect(result.results[1].toolName).toBe("formula_roll");
  });

  it("should work alongside legacy skill_check tool", async () => {
    const storyData = createMockStoryData({
      stats: [{ name: "Perception", value: 50, description: "", symbol: "👁️" }],
    });

    const toolCalls = [
      createToolCall("skill_check", {
        stat: "Perception",
        difficulty: "average",
        reason: "Spot the hidden door",
      }),
      createToolCall("formula_roll", {
        formula: "1d20+2", // Direct number
        dc: 12,
        reason: "Understand the mechanism",
      }),
    ];

    const result = await executeGMTools(toolCalls, storyData);

    expect(result.results).toHaveLength(2);
    expect(result.results[0].toolName).toBe("skill_check");
    expect(result.results[1].toolName).toBe("formula_roll");
  });
});
