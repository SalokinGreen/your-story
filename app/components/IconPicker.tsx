"use client";

import React, { useState, useMemo, useRef, useEffect } from "react";
import { icons } from "lucide-react";
import { DynamicIcon } from "./DynamicIcon";

interface IconPickerProps {
  value: string;
  onChange: (iconName: string) => void;
  label?: string;
}

// Manual categorization for better UX
const CATEGORIES: Record<string, string[]> = {
  "RPG & Fantasy": [
    "Sword",
    "Shield",
    "Scroll",
    "Book",
    "FlaskConical",
    "FlaskRound",
    "Gem",
    "Crown",
    "Skull",
    "Ghost",
    "Axe",
    "Hammer",
    "Wand",
    "Map",
    "Compass",
    "Backpack",
    "Tent",
    "Flame",
    "Droplets",
    "Zap",
    "Heart",
    "Star",
    "Moon",
    "Sun",
    "Cloud",
    "Wind",
  ],
  "UI & Controls": [
    "Menu",
    "X",
    "Check",
    "ChevronRight",
    "ChevronLeft",
    "ChevronDown",
    "ChevronUp",
    "Settings",
    "User",
    "LogOut",
    "Home",
    "Search",
    "Plus",
    "Minus",
    "Trash",
    "Edit",
    "Save",
    "Download",
    "Upload",
    "Share",
    "MoreHorizontal",
    "MoreVertical",
  ],
  Nature: [
    "TreeDeciduous",
    "TreePine",
    "Flower",
    "Leaf",
    "Mountain",
    "Waves",
    "CloudRain",
    "Snowflake",
    "Sun",
    "Moon",
    "Sunset",
    "Sunrise",
  ],
  "Items & Loot": [
    "Box",
    "Package",
    "Gift",
    "Key",
    "Lock",
    "Unlock",
    "Coin",
    "Banknote",
    "Wallet",
    "CreditCard",
    "Diamond",
    "Trophy",
    "Medal",
  ],
  "Stats & Skills": [
    "Activity",
    "Heart",
    "Brain",
    "BicepsFlexed",
    "Eye",
    "Ear",
    "Footprints",
    "Hand",
    "Zap",
    "Thermometer",
    "Scale",
    "Timer",
    "Hourglass",
  ],
};

export const IconPicker: React.FC<IconPickerProps> = ({
  value,
  onChange,
  label,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("All");
  const wrapperRef = useRef<HTMLDivElement>(null);

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

  const iconList = useMemo(() => Object.keys(icons), []);

  const filteredIcons = useMemo(() => {
    let filtered = iconList;

    if (selectedCategory !== "All") {
      if (CATEGORIES[selectedCategory]) {
        // For specific categories, only show the curated list
        // But we also want to allow searching within that category
        filtered = CATEGORIES[selectedCategory].filter((name) =>
          iconList.includes(name)
        );
      }
    }

    if (search) {
      const lowerSearch = search.toLowerCase();
      filtered = filtered.filter((name) =>
        name.toLowerCase().includes(lowerSearch)
      );
    }

    return filtered.slice(0, 100); // Limit to 100 for performance
  }, [iconList, search, selectedCategory]);

  return (
    <div className="relative" ref={wrapperRef}>
      {label && (
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          {label}
        </label>
      )}

      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 w-full px-3 py-2 bg-white dark:bg-blue-950 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
      >
        <div className="w-6 h-6 flex items-center justify-center bg-gray-100 dark:bg-gray-700 rounded">
          <DynamicIcon
            name={value}
            className="w-4 h-4 text-gray-900 dark:text-white"
          />
        </div>
        <span className="flex-1 text-left text-gray-900 dark:text-white truncate">
          {value || "Select Icon"}
        </span>
        <DynamicIcon name="ChevronDown" className="w-4 h-4 text-gray-500" />
      </button>

      {isOpen && (
        <div className="absolute z-50 mt-1 w-full min-w-[300px] bg-white dark:bg-blue-950 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 max-h-[400px] flex flex-col">
          <div className="p-2 border-b border-gray-200 dark:border-gray-700 space-y-2">
            <input
              type="text"
              placeholder="Search icons..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
              autoFocus
            />

            <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-hide">
              <button
                onClick={() => setSelectedCategory("All")}
                className={`px-2 py-1 text-xs rounded-full whitespace-nowrap ${
                  selectedCategory === "All"
                    ? "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300"
                    : "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600"
                }`}
              >
                All
              </button>
              {Object.keys(CATEGORIES).map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-2 py-1 text-xs rounded-full whitespace-nowrap ${
                    selectedCategory === cat
                      ? "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300"
                      : "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-2 grid grid-cols-5 gap-2">
            {filteredIcons.map((iconName) => (
              <button
                key={iconName}
                onClick={() => {
                  onChange(iconName);
                  setIsOpen(false);
                }}
                className={`flex flex-col items-center justify-center p-2 rounded hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-colors ${
                  value === iconName
                    ? "bg-purple-100 dark:bg-purple-900/40 ring-1 ring-purple-500"
                    : ""
                }`}
                title={iconName}
              >
                <DynamicIcon
                  name={iconName}
                  className="w-6 h-6 text-gray-700 dark:text-gray-200"
                />
              </button>
            ))}
            {filteredIcons.length === 0 && (
              <div className="col-span-5 text-center py-4 text-gray-500 text-sm">
                No icons found
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
