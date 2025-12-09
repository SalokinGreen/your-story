/**
 * GM Stage Tools - Tool definitions for the Game Master stage
 *
 * The GM stage runs before the story stage and determines:
 * - What skill checks are needed
 * - What resources are at stake
 * - Challenge management
 * - Opposed checks between player and NPCs
 * - Arbitrary dice rolls and calculations
 *
 * The frontend executes these tools, rolls dice, and prepends results to the story stage.
 */

import { ToolSchema } from "./toolSchemas";

// ============================================
// GM TOOL INTERFACES
// ============================================

export interface SkillCheckParams {
  stat: string;
  difficulty: string; // Tier name (easy/average/hard) or DC number
  reason: string;
  item?: string;
  ability?: string;
  modifier?: number;
  modifier_reason?: string;
  resource?: {
    name: string;
    amount: number;
  };
  stakes?: "low" | "medium" | "high" | "deadly";
  consequences?: {
    success?: string;
    failure?: string;
    partial?: string; // For PbtA/Fate systems
  };
}

export interface ChallengeCheckParams {
  description: string;
  stat?: string;
  difficulty?: string;
  item?: string;
  ability?: string;
  modifier?: number;
  modifier_reason?: string;
  consequences?: {
    success?: string;
    failure?: string;
    partial?: string;
  };
}

export interface StartChallengeParams {
  name: string;
  description: string;
  required_successes: number;
  max_failures: number;
  primary_stat: string;
  difficulty: string;
  victory_consequence?: string;
  defeat_consequence?: string;
}

export interface OpposedCheckParams {
  player_stat: string;
  opponent_name: string;
  opponent_skill: number;
  reason: string;
  player_item?: string;
  player_ability?: string;
  player_modifier?: number;
  player_modifier_reason?: string;
  opponent_modifier?: number;
  stakes?: "low" | "medium" | "high" | "deadly";
  consequences?: {
    player_wins?: string;
    opponent_wins?: string;
    tie?: string;
  };
}

export interface RollDiceParams {
  dice: string; // "1d6", "2d10+5", "3d6-2"
  reason: string;
  display_name?: string;
}

export interface CalculateParams {
  expression: string; // "20 - 4", "50 + 2d6"
  reason: string;
  display_name?: string;
}

export interface NoCheckNeededParams {
  reason: string;
  outcome?: string;
}

export interface TakeRestParams {
  type: "quick" | "short" | "long";
  narrative_context?: string;
}

// Union type for all GM tool parameters
export type GMToolParams =
  | { name: "skill_check"; params: SkillCheckParams }
  | { name: "challenge_check"; params: ChallengeCheckParams }
  | { name: "start_challenge"; params: StartChallengeParams }
  | { name: "opposed_check"; params: OpposedCheckParams }
  | { name: "roll_dice"; params: RollDiceParams }
  | { name: "calculate"; params: CalculateParams }
  | { name: "no_check_needed"; params: NoCheckNeededParams }
  | { name: "take_rest"; params: TakeRestParams };

// ============================================
// GM TOOL SCHEMAS
// ============================================

const skillCheckTool: ToolSchema = {
  type: "function",
  function: {
    name: "skill_check",
    description: `Request a skill check for the player's action. The frontend will roll dice, apply modifiers, and determine success/failure.

WHEN TO USE:
- Player attempts something with meaningful risk of failure
- Action requires specific character competency
- Outcome should depend on character stats

STAKES determine condition tier on failure:
- low: Tier 1 (minor setback)
- medium: Tier 2 (noticeable consequence)
- high: Tier 3 (significant injury/problem)
- deadly: Tier 4+ (severe/life-threatening)`,
    parameters: {
      type: "object",
      properties: {
        stat: {
          type: "string",
          description:
            "Which character stat to check (e.g., 'Strength', 'Stealth', 'Persuasion')",
        },
        difficulty: {
          type: "string",
          description:
            "Difficulty tier (trivial/easy/average/hard/very_hard/impossible) or exact DC number",
        },
        reason: {
          type: "string",
          description:
            "Brief description of what's being attempted (e.g., 'Picking the lock quietly')",
        },
        item: {
          type: "string",
          description:
            "Item being used (grants advantage, may break on critical failure)",
        },
        ability: {
          type: "string",
          description: "Ability being used (grants grade bonus, pays cost)",
        },
        modifier: {
          type: "number",
          description:
            "Flat bonus/penalty from passives, situation, or other factors",
        },
        modifier_reason: {
          type: "string",
          description:
            "Explanation for the modifier (e.g., 'Rapier Mastery passive +2')",
        },
        resource: {
          type: "object",
          description:
            "Resource being spent (insufficient = penalty instead of failure)",
          properties: {
            name: { type: "string", description: "Resource name" },
            amount: { type: "number", description: "Amount required" },
          },
          required: ["name", "amount"],
        },
        stakes: {
          type: "string",
          enum: ["low", "medium", "high", "deadly"],
          description:
            "How dangerous is failure? Determines condition tier if player fails.",
        },
        consequences: {
          type: "object",
          description: "What happens on each outcome (guides the story stage)",
          properties: {
            success: { type: "string", description: "What happens on success" },
            failure: { type: "string", description: "What happens on failure" },
            partial: {
              type: "string",
              description: "PbtA/Fate: success with complication",
            },
          },
        },
      },
      required: ["stat", "difficulty", "reason"],
    },
  },
};

