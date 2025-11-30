"use client";

import {
  StoryData,
  UPGRADE_COSTS,
  DEFAULT_UPGRADE_SETTINGS,
  ShopAbility,
} from "../misc/structs";
import { ABILITY_GRADE_CONFIG, getAbilityBonus } from "../misc/abilitySystem";
import { getSystemUpgradeDefaults } from "../misc/rpgSystems";
import { useState } from "react";
import { DynamicIcon } from "../components/DynamicIcon";

interface UpgradesPageProps {
  storyData: StoryData;
  onPurchase: (cost: number, callback: () => void) => void;
}

export default function UpgradesPage({
  storyData,
  onPurchase,
}: UpgradesPageProps) {
  const [selectedStat, setSelectedStat] = useState<string>("");
  const [selectedResource, setSelectedResource] = useState<string>("");
  const [newItemName, setNewItemName] = useState("");
  const [newItemDescription, setNewItemDescription] = useState("");
  const [newItemType, setNewItemType] = useState<
    "normal" | "consumable" | "story" | "misc"
  >("normal");

  // Use custom upgrade settings or fallback to defaults
  const upgradeSettings = storyData.upgradeSettings || DEFAULT_UPGRADE_SETTINGS;

  // Get system-appropriate upgrade amounts
  const systemDefaults = getSystemUpgradeDefaults(storyData.rpgSystem);
  const effectiveStatUpgradeAmount =
    upgradeSettings.statUpgradeAmount || systemDefaults.statUpgradeAmount;
  const effectiveResourceUpgradeAmount =
    upgradeSettings.resourceUpgradeAmount ||
    systemDefaults.resourceUpgradeAmount;

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

  const handleStatUpgrade = () => {
    if (!selectedStat) return;

    onPurchase(upgradeSettings.statUpgradeCost, () => {
      const stat = storyData.stats.find((s) => s.name === selectedStat);
      if (stat && stat.value < 100) {
        stat.value = Math.min(100, stat.value + effectiveStatUpgradeAmount);
      }
    });
  };

  const handleResourceUpgrade = () => {
    if (!selectedResource) return;

    onPurchase(upgradeSettings.resourceUpgradeCost, () => {
      const resource = storyData.resources.find(
        (r) => r.name === selectedResource
      );
      if (resource) {
        resource.maxValue += effectiveResourceUpgradeAmount;
        resource.value = Math.min(
          resource.value + effectiveResourceUpgradeAmount,
          resource.maxValue
        );
      }
    });
  };

  const handleAddItem = () => {
    if (!newItemName.trim()) return;

    onPurchase(upgradeSettings.addItemCost, () => {
      storyData.inventory.push({
        name: newItemName,
        quantity: 1,
        description: newItemDescription || "A useful item",
        type: newItemType,
        symbol: "Package",
      });
      setNewItemName("");
      setNewItemDescription("");
      setNewItemType("normal");
    });
  };

  // Shop handlers
  const handleBuyShopStat = (shopStat: any) => {
    // Check if already owned
    if (storyData.stats.some((s) => s.name === shopStat.name)) {
      return; // Already owned
    }

    onPurchase(shopStat.cost, () => {
      storyData.stats.push({
        name: shopStat.name,
        description: shopStat.description,
        symbol: shopStat.symbol,
        custom_symbol_url: shopStat.custom_symbol_url,
        value: shopStat.startingValue,
      });
    });
  };

  const handleBuyShopResource = (shopResource: any) => {
    // Check if already owned
    if (storyData.resources.some((r) => r.name === shopResource.name)) {
      return; // Already owned
    }

    onPurchase(shopResource.cost, () => {
      storyData.resources.push({
        name: shopResource.name,
        description: shopResource.description,
        symbol: shopResource.symbol,
        custom_symbol_url: shopResource.custom_symbol_url,
        value: shopResource.startingValue,
        maxValue: shopResource.startingMaxValue,
      });
    });
  };

  const handleBuyShopItem = (shopItem: any) => {
    onPurchase(shopItem.cost, () => {
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
    });
  };

  const handleBuyShopAbility = (shopAbility: ShopAbility) => {
    // Check if already owned
    if (storyData.abilities?.some((a) => a.name === shopAbility.name)) {
      return; // Already owned
    }

    onPurchase(shopAbility.cost, () => {
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
    });
  };

  return (
    <div className="w-full">
      <div className="bg-blue-950/50 backdrop-blur-sm rounded-2xl p-6 sm:p-8 border border-blue-800/30">
        <div className="flex flex-col gap-6">
          {/* Points Display */}
          <div className="flex items-center justify-between p-6 rounded-lg bg-linear-to-r from-yellow-900/30 to-amber-900/30 border-2 border-yellow-500/50">
            <div className="flex items-center gap-3">
              <DynamicIcon name="Star" className="w-10 h-10 text-yellow-400" />
              <div>
                <h2 className="text-2xl font-bold text-white">
                  {storyData.points} Points
                </h2>
                <p className="text-sm text-yellow-200/60">
                  Available to spend on upgrades
                </p>
              </div>
            </div>
          </div>

          {/* How to Earn Points */}
          <div className="p-4 rounded-lg bg-blue-900/30 border border-blue-700/40">
            <h3 className="text-sm font-bold text-blue-200 mb-2">
              <DynamicIcon
                name="Lightbulb"
                className="inline-block w-4 h-4 mr-1"
              />
              How to Earn Points:
            </h3>
            <ul className="text-xs text-blue-300/80 space-y-1">
              <li>
                • Complete Story Beats:{" "}
                <span className="font-semibold">
                  {UPGRADE_COSTS.BEAT_REWARD} points
                </span>
              </li>
              <li>
                • Finish Chapters:{" "}
                <span className="font-semibold">
                  {UPGRADE_COSTS.CHAPTER_REWARD} points
                </span>
              </li>
              <li>
                • Unlock Achievements:{" "}
                <span className="font-semibold">
                  Points vary by achievement
                </span>
              </li>
            </ul>
          </div>

          {/* Upgrade Stats */}
          {upgradeSettings.allowStatUpgrade && storyData.stats.length > 0 && (
            <div className="p-6 rounded-lg bg-blue-900/30 border border-blue-700/40">
              <h3 className="text-xl font-bold mb-4 flex items-center gap-2 text-white">
                <DynamicIcon
                  name="BarChart2"
                  className="w-8 h-8 text-blue-400"
                />
                Upgrade Stats
              </h3>
              <p className="text-sm text-blue-200/60 mb-4">
                Cost:{" "}
                <span className="font-bold text-blue-400">
                  {upgradeSettings.statUpgradeCost} points
                </span>{" "}
                per +{effectiveStatUpgradeAmount} stat point
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
                          → {stat.value + 1}
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
                  storyData.points < upgradeSettings.statUpgradeCost ||
                  (storyData.stats.find((s) => s.name === selectedStat)
                    ?.value ?? 100) >= 100
                }
                className="w-full mt-4 px-6 py-3 font-bold rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed bg-blue-600 text-white hover:bg-blue-700 disabled:hover:bg-blue-600"
              >
                Upgrade Selected Stat ({upgradeSettings.statUpgradeCost} points)
              </button>
            </div>
          )}

          {/* Upgrade Resources */}
          {upgradeSettings.allowResourceUpgrade &&
            storyData.resources.length > 0 && (
              <div className="p-6 rounded-lg bg-green-900/30 border border-green-700/40">
                <h3 className="text-xl font-bold mb-4 flex items-center gap-2 text-white">
                  <DynamicIcon name="Zap" className="w-8 h-8 text-green-400" />
                  Upgrade Resources
                </h3>
                <p className="text-sm text-green-200/60 mb-4">
                  Cost:{" "}
                  <span className="font-bold text-green-400">
                    {upgradeSettings.resourceUpgradeCost} points
                  </span>{" "}
                  per +{effectiveResourceUpgradeAmount} max value
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
                          {resource.maxValue +
                            upgradeSettings.resourceUpgradeAmount}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>

                <button
                  onClick={handleResourceUpgrade}
                  disabled={
                    !selectedResource ||
                    storyData.points < upgradeSettings.resourceUpgradeCost
                  }
                  className="w-full mt-4 px-6 py-3 font-bold rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed bg-green-600 text-white hover:bg-green-700 disabled:hover:bg-green-600"
                >
                  Upgrade Selected Resource (
                  {upgradeSettings.resourceUpgradeCost} points)
                </button>
              </div>
            )}

          {/* Add Custom Item */}
          {upgradeSettings.allowAddItem && (
            <div className="p-6 rounded-lg bg-purple-900/30 border border-purple-700/40">
              <h3 className="text-xl font-bold mb-4 flex items-center gap-2 text-white">
                <DynamicIcon
                  name="Backpack"
                  className="w-8 h-8 text-purple-400"
                />
                Add Custom Item
              </h3>
              <p className="text-sm text-purple-200/60 mb-4">
                Cost:{" "}
                <span className="font-bold text-purple-400">
                  {upgradeSettings.addItemCost} points
                </span>{" "}
                per item
              </p>

              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-bold text-purple-200 mb-2">
                    Item Name
                  </label>
                  <input
                    type="text"
                    value={newItemName}
                    onChange={(e) => setNewItemName(e.target.value)}
                    placeholder="e.g., Magic Sword, Health Potion"
                    className="w-full px-4 py-2 rounded-lg border-2 border-purple-700/40 bg-purple-900/20 text-white placeholder-purple-300/40 focus:border-purple-500 focus:outline-none"
                    maxLength={50}
                  />
                </div>

                <div>
                  <label className="block text-sm font-bold text-purple-200 mb-2">
                    Description (Optional)
                  </label>
                  <textarea
                    value={newItemDescription}
                    onChange={(e) => setNewItemDescription(e.target.value)}
                    placeholder="Describe the item..."
                    className="w-full px-4 py-2 rounded-lg border-2 border-purple-700/40 bg-purple-900/20 text-white placeholder-purple-300/40 focus:border-purple-500 focus:outline-none resize-none"
                    rows={2}
                    maxLength={200}
                  />
                </div>

                <div>
                  <label className="block text-sm font-bold text-purple-200 mb-2">
                    Item Type
                  </label>
                  <select
                    value={newItemType}
                    onChange={(e) =>
                      setNewItemType(
                        e.target.value as
                          | "normal"
                          | "consumable"
                          | "story"
                          | "misc"
                      )
                    }
                    className="w-full px-4 py-2 rounded-lg border-2 border-purple-700/40 bg-purple-900/20 text-white focus:border-purple-500 focus:outline-none"
                  >
                    <option value="normal">
                      Normal (Advantage, breaks on fail)
                    </option>
                    <option value="consumable">
                      Consumable (Advantage, used immediately)
                    </option>
                    <option value="story">
                      Story Item (Advantage, never breaks)
                    </option>
                    <option value="misc">
                      Misc (No advantage, never breaks)
                    </option>
                  </select>
                </div>
              </div>

              <button
                onClick={handleAddItem}
                disabled={
                  !newItemName.trim() ||
                  storyData.points < upgradeSettings.addItemCost
                }
                className="w-full mt-4 px-6 py-3 font-bold rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed bg-purple-600 text-white hover:bg-purple-700 disabled:hover:bg-purple-600"
              >
                Add Item to Inventory ({upgradeSettings.addItemCost} points)
              </button>
            </div>
          )}

          {/* Stat Shop */}
          {upgradeSettings.statShopEnabled &&
            upgradeSettings.statShop.length > 0 && (
              <div className="p-6 rounded-lg bg-cyan-900/30 border border-cyan-700/40">
                <h3 className="text-xl font-bold mb-4 flex items-center gap-2 text-white">
                  <DynamicIcon name="Store" className="w-8 h-8 text-cyan-400" />
                  Stat Shop
                </h3>
                <p className="text-sm text-cyan-200/60 mb-4">
                  Purchase new stats to unlock additional abilities
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
                          disabled={
                            alreadyOwned || storyData.points < shopStat.cost
                          }
                          className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:bg-blue-800/50 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors"
                        >
                          {alreadyOwned ? "Owned" : `${shopStat.cost} pts`}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

          {/* Resource Shop */}
          {upgradeSettings.resourceShopEnabled &&
            upgradeSettings.resourceShop.length > 0 && (
              <div className="p-6 rounded-lg bg-teal-900/30 border border-teal-700/40">
                <h3 className="text-xl font-bold mb-4 flex items-center gap-2 text-white">
                  <DynamicIcon
                    name="ShoppingCart"
                    className="w-8 h-8 text-teal-400"
                  />
                  Resource Shop
                </h3>
                <p className="text-sm text-teal-200/60 mb-4">
                  Purchase new resources to expand your capabilities
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
                          disabled={
                            alreadyOwned || storyData.points < shopResource.cost
                          }
                          className="px-4 py-2 bg-teal-600 hover:bg-teal-500 disabled:bg-blue-800/50 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors"
                        >
                          {alreadyOwned ? "Owned" : `${shopResource.cost} pts`}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

          {/* Item Shop */}
          {upgradeSettings.itemShopEnabled &&
            upgradeSettings.itemShop.length > 0 && (
              <div className="p-6 rounded-lg bg-amber-900/30 border border-amber-700/40">
                <h3 className="text-xl font-bold mb-4 flex items-center gap-2 text-white">
                  <DynamicIcon
                    name="ShoppingBag"
                    className="w-8 h-8 text-amber-400"
                  />
                  Item Shop
                </h3>
                <p className="text-sm text-amber-200/60 mb-4">
                  Purchase items curated by the adventure author
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
                        disabled={storyData.points < shopItem.cost}
                        className="px-4 py-2 bg-amber-600 hover:bg-amber-500 disabled:bg-blue-800/50 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors"
                      >
                        {shopItem.cost} pts
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

          {/* Ability Shop */}
          {upgradeSettings.abilityShopEnabled &&
            upgradeSettings.abilityShop &&
            upgradeSettings.abilityShop.length > 0 && (
              <div className="p-6 rounded-lg bg-violet-900/30 border border-violet-700/40">
                <h3 className="text-xl font-bold mb-4 flex items-center gap-2 text-white">
                  <DynamicIcon
                    name="Sparkles"
                    className="w-8 h-8 text-violet-400"
                  />
                  Ability Shop
                </h3>
                <p className="text-sm text-violet-200/60 mb-4">
                  Unlock new abilities and techniques
                </p>

                <div className="space-y-3">
                  {upgradeSettings.abilityShop.map((shopAbility, index) => {
                    const alreadyOwned = storyData.abilities?.some(
                      (a) => a.name === shopAbility.name
                    );
                    const gradeConfig = ABILITY_GRADE_CONFIG[shopAbility.grade] || ABILITY_GRADE_CONFIG.novice;
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
                          disabled={
                            alreadyOwned || storyData.points < shopAbility.cost
                          }
                          className="px-4 py-2 bg-violet-600 hover:bg-violet-500 disabled:bg-blue-800/50 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors"
                        >
                          {alreadyOwned ? "Owned" : `${shopAbility.cost} pts`}
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
