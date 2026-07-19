/**
 * update_npc's attitude field used to allow an arbitrary jump anywhere on
 * the hostile->unfriendly->neutral->friendly->allied scale in a single
 * call, with nothing gating it - a direct instance of the sycophancy risk
 * where an agreeable GM could mark any NPC "allied" regardless of what the
 * player actually did. This tests the fix: attitude now moves at most 2
 * steps per call.
 */
import { describe, it, expect } from "vitest";
import { executeGMTools } from "@/app/misc/gmExecutor";
import { StoryData, NPC } from "@/app/misc/structs";

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
    npcs: [],
    ...overrides,
  } as StoryData;
}

function npc(overrides: Partial<NPC>): NPC {
  return {
    id: "npc-1",
    name: "Aldric",
    description: "A merchant",
    role: "Merchant",
    status: "alive",
    relationship: "Stranger",
    attitude: "neutral",
    createdAt: Date.now(),
    ...overrides,
  } as NPC;
}

function createToolCall(name: string, args: Record<string, unknown>) {
  return {
    id: `test_${Math.random().toString(36).slice(2)}`,
    function: { name, arguments: JSON.stringify(args) },
  };
}

describe("update_npc - attitude clamping", () => {
  it("allows a jump within the per-call cap", async () => {
    const storyData = createMockStoryData({
      npcs: [npc({ attitude: "neutral" })],
    });

    const result = await executeGMTools(
      [createToolCall("update_npc", { npc: "Aldric", attitude: "allied" })],
      storyData
    );

    // neutral -> allied is 2 steps, exactly at the cap
    expect(result.modifiedStoryData.npcs![0].attitude).toBe("allied");
    expect(result.results[0].success).toBe(true);
  });

  it("caps a jump beyond the per-call limit instead of applying it directly", async () => {
    const storyData = createMockStoryData({
      npcs: [npc({ attitude: "hostile" })],
    });

    const result = await executeGMTools(
      [createToolCall("update_npc", { npc: "Aldric", attitude: "allied" })],
      storyData
    );

    // hostile -> allied is 4 steps; capped to hostile + 2 = neutral
    expect(result.modifiedStoryData.npcs![0].attitude).toBe("neutral");
  });

  it("caps a large negative jump the same way", async () => {
    const storyData = createMockStoryData({
      npcs: [npc({ attitude: "allied" })],
    });

    const result = await executeGMTools(
      [createToolCall("update_npc", { npc: "Aldric", attitude: "hostile" })],
      storyData
    );

    // allied -> hostile is 4 steps; capped to allied - 2 = neutral
    expect(result.modifiedStoryData.npcs![0].attitude).toBe("neutral");
  });

  it("allows a single-step change unaffected by the cap", async () => {
    const storyData = createMockStoryData({
      npcs: [npc({ attitude: "neutral" })],
    });

    const result = await executeGMTools(
      [createToolCall("update_npc", { npc: "Aldric", attitude: "friendly" })],
      storyData
    );

    expect(result.modifiedStoryData.npcs![0].attitude).toBe("friendly");
  });
});
