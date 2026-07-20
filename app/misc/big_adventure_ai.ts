/**
 * Big Adventure AI - Full adventure generation from a single prompt
 *
 * Generates complete adventures in stages:
 * - Stage 1: Core concept (title, premise, intro, author notes)
 * - Stage 2: Mechanics Notes (game rules as lore entries)
 * - Stage 2B: Character Sheet Template (fillable template with stats/resources)
 * - Stage 3: Content (lore, goals)
 * - Stage 4: Advanced (presets with filled character sheets, agmt, custom tables, starting choices)
 * - Stage 5: Icons (assigns thematic icons to all elements)
 *
 * NOTE: Abilities, passives, and inventory are DEPRECATED.
 * Powers/spells/skills should be defined in mechanics lore entries.
 * Items should be described in the character sheet template and world lore.
 */

import { StoryData, StartingChoice } from "@/app/misc/structs";
import { ChatMessage } from "@/app/misc/ai";
import { ALL_GAME_ICON_IDS } from "@/app/misc/gameIcons";
import { CHARACTER_SHEET_PRESET_TEMPLATES } from "@/app/misc/characterSheetTemplate";
import { estimateTokens, truncateToTokenBudget } from "@/app/misc/tokenCounter";
import JSON5 from "json5";

// Budget for the "previously generated content" carried forward into later
// stages (buildBigAdventureMessages). Unlike the gameplay loop, this is a
// one-shot pipeline so there's no rolling history to prune - but the
// mechanics-lore section can still grow large (a rich rules document), so
// it's the one part that gets truncated if the whole context exceeds this.
const BIG_ADVENTURE_CONTEXT_BUDGET = 20000;

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
// NOTE: "mechanics" stage (abilities & variables) is DEPRECATED - abilities/passives should be in lore
export type GenerationStage =
  | "core"
  | "mechanics-notes"
  | "character-sheet"
  | "content-lore"
  | "content-npcs"
  | "content-goals"
  | "advanced-presets"
  | "advanced-tables"
  | "advanced-other"
  | "icons";

// Legacy stage type for backward compatibility and UI grouping
export type LegacyStage = "core" | "mechanics" | "content" | "advanced";

