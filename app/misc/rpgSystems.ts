/**
 * RPG System Configurations
 *
 * This module defines different dice systems for the story game.
 * Each system has its own mechanics, DC calculations, and AI prompts.
 */

// Panic table entry for stress dice systems (Year Zero Engine)
export interface PanicEntry {
  min: number; // Minimum roll value (inclusive)
  max: number; // Maximum roll value (inclusive)
  effect: string; // Short effect name
  description: string; // Full effect description
}

export type RPGSystemType =
  | "3d6"
  | "1d20"
  | "1d100"
  | "percentile"
  | "pbta"
  | "fate"
  | "yze"
  | "explosive"
  | "narrative";

export interface RPGSystem {
  id: RPGSystemType;
  name: string;
  description: string;

  // Dice configuration
  dice: {
    count: number; // Number of dice to roll
    sides: number; // Number of sides per die
    min: number; // Minimum possible roll
    max: number; // Maximum possible roll
  };

  // Mechanics
  rollUnder?: boolean; // If true, success = roll < stat (no DC from AI)
  hasPartialSuccess?: boolean; // If true, system supports partial success (PbtA-style)
  hasSuccessWithStyle?: boolean; // If true, system supports success with style (Fate-style)
  hasStressDice?: boolean; // If true, system uses stress dice (YZE-style)
  hasPushMechanic?: boolean; // If true, system supports pushing rolls (YZE-style)
  hasExplodingDice?: boolean; // If true, dice explode on max values and reroll (Kids on Bikes style)
  noDice?: boolean; // If true, no dice rolls at all - pure narrative (Narrative system)
  stressDiceMax?: number; // Maximum stress dice that can be added per roll
  panicTable?: PanicEntry[]; // Panic table for stress dice systems

  // Stat to modifier conversion (for unified 0-100 stat system)
  statToModifier: (stat: number) => number; // Convert 0-100 stat to system-appropriate modifier

  // Stat to die size conversion (for exploding dice systems)
  statToDieSize?: (stat: number) => number; // Convert 0-100 stat to die size (4, 6, 8, 10, 12, 20)

  // Ladder naming (Fate systems)
  getLadderName?: (value: number) => string; // Convert modifier to descriptive ladder name

  // Success calculation
  success: {
    formula: string; // How to calculate success (for display)
    criticalThreshold?: number; // Optional: if roll >= this, it's a critical (or <= for roll-under)
    partialThreshold?: number; // Optional: threshold for partial success (PbtA systems)
    styleThreshold?: number; // Optional: margin for success with style (Fate systems)
  };

  // DC (Difficulty Class) guidelines
  dc: {
    trivial: number;
    easy: number;
    medium: number;
    hard: number;
    veryHard: number;
    impossible: number;
    description: string; // Human-readable DC explanation
  };

  // Resource system scaling
  resources: {
    requiredDivisor: number; // DC ÷ this = required amount
    penaltyDivisor: number; // DC ÷ this = dice penalty
    recoverDivisor: number; // DC ÷ this = recovery amount
    lossDivisor: number; // DC ÷ this = loss amount
    minRequired: number; // Minimum resource requirement
    minPenalty: number; // Minimum penalty
    minRecover: number; // Minimum recovery
    minLoss: number; // Minimum loss
  };

  // Upgrade system scaling
  upgrades: {
    statUpgradeAmount: number; // How much to increase stat by per upgrade
    resourceUpgradeAmount: number; // How much to increase resource max by per upgrade
    shopStatStartingValue: number; // Default starting value for new stats from shop
  };

  // AI Prompt instructions specific to this system
  aiInstructions: {
    diceSystem: string; // Explanation of the dice mechanic
    dcGuidance: string; // How to set appropriate DCs
    challengeGuidance: string; // When to use different difficulty levels
    choiceSyntax: string; // How to format choices for this system
    dcGuidelines: string; // Detailed DC usage guidelines
  };

  // Condition/Affliction penalties by tier (1-6)
  // Tier 6 typically means auto-fail or game-over potential
  // String values represent special effects (auto-fail, game-over, die-size-down, etc.)
  // null means no mechanical effect (e.g., narrative system)
  conditionPenalties: {
    tier1: number | string | null; // Minor inconvenience
    tier2: number | string | null; // Noticeable hindrance
    tier3: number | string | null; // Serious impediment
    tier4: number | string | null; // Severe disability
    tier5: number | string | null; // Critical condition
    tier6: number | string | null; // Permanent/fatal
  };
}

/**
 * 3d6 System - Original bell-curve system
 * Rolls 3 six-sided dice (3-18), providing a bell curve distribution
 * Most rolls will be near 10-11 (average), with extremes being rare
 */
export const SYSTEM_3D6: RPGSystem = {
  id: "3d6",
  name: "3d6 (Bell Curve)",
  description:
    "Roll 3 six-sided dice for a balanced, predictable system with bell-curve distribution",

  dice: {
    count: 3,
    sides: 6,
    min: 3,
    max: 18,
  },

  // Stat scaling: 0-100 stat → 0-18 modifier (stat * 0.18)
  statToModifier: (stat: number) => Math.floor(stat * 0.18),

  success: {
    formula: "3d6 + Stat ≥ DC",
    criticalThreshold: 18, // Rolling triple 6s
  },

  dc: {
    trivial: 8, // 3 + 50 stat = 53 vs DC 8
    easy: 15, // 10 + 50 stat = 60 vs DC 15
    medium: 20, // Average roll (10) needs decent stat
    hard: 25, // Needs high roll or excellent stat
    veryHard: 30, // Needs excellent roll AND high stat
    impossible: 35, // Requires maximum roll (18) + very high stat
    description:
      "DC 8 = trivial, DC 15 = easy, DC 20 = medium, DC 25 = hard, DC 30+ = very hard",
  },

  resources: {
    requiredDivisor: 2, // DC 20 requires 10 resource
    penaltyDivisor: 2, // DC 20 shortage = -10 to roll
    recoverDivisor: 4, // DC 20 success recovers 5
    lossDivisor: 2, // DC 20 failure loses 10
    minRequired: 3,
    minPenalty: 3,
    minRecover: 1,
    minLoss: 3,
  },

  upgrades: {
    statUpgradeAmount: 1, // +1 per upgrade (small but significant on 3-18 scale)
    resourceUpgradeAmount: 5, // +5 per upgrade
    shopStatStartingValue: 8, // New stats start at 8 (below average)
  },

  aiInstructions: {
    diceSystem:
      "The game uses a 3d6 system (rolls 3 six-sided dice, result is 3-18). Average roll is 10-11, creating a bell curve where extreme values are rare. This makes outcomes more predictable than 1d20.",
    dcGuidance:
      "Use TIER NAMES for difficulty (trivial, easy, average, hard, very_hard, impossible). The system automatically converts these to appropriate numbers based on adventure difficulty. Example: use_skill: Stealth (hard)",
    challengeGuidance:
      "⚠️ IMPORTANT: Challenge the player! Use 'hard' or 'very_hard' for dramatic moments, 'average' for standard challenges. Only use 'trivial' or 'easy' for narrative flavor checks. The 3d6 system creates consistent results, so higher difficulty is needed for real challenge.",
    choiceSyntax:
      "- ...Prose <use_skill: skill name (tier) or none; use_resource: resource name or none; use_item: item name or none; agmt_check: question (likelihood) or none; agmt_table: category or none; custom_table: table name or none>\n\nDC TIERS (use these instead of numbers):\n- trivial: Routine task, almost automatic\n- easy: Simple challenge, most succeed\n- average: Standard difficulty, 50/50 chance\n- hard: Significant challenge, skill required\n- very_hard: Extreme difficulty, only skilled succeed\n- impossible: Near-impossible, requires exceptional luck\n\nExample:\n- You carefully sneak past the sleeping dragon. <use_skill: Stealth (hard); use_resource: Stamina; use_item: none; agmt_check: Is the dragon asleep? (Likely); agmt_table: sounds; custom_table: none>\n- You approach the mysterious door. <use_skill: none; use_resource: none; use_item: none; agmt_check: Is it locked? (50/50); agmt_table: none; custom_table: none>",
    dcGuidelines:
      "⚠️ DC TIER GUIDELINES:\n- trivial: Auto-success for skilled, minor obstacle\n- easy: Basic competence needed\n- average: Real challenge for average characters\n- hard: Only skilled characters succeed reliably\n- very_hard: Even experts may fail\n- impossible: Legendary difficulty, dramatic moments only",
  },

  conditionPenalties: {
    tier1: -1,
    tier2: -2,
    tier3: -3,
    tier4: -4,
    tier5: -5,
    tier6: "auto-fail",
  },
};

/**
 * 1d20 System - D&D-style flat distribution
 * Rolls 1 twenty-sided die (1-20), providing completely flat distribution
 * Every number 1-20 has equal probability, making outcomes more swingy/unpredictable
 */
