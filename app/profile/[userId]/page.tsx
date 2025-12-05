"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/app/misc/AuthContext";
import { supabase } from "@/app/misc/supabase";
import { TokenBalance } from "@/app/misc/tokens";
import GiftTokenForm from "@/app/components/GiftTokenForm";
import AdminControls from "@/app/components/AdminControls";
import EditDisplayName from "@/app/components/EditDisplayName";
import EditProfile from "@/app/components/EditProfile";
import UserOptions from "@/app/components/UserOptions";
import SubscriptionCard from "@/app/components/SubscriptionCard";
import PricingTable from "@/app/components/PricingTable";
import { Adventure } from "@/app/misc/structs";
import { DynamicIcon } from "@/app/components/DynamicIcon";

interface ProfileUser {
  id: string;
  created_at: string;
  display_name?: string;
  role?: string;
}

interface ProfileData {
  avatar_url?: string;
  bio?: string;
}

interface ActivityItem {
  id: string;
  type: "comment" | "rating" | "adventure_created" | "adventure_updated";
  timestamp: string;
  data: {
    adventureId?: string;
    adventureTitle?: string;
    content?: string;
    rating?: number;
  };
}

export default function ProfilePage() {
  const params = useParams();
  const router = useRouter();
  const { user: currentUser, loading: authLoading } = useAuth();
  const [profileUser, setProfileUser] = useState<ProfileUser | null>(null);
  const [profileData, setProfileData] = useState<ProfileData | null>(null);
  const [balance, setBalance] = useState<TokenBalance | null>(null);
  const [loading, setLoading] = useState(true);
  const [userIsAdmin, setUserIsAdmin] = useState(false);
  const [adventures, setAdventures] = useState<Adventure[]>([]);
  const [loadingAdventures, setLoadingAdventures] = useState(true);
  const [showGiftForm, setShowGiftForm] = useState(false);
  const [showPricing, setShowPricing] = useState(false);
  const [activeTab, setActiveTab] = useState<"adventures" | "activity">(
    "adventures"
  );
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [loadingActivities, setLoadingActivities] = useState(false);
  const [activityPage, setActivityPage] = useState(1);
  const [hasMoreActivities, setHasMoreActivities] = useState(false);

  const userId = params?.userId as string;
  const isOwnProfile = currentUser?.id === userId;

  useEffect(() => {
    if (authLoading) return;

    if (!currentUser) {
      router.push("/");
      return;
    }

    loadProfile();
    loadAdventures();
  }, [userId, currentUser, authLoading]);

  const loadProfile = async () => {
    setLoading(true);

    try {
      // Get session token
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        console.error("No session found");
        setLoading(false);
        return;
      }

      // Fetch user data via API route
      const userResponse = await fetch(`/api/users/${userId}`, {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (!userResponse.ok) {
        console.error("Error fetching user:", await userResponse.text());
        setLoading(false);
        return;
      }

      const userData = await userResponse.json();
      setProfileUser({
        id: userData.id,
        created_at: userData.created_at,
        display_name: userData.user_metadata?.display_name || null,
        role:
          userData.user_metadata?.role || userData.app_metadata?.role || "user",
      });

      // Fetch profile data (avatar, bio, etc.)
      const profileResponse = await fetch(`/api/profiles/${userId}`, {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (profileResponse.ok) {
        const profData = await profileResponse.json();
        setProfileData(profData);
      }

      // Fetch token balance via API (uses service role for accuracy)
      const balanceResponse = await fetch(
        `/api/tokens/balance?userId=${userId}`,
        {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        }
      );

      console.log("Balance API response status:", balanceResponse.status);

      if (balanceResponse.ok) {
        const { balance: tokenBalance } = await balanceResponse.json();
        console.log("Balance fetched from API:", tokenBalance);
        setBalance(tokenBalance);
      } else {
        const errorText = await balanceResponse.text();
        console.error(
          "Failed to fetch token balance:",
          balanceResponse.status,
          errorText
        );
      }

      // Check if current user is admin (client-side check using auth context)
      if (currentUser) {
        // Simple check based on user metadata (will need proper admin API if needed)
        const {
          data: { user },
        } = await supabase.auth.getUser();
        const adminStatus =
          user?.user_metadata?.role === "admin" ||
          user?.app_metadata?.role === "admin";
        setUserIsAdmin(adminStatus);
      }
    } catch (error) {
      console.error("Error loading profile:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadAdventures = async () => {
    setLoadingAdventures(true);
    try {
      const response = await fetch(`/api/adventures?userId=${userId}`);
      if (response.ok) {
        const { adventures: userAdventures } = await response.json();
        setAdventures(userAdventures);
      }
    } catch (error) {
      console.error("Error loading adventures:", error);
    } finally {
      setLoadingAdventures(false);
    }
  };

  const loadActivities = async (page: number = 1, append: boolean = false) => {
    setLoadingActivities(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return;

      const response = await fetch(
        `/api/activity/${userId}?page=${page}&limit=15`,
        {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        }
      );
      if (response.ok) {
        const { activities: userActivities, pagination } =
          await response.json();
        if (append) {
          setActivities((prev) => [...prev, ...userActivities]);
        } else {
          setActivities(userActivities);
        }
        setActivityPage(page);
        setHasMoreActivities(pagination.hasMore);
      }
    } catch (error) {
      console.error("Error loading activities:", error);
    } finally {
      setLoadingActivities(false);
    }
  };

  const loadMoreActivities = () => {
    if (!loadingActivities && hasMoreActivities) {
      loadActivities(activityPage + 1, true);
    }
  };

  // Load activities when switching to activity tab
  useEffect(() => {
    if (
      activeTab === "activity" &&
      activities.length === 0 &&
      !loadingActivities
    ) {
      loadActivities(1, false);
    }
  }, [activeTab]);

  const handleRefresh = () => {
    loadProfile();
    loadAdventures();
    if (activeTab === "activity") {
      setActivities([]);
      setActivityPage(1);
      loadActivities(1, false);
    }
  };

  const formatActivityTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  const getActivityIcon = (type: ActivityItem["type"]) => {
    switch (type) {
      case "comment":
        return "MessageCircle";
      case "rating":
        return "Star";
      case "adventure_created":
        return "Plus";
      case "adventure_updated":
        return "Edit";
      default:
        return "Activity";
    }
  };

  const getActivityColor = (type: ActivityItem["type"]) => {
    switch (type) {
      case "comment":
        return "text-blue-400";
      case "rating":
        return "text-yellow-400";
      case "adventure_created":
        return "text-green-400";
      case "adventure_updated":
        return "text-purple-400";
      default:
        return "text-blue-200";
    }
  };

  const getActivityText = (activity: ActivityItem) => {
    switch (activity.type) {
      case "comment":
        return (
          <>
            commented on{" "}
            <button
              onClick={() =>
                router.push(`/explorer/${activity.data.adventureId}`)
              }
              className="font-medium text-blue-400 hover:underline"
            >
              {activity.data.adventureTitle}
            </button>
          </>
        );
      case "rating":
        return (
          <>
            rated{" "}
            <button
              onClick={() =>
                router.push(`/explorer/${activity.data.adventureId}`)
              }
              className="font-medium text-blue-400 hover:underline"
            >
              {activity.data.adventureTitle}
            </button>{" "}
            <span className="text-yellow-400">
              {"★".repeat(activity.data.rating || 0)}
              {"☆".repeat(5 - (activity.data.rating || 0))}
            </span>
          </>
        );
      case "adventure_created":
        return (
          <>
            created{" "}
            <button
              onClick={() =>
                router.push(`/explorer/${activity.data.adventureId}`)
              }
              className="font-medium text-blue-400 hover:underline"
            >
              {activity.data.adventureTitle}
            </button>
          </>
        );
      case "adventure_updated":
        return (
          <>
            updated{" "}
            <button
              onClick={() =>
                router.push(`/explorer/${activity.data.adventureId}`)
              }
              className="font-medium text-blue-400 hover:underline"
            >
              {activity.data.adventureTitle}
            </button>
          </>
        );
      default:
        return "did something";
    }
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-linear-to-br from-gray-900 via-blue-950 to-purple-950 flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-2 border-blue-400 border-t-transparent"></div>
      </div>
    );
  }

  if (!profileUser) {
    return (
      <div className="min-h-screen bg-linear-to-br from-gray-900 via-blue-950 to-purple-950 flex items-center justify-center p-4">
        <div className="text-center bg-blue-950/50 rounded-xl p-6 border border-blue-800/30">
          <h1 className="text-xl font-bold text-white mb-3">User Not Found</h1>
          <button
            onClick={() => router.push("/")}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
          >
            Go Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-linear-to-br from-gray-900 via-blue-950 to-purple-950">
      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* Header Bar */}
        <div className="flex items-center justify-between mb-6">
          <button
            onClick={() => router.back()}
            className="px-3 py-1.5 bg-blue-950/50 hover:bg-blue-900/50 text-blue-200 text-sm font-medium rounded-lg border border-blue-800/30 transition-colors flex items-center gap-1"
          >
            <DynamicIcon name="ArrowLeft" className="w-4 h-4" /> Back
          </button>
          {isOwnProfile && (
            <EditProfile
              userId={userId}
              currentProfile={profileData || {}}
              onSuccess={handleRefresh}
            />
          )}
        </div>

        {/* Profile Header - Compact */}
        <div className="bg-blue-950/50 rounded-xl border border-blue-800/30 p-4 mb-4">
          <div className="flex items-start gap-4">
            {/* Avatar */}
            {profileData?.avatar_url ? (
              <img
                src={profileData.avatar_url}
                alt={`${profileUser.display_name || "User"}'s avatar`}
                className="w-16 h-16 rounded-full object-cover border-2 border-blue-600"
              />
            ) : (
              <div className="w-16 h-16 rounded-full bg-linear-to-br from-blue-500 to-purple-600 flex items-center justify-center border-2 border-blue-600">
                <span className="text-xl font-bold text-white">
                  {(profileUser.display_name?.[0] || "A").toUpperCase()}
                </span>
              </div>
            )}

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h1 className="text-xl font-bold text-white truncate">
                  {profileUser.display_name || "Anonymous"}
                </h1>
                {profileUser.role === "admin" && (
                  <span className="px-1.5 py-0.5 bg-purple-500/20 text-purple-300 text-xs rounded">
                    Admin
                  </span>
                )}
              </div>
              <p className="text-sm text-blue-200/40 mb-2">
                Joined{" "}
                {new Date(profileUser.created_at).toLocaleDateString("en-US", {
                  month: "short",
                  year: "numeric",
                })}
                {adventures.length > 0 &&
                  ` • ${adventures.length} adventure${
                    adventures.length !== 1 ? "s" : ""
                  }`}
              </p>
              {profileData?.bio && (
                <p className="text-sm text-blue-200/60 line-clamp-2">
                  {profileData.bio}
                </p>
              )}
              {isOwnProfile && (
                <div className="mt-2">
                  <EditDisplayName
                    currentDisplayName={profileUser.display_name || null}
                    onSuccess={handleRefresh}
                  />
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex gap-2 shrink-0">
              {!isOwnProfile && currentUser && (
                <button
                  onClick={() => setShowGiftForm(!showGiftForm)}
                  className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors flex items-center gap-1 ${
                    showGiftForm
                      ? "bg-purple-600 text-white"
                      : "bg-blue-950/80 text-blue-200 border border-blue-800/30 hover:border-blue-600/50"
                  }`}
                >
                  <DynamicIcon name="Gift" className="w-4 h-4" /> Gift
                </button>
              )}
              <button
                onClick={handleRefresh}
                className="p-1.5 bg-blue-950/80 text-blue-200 rounded-lg border border-blue-800/30 hover:border-blue-600/50 transition-colors"
                title="Refresh"
              >
                <DynamicIcon name="RefreshCw" className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Gift Form - Collapsible */}
          {showGiftForm && !isOwnProfile && currentUser && (
            <div className="mt-4 pt-4 border-t border-blue-800/30">
              <GiftTokenForm
                recipientId={profileUser.id}
                recipientName={profileUser.display_name || "this user"}
                onSuccess={() => {
                  handleRefresh();
                  setShowGiftForm(false);
                }}
              />
            </div>
          )}
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="bg-blue-950/50 rounded-xl border border-blue-800/30 p-3 text-center">
            <div className="flex items-center justify-center gap-1.5 text-yellow-400 mb-1">
              <DynamicIcon name="Coins" className="w-4 h-4" />
              <span className="text-lg font-bold">{balance?.total ?? "-"}</span>
            </div>
            <p className="text-xs text-blue-200/40">Coins</p>
          </div>
          <div className="bg-blue-950/50 rounded-xl border border-blue-800/30 p-3 text-center">
            <div className="flex items-center justify-center gap-1.5 text-green-400 mb-1">
              <DynamicIcon name="Send" className="w-4 h-4" />
              <span className="text-lg font-bold">
                {balance?.tradable ?? "-"}
              </span>
            </div>
            <p className="text-xs text-blue-200/40">Tradable</p>
          </div>
          <div className="bg-blue-950/50 rounded-xl border border-blue-800/30 p-3 text-center">
            <div className="flex items-center justify-center gap-1.5 text-purple-400 mb-1">
              <DynamicIcon name="Map" className="w-4 h-4" />
              <span className="text-lg font-bold">{adventures.length}</span>
            </div>
            <p className="text-xs text-blue-200/40">Adventures</p>
          </div>
        </div>

        {/* Subscription Card (only for own profile) */}
        {isOwnProfile && (
          <div className="mb-4">
            <SubscriptionCard onUpgrade={() => setShowPricing(true)} />
          </div>
        )}

        {/* User Options (only for own profile) */}
        {isOwnProfile && (
          <div className="mb-4">
            <UserOptions />
          </div>
        )}

        {/* Tab Navigation */}
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setActiveTab("adventures")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
              activeTab === "adventures"
                ? "bg-blue-600 text-white"
                : "bg-blue-950/50 text-blue-200/60 hover:text-blue-200 border border-blue-800/30"
            }`}
          >
            <DynamicIcon name="Map" className="w-4 h-4" /> Adventures
          </button>
          <button
            onClick={() => setActiveTab("activity")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
              activeTab === "activity"
                ? "bg-blue-600 text-white"
                : "bg-blue-950/50 text-blue-200/60 hover:text-blue-200 border border-blue-800/30"
            }`}
          >
            <DynamicIcon name="Activity" className="w-4 h-4" /> Activity
          </button>
        </div>

        {/* Tab Content */}
        {activeTab === "adventures" && (
          <div className="bg-blue-950/50 rounded-xl border border-blue-800/30 p-4">
            {loadingAdventures ? (
              <div className="flex justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-400 border-t-transparent"></div>
              </div>
            ) : adventures.length === 0 ? (
              <div className="text-center py-8">
                <DynamicIcon
                  name="Map"
                  className="w-12 h-12 text-blue-200/20 mx-auto mb-3"
                />
                <p className="text-blue-200/40 mb-3">
                  {isOwnProfile
                    ? "You haven&apos;t created any adventures yet."
                    : "This user hasn&apos;t created any public adventures."}
                </p>
                {isOwnProfile && (
                  <button
                    onClick={() => router.push("/creator")}
                    className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white font-medium rounded-lg transition-colors text-sm"
                  >
                    Create Adventure
                  </button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {adventures.map((adventure) => (
                  <div
                    key={adventure.id}
                    onClick={() => router.push(`/explorer/${adventure.id}`)}
                    className="bg-blue-900/30 rounded-lg p-3 cursor-pointer hover:bg-blue-900/50 border border-blue-800/20 hover:border-blue-600/50 transition-all"
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <h3 className="font-medium text-white text-sm line-clamp-1">
                        {adventure.title}
                      </h3>
                      {!adventure.isPublished && (
                        <span className="px-1.5 py-0.5 bg-orange-500/20 text-orange-300 text-xs rounded shrink-0">
                          Draft
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-blue-200/40 line-clamp-2 mb-2">
                      {adventure.shortDescription}
                    </p>
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-yellow-400 flex items-center gap-0.5">
                        <DynamicIcon
                          name="Star"
                          className="w-3 h-3 fill-current"
                        />
                        {adventure.rating?.toFixed(1) || "-"}
                      </span>
                      <span className="text-blue-200/40">
                        {adventure.playCount} plays
                      </span>
                      <span
                        className={`px-1.5 py-0.5 rounded text-xs capitalize ${
                          adventure.difficulty === "easy"
                            ? "bg-green-500/20 text-green-300"
                            : adventure.difficulty === "medium"
                            ? "bg-yellow-500/20 text-yellow-300"
                            : adventure.difficulty === "hard"
                            ? "bg-orange-500/20 text-orange-300"
                            : "bg-red-500/20 text-red-300"
                        }`}
                      >
                        {adventure.difficulty}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === "activity" && (
          <div className="bg-blue-950/50 rounded-xl border border-blue-800/30 p-4">
            {loadingActivities ? (
              <div className="flex justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-400 border-t-transparent"></div>
              </div>
            ) : activities.length === 0 ? (
              <div className="text-center py-8">
                <DynamicIcon
                  name="Activity"
                  className="w-12 h-12 text-blue-200/20 mx-auto mb-3"
                />
                <p className="text-blue-200/40">
                  {isOwnProfile
                    ? "No activity yet. Create an adventure or leave a comment to get started!"
                    : "This user hasn't had any public activity yet."}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {activities.map((activity) => (
                  <div
                    key={activity.id}
                    className="flex items-start gap-3 p-3 bg-blue-900/30 rounded-lg border border-blue-800/20"
                  >
                    <div
                      className={`p-2 rounded-lg bg-blue-950/50 ${getActivityColor(
                        activity.type
                      )}`}
                    >
                      <DynamicIcon
                        name={getActivityIcon(activity.type)}
                        className="w-4 h-4"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-blue-100">
                        {getActivityText(activity)}
                      </p>
                      {activity.type === "comment" && activity.data.content && (
                        <p className="text-xs text-blue-200/50 mt-1 line-clamp-2">
                          &ldquo;{activity.data.content}&rdquo;
                        </p>
                      )}
                      <p className="text-xs text-blue-200/30 mt-1">
                        {formatActivityTime(activity.timestamp)}
                      </p>
                    </div>
                  </div>
                ))}

                {/* Load More Button */}
                {hasMoreActivities && (
                  <button
                    onClick={loadMoreActivities}
                    disabled={loadingActivities}
                    className="w-full py-2 mt-2 text-sm font-medium text-blue-300 hover:text-blue-100 bg-blue-900/30 hover:bg-blue-900/50 border border-blue-800/30 rounded-lg transition-colors disabled:opacity-50"
                  >
                    {loadingActivities ? (
                      <span className="flex items-center justify-center gap-2">
                        <div className="animate-spin rounded-full h-4 w-4 border-2 border-blue-400 border-t-transparent"></div>
                        Loading...
                      </span>
                    ) : (
                      "Load More"
                    )}
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* IMPORTANT: Admin Controls must always remain at the very bottom of the page */}
        {userIsAdmin && (
          <div className="mt-4">
            <AdminControls
              userId={profileUser.id}
              userName={profileUser.display_name || "this user"}
              currentRole={profileUser.role}
              onSuccess={handleRefresh}
            />
          </div>
        )}
      </div>

      {/* Pricing Modal */}
      {showPricing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-blue-950 rounded-2xl border border-blue-800/30 max-w-6xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-blue-950 border-b border-blue-800/30 px-4 py-3 flex items-center justify-between">
              <h2 className="text-lg font-bold text-white">
                Subscription Plans
              </h2>
              <button
                onClick={() => setShowPricing(false)}
                className="p-1.5 hover:bg-blue-900/50 rounded-lg transition-colors"
              >
                <DynamicIcon name="X" className="w-5 h-5 text-blue-200/60" />
              </button>
            </div>
            <PricingTable onClose={() => setShowPricing(false)} />
          </div>
        </div>
      )}
    </div>
  );
}
