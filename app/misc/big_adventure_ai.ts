/**
 * Big Adventure AI - Full adventure generation from a single prompt
 *
 * Generates complete adventures in stages:
 * - Stage 1: Core concept (title, premise, intro, player summary, author notes)
 * - Stage 2: Mechanics (stats, resources, abilities, variables)
 * - Stage 3: Content (inventory, lore, relationships, achievements, quests)
 * - Stage 4: Advanced (presets, agmt, custom tables, upgrades, starting choices)
 * - Stage 5: Icons (assigns thematic icons to all elements)
 */

import { StoryData, StartingChoice } from "@/app/misc/structs";
import { ChatMessage } from "@/app/misc/ai";
import { ALL_GAME_ICON_IDS } from "@/app/misc/gameIcons";
import JSON5 from "json5";

export type RPGSystemType =
  | "3d6"
  | "1d20"
  | "1d100"
  | "percentile"
  | "pbta"
  | "fate"
  | "yze"
  | "explosive"
  | "narrative";

export type ComplexityLevel = "simple" | "moderate" | "complex";

// Generation stages - content and advanced are split into substages to avoid timeout
export type GenerationStage =
  | "core"
  | "mechanics"
  | "content-lore"
  | "content-achievements"
  | "content-items"
  | "advanced-presets"
  | "advanced-tables"
  | "advanced-skilltrees"
  | "advanced-other"
  | "icons";

// Legacy stage type for backward compatibility and UI grouping
export type LegacyStage = "core" | "mechanics" | "content" | "advanced";

// Map substage to its parent legacy stage
export function getParentStage(stage: GenerationStage): LegacyStage {
  if (stage === "core") return "core";
  if (stage === "mechanics") return "mechanics";
  if (stage.startsWith("content-")) return "content";
  if (stage === "icons") return "advanced"; // Icons stage uses advanced config
  return "advanced";
}

// Per-stage configuration
export interface StageConfig {
  enabled: boolean;
  iterations: number; // How many passes to run (1-5)
  maxOutputTokens: number; // Output tokens for this stage
  customInstructions?: string; // Optional custom instructions for this stage
}

// Default stage configurations for UI (uses legacy 4 stages)
export const DEFAULT_STAGE_CONFIGS: Record<LegacyStage, StageConfig> = {
  core: {
    enabled: true,
    iterations: 1,
    maxOutputTokens: 4000,
    customInstructions: "",
  },
  mechanics: {
    enabled: true,
    iterations: 1,
    maxOutputTokens: 4000,
    customInstructions: "",
  },
  content: {
    enabled: true,
    iterations: 1,
    maxOutputTokens: 4000,
    customInstructions: "",
  },
  advanced: {
    enabled: true,
    iterations: 1,
    maxOutputTokens: 4000,
    customInstructions: "",
  },
};

// Get config for a substage from legacy config
export function getSubstageConfig(
  stage: GenerationStage,
  stageConfigs: Record<LegacyStage, StageConfig> | undefined
): StageConfig {
  const legacyStage = getParentStage(stage);
  return stageConfigs?.[legacyStage] || DEFAULT_STAGE_CONFIGS[legacyStage];
}

// Iteration-specific sub-stages for content stage
export type ContentSubStage =
  | "lore"
  | "achievements"
  | "relationships"
  | "quests"
  | "inventory";

export interface ContentIterationConfig {
  lore: number; // 1-5 iterations
  achievements: number;
  relationships: number;
  quests: number;
  inventory: number;
}

export const DEFAULT_CONTENT_ITERATIONS: ContentIterationConfig = {
  lore: 1,
  achievements: 1,
  relationships: 1,
  quests: 1,
  inventory: 1,
};

export interface BigAdventureConfig {
  prompt: string;
  genre?: string;
  rpgSystem: RPGSystemType;
  complexity: ComplexityLevel;
  nsfw: boolean;
  includeAGMT: boolean;
  includeUpgradeShop: boolean;
  includeSkillTrees: boolean;
  includeCustomTables: boolean;
  includePresets: boolean;
  includeStartingChoices: boolean;
  targetDuration: "short" | "medium" | "long";
  maxOutputTokens: number; // Global fallback output max per stage

  // Per-stage configuration (Phase 1) - uses legacy 4 stages for UI
  stageConfigs?: Record<LegacyStage, StageConfig>;
  contentIterations?: ContentIterationConfig;

  // Preview mode (Phase 2) - pause after each stage for review
  previewBetweenStages?: boolean;

  // Generation style controls (Phase 4)
  temperature?: number; // 0.3 = focused, 1.0 = creative
  stylePreset?: StylePreset;
}

// Style presets for different narrative tones
export type StylePreset =
  | "default"
  | "grimdark"
  | "whimsical"
  | "cinematic"
  | "literary"
  | "pulp"
  | "horror"
  | "romantic";

export const STYLE_PRESETS: Record<
  StylePreset,
  {
    name: string;
    description: string;
    emoji: string;
    temperatureHint: number;
    promptModifier: string;
  }
> = {
  default: {
    name: "Balanced",
    description: "Standard narrative tone, adaptable to any genre",
    emoji: "⚖️",
    temperatureHint: 0.7,
    promptModifier: "",
  },
  grimdark: {
    name: "Grimdark",
    description: "Dark, gritty, morally ambiguous. Consequences are harsh.",
    emoji: "🖤",
    temperatureHint: 0.6,
    promptModifier:
      "Write in a dark, gritty tone. The world is harsh and unforgiving. Moral choices are difficult with no clear right answer. Violence has consequences. Hope is rare but precious.",
  },
  whimsical: {
    name: "Whimsical",
    description: "Light-hearted, playful, with wonder and charm",
    emoji: "🌈",
    temperatureHint: 0.8,
    promptModifier:
      "Write in a whimsical, light-hearted tone. Include moments of wonder, humor, and charm. Even serious moments have a touch of warmth. Names and places can be playful.",
  },
  cinematic: {
    name: "Cinematic",
    description: "Action-packed, visual, blockbuster storytelling",
    emoji: "🎬",
    temperatureHint: 0.7,
    promptModifier:
      "Write in a cinematic style. Focus on vivid, visual descriptions. Action sequences are dynamic and exciting. Dialogue is punchy. Pacing is brisk with dramatic reveals.",
  },
  literary: {
    name: "Literary",
    description: "Thoughtful, character-driven, thematically rich",
    emoji: "📚",
    temperatureHint: 0.65,
    promptModifier:
      "Write in a literary style. Focus on character depth, internal conflict, and thematic resonance. Prose should be evocative and meaningful. Subtext matters.",
  },
  pulp: {
    name: "Pulp",
    description: "Over-the-top, exciting, classic adventure serial style",
    emoji: "💥",
    temperatureHint: 0.85,
    promptModifier:
      "Write in pulp adventure style. Action is bold and exciting. Heroes are heroic, villains are villainous. Cliffhangers abound. Don't be afraid of melodrama.",
  },
  horror: {
    name: "Horror",
    description: "Suspenseful, unsettling, building dread",
    emoji: "👻",
    temperatureHint: 0.6,
    promptModifier:
      "Write in a horror style. Build tension and dread. The unknown is frightening. Details should unsettle. Safety is never guaranteed. Use atmospheric descriptions.",
  },
  romantic: {
    name: "Romantic",
    description: "Emotional, relationship-focused, dramatic",
    emoji: "💕",
    temperatureHint: 0.75,
    promptModifier:
      "Write with romantic undertones. Relationships and emotional connections drive the story. Include tension, longing, and meaningful character moments.",
  },
};

// Prompt templates for common genres
export interface PromptTemplate {
  id: string;
  name: string;
  genre: string;
  emoji: string;
  description: string;
  promptStarter: string;
  suggestedSystem: RPGSystemType;
  suggestedComplexity: ComplexityLevel;
  suggestedStyle: StylePreset;
}

export const PROMPT_TEMPLATES: PromptTemplate[] = [
  {
    id: "dark-fantasy",
    name: "Dark Fantasy Quest",
    genre: "Dark Fantasy",
    emoji: "⚔️",
    description: "A cursed hero seeks redemption in a dying world",
    promptStarter:
      "A dark fantasy adventure where the player is a cursed knight seeking redemption. The world is dying, corrupted by an ancient evil that spreads from a forgotten temple. The knight must confront not only external monsters but their own past sins. Along the way, they'll encounter morally complex allies, each with their own dark secrets.",
    suggestedSystem: "1d20",
    suggestedComplexity: "moderate",
    suggestedStyle: "grimdark",
  },
  {
    id: "space-opera",
    name: "Space Opera",
    genre: "Sci-Fi",
    emoji: "🚀",
    description: "Galaxy-spanning adventure among the stars",
    promptStarter:
      "A space opera adventure where the player is the captain of a small starship with a loyal but quirky crew. The galaxy is divided between three major factions on the brink of war. The player stumbles upon an ancient alien artifact that could change everything, making them a target for all sides.",
    suggestedSystem: "1d20",
    suggestedComplexity: "complex",
    suggestedStyle: "cinematic",
  },
  {
    id: "cozy-mystery",
    name: "Cozy Mystery",
    genre: "Mystery",
    emoji: "🔍",
    description: "Solve puzzles in a charming small town",
    promptStarter:
      "A cozy mystery adventure in the quaint seaside town of Willowbrook. The player is the new owner of a bookshop who discovers their grandmother was secretly a detective. When the mayor goes missing during the annual festival, only the player notices the clues everyone else overlooks. Features puzzles, quirky townsfolk, and maybe a touch of romance.",
    suggestedSystem: "narrative",
    suggestedComplexity: "simple",
    suggestedStyle: "whimsical",
  },
  {
    id: "cosmic-horror",
    name: "Cosmic Horror",
    genre: "Horror",
    emoji: "🐙",
    description: "Face unknowable terrors beyond comprehension",
    promptStarter:
      "A cosmic horror investigation in 1920s New England. The player is a professor whose colleague disappeared after discovering something in the university archives. Following their trail leads to a remote fishing village where the locals are hiding terrible secrets. The truth is worse than madness.",
    suggestedSystem: "1d100",
    suggestedComplexity: "moderate",
    suggestedStyle: "horror",
  },
  {
    id: "high-fantasy",
    name: "Epic High Fantasy",
    genre: "High Fantasy",
    emoji: "🏰",
    description: "Classic fantasy with magic, dragons, and destiny",
    promptStarter:
      "An epic high fantasy adventure where the player is a young farmhand who discovers they are the last heir of a legendary bloodline. An ancient prophecy speaks of a chosen one who will unite the fractured kingdoms against the returning Dark Lord. Features classic fantasy elements: magic academies, dragon riders, elven forests, and dwarven mines.",
    suggestedSystem: "1d20",
    suggestedComplexity: "complex",
    suggestedStyle: "cinematic",
  },
  {
    id: "cyberpunk",
    name: "Neon Cyberpunk",
    genre: "Cyberpunk",
    emoji: "🌃",
    description: "High tech, low life in a dystopian megacity",
    promptStarter:
      "A cyberpunk adventure in Neo-Shanghai, 2087. The player is a street-level fixer with a neural implant that's slowly killing them. They have three months to find a cure, which means taking one last job from the megacorp that ruined their life. Features body modification, corporate intrigue, AI consciousness, and the eternal rain.",
    suggestedSystem: "yze",
    suggestedComplexity: "moderate",
    suggestedStyle: "grimdark",
  },
  {
    id: "swashbuckler",
    name: "Swashbuckling Pirates",
    genre: "Adventure",
    emoji: "🏴‍☠️",
    description: "High seas adventure with sword fights and treasure",
    promptStarter:
      "A swashbuckling pirate adventure in the Sapphire Isles. The player is the newly elected captain of a motley crew, inheriting both a ship and a treasure map from their predecessor. But other pirates want the map, the Royal Navy wants the ship, and a sea witch wants the player specifically. Adventure awaits!",
    suggestedSystem: "pbta",
    suggestedComplexity: "moderate",
    suggestedStyle: "pulp",
  },
  {
    id: "slice-of-life",
    name: "Magical Slice of Life",
    genre: "Slice of Life",
    emoji: "☕",
    description: "Everyday magic in a peaceful fantasy setting",
    promptStarter:
      "A cozy slice-of-life adventure where the player runs a small apothecary in a magical village. Between brewing potions and gathering ingredients, they help neighbors with problems big and small. The village is full of interesting characters: a retired adventurer baker, a shy ghost librarian, a grumpy but caring witch next door.",
    suggestedSystem: "narrative",
    suggestedComplexity: "simple",
    suggestedStyle: "whimsical",
  },
  {
    id: "political-intrigue",
    name: "Political Intrigue",
    genre: "Drama",
    emoji: "👑",
    description: "Schemes, alliances, and betrayal in royal courts",
    promptStarter:
      "A political intrigue adventure in a Renaissance-inspired kingdom. The player is a minor noble suddenly thrust into court politics after their family is implicated in a conspiracy. To clear their name and survive, they must navigate deadly schemes, forge alliances, uncover the real traitors, and perhaps claim more power than they ever imagined.",
    suggestedSystem: "fate",
    suggestedComplexity: "complex",
    suggestedStyle: "literary",
  },
  {
    id: "post-apocalyptic",
    name: "Post-Apocalyptic Survival",
    genre: "Post-Apocalyptic",
    emoji: "☢️",
    description: "Survive and rebuild after civilization falls",
    promptStarter:
      "A post-apocalyptic survival adventure set 50 years after a mysterious event called the Collapse. The player leads a small community trying to survive in the ruins of a once-great city. Resources are scarce, rival factions compete for territory, and strange mutations have appeared in the wasteland. But rumors speak of a place called Haven...",
    suggestedSystem: "yze",
    suggestedComplexity: "moderate",
    suggestedStyle: "grimdark",
  },
];

// Guided prompt builder questions
export interface PromptBuilderQuestion {
  id: string;
  question: string;
  placeholder: string;
  required: boolean;
  category: "protagonist" | "setting" | "conflict" | "tone" | "unique";
}

