"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  StoryData,
  Stat,
  Resource,
  InventoryItem,
  UpgradeSettings,
  DEFAULT_UPGRADE_SETTINGS,
} from "@/app/misc/structs";
import { useAuth } from "@/app/misc/AuthContext";
import { useNotification } from "@/app/misc/NotificationContext";
import { DynamicIcon } from "@/app/components/DynamicIcon";

type WizardStep = "name" | "points" | "review";

function CreateCharacterContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const { addNotification } = useNotification();

  const storyId = searchParams?.get("storyId");
  const [loading, setLoading] = useState(true);
  const [storyData, setStoryData] = useState<StoryData | null>(null);

  // Wizard state
  const [currentStep, setCurrentStep] = useState<WizardStep>("name");

  // Character customization state
  const [characterName, setCharacterName] = useState("");
  const [characterDescription, setCharacterDescription] = useState("");
  const [stats, setStats] = useState<Stat[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [upgradeSettings, setUpgradeSettings] = useState<UpgradeSettings>(
    DEFAULT_UPGRADE_SETTINGS
  );

  // Points allocation state
  const [initialPoints, setInitialPoints] = useState(20); // Default, will be updated from story data
  const [remainingPoints, setRemainingPoints] = useState(20);

  // Shop purchases tracking
  const [purchasedStats, setPurchasedStats] = useState<Stat[]>([]);
  const [purchasedResources, setPurchasedResources] = useState<Resource[]>([]);
  const [purchasedItems, setPurchasedItems] = useState<InventoryItem[]>([]);

  // Load story data
  useEffect(() => {
    if (!storyId) {
      addNotification("No story ID provided", "failure");
      router.push("/library");
      return;
    }

    async function loadStory() {
      try {
        setLoading(true);

        // Null check for storyId
        if (!storyId) {
          addNotification("No story ID provided", "failure");
          router.push("/library");
          return;
        }

        // Check if it's a local story
        const isLocal = storyId.startsWith("local_");

        if (isLocal) {
          const { getLocalStory } = await import(
            "@/app/misc/localStoryManager"
          );
          const localStory = await getLocalStory(storyId);

          if (!localStory) {
            addNotification("Story not found", "failure");
            router.push("/library");
            return;
          }

          // LocalStory has the story data in the storyData property
          const data = localStory.storyData;
          setStoryData(data);
          // Initialize character data from story template
          setCharacterName(data.player_name || "");
          setCharacterDescription(data.player_summary || "An adventurer");
          setStats(JSON.parse(JSON.stringify(data.stats || [])));
          setResources(JSON.parse(JSON.stringify(data.resources || [])));
          setInventory(JSON.parse(JSON.stringify(data.inventory || [])));
          setUpgradeSettings(data.upgradeSettings || DEFAULT_UPGRADE_SETTINGS);
          // Set starting points from adventure data
          const startingPoints = data.points || 20;
          setInitialPoints(startingPoints);
          setRemainingPoints(startingPoints);
        } else {
          // Load from database
          const { getAuthToken } = await import("@/app/misc/getAuthToken");
          const token = await getAuthToken();

          if (!token) {
            addNotification("Not authenticated", "failure");
            router.push("/");
            return;
          }

          const response = await fetch(`/api/stories/${storyId}`, {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          });

          if (!response.ok) {
            throw new Error("Failed to load story");
          }

          const { story } = await response.json();

          // The API returns story.storyData which contains the StoryData
          if (!story || !story.storyData) {
            throw new Error("Invalid story data format");
          }

          const storyDataToUse = story.storyData;

          setStoryData(storyDataToUse);
          // Initialize character data from story template
          setCharacterName(storyDataToUse.player_name || "");
          setCharacterDescription(
            storyDataToUse.player_summary || "An adventurer"
          );
          setStats(JSON.parse(JSON.stringify(storyDataToUse.stats || [])));
          setResources(
            JSON.parse(JSON.stringify(storyDataToUse.resources || []))
          );
          setInventory(
            JSON.parse(JSON.stringify(storyDataToUse.inventory || []))
          );
          setUpgradeSettings(
            storyDataToUse.upgradeSettings || DEFAULT_UPGRADE_SETTINGS
          );
          // Set starting points from adventure data
          const startingPoints = storyDataToUse.points || 20;
          setInitialPoints(startingPoints);
          setRemainingPoints(startingPoints);
        }
      } catch (error: any) {
        console.error("Error loading story:", error);
        addNotification(`Failed to load story: ${error.message}`, "failure");
        router.push("/library");
      } finally {
        setLoading(false);
      }
    }

    loadStory();
  }, [storyId, addNotification, router]);

  // Handle stat increase
  const handleStatIncrease = (index: number) => {
    const cost = upgradeSettings.statUpgradeCost;
    if (remainingPoints < cost) {
      addNotification("Not enough points!", "warning");
      return;
    }

    const newStats = [...stats];
    newStats[index] = {
      ...newStats[index],
      value: newStats[index].value + upgradeSettings.statUpgradeAmount,
    };
    setStats(newStats);
    setRemainingPoints(remainingPoints - cost);
  };

  // Handle stat decrease
  const handleStatDecrease = (index: number) => {
    const refund = upgradeSettings.statUpgradeCost;
    const originalValue = storyData?.stats?.[index]?.value || 0;

    if (stats[index].value <= originalValue) {
      addNotification("Cannot decrease below starting value", "warning");
      return;
    }

    const newStats = [...stats];
    newStats[index] = {
      ...newStats[index],
      value: newStats[index].value - upgradeSettings.statUpgradeAmount,
    };
    setStats(newStats);
    setRemainingPoints(remainingPoints + refund);
  };

  // Handle resource increase
  const handleResourceIncrease = (index: number) => {
    const cost = upgradeSettings.resourceUpgradeCost;
    if (remainingPoints < cost) {
      addNotification("Not enough points!", "warning");
      return;
    }

    const newResources = [...resources];
    const maxValue = newResources[index].maxValue;
    if (
      newResources[index].maxValue >=
      maxValue + upgradeSettings.resourceUpgradeAmount
    ) {
      addNotification("Resource at maximum!", "warning");
      return;
    }

    newResources[index] = {
      ...newResources[index],
      value: newResources[index].value + upgradeSettings.resourceUpgradeAmount,
      maxValue:
        newResources[index].maxValue + upgradeSettings.resourceUpgradeAmount,
    };
    setResources(newResources);
    setRemainingPoints(remainingPoints - cost);
  };

  // Handle resource decrease
  const handleResourceDecrease = (index: number) => {
    const refund = upgradeSettings.resourceUpgradeCost;
    const originalValue = storyData?.resources?.[index]?.value || 0;
    const originalMaxValue = storyData?.resources?.[index]?.maxValue || 0;

    if (
      resources[index].value <= originalValue ||
      resources[index].maxValue <= originalMaxValue
    ) {
      addNotification("Cannot decrease below starting value", "warning");
      return;
    }

    const newResources = [...resources];
    newResources[index] = {
      ...newResources[index],
      value: newResources[index].value - upgradeSettings.resourceUpgradeAmount,
      maxValue:
        newResources[index].maxValue - upgradeSettings.resourceUpgradeAmount,
    };
    setResources(newResources);
    setRemainingPoints(remainingPoints + refund);
  };

  // Handle shop stat purchase
  const handlePurchaseStat = (shopStat: any) => {
    if (remainingPoints < shopStat.cost) {
      addNotification("Not enough points!", "warning");
      return;
    }

    const newStat: Stat = {
      name: shopStat.name,
      value: shopStat.startingValue,
      description: shopStat.description,
      symbol: shopStat.symbol,
      custom_symbol_url: shopStat.custom_symbol_url,
    };

    setPurchasedStats([...purchasedStats, newStat]);
    setRemainingPoints(remainingPoints - shopStat.cost);
    addNotification(`Unlocked ${shopStat.name}!`, "success");
  };

  // Handle shop resource purchase
  const handlePurchaseResource = (shopResource: any) => {
    if (remainingPoints < shopResource.cost) {
      addNotification("Not enough points!", "warning");
      return;
    }

    const newResource: Resource = {
      name: shopResource.name,
      value: shopResource.startingValue,
      maxValue: shopResource.startingMaxValue,
      description: shopResource.description,
      symbol: shopResource.symbol,
      custom_symbol_url: shopResource.custom_symbol_url,
    };

    setPurchasedResources([...purchasedResources, newResource]);
    setRemainingPoints(remainingPoints - shopResource.cost);
    addNotification(`Unlocked ${shopResource.name}!`, "success");
  };

  // Handle shop item purchase
  const handlePurchaseItem = (shopItem: any) => {
    if (remainingPoints < shopItem.cost) {
      addNotification("Not enough points!", "warning");
      return;
    }

    const newItem: InventoryItem = {
      name: shopItem.name,
      description: shopItem.description,
      symbol: shopItem.symbol,
      type: shopItem.type,
      quantity: shopItem.quantity,
    };

    setPurchasedItems([...purchasedItems, newItem]);
    setRemainingPoints(remainingPoints - shopItem.cost);
    addNotification(`Purchased ${shopItem.name}!`, "success");
  };

  // Handle begin story
  const handleBeginStory = async () => {
    if (!storyData || !storyId) return;

    try {
      // Combine base stats/resources with purchased ones
      const finalStats = [...stats, ...purchasedStats];
      const finalResources = [...resources, ...purchasedResources];
      const finalInventory = [...inventory, ...purchasedItems];

      // Update story data with custom character and initialize scene
      const updatedStoryData: StoryData = {
        ...storyData,
        player_name: characterName,
        player_summary: characterDescription,
        stats: finalStats,
        resources: finalResources,
        inventory: finalInventory,
        selected_preset: "custom",
        scene: {
          parts: [
            {
              content: storyData.intro,
              imageUrl: "",
              user: false,
              role: "assistant",
              choices: [{ text: "Start Story" }],
            },
          ],
        },
      };

      // Save to database or local storage
      const isLocal = storyId.startsWith("local_");

      if (isLocal) {
        const { saveLocalStory } = await import("@/app/misc/localStoryManager");
        await saveLocalStory(storyId, updatedStoryData);
      } else {
        const { getAuthToken } = await import("@/app/misc/getAuthToken");
        const token = await getAuthToken();

        if (!token) {
          addNotification("Not authenticated", "failure");
          return;
        }

        const response = await fetch(`/api/stories/${storyId}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            storyData: updatedStoryData,
            selectedPreset: "custom",
          }),
        });

        if (!response.ok) {
          throw new Error("Failed to save character");
        }

        // Parse response to get server timestamp
        const result = await response.json().catch(() => null);

        // Also save to local cache for offline-first loading
        const { saveLocalStory } = await import("@/app/misc/localStoryManager");
        await saveLocalStory(storyId, updatedStoryData, null, {
          serverUpdatedAt:
            result?.story?.updated_at || new Date().toISOString(),
          markAsSynced: true,
          isLocalEdit: true,
        });
      }

      addNotification("Character created! 🎉", "success");
      router.push(`/story?storyId=${storyId}`);
    } catch (error: any) {
      console.error("Error saving character:", error);
      addNotification(`Failed to save: ${error.message}`, "failure");
    }
  };

  // Validation
  const canProceedFromName = characterName.trim().length > 0;
  const canProceedFromPoints = true; // Can always proceed (spending all points optional)

  if (loading) {
    return (
      <div className="min-h-screen bg-linear-to-br from-blue-50 via-purple-50 to-pink-50 dark:from-gray-900 dark:via-purple-900 dark:to-blue-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-4 border-purple-600 border-t-transparent mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">
            Loading character creation...
          </p>
        </div>
      </div>
    );
  }

  if (!storyData) {
    return (
      <div className="min-h-screen bg-linear-to-br from-blue-50 via-purple-50 to-pink-50 dark:from-gray-900 dark:via-purple-900 dark:to-blue-900 flex items-center justify-center">
        <div className="text-center">
          <DynamicIcon
            name="AlertCircle"
            className="w-16 h-16 text-red-500 mx-auto mb-4"
          />
          <p className="text-gray-900 dark:text-white text-xl font-bold">
            Story not found
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-linear-to-br from-blue-50 via-purple-50 to-pink-50 dark:from-gray-900 dark:via-purple-900 dark:to-blue-900 py-8 px-4 sm:px-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="bg-white dark:bg-blue-950 rounded-2xl shadow-xl p-6 sm:p-8 border border-gray-200 dark:border-gray-700 mb-6">
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white mb-2">
            Create Your Character
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            {storyData.story_name}
          </p>

          {/* Progress Bar */}
          <div className="mt-6 flex items-center gap-2">
            <div
              className={`flex-1 h-2 rounded-full ${
                currentStep === "name" ||
                currentStep === "points" ||
                currentStep === "review"
                  ? "bg-purple-600"
                  : "bg-gray-300 dark:bg-gray-700"
              }`}
            />
            <div
              className={`flex-1 h-2 rounded-full ${
                currentStep === "points" || currentStep === "review"
                  ? "bg-purple-600"
                  : "bg-gray-300 dark:bg-gray-700"
              }`}
            />
            <div
              className={`flex-1 h-2 rounded-full ${
                currentStep === "review"
                  ? "bg-purple-600"
                  : "bg-gray-300 dark:bg-gray-700"
              }`}
            />
          </div>
          <div className="mt-2 flex justify-between text-sm text-gray-600 dark:text-gray-400">
            <span
              className={
                currentStep === "name"
                  ? "font-bold text-purple-600 dark:text-purple-400"
                  : ""
              }
            >
              1. Name & Description
            </span>
            <span
              className={
                currentStep === "points"
                  ? "font-bold text-purple-600 dark:text-purple-400"
                  : ""
              }
            >
              2. Point Allocation
            </span>
            <span
              className={
                currentStep === "review"
                  ? "font-bold text-purple-600 dark:text-purple-400"
                  : ""
              }
            >
              3. Review & Begin
            </span>
          </div>
        </div>

        {/* Step Content */}
        <div className="bg-white dark:bg-blue-950 rounded-2xl shadow-xl p-6 sm:p-8 border border-gray-200 dark:border-gray-700">
          {/* Step 1: Name & Description */}
          {currentStep === "name" && (
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                  <DynamicIcon name="User" className="w-8 h-8" />
                  Name & Description
                </h2>
                <p className="text-gray-600 dark:text-gray-400 mb-6">
                  Choose a name and describe your character. This will be used
                  throughout your adventure.
                </p>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                  Character Name *
                </label>
                <input
                  type="text"
                  value={characterName}
                  onChange={(e) => setCharacterName(e.target.value)}
                  placeholder="Enter character name..."
                  className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                  Character Description
                </label>
                <textarea
                  value={characterDescription}
                  onChange={(e) => setCharacterDescription(e.target.value)}
                  placeholder="Describe your character's appearance, personality, or background..."
                  rows={4}
                  className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none"
                />
              </div>

              <div className="flex justify-between pt-4">
                <button
                  onClick={() => router.push("/library")}
                  className="px-6 py-3 bg-gray-500 hover:bg-gray-600 text-white font-semibold rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => setCurrentStep("points")}
                  disabled={!canProceedFromName}
                  className="px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  Next: Point Allocation
                  <DynamicIcon name="ArrowRight" className="w-5 h-5" />
                </button>
              </div>
            </div>
          )}

          {/* Step 2: Point Allocation */}
          {currentStep === "points" && (
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                  <DynamicIcon name="Zap" className="w-8 h-8" />
                  Point Allocation
                </h2>
                <p className="text-gray-600 dark:text-gray-400 mb-2">
                  Customize your character's stats and resources. You don't have
                  to spend all points.
                </p>
                <div className="inline-block px-4 py-2 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 font-bold rounded-lg">
                  Remaining Points: {remainingPoints}
                </div>
              </div>

              {/* Existing Stats */}
              {upgradeSettings.allowStatUpgrade && stats.length > 0 && (
                <div>
                  <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                    Character Stats
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                    {upgradeSettings.statUpgradeCost} points per +
                    {upgradeSettings.statUpgradeAmount} increase
                  </p>
                  <div className="space-y-3">
                    {stats.map((stat, index) => (
                      <div
                        key={index}
                        className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-900/50 rounded-lg border border-gray-200 dark:border-gray-700"
                      >
                        <div className="flex-1">
                          <div className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                            <DynamicIcon
                              name={stat.symbol}
                              className="w-5 h-5"
                            />
                            {stat.name}
                          </div>
                          <div className="text-sm text-gray-600 dark:text-gray-400">
                            Base: {storyData.stats?.[index]?.value || 0}
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => handleStatDecrease(index)}
                            disabled={
                              stat.value <=
                              (storyData.stats?.[index]?.value || 0)
                            }
                            className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white font-bold rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                          >
                            −
                          </button>
                          <div className="text-2xl font-bold text-gray-900 dark:text-white min-w-12 text-center">
                            {stat.value}
                          </div>
                          <button
                            onClick={() => handleStatIncrease(index)}
                            disabled={
                              remainingPoints < upgradeSettings.statUpgradeCost
                            }
                            className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white font-bold rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Stat Shop */}
              {upgradeSettings.statShopEnabled &&
                upgradeSettings.statShop.length > 0 && (
                  <div>
                    <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                      Unlock New Stats
                    </h3>
                    <div className="space-y-3">
                      {upgradeSettings.statShop.map((shopStat, index) => {
                        const alreadyPurchased = purchasedStats.some(
                          (s) => s.name === shopStat.name
                        );
                        return (
                          <div
                            key={index}
                            className={`flex items-center justify-between p-4 rounded-lg border ${
                              alreadyPurchased
                                ? "bg-green-50 dark:bg-green-900/20 border-green-300 dark:border-green-700"
                                : "bg-purple-50 dark:bg-purple-900/20 border-purple-300 dark:border-purple-700"
                            }`}
                          >
                            <div className="flex-1">
                              <div className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                                <DynamicIcon
                                  name={shopStat.symbol}
                                  className="w-5 h-5"
                                />
                                {shopStat.name}
                                {alreadyPurchased && (
                                  <span className="text-xs px-2 py-0.5 bg-green-600 text-white rounded-full">
                                    Unlocked
                                  </span>
                                )}
                              </div>
                              <div className="text-sm text-gray-600 dark:text-gray-400">
                                {shopStat.description}
                              </div>
                              <div className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                                Starting value: {shopStat.startingValue}
                              </div>
                            </div>
                            <button
                              onClick={() => handlePurchaseStat(shopStat)}
                              disabled={
                                remainingPoints < shopStat.cost ||
                                alreadyPurchased
                              }
                              className="ml-4 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed whitespace-nowrap"
                            >
                              {alreadyPurchased
                                ? "✓ Unlocked"
                                : `${shopStat.cost} pts`}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

              {/* Existing Resources */}
              {upgradeSettings.allowResourceUpgrade && resources.length > 0 && (
                <div>
                  <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                    Resources
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                    {upgradeSettings.resourceUpgradeCost} points per +
                    {upgradeSettings.resourceUpgradeAmount} increase
                  </p>
                  <div className="space-y-3">
                    {resources.map((resource, index) => (
                      <div
                        key={index}
                        className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-900/50 rounded-lg border border-gray-200 dark:border-gray-700"
                      >
                        <div className="flex-1">
                          <div className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                            <DynamicIcon
                              name={resource.symbol}
                              className="w-5 h-5"
                            />
                            {resource.name}
                          </div>
                          <div className="text-sm text-gray-600 dark:text-gray-400">
                            Base: {storyData.resources?.[index]?.value || 0} /{" "}
                            {storyData.resources?.[index]?.maxValue || 0}
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => handleResourceDecrease(index)}
                            disabled={
                              resource.value <=
                                (storyData.resources?.[index]?.value || 0) ||
                              resource.maxValue <=
                                (storyData.resources?.[index]?.maxValue || 0)
                            }
                            className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white font-bold rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                          >
                            −
                          </button>
                          <div className="text-center min-w-20">
                            <div className="text-2xl font-bold text-gray-900 dark:text-white">
                              {resource.value}
                            </div>
                            <div className="text-xs text-gray-600 dark:text-gray-400">
                              / {resource.maxValue}
                            </div>
                          </div>
                          <button
                            onClick={() => handleResourceIncrease(index)}
                            disabled={
                              remainingPoints <
                              upgradeSettings.resourceUpgradeCost
                            }
                            className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white font-bold rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Resource Shop */}
              {upgradeSettings.resourceShopEnabled &&
                upgradeSettings.resourceShop.length > 0 && (
                  <div>
                    <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                      Unlock New Resources
                    </h3>
                    <div className="space-y-3">
                      {upgradeSettings.resourceShop.map(
                        (shopResource, index) => {
                          const alreadyPurchased = purchasedResources.some(
                            (r) => r.name === shopResource.name
                          );
                          return (
                            <div
                              key={index}
                              className={`flex items-center justify-between p-4 rounded-lg border ${
                                alreadyPurchased
                                  ? "bg-green-50 dark:bg-green-900/20 border-green-300 dark:border-green-700"
                                  : "bg-purple-50 dark:bg-purple-900/20 border-purple-300 dark:border-purple-700"
                              }`}
                            >
                              <div className="flex-1">
                                <div className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                                  <DynamicIcon
                                    name={shopResource.symbol}
                                    className="w-5 h-5"
                                  />
                                  {shopResource.name}
                                  {alreadyPurchased && (
                                    <span className="text-xs px-2 py-0.5 bg-green-600 text-white rounded-full">
                                      Unlocked
                                    </span>
                                  )}
                                </div>
                                <div className="text-sm text-gray-600 dark:text-gray-400">
                                  {shopResource.description}
                                </div>
                                <div className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                                  Starting: {shopResource.startingValue} /{" "}
                                  {shopResource.startingMaxValue}
                                </div>
                              </div>
                              <button
                                onClick={() =>
                                  handlePurchaseResource(shopResource)
                                }
                                disabled={
                                  remainingPoints < shopResource.cost ||
                                  alreadyPurchased
                                }
                                className="ml-4 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed whitespace-nowrap"
                              >
                                {alreadyPurchased
                                  ? "✓ Unlocked"
                                  : `${shopResource.cost} pts`}
                              </button>
                            </div>
                          );
                        }
                      )}
                    </div>
                  </div>
                )}

              {/* Item Shop */}
              {upgradeSettings.itemShopEnabled &&
                upgradeSettings.itemShop.length > 0 && (
                  <div>
                    <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                      Purchase Items
                    </h3>
                    <div className="space-y-3">
                      {upgradeSettings.itemShop.map((shopItem, index) => {
                        const purchaseCount = purchasedItems.filter(
                          (i) => i.name === shopItem.name
                        ).length;
                        return (
                          <div
                            key={index}
                            className="flex items-center justify-between p-4 rounded-lg border bg-purple-50 dark:bg-purple-900/20 border-purple-300 dark:border-purple-700"
                          >
                            <div className="flex-1">
                              <div className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                                <DynamicIcon
                                  name={shopItem.symbol}
                                  className="w-5 h-5"
                                />
                                {shopItem.name}
                                {purchaseCount > 0 && (
                                  <span className="text-xs px-2 py-0.5 bg-green-600 text-white rounded-full">
                                    x{purchaseCount}
                                  </span>
                                )}
                              </div>
                              <div className="text-sm text-gray-600 dark:text-gray-400">
                                {shopItem.description}
                              </div>
                              <div className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                                Type: {shopItem.type} • Quantity:{" "}
                                {shopItem.quantity}
                              </div>
                            </div>
                            <button
                              onClick={() => handlePurchaseItem(shopItem)}
                              disabled={remainingPoints < shopItem.cost}
                              className="ml-4 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed whitespace-nowrap"
                            >
                              {shopItem.cost} pts
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

              <div className="flex justify-between pt-4">
                <button
                  onClick={() => setCurrentStep("name")}
                  className="px-6 py-3 bg-gray-500 hover:bg-gray-600 text-white font-semibold rounded-lg transition-colors flex items-center gap-2"
                >
                  <DynamicIcon name="ArrowLeft" className="w-5 h-5" />
                  Back
                </button>
                <button
                  onClick={() => setCurrentStep("review")}
                  disabled={!canProceedFromPoints}
                  className="px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  Next: Review
                  <DynamicIcon name="ArrowRight" className="w-5 h-5" />
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Review & Begin */}
          {currentStep === "review" && (
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                  <DynamicIcon name="Eye" className="w-8 h-8" />
                  Review Your Character
                </h2>
                <p className="text-gray-600 dark:text-gray-400 mb-6">
                  Review your character before beginning the adventure. You can
                  go back to make changes.
                </p>
              </div>

              {/* Character Summary */}
              <div className="bg-purple-50 dark:bg-purple-900/20 rounded-xl p-6 border border-purple-200 dark:border-purple-800">
                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-3">
                  {characterName}
                </h3>
                <p className="text-gray-700 dark:text-gray-300 mb-4">
                  {characterDescription}
                </p>

                {(stats.length > 0 || purchasedStats.length > 0) && (
                  <div className="mb-4">
                    <h4 className="font-semibold text-gray-900 dark:text-white mb-2">
                      Stats:
                    </h4>
                    <div className="grid grid-cols-2 gap-2">
                      {stats.map((stat, index) => (
                        <div
                          key={index}
                          className="flex justify-between text-sm"
                        >
                          <span className="text-gray-700 dark:text-gray-300 flex items-center gap-2">
                            <DynamicIcon
                              name={stat.symbol}
                              className="w-4 h-4"
                            />
                            {stat.name}:
                          </span>
                          <span className="font-bold text-gray-900 dark:text-white">
                            {stat.value}
                            {stat.value >
                              (storyData.stats?.[index]?.value || 0) && (
                              <span className="text-green-600 dark:text-green-400 ml-1">
                                (+
                                {stat.value -
                                  (storyData.stats?.[index]?.value || 0)}
                                )
                              </span>
                            )}
                          </span>
                        </div>
                      ))}
                      {purchasedStats.map((stat, index) => (
                        <div
                          key={`purchased-${index}`}
                          className="flex justify-between text-sm"
                        >
                          <span className="text-gray-700 dark:text-gray-300 flex items-center gap-2">
                            <DynamicIcon
                              name={stat.symbol}
                              className="w-4 h-4"
                            />
                            {stat.name}:
                          </span>
                          <span className="font-bold text-gray-900 dark:text-white">
                            {stat.value}
                            <span className="text-purple-600 dark:text-purple-400 ml-1">
                              ✨
                            </span>
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {(resources.length > 0 || purchasedResources.length > 0) && (
                  <div className="mb-4">
                    <h4 className="font-semibold text-gray-900 dark:text-white mb-2">
                      Resources:
                    </h4>
                    <div className="grid grid-cols-2 gap-2">
                      {resources.map((resource, index) => (
                        <div
                          key={index}
                          className="flex justify-between text-sm"
                        >
                          <span className="text-gray-700 dark:text-gray-300 flex items-center gap-2">
                            <DynamicIcon
                              name={resource.symbol}
                              className="w-4 h-4"
                            />
                            {resource.name}:
                          </span>
                          <span className="font-bold text-gray-900 dark:text-white">
                            {resource.value} / {resource.maxValue}
                            {(resource.value >
                              (storyData.resources?.[index]?.value || 0) ||
                              resource.maxValue >
                                (storyData.resources?.[index]?.maxValue ||
                                  0)) && (
                              <span className="text-green-600 dark:text-green-400 ml-1">
                                (+
                                {resource.maxValue -
                                  (storyData.resources?.[index]?.maxValue || 0)}
                                )
                              </span>
                            )}
                          </span>
                        </div>
                      ))}
                      {purchasedResources.map((resource, index) => (
                        <div
                          key={`purchased-${index}`}
                          className="flex justify-between text-sm"
                        >
                          <span className="text-gray-700 dark:text-gray-300 flex items-center gap-2">
                            <DynamicIcon
                              name={resource.symbol}
                              className="w-4 h-4"
                            />
                            {resource.name}:
                          </span>
                          <span className="font-bold text-gray-900 dark:text-white">
                            {resource.value} / {resource.maxValue}
                            <span className="text-purple-600 dark:text-purple-400 ml-1">
                              ✨
                            </span>
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {purchasedItems.length > 0 && (
                  <div className="mb-4">
                    <h4 className="font-semibold text-gray-900 dark:text-white mb-2">
                      Purchased Items:
                    </h4>
                    <div className="space-y-1">
                      {purchasedItems.map((item, index) => (
                        <div
                          key={index}
                          className="text-sm text-gray-700 dark:text-gray-300 flex items-center gap-2"
                        >
                          <DynamicIcon name={item.symbol} className="w-4 h-4" />
                          {item.name} x{item.quantity}
                          <span className="text-purple-600 dark:text-purple-400 ml-1">
                            ✨
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {remainingPoints > 0 && (
                  <div className="mt-4 pt-4 border-t border-purple-300 dark:border-purple-700">
                    <div className="text-sm text-gray-600 dark:text-gray-400">
                      Unspent Points:{" "}
                      <span className="font-bold">{remainingPoints}</span>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex justify-between pt-4">
                <button
                  onClick={() => setCurrentStep("points")}
                  className="px-6 py-3 bg-gray-500 hover:bg-gray-600 text-white font-semibold rounded-lg transition-colors flex items-center gap-2"
                >
                  <DynamicIcon name="ArrowLeft" className="w-5 h-5" />
                  Back
                </button>
                <button
                  onClick={handleBeginStory}
                  className="px-8 py-3 bg-green-600 hover:bg-green-700 text-white font-bold text-lg rounded-lg transition-colors shadow-lg flex items-center gap-2"
                >
                  <DynamicIcon name="Play" className="w-6 h-6" />
                  Begin Adventure
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function CreateCharacterPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-linear-to-br from-blue-50 via-purple-50 to-pink-50 dark:from-gray-900 dark:via-purple-900 dark:to-blue-900 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-16 w-16 border-4 border-purple-600 border-t-transparent mx-auto mb-4"></div>
            <p className="text-gray-600 dark:text-gray-400">Loading...</p>
          </div>
        </div>
      }
    >
      <CreateCharacterContent />
    </Suspense>
  );
}
