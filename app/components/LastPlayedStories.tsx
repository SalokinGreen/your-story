"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { DynamicIcon } from "./DynamicIcon";
import { listLocalStories, LocalStory } from "../misc/localStoryManager";

const MAX_SHOWN = 5;

function getRelativeTime(date: Date): string {
  const diffMs = Date.now() - new Date(date).getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  return new Date(date).toLocaleDateString();
}

/**
 * Shows the player's most recently played local stories so returning
 * players can jump straight back in from the home page. Renders nothing
 * if there are no saved stories yet - GuidedStoryStart already covers that
 * empty state.
 */
export default function LastPlayedStories() {
  const router = useRouter();
  const [stories, setStories] = useState<LocalStory[] | null>(null);

  useEffect(() => {
    listLocalStories()
      .then((all) => setStories(all.slice(0, MAX_SHOWN)))
      .catch(() => setStories([]));
  }, []);

  if (!stories || stories.length === 0) return null;

  return (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-3 max-w-2xl mx-auto">
        <h2 className="text-sm font-medium text-blue-200/40 uppercase tracking-wider">
          Continue Playing
        </h2>
        <button
          onClick={() => router.push("/library")}
          className="text-xs text-blue-300/60 hover:text-white transition-colors"
        >
          View All
        </button>
      </div>
      <div className="max-w-2xl mx-auto space-y-2">
        {stories.map((story) => {
          const chapter = story.storyData?.currentChapter ?? 0;
          return (
            <button
              key={story.id}
              onClick={() => router.push(`/story?storyId=${story.id}`)}
              className="w-full flex items-center gap-3 p-3 bg-blue-950/40 hover:bg-blue-900/50 border border-blue-800/30 hover:border-purple-500/40 rounded-xl transition-all text-left"
            >
              <div className="w-9 h-9 shrink-0 rounded-full bg-purple-600/20 flex items-center justify-center">
                <DynamicIcon name="BookOpen" className="w-4 h-4 text-purple-300" />
              </div>
              <div className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-white truncate">
                  {story.title}
                </span>
                <span className="block text-xs text-blue-300/50">
                  {getRelativeTime(story.updatedAt)} · Ch. {chapter + 1}
                </span>
              </div>
              <DynamicIcon
                name="ChevronRight"
                className="w-4 h-4 text-blue-300/40 shrink-0"
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}
