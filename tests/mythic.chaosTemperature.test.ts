/**
 * Tests for chaosFactorTemperatureDelta - a direct implementation of the
 * source paper's "a low Chaos Factor can instruct the system to lower the
 * LLM's temperature... as the Chaos Factor peaks, the system can
 * dynamically increase the LLM's temperature" (see §2.4 in
 * docs/research-paper-ttrpg-theory-gap-analysis.md).
 */
import { describe, it, expect } from "vitest";
import { chaosFactorTemperatureDelta } from "../app/misc/mythic";

describe("chaosFactorTemperatureDelta", () => {
  it("is neutral (zero) at the default chaos factor of 5", () => {
    expect(chaosFactorTemperatureDelta(5)).toBe(0);
    expect(chaosFactorTemperatureDelta()).toBe(0); // default param
  });

  it("is negative below chaos factor 5, positive above it", () => {
    expect(chaosFactorTemperatureDelta(1)).toBeLessThan(0);
    expect(chaosFactorTemperatureDelta(3)).toBeLessThan(0);
    expect(chaosFactorTemperatureDelta(9)).toBeGreaterThan(0);
    expect(chaosFactorTemperatureDelta(7)).toBeGreaterThan(0);
  });

  it("is symmetric around chaos factor 5", () => {
    expect(chaosFactorTemperatureDelta(1)).toBeCloseTo(
      -chaosFactorTemperatureDelta(9),
      10
    );
    expect(chaosFactorTemperatureDelta(3)).toBeCloseTo(
      -chaosFactorTemperatureDelta(7),
      10
    );
  });

  it("stays within a small, bounded range so it nudges rather than overrides the base temperature", () => {
    for (let cf = 1; cf <= 9; cf++) {
      expect(Math.abs(chaosFactorTemperatureDelta(cf))).toBeLessThanOrEqual(
        0.15
      );
    }
  });

  it("clamps out-of-range chaos factor values to the valid 1-9 band", () => {
    expect(chaosFactorTemperatureDelta(0)).toBe(chaosFactorTemperatureDelta(1));
    expect(chaosFactorTemperatureDelta(20)).toBe(
      chaosFactorTemperatureDelta(9)
    );
  });
});
