"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/app/misc/AuthContext";
import { StaticIcon } from "@/app/components/StaticIcon";

// Genre options for quick generation
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
  {
    name: "Dark Fantasy",
    icon: "Skull",
    color: "from-gray-600 to-purple-900",
    description:
      "Grim worlds, morally gray choices, dark magic, and survival against overwhelming odds",
  },
  {
    name: "Historical",
    icon: "Crown",
    color: "from-amber-600 to-yellow-700",
    description:
      "Real historical periods, political intrigue, wars, and pivotal moments in history",
  },
  {
    name: "Pirates",
    icon: "Anchor",
    color: "from-blue-600 to-teal-600",
    description:
      "High seas adventure, treasure hunts, naval battles, and swashbuckling action",
  },
  {
    name: "Survival",
    icon: "TreePine",
    color: "from-green-600 to-emerald-700",
    description:
      "Wilderness challenges, resource management, harsh environments, and staying alive",
  },
  {
    name: "Urban Fantasy",
    icon: "Building2",
    color: "from-violet-500 to-fuchsia-600",
    description:
      "Magic in modern cities, hidden supernatural worlds, and contemporary adventures",
  },
  {
    name: "Steampunk",
    icon: "Cog",
    color: "from-amber-500 to-stone-600",
    description:
      "Victorian aesthetics, steam-powered technology, airships, and clockwork inventions",
  },
  {
    name: "Drama",
    icon: "Drama",
    color: "from-rose-500 to-purple-600",
    description:
      "Character-driven stories, emotional conflicts, personal growth, and meaningful choices",
  },
  {
    name: "Thriller",
    icon: "Crosshair",
    color: "from-slate-500 to-zinc-700",
    description:
      "High-stakes tension, dangerous pursuits, conspiracies, and edge-of-your-seat action",
  },
  {
    name: "Post-Apocalyptic",
    icon: "Flame",
    color: "from-orange-600 to-red-800",
    description:
      "Ruined civilizations, scavenging for resources, factions, and rebuilding society",
  },
  {
    name: "Noir",
    icon: "Moon",
    color: "from-gray-700 to-slate-900",
    description:
      "Cynical detectives, femme fatales, shadowy conspiracies, and morally ambiguous tales",
  },
];

// Size presets for quick generation
const sizePresets = [
  {
    name: "Quick",
    value: "quick",
    tokens: 20000,
    timeMin: 6,
    timeMax: 10,
    description: "Basic adventure, fewer details",
    estimatedCoins: 15,
  },
  {
    name: "Standard",
    value: "standard",
    tokens: 50000,
    timeMin: 12,
    timeMax: 20,
    description: "Well-rounded adventure",
    estimatedCoins: 35,
  },
  {
    name: "Detailed",
    value: "detailed",
    tokens: 100000,
    timeMin: 25,
    timeMax: 40,
    description: "Rich lore and content",
    estimatedCoins: 65,
  },
  {
    name: "Epic",
    value: "epic",
    tokens: 200000,
    timeMin: 45,
    timeMax: 70,
    description: "Maximum depth and detail",
    estimatedCoins: 120,
  },
];

