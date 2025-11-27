"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import { useAuth } from "./misc/AuthContext";
import AuthForm from "./components/AuthForm";
import { supabase } from "./misc/supabase";
import { Adventure } from "./misc/structs";
import { AI_MODELS, AIModelKey } from "./misc/ai_prices";
import { DynamicIcon } from "./components/DynamicIcon";
import { DraggableScroll } from "./components/DraggableScroll";

// Roadmap data
const road_map = [
  {
    title: "Core Story Engine",
    description: "AI-powered narrative generation with branching choices",
    status: "done" as const,
    icon: "BookOpen",
  },
  {
    title: "RPG Systems",
    description: "8 dice systems including PbtA, Fate, YZE, and more",
    status: "done" as const,
    icon: "Dices",
  },
  {
    title: "Character Progression",
    description: "Stats, inventory, achievements, and skill checks",
    status: "done" as const,
    icon: "TrendingUp",
  },
  {
    title: "Adventure Creator",
    description: "Full-featured editor for custom adventures",
    status: "done" as const,
    icon: "Wand2",
  },
  {
    title: "Voice Narration",
    description: "Text-to-speech with custom voice support",
    status: "done" as const,
    icon: "Volume2",
  },
  {
    title: "Relationships",
    description: "NPC relationship tracking and dynamics",
    status: "wip" as const,
    icon: "Heart",
  },
  {
    title: "Multiplayer",
    description: "Collaborative storytelling sessions",
    status: "planned" as const,
    icon: "Users",
  },
  {
    title: "Mobile App",
    description: "Native iOS and Android apps",
    status: "planned" as const,
    icon: "Smartphone",
  },
];

// Genre quick starts
const genres = [
  { name: "Fantasy", icon: "Sword", color: "from-purple-500 to-indigo-600" },
  { name: "Sci-Fi", icon: "Rocket", color: "from-cyan-500 to-blue-600" },
  { name: "Horror", icon: "Ghost", color: "from-red-500 to-rose-700" },
  { name: "Mystery", icon: "Search", color: "from-amber-500 to-orange-600" },
  { name: "Romance", icon: "Heart", color: "from-pink-500 to-rose-500" },
  { name: "Western", icon: "Sun", color: "from-yellow-500 to-amber-600" },
];

// How it works steps
const steps = [
  {
    icon: "Compass",
    title: "Choose",
    description: "Pick an adventure or create your own",
  },
  {
    icon: "MessageSquare",
    title: "Play",
    description: "Make choices, roll dice, shape the story",
  },
  {
    icon: "Sparkles",
    title: "Experience",
    description: "AI crafts unique narratives just for you",
  },
];

// Features
const features = [
  { icon: "Bot", label: "9 AI Models" },
  { icon: "Dices", label: "8 RPG Systems" },
  { icon: "Volume2", label: "Voice Narration" },
  { icon: "Palette", label: "Custom Adventures" },
  { icon: "Shield", label: "Private Stories" },
  { icon: "Zap", label: "Fast Generation" },
];

// Coin packages
const packages = [
  { name: "Starter", cost: 0.99, coins: 100, bonus: 0, savings: 0 },
  { name: "Basic", cost: 4.99, coins: 500, bonus: 50, savings: 8 },
  { name: "Standard", cost: 9.99, coins: 1000, bonus: 150, savings: 13 },
  { name: "Premium", cost: 19.99, coins: 2000, bonus: 400, savings: 17 },
  { name: "Ultimate", cost: 49.99, coins: 5000, bonus: 1500, savings: 23 },
];

