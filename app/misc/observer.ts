/**
 * Layer 5 hardening, active variant (see docs/five-layer-architecture-changelog.md
 * and docs/architecture-frontier.md's "adjudication" layer).
 *
 * checkNarrationConsistency (consistencyCheck.ts) is diagnostic-only: it runs
 * after narration has already streamed to the player and just records a
 * warning. This module is the active counterpart - it reviews a completed GM
 * turn for violations of rules the GM was already given, and a "major" flag
 * can trigger generateStoryTurn (generation.ts) to call
 * rewriteFlaggedNarration below: the GM is shown the exact narration it
 * wrote and the specific reason it was flagged, and rewrites just the prose
 * - dice rolls/tool calls/state changes are left untouched, since every
 * major-eligible check here is a complaint about the narration text alone.
 * Only if that rewrite call itself fails does generateStoryTurn fall back to
 * rolling StoryData back to its pre-turn snapshot and forcing a completely
 * fresh, blind attempt. Same fail-open posture as the M2 roll-invariant gate
 * (reasoningTiers.ts/generation.ts): never block play indefinitely.
 *
 * Five checks, two severities:
 *
 * Major (can trigger generateStoryTurn's rewrite-or-reset correction):
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
 * Minor by default (log-only, surfaced as a warning - see below on how that
 * default can be changed):
 * - checkToolUsageGaps: an LLM call that judges whether the turn invented an
 *   uncertain outcome instead of consulting fate_question/roll_table, or
 *   narrated a scene transition without calling increment_scene.
 *
 * All LLM-backed checks use the same fetch("/api/generate") pattern as
 * reflection.ts's callReflectionApi - non-streaming, caller-supplied model,
 * fails open (no flag) on any API error. Regex can't reliably judge any of
 * these; they need actual reading comprehension.
 *
 * Configuration (backend only - no settings UI exists yet, but the plumbing
 * is here for one to read/write later, the same way replyLength etc. flow
 * from localStorage through GenerationOptions): each of the five
 * ObserverFlagTypes has its own independent { enabled, triggersReset,
 * sensitivity } (see ObserverCheckSettings). `enabled` skips the check
 * entirely; `triggersReset` gates whether a "major" instance of that type
 * is ever allowed to reset (independent of the type's own severity logic);
 * `sensitivity` (0-10, default 5) scales how readily each check fires - the
 * overage multiplier for checkResponseLength, a strictness instruction for
 * every LLM-backed check, and (for the two tool-usage-gap checks
 * specifically, which have no severity gradient of their own) whether a hit
 * is reported as "minor" or "major" in the first place.
 * DEFAULT_OBSERVER_SETTINGS reproduces exactly what shipped before this
 * config existed.
 */

import { ObserverFlag, ObserverFlagType } from "./structs";
import { ReplyLength, getLengthGuidance } from "./ai_staged";
import { PACING_BANDS, countNarrationWords } from "./pacingFeedback";
import { getCustomModelIfUUID } from "./user_settings";

// ============================================================
// PER-FLAG-TYPE CONFIGURATION
// ============================================================
// Backend for a future settings UI (not built yet - this just needs to
// exist and be threaded through so a UI can read/write it later, the same
// way replyLength/storytellerMode/etc. already flow from localStorage
// through GenerationOptions). Each of the five ObserverFlagTypes gets its
// own independent { enabled, triggersReset, sensitivity } - "which flags
// call for a reset, and how sensitive each one is."

export interface ObserverCheckSettings {
  /** Skip this check entirely (no API call for LLM-backed checks). */
  enabled: boolean;
  /**
   * Whether a "major"-severity instance of this flag type is allowed to
   * trigger generateStoryTurn's reset-and-retry. Independent of `enabled` -
   * a check can stay on (still logged/surfaced to the player) while never
   * being allowed to reset. Independent of severity, too: player_agency and
   * the tool-usage-gap checks decide "major" vs "minor" per-instance (see
   * `sensitivity` below); this only gates whether a "major" verdict is
   * ever acted on.
   */
  triggersReset: boolean;
  /**
   * 0-10, default 5. Meaning depends on the check:
   * - checkResponseLength: scales the single-turn overage multiplier
   *   (higher sensitivity = fires on a smaller overage).
   * - LLM-backed checks: becomes a strictness instruction in the judge
   *   prompt (lenient/balanced/strict), biasing how readily it flags a
   *   violation at all.
   * - checkToolUsageGaps specifically: also raises severity to "major"
   *   (making it reset-eligible if triggersReset is also on) once
   *   sensitivity crosses TOOL_USAGE_MAJOR_SENSITIVITY_THRESHOLD - these
   *   two checks otherwise have no natural major/minor gradient of their
   *   own the way player_agency/outcome_narration_mismatch do.
   */
  sensitivity: number;
}

