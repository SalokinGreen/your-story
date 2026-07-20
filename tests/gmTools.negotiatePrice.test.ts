/**
 * Tests for the negotiate_price GM tool - GURPS-style structured haggling
 * (see the "GURPS-style structured haggling" follow-up idea in
 * docs/research-paper-ttrpg-theory-gap-analysis.md). An opposed Quick
 * Contest whose margin of success deterministically discounts a list
 * price, bounded by the seller's hard floor.
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

describe("negotiate_price tool", () => {
  it("applies a 10%-per-margin-point discount when the player wins", async () => {
    const storyData = createMockStoryData();
    const toolCall = createToolCall("negotiate_price", {
      item_name: "steel longsword",
      list_price: 100,
      player_formula: "1d1+10", // fixed roll, total 11
      seller_formula: "1d1+5", // fixed roll, total 6 -> margin 5
      reason: "player haggles with the blacksmith",
    });

    const result = await executeGMTools([toolCall], storyData);
    const negotiation = result.results[0].result as any;

    expect(negotiation.margin).toBe(5);
    expect(negotiation.discountPercent).toBe(50); // 5 * 10%
    expect(negotiation.finalPrice).toBe(50); // 100 * (1 - 0.5)
    expect(negotiation.failed).toBe(false);
    expect(negotiation.clampedToFloor).toBe(false);
  });

  it("applies no discount when the seller wins or ties", async () => {
    const storyData = createMockStoryData();
    const toolCall = createToolCall("negotiate_price", {
      item_name: "dagger",
      list_price: 50,
      player_formula: "1d1+3", // total 4
      seller_formula: "1d1+10", // total 11 -> negative margin
      reason: "player tries to haggle but the seller isn't budging",
    });

    const result = await executeGMTools([toolCall], storyData);
    const negotiation = result.results[0].result as any;

    expect(negotiation.margin).toBeLessThan(0);
    expect(negotiation.discountPercent).toBe(0);
    expect(negotiation.finalPrice).toBe(50); // unchanged, not worse
  });

  it("clamps the final price to the seller's floor even with a huge margin", async () => {
    const storyData = createMockStoryData();
    const toolCall = createToolCall("negotiate_price", {
      item_name: "enchanted ring",
      list_price: 1000,
      player_formula: "1d1+50", // total 51
      seller_formula: "1d1+1", // total 2 -> margin 49 (would exceed cap)
      seller_min_price: 800,
      reason: "player is an exceptional negotiator",
    });

    const result = await executeGMTools([toolCall], storyData);
    const negotiation = result.results[0].result as any;

    expect(negotiation.discountPercent).toBe(90); // capped at NEGOTIATE_PRICE_MAX_DISCOUNT_PERCENT
    expect(negotiation.finalPrice).toBe(800); // clamped up to the floor, not 100
    expect(negotiation.clampedToFloor).toBe(true);
  });

  it("fails outright, with no roll, when the player's target is already below the seller's floor", async () => {
    const storyData = createMockStoryData();
    const toolCall = createToolCall("negotiate_price", {
      item_name: "heirloom sword",
      list_price: 500,
      player_formula: "1d20+10",
      seller_formula: "1d20+10",
      seller_min_price: 400,
      player_target_price: 200, // impossible - below the floor
      reason: "player lowballs the seller",
    });

    const result = await executeGMTools([toolCall], storyData);
    const negotiation = result.results[0].result as any;

    expect(result.results[0].success).toBe(false);
    expect(negotiation.failed).toBe(true);
    expect(negotiation.playerRolls).toEqual([]); // no roll happened
    expect(result.results[0].contextForStory).toContain("FAILED");
  });

  it("succeeds normally when player_target_price is at or above the seller's floor", async () => {
    const storyData = createMockStoryData();
    const toolCall = createToolCall("negotiate_price", {
      item_name: "shield",
      list_price: 200,
      player_formula: "1d1+5",
      seller_formula: "1d1+3",
      seller_min_price: 100,
      player_target_price: 150, // above the floor - should roll normally
      reason: "player negotiates in good faith",
    });

    const result = await executeGMTools([toolCall], storyData);
    const negotiation = result.results[0].result as any;

    expect(negotiation.failed).toBe(false);
    expect(negotiation.playerRolls.length).toBeGreaterThan(0);
  });
});
