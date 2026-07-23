/**
 * Tests for the `get_game_state` GM tool - a read-only re-sync of the
 * CURRENT live *volatile* state (active challenge / combat / timers / goals /
 * threads) so the GM can see the effect of its own mid-turn mutations rather
 * than the stale turn-start snapshot. See executeGetGameState in gmExecutor.ts.
 */

import { describe, it, expect } from "vitest";
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
    goals: [],
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

describe("get_game_state tool", () => {
  it("reports no active state cleanly when nothing volatile is live", async () => {
    const storyData = createMockStoryData();
    const result = await executeGMTools(
      [createToolCall("get_game_state", {})],
      storyData
    );

    expect(result.results[0].success).toBe(true);
    const res = result.results[0].result as any;
    expect(res.type).toBe("get_game_state");
    expect(res.hasActiveState).toBe(false);
    expect(res.sections).toEqual([]);
    // Framed as normal, not an error, so the GM doesn't treat it as a failure.
    expect(result.storyContext).toContain("No active volatile state");
    expect(result.storyContext).not.toContain("ERROR");
  });

  it("renders an active challenge with win/lose thresholds", async () => {
    const storyData = createMockStoryData({
      activeChallenge: {
        id: "ch1",
        name: "Scaling the Cliff",
        rounds: 5,
        currentSuccesses: 2,
        currentFailures: 1,
        requiredSuccesses: 3,
        maxFailures: 3,
        active: true,
        createdAt: Date.now(),
      },
    });

    const result = await executeGMTools(
      [createToolCall("get_game_state", {})],
      storyData
    );

    const res = result.results[0].result as any;
    expect(res.hasActiveState).toBe(true);
    expect(res.sections).toContain("challenge");
    expect(result.storyContext).toContain("Scaling the Cliff");
    expect(result.storyContext).toContain("2/3");
    expect(result.storyContext).toContain("1/3");
  });

  it("renders combat with round, current-turn marker, stats and conditions", async () => {
    const storyData = createMockStoryData({
      combatState: {
        active: true,
        name: "Tavern Brawl",
        round: 3,
        currentTurnIndex: 1,
        turnOrder: ["p1", "g1"],
        combatants: [
          {
            id: "p1",
            name: "Hero",
            type: "player",
            stats: { HP: 18, Armor: 14 },
            conditions: [],
            initiative: "1d20+3",
            isActive: true,
          },
          {
            id: "g1",
            name: "Goblin",
            type: "enemy",
            stats: { HP: 5 },
            conditions: [{ name: "Stunned", duration: 1 }],
            initiative: "1d20+1",
            isActive: true,
          },
        ],
      },
    });

    const result = await executeGMTools(
      [createToolCall("get_game_state", {})],
      storyData
    );

    const res = result.results[0].result as any;
    expect(res.sections).toContain("combat");
    const ctx = result.storyContext;
    expect(ctx).toContain("Round 3");
    expect(ctx).toContain("HP 18");
    expect(ctx).toContain("Stunned (1)");
    // The current turn is index 1 (Goblin) - the marker precedes it, not Hero.
    expect(ctx).toContain("▶ Goblin");
    expect(ctx).not.toContain("▶ Hero");
  });

  it("honors the sections filter and excludes unrequested live state", async () => {
    const storyData = createMockStoryData({
      activeChallenge: {
        id: "ch1",
        name: "Scaling the Cliff",
        rounds: 3,
        currentSuccesses: 1,
        currentFailures: 0,
        active: true,
        createdAt: Date.now(),
      },
      timers: [
        {
          id: "t1",
          name: "Ritual Completion",
          totalTicks: 6,
          currentTicks: 2,
          autoAdvance: true,
          status: "active",
          visibility: "visible",
          createdAt: Date.now(),
        },
      ],
    });

    const result = await executeGMTools(
      [createToolCall("get_game_state", { sections: ["timers"] })],
      storyData
    );

    const res = result.results[0].result as any;
    expect(res.sections).toEqual(["timers"]);
    expect(result.storyContext).toContain("Ritual Completion");
    expect(result.storyContext).toContain("2/6");
    // Challenge is live but wasn't requested, so it must not appear.
    expect(result.storyContext).not.toContain("Scaling the Cliff");
  });

  it("filters goals to active + unfulfilled only", async () => {
    const storyData = createMockStoryData({
      goals: [
        {
          id: "g1",
          title: "Find the amulet",
          shortDescription: "Recover it from the crypt",
          description: "full",
          active: true,
          fulfilled: false,
        },
        {
          id: "g2",
          title: "Already done",
          shortDescription: "done",
          description: "full",
          active: true,
          fulfilled: true,
        },
        {
          id: "g3",
          title: "Inactive goal",
          shortDescription: "hidden",
          description: "full",
          active: false,
          fulfilled: false,
        },
      ],
    });

    const result = await executeGMTools(
      [createToolCall("get_game_state", { sections: ["goals"] })],
      storyData
    );

    const ctx = result.storyContext;
    expect(ctx).toContain("Find the amulet");
    expect(ctx).not.toContain("Already done");
    expect(ctx).not.toContain("Inactive goal");
  });
});
