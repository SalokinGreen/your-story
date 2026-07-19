"use client";

import { StoryData } from "../misc/structs";
import { useState } from "react";
import { DynamicIcon } from "../components/DynamicIcon";

export default function AchievementsPage(storyData: StoryData) {
  const [showUnlocked, setShowUnlocked] = useState(true);
  const [showLocked, setShowLocked] = useState(true);

  const achievements = storyData.achievements || [];

  // Separate achievements by status
  const unlockedAchievements = achievements.filter((a) => a.dateAchieved);
  const visibleLockedAchievements = achievements.filter(
    (a) => !a.dateAchieved && !a.hidden
  );
  const hiddenCount = achievements.filter(
    (a) => a.hidden && !a.dateAchieved
  ).length;

  // Calculate total points
  const earnedPoints = unlockedAchievements.reduce(
    (sum, a) => sum + (a.points || 0),
    0
  );
  const totalPossiblePoints = achievements
    .filter((a) => !a.hidden || a.dateAchieved)
    .reduce((sum, a) => sum + (a.points || 0), 0);

  // Empty state
  if (achievements.length === 0) {
    return (
      <div className="w-full">
        <div className="bg-blue-950/50 backdrop-blur-sm rounded-2xl p-6 sm:p-8 border border-blue-800/30">
          <h2 className="text-2xl sm:text-3xl font-bold mb-6 bg-linear-to-r from-amber-400 via-yellow-400 to-orange-400 bg-clip-text text-transparent flex items-center gap-2">
            <DynamicIcon name="Trophy" className="w-8 h-8 text-amber-400" />{" "}
            Achievements
          </h2>
          <div className="p-8 text-center rounded-lg bg-blue-900/20 border-2 border-dashed border-blue-700/40">
            <p className="text-sm sm:text-base text-blue-200/60">
              No achievements available
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="bg-blue-950/50 backdrop-blur-sm rounded-2xl p-6 sm:p-8 border border-blue-800/30">
        {/* Header with progress */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <h2 className="text-2xl sm:text-3xl font-bold bg-linear-to-r from-amber-400 via-yellow-400 to-orange-400 bg-clip-text text-transparent flex items-center gap-2">
            <DynamicIcon name="Trophy" className="w-8 h-8 text-amber-400" />{" "}
            Achievements
          </h2>

          {/* Progress summary */}
          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="text-sm text-blue-200/60">Progress</div>
              <div className="font-bold text-white">
                {unlockedAchievements.length} /{" "}
                {achievements.filter((a) => !a.hidden || a.dateAchieved).length}
              </div>
            </div>
            <div className="text-right">
              <div className="text-sm text-blue-200/60">Points</div>
              <div className="font-bold text-amber-400">
                {earnedPoints} / {totalPossiblePoints}
              </div>
            </div>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mb-6">
          <div className="h-3 bg-blue-900/50 rounded-full overflow-hidden">
            <div
              className="h-full bg-linear-to-r from-amber-500 to-yellow-400 rounded-full transition-all duration-500"
              style={{
                width: `${
                  achievements.filter((a) => !a.hidden || a.dateAchieved)
                    .length > 0
                    ? (unlockedAchievements.length /
                        achievements.filter((a) => !a.hidden || a.dateAchieved)
                          .length) *
                      100
                    : 0
                }%`,
              }}
            />
          </div>
        </div>

        {/* Filter toggles */}
        <div className="flex flex-wrap gap-2 mb-6">
          <button
            onClick={() => setShowUnlocked(!showUnlocked)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
              showUnlocked
                ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                : "bg-blue-900/30 text-blue-200/50 border border-blue-800/30"
            }`}
          >
            <DynamicIcon name="Check" className="w-4 h-4 inline-block mr-1.5" />
            Unlocked ({unlockedAchievements.length})
          </button>
          <button
            onClick={() => setShowLocked(!showLocked)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
              showLocked
                ? "bg-blue-500/20 text-blue-300 border border-blue-500/40"
                : "bg-blue-900/30 text-blue-200/50 border border-blue-800/30"
            }`}
          >
            <DynamicIcon name="Lock" className="w-4 h-4 inline-block mr-1.5" />
            Locked ({visibleLockedAchievements.length})
          </button>
          {hiddenCount > 0 && (
            <span className="px-3 py-1.5 rounded-lg text-sm font-medium bg-purple-500/10 text-purple-300 border border-purple-500/30">
              <DynamicIcon name="Eye" className="w-4 h-4 inline-block mr-1.5" />
              +{hiddenCount} Hidden
            </span>
          )}
        </div>

        {/* Unlocked Achievements */}
        {showUnlocked && unlockedAchievements.length > 0 && (
          <div className="mb-8">
            <h3 className="text-lg font-bold mb-4 flex items-center gap-2 text-white">
              <DynamicIcon name="Award" className="w-5 h-5 text-amber-400" />
              Unlocked ({unlockedAchievements.length})
            </h3>
            <div className="grid gap-3">
              {unlockedAchievements.map((achievement, index) => (
                <div
                  key={`unlocked-${index}`}
                  className="card-interactive flex flex-row items-start gap-3 p-4 rounded-xl border-2 bg-linear-to-r from-amber-500/10 to-yellow-500/10 border-amber-500/40 hover:border-amber-400/60 hover:shadow-[0_4px_20px_rgba(245,158,11,0.2)]"
                >
                  <div className="shrink-0 w-12 h-12 rounded-xl bg-amber-500/20 border border-amber-400/50 flex items-center justify-center shadow-[0_0_12px_rgba(245,158,11,0.25)]">
                    <DynamicIcon
                      name={achievement.symbol || "Trophy"}
                      className="w-6 h-6 text-amber-400"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-row items-center justify-between gap-2 mb-1">
                      <span className="font-bold text-base text-white">
                        {achievement.title}
                      </span>
                      <span className="px-2 py-0.5 bg-amber-500/20 text-amber-300 rounded-full text-xs font-bold shrink-0">
                        {achievement.points} pts
                      </span>
                    </div>
                    {achievement.description && (
                      <p className="text-sm text-blue-100/70 mb-2">
                        {achievement.description}
                      </p>
                    )}
                    <p className="text-xs text-amber-400/80">
                      🎉 Unlocked:{" "}
                      {new Date(achievement.dateAchieved!).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Locked Achievements */}
        {showLocked && visibleLockedAchievements.length > 0 && (
          <div>
            <h3 className="text-lg font-bold mb-4 flex items-center gap-2 text-white">
              <DynamicIcon name="Target" className="w-5 h-5 text-blue-400" />
              Locked ({visibleLockedAchievements.length})
            </h3>
            <div className="grid gap-3">
              {visibleLockedAchievements.map((achievement, index) => (
                <div
                  key={`locked-${index}`}
                  className="card-interactive flex flex-row items-start gap-3 p-4 rounded-xl border bg-blue-900/20 border-blue-800/40 opacity-70 hover:opacity-90 hover:border-blue-600/40"
                >
                  <div className="shrink-0 w-12 h-12 rounded-xl bg-blue-900/40 border border-blue-700/50 flex items-center justify-center">
                    <DynamicIcon
                      name={achievement.symbol || "Trophy"}
                      className="w-6 h-6 text-blue-400/60"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-row items-center justify-between gap-2 mb-1">
                      <span className="font-medium text-base text-blue-100/80">
                        {achievement.title}
                      </span>
                      <span className="px-2 py-0.5 bg-blue-800/30 text-blue-300/60 rounded-full text-xs font-bold shrink-0">
                        {achievement.points} pts
                      </span>
                    </div>
                    {achievement.description && (
                      <p className="text-sm text-blue-200/50">
                        {achievement.description}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
