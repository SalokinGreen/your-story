"use client";

import { StoryData, UPGRADE_COSTS } from "../misc/structs";
import { DynamicIcon } from "../components/DynamicIcon";

export default function StatsPage(storyData: StoryData) {
  return (
    <div className="w-full">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6 sm:p-8 border border-gray-200 dark:border-gray-700">
        <div className="flex flex-col gap-6">
          {/* Player Info Section */}
          <div>
            <h2 className="text-2xl sm:text-3xl font-bold mb-3 bg-linear-to-r from-blue-600 via-purple-600 to-pink-600 bg-clip-text text-transparent">
              {storyData.player_name}
            </h2>
            <p className="text-sm sm:text-base text-gray-700 dark:text-gray-300">
              {storyData.player_summary}
            </p>
          </div>

          {/* Points Display - Prominent at top */}
          <div className="flex flex-row items-center gap-3 p-4 rounded-lg bg-linear-to-r from-yellow-50 to-amber-50 dark:from-yellow-900/20 dark:to-amber-900/20 border-2 border-yellow-400 dark:border-yellow-600 shadow-lg">
            <div className="shrink-0">
              <DynamicIcon
                name="Coins"
                className="w-8 h-8 sm:w-10 sm:h-10 text-yellow-600 dark:text-yellow-400"
              />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex flex-row items-baseline justify-between mb-1">
                <span className="font-bold text-base sm:text-lg text-gray-900 dark:text-white">
                  Upgrade Points
                </span>
                <span className="font-bold text-xl sm:text-2xl text-yellow-600 dark:text-yellow-400">
                  {storyData.points}
                </span>
              </div>
              <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">
                Earn {UPGRADE_COSTS.BEAT_REWARD} points per story beat,{" "}
                {UPGRADE_COSTS.CHAPTER_REWARD} per chapter. Spend in the
                Upgrades shop!
              </p>
            </div>
          </div>

          {/* Stats Section */}
          <div>
            <h3 className="text-lg sm:text-xl font-bold mb-4 flex items-center gap-2 text-gray-900 dark:text-white">
              <DynamicIcon
                name="BarChart2"
                className="w-6 h-6 sm:w-7 sm:h-7 text-blue-600 dark:text-blue-400"
              />
              Statistics
            </h3>
            <div className="space-y-3">
              {storyData.stats.map((stat, index) => (
                <div
                  key={index}
                  className="flex flex-row items-center gap-3 p-4 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800"
                >
                  <div className="shrink-0">
                    <DynamicIcon
                      name={stat.symbol}
                      className="w-8 h-8 sm:w-9 sm:h-9 text-blue-600 dark:text-blue-400"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-row items-baseline justify-between mb-2">
                      <span className="font-bold text-sm sm:text-base text-gray-900 dark:text-white">
                        {stat.name}
                      </span>
                      <span className="font-bold text-base sm:text-lg text-blue-600 dark:text-blue-400">
                        {stat.value}%
                      </span>
                    </div>
                    <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mb-2">
                      {stat.description}
                    </p>
                    {/* Progress bar */}
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5">
                      <div
                        className="bg-linear-to-r from-blue-500 to-blue-600 h-2.5 rounded-full transition-all duration-300 shadow-sm"
                        style={{
                          width: `${stat.value <= 100 ? stat.value : 100}%`,
                        }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Resources Section */}
          <div>
            <h3 className="text-lg sm:text-xl font-bold mb-4 flex items-center gap-2 text-gray-900 dark:text-white">
              <DynamicIcon
                name="Zap"
                className="w-6 h-6 sm:w-7 sm:h-7 text-yellow-600 dark:text-yellow-400"
              />
              Resources
            </h3>
            <div className="space-y-3">
              {/* Momentum - Special Resource */}
              <div className="flex flex-row items-center gap-3 p-4 rounded-lg bg-yellow-50 dark:bg-yellow-900/20 border-2 border-yellow-400 dark:border-yellow-600 shadow-md">
                <div className="shrink-0">
                  <DynamicIcon
                    name="Zap"
                    className="w-8 h-8 sm:w-9 sm:h-9 text-yellow-600 dark:text-yellow-400"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-row items-baseline justify-between mb-2">
                    <span className="font-bold text-sm sm:text-base text-gray-900 dark:text-white">
                      Momentum
                    </span>
                    <span className="font-bold text-base sm:text-lg text-yellow-600 dark:text-yellow-400">
                      {storyData.momentum}/{storyData.maxMomentum}
                    </span>
                  </div>
                  <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mb-2">
                    Earn momentum on critical successes and strong rolls. Spend
                    to reroll (1⚡) or guarantee success (2⚡).
                  </p>
                  {/* Momentum dots display */}
                  <div className="flex gap-1.5 mb-2">
                    {Array.from({ length: storyData.maxMomentum }).map(
                      (_, i) => (
                        <div
                          key={i}
                          className={`w-4 h-4 rounded-full border-2 transition-all ${
                            i < storyData.momentum
                              ? "bg-yellow-400 dark:bg-yellow-500 border-yellow-500 dark:border-yellow-400 shadow-sm"
                              : "bg-transparent border-gray-300 dark:border-gray-600"
                          }`}
                        />
                      )
                    )}
                  </div>
                  {/* Progress bar */}
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5">
                    <div
                      className="bg-linear-to-r from-yellow-400 to-yellow-500 h-2.5 rounded-full transition-all duration-300 shadow-sm"
                      style={{
                        width: `${
                          (storyData.momentum / storyData.maxMomentum) * 100 <=
                          100
                            ? (storyData.momentum / storyData.maxMomentum) * 100
                            : 100
                        }%`,
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Regular Resources */}
              {storyData.resources.map((resource, index) => (
                <div
                  key={index}
                  className="flex flex-row items-center gap-3 p-4 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800"
                >
                  <div className="shrink-0">
                    <DynamicIcon
                      name={resource.symbol}
                      className="w-8 h-8 sm:w-9 sm:h-9 text-green-600 dark:text-green-400"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-row items-baseline justify-between mb-2">
                      <span className="font-bold text-sm sm:text-base text-gray-900 dark:text-white">
                        {resource.name}
                      </span>
                      <span className="font-bold text-base sm:text-lg text-green-600 dark:text-green-400">
                        {resource.value}/{resource.maxValue}
                      </span>
                    </div>
                    <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mb-2">
                      {resource.description}
                    </p>
                    {/* Progress bar */}
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5">
                      <div
                        className={`h-2.5 rounded-full transition-all duration-300 shadow-sm ${
                          resource.value / resource.maxValue > 0.5
                            ? "bg-linear-to-r from-green-500 to-green-600"
                            : resource.value / resource.maxValue > 0.25
                            ? "bg-linear-to-r from-yellow-500 to-yellow-600"
                            : "bg-linear-to-r from-red-500 to-red-600"
                        }`}
                        style={{
                          width: `${
                            (resource.value / resource.maxValue) * 100 <= 100
                              ? (resource.value / resource.maxValue) * 100
                              : 100
                          }%`,
                        }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Inventory Section */}
          <div>
            <h3 className="text-lg sm:text-xl font-bold mb-4 flex items-center gap-2 text-gray-900 dark:text-white">
              <DynamicIcon
                name="Backpack"
                className="w-6 h-6 sm:w-7 sm:h-7 text-purple-600 dark:text-purple-400"
              />
              Inventory
            </h3>
            {storyData.inventory.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {storyData.inventory.map((item, index) => (
                  <div
                    key={index}
                    className="flex flex-row items-center gap-3 p-4 rounded-lg bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800"
                  >
                    <div className="shrink-0">
                      <DynamicIcon
                        name={item.symbol}
                        className="w-8 h-8 sm:w-9 sm:h-9 text-purple-600 dark:text-purple-400"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-row items-baseline justify-between mb-1">
                        <span className="font-bold text-sm sm:text-base text-gray-900 dark:text-white truncate">
                          {item.name}
                        </span>
                        <span className="font-bold text-sm sm:text-base text-purple-600 dark:text-purple-400 ml-2">
                          ×{item.quantity}
                        </span>
                      </div>
                      {item.description && (
                        <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 line-clamp-2">
                          {item.description}
                        </p>
                      )}
                      {item.type && (
                        <span className="inline-block mt-2 px-2 py-0.5 text-xs rounded-full bg-purple-200 dark:bg-purple-800 text-purple-800 dark:text-purple-200 font-semibold">
                          {item.type}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-8 text-center rounded-lg bg-gray-50 dark:bg-gray-700/30 border-2 border-dashed border-gray-300 dark:border-gray-600">
                <p className="text-sm sm:text-base text-gray-500 dark:text-gray-400">
                  Your inventory is empty
                </p>
              </div>
            )}
          </div>

          {/* Achievements Section */}
          <div>
            <h3 className="text-lg sm:text-xl font-bold mb-4 flex items-center gap-2 text-gray-900 dark:text-white">
              <DynamicIcon
                name="Trophy"
                className="w-6 h-6 sm:w-7 sm:h-7 text-yellow-600 dark:text-yellow-400"
              />
              Achievements
              {storyData.achievements.filter((a) => a.hidden && !a.dateAchieved)
                .length > 0 && (
                <span className="px-2 py-1 bg-purple-200 dark:bg-purple-800/50 text-purple-800 dark:text-purple-200 rounded-full text-xs font-bold ml-2">
                  +
                  {
                    storyData.achievements.filter(
                      (a) => a.hidden && !a.dateAchieved
                    ).length
                  }{" "}
                  <DynamicIcon name="Lock" className="inline-block w-3 h-3" />{" "}
                  Hidden
                </span>
              )}
            </h3>
            {storyData.achievements.filter((a) => !a.hidden || a.dateAchieved)
              .length > 0 ? (
              <div className="space-y-3">
                {storyData.achievements
                  .filter((a) => !a.hidden || a.dateAchieved)
                  .map((achievement, index) => (
                    <div
                      key={index}
                      className={`flex flex-row items-center gap-3 p-4 rounded-lg border-2 transition-all ${
                        achievement.dateAchieved
                          ? "bg-yellow-50 dark:bg-yellow-900/20 border-yellow-400 dark:border-yellow-600 shadow-md"
                          : "bg-gray-50 dark:bg-gray-700/30 border-gray-300 dark:border-gray-600 opacity-60"
                      }`}
                    >
                      <div className="shrink-0">
                        <DynamicIcon
                          name={achievement.symbol}
                          className="w-8 h-8 sm:w-9 sm:h-9 text-yellow-600 dark:text-yellow-400"
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-row items-baseline justify-between mb-1">
                          <span className="font-bold text-sm sm:text-base text-gray-900 dark:text-white">
                            {achievement.title}
                          </span>
                          <span className="font-bold text-xs sm:text-sm text-yellow-600 dark:text-yellow-400 ml-2">
                            {achievement.points} pts
                          </span>
                        </div>
                        {achievement.description && (
                          <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">
                            {achievement.description}
                          </p>
                        )}
                        {achievement.dateAchieved && (
                          <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                            🎉 Unlocked:{" "}
                            {new Date(
                              achievement.dateAchieved
                            ).toLocaleDateString()}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
              </div>
            ) : (
              <div className="p-8 text-center rounded-lg bg-gray-50 dark:bg-gray-700/30 border-2 border-dashed border-gray-300 dark:border-gray-600">
                <p className="text-sm sm:text-base text-gray-500 dark:text-gray-400">
                  No achievements yet
                </p>
              </div>
            )}
          </div>

          {/* Quests Section */}
          {storyData.quests && storyData.quests.length > 0 && (
            <div>
              <h3 className="text-lg sm:text-xl font-bold mb-4 flex items-center gap-2 text-gray-900 dark:text-white">
                <DynamicIcon
                  name="Scroll"
                  className="w-6 h-6 sm:w-7 sm:h-7 text-blue-600 dark:text-blue-400"
                />
                Quests
              </h3>
              {storyData.quests.filter((q) => q.active).length > 0 ? (
                <div className="space-y-3">
                  {storyData.quests
                    .filter((q) => q.active)
                    .map((quest, index) => (
                      <div
                        key={quest.id}
                        className={`flex flex-col gap-2 p-4 rounded-lg border-2 transition-all ${
                          quest.fulfilled
                            ? "bg-green-50 dark:bg-green-900/20 border-green-400 dark:border-green-600 shadow-md"
                            : "bg-blue-50 dark:bg-blue-900/20 border-blue-400 dark:border-blue-600"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-bold text-sm sm:text-base text-gray-900 dark:text-white">
                                {quest.title}
                              </span>
                              {quest.fulfilled && (
                                <span className="text-green-500 shrink-0">
                                  <DynamicIcon
                                    name="Check"
                                    className="w-4 h-4"
                                  />
                                </span>
                              )}
                            </div>
                            <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mb-2">
                              {quest.shortDescription}
                            </p>
                            {quest.description !== quest.shortDescription && (
                              <p className="text-xs text-gray-500 dark:text-gray-500 italic">
                                {quest.description}
                              </p>
                            )}
                          </div>
                          <span className="font-bold text-xs sm:text-sm text-blue-600 dark:text-blue-400 shrink-0">
                            {quest.points} pts
                          </span>
                        </div>
                      </div>
                    ))}
                </div>
              ) : (
                <div className="p-8 text-center rounded-lg bg-gray-50 dark:bg-gray-700/30 border-2 border-dashed border-gray-300 dark:border-gray-600">
                  <p className="text-sm sm:text-base text-gray-500 dark:text-gray-400">
                    No active quests
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
