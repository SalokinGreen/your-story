/**
 * Frontend Generation Module
 *
 * Orchestrates AI generation flow entirely on the frontend.
 * - Builds prompts/context using ai_staged.ts
 * - Calls simplified /api/generate-stream endpoint
 * - Executes tools locally on storyData
 * - Parses choices from AI response
 *
 * The backend is now just a thin AI proxy.
 */

import {
  StoryData,
  CommandResponse,
  Choice,
  ScenePart,
  ActionAnalysis,
  MemoryEntry,
} from "@/app/misc/structs";
import {
  buildStoryPrompt,
  buildToolPrompt,
  buildChoicesPrompt,
  buildActionAnalysisPrompt,
  ChatMessage,
  EmbeddingContext,
  STORY_AFFIRMATION,
  TOOLS_AFFIRMATION,
  CHOICES_AFFIRMATION,
} from "@/app/misc/ai_staged";
import { executeTools, ToolCall } from "@/app/misc/toolExecutor";
import { TOOL_SCHEMAS } from "@/app/misc/toolSchemas";
import { getAuthToken } from "@/app/misc/getAuthToken";
import { logger } from "@/app/misc/logger";
import {
  findStatMatch,
  findResourceMatch,
  findItemMatch,
  findAbilityMatch,
} from "@/app/misc/fuzzyMatch";
import {
  getRelevantContextForGeneration,
  syncNewMemories,
} from "@/app/misc/embeddings";
import {
  SamplingSettings,
  getSamplingSettings,
  filterSettingsForProvider,
} from "@/app/misc/samplingSettings";

// ============================================================
// TYPES
// ============================================================

/**
 * Strip affirmation prefill from AI response.
 * When using prefill, some providers (like Mistral) include the prefill text
 * in the response. This function removes it.
 */
function stripAffirmationPrefill(content: string, affirmation: string): string {
  if (!content) return content;

  // Check if the content starts with the affirmation (possibly with minor whitespace differences)
  const trimmedContent = content.trimStart();
  const trimmedAffirmation = affirmation.trim();

  if (trimmedContent.startsWith(trimmedAffirmation)) {
    return trimmedContent.slice(trimmedAffirmation.length).trimStart();
  }

  // Also check for partial matches at the beginning (streaming might have slight variations)
  // Look for the marker that ends the affirmation
  const storyMarker = "NO meta-text.";
  const toolsMarker = "step-by-step.";
  const choicesMarker = "Generating choices:";

  for (const marker of [storyMarker, toolsMarker, choicesMarker]) {
    const markerIndex = trimmedContent.indexOf(marker);
    if (markerIndex !== -1 && markerIndex < 500) {
      // Only strip if marker is near the beginning
      return trimmedContent.slice(markerIndex + marker.length).trimStart();
    }
  }

  return content;
}

export interface GenerationOptions {
  storyModel: string;
  toolsModel: string;
  choicesModel: string;
  enableTools: boolean;
  maxToolLoops?: number;
  skipChoices?: boolean;
  customMaxContext?: number;
  customMaxOutput?: number;
  // NovelAI BYOK support (story stage only)
  novelaiEnabled?: boolean;
  novelaiKey?: string;
  novelaiTemperature?: number;
  // BYOK API keys (required for non-NovelAI models)
  openRouterKey?: string;
  deepseekKey?: string;
  googleKey?: string;
  // Embedding-based context retrieval
  storyId?: string; // Required for embedding search
  enableEmbeddings?: boolean; // Whether to use embedding-based context
  embeddingThreshold?: number; // Similarity threshold (0.1-0.5, default 0.25)
  // Sampling settings (for story stage only, Coins mode)
  samplingSettings?: SamplingSettings;
  // Role Affirmation (prefill) - primes model to follow output constraints
  usePrefill?: boolean; // Default: true
}

export interface GenerationCallbacks {
  onStoryStart?: () => void;
  onStoryContent?: (content: string, fullContent: string) => void;
  onStoryComplete?: (content: string, usage: TokenUsage) => void;
  onToolsStart?: () => void;
  onToolsComplete?: (
    toolCalls: ToolCall[],
    responses: CommandResponse[],
    stateChanges: string[],
    usage: TokenUsage
  ) => void;
  onChoicesStart?: () => void;
  onChoicesComplete?: (choices: Choice[], usage: TokenUsage) => void;
  onComplete?: (result: GenerationResult) => void;
  onError?: (error: Error) => void;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface GenerationMeta {
  model: string;
  modelName: string;
  provider: string;
  usage: TokenUsage;
  tokenCost: number;
  balance: number;
}

export interface GenerationResult {
  success: boolean;
  content: string;
  toolCalls: ToolCall[];
  toolResponses: CommandResponse[];
  stateChanges: string[];
  choices: Choice[];
  scenePart: ScenePart;
  meta: {
    storyMeta?: GenerationMeta;
    toolsMeta?: GenerationMeta;
    choicesMeta?: GenerationMeta;
    totalTokenCost: number;
    balance: number;
  };
}

// ============================================================
// STREAM PARSER
// ============================================================

interface StreamEvent {
  type: "content" | "tool_calls" | "done" | "error";
  content?: string;
  toolCalls?: ToolCall[];
  meta?: GenerationMeta;
  error?: string;
}

async function* parseSSEStream(
  response: Response
): AsyncGenerator<StreamEvent> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("No response body");

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();

    // Append new data to buffer if available
    if (value) {
      const chunk = decoder.decode(value, { stream: true });
      buffer += chunk;
    }

