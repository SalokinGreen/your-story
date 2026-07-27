/**
 * Per-turn cost: what a game turn is PREDICTED to cost, and what it
 * ACTUALLY cost.
 *
 * A turn is not one API call. It is a whole fan-out of them, and the ones
 * the player never sees are a real share of the bill:
 *
 *   - the GM/tool stage, looped over N rounds (ai_staged.ts + generation.ts),
 *     at whatever model the reasoning-tier router picked (reasoningTiers.ts);
 *   - the narration call, when the GM's own last round didn't already write
 *     the prose;
 *   - the choices call;
 *   - the Observer's five judge calls plus, when it flags something major,
 *     a narration rewrite AND re-derived choices (observer.ts);
 *   - the Memory Keeper, every turn (memoryAgent.ts);
 *   - the Director Assistant, on scene increments (directorAssistant.ts);
 *   - the Story Progress Observer, every Nth turn (storyProgressObserver.ts);
 *   - Reflection and compaction, on their own periodic cadences.
 *
 * Two halves live here:
 *
 * PREDICTION (`estimateTurnCost`) walks that same call list against the
 * user's live configuration - the effective tier ladder, per-layer model
 * overrides, the Memory Size slider, observer settings, cadences - and
 * prices each call. Optional calls are weighted by how often they actually
 * fire rather than being counted as always-on or ignored, so the headline
 * number is an expected value with a low/high band around it.
 *
 * ACTUALS (`beginTurnCost` / `recordAICall` / `getTurnCostReport`) are a
 * ledger every AI call in the app reports into, priced from the provider's
 * own reported token usage. Attribution is explicit (`costTurnId`) rather
 * than "whatever turn is open", because the background layer wave
 * (generation.ts's runBackgroundLayers) deliberately outlives the turn that
 * spawned it and can still be running when the next turn starts.
 *
 * CALIBRATION closes the loop: finished turns feed a rolling per-stage token
 * average back into localStorage, and the estimator prefers those observed
 * numbers over its static priors once it has enough samples. A prediction
 * for an adventure with a huge character sheet and a chatty GM converges on
 * that adventure's real cost instead of staying at the generic default.
 *
 * Prices come from AI_MODELS (ai_prices.ts) and are raw provider dollars -
 * NOT coins. Every provider is BYOK now (see reasoningTiers.ts), so what the
 * player wants to know is what their own OpenRouter/DeepSeek/Mistral bill
 * goes up by, with no markup in the way.
 */

import { AI_MODELS, AIModelKey } from "@/app/misc/ai_prices";
import { getCustomModelIfUUID } from "@/app/misc/user_settings";
import { logger } from "@/app/misc/logger";

// ============================================================
// PRICING PRIMITIVES
// ============================================================

export interface ModelPrice {
  /** $ per 1M input tokens. */
  inputPrice: number;
  /** $ per 1M output tokens. */
  outputPrice: number;
  displayName: string;
  provider: string;
  /** True when we have no price data at all (unpriced custom model). */
  unpriced: boolean;
}

/**
 * Price lookup that understands custom (OpenRouter BYOK) models, which
 * getModelConfig() deliberately reports as $0 because the API route resolves
 * them from user settings instead. Here we DO have the user's settings, so a
 * custom model with prices filled in gets priced properly, and one without
 * is reported as unpriced rather than silently costing nothing.
 */
export function getModelPrice(modelKey: string): ModelPrice {
  const custom = getCustomModelIfUUID(modelKey);
  if (custom) {
    const hasPrices =
      (custom.inputPrice ?? 0) > 0 || (custom.outputPrice ?? 0) > 0;
    return {
      inputPrice: custom.inputPrice ?? 0,
      outputPrice: custom.outputPrice ?? 0,
      displayName: custom.name,
      provider: "openrouter",
      unpriced: !hasPrices,
    };
  }

  const config = AI_MODELS[modelKey as AIModelKey];
  if (config) {
    return {
      inputPrice: config.inputPrice,
      outputPrice: config.outputPrice,
      displayName: config.name,
      provider: config.provider,
      unpriced: false,
    };
  }

  return {
    inputPrice: 0,
    outputPrice: 0,
    displayName: modelKey,
    provider: "unknown",
    unpriced: true,
  };
}

/** Dollar cost of a single call at a model's list price. */
export function priceCall(
  modelKey: string,
  promptTokens: number,
  completionTokens: number,
): number {
  const price = getModelPrice(modelKey);
  return (
    (Math.max(0, promptTokens) / 1_000_000) * price.inputPrice +
    (Math.max(0, completionTokens) / 1_000_000) * price.outputPrice
  );
}

