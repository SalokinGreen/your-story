/**
 * Local-only user settings. Persisted in localStorage since the app no
 * longer has a backend/account system.
 */

import type { PlayerArchetype } from "./structs";

// A device-local saved player identity from the GuidedStoryStart wizard -
// the host and any regular couch guests (e.g. a partner who plays every
// session) - so it can prefill next time instead of being retyped. Not tied
// to any one story; this is a roster the whole device shares.
export interface SavedPlayerProfile {
  id: string;
  name: string;
  color: string;
  personality: string[];
  wishTags: string[];
  wishText: string;
  archetype?: PlayerArchetype;
  lastUsedAt: number;
}

export interface CustomModel {
  id: string; // Unique ID for this custom model
  modelId: string; // OpenRouter model ID
  name: string;
  contextSize: number;
  maxOutputTokens: number;
  inputPrice?: number; // Price per million input tokens (optional, defaults to 0 for BYOK)
  outputPrice?: number; // Price per million output tokens (optional, defaults to 0 for BYOK)
}

export interface AIConfig {
  currentPreset: string; // The currently selected preset (e.g., "main", "fast", "custom")
  storyModel?: string; // Custom story model (used when preset is "custom")
  toolsModel?: string; // Custom tools model
  choicesModel?: string; // Custom choices model
  customMaxContext?: number; // Custom max context size
  customMaxOutput?: number; // Custom max output tokens
}

export interface UserSettings {
  custom_models?: CustomModel[]; // Array of custom models
  ai_config?: AIConfig; // AI preset configuration
  saved_player_profiles?: SavedPlayerProfile[]; // Saved GuidedStoryStart player identities
}

const STORAGE_KEY = "yourStory_userSettings";

export async function getUserSettings(): Promise<UserSettings | null> {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as UserSettings) : {};
  } catch (error) {
    console.error("Error reading user settings:", error);
    return null;
  }
}

export async function updateUserSettings(
  settings: Partial<UserSettings>,
): Promise<{ error: unknown }> {
  if (typeof window === "undefined") return { error: null };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const existing: UserSettings = raw ? JSON.parse(raw) : {};
    const updated: UserSettings = { ...existing, ...settings };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    return { error: null };
  } catch (error) {
    console.error("Error updating user settings:", error);
    return { error };
  }
}

// ============================================================
// SAVED PLAYER PROFILES (GuidedStoryStart "continue as" roster)
// ============================================================

const MAX_SAVED_PROFILES = 8;

/** Saved profiles, most recently used first. */
export async function getSavedPlayerProfiles(): Promise<SavedPlayerProfile[]> {
  const settings = await getUserSettings();
  return [...(settings?.saved_player_profiles ?? [])].sort(
    (a, b) => b.lastUsedAt - a.lastUsedAt,
  );
}

/**
 * Upserts a profile (matched by id, or by case-insensitive name if no id
 * match) as most-recently-used, capped to MAX_SAVED_PROFILES. Returns the
 * updated roster, most recently used first.
 */
export async function saveSavedPlayerProfile(
  profile: Omit<SavedPlayerProfile, "lastUsedAt">,
): Promise<SavedPlayerProfile[]> {
  const settings = (await getUserSettings()) ?? {};
  const existing = settings.saved_player_profiles ?? [];
  const nameLower = profile.name.trim().toLowerCase();
  const withoutMatch = existing.filter(
    (p) => p.id !== profile.id && p.name.trim().toLowerCase() !== nameLower,
  );
  const updated = [{ ...profile, lastUsedAt: Date.now() }, ...withoutMatch]
    .sort((a, b) => b.lastUsedAt - a.lastUsedAt)
    .slice(0, MAX_SAVED_PROFILES);
  await updateUserSettings({ saved_player_profiles: updated });
  return updated;
}

export async function deleteSavedPlayerProfile(
  id: string,
): Promise<SavedPlayerProfile[]> {
  const settings = (await getUserSettings()) ?? {};
  const updated = (settings.saved_player_profiles ?? []).filter(
    (p) => p.id !== id,
  );
  await updateUserSettings({ saved_player_profiles: updated });
  return updated;
}

// ============================================================
// CUSTOM MODELS (user-added OpenRouter models, BYOK only)
// ============================================================
// Stored under their own localStorage key (not nested in STORAGE_KEY above)
// since CreatorAIChat already reads/writes "customModels" directly - these
// helpers are additive, reading
// and writing the exact same key/shape so all call sites stay in sync.

const CUSTOM_MODELS_KEY = "customModels";
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function getCustomModels(): CustomModel[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = localStorage.getItem(CUSTOM_MODELS_KEY);
    return stored ? (JSON.parse(stored) as CustomModel[]) : [];
  } catch (error) {
    console.error("Error reading custom models:", error);
    return [];
  }
}

export function saveCustomModels(models: CustomModel[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(CUSTOM_MODELS_KEY, JSON.stringify(models));
  window.dispatchEvent(new Event("custom-models-changed"));
}

export function addCustomModel(model: Omit<CustomModel, "id">): CustomModel {
  const newModel: CustomModel = {
    ...model,
    id: crypto.randomUUID(),
  };
  saveCustomModels([...getCustomModels(), newModel]);
  return newModel;
}

export function removeCustomModel(id: string): void {
  saveCustomModels(getCustomModels().filter((m) => m.id !== id));
}

/** True for the UUID-shaped IDs assigned to custom (OpenRouter BYOK) models. */
export function isCustomModelId(modelKey: string): boolean {
  return UUID_RE.test(modelKey);
}

/** Resolves a model key to its CustomModel entry, only if it's a UUID custom-model id. */
export function getCustomModelIfUUID(
  modelKey: string,
): CustomModel | undefined {
  if (!isCustomModelId(modelKey)) return undefined;
  return getCustomModels().find((m) => m.id === modelKey);
}
