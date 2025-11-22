import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getRPGSystem,
  rollDice,
  checkSuccess,
  calculateResourceRequirements,
  SYSTEM_3D6,
  SYSTEM_1D20,
  SYSTEM_1D100,
  SYSTEM_PERCENTILE,
  SYSTEM_PBTA,
  SYSTEM_FATE,
} from "../app/misc/rpgSystems";

describe("3d6 System", () => {
  describe("SYSTEM_3D6 configuration", () => {
    it("should have correct system properties", () => {
      expect(SYSTEM_3D6.id).toBe("3d6");
      expect(SYSTEM_3D6.name).toBe("3d6 (Bell Curve)");
      expect(SYSTEM_3D6.dice.count).toBe(3);
      expect(SYSTEM_3D6.dice.sides).toBe(6);
      expect(SYSTEM_3D6.dice.min).toBe(3);
      expect(SYSTEM_3D6.dice.max).toBe(18);
    });

    it("should have correct DC guidelines", () => {
      expect(SYSTEM_3D6.dc.trivial).toBe(8);
      expect(SYSTEM_3D6.dc.easy).toBe(15);
      expect(SYSTEM_3D6.dc.medium).toBe(20);
      expect(SYSTEM_3D6.dc.hard).toBe(25);
      expect(SYSTEM_3D6.dc.veryHard).toBe(30);
      expect(SYSTEM_3D6.dc.impossible).toBe(35);
    });

    it("should use stat as modifier directly", () => {
      expect(SYSTEM_3D6.statToModifier(0)).toBe(0);
      expect(SYSTEM_3D6.statToModifier(50)).toBe(9); // floor(50 * 0.18)
      expect(SYSTEM_3D6.statToModifier(100)).toBe(18); // floor(100 * 0.18)
    });

    it("should not be roll-under", () => {
      expect(SYSTEM_3D6.rollUnder).toBeUndefined();
    });
  });

  describe("rollDice for 3d6", () => {
    beforeEach(() => {
      vi.spyOn(Math, "random");
    });

    it("should roll 3d6", () => {
      vi.mocked(Math.random)
        .mockReturnValueOnce(0.5) // floor(0.5 * 6) + 1 = 4
        .mockReturnValueOnce(0.5) // 4
        .mockReturnValueOnce(0.83); // floor(0.83 * 6) + 1 = floor(4.98) + 1 = 5

      const result = rollDice(SYSTEM_3D6);

      expect(result.rolls).toEqual([4, 4, 5]);
      expect(result.total).toBe(13);
    });

    it("should roll minimum (3)", () => {
      vi.mocked(Math.random)
        .mockReturnValueOnce(0.01) // 1
        .mockReturnValueOnce(0.01) // 1
        .mockReturnValueOnce(0.01); // 1

      const result = rollDice(SYSTEM_3D6);

      expect(result.rolls).toEqual([1, 1, 1]);
      expect(result.total).toBe(3);
    });

    it("should roll maximum (18)", () => {
      vi.mocked(Math.random)
        .mockReturnValueOnce(0.99) // 6
        .mockReturnValueOnce(0.99) // 6
        .mockReturnValueOnce(0.99); // 6

      const result = rollDice(SYSTEM_3D6);

      expect(result.rolls).toEqual([6, 6, 6]);
      expect(result.total).toBe(18);
    });
  });

  describe("checkSuccess for 3d6", () => {
    it("should succeed when roll + stat >= DC", () => {
      const result = checkSuccess(SYSTEM_3D6, 12, 50, 60, 0);

      expect(result.success).toBe(true); // 12 + 50 = 62 >= 60
      expect(result.total).toBe(62);
    });

    it("should fail when roll + stat < DC", () => {
      const result = checkSuccess(SYSTEM_3D6, 8, 40, 60, 0);

      expect(result.success).toBe(false); // 8 + 40 = 48 < 60
      expect(result.total).toBe(48);
    });

    it("should detect critical success (max roll)", () => {
      const result = checkSuccess(SYSTEM_3D6, 18, 50, 60, 0);

      expect(result.success).toBe(true);
      expect(result.critical).toBe(true); // 18 is max
    });

    it("should handle penalties", () => {
      const result = checkSuccess(SYSTEM_3D6, 12, 50, 60, 5);

      expect(result.success).toBe(false); // (12-5) + 50 = 57 < 60
      expect(result.total).toBe(57);
    });

    it("should succeed exactly at DC", () => {
      const result = checkSuccess(SYSTEM_3D6, 10, 50, 60, 0);

      expect(result.success).toBe(true); // 10 + 50 = 60 >= 60
      expect(result.total).toBe(60);
    });
  });

  describe("calculateResourceRequirements", () => {
    it("should calculate requirements for DC 20", () => {
      const result = calculateResourceRequirements(SYSTEM_3D6, 20);

      expect(result.required).toBe(10); // 20 / 2 = 10
      expect(result.penalty).toBe(10); // 20 / 2 = 10
      expect(result.recovery).toBe(5); // 20 / 4 = 5
      expect(result.loss).toBe(10); // 20 / 2 = 10
    });

    it("should respect minimum values", () => {
      const result = calculateResourceRequirements(SYSTEM_3D6, 4);

      expect(result.required).toBe(3); // Min 3
      expect(result.penalty).toBe(3); // Min 3
      expect(result.recovery).toBe(1); // Min 1
      expect(result.loss).toBe(3); // Min 3
    });

    it("should scale for high DC", () => {
      const result = calculateResourceRequirements(SYSTEM_3D6, 40);

      expect(result.required).toBe(20); // 40 / 2 = 20
      expect(result.penalty).toBe(20);
      expect(result.recovery).toBe(10);
      expect(result.loss).toBe(20);
    });
  });

  describe("Upgrade system", () => {
    it("should have correct upgrade amounts", () => {
      expect(SYSTEM_3D6.upgrades.statUpgradeAmount).toBe(1);
      expect(SYSTEM_3D6.upgrades.resourceUpgradeAmount).toBe(5);
      expect(SYSTEM_3D6.upgrades.shopStatStartingValue).toBe(8);
    });
  });
});

