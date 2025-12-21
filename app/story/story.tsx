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
import type { SyncStatus } from "../misc/localStoryManager";
import type { GMToolResult } from "../misc/gmExecutor";
import { stripThinkingTags } from "../misc/ai";
import { useAuth } from "../misc/AuthContext";
import { supabase } from "../misc/supabase";

interface StoryProps {
  storyData: StoryData;
  storyText: string;
  choices: Choices;
  input: Record<string, boolean>;
  loading: boolean;
  loadingStage?: "gm" | "story" | "choices" | null;
  momentumMode: "none" | "advantage" | "guarantee";
  onMomentumModeChange: (mode: "none" | "advantage" | "guarantee") => void;
  handleChoice: () => void;
  handleSelect: (index: number) => void;
  onCustomInput?: (text: string) => void;
  onActionSubmit?: (
    text: string
  ) => Promise<{ analysis: ActionAnalysis; warnings: string[] } | null>;
  onActionConfirm?: (choice: Choice) => void;
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
  onResetToCurrentPart?: () => void;
  syncStatus?: SyncStatus;
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
}: ChatMessageProps) {
  const opacity = isPrevious ? "opacity-50" : "opacity-100";
  
  // Player messages: flex-row-reverse (avatar on right)
  // GM messages: flex-row (avatar on left)
  const flexDirection = isUser ? "flex-row-reverse" : "flex-row";
  const textAlign = isUser ? "text-right" : "text-left";
  
  return (
    <div className={`flex gap-3 ${flexDirection} ${opacity} transition-opacity duration-300`}>
      {/* Avatar */}
      <div className="shrink-0">
        {isUser ? (
          avatarUrl ? (
            <img
              src={avatarUrl}
              alt={displayName}
              className="w-10 h-10 rounded-full object-cover border-2 border-blue-500/30"
            />
          ) : (
            <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center border-2 border-blue-500/30">
              <DynamicIcon name="User" className="w-5 h-5 text-white" />
            </div>
          )
        ) : (
          <div className="w-10 h-10 rounded-full bg-purple-600 flex items-center justify-center border-2 border-purple-500/30">
            <DynamicIcon name="Sparkles" className="w-5 h-5 text-white" />
          </div>
        )}
      </div>
      
      {/* Message Content */}
      <div className="flex-1 min-w-0">
        {/* Name */}
        <div className={`text-sm font-semibold mb-1 ${textAlign} ${isUser ? "text-blue-300" : "text-purple-300"}`}>
          {displayName}
        </div>
        
        {/* Content */}
        <div className={`rounded-lg p-3 ${isUser ? "bg-blue-900/30 border border-blue-700/30" : "bg-purple-900/20 border border-purple-700/20"}`}>
          {isLoading ? (
            <div className="flex items-center gap-2 text-purple-200/60">
              <div className="w-4 h-4 border-2 border-purple-400/60 border-t-purple-300 rounded-full animate-spin" />
              <span>Thinking...</span>
            </div>
          ) : isUser ? (
            <p className="text-blue-100 whitespace-pre-wrap">{content}</p>
          ) : (
            prettify(content, !isPrevious, showHiddenMessages, fontSettings)
          )}
        </div>
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
  onResetToCurrentPart,
  syncStatus,
  pendingUserChoice,
  liveGMEntries,
}: StoryProps) {
  const { user } = useAuth();
  const [showChoicesModal, setShowChoicesModal] = React.useState(false);
  const [editMode, setEditMode] = React.useState(false);
  const [editedText, setEditedText] = React.useState("");
  const [isHovering, setIsHovering] = React.useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [userProfile, setUserProfile] = useState<{ avatar_url?: string } | null>(null);

  // Fetch user profile for avatar fallback
  useEffect(() => {
    if (!user) return;
    
    const fetchProfile = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;
        
        const response = await fetch(`/api/profiles/${user.id}`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        
        if (response.ok) {
          const data = await response.json();
          setUserProfile(data);
        }
      } catch (error) {
        console.error("Error fetching profile:", error);
      }
    };
    
    fetchProfile();
  }, [user]);

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
          localStorage.getItem("showHiddenMessages") === "true"
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
          localStorage.getItem("storyLineHeight") || "1.6"
        ),
        paragraphSpacing: parseFloat(
          localStorage.getItem("storyParagraphSpacing") || "0.5"
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
  const playerDisplayName = storyData.displayName || storyData.player_name || user?.user_metadata?.display_name || "Player";
  const playerAvatarUrl = storyData.displayAvatar || userProfile?.avatar_url;

  // Build chat messages from scene parts - pairs of user input + GM response
  const chatMessages: Array<{
    isUser: boolean;
    content: string;
    partIndex: number;
  }> = [];

  storyData.scene.parts.forEach((part, index) => {
    if (part.content.trim()) {
      chatMessages.push({
        isUser: part.user,
        content: part.content,
        partIndex: index,
      });
    }
  });

  // Group messages into exchanges (user + following GM response)
  const exchanges: Array<{
    userMsg?: typeof chatMessages[0];
    gmMsg?: typeof chatMessages[0];
  }> = [];
  
  let currentExchange: typeof exchanges[0] = {};
  
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
  const currentScenePart = storyData.scene.parts[storyData.scene.parts.length - 1] || null;
  const gmThinking = currentScenePart?.gmThinking || [];
  const gmToolCalls = currentScenePart?.gmToolCalls || [];
  const gmStoryContext = currentScenePart?.gmStoryContext || "";

  // Check if we have any GM content to show
  const hasGMContent =
    gmThinking.length > 0 || gmToolCalls.length > 0 || gmStoryContext;

  // Check if user wants to display GM thinking (from settings)
  // Use useState + useEffect to properly handle SSR and localStorage updates
  const [displayGMThinkingEnabled, setDisplayGMThinkingEnabled] =
    React.useState(false);

  React.useEffect(() => {
    // Read initial value from localStorage
    const stored = localStorage.getItem("displayGMThinking") === "true";
    setDisplayGMThinkingEnabled(stored);

    // Listen for storage changes (from other tabs or same-tab updates)
    const handleStorage = (e: StorageEvent) => {
      if (e.key === "displayGMThinking") {
        setDisplayGMThinkingEnabled(e.newValue === "true");
      }
    };

    // Also listen for custom event for same-tab updates
    const handleCustomEvent = () => {
      setDisplayGMThinkingEnabled(
        localStorage.getItem("displayGMThinking") === "true"
      );
    };

    window.addEventListener("storage", handleStorage);
    window.addEventListener("displayGMThinkingChanged", handleCustomEvent);

    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("displayGMThinkingChanged", handleCustomEvent);
    };
  }, []);

  // State for GM thinking collapsible
  const [showGMThinking, setShowGMThinking] = React.useState(false);

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
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
    }
  }, [chatMessages.length, loading, storyText, pendingUserChoice]);

  return (
    <div className="w-full max-w-3xl mx-auto">
      {/* Main Story Card */}
      <div
        className="rounded-xl border border-gray-500/30 overflow-hidden relative flex flex-col"
        style={{ 
          backgroundColor: fontSettings.themeColors?.background,
          maxHeight: "calc(100vh - 180px)",
        }}
      >
        {/* Sync Status Indicator - top right corner */}
        {syncStatus && syncStatus !== "local-only" && (
          <div className="absolute top-3 right-3 z-10">
            <SyncIndicator status={syncStatus} />
          </div>
        )}

        {/* Header with story name and scroll indicator */}
        <div className="flex items-center justify-between px-4 py-2 bg-blue-900/30 border-b border-blue-800/30">
          <div className="flex items-center gap-2">
            <DynamicIcon name="BookOpen" className="w-4 h-4 text-blue-300" />
            <span className="text-sm font-medium text-blue-200 truncate max-w-[200px]">
              {storyData.story_name || "Untitled Story"}
            </span>
          </div>
          {exchanges.length > visibleExchangeCount && (
            <span className="text-xs text-blue-400/60">
              ↑ Scroll for history ({exchanges.length} turns)
            </span>
          )}
        </div>

        {/* GM Thinking Collapsible (shows reasoning, tool calls, and results) */}
        {/* Show when: has saved content OR currently streaming GM stage */}
        {displayGMThinkingEnabled &&
          (hasGMContent ||
            (loadingStage === "gm" &&
              liveGMEntries &&
              liveGMEntries.length > 0)) && (
            <div className="border-b border-purple-800/30">
              <button
                onClick={() => setShowGMThinking(!showGMThinking)}
                className="w-full flex items-center justify-between px-4 py-2 bg-purple-900/20 hover:bg-purple-900/30 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <DynamicIcon
                    name="Dice5"
                    className="w-4 h-4 text-purple-400"
                  />
                  <span className="text-sm font-medium text-purple-300">
                    GM Reasoning
                  </span>
                  {loadingStage === "gm" ? (
                    <span className="text-xs text-purple-400/60 flex items-center gap-1">
                      <span className="animate-pulse">●</span> Streaming...
                    </span>
                  ) : (
                    <span className="text-xs text-purple-400/60">
                      ({gmThinking.length}{" "}
                      {gmThinking.length === 1 ? "thought" : "thoughts"}
                      {gmToolCalls.length > 0 &&
                        `, ${gmToolCalls.length} ${
                          gmToolCalls.length === 1 ? "tool" : "tools"
                        }`}
                      )
                    </span>
                  )}
                </div>
                <DynamicIcon
                  name={
                    showGMThinking || loadingStage === "gm"
                      ? "ChevronUp"
                      : "ChevronDown"
                  }
                  className="w-4 h-4 text-purple-400"
                />
              </button>
              {/* Auto-expand during streaming, otherwise respect user toggle */}
              {(showGMThinking || loadingStage === "gm") && (
                <div className="px-4 py-3 bg-purple-950/30 space-y-3 max-h-60 overflow-y-auto">
                  {/* Live streaming content - interleaved thinking and tool results */}
                  {loadingStage === "gm" && liveGMEntries ? (
                    <div className="space-y-3">
                      {liveGMEntries.map((entry, idx) =>
                        entry.type === "thinking" ? (
                          <div
                            key={`thinking-${idx}`}
                            className="text-sm text-purple-200/80 whitespace-pre-wrap"
                          >
                            <span className="text-purple-400/60 font-medium">
                              [GM]{" "}
                            </span>
                            {entry.content}
                            {entry.isStreaming && (
                              <span className="animate-pulse text-purple-400">
                                ▌
                              </span>
                            )}
                          </div>
                        ) : (
                          <div
                            key={`tool-${idx}`}
                            className="text-sm bg-purple-900/30 rounded px-3 py-2 animate-fadeIn"
                          >
                            <div className="flex items-center gap-2">
                              <span
                                className={`font-medium ${
                                  entry.result.success
                                    ? "text-green-400"
                                    : "text-red-400"
                                }`}
                              >
                                {entry.result.success ? "✓" : "✗"}
                              </span>
                              <span className="text-purple-300 font-medium">
                                {entry.result.toolName?.replace(/_/g, " ")}
                              </span>
                            </div>
                            {entry.result.contextForStory && (
                              <div className="text-purple-200/70 text-xs mt-1 font-mono">
                                {entry.result.contextForStory}
                              </div>
                            )}
                          </div>
                        )
                      )}
                    </div>
                  ) : (
                    <>
                      {/* Saved GM Thinking Text */}
                      {gmThinking.length > 0 && (
                        <div className="space-y-2">
                          {gmThinking.map((thought, idx) => (
                            <div
                              key={idx}
                              className="text-sm text-purple-200/80 whitespace-pre-wrap"
                            >
                              <span className="text-purple-400/60 font-medium">
                                [GM]{" "}
                              </span>
                              {thought}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Saved Tool Calls and Results */}
                      {gmToolCalls.length > 0 && (
                        <div className="border-t border-purple-800/30 pt-3 space-y-2">
                          <div className="text-xs font-medium text-purple-400/80 uppercase tracking-wide">
                            Dice Rolls & Tools
                          </div>
                          {gmToolCalls.map((call: any, idx: number) => (
                            <div
                              key={idx}
                              className="text-sm bg-purple-900/30 rounded px-3 py-2"
                            >
                              <div className="flex items-center gap-2">
                                <span
                                  className={`font-medium ${
                                    call.success
                                      ? "text-green-400"
                                      : "text-red-400"
                                  }`}
                                >
                                  {call.success ? "✓" : "✗"}
                                </span>
                                <span className="text-purple-300 font-medium">
                                  {call.toolName?.replace(/_/g, " ")}
                                </span>
                              </div>
                              {call.contextForStory && (
                                <div className="text-purple-200/70 text-xs mt-1 font-mono">
                                  {call.contextForStory}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* GM Summary Context */}
                      {gmStoryContext && !gmToolCalls.length && (
                        <div className="border-t border-purple-800/30 pt-3">
                          <div className="text-xs font-medium text-purple-400/80 uppercase tracking-wide mb-2">
                            GM Summary
                          </div>
                          <div className="text-sm text-purple-200/70 font-mono whitespace-pre-wrap">
                            {gmStoryContext}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          )}

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
          className="flex-1 overflow-y-auto p-4 space-y-4 min-h-[300px]"
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
                  />
                )}
              </React.Fragment>
            );
          })}

          {/* Pending user choice (shown immediately when submitted) */}
          {pendingUserChoice && loading && !chatMessages.some(m => m.isUser && m.content === pendingUserChoice) && (
            <ChatMessage
              isUser={true}
              content={pendingUserChoice}
              displayName={playerDisplayName}
              avatarUrl={playerAvatarUrl}
              isPrevious={false}
              showHiddenMessages={showHiddenMessages}
              fontSettings={fontSettings}
            />
          )}

          {/* Loading indicator for GM response */}
          {loading && loadingStage !== "story" && (
            <ChatMessage
              isUser={false}
              content=""
              displayName="Game Master"
              isLoading={true}
              showHiddenMessages={showHiddenMessages}
              fontSettings={fontSettings}
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
                <span className="text-xs text-blue-200/40">{editedText.length} characters</span>
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
                    const lastPart = storyData.scene.parts[storyData.scene.parts.length - 1];
                    setEditedText(lastPart?.raw || storyText);
                  }}
                  className="px-3 py-2.5 sm:px-2 sm:py-1.5 text-sm font-medium text-blue-200/70 hover:text-white hover:bg-blue-800/50 active:bg-blue-700/50 rounded-lg transition-colors flex items-center gap-1.5 touch-manipulation"
                  title="Edit response"
                >
                  <DynamicIcon name="Pencil" className="w-5 h-5 sm:w-4 sm:h-4" />
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
  fontSettings?: FontSettings
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
              key: number | string
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
