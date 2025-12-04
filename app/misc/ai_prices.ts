export const AI_MODELS = {
  "Grok 4 Fast": {
    name: "Grok 4 Fast",
    original_model: "Grok 4 Fast",
    model: "x-ai/grok-4-fast",
    maxTokens: 1000000,
    maxOutputTokens: 100000,
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
    maxTokens: 128000,
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
    maxTokens: 1000000,
    maxOutputTokens: 65000,
    provider: "openrouter",
    supportsToolCalling: true,
    cost: 1,
    inputPrice: 0.3,
    outputPrice: 2.5,
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
    maxTokens: 1000000,
    maxOutputTokens: 65000,
    provider: "openrouter",
    supportsToolCalling: true,
    cost: 1,
    inputPrice: 0.1,
    outputPrice: 0.4,
    finetunes: [],
    strengths: ["cost-effective"],
    weaknesses: ["smarts"],
    description:
      "A cost-effective model that balances performance and affordability, ideal for users seeking value without compromising too much on quality.",
    bannerUrl: undefined,
  },

  "NovelAI GLM-4-6": {
    name: "NovelAI GLM-4-6 (BYOK)",
    original_model: "glm-4-6",
    model: "glm-4-6",
    maxTokens: 28000,
    maxOutputTokens: 1000,
    provider: "novelai",
    supportsToolCalling: false,
    cost: 0,
    inputPrice: 0,
    outputPrice: 0,
    finetunes: [],
    strengths: ["creative writing", "storytelling", "nsfw"],
    weaknesses: ["context size", "no tool calling"],
    description:
      "NovelAI's storytelling model. Requires your own NovelAI API key (BYOK). No token cost - uses your subscription.",
    bannerUrl: undefined,
  },

  "GLM 4.6": {
    name: "GLM 4.6",
    original_model: "GLM 4.6",
    model: "z-ai/glm-4.6",
    maxTokens: 202000,
    maxOutputTokens: 100000,
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
    maxOutputTokens: 64000,
    provider: "deepseek",
    supportsToolCalling: false,
    cost: 2,
    inputPrice: 0.28,
    outputPrice: 0.42,
    finetunes: [],
    strengths: ["reasoning", "coding", "complex logic"],
    weaknesses: ["speed", "no tool calling"],
    description:
      "A reasoning-focused model that excels at complex logic, planning, and structured generation. Perfect for intricate scenario design.",
    bannerUrl: undefined,
  },

  "Grok Code Fast 1": {
    name: "Grok Code Fast 1",
    original_model: "Grok Code Fast 1",
    model: "x-ai/grok-code-fast-1",
    maxTokens: 250000,
    maxOutputTokens: 10000,
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
    maxOutputTokens: 131072,
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
  "Phi 4": {
    name: "Phi 4",
    original_model: "microsoft/phi-4",
    model: "microsoft/phi-4",
    maxTokens: 16000,
    maxOutputTokens: 16000,
    provider: "openrouter",
    supportsToolCalling: true,
    cost: 1,
    inputPrice: 0.06,
    outputPrice: 0.14,
    finetunes: [],
    strengths: ["powerful", "cost-effective"],
    weaknesses: ["logic"],
    description:
      "A small-sized model from Mistral, offering a balance between performance and cost, suitable for story generation..",
    bannerUrl: undefined,
  },
  "Qwen 3 VL 30B": {
    name: "Qwen 3 VL 30B",
    original_model: "qwen/qwen3-vl-30b-a3b-instruct",
    model: "qwen/qwen3-vl-30b-a3b-instruct",
    maxTokens: 250000,
    maxOutputTokens: 250000,
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
    maxOutputTokens: 250000,
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
    maxOutputTokens: 16000,
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
    maxOutputTokens: 16000,
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
  "GLM 4.5 Air": {
    name: "GLM 4.5 Air",
    original_model: "z-ai/glm-4.5-air",
    model: "z-ai/glm-4.5-air",
    maxTokens: 131000,
    maxOutputTokens: 98000,
    provider: "openrouter",
    supportsToolCalling: true,
    cost: 1,
    inputPrice: 0.104,
    outputPrice: 0.68,
    finetunes: [],
    strengths: ["extremely cost-effective"],
    weaknesses: ["creativity", "logic"],
    description:
      "An extremely cost-effective model from Mistral, suitable for basic tasks where creativity and logic are less critical.",
    bannerUrl: undefined,
  },

  // ============================================
  // MISTRAL MODELS (Server-side API - Coins)
  // ============================================

  "Mistral Small 3.2": {
    name: "Mistral Small 3.2",
    original_model: "mistral-small-2506",
    model: "mistral-small-2506",
    maxTokens: 128000,
    maxOutputTokens: 8000,
    provider: "mistral",
    supportsToolCalling: true,
    cost: 1,
    inputPrice: 0.1,
    outputPrice: 0.3,
    finetunes: [],
    strengths: ["fast", "cost-effective", "tool calling"],
    weaknesses: ["creativity"],
    description:
      "Mistral's efficient small model. Great for fast responses and tool calling. Uses Coins.",
    bannerUrl: undefined,
  },

  "Mistral Medium 3.1": {
    name: "Mistral Medium 3.1",
    original_model: "mistral-medium-2508",
    model: "mistral-medium-2508",
    maxTokens: 128000,
    maxOutputTokens: 8000,
    provider: "mistral",
    supportsToolCalling: true,
    cost: 2,
    inputPrice: 0.4,
    outputPrice: 2.0,
    finetunes: [],
    strengths: ["creativity", "storytelling", "multimodal"],
    weaknesses: ["price"],
    description:
      "Mistral's frontier-class model with excellent creative writing capabilities. Uses Coins.",
    bannerUrl: undefined,
  },

  "Mistral Nemo": {
    name: "Mistral Nemo",
    original_model: "open-mistral-nemo-2407",
    model: "open-mistral-nemo-2407",
    maxTokens: 128000,
    maxOutputTokens: 8000,
    provider: "mistral",
    supportsToolCalling: true,
    cost: 1,
    inputPrice: 0.15,
    outputPrice: 0.15,
    finetunes: [],
    strengths: ["extremely cost-effective", "multilingual"],
    weaknesses: ["creativity", "complex reasoning"],
    description:
      "Mistral's budget-friendly open source model. Great for basic tasks at minimal cost. Uses Coins.",
    bannerUrl: undefined,
  },

  "Ministral 3B": {
    name: "Ministral 3B",
    original_model: "ministral-3b-2510",
    model: "ministral-3b-2410",
    maxTokens: 128000,
    maxOutputTokens: 8000,
    provider: "mistral",
    supportsToolCalling: true,
    cost: 1,
    inputPrice: 0.04,
    outputPrice: 0.04,
    finetunes: [],
    strengths: ["ultra cost-effective", "fast", "edge model"],
    weaknesses: ["creativity", "complex reasoning"],
    description:
      "Mistral's tiny edge model. Ultra-cheap for simple tasks like choices generation. Uses Coins.",
    bannerUrl: undefined,
  },
  "Ministral 8B": {
    name: "Ministral 8B",
    original_model: "ministral-8b-2512",
    model: "ministral-8b-2410",
    maxTokens: 128000,
    maxOutputTokens: 8000,
    provider: "mistral",
    supportsToolCalling: true,
    cost: 1,
    inputPrice: 0.15,
    outputPrice: 0.15,
    finetunes: [],
    strengths: ["ultra cost-effective", "fast", "edge model"],
    weaknesses: ["creativity", "complex reasoning"],
    description:
      "Mistral's tiny edge model. Ultra-cheap for simple tasks like choices generation. Uses Coins.",
    bannerUrl: undefined,
  },
  "Magistral Medium 1.2": {
    name: "Magistral Medium 1.2",
    original_model: "magistral-medium-2509",
    model: "magistral-medium-2509",
    maxTokens: 128000,
    maxOutputTokens: 16000,
    provider: "mistral",
    supportsToolCalling: true,
    cost: 3,
    inputPrice: 2,
    outputPrice: 5,
    finetunes: [],
    strengths: ["creative", "powerful", "tool calling"],
    weaknesses: ["price"],
    description:
      "Mistral's powerful medium model with enhanced creativity and tool calling. Uses Coins.",
    bannerUrl: undefined,
  },
  "Magistral Small 1.2": {
    name: "Magistral Small 1.2",
    original_model: "magistral-small-2509",
    model: "magistral-small-2509",
    maxTokens: 128000,
    maxOutputTokens: 16000,
    provider: "mistral",
    supportsToolCalling: true,
    cost: 3,
    inputPrice: 0.5,
    outputPrice: 1.5,
    finetunes: [],
    strengths: ["creative", "powerful", "tool calling"],
    weaknesses: ["price"],
    description:
      "Mistral's powerful medium model with enhanced creativity and tool calling. Uses Coins.",
    bannerUrl: undefined,
  },
  Codestral: {
    name: "Codestral",
    original_model: "codestral-2508",
    model: "codestral-2508",
    maxTokens: 128000,
    maxOutputTokens: 8000,
    provider: "mistral",
    supportsToolCalling: true,
    cost: 1,
    inputPrice: 0.3,
    outputPrice: 0.9,
    finetunes: [],
    strengths: ["tool calling", "structured output", "logic"],
    weaknesses: ["creativity"],
    description:
      "Mistral's code-optimized model, excellent for tool calling and structured tasks. Uses Coins.",
    bannerUrl: undefined,
  },
  "Mistral Large 3.0": {
    name: "Mistral Large 3.0",
    original_model: "mistral-large-2512",
    model: "mistral-large-latest",
    maxTokens: 256000,
    maxOutputTokens: 100000,
    provider: "mistral",
    supportsToolCalling: true,
    cost: 3,
    inputPrice: 0.5,
    outputPrice: 1.5,
    finetunes: [],
    strengths: ["creativity", "storytelling", "reasoning", "large context"],
    weaknesses: ["price"],
    description:
      "Mistral's flagship large model with 256k context. Excellent for creative writing and complex narratives. Uses Coins.",
    bannerUrl: undefined,
  },
  "Ministral 14B": {
    name: "Ministral 14B",
    original_model: "ministral-14b-2512",
    model: "ministral-14b-2512",
    maxTokens: 256000,
    maxOutputTokens: 8000,
    provider: "mistral",
    supportsToolCalling: true,
    cost: 1,
    inputPrice: 0.2,
    outputPrice: 0.2,
    finetunes: [],
    strengths: ["cost-effective", "fast", "large context"],
    weaknesses: ["complex reasoning"],
    description:
      "Mistral's budget-friendly 14B model with 256k context. Great value for story generation. Uses Coins.",
    bannerUrl: undefined,
  },

  // ============================================
  // DEEPINFRA MODELS (Coins - Server-side API key)
  // ============================================

  "DeepInfra DeepSeek V3.2": {
    name: "DeepInfra DeepSeek V3.2",
    original_model: "deepseek-ai/DeepSeek-V3.2",
    model: "deepseek-ai/DeepSeek-V3.2",
    maxTokens: 160000,
    maxOutputTokens: 16000,
    provider: "deepinfra",
    supportsToolCalling: true,
    cost: 1,
    inputPrice: 0.27,
    outputPrice: 0.41,
    finetunes: [],
    strengths: ["cost-effective", "creative", "long context"],
    weaknesses: [],
    description:
      "DeepSeek V3.2 via DeepInfra. Very cost-effective with excellent performance. Uses Coins.",
    bannerUrl: undefined,
  },

  "DeepInfra DeepSeek V3.1": {
    name: "DeepInfra DeepSeek V3.1",
    original_model: "deepseek-ai/DeepSeek-V3.1",
    model: "deepseek-ai/DeepSeek-V3.1",
    maxTokens: 160000,
    maxOutputTokens: 16000,
    provider: "deepinfra",
    supportsToolCalling: true,
    cost: 1,
    inputPrice: 0.21,
    outputPrice: 0.79,
    finetunes: [],
    strengths: ["cost-effective", "creative", "long context"],
    weaknesses: [],
    description:
      "DeepSeek V3.1 via DeepInfra. Solid performance at low cost. Uses Coins.",
    bannerUrl: undefined,
  },

  "DeepInfra DeepSeek R1": {
    name: "DeepInfra DeepSeek R1",
    original_model: "deepseek-ai/DeepSeek-R1",
    model: "deepseek-ai/DeepSeek-R1",
    maxTokens: 160000,
    maxOutputTokens: 32000,
    provider: "deepinfra",
    supportsToolCalling: false,
    cost: 2,
    inputPrice: 0.7,
    outputPrice: 2.4,
    finetunes: [],
    strengths: ["reasoning", "complex logic", "planning"],
    weaknesses: ["speed", "no tool calling"],
    description:
      "DeepSeek R1 reasoning model via DeepInfra. Excellent for complex problem solving. Uses Coins.",
    bannerUrl: undefined,
  },

  "DeepInfra DeepSeek R1-0528": {
    name: "DeepInfra DeepSeek R1-0528",
    original_model: "deepseek-ai/DeepSeek-R1-0528",
    model: "deepseek-ai/DeepSeek-R1-0528",
    maxTokens: 160000,
    maxOutputTokens: 32000,
    provider: "deepinfra",
    supportsToolCalling: false,
    cost: 2,
    inputPrice: 0.5,
    outputPrice: 2.15,
    finetunes: [],
    strengths: ["reasoning", "creative", "complex logic", "planning"],
    weaknesses: ["speed", "no tool calling"],
    description:
      "DeepSeek R1-0528 reasoning model via DeepInfra. Latest R1 with improved creative writing. Uses Coins.",
    bannerUrl: undefined,
  },

  "DeepInfra Qwen3 235B": {
    name: "DeepInfra Qwen3 235B",
    original_model: "Qwen/Qwen3-235B-A22B-Instruct-2507",
    model: "Qwen/Qwen3-235B-A22B-Instruct-2507",
    maxTokens: 256000,
    maxOutputTokens: 16000,
    provider: "deepinfra",
    supportsToolCalling: true,
    cost: 1,
    inputPrice: 0.09,
    outputPrice: 0.57,
    finetunes: [],
    strengths: ["powerful", "cost-effective", "long context"],
    weaknesses: [],
    description:
      "Qwen3 235B via DeepInfra. Powerful model at excellent price. Uses Coins.",
    bannerUrl: undefined,
  },

  "DeepInfra Qwen3 32B": {
    name: "DeepInfra Qwen3 32B",
    original_model: "Qwen/Qwen3-32B",
    model: "Qwen/Qwen3-32B",
    maxTokens: 40000,
    maxOutputTokens: 8000,
    provider: "deepinfra",
    supportsToolCalling: true,
    cost: 1,
    inputPrice: 0.1,
    outputPrice: 0.28,
    finetunes: [],
    strengths: ["fast", "cost-effective"],
    weaknesses: ["context size"],
    description: "Qwen3 32B via DeepInfra. Fast and affordable. Uses Coins.",
    bannerUrl: undefined,
  },

  "DeepInfra Llama 3.3 70B": {
    name: "DeepInfra Llama 3.3 70B",
    original_model: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
    model: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
    maxTokens: 128000,
    maxOutputTokens: 8000,
    provider: "deepinfra",
    supportsToolCalling: true,
    cost: 1,
    inputPrice: 0.13,
    outputPrice: 0.38,
    finetunes: [],
    strengths: ["fast", "reliable", "cost-effective"],
    weaknesses: [],
    description:
      "Meta's Llama 3.3 70B Turbo via DeepInfra. Fast and reliable. Uses Coins.",
    bannerUrl: undefined,
  },

  "DeepInfra Llama 3.1 8B": {
    name: "DeepInfra Llama 3.1 8B",
    original_model: "meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo",
    model: "meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo",
    maxTokens: 128000,
    maxOutputTokens: 8000,
    provider: "deepinfra",
    supportsToolCalling: true,
    cost: 1,
    inputPrice: 0.02,
    outputPrice: 0.03,
    finetunes: [],
    strengths: ["ultra fast", "extremely cost-effective"],
    weaknesses: ["smaller model"],
    description:
      "Llama 3.1 8B Turbo via DeepInfra. Ultra-cheap for simple tasks. Uses Coins.",
    bannerUrl: undefined,
  },

  "DeepInfra Gemma 3 27B": {
    name: "DeepInfra Gemma 3 27B",
    original_model: "google/gemma-3-27b-it",
    model: "google/gemma-3-27b-it",
    maxTokens: 128000,
    maxOutputTokens: 8000,
    provider: "deepinfra",
    supportsToolCalling: true,
    cost: 1,
    inputPrice: 0.09,
    outputPrice: 0.16,
    finetunes: [],
    strengths: ["balanced", "cost-effective"],
    weaknesses: [],
    description:
      "Google's Gemma 3 27B via DeepInfra. Good balance of quality and cost. Uses Coins.",
    bannerUrl: undefined,
  },

  "DeepInfra Mistral Small 3.2": {
    name: "DeepInfra Mistral Small 3.2",
    original_model: "mistralai/Mistral-Small-3.2-24B-Instruct-2506",
    model: "mistralai/Mistral-Small-3.2-24B-Instruct-2506",
    maxTokens: 125000,
    maxOutputTokens: 8000,
    provider: "deepinfra",
    supportsToolCalling: true,
    cost: 1,
    inputPrice: 0.075,
    outputPrice: 0.2,
    finetunes: [],
    strengths: ["fast", "cost-effective", "tool calling"],
    weaknesses: [],
    description:
      "Mistral Small 3.2 via DeepInfra. Great for tool calling at low cost. Uses Coins.",
    bannerUrl: undefined,
  },

  "DeepInfra GLM 4.6": {
    name: "DeepInfra GLM 4.6",
    original_model: "zai-org/GLM-4.6",
    model: "zai-org/GLM-4.6",
    maxTokens: 200000,
    maxOutputTokens: 16000,
    provider: "deepinfra",
    supportsToolCalling: true,
    cost: 1,
    inputPrice: 0.15,
    outputPrice: 0.6,
    finetunes: [],
    strengths: ["creative", "long context", "nsfw"],
    weaknesses: [],
    description:
      "GLM 4.6 via DeepInfra. Excellent for creative writing. Uses Coins.",
    bannerUrl: undefined,
  },

  "DeepInfra Qwen3 Next 80B": {
    name: "DeepInfra Qwen3 Next 80B",
    original_model: "Qwen/Qwen3-Next-80B-A3B-Instruct",
    model: "Qwen/Qwen3-Next-80B-A3B-Instruct",
    maxTokens: 256000,
    maxOutputTokens: 16000,
    provider: "deepinfra",
    supportsToolCalling: true,
    cost: 1,
    inputPrice: 0.14,
    outputPrice: 1.1,
    finetunes: [],
    strengths: ["powerful", "long context", "MoE", "256k context"],
    weaknesses: [],
    description:
      "Qwen3 Next 80B A3B MoE model via DeepInfra. Powerful with 256k context. Uses Coins.",
    bannerUrl: undefined,
  },

  "DeepInfra Phi 4": {
    name: "DeepInfra Phi 4",
    original_model: "microsoft/phi-4",
    model: "microsoft/phi-4",
    maxTokens: 16000,
    maxOutputTokens: 8000,
    provider: "deepinfra",
    supportsToolCalling: true,
    cost: 1,
    inputPrice: 0.07,
    outputPrice: 0.14,
    finetunes: [],
    strengths: ["fast", "cost-effective", "small"],
    weaknesses: ["context size"],
    description:
      "Microsoft Phi 4 via DeepInfra. Very cheap for simple tasks like choice generation. Uses Coins.",
    bannerUrl: undefined,
  },

  "DeepInfra GPT-OSS 20B": {
    name: "DeepInfra GPT-OSS 20B",
    original_model: "openai/gpt-oss-20b",
    model: "openai/gpt-oss-20b",
    maxTokens: 128000,
    maxOutputTokens: 16000,
    provider: "deepinfra",
    supportsToolCalling: true,
    cost: 1,
    inputPrice: 0.03,
    outputPrice: 0.14,
    finetunes: [],
    strengths: ["ultra cheap", "fast", "long context", "tool calling"],
    weaknesses: [],
    description:
      "OpenAI's open-weight GPT-OSS 20B MoE model via DeepInfra. Extremely cheap with 131k context. Uses Coins.",
    bannerUrl: undefined,
  },

  "DeepInfra Qwen3 30B A3B": {
    name: "DeepInfra Qwen3 30B A3B",
    original_model: "Qwen/Qwen3-30B-A3B",
    model: "Qwen/Qwen3-30B-A3B",
    maxTokens: 40000,
    maxOutputTokens: 8000,
    provider: "deepinfra",
    supportsToolCalling: true,
    cost: 1,
    inputPrice: 0.08,
    outputPrice: 0.29,
    finetunes: [],
    strengths: ["fast", "cost-effective", "MoE"],
    weaknesses: ["context size"],
    description:
      "Qwen3 30B A3B MoE model via DeepInfra. Fast and very affordable. Uses Coins.",
    bannerUrl: undefined,
  },
} as const;
export const OPENROUTER_IMAGE_MODELS = {
  "Nano Banana Pro": {
    name: "Nano Banana Pro",
    model: "google/gemini-3-pro-image-preview",
    description: "Optimized for image generation tasks.",
    maxTokens: 65000,
    maxOutputTokens: 32000,
    provider: "openrouter",
    // Official: $2/$12, but actual image gen billing is ~7.5x higher
    // Based on real usage: ~$0.14 for ~1600 output tokens
    inputPrice: 2, // $/1M tokens (official)
    outputPrice: 90, // $/1M tokens (effective for image gen)
    cost: 300, // Fallback flat cost
  },
  "Nano Banana": {
    name: "Nano Banana",
    model: "google/gemini-2.5-flash-image",
    description: "Balanced model for image generation tasks.",
    maxTokens: 33000,
    maxOutputTokens: 32000,
    provider: "openrouter",
    // Official: $0.30/$2.50, but actual image gen billing is ~12x higher
    // Based on real usage: ~$0.038 for ~1300 output tokens
    inputPrice: 0.3, // $/1M tokens (official)
    outputPrice: 30, // $/1M tokens (effective for image gen)
    cost: 80, // Fallback flat cost
  },
  "Flux 2 Pro": {
    name: "Flux 2 Pro",
    model: "black-forest-labs/flux.2-pro",
    description: "High-quality image generation with advanced features.",
    maxTokens: 46000,
    maxOutputTokens: 46000,
    provider: "openrouter",
    // Flux charges per-image flat rate, not per-token
    inputPrice: 0,
    outputPrice: 0,
    cost: 60, // ~$0.03 per image × 2 markup × 1000 coins/$
  },
  "Flux 2 Flex": {
    name: "Flux 2 Flex",
    model: "black-forest-labs/flux.2-flex",
    description: "Flexible model for various image generation needs.",
    maxTokens: 67000,
    maxOutputTokens: 67000,
    provider: "openrouter",
    // Flux charges per-image flat rate, not per-token
    inputPrice: 0,
    outputPrice: 0,
    cost: 30, // ~$0.015 per image × 2 markup × 1000 coins/$
  },
  "GPT-5 Image": {
    name: "GPT-5 Image",
    model: "openai/gpt-5-image",
    description: "State-of-the-art image generation model.",
    maxTokens: 400000,
    maxOutputTokens: 128000,
    provider: "openrouter",
    // GPT image models charge based on output tokens
    inputPrice: 10,
    outputPrice: 40, // Higher effective rate for image gen
    cost: 200, // Fallback flat cost
  },
  "GPT-5 Image Mini": {
    name: "GPT-5 Image Mini",
    model: "openai/gpt-5-image-mini",
    description: "Compact version of GPT-5 for image generation.",
    maxTokens: 400000,
    maxOutputTokens: 128000,
    provider: "openrouter",
    inputPrice: 2.5,
    outputPrice: 10, // Higher effective rate for image gen
    cost: 50, // Fallback flat cost
  },
};

// Helper type for image models
export type ImageModelKey = keyof typeof OPENROUTER_IMAGE_MODELS;

// DeepInfra Image Models (server-side key - users pay with coins, or BYOK)
export const DEEPINFRA_IMAGE_MODELS = {
  "Bria 3.2": {
    name: "Bria 3.2",
    model: "Bria/Bria-3.2",
    description: "Fast, commercial-ready with great text rendering. FREE!",
    provider: "deepinfra",
    pricePerImage: 0.0, // FREE
    cost: 0, // No coins needed
  },
  "P-Image": {
    name: "P-Image",
    model: "PrunaAI/p-image",
    description: "State-of-the-art, <1 second, exceptional text rendering.",
    provider: "deepinfra",
    pricePerImage: 0.005,
    cost: 13, // $0.005 × 2.5 markup × 1000 coins/$
  },
  "FLUX 2 Pro": {
    name: "FLUX 2 Pro",
    model: "black-forest-labs/FLUX-2-pro",
    description: "Premium photorealistic with precise control.",
    provider: "deepinfra",
    pricePerImage: 0.015,
    cost: 38, // $0.015 × 2.5 markup × 1000 coins/$
  },
} as const;

// Helper type for DeepInfra image models
export type DeepInfraImageModelKey = keyof typeof DEEPINFRA_IMAGE_MODELS;

/**
 * Check if an image model is a pure image generation model (Flux) vs chat-based (Gemini/GPT)
 */
export function isPureImageModel(modelId: string): boolean {
  return modelId.includes("flux") || modelId.includes("black-forest-labs");
}

/**
 * Calculate the cost in coins for DeepInfra image generation
 * @param modelKey - Key from DEEPINFRA_IMAGE_MODELS
 * @returns Cost in coins (can be 0 for free models like Bria)
 */
export function calculateDeepInfraImageCost(modelKey: string): number {
  const model = DEEPINFRA_IMAGE_MODELS[modelKey as DeepInfraImageModelKey];
  if (!model) {
    return MINIMUM_COST;
  }
  return model.cost;
}

/**
 * Calculate actual cost for image generation based on token usage
 * @param modelKey - Key from OPENROUTER_IMAGE_MODELS
 * @param inputTokens - Actual input tokens from API response
 * @param outputTokens - Actual output tokens from API response
 * @returns Cost in coins
 */
export function calculateImageTokenCost(
  modelKey: string,
  inputTokens: number,
  outputTokens: number
): number {
  const model = OPENROUTER_IMAGE_MODELS[modelKey as ImageModelKey];
  if (!model) {
    return MINIMUM_COST;
  }

  // For pure image models (Flux), use flat cost since they charge per-image
  if (isPureImageModel(model.model)) {
    return model.cost;
  }

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
 * Estimate cost for image generation (for display purposes before generation)
 * @param modelKey - Key from OPENROUTER_IMAGE_MODELS
 * @returns Estimated cost in coins
 */
export function estimateImageCost(modelKey: string): number {
  const model = OPENROUTER_IMAGE_MODELS[modelKey as ImageModelKey];
  if (!model) {
    return MINIMUM_COST;
  }

  // For pure image models (Flux), use flat cost since no token usage
  if (isPureImageModel(model.model)) {
    return model.cost;
  }

  // For chat-based models, estimate based on typical token usage
  // Input: ~400 tokens for prompt, Output: ~1500 tokens for image
  const estimatedInputTokens = 400;
  const estimatedOutputTokens = 1500;
  return calculateImageTokenCost(
    modelKey,
    estimatedInputTokens,
    estimatedOutputTokens
  );
}

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
  custom: {
    id: "custom",
    name: "Custom",
    description: "Choose your own models for each stage",
    storyModel: "Deepseek Chat", // Defaults
    toolsModel: "Grok Code Fast 1",
    choicesModel: "Gemini 2.5 Flash Lite",
    estimatedCost: 12,
  },
  mistralLarge: {
    id: "mistralLarge",
    name: "Mistral Large",
    description: "Mistral Large 3.0 for story with 256k context - uses Coins",
    storyModel: "Mistral Large 3.0",
    toolsModel: "Codestral",
    choicesModel: "Ministral 8B",
    estimatedCost: 5,
  },
  mistralMedium: {
    id: "mistralMedium",
    name: "Mistral Medium",
    description: "Balanced Mistral models - uses Coins for payment",
    storyModel: "Mistral Medium 3.1",
    toolsModel: "Codestral",
    choicesModel: "Ministral 8B",
    estimatedCost: 4,
  },
  mistralBudget: {
    id: "mistralBudget",
    name: "Mistral Budget",
    description: "Ministral 14B story with 256k context - uses Coins",
    storyModel: "Ministral 14B",
    toolsModel: "Codestral",
    choicesModel: "Ministral 3B",
    estimatedCost: 2,
  },
  deepseek: {
    id: "deepseek",
    name: "DeepSeek Standard",
    description: "DeepSeek V3.2 story/tools, Phi 4 choices - uses Coins",
    storyModel: "DeepInfra DeepSeek V3.2",
    toolsModel: "DeepInfra DeepSeek V3.2",
    choicesModel: "DeepInfra Phi 4",
    estimatedCost: 2,
  },
  deepseekBrain: {
    id: "deepseekBrain",
    name: "DeepSeek Brain",
    description: "DeepSeek R1-0528 reasoning for story - uses Coins",
    storyModel: "DeepInfra DeepSeek R1-0528",
    toolsModel: "DeepInfra DeepSeek V3.2",
    choicesModel: "DeepInfra Phi 4",
    estimatedCost: 3,
  },
  ultraBudget: {
    id: "ultraBudget",
    name: "Ultra Budget",
    description: "Maximum savings with GPT-OSS 20B - uses Coins",
    storyModel: "DeepInfra GPT-OSS 20B",
    toolsModel: "DeepInfra GPT-OSS 20B",
    choicesModel: "DeepInfra Phi 4",
    estimatedCost: 1,
  },
  qwenBudget: {
    id: "qwenBudget",
    name: "Qwen Budget",
    description: "Qwen3 30B MoE for story, Qwen3 32B tools - uses Coins",
    storyModel: "DeepInfra Qwen3 30B A3B",
    toolsModel: "DeepInfra Qwen3 32B",
    choicesModel: "DeepInfra Phi 4",
    estimatedCost: 1,
  },
  qwenPremium: {
    id: "qwenPremium",
    name: "Qwen Premium",
    description: "Qwen3 Next 80B for story with 256k context - uses Coins",
    storyModel: "DeepInfra Qwen3 Next 80B",
    toolsModel: "DeepInfra Qwen3 32B",
    choicesModel: "DeepInfra Phi 4",
    estimatedCost: 2,
  },
  glmCreative: {
    id: "glmCreative",
    name: "GLM Creative",
    description: "GLM 4.6 for creative/NSFW writing - uses Coins",
    storyModel: "DeepInfra GLM 4.6",
    toolsModel: "DeepInfra DeepSeek V3.2",
    choicesModel: "DeepInfra Phi 4",
    estimatedCost: 2,
  },
  gemmaBalanced: {
    id: "gemmaBalanced",
    name: "Gemma Balanced",
    description: "Google Gemma 3 27B for all stages - uses Coins",
    storyModel: "DeepInfra Gemma 3 27B",
    toolsModel: "DeepInfra Gemma 3 27B",
    choicesModel: "DeepInfra Llama 3.1 8B",
    estimatedCost: 1,
  },
  byokDeepseek: {
    id: "byokDeepseek",
    name: "BYOK DeepSeek",
    description: "DeepSeek Chat for all stages - uses your DeepSeek API key",
    storyModel: "Deepseek Chat",
    toolsModel: "Deepseek Chat",
    choicesModel: "Deepseek Chat",
    estimatedCost: 0,
  },
  byokOpenRouter: {
    id: "byokOpenRouter",
    name: "BYOK OpenRouter",
    description: "The best openrouter models - uses your OpenRouter API key",
    storyModel: "GLM 4.6",
    toolsModel: "Gemini 2.5 Flash",
    choicesModel: "Gemini 2.5 Flash Lite",
    estimatedCost: 0,
  },
};

// ============================================
// MODEL FILTERING HELPERS
// ============================================

export interface APIKeysAvailable {
  openRouterKey?: boolean;
  deepseekKey?: boolean;
  novelaiKey?: boolean;
  coinsEnabled?: boolean; // For Mistral and DeepInfra models that use server-side API
}

/**
 * Filter AI models based on which API keys the user has configured
 * - OpenRouter models: Shown when user has OpenRouter key
 * - DeepSeek models: Shown only when user has DeepSeek API key
 * - DeepInfra models: Shown when coins are enabled (server-side API)
 * - NovelAI models: Shown only when user has NovelAI key
 *
 * @param keys - Object indicating which keys the user has
 * @returns Array of [modelKey, config] entries for available models
 */
export function getAvailableModels(
  keys: APIKeysAvailable
): [string, AIModelConfig][] {
  const entries = Object.entries(AI_MODELS) as [string, AIModelConfig][];

  return entries.filter(([, config]) => {
    switch (config.provider) {
      case "openrouter":
        return !!keys.openRouterKey;
      case "deepseek":
        return !!keys.deepseekKey;
      case "deepinfra":
        return !!keys.coinsEnabled;
      case "novelai":
        return !!keys.novelaiKey;
      case "mistral":
        return !!keys.coinsEnabled;
      default:
        return false;
    }
  });
}

/**
 * Get available model keys as an array
 */
export function getAvailableModelKeys(keys: APIKeysAvailable): string[] {
  return getAvailableModels(keys).map(([key]) => key);
}

/**
 * Check if user has any API key configured for AI generation
 */
export function hasAnyAIKey(keys: APIKeysAvailable): boolean {
  return !!(
    keys.openRouterKey ||
    keys.deepseekKey ||
    keys.novelaiKey ||
    keys.coinsEnabled
  );
}

/**
 * Get the required provider key name for a model
 */
export function getRequiredKeyForModel(
  modelKey: string
): keyof APIKeysAvailable | null {
  const config = AI_MODELS[modelKey as AIModelKey];
  if (!config) return null;

  switch (config.provider) {
    case "openrouter":
      return "openRouterKey";
    case "deepseek":
      return "deepseekKey";
    case "deepinfra":
      return "coinsEnabled";
    case "novelai":
      return "novelaiKey";
    case "mistral":
      return "coinsEnabled";
    default:
      return null;
  }
}

/**
 * Check if a specific model is available based on user's API keys
 */
export function isModelAvailable(
  modelKey: string,
  keys: APIKeysAvailable
): boolean {
  const requiredKey = getRequiredKeyForModel(modelKey);
  if (!requiredKey) return false;
  return !!keys[requiredKey];
}

export interface AIModelConfig {
  name: string;
  original_model: string;
  model: string;
  maxTokens: number;
  maxOutputTokens: number;
  provider: "openrouter" | "deepseek" | "novelai" | "mistral" | "deepinfra";
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
export const MARKUP_MULTIPLIER = 2.5; // 150% markup for service
export const COINS_PER_DOLLAR = 1000; // 1 coin = $0.001
export const MINIMUM_COST = 1; // Minimum 1 coin per API call

// TTS pricing (DeepInfra)
export const TTS_MODELS = {
  kokoro: {
    name: "Kokoro-82M",
    provider: "DeepInfra",
    pricePerMillionChars: 0.62, // $0.62 per 1M characters
    description: "Fast, cost-effective TTS with natural voices",
  },
  orpheus: {
    name: "Orpheus 3B",
    provider: "DeepInfra",
    pricePerMillionChars: 7.0, // $7.00 per 1M characters
    description: "Premium expressive TTS with emotional range",
  },
} as const;

export type TTSModelKey = keyof typeof TTS_MODELS;

/**
 * Calculate the cost in coins for TTS generation
 * @param characterCount - Number of characters to convert to speech
 * @param model - TTS model to use (kokoro or orpheus)
 * @returns Cost in coins (minimum 1)
 */
export function calculateTTSCost(
  characterCount: number,
  model: TTSModelKey = "kokoro"
): number {
  const ttsModel = TTS_MODELS[model] || TTS_MODELS.kokoro;

  // Calculate raw cost in dollars
  const rawCost = (characterCount / 1_000_000) * ttsModel.pricePerMillionChars;

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
 * Calculate cost in coins from provider's estimated_cost (in dollars)
 * Used for DeepInfra which provides estimated_cost in the response
 * @param estimatedCost - The estimated cost in dollars from the provider
 * @returns Cost in coins (minimum 1)
 */
export function calculateCostFromEstimatedCost(estimatedCost: number): number {
  // Apply markup and convert to coins
  const costWithMarkup = estimatedCost * MARKUP_MULTIPLIER;
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

  // Check if this looks like a UUID (custom model)
  // UUIDs are 36 chars with format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
  const isUUID =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      modelKey
    );

  if (isUUID) {
    // Custom models are always OpenRouter BYOK - return a generic OpenRouter config
    // The actual model ID will be resolved from user settings on the frontend
    console.warn(
      `Custom model UUID "${modelKey}" passed to getModelConfig. Using OpenRouter fallback. ` +
        `For proper handling, pass the actual model ID instead of UUID.`
    );
    return {
      name: "Custom Model",
      original_model: modelKey,
      model: modelKey, // This won't work directly - frontend should pass modelId
      maxTokens: 128000,
      maxOutputTokens: 8000,
      provider: "openrouter", // Custom models are always OpenRouter
      supportsToolCalling: true,
      cost: 0,
      inputPrice: 0,
      outputPrice: 0,
      finetunes: [],
      strengths: [],
      weaknesses: [],
      description: "Custom user-defined model",
      bannerUrl: undefined,
    };
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
 * Get the estimated cost for just the story stage
 * Useful for calculating BYOK savings when using external providers like NovelAI
 * @param storyModel - Model key for story stage
 * @param contextSize - Optional custom context size in tokens
 * @returns Estimated cost in coins for story stage only
 */
export function getStoryStageCost(
  storyModel: string,
  contextSize: number = 120000
): number {
  return calculateTokenCost(storyModel, contextSize, 1500);
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
