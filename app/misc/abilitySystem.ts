/**
 * Ability System Module
 *
 * Handles ability grades, costs, cooldowns, and bonuses across different RPG systems.
 */

import { Ability, AbilityCost, AbilityGrade, StoryData } from "./structs";

// Re-export types for convenience
export type { AbilityGrade } from "./structs";

// Grade order constant for iteration
export const ABILITY_GRADE_ORDER: AbilityGrade[] = [
  "novice",
  "apprentice",
  "adept",
  "expert",
  "master",
  "legendary",
];

// Grade configuration
export interface AbilityGradeConfig {
  color: string; // Hex color for UI
  label: string; // Display label
  description: string; // Tooltip description
}

// Bonus configuration per RPG system
export interface AbilitySystemBonuses {
  novice: number;
  apprentice: number;
  adept: number;
  expert: number;
  master: number;
  legendary: number;
}

// Grade visual configuration
export const ABILITY_GRADE_CONFIG: Record<AbilityGrade, AbilityGradeConfig> = {
  novice: {
    color: "#9ca3af", // Gray
    label: "Novice",
    description: "Basic ability with minimal bonus",
  },
  apprentice: {
    color: "#22c55e", // Green
    label: "Apprentice",
    description: "Trained ability with small bonus",
  },
  adept: {
    color: "#3b82f6", // Blue
    label: "Adept",
    description: "Skilled ability with moderate bonus",
  },
  expert: {
    color: "#a855f7", // Purple
    label: "Expert",
    description: "Mastered ability with strong bonus",
  },
  master: {
    color: "#f97316", // Orange
    label: "Master",
    description: "Elite ability with powerful bonus",
  },
  legendary: {
    color: "#eab308", // Gold
    label: "Legendary",
    description: "Transcendent ability with maximum bonus",
  },
};

// System-specific bonuses for each grade
const ABILITY_SYSTEM_BONUSES: Record<string, AbilitySystemBonuses> = {
  // Standard systems (3d6, 1d20) - moderate bonuses
  "3d6": {
    novice: 0,
    apprentice: 1,
    adept: 2,
    expert: 3,
    master: 4,
    legendary: 5,
  },
  "1d20": {
    novice: 0,
    apprentice: 1,
    adept: 2,
    expert: 3,
    master: 4,
    legendary: 5,
  },
  // Percentile systems - larger bonuses
  "1d100": {
    novice: 0,
    apprentice: 5,
    adept: 10,
    expert: 15,
    master: 20,
    legendary: 25,
  },
  percentile: {
    novice: 0,
    apprentice: 5,
    adept: 10,
    expert: 15,
    master: 20,
    legendary: 25,
  },
  // PbtA - smaller bonuses (2d6 system)
  pbta: {
    novice: 0,
    apprentice: 1,
    adept: 1,
    expert: 2,
    master: 2,
    legendary: 3,
  },
  // Fate - ladder bonuses
  fate: {
    novice: 0,
    apprentice: 1,
    adept: 1,
    expert: 2,
    master: 2,
    legendary: 3,
  },
  // Year Zero Engine - dice pool additions
  yze: {
    novice: 0,
    apprentice: 1,
    adept: 1,
    expert: 2,
    master: 2,
    legendary: 3,
  },
  // Explosive dice - die size upgrades
  explosive: {
    novice: 0,
    apprentice: 1,
    adept: 2,
    expert: 3,
    master: 4,
    legendary: 5,
  },
  // Narrative - no mechanical bonus
  narrative: {
    novice: 0,
    apprentice: 0,
    adept: 0,
    expert: 0,
    master: 0,
    legendary: 0,
  },
};

/**
 * Get the bonus for an ability based on its grade and the RPG system
 */
export function getAbilityBonus(ability: Ability, rpgSystemId: string): number {
  const grade = ability.grade || "novice";
  const systemBonuses =
    ABILITY_SYSTEM_BONUSES[rpgSystemId] || ABILITY_SYSTEM_BONUSES["3d6"];
  return systemBonuses[grade];
}

/**
 * Get the grade configuration for an ability grade
 */
export function getAbilityGradeConfig(grade: AbilityGrade): AbilityGradeConfig {
  return ABILITY_GRADE_CONFIG[grade];
}

/**
 * Check if a string is a valid ability grade
 */
export function isValidAbilityGrade(grade: string): grade is AbilityGrade {
  return ABILITY_GRADE_ORDER.includes(grade as AbilityGrade);
}

/**
 * Get the next grade up from the current grade
 */
export function getNextAbilityGrade(
  currentGrade: AbilityGrade
): AbilityGrade | null {
  const currentIndex = ABILITY_GRADE_ORDER.indexOf(currentGrade);
  if (currentIndex === -1 || currentIndex >= ABILITY_GRADE_ORDER.length - 1) {
    return null; // Already at max or invalid
  }
  return ABILITY_GRADE_ORDER[currentIndex + 1];
}

