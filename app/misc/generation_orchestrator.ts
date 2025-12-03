/**
 * Big Adventure Generation Orchestrator
 *
 * Client-side orchestration for sequential stage-by-stage adventure generation.
 * Handles:
 * - Sequential stage execution
 * - Timeout detection with continuation (not restart)
 * - Partial content recovery
 * - Progress tracking and autosave
 */

import { getAuthToken } from "@/app/misc/getAuthToken";
import {
  BigAdventureConfig,
  BigAdventureResult,
  GenerationStage,
  getStagesToRun,
  getStageInfo,
  mergeBigAdventureResults,
  saveAutosave,
  BigAdventureAutosave,
} from "@/app/misc/big_adventure_ai";

// Configuration for timeout detection
const TIMEOUT_THRESHOLD_MS = 280000; // 4 min 40 sec - slightly less than Vercel's 5 min limit
const HEARTBEAT_TIMEOUT_MS = 60000; // If no heartbeat for 60 seconds, assume timeout
const MAX_CONTINUATIONS_PER_STAGE = 5; // Max times to continue a timed-out stage

export interface GenerationCallbacks {
  onStageStart: (
    stage: GenerationStage,
    stageInfo: ReturnType<typeof getStageInfo>
  ) => void;
  onStageContent: (stage: GenerationStage, content: string) => void;
  onStageContinuation: (
    stage: GenerationStage,
    attempt: number,
    maxAttempts: number
  ) => void;
  onStageComplete: (
    stage: GenerationStage,
    result: Partial<BigAdventureResult> | null,
    promptTokens: number,
    completionTokens: number
  ) => void;
  onStageError: (
    stage: GenerationStage,
    error: string,
    canRetry: boolean
  ) => void;
  onStageWarning: (stage: GenerationStage, message: string) => void;
  onProgress: (completedStages: GenerationStage[], totalStages: number) => void;
  onComplete: (
    result: BigAdventureResult,
    totalTokens: { prompt: number; completion: number }
  ) => void;
  onError: (error: string) => void;
  onAutosave: (autosave: BigAdventureAutosave) => void;
}

export interface GenerationOptions {
  model: string;
  openRouterKey?: string;
  deepseekKey?: string;
  novelaiKey?: string;
  sessionId: string;
  skipStages?: GenerationStage[];
  existingResults?: Partial<BigAdventureResult>;
  abortSignal?: AbortSignal;
}

interface StageResult {
  success: boolean;
  result: Partial<BigAdventureResult> | null;
  rawContent: string;
  promptTokens: number;
  completionTokens: number;
  error?: string;
  timedOut?: boolean;
}

/**
 * Generate a single stage with timeout detection
 * If continueFrom is provided, tells the API to continue from that partial content
 */
