"use client";

import React, { useEffect, useRef, useState } from "react";
import type {
  AskQuestionAnswer,
  AskQuestionAnswerItem,
  AskQuestionRequest,
} from "../misc/gmExecutor";
import type { CouchPlayer } from "../misc/structs";
import { DynamicIcon } from "./DynamicIcon";
import STTButton from "./STTButton";
import { useBackHandler } from "../misc/useBackHandler";
import { PLAYER_TEXT_COLOR } from "../misc/multiplayer/palette";

interface AskQuestionModalProps {
  // The pending question batch, or null when nothing is being asked
  request: AskQuestionRequest | null;
  // Couch players, used to color a targeted question's "who this is for" chip
  couchPlayers?: CouchPlayer[];
  onAnswer: (answer: AskQuestionAnswer) => void;
  onSkipAll: () => void;
}

/**
 * The GM called ask_question: generation is paused while the player(s) page
 * through 1-3 questions, each answered with a predefined option, free text,
 * or skipped.
 */
export default function AskQuestionModal({
  request,
  couchPlayers = [],
  onAnswer,
  onSkipAll,
}: AskQuestionModalProps) {
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<AskQuestionAnswerItem[]>([]);
  const [customText, setCustomText] = useState("");
  const [showCustomInput, setShowCustomInput] = useState(false);
  // The options ticked so far on a multi_select question.
  const [picked, setPicked] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset all local state whenever a new question batch comes in
  // (adjust-state-during-render pattern, avoids an effect + extra render)
  const [prevRequest, setPrevRequest] = useState<AskQuestionRequest | null>(
    null,
  );
  if (request !== prevRequest) {
    setPrevRequest(request);
    setQuestionIndex(0);
    setAnswers([]);
    setCustomText("");
    setShowCustomInput(false);
    setPicked([]);
  }

  useEffect(() => {
    if (request && showCustomInput) {
      const timer = setTimeout(() => inputRef.current?.focus(), 100);
      return () => clearTimeout(timer);
    }
  }, [request, showCustomInput, questionIndex]);

  // Android back skips the whole batch, as the GM's null answer (decision 133).
  useBackHandler(!!request && request.questions.length > 0, onSkipAll);

  if (!request || request.questions.length === 0) return null;

  const total = request.questions.length;
  const question = request.questions[questionIndex];
  const isLast = questionIndex === total - 1;
  const allowCustom = question.allow_custom !== false;

  const matchedPlayer = question.target_player_name
    ? couchPlayers.find(
        (p) =>
          p.name.trim().toLowerCase() ===
          question.target_player_name!.trim().toLowerCase(),
      )
    : undefined;

  const advance = (item: AskQuestionAnswerItem) => {
    const nextAnswers = [...answers, item];
    if (isLast) {
      onAnswer({ answers: nextAnswers });
    } else {
      setAnswers(nextAnswers);
      setQuestionIndex(questionIndex + 1);
      setCustomText("");
      setShowCustomInput(false);
      setPicked([]);
    }
  };

  const multi = question.multi_select === true;

  const selectOption = (label: string) => {
    advance({ selectedLabel: label, skipped: false });
  };

  const togglePick = (label: string) => {
    setPicked((prev) =>
      prev.includes(label) ? prev.filter((l) => l !== label) : [...prev, label],
    );
  };

  const submitPicks = () => {
    if (picked.length === 0) return;
    advance({ selectedLabels: picked, skipped: false });
  };

  const submitCustom = () => {
    const text = customText.trim();
    if (!text) return;
    advance(
      multi && picked.length > 0
        ? { selectedLabels: picked, customText: text, skipped: false }
        : { customText: text, skipped: false },
    );
  };

  const skipQuestion = () => {
    advance({ skipped: true });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center ys-modal-backdrop p-4">
      <div className="bg-ys-surface border border-ys-border rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-5 pt-5 pb-4 bg-ys-text/5 text-center">
          <div className="w-12 h-12 mx-auto mb-2 rounded-full bg-ys-text text-ys-bg flex items-center justify-center shadow-lg">
            <DynamicIcon name="HelpCircle" className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-bold text-ys-text">{question.question}</h3>
          {question.target_player_name && (
            <span
              className={`inline-flex items-center gap-1.5 mt-1.5 px-3 py-1 rounded-full text-xs font-semibold ${
                matchedPlayer ? "" : "bg-ys-text text-ys-bg"
              }`}
              style={
                matchedPlayer
                  ? {
                      backgroundColor: matchedPlayer.color,
                      color: PLAYER_TEXT_COLOR,
                    }
                  : undefined
              }
            >
              <DynamicIcon name="User" className="w-3 h-3" />
              For {question.target_player_name}
            </span>
          )}
        </div>

        <div className="p-5 space-y-4">
          {/* Predefined options */}
          <div className="space-y-2">
            {multi && (
              <p className="text-xs text-ys-muted text-center">
                Pick as many as you like.
              </p>
            )}
            {question.options.map((opt, idx) => {
              const checked = multi && picked.includes(opt.label);
              return (
                <button
                  key={idx}
                  onClick={() =>
                    multi ? togglePick(opt.label) : selectOption(opt.label)
                  }
                  role={multi ? "checkbox" : undefined}
                  aria-checked={multi ? checked : undefined}
                  className={`w-full text-left px-4 py-3 rounded-xl border active:scale-[0.99] transition-all ${
                    checked
                      ? "bg-ys-text/10 border-ys-accent"
                      : "bg-ys-text/5 border-ys-border hover:border-ys-muted hover:bg-ys-text/10"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {multi && (
                      <span
                        className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                          checked
                            ? "border-ys-accent bg-ys-accent text-ys-bg"
                            : "border-ys-muted"
                        }`}
                        aria-hidden="true"
                      >
                        {checked && (
                          <DynamicIcon name="Check" className="w-3 h-3" />
                        )}
                      </span>
                    )}
                    <div>
                      <div className="font-semibold text-ys-text text-sm">
                        {opt.label}
                      </div>
                      {opt.description && (
                        <div className="text-xs text-ys-muted mt-0.5">
                          {opt.description}
                        </div>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
            {multi && (
              <button
                onClick={submitPicks}
                disabled={picked.length === 0}
                className="w-full py-2.5 rounded-xl bg-ys-text text-ys-bg hover:opacity-90 active:scale-[0.99] disabled:opacity-40 font-semibold text-sm transition-all"
              >
                Done
              </button>
            )}
          </div>

          {/* Free-text fallback */}
          {allowCustom &&
            (showCustomInput ? (
              <div className="space-y-2">
                <div className="flex items-stretch gap-2">
                  <input
                    ref={inputRef}
                    type="text"
                    value={customText}
                    onChange={(e) => setCustomText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        submitCustom();
                      }
                    }}
                    placeholder="Type your own answer..."
                    className="w-full px-4 py-3 bg-ys-text/5 border border-ys-border rounded-xl text-ys-text text-sm focus:outline-none focus:ring-2 focus:ring-ys-accent"
                  />
                  <STTButton
                    onTranscript={(text) => setCustomText(text)}
                    className="shrink-0"
                  />
                </div>
                <button
                  onClick={submitCustom}
                  disabled={!customText.trim()}
                  className="w-full py-2.5 rounded-xl bg-ys-text text-ys-bg hover:opacity-90 active:scale-[0.99] disabled:opacity-40 font-semibold text-sm transition-all flex items-center justify-center gap-2"
                >
                  <DynamicIcon name="Check" className="w-4 h-4" />
                  Confirm
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowCustomInput(true)}
                className="w-full py-2.5 text-sm text-ys-muted hover:text-ys-text border border-dashed border-ys-border rounded-xl transition-colors"
              >
                Type something else...
              </button>
            ))}

          <button
            onClick={skipQuestion}
            className="w-full py-2 text-xs text-ys-muted hover:text-ys-text transition-colors"
          >
            Skip
          </button>

          {total > 1 && (
            <div className="flex items-center justify-center gap-1.5 pt-1">
              {request.questions.map((_, idx) => (
                <span
                  key={idx}
                  className={`h-1.5 rounded-full transition-all ${
                    idx === questionIndex
                      ? "w-5 bg-ys-accent"
                      : "w-1.5 bg-ys-border"
                  }`}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
