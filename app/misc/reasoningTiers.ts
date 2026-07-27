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

import { AI_MODELS, AIModelKey, getModelConfig } from "@/app/misc/ai_prices";
import { getCustomModelIfUUID } from "@/app/misc/user_settings";
import { StoryData, CombatState, ReasoningTierState } from "@/app/misc/structs";

export type ReasoningEffort = "none" | "low" | "normal" | "high" | "xhigh";

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
 * available" one. This ladder deliberately spans two providers as an
 * example of that: Mistral for the cheap/default tiers, OpenRouter for the
 * heavier ones. Swap any `modelKey` to any AI_MODELS entry to reconfigure —
 * whichever providers end up in use, the corresponding key (mistralKey,
 * openRouterKey, deepseekKey, googleKey, deepinfraKey) must be configured
 * in Settings for that tier to actually dispatch; a missing key fails over
 * to the next-lower tier (see fallbackTier below) rather than crashing.
 *
 * All entries have supportsToolCalling: true in AI_MODELS — required since
 * GM adjudication calls dice/state tools mid-turn (DeepSeek R1 variants
 * were considered for tier 3 and rejected: supportsToolCalling is false on
 * those entries).
 */
export const REASONING_TIERS: ReasoningTier[] = [
  {
    modelKey: "Mistral Nemo",
    reasoningEffort: "none",
    note: "banter, descriptions, NPC chatter",
  },
  {
    modelKey: "Mistral Small 3.2",
    reasoningEffort: "none",
    note: "default GM narration / skill checks",
  },
  {
    modelKey: "Grok 4.5",
    reasoningEffort: "high",
    note: "rules adjudication, combat",
  },
  {
    modelKey: "Kimi K3",
    reasoningEffort: "xhigh",
    note: "boss fights, campaign-shaping calls",
  },
];

/** Fixed narration voice — always tier 1, regardless of adjudication tier. */
export const NARRATION_MODEL_KEY: AIModelKey = "Mistral Small 3.2";

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

/** Raw overrides array, one slot per REASONING_TIERS index (null = use default). */
export function getTierOverrides(): (TierOverride | null)[] {
  if (typeof window === "undefined") return REASONING_TIERS.map(() => null);
  try {
    const raw = localStorage.getItem(TIER_OVERRIDES_KEY);
    const parsed: (TierOverride | null)[] = raw ? JSON.parse(raw) : [];
    return REASONING_TIERS.map((_, i) => parsed[i] ?? null);
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

/** REASONING_TIERS with any user overrides applied - this is what resolveTier() reads. */
export function getEffectiveTiers(): ReasoningTier[] {
  const overrides = getTierOverrides();
  return REASONING_TIERS.map((tier, i) => {
    const o = overrides[i];
    return o
      ? {
          modelKey: o.modelKey,
          reasoningEffort: o.reasoningEffort,
          note: tier.note,
        }
      : tier;
  });
}

export function getNarrationModelOverride(): AnyModelKey | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(NARRATION_OVERRIDE_KEY) || null;
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

/** NARRATION_MODEL_KEY with any user override applied - always used in place of the constant. */
export function getEffectiveNarrationModelKey(): AnyModelKey {
  return getNarrationModelOverride() || NARRATION_MODEL_KEY;
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
