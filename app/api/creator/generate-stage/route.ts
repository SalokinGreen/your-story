/**
 * Single Stage Generator API (Streaming)
 *
 * Generates ONE stage of an adventure at a time.
 * This endpoint is designed to work within Vercel's timeout limits by:
 * 1. Processing only one stage per request
 * 2. Sending heartbeat events to keep the connection alive
 * 3. Supporting partial content recovery on timeout
 *
 * The client orchestrates calling this endpoint for each stage sequentially.
 */

import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { logger } from "@/app/misc/logger";
import {
  BigAdventureConfig,
  BigAdventureResult,
  GenerationStage,
  getSubstageConfig,
  getStageInfo,
  buildBigAdventureMessages,
  parseBigAdventureStageOutput,
  detectIncompleteJSON,
} from "@/app/misc/big_adventure_ai";
import { getModelConfig } from "@/app/misc/ai_prices";
import { convertMessagesToPrompt, NOVELAI_MODEL } from "@/app/misc/novelai";

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// NovelAI API endpoint

// Minimum content length required to attempt JSON wrap-up
const MIN_CONTENT_FOR_WRAPUP = 500;

/**
 * Get minimal fallback JSON for a stage when content is too short to repair.
 * Returns a valid JSON that will parse successfully but with empty/minimal data.
 */
function getMinimalFallbackJSON(stage: GenerationStage): string {
  switch (stage) {
    case "core":
      return JSON.stringify({
        title: "Untitled Adventure",
        shortDescription: "An adventure awaits",
        description: "Your adventure begins here.",
        story_name: "Untitled Story",
        premise: "A new journey begins.",
        player_name: "Adventurer",
        player_summary: "A brave soul seeking adventure.",
        intro: "Your story is about to begin...",
        author_notes: "",
      });
    case "mechanics":
      return JSON.stringify({
        stats: [],
        resources: [],
        abilities: [],
        variables: [],
      });
    case "content-lore":
      return JSON.stringify({
        lore: [],
      });
    case "content-achievements":
      return JSON.stringify({
        achievements: [],
        quests: [],
      });
    case "content-items":
      return JSON.stringify({
        inventory: [],
        relationships: [],
      });
    case "advanced-presets":
      return JSON.stringify({
        presets: [],
      });
    case "advanced-tables":
      return JSON.stringify({
        agmtState: null,
        customTables: [],
      });
    case "advanced-other":
      return JSON.stringify({
        upgradeSettings: null,
        startingChoices: [],
      });
    default:
      return "{}";
  }
}
const NOVELAI_API_URL = "https://text.novelai.net/oa/v1/completions";

export const runtime = "nodejs";
// Set to 300s (5 min) which is the max for Hobby tier
// Pro tier can extend to 800s by changing this value
export const maxDuration = 300;

// Heartbeat interval to keep connection alive (every 25 seconds)
const HEARTBEAT_INTERVAL_MS = 25000;

interface RequestBody {
  config: BigAdventureConfig;
  stage: GenerationStage;
  previousResults?: Partial<BigAdventureResult>;
  model?: string;
  openRouterKey?: string;
  deepseekKey?: string;
  novelaiKey?: string;
  // For continuation after timeout - the partial content generated so far
  continueFrom?: string;
  // Signal to wrap up the current stage early
  finishEarly?: boolean;
}

