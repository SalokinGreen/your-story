"use client";

import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/app/misc/AuthContext";
import { useEffect, useState } from "react";
import { supabase } from "@/app/misc/supabase";
import { DynamicIcon } from "./DynamicIcon";

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

  const handleNavClick = (e: React.MouseEvent, path: string) => {
    // Middle click
    if (e.button === 1) {
      e.preventDefault();
      window.open(path, "_blank");
      return;
    }
    // Ctrl/Cmd+click - open in new tab
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      window.open(path, "_blank");
      return;
    }
    // Normal left click
    if (e.button === 0) {
      router.push(path);
    }
  };

  const handleMouseUp = (e: React.MouseEvent, path: string) => {
    // Middle click - open in new tab
    if (e.button === 1) {
      e.preventDefault();
      window.open(path, "_blank");
    }
  };

  return (
    <header className="sticky top-0 z-50 bg-white dark:bg-blue-950 border-b-2 border-gray-200 dark:border-gray-700 shadow-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo/Brand */}
          <button
            onClick={(e) => handleNavClick(e, "/")}
            onMouseUp={(e) => handleMouseUp(e, "/")}
            className="flex items-center gap-2 text-xl font-bold bg-linear-to-r from-blue-600 via-purple-600 to-pink-600 bg-clip-text text-transparent hover:opacity-80 transition-opacity"
          >
            <DynamicIcon name="BookOpen" className="w-6 h-6 text-purple-600" />{" "}
            Your Story
          </button>

          {/* Navigation */}
          <nav className="hidden md:flex items-center gap-2">
            <button
              onClick={(e) => handleNavClick(e, "/library")}
              onMouseUp={(e) => handleMouseUp(e, "/library")}
              className={`px-4 py-2 rounded-lg font-semibold transition-all flex items-center gap-2 ${
                isActive("/library")
                  ? "bg-purple-600 text-white shadow-md"
                  : "text-gray-700 dark:text-gray-300 hover:bg-gray-800 dark:hover:bg-gray-700"
              }`}
            >
              <DynamicIcon name="Library" className="w-4 h-4" /> Library
            </button>
            <button
              onClick={(e) => handleNavClick(e, "/explorer")}
              onMouseUp={(e) => handleMouseUp(e, "/explorer")}
              className={`px-4 py-2 rounded-lg font-semibold transition-all flex items-center gap-2 ${
                isActive("/explorer")
                  ? "bg-purple-600 text-white shadow-md"
                  : "text-gray-700 dark:text-gray-300 hover:bg-gray-800 dark:hover:bg-gray-700"
              }`}
            >
              <DynamicIcon name="Map" className="w-4 h-4" /> Explorer
            </button>
            <button
              onClick={(e) => handleNavClick(e, "/creator")}
              onMouseUp={(e) => handleMouseUp(e, "/creator")}
              className={`px-4 py-2 rounded-lg font-semibold transition-all flex items-center gap-2 ${
                isActive("/creator")
                  ? "bg-purple-600 text-white shadow-md"
                  : "text-gray-700 dark:text-gray-300 hover:bg-gray-800 dark:hover:bg-gray-700"
              }`}
            >
              <DynamicIcon name="Sparkles" className="w-4 h-4" /> Creator
            </button>
          </nav>

          {/* Profile */}
          <button
            onClick={(e) => handleNavClick(e, `/profile/${user.id}`)}
            onMouseUp={(e) => handleMouseUp(e, `/profile/${user.id}`)}
            className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-800 dark:hover:bg-gray-700 transition-colors"
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
            className="md:hidden p-2 rounded-lg hover:bg-gray-800 dark:hover:bg-gray-700 transition-colors"
          >
            <DynamicIcon
              name="Menu"
              className="w-6 h-6 text-gray-900 dark:text-white"
            />
          </button>
        </div>

        {/* Mobile Menu */}
        <div id="mobile-menu" className="hidden md:hidden pb-4">
          <nav className="flex flex-col gap-2">
            <button
              onClick={(e) => {
                handleNavClick(e, "/library");
                document.getElementById("mobile-menu")?.classList.add("hidden");
              }}
              onMouseUp={(e) => {
                handleMouseUp(e, "/library");
                document.getElementById("mobile-menu")?.classList.add("hidden");
              }}
              className={`px-4 py-2 rounded-lg font-semibold text-left transition-all flex items-center gap-2 ${
                isActive("/library")
                  ? "bg-purple-600 text-white shadow-md"
                  : "text-gray-700 dark:text-gray-300 hover:bg-gray-800 dark:hover:bg-gray-700"
              }`}
            >
              <DynamicIcon name="Library" className="w-4 h-4" /> Library
            </button>
            <button
              onClick={(e) => {
                handleNavClick(e, "/explorer");
                document.getElementById("mobile-menu")?.classList.add("hidden");
              }}
              onMouseUp={(e) => {
                handleMouseUp(e, "/explorer");
                document.getElementById("mobile-menu")?.classList.add("hidden");
              }}
              className={`px-4 py-2 rounded-lg font-semibold text-left transition-all flex items-center gap-2 ${
                isActive("/explorer")
                  ? "bg-purple-600 text-white shadow-md"
                  : "text-gray-700 dark:text-gray-300 hover:bg-gray-800 dark:hover:bg-gray-700"
              }`}
            >
              <DynamicIcon name="Map" className="w-4 h-4" /> Explorer
            </button>
            <button
              onClick={(e) => {
                handleNavClick(e, "/creator");
                document.getElementById("mobile-menu")?.classList.add("hidden");
              }}
              onMouseUp={(e) => {
                handleMouseUp(e, "/creator");
                document.getElementById("mobile-menu")?.classList.add("hidden");
              }}
              className={`px-4 py-2 rounded-lg font-semibold text-left transition-all flex items-center gap-2 ${
                isActive("/creator")
                  ? "bg-purple-600 text-white shadow-md"
                  : "text-gray-700 dark:text-gray-300 hover:bg-gray-800 dark:hover:bg-gray-700"
              }`}
            >
              <DynamicIcon name="Sparkles" className="w-4 h-4" /> Creator
            </button>
          </nav>
        </div>
      </div>
    </header>
  );
}
