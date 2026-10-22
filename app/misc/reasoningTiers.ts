/**
 * Reasoning-Tier Model Router
 *
 * Picks which (model, reasoning_effort) pair handles each GM adjudication
 * call. Tier selection is hybrid, in priority order:
 *   1. Hard rules (combat) floor the tier regardless of anything else.
 *   2. A cheap, mostly-deterministic classifier picks a default tier from
 *      game-state alone (falls back to a single tier-0 LLM call only when
 *      state gives no signal and the input looks plot-significant).
 *   3. The GM model may self-escalate mid-turn via the `set_reasoning_tier`
 *      tool (see gmTools.ts) — capped and decayed by generation.ts so a
 *      session can't ratchet upward and never come back down.
 *
 * All real model IDs live in AI_MODELS (ai_prices.ts) — this file only
 * references AI_MODELS keys, never raw provider model strings.
 */

import {
  AI_MODELS,
  AIModelKey,
  getModelConfig,
  isKnownModelKey,
  resolveModelKeyAlias,
} from "@/app/misc/ai_prices";
import { getCustomModelIfUUID } from "@/app/misc/user_settings";
import {
  canRunClaudeCliModel,
  claudeCliBlockReason,
  isClaudeCliModel,
} from "@/app/misc/claudeCliModels";
import { StoryData, CombatState, ReasoningTierState } from "@/app/misc/structs";

export type ReasoningEffort = "none" | "low" | "normal" | "high" | "xhigh";

/** Every effort, cheapest first - what each effort `<select>` in Settings lists. */
export const REASONING_EFFORTS: ReasoningEffort[] = [
  "none",
  "low",
  "normal",
  "high",
  "xhigh",
];

/**
 * The effort a slot runs at until the player picks one (decision 53). "none" is
 * the cheapest effort each model allows: providerCall.ts's
 * applyReasoningEffort sends Claude, GLM and the OpenRouter models whose
 * reasoning is mandatory (`reasoningMandatory` in the catalog: Grok 4.5 and
 * 4.7, Qwen 3.8 Max, GPT-6.1 Sol, MiniMax M2, which reject an explicit "none")
 * `low`, Z.ai `low`, DeepSeek thinking disabled, and any other OpenRouter
 * model `reasoning: {effort: "none"}`, which really turns reasoning off.
 * Mistral gets nothing, as it has no lever.
 */
export const DEFAULT_REASONING_EFFORT: ReasoningEffort = "none";

/** True for one of the five efforts; a junk value from storage is not. */
export function isReasoningEffort(value: unknown): value is ReasoningEffort {
  return (
    typeof value === "string" &&
    (REASONING_EFFORTS as string[]).includes(value)
  );
}

/** An AI_MODELS key, or a user-added custom (OpenRouter BYOK) model's UUID. */
export type AnyModelKey = AIModelKey | string;

export interface ReasoningTier {
  modelKey: AnyModelKey;
  reasoningEffort: ReasoningEffort;
  note: string;
}

/**
 * The tier ladder. Every provider is BYOK now (app/misc/APIKeysContext.tsx —
 * there's no server-side key for any provider), so tiers are free to mix
 * providers per-tier rather than being constrained to a single "guaranteed
 * available" one. Swap any `modelKey` to any AI_MODELS entry to reconfigure —
 * whichever providers end up in use, the corresponding key (openRouterKey,
 * deepseekKey, googleKey, mistralKey, deepinfraKey, zaiKey) must be
 * configured in Settings for that tier to actually dispatch. A missing key
 * does NOT fail over to the next-lower tier: GM rounds are streamed, so the
 * proxy (and providerFetch in the native apps) answers 200 with an in-stream
 * `error` event rather than a failed status, generation.ts throws that
 * event, and its `!gmResponse.ok` -> fallbackTier branch never fires. The turn
 * stops with an error toast naming the provider whose key is missing. (The
 * same holds for a provider's HTTP error on a streamed round; only a non-200
 * from the proxy itself, or the subscription bridge's 502, takes fallbackTier.)
 *
 * The defaults (decision 50, "Balanced") are Claude Haiku 5.5 for the two
 * light tiers, GLM 5.3 for combat and rules, and Claude Sonnet 5.5 for boss
 * fights and campaign-shaping calls: all three are OpenRouter models, so one
 * OpenRouter key runs the whole ladder. The efforts are unchanged from the
 * Mistral/Grok/Kimi ladder these replaced, and providerCall.ts already
 * translates each for its model: Claude's "none" is sent as "low" (its
 * thinking cannot be turned off), GLM 5.3 always thinks and takes "high" as
 * "high", and Sonnet's "xhigh" goes out as OpenRouter's "xhigh".
 *
 * All entries have supportsToolCalling: true in AI_MODELS — required since
 * GM adjudication calls dice/state tools mid-turn (DeepSeek R1 variants
 * were considered for tier 3 and rejected: supportsToolCalling is false on
 * those entries).
 */
