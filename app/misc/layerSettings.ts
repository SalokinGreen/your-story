/**
 * Settings for the AI-driven side-call stages that don't already have a
 * settings UI of their own (unlike the GM/narration/choices stages, which
 * are configured via the Reasoning Tiers UI in reasoningTiers.ts /
 * AIConfigTab.tsx): the Observer (observer.ts, Layer 5 adjudication), the
 * Memory Keeper (memoryAgent.ts, Layer 4 per-turn memory writing), and
 * Reflection (reflection.ts, Layer 4 periodic insight synthesis).
 *
 * Persisted to localStorage, same as reasoningTiers.ts's tier overrides -
 * there's no backend/account system. Read by ArchitectureSettingsTab.tsx
 * (Settings UI) and generation.ts (actually applying the overrides).
 */

import {
  AnyModelKey,
  ReasoningEffort,
  getEffectiveNarrationModelKey,
} from "./reasoningTiers";
import { AIModelKey, hasKeyForModel, isKnownModelKey } from "./ai_prices";
import { canRunClaudeCliModel, claudeCliBlockReason, isClaudeCliModel } from "./claudeCliModels";
import type { ProviderKeys } from "./sideModelCall";
import {
  ObserverSettings,
  ObserverCheckSettings,
  DEFAULT_OBSERVER_SETTINGS,
} from "./observer";
import { ObserverFlagType } from "./structs";
import { DEFAULT_STORY_PROGRESS_CHECK_INTERVAL } from "./storyProgressObserver";

export const LAYER_SETTINGS_CHANGED_EVENT = "layer-settings-changed";

function notifyChanged(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(LAYER_SETTINGS_CHANGED_EVENT));
  }
}

// ============================================================
// PER-STAGE MODEL/EFFORT OVERRIDES
// ============================================================
// null (default) means "run on SIDE_AGENT_DEFAULT_MODEL_KEY" (decision 51,
// which revised decision 19: the side agents used to follow the narration
// model). resolveSideCallModel is the one place that turns a null into it
// (or, for a player with no key for its provider, into the narration voice).

/**
 * The model an unpinned side agent runs on (decision 51): the Observer and
 * its judges, the Memory Keeper, the Director Assistant, the Story Progress
 * Observer, compaction and reflection. Claude Haiku 5.5 through OpenRouter,
 * the same key the default tiers need - not "Claude Haiku (subscription)":
 * a side agent reaches the Claude subscription only when the player pins a
 * layer there (decision 12). Independent of the narration voice, so changing
 * the narrator does not move the side agents - except for a player with no
 * key for this model's provider: resolveSideCallModel, given the player's
 * keys, runs an unpinned side agent on the narration voice instead, so a
 * player without an OpenRouter key keeps compaction, the Memory Keeper and the
 * rest. Without that fallback they would all fail with NO_API_KEY.
 */
export const SIDE_AGENT_DEFAULT_MODEL_KEY: AIModelKey = "Claude Haiku 5.5";

export interface ModelEffortOverride {
  modelKey: AnyModelKey;
  reasoningEffort: ReasoningEffort;
}

// A saved override whose model the catalog no longer has (one its provider
// shut down, or a key synced from a newer build) reads as null, so the layer
// runs on its default (SIDE_AGENT_DEFAULT_MODEL_KEY, decision 51) rather than
// reaching getModelConfig, which would swap in DeepSeek V4 Flash.
function getOverride(key: string): ModelEffortOverride | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ModelEffortOverride | null;
    return parsed && isKnownModelKey(parsed.modelKey) ? parsed : null;
  } catch {
    return null;
  }
}

function setOverride(key: string, override: ModelEffortOverride | null): void {
  if (typeof window === "undefined") return;
  if (override) {
    localStorage.setItem(key, JSON.stringify(override));
  } else {
    localStorage.removeItem(key);
  }
  notifyChanged();
}

const OBSERVER_MODEL_KEY = "observerModelOverride";
const MEMORY_KEEPER_MODEL_KEY = "memoryKeeperModelOverride";
const REFLECTION_MODEL_KEY = "reflectionModelOverride";
const DIRECTOR_ASSISTANT_MODEL_KEY = "directorAssistantModelOverride";
const STORY_PROGRESS_OBSERVER_MODEL_KEY = "storyProgressObserverModelOverride";

export const getObserverModelOverride = (): ModelEffortOverride | null =>
  getOverride(OBSERVER_MODEL_KEY);
export const setObserverModelOverride = (
  override: ModelEffortOverride | null,
): void => setOverride(OBSERVER_MODEL_KEY, override);

export const getMemoryKeeperModelOverride = (): ModelEffortOverride | null =>
  getOverride(MEMORY_KEEPER_MODEL_KEY);
export const setMemoryKeeperModelOverride = (
  override: ModelEffortOverride | null,
): void => setOverride(MEMORY_KEEPER_MODEL_KEY, override);

export const getReflectionModelOverride = (): ModelEffortOverride | null =>
  getOverride(REFLECTION_MODEL_KEY);
