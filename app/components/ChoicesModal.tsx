"use client";

import React, { useState, useEffect } from "react";
import { Choice, Choices, StoryData } from "../misc/structs";
import { DynamicIcon } from "./DynamicIcon";
import {
  findStatMatch,
  findResourceMatch,
  findItemMatch,
} from "../misc/fuzzyMatch";

interface ChoicesModalProps {
  isOpen: boolean;
  onClose: () => void;
  choices: Choices;
  storyData: StoryData;
  selectedChoice: Choice | null;
  onSelectChoice: (choice: Choice) => void;
  onConfirm: () => void;
  onCustomInput?: (text: string) => void;
  loading: boolean;
  momentumMode: "none" | "reroll" | "guarantee";
  onMomentumModeChange: (mode: "none" | "reroll" | "guarantee") => void;
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
  loading,
  momentumMode,
  onMomentumModeChange,
}: ChoicesModalProps) {
  const [customInput, setCustomInput] = useState("");
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [submittingCustom, setSubmittingCustom] = useState(false);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setShowCustomInput(false);
      setCustomInput("");
    }
  }, [isOpen]);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const hasSkillCheck = selectedChoice?.skill_used !== undefined;
  const canUseReroll = storyData.momentum >= 1 && hasSkillCheck;
  const canUseGuarantee = storyData.momentum >= 2 && hasSkillCheck;

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
            <DynamicIcon name="Compass" className="w-5 h-5 text-blue-400" />
            Choose Your Path
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 text-blue-200/60 hover:text-white hover:bg-blue-900/50 rounded-lg transition-colors"
          >
            <DynamicIcon name="X" className="w-4 h-4" />
          </button>
        </div>

        {/* Choices List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {choices?.choices.map((choice, index) => {
            const isSelected = selectedChoice?.text === choice.text;
            const details = getChoiceDetails(choice);

            return (
              <button
                key={index}
                onClick={() => onSelectChoice(choice)}
                className={`w-full text-left p-3 rounded-lg transition-all border ${
                  isSelected
                    ? "bg-blue-600/20 border-blue-500/50"
                    : "bg-blue-900/30 border-blue-800/30 hover:border-blue-600/50"
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
            className={`w-full text-left p-3 rounded-lg transition-all border border-dashed ${
              showCustomInput
                ? "bg-blue-600/10 border-blue-500/50"
                : "bg-blue-900/20 border-blue-800/30 hover:border-blue-600/50"
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
                  disabled={submittingCustom || loading || !customInput.trim()}
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
        </div>

        {/* Footer with Momentum & Confirm */}
        <div className="p-3 border-t border-blue-800/30 bg-blue-900/30 space-y-2">
          {/* Momentum Controls */}
          {selectedChoice && hasSkillCheck && (
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
              <div className="flex gap-1.5">
                <button
                  onClick={() =>
                    onMomentumModeChange(
                      momentumMode === "reroll" ? "none" : "reroll"
                    )
                  }
                  disabled={!canUseReroll}
                  className={`px-2 py-1 text-xs font-medium rounded-lg transition-all flex items-center gap-1 ${
                    momentumMode === "reroll"
                      ? "bg-yellow-500 text-white"
                      : canUseReroll
                      ? "bg-blue-900/50 text-blue-200/70 hover:bg-yellow-500/30"
                      : "bg-blue-950/50 text-blue-500 cursor-not-allowed"
                  }`}
                >
                  <DynamicIcon name="Dices" className="w-3 h-3" />
                  Reroll (1)
                </button>
                <button
                  onClick={() =>
                    onMomentumModeChange(
                      momentumMode === "guarantee" ? "none" : "guarantee"
                    )
                  }
                  disabled={!canUseGuarantee}
                  className={`px-2 py-1 text-xs font-medium rounded-lg transition-all flex items-center gap-1 ${
                    momentumMode === "guarantee"
                      ? "bg-green-500 text-white"
                      : canUseGuarantee
                      ? "bg-blue-900/50 text-blue-200/70 hover:bg-green-500/30"
                      : "bg-blue-950/50 text-blue-500 cursor-not-allowed"
                  }`}
                >
                  <DynamicIcon name="Check" className="w-3 h-3" />
                  Guarantee (2)
                </button>
              </div>
            </div>
          )}

          {/* Confirm Button */}
          <button
            onClick={() => {
              onConfirm();
              onClose();
            }}
            disabled={!selectedChoice || loading}
            className={`w-full py-2.5 rounded-lg font-semibold transition-all duration-150 flex items-center justify-center gap-2 ${
              !selectedChoice || loading
                ? "bg-blue-800/50 text-blue-400 cursor-not-allowed"
                : "bg-blue-600 hover:bg-blue-500 text-white"
            }`}
          >
            {loading ? (
              <>
                <DynamicIcon name="Loader2" className="w-4 h-4 animate-spin" />
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
        </div>
      </div>
    </div>
  );
}
