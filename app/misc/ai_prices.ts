export const AI_MODELS = {
  "x-ai/grok-4-fast-100": {
    name: "Grok 4 Fast 100K",
    model: "x-ai/grok-4-fast",
    maxTokens: 100000,
    maxOutputTokens: 2000,
    provider: "openrouter",
    cost: 3,
  },
  "x-ai/grok-4-fast-20": {
    name: "Grok 4 Fast 20K",
    model: "x-ai/grok-4-fast",
    maxTokens: 20000,
    maxOutputTokens: 2000,
    provider: "openrouter",
    cost: 1,
  },
  "deep-seek/deepseek-chat-120": {
    name: "Deepseek Chat 120K",
    model: "deepseek-chat",
    maxTokens: 120000,
    maxOutputTokens: 2000,
    provider: "deepseek",
    cost: 1,
  },
  "google/gemini-2.5-flash-100": {
    name: "Gemini 2.5 Flash 100K",
    model: "google/gemini-2.5-flash",
    maxTokens: 100000,
    maxOutputTokens: 2000,
    provider: "openrouter",
    cost: 5,
  },
  "google/gemini-2.5-flash": {
    name: "Gemini 2.5 Flash 20K",
    model: "google/gemini-2.5-flash",
    maxTokens: 20000,
    maxOutputTokens: 2000,
    provider: "openrouter",
    cost: 1,
  },
  "google/gemini-2.5-flash-lite-20": {
    name: "Gemini 2.5 Flash Lite 20K",
    model: "google/gemini-2.5-flash-lite",
    maxTokens: 20000,
    maxOutputTokens: 2000,
    provider: "openrouter",
    cost: 1,
  },
  "google/gemini-2.5-flash-lite-100": {
    name: "Gemini 2.5 Flash Lite 100K",
    model: "google/gemini-2.5-flash-lite",
    maxTokens: 100000,
    maxOutputTokens: 2000,
    provider: "openrouter",
    cost: 2,
  },
  "z-ai/glm-4.6-20": {
    name: "GLM 4.6 20K",
    model: "z-ai/glm-4.6",
    maxTokens: 20000,
    maxOutputTokens: 2000,
    provider: "openrouter",
    cost: 2,
  },
  "z-ai/glm-4.6-100": {
    name: "GLM 4.6 100K",
    model: "z-ai/glm-4.6",
    maxTokens: 100000,
    maxOutputTokens: 2000,
    cost: 5,
    provider: "openrouter",
  },
  "openai/gpt-4o-mini-20": {
    name: "GPT-4o Mini 20K",
    model: "gpt-4o-mini",
    maxTokens: 20000,
    maxOutputTokens: 2000,
    provider: "openrouter",
    cost: 1,
  },
  "openai/gpt-4o-mini-100": {
    name: "GPT-4o Mini 100K",
    model: "gpt-4o-mini",
    maxTokens: 100000,
    maxOutputTokens: 2000,
    provider: "openrouter",
    cost: 2,
  },
} as const;

export type AIModelKey = keyof typeof AI_MODELS;

export function getModelConfig(modelKey: string) {
  return (
    AI_MODELS[modelKey as AIModelKey] ||
    AI_MODELS["deep-seek/deepseek-chat-120"] // Default model
  );
}