export const PROMPT_BUILDER_QUESTIONS: PromptBuilderQuestion[] = [
  {
    id: "protagonist",
    question: "Who is the main character?",
    placeholder:
      "e.g., A disgraced knight seeking redemption, a young witch learning her powers...",
    required: true,
    category: "protagonist",
  },
  {
    id: "protagonist-goal",
    question: "What does the protagonist want?",
    placeholder:
      "e.g., To find their missing sibling, to become the greatest mage...",
    required: true,
    category: "protagonist",
  },
  {
    id: "setting",
    question: "Where does the story take place?",
    placeholder:
      "e.g., A kingdom on the brink of war, a space station at the edge of known space...",
    required: true,
    category: "setting",
  },
  {
    id: "setting-unique",
    question: "What makes this world special?",
    placeholder:
      "e.g., Magic comes from emotions, the sun never sets, technology is powered by souls...",
    required: false,
    category: "setting",
  },
  {
    id: "conflict",
    question: "What's the main threat or obstacle?",
    placeholder:
      "e.g., An ancient evil awakening, a corrupt empire, a mysterious plague...",
    required: true,
    category: "conflict",
  },
  {
    id: "stakes",
    question: "What happens if the protagonist fails?",
    placeholder:
      "e.g., The world ends, their family dies, they lose their humanity...",
    required: false,
    category: "conflict",
  },
  {
    id: "tone",
    question: "What's the emotional tone?",
    placeholder:
      "e.g., Dark and gritty, light and hopeful, mysterious and unsettling...",
    required: false,
    category: "tone",
  },
  {
    id: "unique",
    question: "Any unique elements to include?",
    placeholder:
      "e.g., A talking animal companion, time travel mechanics, a love triangle...",
    required: false,
    category: "unique",
  },
];

// Build prompt from guided questions
export function buildPromptFromAnswers(
  answers: Record<string, string>
): string {
  const parts: string[] = [];

  // Protagonist
  if (answers.protagonist) {
    parts.push(`The protagonist is ${answers.protagonist}.`);
  }
  if (answers["protagonist-goal"]) {
    parts.push(`Their goal is ${answers["protagonist-goal"]}.`);
  }

  // Setting
  if (answers.setting) {
    parts.push(`The story takes place in ${answers.setting}.`);
  }
  if (answers["setting-unique"]) {
    parts.push(`What makes this world unique: ${answers["setting-unique"]}.`);
  }

  // Conflict
  if (answers.conflict) {
    parts.push(`The main conflict involves ${answers.conflict}.`);
  }
  if (answers.stakes) {
    parts.push(`If the protagonist fails, ${answers.stakes}.`);
  }

  // Tone & Unique
  if (answers.tone) {
    parts.push(`The tone should be ${answers.tone}.`);
  }
  if (answers.unique) {
    parts.push(`Special elements to include: ${answers.unique}.`);
  }

  return parts.join(" ");
}

// Autosave data structure
export interface BigAdventureAutosave {
  id: string; // Unique session ID
  timestamp: number;
  config: BigAdventureConfig;
  completedStages: GenerationStage[];
  partialResults: Partial<BigAdventureResult>;
  currentStage?: GenerationStage;
  currentIteration?: number;
}

// Regeneration section types (Phase 2)
export type RegenerateSection =
  | "title" // Regenerate title, shortDescription, description
  | "intro" // Regenerate intro, premise, player_summary
  | "stats" // Regenerate stats
  | "resources" // Regenerate resources
  | "abilities" // Regenerate abilities
  | "variables" // Regenerate variables
  | "inventory" // Regenerate inventory
  | "lore" // Regenerate lore entries
  | "achievements" // Regenerate achievements
  | "quests" // Regenerate quests
  | "relationships" // Regenerate relationships
  | "presets" // Regenerate character presets
  | "agmt" // Regenerate agmt state
  | "customTables" // Regenerate custom tables
  | "upgradeShop" // Regenerate upgrade shop
  | "levelingSettings" // Regenerate leveling curve settings
  | "startingChoices" // Regenerate starting choices
  | "icons"; // Regenerate icon assignments

// Section metadata for UI (uses LegacyStage for grouping)
export const REGENERATE_SECTIONS: Record<
  RegenerateSection,
  {
    name: string;
    description: string;
    emoji: string;
    stage: LegacyStage;
  }
> = {
  title: {
    name: "Title & Description",
    description: "Adventure title and descriptions",
    emoji: "📝",
    stage: "core",
  },
  intro: {
    name: "Intro & Premise",
    description: "Opening narrative and player background",
    emoji: "📖",
    stage: "core",
  },
  stats: {
    name: "Stats",
    description: "Character attributes",
    emoji: "📊",
    stage: "mechanics",
  },
  resources: {
    name: "Resources",
    description: "Health, mana, stamina, etc.",
    emoji: "⚡",
    stage: "mechanics",
  },
  abilities: {
    name: "Abilities",
    description: "Skills, spells, and techniques",
    emoji: "✨",
    stage: "mechanics",
  },
  variables: {
    name: "Variables",
    description: "Story tracking variables",
    emoji: "🔢",
    stage: "mechanics",
  },
  inventory: {
    name: "Inventory",
    description: "Starting items",
    emoji: "🎒",
    stage: "content",
  },
  lore: {
    name: "Lore",
    description: "World lore entries",
    emoji: "📚",
    stage: "content",
  },
  achievements: {
    name: "Achievements",
    description: "Unlockable achievements",
    emoji: "🏆",
    stage: "content",
  },
  quests: {
    name: "Quests",
    description: "Quest objectives",
    emoji: "📋",
    stage: "content",
  },
  relationships: {
    name: "Relationships",
    description: "NPC relationships",
    emoji: "🤝",
    stage: "content",
  },
  presets: {
    name: "Character Presets",
    description: "Alternative character builds",
    emoji: "🎭",
    stage: "advanced",
  },
  agmt: {
    name: "Advanced RPG Tools",
    description: "Solo play configuration",
    emoji: "🎲",
    stage: "advanced",
  },
  customTables: {
    name: "Custom Tables",
    description: "Random tables",
    emoji: "🎰",
    stage: "advanced",
  },
  upgradeShop: {
    name: "Upgrade Shop",
    description: "Progression shop items",
    emoji: "🛒",
    stage: "advanced",
  },
  levelingSettings: {
    name: "Leveling Curve",
    description: "XP curve and upgrade points per level",
    emoji: "📈",
    stage: "advanced",
  },
  startingChoices: {
    name: "Starting Choices",
    description: "Adventure beginning options",
    emoji: "🚀",
    stage: "advanced",
  },
  icons: {
    name: "Icons",
    description: "Thematic icon assignments for all elements",
    emoji: "🎨",
    stage: "advanced",
  },
};

// Autosave constants
export const AUTOSAVE_KEY = "bigAdventure_autosave";
export const AUTOSAVE_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

// Config templates
export const CONFIG_TEMPLATES_KEY = "bigAdventure_templates";

export interface ConfigTemplate {
  id: string;
  name: string;
  description: string;
  createdAt: number;
  config: Omit<BigAdventureConfig, "prompt">; // Exclude prompt - that's adventure-specific
}

// Template helper functions
export function saveConfigTemplate(template: ConfigTemplate): void {
  const templates = loadConfigTemplates();
  const existingIndex = templates.findIndex((t) => t.id === template.id);
  if (existingIndex >= 0) {
    templates[existingIndex] = template;
  } else {
    templates.push(template);
  }
  localStorage.setItem(CONFIG_TEMPLATES_KEY, JSON.stringify(templates));
}

