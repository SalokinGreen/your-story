"use client";

import {
  StoryData,
  UPGRADE_COSTS,
  Condition,
  Variable,
  NumberVariable,
  BooleanVariable,
  ListVariable,
  Ability,
} from "../misc/structs";
import { DynamicIcon } from "../components/DynamicIcon";
import { useState } from "react";
import { getRPGSystem } from "../misc/rpgSystems";
import { GRADE_CONFIG, getMaxDurability, ItemGrade } from "../misc/itemSystem";
import {
  getXPProgress,
  getAvailableUpgrades,
  formatXP,
} from "../misc/leveling";
import {
  ABILITY_GRADE_CONFIG,
  formatAbilityCost,
  formatCooldown,
  getAbilityBonus,
} from "../misc/abilitySystem";
import {
  getStatBonusFromNodes,
  getResourceBonusFromNodes,
  getActivePassives,
} from "../misc/skillTree";

type StatsTab =
  | "stats"
  | "resources"
  | "inventory"
  | "abilities"
  | "achievements"
  | "quests"
  | "relationships"
  | "variables";

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
      <div className="bg-blue-950/50 rounded-xl border border-blue-800/30">
        {/* Player Info Section - Always Visible */}
        <div className="p-4 border-b border-blue-800/30">
          <div className="flex flex-col gap-3">
            <div>
              <h2 className="text-lg font-bold mb-1 text-white">
                {storyData.player_name}
              </h2>
              <p className="text-sm text-blue-200/60">
                {storyData.player_summary}
              </p>
            </div>

            {/* Level & XP Display */}
            <div className="p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/30">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-10 h-10 rounded-full bg-yellow-500/20 border-2 border-yellow-400 flex items-center justify-center">
                    <span className="text-lg font-bold text-yellow-400">
                      {storyData.level || 1}
                    </span>
                  </div>
                  <div>
                    <span className="font-medium text-sm text-white">
                      Level {storyData.level || 1}
                    </span>
                    <p className="text-xs text-blue-200/40">
                      {formatXP(storyData.points || 0)} XP total
                    </p>
                  </div>
                </div>
                {(() => {
                  const available = getAvailableUpgrades(
                    storyData.level || 1,
                    storyData.upgradesSpent || 0,
                    storyData.difficulty
                  );
                  return available > 0 ? (
                    <div className="px-2 py-1 rounded-lg bg-green-500/20 border border-green-400/50">
                      <span className="text-sm font-bold text-green-400">
                        {available} ↑
                      </span>
                    </div>
                  ) : null;
                })()}
              </div>

              {/* XP Progress Bar */}
              {(() => {
                const progress = getXPProgress(storyData.points || 0);
                return (
                  <div className="space-y-1">
                    <div className="h-2 bg-yellow-950/50 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-linear-to-r from-yellow-500 to-amber-400 rounded-full transition-all duration-500"
                        style={{ width: `${progress.percentage}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-xs text-yellow-300/50">
                      <span>
                        {formatXP(progress.xpIntoLevel)}/
                        {formatXP(progress.xpNeededForNext)} XP
                      </span>
                      <span>Level {progress.currentLevel + 1}</span>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex gap-1 px-3 pt-2 pb-1 border-b border-blue-800/30 overflow-x-auto scrollbar-hide">
          {[
            { id: "stats", label: "Stats", icon: "BarChart2" },
            { id: "resources", label: "Resources", icon: "Zap" },
            { id: "inventory", label: "Items", icon: "Backpack" },
            ...(storyData.abilities && storyData.abilities.length > 0
              ? [{ id: "abilities", label: "Abilities", icon: "Sparkles" }]
              : []),
            { id: "achievements", label: "Badges", icon: "Trophy" },
            { id: "quests", label: "Quests", icon: "Scroll" },
            { id: "relationships", label: "NPCs", icon: "Users" },
            ...(storyData.variables && storyData.variables.length > 0
              ? [{ id: "variables", label: "Variables", icon: "Variable" }]
              : []),
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id as StatsTab)}
              className={`px-2 py-1.5 font-medium rounded-lg transition-colors whitespace-nowrap flex items-center gap-1.5 text-xs ${
                activeTab === tab.id
                  ? "bg-blue-600 text-white"
                  : "text-blue-200/60 hover:bg-blue-900/50 hover:text-white"
              }`}
            >
              <DynamicIcon name={tab.icon} className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="p-4">
          {/* Stats Tab */}
          {activeTab === "stats" && (
            <div>
              <h3 className="text-base font-semibold mb-3 flex items-center gap-2 text-white">
                <DynamicIcon
                  name="BarChart2"
                  className="w-5 h-5 text-blue-400"
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

                  // Calculate skill tree bonus for this stat
                  const nodeBonus = getStatBonusFromNodes(storyData, stat.name);
                  const baseValue = stat.value - nodeBonus;

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
                      className="flex flex-row items-center gap-3 p-3 rounded-lg bg-blue-500/10 border border-blue-500/30"
                    >
                      <div className="shrink-0">
                        <DynamicIcon
                          name={stat.symbol}
                          className="w-6 h-6 text-blue-400"
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-row items-baseline justify-between mb-1 gap-2">
                          <span className="font-medium text-sm text-white">
                            {stat.name}
                          </span>
                          <div className="flex items-baseline gap-2 shrink-0">
                            {modifierDisplay && (
                              <span className="text-xs font-medium px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300">
                                {modifierDisplay}
                              </span>
                            )}
                            {/* Show bonus breakdown if there's a node bonus */}
                            {nodeBonus !== 0 ? (
                              <div className="flex items-baseline gap-1">
                                <span className="text-xs text-blue-200/40">
                                  {baseValue >= 0 ? "+" : ""}
                                  {baseValue}
                                </span>
                                <span
                                  className="text-xs font-medium px-1 py-0.5 rounded bg-emerald-500/20 text-emerald-400"
                                  title="From skill tree"
                                >
                                  +{nodeBonus}
                                </span>
                                <span className="text-xs text-blue-200/40">
                                  =
                                </span>
                                <span
                                  className={`font-bold text-sm ${
                                    stat.value > 0
                                      ? "text-green-400"
                                      : stat.value < 0
                                      ? "text-red-400"
                                      : "text-blue-200/60"
                                  }`}
                                >
                                  {stat.value >= 0 ? "+" : ""}
                                  {stat.value}
                                </span>
                              </div>
                            ) : (
                              <span
                                className={`font-bold text-sm ${
                                  stat.value > 0
                                    ? "text-green-400"
                                    : stat.value < 0
                                    ? "text-red-400"
                                    : "text-blue-200/60"
                                }`}
                              >
                                {stat.value >= 0 ? "+" : ""}
                                {stat.value}
                              </span>
                            )}
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

              {/* Conditions Section - within Stats tab */}
              {storyData.conditions && storyData.conditions.length > 0 && (
                <div className="mt-6">
                  <h3 className="text-base font-semibold mb-3 flex items-center gap-2 text-white">
                    <DynamicIcon
                      name="AlertTriangle"
                      className="w-5 h-5 text-red-400"
                    />
                    Active Conditions
                  </h3>
                  <div className="space-y-2">
                    {storyData.conditions.map((condition: Condition) => {
                      const tierLabels = ["I", "II", "III", "IV", "V", "VI"];
                      const tierColors = [
                        "bg-yellow-500/10 border-yellow-500/30 text-yellow-400",
                        "bg-orange-500/10 border-orange-500/30 text-orange-400",
                        "bg-red-500/10 border-red-500/30 text-red-400",
                        "bg-red-600/10 border-red-600/30 text-red-500",
                        "bg-purple-500/10 border-purple-500/30 text-purple-400",
                        "bg-gray-500/10 border-gray-500/30 text-gray-400",
                      ];
                      const tierIndex = Math.min(
                        Math.max(condition.tier - 1, 0),
                        5
                      );
                      const colorClass = tierColors[tierIndex];

                      return (
                        <div
                          key={condition.id}
                          className={`flex flex-row items-start gap-3 p-3 rounded-lg border ${colorClass
                            .split(" ")
                            .slice(0, 2)
                            .join(" ")}`}
                        >
                          <div className="shrink-0">
                            <DynamicIcon
                              name={
                                condition.tier >= 5
                                  ? "Skull"
                                  : condition.tier >= 3
                                  ? "HeartCrack"
                                  : "Activity"
                              }
                              className={`w-6 h-6 ${colorClass.split(" ")[2]}`}
                            />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex flex-row items-center justify-between mb-1 gap-2">
                              <span className="font-medium text-sm text-white">
                                {condition.name}
                              </span>
                              <span
                                className={`font-bold text-xs px-1.5 py-0.5 rounded ${colorClass
                                  .split(" ")
                                  .slice(0, 2)
                                  .join(" ")} ${colorClass.split(" ")[2]}`}
                              >
                                Tier {tierLabels[tierIndex]}
                                {condition.permanent && " (Permanent)"}
                              </span>
                            </div>
                            <p className="text-xs text-blue-200/60">
                              {condition.description}
                            </p>
                            {/* Affected stats */}
                            {condition.affectsAll ? (
                              <p className="text-xs text-red-400/70 mt-1">
                                ⚠️ Affects all skill checks
                              </p>
                            ) : condition.affects &&
                              condition.affects.length > 0 ? (
                              <p className="text-xs text-orange-400/70 mt-1">
                                Affects: {condition.affects.join(", ")}
                              </p>
                            ) : null}
                            {condition.source && (
                              <p className="text-xs text-blue-200/40 mt-1 italic">
                                Source: {condition.source}
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Skill Tree Passives Section */}
              {(() => {
                const passives = getActivePassives(storyData);
                return passives.length > 0 ? (
                  <div className="mt-6">
                    <h3 className="text-base font-semibold mb-3 flex items-center gap-2 text-white">
                      <DynamicIcon
                        name="Sparkles"
                        className="w-5 h-5 text-emerald-400"
                      />
                      Skill Tree Passives
                    </h3>
                    <div className="space-y-2">
                      {passives.map((passive, index) => (
                        <div
                          key={index}
                          className="flex flex-row items-start gap-3 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30"
                        >
                          <div className="shrink-0">
                            <DynamicIcon
                              name="Shield"
                              className="w-5 h-5 text-emerald-400"
                            />
                          </div>
                          <div className="flex-1 min-w-0">
                            <span className="font-medium text-sm text-white">
                              {passive.name}
                            </span>
                            <p className="text-xs text-blue-200/60 mt-0.5">
                              {passive.description}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null;
              })()}
            </div>
          )}

          {/* Resources Tab */}
          {activeTab === "resources" && (
            <div>
              <h3 className="text-base font-semibold mb-3 flex items-center gap-2 text-white">
                <DynamicIcon name="Zap" className="w-5 h-5 text-yellow-400" />
                Resources
              </h3>
              <div className="space-y-2">
                {/* Momentum - Special Resource */}
                <div className="flex flex-row items-center gap-3 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/30">
                  <div className="shrink-0">
                    <DynamicIcon
                      name="Zap"
                      className="w-6 h-6 text-yellow-400"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-row items-baseline justify-between mb-1">
                      <span className="font-medium text-sm text-white">
                        Momentum
                      </span>
                      <span className="font-bold text-sm text-yellow-400">
                        {storyData.momentum}/{storyData.maxMomentum}
                      </span>
                    </div>
                    <p className="text-xs text-blue-200/40 mb-1.5">
                      Spend for advantage (1⚡) or guarantee success (3⚡).
                    </p>
                    {/* Momentum dots display */}
                    <div className="flex gap-1 mb-1.5 overflow-hidden">
                      {Array.from({ length: storyData.maxMomentum }).map(
                        (_, i) => (
                          <div
                            key={i}
                            className={`w-3 h-3 rounded-full border transition-all ${
                              i < storyData.momentum
                                ? "bg-yellow-400 border-yellow-500"
                                : "bg-transparent border-blue-700"
                            }`}
                          />
                        )
                      )}
                    </div>
                    {/* Progress bar */}
                    <div className="w-full bg-blue-900/50 rounded-full h-1.5">
                      <div
                        className="bg-linear-to-r from-yellow-400 to-yellow-500 h-1.5 rounded-full transition-all duration-300"
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
                {storyData.resources.map((resource, index) => {
                  // Calculate skill tree bonus for this resource
                  const nodeBonus = getResourceBonusFromNodes(
                    storyData,
                    resource.name
                  );
                  const baseMax = resource.maxValue - nodeBonus;

                  return (
                    <div
                      key={index}
                      className="flex flex-row items-center gap-3 p-3 rounded-lg bg-green-500/10 border border-green-500/30"
                    >
                      <div className="shrink-0">
                        <DynamicIcon
                          name={resource.symbol}
                          className="w-6 h-6 text-green-400"
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-row items-baseline justify-between mb-1">
                          <span className="font-medium text-sm text-white">
                            {resource.name}
                          </span>
                          {/* Show bonus breakdown if there's a node bonus */}
                          {nodeBonus !== 0 ? (
                            <div className="flex items-baseline gap-1">
                              <span className="font-bold text-sm text-green-400">
                                {resource.value}/
                              </span>
                              <span className="text-xs text-blue-200/40">
                                {baseMax}
                              </span>
                              <span
                                className="text-xs font-medium px-1 py-0.5 rounded bg-emerald-500/20 text-emerald-400"
                                title="Max bonus from skill tree"
                              >
                                +{nodeBonus}
                              </span>
                            </div>
                          ) : (
                            <span className="font-bold text-sm text-green-400">
                              {resource.value}/{resource.maxValue}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-blue-200/40 mb-1.5">
                          {resource.description}
                        </p>
                        {/* Progress bar */}
                        <div className="w-full bg-blue-900/50 rounded-full h-1.5">
                          <div
                            className={`h-1.5 rounded-full transition-all duration-300 ${
                              resource.value / resource.maxValue > 0.5
                                ? "bg-linear-to-r from-green-500 to-green-600"
                                : resource.value / resource.maxValue > 0.25
                                ? "bg-linear-to-r from-yellow-500 to-yellow-600"
                                : "bg-linear-to-r from-red-500 to-red-600"
                            }`}
                            style={{
                              width: `${
                                (resource.value / resource.maxValue) * 100 <=
                                100
                                  ? (resource.value / resource.maxValue) * 100
                                  : 100
                              }%`,
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Inventory Tab */}
          {activeTab === "inventory" && (
            <div>
              <h3 className="text-base font-semibold mb-3 flex items-center gap-2 text-white">
                <DynamicIcon
                  name="Backpack"
                  className="w-5 h-5 text-purple-400"
                />
                Inventory
              </h3>
              {storyData.inventory.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {storyData.inventory.map((item, index) => {
                    const grade = (item.grade || "common") as ItemGrade;
                    const gradeConfig =
                      GRADE_CONFIG[grade] || GRADE_CONFIG.common;
                    const maxDurability =
                      item.maxDurability || getMaxDurability(grade);
                    const durability = item.durability ?? maxDurability;
                    const durabilityPercent =
                      grade === "agmt"
                        ? 100
                        : Math.round((durability / maxDurability) * 100);
                    const isLowDurability =
                      durabilityPercent <= 33 && grade !== "agmt";

                    return (
                      <div
                        key={index}
                        className="flex flex-row items-center gap-2.5 p-3 rounded-lg border"
                        style={{
                          backgroundColor: `${gradeConfig.color}10`,
                          borderColor: `${gradeConfig.color}40`,
                        }}
                      >
                        <div className="shrink-0">
                          <DynamicIcon
                            name={item.symbol}
                            className="w-6 h-6"
                            style={{ color: gradeConfig.color }}
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-row items-baseline justify-between">
                            <span className="font-medium text-sm text-white truncate">
                              {item.name}
                            </span>
                            <span
                              className="font-bold text-sm ml-2"
                              style={{ color: gradeConfig.color }}
                            >
                              ×{item.quantity}
                            </span>
                          </div>
                          {item.description && (
                            <p className="text-xs text-blue-200/40 mt-0.5">
                              {item.description}
                            </p>
                          )}
                          <div className="flex flex-wrap items-center gap-1.5 mt-1">
                            {/* Grade badge */}
                            <span
                              className="inline-block px-1.5 py-0.5 text-xs rounded font-medium"
                              style={{
                                backgroundColor: `${gradeConfig.color}30`,
                                color: gradeConfig.color,
                              }}
                            >
                              {gradeConfig.label}
                            </span>
                            {/* Type badge */}
                            {item.type && (
                              <span className="inline-block px-1.5 py-0.5 text-xs rounded bg-purple-500/20 text-purple-300 font-medium">
                                {item.type}
                              </span>
                            )}
                          </div>
                          {/* Durability bar */}
                          {item.type !== "consumable" && (
                            <div className="mt-1.5">
                              <div className="flex items-center justify-between text-xs mb-0.5">
                                <span className="text-blue-200/40">
                                  Durability
                                </span>
                                <span
                                  className={
                                    isLowDurability
                                      ? "text-red-400"
                                      : "text-blue-200/60"
                                  }
                                >
                                  {grade === "agmt"
                                    ? "∞"
                                    : `${durability}/${maxDurability}`}
                                </span>
                              </div>
                              {grade !== "agmt" && (
                                <div className="h-1.5 bg-blue-900/50 rounded-full overflow-hidden">
                                  <div
                                    className="h-full rounded-full transition-all"
                                    style={{
                                      width: `${durabilityPercent}%`,
                                      backgroundColor: isLowDurability
                                        ? "#ef4444"
                                        : gradeConfig.color,
                                    }}
                                  />
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="p-4 text-center rounded-lg bg-blue-900/30 border border-blue-800/30">
                  <p className="text-sm text-blue-200/40">
                    Your inventory is empty
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Abilities Tab */}
          {activeTab === "abilities" && (
            <div>
              <h3 className="text-base font-semibold mb-3 flex items-center gap-2 text-white">
                <DynamicIcon
                  name="Sparkles"
                  className="w-5 h-5 text-purple-400"
                />
                Abilities
              </h3>
              {storyData.abilities && storyData.abilities.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {storyData.abilities.map((ability, index) => {
                    const gradeConfig =
                      ABILITY_GRADE_CONFIG[ability.grade || "novice"] ||
                      ABILITY_GRADE_CONFIG.novice;
                    const isOnCooldown = (ability.currentCooldown ?? 0) > 0;
                    const cooldownPercent =
                      ability.cooldown && ability.cooldown > 0
                        ? Math.round(
                            ((ability.currentCooldown ?? 0) /
                              ability.cooldown) *
                              100
                          )
                        : 0;
                    const rpgSystem = getRPGSystem(
                      storyData.rpgSystem || "3d6"
                    );
                    const bonus = getAbilityBonus(ability, rpgSystem.id);

                    return (
                      <div
                        key={index}
                        className={`flex flex-row items-start gap-2.5 p-3 rounded-lg border transition-opacity ${
                          isOnCooldown ? "opacity-60" : ""
                        }`}
                        style={{
                          backgroundColor: `${gradeConfig.color}10`,
                          borderColor: `${gradeConfig.color}40`,
                        }}
                      >
                        <div className="shrink-0">
                          <DynamicIcon
                            name={ability.symbol || "Sparkles"}
                            className="w-6 h-6"
                            style={{ color: gradeConfig.color }}
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-row items-baseline justify-between">
                            <span className="font-medium text-sm text-white truncate">
                              {ability.name}
                            </span>
                            {bonus > 0 && (
                              <span
                                className="font-bold text-sm ml-2"
                                style={{ color: gradeConfig.color }}
                              >
                                +{bonus}
                              </span>
                            )}
                          </div>
                          {ability.description && (
                            <p className="text-xs text-blue-200/40 mt-0.5">
                              {ability.description}
                            </p>
                          )}
                          <div className="flex flex-wrap items-center gap-1.5 mt-1">
                            {/* Grade badge */}
                            <span
                              className="inline-block px-1.5 py-0.5 text-xs rounded font-medium"
                              style={{
                                backgroundColor: `${gradeConfig.color}30`,
                                color: gradeConfig.color,
                              }}
                            >
                              {gradeConfig.label}
                            </span>
                            {/* Stat association badge */}
                            {ability.stat && (
                              <span className="inline-block px-1.5 py-0.5 text-xs rounded bg-blue-500/20 text-blue-300 font-medium">
                                {ability.stat}
                              </span>
                            )}
                            {/* Cost badge */}
                            {ability.cost && ability.cost.length > 0 && (
                              <span className="inline-block px-1.5 py-0.5 text-xs rounded bg-red-500/20 text-red-300 font-medium">
                                {formatAbilityCost(ability.cost)}
                              </span>
                            )}
                          </div>
                          {/* Cooldown bar */}
                          {ability.cooldown != null && ability.cooldown > 0 && (
                            <div className="mt-1.5">
                              <div className="flex items-center justify-between text-xs mb-0.5">
                                <span className="text-blue-200/40">
                                  Cooldown
                                </span>
                                <span
                                  className={
                                    isOnCooldown
                                      ? "text-orange-400"
                                      : "text-green-400"
                                  }
                                >
                                  {isOnCooldown
                                    ? `${ability.currentCooldown} turns`
                                    : "Ready"}
                                </span>
                              </div>
                              <div className="h-1.5 bg-blue-900/50 rounded-full overflow-hidden">
                                <div
                                  className="h-full rounded-full transition-all"
                                  style={{
                                    width: `${100 - cooldownPercent}%`,
                                    backgroundColor: isOnCooldown
                                      ? "#f97316"
                                      : "#22c55e",
                                  }}
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="p-4 text-center rounded-lg bg-blue-900/30 border border-blue-800/30">
                  <p className="text-sm text-blue-200/40">
                    You have no abilities yet
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Achievements Tab */}
          {activeTab === "achievements" && (
            <div>
              <h3 className="text-base font-semibold mb-3 flex items-center gap-2 text-white">
                <DynamicIcon name="Trophy" className="w-5 h-5 text-amber-400" />
                Achievements
                {storyData.achievements.filter(
                  (a) => a.hidden && !a.dateAchieved
                ).length > 0 && (
                  <span className="px-1.5 py-0.5 bg-purple-500/20 text-purple-300 rounded text-xs font-medium ml-2">
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
                        className={`flex flex-row items-center gap-2.5 p-3 rounded-lg border transition-all ${
                          achievement.dateAchieved
                            ? "bg-amber-500/10 border-amber-500/30"
                            : "bg-blue-900/30 border-blue-800/30 opacity-60"
                        }`}
                      >
                        <div className="shrink-0">
                          <DynamicIcon
                            name={achievement.symbol}
                            className="w-6 h-6 text-amber-400"
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-row items-baseline justify-between">
                            <span className="font-medium text-sm text-white">
                              {achievement.title}
                            </span>
                            <span className="font-bold text-xs text-amber-400 ml-2">
                              {achievement.points} pts
                            </span>
                          </div>
                          {achievement.description && (
                            <p className="text-xs text-blue-200/40 mt-0.5">
                              {achievement.description}
                            </p>
                          )}
                          {achievement.dateAchieved && (
                            <p className="text-xs text-amber-400/70 mt-0.5">
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
                <div className="p-4 text-center rounded-lg bg-blue-900/30 border border-blue-800/30">
                  <p className="text-sm text-blue-200/40">
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
                <h3 className="text-base font-semibold mb-3 flex items-center gap-2 text-white">
                  <DynamicIcon
                    name="Scroll"
                    className="w-5 h-5 text-blue-400"
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
                          className={`flex flex-col gap-1.5 p-3 rounded-lg border transition-all ${
                            quest.fulfilled
                              ? "bg-green-500/10 border-green-500/30"
                              : "bg-blue-500/10 border-blue-500/30"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-sm text-white">
                                  {quest.title}
                                </span>
                                {quest.fulfilled && (
                                  <span className="text-green-400 shrink-0">
                                    <DynamicIcon
                                      name="Check"
                                      className="w-4 h-4"
                                    />
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-blue-200/40 mt-0.5">
                                {quest.shortDescription}
                              </p>
                              {quest.description !== quest.shortDescription && (
                                <p className="text-xs text-blue-200/30 italic mt-0.5">
                                  {quest.description}
                                </p>
                              )}
                            </div>
                            <span className="font-bold text-xs text-blue-400 shrink-0">
                              {quest.points} pts
                            </span>
                          </div>
                        </div>
                      ))}
                  </div>
                ) : (
                  <div className="p-4 text-center rounded-lg bg-blue-900/30 border border-blue-800/30">
                    <p className="text-sm text-blue-200/40">No active quests</p>
                  </div>
                )}
              </div>
            )}

          {/* Relationships Tab */}
          {activeTab === "relationships" &&
            storyData.relationships &&
            storyData.relationships.length > 0 && (
              <div>
                <h3 className="text-base font-semibold mb-3 flex items-center gap-2 text-white">
                  <DynamicIcon name="Users" className="w-5 h-5 text-pink-400" />
                  Relationships
                </h3>
                <div className="space-y-2">
                  {storyData.relationships.map((rel, index) => (
                    <div
                      key={index}
                      className="flex flex-row items-start gap-2.5 p-3 rounded-lg bg-pink-500/10 border border-pink-500/30"
                    >
                      <div className="shrink-0">
                        <DynamicIcon
                          name={rel.symbol}
                          className="w-6 h-6 text-pink-400"
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-row items-center justify-between mb-1 gap-2">
                          <span className="font-medium text-sm text-white">
                            {rel.name}
                          </span>
                          <span
                            className={`font-bold text-sm px-1.5 py-0.5 rounded shrink-0 ${
                              rel.value >= 50
                                ? "bg-green-500/20 text-green-400"
                                : rel.value >= 0
                                ? "bg-blue-500/20 text-blue-400"
                                : rel.value >= -50
                                ? "bg-orange-500/20 text-orange-400"
                                : "bg-red-500/20 text-red-400"
                            }`}
                          >
                            {rel.value > 0 ? "+" : ""}
                            {rel.value}
                          </span>
                        </div>
                        <p className="text-xs text-blue-200/40">
                          {rel.description}
                        </p>
                        {/* Relationship bar - fills from center, -100 to +100 range */}
                        <div className="w-full bg-blue-900/50 rounded-full h-1.5 mt-2 relative overflow-hidden">
                          {/* Center line indicator */}
                          <div className="absolute left-1/2 top-0 w-0.5 h-full bg-blue-700 -translate-x-1/2 z-10" />
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
                        <div className="flex justify-between text-xs text-blue-200/30 mt-0.5">
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

          {/* Variables Tab */}
          {activeTab === "variables" &&
            storyData.variables &&
            storyData.variables.length > 0 && (
              <div>
                <h3 className="text-base font-semibold mb-3 flex items-center gap-2 text-white">
                  <DynamicIcon
                    name="Variable"
                    className="w-5 h-5 text-cyan-400"
                  />
                  Variables
                </h3>
                <div className="space-y-2">
                  {storyData.variables.map((variable) => {
                    const getIcon = () => {
                      switch (variable.type) {
                        case "number":
                          return "Hash";
                        case "boolean":
                          return "ToggleLeft";
                        case "list":
                          return "List";
                        default:
                          return "Variable";
                      }
                    };

                    const getColorClass = () => {
                      switch (variable.type) {
                        case "number":
                          return "bg-cyan-500/10 border-cyan-500/30 text-cyan-400";
                        case "boolean":
                          return "bg-emerald-500/10 border-emerald-500/30 text-emerald-400";
                        case "list":
                          return "bg-violet-500/10 border-violet-500/30 text-violet-400";
                        default:
                          return "bg-blue-500/10 border-blue-500/30 text-blue-400";
                      }
                    };

                    const colorParts = getColorClass().split(" ");

                    return (
                      <div
                        key={variable.id}
                        className={`flex flex-row items-start gap-3 p-3 rounded-lg border ${colorParts
                          .slice(0, 2)
                          .join(" ")}`}
                      >
                        <div className="shrink-0">
                          <DynamicIcon
                            name={getIcon()}
                            className={`w-6 h-6 ${colorParts[2]}`}
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-row items-center justify-between mb-1 gap-2">
                            <span className="font-medium text-sm text-white">
                              {variable.name}
                            </span>
                            {/* Value display */}
                            {variable.type === "number" && (
                              <span className="font-bold text-sm text-cyan-400">
                                {(variable as NumberVariable).value}
                              </span>
                            )}
                            {variable.type === "boolean" && (
                              <span
                                className={`font-bold text-xs px-2 py-0.5 rounded ${
                                  (variable as BooleanVariable).value
                                    ? "bg-emerald-500/20 text-emerald-400"
                                    : "bg-red-500/20 text-red-400"
                                }`}
                              >
                                {(variable as BooleanVariable).value
                                  ? "TRUE"
                                  : "FALSE"}
                              </span>
                            )}
                            {variable.type === "list" && (
                              <span className="font-bold text-xs text-violet-400">
                                {(variable as ListVariable).items.length} items
                                {(variable as ListVariable).maxSize &&
                                  ` / ${
                                    (variable as ListVariable).maxSize
                                  } max`}
                              </span>
                            )}
                          </div>
                          {variable.description && (
                            <p className="text-xs text-blue-200/60">
                              {variable.description}
                            </p>
                          )}
                          {/* Number range display */}
                          {variable.type === "number" &&
                            ((variable as NumberVariable).minValue !==
                              undefined ||
                              (variable as NumberVariable).maxValue !==
                                undefined) && (
                              <div className="mt-2">
                                {(variable as NumberVariable).minValue !==
                                  undefined &&
                                  (variable as NumberVariable).maxValue !==
                                    undefined && (
                                    <>
                                      <div className="flex justify-between text-xs text-blue-200/40 mb-1">
                                        <span>
                                          {
                                            (variable as NumberVariable)
                                              .minValue
                                          }
                                        </span>
                                        <span>
                                          {
                                            (variable as NumberVariable)
                                              .maxValue
                                          }
                                        </span>
                                      </div>
                                      <div className="w-full bg-blue-900/50 rounded-full h-1.5">
                                        <div
                                          className="bg-linear-to-r from-cyan-400 to-cyan-500 h-1.5 rounded-full transition-all duration-300"
                                          style={{
                                            width: `${Math.min(
                                              Math.max(
                                                (((variable as NumberVariable)
                                                  .value -
                                                  (variable as NumberVariable)
                                                    .minValue!) /
                                                  ((variable as NumberVariable)
                                                    .maxValue! -
                                                    (variable as NumberVariable)
                                                      .minValue!)) *
                                                  100,
                                                0
                                              ),
                                              100
                                            )}%`,
                                          }}
                                        />
                                      </div>
                                    </>
                                  )}
                              </div>
                            )}
                          {/* List items display */}
                          {variable.type === "list" &&
                            (variable as ListVariable).items.length > 0 && (
                              <div className="mt-2 flex flex-wrap gap-1">
                                {(variable as ListVariable).items.map(
                                  (item, index) => (
                                    <span
                                      key={index}
                                      className="px-2 py-0.5 text-xs rounded bg-violet-500/20 text-violet-300"
                                    >
                                      {item}
                                    </span>
                                  )
                                )}
                              </div>
                            )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
        </div>
      </div>
    </div>
  );
}
