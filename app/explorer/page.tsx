"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Adventure } from "@/app/misc/structs";
import { sampleAdventures, getFeaturedAdventures, filterAdventures, getAllTags } from "@/app/misc/sample_adventures";
import { useAuth } from "@/app/misc/AuthContext";

export default function ExplorerPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [adventures, setAdventures] = useState<Adventure[]>(sampleAdventures);
  const [featuredAdventures] = useState<Adventure[]>(getFeaturedAdventures());
  const [currentSlide, setCurrentSlide] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedDifficulties, setSelectedDifficulties] = useState<("Easy" | "Medium" | "Hard" | "Expert")[]>([]);
  const [sortBy, setSortBy] = useState<"popularity" | "newest" | "rating" | "title">("popularity");
  const [showFilters, setShowFilters] = useState(false);

  const allTags = getAllTags();

  // Auto-advance carousel
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % featuredAdventures.length);
    }, 5000);
    return () => clearInterval(interval);
  }, [featuredAdventures.length]);

  // Apply filters
  useEffect(() => {
    const filtered = filterAdventures(sampleAdventures, {
      searchQuery,
      tags: selectedTags.length > 0 ? selectedTags : undefined,
      difficulty: selectedDifficulties.length > 0 ? selectedDifficulties : undefined,
      sortBy,
    });
    setAdventures(filtered);
  }, [searchQuery, selectedTags, selectedDifficulties, sortBy]);

  const toggleTag = (tag: string) => {
    setSelectedTags(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    );
  };

  const toggleDifficulty = (diff: "Easy" | "Medium" | "Hard" | "Expert") => {
    setSelectedDifficulties(prev =>
      prev.includes(diff) ? prev.filter(d => d !== diff) : [...prev, diff]
    );
  };

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case "Easy": return "text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/30 border-green-200 dark:border-green-800";
      case "Medium": return "text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/30 border-yellow-200 dark:border-yellow-800";
      case "Hard": return "text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/30 border-orange-200 dark:border-orange-800";
      case "Expert": return "text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-800";
      default: return "text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-900/30 border-gray-200 dark:border-gray-800";
    }
  };

  return (
    <div className="min-h-screen bg-linear-to-br from-blue-50 via-purple-50 to-pink-50 dark:from-gray-900 dark:via-purple-900 dark:to-blue-900">
      <div className="max-w-7xl mx-auto p-4 sm:p-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-3xl sm:text-4xl font-bold bg-linear-to-r from-blue-600 via-purple-600 to-pink-600 bg-clip-text text-transparent">
              Story Explorer
            </h1>
            <button
              onClick={() => router.push("/")}
              className="px-4 py-2 bg-white dark:bg-gray-800 border-2 border-gray-300 dark:border-gray-600 hover:border-blue-500 dark:hover:border-blue-400 text-gray-900 dark:text-white font-semibold rounded-lg transition-colors shadow-md"
            >
              ← Home
            </button>
          </div>
          <p className="text-gray-700 dark:text-gray-300 text-lg">
            Discover amazing interactive stories or create your own adventure
          </p>
        </div>

        {/* Featured Carousel */}
        {featuredAdventures.length > 0 && (
          <div className="mb-12">
            <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">
              ⭐ Featured Adventures
            </h2>
            <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-xl overflow-hidden border border-gray-200 dark:border-gray-700">
              <div className="relative h-64 sm:h-80 md:h-96">
                {featuredAdventures.map((adventure, index) => (
                  <div
                    key={adventure.id}
                    className={`absolute inset-0 transition-opacity duration-500 ${
                      index === currentSlide ? "opacity-100" : "opacity-0"
                    }`}
                  >
                    <div className="h-full bg-linear-to-r from-purple-600 via-pink-600 to-blue-600 p-8 sm:p-12 flex flex-col justify-center">
                      <div className="max-w-2xl">
                        <div className="flex items-center gap-2 mb-4">
                          <span className={`px-3 py-1 rounded-full text-sm font-bold border-2 ${getDifficultyColor(adventure.difficulty)}`}>
                            {adventure.difficulty}
                          </span>
                          <span className="px-3 py-1 bg-white/20 text-white rounded-full text-sm font-semibold">
                            ⭐ {adventure.rating?.toFixed(1)}
                          </span>
                        </div>
                        <h3 className="text-3xl sm:text-4xl font-bold text-white mb-4">
                          {adventure.title}
                        </h3>
                        <p className="text-white/90 text-lg mb-6 line-clamp-3">
                          {adventure.description}
                        </p>
                        <div className="flex flex-wrap gap-2 mb-6">
                          {adventure.tags.slice(0, 4).map(tag => (
                            <span key={tag} className="px-3 py-1 bg-white/20 text-white rounded-full text-sm">
                              {tag}
                            </span>
                          ))}
                        </div>
                        <button
                          onClick={() => router.push(`/explorer/${adventure.id}`)}
                          className="px-8 py-4 bg-white text-purple-600 font-bold rounded-lg shadow-lg hover:shadow-xl transition-all hover:scale-105"
                        >
                          Start Adventure →
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              
              {/* Carousel Navigation */}
              <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 flex gap-2">
                {featuredAdventures.map((_, index) => (
                  <button
                    key={index}
                    onClick={() => setCurrentSlide(index)}
                    className={`w-3 h-3 rounded-full transition-all ${
                      index === currentSlide
                        ? "bg-white w-8"
                        : "bg-white/50 hover:bg-white/75"
                    }`}
                  />
                ))}
              </div>

              {/* Arrow Navigation */}
              <button
                onClick={() => setCurrentSlide((prev) => (prev - 1 + featuredAdventures.length) % featuredAdventures.length)}
                className="absolute left-4 top-1/2 transform -translate-y-1/2 p-2 bg-white/20 hover:bg-white/30 text-white rounded-full transition-colors"
              >
                ←
              </button>
              <button
                onClick={() => setCurrentSlide((prev) => (prev + 1) % featuredAdventures.length)}
                className="absolute right-4 top-1/2 transform -translate-y-1/2 p-2 bg-white/20 hover:bg-white/30 text-white rounded-full transition-colors"
              >
                →
              </button>
            </div>
          </div>
        )}

        {/* Create Your Own Section */}
        <div className="mb-12">
          <div className="bg-linear-to-r from-green-400 via-blue-500 to-purple-500 rounded-2xl shadow-xl p-8 border border-gray-200 dark:border-gray-700">
            <div className="max-w-3xl mx-auto text-center">
              <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
                ✨ Create Your Own Story
              </h2>
              <p className="text-white/90 text-lg mb-6">
                Have an idea for an epic adventure? Bring your imagination to life and share it with the community!
              </p>
              <button
                onClick={() => {
                  if (!user) {
                    router.push("/");
                  } else {
                    router.push("/creator");
                  }
                }}
                className="px-8 py-4 bg-white text-purple-600 font-bold rounded-lg shadow-lg hover:shadow-xl transition-all hover:scale-105"
              >
                {user ? "🎨 Start Creating" : "🔐 Sign In to Create"}
              </button>
            </div>
          </div>
        </div>

        {/* Search and Filters */}
        <div className="mb-8 bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6 border border-gray-200 dark:border-gray-700">
          <div className="flex flex-col gap-4">
            {/* Search Bar */}
            <div className="flex gap-3">
              <input
                type="text"
                placeholder="Search adventures..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="flex-1 px-4 py-3 border-2 border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:border-purple-500 dark:focus:border-purple-400 focus:ring-2 focus:ring-purple-200 dark:focus:ring-purple-800 transition-colors"
              />
              <button
                onClick={() => setShowFilters(!showFilters)}
                className="px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg transition-colors"
              >
                {showFilters ? "Hide Filters" : "Show Filters"}
              </button>
            </div>

            {/* Filters Panel */}
            {showFilters && (
              <div className="space-y-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                {/* Sort By */}
                <div>
                  <label className="block text-sm font-bold text-gray-900 dark:text-white mb-2">
                    Sort By:
                  </label>
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as any)}
                    className="w-full sm:w-auto px-4 py-2 border-2 border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  >
                    <option value="popularity">Most Popular</option>
                    <option value="newest">Newest</option>
                    <option value="rating">Highest Rated</option>
                    <option value="title">A-Z</option>
                  </select>
                </div>

                {/* Difficulty Filter */}
                <div>
                  <label className="block text-sm font-bold text-gray-900 dark:text-white mb-2">
                    Difficulty:
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {(["Easy", "Medium", "Hard", "Expert"] as const).map(diff => (
                      <button
                        key={diff}
                        onClick={() => toggleDifficulty(diff)}
                        className={`px-4 py-2 rounded-lg font-semibold transition-all border-2 ${
                          selectedDifficulties.includes(diff)
                            ? getDifficultyColor(diff) + " ring-2 ring-offset-2"
                            : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600"
                        }`}
                      >
                        {diff}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Tags Filter */}
                <div>
                  <label className="block text-sm font-bold text-gray-900 dark:text-white mb-2">
                    Tags:
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {allTags.map(tag => (
                      <button
                        key={tag}
                        onClick={() => toggleTag(tag)}
                        className={`px-4 py-2 rounded-full font-semibold transition-all ${
                          selectedTags.includes(tag)
                            ? "bg-purple-600 text-white ring-2 ring-purple-400"
                            : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
                        }`}
                      >
                        {tag}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Clear Filters */}
                {(selectedTags.length > 0 || selectedDifficulties.length > 0 || searchQuery) && (
                  <button
                    onClick={() => {
                      setSelectedTags([]);
                      setSelectedDifficulties([]);
                      setSearchQuery("");
                    }}
                    className="px-4 py-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-900 dark:text-white rounded-lg transition-colors"
                  >
                    Clear All Filters
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Adventures Grid */}
        <div>
          <h2 className="text-2xl font-bold mb-6 text-gray-900 dark:text-white">
            All Adventures ({adventures.length})
          </h2>
          {adventures.length === 0 ? (
            <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700">
              <p className="text-gray-600 dark:text-gray-400 text-lg">
                No adventures found matching your filters
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {adventures.map(adventure => (
                <div
                  key={adventure.id}
                  className="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 overflow-hidden hover:shadow-xl transition-all hover:scale-105 cursor-pointer"
                  onClick={() => router.push(`/explorer/${adventure.id}`)}
                >
                  {/* Thumbnail Placeholder */}
                  <div className="h-40 bg-linear-to-br from-blue-400 via-purple-500 to-pink-500 flex items-center justify-center">
                    <span className="text-6xl">{adventure.tags[0] === "Fantasy" ? "⚔️" : adventure.tags[0] === "Sci-Fi" ? "🚀" : adventure.tags[0] === "Mystery" ? "🔍" : "📖"}</span>
                  </div>
                  
                  <div className="p-5">
                    <div className="flex items-start justify-between mb-3">
                      <h3 className="text-xl font-bold text-gray-900 dark:text-white line-clamp-1">
                        {adventure.title}
                      </h3>
                      {adventure.isFeatured && (
                        <span className="text-yellow-500">⭐</span>
                      )}
                    </div>
                    
                    <p className="text-gray-600 dark:text-gray-400 text-sm mb-4 line-clamp-2">
                      {adventure.shortDescription}
                    </p>
                    
                    <div className="flex items-center gap-2 mb-3">
                      <span className={`px-2 py-1 rounded-full text-xs font-bold border ${getDifficultyColor(adventure.difficulty)}`}>
                        {adventure.difficulty}
                      </span>
                      <span className="text-xs text-gray-600 dark:text-gray-400">
                        ⏱️ {adventure.estimatedDuration}
                      </span>
                    </div>
                    
                    <div className="flex flex-wrap gap-1 mb-4">
                      {adventure.tags.slice(0, 3).map(tag => (
                        <span key={tag} className="px-2 py-1 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded text-xs">
                          {tag}
                        </span>
                      ))}
                    </div>
                    
                    <div className="flex items-center justify-between pt-3 border-t border-gray-200 dark:border-gray-700">
                      <div className="flex items-center gap-3 text-xs text-gray-600 dark:text-gray-400">
                        <span>⭐ {adventure.rating?.toFixed(1)}</span>
                        <span>👥 {adventure.playCount.toLocaleString()}</span>
                      </div>
                      <span className="text-purple-600 dark:text-purple-400 font-semibold text-sm">
                        Play →
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
