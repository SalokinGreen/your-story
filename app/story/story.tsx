"use client";
import { Choice, Choices, StoryData, CouchPlayer } from "../misc/structs";
import React, { useState, useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import TTSControls from "../components/TTSControls";
import ChoicesModal from "../components/ChoicesModal";
import { DynamicIcon } from "../components/DynamicIcon";
import SyncIndicator from "../components/SyncIndicator";
import NetStatusBadge from "../components/NetStatusBadge";
import type { GuestJoinedInfo, NetSessionInfo } from "../misc/multiplayer/session";
import PlayerBubbles from "../components/PlayerBubbles";
import CombatDisplay from "../components/CombatDisplay";
import { ChapterNav } from "../components/ChapterNav";
import { ObjectivesStrip } from "../components/ObjectivesStrip";
import type { SyncStatus } from "../misc/localStoryManager";
import {
  type TimelineBlock,
  buildSavedTimeline,
  narrationCameFromGMStage,
  extractVisibleText,
} from "../misc/turnTimeline";
import { getToolProgressLabel } from "../misc/gmToolLabels";
import {
  type MentionMatcher,
  buildMentionCandidates,
  buildMentionMatcher,
  splitTextWithMentions,
} from "../misc/noteMentions";
import { canObserverTriggerReset } from "../misc/observer";
import {
  getObserverSettings,
  LAYER_SETTINGS_CHANGED_EVENT,
} from "../misc/layerSettings";
import {
  type ResolvedTier,
  getTierModelDisplayName,
} from "../misc/reasoningTiers";

// Display-only shape for the reasoning-tier badge next to "Game Master" -
// covers both a saved ScenePart's stored fields and a live in-progress
// ResolvedTier (see generation.ts:onReasoningTierResolved).
interface ReasoningTierDisplay {
  tier: number;
  modelKey: string;
  effort: string;
}

// Solo play has no CouchPlayer of its own (see structs.ts) - this stands in
// for PlayerBubbles' `players` prop so voice input still gets a bubble
// outside of couch co-op/multiplayer.
const SOLO_VOICE_PLAYER: CouchPlayer[] = [
  { id: "solo", name: "You", color: "#8b5cf6" },
];

interface StoryProps {
  storyData: StoryData;
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
  netPeers?: GuestJoinedInfo[];
  onActionConfirm?: (choice: Choice, playerComment?: string) => void;
  onCommentSubmit?: (comment: string) => void;
  onRerollChoices?: () => void;
  onRetry?: () => void;
  canRetry?: boolean;
  onUndo?: () => void;
  canUndo?: boolean;
  onStop?: () => void;
  onEdit?: (rawText: string, partIndex: number) => void;
  viewingPartIndex?: number | null;
  onNavigateLeft?: () => void;
  onNavigateRight?: () => void;
  onNavigateToIndex?: (index: number) => void;
  onResetToCurrentPart?: () => void;
  syncStatus?: SyncStatus;
  onOpenJournal?: () => void;
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
  // next to "Game Master" alongside the saved per-turn badge below.
  liveReasoningTier?: ResolvedTier | null;
  // Re-measure the page's keyboard-aware viewport height (see page.tsx) -
  // called on composer focus/blur since iOS can scroll/resize the visual
  // viewport asynchronously, after the initial resize event.
  onViewportRecalc?: () => void;
}

// Font settings interface
interface FontSettings {
  fontSize: number;
  fontFamily: string;
  lineHeight: number;
  paragraphSpacing: number;
  theme?: string;
  themeColors?: {
    background: string;
    text: string;
    accent: string;
  };
}

// A single minimized, expandable thinking/tool row - click to see the full
// text or tool result. Modeled on how Claude's own UI shows thinking and
// tool-use blocks: collapsed by default, inline with the reply, not
// gated behind one all-or-nothing toggle.
function TimelineEntryPill({ block }: { block: TimelineBlock }) {
  // A thinking block streams its reasoning live and expanded (Claude-style)
  // while it's generating, then collapses back to a compact pill once it's
  // done - unless the player has explicitly toggled it, in which case their
  // choice wins. `override === null` means "follow the streaming state".
  const [override, setOverride] = React.useState<boolean | null>(null);
  if (block.kind === "text") return null; // handled by the caller directly

  const isTool = block.kind === "tool";
  const isThinking = block.kind === "thinking";
  const autoExpanded = isThinking && !!block.streaming;
  const expanded = override ?? autoExpanded;

  const label = isTool
    ? getToolProgressLabel(block.toolName || "")
    : block.streaming
      ? "Thinking"
      : block.isReasoning
        ? "Thought"
        : "Thinking";
  const detail = isTool ? block.contextForStory : block.content;
  const canExpand = !!detail;

  return (
    <div className="my-1 text-xs">
      <button
        type="button"
        onClick={() => canExpand && setOverride(!expanded)}
        className={`flex items-center gap-1.5 text-gray-400 ${
          canExpand ? "hover:text-gray-300 cursor-pointer" : "cursor-default"
        } transition-colors`}
      >
        {isTool ? (
          <DynamicIcon
            name={block.success === false ? "X" : "Check"}
            className={`w-3.5 h-3.5 shrink-0 ${
              block.success === false ? "text-red-400" : "text-green-400"
            }`}
          />
        ) : (
          <DynamicIcon
            name="Brain"
            className={`w-3.5 h-3.5 shrink-0 ${block.streaming ? "animate-pulse text-blue-400" : ""}`}
          />
        )}
        <span>
          {label}
          {block.streaming ? "…" : ""}
        </span>
        {canExpand && (
          <DynamicIcon
            name={expanded ? "ChevronUp" : "ChevronDown"}
            className="w-3 h-3 text-gray-500"
          />
        )}
      </button>
      {expanded && detail && (
        <p className="mt-1 ml-5 pl-2 border-l-2 border-gray-700/50 text-gray-500 italic whitespace-pre-wrap max-h-60 overflow-y-auto">
          {detail}
          {block.streaming && (
            <span className="animate-pulse text-blue-400">▌</span>
          )}
        </p>
      )}
    </div>
  );
}

// Renders a turn's timeline in reading order - thinking/tool blocks as
// minimized pills, text blocks as normal flowing prose.
function TimelineView({
  blocks,
  animate,
  showHiddenMessages,
  fontSettings,
  mentionMatcher,
  onMentionClick,
}: {
  blocks: TimelineBlock[];
  animate: boolean;
  showHiddenMessages: boolean;
  fontSettings?: FontSettings;
  mentionMatcher?: MentionMatcher | null;
  onMentionClick?: (kind: "lore" | "npc", id: string) => void;
}) {
  return (
    <>
      {blocks.map((block) =>
        block.kind === "text" ? (
          <React.Fragment key={block.id}>
            {prettify(
              block.content || "",
              animate,
              showHiddenMessages,
              fontSettings,
              mentionMatcher,
              onMentionClick,
            )}
            {block.streaming && (
              <span className="animate-pulse text-blue-400">▌</span>
            )}
          </React.Fragment>
        ) : (
          <TimelineEntryPill key={block.id} block={block} />
        ),
      )}
    </>
  );
}

// Chat message bubble component
interface ChatMessageProps {
  isUser: boolean;
  content: string;
  displayName: string;
  avatarUrl?: string;
  isPrevious?: boolean;
  isLoading?: boolean;
  showHiddenMessages?: boolean;
  fontSettings?: FontSettings;
  messageType?: "normal" | "comment";
  // Saved GM conversation for a historical turn - used to rebuild its
  // timeline (see turnTimeline.ts:buildSavedTimeline)
  gmConversation?: Array<{
    role: "assistant" | "tool";
    content: string;
    reasoning?: string;
    tool_calls?: Array<{
      id: string;
      function: { name: string; arguments: string };
    }>;
    tool_call_id?: string;
  }>;
  // Tool results lookup (keyed by tool_call_id)
  toolResults?: Map<
    string,
    { success: boolean; contextForStory: string; toolName: string }
  >;
  // The story stage's own native reasoning (ScenePart.reasoning) - see
  // turnTimeline.ts:buildSavedTimeline
  storyReasoning?: string;
  // Reasoning tier that adjudicated this turn (see reasoningTiers.ts) -
  // rendered as a small "T{n}" badge next to displayName. Undefined for
  // turns generated before this was tracked, and for the player's own
  // messages (isUser).
  reasoningTier?: ReasoningTierDisplay;
  // Live timeline for the turn currently generating - undefined for
  // historical messages (which rebuild their timeline from gmConversation).
  liveTimeline?: TimelineBlock[];
  isStreaming?: boolean;
  mentionMatcher?: MentionMatcher | null;
  onMentionClick?: (kind: "lore" | "npc", id: string) => void;
}

function ChatMessage({
  isUser,
  content,
  displayName,
  avatarUrl,
  isPrevious = false,
  isLoading = false,
  showHiddenMessages = false,
  fontSettings,
  messageType = "normal",
  gmConversation,
  toolResults,
  storyReasoning,
  reasoningTier,
  liveTimeline,
  isStreaming = false,
  mentionMatcher,
  onMentionClick,
}: ChatMessageProps) {
  const opacity = isPrevious ? "opacity-50" : "opacity-100";
  const isComment = messageType === "comment";

  // Always stack vertically: avatar + name row at top, content below
  const rowAlign = isUser ? "justify-end" : "justify-start";

  // On the common path the GM stage narrates the story itself, so its
  // visible (non-<thinking>) segments ARE `content` - rebuilding the
  // timeline can extract them inline, interleaved with that round's tool
  // calls, instead of showing "thinking" first and the narration
  // separately afterward.
  const narrationInline = React.useMemo(
    () =>
      !isUser && gmConversation
        ? narrationCameFromGMStage(gmConversation, content)
        : false,
    [isUser, gmConversation, content],
  );
  const savedTimeline = React.useMemo(
    () =>
      !isUser && (gmConversation || storyReasoning)
        ? buildSavedTimeline(
            gmConversation,
            toolResults,
            narrationInline,
            storyReasoning,
          )
        : [],
    [isUser, gmConversation, toolResults, narrationInline, storyReasoning],
  );

  const isLive = !isUser && liveTimeline !== undefined;
  const timeline = isLive ? liveTimeline! : savedTimeline;
  // The separate story-stage path (GM stage didn't narrate anything
  // itself) still needs `content` rendered on its own, after the timeline.
  const showSeparateContent = !isUser && !isLive && !narrationInline;

  const showBox =
    isUser ||
    timeline.length > 0 ||
    !!content ||
    isLoading ||
    !isStreaming;

  return (
    <div
      className={`flex flex-col gap-1 ${opacity} transition-opacity duration-300`}
    >
      {/* Avatar + Name row */}
      <div className={`flex items-center gap-2 ${rowAlign}`}>
        {isUser ? (
          avatarUrl ? (
            <img
              src={avatarUrl}
              alt={displayName}
              className="w-6 h-6 rounded-full object-cover border-2 border-blue-400/30"
            />
          ) : (
            <div className="w-6 h-6 rounded-full bg-linear-to-br from-blue-500 to-indigo-600 flex items-center justify-center border-2 border-blue-400/30">
              <DynamicIcon name="User" className="w-3 h-3 text-white" />
            </div>
          )
        ) : (
          <div className="w-6 h-6 rounded-full bg-linear-to-br from-purple-500 to-pink-600 flex items-center justify-center border-2 border-purple-400/30 shadow-[0_0_8px_rgba(147,51,234,0.5)]">
            <DynamicIcon name="Sparkles" className="w-3 h-3 text-white" />
          </div>
        )}
        <span
          className={`text-xs font-semibold ${
            isUser ? "text-blue-300" : "text-purple-300"
          }`}
        >
          {displayName}
        </span>
        {!isUser && reasoningTier && (
          <span
            className="text-[10px] font-mono text-purple-300/60 border border-purple-400/20 rounded px-1 leading-tight cursor-default"
            title={`${getTierModelDisplayName(reasoningTier.modelKey)} · ${reasoningTier.effort} effort`}
          >
            T{reasoningTier.tier}
          </span>
        )}
        {isUser && isComment && (
          <span className="text-[10px] text-blue-300/50">comment</span>
        )}
      </div>

      {/* Message Content */}
      <div className="w-full">
        {showBox && (
          <div
            className={`rounded-xl p-2 sm:p-3 backdrop-blur-md ${
              isUser
                ? isComment
                  ? "bg-blue-500/[0.06] border border-blue-400/15"
                  : "bg-blue-500/[0.08] border border-blue-400/20"
                : "bg-purple-500/[0.06] border border-purple-400/15"
            }`}
          >
            {isLoading && timeline.length === 0 && !content ? (
              <div className="flex items-center gap-2 text-purple-200/60">
                <div className="w-4 h-4 border-2 border-purple-400/60 border-t-purple-300 rounded-full animate-spin" />
                <span>Thinking...</span>
              </div>
            ) : isUser ? (
              <p
                className={`whitespace-pre-wrap ${
                  isComment ? "text-blue-100/80 italic" : "text-blue-100"
                }`}
              >
                {content}
              </p>
            ) : (
              <>
                <TimelineView
                  blocks={timeline}
                  animate={!isPrevious}
                  showHiddenMessages={showHiddenMessages}
                  fontSettings={fontSettings}
                  mentionMatcher={mentionMatcher}
                  onMentionClick={onMentionClick}
                />
                {showSeparateContent &&
                  prettify(
                    content,
                    !isPrevious,
                    showHiddenMessages,
                    fontSettings,
                    mentionMatcher,
                    onMentionClick,
                  )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
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

export default function Story({
  storyData,
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
  viewingPartIndex,
  onNavigateLeft,
  onNavigateRight,
  onNavigateToIndex,
  onResetToCurrentPart,
  syncStatus,
  onOpenJournal,
  onOpenNote,
  pendingUserChoice,
  liveGMEntries,
  liveNarrationText,
  liveReasoningTier,
  myPlayerId,
  remoteActivity,
  onLocalActivity,
  netSession,
  netPeers,
  onViewportRecalc,
}: StoryProps) {
  const [showChoicesModal, setShowChoicesModal] = React.useState(false);
  const [editMode, setEditMode] = React.useState(false);
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
    fontFamily:
      "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    lineHeight: 1.6,
    paragraphSpacing: 0.5,
    theme: "default",
    themeColors: {
      background: "rgb(23, 37, 84)",
      text: "rgb(239, 246, 255)",
      accent: "rgb(59, 130, 246)",
    },
  });

  // Load font settings from localStorage and listen for changes
  useEffect(() => {
    if (typeof window === "undefined") return;

    const loadFontSettings = () => {
      // Get theme colors from CSS variables or use defaults
      const computedStyle = getComputedStyle(document.documentElement);
      const bgColor =
        computedStyle.getPropertyValue("--story-bg-color").trim() ||
        "rgb(23, 37, 84)";
      const textColor =
        computedStyle.getPropertyValue("--story-text-color").trim() ||
        "rgb(239, 246, 255)";
      const accentColor =
        computedStyle.getPropertyValue("--story-accent-color").trim() ||
        "rgb(59, 130, 246)";

      setFontSettings({
        fontSize: parseInt(localStorage.getItem("storyFontSize") || "16", 10),
        fontFamily:
          localStorage.getItem("storyFontFamily") ||
          "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        lineHeight: parseFloat(
          localStorage.getItem("storyLineHeight") || "1.6",
        ),
        paragraphSpacing: parseFloat(
          localStorage.getItem("storyParagraphSpacing") || "0.5",
        ),
        theme: localStorage.getItem("storyTheme") || "default",
        themeColors: {
          background: bgColor,
          text: textColor,
          accent: accentColor,
        },
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

  // Kept at this level (rather than inside StoryComposer) so the "Enter/Space
  // jumps into the composer" keyboard shortcut below can reach it.
  const composerRef = useRef<HTMLTextAreaElement>(null);

  // Keyboard shortcuts
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in inputs/textareas
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

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
        !editMode
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
    editMode,
    onNavigateLeft,
    onNavigateRight,
  ]);

  // Get selected choice from input state
  const selectedChoice = choices?.choices.find((c) => input[c.text]) || null;

  // Get display name and avatar for chat display
  const playerDisplayName =
    storyData.displayName || storyData.player_name || "Player";
  const playerAvatarUrl = storyData.displayAvatar;

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

  // Show last 3 exchanges for context (2 previous + 1 current)
  const visibleExchangeCount = 3;
  const visibleExchanges = exchanges.slice(-visibleExchangeCount);
  const previousExchanges = exchanges.slice(0, -visibleExchangeCount);
  const currentExchangeIndex = visibleExchanges.length - 1;

  // Helper to get GM conversation and tool results for a scene part
  const getGMDataForPart = (partIndex: number) => {
    const part = storyData.scene.parts[partIndex];
    if (!part)
      return {
        gmConversation: [],
        toolResults: new Map(),
        storyReasoning: undefined,
        reasoningTier: undefined as ReasoningTierDisplay | undefined,
      };

    // Build toolResults map from gmToolCalls (keyed by toolCallId)
    const toolResults = new Map<
      string,
      { success: boolean; contextForStory: string; toolName: string }
    >();
    if (part.gmToolCalls) {
      for (const tc of part.gmToolCalls) {
        if (tc.toolCallId) {
          toolResults.set(tc.toolCallId, {
            success: tc.success,
            contextForStory: tc.contextForStory || "",
            toolName: tc.toolName || "",
          });
        }
      }
    }

    return {
      gmConversation: part.gmConversation || [],
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
  const NEAR_BOTTOM_THRESHOLD_PX = 80;

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const handleScroll = () => {
      const distanceFromBottom =
        container.scrollHeight - container.scrollTop - container.clientHeight;
      stickToBottomRef.current = distanceFromBottom < NEAR_BOTTOM_THRESHOLD_PX;
    };
    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => container.removeEventListener("scroll", handleScroll);
  }, []);

  // A fresh submission should always snap back to the bottom, even if the
  // player had scrolled up to reread something before acting.
  useEffect(() => {
    if (pendingUserChoice) stickToBottomRef.current = true;
  }, [pendingUserChoice]);

  // Auto-scroll to bottom when new messages arrive or during streaming -
  // but only while the player is already at (or hasn't left) the bottom.
  // liveGMEntries is included because that's what actually grows token-by-
  // token while the GM stage is thinking/narrating (see liveTimeline in
  // ChatMessage below) - storyText alone only changes once the turn's
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
        className="rounded-none sm:rounded-2xl border-0 sm:border sm:border-white/10 sm:shadow-2xl sm:shadow-black/50 overflow-hidden relative flex flex-col flex-1 min-h-0 backdrop-blur-xl"
        style={{
          backgroundColor: fontSettings.themeColors?.background,
        }}
      >
        {/* Sync Status Indicator - top right corner */}
        {syncStatus && syncStatus !== "local-only" && (
          <div className="absolute top-3 right-3 z-10">
            <SyncIndicator status={syncStatus} />
          </div>
        )}

        {/* Networked multiplayer connection status - top left corner */}
        {netSession && (
          <div className="absolute top-3 left-3 z-10">
            <NetStatusBadge netSession={netSession} peers={netPeers ?? []} />
          </div>
        )}

        {/* Header with story name, chapter nav, and scroll indicator */}
        <div className="flex items-center justify-between px-3 py-1 sm:px-4 sm:py-2 bg-white/[0.03] border-b border-white/10">
          <div className="flex items-center gap-2 min-w-0">
            <DynamicIcon name="BookOpen" className="w-4 h-4 text-blue-300 shrink-0" />
            <span className="text-sm font-medium text-blue-200 truncate max-w-[200px]">
              {storyData.story_name || "Untitled Story"}
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {exchanges.length > visibleExchangeCount && (
              <span className="text-xs text-blue-400/60 hidden sm:inline">
                ↑ Scroll for history ({exchanges.length} turns)
              </span>
            )}
            {onNavigateToIndex && (
              <ChapterNav
                parts={storyData.scene.parts}
                currentIndex={viewingPartIndex ?? null}
                onJump={onNavigateToIndex}
              />
            )}
          </div>
        </div>

        {/* Objectives Strip - glanceable active quests/threads */}
        <ObjectivesStrip storyData={storyData} onOpenJournal={onOpenJournal} />

        {/* Combat Display - shows active combat state */}
        {storyData.combatState?.active && (
          <CombatDisplay
            combatState={storyData.combatState}
            expanded={showCombat}
            onToggleExpand={() => setShowCombat(!showCombat)}
          />
        )}

        {/* Chat Messages Area - Scrollable */}
        <div
          ref={scrollContainerRef}
          className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-3 sm:space-y-4 min-h-0 sm:min-h-[300px]"
          style={{ color: fontSettings.themeColors?.text }}
        >
          {/* Previous exchanges (scrolled history) */}
          {previousExchanges.map((exchange, idx) => (
            <React.Fragment key={`old-${idx}`}>
              {exchange.userMsg && (
                <ChatMessage
                  isUser={true}
                  content={exchange.userMsg.content}
                  displayName={playerDisplayName}
                  avatarUrl={playerAvatarUrl}
                  isPrevious={true}
                  showHiddenMessages={showHiddenMessages}
                  fontSettings={fontSettings}
                  messageType={exchange.userMsg.messageType}
                />
              )}
              {exchange.gmMsg && (
                <ChatMessage
                  isUser={false}
                  content={exchange.gmMsg.content}
                  displayName="Game Master"
                  isPrevious={true}
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
                  mentionMatcher={mentionMatcher}
                  onMentionClick={handleMentionClick}
                />
              )}
            </React.Fragment>
          ))}

          {/* Visible exchanges (last 3) */}
          {visibleExchanges.map((exchange, idx) => {
            const isPrevious = idx < currentExchangeIndex;

            return (
              <React.Fragment key={`visible-${idx}`}>
                {exchange.userMsg && (
                  <ChatMessage
                    isUser={true}
                    content={exchange.userMsg.content}
                    displayName={playerDisplayName}
                    avatarUrl={playerAvatarUrl}
                    isPrevious={isPrevious}
                    showHiddenMessages={showHiddenMessages}
                    fontSettings={fontSettings}
                    messageType={exchange.userMsg.messageType}
                  />
                )}
                {exchange.gmMsg && (
                  <ChatMessage
                    isUser={false}
                    content={exchange.gmMsg.content}
                    displayName="Game Master"
                    isPrevious={isPrevious}
                    showHiddenMessages={showHiddenMessages}
                    fontSettings={fontSettings}
                    gmConversation={
                      getGMDataForPart(exchange.gmMsg.partIndex).gmConversation
                    }
                    toolResults={
                      getGMDataForPart(exchange.gmMsg.partIndex).toolResults
                    }
                    storyReasoning={
                      getGMDataForPart(exchange.gmMsg.partIndex)
                        .storyReasoning
                    }
                    reasoningTier={
                      getGMDataForPart(exchange.gmMsg.partIndex)
                        .reasoningTier
                    }
                    mentionMatcher={mentionMatcher}
                    onMentionClick={handleMentionClick}
                  />
                )}
              </React.Fragment>
            );
          })}

          {/* Pending user choice (shown immediately when submitted) */}
          {shouldShowPendingUserChoice && (
            <ChatMessage
              isUser={true}
              content={pendingUserChoiceText}
              displayName={playerDisplayName}
              avatarUrl={playerAvatarUrl}
              isPrevious={false}
              showHiddenMessages={showHiddenMessages}
              fontSettings={fontSettings}
            />
          )}

          {/* Turn currently generating - one continuous message with
              thinking/tool calls shown as minimized pills interleaved with
              the streaming narration, in the order they actually happened. */}
          {(loadingStage === "gm" || loadingStage === "story") && (
            <ChatMessage
              isUser={false}
              content=""
              displayName="Game Master"
              isLoading={true}
              showHiddenMessages={showHiddenMessages}
              fontSettings={fontSettings}
              liveTimeline={liveGMEntries || []}
              isStreaming={true}
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
          {loadingStage === "story" && observerCanReset && (
            <p className="px-1 text-xs text-blue-200/40 italic">
              Not final yet - the Observer may flag and rewrite this response. Don&apos;t get too attached.
            </p>
          )}
        </div>

        {/* Edit Mode */}
        {editMode && (
          <div className="p-4 bg-white/[0.03] border-t border-white/10">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-semibold text-white flex items-center gap-2">
                  <DynamicIcon name="Pencil" className="w-4 h-4" />
                  Edit Response
                </h3>
              </div>
              <textarea
                value={editedText}
                onChange={(e) => setEditedText(e.target.value)}
                className="w-full h-48 px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500/40 focus:border-purple-400/40 font-mono text-sm resize-none transition-colors"
                placeholder="Edit the raw AI output..."
              />
              <div className="flex items-center justify-between">
                <span className="text-xs text-blue-200/40">
                  {editedText.length} characters
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setEditMode(false);
                      setEditedText("");
                    }}
                    className="px-3 py-1.5 text-sm font-medium text-blue-200 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      if (onEdit && editedText.trim()) {
                        onEdit(editedText, storyData.scene.parts.length - 1);
                        setEditMode(false);
                        setEditedText("");
                      }
                    }}
                    disabled={!editedText.trim()}
                    className="px-3 py-1.5 text-sm font-medium bg-linear-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 disabled:from-white/10 disabled:to-white/10 disabled:text-blue-300/40 text-white rounded-lg shadow-md shadow-purple-950/40 disabled:shadow-none transition-all flex items-center gap-1.5"
                  >
                    <DynamicIcon name="Save" className="w-4 h-4" />
                    Save
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Action Buttons Bar */}
        {!editMode && (
          <div className="flex items-center justify-between px-4 py-2 bg-white/[0.03] border-t border-white/10">
            {/* Left side: Retry, Undo & Edit */}
            <div className="flex items-center gap-1.5 sm:gap-1">
              {canUndo && onUndo && (
                <button
                  onClick={onUndo}
                  disabled={loading || !!loadingStage}
                  className="px-3 py-2.5 sm:px-2 sm:py-1.5 text-sm font-medium text-blue-200/70 hover:text-white hover:bg-white/10 active:bg-white/15 rounded-lg transition-colors flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed touch-manipulation"
                  title="Undo last action"
                >
                  <DynamicIcon name="Undo2" className="w-5 h-5 sm:w-4 sm:h-4" />
                  <span className="hidden sm:inline">Undo</span>
                </button>
              )}
              {canRetry && onRetry && (
                <button
                  onClick={onRetry}
                  disabled={loading || !!loadingStage}
                  className="px-3 py-2.5 sm:px-2 sm:py-1.5 text-sm font-medium text-amber-400 hover:bg-amber-500/15 active:bg-amber-500/20 rounded-lg transition-colors flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed touch-manipulation"
                  title="Regenerate response"
                >
                  <DynamicIcon
                    name="RotateCcw"
                    className="w-5 h-5 sm:w-4 sm:h-4"
                  />
                  <span className="hidden sm:inline">Retry</span>
                </button>
              )}
              {onEdit && !loading && !loadingStage && (
                <button
                  onClick={() => {
                    setEditMode(true);
                    const lastPart =
                      storyData.scene.parts[storyData.scene.parts.length - 1];
                    setEditedText(lastPart?.raw || storyText);
                  }}
                  className="px-3 py-2.5 sm:px-2 sm:py-1.5 text-sm font-medium text-blue-200/70 hover:text-white hover:bg-white/10 active:bg-white/15 rounded-lg transition-colors flex items-center gap-1.5 touch-manipulation"
                  title="Edit response"
                >
                  <DynamicIcon
                    name="Pencil"
                    className="w-5 h-5 sm:w-4 sm:h-4"
                  />
                  <span className="hidden sm:inline">Edit</span>
                </button>
              )}
            </div>

            {/* Right side: TTS - manual press waits for narration to finish;
                auto-narrate (if enabled) starts reading live as the GM
                streams instead of waiting - see storyTextReady prop. While
                streaming, prefer liveNarrationText (grows as the GM writes,
                even on the common path where storyText itself only jumps to
                the full text once at the very end) over storyText - falls
                back to storyText when there's nothing live yet (e.g. the
                separate story-stage path, which already streams storyText
                incrementally on its own). */}
            <TTSControls
              text={
                !storyTextReady && liveNarrationText
                  ? liveNarrationText
                  : storyText
              }
              disabled={loading || !storyTextReady}
              storyTextReady={storyTextReady}
            />
          </div>
        )}

        {/* Composer: suggested choices, player switcher, and chat input */}
        {!editMode && (
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
      {onCustomInput && (
        <PlayerBubbles
          players={couchPlayers.length > 0 ? couchPlayers : SOLO_VOICE_PLAYER}
          onSubmit={(text, speakerIds) =>
            onCustomInput(text, undefined, speakerIds, "voice")
          }
          disabled={loading || !!loadingStage}
          myPlayerId={myPlayerId}
          remoteActivity={remoteActivity}
          onLocalActivity={onLocalActivity}
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

// Parse hidden text: ||hidden text|| becomes either hidden or visible based on setting
const parseHiddenText = (text: string, showHidden: boolean): string => {
  if (showHidden) {
    // Show hidden text with special styling marker
    // Use markers that won't be affected by markdown processing
    return text.replace(/\|\|([\s\S]*?)\|\|/g, "⟦HIDDEN_START⟧$1⟦HIDDEN_END⟧");
  } else {
    // Remove hidden text entirely (use non-greedy match to handle nested ||)
    return text.replace(/\|\|[\s\S]*?\|\|/g, "");
  }
};

const prettify = (
  text: string,
  animate: boolean = true,
  showHiddenMessages: boolean = false,
  fontSettings?: FontSettings,
  mentionMatcher?: MentionMatcher | null,
  onMentionClick?: (kind: "lore" | "npc", id: string) => void,
) => {
  // Process tags and hidden text before rendering - defensive against a
  // stray tag even though content is expected to already be clean by the
  // time it reaches here (see turnTimeline.ts:extractVisibleText).
  const cleanedText = extractVisibleText(text);
  const processedText = parseHiddenText(cleanedText, showHiddenMessages);

  const customStyle = fontSettings
    ? {
        fontSize: `${fontSettings.fontSize}px`,
        fontFamily: fontSettings.fontFamily,
        lineHeight: fontSettings.lineHeight,
        color: fontSettings.themeColors?.text,
      }
    : undefined;

  const paragraphStyle = fontSettings
    ? {
        marginBottom: `${fontSettings.paragraphSpacing}em`,
      }
    : undefined;

  return (
    <div
      className={`prose prose-sm max-w-none ${
        animate ? "animate-fade-in" : ""
      }`}
      style={customStyle}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ node, children, ...props }) => {
            // Track hidden state across all children
            let inHidden = false;

            // Process children to handle hidden text markers
            const processChildren = (
              child: React.ReactNode,
              key: number | string,
            ): React.ReactNode => {
              if (typeof child === "string") {
                const parts = child.split(/(⟦HIDDEN_START⟧|⟦HIDDEN_END⟧)/);
                return parts.map((part, i) => {
                  if (part === "⟦HIDDEN_START⟧") {
                    inHidden = true;
                    return null;
                  }
                  if (part === "⟦HIDDEN_END⟧") {
                    inHidden = false;
                    return null;
                  }
                  if (part === "") return null;
                  if (inHidden) {
                    return (
                      <span
                        key={`${key}-${i}`}
                        className="bg-purple-500/30 text-purple-200 px-1 rounded border border-purple-500/50"
                        title="Hidden message (only visible with setting enabled)"
                      >
                        {part}
                      </span>
                    );
                  }
                  return part;
                });
              }
              // Handle React elements (like <em>, <strong>) that might be inside hidden text
              if (React.isValidElement(child)) {
                if (inHidden) {
                  // Wrap the entire element in hidden styling
                  return (
                    <span
                      key={key}
                      className="bg-purple-500/30 text-purple-200 px-1 rounded border border-purple-500/50"
                      title="Hidden message (only visible with setting enabled)"
                    >
                      {child}
                    </span>
                  );
                }
                return child;
              }
              return child;
            };

            const processedChildren: React.ReactNode[] = [];
            React.Children.forEach(children, (child, index) => {
              const result = processChildren(child, index);
              if (Array.isArray(result)) {
                processedChildren.push(...result);
              } else if (result !== null) {
                processedChildren.push(result);
              }
            });

            // Second pass: highlight lore-title/NPC-name mentions within the
            // plain-text segments (leaves hidden-text spans and other
            // elements from the pass above untouched).
            const withMentions: React.ReactNode[] = mentionMatcher
              ? processedChildren.flatMap((node, idx): React.ReactNode[] => {
                  if (typeof node !== "string" || !node) return [node];
                  const segments = splitTextWithMentions(node, mentionMatcher);
                  if (segments.length === 1 && !segments[0].mention) {
                    return [node];
                  }
                  return segments.map((seg, i) =>
                    seg.mention ? (
                      <span
                        key={`mention-${idx}-${i}`}
                        role="button"
                        tabIndex={0}
                        onClick={() =>
                          onMentionClick?.(seg.mention!.kind, seg.mention!.id)
                        }
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            onMentionClick?.(seg.mention!.kind, seg.mention!.id);
                          }
                        }}
                        className={`${seg.mention.colorClass} underline decoration-dotted decoration-1 underline-offset-2 cursor-pointer hover:brightness-125 transition-[filter]`}
                        title={`Open note: ${seg.mention.label}`}
                      >
                        {seg.text}
                      </span>
                    ) : (
                      seg.text
                    ),
                  );
                })
              : processedChildren;

            return (
              <p
                className="leading-relaxed last:mb-0"
                style={paragraphStyle}
                {...props}
              >
                {withMentions}
              </p>
            );
          },
          h1: ({ node, ...props }) => (
            <h1 className="text-xl font-bold mb-2 mt-3 first:mt-0" {...props} />
          ),
          h2: ({ node, ...props }) => (
            <h2 className="text-lg font-bold mb-2 mt-3 first:mt-0" {...props} />
          ),
          h3: ({ node, ...props }) => (
            <h3
              className="text-base font-bold mb-1.5 mt-2 first:mt-0"
              {...props}
            />
          ),
          strong: ({ node, ...props }) => (
            <strong className="font-bold" {...props} />
          ),
          em: ({ node, ...props }) => (
            <em className="italic opacity-90" {...props} />
          ),
          ul: ({ node, ...props }) => (
            <ul
              className="list-disc ml-4 mb-2 space-y-0.5 last:mb-0"
              {...props}
            />
          ),
          ol: ({ node, ...props }) => (
            <ol
              className="list-decimal ml-4 mb-2 space-y-0.5 last:mb-0"
              {...props}
            />
          ),
          li: ({ node, ...props }) => (
            <li className="leading-relaxed" {...props} />
          ),
          blockquote: ({ node, ...props }) => (
            <blockquote
              className="border-l-2 pl-3 italic opacity-70 my-2"
              style={{ borderColor: "currentColor" }}
              {...props}
            />
          ),
        }}
      >
        {processedText}
      </ReactMarkdown>
    </div>
  );
};
