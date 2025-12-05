/**
 * NovelAI Generation API (Streaming)
 *
 * BYOK-only proxy endpoint for NovelAI story generation.
 * Uses NovelAI's OpenAI-compatible completions API (not chat).
 * No token deduction - user provides their own API key.
 *
 * Request: { messages, novelaiKey, maxTokens, temperature }
 * Response: SSE stream with events: content, done, error
 */

import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { estimateTokens } from "@/app/misc/ai_staged";
import { logger } from "@/app/misc/logger";
import { NOVELAI_MODEL, convertMessagesToPrompt } from "@/app/misc/novelai";

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export const runtime = "nodejs";
export const maxDuration = 60;

// NovelAI's OpenAI-compatible completions endpoint (not chat)
const NOVELAI_API_URL = "https://text.novelai.net/oa/v1/completions";

interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: any[];
  tool_call_id?: string;
}

interface RequestBody {
  messages: ChatMessage[];
  novelaiKey: string;
  maxTokens?: number;
  temperature?: number;
}

export async function POST(req: NextRequest) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        // Validate auth (still require login, but don't deduct tokens)
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
          novelaiKey,
          maxTokens = 2000,
          temperature = 1,
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

        if (!novelaiKey) {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: "error",
                error: "NovelAI API key is required (BYOK only)",
              })}\n\n`
            )
          );
          controller.close();
          return;
        }

        // Convert messages to a single prompt string for completions API
        const prompt = convertMessagesToPrompt(messages);
        const promptTokens = estimateTokens(prompt);

        logger.action("NovelAI generation (completions)", {
          promptTokens,
          maxTokens,
          temperature,
          promptLength: prompt.length,
        });

        // Build completions request for NovelAI
        // Uses prompt string, not messages array
        const novelaiRequest = {
          model: NOVELAI_MODEL,
          prompt: prompt,
          max_tokens: Math.min(maxTokens, 2048),
          temperature: temperature,
          top_p: 0.95,
          top_k: 40,
          stream: true,
          // Stop before GM state updates (handled by tools stage)
          stop: ["[GM State Update]", "[GM State"],
        };

        logger.action("NovelAI request body", {
          model: novelaiRequest.model,
          promptLength: prompt.length,
          max_tokens: novelaiRequest.max_tokens,
        });

        // Call NovelAI API
        const response = await fetch(NOVELAI_API_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${novelaiKey}`,
            Accept: "text/event-stream",
          },
          body: JSON.stringify(novelaiRequest),
        });

        if (!response.ok) {
          const errorText = await response.text().catch(() => "Unknown error");
          logger.error("NovelAI API error", {
            status: response.status,
            error: errorText,
          });
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: "error",
                error: `NovelAI API error: ${response.status} - ${errorText}`,
              })}\n\n`
            )
          );
          controller.close();
          return;
        }

        // Stream the response
        const reader = response.body?.getReader();
        if (!reader) {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: "error",
                error: "No response body from NovelAI",
              })}\n\n`
            )
          );
          controller.close();
          return;
        }

        const decoder = new TextDecoder();
        let buffer = "";
        let fullContent = "";

        while (true) {
          const { done, value } = await reader.read();

          if (value) {
            buffer += decoder.decode(value, { stream: true });

            // Parse NovelAI SSE events
            // NovelAI sends: data:{"token":"..."}
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed || !trimmed.startsWith("data:")) continue;

              const data = trimmed.slice(5).trim();
              if (!data || data === "[DONE]") continue;

              try {
                const parsed = JSON.parse(data);
                // Completions API format: choices[0].text (streaming)
                // Also try delta.content for compatibility
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
                      })}\n\n`
                    )
                  );
                }
              } catch {
                // Skip malformed JSON
              }
            }
          }

          if (done) {
            // Process any remaining buffer
            if (buffer.trim()) {
              const trimmed = buffer.trim();
              if (trimmed.startsWith("data:")) {
                const data = trimmed.slice(5).trim();
                if (data && data !== "[DONE]") {
                  try {
                    const parsed = JSON.parse(data);
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
                          })}\n\n`
                        )
                      );
                    }
                  } catch {
                    // Skip malformed JSON
                  }
                }
              }
            }
            break;
          }
        }

        // Estimate completion tokens
        const completionTokens = estimateTokens(fullContent);

        // Send done event (no token cost for BYOK)
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: "done",
              meta: {
                model: NOVELAI_MODEL,
                modelName: "NovelAI GLM-4-6",
                provider: "novelai",
                usage: {
                  promptTokens,
                  completionTokens,
                  totalTokens: promptTokens + completionTokens,
                },
                tokenCost: 0, // BYOK - no cost
                balance: -1, // Indicates BYOK, balance not affected
              },
            })}\n\n`
          )
        );

        controller.close();
      } catch (error: any) {
        logger.error("NovelAI generation error", { error: error.message });
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: "error",
              error: error.message || "NovelAI generation failed",
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
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
