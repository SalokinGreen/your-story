import { describe, it, expect } from "vitest";
import {
  ACTION_SCORE_CAP,
  MeterError,
  TICKS_PER_MARK,
  actionScore,
  adjustMeter,
  createMeter,
  createMeterSet,
  createTrack,
  currentThreshold,
  filledBoxes,
  halveTrack,
  isDuplicate,
  markProgress,
  meterId,
  pruneDedupKeys,
  resolveAgainstChallengeDice,
  setMeterCap,
  setMeterFloor,
  setMeterValue,
  trackId,
} from "@/app/misc/metersAndTracks";
import type { MeterDefinition, TrackRank } from "@/app/misc/structs";

const stress: MeterDefinition = { name: "Stress", min: 0, max: 6, start: 2 };
const exposure: MeterDefinition = {
  name: "Exposure",
  min: 0,
  max: 6,
  start: 2,
  thresholds: [
    { at: 3, label: "Attention" },
    { at: 4, label: "Pressure" },
  ],
};

describe("meters", () => {
  it("ids are case and spacing insensitive", () => {
    expect(meterId("  Mira ", "Stress")).toBe(meterId("mira", "  stress"));
    expect(trackId("Mira", "Vow")).toBe("track:mira::vow");
  });

  it("clamps at the cap and reports how much it removed", () => {
    const m = createMeter(stress, "Mira");
    const { meter, change } = adjustMeter(m, 7);
    expect(meter.value).toBe(6);
    expect(change.before).toBe(2);
    expect(change.after).toBe(6);
    expect(change.clampedBy).toBe(3);
    expect(change.atCap).toBe(true);
  });

  it("clamps at the floor", () => {
    const m = createMeter(stress, "Mira");
    const { meter, change } = adjustMeter(m, -5);
    expect(meter.value).toBe(0);
    expect(change.clampedBy).toBe(3);
    expect(change.atFloor).toBe(true);
  });

  it("reports no clamp when the change fits", () => {
    const { change } = adjustMeter(createMeter(stress, "Mira"), 1);
    expect(change.clampedBy).toBe(0);
    expect(change.atCap).toBe(false);
  });

  it("refuses a fall on an onlyUp meter", () => {
    const beast = createMeter(
      { name: "Beast", min: 0, max: 10, start: 3, onlyUp: true },
      "Mira",
    );
    expect(() => adjustMeter(beast, -1)).toThrow(MeterError);
    expect(() => setMeterValue(beast, 1)).toThrow(MeterError);
    expect(adjustMeter(beast, 2).meter.value).toBe(5);
  });

  it("reports thresholds crossed in both directions", () => {
    const m = createMeter(exposure, "world");
    const up = adjustMeter(m, 2);
    expect(up.change.crossedUp.map((t) => t.label)).toEqual([
      "Attention",
      "Pressure",
    ]);
    expect(currentThreshold(up.meter)?.label).toBe("Pressure");
    const down = adjustMeter(up.meter, -2);
    expect(down.change.crossedDown.map((t) => t.label)).toEqual([
      "Attention",
      "Pressure",
    ]);
    expect(currentThreshold(down.meter)).toBeUndefined();
  });

  it("setMeterCap pulls the value down to the new cap", () => {
    const m = adjustMeter(createMeter(stress, "Mira"), 4).meter; // 6
    const { meter, change } = setMeterCap(m, 5);
    expect(meter.cap).toBe(5);
    expect(meter.value).toBe(5);
    expect(change.before).toBe(6);
    expect(change.after).toBe(5);
    expect(() => setMeterCap(m, 9)).toThrow(MeterError);
  });

  it("setMeterFloor pushes the value up", () => {
    const m = createMeter(stress, "Mira");
    const { meter } = setMeterFloor(m, 3);
    expect(meter.floor).toBe(3);
    expect(meter.value).toBe(3);
    expect(() => setMeterFloor(m, 7)).toThrow(MeterError);
  });

  it("rejects invalid definitions", () => {
    expect(() =>
      createMeter({ name: "X", min: 5, max: 1, start: 2 }, "a"),
    ).toThrow(MeterError);
    expect(() =>
      createMeter({ name: "X", min: 0, max: 6, start: 9 }, "a"),
    ).toThrow(MeterError);
    expect(() =>
      createMeter({ name: "X", min: 0, max: 6, start: 1.5 }, "a"),
    ).toThrow(MeterError);
  });

  it("createMeterSet skips names the owner already has", () => {
    const existing = [createMeter(stress, "Mira")];
    const { created, skipped } = createMeterSet(
      { name: "set", meters: [stress, exposure] },
      "mira",
      existing,
    );
    expect(skipped).toEqual(["Stress"]);
    expect(created.map((m) => m.name)).toEqual(["Exposure"]);
  });
});

