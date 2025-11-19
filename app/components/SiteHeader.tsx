"use client";

import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/app/misc/AuthContext";
import { useEffect, useState } from "react";
import { supabase } from "@/app/misc/supabase";

interface ProfileData {
  avatar_url?: string;
}

export default function SiteHeader() {
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useAuth();
  const [profileData, setProfileData] = useState<ProfileData | null>(null);
  const [displayName, setDisplayName] = useState<string>("");

  useEffect(() => {
    if (!user) return;

    const loadProfile = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session) return;

        // Get display name from user metadata
        const name = user.user_metadata?.display_name || "ANON";
        setDisplayName(name);

        // Fetch profile data
        const profileResponse = await fetch(`/api/profiles/${user.id}`, {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        });

        if (profileResponse.ok) {
          const profData = await profileResponse.json();
          setProfileData(profData);
        }
      } catch (error) {
        console.error("Error loading profile:", error);
      }
    };

    loadProfile();
  }, [user]);

  if (!user) return null;

  const isActive = (path: string) => pathname === path;

  return (
    <header className="sticky top-0 z-50 bg-white dark:bg-gray-800 border-b-2 border-gray-200 dark:border-gray-700 shadow-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo/Brand */}
          <button
            onClick={() => router.push("/")}
            className="flex items-center gap-2 text-xl font-bold bg-linear-to-r from-blue-600 via-purple-600 to-pink-600 bg-clip-text text-transparent hover:opacity-80 transition-opacity"
          >
            📖 Your Story
          </button>

          {/* Navigation */}
          <nav className="hidden md:flex items-center gap-2">
            <button
              onClick={() => router.push("/library")}
              className={`px-4 py-2 rounded-lg font-semibold transition-all ${
                isActive("/library")
                  ? "bg-purple-600 text-white shadow-md"
                  : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
              }`}
            >
              📚 Library
            </button>
            <button
              onClick={() => router.push("/explorer")}
              className={`px-4 py-2 rounded-lg font-semibold transition-all ${
                isActive("/explorer")
                  ? "bg-purple-600 text-white shadow-md"
                  : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
              }`}
            >
              🗺️ Explorer
            </button>
            <button
              onClick={() => router.push("/creator")}
              className={`px-4 py-2 rounded-lg font-semibold transition-all ${
                isActive("/creator")
                  ? "bg-purple-600 text-white shadow-md"
                  : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
              }`}
            >
              ✨ Creator
            </button>
          </nav>

          {/* Profile */}
          <button
            onClick={() => router.push(`/profile/${user.id}`)}
            className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <span className="text-sm font-semibold text-gray-900 dark:text-white">
              {displayName}
            </span>
            {profileData?.avatar_url ? (
              <img
                src={profileData.avatar_url}
                alt={`${displayName}'s avatar`}
                className="w-10 h-10 rounded-full object-cover border-2 border-purple-500"
              />
            ) : (
              <div className="w-10 h-10 rounded-full bg-linear-to-br from-blue-400 to-purple-500 flex items-center justify-center border-2 border-purple-500 shadow-md">
                <span className="text-lg font-bold text-white">
                  {displayName[0]?.toUpperCase() || "?"}
                </span>
              </div>
            )}
          </button>

          {/* Mobile Menu Button */}
          <button
            onClick={() => {
              const menu = document.getElementById("mobile-menu");
              if (menu) {
                menu.classList.toggle("hidden");
              }
            }}
            className="md:hidden p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <svg
              className="w-6 h-6 text-gray-900 dark:text-white"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 6h16M4 12h16M4 18h16"
              />
            </svg>
          </button>
        </div>

        {/* Mobile Menu */}
        <div id="mobile-menu" className="hidden md:hidden pb-4">
          <nav className="flex flex-col gap-2">
            <button
              onClick={() => {
                router.push("/library");
                document.getElementById("mobile-menu")?.classList.add("hidden");
              }}
              className={`px-4 py-2 rounded-lg font-semibold text-left transition-all ${
                isActive("/library")
                  ? "bg-purple-600 text-white shadow-md"
                  : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
              }`}
            >
              📚 Library
            </button>
            <button
              onClick={() => {
                router.push("/explorer");
                document.getElementById("mobile-menu")?.classList.add("hidden");
              }}
              className={`px-4 py-2 rounded-lg font-semibold text-left transition-all ${
                isActive("/explorer")
                  ? "bg-purple-600 text-white shadow-md"
                  : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
              }`}
            >
              🗺️ Explorer
            </button>
            <button
              onClick={() => {
                router.push("/creator");
                document.getElementById("mobile-menu")?.classList.add("hidden");
              }}
              className={`px-4 py-2 rounded-lg font-semibold text-left transition-all ${
                isActive("/creator")
                  ? "bg-purple-600 text-white shadow-md"
                  : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
              }`}
            >
              ✨ Creator
            </button>
          </nav>
        </div>
      </div>
    </header>
  );
}