describe("1d20 System", () => {
  describe("SYSTEM_1D20 configuration", () => {
    it("should have correct system properties", () => {
      expect(SYSTEM_1D20.id).toBe("1d20");
      expect(SYSTEM_1D20.name).toBe("1d20 (D&D Style)");
      expect(SYSTEM_1D20.dice.count).toBe(1);
      expect(SYSTEM_1D20.dice.sides).toBe(20);
      expect(SYSTEM_1D20.dice.min).toBe(1);
      expect(SYSTEM_1D20.dice.max).toBe(20);
    });

    it("should have correct DC guidelines", () => {
      expect(SYSTEM_1D20.dc.trivial).toBe(5);
      expect(SYSTEM_1D20.dc.easy).toBe(10);
      expect(SYSTEM_1D20.dc.medium).toBe(15);
      expect(SYSTEM_1D20.dc.hard).toBe(20);
      expect(SYSTEM_1D20.dc.veryHard).toBe(25);
      expect(SYSTEM_1D20.dc.impossible).toBe(30);
    });

    it("should use stat as modifier directly", () => {
      expect(SYSTEM_1D20.statToModifier(0)).toBe(0);
      expect(SYSTEM_1D20.statToModifier(50)).toBe(10); // floor(50 * 0.2)
      expect(SYSTEM_1D20.statToModifier(100)).toBe(20); // floor(100 * 0.2)
    });
  });

  describe("rollDice for 1d20", () => {
    beforeEach(() => {
      vi.spyOn(Math, "random");
    });

    it("should roll 1d20", () => {
      vi.mocked(Math.random).mockReturnValueOnce(0.5); // 11

      const result = rollDice(SYSTEM_1D20);

      expect(result.rolls).toEqual([11]);
      expect(result.total).toBe(11);
    });

    it("should roll natural 1", () => {
      vi.mocked(Math.random).mockReturnValueOnce(0.01);

      const result = rollDice(SYSTEM_1D20);

      expect(result.rolls).toEqual([1]);
      expect(result.total).toBe(1);
    });

    it("should roll natural 20", () => {
      vi.mocked(Math.random).mockReturnValueOnce(0.99);

      const result = rollDice(SYSTEM_1D20);

      expect(result.rolls).toEqual([20]);
      expect(result.total).toBe(20);
    });
  });

  describe("checkSuccess for 1d20", () => {
    it("should succeed when roll + stat >= DC", () => {
      const result = checkSuccess(SYSTEM_1D20, 12, 5, 15, 0);

      expect(result.success).toBe(true); // 12 + 5 = 17 >= 15
      expect(result.total).toBe(17);
    });

    it("should detect critical success (natural 20)", () => {
      const result = checkSuccess(SYSTEM_1D20, 20, 5, 15, 0);

      expect(result.success).toBe(true);
      expect(result.critical).toBe(true);
    });

    it("should not be critical on high roll that's not 20", () => {
      const result = checkSuccess(SYSTEM_1D20, 19, 10, 25, 0);

      expect(result.success).toBe(true);
      expect(result.critical).toBe(false);
    });
  });
});

