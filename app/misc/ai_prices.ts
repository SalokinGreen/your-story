export const AI_MODELS = {
  "Grok 4.5": {
    name: "Grok 4.5",
    original_model: "Grok 4.5",
    model: "x-ai/grok-4.5",
    maxTokens: 500000,
    maxOutputTokens: 100000,
    provider: "openrouter",
    supportsToolCalling: true,
    strengths: ["logic", "reasoning", "tool calling", "coding"],
    weaknesses: ["price"],
    description:
      "xAI's frontier model for coding, knowledge work, and STEM. Strong at rules adjudication and tool-heavy turns. Defaults to high reasoning effort; billing doubles above 200k-token prompts.",
    bannerUrl: undefined,
    inputPrice: 2,
    outputPrice: 6,
    finetunes: [],
  },

  "DeepSeek V4 Flash": {
    name: "DeepSeek V4 Flash",
    original_model: "DeepSeek V4 Flash",
    model: "deepseek-v4-flash",
    maxTokens: 1000000,
    maxOutputTokens: 65000,
    provider: "deepseek",
    supportsToolCalling: true,
    inputPrice: 0.14,
    outputPrice: 0.28,
    finetunes: [],
    strengths: ["creativity", "nsfw"],
    weaknesses: ["price"],
    description:
      "DeepSeek's fast successor to DeepSeek Chat, known for its creativity and ability to handle long-form content, making it suitable for detailed storytelling and complex narratives.",
    bannerUrl: undefined,
  },
  "DeepSeek V4 Pro": {
    name: "DeepSeek V4 Pro",
    original_model: "DeepSeek V4 Pro",
    model: "deepseek-v4-pro",
    maxTokens: 1000000,
    maxOutputTokens: 65000,
    provider: "deepseek",
    supportsToolCalling: true,
    inputPrice: 0.435,
    outputPrice: 0.87,
    finetunes: [],
    strengths: ["creativity", "smarts", "nsfw"],
    weaknesses: ["price"],
    description:
      "DeepSeek's higher-quality flagship model with deeper reasoning, ideal for complex narratives that need stronger consistency.",
    bannerUrl: undefined,
  },
  "Gemini 3.1 Flash Lite": {
    name: "Gemini 3.1 Flash Lite",
    original_model: "Gemini 3.1 Flash Lite",
    model: "google/gemini-3.1-flash-lite",
    maxTokens: 1000000,
    maxOutputTokens: 65000,
    provider: "openrouter",
    supportsToolCalling: true,
    inputPrice: 0.25,
    outputPrice: 1.5,
    finetunes: [],
    strengths: ["cost-effective", "tool calling", "long context"],
    weaknesses: [],
    description:
      "Google's GA low-latency, high-volume Gemini 3 tier via OpenRouter. Cost-effective and capable, good for the tools/choices stages.",
    bannerUrl: undefined,
  },

  // Google AI Studio (BYOK) - Direct access via Google's OpenAI-compatible API
  "Google Gemini 2.5 Flash": {
    name: "Google Gemini 2.5 Flash (BYOK)",
    original_model: "models/gemini-flash-latest",
    model: "models/gemini-flash-latest",
    maxTokens: 1000000,
    maxOutputTokens: 65000,
    provider: "google",
    supportsToolCalling: true,
    inputPrice: 0.15,
    outputPrice: 0.6,
    finetunes: [],
    strengths: ["creativity", "long context", "tool calling"],
    weaknesses: [],
    description:
      "Google's Gemini 2.5 Flash via AI Studio. Requires your own Google API key (BYOK). Free tier available with rate limits.",
    bannerUrl: undefined,
  },

  "Google Gemini 2.5 Flash Lite": {
    name: "Google Gemini 2.5 Flash Lite (BYOK)",
    original_model: "models/gemini-flash-lite-latest",
    model: "models/gemini-flash-lite-latest",
    maxTokens: 1000000,
    maxOutputTokens: 65000,
    provider: "google",
    supportsToolCalling: true,
    inputPrice: 0.075,
    outputPrice: 0.3,
    finetunes: [],
    strengths: ["cost-effective", "long context"],
    weaknesses: ["preview model"],
    description:
      "Google's lightweight Gemini model via AI Studio. Requires your own Google API key (BYOK). Very cost-effective.",
    bannerUrl: undefined,
  },

  "Google Gemini 2.5 Pro": {
    name: "Google Gemini 2.5 Pro (BYOK)",
    original_model: "models/gemini-2.5-pro",
    model: "models/gemini-2.5-pro",
    maxTokens: 1000000,
    maxOutputTokens: 65000,
    provider: "google",
    supportsToolCalling: true,
    inputPrice: 1.25,
    outputPrice: 10.0,
    finetunes: [],
    strengths: ["creativity", "reasoning", "long context", "quality"],
    weaknesses: ["price"],
    description:
      "Google's most capable Gemini 2.5 model via AI Studio. Requires your own Google API key (BYOK). Best for complex tasks.",
    bannerUrl: undefined,
  },

  "Google Gemini 3 Pro": {
    name: "Google Gemini 3 Pro (BYOK)",
    original_model: "models/gemini-3-pro-preview",
    model: "models/gemini-3-pro-preview",
    maxTokens: 1000000,
    maxOutputTokens: 65000,
    provider: "google",
    supportsToolCalling: true,
    inputPrice: 1.25,
    outputPrice: 10.0,
    finetunes: [],
    strengths: ["creativity", "reasoning", "long context", "quality", "latest"],
    weaknesses: ["price", "preview"],
    description:
      "Google's latest Gemini 3 Pro preview via AI Studio. Requires your own Google API key (BYOK). Cutting-edge capabilities.",
    bannerUrl: undefined,
  },
  "Google Gemini 3 Flash": {
    name: "Google Gemini 3 Flash (BYOK)",
    original_model: "models/gemini-3-flash-preview",
    model: "models/gemini-3-flash-preview",
    maxTokens: 1000000,
    maxOutputTokens: 65000,
    provider: "google",
    supportsToolCalling: true,
    inputPrice: 0.5,
    outputPrice: 3,
    finetunes: [],
    strengths: ["creativity", "long context", "latest"],
    weaknesses: ["preview"],
    description:
      "Google's latest Gemini 3 Flash preview via AI Studio. Requires your own Google API key (BYOK). Great for creative tasks.",
    bannerUrl: undefined,
  },
  "GLM 5.2": {
    name: "GLM 5.2",
    original_model: "GLM 5.2",
    model: "z-ai/glm-5.2",
    maxTokens: 1048576,
    maxOutputTokens: 128000,
    inputPrice: 0.65,
    outputPrice: 2.1,
    provider: "openrouter",
    supportsToolCalling: true,
    finetunes: [],
    strengths: ["long context", "powerful", "nsfw", "agentic"],
    weaknesses: ["price"],
    description:
      "Z.ai's current flagship - #1 open-weight model on the Artificial Analysis intelligence index, strong on long-horizon agentic work and complex storytelling. Replaces GLM 4.6.",
    bannerUrl: undefined,
  },

  "Kimi K3": {
    name: "Kimi K3",
    original_model: "Kimi K3",
    model: "moonshotai/kimi-k3",
    maxTokens: 1048576,
    maxOutputTokens: 128000,
    inputPrice: 3,
    outputPrice: 15,
    provider: "openrouter",
    supportsToolCalling: true,
    finetunes: [],
    strengths: ["powerful", "reasoning", "long context", "latest"],
    weaknesses: ["price"],
    description:
      "Moonshot AI's 2.8T-parameter open-weight flagship, 1M context. Premium quality for rare, campaign-shaping calls (boss fights, major plot beats).",
    bannerUrl: undefined,
  },

  "Kimi K2.6": {
    name: "Kimi K2.6",
    original_model: "Kimi K2.6",
    model: "moonshotai/kimi-k2.6",
    maxTokens: 262144,
    maxOutputTokens: 262144,
    inputPrice: 0.6,
    outputPrice: 3.41,
    provider: "openrouter",
    supportsToolCalling: true,
    finetunes: [],
    strengths: ["creativity", "long context", "tool calling", "coding"],
    weaknesses: [],
    description:
      "Moonshot AI's multimodal mid-tier model - strong long-context coding and creative writing with solid tool calling, at a fraction of Kimi K3's price.",
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
    inputPrice: 0.06,
    outputPrice: 0.14,
    finetunes: [],
    strengths: ["powerful", "cost-effective"],
    weaknesses: ["logic"],
    description:
      "A small-sized model from Mistral, offering a balance between performance and cost, suitable for story generation..",
    bannerUrl: undefined,
  },
  // ============================================
  // MISTRAL MODELS (BYOK - user's own Mistral key)
  // ============================================

  "Mistral Small 3.2": {
    name: "Mistral Small 3.2",
    original_model: "mistral-small-2506",
    model: "mistral-small-2506",
    maxTokens: 128000,
    maxOutputTokens: 8000,
    provider: "mistral",
    supportsToolCalling: true,
    inputPrice: 0.1,
    outputPrice: 0.3,
    finetunes: [],
    strengths: ["fast", "cost-effective", "tool calling"],
    weaknesses: ["creativity"],
    description:
      "Mistral's efficient small model. Great for fast responses and tool calling.",
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
    inputPrice: 0.4,
    outputPrice: 2.0,
    finetunes: [],
    strengths: ["creativity", "storytelling", "multimodal"],
    weaknesses: ["price"],
    description:
      "Mistral's frontier-class model with excellent creative writing capabilities.",
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
    inputPrice: 0.15,
    outputPrice: 0.15,
    finetunes: [],
    strengths: ["extremely cost-effective", "multilingual"],
    weaknesses: ["creativity", "complex reasoning"],
    description:
      "Mistral's budget-friendly open source model. Great for basic tasks at minimal cost.",
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
    inputPrice: 0.04,
    outputPrice: 0.04,
    finetunes: [],
    strengths: ["ultra cost-effective", "fast", "edge model"],
    weaknesses: ["creativity", "complex reasoning"],
    description:
      "Mistral's tiny edge model. Ultra-cheap for simple tasks like choices generation.",
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
    inputPrice: 0.15,
    outputPrice: 0.15,
    finetunes: [],
    strengths: ["ultra cost-effective", "fast", "edge model"],
    weaknesses: ["creativity", "complex reasoning"],
    description:
      "Mistral's tiny edge model. Ultra-cheap for simple tasks like choices generation.",
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
    inputPrice: 2,
    outputPrice: 5,
    finetunes: [],
    strengths: ["creative", "powerful", "tool calling"],
    weaknesses: ["price"],
    description:
      "Mistral's powerful medium model with enhanced creativity and tool calling.",
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
    inputPrice: 0.5,
    outputPrice: 1.5,
    finetunes: [],
    strengths: ["creative", "powerful", "tool calling"],
    weaknesses: ["price"],
    description:
      "Mistral's powerful medium model with enhanced creativity and tool calling.",
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
    inputPrice: 0.3,
    outputPrice: 0.9,
    finetunes: [],
    strengths: ["tool calling", "structured output", "logic"],
    weaknesses: ["creativity"],
    description:
      "Mistral's code-optimized model, excellent for tool calling and structured tasks.",
    bannerUrl: undefined,
  },
  "Devstral Small 2": {
    name: "Devstral Small 2",
    original_model: "labs-devstral-small-2512",
    model: "labs-devstral-small-2512",
    maxTokens: 256000,
    maxOutputTokens: 100000,
    provider: "mistral",
    supportsToolCalling: true,
    inputPrice: 0.1,
    outputPrice: 0.3,
    finetunes: [],
    strengths: ["tool calling", "code", "agents", "fast"],
    weaknesses: ["creativity"],
    description:
      "Mistral's open source model excelling at tool use and agent tasks. Great for structured operations.",
    bannerUrl: undefined,
  },
  "Devstral 2": {
    name: "Devstral 2",
    original_model: "devstral-2512",
    model: "devstral-2512",
    maxTokens: 256000,
    maxOutputTokens: 100000,
    provider: "mistral",
    supportsToolCalling: true,
    inputPrice: 0.4,
    outputPrice: 2.0,
    finetunes: [],
    strengths: ["tool calling", "code", "agents", "performance"],
    weaknesses: ["price"],
    description:
      "Mistral's enterprise-grade agent model. Excellent tool use and code capabilities.",
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
    inputPrice: 0.5,
    outputPrice: 1.5,
    finetunes: [],
    strengths: ["creativity", "storytelling", "reasoning", "large context"],
    weaknesses: ["price"],
    description:
      "Mistral's flagship large model with 256k context. Excellent for creative writing and complex narratives.",
    bannerUrl: undefined,
  },
  "Ministral 14B": {
    name: "Ministral 14B",
    original_model: "ministral-14b-2512",
    model: "ministral-14b-2512",
    maxTokens: 256000,
    maxOutputTokens: 100000,
    provider: "mistral",
    supportsToolCalling: true,
    inputPrice: 0.2,
    outputPrice: 0.2,
    finetunes: [],
    strengths: ["cost-effective", "fast", "large context"],
    weaknesses: ["complex reasoning"],
    description:
      "Mistral's budget-friendly 14B model with 256k context. Great value for story generation.",
    bannerUrl: undefined,
  },

  // ============================================
  // DEEPINFRA MODELS (BYOK - user's own DeepInfra key)
  // ============================================

  "DeepInfra DeepSeek V3.2": {
    name: "DeepInfra DeepSeek V3.2",
    original_model: "deepseek-ai/DeepSeek-V3.2",
    model: "deepseek-ai/DeepSeek-V3.2",
    maxTokens: 160000,
    maxOutputTokens: 16000,
    provider: "deepinfra",
    supportsToolCalling: true,
    inputPrice: 0.27,
    outputPrice: 0.41,
    finetunes: [],
    strengths: ["cost-effective", "creative", "long context"],
    weaknesses: [],
    description:
      "DeepSeek V3.2 via DeepInfra. Very cost-effective with excellent performance.",
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
    inputPrice: 0.21,
    outputPrice: 0.79,
    finetunes: [],
    strengths: ["cost-effective", "creative", "long context"],
    weaknesses: [],
    description:
      "DeepSeek V3.1 via DeepInfra. Solid performance at low cost.",
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
    inputPrice: 0.09,
    outputPrice: 0.57,
    finetunes: [],
    strengths: ["powerful", "cost-effective", "long context"],
    weaknesses: [],
    description:
      "Qwen3 235B via DeepInfra. Powerful model at excellent price.",
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
    inputPrice: 0.1,
    outputPrice: 0.28,
    finetunes: [],
    strengths: ["fast", "cost-effective"],
    weaknesses: ["context size"],
    description: "Qwen3 32B via DeepInfra. Fast and affordable.",
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
    inputPrice: 0.13,
    outputPrice: 0.38,
    finetunes: [],
    strengths: ["fast", "reliable", "cost-effective"],
    weaknesses: [],
    description:
      "Meta's Llama 3.3 70B Turbo via DeepInfra. Fast and reliable.",
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
    inputPrice: 0.02,
    outputPrice: 0.03,
    finetunes: [],
    strengths: ["ultra fast", "extremely cost-effective"],
    weaknesses: ["smaller model"],
    description:
      "Llama 3.1 8B Turbo via DeepInfra. Ultra-cheap for simple tasks.",
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
    inputPrice: 0.09,
    outputPrice: 0.16,
    finetunes: [],
    strengths: ["balanced", "cost-effective"],
    weaknesses: [],
    description:
      "Google's Gemma 3 27B via DeepInfra. Good balance of quality and cost.",
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
    inputPrice: 0.075,
    outputPrice: 0.2,
    finetunes: [],
    strengths: ["fast", "cost-effective", "tool calling"],
    weaknesses: [],
    description:
      "Mistral Small 3.2 via DeepInfra. Great for tool calling at low cost.",
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
    inputPrice: 0.43,
    outputPrice: 1.75,
    finetunes: [],
    strengths: ["creative", "long context", "nsfw"],
    weaknesses: [],
    description:
      "GLM 4.6 via DeepInfra. Excellent for creative writing.",
    bannerUrl: undefined,
  },
  "DeepInfra Kimi-K2-Thinking": {
    name: "DeepInfra Kimi-K2-Thinking",
    original_model: "moonshotai/Kimi-K2-Thinking",
    model: "moonshotai/Kimi-K2-Thinking",
    maxTokens: 262000,
    maxOutputTokens: 16000,
    provider: "deepinfra",
    supportsToolCalling: true,
    inputPrice: 0.47,
    outputPrice: 2,
    finetunes: [],
    strengths: ["powerful", "long context", "creative"],
    weaknesses: [],
    description:
      "Kimi-K2-Thinking via DeepInfra. Powerful model with 262k context.",
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
    inputPrice: 0.14,
    outputPrice: 1.1,
    finetunes: [],
    strengths: ["powerful", "long context", "MoE", "256k context"],
    weaknesses: [],
    description:
      "Qwen3 Next 80B A3B MoE model via DeepInfra. Powerful with 256k context.",
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
    inputPrice: 0.07,
    outputPrice: 0.14,
    finetunes: [],
    strengths: ["fast", "cost-effective", "small"],
    weaknesses: ["context size"],
    description:
      "Microsoft Phi 4 via DeepInfra. Very cheap for simple tasks like choice generation.",
    bannerUrl: undefined,
  },

  "DeepInfra MiniMax M2": {
    name: "DeepInfra MiniMax M2",
    original_model: "MiniMaxAI/MiniMax-M2",
    model: "MiniMaxAI/MiniMax-M2",
    maxTokens: 262144,
    maxOutputTokens: 131072,
    provider: "deepinfra",
    supportsToolCalling: true,
    inputPrice: 0.255,
    outputPrice: 1.02,
    finetunes: [],
    strengths: [
      "cost-effective",
      "tool calling",
      "large context",
      "agentic workflows",
    ],
    weaknesses: [],
    description:
      "MiniMax M2 via DeepInfra. Mini model built for coding & agentic workflows with 262k context.",
    bannerUrl: undefined,
  },

  "DeepInfra GPT-OSS 120B": {
    name: "DeepInfra GPT-OSS 120B",
    original_model: "openai/gpt-oss-120b",
    model: "openai/gpt-oss-120b",
    maxTokens: 128000,
    maxOutputTokens: 16000,
    provider: "deepinfra",
    supportsToolCalling: true,
    inputPrice: 0.039,
    outputPrice: 0.19,
    finetunes: [],
    strengths: ["ultra cheap", "fast", "long context", "tool calling"],
    weaknesses: [],
    description:
      "GPT-OSS 120B via DeepInfra. Extremely cost-effective with great capabilities.",
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
    inputPrice: 0.08,
    outputPrice: 0.29,
    finetunes: [],
    strengths: ["fast", "cost-effective", "MoE"],
    weaknesses: ["context size"],
    description:
      "Qwen3 30B A3B MoE model via DeepInfra. Fast and very affordable.",
    bannerUrl: undefined,
  },
} as const;
// OpenRouter image models (BYOK - user's own OpenRouter key). pricePerImage is
// a per-image dollar estimate for the model pickers: exact for the flat-rate
// Flux models, derived from typical output-token usage for the rest.
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
    pricePerImage: 0.144, // ~1600 output tokens at the effective rate
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
    pricePerImage: 0.039, // ~1300 output tokens at the effective rate
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
    pricePerImage: 0.03,
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
    pricePerImage: 0.015,
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
    pricePerImage: 0.06, // ~1500 output tokens at the effective rate
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
    pricePerImage: 0.015, // ~1500 output tokens at the effective rate
  },
};

