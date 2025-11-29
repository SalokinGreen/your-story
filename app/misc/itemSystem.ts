/**
 * Item System Module
 *
 * Handles item grades, durability, and bonuses across different RPG systems.
 */

import { InventoryItem, ItemGrade } from "./structs";

// Re-export types for convenience
export type { ItemGrade } from "./structs";

// Grade order constant for iteration
export const GRADE_ORDER: ItemGrade[] = [
  "common",
  "uncommon",
  "rare",
  "epic",
  "legendary",
  "mythic",
];

// Grade configuration
export interface GradeConfig {
  maxDurability: number;
  color: string; // Tailwind color class
  textColor: string; // Text color class
  bgColor: string; // Background color class
  borderColor: string; // Border color class
  label: string; // Display label
}

// Bonus configuration per RPG system
export interface SystemBonuses {
  common: number;
  uncommon: number;
  rare: number;
  epic: number;
  legendary: number;
  mythic: number;
}

// Grade configurations
export const GRADE_CONFIG: Record<ItemGrade, GradeConfig> = {
  common: {
    maxDurability: 8,
    color: "gray",
    textColor: "text-gray-400",
    bgColor: "bg-gray-700/50",
    borderColor: "border-gray-600",
    label: "Common",
  },
  uncommon: {
    maxDurability: 13,
    color: "green",
    textColor: "text-green-400",
    bgColor: "bg-green-900/30",
    borderColor: "border-green-600",
    label: "Uncommon",
  },
  rare: {
    maxDurability: 20,
    color: "blue",
    textColor: "text-blue-400",
    bgColor: "bg-blue-900/30",
    borderColor: "border-blue-600",
    label: "Rare",
  },
  epic: {
    maxDurability: 30,
    color: "purple",
    textColor: "text-purple-400",
    bgColor: "bg-purple-900/30",
    borderColor: "border-purple-600",
    label: "Epic",
  },
  legendary: {
    maxDurability: 50,
    color: "orange",
    textColor: "text-orange-400",
    bgColor: "bg-orange-900/30",
    borderColor: "border-orange-500",
    label: "Legendary",
  },
  mythic: {
    maxDurability: Infinity,
    color: "yellow",
    textColor: "text-yellow-300",
    bgColor: "bg-yellow-900/30",
    borderColor: "border-yellow-500",
    label: "Mythic",
  },
};

// Bonuses per RPG system - scaled appropriately for each system's math
export const SYSTEM_BONUSES: Record<string, SystemBonuses> = {
  // 3d6: Bell curve centered around 10-11, +1 is significant
  "3d6": {
    common: 0,
    uncommon: 1,
    rare: 2,
    epic: 3,
    legendary: 4,
    mythic: 5,
  },
  // 1d20: Linear, +1 = 5% improvement
  "1d20": {
    common: 0,
    uncommon: 1,
    rare: 2,
    epic: 4,
    legendary: 5,
    mythic: 6,
  },
  // 1d100: +5 per tier makes sense
  "1d100": {
    common: 0,
    uncommon: 5,
    rare: 10,
    epic: 15,
    legendary: 20,
    mythic: 25,
  },
  // Percentile: Same as 1d100
  percentile: {
    common: 0,
    uncommon: 5,
    rare: 10,
    epic: 15,
    legendary: 20,
    mythic: 25,
  },
  // PbtA: 2d6 system, +1 is HUGE (shifts entire tier)
  pbta: {
    common: 0,
    uncommon: 1,
    rare: 1,
    epic: 2,
    legendary: 2,
    mythic: 3,
  },
  // Fate: Ladder system, +1 shifts one step
  fate: {
    common: 0,
    uncommon: 1,
    rare: 1,
    epic: 2,
    legendary: 2,
    mythic: 3,
  },
  // YZE: Dice pool system, bonus = extra dice
  yze: {
    common: 0,
    uncommon: 1,
    rare: 2,
    epic: 3,
    legendary: 4,
    mythic: 5,
  },
  // Explosive: Die size steps (d4→d6→d8→d10→d12→d20)
  explosive: {
    common: 0,
    uncommon: 1, // +1 die step
    rare: 1,
    epic: 2, // +2 die steps
    legendary: 2,
    mythic: 3,
  },
  // Narrative: Simple bonuses
  narrative: {
    common: 0,
    uncommon: 1,
    rare: 1,
    epic: 2,
    legendary: 2,
    mythic: 3,
  },
};

/**
 * Get the grade configuration for an item
 */
export function getGradeConfig(grade: ItemGrade): GradeConfig {
  return GRADE_CONFIG[grade] || GRADE_CONFIG.common;
}

/**
 * Get the bonus for an item based on its grade and the RPG system
 */
export function getItemBonus(item: InventoryItem, rpgSystemId: string): number {
  const grade = item.grade || "common";
  const systemBonuses = SYSTEM_BONUSES[rpgSystemId] || SYSTEM_BONUSES["3d6"];
  return systemBonuses[grade] || 0;
}

/**
 * Get the max durability for an item based on its grade
 */
export function getMaxDurability(grade: ItemGrade): number {
  return (
    GRADE_CONFIG[grade]?.maxDurability || GRADE_CONFIG.common.maxDurability
  );
}

