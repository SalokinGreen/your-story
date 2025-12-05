/**
 * XP-based leveling system with adventure-specific customization.
 *
 * Authors can override:
 * - The XP curve (base quadratic or fully custom per-level thresholds)
 * - Level cap
 * - Upgrade points granted per level
 * - Starting upgrades per difficulty
 */

import {
  AdventureDifficulty,
  LevelCurvePoint,
  LevelingSettings,
  LevelUpgradeOverride,
  STARTING_UPGRADES_BY_DIFFICULTY,
} from "./structs";

export const XP_BASE = 100;
const DEFAULT_LEVEL_CAP = 100;

// XP rewards for different actions
export const XP_REWARDS = {
  STORY_BEAT: 25, // Completing a story beat (turn with meaningful progress)
  CHAPTER: 100, // Completing a chapter
  QUEST: 50, // Completing a quest (varies by quest)
  CHALLENGE_WON: 50, // Winning a scene challenge (varies by challenge)
  ACHIEVEMENT: 25, // Unlocking an achievement (varies by achievement)
} as const;

export const DEFAULT_LEVELING_SETTINGS: LevelingSettings = {
  xpBase: XP_BASE,
  levelCap: DEFAULT_LEVEL_CAP,
  useCustomCurve: false,
  customCurve: [],
  defaultUpgradesPerLevel: 1,
  upgradeOverrides: [],
  startingUpgrades: { ...STARTING_UPGRADES_BY_DIFFICULTY },
};

type ResolvedLevelingSettings = {
  xpBase: number;
  levelCap: number;
  useCustomCurve: boolean;
  customCurve: LevelCurvePoint[];
  customCurveMap: Map<number, number>;
  defaultUpgradesPerLevel: number;
  upgradeOverrides: LevelUpgradeOverride[];
  upgradeOverrideMap: Map<number, number>;
  startingUpgrades: Record<AdventureDifficulty, number>;
};

function sanitizeLevel(value: number, minimum = 1): number {
  if (!Number.isFinite(value)) return minimum;
  return Math.max(minimum, Math.floor(value));
}

function sanitizePositive(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(1, Math.floor(value));
}

function sanitizeNonNegative(value: number, fallback = 0): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(0, Math.floor(value));
}

function resolveLevelingSettings(
  settings?: LevelingSettings
): ResolvedLevelingSettings {
  const source = settings || {};
  const defaultSource = DEFAULT_LEVELING_SETTINGS || {};

  const xpBase = sanitizePositive(
    source.xpBase ?? defaultSource.xpBase ?? XP_BASE,
    XP_BASE
  );

  const providedCurve = source.customCurve ?? defaultSource.customCurve ?? [];
  const curveEntries = providedCurve
    .filter(
      (point): point is LevelCurvePoint =>
        !!point &&
        typeof point.level === "number" &&
        typeof point.cumulativeXP === "number" &&
        point.level >= 2
    )
    .map((point) => ({
      level: sanitizeLevel(point.level, 2),
      cumulativeXP: sanitizeNonNegative(point.cumulativeXP, 0),
    }));

  const customCurveMap = new Map<number, number>();
  curveEntries.forEach((entry) => {
    customCurveMap.set(entry.level, entry.cumulativeXP);
  });

  const sortedCurveEntries = Array.from(customCurveMap.entries()).sort(
    (a, b) => a[0] - b[0]
  );

  const customCurve: LevelCurvePoint[] = [];
  let lastXP = 0;
  const normalizedCurveMap = new Map<number, number>();
  for (const [level, xpValue] of sortedCurveEntries) {
    const sanitizedXP = Math.max(lastXP, xpValue);
    customCurve.push({ level, cumulativeXP: sanitizedXP });
    normalizedCurveMap.set(level, sanitizedXP);
    lastXP = sanitizedXP;
  }

  const providedOverrides =
    source.upgradeOverrides ?? defaultSource.upgradeOverrides ?? [];
  const overrideMap = new Map<number, number>();
  providedOverrides.forEach((override) => {
    if (
      override &&
      typeof override.level === "number" &&
      typeof override.upgrades === "number"
    ) {
      const level = sanitizeLevel(override.level, 1);
      const upgrades = sanitizeNonNegative(override.upgrades, 0);
      overrideMap.set(level, upgrades);
    }
  });
  const upgradeOverrides: LevelUpgradeOverride[] = Array.from(
    overrideMap.entries()
  )
    .sort((a, b) => a[0] - b[0])
    .map(([level, upgrades]) => ({ level, upgrades }));

  const highestCustomLevel =
    customCurve.length > 0 ? customCurve[customCurve.length - 1].level : null;
  const levelCapCandidate =
    source.levelCap ??
    (source.useCustomCurve && highestCustomLevel
      ? highestCustomLevel
      : defaultSource.levelCap ?? DEFAULT_LEVEL_CAP);
  const levelCap = sanitizeLevel(levelCapCandidate, 1);

  const defaultUpgradesPerLevel = Math.max(
    0,
    source.defaultUpgradesPerLevel ??
      defaultSource.defaultUpgradesPerLevel ??
      1
  );

  const startingUpgrades = {
    easy: sanitizeNonNegative(
      source.startingUpgrades?.easy ??
        defaultSource.startingUpgrades?.easy ??
        STARTING_UPGRADES_BY_DIFFICULTY.easy,
      STARTING_UPGRADES_BY_DIFFICULTY.easy
    ),
    medium: sanitizeNonNegative(
      source.startingUpgrades?.medium ??
        defaultSource.startingUpgrades?.medium ??
        STARTING_UPGRADES_BY_DIFFICULTY.medium,
      STARTING_UPGRADES_BY_DIFFICULTY.medium
    ),
    hard: sanitizeNonNegative(
      source.startingUpgrades?.hard ??
        defaultSource.startingUpgrades?.hard ??
        STARTING_UPGRADES_BY_DIFFICULTY.hard,
      STARTING_UPGRADES_BY_DIFFICULTY.hard
    ),
    expert: sanitizeNonNegative(
      source.startingUpgrades?.expert ??
        defaultSource.startingUpgrades?.expert ??
        STARTING_UPGRADES_BY_DIFFICULTY.expert,
      STARTING_UPGRADES_BY_DIFFICULTY.expert
    ),
  };

  return {
    xpBase,
    levelCap,
    useCustomCurve: source.useCustomCurve ?? false,
    customCurve,
    customCurveMap: normalizedCurveMap,
    defaultUpgradesPerLevel,
    upgradeOverrides,
    upgradeOverrideMap: overrideMap,
    startingUpgrades,
  };
}