export function loadConfigTemplates(): ConfigTemplate[] {
  try {
    const data = localStorage.getItem(CONFIG_TEMPLATES_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

export function deleteConfigTemplate(id: string): void {
  const templates = loadConfigTemplates().filter((t) => t.id !== id);
  localStorage.setItem(CONFIG_TEMPLATES_KEY, JSON.stringify(templates));
}

export function generateTemplateId(): string {
  return `template_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

// Generation History
export const GENERATION_HISTORY_KEY = "bigAdventure_history";
export const MAX_HISTORY_ENTRIES = 10;

export interface GenerationHistoryEntry {
  id: string;
  timestamp: number;
  title: string;
  config: BigAdventureConfig;
  result: BigAdventureResult;
  tokenCost: number;
  thumbnailUrl?: string;
  bannerUrl?: string;
}

export function saveGenerationToHistory(
  entry: Omit<GenerationHistoryEntry, "id">
): string {
  const history = loadGenerationHistory();
  const id = `gen_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const newEntry: GenerationHistoryEntry = {
    ...entry,
    id,
  };

  // Add to beginning, keep max entries
  history.unshift(newEntry);
  if (history.length > MAX_HISTORY_ENTRIES) {
    history.pop();
  }

  localStorage.setItem(GENERATION_HISTORY_KEY, JSON.stringify(history));
  return id;
}

export function updateGenerationHistory(
  id: string,
  updates: Partial<Omit<GenerationHistoryEntry, "id">>
): void {
  const history = loadGenerationHistory();
  const index = history.findIndex((h) => h.id === id);
  if (index === -1) return;

  history[index] = {
    ...history[index],
    ...updates,
    // Update timestamp to show it was modified
    timestamp: Date.now(),
  };

  localStorage.setItem(GENERATION_HISTORY_KEY, JSON.stringify(history));
}

export function loadGenerationHistory(): GenerationHistoryEntry[] {
  try {
    const data = localStorage.getItem(GENERATION_HISTORY_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

export function deleteHistoryEntry(id: string): void {
  const history = loadGenerationHistory().filter((h) => h.id !== id);
  localStorage.setItem(GENERATION_HISTORY_KEY, JSON.stringify(history));
}

export function clearGenerationHistory(): void {
  localStorage.removeItem(GENERATION_HISTORY_KEY);
}

export interface GenerationProgress {
  stage: GenerationStage;
  stageNumber: number;
  totalStages: number;
  stageName: string;
  isComplete: boolean;
}

export interface IconAssignments {
  stats?: Record<string, string>;
  resources?: Record<string, string>;
  inventory?: Record<string, string>;
  abilities?: Record<string, string>;
  achievements?: Record<string, string>;
  relationships?: Record<string, string>;
  presets?: Record<string, string>;
  skillTrees?: Record<string, string>; // Tree name -> icon
  skillTreeNodes?: Record<string, string>; // "TreeName:NodeName" -> icon
}

export interface BigAdventureResult {
  // Adventure metadata
  title: string;
  shortDescription: string;
  description: string;

  // Story template
  storyTemplate: Partial<StoryData>;
  startingChoices?: StartingChoice[];

  // Icon assignments (from icons stage)
  iconAssignments?: IconAssignments;
}

// Complexity determines counts for various elements
const COMPLEXITY_COUNTS: Record<
  ComplexityLevel,
  {
    stats: number;
    resources: number;
    abilities: number;
    lore: number;
    achievements: number;
    quests: number;
    relationships: number;
    presets: number;
    customTables: number;
    shopItems: number;
  }
> = {
  simple: {
    stats: 5,
    resources: 3,
    abilities: 4,
    lore: 12,
    achievements: 8,
    quests: 4,
    relationships: 4,
    presets: 3,
    customTables: 3,
    shopItems: 6,
  },
  moderate: {
    stats: 7,
    resources: 4,
    abilities: 8,
    lore: 20,
    achievements: 12,
    quests: 8,
    relationships: 8,
    presets: 4,
    customTables: 5,
    shopItems: 10,
  },
  complex: {
    stats: 10,
    resources: 5,
    abilities: 14,
    lore: 30,
    achievements: 18,
    quests: 12,
    relationships: 12,
    presets: 6,
    customTables: 8,
    shopItems: 16,
  },
};

// Duration affects content depth
const DURATION_MULTIPLIERS: Record<"short" | "medium" | "long", number> = {
  short: 0.7,
  medium: 1.0,
  long: 1.5,
};

// RPG System descriptions for context
const RPG_SYSTEM_DESCRIPTIONS: Record<RPGSystemType, string> = {
  "3d6":
    "3d6 system (3-18 range, bell curve). Use tier names for difficulty: trivial, easy, average, hard, very_hard, impossible.",
  "1d20":
    "D20 system (1-20 flat probability). Use tier names for difficulty: trivial, easy, average, hard, very_hard, impossible.",
  "1d100":
    "Percentile system (1-100). Use tier names for difficulty: trivial, easy, average, hard, very_hard, impossible.",
  percentile:
    "Percentile system (1-100). Use tier names for difficulty: trivial, easy, average, hard, very_hard, impossible.",
  pbta: "Powered by the Apocalypse (2d6+mod). 6-: fail, 7-9: partial, 10+: success, 12+: critical.",
  fate: "Fate system (4dF, -4 to +4). Ladder: -2 Terrible, 0 Mediocre, +2 Fair, +4 Great, +6 Fantastic.",
  yze: "Year Zero Engine (d6 dice pool, 6s = successes). Includes stress dice and panic mechanics.",
  explosive:
    "Explosive dice (d4→d6→d8→d10→d12, max rolls explode up). Criticals chain to higher dice.",
  narrative:
    "Narrative system (no dice, AI determines outcomes based on character abilities and story context).",
};

/**
 * Get the stage configuration
 */
export function getStageInfo(stage: GenerationStage): {
  name: string;
  description: string;
  detailedDescription: string;
  generates: string[];
  instructionHint: string;
  number: number;
  emoji: string;
} {
  const stages: Record<
    GenerationStage,
    {
      name: string;
      description: string;
      detailedDescription: string;
      generates: string[];
      instructionHint: string;
      number: number;
      emoji: string;
    }
  > = {
    core: {
      name: "Core Concept",
      description: "The foundation of your adventure",
      detailedDescription:
        "Creates the adventure's identity: its title, main premise, opening scene, and your character's backstory. This sets the tone and narrative direction for everything else.",
      generates: [
        "Adventure title & description",
        "Story premise & setting",
        "Opening intro scene",
        "Player character summary",
        "Author notes (AI guidance)",
      ],
      instructionHint:
        "Guide the tone, setting details, character personality, or narrative style",
      number: 1,
      emoji: "📝",
    },
    mechanics: {
      name: "Game Mechanics",
      description: "Stats, skills, and game systems",
      detailedDescription:
        "Defines how the game plays mechanically: what attributes your character has, what resources to manage, special abilities to use, and hidden variables that track story progress.",
      generates: [
        "Character stats (Strength, Charisma, etc.)",
        "Resources (Health, Mana, Gold, etc.)",
        "Abilities & skills with costs/cooldowns",
        "Hidden variables for story tracking",
      ],
      instructionHint:
        "Request specific stats, resource types, unique abilities, or special mechanics",
      number: 2,
      emoji: "⚙️",
    },
    "content-lore": {
      name: "Lore & World",
      description: "World-building and lore entries",
      detailedDescription:
        "Creates the world's history, factions, NPCs, and locations. Rich lore entries that bring the setting to life.",
      generates: [
        "Key NPCs and characters",
        "Locations and landmarks",
        "Factions and organizations",
        "History and past events",
        "World lore and customs",
      ],
      instructionHint:
        "Focus on NPC depth, faction politics, location atmosphere, or historical events",
      number: 3,
      emoji: "📚",
    },
    "content-achievements": {
      name: "Goals & Milestones",
      description: "Achievements and quests",
      detailedDescription:
        "Defines what the player can accomplish: achievements to unlock and quests to complete.",
      generates: ["Achievements with rewards", "Main and side quests"],
      instructionHint:
        "Shape quest objectives, achievement triggers, or story pacing",
      number: 4,
      emoji: "🏆",
    },
    "content-items": {
      name: "Items & NPCs",
      description: "Inventory and relationships",
      detailedDescription:
        "Creates the player's starting equipment and NPC relationships that can change over time.",
      generates: [
        "Starting inventory items",
        "NPC relationships with attitudes",
      ],
      instructionHint:
        "Focus on item variety, equipment balance, or NPC dynamics",
      number: 5,
      emoji: "🎒",
    },
    "advanced-presets": {
      name: "Character Presets",
      description: "Pre-made character builds",
      detailedDescription:
        "Creates alternative character builds players can choose from, each with unique stats, abilities, and starting equipment.",
      generates: [
        "Character presets/classes",
        "Unique stat distributions",
        "Preset-specific abilities",
      ],
      instructionHint:
        "Shape class archetypes, playstyle variety, or build uniqueness",
      number: 6,
      emoji: "🎭",
    },
    "advanced-tables": {
      name: "Random Tables",
      description: "Custom tables and AGMT integration",
      detailedDescription:
        "Adds randomization through custom tables and AGMT GM emulator tools for solo play.",
      generates: [
        "Custom random event tables",
        "AGMT oracle configuration",
        "Random encounter tables",
      ],
      instructionHint:
        "Focus on event variety, oracle themes, or encounter balance",
      number: 7,
      emoji: "🎲",
    },
    "advanced-skilltrees": {
      name: "Skill Trees",
      description: "Character progression trees",
      detailedDescription:
        "Creates graphical skill trees for character advancement, allowing players to unlock abilities, stat bonuses, items, and passive effects as they progress.",
      generates: [
        "Skill tree structures",
        "Unlockable abilities",
        "Stat and resource bonuses",
        "Passive effects",
      ],
      instructionHint:
        "Shape progression paths, build archetypes, or power scaling",
      number: 8,
      emoji: "🌳",
    },
    "advanced-other": {
      name: "Upgrades & Choices",
      description: "Progression shop and starting options",
      detailedDescription:
        "Creates the upgrade shop for character progression and starting choices for adventure customization.",
      generates: [
        "Upgrade shop items",
        "Starting choice options",
        "Progression unlocks",
      ],
      instructionHint:
        "Shape upgrade paths, starting variations, or progression balance",
      number: 9,
      emoji: "🛒",
    },
    icons: {
      name: "Icon Assignment",
      description: "Assigns thematic icons to all elements",
      detailedDescription:
        "Reviews all stats, resources, items, abilities, achievements, and lore entries to assign appropriate icons from the game-icons.net library.",
      generates: [
        "Icons for stats and resources",
        "Icons for items and abilities",
        "Icons for achievements and relationships",
      ],
      instructionHint:
        "The AI will automatically choose thematic icons for each element",
      number: 10,
      emoji: "🎨",
    },
  };
  return stages[stage];
}

/**
 * Build the system prompt for full adventure generation
 */
function buildSystemPrompt(
  config: BigAdventureConfig,
  stage: GenerationStage
): string {
  const counts = COMPLEXITY_COUNTS[config.complexity];
  const durationMultiplier = DURATION_MULTIPLIERS[config.targetDuration];
  const rpgDesc = RPG_SYSTEM_DESCRIPTIONS[config.rpgSystem];

  // Get style preset modifier if set
  const styleModifier =
    config.stylePreset && config.stylePreset !== "default"
      ? STYLE_PRESETS[config.stylePreset]?.promptModifier
      : "";

  // Get custom instructions for this stage (use parent stage config for substages)
  const stageConfig = getSubstageConfig(stage, config.stageConfigs);
  const customInstructions = stageConfig.customInstructions?.trim() || "";

  const basePrompt = `You are an expert Game Designer creating a complete text adventure game.

USER'S ADVENTURE CONCEPT:
"${config.prompt}"
${config.genre ? `\nGENRE/THEME: ${config.genre}` : ""}
${styleModifier ? `\nSTYLE DIRECTION: ${styleModifier}` : ""}
${
  customInstructions
    ? `\nCUSTOM INSTRUCTIONS FOR THIS STAGE:\n${customInstructions}`
    : ""
}

RPG SYSTEM: ${config.rpgSystem}
${rpgDesc}

NSFW CONTENT: ${
    config.nsfw
      ? "Allowed - mature themes, violence, and adult content are permitted"
      : "Not allowed - keep content appropriate for general audiences"
  }

COMPLEXITY: ${config.complexity} (${config.targetDuration} duration)

CRITICAL INSTRUCTIONS:
1. Output ONLY valid JSON - no markdown, no explanations, no text before or after
2. Follow the exact schema provided for this stage
3. Be creative and thematic - every element should fit the adventure concept
4. Use appropriate emoji symbols for all items, stats, abilities, etc.
5. Ensure mechanical balance appropriate for the RPG system
6. Create interconnected elements that reference each other (lore triggers, variable conditions, etc.)`;

  // Stage-specific prompts
  if (stage === "core") {
    return `${basePrompt}

STAGE 1: CORE CONCEPT
Generate the foundational elements of the adventure.

OUTPUT JSON SCHEMA:
{
  "title": "string - compelling adventure title",
  "shortDescription": "string - 1-2 sentence hook for adventure cards (max 150 chars)",
  "description": "string - full multi-paragraph description (3-5 paragraphs)",
  "story_name": "string - in-game story title shown during gameplay",
  "premise": "string - the central conflict/situation (2-3 paragraphs)",
  "player_name": "string - default player character name",
  "player_summary": "string - player character background and description (2-3 paragraphs)",
  "intro": "string - opening narrative text shown at game start (3-5 paragraphs, immersive and atmospheric)",
  "author_notes": "string - private instructions for the AI narrator about tone, themes, dos and don'ts"
}

Remember: Output ONLY the JSON object, nothing else.`;
  }

  if (stage === "mechanics") {
    const statCount = Math.round(counts.stats * durationMultiplier);
    const resourceCount = Math.round(counts.resources * durationMultiplier);
    const abilityCount = Math.round(counts.abilities * durationMultiplier);

    return `${basePrompt}

STAGE 2: GAME MECHANICS
Generate stats, resources, abilities, and variables for the adventure.

TARGET COUNTS:
- Stats: ${statCount}
- Resources: ${resourceCount}
- Abilities: ${abilityCount}
- Variables: 3-6 (mix of number, boolean, string, and list types)

STAT VALUES (LEVEL 1 CHARACTER - START WEAK):
- Range: 1-100 where 50 is human average
- MOST stats should be below 25 (untrained/weak areas)
- A FEW stats (2-3) can be between 25-45 (developing skills)
- Only ONE or TWO stats around 60-70 (natural talent/specialty)
- The player will grow stronger through gameplay - start humble!

ABILITY GRADES (determine skill bonus):
- novice (+0), apprentice (+1), adept (+2), expert (+3), master (+4), legendary (+5)

ABILITY COSTS:
- type: "resource" (deducts from resource) or "variable" (deducts from number variable)
- name: exact name of the resource/variable
- amount: how much to deduct

OUTPUT JSON SCHEMA:
{
  "stats": [
    { "name": "string", "value": number, "description": "string", "symbol": "emoji" }
  ],
  "resources": [
    { "name": "string", "value": number, "maxValue": number, "description": "string", "symbol": "emoji" }
  ],
  "abilities": [
    {
      "name": "string",
      "description": "string",
      "grade": "novice|apprentice|adept|expert|master|legendary",
      "cost": [{ "type": "resource|variable", "name": "string", "amount": number }],
      "cooldown": number,
      "currentCooldown": 0,
      "stat": "string (optional - associated stat name)",
      "symbol": "emoji"
    }
  ],
  "variables": [
    { "id": "var_xxx", "name": "string", "description": "string", "type": "number", "value": number, "minValue": number, "maxValue": number }
    OR { "id": "var_xxx", "name": "string", "description": "string", "type": "boolean", "value": boolean }
    OR { "id": "var_xxx", "name": "string", "description": "string", "type": "string", "value": "string", "options": ["option1", "option2", ...] }
    OR { "id": "var_xxx", "name": "string", "description": "string", "type": "list", "items": [], "maxSize": number }
  ]
}

Remember: Output ONLY the JSON object, nothing else.`;
  }

  // CONTENT SUBSTAGES
  if (stage === "content-lore") {
    const contentIterations =
      config.contentIterations || DEFAULT_CONTENT_ITERATIONS;
    const loreCount = Math.round(
      counts.lore * durationMultiplier * contentIterations.lore
    );

    return `${basePrompt}

STAGE 3A: LORE & WORLD-BUILDING
Generate detailed lore entries that bring the world to life.

TARGET COUNT: ${loreCount} lore entries

LORE ENTRY GUIDELINES:
Create DETAILED, RICH lore entries. Each entry should be 2-4 paragraphs with specific names, dates, and vivid descriptions.

REQUIRED LORE CATEGORIES (distribute entries across all):

1. KEY NPCs (at least 3-4 entries):
   - Important characters the player will meet or hear about
   - Include their appearance, personality, motivations, secrets, and relationship to the main plot
   - **THREAT PROFILE (for hostile/potentially hostile NPCs):**
     * Challenge type and size (e.g., "Standard challenge - best of 5")
     * Approach difficulties (e.g., "Combat: hard, Stealth: average, Diplomacy: very_hard")
     * Failure condition (e.g., "Inflicts Slash Wound Tier II on failed combat checks")
     * Challenge loss stakes (e.g., "Challenge Loss: Beaten Bloody Tier IV")

2. LOCATIONS (at least 3-4 entries):
   - Major places in the world (cities, dungeons, landmarks)
   - Describe atmosphere, notable features, dangers, and history
   - **ENVIRONMENTAL HAZARDS:** If dangerous, include threat profile:
     * Hazard type (poison gas, traps, extreme weather)
     * Failure condition (e.g., "Failed navigation: Exhausted Tier I, escalates each failure")

3. FACTIONS & ORGANIZATIONS (at least 2-3 entries):
   - Groups with power and influence in the world
   - Their goals, methods, leaders, symbols, and relationship to other factions
   - **FACTION THREAT LEVEL:** General danger when opposing them

4. HISTORY & PAST EVENTS (at least 2-3 entries):
   - Important historical events that shaped the current world
   - Ancient wars, fallen kingdoms, legendary heroes, catastrophes

5. THREATS & MONSTERS (at least 2-3 entries):
   - Dangerous creatures, enemies, or challenges the player may face
   - **MANDATORY THREAT PROFILE:**
     * Challenge difficulty: quick (3 rounds), standard (5), extended (7), epic (9)
     * Approach difficulties for different strategies
     * Per-failure condition (what happens when player fails a check DURING combat)
     * Challenge loss stakes (what severe condition they inflict on total defeat)
   - Example:
     > **The Ironclad Knight** - A heavily armored warrior guarding the eastern gate.
     > THREAT PROFILE:
     > - Challenge: Standard (best of 5)
     > - Combat approach: Hard DC
     > - Stealth approach: Very Hard DC (keen senses)
     > - Social approach: Average DC (honorable, can be reasoned with)
     > - Per-failure: Battered Tier II (his heavy blows leave you reeling)
     > - Challenge Loss: Broken Body Tier IV (beaten into submission)

6. WORLD LORE (remaining entries):
   - Magic systems, religions, customs, creatures, artifacts

LORE TRIGGERS (make lore dynamic):
- on_triggers: words/phrases that reveal this lore when mentioned
  IMPORTANT: Include variations for word boundaries ["gun", "guns", "pistol", "pistols"]
- secrtet: true for hidden lore the AI knows but player hasn't discovered
- alwaysOn: true for fundamental world facts

CRITICAL: EVERY lore entry MUST have on_triggers with 3-5 variations OR set alwaysOn=true!

OUTPUT JSON SCHEMA:
{
  "lore": [
    {
      "title": "string",
      "content": "string (2-4 DETAILED paragraphs)",
      "secrtet": false,
      "on": false,
      "alwaysOn": false,
      "on_triggers": ["trigger1", "trigger2", "trigger3"],
      "off_triggers": [],
      "var_on_triggers": []
    }
  ]
}

Remember: Output ONLY the JSON object, nothing else.`;
  }

  if (stage === "content-achievements") {
    const contentIterations =
      config.contentIterations || DEFAULT_CONTENT_ITERATIONS;
    const achievementCount = Math.round(
      counts.achievements * durationMultiplier * contentIterations.achievements
    );
    const questCount = Math.round(
      counts.quests * durationMultiplier * contentIterations.quests
    );

    return `${basePrompt}

STAGE 3B: GOALS & MILESTONES
Generate achievements and quests.

TARGET COUNTS:
- Achievements: ${achievementCount}
- Quests: ${questCount}

OUTPUT JSON SCHEMA:
{
  "achievements": [
    { "title": "string", "description": "string (player-facing)", "ai_hint": "string (precise trigger conditions for AI)", "points": number, "symbol": "emoji", "dateAchieved": null }
  ],
  "quests": [
    { "id": "quest_xxx", "title": "string", "shortDescription": "string", "description": "string", "points": number, "active": boolean, "fulfilled": false }
  ]
}

Remember: Output ONLY the JSON object, nothing else.`;
  }

  if (stage === "content-items") {
    const contentIterations =
      config.contentIterations || DEFAULT_CONTENT_ITERATIONS;
    const inventoryCount = Math.round(3 * contentIterations.inventory);
    const relationshipCount = Math.round(
      counts.relationships *
        durationMultiplier *
        contentIterations.relationships
    );

    return `${basePrompt}

STAGE 3C: ITEMS & RELATIONSHIPS
Generate starting inventory and NPC relationships.

TARGET COUNTS:
- Starting Inventory: ${inventoryCount}-${inventoryCount + 2} items
- Relationships: ${relationshipCount}

ITEM TYPES:
- "normal": Gives advantage on skill checks, breaks on critical failure
- "consumable": Gives advantage, consumed after use
- "story": Gives advantage, never breaks/consumed (quest items)
- "misc": Prevents disadvantage, never breaks/consumed

ITEM GRADES (rarity):
- "common" (+0 bonus, 8 durability)
- "uncommon" (+1, 13 dur)
- "rare" (+2, 20 dur)
- "epic" (+3, 30 dur)
- "legendary" (+4, 50 dur)
- "agmt" (+5, infinite dur)

RELATIONSHIP VALUES: -100 (mortal enemy) to +100 (devoted ally)

OUTPUT JSON SCHEMA:
{
  "inventory": [
    { "name": "string", "quantity": number, "description": "string", "type": "normal|consumable|story|misc", "grade": "common|uncommon|rare|epic|legendary|agmt", "symbol": "emoji" }
  ],
  "relationships": [
    { "name": "string", "value": number, "description": "string", "symbol": "emoji" }
  ]
}

Remember: Output ONLY the JSON object, nothing else.`;
  }

  // ADVANCED SUBSTAGES
  if (stage === "advanced-presets") {
    const presetCount = config.includePresets
      ? Math.round(counts.presets * durationMultiplier)
      : 0;

    if (!config.includePresets || presetCount === 0) {
      return `${basePrompt}

STAGE 4A: CHARACTER PRESETS
Character presets are not enabled for this adventure.

OUTPUT JSON SCHEMA:
{}

Output an empty JSON object.`;
    }

    return `${basePrompt}

STAGE 4A: CHARACTER PRESETS
Generate ${presetCount} different character builds/classes.

Each preset offers a meaningfully different playstyle with unique stats, resources, inventory, and abilities.

IMPORTANT: Each preset MUST include abilities. Use abilities from the mechanics stage as a base.

CRITICAL - PRESET INTROS:
The "intro" field is a COMPLETE REPLACEMENT for the default intro (3-5 paragraphs).
The "playerSummary" is also a COMPLETE REPLACEMENT (2-3 paragraphs).

REQUIRED - "CUSTOM" PRESET:
You MUST include a preset with id="preset-custom" and name="Custom" as the LAST preset.
This is for players who want to create their own character (self-insert).
- Use the same stat guidelines: most below 25, a few between 25-45, one or two around 60-70
- Generic playerName like "Adventurer" or "Traveler"
- playerSummary should be vague and open-ended ("A mysterious stranger...")
- intro should be generic, letting the player define their own backstory
- Include basic starting gear and no special abilities beyond novice level

STAT VALUES FOR PRESETS (LEVEL 1 CHARACTERS - START WEAK):
- Range: 1-100 where 50 is human average
- MOST stats should be below 25 (untrained/weak areas)
- A FEW stats (2-3) can be between 25-45 (developing skills)
- Only ONE or TWO stats around 60-70 (natural talent/specialty)

OUTPUT JSON SCHEMA:
{
  "presets": [
    {
      "id": "preset-xxx",
      "name": "string",
      "description": "string (1-2 sentence hook)",
      "icon": "emoji",
      "playerName": "string",
      "playerSummary": "string (2-3 paragraphs)",
      "intro": "string (3-5 paragraphs - COMPLETE opening narrative)",
      "stats": [{ "name": "string", "value": number, "description": "string", "symbol": "emoji" }],
      "resources": [{ "name": "string", "value": number, "maxValue": number, "description": "string", "symbol": "emoji" }],
      "inventory": [{ "name": "string", "quantity": number, "description": "string", "type": "string", "grade": "string", "symbol": "emoji" }],
      "abilities": [{ "name": "string", "description": "string", "grade": "string", "cost": [], "cooldown": number, "currentCooldown": 0, "symbol": "emoji" }],
      "authorNotes": "string"
    }
  ]
}

Remember: Output ONLY the JSON object, nothing else.`;
  }

  if (stage === "advanced-tables") {
    const tableCount = config.includeCustomTables
      ? Math.round(counts.customTables * durationMultiplier)
      : 0;

    const schemaFields: string[] = [];
    let instructions = "";

    if (config.includeAGMT) {
      instructions += `
Advanced RPG Tools STATE:
Initialize the AGMT Game Master Emulator for solo/GM-less play.
- chaosFactor: 1-9 (5 is default)
- threads: Active narrative threads/plotlines
- characters: Important NPCs
`;
      schemaFields.push(`"agmtState": {
    "chaosFactor": number,
    "sceneCount": 0,
    "threads": [{ "id": "thread_xxx", "description": "string", "status": "active" }],
    "characters": [{ "id": "char_xxx", "name": "string", "role": "string", "status": "active" }],
    "skillCheckHistory": [],
    "currentStreak": 0,
    "lastChaosAdjustment": 0
  }`);
    }

    if (config.includeCustomTables && tableCount > 0) {
      instructions += `
CUSTOM RANDOM TABLES (${tableCount}):
Each table MUST have 20-50 entries for proper variety.
Each entry has a weight (1-10, higher = more likely).
`;
      schemaFields.push(`"customTables": [
    {
      "id": "table_xxx",
      "name": "string",
      "description": "string",
      "entries": [{ "text": "string", "weight": number }]
    }
  ]`);
    }

    if (schemaFields.length === 0) {
      return `${basePrompt}

STAGE 4B: RANDOM TABLES & MYTHIC
No tables or AGMT features are enabled.

OUTPUT JSON SCHEMA:
{}

Output an empty JSON object.`;
    }

    return `${basePrompt}

STAGE 4B: RANDOM TABLES & MYTHIC
${instructions}

OUTPUT JSON SCHEMA:
{
  ${schemaFields.join(",\n  ")}
}

Remember: Output ONLY the JSON object, nothing else.`;
  }

  if (stage === "advanced-skilltrees") {
    // Determine number of trees based on complexity
    const treeCount =
      config.complexity === "complex"
        ? 3
        : config.complexity === "moderate"
        ? 2
        : 1;
    const nodesPerTree =
      config.complexity === "complex"
        ? 12
        : config.complexity === "moderate"
        ? 8
        : 5;

    return `${basePrompt}

STAGE 4B: SKILL TREES
Create ${treeCount} thematic skill tree(s) for character progression.

SKILL TREE DESIGN:
- Each tree should have ${nodesPerTree} nodes arranged in a tree structure
- Root nodes (prerequisites: []) should be at y: 10-20
- Child nodes should flow downward (higher y values)
- Space nodes horizontally (x: 0-100) to prevent overlap
- Create meaningful progression paths with prerequisites
- Trees should be thematic (e.g., Combat, Magic, Stealth, Social)

NODE TYPES AND EFFECTS:
- stat: Grants permanent stat bonuses (e.g., +5 Strength)
- resource: Increases max resource capacity (e.g., +20 Health max)
- ability: Unlocks new abilities with full abilityData
- item: Grants items with full itemData
- passive: Provides persistent bonuses described in the target field

IMPORTANT:
- When skill trees are enabled, they REPLACE simple stat/resource upgrades
- Each node costs 1 upgrade point to unlock
- Players can respec (reset) their tree to try different paths
- Design for player choice and build diversity

OUTPUT JSON SCHEMA:
{
  "skillTrees": [
    {
      "id": "tree_xxx",
      "name": "Tree Name",
      "description": "What this tree represents",
      "symbol": "emoji",
      "nodes": [
        {
          "id": "node_xxx",
          "name": "Node Name",
          "description": "What this node grants",
          "symbol": "emoji",
          "type": "stat|ability|item|passive|resource",
          "position": { "x": 0-100, "y": 0-100 },
          "prerequisites": ["node_id"] or [],
          "effects": [
            { "type": "stat_bonus", "target": "StatName", "value": number },
            { "type": "resource_bonus", "target": "ResourceName", "value": number },
            { "type": "grant_ability", "target": "AbilityName", "abilityData": { "name": "string", "description": "string", "grade": "string", "cost": [], "cooldown": number, "currentCooldown": 0, "symbol": "emoji" } },
            { "type": "grant_item", "target": "ItemName", "quantity": number, "itemData": { "name": "string", "description": "string", "type": "string", "symbol": "emoji", "quantity": number, "grade": "string" } },
            { "type": "passive", "target": "Passive Name: Description of the passive effect" }
          ]
        }
      ]
    }
  ]
}

Remember: Output ONLY the JSON object, nothing else.`;
  }

  if (stage === "advanced-other") {
    const shopItemCount = config.includeUpgradeShop
      ? Math.round(counts.shopItems * durationMultiplier)
      : 0;

    const schemaFields: string[] = [];
    let instructions = "";

    // Always include leveling settings
    instructions += `
LEVELING CURVE & UPGRADES:
Configure how quickly players level up and how many upgrade points they receive.
- xpBase: Higher = slower leveling (default 100)
- levelCap: Maximum level (default 100)  
- defaultUpgradesPerLevel: Upgrade points per level (default 1)
- upgradeOverrides: Bonus points at milestone levels (e.g., level 5, 10, etc.)
- startingUpgrades: Override starting upgrade points per difficulty (easy=3, medium=2, hard=1, expert=0)
`;
    schemaFields.push(`"levelingSettings": {
    "xpBase": number,
    "levelCap": number,
    "defaultUpgradesPerLevel": number,
    "upgradeOverrides": [{ "level": number, "upgrades": number }],
    "startingUpgrades": { "easy": number, "medium": number, "hard": number, "expert": number }
  }`);

    if (config.includeUpgradeShop && shopItemCount > 0) {
      instructions += `
UPGRADE SHOP (${shopItemCount} total items):
Configure the progression/upgrade system where players spend points.

STAT VALUES: Range 1-100 where 50 is human average.
`;
      schemaFields.push(`"upgradeSettings": {
    "enabled": true,
    "allowStatUpgrade": true,
    "allowResourceUpgrade": true,
    "allowAddItem": true,
    "statUpgradeCost": 10,
    "statUpgradeAmount": 1,
    "resourceUpgradeCost": 15,
    "resourceUpgradeAmount": 10,
    "addItemCost": 20,
    "statShopEnabled": boolean,
    "resourceShopEnabled": boolean,
    "itemShopEnabled": boolean,
    "abilityShopEnabled": boolean,
    "statShop": [{ "name": "string", "description": "string", "symbol": "emoji", "startingValue": number, "cost": number }],
    "resourceShop": [{ "name": "string", "description": "string", "symbol": "emoji", "startingValue": number, "startingMaxValue": number, "cost": number }],
    "itemShop": [{ "name": "string", "description": "string", "type": "string", "symbol": "emoji", "quantity": number, "cost": number, "grade": "string" }],
    "abilityShop": [{ "name": "string", "description": "string", "symbol": "emoji", "grade": "string", "cost": number, "abilityCost": [], "cooldown": number }]
  }`);
    }

    if (config.includeStartingChoices) {
      instructions += `
STARTING CHOICES (2-4):
Custom starting choices instead of "Start Story".
`;
      schemaFields.push(`"startingChoices": [
    {
      "text": "string",
      "intro_override": "string (optional alternate intro)",
      "skill_used": "string (optional)",
      "skill_dc": "tier name: trivial|easy|average|hard|very_hard|impossible (optional)",
      "resource_used": "string (optional)",
      "item_used": "string (optional)"
    }
  ]`);
    }

    if (schemaFields.length === 0) {
      return `${basePrompt}

STAGE 4C: UPGRADES & STARTING CHOICES
No upgrade shop or starting choices are enabled.

OUTPUT JSON SCHEMA:
{}

Output an empty JSON object.`;
    }

    return `${basePrompt}

STAGE 4C: UPGRADES & STARTING CHOICES
${instructions}

OUTPUT JSON SCHEMA:
{
  ${schemaFields.join(",\n  ")}
}

Remember: Output ONLY the JSON object, nothing else.`;
  }

  if (stage === "icons") {
    // Build the icon list - all 4000+ icons
    const iconList = ALL_GAME_ICON_IDS.join(", ");

    return `You are assigning thematic icons to adventure elements.

TASK: Review all elements that need icons and assign appropriate icons from the available list.

AVAILABLE ICONS (${ALL_GAME_ICON_IDS.length} total):
${iconList}

ELEMENTS THAT NEED ICONS:
You will receive a list of stats, resources, items, abilities, achievements, and relationships.
For each element, choose the most thematically appropriate icon from the list above.

GUIDELINES:
- Match icons to the element's theme/function (e.g., "Health" → "heart", "Strength" → "muscle-up")
- For weapons, use specific weapon icons (e.g., "sword", "bow-arrow", "axe")
- For magic, use mystical icons (e.g., "magic-swirl", "crystal-ball", "spell-book")
- For creatures, use creature icons (e.g., "dragon-head", "wolf-head", "skull")
- Be creative but thematic - the icon should represent what the element does
- If no perfect match exists, choose the closest thematic option

OUTPUT JSON SCHEMA:
{
  "iconAssignments": {
    "stats": { "StatName": "icon-id", ... },
    "resources": { "ResourceName": "icon-id", ... },
    "inventory": { "ItemName": "icon-id", ... },
    "abilities": { "AbilityName": "icon-id", ... },
    "achievements": { "AchievementTitle": "icon-id", ... },
    "relationships": { "NPCName": "icon-id", ... },
    "presets": { "PresetName": "icon-id", ... },
    "skillTrees": { "TreeName": "icon-id", ... },
    "skillTreeNodes": { "TreeName:NodeName": "icon-id", ... }
  }
}

Output ONLY valid JSON matching the schema. Include only elements that exist in the adventure.`;
  }

  // Fallback - should never reach here
  return `${basePrompt}

Unknown stage: ${stage}

OUTPUT JSON SCHEMA:
{}`;
}

/**
 * Build messages for a generation stage
 */
export function buildBigAdventureMessages(
  config: BigAdventureConfig,
  stage: GenerationStage,
  previousResults?: Partial<BigAdventureResult>
): ChatMessage[] {
  const systemPrompt = buildSystemPrompt(config, stage);

  const messages: ChatMessage[] = [{ role: "system", content: systemPrompt }];

  // Add context from previous stages
  if (previousResults && stage !== "core") {
    let contextMessage = "PREVIOUSLY GENERATED CONTENT:\n\n";

    if (previousResults.title) {
      contextMessage += `Title: ${previousResults.title}\n`;
    }
    if (previousResults.shortDescription) {
      contextMessage += `Short Description: ${previousResults.shortDescription}\n`;
    }
    if (previousResults.storyTemplate?.premise) {
      contextMessage += `Premise: ${previousResults.storyTemplate.premise}\n\n`;
    }
    if (
      previousResults.storyTemplate?.stats &&
      previousResults.storyTemplate.stats.length > 0
    ) {
      // For advanced-presets stage, include full stat details for preset creation
      if (stage === "advanced-presets") {
        contextMessage += `\nStats (use these for presets, adjust values per build):\n`;
        previousResults.storyTemplate.stats.forEach((s) => {
          contextMessage += `- ${s.name} (${s.symbol || "📊"}): ${
            s.description || "No description"
          } [Default: ${s.value}]\n`;
        });
      } else {
        contextMessage += `Stats: ${previousResults.storyTemplate.stats
          .map((s) => s.name)
          .join(", ")}\n`;
      }
    }
    if (
      previousResults.storyTemplate?.resources &&
      previousResults.storyTemplate.resources.length > 0
    ) {
      // For advanced-presets stage, include full resource details for preset creation
      if (stage === "advanced-presets") {
        contextMessage += `\nResources (use these for presets, adjust values per build):\n`;
        previousResults.storyTemplate.resources.forEach((r) => {
          contextMessage += `- ${r.name} (${r.symbol || "📦"}): ${
            r.description || "No description"
          } [Default: ${r.value}/${r.maxValue}]\n`;
        });
      } else {
        contextMessage += `Resources: ${previousResults.storyTemplate.resources
          .map((r) => r.name)
          .join(", ")}\n`;
      }
    }
    if (
      previousResults.storyTemplate?.abilities &&
      previousResults.storyTemplate.abilities.length > 0
    ) {
      contextMessage += `\nAbilities:\n`;
      previousResults.storyTemplate.abilities.forEach((a) => {
        contextMessage += `- ${a.name} (${a.grade || "novice"}): ${
          a.description || "No description"
        }`;
        if (a.cost && a.cost.length > 0) {
          contextMessage += ` [Cost: ${a.cost
            .map((c) => `${c.amount} ${c.name}`)
            .join(", ")}]`;
        }
        if (a.cooldown) {
          contextMessage += ` [Cooldown: ${a.cooldown} turns]`;
        }
        contextMessage += `\n`;
      });
    }
    if (
      previousResults.storyTemplate?.variables &&
      previousResults.storyTemplate.variables.length > 0
    ) {
      contextMessage += `Variables: ${previousResults.storyTemplate.variables
        .map((v) => v.name)
        .join(", ")}\n`;
    }

    contextMessage +=
      "\nUse this context to create thematically consistent content. Reference these elements where appropriate.";

    messages.push({ role: "user", content: contextMessage });
    messages.push({
      role: "assistant",
      content:
        "I understand the adventure context. I'll generate content that integrates with the established elements.",
    });
  }

  // Special handling for icons stage - list all elements that need icons
  if (stage === "icons" && previousResults?.storyTemplate) {
    const template = previousResults.storyTemplate;
    let elementsMessage = "ELEMENTS THAT NEED ICONS:\n\n";

    if (template.stats && template.stats.length > 0) {
      elementsMessage += `STATS:\n`;
      template.stats.forEach((s) => {
        elementsMessage += `- "${s.name}": ${
          s.description || "No description"
        }\n`;
      });
      elementsMessage += "\n";
    }

    if (template.resources && template.resources.length > 0) {
      elementsMessage += `RESOURCES:\n`;
      template.resources.forEach((r) => {
        elementsMessage += `- "${r.name}": ${
          r.description || "No description"
        }\n`;
      });
      elementsMessage += "\n";
    }

    if (template.inventory && template.inventory.length > 0) {
      elementsMessage += `INVENTORY ITEMS:\n`;
      template.inventory.forEach((i) => {
        elementsMessage += `- "${i.name}": ${
          i.description || "No description"
        } (${i.type})\n`;
      });
      elementsMessage += "\n";
    }

    if (template.abilities && template.abilities.length > 0) {
      elementsMessage += `ABILITIES:\n`;
      template.abilities.forEach((a) => {
        elementsMessage += `- "${a.name}": ${
          a.description || "No description"
        }\n`;
      });
      elementsMessage += "\n";
    }

    if (template.achievements && template.achievements.length > 0) {
      elementsMessage += `ACHIEVEMENTS:\n`;
      template.achievements.forEach((a) => {
        elementsMessage += `- "${a.title}": ${
          a.description || "No description"
        }\n`;
      });
      elementsMessage += "\n";
    }

    if (template.relationships && template.relationships.length > 0) {
      elementsMessage += `RELATIONSHIPS:\n`;
      template.relationships.forEach((r) => {
        elementsMessage += `- "${r.name}": ${
          r.description || "No description"
        }\n`;
      });
      elementsMessage += "\n";
    }

    if (template.presets && template.presets.length > 0) {
      elementsMessage += `PRESETS (character builds):\n`;
      template.presets.forEach((p) => {
        elementsMessage += `- "${p.name}": ${
          p.description || "No description"
        }\n`;
      });
      elementsMessage += "\n";
    }

    if (template.skillTrees && template.skillTrees.length > 0) {
      elementsMessage += `SKILL TREES:\n`;
      template.skillTrees.forEach((tree) => {
        elementsMessage += `- "${tree.name}": ${
          tree.description || "No description"
        }\n`;
        if (tree.nodes && tree.nodes.length > 0) {
          elementsMessage += `  NODES:\n`;
          tree.nodes.forEach((node) => {
            elementsMessage += `  - "${tree.name}:${node.name}": ${
              node.description || "No description"
            } (${node.type})\n`;
          });
        }
      });
      elementsMessage += "\n";
    }

    elementsMessage +=
      "Assign an appropriate icon from the available list to each element above.";

    messages.push({ role: "user", content: elementsMessage });
  }

  // Final user message to trigger generation
  messages.push({
    role: "user",
    content: `Generate the ${
      getStageInfo(stage).name
    } for this adventure. Output ONLY valid JSON matching the schema provided.`,
  });

  return messages;
}

/**
 * Check if JSON content appears to be incomplete (cut off mid-generation)
 * Returns info about the incomplete state if detected
 */
export function detectIncompleteJSON(content: string): {
  isIncomplete: boolean;
  lastValidPosition: number;
  truncatedContent: string;
} {
  let jsonContent = content.trim();

  // Remove markdown code blocks if present
  const jsonBlockMatch = jsonContent.match(
    /```(?:json)?\s*([\s\S]*?)(?:\s*```)?$/
  );
  if (jsonBlockMatch) {
    jsonContent = jsonBlockMatch[1].trim();
  }

  // Find JSON start
  const startIndex = jsonContent.indexOf("{");
  if (startIndex === -1) {
    return {
      isIncomplete: true,
      lastValidPosition: 0,
      truncatedContent: jsonContent,
    };
  }

  // Count brackets to detect incomplete JSON
  let braceCount = 0;
  let bracketCount = 0;
  let inString = false;
  let escaped = false;
  let lastValidPosition = startIndex;

  for (let i = startIndex; i < jsonContent.length; i++) {
    const char = jsonContent[i];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === "\\") {
      escaped = true;
      continue;
    }

    if (char === '"' && !escaped) {
      inString = !inString;
      continue;
    }

    if (!inString) {
      if (char === "{") braceCount++;
      else if (char === "}") {
        braceCount--;
        if (braceCount === 0) lastValidPosition = i;
      } else if (char === "[") bracketCount++;
      else if (char === "]") bracketCount--;
    }
  }

  // JSON is incomplete if braces/brackets don't balance
  const isIncomplete = braceCount !== 0 || bracketCount !== 0 || inString;

  return {
    isIncomplete,
    lastValidPosition,
    truncatedContent: jsonContent.slice(startIndex),
  };
}

/**
 * Build a repair prompt to close truncated JSON without generating more content.
 * This is cheaper than continuation - we just want valid parseable JSON.
 */
export function buildContinuationPrompt(
  truncatedContent: string,
  _stage: GenerationStage
): string {
  // Get the last ~800 characters to provide context for closing
  const contextLength = Math.min(800, truncatedContent.length);
  const lastContent = truncatedContent.slice(-contextLength);

  return `Your previous response was cut off. Here's the end of what you generated:

...${lastContent}

CRITICAL INSTRUCTIONS:
1. DO NOT generate any new content items
2. Just close/finish the current JSON object so it's valid
3. If you're mid-string, close the string with "
4. Close any open arrays with ]
5. Close any open objects with }
6. Output ONLY the closing characters needed - nothing else

Example: if cut off at {"name": "Test, your output should be: "}
Example: if cut off at [{"a":1},{"b":2, your output should be: }]

Output ONLY the minimal characters to make the JSON valid.`;
}

/**
 * Attempt to repair incomplete or malformed JSON
 * This is a best-effort fallback that handles:
 * - Unclosed brackets/braces
 * - Malformed property names (e.g., `" "name"` instead of `"name"`)
 * - Markdown code blocks
 */
export function attemptJSONRepair(content: string): string {
  let jsonContent = content.trim();

  // Remove markdown code blocks if present (at start/end)
  const jsonBlockMatch = jsonContent.match(
    /```(?:json)?\s*([\s\S]*?)(?:\s*```)?$/
  );
  if (jsonBlockMatch) {
    jsonContent = jsonBlockMatch[1].trim();
  }

  // Remove ALL embedded markdown code block markers that may appear mid-JSON
  // This handles cases where AI inserts ```json mid-response
  jsonContent = jsonContent.replace(/```json\s*/gi, "");
  jsonContent = jsonContent.replace(/```\s*/g, "");

  // Fix malformed property names like `" "name"` or `"  "name"` -> `"name"`
  // This handles AI mistakes where a space appears before the property name
  jsonContent = jsonContent.replace(/"[ \t]+"([^"]+)"(\s*:)/g, '"$1"$2');

  // Fix cases like `" "name":` (orphaned quote with space before actual name)
  jsonContent = jsonContent.replace(/"[ \t]+"/g, '"');

  const startIndex = jsonContent.indexOf("{");
  if (startIndex === -1) return jsonContent;

  jsonContent = jsonContent.slice(startIndex);

  // Track what needs closing
  const stack: string[] = [];
  let inString = false;
  let escaped = false;
  let lastValidPosition = 0; // Last position where JSON was structurally valid

  for (let i = 0; i < jsonContent.length; i++) {
    const char = jsonContent[i];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === "\\") {
      escaped = true;
      continue;
    }

    if (char === '"' && !escaped) {
      inString = !inString;
      if (!inString) {
        // Just closed a string - check if this completes a valid element
        const nextNonSpace = jsonContent.slice(i + 1).match(/^\s*([,}\]:])/);
        if (nextNonSpace) {
          lastValidPosition = i;
        }
      }
      continue;
    }

    if (!inString) {
      if (char === "{") {
        stack.push("}");
      } else if (char === "[") {
        stack.push("]");
      } else if (char === "}" || char === "]") {
        if (stack.length > 0 && stack[stack.length - 1] === char) {
          stack.pop();
          lastValidPosition = i;
        }
      } else if (char === ",") {
        // After a comma is a good truncation point if followed by valid content
        lastValidPosition = i;
      }
    }
  }

  // If we're in an unterminated string or have unclosed brackets, truncate to last valid position
  if (inString || stack.length > 0) {
    // Find the last complete array/object element before truncation
    // Look for patterns like: }, or }, { or ], or ]
    const truncated = jsonContent.slice(0, lastValidPosition + 1);

    // Remove any trailing partial element after a comma
    // This handles cases like: [..., {"name": "test", "value":
    let cleaned = truncated.replace(/,\s*\{[^}]*$/, ""); // Partial object at end of array
    cleaned = cleaned.replace(/,\s*\[[^\]]*$/, ""); // Partial array at end
    cleaned = cleaned.replace(/,\s*"[^"]*"?\s*:?\s*(?:"[^"]*)?$/, ""); // Partial key-value
    cleaned = cleaned.replace(/,\s*$/, ""); // Trailing comma

    jsonContent = cleaned;

    // Recount stack after truncation
    stack.length = 0;
    inString = false;
    escaped = false;
    for (let i = 0; i < jsonContent.length; i++) {
      const char = jsonContent[i];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === "\\") {
        escaped = true;
        continue;
      }
      if (char === '"') {
        inString = !inString;
        continue;
      }
      if (!inString) {
        if (char === "{") stack.push("}");
        else if (char === "[") stack.push("]");
        else if (char === "}" || char === "]") {
          if (stack.length > 0) stack.pop();
        }
      }
    }
  }

  // Final cleanup - remove trailing incomplete elements more aggressively
  // Handle case where we have a trailing comma before closing bracket
  jsonContent = jsonContent.replace(/,(\s*[}\]])/, "$1");

  // Close remaining brackets/braces
  while (stack.length > 0) {
    jsonContent += stack.pop();
  }

  return jsonContent;
}

