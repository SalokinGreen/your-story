"use client";

import { StoryData, StoryThread } from "../misc/structs";
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
        <div className="bg-ys-surface backdrop-blur-xl rounded-2xl p-6 sm:p-8 border border-ys-border shadow-[0_4px_24px_rgba(0,0,0,0.3)]">
          <h2 className="text-2xl sm:text-3xl font-bold mb-6 text-ys-accent flex items-center gap-2">
            <DynamicIcon name="Scroll" className="w-8 h-8 text-ys-accent" />{" "}
            Journal
          </h2>
          <div className="p-8 text-center rounded-2xl bg-ys-surface border-2 border-dashed border-ys-border">
            <p className="text-sm sm:text-base text-ys-muted">
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
        <div className="bg-ys-surface backdrop-blur-xl rounded-2xl p-6 sm:p-8 border border-ys-border shadow-[0_4px_24px_rgba(0,0,0,0.3)]">
          <h2 className="text-2xl sm:text-3xl font-bold mb-6 text-ys-accent flex items-center gap-2">
            <DynamicIcon name="Scroll" className="w-8 h-8 text-ys-accent" />{" "}
            Goals
          </h2>

          {/* Active Ongoing Goals */}
          {ongoingGoals.length > 0 && (
            <div className="mb-8">
              <h3 className="text-lg sm:text-xl font-bold mb-4 flex items-center gap-2 text-ys-text">
                <DynamicIcon name="Target" className="w-6 h-6 text-ys-accent" />
                Active Goals ({ongoingGoals.length})
              </h3>
              <div className="space-y-3">
                {ongoingGoals.map((goal) => {
                  if (!goal.id) {
                    console.error("Goal missing id:", goal);
                    goal.id = `goal-${Math.random()}`; // Fallback ID
                  }
                  return (
                    <div
                      key={goal.id || `goal-${goal.title}-${Math.random()}`}
                      className="flex flex-col gap-3 p-4 rounded-xl border border-ys-accent/30 bg-ys-accent/[0.06] backdrop-blur-md transition-all card-interactive hover:shadow-[0_4px_16px_color-mix(in_srgb,var(--ys-accent)_15%,transparent)]"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2">
                            <h4 className="font-bold text-base sm:text-lg text-ys-text">
                              {goal.title}
                            </h4>
                          </div>
                          <p className="text-sm sm:text-base text-ys-text/80 mb-2">
                            {goal.shortDescription}
                          </p>
                          {expandedGoalId === goal.id &&
                            goal.description !== goal.shortDescription && (
                              <p className="text-xs sm:text-sm text-ys-muted italic mt-2 p-3 bg-ys-surface rounded-lg border border-ys-border">
                                {goal.description}
                              </p>
                            )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 pt-2 border-t border-ys-border">
                        {goal.description !== goal.shortDescription && (
                          <button
                            onClick={() => toggleExpanded(goal.id)}
                            className="px-3 py-1 text-sm bg-ys-surface hover:bg-ys-surface-2 border border-ys-border text-ys-text rounded-lg transition-colors"
                          >
                            {expandedGoalId === goal.id
                              ? "Show Less"
                              : "Show Details"}
                          </button>
                        )}
                        <button
                          onClick={() => toggleGoalActive(goal.id)}
                          className="px-3 py-1 text-sm bg-ys-surface hover:bg-ys-surface-2 border border-ys-border text-ys-text rounded-lg transition-colors"
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
              <h3 className="text-lg sm:text-xl font-bold mb-4 flex items-center gap-2 text-ys-text">
                <DynamicIcon
                  name="CheckCircle"
                  className="w-6 h-6 text-ys-success"
                />
                Completed Goals ({completedGoals.length})
              </h3>
              <div className="space-y-3">
                {completedGoals.map((goal) => {
                  if (!goal.id) {
                    console.error("Goal missing id:", goal);
                  }
                  return (
                    <div
                      key={
                        goal.id ||
                        `goal-completed-${goal.title}-${Math.random()}`
                      }
                      className="flex flex-col gap-3 p-4 rounded-xl border border-ys-success/30 bg-ys-success/[0.06] backdrop-blur-md transition-all card-interactive hover:shadow-[0_4px_16px_color-mix(in_srgb,var(--ys-success)_15%,transparent)]"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2">
                            <DynamicIcon
                              name="Check"
                              className="w-5 h-5 text-ys-success shrink-0"
                            />
                            <h4 className="font-bold text-base sm:text-lg text-ys-text line-through">
                              {goal.title}
                            </h4>
                          </div>
                          <p className="text-sm sm:text-base text-ys-text/70">
                            {goal.shortDescription}
                          </p>
                          {expandedGoalId === goal.id &&
                            goal.description !== goal.shortDescription && (
                              <p className="text-xs sm:text-sm text-ys-text/60 italic mt-2 p-3 bg-ys-surface rounded-lg border border-ys-success/15">
                                {goal.description}
                              </p>
                            )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 pt-2 border-t border-ys-success/15">
                        {goal.description !== goal.shortDescription && (
                          <button
                            onClick={() => toggleExpanded(goal.id)}
                            className="px-3 py-1 text-sm bg-ys-success/10 hover:bg-ys-success/20 border border-ys-success/20 text-ys-text rounded-lg transition-colors"
                          >
                            {expandedGoalId === goal.id
                              ? "Show Less"
                              : "Show Details"}
                          </button>
                        )}
                        <button
                          onClick={() => toggleGoalActive(goal.id)}
                          className="px-3 py-1 text-sm bg-ys-surface hover:bg-ys-surface-2 border border-ys-border text-ys-text rounded-lg transition-colors"
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
              <h3 className="text-lg sm:text-xl font-bold mb-4 flex items-center gap-2 text-ys-text">
                <DynamicIcon
                  name="EyeOff"
                  className="w-6 h-6 text-ys-muted"
                />
                Inactive Goals ({inactiveGoals.length})
              </h3>
              <div className="space-y-3">
                {inactiveGoals.map((goal) => {
                  if (!goal.id) {
                    console.error("Goal missing id:", goal);
                  }
                  return (
                    <div
                      key={
                        goal.id ||
                        `goal-inactive-${goal.title}-${Math.random()}`
                      }
                      className="flex flex-col gap-3 p-4 rounded-xl border border-ys-border bg-ys-surface backdrop-blur-md opacity-70 transition-all card-interactive hover:shadow-[0_4px_12px_color-mix(in_srgb,var(--ys-accent)_8%,transparent)]"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2">
                            <h4
                              className={`font-bold text-base sm:text-lg text-ys-text ${
                                goal.fulfilled ? "line-through" : ""
                              }`}
                            >
                              {goal.title}
                            </h4>
                            {goal.fulfilled && (
                              <DynamicIcon
                                name="Check"
                                className="w-5 h-5 text-ys-success shrink-0"
                              />
                            )}
                          </div>
                          <p className="text-sm sm:text-base text-ys-muted">
                            {goal.shortDescription}
                          </p>
                          {expandedGoalId === goal.id &&
                            goal.description !== goal.shortDescription && (
                              <p className="text-xs sm:text-sm text-ys-muted italic mt-2 p-3 bg-ys-surface rounded-lg border border-ys-border">
                                {goal.description}
                              </p>
                            )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 pt-2 border-t border-ys-border">
                        {goal.description !== goal.shortDescription && (
                          <button
                            onClick={() => toggleExpanded(goal.id)}
                            className="px-3 py-1 text-sm bg-ys-surface hover:bg-ys-surface-2 border border-ys-border text-ys-text rounded-lg transition-colors"
                          >
                            {expandedGoalId === goal.id
                              ? "Show Less"
                              : "Show Details"}
                          </button>
                        )}
                        <button
                          onClick={() => toggleGoalActive(goal.id)}
                          className="px-3 py-1 text-sm bg-ys-accent text-ys-on-accent rounded-lg shadow-md shadow-ys-accent/40 transition-all"
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
        <div className="bg-ys-accent/[0.03] backdrop-blur-xl rounded-2xl p-6 sm:p-8 border border-ys-accent/15 shadow-[0_4px_24px_rgba(0,0,0,0.3)] mt-6">
          <h2 className="text-2xl sm:text-3xl font-bold mb-6 text-ys-accent flex items-center gap-2">
            <DynamicIcon name="GitBranch" className="w-8 h-8 text-ys-accent" />{" "}
            Story Threads
          </h2>

          {/* Active Threads */}
          {activeThreads.length > 0 && (
            <div className="mb-8">
              <h3 className="text-lg sm:text-xl font-bold mb-4 flex items-center gap-2 text-ys-text">
                <DynamicIcon
                  name="CircleDot"
                  className="w-6 h-6 text-ys-accent"
                />
                Active Threads ({activeThreads.length})
              </h3>
              <div className="space-y-3">
                {activeThreads.map((thread) => (
                  <div
                    key={thread.id}
                    className="flex flex-col gap-3 p-4 rounded-xl border border-ys-accent/30 bg-ys-accent/[0.06] backdrop-blur-md transition-all card-interactive hover:shadow-[0_4px_16px_color-mix(in_srgb,var(--ys-accent)_15%,transparent)]"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                          <h4 className="font-bold text-base sm:text-lg text-ys-text">
                            {thread.title}
                          </h4>
                          <span
                            className={`px-2 py-0.5 rounded-full text-xs font-bold shrink-0 ${
                              thread.priority === "main"
                                ? "bg-ys-danger/15 text-ys-danger border border-ys-danger/20"
                                : thread.priority === "side"
                                ? "bg-ys-accent/15 text-ys-accent border border-ys-accent/20"
                                : "bg-ys-surface-2 text-ys-muted border border-ys-border"
                            }`}
                          >
                            {thread.priority || "side"}
                          </span>
                        </div>
                        <p
                          className={`text-sm sm:text-base text-ys-text/80 ${
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
                        className="self-start px-3 py-1 text-sm bg-ys-accent/10 hover:bg-ys-accent/20 border border-ys-accent/20 text-ys-text rounded-lg transition-colors"
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
              <h3 className="text-lg sm:text-xl font-bold mb-4 flex items-center gap-2 text-ys-text">
                <DynamicIcon
                  name="CheckCircle"
                  className="w-6 h-6 text-ys-success"
                />
                Resolved ({resolvedThreads.length})
              </h3>
              <div className="space-y-3">
                {resolvedThreads.map((thread) => (
                  <div
                    key={thread.id}
                    className="flex flex-col gap-3 p-4 rounded-xl border border-ys-success/20 bg-ys-success/[0.04] backdrop-blur-md opacity-80 transition-all card-interactive hover:shadow-[0_4px_16px_color-mix(in_srgb,var(--ys-success)_12%,transparent)]"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                          <DynamicIcon
                            name="Check"
                            className="w-5 h-5 text-ys-success shrink-0"
                          />
                          <h4 className="font-bold text-base sm:text-lg text-ys-text line-through">
                            {thread.title}
                          </h4>
                          <span
                            className={`px-2 py-0.5 rounded-full text-xs font-bold shrink-0 ${
                              thread.priority === "main"
                                ? "bg-ys-danger/10 text-ys-danger/60 border border-ys-danger/10"
                                : thread.priority === "side"
                                ? "bg-ys-accent/10 text-ys-muted border border-ys-accent/10"
                                : "bg-ys-surface text-ys-muted border border-ys-border"
                            }`}
                          >
                            {thread.priority || "side"}
                          </span>
                        </div>
                        <p
                          className={`text-sm sm:text-base text-ys-text/60 ${
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
                        className="self-start px-3 py-1 text-sm bg-ys-success/10 hover:bg-ys-success/20 border border-ys-success/20 text-ys-text rounded-lg transition-colors"
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
              <h3 className="text-lg sm:text-xl font-bold mb-4 flex items-center gap-2 text-ys-text">
                <DynamicIcon
                  name="XCircle"
                  className="w-6 h-6 text-ys-danger/60"
                />
                Abandoned ({abandonedThreads.length})
              </h3>
              <div className="space-y-3">
                {abandonedThreads.map((thread) => (
                  <div
                    key={thread.id}
                    className="flex flex-col gap-3 p-4 rounded-xl border border-ys-danger/15 bg-ys-danger/[0.03] backdrop-blur-md opacity-60 transition-all card-interactive hover:shadow-[0_4px_12px_color-mix(in_srgb,var(--ys-danger)_8%,transparent)]"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                          <DynamicIcon
                            name="X"
                            className="w-5 h-5 text-ys-danger shrink-0"
                          />
                          <h4 className="font-bold text-base sm:text-lg text-ys-text line-through">
                            {thread.title}
                          </h4>
                        </div>
                        <p
                          className={`text-sm sm:text-base text-ys-text/50 ${
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
                        className="self-start px-3 py-1 text-sm bg-ys-danger/10 hover:bg-ys-danger/20 border border-ys-danger/20 text-ys-text rounded-lg transition-colors"
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