export const SYSTEM_1D20: RPGSystem = {
  id: "1d20",
  name: "1d20 (D&D Style)",
  description:
    "Roll 1 twenty-sided die for high variance, dramatic swings, and iconic D&D-style gameplay",

  dice: {
    count: 1,
    sides: 20,
    min: 1,
    max: 20,
  },

  // Stat scaling: 0-100 stat → 0-20 modifier (stat * 0.20)
  statToModifier: (stat: number) => Math.floor(stat * 0.2),

  success: {
    formula: "1d20 + Stat ≥ DC",
    criticalThreshold: 20, // Natural 20
  },

  dc: {
    trivial: 5, // 10 + 50 stat = 60 vs DC 5
    easy: 10, // Average roll (10.5) + decent stat
    medium: 15, // Needs good roll or high stat
    hard: 20, // Needs high roll AND decent stat
    veryHard: 25, // Needs excellent roll or amazing stat
    impossible: 30, // Requires max roll (20) + high stat
    description:
      "DC 5 = trivial, DC 10 = easy, DC 15 = medium, DC 20 = hard, DC 25+ = very hard",
  },

  resources: {
    requiredDivisor: 3, // DC 15 requires 5 resource
    penaltyDivisor: 3, // DC 15 shortage = -5 to roll
    recoverDivisor: 5, // DC 15 success recovers 3
    lossDivisor: 3, // DC 15 failure loses 5
    minRequired: 2,
    minPenalty: 2,
    minRecover: 1,
    minLoss: 2,
  },

  upgrades: {
    statUpgradeAmount: 1, // +1 stat point per upgrade
    resourceUpgradeAmount: 10, // +10 per upgrade
    shopStatStartingValue: 30, // New stats start at 30 (below average)
  },

  aiInstructions: {
    diceSystem:
      "The game uses a 1d20 system (rolls 1 twenty-sided die, result is 1-20). Every number has equal probability (5% each), creating high variance and dramatic swings - you might roll a 1 or 20 at any time!",
    dcGuidance:
      "Use TIER NAMES for difficulty (trivial, easy, average, hard, very_hard, impossible). The system automatically converts these to appropriate numbers based on adventure difficulty. Example: use_skill: Stealth (hard)",
    challengeGuidance:
      "⚠️ IMPORTANT: Challenge the player! Use 'hard' or 'very_hard' for dramatic moments, 'average' for standard challenges. The 1d20 system is swingy - even with low stats, extreme rolls can change outcomes.",
    choiceSyntax:
      "- ...Prose <use_skill: skill name (tier) or none; use_resource: resource name or none; use_item: item name or none; agmt_check: question (likelihood) or none; agmt_table: category or none; custom_table: table name or none>\n\nDC TIERS (use these instead of numbers):\n- trivial: Routine task, almost automatic\n- easy: Simple challenge, most succeed\n- average: Standard difficulty, 50/50 chance\n- hard: Significant challenge, skill required\n- very_hard: Extreme difficulty, only skilled succeed\n- impossible: Near-impossible, requires exceptional luck\n\nExample:\n- You carefully sneak past the sleeping dragon. <use_skill: Stealth (hard); use_resource: Stamina; use_item: none; agmt_check: Is the dragon asleep? (Likely); agmt_table: sounds; custom_table: none>",
    dcGuidelines:
      "⚠️ DC TIER GUIDELINES:\n- trivial: Auto-success for skilled, minor obstacle\n- easy: Basic competence needed\n- average: Real challenge for average characters\n- hard: Only skilled characters succeed reliably\n- very_hard: Even experts may fail\n- impossible: Legendary difficulty, dramatic moments only",
  },

  conditionPenalties: {
    tier1: -2,
    tier2: -4,
    tier3: -6,
    tier4: -8,
    tier5: -10,
    tier6: "auto-fail",
  },
};

/**
 * 1d100 System - Classic percentile system
 * Rolls 1 hundred-sided die (1-100), providing granular flat distribution
 * Every number 1-100 has equal probability, offering the most precise control
 */
export const SYSTEM_1D100: RPGSystem = {
  id: "1d100",
  name: "1d100 (Percentile)",
  description:
    "Roll 1 hundred-sided die for maximum granularity and classic percentile-style gameplay",

  dice: {
    count: 1,
    sides: 100,
    min: 1,
    max: 100,
  },

  // Stat scaling: 0-100 stat → 0-100 modifier (1:1, no conversion needed)
  statToModifier: (stat: number) => stat,

  success: {
    formula: "1d100 + Stat ≥ DC",
    criticalThreshold: 100, // Natural 100
  },

  dc: {
    trivial: 30, // 50 + 50 stat = 100 vs DC 30
    easy: 60, // Average roll (50.5) + decent stat
    medium: 80, // Needs good roll or high stat
    hard: 100, // Needs high roll AND decent stat
    veryHard: 120, // Needs excellent roll or amazing stat
    impossible: 140, // Requires max roll (100) + high stat
    description:
      "DC 30 = trivial, DC 60 = easy, DC 80 = medium, DC 100 = hard, DC 120+ = very hard",
  },

  resources: {
    requiredDivisor: 10, // DC 100 requires 10 resource
    penaltyDivisor: 10, // DC 100 shortage = -10 to roll
    recoverDivisor: 20, // DC 100 success recovers 5
    lossDivisor: 10, // DC 100 failure loses 10
    minRequired: 5,
    minPenalty: 5,
    minRecover: 1,
    minLoss: 5,
  },

  upgrades: {
    statUpgradeAmount: 1, // +1 stat point per upgrade
    resourceUpgradeAmount: 10, // +10 per upgrade
    shopStatStartingValue: 40, // New stats start at 40 (below average)
  },

  aiInstructions: {
    diceSystem:
      "The game uses a 1d100 system (rolls 1 hundred-sided die, result is 1-100). Every number has equal probability (1% each), providing maximum granularity for precise difficulty tuning.",
    dcGuidance:
      "Use TIER NAMES for difficulty (trivial, easy, average, hard, very_hard, impossible). The system automatically converts these to appropriate numbers based on adventure difficulty. Example: use_skill: Stealth (hard)",
    challengeGuidance:
      "⚠️ IMPORTANT: Challenge the player! Use 'hard' or 'very_hard' for dramatic moments, 'average' for standard challenges. The 1d100 system offers granular control - difficulty is automatically scaled appropriately.",
    choiceSyntax:
      "- ...Prose <use_skill: skill name (tier) or none; use_resource: resource name or none; use_item: item name or none; agmt_check: question (likelihood) or none; agmt_table: category or none; custom_table: table name or none>\n\nDC TIERS (use these instead of numbers):\n- trivial: Routine task, almost automatic\n- easy: Simple challenge, most succeed\n- average: Standard difficulty, 50/50 chance\n- hard: Significant challenge, skill required\n- very_hard: Extreme difficulty, only skilled succeed\n- impossible: Near-impossible, requires exceptional luck\n\nExample:\n- You carefully sneak past the sleeping dragon. <use_skill: Stealth (hard); use_resource: Stamina; use_item: none; agmt_check: Is the dragon asleep? (Likely); agmt_table: sounds; custom_table: none>",
    dcGuidelines:
      "⚠️ DC TIER GUIDELINES:\n- trivial: Auto-success for skilled, minor obstacle\n- easy: Basic competence needed\n- average: Real challenge for average characters\n- hard: Only skilled characters succeed reliably\n- very_hard: Even experts may fail\n- impossible: Legendary difficulty, dramatic moments only",
  },

  conditionPenalties: {
    tier1: -10,
    tier2: -20,
    tier3: -30,
    tier4: -40,
    tier5: -50,
    tier6: "auto-fail",
  },
};

/**
 * Classic Percentile System - Roll-under mechanics
 * Rolls 1d100 and tries to roll BELOW the stat value (no DC)
 * Lower rolls are better! Critical success on 1-5, critical failure on 96-100
 */
export const SYSTEM_PERCENTILE: RPGSystem = {
  id: "percentile",
  name: "Classic Percentile",
  description:
    "Roll 1d100 and try to roll under your stat value. Lower is better!",

  rollUnder: true,

  dice: {
    count: 1,
    sides: 100,
    min: 1,
    max: 100,
  },

  // Stat scaling: 0-100 stat → effective stat (1:1, but penalties reduce it)
  statToModifier: (stat: number) => stat,

  success: {
    formula: "1d100 ≤ Stat",
    criticalThreshold: 5, // Roll 1-5 for critical success
  },

  dc: {
    trivial: 0, // Not used - roll under stat
    easy: 0,
    medium: 0,
    hard: 0,
    veryHard: 0,
    impossible: 0,
    description:
      "Roll under your stat value to succeed. No DC - difficulty comes from stat values.",
  },

  resources: {
    requiredDivisor: 20, // Stat 100 requires 5 resource
    penaltyDivisor: 10, // Stat 100 shortage = -10 to effective stat
    recoverDivisor: 10, // Stat 100 success recovers 10
    lossDivisor: 10, // Stat 100 failure loses 10
    minRequired: 3,
    minPenalty: 5,
    minRecover: 2,
    minLoss: 5,
  },

  upgrades: {
    statUpgradeAmount: 1, // +1 stat point per upgrade
    resourceUpgradeAmount: 10, // +10 per upgrade
    shopStatStartingValue: 40, // New stats start at 40 (40% success rate)
  },

  aiInstructions: {
    diceSystem:
      "The game uses a ROLL-UNDER d100 system. Player rolls 1d100 and tries to roll EQUAL TO OR BELOW their stat value. Lower rolls are better! Critical success on 1-5, critical failure on 96-100.",
    dcGuidance:
      "⚠️ DO NOT SET DC VALUES! This is a roll-under system. Success = Roll ≤ Stat Value. The challenge comes from the stat itself. If a character has 70 in a skill, they need to roll 70 or below on d100 to succeed (70% chance).",
    challengeGuidance:
      "Challenge comes from stat values, not DCs. Use /modify_stat commands to adjust difficulty. Higher stats = easier tasks. For resource-based challenges, use /modify_resource instead. Never mention DC in narrative - say 'roll against your [Stat]' instead.",
    choiceSyntax:
      "- ...Prose <use_skill: skill name or none; use_resource: resource name or none; use_item: item name or none; agmt_check: question (likelihood) or none; agmt_table: category or none; custom_table: table name or none>\nPercentile Roll-Under System - No DC needed! Success = roll ≤ stat value:\nExample:\n- You carefully sneak past the sleeping dragon. <use_skill: Stealth; use_resource: none; use_item: none; agmt_check: Is the dragon asleep? (Likely); agmt_table: sounds; custom_table: none>\n- You approach the mysterious door. <use_skill: none; use_resource: none; use_item: none; agmt_check: Is it locked? (50/50); agmt_table: none; custom_table: none>",
    dcGuidelines:
      "⚠️ ROLL-UNDER SYSTEM - NO DC NEEDED:\n- DO NOT specify DC values! The system compares roll directly to stat.\n- Success is automatic if roll ≤ stat value.\n- Challenge comes from stat requirements (need high stats to succeed at difficult tasks).\n- Use resources and items to create additional challenge, not DCs.",
  },

  conditionPenalties: {
    tier1: -10,
    tier2: -20,
    tier3: -30,
    tier4: -40,
    tier5: -50,
    tier6: "auto-fail",
  },
};

