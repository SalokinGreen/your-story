/**
 * Tests for combat invariants that used to be enforced only in English (tool
 * descriptions), not in code: HP-like stats clamp at 0 and auto-defeat the
 * combatant, and npc_roll is only valid for whoever's turn it currently is.
 */
import { describe, it, expect } from "vitest";
import { executeGMTools } from "@/app/misc/gmExecutor";
import { StoryData, CombatState, Combatant } from "@/app/misc/structs";

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

function combatant(overrides: Partial<Combatant>): Combatant {
  return {
    id: "c1",
    name: "Combatant",
    type: "enemy",
    stats: {},
    conditions: [],
    initiative: "10",
    isActive: true,
    ...overrides,
  } as Combatant;
}

function combatWith(combatants: Combatant[], currentTurnIndex = 0): CombatState {
  return {
    active: true,
    name: "Test Fight",
    round: 1,
    combatants,
    turnOrder: combatants.map((c) => c.id),
    currentTurnIndex,
    log: [],
  };
}

function createToolCall(name: string, args: Record<string, unknown>) {
  return {
    id: `test_${Math.random().toString(36).slice(2)}`,
    function: { name, arguments: JSON.stringify(args) },
  };
}

describe("update_combatant_stat - HP clamping and auto-defeat", () => {
  it("clamps HP to 0 instead of going negative", async () => {
    const goblin = combatant({ id: "g1", name: "Goblin", stats: { HP: 5 } });
    const storyData = createMockStoryData({ combatState: combatWith([goblin]) });

    const result = await executeGMTools(
      [
        createToolCall("update_combatant_stat", {
          combatant: "Goblin",
          stat: "HP",
          value: -20,
        }),
      ],
      storyData
    );

    const updated = result.modifiedStoryData.combatState!.combatants[0];
    expect(updated.stats.HP).toBe(0);
    expect(result.results[0].success).toBe(true);
  });

  it("auto-flags the combatant inactive when HP hits 0", async () => {
    const goblin = combatant({ id: "g1", name: "Goblin", stats: { HP: 5 } });
    const storyData = createMockStoryData({ combatState: combatWith([goblin]) });

    const result = await executeGMTools(
      [
        createToolCall("update_combatant_stat", {
          combatant: "Goblin",
          stat: "HP",
          value: -5,
        }),
      ],
      storyData
    );

    const updated = result.modifiedStoryData.combatState!.combatants[0];
    expect(updated.isActive).toBe(false);
  });

  it("does not clamp non-health stats below 0", async () => {
    const goblin = combatant({ id: "g1", name: "Goblin", stats: { HP: 5, Debt: 2 } });
    const storyData = createMockStoryData({ combatState: combatWith([goblin]) });

    const result = await executeGMTools(
      [
        createToolCall("update_combatant_stat", {
          combatant: "Goblin",
          stat: "Debt",
          value: -10,
        }),
      ],
      storyData
    );

    const updated = result.modifiedStoryData.combatState!.combatants[0];
    expect(updated.stats.Debt).toBe(-8);
    expect(updated.isActive).toBe(true);
  });

  it("allows an absolute (=N) set to also clamp and auto-defeat", async () => {
    const goblin = combatant({ id: "g1", name: "Goblin", stats: { HP: 5 } });
    const storyData = createMockStoryData({ combatState: combatWith([goblin]) });

    const result = await executeGMTools(
      [
        createToolCall("update_combatant_stat", {
          combatant: "Goblin",
          stat: "HP",
          value: "=-3",
        }),
      ],
      storyData
    );

    const updated = result.modifiedStoryData.combatState!.combatants[0];
    expect(updated.stats.HP).toBe(0);
    expect(updated.isActive).toBe(false);
  });
});

describe("npc_roll - turn ownership", () => {
  it("allows a roll for the combatant whose turn it currently is", async () => {
    const goblin = combatant({ id: "g1", name: "Goblin", stats: { HP: 10 } });
    const orc = combatant({ id: "o1", name: "Orc", stats: { HP: 10 } });
    const storyData = createMockStoryData({
      combatState: combatWith([goblin, orc], 0), // goblin's turn
    });

    const result = await executeGMTools(
      [
        createToolCall("npc_roll", {
          combatant: "Goblin",
          formula: "1d20+5",
          reason: "attack roll",
        }),
      ],
      storyData
    );

    expect(result.results[0].success).toBe(true);
  });

  it("rejects a roll for a combatant whose turn it is not", async () => {
    const goblin = combatant({ id: "g1", name: "Goblin", stats: { HP: 10 } });
    const orc = combatant({ id: "o1", name: "Orc", stats: { HP: 10 } });
    const storyData = createMockStoryData({
      combatState: combatWith([goblin, orc], 0), // goblin's turn, not orc's
    });

    const result = await executeGMTools(
      [
        createToolCall("npc_roll", {
          combatant: "Orc",
          formula: "1d20+5",
          reason: "attack roll",
        }),
      ],
      storyData
    );

    expect(result.results[0].success).toBe(false);
    expect(
      result.results[0].contextForStory ?? JSON.stringify(result.results[0])
    ).toContain("not");
  });

  it("allows repeated rolls for the same current-turn combatant (attack then damage)", async () => {
    const goblin = combatant({ id: "g1", name: "Goblin", stats: { HP: 10 } });
    const storyData = createMockStoryData({
      combatState: combatWith([goblin], 0),
    });

    const result = await executeGMTools(
      [
        createToolCall("npc_roll", {
          combatant: "Goblin",
          formula: "1d20+5",
          reason: "attack roll",
        }),
        createToolCall("npc_roll", {
          combatant: "Goblin",
          formula: "1d6+2",
          reason: "damage roll",
        }),
      ],
      storyData
    );

    expect(result.results[0].success).toBe(true);
    expect(result.results[1].success).toBe(true);
  });
});
