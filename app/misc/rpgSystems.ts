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
  | "explosive";

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
      "DC system: Roll (3-18) + Stat Value ≥ DC. For average stats (~50): DC 8 is trivial, DC 15 is easy, DC 20 is medium, DC 25 is hard, DC 30 is very hard, DC 35+ requires max roll (18) and exceptional stats.",
    challengeGuidance:
      "⚠️ IMPORTANT: Challenge the player! Use DC 20-25 for normal challenges, DC 25-30 for difficult ones, DC 30-35 for epic moments. Avoid DCs below 15 unless the task is truly trivial. The 3d6 system creates consistent results, so higher DCs are needed to provide real challenge.",
    choiceSyntax:
      "- ...Prose <use_skill: skill name (DC Number) or none; use_resource: resource name or none; use_item: item name or none>\nExample:\n- You carefully sneak past the sleeping dragon. <use_skill: Stealth (DC 25); use_resource: Stamina; use_item: none>",
    dcGuidelines:
      "⚠️ DC GUIDELINES:\n- Use DCs that scale with the adventure's stat range.\n- 3-15: Easy challenge (most characters can succeed)\n- 20: Medium challenge (requires decent stats)\n- 25: Hard challenge (high stats or items needed)\n- 30-35: Very Hard challenge (only the most prepared succeed)",
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
    statUpgradeAmount: 2, // +2 per upgrade (moderate on 1-20 scale)
    resourceUpgradeAmount: 10, // +10 per upgrade
    shopStatStartingValue: 30, // New stats start at 30 (below average)
  },

  aiInstructions: {
    diceSystem:
      "The game uses a 1d20 system (rolls 1 twenty-sided die, result is 1-20). Every number has equal probability (5% each), creating high variance and dramatic swings - you might roll a 1 or 20 at any time!",
    dcGuidance:
      "DC system: Roll (1-20) + Stat Value ≥ DC. For average stats (~50): DC 5 is trivial, DC 10 is easy, DC 15 is medium, DC 20 is hard, DC 25 is very hard, DC 30+ requires natural 20 and exceptional stats.",
    challengeGuidance:
      "⚠️ IMPORTANT: Challenge the player! Use DC 15-20 for normal challenges, DC 20-25 for difficult ones, DC 25-30 for epic moments. Avoid DCs below 10 unless the task is truly trivial. The 1d20 system is swingy - even with low stats, a natural 20 can succeed, and even high stats can fail on a 1.",
    choiceSyntax:
      "- ...Prose <use_skill: skill name (DC Number) or none; use_resource: resource name or none; use_item: item name or none>\nExample:\n- You carefully sneak past the sleeping dragon. <use_skill: Stealth (DC 20); use_resource: Stamina; use_item: none>",
    dcGuidelines:
      "⚠️ DC GUIDELINES:\n- Use DCs that scale with the adventure's stat range (typically 0-100).\n- 10-15: Easy challenge (most characters can succeed)\n- 15-20: Medium challenge (requires decent stats)\n- 20-25: Hard challenge (high stats or items needed)\n- 25-30: Very Hard challenge (only the most prepared succeed)",
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
    statUpgradeAmount: 5, // +5 per upgrade (moderate on 1-100 scale)
    resourceUpgradeAmount: 10, // +10 per upgrade
    shopStatStartingValue: 40, // New stats start at 40 (below average)
  },

  aiInstructions: {
    diceSystem:
      "The game uses a 1d100 system (rolls 1 hundred-sided die, result is 1-100). Every number has equal probability (1% each), providing maximum granularity for precise difficulty tuning.",
    dcGuidance:
      "DC system: Roll (1-100) + Stat Value ≥ DC. For average stats (~50): DC 30 is trivial, DC 60 is easy, DC 80 is medium, DC 100 is hard, DC 120 is very hard, DC 140+ requires natural 100 and exceptional stats.",
    challengeGuidance:
      "⚠️ IMPORTANT: Challenge the player! Use DC 80-100 for normal challenges, DC 100-120 for difficult ones, DC 120-140 for epic moments. Avoid DCs below 60 unless the task is truly trivial. The 1d100 system offers granular control - you can fine-tune difficulty in single percentage increments.",
    choiceSyntax:
      "- ...Prose <use_skill: skill name (DC Number) or none; use_resource: resource name or none; use_item: item name or none>\nExample:\n- You carefully sneak past the sleeping dragon. <use_skill: Stealth (DC 100); use_resource: Stamina; use_item: none>",
    dcGuidelines:
      "⚠️ DC GUIDELINES:\n- Use DCs that scale with the adventure's stat range (typically 0-100).\n- 60-80: Easy challenge (most characters can succeed)\n- 80-100: Medium challenge (requires decent stats)\n- 100-120: Hard challenge (high stats or items needed)\n- 120-140: Very Hard challenge (only the most prepared succeed)",
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
    statUpgradeAmount: 5, // +5 per upgrade (5% better chance on d100)
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
      "- ...Prose <use_skill: skill name or none; use_resource: resource name or none; use_item: item name or none>\nPercentile Roll-Under System - No DC needed! Success = roll ≤ stat value:\nExample:\n- You carefully sneak past the sleeping dragon. <use_skill: Stealth; use_resource: none; use_item: none>",
    dcGuidelines:
      "⚠️ ROLL-UNDER SYSTEM - NO DC NEEDED:\n- DO NOT specify DC values! The system compares roll directly to stat.\n- Success is automatic if roll ≤ stat value.\n- Challenge comes from stat requirements (need high stats to succeed at difficult tasks).\n- Use resources and items to create additional challenge, not DCs.",
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
    statUpgradeAmount: 10, // +10 stat = +0.5 modifier on average
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
      "- ...Prose <use_skill: skill name or none; use_resource: resource name or none; use_item: item name or none>\\nPbtA System - No DC needed! Results are: 10+ = success, 7-9 = partial success, 6- = failure:\\nExample:\\n- You carefully sneak past the sleeping dragon. <use_skill: Stealth; use_resource: none; use_item: none>\\n- You try to charm the guard. <use_skill: Charisma; use_resource: none; use_item: Fancy Clothes>",
    dcGuidelines:
      "⚠️ POWERED BY THE APOCALYPSE - NO DC NEEDED:\\n- DO NOT specify DC values for PbtA! The system has fixed thresholds: 10+ success, 7-9 partial, 6- failure.\\n- Just specify which skill to use - the roll is 2d6 + stat modifier.\\n- Focus on making partial success (7-9) interesting with complications, costs, or hard choices.\\n- Failures (6-) should advance the story with consequences, not just block progress.",
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
    statUpgradeAmount: 7, // +7 stat ≈ +1 ladder step (7% per 10-point bracket)
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
Epic (+7+): Legendary, mythic difficulty

Use Fair (2) as your DEFAULT. Use Great (4) for serious challenges. Use Fantastic (6) for climactic moments.`,
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

Remember: Success with Style MUST include a meaningful bonus, not just flavor. Ties MUST have a cost or complication. Use The Ladder names in narration ("That's a Great result!").`,
    choiceSyntax:
      "- ...Prose <use_skill: skill name (DC Number) or none; use_resource: resource name or none; use_item: item name or none>\\nFate Core System - DC is the opposition level (Poor to Legendary scale):\\nExample:\\n- You carefully sneak past the sleeping dragon. <use_skill: Stealth (DC 3); use_resource: none; use_item: none>\\n- You climb the treacherous cliff. <use_skill: Athletics (DC 4); use_resource: Stamina; use_item: Climbing Gear>",
    dcGuidelines:
      "⚠️ FATE CORE DC GUIDELINES:\\n- DC is the opposition level on the Fate ladder:\\n  * DC 0-1: Average/Fair (routine tasks)\\n  * DC 2-3: Good/Great (skilled work)\\n  * DC 4-5: Superb/Fantastic (impressive feats)\\n  * DC 6+: Epic/Legendary (near-impossible)\\n- Success with style (beat DC by 3+) grants boosts or extra benefits.\\n- Ties are partial successes - the player succeeds at a cost.",
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
    statUpgradeAmount: 10, // +10 stat = +0.5 dice
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
      "- ...Prose <use_skill: skill name (DC Number) or none; use_resource: resource name or none; use_item: item name or none>\\nYZE System - DC is the number of successes needed (count 6s on d6 pool):\\nExample:\\n- You carefully sneak past the sleeping dragon. <use_skill: Stealth (DC 2); use_resource: none; use_item: none>\\n- You pick the complex lock. <use_skill: Mechanics (DC 3); use_resource: none; use_item: Lockpicks>",
    dcGuidelines:
      "⚠️ YEAR ZERO ENGINE DC GUIDELINES:\\n- DC is the NUMBER OF SUCCESSES NEEDED (count 6s on dice rolled).\\n- DC 1: Simple task, needs 1 success (most common)\\n- DC 2: Moderate challenge, needs 2 successes\\n- DC 3: Difficult task, needs 3 successes\\n- DC 4+: Extremely challenging, rarely use\\n- DO NOT use DC values like 20, 50, 80! Those are for other RPG systems.\\n- The dice pool size (0-5 base dice) comes from the character's stat value ÷ 20.\\n- Players can add stress dice (voluntary) to increase success chances but risk panic on 1s.",
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
    statUpgradeAmount: 8, // +8 moves through die size brackets (17-point ranges)
    resourceUpgradeAmount: 5, // +5 per upgrade
    shopStatStartingValue: 25, // 25 = d6 (below average)
  },

  aiInstructions: {
    diceSystem:
      "The game uses an EXPLODING DICE system. Each stat (0-100) determines die size: 0-16=d4, 17-33=d6, 34-50=d8, 51-66=d10, 67-83=d12, 84-100=d20. Roll the die vs DC. When you roll the MAXIMUM (4 on d4, 20 on d20), the die EXPLODES - roll again and ADD it to the total! Explosions chain infinitely. A lucky d4 roller can beat a d20 through explosions!",
    dcGuidance:
      "DC system: Roll die (no modifiers) ≥ DC. Explosions add to total. Average d20 roll is 10.5, but explosions make high DCs possible. DC 8 is easy for d8+, DC 12 is medium for d10+, DC 16 is hard (needs d12+ or explosion), DC 20 is very hard (needs d20 or multiple explosions), DC 25+ requires explosive luck.",
    challengeGuidance:
      "⚠️ IMPORTANT: Challenge the player with DCs that feel risky! Use DC 10-14 for normal challenges, DC 14-18 for difficult ones, DC 18-22 for desperate moments, DC 25+ for impossible odds. Remember: even a d4 can explode multiple times for heroic victories! Explosions are RARE but EXCITING - a d10 has only 10% chance to explode, and only 1% to explode twice. This creates dramatic tension where the underdog can win through luck.",
    choiceSyntax:
      "- ...Prose <use_skill: skill name (DC Number) or none; use_resource: resource name or none; use_item: item name or none>\nExample:\n- You carefully sneak past the sleeping dragon. <use_skill: Stealth (DC 14); use_resource: Stamina; use_item: none>\n- You leap across the chasm. <use_skill: Athletics (DC 18); use_resource: none; use_item: none>",
    dcGuidelines:
      "⚠️ EXPLODING DICE DC GUIDELINES:\n- Die sizes: d4 (weak 0-16), d6 (below avg 17-33), d8 (average 34-50), d10 (good 51-66), d12 (great 67-83), d20 (exceptional 84-100)\n- DC 8-12: Easy for most characters (d6+ succeed 50%+)\n- DC 12-16: Medium challenge (needs d10+ or luck)\n- DC 16-20: Hard challenge (needs d12+ or explosion)\n- DC 20-25: Very hard (needs d20 or multiple explosions)\n- DC 25+: Heroic/impossible (requires explosive luck)\n- When narrating explosions, describe the excitement: 'Your die explodes! Roll again...'\n- Remember: A character with 50 stat (d8) can still beat DC 20 through explosions, making every roll exciting!",
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
} {
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
  // For systems with 0 divisors or 0 DC, use minimum values
  const safeRequired =
    system.resources.requiredDivisor === 0 || dc === 0
      ? system.resources.minRequired
      : Math.max(
          system.resources.minRequired,
          Math.floor(dc / system.resources.requiredDivisor)
        );

  const safePenalty =
    system.resources.penaltyDivisor === 0 || dc === 0
      ? system.resources.minPenalty
      : Math.max(
          system.resources.minPenalty,
          Math.floor(dc / system.resources.penaltyDivisor)
        );

  const safeRecovery =
    system.resources.recoverDivisor === 0 || dc === 0
      ? system.resources.minRecover
      : Math.max(
          system.resources.minRecover,
          Math.floor(dc / system.resources.recoverDivisor)
        );

  const safeLoss =
    system.resources.lossDivisor === 0 || dc === 0
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
