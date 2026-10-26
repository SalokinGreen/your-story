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
import {
  GenerateRequestBody,
  modelRejectsForcedToolChoice,
  sentMaxTokens,
} from "@/app/misc/providerCall";
import {
  StoryData,
  StoryLore,
  CommandResponse,
  Choice,
  ScenePart,
  MemoryEntry,
  GMConversationMessage,
  ReasoningDetail,
  ObserverFlag,
  ObserverFlagType,
  ObserverRewriteOriginal,
  SceneImageRef,
} from "@/app/misc/structs";
import { createHeldTurnOutput } from "@/app/misc/heldTurnOutput";
import {
  BackgroundLayersDelta,
  findPartIndexById,
  isEmptyLayersDelta,
  snapshotValue,
  valueChanged,
} from "@/app/misc/backgroundPatch";
import {
  enqueueImageJob,
  cancelImageJobsForTurn,
  getImageJobState,
  type ImageJobDeps,
  type ImageToolContext,
} from "@/app/misc/imageJobs";
import { collectImageIds, missingImageIds } from "@/app/misc/imageStore";
import { getImageSettings, isImageToolAvailable } from "@/app/misc/imageSettings";
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
  getGMStageOutputTokens,
  roundCutOffEmpty,
  getHistoryParts,
  CHOICES_STAGE_TOKEN_BUDGET,
} from "@/app/misc/ai_staged";
import {
  computePacingFeedback,
  countNarrationWords,
} from "@/app/misc/pacingFeedback";
import { isContextOverflowError } from "@/app/misc/apiErrors";
import { ensureStoryCompacted } from "@/app/misc/compaction";
import { storyCacheKey, markRoundBreakpoint } from "@/app/misc/cacheMarks";
import { ensureStoryReflected } from "@/app/misc/reflection";
import { pickProviderKeys } from "@/app/misc/sideModelCall";
import { hasKeyForModel, getModelConfig } from "@/app/misc/ai_prices";
import { checkNarrationConsistency } from "@/app/misc/consistencyCheck";
import {
  runObserver,
  buildObserverWarningNote,
  buildObserverCorrectionNote,
  reconcileGmConversationAfterRewrite,
  reconcileGmThinkingAfterRewrite,
  settingsFor,
  canObserverTriggerReset,
  flagOnlyRewritables,
  plausibleResetFlagTypes,
  splitObserverSettings,
  restrictObserverSettings,
  replaceVisibleProse,
  buildObserverCharacterContext,
  observerSuspensionReason,
  hasCharacterSheetNote,
  extractOutcomeVerdicts,
  isAbortError,
  REWRITABLE_FLAG_TYPES,
  REWRITE_META_OPENERS,
  ObserverSettings,
  type ObserverParams,
  extractGmReasoning,
} from "@/app/misc/observer";
import { formatTintLine } from "@/app/misc/primaMateria";
import { runMemoryAgent } from "@/app/misc/memoryAgent";
import { runDirectorAssistant } from "@/app/misc/directorAssistant";
import { runStoryProgressObserver } from "@/app/misc/storyProgressObserver";
import {
  getObserverSettings,
  getRewriteConfirmModel,
  REWRITE_CONFIRM_DEFAULT_MODEL_KEY,
  getObserverModelOverride,
  getMemoryKeeperModelOverride,
  getReflectionModelOverride,
  getDirectorAssistantModelOverride,
  getStoryProgressObserverModelOverride,
  getStoryProgressCheckInterval,
  resolveSideCallModel,
  resolveObserverRewriteModel,
} from "@/app/misc/layerSettings";
import {
  outputToScenePart,
  extractThinkingTags,
  detectRepetition,
} from "@/app/misc/ai";
import {
  extractVisibleText,
  extractThinkingText,
} from "@/app/misc/turnTimeline";
import { stripLeakedToolCallMarkup } from "@/app/misc/toolCallFallback";
import { resolveSystem } from "@/app/misc/systems/resolve";
import {
  judgeChecksToAsk,
  pendingCheck,
  splitPlayerLines,
} from "@/app/misc/turnEndChecks";
import { askTurnEndJudge } from "@/app/misc/judges/turnEndJudge";
import { collectTurnFacts, snapshotJudgeView } from "@/app/misc/judges/facts";
import { buildReask, pacingNoteFor, runRung1, secretHits } from "@/app/misc/judges/rung1";
import { pickMajorFlag } from "@/app/misc/judges/combined";
import { confirmAndRewrite } from "@/app/misc/judges/correction";
import { resolveConfirmModel } from "@/app/misc/judges/confirm";
import { recheckRewrite } from "@/app/misc/judges/rewritePlan";
import { kindOnlyFlag } from "@/app/misc/judges/publicView";
import type { ConfirmedFinding, Fact } from "@/app/misc/judges/types";
import { deAiifyText } from "@/app/misc/deAiify";
import { newTurnLedger } from "@/app/misc/campaign/clocks";
import { newNameTurn, type NameTurnState } from "@/app/misc/names/accept";
import { appendToLastUser, buildNarrationContext } from "@/app/misc/campaign/narrationContext";
import {
  executeGMTools,
  GMToolResult,
  ManualRollRequest,
  ManualRollAnswer,
  DiceThrowRequest,
  AskQuestionRequest,
  AskQuestionAnswer,
  SetupConfirmationRequest,
  SetupConfirmationAnswer,
  GMExecutionResult,
  resolveCheckPerTurnVisibility,
  rollAwareToolName,
  resultStartedGame,
} from "@/app/misc/gmExecutor";
import { executeTools, ToolCall, STATE_CHANGE_TOOLS } from "@/app/misc/toolExecutor";
import { logger } from "@/app/misc/logger";
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
  beginTurnCost,
  recordAICall,
  logTurnCost,
  recordTurnCostCalibration,
} from "@/app/misc/turnCost";
import {
  SCENE_BASELINE_TIER,
  DEFAULT_REASONING_EFFORT,
  ReasoningEffort,
  ResolvedTier,
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
  nextDistinctTier,
  observerRetryTier,
  describeTier,
  getTierState,
  getEffectiveTiers,
  getEffectiveSlot,
  getEffectiveNarrationModelKey,
  getEffectiveNarrationEffort,
  applyTierEscalation,
  TOP_TIER,
} from "@/app/misc/reasoningTiers";
import {
  isPlanAwaitingNextBeat,
  getSetupProgress,
  currentSetupHashes,
  setupGateMessage,
  classifySetupRejection,
  setupEngineLine,
  SETUP_CARD_HANDED_BACK_LINE,
  MAX_SETUP_PROMPTS,
} from "@/app/misc/campaignPlan";
import { getCustomModelIfUUID, CustomModel } from "@/app/misc/user_settings";
import { rollGateMessage } from "@/app/misc/gateMessages";
import { setupParticipants } from "@/app/misc/setupSteps";

// ============================================================
// TYPES
// ============================================================

// Tools where a "failed" result (success=false) means the check didn't pass
// or the player skipped, not that the tool call itself errored. Only an
// explicit "ERROR" marker in contextForStory counts as a real failure.
//
// `calculate` is on this list because it's now where checks are settled: the
// dice tools report numbers, and a comparison coming out FALSE is an answer.
const DICE_TOOLS = [
  "formula_roll",
  "gm_roll",
  "ask_for_roll",
  "opposed_formula",
  "npc_roll",
  "calculate",
  "record_challenge_result",
  "action_roll",
  "feat_roll",
  "initiative_roll",
];

/**
 * A re-ask round may not roll (judge layer rung 2): the calls that were left
 * out of the run get an error result in their place, in the GM's call order,
 * so every tool call still has its tool message.
 */
export function mergeRefusedDiceCalls(
  all: ReadonlyArray<{ id: string; function: { name: string; arguments?: unknown } }>,
  ran: ReadonlyArray<{ id: string }>,
  execution: GMExecutionResult,
): GMExecutionResult {
  const ranIds = new Set(ran.map((tc) => tc.id));
  let next = 0;
  const results: GMToolResult[] = all.map((tc) => {
    if (ranIds.has(tc.id)) return execution.results[next++];
    const why = reaskRefusal(tc);
    const refused: GMToolResult = {
      toolName: tc.function.name,
      toolCallId: tc.id,
      success: false,
      result: {
        type: "state_change",
        message:
          why === "pause"
            ? "refused: a re-ask never pauses on the player"
            : "refused: the dice were already thrown this turn",
        command: tc.function.name,
      },
      contextForStory:
        why === "pause" /* both texts carry REASK_REFUSAL_TAG, which the saved timeline hides */
          ? `[ERROR] ${tc.function.name} was not run (re-ask refusal): this is a re-ask inside the turn, and it never stops to ask the player. Use what you have.`
          : `[ERROR] ${tc.function.name} was not run (re-ask refusal): this turn's dice are already thrown, and a re-ask never rolls or draws again. Use the result you have.`,
    };
    REASK_REFUSED.add(refused);
    return refused;
  });
  return { ...execution, results };
}

/**
 * True when a turn's tools already drew randomness: a die, an oracle or table,
 * a name draw, a track's progress roll. A full-turn retry would draw it again,
 * so it is refused (the re-ask's list, minus the deterministic `calculate` and
 * the pausing tools). A refused or errored call drew nothing.
 */
export function executedRandomness(
  results: readonly GMToolResult[] | undefined,
): boolean {
  return (results ?? []).some((r) => {
    if (isReaskRefused(r) || r.contextForStory?.trimStart().startsWith("[ERROR")) {
      return false;
    }
    if (
      r.toolName === "calculate" ||
      r.toolName === "record_challenge_result" ||
      r.toolName === "ask_question" ||
      r.toolName === "confirm_setup"
    ) {
      return false;
    }
    if (
      DICE_TOOLS.includes(r.toolName) ||
      REASK_EXTRA_ROLL_TOOLS.includes(r.toolName) ||
      r.toolName === "generate_name"
    ) {
      return true;
    }
    return (
      r.toolName === "manage_track" &&
      (r.result as { action?: unknown } | undefined)?.action === "progress_roll"
    );
  });
}

/** True when the story's campaign record holds a line with a keyword to watch for. */
export function storyHasLineKeywords(
  story: Pick<StoryData, "campaign">,
): boolean {
  return (story.campaign?.safety?.lines ?? []).some(
    (l) => (l.keywords ?? []).some((k) => k.trim() !== ""),
  );
}

/** Results a re-ask refused: kept for the provider's tool message, hidden from the player. */
const REASK_REFUSED = new WeakSet<GMToolResult>();
export function isReaskRefused(result: GMToolResult): boolean {
  return REASK_REFUSED.has(result);
}

/** Tools that draw or roll besides DICE_TOOLS: a re-ask never calls them. */
const REASK_EXTRA_ROLL_TOOLS = ["fate_question", "roll_table", "roll_portent"];
/** Tools that stop the turn for the player. */
const REASK_PAUSE_TOOLS = ["ask_question", "ask_for_roll", "confirm_setup"];

/**
 * Why a re-ask round may not run this call, or null when it may: it rolls or
 * draws (every dice tool, the oracles, a track's progress roll), or it would
 * pause the turn on the player. The list is the re-ask's own; the GM's tool
 * list itself stays the one stable list.
 */
export function reaskRefusal(tc: {
  function: { name: string; arguments?: unknown };
}): "roll" | "pause" | null {
  const name = tc.function.name;
  if (REASK_PAUSE_TOOLS.includes(name)) return "pause";
  if (DICE_TOOLS.includes(name) || REASK_EXTRA_ROLL_TOOLS.includes(name)) {
    return "roll";
  }
  if (name === "manage_track") {
    try {
      const raw = tc.function.arguments;
      const args =
        typeof raw === "string" ? JSON.parse(raw || "{}") : (raw ?? {});
      if ((args as { action?: unknown }).action === "progress_roll") return "roll";
    } catch {
      // Unreadable arguments: the executor will refuse them itself.
    }
  }
  return null;
}

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
  // Not read by generateStoryTurn: the reasoning-tier router picks the GM's
  // model, narration and choices run on the narration model
  // (getEffectiveNarrationModelKey), and the side agents run on their own
  // default (SIDE_AGENT_DEFAULT_MODEL_KEY, decision 51). Kept so existing
  // callers type-check.
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
  zaiKey?: string;
  // Pictures made in play (imageJobs.ts, docs/image-generation-design.md).
  // The page supplies the queue's dependencies (keys, live StoryData access)
  // and the id the turn's scene part will carry; without imageJobDeps the
  // GM is never offered generate_image. Host only: guests never generate.
  imageJobDeps?: ImageJobDeps;
  scenePartId?: string;
  // Embedding-based context retrieval
  storyId?: string; // Required for embedding search
  enableEmbeddings?: boolean; // Whether to use embedding-based context
  embeddingThreshold?: number; // Similarity threshold (0.1-0.5, default 0.25)
  // GM Stage (new architecture: AI determines mechanics via tool calls)
  enableGMStage?: boolean;
  gmStageModel?: string; // Model to use for GM stage (defaults to toolsModel)
  // Retry flow: reuse a previous turn's saved GM conversation (dice rolls,
  // tool results, reasoning) instead of re-running the GM stage's
  // tool-calling loop. The GM base prompt is rebuilt fresh (no API call)
  // and this is replayed as history, same as the normal
  // "continue GM conversation" narration call.
  precomputedGMConversation?: GMConversationMessage[];
  // Companion to precomputedGMConversation: the already-executed GM tool
  // results (dice rolls, increment_scene, etc.) from the attempt whose
  // narration is being reworded. Without this, gmResults stays empty
  // whenever a fresh GM stage is skipped, which silently blinds the
  // outcome-mismatch/tool-usage-gap observer checks (generateStoryTurn) and
  // the Director Assistant's increment_scene gate to a roll/tool call that
  // genuinely happened - they'd just never have anything to look at.
  precomputedGMResults?: GMToolResult[];
  // Sampling settings (story stage only; Mistral/DeepInfra/OpenRouter)
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
  // Who needs a character sheet during session zero (couch players or party
  // seats), passed on to the GM tool context for confirm_setup / start_game.
  setupPlayers?: { id: string; name: string }[];
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
  // Layer 3 periodic check-in (see storyProgressObserver.ts): set internally
  // by generateStoryTurn from the prior turn's surviving note, not meant to
  // be passed in by callers. Injected into the GM prompt as a holistic
  // pacing/momentum read, refreshed only every N turns.
  storyProgressNote?: string;
  // Same check-in's repeated-phrase callout (see storyProgressObserver.ts's
  // findRepeatedPhrases) - set internally the same way as storyProgressNote.
  repetitionNote?: string;
  // Same check-in's NPC knowledge-consistency callout - set internally the
  // same way as storyProgressNote.
  knowledgeNote?: string;
  // Set internally by generateStoryTurn when a tier_escalation_missed
  // observer flag forces a full-turn retry (observer.ts) - floors the GM
  // stage's starting tier for that retry so the forced escalation actually
  // takes effect, instead of being immediately undone by the normal
  // decay-toward-baseline step that assumes each call is a new turn rather
  // than a retry of the same one.
  forcedStartingTier?: number;
  // Whether an Observer reset may re-run the turn's tools and dice (judge-layer
  // design 3.3, Codex finding 3). Default true. The legacy reword path reuses a
  // saved GM conversation because no pre-turn snapshot exists: its mechanics
  // are already applied, the snapshot generateStoryTurn takes is the
  // POST-mechanics state, and a full-turn retry would apply a meter change or
  // a spent resource a second time. That path passes false, and a reset there
  // can only rewrite prose.
  allowMechanicalRetry?: boolean;
  // Set internally by generateStoryTurn (decision 221): when a judge may
  // rewrite the turn, the live text callbacks (onGMContent,
  // onLiveNarrationUpdate) stay silent so the player never sees prose that a
  // rewrite later replaces. Reasoning and tool results keep flowing.
  holdLiveText?: boolean;
  // Set internally by generateStoryTurn (decision 240), with holdLiveText: called
  // just before the turn pauses on the player (ask_question, ask_for_roll, a dice
  // throw, confirm_setup) with the prose written since the last release. It
  // judges it, rewrites it if a major flag lands, and returns the text to show;
  // the turn then releases that text and lets the pause appear. Never in
  // session zero, which has its own rules.
  beforePause?: (ctx: PauseReleaseContext) => Promise<PauseRelease>;
  // Set internally with beforePause: told what the turn did to its own saved
  // history when a pause rewrite replaced prose (the GM's replayed rounds).
  onPauseHistoryEdit?: (edit: PauseHistoryEdit) => void;
  // Set internally by generateStoryTurn from imageJobDeps and the image
  // settings (see imageJobs.ts ImageToolContext): the GM is offered
  // generate_image only when this is present and enabled.
  imageToolContext?: ImageToolContext;
}

/** What the pause hook hands back: the text to show, and the flag a rewrite fixed. */
export interface PauseRelease {
  text: string;
  rewrittenBy?: ObserverFlag;
}

/**
 * A pause rewrite applied to the turn's saved history. `fixed` is false when no
 * round carried visible prose to replace. The originals let "Undo revision"
 * put the first draft's rounds back: `history` by assistant-message ordinal
 * (the stored conversation drops the engine's user nudges), `thinking` by
 * position.
 */
export interface PauseHistoryEdit {
  fixed: boolean;
  history: { index: number; original: string }[];
  thinking: { index: number; original: string }[];
}

/** What generateStoryTurn's pause hook is given (decision 240). */
export interface PauseReleaseContext {
  /** The prose written since the last release, tidied for the screen. */
  prose: string;
  /** The turn's tool results so far (the verdicts the judges may read). */
  gmResults: GMToolResult[];
  /** Those results' context, joined. */
  gmStoryContext: string;
}

/**
 * The player-visible form of the GM's accumulated prose: the visible text,
 * leading and trailing dividers pruned, the AI-isms swapped when asked. The
 * story stage and the pause release (decision 240) share it, so text released
 * at a pause is a literal prefix of the finished turn's text.
 */
function polishGMProse(raw: string, deAiify: boolean): string {
  let text = extractVisibleText(raw);
  while (/^[\s\n]*([-*_]{3,})/.test(text)) {
    text = text.replace(/^[\s\n]*([-*_]{3,})[\s\n]*/, "");
  }
  text = text.trimStart();
  while (/\n?[-*_]{3,}[\s\n]*$/.test(text)) {
    text = text.replace(/\n?[-*_]{3,}[\s\n]*$/, "");
  }
  text = text.trimEnd();
  return deAiify ? deAiifyText(text) : text;
}