function getApiKey(
  provider: "deepseek" | "openrouter" | "novelai" | "mistral" | "deepinfra",
  userProvidedOpenRouterKey?: string,
  userProvidedDeepseekKey?: string,
  novelaiKey?: string
): string | null {
  if (provider === "deepseek") {
    return userProvidedDeepseekKey || null;
  } else if (provider === "novelai") {
    return novelaiKey || null;
  } else if (provider === "mistral") {
    return process.env.MISTRAL_API_KEY || null;
  } else if (provider === "deepinfra") {
    return process.env.DEEPINFRA_API_KEY || null;
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
        if (part && typeof part === "object" && "text" in part) {
          return (part as { text?: string }).text || "";
        }
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

async function streamAIResponse(
  messages: { role: string; content: string }[],
  modelConfig: ReturnType<typeof getModelConfig>,
  apiKey: string,
  maxOutputTokens: number,
  temperature: number,
  controller: ReadableStreamDefaultController,
  encoder: TextEncoder,
  stage: GenerationStage,
  heartbeatInterval: NodeJS.Timeout | null,
  streamContent: boolean = true // Set to false to skip streaming events (for continuation)
): Promise<{
  content: string;
  promptTokens: number;
  completionTokens: number;
}> {
  // Handle NovelAI separately (uses completions API, not chat)
  if (modelConfig.provider === "novelai") {
    return streamNovelAIResponse(
      messages,
      apiKey,
      maxOutputTokens,
      temperature,
      controller,
      encoder,
      stage,
      heartbeatInterval
    );
  }

  // Check if we have a prefill (trailing assistant message)
  const hasPrefill =
    messages.length > 0 && messages[messages.length - 1].role === "assistant";

  // Determine the correct endpoint based on provider
  let endpoint: string;
  switch (modelConfig.provider) {
    case "deepseek":
      // Use beta endpoint for prefill support (prefix: true requires beta API)
      endpoint = hasPrefill
        ? "https://api.deepseek.com/beta/chat/completions"
        : "https://api.deepseek.com/v1/chat/completions";
      break;
    case "mistral":
      endpoint = "https://api.mistral.ai/v1/chat/completions";
      break;
    case "deepinfra":
      endpoint = "https://api.deepinfra.com/v1/openai/chat/completions";
      break;
    default:
      endpoint = "https://openrouter.ai/api/v1/chat/completions";
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  };

  if (modelConfig.provider === "openrouter") {
    headers["HTTP-Referer"] = process.env.NEXT_PUBLIC_SITE_URL || "";
    headers["X-Title"] = "Your Story - Big Adventure Creator";
  }

  // Process messages - add prefix: true to last assistant message for providers that need it
  // Note: OpenRouter and DeepInfra also support prefill, they just continue from the assistant message naturally
  const processedMessages = messages.map((m, index) => {
    const msg: any = { role: m.role, content: m.content };
    // For Mistral/DeepSeek: add prefix: true to tell API this is a prefill
    // OpenRouter/DeepInfra don't need this flag - they continue naturally
    if (
      index === messages.length - 1 &&
      m.role === "assistant" &&
      (modelConfig.provider === "mistral" ||
        modelConfig.provider === "deepseek")
    ) {
      msg.prefix = true;
    }
    return msg;
  });

  const requestBody = {
    model: modelConfig.model,
    messages: processedMessages,
    temperature,
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

        // Extract content from delta
        const delta = parsed.choices?.[0]?.delta;
        if (delta) {
          const content = extractTextContent(delta.content);
          if (content) {
            fullContent += content;
            // Send content chunk to client (if streaming is enabled)
            if (streamContent) {
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({
                    type: "stage_content",
                    stage,
                    content,
                  })}\n\n`
                )
              );
            }
          }
        }

        // Capture usage if present (final chunk)
        if (parsed.usage) {
          promptTokens = parsed.usage.prompt_tokens || 0;
          completionTokens = parsed.usage.completion_tokens || 0;
        }
      } catch {
        // Skip malformed JSON
      }
    }
  }

  return { content: fullContent, promptTokens, completionTokens };
}

// NovelAI-specific streaming function (uses completions API)
async function streamNovelAIResponse(
  messages: { role: string; content: string }[],
  apiKey: string,
  maxOutputTokens: number,
  temperature: number,
  controller: ReadableStreamDefaultController,
  encoder: TextEncoder,
  stage: GenerationStage,
  heartbeatInterval: NodeJS.Timeout | null
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
    }))
  );

  const requestBody = {
    model: NOVELAI_MODEL,
    prompt: prompt,
    max_tokens: Math.min(maxOutputTokens, 2048),
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
      if (data === "[DONE]") continue;

      try {
        const parsed = JSON.parse(data);
        const text = parsed.choices?.[0]?.text || "";
        if (text) {
          fullContent += text;
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: "stage_content",
                stage,
                content: text,
              })}\n\n`
            )
          );
        }
      } catch {
        // Skip malformed JSON
      }
    }
  }

  const completionTokens = Math.ceil(fullContent.length / 4);
  return { content: fullContent, promptTokens, completionTokens };
}

