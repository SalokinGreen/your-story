"use client";

import React, { useState, useEffect, useRef } from "react";
import { Choice, Choices, StoryData } from "../misc/structs";
import { DynamicIcon } from "./DynamicIcon";
import { getLocalPlayerId } from "@/app/misc/localPlayerId";
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
  onConfirm: (playerComment?: string) => void;
  onCustomInput?: (text: string, playerComment?: string) => void;
  onActionConfirm?: (choice: Choice, playerComment?: string) => void;
  onCommentSubmit?: (comment: string) => void;
  onRerollChoices?: () => void;
  loading: boolean;
  actionMode?: boolean;
  onActionModeChange?: (enabled: boolean) => void;
}

type PendingMultiplayerAction = {
  name: string;
  action: string;
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
  onActionConfirm,
  onCommentSubmit,
  onRerollChoices,
  loading,
  actionMode = false,
  onActionModeChange,
}: ChoicesModalProps) {
  const localPlayerId = getLocalPlayerId();

  // Action mode state
  const [actionText, setActionText] = useState("");
  const [commentMode, setCommentMode] = useState(false);

  const multiplayerEnabled = !!storyData.multiplayer?.enabled;
  const multiplayerMode = storyData.multiplayer?.mode || "host";
  const multiplayerHostUserId = storyData.multiplayer?.hostUserId || "";
  const multiplayerTimerMinutes = storyData.multiplayer?.timerMinutes ?? 2;
  const [multiplayerName, setMultiplayerName] = useState("");
  const [pendingMultiplayer, setPendingMultiplayer] = useState<
    PendingMultiplayerAction[]
  >([]);

  const [multiplayerTimerStart, setMultiplayerTimerStart] = useState<
    number | null
  >(null);
  const [timerNow, setTimerNow] = useState<number>(() => Date.now());

  const isHostUser =
    !!multiplayerHostUserId.trim() && localPlayerId === multiplayerHostUserId;

  const canManageTurn = (() => {
    if (!multiplayerEnabled) return true;
    if (multiplayerMode === "any") return true;
    // host + timer modes
    return isHostUser;
  })();

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
      setCommentMode(false);
      setPendingMultiplayer([]);
      setMultiplayerName("");
      setMultiplayerTimerStart(null);
    }
  }, [isOpen]);

  // Initialize multiplayer name when opening
  useEffect(() => {
    if (!isOpen) return;
    if (!multiplayerEnabled) return;

    const defaultName = storyData.displayName || storyData.player_name || "";
    setMultiplayerName((prev) => prev || defaultName);
  }, [
    isOpen,
    multiplayerEnabled,
    storyData.displayName,
    storyData.player_name,
  ]);

  // Timer mode: start after first queued input; host auto-generates when elapsed.
  useEffect(() => {
    if (!isOpen) return;
    if (!multiplayerEnabled) return;
    if (multiplayerMode !== "timer") {
      setMultiplayerTimerStart(null);
      return;
    }

    if (pendingMultiplayer.length === 0) {
      setMultiplayerTimerStart(null);
      return;
    }

    setMultiplayerTimerStart((prev) => prev ?? Date.now());
  }, [isOpen, multiplayerEnabled, multiplayerMode, pendingMultiplayer.length]);

  useEffect(() => {
    if (!isOpen) return;
    if (!multiplayerEnabled) return;
    if (multiplayerMode !== "timer") return;
    if (!multiplayerTimerStart) return;
    if (pendingMultiplayer.length === 0) return;

    const interval = window.setInterval(() => {
      setTimerNow(Date.now());
    }, 250);

    return () => window.clearInterval(interval);
  }, [
    isOpen,
    multiplayerEnabled,
    multiplayerMode,
    multiplayerTimerStart,
    pendingMultiplayer.length,
  ]);

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

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = "";
      };
    }
  }, [isOpen]);

  const handleActionAnalyze = (overrideText?: string, isStt?: boolean) => {
    const text = (overrideText ?? actionText).trim();

    // Multiplayer (non-comment): queue the action instead of submitting directly.
    if (multiplayerEnabled && !commentMode) {
      handleMultiplayerAdd();
      return;
    }

    // Comment mode: post a player-visible comment only (no generation)
    if (commentMode) {
      if (!onCommentSubmit) return;
      if (!text) return;
      onCommentSubmit(text);
      onClose();
      return;
    }

    if (!onActionConfirm) return;

    // No text: just send "> continue". Otherwise submit the freeform action
    // as-is - the GM stage determines mechanics (skill checks, items, dice)
    // during generation, so no client-side analysis step is needed here.
    const choice: Choice = text
      ? { text, stt_input: isStt || undefined }
      : { text: "continue" };
    onActionConfirm(choice, undefined);
    onClose();
  };

  const handleMultiplayerAdd = () => {
    const name = multiplayerName.trim();
    const action = actionText.trim();
    if (!name) return;
    const normalizedAction = action || "continue";

    setPendingMultiplayer((prev) => {
      // Replace existing action from same player (latest wins)
      const next = prev.filter(
        (p) => p.name.toLowerCase() !== name.toLowerCase(),
      );
      next.push({ name, action: normalizedAction });
      return next;
    });

    setActionText("");
  };

  const handleMultiplayerSkip = () => {
    const name = multiplayerName.trim();
    if (!name) return;
    setPendingMultiplayer((prev) => {
      const next = prev.filter(
        (p) => p.name.toLowerCase() !== name.toLowerCase(),
      );
      next.push({ name, action: "continue" });
      return next;
    });
    setActionText("");
  };

  const handleMultiplayerClear = () => {
    setPendingMultiplayer([]);
    setMultiplayerTimerStart(null);
  };

  const handleMultiplayerSend = () => {
    if (!onCustomInput) return;
    if (pendingMultiplayer.length === 0) return;

    if (!canManageTurn) return;

    // Build a custom input payload that results in:
    // > Alice: action
    // > Bob: action
    const lines = pendingMultiplayer
      .map((p) => `> ${p.name}: ${p.action}`)
      .join("\n");

    onCustomInput(lines, undefined);
    setPendingMultiplayer([]);
    setActionText("");
    setMultiplayerTimerStart(null);
    onClose();
  };

  // Auto-generate when timer expires (host only).
  useEffect(() => {
    if (!isOpen) return;
    if (!multiplayerEnabled) return;
    if (multiplayerMode !== "timer") return;
    if (!multiplayerTimerStart) return;
    if (pendingMultiplayer.length === 0) return;
    if (loading) return;
    if (!canManageTurn) return;

    const durationMs =
      Math.max(1, Math.floor(multiplayerTimerMinutes || 2)) * 60 * 1000;
    const elapsed = timerNow - multiplayerTimerStart;
    if (elapsed < durationMs) return;

    handleMultiplayerSend();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isOpen,
    multiplayerEnabled,
    multiplayerMode,
    multiplayerTimerStart,
    pendingMultiplayer.length,
    loading,
    canManageTurn,
    multiplayerTimerMinutes,
    timerNow,
  ]);

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
        </div>,
      );
    }

    // Resource cost
    if (choice.resource_used) {
      const matchResult = findResourceMatch(
        choice.resource_used,
        storyData.resources,
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
        </div>,
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
        </div>,
      );
    }

    // AGMT check
    if (choice.agmt_check) {
      details.push(
        <div key="mythic" className="flex items-center gap-2 text-purple-400">
          <DynamicIcon name="Sparkles" className="w-4 h-4" />
          <span className="text-sm">Fate Check</span>
        </div>,
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
        </div>,
      );
    }

    return details;
  };

  if (!isOpen) return null;

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
                        placeholder={storyData.player_name || "Your name"}
                        className="w-full px-3 py-2 bg-blue-950/50 border border-blue-800/30 rounded-lg text-white placeholder-blue-200/40 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                      />
                    </div>
                    <div className="sm:w-56">
                      <label className="block text-xs font-medium text-blue-200/70 mb-1">
                        Turn status
                      </label>
                      <div className="px-3 py-2 bg-blue-950/30 border border-blue-800/20 rounded-lg text-xs text-blue-200/60">
                        {pendingMultiplayer.length} queued
                        {multiplayerMode === "timer" &&
                          multiplayerTimerStart && (
                            <div className="mt-1 text-[11px] text-blue-200/50">
                              {(() => {
                                const durationMs =
                                  Math.max(
                                    1,
                                    Math.floor(multiplayerTimerMinutes || 2),
                                  ) *
                                  60 *
                                  1000;
                                const remainingMs = Math.max(
                                  0,
                                  durationMs -
                                    (timerNow - multiplayerTimerStart),
                                );
                                const remainingSec = Math.ceil(
                                  remainingMs / 1000,
                                );
                                const m = Math.floor(remainingSec / 60);
                                const s = remainingSec % 60;
                                return `Auto-generate in ${m}:${s
                                  .toString()
                                  .padStart(2, "0")}`;
                              })()}
                            </div>
                          )}
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
                          </div>
                          <button
                            onClick={() =>
                              setPendingMultiplayer((prev) =>
                                prev.filter(
                                  (x) =>
                                    x.name.toLowerCase() !==
                                    p.name.toLowerCase(),
                                ),
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
                <div className="flex items-center justify-between">
                  <div className="text-xs font-medium text-blue-200/70">
                    Comment mode
                  </div>
                  <button
                    type="button"
                    onClick={() => setCommentMode((prev) => !prev)}
                    className={`px-2.5 py-1.5 rounded-md text-xs font-semibold border transition-colors ${
                      commentMode
                        ? "bg-emerald-600/40 border-emerald-400/40 text-emerald-100"
                        : "bg-blue-950/30 border-blue-800/20 text-blue-200/60 hover:bg-blue-950/50"
                    }`}
                    disabled={loading}
                    title="When enabled, anything you submit is posted as a player-visible comment and is not sent to the AI."
                  >
                    {commentMode ? "On" : "Off"}
                  </button>
                </div>

                <div className="flex gap-2">
                  <textarea
                    ref={actionTextareaRef}
                    value={actionText}
                    onChange={(e) => setActionText(e.target.value)}
                    placeholder={
                      commentMode
                        ? "Write a comment for the other players..."
                        : "Describe your action... (e.g., 'I kick the door open' or 'I try to convince the guard to let us pass')"
                    }
                    rows={3}
                    disabled={loading}
                    className="flex-1 px-3 py-2 bg-blue-950/50 border border-blue-800/30 rounded-lg text-white placeholder-blue-200/40 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none text-sm"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && e.ctrlKey) {
                        e.preventDefault();
                        if (multiplayerEnabled && !commentMode) {
                          handleMultiplayerAdd();
                        } else {
                          handleActionAnalyze(undefined, undefined);
                        }
                      }
                    }}
                  />
                </div>
                <p className="text-xs text-blue-200/40">
                  {actionText.length} characters • Ctrl+Enter to submit
                </p>
              </div>

              {/* Act / Multiplayer buttons */}
              <>
                {multiplayerEnabled ? (
                    <div className="space-y-2">
                      {commentMode ? (
                        <button
                          onClick={() => handleActionAnalyze()}
                          disabled={
                            loading || (commentMode && !actionText.trim())
                          }
                          className={`w-full py-3 rounded-lg font-medium transition-colors flex items-center justify-center gap-2 ${
                            loading || (commentMode && !actionText.trim())
                              ? "bg-blue-800/50 text-blue-400 cursor-not-allowed"
                              : "bg-emerald-600 hover:bg-emerald-500 text-white"
                          }`}
                        >
                          <DynamicIcon
                            name="MessageSquare"
                            className="w-4 h-4"
                          />
                          Send Comment
                        </button>
                      ) : (
                        <>
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              onClick={handleMultiplayerAdd}
                              disabled={loading || !multiplayerName.trim()}
                              className={`py-3 rounded-lg font-medium transition-colors flex items-center justify-center gap-2 ${
                                loading || !multiplayerName.trim()
                                  ? "bg-blue-800/50 text-blue-400 cursor-not-allowed"
                                  : "bg-blue-600 hover:bg-blue-500 text-white"
                              }`}
                              title={
                                actionText.trim()
                                  ? "Submit your action for this turn"
                                  : "Submit a skip (continue) for this turn"
                              }
                            >
                              <DynamicIcon name="Plus" className="w-4 h-4" />
                              Add To Turn
                            </button>
                            <button
                              onClick={handleMultiplayerSkip}
                              disabled={loading || !multiplayerName.trim()}
                              className={`py-3 rounded-lg font-medium transition-colors flex items-center justify-center gap-2 ${
                                loading || !multiplayerName.trim()
                                  ? "bg-blue-800/50 text-blue-400 cursor-not-allowed"
                                  : "bg-blue-900/50 hover:bg-blue-900/70 text-blue-100"
                              }`}
                              title="Skip your turn (submit continue)"
                            >
                              <DynamicIcon
                                name="FastForward"
                                className="w-4 h-4"
                              />
                              Skip Turn
                            </button>
                          </div>

                          <button
                            onClick={handleMultiplayerSend}
                            disabled={
                              loading ||
                              pendingMultiplayer.length === 0 ||
                              !canManageTurn
                            }
                            className={`w-full py-3 rounded-lg font-medium transition-colors ${
                              loading ||
                              pendingMultiplayer.length === 0 ||
                              !canManageTurn
                                ? "bg-purple-800/30 text-purple-300/40 cursor-not-allowed"
                                : "bg-purple-600 hover:bg-purple-500 text-white"
                            }`}
                            title={
                              !canManageTurn
                                ? "Only the host can generate"
                                : undefined
                            }
                          >
                            {multiplayerMode === "timer"
                              ? "Generate Now"
                              : "Generate"}
                          </button>

                          <button
                            onClick={handleMultiplayerClear}
                            disabled={
                              loading ||
                              pendingMultiplayer.length === 0 ||
                              !canManageTurn
                            }
                            className={`w-full py-2.5 rounded-lg text-sm font-medium transition-colors ${
                              loading ||
                              pendingMultiplayer.length === 0 ||
                              !canManageTurn
                                ? "bg-red-950/30 text-red-200/30 cursor-not-allowed"
                                : "bg-red-600/60 hover:bg-red-600 text-white"
                            }`}
                            title={
                              !canManageTurn
                                ? "Only the host can clear the turn"
                                : undefined
                            }
                          >
                            Clear Turn
                          </button>
                        </>
                      )}
                    </div>
                  ) : (
                    <button
                      onClick={() => handleActionAnalyze()}
                      disabled={loading || (commentMode && !actionText.trim())}
                      className={`w-full py-3 rounded-lg font-medium transition-colors flex items-center justify-center gap-2 ${
                        loading || (commentMode && !actionText.trim())
                          ? "bg-blue-800/50 text-blue-400 cursor-not-allowed"
                          : "bg-blue-600 hover:bg-blue-500 text-white"
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
                      ) : commentMode ? (
                        <>
                          <DynamicIcon
                            name="MessageSquare"
                            className="w-4 h-4"
                          />
                          Send Comment
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

        {/* Footer with Confirm */}
        <div className="p-3 border-t border-blue-800/30 bg-blue-900/30 space-y-2">
          {/* Confirm Button - only for choice mode */}
          {!actionMode && (
            <button
              onClick={() => {
                onConfirm(undefined);
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
