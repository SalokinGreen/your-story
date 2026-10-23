"use client";

import React, { useState, useMemo, useRef, useEffect } from "react";
import { DynamicIcon } from "./DynamicIcon";
import {
  ALL_GAME_ICON_IDS,
  searchGameIcons,
  getIconsByCategory,
  getAllCategories,
} from "../misc/gameIcons";

interface IconPickerProps {
  value: string;
  onChange: (iconName: string) => void;
  label?: string;
}

// Category display order and icons
const CATEGORY_CONFIG: Record<string, { icon: string; priority: number }> = {
  Weapons: { icon: "crossed-swords", priority: 1 },
  "Armor & Equipment": { icon: "chest-armor", priority: 2 },
  "Magic & Mystical": { icon: "magic-swirl", priority: 3 },
  Creatures: { icon: "dragon-head", priority: 4 },
  "Body & Health": { icon: "heart", priority: 5 },
  "Nature & Elements": { icon: "flame", priority: 6 },
  "Items & Treasure": { icon: "key", priority: 7 },
  "Buildings & Places": { icon: "castle", priority: 8 },
  "Combat & Skills": { icon: "sword-clash", priority: 9 },
  "Status & Effects": { icon: "aura", priority: 10 },
  "Tools & Crafting": { icon: "anvil", priority: 11 },
  "People & Professions": { icon: "knight-banner", priority: 12 },
  "Symbols & Abstract": { icon: "star-swirl", priority: 13 },
  Miscellaneous: { icon: "cubes", priority: 14 },
};

// Popular/featured icons for quick access
const FEATURED_ICONS = [
  // Weapons
  "sword",
  "crossed-swords",
  "battle-axe",
  "bow-arrow",
  "dagger",
  "mace-head",
  // Magic
  "magic-swirl",
  "crystal-ball",
  "spell-book",
  "wand",
  "fire-spell-cast",
  // Combat
  "shield",
  "armor-vest",
  "helmet",
  "crossed-sabres",
  // Status
  "heart",
  "skull",
  "brain",
  "eye",
  "poison-bottle",
  // Nature
  "flame",
  "snowflake-1",
  "lightning",
  "leaf",
  "mountain",
  // Creatures
  "dragon-head",
  "wolf-head",
  "spider-face",
  "ghost",
  "skeleton",
  // Items
  "key",
  "chest",
  "coin",
  "crown",
  "gem",
  // Misc
  "book",
  "scroll-unfurled",
  "compass",
  "hourglass",
  "lantern",
];

// Icons per page for pagination
const ICONS_PER_PAGE = 60;