    // Process all complete lines in buffer
    const lines = buffer.split("\n");
    // Keep the last incomplete line in buffer
    buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith("data:")) continue;

      const data = trimmed.slice(5).trim();
      if (data === "[DONE]") continue;

      try {
        const parsed: StreamEvent = JSON.parse(data);
        yield parsed;
      } catch {
        // Skip malformed JSON events
      }
    }

    // Only break AFTER processing - ensures we catch final events
    if (done) {
      // Process any remaining data in buffer after stream closes
      if (buffer.trim()) {
        const trimmed = buffer.trim();
        if (trimmed.startsWith("data:")) {
          const data = trimmed.slice(5).trim();
          if (data !== "[DONE]") {
            try {
              const parsed: StreamEvent = JSON.parse(data);
              yield parsed;
            } catch {
              // Skip malformed JSON events
            }
          }
        }
      }
      break;
    }
  }
}

// ============================================================
// CHOICE PARSER
// ============================================================

function parseChoices(content: string, storyData: StoryData): Choice[] {
  const lines = content
    .split("\n")
    .map((l) => l.trim())
    // strip common bullet prefixes: -, *, •
    .map((l) => l.replace(/^[\-\*\u2022]\s+/, ""))
    .filter((l) => l.length > 0);

  return lines.map((line) => {
    // Extract metadata from angle brackets: <use_skill: ...; use_item: ...; etc>
    const metaMatch = line.match(/<([^>]+)>/);
    // Remove angle brackets from the END of the line for clean display text
    const text = line.replace(/\s*<[^>]*>\s*$/, "").trim();

    const choice: Choice = { text };

    if (metaMatch) {
      const metadata = metaMatch[1];

      // Parse use_skill: name (DC number) or (X success(es) needed/required)
      const skillMatch = metadata.match(
        /use_skill:\s*([^(;]+?)(?:\s*\((?:DC\s*(\d+)|(?:needs?\s*)?(\d+)\s*succ(?:ess)?(?:es)?\s*(?:needed|required)?)\))?(?:;|$)/i
      );
      if (skillMatch) {
        const skillName = skillMatch[1].trim();
        if (skillName.toLowerCase() !== "none") {
          choice.skill_used = skillName;
          // Try DC format first (group 2), then success count format (group 3)
          const dc = skillMatch[2] || skillMatch[3];
          if (dc) {
            choice.skill_dc = parseInt(dc, 10);
          }
        }
      }

      // Parse use_resource: name (automatically at risk on failure)
      const resourceMatch = metadata.match(/use_resource:\s*([^;]+?)(?:;|$)/i);
      if (resourceMatch) {
        // Strip DC notation like "(DC 6)" and clean up the name
        let resourceName = resourceMatch[1]
          .trim()
          .replace(/\s*\(DC\s*\d+\)/gi, "")
          .replace(
            /\s*\(\d+\s*succ(?:ess)?(?:es)?\s*(?:needed|required)?\)/gi,
            ""
          )
          .trim();
        if (resourceName.toLowerCase() !== "none" && resourceName.length > 0) {
          choice.resource_used = resourceName;
        }
      }

      // Parse use_item: name
      const itemMatch = metadata.match(/use_item:\s*([^;]+?)(?:;|$)/i);
      if (itemMatch) {
        // Strip DC notation like "(DC 6)" and clean up the name
        let itemName = itemMatch[1]
          .trim()
          .replace(/\s*\(DC\s*\d+\)/gi, "")
          .replace(
            /\s*\(\d+\s*succ(?:ess)?(?:es)?\s*(?:needed|required)?\)/gi,
            ""
          )
          .trim();
        if (itemName.toLowerCase() !== "none" && itemName.length > 0) {
          choice.item_used = itemName;
        }
      }

      // Parse agmt_check: question (likelihood)
      const agmtCheckMatch = metadata.match(/agmt_check:\s*([^;]+?)(?:;|$)/i);
      if (agmtCheckMatch) {
        const agmtCheck = agmtCheckMatch[1].trim();
        if (agmtCheck.toLowerCase() !== "none") {
          choice.agmt_check = agmtCheck;
        }
      }

      // Parse unified table: field (replaces both agmt_table and custom_table)
      const tableMatch = metadata.match(/table:\s*([^;]+?)(?:;|$)/i);
      if (tableMatch) {
        const tableName = tableMatch[1].trim();
        if (tableName.toLowerCase() !== "none") {
          choice.table = tableName;
        }
      }

      // Legacy support: Parse agmt_table: category (migrate to unified table field)
      const agmtTableMatch = metadata.match(/agmt_table:\s*([^;]+?)(?:;|$)/i);
      if (agmtTableMatch && !choice.table) {
        const agmtTable = agmtTableMatch[1].trim();
        if (agmtTable.toLowerCase() !== "none") {
          choice.table = agmtTable;
        }
      }

      // Legacy support: Parse custom_table: table name (migrate to unified table field)
      const customTableMatch = metadata.match(
        /custom_table:\s*([^;]+?)(?:;|$)/i
      );
      if (customTableMatch && !choice.table) {
        const customTable = customTableMatch[1].trim();
        if (customTable.toLowerCase() !== "none") {
          choice.table = customTable;
        }
      }
    }

    return choice;
  });
}

// ============================================================
// MAIN GENERATION FUNCTION
// ============================================================

export async function generateStoryTurn(
  storyData: StoryData,
  userChoice: string,
  options: GenerationOptions,
  callbacks: GenerationCallbacks,
  commandResponses?: CommandResponse[]
): Promise<GenerationResult> {
  const token = await getAuthToken();
  if (!token) {
    const error = new Error("Not authenticated");
    callbacks.onError?.(error);
    throw error;
  }

  let totalTokenCost = 0;
  let finalBalance = 0;
  let storyContent = "";
  let allToolCalls: ToolCall[] = [];
  let allToolResponses: CommandResponse[] = [];
  let allStateChanges: string[] = [];
  let choices: Choice[] = [];
  let storyMeta: GenerationMeta | undefined;
  let toolsMeta: GenerationMeta | undefined;
  let choicesMeta: GenerationMeta | undefined;

  try {
    // ========================================
    // STAGE 0: Embedding-based context retrieval (if enabled)
    // ========================================
    let embeddingContext: EmbeddingContext | undefined;

    if (options.enableEmbeddings && options.storyId) {
      logger.action("Stage 0: Retrieving embedding context");

      try {
        // Get recent story parts for context
        const recentParts = storyData.scene.parts
          .filter((p) => !p.user)
          .slice(-3)
          .map((p) => p.content);

        const contextResult = await getRelevantContextForGeneration(
          options.storyId,
          userChoice,
          recentParts,
          token,
          {
            loreLimit: 10,
            memoryLimit: 20,
            minSimilarity: options.embeddingThreshold ?? 0.25,
          }
        );

        if (!contextResult.error) {
          embeddingContext = {
            loreTitles: contextResult.loreTitles,
            memories: contextResult.memories,
          };
          logger.action("Embedding context retrieved", {
            loreCount: embeddingContext.loreTitles.length,
            memoryCount: embeddingContext.memories.length,
          });
        } else {
          logger.action("Embedding search failed, falling back to triggers", {
            error: contextResult.error,
          });
        }
      } catch (embeddingError: unknown) {
        // Non-fatal: fall back to trigger-based context
        const message =
          embeddingError instanceof Error
            ? embeddingError.message
            : "Unknown error";
        logger.action("Embedding retrieval error, falling back to triggers", {
          error: message,
        });
      }
    }

    // ========================================
    // STAGE 1: Story Generation
    // ========================================
    callbacks.onStoryStart?.();
    logger.action("Stage 1: Building story prompt");

    const storyPrompt = buildStoryPrompt({
      storyData,
      userChoice,
      commandResponses,
      modelName: options.storyModel,
      customMaxContext: options.customMaxContext,
      embeddingContext,
      usePrefill: options.usePrefill !== false, // Default to true
    });

    // Clear pending player actions after they've been included in the prompt
    // (they were shown to the AI in the user choice message)
    if (
      storyData.pendingPlayerActions &&
      storyData.pendingPlayerActions.length > 0
    ) {
      logger.action(
        `Included ${storyData.pendingPlayerActions.length} pending player actions in prompt`
      );
      storyData.pendingPlayerActions = [];
    }

    if (storyPrompt.prunedParts > 0) {
      logger.action(
        `Pruned ${storyPrompt.prunedParts} oldest scene parts to fit context`
      );
    }

    // Determine which API to use for story generation
    const useNovelAI = options.novelaiEnabled && options.novelaiKey;

    let storyResponse: Response;
    if (useNovelAI) {
      // Use NovelAI for story generation (BYOK)
      logger.action("Using NovelAI for story generation (BYOK)");
      storyResponse = await fetch("/api/novelai/generate-stream", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          messages: storyPrompt.messages,
          novelaiKey: options.novelaiKey,
          maxTokens: options.customMaxOutput || 2000,
          temperature: options.novelaiTemperature ?? 1,
        }),
      });
    } else {
      // Use standard API (DeepSeek/OpenRouter/Mistral/DeepInfra)
      // Build request body with optional sampling settings
      const storyRequestBody: Record<string, unknown> = {
        messages: storyPrompt.messages,
        model: options.storyModel,
        maxTokens: options.customMaxOutput || 4000,
        temperature: options.samplingSettings?.temperature ?? 0.7,
        openRouterKey: options.openRouterKey,
        deepseekKey: options.deepseekKey,
        googleKey: options.googleKey,
        // Stop the AI before it generates GM state updates (handled by tools stage)
        // Also stop on [STOP] marker for player agency stopping points
        stop: ["[GM State Update]", "[GM State", "[STOP]"],
      };

      // Add sampling settings for Coins mode (Mistral/DeepInfra)
      if (options.samplingSettings) {
        storyRequestBody.samplingSettings = options.samplingSettings;
      }

      storyResponse = await fetch("/api/generate-stream", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(storyRequestBody),
      });
    }

    // Debug: Log maxTokens being sent
    console.log(
      "[Generation] Story stage - maxTokens:",
      options.customMaxOutput || 4000,
      "model:",
      options.storyModel
    );

    if (!storyResponse.ok) {
      const errorText = await storyResponse.text().catch(() => "");
      throw new Error(
        `Story generation failed: ${storyResponse.status} - ${errorText}`
      );
    }

    // Process story stream with real-time prefill stripping
    // We buffer content until we find the marker, then stream only the actual story
    const usePrefill = options.usePrefill !== false;
    let prefillStripped = !usePrefill; // If prefill disabled, consider it already "stripped"
    let dividerStripped = false; // Track if we've stripped leading dividers
    let rawContent = ""; // Buffer for finding the marker
    let pendingContent = ""; // Buffer for stripping dividers after marker
    const STORY_MARKER = "Here is the narrative:";

    for await (const event of parseSSEStream(storyResponse)) {
      if (event.type === "error") {
        throw new Error(event.error || "Story generation failed");
      }
      if (event.type === "content" && event.content) {
        if (prefillStripped && dividerStripped) {
          // Already past prefill and dividers, stream directly
          storyContent += event.content;
          callbacks.onStoryContent?.(event.content, storyContent);
        } else if (prefillStripped && !dividerStripped) {
          // Past prefill but still checking for dividers
          pendingContent += event.content;

          // Strip ALL leading whitespace and dividers (loop to catch multiple)
          let cleaned = pendingContent.trimStart();
          while (/^[-*_]{3,}/.test(cleaned)) {
            cleaned = cleaned.replace(/^[-*_]{3,}[\s\n]*/, "").trimStart();
          }

          // If we have actual content (not just potential divider chars), we're done stripping
          if (cleaned.length > 0 && !/^[-*_]+$/.test(cleaned)) {
            dividerStripped = true;
            storyContent = cleaned;
            callbacks.onStoryContent?.(cleaned, storyContent);
          } else if (pendingContent.length > 100) {
            // After 100 chars, just emit whatever we have (increased buffer for multiple dividers)
            dividerStripped = true;
            storyContent = cleaned || pendingContent.trimStart();
            if (storyContent) {
              callbacks.onStoryContent?.(storyContent, storyContent);
            }
          }
        } else {
          // Still looking for the marker
          rawContent += event.content;

          // Check if we've found the marker
          const markerIndex = rawContent.indexOf(STORY_MARKER);
          if (markerIndex !== -1) {
            // Found it! Extract content after the marker
            let contentAfterMarker = rawContent
              .slice(markerIndex + STORY_MARKER.length)
              .trimStart();
            // Strip leading dividers (---, ***, ___)
            while (/^[-*_]{3,}/.test(contentAfterMarker)) {
              contentAfterMarker = contentAfterMarker
                .replace(/^[-*_]{3,}[\s\n]*/, "")
                .trimStart();
            }
            prefillStripped = true;

            // Check if we have actual content or need to keep buffering for dividers
            if (
              contentAfterMarker.length > 0 &&
              !/^[-*_]+$/.test(contentAfterMarker)
            ) {
              storyContent = contentAfterMarker;
              dividerStripped = true;
              callbacks.onStoryContent?.(contentAfterMarker, storyContent);
            } else {
              // Content might be empty or just divider chars, buffer it
              pendingContent = contentAfterMarker;
            }
          } else if (rawContent.length > 800) {
            // Marker not found after 800 chars - assume no prefill, stream everything
            storyContent = rawContent;
            prefillStripped = true;
            dividerStripped = true;
            callbacks.onStoryContent?.(rawContent, storyContent);
          }
          // Otherwise keep buffering
        }
      }
      if (event.type === "done" && event.meta) {
        storyMeta = event.meta;
        totalTokenCost += event.meta.tokenCost;
        finalBalance = event.meta.balance;
      }
    }

    // Handle any pending content that wasn't emitted
    if (prefillStripped && !dividerStripped && pendingContent) {
      let cleaned = pendingContent
        .replace(/^[\s\n]*([-*_]{3,})[\s\n]*/g, "")
        .trimStart();
      storyContent = cleaned || pendingContent.trimStart();
    }

    // If we never found the marker but have buffered content, use it as-is
    if (!prefillStripped && rawContent) {
      storyContent = rawContent;
    }

    // Strip [STOP] marker and partial variants if the model added it
    // Handles: [STOP], [STOP, [STO, [ST, ---[STOP], ***[STOP], etc.
    storyContent = storyContent
      .replace(/\s*[-*_]{0,3}\s*\[STOP\]?\s*$/i, "")
      .replace(/\s*\[STO?P?\s*$/i, "")
      .replace(/\s*\[S\s*$/i, "")
      .replace(/\s*[-*]{3}\s*\[\s*$/i, "") // ---[ or ***[
      .replace(/\s*[-*]{3}\s*$/i, "") // trailing --- or ***
      .trimEnd();

    // Strip trailing meta-blocks that start with dividers (---, ***) followed by bracketed content
    // Patterns like: "--- [GM State Update] ..." or "--- *[STOP – Player must choose...]*"
    storyContent = storyContent
      .replace(
        /\n*[-*_]{3,}\s*\*?\[(?:GM State Update|STOP)[^\]]*\][\s\S]*$/i,
        ""
      )
      .trimEnd();

    // Strip leading dividers (---, ***, ___) that the model might add
    // Loop to handle multiple dividers or whitespace-separated dividers
    while (/^[\s\n]*([-*_]{3,})/.test(storyContent)) {
      storyContent = storyContent.replace(/^[\s\n]*([-*_]{3,})[\s\n]*/, "");
    }
    storyContent = storyContent.trimStart();

    // Strip trailing dividers (---, ***, ___) that the model might add
    // Also catches \n--- and \n*** patterns at the end
    while (/\n?[-*_]{3,}[\s\n]*$/.test(storyContent)) {
      storyContent = storyContent.replace(/\n?[-*_]{3,}[\s\n]*$/, "");
    }
    storyContent = storyContent.trimEnd();

    // Strip [GM State Update] blocks that the model might echo from history
    // These blocks contain bullet-pointed stat changes like "• Health: 95 → 85/100 (-10)"
    // Match the header and all following lines that are bullet points or indented content
    storyContent = storyContent
      .replace(/\n*\[GM State Update\]\n(?:• [^\n]+\n?)*/gi, "")
      .trim();

    // Also strip if there's no header but just the bullet-style state changes at the end
    // Pattern: lines starting with • containing arrows (→) indicating stat changes
    storyContent = storyContent
      .replace(/\n+(?:• [^\n]*→[^\n]*\n?)+$/, "")
      .trim();

    callbacks.onStoryComplete?.(
      storyContent,
      storyMeta?.usage || {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
      }
    );
    logger.action("Stage 1 complete", { contentLength: storyContent.length });

    // ========================================
    // STAGE 2 & 3: Tools + Choices (in parallel)
    // ========================================

    // Helper function for tools generation
    const runToolGeneration = async (): Promise<void> => {
      if (!options.enableTools) return;

      callbacks.onToolsStart?.();
      logger.action("Stage 2: Building tool prompt (parallel)");

      const maxToolLoops = options.maxToolLoops || 1;
      let toolLoopCount = 0;

      // Fallback model for rate limits
      const FALLBACK_TOOLS_MODEL = "MiniMax M2";

      while (toolLoopCount < maxToolLoops) {
        toolLoopCount++;

        const toolPrompt = buildToolPrompt({
          storyData,
          storyContent,
          existingToolCalls: allToolCalls,
          existingToolResponses: allToolResponses,
          embeddingContext,
          usePrefill: options.usePrefill !== false, // Default to true
        });

        // Try primary model first, then fallback on rate limit
        const modelsToTry = [options.toolsModel];
        if (options.toolsModel !== FALLBACK_TOOLS_MODEL) {
          modelsToTry.push(FALLBACK_TOOLS_MODEL);
        }

        let lastError: Error | null = null;
        let success = false;
        let newToolCalls: ToolCall[] = [];

        for (const currentModel of modelsToTry) {
          if (success) break;

          // Add timeout to prevent infinite hanging
          const toolAbortController = new AbortController();
          const toolTimeout = setTimeout(() => {
            toolAbortController.abort();
          }, 55000); // 55 second timeout

          let toolResponse: Response;
          try {
            // Add cache-busting timestamp to prevent edge caching issues
            const toolUrl = `/api/generate-stream?t=${Date.now()}&stage=tools`;
            toolResponse = await fetch(toolUrl, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
                "Cache-Control": "no-cache, no-store",
              },
              body: JSON.stringify({
                messages: toolPrompt.messages,
                tools: TOOL_SCHEMAS,
                model: currentModel,
                maxTokens: Math.min(options.customMaxOutput || 6000, 6000), // Cap tools at 6K
                temperature: 0.3,
                openRouterKey: options.openRouterKey,
                deepseekKey: options.deepseekKey,
                googleKey: options.googleKey,
              }),
              signal: toolAbortController.signal,
              cache: "no-store",
            });
          } catch (fetchError: any) {
            clearTimeout(toolTimeout);
            lastError = fetchError;
            continue; // Try next model
          } finally {
            clearTimeout(toolTimeout);
          }

          if (!toolResponse.ok) {
            const errorText = await toolResponse.text().catch(() => "");
            lastError = new Error(
              `Tool generation failed: ${toolResponse.status} - ${errorText}`
            );
            continue; // Try next model
          }

          let hitRateLimit = false;

          try {
            for await (const event of parseSSEStream(toolResponse)) {
              if (event.type === "error") {
                const errorMsg = event.error || "Tool generation failed";
                // Check if it's a rate limit error
                if (
                  errorMsg.includes("429") ||
                  errorMsg.toLowerCase().includes("rate")
                ) {
                  hitRateLimit = true;
                  lastError = new Error(errorMsg);
                  break;
                }
                throw new Error(errorMsg);
              }
              if (event.type === "tool_calls" && event.toolCalls) {
                newToolCalls = event.toolCalls;
              }
              if (event.type === "done" && event.meta) {
                toolsMeta = event.meta;
                totalTokenCost += event.meta.tokenCost;
                finalBalance = event.meta.balance;
              }
            }
          } catch (streamError: any) {
            if (
              streamError.message.includes("429") ||
              streamError.message.toLowerCase().includes("rate")
            ) {
              hitRateLimit = true;
              lastError = streamError;
              continue; // Try next model
            }
            throw streamError; // Re-throw non-rate-limit errors
          }

          if (hitRateLimit) {
            continue; // Try next model
          }

          success = true;
        }

        // If all models failed, throw the last error
        if (!success && lastError) {
          throw lastError;
        }

        // No more tool calls needed
        if (newToolCalls.length === 0) {
          logger.action("Tool loop complete - no more tools", {
            iterations: toolLoopCount,
          });
          break;
        }

        // Execute tools LOCALLY on storyData
        logger.action("Executing tools locally", {
          count: newToolCalls.length,
        });
        const { responses: newResponses, stateChanges: newStateChanges } =
          executeTools(newToolCalls, storyData);

        allToolCalls = [...allToolCalls, ...newToolCalls];
        allToolResponses = [...allToolResponses, ...newResponses];
        allStateChanges = [...allStateChanges, ...newStateChanges];
      }

      callbacks.onToolsComplete?.(
        allToolCalls,
        allToolResponses,
        allStateChanges,
        toolsMeta?.usage || {
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
        }
      );
      logger.action("Stage 2 complete", {
        toolCalls: allToolCalls.length,
        responses: allToolResponses.length,
        stateChanges: allStateChanges.length,
      });
    };

    // Helper function for choices generation
    const runChoicesGeneration = async (): Promise<void> => {
      callbacks.onChoicesStart?.();
      logger.action("Stage 3: Building choices prompt (parallel)");

      const choicesPrompt = buildChoicesPrompt({
        storyData,
        storyContent,
        embeddingContext,
        usePrefill: options.usePrefill !== false, // Default to true
      });

      const choicesResponse = await fetch("/api/generate-stream", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          messages: choicesPrompt.messages,
          model: options.choicesModel,
          maxTokens: 1500,
          temperature: 0.7,
          openRouterKey: options.openRouterKey,
          deepseekKey: options.deepseekKey,
          googleKey: options.googleKey,
        }),
      });

      if (!choicesResponse.ok) {
        const errorText = await choicesResponse.text().catch(() => "");
        throw new Error(
          `Choices generation failed: ${choicesResponse.status} - ${errorText}`
        );
      }

      let choicesContent = "";

      for await (const event of parseSSEStream(choicesResponse)) {
        if (event.type === "error") {
          throw new Error(event.error || "Choices generation failed");
        }
        if (event.type === "content" && event.content) {
          choicesContent += event.content;
        }
        if (event.type === "done" && event.meta) {
          choicesMeta = event.meta;
          totalTokenCost += event.meta.tokenCost;
          finalBalance = event.meta.balance;
        }
      }

      // Strip affirmation prefill if present (some providers like Mistral include it in response)
      if (options.usePrefill !== false) {
        choicesContent = stripAffirmationPrefill(
          choicesContent,
          CHOICES_AFFIRMATION
        );
      }

      // Parse choices
      choices = parseChoices(choicesContent, storyData);

      callbacks.onChoicesComplete?.(
        choices,
        choicesMeta?.usage || {
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
        }
      );
      logger.action("Stage 3 complete", { choicesCount: choices.length });
    };

    // Run tools and choices in parallel (skip choices if requested)
    console.log(
      "[Generation] Starting parallel tasks. skipChoices:",
      options.skipChoices
    );
    const parallelTasks = [runToolGeneration()];
    if (!options.skipChoices) {
      parallelTasks.push(runChoicesGeneration());
    }
    console.log(
      "[Generation] Awaiting",
      parallelTasks.length,
      "parallel tasks"
    );
    await Promise.all(parallelTasks);
    console.log("[Generation] All parallel tasks complete");

    // ========================================
    // STAGE 4: Sync new memories to embeddings (background, non-blocking)
    // ========================================
    if (
      options.enableEmbeddings &&
      options.storyId &&
      storyData.memory.length > 0
    ) {
      // Fire and forget - don't block generation completion
      const memoryCount = storyData.memory.length;
      syncNewMemories(
        options.storyId,
        storyData.memory,
        new Set(), // We'll embed all memories; duplicates handled by upsert
        token
      )
        .then((result) => {
          if (result.synced > 0 || result.cleaned > 0) {
            logger.action("Synced memories to embeddings", {
              synced: result.synced,
              cleaned: result.cleaned,
              total: memoryCount,
            });
          }
          // Mark embedded memory entries
          if (result.embeddedIndices && result.embeddedIndices.length > 0) {
            result.embeddedIndices.forEach((index) => {
              const entry = storyData.memory[index];
              if (entry) {
                if (typeof entry === "string") {
                  // Convert to MemoryEntry with embedded: true
                  storyData.memory[index] = { content: entry, embedded: true };
                } else {
                  // Mark existing MemoryEntry as embedded
                  entry.embedded = true;
                }
              }
            });
          }
        })
        .catch((err) => {
          // Non-fatal - just log
          logger.action("Memory embedding sync failed", { error: err.message });
        });
    }

    // ========================================
    // BUILD SCENE PART
    // ========================================
    console.log("[Generation] Building scene part");
    const scenePart: ScenePart = {
      content: storyContent,
      imageUrl: "",
      user: false,
      role: "assistant",
      choices,
      toolCalls: allToolCalls.length > 0 ? allToolCalls : undefined,
      toolResponses: allToolResponses.length > 0 ? allToolResponses : undefined,
      stateChanges: allStateChanges.length > 0 ? allStateChanges : undefined,
    };

    const result: GenerationResult = {
      success: true,
      content: storyContent,
      toolCalls: allToolCalls,
      toolResponses: allToolResponses,
      stateChanges: allStateChanges,
      choices,
      scenePart,
      meta: {
        storyMeta,
        toolsMeta,
        choicesMeta,
        totalTokenCost,
        balance: finalBalance,
      },
    };

    callbacks.onComplete?.(result);
    return result;
  } catch (error: any) {
    logger.error("Generation failed", { error: error.message });
    callbacks.onError?.(error);
    throw error;
  }
}