// Helper type for image models
export type ImageModelKey = keyof typeof OPENROUTER_IMAGE_MODELS;

// DeepInfra Image Models (BYOK - user's own DeepInfra key)
export const DEEPINFRA_IMAGE_MODELS = {
  "Bria 3.2": {
    name: "Bria 3.2",
    model: "Bria/Bria-3.2",
    description: "Fast, commercial-ready with great text rendering. FREE!",
    provider: "deepinfra",
    pricePerImage: 0.0, // FREE
  },
  "P-Image": {
    name: "P-Image",
    model: "PrunaAI/p-image",
    description: "State-of-the-art, <1 second, exceptional text rendering.",
    provider: "deepinfra",
    pricePerImage: 0.005,
  },
  "FLUX 2 Pro": {
    name: "FLUX 2 Pro",
    model: "black-forest-labs/FLUX-2-pro",
    description: "Premium photorealistic with precise control.",
    provider: "deepinfra",
    pricePerImage: 0.015,
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


// ============================================
// MODEL FILTERING HELPERS
// ============================================

/**
 * Which provider keys the user has saved. Every provider is BYOK - there is no
 * server-side key and no coin balance behind any of them, so a model is
 * available exactly when its provider's key is present.
 */
export interface APIKeysAvailable {
  openRouterKey?: boolean;
  deepseekKey?: boolean;
  googleKey?: boolean;
  mistralKey?: boolean;
  deepinfraKey?: boolean;
}

/** Maps a model's provider onto the key field that unlocks it. */
const PROVIDER_KEY_FIELD: Record<
  AIModelConfig["provider"],
  keyof APIKeysAvailable
> = {
  openrouter: "openRouterKey",
  deepseek: "deepseekKey",
  google: "googleKey",
  mistral: "mistralKey",
  deepinfra: "deepinfraKey",
};

export interface AvailableModelOptions {
  /** Drop models that can't call tools - GM and Designer turns need them. */
  requireToolCalling?: boolean;
}

/**
 * Filter AI models down to the ones the user can actually call: their
 * provider's key is saved, and (optionally) they support tool calling.
 *
 * @param keys - Object indicating which keys the user has
 * @returns Array of [modelKey, config] entries for available models
 */
export function getAvailableModels(
  keys: APIKeysAvailable,
  options: AvailableModelOptions = {},
): [string, AIModelConfig][] {
  const entries = Object.entries(AI_MODELS) as [string, AIModelConfig][];

  return entries.filter(([, config]) => {
    if (options.requireToolCalling && !config.supportsToolCalling) return false;
    const field = PROVIDER_KEY_FIELD[config.provider];
    return field ? !!keys[field] : false;
  });
}

/**
 * Get available model keys as an array
 */
export function getAvailableModelKeys(
  keys: APIKeysAvailable,
  options: AvailableModelOptions = {},
): string[] {
  return getAvailableModels(keys, options).map(([key]) => key);
}

/**
 * Check if user has any API key configured for AI generation
 */
export function hasAnyAIKey(keys: APIKeysAvailable): boolean {
  return !!(
    keys.openRouterKey ||
    keys.deepseekKey ||
    keys.googleKey ||
    keys.mistralKey ||
    keys.deepinfraKey
  );
}

/**
 * Get the required provider key name for a model
 */
export function getRequiredKeyForModel(
  modelKey: string,
): keyof APIKeysAvailable | null {
  const config = AI_MODELS[modelKey as AIModelKey] as AIModelConfig | undefined;
  if (!config) return null;
  return PROVIDER_KEY_FIELD[config.provider] ?? null;
}

/**
 * Check if a specific model is available based on user's API keys
 */
export function isModelAvailable(
  modelKey: string,
  keys: APIKeysAvailable,
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
  provider:
    | "openrouter"
    | "deepseek"
    | "mistral"
    | "deepinfra"
    | "google";
  supportsToolCalling?: boolean; // Whether this model supports function calling
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

// TTS pricing - all BYOK (user supplies their own provider key in Settings)
export const TTS_MODELS = {
  cartesia: {
    name: "Cartesia Sonic-3",
    provider: "Cartesia",
    pricePerMillionChars: 30.0, // approximate - actual cost depends on your Cartesia plan tier
    description: "Very low-latency, natural-sounding TTS built for real-time narration",
  },
  elevenlabs: {
    name: "ElevenLabs Flash v2.5",
    provider: "ElevenLabs",
    pricePerMillionChars: 50.0, // approximate - actual cost depends on your ElevenLabs plan tier
    description: "Best-in-class expressiveness and emotional range, still low-latency",
  },
} as const;

export type TTSModelKey = keyof typeof TTS_MODELS;



export function getModelConfig(modelKey: string): AIModelConfig {
  // Check if the key exists in AI_MODELS
  if (modelKey in AI_MODELS) {
    return AI_MODELS[modelKey as AIModelKey] as unknown as AIModelConfig;
  }

  // Check if this looks like a UUID (custom model)
  // UUIDs are 36 chars with format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
  const isUUID =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      modelKey,
    );

  if (isUUID) {
    // Custom models are always OpenRouter BYOK - return a generic OpenRouter config
    // The actual model config will be resolved from user settings on the API side
    // This is expected behavior - no warning needed since API handles it properly
    return {
      name: "Custom Model",
      original_model: modelKey,
      model: modelKey,
      maxTokens: 128000,
      maxOutputTokens: 8000,
      provider: "openrouter", // Custom models are always OpenRouter
      supportsToolCalling: true,
      inputPrice: 0,
      outputPrice: 0,
      finetunes: [],
      strengths: [],
      weaknesses: [],
      description: "Custom user-defined model",
      bannerUrl: undefined,
    };
  }

  // Fallback to DeepSeek V4 Flash if key not found
  console.warn(
    `Model key "${modelKey}" not found, falling back to DeepSeek V4 Flash`,
  );
  return AI_MODELS["DeepSeek V4 Flash"] as unknown as AIModelConfig;
}