export type ObserverSettings = Record<ObserverFlagType, ObserverCheckSettings>;

const DEFAULT_CHECK_SETTINGS: ObserverCheckSettings = {
  enabled: true,
  triggersReset: true,
  sensitivity: 5,
};

/**
 * Current shipped behavior, reproduced exactly as the default config:
 * response_length/player_agency/outcome_narration_mismatch can reset (as
 * they always could), the two tool-usage-gap checks stay log-only (as they
 * always were) unless a future UI cranks their sensitivity up.
 */
export const DEFAULT_OBSERVER_SETTINGS: ObserverSettings = {
  response_length: { ...DEFAULT_CHECK_SETTINGS },
  player_agency: { ...DEFAULT_CHECK_SETTINGS },
  outcome_narration_mismatch: { ...DEFAULT_CHECK_SETTINGS },
  missing_oracle_or_table: { ...DEFAULT_CHECK_SETTINGS, triggersReset: false },
  missing_scene_increment: { ...DEFAULT_CHECK_SETTINGS, triggersReset: false },
};

/** Settings for one flag type, falling back to its default for any field a partial/future config omits. */
export function settingsFor(
  settings: ObserverSettings | undefined,
  type: ObserverFlagType,
): ObserverCheckSettings {
  const defaults = DEFAULT_OBSERVER_SETTINGS[type];
  const override = settings?.[type];
  return override ? { ...defaults, ...override } : defaults;
}

function clampSensitivity(sensitivity: number): number {
  return Math.max(0, Math.min(10, sensitivity));
}

// A single turn has to run at least this multiple of the trailing-average
// "high" band before it's flagged as a standalone blowout, not just a
// legitimately long climax beat. Sensitivity 5 (default) reproduces the
// original fixed 2x; 0 is the most lenient (3x), 10 the strictest (1x).
function overageMultiplierForSensitivity(sensitivity: number): number {
  return 3 - (clampSensitivity(sensitivity) / 10) * 2;
}

/** Strictness instruction appended to an LLM-judged check's system prompt. */
function sensitivityInstruction(sensitivity: number): string {
  const s = clampSensitivity(sensitivity);
  if (s <= 2) {
    return "Sensitivity: VERY LENIENT - only flag flagrant, unambiguous violations. Give the benefit of the doubt on anything borderline.";
  }
  if (s <= 4) {
    return "Sensitivity: LENIENT - only flag clear violations. Let ambiguous or borderline cases pass.";
  }
  if (s <= 6) {
    return "Sensitivity: BALANCED - flag clear violations and reasonably confident borderline cases.";
  }
  if (s <= 8) {
    return "Sensitivity: STRICT - flag violations readily, including many borderline or ambiguous cases.";
  }
  return "Sensitivity: VERY STRICT - flag anything that could plausibly be read as a violation, even if ambiguous.";
}

// checkToolUsageGaps has no natural major/minor gradient of its own (unlike
// player_agency's LLM-decided severity, or outcome_narration_mismatch's
// always-major nature) - past this sensitivity, a hit is reported as
// "major" instead of "minor", making it eligible to reset if the type's
// triggersReset is also on.
const TOOL_USAGE_MAJOR_SENSITIVITY_THRESHOLD = 8;

export function checkResponseLength(
  narration: string,
  replyLength: ReplyLength = "medium",
  settings: ObserverCheckSettings = DEFAULT_OBSERVER_SETTINGS.response_length,
): ObserverFlag | null {
  if (!settings.enabled) return null;

  const words = countNarrationWords(narration);
  if (words === 0) return null;

  const band = PACING_BANDS[replyLength] ?? PACING_BANDS.medium;
  const ceiling = band.high * overageMultiplierForSensitivity(settings.sensitivity);
  if (words <= ceiling) return null;

  return {
    type: "response_length",
    severity: "major",
    detail: `This turn ran ${words} words, well past the "${replyLength}" reply-length setting's usual ceiling (~${band.high} words).`,
    correctivePrompt: `Your previous attempt at this turn was reset because it was far too long for the "${replyLength}" reply-length setting (${words} words, vs. a usual ceiling of ~${band.high}). Rewrite this turn much shorter - state the outcome and stop, per the LENGTH & PACING rules you were already given.`,
  };
}

