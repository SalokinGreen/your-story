"use client";

import { StoryData, StoryLore } from "../misc/structs";
import ReactMarkdown from "react-markdown";
import { useState } from "react";
import { DynamicIcon } from "../components/DynamicIcon";
import LoreImageGenerator from "../components/LoreImageGenerator";

interface LorePageProps extends StoryData {
  onUpdateLore?: (updatedLore: StoryLore[]) => void;
}

export default function LorePage(props: LorePageProps) {
  const { onUpdateLore, ...storyData } = props;
  const [selectedLore, setSelectedLore] = useState<StoryLore | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [showImageGen, setShowImageGen] = useState(false);

  // Filter lore based on search term AND visibility (only show entries that are ON)
  const filteredLore = storyData.lore.filter((loreItem) => {
    // Hide lore entries that are turned OFF
    if (loreItem.on === false) return false;

    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      loreItem.title.toLowerCase().includes(term) ||
      (loreItem.content || "").toLowerCase().includes(term) ||
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
    <div className="w-full space-y-4">
      {/* Header Section */}
      <div className="bg-blue-950/50 rounded-xl border border-blue-800/30 p-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <DynamicIcon name="Book" className="w-5 h-5 text-purple-400" />
              Story Notes
            </h2>
            <p className="text-xs text-blue-200/40 mt-0.5">
              Discover the world, characters, and secrets
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="px-2 py-0.5 bg-purple-500/20 text-purple-300 rounded font-medium">
              {visibleLore.length} entries
            </span>
            {secretLore.length > 0 && (
              <span className="px-2 py-0.5 bg-amber-500/20 text-amber-300 rounded font-medium flex items-center gap-1">
                {secretLore.length}{" "}
                <DynamicIcon name="Lock" className="w-3 h-3" /> secrets
              </span>
            )}
          </div>
        </div>

        {/* Search Bar */}
        <div className="relative">
          <input
            type="text"
            placeholder="Search notes..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full px-3 py-2 pl-9 bg-blue-900/50 border border-blue-800/30 rounded-lg text-white text-sm placeholder-blue-200/40 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <svg
            className="absolute left-3 top-2.5 h-4 w-4 text-blue-200/40"
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

      {/* Main Content - Two Column Layout (wider detail on xl) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-5 gap-4">
        {/* Lore List */}
        <div className="bg-blue-950/50 rounded-xl border border-blue-800/30 p-4 xl:col-span-2">
          <h3 className="text-base font-semibold text-white mb-3">
            Discovered Notes
          </h3>

          {visibleLore.length === 0 && !searchTerm && (
            <div className="text-center py-8">
              <p className="text-sm text-blue-200/40">
                No notes discovered yet. Continue your adventure!
              </p>
            </div>
          )}

          {visibleLore.length === 0 && searchTerm && (
            <div className="text-center py-8">
              <p className="text-sm text-blue-200/40">
                No notes match your search.
              </p>
            </div>
          )}

          <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
            {visibleLore.map((loreItem, index) => (
              <button
                key={index}
                onClick={() => setSelectedLore(loreItem)}
                className={`w-full text-left p-3 rounded-lg border transition-all flex items-start gap-2.5 ${
                  selectedLore === loreItem
                    ? "border-purple-500/50 bg-purple-500/10"
                    : "border-blue-800/30 hover:border-purple-500/30"
                }`}
              >
                {loreItem.thumbnailUrl && (
                  <img
                    src={loreItem.thumbnailUrl}
                    alt={loreItem.title}
                    className="w-12 h-12 rounded object-cover border border-blue-800/30"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <h4 className="font-medium text-sm text-white mb-0.5 truncate">
                    {loreItem.title}
                  </h4>
                  <p className="text-xs text-blue-200/40 line-clamp-2">
                    {(loreItem.content || "").substring(0, 80)}...
                  </p>
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {loreItem.relatedCharacters?.length > 0 && (
                      <span className="text-xs px-1.5 py-0.5 bg-blue-500/20 text-blue-300 rounded flex items-center gap-0.5">
                        <DynamicIcon name="User" className="w-3 h-3" />{" "}
                        {loreItem.relatedCharacters.length}
                      </span>
                    )}
                    {loreItem.relatedLocations?.length > 0 && (
                      <span className="text-xs px-1.5 py-0.5 bg-green-500/20 text-green-300 rounded flex items-center gap-0.5">
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
              <div className="pt-3 mt-3 border-t border-blue-800/30">
                <h4 className="text-sm font-medium text-amber-400 mb-2 flex items-center gap-2">
                  <DynamicIcon name="Lock" className="w-3.5 h-3.5" /> Hidden
                  Secrets
                </h4>
                {secretLore.map((loreItem, index) => (
                  <button
                    key={`secret-${index}`}
                    onClick={() => setSelectedLore(loreItem)}
                    className={`w-full text-left p-3 rounded-lg border transition-all mb-2 flex items-start gap-2.5 ${
                      selectedLore === loreItem
                        ? "border-amber-500/50 bg-amber-500/10"
                        : "border-amber-500/30 hover:border-amber-500/50"
                    }`}
                  >
                    {loreItem.thumbnailUrl && (
                      <img
                        src={loreItem.thumbnailUrl}
                        alt={loreItem.title}
                        className="w-12 h-12 rounded object-cover border border-amber-500/30"
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <h4 className="font-medium text-sm text-white mb-0.5 flex items-center gap-1.5 truncate">
                        <DynamicIcon
                          name="Lock"
                          className="w-3.5 h-3.5 text-amber-400"
                        />{" "}
                        {loreItem.title}
                      </h4>
                      <p className="text-xs text-blue-200/40 line-clamp-2">
                        {(loreItem.content || "").substring(0, 80)}...
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Lore Detail */}
        <div className="bg-blue-950/50 rounded-xl border border-blue-800/30 p-4 xl:col-span-3">
          <h3 className="text-base font-semibold text-white mb-3">
            Lore Details
          </h3>

          {!selectedLore ? (
            <div className="flex items-center justify-center h-[400px] text-center">
              <div>
                <svg
                  className="mx-auto h-12 w-12 text-blue-200/20 mb-3"
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
                <p className="text-sm text-blue-200/40">
                  Select a lore entry to view details
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
              <div>
                <h2 className="text-lg font-semibold text-white mb-1 flex items-center gap-2">
                  {selectedLore.secrtet && (
                    <DynamicIcon
                      name="Lock"
                      className="w-4 h-4 text-amber-400"
                    />
                  )}
                  {selectedLore.title}
                </h2>
                {selectedLore.secrtet && (
                  <p className="text-xs text-amber-400 mb-3 flex items-center gap-1">
                    <DynamicIcon name="Sparkles" className="w-3 h-3" /> Secret
                    knowledge unlocked!
                  </p>
                )}
              </div>

              {selectedLore.thumbnailUrl && (
                <div className="relative w-full overflow-hidden rounded-lg border border-blue-800/30">
                  <img
                    src={selectedLore.thumbnailUrl}
                    alt={selectedLore.title}
                    className="w-full h-48 sm:h-56 xl:h-72 object-cover"
                  />
                </div>
              )}

              {/* AI Image Generator - collapsible, shown when onUpdateLore is available */}
              {onUpdateLore && (
                <div className="border-t border-blue-800/30 pt-3">
                  <button
                    onClick={() => setShowImageGen(!showImageGen)}
                    className="flex items-center gap-2 text-sm text-purple-300 hover:text-purple-200 transition-colors"
                  >
                    <DynamicIcon
                      name={showImageGen ? "ChevronDown" : "ChevronRight"}
                      className="w-4 h-4"
                    />
                    <DynamicIcon name="Sparkles" className="w-4 h-4" />
                    {selectedLore.thumbnailUrl
                      ? "Regenerate Image"
                      : "Generate Image with AI"}
                  </button>
                  {showImageGen && (
                    <div className="mt-3">
                      <LoreImageGenerator
                        loreTitle={selectedLore.title}
                        loreContent={selectedLore.content}
                        currentThumbnailUrl={selectedLore.thumbnailUrl}
                        onImageGenerated={(url) => {
                          // Update the lore array with the new thumbnail
                          const updatedLore = storyData.lore.map((l) =>
                            l.title === selectedLore.title
                              ? { ...l, thumbnailUrl: url }
                              : l
                          );
                          onUpdateLore(updatedLore);
                          // Also update selectedLore to reflect the change immediately
                          setSelectedLore({
                            ...selectedLore,
                            thumbnailUrl: url,
                          });
                        }}
                      />
                    </div>
                  )}
                </div>
              )}

              <div className="prose prose-sm prose-invert max-w-none text-blue-50/90">
                <ReactMarkdown>{selectedLore.content}</ReactMarkdown>
              </div>

              {selectedLore.relatedCharacters?.length > 0 && (
                <div className="pt-3 border-t border-blue-800/30">
                  <h4 className="text-xs font-medium text-blue-200/60 mb-2">
                    👤 Related Characters
                  </h4>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedLore.relatedCharacters.map((char, idx) => (
                      <span
                        key={idx}
                        className="px-2 py-0.5 bg-blue-500/20 text-blue-300 rounded text-xs"
                      >
                        {char}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {selectedLore.relatedLocations?.length > 0 && (
                <div className="pt-3 border-t border-blue-800/30">
                  <h4 className="text-xs font-medium text-blue-200/60 mb-2">
                    📍 Related Locations
                  </h4>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedLore.relatedLocations.map((loc, idx) => (
                      <span
                        key={idx}
                        className="px-2 py-0.5 bg-green-500/20 text-green-300 rounded text-xs"
                      >
                        {loc}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {selectedLore.keys?.length > 0 && (
                <div className="pt-3 border-t border-blue-800/30">
                  <h4 className="text-xs font-medium text-blue-200/60 mb-2">
                    🔑 Keywords
                  </h4>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedLore.keys.map((key, idx) => (
                      <span
                        key={idx}
                        className="px-2 py-0.5 bg-blue-900/50 text-blue-200/60 rounded text-xs"
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
