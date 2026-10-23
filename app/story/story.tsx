"use client";
import { DEFAULT_READING_FONT, DEFAULT_THEME_ID } from "./themeTokens";
import {
  Choice,
  Choices,
  StoryData,
  CouchPlayer,
  SceneImageRef,
  ScenePart,
} from "../misc/structs";
import React, { useState, useEffect, useRef } from "react";
import TTSControls, {
  isTTSEnabled,
  type TTSControlHandle,
  type TTSRelayHandle,
} from "../components/TTSControls";
import ChoicesModal from "../components/ChoicesModal";
import { DynamicIcon } from "../components/DynamicIcon";
import type {
  NetSessionInfo,
  TurnStatus,
} from "../misc/multiplayer/session";
import TurnLobbyOverlay from "../components/TurnLobbyOverlay";
import PlayerBubbles from "../components/PlayerBubbles";
import PartyTableStrip from "../components/PartyTableStrip";
import type { PartyTable } from "../misc/party/partyRuntime";
import CombatDisplay from "../components/CombatDisplay";
import { type TimelineBlock } from "../misc/turnTimeline";
import {
  buildMentionCandidates,
  buildMentionMatcher,
} from "../misc/noteMentions";
import {
  GMTurn,
  PlayerLine,
  TurnActions,
  type ReasoningTierDisplay,
} from "./StoryTurn";
import { canObserverTriggerReset } from "../misc/observer";
import {
  getObserverSettings,
  LAYER_SETTINGS_CHANGED_EVENT,
} from "../misc/layerSettings";
import { type ResolvedTier } from "../misc/reasoningTiers";

// Solo play has no CouchPlayer of its own (see structs.ts) - this stands in
// for PlayerBubbles' `players` prop so voice input still gets a bubble
// outside of couch co-op/multiplayer.
const SOLO_VOICE_PLAYER: CouchPlayer[] = [
  { id: "solo", name: "You", color: "#8b5cf6" },
];

interface StoryProps {
  storyData: StoryData;
  // Local story id (see localStoryManager.ts) - scopes the persistent TTS
  // audio cache (ttsAudioCache.ts) to this story. Omitted only for the
  // handful of placeholder/setup flows that never render TTSControls.
  storyId?: string;
  storyText: string;
  choices: Choices;
  input: Record<string, boolean>;
  loading: boolean;
  loadingStage?: "gm" | "story" | "choices" | null;
  // Narrower than loadingStage: true once the current storyText is
  // finalized, even while loadingStage is still "story" because tools/
  // choices are generating in the background afterward. Gates TTS
  // specifically, so it unlocks as soon as there's something to read/listen
  // to instead of waiting out that whole background phase too.
  storyTextReady?: boolean;
  handleChoice: (playerComment?: string) => void;
  handleSelect: (index: number) => void;
  onCustomInput?: (
    text: string,
    playerComment?: string,
    speakerIds?: string[],
    inputKind?: "freeform" | "voice",
  ) => void;
  // Networked P2P multiplayer (internet, not couch co-op) - see
  // app/misc/multiplayer/. All unset in couch co-op / single-player.
  myPlayerId?: string;
  remoteActivity?: Record<string, "recording" | "processing" | "idle">;
  onLocalActivity?: (state: "recording" | "processing" | "idle") => void;
  netSession?: NetSessionInfo | null;
  // Party-voice floor (talking stick), networked play only. When set, voice
  // bubbles obey the host-authoritative floor instead of couch-local state.
  floorHolderId?: string | null;
  floorLockedOutIds?: string[];
  onFloorTake?: () => void;
  onFloorRelease?: () => void;
  // Host TTS relay: forward each generated MP3 chunk to guests. Guest relay:
  // play the host's pushed audio instead of self-generating.
  onTTSAudioChunk?: (turnId: string, index: number, base64: string) => void;
  onTTSAudioEnd?: (turnId: string) => void;
  ttsRelayMode?: boolean;
  ttsRelayHandleRef?: React.Ref<TTSRelayHandle>;
  onActionConfirm?: (choice: Choice, playerComment?: string) => void;
  onCommentSubmit?: (comment: string) => void;
  onRerollChoices?: () => void;
  onRetry?: () => void;
  canRetry?: boolean;
  onUndo?: () => void;
  canUndo?: boolean;
  onStop?: () => void;
  onEdit?: (rawText: string, partIndex: number) => void;
  onNavigateLeft?: () => void;
  onNavigateRight?: () => void;
  // True while the story menu, the OOC panel or a play modal is open: the
  // window shortcuts below then do nothing, so Enter/Space/Ctrl+Z/Ctrl+R
  // do not act on the story behind them.
  shortcutsSuspended?: boolean;
  onResetToCurrentPart?: () => void;
  // Opens the Notes or NPC page pre-selected on the given entry, e.g. when
  // the player clicks a highlighted name/note title in the story prose.
  onOpenNote?: (kind: "lore" | "npc", id: string) => void;
  // The last user choice that was submitted (shown while GM is thinking)
  pendingUserChoice?: string;
  // Chronological thinking/tool/text blocks for the turn currently
  // generating - see turnTimeline.ts
  liveGMEntries?: TimelineBlock[];
  // Live-accumulating narration text for the turn currently generating -
  // see generation.ts:onLiveNarrationUpdate. Only meaningful while
  // storyTextReady is false; used to feed TTSControls so auto-narrate can
  // start speaking as the GM writes the story instead of waiting for the
  // whole GM stage (thinking + tool calls + narration) to finish, which is
  // otherwise all storyText itself reflects until the turn completes.
  liveNarrationText?: string;
  // Live reasoning-tier indicator for the turn currently generating - see
  // generation.ts:onReasoningTierResolved. Rendered as a small "T{n}" badge
  // at the end of the turn's work line, like the saved per-turn badge.
  liveReasoningTier?: ResolvedTier | null;
  // Re-measure the page's keyboard-aware viewport height (see page.tsx) -
  // called on composer focus/blur since iOS can scroll/resize the visual
  // viewport asynchronously, after the initial resize event.
  onViewportRecalc?: () => void;
  // Collect-all-then-generate lobby (networked co-op only): who's submitted/
  // passed/still pending this round. Rendered inline right above the
  // composer (see TurnLobbyOverlay) rather than as a viewport-fixed overlay
  // so it can never cover the chat input on small screens.
  turnLobby?: TurnStatus | null;
  onTurnLobbyStartNow?: () => void;
  onTurnLobbyPass?: () => void;
  // Party mode (desktop app): every player is on their own phone and this
  // screen is the table. While the table is open (partyTable set) the party
  // strip replaces couch co-op's voice bubbles. See app/misc/party/.
  partyTable?: PartyTable | null;
  onPartyGo?: () => void;
  onPartyJoin?: () => void;
  onPartyRemove?: (playerId: string) => void;
  onPartyAnswerHere?: (requestId: string) => void;
  // Pictures made in play (imageJobs.ts). `onIllustrate` is the "Illustrate
  // this" button on the latest turn: set only on the host, and only when an
  // image provider has a key (decisions 54, 57 and 60). `onRegenerateImage`
  // reruns a picture that was declined, failed or is missing on this device.
  onIllustrate?: (partIndex: number) => void;
  onRegenerateImage?: (partIndex: number, ref: SceneImageRef) => void;
}

