/**
 * Rung 3 of the judge ladder: the combined judge call (docs/judge-layer-v2-design.md
 * sections 3 and 11.5, plan slice 2).
 *
 * Every judge whose precondition holds goes into ONE side-model call that
 * answers a keyed JSON verdict per judge (`runCombinedJudges`). The rules this
 * file enforces, which the prompt alone cannot:
 *
 * - A judge runs only when code says it has something to judge
 *   (`selectJudges`): the length judge past the ceiling, the outcome judge on a
 *   typed ruling, the judges of the record when the record has a fact of their
 *   kind, and so on. A turn that fits none makes no call.
 * - The facts are never truncated. When a turn carries too many for one call
 *   the call's scope narrows instead, into two calls by judge group
 *   (`planCalls`); each judge is handed only the fact kinds it reads
 *   (`selectFactsFor`), so the split carries less, not the same facts twice.
 * - A verdict is trusted only when it checks out (`parseJudgeVerdicts`): a
 *   severity from the closed set, an evidence quote that is really in the
 *   narration, and fact ids that really exist in the judge's facts. Anything
 *   else, a missing key and malformed JSON included, is "unknown": no flag, a
 *   Debug Logs line. A failed call is unknown for every judge in it.
 * - A Stop (AbortError) passes through; the cost is on the turn's ledger
 *   because the call goes through `callSideModel`.
 *
 * The scene-increment question is not a judge: it is a free phrase check
 * (`sceneIncrementFlag`), a heuristic that flags and never rewrites.
 */
import type { ObserverFlag, ObserverFlagType } from "../structs";
import { logger } from "../logger";
import { callSideModel } from "../sideModelCall";
import { getEffectiveTiers, TOP_TIER } from "../reasoningTiers";
import { escapeRegExp } from "../compaction";
import type { ReplyLength } from "../ai_staged";
import {
  OUTCOME_CHECK_TOOL_NAMES,
  OUTCOME_TIER_LABELS,
  ORACLE_OR_TABLE_TOOL_NAMES,
  TOOL_USAGE_MAJOR_SENSITIVITY_THRESHOLD,
  extractJsonObject,
  formatCharacterContextBlock,
  formatJudgeReasoningBlock,
  formatMechanicsBlock,
  isAbortError,
  lengthOverage,
  prospectiveLengthFlag,
  settingsFor,
} from "../observer";
import type {
  ObserverApiOptions,
  ObserverCharacterContext,
  ObserverCheckSettings,
  ObserverSettings,
  RollOutcomeForCheck,
} from "../observer";
import { selectFactsFor } from "./facts";
import {
  buildJudgeSystemPrompt,
  buildJudgeUserPrompt,
  type OutcomeLine,
  type TierInput,
} from "./prompts";
import type { Fact, JudgeId, JudgeSeverity, JudgeVerdict } from "./types";

/** Every judge, in the order the call lists them and the flags are returned. */
export const JUDGE_IDS: readonly JudgeId[] = [
  "length",
  "agency",
  "outcome",
  "world_consistency",
  "secret_leak",
  "lines_veils",
  "oracle_gap",
  "tier_gap",
];

/** The setting each judge answers to (Settings is per flag type). */
export const JUDGE_FLAG_TYPE: Readonly<Record<JudgeId, ObserverFlagType>> = {
  length: "response_length",
  agency: "player_agency",
  outcome: "outcome_narration_mismatch",
  world_consistency: "world_consistency",
  secret_leak: "secret_leak",
  lines_veils: "lines_and_veils",
  oracle_gap: "missing_oracle_or_table",
  tier_gap: "tier_escalation_missed",
};

/**
 * The order in which several major flags are acted on (design 11.5): safety
 * first, then the secret, then what the engine ruled, the world, the player's
 * agency, and length last. The tool gaps and the tier judge come after the
 * prose judges; they never rewrite.
 */
export const FLAG_PRIORITY: readonly ObserverFlagType[] = [
  "lines_and_veils",
  "secret_leak",
  "outcome_narration_mismatch",
  "world_consistency",
  "player_agency",
  "response_length",
  "missing_oracle_or_table",
  "missing_scene_increment",
  "tier_escalation_missed",
];

/**
 * The flag a turn acts on: the highest-priority flag that is major and whose
 * type the player allowed to correct the turn (and `allowed` accepts), replacing
 * "the first major flag in the order the judges happened to be listed".
 */
