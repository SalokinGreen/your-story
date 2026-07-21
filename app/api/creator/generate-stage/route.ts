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
  cleanContinuationContent,
} from "@/app/misc/big_adventure_ai";
import { getModelConfig } from "@/app/misc/ai_prices";

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
    // NOTE: "mechanics" stage (abilities) is DEPRECATED - removed from GenerationStage
    case "content-lore":
      return JSON.stringify({
        lore: [],
      });
    case "content-goals":
      return JSON.stringify({
        achievements: [],
        quests: [],
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
  mistralKey?: string;
  deepinfraKey?: string;
  // For continuation after timeout - the partial content generated so far
  continueFrom?: string;
  // Signal to wrap up the current stage early
  finishEarly?: boolean;
}

function getApiKey(
  provider: "deepseek" | "openrouter" | "mistral" | "deepinfra",
  userProvidedOpenRouterKey?: string,
  userProvidedDeepseekKey?: string,
  mistralKey?: string,
  deepinfraKey?: string,
): string | null {
  if (provider === "deepseek") {
    return userProvidedDeepseekKey || null;
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
  streamContent: boolean = true, // Set to false to skip streaming events (for continuation)
): Promise<{
  content: string;
  promptTokens: number;
  completionTokens: number;
  estimatedCost?: number; // DeepInfra provides this
}> {
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
  let estimatedCost: number | undefined; // DeepInfra provides this

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
                  })}\n\n`,
                ),
              );
            }
          }
        }

        // Capture usage if present (final chunk)
        if (parsed.usage) {
          promptTokens = parsed.usage.prompt_tokens || 0;
          completionTokens = parsed.usage.completion_tokens || 0;
          // DeepInfra provides estimated_cost in dollars
          if (parsed.usage.estimated_cost !== undefined) {
            estimatedCost = parsed.usage.estimated_cost;
          }
        }
      } catch {
        // Skip malformed JSON
      }
    }
  }

  return {
    content: fullContent,
    promptTokens,
    completionTokens,
    estimatedCost,
  };
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
            })}\n\n`,
          ),
        );

        // Start heartbeat interval to keep connection alive
        heartbeatInterval = setInterval(() => {
          try {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  type: "heartbeat",
                  timestamp: Date.now(),
                })}\n\n`,
              ),
            );
          } catch {
            // Controller may be closed
          }
        }, HEARTBEAT_INTERVAL_MS);

        // Validate request has a body (no auth required - BYOK only)
        // Parse request
        const body: RequestBody = await req.json();
        const {
          config,
          stage,
          previousResults,
          model = "DeepSeek V4 Flash",
          openRouterKey,
          deepseekKey,
          mistralKey,
          deepinfraKey,
          continueFrom,
          finishEarly,
        } = body;

        if (!config || !config.prompt) {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: "error",
                error: "Adventure prompt is required",
              })}\n\n`,
            ),
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
            | "mistral"
            | "deepinfra",
          openRouterKey,
          deepseekKey,
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
                  : "DeepInfra";
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
            })}\n\n`,
          ),
        );

        // Build messages for this stage
        const messages = buildBigAdventureMessages(
          config,
          stage,
          previousResults,
        );

        let fullContent = "";
        let totalPromptTokens = 0;
        let totalCompletionTokens = 0;
        let totalEstimatedCost = 0; // Accumulate DeepInfra costs

        // Handle "Finish Early" request
        if (finishEarly) {
          const partialContent = continueFrom?.trim() || "";

          // If content is too short, use minimal fallback JSON
          if (partialContent.length < MIN_CONTENT_FOR_WRAPUP) {
            logger.info(
              `Stage ${stage} finishing early with insufficient content (${partialContent.length} chars), using minimal fallback`,
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
                })}\n\n`,
              ),
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
              `Stage ${stage} finishing early from ${fullContent.length} chars`,
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
                })}\n\n`,
              ),
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
              heartbeatInterval,
            );

            fullContent += wrapUpResult.content;
            totalPromptTokens += wrapUpResult.promptTokens;
            totalCompletionTokens += wrapUpResult.completionTokens;
            if (wrapUpResult.estimatedCost)
              totalEstimatedCost += wrapUpResult.estimatedCost;
          }
        } else if (continueFrom && continueFrom.trim()) {
          // Resume from existing content - just use it as-is
          // Local JSON repair in parseBigAdventureStageOutput will handle incomplete JSON
          fullContent = continueFrom;

          // Check if the existing content is incomplete - just log for info
          const incompleteCheck = detectIncompleteJSON(fullContent);
          if (incompleteCheck.isIncomplete) {
            logger.info(
              `Stage ${stage} resuming from ${fullContent.length} chars of incomplete content, will attempt local repair`,
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
            heartbeatInterval,
          );

          fullContent = initialResult.content;
          totalPromptTokens += initialResult.promptTokens;
          totalCompletionTokens += initialResult.completionTokens;
          if (initialResult.estimatedCost)
            totalEstimatedCost += initialResult.estimatedCost;
        }

        // Check if JSON is incomplete
        if (!finishEarly) {
          let incompleteCheck = detectIncompleteJSON(fullContent);

          // Strategy: Try AI continuation first (generates more complete data), then local repair as fallback
          if (incompleteCheck.isIncomplete) {
            // All providers support prefill continuation (OpenRouter, DeepInfra, DeepSeek, Mistral)
            {
              logger.info(
                `Stage ${stage} JSON incomplete, attempting AI continuation first`,
              );

              const MAX_CONTINUATIONS = 2;
              let continuationAttempts = 0;

              while (
                incompleteCheck.isIncomplete &&
                continuationAttempts < MAX_CONTINUATIONS
              ) {
                continuationAttempts++;
                logger.info(
                  `Stage ${stage} using prefill continuation (attempt ${continuationAttempts})`,
                );
                controller.enqueue(
                  encoder.encode(
                    `data: ${JSON.stringify({
                      type: "stage_warning",
                      stage,
                      message: `Response was cut off. Continuing generation... (${continuationAttempts}/${MAX_CONTINUATIONS})`,
                    })}\n\n`,
                  ),
                );

                const continuationMessages = [
                  ...messages.map((m) => ({
                    role: m.role,
                    content: m.content,
                  })),
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
                    true,
                  );

                  // Clean continuation content to handle overlap/restart issues
                  const cleanedContinuation = cleanContinuationContent(
                    fullContent,
                    continuationResult.content,
                  );
                  if (cleanedContinuation) {
                    fullContent += cleanedContinuation;
                  } else {
                    logger.warn(
                      `Stage ${stage} continuation was discarded (bad restart detected)`,
                    );
                  }
                  totalPromptTokens += continuationResult.promptTokens;
                  totalCompletionTokens += continuationResult.completionTokens;
                  if (continuationResult.estimatedCost)
                    totalEstimatedCost += continuationResult.estimatedCost;

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
                `Stage ${stage} still incomplete after AI continuation, trying local repair`,
              );

              const localRepairResult = parseBigAdventureStageOutput(
                fullContent,
                stage,
              );

              if (localRepairResult !== null) {
                logger.info(`Stage ${stage} local repair successful`);
                controller.enqueue(
                  encoder.encode(
                    `data: ${JSON.stringify({
                      type: "stage_warning",
                      stage,
                      message: `Response was cut off. Local repair successful.`,
                    })}\n\n`,
                  ),
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
                    })}\n\n`,
                  ),
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
                          totalTokens:
                            totalPromptTokens + totalCompletionTokens,
                        },
                        isByok: true,
                      },
                    })}\n\n`,
                  ),
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
            })}\n\n`,
          ),
        );

        logger.action("Stage generation complete", {
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
                isByok: true,
              },
            })}\n\n`,
          ),
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
            })}\n\n`,
          ),
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
