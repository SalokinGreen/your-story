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

// ============================================
// FORMULA-BASED GM TOOL INTERFACES
// ============================================
// These tools use dice formulas with {{variable}} syntax
// that resolve from characterData (the new schema system)

/**
 * Roll a dice formula against an optional DC
 * Formula can include {{variables}} that resolve from character data
 * Example: "1d20+{{STR_mod}}+{{proficiency}}" vs DC 15
 */
export interface FormulaRollParams {
  formula: string; // "1d20+{{STR_mod}}+{{proficiency}}", "2d6+5"
  dc?: number; // Optional target number
  reason: string;
  display_name?: string;
  stakes?: "low" | "medium" | "high" | "deadly";
  consequences?: {
    success?: string;
    failure?: string;
  };
}

/**
 * Opposed roll using formulas for both sides
 * Both formulas can include {{variables}}
 * Example: player "1d20+{{DEX_mod}}" vs opponent "1d20+5"
 */
export interface OpposedFormulaParams {
  player_formula: string; // "1d20+{{DEX_mod}}"
  opponent_formula: string; // "1d20+5" (usually fixed)
  opponent_name: string;
  reason: string;
  display_name?: string;
  stakes?: "low" | "medium" | "high" | "deadly";
  consequences?: {
    player_wins?: string;
    opponent_wins?: string;
    tie?: string;
  };
}

/**
 * Challenge check using a formula instead of stat lookup
 * For multi-step challenges with the new schema system
 */
export interface FormulaChallengeCheckParams {
  formula: string; // "1d20+{{Athletics}}"
  dc: number;
  description: string;
  display_name?: string;
  consequences?: {
    success?: string;
    failure?: string;
  };
}

// ============================================
// ORACLE & UTILITY GM TOOL INTERFACES
// ============================================

/**
 * Fate Question - Ask yes/no question using Mythic-style oracle
 * Uses AGMT fate chart with chaos factor and likelihood modifiers
 */
export interface FateQuestionParams {
  question: string; // The yes/no question to ask
  likelihood:
    | "Impossible"
    | "No Way"
    | "Very Unlikely"
    | "Unlikely"
    | "50/50"
    | "Somewhat Likely"
    | "Likely"
    | "Very Likely"
    | "Near Sure Thing"
    | "A Sure Thing"
    | "Has To Be";
  reason?: string; // Why asking this question
}

/**
 * Roll Table - Roll on a custom table or AGMT table
 * Uses weighted random selection
 */
export interface RollTableParams {
  table_name: string; // Name of table to roll on
  reason: string; // What this roll determines
  display_name?: string; // Optional UI label
}

/**
 * Request Continuation - Ask for another GM round after seeing results
 * Use when you need to chain actions (e.g., attack roll → damage roll)
 */
export interface RequestContinuationParams {
  reason: string; // Why another round is needed
  context: string; // What info you need to process
  next_action?: string; // What you plan to do next
}

/**
 * Ask Player - Pause and ask the player a question
 * The player's answer will be included in the next GM round
 */
