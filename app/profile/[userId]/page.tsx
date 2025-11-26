"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/app/misc/AuthContext";
import { supabase } from "@/app/misc/supabase";
import { getUserTokenBalance, TokenBalance } from "@/app/misc/tokens";
import { isAdmin } from "@/app/misc/auth";
import TokenBalanceDisplay from "@/app/components/TokenBalanceDisplay";
import GiftTokenForm from "@/app/components/GiftTokenForm";
import AdminControls from "@/app/components/AdminControls";
import EditDisplayName from "@/app/components/EditDisplayName";
import EditProfile from "@/app/components/EditProfile";
import UserOptions from "@/app/components/UserOptions";
import { Adventure, Story } from "@/app/misc/structs";
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

  const handleRefresh = () => {
    loadProfile();
    loadAdventures();
  };

  const getDifficultyColor = (difficulty: string) => {
    const lower = difficulty.toLowerCase();
    switch (lower) {
      case "easy":
        return "text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/30 border-green-200 dark:border-green-800";
      case "medium":
        return "text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/30 border-yellow-200 dark:border-yellow-800";
      case "hard":
        return "text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/30 border-orange-200 dark:border-orange-800";
      case "expert":
        return "text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-800";
      default:
        return "text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-900/30 border-gray-200 dark:border-gray-800";
    }
  };

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-linear-to-br from-blue-50 via-purple-50 to-pink-50 dark:from-gray-900 dark:via-purple-900 dark:to-blue-900">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 dark:border-purple-400"></div>
      </div>
    );
  }

  if (!profileUser) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-linear-to-br from-blue-50 via-purple-50 to-pink-50 dark:from-gray-900 dark:via-purple-900 dark:to-blue-900">
        <div className="text-center bg-white dark:bg-blue-950 rounded-2xl shadow-xl p-8 border border-gray-200 dark:border-gray-700">
          <h1 className="text-2xl sm:text-3xl font-bold mb-4 text-gray-900 dark:text-white">
            User Not Found
          </h1>
          <button
            onClick={() => router.push("/")}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 text-white font-semibold rounded-lg transition-colors shadow-md"
          >
            Go Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-linear-to-br from-blue-50 via-purple-50 to-pink-50 dark:from-gray-900 dark:via-purple-900 dark:to-blue-900 p-3 sm:p-6 pt-20 sm:pt-22">
      <div className="max-w-4xl mx-auto">
        <div className="mb-4 flex items-center justify-between">
          <button
            onClick={() => router.back()}
            className="px-3 py-1.5 bg-white dark:bg-blue-950 border-2 border-gray-300 dark:border-gray-600 hover:border-blue-500 dark:hover:border-blue-400 text-gray-900 dark:text-white font-semibold rounded-lg transition-colors shadow-md hover:shadow-lg text-sm"
          >
            ← Back
          </button>
          {isOwnProfile && (
            <span className="px-3 py-1.5 bg-linear-to-r from-blue-600 to-purple-600 text-white text-sm font-semibold rounded-full shadow-md">
              Your Profile
            </span>
          )}
        </div>

        <div className="space-y-4">
          {/* Header with Avatar and Profile Info */}
          <div className="bg-white dark:bg-blue-950 rounded-xl shadow-lg p-4 sm:p-5 border border-gray-200 dark:border-gray-700">
            <div className="flex items-start gap-4 mb-3">
              {/* Avatar */}
              <div className="shrink-0">
                {profileData?.avatar_url ? (
                  <img
                    src={profileData.avatar_url}
                    alt={`${profileUser.display_name || "User"}'s avatar`}
                    className="w-20 h-20 sm:w-24 sm:h-24 rounded-full object-cover border-2 border-black dark:border-white"
                  />
                ) : (
                  <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-linear-to-br from-blue-400 to-purple-500 flex items-center justify-center border-2 border-white dark:border-gray-700 shadow-lg">
                    <span className="text-2xl sm:text-3xl font-bold text-white">
                      {(profileUser.display_name?.[0] || "A").toUpperCase()}
                    </span>
                  </div>
                )}
              </div>

              {/* User Info */}
              <div className="flex-1">
                <h1 className="text-2xl sm:text-3xl font-bold mb-2 bg-linear-to-r from-blue-600 via-purple-600 to-pink-600 bg-clip-text text-transparent">
                  {profileUser.display_name || "ANON"}
                </h1>
                <p className="text-gray-600 dark:text-gray-400 mb-3">
                  Member since:{" "}
                  {new Date(profileUser.created_at).toLocaleDateString()}
                </p>
                {isOwnProfile && (
                  <EditDisplayName
                    currentDisplayName={profileUser.display_name || null}
                    onSuccess={handleRefresh}
                  />
                )}
              </div>
            </div>

            {/* Profile Details */}
            {profileData && (
              <div className="space-y-3 border-t border-gray-200 dark:border-gray-700 pt-3 mt-3">
                {profileData.bio && (
                  <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-3">
                    <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
                      Bio
                    </p>
                    <p className="text-gray-800 dark:text-gray-200 whitespace-pre-wrap text-sm">
                      {profileData.bio}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Edit Profile Button */}
            {isOwnProfile && (
              <div className="mt-4 pt-3 border-t border-gray-200 dark:border-gray-700">
                <EditProfile
                  userId={userId}
                  currentProfile={profileData || {}}
                  onSuccess={handleRefresh}
                />
              </div>
            )}
          </div>

          {/* User Options (only for own profile) */}
          {isOwnProfile && <UserOptions />}

          {/* Token Balance */}
          {balance && <TokenBalanceDisplay balance={balance} loading={false} />}
          {/* Refresh Button */}
          <div className="flex justify-center">
            <button
              onClick={handleRefresh}
              className="px-4 py-2 bg-white dark:bg-blue-950 border-2 border-gray-300 dark:border-gray-600 hover:border-purple-500 dark:hover:border-purple-400 font-semibold transition-all rounded-lg shadow-md hover:shadow-lg text-gray-900 dark:text-white flex items-center gap-2 text-sm"
            >
              <DynamicIcon name="RefreshCw" className="w-4 h-4" /> Refresh
              Balance
            </button>
          </div>
          {/* Gift Form (only show if viewing another user's profile) */}
          {!isOwnProfile && currentUser && (
            <GiftTokenForm
              recipientId={profileUser.id}
              recipientName={profileUser.display_name || "this user"}
              onSuccess={handleRefresh}
            />
          )}

          {/* Adventures Section */}
          <div className="bg-white dark:bg-blue-950 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="border-b border-gray-200 dark:border-gray-700 px-4 py-3 bg-purple-50 dark:bg-purple-900/30">
              <h2 className="text-lg font-bold text-purple-600 dark:text-purple-400 flex items-center gap-2">
                <DynamicIcon name="Gamepad2" className="w-5 h-5" /> Adventures (
                {adventures.length})
              </h2>
            </div>

            <div className="p-4">
              {loadingAdventures ? (
                <div className="flex justify-center py-8">
                  <div className="animate-spin rounded-full h-10 w-10 border-4 border-purple-600 border-t-transparent"></div>
                </div>
              ) : adventures.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-gray-600 dark:text-gray-400 mb-3">
                    {isOwnProfile
                      ? "You haven't created any adventures yet."
                      : "This user hasn't created any adventures yet."}
                  </p>
                  {isOwnProfile && (
                    <button
                      onClick={() => router.push("/creator")}
                      className="px-4 py-2 bg-linear-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white font-semibold rounded-lg shadow-lg hover:shadow-xl transition-all text-sm"
                    >
                      Create Your First Adventure
                    </button>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {adventures.map((adventure) => (
                    <div
                      key={adventure.id}
                      onClick={() => router.push(`/explorer/${adventure.id}`)}
                      className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-3 hover:shadow-md hover:-translate-y-0.5 transition-all duration-150 cursor-pointer border border-gray-200 dark:border-gray-600 hover:border-purple-500 dark:hover:border-purple-400"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <h3 className="font-bold text-gray-900 dark:text-white line-clamp-2 flex-1">
                          {adventure.title}
                        </h3>
                        {adventure.isFeatured && (
                          <DynamicIcon
                            name="Star"
                            className="w-4 h-4 text-yellow-500 ml-2"
                          />
                        )}
                      </div>
                      <p className="text-gray-600 dark:text-gray-400 text-sm mb-2 line-clamp-2">
                        {adventure.shortDescription}
                      </p>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs font-bold border capitalize ${getDifficultyColor(
                            adventure.difficulty
                          )}`}
                        >
                          {adventure.difficulty}
                        </span>
                        <span className="text-xs text-gray-600 dark:text-gray-400 flex items-center gap-1">
                          <DynamicIcon name="Star" className="w-3 h-3" />{" "}
                          {adventure.rating?.toFixed(1) || "N/A"}
                        </span>
                        <span className="text-xs text-gray-600 dark:text-gray-400 flex items-center gap-1">
                          <DynamicIcon name="Gamepad2" className="w-3 h-3" />{" "}
                          {adventure.playCount} plays
                        </span>
                      </div>
                      {!adventure.isPublished && (
                        <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-600">
                          <span className="text-xs font-semibold text-orange-600 dark:text-orange-400 flex items-center gap-1">
                            <DynamicIcon name="FileEdit" className="w-3 h-3" />{" "}
                            Draft
                          </span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* IMPORTANT: Admin Controls must always remain at the very bottom of the page */}
          {/* Admin Controls */}
          {userIsAdmin && (
            <AdminControls
              userId={profileUser.id}
              userName={profileUser.display_name || "this user"}
              currentRole={profileUser.role}
              onSuccess={handleRefresh}
            />
          )}
        </div>
      </div>
    </div>
  );
}
