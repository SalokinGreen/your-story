/**
 * Generic AI Generation API (Streaming)
 *
 * A thin, stateless AI proxy endpoint with SSE streaming.
 * Receives pre-built messages and config, forwards to AI provider,
 * streams raw response. All context building and tool execution
 * happens on the frontend.
 *
 * BYOK only: users always provide their own API key for whichever provider
 * they select (OpenRouter, DeepSeek, Google, Mistral, DeepInfra).
 *
 * Request: { messages, tools?, model, maxTokens, openRouterKey?, deepseekKey?,
 *            googleKey?, mistralKey?, deepinfraKey?, customModel? }
 * Response: SSE stream with events: content, tool_calls, done, error
 */

import { NextRequest } from "next/server";
import { getModelConfig, AIModelConfig } from "@/app/misc/ai_prices";
import { logger } from "@/app/misc/logger";
import { CustomModel } from "@/app/misc/user_settings";
import {
  SamplingSettings,
  filterSettingsForProvider,
} from "@/app/misc/samplingSettings";

export const runtime = "nodejs";
export const maxDuration = 60; // Allow up to 60 seconds for streaming

interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  reasoning?: string;
  reasoning_details?: any[];
  tool_calls?: any[];
  tool_call_id?: string;
}

interface RequestBody {
  messages: ChatMessage[];
  tools?: any[];
  model?: string;
  maxTokens?: number;
  temperature?: number;
  openRouterKey?: string;
  deepseekKey?: string;
  googleKey?: string;
  mistralKey?: string;
  deepinfraKey?: string;
  customModel?: CustomModel;
  // Sampling settings
  samplingSettings?: SamplingSettings;
  // Stop sequences to halt generation
  stop?: string[];
  // Reasoning-tier router: "none" | "low" | "normal" | "high" | "xhigh" - best-effort,
  // translated per-provider below. Ignored by providers/models with no lever for it.
  reasoningEffort?: string;
}

/**
 * Best-effort reasoning-effort translation per provider. Never throws - if a
 * provider/model has no lever for it, the field is simply omitted. Real
 * protection against a bad interaction is the reasoning-tier router's
 * fallback-to-lower-tier logic (app/misc/reasoningTiers.ts), not this.
 */
function applyReasoningEffort(
  requestBody: any,
  provider: string,
  reasoningEffort?: string,
): void {
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
  // deepseek/deepinfra/google: no confirmed lever for the models this app
  // targets - left as a no-op rather than guessing at an unverified param.
}

/**
 * Extract text content from delta, handling both plain strings
 * and Magistral's array format with thinking/text content parts.
 */
function extractTextContent(content: unknown): string {
  // Plain string (most models)
  if (typeof content === "string") {
    return content;
  }

  // Array format (Magistral thinking models)
  // Format: [{ type: "thinking", thinking: [...] }, { type: "text", text: "..." }, ...]
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (part?.type === "text" && typeof part.text === "string") {
          return part.text;
        }
        // Skip thinking chunks - we only want the final answer
        return "";
      })
      .join("");
  }

  // Single object with text property
  if (content && typeof content === "object" && "text" in content) {
    const obj = content as { text?: unknown };
    if (typeof obj.text === "string") {
      return obj.text;
    }
  }

  return "";
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
  const filtered = tools.filter(
    (t) => t?.function?.name && GOOGLE_ESSENTIAL_TOOLS.has(t.function.name),
  );
  console.log(
    `[API] Filtered tools for Google: ${tools.length} -> ${filtered.length}`,
  );
  return filtered;
}

/**
 * Normalize tool call IDs for Mistral API compatibility.
 * Mistral requires tool_call_id to be exactly 9 alphanumeric characters (a-z, A-Z, 0-9).
 * Other providers (DeepSeek, OpenRouter) may use formats like "call_36383327".
 * This function creates a consistent mapping for the request.
 */