/**
 * Reasoning tokens are billed as output tokens by every provider this app
 * talks to, and the providers that report usage already fold them into
 * completion_tokens - so ACTUALS need no adjustment. Predictions do: a call
 * at effort "high" emits far more output tokens than the same call at
 * "none", and pretending otherwise is the single biggest way a per-turn
 * estimate goes wrong. These multipliers scale predicted OUTPUT tokens only.
 */
const REASONING_OUTPUT_MULTIPLIER: Record<string, number> = {
  none: 1,
  low: 1.6,
  normal: 2.5,
  high: 4,
  xhigh: 6.5,
};

export function reasoningOutputMultiplier(effort: string | undefined): number {
  if (!effort) return 1;
  return REASONING_OUTPUT_MULTIPLIER[effort] ?? 1;
}

// ============================================================
// STAGES
// ============================================================

export type TurnCostStage =
  | "gm"
  | "narration"
  | "choices"
  | "classifier"
  | "observer"
  | "observer_rewrite"
  | "memory_keeper"
  | "director"
  | "progress_observer"
  | "reflection"
  | "compaction"
  | "subagent";

export const TURN_COST_STAGE_LABELS: Record<TurnCostStage, string> = {
  gm: "Game Master",
  narration: "Narration",
  choices: "Choices",
  classifier: "Tier classifier",
  observer: "Observer",
  observer_rewrite: "Observer rewrite",
  memory_keeper: "Memory Keeper",
  director: "Director Assistant",
  progress_observer: "Story Progress Observer",
  reflection: "Reflection",
  compaction: "Compaction",
  subagent: "Sub-agent",
};

/** Display order for breakdowns - roughly the order a turn runs them in. */
export const TURN_COST_STAGE_ORDER: TurnCostStage[] = [
  "classifier",
  "gm",
  "narration",
  "choices",
  "observer",
  "observer_rewrite",
  "memory_keeper",
  "director",
  "progress_observer",
  "reflection",
  "compaction",
  "subagent",
];

// ============================================================
// ACTUALS: THE PER-TURN LEDGER
// ============================================================

export interface TurnCostEntry {
  turnId: string;
  stage: TurnCostStage;
  /** What specifically ran, e.g. "GM round 2" or "player_agency check". */
  label: string;
  modelKey: string;
  modelName: string;
  provider: string;
  promptTokens: number;
  completionTokens: number;
  /** List-price cost in dollars, computed from tokens. */
  costUsd: number;
  /**
   * The provider's OWN cost figure when it sends one (DeepInfra's
   * `estimated_cost`). Preferred over costUsd in totals when present, since
   * it accounts for cache discounts and per-provider routing our list prices
   * can't see.
   */
  providerReportedUsd?: number;
  /** True when the model has no usable price data - totals understate. */
  unpriced: boolean;
  at: number;
}

export interface TurnCostStageSummary {
  stage: TurnCostStage;
  calls: number;
  promptTokens: number;
  completionTokens: number;
  costUsd: number;
}

export interface TurnCostReport {
  turnId: string;
  calls: number;
  promptTokens: number;
  completionTokens: number;
  totalUsd: number;
  /** True if any call in the turn used a model we have no prices for. */
  hasUnpricedCalls: boolean;
  byStage: TurnCostStageSummary[];
  entries: TurnCostEntry[];
  startedAt: number;
  /** ms from turn start to the last recorded call. */
  elapsedMs: number;
}

interface OpenTurn {
  turnId: string;
  startedAt: number;
  entries: TurnCostEntry[];
}

// Bounded ring of recent turns. More than one is kept open at a time on
// purpose: the background layer wave for turn N is routinely still running
// when turn N+1 starts, and its calls must land on turn N.
const MAX_TRACKED_TURNS = 12;
const trackedTurns: OpenTurn[] = [];
let activeTurnId: string | null = null;
let turnCounter = 0;

export const TURN_COST_UPDATED_EVENT = "turn-cost-updated";

/**
 * Fired when a setting the ESTIMATE depends on changed but no existing event
 * covers it - the Memory Size slider and the GM tool-loop limit, which live
 * in plain localStorage keys rather than behind reasoningTiers.ts's or
 * layerSettings.ts's own change events. Both feed straight into a turn's
 * predicted cost, so the readout has to move when they do.
 */