export const setReflectionModelOverride = (
  override: ModelEffortOverride | null,
): void => setOverride(REFLECTION_MODEL_KEY, override);

// Director Assistant (directorAssistant.ts, Layer 3 spotlight tracking) -
// same override shape/precedent as the Memory Keeper above.
export const getDirectorAssistantModelOverride = (): ModelEffortOverride | null =>
  getOverride(DIRECTOR_ASSISTANT_MODEL_KEY);
export const setDirectorAssistantModelOverride = (
  override: ModelEffortOverride | null,
): void => setOverride(DIRECTOR_ASSISTANT_MODEL_KEY, override);

// Story Progress Observer (storyProgressObserver.ts, Layer 3 periodic
// pacing/momentum check-in) - same override shape/precedent as the Director
// Assistant above.
export const getStoryProgressObserverModelOverride = (): ModelEffortOverride | null =>
  getOverride(STORY_PROGRESS_OBSERVER_MODEL_KEY);
export const setStoryProgressObserverModelOverride = (
  override: ModelEffortOverride | null,
): void => setOverride(STORY_PROGRESS_OBSERVER_MODEL_KEY, override);

/**
 * Decisions 16 and 29 for the side agents: the layers whose Claude
 * subscription override cannot run here and now, for Settings' notice. They
 * run on SIDE_AGENT_DEFAULT_MODEL_KEY instead (resolveSideCallModel; the
 * narration voice for a player with no key for its provider). Empty on the
 * desktop app outside an online session.
 */
export function getLayerSubscriptionFallbacks(): {
  slot: string;
  modelKey: string;
  reason: "device" | "online";
}[] {
  const reason = claudeCliBlockReason();
  if (!reason) return [];
  const layers: [string, ModelEffortOverride | null][] = [
    ["Observer", getObserverModelOverride()],
    ["Memory Keeper", getMemoryKeeperModelOverride()],
    ["Reflection", getReflectionModelOverride()],
    ["Director Assistant", getDirectorAssistantModelOverride()],
    ["Story Progress Observer", getStoryProgressObserverModelOverride()],
  ];
  return layers
    .filter(([, o]) => o && isClaudeCliModel(o.modelKey))
    .map(([slot, o]) => ({ slot, modelKey: o!.modelKey, reason }));
}

// ============================================================
// STORY PROGRESS OBSERVER CADENCE
// ============================================================
// How many accepted turns pass between story-progress check-ins (see
// storyProgressObserver.ts's runStoryProgressObserver). A plain positive
// integer, not a { enabled, ... } bag like the Observer's per-flag settings
// - there's only one dial here. Persisted the same way as everything else
// in this file: localStorage, no backend.

const STORY_PROGRESS_CHECK_INTERVAL_KEY = "storyProgressCheckInterval";
const MIN_STORY_PROGRESS_CHECK_INTERVAL = 2;
const MAX_STORY_PROGRESS_CHECK_INTERVAL = 50;

export function getStoryProgressCheckInterval(): number {
  if (typeof window === "undefined") return DEFAULT_STORY_PROGRESS_CHECK_INTERVAL;
  try {
    const raw = localStorage.getItem(STORY_PROGRESS_CHECK_INTERVAL_KEY);
    if (!raw) return DEFAULT_STORY_PROGRESS_CHECK_INTERVAL;
    const parsed = parseInt(raw, 10);
    if (!Number.isFinite(parsed)) return DEFAULT_STORY_PROGRESS_CHECK_INTERVAL;
    return Math.max(
      MIN_STORY_PROGRESS_CHECK_INTERVAL,
      Math.min(MAX_STORY_PROGRESS_CHECK_INTERVAL, parsed),
    );
  } catch {
    return DEFAULT_STORY_PROGRESS_CHECK_INTERVAL;
  }
}

export function setStoryProgressCheckInterval(turns: number): void {
  if (typeof window === "undefined") return;
  const clamped = Math.max(
    MIN_STORY_PROGRESS_CHECK_INTERVAL,
    Math.min(MAX_STORY_PROGRESS_CHECK_INTERVAL, Math.round(turns)),
  );
  localStorage.setItem(STORY_PROGRESS_CHECK_INTERVAL_KEY, String(clamped));
  notifyChanged();
}

/**
 * What an unpinned side agent runs on (and what a pin this device cannot run
 * falls to): SIDE_AGENT_DEFAULT_MODEL_KEY, with no reasoningEffort field at
 * all. Given the player's keys (decision 51, amended after the engine review
 * of 2026-10-21), a player with no key for that model's provider - one with
 * only a Mistral or Z.ai key, say - gets the effective narration voice
 * instead, as long as it is not a Claude subscription model (decision 12: an
 * unpinned side agent never reaches the subscription) and they have a key for
 * its provider. When neither is runnable the default stays, and the call
 * fails visibly in the Debug Logs rather than quietly running somewhere the
 * player did not choose. Without `keys` the default is always returned.
 */
