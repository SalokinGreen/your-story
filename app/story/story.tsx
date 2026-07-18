"use client";
import { Choice, Choices, StoryData, ActionAnalysis } from "../misc/structs";
import React, { useState, useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import TTSControls from "../components/TTSControls";
import ChoicesModal from "../components/ChoicesModal";
import { DynamicIcon } from "../components/DynamicIcon";
import SyncIndicator from "../components/SyncIndicator";
import STTButton from "../components/STTButton";
import CombatDisplay from "../components/CombatDisplay";
import { GMProgressPanel } from "../components/GMProgressPanel";
import { ChapterNav } from "../components/ChapterNav";
import { ObjectivesStrip } from "../components/ObjectivesStrip";
import type { SyncStatus } from "../misc/localStoryManager";
import type { GMToolResult } from "../misc/gmExecutor";
import { stripThinkingTags } from "../misc/ai";

interface StoryProps {
  storyData: StoryData;
  storyText: string;
  choices: Choices;
  input: Record<string, boolean>;
  loading: boolean;
  loadingStage?: "gm" | "story" | "choices" | null;
  momentumMode: "none" | "advantage" | "guarantee";
  onMomentumModeChange: (mode: "none" | "advantage" | "guarantee") => void;
  handleChoice: (playerComment?: string) => void;
  handleSelect: (index: number) => void;
  onCustomInput?: (text: string, playerComment?: string) => void;
  onActionSubmit?: (
    text: string,
  ) => Promise<{ analysis: ActionAnalysis; warnings: string[] } | null>;
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
  // The last user choice that was submitted (shown while GM is thinking)
  pendingUserChoice?: string;
  // Interleaved GM streaming entries (thinking text and tool results in order)
  liveGMEntries?: Array<
    | { type: "thinking"; content: string; isStreaming?: boolean }
    | { type: "tool"; result: GMToolResult }
  >;
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
  // Thinking data for Gemini-style display - interleaved entries
  gmConversation?: Array<{
    role: "assistant" | "tool";
    content: string;
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
  // Live streaming entries
  liveThinkingEntries?: Array<{
    type: "thinking" | "tool";
    content?: string;
    result?: any;
    isStreaming?: boolean;
  }>;
  isStreaming?: boolean;
  showThinking?: boolean;
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
  liveThinkingEntries,
  isStreaming = false,
  showThinking: showThinkingProp = false,
}: ChatMessageProps) {
  const [expanded, setExpanded] = React.useState(false);
  const opacity = isPrevious ? "opacity-50" : "opacity-100";
  const isComment = messageType === "comment";

  // Always stack vertically: avatar + name row at top, content below
  const rowAlign = isUser ? "justify-end" : "justify-start";

  // Determine if we should show thinking section
  const hasThinking =
    (gmConversation && gmConversation.length > 0) ||
    (liveThinkingEntries && liveThinkingEntries.length > 0);
  const shouldShowThinking = showThinkingProp && hasThinking;

  // Default is collapsed; user can expand/collapse even while streaming
  const isExpanded = expanded;

  return (
    <div
      className={`flex flex-col gap-1 ${opacity} transition-opacity duration-300`}
    >
      {/* Avatar + Name + Thinking toggle row */}
      <div className={`flex items-center gap-2 ${rowAlign}`}>
        {isUser ? (
          avatarUrl ? (
            <img
              src={avatarUrl}
              alt={displayName}
              className="w-6 h-6 rounded-full object-cover border-2 border-blue-500/30"
            />
          ) : (
            <div className="w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center border-2 border-blue-500/30">
              <DynamicIcon name="User" className="w-3 h-3 text-white" />
            </div>
          )
        ) : (
          <div className="w-6 h-6 rounded-full bg-purple-600 flex items-center justify-center border-2 border-purple-500/30">
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
        {isUser && isComment && (
          <span className="text-[10px] text-blue-300/50">comment</span>
        )}
        {/* Thinking toggle - inline with name for GM messages */}
        {!isUser && shouldShowThinking && (
          <button
            onClick={() => setExpanded((prev) => !prev)}
            className="flex items-center gap-1 text-blue-400 hover:text-blue-300 transition-colors ml-1"
          >
            <span className="text-xs">
              {isExpanded
                ? "Hide thinking"
                : isStreaming
                  ? "Thinking..."
                  : "Show thinking"}
            </span>
            <DynamicIcon
              name={isExpanded ? "ChevronUp" : "ChevronDown"}
              className="w-3 h-3"
            />
          </button>
        )}
      </div>

      {/* Message Content */}
      <div className="w-full">
        {!isUser && shouldShowThinking && isExpanded && (
          <div className="mb-3 pl-3 border-l-2 border-blue-500/30 space-y-2 text-sm text-gray-400 italic">
            {/* Live streaming entries */}
            {liveThinkingEntries && liveThinkingEntries.length > 0
              ? liveThinkingEntries.map((entry, idx) =>
                  entry.type === "thinking" ? (
                    <p
                      key={`live-think-${idx}`}
                      className="whitespace-pre-wrap"
                    >
                      {entry.content}
                      {entry.isStreaming && (
                        <span className="animate-pulse text-blue-400">▌</span>
                      )}
                    </p>
                  ) : entry.result ? (
                    <div
                      key={`live-tool-${idx}`}
                      className="not-italic text-xs bg-gray-800/50 rounded px-2 py-1.5 flex items-start gap-2"
                    >
                      <span
                        className={`shrink-0 ${
                          entry.result.success
                            ? "text-green-400"
                            : "text-red-400"
                        }`}
                      >
                        {entry.result.success ? "✓" : "✗"}
                      </span>
                      <div>
                        <span className="text-gray-300 font-medium">
                          {entry.result.toolName?.replace(/_/g, " ")}
                        </span>
                        {entry.result.contextForStory && (
                          <p className="text-gray-500 mt-0.5">
                            {entry.result.contextForStory}
                          </p>
                        )}
                      </div>
                    </div>
                  ) : null,
                )
              : gmConversation && gmConversation.length > 0
                ? /* Saved GM conversation - interleaved thinking and tool results */
                  gmConversation.map((msg, idx) => {
                    if (msg.role === "assistant") {
                      return (
                        <React.Fragment key={`gm-${idx}`}>
                          {/* Thinking text */}
                          {msg.content && (
                            <p className="whitespace-pre-wrap">{msg.content}</p>
                          )}
                          {/* Tool calls made by this message */}
                          {msg.tool_calls &&
                            msg.tool_calls.map((tc, tcIdx) => {
                              const result = toolResults?.get(tc.id);
                              return (
                                <div
                                  key={`tc-${idx}-${tcIdx}`}
                                  className="not-italic text-xs bg-gray-800/50 rounded px-2 py-1.5 flex items-start gap-2"
                                >
                                  <span
                                    className={`shrink-0 ${
                                      result?.success
                                        ? "text-green-400"
                                        : result?.success === false
                                          ? "text-red-400"
                                          : "text-gray-500"
                                    }`}
                                  >
                                    {result?.success
                                      ? "✓"
                                      : result?.success === false
                                        ? "✗"
                                        : "•"}
                                  </span>
                                  <div>
                                    <span className="text-gray-300 font-medium">
                                      {(
                                        result?.toolName || tc.function.name
                                      )?.replace(/_/g, " ")}
                                    </span>
                                    {result?.contextForStory && (
                                      <p className="text-gray-500 mt-0.5">
                                        {result.contextForStory}
                                      </p>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                        </React.Fragment>
                      );
                    }
                    // Skip tool role messages - results are shown inline with their tool_calls above
                    return null;
                  })
                : null}
          </div>
        )}

        {/* Content - hide the empty box when only streaming thinking */}
        {(content || isLoading || !isStreaming) && (
          <div
            className={`rounded-lg p-2 sm:p-3 ${
              isUser
                ? isComment
                  ? "bg-blue-900/15 border border-blue-700/20"
                  : "bg-blue-900/30 border border-blue-700/30"
                : "bg-purple-900/20 border border-purple-700/20"
            }`}
          >
            {isLoading ? (
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
              prettify(content, !isPrevious, showHiddenMessages, fontSettings)
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function Story({
  storyData,
  storyText,
  choices,
  input,
  loading,
  loadingStage,
  momentumMode,
  onMomentumModeChange,
  handleChoice,
  handleSelect,
  onCustomInput,
  onActionSubmit,
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
  pendingUserChoice,
  liveGMEntries,
}: StoryProps) {
  const [showChoicesModal, setShowChoicesModal] = React.useState(false);
  const [editMode, setEditMode] = React.useState(false);
  const [editedText, setEditedText] = React.useState("");
  const [isHovering, setIsHovering] = React.useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

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

  // Action mode state - persisted to localStorage
  const [actionMode, setActionMode] = React.useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("actionMode") === "true";
  });

  // Persist action mode to localStorage
  React.useEffect(() => {
    localStorage.setItem("actionMode", actionMode.toString());
  }, [actionMode]);

  // STT state
  const [sttEnabled, setSttEnabled] = React.useState(false);

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

  // Load STT settings from localStorage
  React.useEffect(() => {
    if (typeof window !== "undefined") {
      setSttEnabled(localStorage.getItem("sttEnabled") !== "false");
    }
    // Listen for changes
    const handleStorageChange = () => {
      setSttEnabled(localStorage.getItem("sttEnabled") !== "false");
    };
    window.addEventListener("storage", handleStorageChange);
    const interval = setInterval(handleStorageChange, 500);
    return () => {
      window.removeEventListener("storage", handleStorageChange);
      clearInterval(interval);
    };
  }, []);

  // Handle STT transcript - analyze action then submit as freeform action
  const handleSTTTranscript = async (text: string) => {
    if (!text.trim()) return;

    // Analyze the action first (like ChoicesModal does)
    if (onActionSubmit && onActionConfirm) {
      try {
        const result = await onActionSubmit(text.trim());
        if (result) {
          // Submit with analyzed mechanics (skill checks, tables, etc.)
          const choice: Choice = {
            text: text.trim(),
            skill_used: result.analysis.skill_used || undefined,
            skill_dc: result.analysis.skill_dc || undefined,
            item_used: result.analysis.item_used || undefined,
            ability_used: result.analysis.ability_used || undefined,
            resource_used: result.analysis.resource_used || undefined,
            agmt_check: result.analysis.agmt_check || undefined,
            table: result.analysis.table || undefined,
            stt_input: true,
          };
          onActionConfirm(choice);
        } else {
          // Analysis failed, submit as plain action
          onActionConfirm({
            text: text.trim(),
            stt_input: true,
          });
        }
      } catch (error) {
        console.error("STT action analysis failed:", error);
        // Fallback to plain action
        onActionConfirm({
          text: text.trim(),
          stt_input: true,
        });
      }
    } else if (onActionConfirm) {
      // No analysis available, submit plain
      onActionConfirm({
        text: text.trim(),
        stt_input: true,
      });
    }
  };

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

      // Enter/Space to open choices modal (when not loading and modal closed)
      if (
        (e.key === "Enter" || e.key === " ") &&
        !loading &&
        !loadingStage &&
        !showChoicesModal &&
        !editMode
      ) {
        e.preventDefault();
        setShowChoicesModal(true);
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

  storyData.scene.parts.forEach((part, index) => {
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

  // Get current scene part for GM thinking display
  const currentScenePart =
    storyData.scene.parts[storyData.scene.parts.length - 1] || null;
  const gmConversation = currentScenePart?.gmConversation || [];
  const gmToolCalls = currentScenePart?.gmToolCalls || [];

  // Helper to get GM conversation and tool results for a scene part
  const getGMDataForPart = (partIndex: number) => {
    const part = storyData.scene.parts[partIndex];
    if (!part) return { gmConversation: [], toolResults: new Map() };

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
    };
  };

  // Build toolResults map for current scene part
  const currentToolResults = React.useMemo(() => {
    const results = new Map<
      string,
      { success: boolean; contextForStory: string; toolName: string }
    >();
    if (gmToolCalls) {
      for (const tc of gmToolCalls) {
        if (tc.toolCallId) {
          results.set(tc.toolCallId, {
            success: tc.success,
            contextForStory: tc.contextForStory || "",
            toolName: tc.toolName || "",
          });
        }
      }
    }
    return results;
  }, [gmToolCalls]);

  // GM thinking display is always enabled
  const displayGMThinkingEnabled = true;

  // State for combat display expansion
  const [showCombat, setShowCombat] = React.useState(true);

  // Handle choice selection from modal
  const handleSelectChoice = (choice: Choice) => {
    const index = choices.choices.findIndex((c) => c.text === choice.text);
    if (index !== -1) {
      handleSelect(index);
    }
  };

  // Auto-scroll to bottom when new messages arrive or during streaming
  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop =
        scrollContainerRef.current.scrollHeight;
    }
  }, [chatMessages.length, loading, storyText, pendingUserChoice]);

  return (
    <div className="w-full px-0 sm:px-1 sm:max-w-3xl mx-auto">
      {/* Main Story Card */}
      <div
        className="rounded-none sm:rounded-xl border-0 sm:border sm:border-gray-500/30 overflow-hidden relative flex flex-col max-h-[calc(100vh-100px)] sm:max-h-[calc(100vh-180px)]"
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

        {/* Header with story name, chapter nav, and scroll indicator */}
        <div className="flex items-center justify-between px-3 py-1 sm:px-4 sm:py-2 bg-blue-900/30 border-b border-blue-800/30">
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
          className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-3 sm:space-y-4 min-h-[200px] sm:min-h-[300px]"
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
                  showThinking={displayGMThinkingEnabled}
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
                    showThinking={displayGMThinkingEnabled}
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

          {/* Always-visible step-by-step progress, independent of the "Show Thinking" toggle */}
          {loadingStage === "gm" && liveGMEntries && liveGMEntries.length > 0 && (
            <GMProgressPanel entries={liveGMEntries} active={true} />
          )}

          {/* Loading indicator for GM response - shows live thinking during GM stage */}
          {loading && loadingStage !== "story" && (
            <ChatMessage
              isUser={false}
              content=""
              displayName="Game Master"
              isLoading={loadingStage !== "gm"}
              showHiddenMessages={showHiddenMessages}
              fontSettings={fontSettings}
              liveThinkingEntries={
                loadingStage === "gm" ? liveGMEntries : undefined
              }
              isStreaming={loadingStage === "gm"}
              showThinking={displayGMThinkingEnabled}
            />
          )}

          {/* Streaming story text (during story stage) */}
          {loadingStage === "story" && storyText && (
            <ChatMessage
              isUser={false}
              content={storyText}
              displayName="Game Master"
              isPrevious={false}
              showHiddenMessages={showHiddenMessages}
              fontSettings={fontSettings}
              gmConversation={gmConversation}
              toolResults={currentToolResults}
              showThinking={displayGMThinkingEnabled}
            />
          )}
        </div>

        {/* Edit Mode */}
        {editMode && (
          <div className="p-4 bg-blue-900/20 border-t border-blue-800/30">
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
                className="w-full h-48 px-3 py-2 bg-blue-900/50 border border-blue-800/30 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm resize-none"
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
                    className="px-3 py-1.5 text-sm font-medium text-blue-200 bg-blue-900/50 hover:bg-blue-800/50 rounded-lg transition-colors"
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
                    className="px-3 py-1.5 text-sm font-medium bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800/50 disabled:text-blue-400 text-white rounded-lg transition-colors flex items-center gap-1.5"
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
          <div className="flex items-center justify-between px-4 py-2 bg-blue-900/30 border-t border-blue-800/30">
            {/* Left side: Retry, Undo & Edit */}
            <div className="flex items-center gap-1.5 sm:gap-1">
              {canUndo && onUndo && (
                <button
                  onClick={onUndo}
                  disabled={loading || !!loadingStage}
                  className="px-3 py-2.5 sm:px-2 sm:py-1.5 text-sm font-medium text-blue-200/70 hover:text-white hover:bg-blue-800/50 active:bg-blue-700/50 rounded-lg transition-colors flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed touch-manipulation"
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
                  className="px-3 py-2.5 sm:px-2 sm:py-1.5 text-sm font-medium text-amber-400 hover:bg-amber-900/30 active:bg-amber-800/40 rounded-lg transition-colors flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed touch-manipulation"
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
                  className="px-3 py-2.5 sm:px-2 sm:py-1.5 text-sm font-medium text-blue-200/70 hover:text-white hover:bg-blue-800/50 active:bg-blue-700/50 rounded-lg transition-colors flex items-center gap-1.5 touch-manipulation"
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

            {/* Right side: TTS - available as soon as story text is ready */}
            <TTSControls
              text={storyText}
              disabled={loading || loadingStage === "story"}
            />
          </div>
        )}

        {/* Continue Button with STT */}
        {!editMode && (
          <div className="p-3">
            <div className="flex gap-2 items-stretch">
              {/* STT Button - shown when STT is enabled */}
              {sttEnabled && (
                <STTButton
                  onTranscript={handleSTTTranscript}
                  disabled={loading || !!loadingStage}
                  className="shrink-0"
                />
              )}

              {/* Continue/Cancel Button */}
              {loading || loadingStage ? (
                <button
                  onClick={onStop}
                  className="flex-1 py-3.5 sm:py-2.5 text-base font-medium rounded-lg bg-blue-500/10 hover:bg-blue-500/20 border border-blue-400/30 text-blue-300 transition-all duration-150 flex items-center justify-center gap-2 touch-manipulation cursor-pointer"
                  title="Cancel generation"
                >
                  <div className="w-4 h-4 border-2 border-blue-400/60 border-t-blue-300 rounded-full animate-spin" />
                  {loadingStage === "gm"
                    ? "Thinking..."
                    : loadingStage === "choices"
                      ? "Preparing choices..."
                      : "Generating..."}
                  <span className="text-blue-400/80 text-sm ml-1">Cancel</span>
                </button>
              ) : (
                <button
                  onClick={() => setShowChoicesModal(true)}
                  className="flex-1 py-3.5 sm:py-2.5 text-base font-semibold rounded-lg transition-all duration-150 flex items-center justify-center gap-2 touch-manipulation bg-blue-600 hover:bg-blue-500 text-white"
                >
                  <DynamicIcon name="Compass" className="w-4 h-4" />
                  Continue
                </button>
              )}
            </div>
          </div>
        )}
      </div>

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
        onActionSubmit={onActionSubmit}
        onActionConfirm={onActionConfirm}
        onCommentSubmit={onCommentSubmit}
        onRerollChoices={onRerollChoices}
        loading={loading}
        momentumMode={momentumMode}
        onMomentumModeChange={onMomentumModeChange}
        actionMode={actionMode}
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
) => {
  // Process tags and hidden text before rendering
  const cleanedText = stripThinkingTags(text);
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

            return (
              <p
                className="leading-relaxed last:mb-0"
                style={paragraphStyle}
                {...props}
              >
                {processedChildren}
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