const challengeCheckTool: ToolSchema = {
  type: "function",
  function: {
    name: "challenge_check",
    description: `Make a check as part of the active challenge. Inherits the challenge's primary stat and difficulty unless overridden.

Use this INSTEAD of skill_check when there's an active challenge in progress.`,
    parameters: {
      type: "object",
      properties: {
        description: {
          type: "string",
          description:
            "What this specific check represents (e.g., 'Vault over the gap between rooftops')",
        },
        stat: {
          type: "string",
          description: "Override: use a different stat for this check",
        },
        difficulty: {
          type: "string",
          description: "Override: situational difficulty change",
        },
        item: {
          type: "string",
          description: "Item being used",
        },
        ability: {
          type: "string",
          description: "Ability being used",
        },
        modifier: {
          type: "number",
          description: "Situational modifier",
        },
        modifier_reason: {
          type: "string",
          description: "Explanation for modifier",
        },
        consequences: {
          type: "object",
          description:
            "Specific consequences for THIS check within the challenge",
          properties: {
            success: { type: "string" },
            failure: { type: "string" },
            partial: { type: "string" },
          },
        },
      },
      required: ["description"],
    },
  },
};

const startChallengeTool: ToolSchema = {
  type: "function",
  function: {
    name: "start_challenge",
    description: `Start a multi-roll "best of X" challenge for complex tasks.

GUIDELINES:
- Simple tasks = regular skill_check, not a challenge
- Dangerous combat/chase = 3 successes needed
- Boss fight = 4-5 successes needed
- Epic battle = 6+ successes needed

Only ONE challenge can be active at a time.`,
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description:
            "Challenge name (e.g., 'Rooftop Chase', 'Negotiation with Baron')",
        },
        description: {
          type: "string",
          description: "Situation context and stakes",
        },
        required_successes: {
          type: "number",
          description: "How many successes to win (typically 3-6)",
          minimum: 2,
          maximum: 10,
        },
        max_failures: {
          type: "number",
          description:
            "How many failures before losing (usually equals required_successes)",
          minimum: 2,
          maximum: 10,
        },
        primary_stat: {
          type: "string",
          description: "Default stat for checks in this challenge",
        },
        difficulty: {
          type: "string",
          description: "Base difficulty tier for the challenge",
        },
        victory_consequence: {
          type: "string",
          description: "What happens if player wins the challenge",
        },
        defeat_consequence: {
          type: "string",
          description: "What happens if player loses the challenge",
        },
      },
      required: [
        "name",
        "description",
        "required_successes",
        "max_failures",
        "primary_stat",
        "difficulty",
      ],
    },
  },
};

