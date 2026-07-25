"use client";

import { StoryData } from "../misc/structs";
import { useState } from "react";
import { DynamicIcon } from "../components/DynamicIcon";

export default function GoalsPage(storyData: StoryData) {
  const [expandedGoalId, setExpandedGoalId] = useState<string | null>(null);
  const [expandedThreadId, setExpandedThreadId] = useState<string | null>(null);

  // Get threads data
  const activeThreads =
    storyData.threads?.filter((t) => t.status === "active") || [];
  const resolvedThreads =
    storyData.threads?.filter((t) => t.status === "resolved") || [];
  const abandonedThreads =
    storyData.threads?.filter((t) => t.status === "abandoned") || [];

  const hasGoals = storyData.goals && storyData.goals.length > 0;
  const hasThreads = storyData.threads && storyData.threads.length > 0;

  // Empty state - no goals or threads
  if (!hasGoals && !hasThreads) {
    return (
      <div className="w-full">
        <div className="bg-white/[0.04] backdrop-blur-xl rounded-2xl p-6 sm:p-8 border border-white/10 shadow-[0_4px_24px_rgba(0,0,0,0.3)]">
          <h2 className="text-2xl sm:text-3xl font-bold mb-6 bg-linear-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent flex items-center gap-2">
            <DynamicIcon name="Scroll" className="w-8 h-8 text-purple-400" />{" "}
            Journal
          </h2>
          <div className="p-8 text-center rounded-2xl bg-white/[0.02] border-2 border-dashed border-white/10">
            <p className="text-sm sm:text-base text-blue-200/60">
              No goals or story threads yet
            </p>
          </div>
        </div>
      </div>
    );
  }

  const activeGoals = storyData.goals?.filter((g) => g.active) || [];
  const inactiveGoals = storyData.goals?.filter((g) => !g.active) || [];
  const completedGoals = activeGoals.filter((g) => g.fulfilled);
  const ongoingGoals = activeGoals.filter((g) => !g.fulfilled);

  const toggleGoalActive = (goalId: string) => {
    const goal = storyData.goals?.find((g) => g.id === goalId);
    if (goal) {
      goal.active = !goal.active;
      // Force re-render by updating state
      setExpandedGoalId(null);
    }
  };

  const toggleExpanded = (goalId: string) => {
    setExpandedGoalId(expandedGoalId === goalId ? null : goalId);
  };

  return (
    <div className="w-full">
      {/* Goals Section */}
      {hasGoals && (
        <div className="bg-white/[0.04] backdrop-blur-xl rounded-2xl p-6 sm:p-8 border border-white/10 shadow-[0_4px_24px_rgba(0,0,0,0.3)]">
          <h2 className="text-2xl sm:text-3xl font-bold mb-6 bg-linear-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent flex items-center gap-2">
            <DynamicIcon name="Scroll" className="w-8 h-8 text-purple-400" />{" "}
            Goals
          </h2>

          {/* Active Ongoing Goals */}
          {ongoingGoals.length > 0 && (
            <div className="mb-8">
              <h3 className="text-lg sm:text-xl font-bold mb-4 flex items-center gap-2 text-white">
                <DynamicIcon name="Target" className="w-6 h-6 text-blue-400" />
                Active Goals ({ongoingGoals.length})
              </h3>
              <div className="space-y-3">
                {ongoingGoals.map((goal, index) => {
                  if (!goal.id) {
                    console.error("Goal missing id:", goal);
                  }
                  return (
                    <div
                      key={goal.id || `goal-${index}-${goal.title}`}
                      className="flex flex-col gap-3 p-4 rounded-xl border border-blue-400/30 bg-blue-500/[0.06] backdrop-blur-md transition-all card-interactive hover:shadow-[0_4px_16px_rgba(59,130,246,0.15)]"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2">
                            <h4 className="font-bold text-base sm:text-lg text-white">
                              {goal.title}
                            </h4>
                          </div>
                          <p className="text-sm sm:text-base text-blue-100/80 mb-2">
                            {goal.shortDescription}
                          </p>
                          {expandedGoalId === goal.id &&
                            goal.description !== goal.shortDescription && (
                              <p className="text-xs sm:text-sm text-blue-200/60 italic mt-2 p-3 bg-white/5 rounded-lg border border-white/10">
                                {goal.description}
                              </p>
                            )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 pt-2 border-t border-white/10">
                        {goal.description !== goal.shortDescription && (
                          <button
                            onClick={() => toggleExpanded(goal.id)}
                            className="px-3 py-1 text-sm bg-white/5 hover:bg-white/10 border border-white/10 text-blue-100 rounded-lg transition-colors"
                          >
                            {expandedGoalId === goal.id
                              ? "Show Less"
                              : "Show Details"}
                          </button>
                        )}
                        <button
                          onClick={() => toggleGoalActive(goal.id)}
                          className="px-3 py-1 text-sm bg-white/5 hover:bg-white/10 border border-white/10 text-blue-200 rounded-lg transition-colors"
                        >
                          <span className="flex items-center gap-1">
                            <DynamicIcon name="EyeOff" className="w-4 h-4" />{" "}
                            Hide Goal
                          </span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Completed Goals */}
          {completedGoals.length > 0 && (
            <div className="mb-8">
              <h3 className="text-lg sm:text-xl font-bold mb-4 flex items-center gap-2 text-white">
                <DynamicIcon
                  name="CheckCircle"
                  className="w-6 h-6 text-green-400"
                />
                Completed Goals ({completedGoals.length})
              </h3>
              <div className="space-y-3">
                {completedGoals.map((goal, index) => {
                  if (!goal.id) {
                    console.error("Goal missing id:", goal);
                  }
                  return (
                    <div
                      key={goal.id || `goal-completed-${index}-${goal.title}`}
                      className="flex flex-col gap-3 p-4 rounded-xl border border-green-400/30 bg-green-500/[0.06] backdrop-blur-md transition-all card-interactive hover:shadow-[0_4px_16px_rgba(34,197,94,0.15)]"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2">
                            <DynamicIcon
                              name="Check"
                              className="w-5 h-5 text-green-400 shrink-0"
                            />
                            <h4 className="font-bold text-base sm:text-lg text-white line-through">
                              {goal.title}
                            </h4>
                          </div>
                          <p className="text-sm sm:text-base text-green-100/70">
                            {goal.shortDescription}
                          </p>
                          {expandedGoalId === goal.id &&
                            goal.description !== goal.shortDescription && (
                              <p className="text-xs sm:text-sm text-green-200/60 italic mt-2 p-3 bg-white/5 rounded-lg border border-green-400/15">
                                {goal.description}
                              </p>
                            )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 pt-2 border-t border-green-400/15">
                        {goal.description !== goal.shortDescription && (
                          <button
                            onClick={() => toggleExpanded(goal.id)}
                            className="px-3 py-1 text-sm bg-green-500/10 hover:bg-green-500/20 border border-green-400/20 text-green-100 rounded-lg transition-colors"
                          >
                            {expandedGoalId === goal.id
                              ? "Show Less"
                              : "Show Details"}
                          </button>
                        )}
                        <button
                          onClick={() => toggleGoalActive(goal.id)}
                          className="px-3 py-1 text-sm bg-white/5 hover:bg-white/10 border border-white/10 text-blue-200 rounded-lg transition-colors"
                        >
                          <span className="flex items-center gap-1">
                            <DynamicIcon name="EyeOff" className="w-4 h-4" />{" "}
                            Hide Goal
                          </span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Inactive Goals */}
          {inactiveGoals.length > 0 && (
            <div>
              <h3 className="text-lg sm:text-xl font-bold mb-4 flex items-center gap-2 text-white">
                <DynamicIcon
                  name="EyeOff"
                  className="w-6 h-6 text-blue-300/60"
                />
                Inactive Goals ({inactiveGoals.length})
              </h3>
              <div className="space-y-3">
                {inactiveGoals.map((goal, index) => {
                  if (!goal.id) {
                    console.error("Goal missing id:", goal);
                  }
                  return (
                    <div
                      key={goal.id || `goal-inactive-${index}-${goal.title}`}
                      className="flex flex-col gap-3 p-4 rounded-xl border border-white/10 bg-white/[0.03] backdrop-blur-md opacity-70 transition-all card-interactive hover:shadow-[0_4px_12px_rgba(59,130,246,0.08)]"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2">
                            <h4
                              className={`font-bold text-base sm:text-lg text-white ${
                                goal.fulfilled ? "line-through" : ""
                              }`}
                            >
                              {goal.title}
                            </h4>
                            {goal.fulfilled && (
                              <DynamicIcon
                                name="Check"
                                className="w-5 h-5 text-green-400 shrink-0"
                              />
                            )}
                          </div>
                          <p className="text-sm sm:text-base text-blue-200/60">
                            {goal.shortDescription}
                          </p>
                          {expandedGoalId === goal.id &&
                            goal.description !== goal.shortDescription && (
                              <p className="text-xs sm:text-sm text-blue-200/50 italic mt-2 p-3 bg-white/5 rounded-lg border border-white/10">
                                {goal.description}
                              </p>
                            )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 pt-2 border-t border-white/10">
                        {goal.description !== goal.shortDescription && (
                          <button
                            onClick={() => toggleExpanded(goal.id)}
                            className="px-3 py-1 text-sm bg-white/5 hover:bg-white/10 border border-white/10 text-blue-200 rounded-lg transition-colors"
                          >
                            {expandedGoalId === goal.id
                              ? "Show Less"
                              : "Show Details"}
                          </button>
                        )}
                        <button
                          onClick={() => toggleGoalActive(goal.id)}
                          className="px-3 py-1 text-sm bg-linear-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white rounded-lg shadow-md shadow-purple-950/40 transition-all"
                        >
                          <span className="flex items-center gap-1">
                            <DynamicIcon name="Eye" className="w-4 h-4" /> Show
                            Goal
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
        <div className="bg-purple-500/[0.03] backdrop-blur-xl rounded-2xl p-6 sm:p-8 border border-purple-400/15 shadow-[0_4px_24px_rgba(0,0,0,0.3)] mt-6">
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
                    className="flex flex-col gap-3 p-4 rounded-xl border border-purple-400/30 bg-purple-500/[0.06] backdrop-blur-md transition-all card-interactive hover:shadow-[0_4px_16px_rgba(168,85,247,0.15)]"
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
                                ? "bg-red-500/15 text-red-300 border border-red-400/20"
                                : thread.priority === "side"
                                ? "bg-blue-500/15 text-blue-300 border border-blue-400/20"
                                : "bg-white/10 text-blue-200/70 border border-white/10"
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
                        className="self-start px-3 py-1 text-sm bg-purple-500/10 hover:bg-purple-500/20 border border-purple-400/20 text-purple-100 rounded-lg transition-colors"
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
                    className="flex flex-col gap-3 p-4 rounded-xl border border-green-400/20 bg-green-500/[0.04] backdrop-blur-md opacity-80 transition-all card-interactive hover:shadow-[0_4px_16px_rgba(34,197,94,0.12)]"
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
                                ? "bg-red-500/10 text-red-300/60 border border-red-400/10"
                                : thread.priority === "side"
                                ? "bg-blue-500/10 text-blue-300/60 border border-blue-400/10"
                                : "bg-white/5 text-blue-200/40 border border-white/10"
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
                        className="self-start px-3 py-1 text-sm bg-green-500/10 hover:bg-green-500/20 border border-green-400/20 text-green-100 rounded-lg transition-colors"
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
                    className="flex flex-col gap-3 p-4 rounded-xl border border-red-400/15 bg-red-500/[0.03] backdrop-blur-md opacity-60 transition-all card-interactive hover:shadow-[0_4px_12px_rgba(239,68,68,0.08)]"
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
                        className="self-start px-3 py-1 text-sm bg-red-500/10 hover:bg-red-500/20 border border-red-400/20 text-red-100 rounded-lg transition-colors"
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
