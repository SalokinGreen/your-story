/**
 * Tests for M2: the GM stage's per-round loop used to be able to complete
 * with zero roll/oracle tool calls even in gated scenes (combat/challenge/
 * self-declared high stakes), letting a stated success bypass the oracle
 * layer entirely. Covers the pure gate logic (isSceneGatedForRoll,
 * hasSatisfiedRollGate) directly, and the highStakesSceneKey signal
 * applyStakesEscalation writes for formula_roll/opposed_formula to read.
 */
import { describe, it, expect } from "vitest";
import {
  isSceneGatedForRoll,
  hasSatisfiedRollGate,
  applyTierEscalation,
  computeSceneKey,
  TOP_TIER,
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
    function: { name, arguments: JSON.stringify(args) },
  };
}

describe("isSceneGatedForRoll", () => {
  it("gates when combat is active", () => {
    const storyData = createMockStoryData({
      combatState: {
        active: true,
        combatants: [],
        turnOrder: [],
        currentTurnIndex: 0,
        round: 1,
      },
    });
    expect(isSceneGatedForRoll(storyData)).toBe(true);
  });

  it("gates when a challenge is active", () => {
    const storyData = createMockStoryData({
      activeChallenge: {
        id: "c1",
        name: "Chase",
        rounds: 5,
        currentSuccesses: 0,
        currentFailures: 0,
        active: true,
        createdAt: Date.now(),
      },
    });
    expect(isSceneGatedForRoll(storyData)).toBe(true);
  });

  it("gates when high-stakes was declared this scene", () => {
    const storyData = createMockStoryData();
    const sceneKey = computeSceneKey(storyData);
    storyData.reasoningTierState = {
      currentTier: 2,
      tier3CallsInScene: 0,
      highStakesSceneKey: sceneKey,
    };
    expect(isSceneGatedForRoll(storyData)).toBe(true);
  });

  it("does not gate on a stale highStakesSceneKey from a previous scene", () => {
    const storyData = createMockStoryData();
    storyData.reasoningTierState = {
      currentTier: 2,
      tier3CallsInScene: 0,
      highStakesSceneKey: "freeform:99", // not this scene's key
    };
    expect(isSceneGatedForRoll(storyData)).toBe(false);
  });

  it("does not gate a routine scene with no signals", () => {
    expect(isSceneGatedForRoll(createMockStoryData())).toBe(false);
  });
});

describe("hasSatisfiedRollGate", () => {
  it("is satisfied by a roll tool", () => {
    expect(hasSatisfiedRollGate(["formula_roll"])).toBe(true);
    expect(hasSatisfiedRollGate(["opposed_formula"])).toBe(true);
    expect(hasSatisfiedRollGate(["formula_challenge_check"])).toBe(true);
    expect(hasSatisfiedRollGate(["npc_roll"])).toBe(true);
  });

  it("is satisfied by the fate oracle", () => {
    expect(hasSatisfiedRollGate(["fate_question"])).toBe(true);
  });

  it("is not satisfied by unrelated tool calls", () => {
    expect(hasSatisfiedRollGate(["add_npc", "create_thread"])).toBe(false);
    expect(hasSatisfiedRollGate([])).toBe(false);
  });
});

describe("applyStakesEscalation writes highStakesSceneKey", () => {
  it("sets highStakesSceneKey on a high-stakes formula_roll", async () => {
    const storyData = createMockStoryData();
    const result = await executeGMTools(
      [
        createToolCall("formula_roll", {
          formula: "1d20+5",
          dc: 15,
          stakes: "high",
          reason: "Leap across the chasm",
        }),
      ],
      storyData
    );
    expect(result.modifiedStoryData.reasoningTierState?.highStakesSceneKey).toBe(
      computeSceneKey(storyData)
    );
  });

  it("does not set highStakesSceneKey for low/medium stakes", async () => {
    const storyData = createMockStoryData();
    const result = await executeGMTools(
      [
        createToolCall("formula_roll", {
          formula: "1d20+5",
          dc: 15,
          stakes: "low",
        }),
      ],
      storyData
    );
    expect(
      result.modifiedStoryData.reasoningTierState?.highStakesSceneKey
    ).toBeUndefined();
  });
});

describe("applyTierEscalation preserves highStakesSceneKey", () => {
  it("carries an existing highStakesSceneKey forward when escalating for an unrelated reason", () => {
    const storyData = createMockStoryData({
      reasoningTierState: {
        currentTier: 1,
        tier3CallsInScene: 0,
        highStakesSceneKey: "combat:Ambush",
      },
    });
    applyTierEscalation(storyData, TOP_TIER, "combat floor");
    expect(storyData.reasoningTierState?.highStakesSceneKey).toBe("combat:Ambush");
  });
});
