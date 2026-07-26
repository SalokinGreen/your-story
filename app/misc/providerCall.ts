/**
 * Shared AI-provider call logic for the generate/generate-stream "thin proxy"
 * endpoints. Extracted so the exact same request-building/response-parsing
 * code can run in two places:
 *
 *  - The Next.js API routes (app/api/generate, app/api/generate-stream),
 *    used by the normal web build (hosted on Vercel) - the browser calls our
 *    server, our server calls the provider. No CORS concerns since this is a
 *    server-to-server call either way.
 *  - Directly from the client (app/misc/providerFetch.ts) in the standalone
 *    desktop/mobile build (Tauri/Capacitor), which ships no server at all -
 *    the browser/webview calls the provider directly.
 *
 * Both callers get identical behavior (same providers, same prefill/tool
 * quirks, same streaming event shape) since it's the same code either way -
 * see providerFetch.ts for how the standalone path is selected.
 */

import { getModelConfig, AIModelConfig } from "@/app/misc/ai_prices";
import { logger } from "@/app/misc/logger";
import { CustomModel } from "@/app/misc/user_settings";
import { extractFallbackToolCalls } from "@/app/misc/toolCallFallback";
import {
  SamplingSettings,
  filterSettingsForProvider,
} from "@/app/misc/samplingSettings";
import { getProviderFetch } from "@/app/misc/platformFetch";

export type Provider =
  | "deepseek"
  | "openrouter"
  | "mistral"
  | "deepinfra"
  | "google";

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  reasoning?: string;
  reasoning_details?: any[];
  tool_calls?: any[];
  tool_call_id?: string;
}

export interface GenerateRequestBody {
  messages: ChatMessage[];
  tools?: any[];
  // Caller-forced tool_choice (e.g. the M2 roll-invariant gate's retry
  // round, generation.ts). Only "required" is meaningful - anything else
  // falls back to the provider's normal default.
  toolChoice?: "required";
  model?: string;
  maxTokens?: number;
  temperature?: number;
  openRouterKey?: string;
  deepseekKey?: string;
  googleKey?: string;
  mistralKey?: string;
  deepinfraKey?: string;
  customModel?: CustomModel;
  // Streaming-only extras - ignored by generateNonStreaming.
  samplingSettings?: SamplingSettings;
  stop?: string[];
  // Reasoning-tier router: "none" | "low" | "normal" | "high" | "xhigh" -
  // best-effort, translated per-provider below. Ignored by providers/models
  // with no lever for it.
  reasoningEffort?: string;
}

interface AIResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: {
    index: number;
    message: {
      role: string;
      content: string | null;
      reasoning?: string;
      // DeepSeek's native API returns chain-of-thought here, not `reasoning`.
      reasoning_content?: string;
      reasoning_details?: any[];
      tool_calls?: any[];
    };
    finish_reason: string;
  }[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    estimated_cost?: number; // DeepInfra provides this in dollars
  };
}

export interface GenerateSuccess {
  content: string;
  reasoning: string;
  reasoning_details: any[];
  toolCalls: any[];
  meta: {
    model: string;
    modelName: string;
    provider: Provider;
    usage: {
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
    };
    /** Provider-reported cost in dollars, when the provider sends one. */
    estimatedCost?: number;
  };
}

export interface GenerateError {
  error: string;
  status: number;
  code?: string;
}

/**
 * Filter tools for Google/Gemini to stay within schema complexity limits.
 * Google's API can only handle ~25-30 tools with complex schemas.
 * We keep only the most essential GM tools.
 */
const GOOGLE_ESSENTIAL_TOOLS = new Set([
  // Core rolling
  "formula_roll",
  "opposed_formula",
  "fate_question",
  // Required alongside the dice tools, not optional: they report numbers and
  // `calculate` is the only thing that turns those into a pass/fail verdict.
  "calculate",
  // Lookup
  "search_notes",
  "read_notes",
  "search_memory",
  // Tracking
  "add_memory",
  "create_note",
  "edit_note",
  // NPC management
  "add_npc",
  "update_npc",
  "npc_reaction",
  // Combat essentials
  "start_combat",
  "end_combat",
  "add_combatant",
  "update_combatant_stat",
  "npc_roll",
  // Terminal - required
  "end_gm_thinking",
]);