export const REASONING_TIERS: ReasoningTier[] = [
  {
    modelKey: "Claude Haiku 5.5",
    reasoningEffort: "none",
    note: "banter, descriptions, NPC chatter",
  },
  {
    modelKey: "Claude Haiku 5.5",
    reasoningEffort: "none",
    note: "ordinary skill checks and everyday GM calls",
  },
  {
    modelKey: "GLM 5.3",
    reasoningEffort: "high",
    note: "rules adjudication, combat",
  },
  {
    modelKey: "Claude Sonnet 5.5",
    reasoningEffort: "xhigh",
    note: "boss fights, campaign-shaping calls",
  },
];

/**
 * The narration voice (decision 50): the model the story-continuation call
 * and the choices call run on, regardless of adjudication tier. When the GM's
 * own final round already wrote the prose, that round's tier model wrote it
 * instead (generation.ts, gmFinalStoryContent).
 */
export const NARRATION_MODEL_KEY: AIModelKey = "GLM 5.3";

export const SCENE_BASELINE_TIER = 1;
export const MAX_TIER3_CALLS_PER_SCENE = 3;
export const TOP_TIER = REASONING_TIERS.length - 1;

export interface ResolvedTier {
  tier: number;
  modelKey: AnyModelKey;
  reasoningEffort: ReasoningEffort;
}

export function resolveTier(tier: number): ResolvedTier {
  const tiers = getEffectiveTiers();
  const clamped = Math.max(0, Math.min(tiers.length - 1, tier));
  const entry = tiers[clamped];
  return {
    tier: clamped,
    modelKey: entry.modelKey,
    reasoningEffort: entry.reasoningEffort,
  };
}

// ============================================================
// USER OVERRIDES
// ============================================================
// Lets Settings > AI Config swap which model/effort fills each tier slot
// (and which model handles narration) without touching REASONING_TIERS -
// the tier *count* and the hard-rule/classifier logic that assigns turns to
// tier indices stay fixed; only the (modelKey, reasoningEffort) each index
// resolves to is user-configurable. Persisted to localStorage since there's
// no backend/account system.

const TIER_OVERRIDES_KEY = "reasoningTierOverrides";
const NARRATION_OVERRIDE_KEY = "narrationModelOverride";
const NARRATION_EFFORT_KEY = "narrationEffortOverride";
export const REASONING_CONFIG_CHANGED_EVENT = "reasoning-tier-config-changed";

export interface TierOverride {
  modelKey: AnyModelKey;
  reasoningEffort: ReasoningEffort;
}

function notifyConfigChanged() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(REASONING_CONFIG_CHANGED_EVENT));
  }
}

/**
 * The saved overrides, one slot per REASONING_TIERS index (null = use
 * default). A slot whose saved model the catalog no longer has (a model its
 * provider shut down, or a key synced from a newer build) reads as null, so it
 * uses its default instead of reaching getModelConfig, which would swap in
 * DeepSeek V4 Flash. A retired key that LEGACY_MODEL_KEY_ALIASES maps to a
 * successor is returned as the successor's key instead, so the slot keeps
 * working. The stored value is left alone; the next write replaces it.
 */
export function getTierOverrides(): (TierOverride | null)[] {
  if (typeof window === "undefined") return REASONING_TIERS.map(() => null);
  try {
    const raw = localStorage.getItem(TIER_OVERRIDES_KEY);
    const parsed: (TierOverride | null)[] = raw ? JSON.parse(raw) : [];
    return REASONING_TIERS.map((_, i) => {
      const o = parsed[i];
      return o && isKnownModelKey(o.modelKey)
        ? { ...o, modelKey: resolveModelKeyAlias(o.modelKey) }
        : null;
    });
  } catch {
    return REASONING_TIERS.map(() => null);
  }
}

