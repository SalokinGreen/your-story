/**
 * XP-based leveling system
 *
 * Uses a quadratic formula for XP thresholds:
 * - XP needed for level N = base * N²
 * - This creates a smooth curve where early levels are quick, later levels take more
 * - Players START at Level 1 with 0 XP
 *
 * Example with base 100:
 * - Level 1: 0 XP (starting level)
 * - Level 2: 100 XP (cumulative: 100)
 * - Level 3: 400 XP (cumulative: 500)
 * - Level 4: 900 XP (cumulative: 1400)
 * - Level 5: 1600 XP (cumulative: 3000)
 * - Level 6: 2500 XP (cumulative: 5500)
 */

import { AdventureDifficulty } from "./structs";

// Base XP constant - determines overall XP curve steepness
export const XP_BASE = 100;

// Starting upgrades based on difficulty (easy = more help, expert = challenge)
export const STARTING_UPGRADES_BY_DIFFICULTY: Record<
  AdventureDifficulty,
  number
> = {
  easy: 3,
  medium: 2,
  hard: 1,
  expert: 0,
} as const;

// XP rewards for different actions
export const XP_REWARDS = {
  STORY_BEAT: 25, // Completing a story beat (turn with meaningful progress)
  CHAPTER: 100, // Completing a chapter
  QUEST: 50, // Completing a quest (varies by quest)
  CHALLENGE_WON: 50, // Winning a scene challenge (varies by challenge)
  ACHIEVEMENT: 25, // Unlocking an achievement (varies by achievement)
} as const;

/**
 * Calculate the XP required to reach a specific level
 * Formula: XP_BASE * level²
 */
export function getXPForLevel(level: number): number {
  if (level <= 0) return 0;
  return XP_BASE * level * level;
}

/**
 * Calculate cumulative XP needed to reach a level (sum of all previous levels)
 * Formula: XP_BASE * (level * (level + 1) * (2*level + 1)) / 6
 * This is the sum of squares: 1² + 2² + 3² + ... + n² = n(n+1)(2n+1)/6
 */
export function getCumulativeXPForLevel(level: number): number {
  if (level <= 0) return 0;
  // Sum of squares formula: n(n+1)(2n+1)/6
  return (XP_BASE * (level * (level + 1) * (2 * level + 1))) / 6;
}

/**
 * Calculate the player's current level from their total XP
 * Players start at Level 1 with 0 XP.
 * Uses cumulative XP formula inverted.
 */
export function calculateLevel(xp: number): number {
  // Level 1 is the starting level (0 XP)
  if (xp <= 0) return 1;

  // Binary search for the level since inverting the cubic is complex
  // We search for levels 2+ since level 1 is handled above
  let low = 1;
  let high = 100; // Max level cap

  while (low < high) {
    const mid = Math.floor((low + high + 1) / 2);
    if (getCumulativeXPForLevel(mid - 1) <= xp) {
      low = mid;
    } else {
      high = mid - 1;
    }
  }

  return low;
}

/**
 * Get XP progress towards the next level
 * Returns { current, needed, percentage }
 * Note: Level 1 starts at 0 XP, Level 2 requires getCumulativeXPForLevel(1) = 100 XP, etc.
 */
export function getXPProgress(xp: number): {
  currentLevel: number;
  xpIntoLevel: number;
  xpNeededForNext: number;
  percentage: number;
  totalXP: number;
} {
  const currentLevel = calculateLevel(xp);
  // XP threshold for current level (Level 1 = 0, Level 2 = 100, Level 3 = 500, etc.)
  const xpForCurrentLevel =
    currentLevel <= 1 ? 0 : getCumulativeXPForLevel(currentLevel - 1);
  const xpForNextLevel = getCumulativeXPForLevel(currentLevel);

  const xpIntoLevel = Math.max(0, xp - xpForCurrentLevel);
  const xpNeededForNext = xpForNextLevel - xpForCurrentLevel;
  const percentage =
    xpNeededForNext > 0
      ? Math.min(100, Math.floor((xpIntoLevel / xpNeededForNext) * 100))
      : 100;

  return {
    currentLevel,
    xpIntoLevel,
    xpNeededForNext,
    percentage,
    totalXP: xp,
  };
}

/**
 * Calculate how many upgrades are available
 * Formula: (level - 1) + startingUpgrades - upgradesSpent
 * - Each level-up grants one upgrade choice (so level 1 = 0, level 2 = 1, etc.)
 * - Starting upgrades vary by difficulty (easy=3, medium=2, hard=1, expert=0)
 */
export function getAvailableUpgrades(
  level: number,
  upgradesSpent: number,
  difficulty?: AdventureDifficulty
): number {
  const startingUpgrades =
    STARTING_UPGRADES_BY_DIFFICULTY[difficulty || "medium"];
  const levelUpgrades = Math.max(0, (level || 1) - 1); // level 1 = 0 upgrades from leveling
  return Math.max(0, levelUpgrades + startingUpgrades - (upgradesSpent || 0));
}

/**
 * Check if player has pending level-up rewards to claim
 */
export function hasPendingLevelUp(
  level: number,
  upgradesSpent: number,
  difficulty?: AdventureDifficulty
): boolean {
  return getAvailableUpgrades(level, upgradesSpent, difficulty) > 0;
}

/**
 * Format XP for display
 */
export function formatXP(xp: number): string {
  if (xp >= 10000) {
    return `${(xp / 1000).toFixed(1)}k`;
  }
  return xp.toLocaleString();
}

/**
 * Get a readable description of XP progress
 */
export function getProgressDescription(xp: number): string {
  const progress = getXPProgress(xp);
  return `Level ${progress.currentLevel} (${formatXP(
    progress.xpIntoLevel
  )}/${formatXP(progress.xpNeededForNext)} XP)`;
}

/**
 * Add XP to story data and update level
 * Returns the new level and whether a level-up occurred
 */
export function addXP(
  storyData: { points: number; level: number },
  xpAmount: number
): { newLevel: number; leveledUp: boolean; levelsGained: number } {
  const oldLevel = storyData.level || 1;
  storyData.points = (storyData.points || 0) + xpAmount;
  const newLevel = calculateLevel(storyData.points);
  storyData.level = newLevel;

  return {
    newLevel,
    leveledUp: newLevel > oldLevel,
    levelsGained: newLevel - oldLevel,
  };
}

/**
 * Initialize level from existing XP (for backward compatibility)
 * Call this when loading a story that might not have level set
 */
export function initializeLevel(storyData: {
  points: number;
  level?: number;
  upgradesSpent?: number;
  difficulty?: AdventureDifficulty;
}): void {
  const calculatedLevel = calculateLevel(storyData.points || 0);

  // If level isn't set, calculate it (minimum Level 1)
  if (
    storyData.level === undefined ||
    storyData.level === null ||
    storyData.level === 0
  ) {
    storyData.level = Math.max(1, calculatedLevel);
  }

  // If upgradesSpent isn't set, default to 0
  if (
    storyData.upgradesSpent === undefined ||
    storyData.upgradesSpent === null
  ) {
    storyData.upgradesSpent = 0;
  }
}

/**
 * Get starting upgrades based on difficulty
 * Easy gives more upgrades to help new players, Expert gives none for challenge
 */
export function getStartingUpgrades(
  difficulty: AdventureDifficulty | undefined
): number {
  return STARTING_UPGRADES_BY_DIFFICULTY[difficulty || "medium"];
}