describe("dedup keys", () => {
  const keys = [
    { meterId: "a::stress", key: "sunlight", scope: "scene" as const, at: 3 },
    { meterId: "a::stress", key: "fire", scope: "session" as const, at: 1 },
  ];
  it("matches by meter, key, scope and position", () => {
    expect(isDuplicate(keys, "a::stress", "Sunlight", "scene", 3)).toBe(true);
    expect(isDuplicate(keys, "a::stress", "sunlight", "scene", 4)).toBe(false);
    expect(isDuplicate(keys, "a::stress", "sunlight", "session", 1)).toBe(false);
    expect(isDuplicate(keys, "b::stress", "sunlight", "scene", 3)).toBe(false);
  });
  it("prunes stale keys", () => {
    expect(pruneDedupKeys(keys, 4, 1).map((k) => k.key)).toEqual(["fire"]);
    expect(pruneDedupKeys(keys, 3, 2).map((k) => k.key)).toEqual(["sunlight"]);
  });
});

describe("progress tracks", () => {
  it("adds ticks by rank for all five ranks", () => {
    const ranks: TrackRank[] = [
      "troublesome",
      "dangerous",
      "formidable",
      "extreme",
      "epic",
    ];
    for (const r of ranks) {
      const t = createTrack("Mira", "Vow", "vow", r);
      expect(markProgress(t).track.ticks).toBe(TICKS_PER_MARK[r]);
    }
    expect(TICKS_PER_MARK.troublesome).toBe(12);
    expect(TICKS_PER_MARK.epic).toBe(1);
  });

  it("clamps at 40 ticks and reports what was actually added", () => {
    let t = createTrack("Mira", "Vow", "vow", "troublesome");
    t = { ...t, ticks: 36 };
    const r = markProgress(t, 2);
    expect(r.track.ticks).toBe(40);
    expect(r.ticksAdded).toBe(4);
    expect(r.boxesBefore).toBe(9);
    expect(r.boxesAfter).toBe(10);
  });

  it("halves the boxes, rounding down", () => {
    const t = { ...createTrack("a", "b", "vow", "epic"), ticks: 28 }; // 7 boxes
    expect(filledBoxes(t.ticks)).toBe(7);
    expect(halveTrack(t).ticks).toBe(12); // 3 boxes
  });
});

describe("challenge dice", () => {
  it("ties go to the dice", () => {
    expect(resolveAgainstChallengeDice(5, 5, 3).outcome).toBe("weak_hit");
    expect(resolveAgainstChallengeDice(5, 5, 5).outcome).toBe("miss");
  });
  it("strong, weak, miss and match", () => {
    expect(resolveAgainstChallengeDice(8, 3, 7).outcome).toBe("strong_hit");
    expect(resolveAgainstChallengeDice(4, 3, 7).outcome).toBe("weak_hit");
    expect(resolveAgainstChallengeDice(2, 3, 7).outcome).toBe("miss");
    expect(resolveAgainstChallengeDice(8, 4, 4).match).toBe(true);
    expect(resolveAgainstChallengeDice(8, 4, 5).match).toBe(false);
  });
});

describe("actionScore", () => {
  it("caps adds at 2 and the score at 10", () => {
    const r = actionScore(6, 3, 3, 0);
    expect(r.addsApplied).toBe(2);
    expect(r.score).toBe(ACTION_SCORE_CAP);
    expect(r.capped).toBe(true);
  });
  it("subtracts a penalty and does not cap a low score", () => {
    const r = actionScore(3, 2, 1, 2);
    expect(r.score).toBe(4);
    expect(r.capped).toBe(false);
  });
  it("ignores negative adds", () => {
    expect(actionScore(3, 2, -4, 0).addsApplied).toBe(0);
  });
});
