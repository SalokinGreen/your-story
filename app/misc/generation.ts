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

import { providerFetch } from "@/app/misc/providerFetch";
import { GenerateRequestBody } from "@/app/misc/providerCall";
import {
  StoryData,
  CommandResponse,
  Choice,
  ScenePart,
  MemoryEntry,
  GMConversationMessage,
  ReasoningDetail,
  ObserverFlag,
} from "@/app/misc/structs";
import {
  buildChoicesPrompt,
  buildGMStagePrompt,
  buildStoryContinuationPrompt,
  ReplyLength,
  ChatMessage,
  EmbeddingContext,
  CHOICES_AFFIRMATION,
  GM_STAGE_DEFAULT_BUDGET,
  computeGMStageBudget,
  CHOICES_STAGE_TOKEN_BUDGET,
} from "@/app/misc/ai_staged";
import { computePacingFeedback } from "@/app/misc/pacingFeedback";
import { isContextOverflowError } from "@/app/misc/apiErrors";
import { ensureStoryCompacted } from "@/app/misc/compaction";
import { ensureStoryReflected } from "@/app/misc/reflection";
import { checkNarrationConsistency } from "@/app/misc/consistencyCheck";
import {
  runObserver,
  buildObserverWarningNote,
  settingsFor,
  ObserverSettings,
} from "@/app/misc/observer";
import { runMemoryAgent } from "@/app/misc/memoryAgent";
import {
  getObserverSettings,
  getObserverModelOverride,
  getMemoryKeeperModelOverride,
  getReflectionModelOverride,
  resolveSideCallModel,
} from "@/app/misc/layerSettings";
import {
  outputToScenePart,
  extractThinkingTags,
  detectRepetition,
} from "@/app/misc/ai";
import { extractVisibleText } from "@/app/misc/turnTimeline";
import { deAiifyText } from "@/app/misc/deAiify";
import {
  executeGMTools,
  GMToolResult,
  ManualRollRequest,
  ManualRollAnswer,
  DiceThrowRequest,
  AskQuestionRequest,
  AskQuestionAnswer,
  GMExecutionResult,
  resolveCheckPerTurnVisibility,
} from "@/app/misc/gmExecutor";
import { executeTools, ToolCall, STATE_CHANGE_TOOLS } from "@/app/misc/toolExecutor";
import { logger } from "@/app/misc/logger";
import { getModelConfig } from "@/app/misc/ai_prices";
import {
  syncNewMemories,
} from "@/app/misc/embeddings";
import {
  SamplingSettings,
  getSamplingSettings,
  filterSettingsForProvider,
} from "@/app/misc/samplingSettings";
import { chaosFactorTemperatureDelta } from "@/app/misc/mythic";
import {
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
  isSceneGatedForRoll,
  hasSatisfiedRollGate,
  fallbackTier,
  describeTier,
  getTierState,
  getEffectiveTiers,
  getEffectiveNarrationModelKey,
} from "@/app/misc/reasoningTiers";
import { getCustomModelIfUUID, CustomModel } from "@/app/misc/user_settings";

// ============================================================
// TYPES
// ============================================================

// Tools that roll dice against a DC: a "failed" result (success=false) means
// the character failed the check, not that the tool call itself errored.
// Only an explicit "ERROR" marker in contextForStory counts as a real failure.
const DICE_TOOLS = [
  "formula_roll",
  "ask_for_roll",
  "opposed_formula",
  "formula_challenge_check",
  "npc_roll",
  "group_check",
];

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
  customMaxOutput?: number;
  // BYOK API keys (all providers are BYOK)
  openRouterKey?: string;
  deepseekKey?: string;
  googleKey?: string;
  mistralKey?: string;
  deepinfraKey?: string;
  // Embedding-based context retrieval
  storyId?: string; // Required for embedding search
  enableEmbeddings?: boolean; // Whether to use embedding-based context
  embeddingThreshold?: number; // Similarity threshold (0.1-0.5, default 0.25)
  // Sub-agent delegation (delegate_task tool) - web_research needs both a
  // BYOK search key and this explicit opt-in, off by default
  webResearchEnabled?: boolean;
  braveSearchKey?: string;
  // GM Stage (new architecture: AI determines mechanics via tool calls)
  enableGMStage?: boolean;
  gmStageModel?: string; // Model to use for GM stage (defaults to toolsModel)
  // Retry flow: reuse a previous turn's saved GM conversation (dice rolls,
  // tool results, reasoning) instead of re-running the GM stage's
  // tool-calling loop. The GM base prompt is rebuilt fresh (no API call)
  // and this is replayed as history, same as the normal
  // "continue GM conversation" narration call.
  precomputedGMConversation?: GMConversationMessage[];
  // Sampling settings (for story stage only, Coins mode)
  samplingSettings?: SamplingSettings;
  // Role Affirmation (prefill) - primes model to follow output constraints
  usePrefill?: boolean; // Default: true
  // Storyteller mode - "narrator" (literary) or "dm" (inline mechanics)
  storytellerMode?: "narrator" | "dm";
  // Swap out common AI vocabulary tics (ozone, palpable, tapestry, ...) for
  // plainer synonyms in the finalized narration. Default: enabled.
  deAiifyWords?: boolean;
  // Reply Length - controls narration verbosity across GM + story stages
  replyLength?: ReplyLength;
  // Abort signal for cancelling generation
  abortSignal?: AbortSignal;
  // Layer 5 hardening (see observer.ts): set internally by generateStoryTurn's
  // observer retry loop, not meant to be passed in by callers. Injected into
  // the GM prompt to explain why the previous attempt at this turn was reset.
  observerNote?: string;
  // Per-flag-type observer configuration (which flag types are enabled,
  // whether a "major" instance of each is allowed to trigger a reset, and
  // how sensitive each check is) - backend for a settings UI that doesn't
  // exist yet. Omit (or leave individual types unset) to get
  // DEFAULT_OBSERVER_SETTINGS' behavior, which reproduces exactly what
  // shipped before this option existed.
  observerSettings?: ObserverSettings;
}

