import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getRPGSystem,
  rollDice,
  checkSuccess,
  calculateResourceRequirements,
  SYSTEM_YZE,
} from "../app/misc/rpgSystems";

describe("Year Zero Engine (YZE) Stress System", () => {
  describe("SYSTEM_YZE configuration", () => {
    it("should have correct system properties", () => {
      expect(SYSTEM_YZE.id).toBe("yze");
      expect(SYSTEM_YZE.name).toBe("Year Zero Engine");
      expect(SYSTEM_YZE.hasStressDice).toBe(true);
      expect(SYSTEM_YZE.hasPushMechanic).toBe(true);
      expect(SYSTEM_YZE.stressDiceMax).toBe(5);
    });

    it("should have panic table entries", () => {
      expect(SYSTEM_YZE.panicTable).toBeDefined();
      expect(SYSTEM_YZE.panicTable!.length).toBeGreaterThan(0);

      // Check first entry
      const firstEntry = SYSTEM_YZE.panicTable![0];
      expect(firstEntry.min).toBeDefined();
      expect(firstEntry.max).toBeDefined();
      expect(firstEntry.effect).toBeDefined();
      expect(firstEntry.description).toBeDefined();
    });

    it("should have correct DC guidelines for success count", () => {
      expect(SYSTEM_YZE.dc.trivial).toBe(1);
      expect(SYSTEM_YZE.dc.easy).toBe(1);
      expect(SYSTEM_YZE.dc.medium).toBe(2);
      expect(SYSTEM_YZE.dc.hard).toBe(3);
      expect(SYSTEM_YZE.dc.veryHard).toBe(4);
      expect(SYSTEM_YZE.dc.impossible).toBe(5); // Changed from 6
    });

    it("should convert stat to modifier correctly", () => {
      // YZE uses stat/20 for base dice count
      expect(SYSTEM_YZE.statToModifier(0)).toBe(0);
      expect(SYSTEM_YZE.statToModifier(20)).toBe(1);
      expect(SYSTEM_YZE.statToModifier(40)).toBe(2);
      expect(SYSTEM_YZE.statToModifier(60)).toBe(3);
      expect(SYSTEM_YZE.statToModifier(80)).toBe(4);
      expect(SYSTEM_YZE.statToModifier(100)).toBe(5);
    });
  });

  describe("Panic table", () => {
    it("should have entries covering full range", () => {
      const panicTable = SYSTEM_YZE.panicTable!;

      // Check that table covers stress levels 0-10+
      const minEntry = panicTable[0];
      const maxEntry = panicTable[panicTable.length - 1];

      expect(minEntry.min).toBeLessThanOrEqual(1);
      expect(maxEntry.max).toBeGreaterThanOrEqual(15); // High stress + d6
    });

    it("should have no gaps in range", () => {
      const panicTable = SYSTEM_YZE.panicTable!;

      for (let i = 0; i < panicTable.length - 1; i++) {
        const current = panicTable[i];
        const next = panicTable[i + 1];

        // Next entry should start where current ends + 1
        expect(next.min).toBe(current.max + 1);
      }
    });

    it("should include various panic effects", () => {
      const panicTable = SYSTEM_YZE.panicTable!;
      const effects = panicTable.map((entry) => entry.effect);

      // Should have a variety of effects
      expect(effects.length).toBeGreaterThan(5);
      expect(effects.some((e) => e.toLowerCase().includes("freeze"))).toBe(
        true
      );
    });
  });

  describe("checkSuccess with YZE mechanics", () => {
    it("should count 6s as successes", () => {
      const rolls = [6, 6, 3, 4, 1, 2]; // 2 successes
      const result = checkSuccess(SYSTEM_YZE, 0, 60, 2, 0, rolls);

      expect(result.successes).toBe(2);
      expect(result.success).toBe(true); // 2 >= 2
      expect(result.total).toBe(2);
    });

    it("should fail when successes < DC", () => {
      const rolls = [6, 3, 4, 1, 2]; // 1 success
      const result = checkSuccess(SYSTEM_YZE, 0, 40, 2, 0, rolls);

      expect(result.successes).toBe(1);
      expect(result.success).toBe(false); // 1 < 2
    });

    it("should detect critical success (6+ successes)", () => {
      const rolls = [6, 6, 6, 6, 6, 6, 5, 4]; // 6 successes
      const result = checkSuccess(SYSTEM_YZE, 0, 80, 3, 0, rolls);

      expect(result.successes).toBe(6);
      expect(result.success).toBe(true);
      expect(result.critical).toBe(true); // >= 6 successes
    });

    it("should detect stress relief on strong success", () => {
      const rolls = [6, 6, 6, 6, 6, 3, 2]; // 5 successes, DC 2, margin 3
      const result = checkSuccess(SYSTEM_YZE, 0, 60, 2, 0, rolls);

      expect(result.successes).toBe(5);
      expect(result.success).toBe(true);
      expect(result.stressRelief).toBe(true); // margin >= 3
    });

    it("should not trigger stress relief on narrow success", () => {
      const rolls = [6, 6, 3, 2, 1]; // 2 successes, DC 2, margin 0
      const result = checkSuccess(SYSTEM_YZE, 0, 40, 2, 0, rolls);

      expect(result.successes).toBe(2);
      expect(result.success).toBe(true);
      expect(result.stressRelief).toBe(false); // margin < 3
    });

    it("should handle no successes", () => {
      const rolls = [1, 2, 3, 4, 5]; // 0 successes
      const result = checkSuccess(SYSTEM_YZE, 0, 40, 1, 0, rolls);

      expect(result.successes).toBe(0);
      expect(result.success).toBe(false);
      expect(result.total).toBe(0);
    });

    it("should handle empty rolls array", () => {
      const rolls: number[] = [];
      const result = checkSuccess(SYSTEM_YZE, 0, 40, 1, 0, rolls);

      expect(result.successes).toBe(0);
      expect(result.success).toBe(false);
      expect(result.total).toBe(0);
    });

    it("should handle all 6s", () => {
      const rolls = [6, 6, 6, 6]; // 4 successes
      const result = checkSuccess(SYSTEM_YZE, 0, 40, 2, 0, rolls);

      expect(result.successes).toBe(4);
      expect(result.success).toBe(true);
      expect(result.total).toBe(4);
    });

    it("should succeed exactly at DC", () => {
      const rolls = [6, 6, 6, 3, 2]; // 3 successes
      const result = checkSuccess(SYSTEM_YZE, 0, 40, 3, 0, rolls);

      expect(result.successes).toBe(3);
      expect(result.success).toBe(true); // 3 >= 3
    });
  });

  describe("rollDice for YZE", () => {
    it("should roll dice based on system", () => {
      // YZE doesn't use rollDice with fixed count - it's variable based on stat
      // This test just verifies the function doesn't crash
      const result = rollDice(SYSTEM_YZE);

      // With 0 base dice, should return empty or minimal rolls
      expect(Array.isArray(result.rolls)).toBe(true);
      if (result.rolls.length > 0) {
        expect(result.rolls.every((r) => r >= 1 && r <= 6)).toBe(true);
      }
    });
  });

  describe("calculateResourceRequirements", () => {
    it("should return zero values (YZE has no resource requirements)", () => {
      const result = calculateResourceRequirements(SYSTEM_YZE, 2);

      // YZE has all divisors = 0, meaning resource mechanics are disabled
      expect(result.required).toBe(0); // No resource requirement
      expect(result.penalty).toBe(0); // No penalty
      expect(result.recovery).toBe(0); // No automatic recovery
      expect(result.loss).toBe(0); // No automatic loss
    });

    it("should return zero for DC 4", () => {
      const result = calculateResourceRequirements(SYSTEM_YZE, 4);

      expect(result.required).toBe(0);
      expect(result.penalty).toBe(0);
      expect(result.recovery).toBe(0);
      expect(result.loss).toBe(0);
    });

    it("should return zero for higher DC", () => {
      const result = calculateResourceRequirements(SYSTEM_YZE, 10);

      expect(result.required).toBe(0);
      expect(result.penalty).toBe(0);
      expect(result.recovery).toBe(0);
      expect(result.loss).toBe(0);
    });
  });

  describe("getRPGSystem", () => {
    it("should retrieve YZE system by ID", () => {
      const system = getRPGSystem("yze");

      expect(system.id).toBe("yze");
      expect(system.name).toBe("Year Zero Engine");
      expect(system.hasStressDice).toBe(true);
    });

    it("should have panic table", () => {
      const system = getRPGSystem("yze");

      expect(system.panicTable).toBeDefined();
      expect(Array.isArray(system.panicTable)).toBe(true);
    });
  });

  describe("Stress mechanics edge cases", () => {
    it("should handle very high success count", () => {
      const rolls = Array(20).fill(6); // 20 successes!
      const result = checkSuccess(SYSTEM_YZE, 0, 100, 3, 0, rolls);

      expect(result.successes).toBe(20);
      expect(result.success).toBe(true);
      expect(result.critical).toBe(true);
      expect(result.stressRelief).toBe(true); // 17 margin >= 3
    });

    it("should handle DC of 0 (trivial check)", () => {
      const rolls = [1, 2, 3]; // 0 successes
      const result = checkSuccess(SYSTEM_YZE, 0, 20, 0, 0, rolls);

      expect(result.successes).toBe(0);
      expect(result.success).toBe(true); // 0 >= 0
    });

    it("should handle impossible DC with few dice", () => {
      const rolls = [6, 5, 4]; // 1 success
      const result = checkSuccess(SYSTEM_YZE, 0, 20, 6, 0, rolls);

      expect(result.successes).toBe(1);
      expect(result.success).toBe(false); // 1 < 6
    });

    it("should calculate stress relief threshold correctly", () => {
      // Exactly 3 margin (minimum for stress relief)
      const rolls = [6, 6, 6, 6, 6, 3, 2]; // 5 successes, DC 2, margin 3
      const result = checkSuccess(SYSTEM_YZE, 0, 60, 2, 0, rolls);

      expect(result.successes).toBe(5);
      expect(result.success).toBe(true);
      expect(result.stressRelief).toBe(true);

      // Just below threshold (2 margin)
      const rolls2 = [6, 6, 6, 6, 3]; // 4 successes, DC 2, margin 2
      const result2 = checkSuccess(SYSTEM_YZE, 0, 60, 2, 0, rolls2);

      expect(result2.successes).toBe(4);
      expect(result2.success).toBe(true);
      expect(result2.stressRelief).toBe(false);
    });
  });

  describe("AI Instructions", () => {
    it("should have comprehensive stress dice guidance", () => {
      const { aiInstructions } = SYSTEM_YZE;

      expect(aiInstructions.diceSystem.toLowerCase()).toContain("stress");
      expect(aiInstructions.diceSystem).toContain("6");
      expect(aiInstructions.dcGuidance).toContain("success");
      // Note: YZE uses "success count" not "DC", so we check for that instead
      expect(aiInstructions.challengeGuidance.toLowerCase()).toContain(
        "stress"
      );
    });

    it("should mention panic mechanics", () => {
      const { aiInstructions } = SYSTEM_YZE;
      const allInstructions = Object.values(aiInstructions).join(" ");

      expect(allInstructions.toLowerCase()).toContain("panic");
      expect(allInstructions.toLowerCase()).toContain("stress");
    });
  });

  describe("System comparison", () => {
    it("should be distinct from explosive system", () => {
      const yze = getRPGSystem("yze");
      const explosive = getRPGSystem("explosive");

      expect(yze.id).not.toBe(explosive.id);
      expect(yze.hasStressDice).toBe(true);
      expect(explosive.hasStressDice).toBeFalsy();
      expect(explosive.hasExplodingDice).toBe(true);
      expect(yze.hasExplodingDice).toBeFalsy();
    });

    it("should use different success mechanics", () => {
      // YZE: count 6s
      const yzeRolls = [6, 6, 3];
      const yzeResult = checkSuccess(SYSTEM_YZE, 0, 40, 2, 0, yzeRolls);
      expect(yzeResult.successes).toBe(2);

      // Explosive: pure roll vs DC
      const explosiveSystem = getRPGSystem("explosive");
      const explosiveResult = checkSuccess(explosiveSystem, 15, 70, 12, 0);
      expect(explosiveResult.total).toBe(15); // No stat modifier
    });
  });
});
