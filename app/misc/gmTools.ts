/**
 * GM Stage Tools - Tool definitions for the Game Master stage
 *
 * The GM stage runs before the story stage and determines:
 * - What dice rolls are needed (formula_roll, opposed_formula)
 * - Challenge management (start_challenge, formula_challenge_check)
 * - Combat state management
 * - Oracle and utility tools
 *
 * The frontend executes these tools, rolls dice, and prepends results to the story stage.
 */

import { ToolSchema } from "./toolSchemas";

// ============================================
// GM TOOL INTERFACES
// ============================================

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

export interface CalculateParams {
  expression: string; // "20 - 4", "50 + 2d6"
  reason: string;
  display_name?: string;
}

export interface TakeRestParams {
  type: "quick" | "short" | "long";
  narrative_context?: string;
}

// ============================================
// FORMULA-BASED GM TOOL INTERFACES
// ============================================
// These tools use standard dice notation (no variable substitution)
// The GM should look up character values and insert actual numbers

/**
 * Roll a dice formula against an optional DC
 * The GM must calculate and insert actual numeric values
 * Example: "1d20+5+2" vs DC 15
 */
export interface FormulaRollParams {
  formula: string; // "1d20+5+2" (actual numbers, not variables)
  dc?: number; // Optional target number
  reverse_dc?: boolean; // If true, success = roll ≤ DC (Call of Cthulhu style)
  reason: string;
  display_name?: string;
  stakes?: "low" | "medium" | "high" | "deadly";
  consequences?: {
    success?: string;
    failure?: string;
  };
  show_to_player?: boolean; // Show dice animation to player (default true)
}

/**
 * Opposed roll using formulas for both sides
 * GM should insert actual calculated values
 * Example: player "1d20+4" vs opponent "1d20+5"
 */
export interface OpposedFormulaParams {
  player_formula: string; // "1d20+4" (actual value)
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
  show_to_player?: boolean; // Show dice animation to player (default true)
}

/**
 * Challenge check using a formula instead of stat lookup
 * GM should look up character values and insert actual numbers
 */
