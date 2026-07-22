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

import { AnyModelKey, ReasoningEffort } from "./reasoningTiers";
import {
  ObserverSettings,
  ObserverCheckSettings,
  DEFAULT_OBSERVER_SETTINGS,
} from "./observer";
import { ObserverFlagType } from "./structs";

export const LAYER_SETTINGS_CHANGED_EVENT = "layer-settings-changed";

function notifyChanged(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(LAYER_SETTINGS_CHANGED_EVENT));
  }
}

// ============================================================
// PER-STAGE MODEL/EFFORT OVERRIDES
// ============================================================
// null (default) means "inherit whatever model generated the turn this
// side-call is reacting to" - today's behavior, unchanged from before these
// overrides existed.

export interface ModelEffortOverride {
  modelKey: AnyModelKey;
  reasoningEffort: ReasoningEffort;
}

function getOverride(key: string): ModelEffortOverride | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as ModelEffortOverride) : null;
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

/**
 * Resolves a stage's { model, reasoningEffort } for its API call: the
 * override if one is set, otherwise the fallback model (whatever generated
 * the turn) with no reasoningEffort field at all - preserving the exact
 * fetch body these stages sent before overrides existed.
 */
export function resolveSideCallModel(
  override: ModelEffortOverride | null,
  fallbackModel: string,
): { model: string; reasoningEffort?: string } {
  if (!override) return { model: fallbackModel };
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
