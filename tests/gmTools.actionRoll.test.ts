import { afterEach, describe, expect, it, vi } from "vitest";
import { hasSatisfiedRollGate } from "@/app/misc/reasoningTiers";
import { executeGMTools } from "@/app/misc/gmExecutor";
import type { GMActionRollResult } from "@/app/misc/gmExecutor";
import { mockStory, run } from "./helpers/systemsHarness";

afterEach(() => vi.restoreAllMocks());

const base = { stat_name: "Heart", stat_value: 2, reason: "Face danger" };

async function roll(action: number, challenge: [number, number], extra: Record<string, unknown> = {}) {
  return run(mockStory(), "action_roll", { ...base, dice: { action, challenge }, ...extra });
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
    const cap = await run(mockStory(), "action_roll", {
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

  it("rejects invalid given dice and a missing stat value", async () => {
    const bad = await roll(7, [2, 2]);
    expect(bad.result.success).toBe(false);
    expect(bad.result.contextForStory).toContain("ERROR");
    const bad2 = await roll(3, [0, 11]);
    expect(bad2.result.success).toBe(false);
    const none = await run(mockStory(), "action_roll", { stat_name: "Heart", reason: "x" });
    expect(none.result.success).toBe(false);
  });

  it("rolls a d6 and two d10 digitally when no dice are given", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const { result } = await run(mockStory(), "action_roll", base);
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
      mockStory(),
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
});