export interface FormulaChallengeCheckParams {
  formula: string; // "1d20+5" (actual value)
  dc: number;
  description: string;
  display_name?: string;
  consequences?: {
    success?: string;
    failure?: string;
  };
  show_to_player?: boolean; // Show dice animation to player (default true)
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

/**
 * Read Notes - Fetch note content by exact titles
 * Used by GM to read notes from World Lore and Secrets folders
 */
export interface ReadNotesParams {
  titles: string[]; // Exact titles of notes to read
}

/**
 * Search Memory - Search through story memory entries using patterns
 * Helps the GM recall past events, NPC names, locations, etc.
 */
export interface SearchMemoryParams {
  patterns: string[]; // Array of search patterns (case-insensitive substring match)
  max_results?: number; // Limit number of results (default: 10)
}

/**
 * Respond to Player - TERMINAL TOOL that ends the GM stage loop
 * Called when all mechanics are resolved and ready to narrate
 */
export interface RespondToPlayerParams {
  summary: string; // Summary of all mechanical results for the story stage
  outcome: "success" | "failure" | "mixed" | "neutral"; // Overall outcome
  narrative_hints?: string; // Optional guidance for the story stage
  dramatic_moment?: boolean; // Mark as particularly dramatic (affects narration style)
}

// ============================================
// COMBAT SYSTEM INTERFACES
// ============================================

/**
 * Start Combat - Initialize tactical combat with combatants
 * Only one combat can be active at a time
 */
export interface StartCombatParams {
  name: string; // Combat name (e.g., "Ambush at the Bridge")
  description?: string; // Situational context
}

/**
 * Add Combatant - Add a combatant to the active combat
 * Stats are completely custom (system-dependent)
 */
export interface AddCombatantParams {
  name: string; // Combatant name (e.g., "Goblin Warrior", "Player")
  type: "player" | "ally" | "enemy" | "neutral";
  stats: Record<string, number>; // Custom stats: { HP: 30, AC: 14, Attack: 5 }
  initiative: string; // "1d20+2" (formula) or "10" (fixed value)
  lore_ref?: string; // Optional lore entry title for full NPC details
  notes?: string; // Behavior notes (e.g., "Cowardly - flees below 25% HP")
}

/**
 * Add Multiple Combatants - Add several combatants at once
 * Each combatant uses the same structure as AddCombatantParams
 */
export interface AddMultipleCombatantsParams {
  combatants: Array<{
    name: string;
    type: "player" | "ally" | "enemy" | "neutral";
    stats: Record<string, number>;
    initiative: string;
    lore_ref?: string;
    notes?: string;
  }>;
}

/**
 * Unified add_combatant params: either the single-combatant fields directly,
 * or a `combatants` array for adding several at once (replaces the
 * previously-separate, never-actually-exposed add_multiple_combatants tool
 * - see the dispatcher in gmExecutor.ts for which form takes precedence).
 */
export interface AddCombatantUnifiedParams {
  // Single-combatant form
  name?: string;
  type?: "player" | "ally" | "enemy" | "neutral";
  stats?: Record<string, number>;
  initiative?: string;
  lore_ref?: string;
  notes?: string;
  // Batch form
  combatants?: AddMultipleCombatantsParams["combatants"];
}

/**
 * Remove Combatant - Remove a combatant from combat
 * Use when they're dead, fled, or incapacitated
 */
export interface RemoveCombatantParams {
  combatant: string; // Name or ID of combatant to remove
  reason: "dead" | "fled" | "incapacitated" | "captured" | "other";
  narrative?: string; // Optional narrative description of what happened
}

/**
 * Update Combatant Stat - Modify a combatant's stat value
 * Can use delta (-8), absolute (=20), or dice roll (1d6)
 */
export interface UpdateCombatantStatParams {
  combatant: string; // Name or ID of combatant
  stat: string; // Stat name (e.g., "HP", "Mana", "Armor")
  value: number | string; // Delta (-8), absolute ("=20"), or dice ("1d6")
  reason?: string; // Why the stat changed (e.g., "Sword slash damage")
}

/**
 * Toggle Combatant Condition - Add or remove a status effect from a combatant
 * If condition exists, removes it. If not, adds it.
 */
export interface ToggleCombatantConditionParams {
  combatant: string; // Name or ID of combatant
  condition: string; // Condition name (e.g., "Stunned", "Prone", "Frightened")
  duration?: number; // Optional: turns until condition expires (only used when adding)
  force_add?: boolean; // Force add even if exists (updates duration)
  force_remove?: boolean; // Force remove even if doesn't exist
}

/**
 * NPC Roll - Make a roll for an NPC (attack, ability, check, etc.)
 * Similar to formula_roll but for NPCs specifically
 */
export interface NPCRollParams {
  combatant: string; // Name or ID of the NPC making the roll
  formula: string; // Dice formula: "1d20+5", "2d6+3"
  dc?: number; // Optional target number to check success
  reason: string; // What the roll is for
  target?: string; // Optional: who/what is being targeted
  show_to_player?: boolean; // Show dice animation (default: false for NPC rolls)
}

/**
 * Advance Turn - Move to the next combatant in initiative order
 * Automatically increments round when turn order completes
 */
export interface AdvanceTurnParams {
  skip_inactive?: boolean; // Skip combatants marked as inactive (default: true)
}

/**
 * End Combat - Close the combat state and sync player stats
 * Copies player combatant stats back to character resources
 */
export interface EndCombatParams {
  outcome: "victory" | "defeat" | "fled" | "truce" | "interrupted";
  summary: string; // Summary of combat outcome for narrative
  sync_player_stats?: boolean; // Copy player combatant stats to resources (default: true)
}

// ============================================
// COUNTDOWN TIMER INTERFACES
// ============================================

/**
 * Create Timer - Start a countdown timer for a deadline or timed event
 * Timers tick down automatically each GM turn (if autoAdvance is true)
 */
export interface CreateTimerParams {
  name: string; // Display name (e.g., "Ritual Completion")
  description?: string; // What happens when timer reaches 0
  ticks: number; // Starting tick count (counts down to 0)
  auto_advance?: boolean; // Decrement each GM turn? (default: true)
  visibility?: "visible" | "hidden"; // Show to player? (default: visible)
}

/**
 * Advance Timer - Manually tick a timer (use when autoAdvance is false)
 * Can also tick auto timers for "time passes quickly" effects
 */
export interface AdvanceTimerParams {
  timer: string; // Timer name or ID
  ticks?: number; // How many ticks to advance (default: 1)
}

/**
 * Toggle Timer Pause - Pause or resume a timer
 * If timer is active, pauses it. If paused, resumes it.
 */
export interface ToggleTimerPauseParams {
  timer: string; // Timer name or ID
}

/**
 * Cancel Timer - Remove a timer without triggering its effect
 */
export interface CancelTimerParams {
  timer: string; // Timer name or ID
  reason?: string; // Why the timer was cancelled
}

/**
 * Trigger Timer - Manually trigger a timer's effect early
 */
export interface TriggerTimerParams {
  timer: string; // Timer name or ID
  reason?: string; // Why the timer was triggered early
}

/**
 * Manage Timer - unified entry point covering create/advance/toggle_pause/
 * cancel/trigger (replaces the 5 separate *_timer tools). Kept as one tool
 * with an `action` discriminator instead of 5 tools since they all act on
 * the same underlying concept (a single named timer) and differ only by verb.
 */
export type ManageTimerAction =
  | "create"
  | "advance"
  | "toggle_pause"
  | "cancel"
  | "trigger";

export interface ManageTimerParams {
  action: ManageTimerAction;
  timer?: string; // Timer name or ID - required for advance/toggle_pause/cancel/trigger
  name?: string; // Display name - create only
  description?: string; // What happens at 0 - create only
  ticks?: number; // create: starting tick count. advance: how many ticks to advance (default 1)
  auto_advance?: boolean; // create only (default: true)
  visibility?: "visible" | "hidden"; // create only (default: visible)
  reason?: string; // cancel/trigger only
}

// ============================================
// NPC MANAGEMENT INTERFACES
// ============================================

/**
 * Add NPC - Register a new NPC in the story
 */
export interface AddNPCParams {
  name: string; // NPC's name
  description: string; // Who they are, appearance, personality
  role: string; // Their role (e.g., "Quest Giver", "Antagonist", "Ally")
  status?: "alive" | "dead" | "missing" | "unknown" | "departed"; // Default: alive
  relationship?: string; // Relationship with player (e.g., "Trusted friend", "Bitter rival")
  attitude?: "hostile" | "unfriendly" | "neutral" | "friendly" | "allied"; // Default: neutral
  faction?: string; // Group they belong to
  symbol?: string; // Emoji icon
  image_url?: string; // Image for reactions
}

/**
 * Update NPC - Modify an existing NPC's details
 */
export interface UpdateNPCParams {
  npc: string; // NPC name or ID to update
  name?: string; // New name
  description?: string; // Updated description
  role?: string; // Updated role
  status?: "alive" | "dead" | "missing" | "unknown" | "departed";
  relationship?: string; // Updated relationship text
  attitude?: "hostile" | "unfriendly" | "neutral" | "friendly" | "allied";
  faction?: string; // Updated faction
  last_seen?: string; // Where/when last seen
  notes?: string; // GM/player notes
}

/**
 * Remove NPC - Remove an NPC from tracking (not necessarily dead)
 */
export interface RemoveNPCParams {
  npc: string; // NPC name or ID to remove
  reason?: string; // Why they're being removed
}

/**
 * NPC Reaction - Show a social media style reaction notification
 * Use to communicate NPC emotional responses to player actions
 */
export interface NPCReactionParams {
  npc: string; // NPC name or ID
  reaction: string; // The reaction text (e.g., "liked this", "is disappointed", "gained respect")
  emoji?: string; // Optional emoji (e.g., "❤️", "😠", "🤔")
  context?: string; // What triggered the reaction (shown as subtext)
}

// Union type for all GM tool parameters
export type GMToolParams =
  | { name: "start_challenge"; params: StartChallengeParams }
  | { name: "calculate"; params: CalculateParams }
  | { name: "take_rest"; params: TakeRestParams }
  | { name: "formula_roll"; params: FormulaRollParams }
  | { name: "opposed_formula"; params: OpposedFormulaParams }
  | { name: "formula_challenge_check"; params: FormulaChallengeCheckParams }
  | { name: "fate_question"; params: FateQuestionParams }
  | { name: "roll_table"; params: RollTableParams }
  | { name: "read_notes"; params: ReadNotesParams }
  | { name: "search_memory"; params: SearchMemoryParams }
  | { name: "request_continuation"; params: RequestContinuationParams }
  | { name: "end_gm_thinking"; params: RespondToPlayerParams }
  // Timer tool (unified create/advance/toggle_pause/cancel/trigger)
  | { name: "manage_timer"; params: ManageTimerParams }
  // Combat tools
  | { name: "start_combat"; params: StartCombatParams }
  | { name: "add_combatant"; params: AddCombatantUnifiedParams }
  | { name: "remove_combatant"; params: RemoveCombatantParams }
  | { name: "update_combatant_stat"; params: UpdateCombatantStatParams }
  | {
      name: "toggle_combatant_condition";
      params: ToggleCombatantConditionParams;
    }
  | { name: "npc_roll"; params: NPCRollParams }
  | { name: "advance_turn"; params: AdvanceTurnParams }
  | { name: "end_combat"; params: EndCombatParams }
  // NPC management tools
  | { name: "add_npc"; params: AddNPCParams }
  | { name: "update_npc"; params: UpdateNPCParams }
  | { name: "remove_npc"; params: RemoveNPCParams }
  | { name: "npc_reaction"; params: NPCReactionParams };

// ============================================
// GM TOOL SCHEMAS
// ============================================

const startChallengeTool: ToolSchema = {
  type: "function",
  function: {
    name: "start_challenge",
    description: `Start a multi-roll "best of X" challenge for complex tasks.

GUIDELINES:
- Simple tasks = regular formula_roll, not a challenge
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
// These tools use the dice formula parser
// GM must look up character values and insert actual numbers

const formulaRollTool: ToolSchema = {
  type: "function",
  function: {
    name: "formula_roll",
    description: `Roll a dice formula against an optional DC.

Use when:
- The adventure uses custom character sheets (characterData exists)
- You need to roll a formula like "1d20+5+2"
- The DC is known and you want to check success/failure

YOU must look up character stats and insert the actual numeric values.
For D&D-style modifiers, calculate floor((stat-10)/2) yourself.

Example formulas:
- "1d20+3+2" (attack with +3 STR mod and +2 proficiency)
- "2d6+4" (damage with +4 bonus)
- "1d100" (percentile check)`,
    parameters: {
      type: "object",
      properties: {
        formula: {
          type: "string",
          description:
            "Dice formula with actual numbers: '1d20+5', '2d6+3', '1d100'",
        },
        dc: {
          type: "number",
          description: "Target number to beat for success (optional)",
        },
        reverse_dc: {
          type: "boolean",
          description:
            "If true, success = roll ≤ DC (Call of Cthulhu/BRP style roll-under). Default: false (roll ≥ DC)",
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
        show_to_player: {
          type: "boolean",
          description:
            "Show dice roll animation to player? Default true for player rolls. Set false for DM/enemy/hidden rolls.",
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

YOU must look up character stats and insert actual numeric values.

Examples:
- Player: "1d20+4" vs Opponent: "1d20+3"
- Player: "2d6+3" vs Opponent: "2d6+5"`,
    parameters: {
      type: "object",
      properties: {
        player_formula: {
          type: "string",
          description: "Player's dice formula with actual numbers: '1d20+4'",
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
        show_to_player: {
          type: "boolean",
          description:
            "Show dice roll animation to player? Default true for player rolls. Set false for DM/hidden rolls.",
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
- You want to roll a formula like "1d20+5"

YOU must look up character stats and insert actual numeric values.

This tool updates challenge progress (successes/failures) based on the roll result.`,
    parameters: {
      type: "object",
      properties: {
        formula: {
          type: "string",
          description: "Dice formula with actual numbers: '1d20+5'",
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
        show_to_player: {
          type: "boolean",
          description:
            "Show dice roll animation to player? Default true for player rolls. Set false for DM/hidden rolls.",
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
    description: `Roll on a custom table or built-in AGMT table for random content generation.

Use when:
- You need random content from a defined set of options
- The adventure has custom tables (weather, encounters, NPCs, etc.)
- You want to use built-in element tables for inspiration

BUILT-IN TABLES (always available):
- Character: character_appearance, character_personality, character_background, character_motivations, character_identity, character_skills, character_traits_flaws
- Combat/Action: character_actions_combat, character_actions_general, creature_abilities, creature_descriptors
- Locations: dungeon, dungeon_traps, forest, city, cavern, terrain, domicile
- World: gods, legends, noble_house, civilization, army
- Items: magic_item, scavenging_results
- Narrative: plot_twists, cryptic_message, curses, visions_dreams
- Atmosphere: smells, sounds, adventure_tone
- Other: names, powers, spell_effects, mutation, alien_species, starship, undead, animal_actions

Adventure-specific custom tables take priority over built-in tables with the same name.`,
    parameters: {
      type: "object",
      properties: {
        table_name: {
          type: "string",
          description:
            "Name of the table to roll on (case-insensitive, partial match supported, underscores or spaces OK)",
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
1. First GM call: formula_roll for attack
2. GM sees SUCCESS, calls request_continuation for damage
3. Second GM call: formula_roll for damage calculation
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

const endGmThinkingTool: ToolSchema = {
  type: "function",
  function: {
    name: "end_gm_thinking",
    description: `**TERMINAL TOOL** - Ends the GM thinking stage and hands off to the Story stage.

Call this when ALL mechanical resolution is complete and you're ready for narration.

This tool MUST be called to end the GM stage loop. Without it, the GM stage will continue.

The summary you provide becomes context for the Story stage to write the narrative.

WHEN TO CALL:
- All necessary rolls have been made
- All state changes (items, stats, conditions) have been applied
- You have a clear picture of what happened mechanically
- You're ready for the story to be narrated

DO NOT call if:
- You still need to make rolls
- You need to see results before deciding next action
- You want to ask the player something (use OOC brackets instead, then continue)`,
    parameters: {
      type: "object",
      properties: {
        summary: {
          type: "string",
          description:
            "Comprehensive summary of all mechanical results. Include: roll outcomes, damage dealt/taken, items used/gained, conditions applied, challenge progress, etc. This is what the Story stage uses to write the narrative.",
        },
        outcome: {
          type: "string",
          enum: ["success", "failure", "mixed", "neutral"],
          description:
            "Overall outcome: success (player achieved goal), failure (player failed), mixed (partial success or success with cost), neutral (no clear win/loss, e.g., roleplay or information gathering)",
        },
        narrative_hints: {
          type: "string",
          description:
            "Optional guidance for the Story stage: tone, specific details to emphasize, dramatic beats to hit, etc.",
        },
        dramatic_moment: {
          type: "boolean",
          description:
            "Mark as a particularly dramatic moment (critical hit, near-death, major revelation). Story stage will write with more gravitas.",
        },
      },
      required: ["summary", "outcome"],
    },
  },
};

const readNotesTool: ToolSchema = {
  type: "function",
  function: {
    name: "read_notes",
    description: `Read the content of one or more notes by their exact titles.

The info message shows you available notes organized by folder:
- 📁 World Lore - General world-building notes
- 🔒 Secrets - GM-only notes hidden from player

Use this tool to fetch the full content of notes you need for the current situation.

WHEN TO USE:
- Before an encounter, read relevant location/enemy notes
- When an NPC is mentioned, read their note for details
- When the player asks about something, check if there's a note about it
- Before rolling, check creature/enemy notes for their stats

TIPS:
- Read multiple related notes at once (e.g., location + enemy for a dungeon room)
- Note titles are shown in the info message - use exact titles
- If a note doesn't exist, you'll get a "not found" message

Example: read_notes({ titles: ["City of Thornwall", "The Shadow Guild"] })`,
    parameters: {
      type: "object",
      properties: {
        titles: {
          type: "array",
          items: { type: "string" },
          description:
            "Exact titles of notes to read. Use the titles shown in the info message.",
        },
      },
      required: ["titles"],
    },
  },
};

const searchMemoryTool: ToolSchema = {
  type: "function",
  function: {
    name: "search_memory",
    description: `Search through story memory entries to recall past events, NPCs, locations, or important details.

Use this when you need to remember something that happened earlier in the story.

WHEN TO USE:
- Need to recall an NPC's name, title, or relationship
- Looking for a location the player visited before
- Checking what happened in a past encounter
- Finding details about items, quests, or plot points
- Verifying consistency with established story facts

The search is case-insensitive and matches partial words.
Provide multiple patterns to search for different relevant terms.

Example patterns:
- ["tavern", "innkeeper"] - Find memories about the tavern
- ["dragon", "cave"] - Find memories about the dragon's cave
- ["merchant", "deal", "gold"] - Find memories about merchant dealings`,
    parameters: {
      type: "object",
      properties: {
        patterns: {
          type: "array",
          items: { type: "string" },
          description:
            "Search patterns to look for (case-insensitive). Use multiple patterns to find related memories.",
        },
        max_results: {
          type: "number",
          description:
            "Maximum number of matching memories to return (default: 10)",
        },
      },
      required: ["patterns"],
    },
  },
};

// ============================================
// COMBAT TOOLS
// ============================================

const startCombatTool: ToolSchema = {
  type: "function",
  function: {
    name: "start_combat",
    description: `Initialize tactical combat tracking.

Use when the story enters structured, turn-based combat.
Only one combat can be active at a time.

After starting combat:
1. Add all combatants with add_combatant
2. Initiative will be auto-rolled when all are added
3. Use advance_turn to progress through rounds
4. End with end_combat when resolved

Tactical combat is for:
- Multi-round fights with multiple participants
- Situations where turn order and positioning matter
- Encounters requiring detailed stat tracking

NOT for:
- Quick narrative fights (use formula_roll)
- Single-roll conflicts (use opposed_formula)
- Chases or non-combat challenges (use scene challenges)`,
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description:
            "Combat name (e.g., 'Ambush at the Bridge', 'Final Boss Battle')",
        },
        description: {
          type: "string",
          description:
            "Brief situational context about the combat (terrain, conditions, etc.)",
        },
      },
      required: ["name"],
    },
  },
};

const addCombatantTool: ToolSchema = {
  type: "function",
  function: {
    name: "add_combatant",
    description: `Add one or more combatants to the active combat.

For a SINGLE combatant, pass name/type/stats/initiative directly.
For MULTIPLE combatants (2+ enemies, allies, or NPCs), pass a \`combatants\` array instead - much more efficient than calling this multiple times. Duplicate names within the batch get auto-suffixed ("Goblin" -> "Goblin B").

Stats are completely custom - use whatever makes sense for the RPG system:
- D&D-style: { HP: 30, AC: 14, Attack: 5 }
- Simple: { Health: 100, Damage: 10 }
- Narrative: { Stress: 0, Composure: 3 }

Initiative can be:
- A fixed number: "10"
- A dice formula: "1d20+2"
- System-appropriate: "2d6" (PbtA), "4dF" (Fate)

For NPCs: Check if a matching lore entry exists to pull stats from.
For the Player: Use "player" type and sync their current resources as stats.

IMPORTANT: Always add the player as a combatant with type "player".
Their stats will sync back to their character resources when combat ends.

Example (batch, adding a pack of wolves):
{ combatants: [
  { name: "Alpha Wolf", type: "enemy", stats: { HP: 40, AC: 13, Attack: 6 }, initiative: "1d20+2" },
  { name: "Wolf", type: "enemy", stats: { HP: 20, AC: 12, Attack: 4 }, initiative: "1d20+2" }
]}`,
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description:
            "Single-combatant form: combatant name (must be unique in this combat)",
        },
        type: {
          type: "string",
          enum: ["player", "ally", "enemy", "neutral"],
          description:
            "Single-combatant form: type determines behavior and victory conditions",
        },
        stats: {
          type: "object",
          additionalProperties: { type: "number" },
          description:
            "Single-combatant form: custom stats object. Keys are stat names, values are numbers. e.g., { 'HP': 30, 'AC': 14 }",
        },
        initiative: {
          type: "string",
          description:
            "Single-combatant form: initiative value, fixed number ('10') or dice formula ('1d20+2')",
        },
        lore_ref: {
          type: "string",
          description:
            "Single-combatant form: optional reference to a lore entry title for full NPC details",
        },
        notes: {
          type: "string",
          description:
            "Single-combatant form: behavior notes (e.g., 'Cowardly - flees below 25% HP')",
        },
        combatants: {
          type: "array",
          description:
            "Batch form: array of combatants to add. When provided, this takes precedence over the single-combatant fields above.",
          items: {
            type: "object",
            properties: {
              name: {
                type: "string",
                description: "Combatant name (duplicates get auto-suffixed)",
              },
              type: {
                type: "string",
                enum: ["player", "ally", "enemy", "neutral"],
                description: "Combatant type",
              },
              stats: {
                type: "object",
                additionalProperties: { type: "number" },
                description: "Custom stats object { HP: 30, AC: 14 }",
              },
              initiative: {
                type: "string",
                description: "Initiative: dice formula or fixed number",
              },
              lore_ref: {
                type: "string",
                description: "Optional lore entry reference",
              },
              notes: {
                type: "string",
                description: "Optional behavior notes",
              },
            },
            required: ["name", "type", "stats", "initiative"],
          },
        },
      },
      required: [],
    },
  },
};

const removeCombatantTool: ToolSchema = {
  type: "function",
  function: {
    name: "remove_combatant",
    description: `Remove a combatant from active combat.

Use when a combatant:
- Dies or is destroyed
- Flees the combat
- Is incapacitated but not killed
- Is captured or restrained
- Otherwise can no longer participate

The combatant's final stats are logged for reference.
If removing the player, combat typically ends (use end_combat).`,
    parameters: {
      type: "object",
      properties: {
        combatant: {
          type: "string",
          description: "Name of the combatant to remove",
        },
        reason: {
          type: "string",
          enum: ["dead", "fled", "incapacitated", "captured", "other"],
          description: "Why the combatant is being removed",
        },
        narrative: {
          type: "string",
          description: "Optional narrative description of what happened",
        },
      },
      required: ["combatant", "reason"],
    },
  },
};

const updateCombatantStatTool: ToolSchema = {
  type: "function",
  function: {
    name: "update_combatant_stat",
    description: `Modify a combatant's stat value.

Value can be:
- Number: Delta change (positive or negative). e.g., -8 for damage, +5 for healing
- "=N": Set to absolute value. e.g., "=20" sets stat to exactly 20
- Dice formula: Roll and apply. e.g., "1d6" rolls and subtracts from stat, "+2d6" rolls and adds

Examples:
- { stat: "HP", value: -8 } - Deal 8 damage
- { stat: "HP", value: "+2d6" } - Heal 2d6
- { stat: "Armor", value: "=0" } - Armor destroyed
- { stat: "Stress", value: 1 } - Add 1 stress

IMPORTANT: For damage/healing, use appropriate deltas, not absolute values.
The combatant's stat cannot go below 0 unless the system allows negatives.`,
    parameters: {
      type: "object",
      properties: {
        combatant: {
          type: "string",
          description: "Name of the combatant to modify",
        },
        stat: {
          type: "string",
          description: "Stat name to modify (must exist on the combatant)",
        },
        value: {
          oneOf: [{ type: "number" }, { type: "string" }],
          description:
            "Change amount: number (delta), '=N' (absolute), or dice formula",
        },
        reason: {
          type: "string",
          description: "Why the stat changed (for combat log)",
        },
      },
      required: ["combatant", "stat", "value"],
    },
  },
};

const toggleCombatantConditionTool: ToolSchema = {
  type: "function",
  function: {
    name: "toggle_combatant_condition",
    description: `Toggle a status condition on a combatant (add if missing, remove if present).

Conditions are narrative/mechanical effects:
- Stunned, Prone, Frightened, Poisoned
- Blessed, Hasted, Invisible
- On Fire, Bleeding, Cursed

By default, toggles: adds if not present, removes if present.
Use force_add=true to always add (updates duration if exists).
Use force_remove=true to always remove.

Duration is in turns (rounds of combat). Omit for permanent conditions.`,
    parameters: {
      type: "object",
      properties: {
        combatant: {
          type: "string",
          description: "Name of the combatant",
        },
        condition: {
          type: "string",
          description: "Condition name (e.g., 'Stunned', 'Prone', 'On Fire')",
        },
        duration: {
          type: "number",
          description:
            "Optional: Turns until condition expires (only used when adding). Omit for permanent conditions.",
        },
        force_add: {
          type: "boolean",
          description:
            "Force add even if condition exists (updates duration). Default: false",
        },
        force_remove: {
          type: "boolean",
          description:
            "Force remove even if condition doesn't exist. Default: false",
        },
      },
      required: ["combatant", "condition"],
    },
  },
};

const npcRollTool: ToolSchema = {
  type: "function",
  function: {
    name: "npc_roll",
    description: `Make a roll for an NPC combatant.

Use for:
- NPC attack rolls
- NPC damage rolls
- NPC saving throws
- NPC ability checks

Similar to formula_roll but specifically for NPCs.
By default, rolls are NOT shown to the player (GM secret).
Set show_to_player: true for dramatic rolls.

The roll result is returned and logged to combat log.
Use update_combatant_stat to apply damage after calculating.

Example flow:
1. npc_roll: "1d20+5" for goblin attack vs player AC 15
2. If hit: npc_roll: "1d6+2" for goblin damage
3. update_combatant_stat: player HP -damage`,
    parameters: {
      type: "object",
      properties: {
        combatant: {
          type: "string",
          description: "Name of the NPC making the roll",
        },
        formula: {
          type: "string",
          description: "Dice formula (e.g., '1d20+5', '2d6+3')",
        },
        dc: {
          type: "number",
          description:
            "Optional target number. If provided, determines success/failure.",
        },
        reason: {
          type: "string",
          description:
            "What this roll is for (e.g., 'Attack vs Player', 'Damage roll')",
        },
        target: {
          type: "string",
          description: "Optional: Who or what is being targeted",
        },
        show_to_player: {
          type: "boolean",
          description: "Show dice animation to player (default: false)",
        },
      },
      required: ["combatant", "formula", "reason"],
    },
  },
};

const advanceTurnTool: ToolSchema = {
  type: "function",
  function: {
    name: "advance_turn",
    description: `Advance to the next combatant in initiative order.

Call this after resolving the current combatant's turn.

The tool automatically:
- Moves to the next active combatant
- Skips inactive combatants (unless skip_inactive: false)
- Increments round counter when turn order completes
- Decrements duration on timed conditions
- Removes expired conditions

Returns: The next combatant whose turn it is.

If all combatants are inactive, signals that combat should end.`,
    parameters: {
      type: "object",
      properties: {
        skip_inactive: {
          type: "boolean",
          description: "Skip combatants marked as inactive (default: true)",
        },
      },
      required: [],
    },
  },
};

const endCombatTool: ToolSchema = {
  type: "function",
  function: {
    name: "end_combat",
    description: `End the active combat and optionally sync player stats.

Call when combat concludes for any reason:
- Victory: All enemies defeated
- Defeat: Player killed or incapacitated  
- Fled: One or more parties escaped
- Truce: Combat ended through negotiation
- Interrupted: External event stopped the fight

If sync_player_stats is true (default):
- Player combatant stats are copied back to character resources
- Only stats matching resource names are synced
- HP -> Health resource, etc.

IMPORTANT: Always call this to properly close combat state.
Don't just let combat "fade out" - explicitly end it.`,
    parameters: {
      type: "object",
      properties: {
        outcome: {
          type: "string",
          enum: ["victory", "defeat", "fled", "truce", "interrupted"],
          description: "How combat ended",
        },
        summary: {
          type: "string",
          description: "Summary of what happened for the narrative",
        },
        sync_player_stats: {
          type: "boolean",
          description:
            "Copy player combatant stats back to character resources (default: true)",
        },
      },
      required: ["outcome", "summary"],
    },
  },
};

// ============================================
// COUNTDOWN TIMER TOOL SCHEMAS
// ============================================

const manageTimerTool: ToolSchema = {
  type: "function",
  function: {
    name: "manage_timer",
    description: `Create, advance, pause/resume, cancel, or trigger a countdown timer for deadlines, rituals, or timed events.

Timers count down from their starting ticks toward 0. When they hit 0, they trigger.

Use cases:
- "The ritual completes in 5 rounds" (combat pacing)
- "Reinforcements arrive in 3 turns" (tension building)
- "The bomb explodes in 10 ticks" (urgent deadline)
- "The sun sets in 2 ticks" (time passage)

Actions:
- "create": Start a new timer. Requires name + ticks. If auto_advance is true (default), it ticks down each GM turn; if false, you must manually call action "advance".
- "advance": Manually tick a timer forward. Requires timer. Optional ticks (default 1). If it would reduce currentTicks to 0 or below, the timer triggers.
- "toggle_pause": Pause an active timer, or resume a paused one. Requires timer.
- "cancel": Remove a timer without triggering its effect (e.g. player disarmed the bomb). Requires timer, optional reason.
- "trigger": Fire a timer's effect immediately regardless of remaining ticks. Requires timer, optional reason.

Multiple timers can exist simultaneously - useful for overlapping deadlines.`,
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["create", "advance", "toggle_pause", "cancel", "trigger"],
          description: "Which timer operation to perform",
        },
        timer: {
          type: "string",
          description:
            "Timer name or ID. Required for advance/toggle_pause/cancel/trigger; not used for create.",
        },
        name: {
          type: "string",
          description:
            "Timer display name (e.g., 'Ritual Completion', 'Reinforcements Arrive'). create only.",
        },
        description: {
          type: "string",
          description: "What happens when the timer reaches 0. create only.",
        },
        ticks: {
          type: "number",
          description:
            "create: starting tick count (counts down to 0). advance: how many ticks to advance (default 1).",
        },
        auto_advance: {
          type: "boolean",
          description:
            "Automatically tick down each GM turn? (default: true). create only.",
        },
        visibility: {
          type: "string",
          enum: ["visible", "hidden"],
          description:
            "Show timer to player? Use 'hidden' for secret countdowns (default: visible). create only.",
        },
        reason: {
          type: "string",
          description: "Why the timer was cancelled/triggered early. cancel/trigger only.",
        },
      },
      required: ["action"],
    },
  },
};

