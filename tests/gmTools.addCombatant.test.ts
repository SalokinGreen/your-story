/**
 * Tests for the unified add_combatant GM tool, which now handles both the
 * single-combatant form and the batch (`combatants: [...]`) form that
 * previously lived on a separate add_multiple_combatants tool. That tool was
 * never actually exposed to the live GM stage (missing from
 * ai_staged.ts's legacyToolNames whitelist), so this merge also fixes that
 * gap rather than removing working functionality.
 */
import { describe, it, expect } from "vitest";
import { executeGMTools } from "@/app/misc/gmExecutor";
import { StoryData, CombatState } from "@/app/misc/structs";

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

function activeCombat(): CombatState {
  return {
    active: true,
    name: "Test Fight",
    round: 1,
    combatants: [],
    turnOrder: [],
    currentTurnIndex: 0,
    log: [],
  } as unknown as CombatState;
}

function createToolCall(name: string, args: Record<string, unknown>) {
  return {
    id: `test_${Math.random().toString(36).slice(2)}`,
    function: { name, arguments: JSON.stringify(args) },
  };
}

describe("add_combatant (unified single/batch)", () => {
  it("adds a single combatant using the single-combatant form", async () => {
    const storyData = createMockStoryData({ combatState: activeCombat() });
    const result = await executeGMTools(
      [
        createToolCall("add_combatant", {
          name: "Goblin",
          type: "enemy",
          stats: { HP: 10 },
          initiative: "5",
        }),
      ],
      storyData
    );

    expect(result.results[0].success).toBe(true);
    expect(result.results[0].toolName).toBe("add_combatant");
    expect(result.modifiedStoryData.combatState!.combatants).toHaveLength(1);
    expect(result.modifiedStoryData.combatState!.combatants[0].name).toBe("Goblin");
  });

  it("adds multiple combatants using the batch form", async () => {
    const storyData = createMockStoryData({ combatState: activeCombat() });
    const result = await executeGMTools(
      [
        createToolCall("add_combatant", {
          combatants: [
            { name: "Wolf", type: "enemy", stats: { HP: 20 }, initiative: "3" },
            { name: "Wolf", type: "enemy", stats: { HP: 20 }, initiative: "4" },
          ],
        }),
      ],
      storyData
    );

    expect(result.results[0].success).toBe(true);
    expect(result.results[0].toolName).toBe("add_combatant");
    expect(result.modifiedStoryData.combatState!.combatants).toHaveLength(2);
    // Duplicate name within the same batch gets auto-suffixed
    const names = result.modifiedStoryData.combatState!.combatants.map((c) => c.name);
    expect(names).toContain("Wolf");
    expect(names).toContain("Wolf B");
  });

  it("prefers the batch form when both forms are somehow provided", async () => {
    const storyData = createMockStoryData({ combatState: activeCombat() });
    const result = await executeGMTools(
      [
        createToolCall("add_combatant", {
          name: "Ignored Single Form",
          type: "enemy",
          stats: { HP: 1 },
          initiative: "1",
          combatants: [
            { name: "Batch Combatant", type: "enemy", stats: { HP: 5 }, initiative: "2" },
          ],
        }),
      ],
      storyData
    );

    expect(result.modifiedStoryData.combatState!.combatants).toHaveLength(1);
    expect(result.modifiedStoryData.combatState!.combatants[0].name).toBe("Batch Combatant");
  });

  it("errors clearly when neither form is fully provided", async () => {
    const storyData = createMockStoryData({ combatState: activeCombat() });
    const result = await executeGMTools(
      [createToolCall("add_combatant", { name: "Missing other fields" })],
      storyData
    );

    expect(result.results[0].success).toBe(false);
    expect(result.results[0].contextForStory).toContain(
      "requires either single-combatant fields"
    );
  });

  it("errors when there is no active combat", async () => {
    const storyData = createMockStoryData();
    const result = await executeGMTools(
      [
        createToolCall("add_combatant", {
          name: "Goblin",
          type: "enemy",
          stats: { HP: 10 },
          initiative: "5",
        }),
      ],
      storyData
    );

    expect(result.results[0].success).toBe(false);
    expect(result.results[0].contextForStory).toContain("No active combat");
  });
});
