"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { listLocalStories, deleteLocalStory, LocalStory } from "../misc/localStoryManager";

export default function LocalStoryList() {
  const router = useRouter();
  const [stories, setStories] = useState<LocalStory[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStories();
  }, []);

  const loadStories = async () => {
    try {
      const localStories = await listLocalStories();
      setStories(localStories);
    } catch (error) {
      console.error("Failed to load local stories:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (e: React.MouseEvent, storyId: string) => {
    e.stopPropagation();
    if (confirm("Are you sure you want to delete this local story? This cannot be undone.")) {
      try {
        await deleteLocalStory(storyId);
        await loadStories();
      } catch (error) {
        console.error("Failed to delete story:", error);
      }
    }
  };

  if (loading) {
    return <div className="animate-pulse h-20 bg-gray-100 dark:bg-gray-800 rounded-lg"></div>;
  }

  if (stories.length === 0) {
    return (
      <div className="text-center py-8 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-700">
        <p className="text-gray-500 dark:text-gray-400">No locally saved stories found.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
        📂 Local Stories
      </h3>
      <div className="grid gap-4">
        {stories.map((story) => (
          <div
            key={story.id}
            onClick={() => router.push(`/story?storyId=${story.id}`)}
            className="group relative bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-200 dark:border-gray-700 hover:border-purple-500 dark:hover:border-purple-400 shadow-sm hover:shadow-md transition-all cursor-pointer"
          >
            <div className="flex justify-between items-start">
              <div className="flex-1 min-w-0">
                <h4 className="font-bold text-gray-900 dark:text-white truncate pr-8">
                  {story.title}
                </h4>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  {new Date(story.updatedAt).toLocaleDateString()} • {new Date(story.updatedAt).toLocaleTimeString()}
                </p>
                <p className="text-sm text-gray-600 dark:text-gray-300 mt-2 line-clamp-2">
                  {story.preview}
                </p>
              </div>
              <button
                onClick={(e) => handleDelete(e, story.id)}
                className="absolute top-4 right-4 p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                title="Delete local story"
              >
                🗑️
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
