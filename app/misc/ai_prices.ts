export const AI_MODELS = {
  Hades: {
    name: "Hades",
    original_model: "Grok 4 Fast",
    model: "x-ai/grok-4-fast",
    maxTokens: 100000,
    maxOutputTokens: 2000,
    provider: "openrouter",
    strengths: ["creative", "nsfw"],
    weaknesses: ["price"],
    description:
      "An imaginative model excelling in creative writing and storytelling, ideal for generating vivid narratives.",
    bannerUrl: undefined,
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
    strengths: ["creativity", "nsfw"],
    weaknesses: ["price"],
    description:
      "A versatile model known for its creativity and ability to handle long-form content, making it suitable for detailed storytelling and complex narratives.",
    bannerUrl: undefined,
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
    strengths: ["creativity"],
    weaknesses: ["price"],
    description:
      "A powerful model with a focus on creative tasks, suitable for generating imaginative and detailed content.",
    bannerUrl: undefined,
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
    strengths: ["cost-effective"],
    weaknesses: ["smarts"],
    description:
      "A cost-effective model that balances performance and affordability, ideal for users seeking value without compromising too much on quality.",
    bannerUrl: undefined,
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
    strengths: ["long context", "powerful", "nsfw"],
    weaknesses: ["price"],
    description:
      "A robust model designed for handling extensive context and delivering powerful performance, making it suitable for complex storytelling and detailed narratives.",
    bannerUrl: undefined,
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
    strengths: ["cost-effective", "smarts", "nsfw"],
    weaknesses: ["creativity"],
    description:
      "A highly intelligent model that excels in understanding and generating coherent content, ideal for users prioritizing smarts and affordability.",
    bannerUrl: undefined,
  },
} as const;

export type AIModelKey = keyof typeof AI_MODELS;

export function getModelConfig(modelKey: string) {
  return (
    AI_MODELS[modelKey as AIModelKey] || AI_MODELS["Prometheus"] // Default model
  );
}