function calculateLevelInternal(
  xp: number,
  settings: ResolvedLevelingSettings
): number {
  if (xp <= 0) return 1;

  let low = 1;
  let high = settings.levelCap;

  while (low < high) {
    const mid = Math.floor((low + high + 1) / 2);
    if (getCumulativeXPForLevelInternal(mid - 1, settings) <= xp) {
      low = mid;
    } else {
      high = mid - 1;
    }
  }

  return Math.min(low, settings.levelCap);
}

function getCumulativeXPForLevelInternal(
  level: number,
  settings: ResolvedLevelingSettings
): number {
  if (level <= 1) return 0;

  if (settings.useCustomCurve) {
    const customXP = settings.customCurveMap.get(level);
    if (customXP !== undefined) {
      return customXP;
    }
  }

  const lvl = sanitizeLevel(level, 1);
  return (
    (settings.xpBase * (lvl * (lvl + 1) * (2 * lvl + 1))) / 6
  );
}

function getUpgradesForLevel(
  level: number,
  settings: ResolvedLevelingSettings
): number {
  if (level <= 1) return 0;
  const override = settings.upgradeOverrideMap.get(level);
  if (override !== undefined) {
    return override;
  }
  return settings.defaultUpgradesPerLevel;
}

/**
 * Calculate the XP required to reach a specific level.
 * When custom curves are enabled, this will prefer author-defined thresholds.
 */
export function getXPForLevel(
  level: number,
  levelingSettings?: LevelingSettings
): number {
  if (level <= 0) return 0;
  const resolved = resolveLevelingSettings(levelingSettings);
  const cumulative = getCumulativeXPForLevelInternal(level, resolved);
  const previous = getCumulativeXPForLevelInternal(level - 1, resolved);
  return Math.max(0, cumulative - previous);
}

/**
 * Calculate cumulative XP needed to reach a level (sum of all previous levels)
 */
export function getCumulativeXPForLevel(
  level: number,
  levelingSettings?: LevelingSettings
): number {
  const resolved = resolveLevelingSettings(levelingSettings);
  return getCumulativeXPForLevelInternal(level, resolved);
}

/**
 * Calculate the player's current level from their total XP.
 * Supports both quadratic and custom curves.
 */
export function calculateLevel(
  xp: number,
  levelingSettings?: LevelingSettings
): number {
  const resolved = resolveLevelingSettings(levelingSettings);
  return calculateLevelInternal(xp, resolved);
}

/**
 * Get XP progress towards the next level.
 */
