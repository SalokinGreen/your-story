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

export interface CommandResponse {
  command: string; // The original command that was executed
  success: boolean | "partial"; // True if succeeded, false if failed, 'partial' if partially successful
  message: string; // Human-readable description of what happened
  timestamp: number; // When the command was executed
  toolCallId?: string; // Optional: links response to specific tool call for conversation coherency
}

export interface StoryLore {
  title: string;
  content: string;
  relatedCharacters: string[];
  relatedLocations: string[];
  secrtet: boolean;
  keys: string[];
  alwaysOn?: boolean; // If true, lore is always visible regardless of triggers
  enabled?: boolean; // If false, lore is never visible/checked. Defaults to true.
  on_triggers?: string[]; // Word triggers to turn lore on
  off_triggers?: string[]; // Word triggers to turn lore off
  trigger_lores?: string[]; // Titles of other lores that turn this one on
  untrigger_lores?: string[]; // Titles of other lores that turn this one off
  var_on_triggers?: string[]; // Boolean variable names that turn this on when true
  var_off_triggers?: string[]; // Boolean variable names that turn this off when true
  thumbnailUrl?: string;
  on?: boolean;
  beats_trigger?: number[];
  beats_untrigger?: number[];
  lastTriggeredIndex?: number; // Track when lore was last triggered for auto-expiry
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
  commands?: string[]; // Legacy: XML commands
  toolCalls?: any[]; // Tool calls made by AI (OpenAI/DeepSeek format)
  toolResponses?: CommandResponse[]; // Execution results of tool calls
  endChapter?: boolean;
  endStory?: boolean;
  gameOver?: boolean;
  raw?: string; // Raw AI output before parsing, used for alternative context building
}
export interface Choice {
  text: string;
  item_used?: string;
  item_loss?: boolean;
  skill_used?: string;
  skill_dc?: number;
  resource_used?: string;
  condition_applies?: string; // Name of condition that applies penalty to this roll (AI chooses most relevant)
  mythic_check?: string; // Format: "question (likelihood)" e.g., "Is the door locked? (Likely)"
  mythic_context_only?: boolean; // When true with skill_used, mythic provides context only and doesn't override skill check result
  mythic_table?: string; // Element category name e.g., "character_descriptors", "locations"
  custom_table?: string; // Name or ID of custom table to roll on
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
export interface Relationship {
  name: string; // Character/faction name
  value: number; // Relationship level (-100 to 100)
  description: string; // Description of the relationship
  symbol: string; // Icon representing the relationship
  custom_symbol_url?: string;
}

// Conditions/Afflictions system
export type ConditionTier = 1 | 2 | 3 | 4 | 5 | 6;

export interface Condition {
  id: string; // Unique identifier
  name: string; // e.g., "Broken Leg", "Poisoned", "Exhausted"
  tier: ConditionTier; // Severity level (1-6, where 6 is permanent/game-over potential)
  description: string; // What this condition represents at current tier
  affects: string[]; // Which stats/skills this penalizes (e.g., ["Agility", "Athletics"])
  affectsAll?: boolean; // If true, affects ALL rolls (e.g., "Dying", "Severe Exhaustion")
  source?: string; // How it was acquired (for narrative context)
  permanent?: boolean; // Tier VI conditions are typically permanent
  createdAt: number; // Timestamp when condition was acquired
}

// Game Over state for permanent character death/loss
export interface GameOver {
  reason: string; // Narrative reason for game over
  condition?: string; // Name of condition that caused it (if applicable)
  timestamp: number; // When the game ended
}

export interface Choices {
  choices: Choice[];
}
export interface Preset {
  id: string;
  name: string;
  description: string;
  icon: string;
  playerName?: string; // Optional default name for the character
  playerSummary: string;
  intro?: string; // Unique intro text for this preset (optional for backward compatibility)
  stats: Stat[];
  resources: Resource[];
  inventory: InventoryItem[];
  relationships: Relationship[];
  conditions?: Condition[]; // Starting conditions/afflictions for this preset
  variables?: Variable[]; // Starting variables for this preset
  authorNotes: string;
}

// Custom random tables
export interface CustomTableEntry {
  text: string; // The result text
  weight: number; // Probability weight (higher = more likely)
}

export interface CustomTable {
  id: string; // Unique identifier
  name: string; // Display name (e.g., "Weather Conditions")
  description: string; // What this table is for
  entries: CustomTableEntry[]; // Array of possible results
}

// Variables system - dynamic named values the AI and player can track
export type VariableType = "number" | "boolean" | "list";

export interface VariableBase {
  id: string; // Unique identifier
  name: string; // Display name (e.g., "Days Until Festival")
  description: string; // What this variable tracks
}

export interface NumberVariable extends VariableBase {
  type: "number";
  value: number;
  minValue?: number; // Optional minimum (e.g., 0)
  maxValue?: number; // Optional maximum (e.g., 100)
}

export interface BooleanVariable extends VariableBase {
  type: "boolean";
  value: boolean;
}

export interface ListVariable extends VariableBase {
  type: "list";
  items: string[]; // Array of items
  maxSize?: number; // Optional maximum list size
}

export type Variable = NumberVariable | BooleanVariable | ListVariable;

export interface StoryData {
  story_name: string;
  premise: string;
  player_name: string;
  player_summary: string;
  intro: string;
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
  relationships: Relationship[]; // Relationship tracking system
  conditions: Condition[]; // Active conditions/afflictions affecting the player
  gameOver?: GameOver; // Game over state if the player has permanently died/lost
  author_notes?: string;
  player_notes?: string;
  selected_preset?: string; // ID of the preset used
  presets?: Preset[]; // Adventure-specific character presets
  upgradeSettings?: UpgradeSettings; // Customizable upgrade system
  newGamePlusCount?: number; // Number of NG+ runs completed
  newGamePlusMode?: boolean; // Whether current run is NG+
  nsfw?: boolean; // Whether the story contains NSFW content
  rpgSystem?:
    | "3d6"
    | "1d20"
    | "1d100"
    | "percentile"
    | "pbta"
    | "fate"
    | "yze"
    | "explosive"
    | "narrative"; // RPG dice system
  stress?: number; // YZE: Current stress level (0-10)
  maxStress?: number; // YZE: Maximum stress (default 10)
  mythicState?: MythicState; // Mythic GME state (chaos factor, threads, characters)
  customTables?: CustomTable[]; // Creator-defined random tables
  variables?: Variable[]; // Dynamic tracked variables (numbers, booleans, lists)
  starting_choices?: StartingChoice[]; // Optional custom starting choices from adventure
}

// Mythic GME state tracking
export interface MythicState {
  chaosFactor: number; // 1-9, default 5
  threads: MythicThread[]; // Active story threads
  characters: MythicCharacter[]; // Known NPCs
  sceneCount: number; // Number of scenes played
  skillCheckHistory: SkillCheckResult[]; // Recent skill check results
  currentStreak: number; // Positive = success streak, negative = failure streak
  lastChaosAdjustment: number; // Scene number of last chaos adjustment
}

export interface SkillCheckResult {
  sceneNumber: number;
  success: boolean;
  skill: string;
  difficulty: number;
  margin: number; // How much they beat/missed the DC by
  timestamp: number;
}

export interface MythicThread {
  id: string;
  description: string;
  status: "active" | "closed";
  createdAt: number;
}

export interface MythicCharacter {
  id: string;
  name: string;
  role: string;
  status: "active" | "deceased" | "departed";
  createdAt: number;
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

// Starting choice for adventure - allows custom intro choices instead of "Start Story"
export interface StartingChoice {
  text: string; // The choice text displayed to player
  intro_override?: string; // Optional: different intro text for this path (if empty, uses main intro)
  skill_used?: string; // Optional: skill check on this choice
  skill_dc?: number; // DC for the skill check
  resource_used?: string; // Optional: resource cost/check
  item_used?: string; // Optional: requires/uses an item
  item_loss?: boolean; // Whether the item is consumed when used
  mythic_check?: string; // Optional: Mythic yes/no question
  mythic_context_only?: boolean; // When true with skill_used, mythic provides context only
  mythic_table?: string; // Element category name e.g., "character_descriptors"
  custom_table?: string; // Name or ID of custom table to roll on
}

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
  visibility?: "public" | "hidden" | "private"; // Controls who can see the adventure
  estimatedDuration: string; // e.g., "2-3 hours"
  popularity: number; // For sorting/ranking
  rating?: number; // 0-5
  playCount: number;
  createdAt: Date;
  updatedAt: Date;
  isPublished: boolean;
  isFeatured: boolean;
  nsfw: boolean;
  storyTemplate: Partial<StoryData>; // The actual story data
  selectedPreset?: string; // ID of the preset used
  presets?: Preset[]; // Adventure-specific character presets
  startingChoices?: StartingChoice[]; // Optional custom starting choices (if empty, shows "Start Story")
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
  storyData: StoryData | EncryptedStoryData; // Can be plain or encrypted
  isCompleted: boolean;
  isPublic: boolean; // Allow sharing stories
  nsfw?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// Encrypted story data format
export interface EncryptedStoryData {
  encrypted: true;
  version: number;
  data: string; // base64 encoded encrypted data
  salt: string; // base64 encoded salt
  iv: string; // base64 encoded IV
}

// Action analysis result from AI (for freeform action mode)
export interface ActionAnalysis {
  action_summary: string; // Brief description of the action
  skill_used: string | null; // Stat name for skill check, or null if no check needed
  skill_dc: number | null; // Difficulty class if skill check is needed
  item_used: string | null; // Item name if using an item
  resource_used: string | null; // Resource name if using a resource
  mythic_check: string | null; // Mythic yes/no question with likelihood
  mythic_table: string | null; // Mythic table to roll on for random generation
  custom_table: string | null; // Custom table to roll on
  is_plain_action: boolean; // True if no mechanics, just narration
}

// For manual action building when AI analysis fails
export interface ManualAction {
  text: string;
  skill_used?: string;
  skill_dc?: number;
  item_used?: string;
  resource_used?: string;
  is_plain_action: boolean;
}
