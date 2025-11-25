/**
 * Generic AI Generation API (Streaming)
 *
 * A thin, stateless AI proxy endpoint with SSE streaming.
 * Receives pre-built messages and config, forwards to AI provider,
 * streams raw response. All context building and tool execution
 * happens on the frontend.
 *
 * Request: { messages, tools?, model, maxTokens }
 * Response: SSE stream with events: content, tool_calls, done, error
 */

import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  hasEnoughTokens,
  deductTokens,
  getUserTokenBalance,
} from "@/app/misc/tokens";
import { getModelConfig } from "@/app/misc/ai_prices";
import { logger } from "@/app/misc/logger";

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export const runtime = "nodejs";

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
}

function getApiKey(
  provider: "deepseek" | "openrouter",
  userProvidedKey?: string
): string {
  if (provider === "deepseek") {
    return process.env.DEEPSEEK_API_KEY || "";
  } else {
    return userProvidedKey || process.env.OPENROUTER_API_KEY || "";
  }
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
          model = "Prometheus",
          maxTokens = 4000,
          temperature = 0.7,
          openRouterKey,
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

        // Get model config
        const modelConfig = getModelConfig(model);

        // Check token balance
        const hasTokens = await hasEnoughTokens(user.id, 1, supabase);
        if (!hasTokens) {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: "error",
                error: "Insufficient tokens",
              })}\n\n`
            )
          );
          controller.close();
          return;
        }

        // Get API key
        const apiKey = getApiKey(
          modelConfig.provider as "deepseek" | "openrouter",
          openRouterKey
        );

        if (!apiKey) {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: "error",
                error: "API key not configured",
              })}\n\n`
            )
          );
          controller.close();
          return;
        }

        // Build request
        const endpoint =
          modelConfig.provider === "deepseek"
            ? "https://api.deepseek.com/chat/completions"
            : "https://openrouter.ai/api/v1/chat/completions";

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
            const msg: any = { role: m.role, content: m.content };
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
        };

        if (tools && tools.length > 0) {
          requestBody.tools = tools;
          requestBody.tool_choice = "auto";
        }

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

        // Process stream
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith("data:")) continue;

            const data = trimmed.slice(5).trim();
            if (data === "[DONE]") continue;

            try {
              const parsed = JSON.parse(data);
              const delta = parsed.choices?.[0]?.delta;

              if (delta?.content) {
                fullContent += delta.content;
                controller.enqueue(
                  encoder.encode(
                    `data: ${JSON.stringify({
                      type: "content",
                      content: delta.content,
                    })}\n\n`
                  )
                );
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

        // Calculate token cost
        const inputCost = (promptTokens / 1_000_000) * modelConfig.inputPrice;
        const outputCost =
          (completionTokens / 1_000_000) * modelConfig.outputPrice;
        const totalCost = inputCost + outputCost;
        const tokenCost = Math.max(1, Math.ceil(totalCost * 100));

        // Deduct tokens
        await deductTokens(user.id, tokenCost, supabase);
        const balance = (await getUserTokenBalance(user.id, supabase)) || {
          total: 0,
        };

        logger.action("AI generation (stream) complete", {
          userId: user.id,
          model: modelConfig.model,
          provider: modelConfig.provider,
          promptTokens,
          completionTokens,
          tokenCost,
          hasToolCalls: parsedToolCalls.length > 0,
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
                tokenCost,
                balance: balance.total,
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
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
