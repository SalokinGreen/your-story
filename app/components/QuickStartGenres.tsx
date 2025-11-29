"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { StaticIcon } from "./StaticIcon";

// Genre quick starts
const genres = [
  { name: "Fantasy", icon: "Sword", color: "from-purple-500 to-indigo-600" },
  { name: "Sci-Fi", icon: "Rocket", color: "from-cyan-500 to-blue-600" },
  { name: "Horror", icon: "Ghost", color: "from-red-500 to-rose-700" },
  { name: "Mystery", icon: "Search", color: "from-amber-500 to-orange-600" },
  { name: "Romance", icon: "Heart", color: "from-pink-500 to-rose-500" },
  { name: "Western", icon: "Sun", color: "from-yellow-500 to-amber-600" },
];

/**
 * Quick start genre buttons for the landing page.
 */
export default function QuickStartGenres() {
  const router = useRouter();

  return (
    <div className="mb-8">
      <h2 className="text-sm font-medium text-blue-200/40 uppercase tracking-wider mb-3 text-center">
        Quick Start
      </h2>
      <div className="flex flex-wrap justify-center gap-2">
        {genres.map((genre) => (
          <button
            key={genre.name}
            onClick={() =>
              router.push(`/explorer?genre=${genre.name.toLowerCase()}`)
            }
            className="px-4 py-2 bg-blue-950/50 hover:bg-blue-900/50 text-blue-200 rounded-lg border border-blue-800/30 transition-all hover:border-blue-600/50 flex items-center gap-2"
          >
            <StaticIcon name={genre.icon} className="w-4 h-4" />
            {genre.name}
          </button>
        ))}
      </div>
    </div>
  );
}
