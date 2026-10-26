/**
 * GM Stage Executor - Frontend execution of GM tool calls
 *
 * Executes GM tool calls (formula_roll, start_challenge, etc.) on the frontend,
 * rolling dice, checking items/abilities, and returning results for the story stage.
 */

import { isHiddenFromPlayerNote } from "./noteVisibility";
import { authoredOpeningForStart } from "./presets";
import {
  StoryData,
  SceneChallenge,
  Combatant,
  CombatState,
  CountdownTimer,
  NPC,
  NPCReaction,
  NPCStatus,
  NPCAttitude,
  getMemoryContent,
  MAX_PENDING_RANDOM_EVENTS,
  PendingRandomEvent,
  LoreVisibility,
  StoryLore,
  Meter,
  ProgressTrack,
  SystemState,
  MeterSet,
  FantasticRealmsState,
  FantasticRealmsHero,
  HeroCondition,
  HeroFeat,
  ItemQuality,
} from "./structs";
import {
  FALLBACK_HERO_SET,
  HERO_SET_NAME,
  HUNGRY_CURE,
  HUNGRY_WORD,
  ITEM_QUALITIES,
  TEAM_BURNS_PER_REST,
  applyXp,
  attackDamage,
  countSuccesses,
  describeConditions,
  describeFeat,
  describeScars,
  featUsable,
  isDown,
  isSwiftItem,
  itemQualities,
  levelCost,
  normaliseFeat,
  poolSize,
  resetCountersOnState,
  resetUses,
  resultFor,
  tallyScore,
  tierWord,
  usageKey,
  type FeatTier,
  type UsePer,
} from "./systems/fantastic-realms/engine";
import {
  ACTION_ADDS_CAP,
  MeterError,
  TICKS_PER_MARK,
  actionScore,
  adjustMeter,
  createMeter,
  createMeterSet,
  createTrack,
  filledBoxes,
  findMeter,
  findTrack,
  halveTrack,
  isDuplicate,
  markProgress,
  normalizeKey,
  pruneDedupKeys,
  resolveAgainstChallengeDice,
  setMeterCap,
  setMeterFloor,
  setMeterMax,
  setMeterValue,
  type MeterChange,
  type RollOutcome,
} from "./metersAndTracks";
import { resolveSystem } from "./systems/resolve";
import { executeCampaign, makeId } from "./campaign/executor";
import {
  applyTurnEvents,
  defaultClockVisibility,
  describeTick,
  newTurnLedger,
  tickClock,
  type ClockReport,
  type TurnLedger,
} from "./campaign/clocks";
import { turnEventsFrom } from "./campaign/events";
import type { Clock } from "./campaign/types";
import { styleWarningLine } from "./campaign/styles";
import { campaignWarnings } from "./campaign/validate";
import { publicCampaignView, type PublicCampaignView } from "./campaign/publicView";
import {
  StartChallengeParams,
  CancelChallengeParams,
  CalculateParams,
  FormulaRollParams,
  GMRollParams,
  AskForRollParams,
  AskQuestionParams,
  AskQuestionItem,
  OpposedFormulaParams,
  RecordChallengeResultParams,
  FateQuestionParams,
  RollTableParams,
  RollPortentParams,
  GenerateNameParams,
  GenerateImageParams,
  ReadNotesParams,
  SearchMemoryParams,
  GetGameStateParams,
  GameStateSection,
  // Timer tools
  CreateTimerParams,
  AdvanceTimerParams,
  ToggleTimerPauseParams,
  CancelTimerParams,
  TriggerTimerParams,
  ManageTimerParams,
  CampaignParams,
  ManageMeterParams,
  ManageMeterAction,
  ManageTrackParams,
  ManageTrackAction,
  EndSessionParams,
  ActionRollParams,
  ManageFeatsParams,
  ManageFeatsAction,
  FeatRollParams,
  InitiativeRollParams,
  AwardXpParams,
  TakeRestParams,
  // Combat tools
  StartCombatParams,
  AddCombatantParams,
  AddMultipleCombatantsParams,
  AddCombatantUnifiedParams,
  RemoveCombatantParams,
  UpdateCombatantStatParams,
  ToggleCombatantConditionParams,
  NPCRollParams,
  AdvanceTurnParams,
  EndCombatParams,
  // NPC management tools
  AddNPCParams,
  UpdateNPCParams,
  RemoveNPCParams,
  NPCReactionParams,
  GM_TOOL_MAP,
  SetReasoningTierParams,
  StartGameParams,
  ConfirmSetupParams,
} from "./gmTools";
import type { ImageToolContext, ImageJobTarget } from "./imageJobs";
import { validateToolArgs, formatValidationErrors } from "./toolValidation";
import {
  semanticSearchFallback,
  SemanticSearchContext,
} from "./semanticSearchFallback";
import {
  askFate,
  FateAnswer,
  generateElement,
  generateEventFocus,
  generateEventMeaning,
  MYTHIC_TABLE_NAMES,
  ElementCategory,
  markOracleConsulted,
  ORACLE_USE_TOOL_NAMES,
} from "./mythic";
import { dieLabel, parseTableNote, rollTable, selectTable, tablePathLabel } from "./tableRoll";
import {
  currentTint,
  formatPortentForModel,
  rollPortent,
  selectFrame,
  type PortentMode,
  type PortentResult,
} from "./primaMateria";
import {
  isNameAccepted,
  newNameTurn,
  pushOffered,
  type NameCheckContext,
  type NameTurnState,
} from "./names/accept";
import { entryName, isNameStyle, rollNames } from "./names/roll";
import {
  applyTierEscalation,
  stakesFloor,
  computeSceneKey,
  SCENE_BASELINE_TIER,
} from "./reasoningTiers";
import {
  rollFormula,
  rollFormulasAsync,
  RollResult,
  DiceResolver,
  DiceGroupRequest,
  MAX_DICE_COUNT,
  MAX_DICE_SIDES,
} from "./diceFormula";
import { executeTools as executeStateTools } from "./toolExecutor";
import {
  currentSetupHashes,
  getSetupNotes,
  getSetupProgress,
  recordSetupReference,
} from "./campaignPlan";
import {
  getCreationProgress,
  getCreationSteps,
  setupParticipants,
  stepKind,
  type MissingCreationStep,
} from "./setupSteps";

// ============================================
// RESULT INTERFACES
// ============================================

/**
 * What the executor needs besides the story: the picture queue
 * (generate_image, imageJobs.ts).
 */
export interface GMToolContext {
  imageJobs?: ImageToolContext;
  // The turn's abort signal. After any awaited pause (a question, the setup
  // card, a dice request) the batch checks it: once aborted, no further tool
  // runs and the working copy is NOT committed (aborted: true on the result),
  // so Stop's restore of the pre-turn story is not overwritten by a batch
  // that finishes afterwards.
  abortSignal?: AbortSignal;
  // Who needs a character sheet during session zero, when the page knows
  // better than StoryData does (party seats). Default: couch players, else
  // one sheet (getSetupProgress).
  setupPlayers?: { id: string; name: string }[];
  // The turn's clock event ledger so far (campaign clocks tick once per
  // trigger per turn, across the GM's rounds). The batch works on a copy and
  // hands the updated one back as `turnLedger`; the caller keeps it with the
  // story it commits.
  turnLedger?: TurnLedger;
  // What the turn has said so far for the name check (names/accept.ts): notes
  // the GM made this turn (they prove nothing) and the players' words not yet
  // in the story. Carried across the turn's rounds like the ledger above.
  nameTurn?: NameTurnState;
  // The story's lore as it stood when the turn began, kept by reference (the
  // batches replace the array, never edit it): the name check reads notes from
  // here, so a note made or edited this turn proves nothing. Unset: the lore
  // this batch started with.
  turnStartLore?: readonly StoryLore[];
}

/**
 * Whether a tool result started the game: a successful start_game, or a
 * confirm_setup the player approved that the engine started in the same call
 * (`started`, set by the executor, never parsed from text).
 */
export function resultStartedGame(r: {
  toolName: string;
  success: boolean;
  result?: unknown;
}): boolean {
  if (r.toolName === "start_game") return r.success;
  if (r.toolName === "confirm_setup") {
    return (r.result as { started?: boolean } | undefined)?.started === true;
  }
  return false;
}

export interface GMToolResult {
  toolName: string;
  toolCallId: string;
  success: boolean;
  // Set by rolls made behind the GM's screen (`gm_roll`). Player-facing
  // views filter these out entirely; the GM's own context keeps them, since
  // the whole point is that the GM knows what the player doesn't.
  hiddenFromPlayer?: boolean;
  // Clock ticks this result caused (campaign clocks, see campaign/clocks.ts).
  // The GM sees their lines appended to contextForStory; the narration
  // context's public summary reads this field and drops hidden clocks.
  clockReports?: ClockReport[];
  // Lines about HIDDEN clocks this result moved. Only the GM's tool message
  // carries them (generation.ts appends them); contextForStory is what the
  // player's timeline, the saved tool log and the narrator see.
  gmOnlyContext?: string;
  result:
    | GMChallengeResult
    | GMCancelChallengeResult
    | GMCalculateResult
    | GMFormulaRollResult
    | GMHiddenRollResult
    | GMAskForRollResult
    | GMAskQuestionResult
    | GMOpposedFormulaResult
    | GMChallengeResultRecord
    | GMFateQuestionResult
    | GMRollTableResult
    | GMRollPortentResult
    | GMGenerateNameResult
    | GMGenerateImageResult
    | GMReadNotesResult
    | GMSearchMemoryResult
    | GMGetGameStateResult
    | GMSetReasoningTierResult
    | GMStartGameResult
    | GMConfirmSetupResult
    | GMStateChangeResult
    // Timer results
    | GMCreateTimerResult
    | GMAdvanceTimerResult
    | GMToggleTimerPauseResult
    | GMCancelTimerResult
    | GMTriggerTimerResult
    // Campaign
    | GMCampaignResult
    // System results
    | GMManageMeterResult
    | GMManageTrackResult
    | GMEndSessionResult
    | GMActionRollResult
    | GMManageFeatsResult
    | GMFeatRollResult
    | GMInitiativeRollResult
    | GMAwardXpResult
    | GMTakeRestResult
    // Combat results
    | GMStartCombatResult
    | GMAddCombatantResult
    | GMAddMultipleCombatantsResult
    | GMRemoveCombatantResult
    | GMUpdateCombatantStatResult
    | GMToggleCombatantConditionResult
    | GMNPCRollResult
    | GMAdvanceTurnResult
    | GMEndCombatResult
    // NPC management results
    | GMAddNPCResult
    | GMUpdateNPCResult
    | GMRemoveNPCResult
    | GMNPCReactionResult
;
  contextForStory: string; // Formatted bracket notation for story stage
}

export interface GMCampaignResult {
  type: "campaign";
  action: string;
  part?: string;
  id?: string;
  message: string;
}

export interface GMStateChangeResult {
  type: "state_change";
  message: string;
  command: string;
}

export interface GMChallengeResult {
  type: "start_challenge";
  name: string;
  description: string;
  mode?: "first_to" | "tally";
  rounds?: number;
  requiredSuccesses?: number;
  maxFailures?: number;
  primaryStat: string;
  difficulty: string;
  victoryConsequence?: string;
  defeatConsequence?: string;
}

export interface GMCancelChallengeResult {
  type: "cancel_challenge";
  name: string;
  reason: string;
}

export interface GMCalculateResult {
  type: "calculate";
  expression: string;
  // The arithmetic value. For a comparison ("17+3 >= 15") this is the left
  // side's value and `isTrue` carries the verdict.
  result: number;
  // Set only when the expression contained a comparison operator. This is how
  // every roll-vs-target question is now answered (there is no dc parameter
  // on any dice tool) - see the calculate tool description.
  comparison?: {
    operator: string;
    left: number;
    right: number;
    isTrue: boolean;
  };
  reason: string;
  displayName?: string;
}

// ============================================
// FORMULA-BASED RESULT INTERFACES
// ============================================

/** One independent dice pool's outcome within a formula_roll. */
export interface GMRolledPool {
  formula: string;
  resolvedFormula: string; // Breakdown with each group's faces shown
  rolls: number[]; // Flattened list of all dice rolled in this pool
  total: number;
  label?: string; // Optional model-supplied name for the pool
}

/**
 * A roll made behind the GM's screen. Structurally a formula_roll, tagged so
 * player-facing views (ContextViewer, the per-turn tool log in story.tsx) can
 * drop it - the GM sees the dice, the player only ever sees the narration.
 */
export interface GMHiddenRollResult {
  type: "gm_roll";
  pools: GMRolledPool[];
  reason: string;
  displayName?: string;
  secretBecause?: string;
}

export interface GMFormulaRollResult {
  type: "formula_roll";
  // One entry per independent pool. Single-pool rolls (the overwhelming
  // majority) have exactly one; nothing is ever summed across pools.
  pools: GMRolledPool[];
  reason: string;
  displayName?: string;
  stakes?: string;
  target?: string; // Hardness dimension: who the failure consequence lands on
  forcesChoice?: boolean; // Hardness dimension: dilemma between two costs
  consequences?: {
    success?: string;
    failure?: string;
  };
  unresolvedVariables?: string[]; // Variables that couldn't be resolved
}

export interface GMAskForRollResult {
  type: "ask_for_roll";
  title: string;
  description: string;
  playerName?: string;
  formula?: string;
  // Exactly what the player typed or said - "17", "4 and 6", "natural 20!".
  // Deliberately not parsed into a number: pulling one total out of the text
  // silently broke every system that rolls more than a single die pool.
  // null when they skipped/cancelled.
  answer: string | null;
  skipped?: boolean;
}

export interface GMAskQuestionResult {
  type: "ask_question";
  answers: {
    question: string;
    targetPlayerName?: string;
    answer: string;
    skipped: boolean;
  }[];
}

export interface GMOpposedFormulaResult {
  type: "opposed_formula";
  playerFormula: string;
  playerResolvedFormula: string;
  playerRolls: number[]; // Flattened list of all dice rolled
  playerTotal: number;
  opponentFormula: string;
  opponentResolvedFormula: string;
  opponentRolls: number[]; // Flattened list of all dice rolled
  opponentTotal: number;
  opponentName: string;
  reason: string;
  displayName?: string;
  stakes?: string;
  target?: string; // Hardness dimension: who the losing consequence lands on
  forcesChoice?: boolean; // Hardness dimension: dilemma between two costs
  consequences?: {
    player_wins?: string;
    opponent_wins?: string;
    tie?: string;
  };
}

export interface GMChallengeResultRecord {
  type: "record_challenge_result";
  outcome: "success" | "failure" | "strong_hit" | "weak_hit" | "hit" | "miss";
  description: string;
  target?: string; // Hardness dimension: who the failure consequence lands on
  forcesChoice?: boolean; // Hardness dimension: dilemma between two costs
  challengeProgress?: {
    name: string;
    successes: number;
    failures: number;
    required: number;
    maxFailures: number;
    completed?: boolean;
    won?: boolean;
    // Tally mode
    mode?: "first_to" | "tally";
    tally?: number;
    recorded?: number;
    rounds?: number;
    result?: "won" | "lost" | "even";
  };
}

// ============================================
// ORACLE & UTILITY RESULT INTERFACES
// ============================================

export interface GMFateQuestionResult {
  type: "fate_question";
  question: string;
  likelihood: string;
  chaosFactor: number;
  roll: number;
  answer: FateAnswer;
  randomEvent: boolean;
  reason?: string;
}

export interface GMRollTableResult {
  type: "roll_table";
  tableName: string;
  result: string;
  reason: string;
  displayName?: string;
  tableNotFound?: boolean;
  /** Set when the roll was on a table note (randomness plan R1). */
  noteTitle?: string;
  tablePath?: string;
  roll?: number;
  instructions?: string;
}

export interface GMRollPortentResult {
  type: "roll_portent";
  question: string;
  mode: PortentMode;
  statement: string;
  frame: string;
  relation?: string;
  relationGroup?: string;
  /** Present only when the roll moved the story's tonal register. */
  tintShiftedTo?: string;
}

export interface GMGenerateNameResult {
  type: "generate_name";
  kind: "person" | "place";
  names: string[];
  reason?: string;
}

export interface GMGenerateImageResult {
  type: "generate_image";
  subject: "scene" | "npc" | "player" | "location";
  accepted: boolean;
  imageId?: string; // The job id, also the stored picture's id
  reason?: string; // Why a refused call was refused
}

export interface GMReadNotesResult {
  type: "read_notes";
  readCount: number;
  titles: string[]; // Titles of notes that were read
  notFoundTitles?: string[]; // Titles that weren't found
}

export interface GMSearchMemoryResult {
  type: "search_memory";
  matchCount: number;
  totalMemories: number;
}

export interface GMGetGameStateResult {
  type: "get_game_state";
  sections: GameStateSection[]; // Which sections were included in the render
  hasActiveState: boolean; // False when nothing volatile is currently active
}

export interface GMSetReasoningTierResult {
  type: "set_reasoning_tier";
  requestedTier: number;
  grantedTier: number;
  capped: boolean;
  reason: string;
}

export interface GMStartGameResult {
  type: "start_game";
  story_name: string;
  premise?: string;
}

export interface GMConfirmSetupResult {
  type: "confirm_setup";
  outcome: "approved" | "changes" | "dismissed" | "stopped" | "refused";
  note?: string; // The player's requested changes, for "changes"
  // Set by the executor, never parsed from text: the player approved and the
  // engine started the game in the same call (generation.ts treats this like
  // a successful start_game).
  started?: boolean;
}

// ============================================
// COMBAT RESULT INTERFACES
// ============================================

export interface GMStartCombatResult {
  type: "start_combat";
  name: string;
  description?: string;
}

export interface GMAddCombatantResult {
  type: "add_combatant";
  name: string;
  combatantType: "player" | "ally" | "enemy" | "neutral";
  stats: Record<string, number>;
  initiative: string;
  initiativeRoll?: number;
  loreRef?: string;
  notes?: string;
}

export interface GMAddMultipleCombatantsResult {
  type: "add_multiple_combatants";
  added: Array<{
    name: string;
    type: string;
    stats: Record<string, number>;
    initiative: number;
  }>;
  failed?: string[];
  count?: number;
}

export interface GMRemoveCombatantResult {
  type: "remove_combatant";
  name: string;
  reason: "dead" | "fled" | "incapacitated" | "captured" | "other";
  narrative?: string;
  finalStats?: Record<string, number>;
}

export interface GMUpdateCombatantStatResult {
  type: "update_combatant_stat";
  combatant: string;
  stat: string;
  oldValue: number;
  newValue: number;
  change: number;
  reason?: string;
  diceRolled?: number[]; // If value was a dice formula
  clampedToZero?: boolean; // HP-like stat would have gone negative, clamped to 0
  defeated?: boolean; // HP-like stat hit 0, combatant auto-flagged isActive=false
}

export interface GMToggleCombatantConditionResult {
  type: "toggle_combatant_condition";
  combatant: string;
  condition: string;
  duration?: number;
  action: "added" | "removed" | "updated"; // What actually happened
}

export interface GMNPCRollResult {
  type: "npc_roll";
  combatant: string;
  formula: string;
  rolls: number[];
  total: number;
  reason: string;
  target?: string;
}

export interface GMAdvanceTurnResult {
  type: "advance_turn";
  previousCombatant?: string;
  currentCombatant: string;
  currentCombatantType: "player" | "ally" | "enemy" | "neutral";
  round: number;
  expiredConditions?: { combatant: string; condition: string }[];
  allInactive?: boolean; // True if all combatants are inactive
}

export interface GMEndCombatResult {
  type: "end_combat";
  outcome: "victory" | "defeat" | "fled" | "truce" | "interrupted";
  summary: string;
  rounds: number;
}

// ============================================
// TIMER RESULT INTERFACES
// ============================================

export interface GMCreateTimerResult {
  type: "create_timer";
  timer: {
    id: string;
    name: string;
    description?: string;
    totalTicks: number;
    currentTicks: number;
    autoAdvance: boolean;
    visibility: "visible" | "hidden";
  };
}

export interface GMAdvanceTimerResult {
  type: "advance_timer";
  timer: string;
  previousTicks: number;
  currentTicks: number;
  ticksAdvanced: number;
  triggered: boolean;
}

export interface GMToggleTimerPauseResult {
  type: "toggle_timer_pause";
  timer: string;
  newStatus: "paused" | "active";
  ticksRemaining: number;
}

export interface GMCancelTimerResult {
  type: "cancel_timer";
  timer: string;
  reason?: string;
  ticksRemaining: number;
}

export interface GMManageMeterResult {
  type: "manage_meter";
  action: ManageMeterAction;
  owner: string;
  meter?: string;
  change?: MeterChange;
  created?: string[];
  skipped?: string[];
  refusedAsRepeat?: boolean;
}

export interface GMManageTrackResult {
  type: "manage_track";
  action: ManageTrackAction;
  owner: string;
  track: string;
  ticks?: number;
  boxes?: number;
  outcome?: RollOutcome;
  dice?: [number, number];
  match?: boolean;
}

export interface GMEndSessionResult {
  type: "end_session";
  sessionCount: number;
  reset: string[];
}

export interface GMActionRollResult {
  type: "action_roll";
  statName: string;
  statValue: number;
  adds: number;
  addsApplied: number;
  penalty: number;
  actionDie: number;
  challengeDice: [number, number];
  score: number;
  capped: boolean;
  outcome: RollOutcome;
  match: boolean;
  move?: string;
  owner?: string;
}

export interface GMManageFeatsResult {
  type: "manage_feats";
  hero: string;
  action: ManageFeatsAction;
  feats: HeroFeat[];
  conditions?: HeroCondition[];
}

export interface GMFeatRollResult {
  type: "feat_roll";
  hero: string;
  feats: string[];
  burned?: string;
  dc: number;
  dice: number[];
  /** Successes counted, the burned feat's sure success included. */
  successes: number;
  outcome: FeatTier;
  magnitude: number;
  /** The foe the roll struck, when the GM named one (judge layer, event contracts). */
  target?: string;
  /** Hearts the foe loses, Keen included: set on a hit that named a target; contracts.ts reads it. */
  damage?: number;
  /** A spell feat was named: a miss is a miscast. */
  magic?: boolean;
  helper?: { hero: string; feat: string };
  teamBurn?: { hero: string; feat: string; ownFeat: string };
  /** Condition words that took a die. */
  hindrances?: string[];
}

export interface GMInitiativeRollResult {
  type: "initiative_roll";
  rolls: { hero: string; die: number; edges: string[]; total: number }[];
}

export interface GMAwardXpResult {
  type: "award_xp";
  amount: number;
  source: string;
  credited: string[];
  refused: string[];
  levelUps: {
    hero: string;
    level: number;
    levelsGained: number[];
    heartsGained: number;
  }[];
}

export interface GMTakeRestResult {
  type: "take_rest";
  rested: string[];
  realm?: string;
  condition?: string;
  /** True when every hero in the state rested: the team burns are renewed. */
  partyRest?: boolean;
}

export interface GMTriggerTimerResult {
  type: "trigger_timer";
  timer: string;
  reason?: string;
  ticksRemaining: number;
  description?: string; // What the timer effect was
}

// ============================================
// NPC MANAGEMENT RESULT INTERFACES
// ============================================

export interface GMAddNPCResult {
  type: "add_npc";
  npc: NPC;
  message: string;
}

export interface GMUpdateNPCResult {
  type: "update_npc";
  npc: NPC;
  changes: string[];
  message: string;
}

export interface GMRemoveNPCResult {
  type: "remove_npc";
  npcName: string;
  reason?: string;
  message: string;
}

export interface GMNPCReactionResult {
  type: "npc_reaction";
  reaction: NPCReaction;
  message: string;
}

// ============================================
// HELPER FUNCTIONS
// ============================================

// ============================================
// MAIN EXECUTOR
// ============================================

// A pending "roll your real dice" request shown to the player (manual dice
// mode). Produced by the ask_for_roll tool; the UI answers with whatever the
// player reports, verbatim, or null if they skipped.
export interface ManualRollRequest {
  title: string;
  description: string;
  playerName?: string;
  formula?: string;
}

// What the player answered a manual roll prompt with, verbatim: "17",
// "4 and 6", "natural 20 so 23 total". No number is extracted from it - the
// GM reads the text, since only it knows how many pools it asked for and what
// this adventure's mechanics do with them.
export interface ManualRollAnswer {
  rawText: string;
}

// A pending "answer these questions" prompt shown to the player(s). Produced
// by the ask_question tool; the UI answers with one item per question, in
// the same order, or null if the whole batch was skipped/cancelled.
export interface AskQuestionRequest {
  questions: AskQuestionItem[];
}

export interface AskQuestionAnswerItem {
  selectedLabel?: string; // Which predefined option was picked, if any
  selectedLabels?: string[]; // Every option picked, for a multi_select question
  customText?: string; // Free-text answer, if that's what was given instead
  skipped: boolean;
}

export interface AskQuestionAnswer {
  answers: AskQuestionAnswerItem[]; // Same length/order as request.questions
}

// A request to physically throw dice (e.g. via a 3D physics dice UI) and
// report back the settled face values. `groups` holds every pool the roll
// needs - "2d6+1d4" is one request for two groups, thrown together as one
// handful, not two sequential trays. Resolves with one face array per group,
// in the same order. Called once per roll, then again with a single one-die
// group for each explosion, since the explosion count isn't knowable up
// front. `formula`/`reason` are display-only context.
export interface DiceThrowRequest {
  groups: DiceGroupRequest[];
  formula: string;
  reason: string;
}

// Handlers the frontend injects so interactive GM tools can pause the loop
// and wait for real player input.
export interface GMInteractionHandlers {
  requestManualRoll?: (
    request: ManualRollRequest
  ) => Promise<ManualRollAnswer | null>;
  // Resolves with the thrown dice's face values, one array per requested
  // group, or null if the player skipped/cancelled - the caller then falls
  // back to a fully digital (Math.random()) roll of the whole formula rather
  // than mixing the two.
  requestDiceThrow?: (
    request: DiceThrowRequest
  ) => Promise<number[][] | null>;
  // Resolves with one answer per question (same order), or null if the
  // whole batch was skipped/cancelled (e.g. generation was stopped).
  requestPlayerAnswer?: (
    request: AskQuestionRequest
  ) => Promise<AskQuestionAnswer | null>;
  // Shows the setup card (confirm_setup) and resolves with the player's
  // decision. Absent where the page does not provide the card.
  requestSetupConfirmation?: (
    request: SetupConfirmationRequest
  ) => Promise<SetupConfirmationAnswer>;
}

export interface GMExecutionResult {
  results: GMToolResult[];
  modifiedStoryData: StoryData;
  storyContext: string; // Combined context for story stage
  // True when the turn was stopped during the batch (the abort signal fired,
  // or the player pressed Stop on the setup card). The batch's changes were
  // not committed: modifiedStoryData is the story as it came in, and the
  // caller must not treat it as this turn's result.
  aborted?: boolean;
  // The turn's clock event ledger after this batch (see GMToolContext).
  turnLedger?: TurnLedger;
  // The name check's turn state after this batch (see GMToolContext).
  nameTurn?: NameTurnState;
}

// What the setup card needs (confirm_setup, session zero). The sheet and plan
// text are taken from the executor's working copy, so the card shows what the
// approval will bind to, not whatever the page last rendered.
export interface SetupConfirmationRequest {
  characterSummary: string;
  campaignHook: string;
  sheets: { title: string; content: string }[];
  // The campaign the card shows: a plan note (older stories, or a GM that
  // wrote one), the record's public projection (campaign/publicView.ts, never
  // a secret), or both. At least one is always set.
  plan: {
    note?: { title: string; content: string };
    campaign?: PublicCampaignView;
  };
}

export type SetupConfirmationAnswer =
  | { approved: true }
  | { approved: false; note: string } // "Change something..."
  | { dismissed: true } // the card was closed without a decision
  | { stopped: true }; // Stop: the turn is cancelled



/**
 * Whether a `success: false` result means something actually went wrong, or
 * just that the check didn't pass. The dice/check tools use `success` to
 * carry a game outcome - a `calculate` comparison coming out FALSE, a
 * challenge check recorded as a failure, a player skipping a manual roll -
 * and none of those deserve a warning in the console or a place in the
 * "tools failed" summary. Mirrors DICE_TOOLS in generation.ts, which draws
 * the same line for the retry logic.
 */
const OUTCOME_BEARING_TOOL_NAMES = new Set([
  "progress_roll",
  "calculate",
  "record_challenge_result",
  "action_roll",
  "ask_for_roll",
  "feat_roll",
]);

/**
 * Tools whose results never reach the player, whatever happened to them.
 *
 * Keyed by tool name rather than set inside the executor, because a call can
 * fail before any executor runs - a malformed `gm_roll` is rejected by schema
 * validation, and that error result would otherwise show up in the player's
 * tool log as a `gm_roll` row, announcing the secret roll the tool exists to
 * conceal. Every result for these tools is stamped on the way out.
 */
// "campaign" is here because its reads, its secrets and its hidden clocks are
// the GM's; the player's view of the campaign is built separately (slice 6).
const HIDDEN_FROM_PLAYER_TOOL_NAMES = new Set(["gm_roll", "campaign"]);

/**
 * The name the M2 roll gate and the Observer's outcome check see for a
 * result: a manage_track progress_roll is a roll with an engine verdict, so it
 * counts as "progress_roll"; every other result keeps its tool name.
 */
export function rollAwareToolName(r: {
  toolName: string;
  result?: unknown;
}): string {
  const res = r.result as
    | { type?: string; action?: string; outcome?: string }
    | undefined;
  if (
    r.toolName === "manage_track" &&
    res?.type === "manage_track" &&
    res.action === "progress_roll" &&
    res.outcome !== undefined
  ) {
    return "progress_roll";
  }
  return r.toolName;
}

function isHiddenFromPlayerTool(toolName: string): boolean {
  return HIDDEN_FROM_PLAYER_TOOL_NAMES.has(toolName);
}

function isRealToolFailure(result: GMToolResult): boolean {
  if (result.success) return false;
  if (!OUTCOME_BEARING_TOOL_NAMES.has(result.toolName)) return true;
  return result.contextForStory?.includes("ERROR") ?? false;
}

/**
 * Rewrites tool arguments the model got *nearly* right into the shape the
 * current schema declares, before validation runs - a near-miss shouldn't
 * cost an error/retry round-trip.
 *
 * Only case today: formula_roll takes `formulas: string[]` (so systems that
 * roll separate pools can pass several), but a single `formula: "1d20+5"` is
 * such a strong habit - and was this tool's own shape until recently - that
 * models keep reaching for it.
 */
function normalizeLegacyToolArgs(
  toolName: string,
  args: Record<string, unknown>
): void {
  if (toolName !== "formula_roll" && toolName !== "gm_roll") return;
  if (args.formulas === undefined && typeof args.formula === "string") {
    args.formulas = [args.formula];
  } else if (typeof args.formulas === "string") {
    args.formulas = [args.formulas];
  }
}

/**
 * Execute GM stage tool calls and return results for the story stage
 */
