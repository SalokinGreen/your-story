"use client";

import {
  StoryData,
  UPGRADE_COSTS,
  DEFAULT_UPGRADE_SETTINGS,
} from "../misc/structs";
import { useState } from "react";

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

  // If upgrade system is disabled, show message
  if (!upgradeSettings.enabled) {
    return (
      <div className="w-full">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6 sm:p-8 border border-gray-200 dark:border-gray-700">
          <div className="text-center py-12">
            <span className="text-6xl mb-4 block">🔒</span>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
              Upgrades Disabled
            </h2>
            <p className="text-gray-600 dark:text-gray-400">
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
        stat.value = Math.min(
          100,
          stat.value + upgradeSettings.statUpgradeAmount
        );
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
        resource.maxValue += upgradeSettings.resourceUpgradeAmount;
        resource.value = Math.min(
          resource.value + upgradeSettings.resourceUpgradeAmount,
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
        symbol: "📦",
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

  return (
    <div className="w-full">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6 sm:p-8 border border-gray-200 dark:border-gray-700">
        <div className="flex flex-col gap-6">
          {/* Points Display */}
          <div className="flex items-center justify-between p-6 rounded-lg bg-linear-to-r from-yellow-50 to-amber-50 dark:from-yellow-900/20 dark:to-amber-900/20 border-2 border-yellow-400 dark:border-yellow-600">
            <div className="flex items-center gap-3">
              <span className="text-4xl">⭐</span>
              <div>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                  {storyData.points} Points
                </h2>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Available to spend on upgrades
                </p>
              </div>
            </div>
          </div>

          {/* How to Earn Points */}
          <div className="p-4 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
            <h3 className="text-sm font-bold text-blue-900 dark:text-blue-200 mb-2">
              💡 How to Earn Points:
            </h3>
            <ul className="text-xs text-blue-800 dark:text-blue-300 space-y-1">
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
            <div className="p-6 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
              <h3 className="text-xl font-bold mb-4 flex items-center gap-2 text-gray-900 dark:text-white">
                <span className="text-2xl">📊</span>
                Upgrade Stats
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                Cost:{" "}
                <span className="font-bold text-blue-600 dark:text-blue-400">
                  {upgradeSettings.statUpgradeCost} points
                </span>{" "}
                per +{upgradeSettings.statUpgradeAmount} stat point
              </p>

              <div className="space-y-3">
                {storyData.stats.map((stat) => (
                  <div
                    key={stat.name}
                    className={`flex items-center justify-between p-3 rounded-lg cursor-pointer transition-all border-2 ${
                      selectedStat === stat.name
                        ? "bg-blue-100 dark:bg-blue-900/40 border-blue-500"
                        : "bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600 hover:border-blue-300"
                    }`}
                    onClick={() => setSelectedStat(stat.name)}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{stat.symbol}</span>
                      <div>
                        <p className="font-bold text-gray-900 dark:text-white">
                          {stat.name}
                        </p>
                        <p className="text-xs text-gray-600 dark:text-gray-400">
                          {stat.description}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold text-blue-600 dark:text-blue-400">
                        {stat.value}/100
                      </p>
                      {stat.value < 100 && (
                        <p className="text-xs text-gray-500 dark:text-gray-400">
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
              <div className="p-6 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
                <h3 className="text-xl font-bold mb-4 flex items-center gap-2 text-gray-900 dark:text-white">
                  <span className="text-2xl">⚡</span>
                  Upgrade Resources
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                  Cost:{" "}
                  <span className="font-bold text-green-600 dark:text-green-400">
                    {upgradeSettings.resourceUpgradeCost} points
                  </span>{" "}
                  per +{upgradeSettings.resourceUpgradeAmount} max value
                </p>

                <div className="space-y-3">
                  {storyData.resources.map((resource) => (
                    <div
                      key={resource.name}
                      className={`flex items-center justify-between p-3 rounded-lg cursor-pointer transition-all border-2 ${
                        selectedResource === resource.name
                          ? "bg-green-100 dark:bg-green-900/40 border-green-500"
                          : "bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600 hover:border-green-300"
                      }`}
                      onClick={() => setSelectedResource(resource.name)}
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">{resource.symbol}</span>
                        <div>
                          <p className="font-bold text-gray-900 dark:text-white">
                            {resource.name}
                          </p>
                          <p className="text-xs text-gray-600 dark:text-gray-400">
                            {resource.description}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-bold text-green-600 dark:text-green-400">
                          {resource.value}/{resource.maxValue}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
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
            <div className="p-6 rounded-lg bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800">
              <h3 className="text-xl font-bold mb-4 flex items-center gap-2 text-gray-900 dark:text-white">
                <span className="text-2xl">🎒</span>
                Add Custom Item
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                Cost:{" "}
                <span className="font-bold text-purple-600 dark:text-purple-400">
                  {upgradeSettings.addItemCost} points
                </span>{" "}
                per item
              </p>

              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">
                    Item Name
                  </label>
                  <input
                    type="text"
                    value={newItemName}
                    onChange={(e) => setNewItemName(e.target.value)}
                    placeholder="e.g., Magic Sword, Health Potion"
                    className="w-full px-4 py-2 rounded-lg border-2 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:border-purple-500 dark:focus:border-purple-400"
                    maxLength={50}
                  />
                </div>

                <div>
                  <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">
                    Description (Optional)
                  </label>
                  <textarea
                    value={newItemDescription}
                    onChange={(e) => setNewItemDescription(e.target.value)}
                    placeholder="Describe the item..."
                    className="w-full px-4 py-2 rounded-lg border-2 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:border-purple-500 dark:focus:border-purple-400 resize-none"
                    rows={2}
                    maxLength={200}
                  />
                </div>

                <div>
                  <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">
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
                    className="w-full px-4 py-2 rounded-lg border-2 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:border-purple-500 dark:focus:border-purple-400"
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
              <div className="p-6 rounded-lg bg-cyan-50 dark:bg-cyan-900/20 border border-cyan-200 dark:border-cyan-800">
                <h3 className="text-xl font-bold mb-4 flex items-center gap-2 text-gray-900 dark:text-white">
                  <span className="text-2xl">🏪</span>
                  Stat Shop
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
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
                            ? "bg-gray-100 dark:bg-gray-700/50 border-gray-300 dark:border-gray-600 opacity-60"
                            : "bg-white dark:bg-gray-700 border-cyan-300 dark:border-cyan-700"
                        }`}
                      >
                        <div className="flex items-center gap-3 flex-1">
                          <span className="text-2xl">{shopStat.symbol}</span>
                          <div>
                            <p className="font-bold text-gray-900 dark:text-white">
                              {shopStat.name}
                              {alreadyOwned && (
                                <span className="ml-2 text-xs text-green-600 dark:text-green-400">
                                  ✓ Owned
                                </span>
                              )}
                            </p>
                            <p className="text-xs text-gray-600 dark:text-gray-400">
                              {shopStat.description}
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                              Starting value: {shopStat.startingValue}
                            </p>
                          </div>
                        </div>
                        <button
                          onClick={() => handleBuyShopStat(shopStat)}
                          disabled={
                            alreadyOwned || storyData.points < shopStat.cost
                          }
                          className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors"
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
              <div className="p-6 rounded-lg bg-teal-50 dark:bg-teal-900/20 border border-teal-200 dark:border-teal-800">
                <h3 className="text-xl font-bold mb-4 flex items-center gap-2 text-gray-900 dark:text-white">
                  <span className="text-2xl">🛒</span>
                  Resource Shop
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
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
                            ? "bg-gray-100 dark:bg-gray-700/50 border-gray-300 dark:border-gray-600 opacity-60"
                            : "bg-white dark:bg-gray-700 border-teal-300 dark:border-teal-700"
                        }`}
                      >
                        <div className="flex items-center gap-3 flex-1">
                          <span className="text-2xl">
                            {shopResource.symbol}
                          </span>
                          <div>
                            <p className="font-bold text-gray-900 dark:text-white">
                              {shopResource.name}
                              {alreadyOwned && (
                                <span className="ml-2 text-xs text-green-600 dark:text-green-400">
                                  ✓ Owned
                                </span>
                              )}
                            </p>
                            <p className="text-xs text-gray-600 dark:text-gray-400">
                              {shopResource.description}
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
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
                          className="px-4 py-2 bg-teal-600 hover:bg-teal-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors"
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
              <div className="p-6 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                <h3 className="text-xl font-bold mb-4 flex items-center gap-2 text-gray-900 dark:text-white">
                  <span className="text-2xl">🏬</span>
                  Item Shop
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                  Purchase items curated by the adventure author
                </p>

                <div className="space-y-3">
                  {upgradeSettings.itemShop.map((shopItem, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between p-4 rounded-lg border-2 bg-white dark:bg-gray-700 border-amber-300 dark:border-amber-700"
                    >
                      <div className="flex items-center gap-3 flex-1">
                        <span className="text-2xl">{shopItem.symbol}</span>
                        <div>
                          <p className="font-bold text-gray-900 dark:text-white">
                            {shopItem.name}
                          </p>
                          <p className="text-xs text-gray-600 dark:text-gray-400">
                            {shopItem.description}
                          </p>
                          <div className="flex gap-2 mt-1">
                            <span className="text-xs px-2 py-0.5 bg-amber-200 dark:bg-amber-800 text-amber-900 dark:text-amber-100 rounded-full">
                              {shopItem.type}
                            </span>
                            <span className="text-xs px-2 py-0.5 bg-gray-200 dark:bg-gray-600 text-gray-900 dark:text-gray-100 rounded-full">
                              ×{shopItem.quantity}
                            </span>
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => handleBuyShopItem(shopItem)}
                        disabled={storyData.points < shopItem.cost}
                        className="px-4 py-2 bg-amber-600 hover:bg-amber-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors"
                      >
                        {shopItem.cost} pts
                      </button>
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
