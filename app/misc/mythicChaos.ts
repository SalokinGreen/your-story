/**
 * Advanced RPG Tools Auto-Chaos System
 *
 * Automatically adjusts chaos factor based on player performance in skill checks.
 * Chaos increases when players struggle, decreases when they succeed.
 */

import { AGMTState, SkillCheckResult, StoryData, ItemGrade } from "./structs";

/**
 * Calculate chaos adjustment based on recent performance
 * @returns Delta to apply to chaos factor (-2 to +2)
 */
export function calculateChaosAdjustment(agmtState: AGMTState): number {
  const history = agmtState.skillCheckHistory;

  // Don't adjust if:
  // 1. Not enough data (< 5 checks)
  // 2. Already adjusted this scene
  // 3. Adjusted within last 2 scenes
  if (
    history.length < 5 ||
    agmtState.lastChaosAdjustment === agmtState.sceneCount ||
    agmtState.sceneCount - agmtState.lastChaosAdjustment < 2
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
  const streak = agmtState.currentStreak;
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
 * @returns Updated AGMTState with adjusted chaos
 */
export function applyChaosAdjustment(agmtState: AGMTState): AGMTState {
  const delta = calculateChaosAdjustment(agmtState);

  if (delta === 0) {
    return agmtState;
  }

  const newChaos = Math.max(1, Math.min(9, agmtState.chaosFactor + delta));

  return {
    ...agmtState,
    chaosFactor: newChaos,
    lastChaosAdjustment: agmtState.sceneCount,
  };
}

/**
 * Get human-readable reason for chaos adjustment
 */
export function getChaosAdjustmentReason(
  oldChaos: number,
  newChaos: number,
  agmtState: AGMTState
): string {
  if (oldChaos === newChaos) return "";

  const delta = newChaos - oldChaos;
  const streak = agmtState.currentStreak;

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
  agmtState: AGMTState,
  result: SkillCheckResult
): AGMTState {
  // Add to history (keep last 15 checks)
  const updatedHistory = [...agmtState.skillCheckHistory, result].slice(-15);

  // Update streak
  let newStreak = agmtState.currentStreak || 0;
  if (result.success) {
    newStreak = newStreak > 0 ? newStreak + 1 : 1;
  } else {
    newStreak = newStreak < 0 ? newStreak - 1 : -1;
  }

  return {
    ...agmtState,
    skillCheckHistory: updatedHistory,
    currentStreak: newStreak,
  };
}

/**
 * Initialize agmtState with new fields for existing adventures
 */
export function migrateAGMTState(
  agmtState: AGMTState | undefined
): AGMTState | undefined {
  if (!agmtState) return undefined;

  return {
    ...agmtState,
    skillCheckHistory: agmtState.skillCheckHistory || [],
    currentStreak: agmtState.currentStreak || 0,
    lastChaosAdjustment: agmtState.lastChaosAdjustment ?? -999,
  };
}

/**
 * Migrate "mythic" grade to "agmt" in inventory items
 * This handles backward compatibility after the mythic → agmt rename
 */
export function migrateItemGrades(storyData: StoryData): void {
  if (!storyData.inventory) return;

  for (const item of storyData.inventory) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((item.grade as any) === "mythic") {
      item.grade = "agmt" as ItemGrade;
    }
  }
}