/**
 * Parse the JSON response from a stage
 * Returns result and whether the content appeared truncated
 */
export function parseBigAdventureStageOutput(
  content: string,
  stage: GenerationStage
): Partial<BigAdventureResult> | null {
  try {
    // Try to extract JSON from the response
    let jsonContent = content.trim();

    // Remove markdown code blocks if present
    const jsonBlockMatch = jsonContent.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (jsonBlockMatch) {
      jsonContent = jsonBlockMatch[1].trim();
    }

    // Remove ALL embedded markdown code block markers that may appear mid-JSON
    // This handles cases where AI inserts ```json mid-response
    jsonContent = jsonContent.replace(/```json\s*/gi, "");
    jsonContent = jsonContent.replace(/```\s*/g, "");

    // Try to find JSON object boundaries
    const startIndex = jsonContent.indexOf("{");
    const endIndex = jsonContent.lastIndexOf("}");
    if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
      jsonContent = jsonContent.slice(startIndex, endIndex + 1);
    }

    // Parsing chain: JSON -> JSON5 -> repair+JSON -> repair+JSON5
    let parsed;
    try {
      parsed = JSON.parse(jsonContent);
    } catch (jsonError) {
      try {
        // Lenient JSON5 parse (handles trailing commas, unquoted keys, etc.)
        parsed = JSON5.parse(jsonContent);
        console.log("JSON5 parse successful (lenient mode)");
      } catch (json5Error) {
        console.warn("Initial parsing failed, attempting repair...");
        const repairedContent = attemptJSONRepair(content);
        try {
          parsed = JSON.parse(repairedContent);
          console.log("JSON repair successful!");
        } catch (repairJsonError) {
          try {
            parsed = JSON5.parse(repairedContent);
            console.log("JSON5 parse of repaired content successful!");
          } catch (repairJson5Error) {
            throw jsonError;
          }
        }
      }
    }

    // Map the parsed content to BigAdventureResult based on stage
    if (stage === "core") {
      return {
        title: parsed.title,
        shortDescription: parsed.shortDescription,
        description: parsed.description,
        storyTemplate: {
          story_name: parsed.story_name,
          premise: parsed.premise,
          player_name: parsed.player_name,
          player_summary: parsed.player_summary,
          intro: parsed.intro,
          author_notes: parsed.author_notes,
        },
      };
    }

    if (stage === "mechanics") {
      return {
        storyTemplate: {
          stats: parsed.stats,
          resources: parsed.resources,
          abilities: parsed.abilities,
          variables: parsed.variables,
        },
      };
    }

    // Content substages
    if (stage === "content-lore") {
      return {
        storyTemplate: {
          lore: parsed.lore,
        },
      };
    }

    if (stage === "content-achievements") {
      return {
        storyTemplate: {
          achievements: parsed.achievements,
          quests: parsed.quests,
        },
      };
    }

    if (stage === "content-items") {
      return {
        storyTemplate: {
          inventory: parsed.inventory,
          relationships: parsed.relationships,
        },
      };
    }

    // Advanced substages
    if (stage === "advanced-presets") {
      return {
        storyTemplate: {
          presets: parsed.presets,
        },
      };
    }

    if (stage === "advanced-tables") {
      return {
        storyTemplate: {
          agmtState: parsed.agmtState,
          customTables: parsed.customTables,
        },
      };
    }

    if (stage === "advanced-skilltrees") {
      return {
        storyTemplate: {
          skillTrees: parsed.skillTrees,
        },
      };
    }

    if (stage === "advanced-other") {
      return {
        storyTemplate: {
          upgradeSettings: parsed.upgradeSettings,
          levelingSettings: parsed.levelingSettings,
        },
        startingChoices: parsed.startingChoices,
      };
    }

    // Icons stage returns icon assignments to be applied to elements
    if (stage === "icons") {
      return {
        iconAssignments: parsed.iconAssignments,
      };
    }

    return null;
  } catch (e) {
    console.error("Failed to parse big adventure stage output:", e);
    console.error("Raw content:", content);
    return null;
  }
}