// ============================================
// NPC MANAGEMENT TOOL SCHEMAS
// ============================================

const addNPCTool: ToolSchema = {
  type: "function",
  function: {
    name: "add_npc",
    description: `Register a new NPC in the story's character tracker.

Use when:
- A new significant character is introduced
- A character becomes important enough to track
- Player asks about NPCs and you want to formalize tracking

NPCs are tracked separately from lore for quick reference and reactions.
Include enough detail for the player to remember who this character is.`,
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description:
            "NPC's name (e.g., 'Captain Harwick', 'The Masked Woman')",
        },
        description: {
          type: "string",
          description:
            "Who they are - appearance, personality, background (2-3 sentences)",
        },
        role: {
          type: "string",
          description:
            "Their role in the story (e.g., 'Quest Giver', 'Antagonist', 'Love Interest', 'Mentor', 'Rival')",
        },
        status: {
          type: "string",
          enum: ["alive", "dead", "missing", "unknown", "departed"],
          description: "Current status (default: alive)",
        },
        relationship: {
          type: "string",
          description:
            "Relationship with player as custom text (e.g., 'Trusted mentor', 'Bitter rival', 'Former lover', 'Suspicious ally')",
        },
        attitude: {
          type: "string",
          enum: ["hostile", "unfriendly", "neutral", "friendly", "allied"],
          description: "General disposition toward player (default: neutral)",
        },
        faction: {
          type: "string",
          description: "Group or organization they belong to",
        },
        symbol: {
          type: "string",
          description: "Emoji icon for this NPC",
        },
        image_url: {
          type: "string",
          description: "Image URL for reaction notifications",
        },
      },
      required: ["name", "description", "role"],
    },
  },
};

