"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Adventure } from "@/app/misc/structs";
import { useAuth } from "@/app/misc/AuthContext";
import { DynamicIcon } from "@/app/components/DynamicIcon";
import { DraggableScroll } from "@/app/components/DraggableScroll";
import {
  AdventureGridSkeleton,
  FeaturedCarouselSkeleton,
} from "@/app/components/Skeleton";

const GENRES = [
  "All",
  "Fantasy",
  "Sci-Fi",
  "Mystery",
  "Horror",
  "Romance",
  "Adventure",
  "Comedy",
  "Drama",
  "Historical",
];

const SORT_OPTIONS = [
  { value: "popularity", label: "Popular" },
  { value: "newest", label: "New" },
  { value: "rating", label: "Top Rated" },
  { value: "title", label: "A-Z" },
];

export default function ExplorerPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [adventures, setAdventures] = useState<Adventure[]>([]);
  const [featuredAdventures, setFeaturedAdventures] = useState<Adventure[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingFeatured, setLoadingFeatured] = useState(true);

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedGenre, setSelectedGenre] = useState("All");
  const [sortBy, setSortBy] = useState<
    "popularity" | "newest" | "rating" | "title"
  >("popularity");
  const [showNsfw, setShowNsfw] = useState(false);
  const [showFiltersDropdown, setShowFiltersDropdown] = useState(false);

  const filtersRef = useRef<HTMLDivElement>(null);

  // Refs to track if we've already loaded data (prevents reload on tab focus)
  const hasLoadedAdventuresRef = useRef<string | boolean>(false);
  const hasLoadedFeaturedRef = useRef(false);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        filtersRef.current &&
        !filtersRef.current.contains(e.target as Node)
      ) {
        setShowFiltersDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Fetch adventures
  useEffect(() => {
    const fetchAdventures = async () => {
      // Skip re-fetch on tab focus if filters haven't changed
      const currentFilterKey = `${searchQuery}-${selectedGenre}-${sortBy}-${showNsfw}`;
      if (hasLoadedAdventuresRef.current === currentFilterKey) {
        return;
      }

      try {
        setLoading(true);
        const params = new URLSearchParams();
        if (searchQuery) params.append("search", searchQuery);
        if (selectedGenre !== "All") params.append("tags", selectedGenre);
        if (showNsfw) params.append("nsfw", "true");
        params.append("sortBy", sortBy);

        const response = await fetch(`/api/adventures?${params}`);
        if (!response.ok) throw new Error("Failed to fetch");
        const { adventures: fetched } = await response.json();
        setAdventures(fetched);

        // Mark this filter combination as loaded
        hasLoadedAdventuresRef.current = currentFilterKey;
      } catch (error) {
        console.error("Error fetching adventures:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchAdventures();
  }, [searchQuery, selectedGenre, sortBy, showNsfw]);

  // Fetch featured
  useEffect(() => {
    const fetchFeatured = async () => {
      // Skip re-fetch on tab focus
      if (hasLoadedFeaturedRef.current) {
        return;
      }

      try {
        setLoadingFeatured(true);
        const response = await fetch("/api/adventures?featured=true");
        if (!response.ok) throw new Error("Failed to fetch featured");
        const { adventures: featured } = await response.json();
        setFeaturedAdventures(featured);

        // Mark as loaded
        hasLoadedFeaturedRef.current = true;
      } catch (error) {
        console.error("Error fetching featured:", error);
      } finally {
        setLoadingFeatured(false);
      }
    };
    fetchFeatured();
  }, []);

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty.toLowerCase()) {
      case "easy":
        return "bg-emerald-500/20 text-emerald-400 border-emerald-500/30";
      case "medium":
        return "bg-amber-500/20 text-amber-400 border-amber-500/30";
      case "hard":
        return "bg-orange-500/20 text-orange-400 border-orange-500/30";
      case "expert":
        return "bg-red-500/20 text-red-400 border-red-500/30";
      default:
        return "bg-gray-500/20 text-gray-400 border-gray-500/30";
    }
  };

  return (
    <div className="min-h-screen bg-linear-to-br from-gray-900 via-blue-950 to-purple-950 text-white">
      {/* Sticky Header */}
      <header className="sticky top-0 z-50 bg-blue-950/80 backdrop-blur-xl border-b border-blue-800/30">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex items-center gap-3">
            {/* Back Button */}
            <button
              onClick={() => router.push("/")}
              className="p-2 hover:bg-white/10 rounded-lg transition-colors"
            >
              <DynamicIcon name="ArrowLeft" className="w-5 h-5" />
            </button>

            {/* Search */}
            <div className="flex-1 relative">
              <DynamicIcon
                name="Search"
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-400/50"
              />
              <input
                type="text"
                placeholder="Search adventures..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-blue-900/50 border border-blue-700/50 rounded-xl text-white placeholder-blue-300/50 focus:outline-none focus:border-purple-500/50 focus:bg-blue-900/70 transition-all"
              />
            </div>

            {/* Filter Button */}
            <div className="relative" ref={filtersRef}>
              <button
                onClick={() => setShowFiltersDropdown(!showFiltersDropdown)}
                className={`p-2.5 rounded-xl border transition-all ${
                  showFiltersDropdown || showNsfw
                    ? "bg-purple-500/20 border-purple-500/50 text-purple-400"
                    : "bg-blue-900/50 border-blue-700/50 hover:bg-blue-800/50"
                }`}
              >
                <DynamicIcon name="SlidersHorizontal" className="w-5 h-5" />
              </button>

              {/* Filters Dropdown */}
              {showFiltersDropdown && (
                <div className="absolute right-0 top-full mt-2 w-64 bg-blue-950 border border-blue-700/50 rounded-xl shadow-2xl p-4 space-y-4">
                  {/* Sort */}
                  <div>
                    <label className="text-xs font-medium text-blue-300/70 uppercase tracking-wider">
                      Sort by
                    </label>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      {SORT_OPTIONS.map((option) => (
                        <button
                          key={option.value}
                          onClick={() =>
                            setSortBy(option.value as typeof sortBy)
                          }
                          className={`px-3 py-1.5 text-sm rounded-lg transition-all ${
                            sortBy === option.value
                              ? "bg-purple-500 text-white"
                              : "bg-blue-900/50 hover:bg-blue-800/50"
                          }`}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* NSFW Toggle */}
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Show NSFW</span>
                    <button
                      onClick={() => setShowNsfw(!showNsfw)}
                      className={`w-10 h-6 rounded-full transition-colors ${
                        showNsfw ? "bg-red-500" : "bg-blue-800/50"
                      }`}
                    >
                      <div
                        className={`w-4 h-4 bg-white rounded-full transition-transform mx-1 ${
                          showNsfw ? "translate-x-4" : ""
                        }`}
                      />
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Nav Buttons */}
            {user && (
              <button
                onClick={() => router.push("/library")}
                className="hidden sm:flex items-center gap-2 px-4 py-2.5 bg-blue-900/50 border border-blue-700/50 hover:bg-blue-800/50 rounded-xl transition-colors"
              >
                <DynamicIcon name="Library" className="w-4 h-4" />
                <span className="text-sm font-medium">Library</span>
              </button>
            )}
            <button
              onClick={() => router.push(user ? "/creator" : "/")}
              className="hidden sm:flex items-center gap-2 px-4 py-2.5 bg-linear-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 rounded-xl transition-colors"
            >
              <DynamicIcon name="Plus" className="w-4 h-4" />
              <span className="text-sm font-medium">Create</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 space-y-8">
        {/* Genre Pills */}
        <DraggableScroll className="pb-2" innerClassName="gap-2 px-1">
          {GENRES.map((genre) => (
            <button
              key={genre}
              onClick={() => setSelectedGenre(genre)}
              className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all ${
                selectedGenre === genre
                  ? "bg-linear-to-r from-purple-600 to-blue-600 text-white shadow-lg shadow-purple-500/25"
                  : "bg-blue-900/50 text-blue-200/70 hover:bg-blue-800/50 hover:text-white"
              }`}
            >
              {genre}
            </button>
          ))}
        </DraggableScroll>

        {/* Featured Section */}
        {loadingFeatured ? (
          <section>
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <DynamicIcon
                name="Sparkles"
                className="w-5 h-5 text-yellow-500"
              />
              Featured
            </h2>
            <FeaturedCarouselSkeleton />
          </section>
        ) : (
          featuredAdventures.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <DynamicIcon
                  name="Sparkles"
                  className="w-5 h-5 text-yellow-500"
                />
                Featured
              </h2>
              <DraggableScroll className="pb-2" innerClassName="gap-4 px-1">
                {featuredAdventures.map((adventure) => (
                  <div
                    key={adventure.id}
                    onClick={() => router.push(`/explorer/${adventure.id}`)}
                    className="group relative w-72 h-44 rounded-2xl overflow-hidden cursor-pointer shrink-0"
                  >
                    {/* Background */}
                    {adventure.bannerUrl ? (
                      <div
                        className="absolute inset-0 bg-cover bg-center transition-transform duration-300 group-hover:scale-105"
                        style={{
                          backgroundImage: `url(${adventure.bannerUrl})`,
                        }}
                      />
                    ) : (
                      <div className="absolute inset-0 bg-linear-to-br from-purple-600 via-pink-600 to-blue-600" />
                    )}

                    {/* Overlay */}
                    <div className="absolute inset-0 bg-linear-to-t from-black/90 via-black/40 to-transparent" />

                    {/* Content */}
                    <div className="absolute inset-0 p-4 flex flex-col justify-end">
                      <div className="flex items-center gap-2 mb-2">
                        <span
                          className={`px-2 py-0.5 text-xs font-medium rounded border ${getDifficultyColor(
                            adventure.difficulty
                          )}`}
                        >
                          {adventure.difficulty}
                        </span>
                        <span className="flex items-center gap-1 text-xs text-yellow-400">
                          <DynamicIcon
                            name="Star"
                            className="w-3 h-3 fill-current"
                          />
                          {adventure.rating?.toFixed(1)}
                        </span>
                      </div>
                      <h3 className="font-bold text-lg leading-tight line-clamp-2">
                        {adventure.title}
                      </h3>
                      <p className="text-xs text-blue-100/70 mt-1 line-clamp-1">
                        {adventure.shortDescription}
                      </p>
                    </div>

                    {/* Hover Effect */}
                    <div className="absolute inset-0 border-2 border-white/0 group-hover:border-white/20 rounded-2xl transition-colors" />
                  </div>
                ))}
              </DraggableScroll>
            </section>
          )
        )}

        {/* All Adventures */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">
              {selectedGenre === "All" ? "All Adventures" : selectedGenre}
              {!loading && (
                <span className="text-blue-300/50 font-normal ml-2">
                  ({adventures.length})
                </span>
              )}
            </h2>
          </div>

          {loading ? (
            <AdventureGridSkeleton count={6} />
          ) : adventures.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-blue-300/50">
              <DynamicIcon
                name="Search"
                className="w-12 h-12 mb-4 opacity-50"
              />
              <p className="text-lg">No adventures found</p>
              <p className="text-sm mt-1">
                Try adjusting your search or filters
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {adventures.map((adventure) => (
                <article
                  key={adventure.id}
                  onClick={() => router.push(`/explorer/${adventure.id}`)}
                  className="group bg-blue-950/50 hover:bg-blue-900/50 border border-blue-800/30 hover:border-blue-700/50 rounded-2xl overflow-hidden cursor-pointer transition-all duration-200 hover:shadow-xl hover:shadow-blue-500/10"
                >
                  {/* Thumbnail */}
                  <div className="relative h-36 overflow-hidden">
                    {adventure.thumbnailUrl || adventure.bannerUrl ? (
                      <div
                        className="absolute inset-0 bg-cover bg-center transition-transform duration-300 group-hover:scale-105"
                        style={{
                          backgroundImage: `url(${
                            adventure.thumbnailUrl || adventure.bannerUrl
                          })`,
                        }}
                      />
                    ) : (
                      <div className="absolute inset-0 bg-linear-to-br from-blue-600/50 via-purple-600/50 to-pink-600/50 flex items-center justify-center">
                        <DynamicIcon
                          name={
                            adventure.tags[0] === "Fantasy"
                              ? "Sword"
                              : adventure.tags[0] === "Sci-Fi"
                              ? "Rocket"
                              : adventure.tags[0] === "Mystery"
                              ? "Search"
                              : adventure.tags[0] === "Horror"
                              ? "Ghost"
                              : "BookOpen"
                          }
                          className="w-10 h-10 text-white/50"
                        />
                      </div>
                    )}

                    {/* Genre Tag */}
                    <div className="absolute top-3 left-3">
                      <span className="px-2 py-1 bg-black/60 backdrop-blur-sm text-xs font-medium rounded-lg">
                        {adventure.tags[0] || "Adventure"}
                      </span>
                    </div>

                    {/* NSFW Badge */}
                    {adventure.nsfw && (
                      <div className="absolute top-3 right-3">
                        <span className="px-2 py-1 bg-red-500/80 text-xs font-bold rounded-lg">
                          18+
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Content */}
                  <div className="p-4">
                    <h3 className="font-semibold text-white group-hover:text-purple-300 transition-colors line-clamp-1">
                      {adventure.title}
                    </h3>
                    <p className="text-sm text-blue-200/60 mt-1 line-clamp-2 min-h-10">
                      {adventure.shortDescription}
                    </p>

                    {/* Meta */}
                    <div className="flex items-center justify-between mt-4 pt-3 border-t border-blue-800/30">
                      <div className="flex items-center gap-3 text-xs text-blue-300/50">
                        <span className="flex items-center gap-1">
                          <DynamicIcon
                            name="Star"
                            className="w-3.5 h-3.5 text-yellow-500 fill-yellow-500"
                          />
                          <span className="text-blue-100">
                            {adventure.rating?.toFixed(1) || "-"}
                          </span>
                        </span>
                        <span className="flex items-center gap-1">
                          <DynamicIcon name="Play" className="w-3.5 h-3.5" />
                          {adventure.playCount?.toLocaleString() || "0"}
                        </span>
                      </div>
                      <span
                        className={`px-2 py-0.5 text-xs font-medium rounded border ${getDifficultyColor(
                          adventure.difficulty
                        )}`}
                      >
                        {adventure.difficulty}
                      </span>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </main>

      {/* Mobile FAB for Create */}
      <button
        onClick={() => router.push(user ? "/creator" : "/")}
        className="sm:hidden fixed bottom-6 right-6 w-14 h-14 bg-linear-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 rounded-full shadow-lg shadow-blue-500/30 flex items-center justify-center transition-all hover:scale-105 z-50"
      >
        <DynamicIcon name="Plus" className="w-6 h-6" />
      </button>
    </div>
  );
}
