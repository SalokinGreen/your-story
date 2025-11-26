"use client";
import { Choice, Choices, StoryData } from "../misc/structs";
import React from "react";
import ReactMarkdown from "react-markdown";
import TTSControls from "../components/TTSControls";
import ChoicesModal from "../components/ChoicesModal";
import { DynamicIcon } from "../components/DynamicIcon";
import SyncIndicator from "../components/SyncIndicator";
import type { SyncStatus } from "../misc/localStoryManager";

interface StoryProps {
  storyData: StoryData;
  storyText: string;
  choices: Choices;
  input: Record<string, boolean>;
  loading: boolean;
  loadingStage?: "story" | "tools" | "choices" | null;
  momentumMode: "none" | "reroll" | "guarantee";
  onMomentumModeChange: (mode: "none" | "reroll" | "guarantee") => void;
  handleChoice: () => void;
  handleSelect: (index: number) => void;
  onCustomInput?: (text: string) => void;
  onRetry?: () => void;
  canRetry?: boolean;
  onUndo?: () => void;
  canUndo?: boolean;
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
  onRetry,
  canRetry,
  onUndo,
  canUndo,
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
      <div className="bg-white dark:bg-blue-950 rounded-2xl shadow-xl border border-gray-200 dark:border-purple-900/50 overflow-hidden relative">
        {/* Sync Status Indicator - top right corner */}
        {syncStatus && syncStatus !== "local-only" && (
          <div className="absolute top-3 right-3 z-10">
            <SyncIndicator status={syncStatus} />
          </div>
        )}