/**
 * Merge results from all stages into a complete adventure
 */
export function mergeBigAdventureResults(
  ...results: (Partial<BigAdventureResult> | null)[]
): BigAdventureResult {
  const merged: BigAdventureResult = {
    title: "",
    shortDescription: "",
    description: "",
    storyTemplate: {
      story_name: "",
      premise: "",
      player_name: "Adventurer",
      player_summary: "",
      intro: "",
      memory: [],
      max_chapters: 10,
      currentChapter: 1,
      chapters: [],
      scene: { parts: [] },
      stats: [],
      resources: [],
      inventory: [],
      abilities: [],
      achievements: [],
      lore: [],
      momentum: 0,
      maxMomentum: 5,
      points: 0,
      earnedPointsFromChapters: [],
      quests: [],
      earnedPointsFromQuests: [],
      relationships: [],
      conditions: [],
    },
  };

  for (const result of results) {
    if (!result) continue;

    if (result.title) merged.title = result.title;
    if (result.shortDescription)
      merged.shortDescription = result.shortDescription;
    if (result.description) merged.description = result.description;
    if (result.startingChoices) merged.startingChoices = result.startingChoices;

    if (result.storyTemplate) {
      merged.storyTemplate = {
        ...merged.storyTemplate,
        ...result.storyTemplate,
      };
    }

    // Apply icon assignments to elements
    if (result.iconAssignments) {
      const assignments = result.iconAssignments;

      // Apply to stats
      if (assignments.stats && merged.storyTemplate.stats) {
        merged.storyTemplate.stats = merged.storyTemplate.stats.map((stat) => ({
          ...stat,
          symbol: assignments.stats![stat.name] || stat.symbol,
        }));
      }

      // Apply to resources
      if (assignments.resources && merged.storyTemplate.resources) {
        merged.storyTemplate.resources = merged.storyTemplate.resources.map(
          (resource) => ({
            ...resource,
            symbol: assignments.resources![resource.name] || resource.symbol,
          })
        );
      }

      // Apply to inventory
      if (assignments.inventory && merged.storyTemplate.inventory) {
        merged.storyTemplate.inventory = merged.storyTemplate.inventory.map(
          (item) => ({
            ...item,
            symbol: assignments.inventory![item.name] || item.symbol,
          })
        );
      }

      // Apply to abilities
      if (assignments.abilities && merged.storyTemplate.abilities) {
        merged.storyTemplate.abilities = merged.storyTemplate.abilities.map(
          (ability) => ({
            ...ability,
            symbol: assignments.abilities![ability.name] || ability.symbol,
          })
        );
      }

      // Apply to achievements
      if (assignments.achievements && merged.storyTemplate.achievements) {
        merged.storyTemplate.achievements =
          merged.storyTemplate.achievements.map((achievement) => ({
            ...achievement,
            symbol:
              assignments.achievements![achievement.title] ||
              achievement.symbol,
          }));
      }

      // Apply to relationships
      if (assignments.relationships && merged.storyTemplate.relationships) {
        merged.storyTemplate.relationships =
          merged.storyTemplate.relationships.map((relationship) => ({
            ...relationship,
            symbol:
              assignments.relationships![relationship.name] ||
              relationship.symbol,
          }));
      }

      // Apply to presets (icon field + nested symbol fields)
      if (assignments.presets && merged.storyTemplate.presets) {
        merged.storyTemplate.presets = merged.storyTemplate.presets.map(
          (preset) => ({
            ...preset,
            // Preset uses 'icon' field, not 'symbol'
            icon: assignments.presets![preset.name] || preset.icon,
            // Also update symbol fields on nested elements within the preset
            stats: preset.stats?.map((stat) => ({
              ...stat,
              symbol: assignments.stats?.[stat.name] || stat.symbol,
            })),
            resources: preset.resources?.map((resource) => ({
              ...resource,
              symbol: assignments.resources?.[resource.name] || resource.symbol,
            })),
            inventory: preset.inventory?.map((item) => ({
              ...item,
              symbol: assignments.inventory?.[item.name] || item.symbol,
            })),
            abilities: preset.abilities?.map((ability) => ({
              ...ability,
              symbol: assignments.abilities?.[ability.name] || ability.symbol,
            })),
          })
        );
      }

      // Apply to skill trees
      if (
        (assignments.skillTrees || assignments.skillTreeNodes) &&
        merged.storyTemplate.skillTrees
      ) {
        merged.storyTemplate.skillTrees = merged.storyTemplate.skillTrees.map(
          (tree) => ({
            ...tree,
            symbol: assignments.skillTrees?.[tree.name] || tree.symbol,
            nodes: tree.nodes.map((node) => ({
              ...node,
              symbol:
                assignments.skillTreeNodes?.[`${tree.name}:${node.name}`] ||
                node.symbol,
            })),
          })
        );
      }
    }
  }

  return merged;
}