export default function CreatorLandingPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  // Quick generation state
  const [showQuickModal, setShowQuickModal] = useState(false);
  const [selectedGenre, setSelectedGenre] = useState<(typeof genres)[0] | null>(
    null
  );
  const [customPrompt, setCustomPrompt] = useState("");
  const [sizeIndex, setSizeIndex] = useState(1); // Default to "Standard"

  const selectedSize = sizePresets[sizeIndex];

  const handleQuickGenerate = () => {
    if (!selectedGenre) return;

    // Build the quick start params
    const params = new URLSearchParams({
      quickStart: "true",
      genre: selectedGenre.name.toLowerCase(),
      size: selectedSize.value,
    });

    if (customPrompt.trim()) {
      params.set("prompt", customPrompt.trim());
    }

    // Navigate to the big adventure creator with quick start params
    router.push(`/creator/generate?${params.toString()}`);
  };

  const openQuickModal = (genre: (typeof genres)[0]) => {
    setSelectedGenre(genre);
    setCustomPrompt("");
    setShowQuickModal(true);
  };

  // Show loading while checking auth
  if (authLoading) {
    return (
      <div className="min-h-screen bg-linear-to-br from-gray-900 via-blue-950 to-purple-950 flex items-center justify-center">
        <div className="text-blue-300 flex items-center gap-3">
          <div className="w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
          Loading...
        </div>
      </div>
    );
  }

  // Redirect to login if not authenticated
  if (!user) {
    return (
      <div className="min-h-screen bg-linear-to-br from-gray-900 via-blue-950 to-purple-950 flex items-center justify-center">
        <div className="text-center p-8 bg-blue-950/50 rounded-xl border border-blue-700/30 max-w-md">
          <StaticIcon
            name="Lock"
            className="w-12 h-12 text-blue-400 mx-auto mb-4"
          />
          <h2 className="text-xl font-bold text-white mb-2">
            Sign In Required
          </h2>
          <p className="text-blue-300/70 mb-4">
            Please sign in to create adventures.
          </p>
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg transition-colors"
          >
            <StaticIcon name="LogIn" className="w-4 h-4" />
            Go to Sign In
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-linear-to-br from-gray-900 via-blue-950 to-purple-950">
      <main className="max-w-5xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-10">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-blue-400 hover:text-blue-300 mb-4 transition-colors"
          >
            <StaticIcon name="ArrowLeft" className="w-4 h-4" />
            Back to Home
          </Link>
          <h1 className="text-3xl sm:text-4xl font-bold mb-3 bg-linear-to-r from-purple-400 via-pink-400 to-amber-400 bg-clip-text text-transparent">
            Adventure Creator
          </h1>
          <p className="text-blue-200/60 text-lg max-w-xl mx-auto">
            Choose how you want to create your adventure
          </p>
        </div>

        {/* Three Options Grid */}
        <div className="grid md:grid-cols-3 gap-6 mb-12">
          {/* Quick Generation */}
          <div className="bg-blue-950/50 rounded-2xl border border-blue-700/30 p-6 hover:border-purple-500/50 transition-all group">
            <div className="w-14 h-14 rounded-full bg-linear-to-br from-green-500 to-emerald-600 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <StaticIcon name="Zap" className="w-7 h-7 text-white" />
            </div>
            <h2 className="text-xl font-bold text-white mb-2">
              Quick Generation
            </h2>
            <p className="text-blue-300/60 text-sm mb-4">
              Pick a genre and let AI create a complete adventure in minutes.
              Perfect for jumping straight into play.
            </p>
            <div className="flex flex-wrap gap-2 mb-4">
              <span className="px-2 py-1 bg-green-500/20 text-green-300 text-xs rounded-full">
                ~6-20 min
              </span>
              <span className="px-2 py-1 bg-amber-500/20 text-amber-300 text-xs rounded-full">
                AI-powered
              </span>
            </div>
            <button
              onClick={() => setShowQuickModal(true)}
              className="w-full px-4 py-2.5 bg-linear-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white rounded-lg transition-all font-medium flex items-center justify-center gap-2"
            >
              <StaticIcon name="Sparkles" className="w-4 h-4" />
              Quick Start
            </button>
          </div>

          {/* Advanced Generation */}
          <div className="bg-blue-950/50 rounded-2xl border border-blue-700/30 p-6 hover:border-purple-500/50 transition-all group">
            <div className="w-14 h-14 rounded-full bg-linear-to-br from-purple-500 to-blue-600 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <StaticIcon name="Wand2" className="w-7 h-7 text-white" />
            </div>
            <h2 className="text-xl font-bold text-white mb-2">
              Advanced Generation
            </h2>
            <p className="text-blue-300/60 text-sm mb-4">
              Full control over AI generation with custom settings, RPG systems,
              complexity levels, and style presets.
            </p>
            <div className="flex flex-wrap gap-2 mb-4">
              <span className="px-2 py-1 bg-purple-500/20 text-purple-300 text-xs rounded-full">
                Full control
              </span>
              <span className="px-2 py-1 bg-blue-500/20 text-blue-300 text-xs rounded-full">
                Custom prompts
              </span>
            </div>
            <Link
              href="/creator/generate"
              className="w-full px-4 py-2.5 bg-linear-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white rounded-lg transition-all font-medium flex items-center justify-center gap-2"
            >
              <StaticIcon name="Settings" className="w-4 h-4" />
              Advanced Creator
            </Link>
          </div>

          {/* Manual Creator */}
          <div className="bg-blue-950/50 rounded-2xl border border-blue-700/30 p-6 hover:border-purple-500/50 transition-all group">
            <div className="w-14 h-14 rounded-full bg-linear-to-br from-amber-500 to-orange-600 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <StaticIcon name="Palette" className="w-7 h-7 text-white" />
            </div>
            <h2 className="text-xl font-bold text-white mb-2">
              Manual Creator
            </h2>
            <p className="text-blue-300/60 text-sm mb-4">
              Build your adventure from scratch with complete creative freedom.
              Define every stat, item, lore entry, and more.
            </p>
            <div className="flex flex-wrap gap-2 mb-4">
              <span className="px-2 py-1 bg-amber-500/20 text-amber-300 text-xs rounded-full">
                Full freedom
              </span>
              <span className="px-2 py-1 bg-orange-500/20 text-orange-300 text-xs rounded-full">
                No AI needed
              </span>
            </div>
            <Link
              href="/creator/manual"
              className="w-full px-4 py-2.5 bg-linear-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white rounded-lg transition-all font-medium flex items-center justify-center gap-2"
            >
              <StaticIcon name="Edit" className="w-4 h-4" />
              Manual Editor
            </Link>
          </div>
        </div>

        {/* Quick comparison */}
        <div className="bg-blue-950/30 rounded-xl border border-blue-800/30 p-6 mb-8">
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <StaticIcon name="HelpCircle" className="w-5 h-5 text-blue-400" />
            Which should I choose?
          </h3>
          <div className="grid md:grid-cols-3 gap-4 text-sm">
            <div>
              <h4 className="font-medium text-green-400 mb-2">
                Quick Generation
              </h4>
              <ul className="space-y-1 text-blue-300/70">
                <li>• You want to play now</li>
                <li>• Genre-based inspiration</li>
                <li>• Minimal setup required</li>
                <li>• Good for first-timers</li>
              </ul>
            </div>
            <div>
              <h4 className="font-medium text-purple-400 mb-2">
                Advanced Generation
              </h4>
              <ul className="space-y-1 text-blue-300/70">
                <li>• Custom story concepts</li>
                <li>• Specific RPG systems</li>
                <li>• Control over complexity</li>
                <li>• Style and tone presets</li>
              </ul>
            </div>
            <div>
              <h4 className="font-medium text-amber-400 mb-2">
                Manual Creator
              </h4>
              <ul className="space-y-1 text-blue-300/70">
                <li>• Complete control</li>
                <li>• No coin cost</li>
                <li>• Import/adapt existing</li>
                <li>• Learning the system</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Quick links */}
        <div className="flex justify-center gap-4 text-sm">
          <Link
            href="/library"
            className="text-blue-400 hover:text-blue-300 flex items-center gap-1 transition-colors"
          >
            <StaticIcon name="Library" className="w-4 h-4" />
            My Library
          </Link>
          <span className="text-blue-800">•</span>
          <Link
            href="/explorer"
            className="text-blue-400 hover:text-blue-300 flex items-center gap-1 transition-colors"
          >
            <StaticIcon name="Compass" className="w-4 h-4" />
            Explore Adventures
          </Link>
        </div>
      </main>

      {/* Quick Generation Modal */}
      {showQuickModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-blue-950 border border-blue-700/50 rounded-xl p-6 max-w-2xl w-full shadow-2xl max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-white flex items-center gap-2">
                <StaticIcon name="Zap" className="w-5 h-5 text-green-400" />
                Quick Adventure Generation
              </h3>
              <button
                onClick={() => {
                  setShowQuickModal(false);
                  setSelectedGenre(null);
                }}
                className="text-blue-400 hover:text-white transition-colors"
              >
                <StaticIcon name="X" className="w-5 h-5" />
              </button>
            </div>

            {/* Genre Selection */}
            {!selectedGenre ? (
              <>
                <p className="text-blue-300/70 mb-4">
                  Choose a genre to start:
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {genres.map((genre) => (
                    <button
                      key={genre.name}
                      onClick={() => openQuickModal(genre)}
                      className="p-4 bg-blue-900/40 hover:bg-blue-800/50 rounded-xl border border-blue-700/30 hover:border-blue-500/50 transition-all group text-center"
                    >
                      <div
                        className={`w-10 h-10 rounded-full bg-linear-to-br ${genre.color} flex items-center justify-center mx-auto mb-2 group-hover:scale-110 transition-transform`}
                      >
                        <StaticIcon
                          name={genre.icon}
                          className="w-5 h-5 text-white"
                        />
                      </div>
                      <span className="text-white font-medium text-sm">
                        {genre.name}
                      </span>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <>
                {/* Genre Header */}
                <div className="flex items-center gap-3 mb-6">
                  <button
                    onClick={() => setSelectedGenre(null)}
                    className="text-blue-400 hover:text-white transition-colors"
                  >
                    <StaticIcon name="ArrowLeft" className="w-5 h-5" />
                  </button>
                  <div
                    className={`w-12 h-12 rounded-full bg-linear-to-br ${selectedGenre.color} flex items-center justify-center`}
                  >
                    <StaticIcon
                      name={selectedGenre.icon}
                      className="w-6 h-6 text-white"
                    />
                  </div>
                  <div>
                    <h4 className="text-lg font-bold text-white">
                      {selectedGenre.name} Adventure
                    </h4>
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
                </div>

                {/* Size Slider */}
                <div className="mb-6">
                  <label className="block text-sm font-medium text-blue-200 mb-2">
                    Adventure Size
                  </label>
                  <div className="bg-blue-900/30 border border-blue-700/30 rounded-lg p-4">
                    <input
                      type="range"
                      min={0}
                      max={sizePresets.length - 1}
                      value={sizeIndex}
                      onChange={(e) => setSizeIndex(parseInt(e.target.value))}
                      className="w-full h-2 bg-blue-800/50 rounded-lg appearance-none cursor-pointer accent-purple-500"
                    />
                    <div className="flex justify-between text-xs text-blue-400/60 mt-1 px-1">
                      {sizePresets.map((preset) => (
                        <span key={preset.value}>{preset.name}</span>
                      ))}
                    </div>
                    <div className="mt-3 flex items-center justify-between">
                      <div>
                        <span className="text-lg font-bold text-white">
                          {selectedSize.name}
                        </span>
                        <span className="text-sm text-blue-300/60 ml-2">
                          {selectedSize.description}
                        </span>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-medium text-purple-300">
                          ~{selectedSize.timeMin}-{selectedSize.timeMax} min
                        </div>
                        <div className="text-xs text-amber-400">
                          ~{selectedSize.estimatedCoins} coins
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Info Box */}
                <div className="bg-purple-900/20 border border-purple-500/30 rounded-lg p-3 mb-4">
                  <div className="flex items-start gap-2">
                    <StaticIcon
                      name="Sparkles"
                      className="w-4 h-4 text-purple-400 mt-0.5 shrink-0"
                    />
                    <div className="text-sm text-purple-200/80">
                      <p className="font-medium mb-1">
                        Powered by Mistral Large!
                      </p>
                      <p className="text-purple-300/60 text-xs">
                        AI will choose the best RPG system, complexity, and
                        settings for your genre.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Warning Box */}
                <div className="bg-amber-900/20 border border-amber-500/30 rounded-lg p-3 mb-6">
                  <div className="flex items-start gap-2">
                    <StaticIcon
                      name="AlertTriangle"
                      className="w-4 h-4 text-amber-400 mt-0.5 shrink-0"
                    />
                    <p className="text-xs text-amber-200/80">
                      Keep the tab open during generation. Switching tabs or
                      minimizing may interrupt the connection.
                    </p>
                  </div>
                </div>

                {/* Buttons */}
                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      setShowQuickModal(false);
                      setSelectedGenre(null);
                    }}
                    className="flex-1 px-4 py-2.5 bg-blue-900/40 hover:bg-blue-800/50 text-white rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleQuickGenerate}
                    className="flex-1 px-4 py-2.5 bg-linear-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white rounded-lg transition-colors font-medium flex items-center justify-center gap-2"
                  >
                    <StaticIcon name="Wand2" className="w-4 h-4" />
                    Generate Adventure
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