export async function POST(req: NextRequest) {
  const encoder = new TextEncoder();
  let heartbeatInterval: NodeJS.Timeout | null = null;

  const stream = new ReadableStream({
    async start(controller) {
      try {
        // Send immediate heartbeat before any async operations to prevent client timeout
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: "heartbeat",
              timestamp: Date.now(),
            })}\n\n`
          )
        );

        // Start heartbeat interval to keep connection alive
        heartbeatInterval = setInterval(() => {
          try {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  type: "heartbeat",
                  timestamp: Date.now(),
                })}\n\n`
              )
            );
          } catch {
            // Controller may be closed
          }
        }, HEARTBEAT_INTERVAL_MS);

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
          config,
          stage,
          previousResults,
          model = "Deepseek Chat",
          openRouterKey,
          deepseekKey,
          novelaiKey,
          continueFrom,
          finishEarly,
        } = body;

        if (!config || !config.prompt) {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: "error",
                error: "Adventure prompt is required",
              })}\n\n`
            )
          );
          controller.close();
          return;
        }

        if (!stage) {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: "error",
                error: "Stage is required",
              })}\n\n`
            )
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
          novelaiKey
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
          const errorMessage =
            modelConfig.provider === "mistral" ||
            modelConfig.provider === "deepinfra"
              ? `${providerName} server configuration error. Please try again later or use a different model.`
              : `${providerName} API key required. Please add your API key in Settings.`;
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: "error",
                error: errorMessage,
              })}\n\n`
            )
          );
          controller.close();
          return;
        }

        const stageInfo = getStageInfo(stage);
        const stageConfig = getSubstageConfig(stage, config.stageConfigs);
        const maxOutputTokens =
          stageConfig.maxOutputTokens || config.maxOutputTokens;
        const temperature = config.temperature ?? 0.8;

        // Send stage start event
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: "stage_start",
              stage,
              stageName: stageInfo.name,
              stageNumber: stageInfo.number,
              maxOutputTokens,
              isContinuation: !!continueFrom,
            })}\n\n`
          )
        );

        // Build messages for this stage
        const messages = buildBigAdventureMessages(
          config,
          stage,
          previousResults
        );

        let fullContent = "";
        let totalPromptTokens = 0;
        let totalCompletionTokens = 0;

        // Handle "Finish Early" request
        if (finishEarly) {
          const partialContent = continueFrom?.trim() || "";

          // If content is too short, use minimal fallback JSON
          if (partialContent.length < MIN_CONTENT_FOR_WRAPUP) {
            logger.info(
              `Stage ${stage} finishing early with insufficient content (${partialContent.length} chars), using minimal fallback`
            );

            // Notify client we're using fallback
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  type: "stage_continuation",
                  stage,
                  attempt: 1,
                  maxAttempts: 1,
                  message:
                    "Content too short to repair, using minimal fallback...",
                })}\n\n`
              )
            );

            fullContent = getMinimalFallbackJSON(stage);
          } else {
            // Enough content to attempt wrap-up
            fullContent = partialContent;

            // Build a "wrap up" prompt to close the JSON cleanly
            const wrapUpPrompt = `IMPORTANT: The user has requested to finish this stage early. Please complete the JSON output NOW with minimal additional content. Close all open arrays and objects properly. Do NOT add more items - just close the structure cleanly. Output ONLY the remaining JSON to close the structure, nothing else.`;

            const wrapUpMessages = [
              ...messages.map((m) => ({ role: m.role, content: m.content })),
              { role: "assistant", content: fullContent },
              { role: "user", content: wrapUpPrompt },
            ];

            logger.info(
              `Stage ${stage} finishing early from ${fullContent.length} chars`
            );

            // Notify client we're wrapping up
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  type: "stage_continuation",
                  stage,
                  attempt: 1,
                  maxAttempts: 1,
                  message: "Finishing stage early, closing JSON...",
                })}\n\n`
              )
            );

            // Request wrap-up with low token count
            const wrapUpResult = await streamAIResponse(
              wrapUpMessages,
              modelConfig,
              apiKey,
              500, // Just enough tokens to close the JSON
              0.1, // Very low temperature for consistent closing
              controller,
              encoder,
              stage,
              heartbeatInterval
            );

            fullContent += wrapUpResult.content;
            totalPromptTokens += wrapUpResult.promptTokens;
            totalCompletionTokens += wrapUpResult.completionTokens;
          }
        } else if (continueFrom && continueFrom.trim()) {
          // Resume from existing content - just use it as-is
          // Local JSON repair in parseBigAdventureStageOutput will handle incomplete JSON
          fullContent = continueFrom;

          // Check if the existing content is incomplete - just log for info
          const incompleteCheck = detectIncompleteJSON(fullContent);
          if (incompleteCheck.isIncomplete) {
            logger.info(
              `Stage ${stage} resuming from ${fullContent.length} chars of incomplete content, will attempt local repair`
            );
          }
        } else {
          // Fresh generation - initial generation
          const initialResult = await streamAIResponse(
            messages.map((m) => ({ role: m.role, content: m.content })),
            modelConfig,
            apiKey,
            maxOutputTokens,
            temperature,
            controller,
            encoder,
            stage,
            heartbeatInterval
          );

          fullContent = initialResult.content;
          totalPromptTokens += initialResult.promptTokens;
          totalCompletionTokens += initialResult.completionTokens;
        }

        // Check if JSON is incomplete
        if (!finishEarly) {
          let incompleteCheck = detectIncompleteJSON(fullContent);

          // Strategy: Try AI continuation first (generates more complete data), then local repair as fallback
          if (incompleteCheck.isIncomplete) {
            // All providers support prefill continuation (OpenRouter, DeepInfra, DeepSeek, Mistral)
            // NovelAI uses completions API so it doesn't support chat-style prefill
            const supportsPrefill = modelConfig.provider !== "novelai";

            if (supportsPrefill) {
              logger.info(
                `Stage ${stage} JSON incomplete, attempting AI continuation first`
              );

              const MAX_CONTINUATIONS = 2;
              let continuationAttempts = 0;

              while (
                incompleteCheck.isIncomplete &&
                continuationAttempts < MAX_CONTINUATIONS
              ) {
                continuationAttempts++;
                logger.info(
                  `Stage ${stage} using prefill continuation (attempt ${continuationAttempts})`
                );
                controller.enqueue(
                  encoder.encode(
                    `data: ${JSON.stringify({
                      type: "stage_warning",
                      stage,
                      message: `Response was cut off. Continuing generation... (${continuationAttempts}/${MAX_CONTINUATIONS})`,
                    })}\n\n`
                  )
                );

                const continuationMessages = [
                  ...messages.map((m) => ({ role: m.role, content: m.content })),
                  { role: "assistant", content: fullContent },
                ];

                const continuationTokens = Math.min(2000, maxOutputTokens);

                try {
                  const continuationResult = await streamAIResponse(
                    continuationMessages,
                    modelConfig,
                    apiKey,
                    continuationTokens,
                    temperature,
                    controller,
                    encoder,
                    stage,
                    heartbeatInterval,
                    true
                  );

                  fullContent += continuationResult.content;
                  totalPromptTokens += continuationResult.promptTokens;
                  totalCompletionTokens += continuationResult.completionTokens;

                  incompleteCheck = detectIncompleteJSON(fullContent);
                } catch (error) {
                  logger.error(`Prefill continuation failed: ${error}`);
                  break;
                }
              }
            }

            // If still incomplete after AI continuation (or no prefill support), try local repair
            if (incompleteCheck.isIncomplete) {
              logger.info(
                `Stage ${stage} still incomplete after AI continuation, trying local repair`
              );

              const localRepairResult = parseBigAdventureStageOutput(
                fullContent,
                stage
              );

              if (localRepairResult !== null) {
                logger.info(`Stage ${stage} local repair successful`);
                controller.enqueue(
                  encoder.encode(
                    `data: ${JSON.stringify({
                      type: "stage_warning",
                      stage,
                      message: `Response was cut off. Local repair successful.`,
                    })}\n\n`
                  )
                );

                // Send stage complete event
                controller.enqueue(
                  encoder.encode(
                    `data: ${JSON.stringify({
                      type: "stage_complete",
                      stage,
                      stageName: stageInfo.name,
                      success: true,
                      promptTokens: totalPromptTokens,
                      completionTokens: totalCompletionTokens,
                      partialResult: localRepairResult,
                      rawContent: fullContent,
                    })}\n\n`
                  )
                );

                // Clear heartbeat and send done
                if (heartbeatInterval) clearInterval(heartbeatInterval);

                controller.enqueue(
                  encoder.encode(
                    `data: ${JSON.stringify({
                      type: "done",
                      stage,
                      result: localRepairResult,
                      rawContent: fullContent,
                      meta: {
                        model: modelConfig.model,
                        modelName: model,
                        provider: modelConfig.provider,
                        usage: {
                          promptTokens: totalPromptTokens,
                          completionTokens: totalCompletionTokens,
                          totalTokens: totalPromptTokens + totalCompletionTokens,
                        },
                      },
                    })}\n\n`
                  )
                );

                controller.close();
                return;
              }
            }
          }
        }

        // Parse the stage output (local attemptJSONRepair will handle incomplete JSON)
        const result = parseBigAdventureStageOutput(fullContent, stage);

        // Send stage complete event
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: "stage_complete",
              stage,
              stageName: stageInfo.name,
              success: result !== null,
              promptTokens: totalPromptTokens,
              completionTokens: totalCompletionTokens,
              partialResult: result,
              rawContent: fullContent, // Include raw content for debugging/recovery
            })}\n\n`
          )
        );

        logger.action("Stage generation complete", {
          userId: user.id,
          model: modelConfig.model,
          stage,
          promptTokens: totalPromptTokens,
          completionTokens: totalCompletionTokens,
          success: result !== null,
        });

        // Send done event
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: "done",
              stage,
              result,
              rawContent: fullContent,
              meta: {
                model: modelConfig.model,
                modelName: model,
                provider: modelConfig.provider,
                usage: {
                  promptTokens: totalPromptTokens,
                  completionTokens: totalCompletionTokens,
                  totalTokens: totalPromptTokens + totalCompletionTokens,
                },
              },
            })}\n\n`
          )
        );

        controller.close();
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        logger.error("Stage generation error", { error: errorMessage });
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: "error",
              error: errorMessage || "Internal server error",
            })}\n\n`
          )
        );
        controller.close();
      } finally {
        if (heartbeatInterval) {
          clearInterval(heartbeatInterval);
        }
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