export async function executeGMTools(
  toolCalls: { id: string; function: { name: string; arguments: string } }[],
  storyData: StoryData,
  semanticContext: SemanticSearchContext = {},
  interaction: GMInteractionHandlers = {},
  toolContext: GMToolContext = {}
): Promise<GMExecutionResult> {
  // Clone storyData to avoid mutations. structuredClone (vs. the previous
  // JSON.parse(JSON.stringify(...)) round-trip) is both faster and doesn't
  // silently drop values JSON can't represent (undefined, Map/Set, etc.).
  const modified = structuredClone(storyData);
  let ledger: TurnLedger = toolContext.turnLedger
    ? structuredClone(toolContext.turnLedger)
    : newTurnLedger();
  const nameTurn: NameTurnState = toolContext.nameTurn
    ? structuredClone(toolContext.nameTurn)
    : newNameTurn();
  const turnStartLore = toolContext.turnStartLore ?? storyData.lore ?? [];
  const nameCtx = (): NameCheckContext => ({
    turnStartLore,
    playerTextThisTurn: nameTurn.playerTextThisTurn,
  });
  const results: GMToolResult[] = [];
  const contextParts: string[] = [];
  const signal = toolContext.abortSignal;

  // A Stop leaves the story as it came in: the clone is dropped, never
  // returned as the committed result.
  const abortedBatch = (): GMExecutionResult => ({
    results,
    modifiedStoryData: storyData,
    storyContext: contextParts.join("\n"),
    aborted: true,
  });

  for (const call of toolCalls) {
    // Checked before every tool, so a pause that was stopped (or any abort
    // that landed during an earlier tool) runs nothing further.
    if (signal?.aborted) return abortedBatch();

    // route.ts marks a tool call this way when the response hit the token
    // limit before this call's arguments finished streaming - the raw
    // arguments string was unterminated JSON and got replaced with `{}`.
    // Report that accurately instead of letting it fall through to normal
    // schema validation, which would report every required field as
    // "missing" and read as "the model forgot everything" when it may have
    // written most of a valid call that simply got cut off.
    if ((call as { argsTruncated?: boolean }).argsTruncated) {
      const rawPreview = (call as { rawArgumentsPreview?: string })
        .rawArgumentsPreview;
      const errorMsg = `Tool call "${
        call.function.name
      }" was cut off - the response hit the token limit before its arguments finished writing, so this call did not go through.${
        rawPreview ? ` (got as far as: ${rawPreview})` : ""
      } Retry it with shorter content - splitting into more, more-focused tool calls is fine.`;
      console.warn(`[GM Tool Truncated] ${errorMsg}`, { toolCallId: call.id });
      const errorResult: GMToolResult = {
        toolName: call.function.name,
        toolCallId: call.id,
        success: false,
        result: {
          type: "state_change" as const,
          message: errorMsg,
          command: call.function.name,
        },
        contextForStory: `[ERROR: ${errorMsg}]`,
      };
      errorResult.hiddenFromPlayer =
        isHiddenFromPlayerTool(call.function.name) || undefined;
      results.push(errorResult);
      contextParts.push(errorResult.contextForStory);
      continue;
    }

    let params: unknown;
    try {
      // Handle both string and already-parsed object arguments
      // Some providers (like Mistral) return arguments as objects, others as strings
      const args = call.function.arguments;
      params = typeof args === "string" ? JSON.parse(args) : args;
    } catch (parseError) {
      console.error(
        `[GM Tool Error] Failed to parse arguments for tool "${call.function.name}"`,
        {
          toolCallId: call.id,
          toolName: call.function.name,
          rawArguments: call.function.arguments,
          error:
            parseError instanceof Error
              ? parseError.message
              : String(parseError),
        }
      );
      // A result for every call keeps results[i] aligned with toolCalls[i].
      const errorMsg = `Tool call "${call.function.name}" had arguments that are not valid JSON, so this call did not go through. Send it again with well-formed arguments.`;
      const parseErrorResult: GMToolResult = {
        toolName: call.function.name,
        toolCallId: call.id,
        success: false,
        result: {
          type: "state_change" as const,
          message: errorMsg,
          command: call.function.name,
        },
        contextForStory: `[ERROR: ${errorMsg}]`,
      };
      parseErrorResult.hiddenFromPlayer =
        isHiddenFromPlayerTool(call.function.name) || undefined;
      results.push(parseErrorResult);
      contextParts.push(parseErrorResult.contextForStory);
      continue;
    }

    // Validate arguments against the tool's declared schema (required
    // params, types, enums) before dispatching - driven off the same schema
    // sent to the LLM, so a malformed call gets a specific, correctable
    // error fed back instead of crashing deep inside an executor function.
    const gmToolSchema = GM_TOOL_MAP.get(call.function.name);
    if (gmToolSchema) {
      const argsRecord =
        typeof params === "object" && params !== null && !Array.isArray(params)
          ? (params as Record<string, unknown>)
          : {};
      // Google gets `campaign.data` as a JSON string (Gemini rejects an
      // object schema with no properties, see filterToolsForGoogle).
      if (call.function.name === "campaign" && typeof argsRecord.data === "string") {
        try {
          const parsed: unknown = JSON.parse(argsRecord.data);
          if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
            argsRecord.data = parsed;
          }
        } catch {
          // left as a string: validation reports it
        }
      }
      normalizeLegacyToolArgs(call.function.name, argsRecord);
      const validationErrors = validateToolArgs(gmToolSchema, argsRecord);
      if (validationErrors.length > 0) {
        const errorMsg = formatValidationErrors(
          call.function.name,
          validationErrors
        );
        console.warn(`[GM Tool Validation] ${errorMsg}`, { params });
        const errorResult: GMToolResult = {
          toolName: call.function.name,
          toolCallId: call.id,
          success: false,
          result: {
            type: "state_change" as const,
            message: errorMsg,
            command: call.function.name,
          },
          contextForStory: `[ERROR: ${errorMsg}]`,
        };
        errorResult.hiddenFromPlayer =
          isHiddenFromPlayerTool(call.function.name) || undefined;
        results.push(errorResult);
        contextParts.push(errorResult.contextForStory);
        continue;
      }
    }

    let result: GMToolResult;
    const clockIdsBefore = new Set((modified.campaign?.clocks ?? []).map((c) => c.id));

    try {
      switch (call.function.name) {
        case "start_challenge":
          result = executeStartChallenge(
            call.id,
            params as StartChallengeParams,
            modified
          );
          break;
        case "cancel_challenge":
          result = executeCancelChallenge(
            call.id,
            params as CancelChallengeParams,
            modified
          );
          break;
        case "calculate":
          result = executeCalculate(call.id, params as CalculateParams);
          break;
        case "formula_roll":
          result = await executeFormulaRoll(
            call.id,
            params as FormulaRollParams,
            modified,
            interaction
          );
          break;
        case "gm_roll":
          result = executeGMRoll(call.id, params as GMRollParams);
          break;
        case "ask_for_roll":
          result = await executeAskForRoll(
            call.id,
            params as AskForRollParams,
            interaction
          );
          break;
        case "ask_question":
          result = await executeAskQuestion(
            call.id,
            params as AskQuestionParams,
            interaction,
            modified,
            toolContext.setupPlayers
          );
          // An answered question is session zero's progress: the concept has
          // begun, and the count feeds the "enough questions" nudge. On the
          // working copy, so it reaches StoryData like any other state change.
          if (result.success && modified.sessionZeroActive === true) {
            modified.setup = {
              ...modified.setup,
              conceptDone: true,
              questionsAsked: (modified.setup?.questionsAsked ?? 0) + 1,
            };
          }
          break;
        case "opposed_formula":
          result = await executeOpposedFormula(
            call.id,
            params as OpposedFormulaParams,
            modified,
            interaction
          );
          break;
        case "record_challenge_result":
          result = executeRecordChallengeResult(
            call.id,
            params as RecordChallengeResultParams,
            modified
          );
          break;
        case "fate_question":
          result = executeFateQuestion(
            call.id,
            params as FateQuestionParams,
            modified
          );
          break;
        case "roll_table":
          result = executeRollTable(
            call.id,
            params as RollTableParams,
            modified
          );
          break;
        case "roll_portent":
          result = executeRollPortent(
            call.id,
            params as RollPortentParams,
            modified
          );
          break;
        case "generate_name":
          result = executeGenerateName(
            call.id,
            params as GenerateNameParams,
            modified
          );
          break;
        case "generate_image":
          result = executeGenerateImage(
            call.id,
            params as GenerateImageParams,
            modified,
            toolContext.imageJobs
          );
          break;
        case "read_notes":
          result = executeReadNotes(
            call.id,
            params as ReadNotesParams,
            modified
          );
          // Phase 4 grounding gate (toolExecutor.ts create_note,
          // docs/gm-plan-notes-design.md): mark that notes were read this
          // turn so the Campaign Plan spine note can be created.
          modified.notesReadThisTurn = true;
          // Session zero keeps what the GM read in view (the setup reference
          // in the live block), since history stubs the result.
          if (result.success && result.result.type === "read_notes") {
            recordSetupReference(modified, result.result.titles);
          }
          break;
        case "search_memory":
          result = await executeSearchMemory(
            call.id,
            params as SearchMemoryParams,
            modified,
            semanticContext
          );
          break;
        case "get_game_state":
          result = executeGetGameState(
            call.id,
            params as GetGameStateParams,
            modified
          );
          break;
        // Combat tools
        case "start_combat":
          result = executeStartCombat(
            call.id,
            params as StartCombatParams,
            modified
          );
          break;
        case "add_combatant":
          result = executeAddCombatantUnified(
            call.id,
            params as AddCombatantUnifiedParams,
            modified
          );
          break;
        case "remove_combatant":
          result = executeRemoveCombatant(
            call.id,
            params as RemoveCombatantParams,
            modified
          );
          break;
        case "update_combatant_stat":
          result = executeUpdateCombatantStat(
            call.id,
            params as UpdateCombatantStatParams,
            modified
          );
          break;
        case "toggle_combatant_condition":
          result = executeToggleCombatantCondition(
            call.id,
            params as ToggleCombatantConditionParams,
            modified
          );
          break;
        case "npc_roll":
          result = executeNPCRoll(call.id, params as NPCRollParams, modified);
          break;
        case "advance_turn":
          result = executeAdvanceTurn(
            call.id,
            params as AdvanceTurnParams,
            modified
          );
          break;
        case "end_combat":
          result = executeEndCombat(
            call.id,
            params as EndCombatParams,
            modified
          );
          break;
        // Timer tool (unified create/advance/toggle_pause/cancel/trigger)
        case "manage_timer":
          result = executeManageTimer(
            call.id,
            params as ManageTimerParams,
            modified
          );
          break;
        case "campaign":
          result = executeCampaign(call.id, params as CampaignParams, modified, {
            // A system whose settings are the real world (Blood & Bone) names
            // its places from the map: only people are checked.
            rejectName: resolveSystem(modified).system?.realWorldPlaces
              ? undefined
              : (name, kind) => unrolledNameRefusal(modified, kind, name, nameCtx()),
          });
          break;
        // System tools (meters, tracks, sessions, action rolls)
        case "manage_meter":
          result = executeManageMeter(
            call.id,
            params as ManageMeterParams,
            modified
          );
          break;
        case "manage_track":
          result = await executeManageTrack(
            call.id,
            params as ManageTrackParams,
            modified,
            interaction
          );
          break;
        case "end_session":
          result = executeEndSession(
            call.id,
            params as EndSessionParams,
            modified
          );
          break;
        case "action_roll":
          result = await executeActionRoll(
            call.id,
            params as ActionRollParams,
            modified,
            interaction
          );
          break;
        // Fantastic Realms tools
        case "manage_feats":
          result = executeManageFeats(call.id, params as ManageFeatsParams, modified);
          break;
        case "feat_roll":
          result = await executeFeatRoll(
            call.id,
            params as FeatRollParams,
            modified,
            interaction
          );
          break;
        case "initiative_roll":
          result = await executeInitiativeRoll(
            call.id,
            params as InitiativeRollParams,
            modified,
            interaction
          );
          break;
        case "award_xp":
          result = executeAwardXp(call.id, params as AwardXpParams, modified);
          break;
        case "take_rest":
          result = executeTakeRest(call.id, params as TakeRestParams, modified);
          break;
        // NPC management tools
        case "add_npc":
          result = executeAddNPC(call.id, params as AddNPCParams, modified, nameCtx());
          break;
        case "update_npc":
          result = executeUpdateNPC(
            call.id,
            params as UpdateNPCParams,
            modified,
            nameCtx()
          );
          break;
        case "remove_npc":
          result = executeRemoveNPC(
            call.id,
            params as RemoveNPCParams,
            modified
          );
          break;
        case "npc_reaction":
          result = executeNPCReaction(
            call.id,
            params as NPCReactionParams,
            modified
          );
          break;
        case "set_reasoning_tier":
          result = executeSetReasoningTier(
            call.id,
            params as SetReasoningTierParams,
            modified
          );
          break;
        case "start_game":
          result = executeStartGame(
            call.id,
            params as StartGameParams,
            modified,
            toolContext.setupPlayers
          );
          break;
        case "confirm_setup":
          result = await executeConfirmSetup(
            call.id,
            params as ConfirmSetupParams,
            modified,
            interaction,
            toolContext.setupPlayers
          );
          break;
        default:
          // Everything else goes to the state tool executor (notes, goals,
          // threads, ...). A name it does not know (a tool this build no
          // longer offers) comes back from it as an "Unknown tool" error
          // result, which is fed to the model like any other failure.
          const stateToolCalls = [
            {
              id: call.id,
              type: "function" as const,
              function: {
                name: call.function.name,
                arguments: params as Record<string, unknown>,
              },
            },
          ];
          const stateResult = executeStateTools(stateToolCalls, modified);

          if (stateResult.responses.length > 0) {
            const response = stateResult.responses[0];
            let message = response.message;

            // search_notes is a literal substring search - if it found
            // nothing, try semantic search before reporting failure. See
            // semanticSearchFallback.ts for why this is a fallback rather
            // than the primary strategy.
            if (
              call.function.name === "search_notes" &&
              /^No matches found for /.test(message)
            ) {
              const query =
                (params as { query?: string } | undefined)?.query || "";
              const semanticOutcome = await semanticSearchFallback(
                "lore",
                query,
                semanticContext
              );
              if (semanticOutcome.status === "ok" && semanticOutcome.matches.length > 0) {
                const semanticMatches = semanticOutcome.matches;
                message += `\n\nNo exact matches, but found ${
                  semanticMatches.length
                } semantically related note${
                  semanticMatches.length === 1 ? "" : "s"
                }:\n${semanticMatches
                  .map((m) => {
                    const excerpt = m.content.slice(0, 200);
                    const note = modified.lore?.find((l) => l.title === m.key);
                    return isHiddenFromPlayerNote(note)
                      ? `• "${m.key}": [[HIDDEN_LORE:${m.key}]]${excerpt}[[/HIDDEN_LORE]]`
                      : `• "${m.key}": ${excerpt}`;
                  })
                  .join("\n")}`;
              } else if (semanticOutcome.status === "error") {
                // A real degradation, not "genuinely nothing relevant" -
                // tell the GM rather than letting it read a plain "no
                // matches" as proof nothing relevant exists (H4).
                message += `\n\n[Semantic search unavailable right now (${semanticOutcome.message}) - only exact matches were checked]`;
              }
            }

            // Convert state tool response to GM tool result format
            result = {
              toolName: call.function.name,
              toolCallId: call.id,
              success: response.success === true,
              result: {
                type: "state_change" as const,
                message,
                command: response.command,
              },
              contextForStory:
                response.success === true
                  ? `[State: ${message}]`
                  : `[State Failed: ${message}]`,
            };

            // Add state changes to context
            if (stateResult.stateChanges.length > 0) {
              contextParts.push(
                ...stateResult.stateChanges.map((sc) => `[State Change: ${sc}]`)
              );
            }
          } else {
            console.warn(
              `Unknown tool (not GM or state): ${call.function.name}`
            );
            continue;
          }
      }
    } catch (executionError) {
      // Detailed error logging for failed GM tool execution
      const errorMessage =
        executionError instanceof Error
          ? executionError.message
          : String(executionError);
      const errorStack =
        executionError instanceof Error ? executionError.stack : undefined;

      console.error(
        `[GM Tool Execution Error] Tool "${call.function.name}" failed`,
        {
          toolCallId: call.id,
          toolName: call.function.name,
          params: params,
          error: errorMessage,
          stack: errorStack,
        }
      );

      // Create an error result that includes debugging info in the context
      result = {
        toolName: call.function.name,
        toolCallId: call.id,
        success: false,
        result: {
          type: "state_change" as const,
          message: `Tool execution failed: ${errorMessage}`,
          command: call.function.name,
        },
        contextForStory: `[ERROR: ${
          call.function.name
        } failed - ${errorMessage}]\n[Debug: params=${JSON.stringify(params)}]`,
      };
    }

    // What the name check learns from this call: a note the GM just made
    // proves nothing, and a player's answer to a question is their own text.
    if (result.toolName === "confirm_setup") {
      const changes = result.result as GMConfirmSetupResult | undefined;
      if (changes?.outcome === "changes" && changes.note) {
        nameTurn.playerTextThisTurn.push(changes.note);
      }
    }
    if (result.success && result.toolName === "ask_question") {
      const answers = (result.result as GMAskQuestionResult | undefined)?.answers ?? [];
      for (const a of answers) if (!a.skipped && a.answer) nameTurn.playerTextThisTurn.push(a.answer);
    }

    // Stamp oracle recency here rather than inside the two executors:
    // roll_table returns from three places (custom table, built-in table,
    // table-not-found) and only the successful ones should count as having
    // consulted the oracle.
    if (result.success && ORACLE_USE_TOOL_NAMES.has(result.toolName)) {
      markOracleConsulted(modified);
    }

    // Stamped centrally so a hidden roll stays hidden no matter which path
    // produced the result - executor, validation error, or thrown exception.
    if (isHiddenFromPlayerTool(result.toolName)) {
      result.hiddenFromPlayer = true;
    }

    // Campaign clocks tick here, at the tool boundary and in call order, so a
    // pause earlier in a batch is honoured by a miss later in it (design
    // 14.2). A clock made by this tool starts ticking from the next event.
    if (modified.campaign) {
      for (const c of modified.campaign.clocks) {
        if (!clockIdsBefore.has(c.id)) {
          ledger.clockCreatedAt[c.id] = ledger.nextOrder;
        }
      }
      const kinds = turnEventsFrom(result);
      if (kinds.length > 0) {
        const applied = applyTurnEvents(
          modified.campaign,
          ledger,
          kinds.map((kind) => ({ kind, toolCallId: call.id }))
        );
        ledger = applied.ledger;
        if (applied.reports.length > 0) {
          result.clockReports = applied.reports;
          result.contextForStory = [
            result.contextForStory,
            ...applied.reports.filter((r) => r.visible).map((r) => r.line),
          ]
            .filter(Boolean)
            .join("\n");
          // Hidden clocks' lines are the GM's alone: contextForStory is what
          // the player's timeline and saved tool log show.
          const hiddenLines = applied.reports
            .filter((r) => !r.visible)
            .map((r) => r.line);
          if (hiddenLines.length > 0) {
            result.gmOnlyContext = hiddenLines.join("\n");
          }
        }
      }
    }
    results.push(result);
    if (result.contextForStory) {
      contextParts.push(result.contextForStory);
    }

    // Stop pressed on the setup card, or the turn aborted during this tool:
    // nothing after it runs and nothing is committed.
    if (
      result.toolName === "confirm_setup" &&
      (result.result as GMConfirmSetupResult).outcome === "stopped"
    ) {
      return abortedBatch();
    }
    if (signal?.aborted) return abortedBatch();

    // Log genuine execution failures for debugging - not a check that simply
    // didn't pass (see isRealToolFailure).
    if (isRealToolFailure(result)) {
      console.warn(
        `[GM Tool Failed] Tool "${call.function.name}" returned failure`,
        {
          toolCallId: call.id,
          toolName: call.function.name,
          params: params,
          contextForStory: result.contextForStory,
        }
      );
    }
  }

  // Countdown timers do not tick here. They used to tick when the GM called
  // end_gm_thinking, a tool no GM was ever offered, so `auto_advance` never
  // advanced anything (status report 6.1). A tick would belong here, once
  // per completed GM turn.

  // Log execution summary for debugging
  const failedResults = results.filter(isRealToolFailure);
  if (failedResults.length > 0) {
    console.warn(
      `[GM Execution Summary] ${failedResults.length}/${results.length} tools failed`,
      {
        totalTools: results.length,
        failedCount: failedResults.length,
        failedTools: failedResults.map((r) => ({
          name: r.toolName,
          id: r.toolCallId,
          context: r.contextForStory,
        })),
      }
    );
  }

  return {
    results,
    modifiedStoryData: modified,
    storyContext: contextParts.join("\n"),
    turnLedger: ledger,
    nameTurn,
  };
}

// ============================================
// START CHALLENGE EXECUTOR
// ============================================

function executeStartChallenge(
  toolCallId: string,
  params: StartChallengeParams,
  storyData: StoryData
): GMToolResult {
  // Check if there's already an active challenge
  if (storyData.activeChallenge?.active) {
    return {
      toolName: "start_challenge",
      toolCallId,
      success: false,
      result: {
        type: "start_challenge",
        name: params.name,
        description: params.description,
        requiredSuccesses: params.required_successes,
        maxFailures: params.max_failures,
        primaryStat: params.primary_stat,
        difficulty: params.difficulty,
      } as GMChallengeResult,
      contextForStory: `[ERROR: Cannot start "${params.name}" - challenge "${storyData.activeChallenge.name}" is already active]`,
    };
  }

  const mode = params.mode === "tally" ? "tally" : "first_to";
  if (mode === "tally" && !resolveSystem(storyData).usesSystemTools) {
    return {
      toolName: "start_challenge",
      toolCallId,
      success: false,
      result: {
        type: "start_challenge",
        name: params.name,
        description: params.description,
        mode,
        primaryStat: params.primary_stat,
        difficulty: params.difficulty,
      } as GMChallengeResult,
      contextForStory: `[ERROR: tally mode needs the system's own action roll, which this story doesn't have. Use first_to (required_successes and max_failures) instead.]`,
    };
  }
  const invalid = (message: string): GMToolResult => ({
    toolName: "start_challenge",
    toolCallId,
    success: false,
    result: {
      type: "start_challenge",
      name: params.name,
      description: params.description,
      mode,
      primaryStat: params.primary_stat,
      difficulty: params.difficulty,
    } as GMChallengeResult,
    contextForStory: `[ERROR: ${message}]`,
  });

  let rounds: number;
  let challenge: SceneChallenge;
  let contextForStory: string;
  if (mode === "tally") {
    const r = params.rounds;
    if (typeof r !== "number" || !Number.isInteger(r) || r < 2 || r > 10) {
      return invalid(
        `start_challenge in tally mode needs "rounds", a whole number from 2 to 10 (got ${String(r)})`
      );
    }
    rounds = r;
    challenge = {
      id: `challenge_${Date.now()}`,
      name: params.name,
      description: params.description,
      rounds,
      currentSuccesses: 0,
      currentFailures: 0,
      active: true,
      createdAt: Date.now(),
      mode: "tally",
      tally: 0,
      recorded: 0,
    };
    contextForStory = `[Challenge Started: "${params.name}" - Tally of ${rounds} results (strong hit +1, weak hit 0, miss -1) | Primary Stat: ${params.primary_stat} | Difficulty: ${params.difficulty}]`;
  } else {
    const need = params.required_successes;
    const lose = params.max_failures;
    if (typeof need !== "number" || typeof lose !== "number") {
      const missing = [
        typeof need !== "number" ? "required_successes" : "",
        typeof lose !== "number" ? "max_failures" : "",
      ]
        .filter(Boolean)
        .join(" and ");
      return invalid(
        `start_challenge needs ${missing} (or mode "tally" with rounds)`
      );
    }
    // rounds is a display-only "best of X" figure - the actual win/loss
    // thresholds are requiredSuccesses/maxFailures below, kept independent so
    // a deliberately asymmetric challenge doesn't collapse into one symmetric
    // majority derived from this number.
    rounds = Math.max(need, lose) * 2 - 1;
    challenge = {
      id: `challenge_${Date.now()}`,
      name: params.name,
      description: params.description,
      rounds,
      currentSuccesses: 0,
      currentFailures: 0,
      requiredSuccesses: need,
      maxFailures: lose,
      active: true,
      createdAt: Date.now(),
    };
    contextForStory = `[Challenge Started: "${params.name}" - Best of ${rounds} (need ${need} successes) | Primary Stat: ${params.primary_stat} | Difficulty: ${params.difficulty}]`;
  }

  storyData.activeChallenge = challenge;

  return {
    toolName: "start_challenge",
    toolCallId,
    success: true,
    result: {
      type: "start_challenge",
      name: params.name,
      description: params.description,
      mode,
      rounds,
      requiredSuccesses: challenge.requiredSuccesses,
      maxFailures: challenge.maxFailures,
      primaryStat: params.primary_stat,
      difficulty: params.difficulty,
      victoryConsequence: params.victory_consequence,
      defeatConsequence: params.defeat_consequence,
    } as GMChallengeResult,
    contextForStory,
  };
}

function executeCancelChallenge(
  toolCallId: string,
  params: CancelChallengeParams,
  storyData: StoryData
): GMToolResult {
  const challenge = storyData.activeChallenge;
  if (!challenge?.active) {
    return {
      toolName: "cancel_challenge",
      toolCallId,
      success: false,
      result: {
        type: "cancel_challenge",
        name: "",
        reason: params.reason,
      } as GMCancelChallengeResult,
      contextForStory: "[ERROR: No active challenge to cancel]",
    };
  }

  challenge.active = false;
  challenge.resolvedAt = Date.now();
  // Deliberately no `result` ("won"/"lost") - this challenge was abandoned,
  // not resolved to a threshold either way.

  return {
    toolName: "cancel_challenge",
    toolCallId,
    success: true,
    result: {
      type: "cancel_challenge",
      name: challenge.name,
      reason: params.reason,
    } as GMCancelChallengeResult,
    contextForStory: `[Challenge Cancelled: "${challenge.name}" - ${params.reason}]`,
  };
}

// ============================================
// CALCULATE EXECUTOR
// ============================================

// Comparison operators `calculate` understands. Longest-first so ">=" is
// matched before ">". Exactly one comparison per expression: this tool
// answers "did that number beat the target?", and chained comparisons
// ("4 < x < 9") don't have one unambiguous answer worth guessing at.
const COMPARISON_OPERATORS = [">=", "<=", "==", "!=", ">", "<"] as const;

/**
 * Splits an expression on its comparison operator, if it has one.
 * "17+3 >= 15" -> { left: "17+3", operator: ">=", right: "15" }
 */
function splitComparison(
  expression: string
): { left: string; operator: string; right: string } | null {
  for (const operator of COMPARISON_OPERATORS) {
    const at = expression.indexOf(operator);
    if (at === -1) continue;
    return {
      left: expression.slice(0, at),
      operator,
      right: expression.slice(at + operator.length),
    };
  }
  return null;
}

function compare(operator: string, left: number, right: number): boolean {
  switch (operator) {
    case ">=":
      return left >= right;
    case "<=":
      return left <= right;
    case "==":
      return left === right;
    case "!=":
      return left !== right;
    case ">":
      return left > right;
    default:
      return left < right;
  }
}

/**
 * Evaluates one arithmetic side of an expression, with dice already rolled
 * out of it. Everything that isn't a number, operator, space or paren is
 * stripped first, so a stray word or comparison operator can't reach the
 * evaluator.
 */
function evaluateArithmetic(expression: string): number {
  const safeExpression = expression.replace(/[^0-9+\-*/(). ]/g, "");
  if (!safeExpression.trim()) {
    throw new Error("empty expression");
  }
  // Function rather than eval - the input is already reduced to digits and
  // arithmetic operators by the strip above.
  const value = new Function(`return ${safeExpression}`)() as number;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error("not a finite number");
  }
  return value;
}

function executeCalculate(
  toolCallId: string,
  params: CalculateParams
): GMToolResult {
  // Parse expression, handling dice, basic math, and comparisons
  // Supports: "20 - 4", "50 + 2d6", "100 - 1d20 + 5", "17+3 >= 15"
  let expression = params.expression;

  const failure = (detail: string): GMToolResult => ({
    toolName: "calculate",
    toolCallId,
    success: false,
    result: {
      type: "calculate",
      expression: params.expression,
      result: 0,
      reason: params.reason,
      displayName: params.display_name,
    } as GMCalculateResult,
    contextForStory: `[ERROR: ${detail}]`,
  });

  // Replace dice rolls with their results
  const diceRegex = /(\d+)d(\d+)/gi;
  const diceMatches = expression.match(diceRegex);
  const diceRolls: { notation: string; rolls: number[]; total: number }[] = [];

  if (diceMatches) {
    for (const diceMatch of diceMatches) {
      const [, numDice, dieSize] = diceMatch.match(/(\d+)d(\d+)/i) || [];
      const n = parseInt(numDice, 10);
      const d = parseInt(dieSize, 10);

      // Same bound diceFormula.ts enforces on every other roll in the app -
      // this expression parser rolls dice itself instead of going through
      // diceFormula.ts, so it needs the same DoS guard applied explicitly.
      if (n < 1 || n > MAX_DICE_COUNT || d < 1 || d > MAX_DICE_SIDES) {
        return failure(
          `Invalid dice "${diceMatch}" in "${params.expression}" - count must be 1-${MAX_DICE_COUNT}, sides must be 1-${MAX_DICE_SIDES}`
        );
      }

      const rolls: number[] = [];
      for (let i = 0; i < n; i++) {
        rolls.push(Math.floor(Math.random() * d) + 1);
      }

      const total = rolls.reduce((a, b) => a + b, 0);
      diceRolls.push({ notation: diceMatch, rolls, total });
      expression = expression.replace(diceMatch, total.toString());
    }
  }

  const displayName = params.display_name || "Calculation";
  const diceDetail = diceRolls
    .map((dr) => ` (${dr.notation}=[${dr.rolls.join(",")}])`)
    .join("");

  // A comparison ("17+3 >= 15") resolves to TRUE/FALSE - this is what
  // settles every roll-against-a-target question, since the dice tools
  // themselves report numbers and nothing else.
  const split = splitComparison(expression);
  if (split) {
    let left: number;
    let right: number;
    try {
      left = evaluateArithmetic(split.left);
      right = evaluateArithmetic(split.right);
    } catch {
      return failure(
        `Could not evaluate the comparison "${params.expression}" - both sides need to be plain arithmetic, e.g. "17+3 >= 15"`
      );
    }

    const isTrue = compare(split.operator, left, right);
    const contextForStory =
      `[${displayName}: ${params.expression}${diceDetail} → ${left} ${split.operator} ${right} → **${isTrue ? "TRUE" : "FALSE"}**]` +
      `\n[Reason: ${params.reason}]`;

    return {
      toolName: "calculate",
      toolCallId,
      // For a comparison, `success` carries the verdict itself - the same
      // convention the dice tools used to follow with their DCs (see
      // DICE_TOOLS in generation.ts: success=false here means the check
      // didn't pass, not that the call errored). A real evaluation failure
      // returns via failure() above with ERROR in its context instead.
      success: isTrue,
      result: {
        type: "calculate",
        expression: params.expression,
        result: left,
        comparison: { operator: split.operator, left, right, isTrue },
        reason: params.reason,
        displayName: params.display_name,
      } as GMCalculateResult,
      contextForStory,
    };
  }

  let result: number;
  try {
    result = evaluateArithmetic(expression);
  } catch {
    return failure(`Could not evaluate "${params.expression}"`);
  }

  const contextForStory =
    `[${displayName}: ${params.expression}${diceDetail} = ${result}]` +
    `\n[Reason: ${params.reason}]`;

  return {
    toolName: "calculate",
    toolCallId,
    success: true,
    result: {
      type: "calculate",
      expression: params.expression,
      result,
      reason: params.reason,
      displayName: params.display_name,
    } as GMCalculateResult,
    contextForStory,
  };
}

// ============================================
// FORMULA-BASED TOOL EXECUTORS
// ============================================

/**
 * Flatten DiceGroupResult[] into a simple number[] of all kept dice
 */
function flattenRolls(rolls: RollResult["rolls"]): number[] {
  return rolls.flatMap((group) => group.keptRolls);
}

/**
 * H7 fix: a self-declared "high"/"deadly" `stakes` value on a roll is a
 * non-optional escalation floor, not decoration. Mirrors the combat floor
 * in `hardRuleFloor` (regular combat -> rules-adjudication tier, boss
 * fight -> top tier) but keyed on the roll's own stakes instead of combat
 * state, so a genuinely high-stakes non-combat check can no longer be
 * quietly adjudicated at the cheapest tier just because the model never
 * calls `set_reasoning_tier` itself. Returns an extra `contextForStory`
 * line when escalation actually happens, or "" otherwise.
 */
function applyStakesEscalation(
  storyData: StoryData,
  stakes: "low" | "medium" | "high" | "deadly" | undefined
): string {
  const floor = stakesFloor(stakes);
  if (floor <= 0) return "";
  const decision = applyTierEscalation(
    storyData,
    floor,
    `${stakes}-stakes roll`
  );
  // M2 roll-invariant gate signal (generation.ts): remember that high/deadly
  // stakes were declared THIS scene, independent of currentTier (which
  // decays every turn regardless of scene boundary and so can't answer
  // "was this scene ever declared high-stakes" on its own).
  if (storyData.reasoningTierState) {
    storyData.reasoningTierState.highStakesSceneKey = computeSceneKey(storyData);
  }
  if (decision.grantedTier > decision.previousTier) {
    return `\n[Reasoning tier escalated to ${decision.grantedTier} - ${stakes}-stakes roll]`;
  }
  return "";
}

/**
 * Execute a formula roll with optional DC check
 * GM must provide formulas with actual numeric values (no variable substitution)
 */
/**
 * Renders the "target"/"forces_choice" hardness dimensions (PbtA's seven
 * dimensions of hardness, scoped to the two most distinct - see
 * docs/research-paper-ttrpg-theory-gap-analysis.md §2.2) as a hard
 * narrative instruction, the same way `stakes` already is. Independent of
 * stakes: these describe WHO a consequence lands on and WHETHER it's a
 * dilemma, not how severe it is.
 */
function describeHardness(
  target: "self" | "someone_they_love" | "someone_present" | undefined,
  forcesChoice: boolean | undefined
): string {
  let out = "";
  if (target && target !== "self") {
    const targetDesc =
      target === "someone_they_love"
        ? "someone the character loves or cares about, not the character directly"
        : "someone else present in the scene, not the character directly";
    out += `\n[Target: this consequence lands on ${targetDesc} - narrate it landing there.]`;
  }
  if (forcesChoice) {
    out += `\n[Forces a choice: present this as a dilemma between two costs the player must choose between - do not resolve it as a single flat consequence.]`;
  }
  return out;
}

// Thrown internally by rollFormulaMaybePhysical when the player
// skipped/cancelled a physical dice throw mid-formula, to unwind back to a
// single clean fully-digital reroll rather than mixing partial physical
// results with digital ones.
class PhysicalDiceSkipped extends Error {}

/**
 * Rolls one or more independent formulas physically (via
 * interaction.requestDiceThrow) when that handler is wired up, falling back
 * to the standard Math.random() roll otherwise - or if the player
 * skips/cancels the physical throw, in which case every formula is rerolled
 * digitally rather than left half-physical/half-digital.
 *
 * Every dice group across every formula goes out in one request, so a roll
 * like "2d6+1d4" (or Starforged's 1d6 + 2d10) is a single throw of the whole
 * handful.
 */
async function rollFormulasMaybePhysical(
  formulas: string[],
  context: { reason: string },
  interaction: GMInteractionHandlers
): Promise<RollResult[]> {
  if (!interaction.requestDiceThrow) {
    return formulas.map((formula) => rollFormula(formula));
  }

  // Independent pools are never summed, so they're joined for display with
  // "and" rather than "+" - the tray header shouldn't read like one formula.
  const displayFormula = formulas.join(" and ");
  const diceResolver: DiceResolver = async (groups: DiceGroupRequest[]) => {
    const thrown = await interaction.requestDiceThrow!({
      groups,
      formula: displayFormula,
      reason: context.reason,
    });
    if (!thrown) throw new PhysicalDiceSkipped();
    return thrown;
  };

  try {
    return await rollFormulasAsync(formulas, undefined, diceResolver);
  } catch (e) {
    if (e instanceof PhysicalDiceSkipped) {
      return formulas.map((formula) => rollFormula(formula));
    }
    throw e;
  }
}

/**
 * Normalizes the formula list off a formula_roll call. The schema asks for
 * `formulas: string[]`, but models drift toward the old singular
 * `formula: "1d20+5"` shape, so both are accepted and empty entries dropped.
 */
function readRollFormulas(params: FormulaRollParams): string[] {
  const legacy = (params as unknown as { formula?: unknown }).formula;
  const raw = Array.isArray(params.formulas)
    ? params.formulas
    : typeof params.formulas === "string"
      ? [params.formulas as string]
      : typeof legacy === "string"
        ? [legacy]
        : [];
  return raw
    .filter((f): f is string => typeof f === "string")
    .map((f) => f.trim())
    .filter((f) => f.length > 0);
}

/**
 * Renders one pool's dice and total, e.g. `2d6+3: [4, 5] +3 = **12**`.
 */
function describePool(pool: GMRolledPool): string {
  const label = pool.label ? `${pool.label} ` : "";
  const shown =
    pool.resolvedFormula && pool.resolvedFormula !== pool.formula
      ? `${pool.formula} → ${pool.resolvedFormula}`
      : `${pool.formula}: [${pool.rolls.join(", ")}] = **${pool.total}**`;
  return `${label}${shown}`;
}

/**
 * Echoes the consequences the GM planned for each outcome. The engine no
 * longer picks one - it doesn't know which way the check went, since
 * comparing the total to a target is the GM's `calculate` call - so both
 * branches go back with the failure branch carrying its hardness note.
 */
function describePlannedConsequences(
  consequences: { success?: string; failure?: string } | undefined,
  target: FormulaRollParams["target"],
  forcesChoice: boolean | undefined
): string {
  let out = "";
  if (consequences?.success) {
    out += `\n[Planned consequence on success: ${consequences.success}]`;
  }
  if (consequences?.failure) {
    out += `\n[Planned consequence on failure: ${consequences.failure}]`;
  }
  const hardness = describeHardness(target, forcesChoice);
  if (hardness) {
    out += `\n[If this failed:${hardness}]`;
  }
  return out;
}

