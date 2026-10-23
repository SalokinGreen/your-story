/**
 * GM Stage Tools - Tool definitions for the Game Master stage
 *
 * The GM stage runs before the story stage and determines:
 * - What dice rolls are needed (formula_roll, opposed_formula)
 * - Challenge management (start_challenge, record_challenge_result)
 * - Combat state management
 * - Oracle and utility tools
 *
 * The frontend executes these tools, rolls dice, and prepends results to the story stage.
 */

import { ToolSchema } from "./toolSchemas";
import type { TrackKind, TrackRank, TrackStatus } from "./structs";

// ============================================
// GM TOOL INTERFACES
// ============================================

export interface StartChallengeParams {
  name: string;
  description: string;
  // "first_to" (default): required_successes and max_failures are required.
  // "tally": rounds (2-10) is required; each result adds +1, 0 or -1.
  mode?: "first_to" | "tally";
  rounds?: number;
  required_successes?: number;
  max_failures?: number;
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

// ============================================
// FORMULA-BASED GM TOOL INTERFACES
// ============================================
// These tools use standard dice notation (no variable substitution)
// The GM should look up character values and insert actual numbers

/**
 * Roll one or more independent dice pools. The GM must calculate and insert
 * actual numeric values.
 *
 * No DC and no verdict: the tool reports what the dice showed and nothing
 * else. Whether that beats a target is arithmetic, so it goes through
 * `calculate` (which evaluates comparisons) - see the tool description for
 * why. Systems that roll dissimilar pools against each other (Starforged:
 * 1d6+mods vs 2d10) pass them as separate `formulas` entries so nothing is
 * summed across pools and every die is thrown in one handful.
 */
export interface FormulaRollParams {
  formulas: string[]; // ["1d20+5+2"], or ["1d6+2", "2d10"] for separate pools
  // Optional per-pool labels, parallel to `formulas` (e.g. ["action die",
  // "challenge dice"]). Purely for how the result reads back.
  labels?: string[];
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
}

/**
 * A roll made behind the GM's screen. Same dice as formula_roll, but the
 * player never sees it: it's always resolved digitally (never handed to the
 * physical dice tray, even in Physical Dice Mode, since asking the player to
 * throw a roll is the opposite of hiding it) and it's filtered out of the
 * player-facing tool-call log.
 *
 * This is for rolls whose *existence* is information the player shouldn't
 * have - a hidden Perception check the character would fail without knowing
 * they failed, whether an NPC's lie lands, whether the patrol notices them.
 * Rolling those openly tells the player there was something to notice.
 */
export interface GMRollParams {
  formulas: string[]; // ["1d20+3"], same shape and rules as formula_roll
  labels?: string[]; // Optional per-pool labels, parallel to `formulas`
  reason: string; // What this settles - GM-facing only, never shown to the player
  display_name?: string;
  // Why it's hidden rather than open. Recorded with the roll so the
  // reasoning survives into the log the author can inspect later.
  secret_because?: string;
}

/**
 * Manual dice mode: ask the player to roll physical dice and report what
 * they got. Only offered when storyData.diceMode === "manual". The frontend
 * pauses the GM loop, shows a roll prompt, and returns the player's answer
 * as verbatim text - "17", "4 and 6", "natural 20!" - with no number parsed
 * out of it. The GM reads the text and does any arithmetic via `calculate`.
 */
export interface AskForRollParams {
  title: string; // Short label, e.g. "Perception Check"
  description: string; // What's happening / why this roll matters
  player_name?: string; // Which player should roll (couch co-op)
  formula?: string; // What to roll, e.g. "1d20+3" (GM pre-computes modifiers)
}

/**
 * Opposed roll using formulas for both sides. GM should insert actual
 * calculated values. Example: player "1d20+4" vs opponent "1d20+5".
 *
 * Rolls both sides and reports both totals; it does NOT declare a winner.
 * "Higher total wins" is only true in some systems, and forcing it broke the
 * ones where it isn't (a 1d6 action die "losing" to 2d10 challenge dice).
 * Compare the reported totals with `calculate`.
 */
export interface OpposedFormulaParams {
  player_formula: string; // "1d20+4" (actual value)
  opponent_formula: string; // "1d20+5" (usually fixed)
  opponent_name: string;
  reason: string;
  display_name?: string;
  stakes?: "low" | "medium" | "high" | "deadly";
  // See FormulaRollParams.target/forces_choice - same hardness dimensions,
  // attached to the "player loses" branch of the consequence guidance.
  target?: "self" | "someone_they_love" | "someone_present";
  forces_choice?: boolean;
  // Planned consequences per outcome. Since the tool no longer picks a
  // winner, all branches are echoed back as guidance and the GM narrates
  // whichever one the comparison actually landed on.
  consequences?: {
    player_wins?: string;
    opponent_wins?: string;
    tie?: string;
  };
}

/**
 * Record one resolved check against the active challenge, advancing its
 * success/failure counts and closing it out when a threshold is reached.
 *
 * Deliberately does NOT roll: the GM rolls with `formula_roll`, compares with
 * `calculate`, then reports the verdict here. Rolling and adjudicating used
 * to be one `formula_challenge_check` call with its own `dc`, which meant
 * challenges only worked for systems where "beat one target number" is the
 * whole resolution.
 */
export interface RecordChallengeResultParams {
  // strong_hit / weak_hit / miss: tally challenges (+1 / 0 / -1). In a
  // first_to challenge strong_hit and weak_hit count as a success, miss as a failure.
  outcome: "success" | "failure" | "strong_hit" | "weak_hit" | "miss";
  description: string; // What this check represented, e.g. "Vault over the gap"
  // Hardness dimensions for a failure's narration - see
  // FormulaRollParams.target/forces_choice. Ignored on a success.
  target?: "self" | "someone_they_love" | "someone_present";
  forces_choice?: boolean;
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
 * Roll Portent - Prima Materia's symbolic oracle. Unlike fate_question
 * (which answers yes/no) this answers "what is actually going on here" -
 * it returns a *condition*, not an outcome. See primaMateria.ts.
 */
export interface RollPortentParams {
  mode?: "peek" | "pinch" | "portent"; // Default: portent
  question: string; // What the GM is trying to orient on
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
 * Generate Image - paint a picture of a moment, a character or a place
 * (docs/image-generation-design.md §3.1). The engine checks the per-scene cap,
 * the key and the ids before anything is spent, and the picture is made in the
 * background: the call answers at once.
 */
export interface GenerateImageParams {
  subject: "scene" | "npc" | "player" | "location";
  description: string; // What a camera would see: who, where, light, mood. <= 400 chars
  npc_id?: string; // subject "npc": whose portrait
  lore_title?: string; // subject "location": the title of the note it belongs to
  featuring?: string[]; // NPC ids, and "player", who appear in a scene picture
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
  multi_select?: boolean; // The player may pick several options (default false)
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

/**
 * Confirm Setup - show the player the finished sheet(s) and plan and wait for
 * their OK before the story starts (session zero, docs/session-zero-design.md
 * 3.5). The card's sheet and plan text come from the engine, not from here.
 */
export interface ConfirmSetupParams {
  character_summary: string; // A short summary of the character(s)
  campaign_hook: string; // The campaign's premise in a sentence or two
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
 * End Combat - Close the combat state. Lasting changes to the player go in
 * the sheet note.
 */
export interface EndCombatParams {
  outcome: "victory" | "defeat" | "fled" | "truce" | "interrupted";
  summary: string; // Summary of combat outcome for narrative
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
// METERS, PROGRESS TRACKS, SESSIONS, ACTION ROLLS
// Offered only to stories that use a system (decision 79).
// ============================================

export type ManageMeterAction =
  | "create"
  | "create_set"
  | "adjust"
  | "set"
  | "set_cap"
  | "set_floor"
  | "remove";

export interface ManageMeterParams {
  action: ManageMeterAction;
  owner: string; // character name, or "world"
  meter?: string; // every action but create_set
  set?: string; // create_set: a set name from the story's system
  by?: number; // adjust: signed integer
  value?: number; // set / set_cap / set_floor; create: start value
  min?: number; // create
  max?: number; // create
  only_up?: boolean; // create
  thresholds?: { at: number; label: string; note?: string }[]; // create
  once_per?: "scene" | "session"; // adjust only
  key?: string; // adjust with once_per: the trigger's name
  reason: string;
}

export type ManageTrackAction =
  | "create"
  | "mark"
  | "progress_roll"
  | "set_status"
  | "halve"
  | "set_rank"
  | "remove";

export interface ManageTrackParams {
  action: ManageTrackAction;
  owner: string;
  track: string;
  kind?: TrackKind; // create
  rank?: TrackRank; // create, set_rank
  times?: number; // mark, default 1
  status?: Exclude<TrackStatus, "active">; // set_status
  dice?: [number, number]; // progress_roll: faces the player reported (manual dice mode)
  reason: string;
}

export interface EndSessionParams {
  reason: string; // "Dawn over Prague"
}

export interface ActionRollParams {
  stat_name: string; // "Heart"
  stat_value: number; // from the character sheet
  adds?: number; // bonuses claimed; the engine applies at most +2
  penalty?: number; // conditions and the like, subtracted, uncapped
  move?: string; // "Face Danger"
  owner?: string; // whose roll, for the log and party play
  dice?: { action: number; challenge: [number, number] }; // manual dice mode
  stakes?: "low" | "medium" | "high" | "deadly";
  reason: string;
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
  | { name: "cancel_challenge"; params: CancelChallengeParams }
  | { name: "calculate"; params: CalculateParams }
  | { name: "formula_roll"; params: FormulaRollParams }
  | { name: "gm_roll"; params: GMRollParams }
  | { name: "ask_for_roll"; params: AskForRollParams }
  | { name: "ask_question"; params: AskQuestionParams }
  | { name: "opposed_formula"; params: OpposedFormulaParams }
  | { name: "record_challenge_result"; params: RecordChallengeResultParams }
  | { name: "fate_question"; params: FateQuestionParams }
  | { name: "roll_table"; params: RollTableParams }
  | { name: "roll_portent"; params: RollPortentParams }
  | { name: "generate_name"; params: GenerateNameParams }
  | { name: "generate_image"; params: GenerateImageParams }
  | { name: "read_notes"; params: ReadNotesParams }
  | { name: "search_memory"; params: SearchMemoryParams }
  | { name: "get_game_state"; params: GetGameStateParams }
  // Timer tool (unified create/advance/toggle_pause/cancel/trigger)
  | { name: "manage_timer"; params: ManageTimerParams }
  // System tools (meters, tracks, sessions, action rolls)
  | { name: "manage_meter"; params: ManageMeterParams }
  | { name: "manage_track"; params: ManageTrackParams }
  | { name: "end_session"; params: EndSessionParams }
  | { name: "action_roll"; params: ActionRollParams }
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
  | { name: "start_game"; params: StartGameParams }
  | { name: "confirm_setup"; params: ConfirmSetupParams };

// ============================================
// GM TOOL SCHEMAS
// ============================================

const startChallengeTool: ToolSchema = {
  type: "function",
  function: {
    name: "start_challenge",
    description: `Start a multi-roll challenge for a dangerous fight, chase or complex task. mode "first_to" (default): first to required_successes wins, max_failures loses (3 for a dangerous one, 4-5 for a boss, 6+ for an epic). mode "tally": exactly \`rounds\` results (2-10), each strong hit +1, weak hit 0, miss -1, decided by the total. Simple tasks are one formula_roll. Only one challenge can be active at a time.`,
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description:
            "Challenge name (e.g., 'Rooftop Chase')",
        },
        description: {
          type: "string",
          description: "Context and stakes",
        },
        mode: {
          type: "string",
          enum: ["first_to", "tally"],
          description: "Default first_to",
        },
        rounds: {
          type: "number",
          description: "tally: how many results the challenge takes (required)",
          minimum: 2,
          maximum: 10,
        },
        required_successes: {
          type: "number",
          description: "first_to: successes to win (typically 3-6; required)",
          minimum: 2,
          maximum: 10,
        },
        max_failures: {
          type: "number",
          description:
            "first_to: failures before losing (usually equals required_successes; required)",
          minimum: 2,
          maximum: 10,
        },
        primary_stat: {
          type: "string",
          description: "Default stat for its checks",
        },
        difficulty: {
          type: "string",
          description: "Base difficulty tier",
        },
        victory_consequence: {
          type: "string",
          description: "If the player wins",
        },
        defeat_consequence: {
          type: "string",
          description: "If the player loses",
        },
      },
      required: [
        "name",
        "description",
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
    description: `Abandon the active challenge without a win or loss when it stops mattering (the enemies flee, the scene changes). A challenge left unresolved blocks starting a new one and resting.`,
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
    description: `Evaluate a math expression, optionally with dice. Also settles comparisons, and is the only place a roll becomes a verdict: '17+3 >= 15', '4+2 > 4', '38 <= 55' come back TRUE or FALSE (one comparison per call; for systems that compare against several numbers, call once per comparison). Also use it to add up a total the player reported ("I rolled a 17, plus 3") and for damage and cost arithmetic. Operators: > >= < <= == !=.`,
    parameters: {
      type: "object",
      properties: {
        expression: {
          type: "string",
          description:
            "Math expression ('20 - 4', '50 + 2d6', '100 - 1d20 + 5') or a comparison that resolves to TRUE/FALSE ('17+3 >= 15', '4+2 > 4', '38 <= 55')",
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

// ============================================
// FORMULA-BASED TOOL SCHEMAS
// ============================================
// These tools use the dice formula parser
// GM must look up character values and insert actual numbers

const formulaRollTool: ToolSchema = {
  type: "function",
  function: {
    name: "formula_roll",
    description: `Throw dice and report what they showed. It never judges the result: there is no DC. Use \`calculate\` to compare ('17+3 >= 15' gives TRUE), always as two steps. Insert the actual numeric modifiers yourself. One pool almost always: formulas ["1d20+3+2"]. Several entries only when the system rolls dissimilar dice that must not be added together (Starforged: ["1d6+2", "2d10"] with labels); each gets its own total, then compare each with \`calculate\`. Never pack independent pools into one string ("1d6+2d10").`,
    parameters: {
      type: "object",
      properties: {
        formulas: {
          type: "array",
          minItems: 1,
          items: { type: "string" },
          description:
            "One entry per independent dice pool, with actual numbers: ['1d20+5'].",
        },
        labels: {
          type: "array",
          items: { type: "string" },
          description:
            "Optional label per pool, in order",
        },
        reason: {
          type: "string",
          description: "What this roll represents",
        },
        display_name: {
          type: "string",
          description: "Optional label (e.g., 'Strength Check')",
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
            "Who the failure lands on, independent of stakes. Omit for the character themselves.",
        },
        forces_choice: {
          type: "boolean",
          description: "Present the failure as a dilemma between two costs",
        },
        consequences: {
          type: "object",
          description:
            "What happens on each outcome, decided before the dice land. Both are echoed back; narrate the one your `calculate` comparison selected.",
          properties: {
            success: { type: "string", description: "What happens on success" },
            failure: { type: "string", description: "What happens on failure" },
          },
        },
      },
      required: ["formulas", "reason"],
    },
  },
};

const gmRollTool: ToolSchema = {
  type: "function",
  function: {
    name: "gm_roll",
    description: `Same dice as \`formula_roll\`, rolled behind your screen: the player never sees that a roll happened. Use only when the player knowing a roll occurred is itself a spoiler (a hidden Perception check, an NPC's deception on the player character, whether something happens offscreen). Not for ordinary player actions (formula_roll, in the open), NPC combat (npc_roll), or to avoid scrutiny. Judges nothing: compare with \`calculate\`. Then narrate only what the character perceives; after a failed hidden check never write "you notice nothing unusual".`,
    parameters: {
      type: "object",
      properties: {
        formulas: {
          type: "array",
          minItems: 1,
          items: { type: "string" },
          description:
            "One entry per independent pool, actual numbers, as in formula_roll",
        },
        labels: {
          type: "array",
          items: { type: "string" },
          description:
            "Optional labels for each pool, parallel to `formulas`.",
        },
        reason: {
          type: "string",
          description:
            "What this roll settles (GM-facing only)",
        },
        display_name: {
          type: "string",
          description: "Optional label for the roll (e.g. 'Hidden Perception').",
        },
        secret_because: {
          type: "string",
          description:
            "What the player would learn if they saw it",
        },
      },
      required: ["formulas", "reason"],
    },
  },
};

const askForRollTool: ToolSchema = {
  type: "function",
  function: {
    name: "ask_for_roll",
    description: `Manual Dice Mode only. Ask the player to roll REAL dice and tell you what came up; use it instead of formula_roll for the player character's rolls. Give the exact formula with their modifiers worked out. The game pauses; their answer comes back as their own words ("17", "natural 20, so 23"), so work out what it means and use \`calculate\` for the arithmetic and the comparison. If the answer is unreadable, ask again in (round brackets). Not for NPC rolls (npc_roll) or secret rolls (gm_roll).`,
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
            "What's at stake, shown to the player (1-2 sentences)",
        },
        player_name: {
          type: "string",
          description:
            "Who should roll (co-op)",
        },
        formula: {
          type: "string",
          description:
            "What to roll, modifiers worked out: '1d20+5', '1d6 and 2d10'",
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
    description: `Pause and ask the player(s) up to 3 questions with predefined answers (they can always type something else). Use for meaningful decisions where concrete options help; not for every input. In couch co-op, \`target_player_name\` directs a question at one player.`,
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
                description: "The question",
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
                      description: "Short label",
                    },
                    description: {
                      type: "string",
                      description: "Optional one-line elaboration",
                    },
                  },
                  required: ["label"],
                },
                description: "2-4 predefined answers",
              },
              allow_custom: {
                type: "boolean",
                description: "Also offer a free-text answer (default true)",
              },
              multi_select: {
                type: "boolean",
                description: "Let them pick several options (default false)",
              },
              target_player_name: {
                type: "string",
                description: "Couch co-op: the player it is for",
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

// NOTE: there used to be a `check_dc` tool here for comparing a total the
// player reported against a DC. `calculate` now evaluates comparisons
// ('17+3 >= 15' → TRUE), so it was a second way to ask the same question.

const opposedFormulaTool: ToolSchema = {
  type: "function",
  function: {
    name: "opposed_formula",
    description: `Roll both sides of a direct contest at once (the player and the NPC against them) and report both totals. It declares no winner: "higher wins" only holds in some systems, so compare with \`calculate\` as the mechanics note says. Insert actual numeric modifiers yourself.`,
    parameters: {
      type: "object",
      properties: {
        player_formula: {
          type: "string",
          description: "Player's formula, actual numbers: '1d20+4'",
        },
        opponent_formula: {
          type: "string",
          description: "Opponent's formula: '1d20+5'",
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
          description: "Consequence tier if the player loses",
        },
        target: {
          type: "string",
          enum: ["self", "someone_they_love", "someone_present"],
          description:
            "Who the loss lands on, independent of stakes. Omit for the character themselves.",
        },
        forces_choice: {
          type: "boolean",
          description: "Present the loss as a dilemma between two costs",
        },
        consequences: {
          type: "object",
          description:
            "What happens on each outcome, decided before the dice land. All are echoed back; narrate the one your `calculate` comparison selected.",
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

const recordChallengeResultTool: ToolSchema = {
  type: "function",
  function: {
    name: "record_challenge_result",
    description: `Record one resolved check against the active challenge; closes it when a threshold is reached. It rolls nothing. A check is three calls: \`formula_roll\`, \`calculate\` (against the target), then this, reporting what the comparison said. Tally challenges take strong_hit, weak_hit or miss (an \`action_roll\` result); first_to takes success or failure. Use \`cancel_challenge\` if the challenge stopped mattering.`,
    parameters: {
      type: "object",
      properties: {
        outcome: {
          type: "string",
          enum: ["success", "failure", "strong_hit", "weak_hit", "miss"],
          description:
            "Which way this check went, per your `calculate` comparison or action_roll",
        },
        description: {
          type: "string",
          description:
            "What this specific check represented (e.g., 'Vault over the gap')",
        },
        target: {
          type: "string",
          enum: ["self", "someone_they_love", "someone_present"],
          description:
            "On a failure: who it lands on. Omit for the character themselves.",
        },
        forces_choice: {
          type: "boolean",
          description:
            "On a failure: present a dilemma between two costs",
        },
      },
      required: ["outcome", "description"],
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
    description: `Mythic-style yes/no oracle for anything about the world you have not established: is the door locked, did the guard notice, does the rope hold. Use it often; several a scene is normal. Not for facts already in your notes, the sheet or earlier narration. Pick the likelihood you honestly believe (50/50 only for truly even odds). The chaos factor raises the odds of unexpected results; a Random Event may trigger.
Results, best to worst: Exceptional Yes (yes, and more: swing the fiction hard); Normal Yes (plainly yes, ordinary scale, not a triumph); Yes, but (it happens at a price you must name); No, but (it doesn't happen but something is salvageable, which you must name); Normal No (plainly no, not a disaster); Exceptional No (no, and worse). Read results literally: a "but" that names nothing is just a plain yes or no.`,
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
            "Your honest estimate of a 'yes'",
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
    description: `Roll on a built-in table for open-ended content instead of taking your first idea: loot, encounters, rumours, weather, complications, NPC or location detail. This adventure's own tables are notes (type "table"): check for one first and roll it yourself with \`formula_roll\`.
Built-in tables: character_appearance, character_personality, character_background, character_motivations, character_identity, character_skills, character_traits_flaws, character_actions_combat, character_actions_general, creature_abilities, creature_descriptors, dungeon, dungeon_traps, forest, city, cavern, terrain, domicile, gods, legends, noble_house, civilization, army, magic_item, scavenging_results, plot_twists, cryptic_message, curses, visions_dreams, smells, sounds, adventure_tone, names, powers, spell_effects, mutation, alien_species, starship, undead, animal_actions.`,
    parameters: {
      type: "object",
      properties: {
        table_name: {
          type: "string",
          description:
            "Built-in table name (case-insensitive, partial match OK)",
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

const rollPortentTool: ToolSchema = {
  type: "function",
  function: {
    name: "roll_portent",
    description: `Prima Materia oracle: answers "what is actually going on here?" with a condition, not a yes/no. Use when a scene feels significant and you can't say why, you need an NPC's or faction's underlying motive, threads converge, or your first idea for a motive or theme feels familiar.
Modes: portent (default: two concepts joined by a relation, "Body over Self"), pinch (two concepts, no relation: friction), peek (one concept: a tonal nudge). Each concept has a polarity: Sol is its bright reading, Nox the shadowed reading of the same concept. A relation is celestial (they agree) or chthonic (they are at odds). The engine picks a Frame (Literal, Personal or Structural): read the result through it. A Lens Shift moves the story's tonal register; don't narrate it.
It is an input, not an instruction. Never name the dice, symbols, frame or system in narration.`,
    parameters: {
      type: "object",
      properties: {
        mode: {
          type: "string",
          enum: ["peek", "pinch", "portent"],
          description:
            "Default: portent",
        },
        question: {
          type: "string",
          description:
            "What you're orienting on, e.g. 'what is really driving the magistrate?'",
        },
      },
      required: ["question"],
    },
  },
};

const generateNameTool: ToolSchema = {
  type: "function",
  function: {
    name: "generate_name",
    description: `Roll pointers for a name you are about to invent; you write the name. Use for any new NPC, place, faction, creature or object, especially when your first idea is a familiar one (Elara, Kael, Thorne). The starting letter and syllable count per part are BINDING; the engine steers away from letters already used in this story. Seed sounds are inspiration only: reshape them to fit the world. parts: 2 for given + family name, 3 with a middle name, 1 for mononyms and most places. \`flavor\` names the register ("Norse-ish") and is echoed back; starts_with and syllables lock values only when they must be fixed.`,
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
          description: "1-3 (default: 2 for a person, else 1)",
        },
        flavor: {
          type: "string",
          description: "Style hint, echoed back (e.g. 'Norse-ish')",
        },
        starts_with: {
          type: "array",
          items: { type: "string" },
          description: "Optional locked starting letters per part; '?' lets the engine roll",
        },
        syllables: {
          type: "array",
          items: { type: "number" },
          description: "Optional locked syllable counts (1-4) per part",
        },
        reason: {
          type: "string",
          description: "What this name is for",
        },
      },
      required: [],
    },
  },
};

const generateImageTool: ToolSchema = {
  type: "function",
  function: {
    name: "generate_image",
    description: `Paint a picture for the player: a scene, an NPC's portrait, the player character's portrait, or a place. It is made in the background and appears under this turn, so the call answers at once and you never describe the picture in your prose.

Use it sparingly, at moments that matter:
- the first arrival somewhere that matters (subject "location" for a note that has no picture yet, otherwise "scene")
- an NPC's first time on screen (subject "npc")
- a reveal or a set piece (subject "scene")
Never on routine turns. The engine caps how many pictures you may make per scene and refuses the rest; the refusal tells you the limit.

Write \`description\` as what a camera would see: who is there, where, the light, the mood. The painter never reads the story, so say how each person looks and name telling traits plainly (a missing arm, a scar, grey hair). No text, captions or lettering in the picture. Keep it non-explicit: nothing sexual, and no gore beyond what a fantasy book cover would show. Under 400 characters.

- subject "scene": a moment. Put NPC ids and/or "player" in \`featuring\` for anyone who appears in it.
- subject "npc": a portrait. \`npc_id\` is required; an NPC that already has a portrait is refused.
- subject "player": a portrait of the player character, from the character sheet.
- subject "location": a place. \`lore_title\` is the exact title of the note it belongs to; a note that already has a picture is refused.`,
    parameters: {
      type: "object",
      properties: {
        subject: {
          type: "string",
          enum: ["scene", "npc", "player", "location"],
          description: "What the picture is of",
        },
        description: {
          type: "string",
          description:
            "What a camera would see: who, where, light, mood. Visual only, no text in the picture, non-explicit. Max 400 characters.",
        },
        npc_id: {
          type: "string",
          description: "subject 'npc': the id of the NPC whose portrait this is",
        },
        lore_title: {
          type: "string",
          description:
            "subject 'location': the exact title of the note this picture belongs to",
        },
        featuring: {
          type: "array",
          items: { type: "string" },
          description:
            "NPC ids, and 'player', who appear in a scene picture. Unknown ids are ignored.",
        },
      },
      required: ["subject", "description"],
    },
  },
};

const setReasoningTierTool: ToolSchema = {
  type: "function",
  function: {
    name: "set_reasoning_tier",
    description:
      `Request that the NEXT reasoning step run at a higher tier. Only when the task genuinely exceeds you (complex multi-entity adjudication, a tricky rules interaction, a pivotal plot decision), never for ordinary narration.`,
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

const confirmSetupTool: ToolSchema = {
  type: "function",
  function: {
    name: "confirm_setup",
    description: `Session zero only. Once the character sheet(s) and the Campaign Plan exist, show the player a card with both and wait for their OK or their changes. Required before start_game. Editing a sheet or the plan afterwards cancels the OK.`,
    parameters: {
      type: "object",
      properties: {
        character_summary: {
          type: "string",
          description:
            "One or two lines: name, kind, and the hook of the character (each character, if several)",
        },
        campaign_hook: {
          type: "string",
          description: "The campaign's premise in a sentence or two",
        },
      },
      required: ["character_summary", "campaign_hook"],
    },
  },
};

const startGameTool: ToolSchema = {
  type: "function",
  function: {
    name: "start_game",
    description: `Call ONCE, when session zero is done and you are about to narrate the opening scene. It names the story and hands off from session zero to real play. Requires the character sheet(s), the "Campaign Plan" gm_plan note (only its Opening Image beat detailed) and the player's OK through confirm_setup (an error otherwise). Order: character(s), Campaign Plan, confirm_setup, start_game, then the campaign intro.`,
    parameters: {
      type: "object",
      properties: {
        story_name: {
          type: "string",
          description:
            "A short, evocative title (e.g. 'Ashes of the Ninth Legion')",
        },
        premise: {
          type: "string",
          description:
            "Optional 1-3 sentence premise summary",
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
    description: `Read the full content of notes by exact title (titles are listed in your context). Read related notes together. Read before an encounter, when an NPC comes up, and before rolling against creature stats. A missing title returns "not found".`,
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
    description: `Search story memory for something that happened earlier: an NPC's name, a place visited, a past encounter, a promise. Case-insensitive, partial words match; give several patterns for related terms (["tavern", "innkeeper"]).`,
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
    description: `Re-read the CURRENT volatile state (challenge, combat, timers, goals, threads) mid-turn. The state in your context is a snapshot from the start of the turn; your own tool calls make it stale. Use it before narrating after several changes. Does not return notes (read_notes) or past events (search_memory). \`sections\` limits the output.`,
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
    description: `Start tactical combat tracking for structured, multi-round, turn-based fights where order and stat tracking matter. One at a time. Then add_combatant for everyone (initiative auto-rolls once all are added), advance_turn through rounds, and end_combat. Not for quick narrative fights (formula_roll) or single contests (opposed_formula).`,
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
    description: `Add combatants to the active combat. One: pass name/type/stats/initiative. Several: pass a \`combatants\` array (duplicate names get suffixed). Stats are free-form numbers for whatever system fits ({ HP: 30, AC: 14 }). Initiative is a number or a dice formula ("1d20+2"). Always add the player, with type "player". \`lore_ref\` links a note.`,
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Single form: unique combatant name",
        },
        type: {
          type: "string",
          enum: ["player", "ally", "enemy", "neutral"],
          description: "Single form: combatant type",
        },
        stats: {
          type: "object",
          additionalProperties: { type: "number" },
          description:
            "Single form: stat names to numbers",
        },
        initiative: {
          type: "string",
          description: "Single form: a number or dice formula",
        },
        lore_ref: {
          type: "string",
          description: "Single form: optional note title for full details",
        },
        notes: {
          type: "string",
          description: "Single form: behavior notes",
        },
        combatants: {
          type: "array",
          description: "Batch form; takes precedence over the single-form fields",
          items: {
            type: "object",
            properties: {
              name: {
                type: "string",
                description: "Combatant name",
              },
              type: {
                type: "string",
                enum: ["player", "ally", "enemy", "neutral"],
                description: "Combatant type",
              },
              stats: {
                type: "object",
                additionalProperties: { type: "number" },
                description: "Stats, e.g. { HP: 30, AC: 14 }",
              },
              initiative: {
                type: "string",
                description: "Number or dice formula",
              },
              lore_ref: {
                type: "string",
                description: "Optional note title",
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
    description: `Remove a combatant from combat (dead, fled, incapacitated, captured). If it is the player, combat usually ends: call end_combat.`,
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
    description: `Change a combatant's stat. value: a number is a delta (-8 damage, +5 healing), "=N" sets it absolutely, a dice string rolls and applies ("+2d6" adds, "1d6" subtracts). Use deltas for damage and healing.`,
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
    description: `Toggle a status condition (Stunned, Prone, On Fire...) on a combatant: adds if missing, removes if present. force_add always adds (and updates the duration); force_remove always removes. duration is in combat rounds; omit it for a permanent condition.`,
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
            "Rounds until it expires (adding only); omit for permanent",
        },
        force_add: {
          type: "boolean",
          description:
            "Add even if present (updates duration)",
        },
        force_remove: {
          type: "boolean",
          description:
            "Remove even if absent",
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
    description: `Roll for an NPC combatant (attack, damage, save), silently: the player never sees it. Only for the combatant whose turn it is (advance_turn first); never for the player's combatant, whose rolls are formula_roll. Reports the total only: compare with \`calculate\`, then apply damage with update_combatant_stat.`,
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
    description: `Advance to the next combatant after resolving the current turn. Skips inactive combatants (skip_inactive: false to include them), counts rounds, ticks down and removes expired timed conditions, and signals when everyone is inactive.`,
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
    description: `End the active combat (victory, defeat, fled, truce, interrupted). Lasting changes to the player (wounds, spent resources, gear) go in the character sheet note with edit_note. Always end it explicitly; don't let combat fade out.`,
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
    description: `Create, advance, pause/resume, cancel or trigger a countdown timer (rituals, deadlines, arriving reinforcements). Timers count down to 0, then trigger. Actions: create (name + ticks; advance it yourself with the advance action, as auto_advance does not tick yet), advance (timer, optional ticks, default 1), toggle_pause, cancel (without triggering), trigger (fire now). Several timers can run at once.`,
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
            "Timer name or ID (all but create)",
        },
        name: {
          type: "string",
          description:
            "Display name. create only.",
        },
        description: {
          type: "string",
          description: "What happens when the timer reaches 0. create only.",
        },
        ticks: {
          type: "number",
          description:
            "create: starting ticks. advance: ticks to advance (default 1).",
        },
        auto_advance: {
          type: "boolean",
          description:
            "Reserved: timers do not tick on their own yet. create only.",
        },
        visibility: {
          type: "string",
          enum: ["visible", "hidden"],
          description:
            "Default visible; hidden for secret countdowns. create only.",
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
// SYSTEM TOOL SCHEMAS (meters, tracks, sessions, action rolls)
// ============================================

const manageMeterTool: ToolSchema = {
  type: "function",
  function: {
    name: "manage_meter",
    description: `Change a named number owned by a character or "world" (Stress, Heat, a Ledger). The engine clamps to the meter's floor and cap, reports old to new, any threshold crossed and reaching the cap, and refuses a fall on an only-rises meter. Actions: create_set (owner, set: a set name from the rules), create (owner, meter, min, max, value), adjust (by, signed), set, set_cap, set_floor (value), remove. adjust may carry once_per "scene" or "session" with a key naming the trigger; a repeat is refused with no change.`,
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["create", "create_set", "adjust", "set", "set_cap", "set_floor", "remove"],
        },
        owner: { type: "string", description: 'Character name, or "world"' },
        meter: { type: "string", description: "Meter name (all but create_set)" },
        set: { type: "string", description: "create_set: the set's name" },
        by: { type: "number", description: "adjust: signed whole number" },
        value: {
          type: "number",
          description: "set / set_cap / set_floor: the number. create: the start value.",
        },
        min: { type: "number", description: "create" },
        max: { type: "number", description: "create" },
        only_up: { type: "boolean", description: "create: the value never falls" },
        thresholds: {
          type: "array",
          description: "create: labels that apply at and above a value",
          items: {
            type: "object",
            properties: {
              at: { type: "number" },
              label: { type: "string" },
              note: { type: "string" },
            },
            required: ["at", "label"],
          },
        },
        once_per: {
          type: "string",
          enum: ["scene", "session"],
          description: "adjust: allow this key once per scene or session",
        },
        key: { type: "string", description: "adjust with once_per: the trigger's name" },
        reason: { type: "string", description: "Why, in a few words" },
      },
      required: ["action", "owner", "reason"],
    },
  },
};

const manageTrackTool: ToolSchema = {
  type: "function",
  function: {
    name: "manage_track",
    description: `Keep a progress track: ten boxes of four ticks (a vow, a condition, an enemy, a journey). mark adds ticks by rank (troublesome 12, dangerous 8, formidable 4, extreme 2, epic 1; max 40). progress_roll rolls two d10 against the filled boxes; ties go to the dice; it returns strong hit, weak hit or miss and whether the dice matched. Actions: create (kind, rank), mark (times, default 1), progress_roll, set_status (fulfilled/forsaken/cleared), halve (half the boxes, rounded down), set_rank, remove.`,
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["create", "mark", "progress_roll", "set_status", "halve", "set_rank", "remove"],
        },
        owner: { type: "string", description: 'Character name, or "world"' },
        track: { type: "string", description: "Track name" },
        kind: {
          type: "string",
          enum: ["vow", "condition", "enemy", "journey", "other"],
          description: "create",
        },
        rank: {
          type: "string",
          enum: ["troublesome", "dangerous", "formidable", "extreme", "epic"],
          description: "create, set_rank",
        },
        times: { type: "number", description: "mark: how many times (default 1)" },
        status: {
          type: "string",
          enum: ["fulfilled", "forsaken", "cleared"],
          description: "set_status",
        },
        dice: {
          type: "array",
          items: { type: "number" },
          minItems: 2,
          maxItems: 2,
          description: "progress_roll: the two d10 faces the player reported (manual dice)",
        },
        reason: { type: "string", description: "Why, in a few words" },
      },
      required: ["action", "owner", "track", "reason"],
    },
  },
};

const endSessionTool: ToolSchema = {
  type: "function",
  function: {
    name: "end_session",
    description: `End the current session (one night, one sitting). Adds one to the session count, resets meters that reset at session end, clears the once-per-session keys, and returns the rules' end-of-session reminder. The rules say when to call it.`,
    parameters: {
      type: "object",
      properties: {
        reason: { type: "string", description: 'What closes the session ("Dawn over Prague")' },
      },
      required: ["reason"],
    },
  },
};

const actionRollTool: ToolSchema = {
  type: "function",
  function: {
    name: "action_roll",
    description: `Roll an action die (d6) plus a stat against two challenge dice (d10). The engine adds at most +2 for adds, subtracts penalty, caps the score at 10, and compares: the score must beat a challenge die (ties go to the dice). Two beaten is a strong hit, one a weak hit, none a miss; matching challenge dice are reported. Report that outcome; on a miss, pay the price as the rules say.`,
    parameters: {
      type: "object",
      properties: {
        stat_name: { type: "string", description: "e.g. Heart" },
        stat_value: { type: "number", description: "From the character sheet" },
        adds: { type: "number", description: "Bonuses claimed; at most +2 apply" },
        penalty: { type: "number", description: "Subtracted from the score" },
        move: { type: "string", description: "The move being made" },
        owner: { type: "string", description: "Whose roll (party play)" },
        dice: {
          type: "object",
          description: "Manual dice: the faces the player reported",
          properties: {
            action: { type: "number" },
            challenge: { type: "array", items: { type: "number" }, minItems: 2, maxItems: 2 },
          },
          required: ["action", "challenge"],
        },
        stakes: { type: "string", enum: ["low", "medium", "high", "deadly"] },
        reason: { type: "string", description: "What the roll is for" },
      },
      required: ["stat_name", "stat_value", "reason"],
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
    description: `Register a new significant NPC in the character tracker, for quick reference and reactions. Use when a character is introduced or becomes important. Give enough detail for the player to remember who they are.`,
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
            "Appearance, personality, background (2-3 sentences)",
        },
        role: {
          type: "string",
          description:
            "Their role (e.g., 'Quest Giver', 'Rival')",
        },
        status: {
          type: "string",
          enum: ["alive", "dead", "missing", "unknown", "departed"],
          description: "Current status (default: alive)",
        },
        relationship: {
          type: "string",
          description:
            "Relationship with the player, as text",
        },
        attitude: {
          type: "string",
          enum: ["hostile", "unfriendly", "neutral", "friendly", "allied"],
          description: "Disposition toward the player (default: neutral)",
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
          description: "Image URL for reactions",
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
    description: `Update an existing NPC; send only the fields that change (status, relationship, role, new information). Attitude moves at most 2 steps per call along hostile, unfriendly, neutral, friendly, allied: a larger jump is capped.`,
    parameters: {
      type: "object",
      properties: {
        npc: {
          type: "string",
          description: "NPC name or ID to update",
        },
        name: {
          type: "string",
          description: "New name (if revealed or changed)",
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
    description: `Remove an NPC from tracking when they are no longer relevant. For a dead NPC prefer update_npc with status "dead".`,
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
    description: `Show a short social-media-style reaction toast from an NPC ("Lisa liked this", "The Baron will remember this") to show relationship impact without exposition. Keep it short and punchy.`,
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
            "Reaction text (e.g., 'liked this', 'is disappointed')",
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
// DELEGATE TASK TOOL SCHEMA
// ============================================

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
  // Formula-based tools (primary dice mechanics)
  formulaRollTool,
  gmRollTool,
  askForRollTool,
  askQuestionTool,
  opposedFormulaTool,
  recordChallengeResultTool,
  // Oracle & utility tools
  fateQuestionTool,
  rollTableTool,
  rollPortentTool,
  generateNameTool,
  // Pictures (offered only when imageToolAvailable, see buildGMStagePrompt)
  generateImageTool,
  // Note & memory lookup tools
  readNotesTool,
  searchMemoryTool,
  getGameStateTool,
  // Countdown timer tool (create/advance/toggle_pause/cancel/trigger via `action`)
  manageTimerTool,
  // System tools: offered only to stories that use a system (decision 79, see buildGMStagePrompt)
  manageMeterTool,
  manageTrackTool,
  endSessionTool,
  actionRollTool,
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
  // Reasoning-tier self-escalation
  setReasoningTierTool,
  // Session zero -> real play handoff
  confirmSetupTool,
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
