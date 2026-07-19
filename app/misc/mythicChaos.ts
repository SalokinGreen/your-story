/**
 * Advanced RPG Tools state migration helpers.
 *
 * This file previously also computed an automatic chaos-factor adjustment
 * from `skillCheckHistory`/`currentStreak` - that logic was dead in
 * practice (nothing in the app ever appended to `skillCheckHistory`, so
 * the performance-based delta it computed was always 0) and was narrower
 * than Mythic's actual rule even on paper (win/loss streaks, not scene
 * control). It's been replaced by a scene-check-driven adjustment in
 * `increment_scene` (see toolExecutor.ts), which uses `checkScene`/
 * `adjustChaosFactor` from `mythic.ts`. `skillCheckHistory`/
 * `currentStreak` remain on `AGMTState` as manually-editable, informational
 * fields only (see the story's Chaos/Oracle tab) - they no longer drive
 * chaos automatically.
 */

import { AGMTState, StoryData, ItemGrade } from "./structs";

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
