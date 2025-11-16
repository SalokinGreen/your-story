"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Adventure } from "@/app/misc/structs";
import { useAuth } from "@/app/misc/AuthContext";
import { useNotification } from "@/app/misc/NotificationContext";
import Comments from "@/app/components/Comments";
import { supabase } from "@/app/misc/supabase";

export default function AdventureDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const { addNotification } = useNotification();
  const [adventure, setAdventure] = useState<Adventure | null>(null);
  const [loading, setLoading] = useState(true);
  const [startingAdventure, setStartingAdventure] = useState(false);
  const [deleting, setDeleting] = useState(false);

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
      case "easy": return "text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/30 border-green-300 dark:border-green-700";
      case "medium": return "text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/30 border-yellow-300 dark:border-yellow-700";
      case "hard": return "text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/30 border-orange-300 dark:border-orange-700";
      case "expert": return "text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30 border-red-300 dark:border-red-700";
      default: return "text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-900/30 border-gray-300 dark:border-gray-700";
    }
  };

  const handleStartAdventure = async () => {
    if (!user) {
      addNotification("Please sign in to start an adventure", "warning");
      router.push("/");
      return;
    }

    if (!adventure) return;

    try {
      setStartingAdventure(true);

      // Get auth token
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error("Not authenticated");
      }

      // Create a new story instance from the adventure template
      const response = await fetch("/api/stories", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session.access_token}`,
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
    if (!confirm("Are you sure you want to delete this adventure? This action cannot be undone.")) {
      return;
    }

    try {
      setDeleting(true);

      // Get auth token
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error("Not authenticated");
      }

      const response = await fetch(`/api/adventures/${adventureId}`, {
        method: "DELETE",
        headers: {
          "Authorization": `Bearer ${session.access_token}`,
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
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl overflow-visible p-1 mb-8 mt-0 border border-gray-200 dark:border-gray-700">
          {/* Banner Image or Gradient */}
          {adventure.bannerUrl ? (
            <div 
              className="h-86 bg-cover bg-center relative"
              style={{ backgroundImage: `url(${adventure.bannerUrl})` }}
            >
              <div className="absolute inset-0 p-4 bg-linear-to-t from-black/70 via-black/30 to-transparent"></div>
              <div className="absolute inset-0 p-4 sm:p-0 flex flex-col justify-around">
                <div className="flex items-center gap-3 mb-4">
                  {adventure.isFeatured && (
                    <span className="px-3 py-1 bg-yellow-400 text-yellow-900 rounded-full text-sm font-bold">
                      ⭐ Featured
                    </span>
                  )}
                  <span className={`px-3 py-1 rounded-full text-sm font-bold border-2 capitalize ${getDifficultyColor(adventure.difficulty)}`}>
                    {adventure.difficulty}
                  </span>
                </div>
                
                <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mt-0 wrap-break-word">
                  {adventure.title}
                </h1>
                
                <p className="text-white/90 text-lg sm:text-xl mb-6 max-w-3xl wrap-break-word">
                  {adventure.shortDescription}
                </p>

                <div className="flex flex-wrap gap-4 mb-8 text-white/90">
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
                    <span>{(adventure.playCount || 0).toLocaleString()} plays</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xl">✍️</span>
                    <span>by {adventure.author || "Unknown"}</span>
                  </div>
                </div>

                <button
                  onClick={handleStartAdventure}
                  disabled={startingAdventure}
                  className="px-8 py-4 bg-white text-purple-600 font-bold text-lg rounded-lg shadow-lg hover:shadow-xl transition-all hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
                >
                  {startingAdventure ? (
                    <span className="flex items-center gap-2">
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
                  <div className="flex gap-3 mt-4">
                    <button
                      onClick={() => router.push(`/creator?edit=${adventureId}`)}
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
          ) : (
            <div className="bg-linear-to-r from-purple-600 via-pink-600 to-blue-600 p-8 sm:p-12">
              <div className="flex items-center gap-3 mb-4">
                {adventure.isFeatured && (
                  <span className="px-3 py-1 bg-yellow-400 text-yellow-900 rounded-full text-sm font-bold">
                    ⭐ Featured
                  </span>
                )}
                <span className={`px-3 py-1 rounded-full text-sm font-bold border-2 capitalize ${getDifficultyColor(adventure.difficulty)}`}>
                  {adventure.difficulty}
                </span>
              </div>
              
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-4 wrap-break-word">
                {adventure.title}
              </h1>
              
              <p className="text-white/90 text-lg sm:text-xl mb-6 max-w-3xl wrap-break-word">
                {adventure.shortDescription}
              </p>

              <div className="flex flex-wrap gap-4 mb-8 text-white/90">
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
                  <span>{(adventure.playCount || 0).toLocaleString()} plays</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xl">✍️</span>
                  <span>by {adventure.author || "Unknown"}</span>
                </div>
              </div>

              <button
                onClick={handleStartAdventure}
                disabled={startingAdventure}
                className="px-8 py-4 bg-white text-purple-600 font-bold text-lg rounded-lg shadow-lg hover:shadow-xl transition-all hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
              >
                {startingAdventure ? (
                  <span className="flex items-center gap-2">
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
                <div className="flex gap-3 mt-4">
                  <button
                    onClick={() => router.push(`/creator?edit=${adventureId}`)}
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
                  "{adventure.storyTemplate.starting_content || "The adventure begins..."}"
                </p>
              </div>
              <p className="text-gray-600 dark:text-gray-400 text-sm mt-4">
                This is how your adventure begins. Your choices will shape the story from here!
              </p>
            </div>

            {/* Stats Preview */}
            {adventure.storyTemplate.stats && adventure.storyTemplate.stats.length > 0 && (
              <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6 sm:p-8 border border-gray-200 dark:border-gray-700">
                <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white flex items-center gap-2">
                  <span className="text-2xl">📊</span>
                  Character Stats
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {adventure.storyTemplate.stats.map((stat, index) => (
                    <div key={index} className="flex items-center gap-3 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                      <span className="text-2xl">{stat.symbol}</span>
                      <div className="flex-1">
                        <div className="font-bold text-gray-900 dark:text-white">{stat.name}</div>
                        <div className="text-sm text-gray-600 dark:text-gray-400">{stat.description}</div>
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
                {adventure.tags.map(tag => (
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
                  <span className="text-gray-600 dark:text-gray-400">Chapters:</span>
                  <span className="font-semibold text-gray-900 dark:text-white">
                    {adventure.storyTemplate.max_chapters || "Variable"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">Created:</span>
                  <span className="font-semibold text-gray-900 dark:text-white">
                    {adventure.createdAt ? new Date(adventure.createdAt).toLocaleDateString() : "N/A"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">Updated:</span>
                  <span className="font-semibold text-gray-900 dark:text-white">
                    {adventure.updatedAt ? new Date(adventure.updatedAt).toLocaleDateString() : "N/A"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">Popularity:</span>
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
          <Comments adventureId={adventureId} />
        </div>
      </div>
    </div>
  );
}
