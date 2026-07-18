/**
 * Regenerate Section API (Streaming)
 *
 * Regenerates a specific section of an already-generated adventure.
 * Returns SSE stream with progress updates and regenerated content.
 */

import { NextRequest } from "next/server";
import { getModelConfig } from "@/app/misc/ai_prices";
import { logger } from "@/app/misc/logger";
import {
  BigAdventureConfig,
  BigAdventureResult,
  RegenerateSection,
  REGENERATE_SECTIONS,
  buildRegenerateSectionMessages,
  parseRegenerateSectionOutput,
} from "@/app/misc/big_adventure_ai";
import { convertMessagesToPrompt, NOVELAI_MODEL } from "@/app/misc/novelai";

// NovelAI API endpoint
const NOVELAI_API_URL = "https://text.novelai.net/oa/v1/completions";

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
  deepseekKey?: string;
  novelaiKey?: string;
  mistralKey?: string;
  deepinfraKey?: string;
}

function getApiKey(
  provider: "deepseek" | "openrouter" | "novelai" | "mistral" | "deepinfra",
  userProvidedOpenRouterKey?: string,
  userProvidedDeepseekKey?: string,
  novelaiKey?: string,
  mistralKey?: string,
  deepinfraKey?: string,
): string | null {
  if (provider === "deepseek") {
    return userProvidedDeepseekKey || null;
  } else if (provider === "novelai") {
    return novelaiKey || null;
  } else if (provider === "mistral") {
    return mistralKey || null;
  } else if (provider === "deepinfra") {
    return deepinfraKey || null;
  } else {
    return userProvidedOpenRouterKey || null;
  }
}

/**
 * Extract text content from delta, handling both plain strings
 * and Magistral's array format with thinking/text content parts.
 */
function extractTextContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (part?.type === "text" && typeof part.text === "string")
          return part.text;
        return "";
      })
      .join("");
  }
  if (content && typeof content === "object" && "text" in content) {
    const obj = content as { text?: unknown };
    if (typeof obj.text === "string") return obj.text;
  }
  return "";
}

// NovelAI-specific streaming function
async function streamNovelAIResponse(
  messages: { role: string; content: string }[],
  apiKey: string,
  maxOutputTokens: number,
  temperature: number,
  controller: ReadableStreamDefaultController,
  encoder: TextEncoder,
): Promise<{
  content: string;
  promptTokens: number;
  completionTokens: number;
}> {
  // Convert chat messages to prompt string for completions API
  const prompt = convertMessagesToPrompt(
    messages.map((m) => ({
      role: m.role as "system" | "user" | "assistant" | "tool",
      content: m.content,
    })),
  );

  const requestBody = {
    model: NOVELAI_MODEL,
    prompt: prompt,
    max_tokens: Math.min(maxOutputTokens, 2048), // NovelAI has lower limits
    temperature: temperature,
    top_p: 0.95,
    top_k: 40,
    stream: true,
  };

  const response = await fetch(NOVELAI_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      Accept: "text/event-stream",
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`NovelAI API error: ${response.status} - ${errorText}`);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("No response body from NovelAI");
  }

  const decoder = new TextDecoder();
  let buffer = "";
  let fullContent = "";
  // Estimate tokens (NovelAI doesn't return usage in streaming)
  const promptTokens = Math.ceil(prompt.length / 4);

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
      if (!data || data === "[DONE]") continue;

      try {
        const parsed = JSON.parse(data);
        // Completions API format: choices[0].text
        const textContent =
          parsed.choices?.[0]?.text ||
          parsed.choices?.[0]?.delta?.content ||
          parsed.text ||
          "";
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
      } catch {
        // Skip malformed JSON
      }
    }
  }

  const completionTokens = Math.ceil(fullContent.length / 4);

  return {
    content: fullContent,
    promptTokens,
    completionTokens,
  };
}

export async function POST(req: NextRequest) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        // Parse request (no auth required - BYOK only)
        const body: RequestBody = await req.json();
        const {
          section,
          config,
          existingResult,
          model = "Deepseek Chat",
          maxOutputTokens = 4000,
          additionalInstructions,
          openRouterKey,
          deepseekKey,
          novelaiKey,
          mistralKey,
          deepinfraKey,
        } = body;

        if (!section || !REGENERATE_SECTIONS[section]) {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: "error",
                error: "Invalid section specified",
              })}\n\n`,
            ),
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
              })}\n\n`,
            ),
          );
          controller.close();
          return;
        }

        // Get model config
        const modelConfig = getModelConfig(model);

        // Get API key
        const apiKey = getApiKey(
          modelConfig.provider as
            | "deepseek"
            | "openrouter"
            | "novelai"
            | "mistral"
            | "deepinfra",
          openRouterKey,
          deepseekKey,
          novelaiKey,
          mistralKey,
          deepinfraKey,
        );

        if (!apiKey) {
          const providerName =
            modelConfig.provider === "deepseek"
              ? "DeepSeek"
              : modelConfig.provider === "openrouter"
                ? "OpenRouter"
                : modelConfig.provider === "mistral"
                  ? "Mistral"
                  : modelConfig.provider === "deepinfra"
                    ? "DeepInfra"
                    : "NovelAI";
          const errorMessage = `${providerName} API key required. Please add your API key in Settings.`;

          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: "error",
                error: errorMessage,
              })}\n\n`,
            ),
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
            })}\n\n`,
          ),
        );

        // Build messages
        const messages = buildRegenerateSectionMessages(
          section,
          config,
          existingResult,
          additionalInstructions,
        );

        let fullContent = "";
        let promptTokens = 0;
        let completionTokens = 0;
        let estimatedCostDollars: number | undefined;

        // Handle NovelAI separately (uses completions API, not chat)
        if (modelConfig.provider === "novelai") {
          const result = await streamNovelAIResponse(
            messages,
            apiKey,
            maxOutputTokens,
            config.temperature ?? 0.8,
            controller,
            encoder,
          );
          fullContent = result.content;
          promptTokens = result.promptTokens;
          completionTokens = result.completionTokens;
        } else {
          // Standard OpenAI-compatible providers (OpenRouter, DeepSeek, Mistral, DeepInfra)
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
            headers["X-Title"] = "Your Story - Regenerate Section";
          }

          const requestBody = {
            model: modelConfig.model,
            messages: messages.map((m) => ({
              role: m.role,
              content: m.content,
            })),
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

                if (delta?.content !== undefined && delta?.content !== null) {
                  const textContent = extractTextContent(delta.content);
                  if (textContent) {
                    fullContent += textContent;
                    // Stream content chunks
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

                // Capture usage from final chunk
                if (parsed.usage) {
                  promptTokens = parsed.usage.prompt_tokens || 0;
                  completionTokens = parsed.usage.completion_tokens || 0;
                  // DeepInfra provides estimated_cost in dollars
                  if (parsed.usage.estimated_cost !== undefined) {
                    estimatedCostDollars = parsed.usage.estimated_cost;
                  }
                }
              } catch {
                // Skip malformed JSON
              }
            }
          }
        }

        // Parse the output
        const result = parseRegenerateSectionOutput(fullContent, section);

        if (!result) {
          throw new Error("Failed to parse regenerated content");
        }

        logger.action("Section regeneration complete", {
          model: modelConfig.model,
          provider: modelConfig.provider,
          section,
          promptTokens,
          completionTokens,
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
                isByok: true,
              },
            })}\n\n`,
          ),
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
      "X-Accel-Buffering": "no",
    },
  });
}
