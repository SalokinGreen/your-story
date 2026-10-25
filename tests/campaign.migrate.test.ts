import { describe, expect, it } from "vitest";
import { migrateTimers, timerToClock } from "@/app/misc/campaign/migrate";
import type { CountdownTimer, StoryData } from "@/app/misc/structs";
import { drownedKingStory, record, run, story } from "./helpers/campaignFixtures";

function timer(overrides: Partial<CountdownTimer> = {}): CountdownTimer {
  return {
    id: "timer_1",
    name: "The ritual completes",
    description: "The seal breaks",
    totalTicks: 6,
    currentTicks: 2,
    autoAdvance: false,
    status: "active",
    visibility: "visible",
    createdAt: 1,
    ...overrides,
  };
}

describe("migrateTimers", () => {
  it("turns a timer into a manual clock: remaining becomes filled, id and visibility kept", () => {
    const s = story({ timers: [timer(), timer({ id: "timer_2", name: "Quiet", visibility: "hidden", totalTicks: 4, currentTicks: 4 })] });
    expect(migrateTimers(s)).toBe(true);
    const [a, b] = s.campaign!.clocks;
    expect(a).toMatchObject({ id: "timer_1", name: "The ritual completes", segments: 6, filled: 4, triggers: ["manual"], visible: true, paused: false, migratedFromTimerId: "timer_1", onFill: "The seal breaks" });
    expect(b).toMatchObject({ id: "timer_2", segments: 4, filled: 0, visible: false });
    expect(s.campaign!.origin).toBe("migrated");
    expect(s.campaign!.version).toBe(1);
  });

  it("keeps any capacity, not only 4, 6 or 8", () => {
    expect(timerToClock(timer({ totalTicks: 11, currentTicks: 11 })).segments).toBe(11);
    expect(timerToClock(timer({ totalTicks: 3, currentTicks: 1 })).filled).toBe(2);
    expect(timerToClock(timer({ totalTicks: 30, currentTicks: 0 })).filled).toBe(30);
  });

  it("maps every status", () => {
    expect(timerToClock(timer({ status: "active" }))).toMatchObject({ paused: false });
    expect(timerToClock(timer({ status: "paused" }))).toMatchObject({ paused: true });
    expect(timerToClock(timer({ status: "triggered", currentTicks: 0 }))).toMatchObject({ filled: 6, paused: false });
    const cancelled = timerToClock(timer({ status: "cancelled" }));
    expect(cancelled).toMatchObject({ cancelled: true, paused: true });
  });

  it("is idempotent, keyed by migratedFromTimerId", () => {
    const s = story({ timers: [timer()] });
    expect(migrateTimers(s)).toBe(true);
    const once = JSON.stringify(s.campaign);
    expect(migrateTimers(s)).toBe(false);
    expect(JSON.stringify(s.campaign)).toBe(once);
    // a timer added later migrates; the first is not duplicated
    s.timers!.push(timer({ id: "timer_9", name: "New" }));
    expect(migrateTimers(s)).toBe(true);
    expect(s.campaign!.clocks.map((c) => c.id)).toEqual(["timer_1", "timer_9"]);
  });

  it("does nothing for a story with no timers", () => {
    const s = story();
    expect(migrateTimers(s)).toBe(false);
    expect(s.campaign).toBeUndefined();
    expect(migrateTimers(story({ timers: [] }))).toBe(false);
  });

  it("an existing record wins: its parts are kept and the origin is not claimed", () => {
    const s = story({ timers: [timer()], campaign: record({ style: "mystery" }) });
    expect(migrateTimers(s)).toBe(true);
    expect(s.campaign!.style).toBe("mystery");
    expect(s.campaign!.origin).toBeUndefined();
    expect(s.campaign!.clocks).toHaveLength(1);
  });

  it("round trips: load, save, sync shape, reload, with timers and an existing spine", () => {
    const spine = { title: "Campaign Plan", content: "## Spine\n- Opening", type: "gm_plan", enabled: true };
    const s = story({ timers: [timer()], lore: [spine] as unknown as StoryData["lore"] });
    migrateTimers(s);
    // save (IndexedDB structured clone), sync (JSON blob), reload
    const saved = structuredClone(s);
    const synced = JSON.parse(JSON.stringify(saved)) as StoryData;
    expect(migrateTimers(synced)).toBe(false);
    expect(synced).toEqual(saved);
    expect(synced.lore[0]).toEqual(spine);
    expect(synced.timers).toHaveLength(1);
    expect(synced.campaign!.origin).toBe("migrated");
  });
});

