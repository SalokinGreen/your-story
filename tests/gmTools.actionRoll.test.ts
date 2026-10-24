import { afterEach, describe, expect, it, vi } from "vitest";
import { hasSatisfiedRollGate } from "@/app/misc/reasoningTiers";
import { executeGMTools, rollAwareToolName } from "@/app/misc/gmExecutor";
import type { GMActionRollResult } from "@/app/misc/gmExecutor";
import { mockStory, run } from "./helpers/systemsHarness";

afterEach(() => vi.restoreAllMocks());

const MANUAL = () => mockStory({ diceMode: "manual" });
const base = { stat_name: "Heart", stat_value: 2, reason: "Face danger" };

async function roll(action: number, challenge: [number, number], extra: Record<string, unknown> = {}) {
  return run(MANUAL(), "action_roll", { ...base, dice: { action, challenge }, ...extra });
}

describe("action_roll", () => {
  it("strong hit, weak hit and miss", async () => {
    // score = 3 + 2 = 5
    const strong = await roll(3, [2, 4]);
    expect(strong.result.contextForStory).toContain("STRONG HIT");
    expect(strong.result.success).toBe(true);
    const weak = await roll(3, [2, 9]);
    expect(weak.result.contextForStory).toContain("WEAK HIT");
    expect(weak.result.success).toBe(true);
    const miss = await roll(3, [6, 9]);
    expect(miss.result.contextForStory).toContain("MISS");
    expect(miss.result.success).toBe(false);
    expect(miss.result.contextForStory).not.toContain("ERROR");
  });

  it("ties go to the dice", async () => {
    const r = await roll(3, [5, 5]);
    expect((r.result.result as GMActionRollResult).outcome).toBe("miss");
    const w = await roll(3, [5, 3]);
    expect((w.result.result as GMActionRollResult).outcome).toBe("weak_hit");
  });

  it("applies at most +2 of the adds", async () => {
    const r = await roll(1, [9, 9], { adds: 5 });
    const res = r.result.result as GMActionRollResult;
    expect(res.addsApplied).toBe(2);
    expect(res.score).toBe(1 + 2 + 2);
    expect(r.result.contextForStory).toContain("Only +2 of the 5 adds");
  });

  it("subtracts the penalty and caps the score at 10", async () => {
    const pen = await roll(4, [9, 9], { penalty: 3 });
    expect((pen.result.result as GMActionRollResult).score).toBe(3);
    const cap = await run(MANUAL(), "action_roll", {
      ...base,
      stat_value: 5,
      adds: 2,
      dice: { action: 6, challenge: [9, 9] },
    });
    const res = cap.result.result as GMActionRollResult;
    expect(res.score).toBe(10);
    expect(res.capped).toBe(true);
  });

  it("reports a match", async () => {
    const r = await roll(6, [2, 2]);
    expect(r.result.contextForStory).toContain("MATCH");
  });

  // The core's rule, not "a complication on a hit" (decision 178).
  it("says what a match means for each outcome", async () => {
    const strong = await roll(6, [2, 2], { stat_value: 3 });
    expect(strong.result.contextForStory).toContain("something memorable goes right");
    const miss = await roll(1, [9, 9]);
    expect(miss.result.contextForStory).toContain("roll the miss table twice");
  });

  it("rejects invalid given dice and a missing stat value", async () => {
    const bad = await roll(7, [2, 2]);
    expect(bad.result.success).toBe(false);
    expect(bad.result.contextForStory).toContain("ERROR");
    const bad2 = await roll(3, [0, 11]);
    expect(bad2.result.success).toBe(false);
    const none = await run(MANUAL(), "action_roll", { stat_name: "Heart", reason: "x" });
    expect(none.result.success).toBe(false);
  });

  it("rolls a d6 and two d10 digitally when no dice are given", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const { result } = await run(MANUAL(), "action_roll", base);
    const res = result.result as GMActionRollResult;
    expect(res.actionDie).toBeGreaterThanOrEqual(1);
    expect(res.actionDie).toBeLessThanOrEqual(6);
    for (const d of res.challengeDice) {
      expect(d).toBeGreaterThanOrEqual(1);
      expect(d).toBeLessThanOrEqual(10);
    }
    expect(res.match).toBe(res.challengeDice[0] === res.challengeDice[1]);
  });

  it("throws all three dice in one physical toss", async () => {
    const requestDiceThrow = vi.fn(async ({ groups }: { groups: { count: number; sides: number }[] }) =>
      groups.map((g) => Array.from({ length: g.count }, () => 3)),
    );
    const out = await executeGMTools(
      [{ id: "a", function: { name: "action_roll", arguments: JSON.stringify(base) } }],
      MANUAL(),
      {},
      { requestDiceThrow } as never,
    );
    expect(requestDiceThrow).toHaveBeenCalledTimes(1);
    const sent = requestDiceThrow.mock.calls[0][0] as { groups: { sides: number; count: number }[] };
    expect(sent.groups).toEqual([
      { sides: 6, count: 1 },
      { sides: 10, count: 2 },
    ]);
    expect(out.results[0].success).toBe(true);
  });

  it("high stakes mark the scene the way formula_roll does", async () => {
    const r = await roll(3, [9, 9], { stakes: "high" });
    expect(r.result.contextForStory).toContain("[Stakes: high]");
    expect(r.story.reasoningTierState?.highStakesSceneKey).toBeDefined();
  });

  it("satisfies the M2 roll gate", () => {
    expect(hasSatisfiedRollGate(["action_roll"])).toBe(true);
    expect(hasSatisfiedRollGate(["manage_meter"])).toBe(false);
  });

  it("refuses model-supplied dice faces outside manual dice mode", async () => {
    for (const diceMode of [undefined, "ai", "physical"] as const) {
      const { result } = await run(mockStory({ diceMode }), "action_roll", {
        ...base,
        dice: { action: 6, challenge: [1, 1] },
      });
      expect(result.success).toBe(false);
      expect(result.contextForStory).toContain("[ERROR");
      expect(result.contextForStory).toContain("manual dice mode");
    }
  });

  it("clamps a negative penalty to zero so it cannot beat the adds cap", async () => {
    // d6 3 + stat 2 + adds 2 (cap) = 7; a -5 penalty must not add 5
    const { result } = await roll(3, [9, 9], { adds: 2, penalty: -5 });
    expect(result.contextForStory).toContain("= 7");
    expect(result.contextForStory).not.toContain("penalty");
    expect((result.result as GMActionRollResult).penalty).toBe(0);
  });

  it("a progress_roll counts as a roll for the M2 gate, via rollAwareToolName", async () => {
    const created = await run(mockStory({ diceMode: "manual" }), "manage_track", {
      action: "create", owner: "Mira", track: "V", kind: "vow", rank: "dangerous", reason: "x",
    });
    const { result } = await run(created.story, "manage_track", {
      action: "progress_roll", owner: "Mira", track: "V", dice: [9, 9], reason: "x",
    });
    expect(hasSatisfiedRollGate([result.toolName])).toBe(false);
    expect(rollAwareToolName(result)).toBe("progress_roll");
    expect(hasSatisfiedRollGate([rollAwareToolName(result)])).toBe(true);
    expect(result.success).toBe(false); // a miss reads as a failure to the Observer
    expect(rollAwareToolName({ toolName: "manage_track", result: { type: "manage_track", action: "mark" } })).toBe("manage_track");
  });
});