export function setTierOverride(
  index: number,
  override: TierOverride | null,
): void {
  if (typeof window === "undefined") return;
  const current = getTierOverrides();
  current[index] = override;
  localStorage.setItem(TIER_OVERRIDES_KEY, JSON.stringify(current));
  notifyConfigChanged();
}

export function resetTierOverrides(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(TIER_OVERRIDES_KEY);
  notifyConfigChanged();
}

/**
 * Whether this device can run a model right now. A Claude subscription model
 * runs only through the desktop app's `claude` CLI, but tier and narration
 * choices sync between devices (syncableSettingsKeys.ts), so one can arrive
 * on a phone or the web build (decision 16); and during an online session it
 * is blocked on the desktop too (decision 29).
 */
function runsOnThisDevice(modelKey: string): boolean {
  return !isClaudeCliModel(modelKey) || canRunClaudeCliModel();
}

/**
 * REASONING_TIERS with any user overrides applied - this is what resolveTier()
 * reads. An override this device cannot run (a synced subscription model off
 * the desktop) is skipped, so that slot uses its default; Settings shows why
 * (getSubscriptionFallbacks).
 */
export function getEffectiveTiers(): ReasoningTier[] {
  const overrides = getTierOverrides();
  return REASONING_TIERS.map((tier, i) => {
    const o = overrides[i];
    return o && runsOnThisDevice(o.modelKey)
      ? {
          modelKey: o.modelKey,
          reasoningEffort: o.reasoningEffort,
          note: tier.note,
        }
      : tier;
  });
}

/**
 * The saved narration voice; null when none, or when the catalog dropped it. A
 * retired key with a successor (LEGACY_MODEL_KEY_ALIASES) comes back as the
 * successor's key.
 */
export function getNarrationModelOverride(): AnyModelKey | null {
  if (typeof window === "undefined") return null;
  const stored = localStorage.getItem(NARRATION_OVERRIDE_KEY);
  return isKnownModelKey(stored) ? resolveModelKeyAlias(stored) : null;
}

export function setNarrationModelOverride(modelKey: AnyModelKey | null): void {
  if (typeof window === "undefined") return;
  if (modelKey) {
    localStorage.setItem(NARRATION_OVERRIDE_KEY, modelKey);
  } else {
    localStorage.removeItem(NARRATION_OVERRIDE_KEY);
  }
  notifyConfigChanged();
}

/**
 * NARRATION_MODEL_KEY with any user override applied - always used in place
 * of the constant. Like getEffectiveTiers, an override this device cannot run
 * falls back to the default.
 */
export function getEffectiveNarrationModelKey(): AnyModelKey {
  const override = getNarrationModelOverride();
  return override && runsOnThisDevice(override) ? override : NARRATION_MODEL_KEY;
}

/**
 * The saved narration effort (decision 53); null when none was saved, or when
 * the stored value is not one of the five efforts (a hand-edited or
 * newer-build value), so a junk value reads as the default instead of being
 * sent to a provider.
 */
export function getNarrationEffortOverride(): ReasoningEffort | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = localStorage.getItem(NARRATION_EFFORT_KEY);
    return isReasoningEffort(stored) ? stored : null;
  } catch {
    return null;
  }
}

export function setNarrationEffortOverride(
  effort: ReasoningEffort | null,
): void {
  if (typeof window === "undefined") return;
  if (effort && isReasoningEffort(effort)) {
    localStorage.setItem(NARRATION_EFFORT_KEY, effort);
  } else {
    localStorage.removeItem(NARRATION_EFFORT_KEY);
  }
  notifyConfigChanged();
}

/**
 * How hard the narration voice thinks (decision 53): the story continuation,
 * the choices calls and the Observer's rewrite when the Observer is unpinned.
 * DEFAULT_REASONING_EFFORT ("none") until the player picks one in Settings.
 *
 * It follows the voice, not the player's last pick: when the saved narration
 * model cannot be used here - a Claude subscription voice this device cannot
 * run (decisions 16 and 29), or one the catalog no longer has - the call falls
 * back to NARRATION_MODEL_KEY (getEffectiveNarrationModelKey), and the effort
 * chosen for that other model would be a guess for this one, so it falls back
 * to "none" too.
 */
