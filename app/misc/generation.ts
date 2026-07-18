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
  GMConversationMessage,
  ReasoningDetail,
} from "@/app/misc/structs";
import {
  buildStoryPrompt,
  buildToolPrompt,
  buildChoicesPrompt,
  buildActionAnalysisPrompt,
  buildGMStagePrompt,
  buildStoryContinuationPrompt,
  ChatMessage,
  EmbeddingContext,
  TOOLS_AFFIRMATION,
  CHOICES_AFFIRMATION,
  GM_STAGE_AFFIRMATION,
} from "@/app/misc/ai_staged";
import {
  outputToScenePart,
  stripThinkingTags,
  extractThinkingTags,
  detectRepetition,
} from "@/app/misc/ai";
import {
  executeGMTools,
  GMToolResult,
  GMExecutionResult,
} from "@/app/misc/gmExecutor";
import { executeTools, ToolCall } from "@/app/misc/toolExecutor";
import { TOOL_SCHEMAS } from "@/app/misc/toolSchemas";
import { getAuthToken } from "@/app/misc/getAuthToken";
import { logger } from "@/app/misc/logger";
import { getModelConfig } from "@/app/misc/ai_prices";
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
import {
  REASONING_TIERS,
  NARRATION_MODEL_KEY,
  SCENE_BASELINE_TIER,
  ReasoningEffort,
  resolveTier,
  hardRuleFloor,
  classifyTier,
  isClassificationAmbiguous,
  buildClassifierPrompt,
  classificationLabelToTier,
  decayTierTowardBaseline,
  computeSceneKey,
  fallbackTier,
  describeTier,
  getTierState,
} from "@/app/misc/reasoningTiers";

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
  const storyMarker = "Writing the narrative now:";
  const toolsMarker = "calling all tools in parallel):";
  const choicesMarker = "Generating choices:";

  for (const marker of [storyMarker, toolsMarker, choicesMarker]) {
    const markerIndex = trimmedContent.indexOf(marker);
    if (markerIndex !== -1 && markerIndex < 800) {
      // Only strip if marker is near the beginning
      return trimmedContent.slice(markerIndex + marker.length).trimStart();
    }
  }

  return content;
}

/**
 * Executes a complete story turn using the 3-stage generation flow.
 */

export interface GenerationOptions {
  storyModel: string;
  toolsModel: string;
  choicesModel: string;
  enableTools: boolean;
  maxToolLoops?: number;
  skipChoices?: boolean;
  customMaxContext?: number; // GM stage context (Memory Size slider)
  customStoryContext?: number; // Story stage context (Story Context slider)
  customMaxOutput?: number;
  // NovelAI BYOK support (story stage only)
  novelaiEnabled?: boolean;
  novelaiKey?: string;
  novelaiTemperature?: number;
  // BYOK API keys (required for non-NovelAI models; all providers are BYOK)
  openRouterKey?: string;
  deepseekKey?: string;
  googleKey?: string;
  mistralKey?: string;
  deepinfraKey?: string;
  // Embedding-based context retrieval
  storyId?: string; // Required for embedding search
  enableEmbeddings?: boolean; // Whether to use embedding-based context
  embeddingThreshold?: number; // Similarity threshold (0.1-0.5, default 0.25)
  // GM Stage (new architecture: AI determines mechanics via tool calls)
  enableGMStage?: boolean; // Use GM stage instead of ActionAnalysis JSON
  gmStageModel?: string; // Model to use for GM stage (defaults to toolsModel)
  precomputedGMContext?: string; // GM context from paused generation (retry flow)
  precomputedGMThinking?: string[]; // GM thinking from paused generation or retry
  // Sampling settings (for story stage only, Coins mode)
  samplingSettings?: SamplingSettings;
  // Role Affirmation (prefill) - primes model to follow output constraints
  usePrefill?: boolean; // Default: true
  // Storyteller mode - "narrator" (literary) or "dm" (inline mechanics)
  storytellerMode?: "narrator" | "dm";
  // Abort signal for cancelling generation
  abortSignal?: AbortSignal;
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
  onGMStageStart?: () => void;
  // NEW: Stream GM content as it generates (thinking text)
  onGMContent?: (content: string, fullContent: string) => void;
  // NEW: Called after each GM tool execution with interleaved results
  onGMToolResult?: (result: GMToolResult) => void;
  onGMStageComplete?: (
    results: GMToolResult[],
    storyContext: string,
    usage: TokenUsage,
    thinking?: string[]
  ) => void;
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
  // GM Stage results (when enableGMStage is true)
  gmResults?: GMToolResult[];
  gmStoryContext?: string;
  gmThinking?: string[]; // GM's "[GM]" reasoning text from each round
  gmConversation?: GMConversationMessage[]; // Full GM conversation for context preservation
  meta: {
    storyMeta?: GenerationMeta;
    toolsMeta?: GenerationMeta;
    choicesMeta?: GenerationMeta;
    gmMeta?: GenerationMeta;
    totalTokenCost: number;
    balance: number;
  };
}

// ============================================================
// STREAM PARSER
// ============================================================

interface StreamEvent {
  type:
    | "content"
    | "reasoning"
    | "reasoning_details"
    | "tool_calls"
    | "done"
    | "error";
  content?: string;
  details?: ReasoningDetail[];
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

