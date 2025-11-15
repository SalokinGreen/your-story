"use client";

import { useAuth } from "@/app/misc/AuthContext";

export default function UserProfile() {
  const { user, signOut, loading } = useAuth();

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
    <div className="flex items-center gap-4 p-4 bg-white dark:bg-zinc-900 rounded-lg shadow">
      <div className="flex flex-col gap-1">
        <span className="text-sm font-medium text-black dark:text-white">
          {user.email}
        </span>
        <span className="text-xs text-zinc-600 dark:text-zinc-400">
          Signed in
        </span>
      </div>
      <button
        onClick={signOut}
        className="px-3 py-1 bg-zinc-200 hover:bg-zinc-300 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-black dark:text-white rounded text-sm transition-colors"
      >
        Sign Out
      </button>
    </div>
  );
}
