import { describe, expect, it } from "vitest";
import {
  applyTurnEvents,
  defaultClockVisibility,
  defaultPortents,
  effectivePortents,
  newTurnLedger,
  tickClock,
  ticksForEvents,
} from "@/app/misc/campaign/clocks";
import { turnEventsFrom } from "@/app/misc/campaign/events";
import { clock, drownedKingStory, front, record, run, story } from "./helpers/campaignFixtures";

describe("defaultPortents", () => {
  it("spreads three portents on six segments at 2, 4 and 6", () => {
    expect(defaultPortents(front(), 6).map((p) => p.at)).toEqual([2, 4, 6]);
  });
  it("spreads two portents on four segments at 2 and 4, and one on eight at 8", () => {
    expect(defaultPortents({ portents: front().portents.slice(0, 2) }, 4).map((p) => p.at)).toEqual([2, 4]);
    expect(defaultPortents({ portents: front().portents.slice(0, 1) }, 8).map((p) => p.at)).toEqual([8]);
  });
  it("uses the author's thresholds when every one is set", () => {
    const f = front({ portents: [{ at: 1, text: "a" }, { at: 5, text: "b" }] });
    expect(effectivePortents(f, 6).map((p) => p.at)).toEqual([1, 5]);
  });
});

describe("tickClock", () => {
  const rec = record({ fronts: [front()] });

  it("clamps to [0, segments] and reports a fill once", () => {
    const c = clock({ filled: 5 });
    const up = tickClock(c, 4, "x", rec);
    expect(up.clock.filled).toBe(6);
    expect(up.applied).toBe(1);
    expect(up.filled).toBe(true);
    const again = tickClock(up.clock, 1, "x", rec);
    expect(again.applied).toBe(0);
    expect(again.filled).toBe(false);
    expect(tickClock(clock({ filled: 1 }), -9, "x", rec).clock.filled).toBe(0);
  });

  it("reports each portent once, even after an untick and a refill", () => {
    let c = clock();
    const first = tickClock(c, 2, "x", rec);
    expect(first.crossed.map((p) => p.text)).toEqual(["the river runs backwards at night"]);
    c = first.clock;
    c = tickClock(c, -2, "x", rec).clock;
    expect(c.filled).toBe(0);
    const refill = tickClock(c, 2, "x", rec);
    expect(refill.crossed).toEqual([]);
    expect(refill.clock.crossed).toEqual([2]);
  });

  it("reports several portents when one tick passes them both", () => {
    const r = tickClock(clock({ filled: 1 }), 4, "x", rec);
    expect(r.crossed.map((p) => p.at)).toEqual([2, 4]);
  });

  it("does not move a paused or cancelled clock", () => {
    expect(tickClock(clock({ paused: true }), 1, "x", rec)).toMatchObject({ applied: 0, refused: "paused" });
    expect(tickClock(clock({ paused: true, cancelled: true }), 1, "x", rec)).toMatchObject({ refused: "cancelled" });
  });

  it("gives a clock with no front no portents", () => {
    const r = tickClock(clock({ id: "clk_other" }), 3, "x", record({ fronts: [front({ clockId: "clk_a" })] }));
    expect(r.crossed).toEqual([]);
  });
});

describe("visibility defaults (decision 231)", () => {
  it("is shown for sandbox, adventure path and slice of life, hidden for mystery and horror", () => {
    expect(defaultClockVisibility("sandbox")).toBe(true);
    expect(defaultClockVisibility("adventure_path")).toBe(true);
    expect(defaultClockVisibility("slice_of_life")).toBe(true);
    expect(defaultClockVisibility("mystery")).toBe(false);
    expect(defaultClockVisibility("horror")).toBe(false);
  });
});

