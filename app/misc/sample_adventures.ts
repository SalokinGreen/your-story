import { Adventure } from "./structs";
import { goblin_layer, kids_on_machines } from "./starter_stories";

export const sampleAdventures: Adventure[] = [
  {
    id: "goblin-layer",
    title: "The Goblin Layer",
    description:
      "Venture into the depths of the mountain to confront the goblin menace. Navigate treacherous caverns, forge alliances with unlikely allies, and uncover ancient secrets buried beneath the stone. Will you emerge victorious, or become another tale whispered in the darkness?",
    shortDescription: "Battle goblins in treacherous mountain caverns",
    author: "System",
    authorId: "system",
    thumbnailUrl: undefined,
    bannerUrl: undefined,
    tags: ["Fantasy", "Combat", "Exploration", "Dark"],
    difficulty: "medium",
    estimatedDuration: "3-4 hours",
    popularity: 8500,
    rating: 4.7,
    playCount: 12340,
    createdAt: new Date("2025-01-15"),
    updatedAt: new Date("2025-11-10"),
    isPublished: true,
    isFeatured: true,
    nsfw: false,
    storyTemplate: goblin_layer,
  },
  {
    id: "kids-on-machines",
    title: "Kids on Machines",
    description:
      "In a world where giant mechanical beasts roam the wastelands, a group of young scavengers must survive against all odds. Pilot makeshift mechs, scavenge for resources, and uncover the truth behind the machine apocalypse. A story of friendship, courage, and the will to survive.",
    shortDescription: "Pilot mechs and survive the machine apocalypse",
    author: "System",
    authorId: "system",
    thumbnailUrl: undefined,
    bannerUrl: undefined,
    tags: ["Sci-Fi", "Post-Apocalyptic", "Mechs", "Survival"],
    difficulty: "hard",
    estimatedDuration: "4-5 hours",
    popularity: 9200,
    rating: 4.8,
    playCount: 15670,
    createdAt: new Date("2025-02-20"),
    updatedAt: new Date("2025-11-12"),
    isPublished: true,
    isFeatured: true,
    nsfw: false,
    storyTemplate: kids_on_machines,
  },
  {
    id: "crystal-prophecy",
    title: "The Crystal Prophecy",
    description:
      "A mysterious prophecy speaks of seven ancient crystals scattered across the realm. As a young mage's apprentice, you must embark on a quest to find these crystals before they fall into the wrong hands. Master elemental magic, solve ancient puzzles, and prevent a dark ritual that could shatter reality itself.",
    shortDescription: "Collect ancient crystals and master elemental magic",
    author: "System",
    authorId: "system",
    tags: ["Fantasy", "Magic", "Puzzle", "Adventure"],
    difficulty: "easy",
    estimatedDuration: "2-3 hours",
    popularity: 6800,
    rating: 4.5,
    playCount: 8920,
    createdAt: new Date("2025-03-10"),
    updatedAt: new Date("2025-11-08"),
    isPublished: true,
    isFeatured: false,
    nsfw: false,
    storyTemplate: {
      story_name: "The Crystal Prophecy",
      premise:
        "A young mage's apprentice must find seven ancient crystals to prevent a dark ritual.",
      player_name: "Elara",
      player_summary:
        "A talented apprentice with an affinity for elemental magic.",
      intro:
        "The morning sun streams through the stained glass windows of the Arcane Tower. Your master, the elderly Archmage Theron, calls you to his study with unusual urgency...",
      plot_beats: [],
      memory: [],
      max_chapters: 8,
      currentChapter: 0,
      chapters: [],
      scene: { parts: [] },
      stats: [],
      resources: [],
      inventory: [],
      achievements: [],
      lore: [],
    },
  },
  {
    id: "neon-shadows",
    title: "Neon Shadows",
    description:
      "In the rain-soaked streets of Neo Tokyo 2089, you're a freelance hacker caught between corporate warfare and underground resistance. Navigate the dangerous world of cybernetic enhancement, digital espionage, and street-level survival. Every choice you make could expose you to powerful enemies or earn you valuable allies.",
    shortDescription: "Hack the system in a cyberpunk dystopia",
    author: "System",
    authorId: "system",
    tags: ["Cyberpunk", "Stealth", "Hacking", "Noir"],
    difficulty: "medium",
    estimatedDuration: "3-4 hours",
    popularity: 7600,
    rating: 4.6,
    playCount: 10450,
    createdAt: new Date("2025-04-05"),
    updatedAt: new Date("2025-11-11"),
    isPublished: true,
    isFeatured: true,
    nsfw: false,
    storyTemplate: {
      story_name: "Neon Shadows",
      premise:
        "A hacker navigates corporate warfare and resistance in dystopian Neo Tokyo.",
      player_name: "Ghost",
      player_summary:
        "A skilled hacker with a mysterious past and cutting-edge cybernetics.",
      intro:
        "Rain hammers against your apartment window as news feeds scroll across your retinal display. A message appears from an unknown sender: 'They know about Omega. Run.'",
      plot_beats: [],
      memory: [],
      max_chapters: 10,
      currentChapter: 0,
      chapters: [],
      scene: { parts: [] },
      stats: [],
      resources: [],
      inventory: [],
      achievements: [],
      lore: [],
    },
  },
  {
    id: "pirates-fortune",
    title: "A Pirate's Fortune",
    description:
      "The golden age of piracy beckons! Captain your own ship, assemble a loyal crew, and hunt for legendary treasure across the Caribbean seas. Battle rival pirates, outsmart the Royal Navy, and navigate treacherous waters. Will you become a legendary pirate captain or meet a watery grave?",
    shortDescription: "Sail the Caribbean seas as a pirate captain",
    author: "System",
    authorId: "system",
    tags: ["Historical", "Pirates", "Naval Combat", "Adventure"],
    difficulty: "medium",
    estimatedDuration: "3-4 hours",
    popularity: 8100,
    rating: 4.6,
    playCount: 11200,
    createdAt: new Date("2025-05-12"),
    updatedAt: new Date("2025-11-09"),
    isPublished: true,
    isFeatured: false,
    nsfw: false,
    storyTemplate: {
      story_name: "A Pirate's Fortune",
      premise:
        "Captain a pirate ship and hunt for legendary treasure in the Caribbean.",
      player_name: "Captain Redbeard",
      player_summary:
        "A cunning pirate with dreams of finding the legendary Dragon's Hoard.",
      intro:
        "The smell of salt air and rum fills your nostrils as you stand on the deck of the Crimson Tide. Your first mate approaches with a tattered map...",
      plot_beats: [],
      memory: [],
      max_chapters: 9,
      currentChapter: 0,
      chapters: [],
      scene: { parts: [] },
      stats: [],
      resources: [],
      inventory: [],
      achievements: [],
      lore: [],
    },
  },
  {
    id: "quantum-detective",
    title: "The Quantum Detective",
    description:
      "Reality is fracturing. As a detective with the ability to perceive parallel timelines, you must solve a murder that exists across multiple realities. Each timeline holds a piece of the truth, but changing one affects all others. Can you piece together the truth before all realities collapse?",
    shortDescription: "Solve a multi-dimensional murder mystery",
    author: "System",
    authorId: "system",
    tags: ["Mystery", "Sci-Fi", "Detective", "Mind-Bending"],
    difficulty: "hard",
    estimatedDuration: "4-5 hours",
    popularity: 6200,
    rating: 4.7,
    playCount: 7890,
    createdAt: new Date("2025-06-18"),
    updatedAt: new Date("2025-11-13"),
    isPublished: true,
    isFeatured: false,
    nsfw: false,
    storyTemplate: {
      story_name: "The Quantum Detective",
      premise:
        "A detective solves a murder across multiple parallel realities.",
      player_name: "Detective Quinn",
      player_summary:
        "A brilliant investigator cursed with the ability to see parallel timelines.",
      intro:
        "The crime scene flickers before your eyes, shifting between different versions of reality. In one timeline, the victim is still alive. In another, they never existed...",
      plot_beats: [],
      memory: [],
      max_chapters: 12,
      currentChapter: 0,
      chapters: [],
      scene: { parts: [] },
      stats: [],
      resources: [],
      inventory: [],
      achievements: [],
      lore: [],
    },
  },
];

