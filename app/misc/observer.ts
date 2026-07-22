/**
 * Layer 5 hardening, active variant (see docs/five-layer-architecture-changelog.md
 * and docs/architecture-frontier.md's "adjudication" layer).
 *
 * checkNarrationConsistency (consistencyCheck.ts) is diagnostic-only: it runs
 * after narration has already streamed to the player and just records a
 * warning. This module is the active counterpart - it reviews a completed GM
 * turn for violations of rules the GM was already given, and a "major" flag
 * can trigger generateStoryTurn (generation.ts) to roll StoryData back to its
 * pre-turn snapshot and force a fresh attempt, telling the GM exactly what it
 * was flagged for. Same fail-open posture as the M2 roll-invariant gate
 * (reasoningTiers.ts/generation.ts): never block play indefinitely.
 *
 * Five checks, two severities:
 *
 * Major (can trigger generateStoryTurn's reset-and-retry):
 * - checkResponseLength: deterministic, free. Catches a single turn blowing
 *   way past the Reply Length setting's ceiling. pacingFeedback.ts already
 *   nudges based on a trailing 3-turn average; this catches one egregious
 *   turn on the spot instead of waiting for the average to drift.
 * - checkPlayerAgencyViolation: an LLM call that judges whether the GM
 *   decided/narrated what the player character says, thinks, or does beyond
 *   what the player declared - the "PLAYER AGENCY (NON-NEGOTIABLE)" rule
 *   already in ai_staged.ts's GM system prompt.
 * - checkOutcomeMismatch: an LLM call that judges whether the finished
 *   narration contradicts the mechanical result (SUCCESS/FAILURE) of the
 *   last roll/check made this turn. The roll result is ground truth - this
 *   is the same "LLM proposes, deterministic engine disposes" thesis the
 *   whole app is built on, just checked directly for the first time.
 *
 * Minor (log-only, surfaced as a warning, never triggers a reset - neither
 * rule below was ever stated to the GM as a hard requirement the way
 * PLAYER AGENCY was, so treating a miss as reset-worthy would be too
 * aggressive for what's really a best-practice nudge):
 * - checkToolUsageGaps: an LLM call that judges whether the turn invented an
 *   uncertain outcome instead of consulting fate_question/roll_table, or
 *   narrated a scene transition without calling increment_scene.
 *
 * All LLM-backed checks use the same fetch("/api/generate") pattern as
 * reflection.ts's callReflectionApi - non-streaming, caller-supplied model,
 * fails open (no flag) on any API error. Regex can't reliably judge any of
 * these; they need actual reading comprehension.
 */

import { ObserverFlag } from "./structs";
import { ReplyLength } from "./ai_staged";
import { PACING_BANDS, countNarrationWords } from "./pacingFeedback";
import { getCustomModelIfUUID } from "./user_settings";

// A single turn has to run at least this multiple of the trailing-average
// "high" band before it's flagged as a standalone blowout, not just a
// legitimately long climax beat.
const SINGLE_TURN_OVERAGE_MULTIPLIER = 2;

export function checkResponseLength(
  narration: string,
  replyLength: ReplyLength = "medium",
): ObserverFlag | null {
  const words = countNarrationWords(narration);
  if (words === 0) return null;

  const band = PACING_BANDS[replyLength] ?? PACING_BANDS.medium;
  const ceiling = band.high * SINGLE_TURN_OVERAGE_MULTIPLIER;
  if (words <= ceiling) return null;

  return {
    type: "response_length",
    severity: "major",
    detail: `This turn ran ${words} words, well past the "${replyLength}" reply-length setting's usual ceiling (~${band.high} words).`,
    correctivePrompt: `Your previous attempt at this turn was reset because it was far too long for the "${replyLength}" reply-length setting (${words} words, vs. a usual ceiling of ~${band.high}). Rewrite this turn much shorter - state the outcome and stop, per the LENGTH & PACING rules you were already given.`,
  };
}

