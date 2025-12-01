/**
 * Big Adventure AI - Full adventure generation from a single prompt
 *
 * Generates complete adventures in stages:
 * - Stage 1: Core concept (title, premise, intro, player summary, author notes)
 * - Stage 2: Mechanics (stats, resources, abilities, variables)
 * - Stage 3: Content (inventory, lore, relationships, achievements, quests, plot beats)
 * - Stage 4: Advanced (presets, mythic, custom tables, upgrades, starting choices)
 */

import { StoryData, StartingChoice } from "@/app/misc/structs";
import { ChatMessage } from "@/app/misc/ai";

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

export type GenerationStage = "core" | "mechanics" | "content" | "advanced";

// Per-stage configuration
export interface StageConfig {
  enabled: boolean;
  iterations: number; // How many passes to run (1-5)
  maxOutputTokens: number; // Output tokens for this stage
  customInstructions?: string; // Optional custom instructions for this stage
}

// Default stage configurations
export const DEFAULT_STAGE_CONFIGS: Record<GenerationStage, StageConfig> = {
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
    maxOutputTokens: 6000,
    customInstructions: "",
  },
  advanced: {
    enabled: true,
    iterations: 1,
    maxOutputTokens: 4000,
    customInstructions: "",
  },
};

// Iteration-specific sub-stages for content stage
export type ContentSubStage =
  | "lore"
  | "achievements"
  | "plotBeats"
  | "relationships"
  | "quests"
  | "inventory";

export interface ContentIterationConfig {
  lore: number; // 1-5 iterations
  achievements: number;
  plotBeats: number;
  relationships: number;
  quests: number;
  inventory: number;
}