export interface GenerationCallbacks {
  // `narratedByGMStage` is true when the GM's own final round already wrote
  // the prose, so no separate narration call happens and the single
  // onStoryContent that follows carries the whole (already-streamed) turn at
  // once. A UI streaming the GM stage live has therefore already displayed
  // this text and must not append it a second time; when it's false the story
  // stage is about to stream fresh text that nothing has shown yet.
  onStoryStart?: (narratedByGMStage: boolean) => void;
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
  // Fired whenever the reasoning-tier router (re)resolves a tier for the GM
  // stage this turn - initial pick, each round's re-derived tier (picks up
  // mid-turn self-escalation), and any model-unavailable fallback to a
  // lower tier. Lets the UI show a live "T{n}" indicator while the turn is
  // still generating, matching what's later saved on the ScenePart.
  onReasoningTierResolved?: (resolved: ResolvedTier) => void;
  // NEW: Stream GM content as it generates (thinking text)
  onGMContent?: (content: string, fullContent: string) => void;
  // Live narration text for TTS/auto-narrate purposes: the player-visible
  // prose accumulated across every GM round so far this turn (same
  // accumulation gmFinalStoryContent uses below), recomputed on every GM
  // content delta. Unlike onGMContent (the raw current-round buffer, which
  // may still contain <thinking> tags and resets every round), this is the
  // one running "story so far" text - without it, the common inline-
  // narration path (GM's own final round writes the story - see
  // gmFinalStoryContent) only ever hands the story to the UI in one lump at
  // the very end via onStoryContent, so live/streaming TTS has nothing to
  // read until generation is already finished.
  onLiveNarrationUpdate?: (visibleTextSoFar: string) => void;
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
  // with the settled face values, one array per requested dice group (null =
  // player skipped/cancelled the throw, falls back to a fully digital roll of
  // the whole formula).
  onRequestDiceThrow?: (
    request: DiceThrowRequest
  ) => Promise<number[][] | null>;
  // The GM asked the player(s) one or more predefined-choice + free-text
  // questions. The UI shows a prompt and resolves with one answer per
  // question, or null if the whole batch was skipped/cancelled.
  onAskQuestion?: (
    request: AskQuestionRequest
  ) => Promise<AskQuestionAnswer | null>;
  // The GM called confirm_setup (session zero): the UI shows the setup card
  // and resolves with the player's decision (approved, changes, dismissed or
  // stopped).
  onRequestSetupConfirmation?: (
    request: SetupConfirmationRequest
  ) => Promise<SetupConfirmationAnswer>;
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
  // just-completed turn as a major violation and rewriteFlaggedNarration
  // (observer.ts) successfully rewrote just the narration text - dice
  // rolls/tool calls/state changes are untouched. rewrittenNarration is the
  // corrected text; the UI should update whatever it displayed/streamed for
  // this turn's narration to match it (and expect a following
  // onChoicesStart/onChoicesComplete pair as choices are re-derived from it)
  // rather than clearing tool call/state displays the way onObserverReset
  // below does.
  // `original` is the discarded first draft (prose, choices, and GM history
  // as they stood before the rewrite) - the UI stores it on the scene part so
  // the player can restore it, since a rewrite the observer thought was an
  // improvement isn't always one.
  onObserverRewrite?: (
    flags: ObserverFlag[],
    triggeringFlag: ObserverFlag,
    rewrittenNarration: string,
    original: ObserverRewriteOriginal,
  ) => void;
  // Layer 5 hardening (see observer.ts): fired only when a major violation's
  // targeted rewrite (onObserverRewrite above) itself failed, and
  // generateStoryTurn is falling back to discarding the whole turn and
  // forcing a completely fresh attempt. storyData has already been rolled
  // back to its pre-turn snapshot by the time this fires - the UI should
  // clear anything it displayed/streamed for the discarded attempt.
  onObserverReset?: (flags: ObserverFlag[], triggeringFlag: ObserverFlag) => void;
  // The GM asked for a picture of this turn (generate_image, subject "scene").
  // The turn's scene part does not exist yet, so the page adds the ref to the
  // part it is building; the picture settles in the background and the card
  // finds it by the ref's id. Cleared again by onObserverReset's page handler.
  onSceneImageRequested?: (ref: SceneImageRef) => void;
  // Fired when the observer ran in the BACKGROUND (see generateStoryTurn's
  // resetPossible gate) and found flags it could not fix, after the turn had
  // already completed and handed control back to the player. Advisory only.
  // partId names the turn's part: the page records the flags on THAT part of
  // the current story (backgroundPatch.ts), never on a captured whole-story
  // object, and never by array position.
  onBackgroundObserverFlags?: (flags: ObserverFlag[], partId: string) => void;
  // Where a held turn is (decision 221): "writing" while the GM and narrator
  // work, "checking" while the judges read the finished text, "revising" while
  // a rewrite is made. Fires only when the turn's text is being held back
  // (a judge may rewrite); the page shows it on the live work line.
  onTurnPhase?: (phase: "writing" | "checking" | "revising") => void;
  // There is deliberately no background counterpart to onObserverRewrite or
  // onObserverReset (decision 221): a rewrite happens before the player sees
  // the turn or not at all, and a full-turn reset re-rolls the dice, which
  // cannot happen behind a player who has already read the turn.
  // Fired once the fire-and-forget background wave (memory agent, director
  // assistant, story progress observer) finishes. The delta is what those
  // layers changed, to be folded into the CURRENT story by the page; a wave
  // that changed nothing does not fire it.
  onBackgroundLayersUpdate?: (delta: BackgroundLayersDelta) => void;
  onComplete?: (result: GenerationResult) => void;
  onError?: (error: Error) => void;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  /** Of promptTokens, how many the provider served from its prompt cache. */
  cachedTokens?: number;
  cacheWriteTokens?: number;
}