export interface ObserverApiOptions {
  model: string;
  token: string | null;
  openRouterKey?: string;
  deepseekKey?: string;
  googleKey?: string;
  mistralKey?: string;
  deepinfraKey?: string;
  abortSignal?: AbortSignal;
}

/** Strips a ```json ... ``` fence if present and parses the first {...} block. */
function extractJsonObject(content: string): Record<string, unknown> | null {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : content;
  const braceMatch = candidate.match(/\{[\s\S]*\}/);
  if (!braceMatch) return null;

  try {
    const parsed = JSON.parse(braceMatch[0]);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

interface AgencyCheckResult {
  violation: boolean;
  severity: "minor" | "major";
  reason: string;
}

function extractAgencyCheckJson(content: string): AgencyCheckResult | null {
  const parsed = extractJsonObject(content);
  if (!parsed || typeof parsed.violation !== "boolean") return null;
  return {
    violation: parsed.violation,
    severity: parsed.severity === "major" ? "major" : "minor",
    reason: typeof parsed.reason === "string" ? parsed.reason.trim() : "",
  };
}

async function callAgencyCheckApi(
  playerChoice: string,
  narration: string,
  apiOptions: ObserverApiOptions,
): Promise<AgencyCheckResult | null> {
  const system = `You are a strict but fair reviewer for a tabletop-style interactive fiction game. The Game Master AI you're reviewing was given this non-negotiable rule:

"NEVER decide what the player character says, thinks, feels, or does next. You resolve outcomes for the action they already declared - you don't invent their next action."

Given the player's declared action and the GM's narration written in response, decide whether the GM violated this rule by putting new dialogue, thoughts, feelings, or actions into the player character that the player didn't declare. Resolving the CONSEQUENCES of the player's stated action (what happens around them, how NPCs react, dice outcomes) is fine and expected - that is not a violation.

Respond with ONLY a JSON object, no other text:
{"violation": true|false, "severity": "minor"|"major", "reason": "<one sentence, empty string if no violation>"}

"major" = the GM clearly wrote new dialogue, a new decision, or a new action for the player character that the player never declared. "minor" = borderline/ambiguous phrasing that leans that way but could reasonably be read as just narrating the player's own stated action.`;

  const user = `Player's declared action:\n"""\n${playerChoice.trim() || "(none - opening scene)"}\n"""\n\nGM's narration in response:\n"""\n${narration.trim()}\n"""`;

  try {
    const response = await fetch("/api/generate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiOptions.token}`,
      },
      body: JSON.stringify({
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        model: apiOptions.model,
        maxTokens: 200,
        temperature: 0,
        openRouterKey: apiOptions.openRouterKey,
        deepseekKey: apiOptions.deepseekKey,
        googleKey: apiOptions.googleKey,
        mistralKey: apiOptions.mistralKey,
        deepinfraKey: apiOptions.deepinfraKey,
        customModel: getCustomModelIfUUID(apiOptions.model),
      }),
      signal: apiOptions.abortSignal,
    });

    if (!response.ok) return null;

    const data = await response.json();
    const content = (data.content || "").trim();
    if (!content) return null;

    return extractAgencyCheckJson(content);
  } catch {
    return null;
  }
}

export async function checkPlayerAgencyViolation(
  playerChoice: string,
  narration: string,
  apiOptions: ObserverApiOptions,
): Promise<ObserverFlag | null> {
  if (!narration.trim()) return null;

  const result = await callAgencyCheckApi(playerChoice, narration, apiOptions);
  if (!result || !result.violation) return null;

  const reason =
    result.reason || "The GM appeared to speak or act for the player character.";

  return {
    type: "player_agency",
    severity: result.severity,
    detail: reason,
    correctivePrompt: `Your previous attempt at this turn was reset because it violated the PLAYER AGENCY rule you were already given ("Never decide what the player character says, thinks, feels, or does next"): ${reason} Rewrite this turn so you resolve the outcome of the player's declared action without inventing anything further the player character says, thinks, or does.`,
  };
}

