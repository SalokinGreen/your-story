/**
 * Generic AI Generation API (Streaming)
 *
 * A thin, stateless AI proxy endpoint with SSE streaming.
 * Receives pre-built messages and config, forwards to AI provider,
 * streams raw response. All context building and tool execution
 * happens on the frontend.
 *
 * Provider modes:
 * - BYOK (OpenRouter/DeepSeek): Users provide their own API keys, no token billing
 * - Coins (Mistral/DeepInfra): Server-side API key, users pay with coins
 *
 * Request: { messages, tools?, model, maxTokens, openRouterKey?, deepseekKey? }
 * Response: SSE stream with events: content, tool_calls, done, error
 */

import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  getModelConfig,
  calculateTokenCost,
  calculateCostFromEstimatedCost,
  AIModelConfig,
} from "@/app/misc/ai_prices";
import { deductTokens, getUserTokenBalance } from "@/app/misc/tokens";
import { logger } from "@/app/misc/logger";
import { getUserSettings, CustomModel } from "@/app/misc/user_settings";

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export const runtime = "nodejs";
export const maxDuration = 60; // Allow up to 60 seconds for streaming

interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
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

function getApiKey(
  provider: "deepseek" | "openrouter" | "mistral" | "deepinfra",
  openRouterKey?: string,
  deepseekKey?: string
): string | null {
  if (provider === "deepseek") {
    return deepseekKey || null;
  } else if (provider === "mistral") {
    // Mistral uses server-side API key - users pay with coins
    return process.env.MISTRAL_API_KEY || null;
  } else if (provider === "deepinfra") {
    // DeepInfra uses server-side API key - users pay with coins
    return process.env.DEEPINFRA_API_KEY || null;
  } else {
    return openRouterKey || null;
  }
}

/**
 * Check if a string looks like a UUID (custom model ID)
 */
function isUUID(str: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    str
  );
}

/**
 * Resolve a model key to its config, handling custom models stored in user settings
 */
async function resolveModelConfig(
  modelKey: string,
  userId: string,
  supabase: any // eslint-disable-line @typescript-eslint/no-explicit-any
): Promise<{ config: AIModelConfig; actualModelId: string }> {
  // If it's a known model, use it directly
  if (!isUUID(modelKey)) {
    const config = getModelConfig(modelKey);
    return { config, actualModelId: config.model };
  }

  // It's a UUID - look up custom model from user settings
  const settings = await getUserSettings(userId, supabase);
  const customModels = settings?.custom_models || [];
  const customModel = customModels.find((m: CustomModel) => m.id === modelKey);

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

  // UUID not found in custom models - fall back to default
  console.warn(
    `Custom model UUID "${modelKey}" not found in user settings, falling back to default`
  );
  const config = getModelConfig(modelKey); // Will return DeepSeek fallback
  return { config, actualModelId: config.model };
}

