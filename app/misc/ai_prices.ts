export const AI_MODELS = {
  Hades: {
    name: "Grok 4 Fast",
    original_model: "Grok 4 Fast",
    model: "x-ai/grok-4-fast",
    maxTokens: 400000,
    maxOutputTokens: 4000,
    provider: "openrouter",
    strengths: ["creative", "nsfw"],
    weaknesses: ["price"],
    description:
      "An imaginative model excelling in creative writing and storytelling, ideal for generating vivid narratives.",
    bannerUrl: undefined,
    cost: 10,
    inputPrice: 2.0,
    outputPrice: 10.0,
    finetunes: [],
  },

  Prometheus: {
    name: "Deepseek Chat",
    original_model: "Deepseek Chat",
    model: "deepseek-chat",
    maxTokens: 120000,
    maxOutputTokens: 4000,
    provider: "deepseek",
    cost: 1,
    inputPrice: 0.14,
    outputPrice: 0.28,
    finetunes: [],
    strengths: ["creativity", "nsfw"],
    weaknesses: ["price"],
    description:
      "A versatile model known for its creativity and ability to handle long-form content, making it suitable for detailed storytelling and complex narratives.",
    bannerUrl: undefined,
  },
  Hermes: {
    name: "Gemini 2.5 Flash",
    original_model: "Gemini 2.5 Flash",
    model: "google/gemini-2.5-flash",
    maxTokens: 100000,
    maxOutputTokens: 4000,
    provider: "openrouter",
    cost: 1,
    inputPrice: 0.075,
    outputPrice: 0.3,
    finetunes: [],
    strengths: ["creativity"],
    weaknesses: ["price"],
    description:
      "A powerful model with a focus on creative tasks, suitable for generating imaginative and detailed content.",
    bannerUrl: undefined,
  },

  Hercules: {
    name: "Gemini 2.5 Flash Lite",
    original_model: "Gemini 2.5 Flash Lite",
    model: "google/gemini-2.5-flash-lite",
    maxTokens: 100000,
    maxOutputTokens: 4000,
    provider: "openrouter",
    cost: 1,
    inputPrice: 0.0375,
    outputPrice: 0.15,
    finetunes: [],
    strengths: ["cost-effective"],
    weaknesses: ["smarts"],
    description:
      "A cost-effective model that balances performance and affordability, ideal for users seeking value without compromising too much on quality.",
    bannerUrl: undefined,
  },

  Poseidon: {
    name: "GLM 4.6",
    original_model: "GLM 4.6",
    model: "z-ai/glm-4.6",
    maxTokens: 200000,
    maxOutputTokens: 4000,
    cost: 10,
    inputPrice: 10.0,
    outputPrice: 10.0,
    provider: "openrouter",
    finetunes: [],
    strengths: ["long context", "powerful", "nsfw"],
    weaknesses: ["price"],
    description:
      "A robust model designed for handling extensive context and delivering powerful performance, making it suitable for complex storytelling and detailed narratives.",
    bannerUrl: undefined,
  },
  Chronos: {
    name: "Qwen 2.5 72B Instruct",
    original_model: "Qwen3 235B A22B Instruct 2507",
    model: "qwen/qwen-2.5-72b-instruct",
    maxTokens: 200000,
    maxOutputTokens: 4000,
    provider: "openrouter",
    cost: 1,
    inputPrice: 0.35,
    outputPrice: 0.4,
    finetunes: [],
    strengths: ["long context", "powerful"],
    weaknesses: ["price", "nsfw"],
    description:
      "A powerful model capable of handling long contexts, making it suitable for detailed and complex storytelling tasks.",
    bannerUrl: undefined,
  },

  Athena: {
    name: "GPT-OSS 120B",
    original_model: "gpt-oss-120b",
    model: "openai/gpt-oss-120b",
    maxTokens: 131000,
    maxOutputTokens: 4000,
    provider: "openrouter",
    cost: 4,
    inputPrice: 2.5,
    outputPrice: 10.0,
    finetunes: [],
    strengths: ["powerful", "nsfw"],
    weaknesses: ["price"],
    description:
      "A powerful open-source model with 120 billion parameters, suitable for tasks requiring high computational power and detailed content generation.",
    bannerUrl: undefined,
  },
  Zeus: {
    name: "Gemini 2.5 Pro",
    original_model: "Gemini 2.5 Pro",
    model: "google/gemini-2.5-pro",
    maxTokens: 200000,
    maxOutputTokens: 4000,
    provider: "openrouter",
    cost: 15,
    inputPrice: 3.5,
    outputPrice: 10.5,
    finetunes: [],
    strengths: ["long context", "powerful", "creativity"],
    weaknesses: ["price"],
    description:
      "The premium model in the lineup, offering unparalleled performance, creativity, and the ability to handle extensive contexts, making it ideal for the most demanding storytelling tasks.",
    bannerUrl: undefined,
  },
  Hephaestus: {
    name: "DeepSeek R1",
    original_model: "DeepSeek R1",
    model: "deepseek-reasoner",
    maxTokens: 128000,
    maxOutputTokens: 4000,
    provider: "deepseek",
    cost: 2,
    inputPrice: 0.55,
    outputPrice: 2.19,
    finetunes: [],
    strengths: ["reasoning", "coding", "complex logic"],
    weaknesses: ["speed"],
    description:
      "A reasoning-focused model that excels at complex logic, planning, and structured generation. Perfect for intricate scenario design.",
    bannerUrl: undefined,
  },
} as const;

export interface AIModelConfig {
  name: string;
  original_model: string;
  model: string;
  maxTokens: number;
  maxOutputTokens: number;
  provider: "openrouter" | "deepseek";
  cost: number;
  inputPrice: number;
  outputPrice: number;
  finetunes: readonly string[];
  strengths: readonly string[];
  weaknesses: readonly string[];
  description: string;
  bannerUrl?: string;
  contextWindow?: number; // Optional for custom models
}

export type AIModelKey = keyof typeof AI_MODELS;

export function getModelConfig(modelKey: string): AIModelConfig {
  return (
    (AI_MODELS[modelKey as AIModelKey] as unknown as AIModelConfig) ||
    (AI_MODELS["Prometheus"] as unknown as AIModelConfig)
  );
}
