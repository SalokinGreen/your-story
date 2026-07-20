/**
 * Tests for the `target`/`forces_choice` hardness dimensions on
 * formula_roll and opposed_formula (see §2.2 in
 * docs/research-paper-ttrpg-theory-gap-analysis.md - two of PbtA's seven
 * "dimensions of hardness", independent of `stakes`).
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

describe("formula_roll hardness dimensions", () => {
  it("does not mention target/forces_choice text on success", async () => {
    const storyData = createMockStoryData();
    const toolCall = createToolCall("formula_roll", {
      formula: "1d20+100", // guaranteed success against a low DC
      dc: 1,
      reason: "Testing success path",
      target: "someone_they_love",
      forces_choice: true,
    });

    const result = await executeGMTools([toolCall], storyData);
    const contextForStory = result.results[0].contextForStory;

    expect((result.results[0].result as any).success).toBe(true);
    expect(contextForStory).not.toContain("[Target:");
    expect(contextForStory).not.toContain("[Forces a choice:");
  });

  it("surfaces the target dimension in contextForStory on failure", async () => {
    const storyData = createMockStoryData();
    const toolCall = createToolCall("formula_roll", {
      formula: "1d1", // always rolls 1
      dc: 100, // guaranteed failure
      reason: "Testing failure path",
      target: "someone_they_love",
    });

    const result = await executeGMTools([toolCall], storyData);
    const contextForStory = result.results[0].contextForStory;
    const rollResult = result.results[0].result as any;

    expect(rollResult.success).toBe(false);
    expect(rollResult.target).toBe("someone_they_love");
    expect(contextForStory).toContain("[Target:");
    expect(contextForStory).toContain("someone the character loves");
  });

  it("surfaces the forces_choice dimension in contextForStory on failure", async () => {
    const storyData = createMockStoryData();
    const toolCall = createToolCall("formula_roll", {
      formula: "1d1",
      dc: 100,
      reason: "Testing forced-choice failure",
      forces_choice: true,
    });

    const result = await executeGMTools([toolCall], storyData);
    const contextForStory = result.results[0].contextForStory;
    const rollResult = result.results[0].result as any;

    expect(rollResult.forcesChoice).toBe(true);
    expect(contextForStory).toContain("[Forces a choice:");
    expect(contextForStory).toContain("dilemma between two costs");
  });

  it("omits the target line when target is 'self' (the default/no-op case)", async () => {
    const storyData = createMockStoryData();
    const toolCall = createToolCall("formula_roll", {
      formula: "1d1",
      dc: 100,
      reason: "Testing self-targeted failure",
      target: "self",
    });

    const result = await executeGMTools([toolCall], storyData);
    const contextForStory = result.results[0].contextForStory;

    expect(contextForStory).not.toContain("[Target:");
  });
});

describe("opposed_formula hardness dimensions", () => {
  it("surfaces target/forces_choice only when the opponent wins", async () => {
    const storyData = createMockStoryData();
    const toolCall = createToolCall("opposed_formula", {
      player_formula: "1d1+100", // guaranteed win
      opponent_formula: "1d1",
      opponent_name: "the bandit",
      reason: "Testing player-wins path",
      target: "someone_present",
      forces_choice: true,
    });

    const result = await executeGMTools([toolCall], storyData);
    const contextForStory = result.results[0].contextForStory;

    expect((result.results[0].result as any).winner).toBe("player");
    expect(contextForStory).not.toContain("[Target:");
    expect(contextForStory).not.toContain("[Forces a choice:");
  });

  it("surfaces target/forces_choice when the opponent wins", async () => {
    const storyData = createMockStoryData();
    const toolCall = createToolCall("opposed_formula", {
      player_formula: "1d1",
      opponent_formula: "1d1+100", // guaranteed opponent win
      opponent_name: "the bandit",
      reason: "Testing opponent-wins path",
      target: "someone_present",
      forces_choice: true,
    });

    const result = await executeGMTools([toolCall], storyData);
    const contextForStory = result.results[0].contextForStory;
    const opposedResult = result.results[0].result as any;

    expect(opposedResult.winner).toBe("opponent");
    expect(opposedResult.target).toBe("someone_present");
    expect(opposedResult.forcesChoice).toBe(true);
    expect(contextForStory).toContain("[Target:");
    expect(contextForStory).toContain("[Forces a choice:");
  });
});
