export const AI_MODELS = {
  Hades: {
    name: "Hades",
    original_model: "Grok 4 Fast",
    model: "x-ai/grok-4-fast",
    maxTokens: 100000,
    maxOutputTokens: 2000,
    provider: "openrouter",
    cost: 3,
    finetunes: [],
  },

  Prometheus: {
    name: "Prometheus",
    original_model: "Deepseek Chat",
    model: "deepseek-chat",
    maxTokens: 120000,
    maxOutputTokens: 2000,
    provider: "deepseek",
    cost: 3,
    finetunes: [],
  },
  Hermes: {
    name: "Hermes",
    original_model: "Gemini 2.5 Flash",
    model: "google/gemini-2.5-flash",
    maxTokens: 100000,
    maxOutputTokens: 2000,
    provider: "openrouter",
    cost: 5,
    finetunes: [],
  },

  Hercules: {
    name: "Hercules",
    original_model: "Gemini 2.5 Flash Lite",
    model: "google/gemini-2.5-flash-lite",
    maxTokens: 100000,
    maxOutputTokens: 2000,
    provider: "openrouter",
    cost: 2,
    finetunes: [],
  },

  Zeus: {
    name: "Zeus",
    original_model: "GLM 4.6",
    model: "z-ai/glm-4.6",
    maxTokens: 200000,
    maxOutputTokens: 2000,
    cost: 10,
    provider: "openrouter",
    finetunes: [],
  },
  Athena: {
    name: "Athena",
    original_model: "GPT-4o Mini 100K",
    model: "gpt-4o-mini",
    maxTokens: 100000,
    maxOutputTokens: 2000,
    provider: "openrouter",
    cost: 2,
    finetunes: [],
  },
} as const;

export type AIModelKey = keyof typeof AI_MODELS;

export function getModelConfig(modelKey: string) {
  return (
    AI_MODELS[modelKey as AIModelKey] || AI_MODELS["Prometheus"] // Default model
  );
}
