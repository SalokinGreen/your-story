/**
 * Tests for the `calculate` GM tool, specifically the dice-count/sides bound
 * on its embedded "NdM" dice parser. This parser rolls dice itself instead
 * of going through diceFormula.ts, so it previously had no cap at all on
 * model-supplied count/sides - the same DoS shape diceFormula.ts's
 * MAX_DICE_COUNT/MAX_DICE_SIDES bound was built to close, reachable again
 * through this second, unguarded path.
 */

import { describe, it, expect } from "vitest";
import { executeGMTools } from "@/app/misc/gmExecutor";
import { StoryData } from "@/app/misc/structs";
import { MAX_DICE_COUNT, MAX_DICE_SIDES } from "@/app/misc/diceFormula";

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

describe("calculate tool dice bound", () => {
  it("evaluates a normal expression with a small dice roll", async () => {
    const storyData = createMockStoryData();
    const toolCall = createToolCall("calculate", {
      expression: "50 + 2d6",
      reason: "Damage calculation",
    });

    const result = await executeGMTools([toolCall], storyData);

    expect(result.results[0].success).toBe(true);
    const calcResult = result.results[0].result as any;
    expect(calcResult.result).toBeGreaterThanOrEqual(52); // 50 + 2*1
    expect(calcResult.result).toBeLessThanOrEqual(62); // 50 + 2*6
  });

  it("rejects a dice count above MAX_DICE_COUNT", async () => {
    const storyData = createMockStoryData();
    const toolCall = createToolCall("calculate", {
      expression: `${MAX_DICE_COUNT + 1}d6`,
      reason: "Testing the bound",
    });

    const result = await executeGMTools([toolCall], storyData);

    expect(result.results[0].success).toBe(false);
    expect(result.storyContext).toContain("ERROR");
    expect(result.storyContext).toContain("Invalid dice");
  });

  it("rejects dice sides above MAX_DICE_SIDES", async () => {
    const storyData = createMockStoryData();
    const toolCall = createToolCall("calculate", {
      expression: `1d${MAX_DICE_SIDES + 1}`,
      reason: "Testing the bound",
    });

    const result = await executeGMTools([toolCall], storyData);

    expect(result.results[0].success).toBe(false);
    expect(result.storyContext).toContain("ERROR");
  });

  it("accepts dice at exactly the bound", async () => {
    const storyData = createMockStoryData();
    const toolCall = createToolCall("calculate", {
      expression: `1d${MAX_DICE_SIDES}`,
      reason: "Testing the exact bound",
    });

    const result = await executeGMTools([toolCall], storyData);

    expect(result.results[0].success).toBe(true);
  });
});