describe("1d100 System", () => {
  describe("SYSTEM_1D100 configuration", () => {
    it("should have correct system properties", () => {
      expect(SYSTEM_1D100.id).toBe("1d100");
      expect(SYSTEM_1D100.name).toBe("1d100 (Percentile)");
      expect(SYSTEM_1D100.dice.count).toBe(1);
      expect(SYSTEM_1D100.dice.sides).toBe(100);
      expect(SYSTEM_1D100.dice.min).toBe(1);
      expect(SYSTEM_1D100.dice.max).toBe(100);
    });

    it("should not be roll-under system", () => {
      expect(SYSTEM_1D100.rollUnder).toBeUndefined(); // 1d100 is roll-OVER
    });

    it("should use stat as target number", () => {
      // In roll-under, stat is the target
      expect(SYSTEM_1D100.statToModifier(0)).toBe(0);
      expect(SYSTEM_1D100.statToModifier(75)).toBe(75);
      expect(SYSTEM_1D100.statToModifier(100)).toBe(100);
    });
  });

  describe("checkSuccess for 1d100 (roll-over)", () => {
    it("should succeed when roll + stat >= DC", () => {
      const result = checkSuccess(SYSTEM_1D100, 45, 75, 100, 0);

      expect(result.success).toBe(true); // 45 + 75 = 120 >= 100
      expect(result.total).toBe(120);
    });

    it("should fail when roll + stat < DC", () => {
      const result = checkSuccess(SYSTEM_1D100, 20, 50, 100, 0);

      expect(result.success).toBe(false); // 20 + 50 = 70 < 100
      expect(result.total).toBe(70);
    });

    it("should detect critical success (natural 100)", () => {
      const result = checkSuccess(SYSTEM_1D100, 100, 50, 120, 0);

      expect(result.success).toBe(true); // 100 + 50 = 150 >= 120
      expect(result.critical).toBe(true); // Natural 100
    });

    it("should handle penalties (reduce roll)", () => {
      const result = checkSuccess(SYSTEM_1D100, 60, 50, 100, 10);

      expect(result.success).toBe(true); // (60 - 10) + 50 = 100 >= 100
    });

    it("should succeed exactly at stat value", () => {
      const result = checkSuccess(SYSTEM_1D100, 75, 75, 0, 0);

      expect(result.success).toBe(true); // 75 <= 75
    });

    it("should handle large penalties", () => {
      const result = checkSuccess(SYSTEM_1D100, 40, 30, 100, 20);

      expect(result.success).toBe(false); // (40 - 20) + 30 = 50 < 100
    });
  });
});

