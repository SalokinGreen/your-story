/**
 * Tests for the dice/check GM tools: formula_roll, opposed_formula,
 * record_challenge_result, and calculate's comparison mode.
 *
 * The theme running through these: **the dice tools report, they don't
 * judge.** None of them takes a DC any more, so a roll comes back as numbers
 * and `calculate` is what turns those numbers into TRUE/FALSE. That split is
 * what lets a system roll dissimilar pools against each other (Starforged's
 * 1d6 action die vs 2d10 challenge dice) instead of being forced through one
 * "beat this target number" shape.
 */

import { describe, it, expect } from "vitest";
import {
  executeGMTools,
  DiceThrowRequest,
  GMFormulaRollResult,
  GMOpposedFormulaResult,
  GMCalculateResult,
  GMChallengeResultRecord,
} from "@/app/misc/gmExecutor";
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

function activeChallenge(
  overrides: Partial<SceneChallenge> = {}
): SceneChallenge {
  return {
    id: "test_challenge",
    name: "Rooftop Chase",
    description: "Chasing the thief across rooftops",
    rounds: 5,
    currentSuccesses: 0,
    currentFailures: 0,
    active: true,
    createdAt: Date.now(),
    ...overrides,
  };
}

describe("Formula Roll Tool", () => {
  it("should roll a simple formula without variables", async () => {
    const storyData = createMockStoryData();
    const toolCall = createToolCall("formula_roll", {
      formulas: ["1d20+5"],
      reason: "Testing basic roll",
    });

    const result = await executeGMTools([toolCall], storyData);

    expect(result.results).toHaveLength(1);
    expect(result.results[0].toolName).toBe("formula_roll");
    expect(result.results[0].success).toBe(true);

    const rollResult = result.results[0].result as GMFormulaRollResult;
    expect(rollResult.type).toBe("formula_roll");
    expect(rollResult.pools).toHaveLength(1);
    expect(rollResult.pools[0].formula).toBe("1d20+5");
    expect(rollResult.pools[0].total).toBeGreaterThanOrEqual(6); // 1+5
    expect(rollResult.pools[0].total).toBeLessThanOrEqual(25); // 20+5
    expect(rollResult.pools[0].rolls).toHaveLength(1);
  });

  it("reports numbers without a verdict, and says so", async () => {
    const storyData = createMockStoryData();
    const toolCall = createToolCall("formula_roll", {
      formulas: ["1d20+10"],
      reason: "Testing that no DC is applied",
    });

    const result = await executeGMTools([toolCall], storyData);

    // Nothing on the result claims a pass/fail - that's calculate's job now.
    const rollResult = result.results[0].result as GMFormulaRollResult;
    expect(rollResult).not.toHaveProperty("dc");
    expect(rollResult).not.toHaveProperty("success");
    expect(rollResult).not.toHaveProperty("margin");
    expect(result.storyContext).not.toContain("SUCCESS");
    expect(result.storyContext).not.toContain("FAILURE");
    expect(result.storyContext).toContain("calculate");
  });

  it("ignores a dc the model passes out of habit rather than judging with it", async () => {
    const storyData = createMockStoryData();
    const toolCall = createToolCall("formula_roll", {
      formulas: ["1d20"],
      dc: 100, // no longer part of the schema
      reason: "Stale DC parameter",
    });

    const result = await executeGMTools([toolCall], storyData);

    expect(result.results[0].success).toBe(true);
    expect(result.storyContext).not.toContain("FAILURE");
    expect(result.storyContext).not.toContain("DC 100");
  });

  it("still accepts the older singular `formula` string", async () => {
    const storyData = createMockStoryData();
    const toolCall = createToolCall("formula_roll", {
      formula: "1d20+5",
      reason: "Model drifted back to the old shape",
    });

    const result = await executeGMTools([toolCall], storyData);

    const rollResult = result.results[0].result as GMFormulaRollResult;
    expect(rollResult.pools).toHaveLength(1);
    expect(rollResult.pools[0].formula).toBe("1d20+5");
  });

  it("errors when no formula is given at all", async () => {
    const storyData = createMockStoryData();
    const toolCall = createToolCall("formula_roll", {
      reason: "Forgot the dice",
    });

    const result = await executeGMTools([toolCall], storyData);

    expect(result.results[0].success).toBe(false);
    expect(result.storyContext).toContain("ERROR");
  });

  it("should roll with direct numbers (variables removed)", async () => {
    // Variable substitution has been removed - GM must provide actual numbers
    const storyData = createMockStoryData();
    const toolCall = createToolCall("formula_roll", {
      formulas: ["1d20+4+3"], // Direct numbers instead of variables
      reason: "Testing direct number roll",
    });

    const result = await executeGMTools([toolCall], storyData);

    const rollResult = result.results[0].result as GMFormulaRollResult;
    // Total should be 1-20 + 4 + 3 = 8-27
    expect(rollResult.pools[0].total).toBeGreaterThanOrEqual(8);
    expect(rollResult.pools[0].total).toBeLessThanOrEqual(27);
  });

  it("should error when using variable syntax (variables removed)", async () => {
    // Variable substitution has been removed - {{var}} syntax should fail
    const storyData = createMockStoryData();
    const toolCall = createToolCall("formula_roll", {
      formulas: ["1d20+{{Strength_mod}}+{{proficiency}}"],
      reason: "Testing that variables cause error",
    });

    const result = await executeGMTools([toolCall], storyData);

    expect(result.results[0].success).toBe(false);
    expect(result.storyContext).toContain("ERROR");
  });

  it("echoes both consequence branches, since it doesn't know which one landed", async () => {
    const storyData = createMockStoryData();
    const toolCall = createToolCall("formula_roll", {
      formulas: ["1d20"],
      reason: "Testing consequences",
      stakes: "high",
      consequences: {
        success: "You succeed gloriously",
        failure: "You fail miserably",
      },
    });

    const result = await executeGMTools([toolCall], storyData);

    expect(result.storyContext).toContain("Stakes: high");
    expect(result.storyContext).toContain("You succeed gloriously");
    expect(result.storyContext).toContain("You fail miserably");
  });

  it("should handle invalid formulas gracefully", async () => {
    const storyData = createMockStoryData();
    const toolCall = createToolCall("formula_roll", {
      formulas: ["invalid formula!!!"],
      reason: "Testing error handling",
    });

    const result = await executeGMTools([toolCall], storyData);

    expect(result.results[0].success).toBe(false);
    expect(result.storyContext).toContain("ERROR");
  });
});

