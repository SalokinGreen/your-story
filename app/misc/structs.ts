// Collection of the various structs used throughout the application

export interface User {
  id: string;
  name: string;
  email: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Stat {
  name: string;
  value: number;
  description: string;
  symbol: string;
  custom_symbol_url?: string;
}

export interface Resource {
  name: string;
  value: number;
  maxValue: number;
  description: string;
  symbol: string;
  custom_symbol_url?: string;
}

export interface InventoryItem {
  name: string;
  quantity: number;
  description: string;
  type: "normal" | "consumable" | "story" | "misc";
  stat?: string;
  resource?: string;
  symbol: string;
  custom_symbol_url?: string;
}

export interface Achievement {
  title: string;
  description: string;
  ai_hint?: string; // Optional precise hint for AI on when to trigger this achievement
  dateAchieved: Date | null;
  points: number;
  symbol: string;
  custom_symbol_url?: string;
  hidden?: boolean; // Hidden from player but visible to AI
  rewardDescription?: string;
}
export interface StoryLore {
  title: string;
  content: string;
  relatedCharacters: string[];
  relatedLocations: string[];
  secrtet: boolean;
  keys: string[];
  on_triggers?: string[];
  off_triggers?: string[];
  thumbnailUrl?: string;
  on?: boolean;
  beats_trigger?: number[];
  beats_untrigger?: number[];
}
export interface Chapter {
  title: string;
  summary: string;
  scene: Scene;
  notes: string[];
}
export interface ScenePart {
  content: string;
  imageUrl: string;
  user: boolean;
  role: "system" | "user" | "assistant";
  choices?: Choice[];
  memoryEntries?: string[];
  commands?: string[];
  endChapter?: boolean;
  endStory?: boolean;
  gameOver?: boolean;
}
export interface Choice {
  text: string;
  item_used?: string;
  item_loss?: boolean;
  skill_used?: string;
  skill_dc?: number;
  resource_used?: string;
  risked_resource?: string;
}
export interface Scene {
  parts: ScenePart[];
}
export interface PlotBeat {
  title: string;
  content: string;
  fulfilled?: boolean;
  points?: number; // Custom points reward for completing this beat (defaults to BEAT_REWARD if not set)
}
export interface Quest {
  id: string; // Unique identifier for the quest
  title: string;
  shortDescription: string; // Brief summary shown in quest list
  description: string; // Full quest description with details
  active: boolean; // Whether the quest is currently active/visible to player
  fulfilled: boolean; // Whether the quest has been completed
  points: number; // Points awarded upon completion
  createdAt?: Date; // When the quest was created (for ordering)
}
export interface Choices {
  choices: Choice[];
}
export interface Preset {
  id: string;
  name: string;
  description: string;
  icon: string;
  playerSummary: string;
  stats: Stat[];
  resources: Resource[];
  inventory: InventoryItem[];
  authorNotes: string;
}

export interface StoryData {
  story_name: string;
  premise: string;
  player_name: string;
  player_summary: string;
  starting_content: string;
  plot_beats: PlotBeat[];
  memory: string[];
  max_chapters: number;
  currentChapter: number;
  chapters: Chapter[];
  scene: Scene;
  stats: Stat[];
  resources: Resource[];
  inventory: InventoryItem[];
  achievements: Achievement[];
  lore: StoryLore[];
  momentum: number;
  maxMomentum: number;
  points: number;
  earnedPointsFromBeats: number[];
  earnedPointsFromChapters: number[];
  quests: Quest[]; // Quest system
  earnedPointsFromQuests: string[]; // Array of quest IDs that have awarded points
  author_notes?: string;
  player_notes?: string;
  selected_preset?: string; // ID of the preset used
  presets?: Preset[]; // Adventure-specific character presets
  upgradeSettings?: UpgradeSettings; // Customizable upgrade system
}

// Upgrade system configuration
export interface UpgradeSettings {
  enabled: boolean; // Master toggle for upgrade system
  allowStatUpgrade: boolean;
  allowResourceUpgrade: boolean;
  allowAddItem: boolean;
  statUpgradeCost: number; // Cost per stat point increase
  statUpgradeAmount: number; // Amount to increase stat by
  resourceUpgradeCost: number; // Cost per resource max increase
  resourceUpgradeAmount: number; // Amount to increase resource max by
  addItemCost: number; // Cost to add a new item

