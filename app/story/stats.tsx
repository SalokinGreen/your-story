"use client";

import { StoryData, UPGRADE_COSTS } from "../misc/structs";
import { DynamicIcon } from "../components/DynamicIcon";
import { useState } from "react";
import { getRPGSystem } from "../misc/rpgSystems";

type StatsTab =
  | "stats"
  | "resources"
  | "inventory"
  | "achievements"
  | "quests"
  | "relationships";

export default function StatsPage(storyData: StoryData) {
  const [activeTab, setActiveTab] = useState<StatsTab>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("statsActiveTab");
      return (saved as StatsTab) || "stats";
    }
    return "stats";
  });

  const handleTabChange = (tab: StatsTab) => {
    setActiveTab(tab);
    if (typeof window !== "undefined") {
      localStorage.setItem("statsActiveTab", tab);
    }
  };

  return (
    <div className="w-full">
      <div className="bg-white dark:bg-blue-950 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700">
        {/* Player Info Section - Always Visible */}
        <div className="p-4 sm:p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex flex-col gap-3">
            <div>
              <h2 className="text-xl sm:text-2xl font-bold mb-2 bg-linear-to-r from-blue-600 via-purple-600 to-pink-600 bg-clip-text text-transparent">
                {storyData.player_name}
              </h2>
              <p className="text-sm text-gray-700 dark:text-gray-300">
                {storyData.player_summary}
              </p>
            </div>

            {/* Points Display - Prominent at top */}
            <div className="flex flex-row items-center gap-3 p-3 rounded-lg bg-linear-to-r from-yellow-50 to-amber-50 dark:from-yellow-900/20 dark:to-amber-900/20 border-2 border-yellow-400 dark:border-yellow-600 shadow-md">
              <div className="shrink-0">
                <DynamicIcon
                  name="Coins"
                  className="w-7 h-7 sm:w-8 sm:h-8 text-yellow-600 dark:text-yellow-400"
                />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex flex-row items-baseline justify-between mb-0.5">
                  <span className="font-bold text-sm sm:text-base text-gray-900 dark:text-white">
                    Upgrade Points
                  </span>
                  <span className="font-bold text-lg sm:text-xl text-yellow-600 dark:text-yellow-400">
                    {storyData.points}
                  </span>
                </div>
                <p className="text-xs text-gray-600 dark:text-gray-400">
                  Earn {UPGRADE_COSTS.BEAT_REWARD} points per story beat,{" "}
                  {UPGRADE_COSTS.CHAPTER_REWARD} per chapter. Spend in the
                  Upgrades shop!
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex gap-1.5 px-3 sm:px-4 pt-3 pb-1.5 border-b border-gray-200 dark:border-gray-700 overflow-x-auto scrollbar-hide">
          {[
            { id: "stats", label: "Stats", icon: "BarChart2", color: "blue" },
            {
              id: "resources",
              label: "Resources",
              icon: "Zap",
              color: "yellow",
            },
            {
              id: "inventory",
              label: "Inventory",
              icon: "Backpack",
              color: "purple",
            },
            {
              id: "achievements",
              label: "Achievements",
              icon: "Trophy",
              color: "amber",
            },
            { id: "quests", label: "Quests", icon: "Scroll", color: "green" },
            {
              id: "relationships",
              label: "Relationships",
              icon: "Users",
              color: "pink",
            },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id as StatsTab)}
              className={`px-2.5 sm:px-3 py-1.5 font-semibold rounded-t-lg transition-colors whitespace-nowrap flex items-center gap-1.5 text-sm ${
                activeTab === tab.id
                  ? `bg-${tab.color}-600 text-white`
                  : "bg-gray-100 dark:bg-gray-900 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
              }`}
            >
              <DynamicIcon name={tab.icon} className="w-4 h-4" />
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="p-4 sm:p-6">
          {/* Stats Tab */}
          {activeTab === "stats" && (
            <div>
              <h3 className="text-lg sm:text-xl font-bold mb-3 flex items-center gap-2 text-gray-900 dark:text-white">
                <DynamicIcon
                  name="BarChart2"
                  className="w-5 h-5 sm:w-6 sm:h-6 text-blue-600 dark:text-blue-400"
                />
                Stats
              </h3>
              <div className="space-y-2">
                {storyData.stats.map((stat, index) => {
                  // Use 100 as the max scale for stats (can go beyond but bar caps at 50% each direction)
                  // This means +50 fills 25% of total bar (half of the positive side)
                  const maxScale = 100;
                  const fillPercent =
                    Math.min(Math.abs(stat.value) / maxScale, 1) * 50;

                  // Get RPG system specific modifier
                  const system = getRPGSystem(storyData.rpgSystem || "3d6");
                  const modifier = system.statToModifier(stat.value);

                  // Format modifier display based on system type
                  const getModifierDisplay = () => {
                    if (system.noDice) {
                      return null; // Narrative system - no modifiers
                    }
                    if (system.hasExplodingDice && system.statToDieSize) {
                      const dieSize = system.statToDieSize(stat.value);
                      return `d${dieSize}`;
                    }
                    if (system.hasStressDice) {
                      const dicePool = Math.floor(stat.value / 20);
                      return `${dicePool}d6`;
                    }
                    if (system.getLadderName) {
                      const ladderName = system.getLadderName(modifier);
                      return `${
                        modifier >= 0 ? "+" : ""
                      }${modifier} (${ladderName})`;
                    }
                    if (system.rollUnder) {
                      return `${stat.value}%`; // Roll-under shows target percentage
                    }
                    // Standard modifier systems
                    return `${modifier >= 0 ? "+" : ""}${modifier}`;
                  };

                  const modifierDisplay = getModifierDisplay();

                  return (
                    <div
                      key={index}
                      className="flex flex-row items-center gap-3 p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800"
                    >
                      <div className="shrink-0">
                        <DynamicIcon
                          name={stat.symbol}
                          className="w-7 h-7 sm:w-8 sm:h-8 text-blue-600 dark:text-blue-400"
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-row items-baseline justify-between mb-1 gap-2">
                          <span className="font-bold text-sm text-gray-900 dark:text-white">
                            {stat.name}
                          </span>
                          <div className="flex items-baseline gap-2 shrink-0">
                            {modifierDisplay && (
                              <span className="text-xs font-medium px-1.5 py-0.5 rounded bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300">
                                {modifierDisplay}
                              </span>
                            )}
                            <span
                              className={`font-bold text-base ${
                                stat.value > 0
                                  ? "text-green-600 dark:text-green-400"
                                  : stat.value < 0
                                  ? "text-red-600 dark:text-red-400"
                                  : "text-gray-600 dark:text-gray-400"
                              }`}
                            >
                              {stat.value >= 0 ? "+" : ""}
                              {stat.value}
                            </span>
                          </div>
                        </div>
                        <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">
                          {stat.description}
                        </p>
                        {/* Stat bar visualization - fills from center */}
                        <div className="w-full bg-gray-200 dark:bg-gray-900 rounded-full h-2 relative overflow-hidden">
                          {/* Center marker */}
                          <div className="absolute left-1/2 top-0 w-0.5 h-full bg-gray-400 dark:bg-gray-600 -translate-x-1/2 z-10" />
                          {/* Stat fill - positioned from center */}
                          {stat.value !== 0 && (
                            <div
                              className={`absolute top-0 h-full rounded-full transition-all duration-300 ${
                                stat.value >= 0
                                  ? "bg-linear-to-r from-blue-400 to-blue-500"
                                  : "bg-linear-to-l from-red-400 to-red-500"
                              }`}
                              style={{
                                width: `${fillPercent}%`,
                                left:
                                  stat.value >= 0
                                    ? "50%"
                                    : `${50 - fillPercent}%`,
                              }}
                            />
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Resources Tab */}
          {activeTab === "resources" && (
            <div>
              <h3 className="text-lg sm:text-xl font-bold mb-3 flex items-center gap-2 text-gray-900 dark:text-white">
                <DynamicIcon
                  name="Zap"
                  className="w-5 h-5 sm:w-6 sm:h-6 text-yellow-600 dark:text-yellow-400"
                />
                Resources
              </h3>
              <div className="space-y-2">
                {/* Momentum - Special Resource */}
                <div className="flex flex-row items-center gap-3 p-3 rounded-lg bg-yellow-50 dark:bg-yellow-900/20 border-2 border-yellow-400 dark:border-yellow-600 shadow-md">
                  <div className="shrink-0">
                    <DynamicIcon
                      name="Zap"
                      className="w-7 h-7 sm:w-8 sm:h-8 text-yellow-600 dark:text-yellow-400"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-row items-baseline justify-between mb-1">
                      <span className="font-bold text-sm text-gray-900 dark:text-white">
                        Momentum
                      </span>
                      <span className="font-bold text-base text-yellow-600 dark:text-yellow-400">
                        {storyData.momentum}/{storyData.maxMomentum}
                      </span>
                    </div>
                    <p className="text-xs text-gray-600 dark:text-gray-400 mb-1.5">
                      Earn momentum on critical successes and strong rolls.
                      Spend to reroll (1⚡) or guarantee success (2⚡).
                    </p>
                    {/* Momentum dots display */}
                    <div className="flex gap-1 mb-1.5 overflow-hidden">
                      {Array.from({ length: storyData.maxMomentum }).map(
                        (_, i) => (
                          <div
                            key={i}
                            className={`w-3.5 h-3.5 rounded-full border-2 transition-all ${
                              i < storyData.momentum
                                ? "bg-yellow-400 dark:bg-yellow-500 border-yellow-500 dark:border-yellow-400 shadow-sm"
                                : "bg-transparent border-gray-300 dark:border-gray-600"
                            }`}
                          />
                        )
                      )}
                    </div>
                    {/* Progress bar */}
                    <div className="w-full bg-gray-200 dark:bg-gray-900 rounded-full h-2">
                      <div
                        className="bg-linear-to-r from-yellow-400 to-yellow-500 h-2 rounded-full transition-all duration-300 shadow-sm"
                        style={{
                          width: `${
                            (storyData.momentum / storyData.maxMomentum) *
                              100 <=
                            100
                              ? (storyData.momentum / storyData.maxMomentum) *
                                100
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
                    className="flex flex-row items-center gap-3 p-3 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800"
                  >
                    <div className="shrink-0">
                      <DynamicIcon
                        name={resource.symbol}
                        className="w-7 h-7 sm:w-8 sm:h-8 text-green-600 dark:text-green-400"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-row items-baseline justify-between mb-1">
                        <span className="font-bold text-sm text-gray-900 dark:text-white">
                          {resource.name}
                        </span>
                        <span className="font-bold text-base text-green-600 dark:text-green-400">
                          {resource.value}/{resource.maxValue}
                        </span>
                      </div>
                      <p className="text-xs text-gray-600 dark:text-gray-400 mb-1.5">
                        {resource.description}
                      </p>
                      {/* Progress bar */}
                      <div className="w-full bg-gray-200 dark:bg-gray-900 rounded-full h-2">
                        <div
                          className={`h-2 rounded-full transition-all duration-300 shadow-sm ${
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
          )}

          {/* Inventory Tab */}
          {activeTab === "inventory" && (
            <div>
              <h3 className="text-lg sm:text-xl font-bold mb-3 flex items-center gap-2 text-gray-900 dark:text-white">
                <DynamicIcon
                  name="Backpack"
                  className="w-5 h-5 sm:w-6 sm:h-6 text-purple-600 dark:text-purple-400"
                />
                Inventory
              </h3>
              {storyData.inventory.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {storyData.inventory.map((item, index) => (
                    <div
                      key={index}
                      className="flex flex-row items-center gap-2.5 p-3 rounded-lg bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800"
                    >
                      <div className="shrink-0">
                        <DynamicIcon
                          name={item.symbol}
                          className="w-7 h-7 text-purple-600 dark:text-purple-400"
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-row items-baseline justify-between">
                          <span className="font-bold text-sm text-gray-900 dark:text-white truncate">
                            {item.name}
                          </span>
                          <span className="font-bold text-sm text-purple-600 dark:text-purple-400 ml-2">
                            ×{item.quantity}
                          </span>
                        </div>
                        {item.description && (
                          <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-1 mt-0.5">
                            {item.description}
                          </p>
                        )}
                        {item.type && (
                          <span className="inline-block mt-1 px-1.5 py-0.5 text-xs rounded-full bg-purple-200 dark:bg-purple-800 text-purple-800 dark:text-purple-200 font-medium">
                            {item.type}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-6 text-center rounded-lg bg-gray-50 dark:bg-gray-900/30 border-2 border-dashed border-gray-300 dark:border-gray-600">
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Your inventory is empty
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Achievements Tab */}
          {activeTab === "achievements" && (
            <div>
              <h3 className="text-lg sm:text-xl font-bold mb-3 flex items-center gap-2 text-gray-900 dark:text-white">
                <DynamicIcon
                  name="Trophy"
                  className="w-5 h-5 sm:w-6 sm:h-6 text-yellow-600 dark:text-yellow-400"
                />
                Achievements
                {storyData.achievements.filter(
                  (a) => a.hidden && !a.dateAchieved
                ).length > 0 && (
                  <span className="px-2 py-0.5 bg-purple-200 dark:bg-purple-800/50 text-purple-800 dark:text-purple-200 rounded-full text-xs font-bold ml-2">
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
                <div className="space-y-2">
                  {storyData.achievements
                    .filter((a) => !a.hidden || a.dateAchieved)
                    .sort((a, b) => {
                      // Sort by achieved status first (achieved first)
                      if (a.dateAchieved && !b.dateAchieved) return -1;
                      if (!a.dateAchieved && b.dateAchieved) return 1;
                      // If both achieved or both not achieved, maintain original order
                      return 0;
                    })
                    .map((achievement, index) => (
                      <div
                        key={index}
                        className={`flex flex-row items-center gap-2.5 p-3 rounded-lg border-2 transition-all ${
                          achievement.dateAchieved
                            ? "bg-yellow-50 dark:bg-yellow-900/20 border-yellow-400 dark:border-yellow-600 shadow-sm"
                            : "bg-gray-50 dark:bg-gray-900/30 border-gray-300 dark:border-gray-600 opacity-60"
                        }`}
                      >
                        <div className="shrink-0">
                          <DynamicIcon
                            name={achievement.symbol}
                            className="w-7 h-7 text-yellow-600 dark:text-yellow-400"
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-row items-baseline justify-between">
                            <span className="font-bold text-sm text-gray-900 dark:text-white">
                              {achievement.title}
                            </span>
                            <span className="font-bold text-xs text-yellow-600 dark:text-yellow-400 ml-2">
                              {achievement.points} pts
                            </span>
                          </div>
                          {achievement.description && (
                            <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">
                              {achievement.description}
                            </p>
                          )}
                          {achievement.dateAchieved && (
                            <p className="text-xs text-gray-500 dark:text-gray-500 mt-0.5">
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
                <div className="p-6 text-center rounded-lg bg-gray-50 dark:bg-gray-900/30 border-2 border-dashed border-gray-300 dark:border-gray-600">
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    No achievements yet
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Quests Tab */}
          {activeTab === "quests" &&
            storyData.quests &&
            storyData.quests.length > 0 && (
              <div>
                <h3 className="text-lg sm:text-xl font-bold mb-3 flex items-center gap-2 text-gray-900 dark:text-white">
                  <DynamicIcon
                    name="Scroll"
                    className="w-5 h-5 sm:w-6 sm:h-6 text-blue-600 dark:text-blue-400"
                  />
                  Quests
                </h3>
                {storyData.quests.filter((q) => q.active).length > 0 ? (
                  <div className="space-y-2">
                    {storyData.quests
                      .filter((q) => q.active)
                      .map((quest, index) => (
                        <div
                          key={index}
                          className={`flex flex-col gap-1.5 p-3 rounded-lg border-2 transition-all ${
                            quest.fulfilled
                              ? "bg-green-50 dark:bg-green-900/20 border-green-400 dark:border-green-600 shadow-sm"
                              : "bg-blue-50 dark:bg-blue-900/20 border-blue-400 dark:border-blue-600"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-sm text-gray-900 dark:text-white">
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
                              <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">
                                {quest.shortDescription}
                              </p>
                              {quest.description !== quest.shortDescription && (
                                <p className="text-xs text-gray-500 dark:text-gray-500 italic mt-0.5">
                                  {quest.description}
                                </p>
                              )}
                            </div>
                            <span className="font-bold text-xs text-blue-600 dark:text-blue-400 shrink-0">
                              {quest.points} pts
                            </span>
                          </div>
                        </div>
                      ))}
                  </div>
                ) : (
                  <div className="p-6 text-center rounded-lg bg-gray-50 dark:bg-gray-900/30 border-2 border-dashed border-gray-300 dark:border-gray-600">
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      No active quests
                    </p>
                  </div>
                )}
              </div>
            )}

          {/* Relationships Tab */}
          {activeTab === "relationships" &&
            storyData.relationships &&
            storyData.relationships.length > 0 && (
              <div>
                <h3 className="text-lg sm:text-xl font-bold mb-3 flex items-center gap-2 text-gray-900 dark:text-white">
                  <DynamicIcon
                    name="Users"
                    className="w-5 h-5 sm:w-6 sm:h-6 text-pink-600 dark:text-pink-400"
                  />
                  Relationships
                </h3>
                <div className="space-y-2">
                  {storyData.relationships.map((rel, index) => (
                    <div
                      key={index}
                      className="flex flex-row items-start gap-2.5 p-3 rounded-lg bg-pink-50 dark:bg-pink-900/20 border border-pink-200 dark:border-pink-800"
                    >
                      <div className="shrink-0">
                        <DynamicIcon name={rel.symbol} className="w-7 h-7" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-row items-center justify-between mb-1 gap-2">
                          <span className="font-bold text-sm text-gray-900 dark:text-white">
                            {rel.name}
                          </span>
                          <span
                            className={`font-bold text-base px-1.5 py-0.5 rounded-full shrink-0 ${
                              rel.value >= 50
                                ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300"
                                : rel.value >= 0
                                ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
                                : rel.value >= -50
                                ? "bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300"
                                : "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300"
                            }`}
                          >
                            {rel.value > 0 ? "+" : ""}
                            {rel.value}
                          </span>
                        </div>
                        <p className="text-xs text-gray-600 dark:text-gray-400">
                          {rel.description}
                        </p>
                        {/* Relationship bar - fills from center, -100 to +100 range */}
                        <div className="w-full bg-gray-200 dark:bg-gray-900 rounded-full h-2 mt-2 relative overflow-hidden">
                          {/* Center line indicator */}
                          <div className="absolute left-1/2 top-0 w-0.5 h-full bg-gray-400 dark:bg-gray-500 -translate-x-1/2 z-10" />
                          {/* Fill bar */}
                          {rel.value !== 0 && (
                            <div
                              className={`absolute top-0 h-full rounded-full transition-all duration-300 ${
                                rel.value >= 0
                                  ? "bg-linear-to-r from-blue-500 to-green-500"
                                  : "bg-linear-to-l from-orange-500 to-red-500"
                              }`}
                              style={{
                                width: `${
                                  Math.min(Math.abs(rel.value), 100) / 2
                                }%`,
                                left:
                                  rel.value >= 0
                                    ? "50%"
                                    : `${
                                        50 -
                                        Math.min(Math.abs(rel.value), 100) / 2
                                      }%`,
                              }}
                            />
                          )}
                        </div>
                        <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                          <span>Hostile</span>
                          <span>Neutral</span>
                          <span>Allied</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
        </div>
      </div>
    </div>
  );
}
