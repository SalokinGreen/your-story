"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { StaticIcon } from "./StaticIcon";

/**
 * Alternative to the Creator wizard / QuickStartGenres: skip adventure setup
 * entirely and start chatting directly with the GM, who interviews the
 * player briefly and builds the world/character on the fly.
 */
export default function FreeformStoryStart() {
  const router = useRouter();
  const [starting, setStarting] = useState(false);

  const handleStart = async () => {
    if (starting) return;
    setStarting(true);
    try {
      const { startFreeformStoryLocally } = await import(
        "../misc/localStoryManager"
      );
      const localId = await startFreeformStoryLocally();
      router.push(`/story?storyId=${localId}`);
    } catch (error) {
      console.error("Error starting freeform story:", error);
      setStarting(false);
    }
  };

  return (
    <div className="mb-10 flex justify-center">
      <button
        onClick={handleStart}
        disabled={starting}
        className="group flex items-center gap-3 px-5 py-3 bg-blue-950/50 hover:bg-blue-900/50 text-blue-200 rounded-xl border border-blue-800/30 transition-all hover:border-blue-600/50 disabled:opacity-60"
      >
        <StaticIcon
          name="MessageSquare"
          className="w-5 h-5 text-blue-400 group-hover:text-blue-300"
        />
        <span className="text-left">
          <span className="block font-medium text-white">
            {starting ? "Starting..." : "Freeform Story"}
          </span>
          <span className="block text-xs text-blue-200/50">
            Skip setup - just talk to your GM
          </span>
        </span>
      </button>
    </div>
  );
}
