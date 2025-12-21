"use client";

import React, { useState, useEffect, useRef } from "react";
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
  onConfirm: (playerComment?: string) => void;
  onCustomInput?: (text: string, playerComment?: string) => void;
  onActionSubmit?: (
    text: string
  ) => Promise<{ analysis: ActionAnalysis; warnings: string[] } | null>;
  onActionConfirm?: (choice: Choice, playerComment?: string) => void;
  onRerollChoices?: () => void;
  loading: boolean;
  momentumMode: "none" | "advantage" | "guarantee";
  onMomentumModeChange: (mode: "none" | "advantage" | "guarantee") => void;
  actionMode?: boolean;
  onActionModeChange?: (enabled: boolean) => void;
}

type PendingMultiplayerAction = {
  name: string;
  action: string;
  comment?: string;
};

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
  onRerollChoices,
  loading,
  momentumMode,
  onMomentumModeChange,
  actionMode = false,
  onActionModeChange,
}: ChoicesModalProps) {
  // Action mode state
  const [actionText, setActionText] = useState("");
  const [playerComment, setPlayerComment] = useState("");
  const [analyzingAction, setAnalyzingAction] = useState(false);
  const [showActionBuilder, setShowActionBuilder] = useState(false);

  const multiplayerEnabled = !!storyData.multiplayer?.enabled;
  const multiplayerPlayers = storyData.multiplayer?.players || [];
  const multiplayerHost = storyData.multiplayer?.host || "";
  const [multiplayerName, setMultiplayerName] = useState("");
  const [pendingMultiplayer, setPendingMultiplayer] = useState<
    PendingMultiplayerAction[]
  >([]);

  // Action builder state
  const [builderSkill, setBuilderSkill] = useState("");
  const [builderDc, setBuilderDc] = useState(12);
  const [builderItem, setBuilderItem] = useState("");
  const [builderResource, setBuilderResource] = useState("");
  const [builderPlain, setBuilderPlain] = useState(true);

  const rpgSystem = getRPGSystem(storyData.rpgSystem || "3d6");

  // Ref for auto-focusing textarea in action mode
  const actionTextareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-focus textarea when action mode opens
  useEffect(() => {
    if (isOpen && actionMode && actionTextareaRef.current) {
      // Small delay to ensure modal is rendered and keyboard can open
      const timer = setTimeout(() => {
        actionTextareaRef.current?.focus();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isOpen, actionMode]);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setActionText("");
      setPlayerComment("");
      setAnalyzingAction(false);
      setShowActionBuilder(false);
      setBuilderSkill("");
      setBuilderDc(rpgSystem.dc.medium);
      setBuilderItem("");
      setBuilderResource("");
      setBuilderPlain(true);
      setPendingMultiplayer([]);
      setMultiplayerName("");
    }
  }, [isOpen, rpgSystem.dc.medium]);

  // Initialize multiplayer name when opening
  useEffect(() => {
    if (!isOpen) return;
    if (!multiplayerEnabled) return;

    const defaultName =
      multiplayerHost || multiplayerPlayers[0] || storyData.displayName || "";
    setMultiplayerName((prev) => prev || defaultName);
  }, [
    isOpen,
    multiplayerEnabled,
    multiplayerHost,
    multiplayerPlayers,
    storyData.displayName,
  ]);

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
  const canUseAdvantage = storyData.momentum >= 1 && hasSkillCheck;
  const canUseGuarantee = storyData.momentum >= 3 && hasSkillCheck;

  const handleActionAnalyze = async (
    overrideText?: string,
    isStt?: boolean
  ) => {
    const text = (overrideText ?? actionText).trim();

    // If no text, just send "> continue"
    if (!text) {
      if (onActionConfirm) {
        const choice: Choice = {
          text: "continue",
        };
        onActionConfirm(choice, playerComment.trim() || undefined);
        onClose();
      }
      return;
    }

    if (!onActionSubmit || !onActionConfirm) return;

    setAnalyzingAction(true);
    setShowActionBuilder(false);
    try {
      const result = await onActionSubmit(text);
      if (result) {
        // Directly submit the action without requiring confirmation
        const choice: Choice = {
          text: text,
          skill_used: result.analysis.skill_used || undefined,
          skill_dc: result.analysis.skill_dc || undefined,
          item_used: result.analysis.item_used || undefined,
          resource_used: result.analysis.resource_used || undefined,
          agmt_check: result.analysis.agmt_check || undefined,
          table: result.analysis.table || undefined,
          stt_input: isStt || undefined,
        };
        onActionConfirm(choice, playerComment.trim() || undefined);
        onClose();
      } else {
        // Analysis failed - show action builder
        setShowActionBuilder(true);
        setAnalyzingAction(false);
      }
    } catch (error) {
      console.error("Action analysis failed:", error);
      setShowActionBuilder(true);
      setAnalyzingAction(false);
    }
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

    onActionConfirm(choice, playerComment.trim() || undefined);
    onClose();
  };

  const handleMultiplayerAdd = () => {
    const name = multiplayerName.trim();
    const action = actionText.trim();
    if (!name || !action) return;

    setPendingMultiplayer((prev) => {
      // Replace existing action from same player (latest wins)
      const next = prev.filter(
        (p) => p.name.toLowerCase() !== name.toLowerCase()
      );
      next.push({
        name,
        action,
        comment: playerComment.trim() || undefined,
      });
      return next;
    });

    setActionText("");
    setPlayerComment("");
    setShowActionBuilder(false);
  };

  const handleMultiplayerSend = (force: boolean) => {
    if (!onCustomInput) return;
    if (pendingMultiplayer.length === 0) return;

    const requiredPlayers = multiplayerPlayers
      .map((p) => p.trim())
      .filter(Boolean);
    const hasByName = new Set(
      pendingMultiplayer.map((p) => p.name.toLowerCase())
    );
    const allReady =
      requiredPlayers.length === 0 ||
      requiredPlayers.every((p) => hasByName.has(p.toLowerCase()));

    if (!force && !allReady) return;

    // Build a custom input payload that results in:
    // > Alice: action
    // > Bob: action
    const lines = pendingMultiplayer
      .map((p, idx) =>
        idx === 0 ? `${p.name}: ${p.action}` : `>${p.name}: ${p.action}`
      )
      .join("\n");

    const commentLines = pendingMultiplayer
      .filter((p) => p.comment && p.comment.trim())
      .map((p) => `${p.name}: ${p.comment}`)
      .join("\n");

    onCustomInput(lines, commentLines || undefined);
    setPendingMultiplayer([]);
    setPlayerComment("");
    setActionText("");
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

    // AGMT check
    if (choice.agmt_check) {
      details.push(
        <div key="mythic" className="flex items-center gap-2 text-purple-400">
          <DynamicIcon name="Sparkles" className="w-4 h-4" />
          <span className="text-sm">Fate Check</span>
        </div>
      );
    }

    // Unified table field (or legacy agmt_table/custom_table)
    const tableToShow =
      choice.table || choice.agmt_table || choice.custom_table;
    if (tableToShow) {
      details.push(
        <div key="table" className="flex items-center gap-2 text-indigo-400">
          <DynamicIcon name="Dices" className="w-4 h-4" />
          <span className="text-sm">Table: {tableToShow}</span>
        </div>
      );
    }

    return details;
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
    <div
      className={`fixed inset-0 z-50 flex justify-center ${
        actionMode ? "items-start pt-4 sm:items-center sm:pt-0" : "items-center"
      }`}
    >
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
              {multiplayerEnabled && (
                <div className="space-y-2">
                  <div className="flex flex-col sm:flex-row gap-2">
                    <div className="flex-1">
                      <label className="block text-xs font-medium text-blue-200/70 mb-1">
                        Name
                      </label>
                      <input
                        value={multiplayerName}
                        onChange={(e) => setMultiplayerName(e.target.value)}
                        placeholder={
                          multiplayerHost ||
                          multiplayerPlayers[0] ||
                          "Your name"
                        }
                        className="w-full px-3 py-2 bg-blue-950/50 border border-blue-800/30 rounded-lg text-white placeholder-blue-200/40 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                      />
                    </div>
                    <div className="sm:w-56">
                      <label className="block text-xs font-medium text-blue-200/70 mb-1">
                        Turn status
                      </label>
                      <div className="px-3 py-2 bg-blue-950/30 border border-blue-800/20 rounded-lg text-xs text-blue-200/60">
                        {pendingMultiplayer.length} submitted
                      </div>
                    </div>
                  </div>

                  {pendingMultiplayer.length > 0 && (
                    <div className="bg-blue-950/30 border border-blue-800/20 rounded-lg p-3 space-y-2">
                      <div className="text-xs font-medium text-blue-200/70">
                        Pending actions
                      </div>
                      {pendingMultiplayer.map((p) => (
                        <div
                          key={p.name}
                          className="flex items-start justify-between gap-2 bg-blue-900/20 border border-blue-800/20 rounded-lg px-3 py-2"
                        >
                          <div className="min-w-0">
                            <div className="text-xs text-blue-200/80 font-semibold">
                              {p.name}
                            </div>
                            <div className="text-xs text-blue-100/80 whitespace-pre-wrap">
                              {p.action}
                            </div>
                            {p.comment && (
                              <div className="text-[11px] text-blue-200/60 italic mt-1">
                                Comment: {p.comment}
                              </div>
                            )}
                          </div>
                          <button
                            onClick={() =>
                              setPendingMultiplayer((prev) =>
                                prev.filter(
                                  (x) =>
                                    x.name.toLowerCase() !==
                                    p.name.toLowerCase()
                                )
                              )
                            }
                            className="px-2 py-1 text-xs bg-red-600/70 hover:bg-red-600 text-white rounded"
                            title="Remove"
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Action Input */}
              <div className="space-y-2">
                <div className="flex gap-2">
                  <textarea
                    ref={actionTextareaRef}
                    value={actionText}
                    onChange={(e) => {
                      setActionText(e.target.value);
                      setShowActionBuilder(false);
                    }}
                    placeholder="Describe your action... (e.g., 'I kick the door open' or 'I try to convince the guard to let us pass')"
                    rows={3}
                    disabled={analyzingAction || loading}
                    className="flex-1 px-3 py-2 bg-blue-950/50 border border-blue-800/30 rounded-lg text-white placeholder-blue-200/40 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none text-sm"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && e.ctrlKey && actionText.trim()) {
                        e.preventDefault();
                        handleActionAnalyze(undefined, undefined);
                      }
                    }}
                  />
                </div>
                <p className="text-xs text-blue-200/40">
                  {actionText.length} characters • Ctrl+Enter to act
                </p>
              </div>

              {/* Player Comment (not sent to AI) */}
              <div className="space-y-1">
                <label className="block text-xs font-medium text-blue-200/70">
                  Comment (not sent to AI)
                </label>
                <textarea
                  value={playerComment}
                  onChange={(e) => setPlayerComment(e.target.value)}
                  placeholder="Write a note for the other players..."
                  rows={2}
                  disabled={analyzingAction || loading}
                  className="w-full px-3 py-2 bg-blue-950/30 border border-blue-800/20 rounded-lg text-white placeholder-blue-200/30 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none text-sm"
                />
              </div>

              {/* Action Builder (only shown when analysis fails) */}
              {showActionBuilder && renderActionBuilder()}

              {/* Act / Multiplayer buttons */}
              {!showActionBuilder && (
                <>
                  {multiplayerEnabled ? (
                    <div className="space-y-2">
                      <button
                        onClick={handleMultiplayerAdd}
                        disabled={
                          loading ||
                          analyzingAction ||
                          !multiplayerName.trim() ||
                          !actionText.trim()
                        }
                        className={`w-full py-3 rounded-lg font-medium transition-colors flex items-center justify-center gap-2 ${
                          loading ||
                          analyzingAction ||
                          !multiplayerName.trim() ||
                          !actionText.trim()
                            ? "bg-blue-800/50 text-blue-400 cursor-not-allowed"
                            : "bg-blue-600 hover:bg-blue-500 text-white"
                        }`}
                      >
                        <DynamicIcon name="Plus" className="w-4 h-4" />
                        Add To Turn
                      </button>

                      <div className="grid grid-cols-2 gap-2">
                        <button
                          onClick={() => handleMultiplayerSend(false)}
                          disabled={loading || pendingMultiplayer.length === 0}
                          className={`py-3 rounded-lg font-medium transition-colors ${
                            loading || pendingMultiplayer.length === 0
                              ? "bg-purple-800/30 text-purple-300/40 cursor-not-allowed"
                              : "bg-purple-600 hover:bg-purple-500 text-white"
                          }`}
                        >
                          Generate (when ready)
                        </button>
                        <button
                          onClick={() => handleMultiplayerSend(true)}
                          disabled={loading || pendingMultiplayer.length === 0}
                          className={`py-3 rounded-lg font-medium transition-colors ${
                            loading || pendingMultiplayer.length === 0
                              ? "bg-amber-800/30 text-amber-300/40 cursor-not-allowed"
                              : "bg-amber-600 hover:bg-amber-500 text-white"
                          }`}
                        >
                          Force Send
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => handleActionAnalyze()}
                      disabled={analyzingAction || loading}
                      className={`w-full py-3 rounded-lg font-medium transition-colors flex items-center justify-center gap-2 ${
                        analyzingAction || loading
                          ? "bg-blue-800/50 text-blue-400 cursor-not-allowed"
                          : "bg-blue-600 hover:bg-blue-500 text-white"
                      }`}
                    >
                      {analyzingAction || loading ? (
                        <>
                          <DynamicIcon
                            name="Loader2"
                            className="w-4 h-4 animate-spin"
                          />
                          {analyzingAction ? "Processing..." : "Generating..."}
                        </>
                      ) : actionText.trim() ? (
                        <>
                          <DynamicIcon name="Play" className="w-4 h-4" />
                          Act
                        </>
                      ) : (
                        <>
                          <DynamicIcon name="FastForward" className="w-4 h-4" />
                          Continue
                        </>
                      )}
                    </button>
                  )}
                </>
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

              {/* Reroll Choices Button */}
              {onRerollChoices && (
                <button
                  onClick={onRerollChoices}
                  disabled={loading}
                  className={`w-full text-left p-4 sm:p-3 rounded-lg transition-all border border-dashed touch-manipulation ${
                    loading
                      ? "bg-blue-900/10 border-blue-800/20 cursor-not-allowed"
                      : "bg-blue-900/20 border-blue-800/30 hover:border-purple-500/50 hover:bg-purple-900/20 active:bg-purple-800/30"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <DynamicIcon
                      name={loading ? "Loader2" : "RefreshCw"}
                      className={`w-4 h-4 text-purple-300/60 ${
                        loading ? "animate-spin" : ""
                      }`}
                    />
                    <span className="text-sm font-medium text-purple-200/60">
                      {loading
                        ? "Generating..."
                        : choices.choices.length === 0
                        ? "Generate Choices"
                        : "Reroll Choices"}
                    </span>
                  </div>
                </button>
              )}
            </>
          )}
        </div>

        {/* Footer with Momentum & Confirm */}
        <div className="p-3 border-t border-blue-800/30 bg-blue-900/30 space-y-2">
          {/* Momentum Controls - show for both modes */}
          {/* In choice mode: only show if selected choice has skill check */}
          {/* In action mode: always show (will apply if AI detects skill check) */}
          {(actionMode || (selectedChoice && hasSkillCheck)) && (
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
                {(actionMode ? storyData.momentum >= 1 : canUseAdvantage) && (
                  <button
                    onClick={() =>
                      onMomentumModeChange(
                        momentumMode === "advantage" ? "none" : "advantage"
                      )
                    }
                    title={
                      actionMode
                        ? "Advantage if action requires a skill check"
                        : undefined
                    }
                    className={`px-3 py-2 sm:px-2 sm:py-1 text-xs font-medium rounded-lg transition-all flex items-center gap-1.5 touch-manipulation ${
                      momentumMode === "advantage"
                        ? "bg-yellow-500 text-white"
                        : "bg-blue-900/50 text-blue-200/70 hover:bg-yellow-500/30 active:bg-yellow-500/50"
                    }`}
                  >
                    <DynamicIcon
                      name="Dices"
                      className="w-4 h-4 sm:w-3 sm:h-3"
                    />
                    Advantage (1)
                  </button>
                )}
                {(actionMode ? storyData.momentum >= 3 : canUseGuarantee) && (
                  <button
                    onClick={() =>
                      onMomentumModeChange(
                        momentumMode === "guarantee" ? "none" : "guarantee"
                      )
                    }
                    title={
                      actionMode
                        ? "Guarantee success if action requires a skill check"
                        : undefined
                    }
                    className={`px-3 py-2 sm:px-2 sm:py-1 text-xs font-medium rounded-lg transition-all flex items-center gap-1.5 touch-manipulation ${
                      momentumMode === "guarantee"
                        ? "bg-green-500 text-white"
                        : "bg-blue-900/50 text-blue-200/70 hover:bg-green-500/30 active:bg-green-500/50"
                    }`}
                  >
                    <DynamicIcon
                      name="Check"
                      className="w-4 h-4 sm:w-3 sm:h-3"
                    />
                    Guarantee (3)
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Player Comment (not sent to AI) */}
          <div className="space-y-1">
            <label className="block text-xs font-medium text-blue-200/70">
              Comment (not sent to AI)
            </label>
            <textarea
              value={playerComment}
              onChange={(e) => setPlayerComment(e.target.value)}
              placeholder="Write a note for the other players..."
              rows={2}
              disabled={loading}
              className="w-full px-3 py-2 bg-blue-950/30 border border-blue-800/20 rounded-lg text-white placeholder-blue-200/30 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none text-sm"
            />
          </div>

          {/* Confirm Button - only for choice mode */}
          {!actionMode && (
            <button
              onClick={() => {
                onConfirm(playerComment.trim() || undefined);
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
              ) : momentumMode === "advantage" ? (
                <>
                  <DynamicIcon name="Dices" className="w-4 h-4" />
                  Continue with Advantage
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
