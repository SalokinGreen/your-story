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

interface ProfileUser {
  id: string;
  email: string;
  created_at: string;
  display_name?: string;
  role?: string;
}

interface ProfileData {
  avatar_url?: string;
  bio?: string;
  location?: string;
  website?: string;
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

  const userId = params?.userId as string;
  const isOwnProfile = currentUser?.id === userId;

  useEffect(() => {
    if (authLoading) return;

    if (!currentUser) {
      router.push("/");
      return;
    }

    loadProfile();
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
        email: userData.email,
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

      // Fetch token balance
      const tokenBalance = await getUserTokenBalance(userId);
      setBalance(tokenBalance);

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

  const handleRefresh = () => {
    loadProfile();
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
        <div className="text-center bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8 border border-gray-200 dark:border-gray-700">
          <h1 className="text-2xl sm:text-3xl font-bold mb-4 text-gray-900 dark:text-white">User Not Found</h1>
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
    <div className="min-h-screen bg-linear-to-br from-blue-50 via-purple-50 to-pink-50 dark:from-gray-900 dark:via-purple-900 dark:to-blue-900 p-4 sm:p-8">
      <div className="max-w-4xl mx-auto">
        <div className="mb-6 flex items-center justify-between">
          <button
            onClick={() => router.back()}
            className="px-4 py-2 bg-white dark:bg-gray-800 border-2 border-gray-300 dark:border-gray-600 hover:border-blue-500 dark:hover:border-blue-400 text-gray-900 dark:text-white font-semibold rounded-lg transition-colors shadow-md hover:shadow-lg"
          >
            ← Back
          </button>
          {isOwnProfile && (
            <span className="px-4 py-2 bg-linear-to-r from-blue-600 to-purple-600 text-white text-sm font-semibold rounded-full shadow-md">
              Your Profile
            </span>
          )}
        </div>

        <div className="space-y-6">
          {/* Header with Avatar and Profile Info */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6 sm:p-8 border border-gray-200 dark:border-gray-700">
            <div className="flex items-start gap-4 mb-4">
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
                      {(
                        profileUser.display_name?.[0] || profileUser.email[0]
                      ).toUpperCase()}
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
              <div className="space-y-3 border-t border-gray-200 dark:border-gray-700 pt-4 mt-4">
                {profileData.bio && (
                  <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
                    <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                      Bio
                    </p>
                    <p className="text-gray-800 dark:text-gray-200 whitespace-pre-wrap">
                      {profileData.bio}
                    </p>
                  </div>
                )}
                {profileData.location && (
                  <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
                    <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                      Location
                    </p>
                    <p className="text-gray-800 dark:text-gray-200">
                      📍 {profileData.location}
                    </p>
                  </div>
                )}
                {profileData.website && (
                  <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
                    <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                      Website
                    </p>
                    <a
                      href={profileData.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                    >
                      🔗 {profileData.website}
                    </a>
                  </div>
                )}
              </div>
            )}

            {/* Edit Profile Button */}
            {isOwnProfile && (
              <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
                <EditProfile
                  userId={userId}
                  currentProfile={profileData || {}}
                  onSuccess={handleRefresh}
                />
              </div>
            )}
          </div>

          {/* Token Balance */}
          {balance && <TokenBalanceDisplay balance={balance} loading={false} />}
             {/* Refresh Button */}
          <div className="flex justify-center">
            <button
              onClick={handleRefresh}
              className="px-6 py-3 bg-white dark:bg-gray-800 border-2 border-gray-300 dark:border-gray-600 hover:border-purple-500 dark:hover:border-purple-400 font-semibold transition-all rounded-lg shadow-md hover:shadow-lg text-gray-900 dark:text-white"
            >
              🔄 Refresh Balance
            </button>
          </div>
          {/* Gift Form (only show if viewing another user's profile) */}
          {!isOwnProfile && currentUser && (
            <GiftTokenForm
              recipientId={profileUser.id}
              recipientEmail={profileUser.email}
              onSuccess={handleRefresh}
            />
          )}

          {/* Admin Controls */}
          {userIsAdmin && (
            <AdminControls
              userId={profileUser.id}
              userEmail={profileUser.email}
              currentRole={profileUser.role}
              onSuccess={handleRefresh}
            />
          )}

         
        </div>
      </div>
    </div>
  );
}
