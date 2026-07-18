/**
 * Local-only user settings. Persisted in localStorage since the app no
 * longer has a backend/account system.
 */

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
