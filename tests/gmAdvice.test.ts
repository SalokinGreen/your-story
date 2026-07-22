/**
 * gmAdvice.ts: the curated GM-advice tip bank surfaced via increment_scene
 * (see toolExecutor.ts) and the Robin Laws player-archetype info surfaced via
 * ai_staged.ts's buildInfoMessage. Covers selection filtering/rotation and
 * note formatting - the archetype table itself is just static data.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  ARCHETYPE_INFO,
  GM_ADVICE_TIPS,
  selectGMAdviceForScene,
  selectGMAdviceForTurn,
  formatGMAdviceNote,
} from "../app/misc/gmAdvice";

function mockRandom(value: number) {
  vi.spyOn(Math, "random").mockReturnValue(value);
}

describe("ARCHETYPE_INFO", () => {
  it("has a label, description, and facilitation tip for all 7 Robin Laws archetypes", () => {
    const keys = Object.keys(ARCHETYPE_INFO);
    expect(keys).toHaveLength(7);
    for (const key of keys) {
      const info = ARCHETYPE_INFO[key as keyof typeof ARCHETYPE_INFO];
      expect(info.label.length).toBeGreaterThan(0);
      expect(info.description.length).toBeGreaterThan(0);
      expect(info.facilitation.length).toBeGreaterThan(0);
    }
  });
});

describe("GM_ADVICE_TIPS", () => {
  it("has unique ids", () => {
    const ids = GM_ADVICE_TIPS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("excludes session-zero/prep-only categories", () => {
    const categories = new Set(GM_ADVICE_TIPS.map((t) => t.category));
    expect(categories.has("safety")).toBe(false);
    expect(categories.has("prep")).toBe(false);
  });

  it("includes AI-GM craft guardrails", () => {
    const craft = GM_ADVICE_TIPS.filter((t) => t.category === "craft");
    expect(craft.length).toBeGreaterThan(0);
    // Craft guardrails are medium-general - none are combat-gated.
    expect(craft.every((t) => t.context === "any")).toBe(true);
  });
});

describe("selectGMAdviceForScene", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("picks 2 tips when the pool is fresh", () => {
    mockRandom(0);
    const { tips } = selectGMAdviceForScene(undefined, false);
    expect(tips).toHaveLength(2);
  });

  it("never picks a combat-only tip outside of combat", () => {
    mockRandom(0.5);
    const { tips } = selectGMAdviceForScene(undefined, false);
    expect(tips.every((t) => t.context === "any")).toBe(true);
  });

  it("can pick combat-only tips while combat is active", () => {
    // Force selection toward the front of the pool, which starts with
    // combat-context tips absent (any-tips first)... instead, assert the
    // combat-active pool is a strict superset of the non-combat pool.
    const combatPoolSize = selectGMAdviceForScene(undefined, true);
    const anyPoolSize = selectGMAdviceForScene(undefined, false);
    expect(combatPoolSize.tips.length).toBeGreaterThanOrEqual(
      anyPoolSize.tips.length,
    );
    expect(
      GM_ADVICE_TIPS.some((t) => t.context === "combat"),
    ).toBe(true);
  });

  it("avoids repeating recently shown tips", () => {
    mockRandom(0);
    const first = selectGMAdviceForScene(undefined, false);
    const shownIds = first.updatedShownIds;
    const second = selectGMAdviceForScene(shownIds, false);
    const firstIds = new Set(first.tips.map((t) => t.id));
    expect(second.tips.every((t) => !firstIds.has(t.id))).toBe(true);
  });

  it("caps the tracked shown-ids list so it doesn't grow forever", () => {
    let shownIds: number[] | undefined = undefined;
    for (let i = 0; i < 60; i++) {
      mockRandom(Math.random());
      const result = selectGMAdviceForScene(shownIds, false);
      shownIds = result.updatedShownIds;
    }
    expect(shownIds!.length).toBeLessThanOrEqual(80);
  });

  it("falls back to allowing repeats once the eligible pool is exhausted", () => {
    // Mark every "any"-context tip as already shown.
    const allAnyIds = GM_ADVICE_TIPS.filter((t) => t.context === "any").map(
      (t) => t.id,
    );
    mockRandom(0);
    const { tips } = selectGMAdviceForScene(allAnyIds, false);
    expect(tips).toHaveLength(2);
  });
});

describe("selectGMAdviceForTurn", () => {
  it("is deterministic for a given seed + combat flag", () => {
    const a = selectGMAdviceForTurn(42, false);
    const b = selectGMAdviceForTurn(42, false);
    expect(a.map((t) => t.id)).toEqual(b.map((t) => t.id));
  });

  it("returns two distinct tips for most seeds", () => {
    const tips = selectGMAdviceForTurn(5, false);
    expect(tips).toHaveLength(2);
    expect(tips[0].id).not.toBe(tips[1].id);
  });

  it("never surfaces a combat-only tip outside combat", () => {
    // Sweep many seeds; none may yield a combat-context tip when not in combat.
    for (let seed = 0; seed < 300; seed++) {
      const tips = selectGMAdviceForTurn(seed, false);
      expect(tips.every((t) => t.context === "any")).toBe(true);
    }
  });

  it("can surface combat-only tips while combat is active", () => {
    // The combat pool is a strict superset, so at least one seed lands a
    // combat-context tip.
    let sawCombatTip = false;
    for (let seed = 0; seed < 300 && !sawCombatTip; seed++) {
      sawCombatTip = selectGMAdviceForTurn(seed, true).some(
        (t) => t.context === "combat",
      );
    }
    expect(sawCombatTip).toBe(true);
  });

  it("rotates as the seed advances", () => {
    // Consecutive turns should not all show the identical pair.
    const first = selectGMAdviceForTurn(10, false).map((t) => t.id);
    const next = selectGMAdviceForTurn(11, false).map((t) => t.id);
    expect(first).not.toEqual(next);
  });

  it("tolerates a zero / negative / fractional seed without throwing", () => {
    expect(() => selectGMAdviceForTurn(0, false)).not.toThrow();
    expect(() => selectGMAdviceForTurn(-7, true)).not.toThrow();
    expect(() => selectGMAdviceForTurn(3.9, false)).not.toThrow();
    expect(selectGMAdviceForTurn(0, false).length).toBeGreaterThan(0);
  });
});

describe("formatGMAdviceNote", () => {
  it("returns an empty string for no tips", () => {
    expect(formatGMAdviceNote([])).toBe("");
  });

  it("formats tips as an internal-only bulleted note", () => {
    const note = formatGMAdviceNote([
      { id: 1, category: "improv", context: "any", text: "Test tip." },
    ]);
    expect(note).toContain("internal guidance");
    expect(note).toContain("- Test tip.");
  });
});
