"use client";

import { StoryData } from "../misc/structs";
import { useState } from "react";
import { DynamicIcon } from "../components/DynamicIcon";

export default function QuestsPage(storyData: StoryData) {
  const [expandedQuestId, setExpandedQuestId] = useState<string | null>(null);

  if (!storyData.quests || storyData.quests.length === 0) {
    return (
      <div className="w-full">
        <div className="bg-white dark:bg-blue-950 rounded-2xl shadow-xl p-6 sm:p-8 border border-gray-200 dark:border-gray-700">
          <h2 className="text-2xl sm:text-3xl font-bold mb-6 bg-linear-to-r from-blue-600 via-purple-600 to-pink-600 bg-clip-text text-transparent flex items-center gap-2">
            <DynamicIcon name="Scroll" className="w-8 h-8 text-purple-600" />{" "}
            Quests
          </h2>
          <div className="p-8 text-center rounded-lg bg-gray-50 dark:bg-gray-900/30 border-2 border-dashed border-gray-300 dark:border-gray-600">
            <p className="text-sm sm:text-base text-gray-500 dark:text-gray-400">
              No quests have been created yet
            </p>
          </div>
        </div>
      </div>
    );
  }

  const activeQuests = storyData.quests.filter((q) => q.active);
  const inactiveQuests = storyData.quests.filter((q) => !q.active);
  const completedQuests = activeQuests.filter((q) => q.fulfilled);
  const ongoingQuests = activeQuests.filter((q) => !q.fulfilled);

  const toggleQuestActive = (questId: string) => {
    const quest = storyData.quests?.find((q) => q.id === questId);
    if (quest) {
      quest.active = !quest.active;
      // Force re-render by updating state
      setExpandedQuestId(null);
    }
  };

  const toggleExpanded = (questId: string) => {
    setExpandedQuestId(expandedQuestId === questId ? null : questId);
  };

  return (
    <div className="w-full">
      <div className="bg-white dark:bg-blue-950 rounded-2xl shadow-xl p-6 sm:p-8 border border-gray-200 dark:border-gray-700">
        <h2 className="text-2xl sm:text-3xl font-bold mb-6 bg-linear-to-r from-blue-600 via-purple-600 to-pink-600 bg-clip-text text-transparent flex items-center gap-2">
          <DynamicIcon name="Scroll" className="w-8 h-8 text-purple-600" />{" "}
          Quests
        </h2>

        {/* Active Ongoing Quests */}
        {ongoingQuests.length > 0 && (
          <div className="mb-8">
            <h3 className="text-lg sm:text-xl font-bold mb-4 flex items-center gap-2 text-gray-900 dark:text-white">
              <DynamicIcon
                name="Target"
                className="w-6 h-6 text-blue-600 dark:text-blue-400"
              />
              Active Quests ({ongoingQuests.length})
            </h3>
            <div className="space-y-3">
              {ongoingQuests.map((quest) => {
                if (!quest.id) {
                  console.error("Quest missing id:", quest);
                  quest.id = `quest-${Math.random()}`; // Fallback ID
                }
                return (
                  <div
                    key={quest.id || `quest-${quest.title}-${Math.random()}`}
                    className="flex flex-col gap-3 p-4 rounded-lg border-2 border-blue-400 dark:border-blue-600 bg-blue-50 dark:bg-blue-900/20 transition-all"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                          <h4 className="font-bold text-base sm:text-lg text-gray-900 dark:text-white">
                            {quest.title}
                          </h4>
                          <span className="px-2 py-0.5 bg-blue-200 dark:bg-blue-800/50 text-blue-800 dark:text-blue-200 rounded-full text-xs font-bold shrink-0">
                            {quest.points} pts
                          </span>
                        </div>
                        <p className="text-sm sm:text-base text-gray-700 dark:text-gray-300 mb-2">
                          {quest.shortDescription}
                        </p>
                        {expandedQuestId === quest.id &&
                          quest.description !== quest.shortDescription && (
                            <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 italic mt-2 p-3 bg-white dark:bg-gray-900 rounded border border-blue-200 dark:border-blue-800">
                              {quest.description}
                            </p>
                          )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 pt-2 border-t border-blue-200 dark:border-blue-700">
                      {quest.description !== quest.shortDescription && (
                        <button
                          onClick={() => toggleExpanded(quest.id)}
                          className="px-3 py-1 text-sm bg-blue-200 dark:bg-blue-800 hover:bg-blue-300 dark:hover:bg-blue-700 text-blue-900 dark:text-blue-100 rounded-lg transition-colors"
                        >
                          {expandedQuestId === quest.id
                            ? "Show Less"
                            : "Show Details"}
                        </button>
                      )}
                      <button
                        onClick={() => toggleQuestActive(quest.id)}
                        className="px-3 py-1 text-sm bg-gray-200 dark:bg-gray-900 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-900 dark:text-white rounded-lg transition-colors"
                      >
                        <span className="flex items-center gap-1">
                          <DynamicIcon name="EyeOff" className="w-4 h-4" /> Hide
                          Quest
                        </span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Completed Quests */}
        {completedQuests.length > 0 && (
          <div className="mb-8">
            <h3 className="text-lg sm:text-xl font-bold mb-4 flex items-center gap-2 text-gray-900 dark:text-white">
              <DynamicIcon
                name="CheckCircle"
                className="w-6 h-6 text-green-600 dark:text-green-400"
              />
              Completed Quests ({completedQuests.length})
            </h3>
            <div className="space-y-3">
              {completedQuests.map((quest) => {
                if (!quest.id) {
                  console.error("Quest missing id:", quest);
                }
                return (
                  <div
                    key={
                      quest.id ||
                      `quest-completed-${quest.title}-${Math.random()}`
                    }
                    className="flex flex-col gap-3 p-4 rounded-lg border-2 border-green-400 dark:border-green-600 bg-green-50 dark:bg-green-900/20 shadow-md transition-all"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                          <DynamicIcon
                            name="Check"
                            className="w-5 h-5 text-green-500 shrink-0"
                          />
                          <h4 className="font-bold text-base sm:text-lg text-gray-900 dark:text-white line-through">
                            {quest.title}
                          </h4>
                          <span className="px-2 py-0.5 bg-green-200 dark:bg-green-800/50 text-green-800 dark:text-green-200 rounded-full text-xs font-bold shrink-0">
                            {quest.points} pts
                          </span>
                        </div>
                        <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400">
                          {quest.shortDescription}
                        </p>
                        {expandedQuestId === quest.id &&
                          quest.description !== quest.shortDescription && (
                            <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 italic mt-2 p-3 bg-white dark:bg-gray-900 rounded border border-green-200 dark:border-green-800">
                              {quest.description}
                            </p>
                          )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 pt-2 border-t border-green-200 dark:border-green-700">
                      {quest.description !== quest.shortDescription && (
                        <button
                          onClick={() => toggleExpanded(quest.id)}
                          className="px-3 py-1 text-sm bg-green-200 dark:bg-green-800 hover:bg-green-300 dark:hover:bg-green-700 text-green-900 dark:text-green-100 rounded-lg transition-colors"
                        >
                          {expandedQuestId === quest.id
                            ? "Show Less"
                            : "Show Details"}
                        </button>
                      )}
                      <button
                        onClick={() => toggleQuestActive(quest.id)}
                        className="px-3 py-1 text-sm bg-gray-200 dark:bg-gray-900 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-900 dark:text-white rounded-lg transition-colors"
                      >
                        <span className="flex items-center gap-1">
                          <DynamicIcon name="EyeOff" className="w-4 h-4" /> Hide
                          Quest
                        </span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Inactive/Hidden Quests */}
        {inactiveQuests.length > 0 && (
          <div>
            <h3 className="text-lg sm:text-xl font-bold mb-4 flex items-center gap-2 text-gray-900 dark:text-white">
              <DynamicIcon
                name="EyeOff"
                className="w-6 h-6 text-gray-600 dark:text-gray-400"
              />
              Hidden Quests ({inactiveQuests.length})
            </h3>
            <div className="space-y-3">
              {inactiveQuests.map((quest) => {
                if (!quest.id) {
                  console.error("Quest missing id:", quest);
                }
                return (
                  <div
                    key={
                      quest.id ||
                      `quest-inactive-${quest.title}-${Math.random()}`
                    }
                    className="flex flex-col gap-3 p-4 rounded-lg border-2 border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-900/30 opacity-70 transition-all"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                          <h4
                            className={`font-bold text-base sm:text-lg text-gray-900 dark:text-white ${
                              quest.fulfilled ? "line-through" : ""
                            }`}
                          >
                            {quest.title}
                          </h4>
                          <span className="px-2 py-0.5 bg-gray-200 dark:bg-gray-900 text-gray-800 dark:text-gray-200 rounded-full text-xs font-bold shrink-0">
                            {quest.points} pts
                          </span>
                          {quest.fulfilled && (
                            <DynamicIcon
                              name="Check"
                              className="w-5 h-5 text-green-500 shrink-0"
                            />
                          )}
                        </div>
                        <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400">
                          {quest.shortDescription}
                        </p>
                        {expandedQuestId === quest.id &&
                          quest.description !== quest.shortDescription && (
                            <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 italic mt-2 p-3 bg-white dark:bg-gray-900 rounded border border-gray-200 dark:border-gray-600">
                              {quest.description}
                            </p>
                          )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 pt-2 border-t border-gray-200 dark:border-gray-600">
                      {quest.description !== quest.shortDescription && (
                        <button
                          onClick={() => toggleExpanded(quest.id)}
                          className="px-3 py-1 text-sm bg-gray-200 dark:bg-gray-900 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-900 dark:text-white rounded-lg transition-colors"
                        >
                          {expandedQuestId === quest.id
                            ? "Show Less"
                            : "Show Details"}
                        </button>
                      )}
                      <button
                        onClick={() => toggleQuestActive(quest.id)}
                        className="px-3 py-1 text-sm bg-blue-600 dark:bg-blue-700 hover:bg-blue-700 dark:hover:bg-blue-600 text-white rounded-lg transition-colors"
                      >
                        <span className="flex items-center gap-1">
                          <DynamicIcon name="Eye" className="w-4 h-4" /> Show
                          Quest
                        </span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