async function executeFormulaRoll(
  toolCallId: string,
  params: FormulaRollParams,
  storyData: StoryData,
  interaction: GMInteractionHandlers
): Promise<GMToolResult> {
  // No variable resolver - GM must provide actual numbers
  const formulas = readRollFormulas(params);
  const displayName = params.display_name || "Roll";

  if (formulas.length === 0) {
    return {
      toolName: "formula_roll",
      toolCallId,
      success: false,
      result: {
        type: "formula_roll",
        pools: [],
        reason: params.reason,
        unresolvedVariables: [],
      } as GMFormulaRollResult,
      contextForStory: `[ERROR: formula_roll needs at least one dice formula in \`formulas\`, e.g. formulas: ["1d20+5"]]`,
    };
  }

  // Roll every pool - one physical throw for all of their dice together
  let rollResults: RollResult[];
  try {
    rollResults = await rollFormulasMaybePhysical(
      formulas,
      { reason: params.reason },
      interaction
    );
  } catch (e) {
    return {
      toolName: "formula_roll",
      toolCallId,
      success: false,
      result: {
        type: "formula_roll",
        pools: [],
        reason: params.reason,
        unresolvedVariables: [],
      } as GMFormulaRollResult,
      contextForStory: `[ERROR: Invalid formula in "${formulas.join(
        ", "
      )}" - ${e instanceof Error ? e.message : "Unknown error"}]`,
    };
  }

  const labels = Array.isArray(params.labels) ? params.labels : [];
  const pools: GMRolledPool[] = rollResults.map((result, i) => ({
    formula: formulas[i],
    resolvedFormula: result.breakdown || formulas[i],
    rolls: flattenRolls(result.rolls),
    total: result.total,
    label: typeof labels[i] === "string" && labels[i].trim() ? labels[i] : undefined,
  }));

  // Build context string. Multi-pool rolls list each pool on its own line so
  // the totals stay visibly separate and never read as one sum.
  let contextForStory: string;
  if (pools.length === 1) {
    contextForStory = `[${displayName}: ${describePool(pools[0])}]`;
  } else {
    contextForStory =
      `[${displayName} - ${pools.length} separate pools, NOT added together:]` +
      pools.map((pool) => `\n[  ${describePool(pool)}]`).join("");
  }
  contextForStory += `\n[Reason: ${params.reason}]`;
  contextForStory += `\n[No verdict was computed. Compare against the target with \`calculate\` before narrating an outcome.]`;

  if (params.stakes) {
    contextForStory += `\n[Stakes: ${params.stakes}]`;
    contextForStory += applyStakesEscalation(storyData, params.stakes);
  }

  contextForStory += describePlannedConsequences(
    params.consequences,
    params.target,
    params.forces_choice
  );

  return {
    toolName: "formula_roll",
    toolCallId,
    // The dice were thrown, so the call succeeded. It says nothing about
    // whether the character passed - that isn't this tool's business anymore.
    success: true,
    result: {
      type: "formula_roll",
      pools,
      reason: params.reason,
      displayName: params.display_name,
      stakes: params.stakes,
      target: params.target,
      forcesChoice: params.forces_choice,
      consequences: params.consequences,
    } as GMFormulaRollResult,
    contextForStory,
  };
}

/**
 * Execute gm_roll - a roll made behind the GM's screen.
 *
 * Deliberately does NOT go through rollFormulasMaybePhysical: handing a
 * secret roll to the physical dice tray would put it in the player's hands,
 * which is the one thing this tool exists to avoid. It always rolls
 * digitally, in both dice modes.
 *
 * Everything else matches formula_roll - the dice are reported, no verdict is
 * computed - except that the result carries `hiddenFromPlayer`, which keeps
 * it out of every player-facing view of the turn's tool calls.
 */
function executeGMRoll(
  toolCallId: string,
  params: GMRollParams
): GMToolResult {
  const formulas = readRollFormulas(params as unknown as FormulaRollParams);
  const displayName = params.display_name || "Hidden Roll";

  const fail = (message: string): GMToolResult => ({
    toolName: "gm_roll",
    toolCallId,
    success: false,
    hiddenFromPlayer: true,
    result: {
      type: "gm_roll",
      pools: [],
      reason: params.reason,
    } as GMHiddenRollResult,
    contextForStory: message,
  });

  if (formulas.length === 0) {
    return fail(
      `[ERROR: gm_roll needs at least one dice formula in \`formulas\`, e.g. formulas: ["1d20+5"]]`
    );
  }

  let rollResults: RollResult[];
  try {
    rollResults = formulas.map((formula) => rollFormula(formula));
  } catch (e) {
    return fail(
      `[ERROR: Invalid formula in "${formulas.join(", ")}" - ${
        e instanceof Error ? e.message : "Unknown error"
      }]`
    );
  }

  const labels = Array.isArray(params.labels) ? params.labels : [];
  const pools: GMRolledPool[] = rollResults.map((result, i) => ({
    formula: formulas[i],
    resolvedFormula: result.breakdown || formulas[i],
    rolls: flattenRolls(result.rolls),
    total: result.total,
    label:
      typeof labels[i] === "string" && labels[i].trim() ? labels[i] : undefined,
  }));

  let contextForStory: string;
  if (pools.length === 1) {
    contextForStory = `[${displayName} (behind the screen): ${describePool(
      pools[0]
    )}]`;
  } else {
    contextForStory =
      `[${displayName} (behind the screen) - ${pools.length} separate pools, NOT added together:]` +
      pools.map((pool) => `\n[  ${describePool(pool)}]`).join("");
  }
  contextForStory += `\n[Reason: ${params.reason}]`;
  if (params.secret_because) {
    contextForStory += `\n[Hidden because: ${params.secret_because}]`;
  }
  contextForStory += `\n[No verdict was computed. Compare against the target with \`calculate\` before narrating an outcome.]`;
  contextForStory += `\n[The player cannot see this roll and must not learn it happened. Narrate only what the character perceives - if this check failed, describe the scene as unremarkable rather than saying they notice nothing, which would reveal there was something to notice.]`;

  return {
    toolName: "gm_roll",
    toolCallId,
    success: true,
    hiddenFromPlayer: true,
    result: {
      type: "gm_roll",
      pools,
      reason: params.reason,
      displayName: params.display_name,
      secretBecause: params.secret_because,
    } as GMHiddenRollResult,
    contextForStory,
  };
}

/**
 * Execute ask_for_roll (manual dice mode): pause the GM loop and wait for
 * the player to roll physical dice and say what they got. The injected
 * `interaction.requestManualRoll` handler resolves with their answer as
 * verbatim text, or null when the player skipped (then the GM should roll
 * digitally). Nothing is parsed out of the text and no verdict is computed -
 * see ManualRollAnswer for why.
 */
async function executeAskForRoll(
  toolCallId: string,
  params: AskForRollParams,
  interaction: GMInteractionHandlers
): Promise<GMToolResult> {
  const baseResult: Omit<GMAskForRollResult, "answer"> = {
    type: "ask_for_roll",
    title: params.title,
    description: params.description,
    playerName: params.player_name,
    formula: params.formula,
  };

  if (!interaction.requestManualRoll) {
    return {
      toolName: "ask_for_roll",
      toolCallId,
      success: false,
      result: { ...baseResult, answer: null, skipped: true },
      contextForStory:
        "[ERROR: Manual dice input isn't available right now - roll digitally with formula_roll instead.]",
    };
  }

  const answer = await interaction.requestManualRoll({
    title: params.title,
    description: params.description,
    playerName: params.player_name,
    formula: params.formula,
  });

  const reported = answer?.rawText?.trim();
  if (!reported) {
    return {
      toolName: "ask_for_roll",
      toolCallId,
      success: false,
      result: { ...baseResult, answer: null, skipped: true },
      contextForStory: `[Manual Roll Skipped: ${params.title} - the player didn't report a roll. Roll it for them digitally with formula_roll${
        params.formula ? ` (formulas: ["${params.formula}"])` : ""
      } and continue.]`,
    };
  }

  let contextForStory = `[Manual Roll: ${params.title}`;
  if (params.player_name) {
    contextForStory += ` - ${params.player_name}`;
  }
  contextForStory += ` was asked to roll${
    params.formula ? ` ${params.formula}` : ""
  } with real dice and reported: "${reported}"]`;
  contextForStory += `\n[Reason: ${params.description}]`;
  contextForStory += `\n[That is the player's own wording, exactly as given - no number was parsed out of it and no verdict was computed. Read it against what you asked for, use \`calculate\` for any arithmetic or comparison, and ask them again in (round brackets) if it genuinely doesn't answer the roll.]`;

  return {
    toolName: "ask_for_roll",
    toolCallId,
    success: true,
    result: { ...baseResult, answer: reported },
    contextForStory,
  };
}

/**
 * Session zero's questions, set up by code rather than by the model
 * (gm-prompt-plan slice 3): an item tagged with a creative step gets
 * `allow_custom: true` whatever the model sent, and in full mode the first
 * item under each known tag must carry an `intro` or the call is refused
 * (`error`) before the player sees anything. Untagged items and items under an
 * unknown tag are left alone. Never mutates its input.
 */
export function prepareSetupQuestions(
  story: StoryData,
  questions: AskQuestionItem[],
  setupPlayers?: { id: string; name: string }[]
): { questions: AskQuestionItem[]; error?: string } {
  const steps = getCreationSteps(story, setupPlayers);
  const fullMode = story.setup?.mode === "full";
  const seenTags = new Set<string>();
  const missingIntro: string[] = [];
  const prepared = questions.map((q) => {
    const tag = q.setup_step?.trim() ?? "";
    const step = tag ? steps.find((s) => s.id === tag) : undefined;
    if (!step) return q;
    if (fullMode && !seenTags.has(tag)) {
      seenTags.add(tag);
      if (!q.intro?.trim()) missingIntro.push(tag);
    }
    return stepKind(step) === "creative" && q.allow_custom !== true
      ? { ...q, allow_custom: true }
      : q;
  });
  if (missingIntro.length > 0) {
    return {
      questions: prepared,
      error: `[ERROR: Step-by-step setup needs an \`intro\` on the first question of each setup step: one or two sentences on what is being chosen and why it matters. Missing for: ${missingIntro.join(", ")}. Nothing was asked; ask again with the intro.]`,
    };
  }
  return { questions: prepared };
}

/**
 * Execute ask_question: pause the GM loop and wait for the player(s) to
 * answer one or more questions (predefined option, free text, or skipped).
 * The injected `interaction.requestPlayerAnswer` handler resolves with one
 * answer per question, or null if the whole batch was skipped/cancelled.
 */
async function executeAskQuestion(
  toolCallId: string,
  params: AskQuestionParams,
  interaction: GMInteractionHandlers,
  storyData?: StoryData,
  setupPlayers?: { id: string; name: string }[]
): Promise<GMToolResult> {
  const emptyResult: GMAskQuestionResult = {
    type: "ask_question",
    answers: params.questions.map((q) => ({
      question: q.question,
      targetPlayerName: q.target_player_name,
      answer: "",
      skipped: true,
    })),
  };

  if (!interaction.requestPlayerAnswer) {
    return {
      toolName: "ask_question",
      toolCallId,
      success: false,
      result: emptyResult,
      contextForStory:
        "[ERROR: Can't ask the player questions right now - proceed and narrate your best judgment instead.]",
    };
  }

  let questions = params.questions;
  if (storyData && storyData.sessionZeroActive === true) {
    const prepared = prepareSetupQuestions(storyData, questions, setupPlayers);
    if (prepared.error) {
      return {
        toolName: "ask_question",
        toolCallId,
        success: false,
        result: emptyResult,
        contextForStory: prepared.error,
      };
    }
    questions = prepared.questions;
  }

  const answer = await interaction.requestPlayerAnswer({ questions });

  if (answer === null) {
    return {
      toolName: "ask_question",
      toolCallId,
      success: false,
      result: emptyResult,
      contextForStory:
        "[Player skipped answering. Proceed using your best judgment.]",
    };
  }

  const answers = questions.map((q, i) => {
    const item = answer.answers[i];
    let text = "";
    // How the answer reads in the GM's context: every pick quoted.
    let shown = "";
    if (item && !item.skipped) {
      const picks = q.multi_select ? validPicks(q, item) : [];
      if (picks.length > 0) {
        const custom = item.customText?.trim();
        const parts = custom ? [...picks, custom] : picks;
        text = parts.join(", ");
        shown = parts.map((p) => `"${p}"`).join(", ");
      } else {
        text = item.selectedLabel || item.customText || "";
        shown = text ? `"${text}"` : "";
      }
    }
    return {
      question: q.question,
      targetPlayerName: q.target_player_name,
      answer: text,
      skipped: !text,
      shown,
    };
  });

  const contextForStory = [
    "[Asked the player:",
    ...answers.map(
      (a) =>
        `Q: "${a.question}"${a.targetPlayerName ? ` (for ${a.targetPlayerName})` : ""} → ${a.skipped ? "Skipped" : a.shown}`
    ),
    "]",
  ].join("\n");

  // Session zero: count the answered creation step and say where setup stands.
  const progressNote =
    storyData && storyData.sessionZeroActive === true
      ? recordCreationSteps(storyData, params.questions, answers, setupPlayers)
      : "";

  return {
    toolName: "ask_question",
    toolCallId,
    success: answers.some((a) => !a.skipped),
    result: {
      type: "ask_question",
      answers: answers.map((a) => ({
        question: a.question,
        targetPlayerName: a.targetPlayerName,
        answer: a.answer,
        skipped: a.skipped,
      })),
    },
    contextForStory: progressNote
      ? `${contextForStory}\n${progressNote}`
      : contextForStory,
  };
}

/** "connections (Nik)" / "setting": the id the GM tags with, and who for. */
function stepRef(m: MissingCreationStep): string {
  return m.player ? `${m.step.id} (${m.player})` : m.step.id;
}

/**
 * Records the creation steps an answered ask_question covered, on the working
 * copy (docs/session-zero-detail-design.md 3.2), and returns the line the GM
 * reads: what was recorded and what is next. Each tag counts only when every
 * item carrying it was answered and, for a player step, the engine can name
 * the player (the question's target, or solo). Table steps may be batched, and
 * in quick mode so may anything; in full mode a player step (the per-character
 * build) is asked one at a time, so a call mixing it with other tags records
 * the table tags and refuses the player ones. Returns "" when no question
 * carried a tag.
 */
function recordCreationSteps(
  story: StoryData,
  questions: AskQuestionItem[],
  answers: { skipped: boolean }[],
  setupPlayers?: { id: string; name: string }[]
): string {
  const tagged = questions
    .map((q, i) => ({ q, i, tag: q.setup_step?.trim() ?? "" }))
    .filter((x) => x.tag);
  if (tagged.length === 0) return "";

  const tags = [...new Set(tagged.map((x) => x.tag))];
  const steps = getCreationSteps(story, setupPlayers);
  const people = setupParticipants(story, setupPlayers);
  const fullMode = story.setup?.mode === "full";

  const prev = story.setup?.covered ?? { table: [], players: {} };
  const covered = { table: [...prev.table], players: { ...prev.players } };
  const recordedList: string[] = [];
  const notes: string[] = [];

  for (const tag of tags) {
    const mine = tagged.filter((x) => x.tag === tag);
    const step = steps.find((s) => s.id === tag);
    if (!step) {
      notes.push(
        `unknown setup_step "${tag}" ignored, nothing recorded. This story's steps: ${steps.map((s) => s.id).join(", ")}.`
      );
      continue;
    }
    if (fullMode && tags.length > 1 && step.scope === "player") {
      notes.push(
        `${tag} not recorded - this call carried ${tags.length} different setup_step tags (${tags.join(", ")}). Ask one setup step at a time.`
      );
      continue;
    }
    if (mine.some((x) => answers[x.i]?.skipped !== false)) {
      notes.push(`${tag} not recorded - the player skipped it. Ask it again.`);
      continue;
    }
    if (step.scope === "table") {
      if (!covered.table.includes(step.id)) covered.table.push(step.id);
      recordedList.push(step.id);
      continue;
    }
    let who: { id: string; name: string } | undefined;
    if (people.length === 1) {
      who = people[0];
    } else {
      const named = new Set(
        mine.map((x) =>
          people.find(
            (p) =>
              p.name.trim().toLowerCase() ===
              (x.q.target_player_name ?? "").trim().toLowerCase()
          )?.id
        )
      );
      const id = named.size === 1 ? [...named][0] : undefined;
      who = people.find((p) => p.id === id);
    }
    if (!who) {
      notes.push(
        `${tag} not recorded - say which player it is for with target_player_name on every ${tag} question (${people.map((p) => p.name).join(", ")}).`
      );
      continue;
    }
    const have = covered.players[who.id] ?? [];
    covered.players[who.id] = have.includes(step.id) ? have : [...have, step.id];
    recordedList.push(`${step.id} (${who.name})`);
  }

  if (recordedList.length === 0) return `[Setup: nothing recorded - ${notes.join(" ")}]`;

  story.setup = { ...story.setup, covered };
  const progress = getCreationProgress(story, setupPlayers);
  const next = progress.missing[0];
  const tail = next
    ? `Next: ${stepRef(next)}.`
    : story.setup?.mode === "full"
      ? "Every step is covered: write the sheet and build the campaign."
      : "Every required step is covered.";
  const extra = notes.length ? ` Not recorded: ${notes.join(" ")}` : "";
  return `[Setup: Recorded: ${recordedList.join(", ")}.${extra} ${tail}]`;
}

/** The labels of a multi_select answer that are really among the options, once each, in option order. */
function validPicks(q: AskQuestionItem, item: AskQuestionAnswerItem): string[] {
  const picked = new Set(item.selectedLabels ?? []);
  return q.options.map((o) => o.label).filter((l, i, all) => picked.has(l) && all.indexOf(l) === i);
}

/**
 * Execute an opposed formula roll: both sides throw, both totals are
 * reported, and that's it. Which total wins is a rules question the GM
 * settles with `calculate` - see the tool description.
 *
 * GM must provide formulas with actual numeric values (no variable
 * substitution).
 */
async function executeOpposedFormula(
  toolCallId: string,
  params: OpposedFormulaParams,
  storyData: StoryData,
  interaction: GMInteractionHandlers
): Promise<GMToolResult> {
  // No variable resolver - GM must provide actual numbers

  const emptyResult = (): GMOpposedFormulaResult => ({
    type: "opposed_formula",
    playerFormula: params.player_formula,
    playerResolvedFormula: params.player_formula,
    playerRolls: [],
    playerTotal: 0,
    opponentFormula: params.opponent_formula,
    opponentResolvedFormula: params.opponent_formula,
    opponentRolls: [],
    opponentTotal: 0,
    opponentName: params.opponent_name,
    reason: params.reason,
  });

  // Roll player's formula (physical dice eligible - it's the human's roll).
  // The opponent's formula always stays digital.
  let playerResult: RollResult;
  try {
    [playerResult] = await rollFormulasMaybePhysical(
      [params.player_formula],
      { reason: params.reason },
      interaction
    );
  } catch (e) {
    return {
      toolName: "opposed_formula",
      toolCallId,
      success: false,
      result: emptyResult(),
      contextForStory: `[ERROR: Invalid player formula "${
        params.player_formula
      }" - ${e instanceof Error ? e.message : "Unknown error"}]`,
    };
  }

  // Roll opponent's formula
  let opponentResult: RollResult;
  try {
    opponentResult = rollFormula(params.opponent_formula);
  } catch (e) {
    return {
      toolName: "opposed_formula",
      toolCallId,
      success: false,
      result: {
        ...emptyResult(),
        playerResolvedFormula: playerResult.breakdown || params.player_formula,
        playerRolls: flattenRolls(playerResult.rolls),
        playerTotal: playerResult.total,
      },
      contextForStory: `[ERROR: Invalid opponent formula "${
        params.opponent_formula
      }" - ${e instanceof Error ? e.message : "Unknown error"}]`,
    };
  }

  // Build context string
  const displayName = params.display_name || "Opposed Roll";
  let contextForStory = `[${displayName}: ${params.reason}]`;
  contextForStory += `\n[Player: ${params.player_formula}`;
  if (playerResult.breakdown !== params.player_formula) {
    contextForStory += ` → ${playerResult.breakdown}`;
  }
  contextForStory += ` = ${playerResult.total}]`;
  contextForStory += `\n[${params.opponent_name}: ${params.opponent_formula}`;
  if (opponentResult.breakdown !== params.opponent_formula) {
    contextForStory += ` → ${opponentResult.breakdown}`;
  }
  contextForStory += ` = ${opponentResult.total}]`;
  contextForStory += `\n[No winner was computed. Compare the two totals with \`calculate\` (e.g. "${playerResult.total} > ${opponentResult.total}") per this adventure's rules before narrating who came out ahead.]`;

  if (params.stakes) {
    contextForStory += `\n[Stakes: ${params.stakes}]`;
    contextForStory += applyStakesEscalation(storyData, params.stakes);
  }

  // All planned branches go back, since the engine doesn't know which one
  // the comparison will land on.
  if (params.consequences?.player_wins) {
    contextForStory += `\n[Planned consequence if the player wins: ${params.consequences.player_wins}]`;
  }
  if (params.consequences?.opponent_wins) {
    contextForStory += `\n[Planned consequence if ${params.opponent_name} wins: ${params.consequences.opponent_wins}]`;
  }
  if (params.consequences?.tie) {
    contextForStory += `\n[Planned consequence on a tie: ${params.consequences.tie}]`;
  }
  const hardness = describeHardness(params.target, params.forces_choice);
  if (hardness) {
    contextForStory += `\n[If the player lost:${hardness}]`;
  }

  return {
    toolName: "opposed_formula",
    toolCallId,
    // Both sides rolled, so the call succeeded - it says nothing about who won.
    success: true,
    result: {
      type: "opposed_formula",
      playerFormula: params.player_formula,
      playerResolvedFormula: playerResult.breakdown || params.player_formula,
      playerRolls: flattenRolls(playerResult.rolls),
      playerTotal: playerResult.total,
      opponentFormula: params.opponent_formula,
      opponentResolvedFormula:
        opponentResult.breakdown || params.opponent_formula,
      opponentRolls: flattenRolls(opponentResult.rolls),
      opponentTotal: opponentResult.total,
      opponentName: params.opponent_name,
      reason: params.reason,
      displayName: params.display_name,
      stakes: params.stakes,
      target: params.target,
      forcesChoice: params.forces_choice,
      consequences: params.consequences,
    } as GMOpposedFormulaResult,
    contextForStory,
  };
}

/**
 * A tally challenge: exactly `rounds` results, strong hit +1, weak hit 0,
 * miss -1, decided by the sum (+1 or more won, 0 even, -1 or less lost).
 */
function recordTallyResult(
  toolCallId: string,
  params: RecordChallengeResultParams,
  challenge: SceneChallenge,
  allowHit = false
): GMToolResult {
  // Fantastic Realms scores its four tiers with tallyScore (design 14); every
  // other system keeps the three-tier table, and "hit" is an error there.
  const delta =
    params.outcome === "strong_hit" || (allowHit && params.outcome === "hit")
      ? tallyScore(params.outcome === "hit" ? "hit" : "strong_hit")
      : params.outcome === "weak_hit"
        ? tallyScore("weak_hit")
        : params.outcome === "miss"
          ? tallyScore("miss")
          : null;
  if (delta === null) {
    return {
      toolName: "record_challenge_result",
      toolCallId,
      success: false,
      result: {
        type: "record_challenge_result",
        outcome: params.outcome,
        description: params.description,
      } as GMChallengeResultRecord,
      contextForStory: `[ERROR: "${challenge.name}" is a tally challenge: record ${allowHit ? "strong_hit, hit, weak_hit or miss (the feat_roll outcome)" : "strong_hit, weak_hit or miss (the action_roll outcome)"}, not "${params.outcome}"]`,
    };
  }

  challenge.tally = (challenge.tally ?? 0) + delta;
  challenge.recorded = (challenge.recorded ?? 0) + 1;
  if (delta > 0) challenge.currentSuccesses = (challenge.currentSuccesses || 0) + 1;
  if (delta < 0) challenge.currentFailures = (challenge.currentFailures || 0) + 1;

  const completed = challenge.recorded >= challenge.rounds;
  let result: "won" | "lost" | "even" | undefined;
  if (completed) {
    result = challenge.tally >= 1 ? "won" : challenge.tally <= -1 ? "lost" : "even";
    challenge.result = result;
    challenge.active = false;
    challenge.resolvedAt = Date.now();
  }

  const label =
    params.outcome === "strong_hit"
      ? "STRONG HIT"
      : params.outcome === "hit"
        ? "HIT"
        : params.outcome === "weak_hit"
          ? "WEAK HIT"
          : "MISS";
  let contextForStory = `[Challenge Check ${label}: ${params.description}]`;
  contextForStory += `\n[Challenge "${challenge.name}": round ${challenge.recorded} of ${challenge.rounds}, tally ${formatSigned(challenge.tally)}]`;
  if (completed) {
    const band =
      result === "won"
        ? "+1 or more"
        : result === "lost"
          ? "-1 or less"
          : "0";
    contextForStory += `\n[Challenge ENDED at tally ${formatSigned(challenge.tally)} (${band}): ${result === "won" ? "WON" : result === "lost" ? "LOST" : "EVEN"}]`;
  }
  if (delta < 0) {
    contextForStory += describeHardness(params.target, params.forces_choice);
  }

  return {
    toolName: "record_challenge_result",
    toolCallId,
    success: delta >= 0,
    result: {
      type: "record_challenge_result",
      outcome: params.outcome,
      description: params.description,
      target: params.target,
      forcesChoice: params.forces_choice,
      challengeProgress: {
        name: challenge.name,
        successes: challenge.currentSuccesses,
        failures: challenge.currentFailures,
        required: 0,
        maxFailures: 0,
        completed,
        won: result === "won",
        mode: "tally",
        tally: challenge.tally,
        recorded: challenge.recorded,
        rounds: challenge.rounds,
        result,
      },
    } as GMChallengeResultRecord,
    contextForStory,
  };
}

function formatSigned(n: number): string {
  return n > 0 ? `+${n}` : String(n);
}

/**
 * Record one resolved check against the active challenge. Rolls nothing: the
 * GM rolls with formula_roll, compares with calculate, and reports the
 * verdict here. (This replaced formula_challenge_check, which bundled roll +
 * DC comparison + progress into one call and so only worked for systems
 * where beating a single target number is the whole resolution.)
 */
function executeRecordChallengeResult(
  toolCallId: string,
  params: RecordChallengeResultParams,
  storyData: StoryData
): GMToolResult {
  const challenge = storyData.activeChallenge;
  if (!challenge) {
    return {
      toolName: "record_challenge_result",
      toolCallId,
      success: false,
      result: {
        type: "record_challenge_result",
        outcome: params.outcome,
        description: params.description,
      } as GMChallengeResultRecord,
      contextForStory:
        "[ERROR: No active challenge to record a result for. Use start_challenge first, or drop the challenge framing.]",
    };
  }

  // "hit" is Fantastic Realms' middle tier; no other system has one.
  const allowHit = resolveSystem(storyData).tools.includes("feat_roll");
  if (params.outcome === "hit" && !allowHit) {
    return {
      toolName: "record_challenge_result",
      toolCallId,
      success: false,
      result: {
        type: "record_challenge_result",
        outcome: params.outcome,
        description: params.description,
      } as GMChallengeResultRecord,
      contextForStory: `[ERROR: "hit" is not an outcome in this story: record ${challenge.mode === "tally" ? "strong_hit, weak_hit or miss (the action_roll outcome)" : "success or failure"}]`,
    };
  }

  if (challenge.mode === "tally") {
    return recordTallyResult(toolCallId, params, challenge, allowHit);
  }

  // In a first_to challenge a strong or weak hit is a success and a miss a
  // failure, so an action_roll-style GM cannot break it.
  const succeeded =
    params.outcome === "success" ||
    params.outcome === "strong_hit" ||
    params.outcome === "weak_hit" ||
    params.outcome === "hit";

  // Update challenge progress
  if (succeeded) {
    challenge.currentSuccesses = (challenge.currentSuccesses || 0) + 1;
  } else {
    challenge.currentFailures = (challenge.currentFailures || 0) + 1;
  }

  // Use the thresholds declared at start_challenge time so an intentionally
  // asymmetric challenge (e.g. 3 successes to win, 5 failures to lose) is
  // honored instead of collapsed into one symmetric majority. Falls back to
  // the old rounds-derived majority only for challenges started before
  // requiredSuccesses/maxFailures existed.
  const legacyMajority = Math.floor(challenge.rounds / 2) + 1;
  const requiredSuccessesToWin = challenge.requiredSuccesses ?? legacyMajority;
  const maxFailuresToLose = challenge.maxFailures ?? legacyMajority;

  // Check if challenge is complete
  let completed = false;
  let won = false;
  if (challenge.currentSuccesses >= requiredSuccessesToWin) {
    completed = true;
    won = true;
    challenge.result = "won";
    challenge.active = false;
    challenge.resolvedAt = Date.now();
  } else if (challenge.currentFailures >= maxFailuresToLose) {
    completed = true;
    won = false;
    challenge.result = "lost";
    challenge.active = false;
    challenge.resolvedAt = Date.now();
  }

  let contextForStory = `[Challenge Check ${
    succeeded ? "SUCCESS" : "FAILURE"
  }: ${params.description}]`;
  contextForStory += `\n[Challenge "${challenge.name}": ${challenge.currentSuccesses}/${requiredSuccessesToWin} successes, ${challenge.currentFailures}/${maxFailuresToLose} failures]`;

  if (completed) {
    contextForStory += `\n[Challenge ${won ? "WON" : "LOST"}!]`;
  }

  if (!succeeded) {
    contextForStory += describeHardness(params.target, params.forces_choice);
  }

  return {
    toolName: "record_challenge_result",
    toolCallId,
    success: succeeded,
    result: {
      type: "record_challenge_result",
      outcome: params.outcome,
      description: params.description,
      target: params.target,
      forcesChoice: params.forces_choice,
      challengeProgress: {
        name: challenge.name,
        successes: challenge.currentSuccesses,
        failures: challenge.currentFailures,
        required: requiredSuccessesToWin,
        maxFailures: maxFailuresToLose,
        completed,
        won,
      },
    } as GMChallengeResultRecord,
    contextForStory,
  };
}

// ============================================
// ORACLE & UTILITY TOOL EXECUTORS
// ============================================

/**
 * Execute a fate question using the AGMT oracle system
 */
function executeFateQuestion(
  toolCallId: string,
  params: FateQuestionParams,
  storyData: StoryData
): GMToolResult {
  // Get chaos factor from agmtState or default to 5
  const chaosFactor = storyData.agmtState?.chaosFactor ?? 5;

  // Validate likelihood - default to 50/50 if invalid
  const validLikelihoods = [
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
  ];
  const likelihood = validLikelihoods.includes(params.likelihood)
    ? params.likelihood
    : "50/50";

  // Ask fate
  const fateResult = askFate(likelihood, chaosFactor);

  // Build context string
  let contextForStory = `[Fate Question: "${params.question}"]`;
  contextForStory += `\n[Likelihood: ${likelihood} | Chaos Factor: ${chaosFactor}]`;
  contextForStory += `\n[Roll: ${fateResult.roll} → ${fateResult.answer}]`;

  if (fateResult.randomEvent) {
    // A one-line "consider adding a twist" hint is easy to silently drop -
    // generate real Focus + Meaning content (same as scene-check
    // Interrupted events) and persist it as tracked state so it keeps
    // reappearing in context every turn until resolve_random_event is
    // called, instead of vanishing the moment this turn's narration
    // moves on without addressing it.
    const focusResult = generateEventFocus();
    const meaningResult = generateEventMeaning();
    // Roll a portent alongside the Mythic action/subject pair: the pair
    // says what happens, the portent says what the event is *about*, with
    // the relation between its terms fixed by the dice. Deliberately does
    // not apply a Lens Shift - a tint change is a deliberate act of the
    // director layer, not a side effect of a random event that may sit
    // unresolved for several turns.
    const eventPortent = rollPortent(
      "portent",
      selectFrame(storyData),
      currentTint(storyData)
    );
    storyData.pendingRandomEvents = storyData.pendingRandomEvents || [];
    const pendingEvent: PendingRandomEvent = {
      id: `event_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      source: "fate_question",
      focus: focusResult.focus,
      action: meaningResult.action,
      subject: meaningResult.subject,
      portent: eventPortent.statement,
      context: params.question,
      createdAt: Date.now(),
    };
    storyData.pendingRandomEvents.push(pendingEvent);
    if (storyData.pendingRandomEvents.length > MAX_PENDING_RANDOM_EVENTS) {
      storyData.pendingRandomEvents = storyData.pendingRandomEvents.slice(
        -MAX_PENDING_RANDOM_EVENTS
      );
    }
    contextForStory += `\n[⚡ RANDOM EVENT TRIGGERED: [${pendingEvent.focus}] "${pendingEvent.action} ${pendingEvent.subject}" — condition: ${pendingEvent.portent} - incorporate this into the narrative, then call resolve_random_event(id: "${pendingEvent.id}"). It will keep reappearing every turn until resolved.]`;
  }

  if (params.reason) {
    contextForStory += `\n[Context: ${params.reason}]`;
  }

  return {
    toolName: "fate_question",
    toolCallId,
    success: true,
    result: {
      type: "fate_question",
      question: params.question,
      likelihood,
      chaosFactor,
      roll: fateResult.roll,
      answer: fateResult.answer,
      randomEvent: fateResult.randomEvent,
      reason: params.reason,
    } as GMFateQuestionResult,
    contextForStory,
  };
}

/**
 * Execute a Prima Materia portent roll.
 *
 * The Frame is picked here from live state rather than accepted as a
 * parameter - see `selectFrame`. Handing the model the choice of where to
 * stand when reading its own oracle result is the same self-selection hole
 * closed for reasoning tiers and director moves; it would reliably pick
 * whichever frame let it narrate what it already intended to.
 *
 * A Lens Shift mutates `agmtState.tint`, which is why this takes
 * `storyData` mutably. That's the only durable state a portent writes.
 */
function executeRollPortent(
  toolCallId: string,
  params: RollPortentParams,
  storyData: StoryData
): GMToolResult {
  const mode: PortentMode = params.mode || "portent";
  const frame = selectFrame(storyData);
  const tintBefore = currentTint(storyData);

  const result: PortentResult = rollPortent(mode, frame, tintBefore);

  if (result.lensShift && storyData.agmtState) {
    storyData.agmtState.tint = result.lensShift.to;
    storyData.agmtState.lastTintShiftScene = storyData.agmtState.sceneCount;
  }

  const contextForStory = `[Portent asked: "${params.question}"]\n${formatPortentForModel(
    result
  )}`;

  return {
    toolName: "roll_portent",
    toolCallId,
    success: true,
    result: {
      type: "roll_portent",
      question: params.question,
      mode: result.mode,
      statement: result.statement,
      frame: result.frame,
      relation: result.relation,
      relationGroup: result.relationGroup,
      tintShiftedTo: result.lensShift?.to,
    } as GMRollPortentResult,
    contextForStory,
  };
}

/**
 * Execute a roll on a table: a built-in AGMT element table first, then one of
 * this adventure's table notes (`type: "table"`), found by title the way
 * `read_notes` finds one and rolled in one call when its layout is one the
 * parser reads (tableRoll.ts). A layout it cannot read is refused with a
 * pointer back to read-and-roll with `formula_roll`; a note with several
 * sub-tables and no `table` is refused with the list, never rolled on the
 * first one.
 */
function executeRollTable(
  toolCallId: string,
  params: RollTableParams,
  storyData: StoryData
): GMToolResult {
  let rawName = typeof params.table_name === "string" ? params.table_name : "";
  // "builtin:names" asks for the built-in table even when a note has that name.
  const builtinPrefix = /^built-?in[: ]\s*(.+)$/i.exec(rawName.trim());
  if (builtinPrefix) rawName = builtinPrefix[1];
  // Try as AGMT element table (normalize name: spaces to underscores, lowercase)
  const normalizedName = rawName.toLowerCase().replace(/\s+/g, "_");

  const isAgmtTable = (MYTHIC_TABLE_NAMES as string[]).includes(normalizedName);

  // A table note by that name wins over a built-in of the same name (the live
  // block shows the GM the notes by their short names, "Names" for "FR — Names"),
  // and a `table` argument can only mean a note.
  const found = builtinPrefix ? [] : findTableNotes(storyData, rawName, isAgmtTable);
  if (isAgmtTable && found.length === 0) {
    // Roll on the AGMT element table
    // (isAgmtTable already confirmed normalizedName is a member of MYTHIC_TABLE_NAMES)
    const result = generateElement(normalizedName as ElementCategory);
    if (normalizedName === "names") pushRolledName(storyData, result.element);
    const prettifiedName = rawName
      .replace(/_/g, " ")
      .replace(/\b\w/g, (l: string) => l.toUpperCase());

    // Build context string
    const displayName = params.display_name || `${prettifiedName} Roll`;
    let contextForStory = `[${displayName}: "${result.element}"]`;
    contextForStory += `\n[Reason: ${params.reason}]`;

    return {
      toolName: "roll_table",
      toolCallId,
      success: true,
      result: {
        type: "roll_table",
        tableName: prettifiedName,
        result: result.element,
        reason: params.reason,
        displayName: params.display_name,
      } as GMRollTableResult,
      contextForStory,
    };
  }

  const displayName = params.display_name || "Table Roll";
  const refuse = (
    text: string,
    extra: Partial<GMRollTableResult> = {},
    hidden = false
  ): GMToolResult => ({
    toolName: "roll_table",
    toolCallId,
    success: false,
    ...(hidden ? { hiddenFromPlayer: true } : {}),
    result: {
      type: "roll_table",
      tableName: rawName,
      result: "",
      reason: params.reason,
      displayName: params.display_name,
      ...extra,
    } as GMRollTableResult,
    contextForStory: `[${displayName}: ${text}]`,
  });

  // Not a built-in table: one of this adventure's table notes.
  if (found.length > 1) {
    return refuse(
      `"${rawName}" matches several table notes: ${found
        .map((n) => `"${n.title}"`)
        .join(", ")}. Call again with the exact title.`,
      { tableNotFound: true },
      found.some(isHiddenTableNote)
    );
  }
  if (found.length === 0) {
    const close = closestTableTitles(storyData, rawName);
    return refuse(
      `Table "${rawName}" not found. ${
        close.length
          ? `Closest table notes: ${close.map((t) => `"${t}"`).join(", ")}. `
          : ""
      }Use a built-in table named under Tables in your instructions, a table note's title, or decide it yourself.`,
      { tableNotFound: true }
    );
  }

  const note = found[0];
  const parsed = parseTableNote(note.content);
  if (!parsed.ok) {
    return refuse(
      `"${note.title}" can't be rolled in one call (${parsed.reason}). Read it with \`read_notes\`, roll the die it names with \`formula_roll\`, and read off the entry that came up.`,
      { noteTitle: note.title },
      isHiddenTableNote(note)
    );
  }
  const picked = selectTable(parsed.tables, params.table);
  if (!picked.ok) {
    const list = picked.candidates.map((c) => `"${c}"`).join(", ");
    return refuse(
      params.table
        ? `"${note.title}" has no single table "${params.table}". Its tables: ${list}. Call again with \`table\` set to one of them.`
        : `"${note.title}" holds several tables: ${list}. Call again with \`table\` set to the one you want.`,
      { noteTitle: note.title },
      isHiddenTableNote(note)
    );
  }

  const table = picked.table;
  const { roll, entry } = rollTable(table);
  // A rolled name is the engine's: add_npc takes it (names/accept.ts).
  pushRolledName(storyData, entry.text);
  const label = tablePathLabel(table.path);
  const rolledOn = `${note.title}${label ? ` > ${label}` : ""}`;
  const instructions = [table.instructions, parsed.noteInstructions]
    .filter((x): x is string => !!x)
    .join(" ")
    .slice(0, 700);
  let contextForStory = `[${displayName}: ${rolledOn} (${dieLabel(
    table.die
  )}) rolled ${roll}: "${entry.text}"]`;
  contextForStory += `\n[Reason: ${params.reason}]`;
  if (instructions) {
    contextForStory += `\n[Around the table, for you to apply: ${instructions}]`;
  }
  if (isAgmtTable) {
    contextForStory += `\n[A built-in table is also called "${normalizedName}". To roll that one instead, call roll_table with table_name "builtin:${normalizedName}".]`;
  }

  // A note the player may not read ahead of play keeps its roll private, as
  // gm_roll does: publicSummary returns null for a hidden result.
  const hidden = isHiddenTableNote(note);
  return {
    toolName: "roll_table",
    toolCallId,
    success: true,
    ...(hidden ? { hiddenFromPlayer: true } : {}),
    result: {
      type: "roll_table",
      tableName: rolledOn,
      result: entry.text,
      reason: params.reason,
      displayName: params.display_name,
      noteTitle: note.title,
      tablePath: label || undefined,
      roll,
      instructions: instructions || undefined,
    } as GMRollTableResult,
    contextForStory,
  };
}

