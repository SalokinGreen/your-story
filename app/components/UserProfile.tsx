"use client";

import { useAuth } from "@/app/misc/AuthContext";
import { useRouter } from "next/navigation";

export default function UserProfile() {
  const { user, signOut, loading } = useAuth();
  const router = useRouter();

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-zinc-600 dark:text-zinc-400">
        Loading...
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="flex flex-col items-center gap-4 p-6 bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 w-full">
      <div className="flex flex-col gap-2 text-center">
        <div className="w-12 h-12 mx-auto bg-linear-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center shadow-md">
          <span className="text-xl font-bold text-white">
            {user.email?.[0].toUpperCase() || '?'}
          </span>
        </div>
        <span className="text-sm font-semibold text-gray-900 dark:text-white break-all">
          {user.email}
        </span>
        <span className="text-xs px-3 py-1 bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200 rounded-full font-medium">
          ✓ Signed in
        </span>
      </div>
      <div className="flex flex-col w-full gap-2">
        <button
          onClick={() => router.push(`/profile/${user.id}`)}
          className="w-full px-6 py-3 bg-linear-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white rounded-lg font-semibold transition-all shadow-md hover:shadow-lg"
        >
          View Profile
        </button>
        <button
          onClick={() => router.push("/story")}
          className="w-full px-6 py-3 bg-linear-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white rounded-lg font-semibold transition-all shadow-md hover:shadow-lg"
        >
          Start Story
        </button>
        <button
          onClick={signOut}
          className="w-full px-6 py-3 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-900 dark:text-white rounded-lg font-semibold transition-colors border-2 border-gray-300 dark:border-gray-600"
        >
          Sign Out
        </button>
      </div>
    </div>
  );
}