// ============================================================
// SIMPLE GENERATION (Single call, no stages)
// ============================================================

export async function generateSimple(
  messages: ChatMessage[],
  options: {
    model: string;
    maxTokens?: number;
    temperature?: number;
    tools?: any[];
    openRouterKey?: string;
    deepseekKey?: string;
    googleKey?: string;
  }
): Promise<{
  content: string;
  toolCalls: ToolCall[];
  meta: GenerationMeta;
}> {
  const token = await getAuthToken();
  if (!token) {
    throw new Error("Not authenticated");
  }

  const response = await fetch("/api/generate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      messages,
      tools: options.tools,
      model: options.model,
      maxTokens: options.maxTokens || 4000,
      temperature: options.temperature || 0.7,
      openRouterKey: options.openRouterKey,
      deepseekKey: options.deepseekKey,
      googleKey: options.googleKey,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `Generation failed: ${response.status}`);
  }

  const data = await response.json();
  return {
    content: data.content,
    toolCalls: data.toolCalls || [],
    meta: data.meta,
  };
}

// ============================================================
// STREAMING SIMPLE GENERATION
// ============================================================

export async function* generateSimpleStream(
  messages: ChatMessage[],
  options: {
    model: string;
    maxTokens?: number;
    temperature?: number;
    tools?: any[];
    openRouterKey?: string;
    deepseekKey?: string;
    googleKey?: string;
  }
): AsyncGenerator<StreamEvent> {
  const token = await getAuthToken();
  if (!token) {
    throw new Error("Not authenticated");
  }

  const response = await fetch("/api/generate-stream", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      messages,
      tools: options.tools,
      model: options.model,
      maxTokens: options.maxTokens || 4000,
      temperature: options.temperature || 0.7,
      openRouterKey: options.openRouterKey,
      deepseekKey: options.deepseekKey,
      googleKey: options.googleKey,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `Generation failed: ${response.status}`);
  }

  yield* parseSSEStream(response);
}

