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

// Adventure difficulty setting (affects all tier conversions)
export type AdventureDifficulty = "easy" | "medium" | "hard" | "expert";

// DC (Difficulty Class) tier - AI specifies tier, system converts to number
export type DCTier =
  | "trivial"
  | "easy"
  | "average"
  | "hard"
  | "very_hard"
  | "impossible";

// Points/XP tier for quests, achievements, challenges
export type PointsTier =
  | "trivial" // Very minor accomplishment
  | "minor" // Small task
  | "moderate" // Standard quest
  | "major" // Significant achievement
  | "legendary"; // Epic accomplishment

// Stat/resource change tier
export type StatChangeTier =
  | "tiny" // +/- 1-2
  | "small" // +/- 3-5
  | "moderate" // +/- 6-10
  | "large" // +/- 11-15
  | "massive"; // +/- 16-25

// Challenge rounds tier (best of X)
export type ChallengeTier =
  | "quick" // Best of 3
  | "standard" // Best of 5
  | "extended" // Best of 7
  | "epic"; // Best of 9

// Item grade types (rarity tiers)
export type ItemGrade =
  | "common"
  | "uncommon"
  | "rare"
  | "epic"
  | "legendary"
  | "agmt";

export interface InventoryItem {
  name: string;
  quantity: number;
  description: string;
  type: "normal" | "consumable" | "story" | "misc";
  grade?: ItemGrade; // Item rarity tier
  durability?: number; // Current durability
  maxDurability?: number; // Max durability (based on grade)
  stat?: string;
  resource?: string;
  symbol: string;
  custom_symbol_url?: string;
}

// Ability cost types
export interface AbilityCost {
  type: "resource" | "variable";
  name: string; // Name of the resource or variable
  amount: number; // How much to deduct
}

// Ability grade types (skill-themed)
export type AbilityGrade =
  | "novice"
  | "apprentice"
  | "adept"
  | "expert"
  | "master"
  | "legendary";