const updateNPCTool: ToolSchema = {
  type: "function",
  function: {
    name: "update_npc",
    description: `Update an existing NPC's details.

Use when:
- NPC's status changes (dies, goes missing, leaves)
- Relationship with player changes significantly
- New information is revealed about them
- Their role in the story evolves

Only provide fields you want to change.`,
    parameters: {
      type: "object",
      properties: {
        npc: {
          type: "string",
          description: "NPC name or ID to update",
        },
        name: {
          type: "string",
          description: "New name (if revealed/changed)",
        },
        description: {
          type: "string",
          description: "Updated description",
        },
        role: {
          type: "string",
          description: "Updated role",
        },
        status: {
          type: "string",
          enum: ["alive", "dead", "missing", "unknown", "departed"],
          description: "New status",
        },
        relationship: {
          type: "string",
          description: "Updated relationship text",
        },
        attitude: {
          type: "string",
          enum: ["hostile", "unfriendly", "neutral", "friendly", "allied"],
          description: "New disposition",
        },
        faction: {
          type: "string",
          description: "Updated faction",
        },
        last_seen: {
          type: "string",
          description: "Where/when they were last seen",
        },
        notes: {
          type: "string",
          description: "GM notes about this NPC",
        },
      },
      required: ["npc"],
    },
  },
};