  // Shop system
  statShopEnabled: boolean; // Allow purchasing new stats from shop
  resourceShopEnabled: boolean; // Allow purchasing new resources from shop
  itemShopEnabled: boolean; // Allow purchasing items from shop
  statShop: ShopStat[]; // Stats available for purchase
  resourceShop: ShopResource[]; // Resources available for purchase
  itemShop: ShopItem[]; // Items available for purchase
}

// Shop items interfaces
export interface ShopStat {
  name: string;
  description: string;
  symbol: string;
  custom_symbol_url?: string;
  startingValue: number;
  cost: number; // Points cost to unlock
}

export interface ShopResource {
  name: string;
  description: string;
  symbol: string;
  custom_symbol_url?: string;
  startingValue: number;
  startingMaxValue: number;
  cost: number; // Points cost to unlock
}

export interface ShopItem {
  name: string;
  description: string;
  symbol: string;
  type: "normal" | "consumable" | "story" | "misc";
  quantity: number;
  cost: number; // Points cost to purchase
}

// Default upgrade settings
export const DEFAULT_UPGRADE_SETTINGS: UpgradeSettings = {
  enabled: true,
  allowStatUpgrade: true,
  allowResourceUpgrade: true,
  allowAddItem: true,
  statUpgradeCost: 10,
  statUpgradeAmount: 1,
  resourceUpgradeCost: 15,
  resourceUpgradeAmount: 10,
  addItemCost: 20,

  statShopEnabled: false,
  resourceShopEnabled: false,
  itemShopEnabled: false,
  statShop: [],
  resourceShop: [],
  itemShop: [],
};

// Point system costs (legacy - kept for backward compatibility)
export const UPGRADE_COSTS = {
  STAT_INCREASE: 10, // 10 points to increase a stat by 1
  RESOURCE_MAX_INCREASE: 15, // 15 points to increase max resource by 10
  ADD_ITEM: 20, // 20 points to add a new item
  CHAPTER_REWARD: 50, // Points earned for completing a chapter
  BEAT_REWARD: 25, // Points earned for completing a story beat
} as const;

export interface Adventure {
  id: string;
  title: string;
  description: string;
  shortDescription: string;
  author: string;
  authorId?: string;
  thumbnailUrl?: string;
  bannerUrl?: string;
  tags: string[];
  difficulty: "Easy" | "Medium" | "Hard" | "Expert";
  estimatedDuration: string; // e.g., "2-3 hours"
  popularity: number; // For sorting/ranking
  rating?: number; // 0-5
  playCount: number;
  createdAt: Date;
  updatedAt: Date;
  isPublished: boolean;
  isFeatured: boolean;
  storyTemplate: Partial<StoryData>; // The actual story data
  selectedPreset?: string; // ID of the preset used
  presets?: Preset[]; // Adventure-specific character presets
}

export interface AdventureFilter {
  searchQuery?: string;
  tags?: string[];
  difficulty?: ("Easy" | "Medium" | "Hard" | "Expert")[];
  sortBy?: "popularity" | "newest" | "rating" | "title";
}

export interface Comment {
  id: string;
  adventureId: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  content: string;
  rating?: number; // 1-5 stars, optional
  createdAt: Date;
  updatedAt?: Date;
  likes: number;
  likedBy?: string[]; // User IDs who liked this comment
}

export interface Story {
  id: string;
  adventureId?: string; // Optional - can be null if adventure was deleted
  userId: string;
  storyName: string;
  storyData: StoryData; // Full story state with progress
  isCompleted: boolean;
  isPublic: boolean; // Allow sharing stories
  createdAt: Date;
  updatedAt: Date;
}
