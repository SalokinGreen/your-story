"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Adventure } from "@/app/misc/structs";
import { useAuth } from "@/app/misc/AuthContext";
import { DynamicIcon } from "@/app/components/DynamicIcon";

export default function ExplorerPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [adventures, setAdventures] = useState<Adventure[]>([]);
  const [featuredAdventures, setFeaturedAdventures] = useState<Adventure[]>([]);
  const [allTags, setAllTags] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedDifficulties, setSelectedDifficulties] = useState<
    ("easy" | "medium" | "hard" | "expert")[]
  >([]);
  const [sortBy, setSortBy] = useState<
    "popularity" | "newest" | "rating" | "title"
  >("popularity");
  const [showFilters, setShowFilters] = useState(false);
  const [showNsfw, setShowNsfw] = useState(false);

  // Fetch adventures from database
  useEffect(() => {
    const fetchAdventures = async () => {
      try {
        setLoading(true);

        // Build query params
        const params = new URLSearchParams();
        if (searchQuery) params.append("search", searchQuery);
        if (selectedTags.length > 0)
          params.append("tags", selectedTags.join(","));
        if (selectedDifficulties.length > 0)
          params.append("difficulty", selectedDifficulties.join(","));
        if (showNsfw) params.append("nsfw", "true");
        params.append("sortBy", sortBy);

        const response = await fetch(`/api/adventures?${params}`);
        if (!response.ok) throw new Error("Failed to fetch adventures");

        const { adventures: fetchedAdventures } = await response.json();
        setAdventures(fetchedAdventures);

        // Extract unique tags
        const tags = new Set<string>();
        fetchedAdventures.forEach((adventure: Adventure) => {
          adventure.tags.forEach((tag: string) => tags.add(tag));
        });
        setAllTags(Array.from(tags).sort());
      } catch (error) {
        console.error("Error fetching adventures:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchAdventures();
  }, [searchQuery, selectedTags, selectedDifficulties, sortBy, showNsfw]);

  // Fetch featured adventures
  useEffect(() => {
    const fetchFeatured = async () => {
      try {
        const response = await fetch("/api/adventures?featured=true");
        if (!response.ok) throw new Error("Failed to fetch featured");

        const { adventures: featured } = await response.json();
        setFeaturedAdventures(featured);
      } catch (error) {
        console.error("Error fetching featured:", error);
      }
    };

    fetchFeatured();
  }, []);

  // Auto-advance carousel
  useEffect(() => {
    if (featuredAdventures.length === 0) return;
    const interval = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % featuredAdventures.length);
    }, 5000);
    return () => clearInterval(interval);
  }, [featuredAdventures.length]);

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const toggleDifficulty = (diff: "easy" | "medium" | "hard" | "expert") => {
    setSelectedDifficulties((prev) =>
      prev.includes(diff) ? prev.filter((d) => d !== diff) : [...prev, diff]
    );
  };

  const getDifficultyColor = (difficulty: string) => {
    const lower = difficulty.toLowerCase();
    switch (lower) {
      case "easy":
        return "text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/30 border-green-200 dark:border-green-800";
      case "medium":
        return "text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/30 border-yellow-200 dark:border-yellow-800";
      case "hard":
        return "text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/30 border-orange-200 dark:border-orange-800";
      case "expert":
        return "text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-800";
      default:
        return "text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-900/30 border-gray-200 dark:border-gray-800";
    }
  };

  return (
    <div className="min-h-screen bg-linear-to-br from-blue-50 via-purple-50 to-pink-50 dark:from-gray-900 dark:via-purple-900 dark:to-blue-900 pt-16">
      <div className="max-w-7xl mx-auto p-4 sm:p-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
            <h1 className="text-3xl sm:text-4xl font-bold bg-linear-to-r from-blue-600 via-purple-600 to-pink-600 bg-clip-text text-transparent">
              Story Explorer
            </h1>
            <div className="flex gap-2">
              {user && (
                <button
                  onClick={() => router.push("/library")}
                  className="px-4 py-2 bg-white dark:bg-blue-950 border-2 border-gray-300 dark:border-gray-600 hover:border-green-500 dark:hover:border-green-400 text-gray-900 dark:text-white font-semibold rounded-lg transition-colors shadow-md flex items-center gap-2"
                >
                  <DynamicIcon name="Library" className="w-4 h-4" /> Library
                </button>
              )}
              <button
                onClick={() => router.push("/")}
                className="px-4 py-2 bg-white dark:bg-blue-950 border-2 border-gray-300 dark:border-gray-600 hover:border-blue-500 dark:hover:border-blue-400 text-gray-900 dark:text-white font-semibold rounded-lg transition-colors shadow-md flex items-center gap-2"
              >
                <DynamicIcon name="ArrowLeft" className="w-4 h-4" /> Home
              </button>
            </div>
          </div>
          <p className="text-gray-700 dark:text-gray-300 text-lg">
            Discover amazing interactive stories or create your own adventure
          </p>
        </div>

        {/* Featured Carousel */}
        {featuredAdventures.length > 0 && (
          <div className="mb-12">
            <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white flex items-center gap-2">
              <DynamicIcon name="Star" className="w-6 h-6 text-yellow-500" />{" "}
              Featured Adventures
            </h2>
            <div className="relative bg-white dark:bg-blue-950 rounded-2xl shadow-xl overflow-hidden border border-gray-200 dark:border-gray-700">
              <div className="relative h-96 sm:h-80 md:h-96">
                {featuredAdventures.map((adventure, index) => (
                  <div
                    key={adventure.id}
                    className={`absolute inset-0 transition-opacity duration-500 ${
                      index === currentSlide ? "opacity-100" : "opacity-0"
                    }`}
                  >
                    <div
                      className={`h-full p-6 sm:p-8 md:p-12 flex flex-col justify-end sm:justify-center relative ${
                        adventure.bannerUrl
                          ? "bg-cover bg-center"
                          : "bg-linear-to-r from-purple-600 via-pink-600 to-blue-600"
                      }`}
                      style={
                        adventure.bannerUrl
                          ? { backgroundImage: `url(${adventure.bannerUrl})` }
                          : {}
                      }
                    >
                      {adventure.bannerUrl && (
                        <div className="absolute inset-0 bg-linear-to-t sm:bg-linear-to-r from-black/95 via-black/80 to-black/40 sm:from-black/90 sm:via-black/60 sm:to-transparent z-0"></div>
                      )}
                      <div className="max-w-2xl relative z-10">
                        <div className="flex items-center gap-2 mb-3 flex-wrap">
                          <span
                            className={`px-2 sm:px-3 py-1 rounded-full text-xs sm:text-sm font-bold border-2 ${getDifficultyColor(
                              adventure.difficulty
                            )}`}
                          >
                            {adventure.difficulty}
                          </span>
                          <span className="px-2 sm:px-3 py-1 bg-white/20 text-white rounded-full text-xs sm:text-sm font-semibold flex items-center gap-1">
                            <DynamicIcon
                              name="Star"
                              className="w-3 sm:w-4 h-3 sm:h-4 fill-current"
                            />{" "}
                            {adventure.rating?.toFixed(1)}
                          </span>
                        </div>
                        <h3 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white mb-3 sm:mb-4 leading-tight">
                          {adventure.title}
                        </h3>
                        <p className="text-white/90 text-sm sm:text-base md:text-lg mb-4 sm:mb-6 line-clamp-2 sm:line-clamp-3">
                          {adventure.description}
                        </p>
                        <div className="flex flex-wrap gap-1.5 sm:gap-2 mb-4 sm:mb-6">
                          {adventure.tags.slice(0, 4).map((tag) => (
                            <span
                              key={tag}
                              className="px-2 sm:px-3 py-1 bg-white/20 text-white rounded-full text-xs sm:text-sm"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                        <button
                          onClick={() =>
                            router.push(`/explorer/${adventure.id}`)
                          }
                          className="w-full sm:w-auto px-6 sm:px-8 py-3 sm:py-4 bg-white text-purple-600 font-bold rounded-lg shadow-lg hover:shadow-xl transition-all hover:scale-105 text-sm sm:text-base"
                        >
                          Start Adventure →
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Carousel Navigation */}
              <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 flex gap-2 z-20">
                {featuredAdventures.map((_, index) => (
                  <button
                    key={index}
                    onClick={() => setCurrentSlide(index)}
                    className={`w-2 h-2 sm:w-3 sm:h-3 rounded-full transition-all ${
                      index === currentSlide
                        ? "bg-white w-6 sm:w-8"
                        : "bg-white/50 hover:bg-white/75"
                    }`}
                  />
                ))}
              </div>

              {/* Arrow Navigation */}
              <button
                onClick={() =>
                  setCurrentSlide(
                    (prev) =>
                      (prev - 1 + featuredAdventures.length) %
                      featuredAdventures.length
                  )
                }
                className="absolute left-2 sm:left-4 top-1/2 transform -translate-y-1/2 p-1.5 sm:p-2 bg-white/20 hover:bg-white/30 text-white rounded-full transition-colors z-20"
              >
                <DynamicIcon
                  name="ChevronLeft"
                  className="w-5 h-5 sm:w-6 sm:h-6"
                />
              </button>
              <button
                onClick={() =>
                  setCurrentSlide(
                    (prev) => (prev + 1) % featuredAdventures.length
                  )
                }
                className="absolute right-2 sm:right-4 top-1/2 transform -translate-y-1/2 p-1.5 sm:p-2 bg-white/20 hover:bg-white/30 text-white rounded-full transition-colors z-20"
              >
                <DynamicIcon
                  name="ChevronRight"
                  className="w-5 h-5 sm:w-6 sm:h-6"
                />
              </button>
            </div>
          </div>
        )}

        {/* Create Your Own Section */}
        <div className="mb-12">
          <div className="bg-linear-to-r from-green-400 via-blue-500 to-purple-500 rounded-2xl shadow-xl p-8 border border-gray-200 dark:border-gray-700">
            <div className="max-w-3xl mx-auto text-center">
              <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4 flex items-center justify-center gap-2">
                <DynamicIcon name="Sparkles" className="w-8 h-8" /> Create Your
                Own Story
              </h2>
              <p className="text-white/90 text-lg mb-6">
                Have an idea for an epic adventure? Bring your imagination to
                life and share it with the community!
              </p>
              <button
                onClick={() => {
                  if (!user) {
                    router.push("/");
                  } else {
                    router.push("/creator");
                  }
                }}
                className="px-8 py-4 bg-white text-purple-600 font-bold rounded-lg shadow-lg hover:shadow-xl transition-all hover:scale-105 flex items-center justify-center gap-2 mx-auto"
              >
                {user ? (
                  <>
                    <DynamicIcon name="Palette" className="w-5 h-5" /> Start
                    Creating
                  </>
                ) : (
                  <>
                    <DynamicIcon name="Lock" className="w-5 h-5" /> Sign In to
                    Create
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Search and Filters */}
        <div className="mb-8 bg-white dark:bg-blue-950 rounded-2xl shadow-xl p-6 border border-gray-200 dark:border-gray-700">
          <div className="flex flex-col gap-4">
            {/* Search Bar */}
            <div className="flex flex-col sm:flex-row gap-3">
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
                    {(["easy", "medium", "hard", "expert"] as const).map(
                      (diff) => (
                        <button
                          key={diff}
                          onClick={() => toggleDifficulty(diff)}
                          className={`px-4 py-2 rounded-lg font-semibold transition-all border-2 ${
                            selectedDifficulties.includes(diff)
                              ? getDifficultyColor(diff) +
                                " ring-2 ring-offset-2"
                              : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600"
                          }`}
                        >
                          {diff.charAt(0).toUpperCase() + diff.slice(1)}
                        </button>
                      )
                    )}
                  </div>
                </div>

                {/* Tags Filter */}
                <div>
                  <label className="block text-sm font-bold text-gray-900 dark:text-white mb-2">
                    Tags:
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {allTags.map((tag) => (
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

                {/* NSFW Toggle */}
                <div>
                  <label className="flex items-center gap-3 cursor-pointer">
                    <div className="relative">
                      <input
                        type="checkbox"
                        checked={showNsfw}
                        onChange={(e) => setShowNsfw(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-purple-300 dark:peer-focus:ring-purple-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-red-600"></div>
                    </div>
                    <span className="text-sm font-bold text-gray-900 dark:text-white">
                      Show NSFW Content
                    </span>
                  </label>
                </div>

                {/* Clear Filters */}
                {(selectedTags.length > 0 ||
                  selectedDifficulties.length > 0 ||
                  searchQuery) && (
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
          {loading ? (
            <div className="text-center py-12 bg-white dark:bg-blue-950 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700">
              <div className="animate-spin rounded-full h-12 w-12 border-4 border-purple-600 border-t-transparent mx-auto"></div>
              <p className="text-gray-600 dark:text-gray-400 text-lg mt-4">
                Loading adventures...
              </p>
            </div>
          ) : adventures.length === 0 ? (
            <div className="text-center py-12 bg-white dark:bg-blue-950 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700">
              <p className="text-gray-600 dark:text-gray-400 text-lg">
                No adventures found matching your filters
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {adventures.map((adventure) => (
                <div
                  key={adventure.id}
                  className="bg-white dark:bg-blue-950 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 overflow-hidden hover:shadow-xl transition-all hover:scale-105 cursor-pointer"
                  onClick={() => router.push(`/explorer/${adventure.id}`)}
                >
                  {/* Thumbnail Image or Placeholder */}
                  {adventure.thumbnailUrl ? (
                    <div
                      className="h-40 bg-cover bg-center"
                      style={{
                        backgroundImage: `url(${adventure.thumbnailUrl})`,
                      }}
                    />
                  ) : (
                    <div className="h-40 bg-linear-to-br from-blue-400 via-purple-500 to-pink-500 flex items-center justify-center text-white">
                      {adventure.tags[0] === "Fantasy" ? (
                        <DynamicIcon name="Sword" className="w-16 h-16" />
                      ) : adventure.tags[0] === "Sci-Fi" ? (
                        <DynamicIcon name="Rocket" className="w-16 h-16" />
                      ) : adventure.tags[0] === "Mystery" ? (
                        <DynamicIcon name="Search" className="w-16 h-16" />
                      ) : (
                        <DynamicIcon name="BookOpen" className="w-16 h-16" />
                      )}
                    </div>
                  )}

                  <div className="p-5">
                    <div className="flex items-start justify-between mb-3">
                      <h3 className="text-xl font-bold text-gray-900 dark:text-white flex-1">
                        {adventure.title}
                      </h3>
                      {adventure.isFeatured && (
                        <span className="text-yellow-500 ml-2">
                          <DynamicIcon
                            name="Star"
                            className="w-5 h-5 fill-current"
                          />
                        </span>
                      )}
                    </div>

                    <p className="text-gray-600 dark:text-gray-400 text-sm mb-4 line-clamp-2">
                      {adventure.shortDescription}
                    </p>

                    <div className="flex items-center gap-2 mb-3">
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-bold border capitalize ${getDifficultyColor(
                          adventure.difficulty
                        )}`}
                      >
                        {adventure.difficulty}
                      </span>
                      <span className="text-xs text-gray-600 dark:text-gray-400 flex items-center gap-1">
                        <DynamicIcon name="Clock" className="w-3 h-3" />{" "}
                        {adventure.estimatedDuration}
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-1 mb-4">
                      {adventure.tags.slice(0, 3).map((tag) => (
                        <span
                          key={tag}
                          className="px-2 py-1 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded text-xs"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>

                    <div className="flex items-center justify-between pt-3 border-t border-gray-200 dark:border-gray-700">
                      <div className="flex items-center gap-3 text-xs text-gray-600 dark:text-gray-400">
                        <span className="flex items-center gap-1">
                          <DynamicIcon
                            name="Star"
                            className="w-3 h-3 fill-current"
                          />{" "}
                          {adventure.rating?.toFixed(1)}
                        </span>
                        <span className="flex items-center gap-1">
                          <DynamicIcon name="Users" className="w-3 h-3" />{" "}
                          {adventure.playCount
                            ? adventure.playCount.toLocaleString()
                            : "0"}
                        </span>
                      </div>
                      <span className="text-purple-600 dark:text-purple-400 font-semibold text-sm flex items-center gap-1">
                        Play{" "}
                        <DynamicIcon name="ArrowRight" className="w-3 h-3" />
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