function filterToolsForGoogle(tools: any[]): any[] {
  return tools.filter(
    (t) => t?.function?.name && GOOGLE_ESSENTIAL_TOOLS.has(t.function.name),
  );
}

/**
 * Normalize tool call IDs for Mistral API compatibility.
 * Mistral requires tool_call_id to be exactly 9 alphanumeric characters (a-z, A-Z, 0-9).
 * Other providers (DeepSeek, OpenRouter) may use formats like "call_36383327".
 * This function creates a consistent mapping for the request.
 */
function normalizeMistralToolCallIds(messages: ChatMessage[]): ChatMessage[] {
  const idMap = new Map<string, string>();
  let counter = 0;

  const generateId = () => {
    const chars =
      "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    const prefix = "tc";
    const num = (counter++).toString().padStart(7, "0");
    if (num.length > 7) {
      let result = "";
      for (let i = 0; i < 9; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      return result;
    }
    return prefix + num;
  };

  for (const msg of messages) {
    if (msg.tool_calls) {
      for (const tc of msg.tool_calls) {
        if (tc.id && !idMap.has(tc.id)) {
          if (/^[a-zA-Z0-9]{9}$/.test(tc.id)) {
            idMap.set(tc.id, tc.id);
          } else {
            idMap.set(tc.id, generateId());
          }
        }
      }
    }
  }

  return messages.map((msg) => {
    const newMsg = { ...msg };
    if (newMsg.tool_calls) {
      newMsg.tool_calls = newMsg.tool_calls.map((tc: any) => ({
        ...tc,
        id: idMap.get(tc.id) || tc.id,
      }));
    }
    if (newMsg.tool_call_id) {
      newMsg.tool_call_id =
        idMap.get(newMsg.tool_call_id) || newMsg.tool_call_id;
    }
    return newMsg;
  });
}

/**
 * Best-effort reasoning-effort translation per provider. Never throws - if a
 * provider/model has no lever for it, the field is simply omitted. Real
 * protection against a bad interaction is the reasoning-tier router's
 * fallback-to-lower-tier logic (app/misc/reasoningTiers.ts), not this.
 */
function applyReasoningEffort(
  requestBody: any,
  provider: Provider,
  reasoningEffort?: string,
): void {
  // DeepSeek V4's thinking mode is an explicit toggle (`thinking.type`) that
  // DEFAULTS to enabled server-side, so it must be handled before the early
  // return below - including the "none"/undefined case, where we explicitly
  // DISABLE it. Two reasons to disable at effort "none": it matches the tier
  // system's intent (cheap turns skip reasoning), and thinking mode silently
  // rejects temperature/top_p/presence_penalty/frequency_penalty, which the
  // creative-narration tiers rely on. When we DO enable it, strip those
  // unsupported sampling params so the request stays valid.
  if (provider === "deepseek") {
    const wantsThinking = !!reasoningEffort && reasoningEffort !== "none";
    requestBody.thinking = { type: wantsThinking ? "enabled" : "disabled" };
    if (wantsThinking) {
      // DeepSeek maps low/medium -> high and xhigh -> max in thinking mode.
      requestBody.reasoning_effort =
        reasoningEffort === "xhigh" ? "max" : "high";
      delete requestBody.temperature;
      delete requestBody.top_p;
      delete requestBody.presence_penalty;
      delete requestBody.frequency_penalty;
    }
    return;
  }

  if (!reasoningEffort || reasoningEffort === "none") return;

  if (provider === "mistral") {
    // Mistral only accepts "high" | "none" - collapse the 5-level scale.
    requestBody.reasoning_effort = "high";
  } else if (provider === "openrouter") {
    // OpenRouter accepts none/low/medium/high/xhigh/max across supported model families.
    const effortMap: Record<string, string> = {
      low: "low",
      normal: "medium",
      high: "high",
      xhigh: "xhigh",
    };
    const mapped = effortMap[reasoningEffort];
    if (mapped) {
      requestBody.reasoning = { effort: mapped };
    }
  }
  // deepinfra/google: no confirmed lever for the models this app targets -
  // left as a no-op rather than guessing at an unverified param.
}

function getApiKey(
  provider: Provider,
  body: Pick<
    GenerateRequestBody,
    "openRouterKey" | "deepseekKey" | "googleKey" | "mistralKey" | "deepinfraKey"
  >,
): string | null {
  if (provider === "deepseek") return body.deepseekKey || null;
  if (provider === "mistral") return body.mistralKey || null;
  if (provider === "deepinfra") return body.deepinfraKey || null;
  if (provider === "google") return body.googleKey || null;
  return body.openRouterKey || null;
}

const PROVIDER_NAMES: Record<Provider, string> = {
  deepseek: "DeepSeek",
  openrouter: "OpenRouter",
  google: "Google AI Studio",
  mistral: "Mistral",
  deepinfra: "DeepInfra",
};

/** Check if a string looks like a UUID (custom model ID). */
function isUUID(str: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    str,
  );
}

