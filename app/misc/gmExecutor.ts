/**
 * GM Stage Executor - Frontend execution of GM tool calls
 *
 * Executes GM tool calls (formula_roll, start_challenge, etc.) on the frontend,
 * rolling dice, checking items/abilities, and returning results for the story stage.
 */

import {
  StoryData,
  SceneChallenge,
  Stat,
  REST_CONFIG,
  InventoryItem,
  Ability,
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
  ReactionCategory,
  IncidentalReaction,
} from "./structs";
import {
  StartChallengeParams,
  CalculateParams,
  TakeRestParams,
  FormulaRollParams,
  AskForRollParams,
  CheckDCParams,
  OpposedFormulaParams,
  FormulaChallengeCheckParams,
  FateQuestionParams,
  RollTableParams,
  ReadNotesParams,
  SearchMemoryParams,
  RequestContinuationParams,
  AskPlayerParams,
  RespondToPlayerParams,
  // Timer tools
  CreateTimerParams,
  AdvanceTimerParams,
  ToggleTimerPauseParams,
  CancelTimerParams,
  TriggerTimerParams,
  ManageTimerParams,
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
  ReactionCheckParams,
  NegotiatePriceParams,
  GM_TOOL_MAP,
  SetReasoningTierParams,
  DelegateTaskParams,
} from "./gmTools";
import {
  runDelegateTask,
  SubagentContext,
  DelegateTaskOutcome,
} from "./subagentExecutor";
import { validateToolArgs, formatValidationErrors } from "./toolValidation";
import {
  semanticSearchFallback,
  SemanticSearchContext,
} from "./semanticSearchFallback";
import {
  askFate,
  generateElement,
  generateEventFocus,
  generateEventMeaning,
  MYTHIC_TABLE_NAMES,
  ElementCategory,
} from "./mythic";
import { getTableByName, rollOnCustomTable } from "./tableRoller";
import {
  applyTierEscalation,
  stakesFloor,
  computeSceneKey,
} from "./reasoningTiers";
import {
  getRPGSystem,
  checkSuccess,
  rollDice,
  RPGSystemType,
  RPGSystem,
} from "./rpgSystems";
import {
  findStatMatch,
  findAbilityMatch,
  findResourceMatch,
} from "./fuzzyMatch";
import { getAbilityBonus } from "./abilitySystem";
import { rollFormula, RollResult } from "./diceFormula";
import { executeTools as executeStateTools } from "./toolExecutor";

// ============================================
// RESULT INTERFACES
// ============================================

export interface GMToolResult {
  toolName: string;
  toolCallId: string;
  success: boolean;
  result:
    | GMChallengeResult
    | GMCalculateResult
    | GMRestResult
    | GMFormulaRollResult
    | GMAskForRollResult
    | GMCheckDCResult
    | GMOpposedFormulaResult
    | GMFormulaChallengeResult
    | GMFateQuestionResult
    | GMRollTableResult
    | GMReadNotesResult
    | GMSearchMemoryResult
    | GMRequestContinuationResult
    | GMEndGmThinkingResult
    | GMSetReasoningTierResult
    | GMStateChangeResult
    // Timer results
    | GMCreateTimerResult
    | GMAdvanceTimerResult
    | GMToggleTimerPauseResult
    | GMCancelTimerResult
    | GMTriggerTimerResult
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
    | GMReactionCheckResult
    | GMNegotiatePriceResult;
  contextForStory: string; // Formatted bracket notation for story stage
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
  requiredSuccesses: number;
  maxFailures: number;
  primaryStat: string;
  difficulty: string;
  victoryConsequence?: string;
  defeatConsequence?: string;
}

export interface GMCalculateResult {
  type: "calculate";
  expression: string;
  result: number;
  reason: string;
  displayName?: string;
}

export interface GMRestResult {
  type: "take_rest";
  restType: "quick" | "short" | "long";
  recovery: {
    resources: { name: string; restored: number }[];
    cooldowns: { name: string; reduced: number }[];
    items: { name: string; restored: number }[];
    stress?: { oldValue: number; newValue: number };
  };
  narrativeContext?: string;
  error?: string;
}

// ============================================
// FORMULA-BASED RESULT INTERFACES
// ============================================

export interface GMFormulaRollResult {
  type: "formula_roll";
  formula: string;
  resolvedFormula: string; // Formula with variables substituted
  rolls: number[]; // Flattened list of all dice rolled
  total: number;
  dc?: number;
  reverseDC?: boolean; // If true, success = roll ≤ DC
  success?: boolean;
  margin?: number;
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
  breakdown?: string; // Human-readable breakdown
}

export interface GMAskForRollResult {
  type: "ask_for_roll";
  title: string;
  description: string;
  playerName?: string;
  formula?: string;
  dc?: number;
  reverseDC?: boolean;
  // The total extracted from the player's answer; null when they skipped/cancelled
  rollValue: number | null;
  // The player's raw answer text (may be free text/voice, e.g. "natural 20!")
  rawText?: string;
  success?: boolean; // vs dc, when both a value and a dc exist
  margin?: number;
  skipped?: boolean;
}

