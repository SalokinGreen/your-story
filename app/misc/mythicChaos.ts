/**
 * Mythic GME Auto-Chaos System
 *
 * Automatically adjusts chaos factor based on player performance in skill checks.
 * Chaos increases when players struggle, decreases when they succeed.
 */

import { MythicState, SkillCheckResult } from "./structs";

/**
 * Calculate chaos adjustment based on recent performance
 * @returns Delta to apply to chaos factor (-2 to +2)
 */
export function calculateChaosAdjustment(mythicState: MythicState): number {
  const history = mythicState.skillCheckHistory;

  // Don't adjust if:
  // 1. Not enough data (< 5 checks)
  // 2. Already adjusted this scene
  // 3. Adjusted within last 2 scenes
  if (
    history.length < 5 ||
    mythicState.lastChaosAdjustment === mythicState.sceneCount ||
    mythicState.sceneCount - mythicState.lastChaosAdjustment < 2
  ) {
    return 0; // No change
  }

  // Calculate weighted success rate (recent checks matter more)
  let weightedSuccesses = 0;
  let totalWeight = 0;

  history.forEach((check, index) => {
    // Exponential decay: recent checks weighted higher
    const weight = Math.pow(1.2, index); // More recent = higher weight
    totalWeight += weight;

    if (check.success) {
      // Factor in margin: crushing wins count more
      const marginBonus = Math.min(check.margin / 10, 0.5); // Max +0.5
      weightedSuccesses += weight * (1 + marginBonus);
    } else {
      // Factor in margin: crushing failures count against more
      const marginPenalty = Math.min(Math.abs(check.margin) / 10, 0.5);
      weightedSuccesses -= weight * marginPenalty;
    }
  });

  const weightedSuccessRate = weightedSuccesses / totalWeight;

  // Check streak momentum
  const streak = mythicState.currentStreak;
  const streakBonus = Math.abs(streak) >= 3 ? Math.sign(streak) * 0.5 : 0;

  // Final score: -1 to +1
  // Negative = players struggling (increase chaos)
  // Positive = players succeeding (decrease chaos)
  const performanceScore = weightedSuccessRate + streakBonus;

  // Convert to chaos delta
  let delta = 0;

  if (performanceScore < -0.3) {
    delta = +2; // Struggling badly → increase chaos significantly
  } else if (performanceScore < -0.1) {
    delta = +1; // Struggling → increase chaos
  } else if (performanceScore > 0.3) {
    delta = -2; // Crushing it → decrease chaos significantly
  } else if (performanceScore > 0.1) {
    delta = -1; // Doing well → decrease chaos
  }
  // else: balanced performance, no change

  return delta;
}

/**
 * Apply chaos adjustment based on performance
 * @returns Updated MythicState with adjusted chaos
 */
export function applyChaosAdjustment(mythicState: MythicState): MythicState {
  const delta = calculateChaosAdjustment(mythicState);

  if (delta === 0) {
    return mythicState;
  }

  const newChaos = Math.max(1, Math.min(9, mythicState.chaosFactor + delta));

  return {
    ...mythicState,
    chaosFactor: newChaos,
    lastChaosAdjustment: mythicState.sceneCount,
  };
}

/**
 * Get human-readable reason for chaos adjustment
 */
export function getChaosAdjustmentReason(
  oldChaos: number,
  newChaos: number,
  mythicState: MythicState
): string {
  if (oldChaos === newChaos) return "";

  const delta = newChaos - oldChaos;
  const streak = mythicState.currentStreak;

  if (delta > 0) {
    // Chaos increased
    if (streak < -3) {
      return `💀 Chaos increased to ${newChaos} (${Math.abs(
        streak
      )} failures in a row - things are spiraling!)`;
    } else {
      return `⚠️ Chaos increased to ${newChaos} (struggling with recent challenges)`;
    }
  } else {
    // Chaos decreased
    if (streak > 3) {
      return `✨ Chaos decreased to ${newChaos} (${streak} successes in a row - you're on fire!)`;
    } else {
      return `📉 Chaos decreased to ${newChaos} (overcoming obstacles with skill)`;
    }
  }
}

/**
 * Add a skill check result to history and update streak
 */
export function addSkillCheckResult(
  mythicState: MythicState,
  result: SkillCheckResult
): MythicState {
  // Add to history (keep last 15 checks)
  const updatedHistory = [...mythicState.skillCheckHistory, result].slice(-15);

  // Update streak
  let newStreak = mythicState.currentStreak || 0;
  if (result.success) {
    newStreak = newStreak > 0 ? newStreak + 1 : 1;
  } else {
    newStreak = newStreak < 0 ? newStreak - 1 : -1;
  }

  return {
    ...mythicState,
    skillCheckHistory: updatedHistory,
    currentStreak: newStreak,
  };
}

/**
 * Initialize mythicState with new fields for existing adventures
 */
export function migrateMythicState(
  mythicState: MythicState | undefined
): MythicState | undefined {
  if (!mythicState) return undefined;

  return {
    ...mythicState,
    skillCheckHistory: mythicState.skillCheckHistory || [],
    currentStreak: mythicState.currentStreak || 0,
    lastChaosAdjustment: mythicState.lastChaosAdjustment ?? -999,
  };
}
