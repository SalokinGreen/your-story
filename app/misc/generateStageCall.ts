/**
 * Shared logic behind /api/creator/generate-stage - see providerCall.ts for
 * why this is split out (same code runs server-side for the Vercel web
 * build and client-side for the standalone Tauri/Capacitor build, via
 * creatorFetch.ts).
 *
 * Generates ONE stage of an adventure per call, with heartbeat events to
 * keep the connection alive on the web build (Vercel's function timeout)
 * and partial-content recovery support (continueFrom/finishEarly) - the
 * client orchestrates calling this once per stage sequentially.
 */

import { getModelConfig } from "@/app/misc/ai_prices";
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
import {
  CreatorProvider,
  getCreatorApiKey,
  streamProviderCompletion,
  makeSSEEmitter,
  CREATOR_PROVIDER_NAMES,
} from "@/app/misc/bigAdventureStreamCommon";

// Minimum content length required to attempt JSON wrap-up
const MIN_CONTENT_FOR_WRAPUP = 500;

// Heartbeat interval to keep connection alive (every 25 seconds)
const HEARTBEAT_INTERVAL_MS = 25000;

export interface GenerateStageRequestBody {
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
    case "content-lore":
      return JSON.stringify({ lore: [] });
    case "content-goals":
      return JSON.stringify({ achievements: [], quests: [] });
    case "advanced-presets":
      return JSON.stringify({ presets: [] });
    case "advanced-tables":
      return JSON.stringify({ agmtState: null, customTables: [] });
    case "advanced-other":
      return JSON.stringify({ upgradeSettings: null, startingChoices: [] });
    default:
      return "{}";
  }
}

