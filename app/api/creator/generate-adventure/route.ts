/**
 * Big Adventure Generator API (Streaming)
 *
 * Generates a complete adventure from a single prompt using staged generation.
 * Returns SSE stream with progress updates and generated content.
 * Supports per-stage iterations and output token limits.
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
  GenerationStage,
  buildBigAdventureMessages,
  parseBigAdventureStageOutput,
  mergeBigAdventureResults,
  getStagesToRun,
  getStageInfo,
  BigAdventureResult,
  DEFAULT_STAGE_CONFIGS,
} from "@/app/misc/big_adventure_ai";

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export const runtime = "nodejs";
export const maxDuration = 300; // Allow up to 5 minutes for full adventure generation

interface RequestBody {
  config: BigAdventureConfig;
  model?: string;
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

async function generateStage(
  config: BigAdventureConfig,
  stage: GenerationStage,
  previousResults: Partial<BigAdventureResult> | undefined,
  modelConfig: ReturnType<typeof getModelConfig>,
  apiKey: string,
  controller: ReadableStreamDefaultController,
  encoder: TextEncoder,
  iteration: number = 1
): Promise<{
  result: Partial<BigAdventureResult> | null;
  promptTokens: number;
  completionTokens: number;
  rawContent: string;
}> {
  const stageInfo = getStageInfo(stage);

  // Get stage-specific max output tokens
  const stageConfig =
    config.stageConfigs?.[stage] || DEFAULT_STAGE_CONFIGS[stage];
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
      })}\n\n`
    )
  );

  // Build messages for this stage
  const messages = buildBigAdventureMessages(config, stage, previousResults);

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
    headers["X-Title"] = "Your Story - Big Adventure Creator";
  }

  const requestBody = {
    model: modelConfig.model,
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
    temperature: config.temperature ?? 0.8, // Use config temperature or default to 0.8 for creativity
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
          // Stream content chunks for this stage
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: "stage_content",
                stage,
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

  // Parse the stage output
  const result = parseBigAdventureStageOutput(fullContent, stage);

  // Send stage complete event with partial result
  controller.enqueue(
    encoder.encode(
      `data: ${JSON.stringify({
        type: "stage_complete",
        stage,
        stageName: stageInfo.name,
        success: result !== null,
        promptTokens,
        completionTokens,
        iteration,
        partialResult: result,
      })}\n\n`
    )
  );

  return { result, promptTokens, completionTokens, rawContent: fullContent };
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
        const { config, model = "Deepseek Chat", openRouterKey } = body;

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

        // Get model config
        const modelConfig = getModelConfig(model);

        // Estimate total cost and check tokens
        const stages = getStagesToRun(config);
        const estimatedCost = stages.length * 5; // Rough estimate: 5 coins per stage

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
            })}\n\n`
          )
        );

        // Run all stages
        const stageResults: (Partial<BigAdventureResult> | null)[] = [];
        let totalPromptTokens = 0;
        let totalCompletionTokens = 0;
        const rawOutputs: Record<string, string> = {};

        for (let i = 0; i < stages.length; i++) {
          const stage = stages[i];

          // Merge previous results for context
          const previousResults =
            stageResults.length > 0
              ? mergeBigAdventureResults(
                  ...stageResults.filter((r) => r !== null)
                )
              : undefined;

          try {
            const { result, promptTokens, completionTokens, rawContent } =
              await generateStage(
                config,
                stage,
                previousResults,
                modelConfig,
                apiKey,
                controller,
                encoder
              );

            stageResults.push(result);
            totalPromptTokens += promptTokens;
            totalCompletionTokens += completionTokens;
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
                })}\n\n`
              )
            );
            // Continue with other stages even if one fails
            stageResults.push(null);
          }
        }

        // Merge all results
        const finalResult = mergeBigAdventureResults(
          ...stageResults.filter((r) => r !== null)
        );

        // Apply RPG system and NSFW settings
        if (finalResult.storyTemplate) {
          finalResult.storyTemplate.rpgSystem = config.rpgSystem;
          finalResult.storyTemplate.nsfw = config.nsfw;
        }

        // Calculate token cost
        const tokenCost = calculateTokenCost(
          model,
          totalPromptTokens,
          totalCompletionTokens
        );

        // Deduct tokens
        await deductTokens(user.id, tokenCost, supabase);
        const balance = (await getUserTokenBalance(user.id, supabase)) || {
          total: 0,
        };

        logger.action("Big adventure generation complete", {
          userId: user.id,
          model: modelConfig.model,
          provider: modelConfig.provider,
          stages: stages.length,
          totalPromptTokens,
          totalCompletionTokens,
          tokenCost,
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
        logger.error("Big adventure generation error", {
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