export interface GMCheckDCResult {
  type: "check_dc";
  total: number;
  dc: number;
  reverseDC?: boolean;
  success: boolean;
  margin: number;
  reason: string;
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
  winner: "player" | "opponent" | "tie";
  margin: number;
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

export interface GMFormulaChallengeResult {
  type: "formula_challenge_check";
  formula: string;
  resolvedFormula: string;
  rolls: number[]; // Flattened list of all dice rolled
  total: number;
  dc: number;
  success: boolean;
  margin: number;
  description: string;
  displayName?: string;
  consequences?: {
    success?: string;
    failure?: string;
  };
  challengeProgress?: {
    name: string;
    successes: number;
    failures: number;
    required: number;
    maxFailures: number;
    completed?: boolean;
    won?: boolean;
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
  answer: "Exceptional Yes" | "Yes" | "No" | "Exceptional No";
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

export interface GMRequestContinuationResult {
  type: "request_continuation";
  reason: string;
  context: string;
  nextAction?: string;
}

export interface GMEndGmThinkingResult {
  type: "end_gm_thinking";
  summary: string;
  outcome: "success" | "failure" | "mixed" | "neutral";
  narrativeHints?: string;
  dramaticMoment?: boolean;
}

export interface GMSetReasoningTierResult {
  type: "set_reasoning_tier";
  requestedTier: number;
  grantedTier: number;
  capped: boolean;
  reason: string;
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
  dc?: number;
  success?: boolean;
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
  syncedStats?: { stat: string; value: number }[];
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

export interface GMReactionCheckResult {
  type: "reaction_check";
  npcName: string;
  rolls: number[];
  bias: "hostile" | "neutral" | "favorable";
  modifiers: number;
  total: number;
  category: ReactionCategory;
  mandate: string;
  reason: string;
  cached?: boolean; // True if this returned an existing scene-cached reaction instead of rolling fresh
}

export interface GMNegotiatePriceResult {
  type: "negotiate_price";
  itemName: string;
  listPrice: number;
  playerRolls: number[];
  playerTotal: number;
  sellerRolls: number[];
  sellerTotal: number;
  margin: number;
  discountPercent: number;
  finalPrice: number;
  clampedToFloor: boolean;
  failed: boolean; // True if the negotiation failed outright (target below seller's floor)
  reason: string;
}

// ============================================
// HELPER FUNCTIONS
// ============================================

// ============================================
// DIFFICULTY PARSING
// ============================================

interface ParsedDifficulty {
  dc: number;
  tierName: string;
}

function parseDifficulty(
  difficulty: string,
  system: RPGSystem
): ParsedDifficulty {
  // Named tier to tier number mapping
  const tierNames: Record<string, keyof typeof system.dc | null> = {
    trivial: "trivial",
    easy: "easy",
    average: "medium",
    moderate: "medium",
    hard: "hard",
    very_hard: "veryHard",
    veryhard: "veryHard",
    extreme: "veryHard",
    impossible: "impossible",
    legendary: "impossible",
  };

  const normalized = difficulty.toLowerCase().replace(/[_\s]/g, "");

  // Check if it's a named tier
  const tierKey = tierNames[normalized];
  if (tierKey && tierKey in system.dc) {
    const dc = system.dc[tierKey as keyof typeof system.dc];
    if (typeof dc === "number") {
      return { dc, tierName: difficulty };
    }
  }

  // Try parsing as a number
  const numDC = parseInt(difficulty, 10);
  if (!isNaN(numDC)) {
    return { dc: numDC, tierName: "custom" };
  }

  // Default to medium
  return { dc: system.dc.medium, tierName: "average" };
}

// ============================================
// MAIN EXECUTOR
// ============================================

// A pending "roll your real dice" request shown to the player (manual dice
// mode). Produced by the ask_for_roll tool; the UI answers with the total
// the player rolled, or null if they skipped.
export interface ManualRollRequest {
  title: string;
  description: string;
  playerName?: string;
  formula?: string;
  dc?: number;
  reverseDC?: boolean;
}

// What the player answered a manual roll prompt with: the number extracted
// from their (possibly free-text/voice) answer, plus the raw text itself so
// the GM can see phrasing like "natural 20" as flavor.
export interface ManualRollAnswer {
  value: number;
  rawText: string;
}

// Handlers the frontend injects so interactive GM tools can pause the loop
// and wait for real player input.
export interface GMInteractionHandlers {
  requestManualRoll?: (
    request: ManualRollRequest
  ) => Promise<ManualRollAnswer | null>;
}

export interface GMExecutionResult {
  results: GMToolResult[];
  modifiedStoryData: StoryData;
  storyContext: string; // Combined context for story stage
  // Special flow control flags
  requestsContinuation?: boolean; // AI wants another GM round (legacy)
  continuationContext?: string; // Context for next round (legacy)
  // Terminal condition (new loop-based GM)
  isComplete?: boolean; // end_gm_thinking was called - GM stage is done
  finalSummary?: string; // Summary from end_gm_thinking
  finalOutcome?: "success" | "failure" | "mixed" | "neutral";
  narrativeHints?: string;
  dramaticMoment?: boolean;
}

/**
 * Execute GM stage tool calls and return results for the story stage
 */
export async function executeGMTools(
  toolCalls: { id: string; function: { name: string; arguments: string } }[],
  storyData: StoryData,
  semanticContext: SemanticSearchContext = {},
  interaction: GMInteractionHandlers = {},
  subagentContext: SubagentContext = {}
): Promise<GMExecutionResult> {
  // Check for premature end_gm_thinking calls when there are other tools
  // The AI sometimes calls end_gm_thinking before processing roll results
  const endGmThinkingCall = toolCalls.find(
    (c) => c.function.name === "end_gm_thinking"
  );
  const otherToolCalls = toolCalls.filter(
    (c) => c.function.name !== "end_gm_thinking"
  );
  const hasOtherTools = otherToolCalls.length > 0;

  // Clone storyData to avoid mutations. structuredClone (vs. the previous
  // JSON.parse(JSON.stringify(...)) round-trip) is both faster and doesn't
  // silently drop values JSON can't represent (undefined, Map/Set, etc.).
  const modified = structuredClone(storyData);
  const results: GMToolResult[] = [];
  const contextParts: string[] = [];

  // If end_gm_thinking was called with other tools, add an error result for it
  if (endGmThinkingCall && hasOtherTools) {
    console.log(
      `[GM Tools] Rejecting premature end_gm_thinking (${toolCalls.length} total calls)`
    );
    const errorResult: GMToolResult = {
      toolName: "end_gm_thinking",
      toolCallId: endGmThinkingCall.id,
      success: false,
      result: {
        type: "end_gm_thinking",
        summary:
          "ERROR: end_gm_thinking must be called ALONE, not with other tools.",
        outcome: "failure",
        narrativeHints:
          "Process the other tools first, see their results, THEN call end_gm_thinking in a separate response.",
      } as GMEndGmThinkingResult,
      contextForStory:
        "⚠️ ERROR: end_gm_thinking rejected - you called it with other tools. Review your other tool results below, then call end_gm_thinking ALONE in your next response.",
    };
    results.push(errorResult);
    contextParts.push(errorResult.contextForStory);
  }

  // Process either filtered tools (if end_gm_thinking was premature) or all tools
  const toolsToProcess =
    hasOtherTools && endGmThinkingCall ? otherToolCalls : toolCalls;

  for (const call of toolsToProcess) {
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
        results.push(errorResult);
        contextParts.push(errorResult.contextForStory);
        continue;
      }
    }

    let result: GMToolResult;

    try {
      switch (call.function.name) {
        case "start_challenge":
          result = executeStartChallenge(
            call.id,
            params as StartChallengeParams,
            modified
          );
          break;
        case "calculate":
          result = executeCalculate(call.id, params as CalculateParams);
          break;
        case "take_rest":
          result = executeTakeRest(call.id, params as TakeRestParams, modified);
          break;
        case "formula_roll":
          result = executeFormulaRoll(
            call.id,
            params as FormulaRollParams,
            modified
          );
          break;
        case "ask_for_roll":
          result = await executeAskForRoll(
            call.id,
            params as AskForRollParams,
            interaction
          );
          break;
        case "check_dc":
          result = executeCheckDC(call.id, params as CheckDCParams);
          break;
        case "opposed_formula":
          result = executeOpposedFormula(
            call.id,
            params as OpposedFormulaParams,
            modified
          );
          break;
        case "formula_challenge_check":
          result = executeFormulaChallengeCheck(
            call.id,
            params as FormulaChallengeCheckParams,
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
        case "read_notes":
          result = executeReadNotes(
            call.id,
            params as ReadNotesParams,
            modified
          );
          break;
        case "search_memory":
          result = await executeSearchMemory(
            call.id,
            params as SearchMemoryParams,
            modified,
            semanticContext
          );
          break;
        case "request_continuation":
          result = executeRequestContinuation(
            call.id,
            params as RequestContinuationParams
          );
          break;
        case "end_gm_thinking":
          result = executeEndGmThinking(
            call.id,
            params as RespondToPlayerParams
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
        // NPC management tools
        case "add_npc":
          result = executeAddNPC(call.id, params as AddNPCParams, modified);
          break;
        case "update_npc":
          result = executeUpdateNPC(
            call.id,
            params as UpdateNPCParams,
            modified
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
        case "reaction_check":
          result = executeReactionCheck(
            call.id,
            params as ReactionCheckParams,
            modified
          );
          break;
        case "negotiate_price":
          result = executeNegotiatePrice(
            call.id,
            params as NegotiatePriceParams
          );
          break;
        case "set_reasoning_tier":
          result = executeSetReasoningTier(
            call.id,
            params as SetReasoningTierParams,
            modified
          );
          break;
        case "delegate_task":
          result = await executeDelegateTask(
            call.id,
            params as DelegateTaskParams,
            modified,
            subagentContext
          );
          break;
        default:
          // Delegate to state tool executor for tools like modify_stat, add_item, etc.
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
                  .map((m) => `• "${m.key}": ${m.content.slice(0, 200)}`)
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

    results.push(result);
    if (result.contextForStory) {
      contextParts.push(result.contextForStory);
    }

    // Log successful tool executions with failure status for debugging
    if (!result.success) {
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

  // Check for special flow control results
  let requestsContinuation = false;
  let continuationContext: string | undefined;
  // Terminal condition
  let isComplete = false;
  let finalSummary: string | undefined;
  let finalOutcome: "success" | "failure" | "mixed" | "neutral" | undefined;
  let narrativeHints: string | undefined;
  let dramaticMoment: boolean | undefined;

  for (const res of results) {
    if (res.toolName === "request_continuation") {
      requestsContinuation = true;
      const contResult = res.result as GMRequestContinuationResult;
      continuationContext = `Previous round: ${
        contResult.context
      }\nNext planned: ${contResult.nextAction || "See results"}`;
    }
    if (res.toolName === "end_gm_thinking") {
      isComplete = true;
      const respResult = res.result as GMEndGmThinkingResult;
      finalSummary = respResult.summary;
      finalOutcome = respResult.outcome;
      narrativeHints = respResult.narrativeHints;
      dramaticMoment = respResult.dramaticMoment;
    }
  }

  // Auto-advance timers when GM turn completes
  if (isComplete && modified.timers && modified.timers.length > 0) {
    const timerUpdates: string[] = [];
    for (const timer of modified.timers) {
      if (timer.status === "active" && timer.autoAdvance) {
        const prevTicks = timer.currentTicks;
        timer.currentTicks = Math.max(0, timer.currentTicks - 1);

        if (timer.currentTicks === 0 && timer.status === "active") {
          // Timer triggered!
          timer.status = "triggered";
          timer.triggeredAt = Date.now();
          timerUpdates.push(
            `[⏰ TIMER TRIGGERED: "${timer.name}" has reached 0!${
              timer.description ? ` - ${timer.description}` : ""
            }]`
          );
        } else if (timer.currentTicks !== prevTicks) {
          // Just ticked down
          timerUpdates.push(
            `[Timer: "${timer.name}" ${prevTicks} → ${timer.currentTicks} ticks]`
          );
        }
      }
    }
    // Add timer updates to context
    if (timerUpdates.length > 0) {
      contextParts.push(...timerUpdates);
    }
  }

  // Log execution summary for debugging
  const failedResults = results.filter((r) => !r.success);
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
    requestsContinuation,
    continuationContext,
    isComplete,
    finalSummary,
    finalOutcome,
    narrativeHints,
    dramaticMoment,
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

  // Create new challenge - rounds is max(required, max_failures) * 2 - 1 for best-of-X format
  const rounds =
    Math.max(params.required_successes, params.max_failures) * 2 - 1;

  const challenge: SceneChallenge = {
    id: `challenge_${Date.now()}`,
    name: params.name,
    description: params.description,
    rounds,
    currentSuccesses: 0,
    currentFailures: 0,
    active: true,
    createdAt: Date.now(),
  };

  storyData.activeChallenge = challenge;

  const contextForStory = `[Challenge Started: "${params.name}" - Best of ${rounds} (need ${params.required_successes} successes) | Primary Stat: ${params.primary_stat} | Difficulty: ${params.difficulty}]`;

  return {
    toolName: "start_challenge",
    toolCallId,
    success: true,
    result: {
      type: "start_challenge",
      name: params.name,
      description: params.description,
      requiredSuccesses: params.required_successes,
      maxFailures: params.max_failures,
      primaryStat: params.primary_stat,
      difficulty: params.difficulty,
      victoryConsequence: params.victory_consequence,
      defeatConsequence: params.defeat_consequence,
    } as GMChallengeResult,
    contextForStory,
  };
}

// ============================================
// CALCULATE EXECUTOR
// ============================================

function executeCalculate(
  toolCallId: string,
  params: CalculateParams
): GMToolResult {
  // Parse expression, handling dice and basic math
  // Supports: "20 - 4", "50 + 2d6", "100 - 1d20 + 5"
  let expression = params.expression;
  let result = 0;

  // Replace dice rolls with their results
  const diceRegex = /(\d+)d(\d+)/gi;
  const diceMatches = expression.match(diceRegex);
  const diceRolls: { notation: string; rolls: number[]; total: number }[] = [];

  if (diceMatches) {
    for (const diceMatch of diceMatches) {
      const [, numDice, dieSize] = diceMatch.match(/(\d+)d(\d+)/i) || [];
      const n = parseInt(numDice, 10);
      const d = parseInt(dieSize, 10);

      const rolls: number[] = [];
      for (let i = 0; i < n; i++) {
        rolls.push(Math.floor(Math.random() * d) + 1);
      }

      const total = rolls.reduce((a, b) => a + b, 0);
      diceRolls.push({ notation: diceMatch, rolls, total });
      expression = expression.replace(diceMatch, total.toString());
    }
  }

  // Evaluate the expression safely (only allow numbers and basic operators)
  try {
    // Remove any characters that aren't numbers, operators, spaces, or parentheses
    const safeExpression = expression.replace(/[^0-9+\-*/(). ]/g, "");
    // Use Function to evaluate (safer than eval)
    result = new Function(`return ${safeExpression}`)() as number;
  } catch {
    return {
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
      contextForStory: `[ERROR: Could not evaluate "${params.expression}"]`,
    };
  }

  const displayName = params.display_name || "Calculation";
  let contextForStory = `[${displayName}: ${params.expression}`;
  if (diceRolls.length > 0) {
    for (const dr of diceRolls) {
      contextForStory += ` (${dr.notation}=[${dr.rolls.join(",")}])`;
    }
  }
  contextForStory += ` = ${result}]`;
  contextForStory += `\n[Reason: ${params.reason}]`;

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
// TAKE REST EXECUTOR
// ============================================

function executeTakeRest(
  toolCallId: string,
  params: TakeRestParams,
  storyData: StoryData
): GMToolResult {
  // Check if challenge is active
  if (storyData.activeChallenge?.active) {
    return {
      toolName: "take_rest",
      toolCallId,
      success: false,
      result: {
        type: "take_rest",
        restType: params.type,
        recovery: {
          resources: [],
          cooldowns: [],
          items: [],
        },
        error: `Cannot rest during active challenge "${storyData.activeChallenge.name}"`,
      } as GMRestResult,
      contextForStory: `[ERROR: Cannot rest during active challenge "${storyData.activeChallenge.name}"]`,
    };
  }

  // Get difficulty-based recovery config
  const difficulty = storyData.difficulty || "medium";
  const restConfig = REST_CONFIG[difficulty];

  // Initialize rest state if needed
  if (!storyData.restState) {
    storyData.restState = {
      quickRestsUsed: 0,
      shortRestsUsed: 0,
    };
  }

  // Check rest limits
  const restState = storyData.restState;
  if (
    params.type === "quick" &&
    restState.quickRestsUsed >= restConfig.maxQuickRests
  ) {
    return {
      toolName: "take_rest",
      toolCallId,
      success: false,
      result: {
        type: "take_rest",
        restType: params.type,
        recovery: { resources: [], cooldowns: [], items: [] },
        error: `No quick rests remaining (${restConfig.maxQuickRests} max)`,
      } as GMRestResult,
      contextForStory: `[ERROR: No quick rests remaining (${restConfig.maxQuickRests} max)]`,
    };
  }
  if (
    params.type === "short" &&
    restState.shortRestsUsed >= restConfig.maxShortRests
  ) {
    return {
      toolName: "take_rest",
      toolCallId,
      success: false,
      result: {
        type: "take_rest",
        restType: params.type,
        recovery: { resources: [], cooldowns: [], items: [] },
        error: `No short rests remaining (${restConfig.maxShortRests} max)`,
      } as GMRestResult,
      contextForStory: `[ERROR: No short rests remaining (${restConfig.maxShortRests} max)]`,
    };
  }

  // Calculate recovery
  const recovery: GMRestResult["recovery"] = {
    resources: [],
    cooldowns: [],
    items: [],
  };

  // Get rest type specific config
  const cooldownReduction = restConfig.cooldownReduction[params.type];

  // Restore resources (custom calculation - RestConfig doesn't have resourceRestore)
  // We'll use a simple percentage based on rest type
  const resourceRestorePct =
    params.type === "long" ? 1.0 : params.type === "short" ? 0.5 : 0.15;

  // Restore resources
  for (const resource of storyData.resources || []) {
    if (resource.maxValue !== undefined) {
      const restoreAmount = Math.floor(resource.maxValue * resourceRestorePct);
      if (restoreAmount > 0) {
        const oldValue = resource.value;
        resource.value = Math.min(
          resource.maxValue,
          resource.value + restoreAmount
        );
        if (resource.value > oldValue) {
          recovery.resources.push({
            name: resource.name,
            restored: resource.value - oldValue,
          });
        }
      }
    }
  }

  // Reduce cooldowns
  for (const ability of storyData.abilities || []) {
    if (ability.currentCooldown && ability.currentCooldown > 0) {
      // 999 means full reset
      const reduction =
        cooldownReduction >= 999 ? ability.currentCooldown : cooldownReduction;
      const oldCooldown = ability.currentCooldown;
      ability.currentCooldown = Math.max(
        0,
        ability.currentCooldown - reduction
      );
      if (oldCooldown > ability.currentCooldown) {
        recovery.cooldowns.push({
          name: ability.name,
          reduced: oldCooldown - ability.currentCooldown,
        });
      }
    }
  }

  // Repair items (short/long rests only)
  if (params.type !== "quick") {
    for (const item of storyData.inventory || []) {
      if (
        item.durability !== undefined &&
        item.maxDurability !== undefined &&
        item.durability < item.maxDurability
      ) {
        const repairPct = params.type === "long" ? 0.75 : 0.15;
        const repairAmount = Math.floor(item.maxDurability * repairPct);
        const oldDurability = item.durability;
        item.durability = Math.min(
          item.maxDurability,
          item.durability + repairAmount
        );
        if (item.durability > oldDurability) {
          recovery.items.push({
            name: item.name,
            restored: item.durability - oldDurability,
          });
        }
      }
    }
  }

  // Update rest state
  if (params.type === "quick") {
    restState.quickRestsUsed++;
  } else if (params.type === "short") {
    restState.shortRestsUsed++;
  } else {
    // Long rest resets rest counters
    restState.quickRestsUsed = 0;
    restState.shortRestsUsed = 0;
  }
  restState.lastRestType = params.type;
  restState.lastRestTimestamp = Date.now();

  // Build context string
  let contextForStory = `[Rest: ${params.type}`;
  if (params.narrative_context) {
    contextForStory += ` - ${params.narrative_context}`;
  }
  contextForStory += `]`;

  if (recovery.resources.length > 0) {
    contextForStory += `\n[Resources restored: ${recovery.resources
      .map((r) => `${r.name} +${r.restored}`)
      .join(", ")}]`;
  }
  if (recovery.cooldowns.length > 0) {
    contextForStory += `\n[Cooldowns reduced: ${recovery.cooldowns
      .map((c) => `${c.name} -${c.reduced}`)
      .join(", ")}]`;
  }
  if (recovery.items.length > 0) {
    contextForStory += `\n[Items repaired: ${recovery.items
      .map((i) => `${i.name} +${i.restored}`)
      .join(", ")}]`;
  }

  return {
    toolName: "take_rest",
    toolCallId,
    success: true,
    result: {
      type: "take_rest",
      restType: params.type,
      recovery,
      narrativeContext: params.narrative_context,
    } as GMRestResult,
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
// H8: roll-input integrity check. Model-typed flat modifiers on formula_roll
// / opposed_formula are entirely self-asserted with no cross-check against
// the character sheet. A full cross-check isn't possible for every adventure
// because character data can live in three different shapes: structured
// storyData.stats/resources (numeric, always reliable when present),
// storyData.characterData (freeform strings typed into a template form - no
// type guarantee, could be "16" or "Very Strong"), or a "character_sheet"
// type lore note (pure prose, no structure at all). Parsing the latter two
// would mean guessing numbers out of natural language, which is exactly the
// unreliable-heuristic failure mode this audit warns against elsewhere.
// So this only fires when the model voluntarily names a stat/resource via
// the new optional stat_name/player_stat_name param AND that name matches a
// structured storyData.stats/resources entry. It never blocks or rewrites
// the roll (stacking from items/abilities/conditions legitimately shifts the
// modifier away from the base stat) - it only appends a non-blocking
// integrity note to contextForStory so the story/GM stage can notice and
// react if a claim is clearly out of bounds. SLACK is sized generously from
// documented stacking rules: item grade tops out at +5 (agmt) and ability
// grade tops out at +5 (legendary), so +10 comfortably covers legitimate
// double-stacking without flagging normal play.
const STAT_INTEGRITY_SLACK = 10;

function checkStatIntegrity(
  storyData: StoryData,
  statName: string | undefined,
  claimedModifier: number
): string {
  if (!statName) return "";
  const statMatch = findStatMatch(statName, storyData.stats || []);
  const resourceMatch = statMatch
    ? null
    : findResourceMatch(statName, storyData.resources || []);
  const matched = statMatch?.item ?? resourceMatch?.item;
  if (!matched) return "";
  const ceiling = matched.value + STAT_INTEGRITY_SLACK;
  if (claimedModifier > ceiling) {
    return `\n[⚠ Roll integrity check: claimed modifier +${claimedModifier} attributed to "${statName}" exceeds the character sheet value (${matched.value}, even allowing for item/ability stacking) - verify this roll]`;
  }
  return "";
}

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

function executeFormulaRoll(
  toolCallId: string,
  params: FormulaRollParams,
  storyData: StoryData
): GMToolResult {
  // No variable resolver - GM must provide actual numbers

  // Roll the formula
  let rollResult: RollResult;
  try {
    rollResult = rollFormula(params.formula);
  } catch (e) {
    return {
      toolName: "formula_roll",
      toolCallId,
      success: false,
      result: {
        type: "formula_roll",
        formula: params.formula,
        resolvedFormula: params.formula,
        rolls: [],
        total: 0,
        reason: params.reason,
        unresolvedVariables: [],
      } as GMFormulaRollResult,
      contextForStory: `[ERROR: Invalid formula "${params.formula}" - ${
        e instanceof Error ? e.message : "Unknown error"
      }]`,
    };
  }

  // Build resolved formula string for display
  const resolvedFormula = rollResult.breakdown || params.formula;

  // Check success if DC provided
  let success: boolean | undefined;
  let margin: number | undefined;
  const reverseDC = params.reverse_dc || false;
  if (params.dc !== undefined) {
    if (reverseDC) {
      // Roll-under: success = roll ≤ DC (Call of Cthulhu/BRP style)
      success = rollResult.total <= params.dc;
      margin = params.dc - rollResult.total; // Positive margin = succeeded by this much
    } else {
      // Roll-over: success = roll ≥ DC (standard)
      success = rollResult.total >= params.dc;
      margin = rollResult.total - params.dc;
    }
  }

  // Build context string
  const displayName = params.display_name || "Formula Roll";
  let contextForStory = `[${displayName}: ${params.formula}`;
  if (resolvedFormula !== params.formula) {
    contextForStory += ` → ${resolvedFormula}`;
  }
  contextForStory += `: [${flattenRolls(rollResult.rolls).join(", ")}] = **${
    rollResult.total
  }**`;
  if (params.dc !== undefined) {
    if (reverseDC) {
      contextForStory += ` = ${rollResult.total} vs DC ${params.dc} → ${
        success ? "SUCCESS" : "FAILURE"
      }`;
    } else {
      contextForStory += ` vs DC ${params.dc} → ${
        success ? "SUCCESS" : "FAILURE"
      }`;
    }
    if (margin !== undefined) {
      contextForStory += ` (margin: ${margin >= 0 ? "+" : ""}${margin})`;
    }
  }
  contextForStory += `]`;
  contextForStory += `\n[Reason: ${params.reason}]`;

  if (params.stakes) {
    contextForStory += `\n[Stakes: ${params.stakes}]`;
    contextForStory += applyStakesEscalation(storyData, params.stakes);
  }

  contextForStory += checkStatIntegrity(
    storyData,
    params.stat_name,
    rollResult.modifiers
  );

  if (params.consequences) {
    const outcome = success
      ? params.consequences.success
      : params.consequences.failure;
    if (outcome) {
      contextForStory += `\n[Intended consequence: ${outcome}]`;
    }
  }

  if (success === false) {
    contextForStory += describeHardness(params.target, params.forces_choice);
  }

  return {
    toolName: "formula_roll",
    toolCallId,
    success: success ?? true,
    result: {
      type: "formula_roll",
      formula: params.formula,
      resolvedFormula,
      rolls: flattenRolls(rollResult.rolls),
      total: rollResult.total,
      dc: params.dc,
      reverseDC,
      success,
      margin,
      reason: params.reason,
      displayName: params.display_name,
      stakes: params.stakes,
      target: params.target,
      forcesChoice: params.forces_choice,
      consequences: params.consequences,
      breakdown: rollResult.breakdown,
    } as GMFormulaRollResult,
    contextForStory,
  };
}

/**
 * Execute ask_for_roll (manual dice mode): pause the GM loop and wait for
 * the player to roll physical dice and type in their total. The injected
 * `interaction.requestManualRoll` handler resolves with the entered number,
 * or null when the player skipped (then the GM should roll digitally).
 */
async function executeAskForRoll(
  toolCallId: string,
  params: AskForRollParams,
  interaction: GMInteractionHandlers
): Promise<GMToolResult> {
  const baseResult: Omit<GMAskForRollResult, "rollValue"> = {
    type: "ask_for_roll",
    title: params.title,
    description: params.description,
    playerName: params.player_name,
    formula: params.formula,
    dc: params.dc,
    reverseDC: params.reverse_dc,
  };

  if (!interaction.requestManualRoll) {
    return {
      toolName: "ask_for_roll",
      toolCallId,
      success: false,
      result: { ...baseResult, rollValue: null, skipped: true },
      contextForStory:
        "[ERROR: Manual dice input isn't available right now - roll digitally with formula_roll instead.]",
    };
  }

  const answer = await interaction.requestManualRoll({
    title: params.title,
    description: params.description,
    playerName: params.player_name,
    formula: params.formula,
    dc: params.dc,
    reverseDC: params.reverse_dc,
  });

  if (answer === null || !Number.isFinite(answer.value)) {
    return {
      toolName: "ask_for_roll",
      toolCallId,
      success: false,
      result: { ...baseResult, rollValue: null, skipped: true },
      contextForStory: `[Manual Roll Skipped: ${params.title} - the player didn't enter a roll. Roll it for them digitally with formula_roll${
        params.formula ? ` ("${params.formula}"${params.dc !== undefined ? `, dc: ${params.dc}` : ""})` : ""
      } and continue.]`,
    };
  }

  const rollValue = answer.value;

  // Compare against DC if one was given
  let success: boolean | undefined;
  let margin: number | undefined;
  const reverseDC = params.reverse_dc || false;
  if (params.dc !== undefined) {
    if (reverseDC) {
      success = rollValue <= params.dc;
      margin = params.dc - rollValue;
    } else {
      success = rollValue >= params.dc;
      margin = rollValue - params.dc;
    }
  }

  let contextForStory = `[Manual Roll: ${params.title}`;
  if (params.player_name) {
    contextForStory += ` - ${params.player_name}`;
  }
  contextForStory += ` rolled${params.formula ? ` ${params.formula}` : ""} = **${rollValue}** (real dice, entered by the player`;
  if (answer.rawText && answer.rawText !== String(rollValue)) {
    contextForStory += `: "${answer.rawText}"`;
  }
  contextForStory += `)`;
  if (params.dc !== undefined) {
    contextForStory += ` vs DC ${params.dc} → ${success ? "SUCCESS" : "FAILURE"}`;
    if (margin !== undefined) {
      contextForStory += ` (margin: ${margin >= 0 ? "+" : ""}${margin})`;
    }
  }
  contextForStory += `]`;
  contextForStory += `\n[Reason: ${params.description}]`;

  return {
    toolName: "ask_for_roll",
    toolCallId,
    success: success ?? true,
    result: { ...baseResult, rollValue, rawText: answer.rawText, success, margin },
    contextForStory,
  };
}

/**
 * Execute check_dc: a pure numeric DC comparison for a total the player
 * already reported (typed, spoken, or volunteered in freeform narration),
 * so the GM doesn't have to judge success/failure itself. Rolls no dice -
 * same success/margin math as executeFormulaRoll, applied directly to
 * `params.total`.
 */
function executeCheckDC(
  toolCallId: string,
  params: CheckDCParams
): GMToolResult {
  const reverseDC = params.reverse_dc || false;
  const success = reverseDC
    ? params.total <= params.dc
    : params.total >= params.dc;
  const margin = reverseDC
    ? params.dc - params.total
    : params.total - params.dc;

  const contextForStory = `[DC Check: ${params.total} ${reverseDC ? "≤" : "vs"} DC ${params.dc} → ${success ? "SUCCESS" : "FAILURE"} (margin: ${margin >= 0 ? "+" : ""}${margin})]\n[Reason: ${params.reason}]`;

  return {
    toolName: "check_dc",
    toolCallId,
    success,
    result: {
      type: "check_dc",
      total: params.total,
      dc: params.dc,
      reverseDC,
      success,
      margin,
      reason: params.reason,
    },
    contextForStory,
  };
}

/**
 * Execute an opposed formula roll
 * GM must provide formulas with actual numeric values (no variable substitution)
 */
function executeOpposedFormula(
  toolCallId: string,
  params: OpposedFormulaParams,
  storyData: StoryData
): GMToolResult {
  // No variable resolver - GM must provide actual numbers

  // Roll player's formula
  let playerResult: RollResult;
  try {
    playerResult = rollFormula(params.player_formula);
  } catch (e) {
    return {
      toolName: "opposed_formula",
      toolCallId,
      success: false,
      result: {
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
        winner: "opponent",
        margin: 0,
        reason: params.reason,
      } as GMOpposedFormulaResult,
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
        type: "opposed_formula",
        playerFormula: params.player_formula,
        playerResolvedFormula: playerResult.breakdown || params.player_formula,
        playerRolls: flattenRolls(playerResult.rolls),
        playerTotal: playerResult.total,
        opponentFormula: params.opponent_formula,
        opponentResolvedFormula: params.opponent_formula,
        opponentRolls: [],
        opponentTotal: 0,
        opponentName: params.opponent_name,
        winner: "player",
        margin: 0,
        reason: params.reason,
      } as GMOpposedFormulaResult,
      contextForStory: `[ERROR: Invalid opponent formula "${
        params.opponent_formula
      }" - ${e instanceof Error ? e.message : "Unknown error"}]`,
    };
  }

  // Determine winner
  let winner: "player" | "opponent" | "tie";
  const margin = playerResult.total - opponentResult.total;
  if (margin > 0) {
    winner = "player";
  } else if (margin < 0) {
    winner = "opponent";
  } else {
    winner = "tie";
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
  contextForStory += `\n[Winner: ${
    winner === "player"
      ? "PLAYER"
      : winner === "opponent"
      ? params.opponent_name.toUpperCase()
      : "TIE"
  } (margin: ${Math.abs(margin)})]`;

  if (params.stakes) {
    contextForStory += `\n[Stakes: ${params.stakes}]`;
    contextForStory += applyStakesEscalation(storyData, params.stakes);
  }

  contextForStory += checkStatIntegrity(
    storyData,
    params.player_stat_name,
    playerResult.modifiers
  );

  if (params.consequences) {
    const outcome =
      winner === "player"
        ? params.consequences.player_wins
        : winner === "opponent"
        ? params.consequences.opponent_wins
        : params.consequences.tie;
    if (outcome) {
      contextForStory += `\n[Intended consequence: ${outcome}]`;
    }
  }

  if (winner === "opponent") {
    contextForStory += describeHardness(params.target, params.forces_choice);
  }

  return {
    toolName: "opposed_formula",
    toolCallId,
    success: winner === "player",
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
      winner,
      margin: Math.abs(margin),
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
 * Execute a formula-based challenge check
 */
function executeFormulaChallengeCheck(
  toolCallId: string,
  params: FormulaChallengeCheckParams,
  storyData: StoryData
): GMToolResult {
  const challenge = storyData.activeChallenge;
  if (!challenge) {
    return {
      toolName: "formula_challenge_check",
      toolCallId,
      success: false,
      result: {
        type: "formula_challenge_check",
        formula: params.formula,
        resolvedFormula: params.formula,
        rolls: [],
        total: 0,
        dc: params.dc,
        success: false,
        margin: 0,
        description: params.description,
      } as GMFormulaChallengeResult,
      contextForStory: "[ERROR: No active challenge to make a check for]",
    };
  }

  // No variable resolver - GM must provide actual numbers

  // Roll the formula
  let rollResult: RollResult;
  try {
    rollResult = rollFormula(params.formula);
  } catch (e) {
    return {
      toolName: "formula_challenge_check",
      toolCallId,
      success: false,
      result: {
        type: "formula_challenge_check",
        formula: params.formula,
        resolvedFormula: params.formula,
        rolls: [],
        total: 0,
        dc: params.dc,
        success: false,
        margin: 0,
        description: params.description,
      } as GMFormulaChallengeResult,
      contextForStory: `[ERROR: Invalid formula "${params.formula}" - ${
        e instanceof Error ? e.message : "Unknown error"
      }]`,
    };
  }

  const resolvedFormula = rollResult.breakdown || params.formula;
  const success = rollResult.total >= params.dc;
  const margin = rollResult.total - params.dc;

  // Update challenge progress
  if (success) {
    challenge.currentSuccesses = (challenge.currentSuccesses || 0) + 1;
  } else {
    challenge.currentFailures = (challenge.currentFailures || 0) + 1;
  }

  // Calculate majority needed: (rounds / 2) + 1 rounded down
  const requiredToWin = Math.floor(challenge.rounds / 2) + 1;

  // Check if challenge is complete
  let completed = false;
  let won = false;
  if (challenge.currentSuccesses >= requiredToWin) {
    completed = true;
    won = true;
    challenge.result = "won";
    challenge.active = false;
    challenge.resolvedAt = Date.now();
  } else if (challenge.currentFailures >= requiredToWin) {
    completed = true;
    won = false;
    challenge.result = "lost";
    challenge.active = false;
    challenge.resolvedAt = Date.now();
  }

  // Build context string
  const displayName = params.display_name || "Challenge Check";
  let contextForStory = `[${displayName}: ${params.formula}`;
  if (resolvedFormula !== params.formula) {
    contextForStory += ` → ${resolvedFormula}`;
  }
  contextForStory += ` = ${rollResult.total} vs DC ${params.dc} → ${
    success ? "SUCCESS" : "FAILURE"
  }]`;
  contextForStory += `\n[${params.description}]`;
  contextForStory += `\n[Challenge "${challenge.name}": ${challenge.currentSuccesses}/${requiredToWin} successes, ${challenge.currentFailures}/${requiredToWin} failures]`;

  if (completed) {
    contextForStory += `\n[Challenge ${won ? "WON" : "LOST"}!]`;
  }

  if (params.consequences) {
    const outcome = success
      ? params.consequences.success
      : params.consequences.failure;
    if (outcome) {
      contextForStory += `\n[Intended consequence: ${outcome}]`;
    }
  }

  return {
    toolName: "formula_challenge_check",
    toolCallId,
    success,
    result: {
      type: "formula_challenge_check",
      formula: params.formula,
      resolvedFormula,
      rolls: flattenRolls(rollResult.rolls),
      total: rollResult.total,
      dc: params.dc,
      success,
      margin,
      description: params.description,
      displayName: params.display_name,
      consequences: params.consequences,
      challengeProgress: {
        name: challenge.name,
        successes: challenge.currentSuccesses,
        failures: challenge.currentFailures,
        required: requiredToWin,
        maxFailures: requiredToWin,
        completed,
        won,
      },
    } as GMFormulaChallengeResult,
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
    storyData.pendingRandomEvents = storyData.pendingRandomEvents || [];
    const pendingEvent: PendingRandomEvent = {
      id: `event_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      source: "fate_question",
      focus: focusResult.focus,
      action: meaningResult.action,
      subject: meaningResult.subject,
      context: params.question,
      createdAt: Date.now(),
    };
    storyData.pendingRandomEvents.push(pendingEvent);
    if (storyData.pendingRandomEvents.length > MAX_PENDING_RANDOM_EVENTS) {
      storyData.pendingRandomEvents = storyData.pendingRandomEvents.slice(
        -MAX_PENDING_RANDOM_EVENTS
      );
    }
    contextForStory += `\n[⚡ RANDOM EVENT TRIGGERED: [${pendingEvent.focus}] "${pendingEvent.action} ${pendingEvent.subject}" - incorporate this into the narrative, then call resolve_random_event(id: "${pendingEvent.id}"). It will keep reappearing every turn until resolved.]`;
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
      answer: fateResult.answer as
        | "Exceptional Yes"
        | "Yes"
        | "No"
        | "Exceptional No",
      randomEvent: fateResult.randomEvent,
      reason: params.reason,
    } as GMFateQuestionResult,
    contextForStory,
  };
}

/**
 * Execute a roll on a custom table or built-in AGMT element table
 */
function executeRollTable(
  toolCallId: string,
  params: RollTableParams,
  storyData: StoryData
): GMToolResult {
  // Use customTables from storyData
  const allTables = storyData.customTables || [];

  // First try to find in custom tables
  const table = getTableByName(allTables, params.table_name);

  if (table) {
    // Roll on the custom table
    const rollResult = rollOnCustomTable(table);
    const resultText = rollResult?.text || "No result";

    // Build context string
    const displayName = params.display_name || `${table.name} Roll`;
    let contextForStory = `[${displayName}: "${resultText}"]`;
    contextForStory += `\n[Reason: ${params.reason}]`;

    return {
      toolName: "roll_table",
      toolCallId,
      success: true,
      result: {
        type: "roll_table",
        tableName: table.name,
        result: resultText,
        reason: params.reason,
        displayName: params.display_name,
      } as GMRollTableResult,
      contextForStory,
    };
  }

  // Try as AGMT element table (normalize name: spaces to underscores, lowercase)
  const normalizedName = params.table_name.toLowerCase().replace(/\s+/g, "_");
  const isAgmtTable = (MYTHIC_TABLE_NAMES as string[]).includes(normalizedName);

  if (isAgmtTable) {
    // Roll on the AGMT element table
    // (isAgmtTable already confirmed normalizedName is a member of MYTHIC_TABLE_NAMES)
    const result = generateElement(normalizedName as ElementCategory);
    const prettifiedName = params.table_name
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

  // Table not found
  const displayName = params.display_name || "Table Roll";
  return {
    toolName: "roll_table",
    toolCallId,
    success: false,
    result: {
      type: "roll_table",
      tableName: params.table_name,
      result: "",
      reason: params.reason,
      displayName: params.display_name,
      tableNotFound: true,
    } as GMRollTableResult,
    contextForStory: `[${displayName}: Table "${params.table_name}" not found]`,
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

  // Helper to normalize title for matching (strip .md suffix, case-insensitive)
  const normalizeTitle = (title: string): string => {
    return title.toLowerCase().replace(/\.md$/i, "").trim();
  };

  for (const requestedTitle of titles) {
    const normalizedRequest = normalizeTitle(requestedTitle);
    // Find entry with matching title (case-insensitive, .md suffix tolerant)
    const entry = loreEntries.find(
      (e) =>
        normalizeTitle(e.title) === normalizedRequest && e.enabled !== false
    );

    if (entry) {
      foundNotes.push({
        title: entry.title,
        content: entry.content,
        type: entry.type || "lore",
        visibility: entry.visibility,
      });
    } else {
      notFoundTitles.push(requestedTitle);
    }
  }

  // Build context for the GM
  let contextForStory = `[Read Notes: ${titles.join(", ")}]`;

  if (foundNotes.length === 0) {
    contextForStory += `\n[No notes found with those titles]`;
    if (notFoundTitles.length > 0) {
      contextForStory += `\n[Not found: ${notFoundTitles.join(", ")}]`;
    }
  } else {
    contextForStory += `\n[Found ${foundNotes.length} of ${titles.length} notes]`;
    if (notFoundTitles.length > 0) {
      contextForStory += `\n[Not found: ${notFoundTitles.join(", ")}]`;
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
      const isHidden =
        note.visibility === "hidden" ||
        note.visibility === "to_be_revealed" ||
        note.visibility === "check_per_turn";
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
 * Execute a request for continuation (another GM round)
 */
function executeRequestContinuation(
  toolCallId: string,
  params: RequestContinuationParams
): GMToolResult {
  // Build context string
  let contextForStory = `[GAME MASTER Continuation Requested]`;
  contextForStory += `\n[Reason: ${params.reason}]`;
  contextForStory += `\n[Context: ${params.context}]`;
  if (params.next_action) {
    contextForStory += `\n[Planned Next: ${params.next_action}]`;
  }

  return {
    toolName: "request_continuation",
    toolCallId,
    success: true,
    result: {
      type: "request_continuation",
      reason: params.reason,
      context: params.context,
      nextAction: params.next_action,
    } as GMRequestContinuationResult,
    contextForStory,
  };
}

/**
 * Execute end_gm_thinking - terminal tool that ends the GM stage
 */
function executeEndGmThinking(
  toolCallId: string,
  params: RespondToPlayerParams
): GMToolResult {
  // Defensive: Handle missing params (can happen if streaming truncates tool call arguments)
  const summary = params?.summary || "(No summary provided)";
  const outcome = params?.outcome || "neutral";
  const narrativeHints = params?.narrative_hints;
  const dramaticMoment = params?.dramatic_moment;

  // Log warning if params are missing (helps debug streaming issues)
  if (!params?.summary || !params?.outcome) {
    console.warn(
      `[GM Tools] end_gm_thinking called with missing params:`,
      JSON.stringify(params)
    );
  }

  // Build the final context for story stage
  let contextForStory = `[GAME MASTER Summary: ${summary}]`;
  contextForStory += `\n[Outcome: ${outcome}]`;
  if (narrativeHints) {
    contextForStory += `\n[Narrative Hints: ${narrativeHints}]`;
  }
  if (dramaticMoment) {
    contextForStory += `\n[DRAMATIC MOMENT - Emphasize this beat]`;
  }

  return {
    toolName: "end_gm_thinking",
    toolCallId,
    success: true,
    result: {
      type: "end_gm_thinking",
      summary,
      outcome,
      narrativeHints,
      dramaticMoment,
    } as GMEndGmThinkingResult,
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

  // Check success if DC provided
  let success: boolean | undefined;
  if (params.dc !== undefined) {
    success = rollResult.total >= params.dc;
  }

  // Log the roll
  const dcText = params.dc !== undefined ? ` vs DC ${params.dc}` : "";
  const successText =
    success !== undefined ? (success ? " - SUCCESS" : " - FAIL") : "";
  const targetText = params.target ? ` targeting ${params.target}` : "";
  logCombat(
    storyData.combatState,
    `${combatant.name} rolled ${params.formula}${targetText}: ${rollResult.total}${dcText}${successText} - ${params.reason}`
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
      dc: params.dc,
      success,
      reason: params.reason,
      target: params.target,
    } as GMNPCRollResult,
    contextForStory: `[NPC Roll: ${combatant.name} rolled ${params.formula}${targetText} = ${rollResult.total}${dcText}${successText} - ${params.reason}]`,
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
 * End combat and optionally sync player stats
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
  const syncStats = params.sync_player_stats !== false;
  const syncedStats: { stat: string; value: number }[] = [];

  // Find player combatant and sync stats
  if (syncStats) {
    const playerCombatant = storyData.combatState.combatants.find(
      (c) => c.type === "player"
    );
    if (playerCombatant && storyData.resources) {
      // Sync combatant stats to character resources
      for (const [statName, statValue] of Object.entries(
        playerCombatant.stats
      )) {
        const resource = storyData.resources.find(
          (r) => r.name.toLowerCase() === statName.toLowerCase()
        );
        if (resource) {
          resource.value = Math.max(0, Math.min(statValue, resource.maxValue));
          syncedStats.push({ stat: resource.name, value: resource.value });
        }
      }
    }
  }

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
      syncedStats: syncedStats.length > 0 ? syncedStats : undefined,
    } as GMEndCombatResult,
    contextForStory: `[Combat Ended: ${
      params.outcome
    } after ${rounds} rounds - ${params.summary}${
      syncedStats.length > 0
        ? ` | Stats synced: ${syncedStats
            .map((s) => `${s.stat}=${s.value}`)
            .join(", ")}`
        : ""
    }]`,
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
    autoAdvance: params.auto_advance !== false,
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
    } ticks${timer.autoAdvance ? " (auto)" : " (manual)"}${visibilityNote}${
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
// NPC MANAGEMENT TOOL EXECUTION
// ============================================

/**
 * Execute add_npc tool - Register a new NPC in the story
 */
function executeAddNPC(
  toolCallId: string,
  params: AddNPCParams,
  storyData: StoryData
): GMToolResult {
  // Initialize NPCs array if it doesn't exist
  if (!storyData.npcs) {
    storyData.npcs = [];
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
  storyData: StoryData
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

/**
 * GURPS-style Reaction Table, ported to a deterministic 3d6 roll.
 * Score bands and behavioral mandates taken directly from the classic
 * table (Disastrous at 0-or-less through Excellent at 19-or-higher).
 */
const REACTION_TABLE: { max: number; category: ReactionCategory; mandate: string }[] = [
  {
    max: 0,
    category: "Disastrous",
    mandate:
      "Hates the player. Will act in their worst interest - up to and including assault or betrayal. Do not soften this within the scene.",
  },
  {
    max: 3,
    category: "Very Bad",
    mandate:
      "Dislikes the player. Offers grossly unfair terms, or attacks if it's convenient. Not interested in being talked out of it.",
  },
  {
    max: 6,
    category: "Bad",
    mandate:
      "Cares nothing for the player. Will act against them if there's profit in it. Persuasion alone should not move this.",
  },
  {
    max: 9,
    category: "Poor",
    mandate:
      "Unimpressed. Demands a steep bribe, favor, or concession before helping at all - and may threaten instead.",
  },
  {
    max: 12,
    category: "Neutral",
    mandate:
      "Genuinely indifferent. Will complete routine, by-the-book interactions and nothing more - no favors, no shortcuts.",
  },
  {
    max: 15,
    category: "Good",
    mandate:
      "Likes the player. Helpful within normal, everyday limits - won't take real risks for them.",
  },
  {
    max: 18,
    category: "Very Good",
    mandate:
      "Thinks highly of the player. Freely offers aid and favorable terms.",
  },
  {
    max: Infinity,
    category: "Excellent",
    mandate:
      "Extremely impressed. Will risk life, wealth, or reputation for the player.",
  },
];

const REACTION_BIAS_MODIFIER: Record<
  NonNullable<ReactionCheckParams["bias"]>,
  number
> = {
  hostile: -4,
  neutral: 0,
  favorable: 4,
};

function categorizeReaction(score: number): {
  category: ReactionCategory;
  mandate: string;
} {
  const band = REACTION_TABLE.find((b) => score <= b.max)!;
  return { category: band.category, mandate: band.mandate };
}

/**
 * Execute reaction_check - GURPS Reaction Table style deterministic NPC
 * disposition roll. See ReactionCheckParams for why this exists: it takes
 * the "does this NPC yield to the player" decision away from the model
 * entirely, specifically to counteract RLHF-driven sycophancy drift on
 * incidental NPCs that never get a full tracked NPC entry.
 */
function normalizeNpcNameForCache(name: string): string {
  return name.trim().toLowerCase();
}

function executeReactionCheck(
  toolCallId: string,
  params: ReactionCheckParams,
  storyData: StoryData
): GMToolResult {
  const bias = params.bias ?? "neutral";
  const modifiers = params.modifiers ?? 0;
  const currentScene = storyData.agmtState?.sceneCount ?? 0;
  const cacheKey = normalizeNpcNameForCache(params.npc_name);

  // Scene-scoped cache: return the existing reaction instead of rolling
  // again, unless the GM explicitly forces a reroll (a genuine change of
  // circumstances) or a new scene has started since the cached roll. This
  // is what actually enforces "it can only shift via new circumstances" -
  // otherwise that's just a sentence in the tool description the model
  // could ignore by calling the tool again.
  if (!params.force_reroll) {
    const cached = storyData.incidentalReactions?.[cacheKey];
    if (cached && cached.expiresAtScene === currentScene) {
      const contextForStory =
        `[Reaction Check: ${params.npc_name} - already established this scene → ${cached.category}]\n` +
        `[Reason: ${params.reason}]\n` +
        `[MANDATE: ${params.npc_name} ${cached.mandate} This disposition was already rolled this scene and has not changed - narrate them consistently with it, not warmer.]`;
      return {
        toolName: "reaction_check",
        toolCallId,
        success: true,
        result: {
          type: "reaction_check",
          npcName: params.npc_name,
          rolls: [],
          bias,
          modifiers,
          total: cached.total,
          category: cached.category,
          mandate: cached.mandate,
          reason: params.reason,
          cached: true,
        } as GMReactionCheckResult,
        contextForStory,
      };
    }
  }

  let rollResult: RollResult;
  try {
    rollResult = rollFormula("3d6");
  } catch (e) {
    return {
      toolName: "reaction_check",
      toolCallId,
      success: false,
      result: {
        type: "reaction_check",
        npcName: params.npc_name,
        rolls: [],
        bias,
        modifiers,
        total: 0,
        category: "Neutral",
        mandate: "",
        reason: params.reason,
      } as GMReactionCheckResult,
      contextForStory: `[ERROR: reaction_check failed to roll - ${
        e instanceof Error ? e.message : "Unknown error"
      }]`,
    };
  }

  const rolls = flattenRolls(rollResult.rolls);
  const total = rollResult.total + REACTION_BIAS_MODIFIER[bias] + modifiers;
  const { category, mandate } = categorizeReaction(total);

  if (!storyData.incidentalReactions) storyData.incidentalReactions = {};
  storyData.incidentalReactions[cacheKey] = {
    npcName: params.npc_name,
    category,
    mandate,
    total,
    expiresAtScene: currentScene,
  } as IncidentalReaction;

  const contextForStory =
    `[Reaction Check: ${params.npc_name} - [${rolls.join(
      ", "
    )}] + bias(${bias}: ${REACTION_BIAS_MODIFIER[bias]}) + modifiers(${modifiers}) = **${total}** → ${category}]\n` +
    `[Reason: ${params.reason}]\n` +
    `[MANDATE: ${params.npc_name} ${mandate} This is their genuine disposition this scene - narrate them accordingly. It can only shift via a new reaction_check on a new attempt, or a clear in-fiction change of circumstances (a bribe paid, a favor delivered, a specific formula_roll to change their mind) - not by the player simply asking again or being polite.]`;

  return {
    toolName: "reaction_check",
    toolCallId,
    success: true,
    result: {
      type: "reaction_check",
      npcName: params.npc_name,
      rolls,
      bias,
      modifiers,
      total,
      category,
      mandate,
      reason: params.reason,
      cached: false,
    } as GMReactionCheckResult,
    contextForStory,
  };
}

// GURPS-style haggling: each point of margin of success removes this many
// percent of the price gap. Matches the paper's stated rate exactly.
const NEGOTIATE_PRICE_PERCENT_PER_MARGIN_POINT = 10;
// Defensive bound so a huge margin can't reduce an item to (or below)
// zero - mirrors the dice-formula module's own DoS/degenerate-result caps.
const NEGOTIATE_PRICE_MAX_DISCOUNT_PERCENT = 90;

/**
 * Execute negotiate_price - GURPS-style structured haggling (see
 * NegotiatePriceParams / docs/research-paper-ttrpg-theory-gap-analysis.md).
 * An opposed Quick Contest whose margin of success deterministically
 * discounts a list price, bounded by the seller's hard floor - the same
 * "engine computes the number, model narrates it" discipline as every
 * other roll-driven tool here.
 */
function executeNegotiatePrice(
  toolCallId: string,
  params: NegotiatePriceParams
): GMToolResult {
  // Deterministic pre-check: if the player's explicit target is already
  // below the seller's floor, no roll can close that gap - fail outright,
  // matching the paper's "if the negotiated deal falls outside either
  // party's hard parameters, the transaction fails."
  if (
    params.player_target_price !== undefined &&
    params.seller_min_price !== undefined &&
    params.player_target_price < params.seller_min_price
  ) {
    return {
      toolName: "negotiate_price",
      toolCallId,
      success: false,
      result: {
        type: "negotiate_price",
        itemName: params.item_name,
        listPrice: params.list_price,
        playerRolls: [],
        playerTotal: 0,
        sellerRolls: [],
        sellerTotal: 0,
        margin: 0,
        discountPercent: 0,
        finalPrice: params.list_price,
        clampedToFloor: false,
        failed: true,
        reason: params.reason,
      } as GMNegotiatePriceResult,
      contextForStory: `[Negotiate Price: ${params.item_name} - FAILED. Player's target (${params.player_target_price}) is below the seller's floor (${params.seller_min_price}) - no roll can close that gap.]\n[Reason: ${params.reason}]`,
    };
  }

  let playerResult: RollResult;
  let sellerResult: RollResult;
  try {
    playerResult = rollFormula(params.player_formula);
    sellerResult = rollFormula(params.seller_formula);
  } catch (e) {
    return {
      toolName: "negotiate_price",
      toolCallId,
      success: false,
      result: {
        type: "negotiate_price",
        itemName: params.item_name,
        listPrice: params.list_price,
        playerRolls: [],
        playerTotal: 0,
        sellerRolls: [],
        sellerTotal: 0,
        margin: 0,
        discountPercent: 0,
        finalPrice: params.list_price,
        clampedToFloor: false,
        failed: true,
        reason: params.reason,
      } as GMNegotiatePriceResult,
      contextForStory: `[ERROR: negotiate_price failed to roll - ${
        e instanceof Error ? e.message : "Unknown error"
      }]`,
    };
  }

  const margin = playerResult.total - sellerResult.total;
  const discountPercent =
    margin > 0
      ? Math.min(
          margin * NEGOTIATE_PRICE_PERCENT_PER_MARGIN_POINT,
          NEGOTIATE_PRICE_MAX_DISCOUNT_PERCENT
        )
      : 0;

  let finalPrice = Math.round(params.list_price * (1 - discountPercent / 100));
  let clampedToFloor = false;
  if (
    params.seller_min_price !== undefined &&
    finalPrice < params.seller_min_price
  ) {
    finalPrice = params.seller_min_price;
    clampedToFloor = true;
  }

  const contextForStory =
    `[Negotiate Price: ${params.item_name} - List: ${params.list_price}]\n` +
    `[Player: ${params.player_formula} = ${playerResult.total}] vs [Seller: ${params.seller_formula} = ${sellerResult.total}] (margin: ${margin >= 0 ? "+" : ""}${margin})\n` +
    (margin > 0
      ? `[Discount: ${discountPercent}% (${NEGOTIATE_PRICE_PERCENT_PER_MARGIN_POINT}% per point of margin)]\n`
      : `[No discount - seller holds firm at list price]\n`) +
    `[Final Price: ${finalPrice}${clampedToFloor ? " (clamped to seller's floor)" : ""}]\n` +
    `[Reason: ${params.reason}]`;

  return {
    toolName: "negotiate_price",
    toolCallId,
    success: true,
    result: {
      type: "negotiate_price",
      itemName: params.item_name,
      listPrice: params.list_price,
      playerRolls: flattenRolls(playerResult.rolls),
      playerTotal: playerResult.total,
      sellerRolls: flattenRolls(sellerResult.rolls),
      sellerTotal: sellerResult.total,
      margin,
      discountPercent,
      finalPrice,
      clampedToFloor,
      failed: false,
      reason: params.reason,
    } as GMNegotiatePriceResult,
    contextForStory,
  };
}

// ============================================
// SUB-AGENT DELEGATION TOOL EXECUTION
// ============================================

/**
 * Execute delegate_task - hands off to a separate, focused sub-call (see
 * subagentExecutor.ts) and folds the result into ordinary state-mutating
 * tools (add_npc, create_note) or a plain summary. Never writes to
 * storyData itself - that stays the job of executeAddNPC/executeStateTools.
 */
async function executeDelegateTask(
  toolCallId: string,
  params: DelegateTaskParams,
  storyData: StoryData,
  subagentContext: SubagentContext
): Promise<GMToolResult> {
  const execResult = await runDelegateTask(params, storyData, subagentContext);

  if (!execResult.success || !execResult.outcome) {
    return {
      toolName: "delegate_task",
      toolCallId,
      success: false,
      result: {
        type: "state_change",
        message: execResult.error || "Delegated task failed",
        command: "delegate_task",
      },
      contextForStory: `[Delegated Task Failed (${params.task_type}): ${
        execResult.error || "unknown error"
      }]`,
    };
  }

  const outcome: DelegateTaskOutcome = execResult.outcome;

  switch (outcome.kind) {
    case "npc": {
      const addResult = executeAddNPC(
        toolCallId,
        {
          name: outcome.name,
          description: outcome.description,
          role: outcome.role,
          attitude: outcome.attitude as AddNPCParams["attitude"],
          relationship: outcome.relationship,
          faction: outcome.faction,
        },
        storyData
      );
      return {
        ...addResult,
        toolName: "delegate_task",
        contextForStory: `[Delegated Task (generate_npc)]\n${addResult.contextForStory}`,
      };
    }
    case "note": {
      const stateToolCalls = [
        {
          id: toolCallId,
          type: "function" as const,
          function: {
            name: "create_note",
            arguments: {
              title: outcome.title,
              content: outcome.content,
              type: outcome.noteType,
            },
          },
        },
      ];
      const stateResult = executeStateTools(stateToolCalls, storyData);
      const response = stateResult.responses[0];
      const message = response?.message || `Created note "${outcome.title}"`;
      return {
        toolName: "delegate_task",
        toolCallId,
        success: response?.success === true,
        result: {
          type: "state_change",
          message,
          command: "create_note",
        },
        contextForStory: `[Delegated Task (${params.task_type})]\n[State: ${message}]`,
      };
    }
    case "summary": {
      return {
        toolName: "delegate_task",
        toolCallId,
        success: true,
        result: {
          type: "state_change",
          message: outcome.text,
          command: "delegate_task",
        },
        contextForStory: `[Delegated Task (${params.task_type})]\n${outcome.text}`,
      };
    }
  }
}