/**
 * Apply durability loss to an item
 * @param item The item to damage
 * @param failed Whether the check failed (more durability loss)
 * @returns Object with new durability and whether the item broke
 */
export function applyDurabilityLoss(
  item: InventoryItem,
  failed: boolean
): { newDurability: number; broken: boolean; durabilityLost: number } {
  // Mythic items never lose durability
  if (item.grade === "mythic") {
    return {
      newDurability: item.durability ?? Infinity,
      broken: false,
      durabilityLost: 0,
    };
  }

  // Story items track durability visually but never break
  const isStoryItem = item.type === "story";

  // Consumables are consumed, not damaged
  if (item.type === "consumable") {
    return {
      newDurability: 0,
      broken: true,
      durabilityLost: item.durability ?? 1,
    };
  }

  const currentDurability =
    item.durability ?? getMaxDurability(item.grade || "common");
  const durabilityLoss = failed ? 2 : 1;
  const newDurability = Math.max(0, currentDurability - durabilityLoss);

  // Story items never break even at 0 durability
  const broken = !isStoryItem && newDurability <= 0;

  return {
    newDurability,
    broken,
    durabilityLost: Math.min(durabilityLoss, currentDurability),
  };
}

/**
 * Initialize item with default grade and durability if not set
 */
export function initializeItem(item: Partial<InventoryItem>): InventoryItem {
  const grade = item.grade || "common";
  const maxDurability = getMaxDurability(grade);

  return {
    name: item.name || "Unknown Item",
    quantity: item.quantity ?? 1,
    description: item.description || "",
    type: item.type || "normal",
    grade: grade,
    durability: item.durability ?? maxDurability,
    maxDurability: maxDurability,
    stat: item.stat,
    resource: item.resource,
    symbol: item.symbol || "Package",
    custom_symbol_url: item.custom_symbol_url,
  };
}

/**
 * Repair an item by a certain amount
 */
export function repairItem(
  item: InventoryItem,
  amount: number
): { newDurability: number; amountRepaired: number } {
  if (item.grade === "mythic") {
    return { newDurability: Infinity, amountRepaired: 0 };
  }

  const maxDurability =
    item.maxDurability ?? getMaxDurability(item.grade || "common");
  const currentDurability = item.durability ?? maxDurability;
  const newDurability = Math.min(maxDurability, currentDurability + amount);
  const amountRepaired = newDurability - currentDurability;

  return { newDurability, amountRepaired };
}

/**
 * Damage an item by a specific amount (for narrative damage)
 */
export function damageItem(
  item: InventoryItem,
  amount: number
): { newDurability: number; broken: boolean; amountDamaged: number } {
  if (item.grade === "mythic") {
    return { newDurability: Infinity, broken: false, amountDamaged: 0 };
  }

  const currentDurability =
    item.durability ?? getMaxDurability(item.grade || "common");
  const newDurability = Math.max(0, currentDurability - amount);
  const isStoryItem = item.type === "story";
  const broken = !isStoryItem && newDurability <= 0;

  return {
    newDurability,
    broken,
    amountDamaged: Math.min(amount, currentDurability),
  };
}

/**
 * Upgrade an item's grade
 */
export function upgradeItemGrade(
  item: InventoryItem,
  newGrade: ItemGrade
): { success: boolean; message: string } {
  const gradeOrder: ItemGrade[] = [
    "common",
    "uncommon",
    "rare",
    "epic",
    "legendary",
    "mythic",
  ];
  const currentIndex = gradeOrder.indexOf(item.grade || "common");
  const newIndex = gradeOrder.indexOf(newGrade);

  if (newIndex <= currentIndex) {
    return {
      success: false,
      message: `Cannot downgrade ${item.name} from ${
        item.grade || "common"
      } to ${newGrade}`,
    };
  }

  const newMaxDurability = getMaxDurability(newGrade);

  return {
    success: true,
    message: `${
      item.name
    } upgraded to ${newGrade}! Max durability increased to ${
      newGrade === "mythic" ? "∞" : newMaxDurability
    }.`,
  };
}

/**
 * Get durability display info
 */
export function getDurabilityDisplay(item: InventoryItem): {
  current: number;
  max: number;
  percentage: number;
  isLow: boolean;
  isCritical: boolean;
  displayText: string;
} {
  if (item.grade === "mythic") {
    return {
      current: Infinity,
      max: Infinity,
      percentage: 100,
      isLow: false,
      isCritical: false,
      displayText: "∞",
    };
  }

  const maxDurability =
    item.maxDurability ?? getMaxDurability(item.grade || "common");
  const currentDurability = item.durability ?? maxDurability;
  const percentage = (currentDurability / maxDurability) * 100;

  return {
    current: currentDurability,
    max: maxDurability,
    percentage,
    isLow: percentage <= 25,
    isCritical: percentage <= 10,
    displayText: `${currentDurability}/${maxDurability}`,
  };
}

/**
 * Get all grades in order
 */
export function getGradeOrder(): ItemGrade[] {
  return ["common", "uncommon", "rare", "epic", "legendary", "mythic"];
}

/**
 * Check if a string is a valid grade
 */
export function isValidGrade(grade: string): grade is ItemGrade {
  return ["common", "uncommon", "rare", "epic", "legendary", "mythic"].includes(
    grade
  );
}