/**
 * PbtA System - Powered by the Apocalypse
 * Rolls 2d6 + modifier (2-12), with partial success system
 * Three outcomes: 10+ = success, 7-9 = partial success, 6- = failure
 */
export const SYSTEM_PBTA: RPGSystem = {
  id: "pbta",
  name: "Powered by the Apocalypse",
  description:
    "Roll 2d6+modifier for narrative-driven gameplay with partial success (10+ success, 7-9 partial, 6- failure)",

  hasPartialSuccess: true,

  dice: {
    count: 2,
    sides: 6,
    min: 2,
    max: 12,
  },

  // Stat scaling: 0-100 stat → -2 to +3 modifier (PbtA standard range)
  // 0-20 = -2, 21-40 = -1, 41-60 = 0, 61-80 = +1, 81-100 = +2, 100+ = +3
  statToModifier: (stat: number) => {
    if (stat <= 20) return -2;
    if (stat <= 40) return -1;
    if (stat <= 60) return 0;
    if (stat <= 80) return 1;
    if (stat <= 100) return 2;
    return 3; // 100+ for exceptional cases
  },

  success: {
    formula: "2d6 + Modifier",
    criticalThreshold: 12, // Rolling double 6s
    partialThreshold: 7, // 7-9 = partial success
  },

  dc: {
    trivial: 6, // Below partial threshold
    easy: 7, // Partial threshold
    medium: 10, // Success threshold
    hard: 10, // Same as medium (difficulty comes from complications)
    veryHard: 10, // Same (PbtA doesn't scale DCs, outcomes vary)
    impossible: 13, // Above max roll+mod
    description:
      "PbtA doesn't use variable DCs. 10+ = success, 7-9 = partial success with complication, 6- = failure",
  },

  resources: {
    requiredDivisor: 0, // No resource requirements by default (more PbtA-like)
    penaltyDivisor: 1, // Missing resources = -1 penalty (simplified)
    recoverDivisor: 0, // No automatic recovery
    lossDivisor: 0, // Loss handled narratively
    minRequired: 0,
    minPenalty: 1, // Always -1 if resources missing
    minRecover: 0,
    minLoss: 0,
  },

  upgrades: {
    statUpgradeAmount: 1, // +1 stat point per upgrade
    resourceUpgradeAmount: 5,
    shopStatStartingValue: 50, // 50 = 0 modifier (neutral)
  },

  aiInstructions: {
    diceSystem:
      "The game uses Powered by the Apocalypse (PbtA) 2d6 system. Player rolls 2d6 (2-12) and adds a modifier (-2 to +3) derived from their 0-100 stat. Critical success on 12 (double 6s).",
    dcGuidance:
      "⚠️ DO NOT SET VARIABLE DC VALUES! PbtA uses FIXED thresholds: 10+ = Full Success, 7-9 = Partial Success, 6- = Failure. Never change these numbers. The challenge comes from the outcomes, not the DC.",
    challengeGuidance: `PbtA THREE-OUTCOME SYSTEM:

**10+ FULL SUCCESS**: Player achieves their goal cleanly and completely. No complications, costs, or negative consequences. Describe what they wanted to accomplish happening successfully.

**7-9 PARTIAL SUCCESS** (MOST IMPORTANT): Player succeeds BUT you MUST add ONE of these:
  • Success with a cost (lose resource, take damage, equipment breaks, spend momentum)
  • Success with a complication (alert enemies, leave evidence, create new problem, time pressure)
  • Hard choice between two outcomes (save ally OR complete objective, sneak past OR speed, full effect OR quiet)
  • Lesser effect (break door loudly instead of quietly, intimidate but make enemy, persuade but owe favor)
  
  NEVER give full success on 7-9! Always include a drawback, complication, or hard choice.

**6- FAILURE**: Player fails AND you make a hard move:
  • Their action backfires or makes things worse
  • Introduce immediate danger or complication  
  • Reveal an unwelcome truth
  • Deal damage (physical, resource, relationship)
  • Advance a threat or countdown
  
RESOURCES: Only required when narratively appropriate. Missing resources gives -1 penalty, not automatic failure.

MOMENTUM: When player spends momentum, add +1 to their roll (can turn partial into success).

DIFFICULTY: Don't vary the DC. Instead:
  • Make consequences more severe for dangerous actions
  • Make partial success complications harsher for difficult tasks
  • Require advantage (roll 3d6 drop lowest) for desperate acts

EXAMPLES:
"Roll Charm to persuade the guard (Charm: 65 = +1)"
  • 11: "The guard is convinced and lets you pass without question."
  • 8: "The guard agrees, but demands you owe him a favor later."
  • 5: "The guard refuses and calls for backup - you hear footsteps approaching!"`,
    choiceSyntax:
      "- ...Prose <use_skill: skill name or none; use_resource: resource name or none; use_item: item name or none; agmt_check: question (likelihood) or none; agmt_table: category or none; custom_table: table name or none>\\nPbtA System - No DC needed! Results are: 10+ = success, 7-9 = partial success, 6- = failure:\\nExample:\\n- You carefully sneak past the sleeping dragon. <use_skill: Stealth; use_resource: none; use_item: none; agmt_check: Is the dragon asleep? (Likely); agmt_table: sounds; custom_table: none>\\n- You try to charm the guard. <use_skill: Charisma; use_resource: none; use_item: Fancy Clothes; agmt_check: Is he in a good mood? (50/50); agmt_table: none; custom_table: none>",
    dcGuidelines:
      "⚠️ POWERED BY THE APOCALYPSE - NO DC NEEDED:\\n- DO NOT specify DC values for PbtA! The system has fixed thresholds: 10+ success, 7-9 partial, 6- failure.\\n- Just specify which skill to use - the roll is 2d6 + stat modifier.\\n- Focus on making partial success (7-9) interesting with complications, costs, or hard choices.\\n- Failures (6-) should advance the story with consequences, not just block progress.",
  },

  conditionPenalties: {
    tier1: -1,
    tier2: -2,
    tier3: -3,
    tier4: "auto-fail", // PbtA: at tier 4, you auto-miss
    tier5: "auto-fail",
    tier6: "game-over",
  },
};

/**
 * Fate Core System - 4dF (Fudge Dice)
 * Rolls 4 dice showing [-1, 0, +1] each, adds ladder modifier
 * Four outcomes: fail, tie, succeed, succeed with style (+3 over)
 */
