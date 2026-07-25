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
  // Two of the PbtA "seven dimensions of hardness", independent of `stakes`:
  // a consequence can be low-stakes but still land on a loved one, or
  // high-stakes without forcing a dilemma. Optional, additive - omit for
  // an ordinary consequence landing squarely on the character themselves.
  target?: "self" | "someone_they_love" | "someone_present";
  forces_choice?: boolean; // Present failure as a dilemma between two costs, not one flat cost
  consequences?: {
    success?: string;
    failure?: string;
  };
  // Name of the stat/resource this roll's flat modifier is claimed to be
  // derived from (e.g. "Strength", "Stamina"). Optional; when it matches a
  // structured storyData.stats/resources entry, the executor cross-checks
  // the claimed modifier against that value as an integrity check (H8).
  stat_name?: string;
}

/**
 * Manual dice mode: ask the player to roll physical dice and enter the
 * result. Only offered when storyData.diceMode === "manual". The frontend
 * pauses the GM loop, shows a roll prompt, and returns the number the
 * player typed in.
 */
export interface AskForRollParams {
  title: string; // Short label, e.g. "Perception Check"
  description: string; // What's happening / why this roll matters
  player_name?: string; // Which player should roll (couch co-op)
  formula?: string; // What to roll, e.g. "1d20+3" (GM pre-computes modifiers)
  dc?: number; // Optional target number to compare the entered total against
  reverse_dc?: boolean; // If true, success = roll ≤ DC (roll-under systems)
}

/**
 * Pure numeric DC check: the player already reported a total (typed, said
 * out loud, or volunteered in freeform narration - "I rolled 17, plus 3 is
 * 20") and the GM needs a deterministic success/failure verdict instead of
 * judging the number itself. Does not roll any dice.
 */
export interface CheckDCParams {
  total: number; // The final number to check, already computed by the GM/player
  dc: number; // Target number to compare against
  reverse_dc?: boolean; // If true, success = total ≤ DC (roll-under systems)
  reason: string; // What's being checked
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
  // See FormulaRollParams.target/forces_choice - same hardness dimensions,
  // applied to the consequence if the player loses.
  target?: "self" | "someone_they_love" | "someone_present";
  forces_choice?: boolean;
  consequences?: {
    player_wins?: string;
    opponent_wins?: string;
    tie?: string;
  };
  // Name of the stat/resource the player's flat modifier is claimed to be
  // derived from. See FormulaRollParams.stat_name (H8 integrity check).
  player_stat_name?: string;
}

/**
 * Challenge check using a formula instead of stat lookup
 * GM should look up character values and insert actual numbers
 *
 * Same optional fields as FormulaRollParams (reverse_dc, stakes, the
 * target/forces_choice hardness dimensions, stat_name) - challenges are
 * reserved for the biggest scenes by this tool's own convention, so they
 * get the same rigor as an ordinary roll instead of a stripped-down subset.
 */
export interface FormulaChallengeCheckParams {
  formula: string; // "1d20+5" (actual value)
  dc: number;
  reverse_dc?: boolean; // If true, success = roll ≤ DC (Call of Cthulhu style)
  description: string;
  display_name?: string;
  stakes?: "low" | "medium" | "high" | "deadly";
  target?: "self" | "someone_they_love" | "someone_present";
  forces_choice?: boolean;
  stat_name?: string;
  consequences?: {
    success?: string;
    failure?: string;
  };
}

/**
 * Abandon the active challenge without forcing it to a win/loss threshold -
 * for when it stops mattering narratively (enemies flee, the scene changes)
 * before either side reaches its required count. Without this, an active
 * challenge with no path to threshold stays active forever, blocking both
 * starting a new challenge and resting.
 */