      // Parse use_skill: name (DC number), (tier name), or (X success(es) needed/required)
      // Supports: "Stealth (DC 15)", "Stealth (hard)", "Stealth (15)", "Combat (2 successes needed)"
      const skillMatch = metadata.match(
        /use_skill:\s*([^(;]+?)(?:\s*\((?:DC\s*)?(\d+|trivial|easy|average|hard|very_hard|impossible)(?:\s*succ(?:ess)?(?:es)?\s*(?:needed|required)?)?\))?(?:;|$)/i
      );
      if (skillMatch) {
        const skillName = skillMatch[1].trim();
        if (skillName.toLowerCase() !== "none") {
          choice.skill_used = skillName;
          const dcValue = skillMatch[2];
          if (dcValue) {
            // Check if it's a number or a tier name
            const parsedNum = parseInt(dcValue, 10);
            if (!isNaN(parsedNum)) {
              choice.skill_dc = parsedNum;
            } else {
              // It's a tier name - store as skill_dc_tier
              choice.skill_dc_tier =
                dcValue.toLowerCase() as Choice["skill_dc_tier"];
            }
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
  let rawStoryContent = "";
  let allToolCalls: ToolCall[] = [];
  let allToolResponses: CommandResponse[] = [];
  let allStateChanges: string[] = [];
  let choices: Choice[] = [];
  let storyMeta: GenerationMeta | undefined;
  let toolsMeta: GenerationMeta | undefined;
  let choicesMeta: GenerationMeta | undefined;
  let storyReasoning = "";
  let storyReasoningDetails: ReasoningDetail[] = [];

  try {
    // ========================================
    // STAGE 0: Embedding-based context retrieval
    // DISABLED: Now using agentic model where GM uses read_notes and search_memory tools
    // The embedding system is preserved but disabled - GM pulls notes on demand
    // ========================================
    const embeddingContext: EmbeddingContext | undefined = undefined;

    // NOTE: Embedding code preserved below but disabled.
    // Instead of automatic embedding retrieval, the GM now:
    // - Sees note titles in the info message (World Lore, Secrets folders)
    // - Uses read_notes({ titles: [...] }) to fetch note content on demand
    // - Uses search_memory({ patterns: [...] }) to search through memories
    // This gives the GM explicit control over what context to load.

    /*
    // DISABLED: Old embedding-based retrieval
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
    */

    // ========================================
    // STAGE 0.5: GM Stage (if enabled)
    // AI thinks out loud like a tabletop GM, calls tools in a loop
    // until no more tool calls are made (natural completion)
    // ========================================
    let gmResults: GMToolResult[] = [];
    let gmStoryContext = "";
    let gmInterleavedConversation = ""; // NEW: Full interleaved GM conversation for story stage
    let gmFinalStoryContent = ""; // NEW: GM's final prose content (when no tool calls)
    let gmMeta: GenerationMeta | undefined;
    let gmThinking: string[] = []; // Capture GM's "[GM]" reasoning text
    let gmBaseMessages: ChatMessage[] = []; // Base GM prompt for story continuation
    let gmConversationHistory: ChatMessage[] = []; // Full GM conversation history for continuation
    let gmModel = ""; // Track which model was used for GM stage

    // Use precomputed context if provided (skip GM stage for retry flows)
    if (options.precomputedGMContext) {
      gmStoryContext = options.precomputedGMContext;
      // Also restore precomputed GM thinking if available
      if (options.precomputedGMThinking) {
        gmThinking = options.precomputedGMThinking;
      }
      logger.action("Using precomputed GM context (retry flow)", {
        contextLength: gmStoryContext.length,
        thinkingCount: gmThinking.length,
      });
    } else {
      // GM Stage is always enabled - legacy tool calling has been removed
      // The enableGMStage option is now ignored and GM stage always runs
      callbacks.onGMStageStart?.();
      logger.action("Stage 0.5: Running GM stage for mechanics determination");

      // Extract user choice - either from parameter or from last user scene part
      let gmUserChoice = userChoice;
      if (!gmUserChoice) {
        // Find the last user message in scene parts
        const lastUserPart = [...storyData.scene.parts]
          .reverse()
          .find((p) => p.user && p.content);
        if (lastUserPart) {
          // Strip the ">" prefix if present (custom input format)
          gmUserChoice = lastUserPart.content.replace(/^>\s*/, "");
        }
      }

      if (!gmUserChoice) {
        logger.action("GM stage skipped - no user choice found");
        gmStoryContext = "";
      } else {
        // ============================================
        // Reasoning-Tier Router: pick the starting tier for this turn.
        // Priority: hard rules (combat) > deterministic classifier > decayed
        // tier from last turn. Self-escalation (set_reasoning_tier tool)
        // is applied per-round below via storyData.reasoningTierState.
        // ============================================
        const priorTierState = getTierState(storyData);
        const decayedTier = decayTierTowardBaseline(priorTierState.currentTier);
        let startingTier = Math.max(
          hardRuleFloor(storyData),
          classifyTier(storyData, gmUserChoice),
          decayedTier
        );

        if (isClassificationAmbiguous(storyData, gmUserChoice)) {
          try {
            const classifierResult = await generateSimple(
              [{ role: "user", content: buildClassifierPrompt(gmUserChoice) }],
              {
                model: REASONING_TIERS[0].modelKey,
                maxTokens: 10,
                temperature: 0,
                openRouterKey: options.openRouterKey,
                deepseekKey: options.deepseekKey,
                googleKey: options.googleKey,
                mistralKey: options.mistralKey,
                deepinfraKey: options.deepinfraKey,
              }
            );
            startingTier = Math.max(
              startingTier,
              classificationLabelToTier(classifierResult.content || "")
            );
          } catch (classifyError) {
            logger.action(
              "Reasoning-tier classifier call failed, using deterministic default",
              {
                error:
                  classifyError instanceof Error
                    ? classifyError.message
                    : String(classifyError),
              }
            );
          }
        }

        const sceneKey = computeSceneKey(storyData);
        const initialResolvedTier = resolveTier(startingTier);
        storyData.reasoningTierState = {
          currentTier: initialResolvedTier.tier,
          tier3CallsInScene:
            sceneKey === priorTierState.lastSceneKey
              ? priorTierState.tier3CallsInScene
              : 0,
          lastSceneKey: sceneKey,
        };

        gmModel = initialResolvedTier.modelKey;
        let gmReasoningEffort: ReasoningEffort = initialResolvedTier.reasoningEffort;
        logger.action("Reasoning tier resolved for GM stage", {
          describe: describeTier(initialResolvedTier),
        });

        // GM stage loop - continues until no more tool calls (AI writes final story)
        const MAX_GM_ROUNDS = options.maxToolLoops || 10; // User-configurable safety limit
        let gmRound = 0;
        let allGMContextParts: string[] = [];
        // NEW: Build interleaved conversation log for story stage
        // This preserves the exact order: thinking -> tool results -> thinking -> tool results
        let gmInterleavedParts: string[] = [];
        // NEW: Accumulate visible prose from ALL rounds (not just the final one)
        // This allows GM to narrate while calling tools, building up the story incrementally
        let gmAccumulatedStory: string[] = [];
        // Local conversation history (will be copied to outer scope at end)
        let conversationHistory: ChatMessage[] = [];
        let isComplete = false;
        let noToolCallPrompts = 0; // Track how many times we've prompted for tool calls
        const MAX_NO_TOOL_PROMPTS = 2; // Max times to prompt before giving up

        while (gmRound < MAX_GM_ROUNDS && !isComplete) {
          gmRound++;

          // Re-derive tier from storyData.reasoningTierState each round: if the
          // previous round's tool execution included a set_reasoning_tier call,
          // executeSetReasoningTier (gmExecutor.ts) already applied the
          // decay/cap policy and mutated this state - picking it up here is
          // what makes self-escalation take effect for the NEXT round.
          const roundTier = resolveTier(
            storyData.reasoningTierState?.currentTier ?? SCENE_BASELINE_TIER
          );
          gmModel = roundTier.modelKey;
          gmReasoningEffort = roundTier.reasoningEffort;
          logger.action(`GM stage round ${gmRound}`, {
            describe: describeTier(roundTier),
          });

          // Build prompt - include conversation history for multi-turn
          // GM Stage now receives customMaxContext (Memory Size slider) for context allocation
          const gmPrompt = buildGMStagePrompt({
            storyData,
            userChoice: gmUserChoice,
            customMaxContext: options.customMaxContext, // Memory Size slider controls GM context
            modelName: gmModel,
          });

          // Store base messages on first round for story continuation
          if (gmRound === 1) {
            gmBaseMessages = [...gmPrompt.messages];
          }

          // Add conversation history from previous rounds
          const messagesWithHistory = [...gmPrompt.messages];

          // Add previous round history (assistant responses + tool results)
          for (const historyEntry of conversationHistory) {
            if (historyEntry.role === "assistant") {
              // Include tool_calls if present so AI sees it made these calls
              const msg: any = {
                role: "assistant",
                content: historyEntry.content || "",
              };
              if (historyEntry.reasoning)
                msg.reasoning = historyEntry.reasoning;
              if (historyEntry.reasoning_details)
                msg.reasoning_details = historyEntry.reasoning_details;
              if (
                historyEntry.tool_calls &&
                historyEntry.tool_calls.length > 0
              ) {
                msg.tool_calls = historyEntry.tool_calls;
              }
              messagesWithHistory.push(msg);
            } else if (historyEntry.role === "tool") {
              // Proper tool response with tool_call_id
              messagesWithHistory.push({
                role: "tool",
                content: historyEntry.content,
                tool_call_id: historyEntry.tool_call_id,
              });
            } else if (historyEntry.role === "user") {
              // User messages (like continuation prompts) are added directly
              messagesWithHistory.push({
                role: "user",
                content: historyEntry.content,
              });
            }
          }

          // Check if user cancelled
          if (options.abortSignal?.aborted) {
            throw new Error("Generation cancelled by user");
          }

          // Use streaming for GM stage so user can see thinking in real-time
          const buildGmRequestBody = (model: string, effort: ReasoningEffort) =>
            JSON.stringify({
              messages: messagesWithHistory,
              tools: gmPrompt.tools,
              model,
              reasoningEffort: effort,
              maxTokens: Math.min(
                12000,
                getModelConfig(model).maxOutputTokens || 4000
              ),
              temperature: 0.4, // Slightly higher for more natural GM thinking
              openRouterKey: options.openRouterKey,
              deepseekKey: options.deepseekKey,
              googleKey: options.googleKey,
              mistralKey: options.mistralKey,
              deepinfraKey: options.deepinfraKey,
            });

          let gmResponse = await fetch("/api/generate-stream", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: buildGmRequestBody(gmModel, gmReasoningEffort),
            signal: options.abortSignal,
          });

          // Model unavailable - fall back to the next-lower tier instead of crashing.
          if (!gmResponse.ok) {
            const failedTier = roundTier.tier;
            const lower = fallbackTier(failedTier);
            if (lower !== null) {
              const fallbackResolved = resolveTier(lower);
              logger.action(
                "GM stage model unavailable - falling back to lower tier",
                {
                  failedTier,
                  failedModel: gmModel,
                  fallbackTier: lower,
                  status: gmResponse.status,
                }
              );
              gmModel = fallbackResolved.modelKey;
              gmReasoningEffort = fallbackResolved.reasoningEffort;
              storyData.reasoningTierState = {
                ...getTierState(storyData),
                currentTier: fallbackResolved.tier,
              };
              gmResponse = await fetch("/api/generate-stream", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${token}`,
                },
                body: buildGmRequestBody(gmModel, gmReasoningEffort),
                signal: options.abortSignal,
              });
            }
          }

          if (!gmResponse.ok) {
            const errorText = await gmResponse.text().catch(() => "");
            throw new Error(
              `GM stage failed: ${gmResponse.status} - ${errorText}`
            );
          }

          // Stream the GM response
          let gmContent = "";
          let gmReasoning = "";
          let gmReasoningDetails: ReasoningDetail[] = [];
          let gmToolCalls: any[] = [];
          let gmResultMeta: any = null;

          for await (const event of parseSSEStream(gmResponse)) {
            if (event.type === "error") {
              throw new Error(event.error || "GM generation failed");
            }
            if (event.type === "content" && event.content) {
              gmContent += event.content;
              // Stream GM content to callback for real-time display
              callbacks.onGMContent?.(event.content, gmContent);
            }
            if (event.type === "reasoning" && event.content) {
              gmReasoning += event.content;
            }
            if (event.type === "reasoning_details" && event.details) {
              for (const detail of event.details) {
                const index =
                  detail.index !== undefined
                    ? detail.index
                    : gmReasoningDetails.length;
                if (!gmReasoningDetails[index]) {
                  gmReasoningDetails[index] = { ...detail };
                } else {
                  if (detail.text)
                    gmReasoningDetails[index].text =
                      (gmReasoningDetails[index].text || "") + detail.text;
                  if (detail.summary)
                    gmReasoningDetails[index].summary =
                      (gmReasoningDetails[index].summary || "") +
                      detail.summary;
                  if (detail.data)
                    gmReasoningDetails[index].data =
                      (gmReasoningDetails[index].data || "") + detail.data;
                  if (detail.signature)
                    gmReasoningDetails[index].signature = detail.signature;
                  if (detail.id) gmReasoningDetails[index].id = detail.id;
                  if (detail.type) gmReasoningDetails[index].type = detail.type;
                }
              }
            }
            if (event.type === "tool_calls" && event.toolCalls) {
              gmToolCalls = event.toolCalls;
            }
            if (event.type === "done" && event.meta) {
              gmResultMeta = event.meta;
            }
          }

          // Build gmResult object from streamed data
          const gmResult = {
            content: gmContent,
            reasoning: gmReasoning,
            reasoning_details: gmReasoningDetails,
            toolCalls: gmToolCalls,
            meta: gmResultMeta,
          };

          console.log(
            `[GM Stage Round ${gmRound}] Raw response:`,
            JSON.stringify(gmResult, null, 2)
          );

          if (gmResult.meta) {
            // Accumulate meta across rounds
            if (!gmMeta) {
              gmMeta = gmResult.meta;
            } else {
              gmMeta.usage.promptTokens +=
                gmResult.meta.usage?.promptTokens || 0;
              gmMeta.usage.completionTokens +=
                gmResult.meta.usage?.completionTokens || 0;
              gmMeta.usage.totalTokens += gmResult.meta.usage?.totalTokens || 0;
              gmMeta.tokenCost += gmResult.meta.tokenCost || 0;
            }
            totalTokenCost += gmResult.meta.tokenCost || 0;
            finalBalance = gmResult.meta.balance;
          }

          // Capture GM's thinking text (content before/with tool calls)
          // Only add if it's meaningfully different from previous thinking
          if (gmResult.content) {
            const newThinking = gmResult.content.trim();

            // Normalize for comparison - collapse whitespace and remove formatting variations
            const normalizeForComparison = (text: string) => {
              return text
                .replace(/\s+/g, " ") // Collapse all whitespace
                .replace(/\*\*/g, "") // Remove bold markers
                .replace(/\n/g, " ") // Newlines to spaces
                .trim()
                .toLowerCase()
                .substring(0, 500); // First 500 chars normalized
            };

            const newNormalized = normalizeForComparison(newThinking);

            // Check if this thinking is substantially similar to previous entries
            const isDuplicate = gmThinking.some((prev) => {
              const prevNormalized = normalizeForComparison(prev);
              // Exact normalized match
              if (prevNormalized === newNormalized) return true;
              // Very high overlap (first 300 chars match)
              if (
                prevNormalized.substring(0, 300) ===
                newNormalized.substring(0, 300)
              )
                return true;
              return false;
            });

            if (!isDuplicate) {
              gmThinking.push(gmResult.content);
              // Add to interleaved parts with proper formatting
              const formattedThinking =
                gmResult.content.trim().startsWith("[GAME MASTER]") ||
                gmResult.content.trim().startsWith("[GM]")
                  ? gmResult.content.trim().replace(/^\[GM\]/, "[GAME MASTER]")
                  : `[GAME MASTER]\n${gmResult.content.trim()}`;
              gmInterleavedParts.push(formattedThinking);

              // NEW: Add raw content to accumulated story (preserve <output> tags)
              // The UI will call stripThinkingTags to extract visible content
              const rawContent = gmResult.content.trim();
              if (rawContent) {
                // Check for duplicate content
                const contentNormalized = normalizeForComparison(rawContent);
                const isAlreadyAccumulated = gmAccumulatedStory.some(
                  (existing) => {
                    const existingNormalized = normalizeForComparison(existing);
                    // Check for exact match or high overlap
                    if (existingNormalized === contentNormalized) return true;
                    if (
                      existingNormalized.substring(0, 200) ===
                      contentNormalized.substring(0, 200)
                    )
                      return true;
                    // Also check if one contains the other (subset)
                    if (
                      existingNormalized.includes(contentNormalized) ||
                      contentNormalized.includes(existingNormalized)
                    )
                      return true;
                    return false;
                  }
                );

                if (!isAlreadyAccumulated) {
                  gmAccumulatedStory.push(rawContent);
                  logger.action("Accumulated content from GM round", {
                    round: gmRound,
                    contentLength: rawContent.length,
                    totalAccumulated: gmAccumulatedStory.length,
                  });
                } else {
                  logger.action("Skipping duplicate content", {
                    round: gmRound,
                    contentLength: rawContent.length,
                  });
                }
              }
            } else {
              logger.action("GM produced duplicate thinking - skipping", {
                thinkingLength: newThinking.length,
                existingCount: gmThinking.length,
              });
            }
            // Note: We DON'T add thinking-only content to conversation history here
            // because the AI will re-see its own thinking and repeat it.
            // Only add to history when there are actual tool calls.
          }

          // Execute GM tool calls locally
          if (gmResult.toolCalls && gmResult.toolCalls.length > 0) {
            // Add the assistant's response with tool calls to history
            // IMPORTANT: Preserve the content (thinking/prose) alongside tool_calls
            // so future context reconstruction has the full picture
            conversationHistory.push({
              role: "assistant",
              content: gmResult.content || "", // Preserve thinking/prose content
              reasoning: gmResult.reasoning,
              reasoning_details: gmResult.reasoning_details,
              tool_calls: gmResult.toolCalls.map((tc: any) => ({
                id: tc.id,
                type: "function",
                function: {
                  name: tc.function.name,
                  arguments:
                    typeof tc.function.arguments === "string"
                      ? tc.function.arguments
                      : JSON.stringify(tc.function.arguments),
                },
                // Preserve extra_content (contains Google's thought_signature)
                ...(tc.extra_content
                  ? { extra_content: tc.extra_content }
                  : {}),
              })),
            });

            const gmExecution = await executeGMTools(
              gmResult.toolCalls,
              storyData
            );

            // Accumulate results across rounds
            gmResults.push(...gmExecution.results);
            if (gmExecution.storyContext) {
              allGMContextParts.push(gmExecution.storyContext);
              // Add tool results to interleaved parts
              gmInterleavedParts.push(
                `[GAME MASTER]\n${gmExecution.storyContext}`
              );
            }

            // Notify callback for each tool result (for real-time interleaved display)
            for (const result of gmExecution.results) {
              callbacks.onGMToolResult?.(result);
            }

            // Update storyData with any modifications from GM tools
            Object.assign(storyData, gmExecution.modifiedStoryData);

            // Track consecutive failures - only count ACTUAL tool errors, not dice roll failures
            // Dice rolls that fail their DC are still successful tool executions
            const actualToolErrors = gmExecution.results.filter((r) => {
              // Tool succeeded - not an error
              if (r.success) return false;
              // Check if this is a dice roll tool - these should never count as errors
              // even when the character fails the check (success=false just means roll < DC)
              const diceTools = [
                "formula_roll",
                "opposed_formula",
                "formula_challenge_check",
                "npc_roll",
                "group_check",
              ];
              if (diceTools.includes(r.toolName)) {
                // Only count as error if contextForStory contains "ERROR" (invalid formula, etc.)
                return r.contextForStory?.includes("ERROR") ?? false;
              }
              // Non-dice tools: success=false means actual error
              return true;
            });
            const allFailed =
              actualToolErrors.length === gmExecution.results.length &&
              gmExecution.results.length > 0;

            if (allFailed) {
              logger.action(
                `GM stage round ${gmRound} - all tools had errors`,
                {
                  errorTools: actualToolErrors.map((r) => r.toolName),
                }
              );
            }

            // Add tool results to conversation history - one per tool call
            // Make error messages VERY clear so the AI can correct its mistake
            // BUT: Dice tools use success=false to mean "check failed", not "tool error"
            const diceTools = [
              "formula_roll",
              "opposed_formula",
              "formula_challenge_check",
              "npc_roll",
              "group_check",
            ];
            for (let i = 0; i < gmResult.toolCalls.length; i++) {
              const tc = gmResult.toolCalls[i];
              const result = gmExecution.results[i];

              let toolContent: string;
              if (result) {
                // Check if this is a dice tool - these return success=false for failed checks,
                // which is a VALID GAME OUTCOME, not an error
                const isDiceTool = diceTools.includes(result.toolName);
                // Only treat as error if: (1) not a dice tool AND (2) success is false
                // OR if it's a dice tool but contextForStory contains "ERROR"
                const isActualError = isDiceTool
                  ? result.contextForStory?.includes("ERROR") ?? false
                  : !result.success;

                if (!isActualError) {
                  // Valid result - show normally (includes failed dice checks!)
                  toolContent = `[${result.toolName}] ${result.contextForStory}`;
                } else {
                  // Actual error - make it prominent so AI can fix
                  const errorMsg = result.contextForStory || "Unknown error";
                  // Handle arguments that could be string or already-parsed object
                  const rawArgs = tc.function.arguments;
                  const parsedArgs =
                    typeof rawArgs === "string"
                      ? JSON.parse(rawArgs || "{}")
                      : rawArgs || {};
                  const paramsUsed = JSON.stringify(parsedArgs, null, 2);
                  toolContent = `**ERROR** in ${result.toolName}: ${errorMsg}\n\nYou called with: ${paramsUsed}\n\nPlease check the tool's required parameters and try again with correct arguments.`;
                }
              } else {
                toolContent = `[${tc.function.name}] Executed`;
              }

              conversationHistory.push({
                role: "tool",
                content: toolContent,
                tool_call_id: tc.id,
              });
            }

            logger.action(`GM stage round ${gmRound} tools executed`, {
              toolCount: gmResult.toolCalls.length,
              toolNames: gmExecution.results.map((r) => r.toolName),
              isComplete: gmExecution.isComplete,
            });

            // Legacy: Check if gmExecution has isComplete flag (from end_gm_thinking)
            // Note: This path is rarely used now - the loop ends when no tool calls
            if (gmExecution.isComplete) {
              isComplete = true;
              // Use the final summary as the primary context for story
              // Put outcome FIRST so it's most prominent
              if (gmExecution.finalSummary) {
                // Start with the authoritative outcome
                const finalOutcomePart = `[FINAL OUTCOME: ${
                  gmExecution.finalOutcome || "neutral"
                }]`;
                allGMContextParts.push(finalOutcomePart);
                gmInterleavedParts.push(finalOutcomePart);

                const summaryPart = `[GAME MASTER Summary: ${gmExecution.finalSummary}]`;
                allGMContextParts.push(summaryPart);
                gmInterleavedParts.push(summaryPart);

                if (gmExecution.narrativeHints) {
                  const hintsPart = `[Narrative Hints: ${gmExecution.narrativeHints}]`;
                  allGMContextParts.push(hintsPart);
                  gmInterleavedParts.push(hintsPart);
                }
                if (gmExecution.dramaticMoment) {
                  allGMContextParts.push(`[DRAMATIC MOMENT]`);
                  gmInterleavedParts.push(`[DRAMATIC MOMENT]`);
                }
              }
              logger.action("GM stage complete - end_gm_thinking called", {
                summary: gmExecution.finalSummary?.substring(0, 100),
                outcome: gmExecution.finalOutcome,
              });
              break;
            }

            // Continue looping - AI may make more tool calls
            // Loop ends when AI produces content WITHOUT tool calls
            logger.action(
              "GM stage round complete, continuing to see if more tools needed"
            );
            continue;
          } else {
            // No tool calls - GM is done!
            // NOTE: The content/prose was already extracted and added to gmAccumulatedStory
            // earlier in this round (at the "Capture GM's thinking text" block).
            // We just need to mark completion and add context parts for backward compat.
            const content = gmResult.content || "";

            // IMPORTANT: Add the final assistant response to conversation history
            // even without tool calls, so it gets saved in gmConversation
            if (content.trim()) {
              conversationHistory.push({
                role: "assistant",
                content: content,
              });
            }

            // Check for repetition (AI stuck in a loop)
            const isRepetitive = detectRepetition(content);

            if (isRepetitive) {
              logger.action(
                "GM stage detected repetitive content - forcing end"
              );
              allGMContextParts.push(
                `[GAME MASTER: AI got stuck in repetition loop.]`
              );
            } else if (content.trim()) {
              // Add raw content to context parts (with thinking) for backward compat
              // (Prose extraction already happened earlier - don't duplicate)
              allGMContextParts.push(content);
              // Don't add to gmInterleavedParts - already added in thinking capture block

              logger.action(
                "GM stage complete - no tool calls, prose already captured",
                {
                  rawLength: content.length,
                  totalAccumulatedParts: gmAccumulatedStory.length,
                }
              );
            }

            isComplete = true;
            break;
          }
        }

        // Combine all context parts from all rounds (for backward compat/logging)
        gmStoryContext = allGMContextParts.join("\n\n");
        // Build interleaved conversation string for story stage
        gmInterleavedConversation = gmInterleavedParts.join("\n\n");
        // Copy conversation history to outer scope for story continuation
        gmConversationHistory = conversationHistory.map((entry) => ({
          role: entry.role as "user" | "assistant" | "tool",
          content: entry.content,
          reasoning: entry.reasoning,
          reasoning_details: entry.reasoning_details,
          ...(entry.tool_calls && {
            tool_calls: entry.tool_calls.map((tc: any) => ({
              ...tc,
              // Ensure extra_content is preserved in the copy
              ...(tc.extra_content ? { extra_content: tc.extra_content } : {}),
            })),
          }),
          ...(entry.tool_call_id && { tool_call_id: entry.tool_call_id }),
        }));

        // NEW: Combine accumulated story from all rounds as the final story content
        // This allows GM to write prose incrementally while calling tools
        if (gmAccumulatedStory.length > 0) {
          // Join all accumulated parts - preserve <output> tags for UI to process
          gmFinalStoryContent = gmAccumulatedStory.join("\n\n");
          logger.action("Combined accumulated GM story", {
            parts: gmAccumulatedStory.length,
            totalLength: gmFinalStoryContent.length,
          });
        }

        if (gmRound >= MAX_GM_ROUNDS && !isComplete) {
          logger.action("GM stage hit max rounds limit without completing", {
            maxRounds: MAX_GM_ROUNDS,
          });
          // Add a note about forced completion
          gmStoryContext +=
            "\n\n[GM stage reached maximum rounds - auto-completing]";
        }
      }

      callbacks.onGMStageComplete?.(
        gmResults,
        gmStoryContext,
        gmMeta?.usage || {
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
        },
        gmThinking.length > 0 ? gmThinking : undefined
      );
    }

    // ========================================
    // STAGE 1: Story Generation
    // ========================================
    callbacks.onStoryStart?.();

    // NEW: Check if GM already produced the final story content
    // (When GM completes without tool calls, its content IS the story)
    if (gmFinalStoryContent) {
      logger.action(
        "Using GM's final content as story (no separate API call needed)",
        {
          contentLength: gmFinalStoryContent.length,
        }
      );

      // Use GM's content directly as the story
      storyContent = gmFinalStoryContent;
      rawStoryContent = gmFinalStoryContent;

      // Prune leading dividers (---, ***, ___) that the model might add
      while (/^[\s\n]*([-*_]{3,})/.test(storyContent)) {
        storyContent = storyContent.replace(/^[\s\n]*([-*_]{3,})[\s\n]*/, "");
      }
      storyContent = storyContent.trimStart();

      // Prune trailing dividers (---, ***, ___) that the model might add
      while (/\n?[-*_]{3,}[\s\n]*$/.test(storyContent)) {
        storyContent = storyContent.replace(/\n?[-*_]{3,}[\s\n]*$/, "");
      }
      storyContent = storyContent.trimEnd();

      // Stream the content to the UI in one chunk
      callbacks.onStoryContent?.(storyContent, storyContent);

      // Mark story as complete
      callbacks.onStoryComplete?.(
        storyContent,
        gmMeta?.usage || {
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
        }
      );
      logger.action("Stage 1 complete (from GM content)", {
        contentLength: storyContent.length,
      });
    } else {
      // No GM content - need separate story API call (legacy path or error recovery)
      logger.action("Stage 1: Building story prompt (no GM content available)");

      // When NovelAI is enabled, use its model name for proper context sizing
      const useNovelAI = options.novelaiEnabled && options.novelaiKey;
      const storyModelName = useNovelAI ? "NovelAI GLM-4-6" : NARRATION_MODEL_KEY;

      // Calculate actual max output for NovelAI or standard models
      // Enforce minimum 1000 tokens to account for prefill overhead
      // (Some providers like OpenRouter count prefill against output limit)
      const MIN_OUTPUT_TOKENS = 1000;
      const rawMaxOutput = useNovelAI
        ? options.customMaxOutput || 2000
        : options.customMaxOutput || 8000;
      const storyMaxOutput = Math.max(rawMaxOutput, MIN_OUTPUT_TOKENS);

      // Determine if we should continue the GM conversation or build a new prompt
      // Continue GM conversation when:
      // 1. GM stage actually ran (gmBaseMessages has content)
      // 2. NOT using NovelAI (which requires its own API)
      const continueGMConversation = gmBaseMessages.length > 0 && !useNovelAI;

      let storyMessages: ChatMessage[];
      let storyPromptPrunedParts = 0;

      if (continueGMConversation) {
        // Continue the GM conversation with a brief story prompt
        // This is more efficient: same model, single conversation, no context duplication
        logger.action("Continuing GM conversation for story generation", {
          baseMessages: gmBaseMessages.length,
          historyEntries: gmConversationHistory.length,
          gmAdjudicationModel: gmModel,
          narrationModel: NARRATION_MODEL_KEY,
        });

        const storyContinuationPrompt = buildStoryContinuationPrompt(
          options.storytellerMode || "narrator"
        );

        // Build messages: GM base + conversation history + story prompt
        storyMessages = [
          ...gmBaseMessages,
          ...gmConversationHistory,
          {
            role: "user" as const,
            content: storyContinuationPrompt,
          },
        ];
      } else {
        // Fall back to building a separate story prompt
        // Used for: NovelAI, precomputed GM context, or when GM was skipped
        const storyPrompt = buildStoryPrompt({
          storyData,
          userChoice,
          commandResponses,
          modelName: storyModelName,
          customMaxContext: options.customMaxContext,
          customStoryContext: options.customStoryContext, // Story Context slider
          customMaxOutput: storyMaxOutput,
          embeddingContext,
          usePrefill: options.usePrefill !== false, // Default to true
          gmStoryContext: gmStoryContext || undefined, // DEPRECATED: Use gmInterleavedConversation
          gmThinking: gmThinking.length > 0 ? gmThinking : undefined, // DEPRECATED: Use gmInterleavedConversation
          gmInterleavedConversation: gmInterleavedConversation || undefined, // NEW: Full interleaved GM conversation
          storytellerMode: options.storytellerMode || "narrator", // Default to narrator mode
        });

        storyMessages = storyPrompt.messages;
        storyPromptPrunedParts = storyPrompt.prunedParts;
      }

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

      if (storyPromptPrunedParts > 0) {
        logger.action(
          `Pruned ${storyPromptPrunedParts} oldest scene parts to fit context`
        );
      }

      // useNovelAI already computed above for model name selection

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
            messages: storyMessages,
            novelaiKey: options.novelaiKey,
            maxTokens: storyMaxOutput, // Uses calculated value with MIN_OUTPUT_TOKENS enforced
            temperature: options.novelaiTemperature ?? 1,
          }),
          signal: options.abortSignal,
        });
      } else {
        // Use standard API (DeepSeek/OpenRouter/Mistral/DeepInfra)
        // Build request body with optional sampling settings
        // Narration always runs on the fixed narration model, regardless of
        // which tier adjudication used - this is what keeps the GM's voice
        // consistent even when a turn escalated to a heavier reasoning tier.
        const storyModelToUse: string = NARRATION_MODEL_KEY;

        const storyRequestBody: Record<string, unknown> = {
          messages: storyMessages,
          model: storyModelToUse,
          maxTokens: storyMaxOutput, // Uses calculated value with MIN_OUTPUT_TOKENS enforced
          temperature: options.samplingSettings?.temperature ?? 0.7,
          openRouterKey: options.openRouterKey,
          deepseekKey: options.deepseekKey,
          googleKey: options.googleKey,
          mistralKey: options.mistralKey,
          deepinfraKey: options.deepinfraKey,
          // Stop the AI before it generates GAME MASTER state updates (handled by tools stage)
          // Also stop on [STOP] marker for player agency stopping points
          stop: ["[GAME MASTER State Update]", "[GAME MASTER State", "[STOP]"],
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
          signal: options.abortSignal,
        });
      }

      // Debug: Log maxTokens being sent
      console.log(
        "[Generation] Story stage - maxTokens:",
        storyMaxOutput,
        "model:",
        NARRATION_MODEL_KEY,
        "continueGM:",
        continueGMConversation
      );

      if (!storyResponse.ok) {
        const errorText = await storyResponse.text().catch(() => "");
        throw new Error(
          `Story generation failed: ${storyResponse.status} - ${errorText}`
        );
      }

      // Process story stream with real-time prefill stripping
      // We buffer content until we find the marker, then stream only the actual story
      // The prefill now contains <thinking>GM reasoning</thinking> followed by an affirmation
      // When continuing GM conversation, no prefill is used - skip stripping entirely
      const usePrefill =
        options.usePrefill !== false && !continueGMConversation;
      let prefillStripped = !usePrefill; // If prefill disabled or continuing GM, consider it already "stripped"
      let dividerStripped = false; // Track if we've stripped leading dividers
      let rawContent = ""; // Buffer for finding the marker
      let pendingContent = ""; // Buffer for stripping dividers after marker
      let stopMarkerHit = false; // Track if we hit [STOP] during streaming
      // Look for end of thinking block OR the affirmation line (whichever comes last)
      const THINKING_END = "</thinking>";
      const STORY_MARKER = "Now I write the story.";
      const STOP_MARKER = "[STOP]";

      for await (const event of parseSSEStream(storyResponse)) {
        if (event.type === "error") {
          throw new Error(event.error || "Story generation failed");
        }
        if (event.type === "reasoning" && event.content) {
          storyReasoning += event.content;
        }
        if (event.type === "reasoning_details" && event.details) {
          for (const detail of event.details) {
            const index =
              detail.index !== undefined
                ? detail.index
                : storyReasoningDetails.length;
            if (!storyReasoningDetails[index]) {
              storyReasoningDetails[index] = { ...detail };
            } else {
              if (detail.text)
                storyReasoningDetails[index].text =
                  (storyReasoningDetails[index].text || "") + detail.text;
              if (detail.summary)
                storyReasoningDetails[index].summary =
                  (storyReasoningDetails[index].summary || "") + detail.summary;
              if (detail.data)
                storyReasoningDetails[index].data =
                  (storyReasoningDetails[index].data || "") + detail.data;
              if (detail.signature)
                storyReasoningDetails[index].signature = detail.signature;
              if (detail.id) storyReasoningDetails[index].id = detail.id;
              if (detail.type) storyReasoningDetails[index].type = detail.type;
            }
          }
        }
        if (event.type === "content" && event.content) {
          // Capture raw content for storage
          rawStoryContent += event.content;

          // Skip all content after [STOP] is detected
          if (stopMarkerHit) continue;

          if (prefillStripped && dividerStripped) {
            // Already past prefill and dividers, stream directly
            // But check for [STOP] in the accumulated content
            const newContent = storyContent + event.content;
            const stopIndex = newContent.indexOf(STOP_MARKER);
            if (stopIndex !== -1) {
              // Found [STOP] - only emit content before it
              const contentBeforeStop = newContent
                .slice(0, stopIndex)
                .trimEnd();
              const deltaToEmit = contentBeforeStop.slice(storyContent.length);
              storyContent = contentBeforeStop;
              if (deltaToEmit) {
                callbacks.onStoryContent?.(deltaToEmit, storyContent);
              }
              stopMarkerHit = true;
              logger.action(
                "Hit [STOP] marker during streaming - stopping content emission"
              );
            } else {
              storyContent += event.content;
              callbacks.onStoryContent?.(event.content, storyContent);
            }
          } else if (prefillStripped && !dividerStripped) {
            // Past prefill but still checking for dividers
            pendingContent += event.content;

            // Check for [STOP] in pending content first
            const stopIndex = pendingContent.indexOf(STOP_MARKER);
            if (stopIndex !== -1) {
              // Truncate at [STOP]
              pendingContent = pendingContent.slice(0, stopIndex);
              stopMarkerHit = true;
            }

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
            } else if (pendingContent.length > 100 || stopMarkerHit) {
              // After 100 chars or [STOP], just emit whatever we have
              dividerStripped = true;
              storyContent = cleaned || pendingContent.trimStart();
              if (storyContent) {
                callbacks.onStoryContent?.(storyContent, storyContent);
              }
            }
          } else {
            // Still looking for the marker
            rawContent += event.content;

            // Check for [STOP] in raw content first
            const stopIndex = rawContent.indexOf(STOP_MARKER);
            if (stopIndex !== -1) {
              // Truncate at [STOP]
              rawContent = rawContent.slice(0, stopIndex);
              stopMarkerHit = true;
            }

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
            } else if (rawContent.length > 800 || stopMarkerHit) {
              // Marker not found after 800 chars or [STOP] hit - stream what we have
              storyContent = rawContent;
              prefillStripped = true;
              dividerStripped = true;
              if (rawContent) {
                callbacks.onStoryContent?.(rawContent, storyContent);
              }
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
      // Also handles partial [GM State markers from stop sequences
      // IMPORTANT: First strip everything AFTER [STOP] if it appears mid-content
      // (stop sequences should prevent this, but some providers may not respect them)
      storyContent = storyContent
        .replace(/\[STOP\][\s\S]*$/i, "") // Strip [STOP] and everything after it
        .replace(/\s*[-*_]{0,3}\s*\[STOP\]?\s*$/i, "")
        .replace(/\s*\[STO?P?\s*$/i, "")
        .replace(/\s*\[S\s*$/i, "")
        .replace(/\s*\[(?:GM|GAME MASTER)?\s*S?t?a?t?e?\s*$/i, "") // Partial [GM State... or [GAME MASTER State... from stop sequence
        .replace(/\s*\[\s*$/i, "") // Lone [ at end (from stop sequence cutting mid-bracket)
        .replace(/\s*[-*]{3}\s*\[\s*$/i, "") // ---[ or ***[
        .replace(/\s*[-*]{3}\s*$/i, "") // trailing --- or ***
        .trimEnd();

      // Strip trailing meta-blocks that start with dividers (---, ***) followed by bracketed content
      // Patterns like: "--- [GAME MASTER State Update] ..." or "--- *[STOP – Player must choose...]*"
      storyContent = storyContent
        .replace(
          /\n*[-*_]{3,}\s*\*?\[(?:(?:GM|GAME MASTER) State Update|STOP)[^\]]*\][\s\S]*$/i,
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

      // Strip [GAME MASTER State Update] blocks that the model might echo from history
      // These blocks contain bullet-pointed stat changes like "• Health: 95 → 85/100 (-10)"
      // Match the header and all following lines that are bullet points or indented content
      storyContent = storyContent
        .replace(
          /\n*\[(?:GM|GAME MASTER) State Update\]\n(?:• [^\n]+\n?)*/gi,
          ""
        )
        .trim();

      // Also strip if there's no header but just the bullet-style state changes at the end
      // Pattern: lines starting with • containing arrows (→) indicating stat changes
      storyContent = storyContent
        .replace(/\n+(?:• [^\n]*→[^\n]*\n?)+$/, "")
        .trim();

      // Final thorough cleaning to isolate ONLY story content
      storyContent = stripThinkingTags(storyContent);

      callbacks.onStoryComplete?.(
        storyContent,
        storyMeta?.usage || {
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
        }
      );
      logger.action("Stage 1 complete", { contentLength: storyContent.length });
    } // End of else block (no GM content - fallback to API call)

    // ========================================
    // STAGE 2 & 3: Tools + Choices (in parallel)
    // ========================================

    // Helper function for tools generation (DEPRECATED - GM Stage is now always used)
    const runToolGeneration = async (): Promise<void> => {
      // GM Stage is always enabled - legacy tool calling has been removed
      // The enableGMStage option is now ignored and this function always returns early
      logger.action(
        "Skipping legacy tools stage (GM stage handles all state changes)"
      );
      return;

      /* LEGACY CODE - KEPT FOR REFERENCE BUT NEVER EXECUTED
      if (!options.enableTools) return;

      callbacks.onToolsStart?.();
      logger.action("Stage 2: Building tool prompt (parallel)");

      const maxToolLoops = options.maxToolLoops || 1;
      let toolLoopCount = 0;

      // Determine fallback model based on what keys are available
      // If using DeepSeek, no fallback (DeepSeek is reliable)
      // If using OpenRouter/Google, fall back to MiniMax M2
      // If using Coins (Mistral/DeepInfra), fall back to DeepInfra MiniMax M2
      const primaryModelConfig = getModelConfig(options.toolsModel);
      let FALLBACK_TOOLS_MODEL: string | null = null;

      if (
        primaryModelConfig.provider === "openrouter" ||
        primaryModelConfig.provider === "google"
      ) {
        FALLBACK_TOOLS_MODEL = "MiniMax M2"; // OpenRouter fallback
      } else if (
        primaryModelConfig.provider === "mistral" ||
        primaryModelConfig.provider === "deepinfra"
      ) {
        FALLBACK_TOOLS_MODEL = "DeepInfra MiniMax M2"; // Coins fallback
      }
      // For DeepSeek, no fallback (user only has DeepSeek key)

      while (toolLoopCount < maxToolLoops) {
        toolLoopCount++;

        const toolPrompt = buildToolPrompt({
          storyData,
          storyContent,
          existingToolCalls: allToolCalls,
          existingToolResponses: allToolResponses,
          embeddingContext,
          usePrefill: options.usePrefill !== false, // Re-enabled with better prefill
        });

        // Try primary model first, then fallback on rate limit
        const modelsToTry = [options.toolsModel];
        if (
          FALLBACK_TOOLS_MODEL &&
          options.toolsModel !== FALLBACK_TOOLS_MODEL
        ) {
          modelsToTry.push(FALLBACK_TOOLS_MODEL);
        }

        let lastError: Error | null = null;
        let success = false;
        let newToolCalls: ToolCall[] = [];

        for (const currentModel of modelsToTry) {
          if (success) break;

          // Check if user cancelled
          if (options.abortSignal?.aborted) {
            throw new Error("Generation cancelled by user");
          }

          // Add timeout to prevent infinite hanging
          const toolAbortController = new AbortController();
          const toolTimeout = setTimeout(() => {
            toolAbortController.abort();
          }, 55000); // 55 second timeout

          // Link user abort signal to tool abort controller
          const abortHandler = () => toolAbortController.abort();
          options.abortSignal?.addEventListener("abort", abortHandler);

          // Debug: Log tools being sent from frontend
          console.log(
            `[Tool Stage] Sending ${TOOL_SCHEMAS.length} tools:`,
            TOOL_SCHEMAS.map((t) => t.function?.name).join(", ")
          );
          console.log(
            `[Tool Stage] Using model: "${currentModel}" (options.toolsModel: "${options.toolsModel}")`
          );

          let toolResponse: Response;
          try {
            // Use non-streaming endpoint for tools to get full response and debug
            const toolUrl = `/api/generate?t=${Date.now()}&stage=tools`;

            // Get model config to respect max output limits (DeepSeek is 8K, others vary)
            const toolModelConfig = getModelConfig(currentModel);
            const toolMaxTokens = Math.min(
              12000,
              toolModelConfig.maxOutputTokens || 8000
            );

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
                maxTokens: toolMaxTokens,
                temperature: 0.3,
                openRouterKey: options.openRouterKey,
                deepseekKey: options.deepseekKey,
                googleKey: options.googleKey,
                mistralKey: options.mistralKey,
                deepinfraKey: options.deepinfraKey,
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

          let toolStageContent = ""; // Capture any text content from tool stage

          try {
            // Parse the JSON response directly (non-streaming)
            const toolResult = await toolResponse.json();

            // Log the RAW response for debugging
            console.log(
              "[Tool Stage] RAW API Response:",
              JSON.stringify(toolResult, null, 2)
            );

            // Extract content and tool calls from response
            if (toolResult.content) {
              toolStageContent = toolResult.content;
            }
            if (toolResult.toolCalls && toolResult.toolCalls.length > 0) {
              newToolCalls = toolResult.toolCalls;
            }
            if (toolResult.meta) {
              toolsMeta = toolResult.meta;
              totalTokenCost += toolResult.meta.tokenCost || 0;
              finalBalance = toolResult.meta.balance;
            }

            // Log tool stage content for debugging
            if (toolStageContent) {
              console.log(
                `[Tool Stage] AI generated text content (${toolStageContent.length} chars):\n`,
                toolStageContent
              );
            }
          } catch (parseError: any) {
            console.error("[Tool Stage] Failed to parse response:", parseError);
            throw parseError;
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

        // Log the tool calls for debugging
        console.log(
          `[Tool Stage] AI called ${newToolCalls.length} tools:`,
          newToolCalls.map((tc: any) => ({
            name: tc.function?.name,
            args: tc.function?.arguments,
          }))
        );

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
      END OF LEGACY CODE */
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

      // Choices are picked from already-decided narration - fixed cheap
      // model, not the (possibly escalated) adjudication tier.
      const choicesResponse = await fetch("/api/generate-stream", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          messages: choicesPrompt.messages,
          model: NARRATION_MODEL_KEY,
          maxTokens: 1500,
          temperature: 0.7,
          openRouterKey: options.openRouterKey,
          deepseekKey: options.deepseekKey,
          googleKey: options.googleKey,
          mistralKey: options.mistralKey,
          deepinfraKey: options.deepinfraKey,
        }),
        signal: options.abortSignal,
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
    // STAGE 4: Sync new memories to embeddings
    // DISABLED: Now using agentic model where GM uses search_memory tool
    // Memory syncing is preserved but disabled - memories are searched on demand
    // ========================================
    /*
    // DISABLED: Old embedding-based memory sync
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
    */

    // ========================================
    // BUILD SCENE PART
    // ========================================
    console.log("[Generation] Building scene part");

    // Filter gmConversationHistory to only include assistant and tool messages
    // (user messages are not part of the GM conversation we want to save)
    const gmConversationForStorage = gmConversationHistory
      .filter((entry) => entry.role === "assistant" || entry.role === "tool")
      .map((entry) => ({
        role: entry.role as "assistant" | "tool",
        content: entry.content,
        reasoning: entry.reasoning,
        reasoning_details: entry.reasoning_details,
        ...(entry.tool_calls && {
          tool_calls: entry.tool_calls.map((tc: any) => ({
            ...tc,
            // Ensure extra_content is preserved for storage
            ...(tc.extra_content ? { extra_content: tc.extra_content } : {}),
          })),
        }),
        ...(entry.tool_call_id && { tool_call_id: entry.tool_call_id }),
      }));

    const scenePart: ScenePart = {
      content: storyContent,
      raw: rawStoryContent || undefined,
      imageUrl: "",
      user: false,
      role: "assistant",
      reasoning: storyReasoning || undefined,
      reasoning_details:
        storyReasoningDetails.length > 0 ? storyReasoningDetails : undefined,
      choices,
      toolCalls: allToolCalls.length > 0 ? allToolCalls : undefined,
      toolResponses: allToolResponses.length > 0 ? allToolResponses : undefined,
      stateChanges: allStateChanges.length > 0 ? allStateChanges : undefined,
      gmToolCalls: gmResults.length > 0 ? gmResults : undefined,
      gmConversation:
        gmConversationForStorage.length > 0
          ? gmConversationForStorage
          : undefined,
      gmStoryContext: gmStoryContext || undefined,
      gmThinking: gmThinking.length > 0 ? gmThinking : undefined,
    };

    const result: GenerationResult = {
      success: true,
      content: storyContent,
      toolCalls: allToolCalls,
      toolResponses: allToolResponses,
      stateChanges: allStateChanges,
      choices,
      scenePart,
      gmResults: gmResults.length > 0 ? gmResults : undefined,
      gmStoryContext: gmStoryContext || undefined,
      gmThinking: gmThinking.length > 0 ? gmThinking : undefined,
      meta: {
        storyMeta,
        toolsMeta,
        choicesMeta,
        gmMeta,
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
    mistralKey?: string;
    deepinfraKey?: string;
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
      mistralKey: options.mistralKey,
      deepinfraKey: options.deepinfraKey,
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
    mistralKey?: string;
    deepinfraKey?: string;
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
      mistralKey: options.mistralKey,
      deepinfraKey: options.deepinfraKey,
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
  apiKeys?: {
    openRouterKey?: string;
    deepseekKey?: string;
    googleKey?: string;
    mistralKey?: string;
    deepinfraKey?: string;
  }
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
      mistralKey: apiKeys?.mistralKey,
      deepinfraKey: apiKeys?.deepinfraKey,
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

  // Validate skill_used and skill_dc
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

  // Validate skill_dc - ensure it's a number, not a tier string
  // If AI returned a tier name (e.g., "easy"), convert it to a number
  if (analysis.skill_dc !== null && analysis.skill_dc !== undefined) {
    if (typeof analysis.skill_dc === "string") {
      const tierNames = [
        "trivial",
        "easy",
        "average",
        "hard",
        "very_hard",
        "impossible",
      ];
      const lowerDc = (analysis.skill_dc as string).toLowerCase();
      if (tierNames.includes(lowerDc)) {
        // Import parseDCValue for tier conversion
        const { parseDCValue } = await import("./rpgSystems");
        const difficulty = storyData.difficulty || "medium";
        const systemId = storyData.rpgSystem || "3d6";
        analysis.skill_dc = parseDCValue(lowerDc, systemId, difficulty);
        validationWarnings.push(
          `Converted DC tier "${lowerDc}" → ${analysis.skill_dc} (${systemId}, ${difficulty} difficulty)`
        );
      } else {
        // Try parsing as number
        const parsed = parseInt(analysis.skill_dc as string, 10);
        if (!isNaN(parsed)) {
          analysis.skill_dc = parsed;
        } else {
          validationWarnings.push(
            `Invalid skill_dc "${analysis.skill_dc}", defaulting to null`
          );
          analysis.skill_dc = null;
        }
      }
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
  // Since the GM stage now handles all dice mechanics via formula_roll,
  // we only need to copy the plain text. The deprecated fields are
  // kept in the Choice interface for backward compatibility with
  // existing stories, but we don't populate them for new choices.
  return {
    text: originalAction,
    // Only copy skill_used/skill_dc if they exist, for backward compat
    skill_used: analysis.skill_used || undefined,
    skill_dc: analysis.skill_dc || undefined,
    item_used: analysis.item_used || undefined,
    resource_used: analysis.resource_used || undefined,
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
    mistralKey?: string;
    deepinfraKey?: string;
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
      mistralKey: options.mistralKey,
      deepinfraKey: options.deepinfraKey,
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