// Rolls whose outer `success` is a genuine pass/fail verdict worth checking
// narration against. fate_question is deliberately excluded - its answer is
// a four-way oracle response (Yes/No/Exceptional), not a SUCCESS/FAILURE
// check, and doesn't map onto this same "did narration agree" question.
const OUTCOME_CHECK_TOOL_NAMES = new Set([
  "formula_roll",
  "opposed_formula",
  "formula_challenge_check",
  "npc_roll",
]);

export interface RollOutcomeForCheck {
  toolName: string;
  success: boolean;
  contextForStory: string;
}

interface OutcomeMismatchResult {
  mismatch: boolean;
  reason: string;
}

function extractOutcomeMismatchJson(content: string): OutcomeMismatchResult | null {
  const parsed = extractJsonObject(content);
  if (!parsed || typeof parsed.mismatch !== "boolean") return null;
  return {
    mismatch: parsed.mismatch,
    reason: typeof parsed.reason === "string" ? parsed.reason.trim() : "",
  };
}

async function callOutcomeMismatchApi(
  narration: string,
  roll: RollOutcomeForCheck,
  apiOptions: ObserverApiOptions,
): Promise<OutcomeMismatchResult | null> {
  const system = `You are a strict reviewer for a tabletop-style interactive fiction game. A dice roll or check was just mechanically resolved with a specific result, shown below - that result is ground truth and cannot be overridden by narration. Your only job is to check whether the GM's narration agrees with it.

Given the mechanical result and the GM's narration that followed it, judge: does the narration directly contradict the mechanical result (e.g. the roll was a FAILURE but the narration describes clear, unqualified success, or vice versa)? A narration that adds partial success, complications, or a costly/Pyrrhic outcome on top of the correct pass/fail result is NOT a contradiction - only flag a direct reversal of the result itself.

Respond with ONLY a JSON object, no other text:
{"mismatch": true|false, "reason": "<one sentence, empty string if no mismatch>"}`;

  const user = `Mechanical result: ${roll.success ? "SUCCESS" : "FAILURE"}\n${roll.contextForStory}\n\nGM's narration:\n"""\n${narration.trim()}\n"""`;

  try {
    const response = await fetch("/api/generate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiOptions.token}`,
      },
      body: JSON.stringify({
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        model: apiOptions.model,
        maxTokens: 200,
        temperature: 0,
        openRouterKey: apiOptions.openRouterKey,
        deepseekKey: apiOptions.deepseekKey,
        googleKey: apiOptions.googleKey,
        mistralKey: apiOptions.mistralKey,
        deepinfraKey: apiOptions.deepinfraKey,
        customModel: getCustomModelIfUUID(apiOptions.model),
      }),
      signal: apiOptions.abortSignal,
    });

    if (!response.ok) return null;

    const data = await response.json();
    const content = (data.content || "").trim();
    if (!content) return null;

    return extractOutcomeMismatchJson(content);
  } catch {
    return null;
  }
}

/**
 * Checks whether the finished narration contradicts the mechanical result of
 * the last roll/check made this turn. Only the LAST relevant roll is
 * checked - it's the one this turn's final narration is actually resolving;
 * earlier rolls in a multi-round turn were already resolved by intermediate
 * context the model saw before writing this narration. "major" severity:
 * unlike the tool-usage gaps below, a roll's result being ground truth the
 * model can't override is the core "LLM proposes, deterministic engine
 * disposes" thesis this whole app is built on, not a soft best-practice.
 */
