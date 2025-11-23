export const AI_MODELS = {
  "Grok 4 Fast": {
    name: "Grok 4 Fast",
    original_model: "Grok 4 Fast",
    model: "x-ai/grok-4-fast",
    maxTokens: 400000,
    maxOutputTokens: 4000,
    provider: "openrouter",
    supportsToolCalling: true,
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

  "Deepseek Chat": {
    name: "Deepseek Chat",
    original_model: "Deepseek Chat",
    model: "deepseek-chat",
    maxTokens: 120000,
    maxOutputTokens: 4000,
    provider: "deepseek",
    supportsToolCalling: true,
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
  "Gemini 2.5 Flash": {
    name: "Gemini 2.5 Flash",
    original_model: "Gemini 2.5 Flash",
    model: "google/gemini-2.5-flash",
    maxTokens: 100000,
    maxOutputTokens: 4000,
    provider: "openrouter",
    supportsToolCalling: true,
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

  "Gemini 2.5 Flash Lite": {
    name: "Gemini 2.5 Flash Lite",
    original_model: "Gemini 2.5 Flash Lite",
    model: "google/gemini-2.5-flash-lite",
    maxTokens: 100000,
    maxOutputTokens: 4000,
    provider: "openrouter",
    supportsToolCalling: true,
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

  "GLM 4.6": {
    name: "GLM 4.6",
    original_model: "GLM 4.6",
    model: "z-ai/glm-4.6",
    maxTokens: 200000,
    maxOutputTokens: 4000,
    cost: 10,
    inputPrice: 10.0,
    outputPrice: 10.0,
    provider: "openrouter",
    supportsToolCalling: true,
    finetunes: [],
    strengths: ["long context", "powerful", "nsfw"],
    weaknesses: ["price"],
    description:
      "A robust model designed for handling extensive context and delivering powerful performance, making it suitable for complex storytelling and detailed narratives.",
    bannerUrl: undefined,
  },
  "Qwen 2.5 72B Instruct": {
    name: "Qwen 2.5 72B Instruct",
    original_model: "Qwen3 235B A22B Instruct 2507",
    model: "qwen/qwen-2.5-72b-instruct",
    maxTokens: 200000,
    maxOutputTokens: 4000,
    provider: "openrouter",
    supportsToolCalling: true,
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

  "GPT-OSS 120B": {
    name: "GPT-OSS 120B",
    original_model: "gpt-oss-120b",
    model: "openai/gpt-oss-120b",
    maxTokens: 131000,
    maxOutputTokens: 4000,
    provider: "openrouter",
    supportsToolCalling: true,
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
  "Gemini 2.5 Pro": {
    name: "Gemini 2.5 Pro",
    original_model: "Gemini 2.5 Pro",
    model: "google/gemini-2.5-pro",
    maxTokens: 200000,
    maxOutputTokens: 4000,
    provider: "openrouter",
    supportsToolCalling: true,
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
  "DeepSeek R1": {
    name: "DeepSeek R1",
    original_model: "DeepSeek R1",
    model: "deepseek-reasoner",
    maxTokens: 128000,
    maxOutputTokens: 4000,
    provider: "deepseek",
    supportsToolCalling: false,
    cost: 2,
    inputPrice: 0.55,
    outputPrice: 2.19,
    finetunes: [],
    strengths: ["reasoning", "coding", "complex logic"],
    weaknesses: ["speed", "no tool calling"],
    description:
      "A reasoning-focused model that excels at complex logic, planning, and structured generation. Perfect for intricate scenario design.",
    bannerUrl: undefined,
  },
  "Mistral Medium 3.1": {
    name: "Mistral Medium 3.1",
    original_model: "Mistral Medium 3.1",
    model: "mistralai/mistral-medium-3.1",
    maxTokens: 131000,
    maxOutputTokens: 4000,
    provider: "openrouter",
    supportsToolCalling: true,
    cost: 1,
    inputPrice: 0.4,
    outputPrice: 2,
    finetunes: [],
    strengths: ["powerful", "cost-effective"],
    weaknesses: ["logic"],
    description:
      "A small-sized model from Mistral, offering a balance between performance and cost, suitable for story generation..",
    bannerUrl: undefined,
  },
  "Grok Code Fast 1": {
    name: "Grok Code Fast 1",
    original_model: "Grok Code Fast 1",
    model: "x-ai/grok-code-fast-1",
    maxTokens: 250000,
    maxOutputTokens: 4000,
    provider: "openrouter",
    supportsToolCalling: true,
    cost: 10,
    inputPrice: 2.0,
    outputPrice: 10.0,
    finetunes: [],
    strengths: ["tool calling", "logic", "reasoning"],
    weaknesses: ["creativity", "prose"],
    description:
      "A logic and reasoning-focused model that excels at understanding and generating structured content. Ideal for scenarios requiring precise logic and tool usage.",
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
  supportsToolCalling?: boolean; // Whether this model supports function calling
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
  // Check if the key exists in AI_MODELS
  if (modelKey in AI_MODELS) {
    return AI_MODELS[modelKey as AIModelKey] as unknown as AIModelConfig;
  }

  // Fallback to Deepseek Chat if key not found
  console.warn(
    `Model key "${modelKey}" not found, falling back to Deepseek Chat`
  );
  return AI_MODELS["Deepseek Chat"] as unknown as AIModelConfig;
}