export interface GenerationMeta {
  model: string;
  modelName: string;
  provider: string;
  usage: TokenUsage;
  tokenCost: number;
  balance: number;
  /**
   * The provider's own cost figure for this call, in dollars, when it
   * reports one (DeepInfra does - see providerCall.ts). Preferred over
   * list-price arithmetic by the per-turn cost ledger (turnCost.ts).
   */
  estimatedCost?: number;
  /** Provider's stop reason - "length" means the response was cut off. */
  finishReason?: string;
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
  // The allowlisted narration context (campaign/narrationContext.ts) this
  // turn's narration was written from, or would have been: the player's line,
  // the public summaries of the tool results, the tone, lines, veils and style
  // notes, and the last turns' prose. Not persisted. A same-turn rewrite of the
  // prose (observer.ts's rewriteFlaggedNarration) continues THIS, never the GM's
  // conversation, which holds its reasoning, tool arguments and the notes it read.
  narrationContext?: ChatMessage[];
  /**
   * The reasoning behind this turn's narration, gathered from wherever the
   * model happened to put it: the story stage's native reasoning stream, the
   * reasoning attached to the GM's terminal assistant message (when that round
   * wrote the prose itself), and any inline <thinking> segments. Not persisted
   * - like narrationContext it exists for same-turn side calls. It is handed
   * to the Observer's judges only: it can quote the GM's secrets, so a rewrite
   * of the prose never gets it.
   */
  narrationThoughts?: string;
  /**
   * The narrator's own reasoning, set only when a separate narration call wrote
   * the prose. The narrator saw only the allowlisted context, so this is the
   * one reasoning a rewrite may be shown (it tells the rewrite what in the
   * draft was deliberate). Not persisted.
   */
  narrationOwnThoughts?: string;
  meta: {
    storyMeta?: GenerationMeta;
    toolsMeta?: GenerationMeta;
    choicesMeta?: GenerationMeta;
    gmMeta?: GenerationMeta;
    totalTokenCost: number;
    balance: number;
    /**
     * Ledger id for this turn's real API spend (turnCost.ts). Pass it to
     * getTurnCostReport() for the per-stage dollar breakdown - the report
     * keeps filling in for a few seconds after the turn returns, as the
     * background layers land.
     */
    costTurnId?: string;
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
  /**
   * The narration voice's effort (decision 53). Required, so a new caller of
   * the choices stage has to say what it runs at.
   */
  reasoningEffort: ReasoningEffort;
  openRouterKey?: string;
  deepseekKey?: string;
  googleKey?: string;
  mistralKey?: string;
  deepinfraKey?: string;
  zaiKey?: string;
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
        reasoningEffort: fetchOptions.reasoningEffort,
        maxTokens: 1500,
        temperature: 0.7,
        openRouterKey: fetchOptions.openRouterKey,
        deepseekKey: fetchOptions.deepseekKey,
        googleKey: fetchOptions.googleKey,
        mistralKey: fetchOptions.mistralKey,
        deepinfraKey: fetchOptions.deepinfraKey,
        zaiKey: fetchOptions.zaiKey,
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

function parseChoices(content: string): Choice[] {
  // A choice is its line. The old <use_skill: ...>-style tags are no longer
  // read, so a model that still writes one leaves it in the choice text.
  return content
    .split("\n")
    .map((l) => l.trim())
    // strip common bullet prefixes: -, *, •
    .map((l) => l.replace(/^[\-\*\u2022]\s+/, ""))
    .filter((l) => l.length > 0)
    .map((text) => ({ text }));
}

// ============================================================
// MAIN GENERATION FUNCTION
// ============================================================

// A whole-turn redo (fresh GM + story + choices calls, rerolling dice along
// the way) is much costlier - and less faithful - than a targeted narration
// rewrite, so the observer's automatic correction is capped much lower - one
// attempt, then fail open (accept the turn, keep the flag attached for
// display) rather than risk looping the player forever.
const MAX_OBSERVER_RESETS = 1;

/**
 * Executes a complete story turn, then runs the Layer-5 observer (see
 * observer.ts) against the result. By default the observer only FLAGS
 * (decision 187): the turn is returned as the GM wrote it, with the flag on
 * its part. For a player who allowed a prose judge to rewrite, a "major" flag
 * (the GM spoke/acted for the player, blew way past the reply-length ceiling,
 * or contradicted an engine ruling) is a complaint about the narration text
 * alone, so the correction is a targeted rewrite (observer.ts's
 * rewriteFlaggedNarration): the GM is shown the exact narration it wrote and
 * why it was flagged, and rewrites just the prose - dice rolls/tool
 * calls/state changes stay untouched since they were never in question. A
 * rewrite that fails or is rejected leaves the turn as it was, flag attached;
 * it never rolls storyData back or rerolls the dice. The one full-turn
 * retry that remains is tier_escalation_missed's heavier-tier one, off by
 * default and refused when allowMechanicalRetry is false.
 */
/**
 * The player's line for a turn: the one passed in, or, when the page passed
 * "" because the line is already in the story, the last player part (its ">"
 * prefix stripped).
 */
export function playerLineOf(
  storyData: Pick<StoryData, "scene">,
  userChoice: string,
): string {
  if (userChoice) return userChoice;
  const lastUserPart = [...(storyData.scene?.parts ?? [])]
    .reverse()
    .find((p) => p.user && p.content);
  return lastUserPart ? lastUserPart.content.replace(/^>\s*/, "") : "";
}

export async function generateStoryTurn(
  storyData: StoryData,
  userChoice: string,
  options: GenerationOptions,
  callbacks: GenerationCallbacks,
): Promise<GenerationResult> {
  // Opens this turn's cost ledger (turnCost.ts). Every AI call the turn
  // makes - GM rounds, narration, choices, and the Observer/Memory Keeper/
  // Director/Progress side calls - reports into it, so Debug Logs can answer
  // "what did that turn actually cost". Held in a local rather than read back
  // from the module because the background layer wave deliberately outlives
  // this turn and must keep billing to it after the next turn has opened.
  const costTurnId = beginTurnCost();

  // The player's line for this turn. The page sends a typed action or a
  // picked choice as "" (it is already the last part of the story), so the
  // side agents - the Observer, the Memory Keeper, the Director Assistant -
  // read it from the story the way the GM stage does. Before this they were
  // told "(none - opening scene)" on every such turn, and the Observer's
  // player-agency judge flagged any narration of the character as an
  // undeclared action (the author's playtest, 2026-10-24, decision 185).
  const playerLine = playerLineOf(storyData, userChoice);

  // Pictures (generate_image). The tool is offered only when the page gave us
  // the queue's dependencies, the story has an id to file pictures under, and
  // pictures are on with a key for some provider. Decided once per turn, so the
  // GM prompt stays byte-identical across the turn's rounds (prompt cache).
  const scenePartId = options.scenePartId ?? crypto.randomUUID();
  const imageSettings = getImageSettings();
  const imageJobDeps = options.imageJobDeps;
  const imageToolContext: ImageToolContext | undefined =
    imageJobDeps &&
    options.storyId &&
    isImageToolAvailable(imageJobDeps.keys, imageSettings)
      ? {
          enabled: true,
          maxPerScene: imageSettings.gmImagesPerScene,
          scenePartId,
          enqueue: (req) =>
            enqueueImageJob(
              {
                ...req,
                storyId: options.storyId!,
                requestedBy: "gm",
                costTurnId,
                signal: options.abortSignal,
                // The executor works on the turn's clone and sets the pending
                // id there itself; the live StoryData is not patched mid-turn.
                skipInitialAttach: true,
              },
              imageJobDeps,
            ),
          onSceneImage: (ref) => callbacks.onSceneImageRequested?.(ref),
        }
      : undefined;

  // Ids StoryData points to whose file is not here (cleared, or made on another
  // device) count as no picture for the "already has one" checks; a picture
  // still painting is not missing.
  if (imageToolContext && options.storyId) {
    try {
      const missing = await missingImageIds(
        options.storyId,
        collectImageIds(storyData),
      );
      for (const id of Array.from(missing)) {
        if (getImageJobState(id)?.status === "pending") missing.delete(id);
      }
      imageToolContext.missingImageIds = missing;
    } catch {
      // No store to ask (a test, a locked-down WebView): every id counts as present.
    }
  }

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

  // Rung 0 for the judges (judges/facts.ts): the facts the combined judge call
  // compares the prose against, and what the key-phrase check found in it. Taken
  // from the story as the turn found it (the snapshot) and as it stands now.
  const judgeInputsFor = (
    results: readonly GMToolResult[] | undefined,
    prose: string,
  ): { facts: Fact[]; phraseHits: string[] } => {
    try {
      const before = preTurnSnapshot ?? storyData;
      const facts = collectTurnFacts(before, storyData, results ?? []);
      const phraseHits = secretHits(
        { storyBefore: before, storyAfter: storyData, results: [], prose },
        facts,
      ).map((h) => h.evidence);
      return { facts, phraseHits };
    } catch (factsError) {
      logger.action("Judge facts could not be collected - judging without them", {
        error:
          factsError instanceof Error ? factsError.message : String(factsError),
      });
      return { facts: [], phraseHits: [] };
    }
  };

  // The deterministic checks (rung 1) run again on a rewrite before it replaces
  // anything: a line's keyword, a key phrase of an unrevealed secret, or a
  // departed person the first draft did not have acting fails it (rewritePlan.ts).
  const recheckFor =
    (original: string) =>
    (rewritten: string, confirmed: ConfirmedFinding[] = []): string | null => {
      try {
        const checked = recheckRewrite({
          rewritten,
          original,
          fixing: {
            line: confirmed.some((c) => c.judge === "lines_veils"),
            secret: confirmed.some((c) => c.judge === "secret_leak"),
          },
          storyBefore: preTurnSnapshot ?? storyData,
          storyAfter: storyData,
        });
        return checked.ok ? null : checked.reason;
      } catch (recheckError) {
        // Closed, not open: an unchecked rewrite is not released.
        logger.action("Rewrite re-check could not run - keeping the original", {
          error:
            recheckError instanceof Error ? recheckError.message : String(recheckError),
        });
        return "the re-check could not run";
      }
    };

  // Carry forward any flags that survived the PRIOR turn (minor flags never
  // trigger a reset, and a major flag can still survive if the reset budget
  // ran out) - otherwise a flagged mistake reaches the player via the
  // ScenePart.observerFlags toast but the GM itself never learns it did
  // anything wrong. Overridden below the moment a same-turn reset fires,
  // since that corrective note is about THIS turn and takes priority.
  const lastAssistantPart = [...storyData.scene.parts]
    .reverse()
    .find((p) => !p.user && p.role === "assistant");
  // A prior turn can carry BOTH kinds of note at once: surviving flags
  // (never corrected) and corrected flags (fixed via a same-turn rewrite,
  // but the GM was never told the fix was needed) are independent - a turn
  // can have one, the other, or both.
  let observerNote: string | undefined = [
    buildObserverWarningNote(lastAssistantPart?.observerFlags),
    buildObserverCorrectionNote(lastAssistantPart?.correctedObserverFlags),
  ]
    .filter((note): note is string => Boolean(note))
    .join("\n\n") || undefined;
  // Layer 3 periodic check-in (storyProgressObserver.ts): the prior turn's
  // note, if any, carries forward exactly once - it's about the last N
  // turns as of when it fired, not just the immediately preceding turn, so
  // there's no reset-and-replace lifecycle here the way observerNote has.
  // The pacing counters' note (judges/rung1.ts, decision 235) rides the same
  // block; it is absent on every story that has not tripped one.
  const storyProgressNote: string | undefined =
    [lastAssistantPart?.storyProgressNote, lastAssistantPart?.pacingNote]
      .filter((note): note is string => Boolean(note))
      .join("\n\n") || undefined;
  const repetitionNote: string | undefined = lastAssistantPart?.repetitionNote;
  const knowledgeNote: string | undefined = lastAssistantPart?.knowledgeNote;
  let resetAttempts = 0;
  // Explicit caller-supplied settings win; otherwise fall back to the user's
  // stored Architecture-tab config (DEFAULT_OBSERVER_SETTINGS, decision 220).
  // Read once per turn, before the loop, because the hold below depends on it.
  const requestedObserverSettings = options.observerSettings ?? getObserverSettings();
  // A rewrite needs a second judge of another family (judges/confirm.ts). When
  // none can run this turn, the rewriting judges are flag-only for it: nothing is
  // held for a rewrite that cannot happen, and they are judged in the
  // background wave. Resolved once, before the hold decision below.
  const confirmerKeys = pickProviderKeys(options);
  const confirmer = resolveConfirmModel({
    judgeModel: resolveSideCallModel(getObserverModelOverride(), confirmerKeys).model,
    keys: confirmerKeys,
    pick: getRewriteConfirmModel(),
    fallbackModel: REWRITE_CONFIRM_DEFAULT_MODEL_KEY,
  });
  const observerSettings = confirmer.ok
    ? requestedObserverSettings
    : flagOnlyRewritables(requestedObserverSettings);
  if (!confirmer.ok && canObserverTriggerReset(requestedObserverSettings)) {
    logger.action("No second judge can confirm a rewrite this turn - the judges only flag", {
      reason: confirmer.reason,
      pick: confirmer.model,
      family: confirmer.family,
    });
  }
  // Decision 221: when a judge may rewrite this turn, the player never sees,
  // hears or is sent text a rewrite could replace. The live callbacks stay
  // silent (holdLiveText) and the narration callbacks queue in `held` until the
  // judging is done; the text is then released once, rewritten or not. Not in
  // session zero, which has its own buffering (the setup gate), and not when
  // every judge can only flag, where text streams live as before.
  // A campaign line with keywords holds the text too (rung 2, judges/rung1.ts):
  // a re-ask may replace the prose, so a line's word must never stream first,
  // whatever the judges are set to.
  const holdTurnText =
    !storyData.sessionZeroActive &&
    (canObserverTriggerReset(observerSettings) ||
      storyHasLineKeywords(storyData));
  const held = holdTurnText ? createHeldTurnOutput(callbacks) : null;
  // Set only when a tier_escalation_missed flag forces a full-turn retry
  // (see below) - floors the retry's GM-stage starting tier so the forced
  // escalation isn't immediately undone by the normal turn-to-turn decay.
  let forcedStartingTier: number | undefined;

  while (true) {
    if (held) callbacks.onTurnPhase?.("writing");

    // Shared by the observer and the memory agent below - both are
    // best-effort side calls for the turn that just completed. The keys, the
    // cost-turn id and the abort signal are common to all of them; the model
    // is not: each side agent takes its own through resolveSideCallModel
    // (the player's pin from Settings > Architecture, else
    // SIDE_AGENT_DEFAULT_MODEL_KEY, decision 51, or the narration voice when
    // the player has no key for that default's provider), which overrides the
    // `model` here. This `model` is the narration model, which the choices
    // re-derivation after an Observer rewrite uses, and the rewrite itself
    // when the Observer is unpinned (decision 52). It has to be an
    // AI_MODELS key (or a custom model's UUID): GenerationMeta.model is the
    // provider's own id, which the proxy can't resolve and silently swaps for
    // DeepSeek V4 Flash.
    const sideCallApiOptions = {
      model: getEffectiveNarrationModelKey(),
      token: null,
      // Bill every side call to THIS turn even when it lands after the
      // player has already started the next one (see runBackgroundLayers).
      costTurnId,
      openRouterKey: options.openRouterKey,
      deepseekKey: options.deepseekKey,
      googleKey: options.googleKey,
      mistralKey: options.mistralKey,
      deepinfraKey: options.deepinfraKey,
      zaiKey: options.zaiKey,
      abortSignal: options.abortSignal,
    };

    const observerModelOverride = getObserverModelOverride();
    // The narration voice's effort (decision 53), read once beside its model
    // above. Deliberately NOT on sideCallApiOptions: that bag is spread under
    // every side agent, and a side agent that forgot to resolve its own effort
    // would then quietly inherit the narrator's. The choices re-run and the
    // Observer's rewrite take it by name below.
    const narrationEffort = getEffectiveNarrationEffort();
    const observerApiOptions = {
      ...sideCallApiOptions,
      ...resolveSideCallModel(observerModelOverride, sideCallApiOptions),
    };
    // The rewrite writes the prose the player reads, so an unpinned Observer
    // rewrites on the narration voice, not the side-agent default its judges
    // use (decision 52); a pinned Observer rewrites on its pin.
    const observerRewriteApiOptions = {
      ...sideCallApiOptions,
      ...resolveObserverRewriteModel(
        observerModelOverride,
        String(sideCallApiOptions.model),
        narrationEffort,
      ),
    };

    // Decision 240: what a pause released this turn, and what the judges made
    // of it. Per attempt, like the held text itself.
    const pause = {
      /** Everything released at pauses, joined: a literal prefix of the finished text. */
      text: "",
      ranJudges: false,
      flags: [] as ObserverFlag[],
      corrected: undefined as ObserverFlag | undefined,
      /** Every flag a pause rewrite fixed (the first is `corrected`). */
      correctedAll: [] as ObserverFlag[],
      swaps: [] as { rewritten: string; original: string }[],
      /** Stretches released with no judge run (nothing plausible there). */
      unjudged: [] as string[],
      /** Rounds of the saved history a pause rewrite edited, with their first drafts. */
      historyEdits: [] as PauseHistoryEdit[],
      /** A pause rewrite whose first draft could not be taken out of the saved history. */
      historyUnfixed: false,
    };
    // The first draft of any pause-rewritten stretch put back, for "Undo revision".
    const undoPauseRewrites = (text: string): string =>
      pause.swaps.reduce(
        (acc, swap) => acc.replace(swap.rewritten, () => swap.original),
        text,
      );
    // The first draft's rounds put back in a saved gmConversation / gmThinking.
    // By assistant ordinal, because the stored conversation drops the engine's
    // own user nudges and so shifts positions.
    const undoPauseHistory = <T extends { role: string; content: string }>(
      conversation: T[] | undefined,
    ): T[] | undefined => {
      if (!conversation || !pause.historyEdits.some((e) => e.history.length > 0)) {
        return conversation;
      }
      const originals = pause.historyEdits.flatMap((e) => e.history);
      let ordinal = -1;
      return conversation.map((msg) => {
        if (msg.role !== "assistant") return msg;
        ordinal++;
        const hit = originals.find((h) => h.index === ordinal);
        return hit ? { ...msg, content: hit.original } : msg;
      });
    };
    const undoPauseThinking = (
      thinking: string[] | undefined,
    ): string[] | undefined =>
      thinking && pause.historyEdits.some((e) => e.thinking.length > 0)
        ? thinking.map((t, i) => {
            const hit = pause.historyEdits
              .flatMap((e) => e.thinking)
              .find((h) => h.index === i);
            return hit ? hit.original : t;
          })
        : thinking;
    // The turn is about to pause on the player (ask_question, ask_for_roll, a
    // dice throw, confirm_setup). Judge the prose written so far with the
    // verdicts so far, rewrite it if a major flag lands, and hand back what the
    // player should read before the pause shows. Released text is final: the
    // end-of-turn pass only judges and rewrites what comes after it.
    const pauseHook = async (ctx: PauseReleaseContext): Promise<PauseRelease> => {
      const finish = (text: string, rewrittenBy?: ObserverFlag): PauseRelease => {
        // Trimmed here, as the release trims it, so pause.text is literally the
        // prefix of the finished text.
        const shown = text.trim();
        pause.text = [pause.text, shown].filter(Boolean).join("\n\n");
        callbacks.onTurnPhase?.("writing");
        return { text: shown, rewrittenBy };
      };
      const pauseToolNames = ctx.gmResults.map((r) => r.toolName);
      const pauseVerdicts = extractOutcomeVerdicts(ctx.gmResults);
      const pauseSuspended = observerSuspensionReason({
        sessionZeroActive:
          preTurnSnapshot?.sessionZeroActive ?? storyData.sessionZeroActive,
        toolNames: pauseToolNames,
        hasCharacterSheet: hasCharacterSheetNote(preTurnSnapshot ?? storyData),
      });
      if (pauseSuspended) return finish(ctx.prose);
      const pauseTier = storyData.reasoningTierState?.currentTier;
      const pauseJudgeInputs = judgeInputsFor(ctx.gmResults, ctx.prose);
      const pausePlausible = plausibleResetFlagTypes({
        narration: ctx.prose,
        replyLength: options.replyLength,
        rollResults: pauseVerdicts,
        toolNames: pauseToolNames,
        tierUsed: pauseTier,
        highStakes: isSceneGatedForRoll(storyData),
        playerChoice: playerLine,
        facts: pauseJudgeInputs.facts,
        settings: observerSettings,
      }).filter((type) => REWRITABLE_FLAG_TYPES.has(type));
      if (pausePlausible.length === 0) {
        // Released without a judge: the background wave reads it flag-only.
        if (ctx.prose.trim()) pause.unjudged.push(ctx.prose.trim());
        return finish(ctx.prose);
      }

      callbacks.onTurnPhase?.("checking");
      pause.ranJudges = true;
      const pauseCharacterContext = buildObserverCharacterContext(storyData);
      let pauseFlags: ObserverFlag[] = [];
      const pauseObserverParams: ObserverParams = {
        narration: ctx.prose,
        playerChoice: playerLine,
        replyLength: options.replyLength,
        toolNames: pauseToolNames,
        rollResults: pauseVerdicts,
        gmStoryContext: ctx.gmStoryContext,
        characterContext: pauseCharacterContext,
        facts: pauseJudgeInputs.facts,
        phraseHits: pauseJudgeInputs.phraseHits,
        // The prose judges alone: a stored config that lets the tier judge
        // reset must not run it at every pause and again at the end.
        settings: splitObserverSettings(
          observerSettings,
          true,
          REWRITABLE_FLAG_TYPES,
        ).blocking,
        apiOptions: observerApiOptions,
      };
      try {
        pauseFlags = await runObserver(pauseObserverParams);
      } catch (pauseError) {
        if (isAbortError(pauseError) || options.abortSignal?.aborted) {
          throw new Error("Generation cancelled by user");
        }
        logger.action("Observer check before a pause failed, treating as pass", {
          error:
            pauseError instanceof Error ? pauseError.message : String(pauseError),
        });
      }
      if (pauseFlags.length > 0) {
        logger.action("Observer: prose before a pause flagged", {
          flags: pauseFlags.map((f) => ({
            type: f.type,
            severity: f.severity,
            detail: f.detail,
            // Private: the Debug Logs only (never the turn's details).
            finding: f.finding,
          })),
        });
      }
      // The highest-priority major flag wins (judges/combined.ts FLAG_PRIORITY),
      // not whichever judge happened to be listed first.
      const pauseMajor = pickMajorFlag(pauseFlags, observerSettings, (type) =>
        REWRITABLE_FLAG_TYPES.has(type),
      );
      let released = ctx.prose;
      let rewrittenBy: ObserverFlag | undefined;
      if (pauseMajor && resetAttempts < MAX_OBSERVER_RESETS) {
        resetAttempts++;
        callbacks.onTurnPhase?.("revising");
        let rewritten: string | null = null;
        let pauseConfirmed: ConfirmedFinding[] = [];
        try {
          // Two judges of different families must agree, then one rewrite
          // fixes every confirmed finding (judges/correction.ts).
          const correction = await confirmAndRewrite({
            flags: pauseFlags,
            rewritable: REWRITABLE_FLAG_TYPES,
            judged: pauseObserverParams,
            judgeApi: observerApiOptions,
            rewriteApi: observerRewriteApiOptions,
            rewrite: {
              playerChoice: playerLine,
              narrationContext: buildNarrationContext(
                {
                  playerLine,
                  results: ctx.gmResults,
                  scenePartId,
                },
                storyData,
              ),
              replyLength: options.replyLength,
              storytellerMode: options.storytellerMode,
              characterContext: pauseCharacterContext,
              deAiifyWords: options.deAiifyWords,
              alreadyRead: pause.text,
              endsAtPause: true,
            },
            recheck: recheckFor(ctx.prose),
          });
          rewritten = correction.rewritten;
          pauseConfirmed = correction.confirmed;
          if (!rewritten && correction.skipped) {
            logger.action("Observer rewrite before a pause not attempted", {
              reason: correction.skipped,
            });
          }
        } catch (rewriteError) {
          if (isAbortError(rewriteError) || options.abortSignal?.aborted) {
            throw new Error("Generation cancelled by user");
          }
          logger.action(
            "Observer rewrite before a pause failed, releasing the prose with the flag",
            {
              error:
                rewriteError instanceof Error
                  ? rewriteError.message
                  : String(rewriteError),
            },
          );
        }
        if (rewritten && pauseConfirmed.length > 0) {
          const fixed = pauseConfirmed.map((c) => c.flag);
          logger.action("Observer rewrote the prose before a pause", {
            types: fixed.map((f) => f.type),
          });
          pause.swaps.push({ rewritten: rewritten.trim(), original: ctx.prose });
          pause.corrected ??= fixed[0];
          pause.correctedAll.push(...fixed);
          pauseFlags = pauseFlags.filter((f) => !fixed.includes(f));
          released = rewritten;
          rewrittenBy = fixed[0];
        }
      }
      pause.flags.push(...pauseFlags);
      return finish(released, rewrittenBy);
    };

    const result = await generateStoryTurnOnce(
      storyData,
      userChoice,
      {
        ...options,
        holdLiveText: holdTurnText,
        beforePause: held ? pauseHook : undefined,
        onPauseHistoryEdit: held
          ? (edit) => {
              pause.historyEdits.push(edit);
              if (!edit.fixed) pause.historyUnfixed = true;
            }
          : undefined,
        observerNote,
        storyProgressNote,
        repetitionNote,
        knowledgeNote,
        forcedStartingTier,
        scenePartId,
        imageToolContext,
        // A reset discards the previous attempt's tool calls/narration - if
        // it also came with a precomputedGMConversation (manual Retry flow),
        // replaying that would just replay the flagged content, so force a
        // fresh GM stage on every retry attempt past the first.
        precomputedGMConversation:
          resetAttempts === 0 ? options.precomputedGMConversation : undefined,
      },
      held ? held.callbacks : callbacks,
    );

    // Only a turn with actual narration is worth reviewing - an empty
    // result (e.g. a no-op tool-only round) has nothing for the observer to
    // judge. generateStoryTurnOnce throws rather than returning on failure,
    // so a successfully-returned result always has success: true here.
    if (!result.content.trim()) {
      result.meta.costTurnId = costTurnId;
      const emptyTurnReport = logTurnCost(costTurnId, "final");
      if (emptyTurnReport) recordTurnCostCalibration(emptyTurnReport);
      if (held) {
        held.release();
        held.flushChoices();
      }
      callbacks.onComplete?.(result);
      return result;
    }

    result.meta.costTurnId = costTurnId;

    // Choices are parsed from the narration, so a rewrite invalidates them -
    // they can offer an action the corrected prose no longer sets up. Shared
    // by the blocking rewrite path and the background one below. Best-effort
    // in both: a failed side call means slightly stale choices, which is a far
    // better outcome than losing the turn over it, so this returns null and
    // the caller keeps what it had.
    //
    // Two rules (Codex finding 7). It makes no call at all when the player has
    // Suggested Choices off (`skipChoices`): a rewrite used to run a choices
    // call and show suggestions the player had turned off. And `notifyUi` says
    // whether to fire the choices callbacks, which write to "whichever part is
    // last" and replace the page's choices: right while this turn is still the
    // one in flight, wrong from the background wave, which returns the choices
    // as data for the patch (backgroundPatch.ts) and lets the page decide.
    const regenerateChoicesFor = async (
      narration: string,
      notifyUi: boolean = true,
    ): Promise<Choice[] | null> => {
      if (options.skipChoices) return null;
      try {
        if (notifyUi) callbacks.onChoicesStart?.();
        const { content: rawChoicesContent, meta: rewrittenChoicesMeta } =
          await generateChoicesWithRetry(
            {
              storyData,
              storyContent: narration,
              usePrefill: options.usePrefill !== false,
            },
            {
              token: null,
              model: sideCallApiOptions.model,
              reasoningEffort: narrationEffort,
              openRouterKey: options.openRouterKey,
              deepseekKey: options.deepseekKey,
              googleKey: options.googleKey,
              mistralKey: options.mistralKey,
              deepinfraKey: options.deepinfraKey,
              zaiKey: options.zaiKey,
              abortSignal: options.abortSignal,
            },
          );
        if (rewrittenChoicesMeta) {
          recordAICall({
            stage: "choices",
            label: "Choices (re-derived after observer rewrite)",
            modelKey: String(sideCallApiOptions.model),
            promptTokens: rewrittenChoicesMeta.usage?.promptTokens || 0,
            completionTokens: rewrittenChoicesMeta.usage?.completionTokens || 0,
            providerReportedUsd: rewrittenChoicesMeta.estimatedCost,
            costTurnId,
          });
        }
        const cleanedChoicesContent =
          options.usePrefill !== false
            ? stripAffirmationPrefill(rawChoicesContent, CHOICES_AFFIRMATION)
            : rawChoicesContent;
        const rewrittenChoices = parseChoices(cleanedChoicesContent);
        if (notifyUi) {
          callbacks.onChoicesComplete?.(
            rewrittenChoices,
            rewrittenChoicesMeta?.usage || {
              promptTokens: 0,
              completionTokens: 0,
              totalTokens: 0,
            },
          );
        }
        return rewrittenChoices;
      } catch (choicesError) {
        // A Stop is not a choices failure: never commit past it.
        if (options.abortSignal?.aborted || isAbortError(choicesError)) {
          throw new Error("Generation cancelled by user");
        }
        logger.action(
          "Failed to regenerate choices after observer rewrite, keeping original choices",
          {
            error:
              choicesError instanceof Error
                ? choicesError.message
                : String(choicesError),
          },
        );
        return null;
      }
    };

    // The tier the GM stage actually ran at this turn - reasoningTierState is
    // mutated directly on storyData through generateStoryTurnOnce, so it
    // reflects the final round's tier here (see checkTierEscalation, which
    // judges the completed turn against this).
    const tierUsedThisTurn = storyData.reasoningTierState?.currentTier;

    // What the end-of-turn judges read: the whole text, or, when a pause
    // already released the first part (decision 240), only what came after it.
    // Released text is final, so a rewrite here replaces the tail alone.
    let judgedText = result.content;
    if (pause.text) {
      if (result.content.startsWith(pause.text)) {
        judgedText = result.content.slice(pause.text.length).trim();
      } else {
        logger.action(
          "Finished text does not begin with what a pause released - judging nothing more",
        );
        judgedText = "";
      }
    }
    const withReleased = (tail: string): string =>
      pause.text ? [pause.text, tail].join("\n\n") : tail;

    const turnToolNames = (result.gmResults || []).map((r) => r.toolName);
    // The engine's actual rulings this turn, typed (observer.ts
    // extractOutcomeVerdicts): the outcome judge never sees a plain sum or an
    // evaluation error labelled SUCCESS or FAILURE.
    const outcomeVerdicts = extractOutcomeVerdicts(result.gmResults || []);

    // Session zero is setup, not play, and the observer sits it out entirely
    // (see observerSuspensionReason). sessionZeroActive is read from the
    // PRE-TURN snapshot on purpose: start_game flips it false mid-turn, so
    // reading it live would leave the wrap-up turn - the single longest,
    // most setup-heavy turn of the campaign - as the only part of session
    // zero that still got judged. The tool-name check covers the same turn
    // when no snapshot could be taken.
    // Who the player character is, what their sheet says, which names are
    // NPCs, and what dice system this adventure actually runs on - built once
    // and shared by every judge and by the rewrite call (see observer.ts's
    // formatCharacterContextBlock and formatMechanicsBlock).
    const observerCharacterContext = buildObserverCharacterContext(storyData);

    const suspensionReason = observerSuspensionReason({
      sessionZeroActive:
        preTurnSnapshot?.sessionZeroActive ?? storyData.sessionZeroActive,
      toolNames: (result.gmResults || []).some(resultStartedGame)
        ? [...turnToolNames, "start_game"]
        : turnToolNames,
      // No character sheet yet = the GM is still in setup/character creation
      // (the same condition its own prompt uses), whatever creation path this
      // story came from. Read from the pre-turn snapshot for the same reason
      // sessionZeroActive is: the setup turn that WRITES the sheet would
      // otherwise be judged as if setup were already over.
      hasCharacterSheet: hasCharacterSheetNote(preTurnSnapshot ?? storyData),
    });
    if (suspensionReason) {
      logger.action("Observer suspended for this turn", {
        reason: suspensionReason,
      });
    }

    // Whether the player should WAIT on the observer for this particular
    // turn. Two gates, cheapest first:
    //
    // 1. canObserverTriggerReset - config only: is any flag type both
    //    enabled and allowed to reset? False means nothing the observer
    //    finds could ever change the text, whatever the turn contains.
    // 2. plausibleResetFlagTypes - the turn itself: of those types, which
    //    could actually fire HERE, judged from free deterministic signals
    //    (the word count, which comparisons resolved, which tools ran, what
    //    tier it used). This is the gate that matters in practice, because
    //    the first one is true by default and so was true on every turn -
    //    the player sat through a full round of judge calls after every
    //    single turn, including the great majority where the word count
    //    never tripped, no comparison could be contradicted, and every
    //    tool-usage question was already satisfied.
    //
    // When nothing is plausible the turn completes immediately and the whole
    // observer runs in the background wave below, which can still rewrite -
    // just after the player already has control (see runBackgroundLayers).
    // A suspended turn can't produce a flag at all, so it never blocks.
    // The facts and the key-phrase hits every judge pass of this turn shares.
    const judgeInputs = judgeInputsFor(result.gmResults, judgedText);
    const plausibleFlagTypes = suspensionReason
      ? []
      : plausibleResetFlagTypes({
          facts: judgeInputs.facts,
          narration: judgedText,
          playerChoice: playerLine,
          replyLength: options.replyLength,
          rollResults: outcomeVerdicts,
          toolNames: turnToolNames,
          tierUsed: tierUsedThisTurn,
          // The same predicate the M2 roll-invariant gate uses for "does this
          // scene actually have something at stake" - active combat, an active
          // challenge, or a high/deadly-stakes roll declared this scene. It is
          // what keeps the tier-escalation full-turn retry available on the
          // turns that warrant it without imposing it on every one.
          highStakes: isSceneGatedForRoll(storyData),
          settings: observerSettings,
        });

    const resetPossible =
      !suspensionReason &&
      canObserverTriggerReset(observerSettings) &&
      plausibleFlagTypes.length > 0;

    if (!resetPossible && !suspensionReason) {
      logger.action(
        "Observer deferred to the background - no reset-eligible check could fire on this turn",
        { checkedTypes: plausibleFlagTypes },
      );
    }

    // Each enabled judge runs once per turn: the rewriting ones before release
    // (here, or at a pause), the others in the background wave below.
    // A pause ran only the prose judges, so when the end-of-turn pass does not
    // run, the others (the tier judge) are still the background wave's.
    const observerSplit = splitObserverSettings(
      observerSettings,
      resetPossible || pause.ranJudges,
      resetPossible ? undefined : REWRITABLE_FLAG_TYPES,
    );
    const blockingPassRan = resetPossible || pause.ranJudges;
    let flags: ObserverFlag[] = [];
    // What the judges read this pass; the confirming judge reads the same.
    const endObserverParams: ObserverParams = {
      facts: judgeInputs.facts,
      phraseHits: judgeInputs.phraseHits,
      narration: judgedText,
      playerChoice: playerLine,
      replyLength: options.replyLength,
      toolNames: turnToolNames,
      rollResults: outcomeVerdicts,
      tierUsed: tierUsedThisTurn,
      gmStoryContext: result.gmStoryContext,
      characterContext: observerCharacterContext,
      // Lets the outcome-mismatch judge see the rules ruling behind the
      // prose (see ObserverParams.narrationThoughts) - a correctly-called
      // partial success is usually explained in the reasoning, not the
      // narration.
      narrationThoughts: result.narrationThoughts,
      // Only the judges that can rewrite wait here; the rest run once in
      // the background wave (observerSplit).
      settings: observerSplit.blocking,
      apiOptions: observerApiOptions,
    };
    if (resetPossible) {
      if (held) callbacks.onTurnPhase?.("checking");
      try {
        flags = await runObserver(endObserverParams);
      } catch (observerError) {
        // A Stop is not an infra failure (finding 8): never commit past it.
        if (isAbortError(observerError) || options.abortSignal?.aborted) {
          throw new Error("Generation cancelled by user");
        }
        // Fail open - an observer infra failure should never block the turn.
        logger.action("Observer check failed, treating as pass (fail open)", {
          error:
            observerError instanceof Error
              ? observerError.message
              : String(observerError),
        });
        flags = [];
      }

      // Log every check result, not just the failure/reset paths below - this
      // is the only record of a flag that never becomes a reset (minor
      // severity, or a type with triggersReset off), which otherwise only
      // ever reached the player as a toast and never showed up in Debug Logs.
      if (flags.length > 0) {
        logger.action("Observer: turn flagged", {
          flags: flags.map((f) => ({
            type: f.type,
            severity: f.severity,
            detail: f.detail,
            // Private: the Debug Logs only (never the turn's details).
            finding: f.finding,
          })),
        });
      }

      // A flag only resets when it's both "major" severity (decided per-
      // instance by the judge) AND that flag type's triggersReset is on
      // (decided by config). Several majors are acted on in the design's
      // priority order (judges/combined.ts FLAG_PRIORITY), not the order the
      // judges were listed. There is no speculative rewrite: the length judge
      // is part of the combined call, so every correction goes through here.
      const majorFlag = pickMajorFlag(flags, observerSettings);

      if (majorFlag && resetAttempts < MAX_OBSERVER_RESETS) {
        resetAttempts++;
        logger.action("Observer flagged turn - attempting a targeted rewrite", {
          type: majorFlag.type,
          detail: majorFlag.detail,
          attempt: resetAttempts,
        });
        if (held) callbacks.onTurnPhase?.("revising");

        // Reached only for a flag type the player allowed to correct the turn
        // (the defaults allow none, decision 187). A prose complaint gets a
        // rewrite (see observer.ts's rewriteFlaggedNarration): the GM is shown
        // the exact narration it wrote plus the specific reason it was
        // flagged, and asked to rewrite just the prose. The turn's dice
        // rolls/tool calls/state changes are ground truth and stay untouched.
        // If the rewrite fails or is rejected the turn is KEPT with its flag;
        // it is never rolled back and rerun because of prose.
        //
        // tier_escalation_missed is the one exception: it's a complaint that
        // the turn ran at too low a reasoning tier, not about the narration
        // text - rewriting the prose at the same (insufficient) tier wouldn't
        // add any brainpower, so it skips the rewrite and, where the path may
        // re-run the tools (allowMechanicalRetry), takes the full-turn reset
        // below, which also forces the retry onto a higher tier.
        let rewrittenNarration: string | null = null;
        // The findings two judges of different families agreed on: the flags
        // this rewrite fixes, and the facts it was handed.
        let confirmedFindings: ConfirmedFinding[] = [];
        if (REWRITABLE_FLAG_TYPES.has(majorFlag.type)) {
          try {
            const correction = await confirmAndRewrite({
              flags,
              rewritable: REWRITABLE_FLAG_TYPES,
              judged: endObserverParams,
              judgeApi: observerApiOptions,
              // The Observer's pin if the player set one, else the narration
              // voice (decision 52) - not sideCallApiOptions, or the rewrite
              // would silently skip that pin.
              rewriteApi: observerRewriteApiOptions,
              rewrite: {
                playerChoice: playerLine,
                replyLength: options.replyLength,
                storytellerMode: options.storytellerMode,
                characterContext: observerCharacterContext,
                // The same allowlisted context the narration was written from:
                // the player's line, the public roll summaries, the tone and
                // style notes, the recent prose. Not the GM's reasoning or notes.
                narrationContext: result.narrationContext,
                narrationThoughts: result.narrationOwnThoughts,
                deAiifyWords: options.deAiifyWords,
                alreadyRead: pause.text || undefined,
              },
              recheck: recheckFor(judgedText),
            });
            rewrittenNarration = correction.rewritten;
            confirmedFindings = correction.confirmed;
            if (!rewrittenNarration && correction.skipped) {
              logger.action("Observer rewrite not attempted", {
                reason: correction.skipped,
              });
            }
          } catch (rewriteError) {
            if (isAbortError(rewriteError) || options.abortSignal?.aborted) {
              throw new Error("Generation cancelled by user");
            }
            logger.action(
              "Observer rewrite call failed, keeping the turn with the flag",
              {
                error:
                  rewriteError instanceof Error
                    ? rewriteError.message
                    : String(rewriteError),
              },
            );
          }
        }

        // A Stop during the rewrite must not commit a rewrite or start a retry (finding 8).
        if (options.abortSignal?.aborted) {
          throw new Error("Generation cancelled by user");
        }

        // A tier_escalation_missed reset only helps when the retry runs on a
        // heavier call. When the ladder has none to offer (everything above
        // is the same model and effort, or the scene cap clamps the request
        // back to the same call), resetting would just reroll the turn on the
        // call it already made, so the turn is kept and the flag surfaced.
        const escalationRetryTier =
          majorFlag.type === "tier_escalation_missed" && preTurnSnapshot
            ? observerRetryTier(
                tierUsedThisTurn ?? SCENE_BASELINE_TIER,
                getTierState(preTurnSnapshot),
                getEffectiveTiers(),
              )
            : null;
        const escalationRerunsSameCall =
          majorFlag.type === "tier_escalation_missed" &&
          escalationRetryTier === null;

        if (rewrittenNarration && confirmedFindings.length > 0) {
          // Every flag the rewrite addressed; the first stands for them when
          // the GM's history is reconciled and the page is told.
          const fixedFlags = confirmedFindings.map((c) => c.flag);
          const primaryFlag = fixedFlags[0];
          logger.action(
            "Observer rewrite succeeded, keeping tool calls/rolls and replacing narration",
            { types: fixedFlags.map((f) => f.type) },
          );

          // Snapshot the draft the observer is about to replace, BEFORE any
          // of it is overwritten - the player can put it back with one click
          // (see ScenePart.observerRewriteOriginal and page.tsx's
          // handleRestoreObserverOriginal). The observer is a judge, not an
          // oracle: the turn it just shortened may have been the long
          // explanation the player actually wanted.
          const tailRewrite = rewrittenNarration;
          rewrittenNarration = withReleased(tailRewrite);
          const rewriteOriginal: ObserverRewriteOriginal = {
            content: undoPauseRewrites(result.content),
            // Its kind only: what Undo shows is never the finding's words.
            flag: kindOnlyFlag(primaryFlag),
            gmConversation: undoPauseHistory(result.scenePart.gmConversation),
            gmThinking: undoPauseThinking(result.scenePart.gmThinking),
            choices: result.choices,
          };

          result.content = rewrittenNarration;
          result.scenePart = {
            ...result.scenePart,
            content: rewrittenNarration,
            // Reconcile the GM's saved history so the next turn replays the
            // corrected narration + why, not the discarded draft (see
            // reconcileGmConversationAfterRewrite). gmConversation is the live
            // replay path; gmThinking is the legacy fallback, reconciled too
            // so the two never disagree.
            gmConversation: reconcileGmConversationAfterRewrite(
              result.scenePart.gmConversation,
              rewrittenNarration,
              primaryFlag,
            ),
            gmThinking: reconcileGmThinkingAfterRewrite(
              result.scenePart.gmThinking,
              rewrittenNarration,
              primaryFlag,
            ),
          };
          // The held text is released as the rewrite, before the page is told
          // about the revision, so the page's part exists when it is patched
          // (and the original draft was never shown). Decision 221.
          held?.release(rewrittenNarration, pause.text);
          callbacks.onObserverRewrite?.(
            flags,
            primaryFlag,
            rewrittenNarration,
            rewriteOriginal,
          );

          // Choices were parsed from the flagged narration - regenerate them
          // off the corrected text (see regenerateChoicesFor above). The
          // queued first-draft choices are dropped when that works, and shown
          // (stale, as before) when it does not.
          const rewrittenChoices = await regenerateChoicesFor(rewrittenNarration);
          if (held) {
            if (rewrittenChoices) held.dropChoices();
            else held.flushChoices();
          }
          if (rewrittenChoices) {
            result.choices = rewrittenChoices;
            result.scenePart = {
              ...result.scenePart,
              choices: rewrittenChoices,
            };
          }

          // Any OTHER flags from this turn (the one just fixed aside) still
          // get surfaced to the player, same as a turn that finishes with
          // surviving minor flags normally would.
          flags = flags.filter((f) => !fixedFlags.includes(f));

          // The fixed flag itself doesn't disappear - it's recorded
          // separately (see buildObserverCorrectionNote) so the NEXT turn's
          // prompt still tells the GM a correction was needed here, even
          // though this turn's own narration already reads clean.
          result.scenePart = {
            ...result.scenePart,
            // The reconcile above rewrote every round's prose, so the history
            // is fixed whatever the pause could do with its own rounds.
            correctedObserverFlags: [...pause.correctedAll, ...fixedFlags],
            observerRewriteOriginal: rewriteOriginal,
          };
        } else if (majorFlag.type !== "tier_escalation_missed") {
          // The prose rewrite failed or was rejected (observer.ts
          // validateRewriteResponse). The turn is kept as it was, with the
          // flag attached. It used to fall through to a full-turn reset here,
          // which re-ran the tools and rerolled the dice because the prose was
          // long or off - a provider outage changing a player's dice (finding
          // 8). A prose problem never reaches the mechanics.
          logger.action(
            "Observer rewrite unavailable, keeping the turn with the flag",
            { type: majorFlag.type, detail: majorFlag.detail },
          );
        } else if (pause.text) {
          logger.action(
            "Observer asked for a heavier tier, but part of the turn is already on screen - keeping the turn",
            { detail: majorFlag.detail },
          );
        } else if (escalationRerunsSameCall) {
          logger.action(
            "Observer asked for a heavier tier, but none is a different call - keeping the turn",
            {
              tierUsed: tierUsedThisTurn,
              detail: majorFlag.detail,
            },
          );
        } else if (executedRandomness(result.gmResults)) {
          // The full-turn retry rolls the tools again; the dice a turn threw
          // are never thrown twice (judge layer v2, plan finding 12).
          logger.action(
            "Observer asked for a heavier tier, but this turn's dice are already thrown - keeping the turn",
            { detail: majorFlag.detail },
          );
        } else if (options.allowMechanicalRetry === false) {
          // The reword path: its mechanics are already applied and the
          // snapshot below would be post-mechanics (see allowMechanicalRetry).
          logger.action(
            "Observer asked for a heavier tier, but this path cannot re-run the tools - keeping the turn",
            { detail: majorFlag.detail },
          );
        } else if (preTurnSnapshot) {
          // Full state rollback, restored in place (delete-all-keys +
          // Object.assign) so every closure over storyData (the caller, other
          // callbacks already fired this turn) keeps seeing the same object -
          // same idiom as page.tsx's handleUndo.
          for (const key of Object.keys(storyData)) {
            delete (storyData as unknown as Record<string, unknown>)[key];
          }
          Object.assign(storyData, preTurnSnapshot);

          if (majorFlag.type === "tier_escalation_missed") {
            // The nearest tier that is a different call, not tier + 1: with
            // Default filling tiers 0 and 1 alike, + 1 would rerun the same
            // model at the same effort (design §3). escalationRerunsSameCall
            // above already kept the turn when there is no such tier.
            const requestedTier = escalationRetryTier ?? TOP_TIER;
            const escalation = applyTierEscalation(
              storyData,
              requestedTier,
              majorFlag.detail,
            );
            forcedStartingTier = escalation.grantedTier;
            logger.action("Observer forced a reasoning-tier escalation for retry", {
              previousTier: tierUsedThisTurn,
              grantedTier: escalation.grantedTier,
              capped: escalation.capped,
            });
          }

          observerNote = majorFlag.correctivePrompt;
          // The discarded attempt's held text is never shown.
          held?.discard();
          // The discarded attempt's pictures are for narration nobody will
          // read: drop the queued ones and abort the one painting.
          cancelImageJobsForTurn(costTurnId, "gm");
          callbacks.onObserverReset?.(flags, majorFlag);
          continue;
        }
      }

    }

    // Flags from a pause's check and from the end-of-turn pass that survived.
    const survivingJudgeFlags = [...pause.flags, ...flags];
    if (survivingJudgeFlags.length > 0) {
      result.scenePart = {
        ...result.scenePart,
        observerFlags: survivingJudgeFlags,
      };
    }

    // The judging is done (or was never needed): release whatever is still
    // held, once. A rewrite already released its own text above; this is then
    // a no-op for the story and a flush for choices a failed regeneration left.
    if (held) {
      held.release(undefined, pause.text);
      held.flushChoices();
    }

    // A rewrite made at a pause, with no later rewrite of the tail: the page
    // has its part now, so tell it the turn was revised ("Undo revision").
    if (
      held &&
      pause.corrected &&
      !result.scenePart.observerRewriteOriginal
    ) {
      const pauseOriginal: ObserverRewriteOriginal = {
        content: undoPauseRewrites(result.content),
        flag: kindOnlyFlag(pause.corrected),
        gmConversation: undoPauseHistory(result.scenePart.gmConversation),
        gmThinking: undoPauseThinking(result.scenePart.gmThinking),
        choices: result.choices,
      };
      // The saved rounds already hold the rewrite (releaseBeforePause edited
      // them), so the next turn is truthfully told its history is fixed. When
      // no round had prose to edit, the correction is only an advisory flag.
      result.scenePart = {
        ...result.scenePart,
        ...(pause.historyUnfixed
          ? {
              observerFlags: [
                ...(result.scenePart.observerFlags ?? []),
                ...pause.correctedAll,
              ],
            }
          : { correctedObserverFlags: [...pause.correctedAll] }),
        observerRewriteOriginal: pauseOriginal,
      };
      callbacks.onObserverRewrite?.(
        survivingJudgeFlags,
        pause.corrected,
        result.content,
        pauseOriginal,
      );
    }

    // The public half of the findings (design 11.4): the turn's details say only
    // that it was revised after a check, or checked and something stayed flagged.
    if (result.scenePart.observerRewriteOriginal) {
      result.scenePart = { ...result.scenePart, publicNotice: "revised" };
    } else if ((result.scenePart.observerFlags?.length ?? 0) > 0) {
      result.scenePart = { ...result.scenePart, publicNotice: "checked" };
    }

    // Everything past this point is best-effort side-channel work that
    // never changes what the player is about to read: when resetPossible is
    // false, the observer itself can only log flags, never rewrite/reset
    // (see above), and the memory agent/director assistant/story progress
    // observer were never in the reset business to begin with - they just
    // write memory/thread/pacing data storyData carries forward. None of
    // that is worth blocking the player's next action on, so it all runs as
    // one fire-and-forget wave AFTER onComplete, instead of before it.
    // The wave names this turn's part by id, never by array position: an Undo
    // followed by a Retry can put a different assistant turn at the captured
    // index (judge-layer design 3.1). What it changed reaches the page as a
    // delta (backgroundPatch.ts) to fold into the CURRENT story; the agents
    // still write to this turn's own object, which is all a caller with no page
    // (the eval harness, the tests) reads.
    const backgroundPartId = result.scenePart.id ?? scenePartId;
    const memoryLengthBefore = storyData.memory?.length ?? 0;
    // The Director Assistant mutates its state in place, so compare by value.
    const directorAssistantBefore = snapshotValue(storyData.directorAssistant);
    const progressCounterBefore = storyData.turnsSinceStoryProgressCheck;
    let progressPartNotes: BackgroundLayersDelta["partNotes"];

    const runBackgroundLayers = async () => {
      if (!suspensionReason) {
        try {
          const backgroundInputs = judgeInputsFor(result.gmResults, result.content);
          const backgroundFlags = await runObserver({
            facts: backgroundInputs.facts,
            phraseHits: backgroundInputs.phraseHits,
            narration: result.content,
            playerChoice: playerLine,
            replyLength: options.replyLength,
            toolNames: turnToolNames,
            rollResults: outcomeVerdicts,
            tierUsed: tierUsedThisTurn,
            gmStoryContext: result.gmStoryContext,
            characterContext: observerCharacterContext,
            narrationThoughts: result.narrationThoughts,
            // The judges the blocking pass or a pause did not run (all of them
            // when nothing was plausible); flags only.
            settings: observerSplit.background,
            apiOptions: observerApiOptions,
          });
          if (backgroundFlags.length > 0) {
            logger.action(
              "Observer: turn flagged (background, non-blocking)",
              {
                flags: backgroundFlags.map((f) => ({
                  type: f.type,
                  severity: f.severity,
                  detail: f.detail,
                })),
              },
            );

            // The background wave never rewrites (decision 221): the player
            // already has the turn, and text they have read is not replaced
            // behind them. A flag found back here is advisory, on the turn's
            // details. A turn a judge could have rewritten waited for it
            // instead (see the hold in generateStoryTurn).
            const survivingFlags = backgroundFlags;
            const judgedPartId = result.scenePart.id ?? scenePartId;

            if (survivingFlags.length > 0 && !options.abortSignal?.aborted) {
              callbacks.onBackgroundObserverFlags?.(survivingFlags, judgedPartId);
            }
          }
        } catch (observerError) {
          // Fail open - same posture as the blocking path above.
          logger.action(
            "Background observer check failed, skipping (fail open)",
            {
              error:
                observerError instanceof Error
                  ? observerError.message
                  : String(observerError),
            },
          );
        }
      }

      // Text a blocking pass never read (decision 240): the whole length of a
      // paused turn, and any stretch released with no judge run. Flag-only, and
      // each judge still runs once per text it reads.
      if (!suspensionReason && pause.text && blockingPassRan) {
        const lengthCheck = settingsFor(observerSettings, "response_length");
        const extraRuns: { label: string; narration: string; keep: (t: ObserverFlagType) => boolean }[] = [];
        if (lengthCheck.enabled && lengthCheck.triggersReset) {
          extraRuns.push({
            label: "whole-turn length",
            narration: result.content,
            keep: (t) => t === "response_length",
          });
        }
        if (pause.unjudged.length > 0) {
          extraRuns.push({
            label: "stretch released unjudged",
            narration: pause.unjudged.join("\n\n"),
            keep: (t) =>
              REWRITABLE_FLAG_TYPES.has(t) && t !== "response_length",
          });
        }
        for (const run of extraRuns) {
          try {
            const extraInputs = judgeInputsFor(result.gmResults, run.narration);
            const extraFlags = await runObserver({
              facts: extraInputs.facts,
              phraseHits: extraInputs.phraseHits,
              narration: run.narration,
              playerChoice: playerLine,
              replyLength: options.replyLength,
              toolNames: turnToolNames,
              rollResults: outcomeVerdicts,
              tierUsed: tierUsedThisTurn,
              gmStoryContext: result.gmStoryContext,
              characterContext: observerCharacterContext,
              narrationThoughts: result.narrationThoughts,
              settings: restrictObserverSettings(observerSettings, run.keep),
              apiOptions: observerApiOptions,
            });
            if (extraFlags.length > 0) {
              logger.action(`Observer: ${run.label} flagged (background)`, {
                flags: extraFlags.map((f) => ({
                  type: f.type,
                  severity: f.severity,
                  detail: f.detail,
                })),
              });
              if (!options.abortSignal?.aborted) {
                callbacks.onBackgroundObserverFlags?.(
                  extraFlags,
                  result.scenePart.id ?? scenePartId,
                );
              }
            }
          } catch (extraError) {
            logger.action("Background observer check failed, skipping (fail open)", {
              pass: run.label,
              error:
                extraError instanceof Error
                  ? extraError.message
                  : String(extraError),
            });
          }
        }
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
            sideCallApiOptions,
          ),
        };
        await runMemoryAgent(
          storyData,
          result.content,
          playerLine,
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

      // Layer 3: the Director Assistant (directorAssistant.ts) updates the
      // thread/NPC spotlight ledger selectDirectorMove reads, gated to only
      // run on scene increments - the same cadence AGMTState.tension/
      // chaosFactor already update at, rather than every single turn.
      // Best-effort, same fail-open posture as the observer/memory agent above.
      if ((result.gmResults || []).some((r) => r.toolName === "increment_scene")) {
        try {
          const directorAssistantApiOptions = {
            ...sideCallApiOptions,
            ...resolveSideCallModel(
              getDirectorAssistantModelOverride(),
              sideCallApiOptions,
            ),
          };
          await runDirectorAssistant(
            storyData,
            result.content,
            playerLine,
            directorAssistantApiOptions,
          );
        } catch (directorAssistantError) {
          logger.action("Director assistant failed, skipping (fail open)", {
            error:
              directorAssistantError instanceof Error
                ? directorAssistantError.message
                : String(directorAssistantError),
          });
        }
      }

      // Layer 3: the Story Progress Observer (storyProgressObserver.ts)
      // advances its own turn-count cadence and, once every N accepted turns
      // (getStoryProgressCheckInterval, default 10), reads back a holistic
      // "how's the story's pacing/momentum going" note for the GM. Unlike
      // pacingFeedback.ts's per-turn word-count trend or the Director
      // Assistant's per-scene spotlight ledger, this fires on a plain turn
      // cadence and judges narrative momentum, not turn length or spotlight
      // fairness. Best-effort, same fail-open posture as the other side calls
      // above - an infra failure just means no note this cycle. Attached
      // directly to storyData.scene.parts (rather than the now-abandoned
      // result.scenePart) so the next turn's lastAssistantPart lookup in
      // generateStoryTurn actually finds it.
      try {
        const storyProgressApiOptions = {
          ...sideCallApiOptions,
          ...resolveSideCallModel(
            getStoryProgressObserverModelOverride(),
            sideCallApiOptions,
          ),
        };
        const progressResult = await runStoryProgressObserver(
          storyData,
          result.content,
          storyProgressApiOptions,
          getStoryProgressCheckInterval(),
        );
        if (
          progressResult.note ||
          progressResult.repetitionNote ||
          progressResult.knowledgeNote
        ) {
          progressPartNotes = {
            ...(progressResult.note && {
              storyProgressNote: progressResult.note,
            }),
            ...(progressResult.repetitionNote && {
              repetitionNote: progressResult.repetitionNote,
            }),
            ...(progressResult.knowledgeNote && {
              knowledgeNote: progressResult.knowledgeNote,
            }),
          };
          const partIndex = findPartIndexById(storyData, backgroundPartId);
          const part = storyData.scene.parts[partIndex];
          if (part && !part.user && part.role === "assistant") {
            storyData.scene.parts[partIndex] = { ...part, ...progressPartNotes };
          }
        }
        // Log the check-in itself (not just infra failures below) - this note
        // is GM-facing only and never shown to the player, so Debug Logs is
        // otherwise the only place to see it fired at all.
        if (progressResult.ran) {
          logger.action("Story progress observer: checked in", {
            status: progressResult.status,
            note: progressResult.note,
            repeatedPhrases: progressResult.repeatedPhrases,
            repetitionNote: progressResult.repetitionNote,
            knowledgeNote: progressResult.knowledgeNote,
          });
        }
      } catch (storyProgressError) {
        logger.action("Story progress observer failed, skipping (fail open)", {
          error:
            storyProgressError instanceof Error
              ? storyProgressError.message
              : String(storyProgressError),
        });
      }

      // What the wave changed, for the page to fold into the current story.
      const layersDelta: BackgroundLayersDelta = {
        partId: backgroundPartId,
        newMemory: (storyData.memory ?? []).slice(memoryLengthBefore),
        ...(valueChanged(directorAssistantBefore, storyData.directorAssistant) && {
          directorAssistant: storyData.directorAssistant,
        }),
        ...(storyData.turnsSinceStoryProgressCheck !== progressCounterBefore && {
          turnsSinceStoryProgressCheck: storyData.turnsSinceStoryProgressCheck,
        }),
        ...(progressPartNotes && { partNotes: progressPartNotes }),
      };
      if (!isEmptyLayersDelta(layersDelta)) {
        callbacks.onBackgroundLayersUpdate?.(layersDelta);
      }

      // Final word on what this turn cost, now that the background layers
      // have actually billed. The "Turn cost" entry logged below fires while
      // this wave is still in flight and therefore always understates it -
      // this one is the number to trust, and it's what feeds the estimator's
      // calibration (turnCost.ts) so future predictions converge on this
      // adventure's real cost rather than staying on generic defaults.
      const finalReport = logTurnCost(costTurnId, "final");
      if (finalReport) recordTurnCostCalibration(finalReport);
    };

    void runBackgroundLayers();

    // Logged before the background wave lands on purpose: this is the cost
    // of everything the player actually waited on.
    logTurnCost(costTurnId, "turn");

    callbacks.onComplete?.(result);
    return result;
  }
}

/**
 * Whether a model answers a forced tool call (`tool_choice: "required"`) with
 * a 400, by the key the round ran on (an AI_MODELS key or a custom model's
 * UUID). The setup gate then relies on its message alone.
 */
function gmModelRejectsForcedToolChoice(modelKey: string): boolean {
  try {
    const custom = getCustomModelIfUUID(modelKey);
    if (custom) {
      return modelRejectsForcedToolChoice({
        provider: "openrouter",
        model: custom.modelId,
      });
    }
    return modelRejectsForcedToolChoice(getModelConfig(modelKey));
  } catch {
    return false;
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
  // The allowlisted narration context (campaign/narrationContext.ts): the
  // player's line, the public summaries of the turn's tool results, the tone,
  // lines, veils and style notes, and the last turns' prose. The separate
  // narration call is built from it, and so is every rewrite of the turn's
  // prose (GenerationResult.narrationContext). It never holds the GM's
  // reasoning, tool arguments or the notes it read. Built once, when the GM
  // stage is done.
  let narrationContext: ChatMessage[] | undefined;
  // True once the separate narration call wrote the prose (its own reasoning
  // is then safe to pass to a rewrite; the GM's never is).
  let narrationWrittenSeparately = false;

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
    // The story as this attempt found it, for the judge layer's rung-1 checks.
    const storyBeforeJudgeView = snapshotJudgeView(storyData);
    // The name check's state at the end of the GM's rounds, for the prose flag.
    let lastNameTurn: NameTurnState | undefined;
    let lastTurnStartLore: StoryLore[] | undefined;
    let gmStoryContext = "";
    let gmFinalStoryContent = ""; // NEW: GM's final prose content (when no tool calls)
    // Decision 240: the prose a pause released (polished, verbatim) and the raw
    // text of the rounds written after it; both empty when no pause released.
    let pauseReleasedText = "";
    let postPauseRawParts: string[] = [];
    let gmMeta: GenerationMeta | undefined;
    const gmThinking: string[] = []; // Capture GM's private <thinking> reasoning text
    let gmBaseMessages: ChatMessage[] = []; // Base GM prompt for story continuation
    let gmConversationHistory: ChatMessage[] = []; // Full GM conversation history for continuation
    let gmModel = ""; // Track which model was used for GM stage
    // Resolved once per turn so a mid-turn override change doesn't cause the
    // narration voice to shift inconsistently within a single generation.
    const narrationModel = getEffectiveNarrationModelKey();
    // ...and its effort (decision 53), for the story continuation and the
    // choices call below.
    const narrationEffort = getEffectiveNarrationEffort();

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
    // the GM stage, and the narration context carries it to the narrator.
    let gmUserChoice = playerLineOf(storyData, userChoice);

    // True once the reasoning-tier router actually resolves a tier this
    // turn (the precomputed-GM-conversation/retry branch below never runs
    // it) - gates whether the final ScenePart gets stamped with
    // reasoningTier/reasoningTierModelKey/reasoningTierEffort.
    let reasoningTierRanThisTurn = false;

    // Use a precomputed GM conversation if provided (retry flow: reuse the
    // popped turn's saved gmConversation instead of re-running the GM
    // stage's tool-calling loop). Stage 1 below then writes the narration from
    // the narration context, exactly as on a fresh turn.
    if (options.precomputedGMConversation) {
      gmConversationHistory = options.precomputedGMConversation;
      // Carry the reused attempt's actual tool results through to this
      // attempt's result.gmResults - see precomputedGMResults's doc comment.
      // Skipping this left every reword-only retry looking, to the observer
      // and the Director Assistant, exactly like a turn that called no
      // tools at all.
      gmResults = options.precomputedGMResults || [];
      logger.action("Using precomputed GM conversation (retry flow)", {
        historyEntries: gmConversationHistory.length,
      });

      // Defensive guard for session zero: the narration call below would
      // skip the setup gate. A precomputed conversation that never started
      // the game is not narrated; the turn keeps its own text (the last
      // assistant message that made no tool call), else the engine line.
      // (The page runs a session-zero retry through the full GM loop, so
      // this is only reached by a caller that forgot to.)
      if (
        storyData.sessionZeroActive === true &&
        !gmResults.some(resultStartedGame)
      ) {
        // The latest round's text, whether or not that round called tools:
        // an earlier round's line is stale by now (a setup turn shows only
        // its latest words).
        const lastText = [...gmConversationHistory]
          .reverse()
          .find((m) => m.role === "assistant");
        const saved = lastText ? extractVisibleText(lastText.content).trim() : "";
        const progressNow = getSetupProgress(storyData, options.setupPlayers);
        gmFinalStoryContent =
          saved || setupEngineLine(progressNow.next, progressNow.creation);
        logger.action("Session-zero retry: skipping the narration call", {
          usedSavedText: !!saved,
        });
      }
    } else {
      // GM Stage is always enabled - legacy tool calling has been removed
      // The enableGMStage option is now ignored and GM stage always runs
      callbacks.onGMStageStart?.();
      logger.action("Stage 0.5: Running GM stage for mechanics determination");

      if (!gmUserChoice) {
        // No prior user choice to adjudicate (e.g. very first turn) - skip
        // the tool-calling loop; the narrator writes from the narration
        // context (an opening scene has no player line).
        logger.action("GM stage skipped - no user choice found");
        gmStoryContext = "";
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
          options.forcedStartingTier ?? 0,
        );

        if (isClassificationAmbiguous(storyData, gmUserChoice)) {
          try {
            // A one-word answer runs on the side-agent model at its effort
            // (decision 53), like every other small call, whatever the player
            // picked for Default: Default is now a thinking model (GLM 5.3),
            // and paying for that on one word is waste. A player with no key
            // for that model (a desktop player running both slots on the
            // Claude subscription, say) keeps what this call always did and
            // runs it on Default (design §3).
            const classifierKeys = pickProviderKeys(options);
            const sideChoice = resolveSideCallModel(null, classifierKeys);
            const classifierTier = hasKeyForModel(
              sideChoice.model,
              classifierKeys,
            )
              ? {
                  modelKey: sideChoice.model,
                  reasoningEffort: sideChoice.reasoningEffort,
                }
              : getEffectiveSlot("default");
            const classifierModel = classifierTier.modelKey;
            const classifierResult = await generateSimple(
              [{ role: "user", content: buildClassifierPrompt(gmUserChoice) }],
              {
                model: classifierModel,
                reasoningEffort: classifierTier.reasoningEffort,
                maxTokens: 10,
                temperature: 0,
                openRouterKey: options.openRouterKey,
                deepseekKey: options.deepseekKey,
                googleKey: options.googleKey,
                mistralKey: options.mistralKey,
                deepinfraKey: options.deepinfraKey,
                zaiKey: options.zaiKey,
                customModel: getCustomModelIfUUID(classifierModel),
                abortSignal: options.abortSignal,
              },
            );
            recordAICall({
              stage: "classifier",
              label: "Tier classification",
              modelKey: String(classifierModel),
              promptTokens: classifierResult.meta?.usage?.promptTokens || 0,
              completionTokens:
                classifierResult.meta?.usage?.completionTokens || 0,
              providerReportedUsd: classifierResult.meta?.estimatedCost,
            });
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
        reasoningTierRanThisTurn = true;
        callbacks.onReasoningTierResolved?.(initialResolvedTier);

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
            options.customMaxOutput,
          );
          const compactionResult = await ensureStoryCompacted(
            storyData,
            gmHistoryBudget,
            {
              // The side-agent default, like every other unpinned side call
              // (decision 51) - through resolveSideCallModel, which can never
              // hand compaction a subscription model (decision 12), and which
              // runs it on the narration voice when the player has no key
              // for the default's provider (so compaction still runs for a
              // player with, say, only a Mistral key).
              ...resolveSideCallModel(null, pickProviderKeys(options)),
              token,
              // All six, not just the ones this model "usually" needs:
              // leaving a provider out here is how compaction silently never
              // ran, back when the default model was a Mistral one (status
              // report §6.13).
              ...pickProviderKeys(options),
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
          // History runs from the summary's end (a fixed start). If it is still
          // over budget - a summary was due and failed - this turn's prompt
          // falls back to the sliding window (getHistoryParts), so say so in
          // the Debug Logs; the summary is retried next turn.
          if (getHistoryParts(storyData, gmHistoryBudget).slidingFallback) {
            logger.action("History over budget with no summary; using the sliding window this turn", {
              slidingFallback: true,
              summarizedThroughIndex: storyData.scene.summarizedThroughIndex || 0,
            });
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
              pickProviderKeys(options),
            ),
            token,
            ...pickProviderKeys(options),
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

        // Phase 4 grounding gate (structs.ts StoryData.notesReadThisTurn,
        // toolExecutor.ts create_note, docs/gm-plan-notes-design.md): reset at
        // the start of every turn so a read_notes/search_notes call from a
        // previous turn doesn't stale-satisfy this turn's gate.
        storyData.notesReadThisTurn = false;

        // GM stage loop - continues until no more tool calls (AI writes final story)
        const MAX_GM_ROUNDS = options.maxToolLoops || 10; // User-configurable safety limit
        let gmRound = 0;
        let allGMContextParts: string[] = [];
        // NEW: Accumulate visible prose from ALL rounds (not just the final one)
        // This allows GM to narrate while calling tools, building up the story incrementally
        let gmAccumulatedStory: string[] = [];
        // The prose a pause already released (decision 240), as the first entry
        // of gmAccumulatedStory; empty until a pause releases something.
        let pauseReleasedEntry = "";
        // The raw text of those released rounds (inline <thinking> kept), and
        // where the saved history and the thinking list stood at the last
        // release, so a pause rewrite edits only the rounds it covered.
        let pauseRawPrefix = "";
        let pauseHistoryMark = 0;
        let pauseThinkingMark = 0;
        // Local conversation history (will be copied to outer scope at end)
        let conversationHistory: ChatMessage[] = [];
        let isComplete = false;
        let rollGatePromptedRound = -1; // the round after which the M2 prompt was sent
        let noToolCallPrompts = 0; // Track how many times we've prompted for tool calls
        const MAX_NO_TOOL_PROMPTS = 2; // Max times to prompt before giving up
        // Phase 2 campaign-plan gate (mirror of the M2 roll gate below): its
        // own counter + cap so it fails open independently of the M2 gate.
        let noPlanAdvancePrompts = 0;
        const MAX_PLAN_ADVANCE_PROMPTS = 2;
        // Set by the M2 roll-invariant gate (search "M2 roll-invariant gate"
        // below) when it forces a retry round - makes that one round require
        // a tool call outright rather than relying on prose alone to ask for
        // one. Consumed (read then cleared) at the top of the next round.
        let forceToolChoiceNextRound: "required" | "auto" | undefined;
        // The output cap's one raise per turn (roundCutOffEmpty, decision 196).
        let gmOutputCapRetryUsed = false;
        let gmOutputCapMultiplier = 1;
        // A system's turn-end checks (decision 183, turnEndChecks.ts): the ids
        // already sent back this turn. One reminder per check per turn.
        const turnEndChecksPrompted = new Set<string>();
        // The "judge" checks already read this turn: one reading per check
        // per turn (judge plan ceiling); the phrase table decides after it.
        const turnEndJudgeAsked = new Set<string>();

        // Rung 2 of the judge layer (judges/rung1.ts, design 11.1): one re-ask
        // of the GM per turn, sent when a verified rung-1 hit can be fixed with
        // the GM's own tools. `storyBeforeJudgeView` is the story as the turn
        // found it, taken before any tool ran.
        let reaskUsed = false;
        let reask: {
          armedRound: number;
          replacesProse: boolean;
          resolved: boolean;
          /** Lengths of the text stores before the draft round wrote to them. */
          before: { thinking: number; accumulated: number; context: number };
          /** Lengths with the draft in them (a tools-only re-ask keeps the draft). */
          after: { thinking: number; accumulated: number; context: number };
          /** The draft's own text, set aside while a prose re-ask is answered. */
          stash: { thinking: string[]; accumulated: string[]; context: string[] };
          /** The assistant messages that carried the draft (a prose re-ask). */
          draftHistory: number[];
          /** Where the re-ask message sits in the conversation. */
          askIndex: number;
        } | null = null;
        // The re-ask round's outcome, settled on the first prose-only round
        // after it (or at the loop's end). A prose re-ask (a line) replaces the
        // draft when it answered with words and gives it back when it did not;
        // a tools-only re-ask (a damage contract) keeps the draft and drops the
        // acknowledgement the GM wrote around its tool calls.
        const resolveReask = (visibleIn: string, rawAnswer = "") => {
          const r = reask;
          if (!r || r.resolved) return;
          r.resolved = true;
          // Only the prose-only round that answered counts as the new passage;
          // an introduction or refusal ("Here is the revised passage:") is no
          // answer, and the draft comes back.
          const visibleNow =
            visibleIn && !REWRITE_META_OPENERS.test(visibleIn) ? visibleIn : "";
          if (visibleIn && !visibleNow) {
            logger.action("Rung 2 re-ask: the reply was an introduction or refusal - keeping the draft", {
              reply: visibleIn.slice(0, 120),
            });
            // The answering message itself leaves the conversation too.
            const last = conversationHistory[conversationHistory.length - 1];
            if (last?.role === "assistant" && !last.tool_calls?.length) {
              conversationHistory.pop();
            }
          }
          if (r.replacesProse) {
            if (visibleNow) {
              // The new words replace the draft span. A draft message that
              // carried tool calls keeps them and its reasoning but loses its
              // prose; one that was prose only has nothing left to say and
              // leaves the conversation (an empty assistant message is
              // rejected by some providers). The re-ask rounds' own
              // preambles around their calls go the same way, so the new
              // passage is the only prose.
              const drop = new Set<number>();
              const strip = (i: number) => {
                const m = conversationHistory[i];
                if (m?.role !== "assistant") return;
                if (extractVisibleText(m.content || "") === "") return;
                if (!m.tool_calls?.length) {
                  drop.add(i);
                  return;
                }
                const reasoning = extractGmReasoning(m.content);
                m.content = reasoning
                  ? `<thinking>\n${reasoning}\n</thinking>`
                  : "";
              };
              for (const i of r.draftHistory) strip(i);
              if (r.askIndex >= 0) {
                for (let i = r.askIndex + 1; i < conversationHistory.length - 1; i++) {
                  strip(i);
                }
              }
              [...drop].sort((a, b) => b - a).forEach((i) => {
                conversationHistory.splice(i, 1);
              });
              // The turn's text is the answering round alone.
              gmThinking.length = Math.min(gmThinking.length, r.before.thinking);
              gmAccumulatedStory.length = Math.min(
                gmAccumulatedStory.length,
                r.before.accumulated,
              );
              allGMContextParts.length = Math.min(
                allGMContextParts.length,
                r.before.context,
              );
              if (rawAnswer.trim()) {
                gmThinking.push(rawAnswer);
                gmAccumulatedStory.push(rawAnswer.trim());
                allGMContextParts.push(rawAnswer);
              }
            } else {
              // No words came back: the draft stands, and so does nothing the
              // re-ask rounds wrote around their calls.
              gmThinking.length = Math.min(gmThinking.length, r.before.thinking);
              gmAccumulatedStory.length = Math.min(
                gmAccumulatedStory.length,
                r.before.accumulated,
              );
              allGMContextParts.length = Math.min(
                allGMContextParts.length,
                r.before.context,
              );
              gmThinking.push(...r.stash.thinking);
              gmAccumulatedStory.push(...r.stash.accumulated);
              allGMContextParts.push(...r.stash.context);
            }
          } else {
            gmThinking.length = Math.min(gmThinking.length, r.after.thinking);
            gmAccumulatedStory.length = Math.min(gmAccumulatedStory.length, r.after.accumulated);
            allGMContextParts.length = Math.min(allGMContextParts.length, r.after.context);
          }
          logger.action("Rung 2 re-ask settled", {
            replacesProse: r.replacesProse,
            answeredWithProse: visibleNow.length > 0,
          });
        };

        // ---- Session zero's setup gate (docs/session-zero-plan.md, slice 4) ----
        // Read ONCE, from the story as the turn found it. start_game flips
        // storyData.sessionZeroActive mid-turn, and the roll and plan gates
        // must stay off for the whole turn including the round that starts
        // the game, so every check below uses this, not the live flag.
        const sessionZeroTurn = storyData.sessionZeroActive === true;
        // Set from this turn's tool RESULTS, never from what the model says.
        let setupProgressThisTurn = false;
        let setupApprovedThisTurn = false;
        let startGameSucceededThisTurn = false;
        // This turn's confirm_setup ended dismissed or sent back: the player
        // has the floor, so an empty reply is not forced open again.
        let setupCardHandedBack = false;
        let setupHandedBackEnd = false;
        let setupPrompts = 0; // its own counter, like the M2 and plan gates
        // True once the gate's prompts ran out (or the round limit hit with no
        // progress): the turn ends on the engine line, with no narration.
        let setupGateExhausted = false;
        // Until start_game succeeds, a session-zero turn's prose is held back
        // from every live callback (the feed, the guest broadcast, read-aloud):
        // the gate may still reject it, and streamed text cannot be taken
        // back. After start_game the intro is the story and streams as usual.
        const setupTextHeld = () =>
          sessionZeroTurn && !startGameSucceededThisTurn;
        // Decision 221: the live text callbacks are also silent when the turn
        // is held for the judges (options.holdLiveText). This gates ONLY the
        // callbacks; the "latest words only" clearing of session zero keys on
        // setupTextHeld alone and must not apply to a held turn.
        const liveTextHeld = () =>
          options.holdLiveText === true || setupTextHeld();
        // Decision 240: when the loop is about to pause on the player, the
        // prose written so far is checked and shown first. beforePause judges
        // the part not yet released (and may rewrite it); what it returns is
        // shown through the live callbacks, exactly as the unheld flow shows a
        // round's prose, and replaces those entries in the accumulation, so
        // the finished turn's text begins with what the player already read.
        const releaseBeforePause = async (): Promise<void> => {
          if (
            !options.beforePause ||
            options.holdLiveText !== true ||
            sessionZeroTurn
          ) {
            return;
          }
          const alreadyReleased = pauseReleasedEntry ? 1 : 0;
          const fresh = gmAccumulatedStory.slice(alreadyReleased);
          const segment = polishGMProse(
            fresh.join("\n\n"),
            options.deAiifyWords !== false,
          );
          if (!segment) return;
          const release = await options.beforePause({
            prose: segment,
            gmResults: [...gmResults],
            gmStoryContext: allGMContextParts.join("\n\n"),
          });
          const shown = release.text.trim();
          if (options.abortSignal?.aborted) {
            throw new Error("Generation cancelled by user");
          }
          // A rewrite replaces the prose of the rounds it covered in the GM's
          // own history, so this turn's later rounds, the saved conversation
          // and Reword all agree with the screen. Only the visible text of an
          // assistant message changes: its <thinking>, tool calls and signed
          // reasoning_details are kept byte for byte (providerCall replays
          // reasoning_details as its own field, and Claude's signature covers
          // the thinking block, not the text next to it).
          if (release.rewrittenBy && shown) {
            const edit: PauseHistoryEdit = {
              fixed: false,
              history: [],
              thinking: [],
            };
            const assistantAt: number[] = [];
            let assistantOrdinal = -1;
            const ordinals: number[] = [];
            conversationHistory.forEach((m, i) => {
              if (m.role !== "assistant") return;
              assistantOrdinal++;
              if (i >= pauseHistoryMark) {
                assistantAt.push(i);
                ordinals.push(assistantOrdinal);
              }
            });
            const before = assistantAt.map((i) => conversationHistory[i].content || "");
            const after = replaceVisibleProse(before, shown, release.rewrittenBy);
            if (after !== before) {
              assistantAt.forEach((at, k) => {
                if (after[k] !== before[k]) {
                  edit.history.push({ index: ordinals[k], original: before[k] });
                  conversationHistory[at].content = after[k];
                }
              });
              edit.fixed = true;
            }
            const thinkingBefore = gmThinking.slice(pauseThinkingMark);
            const thinkingAfter = replaceVisibleProse(
              thinkingBefore,
              shown,
              release.rewrittenBy,
            );
            if (thinkingAfter !== thinkingBefore) {
              thinkingAfter.forEach((t, k) => {
                if (t !== thinkingBefore[k]) {
                  edit.thinking.push({
                    index: pauseThinkingMark + k,
                    original: thinkingBefore[k],
                  });
                  gmThinking[pauseThinkingMark + k] = t;
                }
              });
              edit.fixed = true;
            }
            options.onPauseHistoryEdit?.(edit);
          }
          pauseHistoryMark = conversationHistory.length;
          pauseThinkingMark = gmThinking.length;
          // The raw round text (inline <thinking> included) for rawStoryContent
          // and the narration thoughts; the polished prose is what is shown.
          pauseRawPrefix = [pauseRawPrefix, ...fresh].filter(Boolean).join("\n\n");
          const whole = [pauseReleasedEntry, shown]
            .filter(Boolean)
            .join("\n\n");
          pauseReleasedEntry = whole;
          gmAccumulatedStory.splice(0, gmAccumulatedStory.length, whole);
          callbacks.onGMContent?.(shown, shown);
          callbacks.onLiveNarrationUpdate?.(whole);
        };
        // The four things a turn can pause on, each preceded by the release.
        const beforePausing = <A extends unknown[], R>(
          fn: ((...args: A) => Promise<R>) | undefined,
        ): ((...args: A) => Promise<R>) | undefined =>
          fn && options.beforePause && !sessionZeroTurn
            ? async (...args: A) => {
                await releaseBeforePause();
                return fn(...args);
              }
            : fn;
        // The turn ends on the engine line: nothing the GM wrote this turn is
        // narrated, shown as thinking, or left on a replayed assistant message.
        const discardHeldSetupProse = () => {
          gmAccumulatedStory.length = 0;
          gmThinking.length = 0;
          for (const entry of conversationHistory) {
            if (entry.role === "assistant") entry.content = "";
          }
        };
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

        // The turn's clock event ledger (campaign clocks tick once per
        // trigger per turn, across rounds). Kept here, handed to every batch
        // and replaced by the one it returns.
        let turnLedger = newTurnLedger();
        // What the name check knows this turn (names/accept.ts): the player's
        // line, then the notes the GM makes and the answers it is given.
        let nameTurn = newNameTurn([gmUserChoice]);
        // The lore as the turn began. The batches replace the story's arrays and
        // never edit these, so the reference stays what it was: notes made or
        // edited this turn prove nothing to the name check.
        const turnStartLore = storyData.lore ?? [];
        lastTurnStartLore = turnStartLore;

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
          callbacks.onReasoningTierResolved?.(roundTier);

          if (needsGMPromptRebuild) {
            // GM Stage receives customMaxContext (Memory Size slider) for context allocation
            const gmPrompt = buildGMStagePrompt({
              storyData,
              userChoice: gmUserChoice,
              customMaxContext: currentGMBudget,
              customMaxOutput: options.customMaxOutput,
              modelName: gmModel,
              replyLength: options.replyLength,
              pacingNote,
              observerNote: options.observerNote,
              storyProgressNote: options.storyProgressNote,
              repetitionNote: options.repetitionNote,
              knowledgeNote: options.knowledgeNote,
              imageToolAvailable: !!options.imageToolContext?.enabled,
              imagesPerScene: options.imageToolContext?.maxPerScene,
              // Skip the literal <thinking> prefill for reasoning-tier models
              // (they emit CoT natively); keep it for effort:"none" models.
              usesNativeReasoning: gmReasoningEffort !== "none",
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

          // Claude's third cache breakpoint: the latest message of this
          // round's request, which the next round extends. On a copy - the
          // stored gmBaseMessages never carry it, and a round with no history
          // yet already has the turn mark on its last message.
          markRoundBreakpoint(messagesWithHistory, conversationHistory.length > 0);

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
              maxTokens: getGMStageOutputTokens(
                options.customMaxOutput,
                model,
                gmOutputCapMultiplier,
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
              zaiKey: options.zaiKey,
              customModel: getCustomModelIfUUID(model),
              ...storyCacheKey(options.storyId, "gm"),
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
            // The nearest lower tier on a different model: the same model at
            // a lower effort (tier 2 to tier 1 on the shipped ladder) would
            // only fail the same way.
            const lower = nextDistinctTier(
              failedTier,
              "down",
              getEffectiveTiers(),
              "model",
            );
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
              callbacks.onReasoningTierResolved?.(fallbackResolved);
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
              if (!liveTextHeld()) {
                // Stream GM content to callback for real-time display
                callbacks.onGMContent?.(event.content, gmContent);
                // Same accumulation gmFinalStoryContent uses below, computed
                // live so TTS can start speaking narration as it's written
                // instead of waiting for the whole GM stage to finish.
                callbacks.onLiveNarrationUpdate?.(
                  extractVisibleText(
                    [...gmAccumulatedStory, gmContent].join("\n\n"),
                  ),
                );
              }
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

          // Build gmResult object from streamed data. The content is stripped
          // of any tool-call markup the inference backend leaked into it (see
          // toolCallFallback.ts): the call itself is recovered into
          // `toolCalls` server-side, and leaving the raw markup here would
          // write it into the scene and back into conversation history.
          const gmCleanedContent = stripLeakedToolCallMarkup(gmContent);
          if (gmCleanedContent !== gmContent) {
            // Worth a line in the log: it means the provider handed back its
            // own tool-call template as text, and tells us which model/round
            // did it next time this resurfaces.
            logger.action("Stripped leaked tool-call markup from GM content", {
              round: gmRound,
              model: gmModel,
              removedChars: gmContent.length - gmCleanedContent.length,
              recoveredToolCalls: gmToolCalls.length,
            });
          }

          const gmResult = {
            content: gmCleanedContent,
            reasoning: gmReasoning,
            reasoning_details: gmReasoningDetails,
            toolCalls: gmToolCalls,
            meta: gmResultMeta,
          };

          logger.action(`GM stage round ${gmRound} raw response`, gmResult);

          // Length diagnostic: distinguish "the model chose to write long"
          // (finishReason "stop"/"end_turn" - a verbosity/prompt problem) from
          // "the provider cut the response off at max_tokens" (finishReason
          // "length" - a truncation problem, a different fix entirely). Also
          // reports the player-visible prose word count for this round so the
          // per-round accumulation across a multi-round turn is visible in the
          // logs. `truncatedAtCap` is the signal to watch.
          {
            const finishReason = gmResult.meta?.finishReason ?? "unknown";
            const maxTokensCap = getGMStageOutputTokens(
              options.customMaxOutput,
              gmModel,
              gmOutputCapMultiplier,
            );
            logger.action(`GM stage round ${gmRound} finish diagnostic`, {
              finishReason,
              truncatedAtCap: finishReason === "length",
              hadToolCalls: (gmResult.toolCalls?.length ?? 0) > 0,
              proseWordsThisRound: countNarrationWords(
                extractVisibleText(gmContent),
              ),
              completionTokens: gmResult.meta?.usage?.completionTokens,
              maxTokensCap,
            });
          }

          if (gmResult.meta) {
            recordAICall({
              stage: "gm",
              // gmModel/gmReasoningEffort rather than roundTier, so a round
              // that failed over to a lower tier is billed to the model that
              // actually answered it.
              label: `GM round ${gmRound} (effort ${gmReasoningEffort})`,
              modelKey: String(gmModel),
              promptTokens: gmResult.meta.usage?.promptTokens || 0,
              completionTokens: gmResult.meta.usage?.completionTokens || 0,
              cachedTokens: gmResult.meta.usage?.cachedTokens,
              cacheWriteTokens: gmResult.meta.usage?.cacheWriteTokens,
              providerReportedUsd: gmResult.meta.estimatedCost,
            });

            // Accumulate meta across rounds
            if (!gmMeta) {
              gmMeta = gmResult.meta;
            } else {
              gmMeta.usage.promptTokens +=
                gmResult.meta.usage?.promptTokens || 0;
              gmMeta.usage.completionTokens +=
                gmResult.meta.usage?.completionTokens || 0;
              gmMeta.usage.totalTokens += gmResult.meta.usage?.totalTokens || 0;
              gmMeta.usage.cachedTokens =
                (gmMeta.usage.cachedTokens || 0) +
                (gmResult.meta.usage?.cachedTokens || 0);
              gmMeta.usage.cacheWriteTokens =
                (gmMeta.usage.cacheWriteTokens || 0) +
                (gmResult.meta.usage?.cacheWriteTokens || 0);
              gmMeta.tokenCost += gmResult.meta.tokenCost || 0;
            }
            totalTokenCost += gmResult.meta.tokenCost || 0;
            finalBalance = gmResult.meta.balance;
          }

          // Cut off at the output cap with nothing usable (decision 196):
          // ask the same round again, once per turn, at double the cap, which
          // then holds for the rest of the turn. Billed above like any round;
          // it does not count against the round limit or the setup gate.
          if (
            !gmOutputCapRetryUsed &&
            roundCutOffEmpty(
              gmResult.meta?.finishReason,
              extractVisibleText(gmCleanedContent),
              gmToolCalls,
            )
          ) {
            gmOutputCapRetryUsed = true;
            // Compared as sent: a thinking model's 4,096 floor can swallow
            // the raise at a small Response Length.
            const cap = sentMaxTokens(
              gmModel,
              getGMStageOutputTokens(options.customMaxOutput, gmModel),
              gmReasoningEffort,
            );
            const raised = sentMaxTokens(
              gmModel,
              getGMStageOutputTokens(options.customMaxOutput, gmModel, 2),
              gmReasoningEffort,
            );
            if (raised > cap) {
              gmOutputCapMultiplier = 2;
              gmRound--;
              forceToolChoiceNextRound = toolChoiceThisRound;
              logger.action(
                "GM stage round cut off at the output cap with nothing usable - asking again at a higher cap",
                { round: gmRound + 1, model: gmModel, cap, raised },
              );
              continue gmRoundLoop;
            }
            logger.action(
              "GM stage round cut off at the output cap with nothing usable - already at the model's limit, not retried",
              { round: gmRound, model: gmModel, cap },
            );
          }

          // Before the game starts a setup turn shows only the GM's latest
          // words: an earlier round's line ("Step one: ...") is stale once a
          // later round exists, even when that round says nothing. Earlier
          // rounds' prose stays in conversationHistory, the GM's own context.
          if (setupTextHeld()) {
            gmThinking.length = 0;
            gmAccumulatedStory.length = 0;
          }

          // Where each of the turn's text stores stood before this round
          // wrote to them, so the setup gate can take a rejected round's
          // text back out of every one (rejectRoundText below).
          const roundMarks = {
            thinking: gmThinking.length,
            accumulated: gmAccumulatedStory.length,
            context: allGMContextParts.length,
            history: conversationHistory.length,
          };

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
            // A prose re-ask is answered with a passage that may repeat what the
            // draft said, on purpose: nothing the draft left behind may swallow it.
            const answeringReask = reask !== null && !reask.resolved && reask.replacesProse;
            const isDuplicate = !answeringReask && gmThinking.some((prev) => {
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
                const isAlreadyAccumulated = !answeringReask && gmAccumulatedStory.some(
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

            // The sheet and plan as they stand before this batch, to tell
            // whether a create_note / edit_note really changed either.
            const setupHashesBefore = sessionZeroTurn
              ? currentSetupHashes(storyData)
              : null;

            // While a re-ask is being answered no dice tool runs: the dice are
            // thrown, and a second roll for the same action would be a reroll.
            // A refused call still gets a tool message, so the transcript stays
            // well formed.
            const reaskBlocking = reask !== null && !reask.resolved;
            const callsToRun: typeof gmResult.toolCalls = reaskBlocking
              ? gmResult.toolCalls.filter(
                  (tc: { function: { name: string; arguments?: unknown } }) =>
                    reaskRefusal(tc) === null,
                )
              : gmResult.toolCalls;
            const rawExecution = await executeGMTools(
              callsToRun,
              storyData,
              {
                enabled: options.enableEmbeddings,
                storyId: options.storyId,
                token,
              },
              {
                requestManualRoll: beforePausing(callbacks.onAskForRoll),
                requestDiceThrow: beforePausing(callbacks.onRequestDiceThrow),
                requestPlayerAnswer: beforePausing(callbacks.onAskQuestion),
                requestSetupConfirmation: beforePausing(
                  callbacks.onRequestSetupConfirmation,
                ),
              },
              {
                imageJobs: options.imageToolContext,
                abortSignal: options.abortSignal,
                setupPlayers: options.setupPlayers,
                turnLedger,
                nameTurn,
                turnStartLore,
              },
            );
            const gmExecution =
              callsToRun.length === gmResult.toolCalls.length ||
              rawExecution.aborted
                ? rawExecution
                : mergeRefusedDiceCalls(
                    gmResult.toolCalls,
                    callsToRun,
                    rawExecution,
                  );
            if (gmExecution.turnLedger) turnLedger = gmExecution.turnLedger;
            if (gmExecution.nameTurn) {
              nameTurn = gmExecution.nameTurn;
              lastNameTurn = nameTurn;
            }

            // Stopped during the batch (the signal fired, or Stop on the
            // setup card): the executor committed nothing, and neither do we.
            // Throw the same error the round-start check does, so the turn
            // unwinds through the existing cancellation path.
            if (gmExecution.aborted) {
              throw new Error("Generation cancelled by user");
            }

            // Accumulate results across rounds
            // A call a re-ask refused is no result the player or the saved
            // log should see; its error text reaches the provider below.
            gmResults.push(
              ...gmExecution.results.filter((r) => !isReaskRefused(r)),
            );
            if (gmExecution.storyContext) {
              allGMContextParts.push(gmExecution.storyContext);
            }

            // Notify callback for each tool result (for real-time interleaved display)
            for (const result of gmExecution.results) {
              if (isReaskRefused(result)) continue;
              callbacks.onGMToolResult?.(result);
            }

            // Update storyData with any modifications from GM tools
            Object.assign(storyData, gmExecution.modifiedStoryData);

            // Session zero's progress, judged from the results the engine
            // produced: an answered question, a sheet or plan note that was
            // written or edited and now reads differently, an approved card,
            // a game that started.
            if (sessionZeroTurn && setupHashesBefore) {
              const startedBeforeBatch = startGameSucceededThisTurn;
              for (const r of gmExecution.results) {
                // A card the player answered (changes, closed) is progress
                // too, or closing it would re-open it; only a refusal and a
                // stop are not. Only an approval counts as approved.
                if (r.toolName === "confirm_setup") {
                  const outcome = (r.result as { outcome?: string } | undefined)
                    ?.outcome;
                  if (outcome && outcome !== "refused" && outcome !== "stopped") {
                    setupProgressThisTurn = true;
                  }
                  if (r.success && outcome === "approved") {
                    setupApprovedThisTurn = true;
                  }
                  if (outcome === "dismissed" || outcome === "changes") {
                    setupCardHandedBack = true;
                  }
                  // Approval starts the game in the same call; the executor
                  // says so with `started`, as a successful start_game does.
                  if (resultStartedGame(r)) {
                    setupProgressThisTurn = true;
                    startGameSucceededThisTurn = true;
                  }
                  continue;
                }
                if (!r.success) continue;
                if (r.toolName === "ask_question") setupProgressThisTurn = true;
                if (resultStartedGame(r)) {
                  setupProgressThisTurn = true;
                  startGameSucceededThisTurn = true;
                }
              }
              // The game started: the setup turn's text so far (this round's
              // too) is pre-start and is dropped. From here the intro
              // accumulates and streams like any turn.
              if (startGameSucceededThisTurn && !startedBeforeBatch) {
                gmThinking.length = 0;
                gmAccumulatedStory.length = 0;
              }
              const noteWritten = gmExecution.results.some(
                (r) =>
                  r.success &&
                  (r.toolName === "create_note" ||
                    r.toolName === "edit_note" ||
                    r.toolName === "campaign"),
              );
              if (noteWritten) {
                const after = currentSetupHashes(storyData);
                if (
                  after.sheetHash !== setupHashesBefore.sheetHash ||
                  after.planHash !== setupHashesBefore.planHash ||
                  after.campaignHash !== setupHashesBefore.campaignHash
                ) {
                  setupProgressThisTurn = true;
                }
              }
            }

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
                  toolContent = `[${result.toolName}] ${result.contextForStory}${
                    result.gmOnlyContext ? `\n${result.gmOnlyContext}` : ""
                  }`;
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
                  // "The game has already started" is not a parameter problem.
                  toolContent = /already started/i.test(errorMsg)
                    ? `**ERROR** in ${result.toolName}: ${errorMsg}`
                    : `**ERROR** in ${result.toolName}: ${errorMsg}\n\nYou called with: ${paramsUsed}\n\nPlease check the tool's required parameters and try again with correct arguments.`;
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
            });

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

            // The M2 gate asked on `auto` and this round, the one right after
            // the prompt, called no tool at all: the GM declined. That ends
            // the gate for the turn, and the round's words (a second telling
            // of the moment) are taken back out so the story is the gated
            // round's prose once. A prompted round that called other tools
            // is not a decline, so the second prompt stays available to it.
            const rollGateDeclined = rollGatePromptedRound === gmRound - 1;
            if (rollGateDeclined) {
              rollGatePromptedRound = -1;
              noToolCallPrompts = MAX_NO_TOOL_PROMPTS;
              gmThinking.length = roundMarks.thinking;
              gmAccumulatedStory.length = roundMarks.accumulated;
              allGMContextParts.length = roundMarks.context;
              conversationHistory.length = roundMarks.history;
              logger.action(
                "M2 gate: the GM declined the roll - ending the gate for this turn",
                { round: gmRound },
              );
            }

            if (isRepetitive) {
              logger.action(
                "GM stage detected repetitive content - forcing end",
              );
              allGMContextParts.push(
                `[GAME MASTER: AI got stuck in repetition loop.]`,
              );
            } else if (content.trim() && !rollGateDeclined) {
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

            // A re-ask armed in an earlier round is answered by this prose-only
            // round: settle it before any gate looks at the stores.
            if (reask && !reask.resolved) {
              resolveReask(extractVisibleText(content).trim(), content);
            }

            // Session zero's setup gate (docs/session-zero-design.md 3.6).
            // A session-zero turn may not end on prose unless it moved setup
            // forward (an answered question, a sheet or plan written, the
            // card approved) or started the game. There is no fail-open: when
            // the prompts run out the turn ends on the engine line, with no
            // narration. The M2 and plan gates below are off in session zero,
            // so this is the only gate that acts on such a turn.
            if (sessionZeroTurn && !startGameSucceededThisTurn) {
              const setupNow = getSetupProgress(storyData, options.setupPlayers);
              // Approved this turn and only start_game is left: the approval
              // result told the model to call it, and prose now would strand
              // the player on a finished setup.
              const approvedButNotStarted =
                setupApprovedThisTurn && setupNow.next === "start_game";
              // A reply with nothing to show is not an end while setup is
              // unfinished, whatever progress the turn made earlier.
              const roundVisibleText = extractVisibleText(content).trim();
              const roundIsEmpty = !roundVisibleText;

              // The player closed or sent back the card and the GM then said
              // nothing: the turn ends on the engine's own question, and the
              // card is not forced open again.
              if (setupCardHandedBack && roundIsEmpty) {
                setupHandedBackEnd = true;
                logger.action(
                  "Setup gate: the card was closed or sent back and the GM said nothing - ending the turn on the engine line",
                  { round: gmRound },
                );
                isComplete = true;
                break;
              }

              if (
                !setupProgressThisTurn ||
                approvedButNotStarted ||
                roundIsEmpty
              ) {
                // Take this round's text back out of every store it reached,
                // so the player, the guests, read-aloud and later context
                // never see a round the engine rejected.
                gmThinking.length = roundMarks.thinking;
                gmAccumulatedStory.length = roundMarks.accumulated;
                allGMContextParts.length = roundMarks.context;
                conversationHistory.length = roundMarks.history;

                if (setupPrompts < MAX_SETUP_PROMPTS) {
                  setupPrompts++;
                  logger.action(
                    "Setup gate: session-zero turn ended on prose with no setup progress - forcing another round",
                    {
                      setupPrompts,
                      next: setupNow.next,
                      approvedButNotStarted,
                      roundIsEmpty,
                      round: gmRound,
                    },
                  );
                  conversationHistory.push({
                    role: "user",
                    content: setupGateMessage(
                      setupNow.next,
                      setupNow.creation,
                      {
                        cause: classifySetupRejection({
                          visibleText: roundVisibleText,
                          toolNames: [],
                          next: setupNow.next,
                        }),
                        rejected: roundVisibleText,
                        multiPlayer:
                          setupParticipants(storyData, options.setupPlayers)
                            .length > 1,
                      },
                    ),
                  });
                  // The gates' usual forcing, unless the next round's model
                  // answers a forced tool call with a 400 (then the message
                  // above does the forcing).
                  if (!gmModelRejectsForcedToolChoice(gmModel)) {
                    forceToolChoiceNextRound = "required";
                  }
                  continue gmRoundLoop;
                }

                setupGateExhausted = true;
                logger.action(
                  "Setup gate: prompts exhausted - ending the turn on the engine line, no narration",
                  { setupPrompts, next: setupNow.next },
                );
                discardHeldSetupProse();
                isComplete = true;
                break;
              }
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
              gmResults.map((r) => rollAwareToolName(r))
            );

            if (
              !sessionZeroTurn &&
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
                content: rollGateMessage(
                  gmBaseTools
                    .map(
                      (t) =>
                        (t as { function?: { name?: string } }).function?.name,
                    )
                    .filter((n): n is string => typeof n === "string"),
                ),
              });
              // "auto", not "required": the message lets the GM decline when
              // nothing in the declared action is uncertain.
              forceToolChoiceNextRound = "auto";
              rollGatePromptedRound = gmRound;
              continue gmRoundLoop;
            }

            // Campaign-plan re-planning gate (Phase 2, docs/gm-plan-notes-design.md,
            // campaignPlan.ts): mirror of the M2 gate for the campaign plan.
            // When the GM marked the current beat complete (advance_plan
            // complete_current) but hasn't yet detailed and moved to the next
            // beat, don't let the turn end on prose - force a round that
            // writes the next beat, keeping the plan exactly one beat ahead.
            // Same fail-open cap posture as M2.
            if (
              !sessionZeroTurn &&
              isPlanAwaitingNextBeat(storyData) &&
              !isRepetitive &&
              noPlanAdvancePrompts < MAX_PLAN_ADVANCE_PROMPTS
            ) {
              noPlanAdvancePrompts++;
              logger.action(
                "Plan gate: beat marked complete but next beat not written - forcing another round",
                {
                  noPlanAdvancePrompts,
                  currentBeatIndex: storyData.planState?.currentBeatIndex,
                },
              );
              conversationHistory.push({
                role: "user",
                content:
                  "You marked the current campaign beat complete but have not written the next beat yet - write the next beat before the turn can end. Call advance_plan with action \"write_next\", giving the next beat's name and its full writeup (goal + [ ] checklist + advance-when), then continue.",
              });
              forceToolChoiceNextRound = "required";
              continue gmRoundLoop;
            }

            // The system's turn-end checks (decision 183,
            // docs/dawn-gate-design.md). When the turn's words cross a line a
            // system declared (Blood & Bone: the night ended) and nothing this
            // turn did what that needs (end_session), send the GM back once.
            // A follow-up, not a hold: this round's prose has already reached
            // the feed, so the GM is asked to do the work now and narrate any
            // change. The message is conditional and the round runs on
            // `auto`, so the GM may decline when it is not actually dawn.
            // Session zero is off (it has its own gate), as is a repetitive
            // round. Runs after the setup, M2 and plan gates, whose order is
            // unchanged.
            if (!sessionZeroTurn && !isRepetitive) {
              const resolved = resolveSystem(storyData);
              const turnEndTurn = {
                text: {
                  gmProse: extractVisibleText(gmAccumulatedStory.join("\n\n")),
                  playerLines: splitPlayerLines(gmUserChoice),
                },
                results: gmResults,
                prompted: turnEndChecksPrompted,
                priorParts: storyData.scene?.parts ?? [],
              };
              // A "judge" check (Blood & Bone's night-ended, when the switch
              // is on) is read by one cheap model call on this final prose,
              // once per distinct text. A failed or unsure call is "unknown"
              // and the phrase table decides; a Stop passes through.
              const judged: Record<
                string,
                { answer: "yes" | "no" | "unknown"; quote?: string }
              > = {};
              if (resolved.usesSystemTools) {
                // Only while a "yes" could still act (three rounds left, as
                // below), and at most one reading per check per turn: after
                // it, the phrase table decides the rest of the turn.
                const canAct = MAX_GM_ROUNDS - gmRound >= 3;
                for (const check of canAct
                  ? judgeChecksToAsk(resolved.system, turnEndTurn)
                  : []) {
                  if (turnEndJudgeAsked.has(check.id)) continue;
                  turnEndJudgeAsked.add(check.id);
                  const sideKeys = pickProviderKeys(options);
                  judged[check.id] = await askTurnEndJudge(
                    {
                      question: check.trigger.question ?? "",
                      gmProse: turnEndTurn.text.gmProse,
                      playerLines: turnEndTurn.text.playerLines,
                    },
                    {
                      ...resolveSideCallModel(null, sideKeys),
                      ...sideKeys,
                      abortSignal: options.abortSignal,
                    },
                  );
                }
              }
              const pending = resolved.usesSystemTools
                ? pendingCheck(resolved.system, { ...turnEndTurn, judged })
                : null;
              // The tool that settles the check must be on this turn's list
              // (a story with the system tools off never offers it).
              const offered = pending
                ? gmBaseTools.some(
                    (t) =>
                      (t as { function?: { name?: string } }).function?.name ===
                      pending.check.satisfiedBy.toolName,
                  )
                : false;
              if (pending && offered) {
                const matchLog = {
                  check: pending.check.id,
                  source: pending.match.source,
                  phrase: pending.match.phrase,
                  round: gmRound,
                };
                // Dawn takes several requests (end_session, the Reckoning's
                // rolls, the meter changes, the prose); with fewer than three
                // left the session would end without its consequences, so it
                // is logged instead (engine review, decision 184).
                if (MAX_GM_ROUNDS - gmRound < 3) {
                  turnEndChecksPrompted.add(pending.check.id);
                  logger.action(
                    `Turn-end check ${pending.check.id} could not run: no rounds left`,
                    matchLog,
                  );
                } else {
                  turnEndChecksPrompted.add(pending.check.id);
                  logger.action(
                    `Turn-end check ${pending.check.id}: the turn's text crossed it and ${pending.check.satisfiedBy.toolName} was not called - sending the GM back once`,
                    matchLog,
                  );
                  conversationHistory.push({
                    role: "user",
                    content: pending.check.message,
                  });
                  // Explicit auto: the GM may decline, even on Google, where
                  // an unset choice means "required".
                  forceToolChoiceNextRound = "auto";
                  continue gmRoundLoop;
                }
              }
            }

            // Rung 2 of the judge layer (judges/rung1.ts, design 11.1): the
            // deterministic rung-1 checks read this final round, and a verified
            // hit the GM can fix with its own tools (a foe's damage never
            // recorded, a line's word on screen) sends it back once, on the
            // gates' own path: one appended user message, an explicit "auto".
            // The re-ask round shares maxToolLoops, never runs a dice tool, and
            // is off in session zero and for a repetitive round. The prose is
            // not final here, so a line's re-ask is answered with new prose
            // that replaces this round's (resolveReask above).
            if (
              !sessionZeroTurn &&
              !isRepetitive &&
              !rollGateDeclined &&
              !reaskUsed &&
              !options.precomputedGMResults &&
              MAX_GM_ROUNDS - gmRound >= 2
            ) {
              // The prose the player has not seen: everything accumulated
              // after what a pause already released.
              const releasedCount = pauseReleasedEntry ? 1 : 0;
              const unreleasedProse = extractVisibleText(
                gmAccumulatedStory.slice(releasedCount).join("\n\n"),
              );
              let plan: ReturnType<typeof buildReask> = null;
              try {
                plan = buildReask(
                  runRung1({
                    storyBefore: storyBeforeJudgeView,
                    storyAfter: storyData,
                    results: gmResults,
                    prose: unreleasedProse,
                    system: resolveSystem(storyData).system,
                  }),
                );
              } catch (rung1Error) {
                logger.action("Rung 1 check failed - skipping the re-ask", {
                  error:
                    rung1Error instanceof Error
                      ? rung1Error.message
                      : String(rung1Error),
                });
              }
              if (plan) {
                reaskUsed = true;
                const after = {
                  thinking: gmThinking.length,
                  accumulated: gmAccumulatedStory.length,
                  context: allGMContextParts.length,
                };
                reask = {
                  armedRound: gmRound,
                  replacesProse: plan.replacesProse,
                  resolved: false,
                  before: {
                    thinking: pauseThinkingMark,
                    accumulated: releasedCount,
                    context: roundMarks.context,
                  },
                  after,
                  stash: { thinking: [], accumulated: [], context: [] },
                  draftHistory: [],
                  askIndex: -1,
                };
                if (plan.replacesProse) {
                  // The whole unreleased span is the draft: set it aside (it
                  // comes back if the GM answers with no words) and note which
                  // assistant messages carried it.
                  conversationHistory.forEach((m, i) => {
                    if (m.role === "assistant" && i >= pauseHistoryMark) {
                      reask?.draftHistory.push(i);
                    }
                  });
                  reask.stash = {
                    thinking: gmThinking.splice(pauseThinkingMark),
                    accumulated: gmAccumulatedStory.splice(releasedCount),
                    context: allGMContextParts.splice(roundMarks.context),
                  };
                }
                for (const hit of plan.hits) {
                  logger.action(`Rung 1 hit (${hit.check}) - re-asking the GM once`, {
                    contract: hit.contractId,
                    evidence: hit.evidence,
                    factIds: hit.factIds,
                    round: gmRound,
                  });
                }
                reask.askIndex = conversationHistory.length;
                conversationHistory.push({ role: "user", content: plan.message });
                forceToolChoiceNextRound = "auto";
                continue gmRoundLoop;
              }
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

        // The loop ended before a prose-only round answered the re-ask (the
        // round limit, or the re-ask round's tools ran last): settle it with
        // no new words, so a set-aside draft is given back.
        if (reask && !reask.resolved) resolveReask("");

        // Round limit reached in session zero, the last round still a tool
        // round: its text is a line written before the tools' results were
        // read (an answered question's follow-up, say), so the turn ends on
        // the engine's own line whether or not the turn made progress.
        if (sessionZeroTurn && !isComplete && !startGameSucceededThisTurn) {
          setupGateExhausted = true;
          logger.action(
            "Setup gate: round limit reached before the game started - ending the turn on the engine line, no narration",
            { maxRounds: MAX_GM_ROUNDS },
          );
          discardHeldSetupProse();
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
          // After a pause release the first entry is the released prose
          // itself; the raw text of those rounds stands in for it here, so the
          // inline <thinking> a pause polished away still reaches rawStoryContent
          // and the narration thoughts. The polished prefix is put back verbatim
          // where the story is assembled below.
          pauseReleasedText = pauseReleasedEntry;
          postPauseRawParts = pauseReleasedEntry
            ? gmAccumulatedStory.slice(1)
            : [];
          gmFinalStoryContent = (
            pauseReleasedEntry
              ? [pauseRawPrefix, ...gmAccumulatedStory.slice(1)]
              : gmAccumulatedStory
          )
            .filter(Boolean)
            .join("\n\n");
          logger.action("Combined accumulated GM story", {
            parts: gmAccumulatedStory.length,
            totalLength: gmFinalStoryContent.length,
          });
        }

        // Session zero without a started game never runs the separate
        // narration call (the GM's own final text is the turn's text), and a
        // turn with nothing valid to say - the gate gave up, or the round
        // limit hit, or the final text was empty - says the engine line.
        if (
          sessionZeroTurn &&
          !startGameSucceededThisTurn &&
          (setupGateExhausted ||
            setupHandedBackEnd ||
            !gmFinalStoryContent.trim())
        ) {
          const progressNow = getSetupProgress(storyData, options.setupPlayers);
          gmFinalStoryContent = setupHandedBackEnd
            ? SETUP_CARD_HANDED_BACK_LINE
            : setupEngineLine(progressNow.next, progressNow.creation);
          logger.action("Setup turn ends on the engine line", {
            line: gmFinalStoryContent,
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
    callbacks.onStoryStart?.(Boolean(gmFinalStoryContent));

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
      // The prose a pause released is the text the player read and the judges
      // judged: it goes in verbatim, never polished a second time (the
      // vocabulary swap is random, so a second pass could differ from what was
      // shown). Only what came after it is polished here.
      if (pauseReleasedText) {
        const rest = polishGMProse(
          postPauseRawParts.join("\n\n"),
          options.deAiifyWords !== false,
        );
        storyContent = [pauseReleasedText, rest].filter(Boolean).join("\n\n");
      } else {
        storyContent = polishGMProse(
          gmFinalStoryContent,
          options.deAiifyWords !== false,
        );
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
      // No GM content: the narrator writes the turn. It is NOT handed the GM's
      // conversation (its reasoning, tool arguments and the notes it read can
      // name a secret, status report 6.16); it gets the allowlisted narration
      // context instead.
      narrationContext = buildNarrationContext(
        {
          playerLine: gmUserChoice,
          results: gmResults,
          scenePartId: options.scenePartId,
        },
        storyData,
      );
      logger.action("Stage 1: Writing the narration from the narration context", {
        contextMessages: narrationContext.length,
        toolResults: gmResults.length,
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
        formatTintLine(storyData),
      );

      // Build messages: the narration context + the story prompt
      // (the instruction joins the live block's message: two user messages in
      // a row are rejected by strict-alternation models)
      const storyMessages: ChatMessage[] = appendToLastUser(
        narrationContext,
        storyContinuationPrompt,
      );

      // Narration always runs on the (user-configurable) narration model,
      // regardless of which tier adjudication used - this is what keeps
      // the GM's voice consistent even when a turn escalated to a heavier
      // reasoning tier.
      const storyRequestBody: GenerateRequestBody = {
        messages: storyMessages,
        model: narrationModel,
        reasoningEffort: narrationEffort,
        maxTokens: storyMaxOutput,
        temperature:
          (options.samplingSettings?.temperature ?? 0.7) +
          chaosFactorTemperatureDelta(storyData.agmtState?.chaosFactor),
        openRouterKey: options.openRouterKey,
        deepseekKey: options.deepseekKey,
        googleKey: options.googleKey,
        mistralKey: options.mistralKey,
        deepinfraKey: options.deepinfraKey,
        zaiKey: options.zaiKey,
        customModel: getCustomModelIfUUID(narrationModel),
        ...storyCacheKey(options.storyId, "narration"),
        // Stop the AI before it generates GAME MASTER state updates (handled by tools stage)
        // Also stop on [STOP] marker for player agency stopping points
        stop: ["[GAME MASTER State Update]", "[GAME MASTER State", "[STOP]"],
      };

      // Add sampling settings (Mistral/DeepInfra/OpenRouter accept them)
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
        reasoningEffort: narrationEffort,
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
          recordAICall({
            stage: "narration",
            label: "Narration",
            modelKey: String(narrationModel),
            promptTokens: event.meta.usage?.promptTokens || 0,
            completionTokens: event.meta.usage?.completionTokens || 0,
            cachedTokens: event.meta.usage?.cachedTokens,
            cacheWriteTokens: event.meta.usage?.cacheWriteTokens,
            providerReportedUsd: event.meta.estimatedCost,
          });
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

      // The narrator's own round trip joins the context a rewrite continues,
      // so the rewrite sees the draft as the narrator's last turn and, below,
      // the narrator's own reasoning. That reasoning is safe to hand on: the
      // narrator was only ever given the allowlisted context. (The GM's is not,
      // and never reaches a rewrite.) Deliberately kept out of
      // gmConversationForStorage, which is replayed on retries.
      if (storyContent.trim()) {
        narrationContext = [
          ...storyMessages,
          {
            role: "assistant",
            content: storyContent,
            ...(storyReasoning ? { reasoning: storyReasoning } : {}),
            ...(storyReasoningDetails.length > 0
              ? { reasoning_details: storyReasoningDetails }
              : {}),
          },
        ];
      }
      narrationWrittenSeparately = true;

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
      let generated: Awaited<ReturnType<typeof generateChoicesWithRetry>>;
      try {
        generated = await generateChoicesWithRetry(
          {
            storyData,
            storyContent,
            embeddingContext,
            usePrefill: options.usePrefill !== false, // Default to true
          },
          {
            token,
            model: narrationModel,
            reasoningEffort: narrationEffort,
            openRouterKey: options.openRouterKey,
            deepseekKey: options.deepseekKey,
            googleKey: options.googleKey,
            mistralKey: options.mistralKey,
            deepinfraKey: options.deepinfraKey,
            zaiKey: options.zaiKey,
            abortSignal: options.abortSignal,
          },
        );
      } catch (choicesError) {
        // A Stop is not a choices failure. Anything else is: the narration is
        // finished and (when held) not yet shown, so a failed suggestions call
        // must not throw the turn away. No choices, a Debug Logs line.
        if (options.abortSignal?.aborted || isAbortError(choicesError)) {
          throw choicesError;
        }
        logger.action("Choices generation failed, finishing the turn without choices", {
          error:
            choicesError instanceof Error
              ? choicesError.message
              : String(choicesError),
        });
        choices = [];
        callbacks.onChoicesComplete?.(choices, {
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
        });
        return;
      }
      const { content: rawChoicesContent, meta: choicesResultMeta } = generated;

      let choicesContent = rawChoicesContent;
      if (choicesResultMeta) {
        choicesMeta = choicesResultMeta;
        recordAICall({
          stage: "choices",
          label: "Choices",
          modelKey: String(narrationModel),
          promptTokens: choicesResultMeta.usage?.promptTokens || 0,
          completionTokens: choicesResultMeta.usage?.completionTokens || 0,
          cachedTokens: choicesResultMeta.usage?.cachedTokens,
          cacheWriteTokens: choicesResultMeta.usage?.cacheWriteTokens,
          providerReportedUsd: choicesResultMeta.estimatedCost,
        });
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
      choices = parseChoices(choicesContent);

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

    // The reasoning behind the narration, collected from all three places it
    // can land depending on the model and which path wrote the prose:
    //  - storyReasoning: the story stage's native reasoning stream.
    //  - the terminal GM assistant message's reasoning: on a turn where the
    //    GM's last round wrote the prose itself, there was no story call, so
    //    storyReasoning is empty and the CoT is attached back there.
    //  - inline <thinking> segments: models that ignore the native reasoning
    //    channel and think in `content` instead.
    // Handed to the observer's rewrite (see GenerationResult.narrationThoughts)
    // as prompt text, because the message-level reasoning fields only reach
    // OpenRouter and Google - sanitizeMessages drops them everywhere else.
    const terminalAssistantReasoning = [...gmConversationHistory]
      .reverse()
      .find((entry) => entry.role === "assistant" && entry.content?.trim())
      ?.reasoning?.trim();

    const narrationThoughts =
      [
        storyReasoning.trim() || terminalAssistantReasoning || "",
        extractThinkingText(rawStoryContent),
      ]
        .filter(Boolean)
        .join("\n\n")
        .trim() || undefined;

    // The narrator's own reasoning, only when a separate narration call wrote
    // the prose: the one reasoning a rewrite may be shown (see above).
    const narrationOwnThoughts = narrationWrittenSeparately
      ? [storyReasoning.trim(), extractThinkingText(rawStoryContent)]
          .filter(Boolean)
          .join("\n\n")
          .trim() || undefined
      : undefined;

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

    // Rung 1 of the judge layer, on the finished prose (judges/rung1.ts): the
    // deterministic checks, free, every turn. Every hit goes to the Debug Logs;
    // the pacing hits also make a GM-only note for the next turn (decision
    // 235). Nothing here changes the prose or fails the turn.
    let rung1PacingNote: string | undefined;
    try {
      const couchPlayers = storyData.multiplayer?.couchPlayers ?? [];
      const seated =
        couchPlayers.length > 1
          ? couchPlayers.map((p) => ({ id: p.id, name: p.name }))
          : (options.setupPlayers ?? []);
      // A player is also addressed by their character's name: a sheet they
      // own, or one titled "Character: <name>".
      const players = seated.map((p) => {
        const aliases = new Set<string>();
        for (const note of storyData.lore ?? []) {
          if (note.type !== "character_sheet") continue;
          if (note.ownerCouchPlayerId !== p.id) continue;
          const m = /^\s*character:\s*(.+?)\s*$/i.exec(note.title || "");
          if (m && m[1].toLowerCase() !== p.name.toLowerCase()) aliases.add(m[1]);
        }
        return { ...p, aliases: [...aliases] };
      });
      const rung1Hits = runRung1({
        storyBefore: storyBeforeJudgeView,
        storyAfter: storyData,
        results: options.precomputedGMResults ? [] : gmResults,
        prose: storyContent,
        nameCheck: {
          story: storyData,
          turnStartLore: lastTurnStartLore,
          playerTextThisTurn: lastNameTurn?.playerTextThisTurn ?? [],
        },
        system: resolveSystem(storyData).system,
        // Without this turn's own part: when the text was not held the page
        // has already pushed it, and it would count itself.
        priorParts: (storyData.scene?.parts ?? []).filter(
          (p) => !options.scenePartId || p.id !== options.scenePartId,
        ),
        players: players.length > 1 ? players : undefined,
      });
      for (const hit of rung1Hits) {
        logger.action(`Rung 1 check: ${hit.check}`, {
          verified: hit.verified,
          evidence: hit.evidence,
          factIds: hit.factIds,
          contract: hit.contractId,
        });
      }
      rung1PacingNote = pacingNoteFor(rung1Hits);
    } catch (rung1Error) {
      logger.action("Rung 1 checks failed - skipped", {
        error:
          rung1Error instanceof Error
            ? rung1Error.message
            : String(rung1Error),
      });
    }

    // Final tier reached this turn (after any mid-turn self-escalation or
    // fallback) - undefined on the retry/precomputed-conversation path,
    // where the tier router never runs (see reasoningTierRanThisTurn).
    const finalResolvedTier = reasoningTierRanThisTurn
      ? resolveTier(getTierState(storyData).currentTier)
      : undefined;

    const scenePart: ScenePart = {
      content: storyContent,
      raw: rawStoryContent || undefined,
      imageUrl: "",
      id: options.scenePartId,
      user: false,
      role: "assistant",
      reasoning: storyReasoning || undefined,
      reasoning_details:
        storyReasoningDetails.length > 0 ? storyReasoningDetails : undefined,
      ...(finalResolvedTier && {
        reasoningTier: finalResolvedTier.tier,
        reasoningTierModelKey: String(finalResolvedTier.modelKey),
        reasoningTierEffort: finalResolvedTier.reasoningEffort,
      }),
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
      ...(rung1PacingNote && { pacingNote: rung1PacingNote }),
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
      // The same allowlisted context the narration call used, or built now
      // for a turn the GM wrote inline: a rewrite of this turn's prose starts
      // from it, never from the GM's conversation.
      narrationContext:
        narrationContext ??
        buildNarrationContext(
          {
            playerLine: gmUserChoice,
            results: gmResults,
            scenePartId: options.scenePartId,
          },
          storyData,
        ),
      narrationThoughts,
      narrationOwnThoughts,
      meta: {
        storyMeta,
        toolsMeta,
        choicesMeta,
        gmMeta,
        totalTokenCost,
        balance: finalBalance,
      },
    };

    // onComplete is NOT fired here - this is one attempt inside
    // generateStoryTurn's while loop, and the observer (observer.ts) still
    // needs to review this attempt's narration and potentially rewrite or
    // fully reset it before the turn is actually final. Firing onComplete
    // this early made the UI (page.tsx) finalize/save/clear its loading
    // state on the FLAGGED narration, so by the time onObserverRewrite fired
    // afterward the "not final yet" warning had already vanished and the
    // corrected text had nowhere left to land. generateStoryTurn calls
    // onComplete itself, once, after the observer has had its say.
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
    /** The slot's effort (decision 53); "none" when a caller omits it. */
    reasoningEffort?: ReasoningEffort;
    openRouterKey?: string;
    deepseekKey?: string;
    googleKey?: string;
    mistralKey?: string;
    deepinfraKey?: string;
    zaiKey?: string;
    customModel?: CustomModel;
    /** Cancels the call (the turn's Stop). */
    abortSignal?: AbortSignal;
  },
): Promise<{
  content: string;
  toolCalls: ToolCall[];
  meta: GenerationMeta;
}> {
  const response = await providerFetch(
    "/api/generate",
    {
      messages,
      tools: options.tools,
      model: options.model,
      reasoningEffort: options.reasoningEffort ?? DEFAULT_REASONING_EFFORT,
      maxTokens: options.maxTokens || 4000,
      temperature: options.temperature || 0.7,
      openRouterKey: options.openRouterKey,
      deepseekKey: options.deepseekKey,
      googleKey: options.googleKey,
      mistralKey: options.mistralKey,
      deepinfraKey: options.deepinfraKey,
      zaiKey: options.zaiKey,
      customModel: options.customModel,
    },
    options.abortSignal,
  );

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
    /** The slot's effort (decision 53); "none" when a caller omits it. */
    reasoningEffort?: ReasoningEffort;
    openRouterKey?: string;
    deepseekKey?: string;
    googleKey?: string;
    mistralKey?: string;
    deepinfraKey?: string;
    zaiKey?: string;
  },
): AsyncGenerator<StreamEvent> {
  const response = await providerFetch("/api/generate-stream", {
    messages,
    tools: options.tools,
    model: options.model,
    reasoningEffort: options.reasoningEffort ?? DEFAULT_REASONING_EFFORT,
    maxTokens: options.maxTokens || 4000,
    temperature: options.temperature || 0.7,
    openRouterKey: options.openRouterKey,
    deepseekKey: options.deepseekKey,
    googleKey: options.googleKey,
    mistralKey: options.mistralKey,
    deepinfraKey: options.deepinfraKey,
    zaiKey: options.zaiKey,
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
    /** The narration voice's effort (decision 53): the choices call is the narrator's. */
    choicesReasoningEffort: ReasoningEffort;
    openRouterKey?: string;
    deepseekKey?: string;
    googleKey?: string;
    mistralKey?: string;
    deepinfraKey?: string;
    zaiKey?: string;
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
      reasoningEffort: options.choicesReasoningEffort,
      openRouterKey: options.openRouterKey,
      deepseekKey: options.deepseekKey,
      googleKey: options.googleKey,
      mistralKey: options.mistralKey,
      deepinfraKey: options.deepinfraKey,
      zaiKey: options.zaiKey,
    },
  );

  // Parse choices
  const choices = parseChoices(choicesContent);

  logger.action("Choices generation complete", { count: choices.length });

  return choices;
}
