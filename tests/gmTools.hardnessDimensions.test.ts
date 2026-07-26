/**
 * Tests for the `target`/`forces_choice` hardness dimensions on
 * formula_roll and opposed_formula (see §2.2 in
 * docs/research-paper-ttrpg-theory-gap-analysis.md - two of PbtA's seven
 * "dimensions of hardness", independent of `stakes`).
 *
 * These describe how a *failure* should land. The dice tools no longer decide
 * whether the roll failed (that's the GM's `calculate` comparison), so they
 * emit the hardness note as guidance conditioned on failure - "[If this
 * failed: ...]" - instead of only when they'd judged a failure themselves.
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
  it("attaches the target dimension to the failure branch as a condition", async () => {
    const storyData = createMockStoryData();
    const toolCall = createToolCall("formula_roll", {
      formulas: ["1d20"],
      reason: "Testing the failure branch",
      target: "someone_they_love",
    });

    const result = await executeGMTools([toolCall], storyData);
    const contextForStory = result.results[0].contextForStory;
    const rollResult = result.results[0].result as any;

    expect(rollResult.target).toBe("someone_they_love");
    expect(contextForStory).toContain("[If this failed:");
    expect(contextForStory).toContain("[Target:");
    expect(contextForStory).toContain("someone the character loves");
  });

  it("attaches the forces_choice dimension to the failure branch", async () => {
    const storyData = createMockStoryData();
    const toolCall = createToolCall("formula_roll", {
      formulas: ["1d20"],
      reason: "Testing forced-choice failure",
      forces_choice: true,
    });

    const result = await executeGMTools([toolCall], storyData);
    const contextForStory = result.results[0].contextForStory;
    const rollResult = result.results[0].result as any;

    expect(rollResult.forcesChoice).toBe(true);
    expect(contextForStory).toContain("[If this failed:");
    expect(contextForStory).toContain("[Forces a choice:");
    expect(contextForStory).toContain("dilemma between two costs");
  });

  it("keeps the note conditional rather than asserting the roll failed", async () => {
    // The tool reports numbers; it must never state an outcome. The hardness
    // note has to read as "if this failed", never as a verdict.
    const storyData = createMockStoryData();
    const toolCall = createToolCall("formula_roll", {
      formulas: ["1d20+100"], // a total nothing plausible would fail
      reason: "Testing that no verdict leaks out",
      target: "someone_present",
    });

    const result = await executeGMTools([toolCall], storyData);
    const contextForStory = result.results[0].contextForStory;

    expect(contextForStory).toContain("[If this failed:");
    expect(contextForStory).not.toContain("FAILURE");
    expect(contextForStory).not.toContain("SUCCESS");
  });

  it("omits the target line when target is 'self' (the default/no-op case)", async () => {
    const storyData = createMockStoryData();
    const toolCall = createToolCall("formula_roll", {
      formulas: ["1d1"],
      reason: "Testing self-targeted failure",
      target: "self",
    });

    const result = await executeGMTools([toolCall], storyData);
    const contextForStory = result.results[0].contextForStory;

    expect(contextForStory).not.toContain("[Target:");
  });

  it("says nothing about hardness when neither dimension is set", async () => {
    const storyData = createMockStoryData();
    const toolCall = createToolCall("formula_roll", {
      formulas: ["1d20"],
      reason: "An ordinary roll",
    });

    const result = await executeGMTools([toolCall], storyData);
    const contextForStory = result.results[0].contextForStory;

    expect(contextForStory).not.toContain("[If this failed:");
    expect(contextForStory).not.toContain("[Target:");
    expect(contextForStory).not.toContain("[Forces a choice:");
  });
});

describe("opposed_formula hardness dimensions", () => {
  it("attaches target/forces_choice to the player-loses branch as a condition", async () => {
    const storyData = createMockStoryData();
    const toolCall = createToolCall("opposed_formula", {
      player_formula: "1d1",
      opponent_formula: "1d1+100",
      opponent_name: "the bandit",
      reason: "Testing the losing branch",
      target: "someone_present",
      forces_choice: true,
    });

    const result = await executeGMTools([toolCall], storyData);
    const contextForStory = result.results[0].contextForStory;
    const opposedResult = result.results[0].result as any;

    expect(opposedResult.target).toBe("someone_present");
    expect(opposedResult.forcesChoice).toBe(true);
    expect(contextForStory).toContain("[If the player lost:");
    expect(contextForStory).toContain("[Target:");
    expect(contextForStory).toContain("[Forces a choice:");
  });

  it("still declares no winner, whichever total came out higher", async () => {
    const storyData = createMockStoryData();
    const toolCall = createToolCall("opposed_formula", {
      player_formula: "1d1+100", // would have been a guaranteed "win"
      opponent_formula: "1d1",
      opponent_name: "the bandit",
      reason: "Testing that no winner is asserted",
      target: "someone_present",
      forces_choice: true,
    });

    const result = await executeGMTools([toolCall], storyData);
    const contextForStory = result.results[0].contextForStory;

    expect(result.results[0].result as any).not.toHaveProperty("winner");
    expect(contextForStory).not.toContain("[Winner:");
    // The hardness note stays conditional - the comparison hasn't happened yet.
    expect(contextForStory).toContain("[If the player lost:");
  });

  it("says nothing about hardness when neither dimension is set", async () => {
    const storyData = createMockStoryData();
    const toolCall = createToolCall("opposed_formula", {
      player_formula: "1d20+3",
      opponent_formula: "1d20+2",
      opponent_name: "the bandit",
      reason: "An ordinary contest",
    });

    const result = await executeGMTools([toolCall], storyData);
    const contextForStory = result.results[0].contextForStory;

    expect(contextForStory).not.toContain("[If the player lost:");
    expect(contextForStory).not.toContain("[Target:");
  });
});