// Map substage to its parent legacy stage
export function getParentStage(stage: GenerationStage): LegacyStage {
  if (stage === "core") return "core";
  if (stage === "mechanics-notes" || stage === "character-sheet")
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
export type ContentSubStage = "lore" | "goals";

export interface ContentIterationConfig {
  lore: number; // 1-5 iterations
  goals: number;
}

export const DEFAULT_CONTENT_ITERATIONS: ContentIterationConfig = {
  lore: 1,
  goals: 1,
};

export interface BigAdventureConfig {
  prompt: string;
  genre?: string;
  rpgSystem?: RPGSystemType; // Deprecated - GM stage now handles all dice via formula_roll
  complexity: ComplexityLevel;
  nsfw: boolean;
  includeAGMT: boolean;
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
  | "intro" // Regenerate intro, premise
  | "characterSheetTemplate" // Regenerate character sheet template
  | "variables" // Regenerate variables
  | "mechanicsLore" // Regenerate mechanics lore entries
  | "lore" // Regenerate lore entries
  | "goals" // Regenerate goals
  | "presets" // Regenerate character presets
  | "agmt" // Regenerate agmt state
  | "customTables" // Regenerate custom tables
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
    description: "Opening narrative",
    emoji: "📖",
    stage: "core",
  },
  characterSheetTemplate: {
    name: "Character Sheet Template",
    description: "Fillable character sheet template",
    emoji: "📋",
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
  goals: {
    name: "Goals",
    description: "Player objectives",
    emoji: "🎯",
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

  try {
    localStorage.setItem(GENERATION_HISTORY_KEY, JSON.stringify(history));
  } catch (e) {
    // Handle QuotaExceededError - try removing oldest entries
    console.warn(
      "Failed to save generation history (quota exceeded), pruning...",
      e
    );
    try {
      // Keep only the newest 3 entries
      const pruned = history.slice(0, 3);
      localStorage.setItem(GENERATION_HISTORY_KEY, JSON.stringify(pruned));
    } catch (e2) {
      // If still failing, clear history
      console.warn("Still failing, clearing history");
      localStorage.removeItem(GENERATION_HISTORY_KEY);
    }
  }
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
  // NOTE: inventory and abilities fields are DEPRECATED - removed
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

  // Character sheet template (for custom character creation)
  characterSheetTemplate?: {
    template: string;
    fields: { name: string; description: string; defaultValue: string }[];
  };

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
    // NOTE: "mechanics" stage is DEPRECATED - abilities/passives should be defined in mechanics lore and world lore
    "character-sheet": {
      name: "Character Sheet",
      description: "Character stats and sheet template",
      detailedDescription:
        "Creates the fillable character sheet template that defines ALL character data: stats, attributes, skills, health, mana, and other resources. Uses markdown with {{Field | Description | Default}} syntax for fillable fields. This is where character builds are defined.",
      generates: [
        "Character stats (Strength, Charisma, etc.)",
        "Resources (Health, Mana, Gold, etc.)",
        "Skills and proficiencies",
        "Background and personality fields",
        "Equipment section",
      ],
      instructionHint:
        "Customize sheet layout, stat types, resource pools, or add custom fields",
      number: 3,
      emoji: "📋",
    },
    "content-lore": {
      name: "Lore & World",
      description: "World-building and lore entries",
      detailedDescription:
        "Creates the world's history, factions, locations, and secrets. Rich lore entries that bring the setting to life.",
      generates: [
        "Locations and landmarks",
        "Factions and organizations",
        "History and past events",
        "World lore and customs",
        "Secret information",
      ],
      instructionHint:
        "Focus on faction politics, location atmosphere, or historical events",
      number: 4,
      emoji: "📚",
    },
    "content-npcs": {
      name: "NPCs & Characters",
      description: "Key characters and their relationships",
      detailedDescription:
        "Creates the major characters players will encounter: allies, enemies, mentors, and rivals. Each NPC has personality, motivations, and a role in the story.",
      generates: [
        "Major NPCs with personalities",
        "Character motivations and secrets",
        "Relationship dynamics",
        "Faction affiliations",
        "Character appearance & voice",
      ],
      instructionHint:
        "Focus on NPC depth, personality quirks, hidden agendas, or inter-character drama",
      number: 5,
      emoji: "👥",
    },
    "content-goals": {
      name: "Goals",
      description: "Player objectives",
      detailedDescription:
        "Defines what the player can accomplish: goals to complete over the course of the story.",
      generates: ["Main and side goals"],
      instructionHint: "Shape goal objectives or story pacing",
      number: 6,
      emoji: "🎯",
    },
    "advanced-presets": {
      name: "Character Presets",
      description: "Pre-made character builds",
      detailedDescription:
        "Creates alternative character builds players can choose from, each with unique character sheet values and backstory.",
      generates: [
        "Character presets/classes",
        "Unique character sheet values",
        "Preset backstories and intros",
      ],
      instructionHint:
        "Shape class archetypes, playstyle variety, or build uniqueness",
      number: 7,
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
      number: 8,
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
      number: 9,
      emoji: "🛒",
    },
    icons: {
      name: "Icon Assignment",
      description: "Assigns thematic icons to all elements",
      detailedDescription:
        "Reviews lore entries and relationships to assign appropriate icons from the game-icons.net library.",
      generates: [
        "Icons for relationships",
        "Icons for presets",
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

  // Build imported content context (from PDF imports)
  let importedContentSection = "";
  const hasImportedLore = config.importedLore && config.importedLore.length > 0;
  const hasImportedMechanics =
    config.importedMechanicsNotes && config.importedMechanicsNotes.length > 0;
  const hasImportedTables =
    config.importedCustomTables && config.importedCustomTables.length > 0;

  if (hasImportedLore || hasImportedMechanics || hasImportedTables) {
    importedContentSection = `\n\n═══════════════════════════════════════════════════════════════
IMPORTED SOURCE MATERIAL (from user's PDF)
═══════════════════════════════════════════════════════════════
The user has imported content from source books. Reference this material and build upon it.
Do NOT regenerate this content - it will be automatically merged into the final result.
Instead, create NEW content that complements and references this imported material.
`;

    if (hasImportedMechanics) {
      importedContentSection += `\n### IMPORTED GAME MECHANICS (${
        config.importedMechanicsNotes!.length
      } entries):\n`;
      config.importedMechanicsNotes!.slice(0, 10).forEach((note) => {
        importedContentSection += `- **${note.title}**: ${note.content.slice(
          0,
          200
        )}${note.content.length > 200 ? "..." : ""}\n`;
      });
      if (config.importedMechanicsNotes!.length > 10) {
        importedContentSection += `  _(+ ${
          config.importedMechanicsNotes!.length - 10
        } more mechanics entries)_\n`;
      }
    }

    if (hasImportedLore) {
      importedContentSection += `\n### IMPORTED LORE (${
        config.importedLore!.length
      } entries):\n`;
      config.importedLore!.slice(0, 10).forEach((lore) => {
        importedContentSection += `- **${lore.title}** (${
          lore.type || "lore"
        }): ${lore.content.slice(0, 150)}${
          lore.content.length > 150 ? "..." : ""
        }\n`;
      });
      if (config.importedLore!.length > 10) {
        importedContentSection += `  _(+ ${
          config.importedLore!.length - 10
        } more lore entries)_\n`;
      }
    }

    if (hasImportedTables) {
      importedContentSection += `\n### IMPORTED TABLES (${
        config.importedCustomTables!.length
      } tables):\n`;
      config.importedCustomTables!.forEach((table) => {
        importedContentSection += `- **${table.name}**: ${table.entries.length} entries\n`;
      });
    }

    importedContentSection += `\n⚠️ IMPORTANT: Create NEW content that works alongside this imported material. Reference existing NPCs, locations, and mechanics. Do not duplicate what's already been imported.\n`;
  }

  const basePrompt = `You are an expert Game Designer creating a complete text adventure game.

USER'S ADVENTURE CONCEPT:
"${config.prompt}"
${config.genre ? `\nGENRE/THEME: ${config.genre}` : ""}
${styleModifier ? `\nSTYLE DIRECTION: ${styleModifier}` : ""}
${
  customInstructions
    ? `\nCUSTOM INSTRUCTIONS FOR THIS STAGE:\n${customInstructions}`
    : ""
}${importedContentSection}

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
4. Do NOT use emojis anywhere - use descriptive text symbols if needed (e.g., "[+]" or "*" for bullets)
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
   AI determines outcomes based on character abilities and context

⚠️ IMPORTANT: Choose the system that BEST FITS the adventure concept!
- Fantasy/D&D-style adventures → 1d20
- Horror/Investigation (CoC-style) → 1d100/Percentile (roll under)
- Narrative/Story-first → 2d6 (PbtA) or Fate (4dF)
- Survival/Gritty → Year Zero Engine
- Action/Over-the-top → Explosive Dice
- Realistic/Grounded → 3d6 (bell curve makes extreme results rare)
- Pure storytelling → Narrative (no dice)`;

    const systemGuidance = userSpecifiedSystem
      ? `DICE SYSTEM: ${rpgDescription}
Use this system for all mechanics. Design DCs, skills, and abilities accordingly.`
      : `⚠️ CRITICAL: SELECT THE BEST DICE SYSTEM FOR THIS ADVENTURE!
Do NOT default to 3d6. Choose based on the genre and tone:

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

Create detailed lore entries (as many as needed) covering these topics. The AI has COMPLETE FREEDOM to design mechanics appropriate for this setting:

FOUNDATIONAL SYSTEMS:
1. "Character Stats/Attributes" - Define what attributes characters have
   - Choose stat names that fit the setting (fantasy might use STR/DEX, sci-fi might use REFLEX/TECH)
   - Explain what each stat represents and when it's used
   - Define value ranges and what they mean (you choose the scale)
   - Explain how stats affect dice rolls

2. "Dice Rolling Mechanics" - How checks work in this system
   - Define your chosen dice system formula (e.g., "1d20+mod", "3d6", "2d6+stat", etc.)
   - Explain difficulty tiers with examples
   - Define success/failure/partial success thresholds
   - Cover critical success/failure if applicable

3. "Resources & Pools" - What expendable resources exist
   - Health/vitality equivalent
   - Energy/mana/stamina equivalent (if applicable)  
   - Any unique resources for this setting
   - What happens when resources hit 0

4. "Combat Rules" - How fighting works
   - Initiative and turn order
   - Attack and damage mechanics
   - Defense and damage reduction
   - Defeat and death consequences

5. "Character Progression" - How characters grow
   - How experience/points are earned
   - What can be upgraded
   - Cost scaling (if applicable)

OPTIONAL ENTRIES (add what fits the setting):
- Skills/Proficiencies system
- Character classes/archetypes  
- Magic/Powers system
- Crafting rules
- Social mechanics
- Investigation/mystery mechanics
- Rest and recovery
- Item/equipment guidelines
- Enemy/NPC guidelines

═══════════════════════════════════════════════════════════════
CRITICAL REQUIREMENTS
═══════════════════════════════════════════════════════════════

1. ALL mechanics entries MUST have "alwaysOn": true and "type": "mechanics"
2. Each entry should be 2-4 detailed paragraphs with CONCRETE EXAMPLES
3. Content must be SPECIFIC to this adventure's setting
4. You have COMPLETE FREEDOM to design the mechanics - there are no hardcoded systems
5. The GM stage will use formula_roll with whatever dice formula you define

OUTPUT JSON SCHEMA:
{
  "mechanicsLore": [
    {
      "title": "Character Stats",
      "content": "string (detailed explanation of the stat system)",
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

  // NOTE: The "mechanics" stage (abilities & variables) has been DEPRECATED and removed
  // from the GenerationStage type. Abilities and passives should be defined in mechanics
  // lore and world lore instead. If old configs still reference this stage, they'll
  // fall through to the default empty prompt.

  // CHARACTER SHEET TEMPLATE STAGE - Generates the fillable template for the adventure
  if (stage === "character-sheet") {
    // Get list of available preset templates
    const presetTemplatesList = CHARACTER_SHEET_PRESET_TEMPLATES.map(
      (t) => `- ${t.id}: ${t.name} (${t.description})`
    ).join("\n");

    return `${basePrompt}

STAGE 2B: CHARACTER SHEET TEMPLATE
Generate a fillable character sheet template for this adventure. The template uses a special syntax for fillable fields.

⚠️ CRITICAL: The GAME RULES & MECHANICS have been provided in the context above.
Your character sheet template MUST match the mechanics defined there:
- Use the SAME stat names defined in the mechanics
- Include the SAME resources (health, mana, etc.) defined in the mechanics
- Reference the SAME skill system defined in the mechanics

AVAILABLE PRESET TEMPLATES:
You can reference these preset templates by ID, or create a custom template:
${presetTemplatesList}

TEMPLATE SYNTAX:
Use {{FieldName | Description | Default Value}} for fillable fields.
Optionally, use {{FieldName (Category) | Description | Default Value}} to group fields into pages.

⚠️ CRITICAL: The field syntax is DATA BINDING ONLY - the FieldName and Description are NOT DISPLAYED!
You MUST write visible labels explicitly in the markdown around the field placeholder.

WRONG (no visible label):
- {{Strength (Stats) | Physical power | 10}}

CORRECT (with visible label):
- **Strength**: {{Strength (Stats) | Physical power | 10}}

The {{...}} gets replaced by just the VALUE (e.g., "10"). Without "Strength:" before it, players won't know what the number means!

MORE EXAMPLES:
- **Name**: {{Name | Your character's name | Unnamed Hero}}
- **Strength**: {{Strength (Stats) | Physical power | 10}}
- **Background**: {{Background (Story) | Your character's history | A wanderer}}

Fields with the same category will appear together on the same page in the character creation wizard.
Fields without a category will appear on the first page.

Each field will be rendered as an input when players create their character.

TEMPLATE STRUCTURE:
The template should be a markdown document with headers and sections that match your adventure's theme.
The stats, skills, and resources in this template MUST match what was defined in the Game Mechanics stage.

FOR TTRPG-STYLE ADVENTURES:
- Include stat blocks matching the mechanics notes
- Add skill sections that match the skills defined in mechanics
- Include equipment/inventory sections
- Add personality/background fields

FOR NARRATIVE ADVENTURES:
- Focus on character description and backstory
- Include personality traits and goals
- Keep it simpler than mechanical systems

OUTPUT JSON SCHEMA:
{
  "characterSheetTemplate": {
    "template": "string (the full markdown template with {{field}} syntax)",
    "preset_id": "optional string (if using a preset template, just provide the ID)"
  }
}

EXAMPLES:

Using a preset:
{
  "characterSheetTemplate": {
    "preset_id": "dnd5e"
  }
}

Custom template (NOTICE: visible labels like "**Name**:", "**Strength**:" before each field):
{
  "characterSheetTemplate": {
    "template": "# **Name**: {{Name | Your character's name | Adventurer}}\\n\\n## Stats\\n- **Strength**: {{Strength (Stats) | Physical power | 10}}\\n- **Agility**: {{Agility (Stats) | Speed and reflexes | 10}}\\n\\n## Background\\n{{Background (Story) | Your character's history | A wanderer seeking fortune}}"
  }
}

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

7. GAME MASTER NOTES (type: "gm_notes"):
   Create 2-4 entries with guidance for running this adventure:
   
   - "GM Guide: Running This Adventure" - Overview of tone, pacing, key themes to emphasize
   - "GM Guide: NPCs & Roleplay" - How to portray key NPCs, their voices, mannerisms, motivations
   - "GM Guide: Combat & Challenges" - How to balance encounters, when to use dice vs narrative resolution
   - "GM Guide: Player Agency" - How to handle player creativity, improvisation tips, branching paths
   
   These entries help the AI GM (or human GM) understand HOW to run this specific setting effectively.
   Mark all GM notes as alwaysOn=true and type="gm_notes".

LORE TRIGGERS (make lore dynamic):
- on_triggers: words/phrases that reveal this lore when mentioned
  IMPORTANT: Include variations for word boundaries ["gun", "guns", "pistol", "pistols"]
- secrtet: true for hidden lore the AI knows but player hasn't discovered
- alwaysOn: true for fundamental world facts

CRITICAL: EVERY lore entry MUST have on_triggers with 3-5 variations OR set alwaysOn=true!

═══════════════════════════════════════════════════════════════
NOTE WRITING GUIDELINES (by Category)
═══════════════════════════════════════════════════════════════

Write notes like entries from a great RPG sourcebook — evocative details, practical reference, and just enough mystery to inspire.

**🐉 ENEMY / CREATURE / MONSTER**
When combat-capable beings appear, track their capabilities:
- **Appearance** — Physical description, sensory details, what makes them memorable
- **Game Statistics** — HP, attacks, defenses, special abilities (use the adventure's system)
- **Combat Behavior** — Tactics, preferred attacks, retreat triggers
- **Weaknesses** — Exploitable flaws, elemental vulnerabilities
- **World Connection** — Faction ties, ecological role, lore hooks

**👤 NPC (Non-Combat)**
For characters the player interacts with socially:
- **Appearance & Mannerisms** — How they look, speak, move
- **Personality** — Key traits, quirks, values they hold dear
- **Motivation** — What do they want? What do they fear?
- **Secrets** — What are they hiding? What leverage exists?
- **Relationships** — Connections to other NPCs, factions, the player

**📍 LOCATION**
For places worth remembering:
- **Atmosphere** — Sights, sounds, smells, the "feel" of the place
- **Layout** — Key areas, entrances/exits, notable features
- **Dangers** — Hazards, enemies, traps, environmental threats
- **Opportunities** — Resources, secrets, things to discover
- **History** — What happened here? Why does it matter?

**⚔️ ITEM / ARTIFACT**
For significant objects:
- **Description** — Appearance, weight, notable features
- **Properties** — What does it do? Mechanical effects?
- **History** — Who made it? Who owned it? Why is it special?
- **Quirks** — Curses, requirements, personality (if sentient)

**📜 LORE / WORLD DETAIL**
For broader world information:
- **Core Facts** — The essential truth of this subject
- **Common Knowledge** — What most people believe
- **Hidden Truth** — Secrets, contradictions, deeper meaning
- **Connections** — How this ties to other world elements

**🏛️ FACTION / ORGANIZATION**
For groups with influence:
- **Purpose** — Why do they exist? What do they want?
- **Structure** — Leadership, ranks, how they operate
- **Resources** — What power do they wield?
- **Relationships** — Allies, enemies, neutral parties
- **Secrets** — Hidden agendas, internal conflicts

**Quality standard:** Write as if each entry appears in a published sourcebook. Rich enough to roleplay, concise enough to reference mid-scene.

OUTPUT JSON SCHEMA:
{
  "lore": [
    {
      "title": "string",
      "content": "string (2-4 DETAILED paragraphs)",
      "type": "lore | npc | item | location | faction | event | gm_notes",
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

  // NPC STAGE
  if (stage === "content-npcs") {
    return `${basePrompt}

STAGE 3B: NPCs & CHARACTERS
Generate the major characters that players will encounter throughout this adventure.

These NPCs are tracked separately from lore entries - they have status, attitudes, and dynamic relationships with the player.

═══════════════════════════════════════════════════════════════
NPC CREATION GUIDELINES
═══════════════════════════════════════════════════════════════

Create MEMORABLE, DISTINCT characters. Each NPC should:

1. **MAJOR NPCs (create 8-15):**
   - Central characters to the plot: allies, enemies, quest-givers, mentors, rivals
   - Include detailed personality, appearance, voice/mannerisms
   - Give them secrets, motivations, and things they want from the player
   - Consider their relationship dynamics with OTHER NPCs

2. **SUPPORTING NPCs (create 5-10):**
   - Shopkeepers, guards, informants, witnesses
   - Brief but memorable traits
   - May become more important as story develops

REQUIRED NPC FIELDS:
- **name**: Full name or title they go by
- **description**: 2-3 paragraphs covering appearance, personality, mannerisms, voice
- **role**: Their function in the story (e.g., "Quest Giver", "Antagonist", "Mentor", "Love Interest", "Comic Relief")
- **status**: "unknown" for NPCs not yet encountered (alive/dead/missing/unknown/departed)
- **relationship**: How they initially relate to the player ("Stranger", "Potential ally", "Known enemy", etc.)
- **attitude**: Their initial disposition (hostile/unfriendly/neutral/friendly/allied)
- **faction**: What group they belong to (if any)
- **symbol**: An emoji representing them
- **notes**: GM notes about their secrets, future plot relevance, hidden agendas

MAKE NPCs FEEL ALIVE:
- Give them speech patterns, catchphrases, or verbal tics
- Include what they want from life, not just from the player
- Consider their relationships with each other, not just the player
- Think about how their attitude might change based on player actions
- Include physical descriptions that go beyond just appearance (posture, movement, presence)

NPC ATTITUDES (starting disposition):
- hostile: Actively wants to harm the player
- unfriendly: Distrustful, unhelpful, may become hostile
- neutral: No strong feelings either way
- friendly: Well-disposed, helpful
- allied: Firmly on the player's side

OUTPUT JSON SCHEMA:
{
  "npcs": [
    {
      "id": "npc_unique_id",
      "name": "Character Name",
      "description": "string (2-3 detailed paragraphs about appearance, personality, voice, mannerisms)",
      "role": "string (their role in the story)",
      "status": "unknown",
      "relationship": "string (initial relationship to player)",
      "attitude": "neutral",
      "faction": "string or null",
      "symbol": "emoji",
      "notes": "string (GM notes about secrets, future plans, hidden motivations)",
      "createdAt": 0
    }
  ]
}

Remember: Output ONLY the JSON object, nothing else.`;
  }

  if (stage === "content-goals") {
    return `${basePrompt}

STAGE 3C: GOALS
Generate goals appropriate for this adventure's scope.

GUIDELINES:
- Create goals for main story objectives and optional side content

OUTPUT JSON SCHEMA:
{
  "goals": [
    { "id": "goal_xxx", "title": "string", "shortDescription": "string", "description": "string", "active": boolean, "fulfilled": false }
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

Each preset offers a meaningfully different playstyle with unique character sheets and starting situation.

CRITICAL - CHARACTER SHEET:
Each preset MUST include a "characterSheet" field - a filled-out markdown character sheet for that specific character.
⚠️ The CHARACTER SHEET TEMPLATE has been provided in the context above. Use its EXACT FORMAT but fill in specific values for each preset character.
The characterSheet is what gets added to the player's Notes when they pick this preset.
This is where ALL character stats, attributes, skills, health, mana, equipment, powers, etc. are defined - in the markdown character sheet.
⚠️ Follow the stat names, skills, and resources defined in the GAME RULES & MECHANICS above.

CRITICAL - PRESET INTROS:
The "intro" field is a COMPLETE REPLACEMENT for the default intro (3-5 paragraphs).
This should set up the character's story and current situation.

REQUIRED - "CUSTOM" PRESET:
You MUST include a preset with id="preset-custom" and name="Custom" as the LAST preset.
This is for players who want to create their own character (self-insert).
- characterSheet should be the blank template with default values (not filled in)
- Generic intro letting the player define their own backstory

CHARACTER STATS IN CHARACTER SHEET (LEVEL 1 CHARACTERS - START WEAK):
- Use values appropriate to your stat scale as defined in GAME RULES & MECHANICS
- MOST stats should be below average (untrained/weak areas)
- A FEW stats (2-3) should be slightly above average (developing skills)
- Only ONE or TWO stats should be notably high (natural talent/specialty)
- Starting characters should feel capable but not overpowered

DEPRECATED: abilities[] and inventory[] arrays are NO LONGER USED.
- Character equipment should be listed in the characterSheet markdown
- Powers/abilities should be defined in mechanics lore and tracked in the characterSheet

OUTPUT JSON SCHEMA:
{
  "presets": [
    {
      "id": "preset-xxx",
      "name": "string",
      "description": "string (1-2 sentence hook)",
      "icon": "emoji",
      "characterSheet": "string (FILLED character sheet in markdown format - includes all stats, attributes, skills, resources, equipment, powers, backstory)",
      "intro": "string (3-5 paragraphs - COMPLETE opening narrative for this character)",
      "relationships": [],
      "authorNotes": "string (instructions for the AI narrator for this character)"
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
You will receive a list of relationships and presets.
For each element, choose the most thematically appropriate icon from the list above.

NOTE: Inventory and abilities are DEPRECATED and not included.

GUIDELINES:
- Match icons to the element's theme/function (e.g., "Warrior" preset → "sword", "Mage" → "spell-book")
- For relationships, use icons that represent the character's role or personality
- For presets (character builds), use icons that represent the class/archetype
- Be creative but thematic - the icon should represent what the element does
- If no perfect match exists, choose the closest thematic option

OUTPUT JSON SCHEMA:
{
  "iconAssignments": {
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

    // Include mechanics lore (game rules) - CRITICAL for later stages to reference.
    // This is the one part of "previously generated content" that can grow
    // large (a rich rules document), so it's the part that gets truncated
    // if the overall context would exceed budget - everything else here
    // (title/description/premise/character sheet/abilities/variables) is
    // already naturally bounded.
    const mechanicsLore = previousResults.storyTemplate?.lore?.filter(
      (l) => l.type === "mechanics"
    );
    if (mechanicsLore && mechanicsLore.length > 0) {
      let mechanicsSection = `\n## GAME RULES & MECHANICS:\n`;
      mechanicsLore.forEach((l) => {
        mechanicsSection += `\n### ${l.title}\n${l.content}\n`;
      });
      mechanicsSection += `\n`;

      const otherContentTokens = estimateTokens(contextMessage);
      const mechanicsBudget = Math.max(
        1000,
        BIG_ADVENTURE_CONTEXT_BUDGET - otherContentTokens
      );
      contextMessage += truncateToTokenBudget(mechanicsSection, mechanicsBudget);
    }

    // Include character sheet template - CRITICAL for presets stage
    if (previousResults.characterSheetTemplate?.template) {
      contextMessage += `\n## CHARACTER SHEET TEMPLATE:\n`;
      contextMessage += `\`\`\`\n${previousResults.characterSheetTemplate.template}\n\`\`\`\n\n`;
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

    // NOTE: inventory and abilities icon assignment is DEPRECATED - removed

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
  const conceptContext = [
    `ADVENTURE CONCEPT:\n"${config.prompt}"`,
    config.genre ? `GENRE/THEME: ${config.genre}` : null,
    config.stylePreset && config.stylePreset !== "default"
      ? `STYLE PRESET: ${config.stylePreset}`
      : null,
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");

  messages.push({
    role: "user",
    content: `${conceptContext}\n\nGenerate the ${
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

  // Handle embedded markdown code block markers that may appear mid-JSON
  // This handles cases where AI inserts ```json mid-response
  // First, handle case where backticks appear inside a string value - close the string first
  // Pattern: text.```json -> text."  (close the string before the fence)
  jsonContent = jsonContent.replace(
    /([^\\])"([^"]*?)\\?`{3,}(?:json)?\s*/gi,
    '$1"$2"'
  );

  // Remove remaining embedded markdown markers outside of strings
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

    // NOTE: The "mechanics" stage parser has been DEPRECATED and removed
    // Old configs that somehow still reference this stage will fall through to empty result

    if (stage === "character-sheet") {
      // Character sheet template stage - generates fillable template for the adventure
      const templateData = parsed.characterSheetTemplate;
      if (!templateData) {
        return {};
      }

      // If using a preset template ID, resolve it
      if (templateData.preset_id) {
        const presetTemplate = CHARACTER_SHEET_PRESET_TEMPLATES.find(
          (t) => t.id === templateData.preset_id
        );
        if (presetTemplate) {
          return {
            characterSheetTemplate: {
              template: presetTemplate.template,
              fields: [], // Fields will be parsed on frontend
            },
          };
        }
      }

      // Custom template provided
      if (templateData.template) {
        return {
          characterSheetTemplate: {
            template: templateData.template,
            fields: [], // Fields will be parsed on frontend
          },
        };
      }

      return {};
    }

    // Content substages
    if (stage === "content-lore") {
      return {
        storyTemplate: {
          lore: parsed.lore,
        },
      };
    }

    if (stage === "content-npcs") {
      // NPCs stage - add createdAt timestamps if not present
      const npcs = (parsed.npcs || []).map(
        (npc: import("./structs").NPC, idx: number) => ({
          ...npc,
          id: npc.id || `npc_${Date.now()}_${idx}`,
          createdAt: npc.createdAt || Date.now(),
          status: npc.status || "unknown",
          attitude: npc.attitude || "neutral",
        })
      );
      return {
        storyTemplate: {
          npcs,
        },
      };
    }

    if (stage === "content-goals") {
      return {
        storyTemplate: {
          goals: parsed.goals,
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
        storyTemplate: {},
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
      lore: [],
      goals: [],
      relationships: [],
    },
  };

  for (const result of results) {
    if (!result) continue;

    if (result.title) merged.title = result.title;
    if (result.shortDescription)
      merged.shortDescription = result.shortDescription;
    if (result.description) merged.description = result.description;
    if (result.startingChoices) merged.startingChoices = result.startingChoices;
    if (result.characterSheetTemplate)
      merged.characterSheetTemplate = result.characterSheetTemplate;

    if (result.storyTemplate) {
      // Merge array fields by concatenation instead of replacement
      // NOTE: abilities and inventory are DEPRECATED - not included here
      const arrayFields = [
        "lore",
        "goals",
        "presets",
        "customTables",
        "variables",
        "relationships",
        "stats",
        "resources",
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

      // NOTE: inventory and abilities icon assignments are DEPRECATED - removed

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

      // Apply to presets (icon field)
      if (assignments.presets && merged.storyTemplate.presets) {
        merged.storyTemplate.presets = merged.storyTemplate.presets.map(
          (preset) => ({
            ...preset,
            // Preset uses 'icon' field, not 'symbol'
            icon: assignments.presets![preset.name] || preset.icon,
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
    // NOTE: "mechanics" stage (abilities & variables) is DEPRECATED - removed
    // Character sheet runs after mechanics notes (defines stats/resources)
    stages.push("character-sheet");
  }

  // Content substages - all enabled if content stage is enabled
  const contentEnabled = stageConfigs.content?.enabled !== false;

  if (contentEnabled) {
    stages.push("content-lore");
    stages.push("content-npcs");
    stages.push("content-goals");
  }

  // Advanced substages - only if specific features are enabled AND advanced stage is enabled
  const advancedEnabled = stageConfigs.advanced?.enabled !== false;

  if (advancedEnabled && config.includePresets) {
    stages.push("advanced-presets");
  }
  if (advancedEnabled && (config.includeAGMT || config.includeCustomTables)) {
    stages.push("advanced-tables");
  }
  if (advancedEnabled && config.includeStartingChoices) {
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
  // NOTE: "mechanics" stage is deprecated and removed
  const inputEstimates: Record<GenerationStage, number> = {
    core: 2000,
    "mechanics-notes": 3500, // Expanded prompt with foundational systems
    "character-sheet": 2500,
    "content-lore": 3500,
    "content-npcs": 3500,
    "content-goals": 3000,
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
    } else if (stage === "content-goals") {
      const outputMultiplier = Math.min(2, contentIterations.goals);
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
    // Create a slimmed-down version to avoid quota issues
    const slimConfig: BigAdventureConfig = {
      ...data.config,
      // Limit imported content
      importedLore: data.config.importedLore?.slice(0, 10),
      importedMechanicsNotes: data.config.importedMechanicsNotes?.slice(0, 10),
      importedCustomTables: data.config.importedCustomTables?.slice(0, 5),
    };

    // Slim down partialResults if it has a storyTemplate with large arrays
    let slimPartialResults = data.partialResults;
    if (data.partialResults?.storyTemplate) {
      const st = data.partialResults.storyTemplate;
      slimPartialResults = {
        ...data.partialResults,
        storyTemplate: {
          ...st,
          lore: st.lore?.slice(0, 30),
          goals: st.goals?.slice(0, 20),
          customTables: st.customTables?.slice(0, 10),
        },
      };
    }

    const slimData: BigAdventureAutosave = {
      ...data,
      config: slimConfig,
      partialResults: slimPartialResults,
    };
    localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(slimData));
  } catch (e) {
    // Quota exceeded - clear old data and try minimal save
    console.warn("Autosave quota exceeded, attempting minimal save:", e);
    try {
      localStorage.removeItem(AUTOSAVE_KEY);
      localStorage.removeItem("bigAdventure_configDraft");
      localStorage.removeItem("bigAdventure_generatedData");
      // Save minimal autosave with just progress info
      const minimalData: BigAdventureAutosave = {
        id: data.id,
        timestamp: data.timestamp,
        config: {
          ...data.config,
          importedLore: [],
          importedMechanicsNotes: [],
          importedCustomTables: [],
        },
        completedStages: data.completedStages,
        partialResults: {
          title: data.partialResults?.title,
          shortDescription: data.partialResults?.shortDescription,
        },
        currentStage: data.currentStage,
        currentIteration: data.currentIteration,
      };
      localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(minimalData));
    } catch {
      // Give up silently - generation will continue but won't be recoverable
      console.warn("Failed to save even minimal autosave");
    }
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
    // Create a minimal config without large data fields
    const minimalConfig = {
      ...config,
      // Don't save imported PDF data - it's too large
      importedLore: config.importedLore?.slice(0, 10), // Keep only first 10
      importedMechanicsNotes: config.importedMechanicsNotes?.slice(0, 10),
      importedCustomTables: config.importedCustomTables?.slice(0, 5),
    };
    localStorage.setItem(
      "bigAdventure_configDraft",
      JSON.stringify({
        config: minimalConfig,
        timestamp: Date.now(),
      })
    );
  } catch (e) {
    // Quota exceeded - try to clear old data and retry with minimal config
    console.warn("Config draft save failed, clearing old data:", e);
    try {
      localStorage.removeItem("bigAdventure_configDraft");
      localStorage.removeItem("bigAdventure_generatedData");
      // Save without imported content
      const bareConfig = {
        ...config,
        importedLore: [],
        importedMechanicsNotes: [],
        importedCustomTables: [],
      };
      localStorage.setItem(
        "bigAdventure_configDraft",
        JSON.stringify({
          config: bareConfig,
          timestamp: Date.now(),
        })
      );
    } catch {
      // Give up silently
    }
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

  if (currentResult.storyTemplate?.abilities?.length) {
    context += `\n- Abilities: ${currentResult.storyTemplate.abilities
      .map((a) => a.name)
      .join(", ")}`;
  }
  if (currentResult.storyTemplate?.lore?.length) {
    context += `\n- Lore entries: ${currentResult.storyTemplate.lore.length}`;
  }
  if (currentResult.storyTemplate?.goals?.length) {
    context += `\n- Goals: ${currentResult.storyTemplate.goals.length}`;
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
        "Generate a new opening intro (3-5 paragraphs) and premise (2-3 paragraphs).",
      schema: `{ "intro": "string", "premise": "string" }`,
    },
    characterSheetTemplate: {
      instruction:
        "Generate a fillable character sheet template appropriate for this adventure. Use {{FieldName | Description | Default}} syntax for fillable fields. IMPORTANT: Include visible labels before each field (e.g., '**Strength**: {{Strength | ...}}' NOT just '{{Strength | ...}}'). Consider using a preset ID (dnd5e, coc, traveller, monsterhearts, fate, pbta, bitd, wod) or create a custom template.",
      schema: `{ "characterSheetTemplate": { "preset_id": "string (optional)", "template": "string (markdown with visible labels and {{field}} syntax)" } }`,
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

You have COMPLETE FREEDOM to design the mechanics. Define:
- How skill checks work (dice system, modifiers, difficulty tiers)
- Combat rules (initiative, attacks, damage, conditions)
- Character progression (leveling, XP, upgrades)
- Rest & recovery (how resources regenerate)
- Death & defeat (what happens at 0 HP/equivalent)
- NPC/enemy guidelines (stat ranges, health scaling, example stat blocks)
- Item guidelines (types, grades/tiers if applicable, durability if applicable)
- Encounter design principles

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
    goals: {
      instruction: `Generate goals with objectives. Create as many as appropriate for this adventure's scope.`,
      schema: `{ "goals": [{ "id": "goal_xxx", "title": "string", "shortDescription": "string", "description": "string", "active": boolean, "fulfilled": false }] }`,
    },
    presets: {
      instruction: `Generate character presets with unique character sheets and abilities. Create as many as appropriate to give players meaningful choices.

CRITICAL: Each preset MUST include a "characterSheet" field - a filled-out markdown character sheet that defines ALL stats, attributes, skills, and resources for that character.
Each preset's "intro" is a COMPLETE REPLACEMENT (3-5 paragraphs) for the default intro, NOT an addition.
Write full, standalone content - not fragments!`,
      schema: `{ "presets": [{ "id": "preset-xxx", "name": "string", "description": "string", "icon": "emoji", "characterSheet": "string (filled character sheet in markdown with all stats/resources)", "intro": "string (3-5 paragraphs - COMPLETE replacement)", "inventory": [...], "abilities": [...], "relationships": [], "authorNotes": "string" }] }`,
    },
    agmt: {
      instruction: "Generate Advanced RPG Tools initial state for solo play.",
      schema: `{ "agmtState": { "chaosFactor": number (1-9), "sceneCount": 0, "threads": [{ "id": "thread_xxx", "description": "string", "status": "active" }], "characters": [{ "id": "char_xxx", "name": "string", "role": "string", "status": "active" }], "skillCheckHistory": [], "currentStreak": 0, "lastChaosAdjustment": 0 } }`,
    },
    customTables: {
      instruction: `Generate random tables (encounters, weather, events, etc). Create as many tables as needed. Each table MUST have 20-50 entries for proper variety.`,
      schema: `{ "customTables": [{ "id": "table_xxx", "name": "string", "description": "string", "entries": [{ "text": "string (20-50 entries per table!)", "weight": number (1-10) }] }] }`,
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
      schema: `{ "iconAssignments": { "relationships": { "NPCName": "icon-id" }, "presets": { "PresetName": "icon-id" } } }`,
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

Be creative and thematic. Ensure new content integrates well with existing elements. Do NOT use emojis.`;

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
          },
        };
      case "characterSheetTemplate":
        if (parsed.characterSheetTemplate?.preset_id) {
          const presetTemplate = CHARACTER_SHEET_PRESET_TEMPLATES.find(
            (t) => t.id === parsed.characterSheetTemplate.preset_id
          );
          if (presetTemplate) {
            return {
              characterSheetTemplate: {
                template: presetTemplate.template,
                fields: [],
              },
            };
          }
        }
        if (parsed.characterSheetTemplate?.template) {
          return {
            characterSheetTemplate: {
              template: parsed.characterSheetTemplate.template,
              fields: [],
            },
          };
        }
        return null;
      case "variables":
        return { storyTemplate: { variables: parsed.variables } };
      case "mechanicsLore":
        return { storyTemplate: { lore: parsed.lore } };
      case "lore":
        return { storyTemplate: { lore: parsed.lore } };
      case "goals":
        return { storyTemplate: { goals: parsed.goals } };
      case "presets":
        return { storyTemplate: { presets: parsed.presets } };
      case "agmt":
        return { storyTemplate: { agmtState: parsed.agmtState } };
      case "customTables":
        return { storyTemplate: { customTables: parsed.customTables } };
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
  "mechanicsLore",
  "lore",
  "goals",
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
      case "goals":
        existingItems = (template.goals || []) as {
          name?: string;
          title?: string;
        }[];
        existingItemsPreview = existingItems
          .map((g) => g.title)
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
    characterSheetTemplate: { instruction: "", schema: "" },
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
    goals: {
      instruction: `Generate NEW goals with objectives. Generate as many as possible.`,
      schema: `{ "goals": [{ "id": "goal_xxx", "title": "string", "shortDescription": "string", "description": "string", "active": boolean, "fulfilled": false }] }`,
    },
    presets: {
      instruction: `Generate NEW character presets with unique character sheets and abilities. Generate as many as the output budget allows.

CRITICAL: Each preset MUST include a "characterSheet" field - a filled-out markdown character sheet for that specific character that defines ALL stats, attributes, skills, and resources.
Each preset's "intro" is a COMPLETE REPLACEMENT (3-5 paragraphs) for the default intro, NOT an addition.
Write full, standalone content - not fragments!`,
      schema: `{ "presets": [{ "id": "preset-xxx", "name": "string", "description": "string", "icon": "emoji", "characterSheet": "string (filled character sheet in markdown with all stats/resources)", "intro": "string (3-5 paragraphs - COMPLETE replacement)", "inventory": [...], "abilities": [...], "relationships": [], "authorNotes": "string" }] }`,
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
- Do NOT use emojis anywhere
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
      case "goals":
        return {
          storyTemplate: {
            goals: [...(template.goals || []), ...(parsed.goals || [])],
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
