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
import { SchemaPage } from "@/app/misc/characterSchema";
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
  | "mechanics-notes"
  | "mechanics"
  | "character-sheet"
  | "content-lore"
  | "content-achievements"
  | "advanced-presets"
  | "advanced-tables"
  | "advanced-other"
  | "icons";

// Legacy stage type for backward compatibility and UI grouping
export type LegacyStage = "core" | "mechanics" | "content" | "advanced";

// Map substage to its parent legacy stage
export function getParentStage(stage: GenerationStage): LegacyStage {
  if (stage === "core") return "core";
  if (
    stage === "mechanics-notes" ||
    stage === "mechanics" ||
    stage === "character-sheet"
  )
    return "mechanics";
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
export type ContentSubStage = "lore" | "achievements" | "quests";

export interface ContentIterationConfig {
  lore: number; // 1-5 iterations
  achievements: number;
  quests: number;
}

export const DEFAULT_CONTENT_ITERATIONS: ContentIterationConfig = {
  lore: 1,
  achievements: 1,
  quests: 1,
};

export interface BigAdventureConfig {
  prompt: string;
  genre?: string;
  rpgSystem?: RPGSystemType; // Deprecated - GM stage now handles all dice via formula_roll
  complexity: ComplexityLevel;
  nsfw: boolean;
  includeAGMT: boolean;
  includeUpgradeShop: boolean;
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

  // Imported content from PDF - merged into final result
  importedLore?: import("./structs").StoryLore[];
  importedMechanicsNotes?: import("./structs").StoryLore[];
  importedCustomTables?: import("./structs").CustomTable[];
  importedVariables?: import("./structs").Variable[];
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
// Note: "abilities" and "upgradeShop" are deprecated and removed
export type RegenerateSection =
  | "title" // Regenerate title, shortDescription, description
  | "intro" // Regenerate intro, premise, player_summary
  | "characterSchema" // Regenerate character schema and data
  | "variables" // Regenerate variables
  | "mechanicsLore" // Regenerate mechanics lore entries
  | "lore" // Regenerate lore entries
  | "achievements" // Regenerate achievements
  | "quests" // Regenerate quests
  | "presets" // Regenerate character presets
  | "agmt" // Regenerate agmt state
  | "customTables" // Regenerate custom tables
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
  characterSchema: {
    name: "Character Schema",
    description: "Character fields and structure",
    emoji: "📊",
    stage: "mechanics",
  },
  variables: {
    name: "Variables",
    description: "Story tracking variables",
    emoji: "🔢",
    stage: "mechanics",
  },
  mechanicsLore: {
    name: "Game Rules",
    description: "Game rules and mechanics explanations",
    emoji: "📖",
    stage: "mechanics", // Uses mechanics legacy stage for UI grouping
  },
  lore: {
    name: "Notes",
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
}

export interface BigAdventureResult {
  // Adventure metadata
  title: string;
  shortDescription: string;
  description: string;

  // Story template
  storyTemplate: Partial<StoryData>;
  startingChoices?: StartingChoice[];

  // Character sheet pages (from character-sheet stage, merged into characterSchema later)
  characterSchemaPages?: SchemaPage[];

  // Icon assignments (from icons stage)
  iconAssignments?: IconAssignments;
}

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
    "mechanics-notes": {
      name: "Game Rules",
      description: "Detailed game mechanics documentation",
      detailedDescription:
        "Creates comprehensive game rules and mechanics documentation. This includes how skill checks work, combat rules, class descriptions, progression systems, item guidelines, rest mechanics, and encounter design. These rules guide both the player and the AI GM.",
      generates: [
        "How Skill Checks Work (dice system)",
        "Combat Rules (initiative, attacks, damage)",
        "Classes/Archetypes Overview",
        "Character Progression & Leveling",
        "Rest & Recovery mechanics",
        "Death & Defeat consequences",
        "NPC & Enemy stat guidelines",
        "Item system & crafting rules",
        "Encounter design guidelines",
      ],
      instructionHint:
        "Customize combat complexity, progression speed, unique mechanics, or difficulty scaling",
      number: 2,
      emoji: "📖",
    },
    mechanics: {
      name: "Character System",
      description: "Stats, skills, and character data",
      detailedDescription:
        "Defines the character sheet structure: what attributes your character has, what resources to manage, class/archetype options, and hidden variables that track story progress. Uses the rules from the previous stage.",
      generates: [
        "Character stats (Strength, Charisma, etc.)",
        "Resources (Health, Mana, Gold, etc.)",
        "Class/archetype options",
        "Skills and abilities",
        "Hidden variables for story tracking",
      ],
      instructionHint:
        "Request specific stats, resource types, unique abilities, or special mechanics",
      number: 3,
      emoji: "⚙️",
    },
    "character-sheet": {
      name: "Character Sheet",
      description: "Visual character sheet design",
      detailedDescription:
        "Creates the HTML/CSS/JS character sheet template with multiple pages. Designs the visual layout for displaying stats, resources, inventory, and other character data. Can include interactive JavaScript for collapsible sections, animated bars, and tooltips.",
      generates: [
        "Character sheet HTML template",
        "CSS styling for dark theme",
        "Multiple sheet pages (Overview, Combat, Skills, etc.)",
        "Resource bars and stat displays",
        "Optional interactive JavaScript",
      ],
      instructionHint:
        "Customize sheet layout, page organization, visual styling, or interactive features",
      number: 3,
      emoji: "📋",
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
      number: 4,
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
      number: 5,
      emoji: "🏆",
    },
    "advanced-presets": {
      name: "Character Presets",
      description: "Pre-made character builds",
      detailedDescription:
        "Creates alternative character builds players can choose from, each with unique character sheet values and abilities.",
      generates: [
        "Character presets/classes",
        "Unique character sheet values",
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
      number: 8,
      emoji: "🛒",
    },
    icons: {
      name: "Icon Assignment",
      description: "Assigns thematic icons to all elements",
      detailedDescription:
        "Reviews all character sheet fields, abilities, achievements, and lore entries to assign appropriate icons from the game-icons.net library.",
      generates: [
        "Icons for character sheet fields",
        "Icons for abilities",
        "Icons for achievements and lore",
      ],
      instructionHint:
        "The AI will automatically choose thematic icons for each element",
      number: 9,
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
  stage: GenerationStage,
  previousResults?: Partial<BigAdventureResult>
): string {
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

DICE MECHANICS: The game uses a flexible formula-based dice system. The GM stage will handle all dice rolls using the formula_roll tool with formulas like "1d20+{{STR}}" or "2d6+{{Perception}}". Design stats and abilities that make sense for the genre - the system adapts to any dice formula.

NSFW CONTENT: ${
    config.nsfw
      ? "Allowed - mature themes, violence, and adult content are permitted"
      : "Not allowed - keep content appropriate for general audiences"
  }

CONTENT SCOPE: Create as many elements as appropriate for this adventure concept. A small-scale personal story may need fewer elements, while an epic world-spanning adventure may need many more. Use your judgment based on the adventure's scope and complexity.

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

  // MECHANICS NOTES STAGE - Game rules documentation
  if (stage === "mechanics-notes") {
    // Get core results for context
    const title = previousResults?.title || "the adventure";
    const premise = previousResults?.storyTemplate?.premise || "";
    const genre = config.genre || "";

    // Get RPG system info - if user specified one, use it; otherwise let AI choose
    const userSpecifiedSystem = config.rpgSystem;
    const rpgDescription = userSpecifiedSystem
      ? RPG_SYSTEM_DESCRIPTIONS[userSpecifiedSystem]
      : null;

    // DC guidelines for all systems
    const allDCGuidelines = `
DICE SYSTEM OPTIONS (choose the most appropriate for the adventure concept):

1d20 (D&D-style) - Best for: heroic fantasy, tactical combat, class-based RPGs
   DC 5: Trivial | DC 10: Easy | DC 15: Average | DC 20: Hard | DC 25: Very Hard | DC 30+: Legendary
   Formula example: 1d20+{{modifier}}

3d6 (Bell curve) - Best for: realistic settings, GURPS-style, skill-focused games  
   DC 6: Trivial | DC 8: Easy | DC 10: Average | DC 13: Hard | DC 16: Very Hard | DC 18+: Impossible
   Formula example: 3d6+{{modifier}}

2d6 (PbtA-style) - Best for: narrative games, City of Mist, Apocalypse World
   6-: Failure | 7-9: Partial success | 10-11: Full success | 12+: Critical
   Formula example: 2d6+{{modifier}} (modifiers typically -2 to +3)

1d100/Percentile - Best for: Call of Cthulhu, horror, investigation-focused games
   Roll under skill value. Modifiers adjust target number.
   Formula example: 1d100 vs {{skill}}

4dF (Fate) - Best for: narrative-first games, collaborative storytelling
   Compare to opposition ladder: Mediocre (+0) to Legendary (+8)
   Formula example: 4dF+{{skill}}

Year Zero Engine - Best for: survival games, Alien RPG, Forbidden Lands
   Dice pool (count 6s), push mechanic with stress
   Formula example: {{attribute}}d6

Explosive Dice - Best for: over-the-top action, Savage Worlds style
   Dice chain d4→d6→d8→d10→d12, max rolls explode
   Formula example: 1d{{dieSize}}! (exploding)

Narrative (no dice) - Best for: pure storytelling, journaling games
   AI determines outcomes based on character abilities and context`;

    const systemGuidance = userSpecifiedSystem
      ? `DICE SYSTEM: ${rpgDescription}
Use this system for all mechanics. Design DCs, skills, and abilities accordingly.`
      : `DICE SYSTEM: Choose the most appropriate system based on the adventure concept.
Consider the genre, tone, and user's prompt when selecting.

${allDCGuidelines}`;

    return `${basePrompt}

STAGE 2: GAME RULES & MECHANICS DOCUMENTATION
Create comprehensive game rules for "${title}".
${genre ? `Genre: ${genre}` : ""}
${premise ? `Premise: ${premise.substring(0, 300)}...` : ""}

Your task is to write detailed mechanics documentation that will guide both the player AND the AI Game Master.
These rules will be referenced throughout gameplay, so they must be clear, specific, and tailored to this adventure's setting.

${systemGuidance}

═══════════════════════════════════════════════════════════════
MECHANICS LORE ENTRIES (Required)
═══════════════════════════════════════════════════════════════

Create 10-15 detailed lore entries covering these REQUIRED topics:

FOUNDATIONAL SYSTEMS (must define first):
1. "Character Stats" - What attributes define characters in this setting
   - List 4-8 core stats with setting-appropriate names (NOT generic STR/DEX/INT)
   - What each stat represents and when it's used
   - Starting value ranges (typically 20-60, with 40 being average)
   - How stats affect dice rolls (modifier = stat value, added to roll)
   - Example: "Nerve" for courage checks, "Chrome" for tech skills, "Edge" for combat reflexes

2. "Skills System" - How skills work (if applicable)
   - Are there separate skills, or just stats?
   - If skills exist: list 10-15 skills with their governing stat
   - Skill ranks: untrained (-10), novice (+0), competent (+10), expert (+20), master (+30)
   - When to use skills vs raw stat checks
   - Example skill list for THIS setting (e.g., "Netrunning (Chrome)", "Street Cred (Edge)")

3. "Resources & Pools" - What expendable resources characters have
   - Health/HP equivalent: name, starting amount, what depletes it
   - Energy/Mana equivalent: name, starting amount, what it powers
   - Any unique resources for this setting (Sanity, Stress, Reputation, Ammo, etc.)
   - Maximum values and how they scale with progression
   - What happens at 0 for each resource (death, breakdown, narrative consequences)

4. "Dice Rolling Mechanics" - Detailed explanation of the dice system
   - Step-by-step: how to resolve a check from start to finish
   - Formula breakdown: what dice + what modifiers + compared to what
   - Advantage/Disadvantage system: how bonuses stack, what grants them
   - Contested rolls: how to handle opposed checks
   - Group checks: when multiple characters attempt something together

PLAYER-FACING RULES:
5. "How Skill Checks Work" - Practical guide for players
   - When the GM calls for a check
   - Difficulty tiers with examples from THIS setting
   - What constitutes success, partial success, failure
   - Critical successes/failures and their effects
   - How items and abilities modify checks

6. "Combat Rules" - How combat works in this system
   - Initiative and turn order
   - Attack rolls and damage calculation
   - Defense, armor, and taking damage
   - Conditions (stunned, wounded, etc.) and their effects
   - Death, defeat, and consequences

7. "Classes/Archetypes Overview" - 4-6 character archetypes for this setting
   - Each class's theme and playstyle
   - Primary and secondary stats
   - Signature abilities and playstyle
   - Role in a group (combat, support, utility, social)
   - MUST be unique to THIS setting (not generic fantasy classes)

8. "Character Progression" - How characters grow
   - How progression points are earned (completing quests, story beats, challenges)
   - What can be upgraded: stats, skills, abilities, resources
   - Upgrade point costs and scaling
   - Milestone achievements and their rewards

9. "Rest & Recovery" - How resources regenerate IN THIS WORLD
   - MUST be thematically unique to the setting!
   - Quick rest (30 min): Setting-appropriate recovery method
   - Short rest (4-8 hours): Sleep/recovery specific to this world
   - Long rest (days): Extended downtime activities
   - Examples: cyber-meditation, prayer rituals, alchemical restoration, dream-walking

GM-FACING GUIDELINES (for AI Game Master):
10. "Creating NPCs & Enemies" - How to stat NPCs/monsters
    - Typical stat ranges by enemy tier (weak: 20-35, average: 40-55, strong: 60-75, boss: 80+)
    - HP guidelines (minions: 10-30, regular: 50-100, elite: 150-250, boss: 300+)
    - How enemy abilities scale with player level
    - Example stat blocks for 3-4 common enemy types SPECIFIC TO THIS SETTING

11. "Item System Guidelines" - How items work mechanically
    - Create UNIQUE item categories that fit the setting (not generic fantasy items!)
    - Item grades: common (+0), uncommon (+1), rare (+2), epic (+3), legendary (+5)
    - Durability system (items can break on failed checks)
    - Consumable vs equipment vs story items
    - How to create balanced custom items
    - Example items at each tier FOR THIS WORLD

12. "Encounter Design" - How to build balanced encounters
    - Single enemy vs group tactics
    - When to use scene challenges vs single skill checks
    - Environmental hazards specific to this setting
    - Non-combat resolution options

OPTIONAL ADDITIONAL ENTRIES (add 2-4 more based on setting):
- Magic/Power System (if applicable) - Spell costs, casting rules, schools of magic
- Faction Relations - Reputation mechanics, faction standings
- Economy & Trading - Currency, typical prices, bartering rules
- Crafting Rules - Materials, recipes, crafting checks
- Vehicle/Mount Combat - Chase rules, mounted combat modifiers
- Social Encounter Rules - Persuasion, deception, intimidation mechanics
- Investigation/Mystery Mechanics - Clue gathering, deduction rules

═══════════════════════════════════════════════════════════════
CRITICAL REQUIREMENTS
═══════════════════════════════════════════════════════════════

1. ALL entries MUST have "alwaysOn": true (mechanics are always visible to players)
2. Each entry should be 2-4 detailed paragraphs with CONCRETE EXAMPLES
3. Content must be SPECIFIC to this adventure's setting, not generic RPG rules
4. Include concrete examples using the setting's themes
5. GM guidelines should help the AI make consistent rulings

═══════════════════════════════════════════════════════════════
EXAMPLE ENTRIES (for a Cyberpunk setting)
═══════════════════════════════════════════════════════════════

EXAMPLE "Character Stats" entry:
"In Night City, six attributes define who you are. EDGE represents combat reflexes, street smarts, and reaction time - used for gunfights, dodging, and quick-draw situations. CHROME measures cybernetic integration and technical aptitude - roll this when hacking, interfacing with tech, or using cyberware. NERVE is raw courage and willpower - test it when facing fear, resisting manipulation, or maintaining composure under fire. COOL covers social grace, intimidation, and negotiation - your face-to-face stat. BODY represents physical strength, endurance, and toughness - for lifting, brawling, and soaking damage. INTEL covers perception, investigation, and reasoning - spot clues, analyze situations, see through lies.

Starting characters have 40 in each stat (human average). Stats range from 20 (impaired) to 60 (exceptional) at character creation, scaling to 80+ with cyberware and progression. Your stat value is your modifier added to dice rolls."

EXAMPLE "Dice Rolling Mechanics" entry:
"All checks use 3d6 + stat modifier vs a target DC. Roll three six-sided dice, sum them (averaging 10.5), add your relevant stat (typically 30-50), and compare to the difficulty. Success means you roll equal to or higher than the DC.

Step-by-step: 1) GM names the stat and DC based on difficulty, 2) Apply any advantages (+1d6, take best 3) or disadvantages (-1d6, take worst 3), 3) Roll and add stat, 4) Compare to DC. Example: Hacking a security terminal (DC 55) with Chrome 45 means rolling 3d6+45, needing 55+ to succeed.

Advantage sources: appropriate items (+1d6), relevant abilities (+1d6), story circumstances (+1d6). Disadvantage sources: injuries (-1d6), poor conditions (-1d6), missing tools (-1d6). Multiple advantages/disadvantages stack (roll more dice, keep best/worst 3)."

EXAMPLE "Creating NPCs & Enemies" entry:
"Scale NPC stats to create appropriate challenges. Street punks: 25-35 in combat stats, 20-40 HP. Corporate security: 40-50 stats, 60-80 HP. Elite operatives: 55-65 stats, 100-150 HP. Boss-tier enemies: 70-80 stats, 200-300 HP.

Example stat blocks:
- STREET THUG: Edge 30, Body 35, HP 30. Armed with a cheap pistol (1d6 damage). Fights dirty, flees when hurt.
- CORPORATE GUARD: Edge 45, Chrome 40, Body 45, HP 70. Smartgun (+1d6 to attacks), body armor (-3 damage). Professional, calls backup.
- NETRUNNER ELITE: Chrome 65, Intel 60, HP 50. Neural interface lets them attack through the Net. Fragile but dangerous.
- CYBORG ENFORCER (Boss): Edge 75, Body 70, Chrome 60, HP 250. Integrated weapons deal 2d6+10 damage. Armor plating reduces damage by 5. Ruthless and relentless."

EXAMPLE "Character Progression" entry:
"Earn Progression Points (PP) through gameplay: 5 PP for minor story beats, 10 PP for completing a quest, 25 PP for chapter conclusions, 50 PP for major story milestones. Points can be spent between scenes.

Costs scale with power: Raising a stat costs (current value ÷ 10) PP. So going from 40→41 costs 4 PP, while 60→61 costs 6 PP. New abilities cost 10-30 PP based on power. Upgrading resources (max HP, etc.) costs 5 PP per +10.

Example progression path for a Solo: Start with Edge 50, Chrome 40. After first chapter (25 PP): Raise Edge to 55 (24 PP), save 1 PP. After completing 'Data Heist' quest (+10 PP): Buy 'Chrome Reflexes' ability (10 PP) for +1d6 on initiative. After major story event (+50 PP): Raise Chrome to 50 (44 PP), raise Edge to 56 (5 PP), 1 PP saved."

OUTPUT JSON SCHEMA:
{
  "mechanicsLore": [
    {
      "title": "Character Stats",
      "content": "string (2-4 paragraphs defining 4-8 stats with setting-appropriate names)",
      "type": "mechanics",
      "secret": false,
      "on": true,
      "alwaysOn": true
    },
    {
      "title": "Skills System",
      "content": "string (2-4 paragraphs listing 10-15 skills and how they work)",
      "type": "mechanics",
      "secret": false,
      "on": true,
      "alwaysOn": true
    },
    {
      "title": "Resources & Pools",
      "content": "string (2-4 paragraphs defining HP, energy, and unique resources)",
      "type": "mechanics",
      "secret": false,
      "on": true,
      "alwaysOn": true
    },
    {
      "title": "Dice Rolling Mechanics",
      "content": "string (2-4 paragraphs explaining the dice system step-by-step)",
      "type": "mechanics",
      "secret": false,
      "on": true,
      "alwaysOn": true
    }
    // ... 10-15 total entries covering all required topics
  ]
}

Remember: Output ONLY the JSON object, nothing else.`;
  }

  if (stage === "mechanics") {
    // Get RPG system info - if user specified one, use it; otherwise let AI choose
    const userSpecifiedSystem = config.rpgSystem;
    const rpgDescription = userSpecifiedSystem
      ? RPG_SYSTEM_DESCRIPTIONS[userSpecifiedSystem]
      : null;

    // DC guidelines for all systems (shown to AI so it can pick appropriately)
    const allDCGuidelines = `
DICE SYSTEM OPTIONS (choose the most appropriate for the adventure concept):

1d20 (D&D-style) - Best for: heroic fantasy, tactical combat, class-based RPGs
   DC 5: Trivial | DC 10: Easy | DC 15: Average | DC 20: Hard | DC 25: Very Hard | DC 30+: Legendary
   Formula example: 1d20+{{modifier}}

3d6 (Bell curve) - Best for: realistic settings, GURPS-style, skill-focused games  
   DC 6: Trivial | DC 8: Easy | DC 10: Average | DC 13: Hard | DC 16: Very Hard | DC 18+: Impossible
   Formula example: 3d6+{{modifier}}

2d6 (PbtA-style) - Best for: narrative games, City of Mist, Apocalypse World
   6-: Failure | 7-9: Partial success | 10-11: Full success | 12+: Critical
   Formula example: 2d6+{{modifier}} (modifiers typically -2 to +3)

1d100/Percentile - Best for: Call of Cthulhu, horror, investigation-focused games
   Roll under skill value. Modifiers adjust target number.
   Formula example: 1d100 vs {{skill}}

4dF (Fate) - Best for: narrative-first games, collaborative storytelling
   Compare to opposition ladder: Mediocre (+0) to Legendary (+8)
   Formula example: 4dF+{{skill}}

Year Zero Engine - Best for: survival games, Alien RPG, Forbidden Lands
   Dice pool (count 6s), push mechanic with stress
   Formula example: {{attribute}}d6

Explosive Dice - Best for: over-the-top action, Savage Worlds style
   Dice chain d4→d6→d8→d10→d12, max rolls explode
   Formula example: 1d{{dieSize}}! (exploding)

Narrative (no dice) - Best for: pure storytelling, journaling games
   AI determines outcomes based on character abilities and context`;

    // If user specified a system, show only that one prominently
    const systemGuidance = userSpecifiedSystem
      ? `
DICE SYSTEM: ${rpgDescription}
Use this system for all mechanics. Design DCs, skills, and abilities accordingly.`
      : `
DICE SYSTEM: Choose the most appropriate system based on the adventure concept.
Consider the genre, tone, and user's prompt when selecting. Common choices:
- D&D/fantasy adventure → 1d20 system
- Realistic/skill-based → 3d6 system  
- Narrative/story-focused → 2d6 (PbtA) or Narrative
- Horror/investigation → 1d100 percentile
- Survival/gritty → Year Zero Engine
- Over-the-top action → Explosive dice

${allDCGuidelines}`;

    // DC guidelines based on system (kept for backward compatibility)
    const dcGuidelines: Record<string, string> = {
      "3d6": `DC GUIDELINES (3d6 system - roll 3d6, add modifier, compare to DC):
- Trivial (DC 6): Almost automatic, basic tasks
- Easy (DC 8): Simple tasks most can do
- Average (DC 10): Requires some skill or luck
- Hard (DC 13): Challenging, requires training
- Very Hard (DC 16): Expert-level difficulty
- Impossible (DC 18+): Near-miraculous feats`,
      "1d20": `DC GUIDELINES (d20 system - roll 1d20, add modifier, compare to DC):
- Trivial (DC 5): Almost automatic
- Easy (DC 10): Simple, most succeed
- Average (DC 15): Moderate challenge
- Hard (DC 20): Difficult, trained individuals
- Very Hard (DC 25): Expert difficulty
- Impossible (DC 30+): Legendary feats`,
      "1d100": `DC GUIDELINES (d100 percentile - roll under skill):
- Trivial: +40 to skill
- Easy: +20 to skill
- Average: No modifier
- Hard: -20 to skill
- Very Hard: -40 to skill
- Impossible: -60 to skill`,
      percentile: `DC GUIDELINES (Percentile - roll under skill):
- Trivial: +40 to skill
- Easy: +20 to skill
- Average: No modifier  
- Hard: -20 to skill
- Very Hard: -40 to skill
- Impossible: -60 to skill`,
      pbta: `DC GUIDELINES (PbtA - 2d6 + modifier):
- 6 or less: Failure (bad consequences)
- 7-9: Partial success (succeed with cost/complication)
- 10-11: Full success
- 12+: Critical success (extra benefit)
Modifiers typically range from -2 to +3`,
      fate: `DC GUIDELINES (Fate - 4dF + skill, compare to opposition):
- +0 Mediocre: Average task
- +2 Fair: Requires some skill
- +4 Great: Professional level
- +6 Fantastic: Expert level
- +8 Legendary: Near impossible`,
      yze: `DC GUIDELINES (Year Zero Engine - count 6s in dice pool):
- 1 success needed: Standard task
- 2 successes: Challenging
- 3 successes: Difficult
- 4+ successes: Extreme difficulty
Push mechanic: Re-roll non-6s but take stress`,
      explosive: `DC GUIDELINES (Explosive Dice - dice chain d4→d6→d8→d10→d12):
- Easy: Beat 3
- Average: Beat 5
- Hard: Beat 7
- Very Hard: Beat 9
- Extreme: Beat 11+
Max rolls explode to next die size`,
      narrative: `OUTCOME GUIDELINES (Narrative - no dice):
- AI determines outcomes based on character abilities and situation
- Consider character strengths, weaknesses, and story context
- Failures should create interesting complications, not dead ends`,
    };

    // Get mechanics lore from previous stage for context
    const mechanicsLore = previousResults?.storyTemplate?.lore || [];
    const mechanicsContext =
      mechanicsLore.length > 0
        ? `\n\nREFERENCE - Game rules from previous stage (DO NOT regenerate these):\n${mechanicsLore
            .map((l) => `- ${l.title}`)
            .join("\n")}`
        : "";

    return `${basePrompt}

STAGE 3: CHARACTER SYSTEM & DATA
Create a complete character sheet structure based on the game rules established in the previous stage.
${mechanicsContext}

RPG SYSTEM: ${rpgDescription}

${userSpecifiedSystem ? dcGuidelines[userSpecifiedSystem] : systemGuidance}

IMPORTANT: The game rules have already been created. Your job is to design the CHARACTER SHEET that works with those rules.
Focus on creating fields (stats, skills, resources) that align with the mechanics documentation.

═══════════════════════════════════════════════════════════════
PART 1: CHARACTER SCHEMA
═══════════════════════════════════════════════════════════════

Design a complete character sheet with these REQUIRED elements:

A. CORE ATTRIBUTES:
   Create the fundamental stats that define a character - as many as your system needs.
   Examples: Strength, Dexterity, Intelligence, Charisma, Willpower, Perception
   Type: "number" - use a scale appropriate to your RPG system (e.g., 3-18 for D&D-style, 1-10 for simple systems, percentile for d100)

B. DERIVED STATS (optional):
   Calculated from core attributes using formulas.
   Formula syntax: "floor(({{attribute}} - 10) / 2)" or "{{stat1}} + {{stat2}}"
   Examples: Attack Bonus, Defense Rating, Initiative Modifier

C. SKILLS:
   Specific trained abilities linked to attributes - include as many as appropriate for the system.
   Type: "number" representing proficiency or bonus (scale should match your attribute system)
   Examples: Athletics, Stealth, Persuasion, Arcana, Medicine, Investigation

D. RESOURCES:
   Pools that deplete and regenerate - as many as your system requires.
   Type: "resource" with current/max values
   Examples: Health, Mana, Stamina, Sanity, Stress, Luck Points

E. CHARACTER IDENTITY:
   - "select" type for class/archetype (REQUIRED - based on classes defined in game rules)
   - "text" for character name, backstory
   - "list" for inventory, languages, known spells
   - "boolean" for special traits

FIELD TYPE REFERENCE:
- "number": Simple numeric (stats, skills)
- "derived": Calculated via formula
- "resource": Current/max pool (health, mana)
- "text": Free text (name, notes)
- "list": Array of items (inventory, languages) - supports both strings and objects!
  - Simple: ["Sword", "Shield", "Potion"]
  - Objects: [{ name: "Iron Sword", emoji: "⚔️", description: "A sturdy blade", quantity: 1 }]
  - Mixed: ["Common Item", { name: "Special Item", emoji: "💎" }]
- "boolean": True/false flags
- "select": Dropdown with predefined options

═══════════════════════════════════════════════════════════════
PART 2: CLASSES/ARCHETYPES (REQUIRED)
═══════════════════════════════════════════════════════════════

Create distinct character classes/archetypes as a "select" field - as many as fit the setting.
Each class should have:
- Unique name and playstyle
- Suggested stat priorities
- Thematic abilities they'd focus on
- Role in a group (combat, support, utility, social)

Base the classes on those described in the game rules (Classes Overview lore entry).

═══════════════════════════════════════════════════════════════
PART 3: STORY VARIABLES
═══════════════════════════════════════════════════════════════

Create 3-6 hidden variables to track story progress:
- Relationship scores with key NPCs
- Faction reputation
- Story progress flags
- Quest completion counts

STARTING VALUES (Level 1 - START WEAK):
- Core attributes: Most 20-35, one specialty at 50-60
- Skills: Most 15-30, trained skills 35-50
- Resources: Appropriate starting pools

CRITICAL: CREATE UNIQUE, ADVENTURE-SPECIFIC CONTENT!
- Do NOT use generic fantasy items (no "Leather armor", "Short sword", "Torch")
- Do NOT use D&D-style classes (no "Warrior/Mage/Rogue" unless it fits the specific setting)
- All items, classes, abilities MUST be thematically specific to THIS adventure's setting

OUTPUT JSON SCHEMA:
{
  "characterSchema": {
    "version": 1,
    "name": "string (unique system name for THIS adventure)",
    "description": "string (brief system description)",
    "fields": [
      { "id": "stat_id", "name": "Stat Name", "type": "number", "category": "category_id", "description": "What this measures", "defaultValue": 30, "min": 1, "max": 100 },
      { "id": "resource_id", "name": "Resource Name", "type": "resource", "category": "category_id", "description": "What this represents", "defaultValue": 25, "defaultMax": 25, "regenerates": true },
      { "id": "derived_id", "name": "Derived Stat", "type": "derived", "category": "category_id", "formula": "floor(({{stat_id}} - 10) / 2)" },
      { "id": "class_id", "name": "Background/Role/Class", "type": "select", "category": "category_id", "options": [
        {"value": "option1", "label": "Role 1 - Description specific to setting"},
        {"value": "option2", "label": "Role 2 - Description specific to setting"},
        {"value": "option3", "label": "Role 3 - Description specific to setting"}
      ], "defaultValue": "option1" },
      { "id": "inventory", "name": "Inventory/Equipment/Gear", "type": "list", "category": "category_id", "defaultValue": ["Setting-appropriate item"] }
    ],
    "categories": [
      { "id": "category_id", "name": "Category Name", "order": 0 }
    ]
  },
  "characterData": {
    "values": {
      "stat_id": 30,
      "resource_id": { "current": 25, "max": 25 },
      "derived_id": 2,
      "class_id": "option1",
      "inventory": ["Item appropriate to setting and player background"]
    }
  },
  "variables": [
    { "id": "var_story_id", "name": "Story Variable Name", "type": "number", "value": 1, "minValue": 1, "maxValue": 10 }
  ]
}

Remember: Output ONLY the JSON object, nothing else.`;
  }

  // CHARACTER SHEET STAGE (runs after mechanics, in parallel with content)
  if (stage === "character-sheet") {
    // Get characterSchema from previous mechanics stage
    const characterSchema = previousResults?.storyTemplate?.characterSchema;
    const schemaContext = characterSchema
      ? `The character system has these fields:\n${JSON.stringify(
          characterSchema.fields?.map((f) => ({
            id: f.id,
            name: f.name,
            type: f.type,
            category: f.category,
          })),
          null,
          2
        )}\n\nCategories:\n${JSON.stringify(
          characterSchema.categories,
          null,
          2
        )}`
      : "Use standard fantasy RPG fields: strength, dexterity, constitution, intelligence, wisdom, charisma as core stats, plus health/mana resources, and common skills.";

    return `${basePrompt}

STAGE 2B: CHARACTER SHEET DESIGN
Create the visual character sheet pages for the character system defined in the mechanics stage.

IMPORTANT: You are designing HTML/CSS templates that will display character data.
The character fields have already been defined - your job is to create beautiful, functional visual pages.

CHARACTER SCHEMA CONTEXT:
${schemaContext}

═══════════════════════════════════════════════════════════════
CHARACTER SHEET PAGES (HTML/CSS)
═══════════════════════════════════════════════════════════════

Create MULTIPLE CHARACTER SHEET PAGES for better organization.
Each page gets its own tab in the player's Stats panel.

TEMPLATE SYNTAX (for all pages):
- {{fieldId}} - Insert field value
- {{fieldId.current}}/{{fieldId.max}} - Resource values  
- {{percent fieldId}} - Resource as percentage (for progress bars)
- {{length fieldId}} - Get array length (e.g., Total Items: {{length inventory}})
- {{#if fieldId}}...{{/if}} - Conditional display
- {{#unless fieldId}}...{{/unless}} - Inverse conditional
- {{#each fieldId}}...{{/each}} - List iteration
  - For string lists: {{this}} = the string value
  - For object lists: {{this.name}}, {{this.emoji}}, {{this.description}}, {{this.quantity}}
  - Position helpers: {{@index}}, {{@first}}, {{@last}}
  - Conditional: {{#unless @last}}, {{/unless}} for separators
- {{#times N}}...{{/times}} - Repeat content N times ({{@index}} available inside)
- {{#compare fieldId ">" "10"}}...{{/compare}} - Comparisons
  - Supports field.property refs: {{#compare hp.current "<" (div hp.max 2)}}
  - Expression functions: (div a b), (mul a b), (add a b), (sub a b), (min a b), (max a b)

ICON HELPER (renders inline SVG icons):
- #icon(sword) - Fuzzy matches "sword" to "crossed-swords" icon
- #icon(health) - Matches to "heart-beats" icon  
- #icon(magic) - Matches to "magic-swirl" icon
- Works with any descriptive name - the system has 4000+ RPG icons and will find the best match!
- Example: <span>#icon(armor)</span> Armor Class: {{ac}}

JAVASCRIPT SUPPORT (optional but encouraged for interactive features):
The "js" field can contain JavaScript that executes in the character sheet iframe.
Available features:
- document.querySelector/querySelectorAll for DOM manipulation
- Add click handlers for collapsible sections
- Add hover effects or tooltips
- Animate progress bars
- Toggle visibility of detail sections

JS Examples:
- Collapsible sections:
  document.querySelectorAll('.section-header').forEach(h => h.onclick = () => h.nextElementSibling.classList.toggle('collapsed'));
- Smooth progress bar animation:
  document.querySelectorAll('.bar-fill').forEach(b => { b.style.transition = 'width 0.5s ease'; });
- Tooltip on hover:
  document.querySelectorAll('[data-tooltip]').forEach(el => { el.onmouseenter = e => showTooltip(e, el.dataset.tooltip); });

REQUIRED PAGES (3-5 pages total):

1. OVERVIEW PAGE (id: "overview", icon: "User"):
   - Character identity (name, class, portrait placeholder)
   - Core attributes as a compact grid
   - Most important resources (HP, main resource) as prominent bars
   - Brief summary info

2. COMBAT PAGE (id: "combat", icon: "Swords"):
   - Combat-relevant stats (attack, defense, initiative)
   - All combat resources (HP, shields, armor)
   - Combat skills
   - Conditions display area

3. SKILLS PAGE (id: "skills", icon: "BookOpen"):
   - All skills organized by type
   - Skill modifiers clearly shown
   - Related attribute shown next to each skill

4. INVENTORY PAGE (id: "inventory", icon: "Backpack"):
   - Equipment lists
   - Carried items
   - Currency/wealth tracking
   - Weight/encumbrance if applicable

5. (OPTIONAL) MAGIC/ABILITIES PAGE (id: "magic", icon: "Sparkles"):
   - If system has magic/powers, dedicate a page
   - Mana/power points resource
   - Spell/ability lists
   - Cooldowns or slot tracking

DESIGN REQUIREMENTS PER PAGE:
- Dark theme with consistent accent colors across pages
- Each page is self-contained (don't split related info across pages)
- Progress bars for resources
- Organized sections with borders/cards
- Thematic styling matching the genre
- Compact but readable layout

OUTPUT JSON SCHEMA:
{
  "pages": [
    {
      "id": "overview",
      "name": "Overview",
      "icon": "User",
      "order": 0,
      "template": {
        "html": "<!-- Full HTML for overview page with {{fieldId}} placeholders -->",
        "css": "/* Complete CSS for this page */",
        "js": "// Optional: interactive features like collapsible sections"
      }
    },
    {
      "id": "combat",
      "name": "Combat",
      "icon": "Swords",
      "order": 1,
      "template": {
        "html": "<!-- Combat page HTML -->",
        "css": "/* Combat page CSS */",
        "js": "// Optional: hover effects, animated bars"
      }
    },
    {
      "id": "skills",
      "name": "Skills", 
      "icon": "BookOpen",
      "order": 2,
      "template": {
        "html": "<!-- Skills page HTML -->",
        "css": "/* Skills page CSS */",
        "js": ""
      }
    },
    {
      "id": "inventory",
      "name": "Inventory",
      "icon": "Backpack",
      "order": 3,
      "template": {
        "html": "<!-- Inventory page HTML -->",
        "css": "/* Inventory page CSS */",
        "js": ""
      }
    }
  ]
}

NOTE: If ANY page has non-empty "js" content, the character schema will automatically be flagged with hasCustomJS=true.

CRITICAL DESIGN NOTES:
- Each page should be a complete, styled HTML document with its own CSS
- Pages should NOT duplicate information - split content logically:
  * Overview: Quick reference (identity, main stats, key resources)
  * Combat: Everything combat-related (HP, attack, defense, conditions)
  * Skills: All skills with modifiers and linked attributes
  * Inventory: Equipment, items, currency, encumbrance
- Use consistent colors/fonts across all pages for a unified feel
- Progress bars use: style="width: {{percent fieldId}}%"
- Each page's HTML should be self-contained and visually complete

Remember: Output ONLY the JSON object, nothing else.`;
  }

  // CONTENT SUBSTAGES
  if (stage === "content-lore") {
    return `${basePrompt}

STAGE 3A: LORE & WORLD-BUILDING
Generate detailed lore entries that bring the world to life. Create as many entries as needed to fully flesh out this adventure's world.

LORE ENTRY GUIDELINES:
Create DETAILED, RICH lore entries. Each entry should be 2-4 paragraphs with specific names, dates, and vivid descriptions.

REQUIRED LORE CATEGORIES (create appropriate number for each):

1. KEY NPCs:
   - Important characters the player will meet or hear about
   - Include their appearance, personality, motivations, secrets, and relationship to the main plot

2. LOCATIONS:
   - Major places in the world (cities, dungeons, landmarks)
   - Describe atmosphere, notable features, dangers, and history

3. FACTIONS & ORGANIZATIONS:
   - Groups with power and influence in the world
   - Their goals, methods, leaders, symbols, and relationship to other factions

4. HISTORY & PAST EVENTS:
   - Important historical events that shaped the current world
   - Ancient wars, fallen kingdoms, legendary heroes, catastrophes

5. UPCOMING THREATS & EVENTS:
   - Looming dangers or prophecies about the future
   - Set these as secret=true for dramatic reveals

6. WORLD LORE:
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
    return `${basePrompt}

STAGE 3B: GOALS & MILESTONES
Generate achievements and quests appropriate for this adventure's scope.

GUIDELINES:
- Create achievements for major story milestones, exploration, combat feats, social victories, and secret discoveries
- Create quests for main story objectives and optional side content

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

  // ADVANCED SUBSTAGES
  if (stage === "advanced-presets") {
    if (!config.includePresets) {
      return `${basePrompt}

STAGE 4A: CHARACTER PRESETS
Character presets are not enabled for this adventure.

OUTPUT JSON SCHEMA:
{}

Output an empty JSON object.`;
    }

    return `${basePrompt}

STAGE 4A: CHARACTER PRESETS
Generate several different character builds/classes appropriate for this adventure.

Each preset offers a meaningfully different playstyle with unique character sheet values and abilities.

IMPORTANT: Each preset MUST include abilities. Use abilities from the mechanics stage as a base.
IMPORTANT: Presets modify the characterData.values, NOT the characterSchema. The schema is shared.

CRITICAL - PRESET INTROS:
The "intro" field is a COMPLETE REPLACEMENT for the default intro (3-5 paragraphs).
The "playerSummary" is also a COMPLETE REPLACEMENT (2-3 paragraphs).

REQUIRED - "CUSTOM" PRESET:
You MUST include a preset with id="preset-custom" and name="Custom" as the LAST preset.
This is for players who want to create their own character (self-insert).
- Use balanced starting values for character fields
- Generic playerName like "Adventurer" or "Traveler"
- playerSummary should be vague and open-ended ("A mysterious stranger...")
- intro should be generic, letting the player define their own backstory
- Include basic starting gear in inventory and no special abilities beyond novice level

CRITICAL - USE SETTING-APPROPRIATE ITEMS:
- Each preset's inventory MUST contain items thematically appropriate to THIS adventure's setting
- Do NOT use generic fantasy items (no "Leather armor", "Short sword", "Torch", "Healing potion")
- Items should reflect the character's background and the world they live in
- Examples: A cyberpunk hacker might have "Data spike", "Neural interface", "Stimpack"
- Examples: A Lovecraftian investigator might have "Dog-eared journal", "Revolver", "Strange amulet"

CHARACTER FIELD VALUES FOR PRESETS (LEVEL 1 CHARACTERS - START WEAK):
- Use values appropriate to your chosen stat scale (D&D 3-18, simple 1-10, percentile, etc.)
- MOST stats should be below average (untrained/weak areas)
- A FEW stats (2-3) should be slightly above average (developing skills)
- Only ONE or TWO stats should be notably high (natural talent/specialty)
- Starting characters should feel capable but not overpowered

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
      "characterData": {
        "values": {
          "fieldId1": number_or_value,
          "fieldId2": { "current": number, "max": number },
          "inventory": ["item1", "item2"]
        }
      },
      "abilities": [{ "name": "string", "description": "string", "grade": "string", "cost": [], "cooldown": number, "currentCooldown": 0, "symbol": "emoji" }],
      "authorNotes": "string"
    }
  ]
}

Remember: Output ONLY the JSON object, nothing else.`;
  }

  if (stage === "advanced-tables") {
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

    if (config.includeCustomTables) {
      instructions += `
CUSTOM RANDOM TABLES:
Create as many tables as appropriate for this adventure's scope.
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

  if (stage === "advanced-other") {
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

    if (config.includeUpgradeShop) {
      instructions += `
UPGRADE SHOP:
Configure the progression/upgrade system where players spend points.

CRITICAL - SETTING-SPECIFIC SHOP ITEMS:
- All shop items MUST be thematically appropriate to THIS adventure's setting
- Do NOT use generic fantasy items (no "Healing Potion", "Sword", "Shield", "Rations")
- Item names and descriptions should reflect the world's technology, magic system, culture
- Example: Sci-fi might have "Stim-injector", "Plasma cutter", "Personal shield emitter"
- Example: Victorian horror might have "Laudanum tincture", "Silver-tipped cane", "Spirit ward"
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
    "presets": { "PresetName": "icon-id", ... }
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
  const systemPrompt = buildSystemPrompt(config, stage, previousResults);

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
 * Clean continuation content to handle common issues:
 * - Overlap with original content (AI repeating the end of prefill)
 * - Extra leading whitespace/newlines
 * - Markdown code block markers
 * - Content that starts with a fresh JSON object
 */
export function cleanContinuationContent(
  originalContent: string,
  continuationContent: string
): string {
  let cleaned = continuationContent;

  // Remove leading whitespace/newlines
  cleaned = cleaned.replace(/^[\s\n]+/, "");

  // Remove any markdown code block markers
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, "");
  cleaned = cleaned.replace(/```\s*$/g, "");

  // If continuation starts with "{" and original doesn't end with a comma or opening bracket,
  // the AI might have started over - this is a bad continuation
  const originalTrimmed = originalContent.trimEnd();
  if (
    cleaned.startsWith("{") &&
    !originalTrimmed.endsWith(",") &&
    !originalTrimmed.endsWith("[") &&
    !originalTrimmed.endsWith(":")
  ) {
    // AI started a fresh JSON object - try to detect overlap
    // Look for the last 50-100 chars of original in the continuation
    const overlapCheckLength = Math.min(100, originalContent.length);
    const originalEnd = originalContent.slice(-overlapCheckLength);

    // Check if continuation starts with something that looks like original content
    const overlapIndex = cleaned.indexOf(originalEnd.slice(-30));
    if (overlapIndex !== -1 && overlapIndex < 50) {
      // Found overlap - skip the overlapping part
      cleaned = cleaned.slice(overlapIndex + originalEnd.slice(-30).length);
    } else {
      // No clear overlap found - this continuation is probably bad
      // Return empty to let the repair fallback handle it
      console.warn(
        "Continuation appears to have restarted JSON, discarding continuation"
      );
      return "";
    }
  }

  // Detect and remove overlap where AI repeated the end of the prefill
  // Check if first 20-50 chars of continuation match end of original
  const checkLengths = [50, 40, 30, 20, 15, 10];
  for (const len of checkLengths) {
    if (cleaned.length < len) continue;
    const continuationStart = cleaned.slice(0, len);
    const originalEndCheck = originalContent.slice(-len);

    if (continuationStart === originalEndCheck) {
      // Found exact overlap - remove it
      cleaned = cleaned.slice(len);
      console.log(`Removed ${len} chars of overlap from continuation`);
      break;
    }
  }

  return cleaned;
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

  // Fix Python-style triple-quoted strings (""") to proper JSON strings
  // The AI sometimes outputs: "html": """<div>...</div>""" instead of "html": "<div>...</div>"
  // We need to convert these to properly escaped JSON strings
  jsonContent = jsonContent.replace(
    /:\s*"""([\s\S]*?)"""/g,
    (match, innerContent) => {
      // Escape the inner content for JSON: escape backslashes, quotes, and newlines
      const escaped = innerContent
        .replace(/\\/g, "\\\\")
        .replace(/"/g, '\\"')
        .replace(/\n/g, "\\n")
        .replace(/\r/g, "\\r")
        .replace(/\t/g, "\\t");
      return `: "${escaped}"`;
    }
  );

  // Fix malformed property names like `" "name"` or `"  "name"` -> `"name"`
  // This handles AI mistakes where a space appears before the property name
  jsonContent = jsonContent.replace(/"[ \t]+"([^"]+)"(\s*:)/g, '"$1"$2');

  // Fix cases like `" "name":` (orphaned quote with space before actual name)
  jsonContent = jsonContent.replace(/"[ \t]+"/g, '"');

  // Fix unquoted emoji values like "symbol": ⚔️ -> "symbol": "⚔️"
  // Matches: colon, optional whitespace, emoji(s) with optional variation selectors, optional whitespace before comma/bracket/brace/newline
  // Emoji ranges include: Emoticons, Dingbats, Symbols, Supplemental Symbols, Variation Selectors, Zero-Width Joiner, etc.
  jsonContent = jsonContent.replace(
    /:\s*([\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{FE00}-\u{FE0F}\u{200D}]+)\s*([,}\]\r\n])/gu,
    ': "$1"$2'
  );

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

    if (stage === "mechanics-notes") {
      // Mechanics notes stage - just the game rules documentation
      const lore = parsed.mechanicsLore || [];
      return {
        storyTemplate: {
          lore: lore, // Mechanics lore entries go to main lore array
        },
      };
    }

    if (stage === "mechanics") {
      // Character system stage - no mechanicsLore (comes from mechanics-notes stage)
      return {
        storyTemplate: {
          characterSchema: parsed.characterSchema,
          characterData: parsed.characterData,
          abilities: parsed.abilities,
          variables: parsed.variables,
        },
      };
    }

    if (stage === "character-sheet") {
      // Character sheet pages - returned at top level, merged into characterSchema later
      return {
        characterSchemaPages: parsed.pages,
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

    // Merge characterSchemaPages into characterSchema
    if (result.characterSchemaPages && result.characterSchemaPages.length > 0) {
      if (!merged.storyTemplate.characterSchema) {
        console.warn(
          "characterSchemaPages received but no characterSchema exists"
        );
      } else {
        // Check if any page has custom JS
        const hasCustomJS = result.characterSchemaPages.some(
          (page) => page.template?.js && page.template.js.trim().length > 0
        );
        merged.storyTemplate.characterSchema = {
          ...merged.storyTemplate.characterSchema,
          pages: result.characterSchemaPages,
          hasCustomJS,
        };
      }
    }

    if (result.storyTemplate) {
      // Merge array fields by concatenation instead of replacement
      const arrayFields = [
        "lore",
        "abilities",
        "achievements",
        "quests",
        "presets",
        "customTables",
        "variables",
        "relationships",
        "inventory",
        "stats",
        "resources",
        "conditions",
      ] as const;

      // Create a new storyTemplate with merged arrays
      const mergedTemplate = {
        ...merged.storyTemplate,
        ...result.storyTemplate,
      };

      // Helper to get unique identifier from any item
      const getItemId = (item: unknown): string => {
        if (typeof item === "string" || typeof item === "number") {
          return String(item);
        }
        if (item && typeof item === "object") {
          const obj = item as { name?: string; title?: string; id?: string };
          return String(
            obj.name || obj.title || obj.id || JSON.stringify(item)
          );
        }
        return JSON.stringify(item);
      };

      // For each array field, concatenate instead of replace
      for (const field of arrayFields) {
        const existingArray = merged.storyTemplate[field];
        const newArray =
          result.storyTemplate[field as keyof typeof result.storyTemplate];
        if (Array.isArray(existingArray) && Array.isArray(newArray)) {
          // Concatenate arrays, avoiding duplicates by name/title/id
          const existingIds = new Set(existingArray.map(getItemId));
          const uniqueNewItems = newArray.filter(
            (item) => !existingIds.has(getItemId(item))
          );
          (mergedTemplate as Record<string, unknown>)[field] = [
            ...existingArray,
            ...uniqueNewItems,
          ];
        }
      }

      merged.storyTemplate = mergedTemplate;
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
    // Mechanics notes stage runs first (game rules documentation)
    stages.push("mechanics-notes");
    // Then character system stage (stats, skills, etc.)
    stages.push("mechanics");
    // Character sheet runs after mechanics (needs field definitions)
    stages.push("character-sheet");
  }

  // Content substages - all enabled if content stage is enabled
  const contentEnabled = stageConfigs.content?.enabled !== false;

  if (contentEnabled) {
    stages.push("content-lore");
    stages.push("content-achievements");
  }

  // Advanced substages - only if specific features are enabled AND advanced stage is enabled
  const advancedEnabled = stageConfigs.advanced?.enabled !== false;

  if (advancedEnabled && config.includePresets) {
    stages.push("advanced-presets");
  }
  if (advancedEnabled && (config.includeAGMT || config.includeCustomTables)) {
    stages.push("advanced-tables");
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
    "mechanics-notes": 3500, // Expanded prompt with foundational systems
    mechanics: 3000,
    "character-sheet": 2500,
    "content-lore": 3500,
    "content-achievements": 3000,
    "advanced-presets": 4000,
    "advanced-tables": 3000,
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

  // Build context from current result
  let context = `ADVENTURE CONTEXT:
Title: ${currentResult.title}
Genre: ${config.genre || "Not specified"}
NSFW: ${config.nsfw ? "Allowed" : "Not allowed"}
Complexity: ${config.complexity}

DICE MECHANICS: The game uses a flexible formula-based dice system. The GM stage handles all dice rolls using the formula_roll tool with formulas like "1d20+{{STR}}".

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
    { instruction: string; schema: string }
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
    characterSchema: {
      instruction: `Generate a complete character schema with as many fields as appropriate for this adventure, organized categories, and a custom HTML/CSS character sheet template.

REQUIRED FIELD TYPES:
- Core attributes (4-6): Strength, Intelligence, etc. - type "number"
- Derived stats (2-4): Calculated via formula - type "derived"  
- Resources (2-4): Health, Mana, etc. - type "resource"
- Skills (4-8): Trained abilities - type "number"
- Class/Archetype: Required "select" field with 4-6 options
- Inventory: Required "list" field for items

FIELD TYPE REFERENCE:
- number: Plain numeric (Strength: 30)
- derived: Formula-based, use {{fieldId}} syntax (Modifier: floor(({{strength}} - 10) / 2))
- resource: Current/max pair (Health: 25/50)
- text: Free text (Background, Notes)
- list: Array of strings (Inventory, Languages)
- boolean: True/false (HasMagic, IsNoble)
- select: Dropdown with label/value options

TEMPLATE REQUIREMENTS:
Generate a custom HTML/CSS template for the character sheet.
- Use {{fieldId}} to insert values
- Use {{percent fieldId}} for resource bars (0-100)
- Use {{length fieldId}} for array counts
- Use {{#each fieldId}}{{this}}{{/each}} for lists
- Use {{#times N}}...{{/times}} to repeat elements N times
- Dark theme with genre-appropriate styling
- Clear visual hierarchy with sections

CATEGORIES: Group fields logically (Attributes, Combat, Skills, Equipment, Background).`,
      schema: `{ "characterSchema": { "fields": [...], "categories": [...], "template": { "html": "<div class='sheet'>...</div>", "css": ".sheet { background: #1a1a2e; ... }", "js": "" }, "hasCustomJS": false }, "characterData": { "values": { "field_id": value } } }`,
    },
    variables: {
      instruction:
        "Generate 3-6 story tracking variables (mix of number, boolean, string, and list types). String variables can have optional predefined options.",
      schema: `{ "variables": [{ "id": "var_xxx", "name": "string", "description": "string", "type": "number|boolean|string|list", "value": any, "options": ["opt1", "opt2", ...] (string type only, optional) }] }`,
    },
    mechanicsLore: {
      instruction: `Generate mechanics lore entries explaining game rules and systems. Create as many as needed to cover all the important mechanics.

CRITICAL: ALL mechanics lore entries MUST have "alwaysOn": true!
Mechanics are rules references that players need access to at all times - never hidden behind triggers.

REQUIRED MECHANICS TOPICS:
- How skill checks work (dice system, modifiers, DCs)
- Combat rules (initiative, attacks, damage, conditions)
- Character progression (leveling, XP, upgrades)
- Rest & recovery (how resources regenerate)
- Death & defeat (what happens at 0 HP)

CRITICAL GM GUIDELINES (also required):
- "Creating NPCs & Enemies" - Stat ranges (weak: 20-35, average: 40-55, strong: 60-75, boss: 80+), HP guidelines, damage scaling, example stat blocks
- "Item Guidelines" - Grade bonuses, durability system, consumable vs equipment, creating balanced items
- "Encounter Design" - Single vs group enemies, scene challenges, environmental hazards

Write for players AND the AI GM who need to understand how the game works.`,
      schema: `{ "lore": [{ "title": "string", "content": "string (2-3 paragraphs explaining the mechanic)", "type": "mechanics", "alwaysOn": true, "secret": false }] }`,
    },
    lore: {
      instruction: `Generate DETAILED lore entries with dynamic triggers. Create as many as needed to flesh out the world.

REQUIRED LORE CATEGORIES (distribute across all):
- KEY NPCs (3-4): Important characters with appearance, personality, motivations, secrets
- LOCATIONS (3-4): Major places with atmosphere, features, dangers, history
- FACTIONS (2-3): Organizations with goals, methods, leaders
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
      schema: `{ "lore": [{ "title": "Lord Varen Blackwood", "content": "string (2-4 detailed paragraphs)", "secret": false, "on": false, "alwaysOn": false, "on_triggers": ["Varen", "Blackwood", "Lord Blackwood", "the lord"], "off_triggers": [], "var_on_triggers": [] }] }`,
    },
    achievements: {
      instruction: `Generate achievements with ai_hint for precise triggering. Create as many as appropriate for this adventure's scope.`,
      schema: `{ "achievements": [{ "title": "string", "description": "string", "ai_hint": "string", "points": number, "symbol": "emoji", "dateAchieved": null }] }`,
    },
    quests: {
      instruction: `Generate quests with objectives. Create as many as appropriate for this adventure's scope.`,
      schema: `{ "quests": [{ "id": "quest_xxx", "title": "string", "shortDescription": "string", "description": "string", "points": number, "active": boolean, "fulfilled": false }] }`,
    },
    presets: {
      instruction: `Generate character presets with unique character data and abilities. Create as many as appropriate to give players meaningful choices.

CRITICAL: Each preset's "intro" is a COMPLETE REPLACEMENT (3-5 paragraphs) for the default intro, NOT an addition.
Each preset's "playerSummary" is a COMPLETE REPLACEMENT (2-3 paragraphs) for the default player background.
Write full, standalone content - not fragments!`,
      schema: `{ "presets": [{ "id": "preset-xxx", "name": "string", "description": "string", "icon": "emoji", "playerName": "string", "playerSummary": "string (2-3 paragraphs)", "intro": "string (3-5 paragraphs - COMPLETE replacement)", "characterData": { "values": { "field_id": value } }, "abilities": [...], "authorNotes": "string" }] }`,
    },
    agmt: {
      instruction: "Generate Advanced RPG Tools initial state for solo play.",
      schema: `{ "agmtState": { "chaosFactor": number (1-9), "sceneCount": 0, "threads": [{ "id": "thread_xxx", "description": "string", "status": "active" }], "characters": [{ "id": "char_xxx", "name": "string", "role": "string", "status": "active" }], "skillCheckHistory": [], "currentStreak": 0, "lastChaosAdjustment": 0 } }`,
    },
    customTables: {
      instruction: `Generate random tables (encounters, weather, events, etc). Create as many tables as needed. Each table MUST have 20-50 entries for proper variety.`,
      schema: `{ "customTables": [{ "id": "table_xxx", "name": "string", "description": "string", "entries": [{ "text": "string (20-50 entries per table!)", "weight": number (1-10) }] }] }`,
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
      case "characterSchema":
        return {
          storyTemplate: {
            characterSchema: parsed.characterSchema,
            characterData: parsed.characterData,
          },
        };
      case "variables":
        return { storyTemplate: { variables: parsed.variables } };
      case "mechanicsLore":
        return { storyTemplate: { lore: parsed.lore } };
      case "lore":
        return { storyTemplate: { lore: parsed.lore } };
      case "achievements":
        return { storyTemplate: { achievements: parsed.achievements } };
      case "quests":
        return { storyTemplate: { quests: parsed.quests } };
      case "presets":
        return { storyTemplate: { presets: parsed.presets } };
      case "agmt":
        return { storyTemplate: { agmtState: parsed.agmtState } };
      case "customTables":
        return { storyTemplate: { customTables: parsed.customTables } };
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
  "characterSchema",
  "mechanicsLore",
  "lore",
  "achievements",
  "quests",
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

  // Get existing content based on section
  let existingItems: { name?: string; title?: string }[] = [];
  let existingItemsPreview = "";

  if (existingResult.storyTemplate) {
    const template = existingResult.storyTemplate;
    switch (section) {
      case "characterSchema": {
        const fields = template.characterSchema?.fields || [];
        existingItems = fields as { name?: string; title?: string }[];
        existingItemsPreview = fields.map((f) => f.name).join(", ");
        break;
      }
      case "mechanicsLore": {
        const mechLore = (template.lore || []).filter(
          (l) => l.type === "mechanics"
        );
        existingItems = mechLore as { name?: string; title?: string }[];
        existingItemsPreview = mechLore
          .map((l) => l.title)
          .filter(Boolean)
          .join(", ");
        break;
      }
      case "lore": {
        const worldLore = (template.lore || []).filter(
          (l) => l.type !== "mechanics"
        );
        existingItems = worldLore as { name?: string; title?: string }[];
        existingItemsPreview = worldLore
          .map((l) => l.title)
          .filter(Boolean)
          .join(", ");
        break;
      }
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
      case "variables":
        existingItems = (template.variables || []) as {
          name?: string;
          title?: string;
        }[];
        existingItemsPreview = existingItems
          .map((v) => v.name)
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

DICE MECHANICS: The game uses a flexible formula-based dice system. The GM stage handles all dice rolls using the formula_roll tool with formulas like "1d20+{{STR}}".

EXISTING ${sectionInfo.name.toUpperCase()} (${existingItems.length} items):
${existingItemsPreview || "(none)"}`;

  // Section-specific extend prompts
  const sectionPrompts: Record<
    RegenerateSection,
    { instruction: string; schema: string }
  > = {
    title: { instruction: "", schema: "" },
    intro: { instruction: "", schema: "" },
    characterSchema: {
      instruction: `Generate NEW character schema fields that complement the existing ones. Avoid duplicating existing fields. Generate as many as possible.`,
      schema: `{ "characterSchema": { "fields": [{ "id": "field_xxx", "name": "string", "type": "number|derived|resource|text|list|boolean|select", "category": "string", "description": "string", "defaultValue": any }], "categories": [{ "id": "cat_xxx", "name": "string", "order": number }] } }`,
    },
    variables: {
      instruction: `Generate NEW variables. Generate as many as possible.`,
      schema: `{ "variables": [{ "name": "string", "value": number, "symbol": "emoji" }] }`,
    },
    mechanicsLore: {
      instruction: `Generate NEW mechanics lore entries explaining game rules and systems. Generate as many as possible.

CRITICAL: ALL mechanics lore entries MUST have "alwaysOn": true!
Mechanics are rules references that players need access to at all times.

Consider adding GM guidelines for:
- Creating NPCs & Enemies (stat ranges, HP guidelines, damage scaling)
- Item Guidelines (grade bonuses, durability, creating balanced items)
- Encounter Design (single vs group, scene challenges, environmental hazards)`,
      schema: `{ "lore": [{ "title": "string", "content": "string (2-3 paragraphs)", "type": "mechanics", "alwaysOn": true, "secret": false }] }`,
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
      schema: `{ "lore": [{ "title": "Captain Sera Vex", "content": "string (2-4 detailed paragraphs)", "secret": false, "on": false, "alwaysOn": false, "on_triggers": ["Sera", "Vex", "Captain Vex", "the captain"], "off_triggers": [], "var_on_triggers": [] }] }`,
    },
    achievements: {
      instruction: `Generate NEW achievements with ai_hint for precise triggering. Generate as many as possible.`,
      schema: `{ "achievements": [{ "title": "string", "description": "string", "ai_hint": "string", "points": number, "symbol": "emoji", "dateAchieved": null }] }`,
    },
    quests: {
      instruction: `Generate NEW quests with objectives. Generate as many as possible.`,
      schema: `{ "quests": [{ "id": "quest_xxx", "title": "string", "shortDescription": "string", "description": "string", "points": number, "active": boolean, "fulfilled": false }] }`,
    },
    presets: {
      instruction: `Generate NEW character presets with unique character data and abilities. Generate as many as the output budget allows.

CRITICAL: Each preset's "intro" is a COMPLETE REPLACEMENT (3-5 paragraphs) for the default intro, NOT an addition.
Each preset's "playerSummary" is a COMPLETE REPLACEMENT (2-3 paragraphs) for the default player background.
Write full, standalone content - not fragments!`,
      schema: `{ "presets": [{ "id": "preset-xxx", "name": "string", "description": "string", "icon": "emoji", "playerName": "string", "playerSummary": "string (2-3 paragraphs)", "intro": "string (3-5 paragraphs - COMPLETE replacement)", "characterData": { "values": { "field_id": value } }, "abilities": [...], "authorNotes": "string" }] }`,
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
      case "characterSchema": {
        // Merge fields and categories intelligently
        const existingSchema = template.characterSchema || {
          version: 1,
          name: "Custom",
          fields: [],
          categories: [],
        };
        const newFields = parsed.characterSchema?.fields || [];
        const newCategories = parsed.characterSchema?.categories || [];
        const existingCategories = existingSchema.categories || [];
        return {
          storyTemplate: {
            characterSchema: {
              ...existingSchema,
              fields: [...existingSchema.fields, ...newFields],
              categories: [
                ...existingCategories,
                ...newCategories.filter(
                  (nc: { id: string }) =>
                    !existingCategories.some(
                      (ec: { id: string }) => ec.id === nc.id
                    )
                ),
              ],
            },
          },
        };
      }
      case "variables":
        return {
          storyTemplate: {
            variables: [
              ...(template.variables || []),
              ...(parsed.variables || []),
            ],
          },
        };
      case "mechanicsLore":
        return {
          storyTemplate: {
            lore: [...(template.lore || []), ...(parsed.lore || [])],
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
