import {
  getCachedClaudeCliStatus,
  isClaudeCliAvailablePlatform,
  isClaudeCliUsable,
} from "@/app/misc/claudeCliModels";

export const AI_MODELS = {
  "Grok 4.5": {
    name: "Grok 4.5",
    original_model: "Grok 4.5",
    model: "x-ai/grok-4.5",
    maxTokens: 500000,
    maxOutputTokens: 100000,
    provider: "openrouter",
    reasoningMandatory: true,
    supportsToolCalling: true,
    strengths: ["logic", "reasoning", "tool calling", "coding"],
    weaknesses: ["price"],
    description:
      "xAI's frontier model for coding, knowledge work, and STEM. Strong at rules adjudication and tool-heavy turns. Defaults to high reasoning effort; billing doubles above 200k-token prompts.",
    bannerUrl: undefined,
    inputPrice: 2,
    outputPrice: 6,
    cachedInputPrice: 0.3, // xAI docs, 2026-10-21
    finetunes: [],
  },

  // xAI's docs and OpenRouter agree: $2 / $6 per M, doubling for a prompt of
  // 200k tokens or more, 500k context. Cached input is $0.50 (Grok 4.5: $0.30).
  "Grok 4.7": {
    name: "Grok 4.7",
    original_model: "Grok 4.7",
    model: "x-ai/grok-4.7",
    maxTokens: 500000,
    maxOutputTokens: 128000,
    provider: "openrouter",
    reasoningMandatory: true,
    supportsToolCalling: true,
    strengths: ["logic", "reasoning", "tool calling"],
    weaknesses: ["price above 200k tokens"],
    description:
      "xAI's newer Grok, at the same price as Grok 4.5 (Artificial Analysis intelligence index 46). 500k context; a prompt of 200k tokens or more bills at double.",
    bannerUrl: undefined,
    inputPrice: 2,
    outputPrice: 6,
    cachedInputPrice: 0.5, // xAI docs, 2026-10-21
    finetunes: [],
  },

  // The DeepSeek entries use DeepSeek's own docs (api-docs.deepseek.com,
  // Models & Pricing, 2026-10-21), not OpenRouter's headline price, which is a
  // single cheap endpoint's. DeepSeek bills peak (01:00-04:00 and 06:00-10:00
  // UTC, Monday to Friday) at double the off-peak rate; the figures here are
  // the off-peak ones. Cached input per M: Flash $0.003, Pro $0.022 off-peak.
  //
  // "DeepSeek V4 Flash" stays as a key because saved settings and
  // getModelConfig's unknown-key fallback name it. DeepSeek retired V4 Flash
  // on 2026-09-10: the old API name `deepseek-v4-flash` is still accepted but
  // is "temporarily routed" to V4.1 Flash at the Flash price, so this entry
  // calls the documented current name instead of the alias that may go.
  "DeepSeek V4 Flash": {
    name: "DeepSeek V4 Flash (now V4.1)",
    original_model: "DeepSeek V4 Flash",
    model: "deepseek-flash",
    maxTokens: 1000000,
    maxOutputTokens: 65000,
    provider: "deepseek",
    supportsToolCalling: true,
    inputPrice: 0.15,
    outputPrice: 0.6,
    finetunes: [],
    strengths: ["creativity", "nsfw"],
    weaknesses: ["old name"],
    description:
      "The old name for DeepSeek's Flash model, kept so saved settings and the app's fallback keep working. DeepSeek retired V4 Flash on 2026-09-10; this entry now calls V4.1 Flash at V4.1 Flash's price. Pick DeepSeek V4.1 Flash instead.",
    bannerUrl: undefined,
  },
  "DeepSeek V4.1 Flash": {
    name: "DeepSeek V4.1 Flash",
    original_model: "DeepSeek V4.1 Flash",
    model: "deepseek-flash",
    maxTokens: 1000000,
    maxOutputTokens: 128000,
    provider: "deepseek",
    supportsToolCalling: true,
    inputPrice: 0.15,
    outputPrice: 0.6,
    finetunes: [],
    strengths: ["cost-effective", "fast", "tool calling", "long context", "latest"],
    weaknesses: ["peak-hour price doubles"],
    description:
      "DeepSeek's current Flash model (V4.1-Flash-1017) on your own DeepSeek key. 1M context, thinking on by default, about 206 tokens/s and one of the cheapest options for the light tiers and side agents. Weekday peak hours (01:00-04:00 and 06:00-10:00 UTC) bill at double the price shown.",
    bannerUrl: undefined,
  },
  // DeepSeek's 2026-09-10 release post says every deepseek-v4-pro request
  // routes to V4.1 Flash at Flash rates from 2026-09-14; its changelog says V4
  // Pro API service continues past that date at unchanged billing, and its
  // Models & Pricing page lists deepseek-v4-pro (DeepSeek-V4-Pro-0813) at its
  // own price. The catalog follows the pricing page. Not confirmed with a
  // live call (no DeepSeek key here).
  "DeepSeek V4 Pro": {
    name: "DeepSeek V4 Pro",
    original_model: "DeepSeek V4 Pro",
    model: "deepseek-v4-pro",
    maxTokens: 1000000,
    maxOutputTokens: 65000,
    provider: "deepseek",
    supportsToolCalling: true,
    inputPrice: 0.66,
    outputPrice: 1.98,
    finetunes: [],
    strengths: ["creativity", "smarts", "nsfw"],
    weaknesses: ["price", "may be retired"],
    description:
      "DeepSeek's larger model (V4-Pro-0813). DeepSeek's release post says this name will be routed to V4.1 Flash, but its changelog and pricing page keep it as a separate model at the price shown, and its own announcement says V4.1 Flash beats it. If a call ever bills at Flash prices, DeepSeek has made the switch.",
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

  // Google AI Studio (BYOK) - Direct access via Google's OpenAI-compatible API.
  // Checked against ai.google.dev/gemini-api/docs/models, /deprecations and
  // /pricing on 2026-10-21. The 2.5 models are not deprecated, but Google now
  // limits access to them to keys that have used them before. The direct
  // Google route sends a filtered tool list (providerCall.ts
  // GOOGLE_ESSENTIAL_TOOLS, status report 6.14), which still lacks
  // start_game and the Designer's tools; the OpenRouter Gemini entry above
  // does not have that limit.

  // `gemini-flash-latest` is Google's alias for its newest Flash model, which
  // Google re-points with two weeks' notice. It was Gemini 2.5 Flash when this
  // entry was written; the price below is from then (Google now charges
  // $0.30 / $2.50 for the pinned 2.5 Flash and $0.75 / $3.75 for 3.8 Flash)
  // and what the alias bills today could not be checked without a Google key.
  "Google Gemini 2.5 Flash": {
    name: "Google Gemini Flash, latest alias (BYOK)",
    original_model: "models/gemini-flash-latest",
    model: "models/gemini-flash-latest",
    maxTokens: 1000000,
    maxOutputTokens: 65000,
    provider: "google",
    supportsToolCalling: true,
    inputPrice: 0.15,
    outputPrice: 0.6,
    finetunes: [],
    strengths: ["long context", "tool calling"],
    weaknesses: ["alias moves", "price may be out of date"],
    description:
      "Google's gemini-flash-latest alias on your own Google key: whichever Flash model Google currently points it at, so the model and its price can change without notice. The price shown dates from when it pointed at Gemini 2.5 Flash; pick Google Gemini 3.8 Flash for a pinned model with a current price.",
    bannerUrl: undefined,
  },

  // Same alias story for the Flash Lite line.
  "Google Gemini 2.5 Flash Lite": {
    name: "Google Gemini Flash Lite, latest alias (BYOK)",
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
    weaknesses: ["alias moves", "price may be out of date"],
    description:
      "Google's gemini-flash-lite-latest alias on your own Google key: whichever Flash Lite model Google currently points it at, so the model and its price can change without notice. The price shown dates from an earlier model (Google now charges $0.10 / $0.40 for the pinned Gemini 2.5 Flash Lite).",
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
    weaknesses: ["price", "legacy"],
    description:
      "Google's Gemini 2.5 Pro on your own Google key. Not deprecated, but Google now limits the 2.5 models to keys that have used them before, so a new key may be refused. Prompts above 200k tokens cost $2.50 / $15.",
    bannerUrl: undefined,
  },

  // gemini-3-pro-preview was shut down on 2026-03-09 (Google's models page
  // lists it as "Shut down"; its replacement is gemini-3.1-pro-preview). The
  // "Google Gemini 3 Pro" entry is gone: a saved choice of that key falls
  // back to its slot's default (isKnownModelKey).

  // Google calls Gemini 3 Flash Preview "our legacy Flash model" and
  // recommends gemini-3.6-flash; it has no shutdown date.
  "Google Gemini 3 Flash": {
    name: "Google Gemini 3 Flash Preview (BYOK)",
    original_model: "models/gemini-3-flash-preview",
    model: "models/gemini-3-flash-preview",
    maxTokens: 1000000,
    maxOutputTokens: 65000,
    provider: "google",
    supportsToolCalling: true,
    inputPrice: 0.5,
    outputPrice: 3,
    finetunes: [],
    strengths: ["creativity", "long context"],
    weaknesses: ["legacy", "preview"],
    description:
      "Google's Gemini 3 Flash preview on your own Google key. Google now calls it a legacy model and recommends Gemini 3.6 or 3.8 Flash; it has no shutdown date.",
    bannerUrl: undefined,
  },

  // Gemini 4 Argon, Google's flagship ("New Stable" on its models page,
  // 2026-10-21). Google's pricing page: $2 in / $10 out (cached $0.10) through
  // 2026-11-30, then $4 / $20 (cached $0.20) from 2026-12-01; not on the free
  // tier. OpenRouter lists the same $2 / $10 and the same tool support.
  "Google Gemini 4 Argon": {
    name: "Google Gemini 4 Argon (BYOK)",
    original_model: "models/gemini-4-argon",
    model: "models/gemini-4-argon",
    maxTokens: 1000000,
    maxOutputTokens: 128000,
    provider: "google",
    supportsToolCalling: true,
    inputPrice: 2,
    outputPrice: 10,
    finetunes: [],
    strengths: ["reasoning", "long context", "tool calling", "latest"],
    weaknesses: ["price doubles on 2026-12-01", "no free tier", "no tool-use benchmark yet"],
    description:
      "Google's flagship reasoning model on your own Google key, 1M context. $2 / $10 per M until 2026-11-30, then $4 / $20 from 2026-12-01. No free tier. The direct Google route currently drops some GM tools (status report 6.14).",
    bannerUrl: undefined,
  },

  // Gemini 3.8 Flash ("New Stable"). Google's pricing page: $0.75 / $3.75
  // (cached $0.075) through 2026-12-31, then $1.50 / $7.50 from 2027-01-01,
  // with a free tier. Max output 65,536 per OpenRouter's listing.
  "Google Gemini 3.8 Flash": {
    name: "Google Gemini 3.8 Flash (BYOK)",
    original_model: "models/gemini-3.8-flash",
    model: "models/gemini-3.8-flash",
    maxTokens: 1000000,
    maxOutputTokens: 65536,
    provider: "google",
    supportsToolCalling: true,
    inputPrice: 0.75,
    outputPrice: 3.75,
    finetunes: [],
    strengths: ["cost-effective", "fast", "long context", "tool calling", "latest"],
    weaknesses: ["price doubles on 2027-01-01"],
    description:
      "Google's current Flash model on your own Google key (Artificial Analysis intelligence 41, about 137 tokens/s). $0.75 / $3.75 per M until 2026-12-31, then $1.50 / $7.50 from 2027-01-01; free tier with rate limits. The direct Google route currently drops some GM tools (status report 6.14).",
    bannerUrl: undefined,
  },
  // OpenRouter prices GLM per provider endpoint, from $0.03 to $2.31 per M
  // input on 2026-10-21, and its model listing shows whichever endpoint sorts
  // first ($0.034 in / $7.00 out for GLM 5.2). The GLM entries use the model
  // maker's own price on OpenRouter (Z.ai's endpoint), the most common one
  // and close to the median; what a call actually costs depends on routing.
  "GLM 5.2": {
    name: "GLM 5.2",
    original_model: "GLM 5.2",
    model: "z-ai/glm-5.2",
    maxTokens: 1048576,
    maxOutputTokens: 128000,
    inputPrice: 1.4,
    outputPrice: 4.4,
    provider: "openrouter",
    supportsToolCalling: true,
    finetunes: [],
    strengths: ["long context", "powerful", "nsfw", "agentic"],
    weaknesses: ["price"],
    description:
      "Z.ai's previous flagship - strong on long-horizon agentic work and complex storytelling. Superseded by GLM 5.3.",
    bannerUrl: undefined,
  },

  "GLM 5.3": {
    name: "GLM 5.3",
    original_model: "GLM 5.3",
    model: "z-ai/glm-5.3",
    maxTokens: 1048576,
    maxOutputTokens: 128000,
    inputPrice: 1.4,
    outputPrice: 4.4,
    provider: "openrouter",
    supportsToolCalling: true,
    finetunes: [],
    strengths: ["long context", "powerful", "agentic", "latest"],
    weaknesses: ["always thinks"],
    description:
      "Z.ai's current flagship, through your OpenRouter key. Strong long-horizon tool use and storytelling; thinking cannot be turned off. For a device without a Z.ai key.",
    bannerUrl: undefined,
  },

  "GLM 5.3 Flash": {
    name: "GLM 5.3 Flash",
    original_model: "GLM 5.3 Flash",
    model: "z-ai/glm-5.3-flash",
    maxTokens: 1048576,
    maxOutputTokens: 128000,
    inputPrice: 0.15,
    outputPrice: 0.5,
    provider: "openrouter",
    supportsToolCalling: true,
    finetunes: [],
    strengths: ["cost-effective", "long context", "tool calling", "latest"],
    weaknesses: ["always thinks"],
    description:
      "Z.ai's fast, cheap GLM 5.3, through your OpenRouter key. Good for the light GM tiers.",
    bannerUrl: undefined,
  },

  // ============================================
  // Z.AI MODELS (BYOK - the player's own Z.ai key, decision 18)
  // ============================================
  // Z.ai's general pay-as-you-go API only (providerCall.ts
  // ZAI_CHAT_COMPLETIONS_URL), never the GLM Coding Plan. Prices from
  // docs.z.ai's pricing page, 2026-10-21; cached input is $0.26 / $0.03.

  "GLM 5.3 (Z.ai)": {
    name: "GLM 5.3 (Z.ai)",
    original_model: "glm-5.3",
    model: "glm-5.3",
    maxTokens: 1048576,
    maxOutputTokens: 128000,
    inputPrice: 1.4,
    outputPrice: 4.4,
    cachedInputPrice: 0.26, // docs.z.ai, 2026-10-21
    provider: "zai",
    supportsToolCalling: true,
    finetunes: [],
    strengths: ["long context", "powerful", "agentic", "latest"],
    weaknesses: ["always thinks"],
    description:
      "Z.ai's current flagship, straight from Z.ai on your own pay-as-you-go Z.ai key (not the Coding Plan). Thinking cannot be turned off.",
    bannerUrl: undefined,
  },

  "GLM 5.3 Flash (Z.ai)": {
    name: "GLM 5.3 Flash (Z.ai)",
    original_model: "glm-5.3-flash",
    model: "glm-5.3-flash",
    maxTokens: 1048576,
    maxOutputTokens: 128000,
    inputPrice: 0.15,
    outputPrice: 0.5,
    cachedInputPrice: 0.03, // docs.z.ai, 2026-10-21
    provider: "zai",
    supportsToolCalling: true,
    finetunes: [],
    strengths: ["cost-effective", "long context", "tool calling", "latest"],
    weaknesses: ["always thinks"],
    description:
      "Z.ai's fast, cheap GLM 5.3, straight from Z.ai on your own pay-as-you-go Z.ai key (not the Coding Plan).",
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

  // "Grok Code Fast 1" (x-ai/grok-code-fast-1) was removed: OpenRouter no
  // longer lists it (2026-10-21). A saved choice of that key falls back to its
  // slot's default (isKnownModelKey).

  // The Qwen 3.8 entries use OpenRouter's ids and Alibaba Cloud's own prices
  // (Model Studio pricing page, international region: Max $2 / $6, Flash
  // $0.15 / $0.47, one tier up to 1M input). Both think by default. Forced
  // tool choice is reported to fail with thinking on, so providerCall.ts sends
  // tool_choice "auto" to them (modelRejectsForcedToolChoice) and the gate's
  // own user message does the forcing, as for Claude.
  "Qwen 3.8 Max": {
    name: "Qwen 3.8 Max",
    original_model: "Qwen 3.8 Max",
    model: "qwen/qwen3.8-max-0902",
    maxTokens: 1000000,
    maxOutputTokens: 128000,
    provider: "openrouter",
    reasoningMandatory: true,
    supportsToolCalling: true,
    inputPrice: 2,
    outputPrice: 6,
    finetunes: [],
    strengths: ["tool calling", "reasoning", "long context", "latest"],
    weaknesses: ["slow (about 40 tokens/s)", "thinks by default"],
    description:
      "Alibaba's flagship Qwen 3.8 (the 0902 release), 1M context. Ranked first on the tau-3 Banking tool-use test and 45 on Artificial Analysis's intelligence index. It thinks by default and slowly, and the app never forces a tool call on it.",
    bannerUrl: undefined,
  },

  "Qwen 3.8 Flash": {
    name: "Qwen 3.8 Flash",
    original_model: "Qwen 3.8 Flash",
    model: "qwen/qwen3.8-flash",
    maxTokens: 1000000,
    maxOutputTokens: 128000,
    provider: "openrouter",
    supportsToolCalling: true,
    inputPrice: 0.15,
    outputPrice: 0.47,
    finetunes: [],
    strengths: ["cost-effective", "long context", "tool calling", "latest"],
    weaknesses: ["no independent tool-use results yet"],
    description:
      "Alibaba's cheap Qwen 3.8, 1M context. The research found no independent tool-use or prose results for it yet; the app never forces a tool call on it, like Qwen 3.8 Max.",
    bannerUrl: undefined,
  },

  // The GPT-6 models are here because OpenRouter carries them; the app has no
  // OpenAI provider. Prices are OpenAI's (developers.openai.com pricing,
  // standard tier) and match OpenRouter's: a prompt above 272k tokens bills
  // Sol at $4 / $15 and Luna at $0.20 / $0.75. Cached input: Sol $0.10, Luna
  // $0.01. OpenRouter lists no temperature or top_p for either, so OpenRouter
  // drops the sampling settings the app sends.
  "GPT-6.1 Sol": {
    name: "GPT-6.1 Sol",
    original_model: "GPT-6.1 Sol",
    model: "openai/gpt-6.1-sol",
    maxTokens: 1050000,
    maxOutputTokens: 128000,
    provider: "openrouter",
    reasoningMandatory: true,
    supportsToolCalling: true,
    inputPrice: 2,
    outputPrice: 10,
    finetunes: [],
    strengths: ["long context", "tool calling", "reasoning"],
    weaknesses: ["price", "no benchmark results gathered"],
    description:
      "OpenAI's GPT-6.1 Sol through your OpenRouter key, 1.05M context. A prompt above 272k tokens bills at $4 / $15. The 2026-10-21 research found no creative-writing or tool-use results for this model, so treat it as untested for this job.",
    bannerUrl: undefined,
  },

  "GPT-6 Luna": {
    name: "GPT-6 Luna",
    original_model: "GPT-6 Luna",
    model: "openai/gpt-6-luna",
    maxTokens: 1050000,
    maxOutputTokens: 128000,
    provider: "openrouter",
    supportsToolCalling: true,
    inputPrice: 0.1,
    outputPrice: 0.5,
    finetunes: [],
    strengths: ["cost-effective", "long context", "tool calling"],
    weaknesses: ["no benchmark results gathered"],
    description:
      "OpenAI's small, cheap GPT-6 through your OpenRouter key, 1.05M context, at the same price as Claude Haiku 5.5. A prompt above 272k tokens bills at $0.20 / $0.75. The research found no creative-writing or tool-use results for it, so treat it as untested for this job.",
    bannerUrl: undefined,
  },

  "MiniMax M2": {
    name: "MiniMax M2",
    original_model: "MiniMax M2",
    model: "minimax/minimax-m2",
    maxTokens: 204800,
    maxOutputTokens: 131072,
    provider: "openrouter",
    reasoningMandatory: true,
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
  // CLAUDE VIA OPENROUTER (docs/claude-gm-design.md §3)
  // ============================================
  // Claude 5.5 rejects sampling parameters, assistant prefill, forced
  // tool_choice and effort "none"; providerCall.ts's isAnthropicViaOpenRouter
  // branch drops or remaps each of them. Fable 5.1 is left out (decision 15) -
  // it can still be added as a custom OpenRouter model, which gets the same
  // branch since it keys on the "anthropic/" model id.

  "Claude Haiku 5.5": {
    name: "Claude Haiku 5.5",
    original_model: "Claude Haiku 5.5",
    model: "anthropic/claude-haiku-5.5",
    maxTokens: 1000000,
    maxOutputTokens: 128000,
    inputPrice: 0.1,
    outputPrice: 0.5,
    provider: "openrouter",
    supportsToolCalling: true,
    finetunes: [],
    strengths: ["cost-effective", "tool calling", "long context", "latest"],
    weaknesses: ["prose depth"],
    description:
      "Anthropic's fastest Claude, through your OpenRouter key. Reliable tool calling at a very low price - a good fit for the light GM tiers and the side agents.",
    bannerUrl: undefined,
  },

  "Claude Sonnet 5.5": {
    name: "Claude Sonnet 5.5",
    original_model: "Claude Sonnet 5.5",
    model: "anthropic/claude-sonnet-5.5",
    maxTokens: 1000000,
    maxOutputTokens: 128000,
    inputPrice: 2,
    outputPrice: 10,
    provider: "openrouter",
    supportsToolCalling: true,
    finetunes: [],
    strengths: ["creativity", "tool calling", "reasoning", "long context", "latest"],
    weaknesses: ["price"],
    description:
      "Anthropic's everyday Claude, through your OpenRouter key. Strong prose and careful rules-following; the stable GM prompt is prompt-cached, so later rounds of a turn cost far less than the first.",
    bannerUrl: undefined,
  },

  "Claude Opus 5.5": {
    name: "Claude Opus 5.5",
    original_model: "Claude Opus 5.5",
    model: "anthropic/claude-opus-5.5",
    maxTokens: 1000000,
    maxOutputTokens: 128000,
    inputPrice: 4,
    outputPrice: 20,
    provider: "openrouter",
    supportsToolCalling: true,
    finetunes: [],
    strengths: ["powerful", "reasoning", "creativity", "long context", "latest"],
    weaknesses: ["price"],
    description:
      "Anthropic's most capable Claude in the catalog, through your OpenRouter key. For the heavy tiers - boss fights and campaign-shaping beats - where judgement matters more than cost.",
    bannerUrl: undefined,
  },
  // ============================================
  // CLAUDE ON THE PLAYER'S SUBSCRIPTION (docs/claude-gm-design.md §4)
  // ============================================
  // The desktop app runs these through the player's own signed-in `claude`
  // CLI (claudeCli.ts), not an API key, so they cost nothing per call here.
  // Offered only on the desktop with the CLI signed in (getAvailableModels,
  // ModelSelect); elsewhere a synced choice falls back to the slot's default
  // (reasoningTiers.ts, decision 16). Keys must match claudeCliModels.ts.

  "Claude Opus (subscription)": {
    name: "Claude Opus (subscription)",
    original_model: "claude-opus-5-5",
    model: "claude-opus-5-5",
    maxTokens: 1000000,
    maxOutputTokens: 128000,
    inputPrice: 0,
    outputPrice: 0,
    provider: "claude-cli",
    supportsToolCalling: true,
    finetunes: [],
    strengths: ["powerful", "reasoning", "creativity", "long context"],
    weaknesses: ["desktop only", "slower turns"],
    description:
      "Claude Opus 5.5 on your own Claude plan, through the claude CLI on this computer. No per-call cost; it draws on your plan's usage limits, and each round takes a few extra seconds to start.",
    bannerUrl: undefined,
  },

  "Claude Sonnet (subscription)": {
    name: "Claude Sonnet (subscription)",
    original_model: "claude-sonnet-5-5",
    model: "claude-sonnet-5-5",
    maxTokens: 1000000,
    maxOutputTokens: 128000,
    inputPrice: 0,
    outputPrice: 0,
    provider: "claude-cli",
    supportsToolCalling: true,
    finetunes: [],
    strengths: ["creativity", "tool calling", "reasoning", "long context"],
    weaknesses: ["desktop only", "slower turns"],
    description:
      "Claude Sonnet 5.5 on your own Claude plan, through the claude CLI on this computer. No per-call cost; it draws on your plan's usage limits, and each round takes a few extra seconds to start.",
    bannerUrl: undefined,
  },

  "Claude Haiku (subscription)": {
    name: "Claude Haiku (subscription)",
    original_model: "claude-haiku-5-5",
    model: "claude-haiku-5-5",
    maxTokens: 1000000,
    maxOutputTokens: 128000,
    inputPrice: 0,
    outputPrice: 0,
    provider: "claude-cli",
    supportsToolCalling: true,
    finetunes: [],
    strengths: ["tool calling", "long context"],
    weaknesses: ["desktop only", "slower turns"],
    description:
      "Claude Haiku 5.5 on your own Claude plan, through the claude CLI on this computer. No per-call cost; it draws on your plan's usage limits, and each round takes a few extra seconds to start.",
    bannerUrl: undefined,
  },
  // ============================================
  // MISTRAL MODELS (BYOK - user's own Mistral key)
  // ============================================
  // Checked on 2026-10-21 against Mistral's lifecycle table
  // (https://docs.mistral.ai/models, "Deprecated and retired models") and each
  // model's own page under https://docs.mistral.ai/models/. Mistral retired
  // mistral-small-2506, mistral-medium-2508, open-mistral-nemo-2407,
  // ministral-3b-2410, ministral-8b-2410, magistral-medium-2509,
  // magistral-small-2509, labs-devstral-small-2512 and devstral-2512 (the last
  // date was 2026-08-31), so the entries below replace them and
  // LEGACY_MODEL_KEY_ALIASES (further down) points each old key at its
  // successor, so a saved choice keeps working.
  //
  // Mistral's pages state no maximum output for any of these, so the output
  // cap is the one Ministral 14B already uses for the same 256k window.

  // Mistral Small 4 (v26.03, GA, Apache 2.0): API id `mistral-small-2603`,
  // alias `mistral-small-latest`; 256k context; $0.15 in / $0.60 out per M;
  // function calling on /v1/chat/completions. Mistral names it the successor
  // of Small 3.2, Magistral Small 1.2 and Mistral Saba.
  "Mistral Small 4": {
    name: "Mistral Small 4",
    original_model: "mistral-small-2603",
    model: "mistral-small-2603",
    maxTokens: 256000,
    maxOutputTokens: 100000,
    provider: "mistral",
    supportsToolCalling: true,
    inputPrice: 0.15,
    outputPrice: 0.6,
    finetunes: [],
    strengths: ["fast", "cost-effective", "tool calling", "reasoning"],
    weaknesses: ["creativity"],
    description:
      "Mistral's current small model (119B parameters, 6.5B active), one model for instruct, reasoning and coding. Fast and cheap, with function calling and a 256k window.",
    bannerUrl: undefined,
  },

  // Mistral Medium 3.5 (v26.04, GA, released 2026-04-28): API id
  // `mistral-medium-3-5` (aliases `mistral-medium-3` and
  // `mistral-medium-latest`); 256k context; $1.50 in / $7.50 out per M;
  // function calling. Mistral names it the successor of Medium 3.1, Magistral
  // Medium 1.2, Devstral 2 and Devstral Small 2. Several times the price of
  // the Medium 3.1 it replaces ($0.40 / $2).
  "Mistral Medium 3.5": {
    name: "Mistral Medium 3.5",
    original_model: "mistral-medium-3-5",
    model: "mistral-medium-3-5",
    maxTokens: 256000,
    maxOutputTokens: 100000,
    provider: "mistral",
    supportsToolCalling: true,
    inputPrice: 1.5,
    outputPrice: 7.5,
    finetunes: [],
    strengths: ["creativity", "storytelling", "tool calling", "agents", "multimodal"],
    weaknesses: ["price"],
    description:
      "Mistral's frontier-class multimodal model, tuned for agentic and coding work, with a 256k window. Mistral's successor to Medium 3.1, Magistral Medium and Devstral at $1.50 / $7.50 per M.",
    bannerUrl: undefined,
  },

  // Ministral 3 3B and 8B (v25.12, GA, Apache 2.0): API ids `ministral-3b-2512`
  // and `ministral-8b-2512` (aliases `ministral-3b-latest` and
  // `ministral-8b-latest`); 256k context; function calling. Prices per M:
  // 3B $0.10 in / $0.10 out, 8B $0.15 / $0.15. Mistral names the 3B the
  // successor of Ministral 3B and the 8B the successor of Ministral 8B, Mistral
  // Nemo, Mistral 7B and Mistral Small Creative. (OpenRouter lists the 3B at a
  // 128k window; Mistral's own page says 256k.)
  "Ministral 3 3B": {
    name: "Ministral 3 3B",
    original_model: "ministral-3b-2512",
    model: "ministral-3b-2512",
    maxTokens: 256000,
    maxOutputTokens: 100000,
    provider: "mistral",
    supportsToolCalling: true,
    inputPrice: 0.1,
    outputPrice: 0.1,
    finetunes: [],
    strengths: ["ultra cost-effective", "fast", "edge model"],
    weaknesses: ["creativity", "complex reasoning"],
    description:
      "Mistral's smallest current model (the Ministral 3 family, December 2025). Very cheap for simple tasks like choices generation.",
    bannerUrl: undefined,
  },
  "Ministral 3 8B": {
    name: "Ministral 3 8B",
    original_model: "ministral-8b-2512",
    model: "ministral-8b-2512",
    maxTokens: 256000,
    maxOutputTokens: 100000,
    provider: "mistral",
    supportsToolCalling: true,
    inputPrice: 0.15,
    outputPrice: 0.15,
    finetunes: [],
    strengths: ["extremely cost-effective", "fast", "multilingual", "edge model"],
    weaknesses: ["creativity", "complex reasoning"],
    description:
      "A small, cheap Ministral 3 model (December 2025) with a 256k window. Mistral's successor to Mistral Nemo and the older Ministral 8B; good for basic tasks at minimal cost.",
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
  // Devstral Small 2 and Devstral 2 are gone: Mistral retired
  // labs-devstral-small-2512 (2026-03-31) and devstral-2512 (2026-07-31) and
  // names Mistral Medium 3.5 as the successor of both. There is no active
  // Devstral on its models page. Their keys are aliased to "Mistral Medium 3.5"
  // (LEGACY_MODEL_KEY_ALIASES), which costs more than either did.
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
  // Mistral's own API id is `mistral-large-4` (`mistral-large-4-0` also works);
  // `mistral-large-latest` still points at Large 3. docs.mistral.ai lists it
  // as v26.10, "Public Preview", 1M context, $1.36 in / $0.14 cached / $4.18
  // out per M, with function calling. OpenRouter's price is the same.
  "Mistral Large 4": {
    name: "Mistral Large 4",
    original_model: "mistral-large-4",
    model: "mistral-large-4",
    maxTokens: 1000000,
    maxOutputTokens: 128000,
    provider: "mistral",
    supportsToolCalling: true,
    inputPrice: 1.36,
    outputPrice: 4.18,
    cachedInputPrice: 0.14, // docs.mistral.ai, 2026-10-21
    finetunes: [],
    strengths: ["long context", "tool calling", "latest"],
    weaknesses: ["public preview", "price", "little benchmark data"],
    description:
      "Mistral's open-weight flagship (1.05T parameters, 52B active), 1M context, on your own Mistral key. Mistral lists it as a public preview; Artificial Analysis scored the preview 38 on its intelligence index (2026-10-21).",
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
  // "Nano Banana Pro" is Google's Gemini 3 Pro Image. Google shut the preview id
  // `gemini-3-pro-image-preview` down on 2026-06-25 and names `gemini-3-pro-image`
  // as the replacement (https://ai.google.dev/gemini-api/docs/deprecations,
  // read 2026-10-21); OpenRouter lists `google/gemini-3-pro-image` with image
  // output. Price per Google's pricing page and OpenRouter: $2 per M in, $12 per M
  // text out, $120 per M image-output tokens, which Google gives as $0.134 per
  // 1K or 2K image (1,120 tokens; $0.24 at 4K). The request sends no size, so
  // it is priced at 1K.
  "Nano Banana Pro": {
    name: "Nano Banana Pro",
    model: "google/gemini-3-pro-image",
    description: "Optimized for image generation tasks.",
    maxTokens: 131072,
    maxOutputTokens: 32768,
    provider: "openrouter",
    inputPrice: 2, // $/1M tokens
    outputPrice: 120, // $/1M image-output tokens
    pricePerImage: 0.134, // 1,120 output tokens at $120 per M
  },
  // "Nano Banana" is Google's Gemini 2.5 Flash Image, which Google deprecated
  // (its deprecations page: shutdown 2027-03-15, replacement
  // `gemini-3.1-flash-lite-image`; its pricing page says 2026-10-02, so treat it
  // as already due). The key is kept, because it is the OpenRouter default and
  // saved choices name it, and it now calls `google/gemini-3.1-flash-lite-image`
  // (Google's "Nano Banana 2 Lite"), which OpenRouter lists with image output.
  // Price per Google's pricing page and OpenRouter: $0.25 per M in, $1.50 per M
  // text out, $30 per M image-output tokens = $0.0336 per 1K image.
  "Nano Banana": {
    name: "Nano Banana (2 Lite)",
    model: "google/gemini-3.1-flash-lite-image",
    description: "Fast, cheap image generation (Gemini 3.1 Flash Lite Image).",
    maxTokens: 65536,
    maxOutputTokens: 58982,
    provider: "openrouter",
    inputPrice: 0.25, // $/1M tokens
    outputPrice: 30, // $/1M image-output tokens
    pricePerImage: 0.034, // 1,120 output tokens at $30 per M
  },
  // "Flux 2 Pro" and "Flux 2 Flex" (black-forest-labs/flux.2-pro and
  // flux.2-flex) were removed: OpenRouter no longer lists them (2026-10-21).
  // A saved image-model choice of either falls back to the provider's default
  // (resolveImageModelKey). DeepInfra's own FLUX 2 Pro below still exists.
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
  // OpenRouter lists `openai/gpt-5.4-image-2` with image output (2026-10-21):
  // 272k context, $8 per M in, $15 per M text out, $30 per M image-output
  // tokens (OpenAI's pricing page gives GPT Image 2 the same $30 per M image
  // output). pricePerImage is an estimate in the style of the entries above,
  // ~1500 output tokens at $30 per M; OpenRouter's own example response shows a
  // cost of 0.04. Not confirmed with a live call (no key here).
  "GPT-5.4 Image 2": {
    name: "GPT-5.4 Image 2",
    model: "openai/gpt-5.4-image-2",
    description: "OpenAI's newer image generation model (GPT Image 2 based).",
    maxTokens: 272000,
    maxOutputTokens: 128000,
    provider: "openrouter",
    inputPrice: 8,
    outputPrice: 30, // $/1M image-output tokens
    pricePerImage: 0.045, // ~1500 output tokens at $30 per M
  },
};

// Helper type for image models
export type ImageModelKey = keyof typeof OPENROUTER_IMAGE_MODELS;

// DeepInfra Image Models (BYOK - user's own DeepInfra key)
export const DEEPINFRA_IMAGE_MODELS = {
  // Prices from the models' DeepInfra pages (read 2026-10-21).
  // Bria 3.2 is $0.04 per image (https://deepinfra.com/Bria/Bria-3.2); it was
  // shown as free before.
  "Bria 3.2": {
    name: "Bria 3.2",
    model: "Bria/Bria-3.2",
    description: "Fast, commercial-ready with great text rendering.",
    provider: "deepinfra",
    pricePerImage: 0.04,
  },
  "P-Image": {
    name: "P-Image",
    model: "PrunaAI/p-image",
    description: "State-of-the-art, <1 second, exceptional text rendering.",
    provider: "deepinfra",
    pricePerImage: 0.005,
  },
  // FLUX 2 Pro is billed per megapixel: the first costs $0.03 and each further
  // one $0.015 (https://deepinfra.com/black-forest-labs/FLUX-2-pro; the page's
  // headline "$0.015 / image" is the extra-megapixel rate). The default 1024x1024
  // cover is about one megapixel, so $0.03; the 1440x1024 banner is about $0.037.
  "FLUX 2 Pro": {
    name: "FLUX 2 Pro",
    model: "black-forest-labs/FLUX-2-pro",
    description: "Premium photorealistic with precise control.",
    provider: "deepinfra",
    pricePerImage: 0.03,
  },
} as const;

// Helper type for DeepInfra image models
export type DeepInfraImageModelKey = keyof typeof DEEPINFRA_IMAGE_MODELS;

// fal.ai image models (BYOK - the player's own fal key; docs/image-generation-
// design.md §3.4 and §4.1, decisions 57 and 61). fal sends no price back, so each
// picture is recorded at pricePerImage (turnCost's providerReportedUsd). Prices are
// per output megapixel from fal's model pages (read 2026-10-21): schnell $0.003 per
// MP; FLUX.2 [pro] $0.03 for the first MP and $0.015 per extra. At the in-play sizes
// (about 0.8 MP) that is $0.0024 and $0.03; the edit model also bills its input
// pictures, which the figure below ignores.
export const FAL_IMAGE_MODELS = {
  "FLUX.1 schnell": {
    name: "FLUX.1 schnell",
    model: "fal-ai/flux/schnell",
    description: "Fast and very cheap: plain scenes and places.",
    provider: "fal",
    pricePerImage: 0.0024,
    supportsReferences: false,
  },
  "FLUX.2 [pro]": {
    name: "FLUX.2 [pro]",
    model: "fal-ai/flux-2-pro",
    description: "Higher quality: character portraits.",
    provider: "fal",
    pricePerImage: 0.03,
    supportsReferences: false,
  },
  "FLUX.2 [pro] edit": {
    name: "FLUX.2 [pro] edit",
    model: "fal-ai/flux-2-pro/edit",
    description:
      "Takes portraits as reference pictures, to keep faces the same across scenes.",
    provider: "fal",
    pricePerImage: 0.03,
    supportsReferences: true,
  },
} as const;

export type FalImageModelKey = keyof typeof FAL_IMAGE_MODELS;

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
  zaiKey?: boolean;
}

/**
 * Maps a model's provider onto the key field that unlocks it. The Claude
 * subscription has none: the `claude` CLI's own sign-in unlocks it.
 */
const PROVIDER_KEY_FIELD: Partial<
  Record<AIModelConfig["provider"], keyof APIKeysAvailable>
> = {
  openrouter: "openRouterKey",
  deepseek: "deepseekKey",
  google: "googleKey",
  mistral: "mistralKey",
  deepinfra: "deepinfraKey",
  zai: "zaiKey",
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
    if (config.provider === "claude-cli") {
      return (
        isClaudeCliAvailablePlatform() && isClaudeCliUsable(getCachedClaudeCliStatus())
      );
    }
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
    keys.deepinfraKey ||
    keys.zaiKey
  );
}

/**
 * Get the required provider key name for a model
 */
export function getRequiredKeyForModel(
  modelKey: string,
): keyof APIKeysAvailable | null {
  const config = AI_MODELS[resolveModelKeyAlias(modelKey) as AIModelKey] as
    | AIModelConfig
    | undefined;
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

/**
 * Whether the keys the player has saved (the key strings themselves, as
 * ProviderKeys in sideModelCall.ts carries them) unlock this model's
 * provider. Same answer as isModelAvailable, which wants flags rather than
 * strings, plus the two cases it cannot answer: a custom model's UUID is an
 * OpenRouter model, and the Claude subscription (provider `claude-cli`) has no
 * key at all, so it is never "unlocked" by one.
 */
export function hasKeyForModel(
  modelKey: string,
  keys: { [K in keyof APIKeysAvailable]?: string | null },
): boolean {
  // A retired key is judged by its successor's provider (a Mistral-key-only
  // player who pinned "Mistral Small 3.2" still has the key for Small 4).
  const key = resolveModelKeyAlias(modelKey);
  const field = Object.prototype.hasOwnProperty.call(AI_MODELS, key)
    ? getRequiredKeyForModel(key)
    : isKnownModelKey(key)
      ? "openRouterKey"
      : null;
  return field ? !!keys[field] : false;
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
    | "google"
    | "zai"
    | "claude-cli";
  supportsToolCalling?: boolean; // Whether this model supports function calling
  /**
   * OpenRouter marks this model's reasoning `mandatory`: it cannot be turned
   * off, and an explicit `reasoning: {effort: "none"}` is rejected (OpenRouter's
   * reasoning-tokens docs; the model's `reasoning.mandatory` in
   * /api/v1/models, checked 2026-10-22). providerCall.ts sends such a model
   * "low" for "none" and gives it the always-thinking max_tokens floor.
   * Claude 5.5 and GLM 5.3 are recognised by id there and need no flag.
   */
  reasoningMandatory?: boolean;
  inputPrice: number;
  outputPrice: number;
  /**
   * $ per 1M input tokens served from the provider's prompt cache, filled
   * only where a dated provider price is known. Without one the cost
   * estimate prices cached tokens at inputPrice (turnCost.ts says so).
   */
  cachedInputPrice?: number;
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
    name: "Cartesia Sonic-3.6",
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



/** UUID shape of a custom (OpenRouter BYOK) model's id. */
const CUSTOM_MODEL_KEY_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Catalog keys a provider retired, mapped to the key of the model that
 * replaced them. A player may have pinned a tier, the narration voice, a side
 * agent or the Designer to one of these, and a removed key would otherwise
 * read as unset and fall back to the slot's default - an OpenRouter model, no
 * use to a player who only has a Mistral key. So the key stays resolvable:
 * isKnownModelKey accepts it, getModelConfig answers with the successor's
 * config, and every saved-choice reader returns resolveModelKeyAlias(key).
 *
 * Each pair is Mistral's own: its lifecycle table
 * (https://docs.mistral.ai/models, "Deprecated and retired models", read
 * 2026-10-21) names the replacement of every retired id. Where that
 * replacement costs more (Devstral Small 2 was $0.10 / $0.30 per M, Medium 3.5
 * is $1.50 / $7.50), the saved choice follows it anyway; the player can pick
 * something cheaper in Settings.
 *
 * A value must be a key of AI_MODELS (tests/modelCatalog.refresh.test.ts
 * checks), and no key here may also be a key of AI_MODELS.
 */
export const LEGACY_MODEL_KEY_ALIASES: Record<string, AIModelKey> = {
  "Mistral Small 3.2": "Mistral Small 4",
  "Mistral Medium 3.1": "Mistral Medium 3.5",
  "Mistral Nemo": "Ministral 3 8B",
  "Ministral 3B": "Ministral 3 3B",
  "Ministral 8B": "Ministral 3 8B",
  "Magistral Medium 1.2": "Mistral Medium 3.5",
  "Magistral Small 1.2": "Mistral Small 4",
  "Devstral Small 2": "Mistral Medium 3.5",
  "Devstral 2": "Mistral Medium 3.5",
};

/**
 * The same retirements by provider API id, for a choice saved as the id rather
 * than the catalog key (the PDF importer's model picker stores `model`, so a
 * player who chose Mistral Small 3.2 there holds `mistral-small-2506`). Each id
 * is one a retired AI_MODELS entry used to call; the value is the key of its
 * successor, and the same pairs as LEGACY_MODEL_KEY_ALIASES.
 */
export const LEGACY_PROVIDER_MODEL_IDS: Record<string, AIModelKey> = {
  "mistral-small-2506": "Mistral Small 4",
  "mistral-medium-2508": "Mistral Medium 3.5",
  "open-mistral-nemo-2407": "Ministral 3 8B",
  "ministral-3b-2410": "Ministral 3 3B",
  "ministral-8b-2410": "Ministral 3 8B",
  "magistral-medium-2509": "Mistral Medium 3.5",
  "magistral-small-2509": "Mistral Small 4",
  "labs-devstral-small-2512": "Mistral Medium 3.5",
  "devstral-2512": "Mistral Medium 3.5",
};

/**
 * The provider API id a saved id-valued model choice should use now: the
 * successor's id for a retired one (LEGACY_PROVIDER_MODEL_IDS), anything else
 * unchanged.
 */
export function resolveLegacyProviderModelId(modelId: string): string {
  return Object.prototype.hasOwnProperty.call(LEGACY_PROVIDER_MODEL_IDS, modelId)
    ? AI_MODELS[LEGACY_PROVIDER_MODEL_IDS[modelId]].model
    : modelId;
}

/**
 * The key a saved model choice should use now: the successor's key for a
 * retired one (LEGACY_MODEL_KEY_ALIASES), anything else unchanged. A key still
 * in AI_MODELS is never rewritten.
 */
export function resolveModelKeyAlias(modelKey: string): string {
  if (Object.prototype.hasOwnProperty.call(AI_MODELS, modelKey)) return modelKey;
  return Object.prototype.hasOwnProperty.call(LEGACY_MODEL_KEY_ALIASES, modelKey)
    ? LEGACY_MODEL_KEY_ALIASES[modelKey]
    : modelKey;
}

/**
 * Whether a stored model choice (a tier slot, the narration voice, a side
 * agent, anything saved in settings or synced from another device) still names
 * something the app can call: a key in AI_MODELS, a retired key that
 * LEGACY_MODEL_KEY_ALIASES maps to its successor, or anything shaped like the
 * UUID of a custom OpenRouter model (only the shape is checked, so the id of a
 * custom model the player has since deleted passes too). A key the catalog
 * dropped (a model its provider shut down) is not, and getModelConfig would
 * answer for it by silently swapping in DeepSeek V4 Flash, which needs a
 * DeepSeek key and bills differently. So callers that read a saved choice
 * check this first and use the slot's own default instead - and return
 * resolveModelKeyAlias(choice), so an aliased key reaches the rest of the app
 * as its successor's.
 */
export function isKnownModelKey(modelKey: unknown): modelKey is string {
  if (typeof modelKey !== "string" || modelKey === "") return false;
  return (
    Object.prototype.hasOwnProperty.call(AI_MODELS, modelKey) ||
    Object.prototype.hasOwnProperty.call(LEGACY_MODEL_KEY_ALIASES, modelKey) ||
    CUSTOM_MODEL_KEY_PATTERN.test(modelKey)
  );
}

/**
 * A saved image-model choice, checked against the catalog of the provider it
 * was saved with; one the catalog dropped (OpenRouter's Flux 2 Pro and Flex)
 * becomes that provider's default instead of reaching the provider, where
 * the OpenRouter route would quietly run Nano Banana at a different price.
 */
export function resolveImageModelKey(
  provider: "deepinfra" | "openrouter" | "fal",
  modelKey: string,
): string {
  const catalog: object =
    provider === "fal"
      ? FAL_IMAGE_MODELS
      : provider === "deepinfra"
        ? DEEPINFRA_IMAGE_MODELS
        : OPENROUTER_IMAGE_MODELS;
  if (Object.prototype.hasOwnProperty.call(catalog, modelKey)) return modelKey;
  if (provider === "fal") return "FLUX.1 schnell";
  return provider === "deepinfra" ? "Bria 3.2" : "Nano Banana";
}

export function getModelConfig(requestedKey: string): AIModelConfig {
  // A retired key answers with its successor's config (LEGACY_MODEL_KEY_ALIASES).
  const modelKey = resolveModelKeyAlias(requestedKey);

  // Check if the key exists in AI_MODELS
  if (modelKey in AI_MODELS) {
    return AI_MODELS[modelKey as AIModelKey] as unknown as AIModelConfig;
  }

  // Check if this looks like a UUID (custom model)
  // UUIDs are 36 chars with format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
  const isUUID = CUSTOM_MODEL_KEY_PATTERN.test(modelKey);

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

