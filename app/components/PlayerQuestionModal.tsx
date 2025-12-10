"use client";

import { useState, useEffect, useRef } from "react";

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-neutral-900 border border-neutral-700 rounded-lg shadow-xl max-w-lg w-full mx-4 overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-neutral-700 bg-neutral-800/50">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🎲</span>
            <h2 className="text-lg font-semibold text-white">GM Question</h2>
          </div>
        </div>

        {/* Content */}
        <div className="px-6 py-4 space-y-4">
          {/* Context */}
          {context && (
            <div className="text-sm text-neutral-400 italic border-l-2 border-neutral-600 pl-3">
              {context}
            </div>
          )}

          {/* Question */}
          <p className="text-white text-lg">{question}</p>

          {/* Options */}
          {options && options.length > 0 && (
            <div className="space-y-2">
              {options.map((option, index) => (
                <button
                  key={index}
                  onClick={() => {
                    setSelectedOption(option);
                    setCustomAnswer("");
                  }}
                  className={`w-full text-left px-4 py-3 rounded-lg border transition-colors ${
                    selectedOption === option
                      ? "bg-blue-600/20 border-blue-500 text-blue-300"
                      : "bg-neutral-800/50 border-neutral-600 text-neutral-200 hover:border-neutral-500 hover:bg-neutral-800"
                  }`}
                >
                  <span className="mr-2 text-neutral-500">{index + 1}.</span>
                  {option}
                </button>
              ))}
            </div>
          )}

          {/* Custom input */}
          {allowCustom && (
            <div className="space-y-2">
              {options && options.length > 0 && (
                <div className="flex items-center gap-2 text-sm text-neutral-500">
                  <div className="flex-1 h-px bg-neutral-700"></div>
                  <span>or type your own answer</span>
                  <div className="flex-1 h-px bg-neutral-700"></div>
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
                className="w-full bg-neutral-800 border border-neutral-600 rounded-lg px-4 py-3 text-white placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                rows={3}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && e.ctrlKey && canSubmit) {
                    handleSubmit();
                  }
                }}
              />
              <p className="text-xs text-neutral-500">
                Press Ctrl+Enter to submit
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-neutral-700 bg-neutral-800/50 flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-neutral-400 hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className={`px-6 py-2 rounded-lg font-medium transition-colors ${
              canSubmit
                ? "bg-blue-600 hover:bg-blue-500 text-white"
                : "bg-neutral-700 text-neutral-500 cursor-not-allowed"
            }`}
          >
            Answer
          </button>
        </div>
      </div>
    </div>
  );
}