interface StoryComposerProps {
  choices: Choices;
  loading: boolean;
  loadingStage?: "gm" | "story" | "choices" | null;
  couchPlayers: CouchPlayer[];
  onCustomInput?: StoryProps["onCustomInput"];
  onActionConfirm?: StoryProps["onActionConfirm"];
  onStop?: () => void;
  onFocusChange?: () => void;
}

// The chat input row - suggested-choice chips, couch co-op player switcher,
// textarea, send/stop button - split out of Story so a keystroke only
// re-renders this small subtree instead of the entire chat history above it.
const StoryComposer = React.forwardRef<HTMLTextAreaElement, StoryComposerProps>(
  function StoryComposer(
    {
      choices,
      loading,
      loadingStage,
      couchPlayers,
      onCustomInput,
      onActionConfirm,
      onStop,
      onFocusChange,
    },
    forwardedRef,
  ) {
    const [composerText, setComposerText] = React.useState("");
    const [composerBusy, setComposerBusy] = React.useState(false);
    const composerRef = useRef<HTMLTextAreaElement>(null);
    React.useImperativeHandle(
      forwardedRef,
      () => composerRef.current as HTMLTextAreaElement,
    );

    // Couch co-op: which player the next typed line belongs to
    const [activeSpeakerId, setActiveSpeakerId] = React.useState<
      string | null
    >(null);
    const activeSpeaker =
      couchPlayers.find((p) => p.id === activeSpeakerId) ||
      couchPlayers[0] ||
      null;

    const autoGrowComposer = () => {
      const el = composerRef.current;
      if (!el) return;
      el.style.height = "auto";
      el.style.height = Math.min(el.scrollHeight, 140) + "px";
    };

    // Shared freeform submit path: submit the action as a plain Choice - the
    // GM stage determines mechanics (skill checks, items, tables) during
    // generation, so no client-side analysis step happens here.
    const submitFreeformAction = (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;

      if (onActionConfirm) {
        onActionConfirm({ text: trimmed });
      } else if (onCustomInput) {
        onCustomInput(trimmed);
      }
    };

    const handleComposerSubmit = async () => {
      const text = composerText.trim();
      if (!text || loading || loadingStage || composerBusy) return;

      setComposerText("");
      if (composerRef.current) composerRef.current.style.height = "auto";

      setComposerBusy(true);
      try {
        // Couch co-op: attribute the line to the active player (same "> Name:
        // action" format PlayerBubbles uses), then pass the mic to the next one.
        if (couchPlayers.length > 1 && activeSpeaker && onCustomInput) {
          onCustomInput(`> ${activeSpeaker.name}: ${text}`, undefined, [
            activeSpeaker.id,
          ]);
          const idx = couchPlayers.findIndex(
            (p) => p.id === activeSpeaker.id,
          );
          setActiveSpeakerId(couchPlayers[(idx + 1) % couchPlayers.length].id);
          return;
        }

        await submitFreeformAction(text);
      } finally {
        setComposerBusy(false);
      }
    };

    // Tapping a suggested-choice chip submits that choice directly (mechanics
    // like skill checks and intro overrides ride along on the Choice object).
    const handleChipSelect = (choice: Choice) => {
      if (loading || loadingStage || composerBusy) return;
      if (onActionConfirm) {
        onActionConfirm({ ...choice });
      }
    };

    // iOS can resize/scroll the visual viewport asynchronously after the
    // keyboard's open/close animation, after the initial focus/blur event -
    // re-measure once immediately and again once it's had time to settle.
    const handleFocusChange = () => {
      onFocusChange?.();
      window.setTimeout(() => onFocusChange?.(), 300);
    };

    return (
      <div
        className="shrink-0 p-3 pt-2 space-y-2"
        style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
      >
        {/* Suggested choices as tappable chips */}
        {!loading &&
          !loadingStage &&
          (choices?.choices?.length ?? 0) > 0 && (
            <div className="flex gap-1.5 overflow-x-auto scrollbar-hide -mx-1 px-1 pb-0.5">
              {choices.choices.map((choice, i) => (
                <button
                  key={`chip-${i}-${choice.text}`}
                  onClick={() => handleChipSelect(choice)}
                  disabled={composerBusy}
                  className="shrink-0 max-w-[16rem] px-3 py-1.5 rounded-full bg-purple-500/10 hover:bg-purple-500/20 border border-purple-400/20 hover:border-purple-400/40 text-purple-100/90 text-xs transition-colors truncate touch-manipulation disabled:opacity-50"
                  title={choice.text}
                >
                  {choice.text}
                </button>
              ))}
            </div>
          )}

        {/* Couch co-op: switch who's speaking */}
        {couchPlayers.length > 1 && (
          <div className="flex items-center gap-1 p-1 bg-black/25 border border-white/10 rounded-full overflow-x-auto scrollbar-hide w-fit max-w-full">
            {couchPlayers.map((player) => {
              const isActive = activeSpeaker?.id === player.id;
              return (
                <button
                  key={player.id}
                  onClick={() => setActiveSpeakerId(player.id)}
                  className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all touch-manipulation ${
                    isActive
                      ? "text-white shadow-md"
                      : "text-blue-200/60 hover:text-white"
                  }`}
                  style={
                    isActive
                      ? { backgroundColor: player.color }
                      : undefined
                  }
                  title={`Play as ${player.name}`}
                >
                  <span
                    className={`w-2 h-2 rounded-full shrink-0 ${
                      isActive ? "bg-white/90" : ""
                    }`}
                    style={
                      isActive
                        ? undefined
                        : { backgroundColor: player.color }
                    }
                  />
                  <span className="max-w-[7rem] truncate">
                    {player.name}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* Input row - full width; voice input is the always-on bubble
            (see PlayerBubbles below) instead of a mic button here. */}
        <div className="flex items-end gap-2">
          <div className="relative flex-1">
            <textarea
              ref={composerRef}
              value={composerText}
              onChange={(e) => {
                setComposerText(e.target.value);
                autoGrowComposer();
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleComposerSubmit();
                }
              }}
              onFocus={handleFocusChange}
              onBlur={handleFocusChange}
              rows={1}
              placeholder={
                loading || loadingStage
                  ? loadingStage === "gm"
                    ? "GM is thinking..."
                    : loadingStage === "choices"
                      ? "Preparing choices..."
                      : "Writing the story..."
                  : couchPlayers.length > 1 && activeSpeaker
                    ? `What does ${activeSpeaker.name} do?`
                    : "What do you do?"
              }
              className="w-full resize-none pl-4 pr-12 py-3 bg-white/5 border border-white/10 rounded-2xl text-white placeholder-blue-300/40 focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-400/40 text-base leading-snug transition-colors"
              style={
                couchPlayers.length > 1 && activeSpeaker
                  ? { borderColor: `${activeSpeaker.color}66` }
                  : undefined
              }
            />

            {/* Send / Stop button, embedded like other chat UIs */}
            {loading || loadingStage ? (
              <button
                onClick={onStop}
                className="absolute right-1.5 bottom-2.5 w-9 h-9 rounded-full bg-red-500/15 hover:bg-red-500/30 border border-red-400/40 flex items-center justify-center transition-colors touch-manipulation"
                title="Stop generating"
              >
                <span className="relative flex items-center justify-center">
                  <span className="absolute w-7 h-7 border-2 border-red-400/30 border-t-red-300 rounded-full animate-spin" />
                  <DynamicIcon
                    name="Square"
                    className="w-3 h-3 text-red-300 fill-current"
                  />
                </span>
              </button>
            ) : (
              <button
                onClick={handleComposerSubmit}
                disabled={!composerText.trim() || composerBusy}
                className="absolute right-1.5 bottom-2.5 w-9 h-9 rounded-full flex items-center justify-center transition-all bg-linear-to-br from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 active:scale-95 disabled:opacity-40 shadow-md shadow-purple-950/40 touch-manipulation"
                title="Send"
              >
                {composerBusy ? (
                  <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                ) : (
                  <DynamicIcon
                    name="ArrowUp"
                    className="w-4 h-4 text-white"
                  />
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  },
);

type GMPartData = {
  gmConversation: NonNullable<ScenePart["gmConversation"]>;
  toolResults: Map<
    string,
    {
      success: boolean;
      contextForStory: string;
      toolName: string;
      hiddenFromPlayer?: boolean;
    }
  >;
  storyReasoning: string | undefined;
  reasoningTier: ReasoningTierDisplay | undefined;
};

const EMPTY_GM_DATA: GMPartData = {
  gmConversation: [],
  toolResults: new Map(),
  storyReasoning: undefined,
  reasoningTier: undefined,
};

// A GM part's saved conversation, tool results and tier, in the shapes GMTurn
// rebuilds its timeline from.
function buildGMDataForPart(part: ScenePart): GMPartData {
  // Build toolResults map from gmToolCalls (keyed by toolCallId). Rolls
  // made behind the GM's screen keep their `hiddenFromPlayer` flag here so
  // buildSavedTimeline can drop them - they're carried in, not filtered
  // out, precisely so the timeline knows to skip the tool call rather than
  // falling back to rendering its raw name.
  const toolResults = new Map<
    string,
    {
      success: boolean;
      contextForStory: string;
      toolName: string;
      hiddenFromPlayer?: boolean;
    }
  >();
  if (part.gmToolCalls) {
    for (const tc of part.gmToolCalls) {
      if (tc.toolCallId) {
        toolResults.set(tc.toolCallId, {
          success: tc.success,
          contextForStory: tc.contextForStory || "",
          toolName: tc.toolName || "",
          hiddenFromPlayer: tc.hiddenFromPlayer,
        });
      }
    }
  }

  return {
    gmConversation: part.gmConversation || EMPTY_GM_DATA.gmConversation,
    toolResults,
    storyReasoning: part.reasoning,
    reasoningTier:
      part.reasoningTier !== undefined
        ? ({
            tier: part.reasoningTier,
            modelKey: part.reasoningTierModelKey || "",
            effort: part.reasoningTierEffort || "none",
          } as ReasoningTierDisplay)
        : undefined,
  };
}

export default function Story({
  storyData,
  storyId,
  storyText,
  choices,
  input,
  loading,
  loadingStage,
  storyTextReady = true,
  handleChoice,
  handleSelect,
  onCustomInput,
  onActionConfirm,
  onCommentSubmit,
  onRerollChoices,
  onRetry,
  canRetry,
  onUndo,
  canUndo,
  onStop,
  onEdit,
  onNavigateLeft,
  onNavigateRight,
  shortcutsSuspended,
  onResetToCurrentPart,
  onOpenNote,
  pendingUserChoice,
  liveGMEntries,
  liveNarrationText,
  liveReasoningTier,
  myPlayerId,
  remoteActivity,
  onLocalActivity,
  netSession,
  floorHolderId,
  floorLockedOutIds,
  onFloorTake,
  onFloorRelease,
  onTTSAudioChunk,
  onTTSAudioEnd,
  ttsRelayMode,
  ttsRelayHandleRef,
  onViewportRecalc,
  turnLobby,
  onTurnLobbyStartNow,
  onTurnLobbyPass,
  partyTable,
  onPartyGo,
  onPartyJoin,
  onPartyRemove,
  onPartyAnswerHere,
  onIllustrate,
  onRegenerateImage,
}: StoryProps) {
  const [showChoicesModal, setShowChoicesModal] = React.useState(false);
  // The part being edited (any GM turn, not only the last), or null.
  const [editingPart, setEditingPart] = React.useState<number | null>(null);
  // The part whose actions row is open (tap a turn, or its "Turn actions"
  // button), or null.
  const [actionsFor, setActionsFor] = React.useState<number | null>(null);
  // Read aloud presses the same button the player's idle control would.
  const ttsControlRef = useRef<TTSControlHandle>(null);
  const readAloud = React.useCallback(() => ttsControlRef.current?.play(), []);
  // A new turn starting closes the row (adjusted during render, not in an
  // effect: it follows the props that say a turn is running).
  const turnRunning = !!loading || !!loadingStage;
  const [wasTurnRunning, setWasTurnRunning] = React.useState(turnRunning);
  if (turnRunning !== wasTurnRunning) {
    setWasTurnRunning(turnRunning);
    if (turnRunning) setActionsFor(null);
  }
  const [editedText, setEditedText] = React.useState("");
  const [isHovering, setIsHovering] = React.useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Whether the Observer's current settings make an automatic reset-and-
  // retry possible at all (see observer.ts's canObserverTriggerReset) - used
  // to warn the player, while narration is streaming, that this response
  // isn't final yet. Re-read on the same change event ArchitectureSettingsTab
  // fires when the player edits these settings mid-session.
  const [observerCanReset, setObserverCanReset] = React.useState(() =>
    canObserverTriggerReset(getObserverSettings()),
  );
  useEffect(() => {
    const update = () => setObserverCanReset(canObserverTriggerReset(getObserverSettings()));
    window.addEventListener(LAYER_SETTINGS_CHANGED_EVENT, update);
    return () => window.removeEventListener(LAYER_SETTINGS_CHANGED_EVENT, update);
  }, []);

  // Set when the Observer rewrote the latest turn and the GM's original draft
  // is still stored on the part (ScenePart.observerRewriteOriginal). No button
  // of its own - it just relabels Undo, which peels the revision off first
  // (see page.tsx's handleUndo) before undoing the turn itself.
  const observerRewriteOriginal = React.useMemo(() => {
    const parts = storyData?.scene?.parts || [];
    const last = parts[parts.length - 1];
    return last && !last.user ? last.observerRewriteOriginal : undefined;
  }, [storyData]);

  // Show hidden messages setting - persisted to localStorage
  const [showHiddenMessages, setShowHiddenMessages] = React.useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("showHiddenMessages") === "true";
  });

  // Listen for changes to showHiddenMessages in localStorage (from menu)
  React.useEffect(() => {
    const handleStorageChange = () => {
      if (typeof window !== "undefined") {
        setShowHiddenMessages(
          localStorage.getItem("showHiddenMessages") === "true",
        );
      }
    };
    window.addEventListener("storage", handleStorageChange);
    // Also check on mount and periodically for same-tab changes
    const interval = setInterval(handleStorageChange, 500);
    return () => {
      window.removeEventListener("storage", handleStorageChange);
      clearInterval(interval);
    };
  }, []);

  // Lore-title/NPC-name mention highlighting for the story prose - see
  // noteMentions.ts. Rebuilt only when the underlying notes/NPCs change.
  const mentionMatcher = React.useMemo(
    () => buildMentionMatcher(buildMentionCandidates(storyData)),
    [storyData],
  );
  const handleMentionClick = React.useCallback(
    (kind: "lore" | "npc", id: string) => onOpenNote?.(kind, id),
    [onOpenNote],
  );

  // Action mode state - persisted to localStorage
  const [actionMode, setActionMode] = React.useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("actionMode") === "true";
  });

  // Persist action mode to localStorage
  React.useEffect(() => {
    localStorage.setItem("actionMode", actionMode.toString());
  }, [actionMode]);

  // Font settings state
  const [fontSettings, setFontSettings] = useState({
    fontSize: 16,
    fontFamily: DEFAULT_READING_FONT,
    lineHeight: 1.6,
    paragraphSpacing: 0.5,
    theme: DEFAULT_THEME_ID,
  });

  // Load font settings from localStorage and listen for changes
  useEffect(() => {
    if (typeof window === "undefined") return;

    const loadFontSettings = () => {
      setFontSettings({
        fontSize: parseInt(localStorage.getItem("storyFontSize") || "16", 10),
        fontFamily:
          localStorage.getItem("storyFontFamily") || DEFAULT_READING_FONT,
        lineHeight: parseFloat(
          localStorage.getItem("storyLineHeight") || "1.6",
        ),
        paragraphSpacing: parseFloat(
          localStorage.getItem("storyParagraphSpacing") || "0.5",
        ),
        theme: localStorage.getItem("storyTheme") || DEFAULT_THEME_ID,
      });
    };

    loadFontSettings();

    // Listen for font settings changes from Settings modal
    const handleFontChange = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      setFontSettings(detail);
    };

    window.addEventListener("fontSettingsChanged", handleFontChange);
    return () =>
      window.removeEventListener("fontSettingsChanged", handleFontChange);
  }, []);

  // Couch co-op: which player the next typed line belongs to (passed to
  // StoryComposer; also read below to gate the PlayerBubbles voice UI)
  const couchPlayers =
    (storyData.multiplayer?.enabled && storyData.multiplayer.couchPlayers) ||
    [];
  // Whether the floating voice bubbles are on screen. They hang over the
  // bottom of the feed, so the feed gets room to scroll its last lines (and
  // a just-opened turn-actions row) clear of them. They step aside while a
  // turn is being edited, where they would sit on the text box.
  const showVoiceBubbles =
    !!onCustomInput && !partyTable && editingPart === null;

  // Kept at this level (rather than inside StoryComposer) so the "Enter/Space
  // jumps into the composer" keyboard shortcut below can reach it.
  const composerRef = useRef<HTMLTextAreaElement>(null);

  // Keyboard shortcuts
  React.useEffect(() => {
    if (shortcutsSuspended) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in inputs/textareas
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }
      // Enter/Space on a focused button (or link) presses it; it must not
      // also jump to the composer. Ctrl+Z, Ctrl+R and the arrows still apply.
      const onControl =
        e.target instanceof Element &&
        !!e.target.closest('button, a, [role="button"]');

      // Escape to close modal
      if (e.key === "Escape" && showChoicesModal) {
        e.preventDefault();
        setShowChoicesModal(false);
        return;
      }

      // Enter/Space to jump into the composer (when modal closed)
      if (
        (e.key === "Enter" || e.key === " ") &&
        !showChoicesModal &&
        !onControl &&
        editingPart === null
      ) {
        e.preventDefault();
        composerRef.current?.focus();
        return;
      }

      // Ctrl+Z for undo
      if (
        e.ctrlKey &&
        e.key === "z" &&
        canUndo &&
        onUndo &&
        !loading &&
        !loadingStage
      ) {
        e.preventDefault();
        onUndo();
        return;
      }

      // Ctrl+R for retry (prevent browser refresh)
      if (
        e.ctrlKey &&
        e.key === "r" &&
        canRetry &&
        onRetry &&
        !loading &&
        !loadingStage
      ) {
        e.preventDefault();
        onRetry();
        return;
      }

      // Arrow keys for navigation
      if (e.key === "ArrowLeft" && onNavigateLeft) {
        e.preventDefault();
        onNavigateLeft();
        return;
      }
      if (e.key === "ArrowRight" && onNavigateRight) {
        e.preventDefault();
        onNavigateRight();
        return;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    showChoicesModal,
    loading,
    loadingStage,
    canUndo,
    onUndo,
    canRetry,
    onRetry,
    editingPart,
    onNavigateLeft,
    onNavigateRight,
    shortcutsSuspended,
  ]);

  // Get selected choice from input state
  const selectedChoice = choices?.choices.find((c) => input[c.text]) || null;

  // Build chat messages from scene parts - pairs of user input + GM response
  const chatMessages: Array<{
    isUser: boolean;
    content: string;
    partIndex: number;
    messageType?: "normal" | "comment";
  }> = [];

  const normalizeUserText = (text: string): string => {
    return text
      .trim()
      .replace(/^>+\s*/g, "")
      .replace(/\s+/g, " ")
      .toLowerCase();
  };

  // The GM part currently being narrated is published into scene.parts as
  // soon as streaming starts (see page.tsx onStoryContent/onStoryComplete),
  // but its gmConversation/reasoning/reasoningTier only land later, in
  // onComplete once tools+choices also finish. Rendering it here in the
  // meantime would show a second, metadata-less bubble alongside the "live"
  // one below (which has the Thought/tool pills) - so skip it until
  // loadingStage clears and the finalized part has its full data.
  const isLiveStreamingPart = (index: number) =>
    (loadingStage === "gm" || loadingStage === "story") &&
    index === storyData.scene.parts.length - 1 &&
    !storyData.scene.parts[index].user;

  storyData.scene.parts.forEach((part, index) => {
    if (isLiveStreamingPart(index)) return;
    if (part.content.trim()) {
      chatMessages.push({
        isUser: part.user,
        content: part.content,
        partIndex: index,
        messageType: "normal",
      });
    }
    if (part.user && part.playerComment && part.playerComment.trim()) {
      chatMessages.push({
        isUser: true,
        content: part.playerComment,
        partIndex: index,
        messageType: "comment",
      });
    }
  });

  const pendingUserChoiceText: string = pendingUserChoice ?? "";

  const shouldShowPendingUserChoice = React.useMemo(() => {
    if (!pendingUserChoiceText.trim()) return false;
    if (!loading) return false;

    const lastMsg = chatMessages[chatMessages.length - 1];
    if (!lastMsg || !lastMsg.isUser) return true;

    const pendingNorm = normalizeUserText(pendingUserChoiceText);
    const lastNorm = normalizeUserText(lastMsg.content);

    // If the most recent rendered user message already contains the pending text
    // (e.g., pending="Attack" but rendered=">Attack\n[Skill: ...]"), don't show it again.
    if (!pendingNorm) return false;
    return !(lastNorm === pendingNorm || lastNorm.includes(pendingNorm));
  }, [pendingUserChoiceText, loading, chatMessages.length]);

  // Group messages into exchanges (user + following GM response)
  const exchanges: Array<{
    userMsg?: (typeof chatMessages)[0];
    gmMsg?: (typeof chatMessages)[0];
  }> = [];

  let currentExchange: (typeof exchanges)[0] = {};

  for (const msg of chatMessages) {
    if (msg.isUser) {
      // Start new exchange
      if (currentExchange.userMsg) {
        exchanges.push(currentExchange);
      }
      currentExchange = { userMsg: msg };
    } else {
      // GM response
      currentExchange.gmMsg = msg;
      exchanges.push(currentExchange);
      currentExchange = {};
    }
  }

  // Don't forget incomplete exchange (user message waiting for GM)
  if (currentExchange.userMsg) {
    exchanges.push(currentExchange);
  }

  // Every exchange renders the same way; only the latest one fades its prose in.
  const latestExchangeIndex = exchanges.length - 1;

  // Helper to get GM conversation and tool results for a scene part
  // Built once per change to the parts, not per render: GMTurn memoizes its
  // rebuilt timeline on these objects, and a timeline rebuilt with fresh
  // block ids remounts the prose, which replays its fade-in on every state
  // change on the page (tapping a turn, opening the menu).
  const gmDataByPart = React.useMemo(
    () => storyData.scene.parts.map((part) => buildGMDataForPart(part)),
    [storyData.scene.parts],
  );
  const getGMDataForPart = (partIndex: number) =>
    gmDataByPart[partIndex] ?? EMPTY_GM_DATA;


  // Pictures: a guest holds none (decision 60), and Regenerate is the host's.
  const isImageGuest = netSession?.role === "guest";
  const regenerateImageFor = (partIndex: number) =>
    onRegenerateImage && !isImageGuest
      ? (ref: SceneImageRef) => onRegenerateImage(partIndex, ref)
      : undefined;
  // The latest finished GM turn, for the Illustrate this button.
  const lastPartIndex = storyData.scene.parts.length - 1;
  const lastPart = storyData.scene.parts[lastPartIndex];
  const canIllustrateLast =
    !!onIllustrate &&
    !isImageGuest &&
    !!lastPart &&
    !lastPart.user &&
    !!lastPart.content.trim() &&
    !loading &&
    !loadingStage;

  const toggleActions = (partIndex: number) =>
    setActionsFor((open) => (open === partIndex ? null : partIndex));

  const startEditing = (partIndex: number) => {
    const part = storyData.scene.parts[partIndex];
    if (!part) return;
    setActionsFor(null);
    setEditedText(part.raw || part.content);
    setEditingPart(partIndex);
  };

  // The row under a tapped turn. The latest turn gets all five actions on the
  // conditions the old action bar used; an earlier turn gets Edit alone.
  const renderTurnActions = (partIndex: number) => {
    const busy = loading || !!loadingStage;
    const isLatest = partIndex === lastPartIndex;
    const closeThen = (fn: () => void) => () => {
      setActionsFor(null);
      fn();
    };
    return (
      <TurnActions
        disabled={busy}
        onRetry={isLatest && canRetry && onRetry ? closeThen(onRetry) : undefined}
        onUndo={isLatest && canUndo && onUndo ? closeThen(onUndo) : undefined}
        undoLabel={observerRewriteOriginal ? "Undo revision" : "Undo"}
        undoTitle={
          observerRewriteOriginal
            ? `The Observer revised this response (${observerRewriteOriginal.flag.detail}) - undo puts the GM's original back`
            : "Undo last action"
        }
        onEdit={onEdit && !busy ? () => startEditing(partIndex) : undefined}
        onIllustrate={
          isLatest && canIllustrateLast
            ? closeThen(() => onIllustrate?.(lastPartIndex))
            : undefined
        }
        onReadAloud={
          isLatest && storyText.trim() && isTTSEnabled()
            ? () => {
                setActionsFor(null);
                readAloud();
              }
            : undefined
        }
      />
    );
  };

  // State for combat display expansion
  const [showCombat, setShowCombat] = React.useState(true);

  // Handle choice selection from modal
  const handleSelectChoice = (choice: Choice) => {
    const index = choices.choices.findIndex((c) => c.text === choice.text);
    if (index !== -1) {
      handleSelect(index);
    }
  };

  // Whether we should keep pinning the view to the bottom as new content
  // streams in. True by default (and forced true whenever the player submits
  // a new action below) but flips off the moment the player scrolls up to
  // reread earlier text - without this, every streamed chunk (and the
  // layout shift when suggested choices appear) yanked the view back down
  // even while someone was mid-scroll reading history.
  const stickToBottomRef = useRef(true);
  const ignoreScrollRef = useRef(false);
  const NEAR_BOTTOM_THRESHOLD_PX = 80;

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const handleScroll = () => {
      const distanceFromBottom =
        container.scrollHeight - container.scrollTop - container.clientHeight;
      stickToBottomRef.current = distanceFromBottom < NEAR_BOTTOM_THRESHOLD_PX;
      // Scrolling hides the actions row - except the scroll that bringing
      // the row into view causes (see the effect below).
      if (!ignoreScrollRef.current) setActionsFor(null);
    };
    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => container.removeEventListener("scroll", handleScroll);
  }, []);

  // Opening the row under the latest turn adds height at the bottom: keep it
  // in view when the player is already there, without that scroll closing it.
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (actionsFor === null || !container || !stickToBottomRef.current) return;
    ignoreScrollRef.current = true;
    container.scrollTop = container.scrollHeight;
    const frame = requestAnimationFrame(() => {
      ignoreScrollRef.current = false;
    });
    return () => cancelAnimationFrame(frame);
  }, [actionsFor]);

  // A tap outside any turn closes the row; a tap on a turn is that turn's
  // own toggle (GMTurn onTap), so it is left to it.
  useEffect(() => {
    if (actionsFor === null) return;
    const onClick = (e: MouseEvent) => {
      if (e.target instanceof Element && e.target.closest("[data-turn]")) return;
      setActionsFor(null);
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [actionsFor]);

  // A fresh submission should always snap back to the bottom, even if the
  // player had scrolled up to reread something before acting.
  useEffect(() => {
    if (pendingUserChoice) stickToBottomRef.current = true;
  }, [pendingUserChoice]);

  // Auto-scroll to bottom when new messages arrive or during streaming -
  // but only while the player is already at (or hasn't left) the bottom.
  // liveGMEntries is included because that's what actually grows token-by-
  // token while the GM stage is thinking/narrating (see liveTimeline in
  // GMTurn below) - storyText alone only changes once the turn's
  // narration is fully assembled, so without this the view stayed put
  // through the entire streaming turn and only jumped at the very end.
  useEffect(() => {
    if (stickToBottomRef.current && scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop =
        scrollContainerRef.current.scrollHeight;
    }
  }, [chatMessages.length, loading, storyText, pendingUserChoice, liveGMEntries]);

  // The container's actual scrollable height depends on page.tsx's
  // async viewport measurement (contentAreaHeight), which can resolve a
  // beat after this component's first paint. If that resize happens after
  // the effect above already ran, scrollTop is left at 0 even though the
  // container is now short enough to need scrolling - re-apply bottom
  // scroll whenever the container's size settles (e.g. on mount/open).
  // Also fires when suggested-choice chips or streamed text change the
  // content height - gated the same way so it doesn't fight a manual scroll.
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const scrollToBottom = () => {
      if (stickToBottomRef.current) {
        container.scrollTop = container.scrollHeight;
      }
    };
    const resizeObserver = new ResizeObserver(scrollToBottom);
    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  }, []);

  return (
    <div className="w-full flex-1 min-h-0 flex flex-col px-0 sm:px-1 sm:max-w-3xl mx-auto">
      {/* Main Story Card */}
      <div
        className="rounded-none sm:rounded-2xl border-0 sm:border sm:border-white/10 sm:shadow-2xl sm:shadow-black/50 overflow-hidden relative flex flex-col flex-1 min-h-0 bg-ys-bg"
      >
        {/* Combat Display - shows active combat state */}
        {storyData.combatState?.active && (
          <CombatDisplay
            combatState={storyData.combatState}
            expanded={showCombat}
            onToggleExpand={() => setShowCombat(!showCombat)}
          />
        )}

        {/* The feed: one plain page, no cards. Turns are told apart by space. */}
        <div
          ref={scrollContainerRef}
          className="flex-1 overflow-y-auto min-h-0 text-ys-text"
        >
          <div
            className={`px-4 pt-4 space-y-6 sm:max-w-[68ch] sm:mx-auto ${
              showVoiceBubbles ? "pb-28" : "pb-4"
            }`}
          >
            {exchanges.map((exchange, idx) => (
              <div key={`exchange-${idx}`} className="space-y-3">
                {exchange.userMsg && (
                  <PlayerLine
                    content={exchange.userMsg.content}
                    couchPlayers={couchPlayers}
                    isComment={exchange.userMsg.messageType === "comment"}
                    fontSettings={fontSettings}
                  />
                )}
                {exchange.gmMsg && (
                  <GMTurn
                    content={exchange.gmMsg.content}
                    animate={idx === latestExchangeIndex}
                    showHiddenMessages={showHiddenMessages}
                    fontSettings={fontSettings}
                    gmConversation={
                      getGMDataForPart(exchange.gmMsg.partIndex).gmConversation
                    }
                    toolResults={
                      getGMDataForPart(exchange.gmMsg.partIndex).toolResults
                    }
                    storyReasoning={
                      getGMDataForPart(exchange.gmMsg.partIndex).storyReasoning
                    }
                    reasoningTier={
                      getGMDataForPart(exchange.gmMsg.partIndex).reasoningTier
                    }
                    images={
                      storyData.scene.parts[exchange.gmMsg.partIndex]?.images
                    }
                    isGuest={isImageGuest}
                    onRegenerateImage={regenerateImageFor(
                      exchange.gmMsg.partIndex,
                    )}
                    mentionMatcher={mentionMatcher}
                    onMentionClick={handleMentionClick}
                    onTap={() => toggleActions(exchange.gmMsg!.partIndex)}
                    onToggleActions={() =>
                      toggleActions(exchange.gmMsg!.partIndex)
                    }
                    actionsOpen={actionsFor === exchange.gmMsg.partIndex}
                    actions={renderTurnActions(exchange.gmMsg.partIndex)}
                  />
                )}
              </div>
            ))}

            {/* Pending user choice (shown immediately when submitted) */}
            {shouldShowPendingUserChoice && (
              <PlayerLine
                content={pendingUserChoiceText}
                couchPlayers={couchPlayers}
                fontSettings={fontSettings}
              />
            )}

            {/* Turn currently generating - the work line says what the GM is
                doing, and the narration streams in below it. */}
            {(loadingStage === "gm" || loadingStage === "story") && (
              <GMTurn
                content=""
                animate={true}
                isStreaming={true}
                showHiddenMessages={showHiddenMessages}
                fontSettings={fontSettings}
                liveTimeline={liveGMEntries || []}
                reasoningTier={
                  liveReasoningTier
                    ? {
                        tier: liveReasoningTier.tier,
                        modelKey: String(liveReasoningTier.modelKey),
                        effort: liveReasoningTier.reasoningEffort,
                      }
                    : undefined
                }
                mentionMatcher={mentionMatcher}
                onMentionClick={handleMentionClick}
              />
            )}

            {/* Reset warning: the Observer (observer.ts) reviews narration
                only after it finishes streaming, and can silently discard and
                regenerate it if flagged - jarring if the player has no idea
                that's possible. Only shown while narration is actually
                streaming, and only when the current settings make a reset
                possible at all. */}
            {loadingStage === "story" &&
              observerCanReset &&
              !storyData.sessionZeroActive && (
                <p className="text-xs text-ys-muted italic">
                  Not final yet - the Observer may flag and rewrite this response. Don&apos;t get too attached.
                </p>
              )}
          </div>
        </div>

        {/* Edit panel: any GM turn, opened from its actions row. */}
        {editingPart !== null && (
          <div className="p-4 bg-ys-surface border-t border-ys-border">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-semibold text-ys-text flex items-center gap-2">
                  <DynamicIcon name="Pencil" className="w-4 h-4" />
                  Edit Response
                </h3>
              </div>
              {editingPart < (storyData.scene.summarizedThroughIndex ?? 0) && (
                <p className="text-xs text-ys-muted">
                  This turn is already in the summary. The GM reads the
                  summary, not this text.
                </p>
              )}
              <textarea
                value={editedText}
                onChange={(e) => setEditedText(e.target.value)}
                className="w-full h-48 px-3 py-2 bg-ys-bg border border-ys-border rounded-lg text-ys-text focus:outline-none focus:ring-2 focus:ring-ys-accent font-mono text-sm resize-none transition-colors"
                placeholder="Edit the raw AI output..."
              />
              <div className="flex items-center justify-between">
                <span className="text-xs text-ys-muted">
                  {editedText.length} characters
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setEditingPart(null);
                      setEditedText("");
                    }}
                    className="px-3 py-1.5 text-sm font-medium text-ys-text bg-ys-bg hover:bg-ys-border border border-ys-border rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      if (onEdit && editedText.trim()) {
                        onEdit(editedText, editingPart);
                        setEditingPart(null);
                        setEditedText("");
                      }
                    }}
                    disabled={!editedText.trim()}
                    className="px-3 py-1.5 text-sm font-medium bg-ys-accent text-ys-bg hover:opacity-90 disabled:opacity-40 rounded-lg transition-opacity flex items-center gap-1.5"
                  >
                    <DynamicIcon name="Save" className="w-4 h-4" />
                    Save
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Narration player: slim, only while a narration is unfinished. It
            stays mounted when idle because it runs auto-narrate. Manual read
            waits for narration to finish; auto-narrate (if enabled) starts
            reading live as the GM streams instead of waiting - see
            storyTextReady. While streaming, prefer liveNarrationText (grows
            as the GM writes, even on the common path where storyText itself
            only jumps to the full text once at the very end) over storyText -
            falls back to storyText when there's nothing live yet (e.g. the
            separate story-stage path, which already streams storyText
            incrementally on its own). */}
        <TTSControls
          variant="slim"
          controlHandleRef={ttsControlRef}
          text={
            !storyTextReady && liveNarrationText ? liveNarrationText : storyText
          }
          disabled={loading || !storyTextReady}
          storyTextReady={storyTextReady}
          onAudioChunk={onTTSAudioChunk}
          onAudioEnd={onTTSAudioEnd}
          relayMode={ttsRelayMode}
          relayHandleRef={ttsRelayHandleRef}
          storyId={storyId}
        />

        {/* Collect-all-then-generate lobby: shown while the host is waiting
            on the table (host sees "Start now" / "Pass"; guests see who
            we're waiting on and can pass their own turn). Rendered directly
            above the composer, in normal flow, so it can never cover it. */}
        {netSession && turnLobby && onTurnLobbyStartNow && onTurnLobbyPass && (
          <TurnLobbyOverlay
            status={turnLobby}
            couchPlayers={couchPlayers}
            myPlayerId={netSession.myLocalPlayerId}
            isHost={netSession.role === "host"}
            onStartNow={onTurnLobbyStartNow}
            onPass={onTurnLobbyPass}
          />
        )}

        {/* Party mode: who is at the table, the spotlight, the queue and Go.
            Rendered in normal flow above the composer, like the lobby. */}
        {partyTable && onPartyGo && onPartyJoin && onPartyRemove && onPartyAnswerHere && (
          <PartyTableStrip
            table={partyTable}
            onGo={onPartyGo}
            onJoin={onPartyJoin}
            onRemove={onPartyRemove}
            onAnswerHere={onPartyAnswerHere}
          />
        )}

        {/* Composer: suggested choices, player switcher, and chat input */}
        {editingPart === null && (
          <StoryComposer
            ref={composerRef}
            choices={choices}
            loading={loading}
            loadingStage={loadingStage}
            couchPlayers={couchPlayers}
            onCustomInput={onCustomInput}
            onActionConfirm={onActionConfirm}
            onStop={onStop}
            onFocusChange={onViewportRecalc}
          />
        )}
      </div>

      {/* Voice input bubble(s): tap to speak a turn - the default voice
          input UI now, replacing the old composer mic button. Couch
          co-op/multiplayer get one bubble per player; solo play gets a
          single default bubble instead. */}
      {showVoiceBubbles && onCustomInput && (
        <PlayerBubbles
          players={couchPlayers.length > 0 ? couchPlayers : SOLO_VOICE_PLAYER}
          onSubmit={(text, speakerIds) =>
            onCustomInput(text, undefined, speakerIds, "voice")
          }
          disabled={loading || !!loadingStage}
          myPlayerId={myPlayerId}
          remoteActivity={remoteActivity}
          onLocalActivity={onLocalActivity}
          floorHolderId={floorHolderId}
          floorLockedOutIds={floorLockedOutIds}
          onFloorTake={onFloorTake}
          onFloorRelease={onFloorRelease}
        />
      )}

      {/* Choices Modal */}
      <ChoicesModal
        isOpen={showChoicesModal}
        onClose={() => setShowChoicesModal(false)}
        choices={choices}
        storyData={storyData}
        selectedChoice={selectedChoice}
        onSelectChoice={handleSelectChoice}
        onConfirm={handleChoice}
        onCustomInput={onCustomInput}
        onActionConfirm={onActionConfirm}
        onCommentSubmit={onCommentSubmit}
        onRerollChoices={onRerollChoices}
        loading={loading}
        // When there are no preset choices (e.g. a fresh Freeform Story),
        // open straight into the freeform text box instead of an empty list.
        actionMode={choices?.choices?.length ? actionMode : true}
        onActionModeChange={setActionMode}
      />
    </div>
  );
}