async function generateSingleStage(
  config: BigAdventureConfig,
  stage: GenerationStage,
  previousResults: Partial<BigAdventureResult> | undefined,
  options: GenerationOptions,
  callbacks: GenerationCallbacks,
  continueFrom?: string
): Promise<StageResult> {
  const token = await getAuthToken();
  if (!token) {
    return {
      success: false,
      result: null,
      rawContent: continueFrom || "",
      promptTokens: 0,
      completionTokens: 0,
      error: "Not authenticated",
    };
  }

  const startTime = Date.now();
  let lastHeartbeat = Date.now();
  let fullContent = continueFrom || "";
  let promptTokens = 0;
  let completionTokens = 0;

  try {
    const response = await fetch("/api/creator/generate-stage", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        config,
        stage,
        previousResults,
        model: options.model,
        openRouterKey: options.openRouterKey,
        deepseekKey: options.deepseekKey,
        novelaiKey: options.novelaiKey,
        continueFrom: continueFrom || undefined,
      }),
      signal: options.abortSignal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        result: null,
        rawContent: "",
        promptTokens: 0,
        completionTokens: 0,
        error: `HTTP ${response.status}: ${errorText}`,
      };
    }

    const reader = response.body?.getReader();
    if (!reader) {
      return {
        success: false,
        result: null,
        rawContent: "",
        promptTokens: 0,
        completionTokens: 0,
        error: "No response body",
      };
    }

    const decoder = new TextDecoder();
    let buffer = "";
    let stageResult: Partial<BigAdventureResult> | null = null;

    // Create a timeout checker
    const checkTimeout = () => {
      const elapsed = Date.now() - startTime;
      const sinceLast = Date.now() - lastHeartbeat;
      return elapsed > TIMEOUT_THRESHOLD_MS || sinceLast > HEARTBEAT_TIMEOUT_MS;
    };

    while (true) {
      // Check for timeout
      if (checkTimeout()) {
        reader.cancel();
        return {
          success: false,
          result: null,
          rawContent: fullContent,
          promptTokens,
          completionTokens,
          error: "Request timed out",
          timedOut: true,
        };
      }

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
          const event = JSON.parse(data);

          switch (event.type) {
            case "heartbeat":
              lastHeartbeat = Date.now();
              break;

            case "stage_start":
              callbacks.onStageStart(stage, getStageInfo(stage));
              break;

            case "stage_content":
              fullContent += event.content;
              callbacks.onStageContent(stage, event.content);
              lastHeartbeat = Date.now();
              break;

            case "stage_continuation":
              callbacks.onStageContinuation(
                stage,
                event.attempt,
                event.maxAttempts
              );
              lastHeartbeat = Date.now();
              break;

            case "stage_warning":
              callbacks.onStageWarning(stage, event.message);
              break;

            case "stage_complete":
              promptTokens = event.promptTokens || 0;
              completionTokens = event.completionTokens || 0;
              stageResult = event.partialResult;
              if (event.rawContent) {
                fullContent = event.rawContent;
              }
              break;

            case "done":
              return {
                success: event.result !== null,
                result: event.result,
                rawContent: event.rawContent || fullContent,
                promptTokens: event.meta?.usage?.promptTokens || promptTokens,
                completionTokens:
                  event.meta?.usage?.completionTokens || completionTokens,
              };

            case "error":
              return {
                success: false,
                result: null,
                rawContent: fullContent,
                promptTokens,
                completionTokens,
                error: event.error,
              };
          }
        } catch {
          // Skip malformed JSON
        }
      }
    }

    // If we got here without a done event, return what we have
    return {
      success: stageResult !== null,
      result: stageResult,
      rawContent: fullContent,
      promptTokens,
      completionTokens,
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return {
        success: false,
        result: null,
        rawContent: fullContent,
        promptTokens,
        completionTokens,
        error: "Generation cancelled",
      };
    }

    return {
      success: false,
      result: null,
      rawContent: fullContent,
      promptTokens,
      completionTokens,
      error: error instanceof Error ? error.message : String(error),
      timedOut: error instanceof Error && error.message.includes("timeout"),
    };
  }
}

/**
 * Orchestrate full adventure generation with sequential stage execution
 */