export const TURN_COST_INPUTS_CHANGED_EVENT = "turn-cost-inputs-changed";

export function notifyTurnCostInputsChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(TURN_COST_INPUTS_CHANGED_EVENT));
}

function notifyCostUpdated(turnId: string): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(TURN_COST_UPDATED_EVENT, { detail: { turnId } }),
  );
}

/**
 * Opens a ledger for a new turn and makes it the default target for calls
 * that don't name a turn explicitly. Returns the id to thread through
 * side-call options (`costTurnId`).
 */
export function beginTurnCost(): string {
  turnCounter += 1;
  const turnId = `turn-${Date.now().toString(36)}-${turnCounter}`;
  trackedTurns.push({ turnId, startedAt: Date.now(), entries: [] });
  while (trackedTurns.length > MAX_TRACKED_TURNS) trackedTurns.shift();
  activeTurnId = turnId;
  return turnId;
}

/** The turn a call lands on when it doesn't specify one. */
export function getActiveTurnId(): string | null {
  return activeTurnId;
}

export interface RecordAICallParams {
  stage: TurnCostStage;
  label: string;
  modelKey: string;
  promptTokens: number;
  completionTokens: number;
  /** Provider's own dollar figure, when it reports one. */
  providerReportedUsd?: number;
  /**
   * Which turn to bill. Omit to bill the currently-open turn - correct for
   * anything running inline in the turn, wrong for background work, which
   * must pass the id it captured when it was scheduled.
   */
  costTurnId?: string;
}

/**
 * Records one completed AI call. Never throws: a cost-accounting failure
 * must never take down a turn, so anything unexpected is swallowed.
 */
export function recordAICall(params: RecordAICallParams): void {
  try {
    const turnId = params.costTurnId ?? activeTurnId;
    if (!turnId) return;
    const turn = trackedTurns.find((t) => t.turnId === turnId);
    if (!turn) return;

    const price = getModelPrice(params.modelKey);
    const entry: TurnCostEntry = {
      turnId,
      stage: params.stage,
      label: params.label,
      modelKey: params.modelKey,
      modelName: price.displayName,
      provider: price.provider,
      promptTokens: params.promptTokens || 0,
      completionTokens: params.completionTokens || 0,
      costUsd: priceCall(
        params.modelKey,
        params.promptTokens || 0,
        params.completionTokens || 0,
      ),
      providerReportedUsd: params.providerReportedUsd,
      unpriced: price.unpriced && params.providerReportedUsd === undefined,
      at: Date.now(),
    };
    turn.entries.push(entry);
    notifyCostUpdated(turnId);
  } catch {
    // Accounting is never allowed to break generation.
  }
}

/**
 * Mixed into every side call's api-options bag (the Observer's, Memory
 * Keeper's, Director Assistant's, Story Progress Observer's) so a call can
 * name the turn it belongs to. Those layers run fire-and-forget AFTER their
 * turn hands control back to the player, so "whatever turn is open now" is
 * the wrong answer often enough to matter.
 */
export interface SideCallCostContext {
  costTurnId?: string;
}

/** Shape of the `meta` a /api/generate response carries. */
interface GenerateResponseMeta {
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
  };
  estimatedCost?: number;
}

/**
 * Records a non-streaming /api/generate response into the ledger. Every
 * side-call agent has the same "await fetch, await response.json()" shape,
 * so this is the one line each of them needs.
 */
export function recordSideCall(
  stage: TurnCostStage,
  label: string,
  modelKey: string,
  data: { meta?: GenerateResponseMeta } | null | undefined,
  context?: SideCallCostContext,
): void {
  const usage = data?.meta?.usage;
  if (!usage) return;
  recordAICall({
    stage,
    label,
    modelKey,
    promptTokens: usage.promptTokens || 0,
    completionTokens: usage.completionTokens || 0,
    providerReportedUsd: data?.meta?.estimatedCost,
    costTurnId: context?.costTurnId,
  });
}

/** Dollar figure to trust for one entry: the provider's if it gave one. */
function effectiveUsd(entry: TurnCostEntry): number {
  return entry.providerReportedUsd ?? entry.costUsd;
}