export const SYSTEM_FATE: RPGSystem = {
  id: "fate",
  name: "Fate Core",
  description:
    "Roll 4dF (Fudge dice: -1/0/+1) + ladder modifier for cinematic gameplay (fail/tie/succeed/style)",

  hasSuccessWithStyle: true,

  dice: {
    count: 4,
    sides: 3, // Represented as 3 states: -1, 0, +1
    min: -4, // Four -1s
    max: 4, // Four +1s
  },

  // Stat scaling: 0-100 stat → -2 to +7 ladder modifier
  // Fate Ladder: Terrible(-2), Poor(-1), Mediocre(0), Average(+1), Fair(+2), Good(+3), Great(+4), Superb(+5), Fantastic(+6), Epic(+7)
  statToModifier: (stat: number) => {
    if (stat <= 10) return -2; // Terrible
    if (stat <= 20) return -1; // Poor
    if (stat <= 30) return 0; // Mediocre
    if (stat <= 40) return 1; // Average
    if (stat <= 50) return 2; // Fair
    if (stat <= 60) return 3; // Good
    if (stat <= 70) return 4; // Great
    if (stat <= 80) return 5; // Superb
    if (stat <= 90) return 6; // Fantastic
    return 7; // Epic (90+)
  },

  // Convert ladder value to descriptive name
  getLadderName: (value: number) => {
    if (value <= -2) return "Terrible";
    if (value === -1) return "Poor";
    if (value === 0) return "Mediocre";
    if (value === 1) return "Average";
    if (value === 2) return "Fair";
    if (value === 3) return "Good";
    if (value === 4) return "Great";
    if (value === 5) return "Superb";
    if (value === 6) return "Fantastic";
    if (value >= 7) return "Epic";
    return "Mediocre";
  },

  success: {
    formula: "4dF + Ladder",
    criticalThreshold: 4, // Rolling four +1s
    styleThreshold: 3, // Succeed by 3+ = Success with Style
  },

  dc: {
    trivial: -1, // Below Mediocre
    easy: 0, // Mediocre
    medium: 2, // Fair
    hard: 4, // Great
    veryHard: 6, // Fantastic
    impossible: 8, // Beyond Epic
    description:
      "Fate uses ladder-based opposition. Fair (2) is typical difficulty, Great (4) is challenging, Fantastic (6) is extraordinary",
  },

  resources: {
    requiredDivisor: 0, // Resources handled via aspects/fate points
    penaltyDivisor: 1, // Missing resources = -1 shift
    recoverDivisor: 0, // Recovery handled narratively
    lossDivisor: 0, // Stress/consequences instead of resource loss
    minRequired: 0,
    minPenalty: 1, // -1 shift if under-resourced
    minRecover: 0,
    minLoss: 0,
  },

  upgrades: {
    statUpgradeAmount: 1, // +1 stat point per upgrade
    resourceUpgradeAmount: 3, // Fate Points are precious
    shopStatStartingValue: 35, // 35 = Average (+1) ladder
  },

  aiInstructions: {
    diceSystem:
      "The game uses Fate Core 4dF system. Player rolls 4 Fudge dice (each showing -1, 0, or +1) and adds their ladder modifier (-2 to +7). Result compared to opposition on The Ladder (Mediocre, Average, Fair, Good, Great, Superb, Fantastic, Epic). Critical on four +1s.",
    dcGuidance: `SET OPPOSITION USING THE LADDER:
      
Terrible (-2): Laughably easy, no real challenge
Poor (-1): Very easy, almost automatic
Mediocre (0): Easy, baseline competence
Average (+1): Routine task with some effort
Fair (+2): TYPICAL CHALLENGE for skilled individuals
Good (+3): Challenging but achievable
Great (+4): DIFFICULT, requires skill and luck
Superb (+5): Very difficult, exceptional effort needed
Fantastic (+6): EXTRAORDINARY, near-impossible
Epic (+7+): Legendary, agmt difficulty

Use Fair (2) as your DEFAULT. Use Great (4) for serious challenges. Use Fantastic (6) for climactic moments.

⚠️ WHEN TO CALL FOR ROLLS:
Call for rolls when outcomes are UNCERTAIN and CONSEQUENTIAL:
• Physical actions with real risk: climbing, fighting, sneaking, chasing
• Social pressure points: persuading authorities, lying under scrutiny, intimidating enemies
• Mental challenges: solving puzzles, resisting manipulation, noticing hidden details
• Any moment where failure would create interesting complications

DON'T call for rolls when:
• Outcome is certain (trivial tasks, overwhelming advantage)
• Success/failure doesn't matter to the story
• It would slow down the narrative momentum

ACTIVE OPPOSITION: When facing NPCs, their skill level = opposition (guards with Good (+3) Awareness, noble with Superb (+5) Will, etc.)`,
    challengeGuidance: `Fate FOUR-OUTCOME SYSTEM (based on margin):

**FAIL** (Roll < Opposition): Player fails to achieve goal.
  • Describe failure with narrative consequence
  • Advance threat, introduce complication
  • Offer minor success with major cost (if appropriate)
  • Use /deal_damage for stress/consequences
  • Can spend Fate Point to reroll (if player has resource)

**TIE** (Roll = Opposition): Neither side wins cleanly.
  • Success at cost: achieve goal but pay price (lose resource, take stress, create complication)
  • Partial success: achieve lesser effect or introduce complication
  • "Yes, but..." outcomes
  • Player can spend Fate Point for full success (if they have resource)

**SUCCESS** (Roll > Opposition by 1-2): Player achieves goal clearly.
  • Clean success without complications
  • Describe accomplishment vividly
  • Achieve stated intent fully
  • May gain minor bonus (reveal aspect, gain advantage)

**SUCCESS WITH STYLE** (Roll exceeds Opposition by 3+): Overwhelming victory!
  • MANDATORY BONUS: Player must get one of:
    - Automatic boost/advantage for next action (like momentum)
    - Extra effect beyond intent (break weapon AND disarm, intimidate ALL guards)
    - Reduce incoming harm (negate stress/consequence)
    - Discover useful aspect/information
  • Describe spectacular, memorable success
  • Never just "you succeed really well" - always include tangible bonus

ASPECTS (Inventory Items):
  • Can invoke aspect for +2 bonus (costs 1 Fate Point from resource)
  • Compels create complications for 1 Fate Point reward
  • Always mention relevant aspects in checks

FATE POINTS (Special Resource):
  • Spend to: invoke aspect (+2), reroll dice, refuse compel
  • Earn by: accepting compel, conceding conflict, style success
  • Starting pool usually 3-5

STRESS & CONSEQUENCES (HP System):
  • Physical/Mental stress boxes (1-4 levels)
  • Consequences: Mild(2), Moderate(4), Severe(6), Extreme(8)
  • Use /deal_damage but frame as stress/consequences
  • Taken out = defeated, not dead

MOMENTUM: Treat as free invoke (add +2 to roll)

EXAMPLES:
"Roll Athletics (+3) to leap the chasm (Opposition: Fair +2)"
  • Total 6: "SUCCESS WITH STYLE! You soar across gracefully AND grab the rope, swinging to kick the guard off the far side!"
  • Total 3: "SUCCESS! You land safely on the far side, ready for action."
  • Total 2: "TIE! You make it across but stumble - lose 1 Physical Stress from the hard landing."
  • Total 0: "FAIL! You miss the far side. Spend Fate Point to catch the edge, or take Moderate Consequence 'Dangling Desperately'."

Remember: Success with Style MUST include a meaningful bonus, not just flavor. Ties MUST have a cost or complication. Use The Ladder names in narration ("That's a Great result!").

⚠️ CREATING DRAMATIC TENSION:
Fate thrives on contested actions and uncertain outcomes. Structure scenes around:
• OBSTACLES: Physical barriers (locked doors, chasms, guards) require rolls to overcome
• CONFLICTS: Social/physical confrontations (arguments, fights, chases) need active opposition
• CHALLENGES: Multi-step problems (investigations, heists, journeys) broken into skill checks
• DISCOVERIES: Finding clues, spotting danger, reading people - all opportunities for rolls

When players take ACTION, convert it to a roll. When they declare INTENT, ask which skill and set opposition. Keep the dice moving to maintain energy and stakes.`,
    choiceSyntax:
      "- ...Prose <use_skill: skill name (DC Number) or none; use_resource: resource name or none; use_item: item name or none; agmt_check: question (likelihood) or none; agmt_table: category or none; custom_table: table name or none>\\nFate Core System - Present meaningful obstacles and opposition that require rolls. DC is the ladder level (use Fair +2 as default, Great +4 for serious challenges):\\nExample:\\n- You carefully sneak past the alert guards (Awareness: Great +4). <use_skill: Stealth (DC 4); use_resource: none; use_item: none; agmt_check: none; agmt_table: sounds; custom_table: none>\\n- You try to convince the skeptical merchant (Will: Good +3). <use_skill: Rapport (DC 3); use_resource: none; use_item: none; agmt_check: Is he desperate? (Unlikely); agmt_table: none; custom_table: none>\\n- You scale the treacherous cliff face. <use_skill: Athletics (DC 4); use_resource: Stamina; use_item: Climbing Gear; agmt_check: none; agmt_table: terrain; custom_table: none>",
    dcGuidelines:
      "⚠️ FATE CORE DC GUIDELINES:\\n- DC is the opposition level on the Fate ladder. Set opposition for every meaningful action with uncertain outcome.\\n- Active Opposition: When facing NPCs, use their relevant skill as DC (guard's Awareness, noble's Will, etc.)\\n- Passive Opposition: For environmental challenges, set ladder level based on difficulty\\n  * DC 0-1: Average/Fair (routine skilled work, minor obstacles)\\n  * DC 2-3: Good/Great (serious challenges, trained opposition)\\n  * DC 4-5: Superb/Fantastic (impressive feats, expert opposition)\\n  * DC 6+: Epic/Legendary (near-impossible, legendary opposition)\\n- Success with style (beat DC by 3+) grants boosts or extra benefits. Describe them vividly!\\n- Ties are partial successes - success at a cost. Make the cost meaningful.\\n- Present obstacles, opposition, and challenges that naturally require rolls to resolve.",
  },

  conditionPenalties: {
    tier1: -1,
    tier2: -2,
    tier3: -3,
    tier4: -4,
    tier5: "auto-fail", // Fate: Taken Out
    tier6: "game-over",
  },
};

/**
 * Year Zero Engine (YZE) System - Stress Dice
 * Variable d6 pool, count 6s as successes, stress dice add power + panic risk
 * Based on Free League's Year Zero Engine (Alien RPG, Blade Runner, etc.)
 */
