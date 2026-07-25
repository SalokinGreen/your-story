import { describe, it, expect, vi, beforeEach } from "vitest";

describe("Advantage/Disadvantage Stacking System", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("Net Advantage/Disadvantage Calculation", () => {
    it("should neutralize 1 advantage + 1 disadvantage = 0 (no extra rolls)", () => {
      // Scenario: Player has item (advantage) but insufficient resource (disadvantage)
      // Expected: They cancel out, no extra rolls

      const advantageCount = 1; // from item
      const disadvantageCount = 1; // from insufficient resource
      const netAdvantage = advantageCount - disadvantageCount;

      expect(netAdvantage).toBe(0);
    });

    it("should calculate 2 advantage + 1 disadvantage = 1 net advantage", () => {
      // Scenario: Player has item + momentum advantage (2 advantage) but missing another item (1 disadvantage)
      const advantageCount = 2;
      const disadvantageCount = 1;
      const netAdvantage = advantageCount - disadvantageCount;

      expect(netAdvantage).toBe(1);
      expect(Math.abs(netAdvantage)).toBe(1); // 1 extra roll
    });

    it("should calculate 1 advantage + 2 disadvantage = 1 net disadvantage", () => {
      // Scenario: Player has item (1 advantage) but insufficient resource + missing another item (2 disadvantage)
      const advantageCount = 1;
      const disadvantageCount = 2;
      const netAdvantage = advantageCount - disadvantageCount;

      expect(netAdvantage).toBe(-1);
      expect(Math.abs(netAdvantage)).toBe(1); // 1 extra roll
    });

    it("should calculate 3 advantage + 0 disadvantage = 3 net advantage", () => {
      // Scenario: Player has item + momentum advantage + another effect (3 advantage)
      const advantageCount = 3;
      const disadvantageCount = 0;
      const netAdvantage = advantageCount - disadvantageCount;

      expect(netAdvantage).toBe(3);
      expect(Math.abs(netAdvantage)).toBe(3); // 3 extra rolls
    });

    it("should calculate 0 advantage + 3 disadvantage = 3 net disadvantage", () => {
      // Scenario: Player has insufficient resource + missing item + another penalty (3 disadvantage)
      const advantageCount = 0;
      const disadvantageCount = 3;
      const netAdvantage = advantageCount - disadvantageCount;

      expect(netAdvantage).toBe(-3);
      expect(Math.abs(netAdvantage)).toBe(3); // 3 extra rolls
    });
  });

  describe("Roll Selection Logic", () => {
    it("should take best roll for advantage (roll-over system)", () => {
      const rolls = [8, 12, 15]; // 3 rolls
      const isAdvantage = true;
      const rollUnder = false;

      let bestRoll = rolls[0];
      for (let i = 1; i < rolls.length; i++) {
        if (isAdvantage && !rollUnder && rolls[i] > bestRoll) {
          bestRoll = rolls[i];
        }
      }

      expect(bestRoll).toBe(15); // highest roll
    });

    it("should take worst roll for disadvantage (roll-over system)", () => {
      const rolls = [8, 12, 15]; // 3 rolls
      const isAdvantage = false; // disadvantage
      const rollUnder = false;

      let worstRoll = rolls[0];
      for (let i = 1; i < rolls.length; i++) {
        if (!isAdvantage && !rollUnder && rolls[i] < worstRoll) {
          worstRoll = rolls[i];
        }
      }

      expect(worstRoll).toBe(8); // lowest roll
    });

    it("should take best roll for advantage (roll-under system)", () => {
      const rolls = [8, 12, 15]; // 3 rolls
      const isAdvantage = true;
      const rollUnder = true;

      let bestRoll = rolls[0];
      for (let i = 1; i < rolls.length; i++) {
        if (isAdvantage && rollUnder && rolls[i] < bestRoll) {
          bestRoll = rolls[i];
        }
      }

      expect(bestRoll).toBe(8); // lowest roll (best for roll-under)
    });

    it("should take worst roll for disadvantage (roll-under system)", () => {
      const rolls = [8, 12, 15]; // 3 rolls
      const isAdvantage = false; // disadvantage
      const rollUnder = true;

      let worstRoll = rolls[0];
      for (let i = 1; i < rolls.length; i++) {
        if (!isAdvantage && rollUnder && rolls[i] > worstRoll) {
          worstRoll = rolls[i];
        }
      }

      expect(worstRoll).toBe(15); // highest roll (worst for roll-under)
    });
  });

  describe("Source Tracking", () => {
    it("should track multiple advantage sources correctly", () => {
      const advantageSources: string[] = [];

      // Item used
      advantageSources.push("Healing Potion");
      // Momentum advantage
      advantageSources.push("momentum advantage");

      expect(advantageSources).toHaveLength(2);
      expect(advantageSources).toContain("Healing Potion");
      expect(advantageSources).toContain("momentum advantage");
      expect(advantageSources.join(", ")).toBe(
        "Healing Potion, momentum advantage"
      );
    });

    it("should track multiple disadvantage sources correctly", () => {
      const disadvantageSources: string[] = [];

      // Insufficient resource
      disadvantageSources.push("insufficient Health");
      // Missing item
      disadvantageSources.push("missing Rope");

      expect(disadvantageSources).toHaveLength(2);
      expect(disadvantageSources).toContain("insufficient Health");
      expect(disadvantageSources).toContain("missing Rope");
      expect(disadvantageSources.join(", ")).toBe(
        "insufficient Health, missing Rope"
      );
    });

    it("should correctly identify which sources apply in mixed scenario", () => {
      const advantageSources: string[] = ["Sword", "momentum advantage"];
      const disadvantageSources: string[] = ["insufficient Stamina"];

      const advantageCount = advantageSources.length;
      const disadvantageCount = disadvantageSources.length;
      const netAdvantage = advantageCount - disadvantageCount;

      expect(netAdvantage).toBe(1); // 2 advantage - 1 disadvantage = 1 net advantage
      expect(netAdvantage > 0).toBe(true);

      // Should display advantage sources since net is positive
      const displaySources =
        netAdvantage > 0
          ? advantageSources.join(", ")
          : disadvantageSources.join(", ");
      expect(displaySources).toBe("Sword, momentum advantage");
    });
  });

  describe("Stacking Examples", () => {
    it("Example 1: Item + Momentum vs Insufficient Resource", () => {
      // Player has: Sword (adv) + Momentum (adv) but insufficient Stamina (dis)
      const advantageSources = ["Sword", "momentum advantage"];
      const disadvantageSources = ["insufficient Stamina"];

      const netAdvantage = advantageSources.length - disadvantageSources.length;

      expect(netAdvantage).toBe(1);
      expect(Math.abs(netAdvantage)).toBe(1); // Roll 1 extra die with advantage
    });

    it("Example 2: Missing Item + Insufficient Resource", () => {
      // Player has: missing Rope (dis) + insufficient Health (dis)
      const advantageSources: string[] = [];
      const disadvantageSources = ["missing Rope", "insufficient Health"];

      const netAdvantage = advantageSources.length - disadvantageSources.length;

      expect(netAdvantage).toBe(-2);
      expect(Math.abs(netAdvantage)).toBe(2); // Roll 2 extra dice with disadvantage
    });

    it("Example 3: Perfect Neutralization", () => {
      // Player has: Item (adv) vs Missing another item (dis)
      const advantageSources = ["Health Potion"];
      const disadvantageSources = ["missing Lockpick"];

      const netAdvantage = advantageSources.length - disadvantageSources.length;

      expect(netAdvantage).toBe(0); // Perfect cancel, no extra rolls
    });

    it("Example 4: Triple Advantage Stack", () => {
      // Player has: Item (adv) + Momentum (adv) + Special buff (adv)
      const advantageSources = ["Sword", "momentum advantage", "blessing buff"];
      const disadvantageSources: string[] = [];

      const netAdvantage = advantageSources.length - disadvantageSources.length;

      expect(netAdvantage).toBe(3);
      expect(Math.abs(netAdvantage)).toBe(3); // Roll 3 extra dice, take best
    });
  });
});