export function getEffectiveNarrationEffort(): ReasoningEffort {
  if (typeof window === "undefined") return DEFAULT_REASONING_EFFORT;
  let savedModel: string | null = null;
  try {
    savedModel = localStorage.getItem(NARRATION_OVERRIDE_KEY);
  } catch {
    return DEFAULT_REASONING_EFFORT;
  }
  // Compare against the saved voice as the app reads it (getNarrationModelOverride
  // resolves a retired key to its successor, LEGACY_MODEL_KEY_ALIASES), not
  // the raw stored string: a saved "Mistral Small 3.2" runs as "Mistral Small
  // 4", and its effort must follow it rather than fall back to "none".
  if (savedModel && getEffectiveNarrationModelKey() !== getNarrationModelOverride()) {
    return DEFAULT_REASONING_EFFORT;
  }
  return getNarrationEffortOverride() ?? DEFAULT_REASONING_EFFORT;
}

export interface SubscriptionFallback {
  /** "Tier 2" or "Narration". */
  slot: string;
  /** Why it falls back: this device cannot run the CLI, or an online session is active. */
  reason: "device" | "online";
  /** The subscription model the synced setting names. */
  modelKey: string;
  /** What this device uses instead. */
  fallbackModelKey: string;
}

/**
 * Decisions 16 and 29: the slots whose Claude subscription model cannot run
 * here and now (a synced choice on a device without the CLI, or any
 * subscription choice during an online session), and the default each uses
 * instead - for Settings' notice and the in-game one. Empty on the desktop
 * app outside an online session.
 */
export function getSubscriptionFallbacks(): SubscriptionFallback[] {
  const fallbacks: SubscriptionFallback[] = [];
  getTierOverrides().forEach((o, i) => {
    if (o && !runsOnThisDevice(o.modelKey)) {
      fallbacks.push({
        slot: `Tier ${i}`,
        reason: claudeCliBlockReason() ?? "device",
        modelKey: o.modelKey,
        fallbackModelKey: REASONING_TIERS[i].modelKey,
      });
    }
  });
  const narration = getNarrationModelOverride();
  if (narration && !runsOnThisDevice(narration)) {
    fallbacks.push({
      slot: "Narration",
      reason: claudeCliBlockReason() ?? "device",
      modelKey: narration,
      fallbackModelKey: NARRATION_MODEL_KEY,
    });
  }
  return fallbacks;
}

// ============================================================
// HARD RULES + DETERMINISTIC CLASSIFIER
// ============================================================

/**
 * No explicit "boss" flag exists on Combatant in structs.ts. Heuristic:
 * a single active enemy is treated as an elite/solo fight (boss-tier);
 * multiple active enemies is a group fight (tier 2, not 3). Tunable.
 */
function isBossFight(combatState: CombatState): boolean {
  const activeEnemies = combatState.combatants.filter(
    (c) => c.type === "enemy" && c.isActive,
  );
  return activeEnemies.length === 1;
}

/** Hard floor — rules win regardless of classifier/decay/self-escalation. */
export function hardRuleFloor(state: StoryData): number {
  // Session zero (premise/character setup, before the GM calls start_game)
  // is inherently campaign-shaping - always run it at the top tier.
  if (state.sessionZeroActive) return TOP_TIER;
  if (state.combatState?.active) {
    return isBossFight(state.combatState) ? 3 : 2;
  }
  return 0;
}

/**
 * Deterministic tier floor from a roll's own declared `stakes` (H7 fix).
 *
 * `formula_roll`/`opposed_formula` already accept a structured, model-set
 * `stakes: "low" | "medium" | "high" | "deadly"` enum, but until this fix
 * it was pure narration text — never read by the tier router, so a model
 * could mark its own roll "deadly" and the system would still let it (or
 * any later round) run at the cheapest tier, because self-escalation via
 * `set_reasoning_tier` outside combat was always optional. This makes
 * escalation for self-declared high-stakes rolls non-optional, using the
 * same severity mapping `hardRuleFloor` already uses for combat (regular
 * combat and "high" stakes both floor at the rules-adjudication tier;
 * boss fights and "deadly" stakes both floor at the top tier) — no new
 * mechanic invented, just extending the existing floor concept to a
 * second structured signal the model was already providing.
 */
