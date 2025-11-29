"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { StaticIcon } from "./StaticIcon";

interface PopularAdventure {
  id: string;
  title: string;
  shortDescription: string;
  thumbnailUrl?: string;
  rating?: number;
  playCount: number;
}

/**
 * Client-side popular adventures carousel.
 * Fetches from cached API endpoint.
 */
export default function PopularAdventures() {
  const router = useRouter();
  const [adventures, setAdventures] = useState<PopularAdventure[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchPopular = async () => {
      try {
        const response = await fetch("/api/adventures/popular?limit=6");
        if (!response.ok) throw new Error("Failed to fetch");
        const { adventures } = await response.json();
        setAdventures(adventures);
      } catch (error) {
        console.error("Error fetching popular adventures:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchPopular();
  }, []);

  return (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold text-white flex items-center gap-2">
          <StaticIcon name="Flame" className="w-5 h-5 text-orange-400" />
          Popular
        </h2>
        <button
          onClick={() => router.push("/explorer")}
          className="text-sm text-blue-400 hover:text-blue-300 flex items-center gap-1"
        >
          View all <StaticIcon name="ChevronRight" className="w-4 h-4" />
        </button>
      </div>

      <div className="flex gap-3 pb-2 -mx-4 px-4 overflow-x-auto scrollbar-hide">
        {loading ? (
          // Skeleton with fixed dimensions to prevent CLS
          Array(6)
            .fill(0)
            .map((_, i) => (
              <div
                key={i}
                className="shrink-0 w-64 h-[196px] bg-blue-950/50 rounded-xl border border-blue-800/30 overflow-hidden animate-pulse"
              >
                <div className="h-32 bg-blue-900/50" />
                <div className="p-3 space-y-2">
                  <div className="h-4 bg-blue-900/50 rounded w-3/4" />
                  <div className="h-3 bg-blue-900/50 rounded w-full" />
                </div>
              </div>
            ))
        ) : adventures.length === 0 ? (
          <div className="w-full text-center py-8 text-blue-200/40">
            No adventures yet. Be the first to create one!
          </div>
        ) : (
          adventures.map((adventure, index) => (
            <div
              key={adventure.id}
              onClick={() => router.push(`/explorer/${adventure.id}`)}
              className="shrink-0 w-64 h-[196px] bg-blue-950/50 rounded-xl border border-blue-800/30 overflow-hidden cursor-pointer hover:border-blue-600/50 transition-all group"
            >
              {adventure.thumbnailUrl ? (
                <div className="h-32 w-64 relative overflow-hidden">
                  <Image
                    src={adventure.thumbnailUrl}
                    alt={adventure.title}
                    fill
                    className="object-cover group-hover:scale-105 transition-transform"
                    sizes="256px"
                    loading="eager"
                    priority={index < 3}
                  />
                </div>
              ) : (
                <div
                  className={`h-32 w-64 bg-linear-to-br ${
                    index % 3 === 0
                      ? "from-blue-500/30 to-purple-500/30"
                      : index % 3 === 1
                      ? "from-purple-500/30 to-pink-500/30"
                      : "from-pink-500/30 to-orange-500/30"
                  } flex items-center justify-center`}
                >
                  <StaticIcon
                    name="BookOpen"
                    className="w-10 h-10 text-white/30"
                  />
                </div>
              )}
              <div className="p-3">
                <h3 className="font-medium text-white text-sm line-clamp-1 mb-1">
                  {adventure.title}
                </h3>
                <p className="text-xs text-blue-200/40 line-clamp-1 mb-2">
                  {adventure.shortDescription}
                </p>
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-yellow-400 flex items-center gap-0.5">
                    <StaticIcon name="Star" className="w-3 h-3 fill-current" />
                    {adventure.rating?.toFixed(1) || "-"}
                  </span>
                  <span className="text-blue-200/40">
                    {adventure.playCount >= 1000
                      ? `${(adventure.playCount / 1000).toFixed(1)}k`
                      : adventure.playCount}{" "}
                    plays
                  </span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