export async function checkOutcomeMismatch(
  narration: string,
  rollResults: RollOutcomeForCheck[],
  apiOptions: ObserverApiOptions,
): Promise<ObserverFlag | null> {
  if (!narration.trim()) return null;

  const relevantRolls = rollResults.filter((r) =>
    OUTCOME_CHECK_TOOL_NAMES.has(r.toolName),
  );
  if (relevantRolls.length === 0) return null;
  const lastRoll = relevantRolls[relevantRolls.length - 1];

  const result = await callOutcomeMismatchApi(narration, lastRoll, apiOptions);
  if (!result || !result.mismatch) return null;

  const outcomeLabel = lastRoll.success ? "SUCCESS" : "FAILURE";
  const reason =
    result.reason ||
    `The mechanical result was ${outcomeLabel}, but the narration says otherwise.`;

  return {
    type: "outcome_narration_mismatch",
    severity: "major",
    detail: reason,
    correctivePrompt: `Your previous attempt at this turn was reset because the narration didn't match the roll's mechanical result (${outcomeLabel}): ${reason} Rewrite the narration so it agrees with what the roll actually determined - the roll result is ground truth and narration cannot override it.`,
  };
}

// The two tool names that count as "consulted the oracle/a table" - either
// one is enough, they serve the same purpose (letting randomness rather
// than narrative convenience decide an uncertain outcome).
const ORACLE_OR_TABLE_TOOL_NAMES = new Set(["fate_question", "roll_table"]);

interface ToolUsageJudgment {
  missedOracleOrTable: boolean;
  oracleReason: string;
  missedSceneIncrement: boolean;
  sceneReason: string;
}

function extractToolUsageJson(content: string): ToolUsageJudgment | null {
  const parsed = extractJsonObject(content);
  if (!parsed) return null;
  return {
    missedOracleOrTable: parsed.missed_oracle_or_table === true,
    oracleReason:
      typeof parsed.oracle_reason === "string" ? parsed.oracle_reason.trim() : "",
    missedSceneIncrement: parsed.missed_scene_increment === true,
    sceneReason:
      typeof parsed.scene_reason === "string" ? parsed.scene_reason.trim() : "",
  };
}

async function callToolUsageApi(
  narration: string,
  askAboutOracle: boolean,
  askAboutScene: boolean,
  apiOptions: ObserverApiOptions,
): Promise<ToolUsageJudgment | null> {
  const system = `You are a strict but fair reviewer for a tabletop-style interactive fiction game. Two of the Game Master AI's mechanics are relevant here:
${
  askAboutOracle
    ? `1. THE ORACLE: for a genuinely uncertain in-world question the GM doesn't already know the answer to (e.g. "is the door locked?", "did the guard notice?"), or for random flavor content, the GM is supposed to consult a fate_question oracle roll or roll_table - not just invent an answer for narrative convenience.\n`
    : ""
}${
  askAboutScene
    ? `${askAboutOracle ? "2" : "1"}. SCENE TRANSITIONS: when the narration moves to a clearly new scene (a new location, a time skip like "the next morning" or "hours later", a new chapter), the GM is supposed to call increment_scene to run the scene-pacing system - not just narrate the transition directly.\n`
    : ""
}
Given the GM's narration below, judge only the question(s) above. Respond with ONLY a JSON object, no other text:
{${askAboutOracle ? `"missed_oracle_or_table": true|false, "oracle_reason": "<one sentence, empty string if not applicable>", ` : ""}${askAboutScene ? `"missed_scene_increment": true|false, "scene_reason": "<one sentence, empty string if not applicable>"` : ""}}`;

  const user = `GM's narration:\n"""\n${narration.trim()}\n"""`;

  try {
    const response = await fetch("/api/generate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiOptions.token}`,
      },
      body: JSON.stringify({
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        model: apiOptions.model,
        maxTokens: 200,
        temperature: 0,
        openRouterKey: apiOptions.openRouterKey,
        deepseekKey: apiOptions.deepseekKey,
        googleKey: apiOptions.googleKey,
        mistralKey: apiOptions.mistralKey,
        deepinfraKey: apiOptions.deepinfraKey,
        customModel: getCustomModelIfUUID(apiOptions.model),
      }),
      signal: apiOptions.abortSignal,
    });

    if (!response.ok) return null;

    const data = await response.json();
    const content = (data.content || "").trim();
    if (!content) return null;

    return extractToolUsageJson(content);
  } catch {
    return null;
  }
}

