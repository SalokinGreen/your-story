"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/app/misc/AuthContext";
import { useNotification } from "@/app/misc/NotificationContext";
import { getAuthToken } from "@/app/misc/getAuthToken";
import {
  BigAdventureConfig,
  RPGSystemType,
  ComplexityLevel,
  GenerationStage,
  StageConfig,
  ContentIterationConfig,
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
  PromptBuilderQuestion,
  PROMPT_BUILDER_QUESTIONS,
  buildPromptFromAnswers,
  canExtendSection,
  EXTENDABLE_SECTIONS,
  getStageInfo,
  getStagesToRun,
  estimateBigAdventureCost,
  getTotalGenerationTasks,
  DEFAULT_STAGE_CONFIGS,
  DEFAULT_CONTENT_ITERATIONS,
  generateSessionId,
  saveAutosave,
  loadAutosave,
  clearAutosave,
  saveConfigDraft,
  loadConfigDraft,
  saveConfigTemplate,
  loadConfigTemplates,
  deleteConfigTemplate,
  generateTemplateId,
  saveGenerationToHistory,
  loadGenerationHistory,
  deleteHistoryEntry,
  clearGenerationHistory,
} from "@/app/misc/big_adventure_ai";
import {
  AI_MODELS,
  calculateTokenCost,
  getModelConfig,
} from "@/app/misc/ai_prices";
import {
  Adventure,
  Stat,
  Resource,
  Ability,
  InventoryItem,
  Achievement,
  StoryLore,
  Quest,
  Relationship,
  PlotBeat,
  Variable,
} from "@/app/misc/structs";
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
      <div className="bg-blue-950 border border-blue-700/50 rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-full bg-amber-500/20 flex items-center justify-center">
            <span className="text-2xl">💾</span>
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">Recover Progress?</h3>
            <p className="text-sm text-blue-300/60">Saved {timeStr}</p>
          </div>
        </div>

        <div className="bg-blue-900/30 rounded-lg p-4 mb-4 border border-blue-700/30">
          <p className="text-sm text-blue-200 mb-2">
            <span className="text-blue-300/60">Prompt:</span>{" "}
            {autosave.config.prompt.slice(0, 100)}
            {autosave.config.prompt.length > 100 ? "..." : ""}
          </p>
          <p className="text-sm text-blue-200">
            <span className="text-blue-300/60">Completed:</span>{" "}
            {autosave.completedStages.length} of 4 stages
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
            className="flex-1 px-4 py-2 bg-blue-900/40 hover:bg-blue-800/50 text-white rounded-lg transition-colors"
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

// Iteration Slider Component
function IterationSlider({
  label,
  value,
  onChange,
  min = 1,
  max = 5,
  description,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  description?: string;
}) {
  // Use local state to handle dragging smoothly
  const [localValue, setLocalValue] = useState(value);
  const [isDragging, setIsDragging] = useState(false);

  // Sync with external value when not dragging
  useEffect(() => {
    if (!isDragging) {
      setLocalValue(value);
    }
  }, [value, isDragging]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = parseInt(e.target.value);
    setLocalValue(newValue);
    // Call onChange immediately for responsive feedback
    onChange(newValue);
  };

  const handleMouseDown = () => {
    setIsDragging(true);
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    // Ensure final value is committed
    onChange(localValue);
  };

  return (
    <div className="flex items-center gap-4">
      <div className="flex-1">
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm text-blue-200">{label}</span>
          <span className="text-sm font-mono text-purple-400">{localValue}x</span>
        </div>
        <input
          type="range"
          min={min}
          max={max}
          value={localValue}
          onChange={handleChange}
          onMouseDown={handleMouseDown}
          onMouseUp={handleMouseUp}
          onTouchStart={handleMouseDown}
          onTouchEnd={handleMouseUp}
          className="w-full h-1.5 bg-blue-900/40 rounded-lg appearance-none cursor-pointer accent-purple-500"
        />
        {description && (
          <p className="text-xs text-blue-300/50 mt-1">{description}</p>
        )}
      </div>
    </div>
  );
}

