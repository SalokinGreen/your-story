/**
 * Prediction half of the per-turn cost feature (see turnCost.ts for the
 * ledger of what turns ACTUALLY cost, and for why raw provider dollars
 * rather than coins).
 *
 * `estimateTurnCost()` walks the same fan-out of API calls a real turn makes
 * and prices each one against the user's live configuration: the effective
 * reasoning-tier ladder and its per-tier reasoning effort
 * (reasoningTiers.ts), the narration model, the per-layer model overrides
 * for the Observer / Memory Keeper / Director Assistant / Story Progress
 * Observer (layerSettings.ts), the Memory Size slider, and the cadences that
 * decide how often the periodic layers fire.
 *
 * Three things make this an estimate worth showing rather than a guess:
 *
 *  1. Optional calls are weighted by how often they FIRE, not counted as
 *     always-on. The Story Progress Observer at the default cadence
 *     contributes a tenth of its cost to the expected turn, not all of it.
 *  2. Reasoning effort scales predicted output tokens
 *     (reasoningOutputMultiplier) - a tier at "xhigh" is not the same bill
 *     as the same model at "none", and treating them alike is the biggest
 *     single source of error in a naive estimate.
 *  3. Observed history wins over priors. Once turnCost.ts has enough
 *     samples for a stage, its rolling per-call token averages and
 *     calls-per-turn frequency replace the static defaults, so the number
 *     converges on what THIS adventure actually costs.
 *
 * The result carries a low/expected/high band, because a turn where the GM
 * settles it in one round with no observer flags genuinely costs a fraction
 * of one that loops five rounds and triggers a rewrite.
 */

import { StoryData } from "@/app/misc/structs";
import {
  getEffectiveTiers,
  getEffectiveNarrationModelKey,
  resolveTier,
  getTierState,
  hardRuleFloor,
  classifyTierDeterministic,
  SCENE_BASELINE_TIER,
  AnyModelKey,
  ReasoningEffort,
} from "@/app/misc/reasoningTiers";
import {
  getObserverModelOverride,
  getMemoryKeeperModelOverride,
  getDirectorAssistantModelOverride,
  getStoryProgressObserverModelOverride,
  getStoryProgressCheckInterval,
  getObserverSettings,
  resolveSideCallModel,
} from "@/app/misc/layerSettings";
import { ObserverSettings, settingsFor } from "@/app/misc/observer";
import { ObserverFlagType } from "@/app/misc/structs";
import { computeGMStageBudget } from "@/app/misc/ai_staged";
import {
  TurnCostStage,
  TurnCostCalibration,
  StageCalibration,
  getTurnCostCalibration,
  getModelPrice,
  priceCall,
  reasoningOutputMultiplier,
} from "@/app/misc/turnCost";

// ============================================================
// STATIC PRIORS
// ============================================================
// Used until calibration has enough real samples for a stage. Sized from
// what each call site actually sends: prompt sizes from the prompt builders
// (ai_staged.ts) and context budgets, output sizes from the explicit
// maxTokens each side call passes.

/** Fraction of the GM budget a first-round prompt typically fills. */
const GM_CONTEXT_FILL = 0.75;
/** Player-visible prose the GM/narrator writes per turn, in tokens. */
const NARRATION_OUTPUT_TOKENS = 900;
/** Tool-call/planning output on a GM round that isn't the final prose one. */
const GM_TOOL_ROUND_OUTPUT_TOKENS = 250;
/** Choices prompt is narration + a trimmed history window. */
const CHOICES_INPUT_TOKENS = 5000;
const CHOICES_OUTPUT_TOKENS = 350;
/** Observer judges see the narration plus a compact context block. */
const OBSERVER_INPUT_TOKENS = 2200;
const OBSERVER_OUTPUT_TOKENS = 120;
/** The rewrite re-sends the turn's whole conversation and rewrites the prose. */
const OBSERVER_REWRITE_INPUT_FILL = 0.8;
const MEMORY_KEEPER_INPUT_TOKENS = 1400;
const MEMORY_KEEPER_OUTPUT_TOKENS = 120;
const DIRECTOR_INPUT_TOKENS = 1600;
const DIRECTOR_OUTPUT_TOKENS = 120;
const PROGRESS_INPUT_TOKENS = 3500;
const PROGRESS_OUTPUT_TOKENS = 180;
const REFLECTION_INPUT_TOKENS = 1200;
const REFLECTION_OUTPUT_TOKENS = 200;
const CLASSIFIER_INPUT_TOKENS = 250;
const CLASSIFIER_OUTPUT_TOKENS = 10;