export async function POST(req: NextRequest) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        // Validate auth
        const authHeader = req.headers.get("authorization");
        if (!authHeader) {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: "error",
                error: "Unauthorized",
              })}\n\n`
            )
          );
          controller.close();
          return;
        }

        const token = authHeader.replace("Bearer ", "");
        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        const {
          data: { user },
          error: authError,
        } = await supabase.auth.getUser(token);

        if (authError || !user) {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: "error",
                error: "Unauthorized",
              })}\n\n`
            )
          );
          controller.close();
          return;
        }

        // Parse request
        const body: RequestBody = await req.json();
        const {
          messages,
          tools,
          model = "Gemini 2.5 Flash",
          maxTokens = 4000,
          temperature = 0.7,
          openRouterKey,
          deepseekKey,
        } = body;

        if (!messages || messages.length === 0) {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: "error",
                error: "Messages are required",
              })}\n\n`
            )
          );
          controller.close();
          return;
        }

        // Debug: Log received maxTokens
        console.log(
          "[API] generate-stream received - maxTokens:",
          maxTokens,
          "model:",
          model
        );

        // Get model config (resolves custom models from user settings)
        const { config: modelConfig, actualModelId } = await resolveModelConfig(
          model,
          user.id,
          supabase
        );

        // Get API key from user's provided keys (or server key for Mistral/DeepInfra)
        const apiKey = getApiKey(
          modelConfig.provider as
            | "deepseek"
            | "openrouter"
            | "mistral"
            | "deepinfra",
          openRouterKey,
          deepseekKey
        );

        if (!apiKey) {
          let errorMessage: string;
          if (modelConfig.provider === "mistral") {
            errorMessage =
              "Mistral API is not configured on the server. Please contact support.";
          } else if (modelConfig.provider === "deepinfra") {
            errorMessage =
              "DeepInfra API is not configured on the server. Please contact support.";
          } else {
            const providerNames: Record<string, string> = {
              deepseek: "DeepSeek",
              openrouter: "OpenRouter",
            };
            const providerName =
              providerNames[modelConfig.provider] || modelConfig.provider;
            errorMessage = `No API key configured for ${providerName}. Please add your API key in Settings.`;
          }
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: "error",
                error: errorMessage,
                code: "NO_API_KEY",
              })}\n\n`
            )
          );
          controller.close();
          return;
        }

        // Check token balance for Coins mode providers (Mistral/DeepInfra) before making request
        if (
          modelConfig.provider === "mistral" ||
          modelConfig.provider === "deepinfra"
        ) {
          const balance = await getUserTokenBalance(user.id, supabase);
          // Estimate minimum cost (at least 1 coin)
          const estimatedCost = Math.max(1, modelConfig.cost || 1);
          const currentBalance = balance?.total ?? 0;
          if (currentBalance < estimatedCost) {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  type: "error",
                  error: `Insufficient coins. You need at least ${estimatedCost} coins for this model. Current balance: ${currentBalance}`,
                  code: "INSUFFICIENT_BALANCE",
                })}\n\n`
              )
            );
            controller.close();
            return;
          }
        }

        // Build request
        let endpoint: string;
        if (modelConfig.provider === "deepseek") {
          endpoint = "https://api.deepseek.com/chat/completions";
        } else if (modelConfig.provider === "mistral") {
          endpoint = "https://api.mistral.ai/v1/chat/completions";
        } else if (modelConfig.provider === "deepinfra") {
          endpoint = "https://api.deepinfra.com/v1/openai/chat/completions";
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

        const requestBody: any = {
          model: modelConfig.model,
          messages: messages.map((m) => {
            const msg: any = { role: m.role, content: m.content || "" };
            if (m.tool_calls) {
              // Re-serialize tool call arguments to strings if they're objects
              // (AI APIs expect arguments as JSON strings, not parsed objects)
              msg.tool_calls = m.tool_calls.map((tc: any) => ({
                ...tc,
                function: {
                  ...tc.function,
                  arguments:
                    typeof tc.function.arguments === "string"
                      ? tc.function.arguments
                      : JSON.stringify(tc.function.arguments),
                },
              }));
            }
            if (m.tool_call_id) msg.tool_call_id = m.tool_call_id;
            return msg;
          }),
          temperature,
          max_tokens: maxTokens,
          stream: true,
          // Request usage statistics in streaming mode (required for Mistral/OpenAI)
          stream_options: { include_usage: true },
        };

        if (tools && tools.length > 0) {
          requestBody.tools = tools;
          requestBody.tool_choice = "auto";
        }

        // Debug: Log the max_tokens being sent to provider
        console.log(
          "[API] Sending to",
          modelConfig.provider,
          "- max_tokens:",
          requestBody.max_tokens
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
              })}\n\n`
            )
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
              })}\n\n`
            )
          );
          controller.close();
          return;
        }

        const decoder = new TextDecoder();
        let buffer = "";
        let fullContent = "";
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
                      })}\n\n`
                    )
                  );
                }
              }

              if (delta?.tool_calls) {
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
                }
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

        // Parse tool call arguments
        const parsedToolCalls = toolCalls
          .filter((tc) => tc && tc.function?.name)
          .map((tc) => {
            try {
              return {
                ...tc,
                function: {
                  ...tc.function,
                  arguments:
                    typeof tc.function.arguments === "string"
                      ? JSON.parse(tc.function.arguments)
                      : tc.function.arguments,
                },
              };
            } catch {
              return tc;
            }
          });

        // Send tool calls if any
        if (parsedToolCalls.length > 0) {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: "tool_calls",
                toolCalls: parsedToolCalls,
              })}\n\n`
            )
          );
        }

        logger.action("AI generation (stream) complete", {
          userId: user.id,
          model: modelConfig.model,
          provider: modelConfig.provider,
          promptTokens,
          completionTokens,
          hasToolCalls: parsedToolCalls.length > 0,
          estimatedCost,
        });

        // Deduct tokens for Coins mode providers (Mistral/DeepInfra) - other providers are BYOK
        let tokenCost = 0;
        let newBalance: number | undefined;
        if (
          (modelConfig.provider === "mistral" ||
            modelConfig.provider === "deepinfra") &&
          (promptTokens > 0 ||
            completionTokens > 0 ||
            estimatedCost !== undefined)
        ) {
          // Use estimated_cost from DeepInfra if available, otherwise calculate from tokens
          if (
            modelConfig.provider === "deepinfra" &&
            estimatedCost !== undefined
          ) {
            tokenCost = calculateCostFromEstimatedCost(estimatedCost);
          } else {
            tokenCost = calculateTokenCost(
              model,
              promptTokens,
              completionTokens
            );
          }
          const deductResult = await deductTokens(user.id, tokenCost, supabase);
          if (!deductResult.success) {
            logger.warn("Failed to deduct tokens for generation", {
              userId: user.id,
              provider: modelConfig.provider,
              tokenCost,
              error: deductResult.error,
            });
          } else {
            const balanceResult = await getUserTokenBalance(user.id, supabase);
            newBalance = balanceResult?.total;
          }
        }

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
                tokenCost: tokenCost > 0 ? tokenCost : undefined,
                balance: newBalance,
              },
            })}\n\n`
          )
        );

        controller.close();
      } catch (error: any) {
        logger.error("Generation stream error", { error: error.message });
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: "error",
              error: error.message || "Internal server error",
            })}\n\n`
          )
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
