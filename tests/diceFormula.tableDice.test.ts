/**
 * The dice the Blood & Bone table notes name (bb-expansion-design 4.2): a bare
 * "d20" is 1d20, d66 is refused with the way to roll it, and residue the
 * tokenizer cannot account for is refused rather than dropped.
 */
import { describe, expect, it } from "vitest";
import { parseFormula, rollFormula, validateFormula } from "@/app/misc/diceFormula";
import { mockStory, run } from "./helpers/systemsHarness";

describe("table dice", () => {
  it("reads a bare dN as 1dN", () => {
    for (const f of ["d20", "d100", "d6+2", "2d6+d4", "1d6-d4", " d10 "]) {
      expect(validateFormula(f).isValid, f).toBe(true);
    }
    const p = parseFormula("d20");
    expect(p.tokens).toHaveLength(1);
    expect(p.tokens[0]).toMatchObject({ type: "dice", value: { count: 1, sides: 20 } });
    const totals = new Set<number>();
    for (let i = 0; i < 400; i++) totals.add(rollFormula("d20").total);
    expect(Math.max(...totals)).toBeGreaterThan(15);
    expect(Math.min(...totals)).toBeLessThan(6);
  });

  it("refuses d66 in every spelling, with the way to roll it", () => {
    for (const f of ["d66", "1d66", "2d66", "d66+1", "3d66kh1"]) {
      const v = validateFormula(f);
      expect(v.isValid, f).toBe(false);
      expect(v.error, f).toContain('formulas ["1d6","1d6"]');
      expect(v.error, f).toContain("tens");
    }
    expect(validateFormula("1d660").isValid).toBe(true);
    expect(validateFormula("1d6").isValid).toBe(true);
  });

  it("refuses arithmetic the tokenizer would silently drop, and keeps labels", () => {
    for (const f of ["2d6*2", "1d20/2", "1d6*10+1d6"]) {
      expect(validateFormula(f).isValid, f).toBe(false);
    }
    // The GM labels its pools; a label is ignored, as it always was.
    for (const f of ["1d6 + 2 (Nerve)", "1d6+2 Shadow", "(1d6)"]) {
      expect(validateFormula(f).isValid, f).toBe(true);
    }
    expect(validateFormula("1d20 + 5 - 1d4").isValid).toBe(true);
    expect(validateFormula("4d6kh3!").isValid).toBe(true);
    expect(validateFormula("1d20+{{STR}}").isValid).toBe(true);
  });

  it("formula_roll tells the GM how to roll a d66 and throws nothing", async () => {
    const { result } = await run(mockStory(), "formula_roll", {
      formulas: ["d66"],
      reason: "a clue",
    });
    expect(result.success).toBe(false);
    expect(result.contextForStory).toContain('formulas ["1d6","1d6"]');
  });
});