describe("ticksForEvents", () => {
  const ledger = newTurnLedger();

  it("ticks a clock once per trigger per turn, however many misses", () => {
    const r = record({ clocks: [clock({ triggers: ["miss"] })] });
    const plans = ticksForEvents(
      r,
      [
        { kind: "miss", toolCallId: "a", order: 0 },
        { kind: "miss", toolCallId: "b", order: 1 },
        { kind: "miss", toolCallId: "c", order: 2 },
      ],
      ledger,
    );
    expect(plans).toHaveLength(1);
  });

  it("ticks once for each different trigger the clock lists", () => {
    const r = record({ clocks: [clock({ triggers: ["miss", "scene"] })] });
    const plans = ticksForEvents(
      r,
      [
        { kind: "miss", toolCallId: "a", order: 0 },
        { kind: "scene", toolCallId: "b", order: 1 },
        { kind: "rest", toolCallId: "c", order: 2 },
      ],
      ledger,
    );
    expect(plans.map((p) => p.kind)).toEqual(["miss", "scene"]);
  });

  it("skips a paused clock, a cancelled one, a full one and a manual-only one", () => {
    const r = record({
      clocks: [
        clock({ id: "p", paused: true }),
        clock({ id: "c", cancelled: true }),
        clock({ id: "f", filled: 6 }),
        clock({ id: "m", triggers: ["manual"] }),
      ],
    });
    expect(ticksForEvents(r, [{ kind: "scene", toolCallId: "a", order: 0 }], ledger)).toEqual([]);
  });

  it("ignores events older than a clock created this turn", () => {
    const r = record({ clocks: [clock()] });
    const l = { ...newTurnLedger(), clockCreatedAt: { clk_a: 2 } };
    const plans = ticksForEvents(
      r,
      [
        { kind: "scene", toolCallId: "early", order: 1 },
        { kind: "scene", toolCallId: "late", order: 3 },
      ],
      l,
    );
    expect(plans).toHaveLength(1);
    expect(plans[0].toolCallId).toBe("late");
  });

  it("does not tick again for a key the ledger already consumed", () => {
    const r = record({ clocks: [clock()] });
    const l = { ...newTurnLedger(), consumed: ["clk_a:scene"] };
    expect(ticksForEvents(r, [{ kind: "scene", toolCallId: "a", order: 0 }], l)).toEqual([]);
  });
});

describe("applyTurnEvents", () => {
  it("applies a tick, reports the portent and the fill, and keeps the ledger", () => {
    const s = drownedKingStory();
    const rec = s.campaign!;
    rec.clocks[0].filled = 1;
    const first = applyTurnEvents(rec, newTurnLedger(), [{ kind: "scene", toolCallId: "t1" }]);
    expect(rec.clocks[0].filled).toBe(2);
    expect(first.reports[0].portents).toEqual(["the river runs backwards at night"]);
    expect(first.reports[0].line).toContain("Portent reached: the river runs backwards at night");
    expect(first.reports[0].visible).toBe(false);
    // a second scene in the same turn does nothing
    const second = applyTurnEvents(rec, first.ledger, [{ kind: "scene", toolCallId: "t2" }]);
    expect(second.reports).toEqual([]);
    expect(rec.clocks[0].filled).toBe(2);
  });

  it("says FULL and quotes the doom when the clock fills", () => {
    const s = drownedKingStory();
    s.campaign!.clocks[0].filled = 5;
    const r = applyTurnEvents(s.campaign!, newTurnLedger(), [{ kind: "miss", toolCallId: "t" }]);
    expect(r.reports[0].full).toBe(true);
    expect(r.reports[0].line).toContain("FULL: the drowned walk into the village");
  });
});

describe("turnEventsFrom (typed results, never success)", () => {
  const res = (toolName: string, result: unknown, extra: Record<string, unknown> = {}) => ({
    toolName,
    success: false,
    result,
    contextForStory: "[x]",
    ...extra,
  });
  it("reads a graded miss although success is false", () => {
    expect(turnEventsFrom(res("action_roll", { type: "action_roll", outcome: "miss" }))).toEqual(["miss"]);
    expect(turnEventsFrom(res("feat_roll", { type: "feat_roll", outcome: "miss" }))).toEqual(["miss"]);
    expect(turnEventsFrom(res("manage_track", { type: "manage_track", action: "progress_roll", outcome: "miss" }))).toEqual(["miss"]);
    expect(turnEventsFrom(res("record_challenge_result", { type: "record_challenge_result", outcome: "failure" }))).toEqual(["miss"]);
  });
  it("is no event for a hit, a non-roll track action or a recorded success", () => {
    expect(turnEventsFrom(res("action_roll", { type: "action_roll", outcome: "weak_hit" }))).toEqual([]);
    expect(turnEventsFrom(res("manage_track", { type: "manage_track", action: "mark", outcome: "miss" }))).toEqual([]);
    expect(turnEventsFrom(res("record_challenge_result", { type: "record_challenge_result", outcome: "success" }))).toEqual([]);
  });
  it("reads the executed scene, rest and session tools", () => {
    expect(turnEventsFrom({ toolName: "increment_scene", success: true, result: { type: "state_change" }, contextForStory: "[State: ok]" })).toEqual(["scene"]);
    expect(turnEventsFrom({ toolName: "take_rest", success: true, result: { type: "take_rest" }, contextForStory: "[x]" })).toEqual(["rest"]);
    expect(turnEventsFrom({ toolName: "end_session", success: true, result: { type: "end_session" }, contextForStory: "[x]" })).toEqual(["session"]);
  });
  it("is no event for a refused call", () => {
    expect(
      turnEventsFrom({ toolName: "action_roll", success: false, result: { type: "action_roll", outcome: "miss" }, contextForStory: "[ERROR: nope]" }),
    ).toEqual([]);
    expect(turnEventsFrom({ toolName: "increment_scene", success: false, result: { type: "state_change" }, contextForStory: "[State Failed: x]" })).toEqual([]);
  });
});