describe("Formula Roll Tool - independent pools", () => {
  it("keeps each pool's total separate instead of summing them", async () => {
    const storyData = createMockStoryData();
    const toolCall = createToolCall("formula_roll", {
      formulas: ["1d6+2", "2d10"],
      labels: ["action score", "challenge dice"],
      reason: "Starforged action roll",
    });

    const result = await executeGMTools([toolCall], storyData);

    const rollResult = result.results[0].result as GMFormulaRollResult;
    expect(rollResult.pools).toHaveLength(2);

    const [action, challenge] = rollResult.pools;
    expect(action.label).toBe("action score");
    expect(action.total).toBeGreaterThanOrEqual(3); // 1+2
    expect(action.total).toBeLessThanOrEqual(8); // 6+2
    expect(challenge.label).toBe("challenge dice");
    expect(challenge.total).toBeGreaterThanOrEqual(2); // 1+1
    expect(challenge.total).toBeLessThanOrEqual(20); // 10+10

    // The context has to make the separation obvious - a single merged total
    // is exactly the confusion this replaced.
    expect(result.storyContext).toContain("NOT added together");
    expect(result.storyContext).toContain("action score");
    expect(result.storyContext).toContain("challenge dice");
  });

  it("throws every pool's dice in a single physical throw", async () => {
    const storyData = createMockStoryData();
    const toolCall = createToolCall("formula_roll", {
      formulas: ["1d6+2", "2d10"],
      reason: "Starforged action roll",
    });

    const seen: DiceThrowRequest[] = [];
    const result = await executeGMTools([toolCall], storyData, {}, {
      requestDiceThrow: async (request) => {
        seen.push(request);
        return [[4], [6, 8]];
      },
    });

    // One request, carrying both pools - not one tray after another.
    expect(seen).toHaveLength(1);
    expect(seen[0].groups).toEqual([
      { sides: 6, count: 1 },
      { sides: 10, count: 2 },
    ]);

    const rollResult = result.results[0].result as GMFormulaRollResult;
    expect(rollResult.pools[0].total).toBe(6); // 4 + 2
    expect(rollResult.pools[1].total).toBe(14); // 6 + 8
  });
});