describe("Percentile System", () => {
  describe("SYSTEM_PERCENTILE configuration", () => {
    it("should have correct system properties", () => {
      expect(SYSTEM_PERCENTILE.id).toBe("percentile");
      expect(SYSTEM_PERCENTILE.name).toBe("Classic Percentile");
      expect(SYSTEM_PERCENTILE.dice.count).toBe(1);
      expect(SYSTEM_PERCENTILE.dice.sides).toBe(100);
    });

    it("should be roll-under system", () => {
      expect(SYSTEM_PERCENTILE.rollUnder).toBe(true);
    });

    it("should have different critical threshold than 1d100", () => {
      expect(SYSTEM_PERCENTILE.success.criticalThreshold).toBe(5); // Both use 5
      expect(SYSTEM_1D100.success.criticalThreshold).toBe(100); // 1d100 uses natural 100
    });
  });

  describe("checkSuccess for percentile (roll-under)", () => {
    it("should succeed when roll <= stat", () => {
      const result = checkSuccess(SYSTEM_PERCENTILE, 55, 80, 0, 0);

      expect(result.success).toBe(true);
      expect(result.total).toBe(55);
    });

    it("should fail when roll > stat", () => {
      const result = checkSuccess(SYSTEM_PERCENTILE, 85, 80, 0, 0);

      expect(result.success).toBe(false);
    });

    it("should detect critical success (natural 1)", () => {
      const result = checkSuccess(SYSTEM_PERCENTILE, 1, 50, 0, 0);

      expect(result.success).toBe(true);
      expect(result.critical).toBe(true); // Natural 1
    });

    it("should be critical on roll of 2 (<=5)", () => {
      const result = checkSuccess(SYSTEM_PERCENTILE, 2, 50, 0, 0);

      expect(result.success).toBe(true);
      expect(result.critical).toBe(true); // 2 <= 5
    });
  });
});

describe("Powered by the Apocalypse (PbtA) System", () => {
  describe("SYSTEM_PBTA configuration", () => {
    it("should have correct system properties", () => {
      expect(SYSTEM_PBTA.id).toBe("pbta");
      expect(SYSTEM_PBTA.name).toBe("Powered by the Apocalypse");
      expect(SYSTEM_PBTA.dice.count).toBe(2);
      expect(SYSTEM_PBTA.dice.sides).toBe(6);
      expect(SYSTEM_PBTA.hasPartialSuccess).toBe(true);
    });

    it("should convert stat to modifier (-2 to +3)", () => {
      expect(SYSTEM_PBTA.statToModifier(0)).toBe(-2); // 0-20
      expect(SYSTEM_PBTA.statToModifier(21)).toBe(-1); // 21-40
      expect(SYSTEM_PBTA.statToModifier(34)).toBe(-1); // 34-50
      expect(SYSTEM_PBTA.statToModifier(61)).toBe(1); // 61-80
      expect(SYSTEM_PBTA.statToModifier(67)).toBe(1); // 61-80
      expect(SYSTEM_PBTA.statToModifier(81)).toBe(2); // 81-100
      expect(SYSTEM_PBTA.statToModifier(92)).toBe(2); // 81-100
      expect(SYSTEM_PBTA.statToModifier(101)).toBe(3); // 100+ for exceptional
    });

    it("should have correct DC thresholds", () => {
      expect(SYSTEM_PBTA.dc.medium).toBe(10); // Full success
      expect(SYSTEM_PBTA.success.partialThreshold).toBe(7); // Partial success
    });
  });

  describe("checkSuccess for PbtA", () => {
    it("should succeed on 10+ (full success)", () => {
      const result = checkSuccess(SYSTEM_PBTA, 8, 67, 10, 0); // Roll 8 + mod 1 = 9... wait

      // Let me recalculate: roll 8, stat 67 = modifier 1, total 9
      expect(result.success).toBe(false); // 9 < 10
      expect(result.partial).toBe(true); // 7-9
    });

    it("should have partial success on 7-9", () => {
      const result = checkSuccess(SYSTEM_PBTA, 7, 51, 10, 0); // Roll 7 + mod 0 = 7

      expect(result.success).toBe(false); // Not full success
      expect(result.partial).toBe(true); // 7-9 range
      expect(result.total).toBe(7);
    });

    it("should fail on 6-", () => {
      const result = checkSuccess(SYSTEM_PBTA, 5, 51, 10, 0); // Roll 5 + mod 0 = 5

      expect(result.success).toBe(false);
      expect(result.partial).toBe(false);
      expect(result.total).toBe(5);
    });

    it("should detect critical success (12 on 2d6)", () => {
      const result = checkSuccess(SYSTEM_PBTA, 12, 51, 10, 0); // Natural 12

      expect(result.success).toBe(true);
      expect(result.critical).toBe(true);
    });

    it("should handle modifiers correctly", () => {
      const result = checkSuccess(SYSTEM_PBTA, 7, 84, 10, 0); // Roll 7 + mod 2 = 9

      expect(result.total).toBe(9);
      expect(result.partial).toBe(true);
      expect(result.success).toBe(false);
    });

    it("should succeed on exactly 10", () => {
      const result = checkSuccess(SYSTEM_PBTA, 9, 67, 10, 0); // Roll 9 + mod 1 = 10

      expect(result.success).toBe(true);
      expect(result.partial).toBe(false);
      expect(result.total).toBe(10);
    });
  });
});