export interface AskPlayerParams {
  question: string; // Question to ask the player
  context: string; // Why you need this information
  options?: string[]; // Optional: suggested answers
  allow_custom?: boolean; // Whether player can give custom answer (default true)
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
  | { name: "take_rest"; params: TakeRestParams }
  | { name: "formula_roll"; params: FormulaRollParams }
  | { name: "opposed_formula"; params: OpposedFormulaParams }
  | { name: "formula_challenge_check"; params: FormulaChallengeCheckParams }
  | { name: "fate_question"; params: FateQuestionParams }
  | { name: "roll_table"; params: RollTableParams }
  | { name: "request_continuation"; params: RequestContinuationParams }
  | { name: "ask_player"; params: AskPlayerParams };

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
// FORMULA-BASED TOOL SCHEMAS
// ============================================
// These tools use the dice formula parser with {{variable}} syntax
// Variables resolve from characterData (the new schema system)

const formulaRollTool: ToolSchema = {
  type: "function",
  function: {
    name: "formula_roll",
    description: `Roll a dice formula with optional variable substitution.

Use when:
- The adventure uses custom character sheets (characterData exists)
- You need to roll a formula like "1d20+{{STR_mod}}+{{proficiency}}"
- The DC is known and you want to check success/failure

Variables in {{double braces}} resolve from the character's data:
- {{Strength}} → stat value
- {{STR_mod}} → D&D-style modifier = floor((value-10)/2)
- {{proficiency}} → custom field value

Example formulas:
- "1d20+{{STR_mod}}+{{proficiency}}" (D&D attack)
- "2d6+{{damage_bonus}}" (damage roll)
- "1d100" (percentile check)`,
    parameters: {
      type: "object",
      properties: {
        formula: {
          type: "string",
          description:
            "Dice formula with optional {{variables}}: '1d20+{{STR_mod}}', '2d6+5', '1d100'",
        },
        dc: {
          type: "number",
          description: "Target number to beat for success (optional)",
        },
        reason: {
          type: "string",
          description: "What this roll represents",
        },
        display_name: {
          type: "string",
          description: "Optional label for UI display (e.g., 'Strength Check')",
        },
        stakes: {
          type: "string",
          enum: ["low", "medium", "high", "deadly"],
          description: "Consequence tier on failure",
        },
        consequences: {
          type: "object",
          description: "What happens on each outcome",
          properties: {
            success: { type: "string", description: "What happens on success" },
            failure: { type: "string", description: "What happens on failure" },
          },
        },
      },
      required: ["formula", "reason"],
    },
  },
};

const opposedFormulaTool: ToolSchema = {
  type: "function",
  function: {
    name: "opposed_formula",
    description: `Opposed roll using formulas. Both player and opponent roll, higher wins.

Use when:
- Player contests an NPC directly
- Both sides should roll (not just player vs static DC)
- The adventure uses custom character sheets

Player formula can use {{variables}}, opponent formula is usually fixed.

Examples:
- Player: "1d20+{{DEX_mod}}" vs Opponent: "1d20+3"
- Player: "2d6+{{Stealth}}" vs Opponent: "2d6+5"`,
    parameters: {
      type: "object",
      properties: {
        player_formula: {
          type: "string",
          description:
            "Player's dice formula with optional {{variables}}: '1d20+{{DEX_mod}}'",
        },
        opponent_formula: {
          type: "string",
          description: "Opponent's dice formula (usually fixed): '1d20+5'",
        },
        opponent_name: {
          type: "string",
          description: "NPC's name for narrative context",
        },
        reason: {
          type: "string",
          description: "What the contest is about",
        },
        display_name: {
          type: "string",
          description: "Optional label (e.g., 'Stealth vs Perception')",
        },
        stakes: {
          type: "string",
          enum: ["low", "medium", "high", "deadly"],
          description: "Consequence tier if player loses",
        },
        consequences: {
          type: "object",
          description: "What happens on each outcome",
          properties: {
            player_wins: { type: "string" },
            opponent_wins: { type: "string" },
            tie: { type: "string" },
          },
        },
      },
      required: [
        "player_formula",
        "opponent_formula",
        "opponent_name",
        "reason",
      ],
    },
  },
};

const formulaChallengeCheckTool: ToolSchema = {
  type: "function",
  function: {
    name: "formula_challenge_check",
    description: `Make a challenge check using a dice formula instead of stat lookup.

Use when:
- There's an active challenge in progress
- The adventure uses custom character sheets (characterData)
- You want to roll a formula like "1d20+{{Athletics}}"

This tool updates challenge progress (successes/failures) based on the roll result.`,
    parameters: {
      type: "object",
      properties: {
        formula: {
          type: "string",
          description:
            "Dice formula with optional {{variables}}: '1d20+{{Athletics}}'",
        },
        dc: {
          type: "number",
          description: "Target number to beat for success",
        },
        description: {
          type: "string",
          description:
            "What this specific check represents (e.g., 'Vault over the gap')",
        },
        display_name: {
          type: "string",
          description: "Optional label for UI (e.g., 'Athletics Check')",
        },
        consequences: {
          type: "object",
          description: "Specific consequences for this check",
          properties: {
            success: { type: "string" },
            failure: { type: "string" },
          },
        },
      },
      required: ["formula", "dc", "description"],
    },
  },
};

// ============================================
// ORACLE & UTILITY TOOL SCHEMAS
// ============================================

const fateQuestionTool: ToolSchema = {
  type: "function",
  function: {
    name: "fate_question",
    description: `Ask a yes/no "fate" question using the Mythic-style oracle system.

Use when:
- You need to determine an unknown fact about the world
- The player asks "Is X true?" style questions
- You need random narrative direction with weighted probability

The chaos factor (from agmtState) affects randomness. Higher chaos = more unexpected results.

LIKELIHOODS (from least to most likely):
- Impossible: Almost certainly no
- No Way: Very strong no
- Very Unlikely: Strong no
- Unlikely: Probably no
- 50/50: Equal chance (DEFAULT)
- Somewhat Likely: Leaning yes
- Likely: Probably yes
- Very Likely: Strong yes
- Near Sure Thing: Very strong yes
- A Sure Thing: Almost certainly yes
- Has To Be: Definitely yes

Results can be: Exceptional No, No, Yes, or Exceptional Yes.
Exceptional results are extreme versions - treat them dramatically.

May also trigger a Random Event (check the result).`,
    parameters: {
      type: "object",
      properties: {
        question: {
          type: "string",
          description:
            "The yes/no question to ask fate (e.g., 'Is the door locked?')",
        },
        likelihood: {
          type: "string",
          enum: [
            "Impossible",
            "No Way",
            "Very Unlikely",
            "Unlikely",
            "50/50",
            "Somewhat Likely",
            "Likely",
            "Very Likely",
            "Near Sure Thing",
            "A Sure Thing",
            "Has To Be",
          ],
          description: "How likely is a 'yes' answer? Default: 50/50",
        },
        reason: {
          type: "string",
          description: "Optional context for why this question matters",
        },
      },
      required: ["question", "likelihood"],
    },
  },
};

const rollTableTool: ToolSchema = {
  type: "function",
  function: {
    name: "roll_table",
    description: `Roll on a custom table or AGMT table for random content generation.

Use when:
- You need random content from a defined set of options
- The adventure has custom tables (weather, encounters, NPCs, etc.)
- You want weighted random selection

Tables are defined in the adventure's customTables or agmtState.tables.
Each entry has a weight - higher weight = more likely to be selected.`,
    parameters: {
      type: "object",
      properties: {
        table_name: {
          type: "string",
          description:
            "Name of the table to roll on (case-insensitive, partial match supported)",
        },
        reason: {
          type: "string",
          description: "What this roll determines in the narrative",
        },
        display_name: {
          type: "string",
          description: "Optional label for UI display (e.g., 'Weather Roll')",
        },
      },
      required: ["table_name", "reason"],
    },
  },
};

const requestContinuationTool: ToolSchema = {
  type: "function",
  function: {
    name: "request_continuation",
    description: `Request another GM stage round after seeing the current roll results.

Use when:
- You need to chain multiple rolls (attack → damage)
- The outcome of one check determines what check comes next
- You want to see roll results before deciding what to do
- Complex multi-step mechanics need sequential resolution

The GM stage will run again with the current results available.

Example flow:
1. First GM call: skill_check for attack
2. GM sees SUCCESS, calls request_continuation for damage
3. Second GM call: roll_dice for damage calculation
4. Story stage receives both attack and damage results`,
    parameters: {
      type: "object",
      properties: {
        reason: {
          type: "string",
          description:
            "Why another GM round is needed (e.g., 'Need to roll damage after successful attack')",
        },
        context: {
          type: "string",
          description:
            "What information from this round you need (e.g., 'Attack succeeded with margin +5')",
        },
        next_action: {
          type: "string",
          description:
            "What you plan to do in the next round (e.g., 'Roll 2d6+3 damage')",
        },
      },
      required: ["reason", "context"],
    },
  },
};

const askPlayerTool: ToolSchema = {
  type: "function",
  function: {
    name: "ask_player",
    description: `Pause GM processing and ask the player a question.

Use when:
- You need player input before deciding mechanics
- A choice would change what rolls are needed
- You want to give the player narrative agency mid-action
- Clarification is needed before proceeding

The player will see the question and provide an answer.
The GM stage will run again with their answer included.

Example uses:
- "Do you want to use your healing potion now, or save it?"
- "Which enemy do you focus your attack on?"
- "Do you try to negotiate or fight?"`,
    parameters: {
      type: "object",
      properties: {
        question: {
          type: "string",
          description: "The question to ask the player",
        },
        context: {
          type: "string",
          description: "Why you need this information (shown to player)",
        },
        options: {
          type: "array",
          items: { type: "string" },
          description: "Optional: Suggested answer options for the player",
        },
        allow_custom: {
          type: "boolean",
          description:
            "Whether the player can give a custom answer (default: true)",
        },
      },
      required: ["question", "context"],
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
  // Formula-based tools (for custom character schemas)
  formulaRollTool,
  opposedFormulaTool,
  formulaChallengeCheckTool,
  // Oracle & utility tools
  fateQuestionTool,
  rollTableTool,
  requestContinuationTool,
  askPlayerTool,
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