// InfoTabs Component - Compact version
function InfoTabs() {
  const [activeTab, setActiveTab] = useState<"models" | "coins" | "byok">(
    "models"
  );

  return (
    <div className="w-full max-w-4xl">
      {/* Tab Navigation */}
      <div className="flex justify-center mb-4">
        <div className="inline-flex bg-blue-950/50 rounded-lg p-1 border border-blue-800/30 gap-1">
          <button
            onClick={() => setActiveTab("models")}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-all flex items-center gap-2 ${
              activeTab === "models"
                ? "bg-blue-600 text-white"
                : "text-blue-200/60 hover:text-blue-200"
            }`}
          >
            <DynamicIcon name="Bot" className="w-4 h-4" /> Models
          </button>
          <button
            onClick={() => setActiveTab("coins")}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-all flex items-center gap-2 ${
              activeTab === "coins"
                ? "bg-blue-600 text-white"
                : "text-blue-200/60 hover:text-blue-200"
            }`}
          >
            <DynamicIcon name="Coins" className="w-4 h-4" /> Coins
          </button>
          <button
            onClick={() => setActiveTab("byok")}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-all flex items-center gap-2 ${
              activeTab === "byok"
                ? "bg-blue-600 text-white"
                : "text-blue-200/60 hover:text-blue-200"
            }`}
          >
            <DynamicIcon name="Key" className="w-4 h-4" /> BYOK
          </button>
        </div>
      </div>

      {/* Tab Content - Compact */}
      <div className="bg-blue-950/30 rounded-xl border border-blue-800/30 p-4">
        {activeTab === "models" && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {Object.entries(AI_MODELS).map(([key, model]) => (
              <div
                key={key}
                className="bg-blue-950/50 rounded-lg p-3 border border-blue-800/30 hover:border-blue-600/50 transition-colors"
              >
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 rounded-full bg-linear-to-br from-purple-500 to-blue-600 flex items-center justify-center text-white text-xs font-bold">
                    {model.cost}
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-white">
                      {model.name}
                    </h3>
                    <p className="text-xs text-blue-200/40">
                      {(model.maxTokens / 1000).toFixed(0)}K tokens
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1">
                  {model.strengths.slice(0, 2).map((s, i) => (
                    <span
                      key={i}
                      className="px-1.5 py-0.5 bg-green-500/20 text-green-300 text-xs rounded"
                    >
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === "coins" && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {packages.map((pkg, index) => (
              <div
                key={pkg.name}
                className={`bg-blue-950/50 rounded-lg p-3 border transition-colors ${
                  index === 2
                    ? "border-purple-500 ring-1 ring-purple-500/50"
                    : "border-blue-800/30 hover:border-blue-600/50"
                }`}
              >
                <div className="text-center">
                  <h3 className="text-sm font-semibold text-white">
                    {pkg.name}
                  </h3>
                  <div className="text-2xl font-bold text-white mt-1">
                    ${pkg.cost}
                  </div>
                  <div className="text-lg text-blue-200">
                    {pkg.coins + pkg.bonus}
                  </div>
                  <div className="text-xs text-blue-200/40">coins</div>
                  {pkg.savings > 0 && (
                    <span className="inline-block mt-2 px-2 py-0.5 bg-green-500/20 text-green-300 text-xs rounded-full">
                      Save {pkg.savings}%
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === "byok" && (
          <div className="text-center py-4">
            <div className="flex items-center justify-center gap-2 mb-2">
              <DynamicIcon name="Key" className="w-6 h-6 text-purple-400" />
              <span className="text-xl font-bold text-white">$10/month</span>
            </div>
            <p className="text-sm text-blue-200/60 mb-3">
              Use your own OpenRouter & Speechify keys for unlimited generations
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              <span className="px-2 py-1 bg-blue-500/20 text-blue-300 text-xs rounded flex items-center gap-1">
                <DynamicIcon name="Check" className="w-3 h-3" /> 100+ AI Models
              </span>
              <span className="px-2 py-1 bg-blue-500/20 text-blue-300 text-xs rounded flex items-center gap-1">
                <DynamicIcon name="Check" className="w-3 h-3" /> Unlimited TTS
              </span>
              <span className="px-2 py-1 bg-blue-500/20 text-blue-300 text-xs rounded flex items-center gap-1">
                <DynamicIcon name="Check" className="w-3 h-3" /> Full Control
              </span>
            </div>
            <p className="text-xs text-blue-200/40 mt-3">Coming Soon</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function Home() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [popularToday, setPopularToday] = useState<Adventure[]>([]);
  const [loadingPopular, setLoadingPopular] = useState(true);
  const [showAuth, setShowAuth] = useState(false);

  // Fetch top 6 most popular adventures
  useEffect(() => {
    const fetchPopular = async () => {
      try {
        const response = await fetch(
          "/api/adventures?sortBy=popularity&limit=6"
        );
        if (!response.ok) throw new Error("Failed to fetch");
        const { adventures } = await response.json();
        setPopularToday(adventures);
      } catch (error) {
        console.error("Error fetching popular adventures:", error);
      } finally {
        setLoadingPopular(false);
      }
    };
    fetchPopular();
  }, []);

  return (
    <div className="min-h-screen bg-linear-to-br from-gray-900 via-blue-950 to-purple-950">
      <main className="max-w-6xl mx-auto px-4 py-6">
        {/* Compact Hero */}
        <div className="text-center mb-8">
          <h1 className="text-4xl sm:text-5xl font-bold mb-3 bg-linear-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
            Your Story
          </h1>
          <p className="text-blue-200/60 text-lg max-w-xl mx-auto mb-6">
            AI-powered interactive fiction where every choice shapes your unique
            adventure
          </p>

          {/* Auth Section - Inline */}
          {!loading && (
            <div className="flex flex-wrap justify-center gap-3 mb-6">
              {user ? (
                <>
                  <button
                    onClick={() => router.push("/library")}
                    className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors flex items-center gap-2 text-sm"
                  >
                    <DynamicIcon name="Library" className="w-4 h-4" /> Library
                  </button>
                  <button
                    onClick={() => router.push("/creator")}
                    className="px-5 py-2 bg-purple-600 hover:bg-purple-700 text-white font-medium rounded-lg transition-colors flex items-center gap-2 text-sm"
                  >
                    <DynamicIcon name="Wand2" className="w-4 h-4" /> Create
                  </button>
                  <button
                    onClick={() => router.push("/explorer")}
                    className="px-5 py-2 bg-blue-950/80 hover:bg-blue-900/80 text-blue-200 font-medium rounded-lg border border-blue-800/30 transition-colors flex items-center gap-2 text-sm"
                  >
                    <DynamicIcon name="Compass" className="w-4 h-4" /> Explore
                  </button>
                  <button
                    onClick={() => router.push(`/profile/${user.id}`)}
                    className="px-5 py-2 bg-blue-950/80 hover:bg-blue-900/80 text-blue-200 font-medium rounded-lg border border-blue-800/30 transition-colors flex items-center gap-2 text-sm"
                  >
                    <DynamicIcon name="User" className="w-4 h-4" /> Profile
                  </button>
                  <button
                    onClick={async () => {
                      await supabase.auth.signOut();
                      router.push("/");
                    }}
                    className="px-5 py-2 bg-red-600/20 hover:bg-red-600/30 text-red-300 font-medium rounded-lg border border-red-500/30 transition-colors flex items-center gap-2 text-sm"
                  >
                    <DynamicIcon name="LogOut" className="w-4 h-4" /> Logout
                  </button>
                </>
              ) : (
                <>
                  {showAuth ? (
                    <div className="w-full max-w-md bg-blue-950/50 rounded-xl border border-blue-800/30 p-4">
                      <AuthForm />
                      <button
                        onClick={() => setShowAuth(false)}
                        className="mt-3 text-sm text-blue-200/40 hover:text-blue-200/60"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <>
                      <button
                        onClick={() => setShowAuth(true)}
                        className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
                      >
                        Sign In
                      </button>
                      <button
                        onClick={() => router.push("/explorer")}
                        className="px-6 py-2.5 bg-blue-950/80 hover:bg-blue-900/80 text-blue-200 font-medium rounded-lg border border-blue-800/30 transition-colors"
                      >
                        Browse Adventures
                      </button>
                    </>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {/* Quick Start Genres */}
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
                <DynamicIcon name={genre.icon} className="w-4 h-4" />
                {genre.name}
              </button>
            ))}
          </div>
        </div>

        {/* Featured Adventures */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-white flex items-center gap-2">
              <DynamicIcon name="Flame" className="w-5 h-5 text-orange-400" />
              Popular
            </h2>
            <button
              onClick={() => router.push("/explorer")}
              className="text-sm text-blue-400 hover:text-blue-300 flex items-center gap-1"
            >
              View all <DynamicIcon name="ChevronRight" className="w-4 h-4" />
            </button>
          </div>

          <DraggableScroll className="flex gap-3 pb-2 -mx-4 px-4">
            {loadingPopular ? (
              Array(6)
                .fill(0)
                .map((_, i) => (
                  <div
                    key={i}
                    className="shrink-0 w-64 bg-blue-950/50 rounded-xl border border-blue-800/30 overflow-hidden animate-pulse"
                  >
                    <div className="h-32 bg-blue-900/50" />
                    <div className="p-3 space-y-2">
                      <div className="h-4 bg-blue-900/50 rounded w-3/4" />
                      <div className="h-3 bg-blue-900/50 rounded w-full" />
                    </div>
                  </div>
                ))
            ) : popularToday.length === 0 ? (
              <div className="w-full text-center py-8 text-blue-200/40">
                No adventures yet. Be the first to create one!
              </div>
            ) : (
              popularToday.map((adventure, index) => (
                <div
                  key={adventure.id}
                  onClick={() => router.push(`/explorer/${adventure.id}`)}
                  className="shrink-0 w-64 bg-blue-950/50 rounded-xl border border-blue-800/30 overflow-hidden cursor-pointer hover:border-blue-600/50 transition-all group"
                >
                  {adventure.thumbnailUrl ? (
                    <div className="h-32 relative overflow-hidden">
                      <Image
                        src={adventure.thumbnailUrl}
                        alt={adventure.title}
                        fill
                        className="object-cover group-hover:scale-105 transition-transform"
                        sizes="256px"
                      />
                    </div>
                  ) : (
                    <div
                      className={`h-32 bg-linear-to-br ${
                        index % 3 === 0
                          ? "from-blue-500/30 to-purple-500/30"
                          : index % 3 === 1
                          ? "from-purple-500/30 to-pink-500/30"
                          : "from-pink-500/30 to-orange-500/30"
                      } flex items-center justify-center`}
                    >
                      <DynamicIcon
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
                        <DynamicIcon
                          name="Star"
                          className="w-3 h-3 fill-current"
                        />
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
          </DraggableScroll>
        </div>

        {/* How It Works */}
        <div className="mb-8">
          <h2 className="text-sm font-medium text-blue-200/40 uppercase tracking-wider mb-4 text-center">
            How It Works
          </h2>
          <div className="grid grid-cols-3 gap-4 max-w-2xl mx-auto">
            {steps.map((step, i) => (
              <div key={i} className="text-center">
                <div className="w-12 h-12 rounded-full bg-blue-600/20 flex items-center justify-center mx-auto mb-2">
                  <DynamicIcon
                    name={step.icon}
                    className="w-6 h-6 text-blue-400"
                  />
                </div>
                <h3 className="font-medium text-white text-sm mb-1">
                  {step.title}
                </h3>
                <p className="text-xs text-blue-200/40">{step.description}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Features Pills */}
        <div className="mb-8">
          <div className="flex flex-wrap justify-center gap-2">
            {features.map((feature, i) => (
              <span
                key={i}
                className="px-3 py-1.5 bg-blue-950/30 text-blue-200/60 rounded-full text-xs flex items-center gap-1.5 border border-blue-800/20"
              >
                <DynamicIcon name={feature.icon} className="w-3.5 h-3.5" />
                {feature.label}
              </span>
            ))}
          </div>
        </div>

        {/* Roadmap - Compact Horizontal */}
        <div className="mb-8">
          <h2 className="text-sm font-medium text-blue-200/40 uppercase tracking-wider mb-4 text-center">
            Roadmap
          </h2>
          <DraggableScroll className="flex gap-3 pb-2 -mx-4 px-4">
            {road_map.map((item, i) => (
              <div
                key={i}
                className={`shrink-0 w-48 p-3 rounded-xl border ${
                  item.status === "done"
                    ? "bg-green-500/10 border-green-500/30"
                    : item.status === "wip"
                    ? "bg-blue-500/10 border-blue-500/30"
                    : "bg-blue-950/30 border-blue-800/20"
                }`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <DynamicIcon
                    name={item.icon}
                    className={`w-4 h-4 ${
                      item.status === "done"
                        ? "text-green-400"
                        : item.status === "wip"
                        ? "text-blue-400"
                        : "text-blue-200/40"
                    }`}
                  />
                  <span
                    className={`text-xs px-1.5 py-0.5 rounded ${
                      item.status === "done"
                        ? "bg-green-500/20 text-green-300"
                        : item.status === "wip"
                        ? "bg-blue-500/20 text-blue-300"
                        : "bg-blue-800/20 text-blue-200/40"
                    }`}
                  >
                    {item.status === "done"
                      ? "Done"
                      : item.status === "wip"
                      ? "WIP"
                      : "Planned"}
                  </span>
                </div>
                <h3 className="font-medium text-white text-sm mb-1">
                  {item.title}
                </h3>
                <p className="text-xs text-blue-200/40 line-clamp-2">
                  {item.description}
                </p>
              </div>
            ))}
          </DraggableScroll>
        </div>

        {/* Info Tabs - Models/Coins/BYOK */}
        <div className="mb-8">
          <InfoTabs />
        </div>

        {/* Footer */}
        <footer className="text-center pt-4 border-t border-blue-800/20">
          <p className="text-xs text-blue-200/30">
            © 2025 Your Story • AI-powered interactive fiction
          </p>
          <div className="mt-2 flex justify-center gap-4">
            <button
              onClick={() => router.push("/terms")}
              className="text-xs text-blue-200/40 hover:text-blue-200/60 transition-colors"
            >
              Terms of Service
            </button>
            <span className="text-blue-200/20">•</span>
            <button
              onClick={() => router.push("/privacy")}
              className="text-xs text-blue-200/40 hover:text-blue-200/60 transition-colors"
            >
              Privacy Policy
            </button>
          </div>
        </footer>
      </main>
    </div>
  );
}
