"use client";

import {
  Scene,
  ScenePart,
  StoryData,
  StoryLore,
  Choices,
  Choice,
  Preset,
  CommandResponse,
  getMemoryContent,
  deduplicateMemories,
  NPCReaction,
  Adventure,
  CouchPlayer,
  ObserverFlag,
  ObserverRewriteOriginal,
  SceneImageRef,
} from "../misc/structs";
import { findMentionedNpcIds } from "../misc/noteMentions";
import { useNetSession } from "../misc/multiplayer/useNetSession";
import type { MPBackend } from "../misc/multiplayer/types";
import {
  DEFAULT_HOST_COLOR,
  DEFAULT_JOIN_COLOR,
} from "../misc/multiplayer/palette";
import type { FloorSnapshot, TurnStatus } from "../misc/multiplayer/session";
import type { TTSRelayHandle } from "../components/TTSControls";
import {
  aggregateBatch,
  clearBatch,
  createBatch,
  isBatchReady,
  passedIds as batchPassedIds,
  recordInput,
  submittedIds as batchSubmittedIds,
  type BatchedInput,
} from "../misc/multiplayer/turnBatch";
import {
  createFloor,
  lockedOutIds as floorLockedOutIds,
  pruneLockouts,
  releaseFloor,
  takeFloor,
  FLOOR_STEAL_COOLDOWN_MS,
} from "../misc/multiplayer/floorControl";
import {
  classifyPlayerStyle,
  classifyToolActivityStyle,
} from "../misc/mythic";
import {
  getEffectiveNarrationEffort,
  getEffectiveNarrationModelKey,
  type ResolvedTier,
} from "../misc/reasoningTiers";
import { migrateCustomTablesToNotes } from "../misc/tableNotes";
import { ensureStoryDataArrays } from "../misc/storyDataDefaults";
import { addMissingBuiltinNotes } from "../misc/systems/builtinNotes";
import {
  enqueueImageJob,
  type ImageJobDeps,
  type ImageJobRequest,
  type ImageJobState,
} from "../misc/imageJobs";
import { getImageSettings } from "../misc/imageSettings";
import {
  applyStoryPatch,
  createPatchQueue,
  type PatchHost,
} from "../misc/imagePatcher";
import {
  applyBackgroundFlags,
  applyBackgroundLayersDelta,
  applyBackgroundRewrite,
  backgroundRewriteTarget,
  type BackgroundLayersDelta,
  type BackgroundRewritePatch,
} from "../misc/backgroundPatch";
import { getObserverSettings } from "../misc/layerSettings";
import {
  effectiveLoadingStage,
  isTurnLocked,
  shouldHoldNarrationForJudge,
} from "./turnLock";
import { cancelImageJobsForTurn } from "../misc/imageJobs";
import { pickImageProvider } from "../misc/imageProvider";
import {
  writeSceneDescription,
  writePortraitDescription,
} from "../misc/imagePromptWriter";
import { pickProviderKeys } from "../misc/sideModelCall";
import { getActiveTurnId } from "../misc/turnCost";
import { getImage } from "../misc/imageStore";
import Story from "./story";
import LorePage from "./lore";
import GoalsPage from "./goals";
import NPCsPage from "./npcs";
import MenuPage, { type MenuNavTarget } from "./menu";
import { StoryHeader } from "./StoryHeader";
import { StoryMenuSheet } from "./StoryMenuSheet";
import LogViewer from "./LogViewer";
import ContextViewer from "./ContextViewer";
import OOCChatPanel from "../components/OOCChatPanel";
import ProfilePickerModal from "../components/ProfilePickerModal";
import { PartyLobbyModal } from "../components/PartyLobby";
import { usePartyHost } from "./usePartyHost";
import type { PartyPending } from "../misc/party/partyRuntime";
import ManualRollModal from "../components/ManualRollModal";
import DiceThrowModal from "../components/DiceThrowModal";
import AskQuestionModal from "../components/AskQuestionModal";
import SetupConfirmModal from "../components/SetupConfirmModal";
import {
  SETUP_DISMISSED,
  SETUP_STOPPED,
  settleSetupResolver,
} from "../misc/setupConfirmAnswer";
import { SETUP_STYLE_LINES } from "../misc/setupStrip";
import { premadePlayerIds } from "../misc/campaignPlan";
import type {
  ManualRollRequest,
  ManualRollAnswer,
  DiceThrowRequest,
  AskQuestionRequest,
  AskQuestionAnswer,
  SetupConfirmationRequest,
  SetupConfirmationAnswer,
} from "../misc/gmExecutor";
import {
  type TimelineBlock,
  updateLiveRoundBlocks,
  updateLiveReasoningBlock,
  appendStreamingText,
  toolResultBlock,
  freezeBlocks,
} from "../misc/turnTimeline";
import { logger } from "../misc/logger";
import {
  clearTurn,
  markTurnEnded,
  markTurnStarted,
  readInterruptedTurn,
  repairInterruptedStory,
} from "../misc/interruptedTurn";
import {
  beginTurnKeepAlive,
  endTurnKeepAlive,
  newTurnId,
  notifyPlayerNeeded,
  type TurnKeepAliveOutcome,
} from "../misc/turnKeepAlive";
import { useState, useEffect, useRef, useCallback, useMemo, Suspense } from "react";
import { useNotification } from "../misc/NotificationContext";
import { getSubscriptionFallbacks } from "../misc/reasoningTiers";
import { getLayerSubscriptionFallbacks } from "../misc/layerSettings";
import { useAPIKeys } from "../misc/APIKeysContext";
import { useSearchParams, useRouter } from "next/navigation";

// Helper function to get models for generation options. They are no longer
// read from presets: generateStoryTurn ignores all three (the reasoning-tier
// router picks the GM's model, narration and choices run on the narration
// model, and the side agents on their own default, decision 51), and only
// choicesModel is used, by generateChoicesOnly. They stay on GenerationOptions for type compatibility,
// filled with the narration model so the player's override reaches
// generateChoicesOnly too.
function getModelsFromPreset() {
  const narrationModel = getEffectiveNarrationModelKey();
  return {
    storyModel: narrationModel,
    toolsModel: narrationModel,
    choicesModel: narrationModel,
  };
}

import {
  DEFAULT_PRESET,
  buildAdventureWelcome,
  hasPremadeCharacters,
  shouldUseIntroOverride,
} from "../misc/presets";
import ConfirmDialog from "../components/ConfirmDialog";
import SyncConflictModal from "../components/SyncConflictModal";
import SyncIndicator from "../components/SyncIndicator";
import { getModelConfig } from "../misc/ai_prices";
import { processLoreTriggers } from "../misc/lore";
import { DynamicIcon } from "../components/DynamicIcon";
import { outputToScenePart } from "../misc/ai";
import { generateStoryTurn } from "../misc/generation";
import { MAX_UNDO_STACK_SIZE } from "../misc/localStoryManager";
import { GMNPCReactionResult } from "../misc/gmExecutor";
import { NPCReactionContainer } from "./NPCReactionToast";
import { getSamplingSettings } from "../misc/samplingSettings";
import { useViewportHeight } from "../misc/useViewportHeight";
import { SYNC_COMPLETED_EVENT, SyncResult } from "../misc/syncManager";
import { useRouteBack } from "@/app/misc/useBackHandler";

// Cryptographically secure random number generator
// Returns a random integer between min (inclusive) and max (inclusive)
function getSecureRandomInt(min: number, max: number): number {
  const range = max - min + 1;
  const bytesNeeded = Math.ceil(Math.log2(range) / 8);
  const maxValue = Math.pow(256, bytesNeeded);
  const randomValues = new Uint8Array(bytesNeeded);

  // Rejection sampling to avoid modulo bias
  let randomNumber;
  do {
    crypto.getRandomValues(randomValues);
    randomNumber = randomValues.reduce(
      (acc, val, i) => acc + val * Math.pow(256, i),
      0,
    );
  } while (randomNumber >= maxValue - (maxValue % range));

  return min + (randomNumber % range);
}

// Helper to trigger notifications for goal-related tool responses
function processQuestNotifications(
  toolResponses: CommandResponse[],
  addNotification: (
    message: string,
    type: "success" | "failure" | "info" | "warning",
  ) => void,
) {
  for (const response of toolResponses) {
    if (!response.success) continue;

    const command = response.command.toLowerCase();

    // Goal created
    if (command.includes("/create_goal") || command.includes("create_goal")) {
      // Extract goal title from message like 'Created goal "Title"'
      const match = response.message.match(/Created goal "([^"]+)"/);
      if (match) {
        addNotification(`📜 New Goal: ${match[1]}`, "info");
      }
    }

    // Goal completed
    if (command.includes("/complete_goal:")) {
      const match = response.message.match(/Completed goal "([^"]+)"/);
      if (match) {
        addNotification(`✅ Goal Complete: ${match[1]}`, "success");
      }
    }

    // Goal failed
    if (command.includes("/fail_goal:")) {
      const match = response.message.match(/Failed goal "([^"]+)"/);
      if (match) {
        addNotification(`❌ Goal Failed: ${match[1]}`, "warning");
      }
    }

    // Goal updated
    if (command.includes("/update_goal:")) {
      const match = response.message.match(/Updated goal "([^"]+)"/);
      if (match) {
        addNotification(`📝 Goal Updated: ${match[1]}`, "info");
      }
    }

    // Goal deleted
    if (command.includes("/delete_goal:")) {
      const match = response.message.match(/Deleted goal "([^"]+)"/);
      if (match) {
        addNotification(`🗑️ Goal Removed: ${match[1]}`, "info");
      }
    }
  }
}

// Layer 5 hardening (see app/misc/observer.ts and generation.ts's
// generateStoryTurn): fired via GenerationCallbacks.onObserverReset when the
// observer flags a turn as a major violation (GM spoke/acted for the
// player, or blew way past the reply-length ceiling) and generateStoryTurn
// discards it and forces a fresh attempt. storyData has already been rolled
// back to its pre-turn snapshot by the time this fires. partialPart is the
// same object reference onStoryContent has been streaming into and pushing
// onto storyData.scene.parts - blank it out so nothing from the discarded
// attempt survives into the retry's streaming, and reset the live view so
// the player sees a clean restart rather than a stale/garbled part.
function handleObserverReset(
  partialPart: ScenePart,
  flags: ObserverFlag[],
  triggeringFlag: ObserverFlag,
  setStoryText: (text: string) => void,
  setLiveGMEntries: (entries: TimelineBlock[]) => void,
  setLoadingStage: (stage: "gm" | "story" | "choices" | null) => void,
  addNotification: (
    message: string,
    type: "success" | "failure" | "info" | "warning",
  ) => void,
) {
  partialPart.content = "";
  partialPart.gmToolCalls = undefined;
  partialPart.gmStoryContext = undefined;
  partialPart.gmThinking = undefined;
  partialPart.npcReactions = undefined;
  partialPart.toolCalls = undefined;
  partialPart.toolResponses = undefined;
  partialPart.stateChanges = undefined;
  // Pictures asked for by the discarded attempt (generation.ts cancels the jobs).
  partialPart.images = undefined;

  setStoryText("");
  setLiveGMEntries([]);
  setLoadingStage("gm");

  logger.action("Observer flagged turn, state reset and retrying", {
    type: triggeringFlag.type,
    detail: triggeringFlag.detail,
    totalFlags: flags.length,
  });

  addNotification(
    `GM response was reset: ${triggeringFlag.detail} Retrying...`,
    "warning",
  );
}

// Layer 5 hardening: fired via GenerationCallbacks.onObserverRewrite when
// rewriteFlaggedNarration (observer.ts) successfully rewrote a flagged
// turn's narration in place. Unlike handleObserverReset above, the turn's
// tool calls/dice rolls/state changes were left untouched (they were never
// the problem), so there's nothing to blank out here - just swap the
// displayed narration for the corrected text.
function handleObserverRewrite(
  storyData: StoryData,
  partialPart: ScenePart,
  flags: ObserverFlag[],
  triggeringFlag: ObserverFlag,
  rewrittenNarration: string,
  original: ObserverRewriteOriginal,
  setStoryText: (text: string) => void,
  setStoryData: (data: StoryData) => void,
  addNotification: (
    message: string,
    type: "success" | "failure" | "info" | "warning",
  ) => void,
) {
  partialPart.content = rewrittenNarration;
  // Keep the discarded draft on the part so the player can put it back (see
  // handleRestoreObserverOriginal) - stored here rather than in onComplete
  // because every generation flow routes rewrites through this one handler.
  partialPart.observerRewriteOriginal = original;

  // storyData.scene.parts[lastIndex] may no longer be the same object as
  // partialPart by now - STAGE 3 choices generation (generation.ts) already
  // ran once for the original (flagged) narration before the observer got a
  // say, and its onChoicesComplete handler below replaces the array slot
  // with a shallow copy rather than mutating in place. Patch whatever
  // object is actually in the array, or the rewritten text never reaches
  // what's rendered/saved even though partialPart itself is correct.
  const lastIndex = storyData.scene.parts.length - 1;
  if (lastIndex >= 0) {
    storyData.scene.parts[lastIndex] = {
      ...storyData.scene.parts[lastIndex],
      content: rewrittenNarration,
      observerRewriteOriginal: original,
    };
  }

  setStoryText(rewrittenNarration);
  setStoryData({ ...storyData });

  logger.action("Observer flagged turn, narration rewritten in place", {
    type: triggeringFlag.type,
    detail: triggeringFlag.detail,
    totalFlags: flags.length,
  });

  addNotification(
    `Narration revised: ${triggeringFlag.detail} Use "Undo revision" to keep the original.`,
    "warning",
  );
}

enum StoryState {
  STORY = "STORY",
  LORE = "LORE",
  NPCS = "NPCS",
  GOALS = "GOALS",
  MENU = "MENU",
  LOGS = "LOGS",
  CONTEXT = "CONTEXT",
}

function trimStoryData(data: StoryData): StoryData {
  // No longer truncating parts - context-aware pruning happens in ai_staged.ts
  // based on actual token limits (75% story history, 25% info/lore/memory)
  return data;
}

function StoryPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const storyId = searchParams.get("storyId");

  const { addNotification } = useNotification();
  const { keys: apiKeys } = useAPIKeys();
  const {
    openRouterKey,
    deepseekKey,
    googleKey,
    mistralKey,
    deepinfraKey,
    zaiKey,
    falKey,
  } = apiKeys;
  // The story menu is a sheet over the page (StoryMenuSheet), not a page of
  // its own, so the story stays mounted underneath it.
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuModalOpen, setMenuModalOpen] = useState(false);
  const [currentState, setCurrentState] = useState<StoryState>(
    StoryState.STORY,
  );
  // Set (and switched to) when the player clicks a highlighted note/NPC
  // mention in the story prose - consumed once by LorePage/NPCsPage's
  // initial-selection prop, then cleared below so a later manual tab click
  // doesn't re-trigger the same selection.
  const [pendingNoteOpen, setPendingNoteOpen] = useState<{
    kind: "lore" | "npc";
    id: string;
  } | null>(null);
  const handleOpenNote = (kind: "lore" | "npc", id: string) => {
    setPendingNoteOpen({ kind, id });
    setCurrentState(kind === "lore" ? StoryState.LORE : StoryState.NPCS);
  };
  useEffect(() => {
    if (pendingNoteOpen) setPendingNoteOpen(null);
    // Only clear in response to a state change - LorePage/NPCsPage already
    // captured pendingNoteOpen via their lazy initial-selection state by the
    // time this effect runs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentState]);
  // Real, JS-measured viewport height in px - see useViewportHeight for why
  // CSS units alone (`dvh`/`vh`) aren't reliable enough here.
  const viewportHeight = useViewportHeight();
  // How tall the active tab's content area can be before it must scroll
  // internally, computed from where that area actually starts on screen
  // (below the tab bar) rather than guessed offsets. The Story tab uses
  // this as a hard height (not just a minimum) so long chat history
  // scrolls inside its own card and the composer stays pinned at the
  // bottom, instead of the whole page growing.
  const [contentAreaHeight, setContentAreaHeight] = useState<number | null>(
    null,
  );
  const contentWrapperRef = useRef<HTMLDivElement | null>(null);
  const updateHeights = useCallback(() => {
    const vh = window.visualViewport?.height ?? window.innerHeight;
    if (contentWrapperRef.current) {
      const top = contentWrapperRef.current.getBoundingClientRect().top;
      // Clamp to the visible viewport: if a mobile browser has scrolled the
      // document (e.g. to lift the focused composer above the keyboard), `top`
      // can go negative and `vh - top` would overshoot, making the card taller
      // than the screen and leaving a scrollable strip of empty background.
      setContentAreaHeight(Math.max(200, Math.min(vh - top, vh)));
    }
  }, []);
  // A callback ref (rather than a plain useRef + mount-only effect) because
  // this wrapper only enters the DOM once storyData finishes loading - a
  // mount-only effect on StoryPageContent would fire during the loading
  // spinner branch, see contentWrapperRef.current as null, and never
  // re-measure once the real content appears.
  const setContentWrapperRef = useCallback(
    (node: HTMLDivElement | null) => {
      contentWrapperRef.current = node;
      if (node) updateHeights();
    },
    [updateHeights],
  );
  useEffect(() => {
    updateHeights();
    window.visualViewport?.addEventListener("resize", updateHeights);
    // "scroll" fires when the visual viewport's offset changes without a
    // height change - notably when iOS scrolls the focused input into view
    // above the keyboard, which can happen after (not during) the "resize"
    // event and otherwise leaves contentAreaHeight computed from a stale top.
    window.visualViewport?.addEventListener("scroll", updateHeights);
    window.addEventListener("resize", updateHeights);
    window.addEventListener("orientationchange", updateHeights);
    return () => {
      window.visualViewport?.removeEventListener("resize", updateHeights);
      window.visualViewport?.removeEventListener("scroll", updateHeights);
      window.removeEventListener("resize", updateHeights);
      window.removeEventListener("orientationchange", updateHeights);
    };
  }, [updateHeights]);
  const fullHeightStyle = viewportHeight
    ? { minHeight: `${viewportHeight}px` }
    : undefined;
  // While the Story tab is active, lock the document so mobile browsers can't
  // scroll the whole page under the keyboard. That page-scroll is what desyncs
  // our card-height measurement (see updateHeights) and strands the composer
  // below a phantom scrollable strip of empty background. The Story card scrolls
  // internally instead; other tabs keep normal page scrolling.
  useEffect(() => {
    if (currentState !== StoryState.STORY) return;
    const html = document.documentElement.style;
    const body = document.body.style;
    const prev = {
      htmlOverflow: html.overflow,
      bodyOverflow: body.overflow,
      bodyOverscroll: body.overscrollBehavior,
    };
    html.overflow = "hidden";
    body.overflow = "hidden";
    body.overscrollBehavior = "none";
    return () => {
      html.overflow = prev.htmlOverflow;
      body.overflow = prev.bodyOverflow;
      body.overscrollBehavior = prev.bodyOverscroll;
    };
  }, [currentState]);
  const [storyData, setStoryData] = useState<StoryData | null>(null);
  // The latest StoryData for pictures that settle after the turn that asked
  // for them (imageJobs.ts): a job writes against this, never a copy it
  // captured when it was queued.
  const storyDataRef = useRef<StoryData | null>(null);
  useEffect(() => {
    storyDataRef.current = storyData;
  }, [storyData]);
  // The StoryData object a turn in flight is mutating (see imagePatcher.ts),
  // false-ish between turns; and whether this page is still on screen.
  const turnLiveRef = useRef<StoryData | null>(null);
  // True from the start of a turn until its outer onComplete has run (see
  // turnLock.ts). The ref is for guards that must see it synchronously; the
  // state is what the screen renders from.
  const turnInFlightRef = useRef(false);
  const [turnInFlight, setTurnInFlight] = useState(false);
  const mountedRef = useRef(true);
  // The id of the story on screen right now. The page stays mounted when the
  // player jumps to another story, so a closure that captured the id a turn
  // started with must compare against this before touching on-screen state.
  const currentStoryIdRef = useRef<string | null>(null);
  // Background patches that arrived while a turn was in flight; applied after
  // the turn's final save (imagePatcher.ts, createPatchQueue).
  const patchQueueRef = useRef(createPatchQueue());
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  // The last finished turn's cost-ledger id, to cancel its pictures on Retry/Undo.
  const lastTurnCostIdRef = useRef<string | null>(null);
  // The final save of the turn in flight, set by the turn's onComplete so the
  // wrapper below can await it before ending the Android keep-alive service.
  const turnSaveRef = useRef<Promise<boolean> | null>(null);
  // The banner after a turn the OS killed (interruptedTurn.ts, decision 135),
  // the id of the record on disk, and the id of the turn in flight.
  const [interruptedTurn, setInterruptedTurn] = useState<{
    mode: "new" | "retry";
    text: string;
  } | null>(null);
  const interruptedTurnIdRef = useRef<string | null>(null);
  const liveTurnRef = useRef<{ storyId: string; turnId: string } | null>(null);
  // A record kept after a finished turn failed its final save; a later
  // successful save of the same story clears it (performSave).
  const keptTurnRecordRef = useRef<{ storyId: string; turnId: string } | null>(
    null,
  );
  // The one boundary every generating turn crosses. `turn` says how a killed
  // turn is recovered: "new" resends `text`; "retry" (a reroll or reword)
  // runs Retry again. partsBefore is scene.parts.length before the turn
  // pushed anything, so the caller captures it, not this wrapper.
  async function generateTrackedTurn(
    turn: { mode: "new" | "retry"; text: string; partsBefore: number },
    ...args: Parameters<typeof generateStoryTurn>
  ) {
    turnLiveRef.current = args[0];
    // The authoritative lock (turnLock.ts): held until generateStoryTurn has
    // returned, past the outer onComplete, so no stage callback releases it.
    turnInFlightRef.current = true;
    setTurnInFlight(true);
    // A banner never survives a new turn.
    setInterruptedTurn(null);
    interruptedTurnIdRef.current = null;
    // Android: keep the process alive while the player is away (decision 132).
    // Ended only after the final save has settled, so "ready" means saved.
    const turnId = newTurnId();
    const recordStoryId = storyDbId;
    if (recordStoryId) {
      liveTurnRef.current = { storyId: recordStoryId, turnId };
      markTurnStarted({
        storyId: recordStoryId,
        turnId,
        mode: turn.mode,
        text: turn.text,
        partsBefore: turn.partsBefore,
        startedAt: Date.now(),
      });
    }
    // Cleared once the turn is settled: saved, stopped, or failed in a way the
    // page already reports. Kept only when a finished turn failed to save.
    let settled = true;
    const turnSignal = args[2]?.abortSignal;
    const wasStopped = () =>
      turnSignal?.aborted === true ||
      generationAbortRef.current?.signal.aborted === true;
    let outcome: TurnKeepAliveOutcome = "failed";
    turnSaveRef.current = null;
    beginTurnKeepAlive(turnId);
    try {
      const result = await generateStoryTurn(...args);
      lastTurnCostIdRef.current = result.meta?.costTurnId ?? null;
      let saved = false;
      try {
        saved = (await turnSaveRef.current) === true;
      } catch {
        saved = false;
      }
      if (wasStopped()) outcome = "stopped";
      else if (result.success && result.content.trim() && saved)
        outcome = "ready";
      settled = wasStopped() || !result.success || saved;
      return result;
    } catch (error) {
      outcome = wasStopped() ? "stopped" : "failed";
      throw error;
    } finally {
      if (recordStoryId && settled) clearTurn(recordStoryId, turnId);
      else if (recordStoryId) {
        markTurnEnded(turnId);
        keptTurnRecordRef.current = { storyId: recordStoryId, turnId };
      }
      if (liveTurnRef.current?.turnId === turnId) liveTurnRef.current = null;
      turnLiveRef.current = null;
      turnSaveRef.current = null;
      turnInFlightRef.current = false;
      setTurnInFlight(false);
      // Late results that arrived mid-turn land now, on the saved story. A
      // tick later so the turn's own commit has reached storyDataRef.
      if (patchQueueRef.current.size() > 0) {
        setTimeout(() => patchQueueRef.current.flush(), 0);
      }
      endTurnKeepAlive(turnId, outcome, args[0].story_name);
    }
  }
  const [illustrating, setIllustrating] = useState(false);
  const [storyDbId, setStoryDbId] = useState<string | null>(null);
  useEffect(() => {
    currentStoryIdRef.current = storyDbId;
  }, [storyDbId]);
  const [sourceAdventureId, setSourceAdventureId] = useState<string | null>(
    null,
  );
  const saveTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const hasLoadedStoryRef = useRef<string | null>(null); // Track loaded story ID to prevent re-fetching on tab focus
  // Bumped to force the load-story effect below to re-run after a sync -
  // otherwise this story's periodic autosave (using its stale in-memory
  // storyData) would silently overwrite whatever a sync merge just wrote to
  // IndexedDB the next time it fires.
  const [reloadTick, setReloadTick] = useState(0);
  const generationAbortRef = useRef<AbortController | null>(null); // Abort controller for stopping generation
  // Manual dice mode: a pending ask_for_roll request means the GM loop is
  // paused awaiting the player's physical roll. The resolver ref completes
  // the promise the GM executor is awaiting (number = entered total,
  // null = player skipped / generation stopped).
  const [manualRollRequest, setManualRollRequest] =
    useState<ManualRollRequest | null>(null);
  const manualRollResolveRef = useRef<
    ((answer: ManualRollAnswer | null) => void) | null
  >(null);
  // Physical dice mode: same pause-and-resolve pattern as manual dice mode
  // above, but the player throws a 3D die instead of typing a number.
  const [diceThrowRequest, setDiceThrowRequest] =
    useState<DiceThrowRequest | null>(null);
  const diceThrowResolveRef = useRef<
    ((faces: number[][] | null) => void) | null
  >(null);
  // Ask-question tool: the GM is asking one or more predefined-choice +
  // free-text questions. Same pause-and-resolve pattern as manual dice mode.
  const [askQuestionRequest, setAskQuestionRequest] =
    useState<AskQuestionRequest | null>(null);
  const askQuestionResolveRef = useRef<
    ((answer: AskQuestionAnswer | null) => void) | null
  >(null);
  // Session zero: the setup card (confirm_setup). Shown on this screen only -
  // the table or the host's, never relayed to a phone or an online guest.
  const [setupConfirmRequest, setSetupConfirmRequest] =
    useState<SetupConfirmationRequest | null>(null);
  const setupConfirmResolveRef = useRef<
    ((answer: SetupConfirmationAnswer) => void) | null
  >(null);
  // Party mode: the request id of a roll or question currently shown on a
  // player's phone rather than in the modals above (null when it isn't).
  const partyRollRequestIdRef = useRef<string | null>(null);
  const partyQuestionRequestIdRef = useRef<string | null>(null);
  // Networked multiplayer: which local player(s), if known, triggered the
  // turn currently in flight - set right before generateStoryTurn is called
  // (see handleCustomInput/handleChoiceWithAction). Read by requestDiceThrow
  // to decide whether a roll should be relayed to a specific connected
  // guest instead of thrown on the host's own device. Only freeform/voice
  // actions carry this attribution today - plain choices don't (see
  // handleChoiceWithAction), so a choice-triggered roll always stays local,
  // same as manual dice mode's existing (couch-only) scope.
  const currentTurnSpeakerIdsRef = useRef<string[] | undefined>(undefined);
  // Host-only: requestId -> the pending local Promise resolver for a dice
  // throw relayed to a specific guest, so onDiceThrowResult/onPeerLeft can
  // complete or abandon it.
  const diceThrowRelayResolversRef = useRef<
    Map<
      string,
      { forPlayerId: string; resolve: (faces: number[][] | null) => void }
    >
  >(new Map());
  // Stack of full pre-turn StoryData snapshots, one pushed right before each
  // turn's GM tool calls can mutate state. Persisted to IndexedDB (see
  // localStoryManager's undo_snapshots store) and hydrated on load, so it
  // survives page reloads - lets handleUndo/handleRetry actually revert a
  // turn's mechanical state changes (NPC attitude, quests, stats, combat,
  // etc.), not just its scene.parts entries. See §2.5 in
  // docs/research-paper-ttrpg-theory-gap-analysis.md. Bounded by
  // MAX_UNDO_STACK_SIZE - only the most recent turns are undoable, matching
  // the "misread input" framing rather than a full campaign-length history.
  const undoStackRef = useRef<StoryData[]>([]);
  const [choices, setChoices] = useState<Choices>({ choices: [] });
  const [input, setInput] = useState<Record<string, boolean>>({});
  const [storyText, setStoryText] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingStage, setLoadingStage] = useState<
    "gm" | "story" | "choices" | null
  >(null);
  // What the screen and the guards use (turnLock.ts): a turn in flight with no
  // stage reported - the choices call done, a blocking judge still deciding -
  // still locks the composer.
  const shownLoadingStage = effectiveLoadingStage(loadingStage, turnInFlight);
  const turnLocked = isTurnLocked({ loading, loadingStage, turnInFlight });
  // Narrower than loadingStage: true as soon as the CURRENT storyText is
  // finalized, even while tools/choices are still generating in the
  // background afterward. loadingStage stays "story" through that whole
  // background phase, which used to leave TTS disabled long after the text
  // was actually ready to read/listen to - see TTSControls' disabled prop.
  const [storyTextReady, setStoryTextReady] = useState(true);
  // Pending user choice text - shown in chat while GM is generating
  const [pendingUserChoice, setPendingUserChoice] = useState<string>("");

  // --- Networked multiplayer: batched turns, streaming, floor control ---
  // Host-only: the current collection round's buffered per-player inputs. The
  // host waits until every connected seat has submitted or passed (or forces
  // it) before generating a single combined turn - see turnBatch.ts.
  const turnBatchRef = useRef(createBatch());
  // Set true while startBatchedTurn is actually running generation, so the
  // host-side submit guards don't re-buffer the batched turn's own input.
  const runningBatchedTurnRef = useRef(false);
  // Live "who's submitted / who we're waiting on" for the collection lobby,
  // shown to the host and mirrored to guests via turn_status. Null when no
  // round is in progress (single-player, or between turns).
  const [turnLobby, setTurnLobby] = useState<TurnStatus | null>(null);
  // Host-only authoritative party-voice floor (talking stick). Guests reflect
  // floorSnapshot instead.
  const floorRef = useRef(createFloor());
  const floorPruneTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Everyone's view of the floor: on the host it's derived from floorRef; on a
  // guest it's whatever the host last broadcast.
  const [floorSnapshot, setFloorSnapshot] = useState<FloorSnapshot>({
    holderId: null,
    lockedOutIds: [],
  });
  // Host-only: turn id for the narration/TTS relay, bumped each turn so late
  // chunks from a previous turn are discardable on the guest side.
  const relayTurnIdRef = useRef(0);
  const lastStreamedTextRef = useRef("");
  // Tracks storyTextReady's previous value so the host streaming effect can
  // detect turn start (ready -> not-ready) and completion (not-ready -> ready).
  const prevStoryReadyRef = useRef(true);
  // Guest-only: imperative handle into TTSControls for injecting the host's
  // relayed audio chunks (see TTSControls relayMode). Guest ignores its own
  // TTS text pipeline when relaying.
  const ttsRelayRef = useRef<TTSRelayHandle | null>(null);
  // Guest-only: profile picker shown right after connecting, before claiming a
  // seat. `connecting` is true until the host's first snapshot (the saved-
  // profile roster) lands.
  const [profilePickerOpen, setProfilePickerOpen] = useState(false);
  const [profilePickerConnecting, setProfilePickerConnecting] = useState(false);
  const pendingJoinNameRef = useRef("Player");
  const pendingJoinColorRef = useRef(DEFAULT_JOIN_COLOR);

  // Networked P2P multiplayer (internet, not couch co-op - see
  // app/misc/multiplayer/session.ts). Host role runs generation locally as
  // usual and this just mirrors resulting state out to guests; guest role
  // never calls generateStoryTurn itself, see the early returns in
  // handleChoiceWithAction/handleCustomInput below.
  const {
    netSession,
    peers: netPeers,
    activity: netActivity,
    hostDisconnected,
    oocMessages,
    createRoom: createNetRoom,
    joinRoom: joinNetRoom,
    leaveRoom: leaveNetRoom,
    switchBackend: switchNetBackend,
    sendChoice: sendNetChoice,
    sendFreeform: sendNetFreeform,
    sendVoice: sendNetVoice,
    sendActivity: sendNetActivity,
    sendOOCChat: sendNetOOCChat,
    sendDiceThrowRequest: sendNetDiceThrowRequest,
    sendDiceThrowResult: sendNetDiceThrowResult,
    announceProfile: announceNetProfile,
    hasAnnouncedProfile: hasAnnouncedNetProfile,
    sendPass: sendNetPass,
    broadcastTurnStatus: broadcastNetTurnStatus,
    broadcastStoryStream: broadcastNetStoryStream,
    broadcastTTSAudio: broadcastNetTTSAudio,
    broadcastFloorState: broadcastNetFloorState,
    sendFloorTake: sendNetFloorTake,
    sendFloorRelease: sendNetFloorRelease,
  } = useNetSession({
    storyData,
    loading,
    onGuestAction: (action) => {
      // Host no longer generates on the first action - it buffers each
      // player's submission and fires one combined turn once everyone's in
      // (see recordSeatInput / maybeStartBatchedTurn below).
      if (action.kind === "choice") {
        if (action.choiceIndex === null) return;
        const targetChoice = choices.choices[action.choiceIndex];
        if (!targetChoice) return;
        recordSeatInput({
          playerId: action.localPlayerId,
          name: resolveSeatName(action.localPlayerId),
          kind: "choice",
          text: targetChoice.text,
          choiceIndex: action.choiceIndex,
        });
      } else if (action.text) {
        recordSeatInput({
          playerId: action.localPlayerId,
          name: resolveSeatName(action.localPlayerId),
          kind: action.kind === "voice" ? "voice" : "freeform",
          text: action.text,
          choiceIndex: null,
        });
      }
    },
    onGuestPass: (localPlayerId) => {
      recordSeatInput({
        playerId: localPlayerId,
        name: resolveSeatName(localPlayerId),
        kind: "pass",
        text: null,
        choiceIndex: null,
      });
    },
    onTurnStatus: (status) => {
      // Guest-only: mirror the host's collection lobby.
      setTurnLobby(status.phase === "generating" ? null : status);
    },
    onStoryStream: (update) => {
      // Guest-only: render the host's narration as it streams.
      setTurnLobby(null);
      setStoryText(update.text);
      setStoryTextReady(update.done);
      setLoadingStage(update.done ? null : update.stage);
      setLoading(false);
      setPendingUserChoice("");
      setLiveNarrationText(update.done ? "" : update.text);
    },
    onTTSAudio: (chunk) => {
      // Guest-only: feed the host's relayed audio into TTSControls.
      ttsRelayRef.current?.push(chunk.turnId, chunk.index, chunk.dataB64);
      if (chunk.done) ttsRelayRef.current?.end(chunk.turnId);
    },
    onFloorState: (floor) => {
      // Guest-only: reflect the host-authoritative party-voice floor.
      setFloorSnapshot(floor);
    },
    onFloorTake: (localPlayerId) => hostHandleFloorTake(localPlayerId),
    onFloorRelease: (localPlayerId) => hostHandleFloorRelease(localPlayerId),
    onSnapshot: (received) => {
      // The host may still send the removed fields (an older build's story, or
      // the shim for older guests); strip them like a load does.
      const incoming = ensureStoryDataArrays(received);
      setStoryData(incoming);
      const lastPart = incoming.scene.parts[incoming.scene.parts.length - 1];
      if (lastPart) {
        setStoryText(lastPart.content);
        setChoices({ choices: lastPart.choices || [] });
      }
      setPendingUserChoice("");
      setLoading(false);
      setLoadingStage(null);
      setStoryTextReady(true);
      // First snapshot after connecting means the saved-profile roster is now
      // available for the picker to show.
      setProfilePickerConnecting(false);
    },
    onGuestJoined: (info) => {
      setStoryData((prev) => {
        if (!prev) return prev;
        const existingPlayers = prev.multiplayer?.couchPlayers ?? [];
        // Full profile the guest claimed (a saved one resumed, or newly made).
        const claimed: CouchPlayer = {
          id: info.localPlayerId,
          name: info.displayName,
          color: info.color,
          archetype: info.archetype ?? undefined,
          personalityTags: info.personalityTags ?? undefined,
          wishTags: info.wishTags ?? undefined,
        };
        const idx = existingPlayers.findIndex((p) => p.id === info.localPlayerId);
        if (idx >= 0) {
          // Resuming a saved profile - refresh its fields (name/color/tags may
          // have been edited on the joiner's side) rather than duplicating it.
          addNotification(`${info.displayName} reconnected`, "success");
          const merged = [...existingPlayers];
          merged[idx] = { ...existingPlayers[idx], ...claimed };
          return {
            ...prev,
            multiplayer: { ...prev.multiplayer, enabled: true, couchPlayers: merged },
          };
        }
        addNotification(`${info.displayName} joined the room`, "success");
        return {
          ...prev,
          multiplayer: {
            ...prev.multiplayer,
            enabled: true,
            couchPlayers: [...existingPlayers, claimed],
          },
        };
      });
    },
    onPeerLeft: (localPlayerId) => {
      const departed = storyData?.multiplayer?.couchPlayers?.find(
        (p) => p.id === localPlayerId,
      );
      addNotification(`${departed?.name ?? "A player"} disconnected`, "warning");
      // Don't leave the GM loop hanging if the player we relayed a physical
      // dice throw to just disconnected mid-roll - fall back to digital.
      for (const [requestId, pending] of diceThrowRelayResolversRef.current) {
        if (pending.forPlayerId === localPlayerId) {
          diceThrowRelayResolversRef.current.delete(requestId);
          pending.resolve(null);
        }
      }
    },
    // Guest-only: the host asked *me* to throw physically. Reuse the same
    // requestDiceThrow() used for local rolls (it recognizes it isn't the
    // host and shows the tray locally rather than trying to relay further),
    // then report the settled faces back over the wire.
    onDiceThrowRequest: (request) => {
      requestDiceThrow({
        groups: request.groups,
        formula: request.formula,
        reason: request.reason,
      }).then((faces) => sendNetDiceThrowResult(request.requestId, faces));
    },
    // Host-only: a targeted guest's relayed throw resolved.
    onDiceThrowResult: (result) => {
      const pending = diceThrowRelayResolversRef.current.get(result.requestId);
      if (!pending) return;
      diceThrowRelayResolversRef.current.delete(result.requestId);
      pending.resolve(result.faces);
    },
  });

  // Party mode (desktop app only): every player plays from their own phone on
  // the home network, and this screen is the table. The server runs only
  // while the table is open; see app/misc/party/ and usePartyHost.
  const party = usePartyHost({
    storyData,
    setStoryData,
    turnBusy: turnLocked,
    submitTurn: (text, speakerIds, kind) =>
      storyData
        ? handleCustomInput(text, undefined, speakerIds, kind)
        : Promise.reject(new Error("No story is loaded")),
    mistralKey,
    onReturnRequest: (pending) => returnPartyRequestToDesktop(pending),
  });
  const [partyLobbyOpen, setPartyLobbyOpen] = useState(false);
  // Party mode and an online room can't run together: the phone table and
  // the online guests would both feed one story.
  const partyStatus = party.status;
  const stopParty = party.stop;
  useEffect(() => {
    if (netSession && partyStatus !== "off") void stopParty();
  }, [netSession, partyStatus, stopParty]);
  // A phone's roll or question prompt, answered at the desktop instead: the
  // modal opens on the same promise the GM loop is waiting on. Used by "Answer
  // here", and when the player is removed or the table closes.
  function returnPartyRequestToDesktop(pending: PartyPending) {
    if (pending.kind === "roll") {
      partyRollRequestIdRef.current = null;
      setManualRollRequest(pending.request as ManualRollRequest);
    } else {
      partyQuestionRequestIdRef.current = null;
      setAskQuestionRequest(pending.request as AskQuestionRequest);
    }
  }
  const partyPending = party.table?.pending;
  const partyCancelRequest = party.cancelRequest;
  const answerPartyRequestHere = (requestId: string) => {
    const pending = partyPending?.find((p) => p.requestId === requestId);
    if (!pending) return;
    partyCancelRequest(requestId);
    returnPartyRequestToDesktop(pending);
  };

  // Guest's only link (the host) dropped. Rather than silently falling back to
  // a local view, keep the session info and surface a reconnect banner (see
  // below) so the player can re-join the same room once the host is back.
  useEffect(() => {
    if (!hostDisconnected) return;
    addNotification("Host connection lost", "warning");
  }, [hostDisconnected, addNotification]);

  // Guest-only: re-join the same room (same code/backend, re-claiming the same
  // profile) after the host dropped or timed out.
  const handleGuestReconnect = async () => {
    if (!netSession) return;
    try {
      await switchNetBackend(netSession.backend);
      addNotification("Reconnected", "success");
    } catch {
      addNotification(
        "Couldn't reconnect - the host may still be offline. Try again in a moment.",
        "failure",
      );
    }
  };

  // Give the host their own bubble too (Discord-call parity - guests get
  // one automatically via onGuestJoined above; the host doesn't send itself
  // a presence_join, so it needs adding explicitly, once, on room creation.
  useEffect(() => {
    if (!netSession || netSession.role !== "host") return;
    setStoryData((prev) => {
      if (!prev) return prev;
      const existingPlayers = prev.multiplayer?.couchPlayers ?? [];
      if (existingPlayers.some((p) => p.id === netSession.myLocalPlayerId)) {
        return prev;
      }
      const hostPlayer: CouchPlayer = {
        id: netSession.myLocalPlayerId,
        name: netSession.displayName,
        color: netSession.color,
      };
      return {
        ...prev,
        multiplayer: {
          ...prev.multiplayer,
          enabled: true,
          couchPlayers: [...existingPlayers, hostPlayer],
        },
      };
    });
  }, [netSession]);

  // Decision 29: subscription models are not used during online play, so a
  // slot set to one runs on its default for as long as the session lasts.
  // Say so once when the session starts. useNetSession's effect (declared
  // earlier in this component) has already published the session to
  // claudeCliModels, so the fallbacks read as active here.
  const subscriptionNoticeForRoomRef = useRef<string | null>(null);
  useEffect(() => {
    if (!netSession) {
      subscriptionNoticeForRoomRef.current = null;
      return;
    }
    if (subscriptionNoticeForRoomRef.current === netSession.roomId) return;
    subscriptionNoticeForRoomRef.current = netSession.roomId;
    const online = [...getSubscriptionFallbacks(), ...getLayerSubscriptionFallbacks()].filter(
      (f) => f.reason === "online",
    );
    if (online.length === 0) return;
    addNotification(
      `Online play: your Claude subscription models are not used while this game is online (${online
        .map((f) => f.slot)
        .join(", ")} run on their default models instead).`,
      "info",
    );
  }, [netSession, addNotification]);

  // Live GM streaming state - chronological thinking/tool/text blocks,
  // rendered inline (Claude-style) as they arrive - see turnTimeline.ts
  const [liveGMEntries, setLiveGMEntries] = useState<TimelineBlock[]>([]);
  // Live narration text (see generation.ts:onLiveNarrationUpdate) - the
  // player-visible prose accumulated so far this turn, updated as the GM
  // stage streams it. Only meaningful while storyTextReady is false; once a
  // turn finishes, storyText is the source of truth again (see Story's
  // ttsText prop below). Lets TTS auto-narrate start speaking as narration
  // is written instead of waiting for the whole GM stage (thinking + tool
  // calls + narration) to finish, which is the only thing storyText itself
  // reflects on the common path (GM's own final round writes the story).
  const [liveNarrationText, setLiveNarrationText] = useState("");
  // Live reasoning-tier indicator (see generation.ts:onReasoningTierResolved)
  // - the tier currently driving the in-progress turn, updated as the GM
  // stage resolves/re-resolves it (initial pick, mid-turn self-escalation,
  // model-unavailable fallback). Reset to null at the start of each new
  // generation so a stale tier from the previous turn can't linger.
  const [liveReasoningTier, setLiveReasoningTier] =
    useState<ResolvedTier | null>(null);

  // Host-only: relay the live narration to guests so they watch the story
  // being written in real time (and can TTS it), instead of only seeing the
  // final snapshot. Mirrors the same visible-text logic story.tsx feeds to
  // TTSControls (prefer liveNarrationText while streaming, else storyText).
  useEffect(() => {
    if (netSession?.role !== "host") {
      prevStoryReadyRef.current = storyTextReady;
      return;
    }
    const wasReady = prevStoryReadyRef.current;
    prevStoryReadyRef.current = storyTextReady;

    if (wasReady && !storyTextReady) {
      // A new turn just started streaming - fresh relay id.
      relayTurnIdRef.current += 1;
      lastStreamedTextRef.current = "";
    }

    const turnId = String(relayTurnIdRef.current);
    if (!storyTextReady) {
      const text =
        liveNarrationText && liveNarrationText.length > 0
          ? liveNarrationText
          : storyText;
      if (text && text !== lastStreamedTextRef.current) {
        lastStreamedTextRef.current = text;
        broadcastNetStoryStream({ turnId, text, stage: loadingStage, done: false });
      }
    } else if (lastStreamedTextRef.current) {
      // Turn finished after actually streaming this round - send the finalized
      // text so guests' live view resolves (the authoritative snapshot follows).
      broadcastNetStoryStream({ turnId, text: storyText, stage: null, done: true });
      lastStreamedTextRef.current = "";
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storyText, liveNarrationText, storyTextReady, loadingStage, netSession]);

  // Host-only: if a guest disconnects mid-collection, the remaining seats may
  // now all be in - re-evaluate readiness so a departed player doesn't stall
  // the turn (the host can also always force it via "Start now").
  useEffect(() => {
    if (netSession?.role !== "host") return;
    if (turnBatchRef.current.inputs.size === 0) return;
    if (isBatchReady(turnBatchRef.current, expectedSeatIds())) {
      startBatchedTurn();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [netPeers, netSession]);

  const [pendingChoice, setPendingChoice] = useState<number | null>(null);
  const [loadingStory, setLoadingStory] = useState(true);
  // Deep-link auto-host: opens the Menu tab's Story Editor straight to the
  // Online Play section once the room has been created (see the
  // hostName/join query-param effect below).
  const [autoOpenOnlineSection, setAutoOpenOnlineSection] = useState(false);
  const autoHostAttemptedRef = useRef(false);
  const autoJoinAttemptedRef = useRef(false);
  const [started, setStarted] = useState(false);
  const [canRetry, setCanRetry] = useState(false);
  const [canUndo, setCanUndo] = useState(false);
  const [showPresetSelection, setShowPresetSelection] = useState(false);
  const startCustomPendingRef = useRef(false);
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    icon?: string;
    confirmText?: string;
    confirmButtonClass?: string;
  }>({
    isOpen: false,
    title: "",
    message: "",
    onConfirm: () => {},
  });

  // NPC Reaction notifications (social media style)
  const [pendingNPCReactions, setPendingNPCReactions] = useState<NPCReaction[]>(
    [],
  );

  // Story part navigation
  const [viewingPartIndex, setViewingPartIndex] = useState<number | null>(null);

  // Sync state
  const [syncStatus, setSyncStatus] = useState<
    "synced" | "pending" | "conflict" | "local-only"
  >("synced");
  const [syncConflict, setSyncConflict] = useState<{
    isOpen: boolean;
    serverData: StoryData | null;
    serverUpdatedAt: string;
    localPartCount: number;
    serverPartCount: number;
  }>({
    isOpen: false,
    serverData: null,
    serverUpdatedAt: "",
    localPartCount: 0,
    serverPartCount: 0,
  });

  // OOC chat state (lifted from menu so it persists across tabs). Only ever
  // shown while netSession is active (online co-op) - see render below.
  const [showOOCChat, setShowOOCChat] = useState(false);
  const [oocLastSeenCount, setOOCLastSeenCount] = useState(0);
  useEffect(() => {
    if (showOOCChat) setOOCLastSeenCount(oocMessages.length);
  }, [showOOCChat, oocMessages.length]);

  // Android back, when no dialog or sheet is open: off the story page (Lore,
  // NPCs, Goals...) goes to the story, on it leaves to the Library
  // (decision 133).
  useRouteBack(() => {
    if (currentState !== StoryState.STORY) setCurrentState(StoryState.STORY);
    else if (liveTurnRef.current || turnLiveRef.current) {
      // A turn is running and the page does not abort it on leaving: decline,
      // so the app goes to the background instead of away from the turn.
      return false;
    } else router.push("/library");
  });
  const oocUnread = useMemo(
    () =>
      showOOCChat ? 0 : Math.max(0, oocMessages.length - oocLastSeenCount),
    [showOOCChat, oocMessages.length, oocLastSeenCount],
  );

  // Navigation handlers - only navigate through AI story parts with content
  function handleNavigateLeft() {
    if (!storyData) return;

    // Filter to only AI story parts with actual content and deduplicate consecutive identical content
    const storyParts = storyData.scene.parts.filter(
      (part) => !part.user && part.content.trim().length > 0,
    );

    // Remove consecutive duplicates (same content)
    const uniqueStoryParts = storyParts.filter((part, index, arr) => {
      if (index === 0) return true;
      return part.content !== arr[index - 1].content;
    });

    if (uniqueStoryParts.length === 0) return;

    // If viewing current (null), we're at the last unique story part
    let currentStoryIndex;
    if (viewingPartIndex === null || viewingPartIndex === undefined) {
      currentStoryIndex = uniqueStoryParts.length - 1;
    } else {
      const currentPart = storyData.scene.parts[viewingPartIndex];
      currentStoryIndex = uniqueStoryParts.indexOf(currentPart);
    }

    if (currentStoryIndex > 0) {
      const prevStoryPart = uniqueStoryParts[currentStoryIndex - 1];
      const newIndex = storyData.scene.parts.indexOf(prevStoryPart);
      setViewingPartIndex(newIndex);
      setStoryText(prevStoryPart.content);
      setChoices({ choices: prevStoryPart.choices || [] });
    }
  }

  function handleNavigateRight() {
    if (!storyData) return;

    // Filter to only AI story parts with actual content and deduplicate consecutive identical content
    const storyParts = storyData.scene.parts.filter(
      (part) => !part.user && part.content.trim().length > 0,
    );

    // Remove consecutive duplicates (same content)
    const uniqueStoryParts = storyParts.filter((part, index, arr) => {
      if (index === 0) return true;
      return part.content !== arr[index - 1].content;
    });

    if (uniqueStoryParts.length === 0) return;

    // If viewing current (null), we're already at the end
    if (viewingPartIndex === null || viewingPartIndex === undefined) {
      return;
    }

    const currentPart = storyData.scene.parts[viewingPartIndex];
    const currentStoryIndex = uniqueStoryParts.indexOf(currentPart);

    if (currentStoryIndex < uniqueStoryParts.length - 1) {
      const nextStoryPart = uniqueStoryParts[currentStoryIndex + 1];
      const newIndex = storyData.scene.parts.indexOf(nextStoryPart);

      // Check if this is the last story part - if so, set to null to show "current"
      if (currentStoryIndex + 1 === uniqueStoryParts.length - 1) {
        setViewingPartIndex(null);
      } else {
        setViewingPartIndex(newIndex);
      }

      setStoryText(nextStoryPart.content);
      setChoices({ choices: nextStoryPart.choices || [] });
    } else {
      // Moving to the end, return to current
      setViewingPartIndex(null);
      const lastPart = storyData.scene.parts[storyData.scene.parts.length - 1];
      setStoryText(lastPart.content);
      setChoices({ choices: lastPart.choices || [] });
    }
  }

  function resetToCurrentPart() {
    if (!storyData) return;
    setViewingPartIndex(null);
    const lastPart = storyData.scene.parts[storyData.scene.parts.length - 1];
    setStoryText(lastPart.content);
    setChoices({ choices: lastPart.choices || [] });
  }

  // Jump directly to a specific scene part index (used by chapter navigation).
  // Mirrors handleNavigateRight's "snap to current when landing on the last
  // part" behavior so jumping to the latest chapter re-enables live updates.
  function handleNavigateToIndex(index: number) {
    if (!storyData) return;
    const part = storyData.scene.parts[index];
    if (!part) return;

    const isLastPart = index === storyData.scene.parts.length - 1;
    setViewingPartIndex(isLastPart ? null : index);
    setStoryText(part.content);
    setChoices({ choices: part.choices || [] });
  }

  // Update canUndo and canRetry based on story state
  useEffect(() => {
    if (!storyData) return;

    const lastPart = storyData.scene.parts[storyData.scene.parts.length - 1];
    const hasAIPart = lastPart && !lastPart.user;

    // Can undo only if we actually have a pre-turn snapshot to restore -
    // otherwise the button would be honest-looking but silently unable to
    // revert mechanical state (NPCs, stats, combat, etc.), which is exactly
    // the bug this was rewritten to avoid. undoStackRef is a ref (not
    // state), but every push/pop site below also calls setStoryData or
    // setCanUndo directly afterward, so this effect re-reads a fresh value
    // whenever it matters.
    // An Observer revision is undoable without a snapshot - restoring the
    // GM's original draft only touches the scene part's own text/choices/GM
    // history, never mechanical state, so it doesn't need one.
    const hasObserverRevision = Boolean(
      hasAIPart && lastPart.observerRewriteOriginal,
    );

    setCanUndo(
      hasObserverRevision ||
        (storyData.scene.parts.length > 1 &&
          hasAIPart &&
          undoStackRef.current.length > 0),
    );

    // Can retry if we have at least 1 part and last part is from AI
    setCanRetry(storyData.scene.parts.length > 0 && hasAIPart);
  }, [storyData]);

  // Load story from database on mount - OFFLINE FIRST
  useEffect(() => {
    if (!storyId) {
      addNotification("No story ID provided", "failure");
      setLoadingStory(false);
      return;
    }

    // Skip re-fetching if we've already loaded this story (prevents reload on tab focus)
    if (hasLoadedStoryRef.current === storyId && storyData) {
      console.log(
        "Story already loaded, skipping re-fetch (tab focus protection)",
      );
      return;
    }

    // Helper to setup UI state from loaded story data
    function setupUIFromStory(loadedStoryData: StoryData) {
      // Mark this story as loaded to prevent re-fetching
      hasLoadedStoryRef.current = storyId;

      // Migrate AGMT state to include new performance tracking fields
      import("@/app/misc/mythicChaos").then(({ migrateAGMTState }) => {
        if (loadedStoryData.agmtState) {
          loadedStoryData.agmtState = migrateAGMTState(
            loadedStoryData.agmtState!,
          );
        }
      });

      // Backfill the arrays StoryData requires. Older saves can lack goals,
      // and a story started from a Designer-made adventure before the fix
      // was saved without the legacy stat-block arrays.
      ensureStoryDataArrays(loadedStoryData);

      // A story that runs a built-in system gains the system's notes added
      // since it started (Blood & Bone expansion, decision 156). Only adds;
      // a note the story holds or deleted is left alone.
      const addedBuiltin = addMissingBuiltinNotes(loadedStoryData);
      if (addedBuiltin > 0) {
        logger.info(
          `[Story Load] Added ${addedBuiltin} built-in note${addedBuiltin === 1 ? "" : "s"} from the story's system`,
        );
      }

      // A banner never survives a different story.
      setInterruptedTurn(null);
      interruptedTurnIdRef.current = null;
      // A record still here means the last turn never finished (the OS killed
      // the app mid-turn): cut the story back to before it and offer a retry.
      const interrupted = readInterruptedTurn(storyId!, Date.now());
      if (interrupted) {
        repairInterruptedStory(loadedStoryData, interrupted);
        setInterruptedTurn({ mode: interrupted.mode, text: interrupted.text });
        interruptedTurnIdRef.current = interrupted.turnId;
      }

      // Convert any legacy structured customTables into "table" notes. Runs
      // before processLoreTriggers so the new notes get their triggers
      // initialized on this same load rather than only on the next one.
      const migratedLore = migrateCustomTablesToNotes(
        loadedStoryData.lore,
        loadedStoryData.customTables,
      );
      if (migratedLore) {
        loadedStoryData.lore = migratedLore;
        loadedStoryData.customTables = [];
        console.log("[Story Load] Migrated custom tables to notes");
      }

      //ProcessLoretriggersonloadtoinitializeLorevisibility
      processLoreTriggers(loadedStoryData, addNotification, true);

      // Deduplicate memories on load (removes exact duplicates and very similar entries)
      if (loadedStoryData.memory && loadedStoryData.memory.length > 0) {
        const originalCount = loadedStoryData.memory.length;
        loadedStoryData.memory = deduplicateMemories(loadedStoryData.memory);
        const removedCount = originalCount - loadedStoryData.memory.length;
        if (removedCount > 0) {
          console.log(
            `[Story Load] Removed ${removedCount} duplicate memories`,
          );
        }
      }

      setStoryData(loadedStoryData);

      //Initializestoryifnopartsyet-showpresetselection
      if (loadedStoryData.scene.parts.length === 0) {
        if (hasPremadeCharacters(loadedStoryData)) {
          setShowPresetSelection(true);
        } else {
          startCustomPendingRef.current = true;
        }
        setLoadingStory(false);
        return true; // early return signal
      }

      //SetupUIstatefromloadedstory
      const lastPart =
        loadedStoryData.scene.parts[loadedStoryData.scene.parts.length - 1];
      setStoryText(lastPart.content);
      setChoices({ choices: lastPart.choices || [] });

      const inputs =
        lastPart.choices?.reduce(
          (acc, choice) => ({ ...acc, [choice.text]: false }),
          {} as Record<string, boolean>,
        ) || {};
      setInput(inputs);
      setStarted(true);
      return false;
    }

    async function loadStory() {
      try {
        const { getLocalStory, getUndoStack } = await import(
          "@/app/misc/localStoryManager"
        );
        const localStory = await getLocalStory(storyId!);

        if (!localStory) {
          throw new Error("Local story not found");
        }

        console.log("Local story loaded:", localStory);
        setStoryDbId(localStory.id);

        // Hydrate the undo/retry snapshot stack before setupUIFromStory
        // triggers the canUndo/canRetry effect below, so a page reload
        // doesn't leave Undo looking available while actually having
        // nothing to restore from.
        try {
          undoStackRef.current = await getUndoStack(localStory.id);
        } catch (undoStackError) {
          console.error("Failed to load undo stack", undoStackError);
          undoStackRef.current = [];
        }
        setSyncStatus("local-only");

        // Pictures nothing in the story points to any more (an undone or
        // retried turn leaves some) are swept on load (imageStore.ts).
        void import("@/app/misc/imageStore")
          .then(({ deleteOrphans, collectImageIds }) =>
            deleteOrphans(localStory.id, collectImageIds(localStory.storyData)),
          )
          .catch((sweepError) =>
            console.error("Picture sweep failed", sweepError),
          );

        if (setupUIFromStory(localStory.storyData)) return;
        setLoadingStory(false);
      } catch (error: any) {
        console.error("Error loading story:", error);
        addNotification(error.message || "Failed to load story", "failure");
        setLoadingStory(false);
      }
    }

    loadStory();
  }, [storyId, addNotification, reloadTick]);

  // A background sync writes straight to IndexedDB and has no way to update
  // this page's in-memory storyData on its own. If the sync actually
  // touched the stories bucket, force the load-story effect above to
  // re-fetch from IndexedDB by clearing the "already loaded" guard and
  // bumping reloadTick - otherwise this story's next autosave would
  // silently overwrite whatever the sync just merged in with the stale
  // in-memory copy.
  useEffect(() => {
    function handleSyncCompleted(event: Event) {
      const results = (event as CustomEvent<SyncResult[]>).detail;
      const storiesChanged = results?.some(
        (r) =>
          r.bucket === "stories" &&
          r.action === "merged" &&
          (r.added || r.updated || r.removed),
      );
      if (!storiesChanged) return;
      hasLoadedStoryRef.current = null;
      setReloadTick((t) => t + 1);
    }
    window.addEventListener(SYNC_COMPLETED_EVENT, handleSyncCompleted);
    return () =>
      window.removeEventListener(SYNC_COMPLETED_EVENT, handleSyncCompleted);
  }, []);

  // Deep-link auto-host / auto-join: the Library, home page, and
  // GuidedStoryStart wizard route here with extra query params instead of
  // making the player dig into Menu > Story Editor > Online Play manually.
  // Each runs at most once (guarded by the refs) since the query params
  // stay in the URL after being consumed.
  useEffect(() => {
    if (!storyData || loadingStory) return;
    const VALID_BACKENDS: MPBackend[] = ["torrent", "nostr", "mqtt", "peerjs"];
    const parseBackend = (value: string | null): MPBackend =>
      VALID_BACKENDS.includes(value as MPBackend) ? (value as MPBackend) : "torrent";

    const hostName = searchParams.get("hostName");
    const joinCode = searchParams.get("join");

    if (hostName && !autoHostAttemptedRef.current && !netSession) {
      autoHostAttemptedRef.current = true;
      const backend = parseBackend(searchParams.get("hostBackend"));
      const color = searchParams.get("hostColor") || DEFAULT_HOST_COLOR;
      router.replace(`/story?storyId=${storyId}`);
      createNetRoom(backend, hostName, color)
        .then(() => {
          addNotification(
            "Room created - share the code with your players",
            "success",
          );
          setAutoOpenOnlineSection(true);
          setMenuOpen(true);
        })
        .catch((error) => {
          addNotification(
            error instanceof Error ? error.message : "Failed to create room",
            "failure",
          );
        });
    }

    if (joinCode && !autoJoinAttemptedRef.current && !netSession) {
      autoJoinAttemptedRef.current = true;
      // Backend can be given as either joinBackend or a shorter `provider`
      // param (used in shareable invite links).
      const backend = parseBackend(
        searchParams.get("joinBackend") || searchParams.get("provider"),
      );
      const name = searchParams.get("joinName") || "Player";
      const color = searchParams.get("joinColor") || DEFAULT_JOIN_COLOR;
      pendingJoinNameRef.current = name;
      pendingJoinColorRef.current = color;
      router.replace(`/story?storyId=${storyId}`);
      // Connect first, then let the player pick/create a profile once the
      // host's roster arrives (presence_join is deferred until they claim one).
      setProfilePickerOpen(true);
      setProfilePickerConnecting(true);
      joinNetRoom(backend, joinCode, name, color).catch((error) => {
        setProfilePickerOpen(false);
        setProfilePickerConnecting(false);
        addNotification(
          error instanceof Error ? error.message : "Failed to join room",
          "failure",
        );
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storyData, loadingStory]);

  //Applypresetandstartstory
  const handlePresetSelect = async (preset: Preset) => {
    if (!storyData) return;
    logger.action("User selected preset", { preset: preset.name });

    const isCustom = preset.id === "custom";
    const updatedStoryData = { ...storyData };

    // Custom starts with no sheet: the GM builds it with the player in session
    // zero, from the adventure's template when it has one. A pre-made
    // character brings its own sheet.
    if (!isCustom) {
      // Add character sheet to lore if preset has one
      if (preset.characterSheet) {
        const characterSheetLore: StoryLore = {
          title: `${preset.name} - Character Sheet`,
          content: preset.characterSheet,
          relatedCharacters: [],
          relatedLocations: [],
          secrtet: false,
          keys: [],
          type: "character_sheet",
          on: true,
          on_triggers: [],
          off_triggers: [],
        };
        updatedStoryData.lore = [
          ...(updatedStoryData.lore || []),
          characterSheetLore,
        ];
      }
      if (preset.authorNotes)
        updatedStoryData.author_notes = preset.authorNotes;
    }

    // Every new adventure starts in session zero: the observer stays
    // suspended and start_game closes setup.
    updatedStoryData.sessionZeroActive = true;

    // Determine starting choices - use custom ones if available, otherwise default
    // Choices are now plain text only - GM stage handles all dice mechanics
    const startingChoices = updatedStoryData.starting_choices?.length
      ? updatedStoryData.starting_choices.map((sc) => ({
          text: sc.text,
          // Include intro_override so it can be used when this choice is selected
          intro_override: sc.intro_override,
        }))
      : [{ text: "Start Story" }];

    // The authored opening - the preset's own if it has one, else the
    // adventure's - waits for start_game, which hands it to the GM to play
    // after its briefing (decision 197). The first screen is a welcome.
    // (A starting choice's intro_override is separate: it is applied after the
    // player picks that choice.)
    updatedStoryData.intro = preset.intro || updatedStoryData.intro;
    const introContent = buildAdventureWelcome(updatedStoryData, preset);

    //Addstartingscenepart
    updatedStoryData.scene.parts.push({
      content: introContent,
      imageUrl: "",
      user: false,
      role: "assistant",
      choices: startingChoices,
    });

    //Updatestoryindatabasewithpresetapplied
    if (storyDbId) {
      try {
        const { saveLocalStory } = await import("@/app/misc/localStoryManager");
        updatedStoryData.selected_preset = preset.id;
        await saveLocalStory(storyDbId, updatedStoryData);
      } catch (error) {
        console.error("Error saving preset:", error);
      }
    }

    //Updatelocalstate
    setStoryData(updatedStoryData);
    setStoryText(introContent);
    setChoices({ choices: startingChoices });
    setInput({ StartStory: false });
    setStarted(true);
    setShowPresetSelection(false);

    if (!isCustom) {
      addNotification(
        `Character preset "${preset.name}" applied! ?`,
        "success",
      );
    }
  };

  // An adventure with no pre-made character skips the picker and starts as
  // Custom. setupUIFromStory only flags it: handlePresetSelect reads the
  // storyData and storyDbId state, which are set by the time this effect runs.
  useEffect(() => {
    if (!startCustomPendingRef.current || !storyData || !storyDbId) return;
    startCustomPendingRef.current = false;
    void handlePresetSelect(DEFAULT_PRESET);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storyData, storyDbId]);

  // Best-effort persist of the undo stack to IndexedDB so it survives a
  // reload - fire-and-forget like saveProgress's debounced writes below,
  // since losing the very latest push just degrades Undo/Retry back to "no
  // snapshot available" rather than corrupting any state.
  function persistUndoStack() {
    if (!storyDbId) return;
    import("@/app/misc/localStoryManager").then(({ saveUndoStack }) => {
      saveUndoStack(storyDbId, undoStackRef.current).catch((error) => {
        console.error("Failed to persist undo stack", error);
      });
    });
  }

  //Savestoryprogresstodatabase(debounced)
  async function saveProgress(
    updatedStoryData: StoryData,
    immediate = false,
  ): Promise<boolean> {
    if (!storyDbId) return false;

    //Clearexistingtimeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // If immediate, save now without debounce
    if (immediate) {
      return performSave(updatedStoryData);
    }

    // Debounce: Only save after 3 seconds of no activity
    saveTimeoutRef.current = setTimeout(() => {
      performSave(updatedStoryData);
    }, 3000); //3seconddebounce
    return false; // nothing is written yet
  }

  //Actualsavelogicisolated
  // Resolves true once the story is written, false when it was not (the error
  // is already reported); the turn wrapper uses it to decide "ready".
  async function performSave(updatedStoryData: StoryData): Promise<boolean> {
    if (!storyDbId) return false;

    try {
      logger.info("Saving story progress...");
      const { saveLocalStory } = await import("@/app/misc/localStoryManager");
      //Trimscenehistorybeforesavingtoreducedatasize
      const trimmedData = trimStoryData(updatedStoryData);

      // Log what we're saving
      const lastPartBeingSaved =
        trimmedData.scene.parts[trimmedData.scene.parts.length - 1];
      console.log("Saving local story - last part:", {
        user: lastPartBeingSaved?.user,
        role: lastPartBeingSaved?.role,
        choicesCount: lastPartBeingSaved?.choices?.length || 0,
        contentPreview: lastPartBeingSaved?.content.substring(0, 50),
      });

      await saveLocalStory(storyDbId, trimmedData);
      console.log("Local story saved successfully");
      const kept = keptTurnRecordRef.current;
      if (kept && kept.storyId === storyDbId) {
        clearTurn(kept.storyId, kept.turnId);
        keptTurnRecordRef.current = null;
      }
      return true;
    } catch (error) {
      console.error("Error saving progress:", error);
      addNotification(
        "Failed to save story progress. Please try again.",
        "failure",
      );
      return false;
    }
  }

  //Updatestorydatainstate
  function updateStoryData(updates: Partial<StoryData>) {
    if (!storyData) return;

    // If lore is being updated, mark embeddings as dirty (will sync on next generation)
    if (updates.lore) {
      updates.loreEmbeddingsDirty = true;
    }

    //Getcurrentmodelconfigfordynamicmemorycap
    const modelKey =
      typeof window !== "undefined"
        ? localStorage.getItem("aiModel") || "DeepSeek V4 Flash"
        : "DeepSeek V4 Flash";
    const modelConfig = getModelConfig(modelKey);

    // Dynamic memory cap: Reserve maxOutputTokens, then use 25% of remaining for memory
    const CHARS_PER_TOKEN = 4;
    const availableInputTokens =
      modelConfig.maxTokens - modelConfig.maxOutputTokens;
    const memory_cap = availableInputTokens * 0.25 * CHARS_PER_TOKEN;

    // Deduplicate memories (removes exact duplicates and very similar entries)
    storyData.memory = deduplicateMemories(storyData.memory);

    //Trimmemoryiftoolarge
    let totalMemoryLength = storyData.memory.reduce(
      (acc, entry) => acc + getMemoryContent(entry).length,
      0,
    );
    while (totalMemoryLength > memory_cap && storyData.memory.length > 0) {
      const removed = storyData.memory.shift();
      if (removed) {
        totalMemoryLength -= getMemoryContent(removed).length;
      }
    }
    const updatedStory = { ...storyData, ...updates };
    setStoryData(updatedStory);
  }

  // ---- Pictures made in play (imageJobs.ts, docs/image-generation-design.md) ----

  // ---- The background wave's late results (backgroundPatch.ts) ----------
  //
  // A judge's rewrite, the flags it could not fix, and what the memory,
  // director and progress layers changed all arrive after the player has the
  // turn, often after the next one has started. Each is a patch applied to the
  // CURRENT story (never a captured whole-story object) and only where the
  // part it names, by id, still exists holding the text it read.

  function patchCurrentStory(fn: (sd: StoryData) => StoryData): void {
    applyStoryPatch(buildPatchHost({ defer: true }), fn);
  }

  // The story a background result would land on, if it is still the one on
  // screen (the page can stay mounted while the player is on another story).
  function backgroundTargetStory(): StoryData | null {
    if (!mountedRef.current) return null;
    return turnLiveRef.current ?? storyDataRef.current;
  }

  function handleBackgroundObserverRewrite(patch: BackgroundRewritePatch): void {
    if (!mountedRef.current || !onScreenStory(storyDbId)) {
      // The page is gone, or showing another story: the stored story takes the
      // patch, if it still fits.
      patchCurrentStory((sd) => applyBackgroundRewrite(sd, patch));
      return;
    }
    const current = turnLiveRef.current ?? storyDataRef.current;
    const target = current ? backgroundRewriteTarget(current, patch) : null;
    if (!target) {
      logger.action("Observer rewrite dropped: its turn changed or is gone", {
        partId: patch.partId,
        type: patch.flag.type,
      });
      return;
    }
    patchCurrentStory((sd) => applyBackgroundRewrite(sd, patch));
    // The screen's current narration and choices follow only the newest turn.
    if (target === "newest") {
      setStoryText(patch.narration);
      if (patch.choices) setChoices({ choices: patch.choices });
    }
    logger.action("Observer rewrote narration in the background", {
      type: patch.flag.type,
      detail: patch.flag.detail,
      partId: patch.partId,
      totalFlags: patch.allFlags.length,
    });
    addNotification(
      `Narration revised: ${patch.flag.detail} Use "Undo revision" on that turn to keep the original.`,
      "warning",
    );
  }

  function handleBackgroundObserverFlags(
    flags: ObserverFlag[],
    partId: string,
  ): void {
    const target = onScreenStory(storyDbId) ? backgroundTargetStory() : null;
    patchCurrentStory((sd) => applyBackgroundFlags(sd, partId, flags));
    // Only tell the player about a turn that still exists on their screen.
    if (!target || applyBackgroundFlags(target, partId, flags) === target) return;
    addNotification(
      `GM response flagged: ${flags[0].detail} - use Edit to fix the text, or Retry to regenerate.`,
      "warning",
    );
  }

  function handleBackgroundLayersUpdate(delta: BackgroundLayersDelta): void {
    patchCurrentStory((sd) => applyBackgroundLayersDelta(sd, delta));
  }

  // How a result that settles after its turn writes to the story (three paths,
  // imagePatcher.ts): into the running turn's own object, into state plus a
  // save, or, once this page is gone, into the stored story. Pictures and the
  // background wave's late results (rewrites, flags, memory) share it, so none
  // of them ever republishes or saves an object it captured earlier.
  function onScreenStory(storyId: string | null): boolean {
    return storyId === null || currentStoryIdRef.current === storyId;
  }

  function buildPatchHost(opts: { defer?: boolean } = {}): PatchHost {
    // Captured now: this closure outlives the page when a story is left while
    // a picture paints or a judge decides.
    const patchStoryId = storyDbId;
    const host: PatchHost = {
      getLive: () => turnLiveRef.current,
      getState: () => storyDataRef.current,
      setState: (next) => {
        storyDataRef.current = next;
        setStoryData(next);
      },
      save: (next) => saveProgress(next),
      isMounted: () => mountedRef.current && onScreenStory(patchStoryId),
      ...(opts.defer && {
        defer: (fn: (sd: StoryData) => StoryData) => {
          patchQueueRef.current.push(host, fn);
          return true;
        },
      }),
      patchStored: (patch) => {
        if (!patchStoryId) return;
        void (async () => {
          try {
            const { getLocalStory, saveLocalStory } = await import(
              "@/app/misc/localStoryManager"
            );
            const stored = await getLocalStory(patchStoryId);
            if (!stored) return;
            const next = patch(stored.storyData);
            if (next !== stored.storyData) {
              await saveLocalStory(patchStoryId, next);
            }
          } catch (error) {
            logger.error("Could not file a late result on the stored story", {
              error: error instanceof Error ? error.message : String(error),
            });
          }
        })();
      },
    };
    return host;
  }

  // What the picture queue needs from this page. Pictures settle after the turn
  // that asked for them, so a job reads and writes the LATEST StoryData through
  // the ref and saves what it changed.
  function buildImageJobDeps(): ImageJobDeps {
    const host = buildPatchHost();
    return {
      keys: { falKey, deepInfraKey: deepinfraKey, openRouterKey },
      getSettings: getImageSettings,
      getStoryData: () => storyDataRef.current,
      patchStoryData: (fn) => applyStoryPatch(host, fn),
      onSettled: (_jobId: string, state: ImageJobState, req: ImageJobRequest) => {
        // A scene picture's card shows its own failure; a portrait has no card.
        if (req.target.kind === "scenePart") return;
        if (state.status === "declined") {
          addNotification("The image service declined that picture.", "warning");
        } else if (state.status === "failed" && state.message !== "Cancelled") {
          addNotification(`Picture failed: ${state.message}`, "failure");
        }
      },
    };
  }

  function imageSideCallKeys() {
    return pickProviderKeys(apiKeys);
  }

  // "Illustrate this" on the latest turn: a small side call writes what a
  // camera would see, then the picture goes on the same queue as the GM's.
  async function handleIllustrate(partIndex: number) {
    const sd = storyDataRef.current;
    if (!sd || !storyDbId || illustrating) return;
    const part = sd.scene.parts[partIndex];
    if (!part || part.user || !part.content.trim()) return;
    const deps = buildImageJobDeps();
    if (!pickImageProvider(getImageSettings(), deps.keys)) {
      addNotification(
        "Add a fal.ai, DeepInfra or OpenRouter key in Settings to make pictures.",
        "info",
      );
      return;
    }

    let partId = part.id;
    if (!partId) {
      // A turn from before pictures existed has no id yet; give it one now.
      const newId = crypto.randomUUID();
      partId = newId;
      deps.patchStoryData((current) => ({
        ...current,
        scene: {
          ...current.scene,
          parts: current.scene.parts.map((p, i) =>
            i === partIndex && !p.id ? { ...p, id: newId } : p,
          ),
        },
      }));
    }

    setIllustrating(true);
    addNotification("Painting a picture of this moment…", "info", 3000);
    try {
      const costTurnId = getActiveTurnId() ?? undefined;
      const featuring = findMentionedNpcIds(sd, part.content);
      const before = sd.scene.parts[partIndex - 1];
      const description = await writeSceneDescription(
        part.content,
        sd,
        { keys: imageSideCallKeys(), costTurnId },
        {
          // The player's looks go to the brief writer, which decides whether
          // they are in frame; the job's character lines stay the named NPCs.
          featuring: [...featuring, "player"],
          previous: before?.content,
        },
      );
      enqueueImageJob(
        {
          storyId: storyDbId,
          subject: "scene",
          description,
          featuring,
          target: { kind: "scenePart", partId },
          requestedBy: "player",
          costTurnId,
        },
        deps,
      );
    } catch (error) {
      logger.error("Illustrate this failed", {
        error: error instanceof Error ? error.message : String(error),
      });
      addNotification("Could not start that picture.", "failure");
    } finally {
      setIllustrating(false);
    }
  }

  // Retry / Regenerate on a scene card: runs the saved prompt again under the
  // same id, or, on a device that holds no picture, rebuilds one from the
  // description the turn kept.
  async function handleRegenerateImage(partIndex: number, ref: SceneImageRef) {
    const sd = storyDataRef.current;
    if (!sd || !storyDbId) return;
    const part = sd.scene.parts[partIndex];
    if (!part?.id) return;
    const stored = await getImage(ref.imageId).catch(() => null);
    const description = ref.description ?? "";
    if (!stored && !description) {
      addNotification("There is nothing saved to regenerate that picture from.", "info");
      return;
    }
    const deps = buildImageJobDeps();
    if (!pickImageProvider(getImageSettings(), deps.keys)) {
      addNotification(
        "Add a fal.ai, DeepInfra or OpenRouter key in Settings to make pictures.",
        "info",
      );
      return;
    }
    enqueueImageJob(
      {
        storyId: storyDbId,
        subject: stored?.subject ?? "scene",
        description,
        featuring: [],
        target: { kind: "scenePart", partId: part.id },
        requestedBy: "player",
        costTurnId: getActiveTurnId() ?? undefined,
        reuseId: ref.imageId,
        finalPrompt: stored?.prompt,
      },
      deps,
    );
  }

  // "Make portrait" / "Replace" on an NPC.
  async function handleMakeNpcPortrait(npcId: string) {
    const sd = storyDataRef.current;
    if (!sd || !storyDbId) return;
    const npc = sd.npcs?.find((n) => n.id === npcId);
    if (!npc) return;
    const deps = buildImageJobDeps();
    if (!pickImageProvider(getImageSettings(), deps.keys)) {
      addNotification(
        "Add a fal.ai, DeepInfra or OpenRouter key in Settings to make pictures.",
        "info",
      );
      return;
    }
    addNotification(`Painting a portrait of ${npc.name}…`, "info", 3000);
    const costTurnId = getActiveTurnId() ?? undefined;
    const notes = [npc.description, npc.role, npc.faction]
      .filter((s): s is string => !!s && !!s.trim())
      .join("\n");
    const description = await writePortraitDescription(npc.name, notes, {
      keys: imageSideCallKeys(),
      costTurnId,
    });
    enqueueImageJob(
      {
        storyId: storyDbId,
        subject: "npc",
        description,
        featuring: [],
        target: { kind: "npc", npcId },
        requestedBy: "player",
        costTurnId,
        // Replacing: keep the old portrait on screen until the new one lands.
        skipInitialAttach: !!npc.portraitImageId,
      },
      deps,
    );
  }

  // "Make portrait" on the character sheet, from the character_sheet note.
  async function handleMakePlayerPortrait() {
    const sd = storyDataRef.current;
    if (!sd || !storyDbId) return;
    const deps = buildImageJobDeps();
    if (!pickImageProvider(getImageSettings(), deps.keys)) {
      addNotification(
        "Add a fal.ai, DeepInfra or OpenRouter key in Settings to make pictures.",
        "info",
      );
      return;
    }
    const sheet = sd.lore?.find(
      (l) => l.type === "character_sheet" && l.content?.trim(),
    );
    const name = sd.player_name?.trim() || "The player character";
    addNotification(`Painting a portrait of ${name}…`, "info", 3000);
    const costTurnId = getActiveTurnId() ?? undefined;
    const description = await writePortraitDescription(
      name,
      sheet?.content ?? sd.premise ?? "",
      { keys: imageSideCallKeys(), costTurnId },
    );
    enqueueImageJob(
      {
        storyId: storyDbId,
        subject: "player",
        description,
        featuring: [],
        target: { kind: "player" },
        requestedBy: "player",
        costTurnId,
        skipInitialAttach: !!sd.playerPortraitImageId,
      },
      deps,
    );
  }

  // Whether the Illustrate / Make portrait buttons can run: a key for some provider.
  const canMakePictures =
    !!storyDbId &&
    !!pickImageProvider(getImageSettings(), {
      falKey,
      deepInfraKey: deepinfraKey,
      openRouterKey,
    });

  // ---- Networked multiplayer: collect-all-then-generate + party voice ----

  // Display name for a connected seat, from the persisted couch-player roster.
  function resolveSeatName(id: string): string {
    const player = storyData?.multiplayer?.couchPlayers?.find((c) => c.id === id);
    return player?.name || "Player";
  }

  // Every seat the host waits on this round: the host itself plus every
  // currently-connected guest. Deduped and stable.
  function expectedSeatIds(): string[] {
    if (!netSession) return [];
    return Array.from(
      new Set([netSession.myLocalPlayerId, ...netPeers.map((p) => p.localPlayerId)]),
    );
  }

  function buildTurnStatus(phase: "collecting" | "generating"): TurnStatus {
    return {
      phase,
      submittedPlayerIds: batchSubmittedIds(turnBatchRef.current),
      passedPlayerIds: batchPassedIds(turnBatchRef.current),
      expectedPlayerIds: expectedSeatIds(),
    };
  }

  function broadcastCollectionLobby(): void {
    const status = buildTurnStatus("collecting");
    setTurnLobby(status);
    broadcastNetTurnStatus(status);
  }

  // Host-only: buffer one seat's submission, then fire the combined turn once
  // everyone has responded (or keep waiting and update the lobby).
  function recordSeatInput(input: BatchedInput): void {
    if (netSession?.role !== "host") return;
    recordInput(turnBatchRef.current, input);
    if (isBatchReady(turnBatchRef.current, expectedSeatIds())) {
      startBatchedTurn();
    } else {
      broadcastCollectionLobby();
    }
  }

  // Host-only: aggregate every buffered submission into a single user turn and
  // generate once. Reused by the auto-fire path and the "Start now" override.
  function startBatchedTurn(): void {
    if (netSession?.role !== "host") return;
    // A turn is still finishing (its save, a late result): keep the batch so
    // the table's inputs are not lost, and let the host start it again.
    if (turnInFlightRef.current) {
      addNotification("A turn is still finishing", "warning");
      return;
    }
    const aggregated = aggregateBatch(turnBatchRef.current, expectedSeatIds());
    clearBatch(turnBatchRef.current);
    setTurnLobby(null);
    broadcastNetTurnStatus(buildTurnStatus("generating"));
    if (!aggregated) {
      // Everyone passed - nothing to narrate. Drop back to collecting.
      addNotification("Everyone passed - nothing to narrate yet", "warning");
      return;
    }
    runningBatchedTurnRef.current = true;
    void handleCustomInput(
      aggregated.content,
      undefined,
      aggregated.speakerIds,
      "freeform",
      true,
    ).finally(() => {
      runningBatchedTurnRef.current = false;
    });
  }

  // Host-only: force the turn to start now with whatever's collected, without
  // waiting on stragglers.
  function hostForceStartTurn(): void {
    if (netSession?.role !== "host") return;
    if (batchSubmittedIds(turnBatchRef.current).length === 0) {
      addNotification("No one has submitted anything yet", "warning");
      return;
    }
    startBatchedTurn();
  }

  // The local player passes this round (host records directly; a guest sends a
  // pass over the wire and shows the waiting lobby).
  function passThisRound(): void {
    if (!netSession) return;
    if (netSession.role === "host") {
      recordSeatInput({
        playerId: netSession.myLocalPlayerId,
        name: resolveSeatName(netSession.myLocalPlayerId),
        kind: "pass",
        text: null,
        choiceIndex: null,
      });
    } else {
      sendNetPass();
    }
  }

  // ---- Party-voice floor (host-authoritative arbitration) ----

  function pushFloorState(): void {
    if (netSession?.role !== "host") return;
    const now = Date.now();
    pruneLockouts(floorRef.current, now);
    const snap: FloorSnapshot = {
      holderId: floorRef.current.holderId,
      lockedOutIds: floorLockedOutIds(floorRef.current, now),
    };
    setFloorSnapshot(snap);
    broadcastNetFloorState(snap);
    scheduleFloorPrune();
  }

  // Re-broadcast the floor when the soonest lockout expires, so a just-freed
  // player's bubble unlocks for everyone without needing a fresh action.
  function scheduleFloorPrune(): void {
    if (floorPruneTimerRef.current) {
      clearTimeout(floorPruneTimerRef.current);
      floorPruneTimerRef.current = null;
    }
    const locks = [...floorRef.current.lockouts.values()];
    if (locks.length === 0) return;
    const delay = Math.max(0, Math.min(...locks) - Date.now()) + 50;
    floorPruneTimerRef.current = setTimeout(() => pushFloorState(), delay);
  }

  function hostHandleFloorTake(playerId: string): void {
    if (netSession?.role !== "host") return;
    if (takeFloor(floorRef.current, playerId, Date.now()).changed) pushFloorState();
  }

  function hostHandleFloorRelease(playerId: string): void {
    if (netSession?.role !== "host") return;
    if (releaseFloor(floorRef.current, playerId).changed) pushFloorState();
  }

  // Called by PlayerBubbles when the local player grabs / releases the mic.
  // Host arbitrates locally; a guest asks the host over the wire.
  function requestFloorTake(): void {
    if (!netSession) return;
    if (netSession.role === "host") hostHandleFloorTake(netSession.myLocalPlayerId);
    else sendNetFloorTake();
  }

  function requestFloorRelease(): void {
    if (!netSession) return;
    if (netSession.role === "host") hostHandleFloorRelease(netSession.myLocalPlayerId);
    else sendNetFloorRelease();
  }

  // The strip's two buttons: one host-owned step that sets setup.mode and sends
  // the player line, through the same path typed input takes.
  function handleChooseSetupStyle(mode: "quick" | "full"): void {
    if (turnInFlightRef.current || loading || netSession?.role === "guest") return;
    void handleCustomInput(
      SETUP_STYLE_LINES[mode],
      undefined,
      undefined,
      "freeform",
      false,
      mode,
    );
  }

  async function handleCustomInput(
    customText: string,
    playerComment?: string,
    speakerIds?: string[],
    inputKind: "freeform" | "voice" = "freeform",
    // Set by startBatchedTurn so the aggregated turn actually generates instead
    // of being re-buffered by the host collect-all guard below.
    bypassBatch: boolean = false,
    // Session zero's style choice (the strip's buttons). Typing before a style
    // is chosen means quick. It is written to the story object this turn
    // generates from, so the mode and the turn cannot disagree.
    setupMode?: "quick" | "full",
  ) {
    if (!storyData) return;
    // One turn at a time, held until the outer onComplete (turnLock.ts): an
    // action sent while a blocking judge decides could be discarded by its
    // rollback.
    if (turnInFlightRef.current) return;

    const modeToSet =
      netSession?.role === "guest"
        ? undefined
        : (setupMode ??
          (storyData.sessionZeroActive && !storyData.setup?.mode
            ? "quick"
            : undefined));

    // Host in a networked room: don't generate on the host's own submit -
    // buffer it and wait for the rest of the table (see recordSeatInput).
    if (netSession?.role === "host" && !bypassBatch) {
      if (modeToSet) {
        storyData.setup = {
          ...storyData.setup,
          mode: modeToSet,
          premadeFor: premadePlayerIds(storyData, setupRoster()),
        };
      }
      recordSeatInput({
        playerId: netSession.myLocalPlayerId,
        name: resolveSeatName(netSession.myLocalPlayerId),
        kind: inputKind,
        text: customText,
        choiceIndex: null,
      });
      return;
    }

    // Snapshot full state before this turn's GM tool calls can mutate it -
    // same undo/retry stack handleChoiceWithAction pushes onto, so a
    // freeform/voice action is just as undoable/rerollable as a plain
    // choice. Previously only handleChoiceWithAction did this, so Undo
    // after a freeform action silently fell back to a scene.parts-only
    // pop that left mechanical state (NPCs, stats, combat, etc.) intact.
    try {
      const snapshot = structuredClone(storyData);
      undoStackRef.current = [...undoStackRef.current, snapshot].slice(
        -MAX_UNDO_STACK_SIZE,
      );
      persistUndoStack();
    } catch (snapshotError) {
      console.error("Failed to snapshot pre-turn state for undo", snapshotError);
    }

    if (netSession?.role === "guest") {
      logger.action("Guest custom input, sending to host", { customText });
      setLoading(true);
      setLoadingStage("story");
      setStoryTextReady(false);
      if (inputKind === "voice") {
        sendNetVoice(customText, speakerIds ?? []);
      } else {
        sendNetFreeform(customText, speakerIds);
      }
      return;
    }

    logger.action("User custom input", { customText });

    if (modeToSet) {
      // A sheet that exists now is a pre-made character: its owner skips the
      // per-character steps.
      storyData.setup = {
        ...storyData.setup,
        mode: modeToSet,
        premadeFor: premadePlayerIds(storyData, setupRoster()),
      };
    }

    // Physical dice mode: record who this turn belongs to, so a
    // formula_roll during it can be relayed to a specific connected guest
    // instead of thrown on the host's own device - see requestDiceThrow.
    currentTurnSpeakerIdsRef.current = speakerIds;

    setLoading(true);
    setLoadingStage("story");
    setStoryTextReady(false);

    //Adduser'scustominputtoscene
    // Couch co-op (StoryComposer) and voice (PlayerBubbles) submissions
    // already format their own "> Name: text" line(s) before calling us -
    // only bare freeform text (no leading ">") still needs one added here.
    // Prepending unconditionally double-prefixed those turns as ">> Name:
    // ...", which read as a duplicated line to both the player and the GM.
    let customContent = customText.startsWith(">")
      ? customText
      : ">" + customText;
    if (inputKind === "voice") {
      customContent += "\n[Voice Input - may contain transcription errors]";
    }
    // Where an interrupted turn is cut back to (interruptedTurn.ts): before
    // the player's line goes in.
    const partsBeforeTurn = storyData.scene.parts.length;
    storyData.scene.parts.push({
      content: customContent,
      imageUrl: "",
      user: true,
      role: "user",
      playerComment: playerComment?.trim() ? playerComment.trim() : undefined,
      speakerIds: speakerIds && speakerIds.length > 0 ? speakerIds : undefined,
      choices: [],
    });

    setChoices({ choices: [] });

    // Director-layer spotlight tracking: reset the speaking player(s)'
    // turns-since-spoken counter to 0, tick everyone else's up. No-op for
    // single-player stories (couchPlayers.length <= 1).
    if (
      speakerIds &&
      speakerIds.length > 0 &&
      (storyData.multiplayer?.couchPlayers?.length ?? 0) > 1
    ) {
      const focus = { ...(storyData.multiplayer!.couchPlayerFocus || {}) };
      for (const player of storyData.multiplayer!.couchPlayers!) {
        focus[player.id] = speakerIds.includes(player.id)
          ? 0
          : (focus[player.id] || 0) + 1;
      }
      storyData.multiplayer = {
        ...storyData.multiplayer!,
        couchPlayerFocus: focus,
      };

      // Player modeling (PaSSAGE-inspired): classify this player's own
      // freeform input by keyword and bump their style counter. Read by
      // selectDirectorMove to break close spotlight-selection ties toward
      // whichever neglected player's style best fits the current scene,
      // rather than picking arbitrarily among similarly-overdue players.
      const style = classifyPlayerStyle(customText);
      if (style) {
        const styleCounts = {
          ...(storyData.multiplayer!.playerStyleCounts || {}),
        };
        for (const speakerId of speakerIds) {
          const current = styleCounts[speakerId] || {
            action: 0,
            social: 0,
            tactical: 0,
          };
          styleCounts[speakerId] = {
            ...current,
            [style]: current[style] + 1,
          };
        }
        storyData.multiplayer = {
          ...storyData.multiplayer!,
          playerStyleCounts: styleCounts,
        };
      }
    }

    //ProcessLoretriggersafteruserinput
    processLoreTriggers(storyData, addNotification);

    const { storyModel, toolsModel, choicesModel } = getModelsFromPreset();
    const toolCallingEnabled = true;

    logger.ai_request("Starting generation (custom input)", {
      storyModel,
      toolsModel,
      choicesModel,
      toolCallingEnabled,
    });

    // Track partial scene part as we stream
    let partialPart: ScenePart = {
      content: "",
      imageUrl: "",
      user: false,
      role: "assistant",
      choices: [],
      // So a picture asked for during this turn can find the part (imageJobs.ts).
      id: crypto.randomUUID(),
    };

    // Set by onStoryStart (see GenerationCallbacks.onStoryStart) - true when
    // the GM's own last round wrote the prose, meaning the live timeline has
    // already streamed it and the single onStoryContent that follows must not
    // append it again.
    let narratedByGMStage = false;

    try {
      const maxToolLoops =
        typeof window !== "undefined"
          ? parseInt(localStorage.getItem("maxToolLoops") || "10", 10)
          : 10;
      const customMaxContext =
        typeof window !== "undefined"
          ? parseInt(localStorage.getItem("customMaxContext") || "36000", 10)
          : 36000;
      const customMaxOutput =
        typeof window !== "undefined"
          ? parseInt(localStorage.getItem("customMaxOutput") || "8000", 10)
          : 8000;
      const embeddingsEnabled =
        typeof window !== "undefined"
          ? localStorage.getItem("embeddingsEnabled") === "true"
          : false;
      const embeddingThreshold =
        typeof window !== "undefined"
          ? parseFloat(localStorage.getItem("embeddingThreshold") || "0.25")
          : 0.25;
      const usePrefill =
        typeof window !== "undefined"
          ? localStorage.getItem("usePrefill") !== "false"
          : true;
      const storytellerMode =
        typeof window !== "undefined"
          ? (localStorage.getItem("storytellerMode") as "narrator" | "dm") ||
            "narrator"
          : "narrator";
      const deAiifyWords =
        typeof window !== "undefined"
          ? localStorage.getItem("deAiifyWords") !== "false"
          : true;
      const replyLength =
        typeof window !== "undefined"
          ? (localStorage.getItem("replyLength") as
              | "short"
              | "medium"
              | "long") || "medium"
          : "medium";
      // GM Stage is always enabled - legacy tool calling is deprecated
      const gmStageEnabled = true;

      // Track parallel completion of tools and choices. Tool calls now run
      // inside the GM stage itself (before narration even starts) rather
      // than as a separate async stage, so there's nothing left for
      // onToolsComplete (a leftover pre-GM-stage callback) to ever fire -
      // treat tools as already done instead of waiting on a callback that
      // never comes, which used to strand loadingStage/the loading UI until
      // the whole turn (including the Observer's blocking check) resolved.
      let toolsComplete = true;
      let choicesComplete = !storyData.autoGenerateChoices;

      const holdNarrationForJudge = shouldHoldNarrationForJudge(
        getObserverSettings(),
      );
      const checkBothComplete = () => {
        // Stage callbacks never release the turn lock (turnLock.ts): the outer
        // onComplete does, after a blocking judge has decided.
        if (toolsComplete && choicesComplete && !holdNarrationForJudge) {
          setStoryTextReady(true);
        }
      };

      // Create abort controller for this generation
      generationAbortRef.current = new AbortController();

      await generateTrackedTurn(
        { mode: "new", text: customText, partsBefore: partsBeforeTurn },
        storyData,
        "", // Custom input already in storyData.scene.parts
        {
          storyModel,
          toolsModel,
          choicesModel,
          enableTools: toolCallingEnabled,
          maxToolLoops,
          customMaxContext: customMaxContext > 0 ? customMaxContext : undefined,
          customMaxOutput: customMaxOutput > 0 ? customMaxOutput : undefined,
          // Suggested-action chips are opt-in - see BasicSettings.tsx
          // "Suggested Choices" toggle (StoryData.autoGenerateChoices).
          skipChoices: !storyData.autoGenerateChoices,
          openRouterKey,
          deepseekKey,
          googleKey,
          mistralKey,
          deepinfraKey,
          zaiKey,
          storyId: storyDbId || undefined,
          enableEmbeddings: embeddingsEnabled,
          embeddingThreshold,
          samplingSettings: getSamplingSettings(),
          usePrefill,
          storytellerMode,
          deAiifyWords,
          replyLength,
          enableGMStage: gmStageEnabled,
          gmStageModel: toolsModel, // Use same model as tools stage
          abortSignal: generationAbortRef.current.signal,
          setupPlayers: setupRoster(),
          imageJobDeps: buildImageJobDeps(),
          scenePartId: partialPart.id,
        },
        {
          onGMStageStart: () => {
            setLoadingStage("gm");
            setLiveGMEntries([]);
            setLiveNarrationText("");
            setLiveReasoningTier(null);
            logger.action("GM stage started (custom input)");
          },
          onReasoningTierResolved: (resolved) => setLiveReasoningTier(resolved),
          onAskForRoll: requestManualRoll,
          onAskQuestion: requestPlayerAnswer,
          onRequestSetupConfirmation: requestSetupConfirmation,
          onRequestDiceThrow:
            storyData?.diceMode === "physical" ? requestDiceThrow : undefined,
          onCompaction: (summary) => {
            addNotification(
              "Recap: earlier events were condensed into a summary to save space",
              "info",
              6000,
            );
            logger.action("Story history compacted", {
              summaryLength: summary.length,
            });
          },
          onLiveNarrationUpdate: (visibleTextSoFar) => {
            setLiveNarrationText(visibleTextSoFar);
          },
          onGMContent: (delta, fullContent) => {
            // Re-parse the current round's buffer into thinking/text blocks
            // (see turnTimeline.ts) - earlier rounds stay frozen behind
            // their tool-call block.
            setLiveGMEntries((prev) => updateLiveRoundBlocks(prev, fullContent));
          },
          onGMReasoning: (delta, fullReasoning) => {
            setLiveGMEntries((prev) =>
              updateLiveReasoningBlock(prev, fullReasoning),
            );
          },
          onGMToolResult: (result) => {
            setLiveGMEntries((prev) => [
              ...freezeBlocks(prev),
              toolResultBlock(result),
            ]);
          },
          onGMStageComplete: (gmResults, storyContext, usage, thinking) => {
            logger.ai_response("GM stage complete (custom input)", {
              toolCount: gmResults.length,
              contextLength: storyContext.length,
              thinkingLines: thinking?.length || 0,
              usage,
            });
            // Freeze, don't clear. Clearing wiped the entire live timeline -
            // the thought/tool pills AND the prose the GM had just streamed -
            // the moment the GM stage ended, which collapsed the message back
            // to story.tsx's "Thinking..." placeholder (it renders whenever
            // the timeline is empty and the turn is still loading) and left it
            // there for the whole observer pass. The blocks stay put now; the
            // story stage only appends when it has text of its own to add.
            setLiveGMEntries((prev) => freezeBlocks(prev));

            // Player modeling (PaSSAGE-inspired), second signal: classify
            // this turn's actual GM tool-call activity (what happened),
            // independent of the freeform-text classification already
            // applied above (what the player typed). Blended into the same
            // counters - two independent deterministic signals give a
            // richer read than freeform text alone, especially for players
            // who speak briefly but trigger a lot of tool activity.
            if (
              speakerIds &&
              speakerIds.length > 0 &&
              (storyData.multiplayer?.couchPlayers?.length ?? 0) > 1
            ) {
              const toolStyle = classifyToolActivityStyle(
                gmResults.map((r) => r.toolName),
              );
              if (toolStyle) {
                const styleCounts = {
                  ...(storyData.multiplayer!.playerStyleCounts || {}),
                };
                for (const speakerId of speakerIds) {
                  const current = styleCounts[speakerId] || {
                    action: 0,
                    social: 0,
                    tactical: 0,
                  };
                  styleCounts[speakerId] = {
                    ...current,
                    [toolStyle]: current[toolStyle] + 1,
                  };
                }
                storyData.multiplayer = {
                  ...storyData.multiplayer!,
                  playerStyleCounts: styleCounts,
                };
              }
            }

            // Store GM results in the partial part (keeps all results including errors)
            if (gmResults.length > 0) {
              partialPart.gmToolCalls = gmResults;
            }
            if (storyContext) {
              partialPart.gmStoryContext = storyContext;
            }
            if (thinking && thinking.length > 0) {
              partialPart.gmThinking = thinking;
            }

            // Extract NPC reactions from GM results and show as toast notifications
            const npcReactionResults = gmResults.filter(
              (r) => r.toolName === "npc_reaction",
            );
            if (npcReactionResults.length > 0) {
              const newReactions = npcReactionResults
                .map((r) => (r.result as GMNPCReactionResult)?.reaction)
                .filter((r): r is NPCReaction => r !== undefined);

              if (newReactions.length > 0) {
                setPendingNPCReactions((prev) => [...prev, ...newReactions]);
                if (!partialPart.npcReactions) {
                  partialPart.npcReactions = [];
                }
                partialPart.npcReactions.push(...newReactions);
              }
            }

            setLoadingStage("story");
          },
          onStoryStart: (narratedByGM) => {
            narratedByGMStage = narratedByGM;
          },
          onStoryReasoning: (delta, fullReasoning) => {
            setLiveGMEntries((prev) =>
              updateLiveReasoningBlock(prev, fullReasoning),
            );
          },
          onStoryContent: (chunk: string, fullContent: string) => {
            // Update partial part as content streams
            partialPart.content = fullContent;

            // Only add to scene once (when we first get content)
            if (
              storyData.scene.parts[storyData.scene.parts.length - 1] !==
              partialPart
            ) {
              storyData.scene.parts = [...storyData.scene.parts, partialPart];
            }

            setStoryText(fullContent);
            // Don't call setStoryData here - it causes infinite loops during rapid streaming
            // storyText is sufficient for display, full update happens in onStoryComplete
            // Fallback story stage (GM stage narrated nothing itself) - append as a
            // trailing streaming text block after the GM's thinking/tool blocks.
            // Skipped when the GM narrated inline: that prose is already in the
            // timeline (streamed via onGMContent), so appending the whole thing
            // again would show the turn twice.
            if (!narratedByGMStage) {
              setLiveGMEntries((prev) => appendStreamingText(prev, fullContent));
            }
            setLoading(false); // Let player read while tools/choices generate
            setPendingUserChoice(""); // Clear pending choice - response is here
          },
          onStoryComplete: (content: string, usage: any) => {
            setLiveGMEntries((prev) => freezeBlocks(prev));
            // Update the partial part with the cleaned content (strips [GM State Update] etc)
            partialPart.content = content;
            setStoryText(content);
            setStoryData({ ...storyData }); // Full update only at completion
            // Narration itself is done - unlock TTS now rather than waiting
            // for the tools/choices phase below to also finish. Unless a judge
            // may still rewrite it: then read-aloud waits for the outer
            // onComplete (turnLock.ts shouldHoldNarrationForJudge).
            if (!holdNarrationForJudge) setStoryTextReady(true);

            // Tools and choices run in parallel after story - no separate loading stage
            logger.ai_response("Story narration complete (custom input)", {
              length: content.length,
              usage,
            });
          },
          onToolsStart: () => {
            // Keep showing tools stage while either is running
          },
          onToolsComplete: (toolCalls, toolResponses, stateChanges, usage) => {
            // Update the last part with tool data including stateChanges
            const lastPartIndex = storyData.scene.parts.length - 1;
            if (lastPartIndex >= 0) {
              storyData.scene.parts[lastPartIndex] = {
                ...storyData.scene.parts[lastPartIndex],
                toolCalls,
                toolResponses,
                stateChanges:
                  stateChanges.length > 0 ? stateChanges : undefined,
              };
            }

            // Notify player of quest changes
            processQuestNotifications(toolResponses, addNotification);

            setStoryData({ ...storyData });
            toolsComplete = true;
            checkBothComplete();

            logger.ai_response("Tools complete (custom input)", {
              toolCallsCount: toolCalls.length,
              responsesCount: toolResponses.length,
              stateChangesCount: stateChanges.length,
              usage,
            });
          },
          onChoicesStart: () => {
            // Keep showing tools stage while either is running
          },
          onChoicesComplete: (newChoices, usage) => {
            // Update the last part with choices
            const lastPartIndex = storyData.scene.parts.length - 1;
            if (lastPartIndex >= 0) {
              storyData.scene.parts[lastPartIndex] = {
                ...storyData.scene.parts[lastPartIndex],
                choices: newChoices,
              };
            }

            setChoices({ choices: newChoices });
            setStoryData({ ...storyData });
            choicesComplete = true;
            checkBothComplete();

            logger.ai_response("Choices complete (custom input)", {
              choicesCount: newChoices.length,
              usage,
            });
          },
          onObserverRewrite: (
            flags,
            triggeringFlag,
            rewrittenNarration,
            original,
          ) => {
            handleObserverRewrite(
              storyData,
              partialPart,
              flags,
              triggeringFlag,
              rewrittenNarration,
              original,
              setStoryText,
              setStoryData,
              addNotification,
            );
          },
          onSceneImageRequested: (ref) => {
            // The GM asked for a picture of this turn; the part is still being
            // built, so the card's ref goes on it here (the picture itself
            // settles in the background, see imageJobs.ts).
            partialPart.images = [...(partialPart.images ?? []), ref];
          },
          onObserverReset: (flags, triggeringFlag) => {
            handleObserverReset(
              partialPart,
              flags,
              triggeringFlag,
              setStoryText,
              setLiveGMEntries,
              setLoadingStage,
              addNotification,
            );
          },
          onBackgroundObserverFlags: handleBackgroundObserverFlags,
          onBackgroundObserverRewrite: handleBackgroundObserverRewrite,
          onBackgroundLayersUpdate: handleBackgroundLayersUpdate,
          onComplete: (result) => {
            if (result.meta.totalTokenCost) {
              addNotification(
                `Used ${result.meta.totalTokenCost} tokens`,
                "success",
              );
            }

            // Copy gmConversation from result.scenePart to the last scene part
            // This preserves the full GM conversation history for future context
            const lastIdx = storyData.scene.parts.length - 1;
            if (lastIdx >= 0 && result.scenePart?.gmConversation) {
              storyData.scene.parts[lastIdx] = {
                ...storyData.scene.parts[lastIdx],
                gmConversation: result.scenePart.gmConversation,
              };
            }

            // Copy the story stage's own native reasoning too - it streams
            // live via onStoryReasoning, but without this it never reaches
            // the persisted part, so it vanishes once the live timeline
            // hands off to the saved one (turnTimeline.ts:buildSavedTimeline).
            if (lastIdx >= 0 && result.scenePart?.reasoning) {
              storyData.scene.parts[lastIdx] = {
                ...storyData.scene.parts[lastIdx],
                reasoning: result.scenePart.reasoning,
                reasoning_details: result.scenePart.reasoning_details,
              };
            }

            // Copy the reasoning tier that adjudicated this turn (see
            // generation.ts:reasoningTierRanThisTurn) - undefined on the
            // retry path, which reuses a precomputed GM conversation and
            // never re-runs the tier router.
            if (lastIdx >= 0 && result.scenePart?.reasoningTier !== undefined) {
              storyData.scene.parts[lastIdx] = {
                ...storyData.scene.parts[lastIdx],
                reasoningTier: result.scenePart.reasoningTier,
                reasoningTierModelKey: result.scenePart.reasoningTierModelKey,
                reasoningTierEffort: result.scenePart.reasoningTierEffort,
              };
            }

            // Copy and surface consistency-check warnings (§2.5 state-error
            // path, see docs/research-paper-ttrpg-theory-gap-analysis.md).
            // checkNarrationConsistency runs after streaming completes, so
            // these previously only reached storyData via result.scenePart -
            // they were never actually shown to the player, only visible in
            // the ContextViewer debug panel. Surfacing them as a notification
            // (with the fix already one click away via Edit + Retry, both of
            // which already exist) is what actually connects the pieces.
            if (lastIdx >= 0 && result.scenePart?.consistencyWarnings?.length) {
              storyData.scene.parts[lastIdx] = {
                ...storyData.scene.parts[lastIdx],
                consistencyWarnings: result.scenePart.consistencyWarnings,
              };
              // No toast: a deterministic name-matching check is diagnostic
              // (judge-layer design 3.10). The warning stays on the part for
              // the context viewer and went to the Debug Logs when it fired.
            }

            // Layer 5 observer flags (see observer.ts) that survived to this
            // accepted turn - either minor, or major but the automatic reset
            // budget was already spent (onObserverReset fired earlier this
            // turn for those attempts). Same posture as consistencyWarnings
            // above: surface it, let the player Edit/Retry manually.
            if (lastIdx >= 0 && result.scenePart?.observerFlags?.length) {
              storyData.scene.parts[lastIdx] = {
                ...storyData.scene.parts[lastIdx],
                observerFlags: result.scenePart.observerFlags,
              };
              addNotification(
                `GM response flagged: ${result.scenePart.observerFlags[0].detail} - use Edit to fix the text, or Retry to regenerate.`,
                "warning",
              );
            }

            // Flags that the observer already fixed via a same-turn rewrite
            // (see observer.ts's buildObserverCorrectionNote) - GM-facing
            // only, never shown to the player, same posture as
            // storyProgressNote/repetitionNote/knowledgeNote. Carried so the
            // next turn's prompt still tells the GM a correction was needed
            // here, even though this turn's own narration already reads clean.
            if (lastIdx >= 0 && result.scenePart?.correctedObserverFlags?.length) {
              storyData.scene.parts[lastIdx] = {
                ...storyData.scene.parts[lastIdx],
                correctedObserverFlags: result.scenePart.correctedObserverFlags,
              };
            }

            setCanRetry(true);
            setCanUndo(undoStackRef.current.length > 0);
            setLoadingStage(null);
            setStoryTextReady(true);

            setStoryData({ ...storyData });

            // Save progress
            const lastPartForSave =
              storyData.scene.parts[storyData.scene.parts.length - 1];
            console.log(
              "Saving story (custom input) - last part choices:",
              lastPartForSave.choices?.length || 0,
              "choices",
            );
            turnSaveRef.current = saveProgress(storyData, true);

            logger.ai_response("Generation complete (custom input)", {
              totalTokenCost: result.meta.totalTokenCost,
            });
          },
          onError: (error) => {
            addNotification(`Error: ${error.message}`, "failure");
            setLoading(false);
            setLoadingStage(null);
            setStoryTextReady(true);

            logger.error("Generation error (custom input)", {
              message: error.message,
            });
          },
        },
      );
    } catch (error: any) {
      addNotification(`Error: ${error.message}`, "failure");
      setLoading(false);
      setLoadingStage(null);
      setStoryTextReady(true);
      logger.error("Generation exception (custom input)", {
        message: error.message,
      });
    }
  }

  function handleCommentSubmit(comment: string) {
    if (!storyData) return;
    const trimmed = comment.trim();
    if (!trimmed) return;

    const nextPart: ScenePart = {
      content: "",
      imageUrl: "",
      user: true,
      role: "user",
      playerComment: trimmed,
      choices: [],
    };

    const updatedStory: StoryData = {
      ...storyData,
      scene: {
        ...storyData.scene,
        parts: [...storyData.scene.parts, nextPart],
      },
    };

    setStoryData(updatedStory);
  }

  // Handle confirmed freeform action - the GM stage determines mechanics
  // (skill checks, items, dice) during generation, so no analysis step
  // happens client-side before this.
  async function handleActionConfirm(choice: Choice, playerComment?: string) {
    if (!storyData) return;

    logger.action("Freeform action confirmed", { choice });

    // Directly call handleChoice with the action choice
    // We pass the choice directly to avoid state timing issues
    handleChoiceWithAction(choice, playerComment);
  }

  // Public handleChoice function - wrapper for normal choice selection
  async function handleChoice(playerComment?: string) {
    handleChoiceWithAction(undefined, playerComment);
  }

  // Shared by handleChoiceWithAction (a fresh choice/freeform submission)
  // and handleRetry's full-reroll path - builds the standard GM-stage +
  // story-stage + tools/choices generateStoryTurn call with full callback
  // wiring. Kept as one implementation so the two call sites can't drift:
  // a reroll is meant to be indistinguishable from a fresh submission of
  // the same player action (new dice, new tool calls), not a special case.
  // Assumes the caller has already pushed the user's turn onto
  // storyData.scene.parts and set up `partialPart` as the (empty) upcoming
  // assistant part.
  async function runTurnGeneration(
    storyData: StoryData,
    partialPart: ScenePart,
    opts: {
      logLabel: string;
      successNotification?: string;
      // How a turn killed mid-way is recovered (see generateTrackedTurn).
      turn: { mode: "new" | "retry"; text: string; partsBefore: number };
    },
  ) {
    // So a picture asked for during this turn can find the part (imageJobs.ts).
    if (!partialPart.id) partialPart.id = crypto.randomUUID();
    const { storyModel, toolsModel, choicesModel } = getModelsFromPreset();
    const toolCallingEnabled = true;

    logger.ai_request(`Starting generation (${opts.logLabel})`, {
      storyModel,
      toolsModel,
      choicesModel,
      toolCallingEnabled,
    });

    // Set by onStoryStart (see GenerationCallbacks.onStoryStart) - true when
    // the GM's own last round wrote the prose, meaning the live timeline has
    // already streamed it and the single onStoryContent that follows must not
    // append it again.
    let narratedByGMStage = false;

    const maxToolLoops =
      typeof window !== "undefined"
        ? parseInt(localStorage.getItem("maxToolLoops") || "10", 10)
        : 10;
    const customMaxContext =
      typeof window !== "undefined"
        ? parseInt(localStorage.getItem("customMaxContext") || "36000", 10)
        : 36000;
    const customMaxOutput =
      typeof window !== "undefined"
        ? parseInt(localStorage.getItem("customMaxOutput") || "8000", 10)
        : 8000;
    const embeddingsEnabled =
      typeof window !== "undefined"
        ? localStorage.getItem("embeddingsEnabled") === "true"
        : false;
    const embeddingThreshold =
      typeof window !== "undefined"
        ? parseFloat(localStorage.getItem("embeddingThreshold") || "0.25")
        : 0.25;
    const usePrefill =
      typeof window !== "undefined"
        ? localStorage.getItem("usePrefill") !== "false"
        : true;
    const storytellerMode =
      typeof window !== "undefined"
        ? (localStorage.getItem("storytellerMode") as "narrator" | "dm") ||
          "narrator"
        : "narrator";
    const deAiifyWords =
      typeof window !== "undefined"
        ? localStorage.getItem("deAiifyWords") !== "false"
        : true;
    const replyLength =
      typeof window !== "undefined"
        ? (localStorage.getItem("replyLength") as "short" | "medium" | "long") ||
          "medium"
        : "medium";
    // GM Stage is always enabled - legacy tool calling is deprecated
    const gmStageEnabled = true;

    // Track parallel completion of tools and choices
    let toolsComplete = true; // Tools already ran inside the GM stage before this point - no separate async tools stage to wait on; onToolsComplete is dead code (see generation.ts)
    let choicesComplete = !storyData.autoGenerateChoices;

    const holdNarrationForJudge = shouldHoldNarrationForJudge(
      getObserverSettings(),
    );
    const checkBothComplete = () => {
      // Stage callbacks never release the turn lock (turnLock.ts): the outer
      // onComplete does, after a blocking judge has decided.
      if (toolsComplete && choicesComplete && !holdNarrationForJudge) {
        setStoryTextReady(true);
      }
    };

    // Create abort controller for this generation
    generationAbortRef.current = new AbortController();

    try {
      await generateTrackedTurn(
        opts.turn,
        storyData,
        "", // User choice already in storyData.scene.parts
        {
          storyModel,
          toolsModel,
          choicesModel,
          enableTools: toolCallingEnabled,
          maxToolLoops,
          customMaxContext: customMaxContext > 0 ? customMaxContext : undefined,
          customMaxOutput: customMaxOutput > 0 ? customMaxOutput : undefined,
          // Suggested-action chips are opt-in - see BasicSettings.tsx
          // "Suggested Choices" toggle (StoryData.autoGenerateChoices).
          skipChoices: !storyData.autoGenerateChoices,
          openRouterKey,
          deepseekKey,
          googleKey,
          mistralKey,
          deepinfraKey,
          zaiKey,
          storyId: storyDbId || undefined,
          abortSignal: generationAbortRef.current.signal,
          setupPlayers: setupRoster(),
          imageJobDeps: buildImageJobDeps(),
          scenePartId: partialPart.id,
          enableEmbeddings: embeddingsEnabled,
          embeddingThreshold,
          samplingSettings: getSamplingSettings(),
          usePrefill,
          storytellerMode,
          deAiifyWords,
          replyLength,
          enableGMStage: gmStageEnabled,
          gmStageModel: toolsModel, // Use same model as tools stage
        },
        {
          onGMStageStart: () => {
            setLoadingStage("gm");
            // Reset live GM entries for new generation
            setLiveGMEntries([]);
            setLiveNarrationText("");
            setLiveReasoningTier(null);
            logger.action("GM stage started - determining mechanics");
          },
          onReasoningTierResolved: (resolved) => setLiveReasoningTier(resolved),
          onAskForRoll: requestManualRoll,
          onAskQuestion: requestPlayerAnswer,
          onRequestSetupConfirmation: requestSetupConfirmation,
          onRequestDiceThrow:
            storyData?.diceMode === "physical" ? requestDiceThrow : undefined,
          onCompaction: (summary) => {
            addNotification(
              "Recap: earlier events were condensed into a summary to save space",
              "info",
              6000,
            );
            logger.action("Story history compacted", {
              summaryLength: summary.length,
            });
          },
          onLiveNarrationUpdate: (visibleTextSoFar) => {
            setLiveNarrationText(visibleTextSoFar);
          },
          onGMContent: (delta, fullContent) => {
            // Re-parse the current round's buffer into thinking/text blocks
            // (see turnTimeline.ts) - earlier rounds stay frozen behind
            // their tool-call block.
            setLiveGMEntries((prev) => updateLiveRoundBlocks(prev, fullContent));
          },
          onGMReasoning: (delta, fullReasoning) => {
            setLiveGMEntries((prev) =>
              updateLiveReasoningBlock(prev, fullReasoning),
            );
          },
          onGMToolResult: (result) => {
            setLiveGMEntries((prev) => [
              ...freezeBlocks(prev),
              toolResultBlock(result),
            ]);
          },
          onGMStageComplete: (gmResults, storyContext, usage, thinking) => {
            logger.ai_response(`GM stage complete (${opts.logLabel})`, {
              toolCount: gmResults.length,
              tools: gmResults.map((r) => r.toolName),
              contextLength: storyContext.length,
              thinkingLines: thinking?.length || 0,
              usage,
            });

            // Freeze, don't clear - see the matching comment on the custom
            // input path above. This path was the worst case of the two:
            // it never re-added the narration afterwards, so the message
            // collapsed to "Thinking..." the instant the GM stopped streaming
            // and stayed there until the observer finished.
            setLiveGMEntries((prev) => freezeBlocks(prev));

            if (gmResults.length > 0) {
              partialPart.gmToolCalls = gmResults;
            }
            if (storyContext) {
              partialPart.gmStoryContext = storyContext;
            }
            if (thinking && thinking.length > 0) {
              partialPart.gmThinking = thinking;
            }

            // Extract NPC reactions from GM results and show as toast notifications
            const npcReactionResults = gmResults.filter(
              (r) => r.toolName === "npc_reaction",
            );
            if (npcReactionResults.length > 0) {
              const newReactions = npcReactionResults
                .map((r) => (r.result as GMNPCReactionResult)?.reaction)
                .filter((r): r is NPCReaction => r !== undefined);

              if (newReactions.length > 0) {
                setPendingNPCReactions((prev) => [...prev, ...newReactions]);

                if (!partialPart.npcReactions) {
                  partialPart.npcReactions = [];
                }
                partialPart.npcReactions.push(...newReactions);

                logger.action("NPC reactions triggered", {
                  count: newReactions.length,
                  npcs: newReactions.map((r) => r.npcName),
                });
              }
            }

            setLoadingStage("story");
          },
          onStoryStart: (narratedByGM) => {
            narratedByGMStage = narratedByGM;
          },
          onStoryReasoning: (delta, fullReasoning) => {
            setLiveGMEntries((prev) =>
              updateLiveReasoningBlock(prev, fullReasoning),
            );
          },
          onStoryContent: (chunk: string, fullContent: string) => {
            partialPart.content = fullContent;

            if (
              storyData.scene.parts[storyData.scene.parts.length - 1] !==
              partialPart
            ) {
              storyData.scene.parts = [...storyData.scene.parts, partialPart];
            }

            setStoryText(fullContent);
            // Separate story stage (the GM stage narrated nothing itself) -
            // append as a trailing streaming text block after the GM's
            // thinking/tool blocks. This path used to skip the live timeline
            // entirely, so the story stage streamed into a bubble that was
            // still showing "Thinking...". Skipped when the GM narrated
            // inline, where the prose is already in the timeline.
            if (!narratedByGMStage) {
              setLiveGMEntries((prev) => appendStreamingText(prev, fullContent));
            }
            setLoading(false); // Let player read while tools/choices generate
            setPendingUserChoice(""); // Clear pending choice - response is here
          },
          onStoryComplete: (content: string, usage: any) => {
            setLiveGMEntries((prev) => freezeBlocks(prev));
            partialPart.content = content;
            setStoryText(content);
            setStoryData({ ...storyData }); // Full update only at completion
            // Narration itself is done - unlock TTS now rather than waiting
            // for the tools/choices phase below to also finish. Unless a judge
            // may still rewrite it: then read-aloud waits for the outer
            // onComplete (turnLock.ts shouldHoldNarrationForJudge).
            if (!holdNarrationForJudge) setStoryTextReady(true);

            logger.ai_response(`Story narration complete (${opts.logLabel})`, {
              length: content.length,
              usage,
            });
          },
          onToolsStart: () => {
            // Keep showing tools stage while either is running
          },
          onToolsComplete: (
            toolCalls,
            toolResponses,
            stateChanges,
            usage,
          ) => {
            const lastPartIndex = storyData.scene.parts.length - 1;
            if (lastPartIndex >= 0) {
              storyData.scene.parts[lastPartIndex] = {
                ...storyData.scene.parts[lastPartIndex],
                toolCalls,
                toolResponses,
                stateChanges:
                  stateChanges.length > 0 ? stateChanges : undefined,
              };
            }

            processQuestNotifications(toolResponses, addNotification);

            setStoryData({ ...storyData });
            toolsComplete = true;
            checkBothComplete();

            logger.ai_response(`Tools complete (${opts.logLabel})`, {
              toolCallsCount: toolCalls.length,
              responsesCount: toolResponses.length,
              stateChangesCount: stateChanges.length,
              usage,
            });
          },
          onChoicesStart: () => {
            // Keep showing tools stage while either is running
          },
          onChoicesComplete: (newChoices, usage) => {
            const lastPartIndex = storyData.scene.parts.length - 1;
            if (lastPartIndex >= 0) {
              storyData.scene.parts[lastPartIndex] = {
                ...storyData.scene.parts[lastPartIndex],
                choices: newChoices,
              };
            }

            setChoices({ choices: newChoices });
            setStoryData({ ...storyData });
            choicesComplete = true;
            checkBothComplete();

            logger.ai_response(`Choices complete (${opts.logLabel})`, {
              choicesCount: newChoices.length,
              usage,
            });
          },
          onObserverRewrite: (
            flags,
            triggeringFlag,
            rewrittenNarration,
            original,
          ) => {
            handleObserverRewrite(
              storyData,
              partialPart,
              flags,
              triggeringFlag,
              rewrittenNarration,
              original,
              setStoryText,
              setStoryData,
              addNotification,
            );
          },
          onSceneImageRequested: (ref) => {
            // The GM asked for a picture of this turn; the part is still being
            // built, so the card's ref goes on it here (the picture itself
            // settles in the background, see imageJobs.ts).
            partialPart.images = [...(partialPart.images ?? []), ref];
          },
          onObserverReset: (flags, triggeringFlag) => {
            handleObserverReset(
              partialPart,
              flags,
              triggeringFlag,
              setStoryText,
              setLiveGMEntries,
              setLoadingStage,
              addNotification,
            );
          },
          onBackgroundObserverFlags: handleBackgroundObserverFlags,
          onBackgroundObserverRewrite: handleBackgroundObserverRewrite,
          onBackgroundLayersUpdate: handleBackgroundLayersUpdate,
          onComplete: (result) => {
            if (partialPart.content.includes("!!!ENDCHAPTER!!!")) {
              const currentChapter = storyData.chapters.length;
              addNotification(
                `Chapter ${currentChapter} Complete!`,
                "success",
              );
            }

            const lastIdx = storyData.scene.parts.length - 1;
            if (lastIdx >= 0 && result.scenePart?.gmConversation) {
              storyData.scene.parts[lastIdx] = {
                ...storyData.scene.parts[lastIdx],
                gmConversation: result.scenePart.gmConversation,
              };
            }

            // Copy the story stage's own native reasoning too - it streams
            // live via onStoryReasoning, but without this it never reaches
            // the persisted part, so it vanishes once the live timeline
            // hands off to the saved one (turnTimeline.ts:buildSavedTimeline).
            if (lastIdx >= 0 && result.scenePart?.reasoning) {
              storyData.scene.parts[lastIdx] = {
                ...storyData.scene.parts[lastIdx],
                reasoning: result.scenePart.reasoning,
                reasoning_details: result.scenePart.reasoning_details,
              };
            }

            // Copy the reasoning tier that adjudicated this turn (see
            // generation.ts:reasoningTierRanThisTurn) - undefined on the
            // retry path, which reuses a precomputed GM conversation and
            // never re-runs the tier router.
            if (lastIdx >= 0 && result.scenePart?.reasoningTier !== undefined) {
              storyData.scene.parts[lastIdx] = {
                ...storyData.scene.parts[lastIdx],
                reasoningTier: result.scenePart.reasoningTier,
                reasoningTierModelKey: result.scenePart.reasoningTierModelKey,
                reasoningTierEffort: result.scenePart.reasoningTierEffort,
              };
            }

            setCanRetry(true);
            setCanUndo(undoStackRef.current.length > 0);
            setLoadingStage(null);
            setStoryTextReady(true);

            setStoryData({ ...storyData });

            turnSaveRef.current = saveProgress(storyData, true);

            if (opts.successNotification) {
              addNotification(opts.successNotification, "success");
            }

            logger.ai_response(`Generation complete (${opts.logLabel})`, {
              totalTokenCost: result.meta.totalTokenCost,
            });
          },
          onError: (error) => {
            addNotification(`Error: ${error.message}`, "failure");
            setLoading(false);
            setLoadingStage(null);
            setStoryTextReady(true);
            setCanRetry(true);
            setChoices({
              choices:
                storyData.scene.parts[storyData.scene.parts.length - 1]
                  ?.choices || [],
            });

            logger.error(`Generation error (${opts.logLabel})`, {
              message: error.message,
            });
          },
        },
      );
    } catch (error: any) {
      addNotification(`Error: ${error.message}`, "failure");
      setLoading(false);
      setLoadingStage(null);
      setStoryTextReady(true);
      setCanRetry(true);
      logger.error(`Generation exception (${opts.logLabel})`, {
        message: error.message,
      });
    }
  }

  // Internal function that handles both regular choices and freeform actions
  async function handleChoiceWithAction(
    actionChoice?: Choice,
    playerComment?: string,
  ) {
    if (!storyData) return;
    if (turnInFlightRef.current) return;

    let choice: Choice | undefined;
    if (actionChoice) {
      // Direct action from freeform mode
      choice = actionChoice;
    } else {
      choice = choices.choices.find((c) => input[c.text]);
    }

    if (!choice) return;
    const key = actionChoice ? 0 : choices.choices.indexOf(choice);

    if (netSession?.role === "guest") {
      logger.action("Guest selected choice, sending to host", {
        choice: choice.text,
        index: key,
      });
      setLoading(true);
      setLoadingStage("story");
      setStoryTextReady(false);
      setPendingUserChoice(choice.text);
      sendNetChoice(key);
      return;
    }

    // Host in a networked room: buffer the host's own pick and wait for the
    // rest of the table instead of firing a turn immediately. The undo
    // snapshot is taken by the batched turn's handleCustomInput call, so we
    // don't snapshot here (buffering isn't a turn).
    if (netSession?.role === "host") {
      recordSeatInput({
        playerId: netSession.myLocalPlayerId,
        name: resolveSeatName(netSession.myLocalPlayerId),
        kind: "choice",
        text: choice.text,
        choiceIndex: key,
      });
      return;
    }

    // Local (single-player / couch) play generates here - snapshot full state
    // before this turn's GM tool calls can mutate it, so handleUndo/handleRetry
    // can restore mechanical state (not just pop scene.parts) if the player
    // says "that's not what I meant." Best-effort: if the structure somehow
    // isn't cloneable, the turn still proceeds without a fresh snapshot.
    try {
      const snapshot = structuredClone(storyData);
      undoStackRef.current = [...undoStackRef.current, snapshot].slice(
        -MAX_UNDO_STACK_SIZE,
      );
      persistUndoStack();
    } catch (snapshotError) {
      console.error("Failed to snapshot pre-turn state for undo", snapshotError);
    }

    logger.action("User selected choice", { choice: choice.text, index: key });

    // Where an interrupted turn is cut back to (interruptedTurn.ts): before
    // anything this choice pushes.
    const partsBeforeChoice = storyData.scene.parts.length;

    // Plain choices don't carry which connected guest picked them (unlike
    // freeform/voice - see handleCustomInput), so a roll during this turn
    // always stays local/host-side rather than guessing who to relay to.
    currentTurnSpeakerIdsRef.current = undefined;

    setLoading(true);
    setLoadingStage("story");
    setStoryTextReady(false);
    // Set pending user choice for immediate display in chat
    setPendingUserChoice(choice.text);

    // Check if this choice has intro_override (for starting choices)
    // If so, skip AI generation and use the preset intro directly. Not during
    // session zero: then the choice goes to the GM (see the flavor lines below).
    if (choice.intro_override && shouldUseIntroOverride(storyData, choice)) {
      logger.action("Using intro_override instead of AI generation", {
        choice: choice.text,
      });

      const overridePart: ScenePart = {
        content: choice.intro_override,
        imageUrl: "",
        user: false,
        role: "assistant",
        choices: [], // Will need to generate choices next
      };
      // This branch never reaches generateTrackedTurn, so it marks the same
      // record itself and clears it once its (immediate) save has resolved.
      setInterruptedTurn(null);
      interruptedTurnIdRef.current = null;
      const overrideTurnId = newTurnId();
      const overrideChoiceText = choice.text;
      if (storyDbId) {
        markTurnStarted({
          storyId: storyDbId,
          turnId: overrideTurnId,
          mode: "new",
          text: overrideChoiceText,
          partsBefore: partsBeforeChoice,
          startedAt: Date.now(),
        });
      }
      const finishOverrideTurn = async () => {
        if ((await saveProgress(storyData, true)) && storyDbId) {
          clearTurn(storyDbId, overrideTurnId);
        }
      };
      storyData.scene.parts.push(overridePart);

      setStoryText(choice.intro_override);
      setStoryData({ ...storyData });
      setLoading(false);
      setStoryTextReady(true);

      if (!storyData.autoGenerateChoices) {
        setLoadingStage(null);
        setChoices({ choices: [] });
        await finishOverrideTurn();
        addNotification("Story continues...", "success");
        return;
      }

      setLoadingStage("choices");
      try {
        const { choicesModel } = getModelsFromPreset();
        const { generateChoicesOnly } = await import("../misc/generation");
        const newChoices = await generateChoicesOnly(storyData, {
          choicesModel,
          choicesReasoningEffort: getEffectiveNarrationEffort(),
          openRouterKey,
          deepseekKey,
          googleKey,
          mistralKey,
          deepinfraKey,
          zaiKey,
        });

        const lastPartIndex = storyData.scene.parts.length - 1;
        if (lastPartIndex >= 0) {
          storyData.scene.parts[lastPartIndex] = {
            ...storyData.scene.parts[lastPartIndex],
            choices: newChoices,
          };
        }

        setChoices({ choices: newChoices });
        setStoryData({ ...storyData });
        setLoadingStage(null);

        await finishOverrideTurn();
        addNotification("Story continues...", "success");
      } catch (error) {
        console.error("Error generating choices:", error);
        const fallbackChoices = [{ text: "Continue" }];
        const lastPartIndex = storyData.scene.parts.length - 1;
        if (lastPartIndex >= 0) {
          storyData.scene.parts[lastPartIndex] = {
            ...storyData.scene.parts[lastPartIndex],
            choices: fallbackChoices,
          };
        }
        setChoices({ choices: fallbackChoices });
        setStoryData({ ...storyData });
        setLoadingStage(null);
        await finishOverrideTurn();
      }
      return;
    }

    // Build the player-facing text: the choice itself, plus a line for an
    // authored opening. No mechanical resolution happens client-side - the GM
    // decides whether/how to roll via its own formula_roll tool once it reads
    // this.
    const flavorLines: string[] = [];

    // A starting choice with an authored opening, picked during session zero:
    // it replaces the story's opening (the field's own rule: "if empty, uses
    // main intro"), and start_game hands it to the GM once setup is done
    // (decision 197), so the GM never gets two openings.
    if (choice.intro_override && !shouldUseIntroOverride(storyData, choice)) {
      storyData.intro = choice.intro_override;
    }

    let text = ">" + choice.text;
    if (choice.stt_input) {
      text += "\n[Voice Input - may contain transcription errors]";
    }
    if (flavorLines.length > 0) {
      text += "\n" + flavorLines.join("\n");
    }

    storyData.scene.parts.push({
      content: text,
      imageUrl: "",
      user: true,
      role: "user",
      playerComment: playerComment?.trim() ? playerComment.trim() : undefined,
      choices: [], // User parts don't have choices - choices come from AI response
    });

    setChoices({ choices: [] });

    processLoreTriggers(storyData, addNotification);

    // Track partial scene part as we stream
    let partialPart: ScenePart = {
      content: "",
      imageUrl: "",
      user: false,
      role: "assistant",
      choices: [],
      // So a picture asked for during this turn can find the part (imageJobs.ts).
      id: crypto.randomUUID(),
    };

    await runTurnGeneration(storyData, partialPart, {
      logLabel: "choice",
      turn: {
        mode: "new",
        text: choice.text,
        partsBefore: partsBeforeChoice,
      },
    });
  }

  function handleSelect(index: number): void {
    const key = choices.choices[index]?.text;
    if (!key) return;
    let newInput = input;
    if (!newInput[key]) {
      newInput[key] = true;
    }
    Object.keys(newInput).forEach((k) => {
      if (k !== key) {
        newInput[k] = false;
      }
    });
    setInput({ ...newInput });
  }

  // Manual dice mode: called by the GM executor when ask_for_roll fires.
  // Shows the roll prompt and resolves once the player enters their total.
  function requestManualRoll(request: ManualRollRequest) {
    return new Promise<ManualRollAnswer | null>((resolve) => {
      manualRollResolveRef.current = resolve;
      // Party mode: a roll for a player on a phone goes to their phone.
      const partyId = party.offerRoll(request, (answer) =>
        resolveManualRoll(answer),
      );
      if (partyId) {
        partyRollRequestIdRef.current = partyId;
        return;
      }
      setManualRollRequest(request);
      notifyPlayerNeeded("roll", request.title);
    });
  }

  function resolveManualRoll(answer: ManualRollAnswer | null) {
    manualRollResolveRef.current?.(answer);
    manualRollResolveRef.current = null;
    setManualRollRequest(null);
    if (partyRollRequestIdRef.current) {
      party.cancelRequest(partyRollRequestIdRef.current);
      partyRollRequestIdRef.current = null;
    }
  }

  // Ask-question tool: called by the GM executor when ask_question fires.
  // Shows the question prompt and resolves once the player(s) answer.
  function requestPlayerAnswer(request: AskQuestionRequest) {
    return new Promise<AskQuestionAnswer | null>((resolve) => {
      askQuestionResolveRef.current = resolve;
      // Party mode: questions for a player on a phone go to their phone.
      const partyId = party.offerQuestion(request, (answer) =>
        resolveAskQuestion(answer),
      );
      if (partyId) {
        partyQuestionRequestIdRef.current = partyId;
        return;
      }
      setAskQuestionRequest(request);
      notifyPlayerNeeded("question", request.questions[0]?.question);
    });
  }

  function resolveAskQuestion(answer: AskQuestionAnswer | null) {
    askQuestionResolveRef.current?.(answer);
    askQuestionResolveRef.current = null;
    setAskQuestionRequest(null);
    if (partyQuestionRequestIdRef.current) {
      party.cancelRequest(partyQuestionRequestIdRef.current);
      partyQuestionRequestIdRef.current = null;
    }
  }

  // confirm_setup: show the setup card and wait for the decision.
  function requestSetupConfirmation(request: SetupConfirmationRequest) {
    return new Promise<SetupConfirmationAnswer>((resolve) => {
      // A card already open is replaced: close the old one as dismissed.
      settleSetupResolver(setupConfirmResolveRef, SETUP_DISMISSED);
      setupConfirmResolveRef.current = resolve;
      setSetupConfirmRequest(request);
      notifyPlayerNeeded("question", request.characterSummary);
    });
  }

  function resolveSetupConfirmation(answer: SetupConfirmationAnswer) {
    settleSetupResolver(setupConfirmResolveRef, answer);
    setSetupConfirmRequest(null);
  }

  // Who needs a character sheet in session zero. Party seats live in
  // multiplayer.couchPlayers (the host writes them back), so the roster is the
  // couch players either way; getSetupProgress reads one sheet for a solo story.
  function setupRoster(): { id: string; name: string }[] {
    return (storyData?.multiplayer?.couchPlayers ?? []).map((p) => ({
      id: p.id,
      name: p.name,
    }));
  }

  // Physical dice mode: called by the GM executor when a formula roll can
  // be thrown physically. If we're hosting a networked session and the
  // turn in flight is attributable to exactly one connected guest (not the
  // host's own action), relay the throw to that guest instead of showing
  // the tray locally - see currentTurnSpeakerIdsRef. Otherwise (single-
  // player, couch co-op, the host's own turn, or a guest calling this via
  // onDiceThrowRequest - always resolves to the "local" branch since a
  // guest's own netSession.role is never "host") shows the tray here and
  // resolves once the thrown dice settle or the player skips.
  function requestDiceThrow(request: DiceThrowRequest) {
    return new Promise<number[][] | null>((resolve) => {
      const speakerIds = currentTurnSpeakerIdsRef.current;
      const remoteTargetId =
        netSession?.role === "host" &&
        speakerIds?.length === 1 &&
        speakerIds[0] !== netSession.myLocalPlayerId
          ? speakerIds[0]
          : null;

      if (remoteTargetId) {
        const requestId = crypto.randomUUID();
        diceThrowRelayResolversRef.current.set(requestId, {
          forPlayerId: remoteTargetId,
          resolve,
        });
        sendNetDiceThrowRequest(requestId, remoteTargetId, {
          groups: request.groups,
          formula: request.formula,
          reason: request.reason,
        });
        return;
      }

      diceThrowResolveRef.current = resolve;
      setDiceThrowRequest(request);
      notifyPlayerNeeded("roll", request.reason);
    });
  }

  function resolveDiceThrow(faces: number[][] | null) {
    diceThrowResolveRef.current?.(faces);
    diceThrowResolveRef.current = null;
    setDiceThrowRequest(null);
  }

  // Abandons any dice throw currently relayed to a guest, falling back to
  // digital for it - used when generation is stopped entirely (handleStop)
  // so the GM loop can't hang waiting on a remote player forever.
  function abandonRelayedDiceThrows() {
    for (const pending of diceThrowRelayResolversRef.current.values()) {
      pending.resolve(null);
    }
    diceThrowRelayResolversRef.current.clear();
  }

  // Stop generation (abort ongoing requests)
  async function handleStop() {
    // Unblock the GM loop if it's paused waiting for a physical roll
    resolveManualRoll(null);
    resolveDiceThrow(null);
    resolveAskQuestion(null);
    resolveSetupConfirmation(SETUP_STOPPED);
    abandonRelayedDiceThrows();
    if (generationAbortRef.current) {
      generationAbortRef.current.abort();
      generationAbortRef.current = null;
    }
    // A stopped turn is not an interrupted one: the revert below is the repair.
    if (liveTurnRef.current) {
      clearTurn(liveTurnRef.current.storyId, liveTurnRef.current.turnId);
    }

    // A stopped generation is incomplete, not just paused - any tool calls
    // that already ran before the abort (start_combat, npc_roll, etc.) stay
    // applied to storyData otherwise, leaving mechanical state (especially
    // combat) stuck mid-turn with no way back short of a full reload. Revert
    // to the pre-turn snapshot, same as Undo, so Stop always leaves a clean,
    // previously-valid state instead of a half-finished one.
    if (storyData) {
      const snapshot = undoStackRef.current[undoStackRef.current.length - 1];
      if (snapshot) {
        for (const key of Object.keys(storyData)) {
          delete (storyData as unknown as Record<string, unknown>)[key];
        }
        Object.assign(storyData, snapshot);
        undoStackRef.current = undoStackRef.current.slice(0, -1);
        persistUndoStack();
        setStoryData({ ...storyData });

        if (storyData.scene.parts.length > 0) {
          const previousPart =
            storyData.scene.parts[storyData.scene.parts.length - 1];
          setStoryText(previousPart.content);
          setChoices({ choices: previousPart.choices || [] });
          const inputs =
            previousPart.choices?.reduce(
              (acc, choice) => ({ ...acc, [choice.text]: false }),
              {} as Record<string, boolean>,
            ) || {};
          setInput(inputs);
        } else {
          setChoices({ choices: [] });
        }
        setPendingUserChoice("");
        setCanRetry(false);
        setCanUndo(
          undoStackRef.current.length > 0 && storyData.scene.parts.length >= 2,
        );
        logger.action("Stop reverted to pre-turn state (mechanics included)");
        await saveProgress(storyData, true);
      }
    }

    setLoading(false);
    setLoadingStage(null);
    setStoryTextReady(true);
    addNotification("Generation stopped", "warning");
  }

  // Drops the interrupted-turn record and its banner.
  function forgetInterruptedTurn() {
    if (storyDbId && interruptedTurnIdRef.current) {
      clearTurn(storyDbId, interruptedTurnIdRef.current);
    }
    interruptedTurnIdRef.current = null;
    setInterruptedTurn(null);
  }

  // The banner's Dismiss. The story was cut back in memory on load, so write
  // that down too, or the half turn would come back on the next load.
  function handleDismissInterrupted() {
    forgetInterruptedTurn();
    if (storyData) void saveProgress(storyData, true);
  }

  // The banner's Retry: a lost player line is sent again; a lost reroll or
  // reword runs Retry again on the turn the story was cut back to.
  function handleRetryInterrupted() {
    const pending = interruptedTurn;
    forgetInterruptedTurn();
    if (!pending) return;
    if (pending.mode === "new") void handleCustomInput(pending.text);
    else void handleRetry();
  }

  async function handleRetry() {
    if (!storyData || loading || turnInFlightRef.current) return;

    //CheckiflastpartisanAIresponse
    const lastPart = storyData.scene.parts[storyData.scene.parts.length - 1];
    if (!lastPart || lastPart.user) {
      addNotification("Nothing to retry", "warning");
      return;
    }

    //Findtheuser'schoice(secondtolastpart)
    if (storyData.scene.parts.length < 2) {
      addNotification("Cannot retry initial story", "warning");
      return;
    }

    const userChoicePart =
      storyData.scene.parts[storyData.scene.parts.length - 2];
    if (!userChoicePart?.user) {
      addNotification("Cannot retry initial story", "warning");
      return;
    }

    // A killed Retry is cut back to the story as it stands now (the turn being
    // redone included), and the banner's Retry runs Retry again.
    const partsBeforeRetry = storyData.scene.parts.length;
    const retryTurn = {
      mode: "retry" as const,
      text: userChoicePart.content,
      partsBefore: partsBeforeRetry,
    };

    setLoading(true);
    setLoadingStage("story");
    setStoryTextReady(false);
    setCanRetry(false);

    // Full reroll: if this turn's pre-turn snapshot is still on the undo
    // stack, restore full mechanical state (NPCs, quests, stats, combat,
    // etc. - not just scene.parts) and resubmit the exact same player
    // action through the normal GM-stage pipeline, so Retry produces a
    // genuinely new dice roll/tool-call outcome instead of just reworded
    // narration for the same one. A reroll doesn't consume the snapshot -
    // it stays valid for a later Undo, however many times the player
    // rerolls first.
    const snapshot = undoStackRef.current[undoStackRef.current.length - 1];
    if (snapshot) {
      // The attempt being rerolled is thrown away: so are its pictures.
      if (lastTurnCostIdRef.current) {
        cancelImageJobsForTurn(lastTurnCostIdRef.current, "gm");
      }
      const userChoiceContent = userChoicePart.content;
      const savedPlayerComment = userChoicePart.playerComment;
      const savedSpeakerIds = userChoicePart.speakerIds;

      for (const key of Object.keys(storyData)) {
        delete (storyData as unknown as Record<string, unknown>)[key];
      }
      Object.assign(storyData, snapshot);

      storyData.scene.parts.push({
        content: userChoiceContent,
        imageUrl: "",
        user: true,
        role: "user",
        playerComment: savedPlayerComment,
        speakerIds: savedSpeakerIds,
        choices: [],
      });

      setChoices({ choices: [] });
      currentTurnSpeakerIdsRef.current = savedSpeakerIds;

      processLoreTriggers(storyData, addNotification);

      // Reflect the restored pre-turn state immediately, same as Undo -
      // otherwise the UI shows the previous (mutated) state until
      // runTurnGeneration's own setStoryData calls catch up, which doesn't
      // happen at all if generation fails before its first update.
      setStoryData({ ...storyData });

      addNotification("Rerolling turn...", "info");
      logger.action("User requested full reroll retry", {
        userChoice: userChoiceContent.substring(0, 100),
      });

      let partialPart: ScenePart = {
        content: "",
        imageUrl: "",
        user: false,
        role: "assistant",
        choices: [],
      };

      await runTurnGeneration(storyData, partialPart, {
        logLabel: "reroll",
        successNotification: "Turn rerolled",
        turn: retryTurn,
      });
      return;
    }

    // Legacy fallback: no saved pre-turn snapshot for this turn (e.g. it
    // was taken before undo/retry snapshots existed, or before an app
    // update mid-session). Can't safely redo mechanics without one, so
    // fall back to the previous behavior: only regenerate the narration
    // text, reusing the original attempt's dice rolls/tool results as-is.

    // Save GM context from the last AI response before popping it
    // This preserves the dice rolls, skill checks, and reasoning for the regeneration
    const lastAIPart = storyData.scene.parts[storyData.scene.parts.length - 1];
    const savedGMThinking = lastAIPart.gmThinking;
    const savedGMStoryContext = lastAIPart.gmStoryContext;
    const savedGMToolCalls = lastAIPart.gmToolCalls;
    const savedGMConversation = lastAIPart.gmConversation;
    // Its pictures were drawn for the same GM conversation, which this reword
    // keeps, so they stay with the turn (same part id, same refs).
    const savedPartId = lastAIPart.id;
    const savedImages = lastAIPart.images;

    // Remove the last AI response
    storyData.scene.parts.pop();

    // Get the user's choice content and choices for regeneration
    const userChoiceContent = userChoicePart?.content || "";
    const savedChoices = userChoicePart?.choices || [];

    // Also pop the user choice part - we'll re-add it via generateStoryTurn
    // This prevents duplicate user messages in the prompt
    storyData.scene.parts.pop();

    // Restore choices from the user's choice part
    if (savedChoices.length > 0) {
      setChoices({ choices: savedChoices });
    }

    addNotification("Regenerating response...", "info");
    logger.action("User requested retry (no snapshot, reword-only)", {
      hasGMThinking: !!savedGMThinking?.length,
      hasGMStoryContext: !!savedGMStoryContext,
      userChoice: userChoiceContent.substring(0, 100),
    });

    const { storyModel, toolsModel, choicesModel } = getModelsFromPreset();
    const toolCallingEnabled = true;

    logger.ai_request("Starting generation (retry)", {
      storyModel,
      toolsModel,
      choicesModel,
      toolCallingEnabled,
    });

    // Track partial scene part as we stream
    // Preserve GM context from the popped part - this is the dice rolls and reasoning
    let partialPart: ScenePart = {
      content: "",
      imageUrl: "",
      user: false,
      role: "assistant",
      choices: [],
      gmThinking: savedGMThinking,
      gmStoryContext: savedGMStoryContext,
      gmToolCalls: savedGMToolCalls,
      id: savedPartId ?? crypto.randomUUID(),
      images: savedImages,
    };

    const maxToolLoops =
      typeof window !== "undefined"
        ? parseInt(localStorage.getItem("maxToolLoops") || "10", 10)
        : 10;
    const customMaxContext =
      typeof window !== "undefined"
        ? parseInt(localStorage.getItem("customMaxContext") || "36000", 10)
        : 36000;
    const customMaxOutput =
      typeof window !== "undefined"
        ? parseInt(localStorage.getItem("customMaxOutput") || "8000", 10)
        : 8000;
    const embeddingsEnabled =
      typeof window !== "undefined"
        ? localStorage.getItem("embeddingsEnabled") === "true"
        : false;
    const embeddingThreshold =
      typeof window !== "undefined"
        ? parseFloat(localStorage.getItem("embeddingThreshold") || "0.25")
        : 0.25;
    const usePrefill =
      typeof window !== "undefined"
        ? localStorage.getItem("usePrefill") !== "false"
        : true;
    const storytellerMode =
      typeof window !== "undefined"
        ? (localStorage.getItem("storytellerMode") as "narrator" | "dm") ||
          "narrator"
        : "narrator";
    const deAiifyWords =
      typeof window !== "undefined"
        ? localStorage.getItem("deAiifyWords") !== "false"
        : true;
    const replyLength =
      typeof window !== "undefined"
        ? (localStorage.getItem("replyLength") as "short" | "medium" | "long") ||
          "medium"
        : "medium";
    // GM Stage is always enabled - legacy tool calling is deprecated
    const gmStageEnabled = true;

    // Track parallel completion of tools and choices
    let toolsComplete = true; // Tools already ran inside the GM stage before this point - no separate async tools stage to wait on; onToolsComplete is dead code (see generation.ts)
    let choicesComplete = !storyData.autoGenerateChoices;

    const holdNarrationForJudge = shouldHoldNarrationForJudge(
      getObserverSettings(),
    );
    const checkBothComplete = () => {
      // Stage callbacks never release the turn lock (turnLock.ts): the outer
      // onComplete does, after a blocking judge has decided.
      if (toolsComplete && choicesComplete && !holdNarrationForJudge) {
        setStoryTextReady(true);
      }
    };

    // Create abort controller for this generation
    generationAbortRef.current = new AbortController();
    // This retry path skips the GM stage entirely (reuses saved context),
    // so nothing will reset liveGMEntries the way onGMStageStart normally
    // does - clear it here so a stale timeline from a previous turn can't
    // linger into this one. Same for liveNarrationText: retry never fires
    // onLiveNarrationUpdate (no GM round loop to fire it), but Story's
    // ttsText prop still prefers it over storyText while storyTextReady is
    // false - a stale value from an earlier inline-narrated turn would
    // otherwise shadow the storyText this path streams normally. Same for
    // liveReasoningTier: retry never fires onReasoningTierResolved either
    // (no tier router run), so a stale tier badge would otherwise linger.
    setLiveGMEntries([]);
    setLiveNarrationText("");
    setLiveReasoningTier(null);

    // Re-add the user choice part before generation (matching normal flow)
    // The prompt builder will deduplicate this when building the context
    storyData.scene.parts.push({
      content: userChoiceContent,
      imageUrl: "",
      user: true,
      role: "user",
      choices: savedChoices, // Preserve the choices from the original turn
    });

    try {
      await generateTrackedTurn(
        retryTurn,
        storyData,
        userChoiceContent, // Use the user's original choice content
        {
          storyModel,
          toolsModel,
          choicesModel,
          enableTools: toolCallingEnabled,
          maxToolLoops,
          customMaxContext: customMaxContext > 0 ? customMaxContext : undefined,
          customMaxOutput: customMaxOutput > 0 ? customMaxOutput : undefined,
          // Suggested-action chips are opt-in - see BasicSettings.tsx
          // "Suggested Choices" toggle (StoryData.autoGenerateChoices).
          skipChoices: !storyData.autoGenerateChoices,
          openRouterKey,
          deepseekKey,
          googleKey,
          mistralKey,
          deepinfraKey,
          zaiKey,
          storyId: storyDbId || undefined,
          enableEmbeddings: embeddingsEnabled,
          embeddingThreshold,
          samplingSettings: getSamplingSettings(),
          usePrefill,
          storytellerMode,
          deAiifyWords,
          replyLength,
          // Skip GM stage on retry - reuse the saved conversation (dice
          // rolls, tool results, reasoning) from the popped part instead
          enableGMStage: false, // Don't re-run GM stage
          // In session zero a reword would skip the setup gate and narrate
          // from the saved conversation, so it runs the full GM loop instead
          // (the gate and the buffering then apply).
          precomputedGMConversation: storyData.sessionZeroActive
            ? undefined
            : savedGMConversation,
          // Also carry the reused tool results through so the observer's
          // outcome-mismatch/tool-usage-gap checks and the Director
          // Assistant still have something to look at (see
          // precomputedGMResults's doc comment in generation.ts) - without
          // this, generateStoryTurn saw an empty gmResults for every
          // reword-only retry and those checks silently never fired.
          precomputedGMResults: storyData.sessionZeroActive
            ? undefined
            : savedGMToolCalls,
          abortSignal: generationAbortRef.current.signal,
          imageJobDeps: buildImageJobDeps(),
          scenePartId: partialPart.id,
          // The saved conversation's tools already ran and their effects are
          // in this story; an Observer reset here may only rewrite prose,
          // never run the tools again (judge-layer design 3.3).
          allowMechanicalRetry: false,
        },
        {
          onStoryReasoning: (delta, fullReasoning) => {
            setLiveGMEntries((prev) =>
              updateLiveReasoningBlock(prev, fullReasoning),
            );
          },
          onStoryContent: (chunk: string, fullContent: string) => {
            // Update partial part as content streams
            partialPart.content = fullContent;

            // Only add to scene once (when we first get content)
            if (
              storyData.scene.parts[storyData.scene.parts.length - 1] !==
              partialPart
            ) {
              storyData.scene.parts = [...storyData.scene.parts, partialPart];
            }

            setStoryText(fullContent);
            // Don't call setStoryData here - it causes infinite loops during rapid streaming
            // storyText is sufficient for display, full update happens in onStoryComplete
            // Fallback story stage (GM stage narrated nothing itself) - append as a
            // trailing streaming text block after the GM's thinking/tool blocks.
            setLiveGMEntries((prev) => appendStreamingText(prev, fullContent));
            setLoading(false); // Let player read while tools/choices generate
            setPendingUserChoice(""); // Clear pending choice - response is here
          },
          onStoryComplete: (content: string, usage: any) => {
            setLiveGMEntries((prev) => freezeBlocks(prev));
            // Update the partial part with the cleaned content (strips [GM State Update] etc)
            partialPart.content = content;
            setStoryText(content);
            setStoryData({ ...storyData }); // Full update only at completion
            // Narration itself is done - unlock TTS now rather than waiting
            // for the tools/choices phase below to also finish. Unless a judge
            // may still rewrite it: then read-aloud waits for the outer
            // onComplete (turnLock.ts shouldHoldNarrationForJudge).
            if (!holdNarrationForJudge) setStoryTextReady(true);

            // Tools and choices run in parallel after story - no separate loading stage
            logger.ai_response("Story narration complete (retry)", {
              length: content.length,
              usage,
            });
          },
          onToolsStart: () => {
            // Keep showing tools stage while either is running
          },
          onToolsComplete: (toolCalls, toolResponses, stateChanges, usage) => {
            // Update the last part with tool data including stateChanges
            const lastPartIndex = storyData.scene.parts.length - 1;
            if (lastPartIndex >= 0) {
              storyData.scene.parts[lastPartIndex] = {
                ...storyData.scene.parts[lastPartIndex],
                toolCalls,
                toolResponses,
                stateChanges:
                  stateChanges.length > 0 ? stateChanges : undefined,
              };
            }

            // Notify player of quest changes
            processQuestNotifications(toolResponses, addNotification);

            setStoryData({ ...storyData });
            toolsComplete = true;
            checkBothComplete();

            logger.ai_response("Tools complete (retry)", {
              toolCallsCount: toolCalls.length,
              responsesCount: toolResponses.length,
              stateChangesCount: stateChanges.length,
              usage,
            });
          },
          onChoicesStart: () => {
            // Keep showing tools stage while either is running
          },
          onChoicesComplete: (newChoices, usage) => {
            // Update the last part with choices
            const lastPartIndex = storyData.scene.parts.length - 1;
            if (lastPartIndex >= 0) {
              storyData.scene.parts[lastPartIndex] = {
                ...storyData.scene.parts[lastPartIndex],
                choices: newChoices,
              };
            }

            setChoices({ choices: newChoices });
            setStoryData({ ...storyData });
            choicesComplete = true;
            checkBothComplete();

            logger.ai_response("Choices complete (retry)", {
              choicesCount: newChoices.length,
              usage,
            });
          },
          onObserverRewrite: (
            flags,
            triggeringFlag,
            rewrittenNarration,
            original,
          ) => {
            handleObserverRewrite(
              storyData,
              partialPart,
              flags,
              triggeringFlag,
              rewrittenNarration,
              original,
              setStoryText,
              setStoryData,
              addNotification,
            );
          },
          onSceneImageRequested: (ref) => {
            // The GM asked for a picture of this turn; the part is still being
            // built, so the card's ref goes on it here (the picture itself
            // settles in the background, see imageJobs.ts).
            partialPart.images = [...(partialPart.images ?? []), ref];
          },
          onObserverReset: (flags, triggeringFlag) => {
            handleObserverReset(
              partialPart,
              flags,
              triggeringFlag,
              setStoryText,
              setLiveGMEntries,
              setLoadingStage,
              addNotification,
            );
          },
          onBackgroundObserverFlags: handleBackgroundObserverFlags,
          onBackgroundObserverRewrite: handleBackgroundObserverRewrite,
          onBackgroundLayersUpdate: handleBackgroundLayersUpdate,
          onComplete: (result) => {
            // Check for chapter completion
            if (partialPart.content.includes("!!!ENDCHAPTER!!!")) {
              const currentChapter = storyData.chapters.length;
              addNotification(`Chapter ${currentChapter} Complete!`, "success");
            }

            // Process lore triggers based on new content
            processLoreTriggers(storyData, addNotification);

            // Copy gmConversation from result.scenePart to the last scene part
            // This preserves the full GM conversation history for future context
            const lastIdx = storyData.scene.parts.length - 1;
            if (lastIdx >= 0 && result.scenePart?.gmConversation) {
              storyData.scene.parts[lastIdx] = {
                ...storyData.scene.parts[lastIdx],
                gmConversation: result.scenePart.gmConversation,
              };
            }

            // Copy the story stage's own native reasoning too - it streams
            // live via onStoryReasoning, but without this it never reaches
            // the persisted part, so it vanishes once the live timeline
            // hands off to the saved one (turnTimeline.ts:buildSavedTimeline).
            if (lastIdx >= 0 && result.scenePart?.reasoning) {
              storyData.scene.parts[lastIdx] = {
                ...storyData.scene.parts[lastIdx],
                reasoning: result.scenePart.reasoning,
                reasoning_details: result.scenePart.reasoning_details,
              };
            }

            // Copy the reasoning tier that adjudicated this turn (see
            // generation.ts:reasoningTierRanThisTurn) - undefined on the
            // retry path, which reuses a precomputed GM conversation and
            // never re-runs the tier router.
            if (lastIdx >= 0 && result.scenePart?.reasoningTier !== undefined) {
              storyData.scene.parts[lastIdx] = {
                ...storyData.scene.parts[lastIdx],
                reasoningTier: result.scenePart.reasoningTier,
                reasoningTierModelKey: result.scenePart.reasoningTierModelKey,
                reasoningTierEffort: result.scenePart.reasoningTierEffort,
              };
            }

            // Copy and surface consistency-check warnings (§2.5 state-error
            // path, see docs/research-paper-ttrpg-theory-gap-analysis.md).
            // checkNarrationConsistency runs after streaming completes, so
            // these previously only reached storyData via result.scenePart -
            // they were never actually shown to the player, only visible in
            // the ContextViewer debug panel. Surfacing them as a notification
            // (with the fix already one click away via Edit + Retry, both of
            // which already exist) is what actually connects the pieces.
            if (lastIdx >= 0 && result.scenePart?.consistencyWarnings?.length) {
              storyData.scene.parts[lastIdx] = {
                ...storyData.scene.parts[lastIdx],
                consistencyWarnings: result.scenePart.consistencyWarnings,
              };
              // No toast: a deterministic name-matching check is diagnostic
              // (judge-layer design 3.10). The warning stays on the part for
              // the context viewer and went to the Debug Logs when it fired.
            }

            // Layer 5 observer flags (see observer.ts) that survived to this
            // accepted turn - either minor, or major but the automatic reset
            // budget was already spent (onObserverReset fired earlier this
            // turn for those attempts). Same posture as consistencyWarnings
            // above: surface it, let the player Edit/Retry manually.
            if (lastIdx >= 0 && result.scenePart?.observerFlags?.length) {
              storyData.scene.parts[lastIdx] = {
                ...storyData.scene.parts[lastIdx],
                observerFlags: result.scenePart.observerFlags,
              };
              addNotification(
                `GM response flagged: ${result.scenePart.observerFlags[0].detail} - use Edit to fix the text, or Retry to regenerate.`,
                "warning",
              );
            }

            // Flags that the observer already fixed via a same-turn rewrite
            // (see observer.ts's buildObserverCorrectionNote) - GM-facing
            // only, never shown to the player, same posture as
            // storyProgressNote/repetitionNote/knowledgeNote. Carried so the
            // next turn's prompt still tells the GM a correction was needed
            // here, even though this turn's own narration already reads clean.
            if (lastIdx >= 0 && result.scenePart?.correctedObserverFlags?.length) {
              storyData.scene.parts[lastIdx] = {
                ...storyData.scene.parts[lastIdx],
                correctedObserverFlags: result.scenePart.correctedObserverFlags,
              };
            }

            setCanRetry(true);
            setCanUndo(undoStackRef.current.length > 0);
            setLoadingStage(null);
            setStoryTextReady(true);

            setStoryData({ ...storyData });

            // Save progress. Immediate (it was debounced) so the turn wrapper
            // can await it before ending the Android keep-alive.
            turnSaveRef.current = saveProgress(storyData, true);

            addNotification("Response regenerated", "success");

            logger.ai_response("Generation complete (retry)", {
              totalTokenCost: result.meta.totalTokenCost,
            });
          },
          onError: (error) => {
            addNotification(`Error: ${error.message}`, "failure");
            setLoading(false);
            setLoadingStage(null);
            setStoryTextReady(true);
            setCanRetry(true);

            logger.error("Generation error (retry)", {
              message: error.message,
            });
          },
        },
      );
    } catch (error: any) {
      addNotification(`Error: ${error.message}`, "failure");
      setLoading(false);
      setLoadingStage(null);
      setStoryTextReady(true);
      setCanRetry(true);
      logger.error("Generation exception (retry)", { message: error.message });
    }
  }

  async function handleUndo() {
    if (!storyData || loading || turnInFlightRef.current) return;

    // An Observer revision is the newest thing that happened to this turn, so
    // Undo peels that off first: one click puts the GM's original draft back,
    // and a second click undoes the whole turn the normal way. No separate
    // button - Undo just walks back the most recent change, whatever it was.
    if (
      storyData.scene.parts[storyData.scene.parts.length - 1]
        ?.observerRewriteOriginal
    ) {
      await restoreObserverOriginal();
      return;
    }

    // Check if there are at least 2 parts: user choice + AI response
    if (storyData.scene.parts.length < 2) {
      addNotification("Nothing to undo", "warning");
      return;
    }

    const lastPart = storyData.scene.parts[storyData.scene.parts.length - 1];
    const secondLastPart =
      storyData.scene.parts[storyData.scene.parts.length - 2];

    // Last part should be AI response, second-to-last should be user choice
    if (lastPart.user || !secondLastPart.user) {
      addNotification("Cannot undo from current state", "warning");
      return;
    }

    // Pop the most recent pre-turn snapshot off the stack - restoring full
    // mechanical state (NPCs, quests, stats, timers, combat, etc.), not just
    // the conversational scene.parts record (the "misread input" gap - see
    // §2.5 in docs/research-paper-ttrpg-theory-gap-analysis.md). The stack
    // is persisted, so this works the same right after a reload as it does
    // mid-session, and repeated Undo clicks keep walking back turn by turn
    // instead of degrading after the first.
    const snapshot = undoStackRef.current[undoStackRef.current.length - 1];
    if (!snapshot) {
      addNotification(
        "Nothing to undo - no saved state for this turn",
        "warning",
      );
      return;
    }

    logger.action("User requested undo");
    // The undone turn's GM pictures are still queued or painting: drop them.
    if (lastTurnCostIdRef.current) {
      cancelImageJobsForTurn(lastTurnCostIdRef.current, "gm");
    }

    // Restore in place (mutate the existing object, matching this
    // codebase's storyData-mutation convention) rather than swapping to a
    // new object reference, so every other handler's closure over
    // `storyData` keeps working unchanged.
    for (const key of Object.keys(storyData)) {
      delete (storyData as unknown as Record<string, unknown>)[key];
    }
    Object.assign(storyData, snapshot);
    undoStackRef.current = undoStackRef.current.slice(0, -1);
    persistUndoStack();
    logger.action("Undo restored full pre-turn state (mechanics included)");

    // Mutating storyData in place doesn't trigger a re-render on its own -
    // without this, the restored state (combat, NPCs, stats, etc.) is
    // correct in memory but the UI keeps showing what was on screen before
    // Undo was clicked.
    setStoryData({ ...storyData });

    // Update state to previous scene part
    if (storyData.scene.parts.length > 0) {
      const previousPart =
        storyData.scene.parts[storyData.scene.parts.length - 1];
      setStoryText(previousPart.content);
      setChoices({ choices: previousPart.choices || [] });
      const inputs =
        previousPart.choices?.reduce(
          (acc, choice) => ({ ...acc, [choice.text]: false }),
          {} as Record<string, boolean>,
        ) || {};
      setInput(inputs);
    }

    setCanRetry(false);
    setCanUndo(undoStackRef.current.length > 0 && storyData.scene.parts.length >= 2);
    addNotification("Undone last action", "success");

    // Save progress
    await saveProgress(storyData, true);
  }

  // Undo an observer rewrite (see observer.ts's rewriteFlaggedNarration and
  // ScenePart.observerRewriteOriginal): put the GM's original draft back,
  // exactly as it was before the observer replaced it. The observer's
  // judgement is a heuristic - "too long" in particular is often the long
  // explanation the player actually wanted - so the player gets the last
  // word. Restores the prose, the choices parsed from it, and the GM history
  // together, since the rewrite changed all three. Reached through the normal
  // Undo button (handleUndo), not a button of its own.
  //
  // `partIndex` is the turn to restore (default: the latest). A background
  // rewrite lands on the turn it judged, which may no longer be the newest, so
  // the restore is attached to that exact turn (judge-layer design 4).
  async function restoreObserverOriginal(partIndex?: number) {
    if (!storyData || turnLocked || turnInFlightRef.current) return;

    const lastIdx =
      partIndex ?? storyData.scene.parts.length - 1;
    const lastPart = lastIdx >= 0 ? storyData.scene.parts[lastIdx] : undefined;
    const original = lastPart?.observerRewriteOriginal;
    if (!lastPart || !original) {
      addNotification("No observer revision to undo", "warning");
      return;
    }

    logger.action("User restored the pre-observer-rewrite narration", {
      type: original.flag.type,
      detail: original.flag.detail,
    });

    storyData.scene.parts[lastIdx] = {
      ...lastPart,
      content: original.content,
      // `raw` is left alone: the rewrite never overwrote it, so it still
      // holds this same original draft (thinking tags and all).
      gmConversation: original.gmConversation ?? lastPart.gmConversation,
      gmThinking: original.gmThinking ?? lastPart.gmThinking,
      choices: original.choices ?? lastPart.choices,
      observerRewriteOriginal: undefined,
      // buildObserverCorrectionNote (observer.ts) turns this into a "your
      // draft had to be corrected" note in the next turn's prompt. The player
      // just ruled the draft fine, so the note has to go with it - otherwise
      // the GM gets told off for prose that's back in the story.
      correctedObserverFlags: undefined,
    };

    const restoredPart = storyData.scene.parts[lastIdx];
    // The screen's current narration and choices follow only the newest turn.
    if (lastIdx === storyData.scene.parts.length - 1) {
      setStoryText(restoredPart.content);
      if (restoredPart.choices) {
        setChoices({ choices: restoredPart.choices });
        setInput(
          restoredPart.choices.reduce(
            (acc, choice) => ({ ...acc, [choice.text]: false }),
            {} as Record<string, boolean>,
          ),
        );
      }
    }
    setStoryData({ ...storyData });

    await saveProgress(storyData, true);
    addNotification(
      "Undid the Observer's revision - the GM's original response is back",
      "success",
    );
  }

  async function handleEdit(editedText: string, partIndex: number) {
    if (!storyData || loading) return;

    if (partIndex < 0 || partIndex >= storyData.scene.parts.length) {
      addNotification("Invalid part to edit", "failure");
      return;
    }

    const partToEdit = storyData.scene.parts[partIndex];

    // Only allow editing AI responses
    if (partToEdit.user) {
      addNotification("Can only edit AI responses", "warning");
      return;
    }

    logger.action("User editing story part", {
      partIndex,
      originalLength: partToEdit.content.length,
      editedLength: editedText.length,
    });

    // If the text contains tags, re-parse it to update structured data
    if (
      editedText.includes("<output>") ||
      editedText.includes("<story>") ||
      editedText.includes("<choices>") ||
      editedText.includes("<memory>") ||
      editedText.includes("<commands>")
    ) {
      const parsedPart = outputToScenePart(editedText);
      storyData.scene.parts[partIndex] = {
        ...partToEdit,
        ...parsedPart,
        raw: editedText, // Store the edited raw text
        // The player's own text supersedes both the Observer's rewrite and
        // the draft it replaced - restoring an older draft over an edit
        // would silently throw that edit away.
        observerRewriteOriginal: undefined,
      };

      // Update UI if this is the current/last part
      if (partIndex === storyData.scene.parts.length - 1) {
        setStoryText(parsedPart.content);
        if (parsedPart.choices) {
          setChoices({ choices: parsedPart.choices });
        }
      }
    } else {
      // Just update content and raw text
      storyData.scene.parts[partIndex] = {
        ...partToEdit,
        content: editedText,
        raw: editedText,
        observerRewriteOriginal: undefined,
      };

      // Update UI if this is the current/last part
      if (partIndex === storyData.scene.parts.length - 1) {
        setStoryText(editedText);
      }
    }

    setStoryData({ ...storyData });
    addNotification("Story narration edited successfully", "success");

    // Save progress to database
    await saveProgress(storyData);
  }

  async function handleRerollChoices() {
    if (!storyData || loading) return;

    setLoading(true);
    setLoadingStage("choices");

    try {
      const { choicesModel } = getModelsFromPreset();
      const { generateChoicesOnly } = await import("../misc/generation");

      const newChoices = await generateChoicesOnly(storyData, {
        choicesModel,
        choicesReasoningEffort: getEffectiveNarrationEffort(),
        openRouterKey,
        deepseekKey,
        googleKey,
        mistralKey,
        deepinfraKey,
        zaiKey,
      });

      // Update the last part with new choices
      const lastPartIndex = storyData.scene.parts.length - 1;
      if (lastPartIndex >= 0 && !storyData.scene.parts[lastPartIndex].user) {
        storyData.scene.parts[lastPartIndex] = {
          ...storyData.scene.parts[lastPartIndex],
          choices: newChoices,
        };
      }

      setChoices({ choices: newChoices });
      setStoryData({ ...storyData });

      // Save progress
      await saveProgress(storyData);
      addNotification("Choices regenerated!", "success");
    } catch (error: any) {
      console.error("Error regenerating choices:", error);
      addNotification(
        `Failed to regenerate choices: ${error.message}`,
        "failure",
      );
    } finally {
      setLoading(false);
      setLoadingStage(null);
    }
  }

  if (loadingStory) {
    return (
      <div
        className="min-h-dvh bg-ys-bg"
        style={fullHeightStyle}
      >
        <div className="flex items-center justify-center min-h-dvh">
          <div className="text-center">
            <div className="animate-spin rounded-full h-10 w-10 border-2 border-ys-accent border-t-transparent mx-auto"></div>
            <p className="mt-4 text-sm text-ys-muted">Loading story...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!storyData) {
    return (
      <div
        className="min-h-dvh bg-ys-bg"
        style={fullHeightStyle}
      >
        <div className="flex items-center justify-center min-h-dvh">
          <div className="text-center bg-ys-surface backdrop-blur-xl rounded-2xl p-6 border border-ys-border">
            <DynamicIcon
              name="FileQuestion"
              className="w-12 h-12 text-ys-muted mx-auto mb-3"
            />
            <p className="text-ys-muted mb-4">Story not found</p>
            <button
              onClick={() => router.push("/library")}
              className="px-4 py-2 bg-ys-accent text-ys-on-accent font-medium rounded-lg shadow-md shadow-ys-accent/40 transition-all"
            >
              Browse Adventures
            </button>
          </div>
        </div>
      </div>
    );
  }

  //Showpresetselectionbeforestartingstory
  if (showPresetSelection && storyData) {
    const availablePresets = [
      DEFAULT_PRESET,
      ...(storyData.presets || []).filter((p) => p.id !== "custom"),
    ];

    return (
      <div
        className="min-h-dvh bg-ys-bg"
        style={fullHeightStyle}
      >
        <div className="py-6 px-4">
          <div className="w-full px-2 sm:max-w-3xl mx-auto">
            {/* Header */}
            <div className="text-center mb-6">
              <h1 className="text-2xl sm:text-3xl font-bold text-ys-text mb-2">
                {storyData.story_name}
              </h1>
              <p className="text-sm text-ys-muted">
                Choose your character to begin
              </p>
            </div>

            {/* Preset Selection */}
            <div className="bg-ys-surface backdrop-blur-xl rounded-2xl border border-ys-border p-4 mb-4">
              <h2 className="text-lg font-semibold text-ys-text mb-4 flex items-center gap-2">
                <DynamicIcon name="Users" className="w-5 h-5 text-ys-accent" />
                Select Character
              </h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {availablePresets.map((preset) => (
                  <button
                    key={preset.id}
                    onClick={() => handlePresetSelect(preset)}
                    className={`rounded-xl p-4 text-left transition-all border backdrop-blur-md ${
                      preset.id === "custom"
                        ? "bg-ys-accent/[0.06] border-ys-accent/20 hover:border-ys-accent/40"
                        : "bg-ys-surface border-ys-border hover:border-ys-border"
                    }`}
                  >
                    <div className="flex items-start gap-3 mb-2">
                      <div
                        className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                          preset.id === "custom"
                            ? "bg-ys-accent/20"
                            : "bg-ys-accent/20"
                        }`}
                      >
                        <DynamicIcon
                          name={preset.icon}
                          className={`w-5 h-5 ${
                            preset.id === "custom"
                              ? "text-ys-accent"
                              : "text-ys-accent"
                          }`}
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-ys-text text-sm">
                          {preset.name}
                        </h3>
                        <p className="text-xs text-ys-muted line-clamp-2">
                          {preset.description}
                        </p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Back Button */}
            <button
              onClick={() => router.push("/library")}
              className="px-4 py-2 bg-ys-surface hover:bg-ys-surface-2 text-ys-text text-sm font-medium rounded-lg border border-ys-border transition-colors flex items-center gap-2"
            >
              <DynamicIcon name="ArrowLeft" className="w-4 h-4" />
              Back to Library
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Off the story (Notes, NPCs, Goals, logs, context) the header's back
  // button returns to the story and its title is the page's name.
  const offStoryPageTitles: Partial<Record<StoryState, string>> = {
    [StoryState.LORE]: "Notes",
    [StoryState.NPCS]: "NPCs",
    [StoryState.GOALS]: "Goals",
    [StoryState.LOGS]: "Debug Logs",
    [StoryState.CONTEXT]: "AI Context",
  };
  const offStoryPage = currentState in offStoryPageTitles;
  const headerTitle =
    offStoryPageTitles[currentState] ?? (storyData?.story_name || "Untitled Story");

  // The story's window shortcuts (Enter/Space, Ctrl+Z, Ctrl+R, arrows) stand
  // down while anything sits over the story: the menu sheet, the OOC panel
  // or a play modal.
  const shortcutsSuspended =
    menuOpen ||
    (showOOCChat && !!netSession) ||
    partyLobbyOpen ||
    profilePickerOpen ||
    !!manualRollRequest ||
    !!askQuestionRequest ||
    !!setupConfirmRequest ||
    !!diceThrowRequest ||
    confirmDialog.isOpen ||
    syncConflict.isOpen;

  return (
    <div
      className={`relative flex flex-col min-h-dvh py-0 px-0 pb-0 sm:py-4 sm:px-4 sm:pb-20 ${
        currentState === StoryState.STORY
          ? "bg-ys-bg text-ys-text"
          : "bg-ys-bg"
      }`}
      style={fullHeightStyle}
    >
      {/* Ambient glow orbs - purely decorative, sits behind all content. The
          story itself sits on the theme's plain background; the Notes, NPC
          and Goal pages keep the backdrop they were designed for. */}
      {currentState !== StoryState.STORY && (
        <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
          <div className="absolute -top-24 -left-24 w-96 h-96 rounded-full bg-ys-accent/20 blur-[100px]" />
          <div className="absolute top-1/3 -right-32 w-96 h-96 rounded-full bg-ys-accent/15 blur-[110px]" />
          <div className="absolute bottom-0 left-1/4 w-80 h-80 rounded-full bg-ys-accent/10 blur-[100px]" />
        </div>
      )}
      <main className="flex flex-1 min-h-0 gap-2 sm:gap-4 w-full px-0 sm:px-2 sm:max-w-4xl mx-auto flex-col">
        <StoryHeader
          title={headerTitle}
          backLabel={offStoryPage ? "Back to the story" : "Leave to Library"}
          onBack={() =>
            offStoryPage
              ? setCurrentState(StoryState.STORY)
              : router.push("/library")
          }
          onOpenMenu={() => setMenuOpen(true)}
          attention={
            syncStatus === "conflict" || !!netSession || oocUnread > 0
          }
        />

        {/* Render current page */}
        <div
          key={currentState}
          ref={setContentWrapperRef}
          className="animate-fade-in flex-1 min-h-0 flex flex-col"
        >
        {currentState === StoryState.STORY && (
          <div
            className="flex flex-col"
            style={
              contentAreaHeight
                ? { height: `${contentAreaHeight}px` }
                : undefined
            }
          >
          <Story
            storyData={storyData}
            storyId={storyDbId || undefined}
            storyText={storyText}
            choices={choices}
            input={input}
            loading={loading}
            loadingStage={shownLoadingStage}
            storyTextReady={storyTextReady}
            handleChoice={handleChoice}
            handleSelect={handleSelect}
            onCustomInput={handleCustomInput}
            onActionConfirm={handleActionConfirm}
            onCommentSubmit={handleCommentSubmit}
            onRerollChoices={handleRerollChoices}
            onRetry={handleRetry}
            interruptedTurn={interruptedTurn ?? undefined}
            onRetryInterrupted={handleRetryInterrupted}
            onDismissInterrupted={handleDismissInterrupted}
            canRetry={canRetry}
            onUndo={handleUndo}
            onUndoRevision={(partIndex) => void restoreObserverOriginal(partIndex)}
            canUndo={canUndo}
            onStop={handleStop}
            onEdit={handleEdit}
            onNavigateLeft={handleNavigateLeft}
            onNavigateRight={handleNavigateRight}
            onResetToCurrentPart={resetToCurrentPart}
            onOpenNote={handleOpenNote}
            onChooseSetupStyle={handleChooseSetupStyle}
            pendingUserChoice={pendingUserChoice}
            liveGMEntries={liveGMEntries}
            liveNarrationText={liveNarrationText}
            liveReasoningTier={liveReasoningTier}
            myPlayerId={netSession ? netSession.myLocalPlayerId : undefined}
            remoteActivity={netActivity}
            onLocalActivity={sendNetActivity}
            netSession={netSession}
            shortcutsSuspended={shortcutsSuspended}
            onViewportRecalc={updateHeights}
            // Party-voice floor (talking stick). Only meaningful in a
            // networked room; couch play runs its own local floor.
            floorHolderId={netSession ? floorSnapshot.holderId : undefined}
            floorLockedOutIds={netSession ? floorSnapshot.lockedOutIds : undefined}
            onFloorTake={netSession ? requestFloorTake : undefined}
            onFloorRelease={netSession ? requestFloorRelease : undefined}
            // Host relays its generated TTS audio to guests; guests play the
            // relayed audio instead of generating their own.
            onTTSAudioChunk={
              netSession?.role === "host"
                ? (turnId, index, base64) =>
                    broadcastNetTTSAudio({ turnId, index, dataB64: base64, done: false })
                : undefined
            }
            onTTSAudioEnd={
              netSession?.role === "host"
                ? (turnId) =>
                    broadcastNetTTSAudio({ turnId, index: -1, dataB64: "", done: true })
                : undefined
            }
            ttsRelayMode={netSession?.role === "guest"}
            ttsRelayHandleRef={ttsRelayRef}
            turnLobby={turnLobby}
            onTurnLobbyStartNow={hostForceStartTurn}
            onTurnLobbyPass={passThisRound}
            partyTable={party.table}
            onPartyGo={party.go}
            onPartyJoin={() => setPartyLobbyOpen(true)}
            onPartyRemove={party.removePlayer}
            onPartyAnswerHere={answerPartyRequestHere}
            // Pictures are the host's (decision 60): a guest holds none.
            onIllustrate={
              canMakePictures && !illustrating && netSession?.role !== "guest"
                ? handleIllustrate
                : undefined
            }
            onRegenerateImage={
              netSession?.role === "guest" ? undefined : handleRegenerateImage
            }
          />
          </div>
        )}
        {/* Host timed out / dropped: let the guest re-join the same room
            rather than being silently stranded. */}
        {netSession?.role === "guest" && hostDisconnected && (
          <div className="fixed inset-x-0 top-0 z-50 flex justify-center px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pointer-events-none">
            <div className="pointer-events-auto w-full max-w-md rounded-2xl bg-ys-surface/95 backdrop-blur-xl border border-ys-warning/30 shadow-2xl p-4 flex items-center gap-3">
              <DynamicIcon
                name="WifiOff"
                className="w-5 h-5 text-ys-warning shrink-0"
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-ys-text">
                  Lost connection to the host
                </p>
                <p className="text-xs text-ys-muted">
                  Reconnect to the same room, or leave to play on your own.
                </p>
              </div>
              <button
                type="button"
                onClick={handleGuestReconnect}
                className="shrink-0 px-3 py-2 text-sm font-semibold rounded-xl bg-ys-accent text-ys-on-accent transition-all"
              >
                Reconnect
              </button>
              <button
                type="button"
                onClick={() => leaveNetRoom()}
                className="shrink-0 px-3 py-2 text-sm font-semibold rounded-xl bg-ys-surface hover:bg-ys-surface-2 border border-ys-border text-ys-text transition-colors"
              >
                Leave
              </button>
            </div>
          </div>
        )}
        {/* Guest profile picker: pick a saved character or create one right
            after connecting, before claiming a seat. */}
        <ProfilePickerModal
          isOpen={profilePickerOpen}
          connecting={profilePickerConnecting}
          savedProfiles={storyData?.multiplayer?.couchPlayers ?? []}
          defaultName={pendingJoinNameRef.current}
          defaultColor={pendingJoinColorRef.current}
          onClaim={(profile) => {
            announceNetProfile(profile);
            setProfilePickerOpen(false);
          }}
          onCancel={() => {
            setProfilePickerOpen(false);
            leaveNetRoom();
            router.push("/library");
          }}
        />
        {currentState === StoryState.LORE && (
          <LorePage
            {...storyData}
            onUpdateLore={(updatedLore) =>
              updateStoryData({ lore: updatedLore })
            }
            initialSelectedTitle={
              pendingNoteOpen?.kind === "lore" ? pendingNoteOpen.id : undefined
            }
            onMakePlayerPortrait={
              canMakePictures && netSession?.role !== "guest"
                ? handleMakePlayerPortrait
                : undefined
            }
          />
        )}
        {currentState === StoryState.NPCS && (
          <NPCsPage
            {...storyData}
            onUpdateNPCs={(updatedNPCs) =>
              updateStoryData({ npcs: updatedNPCs })
            }
            onMakePortrait={
              canMakePictures && netSession?.role !== "guest"
                ? handleMakeNpcPortrait
                : undefined
            }
            initialSelectedId={
              pendingNoteOpen?.kind === "npc" ? pendingNoteOpen.id : undefined
            }
          />
        )}
        {currentState === StoryState.GOALS && <GoalsPage {...storyData} />}
        {currentState === StoryState.LOGS && <LogViewer />}
        {currentState === StoryState.CONTEXT && (
          <ContextViewer storyData={storyData} />
        )}
        </div>
      </main>

      {/* The story menu: a sheet over whatever page is showing. */}
      <StoryMenuSheet
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        modalOpen={menuModalOpen}
      >
          <MenuPage
            {...storyData}
            storyDbId={storyDbId}
            sourceAdventureId={sourceAdventureId}
            onSaveProgress={async (updatedStoryData) => {
              await saveProgress(updatedStoryData || storyData);
            }}
            onUpdateStoryData={updateStoryData}
            onNavigate={(target: MenuNavTarget) =>
              setCurrentState(StoryState[target])
            }
            onOpenOOCChat={() => setShowOOCChat(true)}
            syncStatus={syncStatus}
            oocUnread={oocUnread}
            viewingPartIndex={viewingPartIndex}
            onJumpToPart={(index) => {
              handleNavigateToIndex(index);
              setCurrentState(StoryState.STORY);
            }}
            onClose={() => setMenuOpen(false)}
            onModalOpenChange={setMenuModalOpen}
            netSession={netSession}
            netPeers={netPeers}
            onCreateNetRoom={createNetRoom}
            onJoinNetRoom={async (backend, roomId, name, color) => {
              // Joining from the in-story Online Play editor: same deferred
              // flow as the deep link - connect, then pick a profile.
              pendingJoinNameRef.current = name;
              pendingJoinColorRef.current = color;
              setProfilePickerOpen(true);
              setProfilePickerConnecting(true);
              try {
                await joinNetRoom(backend, roomId, name, color);
              } catch (error) {
                setProfilePickerOpen(false);
                setProfilePickerConnecting(false);
                throw error;
              }
            }}
            onLeaveNetRoom={leaveNetRoom}
            onSwitchNetBackend={switchNetBackend}
            party={party}
            autoOpenSection={autoOpenOnlineSection ? "online" : undefined}
          />
      </StoryMenuSheet>

      {/* OOC chat - rendered at page level to persist across tabs, only
          while an online multiplayer session is active. */}
      {netSession && (
        <OOCChatPanel
          isOpen={showOOCChat}
          onClose={() => setShowOOCChat(false)}
          messages={oocMessages}
          myLocalPlayerId={netSession.myLocalPlayerId}
          onSend={sendNetOOCChat}
        />
      )}

      {/* Party mode: the QR again, for someone joining mid-game */}
      {partyLobbyOpen && (
        <PartyLobbyModal
          party={party}
          onClose={() => setPartyLobbyOpen(false)}
        />
      )}

      {/* Manual dice mode: the GM asked for a physical roll - generation is
          paused until the player enters their total (or skips) */}
      <ManualRollModal
        request={manualRollRequest}
        couchPlayers={storyData?.multiplayer?.couchPlayers}
        onSubmit={(rawText) => resolveManualRoll({ rawText })}
        onSkip={() => resolveManualRoll(null)}
      />

      {/* Ask-question tool: the GM asked one or more predefined-choice +
          free-text questions - generation is paused until answered/skipped */}
      <AskQuestionModal
        request={askQuestionRequest}
        couchPlayers={storyData?.multiplayer?.couchPlayers}
        onAnswer={resolveAskQuestion}
        onSkipAll={() => resolveAskQuestion(null)}
      />

      {/* Session zero: the setup card (confirm_setup) - generation is paused
          until the player starts the story, asks for changes or closes it */}
      <SetupConfirmModal
        request={setupConfirmRequest}
        onAnswer={resolveSetupConfirmation}
      />

      {/* Physical dice mode: the GM's roll can be thrown on a 3D dice tray -
          generation is paused until the dice settle (or the player skips) */}
      <DiceThrowModal
        request={diceThrowRequest}
        onResolve={resolveDiceThrow}
      />

      {/*ConfirmDialog*/}
      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        title={confirmDialog.title}
        message={confirmDialog.message}
        icon={confirmDialog.icon}
        confirmText={confirmDialog.confirmText}
        confirmButtonClass={confirmDialog.confirmButtonClass}
        onConfirm={confirmDialog.onConfirm}
        onCancel={() => setConfirmDialog({ ...confirmDialog, isOpen: false })}
      />

      {/* Sync Conflict Modal */}
      {storyData && (
        <SyncConflictModal
          isOpen={syncConflict.isOpen}
          onClose={() => setSyncConflict({ ...syncConflict, isOpen: false })}
          storyName={storyData.story_name}
          localUpdatedAt={new Date()}
          serverUpdatedAt={syncConflict.serverUpdatedAt}
          localPartCount={syncConflict.localPartCount}
          serverPartCount={syncConflict.serverPartCount}
          onKeepLocal={async () => {
            // Keep local version - push to server
            setSyncConflict({ ...syncConflict, isOpen: false });
            setSyncStatus("pending");
            if (storyDbId && storyData) {
              await performSave(storyData);
            }
            addNotification(
              "Local version kept, syncing to cloud...",
              "success",
            );
          }}
          onKeepServer={async () => {
            // Keep server version - update local
            if (syncConflict.serverData && storyDbId) {
              const { saveLocalStory } =
                await import("@/app/misc/localStoryManager");
              await saveLocalStory(storyDbId, syncConflict.serverData, null, {
                serverUpdatedAt: syncConflict.serverUpdatedAt,
                markAsSynced: true,
              });
              setStoryData(syncConflict.serverData);
              // Setup UI from server data
              const lastPart =
                syncConflict.serverData.scene.parts[
                  syncConflict.serverData.scene.parts.length - 1
                ];
              if (lastPart) {
                setStoryText(lastPart.content);
                setChoices({ choices: lastPart.choices || [] });
              }
              setSyncStatus("synced");
              addNotification("Cloud version restored", "success");
            }
            setSyncConflict({ ...syncConflict, isOpen: false });
          }}
        />
      )}

      {/* NPC Reaction Notifications (social media style) */}
      <NPCReactionContainer
        reactions={pendingNPCReactions}
        onDismissReaction={(index) => {
          setPendingNPCReactions((prev) => prev.filter((_, i) => i !== index));
        }}
      />
    </div>
  );
}

export default function StoryPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-dvh bg-ys-bg flex items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-ys-accent"></div>
        </div>
      }
    >
      <StoryPageContent />
    </Suspense>
  );
}
