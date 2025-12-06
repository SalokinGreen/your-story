"use client";

import { StoryData, StoryThread } from "../misc/structs";
import { useState } from "react";
import { DynamicIcon } from "../components/DynamicIcon";

export default function QuestsPage(storyData: StoryData) {
  const [expandedQuestId, setExpandedQuestId] = useState<string | null>(null);
  const [expandedThreadId, setExpandedThreadId] = useState<string | null>(null);

  // Get threads data
  const activeThreads =
    storyData.threads?.filter((t) => t.status === "active") || [];
  const resolvedThreads =
    storyData.threads?.filter((t) => t.status === "resolved") || [];
  const abandonedThreads =
    storyData.threads?.filter((t) => t.status === "abandoned") || [];

  const hasQuests = storyData.quests && storyData.quests.length > 0;
  const hasThreads = storyData.threads && storyData.threads.length > 0;

  // Empty state - no quests or threads
  if (!hasQuests && !hasThreads) {
    return (
      <div className="w-full">
        <div className="bg-blue-950/50 backdrop-blur-sm rounded-2xl p-6 sm:p-8 border border-blue-800/30">
          <h2 className="text-2xl sm:text-3xl font-bold mb-6 bg-linear-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent flex items-center gap-2">
            <DynamicIcon name="Scroll" className="w-8 h-8 text-purple-400" />{" "}
            Journal
          </h2>
          <div className="p-8 text-center rounded-lg bg-blue-900/20 border-2 border-dashed border-blue-700/40">
            <p className="text-sm sm:text-base text-blue-200/60">
              No quests or story threads yet
            </p>
          </div>
        </div>
      </div>
    );
  }

  const activeQuests = storyData.quests?.filter((q) => q.active) || [];
  const inactiveQuests = storyData.quests?.filter((q) => !q.active) || [];
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
      {/* Quests Section */}
      {hasQuests && (
        <div className="bg-blue-950/50 backdrop-blur-sm rounded-2xl p-6 sm:p-8 border border-blue-800/30">
          <h2 className="text-2xl sm:text-3xl font-bold mb-6 bg-linear-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent flex items-center gap-2">
            <DynamicIcon name="Scroll" className="w-8 h-8 text-purple-400" />{" "}
            Quests
          </h2>

          {/* Active Ongoing Quests */}
          {ongoingQuests.length > 0 && (
            <div className="mb-8">
              <h3 className="text-lg sm:text-xl font-bold mb-4 flex items-center gap-2 text-white">
                <DynamicIcon name="Target" className="w-6 h-6 text-blue-400" />
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
                      className="flex flex-col gap-3 p-4 rounded-lg border-2 border-blue-500/50 bg-blue-900/30 transition-all"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2">
                            <h4 className="font-bold text-base sm:text-lg text-white">
                              {quest.title}
                            </h4>
                            <span className="px-2 py-0.5 bg-blue-800/50 text-blue-200 rounded-full text-xs font-bold shrink-0">
                              {quest.points} pts
                            </span>
                          </div>
                          <p className="text-sm sm:text-base text-blue-100/80 mb-2">
                            {quest.shortDescription}
                          </p>
                          {expandedQuestId === quest.id &&
                            quest.description !== quest.shortDescription && (
                              <p className="text-xs sm:text-sm text-blue-200/60 italic mt-2 p-3 bg-blue-950/50 rounded border border-blue-700/40">
                                {quest.description}
                              </p>
                            )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 pt-2 border-t border-blue-700/40">
                        {quest.description !== quest.shortDescription && (
                          <button
                            onClick={() => toggleExpanded(quest.id)}
                            className="px-3 py-1 text-sm bg-blue-700/50 hover:bg-blue-600/50 text-blue-100 rounded-lg transition-colors"
                          >
                            {expandedQuestId === quest.id
                              ? "Show Less"
                              : "Show Details"}
                          </button>
                        )}
                        <button
                          onClick={() => toggleQuestActive(quest.id)}
                          className="px-3 py-1 text-sm bg-blue-800/50 hover:bg-blue-700/50 text-blue-200 rounded-lg transition-colors"
                        >
                          <span className="flex items-center gap-1">
                            <DynamicIcon name="EyeOff" className="w-4 h-4" />{" "}
                            Hide Quest
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
              <h3 className="text-lg sm:text-xl font-bold mb-4 flex items-center gap-2 text-white">
                <DynamicIcon
                  name="CheckCircle"
                  className="w-6 h-6 text-green-400"
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
                      className="flex flex-col gap-3 p-4 rounded-lg border-2 border-green-500/50 bg-green-900/20 transition-all"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2">
                            <DynamicIcon
                              name="Check"
                              className="w-5 h-5 text-green-400 shrink-0"
                            />
                            <h4 className="font-bold text-base sm:text-lg text-white line-through">
                              {quest.title}
                            </h4>
                            <span className="px-2 py-0.5 bg-green-800/50 text-green-200 rounded-full text-xs font-bold shrink-0">
                              {quest.points} pts
                            </span>
                          </div>
                          <p className="text-sm sm:text-base text-green-100/70">
                            {quest.shortDescription}
                          </p>
                          {expandedQuestId === quest.id &&
                            quest.description !== quest.shortDescription && (
                              <p className="text-xs sm:text-sm text-green-200/60 italic mt-2 p-3 bg-green-950/50 rounded border border-green-700/40">
                                {quest.description}
                              </p>
                            )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 pt-2 border-t border-green-700/40">
                        {quest.description !== quest.shortDescription && (
                          <button
                            onClick={() => toggleExpanded(quest.id)}
                            className="px-3 py-1 text-sm bg-green-700/50 hover:bg-green-600/50 text-green-100 rounded-lg transition-colors"
                          >
                            {expandedQuestId === quest.id
                              ? "Show Less"
                              : "Show Details"}
                          </button>
                        )}
                        <button
                          onClick={() => toggleQuestActive(quest.id)}
                          className="px-3 py-1 text-sm bg-blue-800/50 hover:bg-blue-700/50 text-blue-200 rounded-lg transition-colors"
                        >
                          <span className="flex items-center gap-1">
                            <DynamicIcon name="EyeOff" className="w-4 h-4" />{" "}
                            Hide Quest
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
              <h3 className="text-lg sm:text-xl font-bold mb-4 flex items-center gap-2 text-white">
                <DynamicIcon
                  name="EyeOff"
                  className="w-6 h-6 text-blue-300/60"
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
                      className="flex flex-col gap-3 p-4 rounded-lg border-2 border-blue-800/30 bg-blue-900/20 opacity-70 transition-all"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2">
                            <h4
                              className={`font-bold text-base sm:text-lg text-white ${
                                quest.fulfilled ? "line-through" : ""
                              }`}
                            >
                              {quest.title}
                            </h4>
                            <span className="px-2 py-0.5 bg-blue-800/30 text-blue-200/60 rounded-full text-xs font-bold shrink-0">
                              {quest.points} pts
                            </span>
                            {quest.fulfilled && (
                              <DynamicIcon
                                name="Check"
                                className="w-5 h-5 text-green-400 shrink-0"
                              />
                            )}
                          </div>
                          <p className="text-sm sm:text-base text-blue-200/60">
                            {quest.shortDescription}
                          </p>
                          {expandedQuestId === quest.id &&
                            quest.description !== quest.shortDescription && (
                              <p className="text-xs sm:text-sm text-blue-200/50 italic mt-2 p-3 bg-blue-950/50 rounded border border-blue-800/30">
                                {quest.description}
                              </p>
                            )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 pt-2 border-t border-blue-800/30">
                        {quest.description !== quest.shortDescription && (
                          <button
                            onClick={() => toggleExpanded(quest.id)}
                            className="px-3 py-1 text-sm bg-blue-800/50 hover:bg-blue-700/50 text-blue-200 rounded-lg transition-colors"
                          >
                            {expandedQuestId === quest.id
                              ? "Show Less"
                              : "Show Details"}
                          </button>
                        )}
                        <button
                          onClick={() => toggleQuestActive(quest.id)}
                          className="px-3 py-1 text-sm bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors"
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
      )}

      {/* Story Threads Section */}
      {hasThreads && (
        <div className="bg-purple-950/50 backdrop-blur-sm rounded-2xl p-6 sm:p-8 border border-purple-800/30 mt-6">
          <h2 className="text-2xl sm:text-3xl font-bold mb-6 bg-linear-to-r from-purple-400 via-pink-400 to-red-400 bg-clip-text text-transparent flex items-center gap-2">
            <DynamicIcon name="GitBranch" className="w-8 h-8 text-purple-400" />{" "}
            Story Threads
          </h2>

          {/* Active Threads */}
          {activeThreads.length > 0 && (
            <div className="mb-8">
              <h3 className="text-lg sm:text-xl font-bold mb-4 flex items-center gap-2 text-white">
                <DynamicIcon
                  name="CircleDot"
                  className="w-6 h-6 text-purple-400"
                />
                Active Threads ({activeThreads.length})
              </h3>
              <div className="space-y-3">
                {activeThreads.map((thread) => (
                  <div
                    key={thread.id}
                    className="flex flex-col gap-3 p-4 rounded-lg border-2 border-purple-500/50 bg-purple-900/30 transition-all"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                          <h4 className="font-bold text-base sm:text-lg text-white">
                            {thread.title}
                          </h4>
                          <span
                            className={`px-2 py-0.5 rounded-full text-xs font-bold shrink-0 ${
                              thread.priority === "main"
                                ? "bg-red-800/50 text-red-200"
                                : thread.priority === "side"
                                ? "bg-blue-800/50 text-blue-200"
                                : "bg-gray-800/50 text-gray-200"
                            }`}
                          >
                            {thread.priority || "side"}
                          </span>
                        </div>
                        <p
                          className={`text-sm sm:text-base text-purple-100/80 ${
                            expandedThreadId === thread.id ? "" : "line-clamp-2"
                          }`}
                        >
                          {thread.description}
                        </p>
                      </div>
                    </div>
                    {thread.description.length > 100 && (
                      <button
                        onClick={() =>
                          setExpandedThreadId(
                            expandedThreadId === thread.id ? null : thread.id
                          )
                        }
                        className="self-start px-3 py-1 text-sm bg-purple-700/50 hover:bg-purple-600/50 text-purple-100 rounded-lg transition-colors"
                      >
                        {expandedThreadId === thread.id
                          ? "Show Less"
                          : "Show More"}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Resolved Threads */}
          {resolvedThreads.length > 0 && (
            <div className="mb-8">
              <h3 className="text-lg sm:text-xl font-bold mb-4 flex items-center gap-2 text-white">
                <DynamicIcon
                  name="CheckCircle"
                  className="w-6 h-6 text-green-400"
                />
                Resolved ({resolvedThreads.length})
              </h3>
              <div className="space-y-3">
                {resolvedThreads.map((thread) => (
                  <div
                    key={thread.id}
                    className="flex flex-col gap-3 p-4 rounded-lg border-2 border-green-500/40 bg-green-900/20 opacity-80 transition-all"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                          <DynamicIcon
                            name="Check"
                            className="w-5 h-5 text-green-400 shrink-0"
                          />
                          <h4 className="font-bold text-base sm:text-lg text-white line-through">
                            {thread.title}
                          </h4>
                          <span
                            className={`px-2 py-0.5 rounded-full text-xs font-bold shrink-0 ${
                              thread.priority === "main"
                                ? "bg-red-800/30 text-red-200/60"
                                : thread.priority === "side"
                                ? "bg-blue-800/30 text-blue-200/60"
                                : "bg-gray-800/30 text-gray-200/60"
                            }`}
                          >
                            {thread.priority || "side"}
                          </span>
                        </div>
                        <p
                          className={`text-sm sm:text-base text-green-100/60 ${
                            expandedThreadId === thread.id ? "" : "line-clamp-2"
                          }`}
                        >
                          {thread.description}
                        </p>
                      </div>
                    </div>
                    {thread.description.length > 100 && (
                      <button
                        onClick={() =>
                          setExpandedThreadId(
                            expandedThreadId === thread.id ? null : thread.id
                          )
                        }
                        className="self-start px-3 py-1 text-sm bg-green-800/50 hover:bg-green-700/50 text-green-100 rounded-lg transition-colors"
                      >
                        {expandedThreadId === thread.id
                          ? "Show Less"
                          : "Show More"}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Abandoned Threads */}
          {abandonedThreads.length > 0 && (
            <div>
              <h3 className="text-lg sm:text-xl font-bold mb-4 flex items-center gap-2 text-white">
                <DynamicIcon
                  name="XCircle"
                  className="w-6 h-6 text-red-400/60"
                />
                Abandoned ({abandonedThreads.length})
              </h3>
              <div className="space-y-3">
                {abandonedThreads.map((thread) => (
                  <div
                    key={thread.id}
                    className="flex flex-col gap-3 p-4 rounded-lg border-2 border-red-800/30 bg-red-900/10 opacity-60 transition-all"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                          <DynamicIcon
                            name="X"
                            className="w-5 h-5 text-red-400 shrink-0"
                          />
                          <h4 className="font-bold text-base sm:text-lg text-white line-through">
                            {thread.title}
                          </h4>
                        </div>
                        <p
                          className={`text-sm sm:text-base text-red-100/50 ${
                            expandedThreadId === thread.id ? "" : "line-clamp-2"
                          }`}
                        >
                          {thread.description}
                        </p>
                      </div>
                    </div>
                    {thread.description.length > 100 && (
                      <button
                        onClick={() =>
                          setExpandedThreadId(
                            expandedThreadId === thread.id ? null : thread.id
                          )
                        }
                        className="self-start px-3 py-1 text-sm bg-red-800/50 hover:bg-red-700/50 text-red-100 rounded-lg transition-colors"
                      >
                        {expandedThreadId === thread.id
                          ? "Show Less"
                          : "Show More"}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