export function pickMajorFlag(
  flags: readonly ObserverFlag[],
  settings: ObserverSettings | undefined,
  allowed: (type: ObserverFlagType) => boolean = () => true,
): ObserverFlag | undefined {
  const rank = (type: ObserverFlagType) => {
    const i = FLAG_PRIORITY.indexOf(type);
    return i < 0 ? FLAG_PRIORITY.length : i;
  };
  return flags
    .filter(
      (f) =>
        f.severity === "major" &&
        allowed(f.type) &&
        settingsFor(settings, f.type).triggersReset,
    )
    .sort((a, b) => rank(a.type) - rank(b.type))[0];
}

/** What the combined call reads of a turn. */
export interface JudgeTurn {
  narration: string;
  playerChoice: string;
  replyLength?: ReplyLength;
  toolNames: string[];
  rollResults: RollOutcomeForCheck[];
  tierUsed?: number;
  characterContext?: ObserverCharacterContext;
  /** The GM's reasoning for this narration; the outcome judge reads it as testimony only. */
  narrationThoughts?: string;
  facts: Fact[];
  /** What the key-phrase check found, for the secret-leak judge. */
  phraseHits?: string[];
  settings?: ObserverSettings;
}

function wordAppears(text: string, name: string): boolean {
  const n = name.trim();
  if (!n) return false;
  return new RegExp(
    `(?:^|[^\\p{L}\\p{N}])${escapeRegExp(n)}(?:$|[^\\p{L}\\p{N}])`,
    "iu",
  ).test(text);
}

/** The judges whose precondition holds for this turn, in call order. */
export function selectJudges(turn: JudgeTurn): JudgeId[] {
  if (!turn.narration.trim()) return [];
  const on = (id: JudgeId): ObserverCheckSettings =>
    settingsFor(turn.settings, JUDGE_FLAG_TYPE[id]);
  const picked: JudgeId[] = [];

  if (
    on("length").enabled &&
    lengthOverage(turn.narration, turn.replyLength, on("length"))
  ) {
    picked.push("length");
  }
  if (on("agency").enabled && turn.playerChoice.trim()) picked.push("agency");
  if (
    on("outcome").enabled &&
    turn.rollResults.some((r) => OUTCOME_CHECK_TOOL_NAMES.has(r.toolName) && Boolean(r.tier))
  ) {
    picked.push("outcome");
  }
  if (
    on("world_consistency").enabled &&
    turn.facts.some(
      (f) =>
        (f.topic === "person" || f.topic === "location") &&
        (f.names ?? []).some((n) => wordAppears(turn.narration, n)),
    )
  ) {
    picked.push("world_consistency");
  }
  if (on("secret_leak").enabled && turn.facts.some((f) => f.topic === "secret")) {
    picked.push("secret_leak");
  }
  if (
    on("lines_veils").enabled &&
    turn.facts.some((f) => f.topic === "line" || f.topic === "veil")
  ) {
    picked.push("lines_veils");
  }
  if (
    on("oracle_gap").enabled &&
    !turn.toolNames.some((n) => ORACLE_OR_TABLE_TOOL_NAMES.has(n))
  ) {
    picked.push("oracle_gap");
  }
  if (
    on("tier_gap").enabled &&
    turn.tierUsed !== undefined &&
    turn.tierUsed < TOP_TIER
  ) {
    picked.push("tier_gap");
  }
  return picked;
}

/** More facts than this (about) and the call splits by judge group; nothing is cut. */
export const JUDGE_FACT_BUDGET_TOKENS = 3000;

const ENGINE_GROUP: readonly JudgeId[] = ["length", "agency", "outcome", "oracle_gap", "tier_gap"];

function factTokens(judges: readonly JudgeId[], facts: readonly Fact[]): number {
  const seen = new Set<string>();
  let chars = 0;
  for (const id of judges) {
    for (const f of selectFactsFor(id, facts)) {
      if (seen.has(f.id)) continue;
      seen.add(f.id);
      chars += f.text.length + 24;
    }
  }
  return Math.ceil(chars / 4);
}

/**
 * One call, or two when the facts are too many for one: the engine judges (what
 * the player and the tools did) apart from the judges of the record (what the
 * world holds). A group that is still too large goes alone, whole.
 */
