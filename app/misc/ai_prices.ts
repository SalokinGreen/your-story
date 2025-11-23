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
    cost: 1,
    inputPrice: 0.2,
    outputPrice: 1.5,
    finetunes: [],
    strengths: ["tool calling", "logic", "reasoning"],
    weaknesses: ["creativity", "prose"],
    description:
      "A logic and reasoning-focused model that excels at understanding and generating structured content. Ideal for scenarios requiring precise logic and tool usage.",
    bannerUrl: undefined,
  },
  "NovelAI GLM scribe": {
    name: "NovelAI GLM Tablet",
    original_model: "NovelAI GLM Tablet",
    model: "glm-tablet",
    maxTokens: 8000,
    maxOutputTokens: 2000,
    provider: "novelai",
    supportsToolCalling: false,
    cost: 0,
    inputPrice: 0,
    outputPrice: 0,
    finetunes: [],
    strengths: ["creative", "storytelling", "prose"],
    weaknesses: ["context length", "complex logic"],
    description:
      "A storytelling-focused model from NovelAI, designed to generate creative and engaging narratives with rich prose.",
    bannerUrl: undefined,
  },
  "NovelAI GLM Scribe": {
    name: "NovelAI GLM Scribe",
    original_model: "NovelAI GLM Scribe",
    model: "glm-scribe",
    maxTokens: 14000,
    maxOutputTokens: 2000,
    provider: "novelai",
    supportsToolCalling: false,
    cost: 0,
    inputPrice: 0,
    outputPrice: 0,
    finetunes: [],
    strengths: ["creative", "storytelling", "prose"],
    weaknesses: ["context length", "complex logic"],
    description:
      "An enhanced storytelling model from NovelAI, offering a longer context length for more detailed and immersive narratives.",
    bannerUrl: undefined,
  },
  "NovelAI GLM Opus": {
    name: "NovelAI GLM Opus",
    original_model: "NovelAI GLM Opus",
    model: "glm-opus",
    maxTokens: 28000,
    maxOutputTokens: 2000,
    provider: "novelai",
    supportsToolCalling: false,
    cost: 0,
    inputPrice: 0,
    outputPrice: 0,
    finetunes: [],
    strengths: ["creative", "storytelling", "prose", "longer context"],
    weaknesses: ["complex logic"],
    description:
      "The premium storytelling model from NovelAI, featuring the longest context length and enhanced capabilities for crafting intricate and immersive narratives.",
    bannerUrl: undefined,
  },
  "Mistral Nemo": {
    name: "Mistral Nemo",
    original_model: "Mistral Nemo",
    model: "mistralai/mistral-nemo",
    maxTokens: 131000,
    maxOutputTokens: 4000,
    provider: "openrouter",
    supportsToolCalling: false,
    cost: 1,
    inputPrice: 0.02,
    outputPrice: 0.04,
    finetunes: [],
    strengths: ["cost-effective", "general purpose"],
    weaknesses: [
      "creativity",
      "complex tasks",
      "no tool calling",
      "weak ass brains",
    ],
    description:
      "A cost-effective general-purpose model from Mistral, suitable for a variety of tasks but less creative and without tool calling capabilities.",
    bannerUrl: undefined,
  },
} as const;

export interface ModelPreset {
  id: string;
  name: string;
  description: string;
  storyModel: string; // Key from AI_MODELS
  toolsModel: string; // Key from AI_MODELS
  choicesModel: string; // Key from AI_MODELS
  estimatedCost: number; // Sum of the three model costs
}

export const MODEL_PRESETS: Record<string, ModelPreset> = {
  main: {
    id: "main",
    name: "Main",
    description: "Creative narration, powerful tools, fast choices",
    storyModel: "Deepseek Chat",
    toolsModel: "Grok Code Fast 1",
    choicesModel: "Gemini 2.5 Flash Lite",
    estimatedCost: 12, // 1 + 10 + 1
  },
  mainBrain: {
    id: "mainBrain",
    name: "Main with Brain",
    description: "Creative narration, powerful tools, fast choices with Brain",
    storyModel: "Deepseek R1",
    toolsModel: "Grok Code Fast 1",
    choicesModel: "Gemini 2.5 Flash Lite",
    estimatedCost: 13, // 2 + 10 + 1
  },
  budget: {
    id: "broke",
    name: "Broke (Cost-Effective)",
    description: "Best if you owe money or are hiding from the IRS",
    storyModel: "Mistral Medium 3.1",
    toolsModel: "Grok Code Fast 1",
    choicesModel: "Gemini 2.5 Flash Lite",
    estimatedCost: 3, // 1 + 1 + 1
  },
  creative: {
    id: "creative",
    name: "Creative (High Quality)",
    description: "Best creative writing with powerful tool execution",
    storyModel: "Deepseek Reasoner",
    toolsModel: "Grok Code Fast 1",
    choicesModel: "Gemini 2.5 Flash",
    estimatedCost: 21, // 10 + 10 + 1
  },
  balanced: {
    id: "balanced",
    name: "Balanced (Quality + Cost)",
    description: "Good balance between quality and token cost",
    storyModel: "Deepseek Chat",
    toolsModel: "Qwen 2.5 72B Instruct",
    choicesModel: "Gemini 2.5 Flash Lite",
    estimatedCost: 3, // 1 + 1 + 1
  },
  speed: {
    id: "speed",
    name: "Speed (Fast Responses)",
    description: "Optimized for quick generation times",
    storyModel: "Grok 4 Fast",
    toolsModel: "Grok Code Fast 1",
    choicesModel: "Gemini 2.5 Flash Lite",
    estimatedCost: 12, // 10 + 1 + 1
  },
  novelai: {
    id: "novelai",
    name: "NovelAI (Prose Focused)",
    description: "Focused on rich prose and storytelling",
    storyModel: "NovelAI GLM Opus",
    toolsModel: "Grok Code Fast 1",
    choicesModel: "NovelAI GLM Opus",
    estimatedCost: 1, // 0 + 1 + 1
  },
  custom: {
    id: "custom",
    name: "Custom",
    description: "Choose your own models for each stage",
    storyModel: "Deepseek Chat", // Defaults
    toolsModel: "Grok Code Fast 1",
    choicesModel: "Gemini 2.5 Flash Lite",
    estimatedCost: 12,
  },
};

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
