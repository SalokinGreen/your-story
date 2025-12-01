/**
 * Extend Section API (Streaming)
 *
 * Adds more content to a specific section of an already-generated adventure.
 * Returns SSE stream with progress updates and new content that gets merged.
 */

import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getModelConfig } from "@/app/misc/ai_prices";
import { logger } from "@/app/misc/logger";
import {
  BigAdventureConfig,
  BigAdventureResult,
  RegenerateSection,
  REGENERATE_SECTIONS,
  buildExtendSectionMessages,
  parseExtendSectionOutput,
  canExtendSection,
} from "@/app/misc/big_adventure_ai";

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export const runtime = "nodejs";
export const maxDuration = 120; // 2 minutes max for single section

interface RequestBody {
  section: RegenerateSection;
  config: BigAdventureConfig;
  existingResult: BigAdventureResult;
  count?: number;
  model?: string;
  maxOutputTokens?: number;
  openRouterKey?: string;
  deepseekKey?: string;
  novelaiKey?: string;
}

function getApiKey(
  provider: "deepseek" | "openrouter" | "novelai",
  userProvidedOpenRouterKey?: string,
  userProvidedDeepseekKey?: string,
  novelaiKey?: string
): string | null {
  if (provider === "deepseek") {
    return userProvidedDeepseekKey || null;
  } else if (provider === "novelai") {
    return novelaiKey || null;
  } else {
    return userProvidedOpenRouterKey || null;
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
          count = 3,
          model = "Deepseek Chat",
          maxOutputTokens = 2000,
          openRouterKey,
          deepseekKey,
          novelaiKey,
        } = body;

        // Validate section
        if (!section || !REGENERATE_SECTIONS[section]) {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: "error",
                error: `Invalid section: ${section}`,
              })}\n\n`
            )
          );
          controller.close();
          return;
        }

        // Check if section supports extension
        if (!canExtendSection(section)) {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: "error",
                error: `Section "${section}" does not support "Add More" functionality`,
              })}\n\n`
            )
          );
          controller.close();
          return;
        }

        const sectionInfo = REGENERATE_SECTIONS[section];
        logger.info("Extend section started", {
          section,
          count,
          model,
          userId: user.id,
        });

        // Get model config - all providers use BYOK
        const modelConfig = getModelConfig(model);
        const apiKey = getApiKey(
          modelConfig.provider as "deepseek" | "openrouter" | "novelai",
          openRouterKey,
          deepseekKey,
          novelaiKey
        );

        if (!apiKey) {
          const providerName =
            modelConfig.provider === "deepseek"
              ? "DeepSeek"
              : modelConfig.provider === "openrouter"
              ? "OpenRouter"
              : "NovelAI";
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: "error",
                error: `${providerName} API key required. Please add your API key in Settings.`,
              })}\n\n`
            )
          );
          controller.close();
          return;
        }

        // Build messages
        const messages = buildExtendSectionMessages(
          config,
          section,
          existingResult,
          count
        );

        // Send start event
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: "extend_start",
              section,
              sectionName: sectionInfo.name,
              count,
            })}\n\n`
          )
        );

        // Make API request
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
          headers["X-Title"] = "Your Story - Extend Section";
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
              const json = JSON.parse(data);

              // Handle token usage
              if (json.usage) {
                promptTokens = json.usage.prompt_tokens || 0;
                completionTokens = json.usage.completion_tokens || 0;
              }

              // Handle content
              const delta = json.choices?.[0]?.delta;
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
            } catch {
              // Skip non-JSON lines
            }
          }
        }

        // Parse the result and merge with existing
        const parsedResult = parseExtendSectionOutput(
          fullContent,
          section,
          existingResult
        );

        // All providers use BYOK - no token billing

        // Send complete event
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: "extend_complete",
              section,
              sectionName: sectionInfo.name,
              result: parsedResult,
              rawContent: fullContent,
              isByok: true,
            })}\n\n`
          )
        );

        logger.info("Extend section complete", {
          section,
          count,
        });
      } catch (error) {
        logger.error("Extend section error", { error });
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: "error",
              error: error instanceof Error ? error.message : "Unknown error",
            })}\n\n`
          )
        );
      } finally {
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