const removeNPCTool: ToolSchema = {
  type: "function",
  function: {
    name: "remove_npc",
    description: `Remove an NPC from tracking.

Use when:
- NPC is no longer relevant to the story
- Character was temporary/minor
- Cleaning up the NPC list

Note: For deceased NPCs, prefer update_npc with status="dead" to preserve history.`,
    parameters: {
      type: "object",
      properties: {
        npc: {
          type: "string",
          description: "NPC name or ID to remove",
        },
        reason: {
          type: "string",
          description: "Why they're being removed from tracking",
        },
      },
      required: ["npc"],
    },
  },
};

const npcReactionTool: ToolSchema = {
  type: "function",
  function: {
    name: "npc_reaction",
    description: `Show a social-media style reaction notification from an NPC.

Creates a toast notification like "Lisa liked this 👍" or "Marcus is disappointed 😔"

Use when:
- An NPC would have a notable emotional response to player's action
- You want to show relationship impact without exposition
- Reinforcing NPC personality through reactions
- Making the world feel more alive and responsive

Keep reactions short and punchy. The notification includes the NPC's image if available.

Examples:
- { npc: "Elara", reaction: "appreciated that", emoji: "❤️" }
- { npc: "The Baron", reaction: "will remember this", emoji: "👁️" }
- { npc: "Grak", reaction: "is offended", emoji: "😤", context: "You refused his gift" }`,
    parameters: {
      type: "object",
      properties: {
        npc: {
          type: "string",
          description: "NPC name or ID (must exist in NPCs list)",
        },
        reaction: {
          type: "string",
          description:
            "The reaction text (e.g., 'liked this', 'is disappointed', 'gained respect', 'will remember this')",
        },
        emoji: {
          type: "string",
          description:
            "Optional emoji for the reaction (e.g., '❤️', '😠', '🤔', '👍')",
        },
        context: {
          type: "string",
          description:
            "Optional context shown as subtext (e.g., 'You defended her honor')",
        },
      },
      required: ["npc", "reaction"],
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
  startChallengeTool,
  calculateTool,
  takeRestTool,
  // Formula-based tools (primary dice mechanics)
  formulaRollTool,
  opposedFormulaTool,
  formulaChallengeCheckTool,
  // Oracle & utility tools
  fateQuestionTool,
  rollTableTool,
  // Note & memory lookup tools
  readNotesTool,
  searchMemoryTool,
  requestContinuationTool,
  // Countdown timer tool (create/advance/toggle_pause/cancel/trigger via `action`)
  manageTimerTool,
  // Combat tools
  startCombatTool,
  addCombatantTool,
  removeCombatantTool,
  updateCombatantStatTool,
  toggleCombatantConditionTool,
  npcRollTool,
  advanceTurnTool,
  endCombatTool,
  // NPC management tools
  addNPCTool,
  updateNPCTool,
  removeNPCTool,
  npcReactionTool,
  // Terminal tool - ends GM loop
  endGmThinkingTool,
];

/**
 * GM tool names for validation
 */
export const GM_TOOL_NAMES = GM_TOOL_SCHEMAS.map((t) => t.function.name);

/**
 * Name -> schema lookup, mirroring toolSchemas.ts's TOOL_MAP, used to
 * validate GM tool call arguments against their declared schema.
 */
export const GM_TOOL_MAP = new Map(
  GM_TOOL_SCHEMAS.map((tool) => [tool.function.name, tool])
);

/**
 * Check if a tool name is a GM tool
 */
export function isGMTool(toolName: string): boolean {
  return GM_TOOL_NAMES.includes(toolName);
}
