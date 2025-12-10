"use client";

import { useState, useEffect, useRef } from "react";
import { DynamicIcon } from "./DynamicIcon";

interface PlayerQuestionModalProps {
  isOpen: boolean;
  question: string;
  context: string;
  options?: string[];
  allowCustom: boolean;
  onAnswer: (answer: string) => void;
  onCancel: () => void;
}

export default function PlayerQuestionModal({
  isOpen,
  question,
  context,
  options,
  allowCustom,
  onAnswer,
  onCancel,
}: PlayerQuestionModalProps) {
  const [customAnswer, setCustomAnswer] = useState("");
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Focus input when modal opens
  useEffect(() => {
    if (isOpen && allowCustom && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen, allowCustom]);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setCustomAnswer("");
      setSelectedOption(null);
    }
  }, [isOpen]);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onCancel();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onCancel]);

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

  const handleSubmit = () => {
    if (selectedOption) {
      onAnswer(selectedOption);
    } else if (customAnswer.trim()) {
      onAnswer(customAnswer.trim());
    }
  };

  const canSubmit = selectedOption || customAnswer.trim();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onCancel}
      />

      {/* Modal */}
      <div className="relative bg-linear-to-b from-gray-900 via-purple-950 to-blue-950 rounded-xl shadow-2xl border border-purple-800/30 max-w-lg w-full mx-4 max-h-[85vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-purple-800/30">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <DynamicIcon
              name="MessageCircleQuestion"
              className="w-5 h-5 text-purple-400"
            />
            GM Question
          </h2>
          <button
            onClick={onCancel}
            className="p-2.5 sm:p-2 text-purple-200/60 hover:text-white hover:bg-purple-900/50 rounded-lg transition-colors touch-manipulation"
          >
            <DynamicIcon name="X" className="w-5 h-5 sm:w-4 sm:h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto overscroll-contain p-4 space-y-4">
          {/* Context */}
          {context && (
            <div className="text-sm text-purple-200/60 italic border-l-2 border-purple-600/50 pl-3 bg-purple-900/20 py-2 pr-3 rounded-r-lg">
              {context}
            </div>
          )}

          {/* Question */}
          <p className="text-white text-lg font-medium">{question}</p>

          {/* Options */}
          {options && options.length > 0 && (
            <div className="space-y-2">
              {options.map((option, index) => {
                const isSelected = selectedOption === option;
                return (
                  <button
                    key={index}
                    onClick={() => {
                      setSelectedOption(option);
                      setCustomAnswer("");
                    }}
                    className={`w-full text-left p-4 sm:p-3 rounded-lg transition-all border touch-manipulation ${
                      isSelected
                        ? "bg-purple-600/20 border-purple-500/50"
                        : "bg-purple-900/30 border-purple-800/30 hover:border-purple-600/50 active:bg-purple-800/40"
                    }`}
                  >
                    <div className="flex items-start gap-2.5">
                      <div
                        className={`mt-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                          isSelected
                            ? "border-purple-400 bg-purple-500"
                            : "border-purple-700"
                        }`}
                      >
                        {isSelected && (
                          <DynamicIcon
                            name="Check"
                            className="w-2.5 h-2.5 text-white"
                          />
                        )}
                      </div>
                      <span className="text-white text-sm">{option}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* Custom input */}
          {allowCustom && (
            <div className="space-y-2">
              {options && options.length > 0 && (
                <div className="flex items-center gap-2 text-sm text-purple-300/40">
                  <div className="flex-1 h-px bg-purple-800/50"></div>
                  <span>or type your own</span>
                  <div className="flex-1 h-px bg-purple-800/50"></div>
                </div>
              )}
              <textarea
                ref={inputRef}
                value={customAnswer}
                onChange={(e) => {
                  setCustomAnswer(e.target.value);
                  setSelectedOption(null);
                }}
                placeholder="Type your answer..."
                className="w-full bg-purple-950/50 border border-purple-800/30 rounded-lg px-4 py-3 text-white placeholder:text-purple-200/40 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none text-sm"
                rows={3}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && e.ctrlKey && canSubmit) {
                    handleSubmit();
                  }
                }}
              />
              <p className="text-xs text-purple-200/40">
                {customAnswer.length} characters • Ctrl+Enter to submit
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-purple-800/30 bg-purple-900/30 flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-purple-200/60 hover:text-white hover:bg-purple-900/50 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className={`px-6 py-2.5 rounded-lg font-medium transition-colors flex items-center gap-2 ${
              canSubmit
                ? "bg-purple-600 hover:bg-purple-500 text-white"
                : "bg-purple-800/50 text-purple-400 cursor-not-allowed"
            }`}
          >
            <DynamicIcon name="Send" className="w-4 h-4" />
            Answer
          </button>
        </div>
      </div>
    </div>
  );
}
