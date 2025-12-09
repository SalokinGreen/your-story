"use client";
import { Choice, Choices, StoryData, ActionAnalysis } from "../misc/structs";
import React, { useState, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import TTSControls from "../components/TTSControls";
import ChoicesModal from "../components/ChoicesModal";
import { DynamicIcon } from "../components/DynamicIcon";
import SyncIndicator from "../components/SyncIndicator";
import STTButton from "../components/STTButton";
import type { SyncStatus } from "../misc/localStoryManager";

interface StoryProps {
  storyData: StoryData;
  storyText: string;
  choices: Choices;
  input: Record<string, boolean>;
  loading: boolean;
  loadingStage?: "story" | "tools" | "choices" | null;
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
}: StoryProps) {
  const [showChoicesModal, setShowChoicesModal] = React.useState(false);
  const [editMode, setEditMode] = React.useState(false);
  const [editedText, setEditedText] = React.useState("");
  const [isHovering, setIsHovering] = React.useState(false);

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

  // Filter to only AI story parts with content and deduplicate
  const storyParts = storyData.scene.parts.filter(
    (part) => !part.user && part.content.trim().length > 0
  );
  const uniqueStoryParts = storyParts.filter((part, index, arr) => {
    if (index === 0) return true;
    return part.content !== arr[index - 1].content;
  });

  const currentStoryIndex =
    viewingPartIndex !== null && viewingPartIndex !== undefined
      ? uniqueStoryParts.findIndex(
          (part) => storyData.scene.parts.indexOf(part) === viewingPartIndex
        )
      : uniqueStoryParts.length - 1;

  const isViewingPast =
    viewingPartIndex !== null && viewingPartIndex !== undefined;

  // Handle choice selection from modal
  const handleSelectChoice = (choice: Choice) => {
    const index = choices.choices.findIndex((c) => c.text === choice.text);
    if (index !== -1) {
      handleSelect(index);
    }
  };

  return (
    <div className="w-full max-w-3xl mx-auto">
      {/* Main Story Card */}
      <div
        className="rounded-xl border border-gray-500/30 overflow-hidden relative"
        style={{ backgroundColor: fontSettings.themeColors?.background }}
      >
        {/* Sync Status Indicator - top right corner */}
        {syncStatus && syncStatus !== "local-only" && (
          <div className="absolute top-3 right-3 z-10">
            <SyncIndicator status={syncStatus} />
          </div>
        )}

        {/* Story Navigation Header */}
        {uniqueStoryParts.length > 1 && (
          <div className="flex items-center justify-center gap-3 py-2 px-4 bg-blue-900/30 border-b border-blue-800/30">
            <button
              onClick={onNavigateLeft}
              disabled={currentStoryIndex <= 0}
              className="p-2.5 sm:p-1.5 text-blue-300 hover:text-white disabled:text-blue-500/30 disabled:cursor-not-allowed transition-colors rounded-lg hover:bg-blue-800/50 active:bg-blue-700/50 touch-manipulation"
              title="Previous"
            >
              <DynamicIcon
                name="ChevronLeft"
                className="w-5 h-5 sm:w-4 sm:h-4"
              />
            </button>

            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-blue-200/60">
                {currentStoryIndex + 1} / {uniqueStoryParts.length}
              </span>
              {isViewingPast && (
                <button
                  onClick={onResetToCurrentPart}
                  className="px-3 py-1.5 sm:px-2 sm:py-0.5 text-xs font-medium text-blue-400 hover:bg-blue-800/50 active:bg-blue-700/50 rounded transition-colors touch-manipulation"
                >
                  Jump to Latest
                </button>
              )}
            </div>

            <button
              onClick={onNavigateRight}
              disabled={
                !isViewingPast ||
                currentStoryIndex >= uniqueStoryParts.length - 1
              }
              className="p-2.5 sm:p-1.5 text-blue-300 hover:text-white disabled:text-blue-500/30 disabled:cursor-not-allowed transition-colors rounded-lg hover:bg-blue-800/50 active:bg-blue-700/50 touch-manipulation"
              title="Next"
            >
              <DynamicIcon
                name="ChevronRight"
                className="w-5 h-5 sm:w-4 sm:h-4"
              />
            </button>
          </div>
        )}

        {/* Story Content Area */}
        <div
          className="relative p-4 min-h-[200px]"
          onMouseEnter={() => setIsHovering(true)}
          onMouseLeave={() => setIsHovering(false)}
        >
          {editMode ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-semibold text-white flex items-center gap-2">
                  <DynamicIcon name="Pencil" className="w-4 h-4" />
                  Edit Response
                </h3>
                <span className="text-xs text-blue-200/40">
                  XML tags: &lt;story&gt;, &lt;choices&gt;, &lt;memory&gt;,
                  &lt;commands&gt;
                </span>
              </div>
              <textarea
                value={editedText}
                onChange={(e) => setEditedText(e.target.value)}
                className="w-full h-64 px-3 py-2 bg-blue-900/50 border border-blue-800/30 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm resize-none"
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
          ) : (
            <>
              {prettify(storyText, true, showHiddenMessages, fontSettings)}

              {/* Edit button overlay */}
              {isHovering && onEdit && !loading && !loadingStage && (
                <button
                  onClick={() => {
                    setEditMode(true);
                    const lastPart =
                      storyData.scene.parts[storyData.scene.parts.length - 1];
                    setEditedText(lastPart?.raw || storyText);
                  }}
                  className="absolute top-3 right-3 p-1.5 bg-blue-900/80 hover:bg-blue-800 text-white rounded-lg transition-all flex items-center gap-1.5 text-xs"
                  title="Edit response"
                >
                  <DynamicIcon name="Pencil" className="w-3 h-3" />
                  Edit
                </button>
              )}
            </>
          )}
        </div>

        {/* Action Buttons Bar */}
        {!editMode && (
          <div className="flex items-center justify-between px-4 py-2 bg-blue-900/30 border-t border-blue-800/30">
            {/* Left side: Retry & Undo */}
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
                  className="flex-1 py-3.5 sm:py-2.5 text-base font-semibold rounded-lg bg-red-600/80 hover:bg-red-600 text-white transition-all duration-150 flex items-center justify-center gap-2 touch-manipulation cursor-pointer"
                  title="Cancel generation"
                >
                  <div className="w-4 h-4 border-2 border-white/60 border-t-white rounded-full animate-spin" />
                  {loadingStage === "tools"
                    ? "Updating game state..."
                    : loadingStage === "choices"
                    ? "Preparing choices..."
                    : "Generating..."}
                  <DynamicIcon name="Square" className="w-4 h-4 ml-1" />
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

const prettify = (
  text: string,
  animate: boolean = true,
  showHiddenMessages: boolean = false,
  fontSettings?: FontSettings
) => {
  // Process hidden text before rendering
  const processedText = parseHiddenText(text, showHiddenMessages);

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
