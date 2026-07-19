/**
 * checkScene/setupScene used to roll a d100 against a 1-9 chaos scale,
 * which made Altered/Interrupted results fire on only ~1-9% of scenes
 * even at maximum chaos - a die-size bug that (along with the mechanic
 * never being wired into gameplay at all) meant Mythic's real "scene
 * control" rule never actually ran. This tests the corrected d10-based
 * version.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { checkScene, setupScene, adjustChaosFactor } from "../app/misc/mythic";

function mockRandom(value: number) {
  vi.spyOn(Math, "random").mockReturnValue(value);
}

describe("checkScene", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rolls a d10 (1-10), not a d100", () => {
    mockRandom(0.99); // -> roll 10
    const { roll } = checkScene(5);
    expect(roll).toBeGreaterThanOrEqual(1);
    expect(roll).toBeLessThanOrEqual(10);
  });

  it("is Interrupted when roll <= floor(chaos/2)", () => {
    mockRandom(0); // -> roll 1
    const { sceneType, roll } = checkScene(5); // floor(5/2) = 2
    expect(roll).toBe(1);
    expect(sceneType).toBe("Interrupted");
  });

  it("is Altered when roll is above the interrupted threshold but <= chaos", () => {
    mockRandom(0.4); // -> roll 5
    const { sceneType, roll } = checkScene(5); // floor(5/2)=2 < 5 <= 5
    expect(roll).toBe(5);
    expect(sceneType).toBe("Altered");
  });

  it("is Normal when roll > chaos factor", () => {
    mockRandom(0.99); // -> roll 10
    const { sceneType, roll } = checkScene(5);
    expect(roll).toBe(10);
    expect(sceneType).toBe("Normal");
  });

  it("produces roughly even odds of a non-Normal result at max chaos (9)", () => {
    // At chaos 9: Interrupted on roll<=4, Altered on roll 5-9, Normal only on roll 10.
    // This is the core AGMT design point a d100-based roll would break.
    let nonNormal = 0;
    for (let roll = 1; roll <= 10; roll++) {
      mockRandom((roll - 1) / 10);
      const { sceneType } = checkScene(9);
      if (sceneType !== "Normal") nonNormal++;
    }
    expect(nonNormal).toBe(9); // only roll=10 is Normal at chaos 9
  });
});

describe("setupScene", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("generates a random event exactly when the scene is Interrupted", () => {
    mockRandom(0); // -> roll 1 -> Interrupted at any chaos >= 2
    const result = setupScene({ chaosFactor: 5, threads: [], npcs: [], sceneCount: 0 });
    expect(result.sceneType).toBe("Interrupted");
    expect(result.randomEvent).toBe(true);
    expect(result.eventFocus).toBeDefined();
    expect(result.eventMeaning).toBeDefined();
  });

  it("does not generate a random event for a Normal scene", () => {
    mockRandom(0.99); // -> roll 10 -> Normal
    const result = setupScene({ chaosFactor: 5, threads: [], npcs: [], sceneCount: 0 });
    expect(result.sceneType).toBe("Normal");
    expect(result.randomEvent).toBe(false);
    expect(result.eventFocus).toBeUndefined();
  });
});

describe("adjustChaosFactor", () => {
  it("clamps to the 1-9 range", () => {
    expect(adjustChaosFactor(1, -1)).toBe(1);
    expect(adjustChaosFactor(9, 1)).toBe(9);
  });

  it("moves by the given delta within range", () => {
    expect(adjustChaosFactor(5, 1)).toBe(6);
    expect(adjustChaosFactor(5, -1)).toBe(4);
    expect(adjustChaosFactor(5, 0)).toBe(5);
  });
});
