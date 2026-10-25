// Explicit allowlist of localStorage keys that are safe to sync across
// devices via syncManager.ts. Deliberately NOT "every localStorage key" -
// provider API keys, OAuth verifiers, and per-device identity stay local
// only. Kept as its own file so the sync surface is auditable in one place
// without wading through syncManager's sync logic.
export const SYNCABLE_SETTINGS_KEYS = [
  // AI / generation config
  "aiModel",
  "maxToolLoops",
  "customMaxContext",
  "customMaxOutput",
  "embeddingsEnabled",
  "embeddingThreshold",
  "usePrefill",
  "storytellerMode",
  "deAiifyWords",
  "replyLength",
  "samplingSettings",
  "samplingPresetId",
  "customSamplingPresets",
  "yourStory_userSettings",
  "customModels",
  "reasoningTierOverrides",
  "narrationModelOverride",
  "narrationEffortOverride",
  "observerModelOverride",
  "memoryKeeperModelOverride",
  "reflectionModelOverride",
  "directorAssistantModelOverride",
  "observerCheckSettings",
  "rewriteConfirmModelOverride",
  // In-play pictures: toggles, cap, provider and model choices (never the fal key)
  "imageSettings",
  // Display / font
  "storyFontSize",
  "storyFontFamily",
  "storyLineHeight",
  "storyParagraphSpacing",
  "storyTheme",
  "customFontList",
  // Voice
  "ttsEnabled",
  "ttsAutoGenerate",
  "ttsLastVoice",
  "ttsModel",
  "ttsVolume",
  "ttsCustomVoices",
  "sttEnabled",
  // Misc gameplay prefs
  "showHiddenMessages",
  "actionMode",
  "defaultUserNotes",
] as const;

export type SyncableSettingKey = (typeof SYNCABLE_SETTINGS_KEYS)[number];