export function getTurnCostReport(turnId: string): TurnCostReport | null {
  const turn = trackedTurns.find((t) => t.turnId === turnId);
  if (!turn) return null;

  const byStage = new Map<TurnCostStage, TurnCostStageSummary>();
  let promptTokens = 0;
  let completionTokens = 0;
  let totalUsd = 0;
  let hasUnpricedCalls = false;
  let lastAt = turn.startedAt;

  for (const entry of turn.entries) {
    const usd = effectiveUsd(entry);
    promptTokens += entry.promptTokens;
    completionTokens += entry.completionTokens;
    totalUsd += usd;
    if (entry.unpriced) hasUnpricedCalls = true;
    if (entry.at > lastAt) lastAt = entry.at;

    const summary = byStage.get(entry.stage) ?? {
      stage: entry.stage,
      calls: 0,
      promptTokens: 0,
      completionTokens: 0,
      costUsd: 0,
    };
    summary.calls += 1;
    summary.promptTokens += entry.promptTokens;
    summary.completionTokens += entry.completionTokens;
    summary.costUsd += usd;
    byStage.set(entry.stage, summary);
  }

  return {
    turnId: turn.turnId,
    calls: turn.entries.length,
    promptTokens,
    completionTokens,
    totalUsd,
    hasUnpricedCalls,
    byStage: TURN_COST_STAGE_ORDER.filter((s) => byStage.has(s)).map(
      (s) => byStage.get(s)!,
    ),
    entries: [...turn.entries],
    startedAt: turn.startedAt,
    elapsedMs: lastAt - turn.startedAt,
  };
}

/** Most recently opened turn's report, for "what did that turn cost?" UI. */
export function getLatestTurnCostReport(): TurnCostReport | null {
  const last = trackedTurns[trackedTurns.length - 1];
  return last ? getTurnCostReport(last.turnId) : null;
}

export function getRecentTurnCostReports(limit = 10): TurnCostReport[] {
  return trackedTurns
    .slice(-limit)
    .map((t) => getTurnCostReport(t.turnId))
    .filter((r): r is TurnCostReport => r !== null)
    .reverse();
}

/**
 * Writes the turn's cost breakdown to the Debug Logs (logger.ts), which is
 * where the "what did this actually cost" answer is meant to be read.
 * `phase` distinguishes the figure available the moment the player regains
 * control from the final one once the background layers have landed.
 */
export function logTurnCost(
  turnId: string,
  phase: "turn" | "final" = "turn",
): TurnCostReport | null {
  const report = getTurnCostReport(turnId);
  if (!report || report.calls === 0) return report;

  logger.action(
    phase === "final"
      ? "Turn cost (final, incl. background layers)"
      : "Turn cost",
    {
      total: formatUsd(report.totalUsd),
      totalUsd: report.totalUsd,
      calls: report.calls,
      promptTokens: report.promptTokens,
      completionTokens: report.completionTokens,
      elapsedMs: report.elapsedMs,
      ...(report.hasUnpricedCalls && {
        note: "Some calls used models with no price data - total is a floor, not the full cost.",
      }),
      byStage: report.byStage.map((s) => ({
        stage: TURN_COST_STAGE_LABELS[s.stage],
        calls: s.calls,
        in: s.promptTokens,
        out: s.completionTokens,
        cost: formatUsd(s.costUsd),
        shareOfTurn:
          report.totalUsd > 0
            ? `${Math.round((s.costUsd / report.totalUsd) * 100)}%`
            : "-",
      })),
      calls_detail: report.entries.map((e) => ({
        stage: TURN_COST_STAGE_LABELS[e.stage],
        label: e.label,
        model: e.modelName,
        provider: e.provider,
        in: e.promptTokens,
        out: e.completionTokens,
        cost: formatUsd(effectiveUsd(e)),
        ...(e.providerReportedUsd !== undefined && { providerReported: true }),
        ...(e.unpriced && { unpriced: true }),
      })),
    },
  );

  return report;
}

// ============================================================
// FORMATTING
// ============================================================

/**
 * Turn costs are small - a cheap turn is a fraction of a cent - so a plain
 * "$0.00" would make every turn look free. Sub-cent amounts are shown with
 * enough precision to be a real number.
 */
export function formatUsd(usd: number): string {
  if (!Number.isFinite(usd) || usd <= 0) return "$0";
  if (usd < 0.001) return `$${usd.toFixed(5)}`;
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  if (usd < 1) return `$${usd.toFixed(3)}`;
  return `$${usd.toFixed(2)}`;
}

/** "about 340 turns per dollar" framing, which reads better than $0.0029. */
export function turnsPerDollar(usd: number): number | null {
  if (!Number.isFinite(usd) || usd <= 0) return null;
  return Math.round(1 / usd);
}

// ============================================================
// CALIBRATION: FEED ACTUALS BACK INTO THE PREDICTION
// ============================================================

