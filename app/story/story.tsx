"use client";
import { Choice, Choices, StoryData } from "../misc/structs";
import React from "react";
import ReactMarkdown from "react-markdown";
import TTSControls from "../components/TTSControls";
import { DynamicIcon } from "../components/DynamicIcon";

interface StoryProps {
  storyData: StoryData;
  storyText: string;
  choices: Choices;
  input: Record<string, boolean>;
  loading: boolean;
  momentumMode: "none" | "reroll" | "guarantee";
  onMomentumModeChange: (mode: "none" | "reroll" | "guarantee") => void;
  handleChoice: () => void;
  handleSelect: (index: number) => void;
  onCustomInput?: (text: string) => void; // optional callback for free-form input
  onRetry?: () => void; // callback to retry last AI response
  canRetry?: boolean; // whether retry is available
}

export default function Story({
  storyData,
  storyText,
  choices,
  input,
  loading,
  momentumMode,
  onMomentumModeChange,
  handleChoice,
  handleSelect,
  onCustomInput,
  onRetry,
  canRetry,
}: StoryProps) {
  const [freeInputEnabled, setFreeInputEnabled] = React.useState<boolean>(
    () => {
      if (typeof window === "undefined") return false;
      return localStorage.getItem("freeInputEnabled") === "true";
    }
  );
  const [customInput, setCustomInput] = React.useState<string>("");
  const [submittingCustom, setSubmittingCustom] =
    React.useState<boolean>(false);
  const selectedChoice = choices?.choices.find((c) => input[c.text]);
  const hasSkillCheck = selectedChoice?.skill_used !== undefined;
  const canUseReroll = storyData.momentum >= 1 && hasSkillCheck;
  const canUseGuarantee = storyData.momentum >= 2 && hasSkillCheck;

  return (
    <div className="w-full">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6 sm:p-8 border border-gray-200 dark:border-gray-700">
        <div className="flex flex-col gap-6">
          {/* TTS Controls - positioned at top */}
          <div className="flex items-center justify-between pb-4 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-2">
              <DynamicIcon name="Volume2" className="w-6 h-6" />
              <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                Text-to-Speech
              </span>
            </div>
            <TTSControls text={storyText} disabled={loading} />
          </div>

          {prettify(storyText)}

          {loading ? (
            <div className="flex flex-col items-center justify-center w-full py-8 border-t border-gray-200 dark:border-gray-700">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 dark:border-purple-400"></div>
              <p className="mt-4 text-gray-600 dark:text-gray-400 text-sm font-medium">
                Weaving your tale...
              </p>
            </div>
          ) : (
            <div className="w-full space-y-3">
              <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                <p className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
                  Choose your path
                </p>
              </div>
              {choices &&
                choices.choices.map((choice, index) => (
                  <div
                    key={index}
                    className={`flex flex-row items-start cursor-pointer rounded-lg transition-all p-4 border-2 ${
                      input[choice.text]
                        ? "border-purple-500 bg-purple-100 dark:bg-purple-900/40 shadow-md"
                        : "border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/30 hover:border-purple-300 dark:hover:border-purple-600 hover:shadow-md"
                    }`}
                    onClick={() => handleSelect(index)}
                  >
                    <input
                      type="checkbox"
                      checked={input[choice.text] || false}
                      className="mt-1 cursor-pointer shrink-0 w-4 h-4 text-purple-600 focus:ring-purple-500"
                      readOnly
                    />
                    <div className="flex-1 pl-3 text-sm sm:text-base text-gray-900 dark:text-gray-100">
                      {convert_choice_to_text(choice, storyData)}
                    </div>
                  </div>
                ))}
            </div>
          )}

          {/* Retry Button */}
          {!loading && canRetry && onRetry && (
            <div className="flex justify-end mt-4">
              <button
                onClick={onRetry}
                className="px-4 py-2 text-sm font-medium text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-700 rounded-lg hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-all flex items-center gap-2"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
                Retry AI Response
              </button>
            </div>
          )}
        </div>

        {/* Momentum Display and Controls */}
        <div className="flex flex-col md:flex-row gap-4 items-center justify-between w-full pt-4 border-t border-gray-200 dark:border-gray-700 mt-4 overflow-hidden">
          <div className="flex items-center gap-2">
            <DynamicIcon name="Zap" className="w-6 h-6 text-yellow-500" />
            <div className="flex flex-col">
              <span className="text-sm font-semibold text-gray-700 dark:text-gray-300 ">
                Momentum: {storyData.momentum}/{storyData.maxMomentum}
              </span>
              <div className="flex gap-1 mt-1">
                {Array.from({ length: storyData.maxMomentum }).map((_, i) => (
                  <div
                    key={i}
                    className={`w-3 h-3 rounded-full ${
                      i < storyData.momentum
                        ? "bg-yellow-400 dark:bg-yellow-500"
                        : "bg-gray-300 dark:bg-gray-600"
                    }`}
                  />
                ))}
              </div>
            </div>
          </div>

          {hasSkillCheck && !loading && (
            <div className="flex gap-2">
              <button
                onClick={() =>
                  onMomentumModeChange(
                    momentumMode === "reroll" ? "none" : "reroll"
                  )
                }
                disabled={!canUseReroll}
                className={`px-3 py-2 text-sm font-semibold rounded-lg transition-all flex items-center gap-2 ${
                  momentumMode === "reroll"
                    ? "bg-yellow-500 text-white shadow-md"
                    : canUseReroll
                    ? "bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-yellow-400 hover:text-white"
                    : "bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-600 cursor-not-allowed"
                }`}
              >
                <DynamicIcon name="Dices" className="w-4 h-4" /> Reroll (1
                <DynamicIcon name="Zap" className="w-3 h-3 inline ml-1" />)
              </button>
              <button
                onClick={() =>
                  onMomentumModeChange(
                    momentumMode === "guarantee" ? "none" : "guarantee"
                  )
                }
                disabled={!canUseGuarantee}
                className={`px-3 py-2 text-sm font-semibold rounded-lg transition-all flex items-center gap-2 ${
                  momentumMode === "guarantee"
                    ? "bg-green-500 text-white shadow-md"
                    : canUseGuarantee
                    ? "bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-green-500 hover:text-white"
                    : "bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-600 cursor-not-allowed"
                }`}
              >
                <DynamicIcon name="Check" className="w-4 h-4" /> Guarantee (2
                <DynamicIcon name="Zap" className="w-3 h-3 inline ml-1" />)
              </button>
            </div>
          )}
        </div>

        <div className="flex justify-center w-full pt-6 border-t border-gray-200 dark:border-gray-700 mt-6">
          <button
            onClick={handleChoice}
            className="cursor-pointer px-8 py-4 text-lg font-semibold bg-linear-to-r from-purple-600 to-pink-600 text-white hover:from-purple-700 hover:to-pink-700 rounded-lg shadow-lg hover:shadow-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-lg flex items-center gap-2"
            disabled={!Object.values(input).some((v) => v) || loading}
          >
            {loading ? (
              "Generating..."
            ) : momentumMode === "reroll" ? (
              <>
                <DynamicIcon name="Dices" className="w-5 h-5" /> Continue with
                Reroll
              </>
            ) : momentumMode === "guarantee" ? (
              <>
                <DynamicIcon name="Check" className="w-5 h-5" /> Continue
                Guaranteed
              </>
            ) : (
              <>
                <DynamicIcon name="Sparkles" className="w-5 h-5" /> Continue
                Story
              </>
            )}
          </button>
        </div>

        {/* Bottom Custom Input Toggle & Section */}
        <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between mb-3 gap-2">
            <button
              type="button"
              onClick={() => {
                const next = !freeInputEnabled;
                setFreeInputEnabled(next);
                if (typeof window !== "undefined") {
                  localStorage.setItem("freeInputEnabled", String(next));
                }
              }}
              className={`px-4 py-2 text-sm font-semibold rounded-lg transition-colors border flex items-center gap-2 ${
                freeInputEnabled
                  ? "bg-purple-600 text-white border-purple-600 hover:bg-purple-700 "
                  : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-purple-200 dark:hover:bg-purple-600/40"
              }`}
            >
              {freeInputEnabled ? (
                <>
                  Hide Custom Input <DynamicIcon name="X" className="w-4 h-4" />
                </>
              ) : (
                <>
                  Add Custom Input{" "}
                  <DynamicIcon name="PenLine" className="w-4 h-4" />
                </>
              )}
            </button>
            {freeInputEnabled && (
              <span className="text-xs text-gray-500 dark:text-gray-400">
                Free-form input steers narrative (no skill checks).
              </span>
            )}
          </div>
          <div
            className={`transition-all duration-300 ease-out overflow-hidden ${
              freeInputEnabled
                ? "opacity-100 scale-100 max-h-80"
                : "opacity-0 scale-95 max-h-0 pointer-events-none"
            }`}
          >
            <div className="space-y-3">
              <textarea
                value={customInput}
                onChange={(e) => setCustomInput(e.target.value)}
                placeholder="Write your own action, dialog, or narration..."
                rows={3}
                className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
              />
              <div className="flex items-center justify-between">
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {customInput.length} characters
                </p>
                <button
                  type="button"
                  disabled={
                    submittingCustom ||
                    loading ||
                    customInput.trim().length === 0
                  }
                  onClick={async () => {
                    const text = customInput.trim();
                    if (!text) return;
                    if (!onCustomInput) {
                      setSubmittingCustom(true);
                      try {
                        // Parent should implement onCustomInput; fallback does nothing.
                      } finally {
                        setSubmittingCustom(false);
                      }
                      return;
                    }
                    setSubmittingCustom(true);
                    try {
                      await Promise.resolve(onCustomInput(text));
                      setCustomInput("");
                    } finally {
                      setSubmittingCustom(false);
                    }
                  }}
                  className={`px-4 py-2 text-sm font-semibold rounded-lg transition-colors ${
                    submittingCustom ||
                    loading ||
                    customInput.trim().length === 0
                      ? "bg-gray-300 dark:bg-gray-600 text-gray-600 dark:text-gray-400 cursor-not-allowed"
                      : "bg-purple-600 hover:bg-purple-700 text-white"
                  }`}
                >
                  {submittingCustom ? "Submitting..." : "Submit Custom Input"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const prettify = (text: string) => {
  return (
    <div className="prose prose-sm sm:prose prose-zinc dark:prose-invert max-w-none">
      <ReactMarkdown
        components={{
          p: ({ node, ...props }) => <p className="mb-3 sm:mb-4" {...props} />,
          h1: ({ node, ...props }) => (
            <h1
              className="text-xl sm:text-2xl font-bold mb-3 sm:mb-4 mt-4 sm:mt-6"
              {...props}
            />
          ),
          h2: ({ node, ...props }) => (
            <h2
              className="text-lg sm:text-xl font-bold mb-2 sm:mb-3 mt-3 sm:mt-5"
              {...props}
            />
          ),
          h3: ({ node, ...props }) => (
            <h3
              className="text-base sm:text-lg font-bold mb-2 mt-3 sm:mt-4"
              {...props}
            />
          ),
          strong: ({ node, ...props }) => (
            <strong
              className="font-bold text-black dark:text-white"
              {...props}
            />
          ),
          em: ({ node, ...props }) => <em className="italic" {...props} />,
          ul: ({ node, ...props }) => (
            <ul className="list-disc ml-4 sm:ml-6 mb-3 sm:mb-4" {...props} />
          ),
          ol: ({ node, ...props }) => (
            <ol className="list-decimal ml-4 sm:ml-6 mb-3 sm:mb-4" {...props} />
          ),
          li: ({ node, ...props }) => <li className="mb-1" {...props} />,
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
};
const choice_button_factory = (
  choice: Choice,
  index: number,
  onClick: () => void
) => {};
const convert_choice_to_text = (choice: Choice, storyData: StoryData) => {
  let extra: React.ReactNode = null;
  if (choice.skill_used) {
    const skill = storyData.stats.find(
      (stat) => stat.name === choice.skill_used
    );
    if (skill?.symbol) {
      extra = (
        <DynamicIcon
          name={skill.symbol as any}
          className="inline w-4 h-4 ml-1"
        />
      );
    }
  }

  return (
    <span>
      {choice.text}
      {extra}
    </span>
  );
};
