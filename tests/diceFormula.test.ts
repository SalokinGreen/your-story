import { describe, it, expect, vi } from "vitest";
import {
  parseFormula,
  rollFormula,
  rollFormulaAsync,
  rollParsedFormula,
  validateFormula,
  extractVariables,
  createCharacterResolver,
  createSchemaBasedResolver,
  buildDiceFormula,
  buildAdvantageRoll,
  buildDisadvantageRoll,
  formatRollResult,
  getRollValues,
  getTotalExplosions,
  extractRollNumber,
  DiceResolver,
} from "../app/misc/diceFormula";

describe("diceFormula", () => {
  describe("parseFormula", () => {
    it("parses simple dice notation", () => {
      const result = parseFormula("1d20");
      expect(result.tokens).toHaveLength(1);
      expect(result.tokens[0].type).toBe("dice");
      expect(result.tokens[0].value).toEqual({
        count: 1,
        sides: 20,
        exploding: false,
      });
    });

    it("parses dice with modifier", () => {
      const result = parseFormula("1d20+5");
      expect(result.tokens).toHaveLength(3);
      expect(result.tokens[0].type).toBe("dice");
      expect(result.tokens[1].type).toBe("operator");
      expect(result.tokens[2].type).toBe("modifier");
      expect(result.tokens[2].value).toBe(5);
    });

    it("parses negative modifiers", () => {
      const result = parseFormula("1d20-3");
      expect(result.tokens).toHaveLength(3);
      expect(result.tokens[2].value).toBe(-3);
    });

    it("parses keep highest notation", () => {
      const result = parseFormula("4d6kh3");
      expect(result.tokens[0].value).toEqual({
        count: 4,
        sides: 6,
        keepHighest: 3,
        exploding: false,
      });
    });

    it("parses keep lowest notation", () => {
      const result = parseFormula("2d20kl1");
      expect(result.tokens[0].value).toEqual({
        count: 2,
        sides: 20,
        keepLowest: 1,
        exploding: false,
      });
    });

    it("parses exploding dice", () => {
      const result = parseFormula("1d6!");
      expect(result.tokens[0].value).toEqual({
        count: 1,
        sides: 6,
        exploding: true,
      });
    });

    it("parses variables", () => {
      const result = parseFormula("1d20+{{STR_mod}}");
      expect(result.tokens).toHaveLength(3);
      expect(result.tokens[2].type).toBe("variable");
      expect(result.tokens[2].value).toBe("STR_mod");
      expect(result.variables).toContain("STR_mod");
    });

    it("parses multiple variables", () => {
      const result = parseFormula("1d20+{{proficiency}}+{{DEX_mod}}");
      expect(result.variables).toEqual(["proficiency", "DEX_mod"]);
    });

    it("parses complex formulas", () => {
      const result = parseFormula("2d6+{{STR_mod}}+2");
      expect(result.tokens).toHaveLength(5);
      expect(result.tokens[0].type).toBe("dice");
      expect(result.tokens[2].type).toBe("variable");
      expect(result.tokens[4].type).toBe("modifier");
    });

    it("parses multiple dice groups added together", () => {
      // Regression: the tokenizer used to let the "+1" of "+1d6" match as a
      // bare modifier before it could see the trailing "d6", silently
      // dropping the second dice group entirely.
      const result = parseFormula("1d12+1d6");
      expect(result.tokens).toHaveLength(3);
      expect(result.tokens[0].type).toBe("dice");
      expect(result.tokens[0].value).toEqual({
        count: 1,
        sides: 12,
        exploding: false,
      });
      expect(result.tokens[1].type).toBe("operator");
      expect(result.tokens[1].value).toBe("+");
      expect(result.tokens[2].type).toBe("dice");
      expect(result.tokens[2].value).toEqual({
        count: 1,
        sides: 6,
        exploding: false,
      });
    });

    it("parses multiple dice groups subtracted", () => {
      const result = parseFormula("2d6-1d4");
      expect(result.tokens).toHaveLength(3);
      expect(result.tokens[1].type).toBe("operator");
      expect(result.tokens[1].value).toBe("-");
      expect(result.tokens[2].type).toBe("dice");
      expect(result.tokens[2].value).toEqual({
        count: 1,
        sides: 4,
        exploding: false,
      });
    });

    it("handles whitespace", () => {
      const result = parseFormula("  1d20 + 5  ");
      expect(result.tokens).toHaveLength(3);
    });

    it("throws on invalid formula", () => {
      expect(() => parseFormula("invalid")).toThrow();
    });

    it("returns empty for empty string", () => {
      const result = parseFormula("");
      expect(result.tokens).toHaveLength(0);
    });

    it("rejects an absurd dice count instead of hanging", () => {
      expect(() => parseFormula("999999999d6")).toThrow(/dice count/i);
    });

    it("accepts the maximum allowed dice count", () => {
      expect(() => parseFormula("100d6")).not.toThrow();
    });

    it("rejects a dice count above the maximum", () => {
      expect(() => parseFormula("101d6")).toThrow(/dice count/i);
    });

    it("rejects an absurd number of sides", () => {
      expect(() => parseFormula("1d999999999")).toThrow(/dice sides/i);
    });

    it("accepts the maximum allowed sides", () => {
      expect(() => parseFormula("1d1000")).not.toThrow();
    });

    it("rejects sides above the maximum", () => {
      expect(() => parseFormula("1d1001")).toThrow(/dice sides/i);
    });

    it("rejects an exploding die with fewer than 2 sides (would explode forever)", () => {
      expect(() => parseFormula("1d1!")).toThrow(/exploding/i);
    });
  });

  describe("rollFormula", () => {
    it("rolls simple dice", () => {
      const result = rollFormula("1d20");
      expect(result.total).toBeGreaterThanOrEqual(1);
      expect(result.total).toBeLessThanOrEqual(20);
      expect(result.rolls).toHaveLength(1);
    });

    it("applies modifiers", () => {
      // Mock Math.random to return 0.5 (which gives 11 on d20)
      vi.spyOn(Math, "random").mockReturnValue(0.5);

      const result = rollFormula("1d20+5");
      expect(result.total).toBe(16); // 11 + 5

      vi.restoreAllMocks();
    });

    it("resolves variables", () => {
      vi.spyOn(Math, "random").mockReturnValue(0.5);

      const resolver = (name: string) => {
        if (name === "STR_mod") return 3;
        return undefined;
      };

      const result = rollFormula("1d20+{{STR_mod}}", resolver);
      expect(result.total).toBe(14); // 11 + 3
      expect(result.substitutedVariables).toEqual({ STR_mod: 3 });

      vi.restoreAllMocks();
    });

    it("throws on unknown variable", () => {
      expect(() => rollFormula("1d20+{{UNKNOWN}}")).toThrow(
        "Unknown variable: {{UNKNOWN}}"
      );
    });

    it("rolls and sums multiple dice groups (e.g. 1d12+1d6)", () => {
      // 0.5 on a d12 -> 7, 0.5 on a d6 -> 4
      vi.spyOn(Math, "random").mockReturnValue(0.5);

      const result = rollFormula("1d12+1d6");
      expect(result.rolls).toHaveLength(2);
      expect(result.rolls[0].subtotal).toBe(7);
      expect(result.rolls[1].subtotal).toBe(4);
      expect(result.total).toBe(11);

      vi.restoreAllMocks();
    });

    it("handles keep highest", () => {
      // Mock to return specific values: 0.1, 0.3, 0.5, 0.9 -> 1, 2, 4, 6 on d6
      let callCount = 0;
      vi.spyOn(Math, "random").mockImplementation(() => {
        const values = [0.0, 0.166, 0.5, 0.999];
        return values[callCount++ % 4];
      });

      const result = rollFormula("4d6kh3");
      // Should keep the 3 highest
      expect(result.rolls[0].keptRolls).toHaveLength(3);
      expect(result.rolls[0].droppedRolls).toHaveLength(1);

      vi.restoreAllMocks();
    });

    it("handles keep lowest", () => {
      let callCount = 0;
      vi.spyOn(Math, "random").mockImplementation(() => {
        const values = [0.0, 0.95]; // 1 and 20 on d20
        return values[callCount++ % 2];
      });

      const result = rollFormula("2d20kl1");
      expect(result.rolls[0].keptRolls).toHaveLength(1);
      expect(result.rolls[0].keptRolls[0]).toBe(1); // Keep the lowest

      vi.restoreAllMocks();
    });

    it("handles exploding dice", () => {
      // Mock: first roll is max (6), second roll is not (3)
      let callCount = 0;
      vi.spyOn(Math, "random").mockImplementation(() => {
        const values = [0.999, 0.4]; // 6 and 3 on d6
        return values[callCount++ % 2];
      });

      const result = rollFormula("1d6!");
      expect(result.total).toBe(9); // 6 + 3
      expect(result.rolls[0].explosions).toBe(1);

      vi.restoreAllMocks();
    });

    it("caps exploding dice instead of looping forever when every roll is max", () => {
      // Always roll max (2 on a d2) - without a cap this would explode forever.
      vi.spyOn(Math, "random").mockReturnValue(0.999);

      const result = rollFormula("1d2!");
      expect(result.rolls[0].explosions).toBeLessThanOrEqual(100);
      expect(Number.isFinite(result.total)).toBe(true);

      vi.restoreAllMocks();
    });

    it("includes breakdown", () => {
      vi.spyOn(Math, "random").mockReturnValue(0.5);

      const result = rollFormula("1d20+5");
      expect(result.breakdown).toContain("1d20");
      expect(result.breakdown).toContain("11");
      expect(result.breakdown).toContain("16");

      vi.restoreAllMocks();
    });
  });

  describe("rollFormulaAsync", () => {
    // These never touch Math.random - face values come entirely from the
    // injected DiceResolver (standing in for a physical dice throw), so
    // this is what proves the resolver seam actually drives the result
    // rather than a coincidental Math.random() spy elsewhere still being
    // active.
    it("uses the resolver's face values instead of Math.random", async () => {
      const resolver: DiceResolver = async (sides, count) => {
        expect(sides).toBe(20);
        expect(count).toBe(1);
        return [17];
      };

      const result = await rollFormulaAsync("1d20+5", undefined, resolver);
      expect(result.total).toBe(22); // 17 + 5
      expect(result.rolls[0].allRolls).toEqual([17]);
    });

    it("resolves variables the same way as the sync path", async () => {
      const resolver: DiceResolver = async () => [11];
      const varResolver = (name: string) =>
        name === "STR_mod" ? 3 : undefined;

      const result = await rollFormulaAsync(
        "1d20+{{STR_mod}}",
        varResolver,
        resolver
      );
      expect(result.total).toBe(14); // 11 + 3
      expect(result.substitutedVariables).toEqual({ STR_mod: 3 });
    });

    it("applies keep-highest/lowest to resolver-supplied faces", async () => {
      const resolver: DiceResolver = async (sides, count) => {
        expect(count).toBe(4);
        return [1, 2, 4, 6];
      };

      const result = await rollFormulaAsync("4d6kh3", undefined, resolver);
      expect(result.rolls[0].keptRolls.sort()).toEqual([2, 4, 6]);
      expect(result.rolls[0].droppedRolls).toEqual([1]);
    });

    it("requests one more die at a time to resolve explosions", async () => {
      const calls: number[] = [];
      let call = 0;
      const resolver: DiceResolver = async (sides, count) => {
        calls.push(count);
        call++;
        // First call: the initial die, rolls max (explodes). Second call:
        // the follow-up single die requested for the explosion, rolls 3.
        if (call === 1) return [6];
        return [3];
      };

      const result = await rollFormulaAsync("1d6!", undefined, resolver);
      expect(calls).toEqual([1, 1]); // initial die, then one explosion die
      expect(result.total).toBe(9); // 6 + 3
      expect(result.rolls[0].explosions).toBe(1);
    });

    it("falls back to the standard breakdown/total math", async () => {
      const resolver: DiceResolver = async () => [11];
      const result = await rollFormulaAsync("1d20+5", undefined, resolver);
      expect(result.breakdown).toContain("1d20");
      expect(result.breakdown).toContain("16");
    });
  });

  describe("validateFormula", () => {
    it("returns valid for correct formulas", () => {
      expect(validateFormula("1d20+5").isValid).toBe(true);
      expect(validateFormula("2d6kh1+{{STR}}").isValid).toBe(true);
    });

    it("returns invalid for bad formulas", () => {
      const result = validateFormula("not a formula");
      expect(result.isValid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it("returns variables list", () => {
      const result = validateFormula("1d20+{{STR}}+{{DEX}}");
      expect(result.variables).toEqual(["STR", "DEX"]);
    });
  });

  describe("extractVariables", () => {
    it("extracts all variables from formula", () => {
      expect(extractVariables("1d20+{{STR}}+{{DEX}}")).toEqual(["STR", "DEX"]);
    });

    it("dedupes variables", () => {
      expect(extractVariables("{{STR}}+{{STR}}")).toEqual(["STR"]);
    });

    it("returns empty for no variables", () => {
      expect(extractVariables("1d20+5")).toEqual([]);
    });
  });

  describe("createCharacterResolver", () => {
    it("resolves direct stat names", () => {
      const resolver = createCharacterResolver({ Strength: 16 });
      expect(resolver("Strength")).toBe(16);
    });

    it("resolves custom mappings first", () => {
      const resolver = createCharacterResolver(
        { Strength: 16 },
        { proficiency: 2 }
      );
      expect(resolver("proficiency")).toBe(2);
    });

    it("returns undefined for unknown", () => {
      const resolver = createCharacterResolver({});
      expect(resolver("Unknown")).toBeUndefined();
    });
  });

  describe("buildDiceFormula", () => {
    it("builds simple formula", () => {
      expect(buildDiceFormula(1, 20)).toBe("1d20");
    });

    it("adds positive modifier", () => {
      expect(buildDiceFormula(1, 20, 5)).toBe("1d20+5");
    });

    it("adds negative modifier", () => {
      expect(buildDiceFormula(1, 20, -3)).toBe("1d20-3");
    });

    it("adds variable modifier", () => {
      expect(buildDiceFormula(1, 20, "STR_mod")).toBe("1d20+{{STR_mod}}");
    });
  });

  describe("buildAdvantageRoll", () => {
    it("builds 2d20kh1", () => {
      expect(buildAdvantageRoll()).toBe("2d20kh1");
    });

    it("includes modifier", () => {
      expect(buildAdvantageRoll(5)).toBe("2d20kh1+5");
    });
  });

  describe("buildDisadvantageRoll", () => {
    it("builds 2d20kl1", () => {
      expect(buildDisadvantageRoll()).toBe("2d20kl1");
    });

    it("includes modifier", () => {
      expect(buildDisadvantageRoll("DEX_mod")).toBe("2d20kl1+{{DEX_mod}}");
    });
  });

  describe("formatRollResult", () => {
    it("formats simple roll", () => {
      vi.spyOn(Math, "random").mockReturnValue(0.5);

      const result = rollFormula("1d20+5");
      const formatted = formatRollResult(result);

      expect(formatted).toContain("1d20");
      expect(formatted).toContain("11");
      expect(formatted).toContain("**16**");

      vi.restoreAllMocks();
    });
  });

  describe("getRollValues", () => {
    it("returns flat array of all dice", () => {
      vi.spyOn(Math, "random").mockReturnValue(0.5);

      const result = rollFormula("2d6");
      const values = getRollValues(result);

      expect(values).toHaveLength(2);
      expect(values.every((v) => v >= 1 && v <= 6)).toBe(true);

      vi.restoreAllMocks();
    });
  });

  describe("getTotalExplosions", () => {
    it("returns 0 for non-exploding", () => {
      vi.spyOn(Math, "random").mockReturnValue(0.5);

      const result = rollFormula("1d6");
      expect(getTotalExplosions(result)).toBe(0);

      vi.restoreAllMocks();
    });
  });

  describe("createSchemaBasedResolver", () => {
    it("resolves number values directly", () => {
      const resolver = createSchemaBasedResolver({
        Strength: 16,
        Dexterity: 14,
      });

      expect(resolver("Strength")).toBe(16);
      expect(resolver("Dexterity")).toBe(14);
    });

    it("resolves resource values to current", () => {
      const resolver = createSchemaBasedResolver({
        HP: { current: 25, max: 50 },
      });

      expect(resolver("HP")).toBe(25);
    });

    it("resolves boolean values to 1/0", () => {
      const resolver = createSchemaBasedResolver({
        isInspired: true,
        isCursed: false,
      });

      expect(resolver("isInspired")).toBe(1);
      expect(resolver("isCursed")).toBe(0);
    });

    it("resolves array values to length", () => {
      const resolver = createSchemaBasedResolver({
        languages: ["Common", "Elvish", "Dwarvish"],
      });

      expect(resolver("languages")).toBe(3);
    });

    it("uses additional mappings first", () => {
      const resolver = createSchemaBasedResolver(
        { Strength: 16 },
        { DC: 15, advantage: 1 }
      );

      expect(resolver("DC")).toBe(15);
      expect(resolver("advantage")).toBe(1);
      expect(resolver("Strength")).toBe(16);
    });

    it("returns undefined for missing values", () => {
      const resolver = createSchemaBasedResolver({});

      expect(resolver("NonExistent")).toBeUndefined();
    });

    it("works with rollFormula", () => {
      vi.spyOn(Math, "random").mockReturnValue(0.5);

      const resolver = createSchemaBasedResolver({
        STR_mod: 3,
        proficiency: 2,
      });

      const result = rollFormula("1d20+{{STR_mod}}+{{proficiency}}", resolver);

      // d20 with 0.5 random = 11, +3 +2 = 16
      expect(result.total).toBe(16);

      vi.restoreAllMocks();
    });
  });

  describe("extractRollNumber", () => {
    it("parses a bare number", () => {
      expect(extractRollNumber("17")).toBe(17);
    });

    it("extracts a number from a sentence", () => {
      expect(extractRollNumber("I rolled a 17")).toBe(17);
      expect(extractRollNumber("natural 20!")).toBe(20);
      expect(extractRollNumber("17 plus 3 is 20")).toBe(17);
    });

    it("handles negative numbers", () => {
      expect(extractRollNumber("-3")).toBe(-3);
    });

    it("falls back to spelled-out numbers when no digits are present", () => {
      expect(extractRollNumber("seventeen")).toBe(17);
      expect(extractRollNumber("I got a natural twenty")).toBe(20);
    });

    it("returns null when no number can be found", () => {
      expect(extractRollNumber("I rolled great")).toBeNull();
      expect(extractRollNumber("")).toBeNull();
    });
  });
});