describe("manage_timer on a story with a record", () => {
  it("create makes a manual clock of any capacity, hidden by the style when unsaid", async () => {
    const s = drownedKingStory();
    const out = await run(s, [{ name: "manage_timer", args: { action: "create", name: "Ferry leaves", ticks: 5, description: "It sails" } }]);
    const c = out.modifiedStoryData.campaign!.clocks.find((x) => x.name === "Ferry leaves")!;
    expect(c).toMatchObject({ segments: 5, filled: 0, triggers: ["manual"], visible: false, onFill: "It sails" });
    expect(out.results[0].toolName).toBe("manage_timer");
    expect((out.results[0].result as { type: string }).type).toBe("create_timer");
    expect(out.modifiedStoryData.timers).toBeUndefined();
  });

  it("create refuses a duplicate name", async () => {
    const s = drownedKingStory();
    const out = await run(s, [{ name: "manage_timer", args: { action: "create", name: "the barrow wakes", ticks: 4 } }]);
    expect(out.results[0].success).toBe(false);
  });

  it("advance ticks, reports remaining ticks, and triggers at the end", async () => {
    const s = drownedKingStory();
    s.campaign!.clocks[0].filled = 4;
    const out = await run(s, [{ name: "manage_timer", args: { action: "advance", timer: "The barrow wakes", ticks: 2 } }]);
    const r = out.results[0].result as { previousTicks: number; currentTicks: number; triggered: boolean };
    expect(r).toMatchObject({ previousTicks: 2, currentTicks: 0, triggered: true });
    expect(out.modifiedStoryData.campaign!.clocks[0].filled).toBe(6);
    expect(out.results[0].contextForStory).toContain("FULL");
  });

  it("advance refuses a paused clock, and toggle_pause flips it", async () => {
    const s = drownedKingStory();
    const t = await run(s, [{ name: "manage_timer", args: { action: "toggle_pause", timer: "clk_a" } }]);
    expect(t.modifiedStoryData.campaign!.clocks[0].paused).toBe(true);
    const adv = await run(t.modifiedStoryData, [{ name: "manage_timer", args: { action: "advance", timer: "clk_a" } }]);
    expect(adv.results[0].success).toBe(false);
    expect(adv.results[0].contextForStory).toContain("paused");
    const back = await run(t.modifiedStoryData, [{ name: "manage_timer", args: { action: "toggle_pause", timer: "clk_a" } }]);
    expect(back.modifiedStoryData.campaign!.clocks[0].paused).toBe(false);
  });

  it("cancel pauses and marks cancelled; the clock then ignores triggers", async () => {
    const s = drownedKingStory();
    const out = await run(s, [{ name: "manage_timer", args: { action: "cancel", timer: "clk_a", reason: "the king is dead" } }]);
    expect(out.modifiedStoryData.campaign!.clocks[0]).toMatchObject({ paused: true, cancelled: true });
    const scene = await run(out.modifiedStoryData, [{ name: "increment_scene", args: {} }]);
    expect(scene.modifiedStoryData.campaign!.clocks[0].filled).toBe(0);
  });

  it("trigger fills the clock at once, reporting the portents it passed", async () => {
    const s = drownedKingStory();
    const out = await run(s, [{ name: "manage_timer", args: { action: "trigger", timer: "clk_a", reason: "the dam breaks" } }]);
    expect(out.modifiedStoryData.campaign!.clocks[0].filled).toBe(6);
    expect(out.results[0].contextForStory).toContain("FULL");
    expect(out.results[0].contextForStory).toContain("the ferryman's dog won't cross");
    expect((out.results[0].result as { type: string }).type).toBe("trigger_timer");
  });

  it("reports an unknown timer", async () => {
    const out = await run(drownedKingStory(), [{ name: "manage_timer", args: { action: "advance", timer: "nope" } }]);
    expect(out.results[0].success).toBe(false);
    expect(out.results[0].contextForStory).toContain("not found");
  });

  it("keeps today's behaviour on a story with no record", async () => {
    const s = story();
    const created = await run(s, [{ name: "manage_timer", args: { action: "create", name: "Old", ticks: 3 } }]);
    expect(created.modifiedStoryData.campaign).toBeUndefined();
    expect(created.modifiedStoryData.timers).toHaveLength(1);
    const adv = await run(created.modifiedStoryData, [{ name: "manage_timer", args: { action: "advance", timer: "Old" } }]);
    expect(adv.modifiedStoryData.timers![0].currentTicks).toBe(2);
  });
});