const normalizeTableTitle = (title: string): string =>
  (title || "")
    .toLowerCase()
    .replace(/\.md$/i, "")
    .replace(/\s+[–—-]\s+/g, " — ")
    .replace(/[_\s]+/g, " ")
    .trim();

/**
 * The enabled `type: "table"` notes a name points at, by the same loose
 * matching `read_notes` uses: the whole title (case, spacing, dashes and a
 * ".md" suffix ignored), then the part after a built-in note's " — " prefix,
 * then a title that contains the name or is contained in it. The first rule
 * that matches anything decides; several matches are returned so the caller
 * can refuse and list them.
 */
function isHiddenTableNote(l: StoryLore): boolean {
  return l.visibility !== undefined && l.visibility !== "always_reveal";
}

function findTableNotes(
  storyData: StoryData,
  name: string,
  strict = false
): StoryLore[] {
  const wanted = normalizeTableTitle(name);
  if (!wanted) return [];
  const notes = (storyData.lore || []).filter(
    (l) => l.type === "table" && l.enabled !== false
  );
  const exact = notes.filter((l) => normalizeTableTitle(l.title) === wanted);
  if (exact.length) return exact;
  const byName = notes.filter((l) => {
    if (!l.libraryNoteId?.startsWith("builtin:")) return false;
    const t = normalizeTableTitle(l.title);
    const at = t.indexOf(" — ");
    return at >= 0 && t.slice(at + 3) === wanted;
  });
  if (byName.length) return byName;
  // A built-in's name ("city") is only taken over by a note of that exact name.
  if (strict) return [];
  return notes.filter((l) => {
    const t = normalizeTableTitle(l.title);
    return t.includes(wanted) || wanted.includes(t);
  });
}