describe("clocks across a turn's rounds, through the executor", () => {
  async function failOnce(s: ReturnType<typeof story>, ledger?: Parameters<typeof run>[2]) {
    return run(
      s,
      [
        {
          name: "start_challenge",
          args: { name: "The bridge", description: "x", required_successes: 3, max_failures: 5, primary_stat: "Nerve", difficulty: "hard" },
        },
        { name: "record_challenge_result", args: { outcome: "failure", description: "slips" } },
      ],
      ledger,
    );
  }

  it("ticks a miss clock once for a miss in round 1 and a miss in round 3", async () => {
    const s = drownedKingStory();
    s.campaign!.clocks[0].triggers = ["miss"];
    const r1 = await failOnce(s);
    expect(r1.modifiedStoryData.campaign!.clocks[0].filled).toBe(1);
    expect(r1.results[1].clockReports).toHaveLength(1);
    expect(r1.results[1].contextForStory).toContain('Clock (hidden) "The barrow wakes" 0/6 → 1/6');
    // round 2: something unrelated
    const r2 = await run(r1.modifiedStoryData, [{ name: "calculate", args: { expression: "1+1", reason: "x" } }], r1.turnLedger);
    // round 3: another miss in the same turn (the challenge is still active)
    const r3 = await run(
      r2.modifiedStoryData,
      [{ name: "record_challenge_result", args: { outcome: "failure", description: "again" } }],
      r2.turnLedger,
    );
    expect(r3.modifiedStoryData.campaign!.clocks[0].filled).toBe(1);
    expect(r3.results[0].clockReports).toBeUndefined();
  });

  it("ticks again on the next turn (a fresh ledger)", async () => {
    const s = drownedKingStory();
    s.campaign!.clocks[0].triggers = ["miss"];
    const r1 = await failOnce(s);
    const r2 = await run(
      r1.modifiedStoryData,
      [{ name: "record_challenge_result", args: { outcome: "failure", description: "next turn" } }],
    );
    expect(r2.modifiedStoryData.campaign!.clocks[0].filled).toBe(2);
  });

  it("honours a pause earlier in the same batch", async () => {
    const s = drownedKingStory();
    s.campaign!.clocks[0].triggers = ["miss"];
    const out = await run(s, [
      { name: "campaign", args: { action: "pause", id: "clk_a" } },
      {
        name: "start_challenge",
        args: { name: "The bridge", description: "x", required_successes: 3, max_failures: 5, primary_stat: "Nerve", difficulty: "hard" },
      },
      { name: "record_challenge_result", args: { outcome: "failure", description: "slips" } },
    ]);
    expect(out.modifiedStoryData.campaign!.clocks[0].filled).toBe(0);
    expect(out.modifiedStoryData.campaign!.clocks[0].paused).toBe(true);
  });

  it("does not tick a clock made in the same batch by an earlier event, but ticks it from the next one", async () => {
    const s = story({ campaign: record({ style: "sandbox" }) });
    const out = await run(s, [
      { name: "increment_scene", args: {} },
      { name: "campaign", args: { action: "add", part: "clock", data: { name: "Late", segments: 4, triggers: ["scene"] } } },
    ]);
    expect(out.modifiedStoryData.campaign!.clocks[0].filled).toBe(0);
    // the scene event already ticked nothing; a later scene in another round does tick it
    // (a fresh ledger would too; here the key was never consumed for this clock)
    const next = await run(out.modifiedStoryData, [{ name: "increment_scene", args: {} }], out.turnLedger);
    expect(next.modifiedStoryData.campaign!.clocks[0].filled).toBe(1);
  });

  it("ticks nothing when the story has no campaign record", async () => {
    const s = story();
    const out = await failOnce(s);
    expect(out.modifiedStoryData.campaign).toBeUndefined();
    expect(out.results[1].clockReports).toBeUndefined();
  });
});