/**
 * Resolve a model key to its config. Custom models are defined client-side
 * (stored in localStorage) and sent directly in the request body.
 */
function resolveModelConfig(
  modelKey: string,
  customModel?: CustomModel,
): { config: AIModelConfig; actualModelId: string } {
  if (!isUUID(modelKey)) {
    const config = getModelConfig(modelKey);
    return { config, actualModelId: config.model };
  }

  if (customModel) {
    const config: AIModelConfig = {
      name: customModel.name,
      original_model: customModel.modelId,
      model: customModel.modelId,
      maxTokens: customModel.contextSize,
      maxOutputTokens: customModel.maxOutputTokens,
      provider: "openrouter",
      supportsToolCalling: true,
      cost: 0,
      inputPrice: customModel.inputPrice || 0,
      outputPrice: customModel.outputPrice || 0,
      finetunes: [],
      strengths: [],
      weaknesses: [],
      description: "Custom user-defined model",
      bannerUrl: undefined,
    };
    return { config, actualModelId: customModel.modelId };
  }

  console.warn(
    `Custom model UUID "${modelKey}" was not provided in the request, falling back to default`,
  );
  const config = getModelConfig(modelKey);
  return { config, actualModelId: config.model };
}

function buildEndpoint(provider: Provider, hasPrefill: boolean, hasTools: boolean): string {
  if (provider === "deepseek") {
    // Use beta endpoint for prefill support (prefix: true requires beta API)
    // BUT: DeepSeek beta doesn't support prefix + function calling together
    // So only use beta for non-tool calls (story generation)
    return hasPrefill && !hasTools
      ? "https://api.deepseek.com/beta/chat/completions"
      : "https://api.deepseek.com/chat/completions";
  }
  if (provider === "mistral") return "https://api.mistral.ai/v1/chat/completions";
  if (provider === "deepinfra")
    return "https://api.deepinfra.com/v1/openai/chat/completions";
  if (provider === "google")
    return "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
  return "https://openrouter.ai/api/v1/chat/completions";
}

function buildHeaders(provider: Provider, apiKey: string): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  };
  if (provider === "openrouter") {
    headers["HTTP-Referer"] = process.env.NEXT_PUBLIC_SITE_URL || "";
    headers["X-Title"] = "Your Story";
  }
  return headers;
}