        {/* Story Navigation Header */}
        {uniqueStoryParts.length > 1 && (
          <div className="flex items-center justify-center gap-3 py-2 px-4 bg-gray-50 dark:bg-blue-900/30 border-b border-gray-200 dark:border-purple-900/50">
            <button
              onClick={onNavigateLeft}
              disabled={currentStoryIndex <= 0}
              className="p-2 text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white disabled:text-gray-300 dark:disabled:text-gray-600 disabled:cursor-not-allowed transition-colors rounded-lg hover:bg-gray-200 dark:hover:bg-purple-900/50"
              title="Previous"
            >
              <DynamicIcon name="ChevronLeft" className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
                {currentStoryIndex + 1} / {uniqueStoryParts.length}
              </span>
              {isViewingPast && (
                <button
                  onClick={onResetToCurrentPart}
                  className="px-2 py-1 text-xs font-medium text-purple-600 dark:text-purple-400 hover:bg-purple-100 dark:hover:bg-purple-900/30 rounded transition-colors"
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
              className="p-2 text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white disabled:text-gray-300 dark:disabled:text-gray-600 disabled:cursor-not-allowed transition-colors rounded-lg hover:bg-gray-200 dark:hover:bg-purple-900/50"
              title="Next"
            >
              <DynamicIcon name="ChevronRight" className="w-5 h-5" />
            </button>
          </div>
        )}

        {/* Story Content Area */}
        <div
          className="relative p-4 sm:p-6 min-h-[250px]"
          onMouseEnter={() => setIsHovering(true)}
          onMouseLeave={() => setIsHovering(false)}
        >
          {editMode ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                  <DynamicIcon name="Pencil" className="w-5 h-5" />
                  Edit Response
                </h3>
                <span className="text-xs text-gray-500">
                  XML tags: &lt;story&gt;, &lt;choices&gt;, &lt;memory&gt;,
                  &lt;commands&gt;
                </span>
              </div>
              <textarea
                value={editedText}
                onChange={(e) => setEditedText(e.target.value)}
                className="w-full h-80 px-4 py-3 bg-gray-50 dark:bg-blue-900/50 border border-gray-300 dark:border-purple-800 rounded-xl text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500 font-mono text-sm resize-none"
                placeholder="Edit the raw AI output..."
              />
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">
                  {editedText.length} characters
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setEditMode(false);
                      setEditedText("");
                    }}
                    className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-200 dark:bg-purple-900/50 hover:bg-gray-300 dark:hover:bg-purple-800 rounded-lg transition-colors"
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
                    className="px-4 py-2 text-sm font-medium bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 text-white rounded-lg transition-colors flex items-center gap-2"
                  >
                    <DynamicIcon name="Save" className="w-4 h-4" />
                    Save
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <>
              {prettify(storyText)}

              {/* Edit button overlay */}
              {isHovering && onEdit && !loading && !loadingStage && (
                <button
                  onClick={() => {
                    setEditMode(true);
                    const lastPart =
                      storyData.scene.parts[storyData.scene.parts.length - 1];
                    setEditedText(lastPart?.raw || storyText);
                  }}
                  className="absolute top-4 right-4 p-2 bg-gray-900/80 hover:bg-gray-900 text-white rounded-lg shadow-lg transition-all flex items-center gap-2 text-sm"
                  title="Edit response"
                >
                  <DynamicIcon name="Pencil" className="w-4 h-4" />
                  Edit
                </button>
              )}
            </>
          )}
        </div>

        {/* Action Buttons Bar */}
        {!editMode && (
          <div className="flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-blue-900/30 border-t border-gray-200 dark:border-purple-900/50">
            {/* Left side: Retry & Undo */}
            <div className="flex items-center gap-2">
              {canUndo && onUndo && (
                <button
                  onClick={onUndo}
                  disabled={loading || !!loadingStage}
                  className="px-3 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-200 dark:hover:bg-purple-900/50 rounded-lg transition-colors flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Undo last action"
                >
                  <DynamicIcon name="Undo2" className="w-4 h-4" />
                  <span className="hidden sm:inline">Undo</span>
                </button>
              )}
              {canRetry && onRetry && (
                <button
                  onClick={onRetry}
                  disabled={loading || !!loadingStage}
                  className="px-3 py-2 text-sm font-medium text-amber-600 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/30 rounded-lg transition-colors flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Regenerate response"
                >
                  <DynamicIcon name="RotateCcw" className="w-4 h-4" />
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

        {/* Continue Button */}
        {!editMode && (
          <div className="p-4 pt-0">
            <button
              onClick={() => setShowChoicesModal(true)}
              disabled={loading || !!loadingStage}
              className={`w-full py-3 text-lg font-bold rounded-xl shadow-md transition-all duration-150 flex items-center justify-center gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-offset-2 ${
                loading || loadingStage
                  ? "bg-gray-400 dark:bg-gray-600 text-gray-200 dark:text-gray-400 cursor-not-allowed"
                  : "bg-linear-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white hover:shadow-lg active:scale-[0.98]"
              }`}
            >
              {loading || loadingStage ? (
                <>
                  <div className="w-5 h-5 border-2 border-gray-300 dark:border-gray-500 border-t-white dark:border-t-gray-300 rounded-full animate-spin" />
                  {loadingStage === "tools"
                    ? "Updating game state..."
                    : loadingStage === "choices"
                    ? "Preparing choices..."
                    : "Generating..."}
                </>
              ) : (
                <>
                  <DynamicIcon name="Compass" className="w-5 h-5" />
                  Continue
                </>
              )}
            </button>
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
        loading={loading}
        momentumMode={momentumMode}
        onMomentumModeChange={onMomentumModeChange}
      />
    </div>
  );
}

const prettify = (text: string, animate: boolean = true) => {
  return (
    <div
      className={`prose prose-lg prose-zinc dark:prose-invert max-w-none ${
        animate ? "animate-fade-in" : ""
      }`}
    >
      <ReactMarkdown
        components={{
          p: ({ node, ...props }) => (
            <p className="mb-3 leading-relaxed last:mb-0" {...props} />
          ),
          h1: ({ node, ...props }) => (
            <h1
              className="text-2xl font-bold mb-3 mt-4 first:mt-0"
              {...props}
            />
          ),
          h2: ({ node, ...props }) => (
            <h2 className="text-xl font-bold mb-2 mt-4 first:mt-0" {...props} />
          ),
          h3: ({ node, ...props }) => (
            <h3 className="text-lg font-bold mb-2 mt-3 first:mt-0" {...props} />
          ),
          strong: ({ node, ...props }) => (
            <strong
              className="font-bold text-gray-900 dark:text-white"
              {...props}
            />
          ),
          em: ({ node, ...props }) => <em className="italic" {...props} />,
          ul: ({ node, ...props }) => (
            <ul
              className="list-disc ml-5 mb-3 space-y-1 last:mb-0"
              {...props}
            />
          ),
          ol: ({ node, ...props }) => (
            <ol
              className="list-decimal ml-5 mb-3 space-y-1 last:mb-0"
              {...props}
            />
          ),
          li: ({ node, ...props }) => (
            <li className="leading-relaxed" {...props} />
          ),
          blockquote: ({ node, ...props }) => (
            <blockquote
              className="border-l-4 border-purple-500 pl-4 italic text-gray-600 dark:text-gray-400 my-3"
              {...props}
            />
          ),
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
};