/**
 * Validate if the player can afford the ability cost
 */
export function canAffordAbility(
  ability: Ability,
  storyData: StoryData
): { canAfford: boolean; missingCosts: string[] } {
  const missingCosts: string[] = [];

  if (!ability.cost || ability.cost.length === 0) {
    return { canAfford: true, missingCosts: [] };
  }

  for (const cost of ability.cost) {
    if (cost.type === "resource") {
      const resource = storyData.resources.find(
        (r) => r.name.toLowerCase() === cost.name.toLowerCase()
      );
      if (!resource || resource.value < cost.amount) {
        const current = resource?.value ?? 0;
        missingCosts.push(`${cost.name}: need ${cost.amount}, have ${current}`);
      }
    } else if (cost.type === "variable") {
      const variable = storyData.variables?.find(
        (v) =>
          v.name.toLowerCase() === cost.name.toLowerCase() &&
          v.type === "number"
      );
      if (!variable || (variable as any).value < cost.amount) {
        const current = (variable as any)?.value ?? 0;
        missingCosts.push(`${cost.name}: need ${cost.amount}, have ${current}`);
      }
    }
  }

  return {
    canAfford: missingCosts.length === 0,
    missingCosts,
  };
}

/**
 * Deduct the ability cost from resources/variables
 * Returns the state changes made
 */
export function deductAbilityCost(
  ability: Ability,
  storyData: StoryData
): string[] {
  const stateChanges: string[] = [];

  if (!ability.cost || ability.cost.length === 0) {
    return stateChanges;
  }

  for (const cost of ability.cost) {
    if (cost.type === "resource") {
      const resource = storyData.resources.find(
        (r) => r.name.toLowerCase() === cost.name.toLowerCase()
      );
      if (resource) {
        const before = resource.value;
        resource.value = Math.max(0, resource.value - cost.amount);
        stateChanges.push(`${cost.name}: ${before} → ${resource.value}`);
      }
    } else if (cost.type === "variable") {
      const variable = storyData.variables?.find(
        (v) =>
          v.name.toLowerCase() === cost.name.toLowerCase() &&
          v.type === "number"
      );
      if (variable && variable.type === "number") {
        const before = variable.value;
        variable.value = Math.max(0, variable.value - cost.amount);
        stateChanges.push(`${cost.name}: ${before} → ${variable.value}`);
      }
    }
  }

  return stateChanges;
}

/**
 * Check if an ability is on cooldown
 */
export function isOnCooldown(ability: Ability): boolean {
  return (ability.currentCooldown ?? 0) > 0;
}

/**
 * Start the cooldown for an ability
 */
export function startCooldown(ability: Ability): void {
  if (ability.cooldown && ability.cooldown > 0) {
    ability.currentCooldown = ability.cooldown;
  }
}

/**
 * Reduce cooldowns for all abilities by 1 turn
 * Returns list of abilities that came off cooldown
 */
export function tickCooldowns(abilities: Ability[]): string[] {
  const offCooldown: string[] = [];

  for (const ability of abilities) {
    if (ability.currentCooldown && ability.currentCooldown > 0) {
      ability.currentCooldown--;
      if (ability.currentCooldown === 0) {
        offCooldown.push(ability.name);
      }
    }
  }

  return offCooldown;
}

/**
 * Get display string for ability cost
 */
export function formatAbilityCost(cost: AbilityCost[]): string {
  if (!cost || cost.length === 0) {
    return "Free";
  }
  return cost.map((c) => `${c.amount} ${c.name}`).join(", ");
}

/**
 * Get cooldown display string
 */
export function formatCooldown(ability: Ability): string {
  if (!ability.cooldown || ability.cooldown === 0) {
    return "No cooldown";
  }
  if (ability.currentCooldown && ability.currentCooldown > 0) {
    return `${ability.currentCooldown} turn${
      ability.currentCooldown > 1 ? "s" : ""
    } remaining`;
  }
  return `${ability.cooldown} turn cooldown`;
}

/**
 * Initialize an ability with defaults
 */
export function initializeAbility(partial: Partial<Ability>): Ability {
  return {
    name: partial.name || "New Ability",
    description: partial.description || "",
    grade: partial.grade || "novice",
    cost: partial.cost || [],
    stat: partial.stat,
    symbol: partial.symbol || "Sparkles",
    custom_symbol_url: partial.custom_symbol_url,
    cooldown: partial.cooldown || 0,
    currentCooldown: partial.currentCooldown || 0,
  };
}

/**
 * Upgrade an ability to the next grade
 */
export function upgradeAbility(ability: Ability): {
  success: boolean;
  newGrade?: AbilityGrade;
} {
  const nextGrade = getNextAbilityGrade(ability.grade);
  if (!nextGrade) {
    return { success: false };
  }
  ability.grade = nextGrade;
  return { success: true, newGrade: nextGrade };
}