// Helper function to get featured adventures
export function getFeaturedAdventures(): Adventure[] {
  return sampleAdventures
    .filter((a) => a.isFeatured)
    .sort((a, b) => b.popularity - a.popularity);
}

// Helper function to filter adventures
export function filterAdventures(
  adventures: Adventure[],
  filters: {
    searchQuery?: string;
    tags?: string[];
    difficulty?: ("easy" | "medium" | "hard" | "expert")[];
    sortBy?: "popularity" | "newest" | "rating" | "title";
  }
): Adventure[] {
  let filtered = [...adventures];

  // Search filter
  if (filters.searchQuery) {
    const query = filters.searchQuery.toLowerCase();
    filtered = filtered.filter(
      (a) =>
        a.title.toLowerCase().includes(query) ||
        a.description.toLowerCase().includes(query) ||
        a.tags.some((tag) => tag.toLowerCase().includes(query))
    );
  }

  // Tags filter
  if (filters.tags && filters.tags.length > 0) {
    filtered = filtered.filter((a) =>
      filters.tags!.some((tag) => a.tags.includes(tag))
    );
  }

  // Difficulty filter
  if (filters.difficulty && filters.difficulty.length > 0) {
    filtered = filtered.filter((a) =>
      filters.difficulty!.includes(a.difficulty)
    );
  }

  // Sort
  const sortBy = filters.sortBy || "popularity";
  filtered.sort((a, b) => {
    switch (sortBy) {
      case "popularity":
        return b.popularity - a.popularity;
      case "newest":
        return b.createdAt.getTime() - a.createdAt.getTime();
      case "rating":
        return (b.rating || 0) - (a.rating || 0);
      case "title":
        return a.title.localeCompare(b.title);
      default:
        return 0;
    }
  });

  return filtered;
}

// Get all unique tags from adventures
export function getAllTags(): string[] {
  const tagSet = new Set<string>();
  sampleAdventures.forEach((a) => a.tags.forEach((tag) => tagSet.add(tag)));
  return Array.from(tagSet).sort();
}
