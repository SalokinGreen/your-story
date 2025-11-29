export const AI_MODELS = {
  "Grok 4 Fast": {
    name: "Grok 4 Fast",
    original_model: "Grok 4 Fast",
    model: "x-ai/grok-4-fast",
    maxTokens: 500000,
    maxOutputTokens: 8000,
    provider: "openrouter",
    supportsToolCalling: true,
    strengths: ["creative", "nsfw"],
    weaknesses: ["price"],
    description:
      "An imaginative model excelling in creative writing and storytelling, ideal for generating vivid narratives.",
    bannerUrl: undefined,
    cost: 10,
    inputPrice: 0.4,
    outputPrice: 1,
    finetunes: [],
  },

  "Deepseek Chat": {
    name: "Deepseek Chat",
    original_model: "Deepseek Chat",
    model: "deepseek-chat",
    maxTokens: 120000,
    maxOutputTokens: 8000,
    provider: "deepseek",
    supportsToolCalling: true,
    cost: 1,
    inputPrice: 0.28,
    outputPrice: 0.42,
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
    maxOutputTokens: 8000,
    cost: 10,
    inputPrice: 0.4,
    outputPrice: 1.75,
    provider: "openrouter",
    supportsToolCalling: true,
    finetunes: [],
    strengths: ["long context", "powerful", "nsfw"],
    weaknesses: ["price"],
    description:
      "A robust model designed for handling extensive context and delivering powerful performance, making it suitable for complex storytelling and detailed narratives.",
    bannerUrl: undefined,
  },

  "Deepseek R1": {
    name: "DeepSeek R1",
    original_model: "DeepSeek R1",
    model: "deepseek-reasoner",
    maxTokens: 128000,
    maxOutputTokens: 8000,
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
    maxOutputTokens: 8000,
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
  "MiniMax M2": {
    name: "MiniMax M2",
    original_model: "MiniMax M2",
    model: "minimax/minimax-m2",
    maxTokens: 204800,
    maxOutputTokens: 8000,
    provider: "openrouter",
    supportsToolCalling: true,
    cost: 1,
    inputPrice: 0.255,
    outputPrice: 1.02,
    finetunes: [],
    strengths: ["cost-effective", "tool calling", "large context"],
    weaknesses: [],
    description:
      "A popular and cost-effective model with large context window, suitable for tool calling and general tasks.",
    bannerUrl: undefined,
  },
  "microsoft/phi-4": {
    name: "Phi 4",
    original_model: "microsoft/phi-4",
    model: "microsoft/phi-4",
    maxTokens: 160000,
    maxOutputTokens: 4000,
    provider: "openrouter",
    supportsToolCalling: true,
    cost: 1,
    inputPrice: 0.1,
    outputPrice: 0.1,
    finetunes: [],
    strengths: ["powerful", "cost-effective"],
    weaknesses: ["logic"],
    description:
      "A small-sized model from Mistral, offering a balance between performance and cost, suitable for story generation..",
    bannerUrl: undefined,
  },
  "qwen/qwen3-vl-30b-a3b-instruct": {
    name: "Qwen 3 VL 30B A3B Instruct",
    original_model: "qwen/qwen3-vl-30b-a3b-instruct",
    model: "qwen/qwen3-vl-30b-a3b-instruct",
    maxTokens: 250000,
    maxOutputTokens: 8000,
    provider: "openrouter",
    supportsToolCalling: true,
    cost: 1,
    inputPrice: 0.15,
    outputPrice: 0.6,
    finetunes: [],
    strengths: ["powerful", "cost-effective"],
    weaknesses: ["logic"],
    description:
      "A powerful model from Qwen, suitable for a variety of tasks including storytelling and content generation.",
    bannerUrl: undefined,
  },
  "Qwen 3 Next 80b": {
    name: "Qwen 3 Next 80B",
    original_model: "qwen/qwen3-next-80b-a3b-instruct",
    model: "qwen/qwen3-next-80b-a3b-instruct",
    maxTokens: 250000,
    maxOutputTokens: 8000,
    provider: "openrouter",
    supportsToolCalling: true,
    cost: 5,
    inputPrice: 0.1,
    outputPrice: 0.8,
    finetunes: [],
    strengths: ["powerful", "long context"],
    weaknesses: ["price"],
    description:
      "The largest Qwen model, excelling in handling long contexts and delivering high-quality content generation.",
    bannerUrl: undefined,
  },
  "Qwen 3 235B A22B Instruct": {
    name: "Qwen 3 235B A22B Instruct",
    original_model: "qwen/qwen3-235b-a22b-2507",
    model: "qwen/qwen3-235b-a22b-2507",
    maxTokens: 131000,
    maxOutputTokens: 8000,
    provider: "openrouter",
    supportsToolCalling: true,
    cost: 1,
    inputPrice: 0.072,
    outputPrice: 0.464,
    finetunes: [],
    strengths: ["powerful", "cost-effective"],
    weaknesses: ["logic"],
    description:
      "A powerful and cost-effective model from Qwen, suitable for a variety of tasks including storytelling and content generation.",
    bannerUrl: undefined,
  },
  "Mistral Nemo 12B": {
    name: "Mistral Nemo 12B",
    original_model: "mistralai/mistral-nemo",
    model: "mistralai/mistral-nemo",
    maxTokens: 131000,
    maxOutputTokens: 4000,
    provider: "openrouter",
    supportsToolCalling: true,
    cost: 1,
    inputPrice: 0.02,
    outputPrice: 0.04,
    finetunes: [],
    strengths: ["extremely cost-effective"],
    weaknesses: ["creativity", "logic"],
    description:
      "An extremely cost-effective model from Mistral, suitable for basic tasks where creativity and logic are less critical.",
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
    toolsModel: "Deepseek Chat",
    choicesModel: "Gemini 2.5 Flash Lite",
    estimatedCost: 6, // 1 + 10 + 1
  },
  mainBrain: {
    id: "mainBrain",
    name: "Main with Brain",
    description: "Smarter than main, with reasoning capabilities",
    storyModel: "Deepseek R1",
    toolsModel: "Deepseek Chat",
    choicesModel: "Gemini 2.5 Flash Lite",
    estimatedCost: 13, // 2 + 10 + 1
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

  clusterTwo: {
    id: "clusterTwo",
    name: "Cluster David",
    description: "High performance with advanced capabilities",
    storyModel: "qwen/qwen3-vl-30b-a3b-instruct",
    toolsModel: "Deepseek Chat",
    choicesModel: "microsoft/phi-4",
    estimatedCost: 5, // 1 + 1 + 1
  },
  clusterFour: {
    id: "clusterFour",
    name: "Cluster Moses",
    description: "Balanced performance and cost-effectiveness",
    storyModel: "Qwen 3 Next 80b",
    toolsModel: "Deepseek Chat",
    choicesModel: "microsoft/phi-4",
    estimatedCost: 7, // 5 + 1 + 1
  },
  clusterFive: {
    id: "clusterFive",
    name: "Cluster Goliath",
    description: "Maximum power for the most demanding adventures",
    storyModel: "Qwen 3 235B A22B Instruct",
    toolsModel: "Deepseek Chat",
    choicesModel: "microsoft/phi-4",
    estimatedCost: 3, // 1 + 1 + 1
  },
  cheap: {
    id: "cheap",
    name: "Budget",
    description: "Affordable generation with basic capabilities",
    storyModel: "Mistral Nemo 12B",
    toolsModel: "Deepseek Chat",
    choicesModel: "microsoft/phi-4",
    estimatedCost: 1, // 1 + 1 + 1
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

// ============================================
// DYNAMIC COST CALCULATION
// ============================================

// Constants for cost calculation
export const MARKUP_MULTIPLIER = 2.0; // 100% markup for service
export const COINS_PER_DOLLAR = 1000; // 1 coin = $0.001
export const MINIMUM_COST = 1; // Minimum 1 coin per API call

// TTS pricing (Speechify)
export const TTS_PRICE_PER_MILLION_CHARS = 10; // $10 per 1M characters

/**
 * Calculate the cost in coins for TTS generation
 * @param characterCount - Number of characters to convert to speech
 * @returns Cost in coins (minimum 1)
 */
export function calculateTTSCost(characterCount: number): number {
  // Calculate raw cost in dollars ($10 per 1M characters)
  const rawCost = (characterCount / 1_000_000) * TTS_PRICE_PER_MILLION_CHARS;

  // Apply markup and convert to coins
  const costWithMarkup = rawCost * MARKUP_MULTIPLIER;
  const costInCoins = Math.ceil(costWithMarkup * COINS_PER_DOLLAR);

  // Ensure minimum cost
  return Math.max(costInCoins, MINIMUM_COST);
}

/**
 * Calculate the cost in coins for a given model and token usage
 * @param modelKey - The key of the model in AI_MODELS (or model identifier string)
 * @param inputTokens - Number of input tokens used
 * @param outputTokens - Number of output tokens generated
 * @returns Cost in coins (minimum 1)
 */
export function calculateTokenCost(
  modelKey: string,
  inputTokens: number,
  outputTokens: number
): number {
  const model = getModelConfig(modelKey);

  // Calculate raw cost in dollars (prices are per 1M tokens)
  const inputCost = (inputTokens / 1_000_000) * model.inputPrice;
  const outputCost = (outputTokens / 1_000_000) * model.outputPrice;
  const rawCost = inputCost + outputCost;

  // Apply markup and convert to coins
  const costWithMarkup = rawCost * MARKUP_MULTIPLIER;
  const costInCoins = Math.ceil(costWithMarkup * COINS_PER_DOLLAR);

  // Ensure minimum cost
  return Math.max(costInCoins, MINIMUM_COST);
}

/**
 * Estimate cost for a typical generation (for display purposes)
 * @param modelKey - The key of the model in AI_MODELS
 * @param estimatedInputTokens - Expected input tokens (default 3000)
 * @param estimatedOutputTokens - Expected output tokens (default 1500)
 * @returns Estimated cost in coins
 */
export function estimateGenerationCost(
  modelKey: string,
  estimatedInputTokens: number = 3000,
  estimatedOutputTokens: number = 1500
): number {
  return calculateTokenCost(
    modelKey,
    estimatedInputTokens,
    estimatedOutputTokens
  );
}

/**
 * Estimate total cost for a full 3-stage generation turn
 * Based on typical 100k context gameplay
 * @param storyModel - Model key for story generation
 * @param toolsModel - Model key for tools stage
 * @param choicesModel - Model key for choices stage
 * @param contextSize - Optional custom context size in tokens (default 120000)
 * @returns Estimated total cost in coins
 */
export function estimateFullTurnCost(
  storyModel: string,
  toolsModel: string,
  choicesModel: string,
  contextSize: number = 120000
): number {
  // Scale context usage based on provided size
  // Story: full context + system prompt, ~1.5k output
  // Tools: ~25% of story context, ~500 output
  // Choices: ~17% of story context, ~300 output
  const storyInputTokens = contextSize;
  const toolsInputTokens = Math.floor(contextSize * 0.25);
  const choicesInputTokens = Math.floor(contextSize * 0.17);

  const storyCost = calculateTokenCost(storyModel, storyInputTokens, 1500);
  const toolsCost = calculateTokenCost(toolsModel, toolsInputTokens, 500);
  const choicesCost = calculateTokenCost(choicesModel, choicesInputTokens, 300);

  return storyCost + toolsCost + choicesCost;
}

// Average TTS character count per generation (typical story narration)
export const AVERAGE_TTS_CHARACTERS = 1500;

/**
 * Estimate cost for a full turn including TTS narration
 * @param storyModel - Model key for story generation
 * @param toolsModel - Model key for tools stage
 * @param choicesModel - Model key for choices stage
 * @param includeTTS - Whether to include TTS cost (default true)
 * @returns Estimated total cost in coins
 */
export function estimateFullTurnWithTTS(
  storyModel: string,
  toolsModel: string,
  choicesModel: string,
  includeTTS: boolean = true
): number {
  const generationCost = estimateFullTurnCost(
    storyModel,
    toolsModel,
    choicesModel
  );
  const ttsCost = includeTTS ? calculateTTSCost(AVERAGE_TTS_CHARACTERS) : 0;
  return generationCost + ttsCost;
}

/**
 * Get estimated costs for display purposes
 * @param presetId - The preset ID from MODEL_PRESETS
 * @returns Object with generation and TTS costs
 */
export function getPresetCostBreakdown(presetId: string): {
  generationCost: number;
  ttsCost: number;
  totalWithTTS: number;
} {
  const preset = MODEL_PRESETS[presetId];
  if (!preset) {
    return {
      generationCost: MINIMUM_COST,
      ttsCost: MINIMUM_COST,
      totalWithTTS: MINIMUM_COST * 2,
    };
  }

  const generationCost = estimateFullTurnCost(
    preset.storyModel,
    preset.toolsModel,
    preset.choicesModel
  );
  const ttsCost = calculateTTSCost(AVERAGE_TTS_CHARACTERS);

  return {
    generationCost,
    ttsCost,
    totalWithTTS: generationCost + ttsCost,
  };
}

/**
 * Get a human-readable cost breakdown for a model
 * @param modelKey - The key of the model
 * @returns Object with pricing info
 */
export function getModelPricing(modelKey: string): {
  inputPricePerMillion: number;
  outputPricePerMillion: number;
  inputPriceWithMarkup: number;
  outputPriceWithMarkup: number;
  estimatedCostPerTurn: number;
} {
  const model = getModelConfig(modelKey);
  return {
    inputPricePerMillion: model.inputPrice,
    outputPricePerMillion: model.outputPrice,
    inputPriceWithMarkup: model.inputPrice * MARKUP_MULTIPLIER,
    outputPriceWithMarkup: model.outputPrice * MARKUP_MULTIPLIER,
    estimatedCostPerTurn: estimateGenerationCost(modelKey),
  };
}

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

/**
 * Get the dynamic estimated cost for a preset
 * @param presetId - The preset ID from MODEL_PRESETS
 * @param contextSize - Optional custom context size in tokens
 * @returns Estimated cost in coins for a full turn
 */
export function getPresetEstimatedCost(
  presetId: string,
  contextSize?: number
): number {
  const preset = MODEL_PRESETS[presetId];
  if (!preset) {
    return MINIMUM_COST;
  }
  return estimateFullTurnCost(
    preset.storyModel,
    preset.toolsModel,
    preset.choicesModel,
    contextSize
  );
}

/**
 * Get the dynamic estimated cost for custom model selection
 * @param storyModel - Model key for story stage
 * @param toolsModel - Model key for tools stage
 * @param choicesModel - Model key for choices stage
 * @param contextSize - Optional custom context size in tokens
 * @returns Estimated cost in coins for a full turn
 */
export function getCustomEstimatedCost(
  storyModel: string,
  toolsModel: string,
  choicesModel: string,
  contextSize?: number
): number {
  return estimateFullTurnCost(
    storyModel,
    toolsModel,
    choicesModel,
    contextSize
  );
}
