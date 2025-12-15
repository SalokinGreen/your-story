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
  Condition,
  InventoryItem,
  Ability,
  Combatant,
  CombatState,
  CountdownTimer,
  NPC,
  NPCReaction,
  NPCStatus,
  NPCAttitude,
} from "./structs";
import {
  StartChallengeParams,
  CalculateParams,
  TakeRestParams,
  FormulaRollParams,
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
  // Combat tools
  StartCombatParams,
  AddCombatantParams,
  AddMultipleCombatantsParams,
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
} from "./gmTools";
import {
  getRPGSystem,
  checkSuccess,
  rollDice,
  getConditionPenalty,
  RPGSystemType,
  RPGSystem,
} from "./rpgSystems";
import {
  findStatMatch,
  findItemMatch,
  findAbilityMatch,
  findResourceMatch,
} from "./fuzzyMatch";
import { getItemBonus } from "./itemSystem";
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
    | GMOpposedFormulaResult
    | GMFormulaChallengeResult
    | GMFateQuestionResult
    | GMRollTableResult
    | GMReadNotesResult
    | GMSearchMemoryResult
    | GMRequestContinuationResult
    | GMAskPlayerResult
    | GMEndGmThinkingResult
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
    | GMNPCReactionResult;
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
    conditions: { name: string; oldTier: number; newTier: number }[];
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
  showToPlayer?: boolean; // Show dice animation to player (default true)
  stakes?: string;
  consequences?: {
    success?: string;
    failure?: string;
  };
  unresolvedVariables?: string[]; // Variables that couldn't be resolved
  breakdown?: string; // Human-readable breakdown
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
  showToPlayer?: boolean; // Show dice animation to player (default true)
  stakes?: string;
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
  showToPlayer?: boolean; // Show dice animation to player (default true)
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

export interface GMAskPlayerResult {
  type: "ask_player";
  question: string;
  context: string;
  options?: string[];
  allowCustom: boolean;
}

export interface GMEndGmThinkingResult {
  type: "end_gm_thinking";
  summary: string;
  outcome: "success" | "failure" | "mixed" | "neutral";
  narrativeHints?: string;
  dramaticMoment?: boolean;
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
  showToPlayer: boolean;
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

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Calculate total condition penalty for a stat from all applicable conditions
 */
function calculateConditionPenalty(
  conditions: Condition[],
  statName: string,
  systemId: RPGSystemType | undefined
): { penalty: number; condition?: Condition } {
  if (!conditions || conditions.length === 0) {
    return { penalty: 0 };
  }

  // Find the highest-tier condition that affects this stat
  let worstCondition: Condition | undefined;
  let worstPenalty = 0;

  for (const condition of conditions) {
    // Check if condition affects this stat or all stats
    const affectsThisStat =
      condition.affectsAll ||
      (condition.affects || []).some(
        (s) => s.toLowerCase() === statName.toLowerCase()
      );

    if (!affectsThisStat) continue;

    const tier = condition.tier as 1 | 2 | 3 | 4 | 5 | 6;
    const penaltyResult = getConditionPenalty(systemId, tier);

    // For now, we only handle modifier penalties in skill checks
    if (
      penaltyResult.type === "modifier" &&
      penaltyResult.value > worstPenalty
    ) {
      worstPenalty = penaltyResult.value;
      worstCondition = condition;
    }
  }

  return { penalty: worstPenalty, condition: worstCondition };
}

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

export interface GMExecutionResult {
  results: GMToolResult[];
  modifiedStoryData: StoryData;
  storyContext: string; // Combined context for story stage
  // Special flow control flags
  requestsContinuation?: boolean; // AI wants another GM round (legacy)
  continuationContext?: string; // Context for next round (legacy)
  asksPlayer?: boolean; // AI wants to ask the player something
  playerQuestion?: {
    question: string;
    context: string;
    options?: string[];
    allowCustom: boolean;
  };
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
  storyData: StoryData
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

