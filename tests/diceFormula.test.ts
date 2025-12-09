import { describe, it, expect, vi } from "vitest";
import {
  parseFormula,
  rollFormula,
  rollParsedFormula,
  validateFormula,
  extractVariables,
  createCharacterResolver,
  buildDiceFormula,
  buildAdvantageRoll,
  buildDisadvantageRoll,
  formatRollResult,
  getRollValues,
  getTotalExplosions,
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

    it("includes breakdown", () => {
      vi.spyOn(Math, "random").mockReturnValue(0.5);

      const result = rollFormula("1d20+5");
      expect(result.breakdown).toContain("1d20");
      expect(result.breakdown).toContain("11");
      expect(result.breakdown).toContain("16");

      vi.restoreAllMocks();
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

    it("resolves _mod suffix with D&D formula", () => {
      const resolver = createCharacterResolver({ Strength: 16 });
      // floor((16 - 10) / 2) = 3
      expect(resolver("Strength_mod")).toBe(3);
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
});
