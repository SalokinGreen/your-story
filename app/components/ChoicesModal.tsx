"use client";

import React, { useState, useEffect } from "react";
import { Choice, Choices, StoryData, ActionAnalysis } from "../misc/structs";
import { DynamicIcon } from "./DynamicIcon";
import {
  findStatMatch,
  findResourceMatch,
  findItemMatch,
} from "../misc/fuzzyMatch";
import { getRPGSystem } from "../misc/rpgSystems";

interface ChoicesModalProps {
  isOpen: boolean;
  onClose: () => void;
  choices: Choices;
  storyData: StoryData;
  selectedChoice: Choice | null;
  onSelectChoice: (choice: Choice) => void;
  onConfirm: () => void;
  onCustomInput?: (text: string) => void;
  onActionSubmit?: (
    text: string
  ) => Promise<{ analysis: ActionAnalysis; warnings: string[] } | null>;
  onActionConfirm?: (choice: Choice) => void;
  loading: boolean;
  momentumMode: "none" | "reroll" | "guarantee";
  onMomentumModeChange: (mode: "none" | "reroll" | "guarantee") => void;
  actionMode?: boolean;
  onActionModeChange?: (enabled: boolean) => void;
}

export default function ChoicesModal({
  isOpen,
  onClose,
  choices,
  storyData,
  selectedChoice,
  onSelectChoice,
  onConfirm,
  onCustomInput,
  onActionSubmit,
  onActionConfirm,
  loading,
  momentumMode,
  onMomentumModeChange,
  actionMode = false,
  onActionModeChange,
}: ChoicesModalProps) {
  const [customInput, setCustomInput] = useState("");
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [submittingCustom, setSubmittingCustom] = useState(false);

  // Action mode state
  const [actionText, setActionText] = useState("");
  const [analyzingAction, setAnalyzingAction] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<{
    analysis: ActionAnalysis;
    warnings: string[];
  } | null>(null);
  const [showActionBuilder, setShowActionBuilder] = useState(false);

  // Action builder state
  const [builderSkill, setBuilderSkill] = useState("");
  const [builderDc, setBuilderDc] = useState(12);
  const [builderItem, setBuilderItem] = useState("");
  const [builderResource, setBuilderResource] = useState("");
  const [builderPlain, setBuilderPlain] = useState(true);

  const rpgSystem = getRPGSystem(storyData.rpgSystem || "3d6");

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setShowCustomInput(false);
      setCustomInput("");
      setActionText("");
      setAnalyzingAction(false);
      setAnalysisResult(null);
      setShowActionBuilder(false);
      setBuilderSkill("");
      setBuilderDc(rpgSystem.dc.medium);
      setBuilderItem("");
      setBuilderResource("");
      setBuilderPlain(true);
    }
  }, [isOpen, rpgSystem.dc.medium]);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        if (showActionBuilder) {
          setShowActionBuilder(false);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose, showActionBuilder]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = "";
      };
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const hasSkillCheck = selectedChoice?.skill_used !== undefined;
  const canUseReroll = storyData.momentum >= 1 && hasSkillCheck;
  const canUseGuarantee = storyData.momentum >= 2 && hasSkillCheck;

  // For action mode, check if the analyzed action has a skill check
  const actionHasSkillCheck = analysisResult?.analysis?.skill_used != null;
  const canUseRerollAction = storyData.momentum >= 1 && actionHasSkillCheck;
  const canUseGuaranteeAction = storyData.momentum >= 2 && actionHasSkillCheck;

  const handleSubmitCustom = async () => {
    const text = customInput.trim();
    if (!text || !onCustomInput) return;

    setSubmittingCustom(true);
    try {
      await Promise.resolve(onCustomInput(text));
      setCustomInput("");
      setShowCustomInput(false);
      onClose();
    } finally {
      setSubmittingCustom(false);
    }
  };

  const handleActionAnalyze = async () => {
    const text = actionText.trim();
    if (!text || !onActionSubmit) return;

    setAnalyzingAction(true);
    setShowActionBuilder(false);
    try {
      const result = await onActionSubmit(text);
      if (result) {
        setAnalysisResult(result);
      } else {
        // Analysis failed - show action builder
        setShowActionBuilder(true);
      }
    } catch (error) {
      console.error("Action analysis failed:", error);
      setShowActionBuilder(true);
    } finally {
      setAnalyzingAction(false);
    }
  };

  const handleActionConfirmClick = () => {
    if (!analysisResult || !onActionConfirm) return;

    // Convert analysis to choice format and submit
    const choice: Choice = {
      text: actionText,
      skill_used: analysisResult.analysis.skill_used || undefined,
      skill_dc: analysisResult.analysis.skill_dc || undefined,
      item_used: analysisResult.analysis.item_used || undefined,
      resource_used: analysisResult.analysis.resource_used || undefined,
      mythic_check: analysisResult.analysis.mythic_check || undefined,
      custom_table: analysisResult.analysis.custom_table || undefined,
    };

    onActionConfirm(choice);
    onClose();
  };

  const handleManualActionSubmit = () => {
    if (!onActionConfirm) return;

    const choice: Choice = {
      text: actionText,
    };

    if (!builderPlain) {
      if (builderSkill) {
        choice.skill_used = builderSkill;
        choice.skill_dc = builderDc;
      }
      if (builderItem) choice.item_used = builderItem;
      if (builderResource) choice.resource_used = builderResource;
    }

    onActionConfirm(choice);
    onClose();
  };

  const getChoiceDetails = (choice: Choice) => {
    const details: React.ReactNode[] = [];

    // Skill check
    if (choice.skill_used) {
      const matchResult = findStatMatch(choice.skill_used, storyData.stats);
      const skill = matchResult?.item;
      details.push(
        <div key="skill" className="flex items-center gap-2 text-purple-400">
          <DynamicIcon
            name={skill?.symbol || "BarChart2"}
            className="w-4 h-4"
          />
          <span className="text-sm">
            {choice.skill_used} Check
            {skill && (
              <span className="text-gray-400 ml-1">(+{skill.value})</span>
            )}
          </span>
        </div>
      );
    }

    // Resource cost
    if (choice.resource_used) {
      const matchResult = findResourceMatch(
        choice.resource_used,
        storyData.resources
      );
      const resource = matchResult?.item;
      details.push(
        <div key="resource" className="flex items-center gap-2 text-amber-400">
          <DynamicIcon name={resource?.symbol || "Gem"} className="w-4 h-4" />
          <span className="text-sm">
            Uses {choice.resource_used}
            {resource && (
              <span className="text-gray-400 ml-1">
                ({resource.value}/{resource.maxValue})
              </span>
            )}
          </span>
        </div>
      );
    }

    // Item usage
    if (choice.item_used) {
      const matchResult = findItemMatch(choice.item_used, storyData.inventory);
      const item = matchResult?.item;
      details.push(
        <div key="item" className="flex items-center gap-2 text-green-400">
          <DynamicIcon name={item?.symbol || "Package"} className="w-4 h-4" />
          <span className="text-sm">
            Uses {choice.item_used}
            {item && (
              <span className="text-gray-400 ml-1">
                ({item.quantity} remaining)
              </span>
            )}
          </span>
        </div>
      );
    }

    // Mythic check
    if (choice.mythic_check) {
      details.push(
        <div key="mythic" className="flex items-center gap-2 text-purple-400">
          <DynamicIcon name="Sparkles" className="w-4 h-4" />
          <span className="text-sm">Fate Check</span>
        </div>
      );
    }

    // Mythic table
    if (choice.mythic_table) {
      details.push(
        <div key="table" className="flex items-center gap-2 text-indigo-400">
          <DynamicIcon name="Dices" className="w-4 h-4" />
          <span className="text-sm">Mythic Table: {choice.mythic_table}</span>
        </div>
      );
    }

    // Custom table
    if (choice.custom_table) {
      details.push(
        <div key="custom" className="flex items-center gap-2 text-teal-400">
          <DynamicIcon name="Table" className="w-4 h-4" />
          <span className="text-sm">Roll on: {choice.custom_table}</span>
        </div>
      );
    }

    return details;
  };

  // Render action mode analysis details
  const renderAnalysisDetails = () => {
    if (!analysisResult) return null;
    const { analysis, warnings } = analysisResult;

    // Convert to choice format for display
    const pseudoChoice: Choice = {
      text: actionText,
      skill_used: analysis.skill_used || undefined,
      skill_dc: analysis.skill_dc || undefined,
      item_used: analysis.item_used || undefined,
      resource_used: analysis.resource_used || undefined,
      mythic_check: analysis.mythic_check || undefined,
      custom_table: analysis.custom_table || undefined,
    };

    const details = getChoiceDetails(pseudoChoice);

    return (
      <div className="bg-blue-900/30 rounded-lg p-3 border border-blue-500/30 space-y-2">
        <div className="flex items-center gap-2 text-blue-300 text-sm font-medium">
          <DynamicIcon name="CheckCircle" className="w-4 h-4" />
          Action Analyzed
        </div>
        {details.length > 0 ? (
          <div className="flex flex-wrap gap-2">{details}</div>
        ) : (
          <p className="text-blue-200/60 text-sm">
            Plain action (no dice roll)
          </p>
        )}
        {warnings.length > 0 && (
          <div className="text-xs text-amber-400/80">
            {warnings.map((w, i) => (
              <div key={i}>• {w}</div>
            ))}
          </div>
        )}
      </div>
    );
  };

  // Render action builder UI for when analysis fails
  const renderActionBuilder = () => {
    return (
      <div className="bg-amber-900/20 border border-amber-700/30 rounded-lg p-3 space-y-3">
        <div className="flex items-center gap-2 text-amber-300 text-sm font-medium">
          <DynamicIcon name="AlertTriangle" className="w-4 h-4" />
          Build Action Manually
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setBuilderPlain(!builderPlain)}
            className={`relative w-10 h-5 rounded-full transition-colors ${
              builderPlain ? "bg-blue-600" : "bg-blue-900/50"
            }`}
          >
            <div
              className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform ${
                builderPlain ? "left-5" : "left-0.5"
              }`}
            />
          </button>
          <span className="text-xs text-blue-200">
            {builderPlain ? "Plain action" : "With mechanics"}
          </span>
        </div>

        {!builderPlain && (
          <div className="space-y-2">
            <div className="flex gap-2">
              <select
                value={builderSkill}
                onChange={(e) => setBuilderSkill(e.target.value)}
                className="flex-1 px-2 py-1.5 bg-blue-950/50 border border-blue-800/30 rounded text-white text-xs"
              >
                <option value="">No skill check</option>
                {storyData.stats.map((s) => (
                  <option key={s.name} value={s.name}>
                    {s.name} (+{s.value})
                  </option>
                ))}
              </select>
              {builderSkill && (
                <input
                  type="number"
                  value={builderDc}
                  onChange={(e) => setBuilderDc(parseInt(e.target.value) || 10)}
                  className="w-14 px-2 py-1.5 bg-blue-950/50 border border-blue-800/30 rounded text-white text-xs text-center"
                  placeholder="DC"
                />
              )}
            </div>
            {storyData.inventory.length > 0 && (
              <select
                value={builderItem}
                onChange={(e) => setBuilderItem(e.target.value)}
                className="w-full px-2 py-1.5 bg-blue-950/50 border border-blue-800/30 rounded text-white text-xs"
              >
                <option value="">No item</option>
                {storyData.inventory.map((i) => (
                  <option key={i.name} value={i.name}>
                    {i.name} x{i.quantity}
                  </option>
                ))}
              </select>
            )}
            {storyData.resources.length > 0 && (
              <select
                value={builderResource}
                onChange={(e) => setBuilderResource(e.target.value)}
                className="w-full px-2 py-1.5 bg-blue-950/50 border border-blue-800/30 rounded text-white text-xs"
              >
                <option value="">No resource</option>
                {storyData.resources.map((r) => (
                  <option key={r.name} value={r.name}>
                    {r.name} ({r.value}/{r.maxValue})
                  </option>
                ))}
              </select>
            )}
          </div>
        )}

        <button
          onClick={handleManualActionSubmit}
          disabled={loading}
          className="w-full py-2 bg-amber-600 hover:bg-amber-500 text-white rounded text-sm font-medium transition-colors"
        >
          Submit Action
        </button>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-linear-to-b from-gray-900 via-blue-950 to-purple-950 rounded-xl shadow-2xl border border-blue-800/30 max-w-2xl w-full mx-4 max-h-[85vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-blue-800/30">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <DynamicIcon
              name={actionMode ? "PenLine" : "Compass"}
              className="w-5 h-5 text-blue-400"
            />
            {actionMode ? "Your Action" : "Choose Your Path"}
          </h2>
          <div className="flex items-center gap-2">
            {/* Mode Toggle */}
            {onActionModeChange && (
              <button
                onClick={() => onActionModeChange(!actionMode)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 ${
                  actionMode
                    ? "bg-purple-600/30 text-purple-300 hover:bg-purple-600/50"
                    : "bg-blue-600/30 text-blue-300 hover:bg-blue-600/50"
                }`}
                title={
                  actionMode
                    ? "Switch to Choices"
                    : "Switch to Freeform Actions"
                }
              >
                <DynamicIcon
                  name={actionMode ? "List" : "PenLine"}
                  className="w-3.5 h-3.5"
                />
                {actionMode ? "Choices" : "Freeform"}
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2.5 sm:p-2 text-blue-200/60 hover:text-white hover:bg-blue-900/50 rounded-lg transition-colors touch-manipulation"
            >
              <DynamicIcon name="X" className="w-5 h-5 sm:w-4 sm:h-4" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto overscroll-contain p-4 sm:p-3 space-y-2.5 sm:space-y-2">
          {actionMode ? (
            /* ACTION MODE */
            <div className="space-y-3">
              {/* Action Input */}
              <div className="space-y-2">
                <textarea
                  value={actionText}
                  onChange={(e) => {
                    setActionText(e.target.value);
                    setAnalysisResult(null);
                    setShowActionBuilder(false);
                  }}
                  placeholder="Describe your action... (e.g., 'I kick the door open' or 'I try to convince the guard to let us pass')"
                  rows={3}
                  disabled={analyzingAction || loading}
                  className="w-full px-3 py-2 bg-blue-950/50 border border-blue-800/30 rounded-lg text-white placeholder-blue-200/40 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none text-sm"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && e.ctrlKey && actionText.trim()) {
                      e.preventDefault();
                      if (analysisResult) {
                        handleActionConfirmClick();
                      } else {
                        handleActionAnalyze();
                      }
                    }
                  }}
                />
                <p className="text-xs text-blue-200/40">
                  {actionText.length} characters • Ctrl+Enter to{" "}
                  {analysisResult ? "confirm" : "analyze"}
                </p>
              </div>

              {/* Analysis Result or Builder */}
              {analysisResult && renderAnalysisDetails()}
              {showActionBuilder && renderActionBuilder()}

              {/* Analyze/Confirm Button */}
              {!showActionBuilder && (
                <button
                  onClick={
                    analysisResult
                      ? handleActionConfirmClick
                      : handleActionAnalyze
                  }
                  disabled={!actionText.trim() || analyzingAction || loading}
                  className={`w-full py-3 rounded-lg font-medium transition-colors flex items-center justify-center gap-2 ${
                    !actionText.trim() || analyzingAction || loading
                      ? "bg-blue-800/50 text-blue-400 cursor-not-allowed"
                      : analysisResult
                      ? "bg-green-600 hover:bg-green-500 text-white"
                      : "bg-blue-600 hover:bg-blue-500 text-white"
                  }`}
                >
                  {analyzingAction ? (
                    <>
                      <DynamicIcon
                        name="Loader2"
                        className="w-4 h-4 animate-spin"
                      />
                      Analyzing...
                    </>
                  ) : loading ? (
                    <>
                      <DynamicIcon
                        name="Loader2"
                        className="w-4 h-4 animate-spin"
                      />
                      Generating...
                    </>
                  ) : analysisResult ? (
                    <>
                      <DynamicIcon name="Play" className="w-4 h-4" />
                      Confirm & Roll
                    </>
                  ) : (
                    <>
                      <DynamicIcon name="Sparkles" className="w-4 h-4" />
                      Analyze Action
                    </>
                  )}
                </button>
              )}
            </div>
          ) : (
            /* CHOICE MODE */
            <>
              {choices?.choices.map((choice, index) => {
                const isSelected = selectedChoice?.text === choice.text;
                const details = getChoiceDetails(choice);

                return (
                  <button
                    key={index}
                    onClick={() => onSelectChoice(choice)}
                    className={`w-full text-left p-4 sm:p-3 rounded-lg transition-all border touch-manipulation ${
                      isSelected
                        ? "bg-blue-600/20 border-blue-500/50"
                        : "bg-blue-900/30 border-blue-800/30 hover:border-blue-600/50 active:bg-blue-800/40"
                    }`}
                  >
                    <div className="flex items-start gap-2.5">
                      <div
                        className={`mt-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                          isSelected
                            ? "border-blue-400 bg-blue-500"
                            : "border-blue-700"
                        }`}
                      >
                        {isSelected && (
                          <DynamicIcon
                            name="Check"
                            className="w-2.5 h-2.5 text-white"
                          />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-sm">{choice.text}</p>
                        {details.length > 0 && (
                          <div className="mt-1.5 flex flex-wrap gap-1.5">
                            {details}
                          </div>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}

              {/* Custom Input Toggle */}
              <button
                onClick={() => setShowCustomInput(!showCustomInput)}
                className={`w-full text-left p-4 sm:p-3 rounded-lg transition-all border border-dashed touch-manipulation ${
                  showCustomInput
                    ? "bg-blue-600/10 border-blue-500/50"
                    : "bg-blue-900/20 border-blue-800/30 hover:border-blue-600/50 active:bg-blue-800/30"
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <DynamicIcon
                    name={showCustomInput ? "X" : "PenLine"}
                    className={`w-4 h-4 ${
                      showCustomInput ? "text-blue-400" : "text-blue-200/60"
                    }`}
                  />
                  <span
                    className={`text-sm font-medium ${
                      showCustomInput ? "text-blue-300" : "text-blue-200/60"
                    }`}
                  >
                    {showCustomInput
                      ? "Cancel Custom Action"
                      : "Write Your Own Action"}
                  </span>
                </div>
              </button>

              {/* Custom Input Area */}
              {showCustomInput && (
                <div className="bg-blue-900/30 rounded-lg p-3 border border-blue-800/30 space-y-2">
                  <textarea
                    value={customInput}
                    onChange={(e) => setCustomInput(e.target.value)}
                    placeholder="Describe your action, dialogue, or narration..."
                    rows={3}
                    className="w-full px-3 py-2 bg-blue-950/50 border border-blue-800/30 rounded-lg text-white placeholder-blue-200/40 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none text-sm"
                  />
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-blue-200/40">
                      {customInput.length} characters • No skill check
                    </span>
                    <button
                      onClick={handleSubmitCustom}
                      disabled={
                        submittingCustom || loading || !customInput.trim()
                      }
                      className={`px-3 py-1.5 rounded-lg font-medium transition-colors text-sm ${
                        submittingCustom || loading || !customInput.trim()
                          ? "bg-blue-800/50 text-blue-400 cursor-not-allowed"
                          : "bg-blue-600 hover:bg-blue-700 text-white"
                      }`}
                    >
                      {submittingCustom ? "Submitting..." : "Submit Action"}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer with Momentum & Confirm */}
        <div className="p-3 border-t border-blue-800/30 bg-blue-900/30 space-y-2">
          {/* Momentum Controls - show for choice mode with skill check OR action mode with analyzed skill check */}
          {((actionMode && actionHasSkillCheck) ||
            (!actionMode && selectedChoice && hasSkillCheck)) && (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <DynamicIcon name="Zap" className="w-4 h-4 text-yellow-400" />
                <span className="text-xs text-blue-200/60">
                  {storyData.momentum}/{storyData.maxMomentum}
                </span>
                <div className="flex gap-0.5 ml-1">
                  {Array.from({ length: storyData.maxMomentum }).map((_, i) => (
                    <div
                      key={i}
                      className={`w-2 h-2 rounded-full ${
                        i < storyData.momentum ? "bg-yellow-400" : "bg-blue-800"
                      }`}
                    />
                  ))}
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() =>
                    onMomentumModeChange(
                      momentumMode === "reroll" ? "none" : "reroll"
                    )
                  }
                  disabled={actionMode ? !canUseRerollAction : !canUseReroll}
                  className={`px-3 py-2 sm:px-2 sm:py-1 text-xs font-medium rounded-lg transition-all flex items-center gap-1.5 touch-manipulation ${
                    momentumMode === "reroll"
                      ? "bg-yellow-500 text-white"
                      : (actionMode ? canUseRerollAction : canUseReroll)
                      ? "bg-blue-900/50 text-blue-200/70 hover:bg-yellow-500/30 active:bg-yellow-500/50"
                      : "bg-blue-950/50 text-blue-500 cursor-not-allowed"
                  }`}
                >
                  <DynamicIcon name="Dices" className="w-4 h-4 sm:w-3 sm:h-3" />
                  Reroll (1)
                </button>
                <button
                  onClick={() =>
                    onMomentumModeChange(
                      momentumMode === "guarantee" ? "none" : "guarantee"
                    )
                  }
                  disabled={
                    actionMode ? !canUseGuaranteeAction : !canUseGuarantee
                  }
                  className={`px-3 py-2 sm:px-2 sm:py-1 text-xs font-medium rounded-lg transition-all flex items-center gap-1.5 touch-manipulation ${
                    momentumMode === "guarantee"
                      ? "bg-green-500 text-white"
                      : (actionMode ? canUseGuaranteeAction : canUseGuarantee)
                      ? "bg-blue-900/50 text-blue-200/70 hover:bg-green-500/30 active:bg-green-500/50"
                      : "bg-blue-950/50 text-blue-500 cursor-not-allowed"
                  }`}
                >
                  <DynamicIcon name="Check" className="w-4 h-4 sm:w-3 sm:h-3" />
                  Guarantee (2)
                </button>
              </div>
            </div>
          )}

          {/* Confirm Button - only for choice mode */}
          {!actionMode && (
            <button
              onClick={() => {
                onConfirm();
                onClose();
              }}
              disabled={!selectedChoice || loading}
              className={`w-full py-3.5 sm:py-2.5 rounded-lg font-semibold transition-all duration-150 flex items-center justify-center gap-2 touch-manipulation ${
                !selectedChoice || loading
                  ? "bg-blue-800/50 text-blue-400 cursor-not-allowed"
                  : "bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white"
              }`}
            >
              {loading ? (
                <>
                  <DynamicIcon
                    name="Loader2"
                    className="w-4 h-4 animate-spin"
                  />
                  Generating...
                </>
              ) : momentumMode === "reroll" ? (
                <>
                  <DynamicIcon name="Dices" className="w-4 h-4" />
                  Continue with Reroll
                </>
              ) : momentumMode === "guarantee" ? (
                <>
                  <DynamicIcon name="Check" className="w-4 h-4" />
                  Continue Guaranteed
                </>
              ) : (
                <>
                  <DynamicIcon name="Sparkles" className="w-4 h-4" />
                  Continue Story
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