/** Shared message-transform logic (prefill stripping, ID normalization, per-message shaping). */
function buildRequestMessages(
  messages: ChatMessage[],
  provider: Provider,
  hasTools: boolean,
  hasPrefill: boolean,
): any[] {
  // For DeepSeek/DeepInfra/Mistral/Google with tools: strip the prefill since these providers don't handle prefill well with function calling
  let processedMessages = messages;
  if (
    (provider === "deepseek" ||
      provider === "deepinfra" ||
      provider === "mistral" ||
      provider === "google") &&
    hasTools &&
    hasPrefill
  ) {
    processedMessages = messages.slice(0, -1);
  }

  // For Mistral: normalize tool call IDs to match their strict format requirement
  if (provider === "mistral") {
    processedMessages = normalizeMistralToolCallIds(processedMessages);
  }

  return processedMessages.map((m, index) => {
    const msg: any = {
      role: m.role,
      content: m.content !== undefined ? m.content : "",
    };

    // Restore reasoning/thinking details for models that require them (Gemini 3 on OpenRouter)
    if (provider === "openrouter" || provider === "google") {
      if (m.reasoning) msg.reasoning = m.reasoning;
      if (m.reasoning_details) msg.reasoning_details = m.reasoning_details;
    }
    if (m.tool_calls) {
      msg.tool_calls = m.tool_calls
        .filter((tc: any) => tc && tc.function && tc.function.name)
        .map((tc: any) => {
          const mapped: any = {
            id: tc.id,
            type: tc.type || "function",
            function: {
              name: tc.function.name,
              arguments:
                typeof tc.function.arguments === "string"
                  ? tc.function.arguments
                  : tc.function.arguments
                    ? JSON.stringify(tc.function.arguments)
                    : "{}",
            },
          };
          if (
            tc.extra_content &&
            (provider === "google" || provider === "openrouter")
          ) {
            mapped.extra_content = tc.extra_content;
          }
          if (
            !mapped.extra_content &&
            m.reasoning_details &&
            (provider === "google" || provider === "openrouter")
          ) {
            const details = m.reasoning_details;
            const matchingDetail = details.find(
              (d: any) =>
                d.id === tc.id ||
                (d.type === "reasoning.encrypted" && details.length === 1),
            );
            if (
              matchingDetail?.data &&
              matchingDetail?.type === "reasoning.encrypted"
            ) {
              mapped.extra_content = {
                google: { thought_signature: matchingDetail.data },
              };
            }
          }
          return mapped;
        });
      if (msg.tool_calls.length === 0) {
        delete msg.tool_calls;
      }
    }
    if (m.tool_call_id) msg.tool_call_id = m.tool_call_id;
    if (
      index === processedMessages.length - 1 &&
      m.role === "assistant" &&
      ((provider === "mistral" && !hasTools) ||
        (provider === "deepseek" && !hasTools))
    ) {
      msg.prefix = true;
    }
    return msg;
  });
}

function resolveProviderAndKey(
  body: GenerateRequestBody,
): { provider: Provider; config: AIModelConfig; apiKey: string } | GenerateError {
  const model = body.model && body.model.trim() ? body.model : "DeepSeek V4 Flash";
  const { config } = resolveModelConfig(model, body.customModel);
  const provider = config.provider as Provider;
  const apiKey = getApiKey(provider, body);

  if (!apiKey) {
    return {
      error: `No API key configured for ${PROVIDER_NAMES[provider] || provider}. Please add your API key in Settings.`,
      status: 400,
      code: "NO_API_KEY",
    };
  }

  return { provider, config, apiKey };
}

// ============================================================
// Non-streaming
// ============================================================

export async function generateNonStreaming(
  body: GenerateRequestBody,
): Promise<GenerateSuccess | GenerateError> {
  try {
    const { messages, tools, toolChoice, maxTokens = 4000, temperature = 0.7 } = body;
    const model = body.model && body.model.trim() ? body.model : "DeepSeek V4 Flash";

    if (!messages || messages.length === 0) {
      return { error: "Messages are required", status: 400 };
    }

    const resolved = resolveProviderAndKey(body);
    if ("error" in resolved) return resolved;
    const { provider, config, apiKey } = resolved;

    const hasPrefill =
      messages.length > 0 && messages[messages.length - 1].role === "assistant";
    const hasTools = !!(tools && tools.length > 0);

    const endpoint = buildEndpoint(provider, hasPrefill, hasTools);
    const headers = buildHeaders(provider, apiKey);

    const requestBody: any = {
      model: config.model,
      messages: buildRequestMessages(messages, provider, hasTools, hasPrefill),
      temperature,
      max_tokens: maxTokens,
    };

    if (hasTools) {
      const toolsToUse = provider === "google" ? filterToolsForGoogle(tools!) : tools;
      requestBody.tools = toolsToUse;
      requestBody.tool_choice =
        toolChoice === "required" || provider === "google" ? "required" : "auto";
    }

    applyReasoningEffort(requestBody, provider, body.reasoningEffort);

    const providerFetch = getProviderFetch();
    const response = await providerFetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        error: `AI API request failed: ${response.status} ${response.statusText} - ${errorText}`,
        status: 500,
      };
    }

    const aiResponse = (await response.json()) as AIResponse;
    const content = aiResponse.choices[0]?.message?.content || "";
    // DeepSeek-native models put CoT in `reasoning_content`; OpenRouter/others
    // in `reasoning`. Read whichever is present so reasoning is preserved into
    // saved history regardless of provider.
    const reasoning =
      aiResponse.choices[0]?.message?.reasoning ||
      aiResponse.choices[0]?.message?.reasoning_content ||
      "";
    const reasoning_details = aiResponse.choices[0]?.message?.reasoning_details || [];
    let toolCalls = aiResponse.choices[0]?.message?.tool_calls;

    if ((!toolCalls || toolCalls.length === 0) && hasTools) {
      const recovered = extractFallbackToolCalls(content);
      if (recovered) {
        logger.action(
          "Recovered tool call(s) from content fallback (tool_calls field was empty)",
          { provider, recoveredCount: recovered.length, names: recovered.map((c) => c.function.name) },
        );
        toolCalls = recovered;
      }
    }

    const usage = aiResponse.usage || {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
    };

    logger.action("AI generation complete", {
      model: config.model,
      provider,
      promptTokens: usage.prompt_tokens,
      completionTokens: usage.completion_tokens,
      hasToolCalls: !!toolCalls,
    });

    return {
      content,
      reasoning,
      reasoning_details,
      toolCalls: toolCalls || [],
      meta: {
        model: config.model,
        modelName: model,
        provider,
        usage: {
          promptTokens: usage.prompt_tokens,
          completionTokens: usage.completion_tokens,
          totalTokens: usage.total_tokens,
        },
        ...(usage.estimated_cost !== undefined && {
          estimatedCost: usage.estimated_cost,
        }),
      },
    };
  } catch (error: any) {
    logger.error("Generation API error", { error: error.message });
    return { error: error.message || "Internal server error", status: 500 };
  }
}