export function generateStageStream(
  body: GenerateStageRequestBody,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let heartbeatInterval: ReturnType<typeof setInterval> | null = null;

  return new ReadableStream({
    async start(controller) {
      const emit = makeSSEEmitter(controller, encoder);
      try {
        // Send immediate heartbeat before any async operations to prevent client timeout
        emit({ type: "heartbeat", timestamp: Date.now() });

        heartbeatInterval = setInterval(() => {
          try {
            emit({ type: "heartbeat", timestamp: Date.now() });
          } catch {
            // Controller may be closed
          }
        }, HEARTBEAT_INTERVAL_MS);

        const {
          config,
          stage,
          previousResults,
          model = "DeepSeek V4 Flash",
          continueFrom,
          finishEarly,
        } = body;

        if (!config || !config.prompt) {
          emit({ type: "error", error: "Adventure prompt is required" });
          controller.close();
          return;
        }

        if (!stage) {
          emit({ type: "error", error: "Stage is required" });
          controller.close();
          return;
        }

        const modelConfig = getModelConfig(model);
        const provider = modelConfig.provider as CreatorProvider;
        const apiKey = getCreatorApiKey(provider, body);

        if (!apiKey) {
          emit({
            type: "error",
            error: `${CREATOR_PROVIDER_NAMES[provider]} API key required. Please add your API key in Settings.`,
          });
          controller.close();
          return;
        }

        const stageInfo = getStageInfo(stage);
        const stageConfig = getSubstageConfig(stage, config.stageConfigs);
        const maxOutputTokens = stageConfig.maxOutputTokens || config.maxOutputTokens;
        const temperature = config.temperature ?? 0.8;

        emit({
          type: "stage_start",
          stage,
          stageName: stageInfo.name,
          stageNumber: stageInfo.number,
          maxOutputTokens,
          isContinuation: !!continueFrom,
        });

        const messages = buildBigAdventureMessages(config, stage, previousResults);

        let fullContent = "";
        let totalPromptTokens = 0;
        let totalCompletionTokens = 0;

        if (finishEarly) {
          const partialContent = continueFrom?.trim() || "";

          if (partialContent.length < MIN_CONTENT_FOR_WRAPUP) {
            logger.info(
              `Stage ${stage} finishing early with insufficient content (${partialContent.length} chars), using minimal fallback`,
            );
            emit({
              type: "stage_continuation",
              stage,
              attempt: 1,
              maxAttempts: 1,
              message: "Content too short to repair, using minimal fallback...",
            });
            fullContent = getMinimalFallbackJSON(stage);
          } else {
            fullContent = partialContent;

            const wrapUpPrompt = `IMPORTANT: The user has requested to finish this stage early. Please complete the JSON output NOW with minimal additional content. Close all open arrays and objects properly. Do NOT add more items - just close the structure cleanly. Output ONLY the remaining JSON to close the structure, nothing else.`;

            const wrapUpMessages = [
              ...messages.map((m) => ({ role: m.role, content: m.content })),
              { role: "assistant", content: fullContent },
              { role: "user", content: wrapUpPrompt },
            ];

            logger.info(`Stage ${stage} finishing early from ${fullContent.length} chars`);
            emit({
              type: "stage_continuation",
              stage,
              attempt: 1,
              maxAttempts: 1,
              message: "Finishing stage early, closing JSON...",
            });

            const wrapUpResult = await streamProviderCompletion(
              wrapUpMessages,
              modelConfig,
              apiKey,
              500,
              0.1,
              (text) => emit({ type: "stage_content", stage, content: text }),
            );

            fullContent += wrapUpResult.content;
            totalPromptTokens += wrapUpResult.promptTokens;
            totalCompletionTokens += wrapUpResult.completionTokens;
          }
        } else if (continueFrom && continueFrom.trim()) {
          fullContent = continueFrom;

          const incompleteCheck = detectIncompleteJSON(fullContent);
          if (incompleteCheck.isIncomplete) {
            logger.info(
              `Stage ${stage} resuming from ${fullContent.length} chars of incomplete content, will attempt local repair`,
            );
          }
        } else {
          const initialResult = await streamProviderCompletion(
            messages.map((m) => ({ role: m.role, content: m.content })),
            modelConfig,
            apiKey,
            maxOutputTokens,
            temperature,
            (text) => emit({ type: "stage_content", stage, content: text }),
          );

          fullContent = initialResult.content;
          totalPromptTokens += initialResult.promptTokens;
          totalCompletionTokens += initialResult.completionTokens;
        }

        if (!finishEarly) {
          let incompleteCheck = detectIncompleteJSON(fullContent);

          if (incompleteCheck.isIncomplete) {
            logger.info(`Stage ${stage} JSON incomplete, attempting AI continuation first`);

            const MAX_CONTINUATIONS = 2;
            let continuationAttempts = 0;

            while (incompleteCheck.isIncomplete && continuationAttempts < MAX_CONTINUATIONS) {
              continuationAttempts++;
              logger.info(`Stage ${stage} using prefill continuation (attempt ${continuationAttempts})`);
              emit({
                type: "stage_warning",
                stage,
                message: `Response was cut off. Continuing generation... (${continuationAttempts}/${MAX_CONTINUATIONS})`,
              });

              const continuationMessages = [
                ...messages.map((m) => ({ role: m.role, content: m.content })),
                { role: "assistant", content: fullContent },
              ];

              const continuationTokens = Math.min(2000, maxOutputTokens);

              try {
                const continuationResult = await streamProviderCompletion(
                  continuationMessages,
                  modelConfig,
                  apiKey,
                  continuationTokens,
                  temperature,
                  (text) => emit({ type: "stage_content", stage, content: text }),
                );

                const cleanedContinuation = cleanContinuationContent(
                  fullContent,
                  continuationResult.content,
                );
                if (cleanedContinuation) {
                  fullContent += cleanedContinuation;
                } else {
                  logger.warn(`Stage ${stage} continuation was discarded (bad restart detected)`);
                }
                totalPromptTokens += continuationResult.promptTokens;
                totalCompletionTokens += continuationResult.completionTokens;

                incompleteCheck = detectIncompleteJSON(fullContent);
              } catch (error) {
                logger.error(`Prefill continuation failed: ${error}`);
                break;
              }
            }

            if (incompleteCheck.isIncomplete) {
              logger.info(`Stage ${stage} still incomplete after AI continuation, trying local repair`);

              const localRepairResult = parseBigAdventureStageOutput(fullContent, stage);

              if (localRepairResult !== null) {
                logger.info(`Stage ${stage} local repair successful`);
                emit({
                  type: "stage_warning",
                  stage,
                  message: `Response was cut off. Local repair successful.`,
                });

                emit({
                  type: "stage_complete",
                  stage,
                  stageName: stageInfo.name,
                  success: true,
                  promptTokens: totalPromptTokens,
                  completionTokens: totalCompletionTokens,
                  partialResult: localRepairResult,
                  rawContent: fullContent,
                });

                if (heartbeatInterval) clearInterval(heartbeatInterval);

                emit({
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
                    isByok: true,
                  },
                });

                controller.close();
                return;
              }
            }
          }
        }

        const result = parseBigAdventureStageOutput(fullContent, stage);

        emit({
          type: "stage_complete",
          stage,
          stageName: stageInfo.name,
          success: result !== null,
          promptTokens: totalPromptTokens,
          completionTokens: totalCompletionTokens,
          partialResult: result,
          rawContent: fullContent,
        });

        logger.action("Stage generation complete", {
          model: modelConfig.model,
          stage,
          promptTokens: totalPromptTokens,
          completionTokens: totalCompletionTokens,
          success: result !== null,
        });

        emit({
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
        });

        controller.close();
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error("Stage generation error", { error: errorMessage });
        emit({ type: "error", error: errorMessage || "Internal server error" });
        controller.close();
      } finally {
        if (heartbeatInterval) {
          clearInterval(heartbeatInterval);
        }
      }
    },
  });
}