export function stakesFloor(stakes?: "low" | "medium" | "high" | "deadly" | string): number {
  if (stakes === "deadly") return TOP_TIER;
  if (stakes === "high") return TOP_TIER - 1;
  return 0;
}

/**
 * Deterministic per-turn default from game-state alone — no LLM call.
 * Always returns a tier (freeform talk defaults to 0); ambiguity is
 * handled separately by isClassificationAmbiguous/buildClassifierPrompt.
 */
export function classifyTierDeterministic(state: StoryData): number {
  if (state.combatState?.active) {
    return isBossFight(state.combatState) ? 3 : 2;
  }
  if (state.activeChallenge?.active) {
    return 1;
  }
  if (
    state.threads?.some((t) => t.status === "active" && t.priority === "main")
  ) {
    return 2;
  }
  return 0;
}

/**
 * True when state gives no signal at all AND the player's input is long
 * enough to plausibly be a plot-shaping action rather than simple banter —
 * the only case worth spending a tier-0 LLM classification call on.
 */
export function isClassificationAmbiguous(
  state: StoryData,
  playerInput: string,
): boolean {
  const hasStateSignal =
    !!state.combatState?.active ||
    !!state.activeChallenge?.active ||
    !!state.threads?.some(
      (t) => t.status === "active" && t.priority === "main",
    );
  return !hasStateSignal && playerInput.trim().length > 200;
}

/** Small single-purpose prompt for the optional tier-0 classification call. */
export function buildClassifierPrompt(playerInput: string): string {
  return `Classify the following player action for a tabletop RPG turn. Reply with ONLY one word: "freeform", "skill_check", or "plot_beat".

- "freeform": casual talk, simple description, no stakes.
- "skill_check": a single discrete check/attempt with a clear outcome.
- "plot_beat": a pivotal, campaign-shaping decision or revelation.

Player action: "${playerInput}"`;
}

export function classificationLabelToTier(label: string): number {
  const normalized = label.trim().toLowerCase();
  if (normalized.includes("plot_beat")) return 2;
  if (normalized.includes("skill_check")) return 1;
  return 0;
}

/**
 * Synchronous deterministic-first classifier: classifyTier(state, playerInput) -> int.
 * Callers that want the LLM-fallback path should check isClassificationAmbiguous
 * first and override this result with classificationLabelToTier(...) if so.
 */
export function classifyTier(state: StoryData, _playerInput: string): number {
  return classifyTierDeterministic(state);
}

// ============================================================
// DECAY + SCENE-SCOPED ESCALATION CAP
// ============================================================

/** Opaque scene-boundary key: bounded by the current combat encounter, or a rolling window of turns outside combat. */
export function computeSceneKey(state: StoryData): string {
  if (state.combatState?.active) {
    return `combat:${state.combatState.name ?? "encounter"}`;
  }
  const turnBucket = Math.floor((state.scene?.parts?.length ?? 0) / 20);
  return `freeform:${turnBucket}`;
}

// Tools whose successful call satisfies the M2 roll-invariant gate below -
// deliberately narrow (this codebase's audit history repeatedly rules out
// NLP-style grading of freeform narration as the alternative).
const ROLL_OR_ORACLE_TOOL_NAMES = new Set([
  "formula_roll",
  // A roll behind the screen is still a roll - it settles the outcome with
  // dice rather than with narration, which is all this gate asks for.
  "gm_roll",
  "opposed_formula",
  "npc_roll",
  "fate_question",
]);

/**
 * M2 roll-invariant gate: is this scene "contested enough" that ending the
 * GM's turn on prose alone (zero roll/oracle tool calls) would let a stated
 * success/failure bypass the oracle layer entirely? Scope is deliberately
 * narrow and structural — combat active, a challenge active, or the GM
 * itself declared high/deadly stakes on a roll earlier this scene (see
 * applyStakesEscalation, gmExecutor.ts) — not a judgment call about the
 * content of any particular turn's narration.
 */
export function isSceneGatedForRoll(state: StoryData): boolean {
  return (
    !!state.combatState?.active ||
    !!state.activeChallenge?.active ||
    (!!state.reasoningTierState?.highStakesSceneKey &&
      state.reasoningTierState.highStakesSceneKey === computeSceneKey(state))
  );
}

