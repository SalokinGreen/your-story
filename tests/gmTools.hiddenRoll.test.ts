/**
 * Tests for `gm_roll` - the roll made behind the GM's screen.
 *
 * Two properties define it, and both are about what the player is never
 * shown: the roll is never handed to them to throw (so it skips the physical
 * dice tray even when that's wired up), and it's flagged so every
 * player-facing view of the turn drops it. Like the other dice tools it
 * reports numbers and judges nothing.
 */

import { describe, it, expect } from "vitest";
import {
  executeGMTools,
  DiceThrowRequest,
  GMHiddenRollResult,
} from "@/app/misc/gmExecutor";
import { StoryData } from "@/app/misc/structs";
import { buildSavedTimeline } from "@/app/misc/turnTimeline";
import { hasSatisfiedRollGate } from "@/app/misc/reasoningTiers";

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

function createToolCall(name: string, args: Record<string, unknown>) {
  return {
    id: `test_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    function: { name, arguments: JSON.stringify(args) },
  };
}

describe("gm_roll", () => {
  it("rolls the formula and reports the pool", async () => {
    const result = await executeGMTools(
      [
        createToolCall("gm_roll", {
          formulas: ["1d20+3"],
          reason: "Does the patrol notice them?",
        }),
      ],
      createMockStoryData(),
    );

    expect(result.results).toHaveLength(1);
    expect(result.results[0].success).toBe(true);

    const roll = result.results[0].result as GMHiddenRollResult;
    expect(roll.type).toBe("gm_roll");
    expect(roll.pools).toHaveLength(1);
    expect(roll.pools[0].total).toBeGreaterThanOrEqual(4); // 1+3
    expect(roll.pools[0].total).toBeLessThanOrEqual(23); // 20+3
  });

  it("marks the result hidden from the player", async () => {
    const result = await executeGMTools(
      [
        createToolCall("gm_roll", {
          formulas: ["1d20"],
          reason: "Hidden Perception",
        }),
      ],
      createMockStoryData(),
    );

    expect(result.results[0].hiddenFromPlayer).toBe(true);
  });

  it("never routes the roll to the physical dice tray", async () => {
    // Handing a secret roll to the player to throw would defeat the whole
    // point, so this stays digital in both dice modes.
    const seen: DiceThrowRequest[] = [];
    const result = await executeGMTools(
      [
        createToolCall("gm_roll", {
          formulas: ["1d20+2"],
          reason: "Is the merchant lying?",
        }),
      ],
      createMockStoryData(),
      {},
      {
        requestDiceThrow: async (request) => {
          seen.push(request);
          return [[20]];
        },
      },
    );

    expect(seen).toHaveLength(0);
    const roll = result.results[0].result as GMHiddenRollResult;
    expect(roll.pools[0].total).toBeLessThanOrEqual(22);
  });

  it("computes no verdict, like every other dice tool", async () => {
    const result = await executeGMTools(
      [createToolCall("gm_roll", { formulas: ["1d20"], reason: "Ambush?" })],
      createMockStoryData(),
    );

    expect(result.results[0].contextForStory).toContain(
      "No verdict was computed",
    );
  });

  it("tells the GM not to narrate the roll away", async () => {
    const result = await executeGMTools(
      [
        createToolCall("gm_roll", {
          formulas: ["1d20"],
          reason: "Hidden Perception",
          secret_because: "Seeing the roll would reveal the trap exists",
        }),
      ],
      createMockStoryData(),
    );

    const context = result.results[0].contextForStory!;
    expect(context).toContain("cannot see this roll");
    expect(context).toContain("Seeing the roll would reveal the trap exists");
  });

  it("accepts the singular `formula` shape models drift toward", async () => {
    const result = await executeGMTools(
      [createToolCall("gm_roll", { formula: "1d6", reason: "Offscreen event" })],
      createMockStoryData(),
    );

    expect(result.results[0].success).toBe(true);
    const roll = result.results[0].result as GMHiddenRollResult;
    expect(roll.pools[0].formula).toBe("1d6");
  });

  it("errors without a formula, still flagged hidden", async () => {
    const result = await executeGMTools(
      [createToolCall("gm_roll", { reason: "Nothing to roll" })],
      createMockStoryData(),
    );

    expect(result.results[0].success).toBe(false);
    expect(result.results[0].hiddenFromPlayer).toBe(true);
    expect(result.results[0].contextForStory).toContain("ERROR");
  });

  it("satisfies the M2 roll gate - a hidden roll is still a roll", () => {
    expect(hasSatisfiedRollGate(["gm_roll"])).toBe(true);
  });
});

describe("gm_roll in the player-facing timeline", () => {
  const gmConversation = [
    {
      role: "assistant" as const,
      content: "",
      tool_calls: [
        {
          id: "call_hidden",
          function: { name: "gm_roll", arguments: "{}" },
        },
        {
          id: "call_open",
          function: { name: "formula_roll", arguments: "{}" },
        },
      ],
    },
  ];

  it("hides the roll while keeping the open one", () => {
    const blocks = buildSavedTimeline(
      gmConversation,
      new Map([
        [
          "call_hidden",
          {
            success: true,
            contextForStory: "[Hidden Roll: 1d20: [3] = **3**]",
            toolName: "gm_roll",
            hiddenFromPlayer: true,
          },
        ],
        [
          "call_open",
          {
            success: true,
            contextForStory: "[Roll: 1d20: [15] = **15**]",
            toolName: "formula_roll",
          },
        ],
      ]),
      false,
    );

    const tools = blocks.filter((b) => b.kind === "tool");
    expect(tools).toHaveLength(2);
    // The block still exists - updateLiveRoundBlocks uses tool blocks as
    // round boundaries - but it's flagged and carries no dice.
    const hidden = tools.find((b) => b.toolCallId === "call_hidden")!;
    expect(hidden.hidden).toBe(true);
    expect(hidden.contextForStory).toBeUndefined();

    const open = tools.find((b) => b.toolCallId === "call_open")!;
    expect(open.hidden).toBeUndefined();
    expect(open.contextForStory).toContain("15");
  });

  it("hides it by name even when the result is missing", () => {
    // An aborted round can leave a tool call with no stored result; the
    // timeline would otherwise fall back to rendering its raw name.
    const blocks = buildSavedTimeline(gmConversation, undefined, false);
    const hidden = blocks.find((b) => b.toolCallId === "call_hidden")!;
    expect(hidden.hidden).toBe(true);
  });
});