export async function generateAdventureSequential(
  config: BigAdventureConfig,
  options: GenerationOptions,
  callbacks: GenerationCallbacks
): Promise<void> {
  const stages = getStagesToRun(config);
  const completedStages: GenerationStage[] = options.skipStages
    ? [...options.skipStages]
    : [];
  const stageResults: (Partial<BigAdventureResult> | null)[] = [];
  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;

  // Initialize with existing results if resuming
  if (options.existingResults) {
    stageResults.push(options.existingResults);
  }

  callbacks.onProgress(completedStages, stages.length);

  for (const stage of stages) {
    // Skip already completed stages
    if (completedStages.includes(stage)) {
      continue;
    }

    // Check for abort
    if (options.abortSignal?.aborted) {
      callbacks.onError("Generation cancelled by user");
      return;
    }

    // Get merged previous results for context
    const previousResults =
      stageResults.length > 0
        ? mergeBigAdventureResults(...stageResults.filter((r) => r !== null))
        : undefined;

    let continuationCount = 0;
    let stageCompleted = false;
    let partialContent = ""; // Accumulated content for continuation

    while (
      !stageCompleted &&
      continuationCount <= MAX_CONTINUATIONS_PER_STAGE
    ) {
      const isContinuation = continuationCount > 0;

      if (isContinuation) {
        callbacks.onStageContinuation(
          stage,
          continuationCount,
          MAX_CONTINUATIONS_PER_STAGE
        );
      }

      const result = await generateSingleStage(
        config,
        stage,
        previousResults,
        options,
        callbacks,
        isContinuation ? partialContent : undefined
      );

      // Accumulate content regardless of success (for potential continuation)
      if (result.rawContent) {
        partialContent = result.rawContent;
      }

      if (result.success && result.result) {
        // Stage completed successfully
        stageResults.push(result.result);
        completedStages.push(stage);
        totalPromptTokens += result.promptTokens;
        totalCompletionTokens += result.completionTokens;

        callbacks.onStageComplete(
          stage,
          result.result,
          result.promptTokens,
          result.completionTokens
        );
        callbacks.onProgress(completedStages, stages.length);

        // Save autosave
        const mergedResults = mergeBigAdventureResults(
          ...stageResults.filter((r) => r !== null)
        );
        const autosave: BigAdventureAutosave = {
          id: options.sessionId,
          timestamp: Date.now(),
          config,
          completedStages,
          partialResults: mergedResults,
          currentStage: stage,
        };
        saveAutosave(autosave);
        callbacks.onAutosave(autosave);

        stageCompleted = true;
      } else if (
        result.timedOut &&
        continuationCount < MAX_CONTINUATIONS_PER_STAGE &&
        partialContent.length > 100
      ) {
        // Timeout with partial content - continue from where we left off
        continuationCount++;
        callbacks.onStageWarning(
          stage,
          `Connection timed out. Continuing from ${partialContent.length} characters... (${continuationCount}/${MAX_CONTINUATIONS_PER_STAGE})`
        );
        // Accumulate tokens from partial generation
        totalPromptTokens += result.promptTokens;
        totalCompletionTokens += result.completionTokens;
      } else {
        // Fatal error or max continuations exceeded or no content to continue from
        const errorMsg =
          result.timedOut && partialContent.length <= 100
            ? "Stage timed out with insufficient content to continue"
            : result.error || "Unknown error";
        callbacks.onStageError(stage, errorMsg, false);

        // Still save partial progress
        if (stageResults.length > 0) {
          const partialMerged = mergeBigAdventureResults(
            ...stageResults.filter((r) => r !== null)
          );
          const autosave: BigAdventureAutosave = {
            id: options.sessionId,
            timestamp: Date.now(),
            config,
            completedStages,
            partialResults: partialMerged,
            currentStage: stage,
          };
          saveAutosave(autosave);
          callbacks.onAutosave(autosave);
        }

        callbacks.onError(
          `Stage "${getStageInfo(stage).name}" failed: ${errorMsg}. ` +
            `Progress saved (${completedStages.length}/${stages.length} stages completed). ` +
            `You can resume later.`
        );
        return;
      }
    }
  }

  // All stages completed successfully
  const finalResult = mergeBigAdventureResults(
    ...stageResults.filter((r) => r !== null)
  );

  // Apply RPG system and NSFW settings
  if (finalResult.storyTemplate) {
    finalResult.storyTemplate.rpgSystem = config.rpgSystem;
    finalResult.storyTemplate.nsfw = config.nsfw;
  }

  callbacks.onComplete(finalResult, {
    prompt: totalPromptTokens,
    completion: totalCompletionTokens,
  });
}

/**
 * Generate a single stage (for retry/manual stage generation)
 */
export async function generateSingleStageOnly(
  config: BigAdventureConfig,
  stage: GenerationStage,
  previousResults: Partial<BigAdventureResult> | undefined,
  options: Omit<GenerationOptions, "skipStages" | "existingResults">,
  callbacks: Pick<
    GenerationCallbacks,
    | "onStageStart"
    | "onStageContent"
    | "onStageContinuation"
    | "onStageComplete"
    | "onStageError"
    | "onStageWarning"
  >,
  continueFrom?: string
): Promise<StageResult> {
  return generateSingleStage(
    config,
    stage,
    previousResults,
    options as GenerationOptions,
    callbacks as GenerationCallbacks,
    continueFrom
  );
}
