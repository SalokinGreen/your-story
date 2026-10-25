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
 * The defaults (decisions 50 and 122) are GLM 5.3 for the three lower tiers
 * (tiers 0 and 1 at "none", which GLM gets as "low" because it always thinks;
 * tier 2, combat and rules, at "high") and Claude Sonnet 5.5 for boss fights
 * and campaign-shaping calls. Settings shows them as two slots, Default
 * (tiers 0-2) and Advanced (tier 3); the engine still picks a tier per turn.
 * Both are OpenRouter models, so one OpenRouter key runs the whole ladder.
 * providerCall.ts translates each effort for its model: GLM 5.3 takes
 * "high" as "high", and Sonnet's "xhigh" goes out as OpenRouter's "xhigh".
 *
 * All entries have supportsToolCalling: true in AI_MODELS — required since
 * GM adjudication calls dice/state tools mid-turn (DeepSeek R1 variants
 * were considered for tier 3 and rejected: supportsToolCalling is false on
 * those entries).
 */
export const REASONING_TIERS: ReasoningTier[] = [
  {
    modelKey: "GLM 5.3",
    reasoningEffort: "none",
    note: "banter, descriptions, NPC chatter",
  },
  {
    modelKey: "GLM 5.3",
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
 * Default's shipped model (decisions 50 and 122). Narration follows the
 * Default slot (getEffectiveNarrationModelKey), so this is the model the
 * story-continuation call and the choices call run on until the player picks
 * one for Default. When the GM's own final round already wrote the prose,
 * that round's tier model wrote it instead (generation.ts,
 * gmFinalStoryContent).
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
 * The higher of two efforts, by REASONING_EFFORTS order (cheapest first).
 * Combat's floor (decision 123) uses it.
 */
export function atLeastEffort(
  effort: ReasoningEffort,
  floor: ReasoningEffort,
): ReasoningEffort {
  return REASONING_EFFORTS.indexOf(effort) >= REASONING_EFFORTS.indexOf(floor)
    ? effort
    : floor;
}

/** Tier 2 is combat and rules: it never thinks below this (decision 123). */
const RULES_TIER = 2;
const RULES_TIER_EFFORT_FLOOR: ReasoningEffort = "high";

/**
 * REASONING_TIERS with any user overrides applied - this is what resolveTier()
 * reads. An override this device cannot run (a synced subscription model off
 * the desktop) is skipped, so that slot uses its default; Settings shows why
 * (getSubscriptionFallbacks). Tier 2 runs at the higher of its resolved effort
 * and "high" (decision 123): the player's Default effort is one number, but a
 * combat or rules turn should not drop below it, whether the effort came from
 * an override or from the shipped ladder.
 */
export function getEffectiveTiers(): ReasoningTier[] {
  const overrides = getTierOverrides();
  return REASONING_TIERS.map((tier, i) => {
    const o = overrides[i];
    const resolved: ReasoningTier =
      o && runsOnThisDevice(o.modelKey)
        ? {
            modelKey: o.modelKey,
            reasoningEffort: o.reasoningEffort,
            note: tier.note,
          }
        : tier;
    return i === RULES_TIER
      ? {
          ...resolved,
          reasoningEffort: atLeastEffort(
            resolved.reasoningEffort,
            RULES_TIER_EFFORT_FLOOR,
          ),
        }
      : resolved;
  });
}

// ============================================================
// MODEL SLOTS (decisions 118-124)
// ============================================================
// Settings shows two slots over the four-tier engine: Default fills tiers
// 0-2 and Advanced fills tier 3. Storage is still the four-entry
// reasoningTierOverrides array, so sync and older builds need no migration.

export type ModelSlot = "default" | "advanced";

/** The tier entries each slot fills: Default 0-2, Advanced 3 (decision 119). */
export const SLOT_TIERS: Record<ModelSlot, readonly number[]> = {
  default: [0, 1, 2],
  advanced: [3],
};

/** The slot a tier belongs to: 0-2 Default, 3 Advanced. */
export function slotForTier(tier: number): ModelSlot {
  return tier >= TOP_TIER ? "advanced" : "default";
}

/**
 * The tier that stands for each slot when one model is needed. Default is tier
 * 1 and only tier 1 - the baseline, what most turns run on - so the row,
 * narration and the classifier's fallback all agree. Tiers 0 and 2 never stand
 * in for it; they show only in the "Mixed" line (getDefaultSlotMix).
 */
const SLOT_REPRESENTATIVE_TIER: Record<ModelSlot, number> = {
  default: SCENE_BASELINE_TIER,
  advanced: TOP_TIER,
};

/** The slot's saved choice: tier 1's override for Default, tier 3's for Advanced; null when unset. */
export function getSlotOverride(slot: ModelSlot): TierOverride | null {
  return getTierOverrides()[SLOT_REPRESENTATIVE_TIER[slot]] ?? null;
}

/**
 * What the slot runs on here and now: tier 1 of the effective ladder for
 * Default, tier 3 for Advanced. A subscription model this device cannot run
 * reads as the shipped default.
 */
export function getEffectiveSlot(slot: ModelSlot): {
  modelKey: AnyModelKey;
  reasoningEffort: ReasoningEffort;
} {
  const entry = getEffectiveTiers()[SLOT_REPRESENTATIVE_TIER[slot]];
  return { modelKey: entry.modelKey, reasoningEffort: entry.reasoningEffort };
}

function sameOverride(
  a: TierOverride | null,
  b: TierOverride | null,
): boolean {
  if (!a || !b) return !a && !b;
  return a.modelKey === b.modelKey && a.reasoningEffort === b.reasoningEffort;
}

/**
 * Default's entries 0 and 2 when they differ from entry 1 (a player set the
 * tiers apart in an older build, or on another device), for the Settings
 * "Mixed" line. Empty after any Default save, which writes all three. Entries
 * compare as stored (unset equals unset), so a fresh profile is not Mixed
 * even though tier 2 ships at "high"; the effort reported for tier 2 includes
 * combat's floor, because that is what runs.
 */
export function getDefaultSlotMix(): {
  tier: 0 | 2;
  modelKey: AnyModelKey;
  reasoningEffort: ReasoningEffort;
}[] {
  const overrides = getTierOverrides();
  const base = overrides[SLOT_REPRESENTATIVE_TIER.default];
  const mix: {
    tier: 0 | 2;
    modelKey: AnyModelKey;
    reasoningEffort: ReasoningEffort;
  }[] = [];
  for (const tier of [0, 2] as const) {
    const entry = overrides[tier];
    if (sameOverride(entry, base)) continue;
    const shown = entry ?? REASONING_TIERS[tier];
    mix.push({
      tier,
      modelKey: shown.modelKey,
      reasoningEffort:
        tier === RULES_TIER
          ? atLeastEffort(shown.reasoningEffort, RULES_TIER_EFFORT_FLOOR)
          : shown.reasoningEffort,
    });
  }
  return mix;
}

/**
 * Saves a slot's choice (null clears it): Default writes entries 0, 1 and 2,
 * Advanced writes entry 3, in one write and one change event. It works on the
 * RAW stored array, not getTierOverrides(): that read turns a model this build
 * does not know (a newer build's choice, synced here) into null, and writing it
 * back would erase it. Every entry the slot does not own is kept as stored.
 * Malformed JSON counts as four unset entries, as everywhere else.
 */
export function setSlotOverride(
  slot: ModelSlot,
  override: TierOverride | null,
): void {
  if (typeof window === "undefined") return;
  let stored: unknown[] = [];
  try {
    const raw = localStorage.getItem(TIER_OVERRIDES_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (Array.isArray(parsed)) stored = parsed;
  } catch {
    stored = [];
  }
  const next: unknown[] = [...stored];
  while (next.length < REASONING_TIERS.length) next.push(null);
  for (const tier of SLOT_TIERS[slot]) {
    next[tier] = override ? { ...override } : null;
  }
  localStorage.setItem(TIER_OVERRIDES_KEY, JSON.stringify(next));
  notifyConfigChanged();
}

/**
 * The nearest tier above or below `from` that is a different call in the given
 * effective ladder; null when none is. With Default filling tiers 0 and 1 with
 * one call, "one tier up" can be the same call, and a retry onto it would be a
 * reroll, not a change (design §3). `by` says what has to differ: "call"
 * (model or effort; the Observer's retry, where thinking harder on the same
 * model is a real change) or "model" (the step down after a provider error,
 * where the same model at a lower effort would only fail again).
 */
export function nextDistinctTier(
  from: number,
  direction: "up" | "down",
  tiers: readonly {
    modelKey: AnyModelKey;
    reasoningEffort: ReasoningEffort;
  }[],
  by: "call" | "model" = "call",
): number | null {
  const here = tiers[from];
  if (!here) return null;
  const step = direction === "up" ? 1 : -1;
  for (let t = from + step; t >= 0 && t < tiers.length; t += step) {
    if (
      tiers[t].modelKey !== here.modelKey ||
      (by === "call" && tiers[t].reasoningEffort !== here.reasoningEffort)
    ) {
      return t;
    }
  }
  return null;
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
 * The model the story-continuation call, the choices call and the Observer's
 * rewrite run on. Narration follows the Default slot (decision 118): the saved
 * narration override (getNarrationModelOverride) stays stored and synced so an
 * older device keeps its voice, but it is no longer read here.
 */
export function getEffectiveNarrationModelKey(): AnyModelKey {
  return getEffectiveSlot("default").modelKey;
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
 * How hard the narration thinks (decision 53): the story continuation, the
 * choices calls and the Observer's rewrite when the Observer is unpinned. It is
 * the Default slot's effort (decision 118); the saved narration effort is no
 * longer read. Because it comes from the same effective entry as the model, a
 * Default whose subscription model this device cannot run falls back to the
 * shipped model and the shipped effort together.
 */
export function getEffectiveNarrationEffort(): ReasoningEffort {
  return getEffectiveSlot("default").reasoningEffort;
}

export interface SubscriptionFallback {
  /** "Default", "Advanced", or a Mixed Default's tiers: "Default, tier 2". */
  slot: string;
  /** Why it falls back: this device cannot run the CLI, or an online session is active. */
  reason: "device" | "online";
  /** The subscription model the synced setting names. */
  modelKey: string;
  /** What this device uses instead. */
  fallbackModelKey: string;
}

function tierListLabel(tiers: number[]): string {
  return tiers.length === 1
    ? `tier ${tiers[0]}`
    : `tiers ${tiers.slice(0, -1).join(", ")} and ${tiers[tiers.length - 1]}`;
}

/**
 * Decisions 16 and 29: the slots whose Claude subscription model cannot run
 * here and now (a synced choice on a device without the CLI, or any
 * subscription choice during an online session), and the default each uses
 * instead - for Settings' notice and the in-game one. Empty on the desktop
 * app outside an online session.
 *
 * Every stored entry is checked, not one per slot, because an older build can
 * leave Default's entries apart. Tier 3 is "Advanced". A blocked entry 1 is
 * "Default", and covers any blocked entry 0 or 2 that names the same model;
 * blocked entries of a Mixed Default that it does not cover are named by tier
 * ("Default, tier 2"). The narration voice has no entry any more (it follows
 * Default).
 */
export function getSubscriptionFallbacks(): SubscriptionFallback[] {
  const fallbacks: SubscriptionFallback[] = [];
  const overrides = getTierOverrides();
  const blocked = (i: number): TierOverride | null => {
    const o = overrides[i];
    return o && !runsOnThisDevice(o.modelKey) ? o : null;
  };
  const reason = (): "device" | "online" => claudeCliBlockReason() ?? "device";

  const covered = new Set<number>();
  const base = blocked(SCENE_BASELINE_TIER);
  if (base) {
    for (const t of SLOT_TIERS.default) {
      if (blocked(t)?.modelKey === base.modelKey) covered.add(t);
    }
    fallbacks.push({
      slot: "Default",
      reason: reason(),
      modelKey: base.modelKey,
      fallbackModelKey: REASONING_TIERS[SCENE_BASELINE_TIER].modelKey,
    });
  }
  const byModel = new Map<string, number[]>();
  for (const t of SLOT_TIERS.default) {
    const o = blocked(t);
    if (!o || covered.has(t)) continue;
    byModel.set(o.modelKey, [...(byModel.get(o.modelKey) ?? []), t]);
  }
  for (const [modelKey, tiers] of byModel) {
    fallbacks.push({
      slot: `Default, ${tierListLabel(tiers)}`,
      reason: reason(),
      modelKey,
      fallbackModelKey: REASONING_TIERS[tiers[0]].modelKey,
    });
  }
  const advanced = blocked(TOP_TIER);
  if (advanced) {
    fallbacks.push({
      slot: "Advanced",
      reason: reason(),
      modelKey: advanced.modelKey,
      fallbackModelKey: REASONING_TIERS[TOP_TIER].modelKey,
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
  // The system's own roll (Ironsworn-style); without it the M2 gate would
  // demand another roll after every action roll in a skirmish.
  "action_roll",
  // Fantastic Realms' own roll, and its initiative.
  "feat_roll",
  "initiative_roll",
  // manage_track's progress_roll, as named by rollAwareToolName (gmExecutor.ts).
  "progress_roll",
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
 * The tier the Observer's tier_escalation_missed retry should request, or null
 * when the retry would only rerun the call the turn already made. The retry
 * rolls the turn back, spends its one reset and can reroll dice, so it is only
 * worth it when the call actually gets heavier. Two ways it would not: nothing
 * above `tierUsed` is a different call (Default set to the same model and effort
 * as Advanced, say), or the scene cap clamps the request back down to a tier
 * that is the same call (resolveTierEscalation). Engine review, design §3.
 */
export function observerRetryTier(
  tierUsed: number,
  tierState: ReasoningTierState,
  tiers: readonly {
    modelKey: AnyModelKey;
    reasoningEffort: ReasoningEffort;
  }[],
): number | null {
  const requested = nextDistinctTier(tierUsed, "up", tiers);
  if (requested === null) return null;
  const { grantedTier } = resolveTierEscalation(
    { tier: requested, reason: "" },
    tierState.currentTier,
    tierState,
  );
  const used = tiers[tierUsed];
  const granted = tiers[grantedTier];
  if (!used || !granted) return null;
  const sameCall =
    granted.modelKey === used.modelKey &&
    granted.reasoningEffort === used.reasoningEffort;
  return sameCall ? null : requested;
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