export function planCalls(judges: readonly JudgeId[], facts: readonly Fact[]): JudgeId[][] {
  if (judges.length === 0) return [];
  if (factTokens(judges, facts) <= JUDGE_FACT_BUDGET_TOKENS) return [[...judges]];
  const engine = judges.filter((j) => ENGINE_GROUP.includes(j));
  const world = judges.filter((j) => !ENGINE_GROUP.includes(j));
  if (engine.length === 0 || world.length === 0) return [[...judges]];
  return [engine, world];
}

// ---------------------------------------------------------------------------
// Parsing and validating the verdicts
// ---------------------------------------------------------------------------

function normalizeQuote(text: string): string {
  return text
    .replace(/[‘’‛]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[‐-―−]/g, "-") // hyphens, en and em dashes fold to one
    .replace(/[*_]/g, "") // markdown emphasis the narration may carry and the quote drop
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** A fragment without the quote marks and stray punctuation a judge wraps around it. */
function trimFragment(fragment: string): string {
  return fragment.replace(/^[\s"'`.,;:!?-]+|[\s"'`.,;:!?-]+$/g, "");
}

/** The shortest quote that counts as evidence: a "the" is in every narration. */
const MIN_QUOTE_WORDS = 3;
const MIN_QUOTE_CHARS = 12;

/**
 * Whether a quote is really in the text. A quote may skip words with an
 * ellipsis, but its fragments must come in the text's order. Surrounding quote
 * marks, emphasis marks and dash style do not matter; a quote shorter than
 * three words and twelve characters is no evidence.
 */
export function quoteAppearsIn(quote: string, text: string): boolean {
  const haystack = normalizeQuote(text);
  const fragments = quote
    .split(/…|\.{3}/)
    .map((f) => trimFragment(normalizeQuote(f)))
    .filter(Boolean);
  if (fragments.length === 0) return false;
  const whole = fragments.join(" ");
  if (whole.split(" ").length < MIN_QUOTE_WORDS && whole.length < MIN_QUOTE_CHARS) {
    return false;
  }
  let from = 0;
  for (const fragment of fragments) {
    const at = haystack.indexOf(fragment, from);
    if (at < 0) return false;
    from = at + fragment.length;
  }
  return true;
}

export interface VerdictProblem {
  judge: JudgeId;
  reason: string;
}

export interface VerdictContext {
  narration: string;
  playerLine: string;
  /** The ids of the facts each judge was handed. */
  allowedFactIds: Partial<Record<JudgeId, ReadonlySet<string>>>;
}

const SEVERITIES: ReadonlySet<string> = new Set(["none", "minor", "major"]);

const UNKNOWN: JudgeVerdict = { severity: "unknown", evidence: "", factIds: [], fix: "" };

/**
 * Turns a reply into one verdict per requested judge (design 11.5, plan
 * finding 13). Never throws on content: a missing key, a bad severity, a quote
 * that is not in the narration and a fact id that does not exist all give
 * "unknown" for that judge, and the problem is returned for the Debug Logs.
 */
export function parseJudgeVerdicts(
  content: string,
  judges: readonly JudgeId[],
  ctx: VerdictContext,
): { verdicts: Partial<Record<JudgeId, JudgeVerdict>>; problems: VerdictProblem[] } {
  const verdicts: Partial<Record<JudgeId, JudgeVerdict>> = {};
  const problems: VerdictProblem[] = [];
  const fail = (judge: JudgeId, reason: string) => {
    verdicts[judge] = { ...UNKNOWN };
    problems.push({ judge, reason });
  };

  const obj = extractJsonObject(content);
  if (!obj) {
    for (const j of judges) fail(j, "the reply was not a JSON object");
    return { verdicts, problems };
  }

  for (const judge of judges) {
    const raw = obj[judge];
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      fail(judge, "the reply has no verdict under this judge's key");
      continue;
    }
    const v = raw as Record<string, unknown>;
    if (typeof v.severity !== "string" || !SEVERITIES.has(v.severity)) {
      fail(judge, "the severity is not none, minor or major");
      continue;
    }
    if (v.severity === "none") {
      verdicts[judge] = { severity: "none", evidence: "", factIds: [], fix: "" };
      continue;
    }
    const evidence = typeof v.evidence === "string" ? v.evidence.trim() : "";
    if (!evidence) {
      fail(judge, "a flag without a quote");
      continue;
    }
    // The tier judge reasons from the player's line as much as from the prose.
    const haystack =
      judge === "tier_gap" ? `${ctx.narration}\n${ctx.playerLine}` : ctx.narration;
    if (!quoteAppearsIn(evidence, haystack)) {
      fail(judge, "the quote is not in the narration");
      continue;
    }
    const rawIds = v.factIds === undefined ? [] : v.factIds;
    if (!Array.isArray(rawIds) || rawIds.some((id) => typeof id !== "string")) {
      fail(judge, "factIds is not a list of ids");
      continue;
    }
    const allowed = ctx.allowedFactIds[judge] ?? new Set<string>();
    const missing = (rawIds as string[]).filter((id) => !allowed.has(id));
    if (missing.length > 0) {
      fail(judge, `fact ids that are not in this judge's facts: ${missing.join(", ")}`);
      continue;
    }
    verdicts[judge] = {
      severity: v.severity as JudgeSeverity,
      evidence,
      factIds: rawIds as string[],
      fix: typeof v.fix === "string" ? v.fix.trim() : "",
    };
  }
  return { verdicts, problems };
}

// ---------------------------------------------------------------------------
// The call
// ---------------------------------------------------------------------------

export interface CombinedJudgeResult {
  /** The judges that were asked, across every call. */
  ran: JudgeId[];
  verdicts: Partial<Record<JudgeId, JudgeVerdict>>;
  calls: number;
}

function outcomeLines(turn: JudgeTurn): OutcomeLine[] {
  return turn.rollResults
    .filter((v) => OUTCOME_CHECK_TOOL_NAMES.has(v.toolName) && Boolean(v.tier))
    .map((v) => ({
      label: OUTCOME_TIER_LABELS[v.tier],
      toolName: v.toolName,
      text: v.contextForStory,
      factIds: turn.facts
        .filter((f) => f.topic === "result" && f.source.ref === v.checkId)
        .map((f) => f.id),
    }));
}

function tierInput(tierUsed: number): TierInput {
  const tiers = getEffectiveTiers();
  return {
    used: tierUsed,
    usedNote: tiers[tierUsed]?.note ?? "default",
    higher: tiers
      .map((t, i) => ({ tier: i, note: t.note }))
      .filter(({ tier }) => tier > tierUsed),
  };
}

/**
 * The reply cap: a fixed share per judge, plus room for the span lists and
 * quotes, which can add up to about the narration's own length on a long turn.
 */
export function judgeMaxTokens(judgeCount: number, narration: string): number {
  return Math.min(8000, 260 * judgeCount + 240 + Math.ceil(narration.length / 3));
}

async function callJudges(
  turn: JudgeTurn,
  judges: JudgeId[],
  apiOptions: ObserverApiOptions,
): Promise<Partial<Record<JudgeId, JudgeVerdict>>> {
  const factsByJudge: Partial<Record<JudgeId, Fact[]>> = {};
  const allowedFactIds: Partial<Record<JudgeId, ReadonlySet<string>>> = {};
  const sensitivity: Partial<Record<JudgeId, number>> = {};
  for (const id of judges) {
    const facts = selectFactsFor(id, turn.facts);
    factsByJudge[id] = facts;
    allowedFactIds[id] = new Set(facts.map((f) => f.id));
    sensitivity[id] = settingsFor(turn.settings, JUDGE_FLAG_TYPE[id]).sensitivity;
  }
  const over = judges.includes("length")
    ? lengthOverage(turn.narration, turn.replyLength, settingsFor(turn.settings, "response_length"))
    : null;
  const needsCast = judges.includes("agency") || judges.includes("world_consistency");
  const needsRules = judges.includes("outcome") || judges.includes("oracle_gap");

  const system = buildJudgeSystemPrompt(judges);
  const user = buildJudgeUserPrompt({
    judges,
    factsByJudge,
    sensitivity,
    narration: turn.narration,
    playerLine: turn.playerChoice,
    lengthStats: over ? { words: over.words, ceiling: over.ceiling } : undefined,
    outcomeLines: judges.includes("outcome") ? outcomeLines(turn) : undefined,
    phraseHits: turn.phraseHits,
    tier:
      judges.includes("tier_gap") && turn.tierUsed !== undefined
        ? tierInput(turn.tierUsed)
        : undefined,
    characterBlock: needsCast ? formatCharacterContextBlock(turn.characterContext) : undefined,
    mechanicsBlock: needsRules ? formatMechanicsBlock(turn.characterContext) : undefined,
    reasoningBlock: judges.includes("outcome")
      ? formatJudgeReasoningBlock(turn.narrationThoughts)
      : undefined,
  });

  const unknownAll = (reason: string): Partial<Record<JudgeId, JudgeVerdict>> => {
    logger.action("Judges: no verdicts", { judges, reason });
    const out: Partial<Record<JudgeId, JudgeVerdict>> = {};
    for (const id of judges) out[id] = { ...UNKNOWN };
    return out;
  };

  try {
    const result = await callSideModel({
      stage: "observer",
      label: `judges (${judges.join(", ")})`,
      model: apiOptions.model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      keys: apiOptions,
      maxTokens: judgeMaxTokens(judges.length, turn.narration),
      temperature: 0,
      reasoningEffort: apiOptions.reasoningEffort,
      abortSignal: apiOptions.abortSignal,
      costTurnId: apiOptions.costTurnId,
    });
    if (!result.ok) return unknownAll("the call failed");
    const content = (result.data.content || "").trim();
    if (!content) return unknownAll("the reply was empty");

    const parsed = parseJudgeVerdicts(content, judges, {
      narration: turn.narration,
      playerLine: turn.playerChoice,
      allowedFactIds,
    });
    for (const p of parsed.problems) {
      logger.action(`Judge ${p.judge}: unknown`, { reason: p.reason });
    }
    for (const id of judges) {
      const v = parsed.verdicts[id];
      if (v && v.severity !== "none" && v.severity !== "unknown") {
        logger.action(`Judge ${id}: ${v.severity}`, {
          evidence: v.evidence,
          factIds: v.factIds,
          fix: v.fix,
        });
      }
    }
    return parsed.verdicts;
  } catch (error) {
    // A cancelled turn is the caller's decision, not a judge failure.
    if (isAbortError(error)) throw error;
    return unknownAll(error instanceof Error ? error.message : String(error));
  }
}

/**
 * Runs the turn's judges: selects those whose precondition holds, plans one
 * call (or two), and returns every verdict. No judge to run means no call.
 */
export async function runCombinedJudges(
  turn: JudgeTurn,
  apiOptions: ObserverApiOptions,
): Promise<CombinedJudgeResult> {
  const judges = selectJudges(turn);
  const plan = planCalls(judges, turn.facts);
  const verdicts: Partial<Record<JudgeId, JudgeVerdict>> = {};
  // Calls of one turn run together: they are independent, and each fails open.
  const answers = await Promise.all(plan.map((group) => callJudges(turn, group, apiOptions)));
  for (const a of answers) Object.assign(verdicts, a);
  return { ran: judges, verdicts, calls: plan.length };
}

// ---------------------------------------------------------------------------
// Verdicts to flags
// ---------------------------------------------------------------------------

export interface FlagContext {
  narration: string;
  replyLength?: ReplyLength;
  rollResults: RollOutcomeForCheck[];
  settings?: ObserverSettings;
}

function flagFor(judge: JudgeId, v: JudgeVerdict, ctx: FlagContext): ObserverFlag | null {
  if (v.severity !== "minor" && v.severity !== "major") return null;
  const severity = v.severity;
  const settings = settingsFor(ctx.settings, JUDGE_FLAG_TYPE[judge]);
  switch (judge) {
    case "length": {
      const base = prospectiveLengthFlag(ctx.narration, ctx.replyLength, settings);
      if (!base) return null;
      return {
        ...base,
        severity,
        // The word counts only: a judge's free text never reaches the player.
        detail: base.detail,
      };
    }
    case "agency": {
      const reason = v.fix || "The GM appeared to speak or act for the player character.";
      return {
        type: "player_agency",
        severity,
        detail:
          "The narration may have taken a decision away from the player: new dialogue, a significant choice, a decided feeling, or an action past the one they declared.",
        correctivePrompt: `Your previous attempt at this turn was reset because it broke the PLAYER AGENCY rule: it took a decision away from the player. ${reason} Rewrite this turn: narrate the character carrying out what the player declared (second person is fine) and the world's answer, but give them no new meaningful dialogue, no significant choice and no decided feeling the player didn't give.`,
      };
    }
    case "outcome": {
      const label = ctx.rollResults
        .filter((r) => OUTCOME_CHECK_TOOL_NAMES.has(r.toolName) && Boolean(r.tier))
        .map((r) => OUTCOME_TIER_LABELS[r.tier].split(" (")[0])
        .join(", ");
      const reason =
        v.fix || `The mechanical result was ${label}, but the narration says otherwise.`;
      return {
        type: "outcome_narration_mismatch",
        severity,
        detail: `The narration may not match the mechanical result of this turn's checks (${label}).`,
        correctivePrompt: `Your previous attempt at this turn was reset because the narration didn't match the mechanical result of this turn's checks (${label}): ${reason} Rewrite the narration so it agrees with what the rolls actually determined - the roll results are ground truth and narration cannot override them.`,
      };
    }
    case "world_consistency": {
      const reason = v.fix || "The narration may contradict a fact the story holds.";
      return {
        type: "world_consistency",
        severity,
        detail: "The narration may contradict a fact the story holds.",
        correctivePrompt: `The narration contradicted a fact the story holds: ${reason} Keep to the facts of the world.`,
      };
    }
    case "secret_leak":
      // Generic on purpose: the flag is shown to the player, and the quote and
      // the secret stay in the Debug Logs.
      return {
        type: "secret_leak",
        severity,
        detail: "The narration may state part of a secret that has not been revealed yet.",
        correctivePrompt:
          "The narration may have stated part of a secret before the story revealed it. Show only what the player character could notice.",
      };
    case "lines_veils":
      return {
        type: "lines_and_veils",
        severity,
        detail: "The narration may show something this table asked to keep out of the game or off screen.",
        correctivePrompt:
          "The narration may have shown something the table asked to keep out of the game or off screen. Keep to the table's lines and veils.",
      };
    case "oracle_gap": {
      const reason =
        v.fix ||
        "This turn may have invented an uncertain outcome instead of consulting the oracle or a table.";
      return {
        type: "missing_oracle_or_table",
        severity:
          settings.sensitivity >= TOOL_USAGE_MAJOR_SENSITIVITY_THRESHOLD ? "major" : "minor",
        detail:
          "This turn may have invented an uncertain outcome instead of consulting the oracle or a table.",
        correctivePrompt: `Consider using fate_question (for uncertain yes/no world questions) or roll_table (for random flavor) instead of deciding an outcome narratively: ${reason}`,
      };
    }
    case "tier_gap": {
      const reason =
        v.fix || "This turn's complexity called for more careful adjudication than its tier provides.";
      return {
        type: "tier_escalation_missed",
        severity,
        detail:
          "This turn's complexity may have called for more careful adjudication than its tier provides.",
        correctivePrompt: `Your previous attempt at this turn was reset because it needed more careful adjudication than it got: ${reason} This retry is running at a higher reasoning tier - take the extra room to think the stakes and consequences through before resolving the action.`,
      };
    }
  }
}

/** The flags a combined result makes, in the judges' order. Unknown and none make none. */
export function combinedResultToFlags(
  result: CombinedJudgeResult,
  ctx: FlagContext,
): ObserverFlag[] {
  const flags: ObserverFlag[] = [];
  for (const judge of JUDGE_IDS) {
    const v = result.verdicts[judge];
    if (!v) continue;
    const flag = flagFor(judge, v, ctx);
    if (flag) flags.push(flag);
  }
  return flags;
}

// ---------------------------------------------------------------------------
// The scene-increment heuristic
// ---------------------------------------------------------------------------

const SCENE_SHIFT =
  /\b(?:the next (?:morning|day|evening|night)|the following (?:morning|day|evening)|(?:hours|days|weeks|months) later|a (?:day|week|month) later|some time later|time passes)\b/i;

/**
 * A scene change needs interpretation, so it is a heuristic (design 11.3): a
 * phrase that skips time, with no `increment_scene` call this turn, is a flag.
 * Free, and never a rewrite.
 */
export function sceneIncrementFlag(
  narration: string,
  toolNames: readonly string[],
  settings: ObserverCheckSettings,
): ObserverFlag | null {
  if (!settings.enabled || toolNames.includes("increment_scene")) return null;
  const m = SCENE_SHIFT.exec(narration);
  if (!m) return null;
  const reason = `The narration skips ahead ("${m[0]}") without calling increment_scene.`;
  return {
    type: "missing_scene_increment",
    severity: settings.sensitivity >= TOOL_USAGE_MAJOR_SENSITIVITY_THRESHOLD ? "major" : "minor",
    detail: reason,
    correctivePrompt: `This turn narrated a scene transition without calling increment_scene: ${reason} Call increment_scene when the narration moves to a clearly new scene (new location, time skip).`,
  };
}
