"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Adventure, StoryData } from "@/app/misc/structs";
import { useAuth } from "@/app/misc/AuthContext";
import { isAdmin } from "@/app/misc/auth";
import { useNotification } from "@/app/misc/NotificationContext";
import Comments from "@/app/components/Comments";
import ConfirmDialog from "@/app/components/ConfirmDialog";
import { supabase } from "@/app/misc/supabase";
import { DynamicIcon } from "@/app/components/DynamicIcon";
import { AdventureDetailSkeleton } from "@/app/components/Skeleton";
import { DraggableScroll } from "@/app/components/DraggableScroll";

export default function AdventureDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user, getEncryptionPassword } = useAuth();
  const { addNotification } = useNotification();
  const [adventure, setAdventure] = useState<Adventure | null>(null);
  const [loading, setLoading] = useState(true);
  const [startingAdventure, setStartingAdventure] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [copying, setCopying] = useState(false);
  const [isAdminUser, setIsAdminUser] = useState(false);
  const [togglingFeatured, setTogglingFeatured] = useState(false);
  const [togglingNsfw, setTogglingNsfw] = useState(false);
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
    const checkAdmin = async () => {
      const admin = await isAdmin();
      setIsAdminUser(admin);
    };
    checkAdmin();
  }, [user]);

  useEffect(() => {
    const fetchAdventure = async () => {
      try {
        // Check if this is a local adventure
        if (adventureId.startsWith("local:")) {
          const { getLocalAdventure } = await import(
            "@/app/misc/localAdventureManager"
          );
          const localAdventure = await getLocalAdventure(adventureId);

          if (!localAdventure) {
            setAdventure(null);
            setLoading(false);
            return;
          }

          // Convert LocalAdventure to Adventure format
          const difficultyValue = localAdventure.adventureData.difficulty;
          let normalizedDifficulty: "easy" | "medium" | "hard" | "expert" =
            "medium";

          if (difficultyValue) {
            const lower = difficultyValue.toLowerCase();
            if (lower === "easy") normalizedDifficulty = "easy";
            else if (lower === "medium") normalizedDifficulty = "medium";
            else if (lower === "hard") normalizedDifficulty = "hard";
            else if (lower === "expert") normalizedDifficulty = "expert";
          }

          const adventure: Adventure = {
            id: localAdventure.id,
            title: localAdventure.title,
            shortDescription: localAdventure.description,
            description: localAdventure.description,
            thumbnailUrl: localAdventure.adventureData.thumbnailUrl || "",
            bannerUrl: localAdventure.adventureData.bannerUrl || "",
            tags: localAdventure.adventureData.tags || [],
            difficulty: normalizedDifficulty,
            nsfw: localAdventure.adventureData.nsfw || false,
            estimatedDuration:
              localAdventure.adventureData.estimatedDuration || "1-2 hours",
            storyTemplate: localAdventure.adventureData.storyTemplate || {},
            presets: localAdventure.adventureData.presets || [],
            startingChoices: localAdventure.adventureData.startingChoices,
            rating: 0,
            playCount: 0,
            authorId: user?.id || "",
            author: user?.user_metadata?.display_name || "You",
            isPublished: false,
            isFeatured: false,
            popularity: 0,
            createdAt: new Date(localAdventure.updatedAt),
            updatedAt: new Date(localAdventure.updatedAt),
          };

          setAdventure(adventure);
          setLoading(false);
          return;
        }

        // Get auth token if user is signed in
        const {
          data: { session },
        } = await supabase.auth.getSession();

        const headers: HeadersInit = {};
        if (session?.access_token) {
          headers.Authorization = `Bearer ${session.access_token}`;
        }

        const response = await fetch(`/api/adventures/${adventureId}`, {
          headers,
        });
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
  }, [adventureId, user]);

  const handleToggleFeatured = async () => {
    if (!adventure) return;

    try {
      setTogglingFeatured(true);
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const response = await fetch(`/api/adventures/${adventureId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          isFeatured: !adventure.isFeatured,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to update featured status");
      }

      const { adventure: updatedAdventure } = await response.json();
      setAdventure(updatedAdventure);
      addNotification(
        updatedAdventure.isFeatured
          ? "Adventure featured!"
          : "Adventure un-featured",
        "success"
      );
    } catch (error: any) {
      console.error("Error toggling featured status:", error);
      addNotification(error.message, "failure");
    } finally {
      setTogglingFeatured(false);
    }
  };

  const handleToggleNsfw = async () => {
    if (!adventure) return;

    try {
      setTogglingNsfw(true);
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const response = await fetch(`/api/adventures/${adventureId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          nsfw: !adventure.nsfw,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to update NSFW status");
      }

      const { adventure: updatedAdventure } = await response.json();
      setAdventure(updatedAdventure);
      addNotification(
        updatedAdventure.nsfw
          ? "Adventure marked as NSFW"
          : "Adventure unmarked as NSFW",
        "success"
      );
    } catch (error: any) {
      console.error("Error toggling NSFW status:", error);
      addNotification(error.message, "failure");
    } finally {
      setTogglingNsfw(false);
    }
  };

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty.toLowerCase()) {
      case "easy":
        return "bg-emerald-500/20 text-emerald-400 border-emerald-500/30";
      case "medium":
        return "bg-amber-500/20 text-amber-400 border-amber-500/30";
      case "hard":
        return "bg-orange-500/20 text-orange-400 border-orange-500/30";
      case "expert":
        return "bg-red-500/20 text-red-400 border-red-500/30";
      default:
        return "bg-gray-500/20 text-gray-400 border-gray-500/30";
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
    // Prevent double-submission
    if (startingAdventure) return;

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
        "Please sign out and sign back in to enable encrypted story saving",
        "warning"
      );
      return;
    }

    try {
      setStartingAdventure(true);

      if (saveLocally) {
        // Create local story
        const { saveLocalStory } = await import("@/app/misc/localStoryManager");
        const localId = `local_${Date.now()}_${Math.random()
          .toString(36)
          .substr(2, 9)}`;

        const newStoryData = {
          ...adventure.storyTemplate,
          story_name: `${adventure.title} - ${new Date().toLocaleDateString()}`,
          player_name: user.user_metadata?.display_name || "Player",
          starting_choices: adventure.startingChoices,
          points: 0, // Reset XP to 0 (character creation points are separate)
          level: 1,
          upgradesSpent: 0,
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
          storyData: {
            ...adventure.storyTemplate,
            starting_choices: adventure.startingChoices,
            points: 0, // Reset XP to 0 (character creation points are separate)
            level: 1,
            upgradesSpent: 0,
          },
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

  const handleCopyAdventure = async () => {
    if (!user) {
      addNotification("Please sign in to copy adventures", "warning");
      router.push("/");
      return;
    }

    if (!adventure) return;

    try {
      setCopying(true);

      // Create a copy of the adventure with new author and private visibility
      const copiedAdventure = {
        ...adventure,
        id: undefined, // Will be assigned by the database
        title: `${adventure.title} (Copy)`,
        authorId: user.id,
        author: user.user_metadata?.display_name || "You",
        visibility: "private" as const,
        isPublished: false,
        isFeatured: false,
        playCount: 0,
        rating: 0,
        createdAt: undefined,
        updatedAt: undefined,
      };

      // Store the copied adventure data in sessionStorage
      sessionStorage.setItem(
        "your-story:copied-adventure",
        JSON.stringify(copiedAdventure)
      );

      addNotification("Adventure copied! Redirecting to editor...", "success");

      // Navigate to creator with copy flag
      router.push("/creator/manual?copy=true");
    } catch (error: any) {
      console.error("Error copying adventure:", error);
      addNotification(`Failed to copy: ${error.message}`, "failure");
      setCopying(false);
    }
  };

  const handleDelete = async () => {
    setConfirmDialog({
      isOpen: true,
      title: "Delete Adventure?",
      message:
        "Are you sure you want to delete this adventure? This action cannot be undone.",
      icon: "Trash2",
      confirmText: "Delete Adventure",
      confirmButtonClass: "bg-red-600 hover:bg-red-700",
      onConfirm: async () => {
        setConfirmDialog({ ...confirmDialog, isOpen: false });
        try {
          setDeleting(true);

          // Check if this is a local adventure
          if (adventureId.startsWith("local:")) {
            const { deleteLocalAdventure } = await import(
              "@/app/misc/localAdventureManager"
            );
            await deleteLocalAdventure(adventureId);
            addNotification("Local adventure deleted successfully", "success");
            router.push("/library");
            return;
          }

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
    return <AdventureDetailSkeleton />;
  }

  if (!adventure) {
    return (
      <div className="min-h-screen bg-linear-to-br from-gray-900 via-blue-950 to-purple-950 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-blue-950/50 backdrop-blur-xl rounded-2xl p-8 border border-blue-800/30 text-center">
          <div className="text-6xl mb-4">🔍</div>
          <h1 className="text-2xl font-bold mb-4 text-white">
            Adventure Not Found
          </h1>
          <p className="text-blue-200/60 mb-6">
            The adventure you&apos;re looking for doesn&apos;t exist or has been
            removed.
          </p>
          <button
            onClick={() => router.push("/explorer")}
            className="px-6 py-3 bg-linear-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white font-semibold rounded-xl transition-all"
          >
            ← Back to Explorer
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-linear-to-br from-gray-900 via-blue-950 to-purple-950 text-white">
      {/* Sticky Header */}
      <header className="sticky top-0 z-50 bg-blue-950/80 backdrop-blur-xl border-b border-blue-800/30">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <button
            onClick={() => router.push("/explorer")}
            className="flex items-center gap-2 px-3 py-2 hover:bg-white/10 rounded-lg transition-colors"
          >
            <DynamicIcon name="ArrowLeft" className="w-5 h-5" />
            <span className="hidden sm:inline text-sm font-medium">
              Explorer
            </span>
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                navigator.clipboard.writeText(window.location.href);
                addNotification("Link copied!", "success");
              }}
              className="p-2 hover:bg-white/10 rounded-lg transition-colors"
              title="Share"
            >
              <DynamicIcon name="Share2" className="w-5 h-5" />
            </button>
            {user && (
              <button
                onClick={handleCopyAdventure}
                disabled={copying}
                className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                title="Copy Adventure"
              >
                {copying ? (
                  <DynamicIcon
                    name="Loader2"
                    className="w-5 h-5 animate-spin"
                  />
                ) : (
                  <DynamicIcon name="Copy" className="w-5 h-5" />
                )}
              </button>
            )}
            {isAuthor && (
              <>
                <button
                  onClick={() =>
                    router.push(`/creator/manual?edit=${adventureId}`)
                  }
                  className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                  title="Edit"
                >
                  <DynamicIcon name="Edit" className="w-5 h-5" />
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="p-2 hover:bg-red-500/20 text-red-400 rounded-lg transition-colors"
                  title="Delete"
                >
                  <DynamicIcon name="Trash2" className="w-5 h-5" />
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6">
        {/* Hero Section - Compact */}
        <section className="relative rounded-2xl overflow-hidden mb-6">
          {/* Background */}
          <div className="relative h-64 sm:h-72">
            {adventure.bannerUrl ? (
              <div
                className="absolute inset-0 bg-cover bg-center"
                style={{ backgroundImage: `url(${adventure.bannerUrl})` }}
              />
            ) : (
              <div className="absolute inset-0 bg-linear-to-br from-purple-600 via-pink-600 to-blue-600" />
            )}
            <div className="absolute inset-0 bg-linear-to-t from-gray-900 via-gray-900/60 to-transparent" />

            {/* Hero Content */}
            <div className="absolute inset-0 p-6 flex flex-col justify-end">
              {/* Badges */}
              <div className="flex flex-wrap items-center gap-2 mb-3">
                {adventure.isFeatured && (
                  <span className="px-2 py-1 bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 rounded-lg text-xs font-bold flex items-center gap-1">
                    <DynamicIcon name="Star" className="w-3 h-3 fill-current" />
                    Featured
                  </span>
                )}
                {adventure.nsfw && (
                  <span className="px-2 py-1 bg-red-500/20 text-red-400 border border-red-500/30 rounded-lg text-xs font-bold">
                    18+
                  </span>
                )}
                <span
                  className={`px-2 py-1 rounded-lg text-xs font-bold border ${getDifficultyColor(
                    adventure.difficulty
                  )}`}
                >
                  {adventure.difficulty}
                </span>
              </div>

              {/* Title */}
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold mb-2 leading-tight">
                {adventure.title}
              </h1>

              {/* Author */}
              <p className="text-blue-200/70 text-sm mb-4">
                by{" "}
                <span className="text-white font-medium">
                  {adventure.author || "Unknown"}
                </span>
              </p>
            </div>
          </div>
        </section>

        {/* Quick Stats Bar */}
        <div className="flex flex-wrap gap-3 mb-6">
          <div className="flex items-center gap-2 px-3 py-2 bg-blue-900/30 border border-blue-800/30 rounded-xl text-sm">
            <DynamicIcon name="Star" className="w-4 h-4 text-yellow-500" />
            <span className="font-semibold">
              {adventure.rating?.toFixed(1) || "-"}
            </span>
          </div>
          <div className="flex items-center gap-2 px-3 py-2 bg-blue-900/30 border border-blue-800/30 rounded-xl text-sm">
            <DynamicIcon name="Play" className="w-4 h-4 text-blue-400" />
            <span>{(adventure.playCount || 0).toLocaleString()} plays</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-2 bg-blue-900/30 border border-blue-800/30 rounded-xl text-sm">
            <DynamicIcon name="Dice5" className="w-4 h-4 text-green-400" />
            <span>{adventure.storyTemplate?.rpgSystem || "3d6"}</span>
          </div>
        </div>

        {/* Play Button - Prominent */}
        <button
          onClick={handleStartAdventure}
          disabled={startingAdventure}
          className="w-full sm:w-auto px-8 py-4 bg-linear-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white font-bold text-lg rounded-xl shadow-lg shadow-purple-500/20 transition-all hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 mb-8"
        >
          {startingAdventure ? (
            <span className="flex items-center justify-center gap-2">
              <span className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></span>
              Starting...
            </span>
          ) : user ? (
            <span className="flex items-center justify-center gap-2">
              <DynamicIcon name="Play" className="w-5 h-5" />
              Start Adventure
            </span>
          ) : (
            <span className="flex items-center justify-center gap-2">
              <DynamicIcon name="Lock" className="w-5 h-5" />
              Sign In to Play
            </span>
          )}
        </button>

        {/* Admin Controls */}
        {isAdminUser && (
          <div className="flex flex-wrap gap-2 mb-8 p-4 bg-blue-900/20 border border-blue-800/30 rounded-xl">
            <span className="text-xs font-bold text-blue-300/70 uppercase tracking-wider mr-2 self-center">
              Admin:
            </span>
            <button
              onClick={handleToggleFeatured}
              disabled={togglingFeatured}
              className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
                adventure.isFeatured
                  ? "bg-yellow-500/20 text-yellow-400 border border-yellow-500/30"
                  : "bg-white/5 hover:bg-white/10 border border-white/10"
              }`}
            >
              {togglingFeatured
                ? "..."
                : adventure.isFeatured
                ? "★ Featured"
                : "☆ Feature"}
            </button>
            <button
              onClick={handleToggleNsfw}
              disabled={togglingNsfw}
              className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
                adventure.nsfw
                  ? "bg-red-500/20 text-red-400 border border-red-500/30"
                  : "bg-white/5 hover:bg-white/10 border border-white/10"
              }`}
            >
              {togglingNsfw ? "..." : adventure.nsfw ? "18+ NSFW" : "Mark NSFW"}
            </button>
          </div>
        )}

        {/* Tags */}
        <div className="flex flex-wrap gap-2 mb-8">
          {adventure.tags.map((tag) => (
            <span
              key={tag}
              className="px-3 py-1 bg-purple-500/20 text-purple-300 border border-purple-500/30 rounded-full text-sm"
            >
              {tag}
            </span>
          ))}
        </div>

        {/* Description */}
        <section className="mb-8">
          <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <DynamicIcon name="BookOpen" className="w-5 h-5 text-blue-400" />
            About
          </h2>
          <p className="text-blue-100/80 leading-relaxed">
            {adventure.description || adventure.shortDescription}
          </p>
        </section>

        {/* Story Preview */}
        {adventure.storyTemplate?.intro && (
          <section className="mb-8">
            <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <DynamicIcon name="Quote" className="w-5 h-5 text-purple-400" />
              Story Preview
            </h2>
            <blockquote className="p-4 bg-blue-900/20 border-l-4 border-purple-500 rounded-r-xl italic text-blue-100/70">
              &ldquo;{adventure.storyTemplate.intro}&rdquo;
            </blockquote>
          </section>
        )}

        {/* Character Presets - Horizontal Scroll */}
        {adventure.presets && adventure.presets.length > 0 && (
          <section className="mb-8">
            <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <DynamicIcon name="Users" className="w-5 h-5 text-green-400" />
              Character Presets
            </h2>
            <DraggableScroll className="pb-2" innerClassName="gap-3 px-1">
              {/* Default/Custom Option */}
              <div
                onClick={() => setSelectedPresetId("custom")}
                className={`shrink-0 w-44 p-4 rounded-xl border-2 cursor-pointer transition-all ${
                  selectedPresetId === "custom"
                    ? "bg-purple-500/20 border-purple-500/50"
                    : "bg-blue-900/30 border-blue-800/30 hover:border-blue-700/50"
                }`}
              >
                <div className="text-2xl mb-2">✨</div>
                <h3 className="font-bold mb-1">Custom</h3>
                <p className="text-xs text-blue-200/60 line-clamp-2">
                  Default adventure settings
                </p>
              </div>

              {adventure.presets
                .filter((p) => p.id !== "custom")
                .map((preset) => (
                  <div
                    key={preset.id}
                    onClick={() => setSelectedPresetId(preset.id)}
                    className={`shrink-0 w-44 p-4 rounded-xl border-2 cursor-pointer transition-all ${
                      selectedPresetId === preset.id
                        ? "bg-purple-500/20 border-purple-500/50"
                        : "bg-blue-900/30 border-blue-800/30 hover:border-blue-700/50"
                    }`}
                  >
                    <DynamicIcon name={preset.icon} className="w-8 h-8 mb-2" />
                    <h3 className="font-bold mb-1">{preset.name}</h3>
                    <p className="text-xs text-blue-200/60 line-clamp-2">
                      {preset.description}
                    </p>
                  </div>
                ))}
            </DraggableScroll>
          </section>
        )}

        {/* Content Tabs */}
        <section className="mb-8">
          <div className="flex gap-2 mb-4 border-b border-blue-800/30 pb-4">
            <button
              onClick={() => setContentTab("stats")}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                contentTab === "stats"
                  ? "bg-purple-600 text-white"
                  : "bg-blue-900/30 hover:bg-blue-800/30"
              }`}
            >
              📊 Stats
            </button>
            <button
              onClick={() => setContentTab("achievements")}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                contentTab === "achievements"
                  ? "bg-purple-600 text-white"
                  : "bg-blue-900/30 hover:bg-blue-800/30"
              }`}
            >
              🏆 Achievements
            </button>
            <button
              onClick={() => setContentTab("upgrades")}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                contentTab === "upgrades"
                  ? "bg-purple-600 text-white"
                  : "bg-blue-900/30 hover:bg-blue-800/30"
              }`}
            >
              ⚡ Upgrades
            </button>
          </div>

          {/* Stats Tab - Compact */}
          {contentTab === "stats" &&
            (() => {
              const selectedPreset =
                selectedPresetId === "custom"
                  ? null
                  : adventure.presets?.find((p) => p.id === selectedPresetId);
              const displayStats =
                selectedPreset?.stats || adventure.storyTemplate?.stats;
              const displayResources =
                selectedPreset?.resources || adventure.storyTemplate?.resources;
              const displayInventory =
                selectedPreset?.inventory || adventure.storyTemplate?.inventory;

              return (
                <div className="space-y-4">
                  {/* Stats Grid */}
                  {displayStats && displayStats.length > 0 && (
                    <div>
                      <h3 className="text-sm font-semibold text-blue-300/70 uppercase tracking-wider mb-2">
                        Stats
                      </h3>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {displayStats.map((stat, i) => (
                          <div
                            key={i}
                            className="flex items-center gap-2 p-3 bg-blue-900/30 border border-blue-800/30 rounded-xl"
                          >
                            <DynamicIcon
                              name={stat.symbol}
                              className="w-5 h-5 text-blue-400"
                            />
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium truncate">
                                {stat.name}
                              </div>
                              <div className="text-xs text-blue-300/50">
                                {stat.value}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Resources Grid */}
                  {displayResources && displayResources.length > 0 && (
                    <div>
                      <h3 className="text-sm font-semibold text-blue-300/70 uppercase tracking-wider mb-2">
                        Resources
                      </h3>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {displayResources.map((res, i) => (
                          <div
                            key={i}
                            className="flex items-center gap-2 p-3 bg-green-900/20 border border-green-800/30 rounded-xl"
                          >
                            <DynamicIcon
                              name={res.symbol}
                              className="w-5 h-5 text-green-400"
                            />
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium truncate">
                                {res.name}
                              </div>
                              <div className="text-xs text-green-300/50">
                                {res.value}/{res.maxValue}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Items Grid */}
                  {displayInventory && displayInventory.length > 0 && (
                    <div>
                      <h3 className="text-sm font-semibold text-blue-300/70 uppercase tracking-wider mb-2">
                        Starting Items
                      </h3>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {displayInventory.map((item, i) => (
                          <div
                            key={i}
                            className="flex items-center gap-2 p-3 bg-amber-900/20 border border-amber-800/30 rounded-xl"
                          >
                            <DynamicIcon
                              name={item.symbol}
                              className="w-5 h-5 text-amber-400"
                            />
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium truncate">
                                {item.name}
                              </div>
                              <div className="text-xs text-amber-300/50">
                                x{item.quantity}
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
                    (!displayInventory || displayInventory.length === 0) && (
                      <div className="text-center py-8 text-blue-300/50">
                        <div className="text-3xl mb-2">📊</div>
                        <p>No stats configured</p>
                      </div>
                    )}
                </div>
              );
            })()}

          {/* Achievements Tab - Compact */}
          {contentTab === "achievements" && (
            <div>
              {adventure.storyTemplate?.achievements &&
              adventure.storyTemplate.achievements.filter((a) => !a.hidden)
                .length > 0 ? (
                <div className="space-y-2">
                  {adventure.storyTemplate.achievements
                    .filter((a) => !a.hidden)
                    .map((ach, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-3 p-3 bg-purple-900/20 border border-purple-800/30 rounded-xl"
                      >
                        <DynamicIcon
                          name={ach.symbol}
                          className="w-6 h-6 text-purple-400"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="font-medium">{ach.title}</div>
                          <div className="text-xs text-blue-200/60 truncate">
                            {ach.description}
                          </div>
                        </div>
                        {ach.rewardDescription && (
                          <span className="text-xs px-2 py-1 bg-purple-500/20 text-purple-300 rounded-lg shrink-0">
                            🎁 {ach.rewardDescription}
                          </span>
                        )}
                      </div>
                    ))}
                  {adventure.storyTemplate.achievements.filter((a) => a.hidden)
                    .length > 0 && (
                    <p className="text-xs text-blue-300/50 text-center pt-2">
                      +
                      {
                        adventure.storyTemplate.achievements.filter(
                          (a) => a.hidden
                        ).length
                      }{" "}
                      hidden achievements
                    </p>
                  )}
                </div>
              ) : (
                <div className="text-center py-8 text-blue-300/50">
                  <div className="text-3xl mb-2">🏆</div>
                  <p>No achievements configured</p>
                </div>
              )}
            </div>
          )}

          {/* Upgrades Tab - Compact */}
          {contentTab === "upgrades" && (
            <div>
              {adventure.storyTemplate?.upgradeSettings?.enabled ? (
                <div className="space-y-3">
                  <div className="p-3 bg-blue-900/20 border border-blue-800/30 rounded-xl">
                    <p className="text-sm text-blue-200/70">
                      ⚡ Earn points by completing story beats to upgrade your
                      character!
                    </p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {adventure.storyTemplate.upgradeSettings
                      .allowStatUpgrade && (
                      <div className="p-3 bg-blue-900/30 border border-blue-800/30 rounded-xl">
                        <div className="font-medium">💪 Stats</div>
                        <div className="text-xs text-blue-300/50">
                          {adventure.storyTemplate.upgradeSettings
                            .statUpgradeCost || 3}{" "}
                          pts → +
                          {adventure.storyTemplate.upgradeSettings
                            .statUpgradeAmount || 5}
                        </div>
                      </div>
                    )}
                    {adventure.storyTemplate.upgradeSettings
                      .allowResourceUpgrade && (
                      <div className="p-3 bg-green-900/20 border border-green-800/30 rounded-xl">
                        <div className="font-medium">🔋 Resources</div>
                        <div className="text-xs text-green-300/50">
                          {adventure.storyTemplate.upgradeSettings
                            .resourceUpgradeCost || 2}{" "}
                          pts → +
                          {adventure.storyTemplate.upgradeSettings
                            .resourceUpgradeAmount || 10}
                        </div>
                      </div>
                    )}
                    {adventure.storyTemplate.upgradeSettings.allowAddItem && (
                      <div className="p-3 bg-amber-900/20 border border-amber-800/30 rounded-xl">
                        <div className="font-medium">🎒 Items</div>
                        <div className="text-xs text-amber-300/50">
                          {adventure.storyTemplate.upgradeSettings
                            .addItemCost || 1}{" "}
                          pts per item
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 text-blue-300/50">
                  <div className="text-3xl mb-2">⚡</div>
                  <p>Upgrades disabled</p>
                </div>
              )}
            </div>
          )}
        </section>

        {/* Comments/Lore Section */}
        <section className="mb-8">
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => setActiveTab("overview")}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                activeTab === "overview"
                  ? "bg-purple-600 text-white"
                  : "bg-blue-900/30 hover:bg-blue-800/30"
              }`}
            >
              💬 Comments
            </button>
            <button
              onClick={() => setActiveTab("lore")}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                activeTab === "lore"
                  ? "bg-purple-600 text-white"
                  : "bg-blue-900/30 hover:bg-blue-800/30"
              }`}
            >
              📚 Lore ({adventure.storyTemplate?.lore?.length || 0})
            </button>
          </div>

          {activeTab === "overview" && (
            <div className="bg-blue-950/30 border border-blue-800/30 rounded-xl p-4">
              <Comments adventureId={adventureId} />
            </div>
          )}

          {activeTab === "lore" && adventure.storyTemplate?.lore && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showSecretLore}
                    onChange={(e) => setShowSecretLore(e.target.checked)}
                    className="rounded border-blue-700 bg-blue-900/50 text-purple-500"
                  />
                  Show Secret Lore
                </label>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {adventure.storyTemplate.lore
                  .filter((lore) => !lore.secrtet || showSecretLore)
                  .map((lore, i) => (
                    <div
                      key={i}
                      className={`p-4 rounded-xl border ${
                        lore.secrtet
                          ? "bg-purple-900/20 border-purple-800/30"
                          : "bg-blue-900/20 border-blue-800/30"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        {lore.thumbnailUrl && (
                          <img
                            src={lore.thumbnailUrl}
                            alt=""
                            className="w-10 h-10 rounded-lg object-cover"
                          />
                        )}
                        <div className="flex-1 min-w-0">
                          <h4 className="font-semibold flex items-center gap-1">
                            {lore.secrtet && (
                              <DynamicIcon
                                name="Lock"
                                className="w-3 h-3 text-purple-400"
                              />
                            )}
                            {lore.title}
                          </h4>
                          <p className="text-sm text-blue-200/60 mt-1 line-clamp-3">
                            {lore.content}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
              </div>

              {adventure.storyTemplate.lore.filter(
                (l) => !l.secrtet || showSecretLore
              ).length === 0 && (
                <div className="text-center py-8 text-blue-300/50">
                  <div className="text-3xl mb-2">📚</div>
                  <p>No lore entries</p>
                </div>
              )}
            </div>
          )}
        </section>
      </main>

      {/* Mobile Sticky Play Button */}
      <div className="sm:hidden fixed bottom-0 left-0 right-0 p-4 bg-gray-900/95 backdrop-blur-xl border-t border-blue-800/30 z-50">
        <button
          onClick={handleStartAdventure}
          disabled={startingAdventure}
          className="w-full py-3 bg-linear-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white font-bold rounded-xl transition-all disabled:opacity-50"
        >
          {startingAdventure ? "Starting..." : user ? "▶ Play" : "🔐 Sign In"}
        </button>
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
