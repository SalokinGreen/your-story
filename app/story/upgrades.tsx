"use client";

import { StoryData, UPGRADE_COSTS } from "../misc/structs";
import { useState } from "react";

interface UpgradesPageProps {
  storyData: StoryData;
  onPurchase: (cost: number, callback: () => void) => void;
}

export default function UpgradesPage({ storyData, onPurchase }: UpgradesPageProps) {
  const [selectedStat, setSelectedStat] = useState<string>("");
  const [selectedResource, setSelectedResource] = useState<string>("");
  const [newItemName, setNewItemName] = useState("");
  const [newItemDescription, setNewItemDescription] = useState("");

  const handleStatUpgrade = () => {
    if (!selectedStat) return;
    
    onPurchase(UPGRADE_COSTS.STAT_INCREASE, () => {
      const stat = storyData.stats.find(s => s.name === selectedStat);
      if (stat && stat.value < 100) {
        stat.value = Math.min(100, stat.value + 1);
      }
    });
  };

  const handleResourceUpgrade = () => {
    if (!selectedResource) return;
    
    onPurchase(UPGRADE_COSTS.RESOURCE_MAX_INCREASE, () => {
      const resource = storyData.resources.find(r => r.name === selectedResource);
      if (resource) {
        resource.maxValue += 10;
        resource.value = Math.min(resource.value + 10, resource.maxValue);
      }
    });
  };

  const handleAddItem = () => {
    if (!newItemName.trim()) return;
    
    onPurchase(UPGRADE_COSTS.ADD_ITEM, () => {
      storyData.inventory.push({
        name: newItemName,
        quantity: 1,
        description: newItemDescription || "A useful item",
        type: "misc",
        symbol: "📦"
      });
      setNewItemName("");
      setNewItemDescription("");
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
            <h3 className="text-sm font-bold text-blue-900 dark:text-blue-200 mb-2">💡 How to Earn Points:</h3>
            <ul className="text-xs text-blue-800 dark:text-blue-300 space-y-1">
              <li>• Complete Story Beats: <span className="font-semibold">{UPGRADE_COSTS.BEAT_REWARD} points</span></li>
              <li>• Finish Chapters: <span className="font-semibold">{UPGRADE_COSTS.CHAPTER_REWARD} points</span></li>
              <li>• Unlock Achievements: <span className="font-semibold">Points vary by achievement</span></li>
            </ul>
          </div>

          {/* Upgrade Stats */}
          <div className="p-6 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
            <h3 className="text-xl font-bold mb-4 flex items-center gap-2 text-gray-900 dark:text-white">
              <span className="text-2xl">📊</span>
              Upgrade Stats
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              Cost: <span className="font-bold text-blue-600 dark:text-blue-400">{UPGRADE_COSTS.STAT_INCREASE} points</span> per +1 stat point
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
                      <p className="font-bold text-gray-900 dark:text-white">{stat.name}</p>
                      <p className="text-xs text-gray-600 dark:text-gray-400">{stat.description}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold text-blue-600 dark:text-blue-400">{stat.value}/100</p>
                    {stat.value < 100 && (
                      <p className="text-xs text-gray-500 dark:text-gray-400">→ {stat.value + 1}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <button
              onClick={handleStatUpgrade}
              disabled={!selectedStat || storyData.points < UPGRADE_COSTS.STAT_INCREASE || 
                       (storyData.stats.find(s => s.name === selectedStat)?.value ?? 100) >= 100}
              className="w-full mt-4 px-6 py-3 font-bold rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed bg-blue-600 text-white hover:bg-blue-700 disabled:hover:bg-blue-600"
            >
              Upgrade Selected Stat ({UPGRADE_COSTS.STAT_INCREASE} points)
            </button>
          </div>

          {/* Upgrade Resources */}
          <div className="p-6 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
            <h3 className="text-xl font-bold mb-4 flex items-center gap-2 text-gray-900 dark:text-white">
              <span className="text-2xl">⚡</span>
              Upgrade Resources
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              Cost: <span className="font-bold text-green-600 dark:text-green-400">{UPGRADE_COSTS.RESOURCE_MAX_INCREASE} points</span> per +10 max value
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
                      <p className="font-bold text-gray-900 dark:text-white">{resource.name}</p>
                      <p className="text-xs text-gray-600 dark:text-gray-400">{resource.description}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold text-green-600 dark:text-green-400">
                      {resource.value}/{resource.maxValue}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">→ Max {resource.maxValue + 10}</p>
                  </div>
                </div>
              ))}
            </div>

            <button
              onClick={handleResourceUpgrade}
              disabled={!selectedResource || storyData.points < UPGRADE_COSTS.RESOURCE_MAX_INCREASE}
              className="w-full mt-4 px-6 py-3 font-bold rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed bg-green-600 text-white hover:bg-green-700 disabled:hover:bg-green-600"
            >
              Upgrade Selected Resource ({UPGRADE_COSTS.RESOURCE_MAX_INCREASE} points)
            </button>
          </div>

          {/* Add Custom Item */}
          <div className="p-6 rounded-lg bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800">
            <h3 className="text-xl font-bold mb-4 flex items-center gap-2 text-gray-900 dark:text-white">
              <span className="text-2xl">🎒</span>
              Add Custom Item
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              Cost: <span className="font-bold text-purple-600 dark:text-purple-400">{UPGRADE_COSTS.ADD_ITEM} points</span> per item
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
            </div>

            <button
              onClick={handleAddItem}
              disabled={!newItemName.trim() || storyData.points < UPGRADE_COSTS.ADD_ITEM}
              className="w-full mt-4 px-6 py-3 font-bold rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed bg-purple-600 text-white hover:bg-purple-700 disabled:hover:bg-purple-600"
            >
              Add Item to Inventory ({UPGRADE_COSTS.ADD_ITEM} points)
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}