function unpinnedSideAgentModel(keys: ProviderKeys | undefined): string {
  if (!keys || hasKeyForModel(SIDE_AGENT_DEFAULT_MODEL_KEY, keys)) {
    return SIDE_AGENT_DEFAULT_MODEL_KEY;
  }
  const narration = String(getEffectiveNarrationModelKey());
  if (!isClaudeCliModel(narration) && hasKeyForModel(narration, keys)) {
    return narration;
  }
  return SIDE_AGENT_DEFAULT_MODEL_KEY;
}

/**
 * Resolves a side agent's { model, reasoningEffort } for its API call: the
 * player's pin if there is one, otherwise SIDE_AGENT_DEFAULT_MODEL_KEY (an
 * AI_MODELS key) with no reasoningEffort field at all. It takes no fallback
 * model on purpose: an unpinned side agent no longer inherits the narration
 * model or the GM's tier model (decision 51), so there is nothing for a
 * caller to pass, and none that could carry a Claude subscription model in
 * (decision 12: the side agents run on the subscription only when the
 * player points a layer there).
 *
 * `keys` are the provider keys the call will carry (the six
 * generation.ts's `sideCallApiOptions` holds). With them, an unpinned side
 * agent - or one whose subscription pin this device cannot run, decisions 16
 * and 29 - falls from the default to the narration voice when the player has
 * no key for the default's provider (see unpinnedSideAgentModel), so a player
 * without an OpenRouter key keeps their side agents. A pin this device can run
 * is kept whatever the keys say. Omit `keys` and the answer is the default,
 * as before.
 */
export function resolveSideCallModel(
  override: ModelEffortOverride | null,
  keys?: ProviderKeys,
): { model: string; reasoningEffort?: string } {
  if (!override) return { model: unpinnedSideAgentModel(keys) };
  // Decisions 16 and 29: a subscription override this device cannot run (a
  // synced choice off the desktop) or may not run (online play is active).
  if (isClaudeCliModel(override.modelKey) && !canRunClaudeCliModel()) {
    return { model: unpinnedSideAgentModel(keys) };
  }
  return { model: override.modelKey, reasoningEffort: override.reasoningEffort };
}

/**
 * The model the Observer's rewrite runs on (decision 52). The rewrite is not a
 * verdict: it writes the prose the player reads in place of the draft, so
 * when the Observer is unpinned it follows the narration voice (the caller
 * passes getEffectiveNarrationModelKey(), which already falls back from a
 * subscription voice this device cannot run) instead of the side-agent
 * default, and a dark or violent scene is not refused or softened by a model
 * the player never chose for prose. A pinned Observer takes its rewrite with
 * it, as before, and a subscription pin this device cannot run falls to the
 * narration voice too, not to SIDE_AGENT_DEFAULT_MODEL_KEY.
 */
export function resolveObserverRewriteModel(
  override: ModelEffortOverride | null,
  narrationModel: string,
): { model: string; reasoningEffort?: string } {
  if (!override) return { model: narrationModel };
  if (isClaudeCliModel(override.modelKey) && !canRunClaudeCliModel()) {
    return { model: narrationModel };
  }
  return { model: override.modelKey, reasoningEffort: override.reasoningEffort };
}

// ============================================================
// OBSERVER PER-FLAG-TYPE SETTINGS
// ============================================================
// UI for the { enabled, triggersReset, sensitivity } backend that already
// exists in observer.ts (DEFAULT_OBSERVER_SETTINGS/settingsFor) - see that
// file's top comment. A partial stored override still fills in defaults for
// any untouched field, same merge semantics as settingsFor().

const OBSERVER_CHECK_SETTINGS_KEY = "observerCheckSettings";

export function getObserverSettings(): ObserverSettings {
  if (typeof window === "undefined") return DEFAULT_OBSERVER_SETTINGS;
  try {
    const raw = localStorage.getItem(OBSERVER_CHECK_SETTINGS_KEY);
    if (!raw) return DEFAULT_OBSERVER_SETTINGS;
    const stored = JSON.parse(raw) as Partial<
      Record<ObserverFlagType, Partial<ObserverCheckSettings>>
    >;
    const merged = {} as ObserverSettings;
    for (const type of Object.keys(
      DEFAULT_OBSERVER_SETTINGS,
    ) as ObserverFlagType[]) {
      merged[type] = { ...DEFAULT_OBSERVER_SETTINGS[type], ...stored[type] };
    }
    return merged;
  } catch {
    return DEFAULT_OBSERVER_SETTINGS;
  }
}

export function setObserverCheckSetting(
  type: ObserverFlagType,
  patch: Partial<ObserverCheckSettings>,
): void {
  if (typeof window === "undefined") return;
  const current = getObserverSettings();
  current[type] = { ...current[type], ...patch };
  localStorage.setItem(OBSERVER_CHECK_SETTINGS_KEY, JSON.stringify(current));
  notifyChanged();
}

export function resetObserverSettings(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(OBSERVER_CHECK_SETTINGS_KEY);
  notifyChanged();
}
