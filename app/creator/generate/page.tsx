"use client";

import { useState, useCallback, useRef, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAPIKeys } from "@/app/misc/APIKeysContext";
import { useNotification } from "@/app/misc/NotificationContext";
import PDFImporter from "@/app/components/PDFImporter";
import FullScreenView from "@/app/components/FullScreenView";
import { creatorStreamFetch, creatorImageFetch } from "@/app/misc/creatorFetch";
import {
  BigAdventureConfig,
  ComplexityLevel,
  GenerationStage,
  LegacyStage,
  StageConfig,
  BigAdventureAutosave,
  BigAdventureResult,
  RegenerateSection,
  REGENERATE_SECTIONS,
  ConfigTemplate,
  GenerationHistoryEntry,
  StylePreset,
  STYLE_PRESETS,
  PromptTemplate,
  PROMPT_TEMPLATES,
  PROMPT_BUILDER_QUESTIONS,
  buildPromptFromAnswers,
  canExtendSection,
  getStageInfo,
  getParentStage,
  getStagesToRun,
  estimateBigAdventureCost,
  getTotalGenerationTasks,
  DEFAULT_STAGE_CONFIGS,
  DEFAULT_CONTENT_ITERATIONS,
  generateSessionId,
  loadAutosave,
  clearAutosave,
  saveConfigDraft,
  loadConfigDraft,
  saveConfigTemplate,
  loadConfigTemplates,
  deleteConfigTemplate,
  generateTemplateId,
  saveGenerationToHistory,
  updateGenerationHistory,
  loadGenerationHistory,
  deleteHistoryEntry,
  clearGenerationHistory,
  mergeBigAdventureResults,
  parseBigAdventureStageOutput,
} from "@/app/misc/big_adventure_ai";
import {
  generateAdventureSequential,
  GenerationCallbacks,
} from "@/app/misc/generation_orchestrator";
import {
  AI_MODELS,
  getModelConfig,
  OPENROUTER_IMAGE_MODELS,
  DEEPINFRA_IMAGE_MODELS,
  estimateImageCost,
} from "@/app/misc/ai_prices";
import {
  Adventure,
  StoryLore,
  Goal,
  Variable,
  CustomTable,
} from "@/app/misc/structs";
import { parseTemplateFields } from "@/app/misc/characterSheetTemplate";
import { saveLocalAdventure } from "@/app/misc/localAdventureManager";
import { startAdventureLocally } from "@/app/misc/localStoryManager";
import { AdventureVisualization } from "./AdventureVisualization";