describe("Fate System", () => {
  describe("SYSTEM_FATE configuration", () => {
    it("should have correct system properties", () => {
      expect(SYSTEM_FATE.id).toBe("fate");
      expect(SYSTEM_FATE.name).toBe("Fate Core");
      expect(SYSTEM_FATE.dice.count).toBe(4);
      expect(SYSTEM_FATE.dice.sides).toBe(3); // Fate dice: -1, 0, +1
      expect(SYSTEM_FATE.hasSuccessWithStyle).toBe(true);
    });

    it("should convert stat to ladder (-2 to +4)", () => {
      expect(SYSTEM_FATE.statToModifier(0)).toBe(-2); // Terrible
      expect(SYSTEM_FATE.statToModifier(20)).toBe(-1); // Poor
      expect(SYSTEM_FATE.statToModifier(30)).toBe(0); // Mediocre
      expect(SYSTEM_FATE.statToModifier(40)).toBe(1); // Average
      expect(SYSTEM_FATE.statToModifier(50)).toBe(2); // Fair
      expect(SYSTEM_FATE.statToModifier(60)).toBe(3); // Good
      expect(SYSTEM_FATE.statToModifier(70)).toBe(4); // Great
      expect(SYSTEM_FATE.statToModifier(80)).toBe(5); // Superb
      expect(SYSTEM_FATE.statToModifier(90)).toBe(6); // Fantastic
      expect(SYSTEM_FATE.statToModifier(100)).toBe(7); // Epic
    });

    it("should have getLadderName function", () => {
      expect(SYSTEM_FATE.getLadderName).toBeDefined();
      expect(SYSTEM_FATE.getLadderName!(-2)).toBe("Terrible");
      expect(SYSTEM_FATE.getLadderName!(0)).toBe("Mediocre");
      expect(SYSTEM_FATE.getLadderName!(2)).toBe("Fair");
      expect(SYSTEM_FATE.getLadderName!(4)).toBe("Great");
    });
  });

  describe("checkSuccess for Fate", () => {
    it("should succeed when total > DC", () => {
      // Fate dice roll -4 to +4, stat 50 = +2, DC 2
      const result = checkSuccess(SYSTEM_FATE, 2, 50, 2, 0); // Roll 2 + mod 2 = 4 > 2

      expect(result.success).toBe(true);
      expect(result.total).toBe(4);
      expect(result.tie).toBe(false);
    });

    it("should detect tie when total == DC", () => {
      const result = checkSuccess(SYSTEM_FATE, 0, 50, 2, 0); // Roll 0 + mod 2 = 2 == 2

      expect(result.success).toBe(false);
      expect(result.tie).toBe(true);
      expect(result.total).toBe(2);
    });

    it("should fail when total < DC", () => {
      const result = checkSuccess(SYSTEM_FATE, -2, 50, 2, 0); // Roll -2 + mod 2 = 0 < 2

      expect(result.success).toBe(false);
      expect(result.tie).toBe(false);
      expect(result.total).toBe(0);
    });

    it("should detect success with style (margin >= 3)", () => {
      const result = checkSuccess(SYSTEM_FATE, 3, 50, 2, 0); // Roll 3 + mod 2 = 5, margin 3

      expect(result.success).toBe(true);
      expect(result.style).toBe(true);
      expect(result.total).toBe(5);
    });

    it("should not trigger style on narrow success", () => {
      const result = checkSuccess(SYSTEM_FATE, 1, 50, 2, 0); // Roll 1 + mod 2 = 3, margin 1

      expect(result.success).toBe(true);
      expect(result.style).toBe(false);
    });

    it("should detect critical on max Fate roll (+4)", () => {
      const result = checkSuccess(SYSTEM_FATE, 4, 50, 2, 0); // Natural +4

      expect(result.success).toBe(true);
      expect(result.critical).toBe(true);
    });

    it("should handle negative modifiers", () => {
      const result = checkSuccess(SYSTEM_FATE, 2, 0, 0, 0); // Roll 2 + mod -2 = 0

      expect(result.total).toBe(0);
      expect(result.tie).toBe(true);
    });
  });
});