const CALIBRATION_KEY = "turnCostCalibration";
/** Enough samples for an observed average to beat the static prior. */
const MIN_CALIBRATION_SAMPLES = 3;
/** Exponential smoothing weight for each new sample. */
const CALIBRATION_ALPHA = 0.25;

export interface StageCalibration {
  /** Smoothed prompt tokens per CALL for this stage. */
  avgPromptTokens: number;
  /** Smoothed completion tokens per CALL. */
  avgCompletionTokens: number;
  /** Smoothed number of calls this stage makes per turn (0 when it skips). */
  avgCallsPerTurn: number;
  /** Turns observed - the sample count behind avgCallsPerTurn. */
  samples: number;
  /**
   * Turns on which this stage ACTUALLY ran - the sample count behind the
   * token averages, which is a different number entirely for the periodic
   * layers. Reflection fires on maybe one turn in twelve; counting the
   * eleven quiet turns as evidence about how big a reflection call is would
   * drag its token average toward zero and make it look free.
   */
  tokenSamples?: number;
}

export type TurnCostCalibration = Partial<
  Record<TurnCostStage, StageCalibration>
>;

export function getTurnCostCalibration(): TurnCostCalibration {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(CALIBRATION_KEY);
    return raw ? (JSON.parse(raw) as TurnCostCalibration) : {};
  } catch {
    return {};
  }
}

export function resetTurnCostCalibration(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(CALIBRATION_KEY);
}

function smooth(previous: number, sample: number, samples: number): number {
  // The first few samples are averaged plainly so the estimate moves off the
  // prior quickly; after that it settles into exponential smoothing and stops
  // lurching on one unusual turn.
  if (samples <= 1) return sample;
  if (samples < MIN_CALIBRATION_SAMPLES) {
    return previous + (sample - previous) / samples;
  }
  return previous + CALIBRATION_ALPHA * (sample - previous);
}

/**
 * Folds one finished turn into the rolling per-stage averages the estimator
 * reads. Called once per turn, after the background layers have landed, so
 * the sampled turn is complete.
 *
 * Every stage in TURN_COST_STAGE_ORDER is sampled, including ones that
 * didn't run this turn - a stage that fires every tenth turn should end up
 * with avgCallsPerTurn near 0.1, which is exactly the expected-value
 * weighting the prediction wants.
 */
export function recordTurnCostCalibration(report: TurnCostReport): void {
  if (typeof window === "undefined") return;
  if (report.calls === 0) return;

  try {
    const current = getTurnCostCalibration();
    const byStage = new Map(report.byStage.map((s) => [s.stage, s]));

    for (const stage of TURN_COST_STAGE_ORDER) {
      const observed = byStage.get(stage);
      const previous = current[stage];
      const samples = (previous?.samples ?? 0) + 1;
      const callsThisTurn = observed?.calls ?? 0;

      // Call frequency is updated every turn - a zero-call turn is exactly
      // what "this stage fires one turn in ten" is made of.
      const avgCallsPerTurn = smooth(
        previous?.avgCallsPerTurn ?? callsThisTurn,
        callsThisTurn,
        samples,
      );

      if (callsThisTurn === 0) {
        // Token averages are per-CALL, so a turn the stage sat out carries
        // no information about how big its calls are. Carry them forward
        // untouched rather than smoothing toward zero.
        current[stage] = {
          avgPromptTokens: previous?.avgPromptTokens ?? 0,
          avgCompletionTokens: previous?.avgCompletionTokens ?? 0,
          avgCallsPerTurn,
          samples,
          tokenSamples: previous?.tokenSamples ?? 0,
        };
        continue;
      }

      const tokenSamples = (previous?.tokenSamples ?? 0) + 1;
      const promptSample = observed!.promptTokens / callsThisTurn;
      const completionSample = observed!.completionTokens / callsThisTurn;

      current[stage] = {
        avgPromptTokens: smooth(
          previous?.tokenSamples ? previous.avgPromptTokens : promptSample,
          promptSample,
          tokenSamples,
        ),
        avgCompletionTokens: smooth(
          previous?.tokenSamples ? previous.avgCompletionTokens : completionSample,
          completionSample,
          tokenSamples,
        ),
        avgCallsPerTurn,
        samples,
        tokenSamples,
      };
    }

    localStorage.setItem(CALIBRATION_KEY, JSON.stringify(current));
  } catch {
    // Calibration is a nicety; a storage failure just means static priors.
  }
}