export interface CancelChallengeParams {
  reason: string; // Why the challenge is being abandoned
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
 * Generate Name - roll the *constraints* for a new name, not the name itself.
 * The engine picks starting letters (steering clear of initials already in
 * play), syllable counts and seed sounds; the GM writes a name that fits.
 * See nameGenerator.ts for why the split falls this way.
 */
export interface GenerateNameParams {
  kind?: "person" | "place" | "faction" | "creature" | "object";
  parts?: number; // How many name parts to roll (1-3)
  flavor?: string; // Style hint, echoed back untouched ("Norse-ish", "corpo surname")
  starts_with?: string[]; // Per-part locked initials; omit/"?" to roll that part
  syllables?: number[]; // Per-part locked syllable counts
  reason?: string; // What's being named
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
 * Ask Question - Pause and ask the player(s) one or more questions, each
 * with predefined answer choices plus an always-available free-text
 * fallback. The game pauses until answered (or skipped); answers come back
 * in this same GM round so you can continue narrating with them.
 */
export interface AskQuestionOption {
  label: string; // Short answer label (shown bold)
  description?: string; // Optional one-line elaboration of this option
}

export interface AskQuestionItem {
  question: string; // The question text
  options: AskQuestionOption[]; // 2-4 predefined answers
  allow_custom?: boolean; // Allow a free-text answer too (default true)
  target_player_name?: string; // Couch co-op only: which player this question is directed at
}

export interface AskQuestionParams {
  questions: AskQuestionItem[]; // 1-3 questions asked together
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
 * Get Game State - Re-read the current live *volatile* state during the GM
 * turn. The state message injected at turn-start is a snapshot; once the GM
 * starts calling tools (rolling, advancing combat, ticking timers) that
 * snapshot goes stale. This lets the GM re-sync to the CURRENT state after
 * its own mutations. Deliberately volatile-only - lore/NPC notes go through
 * read_notes, memory through search_memory.
 */
export type GameStateSection =
  | "challenge"
  | "combat"
  | "timers"
  | "goals"
  | "threads";

export interface GetGameStateParams {
  // Optional filter: return only these sections. Omit for all volatile state.
  sections?: GameStateSection[];
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

/**
 * Set Reasoning Tier - GM's self-escalation request, intercepted by the
 * reasoning-tier router (reasoningTiers.ts) in generation.ts. Does not
 * mutate story state directly - the controller applies decay/cap policy
 * and swaps the model for subsequent GM stage rounds.
 */
export interface SetReasoningTierParams {
  tier: number; // 0-3, requested reasoning tier
  reason: string; // One line: why this needs more reasoning
}

/**
 * Start Game - called once, when session zero (premise/character setup)
 * wraps up and real play begins. Names the story (replacing the generic
 * "New Story" default) and optionally records the agreed premise. Also the
 * signal the reasoning-tier router uses to drop back out of the forced
 * top-tier session-zero mode (see sessionZeroActive in structs.ts).
 */
export interface StartGameParams {
  story_name: string;
  premise?: string;
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

/**
 * Reaction Check - GURPS-style deterministic disposition roll for an NPC
 * the GM hasn't necessarily added to the persistent NPC tracker (a merchant,
 * a guard, a noble met once). Rolls 3d6, applies a baseline bias plus
 * GM-declared situational modifiers, and returns a hard behavioral mandate
 * the GM must narrate the NPC as actually having - not a suggestion the
 * model can talk itself out of. Exists specifically to counteract LLM
 * sycophancy drift (RLHF-tuned helpfulness softening antagonists over a
 * long conversation) for NPCs too minor to warrant a full tracked NPC entry.
 */
export interface ReactionCheckParams {
  npc_name: string; // Name of the NPC reacting (need not exist in NPCs list)
  bias?: "hostile" | "neutral" | "favorable"; // Baseline disposition skew before the roll
  modifiers?: number; // Sum of situational/trait bonuses (charisma, reputation, prior favors, an established grudge, etc.) - GM-declared, like formula_roll's formula
  reason: string; // What's being reacted to (e.g., "player asks the guard to look the other way")
  // Force a fresh roll even if this NPC already has a cached reaction this
  // scene (see incidentalReactions in structs.ts / executeReactionCheck) -
  // use only when circumstances have genuinely changed (a bribe paid, a
  // favor delivered), not just because the player asked again.
  force_reroll?: boolean;
}

/**
 * Delegate Task - Hand off a self-contained generation/research job to a
 * separate, narrowly-scoped sub-call instead of doing it inline. Mirrors
 * how a human GM might jot "flesh this out later" and come back to it with
 * fresh focus: the sub-call gets its own small prompt and context (not the
 * full turn history), so it can spend more effort on one job without
 * bloating the main GM context. Its output is converted into ordinary
 * tools (add_npc, create_note) or a plain summary - it never writes to
 * StoryData directly.
 */
export interface DelegateTaskParams {
  task_type: "generate_npc" | "generate_location" | "research" | "web_research";
  brief: string; // What to produce, e.g. "an NPC called Bob, a dockworker who owes the player money"
  scope?: string[]; // Optional note titles to restrict sub-context to (keeps the call cheap and focused)
}

/**
 * Negotiate Price - GURPS-style structured haggling. Reduces a price
 * negotiation to a deterministic procedure instead of GM-improvised
 * economic judgment: an opposed Quick Contest (Merchant/Diplomacy/
 * Fast-Talk vs. the seller's resistance) where each point of margin of
 * success shaves a fixed percentage off the list price, bounded by the
 * seller's hard floor.
 */
export interface NegotiatePriceParams {
  item_name: string; // What's being negotiated over
  list_price: number; // Seller's asking price, AFTER you've already applied any local economic modifiers (storefront vs. warehouse, taxes, etc.) - describe those in `reason`, this tool doesn't recompute them
  player_formula: string; // Player's negotiation roll with actual numbers, e.g. "1d20+4" (Merchant/Diplomacy/Fast-Talk)
  seller_formula: string; // Seller's resistance roll with actual numbers, e.g. "1d20+3"
  seller_min_price?: number; // Seller's hard floor - the deal can never land below this
  player_target_price?: number; // Optional: what the player is explicitly asking for. If this is below seller_min_price, the negotiation fails outright before any roll - no amount of skill closes a gap neither party's parameters allow
  reason: string; // What's being negotiated and why (haggling over a sword, bribing a guard, etc.)
}

// Union type for all GM tool parameters
export type GMToolParams =
  | { name: "start_challenge"; params: StartChallengeParams }
  | { name: "cancel_challenge"; params: CancelChallengeParams }
  | { name: "calculate"; params: CalculateParams }
  | { name: "take_rest"; params: TakeRestParams }
  | { name: "formula_roll"; params: FormulaRollParams }
  | { name: "ask_for_roll"; params: AskForRollParams }
  | { name: "ask_question"; params: AskQuestionParams }
  | { name: "check_dc"; params: CheckDCParams }
  | { name: "opposed_formula"; params: OpposedFormulaParams }
  | { name: "formula_challenge_check"; params: FormulaChallengeCheckParams }
  | { name: "fate_question"; params: FateQuestionParams }
  | { name: "roll_table"; params: RollTableParams }
  | { name: "generate_name"; params: GenerateNameParams }
  | { name: "read_notes"; params: ReadNotesParams }
  | { name: "search_memory"; params: SearchMemoryParams }
  | { name: "get_game_state"; params: GetGameStateParams }
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
  | { name: "npc_reaction"; params: NPCReactionParams }
  | { name: "reaction_check"; params: ReactionCheckParams }
  | { name: "negotiate_price"; params: NegotiatePriceParams }
  | { name: "delegate_task"; params: DelegateTaskParams }
  | { name: "start_game"; params: StartGameParams };

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

const cancelChallengeTool: ToolSchema = {
  type: "function",
  function: {
    name: "cancel_challenge",
    description: `Abandon the active challenge without forcing it to a win/loss result - use when it stops mattering narratively before either side reaches its threshold (the enemies flee, the scene changes, the player disengages). Without calling this, a challenge that never reaches threshold stays active forever and blocks starting a new one or resting.`,
    parameters: {
      type: "object",
      properties: {
        reason: {
          type: "string",
          description: "Why the challenge is being abandoned",
        },
      },
      required: ["reason"],
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
    description: `Process a rest period. Handles resource recovery and ability cooldowns.

CANNOT rest during an active challenge.

Types:
- quick (~30 min): Brief recovery, small resource restore
- short (4-8 hours): Sleep, significant recovery
- long (several days): Full recovery`,
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
        target: {
          type: "string",
          enum: ["self", "someone_they_love", "someone_present"],
          description:
            "Who the failure consequence actually lands on. Independent of stakes - a low-stakes consequence landing on someone the character loves can matter more than a high-stakes one landing on the character. Omit for an ordinary consequence to the character themselves.",
        },
        forces_choice: {
          type: "boolean",
          description:
            "If true, present the failure consequence as a dilemma between two costs the player must choose between, not a single flat cost.",
        },
        consequences: {
          type: "object",
          description: "What happens on each outcome",
          properties: {
            success: { type: "string", description: "What happens on success" },
            failure: { type: "string", description: "What happens on failure" },
          },
        },
        stat_name: {
          type: "string",
          description:
            "Optional: name of the stat/resource this formula's flat modifier comes from (e.g. 'Strength'). If it matches a tracked stat/resource, the modifier is cross-checked against it as an integrity check. Omit for narrative-only or character_sheet-lore-based adventures with no tracked stats/resources.",
        },
      },
      required: ["formula", "reason"],
    },
  },
};

const askForRollTool: ToolSchema = {
  type: "function",
  function: {
    name: "ask_for_roll",
    description: `Ask the player to roll REAL dice at the table and enter their result. Only available in Manual Dice Mode.

Use this INSTEAD of formula_roll whenever a player character makes a roll:
- Tell them exactly what to roll in \`formula\` (look up their modifiers yourself, e.g. "1d20+3")
- The game pauses until the player types in their total
- The entered total is compared against \`dc\` if you provide one

Do NOT use this for NPC/enemy/secret rolls - roll those yourself with formula_roll or npc_roll instead.`,
    parameters: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description: "Short label for the roll (e.g., 'Perception Check', 'Attack Roll')",
        },
        description: {
          type: "string",
          description:
            "What's happening and what's at stake, shown to the player (1-2 sentences)",
        },
        player_name: {
          type: "string",
          description:
            "Name of the player who should roll (important in co-op so the right person rolls)",
        },
        formula: {
          type: "string",
          description:
            "What to roll, with modifiers pre-computed: '1d20+5', '2d6+3', '1d100'",
        },
        dc: {
          type: "number",
          description: "Target number to compare the entered total against (optional)",
        },
        reverse_dc: {
          type: "boolean",
          description:
            "If true, success = total ≤ DC (Call of Cthulhu/BRP roll-under). Default: false (total ≥ DC)",
        },
      },
      required: ["title", "description"],
    },
  },
};

const askQuestionTool: ToolSchema = {
  type: "function",
  function: {
    name: "ask_question",
    description: `Pause and ask the player(s) one or more questions with predefined answer choices (the player can also always type/say something else instead). Use for meaningful decisions where a clear set of choices helps - which path to take, how to react to an NPC, a name or detail you need from them. Don't use this for every input; the player can already type freely at any time, so reserve it for moments where offering concrete options adds value.

You can ask up to 3 questions in one call (e.g. two independent decisions at once). In couch co-op, set \`target_player_name\` on a question to direct it at a specific player by name - the UI will show who it's for, though anyone at the table can still answer.`,
    parameters: {
      type: "object",
      properties: {
        questions: {
          type: "array",
          minItems: 1,
          maxItems: 3,
          items: {
            type: "object",
            properties: {
              question: {
                type: "string",
                description: "The question text shown to the player",
              },
              options: {
                type: "array",
                minItems: 2,
                maxItems: 4,
                items: {
                  type: "object",
                  properties: {
                    label: {
                      type: "string",
                      description: "Short answer label (shown bold)",
                    },
                    description: {
                      type: "string",
                      description:
                        "Optional one-line elaboration of what picking this means",
                    },
                  },
                  required: ["label"],
                },
                description: "2-4 predefined answers",
              },
              allow_custom: {
                type: "boolean",
                description:
                  "Whether to also offer a free-text 'type something else' answer (default true)",
              },
              target_player_name: {
                type: "string",
                description:
                  "Couch co-op only: name of the player this question is directed at",
              },
            },
            required: ["question", "options"],
          },
        },
      },
      required: ["questions"],
    },
  },
};

const checkDCTool: ToolSchema = {
  type: "function",
  function: {
    name: "check_dc",
    description: `Check a total the player already reported against a DC. Pure number comparison - does NOT roll any dice.

Use this whenever a player tells you their roll result in freeform text or voice instead of you rolling for them, e.g. they say "I rolled a 17, plus my +3 that's 20." Do the addition yourself if they gave you the pieces, then call this tool with the final total - do NOT judge success/failure yourself in narration, let this tool resolve it deterministically.

Do NOT use this to roll dice - use formula_roll or npc_roll for that. Only use this to check a number that's already been rolled.`,
    parameters: {
      type: "object",
      properties: {
        total: {
          type: "number",
          description:
            "The final number to check, after any modifiers (compute the arithmetic yourself if the player only gave you the pieces)",
        },
        dc: {
          type: "number",
          description: "Target number to compare the total against",
        },
        reverse_dc: {
          type: "boolean",
          description:
            "If true, success = total ≤ DC (Call of Cthulhu/BRP roll-under). Default: false (total ≥ DC)",
        },
        reason: {
          type: "string",
          description: "What's being checked",
        },
      },
      required: ["total", "dc", "reason"],
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
        target: {
          type: "string",
          enum: ["self", "someone_they_love", "someone_present"],
          description:
            "Who the losing consequence actually lands on, independent of stakes. Omit for an ordinary consequence to the character themselves.",
        },
        forces_choice: {
          type: "boolean",
          description:
            "If true, present the losing consequence as a dilemma between two costs, not a single flat cost.",
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
        player_stat_name: {
          type: "string",
          description:
            "Optional: name of the stat/resource the player's flat modifier comes from. Cross-checked against tracked stats/resources as an integrity check, same as formula_roll's stat_name.",
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
        reverse_dc: {
          type: "boolean",
          description:
            "If true, success = roll ≤ DC (Call of Cthulhu/BRP style roll-under). Default: false (roll ≥ DC)",
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
        stakes: {
          type: "string",
          enum: ["low", "medium", "high", "deadly"],
          description:
            "Consequence tier on failure. Challenges are reserved for the biggest scenes - most challenge checks should be at least 'high'.",
        },
        target: {
          type: "string",
          enum: ["self", "someone_they_love", "someone_present"],
          description:
            "Who the failure consequence actually lands on. Independent of stakes. Omit for an ordinary consequence to the character themselves.",
        },
        forces_choice: {
          type: "boolean",
          description:
            "If true, present the failure consequence as a dilemma between two costs the player must choose between, not a single flat cost.",
        },
        stat_name: {
          type: "string",
          description:
            "Optional: name of the stat/resource this formula's flat modifier comes from. If it matches a tracked stat/resource, the modifier is cross-checked against it as an integrity check.",
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
    description: `Ask a yes/no "fate" question using the Mythic-style oracle system. This is your primary tool for anything about the world you don't already know - reach for it often, several times a scene is normal.

Use when (any of these, not just the dramatic ones):
- Any unknown fact about the world: is the door locked, is anyone else in the room, does this shop stock what they want, has the body been found yet
- Any hidden NPC state you haven't established: did the guard notice, does she believe the lie, is he actually working for them, will they take the deal
- Any "does the bad thing happen" beat: does the rope hold, do reinforcements arrive, is the trail still fresh
- The player asks "Is X true?" about something you haven't already decided
- You need random narrative direction with weighted probability

You should NOT use it for things already established in your notes, the character sheet, or earlier narration - look those up instead. Everything else that's genuinely open is fair game.

The chaos factor (from agmtState) affects randomness. Higher chaos = more unexpected results.

LIKELIHOODS (from least to most likely) - pick the one you honestly believe, don't fall back on 50/50 out of habit:
- Impossible: Almost certainly no
- No Way: Very strong no
- Very Unlikely: Strong no
- Unlikely: Probably no
- 50/50: Equal chance
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
          description:
            "How likely is a 'yes' answer, in your honest estimate given what's already established? Pick the rung that actually matches - 50/50 is for genuinely even odds, not a fallback.",
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
    description: `Roll on a custom table or built-in AGMT table for random content generation. Use it freely - any time you're about to invent open-ended detail, roll for it instead of going with the first idea that comes to mind.

Use when (any of these, not just the dramatic ones):
- You're inventing open-ended content: loot, an encounter, a rumor, weather, a complication, a plot twist, what a room contains
- You're fleshing out a new NPC (appearance, personality, background, motivation) or a new location
- You need a detail and your first instinct feels familiar - that's exactly the reflex this tool exists to break
- The adventure has custom tables (weather, encounters, NPCs, etc.)
- You want to use built-in element tables for inspiration

Reserve improvising for when no table fits. A rolled result you have to work with produces a stranger, more alive world than one you picked because it was convenient.

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

const generateNameTool: ToolSchema = {
  type: "function",
  function: {
    name: "generate_name",
    description: `Roll pointers for a name you're about to invent - a starting letter, a syllable count and a few seed sounds per part. You write the actual name from those pointers.

Use when:
- You're naming a new NPC, place, faction, creature, ship, weapon, inn, etc.
- Any time you're about to reach for a name and the first one that comes to mind feels familiar (Elara, Kael, Lyra, Thorne, Ravenwood...) - that's the reflex this tool exists to break

How it works:
- The engine rolls a starting letter per part, steering AWAY from letters already used by NPCs, locations and notes in this story, so the cast doesn't fill up with names that all start with the same few letters.
- It also rolls how many syllables each part should have, plus seed sounds as raw inspiration.
- The starting letters and syllable counts are BINDING - the name you write must match them. The seed sounds are NOT: reshape them freely so the name fits this world's language, culture and tone. "N, 3 syllables, sounds like ni-kor-las" can become Nicolas, Nikolai, Nemora or Ni'Khalas - whatever suits the setting.

Parameters:
- Use \`parts: 2\` for a given + family name, \`parts: 3\` when they'd have a middle name too, \`parts: 1\` for mononyms and most places/factions.
- Use \`flavor\` to say what register the name should sit in ("Norse-ish", "Japanese", "corpo surname", "orcish", "backwater village") - it's passed back to you, it doesn't change the roll.
- Use \`starts_with\` only when a letter genuinely must be fixed (this NPC is the brother of Nicolas; this dwarf clan all use V). Locked letters skip the avoidance check. Leave it out otherwise and let the roll surprise you.`,
    parameters: {
      type: "object",
      properties: {
        kind: {
          type: "string",
          enum: ["person", "place", "faction", "creature", "object"],
          description: "What's being named (default: person)",
        },
        parts: {
          type: "number",
          description:
            "How many parts the name has, 1-3 (default: 2 for a person, 1 otherwise)",
        },
        flavor: {
          type: "string",
          description:
            "Style/culture hint for the name, echoed back to you unchanged (e.g. 'Norse-ish', 'corpo surname')",
        },
        starts_with: {
          type: "array",
          items: { type: "string" },
          description:
            "Optional locked starting letters, one per part in order. Use '?' or omit an entry to let the engine roll that part.",
        },
        syllables: {
          type: "array",
          items: { type: "number" },
          description:
            "Optional locked syllable counts (1-4), one per part in order. Omit to let the engine roll them.",
        },
        reason: {
          type: "string",
          description:
            "What this name is for (e.g. 'the innkeeper who just spoke up')",
        },
      },
      required: [],
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

const setReasoningTierTool: ToolSchema = {
  type: "function",
  function: {
    name: "set_reasoning_tier",
    description:
      "Request that the NEXT reasoning step run at a higher brain-power tier. Use only when the current task genuinely exceeds your ability (complex multi-entity adjudication, tricky rules interaction, pivotal plot decision). Do not use for ordinary narration.",
    parameters: {
      type: "object",
      properties: {
        tier: {
          type: "integer",
          minimum: 0,
          maximum: 3,
          description: "Requested reasoning tier (0 = lightest, 3 = heaviest).",
        },
        reason: {
          type: "string",
          description: "One line: why this needs more reasoning.",
        },
      },
      required: ["tier", "reason"],
    },
  },
};

const startGameTool: ToolSchema = {
  type: "function",
  function: {
    name: "start_game",
    description: `Call this ONCE, when session zero (premise-building, character creation, setting/tone discussion) is done and real play is about to begin.

This names the story - replacing the generic placeholder it starts with - and hands off from session zero into the game proper. Do not call this while you're still working out premise/character details with the player; call it right when you're about to narrate the opening scene.`,
    parameters: {
      type: "object",
      properties: {
        story_name: {
          type: "string",
          description:
            "A short, evocative title for this story (e.g. 'Ashes of the Ninth Legion'), based on the premise and setting agreed during session zero.",
        },
        premise: {
          type: "string",
          description:
            "Optional: a 1-3 sentence summary of the agreed premise/setup, for the story's records.",
        },
      },
      required: ["story_name"],
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

const getGameStateTool: ToolSchema = {
  type: "function",
  function: {
    name: "get_game_state",
    description: `Re-read the CURRENT live volatile game state during your turn.

The game state shown at the start of your turn is a snapshot. Once you start
calling tools that change state - resolving a challenge check, advancing a
combat turn, ticking a timer, completing a goal - that snapshot is stale. Call
this to see the state as it actually is RIGHT NOW, after your own changes.

Returns only fast-changing ("volatile") state:
- Active challenge: success/failure counts vs. what's needed to win/lose
- Combat: round, whose turn it is, and each combatant's stats/conditions
- Timers: remaining ticks and status
- Goals: active, unfinished objectives
- Threads: open plotlines

WHEN TO USE:
- Mid-combat, to confirm a combatant's current HP/conditions before deciding
- After several rolls in a challenge, to check if it's now won or lost
- Before narrating, to make sure you're describing the real current state

For lore/NPC/location notes use read_notes; for past events use search_memory.
This tool does NOT return those - only the live volatile state above.

Example: get_game_state({}) for everything, or
get_game_state({ sections: ["combat"] }) for just combat.`,
    parameters: {
      type: "object",
      properties: {
        sections: {
          type: "array",
          items: {
            type: "string",
            enum: ["challenge", "combat", "timers", "goals", "threads"],
          },
          description:
            "Optional. Return only these sections. Omit to get all volatile state.",
        },
      },
      required: [],
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

Similar to formula_roll but specifically for NPCs. Rolls are always
resolved silently - never shown to the player as an animation.

NOT for the player's own combatant, even on their turn in the initiative
order - use formula_roll for anything the player character does, in or out
of combat, so it's rolled visibly. Calling this on the player's combatant
is rejected.

The roll result is returned and logged to combat log.
Use update_combatant_stat to apply damage after calculating.

Only valid for the combatant whose turn it currently is - call advance_turn
first if it's someone else's turn. (This doesn't restrict which combatant
update_combatant_stat targets - damage/effects still apply to whichever
combatant the action affects, e.g. the player being hit on the goblin's turn.)

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
- Relationship with player changes
- New information is revealed about them
- Their role in the story evolves

Only provide fields you want to change.

Attitude moves at most 2 steps per call along hostile -> unfriendly ->
neutral -> friendly -> allied (e.g. hostile to friendly in one call is
rejected and capped to neutral) - a single dramatic moment can shift
things a lot, but fully flipping a relationship takes more than one call.`,
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

const reactionCheckTool: ToolSchema = {
  type: "function",
  function: {
    name: "reaction_check",
    description: `Roll a deterministic disposition check for an NPC (GURPS Reaction Table style).

Use this for INCIDENTAL NPCs - a merchant, guard, noble, or stranger the
player is dealing with, especially for the first time - where you need an
externally-imposed, non-negotiable read on how they feel about the player
RIGHT NOW. This is not for NPCs already tracked with an "attitude" in the
NPCs list (use update_npc/npc_reaction for those) - it's for everyone else,
and specifically for moments where the player is trying to talk, bribe, or
charm their way past someone.

WHY THIS EXISTS: left to your own judgment, you will tend to soften
antagonists and let players talk their way past resistance, because you're
tuned to be helpful. This tool takes that decision out of your hands. Roll
it, then narrate the NPC as GENUINELY having the resulting disposition -
do not let them warm up within the same scene just because the player asked
nicely again. A bad reaction should feel bad. It can only change via another
reaction_check (a new roll, on a new attempt, with new circumstances) or a
clear in-fiction reason (a bribe paid, a favor delivered, a persuasive
formula_roll that specifically targets changing their mind).

Rolls 3d6, applies the chosen baseline bias, adds any modifiers you declare
(charisma, reputation, an established grudge, local politics - be honest
about what actually applies), and returns a category from Disastrous to
Excellent with a specific behavioral mandate. Treat that mandate as a hard
constraint on what you narrate next, the same way you treat a failed
formula_roll.

If you call this again for the SAME named NPC later in the SAME scene, you
get back the SAME cached result instead of a fresh roll - this is
intentional, so the player can't wear an NPC down by asking the same thing
repeatedly. Only pass force_reroll: true when circumstances have genuinely
changed (a bribe paid, a favor delivered, new leverage) - not just because
the player tried again.

Examples:
- { npc_name: "the gate guard", bias: "neutral", modifiers: 2, reason: "player tries to talk their way past the checkpoint" }
- { npc_name: "Duke Ashford", bias: "hostile", modifiers: -3, reason: "player, a known thief, requests an audience" }`,
    parameters: {
      type: "object",
      properties: {
        npc_name: {
          type: "string",
          description:
            "Name of the NPC reacting (doesn't need to exist in the NPCs list)",
        },
        bias: {
          type: "string",
          enum: ["hostile", "neutral", "favorable"],
          description:
            "Baseline disposition before the roll - hostile for enemies/rivals, favorable for allies/friends, neutral for strangers (default: neutral)",
        },
        modifiers: {
          type: "number",
          description:
            "Sum of situational/trait modifiers you're declaring (e.g. +2 for high charisma, -3 for a known grudge, +1 for a prior favor). Be honest and specific in `reason`.",
        },
        reason: {
          type: "string",
          description:
            "What's being reacted to, in enough detail to justify your modifiers",
        },
        force_reroll: {
          type: "boolean",
          description:
            "Force a fresh roll even if this NPC already has a cached reaction this scene. Only use when circumstances have genuinely changed - a bribe, a favor, new leverage - not because the player just asked again.",
        },
      },
      required: ["npc_name", "reason"],
    },
  },
};

const negotiatePriceTool: ToolSchema = {
  type: "function",
  function: {
    name: "negotiate_price",
    description: `Resolve a price negotiation deterministically (GURPS-style haggling).

Use this instead of improvising a discount whenever the player is
haggling, bribing, or trying to talk down a price - buying gear from a
merchant, negotiating a bounty, bribing a guard. It reduces the whole
back-and-forth to one deterministic Quick Contest instead of you deciding
the outcome by feel.

You set the list price first, having already folded in any local economic
factors (storefront markup vs. warehouse discount, taxes, scarcity) - just
describe those in \`reason\`, this tool doesn't recompute them for you. Then
both sides roll: the player's negotiation skill (Merchant/Diplomacy/
Fast-Talk - whatever fits) against the seller's resistance. If the player
wins, each point of margin removes 10% of the price. If the player loses
or ties, the price doesn't move - the seller holds firm, it doesn't get
WORSE. If you set seller_min_price, the deal can never land below it, no
matter how good the roll. If you also set player_target_price and it's
already below seller_min_price, the negotiation fails outright before any
dice are rolled - some gaps no amount of skill closes.

Example:
{ item_name: "steel longsword", list_price: 150, player_formula: "1d20+5", seller_formula: "1d20+3", seller_min_price: 100, reason: "player haggles with the blacksmith over a used but well-maintained sword" }`,
    parameters: {
      type: "object",
      properties: {
        item_name: {
          type: "string",
          description: "What's being negotiated over",
        },
        list_price: {
          type: "number",
          description:
            "Seller's asking price, AFTER you've already applied any local economic modifiers - describe those in `reason`",
        },
        player_formula: {
          type: "string",
          description:
            "Player's negotiation roll with actual numbers, e.g. '1d20+4' (Merchant/Diplomacy/Fast-Talk)",
        },
        seller_formula: {
          type: "string",
          description:
            "Seller's resistance roll with actual numbers, e.g. '1d20+3'",
        },
        seller_min_price: {
          type: "number",
          description:
            "Seller's hard floor - the final price can never land below this, however good the roll",
        },
        player_target_price: {
          type: "number",
          description:
            "Optional: what the player is explicitly asking for. If this is already below seller_min_price, the negotiation fails immediately, no roll needed.",
        },
        reason: {
          type: "string",
          description:
            "What's being negotiated and why, including any economic factors already folded into list_price",
        },
      },
      required: [
        "item_name",
        "list_price",
        "player_formula",
        "seller_formula",
        "reason",
      ],
    },
  },
};

// ============================================
// DELEGATE TASK TOOL SCHEMA
// ============================================

const delegateTaskTool: ToolSchema = {
  type: "function",
  function: {
    name: "delegate_task",
    description: `Hand off a self-contained generation or research job to a separate, focused sub-call instead of doing it inline.

Use when a job is meaty enough to deserve its own undivided attention (a whole NPC, a whole location, tracking down scattered information) rather than something to improvise in passing.

task_type options:
- "generate_npc": Produces a fully fleshed-out NPC from a short brief, then registers it automatically (equivalent to add_npc, but with more thought put into who they are).
- "generate_location": Produces a detailed location writeup (layout, atmosphere, notable features/dangers) and saves it as a note automatically.
- "research": Re-reads this adventure's own notes/lore/memory and synthesizes a focused answer to a question - use for "what do we know about X" when the answer might be scattered across many notes.
- "web_research": Like research, but searches the real internet for grounding facts (how something historically/technically works) - only for real-world facts, not in-fiction content. Only available if the player has enabled Web Research and configured a search key in Settings; if not, this call will fail and you should proceed without it.

Each call costs an extra round-trip - use it for jobs worth the wait, not simple lookups (use search_notes/read_notes for those).`,
    parameters: {
      type: "object",
      properties: {
        task_type: {
          type: "string",
          enum: ["generate_npc", "generate_location", "research", "web_research"],
          description: "What kind of job to delegate",
        },
        brief: {
          type: "string",
          description:
            "What to produce or find out, in plain language, e.g. 'an NPC called Bob, a grizzled dockworker who owes the player money' or 'everything we know about the Sunken Cathedral'",
        },
        scope: {
          type: "array",
          items: { type: "string" },
          description:
            "Optional: exact titles of notes to restrict the sub-call's context to, keeping it cheap and focused. Omit to let it consider everything relevant.",
        },
      },
      required: ["task_type", "brief"],
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
  cancelChallengeTool,
  calculateTool,
  takeRestTool,
  // Formula-based tools (primary dice mechanics)
  formulaRollTool,
  askForRollTool,
  askQuestionTool,
  checkDCTool,
  opposedFormulaTool,
  formulaChallengeCheckTool,
  // Oracle & utility tools
  fateQuestionTool,
  rollTableTool,
  generateNameTool,
  // Note & memory lookup tools
  readNotesTool,
  searchMemoryTool,
  getGameStateTool,
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
  reactionCheckTool,
  negotiatePriceTool,
  // Sub-agent delegation
  delegateTaskTool,
  // Terminal tool - ends GM loop
  endGmThinkingTool,
  // Reasoning-tier self-escalation
  setReasoningTierTool,
  // Session zero -> real play handoff
  startGameTool,
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