export const SYSTEM_YZE: RPGSystem = {
  id: "yze",
  name: "Year Zero Engine",
  description:
    "Roll d6 pool (count 6s), add stress dice for power but risk panic on 1s",

  hasStressDice: true,
  hasPushMechanic: true,
  stressDiceMax: 5,

  dice: {
    count: 0, // Variable based on stat
    sides: 6,
    min: 0, // Can roll 0 dice if stat is very low
    max: 30, // Theoretical max with stress dice
  },

  // Stat scaling: 0-100 stat → 0-5 base dice
  statToModifier: (stat: number) => Math.floor(stat / 20),

  success: {
    formula: "Count 6s (need 1+ success)",
    criticalThreshold: 6, // Rolling multiple 6s
    styleThreshold: 3, // 3+ successes beyond requirement = stress relief
  },

  // 20-Entry Panic Table (roll d6 + current stress)
  panicTable: [
    {
      min: 1,
      max: 6,
      effect: "Keeping It Together",
      description:
        "You manage to keep your cool, but only just. You are Shaken: -1 to all rolls until you rest.",
    },
    {
      min: 7,
      max: 7,
      effect: "Nervous Twitch",
      description:
        "You can't stop shaking. Drop whatever you're holding. If in combat, you also lose your next action.",
    },
    {
      min: 8,
      max: 8,
      effect: "Tremble",
      description:
        "Your hands won't stop shaking. -2 to all rolls requiring manual dexterity until you rest.",
    },
    {
      min: 9,
      max: 9,
      effect: "Drop Item",
      description:
        "You drop your weapon or important item in panic. It scatters d6 meters in a random direction.",
    },
    {
      min: 10,
      max: 10,
      effect: "Freeze",
      description:
        "You freeze up completely. You can't take any actions for one round. You can still defend yourself (dodge, parry).",
    },
    {
      min: 11,
      max: 11,
      effect: "Seek Cover",
      description:
        "You must immediately use your action to move away from danger and seek cover. You won't come out until the threat is gone or allies coax you out.",
    },
    {
      min: 12,
      max: 12,
      effect: "Scream",
      description:
        "You let out a terrified scream that lasts for one round. You can't take any other action. Everyone nearby knows your location.",
    },
    {
      min: 13,
      max: 13,
      effect: "Flee",
      description:
        "You must flee to a safe place and refuse to come back until the danger is clearly over. You won't listen to reason.",
    },
    {
      min: 14,
      max: 14,
      effect: "Berserk",
      description:
        "You attack the nearest person or creature, whether friend or foe, in a blind rage. You won't stop until they or you are Broken.",
    },
    {
      min: 15,
      max: 15,
      effect: "Catatonic",
      description:
        "You collapse into catatonia. You are helpless and can't move or communicate. Lasts until someone spends a full turn helping you snap out of it.",
    },
    {
      min: 16,
      max: 16,
      effect: "Uncontrollable Shaking",
      description:
        "Your entire body shakes uncontrollably. You drop everything and can't use or carry anything. Lasts d6 rounds.",
    },
    {
      min: 17,
      max: 17,
      effect: "Hallucinations",
      description:
        "You see things that aren't there. The GM decides what you see. You believe it completely. Lasts until you rest.",
    },
    {
      min: 18,
      max: 18,
      effect: "Heart Palpitations",
      description:
        "Your heart pounds in your chest. You take 1 damage and are -3 to all rolls until you rest. If you take more stress before resting, roll on this table again.",
    },
    {
      min: 19,
      max: 19,
      effect: "Breakdown",
      description:
        "You break down completely, crying and screaming incoherently. You are helpless and can take no actions for d6 rounds.",
    },
    {
      min: 20,
      max: 20,
      effect: "Heart Attack",
      description:
        "Your heart gives out from the stress. You immediately drop to 0 HP and must make a death save. Even if you survive, you're permanently weakened: -1 to all physical rolls.",
    },
    {
      min: 21,
      max: 21,
      effect: "Total Breakdown",
      description:
        "You suffer a complete mental breakdown. You're immediately incapacitated and must be evacuated. You can't continue the mission. Permanent trauma: -1 to all rolls in similar situations forever.",
    },
    {
      min: 22,
      max: 22,
      effect: "Suicidal",
      description:
        "You're so overwhelmed you want to end it all. You try to harm yourself or put yourself in mortal danger. Allies can stop you with a successful roll.",
    },
    {
      min: 23,
      max: 23,
      effect: "Homicidal Rage",
      description:
        "You completely lose it and attack everyone in sight with intent to kill. You won't stop until you're unconscious or everyone flees. Roll to attack each round.",
    },
    {
      min: 24,
      max: 24,
      effect: "Catatonic Fugue State",
      description:
        "You enter a fugue state and collapse. You're completely unresponsive. Only medical intervention or days of rest will bring you back. Campaign may be over for you.",
    },
    {
      min: 25,
      max: 30,
      effect: "Fatal Shock",
      description:
        "The stress is too much. Your brain shuts down and your heart stops. You die instantly. There's nothing anyone can do. Character is permanently dead.",
    },
  ],

  dc: {
    trivial: 1,
    easy: 1,
    medium: 2,
    hard: 3,
    veryHard: 4,
    impossible: 5,
    description:
      "Year Zero Engine uses success counting. Set difficulty as number of 6s needed (1-5+)",
  },

  resources: {
    requiredDivisor: 0, // No resource requirements
    penaltyDivisor: 0, // No dice penalties
    recoverDivisor: 0, // Stress relief is manual
    lossDivisor: 0,
    minRequired: 0,
    minPenalty: 0,
    minRecover: 0,
    minLoss: 0,
  },

  upgrades: {
    statUpgradeAmount: 1, // +1 stat point per upgrade
    resourceUpgradeAmount: 1, // Small increments for stress management
    shopStatStartingValue: 40, // 40 = 2 base dice
  },

  aiInstructions: {
    diceSystem:
      "The game uses Year Zero Engine (Stress System). Player rolls a pool of d6 dice (stat ÷ 20 = base dice). Each 6 rolled = 1 success. Need 1+ successes to pass. More successes = better outcome.",
    dcGuidance: `SET DIFFICULTY AS NUMBER OF SUCCESSES REQUIRED:

1 Success: Simple, routine tasks
2 Successes: Challenging, requires skill
3 Successes: Difficult, requires expertise
4 Successes: Very hard, near-professional level
5+ Successes: Nearly impossible, legendary

Don't use variable DCs - use success count. A character with 60 stat rolls 3 base dice.`,
    challengeGuidance: `Year Zero Engine STRESS MECHANICS:

**STRESS DICE**:
Players can add extra d6s (stress dice) before rolling:
- Each stress die = +1 stress to character (cap: 5 dice or 10-stress remaining)
- Stress dice count 6s as successes (increasing chance to pass)
- BUT: Rolling 1s on stress dice triggers PANIC (even if you succeed!)
- More stress dice = more power but more danger

**PANIC SYSTEM**:
When ANY stress die shows a 1, character panics:
- Roll 1d6 + current stress level on panic table
- Results range from nervous twitch (7) to fatal shock (25+)
- Higher stress = worse panic effects
- Panic happens even on successful rolls!
- Use /deal_damage and /modify_resource to apply panic effects

Common Panic Effects:
- 1-6: Shaken (-1 to rolls)
- 7-9: Drop item, tremble, freeze
- 10-13: Seek cover, scream, flee
- 14-16: Berserk, catatonic, uncontrollable shaking
- 17-20: Hallucinations, breakdown, heart attack
- 21+: Total breakdown, suicidal, homicidal, death

**PUSH MECHANIC**:
After a FAILED roll, player can PUSH (reroll once):
- Reroll all non-6 dice
- Take +1 stress automatically
- Risk breaking/consuming a random item (NOT story items)
- Use /modify_resource Stress +1
- Use /consume_item or /break_item for item loss

**STRESS MANAGEMENT**:
- Current stress: Check character's Stress resource (0-10)
- Stress relief on STRONG SUCCESS: If player gets 3+ successes beyond requirement, -1 stress
- Rest/downtime: -1 stress per rest
- Story moments: Comfort from allies, achieving goals
- Use /modify_resource Stress -1 for relief

**DIFFICULTY EXAMPLES**:
"Roll to hack the terminal (Hacking 60 = 3 base dice)"
- Need 2 successes (challenging)
- Player can add 0-5 stress dice for better odds
- If stress dice show 1s, panic even if hack succeeds

"Roll to shoot the alien (Combat 80 = 4 base dice)"
- Need 1 success (simple shot)
- Player adds 2 stress dice (6d6 total, +2 stress)
- Rolls: [6][3][2][6][1][4] = 2 successes (pass!) but 1 on stress die
- Success! But also: Roll panic (1d6+stress) → 8 = Tremble (-2 to manual dexterity)

**KEY PRINCIPLES**:
- Base pool = stat ÷ 20 (60 stat = 3 dice, 80 stat = 4 dice)
- Only 6s count as successes
- Stress dice are tempting power BUT panic is dangerous
- More stress = worse panic effects
- Managing stress vs pushing for success is core gameplay
- Describe stress building: sweating, shaking, racing heart, fear
- Panic creates drama: successful shot followed by dropping weapon, etc.

**ALWAYS OFFER STRESS DICE**:
Before each roll, remind player they can add stress dice:
"You can add up to [X] stress dice (currently at [Y]/10 stress). Each die adds +1 stress but increases success chance. Risk panic on 1s."

**PUSH OPPORTUNITY**:
After failed rolls (and only after fails):
"You can PUSH this roll: Reroll non-6s for +1 stress and risk breaking an item. Desperate times?"

Remember: Stress creates tension, panic creates drama, pushing creates desperation. This is survival horror gaming!`,
    choiceSyntax:
      "- ...Prose <use_skill: skill name (DC Number) or none; use_resource: resource name or none; use_item: item name or none; agmt_check: question (likelihood) or none; agmt_table: category or none; custom_table: table name or none>\\nYZE System - DC is the number of successes needed (count 6s on d6 pool):\\nExample:\\n- You carefully sneak past the sleeping dragon. <use_skill: Stealth (DC 2); use_resource: none; use_item: none; agmt_check: Is the dragon asleep? (Likely); agmt_table: sounds; custom_table: none>\\n- You pick the complex lock. <use_skill: Mechanics (DC 3); use_resource: none; use_item: Lockpicks; agmt_check: none; agmt_table: none; custom_table: none>",
    dcGuidelines:
      "⚠️ YEAR ZERO ENGINE DC GUIDELINES:\\n- DC is the NUMBER OF SUCCESSES NEEDED (count 6s on dice rolled).\\n- DC 1: Simple task, needs 1 success (most common)\\n- DC 2: Moderate challenge, needs 2 successes\\n- DC 3: Difficult task, needs 3 successes\\n- DC 4+: Extremely challenging, rarely use\\n- DO NOT use DC values like 20, 50, 80! Those are for other RPG systems.\\n- The dice pool size (0-5 base dice) comes from the character's stat value ÷ 20.\\n- Players can add stress dice (voluntary) to increase success chances but risk panic on 1s.",
  },

  conditionPenalties: {
    tier1: -1, // -1 die from pool
    tier2: -2, // -2 dice from pool
    tier3: -3, // -3 dice from pool
    tier4: -4, // -4 dice from pool
    tier5: "auto-fail", // 0 dice = auto-fail
    tier6: "game-over",
  },
};

/**
 * Exploding Dice System - Kids on Bikes / Cortex-style
 * Each stat determines die size (d4 to d20)
 * Roll that die vs DC, explode on max and add again (unlimited!)
 * Pure luck-based with potential for dramatic come-from-behind moments
 */