export interface RewriteNarrationParams {
  /** The exact narration text that was flagged - the GM rewrites this, not a fresh attempt. */
  narration: string;
  playerChoice: string;
  /** The turn's already-executed tool/roll results (GMToolResult context strings, joined) - ground truth, unaffected by any check that can trigger a reset. */
  gmStoryContext?: string;
  flag: ObserverFlag;
  replyLength?: ReplyLength;
  storytellerMode?: "narrator" | "dm";
  apiOptions: ObserverApiOptions;
}

/**
 * Layer 5 hardening's answer to "just regenerate and hope for something
 * different": every check that can trigger a reset (checkResponseLength,
 * checkPlayerAgencyViolation, checkOutcomeMismatch) is a complaint about the
 * NARRATION TEXT specifically, never about which tools were called or what
 * a roll resolved to. So instead of discarding the whole turn - dice rolls,
 * tool calls, state changes and all - and re-running the entire GM/story
 * pipeline from scratch (which can reroll dice into a completely different
 * outcome), this shows the GM the exact narration it just wrote plus the
 * specific reason it was flagged, and asks it to rewrite only the prose.
 * The turn's mechanical results (gmStoryContext) are passed through as
 * ground truth the rewrite must stay consistent with, not redone.
 *
 * Returns null (fail open) on any API error or empty response - the caller
 * falls back to the old full-turn reset rather than silently keeping
 * flagged content.
 */
