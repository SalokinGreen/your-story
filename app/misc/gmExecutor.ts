/**
 * GM Stage Executor - Frontend execution of GM tool calls
 *
 * Executes GM tool calls (skill_check, challenge_check, etc.) on the frontend,
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
} from "./structs";
import {
  SkillCheckParams,
  ChallengeCheckParams,
  StartChallengeParams,
  OpposedCheckParams,
  RollDiceParams,
  CalculateParams,
  NoCheckNeededParams,
  TakeRestParams,
  FormulaRollParams,
  OpposedFormulaParams,
  FormulaChallengeCheckParams,
  FateQuestionParams,
  RollTableParams,
  RequestContinuationParams,
  AskPlayerParams,
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
import {
  rollFormula,
  createSchemaBasedResolver,
  RollResult,
} from "./diceFormula";

// ============================================
// RESULT INTERFACES
// ============================================

export interface GMToolResult {
  toolName: string;
  toolCallId: string;
  success: boolean;
  result:
    | GMCheckResult
    | GMChallengeResult
    | GMOpposedResult
    | GMRollResult
    | GMCalculateResult
    | GMRestResult
    | GMNoCheckResult
    | GMFormulaRollResult
    | GMOpposedFormulaResult
    | GMFormulaChallengeResult
    | GMFateQuestionResult
    | GMRollTableResult
    | GMRequestContinuationResult
    | GMAskPlayerResult;
  contextForStory: string; // Formatted bracket notation for story stage
}

export interface GMCheckResult {
  type: "skill_check" | "challenge_check";
  stat: string;
  statValue: number;
  difficulty: string;
  dc: number;
  roll: number;
  rolls: number[]; // Individual dice values for dice visualizer
  total: number;
  success: boolean;
  explosions?: number; // For explosive dice system
  partialSuccess?: boolean;
  criticalSuccess?: boolean;
  criticalFailure?: boolean;
  margin?: number;
  item?: {
    name: string;
    used: boolean;
    broken?: boolean;
    consumed?: boolean;
  };
  ability?: {
    name: string;
    used: boolean;
    costPaid?: boolean;
  };
  resource?: {
    name: string;
    required: number;
    had: number;
    penalty?: number;
  };
  condition?: {
    name: string;
    tier: number;
    penalty: number;
  };
  modifier?: {
    value: number;
    reason: string;
  };
  stakes?: string;
  consequences?: {
    success?: string;
    failure?: string;
    partial?: string;
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

export interface GMOpposedResult {
  type: "opposed_check";
  playerStat: string;
  playerStatValue: number;
  playerRoll: number;
  playerTotal: number;
  opponentName: string;
  opponentSkill: number;
  opponentRoll: number;
  opponentTotal: number;
  winner: "player" | "opponent" | "tie";
  margin: number;
  item?: {
    name: string;
    used: boolean;
    broken?: boolean;
    consumed?: boolean;
  };
  ability?: {
    name: string;
    used: boolean;
    costPaid?: boolean;
  };
  stakes?: string;
  consequences?: {
    player_wins?: string;
    opponent_wins?: string;
    tie?: string;
  };
}

export interface GMRollResult {
  type: "roll_dice";
  dice: string;
  rolls: number[];
  modifier: number;
  total: number;
  reason: string;
  displayName?: string;
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

export interface GMNoCheckResult {
  type: "no_check_needed";
  reason: string;
  outcome?: string;
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
  success?: boolean;
  margin?: number;
  reason: string;
  displayName?: string;
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
  requestsContinuation?: boolean; // AI wants another GM round
  continuationContext?: string; // Context for next round
  asksPlayer?: boolean; // AI wants to ask the player something
  playerQuestion?: {
    question: string;
    context: string;
    options?: string[];
    allowCustom: boolean;
  };
}

/**
 * Execute GM stage tool calls and return results for the story stage
 */
