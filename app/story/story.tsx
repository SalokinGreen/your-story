"use client";
import { Choice, Choices, StoryData } from "../misc/structs";
import ReactMarkdown from "react-markdown";

interface StoryProps {
  storyData: StoryData;
  storyText: string;
  choices: Choices;
  input: Record<string, boolean>;
  loading: boolean;
  momentumMode: 'none' | 'reroll' | 'guarantee';
  onMomentumModeChange: (mode: 'none' | 'reroll' | 'guarantee') => void;
  handleChoice: () => void;
  handleSelect: (index: number) => void;
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
  handleSelect
}: StoryProps) {
  const selectedChoice = choices?.choices.find(c => input[c.text]);
  const hasSkillCheck = selectedChoice?.skill_used !== undefined;
  const canUseReroll = storyData.momentum >= 1 && hasSkillCheck;
  const canUseGuarantee = storyData.momentum >= 2 && hasSkillCheck;

  return (
    <div className="w-full">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6 sm:p-8 border border-gray-200 dark:border-gray-700">
        <div className="flex flex-col gap-6">
          {prettify(storyText)}

          {loading ? (
            <div className="flex flex-col items-center justify-center w-full py-8 border-t border-gray-200 dark:border-gray-700">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 dark:border-purple-400"></div>
              <p className="mt-4 text-gray-600 dark:text-gray-400 text-sm font-medium">Weaving your tale...</p>
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
        </div>
        
        {/* Momentum Display and Controls */}
        <div className="flex items-center justify-between w-full pt-4 border-t border-gray-200 dark:border-gray-700 mt-4">
          <div className="flex items-center gap-2">
            <span className="text-2xl">⚡</span>
            <div className="flex flex-col">
              <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
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
                onClick={() => onMomentumModeChange(momentumMode === 'reroll' ? 'none' : 'reroll')}
                disabled={!canUseReroll}
                className={`px-3 py-2 text-sm font-semibold rounded-lg transition-all ${
                  momentumMode === 'reroll'
                    ? "bg-yellow-500 text-white shadow-md"
                    : canUseReroll
                    ? "bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-yellow-400 hover:text-white"
                    : "bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-600 cursor-not-allowed"
                }`}
              >
                🎲 Reroll (1⚡)
              </button>
              <button
                onClick={() => onMomentumModeChange(momentumMode === 'guarantee' ? 'none' : 'guarantee')}
                disabled={!canUseGuarantee}
                className={`px-3 py-2 text-sm font-semibold rounded-lg transition-all ${
                  momentumMode === 'guarantee'
                    ? "bg-green-500 text-white shadow-md"
                    : canUseGuarantee
                    ? "bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-green-500 hover:text-white"
                    : "bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-600 cursor-not-allowed"
                }`}
              >
                ✓ Guarantee (2⚡)
              </button>
            </div>
          )}
        </div>
        
        <div className="flex justify-center w-full pt-6 border-t border-gray-200 dark:border-gray-700 mt-6">
          <button
            onClick={handleChoice}
            className="cursor-pointer px-8 py-4 text-lg font-semibold bg-linear-to-r from-purple-600 to-pink-600 text-white hover:from-purple-700 hover:to-pink-700 rounded-lg shadow-lg hover:shadow-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-lg"
            disabled={!Object.values(input).some((v) => v) || loading}
          >
            {loading ? "Generating..." : momentumMode === 'reroll' ? "🎲 Continue with Reroll" : momentumMode === 'guarantee' ? "✓ Continue Guaranteed" : "✨ Continue Story"}
          </button>
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
  let extra = "";
  if (choice.skill_used) {
    const skill = storyData.stats.find(
      (stat) => stat.name === choice.skill_used
    );
    extra += ` ${skill?.symbol}`;
  }

  return `${choice.text}` + extra;
};