export function getXPProgress(
  xp: number,
  levelingSettings?: LevelingSettings
): {
  currentLevel: number;
  xpIntoLevel: number;
  xpNeededForNext: number;
  percentage: number;
  totalXP: number;
} {
  const resolved = resolveLevelingSettings(levelingSettings);
  const currentLevel = calculateLevelInternal(xp, resolved);
  const previousThreshold =
    currentLevel <= 1
      ? 0
      : getCumulativeXPForLevelInternal(currentLevel - 1, resolved);
  const isAtCap = currentLevel >= resolved.levelCap;
  const nextLevel = isAtCap ? currentLevel : currentLevel + 1;
  const nextThreshold = isAtCap
    ? previousThreshold
    : getCumulativeXPForLevelInternal(nextLevel, resolved);

  const xpIntoLevel = Math.max(0, xp - previousThreshold);
  const xpNeededForNext = Math.max(0, nextThreshold - previousThreshold);
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
 * Calculate how many upgrades are available.
 * Starting upgrades are based on difficulty (overridable per adventure).
 * Level-up upgrades respect author-defined per-level overrides.
 */
export function getAvailableUpgrades(
  level: number,
  upgradesSpent: number,
  difficulty?: AdventureDifficulty,
  levelingSettings?: LevelingSettings
): number {
  const resolved = resolveLevelingSettings(levelingSettings);
  const starting =
    resolved.startingUpgrades[difficulty || "medium"] ?? 0;

  const normalizedLevel = sanitizeLevel(level || 1, 1);
  let earned = 0;
  for (let lvl = 2; lvl <= normalizedLevel; lvl++) {
    earned += getUpgradesForLevel(lvl, resolved);
  }

  const available = starting + earned - Math.max(0, upgradesSpent || 0);
  return Math.max(0, available);
}

/**
 * Check if player has pending level-up rewards to claim.
 */
export function hasPendingLevelUp(
  level: number,
  upgradesSpent: number,
  difficulty?: AdventureDifficulty,
  levelingSettings?: LevelingSettings
): boolean {
  return (
    getAvailableUpgrades(
      level,
      upgradesSpent,
      difficulty,
      levelingSettings
    ) > 0
  );
}

/**
 * Format XP for display.
 */
export function formatXP(xp: number): string {
  if (xp >= 10000) {
    return `${(xp / 1000).toFixed(1)}k`;
  }
  return xp.toLocaleString();
}

/**
 * Get a readable description of XP progress.
 */
export function getProgressDescription(
  xp: number,
  levelingSettings?: LevelingSettings
): string {
  const progress = getXPProgress(xp, levelingSettings);
  return `Level ${progress.currentLevel} (${formatXP(
    progress.xpIntoLevel
  )}/${formatXP(progress.xpNeededForNext)} XP)`;
}

/**
 * Add XP to story data and update level.
 * Returns the new level and whether a level-up occurred.
 */
export function addXP(
  storyData: {
    points: number;
    level: number;
    levelingSettings?: LevelingSettings;
  },
  xpAmount: number,
  levelingSettingsOverride?: LevelingSettings
): { newLevel: number; leveledUp: boolean; levelsGained: number } {
  const appliedSettings: LevelingSettings | undefined =
    levelingSettingsOverride ?? storyData.levelingSettings;
  const oldLevel = storyData.level || 1;
  storyData.points = (storyData.points || 0) + xpAmount;
  const resolved = resolveLevelingSettings(appliedSettings);
  const newLevel = calculateLevelInternal(storyData.points, resolved);
  storyData.level = newLevel;

  return {
    newLevel,
    leveledUp: newLevel > oldLevel,
    levelsGained: newLevel - oldLevel,
  };
}

/**
 * Initialize level from existing XP (for backward compatibility).
 * Call this when loading a story that might not have level set.
 */
export function initializeLevel(storyData: {
  points: number;
  level?: number;
  upgradesSpent?: number;
  difficulty?: AdventureDifficulty;
  levelingSettings?: LevelingSettings;
}): void {
  const resolved = resolveLevelingSettings(storyData.levelingSettings);
  const calculatedLevel = calculateLevelInternal(
    storyData.points || 0,
    resolved
  );

  if (
    storyData.level === undefined ||
    storyData.level === null ||
    storyData.level === 0
  ) {
    storyData.level = Math.max(1, calculatedLevel);
  }

  if (
    storyData.upgradesSpent === undefined ||
    storyData.upgradesSpent === null
  ) {
    storyData.upgradesSpent = 0;
  }
}

/**
 * Get starting upgrades based on difficulty, honoring adventure overrides.
 */
export function getStartingUpgrades(
  difficulty: AdventureDifficulty | undefined,
  levelingSettings?: LevelingSettings
): number {
  const resolved = resolveLevelingSettings(levelingSettings);
  return resolved.startingUpgrades[difficulty || "medium"] ?? 0;
}
