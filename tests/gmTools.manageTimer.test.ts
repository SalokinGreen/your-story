/**
 * Tests for the unified manage_timer GM tool, which replaced the 5 separate
 * create_timer/advance_timer/toggle_timer_pause/cancel_timer/trigger_timer
 * tools (same underlying CountdownTimer logic, single action-based entry
 * point for a smaller tool surface).
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

function createToolCall(name: string, args: Record<string, unknown>) {
  return {
    id: `test_${Math.random().toString(36).slice(2)}`,
    function: { name, arguments: JSON.stringify(args) },
  };
}

describe("manage_timer", () => {
  it("creates a timer", async () => {
    const storyData = createMockStoryData();
    const result = await executeGMTools(
      [createToolCall("manage_timer", { action: "create", name: "Bomb Timer", ticks: 5 })],
      storyData
    );

    expect(result.results[0].success).toBe(true);
    expect(result.results[0].toolName).toBe("manage_timer");
    expect(result.modifiedStoryData.timers).toHaveLength(1);
    expect(result.modifiedStoryData.timers![0].name).toBe("Bomb Timer");
    expect(result.modifiedStoryData.timers![0].currentTicks).toBe(5);
    expect(result.modifiedStoryData.timers![0].status).toBe("active");
  });

  it("rejects create without required fields", async () => {
    const storyData = createMockStoryData();
    const result = await executeGMTools(
      [createToolCall("manage_timer", { action: "create", name: "Missing ticks" })],
      storyData
    );

    expect(result.results[0].success).toBe(false);
    expect(result.results[0].contextForStory).toContain('requires "name" and "ticks"');
  });

  it("advances a timer and can trigger it at 0", async () => {
    const storyData = createMockStoryData();
    const { modifiedStoryData } = await executeGMTools(
      [createToolCall("manage_timer", { action: "create", name: "Ritual", ticks: 2 })],
      storyData
    );

    const advanced = await executeGMTools(
      [createToolCall("manage_timer", { action: "advance", timer: "Ritual", ticks: 2 })],
      modifiedStoryData
    );

    expect(advanced.results[0].success).toBe(true);
    const timer = advanced.modifiedStoryData.timers!.find((t) => t.name === "Ritual")!;
    expect(timer.currentTicks).toBe(0);
    expect(timer.status).toBe("triggered");
  });

  it("rejects advance without a timer identifier", async () => {
    const storyData = createMockStoryData();
    const result = await executeGMTools(
      [createToolCall("manage_timer", { action: "advance", ticks: 1 })],
      storyData
    );
    expect(result.results[0].success).toBe(false);
    expect(result.results[0].contextForStory).toContain('requires "timer"');
  });

  it("toggles pause and resume", async () => {
    const { modifiedStoryData } = await executeGMTools(
      [createToolCall("manage_timer", { action: "create", name: "Guard patrol", ticks: 10 })],
      createMockStoryData()
    );

    const paused = await executeGMTools(
      [createToolCall("manage_timer", { action: "toggle_pause", timer: "Guard patrol" })],
      modifiedStoryData
    );
    expect(paused.modifiedStoryData.timers![0].status).toBe("paused");

    const resumed = await executeGMTools(
      [createToolCall("manage_timer", { action: "toggle_pause", timer: "Guard patrol" })],
      paused.modifiedStoryData
    );
    expect(resumed.modifiedStoryData.timers![0].status).toBe("active");
  });

  it("cancels a timer without triggering it", async () => {
    const { modifiedStoryData } = await executeGMTools(
      [createToolCall("manage_timer", { action: "create", name: "Escape window", ticks: 3 })],
      createMockStoryData()
    );

    const cancelled = await executeGMTools(
      [
        createToolCall("manage_timer", {
          action: "cancel",
          timer: "Escape window",
          reason: "Player disarmed it",
        }),
      ],
      modifiedStoryData
    );

    const timer = cancelled.modifiedStoryData.timers![0];
    expect(timer.status).toBe("cancelled");
    expect(cancelled.results[0].contextForStory).toContain("Player disarmed it");
  });

  it("triggers a timer early regardless of remaining ticks", async () => {
    const { modifiedStoryData } = await executeGMTools(
      [createToolCall("manage_timer", { action: "create", name: "Alarm", ticks: 100 })],
      createMockStoryData()
    );

    const triggered = await executeGMTools(
      [createToolCall("manage_timer", { action: "trigger", timer: "Alarm", reason: "Guard spotted you" })],
      modifiedStoryData
    );

    const timer = triggered.modifiedStoryData.timers![0];
    expect(timer.status).toBe("triggered");
    expect(triggered.results[0].contextForStory).toContain("TRIGGERED EARLY");
  });

  it("reports a clear error for an unknown action (caught by schema validation)", async () => {
    const storyData = createMockStoryData();
    const result = await executeGMTools(
      [createToolCall("manage_timer", { action: "explode", timer: "x" })],
      storyData
    );
    expect(result.results[0].success).toBe(false);
    // The "action" enum in the schema catches this before executeManageTimer's
    // own default-case check ever runs (see toolValidation.ts / task #6).
    expect(result.results[0].contextForStory).toContain("must be one of");
  });

  it("errors clearly when operating on a nonexistent timer", async () => {
    const storyData = createMockStoryData();
    const result = await executeGMTools(
      [createToolCall("manage_timer", { action: "advance", timer: "Nonexistent" })],
      storyData
    );
    expect(result.results[0].success).toBe(false);
    expect(result.results[0].contextForStory).toContain("not found");
  });
});