/**
 * Checks for two tool-usage gaps, in a single LLM call: an uncertain
 * outcome or random flavor decided by narration instead of fate_question/
 * roll_table, and a narrated scene transition that never called
 * increment_scene. Both are advisory (minor severity, log-only - neither
 * rule was ever stated to the GM as a hard requirement the way PLAYER
 * AGENCY was, so a violation here shouldn't trigger the same reset-and-
 * retry response). Deterministically skips whichever half was already
 * satisfied this turn, and skips the whole call if both were.
 */
export async function checkToolUsageGaps(
  narration: string,
  toolNames: string[],
  apiOptions: ObserverApiOptions,
): Promise<ObserverFlag[]> {
  if (!narration.trim()) return [];

  const usedOracleOrTable = toolNames.some((name) =>
    ORACLE_OR_TABLE_TOOL_NAMES.has(name),
  );
  const usedSceneIncrement = toolNames.includes("increment_scene");

  const askAboutOracle = !usedOracleOrTable;
  const askAboutScene = !usedSceneIncrement;
  if (!askAboutOracle && !askAboutScene) return [];

  const judgment = await callToolUsageApi(
    narration,
    askAboutOracle,
    askAboutScene,
    apiOptions,
  );
  if (!judgment) return [];

  const flags: ObserverFlag[] = [];

  if (askAboutOracle && judgment.missedOracleOrTable) {
    const reason =
      judgment.oracleReason ||
      "This turn may have invented an uncertain outcome instead of consulting the oracle or a table.";
    flags.push({
      type: "missing_oracle_or_table",
      severity: "minor",
      detail: reason,
      correctivePrompt: `Consider using fate_question (for uncertain yes/no world questions) or roll_table (for random flavor) instead of deciding an outcome narratively: ${reason}`,
    });
  }

  if (askAboutScene && judgment.missedSceneIncrement) {
    const reason =
      judgment.sceneReason ||
      "This turn may have narrated a scene transition without calling increment_scene.";
    flags.push({
      type: "missing_scene_increment",
      severity: "minor",
      detail: reason,
      correctivePrompt: `This turn narrated a scene transition without calling increment_scene: ${reason} Call increment_scene when the narration moves to a clearly new scene (new location, time skip).`,
    });
  }

  return flags;
}

export interface ObserverParams {
  narration: string;
  playerChoice: string;
  replyLength?: ReplyLength;
  toolNames?: string[];
  rollResults?: RollOutcomeForCheck[];
  apiOptions: ObserverApiOptions;
}

/**
 * Runs all checks for a completed turn. Safe to call every turn - the
 * length check is free, and every LLM-backed check fails open (returns no
 * flag) on any API error rather than blocking the turn on observer infra
 * issues.
 */
export async function runObserver(params: ObserverParams): Promise<ObserverFlag[]> {
  const flags: ObserverFlag[] = [];

  const lengthFlag = checkResponseLength(params.narration, params.replyLength);
  if (lengthFlag) flags.push(lengthFlag);

  const agencyFlag = await checkPlayerAgencyViolation(
    params.playerChoice,
    params.narration,
    params.apiOptions,
  );
  if (agencyFlag) flags.push(agencyFlag);

  const outcomeFlag = await checkOutcomeMismatch(
    params.narration,
    params.rollResults || [],
    params.apiOptions,
  );
  if (outcomeFlag) flags.push(outcomeFlag);

  const toolUsageFlags = await checkToolUsageGaps(
    params.narration,
    params.toolNames || [],
    params.apiOptions,
  );
  flags.push(...toolUsageFlags);

  return flags;
}