// Autosave Recovery Modal
function AutosaveRecoveryModal({
  autosave,
  timeStr,
  onResume,
  onDiscard,
}: {
  autosave: BigAdventureAutosave;
  timeStr: string;
  onResume: () => void;
  onDiscard: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-[#0d1829]/95 backdrop-blur-2xl border border-white/10 rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-full bg-amber-500/20 flex items-center justify-center">
            <span className="text-2xl">💾</span>
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">Recover Progress?</h3>
            <p className="text-sm text-blue-300/60">Saved {timeStr}</p>
          </div>
        </div>

        <div className="bg-white/5 rounded-lg p-4 mb-4 border border-white/10">
          <p className="text-sm text-blue-200 mb-2">
            <span className="text-blue-300/60">Prompt:</span>{" "}
            {autosave.config.prompt.slice(0, 100)}
            {autosave.config.prompt.length > 100 ? "..." : ""}
          </p>
          <p className="text-sm text-blue-200">
            <span className="text-blue-300/60">Completed:</span>{" "}
            {autosave.completedStages.length} of{" "}
            {getStagesToRun(autosave.config).length} stages
            {autosave.completedStages.length > 0 && (
              <span className="text-green-400 ml-2">
                (
                {autosave.completedStages
                  .map((s) => getStageInfo(s).name)
                  .join(", ")}
                )
              </span>
            )}
          </p>
        </div>

        <div className="flex gap-3">
          <button
            onClick={onDiscard}
            className="flex-1 px-4 py-2 bg-white/5 hover:bg-white/10 text-white rounded-lg transition-colors"
          >
            Start Fresh
          </button>
          <button
            onClick={onResume}
            className="flex-1 px-4 py-2 bg-linear-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white rounded-lg transition-colors"
          >
            Resume
          </button>
        </div>
      </div>
    </div>
  );
}

// JSON Repair Modal - allows manual fixing of broken JSON output
function JsonRepairModal({
  isOpen,
  stage,
  content,
  error,
  onClose,
  onSave,
}: {
  isOpen: boolean;
  stage: GenerationStage | null;
  content: string;
  error: string;
  onClose: () => void;
  onSave: (fixedContent: string, stage: GenerationStage) => void;
}) {
  const [editedContent, setEditedContent] = useState(content);
  const [parseError, setParseError] = useState<string | null>(null);
  const [isParsing, setIsParsing] = useState(false);

  // Update editedContent when content prop changes
  useEffect(() => {
    setEditedContent(content);
    setParseError(null);
  }, [content]);

  if (!isOpen || !stage) return null;

  const stageName = getStageInfo(stage).name;

  const handleValidate = () => {
    setParseError(null);
    try {
      const result = parseBigAdventureStageOutput(editedContent, stage);
      if (result) {
        setParseError(null);
        return true;
      } else {
        setParseError("Parsed successfully but no valid data found");
        return false;
      }
    } catch (e) {
      setParseError(e instanceof Error ? e.message : "Invalid JSON");
      return false;
    }
  };

  const handleSave = () => {
    setIsParsing(true);
    const isValid = handleValidate();
    if (isValid) {
      onSave(editedContent, stage);
    }
    setIsParsing(false);
  };

  // Try to format JSON nicely
  const handleFormat = () => {
    try {
      // Extract JSON from content
      let jsonContent = editedContent.trim();
      const jsonBlockMatch = jsonContent.match(
        /```(?:json)?\s*([\s\S]*?)\s*```/,
      );
      if (jsonBlockMatch) {
        jsonContent = jsonBlockMatch[1].trim();
      }
      jsonContent = jsonContent
        .replace(/```json\s*/gi, "")
        .replace(/```\s*/g, "");

      const startIndex = jsonContent.indexOf("{");
      const endIndex = jsonContent.lastIndexOf("}");
      if (startIndex !== -1 && endIndex !== -1) {
        jsonContent = jsonContent.slice(startIndex, endIndex + 1);
      }

      const parsed = JSON.parse(jsonContent);
      setEditedContent(JSON.stringify(parsed, null, 2));
      setParseError(null);
    } catch (e) {
      setParseError(
        "Cannot format - JSON is not valid. Try fixing the errors first.",
      );
    }
  };

  return (
    <FullScreenView
      title="Fix JSON Output"
      subtitle={`Stage: ${stageName}`}
      icon="Wrench"
      onClose={onClose}
      bodyClassName="p-0"
      footer={
        <div className="flex items-center justify-between p-4 bg-white/[0.03]">
          <div className="text-xs text-blue-300/50">
            Tip: Look for missing commas, unclosed brackets, or truncated
            strings
          </div>
          <div className="flex gap-3">
            <button
              onClick={handleValidate}
              className="px-4 py-2 bg-white/10 hover:bg-white/10 text-blue-200 rounded-lg transition-colors"
            >
              Validate
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-white/5 hover:bg-white/10 text-white rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={isParsing}
              className="px-4 py-2 bg-linear-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 disabled:from-gray-600 disabled:to-gray-600 text-white rounded-lg transition-colors"
            >
              {isParsing ? "Parsing..." : "Save & Continue"}
            </button>
          </div>
        </div>
      }
    >
      <div className="h-full flex flex-col">
        {/* Error message */}
        <div className="px-4 py-2 bg-red-900/20 border-b border-red-700/30 shrink-0">
          <p className="text-sm text-red-300">
            <span className="font-semibold">Error:</span> {error}
          </p>
          <p className="text-xs text-red-300/70 mt-1">
            The AI output couldn&apos;t be parsed. You can try to fix the JSON
            manually below.
          </p>
        </div>

        {/* Editor area */}
        <div className="flex-1 p-4 overflow-hidden flex flex-col min-h-0">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-blue-300/60">
              Raw output ({editedContent.length.toLocaleString()} chars)
            </span>
            <button
              onClick={handleFormat}
              className="px-3 py-1 text-xs bg-white/10 hover:bg-white/10 text-blue-300 rounded transition-colors"
            >
              Format JSON
            </button>
          </div>
          <textarea
            value={editedContent}
            onChange={(e) => {
              setEditedContent(e.target.value);
              setParseError(null);
            }}
            className="flex-1 w-full min-h-[400px] bg-white/5 border border-white/10 rounded-lg p-3 font-mono text-sm text-blue-100 resize-y focus:outline-none focus:border-blue-500"
            placeholder="Paste or edit JSON content here..."
            spellCheck={false}
          />

          {/* Parse error display */}
          {parseError && (
            <div className="mt-2 p-2 bg-red-900/30 border border-red-700/30 rounded-lg">
              <p className="text-sm text-red-300 font-mono">{parseError}</p>
            </div>
          )}
        </div>
      </div>
    </FullScreenView>
  );
}

// Stage Toggle Component (uses legacy stages for UI)
function StageToggle({
  stage,
  enabled,
  onToggle,
  disabled = false,
}: {
  stage: LegacyStage;
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  disabled?: boolean;
}) {
  // Map legacy stage to first substage for getStageInfo
  // NOTE: "mechanics" maps to "mechanics-notes" (abilities stage is deprecated)
  const substage: GenerationStage =
    stage === "content"
      ? "content-lore"
      : stage === "advanced"
        ? "advanced-presets"
        : stage === "mechanics"
          ? "mechanics-notes"
          : stage;
  const info = getStageInfo(substage);

  // Custom names for legacy stages in UI
  const legacyNames: Record<LegacyStage, string> = {
    core: "Core Concept",
    mechanics: "Mechanics",
    content: "Content",
    advanced: "Advanced",
  };

  return (
    <label
      className={`flex items-center gap-3 p-3 rounded-lg transition-all cursor-pointer ${
        disabled ? "opacity-50 cursor-not-allowed" : "hover:bg-white/5"
      } ${enabled ? "bg-white/[0.03]" : ""}`}
    >
      <input
        type="checkbox"
        checked={enabled}
        onChange={(e) => !disabled && onToggle(e.target.checked)}
        disabled={disabled}
        className="w-4 h-4 rounded bg-white/5 border-white/10 text-purple-500 focus:ring-purple-500"
      />
      <div className="flex-1">
        <span className="text-sm font-medium text-white">
          {legacyNames[stage]}
        </span>
        <p className="text-xs text-blue-300/50">{info.description}</p>
      </div>
    </label>
  );
}

// Configuration Step Component
function ConfigStep({
  step,
  currentStep,
  title,
  children,
}: {
  step: number;
  currentStep: number;
  title: string;
  children: React.ReactNode;
}) {
  const isActive = step === currentStep;
  const isComplete = step < currentStep;

  return (
    <div
      className={`transition-all duration-300 ${
        isActive ? "opacity-100" : "opacity-50"
      }`}
    >
      <div className="flex items-center gap-3 mb-4">
        <div
          className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
            isComplete
              ? "bg-green-500 text-white"
              : isActive
                ? "bg-purple-500 text-white"
                : "bg-white/5 text-blue-300/50"
          }`}
        >
          {isComplete ? "✓" : step}
        </div>
        <h3 className="text-lg font-semibold text-white">{title}</h3>
      </div>
      {isActive && <div className="pl-11">{children}</div>}
    </div>
  );
}

// Stage Progress Component
function StageProgress({
  stages,
  activeStages,
  completedStages,
  failedStages,
}: {
  stages: GenerationStage[];
  activeStages: GenerationStage[];
  completedStages: GenerationStage[];
  failedStages: GenerationStage[];
}) {
  return (
    <div className="space-y-3">
      {stages.map((stage) => {
        const info = getStageInfo(stage);
        const isComplete = completedStages.includes(stage);
        const isFailed = failedStages.includes(stage);
        const isActive = activeStages.includes(stage);

        return (
          <div
            key={stage}
            className={`flex items-center gap-3 p-3 rounded-lg transition-all ${
              isActive
                ? "bg-purple-500/20 border border-purple-500/50"
                : isComplete
                  ? "bg-green-500/10 border border-green-500/30"
                  : isFailed
                    ? "bg-red-500/10 border border-red-500/30"
                    : "bg-white/5 border border-white/10"
            }`}
          >
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                isComplete
                  ? "bg-green-500 text-white"
                  : isFailed
                    ? "bg-red-500 text-white"
                    : isActive
                      ? "bg-purple-500 text-white animate-pulse"
                      : "bg-white/5 text-blue-300/50"
              }`}
            >
              {isComplete ? "✓" : isFailed ? "✗" : info.number}
            </div>
            <div className="flex-1">
              <div className="font-medium text-white">{info.name}</div>
              <div className="text-sm text-blue-300/60">{info.description}</div>
            </div>
            {isActive && (
              <div className="flex items-center gap-2 text-purple-400">
                <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                <span className="text-sm">Generating...</span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// Live Output Component with tabs for different stages
function LiveOutput({
  stageContents,
  activeStages,
  completedStages,
}: {
  stageContents: Map<GenerationStage, string>;
  activeStages: GenerationStage[];
  completedStages: GenerationStage[];
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [selectedStage, setSelectedStage] = useState<GenerationStage | null>(
    null,
  );
  const [autoScroll, setAutoScroll] = useState(false);

  // All stages that have content (active or completed)
  const stagesWithContent = Array.from(stageContents.keys()).filter((stage) =>
    stageContents.get(stage),
  );

  // Auto-select the first active stage when a new stage starts
  useEffect(() => {
    if (activeStages.length > 0 && !selectedStage) {
      setSelectedStage(activeStages[0]);
    } else if (
      activeStages.length > 0 &&
      selectedStage &&
      !stageContents.has(selectedStage)
    ) {
      // If selected stage was removed, switch to first active
      setSelectedStage(activeStages[0]);
    }
  }, [activeStages, selectedStage, stageContents]);

  // Handle auto-scroll when enabled
  const currentContent = selectedStage
    ? stageContents.get(selectedStage) || ""
    : "";
  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [currentContent, autoScroll]);

  if (stagesWithContent.length === 0) return null;

  const scrollToBottom = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  };

  return (
    <div className="mt-4">
      {/* Header with tabs */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm text-blue-300/60 mr-2">Live Output</span>
          {stagesWithContent.map((stage) => {
            const info = getStageInfo(stage);
            const isActive = activeStages.includes(stage);
            const isCompleted = completedStages.includes(stage);
            const isSelected = selectedStage === stage;

            return (
              <button
                key={stage}
                onClick={() => setSelectedStage(stage)}
                className={`px-3 py-1 text-xs rounded-lg transition-all flex items-center gap-1.5 ${
                  isSelected
                    ? "bg-blue-600 text-white"
                    : "bg-white/5 text-blue-300/70 hover:bg-white/10 hover:text-blue-200"
                }`}
              >
                {isActive && (
                  <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                )}
                {isCompleted && !isActive && (
                  <span className="text-green-400">✓</span>
                )}
                {info.name}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-blue-300/60 cursor-pointer">
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) => setAutoScroll(e.target.checked)}
              className="w-3 h-3 rounded bg-white/5 border-white/10 text-purple-500"
            />
            Auto-scroll
          </label>
          <button
            onClick={scrollToBottom}
            className="px-2 py-1 text-xs bg-white/5 hover:bg-white/10 text-blue-300/70 rounded transition-colors"
            title="Scroll to bottom"
          >
            ↓ Bottom
          </button>
        </div>
      </div>

      {/* Content area - larger window */}
      <div
        ref={scrollRef}
        className="bg-white/[0.03] backdrop-blur-md rounded-lg p-4 h-80 overflow-y-auto font-mono text-sm text-blue-200 whitespace-pre-wrap border border-white/10"
      >
        {currentContent || (
          <span className="text-blue-400/50 italic">
            Waiting for content...
          </span>
        )}
      </div>
    </div>
  );
}

// Content Browser Component - Shows generated content during generation
function ContentBrowser({
  partialResults,
}: {
  partialResults: Partial<BigAdventureResult>;
}) {
  const [expandedSection, setExpandedSection] = useState<string | null>(null);
  const [selectedItemIndex, setSelectedItemIndex] = useState<number>(0);

  const storyTemplate = partialResults.storyTemplate;

  // Collect all available content sections
  const sections: {
    key: string;
    label: string;
    icon: string;
    color: string;
    items: { name: string; description?: string; symbol?: string }[];
  }[] = [];

  // Core Concept section (from core stage)
  if (
    partialResults.title ||
    partialResults.description ||
    storyTemplate?.premise ||
    storyTemplate?.intro
  ) {
    const coreItems: { name: string; description?: string; symbol?: string }[] =
      [];
    if (partialResults.title) {
      coreItems.push({
        name: "Title",
        description: partialResults.title,
        symbol: "📖",
      });
    }
    if (partialResults.shortDescription) {
      coreItems.push({
        name: "Short Description",
        description: partialResults.shortDescription,
        symbol: "📝",
      });
    }
    if (partialResults.description) {
      coreItems.push({
        name: "Full Description",
        description: partialResults.description,
        symbol: "📄",
      });
    }
    if (storyTemplate?.premise) {
      coreItems.push({
        name: "Premise",
        description: storyTemplate.premise,
        symbol: "🎯",
      });
    }
    if (storyTemplate?.intro) {
      coreItems.push({
        name: "Introduction",
        description: storyTemplate.intro,
        symbol: "🎬",
      });
    }
    if (storyTemplate?.player_name) {
      coreItems.push({
        name: "Default Player Name",
        description: storyTemplate.player_name,
        symbol: "👤",
      });
    }
    if (storyTemplate?.player_summary) {
      coreItems.push({
        name: "Player Summary",
        description: storyTemplate.player_summary,
        symbol: "📋",
      });
    }
    if (storyTemplate?.author_notes) {
      coreItems.push({
        name: "Author Notes",
        description: storyTemplate.author_notes,
        symbol: "✍️",
      });
    }
    if (coreItems.length > 0) {
      sections.push({
        key: "core",
        label: "Core Concept",
        icon: "🎯",
        color: "cyan",
        items: coreItems,
      });
    }
  }

  if (storyTemplate?.lore && storyTemplate.lore.length > 0) {
    sections.push({
      key: "lore",
      label: "Notes",
      icon: "📜",
      color: "purple",
      items: storyTemplate.lore.map((l) => ({
        name: l.title,
        description: l.content,
        symbol: l.secrtet ? "🔮" : "📖",
      })),
    });
  }

  if (storyTemplate?.stats && storyTemplate.stats.length > 0) {
    sections.push({
      key: "stats",
      label: "Stats",
      icon: "📊",
      color: "amber",
      items: storyTemplate.stats.map((s) => ({
        name: s.name,
        description: s.description,
        symbol: s.symbol,
      })),
    });
  }

  if (storyTemplate?.resources && storyTemplate.resources.length > 0) {
    sections.push({
      key: "resources",
      label: "Resources",
      icon: "💎",
      color: "emerald",
      items: storyTemplate.resources.map((r) => ({
        name: r.name,
        description: r.description,
        symbol: r.symbol,
      })),
    });
  }

  if (storyTemplate?.abilities && storyTemplate.abilities.length > 0) {
    sections.push({
      key: "abilities",
      label: "Abilities",
      icon: "⚡",
      color: "blue",
      items: storyTemplate.abilities.map((a) => ({
        name: a.name,
        description: a.description,
        symbol: a.symbol,
      })),
    });
  }

  if (storyTemplate?.inventory && storyTemplate.inventory.length > 0) {
    sections.push({
      key: "inventory",
      label: "Items",
      icon: "🎒",
      color: "orange",
      items: storyTemplate.inventory.map((i) => ({
        name: i.name,
        description: i.description,
        symbol: i.symbol,
      })),
    });
  }

  if (storyTemplate?.goals && storyTemplate.goals.length > 0) {
    sections.push({
      key: "goals",
      label: "Goals",
      icon: "📋",
      color: "green",
      items: storyTemplate.goals.map((g) => ({
        name: g.title,
        description: g.description,
        symbol: g.fulfilled ? "✅" : g.active ? "🔵" : "⬜",
      })),
    });
  }

  if (storyTemplate?.relationships && storyTemplate.relationships.length > 0) {
    sections.push({
      key: "relationships",
      label: "NPCs",
      icon: "👥",
      color: "pink",
      items: storyTemplate.relationships.map((r) => ({
        name: r.name,
        description: r.description,
        symbol: r.value > 0 ? "💚" : r.value < 0 ? "💔" : "💛",
      })),
    });
  }

  if (sections.length === 0) return null;

  const colorClasses: Record<
    string,
    { text: string; bg: string; border: string }
  > = {
    cyan: {
      text: "text-cyan-400",
      bg: "bg-cyan-900/30",
      border: "border-cyan-500/50",
    },
    purple: {
      text: "text-purple-400",
      bg: "bg-purple-900/30",
      border: "border-purple-500/50",
    },
    yellow: {
      text: "text-yellow-400",
      bg: "bg-yellow-900/30",
      border: "border-yellow-500/50",
    },
    amber: {
      text: "text-amber-400",
      bg: "bg-amber-900/30",
      border: "border-amber-500/50",
    },
    emerald: {
      text: "text-emerald-400",
      bg: "bg-emerald-900/30",
      border: "border-emerald-500/50",
    },
    blue: {
      text: "text-blue-400",
      bg: "bg-white/5",
      border: "border-blue-500/50",
    },
    orange: {
      text: "text-orange-400",
      bg: "bg-orange-900/30",
      border: "border-orange-500/50",
    },
    green: {
      text: "text-green-400",
      bg: "bg-green-900/30",
      border: "border-green-500/50",
    },
    pink: {
      text: "text-pink-400",
      bg: "bg-pink-900/30",
      border: "border-pink-500/50",
    },
    red: {
      text: "text-red-400",
      bg: "bg-red-900/30",
      border: "border-red-500/50",
    },
  };

  const currentSection = sections.find((s) => s.key === expandedSection);
  const currentItem = currentSection?.items[selectedItemIndex];

  return (
    <div className="mt-6 bg-white/[0.03] backdrop-blur-md rounded-xl border border-white/10 overflow-hidden">
      <div className="p-3 bg-white/5 border-b border-white/10">
        <h4 className="text-sm font-medium text-blue-300 flex items-center gap-2">
          <span>📚</span>
          <span>Browse Generated Content</span>
          <span className="text-xs text-blue-400/50 ml-auto">
            {sections.reduce((sum, s) => sum + s.items.length, 0)} items
          </span>
        </h4>
      </div>

      {/* Section tabs */}
      <div className="flex flex-wrap gap-2 p-3 border-b border-white/10">
        {sections.map((section) => {
          const colors = colorClasses[section.color] || colorClasses.blue;
          const isActive = expandedSection === section.key;
          return (
            <button
              key={section.key}
              onClick={() => {
                setExpandedSection(isActive ? null : section.key);
                setSelectedItemIndex(0);
              }}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
                isActive
                  ? `${colors.bg} ${colors.text} border ${colors.border}`
                  : "bg-white/5 text-blue-300/70 hover:bg-white/10 border border-transparent"
              }`}
            >
              <span>{section.icon}</span>
              <span>{section.label}</span>
              <span
                className={`text-xs px-1.5 py-0.5 rounded ${
                  isActive ? "bg-black/20" : "bg-white/10"
                }`}
              >
                {section.items.length}
              </span>
            </button>
          );
        })}
      </div>

      {/* Content viewer */}
      {currentSection && (
        <div className="p-4">
          {/* Item navigation */}
          <div className="flex items-center gap-3 mb-4">
            <button
              onClick={() =>
                setSelectedItemIndex((prev) => Math.max(0, prev - 1))
              }
              disabled={selectedItemIndex === 0}
              className="p-2 rounded-lg bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              ←
            </button>
            <div className="flex-1 text-center">
              <span className="text-blue-300/60 text-sm">
                {selectedItemIndex + 1} / {currentSection.items.length}
              </span>
            </div>
            <button
              onClick={() =>
                setSelectedItemIndex((prev) =>
                  Math.min(currentSection.items.length - 1, prev + 1),
                )
              }
              disabled={selectedItemIndex === currentSection.items.length - 1}
              className="p-2 rounded-lg bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              →
            </button>
          </div>

          {/* Current item display */}
          {currentItem && (
            <div
              className={`rounded-lg p-4 ${
                colorClasses[currentSection.color]?.bg || "bg-white/5"
              } border ${
                colorClasses[currentSection.color]?.border ||
                "border-blue-500/30"
              }`}
            >
              <div className="flex items-start gap-3">
                <span className="text-2xl">{currentItem.symbol}</span>
                <div className="flex-1 min-w-0">
                  <h5
                    className={`font-bold ${
                      colorClasses[currentSection.color]?.text ||
                      "text-blue-300"
                    }`}
                  >
                    {currentItem.name}
                  </h5>
                  {currentItem.description && (
                    <p className="text-sm text-blue-200/80 mt-2 whitespace-pre-wrap">
                      {currentItem.description}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Quick item list */}
          <div className="mt-4 flex flex-wrap gap-2">
            {currentSection.items.map((item, idx) => (
              <button
                key={idx}
                onClick={() => setSelectedItemIndex(idx)}
                className={`px-2 py-1 rounded text-xs transition-all ${
                  idx === selectedItemIndex
                    ? `${
                        colorClasses[currentSection.color]?.bg ||
                        "bg-white/5"
                      } ${
                        colorClasses[currentSection.color]?.text ||
                        "text-blue-300"
                      } border ${
                        colorClasses[currentSection.color]?.border ||
                        "border-blue-500/30"
                      }`
                    : "bg-white/[0.03] text-blue-300/60 hover:bg-white/10 border border-transparent"
                }`}
                title={item.name}
              >
                {item.symbol}{" "}
                {item.name.length > 20
                  ? item.name.slice(0, 20) + "..."
                  : item.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Collapsed state hint */}
      {!expandedSection && (
        <div className="p-4 text-center text-blue-300/50 text-sm">
          Click a category above to browse your generated content
        </div>
      )}
    </div>
  );
}

// Expandable Content Card Component
function ExpandableContentCard({
  section,
  label,
  count,
  color,
  items,
  isExpanded,
  onToggleExpand,
  onRegenerate,
  onExtend,
  isRegenerating,
  isExtending,
  canExtend = true,
  renderItem,
}: {
  section: RegenerateSection;
  label: string;
  count: number;
  color: string;
  items: unknown[];
  isExpanded: boolean;
  onToggleExpand: () => void;
  onRegenerate: () => void;
  onExtend: () => void;
  isRegenerating: boolean;
  isExtending: boolean;
  canExtend?: boolean;
  renderItem: (item: unknown, index: number) => React.ReactNode;
}) {
  const colorClasses: Record<
    string,
    { text: string; bg: string; hover: string }
  > = {
    amber: {
      text: "text-amber-400",
      bg: "bg-amber-800/50",
      hover: "hover:bg-amber-700/50",
    },
    emerald: {
      text: "text-emerald-400",
      bg: "bg-emerald-800/50",
      hover: "hover:bg-emerald-700/50",
    },
    blue: {
      text: "text-blue-400",
      bg: "bg-white/10",
      hover: "hover:bg-white/10",
    },
    green: {
      text: "text-green-400",
      bg: "bg-green-800/50",
      hover: "hover:bg-green-700/50",
    },
    purple: {
      text: "text-purple-400",
      bg: "bg-purple-800/50",
      hover: "hover:bg-purple-700/50",
    },
    red: {
      text: "text-red-400",
      bg: "bg-red-800/50",
      hover: "hover:bg-red-700/50",
    },
    yellow: {
      text: "text-yellow-400",
      bg: "bg-yellow-800/50",
      hover: "hover:bg-yellow-700/50",
    },
    pink: {
      text: "text-pink-400",
      bg: "bg-pink-800/50",
      hover: "hover:bg-pink-700/50",
    },
    cyan: {
      text: "text-cyan-400",
      bg: "bg-cyan-800/50",
      hover: "hover:bg-cyan-700/50",
    },
    orange: {
      text: "text-orange-400",
      bg: "bg-orange-800/50",
      hover: "hover:bg-orange-700/50",
    },
    indigo: {
      text: "text-indigo-400",
      bg: "bg-indigo-800/50",
      hover: "hover:bg-indigo-700/50",
    },
    violet: {
      text: "text-violet-400",
      bg: "bg-violet-800/50",
      hover: "hover:bg-violet-700/50",
    },
    teal: {
      text: "text-teal-400",
      bg: "bg-teal-800/50",
      hover: "hover:bg-teal-700/50",
    },
    lime: {
      text: "text-lime-400",
      bg: "bg-lime-800/50",
      hover: "hover:bg-lime-700/50",
    },
  };
  const colorClass = colorClasses[color] || colorClasses.blue;

  return (
    <div
      className={`bg-white/5 rounded-lg border border-white/10 overflow-hidden transition-all ${
        isExpanded ? "col-span-2 md:col-span-4" : ""
      }`}
    >
      {/* Header - always visible */}
      <div
        className="p-3 group relative cursor-pointer hover:bg-white/10 transition-all"
        onClick={onToggleExpand}
      >
        {/* Action buttons */}
        <div
          className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 flex gap-1 transition-all z-10"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRegenerate();
            }}
            disabled={isRegenerating || isExtending}
            className={`text-xs px-1.5 py-0.5 ${colorClass.bg} ${
              colorClass.hover
            } disabled:bg-white/5 ${colorClass.text.replace(
              "400",
              "300",
            )} rounded transition-all`}
            title={`Regenerate all ${label.toLowerCase()}`}
          >
            {isRegenerating ? "⏳" : "🔄"}
          </button>
          {canExtend && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onExtend();
              }}
              disabled={isRegenerating || isExtending}
              className="text-xs px-1.5 py-0.5 bg-green-800/50 hover:bg-green-700/50 disabled:bg-white/5 text-green-300 rounded transition-all"
              title={`Add more ${label.toLowerCase()}`}
            >
              {isExtending ? "⏳" : "➕"}
            </button>
          )}
        </div>

        {/* Content */}
        <div className="flex items-center gap-3">
          <div className={`text-2xl font-bold ${colorClass.text}`}>{count}</div>
          <div className="flex-1">
            <div className="text-blue-300/60">{label}</div>
          </div>
          <div
            className={`text-blue-400/50 transition-transform ${
              isExpanded ? "rotate-180" : ""
            }`}
          >
            ▼
          </div>
        </div>
      </div>

      {/* Expanded content */}
      {isExpanded && items.length > 0 && (
        <div className="border-t border-white/10 p-3 max-h-64 overflow-y-auto">
          <div className="space-y-2">
            {items.map((item, index) => (
              <div
                key={index}
                className="bg-white/[0.03] backdrop-blur-md rounded-lg p-2 border border-white/10"
              >
                {renderItem(item, index)}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state when expanded */}
      {isExpanded && items.length === 0 && (
        <div className="border-t border-white/10 p-4 text-center text-blue-400/50 text-sm">
          No {label.toLowerCase()} generated yet
        </div>
      )}
    </div>
  );
}

function BigAdventureCreatorPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { keys: apiKeys, hasKey } = useAPIKeys();
  const { addNotification } = useNotification();

  // Quick start state (from home page genre buttons)
  const [isQuickStart, setIsQuickStart] = useState(false);
  const [quickStartReady, setQuickStartReady] = useState(false);
  const [autoPublishAndPlay, setAutoPublishAndPlay] = useState(false);
  // Track if initial config load has been done (to prevent re-loading after Quick Start clears URL)
  const initialLoadDoneRef = useRef<boolean>(false);

  // Autosave state
  const [pendingAutosave, setPendingAutosave] =
    useState<BigAdventureAutosave | null>(null);
  const [autosaveTimeStr, setAutosaveTimeStr] = useState("");
  const [sessionId, setSessionId] = useState<string>("");
  const [showAutosaveModal, setShowAutosaveModal] = useState(false);

  // Configuration state
  const [configStep, setConfigStep] = useState(1);
  const [config, setConfig] = useState<BigAdventureConfig>({
    prompt: "",
    genre: "",
    complexity: "moderate",
    nsfw: false,
    includeAGMT: true,
    includeCustomTables: true,
    includePresets: true,
    includeStartingChoices: true,
    targetDuration: "medium",
    maxOutputTokens: 4000,
    stageConfigs: { ...DEFAULT_STAGE_CONFIGS },
    contentIterations: { ...DEFAULT_CONTENT_ITERATIONS },
    temperature: 0.7,
    stylePreset: "default",
  });
  const [selectedModel, setSelectedModel] = useState("DeepSeek V4 Flash");
  const [showAdvancedConfig, setShowAdvancedConfig] = useState(false);

  // Parallel generation mode (run stages 3-8 concurrently)
  const [parallelMode, setParallelMode] = useState(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("bigAdventureParallelMode");
      return stored !== "false"; // Default to true
    }
    return true;
  });

  // Persist parallelMode to localStorage
  useEffect(() => {
    localStorage.setItem("bigAdventureParallelMode", parallelMode.toString());
  }, [parallelMode]);

  // BYOK-only: show openrouter, deepseek, google models
  const filteredModels = Object.entries(AI_MODELS).filter(([, model]) => {
    const provider = (model as { provider?: string }).provider;
    return (
      provider === "openrouter" ||
      provider === "deepseek" ||
      provider === "google"
    );
  });

  // Check if user has any BYOK keys configured
  const hasAnyBYOKKey =
    hasKey("openRouterKey") || hasKey("deepseekKey") || hasKey("googleKey");

  // Generation state
  const [isGenerating, setIsGenerating] = useState(false);
  const [stages, setStages] = useState<GenerationStage[]>([]);
  // Active stages - supports multiple stages running in parallel
  const [activeStages, setActiveStages] = useState<GenerationStage[]>([]);
  const [currentIteration, setCurrentIteration] = useState(0);
  const [totalTasks, setTotalTasks] = useState(0);
  const [completedTasks, setCompletedTasks] = useState(0);
  const [completedStages, setCompletedStages] = useState<GenerationStage[]>([]);
  const [failedStages, setFailedStages] = useState<GenerationStage[]>([]);
  const [liveContentMap, setLiveContentMap] = useState<
    Map<GenerationStage, string>
  >(new Map());

  // JSON Repair Modal state - for manual fixing of broken JSON output
  const [repairModalOpen, setRepairModalOpen] = useState(false);
  const [repairStage, setRepairStage] = useState<GenerationStage | null>(null);
  const [repairContent, setRepairContent] = useState("");
  const [repairError, setRepairError] = useState("");

  const [result, setResult] = useState<BigAdventureResult | null>(null);
  // partialResults is used for autosave recovery and intermediate state
   
  const [partialResults, setPartialResults] = useState<
    Partial<BigAdventureResult>
  >({});
  const [tokenCost, setTokenCost] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  // Resume mode - when user is resuming from autosaved partial progress
  const [resumeMode, setResumeMode] = useState(false);

  // Regeneration state - use Set to support multiple simultaneous regenerations
  const [regeneratingSections, setRegeneratingSections] = useState<
    Set<RegenerateSection>
  >(new Set());
  const [regenerationContent, setRegenerationContent] = useState("");

  // Extension state (Add More) - use Set to support multiple simultaneous extensions
  const [extendingSections, setExtendingSections] = useState<
    Set<RegenerateSection>
  >(new Set());
  const [extensionContent, setExtensionContent] = useState("");
  const [extensionOutputSize, setExtensionOutputSize] = useState(4000);
  const [extensionInstructions, setExtensionInstructions] = useState("");
  const [extensionModel, setExtensionModel] = useState("DeepSeek V4 Flash");

  // BYOK-only: show openrouter, deepseek, google models
  const filteredExtensionModels = Object.entries(AI_MODELS).filter(
    ([, model]) => {
      const provider = (model as { provider?: string }).provider;
      return (
        provider === "openrouter" ||
        provider === "deepseek" ||
        provider === "google"
      );
    },
  );

  // Get the selected extension model config
  const extensionModelConfig = getModelConfig(extensionModel);
  const extensionMaxOutput = Math.min(
    extensionModelConfig.maxOutputTokens || 8000,
    65000,
  );

  // Content preview expansion state
  const [expandedSections, setExpandedSections] = useState<
    Set<RegenerateSection>
  >(new Set());

  // Toggle section expansion
  const toggleSectionExpanded = useCallback((section: RegenerateSection) => {
    setExpandedSections((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(section)) {
        newSet.delete(section);
      } else {
        newSet.add(section);
      }
      return newSet;
    });
  }, []);

  // Stage preview state (Phase 2)
  const [showStagePreview, setShowStagePreview] = useState(false);
  const [previewStageData, setPreviewStageData] = useState<{
    stage: GenerationStage;
    content: string;
    partialResult: Partial<BigAdventureResult>;
  } | null>(null);

  // Template state (Phase 3)
  const [templates, setTemplates] = useState<ConfigTemplate[]>([]);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState("");
  const [newTemplateDescription, setNewTemplateDescription] = useState("");

  // History state (Phase 3)
  const [history, setHistory] = useState<GenerationHistoryEntry[]>([]);
  const [showHistoryModal, setShowHistoryModal] = useState(false);

  // Prompt builder state (Phase 4)
  const [promptMode, setPromptMode] = useState<
    "freeform" | "template" | "guided"
  >("freeform");
  const [selectedTemplate, setSelectedTemplate] =
    useState<PromptTemplate | null>(null);
  const [guidedAnswers, setGuidedAnswers] = useState<Record<string, string>>(
    {},
  );

  // AI Image generation state
  type ImageModelKey = keyof typeof OPENROUTER_IMAGE_MODELS;
  type DeepInfraImageModelKey = keyof typeof DEEPINFRA_IMAGE_MODELS;
  const [thumbnailUrl, setThumbnailUrl] = useState("");
  const [bannerUrl, setBannerUrl] = useState("");
  const [generatingThumbnail, setGeneratingThumbnail] = useState(false);
  const [generatingBanner, setGeneratingBanner] = useState(false);
  const [imageProvider, setImageProvider] = useState<
    "deepinfra" | "openrouter"
  >("deepinfra");
  const [imageModel, setImageModel] = useState<
    ImageModelKey | DeepInfraImageModelKey
  >("Bria 3.2");
  const [thumbnailPrompt, setThumbnailPrompt] = useState("");
  const [bannerPrompt, setBannerPrompt] = useState("");
  const [showThumbnailPromptEditor, setShowThumbnailPromptEditor] =
    useState(false);
  const [showBannerPromptEditor, setShowBannerPromptEditor] = useState(false);

  // History tracking - ID of the current adventure in history
  const [currentHistoryId, setCurrentHistoryId] = useState<string | null>(null);

  // Abort controller for cancellation
  const abortControllerRef = useRef<AbortController | null>(null);

  // Signal to finish the current stage early
  const finishEarlyRef = useRef<boolean>(false);

  // Finish current stage early (tell AI to wrap up)
  const finishStageEarly = useCallback(() => {
    if (activeStages.length > 0 && isGenerating && abortControllerRef.current) {
      finishEarlyRef.current = true;
      const stageNames = activeStages
        .map((s) => getStageInfo(s).name)
        .join(", ");
      addNotification(`Finishing ${stageNames} early...`, "success");
      // Abort the current request - the orchestrator will detect the finishEarly flag
      // and make a new request with finishEarly=true to wrap up the JSON
      abortControllerRef.current.abort();
    }
  }, [activeStages, isGenerating, addNotification]);

  // Handle quick start from home page genre buttons
  useEffect(() => {
    const quickStart = searchParams.get("quickStart");
    const genre = searchParams.get("genre");
    const prompt = searchParams.get("prompt");
    const model = searchParams.get("model") || "DeepSeek V4 Flash";
    const size = searchParams.get("size") || "standard";

    console.log("[Quick Start Effect] Params:", {
      quickStart,
      genre,
      prompt,
      size,
      isQuickStart,
      quickStartReady,
    });

    // Only run once when quickStart param is present
    if (quickStart === "true" && genre && !isQuickStart && !quickStartReady) {
      console.log("[Quick Start] Conditions met, initializing...");
      setIsQuickStart(true);

      // Size presets with token counts (must match QuickStartGenres.tsx)
      const sizeTokenMap: Record<string, number> = {
        quick: 20000,
        standard: 50000,
        detailed: 100000,
        epic: 200000,
      };
      const outputTokens = sizeTokenMap[size] || 50000;

      // Genre-specific style presets
      const genreStyleMap: Record<string, StylePreset> = {
        fantasy: "default",
        "sci-fi": "cinematic",
        horror: "horror",
        mystery: "default",
        romance: "romantic",
        western: "pulp",
        comedy: "whimsical",
        superheroes: "cinematic",
      };

      // Genre-specific complexity (some genres benefit from more depth)
      const genreComplexityMap: Record<
        string,
        "simple" | "moderate" | "complex"
      > = {
        fantasy: "moderate",
        "sci-fi": "complex", // Sci-fi often has more world-building
        horror: "moderate",
        mystery: "complex", // Mysteries need more intricate plots
        romance: "simple", // Romance focuses on characters, not mechanics
        western: "moderate",
        comedy: "simple", // Comedy works best with lighter mechanics
        superheroes: "moderate", // Balance of action and character development
        "dark fantasy": "complex", // Deep lore and world-building
        historical: "complex", // Historical accuracy needs detail
        pirates: "moderate",
        survival: "moderate",
        "urban fantasy": "moderate",
        steampunk: "complex", // Inventions and world-building
        drama: "simple", // Focus on characters over mechanics
        thriller: "moderate",
        "post-apocalyptic": "complex", // World-building and factions
        noir: "moderate",
      };

      // Genre-specific duration
      const genreDurationMap: Record<string, "short" | "medium" | "long"> = {
        fantasy: "medium",
        "sci-fi": "long",
        horror: "short", // Horror works well as shorter, intense experiences
        mystery: "medium",
        romance: "short",
        western: "medium",
        comedy: "short", // Comedy is best in shorter, punchy adventures
        superheroes: "medium", // Room for origin stories and villain arcs
        "dark fantasy": "long",
        historical: "long",
        pirates: "medium",
        survival: "medium",
        "urban fantasy": "medium",
        steampunk: "medium",
        drama: "short",
        thriller: "medium",
        "post-apocalyptic": "long",
        noir: "medium",
      };

      // Build the prompt
      const genreCapitalized = genre.charAt(0).toUpperCase() + genre.slice(1);
      const finalPrompt = prompt
        ? `${genreCapitalized} adventure: ${prompt}`
        : `Create an engaging ${genre} adventure with compelling characters, intriguing plot hooks, and memorable locations.`;

      // Set up quick start config with genre-appropriate settings
      setConfig({
        prompt: finalPrompt,
        genre: genreCapitalized,
        complexity: (genreComplexityMap[genre] ||
          "moderate") as ComplexityLevel,
        nsfw: false,
        includeAGMT: true,
        includeCustomTables: true,
        includePresets: true,
        includeStartingChoices: true,
        targetDuration: (genreDurationMap[genre] || "medium") as
          | "short"
          | "medium"
          | "long",
        maxOutputTokens: outputTokens,
        stageConfigs: {
          core: {
            ...DEFAULT_STAGE_CONFIGS.core,
            maxOutputTokens: outputTokens,
          },
          mechanics: {
            ...DEFAULT_STAGE_CONFIGS.mechanics,
            maxOutputTokens: outputTokens,
          },
          content: {
            ...DEFAULT_STAGE_CONFIGS.content,
            maxOutputTokens: outputTokens,
          },
          advanced: {
            ...DEFAULT_STAGE_CONFIGS.advanced,
            maxOutputTokens: outputTokens,
          },
        },
        contentIterations: { ...DEFAULT_CONTENT_ITERATIONS },
        temperature: 0.8, // Slightly higher for creativity
        stylePreset: genreStyleMap[genre] || "default",
      });

      // Use the user-selected BYOK model for all stages
      setSelectedModel(model);
      setExtensionModel(model);

      // Enable auto-publish and play for quick start
      setAutoPublishAndPlay(true);

      // Mark as ready to auto-start (will be handled by the auto-start effect)
      // Use a small delay to ensure all state is settled
      setTimeout(() => {
        setQuickStartReady(true);
      }, 100);

      // Clear the URL params without navigation
      window.history.replaceState({}, "", "/creator/generate");
    }
  }, [searchParams, isQuickStart, quickStartReady]);

  // Check if this is a quick start on mount (before other effects run)
  const isQuickStartMount = searchParams.get("quickStart") === "true";

  // Load autosave, config draft, and templates on mount
  useEffect(() => {
    // Only run once - prevent re-running when URL params change
    if (initialLoadDoneRef.current) {
      return;
    }
    initialLoadDoneRef.current = true;

    // Skip loading saved config if this is a quick start - Quick Start effect will set the config
    if (isQuickStartMount) {
      // Still load templates and history, just skip autosave/draft
      setTemplates(loadConfigTemplates());
      setHistory(loadGenerationHistory());
      setSessionId(generateSessionId());
      return;
    }

    const autosave = loadAutosave();
    if (autosave && autosave.completedStages.length > 0) {
      setPendingAutosave(autosave);
      // Calculate time string safely in effect
      const timeAgo = Math.round((Date.now() - autosave.timestamp) / 60000);
      setAutosaveTimeStr(
        timeAgo < 60
          ? `${Math.round(timeAgo)} minutes ago`
          : `${Math.round(timeAgo / 60)} hours ago`,
      );
      setShowAutosaveModal(true);
    } else {
      // Try to load config draft
      const draft = loadConfigDraft();
      if (draft) {
        setConfig(draft);
      }
    }
    // Load templates
    setTemplates(loadConfigTemplates());
    // Load history
    setHistory(loadGenerationHistory());
    // Generate session ID for this session
    setSessionId(generateSessionId());
  }, [isQuickStartMount]);

  // Save config draft when it changes (debounced)
  useEffect(() => {
    const timeout = setTimeout(() => {
      if (config.prompt.trim()) {
        saveConfigDraft(config);
      }
    }, 1000);
    return () => clearTimeout(timeout);
  }, [config]);

  // Sync changes to history when result, images, or tokenCost changes
  useEffect(() => {
    if (!currentHistoryId || !result) return;

    // Debounce updates to avoid too frequent writes
    const timeout = setTimeout(() => {
      updateGenerationHistory(currentHistoryId, {
        title: result.title || "Untitled Adventure",
        result,
        tokenCost,
        thumbnailUrl: thumbnailUrl || undefined,
        bannerUrl: bannerUrl || undefined,
      });
      // Refresh history list
      setHistory(loadGenerationHistory());
    }, 500);

    return () => clearTimeout(timeout);
  }, [currentHistoryId, result, tokenCost, thumbnailUrl, bannerUrl]);

  // Handle autosave resume
  const handleResumeAutosave = useCallback(() => {
    if (!pendingAutosave) return;

    setConfig(pendingAutosave.config);
    setCompletedStages(pendingAutosave.completedStages);
    setPartialResults(pendingAutosave.partialResults);
    setSessionId(pendingAutosave.id);
    setShowAutosaveModal(false);
    setPendingAutosave(null);

    // Check if all stages were completed
    const allStagesCompleted =
      pendingAutosave.completedStages.length >=
      getStagesToRun(pendingAutosave.config).length;

    if (allStagesCompleted) {
      // Reconstruct result from partial results
      if (pendingAutosave.partialResults.title) {
        setResult(pendingAutosave.partialResults as BigAdventureResult);
        addNotification(
          "Progress restored! Your adventure is ready.",
          "success",
        );
      }
    } else {
      // Partial progress - enable resume mode and jump to step 3
      setResumeMode(true);
      setConfigStep(3);
      // Set up stages for display
      setStages(getStagesToRun(pendingAutosave.config));
      addNotification(
        `Progress restored! ${pendingAutosave.completedStages.length} of ${
          getStagesToRun(pendingAutosave.config).length
        } stages completed. Click "Continue Generation" to resume.`,
        "success",
      );
    }
  }, [pendingAutosave, addNotification]);

  // Handle autosave discard
  const handleDiscardAutosave = useCallback(() => {
    clearAutosave();
    setShowAutosaveModal(false);
    setPendingAutosave(null);
    setSessionId(generateSessionId());
  }, []);

  // Handle JSON repair save - when user manually fixes broken JSON output
  const handleRepairSave = useCallback(
    (fixedContent: string, stage: GenerationStage) => {
      try {
        // Parse the fixed content
        const parsedResult = parseBigAdventureStageOutput(fixedContent, stage);

        if (!parsedResult) {
          addNotification(
            "Failed to parse fixed JSON - please check the format",
            "warning",
          );
          return;
        }

        // Merge into partialResults
        setPartialResults((prev) => ({
          ...prev,
          ...parsedResult,
          storyTemplate: {
            ...prev.storyTemplate,
            ...parsedResult.storyTemplate,
          },
        }));

        // Remove from failed stages and add to completed
        setFailedStages((prev) => prev.filter((s) => s !== stage));
        setCompletedStages((prev) => [...prev, stage]);

        // Close the modal and reset state
        setRepairModalOpen(false);
        setRepairStage(null);
        setRepairContent("");
        setRepairError("");

        addNotification(
          `Successfully recovered ${
            getStageInfo(stage).name
          } stage from fixed JSON!`,
          "success",
        );
      } catch (err) {
        addNotification(
          `Error applying fixed JSON: ${
            err instanceof Error ? err.message : "Unknown error"
          }`,
          "warning",
        );
      }
    },
    [addNotification],
  );

  // Get model's max output tokens
  const getModelMaxTokens = useCallback(() => {
    const modelConfig = getModelConfig(selectedModel);
    return modelConfig.maxOutputTokens || 8000;
  }, [selectedModel]);

  // Calculate estimated cost in dollars (BYOK - paid directly to the provider)
  const estimatedCost = useCallback(() => {
    const estimate = estimateBigAdventureCost(config);
    const modelConfig = getModelConfig(selectedModel);

    // Calculate dollar cost from token prices (per million tokens)
    const dollarCost =
      (modelConfig.inputPrice * estimate.inputTokens) / 1000000 +
      (modelConfig.outputPrice * estimate.outputTokens) / 1000000;

    return dollarCost;
  }, [config, selectedModel]);

  // Update config
  const updateConfig = useCallback((updates: Partial<BigAdventureConfig>) => {
    setConfig((prev) => {
      const newConfig = { ...prev, ...updates };

      // When maxOutputTokens changes, also update all per-stage configs
      // This ensures the global slider affects actual generation
      if (updates.maxOutputTokens !== undefined && prev.stageConfigs) {
        const newTokens = updates.maxOutputTokens;
        newConfig.stageConfigs = {
          core: { ...prev.stageConfigs.core, maxOutputTokens: newTokens },
          mechanics: {
            ...prev.stageConfigs.mechanics,
            maxOutputTokens: newTokens,
          },
          content: { ...prev.stageConfigs.content, maxOutputTokens: newTokens },
          advanced: {
            ...prev.stageConfigs.advanced,
            maxOutputTokens: newTokens,
          },
        };
      }

      return newConfig;
    });
  }, []);

  // Clamp max output tokens when model changes
  useEffect(() => {
    const modelMax = getModelMaxTokens();
    if (config.maxOutputTokens > modelMax) {
      updateConfig({ maxOutputTokens: modelMax });
    }
  }, [selectedModel, getModelMaxTokens, config.maxOutputTokens, updateConfig]);

  // Apply a prompt template
  const applyTemplate = useCallback(
    (template: PromptTemplate) => {
      setSelectedTemplate(template);
      updateConfig({
        prompt: template.promptStarter,
        genre: template.genre,
        complexity: template.suggestedComplexity,
        stylePreset: template.suggestedStyle,
      });
    },
    [updateConfig],
  );

  // Update a guided builder answer
  const updateGuidedAnswer = useCallback(
    (questionId: string, answer: string) => {
      setGuidedAnswers((prev) => {
        const newAnswers = { ...prev, [questionId]: answer };
        // Auto-update the prompt as user types
        updateConfig({ prompt: buildPromptFromAnswers(newAnswers) });
        return newAnswers;
      });
    },
    [updateConfig],
  );

  // Finalize the guided prompt
  const finalizeGuidedPrompt = useCallback(() => {
    const finalPrompt = buildPromptFromAnswers(guidedAnswers);
    updateConfig({ prompt: finalPrompt });
  }, [guidedAnswers, updateConfig]);

  // Validation for step 1
  const [validationError, setValidationError] = useState<string | null>(null);

  const validateStep1 = useCallback((): {
    valid: boolean;
    error: string | null;
  } => {
    if (promptMode === "freeform") {
      if (!config.prompt.trim()) {
        return { valid: false, error: "Please enter an adventure concept" };
      }
    } else if (promptMode === "template") {
      if (!selectedTemplate) {
        return { valid: false, error: "Please select a template" };
      }
      if (!config.prompt.trim()) {
        return {
          valid: false,
          error: "Please select a template to generate your prompt",
        };
      }
    } else if (promptMode === "guided") {
      // Check required questions
      const missingRequired = PROMPT_BUILDER_QUESTIONS.filter(
        (q) => q.required && !guidedAnswers[q.id]?.trim(),
      ).map((q) => q.question.replace(/\?$/, ""));

      if (missingRequired.length > 0) {
        return {
          valid: false,
          error: `Please fill in required fields: ${missingRequired
            .slice(0, 2)
            .join(", ")}${
            missingRequired.length > 2
              ? ` (+${missingRequired.length - 2} more)`
              : ""
          }`,
        };
      }

      // Generate prompt from answers if not already done
      const generatedPrompt = buildPromptFromAnswers(guidedAnswers);
      if (!generatedPrompt.trim()) {
        return {
          valid: false,
          error: "Please answer at least the required questions",
        };
      }
    }
    return { valid: true, error: null };
  }, [promptMode, config.prompt, selectedTemplate, guidedAnswers]);

  const handleNextStep = useCallback(() => {
    const validation = validateStep1();
    if (!validation.valid) {
      setValidationError(validation.error);
      addNotification(
        validation.error || "Please fill in required fields",
        "warning",
      );
      return;
    }

    // If in guided mode, finalize the prompt before proceeding
    if (promptMode === "guided") {
      finalizeGuidedPrompt();
    }

    setValidationError(null);
    setConfigStep(2); // Go directly to Features (formerly step 3)
  }, [validateStep1, promptMode, finalizeGuidedPrompt, addNotification]);

  // Check if step 1 can proceed (for button disabled state)
  const canProceedStep1 = useCallback((): boolean => {
    if (promptMode === "freeform") {
      return !!config.prompt.trim();
    } else if (promptMode === "template") {
      return !!selectedTemplate && !!config.prompt.trim();
    } else if (promptMode === "guided") {
      // Check if all required questions are answered
      return PROMPT_BUILDER_QUESTIONS.filter((q) => q.required).every(
        (q) => !!guidedAnswers[q.id]?.trim(),
      );
    }
    return false;
  }, [promptMode, config.prompt, selectedTemplate, guidedAnswers]);

  // Update stage config
  const updateStageConfig = useCallback(
    (stage: LegacyStage, updates: Partial<StageConfig>) => {
      setConfig((prev) => {
        const currentStageConfigs = prev.stageConfigs || {
          ...DEFAULT_STAGE_CONFIGS,
        };
        return {
          ...prev,
          stageConfigs: {
            core: currentStageConfigs.core || DEFAULT_STAGE_CONFIGS.core,
            mechanics:
              currentStageConfigs.mechanics || DEFAULT_STAGE_CONFIGS.mechanics,
            content:
              currentStageConfigs.content || DEFAULT_STAGE_CONFIGS.content,
            advanced:
              currentStageConfigs.advanced || DEFAULT_STAGE_CONFIGS.advanced,
            [stage]: {
              ...(currentStageConfigs[stage] || DEFAULT_STAGE_CONFIGS[stage]),
              ...updates,
            },
          },
        };
      });
    },
    [],
  );

  // Start generation using sequential orchestrator (handles Vercel timeout limits)
  const startGeneration = useCallback(async () => {
    if (!config.prompt.trim()) {
      addNotification("Please enter an adventure prompt", "warning");
      return;
    }

    // Get stages to run
    const stagesToRun = getStagesToRun(config);
    const tasks = stagesToRun.length;

    // In resume mode, preserve existing progress
    const isResuming = resumeMode && completedStages.length > 0;
    const skipStages = isResuming ? completedStages : [];
    const resumedPartialResults = isResuming ? partialResults : {};

    setIsGenerating(true);
    setStages(stagesToRun);
    setTotalTasks(tasks);
    finishEarlyRef.current = false;
    // In resume mode, start from existing progress
    setCompletedTasks(isResuming ? skipStages.length : 0);
    setActiveStages([]);
    setCurrentIteration(0);
    // Don't reset completed stages in resume mode
    if (!isResuming) {
      setCompletedStages([]);
      setPartialResults({});
    }
    setFailedStages([]);
    setLiveContentMap(new Map());
    setResult(null);
    setTokenCost(0);
    // Clear resume mode now that we're generating
    setResumeMode(false);

    // Initialize session
    const currentSessionId = sessionId || generateSessionId();
    if (!sessionId) setSessionId(currentSessionId);

    abortControllerRef.current = new AbortController();

    // Create callbacks for the orchestrator
    const callbacks: GenerationCallbacks = {
      onStageStart: (stage, stageInfo) => {
        // Add to active stages (supports parallel)
        setActiveStages((prev) => [...prev, stage]);
        // Initialize content for this stage
        setLiveContentMap((prev) => {
          const newMap = new Map(prev);
          newMap.set(stage, "");
          return newMap;
        });
        setCurrentIteration(1);
        console.log(`Starting stage: ${stageInfo.name}`);
      },

      onStageContent: (stage, content) => {
        // Append content to the stage's buffer
        setLiveContentMap((prev) => {
          const newMap = new Map(prev);
          const currentContent = prev.get(stage) || "";
          newMap.set(stage, currentContent + content);
          return newMap;
        });
      },

      onStageContinuation: (stage, attempt, maxAttempts) => {
        console.log(`Stage ${stage} continuation: ${attempt}/${maxAttempts}`);
        setLiveContentMap((prev) => {
          const newMap = new Map(prev);
          const currentContent = prev.get(stage) || "";
          newMap.set(
            stage,
            currentContent +
              `\n\n/* Continuing generation (${attempt}/${maxAttempts})... */\n`,
          );
          return newMap;
        });
      },

      onStageComplete: (stage, stageResult, promptTokens, completionTokens) => {
        console.log(`Stage ${stage} complete:`, {
          promptTokens,
          completionTokens,
        });
        setCompletedStages((prev) => [...prev, stage]);
        setCompletedTasks((prev) => prev + 1);
        // Calculate actual dollar cost from tokens (BYOK - informational only)
        const modelConfig = getModelConfig(selectedModel);
        const dollarCost =
          (modelConfig.inputPrice * promptTokens) / 1000000 +
          (modelConfig.outputPrice * completionTokens) / 1000000;
        setTokenCost((prev) => prev + dollarCost);

        if (stageResult) {
          setPartialResults((prev) => ({
            ...prev,
            ...stageResult,
            storyTemplate: {
              ...prev.storyTemplate,
              ...stageResult.storyTemplate,
            },
          }));
        }

        // Preview mode: Show stage preview modal (not for advanced substages)
        if (
          config.previewBetweenStages &&
          getParentStage(stage) !== "advanced"
        ) {
          const isLastStage = stage === stagesToRun[stagesToRun.length - 1];
          if (!isLastStage && stageResult) {
            // Get the content from state for preview
            setLiveContentMap((prev) => {
              const currentLiveContent = prev.get(stage) || "";
              setPreviewStageData({
                stage,
                content: currentLiveContent,
                partialResult: stageResult,
              });
              setShowStagePreview(true);
              return prev;
            });
          }
        }

        // Remove from active stages (keep content in map for viewing)
        setActiveStages((prev) => prev.filter((s) => s !== stage));
      },

      onStageError: (stage, error, canRetry, rawContent) => {
        console.error(`Stage ${stage} error:`, error, {
          canRetry,
          hasRawContent: !!rawContent,
        });
        if (!canRetry) {
          setFailedStages((prev) => [...prev, stage]);
        }

        // If we have raw content, offer to repair it manually
        if (rawContent && rawContent.length > 100) {
          setRepairStage(stage);
          setRepairContent(rawContent);
          setRepairError(error);
          setRepairModalOpen(true);
          addNotification(
            `Stage ${
              getStageInfo(stage).name
            } failed - you can try to fix the JSON manually`,
            "warning",
          );
        } else {
          addNotification(
            canRetry
              ? error
              : `Stage ${getStageInfo(stage).name} failed: ${error}`,
            "warning",
          );
        }
        // Remove from active stages (keep content in map for debugging)
        setActiveStages((prev) => prev.filter((s) => s !== stage));
      },

      onStageWarning: (stage, message) => {
        console.warn(`Stage ${stage} warning:`, message);
        addNotification(message, "warning");
      },

      onProgress: (completed, total) => {
        console.log(`Progress: ${completed.length}/${total} stages`);
      },

      onComplete: (finalResult, tokens) => {
        setResult(finalResult);
        // Clear autosave on successful completion
        clearAutosave();
        // Save to history
        const historyId = saveGenerationToHistory({
          timestamp: Date.now(),
          title: finalResult.title || "Untitled Adventure",
          config,
          result: finalResult,
          tokenCost: tokens.prompt + tokens.completion,
        });
        setCurrentHistoryId(historyId);
        setHistory(loadGenerationHistory());
        addNotification(
          `Adventure generated! Total tokens: ${
            tokens.prompt + tokens.completion
          }`,
          "success",
        );
        setIsGenerating(false);
        setActiveStages([]);
        abortControllerRef.current = null;
      },

      onError: (error) => {
        console.error("Generation error:", error);
        if (error.includes("cancelled")) {
          addNotification(
            "Generation cancelled. Progress has been saved.",
            "warning",
          );
        } else {
          addNotification(error || "Generation failed", "failure");
        }
        setIsGenerating(false);
        setActiveStages([]);
        abortControllerRef.current = null;
      },

      onAutosave: (autosave) => {
        console.log("Autosave updated:", autosave.completedStages);
      },
    };

    // Run the sequential generation (with optional parallel mode for stages 3-8)
    await generateAdventureSequential(
      config,
      {
        model: selectedModel,
        openRouterKey: apiKeys.openRouterKey,
        deepseekKey: apiKeys.deepseekKey,
        sessionId: currentSessionId,
        skipStages: skipStages.length > 0 ? skipStages : undefined,
        existingResults:
          Object.keys(resumedPartialResults).length > 0
            ? resumedPartialResults
            : undefined,
        abortSignal: abortControllerRef.current.signal,
        finishEarlyRef,
        parallelMode,
      },
      callbacks,
    );
  }, [
    config,
    selectedModel,
    addNotification,
    sessionId,
    resumeMode,
    completedStages,
    partialResults,
    apiKeys.openRouterKey,
    apiKeys.deepseekKey,
    parallelMode,
  ]);

  // Auto-start generation when quick start is ready
  useEffect(() => {
    console.log("[Auto-Start Effect] Checking:", {
      quickStartReady,
      isGenerating,
    });
    if (quickStartReady && !isGenerating) {
      console.log("[Auto-Start] All conditions met! Starting generation...");
      setQuickStartReady(false);
      setIsQuickStart(false); // Clear quick start flag once we start
      addNotification(
        `Quick Start: Generating ${config.genre} adventure with ${selectedModel}...`,
        "success",
      );
      // Call startGeneration directly, no delay needed
      console.log("[Auto-Start] Calling startGeneration()...");
      startGeneration();
    }
  }, [
    quickStartReady,
    isGenerating,
    startGeneration,
    addNotification,
    config.genre,
  ]);

  // Cancel generation
  const cancelGeneration = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  }, []);

  // Regenerate a specific section
  const handleRegenerateSection = useCallback(
    async (section: RegenerateSection, customInstructions?: string) => {
      if (!result) return;

      // Add section to regenerating set
      setRegeneratingSections((prev) => new Set(prev).add(section));
      setRegenerationContent("");

      try {
        const response = await creatorStreamFetch("/api/creator/regenerate-section", {
          section,
          config,
          existingResult: result,
          model: extensionModel,
          maxOutputTokens: extensionOutputSize,
          additionalInstructions: customInstructions || undefined,
          openRouterKey: apiKeys.openRouterKey,
          deepseekKey: apiKeys.deepseekKey,
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || "Failed to regenerate section");
        }

        const reader = response.body?.getReader();
        if (!reader) throw new Error("No response stream");

        const decoder = new TextDecoder();
        let buffer = "";
        let fullContent = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const data = line.slice(6);

            try {
              const event = JSON.parse(data);

              if (event.type === "content") {
                fullContent += event.content;
                setRegenerationContent(fullContent);
              } else if (event.type === "done") {
                // Update the result with the regenerated content
                if (event.result) {
                  setResult((prev) => {
                    if (!prev) return prev;
                    const updated = { ...prev };

                    // Merge the regenerated content into the existing result
                    if (event.result.title !== undefined)
                      updated.title = event.result.title;
                    if (event.result.shortDescription !== undefined)
                      updated.shortDescription = event.result.shortDescription;
                    if (event.result.description !== undefined)
                      updated.description = event.result.description;
                    if (event.result.storyTemplate) {
                      updated.storyTemplate = {
                        ...prev.storyTemplate,
                        ...event.result.storyTemplate,
                      };
                    }
                    if (event.result.startingChoices) {
                      updated.startingChoices = event.result.startingChoices;
                    }
                    // Handle icon assignments by merging with existing result
                    if (event.result.iconAssignments) {
                      return mergeBigAdventureResults(updated, {
                        iconAssignments: event.result.iconAssignments,
                      });
                    }

                    return updated;
                  });

                  // Update token cost
                  if (event.meta?.tokenCost) {
                    setTokenCost((prev) => prev + event.meta.tokenCost);
                  }

                  addNotification(
                    `${REGENERATE_SECTIONS[section].name} regenerated!`,
                    "success",
                  );
                }
              } else if (event.type === "error") {
                throw new Error(event.error);
              }
            } catch {
              // Skip invalid JSON
            }
          }
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        addNotification(
          errorMessage || "Failed to regenerate section",
          "failure",
        );
      } finally {
        // Remove section from regenerating set
        setRegeneratingSections((prev) => {
          const newSet = new Set(prev);
          newSet.delete(section);
          return newSet;
        });
        setRegenerationContent("");
      }
    },
    [
      result,
      config,
      addNotification,
      apiKeys.openRouterKey,
      apiKeys.deepseekKey,
      extensionModel,
      extensionOutputSize,
    ],
  );

  // Extend a section (add more content)
  const handleExtendSection = useCallback(
    async (
      section: RegenerateSection,
      maxOutputTokens: number = 4000,
      customInstructions?: string,
    ) => {
      if (!result) return;

      if (!canExtendSection(section)) {
        addNotification(
          `Cannot add more to ${REGENERATE_SECTIONS[section].name}`,
          "warning",
        );
        return;
      }

      // Add section to extending set
      setExtendingSections((prev) => new Set(prev).add(section));
      setExtensionContent("");

      try {
        const response = await creatorStreamFetch("/api/creator/extend-section", {
          section,
          config,
          existingResult: result,
          maxOutputTokens,
          customInstructions: customInstructions || undefined,
          model: extensionModel,
          openRouterKey: apiKeys.openRouterKey,
          deepseekKey: apiKeys.deepseekKey,
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || "Failed to extend section");
        }

        const reader = response.body?.getReader();
        if (!reader) throw new Error("No response stream");

        const decoder = new TextDecoder();
        let buffer = "";
        let fullContent = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const data = line.slice(6);

            try {
              const event = JSON.parse(data);

              if (event.type === "content") {
                fullContent += event.content;
                setExtensionContent(fullContent);
              } else if (event.type === "extend_complete") {
                // Update the result with the extended content
                if (event.result && event.result.storyTemplate) {
                  setResult((prev) => {
                    if (!prev) return prev;
                    const updated = { ...prev };

                    // Merge the extended content into the existing result
                    updated.storyTemplate = {
                      ...prev.storyTemplate,
                      ...event.result.storyTemplate,
                    };

                    return updated;
                  });

                  // Update token cost
                  if (event.tokenCost) {
                    setTokenCost((prev) => prev + event.tokenCost);
                  }

                  addNotification(
                    `Added more ${REGENERATE_SECTIONS[section].name}!`,
                    "success",
                  );
                } else {
                  // Parsing failed - show error to user
                  console.error(
                    "Extend section: Failed to parse result",
                    event.rawContent,
                  );
                  addNotification(
                    `Failed to parse extended ${REGENERATE_SECTIONS[section].name} - check console for details`,
                    "warning",
                  );
                }
              } else if (event.type === "error") {
                throw new Error(event.error);
              }
            } catch {
              // Skip invalid JSON
            }
          }
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        addNotification(errorMessage || "Failed to extend section", "failure");
      } finally {
        // Remove section from extending set
        setExtendingSections((prev) => {
          const newSet = new Set(prev);
          newSet.delete(section);
          return newSet;
        });
        setExtensionContent("");
      }
    },
    [
      result,
      config,
      addNotification,
      apiKeys.openRouterKey,
      apiKeys.deepseekKey,
      extensionModel,
    ],
  );

  // Export adventure as JSON
  const exportAdventure = useCallback(() => {
    if (!result) return;

    const exportData = {
      version: "1.0",
      exportedAt: new Date().toISOString(),
      generatorConfig: config,
      adventure: {
        title: result.title,
        shortDescription: result.shortDescription,
        description: result.description,
        storyTemplate: result.storyTemplate,
        startingChoices: result.startingChoices,
      },
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(result.title || "adventure")
      .toLowerCase()
      .replace(/\s+/g, "-")}-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    addNotification("Adventure exported successfully!", "success");
  }, [result, config, addNotification]);

  // Import adventure from JSON
  const importAdventure = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = JSON.parse(e.target?.result as string);

          // Validate structure
          if (!data.adventure) {
            throw new Error("Invalid adventure file format");
          }

          // Load the adventure as result
          const importedResult: BigAdventureResult = {
            title: data.adventure.title || "Imported Adventure",
            shortDescription: data.adventure.shortDescription || "",
            description: data.adventure.description || "",
            storyTemplate: data.adventure.storyTemplate || {},
            startingChoices: data.adventure.startingChoices,
          };

          setResult(importedResult);

          // Optionally load the config if present
          if (data.generatorConfig) {
            setConfig(data.generatorConfig);
          }

          addNotification("Adventure imported successfully!", "success");
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : "Failed to parse file";
          addNotification(errorMessage, "failure");
        }
      };
      reader.readAsText(file);

      // Reset input
      event.target.value = "";
    },
    [addNotification],
  );

  // Save current config as template
  const handleSaveTemplate = useCallback(() => {
    if (!newTemplateName.trim()) {
      addNotification("Please enter a template name", "warning");
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { prompt, ...configWithoutPrompt } = config;

    const template: ConfigTemplate = {
      id: generateTemplateId(),
      name: newTemplateName.trim(),
      description: newTemplateDescription.trim(),
      createdAt: Date.now(),
      config: configWithoutPrompt,
    };

    saveConfigTemplate(template);
    setTemplates(loadConfigTemplates());
    setShowTemplateModal(false);
    setNewTemplateName("");
    setNewTemplateDescription("");
    addNotification("Template saved!", "success");
  }, [config, newTemplateName, newTemplateDescription, addNotification]);

  // Load a template
  const handleLoadTemplate = useCallback(
    (template: ConfigTemplate) => {
      const currentPrompt = config.prompt;
      setConfig({
        ...template.config,
        prompt: currentPrompt, // Keep current prompt
      });
      addNotification(`Template "${template.name}" loaded!`, "success");
    },
    [config.prompt, addNotification],
  );

  // Delete a template
  const handleDeleteTemplate = useCallback(
    (id: string) => {
      deleteConfigTemplate(id);
      setTemplates(loadConfigTemplates());
      addNotification("Template deleted", "success");
    },
    [addNotification],
  );

  // Load from history
  const handleLoadFromHistory = useCallback(
    (entry: GenerationHistoryEntry) => {
      setConfig(entry.config);
      setResult(entry.result);
      setTokenCost(entry.tokenCost);
      setCurrentHistoryId(entry.id);
      // Restore images if they were saved
      setThumbnailUrl(entry.thumbnailUrl || "");
      setBannerUrl(entry.bannerUrl || "");
      setShowHistoryModal(false);
      addNotification(`Loaded "${entry.title}" from history`, "success");
    },
    [addNotification],
  );

  // Delete history entry
  const handleDeleteHistoryEntry = useCallback(
    (id: string) => {
      deleteHistoryEntry(id);
      setHistory(loadGenerationHistory());
      addNotification("History entry deleted", "success");
    },
    [addNotification],
  );

  // Clear all history
  const handleClearHistory = useCallback(() => {
    if (confirm("Are you sure you want to clear all generation history?")) {
      clearGenerationHistory();
      setHistory([]);
      addNotification("History cleared", "success");
    }
  }, [addNotification]);

  // Generate default image prompt from adventure data
  const getDefaultImagePrompt = useCallback(
    (type: "thumbnail" | "banner") => {
      if (!result) return "";
      const base = `Please create a ${
        type === "thumbnail" ? "cover" : "wide banner"
      } for my text adventure:

${result.title || "Untitled Adventure"}
${result.shortDescription || ""}
${result.description || ""}`;
      return base;
    },
    [result],
  );

  // Initialize prompts when result changes
  useEffect(() => {
    if (result && !thumbnailPrompt) {
      setThumbnailPrompt(getDefaultImagePrompt("thumbnail"));
    }
    if (result && !bannerPrompt) {
      setBannerPrompt(getDefaultImagePrompt("banner"));
    }
  }, [result, thumbnailPrompt, bannerPrompt, getDefaultImagePrompt]);

  // Generate and upload image
  const generateImage = useCallback(
    async (type: "thumbnail" | "banner") => {
      const prompt = type === "thumbnail" ? thumbnailPrompt : bannerPrompt;
      if (!prompt.trim()) {
        addNotification("Please enter a prompt", "warning");
        return;
      }

      // Validate API key for the selected provider
      if (imageProvider === "openrouter" && !apiKeys.openRouterKey) {
        addNotification(
          "OpenRouter API key required. Please add your API key in Settings.",
          "warning",
        );
        return;
      }
      if (imageProvider === "deepinfra" && !apiKeys.deepinfraKey) {
        addNotification(
          "DeepInfra API key required. Please add your API key in Settings.",
          "warning",
        );
        return;
      }

      const setGenerating =
        type === "thumbnail" ? setGeneratingThumbnail : setGeneratingBanner;
      const setUrl = type === "thumbnail" ? setThumbnailUrl : setBannerUrl;

      setGenerating(true);

      try {
        // Call image generation API
        const response = await creatorImageFetch({
          prompt,
          model: imageModel,
          imageType: type,
          provider: imageProvider,
          openRouterKey:
            imageProvider === "openrouter" ? apiKeys.openRouterKey : undefined,
          deepInfraKey:
            imageProvider === "deepinfra" ? apiKeys.deepinfraKey : undefined,
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || "Image generation failed");
        }

        const { imageUrl } = await response.json();

        setUrl(imageUrl);

        addNotification(
          `${type === "thumbnail" ? "Thumbnail" : "Banner"} generated!`,
          "success",
        );
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        addNotification(errorMessage || "Image generation failed", "failure");
      } finally {
        setGenerating(false);
      }
    },
    [
      thumbnailPrompt,
      bannerPrompt,
      imageModel,
      imageProvider,
      addNotification,
      apiKeys.openRouterKey,
      apiKeys.deepinfraKey,
    ],
  );

  // Save adventure
  const saveAdventure = useCallback(async () => {
    if (!result) return;

    setIsSaving(true);

    try {
      const adventure: Partial<Adventure> = {
        title: result.title || "Untitled Adventure",
        description: result.description || "",
        shortDescription: result.shortDescription || "",
        tags: config.genre ? [config.genre] : [],
        difficulty:
          config.complexity === "simple"
            ? "easy"
            : config.complexity === "complex"
              ? "hard"
              : "medium",
        estimatedDuration:
          config.targetDuration === "short"
            ? "1-2 hours"
            : config.targetDuration === "long"
              ? "4-6 hours"
              : "2-4 hours",
        nsfw: config.nsfw,
        storyTemplate: result.storyTemplate,
        startingChoices: result.startingChoices,
        presets: result.storyTemplate?.presets,
        characterSheetTemplate: result.characterSheetTemplate?.template
          ? {
              template: result.characterSheetTemplate.template,
              fields: parseTemplateFields(
                result.characterSheetTemplate.template,
              ),
            }
          : undefined,
        thumbnailUrl: thumbnailUrl || undefined,
        bannerUrl: bannerUrl || undefined,
        isPublished: false,
        isFeatured: false,
        playCount: 0,
        popularity: 0,
      };

      const localId = `local:${Date.now()}_${Math.random()
        .toString(36)
        .substr(2, 9)}`;
      await saveLocalAdventure(localId, adventure);
      addNotification("Adventure saved locally!", "success");

      // Navigate to the creator to edit the adventure
      router.push(`/creator/manual?edit=${localId}`);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      addNotification(errorMessage || "Failed to save adventure", "failure");
    } finally {
      setIsSaving(false);
    }
  }, [result, config, addNotification, router, thumbnailUrl, bannerUrl]);

  // Auto-publish and start playing when quick start generation completes
  useEffect(() => {
    if (!autoPublishAndPlay || !result || isSaving) return;

    const autoPublishAndStartPlaying = async () => {
      setAutoPublishAndPlay(false); // Prevent re-running
      setIsSaving(true);

      try {
        // 1. Save the adventure locally
        const adventure: Partial<Adventure> = {
          title: result.title || "Untitled Adventure",
          description: result.description || "",
          shortDescription: result.shortDescription || "",
          tags: config.genre ? [config.genre] : [],
          difficulty:
            config.complexity === "simple"
              ? "easy"
              : config.complexity === "complex"
                ? "hard"
                : "medium",
          estimatedDuration:
            config.targetDuration === "short"
              ? "1-2 hours"
              : config.targetDuration === "long"
                ? "4-6 hours"
                : "2-4 hours",
          nsfw: config.nsfw,
          storyTemplate: result.storyTemplate,
          startingChoices: result.startingChoices,
          presets: result.storyTemplate?.presets,
          characterSheetTemplate: result.characterSheetTemplate?.template
            ? {
                template: result.characterSheetTemplate.template,
                fields: parseTemplateFields(
                  result.characterSheetTemplate.template,
                ),
              }
            : undefined,
          visibility: "private", // Private by default for quick start
          isPublished: false,
          isFeatured: false,
          playCount: 0,
          popularity: 0,
        };

        addNotification("Saving adventure...", "success");

        const localAdventureId = `local:${Date.now()}_${Math.random()
          .toString(36)
          .substr(2, 9)}`;
        await saveLocalAdventure(localAdventureId, adventure);

        // 2. Create a new local story from the adventure
        addNotification("Starting your adventure...", "success");

        const localStoryId = await startAdventureLocally(adventure);

        addNotification("Adventure ready! Let's play! 🎮", "success");

        // 3. Navigate to the story page
        router.push(`/story?storyId=${localStoryId}`);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        addNotification(errorMessage || "Failed to start adventure", "failure");
        setAutoPublishAndPlay(false);
      } finally {
        setIsSaving(false);
      }
    };

    autoPublishAndStartPlaying();
  }, [autoPublishAndPlay, result, isSaving, config, router, addNotification]);

  // Quick start loading - show while waiting for generation prep
  if (isQuickStart && quickStartReady) {
    return (
      <div className="min-h-screen bg-linear-to-br from-gray-900 via-blue-950 to-purple-950 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <h2 className="text-xl font-bold text-white mb-2">
            Preparing Your Adventure
          </h2>
          <p className="text-blue-300/60">
            Setting up {config.genre} adventure with {selectedModel}...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-linear-to-br from-gray-900 via-blue-950 to-purple-950 text-white">
      {/* Autosave Recovery Modal */}
      {showAutosaveModal && pendingAutosave && (
        <AutosaveRecoveryModal
          autosave={pendingAutosave}
          timeStr={autosaveTimeStr}
          onResume={handleResumeAutosave}
          onDiscard={handleDiscardAutosave}
        />
      )}

      {/* JSON Repair Modal */}
      <JsonRepairModal
        isOpen={repairModalOpen}
        stage={repairStage}
        content={repairContent}
        error={repairError}
        onClose={() => {
          setRepairModalOpen(false);
          setRepairStage(null);
          setRepairContent("");
          setRepairError("");
        }}
        onSave={handleRepairSave}
      />

      {/* Stage Preview Modal */}
      {showStagePreview && previewStageData && (
        <FullScreenView
          title={`${getStageInfo(previewStageData.stage).emoji} Stage Complete: ${getStageInfo(previewStageData.stage).name}`}
          subtitle="Review the generated content before continuing"
          onClose={() => setShowStagePreview(false)}
          headerActions={
            <span className="text-sm text-blue-300/60 whitespace-nowrap">
              {completedStages.length} / {stages.length} stages
            </span>
          }
          footer={
            <div className="flex items-center justify-between p-4">
              <p className="text-xs text-blue-300/50">
                Generation continues in the background. Close to see progress.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowStagePreview(false)}
                  className="px-6 py-2 bg-linear-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white rounded-lg font-medium transition-colors"
                >
                  Continue →
                </button>
              </div>
            </div>
          }
        >
          <div className="max-w-4xl mx-auto">
              {/* Summary of what was generated */}
              {previewStageData.partialResult.storyTemplate && (
                <div className="mb-6">
                  <h4 className="text-sm font-medium text-purple-400 mb-3">
                    Generated in this stage:
                  </h4>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                    {previewStageData.partialResult.storyTemplate.lore &&
                      Array.isArray(
                        previewStageData.partialResult.storyTemplate.lore,
                      ) && (
                        <div className="bg-white/5 rounded px-3 py-2">
                          <span className="text-purple-400 font-bold">
                            {
                              previewStageData.partialResult.storyTemplate.lore
                                .length
                            }
                          </span>
                          <span className="text-blue-300/60 ml-2">Notes</span>
                        </div>
                      )}
                    {previewStageData.partialResult.storyTemplate
                      .relationships &&
                      Array.isArray(
                        previewStageData.partialResult.storyTemplate
                          .relationships,
                      ) && (
                        <div className="bg-white/5 rounded px-3 py-2">
                          <span className="text-pink-400 font-bold">
                            {
                              previewStageData.partialResult.storyTemplate
                                .relationships.length
                            }
                          </span>
                          <span className="text-blue-300/60 ml-2">
                            Relationships
                          </span>
                        </div>
                      )}
                    {previewStageData.partialResult.storyTemplate.goals && (
                      <div className="bg-white/5 rounded px-3 py-2">
                        <span className="text-yellow-400 font-bold">
                          {
                            previewStageData.partialResult.storyTemplate.goals
                              .length
                          }
                        </span>
                        <span className="text-blue-300/60 ml-2">Goals</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Raw output preview */}
              <div>
                <h4 className="text-sm font-medium text-blue-300/60 mb-2">
                  Raw Output:
                </h4>
                <div className="bg-white/[0.03] backdrop-blur-md rounded-lg p-4 border border-white/10 max-h-64 overflow-auto">
                  <pre className="text-sm text-blue-200 whitespace-pre-wrap font-mono">
                    {previewStageData.content.slice(0, 3000)}
                    {previewStageData.content.length > 3000 && (
                      <span className="text-blue-400">
                        ... ({previewStageData.content.length - 3000} more
                        characters)
                      </span>
                    )}
                  </pre>
                </div>
              </div>
            </div>
        </FullScreenView>
      )}

      {/* Save Template Modal */}
      {showTemplateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setShowTemplateModal(false)}
          />
          <div className="relative bg-linear-to-br from-gray-900 via-blue-950 to-purple-950 rounded-xl border border-purple-500/30 max-w-md w-full overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="bg-purple-900/30 border-b border-purple-700/30 px-6 py-4">
              <h3 className="text-lg font-bold text-white">
                Save Config Template
              </h3>
              <p className="text-sm text-blue-300/60 mt-1">
                Save your current settings (excluding prompt) to reuse later
              </p>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm text-blue-300/60 mb-2">
                  Template Name *
                </label>
                <input
                  type="text"
                  value={newTemplateName}
                  onChange={(e) => setNewTemplateName(e.target.value)}
                  placeholder="e.g., High Fantasy Epic"
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-white placeholder-blue-300/50 focus:outline-none focus:border-purple-500/50"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-sm text-blue-300/60 mb-2">
                  Description (optional)
                </label>
                <textarea
                  value={newTemplateDescription}
                  onChange={(e) => setNewTemplateDescription(e.target.value)}
                  placeholder="Brief description of when to use this template..."
                  rows={2}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-white placeholder-blue-300/50 focus:outline-none focus:border-purple-500/50 resize-none"
                />
              </div>

              <div className="text-xs text-blue-300/50 bg-white/5 rounded p-3">
                <p className="font-medium text-blue-300/70 mb-1">
                  This template will save:
                </p>
                <ul className="list-disc list-inside space-y-0.5">
                  <li>Complexity: {config.complexity}</li>
                  <li>All feature toggles & iterations</li>
                  <li>Output token settings</li>
                </ul>
              </div>
            </div>

            <div className="bg-white/[0.03] backdrop-blur-md border-t border-white/10 px-6 py-4 flex gap-3 justify-end">
              <button
                onClick={() => {
                  setShowTemplateModal(false);
                  setNewTemplateName("");
                  setNewTemplateDescription("");
                }}
                className="px-4 py-2 bg-white/5 hover:bg-white/10 text-white rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveTemplate}
                disabled={!newTemplateName.trim()}
                className="px-4 py-2 bg-linear-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 disabled:from-blue-900/40 disabled:to-blue-900/40 disabled:text-blue-300/50 text-white rounded-lg font-medium transition-colors"
              >
                💾 Save Template
              </button>
            </div>
          </div>
        </div>
      )}

      {/* History Modal */}
      {showHistoryModal && (
        <FullScreenView
          title="📜 Generation History"
          subtitle={`Last ${history.length} generations (max 10)`}
          onClose={() => setShowHistoryModal(false)}
          headerActions={
            history.length > 0 ? (
              <button
                onClick={handleClearHistory}
                className="text-xs px-3 py-1.5 bg-red-900/50 hover:bg-red-800/50 text-red-300 rounded transition-colors"
              >
                Clear All
              </button>
            ) : undefined
          }
          footer={
            <div className="flex justify-end p-4">
              <button
                onClick={() => setShowHistoryModal(false)}
                className="px-4 py-2 bg-white/5 hover:bg-white/10 text-white rounded-lg transition-colors"
              >
                Close
              </button>
            </div>
          }
        >
          <div className="max-w-2xl mx-auto">
              {history.length > 0 ? (
                <div className="space-y-3">
                  {history.map((entry) => (
                    <div
                      key={entry.id}
                      className="p-4 bg-white/5 rounded-lg border border-white/10 group hover:border-white/10 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <h4 className="font-medium text-white truncate flex items-center gap-2">
                            {entry.title}
                            {(entry.thumbnailUrl || entry.bannerUrl) && (
                              <span
                                className="text-xs text-green-400"
                                title="Has images"
                              >
                                🖼️
                              </span>
                            )}
                          </h4>
                          <div className="flex flex-wrap gap-2 mt-1 text-xs text-blue-300/50">
                            <span>
                              {new Date(entry.timestamp).toLocaleDateString()}
                            </span>
                            <span>•</span>
                            <span>
                              {new Date(entry.timestamp).toLocaleTimeString()}
                            </span>
                            <span>•</span>
                            <span className="text-amber-400">
                              {entry.tokenCost} tokens
                            </span>
                            <span>•</span>
                            <span>{entry.config.complexity}</span>
                          </div>
                          {entry.config.prompt && (
                            <p className="text-xs text-blue-300/40 mt-2 line-clamp-2">
                              {entry.config.prompt}
                            </p>
                          )}
                        </div>
                        <div className="flex gap-2 shrink-0">
                          <button
                            onClick={() => handleLoadFromHistory(entry)}
                            className="text-xs px-3 py-1.5 bg-purple-600/50 hover:bg-purple-500/50 text-white rounded transition-colors"
                          >
                            Load
                          </button>
                          <button
                            onClick={() => handleDeleteHistoryEntry(entry.id)}
                            className="text-xs px-2 py-1.5 bg-red-900/50 hover:bg-red-800/50 text-red-300 rounded transition-colors opacity-0 group-hover:opacity-100"
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <p className="text-blue-300/50">No generation history yet</p>
                  <p className="text-xs text-blue-300/40 mt-2">
                    Completed generations will appear here
                  </p>
                </div>
              )}
            </div>
        </FullScreenView>
      )}

      {/* Header */}
      <header className="border-b border-white/10 bg-[#0d1829]/90 backdrop-blur-xl backdrop-blur-xl sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/creator"
              className="text-blue-300/60 hover:text-white transition-colors"
            >
              ← Back to Creator
            </Link>
            <div className="h-6 w-px bg-white/10" />
            <h1 className="text-xl font-bold flex items-center gap-2">
              <span className="text-purple-400">✨</span> Big Adventure Creator
            </h1>
          </div>
          <div className="flex items-center gap-4">
            {history.length > 0 && (
              <button
                onClick={() => setShowHistoryModal(true)}
                className="text-sm text-blue-300/60 hover:text-white transition-colors flex items-center gap-1"
              >
                📜 History ({history.length})
              </button>
            )}
            {!isGenerating && !result && (
              <div className="text-sm text-blue-300/60">
                <span className="mr-4">
                  {getTotalGenerationTasks(config)} stages
                </span>
                Estimated cost:{" "}
                <span className="font-medium text-green-400">
                  ~${estimatedCost().toFixed(3)}
                </span>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        {/* Configuration Phase */}
        {!isGenerating && !result && (
          <div className="space-y-8">
            {/* Step 1: Adventure Prompt */}
            <ConfigStep
              step={1}
              currentStep={configStep}
              title="Describe Your Adventure"
            >
              <div className="space-y-4">
                {/* Prompt Mode Selector */}
                <div className="flex gap-2 mb-4">
                  <button
                    onClick={() => {
                      setPromptMode("freeform");
                      setValidationError(null);
                    }}
                    className={`flex-1 px-4 py-2 rounded-lg text-sm transition-colors ${
                      promptMode === "freeform"
                        ? "bg-linear-to-r from-purple-600 to-blue-600 text-white shadow-md shadow-purple-950/40"
                        : "bg-white/5 text-blue-300 hover:bg-white/10"
                    }`}
                  >
                    ✏️ Write Your Own
                  </button>
                  <button
                    onClick={() => {
                      setPromptMode("template");
                      setValidationError(null);
                    }}
                    className={`flex-1 px-4 py-2 rounded-lg text-sm transition-colors ${
                      promptMode === "template"
                        ? "bg-linear-to-r from-purple-600 to-blue-600 text-white shadow-md shadow-purple-950/40"
                        : "bg-white/5 text-blue-300 hover:bg-white/10"
                    }`}
                  >
                    📋 Use Template
                  </button>
                  <button
                    onClick={() => {
                      setPromptMode("guided");
                      setValidationError(null);
                    }}
                    className={`flex-1 px-4 py-2 rounded-lg text-sm transition-colors ${
                      promptMode === "guided"
                        ? "bg-linear-to-r from-purple-600 to-blue-600 text-white shadow-md shadow-purple-950/40"
                        : "bg-white/5 text-blue-300 hover:bg-white/10"
                    }`}
                  >
                    🧭 Guided Builder
                  </button>
                </div>

                {/* Freeform Mode */}
                {promptMode === "freeform" && (
                  <>
                    <div>
                      <label className="block text-sm text-blue-300/60 mb-2">
                        Adventure Concept *
                      </label>
                      <textarea
                        value={config.prompt}
                        onChange={(e) =>
                          updateConfig({ prompt: e.target.value })
                        }
                        placeholder="Describe your adventure concept in detail. For example: 'A dark fantasy adventure where the player is a cursed knight seeking redemption. The world is dying, corrupted by an ancient evil, and only by confronting their own past can the knight hope to save what remains.'"
                        className="w-full h-32 bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-blue-300/50 focus:outline-none focus:border-purple-500/50 focus:bg-white/10 resize-none transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-blue-300/60 mb-2">
                        Genre/Theme (optional)
                      </label>
                      <input
                        type="text"
                        value={config.genre}
                        onChange={(e) =>
                          updateConfig({ genre: e.target.value })
                        }
                        placeholder="e.g., Dark Fantasy, Sci-Fi Horror, Cozy Mystery..."
                        className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-blue-300/50 focus:outline-none focus:border-purple-500/50 focus:bg-white/10 transition-all"
                      />
                    </div>
                  </>
                )}

                {/* Template Mode */}
                {promptMode === "template" && (
                  <div className="space-y-4">
                    <p className="text-sm text-blue-300/60">
                      Choose a template to get started quickly. You can
                      customize after selecting.
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-96 overflow-y-auto pr-2">
                      {PROMPT_TEMPLATES.map((template) => (
                        <button
                          key={template.id}
                          onClick={() => applyTemplate(template)}
                          className={`p-4 rounded-lg border text-left transition-all ${
                            selectedTemplate?.id === template.id
                              ? "bg-purple-900/50 border-purple-500"
                              : "bg-white/5 border-white/10 hover:bg-white/10 hover:border-blue-600/50"
                          }`}
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xl">{template.emoji}</span>
                            <span className="font-medium text-white">
                              {template.name}
                            </span>
                          </div>
                          <div className="text-xs text-blue-300/50 mb-2">
                            {template.genre}
                          </div>
                          <p className="text-sm text-blue-300/70">
                            {template.description}
                          </p>
                        </button>
                      ))}
                    </div>
                    {selectedTemplate && (
                      <div className="p-4 bg-white/5 rounded-lg border border-white/10">
                        <div className="flex justify-between items-start mb-2">
                          <span className="text-sm text-blue-300/60">
                            Generated Prompt:
                          </span>
                          <button
                            onClick={() => setPromptMode("freeform")}
                            className="text-xs text-purple-400 hover:text-purple-300"
                          >
                            Edit →
                          </button>
                        </div>
                        <p className="text-sm text-white/90">{config.prompt}</p>
                        <div className="mt-3 flex gap-2 flex-wrap text-xs">
                          <span className="px-2 py-1 bg-white/10 rounded text-blue-300">
                            System: {selectedTemplate.suggestedSystem}
                          </span>
                          <span className="px-2 py-1 bg-white/10 rounded text-blue-300">
                            Style:{" "}
                            {
                              STYLE_PRESETS[selectedTemplate.suggestedStyle]
                                .name
                            }
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Guided Builder Mode */}
                {promptMode === "guided" && (
                  <div className="space-y-4">
                    <p className="text-sm text-blue-300/60">
                      Answer these questions to build your adventure concept.
                      Required fields are marked with *.
                    </p>
                    {PROMPT_BUILDER_QUESTIONS.map((q) => (
                      <div key={q.id}>
                        <label className="block text-sm text-blue-300/60 mb-2">
                          {q.question}{" "}
                          {q.required && (
                            <span className="text-red-400">*</span>
                          )}
                        </label>
                        <input
                          type="text"
                          value={guidedAnswers[q.id] || ""}
                          onChange={(e) =>
                            updateGuidedAnswer(q.id, e.target.value)
                          }
                          placeholder={q.placeholder}
                          className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-blue-300/50 focus:outline-none focus:border-purple-500/50 focus:bg-white/10 transition-all"
                        />
                      </div>
                    ))}
                    {Object.keys(guidedAnswers).length > 0 && (
                      <div className="p-4 bg-white/5 rounded-lg border border-white/10">
                        <div className="flex justify-between items-start mb-2">
                          <span className="text-sm text-blue-300/60">
                            Generated Prompt Preview:
                          </span>
                          <button
                            onClick={() => {
                              finalizeGuidedPrompt();
                              setPromptMode("freeform");
                            }}
                            className="text-xs text-purple-400 hover:text-purple-300"
                          >
                            Finalize & Edit →
                          </button>
                        </div>
                        <p className="text-sm text-white/90">
                          {buildPromptFromAnswers(guidedAnswers)}
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* Import Options */}
                <div className="flex items-center gap-4 pt-2">
                  <div className="flex-1 h-px bg-white/10" />
                  <span className="text-xs text-blue-300/50">
                    or import from
                  </span>
                  <div className="flex-1 h-px bg-white/10" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* JSON Import */}
                  <div className="text-center p-4 bg-white/[0.03] rounded-lg border border-white/10">
                    <input
                      type="file"
                      accept=".json"
                      onChange={importAdventure}
                      className="hidden"
                      id="import-config-input"
                    />
                    <label
                      htmlFor="import-config-input"
                      className="inline-flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 text-blue-300 rounded-lg transition-colors text-sm cursor-pointer"
                    >
                      📥 Import Adventure JSON
                    </label>
                    <p className="text-xs text-blue-300/40 mt-2">
                      Import a previously exported adventure
                    </p>
                  </div>

                  {/* PDF Import */}
                  <div className="text-center p-4 bg-white/[0.03] rounded-lg border border-white/10">
                    <PDFImporter
                      compact
                      buttonText="📄 Import from PDF"
                      onImportComplete={(result) => {
                        // Store imported content to be merged into final adventure
                        updateConfig({
                          importedLore: [
                            ...(config.importedLore || []),
                            ...(result.lore || []),
                          ],
                          importedMechanicsNotes: [
                            ...(config.importedMechanicsNotes || []),
                            ...(result.mechanicNotes || []),
                          ],
                          importedCustomTables: [
                            ...(config.importedCustomTables || []),
                            ...(result.customTables || []),
                          ],
                        });

                        // Also append a summary to the prompt for AI context
                        const sourceNotes = [
                          result.lore?.length
                            ? `\n\n## World Lore from Source Material:\n${result.lore
                                .map(
                                  (l) =>
                                    `- **${l.title}**: ${l.content.slice(
                                      0,
                                      200,
                                    )}...`,
                                )
                                .join("\n")}`
                            : "",
                          result.mechanicNotes?.length
                            ? `\n\n## Game Mechanics from Source Material:\n${result.mechanicNotes
                                .map(
                                  (n: StoryLore) =>
                                    `- **${n.title}**: ${n.content.slice(
                                      0,
                                      200,
                                    )}...`,
                                )
                                .join("\n")}`
                            : "",
                          result.customTables?.length
                            ? `\n\n## Tables from Source Material:\n${result.customTables
                                .map(
                                  (t: CustomTable) =>
                                    `- **${t.name}**: ${t.entries.length} entries`,
                                )
                                .join("\n")}`
                            : "",
                        ]
                          .filter(Boolean)
                          .join("");

                        if (sourceNotes) {
                          const newPrompt = (config.prompt || "") + sourceNotes;
                          updateConfig({ prompt: newPrompt });
                        }

                        addNotification(
                          `Imported ${result.lore?.length || 0} lore, ${
                            result.mechanicNotes?.length || 0
                          } mechanics, ${
                            result.customTables?.length || 0
                          } tables - will be merged into final adventure`,
                          "success",
                        );
                      }}
                    />
                    <p className="text-xs text-blue-300/40 mt-2">
                      Extract lore & mechanics from RPG PDFs
                    </p>
                    {/* Show imported content counts */}
                    {(config.importedLore?.length || 0) +
                      (config.importedMechanicsNotes?.length || 0) +
                      (config.importedCustomTables?.length || 0) >
                      0 && (
                      <div className="mt-2 text-xs text-green-400 flex flex-col items-center gap-1">
                        <div className="flex items-center gap-2 flex-wrap justify-center">
                          <span>✓ Imported:</span>
                          {(config.importedLore?.length || 0) > 0 && (
                            <span>{config.importedLore?.length} lore</span>
                          )}
                          {(config.importedMechanicsNotes?.length || 0) > 0 && (
                            <span>
                              {config.importedMechanicsNotes?.length} mechanics
                            </span>
                          )}
                          {(config.importedCustomTables?.length || 0) > 0 && (
                            <span>
                              {config.importedCustomTables?.length} tables
                            </span>
                          )}
                        </div>
                        <button
                          onClick={() => {
                            updateConfig({
                              importedLore: [],
                              importedMechanicsNotes: [],
                              importedCustomTables: [],
                            });
                            addNotification(
                              "Cleared all imported content",
                              "success",
                            );
                          }}
                          className="text-red-400 hover:text-red-300 underline text-xs"
                        >
                          Clear imports
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* NSFW Toggle */}
                <div className="pt-2 border-t border-white/10">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={config.nsfw}
                      onChange={(e) => updateConfig({ nsfw: e.target.checked })}
                      className="w-5 h-5 rounded bg-white/5 border-white/10 text-purple-500 focus:ring-purple-500"
                    />
                    <span className="text-white">Allow NSFW Content</span>
                  </label>
                  <p className="text-sm text-blue-300/50 mt-1 ml-8">
                    Enable mature themes, violence, and adult content
                  </p>
                </div>

                <button
                  onClick={handleNextStep}
                  disabled={!canProceedStep1()}
                  className="px-6 py-2 bg-linear-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 disabled:from-blue-900/40 disabled:to-blue-900/40 disabled:text-blue-300/50 text-white rounded-lg transition-colors"
                >
                  Next: Features →
                </button>
                {validationError && promptMode !== "freeform" && (
                  <p className="text-sm text-red-400 mt-2">{validationError}</p>
                )}
              </div>
            </ConfigStep>

            {/* Step 2: Advanced Features */}
            <ConfigStep
              step={2}
              currentStep={configStep}
              title="Advanced Features"
            >
              <div className="space-y-4">
                <p className="text-blue-300/60 mb-4">
                  Select which advanced features to include in your adventure.
                  More features = more content but higher cost.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <label className="flex items-start gap-3 p-4 bg-white/5 rounded-lg cursor-pointer hover:bg-white/5 transition-colors border border-white/10">
                    <input
                      type="checkbox"
                      checked={config.includePresets}
                      onChange={(e) =>
                        updateConfig({ includePresets: e.target.checked })
                      }
                      className="w-5 h-5 mt-0.5 rounded bg-white/5 border-white/10 text-purple-500 focus:ring-purple-500"
                    />
                    <div>
                      <div className="font-medium text-white">
                        🎭 Character Presets
                      </div>
                      <p className="text-sm text-blue-300/60">
                        Multiple character builds/classes to choose from
                      </p>
                    </div>
                  </label>

                  <label className="flex items-start gap-3 p-4 bg-white/5 rounded-lg cursor-pointer hover:bg-white/5 transition-colors border border-white/10">
                    <input
                      type="checkbox"
                      checked={config.includeAGMT}
                      onChange={(e) =>
                        updateConfig({ includeAGMT: e.target.checked })
                      }
                      className="w-5 h-5 mt-0.5 rounded bg-white/5 border-white/10 text-purple-500 focus:ring-purple-500"
                    />
                    <div>
                      <div className="font-medium text-white">
                        🎲 Advanced RPG Tools
                      </div>
                      <p className="text-sm text-blue-300/60">
                        Solo/GM-less play with fate checks and chaos
                      </p>
                    </div>
                  </label>

                  <label className="flex items-start gap-3 p-4 bg-white/5 rounded-lg cursor-pointer hover:bg-white/5 transition-colors border border-white/10">
                    <input
                      type="checkbox"
                      checked={config.includeCustomTables}
                      onChange={(e) =>
                        updateConfig({ includeCustomTables: e.target.checked })
                      }
                      className="w-5 h-5 mt-0.5 rounded bg-white/5 border-white/10 text-purple-500 focus:ring-purple-500"
                    />
                    <div>
                      <div className="font-medium text-white">
                        📋 Custom Tables
                      </div>
                      <p className="text-sm text-blue-300/60">
                        Random encounter, weather, and event tables
                      </p>
                    </div>
                  </label>

                  <label className="flex items-start gap-3 p-4 bg-white/5 rounded-lg cursor-pointer hover:bg-white/5 transition-colors border border-white/10">
                    <input
                      type="checkbox"
                      checked={config.includeStartingChoices}
                      onChange={(e) =>
                        updateConfig({
                          includeStartingChoices: e.target.checked,
                        })
                      }
                      className="w-5 h-5 mt-0.5 rounded bg-white/5 border-white/10 text-purple-500 focus:ring-purple-500"
                    />
                    <div>
                      <div className="font-medium text-white">
                        🚀 Starting Choices
                      </div>
                      <p className="text-sm text-blue-300/60">
                        Multiple ways to begin the adventure
                      </p>
                    </div>
                  </label>
                </div>

                <div className="flex gap-3 pt-4">
                  <button
                    onClick={() => setConfigStep(1)}
                    className="px-6 py-2 bg-white/5 hover:bg-white/10 text-white rounded-lg transition-colors"
                  >
                    ← Back
                  </button>
                  <button
                    onClick={() => setConfigStep(3)}
                    className="px-6 py-2 bg-linear-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white rounded-lg transition-colors"
                  >
                    Next: Fine-tune →
                  </button>
                </div>
              </div>
            </ConfigStep>

            {/* Step 3: Fine-tuning */}
            <ConfigStep
              step={3}
              currentStep={configStep}
              title="Fine-tune Generation"
            >
              <div className="space-y-6">
                {/* AI Model Selection */}
                <div className="bg-white/[0.03] rounded-lg p-4 border border-white/10">
                  <label className="block text-sm text-blue-300/60 mb-2">
                    AI Model (BYOK - Bring Your Own Key)
                  </label>

                  <select
                    value={selectedModel}
                    onChange={(e) => setSelectedModel(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-purple-500/50 transition-all"
                  >
                    {filteredModels.map(([key, model]) => (
                      <option key={key} value={key}>
                        {model.name}
                      </option>
                    ))}
                  </select>

                  {/* Warning if no keys configured */}
                  {!hasAnyBYOKKey && (
                    <div className="mt-2 p-2 bg-red-900/20 border border-red-700/30 rounded-lg">
                      <p className="text-xs text-red-300">
                        ⚠️ No API keys configured. Add keys in Settings (gear
                        icon in header).
                      </p>
                    </div>
                  )}

                </div>

                {/* Config Templates */}
                <div className="bg-purple-900/20 rounded-lg p-4 border border-purple-700/30">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="font-medium text-white">Config Templates</h4>
                    <button
                      onClick={() => setShowTemplateModal(true)}
                      className="text-xs px-3 py-1.5 bg-purple-600/50 hover:bg-purple-500/50 text-white rounded transition-colors"
                    >
                      💾 Save Current
                    </button>
                  </div>

                  {templates.length > 0 ? (
                    <div className="space-y-2">
                      {templates.map((template) => (
                        <div
                          key={template.id}
                          className="flex items-center justify-between p-2 bg-white/5 rounded-lg border border-white/10 group"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-white text-sm truncate">
                              {template.name}
                            </div>
                            {template.description && (
                              <div className="text-xs text-blue-300/50 truncate">
                                {template.description}
                              </div>
                            )}
                          </div>
                          <div className="flex gap-2 ml-3">
                            <button
                              onClick={() => handleLoadTemplate(template)}
                              className="text-xs px-2 py-1 bg-white/10 hover:bg-blue-600/50 text-white rounded transition-colors"
                            >
                              Load
                            </button>
                            <button
                              onClick={() => handleDeleteTemplate(template.id)}
                              className="text-xs px-2 py-1 bg-red-900/50 hover:bg-red-800/50 text-red-300 rounded transition-colors opacity-0 group-hover:opacity-100"
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-blue-300/50">
                      No templates saved yet. Save your current settings to
                      reuse them later.
                    </p>
                  )}
                </div>

                {/* Style & Temperature Controls (Phase 4) */}
                <div className="bg-white/[0.03] rounded-lg p-4 border border-white/10">
                  <h4 className="font-medium text-white mb-3">Writing Style</h4>

                  {/* Style Preset Selector */}
                  <div className="mb-4">
                    <label className="block text-sm text-blue-300/60 mb-2">
                      Narrative Style
                    </label>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                      {(
                        Object.entries(STYLE_PRESETS) as [
                          StylePreset,
                          (typeof STYLE_PRESETS)[StylePreset],
                        ][]
                      ).map(([key, style]) => (
                        <button
                          key={key}
                          onClick={() =>
                            updateConfig({
                              stylePreset: key,
                              temperature: style.temperatureHint,
                            })
                          }
                          className={`p-2 rounded-lg border text-left transition-all ${
                            config.stylePreset === key
                              ? "bg-purple-900/50 border-purple-500"
                              : "bg-white/5 border-white/10 hover:bg-white/10"
                          }`}
                        >
                          <div className="flex items-center gap-1.5">
                            <span>{style.emoji}</span>
                            <span className="text-sm font-medium text-white">
                              {style.name}
                            </span>
                          </div>
                          <p className="text-xs text-blue-300/50 mt-0.5 line-clamp-2">
                            {style.description}
                          </p>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Temperature Slider */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-sm text-blue-300/60">
                        Creativity Level
                      </label>
                      <span className="text-sm font-mono text-purple-400">
                        {(config.temperature ?? 0.7).toFixed(2)}
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0.3}
                      max={1.0}
                      step={0.05}
                      value={config.temperature ?? 0.7}
                      onChange={(e) =>
                        updateConfig({
                          temperature: parseFloat(e.target.value),
                        })
                      }
                      className="w-full h-2 bg-white/5 rounded-lg appearance-none cursor-pointer accent-purple-500"
                    />
                    <div className="flex justify-between text-xs text-blue-300/50 mt-1">
                      <span>🎯 Focused & Consistent</span>
                      <span>🎨 Creative & Varied</span>
                    </div>
                    <p className="text-xs text-blue-300/40 mt-2">
                      Lower values produce more predictable, coherent output.
                      Higher values produce more creative, surprising content.
                    </p>
                  </div>
                </div>

                {/* Basic Output Settings */}
                <div className="bg-white/[0.03] rounded-lg p-4 border border-white/10">
                  <h4 className="font-medium text-white mb-3">
                    Output Settings
                  </h4>

                  <div className="mb-4">
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-sm text-blue-300/60">
                        Max Output Tokens per Task
                      </label>
                      <span className="text-sm font-mono text-purple-400">
                        {Math.min(config.maxOutputTokens, getModelMaxTokens())}{" "}
                        / {getModelMaxTokens()}
                      </span>
                    </div>
                    <input
                      type="range"
                      min={Math.min(500, getModelMaxTokens())}
                      max={getModelMaxTokens()}
                      step={getModelMaxTokens() <= 2000 ? 100 : 500}
                      value={Math.min(
                        config.maxOutputTokens,
                        getModelMaxTokens(),
                      )}
                      onChange={(e) =>
                        updateConfig({
                          maxOutputTokens: parseInt(e.target.value),
                        })
                      }
                      className="w-full h-2 bg-white/5 rounded-lg appearance-none cursor-pointer accent-purple-500"
                    />
                    <p className="text-xs text-blue-300/50 mt-1">
                      Higher values = more detailed content but higher cost.
                      Model max: {getModelMaxTokens()}
                      {getModelMaxTokens() <= 2000 && (
                        <span className="text-amber-400 ml-2">
                          ⚠️ This model has limited output capacity
                        </span>
                      )}
                    </p>
                  </div>
                </div>

                {/* Advanced Toggle */}
                <button
                  onClick={() => setShowAdvancedConfig(!showAdvancedConfig)}
                  className="flex items-center gap-2 text-sm text-purple-400 hover:text-purple-300 transition-colors"
                >
                  <span
                    className={`transition-transform ${
                      showAdvancedConfig ? "rotate-90" : ""
                    }`}
                  >
                    ▶
                  </span>
                  {showAdvancedConfig ? "Hide" : "Show"} Advanced Configuration
                </button>

                {showAdvancedConfig && (
                  <div className="space-y-6 animate-in slide-in-from-top-2">
                    {/* Preview Mode Toggle */}
                    <div className="bg-purple-900/20 rounded-lg p-4 border border-purple-700/30">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="font-medium text-white">
                            Preview Between Stages
                          </h4>
                          <p className="text-xs text-blue-300/50 mt-1">
                            Pause after each stage to review and approve before
                            continuing
                          </p>
                        </div>
                        <button
                          onClick={() =>
                            updateConfig({
                              previewBetweenStages:
                                !config.previewBetweenStages,
                            })
                          }
                          className={`relative w-12 h-6 rounded-full transition-colors ${
                            config.previewBetweenStages
                              ? "bg-linear-to-r from-purple-600 to-blue-600"
                              : "bg-white/5"
                          }`}
                        >
                          <span
                            className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${
                              config.previewBetweenStages
                                ? "translate-x-6"
                                : "translate-x-0"
                            }`}
                          />
                        </button>
                      </div>
                    </div>

                    {/* Parallel Generation Toggle */}
                    <div className="bg-purple-900/20 rounded-lg p-4 border border-purple-700/30">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="font-medium text-white">
                            Parallel Generation ⚡
                          </h4>
                          <p className="text-xs text-blue-300/50 mt-1">
                            Run stages 3-8 simultaneously for faster generation
                          </p>
                        </div>
                        <button
                          onClick={() => setParallelMode(!parallelMode)}
                          className={`relative w-12 h-6 rounded-full transition-colors ${
                            parallelMode ? "bg-linear-to-r from-purple-600 to-blue-600" : "bg-white/5"
                          }`}
                        >
                          <span
                            className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${
                              parallelMode ? "translate-x-6" : "translate-x-0"
                            }`}
                          />
                        </button>
                      </div>
                    </div>

                    {/* Stage Toggles */}
                    <div className="bg-white/[0.03] rounded-lg p-4 border border-white/10">
                      <h4 className="font-medium text-white mb-3">
                        Stage Control
                      </h4>
                      <p className="text-xs text-blue-300/50 mb-3">
                        Disable stages you want to fill in manually
                      </p>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        <StageToggle
                          stage="core"
                          enabled={config.stageConfigs?.core?.enabled ?? true}
                          onToggle={(enabled) =>
                            updateStageConfig("core", { enabled })
                          }
                          disabled={true} // Core is always required
                        />
                        <StageToggle
                          stage="mechanics"
                          enabled={
                            config.stageConfigs?.mechanics?.enabled ?? true
                          }
                          onToggle={(enabled) =>
                            updateStageConfig("mechanics", { enabled })
                          }
                        />
                        <StageToggle
                          stage="content"
                          enabled={
                            config.stageConfigs?.content?.enabled ?? true
                          }
                          onToggle={(enabled) =>
                            updateStageConfig("content", { enabled })
                          }
                        />
                        <StageToggle
                          stage="advanced"
                          enabled={
                            config.stageConfigs?.advanced?.enabled ?? true
                          }
                          onToggle={(enabled) =>
                            updateStageConfig("advanced", { enabled })
                          }
                        />
                      </div>
                    </div>

                    {/* Per-Stage Token Limits */}
                    <div className="bg-white/[0.03] rounded-lg p-4 border border-white/10">
                      <h4 className="font-medium text-white mb-1">
                        Per-Stage Token Limits
                      </h4>
                      <p className="text-xs text-blue-300/50 mb-4">
                        Override output tokens for specific stages
                      </p>
                      <div className="space-y-4">
                        {(
                          [
                            "core",
                            "mechanics",
                            "content",
                            "advanced",
                          ] as LegacyStage[]
                        ).map((stage) => {
                          const stageValue = Math.min(
                            config.stageConfigs?.[stage]?.maxOutputTokens ??
                              config.maxOutputTokens,
                            getModelMaxTokens(),
                          );
                          // Map legacy stage to first substage for getStageInfo
                          // NOTE: "mechanics" maps to "mechanics-notes" (abilities stage is deprecated)
                          const substage: GenerationStage =
                            stage === "content"
                              ? "content-lore"
                              : stage === "advanced"
                                ? "advanced-presets"
                                : stage === "mechanics"
                                  ? "mechanics-notes"
                                  : stage;
                          return (
                            <div
                              key={stage}
                              className="flex items-center gap-4"
                            >
                              <span className="text-sm text-blue-200 w-24">
                                {getStageInfo(substage).name.split(" ")[0]}
                              </span>
                              <input
                                type="range"
                                min={Math.min(500, getModelMaxTokens())}
                                max={getModelMaxTokens()}
                                step={getModelMaxTokens() <= 2000 ? 100 : 500}
                                value={stageValue}
                                onChange={(e) =>
                                  updateStageConfig(stage, {
                                    maxOutputTokens: parseInt(e.target.value),
                                  })
                                }
                                className="flex-1 h-1.5 bg-white/5 rounded-lg appearance-none cursor-pointer accent-purple-500"
                              />
                              <span className="text-sm font-mono text-purple-400 w-16 text-right">
                                {stageValue}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Per-Stage Custom Instructions */}
                    <div className="bg-purple-900/20 rounded-lg p-4 border border-purple-700/30">
                      <h4 className="font-medium text-white mb-1">
                        Per-Stage Custom Instructions
                      </h4>
                      <p className="text-xs text-purple-300/50 mb-4">
                        Give the AI specific guidance for each generation stage.
                        These instructions directly influence what gets created.
                      </p>
                      <div className="space-y-4">
                        {(
                          [
                            "core",
                            "mechanics",
                            "content",
                            "advanced",
                          ] as LegacyStage[]
                        ).map((stage) => {
                          // Map legacy stage to first substage for getStageInfo
                          // NOTE: "mechanics" maps to "mechanics-notes" (abilities stage is deprecated)
                          const substage: GenerationStage =
                            stage === "content"
                              ? "content-lore"
                              : stage === "advanced"
                                ? "advanced-presets"
                                : stage === "mechanics"
                                  ? "mechanics-notes"
                                  : stage;
                          const info = getStageInfo(substage);
                          const legacyNames: Record<LegacyStage, string> = {
                            core: "Core Concept",
                            mechanics: "Mechanics",
                            content: "Content",
                            advanced: "Advanced",
                          };
                          return (
                            <div key={stage} className="space-y-2">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium text-purple-200">
                                  {info.emoji} {legacyNames[stage]}
                                </span>
                                {!config.stageConfigs?.[stage]?.enabled && (
                                  <span className="text-xs text-blue-400/50">
                                    (disabled)
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-blue-300/60 leading-relaxed">
                                {info.detailedDescription}
                              </p>
                              <div className="text-xs text-purple-400/70 flex flex-wrap gap-1">
                                <span className="font-medium">Creates:</span>
                                {info.generates.map((item, i) => (
                                  <span
                                    key={i}
                                    className="bg-purple-900/30 px-1.5 py-0.5 rounded"
                                  >
                                    {item.split(" (")[0]}
                                  </span>
                                ))}
                              </div>
                              <textarea
                                value={
                                  config.stageConfigs?.[stage]
                                    ?.customInstructions ?? ""
                                }
                                onChange={(e) =>
                                  updateStageConfig(stage, {
                                    customInstructions: e.target.value,
                                  })
                                }
                                placeholder={info.instructionHint}
                                rows={2}
                                className="w-full px-3 py-2 bg-white/5 border border-purple-700/30 rounded-lg text-white placeholder-purple-300/40 text-sm resize-none focus:outline-none focus:border-purple-500/50"
                                disabled={
                                  !config.stageConfigs?.[stage]?.enabled
                                }
                              />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}

                {/* Summary */}
                <div className="bg-linear-to-r from-purple-900/30 to-blue-900/30 rounded-lg p-4 border border-purple-500/30">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-blue-200">
                      Generation Summary
                    </span>
                    <span className="text-sm text-purple-400 font-medium">
                      {getTotalGenerationTasks(config)} stages
                    </span>
                  </div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-blue-200">API Calls</span>
                    <span className="text-sm text-blue-300">
                      {getTotalGenerationTasks(config)} min –{" "}
                      {getTotalGenerationTasks(config) * 6} max
                      <span className="text-blue-400/60 ml-1">
                        (up to 5 retries/stage)
                      </span>
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-blue-200">
                      Estimated Cost
                    </span>
                    <span className="text-lg font-bold text-green-400">
                      ~${estimatedCost().toFixed(3)}
                    </span>
                  </div>
                </div>

                {/* Resume Mode Progress Display */}
                {resumeMode && completedStages.length > 0 && (
                  <div className="bg-linear-to-r from-amber-900/30 to-orange-900/30 rounded-lg p-4 border border-amber-500/30">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-amber-400 text-lg">⏸️</span>
                      <h4 className="font-medium text-amber-200">
                        Resumed Progress
                      </h4>
                    </div>
                    <p className="text-sm text-amber-300/70 mb-3">
                      You have {completedStages.length} of {stages.length}{" "}
                      stages completed. Click &quot;Continue Generation&quot; to
                      pick up where you left off, or &quot;Start Fresh&quot; to
                      begin again.
                    </p>
                    <div className="flex flex-wrap gap-2 mb-3">
                      {stages.map((stage) => {
                        const info = getStageInfo(stage);
                        const isCompleted = completedStages.includes(stage);
                        return (
                          <span
                            key={stage}
                            className={`px-2 py-1 rounded text-xs ${
                              isCompleted
                                ? "bg-green-900/40 text-green-300 border border-green-700/30"
                                : "bg-white/5 text-blue-300/60 border border-white/10"
                            }`}
                          >
                            {info.emoji} {info.name} {isCompleted ? "✓" : "○"}
                          </span>
                        );
                      })}
                    </div>
                    <button
                      onClick={() => {
                        setResumeMode(false);
                        setCompletedStages([]);
                        setPartialResults({});
                        clearAutosave();
                        addNotification(
                          "Cleared previous progress. Ready to start fresh.",
                          "success",
                        );
                      }}
                      className="text-xs text-amber-400/70 hover:text-amber-300 underline"
                    >
                      Start Fresh (discard progress)
                    </button>
                  </div>
                )}

                <div className="flex gap-3 pt-4">
                  <button
                    onClick={() => {
                      setConfigStep(2);
                      // Clear resume mode if going back
                      if (resumeMode) {
                        setResumeMode(false);
                        setCompletedStages([]);
                        setPartialResults({});
                      }
                    }}
                    className="px-6 py-2 bg-white/5 hover:bg-white/10 text-white rounded-lg transition-colors"
                  >
                    ← Back
                  </button>
                  <button
                    onClick={startGeneration}
                    disabled={!config.prompt.trim()}
                    className={`flex-1 px-6 py-3 text-white rounded-lg font-medium transition-colors ${
                      resumeMode
                        ? "bg-linear-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 disabled:from-blue-900/40 disabled:to-blue-900/40 disabled:text-blue-300/50"
                        : "bg-linear-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 disabled:from-blue-900/40 disabled:to-blue-900/40 disabled:text-blue-300/50"
                    }`}
                  >
                    {resumeMode
                      ? "🔄 Continue Generation"
                      : "✨ Generate Adventure"}
                  </button>
                </div>
              </div>
            </ConfigStep>
          </div>
        )}

        {/* Generation Phase */}
        {isGenerating && (
          <div className="space-y-6">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold text-white mb-2">
                Generating Your Adventure
              </h2>
              <p className="text-blue-300/60">
                This may take a few minutes. Feel free to grab a coffee! ☕
              </p>
              <div className="mt-4 text-sm text-blue-300/60">
                Progress: {completedTasks} / {totalTasks} stages
                {currentIteration > 1 && activeStages.length > 0 && (
                  <span className="ml-2 text-purple-400">
                    (Iteration {currentIteration})
                  </span>
                )}
                {activeStages.length > 1 && (
                  <span className="ml-2 text-green-400">
                    ({activeStages.length} running in parallel)
                  </span>
                )}
              </div>
              {/* Progress bar */}
              <div className="mt-2 w-full max-w-md mx-auto h-2 bg-white/5 rounded-full overflow-hidden">
                <div
                  className="h-full bg-linear-to-r from-purple-500 to-blue-500 transition-all duration-300"
                  style={{
                    width: `${
                      totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0
                    }%`,
                  }}
                />
              </div>
            </div>

            <StageProgress
              stages={stages}
              activeStages={activeStages}
              completedStages={completedStages}
              failedStages={failedStages}
            />

            <LiveOutput
              stageContents={liveContentMap}
              activeStages={activeStages}
              completedStages={completedStages}
            />

            {/* Content Browser - browse generated content while waiting */}
            <ContentBrowser partialResults={partialResults} />

            <div className="flex justify-center gap-4">
              <button
                onClick={finishStageEarly}
                disabled={activeStages.length !== 1}
                className="px-6 py-2 bg-amber-600 hover:bg-amber-500 disabled:bg-amber-800 disabled:text-amber-400 text-white rounded-lg transition-colors"
                title={
                  activeStages.length > 1
                    ? "Cannot finish early while multiple stages are running in parallel"
                    : activeStages.length === 0
                      ? "No stage is currently generating"
                      : "Tell AI to finish the current stage and move on"
                }
              >
                Finish Stage Early
              </button>
              <button
                onClick={cancelGeneration}
                className="px-6 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg transition-colors"
              >
                Cancel Generation
              </button>
              <p className="text-xs text-blue-300/50 self-center">
                Progress auto-saves after each stage
              </p>
            </div>
          </div>
        )}

        {/* Result Phase */}
        {result && !isGenerating && (
          <div className="space-y-6">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold text-green-400 mb-2">
                ✓ Adventure Generated!
              </h2>
              <p className="text-blue-300/60">
                Total cost: ~${tokenCost.toFixed(3)}
              </p>
            </div>

            {/* Preview */}
            <div className="bg-white/[0.03] backdrop-blur-md rounded-xl p-6 border border-white/10">
              <div className="flex items-start justify-between mb-2">
                <h3 className="text-xl font-bold text-white">
                  {result.title || "Untitled Adventure"}
                </h3>
                <button
                  onClick={() =>
                    handleRegenerateSection("title", extensionInstructions)
                  }
                  disabled={regeneratingSections.has("title")}
                  className="text-xs px-2 py-1 bg-white/10 hover:bg-white/10 disabled:bg-white/5 disabled:text-blue-300/30 text-blue-300 rounded transition-colors"
                  title="Regenerate title & descriptions"
                >
                  {regeneratingSections.has("title") ? "⏳" : "🔄"}
                </button>
              </div>
              <p className="text-blue-300/60 mb-4">{result.shortDescription}</p>

              <div className="prose prose-invert max-w-none">
                <p className="text-blue-200 whitespace-pre-wrap">
                  {result.description}
                </p>
              </div>

              {/* Regenerating overlay */}
              {regeneratingSections.size > 0 && (
                <div className="mt-6 pt-6 border-t border-white/10">
                  <h4 className="text-sm font-medium text-purple-400 mb-3 flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
                    Regenerating{" "}
                    {Array.from(regeneratingSections)
                      .map((s) => REGENERATE_SECTIONS[s].name)
                      .join(", ")}
                    ...
                  </h4>
                  {regenerationContent && (
                    <div className="bg-purple-950/50 rounded-lg p-4 border border-purple-700/30 max-h-64 overflow-auto">
                      <pre className="text-sm text-purple-200 whitespace-pre-wrap font-mono">
                        {regenerationContent}
                      </pre>
                    </div>
                  )}
                </div>
              )}

              {/* Stats Summary with Regenerate Buttons */}
              {result.storyTemplate && (
                <div className="mt-6 pt-6 border-t border-white/10">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-sm font-medium text-blue-300/60">
                      Generated Content Summary
                      <span className="text-xs ml-2 text-blue-400/50">
                        (click to expand | 🔄 regenerate | ➕ add more)
                      </span>
                    </h4>
                    <button
                      onClick={() => {
                        const allSections: RegenerateSection[] = [
                          "mechanicsLore",
                          "lore",
                          "goals",
                          "presets",
                          "variables",
                          "startingChoices",
                          "customTables",
                        ];
                        const allExpanded = allSections.every((s) =>
                          expandedSections.has(s),
                        );
                        if (allExpanded) {
                          setExpandedSections(new Set());
                        } else {
                          setExpandedSections(new Set(allSections));
                        }
                      }}
                      className="text-xs px-2 py-1 bg-white/5 hover:bg-white/10 text-blue-300 rounded transition-all"
                    >
                      {expandedSections.size > 6
                        ? "Collapse All"
                        : "Expand All"}
                    </button>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    {/* Notes */}
                    <ExpandableContentCard
                      section="lore"
                      label="Notes"
                      count={result.storyTemplate.lore?.length || 0}
                      color="purple"
                      items={result.storyTemplate.lore || []}
                      isExpanded={expandedSections.has("lore")}
                      onToggleExpand={() => toggleSectionExpanded("lore")}
                      onRegenerate={() =>
                        handleRegenerateSection("lore", extensionInstructions)
                      }
                      onExtend={() =>
                        handleExtendSection(
                          "lore",
                          extensionOutputSize,
                          extensionInstructions,
                        )
                      }
                      isRegenerating={regeneratingSections.has("lore")}
                      isExtending={extendingSections.has("lore")}
                      renderItem={(item) => {
                        const lore = item as StoryLore;
                        return (
                          <div>
                            <div className="font-medium text-purple-300 truncate">
                              {lore.title}
                            </div>
                            <div className="text-xs text-blue-300/60 line-clamp-2">
                              {lore.content}
                            </div>
                          </div>
                        );
                      }}
                    />

                    {/* Goals */}
                    <ExpandableContentCard
                      section="goals"
                      label="Goals"
                      count={result.storyTemplate.goals?.length || 0}
                      color="yellow"
                      items={result.storyTemplate.goals || []}
                      isExpanded={expandedSections.has("goals")}
                      onToggleExpand={() => toggleSectionExpanded("goals")}
                      onRegenerate={() =>
                        handleRegenerateSection("goals", extensionInstructions)
                      }
                      onExtend={() =>
                        handleExtendSection(
                          "goals",
                          extensionOutputSize,
                          extensionInstructions,
                        )
                      }
                      isRegenerating={regeneratingSections.has("goals")}
                      isExtending={extendingSections.has("goals")}
                      renderItem={(item) => {
                        const goal = item as Goal;
                        return (
                          <div>
                            <div className="font-medium text-yellow-300 truncate">
                              {goal.title}
                            </div>
                            <div className="text-xs text-blue-300/60 line-clamp-2">
                              {goal.shortDescription}
                            </div>
                          </div>
                        );
                      }}
                    />

                    {/* Presets */}
                    <ExpandableContentCard
                      section="presets"
                      label="Presets"
                      count={result.storyTemplate.presets?.length || 0}
                      color="cyan"
                      items={result.storyTemplate.presets || []}
                      isExpanded={expandedSections.has("presets")}
                      onToggleExpand={() => toggleSectionExpanded("presets")}
                      onRegenerate={() =>
                        handleRegenerateSection(
                          "presets",
                          extensionInstructions,
                        )
                      }
                      onExtend={() =>
                        handleExtendSection(
                          "presets",
                          extensionOutputSize,
                          extensionInstructions,
                        )
                      }
                      isRegenerating={regeneratingSections.has("presets")}
                      isExtending={extendingSections.has("presets")}
                      renderItem={(item) => {
                        const preset = item as {
                          name: string;
                          description?: string;
                        };
                        return (
                          <div>
                            <div className="font-medium text-cyan-300 truncate">
                              {preset.name}
                            </div>
                            {preset.description && (
                              <div className="text-xs text-blue-300/60 truncate">
                                {preset.description}
                              </div>
                            )}
                          </div>
                        );
                      }}
                    />

                    {/* Variables */}
                    <ExpandableContentCard
                      section="variables"
                      label="Variables"
                      count={result.storyTemplate.variables?.length || 0}
                      color="indigo"
                      items={result.storyTemplate.variables || []}
                      isExpanded={expandedSections.has("variables")}
                      onToggleExpand={() => toggleSectionExpanded("variables")}
                      onRegenerate={() =>
                        handleRegenerateSection(
                          "variables",
                          extensionInstructions,
                        )
                      }
                      onExtend={() =>
                        handleExtendSection(
                          "variables",
                          extensionOutputSize,
                          extensionInstructions,
                        )
                      }
                      isRegenerating={regeneratingSections.has("variables")}
                      isExtending={extendingSections.has("variables")}
                      renderItem={(item) => {
                        const variable = item as Variable;
                        const getValue = () => {
                          if (variable.type === "list") {
                            return `[${variable.items.length} items]`;
                          }
                          return String(variable.value);
                        };
                        return (
                          <div className="flex items-center gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-indigo-300 truncate">
                                {variable.name}
                              </div>
                              <div className="text-xs text-blue-300/60 truncate">
                                {variable.description}
                              </div>
                            </div>
                            <span className="text-indigo-400 font-mono text-sm">
                              {getValue()}
                            </span>
                          </div>
                        );
                      }}
                    />

                    {/* Starting Choices */}
                    <ExpandableContentCard
                      section="startingChoices"
                      label="Starting Choices"
                      count={result.startingChoices?.length || 0}
                      color="violet"
                      items={result.startingChoices || []}
                      isExpanded={expandedSections.has("startingChoices")}
                      onToggleExpand={() =>
                        toggleSectionExpanded("startingChoices")
                      }
                      onRegenerate={() =>
                        handleRegenerateSection(
                          "startingChoices",
                          extensionInstructions,
                        )
                      }
                      onExtend={() => {}}
                      isRegenerating={regeneratingSections.has(
                        "startingChoices",
                      )}
                      isExtending={false}
                      canExtend={false}
                      renderItem={(item) => {
                        const choice = item as {
                          name: string;
                          description?: string;
                        };
                        return (
                          <div>
                            <div className="font-medium text-violet-300 truncate">
                              {choice.name}
                            </div>
                            {choice.description && (
                              <div className="text-xs text-blue-300/60 truncate">
                                {choice.description}
                              </div>
                            )}
                          </div>
                        );
                      }}
                    />

                    {/* Custom Tables */}
                    {result.storyTemplate.customTables &&
                      result.storyTemplate.customTables.length > 0 && (
                        <ExpandableContentCard
                          section="customTables"
                          label="Custom Tables"
                          count={result.storyTemplate.customTables.length}
                          color="teal"
                          items={result.storyTemplate.customTables}
                          isExpanded={expandedSections.has("customTables")}
                          onToggleExpand={() =>
                            toggleSectionExpanded("customTables")
                          }
                          onRegenerate={() =>
                            handleRegenerateSection(
                              "customTables",
                              extensionInstructions,
                            )
                          }
                          onExtend={() =>
                            handleExtendSection(
                              "customTables",
                              extensionOutputSize,
                              extensionInstructions,
                            )
                          }
                          isRegenerating={regeneratingSections.has(
                            "customTables",
                          )}
                          isExtending={extendingSections.has("customTables")}
                          renderItem={(item) => {
                            const table = item as {
                              name: string;
                              entries?: string[];
                            };
                            return (
                              <div>
                                <div className="font-medium text-teal-300 truncate">
                                  {table.name}
                                </div>
                                <div className="text-xs text-blue-300/60">
                                  {table.entries?.length || 0} entries
                                </div>
                              </div>
                            );
                          }}
                        />
                      )}
                  </div>

                  {/* Extension model selector */}
                  <div className="mt-4">
                    <label className="block text-sm text-blue-300/60 mb-2">
                      Model for Extend/Regenerate (BYOK):
                    </label>

                    <select
                      value={extensionModel}
                      onChange={(e) => {
                        setExtensionModel(e.target.value);
                        // Clamp output size to new model's max
                        const newConfig = getModelConfig(e.target.value);
                        const newMax = Math.min(
                          newConfig.maxOutputTokens || 8000,
                          65000,
                        );
                        if (extensionOutputSize > newMax) {
                          setExtensionOutputSize(newMax);
                        }
                      }}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500/50 transition-all"
                    >
                      {filteredExtensionModels.map(([key, model]) => (
                        <option key={key} value={key}>
                          {model.name} (max{" "}
                          {(model.maxOutputTokens / 1000).toFixed(0)}K output)
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Extension output size selector */}
                  <div className="mt-3 flex items-center gap-3 text-sm text-blue-300/60">
                    <span>Output Size:</span>
                    <div className="flex items-center gap-3 flex-1">
                      <input
                        type="range"
                        min="2000"
                        max={extensionMaxOutput}
                        step="1000"
                        value={Math.min(
                          extensionOutputSize,
                          extensionMaxOutput,
                        )}
                        onChange={(e) =>
                          setExtensionOutputSize(parseInt(e.target.value))
                        }
                        className="flex-1 max-w-48 h-2 bg-white/5 rounded-lg appearance-none cursor-pointer accent-purple-500"
                      />
                      <span className="text-purple-400 font-medium min-w-12 text-center">
                        {(extensionOutputSize / 1000).toFixed(0)}K
                      </span>
                    </div>
                  </div>

                  {/* Estimated cost display */}
                  <div className="mt-2 text-xs text-blue-400/60 flex items-center gap-2">
                    <span>💰 Estimated cost:</span>
                    <span className="font-medium text-green-400">
                      ~$
                      {(
                        (extensionModelConfig.inputPrice * 4000) / 1000000 +
                        (extensionModelConfig.outputPrice *
                          extensionOutputSize) /
                          1000000
                      ).toFixed(4)}
                    </span>
                  </div>

                  {/* Custom instructions for extension */}
                  <div className="mt-3">
                    <input
                      type="text"
                      value={extensionInstructions}
                      onChange={(e) => setExtensionInstructions(e.target.value)}
                      placeholder="Custom instructions (e.g., 'More characters', 'Focus on locations')"
                      className="w-full px-3 py-2 bg-white/[0.03] backdrop-blur-md border border-white/10 rounded-lg text-sm text-blue-100 placeholder-blue-400/40 focus:outline-none focus:border-purple-500/50"
                    />
                  </div>
                </div>
              )}

              {/* Extension progress overlay */}
              {extendingSections.size > 0 && (
                <div className="mt-6 pt-6 border-t border-white/10">
                  <h4 className="text-sm font-medium text-green-400 mb-3 flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
                    Adding more{" "}
                    {Array.from(extendingSections)
                      .map((s) => REGENERATE_SECTIONS[s].name)
                      .join(", ")}
                    ...
                  </h4>
                  {extensionContent && (
                    <div className="bg-green-950/50 rounded-lg p-4 border border-green-700/30 max-h-64 overflow-auto">
                      <pre className="text-sm text-green-200 whitespace-pre-wrap font-mono">
                        {extensionContent}
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Adventure Visualization */}
            <AdventureVisualization result={result} />

            {/* AI Cover Generation */}
            <div className="bg-white/[0.03] backdrop-blur-md rounded-xl p-6 border border-white/10">
              <h4 className="text-lg font-semibold text-blue-200 mb-4 flex items-center gap-2">
                🎨 AI Cover Generation
                <span className="text-xs font-normal text-blue-400/60">
                  (optional)
                </span>
              </h4>

              {/* Provider Toggle */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-blue-300/80 mb-2">
                  Image Provider
                </label>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setImageProvider("deepinfra");
                      setImageModel("Bria 3.2"); // Default DeepInfra model
                    }}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      imageProvider === "deepinfra"
                        ? "bg-linear-to-r from-purple-600 to-blue-600 text-white shadow-md shadow-purple-950/40"
                        : "bg-white/5 text-blue-300 hover:bg-white/10"
                    }`}
                  >
                    🪙 DeepInfra (Coins)
                  </button>
                  <button
                    onClick={() => {
                      setImageProvider("openrouter");
                      setImageModel("Nano Banana"); // Default OpenRouter model
                    }}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      imageProvider === "openrouter"
                        ? "bg-linear-to-r from-purple-600 to-blue-600 text-white shadow-md shadow-purple-950/40"
                        : "bg-white/5 text-blue-300 hover:bg-white/10"
                    }`}
                  >
                    🔑 OpenRouter (BYOK)
                  </button>
                </div>
                <p className="text-xs text-blue-400/60 mt-1">
                  {imageProvider === "deepinfra"
                    ? "Uses coins. Bria 3.2 is FREE!"
                    : "Requires OpenRouter API key"}
                </p>
              </div>

              {/* Model Selection */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-blue-300/80 mb-2">
                  Image Model
                </label>
                <select
                  value={imageModel}
                  onChange={(e) =>
                    setImageModel(
                      e.target.value as ImageModelKey | DeepInfraImageModelKey,
                    )
                  }
                  className="w-full md:w-auto px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:border-purple-500 focus:ring-1 focus:ring-purple-500 focus:outline-none"
                >
                  {imageProvider === "deepinfra"
                    ? Object.entries(DEEPINFRA_IMAGE_MODELS).map(
                        ([key, model]) => (
                          <option key={key} value={key}>
                            {key}{" "}
                            {model.cost > 0
                              ? `(~${model.cost} coins)`
                              : "(FREE)"}
                          </option>
                        ),
                      )
                    : Object.entries(OPENROUTER_IMAGE_MODELS).map(([key]) => (
                        <option key={key} value={key}>
                          {key} (~{estimateImageCost(key)} coins)
                        </option>
                      ))}
                </select>
                {imageProvider === "deepinfra" && (
                  <p className="text-xs text-blue-400/60 mt-1">
                    {DEEPINFRA_IMAGE_MODELS[
                      imageModel as DeepInfraImageModelKey
                    ]?.description || ""}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Thumbnail Generation */}
                <div className="bg-white/5 rounded-lg p-4 border border-white/10">
                  <div className="flex items-center justify-between mb-3">
                    <h5 className="text-sm font-semibold text-blue-200">
                      📷 Thumbnail
                    </h5>
                    <span className="text-xs text-blue-400/60">
                      400×300px (4:3)
                    </span>
                  </div>

                  {thumbnailUrl ? (
                    <div className="relative mb-4">
                      <img
                        src={thumbnailUrl}
                        alt="Thumbnail preview"
                        className="w-full h-32 object-cover rounded-lg border border-white/10"
                      />
                      <button
                        onClick={() => setThumbnailUrl("")}
                        className="absolute -top-2 -right-2 w-6 h-6 bg-red-600 hover:bg-red-700 text-white rounded-full flex items-center justify-center text-xs font-bold"
                      >
                        ✕
                      </button>
                    </div>
                  ) : (
                    <div className="w-full h-32 bg-white/[0.03] backdrop-blur-md rounded-lg border border-dashed border-white/10 flex items-center justify-center mb-4">
                      <span className="text-blue-400/40 text-sm">
                        No thumbnail yet
                      </span>
                    </div>
                  )}

                  {showThumbnailPromptEditor ? (
                    <div className="space-y-2 mb-3">
                      <textarea
                        value={thumbnailPrompt}
                        onChange={(e) => setThumbnailPrompt(e.target.value)}
                        rows={4}
                        className="w-full px-3 py-2 bg-white/[0.03] backdrop-blur-md border border-white/10 rounded-lg text-white text-sm resize-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 focus:outline-none"
                        placeholder="Describe your cover image..."
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => setShowThumbnailPromptEditor(false)}
                          className="text-xs px-3 py-1.5 bg-white/10 hover:bg-white/10 text-blue-300 rounded transition-colors"
                        >
                          Done
                        </button>
                        <button
                          onClick={() =>
                            setThumbnailPrompt(
                              getDefaultImagePrompt("thumbnail"),
                            )
                          }
                          className="text-xs px-3 py-1.5 bg-white/10 hover:bg-white/10 text-blue-300 rounded transition-colors"
                        >
                          Reset
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => setShowThumbnailPromptEditor(true)}
                      className="text-xs text-blue-400 hover:text-blue-300 mb-3 flex items-center gap-1"
                    >
                      ✏️ Edit prompt
                    </button>
                  )}

                  <button
                    onClick={() => generateImage("thumbnail")}
                    disabled={generatingThumbnail || !thumbnailPrompt.trim()}
                    className="w-full px-4 py-2.5 bg-linear-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 disabled:from-white/5 disabled:to-white/5 disabled:text-blue-300/50 text-white rounded-lg font-medium shadow-md shadow-purple-950/40 transition-all text-sm flex items-center justify-center gap-2"
                  >
                    {generatingThumbnail ? (
                      <>
                        <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                        Generating...
                      </>
                    ) : (
                      <>
                        🎨 Generate Thumbnail
                        <span className="text-purple-300/70">
                          (~{estimateImageCost(imageModel)} coins)
                        </span>
                      </>
                    )}
                  </button>
                </div>

                {/* Banner Generation */}
                <div className="bg-white/5 rounded-lg p-4 border border-white/10">
                  <div className="flex items-center justify-between mb-3">
                    <h5 className="text-sm font-semibold text-blue-200">
                      🖼️ Banner
                    </h5>
                    <span className="text-xs text-blue-400/60">
                      1200×400px (3:1)
                    </span>
                  </div>

                  {bannerUrl ? (
                    <div className="relative mb-4">
                      <img
                        src={bannerUrl}
                        alt="Banner preview"
                        className="w-full h-32 object-cover rounded-lg border border-white/10"
                      />
                      <button
                        onClick={() => setBannerUrl("")}
                        className="absolute -top-2 -right-2 w-6 h-6 bg-red-600 hover:bg-red-700 text-white rounded-full flex items-center justify-center text-xs font-bold"
                      >
                        ✕
                      </button>
                    </div>
                  ) : (
                    <div className="w-full h-32 bg-white/[0.03] backdrop-blur-md rounded-lg border border-dashed border-white/10 flex items-center justify-center mb-4">
                      <span className="text-blue-400/40 text-sm">
                        No banner yet
                      </span>
                    </div>
                  )}

                  {showBannerPromptEditor ? (
                    <div className="space-y-2 mb-3">
                      <textarea
                        value={bannerPrompt}
                        onChange={(e) => setBannerPrompt(e.target.value)}
                        rows={4}
                        className="w-full px-3 py-2 bg-white/[0.03] backdrop-blur-md border border-white/10 rounded-lg text-white text-sm resize-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 focus:outline-none"
                        placeholder="Describe your banner image..."
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => setShowBannerPromptEditor(false)}
                          className="text-xs px-3 py-1.5 bg-white/10 hover:bg-white/10 text-blue-300 rounded transition-colors"
                        >
                          Done
                        </button>
                        <button
                          onClick={() =>
                            setBannerPrompt(getDefaultImagePrompt("banner"))
                          }
                          className="text-xs px-3 py-1.5 bg-white/10 hover:bg-white/10 text-blue-300 rounded transition-colors"
                        >
                          Reset
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => setShowBannerPromptEditor(true)}
                      className="text-xs text-blue-400 hover:text-blue-300 mb-3 flex items-center gap-1"
                    >
                      ✏️ Edit prompt
                    </button>
                  )}

                  <button
                    onClick={() => generateImage("banner")}
                    disabled={generatingBanner || !bannerPrompt.trim()}
                    className="w-full px-4 py-2.5 bg-linear-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 disabled:from-white/5 disabled:to-white/5 disabled:text-blue-300/50 text-white rounded-lg font-medium shadow-md shadow-purple-950/40 transition-all text-sm flex items-center justify-center gap-2"
                  >
                    {generatingBanner ? (
                      <>
                        <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                        Generating...
                      </>
                    ) : (
                      <>
                        🎨 Generate Banner
                        <span className="text-purple-300/70">
                          (~{estimateImageCost(imageModel)} coins)
                        </span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-wrap gap-3 justify-center">
              {/* Hidden file input for import */}
              <input
                type="file"
                accept=".json"
                onChange={importAdventure}
                className="hidden"
                id="import-adventure-input"
              />

              <button
                onClick={() => {
                  setResult(null);
                  setCompletedStages([]);
                  setFailedStages([]);
                  setPartialResults({});
                  setConfigStep(1);
                  clearAutosave();
                  setSessionId(generateSessionId());
                }}
                className="px-4 py-2.5 bg-white/5 hover:bg-white/10 text-white rounded-lg transition-colors text-sm"
              >
                Start Over
              </button>

              <button
                onClick={() =>
                  handleRegenerateSection("icons", extensionInstructions)
                }
                disabled={regeneratingSections.has("icons")}
                className="px-4 py-2.5 bg-white/5 hover:bg-white/10 disabled:bg-white/[0.03] disabled:text-blue-300/50 text-white rounded-lg transition-colors text-sm flex items-center gap-2"
              >
                {regeneratingSections.has("icons") ? (
                  <>
                    <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    Regenerating...
                  </>
                ) : (
                  <>🎨 Regenerate Icons</>
                )}
              </button>

              <button
                onClick={exportAdventure}
                className="px-4 py-2.5 bg-white/5 hover:bg-white/10 text-white rounded-lg transition-colors text-sm flex items-center gap-2"
              >
                📤 Export JSON
              </button>

              <label
                htmlFor="import-adventure-input"
                className="px-4 py-2.5 bg-white/5 hover:bg-white/10 text-white rounded-lg transition-colors text-sm flex items-center gap-2 cursor-pointer"
              >
                📥 Import JSON
              </label>

              <button
                onClick={saveAdventure}
                disabled={isSaving}
                className="px-6 py-2.5 bg-linear-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 disabled:from-blue-900/40 disabled:to-blue-900/40 disabled:text-blue-300/50 text-white rounded-lg font-medium transition-colors flex items-center gap-2 text-sm"
              >
                {isSaving ? (
                  <>
                    <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>💾 Save & Edit in Creator</>
                )}
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

// Wrap with Suspense for useSearchParams
export default function BigAdventureCreatorPageWrapper() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-linear-to-br from-gray-900 via-blue-950 to-purple-950 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <BigAdventureCreatorPage />
    </Suspense>
  );
}