export const SYSTEM_EXPLOSIVE: RPGSystem = {
  id: "explosive",
  name: "Exploding Dice",
  description:
    "Roll die based on stat (d4-d20). Max rolls explode! Add another roll. Unlimited explosions for epic moments.",

  hasExplodingDice: true,

  dice: {
    count: 1, // Always roll 1 die
    sides: 20, // Max die size
    min: 1,
    max: 999, // Theoretical max with explosions
  },

  // Stat to die size conversion
  // 0-16 = d4, 17-33 = d6, 34-50 = d8, 51-66 = d10, 67-83 = d12, 84-100 = d20
  statToDieSize: (stat: number) => {
    if (stat <= 16) return 4;
    if (stat <= 33) return 6;
    if (stat <= 50) return 8;
    if (stat <= 66) return 10;
    if (stat <= 83) return 12;
    return 20; // 84-100
  },

  // No modifiers - just pure die rolls
  statToModifier: (stat: number) => 0,

  success: {
    formula: "Roll die (size based on stat) ≥ DC, explode on max",
    criticalThreshold: 20, // Max explosion on d20
  },

  dc: {
    trivial: 4, // d4 auto-succeeds
    easy: 8, // d6+ can hit easily
    medium: 12, // Needs d8+ or lucky explosion
    hard: 16, // Needs d12+ or good explosion
    veryHard: 20, // Needs d20 or multiple explosions
    impossible: 30, // Requires explosions
    description:
      "DC 8 = easy, DC 12 = medium, DC 16 = hard, DC 20 = very hard, DC 25+ = explosive luck needed",
  },

  resources: {
    requiredDivisor: 3, // DC 12 requires 4 resource
    penaltyDivisor: 0, // No dice penalties (die size is fixed)
    recoverDivisor: 4, // DC 12 success recovers 3
    lossDivisor: 3, // DC 12 failure loses 4
    minRequired: 2,
    minPenalty: 0,
    minRecover: 1,
    minLoss: 2,
  },

  upgrades: {
    statUpgradeAmount: 1, // +1 stat point per upgrade
    resourceUpgradeAmount: 5, // +5 per upgrade
    shopStatStartingValue: 25, // 25 = d6 (below average)
  },

  aiInstructions: {
    diceSystem:
      "The game uses an EXPLODING DICE system. Each stat (0-100) determines die size: 0-16=d4, 17-33=d6, 34-50=d8, 51-66=d10, 67-83=d12, 84-100=d20. Roll the die vs DC. When you roll the MAXIMUM (4 on d4, 20 on d20), the die EXPLODES - roll again and ADD it to the total! Explosions chain infinitely. A lucky d4 roller can beat a d20 through explosions!",
    dcGuidance:
      "Use TIER NAMES for difficulty (trivial, easy, average, hard, very_hard, impossible). The system automatically converts these to appropriate numbers. Example: use_skill: Stealth (hard). Remember: even a d4 can explode for heroic victories!",
    challengeGuidance:
      "⚠️ IMPORTANT: Challenge the player! Use 'hard' or 'very_hard' for dramatic moments. Remember: even a d4 can explode multiple times for heroic victories! Explosions are RARE but EXCITING - a d10 has only 10% chance to explode. This creates dramatic tension where the underdog can win through luck.",
    choiceSyntax:
      "- ...Prose <use_skill: skill name (tier) or none; use_resource: resource name or none; use_item: item name or none; agmt_check: question (likelihood) or none; agmt_table: category or none; custom_table: table name or none>\n\nDC TIERS (use these instead of numbers):\n- trivial: Routine task, almost automatic\n- easy: Simple challenge, most succeed\n- average: Standard difficulty, 50/50 chance\n- hard: Significant challenge, skill required\n- very_hard: Extreme difficulty, only skilled succeed\n- impossible: Near-impossible, requires explosive luck!\n\nExample:\n- You carefully sneak past the sleeping dragon. <use_skill: Stealth (hard); use_resource: Stamina; use_item: none; agmt_check: Is the dragon asleep? (Likely); agmt_table: sounds; custom_table: none>",
    dcGuidelines:
      "⚠️ EXPLODING DICE DC TIER GUIDELINES:\n- Die sizes: d4 (weak 0-16), d6 (below avg 17-33), d8 (average 34-50), d10 (good 51-66), d12 (great 67-83), d20 (exceptional 84-100)\n- trivial: Auto-success for d6+\n- easy: d8+ succeed reliably\n- average: d10+ needed or luck\n- hard: d12+ or explosions\n- very_hard: Needs d20 or multiple explosions\n- impossible: Requires explosive luck!\n- When narrating explosions, describe the excitement: 'Your die explodes! Roll again...'",
  },

  conditionPenalties: {
    tier1: -1, // -1 die size step (d8 → d6)
    tier2: -2, // -2 die size steps (d8 → d4)
    tier3: -3, // -3 die size steps
    tier4: -4, // d4 only
    tier5: "auto-fail",
    tier6: "game-over",
  },
};

/**
 * Narrative System - Pure storytelling, no dice
 * Focus entirely on collaborative storytelling without mechanical resolution
 * Perfect for character-driven drama, introspective scenes, or beginners
 */
export const SYSTEM_NARRATIVE: RPGSystem = {
  id: "narrative",
  name: "Narrative (No Dice)",
  description:
    "Pure collaborative storytelling with no dice rolls. Focus on character choices and dramatic narrative.",

  noDice: true,

  dice: {
    count: 0,
    sides: 0,
    min: 0,
    max: 0,
  },

  // Stats can still exist for character definition but don't affect rolls
  statToModifier: (stat: number) => 0,

  success: {
    formula: "No dice - outcomes determined by narrative logic",
  },

  dc: {
    trivial: 0,
    easy: 0,
    medium: 0,
    hard: 0,
    veryHard: 0,
    impossible: 0,
    description:
      "No difficulty classes - outcomes flow from character choices and story logic",
  },

  resources: {
    requiredDivisor: 0,
    penaltyDivisor: 0,
    recoverDivisor: 0,
    lossDivisor: 0,
    minRequired: 0,
    minPenalty: 0,
    minRecover: 0,
    minLoss: 0,
  },

  upgrades: {
    statUpgradeAmount: 1, // +1 stat point per upgrade
    resourceUpgradeAmount: 10,
    shopStatStartingValue: 50,
  },

  aiInstructions: {
    diceSystem:
      "This adventure uses a NARRATIVE system with NO DICE ROLLS. Do not include skill checks, DCs, or mechanical resolution. All outcomes are determined by character choices, dramatic logic, and collaborative storytelling.",
    dcGuidance:
      "⚠️ DO NOT USE DICE OR DCS! This is a pure narrative system. Never ask for rolls. Determine outcomes based on: character abilities, dramatic appropriateness, story momentum, and player choices.",
    challengeGuidance: `NARRATIVE SYSTEM - NO DICE ROLLS:

This system emphasizes **collaborative storytelling** over mechanical resolution.

**DETERMINING OUTCOMES:**
- Character competence: A skilled character succeeds at things within their expertise
- Dramatic logic: What makes the best story? Success, failure, or complication?
- Player agency: Honor bold choices with meaningful consequences
- Stakes: Low-stakes actions usually succeed; high-stakes moments create tension through consequences, not dice

**CREATING TENSION WITHOUT DICE:**
- Present dilemmas with no perfect answer
- Offer success at a cost
- Use time pressure and competing priorities
- Create moral complexity
- Let failure lead to interesting complications, not dead ends

**WHEN TO SUCCEED:**
- Action is within character's established competence
- Success creates interesting story developments
- Player made thoughtful, creative choices

**WHEN TO COMPLICATE:**
- Success would be too easy/boring
- Character is attempting something risky
- Drama calls for tension
- Add "Yes, but..." or "No, and..." outcomes

**WHEN TO FAIL:**
- Failure creates more interesting story than success
- Character is clearly outmatched
- Player took unreasonable risks
- Always make failure interesting, never a dead end

**RESOURCES & STATS:**
Stats and resources exist for character definition but don't mechanically affect outcomes. Use them as narrative guides:
- High stat = character is competent in this area
- Low resource = character is strained, desperate
- Use /modify_resource for dramatic effect, not mechanical penalty

**EXAMPLE CHOICES:**
- "You slip through the shadows toward the guard..." (no roll needed - describe outcome based on character skill and situation)
- "The locked door stands before you. Your lockpicking skills are modest - this will take time and make noise, or you could try another approach."
- "Your words hang in the air. The king's expression is unreadable. What do you say next?"`,
    choiceSyntax:
      "- ...Prose <use_skill: none; use_resource: none; use_item: item name or none; agmt_check: question (likelihood) or none; agmt_table: category or none; custom_table: table name or none>\n\nNARRATIVE SYSTEM - No skill checks! Outcomes flow from character choices and story logic:\nExample:\n- You slip through the shadows, using your training to avoid detection. <use_skill: none; use_resource: none; use_item: none; agmt_check: none; agmt_table: none; custom_table: none>\n- You confront the villain with the evidence you've gathered. <use_skill: none; use_resource: none; use_item: Evidence Folder; agmt_check: Does he try to flee? (Likely); agmt_table: none; custom_table: none>",
    dcGuidelines:
      "⚠️ NO DICE ROLLS IN NARRATIVE SYSTEM:\n- NEVER include use_skill with any skill name\n- NEVER specify DC values\n- Outcomes are determined by dramatic logic and character choices\n- Stats exist for character definition only, not mechanical resolution\n- Focus on meaningful choices, not random chance\n- Use AGMT checks for world-building questions, not character actions",
  },

  conditionPenalties: {
    tier1: 0, // Narrative system - no mechanical penalties
    tier2: 0,
    tier3: 0,
    tier4: 0,
    tier5: 0,
    tier6: "game-over", // Only tier 6 has game effect
  },
};

/**
 * Registry of all available RPG systems
 */
export const RPG_SYSTEMS: Record<RPGSystemType, RPGSystem> = {
  "3d6": SYSTEM_3D6,
  "1d20": SYSTEM_1D20,
  "1d100": SYSTEM_1D100,
  percentile: SYSTEM_PERCENTILE,
  pbta: SYSTEM_PBTA,
  fate: SYSTEM_FATE,
  yze: SYSTEM_YZE,
  explosive: SYSTEM_EXPLOSIVE,
  narrative: SYSTEM_NARRATIVE,
};

/**
 * Get an RPG system configuration by ID
 */
export function getRPGSystem(systemId: RPGSystemType = "3d6"): RPGSystem {
  return RPG_SYSTEMS[systemId] || SYSTEM_3D6;
}

/**
 * Roll dice according to a system's configuration
 * Returns individual die results and their sum
 * For exploding dice, returns array of all rolls including explosions
 */
export function rollDice(
  system: RPGSystem,
  dieSides?: number // For exploding dice: override die size based on stat
): {
  rolls: number[];
  total: number;
  explosions?: number; // Count of explosions that occurred
} {
  const rolls: number[] = [];

  if (system.hasExplodingDice && dieSides) {
    // Exploding dice system: roll one die, explode on max
    let explosions = 0;
    let keepRolling = true;

    while (keepRolling) {
      const dieRoll: number = Math.floor(Math.random() * dieSides) + 1;
      rolls.push(dieRoll);

      if (dieRoll === dieSides) {
        // Explosion! Roll again
        explosions++;
        keepRolling = true;
      } else {
        keepRolling = false;
      }
    }

    const total = rolls.reduce((sum, roll) => sum + roll, 0);
    return { rolls, total, explosions };
  }

  // Standard dice rolling for other systems
  for (let i = 0; i < system.dice.count; i++) {
    if (system.id === "fate") {
      // Fate/Fudge dice: -1, 0, or +1
      const roll = Math.floor(Math.random() * 3) - 1;
      rolls.push(roll);
    } else {
      // Standard dice: 1 to sides
      const roll = Math.floor(Math.random() * system.dice.sides) + 1;
      rolls.push(roll);
    }
  }

  const total = rolls.reduce((sum, roll) => sum + roll, 0);

  return { rolls, total };
}

