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
import {
  StoryData,
  CombatState,
  ReasoningTierState,
} from "@/app/misc/structs";

export type ReasoningEffort = "none" | "low" | "normal" | "high" | "xhigh";

export interface ReasoningTier {
  modelKey: AIModelKey;
  reasoningEffort: ReasoningEffort;
  note: string;
}

/**
 * The tier ladder. All four entries are Mistral/DeepInfra models on purpose:
 * OpenRouter/DeepSeek/Google models require a user-supplied BYOK key
 * (APIKeysContext.tsx hasKey()), so they can't be a default/guaranteed tier.
 * Mistral and DeepInfra use a server-side key billed via coins and work for
 * every user out of the box. All four also have supportsToolCalling: true
 * in AI_MODELS — required since GM adjudication calls dice/state tools
 * mid-turn (DeepSeek R1 variants were considered for tier 3 and rejected:
 * supportsToolCalling is false on those entries).
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
    modelKey: "Mistral Medium 3.1",
    reasoningEffort: "high",
    note: "rules adjudication, combat",
  },
  {
    modelKey: "DeepInfra Kimi-K2-Thinking",
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
  modelKey: AIModelKey;
  reasoningEffort: ReasoningEffort;
}

export function resolveTier(tier: number): ResolvedTier {
  const clamped = Math.max(0, Math.min(TOP_TIER, tier));
  const entry = REASONING_TIERS[clamped];
  return { tier: clamped, modelKey: entry.modelKey, reasoningEffort: entry.reasoningEffort };
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
    (c) => c.type === "enemy" && c.isActive
  );
  return activeEnemies.length === 1;
}

/** Hard floor — rules win regardless of classifier/decay/self-escalation. */
export function hardRuleFloor(state: StoryData): number {
  if (state.combatState?.active) {
    return isBossFight(state.combatState) ? 3 : 2;
  }
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
  if (state.threads?.some((t) => t.status === "active" && t.priority === "main")) {
    return 2;
  }
  return 0;
}

/**
 * True when state gives no signal at all AND the player's input is long
 * enough to plausibly be a plot-shaping action rather than simple banter —
 * the only case worth spending a tier-0 LLM classification call on.
 */
export function isClassificationAmbiguous(state: StoryData, playerInput: string): boolean {
  const hasStateSignal =
    !!state.combatState?.active ||
    !!state.activeChallenge?.active ||
    !!state.threads?.some((t) => t.status === "active" && t.priority === "main");
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
  tierState: ReasoningTierState
): EscalationDecision {
  const requested = Math.max(0, Math.min(TOP_TIER, request.tier));
  if (requested <= currentTier) {
    return { grantedTier: currentTier, capped: false };
  }
  if (requested === TOP_TIER && tierState.tier3CallsInScene >= MAX_TIER3_CALLS_PER_SCENE) {
    // Cap hit — clamp to one below top tier instead of granting another top-tier call.
    return { grantedTier: Math.max(currentTier, TOP_TIER - 1), capped: true };
  }
  return { grantedTier: requested, capped: false };
}

// ============================================================
// FALLBACK RESOLUTION
// ============================================================

/** Model name/provider for logging — matches the AI_MODELS entry shown in generation logs. */
export function describeTier(resolved: ResolvedTier): string {
  const config = getModelConfig(resolved.modelKey);
  return `tier ${resolved.tier} (${AI_MODELS[resolved.modelKey]?.name ?? resolved.modelKey}, ${config.provider}, effort=${resolved.reasoningEffort})`;
}

/** Next-lower tier to retry at when a model call fails outright. Tier 0 is the floor. */
export function fallbackTier(tier: number): number | null {
  return tier > 0 ? tier - 1 : null;
}
