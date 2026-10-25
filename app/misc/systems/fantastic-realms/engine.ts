/**
 * Fantastic Realms: the pure arithmetic (docs/fantastic-realms-design.md
 * section 2, plan slice 2). No I/O and no dice: the executors throw the dice
 * and hand the faces in.
 */
import type { MeterSet } from "../../structs";

export type FeatTier = "miss" | "weak_hit" | "hit" | "strong_hit";

export interface FeatResult {
  tier: FeatTier;
  /** One magnitude per success beyond 3 (only a strong hit has any). */
  magnitude: number;
}

export const MAX_LEVEL = 20;
export const STARTING_HEARTS = 3;
/** A hero's name for the meters: the "Fantastic Realms hero" set. */
export const HERO_SET_NAME = "Fantastic Realms hero";

/**
 * The hero meter set as the plan defines it, used when the resolved system
 * does not carry one by that name. Hearts' max rises with levels, and the
 * XP meter's max is moved to the next level's cost as the hero levels.
 */
export const FALLBACK_HERO_SET: MeterSet = {
  name: HERO_SET_NAME,
  meters: [
    { name: "Hearts", min: 0, max: 3, start: 3 },
    { name: "Level", min: 1, max: 20, start: 1 },
    { name: "XP", min: 0, max: 2000, start: 0 },
  ],
};

/** Each die that equals or beats the DC is a success (decision 202). */
export function countSuccesses(dice: number[], dc: number): number {
  return dice.filter((d) => d >= dc).length;
}

export function resultFor(successes: number): FeatResult {
  const n = Math.max(0, Math.floor(successes));
  if (n === 0) return { tier: "miss", magnitude: 0 };
  if (n === 1) return { tier: "weak_hit", magnitude: 0 };
  if (n === 2) return { tier: "hit", magnitude: 0 };
  return { tier: "strong_hit", magnitude: Math.max(0, n - 3) };
}

/** Hearts a foe loses (design 2.6): weak 1, hit 1, strong 2 plus the magnitude. */
export function foeDamage(r: FeatResult): number {
  switch (r.tier) {
    case "miss":
      return 0;
    case "weak_hit":
    case "hit":
      return 1;
    case "strong_hit":
      return 2 + r.magnitude;
  }
}

/** XP to go from `level` to `level + 1`. */
export function levelCost(level: number): number {
  return (level + 1) * 1000;
}

export interface XpOutcome {
  level: number;
  xp: number;
  /** Each level reached, in order. */
  levelsGained: number[];
  /** The gained levels divisible by 3: each gives +1 maximum heart. */
  heartLevels: number[];
}

/** Adds XP, carrying over level by level; level caps at 20 and XP is kept at that level's cost. */
export function applyXp(level: number, xp: number, amount: number): XpOutcome {
  let lvl = Math.min(MAX_LEVEL, Math.max(1, Math.floor(level)));
  let pool = Math.max(0, xp) + Math.max(0, amount);
  const levelsGained: number[] = [];
  const heartLevels: number[] = [];
  while (lvl < MAX_LEVEL && pool >= levelCost(lvl)) {
    pool -= levelCost(lvl);
    lvl += 1;
    levelsGained.push(lvl);
    if (lvl % 3 === 0) heartLevels.push(lvl);
  }
  if (lvl >= MAX_LEVEL) pool = Math.min(pool, levelCost(MAX_LEVEL));
  return { level: lvl, xp: pool, levelsGained, heartLevels };
}

/** Feat wording matched loosely: case and punctuation do not count. */
export function normaliseFeat(wording: string): string {
  return String(wording ?? "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export function tierWord(tier: FeatTier): string {
  switch (tier) {
    case "miss":
      return "MISS";
    case "weak_hit":
      return "WEAK HIT";
    case "hit":
      return "HIT";
    case "strong_hit":
      return "STRONG HIT";
  }
}
