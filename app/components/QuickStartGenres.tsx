"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { StaticIcon } from "./StaticIcon";

// Genre quick starts with AI-friendly descriptions
const genres = [
  {
    name: "Fantasy",
    icon: "Sword",
    color: "from-purple-500 to-indigo-600",
    description: "Epic quests, magic, mythical creatures, and heroic journeys",
  },
  {
    name: "Sci-Fi",
    icon: "Rocket",
    color: "from-cyan-500 to-blue-600",
    description:
      "Space exploration, advanced technology, alien encounters, and futuristic societies",
  },
  {
    name: "Horror",
    icon: "Ghost",
    color: "from-red-500 to-rose-700",
    description:
      "Survival horror, psychological terror, supernatural threats, and dark mysteries",
  },
  {
    name: "Mystery",
    icon: "Search",
    color: "from-amber-500 to-orange-600",
    description:
      "Crime solving, detective work, puzzles, intrigue, and uncovering secrets",
  },
  {
    name: "Romance",
    icon: "Heart",
    color: "from-pink-500 to-rose-500",
    description:
      "Love stories, relationship drama, emotional connections, and heartfelt moments",
  },
  {
    name: "Western",
    icon: "Sun",
    color: "from-yellow-500 to-amber-600",
    description:
      "Frontier life, outlaws and lawmen, dusty towns, and rugged adventures",
  },
  {
    name: "Comedy",
    icon: "Laugh",
    color: "from-green-400 to-emerald-500",
    description:
      "Hilarious situations, witty dialogue, absurd scenarios, and laugh-out-loud moments",
  },
  {
    name: "Superheroes",
    icon: "Zap",
    color: "from-red-500 to-yellow-500",
    description:
      "Superpowers, epic battles, secret identities, and saving the world from villains",
  },
];

/**
 * Quick start genre buttons for the landing page.
 * Opens a modal to optionally add a custom prompt, then generates an adventure.
 */
export default function QuickStartGenres() {
  const router = useRouter();
  const [selectedGenre, setSelectedGenre] = useState<(typeof genres)[0] | null>(
    null
  );
  const [customPrompt, setCustomPrompt] = useState("");

  const handleGenreClick = (genre: (typeof genres)[0]) => {
    setSelectedGenre(genre);
    setCustomPrompt("");
  };

  const handleGenerate = () => {
    if (!selectedGenre) return;

    // Build the quick start params
    const params = new URLSearchParams({
      quickStart: "true",
      genre: selectedGenre.name.toLowerCase(),
    });

    if (customPrompt.trim()) {
      params.set("prompt", customPrompt.trim());
    }

    // Navigate to the big adventure creator with quick start params
    router.push(`/creator/generate?${params.toString()}`);
  };

  return (
    <>
      <div className="mb-8">
        <h2 className="text-sm font-medium text-blue-200/40 uppercase tracking-wider mb-3 text-center">
          Quick Start
        </h2>
        <div className="flex flex-wrap justify-center gap-2">
          {genres.map((genre) => (
            <button
              key={genre.name}
              onClick={() => handleGenreClick(genre)}
              className="px-4 py-2 bg-blue-950/50 hover:bg-blue-900/50 text-blue-200 rounded-lg border border-blue-800/30 transition-all hover:border-blue-600/50 flex items-center gap-2"
            >
              <StaticIcon name={genre.icon} className="w-4 h-4" />
              {genre.name}
            </button>
          ))}
        </div>
      </div>

      {/* Quick Start Modal */}
      {selectedGenre && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="bg-blue-950 border border-blue-700/50 rounded-xl p-6 max-w-lg w-full mx-4 shadow-2xl">
            {/* Header */}
            <div className="flex items-center gap-3 mb-4">
              <div
                className={`w-12 h-12 rounded-full bg-linear-to-br ${selectedGenre.color} flex items-center justify-center`}
              >
                <StaticIcon
                  name={selectedGenre.icon}
                  className="w-6 h-6 text-white"
                />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">
                  {selectedGenre.name} Adventure
                </h3>
                <p className="text-sm text-blue-300/60">
                  {selectedGenre.description}
                </p>
              </div>
            </div>

            {/* Prompt Input */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-blue-200 mb-2">
                Adventure Concept{" "}
                <span className="text-blue-400/60">(optional)</span>
              </label>
              <textarea
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
                placeholder={`Describe your ${selectedGenre.name.toLowerCase()} adventure idea, or leave blank for AI to decide...`}
                className="w-full px-4 py-3 bg-blue-900/30 border border-blue-700/30 rounded-lg text-white placeholder-blue-400/40 focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
                rows={3}
              />
              <p className="text-xs text-blue-300/50 mt-1">
                The AI will generate a complete adventure with stats, lore,
                quests, and more
              </p>
            </div>

            {/* Info Box */}
            <div className="bg-purple-900/20 border border-purple-500/30 rounded-lg p-3 mb-4">
              <div className="flex items-start gap-2">
                <StaticIcon
                  name="Sparkles"
                  className="w-4 h-4 text-purple-400 mt-0.5 shrink-0"
                />
                <div className="text-sm text-purple-200/80">
                  <p className="font-medium mb-1">Powered by Mistral Large</p>
                  <p className="text-purple-300/60 text-xs">
                    AI will choose the best RPG system, complexity, and settings
                    for your genre. Generation takes about 2-3 minutes.
                  </p>
                </div>
              </div>
            </div>

            {/* Buttons */}
            <div className="flex gap-3">
              <button
                onClick={() => setSelectedGenre(null)}
                className="flex-1 px-4 py-2.5 bg-blue-900/40 hover:bg-blue-800/50 text-white rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleGenerate}
                className="flex-1 px-4 py-2.5 bg-linear-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white rounded-lg transition-colors font-medium flex items-center justify-center gap-2"
              >
                <StaticIcon name="Wand2" className="w-4 h-4" />
                Generate Adventure
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
