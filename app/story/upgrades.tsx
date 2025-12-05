"use client";

import {
  StoryData,
  UPGRADE_COSTS,
  DEFAULT_UPGRADE_SETTINGS,
  ShopAbility,
} from "../misc/structs";
import { ABILITY_GRADE_CONFIG, getAbilityBonus } from "../misc/abilitySystem";
import { getSystemUpgradeDefaults } from "../misc/rpgSystems";
import {
  getXPProgress,
  getAvailableUpgrades,
  formatXP,
} from "../misc/leveling";
import {
  hasSkillTrees,
  unlockNode,
  respecTree,
  respecAllTrees,
  getTreeUnlockedCount,
} from "../misc/skillTree";
import { useState } from "react";
import { DynamicIcon } from "../components/DynamicIcon";
import SkillTreeView from "../components/SkillTreeView";

interface UpgradesPageProps {
  storyData: StoryData;
  onUpgrade: (callback: () => void) => void; // Changed from onPurchase - no cost, just callback
}

export default function UpgradesPage({
  storyData,
  onUpgrade,
}: UpgradesPageProps) {
  const [selectedStat, setSelectedStat] = useState<string>("");
  const [selectedResource, setSelectedResource] = useState<string>("");
  const [activeTreeId, setActiveTreeId] = useState<string | null>(
    storyData.skillTrees?.[0]?.id || null
  );
  const [showRespecConfirm, setShowRespecConfirm] = useState(false);

  // Use custom upgrade settings or fallback to defaults
  const upgradeSettings = storyData.upgradeSettings || DEFAULT_UPGRADE_SETTINGS;

  // Get system-appropriate upgrade amounts
  const systemDefaults = getSystemUpgradeDefaults(storyData.rpgSystem);
  const effectiveStatUpgradeAmount =
    upgradeSettings.statUpgradeAmount || systemDefaults.statUpgradeAmount;
  const effectiveResourceUpgradeAmount =
    upgradeSettings.resourceUpgradeAmount ||
    systemDefaults.resourceUpgradeAmount;

  // Calculate XP progress and available upgrades
  const xpProgress = getXPProgress(storyData.points || 0);
  const availableUpgrades = getAvailableUpgrades(
    storyData.level || 1,
    storyData.upgradesSpent || 0,
    storyData.difficulty
  );

  // If upgrade system is disabled, show message
  if (!upgradeSettings.enabled) {
    return (
      <div className="w-full">
        <div className="bg-blue-950/50 backdrop-blur-sm rounded-2xl p-6 sm:p-8 border border-blue-800/30">
          <div className="text-center py-12">
            <DynamicIcon
              name="Lock"
              className="w-16 h-16 mb-4 mx-auto text-blue-300/40"
            />
            <h2 className="text-2xl font-bold text-white mb-2">
              Upgrades Disabled
            </h2>
            <p className="text-blue-200/60">
              The author has disabled the upgrade system for this adventure.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Wrapper that increments upgradesSpent after successful upgrade
  const handleUpgrade = (callback: () => void) => {
    onUpgrade(() => {
      callback();
      storyData.upgradesSpent = (storyData.upgradesSpent || 0) + 1;
    });
  };

  const handleStatUpgrade = () => {
    if (!selectedStat || availableUpgrades <= 0) return;

    handleUpgrade(() => {
      const stat = storyData.stats.find((s) => s.name === selectedStat);
      if (stat && stat.value < 100) {
        const oldValue = stat.value;
        stat.value = Math.min(100, stat.value + effectiveStatUpgradeAmount);
        // Track upgrade for AI context
        if (!storyData.pendingPlayerActions) {
          storyData.pendingPlayerActions = [];
        }
        storyData.pendingPlayerActions.push(
          `Upgraded ${stat.name}: ${oldValue} → ${stat.value}`
        );
      }
    });
  };

  const handleResourceUpgrade = () => {
    if (!selectedResource || availableUpgrades <= 0) return;

    handleUpgrade(() => {
      const resource = storyData.resources.find(
        (r) => r.name === selectedResource
      );
      if (resource) {
        const oldMax = resource.maxValue;
        resource.maxValue += effectiveResourceUpgradeAmount;
        resource.value = Math.min(
          resource.value + effectiveResourceUpgradeAmount,
          resource.maxValue
        );
        // Track upgrade for AI context
        if (!storyData.pendingPlayerActions) {
          storyData.pendingPlayerActions = [];
        }
        storyData.pendingPlayerActions.push(
          `Upgraded ${resource.name} max: ${oldMax} → ${resource.maxValue}`
        );
      }
    });
  };

  // Shop handlers
  const handleBuyShopStat = (shopStat: any) => {
    if (availableUpgrades <= 0) return;
    // Check if already owned
    if (storyData.stats.some((s) => s.name === shopStat.name)) {
      return; // Already owned
    }

    handleUpgrade(() => {
      storyData.stats.push({
        name: shopStat.name,
        description: shopStat.description,
        symbol: shopStat.symbol,
        custom_symbol_url: shopStat.custom_symbol_url,
        value: shopStat.startingValue,
      });
      // Track purchase for AI context
      if (!storyData.pendingPlayerActions) {
        storyData.pendingPlayerActions = [];
      }
      storyData.pendingPlayerActions.push(
        `Unlocked new stat: ${shopStat.name} (starting at ${shopStat.startingValue})`
      );
    });
  };

  const handleBuyShopResource = (shopResource: any) => {
    if (availableUpgrades <= 0) return;
    // Check if already owned
    if (storyData.resources.some((r) => r.name === shopResource.name)) {
      return; // Already owned
    }

    handleUpgrade(() => {
      storyData.resources.push({
        name: shopResource.name,
        description: shopResource.description,
        symbol: shopResource.symbol,
        custom_symbol_url: shopResource.custom_symbol_url,
        value: shopResource.startingValue,
        maxValue: shopResource.startingMaxValue,
      });
      // Track purchase for AI context
      if (!storyData.pendingPlayerActions) {
        storyData.pendingPlayerActions = [];
      }
      storyData.pendingPlayerActions.push(
        `Unlocked new resource: ${shopResource.name} (${shopResource.startingValue}/${shopResource.startingMaxValue})`
      );
    });
  };

  const handleBuyShopItem = (shopItem: any) => {
    if (availableUpgrades <= 0) return;

    handleUpgrade(() => {
      const existing = storyData.inventory.find(
        (i) => i.name === shopItem.name
      );
      if (existing) {
        existing.quantity += shopItem.quantity;
      } else {
        storyData.inventory.push({
          name: shopItem.name,
          description: shopItem.description,
          symbol: shopItem.symbol,
          type: shopItem.type,
          quantity: shopItem.quantity,
        });
      }
      // Track purchase for AI context
      if (!storyData.pendingPlayerActions) {
        storyData.pendingPlayerActions = [];
      }
      storyData.pendingPlayerActions.push(
        `Purchased item: ${shopItem.name} x${shopItem.quantity}`
      );
    });
  };

  const handleBuyShopAbility = (shopAbility: ShopAbility) => {
    if (availableUpgrades <= 0) return;
    // Check if already owned
    if (storyData.abilities?.some((a) => a.name === shopAbility.name)) {
      return; // Already owned
    }

    handleUpgrade(() => {
      if (!storyData.abilities) {
        storyData.abilities = [];
      }
      storyData.abilities.push({
        name: shopAbility.name,
        description: shopAbility.description,
        symbol: shopAbility.symbol,
        grade: shopAbility.grade,
        cost: shopAbility.abilityCost,
        cooldown: shopAbility.cooldown,
        currentCooldown: 0,
        stat: shopAbility.stat,
      });
      // Track purchase for AI context
      if (!storyData.pendingPlayerActions) {
        storyData.pendingPlayerActions = [];
      }
      storyData.pendingPlayerActions.push(
        `Unlocked new ability: ${shopAbility.name}${
          shopAbility.grade ? ` (${shopAbility.grade})` : ""
        }`
      );
    });
  };

  // Skill Tree handlers
  const handleNodeUnlock = (treeId: string, nodeId: string) => {
    if (availableUpgrades <= 0) return;

    onUpgrade(() => {
      const result = unlockNode(storyData, treeId, nodeId);
      if (!result.success) {
        console.error("Failed to unlock node:", result.message);
        return;
      }
      // Track skill tree purchase for AI context
      const tree = storyData.skillTrees?.find((t) => t.id === treeId);
      const node = tree?.nodes.find((n) => n.id === nodeId);
      if (node) {
        if (!storyData.pendingPlayerActions) {
          storyData.pendingPlayerActions = [];
        }
        storyData.pendingPlayerActions.push(
          `Unlocked skill tree node: ${node.name}${
            tree ? ` (${tree.name})` : ""
          } - ${node.description || node.type}`
        );
      }
      // unlockNode already increments upgradesSpent
    });
  };

  const handleRespecConfirm = (treeId?: string) => {
    onUpgrade(() => {
      if (treeId) {
        respecTree(storyData, treeId);
      } else {
        respecAllTrees(storyData);
      }
    });
    setShowRespecConfirm(false);
  };

  // Check if skill trees are available
  const skillTreesAvailable = hasSkillTrees(storyData);

  return (
    <div className="w-full">
      <div className="bg-blue-950/50 backdrop-blur-sm rounded-2xl p-6 sm:p-8 border border-blue-800/30">
        <div className="flex flex-col gap-6">
          {/* Level & XP Display */}
          <div className="p-6 rounded-lg bg-linear-to-r from-yellow-900/30 to-amber-900/30 border-2 border-yellow-500/50">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-14 h-14 rounded-full bg-yellow-500/20 border-2 border-yellow-400 flex items-center justify-center">
                  <span className="text-2xl font-bold text-yellow-400">
                    {xpProgress.currentLevel}
                  </span>
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white">
                    Level {xpProgress.currentLevel}
                  </h2>
                  <p className="text-sm text-yellow-200/60">
                    {formatXP(xpProgress.totalXP)} XP total
                  </p>
                </div>
              </div>
              {availableUpgrades > 0 && (
                <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-green-500/20 border border-green-400/50">
                  <DynamicIcon
                    name="ArrowUp"
                    className="w-5 h-5 text-green-400"
                  />
                  <span className="text-lg font-bold text-green-400">
                    {availableUpgrades} Upgrade
                    {availableUpgrades > 1 ? "s" : ""} Available
                  </span>
                </div>
              )}
            </div>

            {/* XP Progress Bar */}
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-yellow-200/80">
                  Progress to Level {xpProgress.currentLevel + 1}
                </span>
                <span className="text-yellow-400 font-semibold">
                  {formatXP(xpProgress.xpIntoLevel)} /{" "}
                  {formatXP(xpProgress.xpNeededForNext)} XP
                </span>
              </div>
              <div className="h-4 bg-yellow-950/50 rounded-full overflow-hidden border border-yellow-700/30">
                <div
                  className="h-full bg-linear-to-r from-yellow-500 to-amber-400 rounded-full transition-all duration-500 ease-out"
                  style={{ width: `${xpProgress.percentage}%` }}
                />
              </div>
              <p className="text-xs text-yellow-300/50 text-center">
                {xpProgress.percentage}% to next level
              </p>
            </div>
          </div>

          {/* How to Earn XP */}
          <div className="p-4 rounded-lg bg-blue-900/30 border border-blue-700/40">
            <h3 className="text-sm font-bold text-blue-200 mb-2">
              <DynamicIcon
                name="Lightbulb"
                className="inline-block w-4 h-4 mr-1"
              />
              How to Earn XP:
            </h3>
            <ul className="text-xs text-blue-300/80 space-y-1">
              <li>
                • Unlock Achievements:{" "}
                <span className="font-semibold">XP varies by achievement</span>
              </li>
              <li>
                • Complete Quests:{" "}
                <span className="font-semibold">XP varies by quest</span>
              </li>
              <li>
                • Win Scene Challenges:{" "}
                <span className="font-semibold">XP varies by challenge</span>
              </li>
            </ul>
            <p className="text-xs text-blue-400/70 mt-2 italic">
              Each level up grants you one upgrade choice from the options
              below.
            </p>
          </div>

          {/* Skill Trees Section */}
          {skillTreesAvailable && storyData.skillTrees && (
            <div className="p-6 rounded-lg bg-purple-900/30 border border-purple-700/40">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-bold flex items-center gap-2 text-white">
                  <DynamicIcon
                    name="GitBranch"
                    className="w-8 h-8 text-purple-400"
                  />
                  Skill Trees
                </h3>
                <div className="flex gap-2">
                  {(storyData.unlockedNodes?.length || 0) > 0 && (
                    <button
                      onClick={() => setShowRespecConfirm(true)}
                      className="px-3 py-1.5 text-sm font-medium rounded-lg transition-all bg-red-900/40 text-red-300 hover:bg-red-800/50 border border-red-700/40"
                    >
                      <DynamicIcon
                        name="RotateCcw"
                        className="w-4 h-4 inline-block mr-1"
                      />
                      Respec All
                    </button>
                  )}
                </div>
              </div>

              {/* Tree Tabs (if multiple trees) */}
              {storyData.skillTrees.length > 1 && (
                <div className="flex gap-2 mb-4 flex-wrap">
                  {storyData.skillTrees.map((tree) => (
                    <button
                      key={tree.id}
                      onClick={() => setActiveTreeId(tree.id)}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                        activeTreeId === tree.id
                          ? "bg-purple-600 text-white"
                          : "bg-purple-900/30 text-purple-300 hover:bg-purple-800/40 border border-purple-700/40"
                      }`}
                    >
                      {tree.name}
                      <span className="ml-2 text-xs opacity-70">
                        ({getTreeUnlockedCount(storyData, tree.id)}/
                        {tree.nodes.length})
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {/* Active Tree View */}
              {activeTreeId &&
                storyData.skillTrees.find((t) => t.id === activeTreeId) && (
                  <SkillTreeView
                    tree={
                      storyData.skillTrees.find((t) => t.id === activeTreeId)!
                    }
                    storyData={storyData}
                    availableUpgrades={availableUpgrades}
                    onUnlock={(treeId: string, nodeId: string) =>
                      handleNodeUnlock(treeId, nodeId)
                    }
                  />
                )}
            </div>
          )}

          {/* Respec Confirmation Modal */}
          {showRespecConfirm && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
              <div className="bg-gray-900 rounded-xl p-6 max-w-md border border-red-700/50">
                <h3 className="text-xl font-bold text-red-400 mb-4">
                  <DynamicIcon
                    name="AlertTriangle"
                    className="w-6 h-6 inline-block mr-2"
                  />
                  Confirm Respec
                </h3>
                <p className="text-gray-300 mb-4">
                  This will remove <strong>all</strong> unlocked skill tree
                  nodes and refund your upgrade points.
                </p>
                <p className="text-yellow-400/80 text-sm mb-6">
                  <strong>Warning:</strong> All stats, abilities, items, and
                  resources granted by skill trees will be removed!
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowRespecConfirm(false)}
                    className="flex-1 px-4 py-2 font-medium rounded-lg bg-gray-700 text-gray-300 hover:bg-gray-600 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => handleRespecConfirm()}
                    className="flex-1 px-4 py-2 font-medium rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors"
                  >
                    Confirm Respec
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* No Upgrades Available Message */}
          {availableUpgrades === 0 && (
            <div className="p-4 rounded-lg bg-blue-900/20 border border-blue-700/30 text-center">
              <DynamicIcon
                name="Clock"
                className="w-8 h-8 mx-auto mb-2 text-blue-400/60"
              />
              <p className="text-blue-200/70">
                Earn more XP to level up and unlock your next upgrade!
              </p>
              <p className="text-sm text-blue-300/50 mt-1">
                {formatXP(xpProgress.xpNeededForNext - xpProgress.xpIntoLevel)}{" "}
                XP until Level {xpProgress.currentLevel + 1}
              </p>
            </div>
          )}

          {/* Upgrade Stats - Only show when no skill trees are defined */}
          {!skillTreesAvailable &&
            upgradeSettings.allowStatUpgrade &&
            storyData.stats.length > 0 &&
            availableUpgrades > 0 && (
              <div className="p-6 rounded-lg bg-blue-900/30 border border-blue-700/40">
                <h3 className="text-xl font-bold mb-4 flex items-center gap-2 text-white">
                  <DynamicIcon
                    name="BarChart2"
                    className="w-8 h-8 text-blue-400"
                  />
                  Upgrade Stats
                </h3>
                <p className="text-sm text-blue-200/60 mb-4">
                  +{effectiveStatUpgradeAmount} to selected stat
                </p>

                <div className="space-y-3">
                  {storyData.stats.map((stat) => (
                    <div
                      key={stat.name}
                      className={`flex items-center justify-between p-3 rounded-lg cursor-pointer transition-all border-2 ${
                        selectedStat === stat.name
                          ? "bg-blue-800/40 border-blue-500"
                          : "bg-blue-900/20 border-blue-800/30 hover:border-blue-600/50"
                      }`}
                      onClick={() => setSelectedStat(stat.name)}
                    >
                      <div className="flex items-center gap-3">
                        <DynamicIcon
                          name={stat.symbol}
                          className="w-8 h-8 text-blue-400"
                        />
                        <div>
                          <p className="font-bold text-white">{stat.name}</p>
                          <p className="text-xs text-blue-200/60">
                            {stat.description}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-bold text-blue-400">
                          {stat.value}/100
                        </p>
                        {stat.value < 100 && (
                          <p className="text-xs text-blue-300/50">
                            →{" "}
                            {Math.min(
                              100,
                              stat.value + effectiveStatUpgradeAmount
                            )}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                <button
                  onClick={handleStatUpgrade}
                  disabled={
                    !selectedStat ||
                    availableUpgrades <= 0 ||
                    (storyData.stats.find((s) => s.name === selectedStat)
                      ?.value ?? 100) >= 100
                  }
                  className="w-full mt-4 px-6 py-3 font-bold rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed bg-blue-600 text-white hover:bg-blue-700 disabled:hover:bg-blue-600"
                >
                  Upgrade Selected Stat
                </button>
              </div>
            )}

          {/* Upgrade Resources - Only show when no skill trees are defined */}
          {!skillTreesAvailable &&
            upgradeSettings.allowResourceUpgrade &&
            storyData.resources.length > 0 &&
            availableUpgrades > 0 && (
              <div className="p-6 rounded-lg bg-green-900/30 border border-green-700/40">
                <h3 className="text-xl font-bold mb-4 flex items-center gap-2 text-white">
                  <DynamicIcon name="Zap" className="w-8 h-8 text-green-400" />
                  Upgrade Resources
                </h3>
                <p className="text-sm text-green-200/60 mb-4">
                  +{effectiveResourceUpgradeAmount} max value
                </p>
                <div className="space-y-3">
                  {storyData.resources.map((resource) => (
                    <div
                      key={resource.name}
                      className={`flex items-center justify-between p-3 rounded-lg cursor-pointer transition-all border-2 ${
                        selectedResource === resource.name
                          ? "bg-green-800/40 border-green-500"
                          : "bg-green-900/20 border-green-800/30 hover:border-green-600/50"
                      }`}
                      onClick={() => setSelectedResource(resource.name)}
                    >
                      <div className="flex items-center gap-3">
                        <DynamicIcon
                          name={resource.symbol}
                          className="w-8 h-8 text-green-400"
                        />
                        <div>
                          <p className="font-bold text-white">
                            {resource.name}
                          </p>
                          <p className="text-xs text-green-200/60">
                            {resource.description}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-bold text-green-400">
                          {resource.value}/{resource.maxValue}
                        </p>
                        <p className="text-xs text-green-300/50">
                          → Max{" "}
                          {resource.maxValue + effectiveResourceUpgradeAmount}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>

                <button
                  onClick={handleResourceUpgrade}
                  disabled={!selectedResource || availableUpgrades <= 0}
                  className="w-full mt-4 px-6 py-3 font-bold rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed bg-green-600 text-white hover:bg-green-700 disabled:hover:bg-green-600"
                >
                  Upgrade Selected Resource
                </button>
              </div>
            )}

          {/* Stat Shop - Only show when no skill trees are defined */}
          {!skillTreesAvailable &&
            upgradeSettings.statShopEnabled &&
            upgradeSettings.statShop.length > 0 &&
            availableUpgrades > 0 && (
              <div className="p-6 rounded-lg bg-cyan-900/30 border border-cyan-700/40">
                <h3 className="text-xl font-bold mb-4 flex items-center gap-2 text-white">
                  <DynamicIcon name="Store" className="w-8 h-8 text-cyan-400" />
                  Unlock New Stats
                </h3>
                <p className="text-sm text-cyan-200/60 mb-4">
                  Gain new stats to expand your abilities
                </p>

                <div className="space-y-3">
                  {upgradeSettings.statShop.map((shopStat, index) => {
                    const alreadyOwned = storyData.stats.some(
                      (s) => s.name === shopStat.name
                    );
                    return (
                      <div
                        key={index}
                        className={`flex items-center justify-between p-4 rounded-lg border-2 ${
                          alreadyOwned
                            ? "bg-blue-900/20 border-blue-800/30 opacity-60"
                            : "bg-cyan-900/20 border-cyan-700/40"
                        }`}
                      >
                        <div className="flex items-center gap-3 flex-1">
                          <DynamicIcon
                            name={shopStat.symbol}
                            className="w-8 h-8 text-cyan-400"
                          />
                          <div>
                            <p className="font-bold text-white">
                              {shopStat.name}
                              {alreadyOwned && (
                                <span className="ml-2 text-xs text-green-400">
                                  <DynamicIcon
                                    name="Check"
                                    className="inline-block w-3 h-3"
                                  />{" "}
                                  Owned
                                </span>
                              )}
                            </p>
                            <p className="text-xs text-cyan-200/60">
                              {shopStat.description}
                            </p>
                            <p className="text-xs text-cyan-300/50 mt-1">
                              Starting value: {shopStat.startingValue}
                            </p>
                          </div>
                        </div>
                        <button
                          onClick={() => handleBuyShopStat(shopStat)}
                          disabled={alreadyOwned || availableUpgrades <= 0}
                          className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:bg-blue-800/50 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors"
                        >
                          {alreadyOwned ? "Owned" : "Unlock"}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

          {/* Resource Shop - Only show when no skill trees are defined */}
          {!skillTreesAvailable &&
            upgradeSettings.resourceShopEnabled &&
            upgradeSettings.resourceShop.length > 0 &&
            availableUpgrades > 0 && (
              <div className="p-6 rounded-lg bg-teal-900/30 border border-teal-700/40">
                <h3 className="text-xl font-bold mb-4 flex items-center gap-2 text-white">
                  <DynamicIcon
                    name="ShoppingCart"
                    className="w-8 h-8 text-teal-400"
                  />
                  Unlock New Resources
                </h3>
                <p className="text-sm text-teal-200/60 mb-4">
                  Gain new resources to expand your capabilities
                </p>

                <div className="space-y-3">
                  {upgradeSettings.resourceShop.map((shopResource, index) => {
                    const alreadyOwned = storyData.resources.some(
                      (r) => r.name === shopResource.name
                    );
                    return (
                      <div
                        key={index}
                        className={`flex items-center justify-between p-4 rounded-lg border-2 ${
                          alreadyOwned
                            ? "bg-blue-900/20 border-blue-800/30 opacity-60"
                            : "bg-teal-900/20 border-teal-700/40"
                        }`}
                      >
                        <div className="flex items-center gap-3 flex-1">
                          <DynamicIcon
                            name={shopResource.symbol}
                            className="w-8 h-8 text-teal-400"
                          />
                          <div>
                            <p className="font-bold text-white">
                              {shopResource.name}
                              {alreadyOwned && (
                                <span className="ml-2 text-xs text-green-400">
                                  <DynamicIcon
                                    name="Check"
                                    className="inline-block w-3 h-3"
                                  />{" "}
                                  Owned
                                </span>
                              )}
                            </p>
                            <p className="text-xs text-teal-200/60">
                              {shopResource.description}
                            </p>
                            <p className="text-xs text-teal-300/50 mt-1">
                              Starting: {shopResource.startingValue}/
                              {shopResource.startingMaxValue}
                            </p>
                          </div>
                        </div>
                        <button
                          onClick={() => handleBuyShopResource(shopResource)}
                          disabled={alreadyOwned || availableUpgrades <= 0}
                          className="px-4 py-2 bg-teal-600 hover:bg-teal-500 disabled:bg-blue-800/50 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors"
                        >
                          {alreadyOwned ? "Owned" : "Unlock"}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

          {/* Item Shop - Only show when no skill trees are defined */}
          {!skillTreesAvailable &&
            upgradeSettings.itemShopEnabled &&
            upgradeSettings.itemShop.length > 0 &&
            availableUpgrades > 0 && (
              <div className="p-6 rounded-lg bg-amber-900/30 border border-amber-700/40">
                <h3 className="text-xl font-bold mb-4 flex items-center gap-2 text-white">
                  <DynamicIcon
                    name="ShoppingBag"
                    className="w-8 h-8 text-amber-400"
                  />
                  Item Shop
                </h3>
                <p className="text-sm text-amber-200/60 mb-4">
                  Items curated by the adventure author
                </p>

                <div className="space-y-3">
                  {upgradeSettings.itemShop.map((shopItem, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between p-4 rounded-lg border-2 bg-amber-900/20 border-amber-700/40"
                    >
                      <div className="flex items-center gap-3 flex-1">
                        <DynamicIcon
                          name={shopItem.symbol}
                          className="w-8 h-8 text-amber-400"
                        />
                        <div>
                          <p className="font-bold text-white">
                            {shopItem.name}
                          </p>
                          <p className="text-xs text-amber-200/60">
                            {shopItem.description}
                          </p>
                          <div className="flex gap-2 mt-1">
                            <span className="text-xs px-2 py-0.5 bg-amber-800/50 text-amber-200 rounded-full">
                              {shopItem.type}
                            </span>
                            <span className="text-xs px-2 py-0.5 bg-blue-800/50 text-blue-200 rounded-full">
                              ×{shopItem.quantity}
                            </span>
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => handleBuyShopItem(shopItem)}
                        disabled={availableUpgrades <= 0}
                        className="px-4 py-2 bg-amber-600 hover:bg-amber-500 disabled:bg-blue-800/50 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors"
                      >
                        Get
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

          {/* Ability Shop - Only show when no skill trees are defined */}
          {!skillTreesAvailable &&
            upgradeSettings.abilityShopEnabled &&
            upgradeSettings.abilityShop &&
            upgradeSettings.abilityShop.length > 0 &&
            availableUpgrades > 0 && (
              <div className="p-6 rounded-lg bg-violet-900/30 border border-violet-700/40">
                <h3 className="text-xl font-bold mb-4 flex items-center gap-2 text-white">
                  <DynamicIcon
                    name="Sparkles"
                    className="w-8 h-8 text-violet-400"
                  />
                  Unlock Abilities
                </h3>
                <p className="text-sm text-violet-200/60 mb-4">
                  Learn new abilities and techniques
                </p>

                <div className="space-y-3">
                  {upgradeSettings.abilityShop.map((shopAbility, index) => {
                    const alreadyOwned = storyData.abilities?.some(
                      (a) => a.name === shopAbility.name
                    );
                    const gradeConfig =
                      ABILITY_GRADE_CONFIG[shopAbility.grade] ||
                      ABILITY_GRADE_CONFIG.novice;
                    return (
                      <div
                        key={index}
                        className={`flex items-center justify-between p-4 rounded-lg border-2 ${
                          alreadyOwned
                            ? "bg-blue-900/20 border-blue-800/30 opacity-60"
                            : "bg-violet-900/20 border-violet-700/40"
                        }`}
                      >
                        <div className="flex items-center gap-3 flex-1">
                          <DynamicIcon
                            name={shopAbility.symbol}
                            className="w-8 h-8 text-violet-400"
                          />
                          <div>
                            <p className="font-bold text-white">
                              {shopAbility.name}
                              {alreadyOwned && (
                                <span className="ml-2 text-xs text-green-400">
                                  <DynamicIcon
                                    name="Check"
                                    className="inline-block w-3 h-3"
                                  />{" "}
                                  Owned
                                </span>
                              )}
                            </p>
                            <p className="text-xs text-violet-200/60">
                              {shopAbility.description}
                            </p>
                            <div className="flex flex-wrap gap-2 mt-1">
                              <span
                                className="text-xs px-2 py-0.5 rounded-full"
                                style={{
                                  backgroundColor: `${gradeConfig.color}30`,
                                  color: gradeConfig.color,
                                }}
                              >
                                {gradeConfig.label} (+
                                {getAbilityBonus(
                                  {
                                    name: shopAbility.name,
                                    description: shopAbility.description,
                                    grade: shopAbility.grade,
                                    cost: [],
                                    symbol: "",
                                  },
                                  storyData.rpgSystem || "3d6"
                                )}
                                )
                              </span>
                              {shopAbility.cooldown &&
                                shopAbility.cooldown > 0 && (
                                  <span className="text-xs px-2 py-0.5 bg-blue-800/50 text-blue-200 rounded-full">
                                    {shopAbility.cooldown} turn cooldown
                                  </span>
                                )}
                              {shopAbility.abilityCost &&
                                shopAbility.abilityCost.length > 0 && (
                                  <span className="text-xs px-2 py-0.5 bg-red-800/50 text-red-200 rounded-full">
                                    Cost:{" "}
                                    {shopAbility.abilityCost
                                      .map((c) => `${c.amount} ${c.name}`)
                                      .join(", ")}
                                  </span>
                                )}
                              {shopAbility.stat && (
                                <span className="text-xs px-2 py-0.5 bg-cyan-800/50 text-cyan-200 rounded-full">
                                  {shopAbility.stat}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <button
                          onClick={() => handleBuyShopAbility(shopAbility)}
                          disabled={alreadyOwned || availableUpgrades <= 0}
                          className="px-4 py-2 bg-violet-600 hover:bg-violet-500 disabled:bg-blue-800/50 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors"
                        >
                          {alreadyOwned ? "Owned" : "Learn"}
                        </button>
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
