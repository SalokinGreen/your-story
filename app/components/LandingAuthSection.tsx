"use client";

import { useRouter } from "next/navigation";
import { StaticIcon } from "./StaticIcon";

/**
 * Landing page hero action buttons. The app is fully local - no accounts,
 * so these just link straight into the library/creator.
 */
export default function LandingAuthSection() {
  const router = useRouter();

  return (
    <div className="flex flex-wrap justify-center gap-3 mb-6">
      <button
        onClick={() => router.push("/library")}
        className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors flex items-center gap-2 text-sm"
      >
        <StaticIcon name="Library" className="w-4 h-4" /> Library
      </button>
      <button
        onClick={() => router.push("/creator")}
        className="px-5 py-2 bg-purple-600 hover:bg-purple-700 text-white font-medium rounded-lg transition-colors flex items-center gap-2 text-sm"
      >
        <StaticIcon name="Wand2" className="w-4 h-4" /> Create
      </button>
    </div>
  );
}