export async function rewriteFlaggedNarration(
  params: RewriteNarrationParams,
): Promise<string | null> {
  const { narration, playerChoice, gmStoryContext, flag, apiOptions } = params;
  const replyLength = params.replyLength || "medium";
  const storytellerMode = params.storytellerMode || "narrator";
  const { paragraphs } = getLengthGuidance(replyLength);
  const band = PACING_BANDS[replyLength] ?? PACING_BANDS.medium;

  const voiceGuidance =
    storytellerMode === "dm"
      ? `Write as a Dungeon Master narrating to the player. You may reference dice results naturally. Use second person ("You swing your sword...").`
      : `Write immersive prose - show, don't tell. No dice results or mechanical language.`;

  const system = `You are the Game Master for a tabletop-style interactive fiction game. You just wrote a turn of narration in response to the player's action, but an automated reviewer flagged it for a specific problem - see below.

Rewrite the narration to fix that exact problem. Keep everything that was already correct (the events, the tone, the outcome) - fix only what's wrong. Any mechanical results given below are ground truth and must not change.

${paragraphs} ${voiceGuidance}

Output ONLY the corrected narration prose - no meta-commentary, no explanation of what you changed, no notes to yourself.`;

  const contextBlock = gmStoryContext?.trim()
    ? `\n\nMechanical results this turn (ground truth, do not contradict):\n"""\n${gmStoryContext.trim()}\n"""`
    : "";

  const user = `Player's declared action:\n"""\n${playerChoice.trim() || "(none - opening scene)"}\n"""${contextBlock}\n\nYour previous narration (FLAGGED - do not repeat this):\n"""\n${narration.trim()}\n"""\n\nWhat was wrong: ${flag.detail}\n\nRewrite the narration now.`;

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
        maxTokens: Math.max(400, Math.ceil(band.high * 3)),
        temperature: 0.7,
        openRouterKey: apiOptions.openRouterKey,
        deepseekKey: apiOptions.deepseekKey,
        googleKey: apiOptions.googleKey,
        mistralKey: apiOptions.mistralKey,
        deepinfraKey: apiOptions.deepinfraKey,
        customModel: getCustomModelIfUUID(apiOptions.model),
        reasoningEffort: apiOptions.reasoningEffort,
      }),
      signal: apiOptions.abortSignal,
    });

    if (!response.ok) return null;

    const data = await response.json();
    const content = (data.content || "").trim();
    return content || null;
  } catch {
    return null;
  }
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
  /** Optional override from layerSettings.ts's observer model/effort override - unset preserves prior behavior of never sending this field. */
  reasoningEffort?: string;
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
  sensitivity: number,
): Promise<AgencyCheckResult | null> {
  const system = `You are a strict but fair reviewer for a tabletop-style interactive fiction game. The Game Master AI you're reviewing was given this non-negotiable rule:

"NEVER decide what the player character says, thinks, feels, or does next. You resolve outcomes for the action they already declared - you don't invent their next action."

Given the player's declared action and the GM's narration written in response, decide whether the GM violated this rule by putting new dialogue, thoughts, feelings, or actions into the player character that the player didn't declare. Resolving the CONSEQUENCES of the player's stated action (what happens around them, how NPCs react, dice outcomes) is fine and expected - that is not a violation.

${sensitivityInstruction(sensitivity)}

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
        reasoningEffort: apiOptions.reasoningEffort,
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
  settings: ObserverCheckSettings = DEFAULT_OBSERVER_SETTINGS.player_agency,
): Promise<ObserverFlag | null> {
  if (!settings.enabled || !narration.trim()) return null;

  const result = await callAgencyCheckApi(
    playerChoice,
    narration,
    apiOptions,
    settings.sensitivity,
  );
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
  sensitivity: number,
): Promise<OutcomeMismatchResult | null> {
  const system = `You are a strict reviewer for a tabletop-style interactive fiction game. A dice roll or check was just mechanically resolved with a specific result, shown below - that result is ground truth and cannot be overridden by narration. Your only job is to check whether the GM's narration agrees with it.

Given the mechanical result and the GM's narration that followed it, judge: does the narration directly contradict the mechanical result (e.g. the roll was a FAILURE but the narration describes clear, unqualified success, or vice versa)? A narration that adds partial success, complications, or a costly/Pyrrhic outcome on top of the correct pass/fail result is NOT a contradiction - only flag a direct reversal of the result itself.

${sensitivityInstruction(sensitivity)}

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
        reasoningEffort: apiOptions.reasoningEffort,
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
  settings: ObserverCheckSettings = DEFAULT_OBSERVER_SETTINGS.outcome_narration_mismatch,
): Promise<ObserverFlag | null> {
  if (!settings.enabled || !narration.trim()) return null;

  const relevantRolls = rollResults.filter((r) =>
    OUTCOME_CHECK_TOOL_NAMES.has(r.toolName),
  );
  if (relevantRolls.length === 0) return null;
  const lastRoll = relevantRolls[relevantRolls.length - 1];

  const result = await callOutcomeMismatchApi(
    narration,
    lastRoll,
    apiOptions,
    settings.sensitivity,
  );
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
  oracleSensitivity: number,
  askAboutScene: boolean,
  sceneSensitivity: number,
  apiOptions: ObserverApiOptions,
): Promise<ToolUsageJudgment | null> {
  const system = `You are a strict but fair reviewer for a tabletop-style interactive fiction game. Two of the Game Master AI's mechanics are relevant here:
${
  askAboutOracle
    ? `1. THE ORACLE: for a genuinely uncertain in-world question the GM doesn't already know the answer to (e.g. "is the door locked?", "did the guard notice?"), or for random flavor content, the GM is supposed to consult a fate_question oracle roll or roll_table - not just invent an answer for narrative convenience. ${sensitivityInstruction(oracleSensitivity)}\n`
    : ""
}${
  askAboutScene
    ? `${askAboutOracle ? "2" : "1"}. SCENE TRANSITIONS: when the narration moves to a clearly new scene (a new location, a time skip like "the next morning" or "hours later", a new chapter), the GM is supposed to call increment_scene to run the scene-pacing system - not just narrate the transition directly. ${sensitivityInstruction(sceneSensitivity)}\n`
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
        reasoningEffort: apiOptions.reasoningEffort,
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
 * increment_scene. Both default to advisory (minor severity, log-only -
 * neither rule was ever stated to the GM as a hard requirement the way
 * PLAYER AGENCY was) - but unlike the other checks, these two have no
 * natural major/minor gradient of their own, so cranking a type's
 * sensitivity past TOOL_USAGE_MAJOR_SENSITIVITY_THRESHOLD is what makes it
 * report "major" (and therefore reset-eligible, if that type's
 * triggersReset is also on). Deterministically skips whichever half is
 * disabled or was already satisfied this turn, and skips the whole call if
 * both were.
 */
export async function checkToolUsageGaps(
  narration: string,
  toolNames: string[],
  apiOptions: ObserverApiOptions,
  oracleSettings: ObserverCheckSettings = DEFAULT_OBSERVER_SETTINGS.missing_oracle_or_table,
  sceneSettings: ObserverCheckSettings = DEFAULT_OBSERVER_SETTINGS.missing_scene_increment,
): Promise<ObserverFlag[]> {
  if (!narration.trim()) return [];

  const usedOracleOrTable = toolNames.some((name) =>
    ORACLE_OR_TABLE_TOOL_NAMES.has(name),
  );
  const usedSceneIncrement = toolNames.includes("increment_scene");

  const askAboutOracle = oracleSettings.enabled && !usedOracleOrTable;
  const askAboutScene = sceneSettings.enabled && !usedSceneIncrement;
  if (!askAboutOracle && !askAboutScene) return [];

  const judgment = await callToolUsageApi(
    narration,
    askAboutOracle,
    oracleSettings.sensitivity,
    askAboutScene,
    sceneSettings.sensitivity,
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
      severity:
        oracleSettings.sensitivity >= TOOL_USAGE_MAJOR_SENSITIVITY_THRESHOLD
          ? "major"
          : "minor",
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
      severity:
        sceneSettings.sensitivity >= TOOL_USAGE_MAJOR_SENSITIVITY_THRESHOLD
          ? "major"
          : "minor",
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
  /** Per-flag-type enable/reset/sensitivity config - defaults to DEFAULT_OBSERVER_SETTINGS (today's shipped behavior) for any type a partial/future config omits. */
  settings?: ObserverSettings;
}

/**
 * Runs all checks for a completed turn. Safe to call every turn - the
 * length check is free, and every LLM-backed check fails open (returns no
 * flag) on any API error rather than blocking the turn on observer infra
 * issues.
 */
export async function runObserver(params: ObserverParams): Promise<ObserverFlag[]> {
  const flags: ObserverFlag[] = [];

  const lengthFlag = checkResponseLength(
    params.narration,
    params.replyLength,
    settingsFor(params.settings, "response_length"),
  );
  if (lengthFlag) flags.push(lengthFlag);

  const agencyFlag = await checkPlayerAgencyViolation(
    params.playerChoice,
    params.narration,
    params.apiOptions,
    settingsFor(params.settings, "player_agency"),
  );
  if (agencyFlag) flags.push(agencyFlag);

  const outcomeFlag = await checkOutcomeMismatch(
    params.narration,
    params.rollResults || [],
    params.apiOptions,
    settingsFor(params.settings, "outcome_narration_mismatch"),
  );
  if (outcomeFlag) flags.push(outcomeFlag);

  const toolUsageFlags = await checkToolUsageGaps(
    params.narration,
    params.toolNames || [],
    params.apiOptions,
    settingsFor(params.settings, "missing_oracle_or_table"),
    settingsFor(params.settings, "missing_scene_increment"),
  );
  flags.push(...toolUsageFlags);

  return flags;
}

/**
 * Builds a next-turn warning from a turn's SURVIVING observer flags - ones
 * that reached the final, accepted result rather than being corrected via a
 * same-turn reset. That covers two cases: minor flags (which never trigger
 * a reset at all) and major flags where the reset budget ran out (fail
 * open). Both cases mean the GM was never actually told what it did wrong -
 * generateStoryTurn's reset-and-retry note only ever reaches the model
 * mid-turn, while it's still trying to fix THIS turn. Without this, a
 * flagged mistake reaches the player (via the ScenePart.observerFlags
 * toast) but silently evaporates for the GM the moment the turn is
 * accepted. Called once per turn, in generation.ts, using the PRIOR turn's
 * surviving flags to warn the GM before it writes the next one.
 */
export function buildObserverWarningNote(
  flags: ObserverFlag[] | undefined,
): string | undefined {
  if (!flags || flags.length === 0) return undefined;

  const lines = flags.map((f) => `- ${f.detail}`);
  return `Your previous turn was flagged by the observer for the following - keep this in mind and avoid repeating it:\n${lines.join("\n")}`;
}
