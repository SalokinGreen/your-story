/**
 * Big Adventure Generator API (Streaming)
 *
 * Generates a complete adventure from a single prompt using staged generation.
 * Returns SSE stream with progress updates and generated content.
 * Supports per-stage iterations and output token limits.
 */

import { NextRequest } from "next/server";
import { getModelConfig } from "@/app/misc/ai_prices";
import { logger } from "@/app/misc/logger";
import {
  BigAdventureConfig,
  GenerationStage,
  buildBigAdventureMessages,
  parseBigAdventureStageOutput,
  mergeBigAdventureResults,
  getStagesToRun,
  getStageInfo,
  BigAdventureResult,
  getSubstageConfig,
  detectIncompleteJSON,
  cleanContinuationContent,
} from "@/app/misc/big_adventure_ai";
import { convertMessagesToPrompt, NOVELAI_MODEL } from "@/app/misc/novelai";

// NovelAI API endpoint
const NOVELAI_API_URL = "https://text.novelai.net/oa/v1/completions";

export const runtime = "nodejs";
export const maxDuration = 300; // Allow up to 5 minutes for full adventure generation

interface RequestBody {
  config: BigAdventureConfig;
  model?: string;
  openRouterKey?: string;
  deepseekKey?: string;
  novelaiKey?: string;
  mistralKey?: string;
  deepinfraKey?: string;
  // Resume support
  skipStages?: GenerationStage[];
  existingResults?: Partial<BigAdventureResult>;
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

async function streamAIResponse(
  messages: { role: string; content: string }[],
  modelConfig: ReturnType<typeof getModelConfig>,
  apiKey: string,
  maxOutputTokens: number,
  temperature: number,
  controller: ReadableStreamDefaultController,
  encoder: TextEncoder,
  stage: GenerationStage,
  streamContent: boolean = true, // Set to false to skip streaming events (for continuation)
): Promise<{
  content: string;
  promptTokens: number;
  completionTokens: number;
  estimatedCost?: number; // DeepInfra provides this
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
        : "https://api.deepseek.com/chat/completions";
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
        const delta = parsed.choices?.[0]?.delta;

        if (delta?.content !== undefined && delta?.content !== null) {
          const textContent = extractTextContent(delta.content);
          if (textContent) {
            fullContent += textContent;
            if (streamContent) {
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({
                    type: "stage_content",
                    stage,
                    content: textContent,
                  })}\n\n`,
                ),
              );
            }
          }
        }

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
                type: "stage_content",
                stage,
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
  return { content: fullContent, promptTokens, completionTokens };
}

async function generateStage(
  config: BigAdventureConfig,
  stage: GenerationStage,
  previousResults: Partial<BigAdventureResult> | undefined,
  modelConfig: ReturnType<typeof getModelConfig>,
  apiKey: string,
  controller: ReadableStreamDefaultController,
  encoder: TextEncoder,
  iteration: number = 1,
): Promise<{
  result: Partial<BigAdventureResult> | null;
  promptTokens: number;
  completionTokens: number;
  rawContent: string;
  estimatedCost?: number; // Total estimated cost from DeepInfra
}> {
  const stageInfo = getStageInfo(stage);

  // Get stage-specific max output tokens
  const stageConfig = getSubstageConfig(stage, config.stageConfigs);
  const maxOutputTokens = stageConfig.maxOutputTokens || config.maxOutputTokens;

  // Send stage start event
  controller.enqueue(
    encoder.encode(
      `data: ${JSON.stringify({
        type: "stage_start",
        stage,
        stageName: stageInfo.name,
        stageNumber: stageInfo.number,
        iteration,
        maxOutputTokens,
      })}\n\n`,
    ),
  );

  // Build initial messages for this stage
  const messages = buildBigAdventureMessages(config, stage, previousResults);
  const temperature = config.temperature ?? 0.8;

  let fullContent = "";
  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;
  let totalEstimatedCost = 0; // Accumulate DeepInfra costs

  // Initial generation
  const initialResult = await streamAIResponse(
    messages.map((m) => ({ role: m.role, content: m.content })),
    modelConfig,
    apiKey,
    maxOutputTokens,
    temperature,
    controller,
    encoder,
    stage,
  );

  fullContent = initialResult.content;
  totalPromptTokens += initialResult.promptTokens;
  totalCompletionTokens += initialResult.completionTokens;
  if (initialResult.estimatedCost)
    totalEstimatedCost += initialResult.estimatedCost;

  // Check if JSON is incomplete
  let incompleteCheck = detectIncompleteJSON(fullContent);

  // Strategy: Try AI continuation first (generates more complete data), then local repair as fallback
  if (incompleteCheck.isIncomplete) {
    // All providers support prefill continuation (OpenRouter, DeepInfra, DeepSeek, Mistral)
    // NovelAI uses completions API so it doesn't support chat-style prefill
    const supportsPrefill = modelConfig.provider !== "novelai";

    if (supportsPrefill) {
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

        // Build continuation messages with truncated content as prefill
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
              iteration,
              partialResult: localRepairResult,
            })}\n\n`,
          ),
        );

        return {
          result: localRepairResult,
          promptTokens: totalPromptTokens,
          completionTokens: totalCompletionTokens,
          rawContent: fullContent,
          estimatedCost:
            totalEstimatedCost > 0 ? totalEstimatedCost : undefined,
        };
      }
    }
  }

  // Parse the stage output (will attempt repair if needed)
  const result = parseBigAdventureStageOutput(fullContent, stage);

  // Send stage complete event with partial result
  controller.enqueue(
    encoder.encode(
      `data: ${JSON.stringify({
        type: "stage_complete",
        stage,
        stageName: stageInfo.name,
        success: result !== null,
        promptTokens: totalPromptTokens,
        completionTokens: totalCompletionTokens,
        iteration,
        partialResult: result,
      })}\n\n`,
    ),
  );

  return {
    result,
    promptTokens: totalPromptTokens,
    completionTokens: totalCompletionTokens,
    rawContent: fullContent,
    estimatedCost: totalEstimatedCost > 0 ? totalEstimatedCost : undefined,
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
          config,
          model = "Deepseek Chat",
          openRouterKey,
          deepseekKey,
          novelaiKey,
          mistralKey,
          deepinfraKey,
          skipStages = [],
          existingResults,
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

        // Get model config
        const modelConfig = getModelConfig(model);

        // Get stages to run
        const stages = getStagesToRun(config);

        // Get API key (user-provided)
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

        // Send initial info
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: "start",
              totalStages: stages.length,
              stages: stages.map((s) => ({
                stage: s,
                ...getStageInfo(s),
              })),
            })}\n\n`,
          ),
        );

        // Run all stages
        const stageResults: (Partial<BigAdventureResult> | null)[] = [];
        let totalPromptTokens = 0;
        let totalCompletionTokens = 0;
        let totalEstimatedCost = 0; // Accumulate DeepInfra costs
        const rawOutputs: Record<string, string> = {};

        // Initialize with existing results if resuming
        if (existingResults) {
          stageResults.push(existingResults);
        }

        for (let i = 0; i < stages.length; i++) {
          const stage = stages[i];

          // Skip stages that were already completed (resume support)
          if (skipStages.includes(stage)) {
            logger.info(`Skipping already completed stage: ${stage}`);
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  type: "stage_skipped",
                  stage,
                  message: "Already completed (resumed)",
                })}\n\n`,
              ),
            );
            continue;
          }

          // Merge previous results for context
          const previousResults =
            stageResults.length > 0
              ? mergeBigAdventureResults(
                  ...stageResults.filter((r) => r !== null),
                )
              : undefined;

          try {
            const {
              result,
              promptTokens,
              completionTokens,
              rawContent,
              estimatedCost,
            } = await generateStage(
              config,
              stage,
              previousResults,
              modelConfig,
              apiKey,
              controller,
              encoder,
            );

            stageResults.push(result);
            totalPromptTokens += promptTokens;
            totalCompletionTokens += completionTokens;
            if (estimatedCost) totalEstimatedCost += estimatedCost;
            rawOutputs[stage] = rawContent;
          } catch (stageError) {
            const errorMessage =
              stageError instanceof Error
                ? stageError.message
                : String(stageError);
            logger.error(`Stage ${stage} failed`, {
              error: errorMessage,
            });
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  type: "stage_error",
                  stage,
                  error: errorMessage,
                })}\n\n`,
              ),
            );
            // Continue with other stages even if one fails
            stageResults.push(null);
          }
        }

        // Merge all results
        const finalResult = mergeBigAdventureResults(
          ...stageResults.filter((r) => r !== null),
        );

        // Apply RPG system and NSFW settings
        if (finalResult.storyTemplate) {
          finalResult.storyTemplate.rpgSystem = config.rpgSystem;
          finalResult.storyTemplate.nsfw = config.nsfw;
        }

        logger.action("Big adventure generation complete", {
          model: modelConfig.model,
          provider: modelConfig.provider,
          stages: stages.length,
          totalPromptTokens,
          totalCompletionTokens,
          adventureTitle: finalResult.title,
        });

        // Send final result
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: "done",
              result: finalResult,
              rawOutputs,
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
        logger.error("Big adventure generation error", {
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