export interface GenerationCallbacks {
  onStoryStart?: () => void;
  onStoryContent?: (content: string, fullContent: string) => void;
  // Stream the story stage's native reasoning/CoT field as it generates
  // (only fires for providers that support it, e.g. DeepSeek reasoner,
  // OpenRouter reasoning-enabled models) - same shape as onGMReasoning, but
  // for the separate narrator call that continues the GM's conversation;
  // never fires when GM's own final round already produced the story with
  // no separate call, since there's nothing new to stream there).
  onStoryReasoning?: (content: string, fullReasoning: string) => void;
  onStoryComplete?: (content: string, usage: TokenUsage) => void;
  onToolsStart?: () => void;
  onToolsComplete?: (
    toolCalls: ToolCall[],
    responses: CommandResponse[],
    stateChanges: string[],
    usage: TokenUsage,
  ) => void;
  onChoicesStart?: () => void;
  onChoicesComplete?: (choices: Choice[], usage: TokenUsage) => void;
  onGMStageStart?: () => void;
  // NEW: Stream GM content as it generates (thinking text)
  onGMContent?: (content: string, fullContent: string) => void;
  // Stream the model's native reasoning/CoT field as it generates (only
  // fires for providers that support it, e.g. DeepSeek reasoner,
  // OpenRouter reasoning-enabled models) - scoped to the current GM round,
  // resets at the start of each round same as onGMContent.
  onGMReasoning?: (content: string, fullReasoning: string) => void;
  // NEW: Called after each GM tool execution with interleaved results
  onGMToolResult?: (result: GMToolResult) => void;
  // Manual dice mode: the GM asked the player to roll real dice. The UI
  // shows a roll prompt and resolves with the entered total (null = skipped).
  onAskForRoll?: (
    request: ManualRollRequest
  ) => Promise<ManualRollAnswer | null>;
  // Physical dice mode: the UI shows a throwable 3D dice tray and resolves
  // with the settled face values (null = player skipped/cancelled the
  // throw, falls back to a fully digital roll of the whole formula).
  onRequestDiceThrow?: (
    request: DiceThrowRequest
  ) => Promise<number[] | null>;
  // The GM asked the player(s) one or more predefined-choice + free-text
  // questions. The UI shows a prompt and resolves with one answer per
  // question, or null if the whole batch was skipped/cancelled.
  onAskQuestion?: (
    request: AskQuestionRequest
  ) => Promise<AskQuestionAnswer | null>;
  onGMStageComplete?: (
    results: GMToolResult[],
    storyContext: string,
    usage: TokenUsage,
    thinking?: string[],
  ) => void;
  // Fired when aging scene history was folded into a rolling summary
  // (see compaction.ts) - lets the UI show a "recap" notice instead of
  // silently condensing history the player can no longer scroll back to.
  onCompaction?: (summary: string) => void;
  // Layer 5 hardening (see observer.ts): fired when the observer flagged the
  // just-completed turn as a major violation (GM spoke/acted for the player,
  // or blew way past the reply-length ceiling) and generateStoryTurn is
  // discarding it and forcing a fresh attempt. storyData has already been
  // rolled back to its pre-turn snapshot by the time this fires - the UI
  // should clear anything it displayed/streamed for the discarded attempt.
  onObserverReset?: (flags: ObserverFlag[], triggeringFlag: ObserverFlag) => void;
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
  response: Response,
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
// CHOICES GENERATION (shared by the per-turn pipeline and generateChoicesOnly)
// ============================================================

interface ChoicesFetchOptions {
  token: string | null;
  model: string;
  openRouterKey?: string;
  deepseekKey?: string;
  googleKey?: string;
  mistralKey?: string;
  deepinfraKey?: string;
  abortSignal?: AbortSignal;
}

interface ChoicesGenerationResult {
  content: string;
  meta?: GenerationMeta;
}

/**
 * Build + fetch the Choices stage, retrying once with a reduced history
 * budget if the provider reports a context overflow - same pattern as the
 * GM and Story stages above.
 */
async function generateChoicesWithRetry(
  buildArgs: {
    storyData: StoryData;
    storyContent: string;
    embeddingContext?: EmbeddingContext;
    usePrefill?: boolean;
  },
  fetchOptions: ChoicesFetchOptions,
): Promise<ChoicesGenerationResult> {
  let budget: number | undefined;
  let overflowRetried = false;

  choicesFetchLoop: while (true) {
    const choicesPrompt = buildChoicesPrompt({
      ...buildArgs,
      customBudget: budget,
    });

    const response = await providerFetch(
      "/api/generate-stream",
      {
        messages: choicesPrompt.messages,
        model: fetchOptions.model,
        maxTokens: 1500,
        temperature: 0.7,
        openRouterKey: fetchOptions.openRouterKey,
        deepseekKey: fetchOptions.deepseekKey,
        googleKey: fetchOptions.googleKey,
        mistralKey: fetchOptions.mistralKey,
        deepinfraKey: fetchOptions.deepinfraKey,
        customModel: getCustomModelIfUUID(fetchOptions.model),
      },
      fetchOptions.abortSignal,
    );

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      const errMsg = `Choices generation failed: ${response.status} - ${errorText}`;
      if (!overflowRetried && isContextOverflowError(errMsg)) {
        overflowRetried = true;
        budget = Math.max(
          1500,
          Math.floor((budget || CHOICES_STAGE_TOKEN_BUDGET) / 2),
        );
        logger.action(
          "Choices stage hit context overflow, retrying with reduced budget",
          { newBudget: budget },
        );
        continue choicesFetchLoop;
      }
      throw new Error(errMsg);
    }

    let content = "";
    let meta: GenerationMeta | undefined;
    let overflowMidStream = false;

    for await (const event of parseSSEStream(response)) {
      if (event.type === "error") {
        const errMsg = event.error || "Choices generation failed";
        if (!overflowRetried && isContextOverflowError(errMsg)) {
          overflowRetried = true;
          budget = Math.max(
            1500,
            Math.floor((budget || CHOICES_STAGE_TOKEN_BUDGET) / 2),
          );
          overflowMidStream = true;
          logger.action(
            "Choices stage hit context overflow mid-stream, retrying with reduced budget",
            { newBudget: budget },
          );
          break;
        }
        throw new Error(errMsg);
      }
      if (event.type === "content" && event.content) {
        content += event.content;
      }
      if (event.type === "done" && event.meta) {
        meta = event.meta;
      }
    }

    if (overflowMidStream) continue choicesFetchLoop;

    return { content, meta };
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
        /use_skill:\s*([^(;]+?)(?:\s*\((?:DC\s*)?(\d+|trivial|easy|average|hard|very_hard|impossible)(?:\s*succ(?:ess)?(?:es)?\s*(?:needed|required)?)?\))?(?:;|$)/i,
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
            "",
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
            "",
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
        /custom_table:\s*([^;]+?)(?:;|$)/i,
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

// A whole-turn redo (fresh GM + story + choices calls) is much costlier
// than the M2 gate's per-round retry, so the observer's automatic reset is
// capped much lower - one retry, then fail open (accept the turn, keep the
// flag attached for display) rather than risk looping the player forever.
const MAX_OBSERVER_RESETS = 1;

/**
 * Executes a complete story turn, then runs the Layer-5 observer (see
 * observer.ts) against the result. A "major" flag (the GM spoke/acted for
 * the player, or blew way past the reply-length ceiling) rolls storyData
 * back to its pre-turn snapshot and retries the whole turn with a corrective
 * note telling the GM exactly what it was flagged for - same fail-open
 * posture as the M2 roll-invariant gate below: never blocks play forever.
 */
export async function generateStoryTurn(
  storyData: StoryData,
  userChoice: string,
  options: GenerationOptions,
  callbacks: GenerationCallbacks,
): Promise<GenerationResult> {
  let preTurnSnapshot: StoryData | null = null;
  try {
    preTurnSnapshot = structuredClone(storyData);
  } catch (snapshotError) {
    logger.action(
      "Observer: failed to snapshot pre-turn state, automatic reset disabled for this turn",
      {
        error:
          snapshotError instanceof Error
            ? snapshotError.message
            : String(snapshotError),
      },
    );
  }

  // Carry forward any flags that survived the PRIOR turn (minor flags never
  // trigger a reset, and a major flag can still survive if the reset budget
  // ran out) - otherwise a flagged mistake reaches the player via the
  // ScenePart.observerFlags toast but the GM itself never learns it did
  // anything wrong. Overridden below the moment a same-turn reset fires,
  // since that corrective note is about THIS turn and takes priority.
  const lastAssistantPart = [...storyData.scene.parts]
    .reverse()
    .find((p) => !p.user && p.role === "assistant");
  let observerNote: string | undefined = buildObserverWarningNote(
    lastAssistantPart?.observerFlags,
  );
  let resetAttempts = 0;

  while (true) {
    const result = await generateStoryTurnOnce(
      storyData,
      userChoice,
      {
        ...options,
        observerNote,
        // A reset discards the previous attempt's tool calls/narration - if
        // it also came with a precomputedGMConversation (manual Retry flow),
        // replaying that would just replay the flagged content, so force a
        // fresh GM stage on every retry attempt past the first.
        precomputedGMConversation:
          resetAttempts === 0 ? options.precomputedGMConversation : undefined,
      },
      callbacks,
    );

    // Only a turn with actual narration is worth reviewing - an empty
    // result (e.g. a no-op tool-only round) has nothing for the observer to
    // judge. generateStoryTurnOnce throws rather than returning on failure,
    // so a successfully-returned result always has success: true here.
    if (!result.content.trim()) {
      return result;
    }

    // Shared by the observer and the memory agent below - both are
    // best-effort side calls for the turn that just completed, using
    // whatever model actually generated it, unless the user pinned a
    // specific model/effort for that stage in Settings > Architecture
    // (layerSettings.ts).
    const sideCallApiOptions = {
      model:
        result.meta.storyMeta?.model ||
        result.meta.gmMeta?.model ||
        options.storyModel,
      token: null,
      openRouterKey: options.openRouterKey,
      deepseekKey: options.deepseekKey,
      googleKey: options.googleKey,
      mistralKey: options.mistralKey,
      deepinfraKey: options.deepinfraKey,
      abortSignal: options.abortSignal,
    };

    // Explicit caller-supplied settings win; otherwise fall back to the
    // user's stored Architecture-tab config (defaults to
    // DEFAULT_OBSERVER_SETTINGS, reproducing pre-existing behavior).
    const observerSettings = options.observerSettings ?? getObserverSettings();
    const observerModelOverride = getObserverModelOverride();
    const observerApiOptions = {
      ...sideCallApiOptions,
      ...resolveSideCallModel(observerModelOverride, sideCallApiOptions.model),
    };

    let flags: ObserverFlag[] = [];
    try {
      flags = await runObserver({
        narration: result.content,
        playerChoice: userChoice,
        replyLength: options.replyLength,
        toolNames: (result.gmResults || []).map((r) => r.toolName),
        rollResults: (result.gmResults || []).map((r) => ({
          toolName: r.toolName,
          success: r.success,
          contextForStory: r.contextForStory,
        })),
        settings: observerSettings,
        apiOptions: observerApiOptions,
      });
    } catch (observerError) {
      // Fail open - an observer infra failure should never block the turn.
      logger.action("Observer check failed, treating as pass (fail open)", {
        error:
          observerError instanceof Error
            ? observerError.message
            : String(observerError),
      });
      flags = [];
    }

    // A flag only resets when it's both "major" severity (decided per-
    // instance by the check itself) AND that flag type's triggersReset is
    // on (decided by config - defaults to true for the three checks that
    // can naturally be major, false for the two tool-usage-gap checks,
    // reproducing exactly what shipped before this setting existed).
    const majorFlag = flags.find(
      (f) =>
        f.severity === "major" &&
        settingsFor(observerSettings, f.type).triggersReset,
    );

    if (majorFlag && preTurnSnapshot && resetAttempts < MAX_OBSERVER_RESETS) {
      resetAttempts++;
      logger.action("Observer flagged turn for automatic reset", {
        type: majorFlag.type,
        detail: majorFlag.detail,
        attempt: resetAttempts,
      });

      // Full state rollback, restored in place (delete-all-keys +
      // Object.assign) so every closure over storyData (the caller, other
      // callbacks already fired this turn) keeps seeing the same object -
      // same idiom as page.tsx's handleUndo.
      for (const key of Object.keys(storyData)) {
        delete (storyData as unknown as Record<string, unknown>)[key];
      }
      Object.assign(storyData, preTurnSnapshot);

      observerNote = majorFlag.correctivePrompt;
      callbacks.onObserverReset?.(flags, majorFlag);
      continue;
    }

    if (flags.length > 0) {
      result.scenePart = { ...result.scenePart, observerFlags: flags };
    }

    // Layer 4: the memory agent (memoryAgent.ts) decides what from this
    // turn is worth persisting, now that the turn is final and won't be
    // reset again. Mutates storyData.memory directly; best-effort, same
    // fail-open posture as the observer above.
    try {
      const memoryKeeperApiOptions = {
        ...sideCallApiOptions,
        ...resolveSideCallModel(
          getMemoryKeeperModelOverride(),
          sideCallApiOptions.model,
        ),
      };
      await runMemoryAgent(
        storyData,
        result.content,
        userChoice,
        memoryKeeperApiOptions,
      );
    } catch (memoryAgentError) {
      logger.action("Memory agent failed, skipping (fail open)", {
        error:
          memoryAgentError instanceof Error
            ? memoryAgentError.message
            : String(memoryAgentError),
      });
    }

    return result;
  }
}

async function generateStoryTurnOnce(
  storyData: StoryData,
  userChoice: string,
  options: GenerationOptions,
  callbacks: GenerationCallbacks,
): Promise<GenerationResult> {
  // The app is fully local/BYOK now - there's no backend auth system, so
  // this is always null. Kept as a variable (rather than stripped from the
  // ~9 downstream call sites in this function) since it's threaded through
  // as an inert Authorization header/option field that nothing reads.
  const token: string | null = null;

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
    // Automatic pre-fetch is intentionally not used: the GM instead pulls
    // context on demand via the read_notes/search_memory tools (agentic
    // retrieval instead of RAG pre-injection). embeddingContext stays
    // undefined here; search_memory/search_notes fall back to semantic
    // search directly (see gmExecutor.ts) when their substring match misses.
    // ========================================
    const embeddingContext: EmbeddingContext | undefined = undefined;

    // ========================================
    // STAGE 0.5: GM Stage (if enabled)
    // AI thinks out loud like a tabletop GM, calls tools in a loop
    // until no more tool calls are made (natural completion)
    // ========================================
    let gmResults: GMToolResult[] = [];
    let gmStoryContext = "";
    let gmFinalStoryContent = ""; // NEW: GM's final prose content (when no tool calls)
    let gmMeta: GenerationMeta | undefined;
    const gmThinking: string[] = []; // Capture GM's private <thinking> reasoning text
    let gmBaseMessages: ChatMessage[] = []; // Base GM prompt for story continuation
    let gmConversationHistory: ChatMessage[] = []; // Full GM conversation history for continuation
    let gmModel = ""; // Track which model was used for GM stage
    // Resolved once per turn so a mid-turn override change doesn't cause the
    // narration voice to shift inconsistently within a single generation.
    const narrationModel = getEffectiveNarrationModelKey();

    // Deterministic pacing nudge (Layer 3): measure how much the player has
    // had to read over recent turns and, if it's trending away from the Reply
    // Length setting, inject a corrective hint into this turn's prompts. Pure,
    // non-blocking, computed once per turn.
    const pacingNote = computePacingFeedback(
      storyData.scene.parts,
      options.replyLength || "medium",
    ).message;

    // Extract user choice - either from parameter or from last user scene
    // part. Needed by every branch below: the round loop uses it to run
    // the GM stage, and the precomputed-conversation (retry) / no-choice
    // branches use it to rebuild the GM base prompt without an API call.
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

    // Use a precomputed GM conversation if provided (retry flow: reuse the
    // popped turn's saved gmConversation instead of re-running the GM
    // stage's tool-calling loop). Rebuilding the base prompt here is cheap
    // (no API call, just the system/state/tools message) - it lets Stage 1
    // below treat this exactly like the normal "continue GM conversation"
    // narration call.
    if (options.precomputedGMConversation) {
      gmConversationHistory = options.precomputedGMConversation;
      const gmPrompt = buildGMStagePrompt({
        storyData,
        userChoice: gmUserChoice,
        customMaxContext: options.customMaxContext || GM_STAGE_DEFAULT_BUDGET,
        modelName: narrationModel,
        replyLength: options.replyLength,
        pacingNote,
        observerNote: options.observerNote,
      });
      gmBaseMessages = gmPrompt.messages;
      logger.action("Using precomputed GM conversation (retry flow)", {
        historyEntries: gmConversationHistory.length,
      });
    } else {
      // GM Stage is always enabled - legacy tool calling has been removed
      // The enableGMStage option is now ignored and GM stage always runs
      callbacks.onGMStageStart?.();
      logger.action("Stage 0.5: Running GM stage for mechanics determination");

      if (!gmUserChoice) {
        // No prior user choice to adjudicate (e.g. very first turn) - skip
        // the tool-calling loop, but still build the base prompt so Stage 1
        // has something to continue.
        logger.action("GM stage skipped - no user choice found");
        gmStoryContext = "";
        const gmPrompt = buildGMStagePrompt({
          storyData,
          userChoice: "",
          customMaxContext:
            options.customMaxContext || GM_STAGE_DEFAULT_BUDGET,
          modelName: narrationModel,
          replyLength: options.replyLength,
          pacingNote,
          observerNote: options.observerNote,
        });
        gmBaseMessages = gmPrompt.messages;
      } else {
        // Two-Pass Visibility (§2.3): resolve "check_per_turn" lore once per
        // turn, before the round loop starts - the digital equivalent of a
        // passive Perception check. See resolveCheckPerTurnVisibility.
        const passivelyRevealed = resolveCheckPerTurnVisibility(storyData);
        if (passivelyRevealed.length > 0) {
          logger.action("Passively revealed check_per_turn lore entries", {
            titles: passivelyRevealed,
          });
        }

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
          decayedTier,
        );

        if (isClassificationAmbiguous(storyData, gmUserChoice)) {
          try {
            const classifierModel = getEffectiveTiers()[0].modelKey;
            const classifierResult = await generateSimple(
              [{ role: "user", content: buildClassifierPrompt(gmUserChoice) }],
              {
                model: classifierModel,
                maxTokens: 10,
                temperature: 0,
                openRouterKey: options.openRouterKey,
                deepseekKey: options.deepseekKey,
                googleKey: options.googleKey,
                mistralKey: options.mistralKey,
                deepinfraKey: options.deepinfraKey,
                customModel: getCustomModelIfUUID(classifierModel),
              },
            );
            startingTier = Math.max(
              startingTier,
              classificationLabelToTier(classifierResult.content || ""),
            );
          } catch (classifyError) {
            logger.action(
              "Reasoning-tier classifier call failed, using deterministic default",
              {
                error:
                  classifyError instanceof Error
                    ? classifyError.message
                    : String(classifyError),
              },
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
        let gmReasoningEffort: ReasoningEffort =
          initialResolvedTier.reasoningEffort;
        logger.action("Reasoning tier resolved for GM stage", {
          describe: describeTier(initialResolvedTier),
        });

        // Compaction: fold any scene history that's about to age out of the
        // GM stage's history budget into storyData.scene.summary instead of
        // letting it silently drop. Safe/cheap to call every turn - it's a
        // no-op unless enough new history has accumulated since the last
        // summary (see compaction.ts). Runs before the round loop below so
        // every round's rebuilt-or-cached prompt can include the summary.
        try {
          const { historyBudget: gmHistoryBudget } = computeGMStageBudget(
            options.customMaxContext,
            gmModel,
          );
          const compactionResult = await ensureStoryCompacted(
            storyData,
            gmHistoryBudget,
            {
              model: options.storyModel || gmModel,
              token,
              openRouterKey: options.openRouterKey,
              deepseekKey: options.deepseekKey,
              googleKey: options.googleKey,
              abortSignal: options.abortSignal,
            },
          );
          if (compactionResult.ran) {
            logger.action("Compacted aging scene history into summary", {
              summaryLength: compactionResult.summary?.length,
            });
            if (compactionResult.summary) {
              callbacks.onCompaction?.(compactionResult.summary);
            }
          }
        } catch (compactionError) {
          // Non-fatal: compaction is a nice-to-have, not required for the
          // turn to proceed. The sliding window still drops old parts
          // either way, so failing here can't make things worse.
          logger.action("Compaction failed, continuing without it", {
            error:
              compactionError instanceof Error
                ? compactionError.message
                : String(compactionError),
          });
        }

        // Memory reflection (see reflection.ts): synthesize higher-level
        // insights from clusters of recent memories, Generative Agents'
        // actual differentiator over flat similarity-ranked recall. Same
        // "safe/cheap every turn, no-op until due" posture as compaction
        // above - only fires once enough importance-weighted new memory has
        // accumulated since the last pass.
        try {
          const reflectionModelOverride = getReflectionModelOverride();
          const reflectionApiOptions = {
            ...resolveSideCallModel(
              reflectionModelOverride,
              options.storyModel || gmModel,
            ),
            token,
            openRouterKey: options.openRouterKey,
            deepseekKey: options.deepseekKey,
            googleKey: options.googleKey,
            abortSignal: options.abortSignal,
          };
          const reflectionResult = await ensureStoryReflected(
            storyData,
            reflectionApiOptions,
          );
          if (reflectionResult.ran) {
            logger.action("Reflected on recent memory, synthesized insights", {
              insightCount: reflectionResult.insights?.length ?? 0,
            });
          }
        } catch (reflectionError) {
          // Non-fatal: reflection is a nice-to-have enrichment, not required
          // for the turn to proceed.
          logger.action("Reflection failed, continuing without it", {
            error:
              reflectionError instanceof Error
                ? reflectionError.message
                : String(reflectionError),
          });
        }

        // GM stage loop - continues until no more tool calls (AI writes final story)
        const MAX_GM_ROUNDS = options.maxToolLoops || 10; // User-configurable safety limit
        let gmRound = 0;
        let allGMContextParts: string[] = [];
        // NEW: Accumulate visible prose from ALL rounds (not just the final one)
        // This allows GM to narrate while calling tools, building up the story incrementally
        let gmAccumulatedStory: string[] = [];
        // Local conversation history (will be copied to outer scope at end)
        let conversationHistory: ChatMessage[] = [];
        let isComplete = false;
        let noToolCallPrompts = 0; // Track how many times we've prompted for tool calls
        const MAX_NO_TOOL_PROMPTS = 2; // Max times to prompt before giving up
        // Set by the M2 roll-invariant gate (search "M2 roll-invariant gate"
        // below) when it forces a retry round - makes that one round require
        // a tool call outright rather than relying on prose alone to ask for
        // one. Consumed (read then cleared) at the top of the next round.
        let forceToolChoiceNextRound: "required" | undefined;
        // Client-side token budgeting is only an estimate, so a request can
        // still overflow the model's real context window. currentGMBudget
        // starts at the configured (or default) budget and is permanently
        // halved, once, if the provider reports an overflow - retrying the
        // same round instead of failing the whole turn.
        let currentGMBudget =
          options.customMaxContext || GM_STAGE_DEFAULT_BUDGET;
        let gmOverflowRetryUsed = false;
        // The system prompt + state message (lore/NPCs/combat/timers) only
        // need to be rebuilt when something that would change them happens:
        // the first round, or a budget change after an overflow retry.
        // Reusing the same messages array across rounds within a turn keeps
        // that prefix byte-identical round to round, which is what lets
        // providers with automatic prefix caching (DeepSeek, Gemini,
        // OpenRouter) actually cache it - rebuilding from (possibly
        // tool-mutated) storyData every round guaranteed a cache miss on
        // every single round of every turn. Tool calls that change state
        // mid-turn still reach the GM via their tool-result message in
        // conversationHistory below, same as a coding agent doesn't
        // re-render the whole file tree after every Edit - it reads the
        // diff in the tool result.
        let gmBaseTools: unknown[] = [];
        let needsGMPromptRebuild = true;

        gmRoundLoop: while (gmRound < MAX_GM_ROUNDS && !isComplete) {
          gmRound++;

          // Consume this round's forced tool_choice (if the M2 gate set one
          // for us on the previous round) and clear it immediately - it
          // must apply to exactly this one round, not leak into later ones.
          const toolChoiceThisRound = forceToolChoiceNextRound;
          forceToolChoiceNextRound = undefined;

          // Re-derive tier from storyData.reasoningTierState each round: if the
          // previous round's tool execution included a set_reasoning_tier call,
          // executeSetReasoningTier (gmExecutor.ts) already applied the
          // decay/cap policy and mutated this state - picking it up here is
          // what makes self-escalation take effect for the NEXT round.
          const roundTier = resolveTier(
            storyData.reasoningTierState?.currentTier ?? SCENE_BASELINE_TIER,
          );
          gmModel = roundTier.modelKey;
          gmReasoningEffort = roundTier.reasoningEffort;
          logger.action(`GM stage round ${gmRound}`, {
            describe: describeTier(roundTier),
          });

          if (needsGMPromptRebuild) {
            // GM Stage receives customMaxContext (Memory Size slider) for context allocation
            const gmPrompt = buildGMStagePrompt({
              storyData,
              userChoice: gmUserChoice,
              customMaxContext: currentGMBudget,
              modelName: gmModel,
              replyLength: options.replyLength,
              pacingNote,
              observerNote: options.observerNote,
            });
            gmBaseMessages = [...gmPrompt.messages];
            gmBaseTools = gmPrompt.tools;
            needsGMPromptRebuild = false;
          }

          // Add conversation history from previous rounds
          const messagesWithHistory = [...gmBaseMessages];

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
          const buildGmRequestBody = (
            model: string,
            effort: ReasoningEffort,
          ): GenerateRequestBody => ({
              messages: messagesWithHistory,
              tools: gmBaseTools,
              model,
              reasoningEffort: effort,
              // Honor the user's Response Length setting (options.customMaxOutput)
              // per GM round - it used to be ignored here, which is why lowering
              // it had no effect on normal play (the GM stage's own output IS the
              // player-visible story, see gmFinalStoryContent below).
              maxTokens: Math.min(
                options.customMaxOutput || 12000,
                getModelConfig(model).maxOutputTokens || 4000,
              ),
              // Base 0.4 for natural GM thinking, nudged by the story's
              // Chaos Factor (§2.4) - this is the GM stage's own request,
              // and its output IS the player-visible story on the common
              // path (see gmFinalStoryContent above), so this is where the
              // Chaos Factor -> temperature link actually needs to live.
              temperature:
                0.4 + chaosFactorTemperatureDelta(storyData.agmtState?.chaosFactor),
              openRouterKey: options.openRouterKey,
              deepseekKey: options.deepseekKey,
              googleKey: options.googleKey,
              mistralKey: options.mistralKey,
              deepinfraKey: options.deepinfraKey,
              customModel: getCustomModelIfUUID(model),
              // Set only on the round immediately after the M2 gate fires -
              // forces the model to call some tool rather than relying on
              // the prose re-prompt alone. Omitted otherwise, letting the
              // route apply its normal per-provider default.
              ...(toolChoiceThisRound
                ? { toolChoice: toolChoiceThisRound }
                : {}),
            });

          let gmResponse = await providerFetch(
            "/api/generate-stream",
            buildGmRequestBody(gmModel, gmReasoningEffort),
            options.abortSignal,
          );

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
                },
              );
              gmModel = fallbackResolved.modelKey;
              gmReasoningEffort = fallbackResolved.reasoningEffort;
              storyData.reasoningTierState = {
                ...getTierState(storyData),
                currentTier: fallbackResolved.tier,
              };
              gmResponse = await providerFetch(
                "/api/generate-stream",
                buildGmRequestBody(gmModel, gmReasoningEffort),
                options.abortSignal,
              );
            }
          }

          if (!gmResponse.ok) {
            const errorText = await gmResponse.text().catch(() => "");
            const errMsg = `GM stage failed: ${gmResponse.status} - ${errorText}`;
            if (!gmOverflowRetryUsed && isContextOverflowError(errMsg)) {
              gmOverflowRetryUsed = true;
              currentGMBudget = Math.max(8000, Math.floor(currentGMBudget / 2));
              needsGMPromptRebuild = true;
              gmRound--; // don't burn a round on a request that never actually ran
              logger.action(
                "GM stage hit context overflow, retrying with reduced budget",
                { newBudget: currentGMBudget },
              );
              continue gmRoundLoop;
            }
            throw new Error(errMsg);
          }

          // Stream the GM response
          let gmContent = "";
          let gmReasoning = "";
          let gmReasoningDetails: ReasoningDetail[] = [];
          let gmToolCalls: any[] = [];
          let gmResultMeta: any = null;

          let gmOverflowMidStream = false;
          for await (const event of parseSSEStream(gmResponse)) {
            if (event.type === "error") {
              const errMsg = event.error || "GM generation failed";
              if (!gmOverflowRetryUsed && isContextOverflowError(errMsg)) {
                gmOverflowRetryUsed = true;
                gmOverflowMidStream = true;
                currentGMBudget = Math.max(
                  8000,
                  Math.floor(currentGMBudget / 2),
                );
                needsGMPromptRebuild = true;
                gmRound--;
                logger.action(
                  "GM stage hit context overflow mid-stream, retrying with reduced budget",
                  { newBudget: currentGMBudget },
                );
                break;
              }
              throw new Error(errMsg);
            }
            if (event.type === "content" && event.content) {
              gmContent += event.content;
              // Stream GM content to callback for real-time display
              callbacks.onGMContent?.(event.content, gmContent);
            }
            if (event.type === "reasoning" && event.content) {
              gmReasoning += event.content;
              callbacks.onGMReasoning?.(event.content, gmReasoning);
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

          if (gmOverflowMidStream) {
            continue gmRoundLoop;
          }

          // Build gmResult object from streamed data
          const gmResult = {
            content: gmContent,
            reasoning: gmReasoning,
            reasoning_details: gmReasoningDetails,
            toolCalls: gmToolCalls,
            meta: gmResultMeta,
          };

          logger.action(`GM stage round ${gmRound} raw response`, gmResult);

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

              // NEW: Add raw content to accumulated story (preserve <thinking> tags)
              // extractVisibleText() pulls the player-visible narration out below
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
                  },
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
              storyData,
              {
                enabled: options.enableEmbeddings,
                storyId: options.storyId,
                token,
              },
              {
                requestManualRoll: callbacks.onAskForRoll,
                requestDiceThrow: callbacks.onRequestDiceThrow,
                requestPlayerAnswer: callbacks.onAskQuestion,
              },
              {
                apiKeys: {
                  openRouterKey: options.openRouterKey,
                  deepseekKey: options.deepseekKey,
                  googleKey: options.googleKey,
                  mistralKey: options.mistralKey,
                  deepinfraKey: options.deepinfraKey,
                },
                token,
                webResearchEnabled: options.webResearchEnabled,
                braveSearchKey: options.braveSearchKey,
              },
            );

            // Accumulate results across rounds
            gmResults.push(...gmExecution.results);
            if (gmExecution.storyContext) {
              allGMContextParts.push(gmExecution.storyContext);
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
              if (DICE_TOOLS.includes(r.toolName)) {
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
                },
              );
            }

            // Add tool results to conversation history - one per tool call
            // Make error messages VERY clear so the AI can correct its mistake
            // BUT: Dice tools use success=false to mean "check failed", not "tool error"
            for (let i = 0; i < gmResult.toolCalls.length; i++) {
              const tc = gmResult.toolCalls[i];
              const result = gmExecution.results[i];

              let toolContent: string;
              if (result) {
                // Check if this is a dice tool - these return success=false for failed checks,
                // which is a VALID GAME OUTCOME, not an error
                const isDiceTool = DICE_TOOLS.includes(result.toolName);
                // Only treat as error if: (1) not a dice tool AND (2) success is false
                // OR if it's a dice tool but contextForStory contains "ERROR"
                const isActualError = isDiceTool
                  ? (result.contextForStory?.includes("ERROR") ?? false)
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

                const summaryPart = `[GAME MASTER Summary: ${gmExecution.finalSummary}]`;
                allGMContextParts.push(summaryPart);

                if (gmExecution.narrativeHints) {
                  const hintsPart = `[Narrative Hints: ${gmExecution.narrativeHints}]`;
                  allGMContextParts.push(hintsPart);
                }
                if (gmExecution.dramaticMoment) {
                  allGMContextParts.push(`[DRAMATIC MOMENT]`);
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
              "GM stage round complete, continuing to see if more tools needed",
            );
            continue;
          } else {
            // No tool calls - GM is done!
            // NOTE: The content/prose was already extracted and added to gmAccumulatedStory
            // earlier in this round (at the "Capture GM's thinking text" block).
            // We just need to mark completion and add context parts for backward compat.
            const content = gmResult.content || "";

            // IMPORTANT: Add the final assistant response to conversation history
            // even without tool calls, so it gets saved in gmConversation.
            // Must include reasoning/reasoning_details like the tool-call
            // branch above - this terminal round is the only round on a
            // single-round turn, so omitting them here was silently
            // dropping the model's actual reasoning before it ever reached
            // gmConversation/ScenePart, even though it streamed live via
            // onGMReasoning during generation.
            if (content.trim()) {
              conversationHistory.push({
                role: "assistant",
                content: content,
                reasoning: gmResult.reasoning,
                reasoning_details: gmResult.reasoning_details,
              });
            }

            // Check for repetition (AI stuck in a loop)
            const isRepetitive = detectRepetition(content);

            if (isRepetitive) {
              logger.action(
                "GM stage detected repetitive content - forcing end",
              );
              allGMContextParts.push(
                `[GAME MASTER: AI got stuck in repetition loop.]`,
              );
            } else if (content.trim()) {
              // Add raw content to context parts (with thinking) for backward compat
              // (Prose extraction already happened earlier - don't duplicate)
              allGMContextParts.push(content);

              logger.action(
                "GM stage complete - no tool calls, prose already captured",
                {
                  rawLength: content.length,
                  totalAccumulatedParts: gmAccumulatedStory.length,
                },
              );
            }

            // M2 roll-invariant gate (see isSceneGatedForRoll/
            // hasSatisfiedRollGate, reasoningTiers.ts): when this scene is
            // gated (combat active, a challenge active, or the GM itself
            // declared high/deadly stakes on a roll earlier this scene),
            // require at least one roll/oracle tool call somewhere in this
            // turn's accumulated results before letting the round end on
            // prose alone.
            const sceneIsGated = isSceneGatedForRoll(storyData);
            const rollToolCalledThisTurn = hasSatisfiedRollGate(
              gmResults.map((r) => r.toolName)
            );

            if (
              sceneIsGated &&
              !rollToolCalledThisTurn &&
              !isRepetitive &&
              noToolCallPrompts < MAX_NO_TOOL_PROMPTS
            ) {
              noToolCallPrompts++;
              logger.action(
                "M2 gate: gated scene ended with no roll/oracle tool call - forcing another round",
                {
                  noToolCallPrompts,
                  combatActive: storyData.combatState?.active,
                  challengeActive: storyData.activeChallenge?.active,
                  highStakesSceneKey:
                    storyData.reasoningTierState?.highStakesSceneKey,
                },
              );
              conversationHistory.push({
                role: "user",
                content:
                  "This scene requires a roll before the turn can end - combat or a challenge is active, or you declared high/deadly stakes earlier this scene. Resolve the pending action with formula_roll, opposed_formula, formula_challenge_check, fate_question, or npc_roll, then continue.",
              });
              forceToolChoiceNextRound = "required";
              continue gmRoundLoop;
            }

            // Leniency audit (widened past M2's hard gate): M2 only forces a
            // retry when combat/challenge/high-stakes is active. This is a
            // purely advisory, non-blocking log of the same underlying drift
            // outside that scope too - e.g. a narrated "you persuade the
            // merchant" success with no roll, in an ungated scene. Never
            // affects control flow; just widens visibility for later audits.
            if (!rollToolCalledThisTurn) {
              const stateChangingToolsThisTurn = gmResults
                .map((r) => r.toolName)
                .filter((name) => STATE_CHANGE_TOOLS.has(name));
              if (stateChangingToolsThisTurn.length > 0) {
                logger.action(
                  "Leniency audit: state-changing tool(s) fired with no roll/oracle tool call this turn",
                  {
                    stateChangingTools: stateChangingToolsThisTurn,
                    sceneGated: sceneIsGated,
                  },
                );
              }
            }

            // Gate cap hit, or not gated at all - fail open (complete
            // anyway) rather than get the turn stuck, matching this
            // codebase's established "warn, don't hard-block" posture for
            // every other advisory check.
            isComplete = true;
            break;
          }
        }

        // Combine all context parts from all rounds (for backward compat/logging)
        gmStoryContext = allGMContextParts.join("\n\n");
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
          // Join all accumulated parts - preserve <thinking> tags for UI to process
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
        gmThinking.length > 0 ? gmThinking : undefined,
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
        },
      );

      // Use GM's content directly as the story
      rawStoryContent = gmFinalStoryContent;

      // Extract only the player-visible narration - robust against a
      // truncated/dangling <thinking> tag (unlike the old stripThinkingTags
      // call this replaced, which only ran at final-save time and could
      // leak a raw tag fragment if generation was cut off mid-tag).
      storyContent = extractVisibleText(gmFinalStoryContent);

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

      if (options.deAiifyWords !== false) {
        storyContent = deAiifyText(storyContent);
      }

      // Stream the content to the UI in one chunk
      callbacks.onStoryContent?.(storyContent, storyContent);

      // Mark story as complete
      callbacks.onStoryComplete?.(
        storyContent,
        gmMeta?.usage || {
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
        },
      );
      logger.action("Stage 1 complete (from GM content)", {
        contentLength: storyContent.length,
      });
    } else {
      // No GM content yet - continue the GM's own conversation with a short
      // prompt asking it to write the narration now. gmBaseMessages is
      // always populated by this point (the round loop, the
      // precomputed-conversation/retry branch, or the no-user-choice
      // branch above all build it), so this is the only remaining way
      // Stage 1 produces a story - the old standalone buildStoryPrompt()
      // call (used only for NovelAI, retries, and this fallback) has been
      // retired in favor of always continuing the same conversation.
      logger.action("Stage 1: Continuing GM conversation for story generation", {
        baseMessages: gmBaseMessages.length,
        historyEntries: gmConversationHistory.length,
        narrationModel,
      });

      // Enforce minimum 1000 tokens to account for prefill/format overhead
      // (some providers like OpenRouter count it against the output limit)
      const MIN_OUTPUT_TOKENS = 1000;
      const storyMaxOutput = Math.max(
        options.customMaxOutput || 8000,
        MIN_OUTPUT_TOKENS,
      );

      const storyContinuationPrompt = buildStoryContinuationPrompt(
        options.storytellerMode || "narrator",
        options.replyLength || "medium",
        pacingNote,
      );

      // Build messages: GM base + conversation history + story prompt
      const storyMessages: ChatMessage[] = [
        ...gmBaseMessages,
        ...gmConversationHistory,
        {
          role: "user" as const,
          content: storyContinuationPrompt,
        },
      ];

      // Clear pending player actions after they've been included in the prompt
      // (they were shown to the AI in the user choice message)
      if (
        storyData.pendingPlayerActions &&
        storyData.pendingPlayerActions.length > 0
      ) {
        logger.action(
          `Included ${storyData.pendingPlayerActions.length} pending player actions in prompt`,
        );
        storyData.pendingPlayerActions = [];
      }

      // Narration always runs on the (user-configurable) narration model,
      // regardless of which tier adjudication used - this is what keeps
      // the GM's voice consistent even when a turn escalated to a heavier
      // reasoning tier.
      const storyRequestBody: GenerateRequestBody = {
        messages: storyMessages,
        model: narrationModel,
        maxTokens: storyMaxOutput,
        temperature:
          (options.samplingSettings?.temperature ?? 0.7) +
          chaosFactorTemperatureDelta(storyData.agmtState?.chaosFactor),
        openRouterKey: options.openRouterKey,
        deepseekKey: options.deepseekKey,
        googleKey: options.googleKey,
        mistralKey: options.mistralKey,
        deepinfraKey: options.deepinfraKey,
        customModel: getCustomModelIfUUID(narrationModel),
        // Stop the AI before it generates GAME MASTER state updates (handled by tools stage)
        // Also stop on [STOP] marker for player agency stopping points
        stop: ["[GAME MASTER State Update]", "[GAME MASTER State", "[STOP]"],
      };

      // Add sampling settings for Coins mode (Mistral/DeepInfra)
      if (options.samplingSettings) {
        storyRequestBody.samplingSettings = options.samplingSettings;
      }

      const storyResponse = await providerFetch(
        "/api/generate-stream",
        storyRequestBody,
        options.abortSignal,
      );

      logger.action("Story stage request sent", {
        maxTokens: storyMaxOutput,
        model: narrationModel,
      });

      if (!storyResponse.ok) {
        const errorText = await storyResponse.text().catch(() => "");
        throw new Error(
          `Story generation failed: ${storyResponse.status} - ${errorText}`,
        );
      }

      // Process story stream, stripping any leading divider chars (---,
      // ***) the model might add before the real narration. Continuing the
      // GM conversation never uses a prefill (that was a
      // buildStoryPrompt-only affirmation), so there's no marker to hunt
      // for - just the leading-divider check below.
      let dividerStripped = false; // Track if we've stripped leading dividers
      let pendingContent = ""; // Buffer for stripping leading dividers
      let stopMarkerHit = false; // Track if we hit [STOP] during streaming
      const STOP_MARKER = "[STOP]";

      for await (const event of parseSSEStream(storyResponse)) {
        if (event.type === "error") {
          throw new Error(event.error || "Story generation failed");
        }
        if (event.type === "reasoning" && event.content) {
          storyReasoning += event.content;
          callbacks.onStoryReasoning?.(event.content, storyReasoning);
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

          if (dividerStripped) {
            // Already past leading dividers, stream directly
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
                "Hit [STOP] marker during streaming - stopping content emission",
              );
            } else {
              storyContent += event.content;
              callbacks.onStoryContent?.(event.content, storyContent);
            }
          } else {
            // Still checking for leading dividers
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
          }
        }
        if (event.type === "done" && event.meta) {
          storyMeta = event.meta;
          totalTokenCost += event.meta.tokenCost;
          finalBalance = event.meta.balance;
        }
      }

      // Handle any pending content that wasn't emitted
      if (!dividerStripped && pendingContent) {
        let cleaned = pendingContent
          .replace(/^[\s\n]*([-*_]{3,})[\s\n]*/g, "")
          .trimStart();
        storyContent = cleaned || pendingContent.trimStart();
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
          "",
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
          "",
        )
        .trim();

      // Also strip if there's no header but just the bullet-style state changes at the end
      // Pattern: lines starting with • containing arrows (→) indicating stat changes
      storyContent = storyContent
        .replace(/\n+(?:• [^\n]*→[^\n]*\n?)+$/, "")
        .trim();

      // Final thorough cleaning to isolate ONLY story content - robust
      // against a dangling tag even though the prompt no longer asks for
      // <output> wrapping (defends against a model that adds one anyway).
      storyContent = extractVisibleText(storyContent);

      if (options.deAiifyWords !== false) {
        storyContent = deAiifyText(storyContent);
      }

      callbacks.onStoryComplete?.(
        storyContent,
        storyMeta?.usage || {
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
        },
      );
      logger.action("Stage 1 complete", { contentLength: storyContent.length });
    } // End of else block (no GM content - continue GM conversation instead)

    // ========================================
    // STAGE 3: Choices
    // ========================================

    // Helper function for choices generation
    const runChoicesGeneration = async (): Promise<void> => {
      callbacks.onChoicesStart?.();
      logger.action("Stage 3: Building choices prompt (parallel)");

      // Choices are picked from already-decided narration - fixed cheap
      // model, not the (possibly escalated) adjudication tier.
      const { content: rawChoicesContent, meta: choicesResultMeta } =
        await generateChoicesWithRetry(
          {
            storyData,
            storyContent,
            embeddingContext,
            usePrefill: options.usePrefill !== false, // Default to true
          },
          {
            token,
            model: narrationModel,
            openRouterKey: options.openRouterKey,
            deepseekKey: options.deepseekKey,
            googleKey: options.googleKey,
            mistralKey: options.mistralKey,
            deepinfraKey: options.deepinfraKey,
            abortSignal: options.abortSignal,
          },
        );

      let choicesContent = rawChoicesContent;
      if (choicesResultMeta) {
        choicesMeta = choicesResultMeta;
        totalTokenCost += choicesResultMeta.tokenCost;
        finalBalance = choicesResultMeta.balance;
      }

      // Strip affirmation prefill if present (some providers like Mistral include it in response)
      if (options.usePrefill !== false) {
        choicesContent = stripAffirmationPrefill(
          choicesContent,
          CHOICES_AFFIRMATION,
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
        },
      );
      logger.action("Stage 3 complete", { choicesCount: choices.length });
    };

    // Legacy standalone "tools" stage was removed - the GM stage now handles
    // all state changes via its own tool-calling loop (see STAGE 0.5 above).
    if (!options.skipChoices) {
      logger.action("Stage 3: Running choices generation");
      await runChoicesGeneration();
    }

    // ========================================
    // STAGE 4: Sync new memories to embeddings
    // The GM primarily uses search_memory's literal pattern match on demand
    // (agentic retrieval, not automatic RAG pre-injection - see the STAGE 0
    // comment above). But search_memory now has a semantic fallback for
    // when that literal match misses (see semanticSearchFallback.ts and
    // gmExecutor.ts's executeSearchMemory), and that fallback only finds
    // anything if memories actually have embeddings - hence still syncing
    // them here, fire-and-forget, same as lore sync in story/page.tsx.
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
        token,
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

    // Layer-5 consistency check (see consistencyCheck.ts): narration has
    // already streamed to the client by this point, so this is recorded
    // for display/debugging and eval-harness metrics, never a live gate.
    const consistencyWarnings = checkNarrationConsistency(
      storyContent,
      storyData
    );
    if (consistencyWarnings.length > 0) {
      logger.action("Consistency check flagged narration", {
        warnings: consistencyWarnings,
      });
    }

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
      consistencyWarnings:
        consistencyWarnings.length > 0 ? consistencyWarnings : undefined,
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
    customModel?: CustomModel;
  },
): Promise<{
  content: string;
  toolCalls: ToolCall[];
  meta: GenerationMeta;
}> {
  const response = await providerFetch("/api/generate", {
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
    customModel: options.customModel,
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
  },
): AsyncGenerator<StreamEvent> {
  const response = await providerFetch("/api/generate-stream", {
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
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `Generation failed: ${response.status}`);
  }

  yield* parseSSEStream(response);
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
  },
): Promise<Choice[]> {
  // No backend auth system anymore - see generateStoryTurn's comment above.
  const token: string | null = null;

  // Get the last AI content from scene parts
  const lastAIPart = [...storyData.scene.parts]
    .reverse()
    .find((p) => !p.user && p.content.trim());
  const storyContent = lastAIPart?.content || "";

  logger.action("Generating choices only (intro_override mode)", {
    model: options.choicesModel,
    contentLength: storyContent.length,
  });

  const { content: choicesContent } = await generateChoicesWithRetry(
    { storyData, storyContent },
    {
      token,
      model: options.choicesModel,
      openRouterKey: options.openRouterKey,
      deepseekKey: options.deepseekKey,
      googleKey: options.googleKey,
      mistralKey: options.mistralKey,
      deepinfraKey: options.deepinfraKey,
    },
  );

  // Parse choices
  const choices = parseChoices(choicesContent, storyData);

  logger.action("Choices generation complete", { count: choices.length });

  return choices;
}