/**
 * How many rounds the GM's tool loop runs. A turn that just needs one roll
 * resolves in two rounds; a combat turn with lookups and state changes runs
 * longer. The high end is bounded by maxToolLoops, not by this.
 */
const GM_ROUNDS_LOW = 1;
const GM_ROUNDS_EXPECTED = 2.4;
const GM_ROUNDS_HIGH = 5;

/**
 * How often a turn ends with the narration coming from a SEPARATE call
 * rather than from the GM's own final round (which is free - see
 * generation.ts's gmFinalStoryContent). Most turns end inline.
 */
const SEPARATE_NARRATION_CALL_PROBABILITY = 0.35;

/** How often the Observer finds something major enough to force a rewrite. */
const OBSERVER_REWRITE_PROBABILITY = 0.12;

/** How often a turn increments the scene, gating the Director Assistant. */
const SCENE_INCREMENT_PROBABILITY = 0.2;

/** How often enough memory accrues to trigger a reflection pass. */
const REFLECTION_PROBABILITY = 0.08;

/** How often the ambiguous-input path spends a classifier call. */
const CLASSIFIER_PROBABILITY = 0.15;

// ============================================================
// TYPES
// ============================================================

export interface TurnCostEstimateLine {
  stage: TurnCostStage;
  /** What this line covers, e.g. "GM tool rounds (x2.4)". */
  label: string;
  modelKey: string;
  modelName: string;
  provider: string;
  reasoningEffort?: string;
  /** Expected number of calls per turn - fractional for periodic layers. */
  expectedCalls: number;
  /** Expected input/output tokens summed across those calls. */
  inputTokens: number;
  outputTokens: number;
  expectedUsd: number;
  lowUsd: number;
  highUsd: number;
  /** True when this line's token sizes came from observed history. */
  calibrated: boolean;
  /** True when the model has no price data, so this line reads $0 wrongly. */
  unpriced: boolean;
  /** Why this line is fractional / what drives it, for the UI's tooltip. */
  note?: string;
}

export interface TurnCostEstimate {
  expectedUsd: number;
  lowUsd: number;
  highUsd: number;
  lines: TurnCostEstimateLine[];
  /** Lines grouped: what the player waits on vs. background architecture. */
  foregroundUsd: number;
  backgroundUsd: number;
  hasUnpricedModels: boolean;
  /** How many finished turns have fed the calibration so far. */
  calibrationSamples: number;
  assumptions: string[];
}

export interface EstimateTurnCostParams {
  /**
   * Live story, when there is one - used to pick the tier the NEXT turn will
   * most likely run at (combat floors it, an escalated tier decays toward
   * baseline). Omit for a config-only estimate, which assumes the baseline
   * tier.
   */
  storyData?: StoryData;
  /** Memory Size slider (localStorage `customMaxContext`). */
  customMaxContext?: number;
  /** GM tool-loop safety limit (GenerationOptions.maxToolLoops). */
  maxToolLoops?: number;
  /** Defaults to the user's stored Architecture-tab settings. */
  observerSettings?: ObserverSettings;
  /** Defaults to the rolling averages recorded by turnCost.ts. */
  calibration?: TurnCostCalibration;
}

// ============================================================
// HELPERS
// ============================================================

