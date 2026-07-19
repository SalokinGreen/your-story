/**
 * Tests for H8: roll-input integrity check on formula_roll / opposed_formula.
 *
 * The model can optionally declare which stat/resource a formula's flat
 * modifier is claimed to come from (stat_name / player_stat_name). When that
 * name fuzzy-matches a structured storyData.stats/resources entry, the
 * executor cross-checks the claimed modifier against it and appends a
 * non-blocking integrity note to contextForStory if the claim clearly
 * exceeds what stat value + plausible item/ability stacking (+10 slack)
 * could explain. It never rejects or rewrites the roll.
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
    function: {
      name,
      arguments: JSON.stringify(args),
    },
  };
}

describe("H8: formula_roll stat integrity check", () => {
  it("does not flag a modifier within the plausible range of the matched stat", async () => {
    const storyData = createMockStoryData({
      stats: [
        { name: "Strength", value: 3, description: "", symbol: "" } as any,
      ],
    });
    const toolCall = createToolCall("formula_roll", {
      formula: "0+3",
      reason: "Strength check",
      stat_name: "Strength",
    });

    const result = await executeGMTools([toolCall], storyData);
    const context = result.results[0].contextForStory || "";
    expect(context).not.toContain("Roll integrity check");
  });

  it("flags a modifier that far exceeds the matched stat value plus stacking slack", async () => {
    const storyData = createMockStoryData({
      stats: [
        { name: "Strength", value: 3, description: "", symbol: "" } as any,
      ],
    });
    const toolCall = createToolCall("formula_roll", {
      formula: "0+25",
      reason: "Strength check",
      stat_name: "Strength",
    });

    const result = await executeGMTools([toolCall], storyData);
    const context = result.results[0].contextForStory || "";
    expect(context).toContain("Roll integrity check");
    expect(context).toContain("Strength");
  });

  it("does not flag when no stat_name is provided", async () => {
    const storyData = createMockStoryData({
      stats: [
        { name: "Strength", value: 3, description: "", symbol: "" } as any,
      ],
    });
    const toolCall = createToolCall("formula_roll", {
      formula: "0+25",
      reason: "Strength check",
    });

    const result = await executeGMTools([toolCall], storyData);
    const context = result.results[0].contextForStory || "";
    expect(context).not.toContain("Roll integrity check");
  });

  it("does not flag when stat_name does not match any tracked stat/resource", async () => {
    const storyData = createMockStoryData({
      stats: [
        { name: "Strength", value: 3, description: "", symbol: "" } as any,
      ],
    });
    const toolCall = createToolCall("formula_roll", {
      formula: "0+25",
      reason: "Blessing check",
      stat_name: "Divine Favor",
    });

    const result = await executeGMTools([toolCall], storyData);
    const context = result.results[0].contextForStory || "";
    expect(context).not.toContain("Roll integrity check");
  });

  it("matches against resources as well as stats", async () => {
    const storyData = createMockStoryData({
      resources: [
        {
          name: "Mana",
          value: 2,
          maxValue: 10,
          description: "",
          symbol: "",
        } as any,
      ],
    });
    const toolCall = createToolCall("formula_roll", {
      formula: "0+40",
      reason: "Mana-fueled blast",
      stat_name: "Mana",
    });

    const result = await executeGMTools([toolCall], storyData);
    const context = result.results[0].contextForStory || "";
    expect(context).toContain("Roll integrity check");
  });
});

describe("H8: opposed_formula player_stat_name integrity check", () => {
  it("flags the player's side when the claimed modifier is implausible", async () => {
    const storyData = createMockStoryData({
      stats: [
        { name: "Dexterity", value: 2, description: "", symbol: "" } as any,
      ],
    });
    const toolCall = createToolCall("opposed_formula", {
      player_formula: "0+30",
      opponent_formula: "0+3",
      opponent_name: "Guard",
      reason: "Sneak past the guard",
      player_stat_name: "Dexterity",
    });

    const result = await executeGMTools([toolCall], storyData);
    const context = result.results[0].contextForStory || "";
    expect(context).toContain("Roll integrity check");
    expect(context).toContain("Dexterity");
  });

  it("does not flag a plausible claimed modifier", async () => {
    const storyData = createMockStoryData({
      stats: [
        { name: "Dexterity", value: 4, description: "", symbol: "" } as any,
      ],
    });
    const toolCall = createToolCall("opposed_formula", {
      player_formula: "0+4",
      opponent_formula: "0+3",
      opponent_name: "Guard",
      reason: "Sneak past the guard",
      player_stat_name: "Dexterity",
    });

    const result = await executeGMTools([toolCall], storyData);
    const context = result.results[0].contextForStory || "";
    expect(context).not.toContain("Roll integrity check");
  });
});