// Abilities system - skills, spells, special moves
export interface Ability {
  name: string;
  description: string;
  grade: AbilityGrade; // Determines bonus
  cost: AbilityCost[]; // Can have multiple costs
  stat?: string; // Optional: which stat this ability relates to
  symbol: string;
  custom_symbol_url?: string;
  cooldown?: number; // Turns before can use again (0 = no cooldown)
  currentCooldown?: number; // Current cooldown counter
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
  revealedLore?: string[]; // Lore titles manually revealed by AI in this part
  stateChanges?: string[]; // Human-readable game state changes from tool calls (for story context)
  endChapter?: boolean;
  endStory?: boolean;
  gameOver?: boolean;
  raw?: string; // Raw AI output before parsing, used for alternative context building
}
export interface Choice {
  text: string;
  item_used?: string;
  item_loss?: boolean;
  ability_used?: string; // Name of ability to use (applies bonus, deducts cost)
  skill_used?: string;
  skill_dc?: number;
  skill_dc_tier?: DCTier; // Tier-based DC (trivial, easy, average, hard, very_hard, impossible) - converted to number by game logic
  stat_bonus?: number; // Bonus/penalty to stat value before calculating modifier (e.g., +10 from terrain)
  resource_used?: string;
  condition_applies?: string; // Name of condition that applies penalty to this roll (AI chooses most relevant)
  agmt_check?: string; // Format: "question (likelihood)" e.g., "Is the door locked? (Likely)"
  agmt_context_only?: boolean; // When true with skill_used, agmt provides context only and doesn't override skill check result
  table?: string; // Unified table field - checks both custom tables AND agmt element tables
  intro_override?: string; // Optional: For starting choices, use this text instead of AI generation
  // Context rolls - dice rolled to determine situational details
  rolls?: {
    dice: string; // Dice notation (e.g., "1d4", "2d6")
    description: string; // What the roll determines
  }[];
  // Legacy fields for backward compatibility (deprecated - use 'table' instead)
  agmt_table?: string;
  custom_table?: string;
  stt_input?: boolean; // True if text was input via speech-to-text (may contain transcription errors)
}
export interface Scene {
  parts: ScenePart[];
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

// Scene Challenge (Best of X) for multi-step challenges
export interface SceneChallenge {
  id: string; // Unique identifier
  name: string; // Display name (e.g., "Battle with the Orcs")
  description?: string; // Optional description of the challenge
  rounds: number; // Total rounds in "best of X" format (odd: 3, 5, 7, 9). First to majority wins.
  currentSuccesses: number; // Current success count
  currentFailures: number; // Current failure count
  active: boolean; // Whether challenge is ongoing
  createdAt: number; // Timestamp when challenge started
  resolvedAt?: number; // Timestamp when challenge ended
  result?: "won" | "lost"; // Outcome if resolved
  pointsAwarded?: number; // Points given on completion
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
  abilities?: Ability[]; // Starting abilities for this preset
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
export type VariableType = "number" | "boolean" | "string" | "list";

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

export interface StringVariable extends VariableBase {
  type: "string";
  value: string; // Text value (e.g., "Monday", "Tavern District")
  options?: string[]; // Optional predefined options to choose from
}

export interface ListVariable extends VariableBase {
  type: "list";
  items: string[]; // Array of items
  maxSize?: number; // Optional maximum list size
}

export type Variable =
  | NumberVariable
  | BooleanVariable
  | StringVariable
  | ListVariable;

export interface StoryData {
  story_name: string;
  premise: string;
  player_name: string;
  player_summary: string;
  intro: string;
  memory: string[];
  max_chapters: number;
  currentChapter: number;
  chapters: Chapter[];
  scene: Scene;
  stats: Stat[];
  resources: Resource[];
  inventory: InventoryItem[];
  abilities: Ability[]; // Skills, spells, special moves
  achievements: Achievement[];
  lore: StoryLore[];
  momentum: number;
  maxMomentum: number;
  points: number; // XP (experience points) - legacy name kept for backward compatibility
  level: number; // Current level derived from XP (calculated, but stored for convenience)
  upgradesSpent: number; // Number of level-up upgrades the player has spent
  earnedPointsFromChapters: number[];
  quests: Quest[]; // Quest system
  earnedPointsFromQuests: string[]; // Array of quest IDs that have awarded points
  relationships: Relationship[]; // Relationship tracking system
  conditions: Condition[]; // Active conditions/afflictions affecting the player
  gameOver?: GameOver; // Game over state if the player has permanently died/lost
  activeChallenge?: SceneChallenge; // Current scene challenge (progress clock)
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
  difficulty?: AdventureDifficulty; // Adventure difficulty (affects DC/points scaling)
  stress?: number; // YZE: Current stress level (0-10)
  maxStress?: number; // YZE: Maximum stress (default 10)
  agmtState?: AGMTState; // Advanced RPG Tools state (chaos factor, threads, characters)
  customTables?: CustomTable[]; // Creator-defined random tables
  variables?: Variable[]; // Dynamic tracked variables (numbers, booleans, lists)
  starting_choices?: StartingChoice[]; // Optional custom starting choices from adventure
  loreEmbeddingsDirty?: boolean; // Flag indicating lore has changed and needs re-embedding

  // Skill Tree System
  skillTrees?: SkillTree[]; // Author-defined skill trees
  unlockedNodes?: string[]; // IDs of unlocked skill nodes (format: "treeId:nodeId")
  nodeEffects?: NodeEffects; // Tracked effects from nodes (for respec)