/**
 * Get all stages that should be run based on config
 * @param config - The adventure configuration
 * @param maxOutputTokens - Optional max output tokens of the model. If below 4000, skips content and advanced stages.
 */
export function getStagesToRun(config: BigAdventureConfig): GenerationStage[] {
  const stages: GenerationStage[] = [];

  // Check each stage's enabled status
  const stageConfigs = config.stageConfigs || DEFAULT_STAGE_CONFIGS;

  if (stageConfigs.core?.enabled !== false) {
    stages.push("core");
  }

  if (stageConfigs.mechanics?.enabled !== false) {
    stages.push("mechanics");
  }

  // Content substages - all enabled if content stage is enabled
  const contentEnabled = stageConfigs.content?.enabled !== false;

  if (contentEnabled) {
    stages.push("content-lore");
    stages.push("content-achievements");
    stages.push("content-items");
  }

  // Advanced substages - only if specific features are enabled AND advanced stage is enabled
  const advancedEnabled = stageConfigs.advanced?.enabled !== false;

  if (advancedEnabled && config.includePresets) {
    stages.push("advanced-presets");
  }
  if (advancedEnabled && (config.includeAGMT || config.includeCustomTables)) {
    stages.push("advanced-tables");
  }
  if (advancedEnabled && config.includeSkillTrees) {
    stages.push("advanced-skilltrees");
  }
  if (
    advancedEnabled &&
    (config.includeUpgradeShop || config.includeStartingChoices)
  ) {
    stages.push("advanced-other");
  }

  // Icons stage - always runs last to assign icons to all elements
  stages.push("icons");

  return stages;
}

/**
 * Get the total number of generation tasks
 *
 * Note: Each stage runs once. Content iteration multipliers (lore x5, etc.)
 * increase the AMOUNT of content generated per stage, not the number of API calls.
 * This returns the actual number of stages that will be run.
 */
export function getTotalGenerationTasks(config: BigAdventureConfig): number {
  return getStagesToRun(config).length;
}

/**
 * Estimate token cost for a full generation
 *
 * Note: Each stage runs once. Higher content iterations mean more content
 * is requested in a single prompt, which may require more output tokens.
 */
export function estimateBigAdventureCost(config: BigAdventureConfig): {
  inputTokens: number;
  outputTokens: number;
  totalStages: number;
  totalTasks: number;
} {
  const stages = getStagesToRun(config);
  const stageConfigs = config.stageConfigs || DEFAULT_STAGE_CONFIGS;
  const contentIterations =
    config.contentIterations || DEFAULT_CONTENT_ITERATIONS;

  // Rough estimates for input tokens per stage
  const inputEstimates: Record<GenerationStage, number> = {
    core: 2000,
    mechanics: 3000,
    "content-lore": 3500,
    "content-achievements": 3000,
    "content-items": 2500,
    "advanced-presets": 4000,
    "advanced-tables": 3000,
    "advanced-skilltrees": 4000,
    "advanced-other": 3000,
    icons: 50000, // Large because we include the full icon list
  };

  let totalInput = 0;
  let totalOutput = 0;

  for (const stage of stages) {
    const stageConfig = getSubstageConfig(stage, stageConfigs);
    const baseInput = inputEstimates[stage];
    let outputForStage = stageConfig.maxOutputTokens || config.maxOutputTokens;

    if (stage === "content-lore") {
      // Scale lore output by iteration multiplier
      const outputMultiplier = Math.min(2, contentIterations.lore);
      outputForStage = Math.round(outputForStage * outputMultiplier);
    } else if (stage === "content-achievements") {
      const avgMultiplier =
        (contentIterations.achievements + contentIterations.quests) / 2;
      const outputMultiplier = Math.min(2, avgMultiplier);
      outputForStage = Math.round(outputForStage * outputMultiplier);
    } else if (stage === "content-items") {
      const avgMultiplier =
        (contentIterations.inventory + contentIterations.relationships) / 2;
      const outputMultiplier = Math.min(2, avgMultiplier);
      outputForStage = Math.round(outputForStage * outputMultiplier);
    }

    totalInput += baseInput;
    totalOutput += outputForStage;
  }

  return {
    inputTokens: totalInput,
    outputTokens: totalOutput,
    totalStages: stages.length,
    totalTasks: stages.length, // Now matches getTotalGenerationTasks
  };
}

/**
 * Generate a unique session ID for autosave
 */