/**
 * Calculate if a check succeeds
 * For YZE: pass in rolls array and it counts 6s
 */
export function checkSuccess(
  system: RPGSystem,
  roll: number,
  statValue: number,
  dc: number,
  penalty: number = 0,
  rolls?: number[] // For YZE: array of individual dice results
): {
  success: boolean;
  critical: boolean;
  partial?: boolean;
  tie?: boolean;
  style?: boolean;
  stressRelief?: boolean; // YZE: strong success reduces stress
  total: number;
  successes?: number; // YZE: count of 6s rolled
  narrative?: boolean; // Narrative: no dice rolled
} {
  // Narrative system: no dice, always "succeeds" (outcome determined narratively)
  if (system.noDice) {
    return { success: true, critical: false, total: 0, narrative: true };
  }

  if (system.hasStressDice) {
    // Year Zero Engine: count 6s as successes
    if (!rolls || rolls.length === 0) {
      return { success: false, critical: false, total: 0, successes: 0 };
    }

    const successes = rolls.filter((die) => die === 6).length;
    const success = successes >= dc;
    const critical = successes >= 6; // Rolling 6+ sixes is extraordinary
    const margin = successes - dc;
    const styleThreshold = system.success.styleThreshold || 3;
    const stressRelief = success && margin >= styleThreshold; // 3+ successes beyond requirement

    return { success, critical, successes, total: successes, stressRelief };
  } else if (system.hasExplodingDice) {
    // Explosive Dice: pure dice roll vs DC, no modifiers
    const success = roll >= dc;
    const critical =
      roll >= (system.success.criticalThreshold || 20) && success;
    return { success, critical, total: roll };
  } else if (system.rollUnder) {
    // Roll-under system: need to roll <= stat
    const effectiveStat = Math.max(1, statValue - penalty);
    const success = roll <= effectiveStat;
    const critical = roll <= (system.success.criticalThreshold || 5) && success;
    return { success, critical, total: roll };
  } else if (system.hasSuccessWithStyle) {
    // Fate-style system with tie and success with style
    const modifier = system.statToModifier(statValue);
    const effectiveModifier = modifier - penalty;
    const total = roll + effectiveModifier;
    const margin = total - dc;
    const styleThreshold = system.success.styleThreshold || 3;

    const tie = margin === 0;
    const success = margin > 0;
    const style = margin >= styleThreshold;
    const critical =
      roll >= (system.success.criticalThreshold || system.dice.max);

    return { success, critical, tie, style, total };
  } else if (system.hasPartialSuccess) {
    // PbtA-style system with partial success
    const modifier = system.statToModifier(statValue);
    const effectiveModifier = modifier - penalty;
    const total = roll + effectiveModifier;
    const successThreshold = system.dc.medium; // 10+ for PbtA
    const partialThreshold = system.success.partialThreshold || 7;

    const success = total >= successThreshold;
    const partial = total >= partialThreshold && total < successThreshold;
    const critical =
      roll >= (system.success.criticalThreshold || system.dice.max) && success;

    return { success, critical, partial, total };
  } else {
    // Roll-over system: roll + modifier >= DC
    const modifier = system.statToModifier(statValue);
    const effectiveModifier = modifier - penalty;
    const total = roll + effectiveModifier;
    const success = total >= dc;
    const critical =
      roll >= (system.success.criticalThreshold || system.dice.max) && success;
    return { success, critical, total };
  }
}

/**
 * Calculate resource requirements based on DC and system
 */
export function calculateResourceRequirements(
  system: RPGSystem,
  dc: number
): {
  required: number;
  penalty: number;
  recovery: number;
  loss: number;
} {
  // For systems with 0 divisors, return 0 (mechanic is disabled for this system)
  // For 0 DC, use minimum values
  const safeRequired =
    system.resources.requiredDivisor === 0
      ? 0
      : dc === 0
      ? system.resources.minRequired
      : Math.max(
          system.resources.minRequired,
          Math.floor(dc / system.resources.requiredDivisor)
        );

  const safePenalty =
    system.resources.penaltyDivisor === 0
      ? 0
      : dc === 0
      ? system.resources.minPenalty
      : Math.max(
          system.resources.minPenalty,
          Math.floor(dc / system.resources.penaltyDivisor)
        );

  const safeRecovery =
    system.resources.recoverDivisor === 0
      ? 0
      : dc === 0
      ? system.resources.minRecover
      : Math.max(
          system.resources.minRecover,
          Math.floor(dc / system.resources.recoverDivisor)
        );

  const safeLoss =
    system.resources.lossDivisor === 0
      ? 0
      : dc === 0
      ? system.resources.minLoss
      : Math.max(
          system.resources.minLoss,
          Math.floor(dc / system.resources.lossDivisor)
        );

  return {
    required: safeRequired,
    penalty: safePenalty,
    recovery: safeRecovery,
    loss: safeLoss,
  };
}

/**
 * Get a human-readable explanation of a DC for a given system
 */
export function describeDC(system: RPGSystem, dc: number): string {
  if (dc <= system.dc.trivial) return "trivial";
  if (dc <= system.dc.easy) return "easy";
  if (dc <= system.dc.medium) return "medium";
  if (dc <= system.dc.hard) return "hard";
  if (dc <= system.dc.veryHard) return "very hard";
  return "nearly impossible";
}

/**
 * Get system-appropriate upgrade amounts
 * Returns default upgrade settings scaled for the RPG system
 */
export function getSystemUpgradeDefaults(systemId: RPGSystemType = "3d6"): {
  statUpgradeAmount: number;
  resourceUpgradeAmount: number;
  shopStatStartingValue: number;
} {
  const system = getRPGSystem(systemId);
  return {
    statUpgradeAmount: system.upgrades.statUpgradeAmount,
    resourceUpgradeAmount: system.upgrades.resourceUpgradeAmount,
    shopStatStartingValue: system.upgrades.shopStatStartingValue,
  };
}

/**
 * Get condition penalty for a given tier
 * Returns an object with the penalty type and value
 */
export function getConditionPenalty(
  systemId: RPGSystemType | undefined,
  tier: 1 | 2 | 3 | 4 | 5 | 6
): {
  type:
    | "modifier"
    | "auto-fail"
    | "auto-miss"
    | "taken-out"
    | "game-over"
    | "die-size-down"
    | "d4-only"
    | "none";
  value: number;
} {
  const system = getRPGSystem(systemId);
  const tierKey = `tier${tier}` as keyof typeof system.conditionPenalties;
  const penalty = system.conditionPenalties[tierKey];

  if (penalty === null) {
    return { type: "none", value: 0 };
  }

  if (typeof penalty === "number") {
    return { type: "modifier", value: penalty };
  }

  // Handle special string penalties
  switch (penalty) {
    case "auto-fail":
      return { type: "auto-fail", value: 0 };
    case "auto-miss":
      return { type: "auto-miss", value: 0 };
    case "taken-out":
      return { type: "taken-out", value: 0 };
    case "game-over":
      return { type: "game-over", value: 0 };
    case "die-size-down":
      return { type: "die-size-down", value: 1 };
    case "die-size-down-2":
      return { type: "die-size-down", value: 2 };
    case "die-size-down-3":
      return { type: "die-size-down", value: 3 };
    case "d4-only":
      return { type: "d4-only", value: 0 };
    default:
      return { type: "none", value: 0 };
  }
}

// ============================================================================
// TIER-BASED DIFFICULTY SYSTEM
// ============================================================================
// AI specifies tiers (e.g., "hard", "moderate") instead of raw numbers.
// Actual values are derived from RPG system + adventure difficulty.

import type {
  AdventureDifficulty,
  DCTier,
  PointsTier,
  StatChangeTier,
  ChallengeTier,
} from "./structs";

/**
 * DC values by tier for each RPG system and adventure difficulty
 * Structure: [system][tier][difficulty]
 */
const DC_TIER_VALUES: Record<
  RPGSystemType,
  Record<DCTier, Record<AdventureDifficulty, number>>