// ============================================================
// ACTION ANALYSIS (for freeform action mode)
// ============================================================

export interface ActionAnalysisResult {
  analysis: ActionAnalysis;
  meta: GenerationMeta;
  validationWarnings: string[];
}

/**
 * Analyze a freeform player action and extract game mechanics
 */
export async function analyzeAction(
  storyData: StoryData,
  userAction: string,
  model: string,
  apiKeys?: { openRouterKey?: string; deepseekKey?: string; googleKey?: string }
): Promise<ActionAnalysisResult> {
  const token = await getAuthToken();
  if (!token) {
    throw new Error("Not authenticated");
  }

  logger.action("Analyzing freeform action", { userAction, model });

  const prompt = buildActionAnalysisPrompt({ storyData, userAction });

  // Log the context being sent to AI for debugging
  console.log("[analyzeAction] System prompt sent to AI:");
  console.log(prompt.messages[0].content);
  console.log("\n[analyzeAction] User message sent to AI:");
  console.log(prompt.messages[1].content);

  const response = await fetch("/api/generate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      messages: prompt.messages,
      model,
      maxTokens: 500,
      temperature: 0.3, // Low temperature for structured output
      openRouterKey: apiKeys?.openRouterKey,
      deepseekKey: apiKeys?.deepseekKey,
      googleKey: apiKeys?.googleKey,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `Analysis failed: ${response.status}`);
  }

  const data = await response.json();
  const content = data.content;
  const meta = data.meta;

  // Log raw AI response
  console.log("\n[analyzeAction] Raw AI response:");
  console.log(content);

  // Parse JSON from response
  let analysis: ActionAnalysis;
  try {
    // Try to extract JSON from the response (handle markdown code blocks)
    let jsonStr = content;
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1];
    }
    // Also try to find raw JSON object
    const objectMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (objectMatch) {
      jsonStr = objectMatch[0];
    }

    analysis = JSON.parse(jsonStr);
  } catch (e) {
    logger.error("Failed to parse action analysis JSON", { content, error: e });
    // Return a plain action as fallback
    analysis = {
      action_summary: userAction,
      skill_used: null,
      skill_dc: null,
      item_used: null,
      ability_used: null,
      resource_used: null,
      agmt_check: null,
      table: null,
      is_plain_action: true,
      stat_bonus: null,
      rolls: undefined,
    };
  }

  // Validate and fuzzy match the analysis against actual game state
  const validationWarnings: string[] = [];

  // Validate skill_used
  if (analysis.skill_used) {
    const matchResult = findStatMatch(analysis.skill_used, storyData.stats);
    if (matchResult) {
      if (!matchResult.isExact) {
        validationWarnings.push(
          `Matched skill "${analysis.skill_used}" → "${matchResult.name}"`
        );
      }
      analysis.skill_used = matchResult.name;
    } else {
      validationWarnings.push(
        `Skill "${analysis.skill_used}" not found, removing skill check`
      );
      analysis.skill_used = null;
      analysis.skill_dc = null;
    }
  }

  // Validate resource_used
  if (analysis.resource_used) {
    const matchResult = findResourceMatch(
      analysis.resource_used,
      storyData.resources
    );
    if (matchResult) {
      if (!matchResult.isExact) {
        validationWarnings.push(
          `Matched resource "${analysis.resource_used}" → "${matchResult.name}"`
        );
      }
      analysis.resource_used = matchResult.name;
    } else {
      validationWarnings.push(
        `Resource "${analysis.resource_used}" not found, removing`
      );
      analysis.resource_used = null;
    }
  }

  // Validate item_used
  if (analysis.item_used) {
    const matchResult = findItemMatch(analysis.item_used, storyData.inventory);
    if (matchResult) {
      if (!matchResult.isExact) {
        validationWarnings.push(
          `Matched item "${analysis.item_used}" → "${matchResult.name}"`
        );
      }
      analysis.item_used = matchResult.name;
    } else {
      validationWarnings.push(
        `Item "${analysis.item_used}" not found, removing`
      );
      analysis.item_used = null;
    }
  }

  // Validate ability_used
  if (analysis.ability_used) {
    const matchResult = findAbilityMatch(
      analysis.ability_used,
      storyData.abilities || []
    );
    if (matchResult) {
      if (!matchResult.isExact) {
        validationWarnings.push(
          `Matched ability "${analysis.ability_used}" → "${matchResult.name}"`
        );
      }
      // Also check if ability is on cooldown
      const ability = storyData.abilities?.find(
        (a) => a.name === matchResult.name
      );
      if (ability && (ability.currentCooldown || 0) > 0) {
        validationWarnings.push(
          `Ability "${matchResult.name}" is on cooldown (${ability.currentCooldown} turns remaining), removing`
        );
        analysis.ability_used = null;
      } else {
        analysis.ability_used = matchResult.name;
      }
    } else {
      validationWarnings.push(
        `Ability "${analysis.ability_used}" not found, removing`
      );
      analysis.ability_used = null;
    }
  }

  // Handle legacy agmt_table/custom_table fields - migrate to unified table field
  if (analysis.agmt_table && !analysis.table) {
    analysis.table = analysis.agmt_table;
  }
  if (analysis.custom_table && !analysis.table) {
    analysis.table = analysis.custom_table;
  }

  // Validate unified table field - check both custom tables AND agmt element tables
  if (analysis.table) {
    const tableName = analysis.table;

    // First, check custom tables
    if (storyData.customTables && storyData.customTables.length > 0) {
      const customTable = storyData.customTables.find(
        (t) => t.name.toLowerCase() === tableName.toLowerCase()
      );
      if (customTable) {
        analysis.table = customTable.name; // Use exact name
      }
    }

    // If not found in custom tables, check if it's a valid agmt table
    const agmtTableNames = [
      "adventure_tone",
      "alien_species",
      "animal_actions",
      "army",
      "cavern",
      "character_actions_combat",
      "character_actions_general",
      "character_appearance",
      "character_background",
      "character_conversations",
      "character_descriptors",
      "character_identity",
      "character_motivations",
      "character_personality",
      "character_skills",
      "character_traits_flaws",
      "characters",
      "city",
      "civilization",
      "creature_abilities",
      "creature_descriptors",
      "cryptic_message",
      "curses",
      "domicile",
      "dungeon",
      "dungeon_traps",
      "forest",
      "gods",
      "legends",
      "locations",
      "magic_item",
      "mutation",
      "names",
      "noble_house",
      "objects",
      "plot_twists",
      "powers",
      "scavenging_results",
      "smells",
      "sounds",
      "spell_effects",
      "starship",
      "terrain",
      "undead",
      "visions_dreams",
    ];

    const isAGMTTable = agmtTableNames.some(
      (name) => name.toLowerCase() === tableName.toLowerCase()
    );
    const isCustomTable = storyData.customTables?.some(
      (t) => t.name.toLowerCase() === tableName.toLowerCase()
    );

    if (!isAGMTTable && !isCustomTable) {
      validationWarnings.push(
        `Table "${tableName}" not found in custom or agmt tables, removing`
      );
      analysis.table = null;
    }
  }

  // Ensure is_plain_action is consistent
  if (
    !analysis.skill_used &&
    !analysis.item_used &&
    !analysis.resource_used &&
    !analysis.agmt_check &&
    !analysis.table
  ) {
    analysis.is_plain_action = true;
  }

  logger.action("Action analysis complete", {
    analysis,
    validationWarnings,
  });

  // Log final parsed analysis
  console.log(
    "\n[analyzeAction] Parsed analysis:",
    JSON.stringify(analysis, null, 2)
  );
  if (validationWarnings.length > 0) {
    console.log("[analyzeAction] Validation warnings:", validationWarnings);
  }

  return {
    analysis,
    meta,
    validationWarnings,
  };
}