describe("Calculate Tool - comparisons", () => {
  it("answers a roll-against-target comparison with TRUE", async () => {
    const storyData = createMockStoryData();
    const toolCall = createToolCall("calculate", {
      expression: "17+3 >= 15",
      reason: "Did the climb check beat the DC",
    });

    const result = await executeGMTools([toolCall], storyData);

    expect(result.results[0].success).toBe(true);
    const calc = result.results[0].result as GMCalculateResult;
    expect(calc.comparison).toEqual({
      operator: ">=",
      left: 20,
      right: 15,
      isTrue: true,
    });
    expect(result.storyContext).toContain("TRUE");
  });

  it("answers a failed comparison with FALSE, and marks the check as not passed", async () => {
    const storyData = createMockStoryData();
    const toolCall = createToolCall("calculate", {
      expression: "4+2 > 6",
      reason: "Action score against the higher challenge die",
    });

    const result = await executeGMTools([toolCall], storyData);

    // success carries the verdict, the same way the dice tools' DCs used to -
    // a FALSE comparison is an answer, not a broken tool call.
    expect(result.results[0].success).toBe(false);
    const calc = result.results[0].result as GMCalculateResult;
    expect(calc.comparison?.isTrue).toBe(false);
    expect(result.storyContext).toContain("FALSE");
    expect(result.storyContext).not.toContain("ERROR");
  });

  it("resolves the two halves of a Starforged action roll independently", async () => {
    const storyData = createMockStoryData();
    // Action score 6 against challenge dice 4 and 6: beats one, not the
    // other - a weak hit. Neither call needs a DC anywhere.
    const beatsFirst = createToolCall("calculate", {
      expression: "4+2 > 4",
      reason: "vs first challenge die",
    });
    const beatsSecond = createToolCall("calculate", {
      expression: "4+2 > 6",
      reason: "vs second challenge die",
    });

    const result = await executeGMTools([beatsFirst, beatsSecond], storyData);

    const first = result.results[0].result as GMCalculateResult;
    const second = result.results[1].result as GMCalculateResult;
    expect(first.comparison?.isTrue).toBe(true);
    expect(second.comparison?.isTrue).toBe(false);
  });

  it("supports roll-under systems through the same comparison", async () => {
    const storyData = createMockStoryData();
    const toolCall = createToolCall("calculate", {
      expression: "38 <= 55",
      reason: "Roll-under skill check",
    });

    const result = await executeGMTools([toolCall], storyData);

    expect(result.results[0].success).toBe(true);
    const calc = result.results[0].result as GMCalculateResult;
    expect(calc.comparison?.operator).toBe("<=");
  });

  it("supports every comparison operator", async () => {
    const storyData = createMockStoryData();
    const cases: [string, boolean][] = [
      ["5 > 3", true],
      ["5 < 3", false],
      ["5 >= 5", true],
      ["5 <= 4", false],
      ["5 == 5", true],
      ["5 != 5", false],
    ];

    for (const [expression, expected] of cases) {
      const result = await executeGMTools(
        [createToolCall("calculate", { expression, reason: "operator check" })],
        storyData
      );
      const calc = result.results[0].result as GMCalculateResult;
      expect(calc.comparison?.isTrue, expression).toBe(expected);
    }
  });

  it("still evaluates plain arithmetic with no comparison", async () => {
    const storyData = createMockStoryData();
    const toolCall = createToolCall("calculate", {
      expression: "20 - 4",
      reason: "Damage after resistance",
    });

    const result = await executeGMTools([toolCall], storyData);

    const calc = result.results[0].result as GMCalculateResult;
    expect(calc.result).toBe(16);
    expect(calc.comparison).toBeUndefined();
  });

  it("errors on a comparison it can't evaluate rather than guessing", async () => {
    const storyData = createMockStoryData();
    const toolCall = createToolCall("calculate", {
      expression: "their perception > my stealth",
      reason: "Words, not numbers",
    });

    const result = await executeGMTools([toolCall], storyData);

    expect(result.results[0].success).toBe(false);
    expect(result.storyContext).toContain("ERROR");
  });
});