> = {
  // 3d6 system: roll range 3-18, average ~10.5
  "3d6": {
    trivial: { easy: 5, medium: 8, hard: 10, expert: 12 },
    easy: { easy: 8, medium: 12, hard: 15, expert: 18 },
    average: { easy: 12, medium: 18, hard: 22, expert: 25 },
    hard: { easy: 18, medium: 22, hard: 26, expert: 30 },
    very_hard: { easy: 22, medium: 26, hard: 30, expert: 34 },
    impossible: { easy: 26, medium: 30, hard: 34, expert: 38 },
  },
  // 1d20 system: roll range 1-20, average 10.5
  "1d20": {
    trivial: { easy: 1, medium: 5, hard: 8, expert: 10 },
    easy: { easy: 5, medium: 10, hard: 12, expert: 15 },
    average: { easy: 10, medium: 15, hard: 18, expert: 20 },
    hard: { easy: 15, medium: 18, hard: 22, expert: 25 },
    very_hard: { easy: 18, medium: 22, hard: 25, expert: 28 },
    impossible: { easy: 22, medium: 25, hard: 28, expert: 32 },
  },
  // 1d100 system: roll range 1-100
  "1d100": {
    trivial: { easy: 10, medium: 20, hard: 30, expert: 40 },
    easy: { easy: 25, medium: 40, hard: 50, expert: 60 },
    average: { easy: 40, medium: 55, hard: 65, expert: 75 },
    hard: { easy: 55, medium: 70, hard: 80, expert: 90 },
    very_hard: { easy: 70, medium: 80, hard: 90, expert: 100 },
    impossible: { easy: 80, medium: 90, hard: 100, expert: 120 },
  },
  // Percentile system: stat-based, roll-under
  percentile: {
    trivial: { easy: 90, medium: 80, hard: 70, expert: 60 },
    easy: { easy: 75, medium: 65, hard: 55, expert: 45 },
    average: { easy: 60, medium: 50, hard: 40, expert: 30 },
    hard: { easy: 45, medium: 35, hard: 25, expert: 20 },
    very_hard: { easy: 30, medium: 20, hard: 15, expert: 10 },
    impossible: { easy: 20, medium: 10, hard: 5, expert: 1 },
  },
  // PbtA system: 2d6+stat, 6- fail, 7-9 partial, 10+ success
  // DC here is the stat penalty/bonus adjustment
  pbta: {
    trivial: { easy: 2, medium: 1, hard: 0, expert: -1 },
    easy: { easy: 1, medium: 0, hard: -1, expert: -2 },
    average: { easy: 0, medium: -1, hard: -2, expert: -3 },
    hard: { easy: -1, medium: -2, hard: -3, expert: -4 },
    very_hard: { easy: -2, medium: -3, hard: -4, expert: -5 },
    impossible: { easy: -3, medium: -4, hard: -5, expert: -6 },
  },
  // Fate system: 4dF + skill, oppose with difficulty ladder
  fate: {
    trivial: { easy: -2, medium: 0, hard: 1, expert: 2 },
    easy: { easy: 0, medium: 1, hard: 2, expert: 3 },
    average: { easy: 1, medium: 2, hard: 3, expert: 4 },
    hard: { easy: 2, medium: 3, hard: 4, expert: 5 },
    very_hard: { easy: 3, medium: 4, hard: 5, expert: 6 },
    impossible: { easy: 4, medium: 5, hard: 6, expert: 8 },
  },
  // YZE system: dice pool, count 6s as successes
  // DC = required number of successes
  yze: {
    trivial: { easy: 1, medium: 1, hard: 1, expert: 2 },
    easy: { easy: 1, medium: 1, hard: 2, expert: 2 },
    average: { easy: 1, medium: 2, hard: 2, expert: 3 },
    hard: { easy: 2, medium: 2, hard: 3, expert: 3 },
    very_hard: { easy: 2, medium: 3, hard: 3, expert: 4 },
    impossible: { easy: 3, medium: 3, hard: 4, expert: 5 },
  },
  // Explosive dice system: stat determines die size
  // DC = target number to beat
  explosive: {
    trivial: { easy: 2, medium: 4, hard: 5, expert: 6 },
    easy: { easy: 4, medium: 6, hard: 8, expert: 10 },
    average: { easy: 6, medium: 8, hard: 10, expert: 12 },
    hard: { easy: 8, medium: 10, hard: 12, expert: 15 },
    very_hard: { easy: 10, medium: 12, hard: 15, expert: 18 },
    impossible: { easy: 12, medium: 15, hard: 18, expert: 22 },
  },
  // Narrative system: no dice, pure storytelling
  // DCs are just for reference/context
  narrative: {
    trivial: { easy: 0, medium: 0, hard: 0, expert: 0 },
    easy: { easy: 0, medium: 0, hard: 0, expert: 0 },
    average: { easy: 0, medium: 0, hard: 0, expert: 0 },
    hard: { easy: 0, medium: 0, hard: 0, expert: 0 },
    very_hard: { easy: 0, medium: 0, hard: 0, expert: 0 },
    impossible: { easy: 0, medium: 0, hard: 0, expert: 0 },
  },
};

/**
 * Points values by tier and adventure difficulty
 * These are universal across RPG systems
 */
const POINTS_TIER_VALUES: Record<
  PointsTier,
  Record<AdventureDifficulty, number>
> = {
  trivial: { easy: 5, medium: 10, hard: 15, expert: 25 },
  minor: { easy: 15, medium: 25, hard: 40, expert: 60 },
  moderate: { easy: 30, medium: 50, hard: 75, expert: 100 },
  major: { easy: 60, medium: 100, hard: 150, expert: 200 },
  legendary: { easy: 100, medium: 200, hard: 300, expert: 500 },
};

/**
 * Stat/resource change values by tier and adventure difficulty
 * Higher difficulty = smaller changes (harder to grow)
 */
const STAT_CHANGE_TIER_VALUES: Record<
  StatChangeTier,
  Record<AdventureDifficulty, number>
> = {
  tiny: { easy: 2, medium: 1, hard: 1, expert: 1 },
  small: { easy: 5, medium: 3, hard: 2, expert: 2 },
  moderate: { easy: 10, medium: 6, hard: 4, expert: 3 },
  large: { easy: 15, medium: 10, hard: 7, expert: 5 },
  massive: { easy: 25, medium: 15, hard: 10, expert: 8 },
};

/**
 * Challenge rounds (best of X) by tier
 * Universal across difficulties and systems
 */
const CHALLENGE_TIER_VALUES: Record<ChallengeTier, number> = {
  quick: 3, // Best of 3 - first to 2 wins
  standard: 5, // Best of 5 - first to 3 wins
  extended: 7, // Best of 7 - first to 4 wins
  epic: 9, // Best of 9 - first to 5 wins
};

/**
 * Convert a DC tier to an actual number
 * @param tier - The difficulty tier (e.g., "hard")
 * @param systemId - The RPG system ID
 * @param difficulty - The adventure difficulty
 * @returns The numeric DC value
 */
export function getDCFromTier(
  tier: DCTier,
  systemId: RPGSystemType = "3d6",
  difficulty: AdventureDifficulty = "medium"
): number {
  return (
    DC_TIER_VALUES[systemId]?.[tier]?.[difficulty] ??
    DC_TIER_VALUES["3d6"][tier][difficulty]
  );
}

/**
 * Convert a points tier to an actual number
 * @param tier - The points tier (e.g., "moderate")
 * @param difficulty - The adventure difficulty
 * @returns The numeric points value
 */
export function getPointsFromTier(
  tier: PointsTier,
  difficulty: AdventureDifficulty = "medium"
): number {
  return (
    POINTS_TIER_VALUES[tier]?.[difficulty] ??
    POINTS_TIER_VALUES["moderate"][difficulty]
  );
}

/**
 * Convert a stat change tier to an actual number
 * @param tier - The change tier (e.g., "small")
 * @param difficulty - The adventure difficulty
 * @returns The numeric change value (always positive, caller handles sign)
 */
export function getStatChangeFromTier(
  tier: StatChangeTier,
  difficulty: AdventureDifficulty = "medium"
): number {
  return (
    STAT_CHANGE_TIER_VALUES[tier]?.[difficulty] ??
    STAT_CHANGE_TIER_VALUES["small"][difficulty]
  );
}

/**
 * Convert a challenge tier to rounds (best of X)
 * @param tier - The challenge tier (e.g., "standard")
 * @returns The number of rounds
 */
export function getChallengeRoundsFromTier(tier: ChallengeTier): number {
  return CHALLENGE_TIER_VALUES[tier] ?? 5;
}

/**
 * Check if a value is a valid DC tier string
 */
export function isDCTier(value: unknown): value is DCTier {
  return (
    typeof value === "string" &&
    ["trivial", "easy", "average", "hard", "very_hard", "impossible"].includes(
      value
    )
  );
}

/**
 * Check if a value is a valid points tier string
 */
export function isPointsTier(value: unknown): value is PointsTier {
  return (
    typeof value === "string" &&
    ["trivial", "minor", "moderate", "major", "legendary"].includes(value)
  );
}

/**
 * Check if a value is a valid stat change tier string
 */
export function isStatChangeTier(value: unknown): value is StatChangeTier {
  return (
    typeof value === "string" &&
    ["tiny", "small", "moderate", "large", "massive"].includes(value)
  );
}

/**
 * Check if a value is a valid challenge tier string
 */
export function isChallengeTier(value: unknown): value is ChallengeTier {
  return (
    typeof value === "string" &&
    ["quick", "standard", "extended", "epic"].includes(value)
  );
}

/**
 * Parse a DC value that could be either a number or a tier string
 * Returns the numeric DC value
 */
export function parseDCValue(
  value: number | string,
  systemId: RPGSystemType = "3d6",
  difficulty: AdventureDifficulty = "medium"
): number {
  if (typeof value === "number") {
    return value;
  }
  if (isDCTier(value)) {
    return getDCFromTier(value, systemId, difficulty);
  }
  // Try parsing as number
  const parsed = parseInt(value, 10);
  return isNaN(parsed)
    ? getDCFromTier("average", systemId, difficulty)
    : parsed;
}

/**
 * Parse a points value that could be either a number or a tier string
 * Returns the numeric points value
 */
export function parsePointsValue(
  value: number | string,
  difficulty: AdventureDifficulty = "medium"
): number {
  if (typeof value === "number") {
    return value;
  }
  if (isPointsTier(value)) {
    return getPointsFromTier(value, difficulty);
  }
  // Try parsing as number
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? getPointsFromTier("moderate", difficulty) : parsed;
}

/**
 * Parse a stat change value that could be either a number or a tier string
 * Returns the numeric change value (preserves sign for numbers)
 */
export function parseStatChangeValue(
  value: number | string,
  difficulty: AdventureDifficulty = "medium",
  isNegative: boolean = false
): number {
  if (typeof value === "number") {
    return value;
  }
  if (isStatChangeTier(value)) {
    const base = getStatChangeFromTier(value, difficulty);
    return isNegative ? -base : base;
  }
  // Try parsing as number
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? getStatChangeFromTier("small", difficulty) : parsed;
}

/**
 * Parse a challenge rounds value that could be either a number or a tier string
 * Returns the numeric rounds value
 */
export function parseChallengeRoundsValue(value: number | string): number {
  if (typeof value === "number") {
    return value;
  }
  if (isChallengeTier(value)) {
    return getChallengeRoundsFromTier(value);
  }
  // Try parsing as number
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? 5 : parsed;
}

// Export tier constants for use in tool schemas
export const DC_TIERS: DCTier[] = [
  "trivial",
  "easy",
  "average",
  "hard",
  "very_hard",
  "impossible",
];
export const POINTS_TIERS: PointsTier[] = [
  "trivial",
  "minor",
  "moderate",
  "major",
  "legendary",
];
export const STAT_CHANGE_TIERS: StatChangeTier[] = [
  "tiny",
  "small",
  "moderate",
  "large",
  "massive",
];
export const CHALLENGE_TIERS: ChallengeTier[] = [
  "quick",
  "standard",
  "extended",
  "epic",
];