const opposedCheckTool: ToolSchema = {
  type: "function",
  function: {
    name: "opposed_check",
    description: `Contested roll between player and NPC. Both roll, higher wins.

Use for:
- Arm wrestling, drinking contests
- Stealth vs Perception
- Haggling/negotiations where both parties push back
- Chases where opponent actively resists`,
    parameters: {
      type: "object",
      properties: {
        player_stat: {
          type: "string",
          description: "Player's stat to roll",
        },
        opponent_name: {
          type: "string",
          description: "NPC's name (e.g., 'Guard Captain', 'The Merchant')",
        },
        opponent_skill: {
          type: "number",
          description:
            "NPC's effective skill (0-100). 30=novice, 50=competent, 70=skilled, 90=master",
          minimum: 0,
          maximum: 100,
        },
        reason: {
          type: "string",
          description: "What the contest is about",
        },
        player_item: {
          type: "string",
          description: "Item player is using",
        },
        player_ability: {
          type: "string",
          description: "Ability player is using",
        },
        player_modifier: {
          type: "number",
          description: "Player's situational modifier",
        },
        player_modifier_reason: {
          type: "string",
          description: "Explanation for player modifier",
        },
        opponent_modifier: {
          type: "number",
          description: "NPC's situational modifier",
        },
        stakes: {
          type: "string",
          enum: ["low", "medium", "high", "deadly"],
          description: "Consequences of losing",
        },
        consequences: {
          type: "object",
          properties: {
            player_wins: { type: "string" },
            opponent_wins: { type: "string" },
            tie: { type: "string" },
          },
        },
      },
      required: ["player_stat", "opponent_name", "opponent_skill", "reason"],
    },
  },
};

const rollDiceTool: ToolSchema = {
  type: "function",
  function: {
    name: "roll_dice",
    description: `Roll dice for random determination (NOT a skill check).

Use for:
- Random encounters
- Loot quality
- NPC reactions
- Weather changes
- Any random narrative element`,
    parameters: {
      type: "object",
      properties: {
        dice: {
          type: "string",
          description: "Dice notation: '1d6', '2d10', '1d20+5', '3d6-2'",
        },
        reason: {
          type: "string",
          description: "What this roll determines",
        },
        display_name: {
          type: "string",
          description: "Optional label for the UI (e.g., 'Encounter Roll')",
        },
      },
      required: ["dice", "reason"],
    },
  },
};

const calculateTool: ToolSchema = {
  type: "function",
  function: {
    name: "calculate",
    description: `Calculate a mathematical expression, optionally with dice.

Use for:
- Damage calculation after modifiers
- Resource costs
- Complex formulas
- Any math with explanation`,
    parameters: {
      type: "object",
      properties: {
        expression: {
          type: "string",
          description:
            "Math expression: '20 - 4', '50 + 2d6', '100 - 1d20 + 5'",
        },
        reason: {
          type: "string",
          description: "What this calculation represents",
        },
        display_name: {
          type: "string",
          description: "Optional label (e.g., 'Net Damage')",
        },
      },
      required: ["expression", "reason"],
    },
  },
};

const noCheckNeededTool: ToolSchema = {
  type: "function",
  function: {
    name: "no_check_needed",
    description: `Explicitly indicate that no mechanical check is needed.

Use when:
- Action is trivial and auto-succeeds
- Already established capability
- Pure roleplay/dialogue
- Narrative transition`,
    parameters: {
      type: "object",
      properties: {
        reason: {
          type: "string",
          description:
            "Why no check is needed (e.g., 'Trivial action', 'Already established', 'Pure dialogue')",
        },
        outcome: {
          type: "string",
          description: "Optional: describe what happens",
        },
      },
      required: ["reason"],
    },
  },
};

const takeRestTool: ToolSchema = {
  type: "function",
  function: {
    name: "take_rest",
    description: `Process a rest period. Handles recovery, cooldowns, conditions.

CANNOT rest during an active challenge.

Types:
- quick (~30 min): Brief recovery, small resource restore
- short (4-8 hours): Sleep, significant recovery
- long (several days): Full recovery, condition improvement`,
    parameters: {
      type: "object",
      properties: {
        type: {
          type: "string",
          enum: ["quick", "short", "long"],
          description: "Rest type",
        },
        narrative_context: {
          type: "string",
          description: "How the rest happens narratively",
        },
      },
      required: ["type"],
    },
  },
};

// ============================================
// EXPORT
// ============================================

/**
 * All GM stage tool schemas
 */
export const GM_TOOL_SCHEMAS: ToolSchema[] = [
  skillCheckTool,
  challengeCheckTool,
  startChallengeTool,
  opposedCheckTool,
  rollDiceTool,
  calculateTool,
  noCheckNeededTool,
  takeRestTool,
];

/**
 * GM tool names for validation
 */
export const GM_TOOL_NAMES = GM_TOOL_SCHEMAS.map((t) => t.function.name);

/**
 * Check if a tool name is a GM tool
 */
export function isGMTool(toolName: string): boolean {
  return GM_TOOL_NAMES.includes(toolName);
}
