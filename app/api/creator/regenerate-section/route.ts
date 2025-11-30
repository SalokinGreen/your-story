/**
 * Regenerate Section API (Streaming)
 *
 * Regenerates a specific section of an already-generated adventure.
 * Returns SSE stream with progress updates and regenerated content.
 */

import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  hasEnoughTokens,
  deductTokens,
  getUserTokenBalance,
} from "@/app/misc/tokens";
import { getModelConfig, calculateTokenCost } from "@/app/misc/ai_prices";
import { logger } from "@/app/misc/logger";
import {
  BigAdventureConfig,
  BigAdventureResult,
  RegenerateSection,
  REGENERATE_SECTIONS,
  buildRegenerateSectionMessages,
  parseRegenerateSectionOutput,
} from "@/app/misc/big_adventure_ai";

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export const runtime = "nodejs";
export const maxDuration = 120; // 2 minutes max for single section

interface RequestBody {
  section: RegenerateSection;
  config: BigAdventureConfig;
  existingResult: BigAdventureResult;
  model?: string;
  maxOutputTokens?: number;
  additionalInstructions?: string;
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
          section,
          config,
          existingResult,
          model = "Deepseek Chat",
          maxOutputTokens = 4000,
          additionalInstructions,
          openRouterKey,
        } = body;

        if (!section || !REGENERATE_SECTIONS[section]) {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: "error",
                error: "Invalid section specified",
              })}\n\n`
            )
          );
          controller.close();
          return;
        }

        if (!config || !existingResult) {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: "error",
                error: "Config and currentResult are required",
              })}\n\n`
            )
          );
          controller.close();
          return;
        }

        // Get model config
        const modelConfig = getModelConfig(model);

        // Estimate cost (roughly 3 tokens per section)
        const estimatedCost = 3;

        const hasTokens = await hasEnoughTokens(
          user.id,
          estimatedCost,
          supabase
        );
        if (!hasTokens) {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: "error",
                error: `Insufficient tokens. Estimated cost: ${estimatedCost} coins`,
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

        const sectionInfo = REGENERATE_SECTIONS[section];

        // Send start event
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: "start",
              section,
              sectionName: sectionInfo.name,
            })}\n\n`
          )
        );

        // Build messages
        const messages = buildRegenerateSectionMessages(
          section,
          config,
          existingResult,
          additionalInstructions
        );

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
          headers["X-Title"] = "Your Story - Regenerate Section";
        }

        const requestBody = {
          model: modelConfig.model,
          messages: messages.map((m) => ({ role: m.role, content: m.content })),
          temperature: config.temperature ?? 0.8,
          max_tokens: maxOutputTokens,
          stream: true,
        };

        const response = await fetch(endpoint, {
          method: "POST",
          headers,
          body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`AI API error: ${response.status} - ${errorText}`);
        }

        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error("No response body");
        }

        const decoder = new TextDecoder();
        let buffer = "";
        let fullContent = "";
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
                // Stream content chunks
                controller.enqueue(
                  encoder.encode(
                    `data: ${JSON.stringify({
                      type: "content",
                      content: delta.content,
                    })}\n\n`
                  )
                );
              }

              // Capture usage from final chunk
              if (parsed.usage) {
                promptTokens = parsed.usage.prompt_tokens || 0;
                completionTokens = parsed.usage.completion_tokens || 0;
              }
            } catch {
              // Skip malformed JSON
            }
          }
        }

        // Parse the output
        const result = parseRegenerateSectionOutput(fullContent, section);

        if (!result) {
          throw new Error("Failed to parse regenerated content");
        }

        // Calculate token cost
        const tokenCost = calculateTokenCost(
          model,
          promptTokens,
          completionTokens
        );

        // Deduct tokens
        await deductTokens(user.id, tokenCost, supabase);
        const balance = (await getUserTokenBalance(user.id, supabase)) || {
          total: 0,
        };

        logger.action("Section regeneration complete", {
          userId: user.id,
          model: modelConfig.model,
          provider: modelConfig.provider,
          section,
          promptTokens,
          completionTokens,
          tokenCost,
        });

        // Send final result
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: "done",
              section,
              result,
              rawContent: fullContent,
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
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        logger.error("Section regeneration error", {
          error: errorMessage,
        });
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: "error",
              error: errorMessage || "Internal server error",
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
      "X-Accel-Buffering": "no",
    },
  });
}