export const DEFAULT_CONTENT_ITERATIONS: ContentIterationConfig = {
  lore: 1,
  achievements: 1,
  plotBeats: 1,
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
  includeMythic: boolean;
  includeUpgradeShop: boolean;
  includeCustomTables: boolean;
  includePresets: boolean;
  includeStartingChoices: boolean;
  targetDuration: "short" | "medium" | "long";
  maxOutputTokens: number; // Global fallback output max per stage

  // Per-stage configuration (Phase 1)
  stageConfigs?: Record<GenerationStage, StageConfig>;
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
  | "plotBeats" // Regenerate plot beats
  | "relationships" // Regenerate relationships
  | "presets" // Regenerate character presets
  | "mythic" // Regenerate mythic state
  | "customTables" // Regenerate custom tables
  | "upgradeShop" // Regenerate upgrade shop
  | "startingChoices"; // Regenerate starting choices

// Section metadata for UI
export const REGENERATE_SECTIONS: Record<
  RegenerateSection,
  {
    name: string;
    description: string;
    emoji: string;
    stage: GenerationStage;
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
  plotBeats: {
    name: "Plot Beats",
    description: "Story milestones",
    emoji: "🎭",
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
  mythic: {
    name: "Mythic GME",
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
  startingChoices: {
    name: "Starting Choices",
    description: "Adventure beginning options",
    emoji: "🚀",
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
}

export function saveGenerationToHistory(
  entry: Omit<GenerationHistoryEntry, "id">
): void {
  const history = loadGenerationHistory();
  const newEntry: GenerationHistoryEntry = {
    ...entry,
    id: `gen_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
  };

  // Add to beginning, keep max entries
  history.unshift(newEntry);
  if (history.length > MAX_HISTORY_ENTRIES) {
    history.pop();
  }

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

export interface BigAdventureResult {
  // Adventure metadata
  title: string;
  shortDescription: string;
  description: string;

  // Story template
  storyTemplate: Partial<StoryData>;
  startingChoices?: StartingChoice[];
}

// Complexity determines counts for various elements
const COMPLEXITY_COUNTS: Record<
  ComplexityLevel,
  {
    stats: number;
    resources: number;
    abilities: number;
    plotBeats: number;
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
    plotBeats: 8,
    lore: 6,
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
    plotBeats: 12,
    lore: 12,
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
    plotBeats: 18,
    lore: 18,
    achievements: 18,
    quests: 12,
    relationships: 12,
    presets: 6,
    customTables: 8,
    shopItems: 16,
  },
};

// Duration affects plot beats and content depth
const DURATION_MULTIPLIERS: Record<"short" | "medium" | "long", number> = {
  short: 0.7,
  medium: 1.0,
  long: 1.5,
};

// RPG System descriptions for context
const RPG_SYSTEM_DESCRIPTIONS: Record<RPGSystemType, string> = {
  "3d6":
    "3d6 system (3-18 range, bell curve, 10-11 average). DCs: Easy 8, Medium 11, Hard 14, Expert 17.",
  "1d20":
    "D20 system (1-20 flat probability). DCs: Easy 10, Medium 15, Hard 20, Expert 25.",
  "1d100":
    "Percentile system (1-100, roll under stat). Easy +20, Medium +0, Hard -20, Expert -40 modifiers.",
  percentile:
    "Percentile system (1-100, roll under stat). Easy +20, Medium +0, Hard -20, Expert -40 modifiers.",
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
    content: {
      name: "Story Content",
      description: "NPCs, lore, quests, and world-building",
      detailedDescription:
        "Populates your world with content: characters to meet, history to discover, items to find, goals to achieve, and story milestones. This is the meat of your adventure.",
      generates: [
        "Lore entries (world history, factions, locations)",
        "Relationships (NPCs with attitudes)",
        "Inventory items (equipment, consumables)",
        "Achievements (goals with rewards)",
        "Quests (main & side objectives)",
        "Plot beats (story milestones)",
      ],
      instructionHint:
        "Focus on NPC depth, faction politics, item variety, or story pacing",
      number: 3,
      emoji: "📚",
    },
    advanced: {
      name: "Advanced Features",
      description: "Character creation, upgrades, and randomization",
      detailedDescription:
        "Adds depth through optional systems: character creation choices, progression unlocks, random event tables, and GM emulation tools for unpredictable storytelling.",
      generates: [
        "Starting choices (character creation options)",
        "Upgrade shop (progression purchases)",
        "Character presets (pre-made builds)",
        "Custom random tables",
        "Mythic GME integration",
      ],
      instructionHint:
        "Shape character options, upgrade paths, or random event themes",
      number: 4,
      emoji: "✨",
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

  // Get custom instructions for this stage
  const stageConfig =
    config.stageConfigs?.[stage] || DEFAULT_STAGE_CONFIGS[stage];
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
- Variables: 3-6 (mix of number, boolean, and list types)

STAT VALUES:
- Range: 1-100 where 50 is human average
- Player characters typically have 40-70 in most stats
- One or two standout stats can be 70-85
- Weaknesses can be 25-40

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
    OR { "id": "var_xxx", "name": "string", "description": "string", "type": "list", "items": [], "maxSize": number }
  ]
}

Remember: Output ONLY the JSON object, nothing else.`;
  }

  if (stage === "content") {
    // Get content iteration multipliers (default to 1x if not set)
    const contentIterations =
      config.contentIterations || DEFAULT_CONTENT_ITERATIONS;

    // Apply both duration multiplier AND content iterations for each category
    const plotBeatCount = Math.round(
      counts.plotBeats * durationMultiplier * contentIterations.plotBeats
    );
    const loreCount = Math.round(
      counts.lore * durationMultiplier * contentIterations.lore
    );
    const achievementCount = Math.round(
      counts.achievements * durationMultiplier * contentIterations.achievements
    );
    const questCount = Math.round(
      counts.quests * durationMultiplier * contentIterations.quests
    );
    const relationshipCount = Math.round(
      counts.relationships *
        durationMultiplier *
        contentIterations.relationships
    );
    const inventoryCount = Math.round(3 * contentIterations.inventory); // Base 3 items times multiplier

    return `${basePrompt}

STAGE 3: STORY CONTENT
Generate inventory, lore, relationships, achievements, quests, and plot beats.

TARGET COUNTS:
- Starting Inventory: ${inventoryCount}-${inventoryCount + 2} items
- Lore Entries: ${loreCount}
- Relationships: ${relationshipCount}
- Achievements: ${achievementCount}
- Quests: ${questCount}
- Plot Beats: ${plotBeatCount}

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
- "mythic" (+5, infinite dur)

LORE TRIGGERS (make lore dynamic):
- on_triggers: words/phrases that reveal this lore
- off_triggers: words/phrases that hide this lore
- beats_trigger: plot beat indices (0-based) that reveal this lore
- var_on_triggers: boolean variable names that reveal when true

RELATIONSHIP VALUES: -100 (mortal enemy) to +100 (devoted ally)

OUTPUT JSON SCHEMA:
{
  "inventory": [
    { "name": "string", "quantity": number, "description": "string", "type": "normal|consumable|story|misc", "grade": "common|uncommon|rare|epic|legendary|mythic", "symbol": "emoji" }
  ],
  "lore": [
    {
      "title": "string",
      "content": "string (detailed lore text)",
      "secrtet": boolean,
      "on": boolean,
      "alwaysOn": boolean,
      "on_triggers": ["string"],
      "off_triggers": ["string"],
      "beats_trigger": [number],
      "var_on_triggers": ["string"]
    }
  ],
  "relationships": [
    { "name": "string", "value": number, "description": "string", "symbol": "emoji" }
  ],
  "achievements": [
    { "title": "string", "description": "string (player-facing)", "ai_hint": "string (precise trigger conditions for AI)", "points": number, "symbol": "emoji", "dateAchieved": null }
  ],
  "quests": [
    { "id": "quest_xxx", "title": "string", "shortDescription": "string", "description": "string", "points": number, "active": boolean, "fulfilled": false }
  ],
  "plot_beats": [
    { "title": "string", "content": "string (detailed beat description)", "fulfilled": false, "points": number }
  ]
}

Remember: Output ONLY the JSON object, nothing else.`;
  }

  // Stage: advanced
  const presetCount = config.includePresets
    ? Math.round(counts.presets * durationMultiplier)
    : 0;
  const tableCount = config.includeCustomTables
    ? Math.round(counts.customTables * durationMultiplier)
    : 0;
  const shopItemCount = config.includeUpgradeShop
    ? Math.round(counts.shopItems * durationMultiplier)
    : 0;

  let advancedSections = "";
  const schemaFields: string[] = [];

  if (config.includePresets && presetCount > 0) {
    advancedSections += `
CHARACTER PRESETS (${presetCount}):
Different character builds/classes players can choose. Each has unique stats, resources, inventory, and abilities.
Presets should offer meaningfully different playstyles.

IMPORTANT: Each preset MUST include abilities. Use the abilities generated in the mechanics stage as a base:
- Give each preset a subset of the available abilities that fits their playstyle
- You may also create 1-2 unique abilities per preset for specialization
- Adjust ability grades to reflect each preset's proficiency

STAT VALUES FOR PRESETS:
- Range: 1-100 where 50 is human average
- Player characters typically have 40-70 in most stats
- One or two standout stats can be 70-85
- Weaknesses can be 25-40
`;
    schemaFields.push(`"presets": [
    {
      "id": "preset-xxx",
      "name": "string",
      "description": "string",
      "icon": "emoji",
      "playerName": "string",
      "playerSummary": "string",
      "intro": "string (unique opening for this preset)",
      "stats": [{ "name": "string", "value": number, "description": "string", "symbol": "emoji" }],
      "resources": [{ "name": "string", "value": number, "maxValue": number, "description": "string", "symbol": "emoji" }],
      "inventory": [{ "name": "string", "quantity": number, "description": "string", "type": "string", "grade": "string", "symbol": "emoji" }],
      "abilities": [{ "name": "string", "description": "string", "grade": "string", "cost": [], "cooldown": number, "currentCooldown": 0, "symbol": "emoji" }],
      "authorNotes": "string"
    }
  ]`);
  }

  if (config.includeMythic) {
    advancedSections += `
MYTHIC GME STATE:
Initialize the Mythic Game Master Emulator for solo/GM-less play.
- chaosFactor: 1-9 (5 is default, higher = more random events)
- threads: Active narrative threads/plotlines
- characters: Important NPCs
`;
    schemaFields.push(`"mythicState": {
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
    advancedSections += `
CUSTOM RANDOM TABLES (${tableCount}):
Create thematic random tables for encounters, weather, events, loot, etc.
Each entry has a weight (higher = more likely).
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

  if (config.includeUpgradeShop && shopItemCount > 0) {
    advancedSections += `
UPGRADE SHOP (${shopItemCount} total items across all shops):
Configure the progression/upgrade system where players spend points.
Create interesting unlockables: new stats, resources, items, and abilities.

STAT VALUES: Range 1-100 where 50 is human average. Shop stats typically start at 30-50.
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
    advancedSections += `
STARTING CHOICES (2-4):
Custom starting choices instead of a simple "Start Story" button.
Each choice can have different narrative paths, skill checks, or requirements.
`;
    schemaFields.push(`"startingChoices": [
    {
      "text": "string",
      "intro_override": "string (optional alternate intro)",
      "skill_used": "string (optional)",
      "skill_dc": number (optional),
      "resource_used": "string (optional)",
      "item_used": "string (optional)"
    }
  ]`);
  }

  // If no advanced features selected, just return empty object
  if (schemaFields.length === 0) {
    return `${basePrompt}

STAGE 4: ADVANCED FEATURES
No advanced features were selected for this adventure.

OUTPUT JSON SCHEMA:
{}

Output an empty JSON object.`;
  }

  return `${basePrompt}

STAGE 4: ADVANCED FEATURES
Generate advanced configuration for the adventure.
${advancedSections}

OUTPUT JSON SCHEMA:
{
  ${schemaFields.join(",\n  ")}
}

Remember: Output ONLY the JSON object, nothing else.`;
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
      // For advanced stage, include full stat details for preset creation
      if (stage === "advanced") {
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
      // For advanced stage, include full resource details for preset creation
      if (stage === "advanced") {
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
 * Build a continuation prompt to complete truncated JSON
 */
export function buildContinuationPrompt(
  truncatedContent: string,
  stage: GenerationStage
): string {
  // Get the last ~500 characters to provide context
  const contextLength = Math.min(500, truncatedContent.length);
  const lastContent = truncatedContent.slice(-contextLength);

  return `Your previous response was cut off mid-generation. Here's where you stopped:

...${lastContent}

CRITICAL: Continue EXACTLY from where you left off. Do not restart, do not add explanations.
Just output the remaining JSON content to complete the ${stage} stage response.
The output must be valid JSON when combined with what came before.`;
}

/**
 * Attempt to repair incomplete JSON by closing open brackets/braces
 * This is a best-effort fallback when continuation isn't possible
 */
export function attemptJSONRepair(content: string): string {
  let jsonContent = content.trim();

  // Remove markdown code blocks if present
  const jsonBlockMatch = jsonContent.match(
    /```(?:json)?\s*([\s\S]*?)(?:\s*```)?$/
  );
  if (jsonBlockMatch) {
    jsonContent = jsonBlockMatch[1].trim();
  }

  const startIndex = jsonContent.indexOf("{");
  if (startIndex === -1) return jsonContent;

  jsonContent = jsonContent.slice(startIndex);

  // Track what needs closing
  const stack: string[] = [];
  let inString = false;
  let escaped = false;
  let lastGoodIndex = 0;

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
      if (!inString) lastGoodIndex = i;
      continue;
    }

    if (!inString) {
      if (char === "{") {
        stack.push("}");
        lastGoodIndex = i;
      } else if (char === "[") {
        stack.push("]");
        lastGoodIndex = i;
      } else if (char === "}" || char === "]") {
        if (stack.length > 0 && stack[stack.length - 1] === char) {
          stack.pop();
          lastGoodIndex = i;
        }
      } else if (char === "," || char === ":") {
        lastGoodIndex = i;
      }
    }
  }

  // If we're in a string, try to close it
  if (inString) {
    // Find a reasonable place to truncate (last complete value)
    const truncateMatch = jsonContent
      .slice(0, lastGoodIndex + 1)
      .match(/^([\s\S]*[}\]",:\d])/);
    if (truncateMatch) {
      jsonContent = truncateMatch[1];
      // Recount stack after truncation
      stack.length = 0;
      inString = false;
      for (let i = 0; i < jsonContent.length; i++) {
        const char = jsonContent[i];
        if (char === "\\") {
          i++;
          continue;
        }
        if (char === '"') {
          inString = !inString;
          continue;
        }
        if (!inString) {
          if (char === "{") stack.push("}");
          else if (char === "[") stack.push("]");
          else if (char === "}" || char === "]") stack.pop();
        }
      }
    }
  }

  // Remove trailing incomplete elements (like partial keys or values)
  // Match trailing patterns like: , "key or , "key": or , "key": "value
  jsonContent = jsonContent.replace(/,\s*"[^"]*"?\s*:?\s*"?[^"]*$/, "");
  jsonContent = jsonContent.replace(/,\s*$/, "");

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

    // Try to find JSON object boundaries
    const startIndex = jsonContent.indexOf("{");
    const endIndex = jsonContent.lastIndexOf("}");
    if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
      jsonContent = jsonContent.slice(startIndex, endIndex + 1);
    }

    // First attempt: try to parse as-is
    let parsed;
    try {
      parsed = JSON.parse(jsonContent);
    } catch (parseError) {
      // Second attempt: try to repair the JSON
      console.warn("Initial JSON parse failed, attempting repair...");
      const repairedContent = attemptJSONRepair(content);
      try {
        parsed = JSON.parse(repairedContent);
        console.log("JSON repair successful!");
      } catch (repairError) {
        // Repair failed, throw original error
        throw parseError;
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

    if (stage === "content") {
      return {
        storyTemplate: {
          inventory: parsed.inventory,
          lore: parsed.lore,
          relationships: parsed.relationships,
          achievements: parsed.achievements,
          quests: parsed.quests,
          plot_beats: parsed.plot_beats,
        },
      };
    }

    if (stage === "advanced") {
      return {
        storyTemplate: {
          presets: parsed.presets,
          mythicState: parsed.mythicState,
          customTables: parsed.customTables,
          upgradeSettings: parsed.upgradeSettings,
        },
        startingChoices: parsed.startingChoices,
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
      plot_beats: [],
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
      maxMomentum: 100,
      points: 0,
      earnedPointsFromBeats: [],
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
  }

  return merged;
}

/**
 * Get all stages that should be run based on config
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

  if (stageConfigs.content?.enabled !== false) {
    stages.push("content");
  }

  // Only add advanced stage if any advanced features are enabled AND stage is enabled
  const advancedEnabled = stageConfigs.advanced?.enabled !== false;
  const hasAdvancedFeatures =
    config.includeMythic ||
    config.includeUpgradeShop ||
    config.includeCustomTables ||
    config.includePresets ||
    config.includeStartingChoices;

  if (advancedEnabled && hasAdvancedFeatures) {
    stages.push("advanced");
  }

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
    content: 4000,
    advanced: 5000,
  };

  let totalInput = 0;
  let totalOutput = 0;

  for (const stage of stages) {
    const stageConfig = stageConfigs[stage] || DEFAULT_STAGE_CONFIGS[stage];
    const baseInput = inputEstimates[stage];
    let outputForStage = stageConfig.maxOutputTokens || config.maxOutputTokens;

    if (stage === "content") {
      // Calculate content multiplier to estimate additional output needed
      // Higher iterations = more content = needs more output tokens
      const avgContentMultiplier =
        (contentIterations.lore +
          contentIterations.achievements +
          contentIterations.plotBeats +
          contentIterations.relationships +
          contentIterations.quests +
          contentIterations.inventory) /
        6; // Average of all multipliers

      // Scale output estimate by average multiplier (capped at 2x since it's one response)
      const outputMultiplier = Math.min(2, avgContentMultiplier);
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
        "Generate 3-6 story tracking variables (mix of number, boolean, and list types).",
      schema: `{ "variables": [{ "id": "var_xxx", "name": "string", "description": "string", "type": "number|boolean|list", "value": any, ... }] }`,
    },
    inventory: {
      instruction:
        "Generate 3-5 starting items. Types: normal, consumable, story, misc. Grades: common, uncommon, rare, epic, legendary, mythic.",
      schema: `{ "inventory": [{ "name": "string", "quantity": number, "description": "string", "type": "string", "grade": "string", "symbol": "emoji" }] }`,
    },
    lore: {
      instruction: `Generate ${Math.round(
        counts.lore * durationMultiplier
      )} lore entries with dynamic triggers.`,
      schema: `{ "lore": [{ "title": "string", "content": "string", "secret": boolean, "on": boolean, "alwaysOn": boolean, "on_triggers": ["string"], "off_triggers": ["string"], "beats_trigger": [number], "var_on_triggers": ["string"] }] }`,
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
    plotBeats: {
      instruction: `Generate ${Math.round(
        counts.plotBeats * durationMultiplier
      )} plot beats (story milestones).`,
      schema: `{ "plot_beats": [{ "title": "string", "content": "string", "fulfilled": false, "points": number }] }`,
      count: Math.round(counts.plotBeats * durationMultiplier),
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
      )} character presets with unique stats, abilities, and items.`,
      schema: `{ "presets": [{ "id": "preset-xxx", "name": "string", "description": "string", "icon": "emoji", "playerName": "string", "playerSummary": "string", "intro": "string", "stats": [...], "resources": [...], "inventory": [...], "abilities": [...], "authorNotes": "string" }] }`,
      count: Math.round(counts.presets * durationMultiplier),
    },
    mythic: {
      instruction: "Generate Mythic GME initial state for solo play.",
      schema: `{ "mythicState": { "chaosFactor": number (1-9), "sceneCount": 0, "threads": [{ "id": "thread_xxx", "description": "string", "status": "active" }], "characters": [{ "id": "char_xxx", "name": "string", "role": "string", "status": "active" }], "skillCheckHistory": [], "currentStreak": 0, "lastChaosAdjustment": 0 } }`,
    },
    customTables: {
      instruction: `Generate ${Math.round(
        counts.customTables * durationMultiplier
      )} random tables (encounters, weather, events, etc).`,
      schema: `{ "customTables": [{ "id": "table_xxx", "name": "string", "description": "string", "entries": [{ "text": "string", "weight": number }] }] }`,
      count: Math.round(counts.customTables * durationMultiplier),
    },
    upgradeShop: {
      instruction: `Generate upgrade shop configuration with ${Math.round(
        counts.shopItems * durationMultiplier
      )} items across stat, resource, item, and ability shops.`,
      schema: `{ "upgradeSettings": { "enabled": true, "allowStatUpgrade": true, "allowResourceUpgrade": true, "allowAddItem": true, "statUpgradeCost": 10, "statUpgradeAmount": 1, "resourceUpgradeCost": 15, "resourceUpgradeAmount": 10, "addItemCost": 20, "statShopEnabled": boolean, "resourceShopEnabled": boolean, "itemShopEnabled": boolean, "abilityShopEnabled": boolean, "statShop": [...], "resourceShop": [...], "itemShop": [...], "abilityShop": [...] } }`,
      count: Math.round(counts.shopItems * durationMultiplier),
    },
    startingChoices: {
      instruction: "Generate 2-4 starting choices for the adventure beginning.",
      schema: `{ "startingChoices": [{ "text": "string", "intro_override": "string (optional)", "skill_used": "string (optional)", "skill_dc": number (optional), "resource_used": "string (optional)", "item_used": "string (optional)" }] }`,
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

    const parsed = JSON.parse(jsonContent);

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
      case "plotBeats":
        return { storyTemplate: { plot_beats: parsed.plot_beats } };
      case "relationships":
        return { storyTemplate: { relationships: parsed.relationships } };
      case "presets":
        return { storyTemplate: { presets: parsed.presets } };
      case "mythic":
        return { storyTemplate: { mythicState: parsed.mythicState } };
      case "customTables":
        return { storyTemplate: { customTables: parsed.customTables } };
      case "upgradeShop":
        return { storyTemplate: { upgradeSettings: parsed.upgradeSettings } };
      case "startingChoices":
        return { startingChoices: parsed.startingChoices };
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
  "plotBeats",
  "relationships",
  "presets",
  "customTables",
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
  count: number = 3
): { role: "system" | "user"; content: string }[] {
  const sectionInfo = REGENERATE_SECTIONS[section];
  const counts = COMPLEXITY_COUNTS[config.complexity];
  const durationMultiplier = DURATION_MULTIPLIERS[config.targetDuration];
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
      case "plotBeats":
        existingItems = (template.plot_beats || []) as {
          name?: string;
          title?: string;
        }[];
        existingItemsPreview = existingItems
          .map((p) => p.title)
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
      instruction: `Generate ${count} NEW stats that complement the existing ones. Avoid duplicating existing stats.`,
      schema: `{ "stats": [{ "name": "string", "description": "string", "value": number, "min": number, "max": number, "symbol": "emoji" }] }`,
    },
    resources: {
      instruction: `Generate ${count} NEW resources that complement the existing ones. Avoid duplicating existing resources.`,
      schema: `{ "resources": [{ "name": "string", "description": "string", "value": number, "min": number, "max": number, "symbol": "emoji", "stat": "string (optional)" }] }`,
    },
    abilities: {
      instruction: `Generate ${count} NEW abilities that complement the existing ones. Vary grades from novice to master.`,
      schema: `{ "abilities": [{ "name": "string", "description": "string", "grade": "novice|apprentice|adept|expert|master", "stat": "string", "symbol": "emoji", "cost": [{ "type": "resource", "name": "string", "amount": number }], "cooldown": number }] }`,
    },
    variables: {
      instruction: `Generate ${count} NEW variables.`,
      schema: `{ "variables": [{ "name": "string", "value": number, "symbol": "emoji" }] }`,
    },
    inventory: {
      instruction: `Generate ${count} NEW inventory items that complement the existing ones. Mix item types.`,
      schema: `{ "inventory": [{ "name": "string", "description": "string", "type": "normal|consumable|story|misc", "grade": "common|uncommon|rare|epic|mythic", "stat": "string (optional)", "symbol": "emoji", "durability": number, "maxDurability": number }] }`,
    },
    lore: {
      instruction: `Generate ${count} NEW lore entries that expand the world. Include dynamic triggers.`,
      schema: `{ "lore": [{ "title": "string", "content": "string", "secret": boolean, "on": boolean, "alwaysOn": boolean, "on_triggers": ["string"], "off_triggers": ["string"], "beats_trigger": [number], "var_on_triggers": ["string"] }] }`,
    },
    achievements: {
      instruction: `Generate ${count} NEW achievements with ai_hint for precise triggering.`,
      schema: `{ "achievements": [{ "title": "string", "description": "string", "ai_hint": "string", "points": number, "symbol": "emoji", "dateAchieved": null }] }`,
    },
    quests: {
      instruction: `Generate ${count} NEW quests with objectives.`,
      schema: `{ "quests": [{ "id": "quest_xxx", "title": "string", "shortDescription": "string", "description": "string", "points": number, "active": boolean, "fulfilled": false }] }`,
    },
    plotBeats: {
      instruction: `Generate ${count} NEW plot beats (story milestones).`,
      schema: `{ "plot_beats": [{ "title": "string", "content": "string", "fulfilled": false, "points": number }] }`,
    },
    relationships: {
      instruction: `Generate ${count} NEW NPC relationships (-100 to +100).`,
      schema: `{ "relationships": [{ "name": "string", "value": number (-100 to 100), "description": "string", "symbol": "emoji" }] }`,
    },
    presets: {
      instruction: `Generate ${count} NEW character presets with unique stats, abilities, and items.`,
      schema: `{ "presets": [{ "id": "preset-xxx", "name": "string", "description": "string", "icon": "emoji", "playerName": "string", "playerSummary": "string", "intro": "string", "stats": [...], "resources": [...], "inventory": [...], "abilities": [...], "authorNotes": "string" }] }`,
    },
    mythic: {
      instruction: "",
      schema: "",
    },
    customTables: {
      instruction: `Generate ${count} NEW random tables (encounters, weather, events, etc).`,
      schema: `{ "customTables": [{ "id": "table_xxx", "name": "string", "description": "string", "entries": [{ "text": "string", "weight": number }] }] }`,
    },
    upgradeShop: {
      instruction: "",
      schema: "",
    },
    startingChoices: {
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
${styleModifier ? `\nSTYLE DIRECTION: ${styleModifier}` : ""}

TASK: Add ${count} NEW ${sectionInfo.name} entries.
${sectionPrompt.instruction}

IMPORTANT:
- Do NOT duplicate any existing items listed above
- Make new items complement and expand on the existing content
- Ensure new content fits the adventure's theme and tone
- Use appropriate emoji symbols

OUTPUT ONLY valid JSON matching this schema:
${sectionPrompt.schema}

Be creative and thematic. Ensure new content integrates well with existing elements.`;

  return [
    { role: "system", content: systemPrompt },
    {
      role: "user",
      content: `Generate ${count} new ${sectionInfo.name} entries. Output ONLY valid JSON.`,
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

    const parsed = JSON.parse(jsonContent);
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
      case "plotBeats":
        return {
          storyTemplate: {
            plot_beats: [
              ...(template.plot_beats || []),
              ...(parsed.plot_beats || []),
            ],
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