interface StagePlan {
  stage: TurnCostStage;
  label: string;
  modelKey: string;
  reasoningEffort?: ReasoningEffort | string;
  inputPerCall: number;
  outputPerCall: number;
  expectedCalls: number;
  lowCalls: number;
  highCalls: number;
  note?: string;
}

/**
 * A stage's per-call token sizes, preferring observed history once there's
 * enough of it. Returns the prior unchanged when there isn't.
 */
function calibratedTokens(
  calibration: TurnCostCalibration,
  stage: TurnCostStage,
  priorInput: number,
  priorOutput: number,
): { input: number; output: number; calibrated: boolean } {
  const observed: StageCalibration | undefined = calibration[stage];
  // Gated on tokenSamples (turns the stage actually RAN on), not samples
  // (turns observed) - a periodic layer can have fifty samples and still
  // never have fired, in which case its token averages are placeholders.
  // `?? samples` keeps hand-built calibration data (tests) working.
  const tokenSamples = observed?.tokenSamples ?? observed?.samples ?? 0;
  if (
    !observed ||
    tokenSamples < 3 ||
    (observed.avgPromptTokens <= 0 && observed.avgCompletionTokens <= 0)
  ) {
    return { input: priorInput, output: priorOutput, calibrated: false };
  }
  return {
    input: Math.round(observed.avgPromptTokens),
    output: Math.round(observed.avgCompletionTokens),
    calibrated: true,
  };
}

/** Observed calls-per-turn for a stage, when there's enough history. */
function calibratedCalls(
  calibration: TurnCostCalibration,
  stage: TurnCostStage,
  priorCalls: number,
): number {
  const observed = calibration[stage];
  if (!observed || observed.samples < 3) return priorCalls;
  return observed.avgCallsPerTurn;
}

function planToLine(
  plan: StagePlan,
  calibration: TurnCostCalibration,
): TurnCostEstimateLine {
  const price = getModelPrice(plan.modelKey);
  const { input, output, calibrated } = calibratedTokens(
    calibration,
    plan.stage,
    plan.inputPerCall,
    plan.outputPerCall,
  );

  // Reasoning tokens bill as output. Calibrated numbers already include
  // whatever reasoning the model actually emitted, so the multiplier is only
  // applied to priors - applying it to observed data would double-count.
  const effectiveOutput = calibrated
    ? output
    : Math.round(output * reasoningOutputMultiplier(plan.reasoningEffort));

  const costPerCall = priceCall(plan.modelKey, input, effectiveOutput);

  return {
    stage: plan.stage,
    label: plan.label,
    modelKey: plan.modelKey,
    modelName: price.displayName,
    provider: price.provider,
    reasoningEffort: plan.reasoningEffort,
    expectedCalls: plan.expectedCalls,
    inputTokens: Math.round(input * plan.expectedCalls),
    outputTokens: Math.round(effectiveOutput * plan.expectedCalls),
    expectedUsd: costPerCall * plan.expectedCalls,
    lowUsd: costPerCall * plan.lowCalls,
    highUsd: costPerCall * plan.highCalls,
    calibrated,
    unpriced: price.unpriced,
    note: plan.note,
  };
}

/** Which tier the next turn most likely runs at, given live state. */
function predictTier(storyData: StoryData | undefined): number {
  if (!storyData) return SCENE_BASELINE_TIER;
  const floor = hardRuleFloor(storyData);
  const classified = classifyTierDeterministic(storyData);
  // The router decays an escalated tier one step toward baseline each turn,
  // so the tier that ran last turn is an upper bound on the next one, not a
  // prediction of it.
  const carried = Math.max(
    SCENE_BASELINE_TIER,
    (getTierState(storyData).currentTier ?? SCENE_BASELINE_TIER) - 1,
  );
  return Math.max(floor, classified, carried);
}

/** Background layers the player never waits on (generation.ts's wave). */
const BACKGROUND_STAGES: ReadonlySet<TurnCostStage> = new Set<TurnCostStage>([
  "observer",
  "observer_rewrite",
  "memory_keeper",
  "director",
  "progress_observer",
  "reflection",
  "compaction",
]);