function normalizeMistralToolCallIds(messages: ChatMessage[]): ChatMessage[] {
  // Build a mapping of original IDs to normalized IDs
  const idMap = new Map<string, string>();
  let counter = 0;

  // Generate a Mistral-compatible ID (9 alphanumeric chars)
  const generateId = () => {
    const chars =
      "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    const prefix = "tc"; // 2 chars
    const num = (counter++).toString().padStart(7, "0"); // 7 chars = 9 total
    // If counter exceeds 7 digits, use random chars
    if (num.length > 7) {
      let result = "";
      for (let i = 0; i < 9; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      return result;
    }
    return prefix + num;
  };

  // First pass: collect all tool_call_ids from tool_calls arrays
  for (const msg of messages) {
    if (msg.tool_calls) {
      for (const tc of msg.tool_calls) {
        if (tc.id && !idMap.has(tc.id)) {
          // Check if already Mistral-compatible (9 alphanumeric chars)
          if (/^[a-zA-Z0-9]{9}$/.test(tc.id)) {
            idMap.set(tc.id, tc.id);
          } else {
            idMap.set(tc.id, generateId());
          }
        }
      }
    }
  }

  // Second pass: apply the mapping
  return messages.map((msg) => {
    const newMsg = { ...msg };

    // Normalize tool_calls array
    if (newMsg.tool_calls) {
      newMsg.tool_calls = newMsg.tool_calls.map((tc: any) => ({
        ...tc,
        id: idMap.get(tc.id) || tc.id,
      }));
    }

    // Normalize tool_call_id reference
    if (newMsg.tool_call_id) {
      newMsg.tool_call_id =
        idMap.get(newMsg.tool_call_id) || newMsg.tool_call_id;
    }

    return newMsg;
  });
}

function getApiKey(
  provider: "deepseek" | "openrouter" | "mistral" | "deepinfra" | "google",
  openRouterKey?: string,
  deepseekKey?: string,
  googleKey?: string,
  mistralKey?: string,
  deepinfraKey?: string,
): string | null {
  if (provider === "deepseek") {
    return deepseekKey || null;
  } else if (provider === "mistral") {
    return mistralKey || null;
  } else if (provider === "deepinfra") {
    return deepinfraKey || null;
  } else if (provider === "google") {
    return googleKey || null;
  } else {
    return openRouterKey || null;
  }
}

/**
 * Check if a string looks like a UUID (custom model ID)
 */
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
  // If it's a known model, use it directly
  if (!isUUID(modelKey)) {
    const config = getModelConfig(modelKey);
    return { config, actualModelId: config.model };
  }

  if (customModel) {
    // Found custom model - create config for OpenRouter
    const config: AIModelConfig = {
      name: customModel.name,
      original_model: customModel.modelId,
      model: customModel.modelId, // Actual OpenRouter model ID
      maxTokens: customModel.contextSize,
      maxOutputTokens: customModel.maxOutputTokens,
      provider: "openrouter", // Custom models are always OpenRouter
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

  // UUID not provided in the request - fall back to default
  console.warn(
    `Custom model UUID "${modelKey}" was not provided in the request, falling back to default`,
  );
  const config = getModelConfig(modelKey); // Will return DeepSeek fallback
  return { config, actualModelId: config.model };
}

export async function POST(req: NextRequest) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        // Parse request
        const body: RequestBody = await req.json();
        const {
          messages,
          tools,
          model: rawModel,
          maxTokens = 4000,
          temperature = 0.7,
          openRouterKey,
          deepseekKey,
          googleKey,
          mistralKey,
          deepinfraKey,
          customModel,
          samplingSettings,
          stop,
          reasoningEffort,
        } = body;

        const model =
          rawModel && rawModel.trim() ? rawModel : "DeepSeek V4 Flash";

        if (!messages || messages.length === 0) {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: "error",
                error: "Messages are required",
              })}\n\n`,
            ),
          );
          controller.close();
          return;
        }

        // Debug: Log received maxTokens
        console.log(
          "[API] generate-stream received - maxTokens:",
          maxTokens,
          "model:",
          model,
        );

        // Get model config (custom models are sent directly from the client)
        const { config: modelConfig, actualModelId } = resolveModelConfig(
          model,
          customModel,
        );

        // Get API key from user's provided keys (BYOK for all providers)
        const apiKey = getApiKey(
          modelConfig.provider as
            | "deepseek"
            | "openrouter"
            | "mistral"
            | "deepinfra"
            | "google",
          openRouterKey,
          deepseekKey,
          googleKey,
          mistralKey,
          deepinfraKey,
        );

        if (!apiKey) {
          const providerNames: Record<string, string> = {
            deepseek: "DeepSeek",
            openrouter: "OpenRouter",
            google: "Google AI Studio",
            mistral: "Mistral",
            deepinfra: "DeepInfra",
          };
          const providerName =
            providerNames[modelConfig.provider] || modelConfig.provider;
          const errorMessage = `No API key configured for ${providerName}. Please add your API key in Settings.`;
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: "error",
                error: errorMessage,
                code: "NO_API_KEY",
              })}\n\n`,
            ),
          );
          controller.close();
          return;
        }

        // Build request
        // Check if we have a prefill (trailing assistant message)
        const hasPrefill =
          messages.length > 0 &&
          messages[messages.length - 1].role === "assistant";
        const hasTools = tools && tools.length > 0;

        let endpoint: string;
        if (modelConfig.provider === "deepseek") {
          // Use beta endpoint for prefill support (prefix: true requires beta API)
          // BUT: DeepSeek beta doesn't support prefix + function calling together
          // So only use beta for non-tool calls (story generation)
          endpoint =
            hasPrefill && !hasTools
              ? "https://api.deepseek.com/beta/chat/completions"
              : "https://api.deepseek.com/chat/completions";
        } else if (modelConfig.provider === "mistral") {
          endpoint = "https://api.mistral.ai/v1/chat/completions";
        } else if (modelConfig.provider === "deepinfra") {
          endpoint = "https://api.deepinfra.com/v1/openai/chat/completions";
        } else if (modelConfig.provider === "google") {
          endpoint =
            "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
        } else {
          endpoint = "https://openrouter.ai/api/v1/chat/completions";
        }

        const headers: Record<string, string> = {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        };

        if (modelConfig.provider === "openrouter") {
          headers["HTTP-Referer"] = process.env.NEXT_PUBLIC_SITE_URL || "";
          headers["X-Title"] = "Your Story";
        }

        // For DeepSeek/DeepInfra/Mistral/Google with tools: strip the prefill since these providers don't handle prefill well with function calling
        let processedMessages = messages;
        if (
          (modelConfig.provider === "deepseek" ||
            modelConfig.provider === "deepinfra" ||
            modelConfig.provider === "mistral" ||
            modelConfig.provider === "google") &&
          hasTools &&
          hasPrefill
        ) {
          processedMessages = messages.slice(0, -1);
          console.log(
            `[API] Stripped prefill for ${modelConfig.provider} tool calling`,
          );
        }

        // For Mistral: normalize tool call IDs to match their strict format requirement
        // Mistral requires exactly 9 alphanumeric characters (a-z, A-Z, 0-9)
        if (modelConfig.provider === "mistral") {
          processedMessages = normalizeMistralToolCallIds(processedMessages);
        }

        const requestBody: any = {
          model: modelConfig.model,
          messages: processedMessages.map((m, index) => {
            // FIX: Preserve null content (don't force to "") to avoid validation errors on some providers
            const msg: any = {
              role: m.role,
              content: m.content !== undefined ? m.content : "",
            };

            // Restore reasoning/thinking details for models that require them (Gemini 3 on OpenRouter)
            if (
              modelConfig.provider === "openrouter" ||
              modelConfig.provider === "google"
            ) {
              if (m.reasoning) msg.reasoning = m.reasoning;
              if (m.reasoning_details)
                msg.reasoning_details = m.reasoning_details;
            }
            if (m.tool_calls) {
              // Re-serialize tool call arguments to strings if they're objects
              // (AI APIs expect arguments as JSON strings, not parsed objects)
              // Filter out any malformed tool calls that don't have the required structure
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
                  // Preserve extra_content (contains Google's thought_signature for thinking models)
                  if (
                    tc.extra_content &&
                    (modelConfig.provider === "google" ||
                      modelConfig.provider === "openrouter")
                  ) {
                    mapped.extra_content = tc.extra_content;
                  }

                  // FIX: Cross-populate extra_content from reasoning_details if missing from tool call
                  // This is a "belts and suspenders" fix for Google models on OpenRouter
                  if (
                    !mapped.extra_content &&
                    m.reasoning_details &&
                    (modelConfig.provider === "google" ||
                      modelConfig.provider === "openrouter")
                  ) {
                    const details = m.reasoning_details;
                    const matchingDetail = details.find(
                      (d: any) =>
                        d.id === tc.id ||
                        (d.type === "reasoning.encrypted" &&
                          details.length === 1),
                    );
                    if (
                      matchingDetail?.data &&
                      matchingDetail?.type === "reasoning.encrypted"
                    ) {
                      mapped.extra_content = {
                        google: {
                          thought_signature: matchingDetail.data,
                        },
                      };
                    }
                  }
                  return mapped;
                });
              // Remove tool_calls if empty after filtering
              if (msg.tool_calls.length === 0) {
                delete msg.tool_calls;
              }
            }
            if (m.tool_call_id) msg.tool_call_id = m.tool_call_id;
            // For Mistral/DeepSeek: only add prefix: true for non-tool calls (story generation)
            // Mistral's tool_choice: "any" and DeepSeek's beta API don't support prefix + function calling together
            if (
              index === processedMessages.length - 1 &&
              m.role === "assistant" &&
              ((modelConfig.provider === "mistral" && !hasTools) ||
                (modelConfig.provider === "deepseek" && !hasTools))
            ) {
              msg.prefix = true;
            }
            return msg;
          }),
          temperature,
          max_tokens: maxTokens,
          stream: true,
          // Request usage statistics in streaming mode (required for Mistral/OpenAI)
          stream_options: { include_usage: true },
        };

        // Apply sampling settings for supported providers (Mistral/DeepInfra/OpenRouter)
        if (
          samplingSettings &&
          (modelConfig.provider === "mistral" ||
            modelConfig.provider === "deepinfra" ||
            modelConfig.provider === "openrouter")
        ) {
          const filteredSettings = filterSettingsForProvider(
            samplingSettings,
            modelConfig.provider as "mistral" | "deepinfra" | "openrouter",
          );

          // Override temperature from sampling settings if provided
          if (filteredSettings.temperature !== undefined) {
            requestBody.temperature = filteredSettings.temperature;
          }

          // Apply common settings (all providers)
          if (filteredSettings.top_p !== undefined) {
            requestBody.top_p = filteredSettings.top_p;
          }
          if (filteredSettings.presence_penalty !== undefined) {
            requestBody.presence_penalty = filteredSettings.presence_penalty;
          }
          if (filteredSettings.frequency_penalty !== undefined) {
            requestBody.frequency_penalty = filteredSettings.frequency_penalty;
          }

          // Apply extended settings (DeepInfra and OpenRouter support all)
          if (
            modelConfig.provider === "deepinfra" ||
            modelConfig.provider === "openrouter"
          ) {
            if (
              filteredSettings.min_p !== undefined &&
              filteredSettings.min_p > 0
            ) {
              requestBody.min_p = filteredSettings.min_p;
            }
            if (
              filteredSettings.top_k !== undefined &&
              filteredSettings.top_k > 0
            ) {
              requestBody.top_k = filteredSettings.top_k;
            }
            if (
              filteredSettings.repetition_penalty !== undefined &&
              filteredSettings.repetition_penalty !== 1.0
            ) {
              requestBody.repetition_penalty =
                filteredSettings.repetition_penalty;
            }
          }

          console.log(
            "[API] Applied sampling settings for",
            modelConfig.provider,
            ":",
            filteredSettings,
          );
        }

        if (tools && tools.length > 0) {
          // Google/Gemini has strict schema complexity limits - filter to essential tools
          const toolsToUse =
            modelConfig.provider === "google"
              ? filterToolsForGoogle(tools)
              : tools;
          requestBody.tools = toolsToUse;
          // Google/Gemini needs tool_choice: "required" to actually invoke tools
          // ("auto" often results in empty responses)
          requestBody.tool_choice =
            modelConfig.provider === "google" ? "required" : "auto";
        }

        applyReasoningEffort(
          requestBody,
          modelConfig.provider,
          reasoningEffort,
        );

        // Add stop sequences if provided (supported by all providers)
        if (stop && stop.length > 0) {
          requestBody.stop = stop;
        }

        // Debug: Log the max_tokens being sent to provider
        console.log(
          "[API] Sending to",
          modelConfig.provider,
          "- max_tokens:",
          requestBody.max_tokens,
        );

        // Make streaming request
        const response = await fetch(endpoint, {
          method: "POST",
          headers,
          body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
          const errorText = await response.text();
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: "error",
                error: `AI API error: ${response.status} - ${errorText}`,
              })}\n\n`,
            ),
          );
          controller.close();
          return;
        }

        const reader = response.body?.getReader();
        if (!reader) {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: "error",
                error: "No response body",
              })}\n\n`,
            ),
          );
          controller.close();
          return;
        }

        const decoder = new TextDecoder();
        let buffer = "";
        let fullContent = "";
        let fullReasoning = "";
        let reasoningDetails: any[] = [];
        let toolCalls: any[] = [];
        let promptTokens = 0;
        let completionTokens = 0;
        let estimatedCost: number | undefined; // DeepInfra provides this
        let streamComplete = false;

        // Process stream
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
              const parsed = JSON.parse(data);
              const delta = parsed.choices?.[0]?.delta;
              const finishReason = parsed.choices?.[0]?.finish_reason;

              if (delta?.content !== undefined && delta?.content !== null) {
                const textContent = extractTextContent(delta.content);
                if (textContent) {
                  fullContent += textContent;
                  controller.enqueue(
                    encoder.encode(
                      `data: ${JSON.stringify({
                        type: "content",
                        content: textContent,
                      })}\n\n`,
                    ),
                  );
                }
              }

              if (delta?.reasoning !== undefined && delta?.reasoning !== null) {
                fullReasoning += delta.reasoning;
                controller.enqueue(
                  encoder.encode(
                    `data: ${JSON.stringify({
                      type: "reasoning",
                      content: delta.reasoning,
                    })}\n\n`,
                  ),
                );
              }

              if (delta?.reasoning_details) {
                for (const detail of delta.reasoning_details) {
                  const index = detail.index ?? reasoningDetails.length;
                  if (!reasoningDetails[index]) {
                    reasoningDetails[index] = { ...detail };
                  } else {
                    if (detail.text)
                      reasoningDetails[index].text =
                        (reasoningDetails[index].text || "") + detail.text;
                    if (detail.summary)
                      reasoningDetails[index].summary =
                        (reasoningDetails[index].summary || "") +
                        detail.summary;
                    if (detail.data)
                      reasoningDetails[index].data =
                        (reasoningDetails[index].data || "") + detail.data;
                    if (detail.signature)
                      reasoningDetails[index].signature = detail.signature;
                  }
                }
                controller.enqueue(
                  encoder.encode(
                    `data: ${JSON.stringify({
                      type: "reasoning_details",
                      details: delta.reasoning_details,
                    })}\n\n`,
                  ),
                );
              }

              if (delta?.tool_calls) {
                console.log(
                  "[API] Raw delta.tool_calls chunk:",
                  JSON.stringify(delta.tool_calls),
                );
                for (const tc of delta.tool_calls) {
                  const index = tc.index ?? 0;
                  console.log(
                    `[API] Processing tool call chunk - index: ${index}, id: ${
                      tc.id
                    }, name: ${
                      tc.function?.name
                    }, args chunk: ${tc.function?.arguments?.substring(0, 100)}`,
                  );
                  if (!toolCalls[index]) {
                    toolCalls[index] = {
                      id: tc.id || "",
                      type: "function",
                      function: { name: "", arguments: "" },
                    };
                  }
                  if (tc.id) toolCalls[index].id = tc.id;
                  if (tc.function?.name)
                    toolCalls[index].function.name = tc.function.name;
                  if (tc.function?.arguments)
                    toolCalls[index].function.arguments +=
                      tc.function.arguments;
                  // Preserve extra_content for Google (contains thought_signature)
                  if (tc.extra_content) {
                    toolCalls[index].extra_content = tc.extra_content;
                  }
                }
                console.log(
                  "[API] Current toolCalls state:",
                  JSON.stringify(
                    toolCalls.map((tc) => ({
                      id: tc?.id,
                      name: tc?.function?.name,
                      argsLen: tc?.function?.arguments?.length,
                    })),
                  ),
                );
              }

              // Capture usage from final chunk
              if (parsed.usage) {
                promptTokens = parsed.usage.prompt_tokens || 0;
                completionTokens = parsed.usage.completion_tokens || 0;
                // DeepInfra provides estimated_cost in dollars
                if (parsed.usage.estimated_cost !== undefined) {
                  estimatedCost = parsed.usage.estimated_cost;
                }
              }

              // Check for natural completion - break out of stream processing
              if (
                finishReason === "stop" ||
                finishReason === "end_turn" ||
                finishReason === "length"
              ) {
                streamComplete = true;
                break;
              }
            } catch (e) {
              // Skip malformed JSON
            }
          }
        }

        // Process any remaining data in buffer after stream closes
        // This catches edge cases where the last chunk wasn't followed by a newline
        if (buffer.trim()) {
          const trimmed = buffer.trim();
          if (trimmed.startsWith("data:")) {
            const data = trimmed.slice(5).trim();
            if (data !== "[DONE]") {
              try {
                const parsed = JSON.parse(data);
                const delta = parsed.choices?.[0]?.delta;

                // Process any final tool call arguments in the buffer
                if (delta?.tool_calls) {
                  console.log(
                    "[API] Processing final buffer tool_calls:",
                    JSON.stringify(delta.tool_calls),
                  );
                  for (const tc of delta.tool_calls) {
                    const index = tc.index ?? 0;
                    if (!toolCalls[index]) {
                      toolCalls[index] = {
                        id: tc.id || "",
                        type: "function",
                        function: { name: "", arguments: "" },
                      };
                    }
                    if (tc.id) toolCalls[index].id = tc.id;
                    if (tc.function?.name)
                      toolCalls[index].function.name = tc.function.name;
                    if (tc.function?.arguments)
                      toolCalls[index].function.arguments +=
                        tc.function.arguments;
                    // Preserve extra_content for Google (contains thought_signature)
                    if (tc.extra_content) {
                      toolCalls[index].extra_content = tc.extra_content;
                    }
                  }
                }

                // Capture any final usage info
                if (parsed.usage) {
                  promptTokens = parsed.usage.prompt_tokens || 0;
                  completionTokens = parsed.usage.completion_tokens || 0;
                  if (parsed.usage.estimated_cost !== undefined) {
                    estimatedCost = parsed.usage.estimated_cost;
                  }
                }
              } catch {
                // Skip malformed JSON in final buffer
              }
            }
          }
        }

        // Parse tool call arguments
        console.log(
          "[API] Final toolCalls before parsing:",
          JSON.stringify(toolCalls),
        );
        const parsedToolCalls = toolCalls
          .filter((tc) => tc && tc.function?.name)
          .map((tc) => {
            try {
              const parsedArgs =
                typeof tc.function.arguments === "string"
                  ? JSON.parse(tc.function.arguments)
                  : tc.function.arguments;
              return {
                ...tc,
                function: {
                  ...tc.function,
                  arguments: parsedArgs,
                },
              };
            } catch (parseError) {
              // Log detailed error to help debug streaming issues
              console.error(
                `[API] Failed to parse tool arguments for ${tc.function?.name}:`,
                {
                  id: tc.id,
                  name: tc.function?.name,
                  argsLength: tc.function?.arguments?.length,
                  argsPreview: tc.function?.arguments?.substring(0, 200),
                  error:
                    parseError instanceof Error
                      ? parseError.message
                      : String(parseError),
                },
              );
              // Return with empty object as fallback to avoid downstream undefined errors
              return {
                ...tc,
                function: {
                  ...tc.function,
                  arguments: {},
                },
              };
            }
          });
        console.log(
          "[API] Parsed tool calls count:",
          parsedToolCalls.length,
          "names:",
          parsedToolCalls.map((tc) => tc.function?.name),
        );

        // Send tool calls if any
        if (parsedToolCalls.length > 0) {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: "tool_calls",
                toolCalls: parsedToolCalls,
              })}\n\n`,
            ),
          );
        }

        logger.action("AI generation (stream) complete", {
          model: modelConfig.model,
          provider: modelConfig.provider,
          promptTokens,
          completionTokens,
          hasToolCalls: parsedToolCalls.length > 0,
          estimatedCost,
        });

        // Send done event
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: "done",
              meta: {
                model: modelConfig.model,
                modelName: model,
                provider: modelConfig.provider,
                usage: {
                  promptTokens,
                  completionTokens,
                  totalTokens: promptTokens + completionTokens,
                },
              },
            })}\n\n`,
          ),
        );

        controller.close();
      } catch (error: any) {
        logger.error("Generation stream error", { error: error.message });
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: "error",
              error: error.message || "Internal server error",
            })}\n\n`,
          ),
        );
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-store, must-revalidate",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no", // Disable nginx buffering
    },
  });
}