  // Clone storyData to avoid mutations
  const modified = JSON.parse(JSON.stringify(storyData)) as StoryData;
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
          result = executeSearchMemory(
            call.id,
            params as SearchMemoryParams,
            modified
          );
          break;
        case "request_continuation":
          result = executeRequestContinuation(
            call.id,
            params as RequestContinuationParams
          );
          break;
        case "ask_player":
          result = executeAskPlayer(call.id, params as AskPlayerParams);
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
          result = executeAddCombatant(
            call.id,
            params as AddCombatantParams,
            modified
          );
          break;
        case "add_multiple_combatants":
          result = executeAddMultipleCombatants(
            call.id,
            params as AddMultipleCombatantsParams,
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
        // Timer tools
        case "create_timer":
          result = executeCreateTimer(
            call.id,
            params as CreateTimerParams,
            modified
          );
          break;
        case "advance_timer":
          result = executeAdvanceTimer(
            call.id,
            params as AdvanceTimerParams,
            modified
          );
          break;
        case "toggle_timer_pause":
          result = executeToggleTimerPause(
            call.id,
            params as ToggleTimerPauseParams,
            modified
          );
          break;
        case "cancel_timer":
          result = executeCancelTimer(
            call.id,
            params as CancelTimerParams,
            modified
          );
          break;
        case "trigger_timer":
          result = executeTriggerTimer(
            call.id,
            params as TriggerTimerParams,
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
            // Convert state tool response to GM tool result format
            result = {
              toolName: call.function.name,
              toolCallId: call.id,
              success: response.success === true,
              result: {
                type: "state_change" as const,
                message: response.message,
                command: response.command,
              },
              contextForStory:
                response.success === true
                  ? `[State: ${response.message}]`
                  : `[State Failed: ${response.message}]`,
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
  let asksPlayer = false;
  let playerQuestion:
    | {
        question: string;
        context: string;
        options?: string[];
        allowCustom: boolean;
      }
    | undefined;
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
    if (res.toolName === "ask_player") {
      asksPlayer = true;
      const askResult = res.result as GMAskPlayerResult;
      playerQuestion = {
        question: askResult.question,
        context: askResult.context,
        options: askResult.options,
        allowCustom: askResult.allowCustom,
      };
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
    asksPlayer,
    playerQuestion,
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
          conditions: [],
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
        recovery: { resources: [], cooldowns: [], conditions: [], items: [] },
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
        recovery: { resources: [], cooldowns: [], conditions: [], items: [] },
        error: `No short rests remaining (${restConfig.maxShortRests} max)`,
      } as GMRestResult,
      contextForStory: `[ERROR: No short rests remaining (${restConfig.maxShortRests} max)]`,
    };
  }

  // Calculate recovery
  const recovery: GMRestResult["recovery"] = {
    resources: [],
    cooldowns: [],
    conditions: [],
    items: [],
  };

  // Get rest type specific config
  const cooldownReduction = restConfig.cooldownReduction[params.type];
  const conditionDowngrade = restConfig.conditionDowngrade[params.type];

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

  // Improve conditions (short/long rests only)
  if (conditionDowngrade > 0) {
    for (const condition of storyData.conditions || []) {
      if (!condition.permanent && condition.tier > 1) {
        const newTier = Math.max(1, condition.tier - conditionDowngrade) as
          | 1
          | 2
          | 3
          | 4
          | 5
          | 6;
        if (newTier < condition.tier) {
          recovery.conditions.push({
            name: condition.name,
            oldTier: condition.tier,
            newTier,
          });
          condition.tier = newTier;
        }
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
  if (recovery.conditions.length > 0) {
    contextForStory += `\n[Conditions improved: ${recovery.conditions
      .map((c) => `${c.name} ${c.oldTier}→${c.newTier}`)
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
 * Execute a formula roll with optional DC check
 * GM must provide formulas with actual numeric values (no variable substitution)
 */
function executeFormulaRoll(
  toolCallId: string,
  params: FormulaRollParams,
  storyData: StoryData
): GMToolResult {
  // No variable resolver - GM must provide actual numbers
  void storyData; // Suppress unused parameter warning

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
      consequences: params.consequences,
      breakdown: rollResult.breakdown,
      showToPlayer: params.show_to_player !== false, // Default true
    } as GMFormulaRollResult,
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
  void storyData; // Suppress unused parameter warning

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
  }

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
      consequences: params.consequences,
      showToPlayer: params.show_to_player !== false, // Default true
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
      showToPlayer: params.show_to_player !== false, // Default true
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
  // Import askFate dynamically to avoid circular dependencies
  const { askFate } = require("./mythic") as {
    askFate: (
      likelihood: string,
      chaosFactor: number
    ) => { answer: string; randomEvent: boolean; roll: number };
  };

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
    contextForStory += `\n[⚡ RANDOM EVENT TRIGGERED! Consider adding an unexpected twist.]`;
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
  // Import table utilities
  const { getTableByName, rollOnCustomTable } = require("./tableRoller") as {
    getTableByName: (
      tables: {
        id: string;
        name: string;
        entries: { text: string; weight: number }[];
      }[],
      name: string
    ) => {
      id: string;
      name: string;
      entries: { text: string; weight: number }[];
    } | null;
    rollOnCustomTable: (table: {
      entries: { text: string; weight: number }[];
    }) => { text: string; weight: number } | null;
  };

  // Import AGMT element tables
  const { generateElement, MYTHIC_TABLE_NAMES } = require("./mythic") as {
    generateElement: (category: string) => {
      element: string;
      roll: number;
      category: string;
    };
    MYTHIC_TABLE_NAMES: string[];
  };

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
  const isAgmtTable = MYTHIC_TABLE_NAMES.includes(normalizedName);

  if (isAgmtTable) {
    // Roll on the AGMT element table
    const result = generateElement(normalizedName);
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
  const { titles } = params;

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
  const foundNotes: Array<{ title: string; content: string; type: string }> =
    [];
  const notFoundTitles: string[] = [];

  for (const requestedTitle of titles) {
    // Find entry with matching title (case-insensitive)
    const entry = loreEntries.find(
      (e) =>
        e.title.toLowerCase() === requestedTitle.toLowerCase() &&
        e.enabled !== false
    );

    if (entry) {
      foundNotes.push({
        title: entry.title,
        content: entry.content,
        type: entry.type || "lore",
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
      contextForStory += `\n\n---\n### ${note.title}${typeSuffix}\n${note.content}`;
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
 * Execute a search through memory entries
 */
function executeSearchMemory(
  toolCallId: string,
  params: SearchMemoryParams,
  storyData: StoryData
): GMToolResult {
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

  // Import helper to get memory content (handles both string and MemoryEntry)
  const { getMemoryContent } = require("./structs");

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
    contextForStory += `\n[No matching memories found (searched ${memoryEntries.length} entries)]`;
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
 * Execute an ask player request
 */
function executeAskPlayer(
  toolCallId: string,
  params: AskPlayerParams
): GMToolResult {
  const allowCustom = params.allow_custom !== false; // Default to true

  // Build context string (will be shown to player)
  let contextForStory = `[GAME MASTER Question for Player]`;
  contextForStory += `\n[Question: ${params.question}]`;
  contextForStory += `\n[Context: ${params.context}]`;
  if (params.options && params.options.length > 0) {
    contextForStory += `\n[Suggested Options: ${params.options.join(" | ")}]`;
    if (allowCustom) {
      contextForStory += ` (or custom answer)`;
    }
  }

  return {
    toolName: "ask_player",
    toolCallId,
    success: true,
    result: {
      type: "ask_player",
      question: params.question,
      context: params.context,
      options: params.options,
      allowCustom,
    } as GMAskPlayerResult,
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
  // Build the final context for story stage
  let contextForStory = `[GAME MASTER Summary: ${params.summary}]`;
  contextForStory += `\n[Outcome: ${params.outcome}]`;
  if (params.narrative_hints) {
    contextForStory += `\n[Narrative Hints: ${params.narrative_hints}]`;
  }
  if (params.dramatic_moment) {
    contextForStory += `\n[DRAMATIC MOMENT - Emphasize this beat]`;
  }

  return {
    toolName: "end_gm_thinking",
    toolCallId,
    success: true,
    result: {
      type: "end_gm_thinking",
      summary: params.summary,
      outcome: params.outcome,
      narrativeHints: params.narrative_hints,
      dramaticMoment: params.dramatic_moment,
    } as GMEndGmThinkingResult,
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

  // Apply the change
  combatant.stats[params.stat] = newValue;

  // Log the change
  const changeStr = change >= 0 ? `+${change}` : `${change}`;
  const logEntry = params.reason
    ? `${combatant.name} ${params.stat}: ${oldValue} → ${newValue} (${changeStr}) - ${params.reason}`
    : `${combatant.name} ${params.stat}: ${oldValue} → ${newValue} (${changeStr})`;
  logCombat(storyData.combatState, logEntry);

  const diceInfo = diceRolled ? ` [rolled: ${diceRolled.join(", ")}]` : "";

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
    } as GMUpdateCombatantStatResult,
    contextForStory: `[${combatant.name} ${
      params.stat
    }: ${oldValue} → ${newValue} (${changeStr})${
      params.reason ? ` - ${params.reason}` : ""
    }${diceInfo}]`,
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
        showToPlayer: params.show_to_player ?? false,
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
        showToPlayer: params.show_to_player ?? false,
      } as GMNPCRollResult,
      contextForStory: `[Combat Error: Combatant "${params.combatant}" not found]`,
    };
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
        showToPlayer: params.show_to_player ?? false,
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

  const showToPlayer = params.show_to_player ?? false;

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
      showToPlayer,
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
        }]`
      : `[Timer: "${timer.name}" ${previousTicks} → ${timer.currentTicks} ticks remaining]`,
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
    changes.push(`attitude: ${npc.attitude} → ${params.attitude}`);
    npc.attitude = params.attitude as NPCAttitude;
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
