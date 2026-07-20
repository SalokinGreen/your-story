/**
 * Tests for the reaction_check GM tool - a GURPS Reaction Table style
 * deterministic disposition roll for incidental NPCs (see §2.1 in
 * docs/research-paper-ttrpg-theory-gap-analysis.md). Exists to take the
 * "does this NPC yield to the player" decision away from the model, so
 * these tests pin down the exact 3d6 + bias + modifiers -> category
 * mapping rather than just checking success/failure.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
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

function mockRandom(value: number) {
  vi.spyOn(Math, "random").mockReturnValue(value);
}

describe("reaction_check tool", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rolls 3d6, applies neutral bias by default, and categorizes Neutral at the midpoint", async () => {
    // Math.random -> 0.5 makes each d6 roll floor(0.5*6)+1 = 4, so 3d6 = 12
    mockRandom(0.5);
    const storyData = createMockStoryData();
    const toolCall = createToolCall("reaction_check", {
      npc_name: "the gate guard",
      reason: "player tries to talk their way past the checkpoint",
    });

    const result = await executeGMTools([toolCall], storyData);
    const reactionResult = result.results[0].result as any;

    expect(result.results[0].toolName).toBe("reaction_check");
    expect(result.results[0].success).toBe(true);
    expect(reactionResult.type).toBe("reaction_check");
    expect(reactionResult.rolls).toEqual([4, 4, 4]);
    expect(reactionResult.bias).toBe("neutral");
    expect(reactionResult.total).toBe(12); // 12 + bias(0) + modifiers(0)
    expect(reactionResult.category).toBe("Neutral");
  });

  it("applies a hostile bias as a negative modifier, pushing a mid roll into Bad/Very Bad territory", async () => {
    mockRandom(0.5); // 3d6 = 12
    const storyData = createMockStoryData();
    const toolCall = createToolCall("reaction_check", {
      npc_name: "Duke Ashford",
      bias: "hostile",
      reason: "player, a known thief, requests an audience",
    });

    const result = await executeGMTools([toolCall], storyData);
    const reactionResult = result.results[0].result as any;

    expect(reactionResult.total).toBe(8); // 12 + hostile(-4) + modifiers(0)
    expect(reactionResult.category).toBe("Poor");
  });

  it("applies a favorable bias and positive modifiers, reaching Excellent", async () => {
    mockRandom(0.99); // each d6 = 6, 3d6 = 18
    const storyData = createMockStoryData();
    const toolCall = createToolCall("reaction_check", {
      npc_name: "an old friend",
      bias: "favorable",
      modifiers: 2,
      reason: "player asks an old ally for help",
    });

    const result = await executeGMTools([toolCall], storyData);
    const reactionResult = result.results[0].result as any;

    expect(reactionResult.total).toBe(24); // 18 + favorable(4) + modifiers(2)
    expect(reactionResult.category).toBe("Excellent");
  });

  it("reaches Disastrous at the bottom of the table", async () => {
    mockRandom(0); // each d6 = 1, 3d6 = 3
    const storyData = createMockStoryData();
    const toolCall = createToolCall("reaction_check", {
      npc_name: "a sworn enemy",
      bias: "hostile",
      modifiers: -1,
      reason: "player begs their sworn enemy for mercy",
    });

    const result = await executeGMTools([toolCall], storyData);
    const reactionResult = result.results[0].result as any;

    expect(reactionResult.total).toBe(-2); // 3 + hostile(-4) + modifiers(-1)
    expect(reactionResult.category).toBe("Disastrous");
  });

  it("returns a hard behavioral mandate in contextForStory that instructs against yielding to persuasion", async () => {
    mockRandom(0.5); // 3d6 = 12
    const storyData = createMockStoryData();
    const toolCall = createToolCall("reaction_check", {
      npc_name: "the merchant",
      bias: "hostile",
      reason: "player tries to haggle",
    });

    const result = await executeGMTools([toolCall], storyData);
    const contextForStory = result.results[0].contextForStory;

    expect(contextForStory).toContain("MANDATE");
    expect(contextForStory).toContain("the merchant");
    expect(contextForStory).toContain("not by the player simply asking again");
  });
});