/**
 * Convert ActionAnalysis to Choice format for use with existing handleChoice logic
 */
export function analysisToChoice(
  analysis: ActionAnalysis,
  originalAction: string
): Choice {
  return {
    text: originalAction,
    skill_used: analysis.skill_used || undefined,
    skill_dc: analysis.skill_dc || undefined,
    stat_bonus: analysis.stat_bonus || undefined,
    item_used: analysis.item_used || undefined,
    resource_used: analysis.resource_used || undefined,
    agmt_check: analysis.agmt_check || undefined,
    table: analysis.table || undefined,
    rolls: analysis.rolls || undefined,
  };
}

/**
 * Generate choices only (used when intro_override bypasses AI story generation)
 */
export async function generateChoicesOnly(
  storyData: StoryData,
  options: {
    choicesModel: string;
    openRouterKey?: string;
    deepseekKey?: string;
    googleKey?: string;
  }
): Promise<Choice[]> {
  const token = await getAuthToken();
  if (!token) {
    throw new Error("Authentication required");
  }

  // Get the last AI content from scene parts
  const lastAIPart = [...storyData.scene.parts]
    .reverse()
    .find((p) => !p.user && p.content.trim());
  const storyContent = lastAIPart?.content || "";

  logger.action("Generating choices only (intro_override mode)", {
    model: options.choicesModel,
    contentLength: storyContent.length,
  });

  const choicesPrompt = buildChoicesPrompt({
    storyData,
    storyContent,
  });

  const choicesResponse = await fetch("/api/generate-stream", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      messages: choicesPrompt.messages,
      model: options.choicesModel,
      maxTokens: 1500,
      temperature: 0.7,
      openRouterKey: options.openRouterKey,
      deepseekKey: options.deepseekKey,
      googleKey: options.googleKey,
    }),
  });

  if (!choicesResponse.ok) {
    const errorText = await choicesResponse.text().catch(() => "");
    throw new Error(
      `Choices generation failed: ${choicesResponse.status} - ${errorText}`
    );
  }

  let choicesContent = "";

  for await (const event of parseSSEStream(choicesResponse)) {
    if (event.type === "error") {
      throw new Error(event.error || "Choices generation failed");
    }
    if (event.type === "content" && event.content) {
      choicesContent += event.content;
    }
  }

  // Parse choices
  const choices = parseChoices(choicesContent, storyData);

  logger.action("Choices generation complete", { count: choices.length });

  return choices;
}