// ============================================================
// Streaming
// ============================================================

/**
 * Split delta content into visible text and reasoning, handling both plain
 * strings and Magistral's array format with thinking/text content parts.
 * Magistral's own CoT ships inline in `content` (not a separate `reasoning`
 * delta field like DeepSeek/OpenRouter), so it has to be pulled out here or
 * it's lost entirely rather than just unstreamed.
 */
function extractContentParts(content: unknown): { text: string; thinking: string } {
  if (typeof content === "string") {
    return { text: content, thinking: "" };
  }
  if (Array.isArray(content)) {
    let text = "";
    let thinking = "";
    for (const part of content) {
      if (typeof part === "string") {
        text += part;
      } else if (part?.type === "text" && typeof part.text === "string") {
        text += part.text;
      } else if (part?.type === "thinking") {
        const chunks = Array.isArray(part.thinking) ? part.thinking : [part.thinking];
        for (const chunk of chunks) {
          if (typeof chunk === "string") thinking += chunk;
          else if (chunk && typeof chunk.text === "string") thinking += chunk.text;
        }
      }
    }
    return { text, thinking };
  }
  if (content && typeof content === "object" && "text" in content) {
    const obj = content as { text?: unknown };
    if (typeof obj.text === "string") {
      return { text: obj.text, thinking: "" };
    }
  }
  return { text: "", thinking: "" };
}