// Stage Toggle Component
function StageToggle({
  stage,
  enabled,
  onToggle,
  disabled = false,
}: {
  stage: GenerationStage;
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  disabled?: boolean;
}) {
  const info = getStageInfo(stage);

  return (
    <label
      className={`flex items-center gap-3 p-3 rounded-lg transition-all cursor-pointer ${
        disabled ? "opacity-50 cursor-not-allowed" : "hover:bg-blue-900/30"
      } ${enabled ? "bg-blue-900/20" : ""}`}
    >
      <input
        type="checkbox"
        checked={enabled}
        onChange={(e) => !disabled && onToggle(e.target.checked)}
        disabled={disabled}
        className="w-4 h-4 rounded bg-blue-900/50 border-blue-700/50 text-purple-500 focus:ring-purple-500"
      />
      <div className="flex-1">
        <span className="text-sm font-medium text-white">{info.name}</span>
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
              : "bg-blue-900/50 text-blue-300/50"
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
  currentStage,
  completedStages,
  failedStages,
}: {
  stages: GenerationStage[];
  currentStage: GenerationStage | null;
  completedStages: GenerationStage[];
  failedStages: GenerationStage[];
}) {
  return (
    <div className="space-y-3">
      {stages.map((stage) => {
        const info = getStageInfo(stage);
        const isComplete = completedStages.includes(stage);
        const isFailed = failedStages.includes(stage);
        const isActive = currentStage === stage;

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
                : "bg-blue-900/30 border border-blue-700/30"
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
                  : "bg-blue-900/50 text-blue-300/50"
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

// Live Output Component
function LiveOutput({
  content,
  stage,
}: {
  content: string;
  stage: GenerationStage | null;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [content]);

  if (!content) return null;

  return (
    <div className="mt-4">
      <div className="text-sm text-blue-300/60 mb-2">
        Live Output {stage && `(${getStageInfo(stage).name})`}
      </div>
      <div
        ref={scrollRef}
        className="bg-blue-950/50 rounded-lg p-4 h-48 overflow-y-auto font-mono text-sm text-blue-200 whitespace-pre-wrap border border-blue-700/30"
      >
        {content}
      </div>
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
      bg: "bg-blue-800/50",
      hover: "hover:bg-blue-700/50",
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
      className={`bg-blue-900/50 rounded-lg border border-blue-700/30 overflow-hidden transition-all ${
        isExpanded ? "col-span-2 md:col-span-4" : ""
      }`}
    >
      {/* Header - always visible */}
      <div
        className="p-3 group relative cursor-pointer hover:bg-blue-800/30 transition-all"
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
            } disabled:bg-blue-900/30 ${colorClass.text.replace(
              "400",
              "300"
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
              className="text-xs px-1.5 py-0.5 bg-green-800/50 hover:bg-green-700/50 disabled:bg-blue-900/30 text-green-300 rounded transition-all"
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
        <div className="border-t border-blue-700/30 p-3 max-h-64 overflow-y-auto">
          <div className="space-y-2">
            {items.map((item, index) => (
              <div
                key={index}
                className="bg-blue-950/50 rounded-lg p-2 border border-blue-800/30"
              >
                {renderItem(item, index)}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state when expanded */}
      {isExpanded && items.length === 0 && (
        <div className="border-t border-blue-700/30 p-4 text-center text-blue-400/50 text-sm">
          No {label.toLowerCase()} generated yet
        </div>
      )}
    </div>
  );
}

export default function BigAdventureCreatorPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { addNotification } = useNotification();

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
    rpgSystem: "1d20",
    complexity: "moderate",
    nsfw: false,
    includeMythic: false,
    includeUpgradeShop: true,
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
  const [selectedModel, setSelectedModel] = useState("Deepseek Chat");
  const [showAdvancedConfig, setShowAdvancedConfig] = useState(false);

  // Generation state
  const [isGenerating, setIsGenerating] = useState(false);
  const [stages, setStages] = useState<GenerationStage[]>([]);
  const [currentStage, setCurrentStage] = useState<GenerationStage | null>(
    null
  );
  const [currentIteration, setCurrentIteration] = useState(0);
  const [totalTasks, setTotalTasks] = useState(0);
  const [completedTasks, setCompletedTasks] = useState(0);
  const [completedStages, setCompletedStages] = useState<GenerationStage[]>([]);
  const [failedStages, setFailedStages] = useState<GenerationStage[]>([]);
  const [liveContent, setLiveContent] = useState("");
  const [result, setResult] = useState<BigAdventureResult | null>(null);
  // partialResults is used for autosave recovery and intermediate state
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [partialResults, setPartialResults] = useState<
    Partial<BigAdventureResult>
  >({});
  const [tokenCost, setTokenCost] = useState(0);
  const [isSaving, setIsSaving] = useState(false);

  // Regeneration state
  const [regeneratingSection, setRegeneratingSection] =
    useState<RegenerateSection | null>(null);
  const [regenerationContent, setRegenerationContent] = useState("");

  // Extension state (Add More)
  const [extendingSection, setExtendingSection] =
    useState<RegenerateSection | null>(null);
  const [extensionContent, setExtensionContent] = useState("");
  const [extensionCount, setExtensionCount] = useState(3);

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
    {}
  );

  // Abort controller for cancellation
  const abortControllerRef = useRef<AbortController | null>(null);

  // Load autosave, config draft, and templates on mount
  useEffect(() => {
    const autosave = loadAutosave();
    if (autosave && autosave.completedStages.length > 0) {
      setPendingAutosave(autosave);
      // Calculate time string safely in effect
      const timeAgo = Math.round((Date.now() - autosave.timestamp) / 60000);
      setAutosaveTimeStr(
        timeAgo < 60
          ? `${Math.round(timeAgo)} minutes ago`
          : `${Math.round(timeAgo / 60)} hours ago`
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
  }, []);

  // Save config draft when it changes (debounced)
  useEffect(() => {
    const timeout = setTimeout(() => {
      if (config.prompt.trim()) {
        saveConfigDraft(config);
      }
    }, 1000);
    return () => clearTimeout(timeout);
  }, [config]);

  // Handle autosave resume
  const handleResumeAutosave = useCallback(() => {
    if (!pendingAutosave) return;

    setConfig(pendingAutosave.config);
    setCompletedStages(pendingAutosave.completedStages);
    setPartialResults(pendingAutosave.partialResults);
    setSessionId(pendingAutosave.id);
    setShowAutosaveModal(false);
    setPendingAutosave(null);

    // Jump to results if all stages were completed
    if (
      pendingAutosave.completedStages.length >=
      getStagesToRun(pendingAutosave.config).length
    ) {
      // Reconstruct result from partial results
      if (pendingAutosave.partialResults.title) {
        setResult(pendingAutosave.partialResults as BigAdventureResult);
      }
    }

    addNotification(
      "Progress restored! You can continue generating.",
      "success"
    );
  }, [pendingAutosave, addNotification]);

  // Handle autosave discard
  const handleDiscardAutosave = useCallback(() => {
    clearAutosave();
    setShowAutosaveModal(false);
    setPendingAutosave(null);
    setSessionId(generateSessionId());
  }, []);

  // Get model's max output tokens
  const getModelMaxTokens = useCallback(() => {
    const modelConfig = getModelConfig(selectedModel);
    return modelConfig.maxOutputTokens || 8000;
  }, [selectedModel]);

  // Calculate estimated cost
  const estimatedCost = useCallback(() => {
    const estimate = estimateBigAdventureCost(config);
    return calculateTokenCost(
      selectedModel,
      estimate.inputTokens,
      estimate.outputTokens
    );
  }, [config, selectedModel]);

  // Update config
  const updateConfig = useCallback((updates: Partial<BigAdventureConfig>) => {
    setConfig((prev) => ({ ...prev, ...updates }));
  }, []);

  // Apply a prompt template
  const applyTemplate = useCallback(
    (template: PromptTemplate) => {
      setSelectedTemplate(template);
      updateConfig({
        prompt: template.promptStarter,
        genre: template.genre,
        rpgSystem: template.suggestedSystem,
        complexity: template.suggestedComplexity,
        stylePreset: template.suggestedStyle,
      });
    },
    [updateConfig]
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
    [updateConfig]
  );

  // Finalize the guided prompt
  const finalizeGuidedPrompt = useCallback(() => {
    const finalPrompt = buildPromptFromAnswers(guidedAnswers);
    updateConfig({ prompt: finalPrompt });
  }, [guidedAnswers, updateConfig]);

  // Validation for step 1
  const [validationError, setValidationError] = useState<string | null>(null);
  
  const validateStep1 = useCallback((): { valid: boolean; error: string | null } => {
    if (promptMode === "freeform") {
      if (!config.prompt.trim()) {
        return { valid: false, error: "Please enter an adventure concept" };
      }
    } else if (promptMode === "template") {
      if (!selectedTemplate) {
        return { valid: false, error: "Please select a template" };
      }
      if (!config.prompt.trim()) {
        return { valid: false, error: "Please select a template to generate your prompt" };
      }
    } else if (promptMode === "guided") {
      // Check required questions
      const missingRequired = PROMPT_BUILDER_QUESTIONS
        .filter(q => q.required && !guidedAnswers[q.id]?.trim())
        .map(q => q.question.replace(/\?$/, ''));
      
      if (missingRequired.length > 0) {
        return { 
          valid: false, 
          error: `Please fill in required fields: ${missingRequired.slice(0, 2).join(", ")}${missingRequired.length > 2 ? ` (+${missingRequired.length - 2} more)` : ""}`
        };
      }
      
      // Generate prompt from answers if not already done
      const generatedPrompt = buildPromptFromAnswers(guidedAnswers);
      if (!generatedPrompt.trim()) {
        return { valid: false, error: "Please answer at least the required questions" };
      }
    }
    return { valid: true, error: null };
  }, [promptMode, config.prompt, selectedTemplate, guidedAnswers]);

  const handleNextStep = useCallback(() => {
    const validation = validateStep1();
    if (!validation.valid) {
      setValidationError(validation.error);
      addNotification(validation.error || "Please fill in required fields", "warning");
      return;
    }
    
    // If in guided mode, finalize the prompt before proceeding
    if (promptMode === "guided") {
      finalizeGuidedPrompt();
    }
    
    setValidationError(null);
    setConfigStep(2);
  }, [validateStep1, promptMode, finalizeGuidedPrompt, addNotification]);

  // Check if step 1 can proceed (for button disabled state)
  const canProceedStep1 = useCallback((): boolean => {
    if (promptMode === "freeform") {
      return !!config.prompt.trim();
    } else if (promptMode === "template") {
      return !!selectedTemplate && !!config.prompt.trim();
    } else if (promptMode === "guided") {
      // Check if all required questions are answered
      return PROMPT_BUILDER_QUESTIONS
        .filter(q => q.required)
        .every(q => !!guidedAnswers[q.id]?.trim());
    }
    return false;
  }, [promptMode, config.prompt, selectedTemplate, guidedAnswers]);

  // Update stage config
  const updateStageConfig = useCallback(
    (stage: GenerationStage, updates: Partial<StageConfig>) => {
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
    []
  );

  // Update content iterations
  const updateContentIterations = useCallback(
    (updates: Partial<ContentIterationConfig>) => {
      setConfig((prev) => ({
        ...prev,
        contentIterations: {
          ...(prev.contentIterations || DEFAULT_CONTENT_ITERATIONS),
          ...updates,
        },
      }));
    },
    []
  );

  // Start generation
  const startGeneration = useCallback(async () => {
    if (!config.prompt.trim()) {
      addNotification("Please enter an adventure prompt", "warning");
      return;
    }

    const token = await getAuthToken();
    if (!token) {
      addNotification("Please sign in to generate adventures", "warning");
      return;
    }

    const stagesToRun = getStagesToRun(config);
    const tasks = getTotalGenerationTasks(config);

    setIsGenerating(true);
    setStages(stagesToRun);
    setTotalTasks(tasks);
    setCompletedTasks(0);
    setCurrentStage(null);
    setCurrentIteration(0);
    setCompletedStages([]);
    setFailedStages([]);
    setLiveContent("");
    setResult(null);
    setPartialResults({});
    setTokenCost(0);

    // Initialize autosave
    const currentSessionId = sessionId || generateSessionId();
    if (!sessionId) setSessionId(currentSessionId);

    abortControllerRef.current = new AbortController();

    try {
      const response = await fetch("/api/creator/generate-adventure", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          config,
          model: selectedModel,
        }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP error: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("No response body");
      }

      const decoder = new TextDecoder();
      let buffer = "";
      let currentPartialResults: Partial<BigAdventureResult> = {};
      let currentCompletedStages: GenerationStage[] = [];
      let currentLiveContent = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith("data:")) continue;

          const data = trimmed.slice(5).trim();
          if (data === "[DONE]") continue;

          try {
            const event = JSON.parse(data);

            switch (event.type) {
              case "start":
                setStages(
                  event.stages.map((s: { stage: GenerationStage }) => s.stage)
                );
                break;

              case "stage_start":
                setCurrentStage(event.stage);
                setCurrentIteration(event.iteration || 1);
                setLiveContent("");
                currentLiveContent = "";
                break;

              case "stage_content":
                currentLiveContent += event.content;
                setLiveContent(currentLiveContent);
                break;

              case "stage_complete":
                if (event.success) {
                  currentCompletedStages = [
                    ...currentCompletedStages,
                    event.stage,
                  ];
                  setCompletedStages(currentCompletedStages);
                  setCompletedTasks((prev) => prev + 1);

                  // Merge partial results
                  if (event.partialResult) {
                    currentPartialResults = {
                      ...currentPartialResults,
                      ...event.partialResult,
                      storyTemplate: {
                        ...currentPartialResults.storyTemplate,
                        ...event.partialResult?.storyTemplate,
                      },
                    };
                    setPartialResults(currentPartialResults);
                  }

                  // Log if continuation was needed
                  if (event.continuationAttempts && event.continuationAttempts > 0) {
                    console.log(`Stage ${event.stage} required ${event.continuationAttempts} continuation(s)`);
                  }

                  // Save autosave after each stage completion
                  const autosaveData: BigAdventureAutosave = {
                    id: currentSessionId,
                    timestamp: Date.now(),
                    config,
                    completedStages: currentCompletedStages,
                    partialResults: currentPartialResults,
                    currentStage: event.stage,
                  };
                  saveAutosave(autosaveData);

                  // Preview mode: Show stage preview modal (stream continues in background)
                  if (
                    config.previewBetweenStages &&
                    event.stage !== "advanced"
                  ) {
                    // Don't show preview for the last stage
                    const stagesToRun = getStagesToRun(config);
                    const isLastStage =
                      event.stage === stagesToRun[stagesToRun.length - 1];

                    if (!isLastStage) {
                      setPreviewStageData({
                        stage: event.stage,
                        content: currentLiveContent,
                        partialResult: event.partialResult || {},
                      });
                      setShowStagePreview(true);
                    }
                  }
                } else {
                  setFailedStages((prev) => [...prev, event.stage]);
                }
                setCurrentStage(null);
                break;

              case "stage_continuation":
                // JSON was incomplete, continuing generation
                console.log(`Stage ${event.stage} continuation attempt ${event.attempt}/${event.maxAttempts}`);
                // Optionally show a subtle indicator that continuation is happening
                setLiveContent((prev) => prev + `\n\n/* Continuing generation (${event.attempt}/${event.maxAttempts})... */\n`);
                break;

              case "stage_warning":
                // Warning about incomplete content
                console.warn(`Stage ${event.stage} warning: ${event.message}`);
                addNotification(event.message, "warning");
                break;

              case "stage_error":
                setFailedStages((prev) => [...prev, event.stage]);
                setCurrentStage(null);
                addNotification(
                  `Stage ${event.stage} failed: ${event.error}`,
                  "warning"
                );
                break;

              case "done":
                setResult(event.result);
                setTokenCost(event.meta.tokenCost);
                // Clear autosave on successful completion
                clearAutosave();
                // Save to history
                saveGenerationToHistory({
                  timestamp: Date.now(),
                  title: event.result.title || "Untitled Adventure",
                  config,
                  result: event.result,
                  tokenCost: event.meta.tokenCost,
                });
                setHistory(loadGenerationHistory());
                addNotification(
                  `Adventure generated! Cost: ${event.meta.tokenCost} coins`,
                  "success"
                );
                break;

              case "error":
                throw new Error(event.error);
            }
          } catch {
            // Skip malformed JSON
          }
        }
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      if (error instanceof Error && error.name === "AbortError") {
        addNotification(
          "Generation cancelled. Progress has been saved.",
          "warning"
        );
      } else {
        addNotification(errorMessage || "Generation failed", "failure");
      }
    } finally {
      setIsGenerating(false);
      setCurrentStage(null);
      abortControllerRef.current = null;
    }
  }, [config, selectedModel, addNotification, sessionId]);

  // Cancel generation
  const cancelGeneration = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  }, []);

  // Regenerate a specific section
  const handleRegenerateSection = useCallback(
    async (section: RegenerateSection) => {
      if (!result || !user) return;

      const token = await getAuthToken();
      if (!token) {
        addNotification("Please sign in to regenerate", "warning");
        return;
      }

      // Get selected model from localStorage
      const modelChoice =
        localStorage.getItem("aiModelTools") ||
        localStorage.getItem("aiPreset") ||
        "Hermes";

      setRegeneratingSection(section);
      setRegenerationContent("");

      try {
        const response = await fetch("/api/creator/regenerate-section", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            section,
            config,
            existingResult: result,
            model: modelChoice,
          }),
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

                    return updated;
                  });

                  // Update token cost
                  if (event.meta?.tokenCost) {
                    setTokenCost((prev) => prev + event.meta.tokenCost);
                  }

                  addNotification(
                    `${REGENERATE_SECTIONS[section].name} regenerated!`,
                    "success"
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
          "failure"
        );
      } finally {
        setRegeneratingSection(null);
        setRegenerationContent("");
      }
    },
    [result, config, user, addNotification]
  );

  // Extend a section (add more content)
  const handleExtendSection = useCallback(
    async (section: RegenerateSection, count: number = 3) => {
      if (!result || !user) return;

      if (!canExtendSection(section)) {
        addNotification(
          `Cannot add more to ${REGENERATE_SECTIONS[section].name}`,
          "warning"
        );
        return;
      }

      const token = await getAuthToken();
      if (!token) {
        addNotification("Please sign in to extend content", "warning");
        return;
      }

      // Get selected model from localStorage
      const modelChoice =
        localStorage.getItem("aiModelTools") ||
        localStorage.getItem("aiPreset") ||
        "Hermes";

      setExtendingSection(section);
      setExtensionContent("");

      try {
        const response = await fetch("/api/creator/extend-section", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            section,
            config,
            existingResult: result,
            count,
            model: modelChoice,
          }),
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
                if (event.result) {
                  setResult((prev) => {
                    if (!prev) return prev;
                    const updated = { ...prev };

                    // Merge the extended content into the existing result
                    if (event.result.storyTemplate) {
                      updated.storyTemplate = {
                        ...prev.storyTemplate,
                        ...event.result.storyTemplate,
                      };
                    }

                    return updated;
                  });

                  // Update token cost
                  if (event.tokenCost) {
                    setTokenCost((prev) => prev + event.tokenCost);
                  }

                  addNotification(
                    `Added more ${REGENERATE_SECTIONS[section].name}!`,
                    "success"
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
        setExtendingSection(null);
        setExtensionContent("");
      }
    },
    [result, config, user, addNotification]
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
    [addNotification]
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
    [config.prompt, addNotification]
  );

  // Delete a template
  const handleDeleteTemplate = useCallback(
    (id: string) => {
      deleteConfigTemplate(id);
      setTemplates(loadConfigTemplates());
      addNotification("Template deleted", "success");
    },
    [addNotification]
  );

  // Load from history
  const handleLoadFromHistory = useCallback(
    (entry: GenerationHistoryEntry) => {
      setConfig(entry.config);
      setResult(entry.result);
      setTokenCost(entry.tokenCost);
      setShowHistoryModal(false);
      addNotification(`Loaded "${entry.title}" from history`, "success");
    },
    [addNotification]
  );

  // Delete history entry
  const handleDeleteHistoryEntry = useCallback(
    (id: string) => {
      deleteHistoryEntry(id);
      setHistory(loadGenerationHistory());
      addNotification("History entry deleted", "success");
    },
    [addNotification]
  );

  // Clear all history
  const handleClearHistory = useCallback(() => {
    if (confirm("Are you sure you want to clear all generation history?")) {
      clearGenerationHistory();
      setHistory([]);
      addNotification("History cleared", "success");
    }
  }, [addNotification]);

  // Save adventure
  const saveAdventure = useCallback(async () => {
    if (!result || !user) return;

    const token = await getAuthToken();
    if (!token) {
      addNotification("Please sign in to save adventures", "warning");
      return;
    }

    setIsSaving(true);

    try {
      const adventure: Partial<Adventure> & { authorId: string } = {
        title: result.title || "Untitled Adventure",
        description: result.description || "",
        shortDescription: result.shortDescription || "",
        authorId: user.id,
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
        isPublished: false,
        isFeatured: false,
        playCount: 0,
        popularity: 0,
      };

      const response = await fetch("/api/adventures", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(adventure),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to save adventure");
      }

      const { adventure: savedAdventure } = await response.json();
      addNotification("Adventure saved successfully!", "success");

      // Navigate to the creator to edit the adventure
      router.push(`/creator?id=${savedAdventure.id}`);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      addNotification(errorMessage || "Failed to save adventure", "failure");
    } finally {
      setIsSaving(false);
    }
  }, [result, config, addNotification, router, user]);

  // Auth check
  if (authLoading) {
    return (
      <div className="min-h-screen bg-linear-to-br from-gray-900 via-blue-950 to-purple-950 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-linear-to-br from-gray-900 via-blue-950 to-purple-950 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-white mb-4">
            Sign In Required
          </h1>
          <p className="text-blue-300/60 mb-6">
            Please sign in to use the Big Adventure Creator.
          </p>
          <Link
            href="/"
            className="px-6 py-3 bg-linear-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white rounded-lg transition-colors"
          >
            Go to Home
          </Link>
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

      {/* Stage Preview Modal */}
      {showStagePreview && previewStageData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setShowStagePreview(false)}
          />
          <div className="relative bg-linear-to-br from-gray-900 via-blue-950 to-purple-950 rounded-xl border border-purple-500/30 max-w-4xl w-full max-h-[85vh] overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="bg-purple-900/30 border-b border-purple-700/30 px-6 py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">
                    {getStageInfo(previewStageData.stage).emoji}
                  </span>
                  <div>
                    <h3 className="text-lg font-bold text-white">
                      Stage Complete:{" "}
                      {getStageInfo(previewStageData.stage).name}
                    </h3>
                    <p className="text-sm text-blue-300/60">
                      Review the generated content before continuing
                    </p>
                  </div>
                </div>
                <div className="text-sm text-blue-300/60">
                  {completedStages.length} / {stages.length} stages
                </div>
              </div>
            </div>

            {/* Content */}
            <div className="p-6 overflow-y-auto max-h-[50vh]">
              {/* Summary of what was generated */}
              {previewStageData.partialResult.storyTemplate && (
                <div className="mb-6">
                  <h4 className="text-sm font-medium text-purple-400 mb-3">
                    Generated in this stage:
                  </h4>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                    {previewStageData.partialResult.storyTemplate.stats && (
                      <div className="bg-blue-900/30 rounded px-3 py-2">
                        <span className="text-amber-400 font-bold">
                          {
                            previewStageData.partialResult.storyTemplate.stats
                              .length
                          }
                        </span>
                        <span className="text-blue-300/60 ml-2">Stats</span>
                      </div>
                    )}
                    {previewStageData.partialResult.storyTemplate.resources && (
                      <div className="bg-blue-900/30 rounded px-3 py-2">
                        <span className="text-emerald-400 font-bold">
                          {
                            previewStageData.partialResult.storyTemplate
                              .resources.length
                          }
                        </span>
                        <span className="text-blue-300/60 ml-2">Resources</span>
                      </div>
                    )}
                    {previewStageData.partialResult.storyTemplate.abilities && (
                      <div className="bg-blue-900/30 rounded px-3 py-2">
                        <span className="text-blue-400 font-bold">
                          {
                            previewStageData.partialResult.storyTemplate
                              .abilities.length
                          }
                        </span>
                        <span className="text-blue-300/60 ml-2">Abilities</span>
                      </div>
                    )}
                    {previewStageData.partialResult.storyTemplate.lore && (
                      <div className="bg-blue-900/30 rounded px-3 py-2">
                        <span className="text-purple-400 font-bold">
                          {
                            previewStageData.partialResult.storyTemplate.lore
                              .length
                          }
                        </span>
                        <span className="text-blue-300/60 ml-2">Lore</span>
                      </div>
                    )}
                    {previewStageData.partialResult.storyTemplate
                      .achievements && (
                      <div className="bg-blue-900/30 rounded px-3 py-2">
                        <span className="text-red-400 font-bold">
                          {
                            previewStageData.partialResult.storyTemplate
                              .achievements.length
                          }
                        </span>
                        <span className="text-blue-300/60 ml-2">
                          Achievements
                        </span>
                      </div>
                    )}
                    {previewStageData.partialResult.storyTemplate
                      .plot_beats && (
                      <div className="bg-blue-900/30 rounded px-3 py-2">
                        <span className="text-green-400 font-bold">
                          {
                            previewStageData.partialResult.storyTemplate
                              .plot_beats.length
                          }
                        </span>
                        <span className="text-blue-300/60 ml-2">
                          Plot Beats
                        </span>
                      </div>
                    )}
                    {previewStageData.partialResult.storyTemplate
                      .relationships && (
                      <div className="bg-blue-900/30 rounded px-3 py-2">
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
                    {previewStageData.partialResult.storyTemplate.quests && (
                      <div className="bg-blue-900/30 rounded px-3 py-2">
                        <span className="text-yellow-400 font-bold">
                          {
                            previewStageData.partialResult.storyTemplate.quests
                              .length
                          }
                        </span>
                        <span className="text-blue-300/60 ml-2">Quests</span>
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
                <div className="bg-blue-950/50 rounded-lg p-4 border border-blue-800/30 max-h-64 overflow-auto">
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

            {/* Footer */}
            <div className="bg-blue-950/50 border-t border-blue-800/30 px-6 py-4">
              <div className="flex items-center justify-between">
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
            </div>
          </div>
        </div>
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
                  className="w-full bg-blue-900/50 border border-blue-700/50 rounded-lg px-4 py-2 text-white placeholder-blue-300/50 focus:outline-none focus:border-purple-500/50"
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
                  className="w-full bg-blue-900/50 border border-blue-700/50 rounded-lg px-4 py-2 text-white placeholder-blue-300/50 focus:outline-none focus:border-purple-500/50 resize-none"
                />
              </div>

              <div className="text-xs text-blue-300/50 bg-blue-900/30 rounded p-3">
                <p className="font-medium text-blue-300/70 mb-1">
                  This template will save:
                </p>
                <ul className="list-disc list-inside space-y-0.5">
                  <li>RPG System: {config.rpgSystem}</li>
                  <li>Complexity: {config.complexity}</li>
                  <li>All feature toggles & iterations</li>
                  <li>Output token settings</li>
                </ul>
              </div>
            </div>

            <div className="bg-blue-950/50 border-t border-blue-800/30 px-6 py-4 flex gap-3 justify-end">
              <button
                onClick={() => {
                  setShowTemplateModal(false);
                  setNewTemplateName("");
                  setNewTemplateDescription("");
                }}
                className="px-4 py-2 bg-blue-900/40 hover:bg-blue-800/50 text-white rounded-lg transition-colors"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setShowHistoryModal(false)}
          />
          <div className="relative bg-linear-to-br from-gray-900 via-blue-950 to-purple-950 rounded-xl border border-blue-500/30 max-w-2xl w-full max-h-[80vh] overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="bg-blue-900/30 border-b border-blue-700/30 px-6 py-4 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-white">
                  📜 Generation History
                </h3>
                <p className="text-sm text-blue-300/60 mt-1">
                  Last {history.length} generations (max 10)
                </p>
              </div>
              {history.length > 0 && (
                <button
                  onClick={handleClearHistory}
                  className="text-xs px-3 py-1.5 bg-red-900/50 hover:bg-red-800/50 text-red-300 rounded transition-colors"
                >
                  Clear All
                </button>
              )}
            </div>

            <div className="p-6 overflow-y-auto max-h-[60vh]">
              {history.length > 0 ? (
                <div className="space-y-3">
                  {history.map((entry) => (
                    <div
                      key={entry.id}
                      className="p-4 bg-blue-900/30 rounded-lg border border-blue-800/30 group hover:border-blue-700/50 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <h4 className="font-medium text-white truncate">
                            {entry.title}
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
                              {entry.tokenCost} coins
                            </span>
                            <span>•</span>
                            <span>{entry.config.rpgSystem}</span>
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

            <div className="bg-blue-950/50 border-t border-blue-800/30 px-6 py-4 flex justify-end">
              <button
                onClick={() => setShowHistoryModal(false)}
                className="px-4 py-2 bg-blue-900/40 hover:bg-blue-800/50 text-white rounded-lg transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="border-b border-blue-800/30 bg-blue-950/80 backdrop-blur-xl sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/creator"
              className="text-blue-300/60 hover:text-white transition-colors"
            >
              ← Back to Creator
            </Link>
            <div className="h-6 w-px bg-blue-800/30" />
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
                <span className="text-amber-400 font-medium">
                  ~{estimatedCost()} coins
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
                    onClick={() => { setPromptMode("freeform"); setValidationError(null); }}
                    className={`flex-1 px-4 py-2 rounded-lg text-sm transition-colors ${
                      promptMode === "freeform"
                        ? "bg-purple-600 text-white"
                        : "bg-blue-900/40 text-blue-300 hover:bg-blue-800/50"
                    }`}
                  >
                    ✏️ Write Your Own
                  </button>
                  <button
                    onClick={() => { setPromptMode("template"); setValidationError(null); }}
                    className={`flex-1 px-4 py-2 rounded-lg text-sm transition-colors ${
                      promptMode === "template"
                        ? "bg-purple-600 text-white"
                        : "bg-blue-900/40 text-blue-300 hover:bg-blue-800/50"
                    }`}
                  >
                    📋 Use Template
                  </button>
                  <button
                    onClick={() => { setPromptMode("guided"); setValidationError(null); }}
                    className={`flex-1 px-4 py-2 rounded-lg text-sm transition-colors ${
                      promptMode === "guided"
                        ? "bg-purple-600 text-white"
                        : "bg-blue-900/40 text-blue-300 hover:bg-blue-800/50"
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
                        className="w-full h-32 bg-blue-900/50 border border-blue-700/50 rounded-lg px-4 py-3 text-white placeholder-blue-300/50 focus:outline-none focus:border-purple-500/50 focus:bg-blue-900/70 resize-none transition-all"
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
                        className="w-full bg-blue-900/50 border border-blue-700/50 rounded-lg px-4 py-3 text-white placeholder-blue-300/50 focus:outline-none focus:border-purple-500/50 focus:bg-blue-900/70 transition-all"
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
                              : "bg-blue-900/30 border-blue-700/50 hover:bg-blue-800/40 hover:border-blue-600/50"
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
                      <div className="p-4 bg-blue-900/30 rounded-lg border border-blue-700/30">
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
                          <span className="px-2 py-1 bg-blue-800/50 rounded text-blue-300">
                            System: {selectedTemplate.suggestedSystem}
                          </span>
                          <span className="px-2 py-1 bg-blue-800/50 rounded text-blue-300">
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
                          className="w-full bg-blue-900/50 border border-blue-700/50 rounded-lg px-4 py-3 text-white placeholder-blue-300/50 focus:outline-none focus:border-purple-500/50 focus:bg-blue-900/70 transition-all"
                        />
                      </div>
                    ))}
                    {Object.keys(guidedAnswers).length > 0 && (
                      <div className="p-4 bg-blue-900/30 rounded-lg border border-blue-700/30">
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

                {/* Import Option */}
                <div className="flex items-center gap-4 pt-2">
                  <div className="flex-1 h-px bg-blue-800/30" />
                  <span className="text-xs text-blue-300/50">or</span>
                  <div className="flex-1 h-px bg-blue-800/30" />
                </div>
                <div className="text-center">
                  <input
                    type="file"
                    accept=".json"
                    onChange={importAdventure}
                    className="hidden"
                    id="import-config-input"
                  />
                  <label
                    htmlFor="import-config-input"
                    className="inline-flex items-center gap-2 px-4 py-2 bg-blue-900/40 hover:bg-blue-800/50 text-blue-300 rounded-lg transition-colors text-sm cursor-pointer"
                  >
                    📥 Import Existing Adventure JSON
                  </label>
                  <p className="text-xs text-blue-300/40 mt-2">
                    Import a previously exported adventure to modify or
                    regenerate sections
                  </p>
                </div>

                <button
                  onClick={handleNextStep}
                  disabled={!canProceedStep1()}
                  className="px-6 py-2 bg-linear-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 disabled:from-blue-900/40 disabled:to-blue-900/40 disabled:text-blue-300/50 text-white rounded-lg transition-colors"
                >
                  Next: Settings →
                </button>
                {validationError && promptMode !== "freeform" && (
                  <p className="text-sm text-red-400 mt-2">{validationError}</p>
                )}
              </div>
            </ConfigStep>

            {/* Step 2: RPG System & Complexity */}
            <ConfigStep step={2} currentStep={configStep} title="Game Settings">
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm text-blue-300/60 mb-2">
                      RPG System
                    </label>
                    <select
                      value={config.rpgSystem}
                      onChange={(e) =>
                        updateConfig({
                          rpgSystem: e.target.value as RPGSystemType,
                        })
                      }
                      className="w-full bg-blue-900/50 border border-blue-700/50 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-purple-500/50 transition-all"
                    >
                      <option value="1d20">D20 (D&D-style)</option>
                      <option value="3d6">3d6 (Bell Curve)</option>
                      <option value="1d100">Percentile (d100)</option>
                      <option value="pbta">Powered by the Apocalypse</option>
                      <option value="fate">Fate</option>
                      <option value="yze">Year Zero Engine</option>
                      <option value="explosive">Explosive Dice</option>
                      <option value="narrative">Narrative (No Dice)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm text-blue-300/60 mb-2">
                      Complexity
                    </label>
                    <select
                      value={config.complexity}
                      onChange={(e) =>
                        updateConfig({
                          complexity: e.target.value as ComplexityLevel,
                        })
                      }
                      className="w-full bg-blue-900/50 border border-blue-700/50 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-purple-500/50 transition-all"
                    >
                      <option value="simple">
                        Simple (fewer stats, shorter story)
                      </option>
                      <option value="moderate">
                        Moderate (balanced depth)
                      </option>
                      <option value="complex">
                        Complex (many systems, longer story)
                      </option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm text-blue-300/60 mb-2">
                      Target Duration
                    </label>
                    <select
                      value={config.targetDuration}
                      onChange={(e) =>
                        updateConfig({
                          targetDuration: e.target.value as
                            | "short"
                            | "medium"
                            | "long",
                        })
                      }
                      className="w-full bg-blue-900/50 border border-blue-700/50 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-purple-500/50 transition-all"
                    >
                      <option value="short">Short (1-2 hours)</option>
                      <option value="medium">Medium (2-4 hours)</option>
                      <option value="long">Long (4-6+ hours)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm text-blue-300/60 mb-2">
                      AI Model
                    </label>
                    <select
                      value={selectedModel}
                      onChange={(e) => setSelectedModel(e.target.value)}
                      className="w-full bg-blue-900/50 border border-blue-700/50 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-purple-500/50 transition-all"
                    >
                      {Object.entries(AI_MODELS).map(([key, model]) => (
                        <option key={key} value={key}>
                          {model.name}{" "}
                          {model.cost > 0
                            ? `(${model.cost} coin base)`
                            : "(Free - BYOK)"}
                        </option>
                      ))}
                    </select>
                    {(AI_MODELS as Record<string, { provider?: string }>)[
                      selectedModel
                    ]?.provider === "novelai" && (
                      <p className="text-xs text-amber-400 mt-2">
                        ⚠️ NovelAI requires your own API key. Configure it in
                        Story → Menu → AI Config.
                      </p>
                    )}
                  </div>
                </div>

                <div>
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={config.nsfw}
                      onChange={(e) => updateConfig({ nsfw: e.target.checked })}
                      className="w-5 h-5 rounded bg-blue-900/50 border-blue-700/50 text-purple-500 focus:ring-purple-500"
                    />
                    <span className="text-white">Allow NSFW Content</span>
                  </label>
                  <p className="text-sm text-blue-300/50 mt-1 ml-8">
                    Enable mature themes, violence, and adult content
                  </p>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => setConfigStep(1)}
                    className="px-6 py-2 bg-blue-900/40 hover:bg-blue-800/50 text-white rounded-lg transition-colors"
                  >
                    ← Back
                  </button>
                  <button
                    onClick={() => setConfigStep(3)}
                    className="px-6 py-2 bg-linear-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white rounded-lg transition-colors"
                  >
                    Next: Features →
                  </button>
                </div>
              </div>
            </ConfigStep>

            {/* Step 3: Advanced Features */}
            <ConfigStep
              step={3}
              currentStep={configStep}
              title="Advanced Features"
            >
              <div className="space-y-4">
                <p className="text-blue-300/60 mb-4">
                  Select which advanced features to include in your adventure.
                  More features = more content but higher cost.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <label className="flex items-start gap-3 p-4 bg-blue-900/30 rounded-lg cursor-pointer hover:bg-blue-900/50 transition-colors border border-blue-700/30">
                    <input
                      type="checkbox"
                      checked={config.includePresets}
                      onChange={(e) =>
                        updateConfig({ includePresets: e.target.checked })
                      }
                      className="w-5 h-5 mt-0.5 rounded bg-blue-900/50 border-blue-700/50 text-purple-500 focus:ring-purple-500"
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

                  <label className="flex items-start gap-3 p-4 bg-blue-900/30 rounded-lg cursor-pointer hover:bg-blue-900/50 transition-colors border border-blue-700/30">
                    <input
                      type="checkbox"
                      checked={config.includeMythic}
                      onChange={(e) =>
                        updateConfig({ includeMythic: e.target.checked })
                      }
                      className="w-5 h-5 mt-0.5 rounded bg-blue-900/50 border-blue-700/50 text-purple-500 focus:ring-purple-500"
                    />
                    <div>
                      <div className="font-medium text-white">
                        🎲 Mythic GME
                      </div>
                      <p className="text-sm text-blue-300/60">
                        Solo/GM-less play with fate checks and chaos
                      </p>
                    </div>
                  </label>

                  <label className="flex items-start gap-3 p-4 bg-blue-900/30 rounded-lg cursor-pointer hover:bg-blue-900/50 transition-colors border border-blue-700/30">
                    <input
                      type="checkbox"
                      checked={config.includeCustomTables}
                      onChange={(e) =>
                        updateConfig({ includeCustomTables: e.target.checked })
                      }
                      className="w-5 h-5 mt-0.5 rounded bg-blue-900/50 border-blue-700/50 text-purple-500 focus:ring-purple-500"
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

                  <label className="flex items-start gap-3 p-4 bg-blue-900/30 rounded-lg cursor-pointer hover:bg-blue-900/50 transition-colors border border-blue-700/30">
                    <input
                      type="checkbox"
                      checked={config.includeUpgradeShop}
                      onChange={(e) =>
                        updateConfig({ includeUpgradeShop: e.target.checked })
                      }
                      className="w-5 h-5 mt-0.5 rounded bg-blue-900/50 border-blue-700/50 text-purple-500 focus:ring-purple-500"
                    />
                    <div>
                      <div className="font-medium text-white">
                        🛒 Upgrade Shop
                      </div>
                      <p className="text-sm text-blue-300/60">
                        Progression system with purchasable upgrades
                      </p>
                    </div>
                  </label>

                  <label className="flex items-start gap-3 p-4 bg-blue-900/30 rounded-lg cursor-pointer hover:bg-blue-900/50 transition-colors border border-blue-700/30">
                    <input
                      type="checkbox"
                      checked={config.includeStartingChoices}
                      onChange={(e) =>
                        updateConfig({
                          includeStartingChoices: e.target.checked,
                        })
                      }
                      className="w-5 h-5 mt-0.5 rounded bg-blue-900/50 border-blue-700/50 text-purple-500 focus:ring-purple-500"
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
                    onClick={() => setConfigStep(2)}
                    className="px-6 py-2 bg-blue-900/40 hover:bg-blue-800/50 text-white rounded-lg transition-colors"
                  >
                    ← Back
                  </button>
                  <button
                    onClick={() => setConfigStep(4)}
                    className="px-6 py-2 bg-linear-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white rounded-lg transition-colors"
                  >
                    Next: Fine-tune →
                  </button>
                </div>
              </div>
            </ConfigStep>

            {/* Step 4: Fine-tuning */}
            <ConfigStep
              step={4}
              currentStep={configStep}
              title="Fine-tune Generation"
            >
              <div className="space-y-6">
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
                          className="flex items-center justify-between p-2 bg-blue-900/30 rounded-lg border border-blue-800/30 group"
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
                              className="text-xs px-2 py-1 bg-blue-700/50 hover:bg-blue-600/50 text-white rounded transition-colors"
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
                <div className="bg-blue-900/20 rounded-lg p-4 border border-blue-700/30">
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
                          (typeof STYLE_PRESETS)[StylePreset]
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
                              : "bg-blue-900/30 border-blue-700/50 hover:bg-blue-800/40"
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
                      className="w-full h-2 bg-blue-900/40 rounded-lg appearance-none cursor-pointer accent-purple-500"
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
                <div className="bg-blue-900/20 rounded-lg p-4 border border-blue-700/30">
                  <h4 className="font-medium text-white mb-3">
                    Output Settings
                  </h4>

                  <div className="mb-4">
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-sm text-blue-300/60">
                        Max Output Tokens per Task
                      </label>
                      <span className="text-sm font-mono text-purple-400">
                        {config.maxOutputTokens} / {getModelMaxTokens()}
                      </span>
                    </div>
                    <input
                      type="range"
                      min={2000}
                      max={getModelMaxTokens()}
                      step={500}
                      value={config.maxOutputTokens}
                      onChange={(e) =>
                        updateConfig({
                          maxOutputTokens: parseInt(e.target.value),
                        })
                      }
                      className="w-full h-2 bg-blue-900/40 rounded-lg appearance-none cursor-pointer accent-purple-500"
                    />
                    <p className="text-xs text-blue-300/50 mt-1">
                      Higher values = more detailed content but higher cost.
                      Model max: {getModelMaxTokens()}
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
                              ? "bg-purple-600"
                              : "bg-blue-900/40"
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

                    {/* Stage Toggles */}
                    <div className="bg-blue-900/20 rounded-lg p-4 border border-blue-700/30">
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

                    {/* Content Iterations */}
                    <div className="bg-blue-900/20 rounded-lg p-4 border border-blue-700/30">
                      <h4 className="font-medium text-white mb-1">
                        Content Iterations
                      </h4>
                      <p className="text-xs text-blue-300/50 mb-4">
                        Run multiple passes for richer content (1x = normal, 5x
                        = maximum detail)
                      </p>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <IterationSlider
                          label="📚 Lore Entries"
                          value={config.contentIterations?.lore ?? 1}
                          onChange={(v) => updateContentIterations({ lore: v })}
                        />
                        <IterationSlider
                          label="🏆 Achievements"
                          value={config.contentIterations?.achievements ?? 1}
                          onChange={(v) =>
                            updateContentIterations({ achievements: v })
                          }
                        />
                        <IterationSlider
                          label="📖 Plot Beats"
                          value={config.contentIterations?.plotBeats ?? 1}
                          onChange={(v) =>
                            updateContentIterations({ plotBeats: v })
                          }
                        />
                        <IterationSlider
                          label="🤝 Relationships"
                          value={config.contentIterations?.relationships ?? 1}
                          onChange={(v) =>
                            updateContentIterations({ relationships: v })
                          }
                        />
                        <IterationSlider
                          label="📋 Quests"
                          value={config.contentIterations?.quests ?? 1}
                          onChange={(v) =>
                            updateContentIterations({ quests: v })
                          }
                        />
                        <IterationSlider
                          label="🎒 Inventory"
                          value={config.contentIterations?.inventory ?? 1}
                          onChange={(v) =>
                            updateContentIterations({ inventory: v })
                          }
                        />
                      </div>
                    </div>

                    {/* Per-Stage Token Limits */}
                    <div className="bg-blue-900/20 rounded-lg p-4 border border-blue-700/30">
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
                          ] as GenerationStage[]
                        ).map((stage) => (
                          <div key={stage} className="flex items-center gap-4">
                            <span className="text-sm text-blue-200 w-24">
                              {getStageInfo(stage).name}
                            </span>
                            <input
                              type="range"
                              min={2000}
                              max={getModelMaxTokens()}
                              step={500}
                              value={
                                config.stageConfigs?.[stage]?.maxOutputTokens ??
                                config.maxOutputTokens
                              }
                              onChange={(e) =>
                                updateStageConfig(stage, {
                                  maxOutputTokens: parseInt(e.target.value),
                                })
                              }
                              className="flex-1 h-1.5 bg-blue-900/40 rounded-lg appearance-none cursor-pointer accent-purple-500"
                            />
                            <span className="text-sm font-mono text-purple-400 w-16 text-right">
                              {config.stageConfigs?.[stage]?.maxOutputTokens ??
                                config.maxOutputTokens}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Per-Stage Custom Instructions */}
                    <div className="bg-purple-900/20 rounded-lg p-4 border border-purple-700/30">
                      <h4 className="font-medium text-white mb-1">
                        Per-Stage Custom Instructions
                      </h4>
                      <p className="text-xs text-purple-300/50 mb-4">
                        Give the AI specific guidance for each generation stage. These instructions directly influence what gets created.
                      </p>
                      <div className="space-y-4">
                        {(
                          [
                            "core",
                            "mechanics",
                            "content",
                            "advanced",
                          ] as GenerationStage[]
                        ).map((stage) => {
                          const info = getStageInfo(stage);
                          return (
                          <div key={stage} className="space-y-2">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-purple-200">
                                {info.emoji}{" "}
                                {info.name}
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
                                <span key={i} className="bg-purple-900/30 px-1.5 py-0.5 rounded">
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
                              className="w-full px-3 py-2 bg-blue-900/30 border border-purple-700/30 rounded-lg text-white placeholder-purple-300/40 text-sm resize-none focus:outline-none focus:border-purple-500/50"
                              disabled={!config.stageConfigs?.[stage]?.enabled}
                            />
                          </div>
                        )})}
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
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-blue-200">
                      Estimated Cost
                    </span>
                    <span className="text-lg text-amber-400 font-bold">
                      ~{estimatedCost()} coins
                    </span>
                  </div>
                </div>

                <div className="flex gap-3 pt-4">
                  <button
                    onClick={() => setConfigStep(3)}
                    className="px-6 py-2 bg-blue-900/40 hover:bg-blue-800/50 text-white rounded-lg transition-colors"
                  >
                    ← Back
                  </button>
                  <button
                    onClick={startGeneration}
                    disabled={!config.prompt.trim()}
                    className="flex-1 px-6 py-3 bg-linear-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 disabled:from-blue-900/40 disabled:to-blue-900/40 disabled:text-blue-300/50 text-white rounded-lg font-medium transition-colors"
                  >
                    ✨ Generate Adventure
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
                {currentIteration > 1 && currentStage && (
                  <span className="ml-2 text-purple-400">
                    (Iteration {currentIteration})
                  </span>
                )}
              </div>
              {/* Progress bar */}
              <div className="mt-2 w-full max-w-md mx-auto h-2 bg-blue-900/40 rounded-full overflow-hidden">
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
              currentStage={currentStage}
              completedStages={completedStages}
              failedStages={failedStages}
            />

            <LiveOutput content={liveContent} stage={currentStage} />

            <div className="flex justify-center gap-4">
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
              <p className="text-blue-300/60">Total cost: {tokenCost} coins</p>
            </div>

            {/* Preview */}
            <div className="bg-blue-950/50 rounded-xl p-6 border border-blue-700/30">
              <div className="flex items-start justify-between mb-2">
                <h3 className="text-xl font-bold text-white">
                  {result.title || "Untitled Adventure"}
                </h3>
                <button
                  onClick={() => handleRegenerateSection("title")}
                  disabled={regeneratingSection !== null}
                  className="text-xs px-2 py-1 bg-blue-800/50 hover:bg-blue-700/50 disabled:bg-blue-900/30 disabled:text-blue-300/30 text-blue-300 rounded transition-colors"
                  title="Regenerate title & descriptions"
                >
                  {regeneratingSection === "title" ? "⏳" : "🔄"}
                </button>
              </div>
              <p className="text-blue-300/60 mb-4">{result.shortDescription}</p>

              <div className="prose prose-invert max-w-none">
                <p className="text-blue-200 whitespace-pre-wrap">
                  {result.description}
                </p>
              </div>

              {/* Regenerating overlay */}
              {regeneratingSection && (
                <div className="mt-6 pt-6 border-t border-blue-800/30">
                  <h4 className="text-sm font-medium text-purple-400 mb-3 flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
                    Regenerating {REGENERATE_SECTIONS[regeneratingSection].name}
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
                <div className="mt-6 pt-6 border-t border-blue-800/30">
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
                          "stats",
                          "resources",
                          "abilities",
                          "plotBeats",
                          "lore",
                          "achievements",
                          "quests",
                          "relationships",
                          "presets",
                          "inventory",
                          "variables",
                          "startingChoices",
                          "customTables",
                        ];
                        const allExpanded = allSections.every((s) =>
                          expandedSections.has(s)
                        );
                        if (allExpanded) {
                          setExpandedSections(new Set());
                        } else {
                          setExpandedSections(new Set(allSections));
                        }
                      }}
                      className="text-xs px-2 py-1 bg-blue-900/40 hover:bg-blue-800/50 text-blue-300 rounded transition-all"
                    >
                      {expandedSections.size > 6
                        ? "Collapse All"
                        : "Expand All"}
                    </button>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    {/* Stats */}
                    <ExpandableContentCard
                      section="stats"
                      label="Stats"
                      count={result.storyTemplate.stats?.length || 0}
                      color="amber"
                      items={result.storyTemplate.stats || []}
                      isExpanded={expandedSections.has("stats")}
                      onToggleExpand={() => toggleSectionExpanded("stats")}
                      onRegenerate={() => handleRegenerateSection("stats")}
                      onExtend={() =>
                        handleExtendSection("stats", extensionCount)
                      }
                      isRegenerating={regeneratingSection === "stats"}
                      isExtending={extendingSection === "stats"}
                      renderItem={(item) => {
                        const stat = item as Stat;
                        return (
                          <div className="flex items-center gap-2">
                            <span className="text-lg">{stat.symbol}</span>
                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-amber-300 truncate">
                                {stat.name}
                              </div>
                              <div className="text-xs text-blue-300/60 truncate">
                                {stat.description}
                              </div>
                            </div>
                            <span className="text-amber-400 font-bold">
                              {stat.value}
                            </span>
                          </div>
                        );
                      }}
                    />

                    {/* Resources */}
                    <ExpandableContentCard
                      section="resources"
                      label="Resources"
                      count={result.storyTemplate.resources?.length || 0}
                      color="emerald"
                      items={result.storyTemplate.resources || []}
                      isExpanded={expandedSections.has("resources")}
                      onToggleExpand={() => toggleSectionExpanded("resources")}
                      onRegenerate={() => handleRegenerateSection("resources")}
                      onExtend={() =>
                        handleExtendSection("resources", extensionCount)
                      }
                      isRegenerating={regeneratingSection === "resources"}
                      isExtending={extendingSection === "resources"}
                      renderItem={(item) => {
                        const resource = item as Resource;
                        return (
                          <div className="flex items-center gap-2">
                            <span className="text-lg">{resource.symbol}</span>
                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-emerald-300 truncate">
                                {resource.name}
                              </div>
                              <div className="text-xs text-blue-300/60 truncate">
                                {resource.description}
                              </div>
                            </div>
                            <span className="text-emerald-400 font-bold">
                              {resource.value}/{resource.maxValue}
                            </span>
                          </div>
                        );
                      }}
                    />

                    {/* Abilities */}
                    <ExpandableContentCard
                      section="abilities"
                      label="Abilities"
                      count={result.storyTemplate.abilities?.length || 0}
                      color="blue"
                      items={result.storyTemplate.abilities || []}
                      isExpanded={expandedSections.has("abilities")}
                      onToggleExpand={() => toggleSectionExpanded("abilities")}
                      onRegenerate={() => handleRegenerateSection("abilities")}
                      onExtend={() =>
                        handleExtendSection("abilities", extensionCount)
                      }
                      isRegenerating={regeneratingSection === "abilities"}
                      isExtending={extendingSection === "abilities"}
                      renderItem={(item) => {
                        const ability = item as Ability;
                        return (
                          <div className="flex items-center gap-2">
                            <span className="text-lg">{ability.symbol}</span>
                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-blue-300 truncate">
                                {ability.name}
                              </div>
                              <div className="text-xs text-blue-300/60 truncate">
                                {ability.description}
                              </div>
                            </div>
                            <span className="text-blue-400 text-xs px-1.5 py-0.5 bg-blue-900/50 rounded">
                              {ability.grade}
                            </span>
                          </div>
                        );
                      }}
                    />

                    {/* Plot Beats */}
                    <ExpandableContentCard
                      section="plotBeats"
                      label="Plot Beats"
                      count={result.storyTemplate.plot_beats?.length || 0}
                      color="green"
                      items={result.storyTemplate.plot_beats || []}
                      isExpanded={expandedSections.has("plotBeats")}
                      onToggleExpand={() => toggleSectionExpanded("plotBeats")}
                      onRegenerate={() => handleRegenerateSection("plotBeats")}
                      onExtend={() =>
                        handleExtendSection("plotBeats", extensionCount)
                      }
                      isRegenerating={regeneratingSection === "plotBeats"}
                      isExtending={extendingSection === "plotBeats"}
                      renderItem={(item) => {
                        const beat = item as PlotBeat;
                        return (
                          <div>
                            <div className="font-medium text-green-300 truncate">
                              {beat.title}
                            </div>
                            <div className="text-xs text-blue-300/60 line-clamp-2">
                              {beat.content}
                            </div>
                          </div>
                        );
                      }}
                    />

                    {/* Lore */}
                    <ExpandableContentCard
                      section="lore"
                      label="Lore Entries"
                      count={result.storyTemplate.lore?.length || 0}
                      color="purple"
                      items={result.storyTemplate.lore || []}
                      isExpanded={expandedSections.has("lore")}
                      onToggleExpand={() => toggleSectionExpanded("lore")}
                      onRegenerate={() => handleRegenerateSection("lore")}
                      onExtend={() =>
                        handleExtendSection("lore", extensionCount)
                      }
                      isRegenerating={regeneratingSection === "lore"}
                      isExtending={extendingSection === "lore"}
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

                    {/* Achievements */}
                    <ExpandableContentCard
                      section="achievements"
                      label="Achievements"
                      count={result.storyTemplate.achievements?.length || 0}
                      color="red"
                      items={result.storyTemplate.achievements || []}
                      isExpanded={expandedSections.has("achievements")}
                      onToggleExpand={() =>
                        toggleSectionExpanded("achievements")
                      }
                      onRegenerate={() =>
                        handleRegenerateSection("achievements")
                      }
                      onExtend={() =>
                        handleExtendSection("achievements", extensionCount)
                      }
                      isRegenerating={regeneratingSection === "achievements"}
                      isExtending={extendingSection === "achievements"}
                      renderItem={(item) => {
                        const achievement = item as Achievement;
                        return (
                          <div className="flex items-center gap-2">
                            <span className="text-lg">
                              {achievement.symbol}
                            </span>
                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-red-300 truncate">
                                {achievement.title}
                              </div>
                              <div className="text-xs text-blue-300/60 truncate">
                                {achievement.description}
                              </div>
                            </div>
                            <span className="text-yellow-400 text-xs font-bold">
                              {achievement.points}pts
                            </span>
                          </div>
                        );
                      }}
                    />

                    {/* Quests */}
                    <ExpandableContentCard
                      section="quests"
                      label="Quests"
                      count={result.storyTemplate.quests?.length || 0}
                      color="yellow"
                      items={result.storyTemplate.quests || []}
                      isExpanded={expandedSections.has("quests")}
                      onToggleExpand={() => toggleSectionExpanded("quests")}
                      onRegenerate={() => handleRegenerateSection("quests")}
                      onExtend={() =>
                        handleExtendSection("quests", extensionCount)
                      }
                      isRegenerating={regeneratingSection === "quests"}
                      isExtending={extendingSection === "quests"}
                      renderItem={(item) => {
                        const quest = item as Quest;
                        return (
                          <div>
                            <div className="font-medium text-yellow-300 truncate">
                              {quest.title}
                            </div>
                            <div className="text-xs text-blue-300/60 line-clamp-2">
                              {quest.shortDescription}
                            </div>
                          </div>
                        );
                      }}
                    />

                    {/* Relationships */}
                    <ExpandableContentCard
                      section="relationships"
                      label="Relationships"
                      count={result.storyTemplate.relationships?.length || 0}
                      color="pink"
                      items={result.storyTemplate.relationships || []}
                      isExpanded={expandedSections.has("relationships")}
                      onToggleExpand={() =>
                        toggleSectionExpanded("relationships")
                      }
                      onRegenerate={() =>
                        handleRegenerateSection("relationships")
                      }
                      onExtend={() =>
                        handleExtendSection("relationships", extensionCount)
                      }
                      isRegenerating={regeneratingSection === "relationships"}
                      isExtending={extendingSection === "relationships"}
                      renderItem={(item) => {
                        const rel = item as Relationship;
                        return (
                          <div className="flex items-center gap-2">
                            <span className="text-lg">{rel.symbol}</span>
                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-pink-300 truncate">
                                {rel.name}
                              </div>
                              <div className="text-xs text-blue-300/60 truncate">
                                {rel.description}
                              </div>
                            </div>
                            <span
                              className={`font-bold ${
                                rel.value >= 0
                                  ? "text-green-400"
                                  : "text-red-400"
                              }`}
                            >
                              {rel.value > 0 ? "+" : ""}
                              {rel.value}
                            </span>
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
                      onRegenerate={() => handleRegenerateSection("presets")}
                      onExtend={() =>
                        handleExtendSection("presets", extensionCount)
                      }
                      isRegenerating={regeneratingSection === "presets"}
                      isExtending={extendingSection === "presets"}
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

                    {/* Inventory */}
                    <ExpandableContentCard
                      section="inventory"
                      label="Inventory"
                      count={result.storyTemplate.inventory?.length || 0}
                      color="orange"
                      items={result.storyTemplate.inventory || []}
                      isExpanded={expandedSections.has("inventory")}
                      onToggleExpand={() => toggleSectionExpanded("inventory")}
                      onRegenerate={() => handleRegenerateSection("inventory")}
                      onExtend={() =>
                        handleExtendSection("inventory", extensionCount)
                      }
                      isRegenerating={regeneratingSection === "inventory"}
                      isExtending={extendingSection === "inventory"}
                      renderItem={(item) => {
                        const inv = item as InventoryItem;
                        return (
                          <div className="flex items-center gap-2">
                            <span className="text-lg">{inv.symbol}</span>
                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-orange-300 truncate">
                                {inv.name}
                              </div>
                              <div className="text-xs text-blue-300/60 truncate">
                                {inv.description}
                              </div>
                            </div>
                            <span className="text-orange-400 text-xs px-1.5 py-0.5 bg-orange-900/50 rounded">
                              {inv.type}{" "}
                              {inv.quantity > 1 ? `×${inv.quantity}` : ""}
                            </span>
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
                      onRegenerate={() => handleRegenerateSection("variables")}
                      onExtend={() => {}}
                      isRegenerating={regeneratingSection === "variables"}
                      isExtending={false}
                      canExtend={false}
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
                        handleRegenerateSection("startingChoices")
                      }
                      onExtend={() => {}}
                      isRegenerating={regeneratingSection === "startingChoices"}
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
                            handleRegenerateSection("customTables")
                          }
                          onExtend={() =>
                            handleExtendSection("customTables", extensionCount)
                          }
                          isRegenerating={
                            regeneratingSection === "customTables"
                          }
                          isExtending={extendingSection === "customTables"}
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

                  {/* Extension count selector */}
                  <div className="mt-4 flex items-center gap-3 text-sm text-blue-300/60">
                    <span>Add More Count:</span>
                    <div className="flex gap-1">
                      {[1, 2, 3, 5].map((count) => (
                        <button
                          key={count}
                          onClick={() => setExtensionCount(count)}
                          className={`px-2 py-1 rounded ${
                            extensionCount === count
                              ? "bg-purple-600 text-white"
                              : "bg-blue-900/40 text-blue-300 hover:bg-blue-800/50"
                          }`}
                        >
                          +{count}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Extension progress overlay */}
              {extendingSection && (
                <div className="mt-6 pt-6 border-t border-blue-800/30">
                  <h4 className="text-sm font-medium text-green-400 mb-3 flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
                    Adding more {REGENERATE_SECTIONS[extendingSection].name}...
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
                className="px-4 py-2.5 bg-blue-900/40 hover:bg-blue-800/50 text-white rounded-lg transition-colors text-sm"
              >
                Start Over
              </button>

              <button
                onClick={exportAdventure}
                className="px-4 py-2.5 bg-blue-900/40 hover:bg-blue-800/50 text-white rounded-lg transition-colors text-sm flex items-center gap-2"
              >
                📤 Export JSON
              </button>

              <label
                htmlFor="import-adventure-input"
                className="px-4 py-2.5 bg-blue-900/40 hover:bg-blue-800/50 text-white rounded-lg transition-colors text-sm flex items-center gap-2 cursor-pointer"
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