// ============================================================
// THE ESTIMATOR
// ============================================================

export function estimateTurnCost(
  params: EstimateTurnCostParams = {},
): TurnCostEstimate {
  const calibration = params.calibration ?? getTurnCostCalibration();
  const observerSettings = params.observerSettings ?? getObserverSettings();
  const assumptions: string[] = [];

  // --- Which models this configuration will actually use -------------
  const tiers = getEffectiveTiers();
  const tierIndex = Math.max(
    0,
    Math.min(tiers.length - 1, predictTier(params.storyData)),
  );
  const gmTier = resolveTier(tierIndex);
  const gmModel = String(gmTier.modelKey);
  const narrationModel = String(getEffectiveNarrationModelKey());

  // Side calls inherit the turn's model unless the user pinned one in
  // Settings > Architecture - exactly what generation.ts does at runtime.
  const sideCallFallback = narrationModel;
  const observerCall = resolveSideCallModel(
    getObserverModelOverride(),
    sideCallFallback,
  );
  const memoryCall = resolveSideCallModel(
    getMemoryKeeperModelOverride(),
    sideCallFallback,
  );
  const directorCall = resolveSideCallModel(
    getDirectorAssistantModelOverride(),
    sideCallFallback,
  );
  const progressCall = resolveSideCallModel(
    getStoryProgressObserverModelOverride(),
    sideCallFallback,
  );

  // --- Context budget the GM stage will be filled to ------------------
  const { totalContextBudget } = computeGMStageBudget(
    params.customMaxContext,
    gmModel,
  );
  const gmInputTokens = Math.round(totalContextBudget * GM_CONTEXT_FILL);

  const maxRounds = params.maxToolLoops || 10;
  const expectedRounds = Math.min(GM_ROUNDS_EXPECTED, maxRounds);
  const highRounds = Math.min(GM_ROUNDS_HIGH, maxRounds);

  const plans: StagePlan[] = [];

  // --- Tier classifier (rare, tiny) ----------------------------------
  plans.push({
    stage: "classifier",
    label: "Tier classification",
    modelKey: String(resolveTier(0).modelKey),
    reasoningEffort: resolveTier(0).reasoningEffort,
    inputPerCall: CLASSIFIER_INPUT_TOKENS,
    outputPerCall: CLASSIFIER_OUTPUT_TOKENS,
    expectedCalls: calibratedCalls(
      calibration,
      "classifier",
      CLASSIFIER_PROBABILITY,
    ),
    lowCalls: 0,
    highCalls: 1,
    note: "Only runs when game state gives no signal and the player wrote something long.",
  });

  // --- GM tool rounds -------------------------------------------------
  // The GM's rounds are the expensive part: each one resends the full
  // context. The final round usually also writes the prose, which is why the
  // separate narration call below is only sometimes needed.
  plans.push({
    stage: "gm",
    label: `GM tool rounds (~${expectedRounds.toFixed(1)}x)`,
    modelKey: gmModel,
    reasoningEffort: gmTier.reasoningEffort,
    inputPerCall: gmInputTokens,
    outputPerCall: GM_TOOL_ROUND_OUTPUT_TOKENS + NARRATION_OUTPUT_TOKENS / 2,
    expectedCalls: calibratedCalls(calibration, "gm", expectedRounds),
    lowCalls: GM_ROUNDS_LOW,
    highCalls: highRounds,
    note: `Tier ${gmTier.tier}, effort "${gmTier.reasoningEffort}". Each round resends the whole ${totalContextBudget.toLocaleString()}-token context budget.`,
  });

  // --- Narration (only when the GM didn't already write it) -----------
  plans.push({
    stage: "narration",
    label: "Narration call",
    modelKey: narrationModel,
    inputPerCall: gmInputTokens,
    outputPerCall: NARRATION_OUTPUT_TOKENS,
    expectedCalls: calibratedCalls(
      calibration,
      "narration",
      SEPARATE_NARRATION_CALL_PROBABILITY,
    ),
    lowCalls: 0,
    highCalls: 1,
    note: "Skipped entirely when the GM's own final round already wrote the prose.",
  });

  // --- Choices --------------------------------------------------------
  plans.push({
    stage: "choices",
    label: "Choices",
    modelKey: narrationModel,
    inputPerCall: CHOICES_INPUT_TOKENS,
    outputPerCall: CHOICES_OUTPUT_TOKENS,
    expectedCalls: calibratedCalls(calibration, "choices", 1),
    lowCalls: 1,
    highCalls: 1,
  });

  // --- Observer judges -------------------------------------------------
  // One call per enabled check. checkResponseLength only spends a call when
  // the turn actually ran long, so it's counted at less than one.
  const enabledChecks = (
    Object.keys(observerSettings) as ObserverFlagType[]
  ).filter((type) => settingsFor(observerSettings, type).enabled);
  const alwaysOnChecks = enabledChecks.filter(
    (type) => type !== "response_length",
  ).length;
  const lengthCheckCalls = enabledChecks.includes("response_length") ? 0.3 : 0;
  const observerCalls = alwaysOnChecks + lengthCheckCalls;

  if (observerCalls > 0) {
    plans.push({
      stage: "observer",
      label: `Observer judges (${enabledChecks.length} check${enabledChecks.length === 1 ? "" : "s"})`,
      modelKey: observerCall.model,
      reasoningEffort: observerCall.reasoningEffort,
      inputPerCall: OBSERVER_INPUT_TOKENS,
      outputPerCall: OBSERVER_OUTPUT_TOKENS,
      expectedCalls: calibratedCalls(calibration, "observer", observerCalls),
      lowCalls: alwaysOnChecks,
      highCalls: enabledChecks.length,
      note: "One call per enabled check, every turn. Turn off checks you don't need in Settings > Architecture.",
    });

    plans.push({
      stage: "observer_rewrite",
      label: "Observer rewrite",
      modelKey: observerCall.model,
      reasoningEffort: observerCall.reasoningEffort,
      inputPerCall: Math.round(gmInputTokens * OBSERVER_REWRITE_INPUT_FILL),
      outputPerCall: NARRATION_OUTPUT_TOKENS,
      expectedCalls: calibratedCalls(
        calibration,
        "observer_rewrite",
        OBSERVER_REWRITE_PROBABILITY,
      ),
      lowCalls: 0,
      highCalls: 1,
      note: "Only when a check flags something major - rewrites the prose and re-derives choices.",
    });
  } else {
    assumptions.push("Observer checks are all disabled.");
  }

  // --- Memory Keeper (every turn) --------------------------------------
  plans.push({
    stage: "memory_keeper",
    label: "Memory Keeper",
    modelKey: memoryCall.model,
    reasoningEffort: memoryCall.reasoningEffort,
    inputPerCall: MEMORY_KEEPER_INPUT_TOKENS,
    outputPerCall: MEMORY_KEEPER_OUTPUT_TOKENS,
    expectedCalls: calibratedCalls(calibration, "memory_keeper", 1),
    lowCalls: 1,
    highCalls: 1,
  });

  // --- Director Assistant (scene increments only) -----------------------
  plans.push({
    stage: "director",
    label: "Director Assistant",
    modelKey: directorCall.model,
    reasoningEffort: directorCall.reasoningEffort,
    inputPerCall: DIRECTOR_INPUT_TOKENS,
    outputPerCall: DIRECTOR_OUTPUT_TOKENS,
    expectedCalls: calibratedCalls(
      calibration,
      "director",
      SCENE_INCREMENT_PROBABILITY,
    ),
    lowCalls: 0,
    highCalls: 1,
    note: "Only runs on turns that increment the scene.",
  });

  // --- Story Progress Observer (every Nth turn) -------------------------
  const progressInterval = Math.max(1, getStoryProgressCheckInterval());
  plans.push({
    stage: "progress_observer",
    label: "Story Progress Observer",
    modelKey: progressCall.model,
    reasoningEffort: progressCall.reasoningEffort,
    inputPerCall: PROGRESS_INPUT_TOKENS,
    outputPerCall: PROGRESS_OUTPUT_TOKENS,
    expectedCalls: calibratedCalls(
      calibration,
      "progress_observer",
      1 / progressInterval,
    ),
    lowCalls: 0,
    highCalls: 1,
    note: `Fires once every ${progressInterval} turns.`,
  });

  // --- Reflection (memory-importance driven) ----------------------------
  plans.push({
    stage: "reflection",
    label: "Reflection",
    modelKey: memoryCall.model,
    reasoningEffort: memoryCall.reasoningEffort,
    inputPerCall: REFLECTION_INPUT_TOKENS,
    outputPerCall: REFLECTION_OUTPUT_TOKENS,
    expectedCalls: calibratedCalls(
      calibration,
      "reflection",
      REFLECTION_PROBABILITY,
    ),
    lowCalls: 0,
    highCalls: 1,
    note: "Only once enough important memories have piled up since the last pass.",
  });

  // --- Price everything -------------------------------------------------
  const lines = plans
    .map((plan) => planToLine(plan, calibration))
    .filter((line) => line.expectedCalls > 0 || line.highUsd > 0);

  let expectedUsd = 0;
  let lowUsd = 0;
  let highUsd = 0;
  let foregroundUsd = 0;
  let backgroundUsd = 0;
  let hasUnpricedModels = false;

  for (const line of lines) {
    expectedUsd += line.expectedUsd;
    lowUsd += line.lowUsd;
    highUsd += line.highUsd;
    if (BACKGROUND_STAGES.has(line.stage)) backgroundUsd += line.expectedUsd;
    else foregroundUsd += line.expectedUsd;
    if (line.unpriced && line.expectedCalls > 0) hasUnpricedModels = true;
  }

  const calibrationSamples = Math.max(
    0,
    ...Object.values(calibration).map((c) => c?.samples ?? 0),
  );

  if (calibrationSamples === 0) {
    assumptions.push(
      "No turns measured yet - this uses default sizings. It gets more accurate as you play.",
    );
  } else {
    assumptions.push(
      `Calibrated against your last ${calibrationSamples} turn${calibrationSamples === 1 ? "" : "s"}.`,
    );
  }
  if (hasUnpricedModels) {
    assumptions.push(
      "One or more custom models have no prices set, so the total is lower than the real cost. Add prices in Settings > AI Config.",
    );
  }
  assumptions.push(
    "Prices are the providers' list rates for your own API keys - no markup.",
  );

  return {
    expectedUsd,
    lowUsd,
    highUsd,
    lines,
    foregroundUsd,
    backgroundUsd,
    hasUnpricedModels,
    calibrationSamples,
    assumptions,
  };
}

/** Convenience for a config-only estimate that reads the Memory Size slider. */
export function estimateTurnCostFromSettings(
  storyData?: StoryData,
): TurnCostEstimate {
  let customMaxContext: number | undefined;
  let maxToolLoops: number | undefined;
  if (typeof window !== "undefined") {
    const storedContext = localStorage.getItem("customMaxContext");
    if (storedContext) {
      const parsed = parseInt(storedContext, 10);
      if (Number.isFinite(parsed) && parsed > 0) customMaxContext = parsed;
    }
    const storedLoops = localStorage.getItem("maxToolLoops");
    if (storedLoops) {
      const parsed = parseInt(storedLoops, 10);
      if (Number.isFinite(parsed) && parsed > 0) maxToolLoops = parsed;
    }
  }
  return estimateTurnCost({ storyData, customMaxContext, maxToolLoops });
}

/** Re-exported so UI can label the tier a turn is predicted to run at. */
export function describePredictedTier(storyData?: StoryData): {
  tier: number;
  modelKey: AnyModelKey;
  reasoningEffort: ReasoningEffort;
} {
  return resolveTier(predictTier(storyData));
}