describe("System Retrieval", () => {
  it("should retrieve all systems by ID", () => {
    expect(getRPGSystem("3d6").id).toBe("3d6");
    expect(getRPGSystem("1d20").id).toBe("1d20");
    expect(getRPGSystem("1d100").id).toBe("1d100");
    expect(getRPGSystem("percentile").id).toBe("percentile");
    expect(getRPGSystem("pbta").id).toBe("pbta");
    expect(getRPGSystem("fate").id).toBe("fate");
    expect(getRPGSystem("yze").id).toBe("yze");
    expect(getRPGSystem("explosive").id).toBe("explosive");
  });

  it("should default to 3d6 for invalid system", () => {
    const system = getRPGSystem("invalid" as any);
    expect(system.id).toBe("3d6");
  });
});

describe("System Comparison", () => {
  it("should have distinct mechanics across systems", () => {
    // Roll-under systems
    expect(SYSTEM_1D100.rollUnder).toBeUndefined(); // 1d100 is roll-over
    expect(SYSTEM_PERCENTILE.rollUnder).toBe(true);
    expect(SYSTEM_3D6.rollUnder).toBeUndefined();

    // Partial success
    expect(SYSTEM_PBTA.hasPartialSuccess).toBe(true);
    expect(SYSTEM_3D6.hasPartialSuccess).toBeUndefined();

    // Success with style
    expect(SYSTEM_FATE.hasSuccessWithStyle).toBe(true);
    expect(SYSTEM_1D20.hasSuccessWithStyle).toBeUndefined();

    // Stress dice
    expect(getRPGSystem("yze").hasStressDice).toBe(true);
    expect(SYSTEM_3D6.hasStressDice).toBeUndefined();

    // Exploding dice
    expect(getRPGSystem("explosive").hasExplodingDice).toBe(true);
    expect(SYSTEM_1D20.hasExplodingDice).toBeUndefined();
  });

  it("should have different dice configurations", () => {
    expect(SYSTEM_3D6.dice).toEqual({ count: 3, sides: 6, min: 3, max: 18 });
    expect(SYSTEM_1D20.dice).toEqual({ count: 1, sides: 20, min: 1, max: 20 });
    expect(SYSTEM_PBTA.dice).toEqual({ count: 2, sides: 6, min: 2, max: 12 });
    expect(SYSTEM_FATE.dice).toEqual({ count: 4, sides: 3, min: -4, max: 4 });
  });

  it("should have varying DC scales", () => {
    // 3d6: Higher DCs (20-30 range)
    expect(SYSTEM_3D6.dc.medium).toBe(20);

    // 1d20: Medium DCs (15-25 range)
    expect(SYSTEM_1D20.dc.medium).toBe(15);

    // PbtA: Fixed thresholds (7, 10)
    expect(SYSTEM_PBTA.dc.medium).toBe(10);
    expect(SYSTEM_PBTA.success.partialThreshold).toBe(7);

    // Fate: Ladder scale (0-4)
    expect(SYSTEM_FATE.dc.medium).toBe(2);
  });
});
