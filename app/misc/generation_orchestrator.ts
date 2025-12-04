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
const HEARTBEAT_TIMEOUT_MS = 90000; // If no heartbeat for 90 seconds, assume timeout (increased for slow starts)
const MAX_RETRY_ATTEMPTS = 1; // On timeout, get 1 retry that asks AI to finish JSON immediately

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

// Stages that must run after all others (depend on full content)
const POST_STAGES: GenerationStage[] = ["icons"];

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

    // Helper to race read() against a timeout check
    // This prevents blocking indefinitely on slow streams
    const readWithTimeoutCheck = async (): Promise<
      | { done: boolean; value: Uint8Array | undefined; timedOut: false }
      | { timedOut: true }
    > => {
      // Check every 5 seconds while waiting for data
      const CHECK_INTERVAL_MS = 5000;

      return new Promise((resolve) => {
        let resolved = false;

        // Start the actual read
        reader.read().then(
          ({ done, value }) => {
            if (!resolved) {
              resolved = true;
              resolve({ done, value, timedOut: false });
            }
          },
          () => {
            // Read failed - treat as done
            if (!resolved) {
              resolved = true;
              resolve({ done: true, value: undefined, timedOut: false });
            }
          }
        );

        // Periodically check for timeout while read is pending
        const checkInterval = setInterval(() => {
          if (resolved) {
            clearInterval(checkInterval);
            return;
          }
          if (checkTimeout()) {
            resolved = true;
            clearInterval(checkInterval);
            resolve({ timedOut: true });
          }
        }, CHECK_INTERVAL_MS);
      });
    };

    while (true) {
      // Check for timeout before reading
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

      const readResult = await readWithTimeoutCheck();

      // Handle timeout during read
      if (readResult.timedOut) {
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

      const { done, value } = readResult;
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
      // Parallel execution - callbacks are fired as each stage completes
      // Pass existing completed stages and results for incremental autosave
      const parallelResults = await runStagesInParallel(
        config,
        parallelizableStagesToRun,
        previousResults,
        options,
        callbacks,
        completedStages,
        stageResults
      );

      // Collect results (callbacks and autosaves already fired in runStagesInParallel)
      for (const { stage, result } of parallelResults) {
        if (result.success && result.result) {
          stageResults.push(result.result);
          completedStages.push(stage);
          totalPromptTokens += result.promptTokens;
          totalCompletionTokens += result.completionTokens;
        }
        // Errors already reported via callbacks in runStagesInParallel
      }

      callbacks.onProgress(completedStages, stages.length);

      // Note: Autosave is now handled incrementally inside runStagesInParallel
      // so we don't need to save again here
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

  // Phase 3: Post-stages (icons) - run after all content is generated
  const postStagesToRun = stages.filter(
    (s) => POST_STAGES.includes(s) && !completedStages.includes(s)
  );

  for (const stage of postStagesToRun) {
    // Check for abort
    if (options.abortSignal?.aborted) {
      callbacks.onError("Generation cancelled by user");
      return;
    }

    // Get complete merged results for icon assignment context
    const currentPreviousResults =
      stageResults.length > 0
        ? mergeBigAdventureResults(...stageResults.filter((r) => r !== null))
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
      // Icon stage is optional - don't fail the whole generation
      console.warn(`Post-stage ${stage} failed, continuing without it`);
      continue;
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
        currentStage: stage,
      };
      saveAutosave(autosave);
      callbacks.onAutosave(autosave);
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
 * Run a single stage with retry logic
 * On timeout/failure: get 1 retry that asks AI to finish JSON immediately
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

  let retryCount = 0;
  let partialContent = "";
  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;

  while (retryCount <= MAX_RETRY_ATTEMPTS) {
    const isRetry = retryCount > 0;

    if (isRetry) {
      callbacks.onStageContinuation(stage, retryCount, MAX_RETRY_ATTEMPTS);
    }

    const result = await generateSingleStage(
      config,
      stage,
      previousResults,
      options,
      callbacks,
      undefined // Don't continue from partial - we'll use finish early instead
    );

    // Accumulate content regardless of success
    if (result.rawContent) {
      partialContent = result.rawContent;
    }
    totalPromptTokens += result.promptTokens;
    totalCompletionTokens += result.completionTokens;

    if (result.success && result.result) {
      return {
        success: true,
        result: result.result,
        rawContent: partialContent,
        promptTokens: totalPromptTokens,
        completionTokens: totalCompletionTokens,
      };
    } else if (result.finishedEarly && partialContent.length > 100) {
      // Handle user-triggered finish early
      callbacks.onStageWarning(
        stage,
        `Finishing early with ${partialContent.length} characters...`
      );

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
          completionTokens:
            totalCompletionTokens + wrapUpResult.completionTokens,
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
      (result.timedOut || result.error) &&
      retryCount < MAX_RETRY_ATTEMPTS &&
      partialContent.length > 100
    ) {
      // On timeout or error with partial content: retry by asking AI to finish JSON immediately
      retryCount++;
      callbacks.onStageWarning(
        stage,
        `Timeout/error with ${partialContent.length} chars. Retrying with finish-now request...`
      );

      // Use finish early to wrap up what we have
      const wrapUpResult = await generateSingleStageFinishEarly(
        config,
        stage,
        previousResults,
        options,
        callbacks,
        partialContent
      );

      totalPromptTokens += wrapUpResult.promptTokens;
      totalCompletionTokens += wrapUpResult.completionTokens;

      if (wrapUpResult.success && wrapUpResult.result) {
        return {
          success: true,
          result: wrapUpResult.result,
          rawContent: wrapUpResult.rawContent,
          promptTokens: totalPromptTokens,
          completionTokens: totalCompletionTokens,
        };
      }
      // If wrap-up failed, continue to error handling below
      partialContent = wrapUpResult.rawContent || partialContent;
    } else if (!result.success) {
      // Failed without timeout/error flags - treat as fatal error on first attempt
      // This prevents infinite loops when the stage just returns success=false
      retryCount = MAX_RETRY_ATTEMPTS; // Force exit on next check
    }

    // Fatal error - no more retries or insufficient content
    if (retryCount >= MAX_RETRY_ATTEMPTS || partialContent.length <= 100) {
      const errorMsg =
        result.timedOut && partialContent.length <= 100
          ? "Stage timed out with insufficient content to recover"
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
          `Progress saved (${completedStages.length}/${
            completedStages.length + 1
          } stages completed). ` +
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
 * Run multiple stages in parallel, processing each result as it completes
 * Saves autosave incrementally as each stage completes
 */
async function runStagesInParallel(
  config: BigAdventureConfig,
  stages: GenerationStage[],
  previousResults: Partial<BigAdventureResult> | undefined,
  options: GenerationOptions,
  callbacks: GenerationCallbacks,
  existingCompletedStages: GenerationStage[],
  existingStageResults: (Partial<BigAdventureResult> | null)[]
): Promise<{ stage: GenerationStage; result: StageResult }[]> {
  // Notify about parallel execution
  callbacks.onStageWarning(
    stages[0],
    `Starting parallel generation of ${stages.length} stages...`
  );

  const results: { stage: GenerationStage; result: StageResult }[] = [];

  // Track completed stages and results for incremental autosave
  const parallelCompletedStages: GenerationStage[] = [];
  const parallelStageResults: (Partial<BigAdventureResult> | null)[] = [];

  // Create a promise for each stage that resolves when done
  const stagePromises = stages.map(async (stage) => {
    // Check for abort before starting
    if (options.abortSignal?.aborted) {
      const result = {
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
      results.push(result);
      return result;
    }

    // Generate the stage with simple retry logic
    let retryCount = 0;
    let partialContent = "";
    let totalPromptTokens = 0;
    let totalCompletionTokens = 0;

    while (retryCount <= MAX_RETRY_ATTEMPTS) {
      const isRetry = retryCount > 0;

      if (isRetry) {
        callbacks.onStageContinuation(stage, retryCount, MAX_RETRY_ATTEMPTS);
      }

      const genResult = await generateSingleStage(
        config,
        stage,
        previousResults,
        options,
        callbacks,
        undefined // Don't continue from partial
      );

      if (genResult.rawContent) {
        partialContent = genResult.rawContent;
      }
      totalPromptTokens += genResult.promptTokens;
      totalCompletionTokens += genResult.completionTokens;

      if (genResult.success && genResult.result) {
        const stageResult = {
          stage,
          result: {
            success: true,
            result: genResult.result,
            rawContent: partialContent,
            promptTokens: totalPromptTokens,
            completionTokens: totalCompletionTokens,
          } as StageResult,
        };
        results.push(stageResult);

        // Track this stage's completion for autosave
        parallelCompletedStages.push(stage);
        parallelStageResults.push(genResult.result);

        // Immediately notify that this stage is complete
        callbacks.onStageComplete(
          stage,
          genResult.result,
          stageResult.result.promptTokens,
          stageResult.result.completionTokens
        );

        // Save autosave immediately after each parallel stage completes
        const allCompletedStages = [
          ...existingCompletedStages,
          ...parallelCompletedStages,
        ];
        const allStageResults = [
          ...existingStageResults,
          ...parallelStageResults,
        ];
        const mergedResults = mergeBigAdventureResults(
          ...allStageResults.filter((r) => r !== null)
        );
        const autosave: BigAdventureAutosave = {
          id: options.sessionId,
          timestamp: Date.now(),
          config,
          completedStages: allCompletedStages,
          partialResults: mergedResults,
          currentStage: stage,
        };
        saveAutosave(autosave);
        callbacks.onAutosave(autosave);

        return stageResult;
      } else if (
        (genResult.timedOut || genResult.error) &&
        retryCount < MAX_RETRY_ATTEMPTS &&
        partialContent.length > 100
      ) {
        // On timeout/error with partial content: retry by asking AI to finish JSON immediately
        retryCount++;
        callbacks.onStageWarning(
          stage,
          `Timeout/error with ${partialContent.length} chars. Retrying with finish-now request...`
        );

        const wrapUpResult = await generateSingleStageFinishEarly(
          config,
          stage,
          previousResults,
          options,
          callbacks,
          partialContent
        );

        totalPromptTokens += wrapUpResult.promptTokens;
        totalCompletionTokens += wrapUpResult.completionTokens;

        if (wrapUpResult.success && wrapUpResult.result) {
          const stageResult = {
            stage,
            result: {
              success: true,
              result: wrapUpResult.result,
              rawContent: wrapUpResult.rawContent,
              promptTokens: totalPromptTokens,
              completionTokens: totalCompletionTokens,
            } as StageResult,
          };
          results.push(stageResult);

          // Track this stage's completion for autosave
          parallelCompletedStages.push(stage);
          parallelStageResults.push(wrapUpResult.result);

          callbacks.onStageComplete(
            stage,
            wrapUpResult.result,
            stageResult.result.promptTokens,
            stageResult.result.completionTokens
          );

          // Save autosave immediately after each parallel stage completes
          const allCompletedStages = [
            ...existingCompletedStages,
            ...parallelCompletedStages,
          ];
          const allStageResults = [
            ...existingStageResults,
            ...parallelStageResults,
          ];
          const mergedResults = mergeBigAdventureResults(
            ...allStageResults.filter((r) => r !== null)
          );
          const autosave: BigAdventureAutosave = {
            id: options.sessionId,
            timestamp: Date.now(),
            config,
            completedStages: allCompletedStages,
            partialResults: mergedResults,
            currentStage: stage,
          };
          saveAutosave(autosave);
          callbacks.onAutosave(autosave);

          return stageResult;
        }
        // If wrap-up failed, continue to error handling
        partialContent = wrapUpResult.rawContent || partialContent;
      }

      // Fatal error - no more retries or insufficient content
      if (retryCount >= MAX_RETRY_ATTEMPTS || partialContent.length <= 100) {
        const stageResult = {
          stage,
          result: {
            success: false,
            result: null,
            rawContent: partialContent,
            promptTokens: totalPromptTokens,
            completionTokens: totalCompletionTokens,
            error: genResult.error || "Unknown error",
          } as StageResult,
        };
        results.push(stageResult);

        // Immediately notify that this stage failed
        callbacks.onStageError(
          stage,
          stageResult.result.error || "Unknown error",
          false
        );

        return stageResult;
      }
    }

    const stageResult = {
      stage,
      result: {
        success: false,
        result: null,
        rawContent: partialContent,
        promptTokens: totalPromptTokens,
        completionTokens: totalCompletionTokens,
        error: "Max retries exceeded",
      } as StageResult,
    };
    results.push(stageResult);

    // Immediately notify that this stage failed
    callbacks.onStageError(stage, "Max retries exceeded", false);

    return stageResult;
  });

  // Wait for all stages to complete (callbacks already fired as each finished)
  await Promise.allSettled(stagePromises);

  return results;
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
