"use client";

import { StoryData, StoryLore } from "../misc/structs";
import ReactMarkdown from "react-markdown";
import { useState } from "react";
import { DynamicIcon } from "../components/DynamicIcon";

export default function LorePage(storyData: StoryData) {
  const [selectedLore, setSelectedLore] = useState<StoryLore | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  // Filter lore based on search term AND visibility (only show entries that are ON)
  const filteredLore = storyData.lore.filter((loreItem) => {
    // Hide lore entries that are turned OFF
    if (loreItem.on === false) return false;

    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      loreItem.title.toLowerCase().includes(term) ||
      loreItem.content.toLowerCase().includes(term) ||
      (loreItem.relatedCharacters || []).some((char) =>
        char.toLowerCase().includes(term)
      ) ||
      (loreItem.relatedLocations || []).some((loc) =>
        loc.toLowerCase().includes(term)
      )
    );
  });

  // Separate secret and non-secret lore (both must be ON to be visible)
  const visibleLore = filteredLore.filter((lore) => !lore.secrtet);
  const secretLore = filteredLore.filter((lore) => lore.secrtet);

  return (
    <div className="w-full space-y-6">
      {/* Header Section */}
      <div className="bg-white dark:bg-blue-950 rounded-2xl shadow-xl p-6 sm:p-8 border border-gray-200 dark:border-gray-700">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
          <div>
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <DynamicIcon name="Book" className="w-8 h-8 text-purple-600" />{" "}
              Story Lore
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              Discover the world, characters, and secrets of your adventure
            </p>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="px-3 py-1 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded-full font-medium">
              {visibleLore.length} entries
            </span>
            {secretLore.length > 0 && (
              <span className="px-3 py-1 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 rounded-full font-medium flex items-center gap-1">
                {secretLore.length}{" "}
                <DynamicIcon name="Lock" className="w-4 h-4" /> secrets
              </span>
            )}
          </div>
        </div>

        {/* Search Bar */}
        <div className="relative">
          <input
            type="text"
            placeholder="Search lore entries..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full px-4 py-3 pl-10 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
          <svg
            className="absolute left-3 top-3.5 h-5 w-5 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
        </div>
      </div>

      {/* Main Content - Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Lore List */}
        <div className="bg-white dark:bg-blue-950 rounded-2xl shadow-xl p-6 border border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">
            Discovered Lore
          </h3>

          {visibleLore.length === 0 && !searchTerm && (
            <div className="text-center py-12">
              <p className="text-gray-500 dark:text-gray-400">
                No lore discovered yet. Continue your adventure to uncover the
                world's secrets!
              </p>
            </div>
          )}

          {visibleLore.length === 0 && searchTerm && (
            <div className="text-center py-12">
              <p className="text-gray-500 dark:text-gray-400">
                No lore entries match your search.
              </p>
            </div>
          )}

          <div className="space-y-3 max-h-[600px] overflow-y-auto pr-2">
            {visibleLore.map((loreItem, index) => (
              <button
                key={index}
                onClick={() => setSelectedLore(loreItem)}
                className={`w-full text-left p-4 rounded-lg border-2 transition-all flex items-start gap-3 ${
                  selectedLore === loreItem
                    ? "border-purple-500 bg-purple-50 dark:bg-purple-900/20"
                    : "border-gray-200 dark:border-gray-600 hover:border-purple-300 dark:hover:border-purple-600"
                }`}
              >
                {loreItem.thumbnailUrl && (
                  <img
                    src={loreItem.thumbnailUrl}
                    alt={loreItem.title}
                    className="w-14 h-14 rounded-md object-cover border border-gray-200 dark:border-gray-600"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <h4 className="font-semibold text-gray-900 dark:text-white mb-1 truncate">
                    {loreItem.title}
                  </h4>
                  <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2">
                    {loreItem.content.substring(0, 100)}...
                  </p>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {loreItem.relatedCharacters?.length > 0 && (
                      <span className="text-xs px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded flex items-center gap-1">
                        <DynamicIcon name="User" className="w-3 h-3" />{" "}
                        {loreItem.relatedCharacters.length}
                      </span>
                    )}
                    {loreItem.relatedLocations?.length > 0 && (
                      <span className="text-xs px-2 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded flex items-center gap-1">
                        <DynamicIcon name="MapPin" className="w-3 h-3" />{" "}
                        {loreItem.relatedLocations.length}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            ))}

            {/* Secret Lore Section */}
            {secretLore.length > 0 && (
              <div className="pt-4 mt-4 border-t border-gray-300 dark:border-gray-600">
                <h4 className="text-sm font-bold text-amber-700 dark:text-amber-400 mb-3 flex items-center gap-2">
                  <DynamicIcon name="Lock" className="w-4 h-4" /> Hidden Secrets
                </h4>
                {secretLore.map((loreItem, index) => (
                  <button
                    key={`secret-${index}`}
                    onClick={() => setSelectedLore(loreItem)}
                    className={`w-full text-left p-4 rounded-lg border-2 transition-all mb-3 flex items-start gap-3 ${
                      selectedLore === loreItem
                        ? "border-amber-500 bg-amber-50 dark:bg-amber-900/20"
                        : "border-amber-200 dark:border-amber-700 hover:border-amber-400 dark:hover:border-amber-500"
                    }`}
                  >
                    {loreItem.thumbnailUrl && (
                      <img
                        src={loreItem.thumbnailUrl}
                        alt={loreItem.title}
                        className="w-14 h-14 rounded-md object-cover border border-amber-200 dark:border-amber-700"
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <h4 className="font-semibold text-gray-900 dark:text-white mb-1 flex items-center gap-2 truncate">
                        <DynamicIcon
                          name="Lock"
                          className="w-4 h-4 text-amber-600"
                        />{" "}
                        {loreItem.title}
                      </h4>
                      <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2">
                        {loreItem.content.substring(0, 100)}...
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Lore Detail */}
        <div className="bg-white dark:bg-blue-950 rounded-2xl shadow-xl p-6 border border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">
            Lore Details
          </h3>

          {!selectedLore ? (
            <div className="flex items-center justify-center h-[500px] text-center">
              <div>
                <svg
                  className="mx-auto h-16 w-16 text-gray-400 mb-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
                  />
                </svg>
                <p className="text-gray-500 dark:text-gray-400">
                  Select a lore entry to view its details
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2">
              <div>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2 flex items-center gap-2">
                  {selectedLore.secrtet && (
                    <DynamicIcon
                      name="Lock"
                      className="w-6 h-6 text-amber-600"
                    />
                  )}
                  {selectedLore.title}
                </h2>
                {selectedLore.secrtet && (
                  <p className="text-sm text-amber-600 dark:text-amber-400 mb-4 flex items-center gap-2">
                    <DynamicIcon name="Sparkles" className="w-4 h-4" /> Secret
                    knowledge unlocked!
                  </p>
                )}
              </div>

              {selectedLore.thumbnailUrl && (
                <div className="relative w-full overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700">
                  <img
                    src={selectedLore.thumbnailUrl}
                    alt={selectedLore.title}
                    className="w-full h-48 sm:h-64 object-cover"
                  />
                </div>
              )}

              <div className="prose prose-sm sm:prose prose-zinc dark:prose-invert max-w-none">
                <ReactMarkdown>{selectedLore.content}</ReactMarkdown>
              </div>

              {selectedLore.relatedCharacters?.length > 0 && (
                <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
                  <h4 className="text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">
                    👤 Related Characters
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {selectedLore.relatedCharacters.map((char, idx) => (
                      <span
                        key={idx}
                        className="px-3 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full text-sm"
                      >
                        {char}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {selectedLore.relatedLocations?.length > 0 && (
                <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
                  <h4 className="text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">
                    📍 Related Locations
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {selectedLore.relatedLocations.map((loc, idx) => (
                      <span
                        key={idx}
                        className="px-3 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded-full text-sm"
                      >
                        {loc}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {selectedLore.keys?.length > 0 && (
                <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
                  <h4 className="text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">
                    🔑 Keywords
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {selectedLore.keys.map((key, idx) => (
                      <span
                        key={idx}
                        className="px-3 py-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-full text-sm"
                      >
                        {key}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