/** True if at least one of the tool names called this turn satisfies the gate. */
export function hasSatisfiedRollGate(calledToolNames: string[]): boolean {
  return calledToolNames.some((name) => ROLL_OR_ORACLE_TOOL_NAMES.has(name));
}

export function getTierState(state: StoryData): ReasoningTierState {
  return (
    state.reasoningTierState ?? {
      currentTier: SCENE_BASELINE_TIER,
      tier3CallsInScene: 0,
      lastSceneKey: computeSceneKey(state),
    }
  );
}

/** One-step decay toward baseline: an escalated tier fades gradually, not instantly, unless re-triggered. */
export function decayTierTowardBaseline(currentTier: number): number {
  if (currentTier > SCENE_BASELINE_TIER) return currentTier - 1;
  return SCENE_BASELINE_TIER;
}

export interface EscalationRequest {
  tier: number;
  reason: string;
}

export interface EscalationDecision {
  grantedTier: number;
  capped: boolean; // true if a tier-3 request was clamped down due to the scene cap
}

/**
 * Applies the decay/cap policy to a set_reasoning_tier request. Only
 * honors escalation (requestedTier > currentTier) — a model asking to
 * downgrade isn't a real use case and is ignored.
 */
export function resolveTierEscalation(
  request: EscalationRequest,
  currentTier: number,
  tierState: ReasoningTierState,
): EscalationDecision {
  const requested = Math.max(0, Math.min(TOP_TIER, request.tier));
  if (requested <= currentTier) {
    return { grantedTier: currentTier, capped: false };
  }
  if (
    requested === TOP_TIER &&
    tierState.tier3CallsInScene >= MAX_TIER3_CALLS_PER_SCENE
  ) {
    // Cap hit — clamp to one below top tier instead of granting another top-tier call.
    return { grantedTier: Math.max(currentTier, TOP_TIER - 1), capped: true };
  }
  return { grantedTier: requested, capped: false };
}

/**
 * Runs a tier-escalation request through the same decay/cap policy as
 * `set_reasoning_tier` and persists the result onto `storyData.reasoningTierState`
 * (mutating `modified`, same convention as every other GM tool executor).
 * Shared by the model's own self-escalation tool AND by deterministic,
 * non-optional floors (e.g. `stakesFloor` for high/deadly-stakes rolls) so
 * both paths update state identically and respect the same scene cap.
 */
export function applyTierEscalation(
  storyData: StoryData,
  requestedTier: number,
  reason: string,
): EscalationDecision & { previousTier: number } {
  const tierState = getTierState(storyData);
  const decision = resolveTierEscalation(
    { tier: requestedTier, reason },
    tierState.currentTier,
    tierState,
  );

  storyData.reasoningTierState = {
    currentTier: decision.grantedTier,
    tier3CallsInScene:
      decision.grantedTier === TOP_TIER
        ? tierState.tier3CallsInScene + 1
        : tierState.tier3CallsInScene,
    lastSceneKey: tierState.lastSceneKey,
    // Preserved as-is here; only applyStakesEscalation (gmExecutor.ts) sets
    // this, when the request came from a high/deadly-stakes roll specifically.
    highStakesSceneKey: tierState.highStakesSceneKey,
  };

  return { ...decision, previousTier: tierState.currentTier };
}

// ============================================================
// FALLBACK RESOLUTION
// ============================================================

/** Human-readable model name for a resolved tier's modelKey - shared by describeTier and any UI tooltip. */
export function getTierModelDisplayName(modelKey: AnyModelKey): string {
  const customModel = getCustomModelIfUUID(modelKey);
  return (
    customModel?.name ?? AI_MODELS[modelKey as AIModelKey]?.name ?? modelKey
  );
}

/** Model name/provider for logging — matches the AI_MODELS entry shown in generation logs. */
export function describeTier(resolved: ResolvedTier): string {
  const config = getModelConfig(resolved.modelKey);
  const displayName = getTierModelDisplayName(resolved.modelKey);
  return `tier ${resolved.tier} (${displayName}, ${config.provider}, effort=${resolved.reasoningEffort})`;
}

/** Next-lower tier to retry at when a model call fails outright. Tier 0 is the floor. */
export function fallbackTier(tier: number): number | null {
  return tier > 0 ? tier - 1 : null;
}