export const IconPicker: React.FC<IconPickerProps> = ({
  value,
  onChange,
  label,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("Featured");
  const [page, setPage] = useState(0);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Reset page when category or search changes
  useEffect(() => {
    setPage(0);
    if (gridRef.current) {
      gridRef.current.scrollTop = 0;
    }
  }, [selectedCategory, search]);

  // Get sorted categories
  const sortedCategories = useMemo(() => {
    const cats = getAllCategories();
    return cats.sort((a, b) => {
      const aPriority = CATEGORY_CONFIG[a]?.priority ?? 99;
      const bPriority = CATEGORY_CONFIG[b]?.priority ?? 99;
      return aPriority - bPriority;
    });
  }, []);

  // Filter icons based on search and category (all matching icons)
  const allFilteredIcons = useMemo(() => {
    if (search) {
      // Search across all icons
      return searchGameIcons(search, 500);
    }

    if (selectedCategory === "Featured") {
      // Show featured icons that exist
      return FEATURED_ICONS.filter((id) => ALL_GAME_ICON_IDS.includes(id));
    }

    if (selectedCategory === "All") {
      // Show all icons
      return ALL_GAME_ICON_IDS;
    }

    // Show all icons from selected category
    return getIconsByCategory(selectedCategory);
  }, [search, selectedCategory]);

  // Paginate the filtered icons
  const totalPages = Math.ceil(allFilteredIcons.length / ICONS_PER_PAGE);
  const paginatedIcons = useMemo(() => {
    const start = page * ICONS_PER_PAGE;
    return allFilteredIcons.slice(start, start + ICONS_PER_PAGE);
  }, [allFilteredIcons, page]);

  // Convert icon ID to display name
  const toDisplayName = (id: string) => {
    return id
      .split("-")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  };

  return (
    <div className="relative" ref={wrapperRef}>
      {label && (
        <label className="block text-sm font-medium text-ys-text/80 mb-1">
          {label}
        </label>
      )}

      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 w-full px-3 py-2 bg-ys-surface border border-ys-border rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-ys-accent focus:border-ys-accent"
      >
        <div className="w-6 h-6 flex items-center justify-center bg-ys-surface rounded-lg">
          <DynamicIcon
            name={value}
            className="w-5 h-5 text-ys-text"
          />
        </div>
        <span className="flex-1 text-left text-ys-text truncate">
          {value ? toDisplayName(value) : "Select Icon"}
        </span>
        <DynamicIcon name="ChevronDown" className="w-4 h-4 text-ys-muted" />
      </button>

      {isOpen && (
        <div className="absolute z-30 mt-1 w-full min-w-[360px] bg-ys-surface/95 backdrop-blur-2xl rounded-xl shadow-2xl border border-ys-border max-h-[480px] flex flex-col">
          {/* Search */}
          <div className="p-2 border-b border-ys-border space-y-2">
            <input
              type="text"
              placeholder="Search 4000+ icons..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                if (e.target.value) {
                  setSelectedCategory("All");
                }
              }}
              className="w-full px-3 py-2 bg-ys-surface border border-ys-border rounded-lg text-sm text-ys-text placeholder-ys-muted focus:outline-none focus:ring-2 focus:ring-ys-accent"
              autoFocus
            />

            {/* Category tabs */}
            <div
              className="flex gap-1 overflow-x-auto pb-2"
              style={{ scrollbarWidth: "thin" }}
            >
              <button
                onClick={() => {
                  setSelectedCategory("Featured");
                  setSearch("");
                }}
                className={`px-2 py-1 text-xs rounded-full whitespace-nowrap flex items-center gap-1 ${
                  selectedCategory === "Featured"
                    ? "bg-ys-accent/15 text-ys-accent"
                    : "bg-ys-surface text-ys-muted hover:bg-ys-surface-2"
                }`}
              >
                <span>⭐</span> Featured
              </button>
              <button
                onClick={() => {
                  setSelectedCategory("All");
                  setSearch("");
                }}
                className={`px-2 py-1 text-xs rounded-full whitespace-nowrap ${
                  selectedCategory === "All"
                    ? "bg-ys-accent/15 text-ys-accent"
                    : "bg-ys-surface text-ys-muted hover:bg-ys-surface-2"
                }`}
              >
                All
              </button>
              {sortedCategories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => {
                    setSelectedCategory(cat);
                    setSearch("");
                  }}
                  className={`px-2 py-1 text-xs rounded-full whitespace-nowrap flex items-center gap-1 ${
                    selectedCategory === cat
                      ? "bg-ys-accent/15 text-ys-accent"
                      : "bg-ys-surface text-ys-muted hover:bg-ys-surface-2"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Icon grid */}
          <div
            ref={gridRef}
            className="flex-1 overflow-y-auto p-2 grid grid-cols-6 gap-1 content-start min-h-[200px]"
          >
            {paginatedIcons.map((iconId) => (
              <button
                key={iconId}
                onClick={() => {
                  onChange(iconId);
                  setIsOpen(false);
                }}
                className={`flex flex-col items-center justify-center p-2 rounded hover:bg-ys-accent/10 transition-colors ${
                  value === iconId
                    ? "bg-ys-accent/15 ring-1 ring-ys-accent/40"
                    : ""
                }`}
                title={toDisplayName(iconId)}
              >
                <DynamicIcon
                  name={iconId}
                  className="w-6 h-6 text-ys-text/80"
                />
              </button>
            ))}
            {paginatedIcons.length === 0 && (
              <div className="col-span-6 text-center py-8 text-ys-muted text-sm">
                No icons found
              </div>
            )}
          </div>

          {/* Footer with pagination and attribution */}
          <div className="p-2 border-t border-ys-border flex items-center justify-between gap-2">
            <span className="text-xs text-ys-muted">
              {allFilteredIcons.length} icons
              {search && ` for "${search}"`}
            </span>

            {totalPages > 1 && (
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage(Math.max(0, page - 1))}
                  disabled={page === 0}
                  className="p-1 rounded-lg hover:bg-ys-surface-2 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <DynamicIcon name="ChevronLeft" className="w-4 h-4" />
                </button>
                <span className="text-xs text-ys-muted min-w-[60px] text-center">
                  {page + 1} / {totalPages}
                </span>
                <button
                  onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
                  disabled={page >= totalPages - 1}
                  className="p-1 rounded-lg hover:bg-ys-surface-2 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <DynamicIcon name="ChevronRight" className="w-4 h-4" />
                </button>
              </div>
            )}

            <a
              href="https://game-icons.net"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-ys-muted hover:text-ys-accent transition-colors"
            >
              game-icons.net
            </a>
          </div>
        </div>
      )}
    </div>
  );
};