  // Player action tracking (cleared after AI sees them)
  pendingPlayerActions?: string[]; // Human-readable actions taken between turns (level ups, skill purchases, etc.)
}

// Advanced RPG Tools state tracking
export interface AGMTState {
  chaosFactor: number; // 1-9, default 5
  threads: AGMTThread[]; // Active story threads
  characters: AGMTCharacter[]; // Known NPCs
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

export interface AGMTThread {
  id: string;
  description: string;
  status: "active" | "closed";
  createdAt: number;
}

export interface AGMTCharacter {
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
  abilityShopEnabled: boolean; // Allow purchasing abilities from shop
  statShop: ShopStat[]; // Stats available for purchase
  resourceShop: ShopResource[]; // Resources available for purchase
  itemShop: ShopItem[]; // Items available for purchase
  abilityShop: ShopAbility[]; // Abilities available for purchase
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
  grade?: ItemGrade; // Optional item grade
}

export interface ShopAbility {
  name: string;
  description: string;
  symbol: string;
  grade: AbilityGrade;
  cost: number; // Points cost to unlock
  abilityCost: AbilityCost[]; // Resource/variable costs to use the ability
  cooldown?: number; // Turns until can be used again
  stat?: string; // Associated stat (optional)
}

// ============================================
// SKILL TREE SYSTEM
// ============================================

// Node effect types - what happens when a node is unlocked
export interface SkillNodeEffect {
  type:
    | "stat_bonus"
    | "resource_bonus"
    | "grant_ability"
    | "grant_item"
    | "passive";
  target: string; // Stat name, resource name, ability name, item name, or passive description
  value?: number; // For stat_bonus and resource_bonus
  quantity?: number; // For grant_item
  abilityData?: Ability; // Full ability data for grant_ability
  itemData?: InventoryItem; // Full item data for grant_item
}

// A single node in a skill tree
export interface SkillNode {
  id: string; // Unique identifier within the tree
  name: string;
  description: string;
  symbol: string;
  custom_symbol_url?: string;
  type: "stat" | "ability" | "item" | "passive" | "resource";
  position: { x: number; y: number }; // 0-100 normalized coordinates for visual layout
  prerequisites: string[]; // Node IDs that must be unlocked first (empty = root node)
  effects: SkillNodeEffect[]; // What this node grants when unlocked
}

// A skill tree containing multiple nodes
export interface SkillTree {
  id: string; // Unique identifier
  name: string; // Display name (e.g., "Warrior's Path", "Arcane Studies")
  description: string;
  symbol: string;
  custom_symbol_url?: string;
  nodes: SkillNode[];
}

// Tracked effects from skill tree nodes (for respec purposes)
export interface NodeEffects {
  statBonuses: { stat: string; amount: number; nodeId: string }[];
  resourceBonuses: { resource: string; amount: number; nodeId: string }[];
  passives: { name: string; description: string; nodeId: string }[];
  // Note: abilities and items are tracked by nodeId in unlockedNodes,
  // and can be removed by matching node during respec
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
  abilityShopEnabled: false,
  statShop: [],
  resourceShop: [],
  itemShop: [],
  abilityShop: [],
};

// XP reward values (legacy name UPGRADE_COSTS kept for backward compatibility)
export const UPGRADE_COSTS = {
  STAT_INCREASE: 10, // Legacy: points to increase a stat by 1 (now level-up reward)
  RESOURCE_MAX_INCREASE: 15, // Legacy: points to increase max resource (now level-up reward)
  ADD_ITEM: 20, // Legacy: points to add a new item (now level-up reward)
  CHAPTER_REWARD: 100, // XP earned for completing a chapter
  BEAT_REWARD: 25, // XP earned for completing a story beat
} as const;

// Starting choice for adventure - allows custom intro choices instead of "Start Story"
export interface StartingChoice {
  text: string; // The choice text displayed to player
  intro_override?: string; // Optional: different intro text for this path (if empty, uses main intro)
  skill_used?: string; // Optional: skill check on this choice
  skill_dc?: number | DCTier; // DC for the skill check (number for legacy, DCTier for new)
  resource_used?: string; // Optional: resource cost/check
  item_used?: string; // Optional: requires/uses an item
  item_loss?: boolean; // Whether the item is consumed when used
  ability_used?: string; // Optional: uses an ability (applies bonus, deducts cost)
  agmt_check?: string; // Optional: AGMT yes/no question
  agmt_context_only?: boolean; // When true with skill_used, agmt provides context only
  table?: string; // Unified table field - checks both custom tables AND agmt element tables
  // Legacy fields for backward compatibility (deprecated - use 'table' instead)
  agmt_table?: string;
  custom_table?: string;
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
  difficulty: "easy" | "medium" | "hard" | "expert";
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
  difficulty?: ("easy" | "medium" | "hard" | "expert")[];
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
  stat_bonus: number | null; // Bonus/penalty to stat value before calculating modifier (e.g., +10 from passive)
  item_used: string | null; // Item name if using an item
  ability_used: string | null; // Ability name if using an ability
  resource_used: string | null; // Resource name if using a resource
  agmt_check: string | null; // AGMT yes/no question with likelihood
  table: string | null; // Unified table field - checks both custom tables AND agmt element tables
  // Legacy fields for backward compatibility (deprecated - use 'table' instead)
  agmt_table?: string | null;
  custom_table?: string | null;
  is_plain_action: boolean; // True if no mechanics, just narration
  // Scene Challenge handling
  challenge_handling?: {
    is_complex_event: boolean; // True if this implies a multi-step task
    challenge_name: string | null; // Name for new challenge (e.g., "Escape the burning inn")
  };
  // Context rolls - dice rolled to determine situational details
  rolls?: {
    dice: string; // Dice notation (e.g., "1d4", "2d6", "1d8+2")
    description: string; // What the roll determines (e.g., "How many enemies are present")
  }[];
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
