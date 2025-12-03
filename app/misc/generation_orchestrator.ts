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

import React from "react";
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

// Stages that must run sequentially (core and mechanics are required by later stages)
const SEQUENTIAL_STAGES: GenerationStage[] = ["core", "mechanics"];

// Stages that can run in parallel (only depend on core + mechanics, not each other)
const PARALLELIZABLE_STAGES: GenerationStage[] = [
  "content-lore",
  "content-achievements",
  "content-items",
  "advanced-presets",
  "advanced-tables",
  "advanced-other",
];

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
  finishEarlyRef?: React.RefObject<boolean | null>;
  /** Enable parallel generation for stages 3-8 (not supported with NovelAI) */
  parallelMode?: boolean;
}

interface StageResult {
  success: boolean;
  result: Partial<BigAdventureResult> | null;
  rawContent: string;
  promptTokens: number;
  completionTokens: number;
  error?: string;
  timedOut?: boolean;
  finishedEarly?: boolean;
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
        finishEarly: options.finishEarlyRef?.current || false,
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
      // Check if this was a "finish early" abort (ref was set before abort)
      const wasFinishEarly = options.finishEarlyRef?.current === true;
      return {
        success: false,
        result: null,
        rawContent: fullContent,
        promptTokens,
        completionTokens,
        error: wasFinishEarly ? "Finishing early..." : "Generation cancelled",
        finishedEarly: wasFinishEarly,
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
 * Generate a single stage with finishEarly flag set to wrap up the JSON
 * This is called after an abort when the user clicked "Finish Early"
 */
async function generateSingleStageFinishEarly(
  config: BigAdventureConfig,
  stage: GenerationStage,
  previousResults: Partial<BigAdventureResult> | undefined,
  options: GenerationOptions,
  callbacks: GenerationCallbacks,
  partialContent: string
): Promise<StageResult> {
  const token = await getAuthToken();
  if (!token) {
    return {
      success: false,
      result: null,
      rawContent: partialContent,
      promptTokens: 0,
      completionTokens: 0,
      error: "Not authenticated",
    };
  }

  try {
    // Make a request with finishEarly=true to wrap up the JSON
    // Note: We don't use the abortSignal here since we want this to complete
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
        continueFrom: partialContent,
        finishEarly: true,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        result: null,
        rawContent: partialContent,
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
        rawContent: partialContent,
        promptTokens: 0,
        completionTokens: 0,
        error: "No response body",
      };
    }

    const decoder = new TextDecoder();
    let buffer = "";
    let fullContent = partialContent;
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
          const event = JSON.parse(data);

          switch (event.type) {
            case "stage_content":
              fullContent += event.content;
              callbacks.onStageContent(stage, event.content);
              break;

            case "stage_complete":
              promptTokens = event.promptTokens || 0;
              completionTokens = event.completionTokens || 0;
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

    return {
      success: false,
      result: null,
      rawContent: fullContent,
      promptTokens,
      completionTokens,
      error: "Stream ended without completion",
    };
  } catch (error) {
    return {
      success: false,
      result: null,
      rawContent: partialContent,
      promptTokens: 0,
      completionTokens: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Orchestrate full adventure generation with sequential stage execution
 * If parallelMode is enabled, stages 3-8 will run concurrently after stages 1-2 complete
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

  // Determine which stages need sequential vs parallel processing
  const sequentialStagesToRun = stages.filter(
    (s) => SEQUENTIAL_STAGES.includes(s) && !completedStages.includes(s)
  );
  const parallelizableStagesToRun = stages.filter(
    (s) => PARALLELIZABLE_STAGES.includes(s) && !completedStages.includes(s)
  );

  // Check if we should use parallel mode (not for NovelAI)
  const useParallelMode =
    options.parallelMode &&
    !options.novelaiKey &&
    parallelizableStagesToRun.length > 1;

  // Phase 1: Run sequential stages (core, mechanics)
  for (const stage of sequentialStagesToRun) {
    const result = await runSingleStageWithRetry(
      config,
      stage,
      stageResults,
      completedStages,
      options,
      callbacks
    );

    if (!result.success) {
      // Error already handled by runSingleStageWithRetry
      return;
    }

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
  }

  // Phase 2: Run parallelizable stages
  if (parallelizableStagesToRun.length > 0) {
    // Get merged results from sequential stages for context
    const previousResults =
      stageResults.length > 0
        ? mergeBigAdventureResults(...stageResults.filter((r) => r !== null))
        : undefined;

    if (useParallelMode) {
      // Parallel execution
      const parallelResults = await runStagesInParallel(
        config,
        parallelizableStagesToRun,
        previousResults,
        options,
        callbacks
      );

      // Process results
      for (const { stage, result } of parallelResults) {
        if (result.success && result.result) {
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
        } else {
          // Log error but continue with other results
          callbacks.onStageError(
            stage,
            result.error || "Unknown error",
            false
          );
        }
      }

      callbacks.onProgress(completedStages, stages.length);

      // Save autosave after parallel phase
      if (stageResults.length > 0) {
        const mergedResults = mergeBigAdventureResults(
          ...stageResults.filter((r) => r !== null)
        );
        const autosave: BigAdventureAutosave = {
          id: options.sessionId,
          timestamp: Date.now(),
          config,
          completedStages,
          partialResults: mergedResults,
          currentStage: parallelizableStagesToRun[parallelizableStagesToRun.length - 1],
        };
        saveAutosave(autosave);
        callbacks.onAutosave(autosave);
      }
    } else {
      // Sequential execution for remaining stages
      for (const stage of parallelizableStagesToRun) {
        // Check for abort
        if (options.abortSignal?.aborted) {
          callbacks.onError("Generation cancelled by user");
          return;
        }

        // Get updated merged results
        const currentPreviousResults =
          stageResults.length > 0
            ? mergeBigAdventureResults(
                ...stageResults.filter((r) => r !== null)
              )
            : undefined;

        const result = await runSingleStageWithRetry(
          config,
          stage,
          stageResults,
          completedStages,
          options,
          callbacks,
          currentPreviousResults
        );

        if (!result.success) {
          // Error already handled
          return;
        }

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
      }
    }
  }

  // All stages completed (or at least some succeeded)
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
 * Run a single stage with retry/continuation logic
 */
async function runSingleStageWithRetry(
  config: BigAdventureConfig,
  stage: GenerationStage,
  stageResults: (Partial<BigAdventureResult> | null)[],
  completedStages: GenerationStage[],
  options: GenerationOptions,
  callbacks: GenerationCallbacks,
  previousResultsOverride?: Partial<BigAdventureResult>
): Promise<StageResult> {
  // Check for abort
  if (options.abortSignal?.aborted) {
    callbacks.onError("Generation cancelled by user");
    return {
      success: false,
      result: null,
      rawContent: "",
      promptTokens: 0,
      completionTokens: 0,
      error: "Cancelled",
    };
  }

  // Get merged previous results for context
  const previousResults =
    previousResultsOverride ||
    (stageResults.length > 0
      ? mergeBigAdventureResults(...stageResults.filter((r) => r !== null))
      : undefined);

  let continuationCount = 0;
  let partialContent = "";
  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;

  while (continuationCount <= MAX_CONTINUATIONS_PER_STAGE) {
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

    // Accumulate content regardless of success
    if (result.rawContent) {
      partialContent = result.rawContent;
    }

    if (result.success && result.result) {
      return {
        success: true,
        result: result.result,
        rawContent: partialContent,
        promptTokens: totalPromptTokens + result.promptTokens,
        completionTokens: totalCompletionTokens + result.completionTokens,
      };
    } else if (result.finishedEarly && partialContent.length > 100) {
      // Handle finish early
      callbacks.onStageWarning(
        stage,
        `Finishing early with ${partialContent.length} characters...`
      );

      totalPromptTokens += result.promptTokens;
      totalCompletionTokens += result.completionTokens;

      const wrapUpResult = await generateSingleStageFinishEarly(
        config,
        stage,
        previousResults,
        options,
        callbacks,
        partialContent
      );

      if (options.finishEarlyRef) {
        (options.finishEarlyRef as React.MutableRefObject<boolean>).current =
          false;
      }

      if (wrapUpResult.success && wrapUpResult.result) {
        return {
          success: true,
          result: wrapUpResult.result,
          rawContent: wrapUpResult.rawContent,
          promptTokens: totalPromptTokens + wrapUpResult.promptTokens,
          completionTokens: totalCompletionTokens + wrapUpResult.completionTokens,
        };
      } else {
        callbacks.onStageError(
          stage,
          wrapUpResult.error || "Failed to finish early",
          false
        );
        return {
          success: false,
          result: null,
          rawContent: partialContent,
          promptTokens: totalPromptTokens,
          completionTokens: totalCompletionTokens,
          error: wrapUpResult.error || "Failed to finish early",
        };
      }
    } else if (
      result.timedOut &&
      continuationCount < MAX_CONTINUATIONS_PER_STAGE &&
      partialContent.length > 100
    ) {
      // Continue from timeout
      continuationCount++;
      callbacks.onStageWarning(
        stage,
        `Connection timed out. Continuing from ${partialContent.length} characters... (${continuationCount}/${MAX_CONTINUATIONS_PER_STAGE})`
      );
      totalPromptTokens += result.promptTokens;
      totalCompletionTokens += result.completionTokens;
    } else {
      // Fatal error
      const errorMsg =
        result.timedOut && partialContent.length <= 100
          ? "Stage timed out with insufficient content to continue"
          : result.error || "Unknown error";
      callbacks.onStageError(stage, errorMsg, false);

      // Save partial progress
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
          `Progress saved (${completedStages.length}/${completedStages.length + 1} stages completed). ` +
          `You can resume later.`
      );

      return {
        success: false,
        result: null,
        rawContent: partialContent,
        promptTokens: totalPromptTokens,
        completionTokens: totalCompletionTokens,
        error: errorMsg,
      };
    }
  }

  // Should not reach here
  return {
    success: false,
    result: null,
    rawContent: partialContent,
    promptTokens: totalPromptTokens,
    completionTokens: totalCompletionTokens,
    error: "Max continuations exceeded",
  };
}

/**
 * Run multiple stages in parallel using Promise.allSettled
 */
async function runStagesInParallel(
  config: BigAdventureConfig,
  stages: GenerationStage[],
  previousResults: Partial<BigAdventureResult> | undefined,
  options: GenerationOptions,
  callbacks: GenerationCallbacks
): Promise<{ stage: GenerationStage; result: StageResult }[]> {
  // Notify about parallel execution
  callbacks.onStageWarning(
    stages[0],
    `Starting parallel generation of ${stages.length} stages...`
  );

  // Create promises for each stage
  const stagePromises = stages.map(async (stage) => {
    // Check for abort before starting
    if (options.abortSignal?.aborted) {
      return {
        stage,
        result: {
          success: false,
          result: null,
          rawContent: "",
          promptTokens: 0,
          completionTokens: 0,
          error: "Cancelled",
        } as StageResult,
      };
    }

    // Generate the stage
    let continuationCount = 0;
    let partialContent = "";
    let totalPromptTokens = 0;
    let totalCompletionTokens = 0;

    while (continuationCount <= MAX_CONTINUATIONS_PER_STAGE) {
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

      if (result.rawContent) {
        partialContent = result.rawContent;
      }

      if (result.success && result.result) {
        return {
          stage,
          result: {
            success: true,
            result: result.result,
            rawContent: partialContent,
            promptTokens: totalPromptTokens + result.promptTokens,
            completionTokens: totalCompletionTokens + result.completionTokens,
          } as StageResult,
        };
      } else if (
        result.timedOut &&
        continuationCount < MAX_CONTINUATIONS_PER_STAGE &&
        partialContent.length > 100
      ) {
        continuationCount++;
        totalPromptTokens += result.promptTokens;
        totalCompletionTokens += result.completionTokens;
      } else {
        return {
          stage,
          result: {
            success: false,
            result: null,
            rawContent: partialContent,
            promptTokens: totalPromptTokens + result.promptTokens,
            completionTokens: totalCompletionTokens + result.completionTokens,
            error: result.error || "Unknown error",
          } as StageResult,
        };
      }
    }

    return {
      stage,
      result: {
        success: false,
        result: null,
        rawContent: partialContent,
        promptTokens: totalPromptTokens,
        completionTokens: totalCompletionTokens,
        error: "Max continuations exceeded",
      } as StageResult,
    };
  });

  // Wait for all stages to complete (or fail)
  const settledResults = await Promise.allSettled(stagePromises);

  // Convert settled results to our format
  return settledResults.map((settled, index) => {
    if (settled.status === "fulfilled") {
      return settled.value;
    } else {
      return {
        stage: stages[index],
        result: {
          success: false,
          result: null,
          rawContent: "",
          promptTokens: 0,
          completionTokens: 0,
          error: settled.reason?.message || "Promise rejected",
        } as StageResult,
      };
    }
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
