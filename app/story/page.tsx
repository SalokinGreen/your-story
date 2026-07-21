"use client";

import {
  Scene,
  ScenePart,
  StoryData,
  StoryLore,
  Choices,
  Choice,
  Resource,
  InventoryItem,
  Ability,
  Preset,
  CommandResponse,
  getMemoryContent,
  deduplicateMemories,
  NPCReaction,
  Adventure,
  CouchPlayer,
} from "../misc/structs";
import { useNetSession } from "../misc/multiplayer/useNetSession";
import type { MPBackend } from "../misc/multiplayer/types";
import {
  askFate,
  generateElement,
  generateEventFocus,
  generateEventMeaning,
  classifyPlayerStyle,
  classifyToolActivityStyle,
  type Likelihood,
  type ElementCategory,
} from "../misc/mythic";
import { NARRATION_MODEL_KEY } from "../misc/reasoningTiers";
import Story from "./story";
import LorePage from "./lore";
import GoalsPage from "./goals";
import NPCsPage from "./npcs";
import MenuPage from "./menu";
import { StoryTabBar } from "./StoryTabBar";
import LogViewer from "./LogViewer";
import ContextViewer from "./ContextViewer";
import StoryCreativeAssistant from "../components/StoryCreativeAssistant";
import ManualRollModal from "../components/ManualRollModal";
import DiceThrowModal from "../components/DiceThrowModal";
import type {
  ManualRollRequest,
  ManualRollAnswer,
  DiceThrowRequest,
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
import { useState, useEffect, useRef, useCallback, Suspense } from "react";
import { useNotification } from "../misc/NotificationContext";
import { useAPIKeys } from "../misc/APIKeysContext";
import { useSearchParams, useRouter } from "next/navigation";

// Helper function to get models for generation options.
// storyModel/toolsModel/choicesModel are no longer read from presets or
// localStorage - the reasoning-tier router (generation.ts) picks the actual
// model per stage/turn internally. These fields stay on GenerationOptions
// for type compatibility with other callers, filled with the narration
// model as an inert default that's never actually dispatched to.
function getModelsFromPreset() {
  return {
    storyModel: NARRATION_MODEL_KEY,
    toolsModel: NARRATION_MODEL_KEY,
    choicesModel: NARRATION_MODEL_KEY,
  };
}

import { DEFAULT_PRESET } from "../misc/presets";
import ConfirmDialog from "../components/ConfirmDialog";
import SyncConflictModal from "../components/SyncConflictModal";
import SyncIndicator from "../components/SyncIndicator";
import { getAuthToken } from "../misc/getAuthToken";
import {
  syncLoreEmbeddings,
  syncNewMemories,
  getExistingEmbeddingKeys,
} from "../misc/embeddings";
import { getModelConfig } from "../misc/ai_prices";
import { processLoreTriggers } from "../misc/lore";
import { fillTemplate } from "../misc/characterSheetTemplate";
import { DynamicIcon } from "../components/DynamicIcon";
import { outputToScenePart } from "../misc/ai";
import { generateStoryTurn, analyzeAction } from "../misc/generation";
import { GMNPCReactionResult } from "../misc/gmExecutor";
import { tickCooldowns } from "../misc/abilitySystem";
import CharacterCreationForm from "./create-character/form";
import { NPCReactionContainer } from "./NPCReactionToast";
import { getSamplingSettings } from "../misc/samplingSettings";

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

// Helper to track player actions between turns (shown to AI on next generation)
function trackPlayerAction(storyData: StoryData, action: string) {
  if (!storyData.pendingPlayerActions) {
    storyData.pendingPlayerActions = [];
  }
  storyData.pendingPlayerActions.push(action);
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

enum StoryState {
  STORY = "STORY",
  STATS = "STATS",
  LORE = "LORE",
  NPCS = "NPCS",
  GOALS = "GOALS",
  MENU = "MENU",
  LOGS = "LOGS",
  CONTEXT = "CONTEXT",
  CHARACTER_CREATION = "CHARACTER_CREATION",
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
    braveSearchKey,
  } = apiKeys;
  const [currentState, setCurrentState] = useState<StoryState>(
    StoryState.STORY,
  );
  // Real, JS-measured viewport height in px. Some mobile browsers (in
  // particular embedded/in-app webviews) don't support the `dvh` unit and
  // fall back to a stale `100vh` that ignores the address bar/toolbar,
  // leaving a gap of bare body background below the game area. Measuring
  // window.visualViewport (falling back to window.innerHeight) and applying
  // it as an inline min-height is a more reliable fix than CSS units alone.
  const [viewportHeight, setViewportHeight] = useState<number | null>(null);
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
    setViewportHeight(vh);
    if (contentWrapperRef.current) {
      const top = contentWrapperRef.current.getBoundingClientRect().top;
      setContentAreaHeight(Math.max(200, vh - top));
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
  const [storyData, setStoryData] = useState<StoryData | null>(null);
  const [storyDbId, setStoryDbId] = useState<string | null>(null);
  const [sourceAdventureId, setSourceAdventureId] = useState<string | null>(
    null,
  );
  const saveTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const hasLoadedStoryRef = useRef<string | null>(null); // Track loaded story ID to prevent re-fetching on tab focus
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
    ((faces: number[] | null) => void) | null
  >(null);
  // Full pre-turn StoryData snapshot, taken right before each turn's GM
  // tool calls can mutate state. Session-only (not persisted) - lets
  // handleUndo actually undo a turn's mechanical state changes (NPC
  // attitude, quests, stats, etc.), not just its scene.parts entries. See
  // §2.5 in docs/research-paper-ttrpg-theory-gap-analysis.md - this closes
  // the "misread input" rollback gap by fixing Undo's existing scope
  // rather than adding a new UX concept.
  const preTurnSnapshotRef = useRef<StoryData | null>(null);
  const [choices, setChoices] = useState<Choices>({ choices: [] });
  const [input, setInput] = useState<Record<string, boolean>>({});
  const [storyText, setStoryText] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingStage, setLoadingStage] = useState<
    "gm" | "story" | "choices" | null
  >(null);
  // Pending user choice text - shown in chat while GM is generating
  const [pendingUserChoice, setPendingUserChoice] = useState<string>("");

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
    createRoom: createNetRoom,
    joinRoom: joinNetRoom,
    leaveRoom: leaveNetRoom,
    switchBackend: switchNetBackend,
    sendChoice: sendNetChoice,
    sendFreeform: sendNetFreeform,
    sendVoice: sendNetVoice,
    sendActivity: sendNetActivity,
  } = useNetSession({
    storyData,
    loading,
    onGuestAction: (action) => {
      if (action.kind === "choice") {
        if (action.choiceIndex === null) return;
        const targetChoice = choices.choices[action.choiceIndex];
        if (targetChoice) handleChoiceWithAction(targetChoice);
      } else if (action.text) {
        // freeform and voice (voice arrives as already-transcribed text -
        // see PlayerBubbles wiring) both land here as a custom input
        // attributed to the sending guest's seat.
        handleCustomInput(action.text, undefined, [action.localPlayerId]);
      }
    },
    onSnapshot: (incoming) => {
      setStoryData(incoming);
      const lastPart = incoming.scene.parts[incoming.scene.parts.length - 1];
      if (lastPart) {
        setStoryText(lastPart.content);
        setChoices({ choices: lastPart.choices || [] });
      }
      setPendingUserChoice("");
      setLoading(false);
      setLoadingStage(null);
    },
    onGuestJoined: (info) => {
      setStoryData((prev) => {
        if (!prev) return prev;
        const existingPlayers = prev.multiplayer?.couchPlayers ?? [];
        if (existingPlayers.some((p) => p.id === info.localPlayerId)) {
          addNotification(`${info.displayName} reconnected`, "success");
          return prev; // reconnect - seat already exists
        }
        addNotification(`${info.displayName} joined the room`, "success");
        const newPlayer: CouchPlayer = {
          id: info.localPlayerId,
          name: info.displayName,
          color: info.color,
        };
        return {
          ...prev,
          multiplayer: {
            ...prev.multiplayer,
            enabled: true,
            couchPlayers: [...existingPlayers, newPlayer],
          },
        };
      });
    },
    onPeerLeft: (localPlayerId) => {
      const departed = storyData?.multiplayer?.couchPlayers?.find(
        (p) => p.id === localPlayerId,
      );
      addNotification(`${departed?.name ?? "A player"} disconnected`, "warning");
    },
  });

  // Guest's only link (the host) dropped - fall back to a normal local view
  // rather than leaving the player stuck sending actions into the void.
  useEffect(() => {
    if (!hostDisconnected) return;
    addNotification("Host disconnected", "failure");
    leaveNetRoom();
  }, [hostDisconnected, addNotification, leaveNetRoom]);

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

  // Live GM streaming state - chronological thinking/tool/text blocks,
  // rendered inline (Claude-style) as they arrive - see turnTimeline.ts
  const [liveGMEntries, setLiveGMEntries] = useState<TimelineBlock[]>([]);
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
  const [selectedPreset, setSelectedPreset] = useState<Preset | null>(null);
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

  const handleCharacterCreate = async (
    characterData: Record<string, string>,
  ) => {
    if (!storyData || !selectedPreset) return;
    logger.action("User created custom character", { characterData });

    const updatedStoryData = {
      ...storyData,
      characterData,
      selected_preset: selectedPreset.id,
    };

    // For custom preset, generate a character sheet from the template and filled data
    if (
      updatedStoryData.characterSheetTemplate?.template &&
      Object.keys(characterData).length > 0
    ) {
      // Use the proper fillTemplate function that handles "FieldName (Category)" syntax
      const filledSheet = fillTemplate(
        updatedStoryData.characterSheetTemplate.template,
        characterData,
      );
      updatedStoryData.characterSheet = filledSheet;

      // Add character sheet to lore as "character_sheet" type for AI context
      const characterSheetLore: StoryLore = {
        title: "Player Character Sheet",
        content: filledSheet,
        relatedCharacters: [],
        relatedLocations: [],
        secrtet: false,
        keys: [],
        type: "character_sheet",
        on: true,
        on_triggers: [],
        off_triggers: [],
        var_on_triggers: [],
        var_off_triggers: [],
      };
      updatedStoryData.lore = [
        ...(updatedStoryData.lore || []),
        characterSheetLore,
      ];
    }

    // Determine starting choices
    const startingChoices = updatedStoryData.starting_choices?.length
      ? updatedStoryData.starting_choices.map((sc) => ({
          text: sc.text,
          intro_override: sc.intro_override,
        }))
      : [{ text: "Start Story" }];

    // Add starting scene part
    updatedStoryData.scene.parts.push({
      content: updatedStoryData.intro || "The story begins.",
      imageUrl: "",
      user: false,
      role: "assistant",
      choices: startingChoices,
    });

    setStoryData(updatedStoryData);
    setShowPresetSelection(false);
    setCurrentState(StoryState.STORY);
    setStarted(true);

    // Set story text and choices from the first part
    const lastPart =
      updatedStoryData.scene.parts[updatedStoryData.scene.parts.length - 1];
    setStoryText(lastPart.content);
    setChoices({ choices: lastPart.choices || [] });

    // Save the story
    await performSave(updatedStoryData);
  };

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

  // AI Story Editor state (lifted from menu so it persists across tabs)
  const [showAIAssistant, setShowAIAssistant] = useState(false);
  const [isAIPinned, setIsAIPinned] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("storyAIPinned") === "true";
    }
    return false;
  });

  const handleAIPinToggle = () => {
    setIsAIPinned((prev) => {
      const next = !prev;
      localStorage.setItem("storyAIPinned", String(next));
      return next;
    });
  };

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

    // Can undo if we have at least 2 parts and last part is from AI
    setCanUndo(storyData.scene.parts.length > 1 && hasAIPart);

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
      // Also migrate "mythic" item grades to "mythic" for backward compatibility
      import("@/app/misc/mythicChaos").then(
        ({ migrateAGMTState, migrateItemGrades }) => {
          if (loadedStoryData.agmtState) {
            loadedStoryData.agmtState = migrateAGMTState(
              loadedStoryData.agmtState!,
            );
          }
          // Migrate item grades from "mythic" to "mythic"
          migrateItemGrades(loadedStoryData);
        },
      );

      //Initializegoalarraysiftheydon'texist(forbackwardscompatibility)
      if (!loadedStoryData.goals) loadedStoryData.goals = [];

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
        setShowPresetSelection(true);
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
        const { getLocalStory } = await import("@/app/misc/localStoryManager");
        const localStory = await getLocalStory(storyId!);

        if (!localStory) {
          throw new Error("Local story not found");
        }

        console.log("Local story loaded:", localStory);
        setStoryDbId(localStory.id);
        setSyncStatus("local-only");

        if (setupUIFromStory(localStory.storyData)) return;
        setLoadingStory(false);
      } catch (error: any) {
        console.error("Error loading story:", error);
        addNotification(error.message || "Failed to load story", "failure");
        setLoadingStory(false);
      }
    }

    loadStory();
  }, [storyId, addNotification]);

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
      const color = searchParams.get("hostColor") || "#a855f7";
      router.replace(`/story?storyId=${storyId}`);
      createNetRoom(backend, hostName, color)
        .then(() => {
          addNotification(
            "Room created - share the code with your players",
            "success",
          );
          setAutoOpenOnlineSection(true);
          setCurrentState(StoryState.MENU);
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
      const backend = parseBackend(searchParams.get("joinBackend"));
      const name = searchParams.get("joinName") || "Player";
      const color = searchParams.get("joinColor") || "#22c55e";
      router.replace(`/story?storyId=${storyId}`);
      setLoading(true);
      joinNetRoom(backend, joinCode, name, color).catch((error) => {
        setLoading(false);
        addNotification(
          error instanceof Error ? error.message : "Failed to join room",
          "failure",
        );
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storyData, loadingStory]);

  // Sync lore and memory embeddings when story is first loaded (if embeddings enabled and dirty)
  useEffect(() => {
    if (!storyData || !storyDbId || storyDbId.startsWith("local_")) return;

    const embeddingsEnabled =
      typeof window !== "undefined"
        ? localStorage.getItem("embeddingsEnabled") === "true"
        : false;

    if (!embeddingsEnabled) return;

    // Only sync lore if we have enough entries and it's dirty (or first load)
    const shouldSyncLore =
      storyData.lore.length >= 5 && storyData.loreEmbeddingsDirty !== false;

    // Always sync memories on load if we have any
    const shouldSyncMemories = storyData.memory.length > 0;

    if (!shouldSyncLore && !shouldSyncMemories) return;

    // Fire and forget - sync embeddings in background
    getAuthToken().then(async (token) => {
      if (!token) return;

      // First, get existing embedding keys to avoid re-generating
      let existingKeys: { lore: string[]; memory: string[]; scene: string[] } =
        {
          lore: [],
          memory: [],
          scene: [],
        };

      try {
        existingKeys = await getExistingEmbeddingKeys(storyDbId, token);
        console.log(
          `[Embeddings] Found existing keys: ${existingKeys.lore.length} lore, ${existingKeys.memory.length} memories`,
        );
      } catch (err) {
        console.warn(
          "[Embeddings] Failed to get existing keys, will sync all:",
          err,
        );
      }

      // Sync lore if needed
      if (shouldSyncLore) {
        syncLoreEmbeddings(
          storyDbId,
          storyData.lore.map((l) => ({
            title: l.title,
            content: l.content,
            embedded: l.embedded,
          })),
          token,
        )
          .then((result) => {
            if (result.synced > 0 || result.cleaned > 0) {
              console.log(
                `[Embeddings] Lore sync: ${result.synced} entries, ${result.cleaned} cleaned`,
              );
            }
            // Mark successfully embedded lore entries and clear dirty flag
            if (
              result.embeddedTitles.length > 0 ||
              storyData.loreEmbeddingsDirty !== false
            ) {
              const updatedLore = storyData.lore.map((l) =>
                result.embeddedTitles.includes(l.title)
                  ? { ...l, embedded: true }
                  : l,
              );
              setStoryData({
                ...storyData,
                lore: updatedLore,
                loreEmbeddingsDirty: false,
              });
            }
          })
          .catch((err) => {
            console.warn("[Embeddings] Lore sync failed:", err.message);
          });
      }

      // Sync memories if we have any
      if (shouldSyncMemories) {
        syncNewMemories(
          storyDbId,
          storyData.memory,
          new Set(existingKeys.memory), // Pass existing keys to skip already-synced
          token,
        )
          .then((result) => {
            if (result.synced > 0 || result.cleaned > 0) {
              console.log(
                `[Embeddings] Memory sync: ${result.synced} entries, ${result.cleaned} cleaned`,
              );
            }
            // Mark successfully embedded memory entries
            if (result.embeddedIndices.length > 0) {
              const updatedMemory = storyData.memory.map((m, i) => {
                if (result.embeddedIndices.includes(i)) {
                  // Convert to MemoryEntry format with embedded: true
                  const content = typeof m === "string" ? m : m.content;
                  return { content, embedded: true };
                }
                return m;
              });
              setStoryData({ ...storyData, memory: updatedMemory });
            }
          })
          .catch((err) => {
            console.warn("[Embeddings] Memory sync failed:", err.message);
          });
      }
    });
    // Only run when storyDbId or dirty flag changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storyDbId, storyData?.loreEmbeddingsDirty]);

  //Applypresetandstartstory
  const handlePresetSelect = async (preset: Preset) => {
    if (!storyData) return;
    logger.action("User selected preset", { preset: preset.name });

    // For custom preset with a character sheet template, redirect to character creation
    const isCustom = preset.id === "custom";
    if (isCustom) {
      // Check if storyData has characterSheetTemplate with fields
      let templateWithFields = storyData.characterSheetTemplate;

      // If not in storyData, try to fetch from the source adventure
      if (!templateWithFields?.fields?.length && sourceAdventureId) {
        try {
          const { getLocalAdventure } =
            await import("@/app/misc/localAdventureManager");
          const localAdv = await getLocalAdventure(sourceAdventureId);
          const adventure = localAdv?.adventureData;
          if (adventure?.characterSheetTemplate?.fields?.length) {
            templateWithFields = adventure.characterSheetTemplate;
            // Also update storyData so we have it for later
            setStoryData((prev) =>
              prev
                ? { ...prev, characterSheetTemplate: templateWithFields }
                : prev,
            );
          }
        } catch (error) {
          console.error(
            "Failed to fetch adventure for character template:",
            error,
          );
        }
      }

      if (templateWithFields?.fields?.length) {
        setSelectedPreset(preset);
        setCurrentState(StoryState.CHARACTER_CREATION);
        setShowPresetSelection(false);
        return;
      }
    }

    const updatedStoryData = { ...storyData };

    // For custom preset, use default values but don't apply any preset-specific overrides
    // The user can customize via the menu after starting

    // Apply preset to story data (skip for custom - use adventure defaults)
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
          var_on_triggers: [],
          var_off_triggers: [],
        };
        updatedStoryData.lore = [
          ...(updatedStoryData.lore || []),
          characterSheetLore,
        ];
      }
      if (preset.stats?.length)
        updatedStoryData.stats = JSON.parse(JSON.stringify(preset.stats));
      if (preset.resources?.length)
        updatedStoryData.resources = JSON.parse(
          JSON.stringify(preset.resources),
        );
      if (preset.inventory?.length)
        updatedStoryData.inventory = JSON.parse(
          JSON.stringify(preset.inventory),
        );
      if (preset.relationships?.length)
        updatedStoryData.relationships = JSON.parse(
          JSON.stringify(preset.relationships),
        );
      if (preset.authorNotes)
        updatedStoryData.author_notes = preset.authorNotes;
    }

    // Determine starting choices - use custom ones if available, otherwise default
    // Choices are now plain text only - GM stage handles all dice mechanics
    const startingChoices = updatedStoryData.starting_choices?.length
      ? updatedStoryData.starting_choices.map((sc) => ({
          text: sc.text,
          // Include intro_override so it can be used when this choice is selected
          intro_override: sc.intro_override,
        }))
      : [{ text: "Start Story" }];

    // Determine intro content - priority order:
    // 1. Preset's unique intro (if exists)
    // 2. Adventure's default intro
    // NOTE: starting_choices intro_override is applied AFTER the user selects a choice,
    // not at preset selection time. The intro_override replaces the AI's first response.
    const introContent = preset.intro || updatedStoryData.intro;

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
    setSelectedPreset(preset);

    // For custom preset, open the menu so user can customize their character
    if (isCustom) {
      setCurrentState(StoryState.MENU);
      addNotification(
        "Customize your character in the menu, then return to the story!",
        "success",
      );
    } else {
      addNotification(
        `Character preset "${preset.name}" applied! ?`,
        "success",
      );
    }
  };

  //Savestoryprogresstodatabase(debounced)
  async function saveProgress(updatedStoryData: StoryData, immediate = false) {
    if (!storyDbId) return;

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
  }

  //Actualsavelogicisolated
  async function performSave(updatedStoryData: StoryData) {
    if (!storyDbId) return;

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
    } catch (error) {
      console.error("Error saving progress:", error);
      addNotification(
        "Failed to save story progress. Please try again.",
        "failure",
      );
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

  async function handleCustomInput(
    customText: string,
    playerComment?: string,
    speakerIds?: string[],
    inputKind: "freeform" | "voice" = "freeform",
  ) {
    if (!storyData) return;

    if (netSession?.role === "guest") {
      logger.action("Guest custom input, sending to host", { customText });
      setLoading(true);
      setLoadingStage("story");
      if (inputKind === "voice") {
        sendNetVoice(customText, speakerIds ?? []);
      } else {
        sendNetFreeform(customText, speakerIds);
      }
      return;
    }

    logger.action("User custom input", { customText });

    setLoading(true);
    setLoadingStage("story");

    //Adduser'scustominputtoscene
    storyData.scene.parts.push({
      content: ">" + customText,
      imageUrl: "",
      user: true,
      role: "user",
      playerComment: playerComment?.trim() ? playerComment.trim() : undefined,
      speakerIds: speakerIds && speakerIds.length > 0 ? speakerIds : undefined,
      choices: [],
    });

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
    };

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
      const webResearchEnabled =
        typeof window !== "undefined"
          ? localStorage.getItem("webResearchEnabled") === "true"
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
      // GM Stage is always enabled - legacy tool calling is deprecated
      const gmStageEnabled = true;

      // Track parallel completion of tools and choices
      let toolsComplete = !toolCallingEnabled; // If tools disabled, mark as complete
      let choicesComplete = false;

      const checkBothComplete = () => {
        if (toolsComplete && choicesComplete) {
          setLoadingStage(null);
        }
      };

      // Create abort controller for this generation
      generationAbortRef.current = new AbortController();

      await generateStoryTurn(
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
          openRouterKey,
          deepseekKey,
          googleKey,
          mistralKey,
          deepinfraKey,
          storyId: storyDbId || undefined,
          enableEmbeddings: embeddingsEnabled,
          embeddingThreshold,
          webResearchEnabled,
          braveSearchKey,
          samplingSettings: getSamplingSettings(),
          usePrefill,
          storytellerMode,
          enableGMStage: gmStageEnabled,
          gmStageModel: toolsModel, // Use same model as tools stage
          abortSignal: generationAbortRef.current.signal,
        },
        {
          onGMStageStart: () => {
            setLoadingStage("gm");
            setLiveGMEntries([]);
            logger.action("GM stage started (custom input)");
          },
          onAskForRoll: requestManualRoll,
          onRequestDiceThrow: requestDiceThrow,
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
            setLiveGMEntries([]);

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
          onComplete: (result) => {
            if (result.meta.totalTokenCost) {
              addNotification(
                `Used ${result.meta.totalTokenCost} tokens`,
                "success",
              );
            }

            // Tick ability cooldowns at end of turn
            if (storyData.abilities && storyData.abilities.length > 0) {
              const offCooldown = tickCooldowns(storyData.abilities);
              if (offCooldown.length > 0) {
                addNotification(
                  `Abilities ready: ${offCooldown.join(", ")}`,
                  "success",
                );
              }
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
              addNotification(
                `Possible inconsistency: ${result.scenePart.consistencyWarnings[0].detail} - use Edit to fix the text, or Retry to regenerate.`,
                "warning",
              );
            }

            setCanRetry(true);
            setCanUndo(true);
            setLoadingStage(null);

            setStoryData({ ...storyData });

            // Save progress
            const lastPartForSave =
              storyData.scene.parts[storyData.scene.parts.length - 1];
            console.log(
              "Saving story (custom input) - last part choices:",
              lastPartForSave.choices?.length || 0,
              "choices",
            );
            saveProgress(storyData, true);

            logger.ai_response("Generation complete (custom input)", {
              totalTokenCost: result.meta.totalTokenCost,
            });
          },
          onError: (error) => {
            addNotification(`Error: ${error.message}`, "failure");
            setLoading(false);
            setLoadingStage(null);

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

  // Handle freeform action submission - analyze the action and return metadata
  async function handleActionSubmit(
    actionText: string,
  ): Promise<{ analysis: any; warnings: string[] } | null> {
    if (!storyData) return null;

    // Check if GM Stage is enabled - if so, skip action analysis
    // The GM Stage will determine mechanics during generation
    // GM Stage is always enabled - legacy tool calling is deprecated
    const gmStageEnabled = true;

    if (gmStageEnabled) {
      logger.action("GM Stage enabled - skipping action analysis", {
        actionText,
      });
      // Return a plain action analysis - GM Stage will determine mechanics
      return {
        analysis: {
          action_summary: actionText,
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
        },
        warnings: ["GM Stage will determine mechanics during generation"],
      };
    }

    logger.action("Analyzing freeform action", { actionText });

    try {
      const { choicesModel } = getModelsFromPreset();
      const result = await analyzeAction(storyData, actionText, choicesModel, {
        openRouterKey,
        deepseekKey,
        googleKey,
        mistralKey,
        deepinfraKey,
      });

      logger.ai_response("Action analysis complete", {
        analysis: result.analysis,
        warnings: result.validationWarnings,
      });

      return {
        analysis: result.analysis,
        warnings: result.validationWarnings,
      };
    } catch (error: any) {
      logger.error("Action analysis failed", { error: error.message });
      addNotification(`Analysis failed: ${error.message}`, "failure");
      return null;
    }
  }

  // Handle confirmed freeform action - this is called after analysis with a Choice object
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

  // Internal function that handles both regular choices and freeform actions
  async function handleChoiceWithAction(
    actionChoice?: Choice,
    playerComment?: string,
  ) {
    if (!storyData) return;

    // Snapshot full state before this turn's GM tool calls can mutate it,
    // so handleUndo can restore mechanical state (not just pop scene.parts)
    // if the player says "that's not what I meant." Best-effort: if the
    // structure somehow isn't cloneable, undo just falls back to its old
    // scene.parts-only behavior rather than failing the turn.
    try {
      preTurnSnapshotRef.current = structuredClone(storyData);
    } catch (snapshotError) {
      console.error("Failed to snapshot pre-turn state for undo", snapshotError);
      preTurnSnapshotRef.current = null;
    }

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
      setPendingUserChoice(choice.text);
      sendNetChoice(key);
      return;
    }

    logger.action("User selected choice", { choice: choice.text, index: key });

    setLoading(true);
    setLoadingStage("story");
    // Set pending user choice for immediate display in chat
    setPendingUserChoice(choice.text);

    // Check if this choice has intro_override (for starting choices)
    // If so, skip AI generation and use the preset intro directly
    if (choice.intro_override) {
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
      storyData.scene.parts.push(overridePart);

      setStoryText(choice.intro_override);
      setStoryData({ ...storyData });
      setLoading(false);
      setLoadingStage("choices");

      try {
        const { choicesModel } = getModelsFromPreset();
        const { generateChoicesOnly } = await import("../misc/generation");
        const newChoices = await generateChoicesOnly(storyData, {
          choicesModel,
          openRouterKey,
          deepseekKey,
          googleKey,
          mistralKey,
          deepinfraKey,
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

        saveProgress(storyData);
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
        saveProgress(storyData);
      }
      return;
    }

    // Build the player-facing text: the choice itself, plus lightweight
    // flavor annotations (oracle question, table roll, context dice).
    // No mechanical resolution happens client-side anymore - the GM decides
    // whether/how to roll via its own formula_roll tool once it reads this.
    const flavorLines: string[] = [];

    if (choice.agmt_check) {
      try {
        const LIKELIHOODS: Likelihood[] = [
          "Impossible",
          "No Way",
          "Very Unlikely",
          "Unlikely",
          "50/50",
          "Somewhat Likely",
          "Likely",
          "Very Likely",
          "Near Sure Thing",
          "A Sure Thing",
          "Has To Be",
        ];
        const match = choice.agmt_check.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
        const question = (match ? match[1] : choice.agmt_check).trim();
        const rawLikelihood = (match ? match[2] : "50/50").trim();
        const likelihood: Likelihood =
          LIKELIHOODS.find(
            (l) => l.toLowerCase() === rawLikelihood.toLowerCase(),
          ) || "50/50";
        const chaosFactor = storyData.agmtState?.chaosFactor ?? 5;
        const fateResult = askFate(likelihood, chaosFactor);

        flavorLines.push(`[AGMT Question: ${question}]`);
        const answerLine = fateResult.randomEvent
          ? `[AGMT Answer: ${fateResult.answer} - RANDOM EVENT TRIGGERED!]`
          : `[AGMT Answer: ${fateResult.answer}]`;
        flavorLines.push(answerLine);

        if (fateResult.randomEvent) {
          const focus = generateEventFocus();
          const meaning = generateEventMeaning();
          flavorLines.push(
            `[Random Event: ${focus.focus} - ${meaning.action} ${meaning.subject}]`,
          );
        }
      } catch (error) {
        console.error("Error processing agmt_check:", error);
      }
    }

    // Table roll: unified `table` field, with legacy fallbacks
    const tableForChoice = choice.table || choice.agmt_table || choice.custom_table;
    if (tableForChoice) {
      try {
        if (storyData.customTables) {
          const { getTableByName, rollOnCustomTable } =
            await import("../misc/tableRoller");
          const customTable = getTableByName(
            storyData.customTables,
            tableForChoice,
          );
          if (customTable) {
            const result = rollOnCustomTable(customTable);
            if (result) {
              flavorLines.push(`[${customTable.name}: ${result.text}]`);
            } else {
              addNotification(`Table "${customTable.name}" is empty`, "warning");
            }
          } else {
            const result = generateElement(tableForChoice as ElementCategory);
            if (result) {
              flavorLines.push(`[${tableForChoice} Table: ${result.element}]`);
            }
          }
        } else {
          const result = generateElement(tableForChoice as ElementCategory);
          if (result) {
            flavorLines.push(`[${tableForChoice} Table: ${result.element}]`);
          }
        }
      } catch (error) {
        console.error("Error processing table roll:", error);
      }
    }

    // Context rolls from action analysis (flavor dice unrelated to skill checks)
    if (choice.rolls && choice.rolls.length > 0) {
      for (const roll of choice.rolls) {
        if (!roll.dice) continue;
        try {
          const diceMatch = roll.dice.match(/^(\d+)?d(\d+)([+-]\d+)?$/i);
          if (diceMatch) {
            const count = parseInt(diceMatch[1] || "1");
            const sides = parseInt(diceMatch[2]);
            const modifier = parseInt(diceMatch[3] || "0");

            let total = modifier;
            const diceResults: number[] = [];
            for (let i = 0; i < count; i++) {
              const dieRoll = Math.floor(Math.random() * sides) + 1;
              diceResults.push(dieRoll);
              total += dieRoll;
            }

            const rollStr =
              count > 1 ? `(${diceResults.join("+")})` : `${diceResults[0]}`;
            const modStr =
              modifier !== 0 ? `${modifier > 0 ? "+" : ""}${modifier}` : "";
            flavorLines.push(
              `[Context: ${roll.description} (${roll.dice}) = ${rollStr}${modStr} → ${total}]`,
            );
          } else {
            console.warn(`Invalid dice notation: ${roll.dice}`);
          }
        } catch (error) {
          console.error("Error processing context roll:", error);
        }
      }
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

    const { storyModel, toolsModel, choicesModel } = getModelsFromPreset();
    const toolCallingEnabled = true;

    logger.ai_request("Starting generation (choice)", {
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
    const webResearchEnabled =
      typeof window !== "undefined"
        ? localStorage.getItem("webResearchEnabled") === "true"
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
    // GM Stage is always enabled - legacy tool calling is deprecated
    const gmStageEnabled = true;

    // Track parallel completion of tools and choices
    let toolsComplete = !toolCallingEnabled; // If tools disabled, mark as complete
    let choicesComplete = !!actionChoice; // If freeform action, choices will be skipped

    const checkBothComplete = () => {
      if (toolsComplete && choicesComplete) {
        setLoadingStage(null);
      }
    };

    console.log(
      "[page.tsx] About to call generateStoryTurn. actionChoice:",
      !!actionChoice,
      actionChoice?.text?.slice(0, 50),
    );

    // Create abort controller for this generation
    generationAbortRef.current = new AbortController();

    try {
      await generateStoryTurn(
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
          skipChoices: !!actionChoice, // Skip choices generation in freeform action mode
          openRouterKey,
          deepseekKey,
          googleKey,
          mistralKey,
          deepinfraKey,
          storyId: storyDbId || undefined,
          abortSignal: generationAbortRef.current.signal,
          enableEmbeddings: embeddingsEnabled,
          embeddingThreshold,
          webResearchEnabled,
          braveSearchKey,
          samplingSettings: getSamplingSettings(),
          usePrefill,
          storytellerMode,
          enableGMStage: gmStageEnabled,
          gmStageModel: toolsModel, // Use same model as tools stage
        },
        {
          onGMStageStart: () => {
            setLoadingStage("gm");
            // Reset live GM entries for new generation
            setLiveGMEntries([]);
            logger.action("GM stage started - determining mechanics");
          },
          onAskForRoll: requestManualRoll,
          onRequestDiceThrow: requestDiceThrow,
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
            logger.ai_response("GM stage complete", {
              toolCount: gmResults.length,
              tools: gmResults.map((r) => r.toolName),
              contextLength: storyContext.length,
              thinkingLines: thinking?.length || 0,
              usage,
            });

            setLiveGMEntries([]);

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
            setLoading(false); // Let player read while tools/choices generate
            setPendingUserChoice(""); // Clear pending choice - response is here
          },
          onStoryComplete: (content: string, usage: any) => {
            partialPart.content = content;
            setStoryText(content);
            setStoryData({ ...storyData }); // Full update only at completion

            logger.ai_response("Story narration complete", {
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

            logger.ai_response("Tools complete", {
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

            logger.ai_response("Choices complete", {
              choicesCount: newChoices.length,
              usage,
            });
          },
          onComplete: (result) => {
            if (partialPart.content.includes("!!!ENDCHAPTER!!!")) {
              const currentChapter = storyData.chapters.length;
              addNotification(
                `Chapter ${currentChapter} Complete!`,
                "success",
              );
            }

            // Tick ability cooldowns at end of turn
            if (storyData.abilities && storyData.abilities.length > 0) {
              const offCooldown = tickCooldowns(storyData.abilities);
              if (offCooldown.length > 0) {
                addNotification(
                  `Abilities ready: ${offCooldown.join(", ")}`,
                  "success",
                );
              }
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

            setCanRetry(true);
            setCanUndo(true);
            setLoadingStage(null);

            setStoryData({ ...storyData });

            saveProgress(storyData, true);

            logger.ai_response("Generation complete (choice)", {
              totalTokenCost: result.meta.totalTokenCost,
            });
          },
          onError: (error) => {
            addNotification(`Error: ${error.message}`, "failure");
            setLoading(false);
            setLoadingStage(null);
            setCanRetry(true);
            setChoices({
              choices:
                storyData.scene.parts[storyData.scene.parts.length - 1]
                  ?.choices || [],
            });

            logger.error("Generation error (choice)", {
              message: error.message,
            });
          },
        },
      );
    } catch (error: any) {
      addNotification(`Error: ${error.message}`, "failure");
      setLoading(false);
      setLoadingStage(null);
      setCanRetry(true);
      logger.error("Generation exception (choice)", { message: error.message });
    }
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
      setManualRollRequest(request);
    });
  }

  function resolveManualRoll(answer: ManualRollAnswer | null) {
    manualRollResolveRef.current?.(answer);
    manualRollResolveRef.current = null;
    setManualRollRequest(null);
  }

  // Physical dice mode: called by the GM executor when a formula roll can
  // be thrown physically. Shows the 3D dice tray and resolves once the
  // thrown dice settle (or the player skips, falling back to a digital
  // roll of the whole formula - see rollFormulaMaybePhysical).
  function requestDiceThrow(request: DiceThrowRequest) {
    return new Promise<number[] | null>((resolve) => {
      diceThrowResolveRef.current = resolve;
      setDiceThrowRequest(request);
    });
  }

  function resolveDiceThrow(faces: number[] | null) {
    diceThrowResolveRef.current?.(faces);
    diceThrowResolveRef.current = null;
    setDiceThrowRequest(null);
  }

  // Stop generation (abort ongoing requests)
  function handleStop() {
    // Unblock the GM loop if it's paused waiting for a physical roll
    resolveManualRoll(null);
    resolveDiceThrow(null);
    if (generationAbortRef.current) {
      generationAbortRef.current.abort();
      generationAbortRef.current = null;
    }
    setLoading(false);
    setLoadingStage(null);
    addNotification("Generation stopped", "warning");
  }

  async function handleRetry() {
    if (!storyData || loading) return;

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

    setLoading(true);
    setLoadingStage("story");
    setCanRetry(false);

    // Save GM context from the last AI response before popping it
    // This preserves the dice rolls, skill checks, and reasoning for the regeneration
    const lastAIPart = storyData.scene.parts[storyData.scene.parts.length - 1];
    const savedGMThinking = lastAIPart.gmThinking;
    const savedGMStoryContext = lastAIPart.gmStoryContext;
    const savedGMToolCalls = lastAIPart.gmToolCalls;
    const savedGMConversation = lastAIPart.gmConversation;

    // Remove the last AI response
    storyData.scene.parts.pop();

    // Get the user choice part (now the last part after popping AI response)
    const userChoicePart =
      storyData.scene.parts[storyData.scene.parts.length - 1];

    // Get the user's choice content and choices for regeneration
    const userChoiceContent = userChoicePart?.content || "";
    const savedChoices = userChoicePart?.choices || [];

    // Also pop the user choice part - we'll re-add it via generateStoryTurn
    // This prevents duplicate user messages in the prompt
    if (userChoicePart?.user) {
      storyData.scene.parts.pop();
    }

    // Restore choices from the user's choice part
    if (savedChoices.length > 0) {
      setChoices({ choices: savedChoices });
    }

    addNotification("Regenerating response...", "info");
    logger.action("User requested retry", {
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
    const webResearchEnabled =
      typeof window !== "undefined"
        ? localStorage.getItem("webResearchEnabled") === "true"
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
    // GM Stage is always enabled - legacy tool calling is deprecated
    const gmStageEnabled = true;

    // Track parallel completion of tools and choices
    let toolsComplete = !toolCallingEnabled; // If tools disabled, mark as complete
    let choicesComplete = false;

    const checkBothComplete = () => {
      if (toolsComplete && choicesComplete) {
        setLoadingStage(null);
      }
    };

    // Create abort controller for this generation
    generationAbortRef.current = new AbortController();
    // This retry path skips the GM stage entirely (reuses saved context),
    // so nothing will reset liveGMEntries the way onGMStageStart normally
    // does - clear it here so a stale timeline from a previous turn can't
    // linger into this one.
    setLiveGMEntries([]);

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
      await generateStoryTurn(
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
          skipChoices: true, // On retry, we already have choices from the previous generation
          openRouterKey,
          deepseekKey,
          googleKey,
          mistralKey,
          deepinfraKey,
          storyId: storyDbId || undefined,
          enableEmbeddings: embeddingsEnabled,
          embeddingThreshold,
          webResearchEnabled,
          braveSearchKey,
          samplingSettings: getSamplingSettings(),
          usePrefill,
          storytellerMode,
          // Skip GM stage on retry - reuse the saved conversation (dice
          // rolls, tool results, reasoning) from the popped part instead
          enableGMStage: false, // Don't re-run GM stage
          precomputedGMConversation: savedGMConversation,
          abortSignal: generationAbortRef.current.signal,
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
              addNotification(
                `Possible inconsistency: ${result.scenePart.consistencyWarnings[0].detail} - use Edit to fix the text, or Retry to regenerate.`,
                "warning",
              );
            }

            setCanRetry(true);
            setCanUndo(true);
            setLoadingStage(null);

            setStoryData({ ...storyData });

            // Save progress
            saveProgress(storyData);

            addNotification("Response regenerated", "success");

            logger.ai_response("Generation complete (retry)", {
              totalTokenCost: result.meta.totalTokenCost,
            });
          },
          onError: (error) => {
            addNotification(`Error: ${error.message}`, "failure");
            setLoading(false);
            setLoadingStage(null);
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
      setCanRetry(true);
      logger.error("Generation exception (retry)", { message: error.message });
    }
  }

  async function handleUndo() {
    if (!storyData || loading) return;

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

    logger.action("User requested undo");

    // Prefer restoring the full pre-turn snapshot over just popping
    // scene.parts - a turn's GM tool calls may have mutated NPCs, quests,
    // stats, timers, etc. directly on storyData, and popping the
    // conversational record alone left those mechanical changes in place
    // (the "misread input" gap - see §2.5 in
    // docs/research-paper-ttrpg-theory-gap-analysis.md). Only usable to
    // undo the single most recent turn - the snapshot is consumed and not
    // stacked, matching the paper's "misread input rolls back the whole
    // turn" behavior rather than a general multi-step undo history.
    const snapshot = preTurnSnapshotRef.current;
    const snapshotMatchesCurrentTurn =
      snapshot &&
      snapshot.scene.parts.length === storyData.scene.parts.length - 2;

    if (snapshotMatchesCurrentTurn) {
      // Restore in place (mutate the existing object, matching this
      // codebase's storyData-mutation convention) rather than swapping to a
      // new object reference, so every other handler's closure over
      // `storyData` keeps working unchanged.
      for (const key of Object.keys(storyData)) {
        delete (storyData as unknown as Record<string, unknown>)[key];
      }
      Object.assign(storyData, snapshot);
      preTurnSnapshotRef.current = null;
      logger.action("Undo restored full pre-turn state (mechanics included)");
    } else {
      // No matching snapshot (e.g. page was reloaded, or undoing further
      // back than the single most recent turn) - fall back to the old
      // scene.parts-only behavior rather than failing the undo outright.
      storyData.scene.parts.pop();
      storyData.scene.parts.pop();
    }

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
    setCanUndo(storyData.scene.parts.length >= 2);
    addNotification("Undone last action", "success");

    // Save progress
    await saveProgress(storyData);
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
        openRouterKey,
        deepseekKey,
        googleKey,
        mistralKey,
        deepinfraKey,
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
        className="min-h-dvh bg-linear-to-br from-gray-900 via-blue-950 to-purple-950"
        style={fullHeightStyle}
      >
        <div className="flex items-center justify-center min-h-dvh">
          <div className="text-center">
            <div className="animate-spin rounded-full h-10 w-10 border-2 border-blue-400 border-t-transparent mx-auto"></div>
            <p className="mt-4 text-sm text-blue-200/60">Loading story...</p>
          </div>
        </div>
      </div>
    );
  }

  //Checkforgameoverstate
  const isGameOver =
    storyData?.scene.parts.some((part) => part.gameOver) || false;

  if (!storyData) {
    return (
      <div
        className="min-h-dvh bg-linear-to-br from-gray-900 via-blue-950 to-purple-950"
        style={fullHeightStyle}
      >
        <div className="flex items-center justify-center min-h-dvh">
          <div className="text-center bg-blue-950/50 rounded-xl p-6 border border-blue-800/30">
            <DynamicIcon
              name="FileQuestion"
              className="w-12 h-12 text-blue-200/30 mx-auto mb-3"
            />
            <p className="text-blue-200/60 mb-4">Story not found</p>
            <button
              onClick={() => router.push("/library")}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
            >
              Browse Adventures
            </button>
          </div>
        </div>
      </div>
    );
  }

  //GameOverScreen
  if (isGameOver && storyData) {
    const completedGoals =
      storyData.goals?.filter((g) => g.fulfilled).length || 0;
    const totalGoals = storyData.goals?.length || 0;

    return (
      <div
        className="min-h-dvh bg-linear-to-br from-gray-900 via-blue-950 to-purple-950 py-6 px-4"
        style={fullHeightStyle}
      >
        <div className="w-full px-2 sm:max-w-3xl mx-auto">
          {/* Game Over Header */}
          <div className="bg-blue-950/50 rounded-xl border border-blue-800/30 p-6 mb-4 text-center">
            <div className="flex items-center justify-center gap-3 text-red-400 mb-3">
              <DynamicIcon name="Skull" className="w-8 h-8" />
              <h1 className="text-3xl font-bold">Game Over</h1>
              <DynamicIcon name="Skull" className="w-8 h-8" />
            </div>
            <h2 className="text-xl font-semibold text-white mb-1">
              {storyData.story_name}
            </h2>
            <p className="text-sm text-blue-200/60">
              {storyData.player_name}&apos;s journey has concluded
            </p>
          </div>

          {/* Stats Summary */}
          <div className="bg-blue-950/50 rounded-xl border border-blue-800/30 p-4 mb-4">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <DynamicIcon name="BarChart2" className="w-5 h-5 text-blue-400" />
              Final Statistics
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 bg-green-500/10 rounded-lg border border-green-500/30">
                <div className="flex items-center gap-2 mb-1">
                  <DynamicIcon
                    name="Target"
                    className="w-5 h-5 text-green-400"
                  />
                  <span className="text-sm font-medium text-white">Goals</span>
                </div>
                <div className="text-2xl font-bold text-green-400">
                  {completedGoals}/{totalGoals}
                </div>
                <div className="text-xs text-blue-200/40">
                  {totalGoals > 0
                    ? Math.round((completedGoals / totalGoals) * 100)
                    : 0}
                  % Complete
                </div>
              </div>
            </div>
          </div>

          {/* Goals Completed */}
          {completedGoals > 0 && (
            <div className="bg-blue-950/50 rounded-xl border border-blue-800/30 p-4 mb-4">
              <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <DynamicIcon name="Target" className="w-5 h-5 text-green-400" />
                Goals Completed
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {storyData.goals
                  .filter((g) => g.fulfilled)
                  .map((goal, idx) => (
                    <div
                      key={idx}
                      className="p-3 bg-green-500/10 rounded-lg border border-green-500/30"
                    >
                      <div className="flex items-start gap-2">
                        <DynamicIcon
                          name="Check"
                          className="w-5 h-5 text-green-400 shrink-0"
                        />
                        <div className="min-w-0">
                          <div className="font-medium text-white text-sm">
                            {goal.title}
                          </div>
                          <div className="text-xs text-blue-200/40 line-clamp-1">
                            {goal.shortDescription}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="bg-blue-950/50 rounded-xl border border-blue-800/30 p-4">
            <h3 className="text-lg font-semibold text-white mb-4 text-center">
              What&apos;s Next?
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => {
                  setConfirmDialog({
                    isOpen: true,
                    title: "Replay Story",
                    message:
                      "Start this adventure from the beginning? All progress will be lost.",
                    icon: "RotateCcw",
                    confirmText: "Replay",
                    confirmButtonClass: "bg-blue-600 hover:bg-blue-700",
                    onConfirm: async () => {
                      setConfirmDialog({ ...confirmDialog, isOpen: false });
                      //Replaysamestory-resettobeginning
                      if (!storyDbId) return;
                      try {
                        // Try to fetch fresh adventure data if we have a source adventure
                        let freshTemplate: Partial<StoryData> | null = null;
                        if (sourceAdventureId) {
                          try {
                            const { getLocalAdventure } =
                              await import("@/app/misc/localAdventureManager");
                            const localAdv =
                              await getLocalAdventure(sourceAdventureId);
                            freshTemplate =
                              (localAdv?.adventureData as Partial<Adventure>)
                                ?.storyTemplate || null;
                          } catch (e) {
                            console.warn(
                              "Could not fetch fresh adventure data, using current story values",
                            );
                          }
                        }

                        //Resetstorytoinitialstatebutkeepadventuretemplate
                        const resetStoryData: StoryData = {
                          ...storyData,
                          // Reset dynamic fields from fresh adventure template or current story
                          stats: freshTemplate?.stats || storyData.stats,
                          resources:
                            freshTemplate?.resources || storyData.resources,
                          inventory:
                            freshTemplate?.inventory || storyData.inventory,
                          abilities:
                            freshTemplate?.abilities || storyData.abilities,
                          relationships:
                            freshTemplate?.relationships ||
                            storyData.relationships,
                          variables:
                            freshTemplate?.variables || storyData.variables,
                          skillTrees:
                            freshTemplate?.skillTrees || storyData.skillTrees,
                          agmtState:
                            freshTemplate?.agmtState || storyData.agmtState,
                          customTables:
                            freshTemplate?.customTables ||
                            storyData.customTables,
                          restState: freshTemplate?.restState || {
                            quickRestsUsed: 0,
                            shortRestsUsed: 0,
                          },
                          unlockedNodes:
                            freshTemplate?.unlockedNodes ||
                            storyData.unlockedNodes,
                          // Always reset these
                          scene: { parts: [] },
                          memory: [],
                          currentChapter: 0,
                          chapters: [],
                          goals:
                            (freshTemplate?.goals || storyData.goals)?.map(
                              (g) => ({
                                ...g,
                                fulfilled: false,
                                active: false,
                              }),
                            ) || [],
                          lore: (freshTemplate?.lore || storyData.lore).map(
                            (l) => ({
                              ...l,
                              on:
                                l.on_triggers && l.on_triggers.length > 0
                                  ? false
                                  : true,
                            }),
                          ),
                          newGamePlusMode: false,
                        };

                        // Save reset story locally
                        const { saveLocalStory } =
                          await import("@/app/misc/localStoryManager");
                        await saveLocalStory(storyDbId, resetStoryData);

                        addNotification(
                          "Story reset! Starting fresh...",
                          "success",
                        );
                        router.push(`/story?storyId=${storyDbId}`);
                        window.location.reload();
                      } catch (error) {
                        console.error("Error replaying story:", error);
                        addNotification("Failed to replay story", "failure");
                      }
                    },
                  });
                }}
                className="p-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors flex items-center gap-2"
              >
                <DynamicIcon name="RotateCcw" className="w-5 h-5" />
                <div className="text-left text-sm">
                  <div>Replay</div>
                  <div className="text-xs opacity-70">Fresh start</div>
                </div>
              </button>

              <button
                onClick={() => {
                  setConfirmDialog({
                    isOpen: true,
                    title: "New Game Plus",
                    message:
                      "Start a New Game Plus run? You&apos;ll keep all stats, resources, and items!",
                    icon: "Star",
                    confirmText: "Start NG+",
                    confirmButtonClass:
                      "bg-linear-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700",
                    onConfirm: async () => {
                      setConfirmDialog({ ...confirmDialog, isOpen: false });
                      //New Game Plus - keep progress and increase difficulty
                      if (!storyDbId) return;
                      try {
                        const ngPlusCount =
                          (storyData.newGamePlusCount || 0) + 1;

                        // Try to fetch fresh adventure data for story-specific fields (lore, goals)
                        let freshTemplate: Partial<StoryData> | null = null;
                        if (sourceAdventureId) {
                          try {
                            const { getLocalAdventure } =
                              await import("@/app/misc/localAdventureManager");
                            const localAdv =
                              await getLocalAdventure(sourceAdventureId);
                            freshTemplate =
                              (localAdv?.adventureData as Partial<Adventure>)
                                ?.storyTemplate || null;
                          } catch (e) {
                            console.warn(
                              "Could not fetch fresh adventure data, using current story values",
                            );
                          }
                        }

                        //Resetstorybutkeepstats,resources,andinventory
                        const ngPlusStoryData: StoryData = {
                          ...storyData,
                          scene: { parts: [] },
                          memory: [],
                          currentChapter: 0,
                          chapters: [],
                          //Keepstats,resources,inventory,abilities!
                          stats: storyData.stats, //Keepstats
                          resources: storyData.resources, //Keepresources
                          inventory: storyData.inventory, //Keepinventory
                          abilities: storyData.abilities, //Keepabilities
                          // Reset story-specific fields from fresh adventure
                          relationships:
                            freshTemplate?.relationships ||
                            storyData.relationships, // Reset relationships
                          variables:
                            freshTemplate?.variables || storyData.variables,
                          agmtState:
                            freshTemplate?.agmtState || storyData.agmtState,
                          customTables:
                            freshTemplate?.customTables ||
                            storyData.customTables,
                          restState: { quickRestsUsed: 0, shortRestsUsed: 0 },
                          // Keep skill tree progress!
                          skillTrees: storyData.skillTrees,
                          unlockedNodes: storyData.unlockedNodes,
                          // Reset goals from fresh adventure or current story
                          goals:
                            (freshTemplate?.goals || storyData.goals)?.map(
                              (g) => ({
                                ...g,
                                fulfilled: false,
                                active: false,
                              }),
                            ) || [],
                          // Reset lore from fresh adventure or current story
                          lore: (freshTemplate?.lore || storyData.lore).map(
                            (l) => ({
                              ...l,
                              on:
                                l.on_triggers && l.on_triggers.length > 0
                                  ? false
                                  : true,
                            }),
                          ),
                          newGamePlusCount: ngPlusCount,
                          newGamePlusMode: true,
                        };

                        // Save NG+ story locally
                        const { saveLocalStory } =
                          await import("@/app/misc/localStoryManager");
                        await saveLocalStory(storyDbId, ngPlusStoryData);

                        addNotification(
                          `New Game Plus ${ngPlusCount} activated!`,
                          "success",
                        );
                        router.push(`/story?storyId=${storyDbId}`);
                        window.location.reload();
                      } catch (error) {
                        console.error("Error starting NG+:", error);
                        addNotification(
                          "Failed to start New Game Plus",
                          "failure",
                        );
                      }
                    },
                  });
                }}
                className="p-3 bg-linear-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-medium rounded-lg transition-colors flex items-center gap-2"
              >
                <DynamicIcon name="Star" className="w-5 h-5" />
                <div className="text-left text-sm">
                  <div>New Game+</div>
                  <div className="text-xs opacity-70">Keep progress</div>
                </div>
              </button>

              <button
                onClick={() => router.push("/library")}
                className="p-3 bg-blue-900/50 hover:bg-blue-900/70 text-white font-medium rounded-lg border border-blue-800/30 transition-colors flex items-center gap-2"
              >
                <DynamicIcon name="Library" className="w-5 h-5" />
                <div className="text-left text-sm">
                  <div>Library</div>
                  <div className="text-xs opacity-70">Your stories</div>
                </div>
              </button>

              <button
                onClick={() => router.push("/creator")}
                className="p-3 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg transition-colors flex items-center gap-2"
              >
                <DynamicIcon name="Map" className="w-5 h-5" />
                <div className="text-left text-sm">
                  <div>Explore</div>
                  <div className="text-xs opacity-70">New adventures</div>
                </div>
              </button>
            </div>

            {storyData.newGamePlusCount && storyData.newGamePlusCount > 0 && (
              <div className="mt-4 p-3 bg-amber-500/10 rounded-lg border border-amber-500/30 text-center">
                <div className="font-medium text-sm text-amber-300 flex items-center justify-center gap-2">
                  <DynamicIcon name="Star" className="w-4 h-4" />
                  New Game Plus: Run #{storyData.newGamePlusCount}
                </div>
                <div className="text-xs text-blue-200/40 mt-0.5">
                  Completed {storyData.newGamePlusCount}{" "}
                  {storyData.newGamePlusCount === 1
                    ? "playthrough"
                    : "playthroughs"}
                </div>
              </div>
            )}
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
        className="min-h-dvh bg-linear-to-br from-gray-900 via-blue-950 to-purple-950"
        style={fullHeightStyle}
      >
        <div className="py-6 px-4">
          <div className="w-full px-2 sm:max-w-3xl mx-auto">
            {/* Header */}
            <div className="text-center mb-6">
              <h1 className="text-2xl sm:text-3xl font-bold text-white mb-2">
                {storyData.story_name}
              </h1>
              <p className="text-sm text-blue-200/60">
                Choose your character to begin
              </p>
            </div>

            {/* Preset Selection */}
            <div className="bg-blue-950/50 rounded-xl border border-blue-800/30 p-4 mb-4">
              <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <DynamicIcon name="Users" className="w-5 h-5 text-blue-400" />
                Select Character
              </h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {availablePresets.map((preset) => (
                  <button
                    key={preset.id}
                    onClick={() => handlePresetSelect(preset)}
                    className={`rounded-lg p-4 text-left transition-all border ${
                      preset.id === "custom"
                        ? "bg-purple-500/10 border-purple-500/30 hover:border-purple-500/60"
                        : "bg-blue-900/30 border-blue-800/30 hover:border-blue-600/50"
                    }`}
                  >
                    <div className="flex items-start gap-3 mb-2">
                      <div
                        className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                          preset.id === "custom"
                            ? "bg-purple-500/20"
                            : "bg-blue-500/20"
                        }`}
                      >
                        <DynamicIcon
                          name={preset.icon}
                          className={`w-5 h-5 ${
                            preset.id === "custom"
                              ? "text-purple-400"
                              : "text-blue-400"
                          }`}
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-white text-sm">
                          {preset.name}
                        </h3>
                        <p className="text-xs text-blue-200/40 line-clamp-2">
                          {preset.description}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      {preset.id !== "custom" ? (
                        <>
                          {preset.stats && preset.stats.length > 0 && (
                            <span className="px-2 py-0.5 bg-blue-500/20 text-blue-300 text-xs rounded">
                              {preset.stats.length} Stats
                            </span>
                          )}
                          {preset.resources && preset.resources.length > 0 && (
                            <span className="px-2 py-0.5 bg-green-500/20 text-green-300 text-xs rounded">
                              {preset.resources.length} Resources
                            </span>
                          )}
                          {preset.inventory && preset.inventory.length > 0 && (
                            <span className="px-2 py-0.5 bg-yellow-500/20 text-yellow-300 text-xs rounded">
                              {preset.inventory.length} Items
                            </span>
                          )}
                        </>
                      ) : (
                        <>
                          <span className="px-2 py-0.5 bg-purple-500/20 text-purple-300 text-xs rounded">
                            Default Stats
                          </span>
                          <span className="px-2 py-0.5 bg-purple-500/20 text-purple-300 text-xs rounded">
                            Starter Items
                          </span>
                        </>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Back Button */}
            <button
              onClick={() => router.push("/library")}
              className="px-4 py-2 bg-blue-950/50 hover:bg-blue-900/50 text-blue-200 text-sm font-medium rounded-lg border border-blue-800/30 transition-colors flex items-center gap-2"
            >
              <DynamicIcon name="ArrowLeft" className="w-4 h-4" />
              Back to Library
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="relative flex flex-col min-h-dvh bg-linear-to-br from-gray-900 via-blue-950 to-purple-950 py-0 px-0 pb-0 sm:py-4 sm:px-4 sm:pb-20"
      style={fullHeightStyle}
    >
      {/* Ambient glow orbs - purely decorative, sits behind all content */}
      <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
        <div className="absolute -top-24 -left-24 w-96 h-96 rounded-full bg-purple-700/20 blur-[100px]" />
        <div className="absolute top-1/3 -right-32 w-96 h-96 rounded-full bg-blue-700/15 blur-[110px]" />
        <div className="absolute bottom-0 left-1/4 w-80 h-80 rounded-full bg-indigo-600/10 blur-[100px]" />
      </div>
      <main className="flex flex-1 min-h-0 gap-2 sm:gap-4 w-full px-0 sm:px-2 sm:max-w-4xl mx-auto flex-col">
        {/* Tab Navigation + leave/settings controls */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => router.push("/library")}
            className="focus-ring shrink-0 rounded-lg p-1.5 text-blue-300 hover:bg-blue-900/50 hover:text-white transition-colors"
            title="Leave to Library"
            aria-label="Leave to Library"
          >
            <DynamicIcon name="ArrowLeft" className="w-5 h-5" />
          </button>

          <div className="min-w-0 flex-1">
            <StoryTabBar
              currentState={currentState}
              onSelect={(state) => setCurrentState(state as StoryState)}
              tabs={[
                { state: StoryState.STORY, icon: "BookOpen", label: "Story" },
                { state: StoryState.LORE, icon: "Scroll", label: "Notes" },
                { state: StoryState.NPCS, icon: "Users", label: "NPCs" },
                { state: StoryState.GOALS, icon: "Target", label: "Goals" },
              ]}
            />
          </div>

          <button
            type="button"
            onClick={() => setCurrentState(StoryState.MENU)}
            aria-label="Menu"
            aria-current={
              currentState === StoryState.MENU ? "page" : undefined
            }
            title="Menu"
            className={`focus-ring shrink-0 rounded-lg p-1.5 transition-colors ${
              currentState === StoryState.MENU
                ? "bg-purple-600/20 text-purple-300 ring-1 ring-purple-400/40 shadow-[0_0_10px_rgba(147,51,234,0.4)]"
                : "text-blue-300 hover:bg-blue-900/50 hover:text-white"
            }`}
          >
            <DynamicIcon name="Settings" className="w-5 h-5" />
          </button>
        </div>

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
            storyText={storyText}
            choices={choices}
            input={input}
            loading={loading}
            loadingStage={loadingStage}
            handleChoice={handleChoice}
            handleSelect={handleSelect}
            onCustomInput={handleCustomInput}
            onActionSubmit={handleActionSubmit}
            onActionConfirm={handleActionConfirm}
            onCommentSubmit={handleCommentSubmit}
            onRerollChoices={handleRerollChoices}
            onRetry={handleRetry}
            canRetry={canRetry}
            onUndo={handleUndo}
            canUndo={canUndo}
            onStop={handleStop}
            onEdit={handleEdit}
            viewingPartIndex={viewingPartIndex}
            onNavigateLeft={handleNavigateLeft}
            onNavigateRight={handleNavigateRight}
            onNavigateToIndex={handleNavigateToIndex}
            onResetToCurrentPart={resetToCurrentPart}
            syncStatus={syncStatus}
            onOpenJournal={() => setCurrentState(StoryState.GOALS)}
            pendingUserChoice={pendingUserChoice}
            liveGMEntries={liveGMEntries}
            myPlayerId={netSession ? netSession.myLocalPlayerId : undefined}
            remoteActivity={netActivity}
            onLocalActivity={sendNetActivity}
            netSession={netSession}
            netPeers={netPeers}
            onViewportRecalc={updateHeights}
          />
          </div>
        )}
        {currentState === StoryState.CHARACTER_CREATION && (
          <CharacterCreationForm
            storyData={storyData}
            onCharacterCreate={handleCharacterCreate}
          />
        )}
        {currentState === StoryState.LORE && (
          <LorePage
            {...storyData}
            onUpdateLore={(updatedLore) =>
              updateStoryData({ lore: updatedLore })
            }
          />
        )}
        {currentState === StoryState.NPCS && (
          <NPCsPage
            {...storyData}
            onUpdateNPCs={(updatedNPCs) =>
              updateStoryData({ npcs: updatedNPCs })
            }
          />
        )}
        {currentState === StoryState.GOALS && <GoalsPage {...storyData} />}
        {currentState === StoryState.MENU && (
          <MenuPage
            {...storyData}
            storyDbId={storyDbId}
            sourceAdventureId={sourceAdventureId}
            onSaveProgress={(updatedStoryData) =>
              saveProgress(updatedStoryData || storyData)
            }
            onUpdateStoryData={updateStoryData}
            onViewLogs={() => setCurrentState(StoryState.LOGS)}
            onViewContext={() => setCurrentState(StoryState.CONTEXT)}
            onOpenAIAssistant={() => setShowAIAssistant(true)}
            netSession={netSession}
            netPeers={netPeers}
            onCreateNetRoom={createNetRoom}
            onJoinNetRoom={joinNetRoom}
            onLeaveNetRoom={leaveNetRoom}
            onSwitchNetBackend={switchNetBackend}
            autoOpenSection={autoOpenOnlineSection ? "online" : undefined}
          />
        )}
        {currentState === StoryState.LOGS && <LogViewer />}
        {currentState === StoryState.CONTEXT && (
          <ContextViewer storyData={storyData} />
        )}
        </div>
      </main>

      {/* AI Story Editor - Rendered at page level to persist across tabs */}
      <StoryCreativeAssistant
        isOpen={showAIAssistant}
        onClose={() => setShowAIAssistant(false)}
        onOpen={() => setShowAIAssistant(true)}
        storyData={storyData}
        storyId={storyDbId || undefined}
        onApplyChanges={(updates) => {
          updateStoryData(updates);
          addNotification("Changes applied! Don't forget to save.", "success");
        }}
        isPinned={isAIPinned}
        onPinToggle={handleAIPinToggle}
      />

      {/* Manual dice mode: the GM asked for a physical roll - generation is
          paused until the player enters their total (or skips) */}
      <ManualRollModal
        request={manualRollRequest}
        couchPlayers={storyData?.multiplayer?.couchPlayers}
        onSubmit={(value, rawText) => resolveManualRoll({ value, rawText })}
        onSkip={() => resolveManualRoll(null)}
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
        <div className="min-h-dvh bg-linear-to-br from-blue-50 via-purple-50 to-pink-50 dark:from-gray-900 dark:via-purple-900 dark:to-blue-900 flex items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 dark:border-purple-400"></div>
        </div>
      }
    >
      <StoryPageContent />
    </Suspense>
  );
}