export function generateStream(body: GenerateRequestBody): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();

  return new ReadableStream({
    async start(controller) {
      const emit = (data: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      try {
        const { messages, tools, toolChoice, maxTokens = 4000, temperature = 0.7, samplingSettings, stop } = body;
        const model = body.model && body.model.trim() ? body.model : "DeepSeek V4 Flash";

        if (!messages || messages.length === 0) {
          emit({ type: "error", error: "Messages are required" });
          controller.close();
          return;
        }

        const resolved = resolveProviderAndKey(body);
        if ("error" in resolved) {
          emit({ type: "error", error: resolved.error, code: resolved.code });
          controller.close();
          return;
        }
        const { provider, config, apiKey } = resolved;

        const hasPrefill =
          messages.length > 0 && messages[messages.length - 1].role === "assistant";
        const hasTools = !!(tools && tools.length > 0);

        const endpoint = buildEndpoint(provider, hasPrefill, hasTools);
        const headers = buildHeaders(provider, apiKey);

        const requestBody: any = {
          model: config.model,
          messages: buildRequestMessages(messages, provider, hasTools, hasPrefill),
          temperature,
          max_tokens: maxTokens,
          stream: true,
          stream_options: { include_usage: true },
        };

        if (
          samplingSettings &&
          (provider === "mistral" || provider === "deepinfra" || provider === "openrouter")
        ) {
          const filteredSettings = filterSettingsForProvider(samplingSettings, provider);
          if (filteredSettings.temperature !== undefined) {
            requestBody.temperature = filteredSettings.temperature;
          }
          if (filteredSettings.top_p !== undefined) requestBody.top_p = filteredSettings.top_p;
          if (filteredSettings.presence_penalty !== undefined)
            requestBody.presence_penalty = filteredSettings.presence_penalty;
          if (filteredSettings.frequency_penalty !== undefined)
            requestBody.frequency_penalty = filteredSettings.frequency_penalty;

          if (provider === "deepinfra" || provider === "openrouter") {
            if (filteredSettings.min_p !== undefined && filteredSettings.min_p > 0) {
              requestBody.min_p = filteredSettings.min_p;
            }
            if (filteredSettings.top_k !== undefined && filteredSettings.top_k > 0) {
              requestBody.top_k = filteredSettings.top_k;
            }
            if (
              filteredSettings.repetition_penalty !== undefined &&
              filteredSettings.repetition_penalty !== 1.0
            ) {
              requestBody.repetition_penalty = filteredSettings.repetition_penalty;
            }
          }
        }

        if (hasTools) {
          const toolsToUse = provider === "google" ? filterToolsForGoogle(tools!) : tools;
          requestBody.tools = toolsToUse;
          requestBody.tool_choice =
            toolChoice === "required" || provider === "google" ? "required" : "auto";
        }

        applyReasoningEffort(requestBody, provider, body.reasoningEffort);

        if (stop && stop.length > 0) {
          requestBody.stop = stop;
        }

        const providerFetch = getProviderFetch();
        const response = await providerFetch(endpoint, {
          method: "POST",
          headers,
          body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
          const errorText = await response.text();
          emit({ type: "error", error: `AI API error: ${response.status} - ${errorText}` });
          controller.close();
          return;
        }

        const reader = response.body?.getReader();
        if (!reader) {
          emit({ type: "error", error: "No response body" });
          controller.close();
          return;
        }

        const decoder = new TextDecoder();
        let buffer = "";
        let fullContent = "";
        let toolCalls: any[] = [];
        let promptTokens = 0;
        let completionTokens = 0;
        // Tracks the most recent finish_reason seen across chunks. "length"
        // means the provider cut the response off at the token cap - if that
        // happens mid tool-call, the accumulated arguments string will be
        // unterminated JSON. Surfacing this lets callers tell "truncated"
        // apart from "the model just sent nothing", which otherwise look
        // identical once JSON.parse fails on both.
        let lastFinishReason: string | undefined;
        let estimatedCost: number | undefined;
        let streamComplete = false;

        const processChunk = (parsed: any) => {
          const delta = parsed.choices?.[0]?.delta;
          const finishReason = parsed.choices?.[0]?.finish_reason;
          if (finishReason) lastFinishReason = finishReason;

          if (delta?.content !== undefined && delta?.content !== null) {
            const { text: textContent, thinking: thinkingContent } = extractContentParts(
              delta.content,
            );
            if (textContent) {
              fullContent += textContent;
              emit({ type: "content", content: textContent });
            }
            if (thinkingContent) {
              emit({ type: "reasoning", content: thinkingContent });
            }
          }

          if (delta?.reasoning !== undefined && delta?.reasoning !== null) {
            emit({ type: "reasoning", content: delta.reasoning });
          }

          // DeepSeek's native API (api.deepseek.com) streams chain-of-thought
          // in `reasoning_content`, not the OpenRouter-normalized `reasoning`
          // field handled above. Without this, a BYOK DeepSeek user's thinking
          // is silently dropped and never streamed to the timeline. Emit it as
          // the same `reasoning` event so the client path is provider-agnostic.
          if (
            delta?.reasoning_content !== undefined &&
            delta?.reasoning_content !== null
          ) {
            emit({ type: "reasoning", content: delta.reasoning_content });
          }

          if (delta?.reasoning_details) {
            emit({ type: "reasoning_details", details: delta.reasoning_details });
          }

          if (delta?.tool_calls) {
            for (const tc of delta.tool_calls) {
              const index = tc.index ?? 0;
              if (!toolCalls[index]) {
                toolCalls[index] = { id: tc.id || "", type: "function", function: { name: "", arguments: "" } };
              }
              if (tc.id) toolCalls[index].id = tc.id;
              if (tc.function?.name) toolCalls[index].function.name = tc.function.name;
              if (tc.function?.arguments) toolCalls[index].function.arguments += tc.function.arguments;
              if (tc.extra_content) toolCalls[index].extra_content = tc.extra_content;
            }
          }

          if (parsed.usage) {
            promptTokens = parsed.usage.prompt_tokens || 0;
            completionTokens = parsed.usage.completion_tokens || 0;
            if (parsed.usage.estimated_cost !== undefined) {
              estimatedCost = parsed.usage.estimated_cost;
            }
          }

          if (finishReason === "stop" || finishReason === "end_turn" || finishReason === "length") {
            streamComplete = true;
          }
        };

        while (true) {
          const { done, value } = await reader.read();
          if (done || streamComplete) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith("data:")) continue;
            const data = trimmed.slice(5).trim();
            if (data === "[DONE]") {
              streamComplete = true;
              break;
            }
            try {
              processChunk(JSON.parse(data));
              if (streamComplete) break;
            } catch {
              // Skip malformed JSON
            }
          }
        }

        // Process any remaining data in buffer after stream closes - catches
        // edge cases where the last chunk wasn't followed by a newline.
        if (buffer.trim()) {
          const trimmed = buffer.trim();
          if (trimmed.startsWith("data:")) {
            const data = trimmed.slice(5).trim();
            if (data !== "[DONE]") {
              try {
                processChunk(JSON.parse(data));
              } catch {
                // Skip malformed JSON in final buffer
              }
            }
          }
        }

        // Defensive fallback for a known DeepSeek reliability issue: a tool
        // call sometimes arrives as text in content instead of populating
        // the streamed tool_calls deltas (see toolCallFallback.ts). Only
        // attempt recovery when tools were actually offered - otherwise
        // this is just ordinary prose.
        if (toolCalls.length === 0 && hasTools) {
          const recovered = extractFallbackToolCalls(fullContent);
          if (recovered) {
            logger.action(
              "Recovered tool call(s) from content fallback (tool_calls field was empty)",
              { provider, recoveredCount: recovered.length, names: recovered.map((c) => c.function.name) },
            );
            toolCalls = recovered;
          }
        }

        const parsedToolCalls = toolCalls
          .filter((tc) => tc && tc.function?.name)
          .map((tc) => {
            try {
              const parsedArgs =
                typeof tc.function.arguments === "string"
                  ? JSON.parse(tc.function.arguments)
                  : tc.function.arguments;
              return { ...tc, function: { ...tc.function, arguments: parsedArgs } };
            } catch {
              // A "length" finish_reason means the provider cut the response
              // off before this call's arguments finished, so the raw
              // string is unterminated JSON rather than the model genuinely
              // sending no arguments - mark *why* it's empty rather than
              // reporting "missing required parameter" for every field.
              return {
                ...tc,
                argsTruncated: lastFinishReason === "length",
                rawArgumentsPreview: tc.function?.arguments?.substring(0, 200),
                function: { ...tc.function, arguments: {} },
              };
            }
          });

        if (parsedToolCalls.length > 0) {
          emit({ type: "tool_calls", toolCalls: parsedToolCalls });
        }

        logger.action("AI generation (stream) complete", {
          model: config.model,
          provider,
          promptTokens,
          completionTokens,
          hasToolCalls: parsedToolCalls.length > 0,
          finishReason: lastFinishReason,
          estimatedCost,
        });

        emit({
          type: "done",
          meta: {
            model: config.model,
            modelName: model,
            provider,
            finishReason: lastFinishReason,
            usage: {
              promptTokens,
              completionTokens,
              totalTokens: promptTokens + completionTokens,
            },
            // The provider's own dollar figure when it reports one (DeepInfra
            // does). Until now this was parsed off the usage chunk and then
            // dropped on the floor here - forwarding it lets the client's
            // per-turn cost ledger (turnCost.ts) prefer a real billed amount
            // over our list-price arithmetic.
            ...(estimatedCost !== undefined && { estimatedCost }),
          },
        });

        controller.close();
      } catch (error: any) {
        logger.error("Generation stream error", { error: error.message });
        emit({ type: "error", error: error.message || "Internal server error" });
        controller.close();
      }
    },
  });
}