export async function executeGMTools(
  toolCalls: { id: string; function: { name: string; arguments: string } }[],
  storyData: StoryData
): Promise<GMExecutionResult> {
  // Clone storyData to avoid mutations
  const modified = JSON.parse(JSON.stringify(storyData)) as StoryData;
  const results: GMToolResult[] = [];
  const contextParts: string[] = [];

  for (const call of toolCalls) {
    let params: unknown;
    try {
      params = JSON.parse(call.function.arguments);
    } catch {
      console.error(
        `Failed to parse GM tool arguments: ${call.function.arguments}`
      );
      continue;
    }

    let result: GMToolResult;

    switch (call.function.name) {
      case "skill_check":
        result = executeSkillCheck(
          call.id,
          params as SkillCheckParams,
          modified
        );
        break;
      case "challenge_check":
        result = executeChallengeCheck(
          call.id,
          params as ChallengeCheckParams,
          modified
        );
        break;
      case "start_challenge":
        result = executeStartChallenge(
          call.id,
          params as StartChallengeParams,
          modified
        );
        break;
      case "opposed_check":
        result = executeOpposedCheck(
          call.id,
          params as OpposedCheckParams,
          modified
        );
        break;
      case "roll_dice":
        result = executeRollDice(call.id, params as RollDiceParams);
        break;
      case "calculate":
        result = executeCalculate(call.id, params as CalculateParams);
        break;
      case "no_check_needed":
        result = executeNoCheckNeeded(call.id, params as NoCheckNeededParams);
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
        result = executeRollTable(call.id, params as RollTableParams, modified);
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
      default:
        console.warn(`Unknown GM tool: ${call.function.name}`);
        continue;
    }

    results.push(result);
    if (result.contextForStory) {
      contextParts.push(result.contextForStory);
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
  }

  return {
    results,
    modifiedStoryData: modified,
    storyContext: contextParts.join("\n"),
    requestsContinuation,
    continuationContext,
    asksPlayer,
    playerQuestion,
  };
}

// ============================================
// SKILL CHECK EXECUTOR
// ============================================

function executeSkillCheck(
  toolCallId: string,
  params: SkillCheckParams,
  storyData: StoryData
): GMToolResult {
  const systemId = (storyData.rpgSystem || "3d6") as RPGSystemType;
  const system = getRPGSystem(systemId);
  const { dc, tierName } = parseDifficulty(params.difficulty, system);

  // Find stat
  const statMatch = findStatMatch(params.stat, storyData.stats || []);
  const statValue = statMatch?.item?.value ?? 0;
  const statName = statMatch?.item?.name ?? params.stat;

  // Find item if specified
  let itemResult: GMCheckResult["item"] | undefined;
  let itemBonus = 0;
  if (params.item) {
    const itemMatch = findItemMatch(params.item, storyData.inventory || []);
    if (itemMatch) {
      const item = itemMatch.item as unknown as InventoryItem;
      itemResult = { name: item.name, used: true };
      itemBonus = getItemBonus(item, systemId);

      // Mark consumable items
      if (item.type === "consumable") {
        itemResult.consumed = true;
      }
    }
  }

  // Find ability if specified
  let abilityResult: GMCheckResult["ability"] | undefined;
  let abilityBonus = 0;
  if (params.ability) {
    const abilityMatch = findAbilityMatch(
      params.ability,
      storyData.abilities || []
    );
    if (abilityMatch) {
      const ability = abilityMatch.item as unknown as Ability;
      abilityResult = { name: ability.name, used: true };
      abilityBonus = getAbilityBonus(ability, systemId);
      abilityResult.costPaid = true; // Cost deduction handled by tools stage
    }
  }

  // Check resource if specified
  let resourceResult: GMCheckResult["resource"] | undefined;
  let resourcePenalty = 0;
  if (params.resource) {
    const resMatch = findResourceMatch(
      params.resource.name,
      storyData.resources || []
    );
    if (resMatch) {
      const resource = resMatch.item;
      const had = resource.value;
      const required = params.resource.amount;
      resourceResult = {
        name: resource.name,
        required,
        had,
      };
      if (had < required) {
        // Insufficient resource = penalty
        resourcePenalty = Math.max(5, Math.floor(dc / 10));
        resourceResult.penalty = resourcePenalty;
      }
    }
  }

  // Calculate condition penalty
  let conditionResult: GMCheckResult["condition"] | undefined;
  const condPenalty = calculateConditionPenalty(
    storyData.conditions || [],
    statName,
    systemId
  );
  if (condPenalty.penalty !== 0 && condPenalty.condition) {
    conditionResult = {
      name: condPenalty.condition.name,
      tier: condPenalty.condition.tier,
      penalty: condPenalty.penalty,
    };
  }

  // Calculate modifier
  let modifierResult: GMCheckResult["modifier"] | undefined;
  if (params.modifier) {
    modifierResult = {
      value: params.modifier,
      reason: params.modifier_reason || "situational",
    };
  }

  // Roll dice
  const rollResult = rollDice(system);
  const roll = rollResult.total;

  // Calculate total
  const total =
    statValue +
    roll +
    itemBonus +
    abilityBonus +
    (params.modifier || 0) -
    resourcePenalty -
    (condPenalty.penalty || 0);

  // Check success
  const successResult = checkSuccess(
    system,
    roll,
    statValue,
    dc,
    condPenalty.penalty,
    rollResult.rolls
  );
  const success = successResult.success;
  const partialSuccess = successResult.partial || false;
  const criticalSuccess = successResult.critical && success;
  const criticalFailure = successResult.critical && !success;
  const margin = total - dc;

  // Build context string for story stage
  let contextForStory = `[${statName} Check: ${
    success ? (partialSuccess ? "PARTIAL SUCCESS" : "SUCCESS") : "FAILURE"
  }`;
  contextForStory += ` | Roll: ${roll} + ${statValue} (stat)`;
  if (itemBonus > 0) contextForStory += ` + ${itemBonus} (${itemResult?.name})`;
  if (abilityBonus > 0)
    contextForStory += ` + ${abilityBonus} (${abilityResult?.name})`;
  if (params.modifier)
    contextForStory += ` + ${params.modifier} (${
      params.modifier_reason || "modifier"
    })`;
  if (resourcePenalty > 0)
    contextForStory += ` - ${resourcePenalty} (low ${resourceResult?.name})`;
  if (condPenalty.penalty > 0)
    contextForStory += ` - ${condPenalty.penalty} (${conditionResult?.name})`;
  contextForStory += ` = ${total} vs DC ${dc} (${tierName})]`;

  if (params.stakes) {
    contextForStory += `\n[Stakes: ${params.stakes}]`;
  }

  if (params.consequences) {
    const outcome = success
      ? partialSuccess
        ? params.consequences.partial
        : params.consequences.success
      : params.consequences.failure;
    if (outcome) {
      contextForStory += `\n[Intended consequence: ${outcome}]`;
    }
  }

  return {
    toolName: "skill_check",
    toolCallId,
    success,
    result: {
      type: "skill_check",
      stat: statName,
      statValue,
      difficulty: tierName,
      dc,
      roll,
      rolls: rollResult.rolls, // Individual dice values for visualizer
      explosions: rollResult.explosions, // For explosive dice system
      total,
      success,
      partialSuccess,
      criticalSuccess,
      criticalFailure,
      margin,
      item: itemResult,
      ability: abilityResult,
      resource: resourceResult,
      condition: conditionResult,
      modifier: modifierResult,
      stakes: params.stakes,
      consequences: params.consequences,
    } as GMCheckResult,
    contextForStory,
  };
}

// ============================================
// CHALLENGE CHECK EXECUTOR
// ============================================

function executeChallengeCheck(
  toolCallId: string,
  params: ChallengeCheckParams,
  storyData: StoryData
): GMToolResult {
  const challenge = storyData.activeChallenge;
  if (!challenge) {
    return {
      toolName: "challenge_check",
      toolCallId,
      success: false,
      result: {
        type: "challenge_check",
        stat: params.stat || "unknown",
        statValue: 0,
        difficulty: "unknown",
        dc: 0,
        roll: 0,
        total: 0,
        success: false,
      } as GMCheckResult,
      contextForStory: "[ERROR: No active challenge to make a check for]",
    };
  }

  // Use default stat from challenge name context or override
  const stat = params.stat || "default";
  const difficulty = params.difficulty || "average";

  // Delegate to skill check with challenge context
  const skillCheckParams: SkillCheckParams = {
    stat,
    difficulty,
    reason: params.description,
    item: params.item,
    ability: params.ability,
    modifier: params.modifier,
    modifier_reason: params.modifier_reason,
    consequences: params.consequences,
  };

  const skillResult = executeSkillCheck(
    toolCallId,
    skillCheckParams,
    storyData
  );
  const checkResult = skillResult.result as GMCheckResult;

  // Update challenge progress
  if (checkResult.success) {
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

  // Add challenge progress to result
  checkResult.type = "challenge_check";
  checkResult.challengeProgress = {
    name: challenge.name,
    successes: challenge.currentSuccesses,
    failures: challenge.currentFailures,
    required: requiredToWin,
    maxFailures: requiredToWin,
    completed,
    won,
  };

  // Update context string
  let contextForStory = skillResult.contextForStory;
  contextForStory += `\n[Challenge "${challenge.name}": ${challenge.currentSuccesses}/${requiredToWin} successes, ${challenge.currentFailures}/${requiredToWin} failures]`;
  if (completed) {
    contextForStory += `\n[Challenge ${won ? "WON" : "LOST"}!]`;
  }

  return {
    ...skillResult,
    toolName: "challenge_check",
    result: checkResult,
    contextForStory,
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
// OPPOSED CHECK EXECUTOR
// ============================================

function executeOpposedCheck(
  toolCallId: string,
  params: OpposedCheckParams,
  storyData: StoryData
): GMToolResult {
  const systemId = (storyData.rpgSystem || "3d6") as RPGSystemType;
  const system = getRPGSystem(systemId);

  // Find player stat
  const statMatch = findStatMatch(params.player_stat, storyData.stats || []);
  const playerStatValue = statMatch?.item?.value ?? 0;
  const playerStatName = statMatch?.item?.name ?? params.player_stat;

  // Find item if specified
  let itemResult: GMOpposedResult["item"] | undefined;
  let itemBonus = 0;
  if (params.player_item) {
    const itemMatch = findItemMatch(
      params.player_item,
      storyData.inventory || []
    );
    if (itemMatch) {
      const item = itemMatch.item as unknown as InventoryItem;
      itemResult = { name: item.name, used: true };
      itemBonus = getItemBonus(item, systemId);
    }
  }

  // Find ability if specified
  let abilityResult: GMOpposedResult["ability"] | undefined;
  let abilityBonus = 0;
  if (params.player_ability) {
    const abilityMatch = findAbilityMatch(
      params.player_ability,
      storyData.abilities || []
    );
    if (abilityMatch) {
      const ability = abilityMatch.item as unknown as Ability;
      abilityResult = { name: ability.name, used: true };
      abilityBonus = getAbilityBonus(ability, systemId);
    }
  }

  // Calculate condition penalty
  const condPenalty = calculateConditionPenalty(
    storyData.conditions || [],
    playerStatName,
    systemId
  );

  // Roll for player
  const playerRollResult = rollDice(system);
  const playerRoll = playerRollResult.total;
  const playerTotal =
    playerStatValue +
    playerRoll +
    itemBonus +
    abilityBonus +
    (params.player_modifier || 0) -
    (condPenalty.penalty || 0);

  // Roll for opponent
  const opponentRollResult = rollDice(system);
  const opponentRoll = opponentRollResult.total;
  const opponentTotal =
    params.opponent_skill + opponentRoll + (params.opponent_modifier || 0);

  // Determine winner
  let winner: "player" | "opponent" | "tie";
  const margin = playerTotal - opponentTotal;
  if (margin > 0) {
    winner = "player";
  } else if (margin < 0) {
    winner = "opponent";
  } else {
    winner = "tie";
  }

  // Build context string
  let contextForStory = `[Opposed Check: ${playerStatName} vs ${params.opponent_name}]`;
  contextForStory += `\n[Player: ${playerRoll} + ${playerStatValue} (stat)`;
  if (itemBonus > 0) contextForStory += ` + ${itemBonus} (${itemResult?.name})`;
  if (abilityBonus > 0)
    contextForStory += ` + ${abilityBonus} (${abilityResult?.name})`;
  if (params.player_modifier) contextForStory += ` + ${params.player_modifier}`;
  if (condPenalty.penalty > 0)
    contextForStory += ` - ${condPenalty.penalty} (condition)`;
  contextForStory += ` = ${playerTotal}]`;
  contextForStory += `\n[${params.opponent_name}: ${opponentRoll} + ${params.opponent_skill}`;
  if (params.opponent_modifier)
    contextForStory += ` + ${params.opponent_modifier}`;
  contextForStory += ` = ${opponentTotal}]`;
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
    toolName: "opposed_check",
    toolCallId,
    success: winner === "player",
    result: {
      type: "opposed_check",
      playerStat: playerStatName,
      playerStatValue,
      playerRoll,
      playerTotal,
      opponentName: params.opponent_name,
      opponentSkill: params.opponent_skill,
      opponentRoll,
      opponentTotal,
      winner,
      margin: Math.abs(margin),
      item: itemResult,
      ability: abilityResult,
      stakes: params.stakes,
      consequences: params.consequences,
    } as GMOpposedResult,
    contextForStory,
  };
}

// ============================================
// ROLL DICE EXECUTOR
// ============================================

function executeRollDice(
  toolCallId: string,
  params: RollDiceParams
): GMToolResult {
  // Parse dice notation: "2d6+5", "1d20-3", "3d8"
  const diceRegex = /^(\d+)d(\d+)([+-]\d+)?$/i;
  const match = params.dice.match(diceRegex);

  if (!match) {
    return {
      toolName: "roll_dice",
      toolCallId,
      success: false,
      result: {
        type: "roll_dice",
        dice: params.dice,
        rolls: [],
        modifier: 0,
        total: 0,
        reason: params.reason,
        displayName: params.display_name,
      } as GMRollResult,
      contextForStory: `[ERROR: Invalid dice notation "${params.dice}"]`,
    };
  }

  const numDice = parseInt(match[1], 10);
  const dieSize = parseInt(match[2], 10);
  const modifier = match[3] ? parseInt(match[3], 10) : 0;

  // Roll dice
  const rolls: number[] = [];
  for (let i = 0; i < numDice; i++) {
    rolls.push(Math.floor(Math.random() * dieSize) + 1);
  }

  const rollSum = rolls.reduce((a, b) => a + b, 0);
  const total = rollSum + modifier;

  const displayName = params.display_name || "Dice Roll";
  let contextForStory = `[${displayName}: ${params.dice} = [${rolls.join(
    ", "
  )}]`;
  if (modifier !== 0) {
    contextForStory += ` ${modifier > 0 ? "+" : ""}${modifier}`;
  }
  contextForStory += ` = ${total}]`;
  contextForStory += `\n[Reason: ${params.reason}]`;

  return {
    toolName: "roll_dice",
    toolCallId,
    success: true,
    result: {
      type: "roll_dice",
      dice: params.dice,
      rolls,
      modifier,
      total,
      reason: params.reason,
      displayName: params.display_name,
    } as GMRollResult,
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
// NO CHECK NEEDED EXECUTOR
// ============================================

function executeNoCheckNeeded(
  toolCallId: string,
  params: NoCheckNeededParams
): GMToolResult {
  let contextForStory = `[No check needed: ${params.reason}]`;
  if (params.outcome) {
    contextForStory += `\n[Outcome: ${params.outcome}]`;
  }

  return {
    toolName: "no_check_needed",
    toolCallId,
    success: true,
    result: {
      type: "no_check_needed",
      reason: params.reason,
      outcome: params.outcome,
    } as GMNoCheckResult,
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
 * Build a variable resolver from story data
 * Prioritizes characterData (new schema system) but falls back to stats
 */
function buildResolver(
  storyData: StoryData
): (name: string) => number | undefined {
  // If we have characterData from the new schema system, use it
  if (storyData.characterData) {
    // CharacterData has a .values property that contains the actual field values
    const values = storyData.characterData.values || storyData.characterData;
    return createSchemaBasedResolver(values as Record<string, unknown>);
  }

  // Fallback: build resolver from stats array (legacy system)
  const statMap: Record<string, number> = {};
  for (const stat of storyData.stats || []) {
    statMap[stat.name] = stat.value;
    // Also add common variations
    statMap[stat.name.toLowerCase()] = stat.value;
    statMap[stat.name.toUpperCase()] = stat.value;
  }

  return (name: string) => {
    return statMap[name] ?? statMap[name.toLowerCase()];
  };
}

/**
 * Execute a formula roll with optional DC check
 */
function executeFormulaRoll(
  toolCallId: string,
  params: FormulaRollParams,
  storyData: StoryData
): GMToolResult {
  const resolver = buildResolver(storyData);

  // Roll the formula
  let rollResult: RollResult;
  try {
    rollResult = rollFormula(params.formula, resolver);
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
  if (params.dc !== undefined) {
    success = rollResult.total >= params.dc;
    margin = rollResult.total - params.dc;
  }

  // Build context string
  const displayName = params.display_name || "Formula Roll";
  let contextForStory = `[${displayName}: ${params.formula}`;
  if (resolvedFormula !== params.formula) {
    contextForStory += ` → ${resolvedFormula}`;
  }
  contextForStory += ` = ${rollResult.total}`;
  if (params.dc !== undefined) {
    contextForStory += ` vs DC ${params.dc} → ${
      success ? "SUCCESS" : "FAILURE"
    }`;
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
      success,
      margin,
      reason: params.reason,
      displayName: params.display_name,
      stakes: params.stakes,
      consequences: params.consequences,
      breakdown: rollResult.breakdown,
    } as GMFormulaRollResult,
    contextForStory,
  };
}

/**
 * Execute an opposed formula roll
 */
function executeOpposedFormula(
  toolCallId: string,
  params: OpposedFormulaParams,
  storyData: StoryData
): GMToolResult {
  const resolver = buildResolver(storyData);

  // Roll player's formula
  let playerResult: RollResult;
  try {
    playerResult = rollFormula(params.player_formula, resolver);
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

  // Roll opponent's formula (opponent formulas usually don't have variables)
  let opponentResult: RollResult;
  try {
    opponentResult = rollFormula(params.opponent_formula, () => undefined);
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

  const resolver = buildResolver(storyData);

  // Roll the formula
  let rollResult: RollResult;
  try {
    rollResult = rollFormula(params.formula, resolver);
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
 * Execute a roll on a custom table
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

  // Use customTables from storyData
  const allTables = storyData.customTables || [];

  // Find the table
  const table = getTableByName(allTables, params.table_name);

  if (!table) {
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

  // Roll on the table
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

/**
 * Execute a request for continuation (another GM round)
 */
function executeRequestContinuation(
  toolCallId: string,
  params: RequestContinuationParams
): GMToolResult {
  // Build context string
  let contextForStory = `[GM Continuation Requested]`;
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
  let contextForStory = `[GM Question for Player]`;
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