describe("Opposed Formula Tool", () => {
  it("rolls both sides and reports both totals without picking a winner", async () => {
    const storyData = createMockStoryData();
    const toolCall = createToolCall("opposed_formula", {
      player_formula: "1d20+8",
      opponent_formula: "1d20+5",
      opponent_name: "Guard",
      reason: "Sneaking past the guard",
    });

    const result = await executeGMTools([toolCall], storyData);

    expect(result.results).toHaveLength(1);
    const oppResult = result.results[0].result as GMOpposedFormulaResult;
    expect(oppResult.type).toBe("opposed_formula");
    expect(oppResult.playerFormula).toBe("1d20+8");
    expect(oppResult.opponentName).toBe("Guard");
    expect(oppResult.playerTotal).toBeGreaterThanOrEqual(9);
    expect(oppResult.opponentTotal).toBeGreaterThanOrEqual(6);
    // "Higher total wins" isn't universal, so the engine no longer asserts it.
    expect(oppResult).not.toHaveProperty("winner");
    expect(result.storyContext).not.toContain("Winner:");
    expect(result.storyContext).toContain("calculate");
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
  });

  it("echoes every consequence branch for the GM to pick from", async () => {
    const storyData = createMockStoryData();
    const toolCall = createToolCall("opposed_formula", {
      player_formula: "1d20+100",
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

    expect(result.storyContext).toContain("You slam their arm down");
    expect(result.storyContext).toContain("They beat you somehow");
    expect(result.storyContext).toContain("A perfect standoff");
  });

  it("only rolls the player's side physically, not the opponent's", async () => {
    const storyData = createMockStoryData();
    const toolCall = createToolCall("opposed_formula", {
      player_formula: "1d20+5",
      opponent_formula: "1d20+2",
      opponent_name: "Guard",
      reason: "Grapple contest",
    });

    const seen: DiceThrowRequest[] = [];
    const result = await executeGMTools([toolCall], storyData, {}, {
      requestDiceThrow: async (request) => {
        seen.push(request);
        return [[17]]; // only ever called for the player's d20
      },
    });

    expect(seen).toHaveLength(1);
    expect(seen[0].formula).toBe("1d20+5");

    const opposedResult = result.results[0].result as GMOpposedFormulaResult;
    expect(opposedResult.playerTotal).toBe(22); // 17 + 5, from the throw
    expect(opposedResult.opponentTotal).toBeGreaterThanOrEqual(3); // 1+2, digital
    expect(opposedResult.opponentTotal).toBeLessThanOrEqual(22); // 20+2, digital
  });
});

describe("Record Challenge Result Tool", () => {
  it("should fail if no active challenge", async () => {
    const storyData = createMockStoryData();
    const toolCall = createToolCall("record_challenge_result", {
      outcome: "success",
      description: "Vault over the gap",
    });

    const result = await executeGMTools([toolCall], storyData);

    expect(result.results[0].success).toBe(false);
    expect(result.storyContext).toContain("ERROR");
    expect(result.storyContext).toContain("No active challenge");
  });

  it("should update challenge progress on success", async () => {
    const storyData = createMockStoryData({
      activeChallenge: activeChallenge({ currentSuccesses: 1 }),
    });
    const toolCall = createToolCall("record_challenge_result", {
      outcome: "success",
      description: "Leap to the next building",
    });

    const result = await executeGMTools([toolCall], storyData);

    expect(result.results[0].success).toBe(true);
    const record = result.results[0].result as GMChallengeResultRecord;
    expect(record.challengeProgress?.successes).toBe(2);
    expect(record.challengeProgress?.failures).toBe(0);
    // Modified storyData should reflect the change
    expect(result.modifiedStoryData.activeChallenge?.currentSuccesses).toBe(2);
  });

  it("should update challenge progress on failure", async () => {
    const storyData = createMockStoryData({
      activeChallenge: activeChallenge({ currentFailures: 1 }),
    });
    const toolCall = createToolCall("record_challenge_result", {
      outcome: "failure",
      description: "Try the impossible jump",
    });

    const result = await executeGMTools([toolCall], storyData);

    expect(result.results[0].success).toBe(false);
    const record = result.results[0].result as GMChallengeResultRecord;
    expect(record.challengeProgress?.failures).toBe(2);
    expect(result.modifiedStoryData.activeChallenge?.currentFailures).toBe(2);
  });

  it("should resolve challenge when majority reached", async () => {
    const storyData = createMockStoryData({
      activeChallenge: activeChallenge({
        name: "Final Showdown",
        rounds: 5, // Need 3 to win
        currentSuccesses: 2, // One more for victory
      }),
    });
    const toolCall = createToolCall("record_challenge_result", {
      outcome: "success",
      description: "Land the finishing blow",
    });

    const result = await executeGMTools([toolCall], storyData);

    const record = result.results[0].result as GMChallengeResultRecord;
    expect(record.challengeProgress?.completed).toBe(true);
    expect(record.challengeProgress?.won).toBe(true);
    expect(result.storyContext).toContain("Challenge WON");
    expect(result.modifiedStoryData.activeChallenge?.active).toBe(false);
    expect(result.modifiedStoryData.activeChallenge?.result).toBe("won");
  });

  it("honors the asymmetric thresholds declared at start_challenge time", async () => {
    const storyData = createMockStoryData({
      activeChallenge: activeChallenge({
        rounds: 5,
        requiredSuccesses: 3,
        maxFailures: 5,
        currentFailures: 4, // one short of the declared max, not the majority
      }),
    });
    const toolCall = createToolCall("record_challenge_result", {
      outcome: "failure",
      description: "Slip on the tiles",
    });

    const result = await executeGMTools([toolCall], storyData);

    const record = result.results[0].result as GMChallengeResultRecord;
    expect(record.challengeProgress?.completed).toBe(true);
    expect(record.challengeProgress?.won).toBe(false);
    expect(result.modifiedStoryData.activeChallenge?.result).toBe("lost");
  });

  it("rolls no dice of its own", async () => {
    const storyData = createMockStoryData({
      activeChallenge: activeChallenge(),
    });
    const toolCall = createToolCall("record_challenge_result", {
      outcome: "success",
      description: "Push through the barrier",
    });

    const seen: DiceThrowRequest[] = [];
    await executeGMTools([toolCall], storyData, {}, {
      requestDiceThrow: async (request) => {
        seen.push(request);
        return [[6]];
      },
    });

    expect(seen).toHaveLength(0);
  });
});

describe("Mixed GM Tools", () => {
  it("should handle multiple formula tool calls in sequence", async () => {
    const storyData = createMockStoryData();

    const toolCalls = [
      createToolCall("formula_roll", {
        formulas: ["1d20+3"],
        reason: "Break down the door",
      }),
      createToolCall("formula_roll", {
        formulas: ["1d20+2"],
        reason: "Tumble through",
      }),
    ];

    const result = await executeGMTools(toolCalls, storyData);

    expect(result.results).toHaveLength(2);
    expect(result.results[0].toolName).toBe("formula_roll");
    expect(result.results[1].toolName).toBe("formula_roll");
  });
});

describe("Physical Dice (requestDiceThrow)", () => {
  it("uses the thrown face values instead of Math.random when requestDiceThrow is wired up", async () => {
    const storyData = createMockStoryData();
    const toolCall = createToolCall("formula_roll", {
      formulas: ["1d20+5"],
      reason: "Climb the wall",
    });

    const seen: DiceThrowRequest[] = [];
    const result = await executeGMTools([toolCall], storyData, {}, {
      requestDiceThrow: async (request) => {
        seen.push(request);
        return [[17]];
      },
    });

    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({
      groups: [{ sides: 20, count: 1 }],
      formula: "1d20+5",
    });

    const rollResult = result.results[0].result as GMFormulaRollResult;
    expect(rollResult.pools[0].total).toBe(22); // 17 + 5
  });

  it("asks for every group in a multi-group formula at once", async () => {
    const storyData = createMockStoryData();
    const toolCall = createToolCall("formula_roll", {
      formulas: ["2d6+1d4"],
      reason: "Damage with a bonus die",
    });

    const seen: DiceThrowRequest[] = [];
    const result = await executeGMTools([toolCall], storyData, {}, {
      requestDiceThrow: async (request) => {
        seen.push(request);
        return [[3, 5], [2]];
      },
    });

    expect(seen).toHaveLength(1);
    expect(seen[0].groups).toEqual([
      { sides: 6, count: 2 },
      { sides: 4, count: 1 },
    ]);

    const rollResult = result.results[0].result as GMFormulaRollResult;
    expect(rollResult.pools[0].total).toBe(10); // 3 + 5 + 2
  });

  it("falls back to a fully digital roll when the player skips the physical throw", async () => {
    const storyData = createMockStoryData();
    const toolCall = createToolCall("formula_roll", {
      formulas: ["1d20+5"],
      reason: "Climb the wall",
    });

    const result = await executeGMTools([toolCall], storyData, {}, {
      requestDiceThrow: async () => null, // player skipped
    });

    expect(result.results[0].success).toBe(true);
    const rollResult = result.results[0].result as GMFormulaRollResult;
    expect(rollResult.pools[0].total).toBeGreaterThanOrEqual(6); // 1+5
    expect(rollResult.pools[0].total).toBeLessThanOrEqual(25); // 20+5
  });

  it("rerolls every pool digitally when a skip lands partway through", async () => {
    const storyData = createMockStoryData();
    const toolCall = createToolCall("formula_roll", {
      formulas: ["1d6!"], // exploding, so a second request can happen
      reason: "Exploding die",
    });

    let call = 0;
    const result = await executeGMTools([toolCall], storyData, {}, {
      requestDiceThrow: async () => {
        call++;
        return call === 1 ? [[6]] : null; // skipped the explosion die
      },
    });

    // Half-physical/half-digital would be worse than either, so the whole
    // formula is rerolled in code - never left with the thrown 6 stranded.
    expect(result.results[0].success).toBe(true);
    const rollResult = result.results[0].result as GMFormulaRollResult;
    expect(rollResult.pools[0].total).toBeGreaterThanOrEqual(1);
  });

  it("behaves exactly like the digital path when requestDiceThrow isn't provided", async () => {
    const storyData = createMockStoryData();
    const toolCall = createToolCall("formula_roll", {
      formulas: ["1d20+5"],
      reason: "Climb the wall",
    });

    const result = await executeGMTools([toolCall], storyData);
    const rollResult = result.results[0].result as GMFormulaRollResult;
    expect(rollResult.pools[0].total).toBeGreaterThanOrEqual(6);
    expect(rollResult.pools[0].total).toBeLessThanOrEqual(25);
  });
});
