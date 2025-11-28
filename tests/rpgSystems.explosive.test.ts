import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getRPGSystem,
  rollDice,
  checkSuccess,
  calculateResourceRequirements,
  SYSTEM_EXPLOSIVE,
} from "../app/misc/rpgSystems";

describe("Explosive Dice System", () => {
  describe("SYSTEM_EXPLOSIVE configuration", () => {
    it("should have correct system properties", () => {
      expect(SYSTEM_EXPLOSIVE.id).toBe("explosive");
      expect(SYSTEM_EXPLOSIVE.name).toBe("Exploding Dice");
      expect(SYSTEM_EXPLOSIVE.hasExplodingDice).toBe(true);
      expect(SYSTEM_EXPLOSIVE.dice.count).toBe(1);
      expect(SYSTEM_EXPLOSIVE.dice.sides).toBe(20); // Max die size
    });

    it("should have correct DC guidelines", () => {
      expect(SYSTEM_EXPLOSIVE.dc.easy).toBe(8);
      expect(SYSTEM_EXPLOSIVE.dc.medium).toBe(12);
      expect(SYSTEM_EXPLOSIVE.dc.hard).toBe(16);
      expect(SYSTEM_EXPLOSIVE.dc.veryHard).toBe(20);
      expect(SYSTEM_EXPLOSIVE.dc.impossible).toBe(30);
    });

    it("should have no stat modifiers", () => {
      // Explosive system uses pure dice rolls, no stat modifiers
      expect(SYSTEM_EXPLOSIVE.statToModifier(0)).toBe(0);
      expect(SYSTEM_EXPLOSIVE.statToModifier(50)).toBe(0);
      expect(SYSTEM_EXPLOSIVE.statToModifier(100)).toBe(0);
    });
  });

  describe("statToDieSize conversion", () => {
    const { statToDieSize } = SYSTEM_EXPLOSIVE;

    it("should convert 0-16 to d4", () => {
      expect(statToDieSize!(0)).toBe(4);
      expect(statToDieSize!(8)).toBe(4);
      expect(statToDieSize!(16)).toBe(4);
    });

    it("should convert 17-33 to d6", () => {
      expect(statToDieSize!(17)).toBe(6);
      expect(statToDieSize!(25)).toBe(6);
      expect(statToDieSize!(33)).toBe(6);
    });

    it("should convert 34-50 to d8", () => {
      expect(statToDieSize!(34)).toBe(8);
      expect(statToDieSize!(42)).toBe(8);
      expect(statToDieSize!(50)).toBe(8);
    });

    it("should convert 51-66 to d10", () => {
      expect(statToDieSize!(51)).toBe(10);
      expect(statToDieSize!(58)).toBe(10);
      expect(statToDieSize!(66)).toBe(10);
    });

    it("should convert 67-83 to d12", () => {
      expect(statToDieSize!(67)).toBe(12);
      expect(statToDieSize!(75)).toBe(12);
      expect(statToDieSize!(83)).toBe(12);
    });

    it("should convert 84-100 to d20", () => {
      expect(statToDieSize!(84)).toBe(20);
      expect(statToDieSize!(92)).toBe(20);
      expect(statToDieSize!(100)).toBe(20);
    });
  });

  describe("rollDice with explosions", () => {
    beforeEach(() => {
      vi.spyOn(Math, "random");
    });

    it("should roll d4 without explosions", () => {
      // Mock: roll 3 (not max)
      vi.mocked(Math.random).mockReturnValueOnce(0.5); // 0.5 * 4 = 2, +1 = 3
      const result = rollDice(SYSTEM_EXPLOSIVE, 4);

      expect(result.rolls).toEqual([3]);
      expect(result.total).toBe(3);
      expect(result.explosions).toBe(0);
    });

    it("should roll d4 with single explosion", () => {
      // Mock: roll 4 (max), then roll 2 (not max)
      vi.mocked(Math.random)
        .mockReturnValueOnce(0.99) // 0.99 * 4 = 3.96, +1 = 4 (max)
        .mockReturnValueOnce(0.25); // 0.25 * 4 = 1, +1 = 2

      const result = rollDice(SYSTEM_EXPLOSIVE, 4);

      expect(result.rolls).toEqual([4, 2]);
      expect(result.total).toBe(6);
      expect(result.explosions).toBe(1);
    });

    it("should roll d4 with multiple explosions", () => {
      // Mock: roll 4, 4, 4, 1 (three explosions)
      vi.mocked(Math.random)
        .mockReturnValueOnce(0.99) // 4
        .mockReturnValueOnce(0.99) // 4
        .mockReturnValueOnce(0.99) // 4
        .mockReturnValueOnce(0.01); // 1

      const result = rollDice(SYSTEM_EXPLOSIVE, 4);

      expect(result.rolls).toEqual([4, 4, 4, 1]);
      expect(result.total).toBe(13);
      expect(result.explosions).toBe(3);
    });

    it("should roll d20 without explosions", () => {
      // Mock: roll 15 (not max)
      vi.mocked(Math.random).mockReturnValueOnce(0.7); // 0.7 * 20 = 14, +1 = 15
      const result = rollDice(SYSTEM_EXPLOSIVE, 20);

      expect(result.rolls).toEqual([15]);
      expect(result.total).toBe(15);
      expect(result.explosions).toBe(0);
    });

    it("should roll d20 with single explosion", () => {
      // Mock: roll 20 (max), then roll 8
      vi.mocked(Math.random)
        .mockReturnValueOnce(0.99) // 20
        .mockReturnValueOnce(0.35); // 8

      const result = rollDice(SYSTEM_EXPLOSIVE, 20);

      expect(result.rolls).toEqual([20, 8]);
      expect(result.total).toBe(28);
      expect(result.explosions).toBe(1);
    });

    it("should roll d12 with multiple explosions", () => {
      // Mock: roll 12, 12, 4 (not 5 - math is: 0.33*12=3.96, +1=4)
      vi.mocked(Math.random)
        .mockReturnValueOnce(0.99) // 12
        .mockReturnValueOnce(0.99) // 12
        .mockReturnValueOnce(0.33); // 4

      const result = rollDice(SYSTEM_EXPLOSIVE, 12);

      expect(result.rolls).toEqual([12, 12, 4]);
      expect(result.total).toBe(28); // Changed from 29
      expect(result.explosions).toBe(2);
    });
  });

  describe("checkSuccess for explosive dice", () => {
    it("should succeed when roll >= DC", () => {
      const result = checkSuccess(SYSTEM_EXPLOSIVE, 15, 70, 12, 0);

      expect(result.success).toBe(true);
      expect(result.total).toBe(15); // Pure roll, no stat modifier
      expect(result.critical).toBe(false);
    });

    it("should fail when roll < DC", () => {
      const result = checkSuccess(SYSTEM_EXPLOSIVE, 8, 70, 12, 0);

      expect(result.success).toBe(false);
      expect(result.total).toBe(8); // Pure roll, no stat modifier
      expect(result.critical).toBe(false);
    });

    it("should not add stat value to roll (pure dice)", () => {
      // Roll = 10, Stat = 50, DC = 12
      // Should fail because 10 < 12 (stat not added)
      const result = checkSuccess(SYSTEM_EXPLOSIVE, 10, 50, 12, 0);

      expect(result.success).toBe(false);
      expect(result.total).toBe(10); // Not 60!
    });

    it("should detect critical success on high rolls", () => {
      const result = checkSuccess(SYSTEM_EXPLOSIVE, 25, 80, 20, 0);

      expect(result.success).toBe(true);
      expect(result.critical).toBe(true); // >= 20 threshold
    });

    it("should succeed exactly at DC", () => {
      const result = checkSuccess(SYSTEM_EXPLOSIVE, 12, 60, 12, 0);

      expect(result.success).toBe(true);
      expect(result.total).toBe(12);
    });

    it("should fail just below DC", () => {
      const result = checkSuccess(SYSTEM_EXPLOSIVE, 11, 60, 12, 0);

      expect(result.success).toBe(false);
      expect(result.total).toBe(11);
    });

    it("should ignore penalty parameter (no modifiers in explosive)", () => {
      // Even with penalty, only pure roll matters
      const result = checkSuccess(SYSTEM_EXPLOSIVE, 15, 70, 12, 5);

      expect(result.success).toBe(true);
      expect(result.total).toBe(15); // Penalty doesn't affect explosive dice
    });
  });

  describe("calculateResourceRequirements", () => {
    it("should calculate requirements for DC 12", () => {
      const result = calculateResourceRequirements(SYSTEM_EXPLOSIVE, 12);

      expect(result.required).toBe(4); // 12 / 3 = 4
      expect(result.penalty).toBe(0); // penaltyDivisor = 0 means no penalty mechanic
      expect(result.recovery).toBe(3); // 12 / 4 = 3
      expect(result.loss).toBe(4); // 12 / 3 = 4
    });

    it("should calculate requirements for DC 18", () => {
      const result = calculateResourceRequirements(SYSTEM_EXPLOSIVE, 18);

      expect(result.required).toBe(6); // 18 / 3 = 6
      expect(result.penalty).toBe(0); // penaltyDivisor = 0 means no penalty mechanic
      expect(result.recovery).toBe(4); // 18 / 4 = 4
      expect(result.loss).toBe(6); // 18 / 3 = 6
    });

    it("should respect minimum values for low DC", () => {
      const result = calculateResourceRequirements(SYSTEM_EXPLOSIVE, 3);

      expect(result.required).toBe(2); // Min 2
      expect(result.penalty).toBe(0); // penaltyDivisor = 0 means no penalty mechanic
      expect(result.recovery).toBe(1); // Min 1
      expect(result.loss).toBe(2); // Min 2
    });

    it("should scale appropriately for high DC", () => {
      const result = calculateResourceRequirements(SYSTEM_EXPLOSIVE, 30);

      expect(result.required).toBe(10); // 30 / 3 = 10
      expect(result.penalty).toBe(0); // penaltyDivisor = 0 means no penalty mechanic
      expect(result.recovery).toBe(7); // 30 / 4 = 7
      expect(result.loss).toBe(10); // 30 / 3 = 10
    });
  });

  describe("getRPGSystem", () => {
    it("should retrieve explosive system by ID", () => {
      const system = getRPGSystem("explosive");

      expect(system.id).toBe("explosive");
      expect(system.name).toBe("Exploding Dice");
      expect(system.hasExplodingDice).toBe(true);
    });

    it("should have statToDieSize function", () => {
      const system = getRPGSystem("explosive");

      expect(system.statToDieSize).toBeDefined();
      expect(typeof system.statToDieSize).toBe("function");
    });
  });

  describe("Upgrade system", () => {
    it("should have correct upgrade amounts", () => {
      expect(SYSTEM_EXPLOSIVE.upgrades.statUpgradeAmount).toBe(8);
      expect(SYSTEM_EXPLOSIVE.upgrades.resourceUpgradeAmount).toBe(5);
      expect(SYSTEM_EXPLOSIVE.upgrades.shopStatStartingValue).toBe(25); // d6
    });

    it("should upgrade stat through die size brackets", () => {
      const { statToDieSize } = SYSTEM_EXPLOSIVE;
      const upgradeAmount = SYSTEM_EXPLOSIVE.upgrades.statUpgradeAmount;

      // Start at 25 (d6)
      let stat = 25;
      expect(statToDieSize!(stat)).toBe(6);

      // After 1 upgrade: 25 + 8 = 33 (still d6)
      stat += upgradeAmount;
      expect(statToDieSize!(stat)).toBe(6);

      // After 2 upgrades: 33 + 8 = 41 (d8)
      stat += upgradeAmount;
      expect(statToDieSize!(stat)).toBe(8);

      // After 4 upgrades: 41 + 16 = 57 (d10)
      stat += upgradeAmount * 2;
      expect(statToDieSize!(stat)).toBe(10);

      // After 6 upgrades: 57 + 16 = 73 (d12)
      stat += upgradeAmount * 2;
      expect(statToDieSize!(stat)).toBe(12);

      // After 8 upgrades: 73 + 16 = 89 (d20)
      stat += upgradeAmount * 2;
      expect(statToDieSize!(stat)).toBe(20);
    });
  });

  describe("Edge cases", () => {
    it("should handle stat value of 0", () => {
      const { statToDieSize } = SYSTEM_EXPLOSIVE;
      expect(statToDieSize!(0)).toBe(4);
    });

    it("should handle maximum stat value", () => {
      const { statToDieSize } = SYSTEM_EXPLOSIVE;
      expect(statToDieSize!(100)).toBe(20);
      expect(statToDieSize!(999)).toBe(20); // Beyond max still d20
    });

    it("should handle negative stat (edge case)", () => {
      const { statToDieSize } = SYSTEM_EXPLOSIVE;
      expect(statToDieSize!(-10)).toBe(4); // Should default to d4
    });

    it("should handle very high DC", () => {
      const result = checkSuccess(SYSTEM_EXPLOSIVE, 50, 100, 100, 0);
      expect(result.success).toBe(false);
      expect(result.total).toBe(50);
    });

    it("should handle DC of 0", () => {
      const result = checkSuccess(SYSTEM_EXPLOSIVE, 1, 50, 0, 0);
      expect(result.success).toBe(true); // Any roll >= 0
    });
  });
});
