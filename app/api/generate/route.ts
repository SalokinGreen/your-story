/**
 * Generic AI Generation API
 *
 * A thin, stateless AI proxy endpoint. Receives pre-built messages and config,
 * forwards to AI provider, returns raw response. All context building and
 * tool execution happens on the frontend.
 *
 * BYOK only: users always provide their own API key for whichever provider
 * they select (OpenRouter, DeepSeek, Google, Mistral, DeepInfra).
 *
 * Request: { messages, tools?, model, maxTokens, openRouterKey?, deepseekKey?,
 *            googleKey?, mistralKey?, deepinfraKey?, customModel? }
 * Response: { content, toolCalls?, meta }
 */

import { NextRequest, NextResponse } from "next/server";
import { getModelConfig, AIModelConfig } from "@/app/misc/ai_prices";
import { logger } from "@/app/misc/logger";
import { CustomModel } from "@/app/misc/user_settings";

export const runtime = "nodejs";
export const maxDuration = 60; // Allow up to 60 seconds for generation

interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  reasoning?: string;
  reasoning_details?: any[];
  tool_calls?: any[];
  tool_call_id?: string;
}

interface ToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string | Record<string, any>;
  };
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
      reasoning_details?: any[];
      tool_calls?: ToolCall[];
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
  // Items
  "add_item",
  "remove_item",
  // Core state
  "modify_momentum",
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

async function callAI(
  messages: ChatMessage[],
  provider: "deepseek" | "openrouter" | "mistral" | "deepinfra" | "google",
  model: string,
  apiKey: string,
  maxTokens: number,
  temperature: number,
  tools?: any[],
): Promise<AIResponse> {
  // Check if we have a prefill (trailing assistant message)
  const hasPrefill =
    messages.length > 0 && messages[messages.length - 1].role === "assistant";
  const hasTools = tools && tools.length > 0;

  // Debug logging
  console.log(
    `[callAI] provider: ${provider}, hasPrefill: ${hasPrefill}, hasTools: ${hasTools}, toolCount: ${
      tools?.length || 0
    }`,
  );

  let endpoint: string;
  if (provider === "deepseek") {
    // Use beta endpoint for prefill support (prefix: true requires beta API)
    // BUT: DeepSeek beta doesn't support prefix + function calling together
    // So only use beta for non-tool calls (story generation)
    const useBeta = hasPrefill && !hasTools;
    endpoint = useBeta
      ? "https://api.deepseek.com/beta/chat/completions"
      : "https://api.deepseek.com/chat/completions";
    console.log(
      `[callAI] DeepSeek endpoint: ${
        useBeta ? "BETA" : "REGULAR"
      } - ${endpoint}`,
    );
  } else if (provider === "mistral") {
    endpoint = "https://api.mistral.ai/v1/chat/completions";
  } else if (provider === "deepinfra") {
    endpoint = "https://api.deepinfra.com/v1/openai/chat/completions";
  } else if (provider === "google") {
    endpoint =
      "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
  } else {
    endpoint = "https://openrouter.ai/api/v1/chat/completions";
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  };

  if (provider === "openrouter") {
    headers["HTTP-Referer"] = process.env.NEXT_PUBLIC_SITE_URL || "";
    headers["X-Title"] = "Your Story";
  }

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
    console.log(`[API] Stripped prefill for ${provider} tool calling`);
  }

  // For Mistral: normalize tool call IDs to match their strict format requirement
  // Mistral requires exactly 9 alphanumeric characters (a-z, A-Z, 0-9)
  if (provider === "mistral") {
    processedMessages = normalizeMistralToolCallIds(processedMessages);
  }

  const requestBody: any = {
    model,
    messages: processedMessages.map((m, index) => {
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
              (provider === "google" || provider === "openrouter")
            ) {
              mapped.extra_content = tc.extra_content;
            }

            // FIX: Cross-populate extra_content from reasoning_details if missing from tool call
            // This is a "belts and suspenders" fix for Google models on OpenRouter
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
        ((provider === "mistral" && !hasTools) ||
          (provider === "deepseek" && !hasTools))
      ) {
        msg.prefix = true;
      }
      return msg;
    }),
    temperature,
    max_tokens: maxTokens,
  };

  if (tools && tools.length > 0) {
    // Google/Gemini has strict schema complexity limits - filter to essential tools
    const toolsToUse =
      provider === "google" ? filterToolsForGoogle(tools) : tools;
    requestBody.tools = toolsToUse;
    // Google/Gemini needs tool_choice: "required" to actually invoke tools
    // ("auto" often results in empty responses)
    requestBody.tool_choice = provider === "google" ? "required" : "auto";
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(
      `[callAI] ${provider} API error: ${response.status} ${response.statusText}`,
      errorText,
    );
    throw new Error(
      `AI API request failed: ${response.status} ${response.statusText} - ${errorText}`,
    );
  }

  return await response.json();
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
): AIModelConfig {
  // If it's a known model, use it directly
  if (!isUUID(modelKey)) {
    return getModelConfig(modelKey);
  }

  if (customModel) {
    // Found custom model - create config for OpenRouter
    return {
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
  }

  // UUID not found in the request - fall back to default
  console.warn(
    `Custom model UUID "${modelKey}" was not provided in the request, falling back to default`,
  );
  return getModelConfig(modelKey);
}

export async function POST(req: NextRequest) {
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
    } = body;

    const model = rawModel && rawModel.trim() ? rawModel : "Deepseek Chat";

    // Log model for debugging
    console.log(
      `[API Generate] Received model: "${model}" (from request: ${
        body.model ? `"${body.model}"` : "undefined/empty"
      })`,
    );

    if (!messages || messages.length === 0) {
      return NextResponse.json(
        { error: "Messages are required" },
        { status: 400 },
      );
    }

    // Get model config (custom models are sent directly from the client)
    const modelConfig = resolveModelConfig(model, customModel);

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
      return NextResponse.json(
        {
          error: `No API key configured for ${providerName}. Please add your API key in Settings.`,
          code: "NO_API_KEY",
        },
        { status: 400 },
      );
    }

    // Call AI
    const aiResponse = await callAI(
      messages,
      modelConfig.provider as
        | "deepseek"
        | "openrouter"
        | "mistral"
        | "deepinfra"
        | "google",
      modelConfig.model,
      apiKey,
      maxTokens,
      temperature,
      tools,
    );

    const content = aiResponse.choices[0]?.message?.content || "";
    const reasoning = aiResponse.choices[0]?.message?.reasoning || "";
    const reasoning_details =
      aiResponse.choices[0]?.message?.reasoning_details || [];
    const toolCalls = aiResponse.choices[0]?.message?.tool_calls;
    const usage = aiResponse.usage || {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
    };

    logger.action("AI generation complete", {
      model: modelConfig.model,
      provider: modelConfig.provider,
      promptTokens: usage.prompt_tokens,
      completionTokens: usage.completion_tokens,
      hasToolCalls: !!toolCalls,
    });

    return NextResponse.json({
      content,
      reasoning,
      reasoning_details,
      toolCalls: toolCalls || [],
      meta: {
        model: modelConfig.model,
        modelName: model,
        provider: modelConfig.provider,
        usage: {
          promptTokens: usage.prompt_tokens,
          completionTokens: usage.completion_tokens,
          totalTokens: usage.total_tokens,
        },
      },
    });
  } catch (error: any) {
    console.error("[API Generate] Error:", error.message, error.stack);
    logger.error("Generation API error", { error: error.message });
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 },
    );
  }
}