/** Up to three table-note titles sharing the most words with a missed name. */
function closestTableTitles(storyData: StoryData, name: string): string[] {
  const words = new Set(
    normalizeTableTitle(name)
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 1)
  );
  return (storyData.lore || [])
    .filter((l) => l.type === "table" && l.enabled !== false && !isHiddenTableNote(l))
    .map((l) => ({
      title: l.title,
      score: normalizeTableTitle(l.title)
        .split(/[^a-z0-9]+/)
        .filter((w) => words.has(w)).length,
    }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((x) => x.title);
}

/**
 * Roll three names for a new person or place (randomness plan R2, decision
 * 260). The names come from the story's name tables, its system's declared
 * ones, or the built-in lists (names/); they go on the story's ledger, so
 * add_npc and the campaign tool accept them. `style` asks for the built-in
 * lists in that style and is remembered the first time it is given.
 */
function executeGenerateName(
  toolCallId: string,
  params: GenerateNameParams,
  storyData: StoryData
): GMToolResult {
  const kind = params?.kind === "place" ? "place" : "person";
  const style = isNameStyle(params?.style) ? params.style : undefined;
  if (style && !storyData.nameStyle) storyData.nameStyle = style;
  const names = rollNames(storyData, kind, 3, { style });
  pushOffered(storyData, names);
  return {
    toolName: "generate_name",
    toolCallId,
    success: true,
    result: {
      type: "generate_name",
      kind,
      names,
      reason: params?.reason,
    } as GMGenerateNameResult,
    contextForStory: `[Names rolled for a new ${kind}${
      params?.reason ? ` (${params.reason})` : ""
    }: ${names.join(", ")}. Use one of them, as it is.]`,
  };
}

/**
 * Puts a table entry on the name ledger when it reads as a name (a few words,
 * no sentence), so rolling "Names" and then calling add_npc works. A long entry
 * (a rumour, a hook) would only push real names off the ledger.
 */
function pushRolledName(story: StoryData, text: string): void {
  const name = entryName(text);
  if (!name || name.length > 40 || name.split(/\s+/).length > 4 || /[.!?]/.test(name)) return;
  pushOffered(story, [name]);
}

/**
 * The refusal for a name the engine did not roll, or null when the name is
 * accepted (names/accept.ts). Offers three fresh names and puts them on the
 * ledger, so the GM's retry passes. Mutates `story` (the working copy).
 */
function unrolledNameRefusal(
  story: StoryData,
  kind: "person" | "place",
  name: string | undefined,
  nameCtx?: NameCheckContext
): string | null {
  if (!name || !name.trim()) return null;
  if (isNameAccepted(name, story, nameCtx)) return null;
  const offered = rollNames(story, kind, 3);
  pushOffered(story, offered);
  return `That name wasn't rolled. Use one of: ${offered.join(", ")}, or call generate_name.`;
}

const IMAGE_DESCRIPTION_MAX_CHARS = 400;

/**
 * Queue a picture (docs/image-generation-design.md §3.1). The engine disposes:
 * everything is checked before anything is spent, and a refusal comes back with
 * a reason the GM can read. The picture itself is made in the background, so
 * this answers at once and the turn is never held up.
 *
 * - pictures on and a key present (ctx.enabled), else refused;
 * - fewer than the per-scene cap this scene (StoryData.imageState, reset when
 *   computeSceneKey changes, the tier3CallsInScene pattern);
 * - npc_id / lore_title name something that exists, and it has no picture yet;
 * - `featuring` is trimmed to ids that exist.
 */
function executeGenerateImage(
  toolCallId: string,
  params: GenerateImageParams,
  storyData: StoryData,
  ctx: ImageToolContext | undefined
): GMToolResult {
  const subject = params?.subject;
  const refuse = (reason: string): GMToolResult => ({
    toolName: "generate_image",
    toolCallId,
    success: false,
    result: {
      type: "generate_image",
      subject: subject ?? "scene",
      accepted: false,
      reason,
    } as GMGenerateImageResult,
    contextForStory: `[generate_image refused: ${reason}] Carry on without a picture.`,
  });

  if (!ctx || !ctx.enabled) {
    return refuse("pictures are turned off, or no image key is set.");
  }
  if (
    subject !== "scene" &&
    subject !== "npc" &&
    subject !== "player" &&
    subject !== "location"
  ) {
    return refuse('subject must be "scene", "npc", "player" or "location".');
  }
  const description =
    typeof params.description === "string"
      ? params.description.trim().slice(0, IMAGE_DESCRIPTION_MAX_CHARS)
      : "";
  if (!description) {
    return refuse("description is required: what a camera would see.");
  }

  // The per-scene cap, reset at the scene boundary.
  const sceneKey = computeSceneKey(storyData);
  const prior = storyData.imageState;
  const usedThisScene =
    prior && prior.lastSceneKey === sceneKey ? prior.gmImagesInScene : 0;
  if (usedThisScene >= ctx.maxPerScene) {
    return refuse(
      `this scene has already had its ${ctx.maxPerScene} picture${
        ctx.maxPerScene === 1 ? "" : "s"
      }. Wait for the next scene.`
    );
  }

  const npcs = storyData.npcs ?? [];
  const findNpc = (ref: string) => {
    const wanted = ref.trim().toLowerCase();
    return npcs.find(
      (n) => n.id === ref || n.name.trim().toLowerCase() === wanted
    );
  };

  // An id whose file is gone (cleared, or made on another device) is no picture.
  const hasPicture = (id: string | undefined) =>
    !!id && !ctx.missingImageIds?.has(id);

  let target: ImageJobTarget;
  let npcIndex = -1;
  let loreIndex = -1;
  const featuring: string[] = [];

  if (subject === "npc") {
    const npc = params.npc_id ? findNpc(params.npc_id) : undefined;
    if (!npc) {
      return refuse(
        `npc_id "${params.npc_id ?? ""}" is not a known NPC. Add the NPC first, then ask for the portrait.`
      );
    }
    if (hasPicture(npc.portraitImageId)) {
      return refuse(`${npc.name} already has a portrait.`);
    }
    npcIndex = npcs.indexOf(npc);
    target = { kind: "npc", npcId: npc.id };
    featuring.push(npc.id);
  } else if (subject === "player") {
    if (hasPicture(storyData.playerPortraitImageId)) {
      return refuse("the player character already has a portrait.");
    }
    target = { kind: "player" };
    featuring.push("player");
  } else if (subject === "location") {
    const wanted = (params.lore_title ?? "").trim().toLowerCase();
    const lore = storyData.lore ?? [];
    loreIndex = lore.findIndex((l) => l.title.trim().toLowerCase() === wanted);
    if (!wanted || loreIndex < 0) {
      return refuse(
        `lore_title "${params.lore_title ?? ""}" is not the title of a note. Use the exact title.`
      );
    }
    if (hasPicture(lore[loreIndex].imageId) || lore[loreIndex].thumbnailUrl) {
      return refuse(`the note "${lore[loreIndex].title}" already has a picture.`);
    }
    target = { kind: "lore", loreTitle: lore[loreIndex].title };
  } else {
    target = { kind: "scenePart", partId: ctx.scenePartId };
    for (const ref of Array.isArray(params.featuring) ? params.featuring : []) {
      if (typeof ref !== "string") continue;
      const id = ref.trim().toLowerCase() === "player" ? "player" : findNpc(ref)?.id;
      if (id && !featuring.includes(id)) featuring.push(id);
    }
  }

  const imageId = ctx.enqueue({ subject, description, featuring, target });

  // Count it, and put the pending id where the picture will live, on the
  // working copy the turn is about to commit.
  storyData.imageState = {
    gmImagesInScene: usedThisScene + 1,
    lastSceneKey: sceneKey,
  };
  if (npcIndex >= 0) {
    npcs[npcIndex] = { ...npcs[npcIndex], portraitImageId: imageId };
  } else if (subject === "player") {
    storyData.playerPortraitImageId = imageId;
  } else if (loreIndex >= 0) {
    storyData.lore[loreIndex] = { ...storyData.lore[loreIndex], imageId };
  } else {
    ctx.onSceneImage?.({ imageId, requestedBy: "gm", description });
  }

  const where =
    subject === "scene"
      ? "under this turn"
      : subject === "location"
        ? "on that note"
        : "on their page";
  return {
    toolName: "generate_image",
    toolCallId,
    success: true,
    result: {
      type: "generate_image",
      subject,
      accepted: true,
      imageId,
    } as GMGenerateImageResult,
    contextForStory: `Picture requested; it will appear ${where}. Don't describe it in the prose.`,
  };
}

/**
 * Read notes by exact title - used by GM to fetch note content
 * Notes are from the World Lore and Secrets folders
 */
function executeReadNotes(
  toolCallId: string,
  params: ReadNotesParams,
  storyData: StoryData
): GMToolResult {
  // Handle multiple parameter names - LLMs often confuse these:
  // - "titles" (correct, array)
  // - "title" (singular string or array)
  // - "notes" (array - common mistake)
  // - "note" (singular string)
  let titles = params.titles;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const paramsAny = params as any;
  if (!titles && paramsAny.title) {
    // AI sent "title" (singular) instead of "titles" (array) - normalize it
    titles = Array.isArray(paramsAny.title)
      ? paramsAny.title
      : [paramsAny.title];
  }
  if (!titles && paramsAny.notes) {
    // AI sent "notes" instead of "titles" - normalize it
    titles = Array.isArray(paramsAny.notes)
      ? paramsAny.notes
      : [paramsAny.notes];
  }
  if (!titles && paramsAny.note) {
    // AI sent "note" (singular) instead of "titles" - normalize it
    titles = Array.isArray(paramsAny.note) ? paramsAny.note : [paramsAny.note];
  }

  if (!titles || titles.length === 0) {
    return {
      toolName: "read_notes",
      toolCallId,
      success: false,
      result: {
        type: "read_notes",
        readCount: 0,
        titles: [],
      },
      contextForStory: "[Read Notes: No titles provided]",
    };
  }

  // Search through lore entries for matching titles
  const loreEntries = storyData.lore || [];
  const foundNotes: Array<{
    title: string;
    content: string;
    type: string;
    visibility?: LoreVisibility;
  }> = [];
  const notFoundTitles: string[] = [];
  const notFoundHints = new Map<string, string>();

  // Helper to normalize title for matching (strip .md suffix, case-insensitive,
  // and one separator for the en dash, em dash and hyphen between spaces).
  const normalizeTitle = (title: string): string => {
    return title
      .toLowerCase()
      .replace(/\.md$/i, "")
      .replace(/\s+[–—-]\s+/g, " — ")
      .replace(/\s+/g, " ")
      .trim();
  };
  // The part of a built-in note's title after its " — " prefix.
  const builtinName = (e: { title: string; libraryNoteId?: string }) => {
    if (!e.libraryNoteId?.startsWith("builtin:")) return null;
    const t = normalizeTitle(e.title);
    const at = t.indexOf(" — ");
    return at < 0 ? null : t.slice(at + 3);
  };
  // Up to three enabled titles sharing the most words with a missed request.
  const closestTitles = (request: string): string[] => {
    const words = new Set(
      normalizeTitle(request).split(/[^a-z0-9]+/).filter((w) => w.length > 1)
    );
    return loreEntries
      .filter((e) => e.enabled !== false)
      .map((e) => ({
        title: e.title,
        score: normalizeTitle(e.title)
          .split(/[^a-z0-9]+/)
          .filter((w) => words.has(w)).length,
      }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map((x) => x.title);
  };

  for (const requestedTitle of titles) {
    const normalizedRequest = normalizeTitle(requestedTitle);
    // Find entry with matching title (case-insensitive, .md suffix tolerant)
    let entry = loreEntries.find(
      (e) =>
        normalizeTitle(e.title) === normalizedRequest && e.enabled !== false
    );
    if (!entry) {
      // "Havens" for "B&B — Havens": accepted when exactly one built-in note
      // carries that name.
      const byName = loreEntries.filter(
        (e) => e.enabled !== false && builtinName(e) === normalizedRequest
      );
      if (byName.length === 1) entry = byName[0];
    }

    if (entry) {
      foundNotes.push({
        title: entry.title,
        content: entry.content,
        type: entry.type || "lore",
        visibility: entry.visibility,
      });
    } else {
      const close = closestTitles(requestedTitle);
      notFoundTitles.push(requestedTitle);
      if (close.length) {
        notFoundHints.set(
          requestedTitle,
          `${requestedTitle} (closest: ${close.map((t) => `"${t}"`).join(", ")})`
        );
      }
    }
  }

  // Build context for the GM
  let contextForStory = `[Read Notes: ${titles.join(", ")}]`;

  if (foundNotes.length === 0) {
    contextForStory += `\n[No notes found with those titles]`;
    if (notFoundTitles.length > 0) {
      contextForStory += `\n[Not found: ${notFoundTitles.map((t) => notFoundHints.get(t) ?? t).join(", ")}]`;
    }
  } else {
    contextForStory += `\n[Found ${foundNotes.length} of ${titles.length} notes]`;
    if (notFoundTitles.length > 0) {
      contextForStory += `\n[Not found: ${notFoundTitles.map((t) => notFoundHints.get(t) ?? t).join(", ")}]`;
    }
    for (const note of foundNotes) {
      const typeSuffix =
        note.type === "secret"
          ? " (Secret)"
          : note.type === "mechanics"
          ? " (Rules)"
          : "";
      // Two-Pass Visibility (§2.3): hidden/to_be_revealed/check_per_turn
      // content is wrapped in HIDDEN_LORE markers. You (the GM) can read
      // and reason about it now, but stripHiddenLoreContent() removes
      // everything between these markers before the Narrator stage ever
      // sees it - it literally cannot leak into prose until you call
      // edit_note to flip this entry's visibility to "always_reveal".
      // A secret note is wrapped too, so the player's view of this result
      // ends its redaction at the marker, not at a guess (turnTimeline.ts).
      const isHidden = isHiddenFromPlayerNote(note);
      if (isHidden) {
        contextForStory += `\n\n---\n### ${note.title}${typeSuffix} [[HIDDEN_LORE:${note.title}]]\n(HIDDEN FROM PLAYER - do not narrate this content or reveal its existence. To reveal it once the player genuinely discovers it, call edit_note with visibility: "always_reveal".)\n${note.content}[[/HIDDEN_LORE]]`;
      } else {
        contextForStory += `\n\n---\n### ${note.title}${typeSuffix}\n${note.content}`;
      }
    }
    contextForStory += `\n---`;
  }

  return {
    toolName: "read_notes",
    toolCallId,
    success: foundNotes.length > 0,
    result: {
      type: "read_notes",
      readCount: foundNotes.length,
      titles: foundNotes.map((n) => n.title),
      notFoundTitles: notFoundTitles.length > 0 ? notFoundTitles : undefined,
    },
    contextForStory,
  };
}

/**
 * Execute get_game_state: render the CURRENT live volatile state so the GM
 * can re-sync mid-turn after its own tool calls have mutated things (the
 * state message injected at turn-start is only a snapshot). Deliberately
 * volatile-only - lore/NPC notes are read_notes' job, memory is
 * search_memory's. Pure and synchronous; reads storyData, mutates nothing.
 */
function executeGetGameState(
  toolCallId: string,
  params: GetGameStateParams,
  storyData: StoryData
): GMToolResult {
  const ALL_SECTIONS: GameStateSection[] = [
    "challenge",
    "combat",
    "timers",
    "goals",
    "threads",
  ];
  // Normalize the section filter: keep only recognized sections; an empty or
  // missing filter means "all of them".
  const requested =
    params.sections && params.sections.length > 0
      ? ALL_SECTIONS.filter((s) => params.sections!.includes(s))
      : ALL_SECTIONS;

  const blocks: string[] = [];
  const includedSections: GameStateSection[] = [];

  if (requested.includes("challenge")) {
    const ch = storyData.activeChallenge;
    if (ch && ch.active) {
      const needWin = ch.requiredSuccesses ?? Math.ceil(ch.rounds / 2);
      const needLose = ch.maxFailures ?? Math.ceil(ch.rounds / 2);
      const progress =
        ch.mode === "tally"
          ? `- Tally challenge: round ${(ch.recorded ?? 0) + 1} of ${ch.rounds}, tally ${formatSigned(ch.tally ?? 0)} (strong hit +1, weak hit 0, miss -1)`
          : `- Successes: ${ch.currentSuccesses}/${needWin} needed to WIN\n` +
            `- Failures: ${ch.currentFailures}/${needLose} needed to LOSE`;
      blocks.push(
        `### ⚔️ Active Challenge: ${ch.name}\n` +
          progress +
          (ch.description ? `\n- ${ch.description}` : "")
      );
      includedSections.push("challenge");
    }
  }

  if (requested.includes("combat")) {
    const combat = storyData.combatState;
    if (combat && combat.active) {
      const order =
        combat.turnOrder && combat.turnOrder.length > 0
          ? combat.turnOrder
          : combat.combatants.map((c) => c.id);
      const currentId = order[combat.currentTurnIndex];
      const lines = order.map((id) => {
        const c = combat.combatants.find((cb) => cb.id === id);
        if (!c) return null;
        const statStr =
          Object.entries(c.stats)
            .map(([k, v]) => `${k} ${v}`)
            .join(", ") || "no stats";
        const conds =
          c.conditions && c.conditions.length > 0
            ? ` [${c.conditions
                .map((cond) =>
                  cond.duration !== undefined
                    ? `${cond.name} (${cond.duration})`
                    : cond.name
                )
                .join(", ")}]`
            : "";
        const marker = id === currentId ? "▶ " : "  ";
        const downed = c.isActive ? "" : " (out of combat)";
        return `${marker}${c.name} [${c.type}]: ${statStr}${conds}${downed}`;
      });
      blocks.push(
        `### 🗡️ Combat: ${combat.name || "in progress"} — Round ${combat.round}\n` +
          `(▶ marks whose turn it is now)\n` +
          lines.filter(Boolean).join("\n")
      );
      includedSections.push("combat");
    }
  }

  if (requested.includes("timers") && storyData.campaign) {
    // With a campaign record the timers are clocks.
    const clocks = storyData.campaign.clocks.filter((c) => !c.cancelled);
    if (clocks.length > 0) {
      const lines = clocks.map(
        (c) =>
          `- ${c.name}: ${c.filled}/${c.segments}${c.paused ? " (paused)" : ""}${
            c.visible ? "" : " [hidden]"
          }${c.onFill ? ` — ${c.onFill}` : ""}`
      );
      blocks.push(`### ⏳ Clocks\n${lines.join("\n")}`);
      includedSections.push("timers");
    }
  } else if (requested.includes("timers")) {
    const timers = (storyData.timers || []).filter(
      (t) => t.status === "active" || t.status === "paused"
    );
    if (timers.length > 0) {
      const lines = timers.map(
        (t) =>
          `- ${t.name}: ${t.currentTicks}/${t.totalTicks} ticks left${
            t.status === "paused" ? " (paused)" : ""
          }${t.description ? ` — ${t.description}` : ""}`
      );
      blocks.push(`### ⏳ Timers\n${lines.join("\n")}`);
      includedSections.push("timers");
    }
  }

  if (requested.includes("goals")) {
    const goals = (storyData.goals || []).filter(
      (g) => g.active && !g.fulfilled
    );
    if (goals.length > 0) {
      const lines = goals.map(
        (g) => `- ${g.title}: ${g.shortDescription || g.description}`
      );
      blocks.push(`### 🎯 Active Goals\n${lines.join("\n")}`);
      includedSections.push("goals");
    }
  }

  if (requested.includes("threads")) {
    const threads = (storyData.threads || []).filter(
      (t) => t.status === "active"
    );
    if (threads.length > 0) {
      const lines = threads.map(
        (t) => `- ${t.title}${t.priority ? ` (${t.priority})` : ""}`
      );
      blocks.push(`### 🧵 Open Threads\n${lines.join("\n")}`);
      includedSections.push("threads");
    }
  }

  const hasActiveState = blocks.length > 0;
  const contextForStory = hasActiveState
    ? `📋 CURRENT GAME STATE (live)\n\n${blocks.join("\n\n")}`
    : `📋 CURRENT GAME STATE (live)\n\nNo active volatile state right now (no active challenge, combat, timers, goals, or threads for the requested sections). This is normal - not an error.`;

  return {
    toolName: "get_game_state",
    toolCallId,
    success: true,
    result: {
      type: "get_game_state",
      sections: includedSections,
      hasActiveState,
    },
    contextForStory,
  };
}

/**
 * Flat probability a "check_per_turn" lore entry gets passively noticed on
 * any given turn - tunable, deliberately simple (no stat/DC comparison,
 * since freeform character-sheet adventures have no reliable numeric
 * perception score to check against - see H8's residual gap in
 * docs/architecture-frontier.md). Digital equivalent of a passive
 * Perception check a human GM tracks silently.
 */
const CHECK_PER_TURN_REVEAL_CHANCE = 0.2;

/**
 * Resolves all "check_per_turn" visibility lore entries once per GM turn,
 * flipping some to "always_reveal" via a flat-probability roll (see
 * CHECK_PER_TURN_REVEAL_CHANCE). Pure and synchronous - mutates storyData
 * in place, same "deterministic engine decides, model narrates" discipline
 * as selectDirectorMove in mythic.ts. Call once per turn, before the GM
 * round loop starts, so a freshly-revealed entry is available to both GM
 * reasoning and (once revealed) the Narrator this same turn.
 */
export function resolveCheckPerTurnVisibility(storyData: StoryData): string[] {
  const revealed: string[] = [];
  if (!storyData.lore) return revealed;
  for (const entry of storyData.lore) {
    if (entry.visibility !== "check_per_turn") continue;
    if (Math.random() < CHECK_PER_TURN_REVEAL_CHANCE) {
      entry.visibility = "always_reveal";
      revealed.push(entry.title);
    }
  }
  return revealed;
}

/**
 * Execute a search through memory entries. Falls back to semantic search
 * (embeddings) when the literal pattern match finds nothing and semantic
 * search is configured for this story - see semanticSearchFallback.ts.
 */
async function executeSearchMemory(
  toolCallId: string,
  params: SearchMemoryParams,
  storyData: StoryData,
  semanticContext: SemanticSearchContext
): Promise<GMToolResult> {
  const { patterns, max_results = 10 } = params;

  if (!patterns || patterns.length === 0) {
    return {
      toolName: "search_memory",
      toolCallId,
      success: false,
      result: {
        type: "search_memory",
        matchCount: 0,
        totalMemories: storyData.memory?.length || 0,
      },
      contextForStory: "[Search Memory: No patterns provided]",
    };
  }

  // Search through memory entries
  const memoryEntries = storyData.memory || [];
  const matches: string[] = [];

  for (const entry of memoryEntries) {
    const content = getMemoryContent(entry);

    // Check if any pattern matches (case-insensitive)
    const matchedPatterns = patterns.filter((pattern) =>
      content.toLowerCase().includes(pattern.toLowerCase())
    );

    if (matchedPatterns.length > 0) {
      matches.push(content);
      if (matches.length >= max_results) break;
    }
  }

  // Build context for the GM
  let contextForStory = `[Search Memory: ${patterns.join(", ")}]`;

  if (matches.length === 0) {
    // Literal match found nothing - try semantic search before giving up.
    const semanticOutcome = await semanticSearchFallback(
      "memory",
      patterns.join(" "),
      semanticContext,
      memoryEntries
    );
    if (semanticOutcome.status === "ok" && semanticOutcome.matches.length > 0) {
      const semanticMatches = semanticOutcome.matches;
      contextForStory += `\n[No exact matches, but found ${
        semanticMatches.length
      } semantically related ${
        semanticMatches.length === 1 ? "memory" : "memories"
      }]`;
      for (let i = 0; i < semanticMatches.length; i++) {
        contextForStory += `\n\n**Related memory ${i + 1}:** ${semanticMatches[i].content}`;
      }
      return {
        toolName: "search_memory",
        toolCallId,
        success: true,
        result: {
          type: "search_memory",
          matchCount: semanticMatches.length,
          totalMemories: memoryEntries.length,
        },
        contextForStory,
      };
    }
    if (semanticOutcome.status === "error") {
      // A real degradation, not "genuinely nothing relevant" - tell the GM
      // rather than letting it treat this like a confirmed empty search (H4).
      contextForStory += `\n[No exact matches. Semantic search is unavailable right now (${semanticOutcome.message}) - only exact matches were checked]`;
    } else {
      contextForStory += `\n[No matching memories found (searched ${memoryEntries.length} entries)]`;
    }
  } else {
    contextForStory += `\n[Found ${matches.length} matching ${
      matches.length === 1 ? "memory" : "memories"
    }]`;
    for (let i = 0; i < matches.length; i++) {
      contextForStory += `\n\n**Memory ${i + 1}:** ${matches[i]}`;
    }
  }

  return {
    toolName: "search_memory",
    toolCallId,
    success: matches.length > 0,
    result: {
      type: "search_memory",
      matchCount: matches.length,
      totalMemories: memoryEntries.length,
    },
    contextForStory,
  };
}

/**
 * Self-escalation request from the GM model, intercepted by the
 * reasoning-tier router. Applies decay/cap policy and updates
 * storyData.reasoningTierState directly (mutating `modified`, same as
 * every other GM tool) - generation.ts re-reads that state each round
 * to pick which model handles the next round.
 */
function executeSetReasoningTier(
  toolCallId: string,
  params: SetReasoningTierParams,
  storyData: StoryData
): GMToolResult {
  const requestedTier = typeof params?.tier === "number" ? params.tier : 0;
  const reason = params?.reason || "(no reason given)";

  const decision = applyTierEscalation(storyData, requestedTier, reason);
  const grantedTier = decision.grantedTier;

  let contextForStory: string;
  if (decision.capped) {
    contextForStory = `[Reasoning tier escalation to ${requestedTier} capped at ${grantedTier} - scene top-tier limit reached]`;
  } else if (grantedTier > decision.previousTier) {
    contextForStory = `[Reasoning tier escalated to ${grantedTier}: ${reason}]`;
  } else {
    contextForStory = `[Reasoning tier escalation request ignored - already at tier ${grantedTier}]`;
  }

  return {
    toolName: "set_reasoning_tier",
    toolCallId,
    success: true,
    result: {
      type: "set_reasoning_tier",
      requestedTier,
      grantedTier,
      capped: decision.capped,
      reason,
    } as GMSetReasoningTierResult,
    contextForStory,
  };
}

/**
 * Session zero -> real play handoff. Names the story (replacing the
 * "New Story" placeholder), optionally records the agreed premise, and
 * clears sessionZeroActive so the reasoning-tier router's hard floor
 * (hardRuleFloor, reasoningTiers.ts) stops forcing TOP_TIER. Also resets
 * reasoningTierState to baseline immediately, rather than letting it decay
 * down over subsequent turns - session zero ending is a hard cut back to
 * normal pacing, not a gradual one.
 *
 * Refuses to run without a campaign plan (hasCampaignPlan, campaignPlan.ts):
 * writing the spine is part of session zero's job, and a campaign that starts
 * without one never gets one - the one-beat-ahead gate has nothing to
 * advance, so the whole plan layer stays dark for the rest of the campaign.
 * Same posture as the Phase 4 grounding gate on create_note: a failed tool
 * response the GM can act on in the next round, not a blocked turn (the round
 * loop keeps going, and narration is unaffected either way).
 */
function executeStartGame(
  toolCallId: string,
  params: StartGameParams,
  storyData: StoryData,
  setupPlayers?: { id: string; name: string }[]
): GMToolResult {
  // Outside session zero there is nothing to start (a second call, an old
  // save): refuse, so it can't rename the story or reset the tier state.
  if (storyData.sessionZeroActive !== true) {
    return {
      toolName: "start_game",
      toolCallId,
      success: false,
      result: {
        type: "start_game",
        story_name: params.story_name,
        premise: params.premise,
      } as GMStartGameResult,
      contextForStory: "[ERROR: The game has already started.]",
    };
  }

  // Session zero is over only when the character sheet(s) and the plan exist
  // and the player approved exactly those (getSetupProgress, campaignPlan.ts).
  // Judged on the working copy, which holds this batch's earlier edits.
  const progress = getSetupProgress(storyData, setupPlayers);
  // The tone and safety step is the one creation step start_game names
  // itself: lines and veils may be "none", but they must have been asked.
  const safetyUnasked = progress.creation.missing.some(
    (m) => m.step.id === "tone_safety"
  );
  if (
    !progress.character ||
    !progress.campaign ||
    !progress.approved ||
    safetyUnasked
  ) {
    const missing: string[] = [];
    if (!progress.character) {
      missing.push(
        progress.missingSheetFor.length > 0
          ? `no character sheet yet for ${progress.missingSheetFor.join(", ")} (create_note, type character_sheet, titled "Character: <name>")`
          : `no character sheet yet (create_note, type character_sheet)`
      );
    }
    if (!progress.campaign) {
      missing.push(campaignMissingText(storyData));
    }
    if (safetyUnasked) {
      missing.push(
        `the tone, lines and veils have not been asked yet (ask_question, setup_step "tone_safety"; "none" is a valid answer)`
      );
    }
    if (progress.character && progress.campaign && !progress.approved) {
      missing.push(
        storyData.setup?.approval
          ? "the sheet or the campaign changed after the player's OK, so the OK no longer counts. Call confirm_setup again"
          : "the player has not approved the setup yet. Call confirm_setup and wait for their OK"
      );
    }
    return {
      toolName: "start_game",
      toolCallId,
      success: false,
      result: {
        type: "start_game",
        story_name: params.story_name,
        premise: params.premise,
      } as GMStartGameResult,
      contextForStory: `[ERROR: Cannot start the game yet - ${missing.join("; ")}. Then call start_game again.]`,
    };
  }

  storyData.story_name = params.story_name;
  if (params.premise) {
    storyData.premise = params.premise;
  }
  // Read before session zero closes: the opening the adventure's author
  // wrote, held back from the first screen (decision 197).
  const opening = authoredOpeningForStart(storyData);
  storyData.sessionZeroActive = false;
  storyData.reasoningTierState = {
    currentTier: SCENE_BASELINE_TIER,
    tier3CallsInScene: 0,
    lastSceneKey: computeSceneKey(storyData),
  };

  // The style's other expected parts are prep warnings, never a refusal
  // (design section 8). The line names parts only; the authoring checks that
  // quote a secret's title are the GM's alone (gmOnlyContext).
  const record = storyData.campaign;
  const styleWarning =
    record && record.origin !== "migrated" ? styleWarningLine(record) : "";
  const authoringWarnings =
    record && record.origin !== "migrated"
      ? campaignWarnings(record).filter((w) => !w.startsWith("No style set"))
      : [];
  // All of it is GM guidance, so none of it rides in contextForStory, which
  // the narrator's allowlist passes through for start_game.
  const gmWarnings = [styleWarning, ...authoringWarnings].filter(Boolean);

  return {
    toolName: "start_game",
    toolCallId,
    success: true,
    result: {
      type: "start_game",
      story_name: params.story_name,
      premise: params.premise,
    } as GMStartGameResult,
    contextForStory: `[Session zero complete - story named "${params.story_name}"${
      params.premise ? `. Premise: ${params.premise}` : ""
    }. Now write the campaign intro: first a short briefing in the story's voice (who the player is, where, what's at stake, why they are here), then the opening scene, ending on a clear first choice.${
      opening
        ? ` The adventure's author wrote the opening scene; play it after the briefing, keeping its place, time and people, adapted to the character(s) you built:
${opening}`
        : ""
    }]`,
    ...(gmWarnings.length > 0
      ? { gmOnlyContext: `[Campaign prep: ${gmWarnings.join(" ")}]` }
      : {}),
  };
}

/**
 * What start_game and confirm_setup say when the campaign is not ready: the
 * campaign tool builds it, and a plan note still counts for older stories.
 */
function campaignMissingText(story: StoryData): string {
  const record = story.campaign;
  const real = record && record.origin !== "migrated" ? record : undefined;
  const why = !real?.style
    ? `no style yet (campaign add, part "style")`
    : `nothing beyond the pitch yet`;
  return `the campaign is not ready: ${why}. Build it with the campaign tool: part "style", part "pitch" (premise and tone words), part "safety" (the lines and veils, empty lists for none), then at least one more part: a front with its clock, a faction, a location, a person, or a secret with its clues. The style's other expected parts only warn. (An older story's "Campaign Plan" gm_plan note also counts.)`;
}

/**
 * Execute confirm_setup: show the player the finished sheet(s) and plan and
 * wait for their decision (docs/session-zero-design.md 3.5). Refuses without
 * the sheet(s) or the plan. The card is built from the executor's working
 * copy, and an OK stores the hashes of exactly that text, so any later edit
 * to the sheet or the plan cancels it.
 */
async function executeConfirmSetup(
  toolCallId: string,
  params: ConfirmSetupParams,
  storyData: StoryData,
  interaction: GMInteractionHandlers,
  setupPlayers?: { id: string; name: string }[]
): Promise<GMToolResult> {
  const make = (
    success: boolean,
    outcome: GMConfirmSetupResult["outcome"],
    contextForStory: string,
    note?: string,
    started?: boolean
  ): GMToolResult => ({
    toolName: "confirm_setup",
    toolCallId,
    success,
    result: {
      type: "confirm_setup",
      outcome,
      ...(note ? { note } : {}),
      ...(started !== undefined ? { started } : {}),
    } as GMConfirmSetupResult,
    contextForStory,
  });

  if (storyData.sessionZeroActive !== true) {
    return make(false, "refused", "[ERROR: The game has already started.]");
  }

  const progress = getSetupProgress(storyData, setupPlayers);
  if (progress.creation.missing.length > 0) {
    // Group by who still has to be asked: "Nik about connections, burden".
    const groups = new Map<string, string[]>();
    for (const m of progress.creation.missing) {
      const key = m.player ?? "the table";
      groups.set(key, [...(groups.get(key) ?? []), m.step.id]);
    }
    const parts = [...groups].map(([who, ids]) => `${who} about ${ids.join(", ")}`);
    return make(
      false,
      "refused",
      `[ERROR: Not yet: you haven't asked ${parts.join("; ")}. Ask the next one with ask_question (setup_step "${progress.creation.missing[0].step.id}"), one step per call, then call confirm_setup.]`
    );
  }
  const missing: string[] = [];
  if (!progress.character) {
    missing.push(
      progress.missingSheetFor.length > 0
        ? `the character sheet for ${progress.missingSheetFor.join(", ")}`
        : "the character sheet"
    );
  }
  if (!progress.campaign) {
    // A sheet is written with create_note, the campaign with its own tool.
    const how = campaignMissingText(storyData);
    if (missing.length > 0) {
      return make(
        false,
        "refused",
        `[ERROR: Can't show the setup card yet - missing ${missing.join(" and ")} (write it with create_note), and ${how} Then call confirm_setup.]`
      );
    }
    return make(
      false,
      "refused",
      `[ERROR: Can't show the setup card yet - ${how} Then call confirm_setup.]`
    );
  }
  if (missing.length > 0) {
    return make(
      false,
      "refused",
      `[ERROR: Can't show the setup card yet - missing ${missing.join(" and ")}. Write ${missing.length > 1 ? "them" : "it"} with create_note first, then call confirm_setup.]`
    );
  }

  if (!interaction.requestSetupConfirmation) {
    return make(
      false,
      "refused",
      "[ERROR: confirm_setup is unavailable here - the setup card can't be shown. Tell the player what you built and ask in the chat whether to start.]"
    );
  }

  const { sheets, plan } = getSetupNotes(storyData);
  // The card shows the plan note when there is one, and the record's public
  // projection when there is a real record (never a secret). Readiness
  // guarantees at least one.
  const record =
    storyData.campaign && storyData.campaign.origin !== "migrated"
      ? storyData.campaign
      : undefined;
  if (!plan && !record) {
    // Unreachable after the progress check; keeps the types honest.
    return make(false, "refused", "[ERROR: the campaign is missing.]");
  }

  const answer = await interaction.requestSetupConfirmation({
    characterSummary: params.character_summary,
    campaignHook: params.campaign_hook,
    sheets: sheets.map((n) => ({ title: n.title, content: n.content ?? "" })),
    plan: {
      ...(plan
        ? { note: { title: plan.title, content: plan.content ?? "" } }
        : {}),
      ...(record ? { campaign: publicCampaignView(record) } : {}),
    },
  });

  if ("stopped" in answer) {
    return make(false, "stopped", "[The turn was stopped on the setup card.]");
  }
  if ("dismissed" in answer) {
    return make(
      false,
      "dismissed",
      "[The player closed the card; ask what they want to change.]"
    );
  }
  if (!answer.approved) {
    return make(
      false,
      "changes",
      `[The player wants changes before starting: "${answer.note}". Make the changes, then call confirm_setup again.]`,
      answer.note
    );
  }

  // Approved: bind the OK to the text the card showed (the working copy).
  storyData.setup = {
    ...storyData.setup,
    approval: currentSetupHashes(storyData),
  };
  // Pressing Start starts the game: run start_game on the same working copy
  // and fold its answer into this one result (results are matched to calls by
  // position), flagged `started` for generation.ts.
  const fallbackName = storyData.story_name?.trim();
  const started = executeStartGame(
    toolCallId,
    {
      story_name:
        params.story_name?.trim() ||
        (fallbackName && fallbackName !== "New Story" ? fallbackName : "Untitled Story"),
      premise: params.premise?.trim() || undefined,
    },
    storyData,
    setupPlayers
  );
  if (started.success) {
    const approved = make(
      true,
      "approved",
      `[Approved: the player pressed Start the story, and the game has started. ${started.contextForStory}]`,
      undefined,
      true
    );
    // The GM-only prep warnings (they may quote a secret's title).
    if (started.gmOnlyContext) approved.gmOnlyContext = started.gmOnlyContext;
    return approved;
  }
  // Believed unreachable: the approval just above made the hashes current, and
  // the checks start_game runs (sheet, plan, approval, session zero still on)
  // were all satisfied before the card opened. Kept so a future start_game
  // refusal reads as a plain 'did not start' instead of a false start.
  return make(
    true,
    "approved",
    `[Approved, but the game did NOT start. ${started.contextForStory}]`,
    undefined,
    false
  );
}

// ============================================
// COMBAT TOOL EXECUTORS
// ============================================

/**
 * Roll initiative for a combatant using their initiative formula
 */
function rollInitiative(initiative: string): number {
  // Check if it's a fixed number
  const fixed = parseFloat(initiative);
  if (!isNaN(fixed)) {
    return fixed;
  }

  // It's a dice formula, roll it
  try {
    const result = rollFormula(initiative);
    return result.total;
  } catch {
    // Fallback to 0 if formula is invalid
    console.error(`Invalid initiative formula: ${initiative}`);
    return 0;
  }
}

/**
 * Flatten dice group results into a flat array of numbers
 */
function flattenDiceRolls(rollResult: RollResult): number[] {
  return rollResult.rolls.flatMap((group) => group.keptRolls);
}

/**
 * Safely push to combat log (initializes if undefined)
 */
function logCombat(combatState: CombatState, message: string): void {
  if (!combatState.log) {
    combatState.log = [];
  }
  combatState.log.push(message);
}

/**
 * Find a combatant by name (case-insensitive fuzzy match)
 */
function findCombatant(
  combatState: CombatState,
  name: string
): Combatant | undefined {
  const lowerName = name.toLowerCase();
  return combatState.combatants.find(
    (c) =>
      c.name.toLowerCase() === lowerName ||
      c.id.toLowerCase() === lowerName ||
      c.name.toLowerCase().includes(lowerName)
  );
}

/**
 * Sort combatants by initiative (highest first) and update turn order
 */
function updateTurnOrder(combatState: CombatState): void {
  const activeCombatants = combatState.combatants
    .filter((c) => c.isActive)
    .sort((a, b) => (b.initiativeRoll ?? 0) - (a.initiativeRoll ?? 0));

  combatState.turnOrder = activeCombatants.map((c) => c.id);
}

/**
 * Initialize combat state
 */
function executeStartCombat(
  toolCallId: string,
  params: StartCombatParams,
  storyData: StoryData
): GMToolResult {
  // Check if combat is already active
  if (storyData.combatState?.active) {
    return {
      toolName: "start_combat",
      toolCallId,
      success: false,
      result: {
        type: "start_combat",
        name: params.name,
        description: params.description,
      } as GMStartCombatResult,
      contextForStory: `[Combat Error: Combat already in progress - "${storyData.combatState.name}"]`,
    };
  }

  // Initialize new combat state
  storyData.combatState = {
    active: true,
    name: params.name,
    combatants: [],
    turnOrder: [],
    currentTurnIndex: 0,
    round: 1,
    log: [`Combat started: ${params.name}`],
  };

  if (params.description) {
    logCombat(storyData.combatState, `Situation: ${params.description}`);
  }

  return {
    toolName: "start_combat",
    toolCallId,
    success: true,
    result: {
      type: "start_combat",
      name: params.name,
      description: params.description,
    } as GMStartCombatResult,
    contextForStory: `[Combat Started: "${params.name}"${
      params.description ? ` - ${params.description}` : ""
    }]`,
  };
}

/**
 * Add a combatant to active combat
 */
function executeAddCombatant(
  toolCallId: string,
  params: AddCombatantParams,
  storyData: StoryData
): GMToolResult {
  if (!storyData.combatState?.active) {
    return {
      toolName: "add_combatant",
      toolCallId,
      success: false,
      result: {
        type: "add_combatant",
        name: params.name,
        combatantType: params.type,
        stats: params.stats,
        initiative: params.initiative,
      } as GMAddCombatantResult,
      contextForStory: `[Combat Error: No active combat - cannot add combatant]`,
    };
  }

  // Auto-generate unique name if duplicate exists (Name → Name B → Name C → ...)
  let finalName = params.name;
  if (findCombatant(storyData.combatState, params.name)) {
    // Find a unique suffix
    const letters = "BCDEFGHIJKLMNOPQRSTUVWXYZ";
    for (const letter of letters) {
      const candidateName = `${params.name} ${letter}`;
      if (!findCombatant(storyData.combatState, candidateName)) {
        finalName = candidateName;
        break;
      }
    }
    // If all letters exhausted (unlikely), use timestamp
    if (finalName === params.name) {
      finalName = `${params.name} ${Date.now()
        .toString(36)
        .slice(-4)
        .toUpperCase()}`;
    }
  }

  // Roll initiative
  const initiativeRoll = rollInitiative(params.initiative);

  // Create the combatant
  const combatant: Combatant = {
    id: `combatant_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    name: finalName,
    type: params.type,
    stats: params.stats,
    conditions: [],
    initiative: params.initiative,
    initiativeRoll,
    loreRef: params.lore_ref,
    isActive: true,
    notes: params.notes,
  };

  storyData.combatState.combatants.push(combatant);

  // Update turn order with new combatant
  updateTurnOrder(storyData.combatState);

  // Log the addition
  const statsStr = Object.entries(params.stats)
    .map(([k, v]) => `${k}: ${v}`)
    .join(", ");
  logCombat(
    storyData.combatState,
    `${finalName} (${params.type}) joined combat with ${statsStr}. Initiative: ${initiativeRoll}`
  );

  return {
    toolName: "add_combatant",
    toolCallId,
    success: true,
    result: {
      type: "add_combatant",
      name: finalName,
      combatantType: params.type,
      stats: params.stats,
      initiative: params.initiative,
      initiativeRoll,
      loreRef: params.lore_ref,
      notes: params.notes,
    } as GMAddCombatantResult,
    contextForStory: `[Combatant Added: ${finalName} (${params.type}) - ${statsStr} - Initiative: ${initiativeRoll}]`,
  };
}

/**
 * Add multiple combatants to active combat at once
 * More efficient than calling add_combatant multiple times
 */
function executeAddMultipleCombatants(
  toolCallId: string,
  params: AddMultipleCombatantsParams,
  storyData: StoryData
): GMToolResult {
  if (!storyData.combatState?.active) {
    return {
      toolName: "add_multiple_combatants",
      toolCallId,
      success: false,
      result: {
        type: "add_multiple_combatants",
        added: [],
        failed: params.combatants.map((c) => c.name),
      } as GMAddMultipleCombatantsResult,
      contextForStory: `[Combat Error: No active combat - cannot add combatants]`,
    };
  }

  if (!params.combatants || params.combatants.length === 0) {
    return {
      toolName: "add_multiple_combatants",
      toolCallId,
      success: false,
      result: {
        type: "add_multiple_combatants",
        added: [],
        failed: [],
      } as GMAddMultipleCombatantsResult,
      contextForStory: `[Combat Error: No combatants provided]`,
    };
  }

  const addedCombatants: Array<{
    name: string;
    type: string;
    stats: Record<string, number>;
    initiative: number;
  }> = [];

  // Track names we've added this batch (for auto-suffixing within the same call)
  const usedNames = new Set<string>(
    storyData.combatState.combatants.map((c) => c.name.toLowerCase())
  );

  for (const combatantParams of params.combatants) {
    // Auto-generate unique name if duplicate exists
    let finalName = combatantParams.name;
    if (usedNames.has(finalName.toLowerCase())) {
      const letters = "BCDEFGHIJKLMNOPQRSTUVWXYZ";
      for (const letter of letters) {
        const candidateName = `${combatantParams.name} ${letter}`;
        if (!usedNames.has(candidateName.toLowerCase())) {
          finalName = candidateName;
          break;
        }
      }
      // If all letters exhausted, use timestamp
      if (finalName === combatantParams.name) {
        finalName = `${combatantParams.name} ${Date.now()
          .toString(36)
          .slice(-4)
          .toUpperCase()}`;
      }
    }

    // Track this name for subsequent combatants in the same batch
    usedNames.add(finalName.toLowerCase());

    // Roll initiative
    const initiativeRoll = rollInitiative(combatantParams.initiative);

    // Create the combatant
    const combatant: Combatant = {
      id: `combatant_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name: finalName,
      type: combatantParams.type,
      stats: combatantParams.stats,
      conditions: [],
      initiative: combatantParams.initiative,
      initiativeRoll,
      loreRef: combatantParams.lore_ref,
      isActive: true,
      notes: combatantParams.notes,
    };

    storyData.combatState.combatants.push(combatant);
    addedCombatants.push({
      name: finalName,
      type: combatantParams.type,
      stats: combatantParams.stats,
      initiative: initiativeRoll,
    });

    // Log the addition
    const statsStr = Object.entries(combatantParams.stats)
      .map(([k, v]) => `${k}: ${v}`)
      .join(", ");
    logCombat(
      storyData.combatState,
      `${finalName} (${combatantParams.type}) joined combat with ${statsStr}. Initiative: ${initiativeRoll}`
    );
  }

  // Update turn order once after all additions
  updateTurnOrder(storyData.combatState);

  // Build summary for context
  const summaryLines = addedCombatants.map((c) => {
    const statsStr = Object.entries(c.stats)
      .map(([k, v]) => `${k}: ${v}`)
      .join(", ");
    return `${c.name} (${c.type}): ${statsStr}, Init: ${c.initiative}`;
  });

  return {
    toolName: "add_multiple_combatants",
    toolCallId,
    success: true,
    result: {
      type: "add_multiple_combatants",
      added: addedCombatants,
      count: addedCombatants.length,
    } as GMAddMultipleCombatantsResult,
    contextForStory: `[${
      addedCombatants.length
    } Combatants Added]\n${summaryLines.join("\n")}`,
  };
}

/**
 * Unified add_combatant entry point: dispatches to the single- or
 * batch-add executors above based on whether a `combatants` array was
 * given, reusing their existing logic unchanged and relabeling the result's
 * toolName to match what was actually called (mirrors executeManageTimer).
 */
function executeAddCombatantUnified(
  toolCallId: string,
  params: AddCombatantUnifiedParams,
  storyData: StoryData
): GMToolResult {
  if (params.combatants && params.combatants.length > 0) {
    const result = executeAddMultipleCombatants(
      toolCallId,
      { combatants: params.combatants },
      storyData
    );
    return { ...result, toolName: "add_combatant" };
  }

  if (params.name && params.type && params.stats && params.initiative) {
    return executeAddCombatant(
      toolCallId,
      {
        name: params.name,
        type: params.type,
        stats: params.stats,
        initiative: params.initiative,
        lore_ref: params.lore_ref,
        notes: params.notes,
      },
      storyData
    );
  }

  return {
    toolName: "add_combatant",
    toolCallId,
    success: false,
    result: {
      type: "state_change",
      message:
        'add_combatant requires either single-combatant fields ("name", "type", "stats", "initiative") or a "combatants" array',
      command: "add_combatant",
    },
    contextForStory: `[ERROR: add_combatant requires either single-combatant fields ("name", "type", "stats", "initiative") or a "combatants" array]`,
  };
}

/**
 * Remove a combatant from combat
 */
function executeRemoveCombatant(
  toolCallId: string,
  params: RemoveCombatantParams,
  storyData: StoryData
): GMToolResult {
  if (!storyData.combatState?.active) {
    return {
      toolName: "remove_combatant",
      toolCallId,
      success: false,
      result: {
        type: "remove_combatant",
        name: params.combatant,
        reason: params.reason,
      } as GMRemoveCombatantResult,
      contextForStory: `[Combat Error: No active combat]`,
    };
  }

  const combatant = findCombatant(storyData.combatState, params.combatant);
  if (!combatant) {
    return {
      toolName: "remove_combatant",
      toolCallId,
      success: false,
      result: {
        type: "remove_combatant",
        name: params.combatant,
        reason: params.reason,
      } as GMRemoveCombatantResult,
      contextForStory: `[Combat Error: Combatant "${params.combatant}" not found]`,
    };
  }

  // Store final stats before removal
  const finalStats = { ...combatant.stats };

  // Mark as inactive instead of removing (keeps history)
  combatant.isActive = false;

  // Update turn order
  updateTurnOrder(storyData.combatState);

  // Log removal
  const reasonText =
    params.reason === "other" ? params.narrative || "removed" : params.reason;
  logCombat(storyData.combatState, `${combatant.name} ${reasonText}`);

  return {
    toolName: "remove_combatant",
    toolCallId,
    success: true,
    result: {
      type: "remove_combatant",
      name: combatant.name,
      reason: params.reason,
      narrative: params.narrative,
      finalStats,
    } as GMRemoveCombatantResult,
    contextForStory: `[Combatant Removed: ${combatant.name} - ${reasonText}]`,
  };
}

/**
 * Update a combatant's stat
 */
function executeUpdateCombatantStat(
  toolCallId: string,
  params: UpdateCombatantStatParams,
  storyData: StoryData
): GMToolResult {
  if (!storyData.combatState?.active) {
    return {
      toolName: "update_combatant_stat",
      toolCallId,
      success: false,
      result: {
        type: "update_combatant_stat",
        combatant: params.combatant,
        stat: params.stat,
        oldValue: 0,
        newValue: 0,
        change: 0,
      } as GMUpdateCombatantStatResult,
      contextForStory: `[Combat Error: No active combat]`,
    };
  }

  const combatant = findCombatant(storyData.combatState, params.combatant);
  if (!combatant) {
    return {
      toolName: "update_combatant_stat",
      toolCallId,
      success: false,
      result: {
        type: "update_combatant_stat",
        combatant: params.combatant,
        stat: params.stat,
        oldValue: 0,
        newValue: 0,
        change: 0,
      } as GMUpdateCombatantStatResult,
      contextForStory: `[Combat Error: Combatant "${params.combatant}" not found]`,
    };
  }

  const oldValue = combatant.stats[params.stat] ?? 0;
  let newValue: number;
  let change: number;
  let diceRolled: number[] | undefined;

  const valueStr = String(params.value);

  // Check if it's an absolute value (starts with =)
  if (valueStr.startsWith("=")) {
    const absValue = parseFloat(valueStr.slice(1));
    if (isNaN(absValue)) {
      return {
        toolName: "update_combatant_stat",
        toolCallId,
        success: false,
        result: {
          type: "update_combatant_stat",
          combatant: params.combatant,
          stat: params.stat,
          oldValue,
          newValue: oldValue,
          change: 0,
        } as GMUpdateCombatantStatResult,
        contextForStory: `[Combat Error: Invalid absolute value "${valueStr}"]`,
      };
    }
    newValue = absValue;
    change = newValue - oldValue;
  }
  // Check if it's a dice formula (contains 'd')
  else if (valueStr.toLowerCase().includes("d")) {
    try {
      // Handle +/- prefix for dice rolls
      const isSubtraction = valueStr.startsWith("-");
      const formula = isSubtraction
        ? valueStr.slice(1)
        : valueStr.replace(/^\+/, "");
      const result = rollFormula(formula);
      diceRolled = flattenDiceRolls(result);
      change = isSubtraction ? -result.total : result.total;
      newValue = oldValue + change;
    } catch {
      return {
        toolName: "update_combatant_stat",
        toolCallId,
        success: false,
        result: {
          type: "update_combatant_stat",
          combatant: params.combatant,
          stat: params.stat,
          oldValue,
          newValue: oldValue,
          change: 0,
        } as GMUpdateCombatantStatResult,
        contextForStory: `[Combat Error: Invalid dice formula "${valueStr}"]`,
      };
    }
  }
  // Otherwise, it's a numeric delta
  else {
    const numericValue =
      typeof params.value === "number" ? params.value : parseFloat(valueStr);
    if (isNaN(numericValue)) {
      return {
        toolName: "update_combatant_stat",
        toolCallId,
        success: false,
        result: {
          type: "update_combatant_stat",
          combatant: params.combatant,
          stat: params.stat,
          oldValue,
          newValue: oldValue,
          change: 0,
        } as GMUpdateCombatantStatResult,
        contextForStory: `[Combat Error: Invalid value "${params.value}"]`,
      };
    }
    change = numericValue;
    newValue = oldValue + change;
  }

  // HP (and equivalent health stats) is the one stat the tool's own
  // description promises "cannot go below 0" - that floor was previously
  // asserted only in English. Enforce it in code, and auto-flag the
  // combatant defeated the way remove_combatant already does, rather than
  // leaving a walking 0-or-negative-HP combatant that nothing ever marks
  // inactive.
  const isHealthStat = ["hp", "health", "hitpoints", "hit points"].includes(
    params.stat.trim().toLowerCase()
  );
  let clamped = false;
  if (isHealthStat && newValue < 0) {
    newValue = 0;
    clamped = true;
  }
  let justDefeated = false;
  if (isHealthStat && newValue <= 0 && combatant.isActive) {
    combatant.isActive = false;
    justDefeated = true;
  }

  // Apply the change
  combatant.stats[params.stat] = newValue;

  // Log the change
  const changeStr = change >= 0 ? `+${change}` : `${change}`;
  const logEntry = params.reason
    ? `${combatant.name} ${params.stat}: ${oldValue} → ${newValue} (${changeStr}) - ${params.reason}`
    : `${combatant.name} ${params.stat}: ${oldValue} → ${newValue} (${changeStr})`;
  logCombat(storyData.combatState, logEntry);
  if (justDefeated) {
    logCombat(storyData.combatState, `${combatant.name} is defeated (0 HP)`);
    updateTurnOrder(storyData.combatState);
  }

  const diceInfo = diceRolled ? ` [rolled: ${diceRolled.join(", ")}]` : "";
  const defeatedInfo = justDefeated ? ` - ${combatant.name} is defeated!` : "";

  return {
    toolName: "update_combatant_stat",
    toolCallId,
    success: true,
    result: {
      type: "update_combatant_stat",
      combatant: combatant.name,
      stat: params.stat,
      oldValue,
      newValue,
      change,
      reason: params.reason,
      diceRolled,
      clampedToZero: clamped || undefined,
      defeated: justDefeated || undefined,
    } as GMUpdateCombatantStatResult,
    contextForStory: `[${combatant.name} ${
      params.stat
    }: ${oldValue} → ${newValue} (${changeStr})${
      params.reason ? ` - ${params.reason}` : ""
    }${diceInfo}${defeatedInfo}]`,
  };
}

/**
 * Toggle a condition on a combatant (add if missing, remove if present)
 */
function executeToggleCombatantCondition(
  toolCallId: string,
  params: ToggleCombatantConditionParams,
  storyData: StoryData
): GMToolResult {
  if (!storyData.combatState?.active) {
    return {
      toolName: "toggle_combatant_condition",
      toolCallId,
      success: false,
      result: {
        type: "toggle_combatant_condition",
        combatant: params.combatant,
        condition: params.condition,
        action: "added",
      } as GMToggleCombatantConditionResult,
      contextForStory: `[Combat Error: No active combat]`,
    };
  }

  const combatant = findCombatant(storyData.combatState, params.combatant);
  if (!combatant) {
    return {
      toolName: "toggle_combatant_condition",
      toolCallId,
      success: false,
      result: {
        type: "toggle_combatant_condition",
        combatant: params.combatant,
        condition: params.condition,
        action: "added",
      } as GMToggleCombatantConditionResult,
      contextForStory: `[Combat Error: Combatant "${params.combatant}" not found]`,
    };
  }

  // Check if condition already exists
  const existingIdx = combatant.conditions.findIndex(
    (c) => c.name.toLowerCase() === params.condition.toLowerCase()
  );
  const exists = existingIdx >= 0;

  // Determine action based on force flags and existence
  let action: "added" | "removed" | "updated";

  if (params.force_remove) {
    // Force remove
    if (exists) {
      combatant.conditions.splice(existingIdx, 1);
      action = "removed";
    } else {
      // Nothing to remove
      return {
        toolName: "toggle_combatant_condition",
        toolCallId,
        success: true,
        result: {
          type: "toggle_combatant_condition",
          combatant: combatant.name,
          condition: params.condition,
          action: "removed",
        } as GMToggleCombatantConditionResult,
        contextForStory: `[${combatant.name} did not have condition: ${params.condition}]`,
      };
    }
  } else if (params.force_add || !exists) {
    // Force add or doesn't exist - add/update
    if (exists) {
      // Update duration
      const existing = combatant.conditions[existingIdx];
      if (params.duration !== undefined) {
        if (
          existing.duration === undefined ||
          params.duration > existing.duration
        ) {
          existing.duration = params.duration;
        }
      }
      action = "updated";
    } else {
      // Add new
      combatant.conditions.push({
        name: params.condition,
        duration: params.duration,
      });
      action = "added";
    }
  } else {
    // Toggle: exists, no force flags -> remove
    combatant.conditions.splice(existingIdx, 1);
    action = "removed";
  }

  const durationText =
    params.duration !== undefined && action !== "removed"
      ? ` for ${params.duration} turns`
      : "";

  const actionText =
    action === "removed"
      ? "lost"
      : action === "updated"
      ? "extended"
      : "gained";
  logCombat(
    storyData.combatState,
    `${combatant.name} ${actionText} condition: ${params.condition}${durationText}`
  );

  return {
    toolName: "toggle_combatant_condition",
    toolCallId,
    success: true,
    result: {
      type: "toggle_combatant_condition",
      combatant: combatant.name,
      condition: params.condition,
      duration: action !== "removed" ? params.duration : undefined,
      action,
    } as GMToggleCombatantConditionResult,
    contextForStory: `[${combatant.name} ${actionText} condition: ${params.condition}${durationText}]`,
  };
}

/**
 * Make a roll for an NPC
 */
function executeNPCRoll(
  toolCallId: string,
  params: NPCRollParams,
  storyData: StoryData
): GMToolResult {
  if (!storyData.combatState?.active) {
    return {
      toolName: "npc_roll",
      toolCallId,
      success: false,
      result: {
        type: "npc_roll",
        combatant: params.combatant,
        formula: params.formula,
        rolls: [],
        total: 0,
        reason: params.reason,
      } as GMNPCRollResult,
      contextForStory: `[Combat Error: No active combat]`,
    };
  }

  const combatant = findCombatant(storyData.combatState, params.combatant);
  if (!combatant) {
    return {
      toolName: "npc_roll",
      toolCallId,
      success: false,
      result: {
        type: "npc_roll",
        combatant: params.combatant,
        formula: params.formula,
        rolls: [],
        total: 0,
        reason: params.reason,
      } as GMNPCRollResult,
      contextForStory: `[Combat Error: Combatant "${params.combatant}" not found]`,
    };
  }

  // npc_roll is for NPCs only - it resolves silently and is never shown to
  // the player as an animation. The player's own combatant (type "player")
  // must go through formula_roll instead, same as any other player action,
  // so their rolls stay player-facing during combat.
  if (combatant.type === "player") {
    return {
      toolName: "npc_roll",
      toolCallId,
      success: false,
      result: {
        type: "npc_roll",
        combatant: combatant.name,
        formula: params.formula,
        rolls: [],
        total: 0,
        reason: params.reason,
      } as GMNPCRollResult,
      contextForStory: `[Combat Error: "${combatant.name}" is the player's own combatant - use formula_roll for the player's actions, npc_roll is for NPCs only]`,
    };
  }

  // Turn-order invariant: npc_roll represents a combatant's action for
  // their turn, so it's only valid for whoever's turn it currently is -
  // otherwise nothing stops the same combatant acting repeatedly in a
  // round, or an off-turn combatant acting at all. (update_combatant_stat
  // and toggle_combatant_condition are deliberately NOT gated this way -
  // they apply the *consequences* of an action, typically to a different
  // combatant than whoever's turn it is, e.g. the current combatant's
  // attack damaging a target.)
  const { turnOrder, currentTurnIndex } = storyData.combatState;
  if (
    turnOrder.length > 0 &&
    currentTurnIndex >= 0 &&
    currentTurnIndex < turnOrder.length
  ) {
    const currentTurnId = turnOrder[currentTurnIndex];
    if (combatant.id !== currentTurnId) {
      const currentTurnCombatant = storyData.combatState.combatants.find(
        (c) => c.id === currentTurnId
      );
      return {
        toolName: "npc_roll",
        toolCallId,
        success: false,
        result: {
          type: "npc_roll",
          combatant: combatant.name,
          formula: params.formula,
          rolls: [],
          total: 0,
          reason: params.reason,
        } as GMNPCRollResult,
        contextForStory: `[Combat Error: It is not ${combatant.name}'s turn (current turn: ${
          currentTurnCombatant?.name ?? "unknown"
        }). Call advance_turn to move through the round instead of acting out of turn.]`,
      };
    }
  }

  // Roll the formula
  let rollResult: RollResult;
  try {
    rollResult = rollFormula(params.formula);
  } catch {
    return {
      toolName: "npc_roll",
      toolCallId,
      success: false,
      result: {
        type: "npc_roll",
        combatant: combatant.name,
        formula: params.formula,
        rolls: [],
        total: 0,
        reason: params.reason,
      } as GMNPCRollResult,
      contextForStory: `[Combat Error: Invalid dice formula "${params.formula}"]`,
    };
  }

  // Log the roll. No hit/miss verdict here - the GM compares the total
  // against whatever it's up against with `calculate`, same as any roll.
  const targetText = params.target ? ` targeting ${params.target}` : "";
  logCombat(
    storyData.combatState,
    `${combatant.name} rolled ${params.formula}${targetText}: ${rollResult.total} - ${params.reason}`
  );

  return {
    toolName: "npc_roll",
    toolCallId,
    success: true,
    result: {
      type: "npc_roll",
      combatant: combatant.name,
      formula: params.formula,
      rolls: flattenDiceRolls(rollResult),
      total: rollResult.total,
      reason: params.reason,
      target: params.target,
    } as GMNPCRollResult,
    contextForStory: `[NPC Roll: ${combatant.name} rolled ${params.formula}${targetText} = ${rollResult.total} - ${params.reason}]\n[No hit/miss verdict was computed. Compare it with \`calculate\` (e.g. "${rollResult.total} >= 15") before narrating the outcome.]`,
  };
}

/**
 * Advance to the next turn in combat
 */
function executeAdvanceTurn(
  toolCallId: string,
  params: AdvanceTurnParams,
  storyData: StoryData
): GMToolResult {
  if (!storyData.combatState?.active) {
    return {
      toolName: "advance_turn",
      toolCallId,
      success: false,
      result: {
        type: "advance_turn",
        currentCombatant: "",
        currentCombatantType: "neutral",
        round: 0,
      } as GMAdvanceTurnResult,
      contextForStory: `[Combat Error: No active combat]`,
    };
  }

  const skipInactive = params.skip_inactive !== false;

  // Decrement condition durations and collect expired ones
  const expiredConditions: { combatant: string; condition: string }[] = [];
  for (const combatant of storyData.combatState.combatants) {
    if (!combatant.isActive) continue;

    combatant.conditions = combatant.conditions.filter((condition) => {
      if (condition.duration !== undefined) {
        condition.duration--;
        if (condition.duration <= 0) {
          expiredConditions.push({
            combatant: combatant.name,
            condition: condition.name,
          });
          logCombat(
            storyData.combatState!,
            `${combatant.name}'s ${condition.name} expired`
          );
          return false;
        }
      }
      return true;
    });
  }

  // Get previous combatant
  const previousIdx = storyData.combatState.currentTurnIndex;
  const previousId = storyData.combatState.turnOrder[previousIdx];
  const previousCombatant = storyData.combatState.combatants.find(
    (c) => c.id === previousId
  );

  // Move to next turn
  let nextIdx = (previousIdx + 1) % storyData.combatState.turnOrder.length;
  let loopCount = 0;

  // Find next active combatant
  while (loopCount < storyData.combatState.turnOrder.length) {
    const candidateId = storyData.combatState.turnOrder[nextIdx];
    const candidate = storyData.combatState.combatants.find(
      (c) => c.id === candidateId
    );

    if (candidate?.isActive || !skipInactive) {
      break;
    }

    nextIdx = (nextIdx + 1) % storyData.combatState.turnOrder.length;
    loopCount++;
  }

  // Check if we completed a full round
  if (nextIdx <= previousIdx) {
    storyData.combatState.round++;
    logCombat(
      storyData.combatState,
      `--- Round ${storyData.combatState.round} ---`
    );
  }

  storyData.combatState.currentTurnIndex = nextIdx;

  // Get current combatant
  const currentId = storyData.combatState.turnOrder[nextIdx];
  const currentCombatant = storyData.combatState.combatants.find(
    (c) => c.id === currentId
  );

  if (!currentCombatant) {
    return {
      toolName: "advance_turn",
      toolCallId,
      success: false,
      result: {
        type: "advance_turn",
        currentCombatant: "",
        currentCombatantType: "neutral",
        round: storyData.combatState.round,
        allInactive: true,
      } as GMAdvanceTurnResult,
      contextForStory: `[Combat: All combatants inactive - combat should end]`,
    };
  }

  logCombat(storyData.combatState, `${currentCombatant.name}'s turn`);

  return {
    toolName: "advance_turn",
    toolCallId,
    success: true,
    result: {
      type: "advance_turn",
      previousCombatant: previousCombatant?.name,
      currentCombatant: currentCombatant.name,
      currentCombatantType: currentCombatant.type,
      round: storyData.combatState.round,
      expiredConditions:
        expiredConditions.length > 0 ? expiredConditions : undefined,
    } as GMAdvanceTurnResult,
    contextForStory: `[Turn: ${currentCombatant.name} (${
      currentCombatant.type
    }) - Round ${storyData.combatState.round}${
      expiredConditions.length > 0
        ? ` | Expired: ${expiredConditions
            .map((e) => `${e.combatant}'s ${e.condition}`)
            .join(", ")}`
        : ""
    }]`,
  };
}

/**
 * End combat
 */
function executeEndCombat(
  toolCallId: string,
  params: EndCombatParams,
  storyData: StoryData
): GMToolResult {
  if (!storyData.combatState?.active) {
    return {
      toolName: "end_combat",
      toolCallId,
      success: false,
      result: {
        type: "end_combat",
        outcome: params.outcome,
        summary: params.summary,
        rounds: 0,
      } as GMEndCombatResult,
      contextForStory: `[Combat Error: No active combat to end]`,
    };
  }

  const rounds = storyData.combatState.round;

  // Log combat end
  logCombat(
    storyData.combatState,
    `Combat ended: ${params.outcome} - ${params.summary}`
  );

  // Store the final log for reference but deactivate combat
  storyData.combatState.active = false;

  return {
    toolName: "end_combat",
    toolCallId,
    success: true,
    result: {
      type: "end_combat",
      outcome: params.outcome,
      summary: params.summary,
      rounds,
    } as GMEndCombatResult,
    contextForStory: `[Combat Ended: ${params.outcome} after ${rounds} rounds - ${params.summary}]`,
  };
}
// ============================================
// COUNTDOWN TIMER EXECUTORS
// ============================================

/**
 * Find a timer by name or ID (case-insensitive name matching)
 */
function findTimer(
  timers: CountdownTimer[] | undefined,
  nameOrId: string
): CountdownTimer | undefined {
  if (!timers || timers.length === 0) return undefined;
  const lower = nameOrId.toLowerCase();
  return timers.find(
    (t) => t.id === nameOrId || t.name.toLowerCase() === lower
  );
}

/**
 * Create a new countdown timer
 */
function executeCreateTimer(
  toolCallId: string,
  params: CreateTimerParams,
  storyData: StoryData
): GMToolResult {
  // Initialize timers array if needed
  if (!storyData.timers) {
    storyData.timers = [];
  }

  // Check for duplicate name
  const existingTimer = findTimer(storyData.timers, params.name);
  if (existingTimer) {
    return {
      toolName: "create_timer",
      toolCallId,
      success: false,
      result: {
        type: "create_timer",
        timer: {
          id: existingTimer.id,
          name: existingTimer.name,
          description: existingTimer.description,
          totalTicks: existingTimer.totalTicks,
          currentTicks: existingTimer.currentTicks,
          autoAdvance: existingTimer.autoAdvance,
          visibility: existingTimer.visibility,
        },
      } as GMCreateTimerResult,
      contextForStory: `[Timer Error: Timer "${params.name}" already exists with ${existingTimer.currentTicks} ticks remaining]`,
    };
  }

  // Create the timer
  const timer: CountdownTimer = {
    id: `timer_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    name: params.name,
    description: params.description,
    totalTicks: params.ticks,
    currentTicks: params.ticks,
    // Nothing ticks a timer yet (status report §6.1), so a new one is
    // manual unless asked otherwise; the result line says so either way.
    autoAdvance: params.auto_advance === true,
    status: "active",
    visibility: params.visibility || "visible",
    createdAt: Date.now(),
  };

  storyData.timers.push(timer);

  const visibilityNote =
    timer.visibility === "hidden" ? " (hidden from player)" : "";

  return {
    toolName: "create_timer",
    toolCallId,
    success: true,
    result: {
      type: "create_timer",
      timer: {
        id: timer.id,
        name: timer.name,
        description: timer.description,
        totalTicks: timer.totalTicks,
        currentTicks: timer.currentTicks,
        autoAdvance: timer.autoAdvance,
        visibility: timer.visibility,
      },
    } as GMCreateTimerResult,
    contextForStory: `[Timer Created: "${timer.name}" - ${
      timer.currentTicks
    } ticks (advance it yourself: nothing ticks it on its own)${visibilityNote}${
      timer.description ? ` - ${timer.description}` : ""
    }]`,
  };
}

/**
 * Advance a timer by specified ticks
 */
function executeAdvanceTimer(
  toolCallId: string,
  params: AdvanceTimerParams,
  storyData: StoryData
): GMToolResult {
  const timer = findTimer(storyData.timers, params.timer);

  if (!timer) {
    return {
      toolName: "advance_timer",
      toolCallId,
      success: false,
      result: {
        type: "advance_timer",
        timer: params.timer,
        previousTicks: 0,
        currentTicks: 0,
        ticksAdvanced: 0,
        triggered: false,
      } as GMAdvanceTimerResult,
      contextForStory: `[Timer Error: Timer "${params.timer}" not found]`,
    };
  }

  if (timer.status === "paused") {
    return {
      toolName: "advance_timer",
      toolCallId,
      success: false,
      result: {
        type: "advance_timer",
        timer: timer.name,
        previousTicks: timer.currentTicks,
        currentTicks: timer.currentTicks,
        ticksAdvanced: 0,
        triggered: false,
      } as GMAdvanceTimerResult,
      contextForStory: `[Timer Error: Timer "${timer.name}" is paused - use resume_timer first]`,
    };
  }

  if (timer.status !== "active") {
    return {
      toolName: "advance_timer",
      toolCallId,
      success: false,
      result: {
        type: "advance_timer",
        timer: timer.name,
        previousTicks: timer.currentTicks,
        currentTicks: timer.currentTicks,
        ticksAdvanced: 0,
        triggered: false,
      } as GMAdvanceTimerResult,
      contextForStory: `[Timer Error: Timer "${timer.name}" is ${timer.status}]`,
    };
  }

  const ticksToAdvance = params.ticks || 1;
  const previousTicks = timer.currentTicks;
  timer.currentTicks = Math.max(0, timer.currentTicks - ticksToAdvance);

  // Check if timer triggered
  const triggered = timer.currentTicks === 0;
  if (triggered) {
    timer.status = "triggered";
    timer.triggeredAt = Date.now();
  }

  // Front/clock wrapper: surface (informational only) when a thread is
  // linked to this timer and it's triggered or about to. This never
  // mutates thread status itself - that still goes through
  // update_thread/resolve_thread, so there's only one path that can change
  // a thread's status.
  const linkedThread = (storyData.threads || []).find(
    (t) => t.linkedTimerId === timer.id && t.status === "active"
  );
  const linkedThreadNote =
    linkedThread && (triggered || timer.currentTicks <= 1)
      ? ` This is the clock for thread "${linkedThread.title}" - consider whether it should escalate or resolve (update_thread/resolve_thread).`
      : "";

  return {
    toolName: "advance_timer",
    toolCallId,
    success: true,
    result: {
      type: "advance_timer",
      timer: timer.name,
      previousTicks,
      currentTicks: timer.currentTicks,
      ticksAdvanced: ticksToAdvance,
      triggered,
    } as GMAdvanceTimerResult,
    contextForStory: triggered
      ? `[⏰ TIMER TRIGGERED: "${timer.name}" has reached 0!${
          timer.description ? ` - ${timer.description}` : ""
        }${linkedThreadNote}]`
      : `[Timer: "${timer.name}" ${previousTicks} → ${timer.currentTicks} ticks remaining${linkedThreadNote}]`,
  };
}

/**
 * Toggle a timer between paused and active states
 */
function executeToggleTimerPause(
  toolCallId: string,
  params: ToggleTimerPauseParams,
  storyData: StoryData
): GMToolResult {
  const timer = findTimer(storyData.timers, params.timer);

  if (!timer) {
    return {
      toolName: "toggle_timer_pause",
      toolCallId,
      success: false,
      result: {
        type: "toggle_timer_pause",
        timer: params.timer,
        newStatus: "active",
      } as GMToggleTimerPauseResult,
      contextForStory: `[Timer Error: Timer "${params.timer}" not found]`,
    };
  }

  if (timer.status !== "active" && timer.status !== "paused") {
    return {
      toolName: "toggle_timer_pause",
      toolCallId,
      success: false,
      result: {
        type: "toggle_timer_pause",
        timer: timer.name,
        newStatus: timer.status as "active" | "paused",
      } as GMToggleTimerPauseResult,
      contextForStory: `[Timer Error: Timer "${timer.name}" is ${timer.status}, cannot toggle pause]`,
    };
  }

  // Toggle the status
  const wasPaused = timer.status === "paused";
  timer.status = wasPaused ? "active" : "paused";
  const newStatus = timer.status as "active" | "paused";

  const actionText = wasPaused ? "Resumed" : "Paused";

  return {
    toolName: "toggle_timer_pause",
    toolCallId,
    success: true,
    result: {
      type: "toggle_timer_pause",
      timer: timer.name,
      newStatus,
    } as GMToggleTimerPauseResult,
    contextForStory: `[Timer ${actionText}: "${timer.name}" at ${timer.currentTicks} ticks]`,
  };
}

/**
 * Cancel a timer without triggering
 */
function executeCancelTimer(
  toolCallId: string,
  params: CancelTimerParams,
  storyData: StoryData
): GMToolResult {
  const timer = findTimer(storyData.timers, params.timer);

  if (!timer) {
    return {
      toolName: "cancel_timer",
      toolCallId,
      success: false,
      result: {
        type: "cancel_timer",
        timer: params.timer,
        reason: params.reason,
        ticksRemaining: 0,
      } as GMCancelTimerResult,
      contextForStory: `[Timer Error: Timer "${params.timer}" not found]`,
    };
  }

  if (timer.status === "triggered" || timer.status === "cancelled") {
    return {
      toolName: "cancel_timer",
      toolCallId,
      success: false,
      result: {
        type: "cancel_timer",
        timer: timer.name,
        reason: params.reason,
        ticksRemaining: timer.currentTicks,
      } as GMCancelTimerResult,
      contextForStory: `[Timer Error: Timer "${timer.name}" is already ${timer.status}]`,
    };
  }

  const ticksRemaining = timer.currentTicks;
  timer.status = "cancelled";

  return {
    toolName: "cancel_timer",
    toolCallId,
    success: true,
    result: {
      type: "cancel_timer",
      timer: timer.name,
      reason: params.reason,
      ticksRemaining,
    } as GMCancelTimerResult,
    contextForStory: `[Timer Cancelled: "${timer.name}"${
      params.reason ? ` - ${params.reason}` : ""
    } (had ${ticksRemaining} ticks remaining)]`,
  };
}

/**
 * Manually trigger a timer early
 */
function executeTriggerTimer(
  toolCallId: string,
  params: TriggerTimerParams,
  storyData: StoryData
): GMToolResult {
  const timer = findTimer(storyData.timers, params.timer);

  if (!timer) {
    return {
      toolName: "trigger_timer",
      toolCallId,
      success: false,
      result: {
        type: "trigger_timer",
        timer: params.timer,
        reason: params.reason,
        ticksRemaining: 0,
      } as GMTriggerTimerResult,
      contextForStory: `[Timer Error: Timer "${params.timer}" not found]`,
    };
  }

  if (timer.status === "triggered" || timer.status === "cancelled") {
    return {
      toolName: "trigger_timer",
      toolCallId,
      success: false,
      result: {
        type: "trigger_timer",
        timer: timer.name,
        reason: params.reason,
        ticksRemaining: timer.currentTicks,
      } as GMTriggerTimerResult,
      contextForStory: `[Timer Error: Timer "${timer.name}" is already ${timer.status}]`,
    };
  }

  const ticksRemaining = timer.currentTicks;
  timer.currentTicks = 0;
  timer.status = "triggered";
  timer.triggeredAt = Date.now();

  return {
    toolName: "trigger_timer",
    toolCallId,
    success: true,
    result: {
      type: "trigger_timer",
      timer: timer.name,
      reason: params.reason,
      ticksRemaining,
      description: timer.description,
    } as GMTriggerTimerResult,
    contextForStory: `[⏰ TIMER TRIGGERED EARLY: "${timer.name}"${
      params.reason ? ` - ${params.reason}` : ""
    }${timer.description ? ` | Effect: ${timer.description}` : ""}]`,
  };
}

/**
 * manage_timer on a story with a campaign record: the same five actions, on
 * clocks. The results keep the timer result types (remaining ticks, not filled
 * segments), so the timeline and the labels are unchanged.
 *   create -> a manual clock, at any capacity; advance -> a tick;
 *   toggle_pause -> toggles `paused`; cancel -> paused with `cancelled`;
 *   trigger -> fills the clock at once and reports its fill.
 */
function executeManageTimerOnClocks(
  toolCallId: string,
  params: ManageTimerParams,
  storyData: StoryData
): GMToolResult {
  const record = storyData.campaign!;
  const fail = (message: string, ctx?: string): GMToolResult => ({
    toolName: "manage_timer",
    toolCallId,
    success: false,
    result: { type: "state_change", message, command: "manage_timer" },
    contextForStory: ctx ?? `[ERROR: ${message}]`,
  });
  const find = (ref: string): Clock | undefined => {
    const lower = ref.toLowerCase();
    return record.clocks.find((c) => c.id === ref || c.name.toLowerCase() === lower);
  };
  const remaining = (c: Clock) => c.segments - c.filled;
  const done = (
    result: GMToolResult["result"],
    contextForStory: string
  ): GMToolResult => ({
    toolName: "manage_timer",
    toolCallId,
    success: true,
    result,
    contextForStory,
  });

  if (params.action === "create") {
    if (!params.name || params.ticks === undefined) {
      return fail(`manage_timer action "create" requires "name" and "ticks"`);
    }
    if (find(params.name)) {
      const existing = find(params.name)!;
      return fail(
        `Timer "${params.name}" already exists`,
        `[Timer Error: Timer "${params.name}" already exists with ${remaining(existing)} ticks remaining]`
      );
    }
    const segments = Math.floor(params.ticks);
    if (!Number.isFinite(segments) || segments < 1) {
      return fail(`manage_timer action "create": "ticks" must be a whole number, 1 or more`);
    }
    const clock: Clock = {
      id: makeId("clk", record.clocks.map((c) => c.id)),
      name: params.name,
      segments,
      filled: 0,
      triggers: ["manual"],
      visible: params.visibility
        ? params.visibility !== "hidden"
        : defaultClockVisibility(record.style),
      paused: false,
      crossed: [],
    };
    if (params.description) clock.onFill = params.description;
    record.clocks.push(clock);
    return done(
      {
        type: "create_timer",
        timer: {
          id: clock.id,
          name: clock.name,
          description: clock.onFill,
          totalTicks: segments,
          currentTicks: segments,
          autoAdvance: false,
          visibility: clock.visible ? "visible" : "hidden",
        },
      } as GMCreateTimerResult,
      `[Timer Created: "${clock.name}" - ${segments} ticks (a campaign clock: advance it yourself)${
        clock.visible ? "" : " (hidden from player)"
      }${clock.onFill ? ` - ${clock.onFill}` : ""}]`
    );
  }

  if (
    params.action !== "advance" &&
    params.action !== "toggle_pause" &&
    params.action !== "cancel" &&
    params.action !== "trigger"
  ) {
    return fail(
      `manage_timer called with unknown action "${params.action}" (expected create/advance/toggle_pause/cancel/trigger)`
    );
  }
  if (!params.timer) {
    return fail(`manage_timer action "${params.action}" requires "timer"`);
  }
  const clock = find(params.timer);
  if (!clock) {
    return fail(`Timer "${params.timer}" not found`, `[Timer Error: Timer "${params.timer}" not found]`);
  }
  const idx = record.clocks.findIndex((c) => c.id === clock.id);
  const isFull = clock.filled >= clock.segments;
  const stateWord = clock.cancelled ? "cancelled" : isFull ? "triggered" : clock.paused ? "paused" : "active";

  switch (params.action) {
    case "advance": {
      if (clock.cancelled || isFull) {
        return fail(`Timer "${clock.name}" is ${stateWord}`, `[Timer Error: Timer "${clock.name}" is ${stateWord}]`);
      }
      if (clock.paused) {
        return fail(
          `Timer "${clock.name}" is paused`,
          `[Timer Error: Timer "${clock.name}" is paused - use toggle_pause first]`
        );
      }
      const by = params.ticks || 1;
      const before = clock.filled;
      const t = tickClock(clock, by, "manage_timer advance", record);
      record.clocks[idx] = t.clock;
      return done(
        {
          type: "advance_timer",
          timer: clock.name,
          previousTicks: clock.segments - before,
          currentTicks: remaining(t.clock),
          ticksAdvanced: by,
          triggered: t.filled,
        } as GMAdvanceTimerResult,
        t.filled || t.crossed.length > 0
          ? describeTick(t.clock, before, t, record, "manage_timer")
          : `[Timer: "${clock.name}" ${segmentsLeft(before, clock)} → ${remaining(t.clock)} ticks remaining]`
      );
    }
    case "toggle_pause": {
      if (clock.cancelled || isFull) {
        return fail(
          `Timer "${clock.name}" is ${stateWord}, cannot toggle pause`,
          `[Timer Error: Timer "${clock.name}" is ${stateWord}, cannot toggle pause]`
        );
      }
      const wasPaused = clock.paused;
      clock.paused = !wasPaused;
      return done(
        {
          type: "toggle_timer_pause",
          timer: clock.name,
          newStatus: clock.paused ? "paused" : "active",
        } as GMToggleTimerPauseResult,
        `[Timer ${wasPaused ? "Resumed" : "Paused"}: "${clock.name}" at ${remaining(clock)} ticks]`
      );
    }
    case "cancel": {
      // A full clock may be cancelled: that is how a filled clock is cleared.
      if (clock.cancelled) {
        return fail(
          `Timer "${clock.name}" is already ${stateWord}`,
          `[Timer Error: Timer "${clock.name}" is already ${stateWord}]`
        );
      }
      const left = remaining(clock);
      clock.paused = true;
      clock.cancelled = true;
      return done(
        {
          type: "cancel_timer",
          timer: clock.name,
          reason: params.reason,
          ticksRemaining: left,
        } as GMCancelTimerResult,
        `[Timer Cancelled: "${clock.name}"${params.reason ? ` - ${params.reason}` : ""} (had ${left} ticks remaining)]`
      );
    }
    default: {
      // trigger
      if (clock.cancelled || isFull) {
        return fail(
          `Timer "${clock.name}" is already ${stateWord}`,
          `[Timer Error: Timer "${clock.name}" is already ${stateWord}]`
        );
      }
      const left = remaining(clock);
      const before = clock.filled;
      // Fills the clock at once, even if it was paused.
      const t = tickClock({ ...clock, paused: false }, left, params.reason, record);
      record.clocks[idx] = { ...t.clock, paused: clock.paused };
      return done(
        {
          type: "trigger_timer",
          timer: clock.name,
          reason: params.reason,
          ticksRemaining: left,
          description: clock.onFill,
        } as GMTriggerTimerResult,
        describeTick(t.clock, before, t, record, `triggered early${params.reason ? `: ${params.reason}` : ""}`)
      );
    }
  }
}

function segmentsLeft(filledBefore: number, clock: Clock): number {
  return clock.segments - filledBefore;
}

/**
 * Unified timer tool entry point (manage_timer). Dispatches to the
 * create/advance/toggle_pause/cancel/trigger executors above based on
 * `params.action`, reusing their existing tested logic unchanged and only
 * relabeling the result's toolName to match what was actually called.
 *
 * Per-action required-field checks live here rather than in the generic
 * schema validator (toolValidation.ts), since "name and ticks are required,
 * but only for action=create" is a conditional requirement the flat
 * required-params schema can't express.
 */
function executeManageTimer(
  toolCallId: string,
  params: ManageTimerParams,
  storyData: StoryData
): GMToolResult {
  const errorResult = (message: string): GMToolResult => ({
    toolName: "manage_timer",
    toolCallId,
    success: false,
    result: {
      type: "state_change",
      message,
      command: "manage_timer",
    },
    contextForStory: `[ERROR: ${message}]`,
  });

  // A story with a campaign record keeps its timers as clocks: the same
  // actions, translated onto them (design section 4).
  if (storyData.campaign) {
    return executeManageTimerOnClocks(toolCallId, params, storyData);
  }

  let result: GMToolResult;

  switch (params.action) {
    case "create": {
      if (!params.name || params.ticks === undefined) {
        return errorResult(
          `manage_timer action "create" requires "name" and "ticks"`
        );
      }
      result = executeCreateTimer(
        toolCallId,
        {
          name: params.name,
          description: params.description,
          ticks: params.ticks,
          auto_advance: params.auto_advance,
          visibility: params.visibility,
        },
        storyData
      );
      break;
    }
    case "advance": {
      if (!params.timer) {
        return errorResult(`manage_timer action "advance" requires "timer"`);
      }
      result = executeAdvanceTimer(
        toolCallId,
        { timer: params.timer, ticks: params.ticks },
        storyData
      );
      break;
    }
    case "toggle_pause": {
      if (!params.timer) {
        return errorResult(
          `manage_timer action "toggle_pause" requires "timer"`
        );
      }
      result = executeToggleTimerPause(
        toolCallId,
        { timer: params.timer },
        storyData
      );
      break;
    }
    case "cancel": {
      if (!params.timer) {
        return errorResult(`manage_timer action "cancel" requires "timer"`);
      }
      result = executeCancelTimer(
        toolCallId,
        { timer: params.timer, reason: params.reason },
        storyData
      );
      break;
    }
    case "trigger": {
      if (!params.timer) {
        return errorResult(`manage_timer action "trigger" requires "timer"`);
      }
      result = executeTriggerTimer(
        toolCallId,
        { timer: params.timer, reason: params.reason },
        storyData
      );
      break;
    }
    default:
      return errorResult(
        `manage_timer called with unknown action "${params.action}" (expected create/advance/toggle_pause/cancel/trigger)`
      );
  }

  return { ...result, toolName: "manage_timer" };
}

// ============================================
// SYSTEM TOOL EXECUTION (meters, tracks, sessions, action rolls)
// docs/default-systems-implementation-plan.md slices 2 and 3
// ============================================

function systemErrorResult(
  toolName: string,
  toolCallId: string,
  message: string
): GMToolResult {
  return {
    toolName,
    toolCallId,
    success: false,
    result: { type: "state_change", message, command: toolName },
    contextForStory: `[ERROR: ${message}]`,
  };
}

function ensureSystemState(storyData: StoryData): SystemState {
  if (!storyData.systemState) {
    storyData.systemState = { sessionCount: 0, dedupKeys: [] };
  }
  if (!Array.isArray(storyData.systemState.dedupKeys)) {
    storyData.systemState.dedupKeys = [];
  }
  return storyData.systemState;
}

function ownerMeterNames(meters: Meter[] | undefined, owner: string): string {
  const own = (meters || []).filter(
    (m) => normalizeKey(m.owner) === normalizeKey(owner)
  );
  return own.length > 0
    ? `${owner} has: ${own.map((m) => m.name).join(", ")}`
    : `${owner} has no meters`;
}

function describeMeterChange(meter: Meter, change: MeterChange): string {
  const label = `${meter.owner}: ${meter.name}`;
  const delta = change.after - change.before;
  const signed = delta > 0 ? `+${delta}` : String(delta);
  let line = `${label} ${change.before} → ${change.after}`;
  if (delta !== 0) line += ` (${signed})`;
  if (change.clampedBy > 0) {
    line += `, ${change.clampedBy} clamped away (range ${meter.floor}-${meter.cap})`;
  }
  const parts: string[] = [];
  for (const t of change.crossedUp) {
    parts.push(`reached "${t.label}"${t.note ? ` (${t.note})` : ""}`);
  }
  for (const t of change.crossedDown) {
    parts.push(`fell below "${t.label}"`);
  }
  if (delta > 0 && change.atCap) parts.push("now at its cap");
  if (delta < 0 && change.atFloor) parts.push("now at its floor");
  if (parts.length > 0) line += ` · ${parts.join("; ")}`;
  return `[Meter: ${line}]`;
}

/**
 * A hidden meter never reaches the player's tool log, whatever the call did
 * to it: a successful change, a repeat refusal, a remove, create_set making a
 * hidden meter, or an error that names the owner's meters.
 */
function executeManageMeter(
  toolCallId: string,
  params: ManageMeterParams,
  storyData: StoryData
): GMToolResult {
  const owner = typeof params.owner === "string" ? params.owner.trim() : "";
  const before = (storyData.meters ?? []).filter(
    (m) => normalizeKey(m.owner) === normalizeKey(owner)
  );
  const named = typeof params.meter === "string" ? params.meter.trim() : "";
  const result = executeManageMeterInner(toolCallId, params, storyData);
  if (result.hiddenFromPlayer) return result;
  let hidden = false;
  if (!result.success) {
    hidden = before.some((m) => m.hidden);
  } else if (params.action === "create_set") {
    const created = (result.result as GMManageMeterResult).created ?? [];
    hidden = (storyData.meters ?? []).some(
      (m) =>
        m.hidden &&
        normalizeKey(m.owner) === normalizeKey(owner) &&
        created.includes(m.name)
    );
  } else {
    hidden = !!findMeter(before, owner, named)?.hidden;
  }
  if (hidden) result.hiddenFromPlayer = true;
  return result;
}

function executeManageMeterInner(
  toolCallId: string,
  params: ManageMeterParams,
  storyData: StoryData
): GMToolResult {
  const fail = (message: string) =>
    systemErrorResult("manage_meter", toolCallId, message);

  const owner = typeof params.owner === "string" ? params.owner.trim() : "";
  if (!owner) {
    return fail(`manage_meter needs an "owner" (a character's name, or "world")`);
  }
  const meters: Meter[] = storyData.meters ?? [];
  const named = typeof params.meter === "string" ? params.meter.trim() : "";

  try {
    if (params.action === "create_set") {
      const setName = typeof params.set === "string" ? params.set.trim() : "";
      const sets = resolveSystem(storyData).meterSets;
      const set = sets.find((s) => normalizeKey(s.name) === normalizeKey(setName));
      if (!set) {
        return fail(
          `Unknown meter set "${setName}". Sets available: ${
            sets.length > 0 ? sets.map((s) => s.name).join(", ") : "none (use action create)"
          }`
        );
      }
      const { created, skipped } = createMeterSet(set, owner, meters);
      storyData.meters = [...meters, ...created];
      const lines = created.map(
        (m) => `${m.name} ${m.value}/${m.cap}`
      );
      let ctx = `[Meter set "${set.name}" created for ${owner}: ${lines.join(", ") || "nothing new"}]`;
      if (skipped.length > 0) ctx += `\n[Already had: ${skipped.join(", ")}]`;
      return {
        toolName: "manage_meter",
        toolCallId,
        success: true,
        result: {
          type: "manage_meter",
          action: "create_set",
          owner,
          created: created.map((m) => m.name),
          skipped,
        } as GMManageMeterResult,
        contextForStory: ctx,
      };
    }

    if (!named) {
      return fail(`manage_meter action "${params.action}" needs "meter"`);
    }

    if (params.action === "create") {
      if (findMeter(meters, owner, named)) {
        return fail(`${owner} already has a meter named "${named}"`);
      }
      const meter = createMeter(
        {
          name: named,
          min: params.min as number,
          max: params.max as number,
          start: params.value as number,
          thresholds: params.thresholds,
          onlyUp: params.only_up,
        },
        owner
      );
      storyData.meters = [...meters, meter];
      return {
        toolName: "manage_meter",
        toolCallId,
        success: true,
        result: {
          type: "manage_meter",
          action: "create",
          owner,
          meter: meter.name,
        } as GMManageMeterResult,
        contextForStory: `[Meter created: ${owner}: ${meter.name} ${meter.value}/${meter.cap} (range ${meter.min}-${meter.max}${meter.onlyUp ? ", only rises" : ""})]`,
      };
    }

    const existing = findMeter(meters, owner, named);
    if (!existing) {
      return fail(
        `No meter "${named}" for ${owner}. ${ownerMeterNames(meters, owner)}`
      );
    }

    if (params.action === "remove") {
      storyData.meters = meters.filter((m) => m.id !== existing.id);
      return {
        toolName: "manage_meter",
        toolCallId,
        success: true,
        result: {
          type: "manage_meter",
          action: "remove",
          owner,
          meter: existing.name,
        } as GMManageMeterResult,
        contextForStory: `[Meter removed: ${existing.owner}: ${existing.name}]`,
      };
    }

    let next: { meter: Meter; change: MeterChange };
    if (params.action === "adjust") {
      if (typeof params.by !== "number") {
        return fail(`manage_meter action "adjust" needs "by" (a signed whole number)`);
      }
      if (params.once_per) {
        if (params.once_per !== "scene" && params.once_per !== "session") {
          return fail(`once_per must be "scene" or "session"`);
        }
        const key = typeof params.key === "string" ? params.key.trim() : "";
        if (!key) {
          return fail(`once_per needs a "key" naming the trigger (e.g. "sunlight")`);
        }
        const sys = ensureSystemState(storyData);
        const sceneCount = storyData.agmtState?.sceneCount ?? 0;
        const at = params.once_per === "scene" ? sceneCount : sys.sessionCount;
        sys.dedupKeys = pruneDedupKeys(sys.dedupKeys, sceneCount, sys.sessionCount);
        if (isDuplicate(sys.dedupKeys, existing.id, key, params.once_per, at)) {
          return {
            toolName: "manage_meter",
            toolCallId,
            success: true,
            result: {
              type: "manage_meter",
              action: "adjust",
              owner,
              meter: existing.name,
              refusedAsRepeat: true,
            } as GMManageMeterResult,
            contextForStory: `[Meter: no change - "${key}" already counted this ${params.once_per} for ${existing.owner}: ${existing.name} (still ${existing.value})]`,
          };
        }
        next = adjustMeter(existing, params.by);
        sys.dedupKeys = [
          ...sys.dedupKeys,
          {
            meterId: existing.id,
            key: normalizeKey(key),
            scope: params.once_per,
            at,
          },
        ];
      } else {
        next = adjustMeter(existing, params.by);
      }
    } else if (
      params.action === "set" ||
      params.action === "set_cap" ||
      params.action === "set_floor"
    ) {
      if (typeof params.value !== "number") {
        return fail(`manage_meter action "${params.action}" needs "value"`);
      }
      next =
        params.action === "set"
          ? setMeterValue(existing, params.value)
          : params.action === "set_cap"
            ? setMeterCap(existing, params.value)
            : setMeterFloor(existing, params.value);
    } else {
      return fail(
        `manage_meter called with unknown action "${String(params.action)}" (expected create/create_set/adjust/set/set_cap/set_floor/remove)`
      );
    }

    storyData.meters = meters.map((m) => (m.id === existing.id ? next.meter : m));
    let ctx = describeMeterChange(next.meter, next.change);
    if (params.action === "set_cap") ctx += `\n[Cap is now ${next.meter.cap}]`;
    if (params.action === "set_floor") ctx += `\n[Floor is now ${next.meter.floor}]`;
    return {
      toolName: "manage_meter",
      toolCallId,
      success: true,
      hiddenFromPlayer: existing.hidden ? true : undefined,
      result: {
        type: "manage_meter",
        action: params.action,
        owner: existing.owner,
        meter: existing.name,
        change: next.change,
      } as GMManageMeterResult,
      contextForStory: ctx,
    };
  } catch (e) {
    if (e instanceof MeterError) return fail(e.message);
    throw e;
  }
}

function isD10Face(n: unknown): n is number {
  return typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= 10;
}

function describeProgressTrack(t: ProgressTrack): string {
  return `${t.kind} "${t.name}" (${t.owner}), ${t.rank}, ${filledBoxes(t.ticks)} of 10 boxes${
    t.ticks % 4 > 0 ? ` + ${t.ticks % 4} ticks` : ""
  }`;
}

async function executeManageTrack(
  toolCallId: string,
  params: ManageTrackParams,
  storyData: StoryData,
  interaction: GMInteractionHandlers
): Promise<GMToolResult> {
  const fail = (message: string) =>
    systemErrorResult("manage_track", toolCallId, message);

  const owner = typeof params.owner === "string" ? params.owner.trim() : "";
  const name = typeof params.track === "string" ? params.track.trim() : "";
  if (!owner || !name) {
    return fail(`manage_track needs "owner" and "track"`);
  }
  const tracks: ProgressTrack[] = storyData.progressTracks ?? [];
  const trackResult = (
    extra: Partial<GMManageTrackResult>,
    contextForStory: string,
    success = true
  ): GMToolResult => ({
    toolName: "manage_track",
    toolCallId,
    success,
    result: {
      type: "manage_track",
      action: params.action,
      owner,
      track: name,
      ...extra,
    } as GMManageTrackResult,
    contextForStory,
  });

  try {
    if (params.action === "create") {
      if (findTrack(tracks, owner, name)) {
        return fail(`${owner} already has a track named "${name}"`);
      }
      if (!params.rank) {
        return fail(
          `manage_track action "create" needs "rank" (troublesome, dangerous, formidable, extreme or epic)`
        );
      }
      const track = createTrack(owner, name, params.kind ?? "other", params.rank);
      storyData.progressTracks = [...tracks, track];
      return trackResult(
        { ticks: 0, boxes: 0 },
        `[Track created: ${describeProgressTrack(track)}]`
      );
    }

    const existing = findTrack(tracks, owner, name);
    if (!existing) {
      const own = tracks.filter((t) => normalizeKey(t.owner) === normalizeKey(owner));
      return fail(
        `No track "${name}" for ${owner}. ${
          own.length > 0 ? `${owner} has: ${own.map((t) => t.name).join(", ")}` : `${owner} has no tracks`
        }`
      );
    }
    const write = (next: ProgressTrack) => {
      storyData.progressTracks = tracks.map((t) => (t.id === existing.id ? next : t));
    };

    switch (params.action) {
      case "mark": {
        if (existing.status !== "active") {
          return fail(`"${existing.name}" is ${existing.status}, not active`);
        }
        const m = markProgress(existing, params.times ?? 1);
        write(m.track);
        return trackResult(
          { ticks: m.track.ticks, boxes: m.boxesAfter },
          `[Track: ${existing.kind} "${existing.name}" - ${existing.rank}, ${m.boxesBefore} → ${m.boxesAfter} boxes (+${m.ticksAdded} ticks, ${m.track.ticks}/40)]`
        );
      }
      case "progress_roll": {
        if (existing.status !== "active") {
          return fail(`"${existing.name}" is ${existing.status}, not active`);
        }
        let faces: [number, number];
        if (params.dice !== undefined) {
          if (storyData.diceMode !== "manual") {
            return fail(
              `"dice" is only for manual dice mode, where the player reports their physical roll. Leave it out and the engine rolls.`
            );
          }
          if (!Array.isArray(params.dice) || params.dice.length !== 2 || !isD10Face(params.dice[0]) || !isD10Face(params.dice[1])) {
            return fail(`dice must be two whole numbers from 1 to 10`);
          }
          faces = [params.dice[0], params.dice[1]];
        } else {
          const [r] = await rollFormulasMaybePhysical(
            ["2d10"],
            { reason: params.reason || `Progress roll: ${existing.name}` },
            interaction
          );
          const f = flattenRolls(r.rolls);
          faces = [f[0], f[1]];
        }
        const boxes = filledBoxes(existing.ticks);
        const { outcome, match } = resolveAgainstChallengeDice(boxes, faces[0], faces[1]);
        const word = outcome === "strong_hit" ? "STRONG HIT" : outcome === "weak_hit" ? "WEAK HIT" : "MISS";
        let ctx = `[Progress roll: ${existing.kind} "${existing.name}", ${boxes} boxes vs ${faces[0]} and ${faces[1]} → ${word}]`;
        if (match) ctx += `\n${matchNote(faces[0], outcome)}`;
        ctx += `\n[The track stays active until you set its status.]`;
        // Like action_roll, success carries the engine's verdict (a miss is a
        // failed check, not a failed call).
        return trackResult(
          { outcome, dice: faces, match, ticks: existing.ticks, boxes },
          ctx,
          outcome !== "miss"
        );
      }
      case "set_status": {
        const st = params.status;
        if (st !== "fulfilled" && st !== "forsaken" && st !== "cleared") {
          return fail(`manage_track set_status needs "status": fulfilled, forsaken or cleared`);
        }
        write({ ...existing, status: st });
        return trackResult({}, `[Track: ${existing.kind} "${existing.name}" is now ${st}]`);
      }
      case "halve": {
        const next = halveTrack(existing);
        write(next);
        return trackResult(
          { ticks: next.ticks, boxes: filledBoxes(next.ticks) },
          `[Track: "${existing.name}" progress halved, ${filledBoxes(existing.ticks)} → ${filledBoxes(next.ticks)} boxes]`
        );
      }
      case "set_rank": {
        if (!params.rank || !(params.rank in TICKS_PER_MARK)) {
          return fail(`manage_track set_rank needs "rank"`);
        }
        write({ ...existing, rank: params.rank });
        return trackResult(
          {},
          `[Track: "${existing.name}" is now ${params.rank} (marks add ${TICKS_PER_MARK[params.rank]} ticks); existing progress is unchanged]`
        );
      }
      case "remove": {
        storyData.progressTracks = tracks.filter((t) => t.id !== existing.id);
        return trackResult({}, `[Track removed: "${existing.name}"]`);
      }
      default:
        return fail(
          `manage_track called with unknown action "${String(params.action)}" (expected create/mark/progress_roll/set_status/halve/set_rank/remove)`
        );
    }
  } catch (e) {
    if (e instanceof MeterError) return fail(e.message);
    throw e;
  }
}

function executeEndSession(
  toolCallId: string,
  params: EndSessionParams,
  storyData: StoryData
): GMToolResult {
  const sys = ensureSystemState(storyData);
  sys.sessionCount += 1;
  const sceneCount = storyData.agmtState?.sceneCount ?? 0;
  sys.dedupKeys = pruneDedupKeys(sys.dedupKeys, sceneCount, sys.sessionCount);
  // Fantastic Realms: the adventure's counted uses (and the hearth's) start
  // over. A no-op for a story with no Fantastic Realms state.
  resetCountersOnState(sys.fantasticRealms, "adventure");

  const reset: string[] = [];
  storyData.meters = (storyData.meters ?? []).map((m) => {
    if (m.resetsAtSessionEnd === undefined) return m;
    const value = Math.min(m.cap, Math.max(m.floor, m.resetsAtSessionEnd));
    reset.push(`${m.owner}: ${m.name} → ${value}`);
    return { ...m, value };
  });

  const reminder = resolveSystem(storyData).endOfSessionReminder;
  let ctx = `[Session ${sys.sessionCount} ended${params.reason ? `: ${params.reason}` : ""}. Session ${sys.sessionCount + 1} begins; once-per-session triggers are available again.]`;
  if (reset.length > 0) ctx += `\n[Reset at session end: ${reset.join("; ")}]`;
  if (reminder) ctx += `\n[End-of-session reminder: ${reminder}]`;
  return {
    toolName: "end_session",
    toolCallId,
    success: true,
    result: {
      type: "end_session",
      sessionCount: sys.sessionCount,
      reset,
    } as GMEndSessionResult,
    contextForStory: ctx,
  };
}

/**
 * What a match (both challenge dice the same) means, by outcome, as the
 * Blood & Bone core states it: a matched strong hit is something memorable
 * going right, a matched miss is a worse price. The playtest of 2026-10-24
 * found the old one-size line ("a complication on a hit") telling the GM the
 * opposite of the rules on a strong hit (decision 178). With both dice the
 * same, a score beats both or neither, so a match is never a weak hit.
 */
function matchNote(face: number, outcome: "strong_hit" | "weak_hit" | "miss"): string {
  const meaning =
    outcome === "miss"
      ? "A matched miss: roll the miss table twice, or apply one result at double severity."
      : "A matched strong hit: something memorable goes right, beyond what was asked.";
  return `[MATCH: both challenge dice show ${face}. ${meaning}]`;
}

async function executeActionRoll(
  toolCallId: string,
  params: ActionRollParams,
  storyData: StoryData,
  interaction: GMInteractionHandlers
): Promise<GMToolResult> {
  const fail = (message: string) =>
    systemErrorResult("action_roll", toolCallId, message);

  if (typeof params.stat_value !== "number" || !Number.isFinite(params.stat_value)) {
    return fail(`action_roll needs "stat_value", the number from the character sheet`);
  }
  const adds = typeof params.adds === "number" ? params.adds : 0;
  const penalty =
    typeof params.penalty === "number" && Number.isFinite(params.penalty)
      ? Math.max(0, params.penalty)
      : 0;

  let actionDie: number;
  let challengeDice: [number, number];
  if (params.dice !== undefined) {
    if (storyData.diceMode !== "manual") {
      return fail(
        `"dice" is only for manual dice mode, where the player reports their physical roll. Leave it out and the engine rolls.`
      );
    }
    const d = params.dice;
    const okAction =
      !!d && typeof d.action === "number" && Number.isInteger(d.action) && d.action >= 1 && d.action <= 6;
    const okChallenge =
      !!d &&
      Array.isArray(d.challenge) &&
      d.challenge.length === 2 &&
      isD10Face(d.challenge[0]) &&
      isD10Face(d.challenge[1]);
    if (!okAction || !okChallenge) {
      return fail(
        `dice must be {action: 1-6, challenge: [1-10, 1-10]}, the faces the player reported`
      );
    }
    actionDie = d.action;
    challengeDice = [d.challenge[0], d.challenge[1]];
  } else {
    try {
      const [dieRoll, challengeRoll] = await rollFormulasMaybePhysical(
        ["1d6", "2d10"],
        { reason: params.reason || "Action roll" },
        interaction
      );
      const a = flattenRolls(dieRoll.rolls);
      const c = flattenRolls(challengeRoll.rolls);
      actionDie = a[0];
      challengeDice = [c[0], c[1]];
    } catch (e) {
      return fail(e instanceof Error ? e.message : "The dice could not be rolled");
    }
  }

  const { score, addsApplied, capped } = actionScore(
    actionDie,
    params.stat_value,
    adds,
    penalty
  );
  const { outcome, match } = resolveAgainstChallengeDice(
    score,
    challengeDice[0],
    challengeDice[1]
  );
  const word = outcome === "strong_hit" ? "STRONG HIT" : outcome === "weak_hit" ? "WEAK HIT" : "MISS";
  const who = params.owner ? `${params.owner}: ` : "";
  const parts = [`d6 ${actionDie}`, `+ ${params.stat_name} ${params.stat_value}`];
  if (addsApplied > 0) parts.push(`+ adds ${addsApplied}`);
  if (penalty > 0) parts.push(`- penalty ${penalty}`);
  let ctx = `[Action roll - ${who}${params.move ? `${params.move} ` : ""}+${params.stat_name}: ${parts.join(" ")} = ${score}${capped ? " (capped at 10)" : ""} vs ${challengeDice[0]} and ${challengeDice[1]} → ${word}]`;
  if (adds > ACTION_ADDS_CAP) {
    ctx += `\n[Only +${ACTION_ADDS_CAP} of the ${adds} adds claimed applies.]`;
  }
  if (match) {
    ctx += `\n${matchNote(challengeDice[0], outcome)}`;
  }
  ctx += `\n[Reason: ${params.reason}]`;
  if (params.stakes) {
    ctx += `\n[Stakes: ${params.stakes}]`;
    ctx += applyStakesEscalation(storyData, params.stakes);
  }

  return {
    toolName: "action_roll",
    toolCallId,
    // Like record_challenge_result, success carries the outcome: a miss is
    // a failed check, not a failed call.
    success: outcome !== "miss",
    result: {
      type: "action_roll",
      statName: params.stat_name,
      statValue: params.stat_value,
      adds,
      addsApplied,
      penalty,
      actionDie,
      challengeDice,
      score,
      capped,
      outcome,
      match,
      move: params.move,
      owner: params.owner,
    } as GMActionRollResult,
    contextForStory: ctx,
  };
}

// ============================================
// FANTASTIC REALMS TOOL EXECUTION
// docs/fantastic-realms-design.md section 5.2; arithmetic in
// systems/fantastic-realms/engine.ts
// ============================================

function frFail(toolName: string, toolCallId: string, message: string): GMToolResult {
  return systemErrorResult(toolName, toolCallId, message);
}

/** The tools the story's resolved system offers; a Fantastic Realms tool in any other story is refused. */
function frNotOffered(
  toolName: string,
  toolCallId: string,
  storyData: StoryData
): GMToolResult | null {
  if (resolveSystem(storyData).tools.includes(toolName)) return null;
  return frFail(toolName, toolCallId, `${toolName} is not part of this story's system`);
}

function frState(storyData: StoryData): FantasticRealmsState {
  const sys = ensureSystemState(storyData);
  if (!sys.fantasticRealms || typeof sys.fantasticRealms.heroes !== "object") {
    sys.fantasticRealms = { ...sys.fantasticRealms, heroes: {} };
  }
  return sys.fantasticRealms;
}

function frHeroName(params: { hero?: unknown }): string {
  return typeof params.hero === "string" ? params.hero.trim() : "";
}

/** A hero's name as the meters spell it, else the key. */
function frDisplayName(storyData: StoryData, key: string): string {
  const named = storyData.systemState?.fantasticRealms?.heroes?.[key]?.name;
  if (named) return named;
  const m = (storyData.meters ?? []).find(
    (x) => normalizeKey(x.owner) === key && x.name === "Hearts"
  );
  return m?.owner ?? key;
}

function frStr(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function frFindFeat(feats: HeroFeat[], wording: string): HeroFeat | undefined {
  return feats.find((f) => normaliseFeat(f.wording) === normaliseFeat(wording));
}

function frNextFeatId(feats: HeroFeat[], prefix: string): string {
  const n =
    feats.reduce((mx, f) => Math.max(mx, Number(/(\d+)$/.exec(f.id)?.[1] ?? 0)), 0) + 1;
  return `${prefix}-${n}`;
}

/** A hero's hearts, when the story tracks them; undefined means unknown (never "0"). */
function frHearts(storyData: StoryData, who: string): number | undefined {
  return findMeter(storyData.meters ?? [], who, "Hearts")?.value;
}

function frIsDown(storyData: StoryData, who: string, hero: FantasticRealmsHero | undefined): boolean {
  return isDown(frHearts(storyData, who), hero?.conditions);
}

/** `; conditions: Wounded; scars: Fear of Fire; down`, or nothing for a hero with none of them. */
function frHeroTail(storyData: StoryData, who: string, hero: FantasticRealmsHero): string {
  const parts: string[] = [];
  const conditions = describeConditions(hero.conditions);
  if (conditions) parts.push(`conditions: ${conditions}`);
  const scars = describeScars(hero.conditions);
  if (scars) parts.push(`scars: ${scars}`);
  if (frIsDown(storyData, who, hero)) parts.push("down");
  return parts.length > 0 ? `; ${parts.join("; ")}` : "";
}

/** Validates the item qualities of an `add`: items only, known words, at most two. */
function frCleanQualities(
  kind: HeroFeat["kind"],
  raw: unknown
): { qualities: ItemQuality[] | undefined } | { error: string } {
  if (raw === undefined || raw === null) return { qualities: undefined };
  if (!Array.isArray(raw) || raw.some((q) => typeof q !== "string")) {
    return { error: `"qualities" must be a list of quality words` };
  }
  if (raw.length === 0) return { qualities: undefined };
  if (kind !== "item") return { error: `Only an item can carry qualities (kind: "item")` };
  const out: ItemQuality[] = [];
  for (const q of raw as string[]) {
    const word = q.trim().toLowerCase();
    if (!(ITEM_QUALITIES as readonly string[]).includes(word)) {
      return { error: `Unknown quality "${q}". Qualities: ${ITEM_QUALITIES.join(", ")}` };
    }
    if (!out.includes(word as ItemQuality)) out.push(word as ItemQuality);
  }
  if (out.length > 2) return { error: `An item carries at most two qualities` };
  return { qualities: out };
}

/** A new feat from an add-style call, or a message. */
function frBuildFeat(
  existing: HeroFeat[],
  prefix: string,
  wording: string,
  kindParam: unknown,
  qualitiesParam: unknown
): { feat: HeroFeat } | { error: string } {
  if (!normaliseFeat(wording)) return { error: `A feat needs words` };
  let kind: HeroFeat["kind"];
  if (kindParam !== undefined && kindParam !== null) {
    if (kindParam !== "skill" && kindParam !== "spell" && kindParam !== "item") {
      return { error: `kind must be skill, spell or item` };
    }
    // A plain skill stays the absent default, so an old-shaped feat is unchanged.
    kind = kindParam === "skill" ? undefined : kindParam;
  }
  const q = frCleanQualities(kind, qualitiesParam);
  if ("error" in q) return { error: q.error };
  const feat: HeroFeat = {
    id: frNextFeatId(existing, prefix),
    wording,
    burned: false,
    ...(kind ? { kind } : {}),
    ...(q.qualities && q.qualities.length > 0 ? { qualities: q.qualities } : {}),
  };
  return { feat };
}

function frFeatList(hero: FantasticRealmsHero): string {
  return hero.feats.length > 0 ? hero.feats.map(describeFeat).join(", ") : "none yet";
}

const FR_USE_PERS: readonly UsePer[] = ["scene", "rest", "adventure"];

function executeManageFeats(
  toolCallId: string,
  params: ManageFeatsParams,
  storyData: StoryData
): GMToolResult {
  const fail = (m: string) => frFail("manage_feats", toolCallId, m);
  const off = frNotOffered("manage_feats", toolCallId, storyData);
  if (off) return off;
  const action = params.action;
  const isParty = action === "add_party_feat" || action === "remove_party_feat";
  const name = frHeroName(params);
  if (!isParty && !name) return fail(`manage_feats needs "hero"`);
  const feat = frStr(params.feat);
  const needsFeat = !(
    action === "add_condition" ||
    action === "clear_condition" ||
    action === "add_scar" ||
    action === "scar_to_feat" ||
    action === "retire" ||
    action === "rejoin"
  );
  if (needsFeat && !feat) return fail(`manage_feats needs "feat"`);
  const key = normalizeKey(name);
  const state = frState(storyData);
  const existing = state.heroes[key];
  const match = (w: string) => normaliseFeat(w);
  const result = (
    hero: FantasticRealmsHero | undefined,
    line: string,
    tail: string
  ): GMToolResult => ({
    toolName: "manage_feats",
    toolCallId,
    success: true,
    result: {
      type: "manage_feats",
      hero: isParty ? "party" : name,
      action,
      feats: (hero ? hero.feats : (state.partyFeats ?? [])).map((f) => ({ ...f })),
      ...(hero?.conditions ? { conditions: hero.conditions.map((c) => ({ ...c })) } : {}),
    } as GMManageFeatsResult,
    contextForStory: `[Feats: ${line}. ${isParty ? "Party feats" : `${name}'s feats`}: ${
      hero ? frFeatList(hero) : (state.partyFeats ?? []).map(describeFeat).join(", ") || "none yet"
    }${tail}]`,
  });

  // The party's feats (hearth improvements, decision 256) need no hero.
  if (isParty) {
    const list = state.partyFeats ?? [];
    if (action === "add_party_feat") {
      const built = frBuildFeat(list, "party", feat, undefined, undefined);
      if ("error" in built) return fail(built.error);
      if (list.some((f) => match(f.wording) === match(feat))) {
        return fail(`The party already has the feat "${feat}"`);
      }
      state.partyFeats = [...list, built.feat];
      return result(undefined, `The party gained the feat "${feat}"`, "");
    }
    const target = frFindFeat(list, feat);
    if (!target) {
      return fail(
        `The party has no feat "${feat}". Party feats: ${list.map(describeFeat).join(", ") || "none"}`
      );
    }
    state.partyFeats = list.filter((f) => f.id !== target.id);
    if (state.partyUses) {
      const kept = Object.fromEntries(
        Object.entries(state.partyUses).filter(([k]) => !k.startsWith(`${target.id}:`))
      );
      if (Object.keys(kept).length > 0) state.partyUses = kept;
      else delete state.partyUses;
    }
    return result(undefined, `The party lost the feat "${target.wording}"`, "");
  }

  let hero: FantasticRealmsHero;
  let line: string;
  const needExisting = () =>
    existing ? null : fail(`${name} has no feats recorded. Add them with manage_feats first.`);
  const needFeat = (): HeroFeat | GMToolResult => {
    const target = existing ? frFindFeat(existing.feats, feat) : undefined;
    return (
      target ??
      fail(`${name} has no feat "${feat}". Feats: ${existing ? frFeatList(existing) : "none yet"}`)
    );
  };
  const isFail = (v: HeroFeat | GMToolResult): v is GMToolResult => "toolName" in v;
  const patchFeat = (base: FantasticRealmsHero, id: string, patch: (f: HeroFeat) => HeroFeat) => ({
    ...base,
    feats: base.feats.map((f) => (f.id === id ? patch(f) : f)),
  });
  const withoutStatus = (f: HeroFeat): HeroFeat => {
    const rest = { ...f };
    delete rest.status;
    return rest;
  };

  if (action === "add") {
    hero = existing ?? { name, feats: [], rewards: [] };
    if (!hero.name) hero = { ...hero, name };
    if (!match(feat)) return fail(`A feat needs words`);
    if (hero.feats.some((f) => match(f.wording) === match(feat))) {
      return fail(`${name} already has the feat "${feat}"`);
    }
    const built = frBuildFeat(hero.feats, "feat", feat, params.kind, params.qualities);
    if ("error" in built) return fail(built.error);
    hero = { ...hero, feats: [...hero.feats, built.feat] };
    line = `${name} gained the feat "${feat}"`;
  } else if (action === "rename" || action === "remove") {
    const missing = needExisting();
    if (missing) return missing;
    const target = needFeat();
    if (isFail(target)) return target;
    if (action === "remove") {
      hero = { ...existing!, feats: existing!.feats.filter((f) => f.id !== target.id) };
      // A later feat may reuse the id: it must not inherit this one's counters.
      if (hero.uses) {
        const kept = Object.fromEntries(
          Object.entries(hero.uses).filter(([k]) => !k.startsWith(`${target.id}:`))
        );
        if (Object.keys(kept).length > 0) hero.uses = kept;
        else delete hero.uses;
      }
      line = `${name} lost the feat "${target.wording}"`;
    } else {
      const next = frStr(params.new_wording);
      if (!match(next)) return fail(`rename needs "new_wording"`);
      if (existing!.feats.some((f) => f.id !== target.id && match(f.wording) === match(next))) {
        return fail(`${name} already has the feat "${next}"`);
      }
      hero = patchFeat(existing!, target.id, (f) => ({ ...f, wording: next }));
      line = `${name}'s feat "${target.wording}" is now "${next}"${target.burned ? " (still burned)" : ""}`;
    }
  } else if (action === "burn") {
    const missing = needExisting();
    if (missing) return missing;
    const target = needFeat();
    if (isFail(target)) return target;
    const usable = featUsable(target);
    if (!usable.ok) return fail(`${name}'s feat "${target.wording}" ${usable.reason}`);
    hero = patchFeat(existing!, target.id, (f) => ({ ...f, burned: true }));
    line = `${name}'s feat "${target.wording}" is burned without a roll: it adds nothing until a rest`;
  } else if (action === "break" || action === "lose" || action === "recover" || action === "mend") {
    const missing = needExisting();
    if (missing) return missing;
    const target = needFeat();
    if (isFail(target)) return target;
    if (target.kind !== "item") {
      return fail(`"${target.wording}" is not an item; only an item can be broken, lost, recovered or mended`);
    }
    if (action === "break") {
      if (target.status === "broken") return fail(`"${target.wording}" is already broken`);
      if (target.status === "lost") return fail(`"${target.wording}" is lost; recover it first`);
      hero = patchFeat(existing!, target.id, (f) => ({ ...f, status: "broken" }));
      line = `${name}'s "${target.wording}" is broken: it cannot be named in a roll until it is mended`;
    } else if (action === "lose") {
      if (target.status === "lost") return fail(`"${target.wording}" is already lost`);
      hero = patchFeat(existing!, target.id, (f) => ({ ...f, status: "lost" }));
      line = `${name}'s "${target.wording}" is lost: it keeps its place and qualities until it is recovered`;
    } else if (action === "recover") {
      if (target.status !== "lost") return fail(`"${target.wording}" is not lost`);
      hero = patchFeat(existing!, target.id, withoutStatus);
      line = `${name} recovered "${target.wording}"`;
    } else {
      if (target.status !== "broken") {
        return fail(
          target.status === "lost"
            ? `"${target.wording}" is lost, not broken; recover it first`
            : `"${target.wording}" is not broken`
        );
      }
      hero = patchFeat(existing!, target.id, withoutStatus);
      line = `${name} mended "${target.wording}"${target.burned ? " (still burned until a rest)" : ""}`;
    }
  } else if (action === "add_condition" || action === "add_scar") {
    const word = frStr(params.condition);
    if (!match(word)) return fail(`${action} needs "condition"`);
    // Only an existing hero takes a condition: a foe or an NPC is not a hero.
    const missing = needExisting();
    if (missing) return missing;
    hero = existing!;
    if (!hero.name) hero = { ...hero, name };
    const have =(hero.conditions ?? []).find((c) => match(c.word) === match(word));
    if (have) {
      // Each word is stored once; giving it again does nothing (design 14).
      state.heroes[key] = hero;
      return result(
        hero,
        `${name} already has ${have.scar ? "the scar" : "the condition"} "${have.word}"; nothing changed`,
        frHeroTail(storyData, name, hero)
      );
    }
    if (action === "add_scar") {
      if (!frIsDown(storyData, name, hero)) {
        return fail(`Only a hero who is down may take a scar, and ${name} is not down`);
      }
      hero = { ...hero, conditions: [...(hero.conditions ?? []), { word, scar: true }] };
      line = `${name} took the scar "${word}": it never clears on its own`;
    } else {
      const cureParam = frStr(params.cure);
      const cure = cureParam || (match(word) === HUNGRY_WORD ? HUNGRY_CURE : "");
      const added: HeroCondition = { word, ...(cure ? { cure } : {}) };
      hero = { ...hero, conditions: [...(hero.conditions ?? []), added] };
      line = `${name} is now ${word}${cure ? ` (needs ${cure})` : ""}: it costs a die where it gets in the way`;
    }
  } else if (action === "clear_condition") {
    const missing = needExisting();
    if (missing) return missing;
    const word = frStr(params.condition);
    if (!match(word)) return fail(`clear_condition needs "condition"`);
    const target = (existing!.conditions ?? []).find((c) => match(c.word) === match(word));
    if (!target) {
      return fail(
        `${name} has no condition "${word}". Conditions: ${(existing!.conditions ?? []).map((c) => c.word).join(", ") || "none"}`
      );
    }
    if (target.scar) {
      return fail(
        `"${target.word}" is a scar and never clears on its own; scar_to_feat turns it into a feat at a level`
      );
    }
    const wasDown = frIsDown(storyData, name, existing);
    const remaining = (existing!.conditions ?? []).filter((c) => c !== target);
    hero = { ...existing! };
    if (remaining.length > 0) hero.conditions = remaining;
    else delete hero.conditions;
    line = `${name} is no longer ${target.word}`;
    if (wasDown && !frIsDown(storyData, name, hero)) line += `, and is up again`;
  } else if (action === "scar_to_feat") {
    const missing = needExisting();
    if (missing) return missing;
    const word = frStr(params.condition);
    if (!match(word)) return fail(`scar_to_feat needs "condition" (the scar)`);
    const scar = (existing!.conditions ?? []).find((c) => match(c.word) === match(word));
    if (!scar || !scar.scar) {
      return fail(
        `${name} has no scar "${word}". Scars: ${describeScars(existing!.conditions) || "none"}`
      );
    }
    const next = frStr(params.new_wording);
    if (!match(next)) return fail(`scar_to_feat needs "new_wording" (the feat that replaces it)`);
    if (existing!.feats.some((f) => match(f.wording) === match(next))) {
      return fail(`${name} already has the feat "${next}"`);
    }
    const built = frBuildFeat(existing!.feats, "feat", next, params.kind, params.qualities);
    if ("error" in built) return fail(built.error);
    const remaining = (existing!.conditions ?? []).filter((c) => c !== scar);
    hero = { ...existing!, feats: [...existing!.feats, built.feat] };
    if (remaining.length > 0) hero.conditions = remaining;
    else delete hero.conditions;
    line = `${name}'s scar "${scar.word}" became the feat "${next}"`;
  } else if (action === "retire" || action === "rejoin") {
    // A hero who died or left the party is kept for history but is out of the
    // party rest, the default hero selections and the hero line.
    const missing = needExisting();
    if (missing) return missing;
    if (action === "retire") {
      if (existing!.retired) return fail(`${name} has already left the party`);
      hero = { ...existing!, retired: true };
      line = `${name} left the party: kept for history, out of party rests, awards and the hero line`;
    } else {
      if (!existing!.retired) return fail(`${name} has not left the party`);
      hero = { ...existing! };
      delete hero.retired;
      line = `${name} rejoined the party`;
    }
  } else if (action === "use") {
    const missing = needExisting();
    if (missing) return missing;
    const per = params.per;
    if (!per || !FR_USE_PERS.includes(per)) return fail(`use needs "per": scene, rest or adventure`);
    if (
      params.limit !== undefined &&
      (typeof params.limit !== "number" ||
        !Number.isInteger(params.limit) ||
        params.limit < 1 ||
        params.limit > 99)
    ) {
      return fail(`limit must be a whole number from 1 up`);
    }
    const ownFeat = frFindFeat(existing!.feats, feat);
    const partyFeat = ownFeat ? undefined : frFindFeat(state.partyFeats ?? [], feat);
    if (ownFeat?.status) {
      const usable = featUsable(ownFeat);
      if (!usable.ok) return fail(`${name}'s feat "${ownFeat.wording}" ${usable.reason}`);
    }
    // A feat counts by its id, a hearth improvement by its party id, and any
    // other name (a calling's move) by its words under a "~" prefix.
    const id = ownFeat?.id ?? partyFeat?.id ?? `~${normaliseFeat(feat)}`;
    const label = ownFeat?.wording ?? partyFeat?.wording ?? feat;
    const counterKey = usageKey(id, per);
    const book = partyFeat ? state.partyUses ?? {} : existing!.uses ?? {};
    const spent = book[counterKey] ?? 0;
    // The limit is fixed by the first use (kept beside the counter, so it
    // resets with it) and a later call may not choose another.
    const limitKey = `${id}:limit:${per}`;
    const storedLimit = book[limitKey];
    if (storedLimit !== undefined && params.limit !== undefined && params.limit !== storedLimit) {
      return fail(
        `"${label}" is counted at ${storedLimit} per ${per}; the limit cannot change until it resets`
      );
    }
    const limit = storedLimit ?? params.limit ?? 1;
    if (spent >= limit) {
      return fail(
        `"${label}" has already been used ${spent} of ${limit} ${limit === 1 ? "time" : "times"} this ${per}`
      );
    }
    const nextBook = { ...book, [counterKey]: spent + 1, [limitKey]: limit };
    if (partyFeat) {
      state.partyUses = nextBook;
      hero = existing!;
    } else {
      hero = { ...existing!, uses: nextBook };
    }
    line = `${name} used "${label}" (${spent + 1} of ${limit} this ${per})`;
  } else {
    return fail(
      `manage_feats action must be add, rename, remove, burn, break, lose, recover, mend, add_condition, clear_condition, add_scar, scar_to_feat, use, retire, rejoin, add_party_feat or remove_party_feat`
    );
  }
  state.heroes[key] = hero;
  return result(hero, line, frHeroTail(storyData, name, hero));
}

/**
 * Resolves the named feats against a hero's list: each must be one of the
 * hero's, usable (featUsable: not burned, broken or lost) and named once.
 * Returns the matched feats or a message.
 */
function frResolveFeats(
  hero: FantasticRealmsHero,
  who: string,
  named: unknown
): { feats: HeroFeat[] } | { error: string } {
  if (!Array.isArray(named) || named.some((f) => typeof f !== "string")) {
    return { error: `"feats" must be a list of feat wordings` };
  }
  const out: HeroFeat[] = [];
  for (const w of named as string[]) {
    const f = frFindFeat(hero.feats, w);
    if (!f) return { error: `${who} has no feat "${w}". Feats: ${frFeatList(hero)}` };
    const usable = featUsable(f);
    if (!usable.ok) return { error: `${who}'s feat "${f.wording}" ${usable.reason}` };
    if (out.some((x) => x.id === f.id)) {
      return { error: `The feat "${f.wording}" is named twice; each feat counts once per roll` };
    }
    out.push(f);
  }
  return { feats: out };
}

/** One other hero's feat, for a help or a team burn: owned, usable, and the hero not down. */
function frResolveContributor(
  storyData: StoryData,
  state: FantasticRealmsState,
  rollerKey: string,
  role: "help" | "team_burn",
  raw: unknown
): { key: string; name: string; hero: FantasticRealmsHero; feat: HeroFeat } | { error: string } {
  const label = role === "help" ? "help" : "team_burn";
  const o = (raw ?? {}) as { hero?: unknown; feat?: unknown };
  const heroName = frStr(o.hero);
  const featName = frStr(o.feat);
  if (!heroName || !featName) return { error: `${label} needs "hero" and "feat"` };
  const key = normalizeKey(heroName);
  if (key === rollerKey) {
    return {
      error:
        role === "help"
          ? `A hero cannot help their own roll`
          : `The team-burn partner must be another hero, not the roller`,
    };
  }
  const hero = state.heroes[key];
  if (!hero) return { error: `${heroName} has no feats recorded. Add them with manage_feats first.` };
  const who = frDisplayName(storyData, key);
  if (hero.retired) return { error: `${who} has left the party` };
  if (frIsDown(storyData, who, hero)) {
    return { error: `${who} is down and cannot ${role === "help" ? "help" : "burn a feat"}` };
  }
  const feat = frFindFeat(hero.feats, featName);
  if (!feat) return { error: `${who} has no feat "${featName}". Feats: ${frFeatList(hero)}` };
  const usable = featUsable(feat);
  if (!usable.ok) return { error: `${who}'s feat "${feat.wording}" ${usable.reason}` };
  return { key, name: who, hero, feat };
}

async function executeFeatRoll(
  toolCallId: string,
  params: FeatRollParams,
  storyData: StoryData,
  interaction: GMInteractionHandlers
): Promise<GMToolResult> {
  const fail = (m: string) => frFail("feat_roll", toolCallId, m);
  const off = frNotOffered("feat_roll", toolCallId, storyData);
  if (off) return off;
  const name = frHeroName(params);
  if (!name) return fail(`feat_roll needs "hero"`);
  const state = frState(storyData);
  const key = normalizeKey(name);
  const hero = state.heroes[key];
  if (!hero) {
    return fail(`${name} has no feats recorded. Add them with manage_feats first.`);
  }
  // Refusals, in order. None of them writes anything: the burns, the team-burn
  // counter and the helper are recorded only once the faces exist.
  if (hero.retired) return fail(`${name} has left the party`);
  if (frIsDown(storyData, name, hero)) {
    return fail(
      `${name} is down and cannot roll, help or burn a feat until a rest or a healing spell lifts them`
    );
  }
  const dc = params.dc;
  if (typeof dc !== "number" || !Number.isInteger(dc) || dc < 2 || dc > 6) {
    return fail(`dc must be a whole number from 2 to 6 (DC 1 needs no roll: it happens, as a hit)`);
  }
  const resolved = frResolveFeats(hero, name, params.feats ?? []);
  if ("error" in resolved) return fail(resolved.error);
  const used = resolved.feats;
  const wantsBurn =
    params.burn !== undefined && params.burn !== null && String(params.burn).trim() !== "";
  const wantsTeamBurn = params.team_burn !== undefined && params.team_burn !== null;
  if (wantsBurn && wantsTeamBurn) {
    return fail(`Name either burn or team_burn, not both: a team burn takes the place of the roller's own burn`);
  }
  let burned: HeroFeat | undefined;
  if (wantsBurn) {
    burned = used.find((f) => normaliseFeat(f.wording) === normaliseFeat(String(params.burn)));
    if (!burned) {
      return fail(
        used.length === 0
          ? `Nothing to burn: the roll names no feats, and the base die cannot be burned`
          : `"${params.burn}" must be one of the feats in this roll to be burned`
      );
    }
  }

  let helper: ReturnType<typeof frResolveContributor> | undefined;
  if (params.help !== undefined && params.help !== null) {
    helper = frResolveContributor(storyData, state, key, "help", params.help);
    if ("error" in helper) return fail(helper.error);
  }

  let partner: ReturnType<typeof frResolveContributor> | undefined;
  let ownBurn: HeroFeat | undefined;
  if (wantsTeamBurn) {
    partner = frResolveContributor(storyData, state, key, "team_burn", params.team_burn);
    if ("error" in partner) return fail(partner.error);
    const ownName = frStr(params.team_burn?.own_feat);
    if (!ownName) return fail(`team_burn needs "own_feat": the roller's feat to burn`);
    ownBurn = frFindFeat(hero.feats, ownName);
    if (!ownBurn) return fail(`${name} has no feat "${ownName}". Feats: ${frFeatList(hero)}`);
    const usable = featUsable(ownBurn);
    if (!usable.ok) return fail(`${name}'s feat "${ownBurn.wording}" ${usable.reason}`);
    if (
      helper &&
      !("error" in helper) &&
      helper.key === partner.key &&
      helper.feat.id === partner.feat.id
    ) {
      return fail(`${partner.name}'s feat "${partner.feat.wording}" cannot both help and be burned in one roll`);
    }
    if ((state.teamBurnsUsed ?? 0) >= TEAM_BURNS_PER_REST) {
      return fail(
        `The party has used both team burns; they return at a party rest (a take_rest that includes every hero)`
      );
    }
  }

  let hindrances: HeroCondition[] = [];
  if (params.hindered_by !== undefined && params.hindered_by !== null) {
    if (!Array.isArray(params.hindered_by) || params.hindered_by.some((w) => typeof w !== "string")) {
      return fail(`"hindered_by" must be a list of condition words`);
    }
    for (const w of params.hindered_by) {
      const c = (hero.conditions ?? []).find((x) => normaliseFeat(x.word) === normaliseFeat(w));
      if (!c) {
        return fail(
          `${name} has no condition "${w}". Conditions: ${(hero.conditions ?? []).map((x) => x.word).join(", ") || "none"}`
        );
      }
      if (hindrances.includes(c)) {
        return fail(`The condition "${c.word}" is named twice; each costs one die once`);
      }
      hindrances = [...hindrances, c];
    }
  }

  // A feat burned in a team burn adds no die, so a roller who also named it
  // in `feats` does not count it in the pool.
  const poolFeats = ownBurn ? used.filter((f) => f.id !== ownBurn.id) : used;
  const poolDice = poolSize({
    feats: poolFeats.length,
    helped: !!helper,
    hindrances: hindrances.length,
    teamBurn: !!partner,
  });
  let dice: number[];
  if (params.dice !== undefined) {
    if (storyData.diceMode !== "manual") {
      return fail(
        `"dice" is only for manual dice mode, where the player reports their physical roll. Leave it out and the engine rolls.`
      );
    }
    const d = params.dice;
    if (
      !Array.isArray(d) ||
      d.length !== poolDice ||
      d.some((x) => typeof x !== "number" || !Number.isInteger(x) || x < 1 || x > 6)
    ) {
      return fail(`dice must be ${poolDice} faces (1-6), one per die in the pool`);
    }
    dice = [...d];
  } else {
    try {
      const [r] = await rollFormulasMaybePhysical(
        [`${poolDice}d6`],
        { reason: params.reason || "Feat roll" },
        interaction
      );
      dice = flattenRolls(r.rolls);
    } catch (e) {
      return fail(e instanceof Error ? e.message : "The dice could not be rolled");
    }
  }

  const rolled = countSuccesses(dice, dc);
  const sure = (burned ? 1 : 0) + (partner ? 2 : 0);
  const successes = rolled + sure;
  const result = resultFor(successes);
  // Only now that the faces exist are the burns and the counter written.
  const burnedIds = new Set<string>();
  if (burned) burnedIds.add(burned.id);
  if (ownBurn) burnedIds.add(ownBurn.id);
  if (burnedIds.size > 0) {
    state.heroes[key] = {
      ...hero,
      feats: hero.feats.map((f) => (burnedIds.has(f.id) ? { ...f, burned: true } : f)),
    };
  }
  if (partner && !("error" in partner)) {
    const partnerNow = state.heroes[partner.key];
    state.heroes[partner.key] = {
      ...partnerNow,
      feats: partnerNow.feats.map((f) => (f.id === partner.feat.id ? { ...f, burned: true } : f)),
    };
    state.teamBurnsUsed = (state.teamBurnsUsed ?? 0) + 1;
  }

  const spells = [...poolFeats, ...(ownBurn ? [ownBurn] : [])].filter((f) => f.kind === "spell");
  const magic = spells.length > 0;
  const qualities = [...poolFeats, ...(ownBurn ? [ownBurn] : [])].flatMap(itemQualities);
  const damage = attackDamage(result, qualities);
  const target = typeof params.target === "string" ? params.target.trim() : "";
  const keenBonus = damage > 0 && damage > attackDamage(result, []);
  const word = tierWord(result.tier) + (result.magnitude > 0 ? ` +${result.magnitude}` : "");
  const pool = poolFeats.length > 0 ? ` (${poolFeats.map((f) => f.wording).join(", ")})` : "";
  let ctx = `[Feat roll - ${name}${pool} DC ${dc}: ${poolDice}d6 [${dice.join(", ")}] → ${rolled} ${rolled === 1 ? "success" : "successes"}${burned ? ` + burned ${burned.wording} (1 sure success) = ${successes}` : ""}${partner ? ` + team burn (2 sure successes) = ${successes}` : ""} → ${word}]`;
  if (burned) ctx += `\n[Burned: ${burned.wording} adds nothing until a rest]`;
  if (helper && !("error" in helper)) {
    ctx += `\n[Help: ${helper.name} adds a die with "${helper.feat.wording}". A cost on a miss may fall on ${helper.name} instead of, or as well as, ${name}; the roll still has one cost budget]`;
  }
  if (hindrances.length > 0) {
    ctx += `\n[Hindered: ${hindrances.map((c) => c.word).join(", ")} cost ${hindrances.length === 1 ? "a die" : `${hindrances.length} dice`}${poolDice === 1 ? " (the pool never drops below 1)" : ""}]`;
  }
  if (partner && !("error" in partner) && ownBurn) {
    const left = TEAM_BURNS_PER_REST - (state.teamBurnsUsed ?? 0);
    ctx += `\n[Team burn: ${name}'s "${ownBurn.wording}" and ${partner.name}'s "${partner.feat.wording}" are burned: two sure successes, and neither adds its die. ${left} of ${TEAM_BURNS_PER_REST} team burns left until a party rest]`;
  }
  if (result.tier !== "miss") {
    const hearts = `${damage} ${damage === 1 ? "heart" : "hearts"}`;
    ctx += `\n[If this struck a foe: it loses ${hearts}${keenBonus ? " (Keen +1)" : ""}]`;
  }
  if (magic && result.tier === "miss") {
    ctx += `\n[Miscast: this was magic. Its cost is a miscast from the realm's table]`;
  }
  if (result.tier === "miss" || result.tier === "weak_hit") {
    ctx += `\n[Cost budget: one heart or condition (two with a harm word), shared by everyone in this roll]`;
  }
  ctx += `\n[Reason: ${params.reason}]`;
  return {
    toolName: "feat_roll",
    toolCallId,
    // Like action_roll, success carries the outcome: a miss is a failed check.
    success: result.tier !== "miss",
    result: {
      type: "feat_roll",
      hero: name,
      feats: poolFeats.map((f) => f.wording),
      burned: burned?.wording,
      dc,
      dice,
      successes,
      outcome: result.tier,
      magnitude: result.magnitude,
      ...(target ? { target } : {}),
      ...(target && result.tier !== "miss" ? { damage } : {}),
      ...(magic ? { magic: true } : {}),
      ...(helper && !("error" in helper)
        ? { helper: { hero: helper.name, feat: helper.feat.wording } }
        : {}),
      ...(partner && !("error" in partner) && ownBurn
        ? { teamBurn: { hero: partner.name, feat: partner.feat.wording, ownFeat: ownBurn.wording } }
        : {}),
      ...(hindrances.length > 0 ? { hindrances: hindrances.map((c) => c.word) } : {}),
    } as GMFeatRollResult,
    contextForStory: ctx,
  };
}

async function executeInitiativeRoll(
  toolCallId: string,
  params: InitiativeRollParams,
  storyData: StoryData,
  interaction: GMInteractionHandlers
): Promise<GMToolResult> {
  const fail = (m: string) => frFail("initiative_roll", toolCallId, m);
  const off = frNotOffered("initiative_roll", toolCallId, storyData);
  if (off) return off;
  const entries = Array.isArray(params.heroes) ? params.heroes : [];
  if (entries.length === 0) return fail(`initiative_roll needs at least one hero`);
  const state = frState(storyData);
  const plan: { name: string; edges: string[] }[] = [];
  for (const e of entries) {
    const name = frHeroName(e);
    if (!name) return fail(`every initiative entry needs a "hero"`);
    const hero = state.heroes[normalizeKey(name)];
    if (hero?.retired) return fail(`${name} has left the party`);
    if (frIsDown(storyData, name, hero)) {
      return fail(`${name} is down and takes no part in the fight until a rest or a healing spell lifts them`);
    }
    const edgeNames = e.edge_feats ?? [];
    let edges: string[] = [];
    if (edgeNames.length > 0) {
      if (!hero) return fail(`${name} has no feats recorded. Add them with manage_feats first.`);
      const r = frResolveFeats(hero, name, edgeNames);
      if ("error" in r) return fail(r.error);
      edges = r.feats.map((f) => f.wording);
    }
    // A usable Swift item counts as an edge feat of its own.
    for (const f of hero?.feats ?? []) {
      if (isSwiftItem(f) && !edges.includes(f.wording)) edges.push(f.wording);
    }
    plan.push({ name, edges });
  }
  let faces: number[];
  if (params.dice !== undefined) {
    if (storyData.diceMode !== "manual") {
      return fail(
        `"dice" is only for manual dice mode, where the player reports their physical roll. Leave it out and the engine rolls.`
      );
    }
    const d = params.dice;
    const ok =
      Array.isArray(d) &&
      d.length === plan.length &&
      d.every((f) => typeof f === "number" && Number.isInteger(f) && f >= 1 && f <= 6);
    if (!ok) {
      return fail(`dice must be ${plan.length} faces (1-6), one per hero in order`);
    }
    faces = [...d];
  } else {
    try {
      const rolled = await rollFormulasMaybePhysical(
        plan.map(() => "1d6"),
        { reason: "Initiative" },
        interaction
      );
      faces = rolled.map((r) => flattenRolls(r.rolls)[0]);
    } catch (e) {
      return fail(e instanceof Error ? e.message : "The dice could not be rolled");
    }
  }
  const rows = plan.map((p, i) => ({
    hero: p.name,
    die: faces[i],
    edges: p.edges,
    total: faces[i] + p.edges.length,
  }));
  const lines = rows.map(
    (r) =>
      `[Initiative: ${r.hero} ${r.total} (d6 ${r.die}${r.edges.length > 0 ? ` + ${r.edges.length} for ${r.edges.join(", ")}` : ""})]`
  );
  lines.push(
    `[Foes' numbers are their DC + 1 per edge word, no roll. Highest goes first; ties go to the heroes.]`
  );
  return {
    toolName: "initiative_roll",
    toolCallId,
    success: true,
    result: { type: "initiative_roll", rolls: rows } as GMInitiativeRollResult,
    contextForStory: lines.join("\n"),
  };
}

/** The hero set the system carries by name, else the plan's definition. */
function frHeroSet(storyData: StoryData): MeterSet {
  const sets = resolveSystem(storyData).meterSets;
  return (
    sets.find((s) => normalizeKey(s.name) === normalizeKey(HERO_SET_NAME)) ??
    FALLBACK_HERO_SET
  );
}

/** The heroes a call names (default all) as keys, or a message. */
function frSelectHeroes(
  storyData: StoryData,
  named: unknown
): { keys: string[] } | { error: string } {
  const heroes = frState(storyData).heroes;
  // A hero who left the party is kept but not selected by default.
  const all = Object.keys(heroes).filter((k) => !heroes[k].retired);
  if (named === undefined || named === null) {
    return all.length > 0
      ? { keys: all }
      : { error: `No heroes are recorded yet. Add their feats with manage_feats first.` };
  }
  if (!Array.isArray(named) || named.some((n) => typeof n !== "string")) {
    return { error: `"heroes" must be a list of names` };
  }
  const keys: string[] = [];
  for (const n of named as string[]) {
    const k = normalizeKey(n);
    if (heroes[k]?.retired) {
      return { error: `${frDisplayName(storyData, k)} has left the party (manage_feats rejoin brings them back)` };
    }
    const hasMeters = (storyData.meters ?? []).some((m) => normalizeKey(m.owner) === k);
    if (!all.includes(k) && !hasMeters) {
      return {
        error: `Unknown hero "${n}". Heroes: ${all.map((x) => frDisplayName(storyData, x)).join(", ") || "none"}`,
      };
    }
    if (!keys.includes(k)) keys.push(k);
  }
  return keys.length > 0 ? { keys } : { error: `"heroes" is empty` };
}

function executeAwardXp(
  toolCallId: string,
  params: AwardXpParams,
  storyData: StoryData
): GMToolResult {
  const fail = (m: string) => frFail("award_xp", toolCallId, m);
  const off = frNotOffered("award_xp", toolCallId, storyData);
  if (off) return off;
  const amount = params.amount;
  if (typeof amount !== "number" || !Number.isInteger(amount) || amount <= 0) {
    return fail(`amount must be a positive whole number`);
  }
  const source = typeof params.source === "string" ? params.source.trim() : "";
  if (!source) return fail(`award_xp needs a "source" (the foe, treasure or quest)`);
  const picked = frSelectHeroes(storyData, params.heroes);
  if ("error" in picked) return fail(picked.error);

  const state = frState(storyData);
  const set = frHeroSet(storyData);
  const lines: string[] = [];
  const credited: string[] = [];
  const refused: string[] = [];
  const levelUps: GMAwardXpResult["levelUps"] = [];
  let meters: Meter[] = storyData.meters ?? [];
  const rewardsAfter: Record<string, FantasticRealmsHero> = {};

  try {
    for (const key of picked.keys) {
      const hero = state.heroes[key] ?? { feats: [], rewards: [] };
      const who = frDisplayName(storyData, key);
      if (hero.rewards.some((r) => normaliseFeat(r) === normaliseFeat(source))) {
        refused.push(who);
        continue;
      }
      // Create the hero set if missing, as create_set does.
      const { created } = createMeterSet(set, who, meters);
      if (created.length > 0) meters = [...meters, ...created];
      const level = findMeter(meters, who, "Level");
      const xp = findMeter(meters, who, "XP");
      const hearts = findMeter(meters, who, "Hearts");
      if (!level || !xp || !hearts) {
        return fail(`${who} lacks a Level, XP or Hearts meter; the "${set.name}" set makes them`);
      }
      const out = applyXp(level.value, xp.value, amount);
      let nextXp = setMeterMax(xp, levelCost(out.level), { raiseCap: true }).meter;
      nextXp = setMeterValue(nextXp, out.xp).meter;
      const nextLevel = setMeterValue(level, out.level).meter;
      let nextHearts = hearts;
      for (let i = 0; i < out.heartLevels.length; i++) {
        nextHearts = setMeterMax(nextHearts, nextHearts.max + 1, { raiseCap: true }).meter;
        nextHearts = adjustMeter(nextHearts, 1).meter;
      }
      meters = meters.map((m) =>
        m.id === xp.id ? nextXp : m.id === level.id ? nextLevel : m.id === hearts.id ? nextHearts : m
      );
      rewardsAfter[key] = { ...hero, rewards: [...hero.rewards, source] };
      credited.push(who);
      let line = `${who}: +${amount} XP (${source}) → level ${out.level}, ${out.xp}/${nextXp.max} XP`;
      if (out.levelsGained.length > 0) {
        line += `. ${out.levelsGained.length === 1 ? `Level ${out.levelsGained[0]} reached` : `Levels ${out.levelsGained.join(", ")} reached`}. Offer ${out.levelsGained.length === 1 ? "a new feat" : `${out.levelsGained.length} new feats`}`;
        if (out.heartLevels.length > 0) {
          line += `. +${out.heartLevels.length} maximum heart${out.heartLevels.length === 1 ? "" : "s"} (now ${nextHearts.value}/${nextHearts.max})`;
        }
      }
      lines.push(`[XP: ${line}]`);
      levelUps.push({
        hero: who,
        level: out.level,
        levelsGained: out.levelsGained,
        heartsGained: out.heartLevels.length,
      });
    }
  } catch (e) {
    if (e instanceof MeterError) return fail(e.message);
    throw e;
  }
  if (credited.length === 0) {
    return fail(
      `"${source}" was already credited to ${refused.join(", ")}; a source counts once per hero`
    );
  }
  storyData.meters = meters;
  Object.assign(state.heroes, rewardsAfter);
  if (refused.length > 0) {
    lines.push(`[XP: refused for ${refused.join(", ")}: "${source}" was already credited to them]`);
  }
  return {
    toolName: "award_xp",
    toolCallId,
    success: true,
    result: {
      type: "award_xp",
      amount,
      source,
      credited,
      refused,
      levelUps,
    } as GMAwardXpResult,
    contextForStory: lines.join("\n"),
  };
}

function executeTakeRest(
  toolCallId: string,
  params: TakeRestParams,
  storyData: StoryData
): GMToolResult {
  const fail = (m: string) => frFail("take_rest", toolCallId, m);
  const off = frNotOffered("take_rest", toolCallId, storyData);
  if (off) return off;
  const system = resolveSystem(storyData).system;
  const rests = system?.rests ?? {};
  // The notes write realms capitalised ("Aurelane") and the rests are keyed
  // in lower case: match loosely, and only on the map's own keys.
  const realmArg =
    typeof params.realm === "string" ? normalizeKey(params.realm) : "";
  const knowsRealm = (key: string) => Object.prototype.hasOwnProperty.call(rests, key);
  if (realmArg && Object.keys(rests).length > 0 && !knowsRealm(realmArg)) {
    return fail(`Unknown realm "${params.realm}". Realms: ${Object.keys(rests).join(", ")}`);
  }
  const picked = frSelectHeroes(storyData, params.heroes);
  if ("error" in picked) return fail(picked.error);

  const state = frState(storyData);
  if (realmArg) state.realm = realmArg;
  const realm = state.realm;
  let meters: Meter[] = storyData.meters ?? [];
  const rested: string[] = [];
  const healed: string[] = [];
  const conditionLines: string[] = [];
  for (const key of picked.keys) {
    const who = frDisplayName(storyData, key);
    const hero = state.heroes[key];
    if (hero) {
      const next: FantasticRealmsHero = {
        ...hero,
        feats: hero.feats.map((f) => (f.burned ? { ...f, burned: false } : f)),
      };
      if (hero.conditions) {
        // A rest clears the conditions that name no cure. A scar never clears,
        // and Hungry stays until a meal whether or not it carries the cure.
        const kept: HeroCondition[] = [];
        const cleared: string[] = [];
        for (const c of hero.conditions) {
          if (c.scar || c.cure || normaliseFeat(c.word) === HUNGRY_WORD) kept.push(c);
          else cleared.push(c.word);
        }
        if (kept.length > 0) next.conditions = kept;
        else delete next.conditions;
        const bits: string[] = [];
        if (cleared.length > 0) bits.push(`cleared ${cleared.join(", ")}`);
        const keptNote = [
          ...kept.filter((c) => !c.scar).map((c) => (c.cure ? `${c.word} (needs ${c.cure})` : c.word)),
          ...kept.filter((c) => c.scar).map((c) => `scar ${c.word}`),
        ];
        if (keptNote.length > 0) bits.push(`kept ${keptNote.join(", ")}`);
        if (bits.length > 0) conditionLines.push(`${who} ${bits.join("; ")}`);
      }
      if (hero.uses) {
        const uses = resetUses(hero.uses, "rest");
        if (uses) next.uses = uses;
        else delete next.uses;
      }
      state.heroes[key] = next;
    }
    const hearts = findMeter(meters, who, "Hearts");
    if (hearts) {
      const next = setMeterValue(hearts, hearts.cap).meter;
      meters = meters.map((m) => (m.id === hearts.id ? next : m));
      healed.push(`${who} ${next.value}/${next.cap}`);
    }
    rested.push(who);
  }
  storyData.meters = meters;
  // A rest that includes every hero in the state is a party rest: it renews
  // the team burns and the hearth's per-rest uses. A partial rest does not.
  const allKeys = Object.keys(state.heroes).filter((k) => !state.heroes[k].retired);
  const partyRest = allKeys.length > 0 && allKeys.every((k) => picked.keys.includes(k));
  if (partyRest) {
    delete state.teamBurnsUsed;
    if (state.partyUses) {
      const uses = resetUses(state.partyUses, "rest");
      if (uses) state.partyUses = uses;
      else delete state.partyUses;
    }
  }
  const condition = realm && knowsRealm(realm) ? rests[realm] : undefined;
  let ctx = `[Rest: ${rested.join(", ")} rested. Every heart is healed${healed.length > 0 ? ` (${healed.join(", ")})` : ""} and every feat is un-burned.]`;
  for (const l of conditionLines) ctx += `\n[Conditions: ${l}]`;
  const stillDown = picked.keys
    .map((k) => ({ k, who: frDisplayName(storyData, k) }))
    .filter(({ k, who }) => frIsDown(storyData, who, state.heroes[k]))
    .map(({ who }) => who);
  if (stillDown.length > 0) {
    ctx += `\n[Still down after the rest (three conditions that need a cure): ${stillDown.join(", ")}]`;
  }
  ctx += partyRest
    ? `\n[Party rest: every hero rested, so the team burns are renewed (${TEAM_BURNS_PER_REST} of ${TEAM_BURNS_PER_REST} left)]`
    : `\n[Partial rest: ${allKeys.filter((k) => !picked.keys.includes(k)).map((k) => frDisplayName(storyData, k)).join(", ")} did not rest, so the team burns are not renewed (${Math.max(0, TEAM_BURNS_PER_REST - (state.teamBurnsUsed ?? 0))} of ${TEAM_BURNS_PER_REST} left)]`;
  if (condition) {
    ctx += `\n[Rest condition in ${realm}: ${condition} Whether the fiction allows it is your call.]`;
  } else if (realm) {
    ctx += `\n[Realm: ${realm}]`;
  } else {
    ctx += `\n[No realm is recorded; name it with the realm argument so its rest condition can be checked.]`;
  }
  return {
    toolName: "take_rest",
    toolCallId,
    success: true,
    result: {
      type: "take_rest",
      rested,
      realm,
      condition,
      partyRest,
    } as GMTakeRestResult,
    contextForStory: ctx,
  };
}

// ============================================
// NPC MANAGEMENT TOOL EXECUTION
// ============================================

/**
 * Execute add_npc tool - Register a new NPC in the story
 */
function executeAddNPC(
  toolCallId: string,
  params: AddNPCParams,
  storyData: StoryData,
  nameCtx?: NameCheckContext
): GMToolResult {
  // Initialize NPCs array if it doesn't exist
  if (!storyData.npcs) {
    storyData.npcs = [];
  }

  // A new person takes a name the engine rolled (or one already established).
  // Before the duplicate check: an existing NPC's name is in the record.
  const refusal = unrolledNameRefusal(storyData, "person", params.name, nameCtx);
  if (refusal) {
    return {
      toolName: "add_npc",
      toolCallId,
      success: false,
      result: {
        type: "add_npc",
        npc: {} as NPC,
        message: refusal,
      } as GMAddNPCResult,
      contextForStory: `[NPC Error: ${refusal}]`,
    };
  }

  // Check if NPC already exists
  const existingNPC = storyData.npcs.find(
    (npc) => npc.name.toLowerCase() === params.name.toLowerCase()
  );

  if (existingNPC) {
    return {
      toolName: "add_npc",
      toolCallId,
      success: false,
      result: {
        type: "add_npc",
        npc: existingNPC,
        message: `NPC "${params.name}" already exists`,
      } as GMAddNPCResult,
      contextForStory: `[NPC Error: "${params.name}" already exists in character tracker]`,
    };
  }

  // Create new NPC
  const newNPC: NPC = {
    id: `npc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    name: params.name,
    description: params.description,
    role: params.role,
    status: (params.status as NPCStatus) || "alive",
    relationship: params.relationship || "Stranger",
    attitude: (params.attitude as NPCAttitude) || "neutral",
    faction: params.faction,
    symbol: params.symbol,
    custom_symbol_url: params.image_url,
    createdAt: Date.now(),
  };

  storyData.npcs.push(newNPC);

  const attitudeEmoji = {
    hostile: "⚔️",
    unfriendly: "😒",
    neutral: "😐",
    friendly: "🙂",
    allied: "🤝",
  }[newNPC.attitude];

  return {
    toolName: "add_npc",
    toolCallId,
    success: true,
    result: {
      type: "add_npc",
      npc: newNPC,
      message: `Added NPC: ${newNPC.name} (${newNPC.role})`,
    } as GMAddNPCResult,
    contextForStory: `[NPC Added: ${newNPC.name} ${attitudeEmoji} - ${
      newNPC.role
    }${newNPC.relationship !== "Stranger" ? ` (${newNPC.relationship})` : ""}]`,
  };
}

// Ordered attitude scale (worst to best) and the max number of steps
// update_npc is allowed to move an NPC's attitude in a single call - see
// the clamping note inside executeUpdateNPC.
const NPC_ATTITUDE_SCALE: NPCAttitude[] = [
  "hostile",
  "unfriendly",
  "neutral",
  "friendly",
  "allied",
];
const MAX_ATTITUDE_STEP_PER_CALL = 2;

/**
 * Execute update_npc tool - Modify an existing NPC's details
 */
function executeUpdateNPC(
  toolCallId: string,
  params: UpdateNPCParams,
  storyData: StoryData,
  nameCtx?: NameCheckContext
): GMToolResult {
  if (!storyData.npcs || storyData.npcs.length === 0) {
    return {
      toolName: "update_npc",
      toolCallId,
      success: false,
      result: {
        type: "update_npc",
        npc: {} as NPC,
        changes: [],
        message: "No NPCs exist to update",
      } as GMUpdateNPCResult,
      contextForStory: `[NPC Error: No NPCs in character tracker]`,
    };
  }

  // Find the NPC by name or ID
  const npcIndex = storyData.npcs.findIndex(
    (npc) =>
      npc.name.toLowerCase() === params.npc.toLowerCase() ||
      npc.id === params.npc
  );

  if (npcIndex === -1) {
    return {
      toolName: "update_npc",
      toolCallId,
      success: false,
      result: {
        type: "update_npc",
        npc: {} as NPC,
        changes: [],
        message: `NPC "${params.npc}" not found`,
      } as GMUpdateNPCResult,
      contextForStory: `[NPC Error: "${params.npc}" not found in character tracker]`,
    };
  }

  const npc = storyData.npcs[npcIndex];
  const changes: string[] = [];

  // A rename takes a rolled name too.
  if (params.name && params.name !== npc.name) {
    const refusal = unrolledNameRefusal(storyData, "person", params.name, nameCtx);
    if (refusal) {
      return {
        toolName: "update_npc",
        toolCallId,
        success: false,
        result: {
          type: "update_npc",
          npc,
          changes: [],
          message: refusal,
        } as GMUpdateNPCResult,
        contextForStory: `[NPC Error: ${refusal}]`,
      };
    }
  }

  // Apply updates
  if (params.name && params.name !== npc.name) {
    changes.push(`name: ${npc.name} → ${params.name}`);
    npc.name = params.name;
  }
  if (params.description && params.description !== npc.description) {
    changes.push(`description updated`);
    npc.description = params.description;
  }
  if (params.role && params.role !== npc.role) {
    changes.push(`role: ${npc.role} → ${params.role}`);
    npc.role = params.role;
  }
  if (params.status && params.status !== npc.status) {
    changes.push(`status: ${npc.status} → ${params.status}`);
    npc.status = params.status as NPCStatus;
  }
  if (params.relationship && params.relationship !== npc.relationship) {
    changes.push(`relationship: ${npc.relationship} → ${params.relationship}`);
    npc.relationship = params.relationship;
  }
  if (params.attitude && params.attitude !== npc.attitude) {
    // Cap how far attitude can swing in a single call. Nothing else gates
    // NPC disposition - the tool description itself invites "changes
    // significantly" - so without this, a single agreeable turn could
    // jump an NPC straight from hostile to allied on narrative say-so
    // alone. Capping the per-call delta to 2 steps (of the 5-step scale)
    // still allows a big, dramatic shift in one beat, but requires more
    // than one earned interaction to fully flip a relationship, the same
    // "clamp and report" discipline already used for combat HP and dice
    // bounds elsewhere in this file.
    const requestedIndex = NPC_ATTITUDE_SCALE.indexOf(
      params.attitude as NPCAttitude
    );
    const currentIndex = NPC_ATTITUDE_SCALE.indexOf(npc.attitude);
    const maxIndex = Math.min(
      NPC_ATTITUDE_SCALE.length - 1,
      currentIndex + MAX_ATTITUDE_STEP_PER_CALL
    );
    const minIndex = Math.max(0, currentIndex - MAX_ATTITUDE_STEP_PER_CALL);
    const clampedIndex = Math.max(
      minIndex,
      Math.min(maxIndex, requestedIndex)
    );
    const clampedAttitude = NPC_ATTITUDE_SCALE[clampedIndex];

    if (clampedAttitude !== params.attitude) {
      changes.push(
        `attitude: ${npc.attitude} → ${clampedAttitude} (requested ${params.attitude}, capped to ${MAX_ATTITUDE_STEP_PER_CALL} steps per update)`
      );
    } else {
      changes.push(`attitude: ${npc.attitude} → ${clampedAttitude}`);
    }
    npc.attitude = clampedAttitude;
  }
  if (params.faction !== undefined) {
    if (params.faction !== npc.faction) {
      changes.push(
        `faction: ${npc.faction || "none"} → ${params.faction || "none"}`
      );
      npc.faction = params.faction;
    }
  }
  if (params.last_seen) {
    changes.push(`last seen: ${params.last_seen}`);
    npc.lastSeen = params.last_seen;
  }
  if (params.notes) {
    changes.push(`notes updated`);
    npc.notes = params.notes;
  }

  if (changes.length === 0) {
    return {
      toolName: "update_npc",
      toolCallId,
      success: true,
      result: {
        type: "update_npc",
        npc,
        changes: [],
        message: `No changes made to ${npc.name}`,
      } as GMUpdateNPCResult,
      contextForStory: `[NPC: ${npc.name} - no changes]`,
    };
  }

  return {
    toolName: "update_npc",
    toolCallId,
    success: true,
    result: {
      type: "update_npc",
      npc,
      changes,
      message: `Updated ${npc.name}: ${changes.join(", ")}`,
    } as GMUpdateNPCResult,
    contextForStory: `[NPC Updated: ${npc.name} - ${changes.join(", ")}]`,
  };
}

/**
 * Execute remove_npc tool - Remove an NPC from tracking
 */
function executeRemoveNPC(
  toolCallId: string,
  params: RemoveNPCParams,
  storyData: StoryData
): GMToolResult {
  if (!storyData.npcs || storyData.npcs.length === 0) {
    return {
      toolName: "remove_npc",
      toolCallId,
      success: false,
      result: {
        type: "remove_npc",
        npcName: params.npc,
        reason: params.reason,
        message: "No NPCs exist to remove",
      } as GMRemoveNPCResult,
      contextForStory: `[NPC Error: No NPCs in character tracker]`,
    };
  }

  // Find the NPC by name or ID
  const npcIndex = storyData.npcs.findIndex(
    (npc) =>
      npc.name.toLowerCase() === params.npc.toLowerCase() ||
      npc.id === params.npc
  );

  if (npcIndex === -1) {
    return {
      toolName: "remove_npc",
      toolCallId,
      success: false,
      result: {
        type: "remove_npc",
        npcName: params.npc,
        reason: params.reason,
        message: `NPC "${params.npc}" not found`,
      } as GMRemoveNPCResult,
      contextForStory: `[NPC Error: "${params.npc}" not found in character tracker]`,
    };
  }

  const removedNPC = storyData.npcs[npcIndex];
  storyData.npcs.splice(npcIndex, 1);

  return {
    toolName: "remove_npc",
    toolCallId,
    success: true,
    result: {
      type: "remove_npc",
      npcName: removedNPC.name,
      reason: params.reason,
      message: `Removed ${removedNPC.name} from character tracker${
        params.reason ? ` (${params.reason})` : ""
      }`,
    } as GMRemoveNPCResult,
    contextForStory: `[NPC Removed: ${removedNPC.name}${
      params.reason ? ` - ${params.reason}` : ""
    }]`,
  };
}

/**
 * Execute npc_reaction tool - Show a social media style reaction notification
 */
function executeNPCReaction(
  toolCallId: string,
  params: NPCReactionParams,
  storyData: StoryData
): GMToolResult {
  // Find the NPC (optional - reaction can work even if NPC not in tracker)
  let npc: NPC | undefined;
  if (storyData.npcs && storyData.npcs.length > 0) {
    npc = storyData.npcs.find(
      (n) =>
        n.name.toLowerCase() === params.npc.toLowerCase() || n.id === params.npc
    );
  }

  // Create the reaction object
  const reaction: NPCReaction = {
    npcId: npc?.id || params.npc,
    npcName: npc?.name || params.npc,
    npcImage: npc?.custom_symbol_url,
    npcPortraitImageId: npc?.portraitImageId,
    reaction: params.reaction,
    emoji: params.emoji,
    context: params.context,
  };

  // Construct display string
  const emoji = params.emoji ? ` ${params.emoji}` : "";
  const displayStr = `${reaction.npcName} ${reaction.reaction}${emoji}`;

  return {
    toolName: "npc_reaction",
    toolCallId,
    success: true,
    result: {
      type: "npc_reaction",
      reaction,
      message: displayStr,
    } as GMNPCReactionResult,
    contextForStory: `[💬 ${displayStr}${
      params.context ? ` — ${params.context}` : ""
    }]`,
  };
}
