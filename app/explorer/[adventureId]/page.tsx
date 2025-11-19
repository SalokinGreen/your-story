"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Adventure, StoryData } from "@/app/misc/structs";
import { useAuth } from "@/app/misc/AuthContext";
import { useNotification } from "@/app/misc/NotificationContext";
import Comments from "@/app/components/Comments";
import ConfirmDialog from "@/app/components/ConfirmDialog";
import { supabase } from "@/app/misc/supabase";

export default function AdventureDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user, getEncryptionPassword } = useAuth();
  const { addNotification } = useNotification();
  const [adventure, setAdventure] = useState<Adventure | null>(null);
  const [loading, setLoading] = useState(true);
  const [startingAdventure, setStartingAdventure] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [activeTab, setActiveTab] = useState<"overview" | "lore">("overview");
  const [showSecretLore, setShowSecretLore] = useState(false);
  const [contentTab, setContentTab] = useState<
    "stats" | "achievements" | "upgrades"
  >("stats");
  const [selectedPresetId, setSelectedPresetId] = useState<string>("custom");
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    icon?: string;
    confirmText?: string;
    cancelText?: string;
    confirmButtonClass?: string;
  }>({
    isOpen: false,
    title: "",
    message: "",
    onConfirm: () => {},
  });

  const adventureId = params?.adventureId as string;
  const isAuthor = user && adventure && adventure.authorId === user.id;

  useEffect(() => {
    const fetchAdventure = async () => {
      try {
        const response = await fetch(`/api/adventures/${adventureId}`);
        if (!response.ok) throw new Error("Adventure not found");

        const { adventure: fetchedAdventure } = await response.json();
        setAdventure(fetchedAdventure);
      } catch (error) {
        console.error("Error fetching adventure:", error);
        setAdventure(null);
      } finally {
        setLoading(false);
      }
    };

    if (adventureId) {
      fetchAdventure();
    }
  }, [adventureId]);

  const getDifficultyColor = (difficulty: string) => {
    const lower = difficulty.toLowerCase();
    switch (lower) {
      case "easy":
        return "text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/30 border-green-300 dark:border-green-700";
      case "medium":
        return "text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/30 border-yellow-300 dark:border-yellow-700";
      case "hard":
        return "text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/30 border-orange-300 dark:border-orange-700";
      case "expert":
        return "text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30 border-red-300 dark:border-red-700";
      default:
        return "text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-900/30 border-gray-300 dark:border-gray-700";
    }
  };

  const [saveLocally, setSaveLocally] = useState(false);

  useEffect(() => {
    const fetchSettings = async () => {
      if (!user) return;
      const { getUserSettings } = await import("@/app/misc/user_settings");
      const settings = await getUserSettings(user.id, supabase);
      if (settings) {
        setSaveLocally(settings.save_stories_locally || false);
      }
    };
    fetchSettings();
  }, [user]);

  const handleStartAdventure = async () => {
    if (!user) {
      addNotification("Please sign in to start an adventure", "warning");
      router.push("/");
      return;
    }

    if (!adventure) return;

    // Check for encryption credentials
    const password = getEncryptionPassword();
    if (!password || !user.email) {
      addNotification(
        "🔒 Please sign out and sign back in to enable encrypted story saving",
        "warning"
      );
      return;
    }

    try {
      setStartingAdventure(true);

      if (saveLocally) {
        // Create local story
        const { saveLocalStory } = await import("@/app/misc/localStoryManager");
        const localId = `local_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        const newStoryData = {
          ...adventure.storyTemplate,
          story_name: `${adventure.title} - ${new Date().toLocaleDateString()}`,
          player_name: user.user_metadata?.display_name || "Player",
        } as unknown as StoryData; // Cast to StoryData as template should be valid

        await saveLocalStory(localId, newStoryData);
        
        addNotification("Adventure started offline! 📂", "success");
        router.push(`/story?storyId=${localId}`);
        return;
      }

      // Get auth token
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        throw new Error("Not authenticated");
      }

      // Create a new story instance from the adventure template
      const response = await fetch("/api/stories", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          adventureId: adventure.id,
          userId: user.id,
          storyName: `${adventure.title} - ${new Date().toLocaleDateString()}`,
          storyData: adventure.storyTemplate,
          isPublic: false,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to start adventure");
      }

      const { story } = await response.json();
      addNotification("Adventure started! 🎉", "success");

      // Navigate to the story page
      router.push(`/story?storyId=${story.id}`);
    } catch (error: any) {
      console.error("Error starting adventure:", error);
      addNotification(`Failed to start: ${error.message}`, "failure");
      setStartingAdventure(false);
    }
  };

  const handleDelete = async () => {
    setConfirmDialog({
      isOpen: true,
      title: "Delete Adventure?",
      message:
        "Are you sure you want to delete this adventure? This action cannot be undone.",
      icon: "🗑️",
      confirmText: "Delete Adventure",
      confirmButtonClass: "bg-red-600 hover:bg-red-700",
      onConfirm: async () => {
        setConfirmDialog({ ...confirmDialog, isOpen: false });
        try {
          setDeleting(true);

          // Get auth token
          const {
            data: { session },
          } = await supabase.auth.getSession();
          if (!session) {
            throw new Error("Not authenticated");
          }

          const response = await fetch(`/api/adventures/${adventureId}`, {
            method: "DELETE",
            headers: {
              Authorization: `Bearer ${session.access_token}`,
            },
          });

          if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || "Failed to delete adventure");
          }

          addNotification("Adventure deleted successfully", "success");
          router.push("/explorer");
        } catch (error: any) {
          console.error("Error deleting adventure:", error);
          addNotification(`Failed to delete: ${error.message}`, "failure");
          setDeleting(false);
        }
      },
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-linear-to-br from-blue-50 via-purple-50 to-pink-50 dark:from-gray-900 dark:via-purple-900 dark:to-blue-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 dark:border-purple-400"></div>
      </div>
    );
  }

  if (!adventure) {
    return (
      <div className="min-h-screen bg-linear-to-br from-blue-50 via-purple-50 to-pink-50 dark:from-gray-900 dark:via-purple-900 dark:to-blue-900 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8 border border-gray-200 dark:border-gray-700 text-center">
          <h1 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">
            Adventure Not Found
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            The adventure you're looking for doesn't exist or has been removed.
          </p>
          <button
            onClick={() => router.push("/explorer")}
            className="px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg transition-colors shadow-md"
          >
            ← Back to Explorer
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-linear-to-br from-blue-50 via-purple-50 to-pink-50 dark:from-gray-900 dark:via-purple-900 dark:to-blue-900">
      <div className="max-w-5xl mx-auto p-4 sm:p-8">
        {/* Back Button */}
        <div className="mb-6">
          <button
            onClick={() => router.push("/explorer")}
            className="px-4 py-2 bg-white dark:bg-gray-800 border-2 border-gray-300 dark:border-gray-600 hover:border-purple-500 dark:hover:border-purple-400 text-gray-900 dark:text-white font-semibold rounded-lg transition-colors shadow-md"
          >
            ← Back to Explorer
          </button>
        </div>

        {/* Hero Banner */}
        <div className="flex flex-col bg-white dark:bg-gray-800 rounded-2xl shadow-xl overflow-hidden mb-8 border border-gray-200 dark:border-gray-700">
          {/* Banner Image or Gradient */}
          {adventure.bannerUrl ? (
            <div
              className="min-h-[600px] sm:min-h-[500px] md:h-96 bg-cover bg-center relative"
              style={{ backgroundImage: `url(${adventure.bannerUrl})` }}
            >
              <div className="absolute inset-0 bg-linear-to-t from-black/80 via-black/40 to-black/20"></div>
              <div className="absolute inset-0 p-6 sm:p-8 md:p-12 flex flex-col justify-between">
                <div className="flex items-center gap-3">
                  {adventure.isFeatured && (
                    <span className="px-3 py-1 bg-yellow-400 text-yellow-900 rounded-full text-sm font-bold">
                      ⭐ Featured
                    </span>
                  )}
                  <span
                    className={`px-3 py-1 rounded-full text-sm font-bold border-2 capitalize ${getDifficultyColor(
                      adventure.difficulty
                    )}`}
                  >
                    {adventure.difficulty}
                  </span>
                </div>

                <div className="flex-1 flex flex-col justify-center gap-4 my-6">
                  <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white wrap-break-word">
                    {adventure.title}
                  </h1>

                  <p className="text-white/90 text-lg sm:text-xl max-w-3xl wrap-break-word">
                    {adventure.shortDescription}
                  </p>

                  <div className="flex flex-wrap gap-4 text-white/90">
                    <div className="flex items-center gap-2">
                      <span className="text-xl">⏱️</span>
                      <span>{adventure.estimatedDuration}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xl">⭐</span>
                      <span>{adventure.rating?.toFixed(1)} / 5.0</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xl">👥</span>
                      <span>
                        {(adventure.playCount || 0).toLocaleString()} plays
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xl">✍️</span>
                      <span>by {adventure.author || "Unknown"}</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <button
                    onClick={handleStartAdventure}
                    disabled={startingAdventure}
                    className="w-full sm:w-auto px-8 py-4 bg-white text-purple-600 font-bold text-lg rounded-lg shadow-lg hover:shadow-xl transition-all hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
                  >
                    {startingAdventure ? (
                      <span className="flex items-center justify-center gap-2">
                        <span className="animate-spin rounded-full h-5 w-5 border-2 border-purple-600 border-t-transparent"></span>
                        Starting...
                      </span>
                    ) : user ? (
                      "🎮 Start Adventure"
                    ) : (
                      "🔐 Sign In to Play"
                    )}
                  </button>

                  {/* Author Controls */}
                  {isAuthor && (
                    <div className="flex flex-col sm:flex-row gap-3">
                      <button
                        onClick={() =>
                          router.push(`/creator?edit=${adventureId}`)
                        }
                        className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg shadow-md transition-colors"
                      >
                        ✏️ Edit Adventure
                      </button>
                      <button
                        onClick={handleDelete}
                        disabled={deleting}
                        className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg shadow-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {deleting ? "Deleting..." : "🗑️ Delete"}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-linear-to-r from-purple-600 via-pink-600 to-blue-600 p-6 sm:p-8 md:p-12 min-h-[500px] flex flex-col justify-between">
              <div className="flex items-center gap-3 mb-4">
                {adventure.isFeatured && (
                  <span className="px-3 py-1 bg-yellow-400 text-yellow-900 rounded-full text-sm font-bold">
                    ⭐ Featured
                  </span>
                )}
                <span
                  className={`px-3 py-1 rounded-full text-sm font-bold border-2 capitalize ${getDifficultyColor(
                    adventure.difficulty
                  )}`}
                >
                  {adventure.difficulty}
                </span>
              </div>

              <div className="flex-1 flex flex-col justify-center gap-4 my-6">
                <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white wrap-break-word">
                  {adventure.title}
                </h1>

                <p className="text-white/90 text-lg sm:text-xl max-w-3xl wrap-break-word">
                  {adventure.shortDescription}
                </p>

                <div className="flex flex-wrap gap-4 text-white/90">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">⏱️</span>
                    <span>{adventure.estimatedDuration}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xl">⭐</span>
                    <span>{adventure.rating?.toFixed(1)} / 5.0</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xl">👥</span>
                    <span>
                      {(adventure.playCount || 0).toLocaleString()} plays
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xl">✍️</span>
                    <span>by {adventure.author || "Unknown"}</span>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <button
                  onClick={handleStartAdventure}
                  disabled={startingAdventure}
                  className="w-full sm:w-auto px-8 py-4 bg-white text-purple-600 font-bold text-lg rounded-lg shadow-lg hover:shadow-xl transition-all hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
                >
                  {startingAdventure ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="animate-spin rounded-full h-5 w-5 border-2 border-purple-600 border-t-transparent"></span>
                      Starting...
                    </span>
                  ) : user ? (
                    "🎮 Start Adventure"
                  ) : (
                    "🔐 Sign In to Play"
                  )}
                </button>

                {/* Author Controls */}
                {isAuthor && (
                  <div className="flex flex-col sm:flex-row gap-3">
                    <button
                      onClick={() =>
                        router.push(`/creator?edit=${adventureId}`)
                      }
                      className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg shadow-md transition-colors"
                    >
                      ✏️ Edit Adventure
                    </button>
                    <button
                      onClick={handleDelete}
                      disabled={deleting}
                      className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg shadow-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {deleting ? "Deleting..." : "🗑️ Delete"}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-1">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-1">
            {/* Description */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6 sm:p-8 border border-gray-200 dark:border-gray-700">
              <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white flex items-center gap-2">
                <span className="text-2xl">📖</span>
                About This Adventure
              </h2>
              <p className="text-gray-700 dark:text-gray-300 text-lg leading-relaxed">
                {adventure.description}
              </p>
            </div>

            {/* Story Preview */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6 sm:p-8 border border-gray-200 dark:border-gray-700">
              <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white flex items-center gap-2">
                <span className="text-2xl">🎬</span>
                Story Preview
              </h2>
              <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-6 border-l-4 border-purple-500">
                <p className="text-gray-800 dark:text-gray-200 italic">
                  "
                  {adventure.storyTemplate.starting_content ||
                    "The adventure begins..."}
                  "
                </p>
              </div>
              <p className="text-gray-600 dark:text-gray-400 text-sm mt-4">
                This is how your adventure begins. Your choices will shape the
                story from here!
              </p>
            </div>

            {/* Stats Preview */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6 sm:p-8 border border-gray-200 dark:border-gray-700">
              {/* Tabs */}
              <div className="flex gap-2 mb-6 border-b border-gray-200 dark:border-gray-700 pb-4">
                <button
                  onClick={() => setContentTab("stats")}
                  className={`px-4 py-2 font-semibold rounded-lg transition-all ${
                    contentTab === "stats"
                      ? "bg-purple-600 text-white shadow-md"
                      : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
                  }`}
                >
                  📊 Stats
                </button>
                <button
                  onClick={() => setContentTab("achievements")}
                  className={`px-4 py-2 font-semibold rounded-lg transition-all ${
                    contentTab === "achievements"
                      ? "bg-purple-600 text-white shadow-md"
                      : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
                  }`}
                >
                  🏆 Achievements
                </button>
                <button
                  onClick={() => setContentTab("upgrades")}
                  className={`px-4 py-2 font-semibold rounded-lg transition-all ${
                    contentTab === "upgrades"
                      ? "bg-purple-600 text-white shadow-md"
                      : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
                  }`}
                >
                  ⚡ Upgrades
                </button>
              </div>

              {/* Preset Selector - Only show for Stats tab */}
              {contentTab === "stats" &&
                adventure.presets &&
                adventure.presets.length > 0 && (
                  <div className="mb-6 pb-4 border-b border-gray-200 dark:border-gray-700">
                    <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                      View Preset:
                    </label>
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => setSelectedPresetId("custom")}
                        className={`px-4 py-2 rounded-lg font-semibold transition-all ${
                          selectedPresetId === "custom"
                            ? "bg-purple-600 text-white shadow-md"
                            : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 border border-gray-300 dark:border-gray-600"
                        }`}
                      >
                        ✨ Default
                      </button>
                      {adventure.presets
                        .filter((p) => p.id !== "custom")
                        .map((preset) => (
                          <button
                            key={preset.id}
                            onClick={() => setSelectedPresetId(preset.id)}
                            className={`px-4 py-2 rounded-lg font-semibold transition-all ${
                              selectedPresetId === preset.id
                                ? "bg-purple-600 text-white shadow-md"
                                : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 border border-gray-300 dark:border-gray-600"
                            }`}
                          >
                            {preset.icon} {preset.name}
                          </button>
                        ))}
                    </div>
                  </div>
                )}

              {/* Stats Tab */}
              {contentTab === "stats" &&
                (() => {
                  // Get the data to display based on selected preset
                  const selectedPreset =
                    selectedPresetId === "custom"
                      ? null
                      : adventure.presets?.find(
                          (p) => p.id === selectedPresetId
                        );

                  const displayStats =
                    selectedPreset?.stats || adventure.storyTemplate.stats;
                  const displayResources =
                    selectedPreset?.resources ||
                    adventure.storyTemplate.resources;
                  const displayInventory =
                    selectedPreset?.inventory ||
                    adventure.storyTemplate.inventory;

                  return (
                    <div className="space-y-6">
                      {/* Character Stats */}
                      {displayStats && displayStats.length > 0 && (
                        <div>
                          <h3 className="text-xl font-bold mb-4 text-gray-900 dark:text-white flex items-center gap-2">
                            <span className="text-2xl">💪</span>
                            Character Stats
                          </h3>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {displayStats.map((stat, index) => (
                              <div
                                key={index}
                                className="flex items-center gap-3 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800"
                              >
                                <span className="text-3xl">{stat.symbol}</span>
                                <div className="flex-1">
                                  <div className="font-bold text-gray-900 dark:text-white">
                                    {stat.name}
                                  </div>
                                  <div className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                                    {stat.description}
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <div className="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                                      <div
                                        className="bg-blue-600 h-2 rounded-full transition-all"
                                        style={{ width: `${stat.value}%` }}
                                      />
                                    </div>
                                    <span className="text-sm font-bold text-gray-700 dark:text-gray-300">
                                      {stat.value}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Resources */}
                      {displayResources && displayResources.length > 0 && (
                        <div>
                          <h3 className="text-xl font-bold mb-4 text-gray-900 dark:text-white flex items-center gap-2">
                            <span className="text-2xl">🔋</span>
                            Resources
                          </h3>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {displayResources.map((resource, index) => (
                              <div
                                key={index}
                                className="flex items-center gap-3 p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800"
                              >
                                <span className="text-3xl">
                                  {resource.symbol}
                                </span>
                                <div className="flex-1">
                                  <div className="font-bold text-gray-900 dark:text-white">
                                    {resource.name}
                                  </div>
                                  <div className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                                    {resource.description}
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <div className="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                                      <div
                                        className="bg-green-600 h-2 rounded-full transition-all"
                                        style={{
                                          width: `${
                                            (resource.value /
                                              resource.maxValue) *
                                            100
                                          }%`,
                                        }}
                                      />
                                    </div>
                                    <span className="text-sm font-bold text-gray-700 dark:text-gray-300">
                                      {resource.value}/{resource.maxValue}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Inventory */}
                      {displayInventory && displayInventory.length > 0 && (
                        <div>
                          <h3 className="text-xl font-bold mb-4 text-gray-900 dark:text-white flex items-center gap-2">
                            <span className="text-2xl">🎒</span>
                            Starting Items
                          </h3>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {displayInventory.map((item, index) => (
                              <div
                                key={index}
                                className="flex items-center gap-3 p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800"
                              >
                                <span className="text-3xl">{item.symbol}</span>
                                <div className="flex-1">
                                  <div className="flex items-center gap-2">
                                    <div className="font-bold text-gray-900 dark:text-white">
                                      {item.name}
                                    </div>
                                    <span className="px-2 py-0.5 bg-yellow-200 dark:bg-yellow-800/50 text-yellow-800 dark:text-yellow-200 rounded-full text-xs font-bold">
                                      x{item.quantity}
                                    </span>
                                  </div>
                                  <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">
                                    {item.description}
                                  </div>
                                  <div className="text-xs text-gray-500 dark:text-gray-500 capitalize">
                                    Type: {item.type}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Empty State */}
                      {(!displayStats || displayStats.length === 0) &&
                        (!displayResources || displayResources.length === 0) &&
                        (!displayInventory ||
                          displayInventory.length === 0) && (
                          <div className="text-center py-12">
                            <div className="text-4xl mb-4">📊</div>
                            <p className="text-gray-600 dark:text-gray-400">
                              No stats, resources, or items configured for this{" "}
                              {selectedPresetId === "custom"
                                ? "adventure"
                                : "preset"}
                            </p>
                          </div>
                        )}
                    </div>
                  );
                })()}

              {/* Achievements Tab */}
              {contentTab === "achievements" && (
                <div>
                  <h3 className="text-xl font-bold mb-4 text-gray-900 dark:text-white flex items-center gap-2">
                    <span className="text-2xl">🏆</span>
                    Achievements
                    {adventure.storyTemplate.achievements &&
                      adventure.storyTemplate.achievements.filter(
                        (a) => a.hidden
                      ).length > 0 && (
                        <span className="px-2 py-1 bg-purple-200 dark:bg-purple-800/50 text-purple-800 dark:text-purple-200 rounded-full text-xs font-bold ml-2">
                          +
                          {
                            adventure.storyTemplate.achievements.filter(
                              (a) => a.hidden
                            ).length
                          }{" "}
                          🔒 Hidden
                        </span>
                      )}
                  </h3>
                  {adventure.storyTemplate.achievements &&
                  adventure.storyTemplate.achievements.filter((a) => !a.hidden)
                    .length > 0 ? (
                    <div className="grid grid-cols-1 gap-3">
                      {adventure.storyTemplate.achievements
                        .filter((a) => !a.hidden)
                        .map((achievement, index) => (
                          <div
                            key={index}
                            className="flex items-start gap-4 p-4 bg-linear-to-r from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 rounded-lg border border-purple-200 dark:border-purple-800"
                          >
                            <span className="text-3xl shrink-0">
                              {achievement.symbol}
                            </span>
                            <div className="flex-1">
                              <div className="font-bold text-lg text-gray-900 dark:text-white mb-1">
                                {achievement.title}
                              </div>
                              <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">
                                {achievement.description}
                              </p>
                              {achievement.rewardDescription && (
                                <div className="inline-flex items-center gap-2 text-xs text-purple-700 dark:text-purple-300 bg-purple-100 dark:bg-purple-900/30 px-3 py-1.5 rounded-full">
                                  <span>🎁</span>
                                  <span className="font-semibold">
                                    {achievement.rewardDescription}
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                    </div>
                  ) : (
                    <div className="text-center py-12">
                      <div className="text-4xl mb-4">🏆</div>
                      <p className="text-gray-600 dark:text-gray-400">
                        No achievements configured for this adventure
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Upgrades Tab */}
              {contentTab === "upgrades" && (
                <div className="space-y-6">
                  {/* Upgrade Settings Info */}
                  {adventure.storyTemplate.upgradeSettings?.enabled ? (
                    <>
                      <div className="bg-linear-to-r from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 rounded-lg p-4 border border-blue-200 dark:border-blue-800">
                        <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2 flex items-center gap-2">
                          <span className="text-2xl">⚡</span>
                          Upgrade System Enabled
                        </h3>
                        <p className="text-sm text-gray-700 dark:text-gray-300">
                          Earn points by completing story beats and use them to
                          upgrade your character!
                        </p>
                      </div>

                      {/* Available Upgrades */}
                      <div>
                        <h4 className="text-md font-bold mb-3 text-gray-900 dark:text-white">
                          Available Upgrades:
                        </h4>
                        <div className="grid grid-cols-1 gap-3">
                          {/* Stat Upgrades */}
                          {adventure.storyTemplate.upgradeSettings
                            .allowStatUpgrade &&
                            adventure.storyTemplate.stats &&
                            adventure.storyTemplate.stats.length > 0 && (
                              <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                                <div className="flex items-center gap-2 mb-2">
                                  <span className="text-xl">💪</span>
                                  <span className="font-bold text-gray-900 dark:text-white">
                                    Stat Upgrades
                                  </span>
                                </div>
                                <div className="text-sm text-gray-700 dark:text-gray-300">
                                  Cost:{" "}
                                  <span className="font-bold">
                                    {adventure.storyTemplate.upgradeSettings
                                      .statUpgradeCost || 3}{" "}
                                    points
                                  </span>{" "}
                                  • Increase:{" "}
                                  <span className="font-bold">
                                    +
                                    {adventure.storyTemplate.upgradeSettings
                                      .statUpgradeAmount || 5}
                                  </span>
                                </div>
                              </div>
                            )}

                          {/* Resource Upgrades */}
                          {adventure.storyTemplate.upgradeSettings
                            .allowResourceUpgrade &&
                            adventure.storyTemplate.resources &&
                            adventure.storyTemplate.resources.length > 0 && (
                              <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                                <div className="flex items-center gap-2 mb-2">
                                  <span className="text-xl">🔋</span>
                                  <span className="font-bold text-gray-900 dark:text-white">
                                    Resource Upgrades
                                  </span>
                                </div>
                                <div className="text-sm text-gray-700 dark:text-gray-300">
                                  Cost:{" "}
                                  <span className="font-bold">
                                    {adventure.storyTemplate.upgradeSettings
                                      .resourceUpgradeCost || 2}{" "}
                                    points
                                  </span>{" "}
                                  • Increase:{" "}
                                  <span className="font-bold">
                                    +
                                    {adventure.storyTemplate.upgradeSettings
                                      .resourceUpgradeAmount || 10}
                                  </span>
                                </div>
                              </div>
                            )}

                          {/* Item Upgrades */}
                          {adventure.storyTemplate.upgradeSettings
                            .allowAddItem &&
                            adventure.storyTemplate.inventory &&
                            adventure.storyTemplate.inventory.length > 0 && (
                              <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
                                <div className="flex items-center gap-2 mb-2">
                                  <span className="text-xl">🎒</span>
                                  <span className="font-bold text-gray-900 dark:text-white">
                                    Item Upgrades
                                  </span>
                                </div>
                                <div className="text-sm text-gray-700 dark:text-gray-300">
                                  Cost:{" "}
                                  <span className="font-bold">
                                    {adventure.storyTemplate.upgradeSettings
                                      .addItemCost || 1}{" "}
                                    points
                                  </span>
                                </div>
                              </div>
                            )}
                        </div>
                      </div>

                      {/* Shop Items */}
                      {(adventure.storyTemplate.upgradeSettings.statShop
                        ?.length > 0 ||
                        adventure.storyTemplate.upgradeSettings.resourceShop
                          ?.length > 0 ||
                        adventure.storyTemplate.upgradeSettings.itemShop
                          ?.length > 0) && (
                        <div>
                          <h4 className="text-md font-bold mb-3 text-gray-900 dark:text-white">
                            Shop Items:
                          </h4>
                          <div className="grid grid-cols-1 gap-3">
                            {/* Shop Stats */}
                            {adventure.storyTemplate.upgradeSettings.statShop?.map(
                              (shopStat, index) => (
                                <div
                                  key={`stat-${index}`}
                                  className="p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-800"
                                >
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                      <span className="text-2xl">
                                        {shopStat.symbol}
                                      </span>
                                      <div>
                                        <div className="font-bold text-gray-900 dark:text-white">
                                          {shopStat.name}
                                        </div>
                                        <div className="text-sm text-gray-600 dark:text-gray-400">
                                          {shopStat.description}
                                        </div>
                                      </div>
                                    </div>
                                    <div className="text-right">
                                      <div className="font-bold text-purple-600 dark:text-purple-400">
                                        {shopStat.cost} points
                                      </div>
                                      <div className="text-xs text-gray-600 dark:text-gray-400">
                                        Starting value: {shopStat.startingValue}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              )
                            )}

                            {/* Shop Resources */}
                            {adventure.storyTemplate.upgradeSettings.resourceShop?.map(
                              (shopResource, index) => (
                                <div
                                  key={`resource-${index}`}
                                  className="p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-800"
                                >
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                      <span className="text-2xl">
                                        {shopResource.symbol}
                                      </span>
                                      <div>
                                        <div className="font-bold text-gray-900 dark:text-white">
                                          {shopResource.name}
                                        </div>
                                        <div className="text-sm text-gray-600 dark:text-gray-400">
                                          {shopResource.description}
                                        </div>
                                      </div>
                                    </div>
                                    <div className="text-right">
                                      <div className="font-bold text-purple-600 dark:text-purple-400">
                                        {shopResource.cost} points
                                      </div>
                                      <div className="text-xs text-gray-600 dark:text-gray-400">
                                        {shopResource.startingValue}/
                                        {shopResource.startingMaxValue}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              )
                            )}

                            {/* Shop Items */}
                            {adventure.storyTemplate.upgradeSettings.itemShop?.map(
                              (shopItem, index) => (
                                <div
                                  key={`item-${index}`}
                                  className="p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-800"
                                >
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                      <span className="text-2xl">
                                        {shopItem.symbol}
                                      </span>
                                      <div>
                                        <div className="font-bold text-gray-900 dark:text-white">
                                          {shopItem.name}
                                        </div>
                                        <div className="text-sm text-gray-600 dark:text-gray-400">
                                          {shopItem.description}
                                        </div>
                                        <div className="text-xs text-gray-500 dark:text-gray-500 mt-1 capitalize">
                                          Type: {shopItem.type}
                                        </div>
                                      </div>
                                    </div>
                                    <div className="text-right">
                                      <div className="font-bold text-purple-600 dark:text-purple-400">
                                        {shopItem.cost} points
                                      </div>
                                      <div className="text-xs text-gray-600 dark:text-gray-400">
                                        x{shopItem.quantity}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              )
                            )}
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="text-center py-12">
                      <div className="text-4xl mb-4">⚡</div>
                      <p className="text-gray-600 dark:text-gray-400">
                        Upgrade system is disabled for this adventure
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Character Presets */}
            {adventure.presets && adventure.presets.length > 0 && (
              <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6 border border-gray-200 dark:border-gray-700">
                <h2 className="text-2xl font-bold mb-2 text-gray-900 dark:text-white">
                  🎭 Character Presets
                </h2>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                  Choose a character archetype to start your adventure with
                  pre-configured stats, items, and resources.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Custom Preset (Always Available) */}
                  <div className="border-2 border-purple-300 dark:border-purple-700 bg-purple-50 dark:bg-purple-900/20 rounded-xl p-4 hover:shadow-lg transition-shadow">
                    <div className="flex items-start gap-3 mb-3">
                      <span className="text-3xl">✨</span>
                      <div className="flex-1">
                        <h3 className="font-bold text-lg text-gray-900 dark:text-white">
                          Custom
                        </h3>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          Start with the default adventure settings and
                          customize as you play.
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs">
                      <span className="px-2 py-1 bg-purple-200 dark:bg-purple-800/50 text-purple-800 dark:text-purple-200 rounded-full">
                        Default Stats
                      </span>
                      <span className="px-2 py-1 bg-purple-200 dark:bg-purple-800/50 text-purple-800 dark:text-purple-200 rounded-full">
                        Starting Items
                      </span>
                    </div>
                  </div>

                  {/* Author-Created Presets */}
                  {adventure.presets
                    .filter((p) => p.id !== "custom")
                    .map((preset) => (
                      <div
                        key={preset.id}
                        className="border-2 border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-900/30 rounded-xl p-4 hover:shadow-lg transition-shadow"
                      >
                        <div className="flex items-start gap-3 mb-3">
                          <span className="text-3xl">{preset.icon}</span>
                          <div className="flex-1">
                            <h3 className="font-bold text-lg text-gray-900 dark:text-white">
                              {preset.name}
                            </h3>
                            <p className="text-sm text-gray-600 dark:text-gray-400">
                              {preset.description}
                            </p>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2 text-xs">
                          {preset.stats && preset.stats.length > 0 && (
                            <span className="px-2 py-1 bg-blue-200 dark:bg-blue-800/50 text-blue-800 dark:text-blue-200 rounded-full">
                              {preset.stats.length} Stats
                            </span>
                          )}
                          {preset.resources && preset.resources.length > 0 && (
                            <span className="px-2 py-1 bg-green-200 dark:bg-green-800/50 text-green-800 dark:text-green-200 rounded-full">
                              {preset.resources.length} Resources
                            </span>
                          )}
                          {preset.inventory && preset.inventory.length > 0 && (
                            <span className="px-2 py-1 bg-yellow-200 dark:bg-yellow-800/50 text-yellow-800 dark:text-yellow-200 rounded-full">
                              {preset.inventory.length} Items
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-1">
            {/* Tags */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6 border border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-bold mb-4 text-gray-900 dark:text-white">
                🏷️ Tags
              </h3>
              <div className="flex flex-wrap gap-2">
                {adventure.tags.map((tag) => (
                  <span
                    key={tag}
                    className="px-3 py-1 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded-full text-sm font-semibold"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>

            {/* Details */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6 border border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-bold mb-4 text-gray-900 dark:text-white">
                ℹ️ Details
              </h3>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">
                    Story Beats:
                  </span>
                  <span className="font-semibold text-gray-900 dark:text-white">
                    {adventure.storyTemplate.plot_beats?.length || 0}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">
                    Created:
                  </span>
                  <span className="font-semibold text-gray-900 dark:text-white">
                    {adventure.createdAt
                      ? new Date(adventure.createdAt).toLocaleDateString()
                      : "N/A"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">
                    Updated:
                  </span>
                  <span className="font-semibold text-gray-900 dark:text-white">
                    {adventure.updatedAt
                      ? new Date(adventure.updatedAt).toLocaleDateString()
                      : "N/A"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">
                    Popularity:
                  </span>
                  <span className="font-semibold text-gray-900 dark:text-white">
                    #{Math.floor((adventure.popularity || 0) / 1000)}k
                  </span>
                </div>
              </div>
            </div>

            {/* Share */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6 border border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-bold mb-4 text-gray-900 dark:text-white">
                🔗 Share
              </h3>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(window.location.href);
                  alert("Link copied to clipboard!");
                }}
                className="w-full px-4 py-3 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg transition-colors"
              >
                Copy Link
              </button>
            </div>

            {/* CTA Button (Mobile Sticky) */}
            <div className="lg:hidden sticky bottom-4">
              <button
                onClick={handleStartAdventure}
                className="w-full px-6 py-4 bg-linear-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-bold text-lg rounded-lg shadow-lg transition-all"
              >
                {user ? "🎮 Start Adventure" : "🔐 Sign In to Play"}
              </button>
            </div>
          </div>
        </div>

        {/* Comments Section */}
        <div className="max-w-6xl mx-auto px-4 sm:px-8 pb-8 mt-8">
          {/* Tabs */}
          <div className="flex gap-2 mb-6">
            <button
              onClick={() => setActiveTab("overview")}
              className={`px-6 py-3 font-semibold rounded-lg transition-all ${
                activeTab === "overview"
                  ? "bg-purple-600 text-white shadow-lg"
                  : "bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700"
              }`}
            >
              💬 Comments
            </button>
            <button
              onClick={() => setActiveTab("lore")}
              className={`px-6 py-3 font-semibold rounded-lg transition-all ${
                activeTab === "lore"
                  ? "bg-purple-600 text-white shadow-lg"
                  : "bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700"
              }`}
            >
              📚 Lore ({adventure?.storyTemplate.lore?.length || 0})
            </button>
          </div>

          {/* Tab Content */}
          {activeTab === "overview" && <Comments adventureId={adventureId} />}

          {activeTab === "lore" && adventure?.storyTemplate.lore && (
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6 sm:p-8 border border-gray-200 dark:border-gray-700">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                  <span className="text-2xl">📚</span>
                  Lore Entries
                </h2>

                {/* Filters */}
                <div className="flex flex-wrap items-center gap-3">
                  {/* Secret Toggle */}
                  <label className="flex items-center gap-2 cursor-pointer px-3 py-2 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">
                    <input
                      type="checkbox"
                      checked={showSecretLore}
                      onChange={(e) => setShowSecretLore(e.target.checked)}
                      className="w-4 h-4 text-purple-600 bg-gray-100 border-gray-300 rounded focus:ring-purple-500 dark:focus:ring-purple-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                    />
                    <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                      🔒 Show Secret Lore
                    </span>
                  </label>
                </div>
              </div>

              {/* Lore Grid */}
              {(() => {
                const filteredLore = adventure.storyTemplate.lore.filter(
                  (lore) => {
                    // Filter by secret status
                    if (lore.secrtet && !showSecretLore) return false;

                    return true;
                  }
                );

                if (filteredLore.length === 0) {
                  return (
                    <div className="text-center py-12">
                      <div className="text-4xl mb-4">📖</div>
                      <p className="text-gray-600 dark:text-gray-400">
                        No lore entries match your filters
                      </p>
                    </div>
                  );
                }

                return (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {filteredLore.map((lore, index) => (
                      <div
                        key={index}
                        className={`p-5 rounded-xl border-2 transition-all hover:shadow-lg ${
                          lore.secrtet
                            ? "bg-purple-50 dark:bg-purple-900/20 border-purple-300 dark:border-purple-700"
                            : "bg-gray-50 dark:bg-gray-700/50 border-gray-200 dark:border-gray-600"
                        }`}
                      >
                        <div className="flex items-start justify-between mb-3">
                          <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                            {lore.secrtet && (
                              <span className="text-purple-600 dark:text-purple-400">
                                🔒
                              </span>
                            )}
                            {lore.title}
                          </h3>
                          {lore.thumbnailUrl && (
                            <img
                              src={lore.thumbnailUrl}
                              alt={lore.title}
                              className="w-12 h-12 rounded-lg object-cover"
                            />
                          )}
                        </div>

                        <p className="text-gray-700 dark:text-gray-300 text-sm mb-4 leading-relaxed">
                          {lore.content}
                        </p>

                        {/* Metadata */}
                        <div className="space-y-2">
                          {lore.relatedCharacters &&
                            lore.relatedCharacters.length > 0 && (
                              <div className="flex flex-wrap gap-2">
                                <span className="text-xs font-semibold text-gray-600 dark:text-gray-400">
                                  👥 Characters:
                                </span>
                                {lore.relatedCharacters.map((char, i) => (
                                  <span
                                    key={i}
                                    className="px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded text-xs font-semibold"
                                  >
                                    {char}
                                  </span>
                                ))}
                              </div>
                            )}

                          {lore.relatedLocations &&
                            lore.relatedLocations.length > 0 && (
                              <div className="flex flex-wrap gap-2">
                                <span className="text-xs font-semibold text-gray-600 dark:text-gray-400">
                                  📍 Locations:
                                </span>
                                {lore.relatedLocations.map((loc, i) => (
                                  <span
                                    key={i}
                                    className="px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded text-xs font-semibold"
                                  >
                                    {loc}
                                  </span>
                                ))}
                              </div>
                            )}

                          {lore.keys && lore.keys.length > 0 && (
                            <div className="flex flex-wrap gap-2">
                              <span className="text-xs font-semibold text-gray-600 dark:text-gray-400">
                                🔑 Keywords:
                              </span>
                              {lore.keys.map((key, i) => (
                                <span
                                  key={i}
                                  className="px-2 py-1 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 rounded text-xs font-semibold"
                                >
                                  {key}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        title={confirmDialog.title}
        message={confirmDialog.message}
        icon={confirmDialog.icon}
        confirmText={confirmDialog.confirmText}
        cancelText={confirmDialog.cancelText}
        confirmButtonClass={confirmDialog.confirmButtonClass}
        onConfirm={confirmDialog.onConfirm}
        onCancel={() => setConfirmDialog({ ...confirmDialog, isOpen: false })}
      />
    </div>
  );
}