export function generateSessionId(): string {
  return `session_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Save autosave data to localStorage
 */
export function saveAutosave(data: BigAdventureAutosave): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(data));
  } catch (e) {
    console.error("Failed to save autosave:", e);
  }
}

/**
 * Load autosave data from localStorage
 */
export function loadAutosave(): BigAdventureAutosave | null {
  if (typeof window === "undefined") return null;
  try {
    const saved = localStorage.getItem(AUTOSAVE_KEY);
    if (!saved) return null;

    const data: BigAdventureAutosave = JSON.parse(saved);

    // Check if autosave is too old
    if (Date.now() - data.timestamp > AUTOSAVE_MAX_AGE_MS) {
      clearAutosave();
      return null;
    }

    return data;
  } catch (e) {
    console.error("Failed to load autosave:", e);
    return null;
  }
}

/**
 * Clear autosave data from localStorage
 */
export function clearAutosave(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(AUTOSAVE_KEY);
  } catch (e) {
    console.error("Failed to clear autosave:", e);
  }
}

/**
 * Save config draft to localStorage (before generation starts)
 */
export function saveConfigDraft(config: BigAdventureConfig): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      "bigAdventure_configDraft",
      JSON.stringify({
        config,
        timestamp: Date.now(),
      })
    );
  } catch (e) {
    console.error("Failed to save config draft:", e);
  }
}

/**
 * Load config draft from localStorage
 */
export function loadConfigDraft(): BigAdventureConfig | null {
  if (typeof window === "undefined") return null;
  try {
    const saved = localStorage.getItem("bigAdventure_configDraft");
    if (!saved) return null;

    const data = JSON.parse(saved);

    // Check if draft is too old (7 days)
    if (Date.now() - data.timestamp > 7 * 24 * 60 * 60 * 1000) {
      localStorage.removeItem("bigAdventure_configDraft");
      return null;
    }

    return data.config;
  } catch (e) {
    console.error("Failed to load config draft:", e);
    return null;
  }
}

/**
 * Build messages to regenerate a specific section
 */
export function buildRegenerateSectionMessages(
  section: RegenerateSection,
  config: BigAdventureConfig,
  currentResult: BigAdventureResult,
  additionalInstructions?: string
): ChatMessage[] {
  const sectionInfo = REGENERATE_SECTIONS[section];
  const counts = COMPLEXITY_COUNTS[config.complexity];
  const durationMultiplier = DURATION_MULTIPLIERS[config.targetDuration];

  // Build context from current result
  let context = `ADVENTURE CONTEXT:
Title: ${currentResult.title}
Genre: ${config.genre || "Not specified"}
RPG System: ${config.rpgSystem}
NSFW: ${config.nsfw ? "Allowed" : "Not allowed"}
Complexity: ${config.complexity}

EXISTING CONTENT SUMMARY:`;

  if (currentResult.storyTemplate?.stats?.length) {
    context += `\n- Stats: ${currentResult.storyTemplate.stats
      .map((s) => s.name)
      .join(", ")}`;
  }
  if (currentResult.storyTemplate?.resources?.length) {
    context += `\n- Resources: ${currentResult.storyTemplate.resources
      .map((r) => r.name)
      .join(", ")}`;
  }
  if (currentResult.storyTemplate?.abilities?.length) {
    context += `\n- Abilities: ${currentResult.storyTemplate.abilities
      .map((a) => a.name)
      .join(", ")}`;
  }
  if (currentResult.storyTemplate?.lore?.length) {
    context += `\n- Lore entries: ${currentResult.storyTemplate.lore.length}`;
  }
  if (currentResult.storyTemplate?.achievements?.length) {
    context += `\n- Achievements: ${currentResult.storyTemplate.achievements.length}`;
  }

  // Section-specific prompts
  const sectionPrompts: Record<
    RegenerateSection,
    { instruction: string; schema: string; count?: number }
  > = {
    title: {
      instruction:
        "Generate a new compelling title, short description (max 150 chars), and full description (3-5 paragraphs) for this adventure.",
      schema: `{ "title": "string", "shortDescription": "string (max 150 chars)", "description": "string (3-5 paragraphs)" }`,
    },
    intro: {
      instruction:
        "Generate a new opening intro (3-5 paragraphs), premise (2-3 paragraphs), and player summary (2-3 paragraphs).",
      schema: `{ "intro": "string", "premise": "string", "player_summary": "string" }`,
    },
    stats: {
      instruction: `Generate ${Math.round(
        counts.stats * durationMultiplier
      )} character stats. Values 1-100 where 50 is human average.`,
      schema: `{ "stats": [{ "name": "string", "value": number (1-100), "description": "string", "symbol": "emoji" }] }`,
      count: Math.round(counts.stats * durationMultiplier),
    },
    resources: {
      instruction: `Generate ${Math.round(
        counts.resources * durationMultiplier
      )} character resources (health, mana, stamina, etc).`,
      schema: `{ "resources": [{ "name": "string", "value": number, "maxValue": number, "description": "string", "symbol": "emoji" }] }`,
      count: Math.round(counts.resources * durationMultiplier),
    },
    abilities: {
      instruction: `Generate ${Math.round(
        counts.abilities * durationMultiplier
      )} abilities/skills. Grades: novice, apprentice, adept, expert, master, legendary.`,
      schema: `{ "abilities": [{ "name": "string", "description": "string", "grade": "string", "cost": [{ "type": "resource|variable", "name": "string", "amount": number }], "cooldown": number, "currentCooldown": 0, "stat": "string (optional)", "symbol": "emoji" }] }`,
      count: Math.round(counts.abilities * durationMultiplier),
    },
    variables: {
      instruction:
        "Generate 3-6 story tracking variables (mix of number, boolean, string, and list types). String variables can have optional predefined options.",
      schema: `{ "variables": [{ "id": "var_xxx", "name": "string", "description": "string", "type": "number|boolean|string|list", "value": any, "options": ["opt1", "opt2", ...] (string type only, optional) }] }`,
    },
    inventory: {
      instruction:
        "Generate 3-5 starting items. Types: normal, consumable, story, misc. Grades: common, uncommon, rare, epic, legendary, agmt.",
      schema: `{ "inventory": [{ "name": "string", "quantity": number, "description": "string", "type": "string", "grade": "string", "symbol": "emoji" }] }`,
    },
    lore: {
      instruction: `Generate ${Math.round(
        counts.lore * durationMultiplier
      )} DETAILED lore entries with dynamic triggers.

REQUIRED LORE CATEGORIES (distribute across all):
- KEY NPCs (3-4): Important characters with appearance, personality, motivations, secrets
- LOCATIONS (3-4): Major places with atmosphere, features, dangers, history
- FACTIONS (2-3): Organizations with goals, methods, leaders, relationships
- HISTORY (2-3): Past events that shaped the world
- UPCOMING THREATS (2-3): Looming dangers, prophecies, secret plots (set secret=true)
- WORLD LORE: Magic, religions, customs, creatures, artifacts

Each entry must be 2-4 paragraphs with specific names, dates, and vivid descriptions.

TRIGGERS - CRITICAL:
- Triggers use WORD BOUNDARIES - "gun" won't match "guns" or "gunfire"
- ALWAYS include variations: ["gun", "guns", "pistol", "pistols", "firearm"]
- ALWAYS include nicknames: ["Naomy", "Nao", "Lady Naomy", "Miss Blackwood"]
- Be thorough! List every form/alias a player might naturally use
- Use alwaysOn for core world facts the player should always know
- EVERY lore entry MUST have on_triggers OR alwaysOn=true - no empty triggers!`,
      schema: `{ "lore": [{ "title": "Lord Varen Blackwood", "content": "string (2-4 detailed paragraphs)", "secrtet": false, "on": false, "alwaysOn": false, "on_triggers": ["Varen", "Blackwood", "Lord Blackwood", "the lord"], "off_triggers": [], "var_on_triggers": [] }] }`,
      count: Math.round(counts.lore * durationMultiplier),
    },
    achievements: {
      instruction: `Generate ${Math.round(
        counts.achievements * durationMultiplier
      )} achievements with ai_hint for precise triggering.`,
      schema: `{ "achievements": [{ "title": "string", "description": "string", "ai_hint": "string", "points": number, "symbol": "emoji", "dateAchieved": null }] }`,
      count: Math.round(counts.achievements * durationMultiplier),
    },
    quests: {
      instruction: `Generate ${Math.round(
        counts.quests * durationMultiplier
      )} quests with objectives.`,
      schema: `{ "quests": [{ "id": "quest_xxx", "title": "string", "shortDescription": "string", "description": "string", "points": number, "active": boolean, "fulfilled": false }] }`,
      count: Math.round(counts.quests * durationMultiplier),
    },
    relationships: {
      instruction: `Generate ${Math.round(
        counts.relationships * durationMultiplier
      )} NPC relationships (-100 to +100).`,
      schema: `{ "relationships": [{ "name": "string", "value": number (-100 to 100), "description": "string", "symbol": "emoji" }] }`,
      count: Math.round(counts.relationships * durationMultiplier),
    },
    presets: {
      instruction: `Generate ${Math.round(
        counts.presets * durationMultiplier
      )} character presets with unique stats, abilities, and items.

CRITICAL: Each preset's "intro" is a COMPLETE REPLACEMENT (3-5 paragraphs) for the default intro, NOT an addition.
Each preset's "playerSummary" is a COMPLETE REPLACEMENT (2-3 paragraphs) for the default player background.
Write full, standalone content - not fragments!`,
      schema: `{ "presets": [{ "id": "preset-xxx", "name": "string", "description": "string", "icon": "emoji", "playerName": "string", "playerSummary": "string (2-3 paragraphs)", "intro": "string (3-5 paragraphs - COMPLETE replacement)", "stats": [...], "resources": [...], "inventory": [...], "abilities": [...], "authorNotes": "string" }] }`,
      count: Math.round(counts.presets * durationMultiplier),
    },
    agmt: {
      instruction: "Generate Advanced RPG Tools initial state for solo play.",
      schema: `{ "agmtState": { "chaosFactor": number (1-9), "sceneCount": 0, "threads": [{ "id": "thread_xxx", "description": "string", "status": "active" }], "characters": [{ "id": "char_xxx", "name": "string", "role": "string", "status": "active" }], "skillCheckHistory": [], "currentStreak": 0, "lastChaosAdjustment": 0 } }`,
    },
    customTables: {
      instruction: `Generate ${Math.round(
        counts.customTables * durationMultiplier
      )} random tables (encounters, weather, events, etc). Each table MUST have 20-50 entries for proper variety.`,
      schema: `{ "customTables": [{ "id": "table_xxx", "name": "string", "description": "string", "entries": [{ "text": "string (20-50 entries per table!)", "weight": number (1-10) }] }] }`,
      count: Math.round(counts.customTables * durationMultiplier),
    },
    upgradeShop: {
      instruction: `Generate upgrade shop configuration with ${Math.round(
        counts.shopItems * durationMultiplier
      )} items across stat, resource, item, and ability shops.`,
      schema: `{ "upgradeSettings": { "enabled": true, "allowStatUpgrade": true, "allowResourceUpgrade": true, "allowAddItem": true, "statUpgradeCost": 10, "statUpgradeAmount": 1, "resourceUpgradeCost": 15, "resourceUpgradeAmount": 10, "addItemCost": 20, "statShopEnabled": boolean, "resourceShopEnabled": boolean, "itemShopEnabled": boolean, "abilityShopEnabled": boolean, "statShop": [...], "resourceShop": [...], "itemShop": [...], "abilityShop": [...] } }`,
      count: Math.round(counts.shopItems * durationMultiplier),
    },
    levelingSettings: {
      instruction: `Configure leveling curve and upgrade points per level. xpBase controls how quickly players level (higher = slower), levelCap sets max level, defaultUpgradesPerLevel is standard upgrade points, upgradeOverrides gives bonus points at milestones, startingUpgrades overrides starting points per difficulty.`,
      schema: `{ "levelingSettings": { "xpBase": number (default 100), "levelCap": number (default 100), "defaultUpgradesPerLevel": number (default 1), "upgradeOverrides": [{ "level": number, "upgrades": number }], "startingUpgrades": { "easy": number, "medium": number, "hard": number, "expert": number } } }`,
    },
    startingChoices: {
      instruction: "Generate 2-4 starting choices for the adventure beginning.",
      schema: `{ "startingChoices": [{ "text": "string", "intro_override": "string (optional)", "skill_used": "string (optional)", "skill_dc": number (optional), "resource_used": "string (optional)", "item_used": "string (optional)" }] }`,
    },
    icons: {
      instruction: `Assign thematic icons to all adventure elements from the game-icons.net library.

AVAILABLE ICONS (${ALL_GAME_ICON_IDS.length} total):
${ALL_GAME_ICON_IDS.slice(0, 500).join(", ")}... and ${
        ALL_GAME_ICON_IDS.length - 500
      } more.

Match icons to element themes:
- Combat: sword, axe, shield, bow-arrow, crossbow
- Magic: magic-swirl, crystal-ball, spell-book, fire-breath
- Nature: oak-leaf, wolf-head, bear-head, tree
- Social: conversation, handshake, crown
- Movement: running-shoe, wingfoot, sprint
- Stealth: hidden, cloak, shadow`,
      schema: `{ "iconAssignments": { "stats": { "StatName": "icon-id" }, "resources": { "ResourceName": "icon-id" }, "inventory": { "ItemName": "icon-id" }, "abilities": { "AbilityName": "icon-id" }, "achievements": { "AchievementTitle": "icon-id" }, "relationships": { "NPCName": "icon-id" }, "presets": { "PresetName": "icon-id" } } }`,
    },
  };

  const sectionPrompt = sectionPrompts[section];

  // Get style preset modifier if set
  const styleModifier =
    config.stylePreset && config.stylePreset !== "default"
      ? STYLE_PRESETS[config.stylePreset]?.promptModifier
      : "";

  const systemPrompt = `You are an expert Game Designer regenerating a specific section of an existing adventure.

${context}

ORIGINAL PROMPT:
"${config.prompt}"
${styleModifier ? `\nSTYLE DIRECTION: ${styleModifier}` : ""}

TASK: Regenerate the "${sectionInfo.name}" section.
${sectionPrompt.instruction}
${sectionPrompt.count ? `\nTarget count: ${sectionPrompt.count} items.` : ""}
${
  additionalInstructions
    ? `\nADDITIONAL INSTRUCTIONS: ${additionalInstructions}`
    : ""
}

OUTPUT ONLY valid JSON matching this schema:
${sectionPrompt.schema}

Be creative and thematic. Ensure new content integrates well with existing elements. Use appropriate emoji symbols.`;

  return [
    { role: "system", content: systemPrompt },
    {
      role: "user",
      content: `Generate new ${sectionInfo.name} content. Output ONLY valid JSON.`,
    },
  ];
}

/**
 * Parse regenerated section output
 */
export function parseRegenerateSectionOutput(
  content: string,
  section: RegenerateSection
): Partial<BigAdventureResult> | null {
  try {
    let jsonContent = content.trim();

    // Remove markdown code blocks if present
    const jsonBlockMatch = jsonContent.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (jsonBlockMatch) {
      jsonContent = jsonBlockMatch[1].trim();
    }

    // Try to find JSON object boundaries
    const startIndex = jsonContent.indexOf("{");
    const endIndex = jsonContent.lastIndexOf("}");
    if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
      jsonContent = jsonContent.slice(startIndex, endIndex + 1);
    }

    // Parsing chain: JSON -> JSON5 -> repair+JSON -> repair+JSON5
    let parsed;
    try {
      parsed = JSON.parse(jsonContent);
    } catch (jsonError) {
      try {
        parsed = JSON5.parse(jsonContent);
        console.log("JSON5 parse successful (lenient mode)");
      } catch (json5Error) {
        console.warn("Initial parsing failed, attempting repair...");
        const repairedContent = attemptJSONRepair(content);
        try {
          parsed = JSON.parse(repairedContent);
          console.log("JSON repair successful!");
        } catch (repairJsonError) {
          try {
            parsed = JSON5.parse(repairedContent);
            console.log("JSON5 parse of repaired content successful!");
          } catch (repairJson5Error) {
            throw jsonError;
          }
        }
      }
    }

    // Map to BigAdventureResult based on section
    switch (section) {
      case "title":
        return {
          title: parsed.title,
          shortDescription: parsed.shortDescription,
          description: parsed.description,
        };
      case "intro":
        return {
          storyTemplate: {
            intro: parsed.intro,
            premise: parsed.premise,
            player_summary: parsed.player_summary,
          },
        };
      case "stats":
        return { storyTemplate: { stats: parsed.stats } };
      case "resources":
        return { storyTemplate: { resources: parsed.resources } };
      case "abilities":
        return { storyTemplate: { abilities: parsed.abilities } };
      case "variables":
        return { storyTemplate: { variables: parsed.variables } };
      case "inventory":
        return { storyTemplate: { inventory: parsed.inventory } };
      case "lore":
        return { storyTemplate: { lore: parsed.lore } };
      case "achievements":
        return { storyTemplate: { achievements: parsed.achievements } };
      case "quests":
        return { storyTemplate: { quests: parsed.quests } };
      case "relationships":
        return { storyTemplate: { relationships: parsed.relationships } };
      case "presets":
        return { storyTemplate: { presets: parsed.presets } };
      case "agmt":
        return { storyTemplate: { agmtState: parsed.agmtState } };
      case "customTables":
        return { storyTemplate: { customTables: parsed.customTables } };
      case "upgradeShop":
        return { storyTemplate: { upgradeSettings: parsed.upgradeSettings } };
      case "levelingSettings":
        return { storyTemplate: { levelingSettings: parsed.levelingSettings } };
      case "startingChoices":
        return { startingChoices: parsed.startingChoices };
      case "icons":
        return { iconAssignments: parsed.iconAssignments };
      default:
        return null;
    }
  } catch (e) {
    console.error("Failed to parse regenerate section output:", e);
    return null;
  }
}

/**
 * Sections that support "Add More" functionality
 */
export const EXTENDABLE_SECTIONS: RegenerateSection[] = [
  "stats",
  "resources",
  "abilities",
  "inventory",
  "lore",
  "achievements",
  "quests",
  "relationships",
  "presets",
  "customTables",
  "variables",
];

/**
 * Check if a section can be extended (add more items)
 */
export function canExtendSection(section: RegenerateSection): boolean {
  return EXTENDABLE_SECTIONS.includes(section);
}

/**
 * Build messages for extending a section (adding more content)
 */
export function buildExtendSectionMessages(
  config: BigAdventureConfig,
  section: RegenerateSection,
  existingResult: BigAdventureResult,
  customInstructions?: string
): { role: "system" | "user"; content: string }[] {
  const sectionInfo = REGENERATE_SECTIONS[section];
  const rpgDesc = RPG_SYSTEM_DESCRIPTIONS[config.rpgSystem];

  // Get existing content based on section
  let existingItems: { name?: string; title?: string }[] = [];
  let existingItemsPreview = "";

  if (existingResult.storyTemplate) {
    const template = existingResult.storyTemplate;
    switch (section) {
      case "stats":
        existingItems = (template.stats || []) as {
          name?: string;
          title?: string;
        }[];
        existingItemsPreview = existingItems
          .map((s) => s.name)
          .filter(Boolean)
          .join(", ");
        break;
      case "resources":
        existingItems = (template.resources || []) as {
          name?: string;
          title?: string;
        }[];
        existingItemsPreview = existingItems
          .map((r) => r.name)
          .filter(Boolean)
          .join(", ");
        break;
      case "abilities":
        existingItems = (template.abilities || []) as {
          name?: string;
          title?: string;
        }[];
        existingItemsPreview = existingItems
          .map((a) => a.name)
          .filter(Boolean)
          .join(", ");
        break;
      case "inventory":
        existingItems = (template.inventory || []) as {
          name?: string;
          title?: string;
        }[];
        existingItemsPreview = existingItems
          .map((i) => i.name)
          .filter(Boolean)
          .join(", ");
        break;
      case "lore":
        existingItems = (template.lore || []) as {
          name?: string;
          title?: string;
        }[];
        existingItemsPreview = existingItems
          .map((l) => l.title)
          .filter(Boolean)
          .join(", ");
        break;
      case "achievements":
        existingItems = (template.achievements || []) as {
          name?: string;
          title?: string;
        }[];
        existingItemsPreview = existingItems
          .map((a) => a.title)
          .filter(Boolean)
          .join(", ");
        break;
      case "quests":
        existingItems = (template.quests || []) as {
          name?: string;
          title?: string;
        }[];
        existingItemsPreview = existingItems
          .map((q) => q.title)
          .filter(Boolean)
          .join(", ");
        break;
      case "relationships":
        existingItems = (template.relationships || []) as {
          name?: string;
          title?: string;
        }[];
        existingItemsPreview = existingItems
          .map((r) => r.name)
          .filter(Boolean)
          .join(", ");
        break;
      case "presets":
        existingItems = (template.presets || []) as {
          name?: string;
          title?: string;
        }[];
        existingItemsPreview = existingItems
          .map((p) => p.name)
          .filter(Boolean)
          .join(", ");
        break;
      case "customTables":
        existingItems = (template.customTables || []) as {
          name?: string;
          title?: string;
        }[];
        existingItemsPreview = existingItems
          .map((t) => t.name)
          .filter(Boolean)
          .join(", ");
        break;
    }
  }

  // Build context for existing content
  const context = `ADVENTURE: ${existingResult.title || "Untitled"}
${
  existingResult.description
    ? `\nDESCRIPTION: ${existingResult.description}`
    : ""
}
${
  existingResult.storyTemplate?.premise
    ? `\nPREMISE: ${existingResult.storyTemplate.premise}`
    : ""
}

RPG SYSTEM: ${config.rpgSystem}
${rpgDesc}

EXISTING ${sectionInfo.name.toUpperCase()} (${existingItems.length} items):
${existingItemsPreview || "(none)"}`;

  // Section-specific extend prompts
  const sectionPrompts: Record<
    RegenerateSection,
    { instruction: string; schema: string }
  > = {
    title: { instruction: "", schema: "" },
    intro: { instruction: "", schema: "" },
    stats: {
      instruction: `Generate NEW stats that complement the existing ones. Avoid duplicating existing stats. Generate as many as possible to fill the output budget.`,
      schema: `{ "stats": [{ "name": "string", "description": "string", "value": number, "min": number, "max": number, "symbol": "emoji" }] }`,
    },
    resources: {
      instruction: `Generate NEW resources that complement the existing ones. Avoid duplicating existing resources. Generate as many as possible.`,
      schema: `{ "resources": [{ "name": "string", "description": "string", "value": number, "min": number, "max": number, "symbol": "emoji", "stat": "string (optional)" }] }`,
    },
    abilities: {
      instruction: `Generate NEW abilities that complement the existing ones. Vary grades from novice to master. Generate as many as possible.`,
      schema: `{ "abilities": [{ "name": "string", "description": "string", "grade": "novice|apprentice|adept|expert|master", "stat": "string", "symbol": "emoji", "cost": [{ "type": "resource", "name": "string", "amount": number }], "cooldown": number }] }`,
    },
    variables: {
      instruction: `Generate NEW variables. Generate as many as possible.`,
      schema: `{ "variables": [{ "name": "string", "value": number, "symbol": "emoji" }] }`,
    },
    inventory: {
      instruction: `Generate NEW inventory items that complement the existing ones. Mix item types. Generate as many as possible.`,
      schema: `{ "inventory": [{ "name": "string", "description": "string", "type": "normal|consumable|story|misc", "grade": "common|uncommon|rare|epic|agmt", "stat": "string (optional)", "symbol": "emoji", "durability": number, "maxDurability": number }] }`,
    },
    lore: {
      instruction: `Generate NEW DETAILED lore entries that expand the world. Generate as many as the output budget allows.

Consider adding entries from categories that may be underrepresented:
- NPCs: Important characters with appearance, personality, motivations, secrets
- Locations: Major places with atmosphere, features, dangers, history  
- Factions: Organizations with goals, methods, leaders
- History: Past events that shaped the current situation
- Threats: Looming dangers, prophecies, secret plots (set secret=true)
- World Details: Magic, religions, customs, creatures, artifacts

Each entry MUST be 2-4 paragraphs with specific names, dates, and vivid descriptions.

TRIGGERS - IMPORTANT:
- Triggers use WORD BOUNDARIES - "gun" won't match "guns"
- Include all variations: ["gun", "guns", "pistol", "pistols"]
- Include nicknames/aliases: ["Naomy", "Nao", "Lady Naomy"]
- EVERY lore entry MUST have on_triggers OR alwaysOn=true - no empty triggers!
Ensure new lore references and connects to existing lore entries.`,
      schema: `{ "lore": [{ "title": "Captain Sera Vex", "content": "string (2-4 detailed paragraphs)", "secrtet": false, "on": false, "alwaysOn": false, "on_triggers": ["Sera", "Vex", "Captain Vex", "the captain"], "off_triggers": [], "var_on_triggers": [] }] }`,
    },
    achievements: {
      instruction: `Generate NEW achievements with ai_hint for precise triggering. Generate as many as possible.`,
      schema: `{ "achievements": [{ "title": "string", "description": "string", "ai_hint": "string", "points": number, "symbol": "emoji", "dateAchieved": null }] }`,
    },
    quests: {
      instruction: `Generate NEW quests with objectives. Generate as many as possible.`,
      schema: `{ "quests": [{ "id": "quest_xxx", "title": "string", "shortDescription": "string", "description": "string", "points": number, "active": boolean, "fulfilled": false }] }`,
    },
    relationships: {
      instruction: `Generate NEW NPC relationships (-100 to +100). Generate as many as possible.`,
      schema: `{ "relationships": [{ "name": "string", "value": number (-100 to 100), "description": "string", "symbol": "emoji" }] }`,
    },
    presets: {
      instruction: `Generate NEW character presets with unique stats, abilities, and items. Generate as many as the output budget allows.

CRITICAL: Each preset's "intro" is a COMPLETE REPLACEMENT (3-5 paragraphs) for the default intro, NOT an addition.
Each preset's "playerSummary" is a COMPLETE REPLACEMENT (2-3 paragraphs) for the default player background.
Write full, standalone content - not fragments!`,
      schema: `{ "presets": [{ "id": "preset-xxx", "name": "string", "description": "string", "icon": "emoji", "playerName": "string", "playerSummary": "string (2-3 paragraphs)", "intro": "string (3-5 paragraphs - COMPLETE replacement)", "stats": [...], "resources": [...], "inventory": [...], "abilities": [...], "authorNotes": "string" }] }`,
    },
    agmt: {
      instruction: "",
      schema: "",
    },
    customTables: {
      instruction: `Generate NEW random tables (encounters, weather, events, etc). Generate as many tables as the output budget allows.
Each table MUST have 20-50 entries for proper variety. Use weights 1-10 (higher = more common).`,
      schema: `{ "customTables": [{ "id": "table_xxx", "name": "string", "description": "string", "entries": [{ "text": "string (20-50 entries per table!)", "weight": number (1-10) }] }] }`,
    },
    upgradeShop: {
      instruction: "",
      schema: "",
    },
    levelingSettings: {
      instruction: "",
      schema: "",
    },
    startingChoices: {
      instruction: "",
      schema: "",
    },
    icons: {
      instruction: "",
      schema: "",
    },
  };

  const sectionPrompt = sectionPrompts[section];
  if (!sectionPrompt.instruction) {
    throw new Error(
      `Section ${section} does not support "Add More" functionality`
    );
  }

  // Get style preset modifier if set
  const styleModifier =
    config.stylePreset && config.stylePreset !== "default"
      ? STYLE_PRESETS[config.stylePreset]?.promptModifier
      : "";

  const systemPrompt = `You are an expert Game Designer adding MORE content to an existing adventure.

${context}

ORIGINAL PROMPT:
"${config.prompt}"
${styleModifier ? `\nSTYLE DIRECTION: ${styleModifier}` : ""}${
    customInstructions ? `\n\nCUSTOM INSTRUCTIONS:\n${customInstructions}` : ""
  }

TASK: Add MORE ${
    sectionInfo.name
  } entries. Generate as many as your output budget allows.
${sectionPrompt.instruction}

IMPORTANT:
- Do NOT duplicate any existing items listed above
- Make new items complement and expand on the existing content
- Ensure new content fits the adventure's theme and tone
- Use appropriate emoji symbols
- Fill your entire output budget with quality content

OUTPUT ONLY valid JSON matching this schema:
${sectionPrompt.schema}

Be creative and thematic. Ensure new content integrates well with existing elements.`;

  return [
    { role: "system", content: systemPrompt },
    {
      role: "user",
      content: `Generate new ${sectionInfo.name} entries. Fill your output budget. Output ONLY valid JSON.`,
    },
  ];
}

/**
 * Parse extended section output and merge with existing content
 */
export function parseExtendSectionOutput(
  content: string,
  section: RegenerateSection,
  existingResult: BigAdventureResult
): Partial<BigAdventureResult> | null {
  try {
    let jsonContent = content.trim();

    // Remove markdown code blocks if present
    const jsonBlockMatch = jsonContent.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (jsonBlockMatch) {
      jsonContent = jsonBlockMatch[1].trim();
    }

    // Try to find JSON object boundaries
    const startIndex = jsonContent.indexOf("{");
    const endIndex = jsonContent.lastIndexOf("}");
    if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
      jsonContent = jsonContent.slice(startIndex, endIndex + 1);
    }

    // Parsing chain: JSON -> JSON5 -> repair+JSON -> repair+JSON5
    let parsed;
    try {
      parsed = JSON.parse(jsonContent);
    } catch (jsonError) {
      try {
        parsed = JSON5.parse(jsonContent);
        console.log("JSON5 parse successful (lenient mode)");
      } catch (json5Error) {
        console.warn("Initial parsing failed, attempting repair...");
        const repairedContent = attemptJSONRepair(content);
        try {
          parsed = JSON.parse(repairedContent);
          console.log("JSON repair successful!");
        } catch (repairJsonError) {
          try {
            parsed = JSON5.parse(repairedContent);
            console.log("JSON5 parse of repaired content successful!");
          } catch (repairJson5Error) {
            throw jsonError;
          }
        }
      }
    }

    const template = existingResult.storyTemplate || {};

    // Merge new content with existing
    switch (section) {
      case "stats":
        return {
          storyTemplate: {
            stats: [...(template.stats || []), ...(parsed.stats || [])],
          },
        };
      case "resources":
        return {
          storyTemplate: {
            resources: [
              ...(template.resources || []),
              ...(parsed.resources || []),
            ],
          },
        };
      case "abilities":
        return {
          storyTemplate: {
            abilities: [
              ...(template.abilities || []),
              ...(parsed.abilities || []),
            ],
          },
        };
      case "variables":
        return {
          storyTemplate: {
            variables: [
              ...(template.variables || []),
              ...(parsed.variables || []),
            ],
          },
        };
      case "inventory":
        return {
          storyTemplate: {
            inventory: [
              ...(template.inventory || []),
              ...(parsed.inventory || []),
            ],
          },
        };
      case "lore":
        return {
          storyTemplate: {
            lore: [...(template.lore || []), ...(parsed.lore || [])],
          },
        };
      case "achievements":
        return {
          storyTemplate: {
            achievements: [
              ...(template.achievements || []),
              ...(parsed.achievements || []),
            ],
          },
        };
      case "quests":
        return {
          storyTemplate: {
            quests: [...(template.quests || []), ...(parsed.quests || [])],
          },
        };
      case "relationships":
        return {
          storyTemplate: {
            relationships: [
              ...(template.relationships || []),
              ...(parsed.relationships || []),
            ],
          },
        };
      case "presets":
        return {
          storyTemplate: {
            presets: [...(template.presets || []), ...(parsed.presets || [])],
          },
        };
      case "customTables":
        return {
          storyTemplate: {
            customTables: [
              ...(template.customTables || []),
              ...(parsed.customTables || []),
            ],
          },
        };
      default:
        return null;
    }
  } catch (e) {
    console.error("Failed to parse extend section output:", e);
    return null;
  }
}
