import {
  StoryData,
  Choice,
  CommandResponse,
  AbilityGrade,
  StoryLore,
  REST_CONFIG,
  getMemoryContent,
} from "@/app/misc/structs";
import { getRPGSystem } from "@/app/misc/rpgSystems";
import { formatResponsesForAI } from "@/app/misc/commandResponses";
import { getModelConfig } from "@/app/misc/ai_prices";
import { ABILITY_GRADE_CONFIG } from "@/app/misc/abilitySystem";

export type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: any[];
  tool_call_id?: string;
};

// ============================================
// ROLE AFFIRMATION MESSAGES (Prefills)
// ============================================
// These "fake" assistant messages prime the model to follow output constraints
// by making it appear the model has already committed to the rules.

export const STORY_AFFIRMATION = `Understood. I will write the narrative response adhering to these standards:
- **Perspective:** Strict Second Person ("You"), deep POV.
- **Style:** "Show, Don't Tell" with visceral sensory details; varying sentence structure; NO banned words.
- **Agency:** I will respect the Action Result (Success/Failure) and the Active Challenge state.
- **Format:** Prose with emphasis (*italics*, **bold**) and --- breaks. No ## headers unless major scene change.

Here is the narrative:
`;

export const TOOLS_AFFIRMATION = `Understood. I will audit the narrative for game state changes:
- **Accuracy:** I will use EXACT string matching for items, stats, and quest names.
- **Already Applied:** Bracketed annotations like [Item Used: X], [Mana: -10], [Health: -15] mean those changes ALREADY HAPPENED. I will NOT duplicate them.

⚠️ CRITICAL: I MUST call ALL necessary tools in THIS SINGLE RESPONSE. I will NOT stop after one tool - I will call 2, 3, 4, or more tools together if multiple changes are needed.

Based on the narrative, here are the game state changes I will execute NOW (calling all tools in parallel):`;

export const CHOICES_AFFIRMATION = `Understood. I will generate player choices following these rules:
- **Format:** Plain list with dashes, one choice per line.
- **Mechanics:** Use exact stat/resource/item names from game state.
- **Balance:** Include safe options and risky-but-rewarding options.
- **No Repeat Rolls:** Avoid re-testing the same skill check that just resolved.

Generating choices:`;

// ============================================
// FEW-SHOT EXAMPLES
// ============================================
// These example exchanges teach the model the expected format at the start of a story
// when there's little context to learn from. We show a complete mini-playthrough.

const FEW_SHOT_INFO_MESSAGE = `# Story: The Merchant's Gambit
A cunning merchant navigates a dangerous bazaar.

## Character (Merchant)
- Agility: Good (+2)
- Persuasion: Average (+0)
- Perception: Fair (+1)
- Gold: 50/100`;

const FEW_SHOT_STORY_EXAMPLE_1 = {
  user: `>I'll check the merchant's stall for the stolen amulet.
[Perception: success]`,
  assistant: `The spice merchant's stall reeks of cinnamon and something fouler—old sweat, perhaps, or fear. You run your fingers along the edge of a brass tray, pretending to inspect the saffron threads while your eyes scan the shadows beneath the counter.

*There.*

A glint of silver catches the lamplight. The amulet—your client's family heirloom—lies half-hidden beneath a bolt of silk, its sapphire eye winking at you like a shared secret.

The merchant notices your stillness. His smile doesn't reach his eyes. "Something catch your interest, friend?"

Behind you, the crowd's murmur shifts. Two men in dark robes have stopped at the neighboring stall, their gazes too casual, too fixed.
[STOP]`,
  stateChanges: [
    "Memory added: The stolen amulet is at Farouk's spice stall, hidden under silk",
    "Lore updated: Added details about Farouk's suspicious behavior",
  ],
};

const FEW_SHOT_STORY_EXAMPLE_2 = {
  user: `>Distract the merchant and grab the amulet.
[Persuasion: failure]`,
  assistant: `"Those saffron threads," you say, gesturing to the upper shelf. "Are they from the southern provinces? The color seems—"

Farouk's hand shoots out, faster than a striking cobra. His fingers close around your wrist like a vice.

"You think me a fool?" His voice drops to a hiss. The crowd noise swallows his words, but his grip doesn't waver. "I know what you're reaching for, *thief*."

The two robed figures are moving now, cutting through the crowd with purpose. One of them has a hand beneath his cloak.

Your curved dagger presses against your hip. The exit is three stalls away, blocked by a cart of melons. The rooftops—if you could reach them—offer another path.

Farouk's grip tightens. "Now. We talk price. Or we talk to the Caliph's men."
[STOP]`,
  stateChanges: [
    "Condition added: Compromised Position (Tier I) - Farouk has you by the wrist",
  ],
};

// Few-shot tool calls example (showing the tool calling format)
const FEW_SHOT_TOOL_CALLS = [
  {
    id: "ex1",
    type: "function" as const,
    function: {
      name: "add_memory",
      arguments: JSON.stringify({
        entry:
          "The stolen amulet is hidden at Farouk's spice stall, beneath silk bolts",
      }),
    },
  },
  {
    id: "ex2",
    type: "function" as const,
    function: {
      name: "add_condition",
      arguments: JSON.stringify({
        name: "Compromised Position",
        tier: 1,
        description:
          "Farouk has grabbed your wrist, limiting your movement options.",
        affects: ["Agility"],
        source: "Failed distraction attempt",
      }),
    },
  },
];

const FEW_SHOT_TOOL_RESPONSES = [
  {
    toolCallId: "ex1",
    success: true,
    message:
      'Memory added: "The stolen amulet is hidden at Farouk\'s spice stall, beneath silk bolts"',
  },
  {
    toolCallId: "ex2",
    success: true,
    message:
      "Condition 'Compromised Position' (Tier I) added, affects: Agility",
  },
];

/**
 * Build few-shot example messages for the story stage
 * Only used when there's little context (< 3 scene parts)
 */
export function buildStoryFewShotMessages(): ChatMessage[] {
  return [
    // Example info message
    { role: "user", content: FEW_SHOT_INFO_MESSAGE },
    // First turn
    { role: "user", content: FEW_SHOT_STORY_EXAMPLE_1.user },
    { role: "assistant", content: FEW_SHOT_STORY_EXAMPLE_1.assistant },
    {
      role: "assistant",
      content: `[GM State Update]\n${FEW_SHOT_STORY_EXAMPLE_1.stateChanges
        .map((s) => `• ${s}`)
        .join("\n")}`,
    },
    // Second turn
    { role: "user", content: FEW_SHOT_STORY_EXAMPLE_2.user },
    { role: "assistant", content: FEW_SHOT_STORY_EXAMPLE_2.assistant },
    {
      role: "assistant",
      content: `[GM State Update]\n${FEW_SHOT_STORY_EXAMPLE_2.stateChanges
        .map((s) => `• ${s}`)
        .join("\n")}`,
    },
    // Transition to new story
    {
      role: "user",
      content:
        "--- END OF EXAMPLE ---\nNow let's begin a NEW story. The following info message describes the actual adventure:",
    },
  ];
}

/**
 * Build few-shot example messages for the tools stage
 * Only used when there's little context (< 3 scene parts)
 */
export function buildToolsFewShotMessages(): ChatMessage[] {
  return [
    // Example info message
    { role: "user", content: FEW_SHOT_INFO_MESSAGE },
    // Example story text that needs tool processing
    {
      role: "user",
      content: `Here is the latest story text to process:\n\n${FEW_SHOT_STORY_EXAMPLE_2.assistant}`,
    },
    // Example tool calls
    {
      role: "assistant",
      content:
        "Analyzing the narrative for game state changes:\n1. A memory should be added about the amulet's location\n2. Nazim noticed and is ready to help - relationship improves\n3. Player is in a compromised position - condition needed\n\nCalling tools:",
      tool_calls: FEW_SHOT_TOOL_CALLS,
    },
    // Tool responses
    ...FEW_SHOT_TOOL_RESPONSES.map((r) => ({
      role: "tool" as const,
      tool_call_id: r.toolCallId,
      content: `${r.success ? "✓" : "✗"} ${r.message}`,
    })),
    // Acknowledgment
    {
      role: "assistant",
      content: "Game state updated. All changes processed successfully.",
    },
    // Transition to actual story
    {
      role: "user",
      content:
        "--- END OF EXAMPLE ---\nNow process the ACTUAL story. The following info message shows the real game state:",
    },
  ];
}

// Threshold for using few-shot examples (when scene has fewer parts than this)
export const FEW_SHOT_THRESHOLD = 10;

/**
 * Context retrieved from embedding search
 */
export interface EmbeddingContext {
  /** Lore titles that are semantically relevant */
  loreTitles: string[];
  /** Memory contents that are semantically relevant */
  memories: string[];
}

// Estimate tokens from text (rough approximation: ~4 chars per token)
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// Token budgets for different stages (these are for scene history only)
export const TOOL_STAGE_TOKEN_BUDGET = 12000; // ~12k tokens for tool stage history
export const CHOICES_STAGE_TOKEN_BUDGET = 4000; // ~4k tokens for choices stage history
export const ACTION_ANALYSIS_TOKEN_BUDGET = 4000; // ~4k tokens for action analysis

/**
 * Get scene parts that fit within a token budget, taking most recent first
 * @param parts - Array of scene parts
 * @param tokenBudget - Maximum tokens to include
 * @returns Array of parts that fit, preserving chronological order
 */
export function getPartsWithinTokenBudget(
  parts: StoryData["scene"]["parts"],
  tokenBudget: number
): StoryData["scene"]["parts"] {
  if (!parts || parts.length === 0) return [];

  // Start from the end (most recent) and work backwards
  const selectedParts: StoryData["scene"]["parts"] = [];
  let totalTokens = 0;

  for (let i = parts.length - 1; i >= 0; i--) {
    const part = parts[i];
    const partText = part.raw || part.content;
    const partTokens = estimateTokens(partText);

    // Include tool call/response overhead if present
    const toolOverhead =
      (part.toolCalls?.length || 0) * 50 +
      (part.toolResponses?.length || 0) * 30;

    const totalPartTokens = partTokens + toolOverhead;

    if (totalTokens + totalPartTokens > tokenBudget) {
      break; // Can't fit any more
    }

    selectedParts.unshift(part); // Add to front to maintain order
    totalTokens += totalPartTokens;
  }

  return selectedParts;
}

// Cleans text by removing problematic characters and normalizing whitespace
export function cleanString(text: string): string {
  if (!text) return "";
  return text
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    .replace(/[\u00A0\u1680\u2000-\u200B\u202F\u205F\u3000]/g, " ")
    .replace(/ {2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+$/gm, "")
    .replace(/^[ \t]+/gm, "")
    .trim();
}

// Strips markdown formatting from text to save tokens in older messages
// Removes headers, bold, italics, horizontal rules while preserving the text content
export function stripMarkdown(text: string): string {
  if (!text) return "";
  return (
    text
      // Remove headers (## Header -> Header)
      .replace(/^#{1,6}\s+/gm, "")
      // Remove horizontal rules
      .replace(/^---+$/gm, "")
      // Remove bold (**text** or __text__ -> text)
      .replace(/\*\*([^*]+)\*\*/g, "$1")
      .replace(/__([^_]+)__/g, "$1")
      // Remove italics (*text* or _text_ -> text)
      .replace(/\*([^*]+)\*/g, "$1")
      .replace(/_([^_]+)_/g, "$1")
      // Remove strikethrough (~~text~~ -> text)
      .replace(/~~([^~]+)~~/g, "$1")
      // Remove inline code (`code` -> code)
      .replace(/`([^`]+)`/g, "$1")
      // Collapse multiple newlines left by removed elements
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
}

// Helper to describe chaos factor level
function getChaosDescription(chaos: number): string {
  if (chaos <= 3) return "Very Ordered - Things go as expected";
  if (chaos <= 5) return "Normal - Standard chaos level";
  if (chaos <= 7) return "Chaotic - Unexpected twists likely";
  return "Extreme Chaos - Anything can happen!";
}

// Helper to convert stat percentage values to descriptive words
function getStatDescriptor(value: number): string {
  if (value <= 10) return "abysmal";
  if (value <= 20) return "very low";
  if (value <= 35) return "low";
  if (value <= 45) return "below average";
  if (value <= 55) return "average";
  if (value <= 65) return "above average";
  if (value <= 80) return "high";
  if (value <= 90) return "very high";
  return "exceptional";
}

// Build info message - shared across all stages
// Optional embeddingContext allows embedding-enhanced lore/memory retrieval
export function buildInfoMessage(
  storyData: StoryData,
  embeddingContext?: EmbeddingContext
): string {
  const rpgSystem = getRPGSystem(storyData.rpgSystem || "3d6");

  // Build stats section
  const statsSection = storyData.stats.length
    ? `## Stats\n${storyData.stats
        .map(
          (s) =>
            `- ${s.name}: ${getStatDescriptor(s.value)}${
              s.description ? ` (${s.description})` : ""
            }`
        )
        .join("\n")}`
    : "";

  // Build resources section
  const resourcesSection = storyData.resources.length
    ? `## Resources\n${storyData.resources
        .map(
          (r) =>
            `- ${r.name}: ${r.value}/${r.maxValue}${
              r.description ? ` (${r.description})` : ""
            }`
        )
        .join("\n")}`
    : "";

  // Build abilities section with grade, cooldown, and cost info
  const abilitiesSection = storyData.abilities?.length
    ? `## Abilities\n${storyData.abilities
        .map((a) => {
          const gradeLabel = a.grade
            ? ` (${
                ABILITY_GRADE_CONFIG[a.grade as AbilityGrade]?.label || a.grade
              })`
            : "";
          const cooldownInfo =
            (a.cooldown || 0) > 0
              ? ` [cooldown: ${a.currentCooldown || 0}/${a.cooldown}]`
              : "";
          const costInfo = a.cost?.length
            ? ` [costs: ${a.cost
                .map((c) => `${c.amount} ${c.name}`)
                .join(", ")}]`
            : "";
          const statInfo = a.stat ? ` [${a.stat}]` : "";
          const desc = a.description ? ` - ${a.description}` : "";
          const readyStatus =
            (a.currentCooldown || 0) > 0 ? " (on cooldown)" : " (ready)";
          return `- ${a.name}${gradeLabel}${statInfo}${cooldownInfo}${costInfo}${readyStatus}${desc}`;
        })
        .join("\n")}`
    : "";

  // Build achievements section - show LOCKED achievements with ai_hint
  const lockedAchievements = storyData.achievements.filter(
    (a) => !a.dateAchieved
  );
  const achievementsSection = lockedAchievements.length
    ? `## Locked Achievements\n${lockedAchievements
        .map((a) => `- ${a.title}: ${a.ai_hint || a.description}`)
        .join("\n")}`
    : "";

  // Build lore section - use embeddings if available, otherwise fallback to trigger-based
  const currentPartIndex = storyData.scene.parts.length;

  // Separate mechanics lore (always included, prioritized first in context)
  const mechanicsLore = storyData.lore.filter(
    (l) => l.enabled !== false && l.type === "mechanics"
  );
  const mechanicsSection = mechanicsLore.length
    ? `## Game Mechanics\nThese are the rules for this adventure. Follow them precisely.\n----\n${mechanicsLore
        .map((l) => `### ${l.title}\n${cleanString(l.content)}`)
        .join("\n----\n")}`
    : "";

  // Always-on lore is always included (excluding mechanics)
  const alwaysOnLore = storyData.lore.filter((l) => {
    if (l.enabled === false) return false;
    if (l.type === "mechanics") return false; // Handled separately
    return l.alwaysOn === true;
  });

  // If we have embedding context, use embedding-based selection
  let activeLore: StoryLore[];
  if (embeddingContext && embeddingContext.loreTitles.length > 0) {
    // Get lore entries matching embedding-retrieved titles
    const embeddingLoreTitles = new Set(
      embeddingContext.loreTitles.map((t) => t.toLowerCase())
    );
    const embeddingLore = storyData.lore.filter(
      (l) =>
        l.enabled !== false &&
        l.type !== "mechanics" && // Mechanics handled separately
        !l.alwaysOn && // Not already in alwaysOnLore
        embeddingLoreTitles.has(l.title.toLowerCase())
    );
    // Embedding mode: only alwaysOn + embedding-matched lore
    activeLore = [...alwaysOnLore, ...embeddingLore];
  } else {
    // Fallback to trigger-based logic (for small lore sets or no embeddings)
    // Start with always-on and manually revealed lore
    const baseLore = storyData.lore.filter((l) => {
      if (l.enabled === false) return false;
      if (l.type === "mechanics") return false; // Mechanics handled separately
      if (l.alwaysOn) return true;
      const wasRevealed = storyData.scene.parts.some((p) =>
        p.revealedLore?.some(
          (title) => title.toLowerCase() === l.title.toLowerCase()
        )
      );
      return wasRevealed;
    });

    const triggerLore = storyData.lore.filter((l) => {
      if (l.enabled === false) return false;
      if (l.type === "mechanics") return false; // Mechanics handled separately
      if (l.alwaysOn) return false; // Already in baseLore
      const wasRevealed = storyData.scene.parts.some((p) =>
        p.revealedLore?.some(
          (title) => title.toLowerCase() === l.title.toLowerCase()
        )
      );
      if (wasRevealed) return false; // Already in baseLore

      // Standard trigger-based logic
      if (l.on === false) return false;
      if (!l.lastTriggeredIndex) return l.on === true;
      return currentPartIndex - l.lastTriggeredIndex <= 15;
    });
    activeLore = [...baseLore, ...triggerLore];
  }

  const loreSection = activeLore.length
    ? `## Notes/Lore\n----\n${activeLore
        .map((l) => `${l.title}\n${cleanString(l.content)}`)
        .join("\n----\n")}`
    : "";

  // Build memory section - use embeddings if available
  let memorySection: string;
  if (embeddingContext && embeddingContext.memories.length > 0) {
    // Use embedding-retrieved memories
    memorySection = `## Memory\n${embeddingContext.memories
      .map((m) => `- ${m}`)
      .join("\n")}`;
  } else {
    // Use all memories for smaller sets (or when no embeddings)
    memorySection = storyData.memory.length
      ? `## Memory\n${storyData.memory
          .map((m) => `- ${getMemoryContent(m)}`)
          .join("\n")}`
      : "";
  }

  // Build quests section if any exist
  const activeQuests =
    storyData.quests?.filter((q) => q.active && !q.fulfilled) || [];
  const inactiveQuests =
    storyData.quests?.filter((q) => !q.active && !q.fulfilled) || [];
  const questsSection =
    activeQuests.length || inactiveQuests.length
      ? `## Quests\n${
          activeQuests.length
            ? `### Active\n${activeQuests
                .map((q) => `- ${q.title}: ${q.description}`)
                .join("\n")}`
            : ""
        }${
          inactiveQuests.length
            ? `${activeQuests.length ? "\n" : ""}### Inactive\n${inactiveQuests
                .map((q) => `- ${q.title}`)
                .join("\n")}`
            : ""
        }`
      : "";

  // Build Advanced RPG Tools section if enabled
  const agmtSection = storyData.agmtState
    ? `## Advanced RPG Tools
- Chaos Factor: ${storyData.agmtState.chaosFactor}/9 (${getChaosDescription(
        storyData.agmtState.chaosFactor
      )})
- Scene Count: ${storyData.agmtState.sceneCount}`
    : "";

  // Build variables section if any exist - clean, simple format
  const variablesSection =
    storyData.variables && storyData.variables.length > 0
      ? `## Variables\n${storyData.variables
          .map((v) => {
            if (v.type === "number") {
              return `- ${v.name}: ${v.value}${
                v.description ? ` (${v.description})` : ""
              }`;
            } else if (v.type === "boolean") {
              return `- ${v.name}: ${v.value ? "true" : "false"}${
                v.description ? ` (${v.description})` : ""
              }`;
            } else if (v.type === "string") {
              return `- ${v.name}: "${v.value}"${
                v.description ? ` (${v.description})` : ""
              }`;
            } else {
              // list type
              const items = v.items.length ? v.items.join(", ") : "empty";
              return `- ${v.name}: [${items}]${
                v.description ? ` (${v.description})` : ""
              }`;
            }
          })
          .join("\n")}`
      : "";

  // Build threads section - show active storylines/quests being tracked
  const activeThreads =
    storyData.threads?.filter((t) => t.status === "active") || [];
  const completedThreads =
    storyData.threads?.filter(
      (t) => t.status === "resolved" || t.status === "abandoned"
    ) || [];
  // Truncate thread descriptions to prevent context bloat (max 200 chars)
  const truncateDesc = (desc: string, max = 200) =>
    desc.length > max ? desc.slice(0, max).trim() + "..." : desc;
  const threadsSection =
    activeThreads.length || completedThreads.length
      ? `## Story Threads
${
  activeThreads.length
    ? `### Active\n${activeThreads
        .map(
          (t) =>
            `- [${t.priority || "side"}] **${t.title}**: ${truncateDesc(
              t.description
            )}`
        )
        .join("\n")}`
    : ""
}
${
  completedThreads.length
    ? `### Completed\n${completedThreads
        .slice(-5) // Only show last 5 completed
        .map((t) => `- [${t.status}] ${t.title}`)
        .join("\n")}`
    : ""
}`
      : "";

  // Build character schema section if using new system
  let characterSchemaSection = "";
  if (storyData.characterSchema && storyData.characterData) {
    const schema = storyData.characterSchema;
    const charData = storyData.characterData;

    // Group fields by category
    const fieldsByCategory: Record<string, string[]> = {};
    const uncategorized: string[] = [];

    // Get category order from schema.categories
    const categoryOrder: Record<string, number> = {};
    if (schema.categories) {
      schema.categories.forEach((cat, index) => {
        categoryOrder[cat.id] = cat.order ?? index;
      });
    }

    // Helper to format a field value
    const formatField = (
      field: (typeof schema.fields)[0],
      value: unknown
    ): string | null => {
      switch (field.type) {
        case "number": {
          return `${field.name}: ${value}`;
        }
        case "derived": {
          const numVal = typeof value === "number" ? value : 0;
          const displayVal = numVal >= 0 ? `+${numVal}` : String(numVal);
          return `${field.name}: ${displayVal}`;
        }
        case "resource":
          if (typeof value === "object" && value && "current" in value) {
            const res = value as { current: number; max: number };
            return `${field.name}: ${res.current}/${res.max}`;
          }
          return null;
        case "boolean":
          return `${field.name}: ${value ? "Yes" : "No"}`;
        case "list":
          if (Array.isArray(value) && value.length > 0) {
            return `${field.name}:\n${value
              .map((item) => `  • ${item}`)
              .join("\n")}`;
          }
          return null;
        case "select":
        case "text":
          if (value) return `${field.name}: ${value}`;
          return null;
        default:
          return null;
      }
    };

    for (const field of schema.fields) {
      const value = charData.values[field.id];
      if (value === undefined) continue;

      const formatted = formatField(field, value);
      if (!formatted) continue;

      if (field.category) {
        if (!fieldsByCategory[field.category]) {
          fieldsByCategory[field.category] = [];
        }
        fieldsByCategory[field.category].push(formatted);
      } else {
        uncategorized.push(formatted);
      }
    }

    // Build the section with categories as h3 headers
    const sectionParts: string[] = [];
    sectionParts.push(`## Character (${schema.name})`);

    // Sort categories by order
    const sortedCategories = Object.keys(fieldsByCategory).sort((a, b) => {
      const orderA = categoryOrder[a] ?? 999;
      const orderB = categoryOrder[b] ?? 999;
      return orderA - orderB;
    });

    // Add categorized fields
    for (const categoryId of sortedCategories) {
      const categoryName =
        schema.categories?.find((c) => c.id === categoryId)?.name || categoryId;
      const fields = fieldsByCategory[categoryId];
      sectionParts.push(`### ${categoryName}`);
      sectionParts.push(fields.join("\n"));
    }

    // Add uncategorized fields at the end
    if (uncategorized.length > 0) {
      if (sortedCategories.length > 0) {
        sectionParts.push(`### Other`);
      }
      sectionParts.push(uncategorized.join("\n"));
    }

    if (sortedCategories.length > 0 || uncategorized.length > 0) {
      characterSchemaSection = sectionParts.join("\n");
    }
  }

  // Combine all sections
  const sections = [
    `# ${cleanString(storyData.story_name || "Untitled Story")}`,
    storyData.premise ? `**Premise:** ${cleanString(storyData.premise)}` : "",
    `**Player:** ${cleanString(storyData.player_name || "Hero")}${
      storyData.player_summary
        ? ` - ${cleanString(storyData.player_summary)}`
        : ""
    }`,
    // Only show RPG system if NOT using character schema (legacy mode)
    !storyData.characterSchema && rpgSystem.id !== "3d6"
      ? `**RPG System:** ${rpgSystem.name} - ${rpgSystem.description}`
      : "",
    characterSchemaSection, // New character schema section (if using new system)
    mechanicsSection, // Mechanics lore entries - prioritized first
    // Only show legacy stats/resources if NOT using character schema
    !storyData.characterSchema ? statsSection : "",
    !storyData.characterSchema ? resourcesSection : "",
    abilitiesSection,
    achievementsSection,
    loreSection,
    memorySection,
    questsSection,
    variablesSection,
    threadsSection,
    agmtSection,
    storyData.author_notes
      ? `## Author Notes\n${cleanString(storyData.author_notes)}`
      : "",
    storyData.player_notes
      ? `## Player Notes\n${cleanString(storyData.player_notes)}`
      : "",
    storyData.momentum !== undefined
      ? `**Momentum:** ${storyData.momentum}/${
          storyData.maxMomentum || 3
        } (spend for advantage/guaranteed success)`
      : "",
    storyData.points !== undefined && storyData.points > 0
      ? `**Points:** ${storyData.points}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  return cleanString(sections);
}

// Stage 1: Story narration only
// Uses 75% of available context for story history, 25% for info (lore, memory, stats, etc.)
export function buildStoryPrompt({
  storyData,
  userChoice,
  commandResponses,
  modelName = "Deepseek Chat",
  customMaxContext,
  customMaxOutput,
  embeddingContext,
  usePrefill = true,
  gmStoryContext,
}: {
  storyData: StoryData;
  userChoice?: string;
  commandResponses?: CommandResponse[];
  modelName?: string;
  customMaxContext?: number;
  customMaxOutput?: number;
  embeddingContext?: EmbeddingContext;
  usePrefill?: boolean;
  gmStoryContext?: string; // Context from GM stage (replaces ActionAnalysis annotations)
}): { messages: ChatMessage[]; prunedParts: number } {
  const rpgSystem = getRPGSystem(storyData.rpgSystem || "3d6");

  // Get model's context limit
  const modelConfig = getModelConfig(modelName);
  let effectiveMaxTokens = modelConfig.maxTokens;

  // Apply custom max context if set and smaller than model's limit
  if (
    customMaxContext &&
    customMaxContext > 0 &&
    customMaxContext < effectiveMaxTokens
  ) {
    effectiveMaxTokens = customMaxContext;
  }

  // Use custom max output if provided, otherwise use model's default
  const actualMaxOutput = customMaxOutput || modelConfig.maxOutputTokens;
  const maxContextTokens = effectiveMaxTokens - actualMaxOutput;

  // Allocate 75% for story history, 25% for info (system prompt + info message)
  const storyBudget = Math.floor(maxContextTokens * 0.75);
  const infoBudget = Math.floor(maxContextTokens * 0.25);

  const systemPrompt = `You are a creative narrative engine for a high-fidelity interactive text adventure.
Your role is to write ONLY the story prose.
The Input will provide the "Action Result" (Success/Failure). You describe the outcome.

## 1. CORE WRITING PRINCIPLES
- **Show, Don't Tell:** Ground abstract concepts in concrete sensory details (lighting, texture, smell, sound).
    - *Bad:* "You feel afraid."
    - *Good:* "The hair on your arms stands up; the air tastes of milk and copper."
- **Deep POV:** Write in strict SECOND PERSON ("You"). Immersive and immediate.
- **Word Choice:** Use precise verbs. Avoid generic words.
    - *Banned Words:* Testament, tapestry, dance of death, shivers down spine, smirked, ozone, white knuckles.
    - *Structure:* Vary sentence length. Short sentences for action. Complex flow for atmosphere.
    - Mix short, punchy sentences with longer, descriptive ones. Drop fill words to add variety.
    - Use precise words. Avoid adverbs, cliches and overused/commonly used phrases.

## 2. PLAYER AGENCY & STOPPING RULES
- **Protagonist:** The Player is the main character. NEVER write actions they didn't choose.
- **Stop Early:** When you reach a moment where the player must react, decide, or speak, end your response with [STOP].
    - *Crucial:* Do not resolve the suspense. Do not write what the player does next.
    - *Example:* "The guard spins around, spotting you. 'Hey!' he shouts, reaching for his sword...[STOP]"
- **Unclear Input:** If the player's choice is vague, describe the situation and end with [STOP] for input.

## 3. THE ACTIVE WORLD (The World Breathes)
- **NPC Agency:** NPCs have agendas. They do not just wait for the player to speak. They interrupt, they leave, they pursue goals.
- **Environment:** The world moves. Weather changes, crowds murmur, distant sounds occur.
- **No "Nothingburgers":** Avoid paragraphs that just restate the situation. Every response must ADVANCE the story (new info, world change, or dramatic development).

## 4. MECHANICS TRANSLATION
- **Success:** Show the competence and full impact of the action.
- **Failure (Fail Forward):** NEVER write "Nothing happens."
    - *Yes, but...* You succeed, but at a cost (injury, lost item, noise).
    - *No, and...* You fail, and the situation gets worse (guard alerted, weapon dropped).
- **Hidden Text:** Use ||double pipes|| for DM notes, foreshadowing, or secret NPC motives. The user can't see this text.

## 5. PACING & TONE
- **Combat/Action:** Fast, punchy, visceral. Focus on impact and movement.
- **Exploration:** Slower, atmospheric. Focus on sensory details and clues.
- **Dialogue:** Give NPCs distinct voices/mannerisms. Use subtext.

## 6. RPG SYSTEM
${rpgSystem.aiInstructions.diceSystem}

## 7. OUTPUT FORMAT
- **Markdown:** Use markdown sparingly for emphasis:
    - **Emphasis:** Use *italics* for internal thoughts, sounds, or whispers. Use **bold** for impactful moments.
    - **Breaks:** Use --- for dramatic pauses or perspective shifts within a scene.
    - **No Headers:** Do NOT use ## headers in your prose - save them for major scene changes only (rare).
- **No Meta-Text:** Do NOT write progress indicators, mechanical echoes, or UI labels like "Scene:", "Chapter:", "Progress 2/3".
- **No Mechanical Summaries:** Do NOT echo back the skill check results, item usage, or resource costs. Those are INPUT context - the player already saw the dice roll.
- **Stop Marker:** End your response with [STOP] when the player needs to react, decide, or speak next.

WRITE THE NARRATIVE RESPONSE ONLY!`;

  const infoMessage = buildInfoMessage(storyData, embeddingContext);
  const cleanedSystemPrompt = cleanString(systemPrompt);
  const cleanedInfoMessage = cleanString(infoMessage);

  // Calculate info tokens (system prompt + info message)
  const infoTokens =
    estimateTokens(cleanedSystemPrompt) + estimateTokens(cleanedInfoMessage);

  // If info exceeds its budget, we still include it but reduce story budget
  const actualStoryBudget = Math.max(
    storyBudget,
    maxContextTokens - infoTokens - 1000
  ); // Keep 1000 tokens buffer

  const messages: ChatMessage[] = [
    { role: "system", content: cleanedSystemPrompt },
  ];

  // Add few-shot examples when there's low context (< 3 scene parts)
  // This teaches the model the expected format before the actual story begins
  const useFewShot = storyData.scene.parts.length < FEW_SHOT_THRESHOLD;
  if (useFewShot) {
    messages.push(...buildStoryFewShotMessages());
    console.log(
      `[buildStoryPrompt] Using few-shot examples (${storyData.scene.parts.length} parts < ${FEW_SHOT_THRESHOLD} threshold)`
    );
  }

  // Add the actual info message
  messages.push({ role: "user", content: cleanedInfoMessage });

  // Build story history messages (we'll prune from the front if needed)
  // Include GM state changes from previous turns so the AI knows what happened
  const historyMessages: ChatMessage[] = [];

  // Count assistant (story) messages to determine which get [STOP] appended
  // We append [STOP] to the last 5 story messages to train the model on stopping
  const assistantIndices: number[] = [];
  for (let i = 0; i < storyData.scene.parts.length; i++) {
    if (!storyData.scene.parts[i].user) {
      assistantIndices.push(i);
    }
  }
  const stopThreshold =
    assistantIndices.length > 5
      ? assistantIndices[assistantIndices.length - 5]
      : 0;

  for (let i = 0; i < storyData.scene.parts.length; i++) {
    const part = storyData.scene.parts[i];
    if (part.user) {
      historyMessages.push({
        role: "user",
        content: cleanString(part.content),
      });
    } else {
      // For story generation, include the narrative content
      let assistantContent = part.raw || part.content;
      // Append [STOP] to last 5 assistant messages to train the model on stopping
      if (i >= stopThreshold) {
        assistantContent = assistantContent + "\n[STOP]";
      }
      historyMessages.push({
        role: "assistant",
        content: cleanString(assistantContent),
      });

      // If this assistant part had state changes from tools, include them as a GM note
      // We use stateChanges (human-readable) rather than raw tool_calls to avoid confusing
      // the story AI with tool schemas it doesn't have access to
      if (part.stateChanges && part.stateChanges.length > 0) {
        const gmNote = `[GM State Update]\n${part.stateChanges
          .map((s) => `• ${s}`)
          .join("\n")}`;
        historyMessages.push({
          role: "assistant",
          content: cleanString(gmNote),
        });
      }
    }
  }

  // Add user choice to history if present
  if (userChoice) {
    let choiceMessage = `Player chose: ${userChoice}`;

    // Include pending player actions (level ups, skill tree purchases, etc.)
    if (
      storyData.pendingPlayerActions &&
      storyData.pendingPlayerActions.length > 0
    ) {
      const actionsNote = `[Player Actions Between Turns]\n${storyData.pendingPlayerActions
        .map((a) => `• ${a}`)
        .join("\n")}`;
      choiceMessage = `${actionsNote}\n\n${choiceMessage}`;
    }

    // Include GM stage context if provided (replaces ActionAnalysis annotations)
    if (gmStoryContext) {
      choiceMessage = `${choiceMessage}\n\n${gmStoryContext}`;
      console.log(
        `[buildStoryPrompt] Including GM stage context: ${gmStoryContext.slice(
          0,
          200
        )}...`
      );
    }

    historyMessages.push({
      role: "user",
      content: cleanString(choiceMessage),
    });
  }

  // Calculate tokens for each history message
  const historyTokens = historyMessages.map((m) => estimateTokens(m.content));
  const totalHistoryTokens = historyTokens.reduce((sum, t) => sum + t, 0);

  // Prune from the front (oldest first) if over budget
  let prunedParts = 0;
  let currentTokens = totalHistoryTokens;
  let startIndex = 0;

  while (
    currentTokens > actualStoryBudget &&
    startIndex < historyMessages.length - 2
  ) {
    // Always keep at least the last 2 messages for context
    currentTokens -= historyTokens[startIndex];
    startIndex++;
    prunedParts++;
  }

  // Add the (possibly pruned) history
  // Strip markdown from older messages to save tokens and prevent AI oversaturation
  // Keep markdown only in the last 4 messages for immediate context
  const prunedHistory = historyMessages.slice(startIndex);
  const markdownThreshold = prunedHistory.length - 4;

  for (let i = 0; i < prunedHistory.length; i++) {
    const msg = prunedHistory[i];
    if (i < markdownThreshold && msg.role === "assistant") {
      // Strip markdown from older assistant messages
      messages.push({
        ...msg,
        content: stripMarkdown(msg.content),
      });
    } else {
      messages.push(msg);
    }
  }

  if (prunedParts > 0) {
    console.log(
      `[buildStoryPrompt] Pruned ${prunedParts} oldest parts to fit context budget. Kept ${prunedHistory.length} parts.`
    );
    console.log(
      `[buildStoryPrompt] Token budget: ${actualStoryBudget}, Used: ${currentTokens}, Info: ${infoTokens}`
    );
  }

  // Add role affirmation (prefill) if enabled
  // This primes the model to follow output constraints by appearing as if it already committed
  if (usePrefill) {
    messages.push({
      role: "assistant",
      content: STORY_AFFIRMATION,
    });
  }

  return { messages, prunedParts };
}

// Stage 2a: Tool calls / game state changes
export function buildToolPrompt({
  storyData,
  storyContent,
  commandResponses,
  existingToolCalls,
  existingToolResponses,
  embeddingContext,
  usePrefill = true,
}: {
  storyData: StoryData;
  storyContent: string; // The story text just generated
  commandResponses?: CommandResponse[];
  existingToolCalls?: any[]; // Tool calls from previous iterations
  existingToolResponses?: CommandResponse[]; // Tool responses from previous iterations
  embeddingContext?: EmbeddingContext;
  usePrefill?: boolean;
}): { messages: ChatMessage[] } {
  const rpgSystem = getRPGSystem(storyData.rpgSystem || "3d6");

  const systemPrompt = `You are the Game State Manager.
Your role is to read the latest narrative output and ensure the Game Database matches the story exactly.

User will not see your output. Use your message content to "Think Step-by-Step" before calling tools.

## CRITICAL: Existing Game Data
The info message contains the CURRENT game state - these are entries that ALREADY EXIST:
- **"## Lore"** = Lore entries that exist. Use \`update_lore\` to add info, NOT \`create_lore\`
- **"### Threads"** = Quests/storylines that exist. Use \`update_thread\` to progress, NOT \`create_thread\`
- **"## Memory"** = Facts already saved. Don't duplicate them.

Only use CREATE tools for GENUINELY NEW content not shown in the info message.

## ANALYSIS STEPS (Apply ONLY to the latest STORY TEXT)
1. **Resource Delta:** Did the player do anything to lose or gain resources? -> \`update_resource\` / \`modify_field\` (Eat/Bandage/Absorb Mana).
2. **Memory Management:** ⚠️ MOST TURNS NEED ZERO MEMORIES. Only add memory for:
    - Promises/debts: "Owes blacksmith 50 gold"
    - Codes/passwords: "Vault password: MOONRISE"
    - NPC facts: "Mayor's daughter is kidnapped"
    - Deadlines: "Must reach temple by dawn"
    - **DO NOT ADD** atmospheric details, descriptions, feelings, or story summaries
3. **No Changes Needed:** If no game state changes are required, call \`skip_tools\` instead of making unnecessary tool calls.
4. **NPC Management:** Did a new NPC appear? -> \`add_npc\` to create lore entry for significant NPCs.
5. **Variables:** Did the story introduce or change a variable (e.g., "The ancient mechanism is now active")? -> \`set_variable\`.
6. **Advanced RPG Tools (AGMT only):** If using AGMT, did the chaos factor change or scene transitions occur? -> \`update_agmt_state\`.
7. **Lore Management:** Did the story reveal new lore or update existing lore? -> \`create_lore\` / \`update_lore\`.
8. **Thread Management:** Did a new plotline/quest emerge or an existing one progress/conclude? -> \`create_thread\` / \`update_thread\` / \`resolve_thread\` / \`abandon_thread\`.

## ⛔ MEMORY ANTI-PATTERNS (NEVER DO THESE)
BAD: "A crow perches on the angel statue, watching with beady eyes" ← This is story text, not actionable
BAD: "The graveyard is eerie and misty" ← Atmospheric, not useful
BAD: "Samuel's grave has a wisp near it" ← Description, use lore instead
BAD: "The statue is damaged with broken wings" ← Use lore for location details

GOOD: "Samuel Veyne died 1847, grave in northeast corner" ← Specific fact player might need
GOOD: "Wisps appear near graves of murdered children" ← Actionable pattern
GOOD: "Crow seems to be following me since helicopter" ← Plot-relevant observation

If the story is just exploration/atmosphere with no promises, secrets, or deadlines → call \`skip_tools\`

## TOOL USAGE GUIDELINES
- **Exact Matching:** You must use exact string matching for Stat/Quest names.
- **Fail Forward:** If the narrative described a failure, ensure the *cost* of that failure is applied (lost resource, condition, etc.).

## LORE MANAGEMENT
Lore entries are the adventure's world-building database. Your job is to keep it alive and evolving.

⚠️ **CRITICAL: The "Lore" section in the info message shows EXISTING lore entries. Do NOT recreate them!**
- If you see "## Lore" with entries like "The Old Church\\n..." - that lore ALREADY EXISTS
- To add information to existing lore, use \`update_lore\` with the EXACT title
- Only use \`create_lore\` for COMPLETELY NEW topics not already in the Lore section

**When to CREATE NEW LORE (\`create_lore\`):**
- The narrative introduces a NEW named NPC **not already in the Lore section**
- A new faction, organization, or group is mentioned **for the first time**
- A significant location is discovered **that doesn't already have a lore entry**
- Important world lore is revealed that has NO existing entry

**When to UPDATE LORE (\`update_lore\`):**
- New information is revealed about an entry **that already exists in the Lore section**
- An NPC's relationship with the player changes significantly
- Circumstances change (faction alliance shifts, location is destroyed)

**Lore Quality Guidelines:**
- Lore should be DETAILED (2-4 paragraphs), not just one sentence
- Include: physical description, personality, motivations, relationships, secrets, relevance to player
- Think of lore as a "GM reference sheet" that will help future story generation

## THREAD MANAGEMENT
Track ongoing storylines, mysteries, quests, and plot hooks using threads.

⚠️ **CRITICAL: Threads are quest trackers, NOT story summaries!**
- Keep descriptions to 1-2 sentences max
- State ONLY the current objective and status
- Do NOT recap story events - that's what memory is for
- When updating, REPLACE the description entirely with a new concise summary

⚠️ **CRITICAL: The "Threads" section in the info message shows EXISTING threads. Do NOT recreate them!**
- If you see "### Threads" with entries like "[Active] Find the lost artifact" - that thread ALREADY EXISTS
- To update progress on an existing thread, use \`update_thread\` with the thread's title
- Only use \`create_thread\` for COMPLETELY NEW storylines not already tracked

**When to CREATE a Thread (\`create_thread\`):**
- A new main quest or objective emerges **that isn't already in the Threads section**
- An unresolved mystery or question is introduced **for the first time**
- A significant NPC makes a request or gives a task **not already tracked**
- A looming threat is revealed that will need to be addressed

**Thread Priorities:**
- **main:** Central story quests that drive the narrative forward
- **side:** Optional objectives the player could pursue
- **background:** Ambient world events, rumors, or distant threats

**When to UPDATE a Thread (\`update_thread\`):**
- New information is discovered that changes an **existing** thread's scope or direction
- Progress is made but the thread isn't resolved yet
- The situation escalates or de-escalates
- ⚠️ Write a NEW summary - do not append to the existing description!

**When to RESOLVE a Thread (\`resolve_thread\`):**
- The objective is completed successfully
- The mystery is solved
- The threat is neutralized
- The goal is achieved

**When to ABANDON a Thread (\`abandon_thread\`):**
- The objective becomes impossible or irrelevant
- The player explicitly gives up on it
- Story developments make the thread obsolete
- The opportunity window closes permanently

Think through the narrative sentence-by-sentence, then execute the required Tool Calls.`;

  const infoMessage = buildInfoMessage(storyData, embeddingContext);

  const messages: ChatMessage[] = [
    { role: "system", content: cleanString(systemPrompt) },
  ];

  // Add few-shot examples when there's low context (< 3 scene parts)
  // This teaches the model the expected tool calling format before the actual story begins
  const useFewShot = storyData.scene.parts.length < FEW_SHOT_THRESHOLD;
  if (useFewShot) {
    messages.push(...buildToolsFewShotMessages());
    console.log(
      `[buildToolPrompt] Using few-shot examples (${storyData.scene.parts.length} parts < ${FEW_SHOT_THRESHOLD} threshold)`
    );
  }

  // Add the actual info message
  messages.push({ role: "user", content: cleanString(infoMessage) });

  // Add scene parts within token budget for context (INCLUDING PAST TOOL CALLS)
  const recentParts = getPartsWithinTokenBudget(
    storyData.scene.parts,
    TOOL_STAGE_TOKEN_BUDGET
  );
  let lastWasToolResponse = false; // Track if last message was a tool response

  for (const part of recentParts) {
    if (part.user) {
      // If last message was a tool response, add an assistant acknowledgment first
      // This is required by Mistral which doesn't allow user messages after tool messages
      if (lastWasToolResponse) {
        messages.push({
          role: "assistant",
          content: "Understood. Processing player action.",
        });
        lastWasToolResponse = false;
      }
      messages.push({
        role: "user",
        content: cleanString(part.content),
      });
    } else {
      // Check if this assistant message had tool calls
      if (part.toolCalls && part.toolCalls.length > 0) {
        // Add assistant message WITH tool_calls array (preserves tool history)
        // Ensure each tool call has the required 'type: "function"' field (required by Mistral API)
        messages.push({
          role: "assistant",
          content: cleanString(part.raw || part.content),
          tool_calls: part.toolCalls.map(
            (tc: {
              id: string;
              type?: string;
              function: { name: string; arguments: string };
            }) => ({
              id: tc.id,
              type: "function" as const,
              function: tc.function,
            })
          ),
        });

        // Add tool responses as separate "tool" role messages
        if (part.toolResponses && part.toolResponses.length > 0) {
          for (const response of part.toolResponses) {
            messages.push({
              role: "tool",
              content: cleanString(response.message),
              tool_call_id: response.toolCallId,
            });
          }
          lastWasToolResponse = true;
        }

        console.log(
          `[buildToolPrompt] Including tool history: ${
            part.toolCalls.length
          } calls, ${part.toolResponses?.length || 0} responses`
        );
      } else {
        // Regular assistant message without tools
        lastWasToolResponse = false;
        const assistantContent = part.raw || part.content;
        messages.push({
          role: "assistant",
          content: cleanString(assistantContent),
        });
      }
    }
  }

  // If last part was tool responses, add acknowledgment before new user message
  if (lastWasToolResponse) {
    messages.push({
      role: "assistant",
      content: "Game state updated. Ready for new content.",
    });
  }

  // Add the new story content
  messages.push({
    role: "user",
    content: cleanString(
      `Story content that was just generated:\n\n${storyContent}\n\nBased on this narrative, what game state changes (commands and memory) should happen? Think out loud in your message content, then call all necessary tools.`
    ),
  });

  // Debug: Log tool context details
  const totalTokens = messages.reduce(
    (sum, m) => sum + estimateTokens(m.content),
    0
  );
  console.log(`[buildToolPrompt] Context breakdown:`);
  console.log(`  - System prompt: ${estimateTokens(systemPrompt)} tokens`);
  console.log(`  - Info message: ${estimateTokens(infoMessage)} tokens`);
  console.log(`  - Scene parts included: ${recentParts.length}`);
  console.log(
    `  - Scene parts tokens: ${recentParts.reduce(
      (sum, p) => sum + estimateTokens(p.raw || p.content),
      0
    )} tokens`
  );
  console.log(`  - Story content: ${estimateTokens(storyContent)} tokens`);
  console.log(`  - Total messages: ${messages.length}`);
  console.log(`  - Total estimated tokens: ${totalTokens}`);

  // Add role affirmation (prefill) if enabled and no existing tool calls
  // For multi-round tool calling, we skip the affirmation after the first round
  if (usePrefill && (!existingToolCalls || existingToolCalls.length === 0)) {
    messages.push({
      role: "assistant",
      content: TOOLS_AFFIRMATION,
    });
  }

  // If we have existing tool calls, add them to history and prompt for more
  if (existingToolCalls && existingToolCalls.length > 0) {
    // Add assistant's previous tool calls
    // Ensure each tool call has the required 'type: "function"' field (required by Mistral API)
    messages.push({
      role: "assistant",
      content: "Analyzing game state changes...",
      tool_calls: existingToolCalls.map(
        (tc: {
          id: string;
          type?: string;
          function: { name: string; arguments: string };
        }) => ({
          id: tc.id,
          type: "function" as const,
          function: tc.function,
        })
      ),
    });

    // Add tool responses
    if (existingToolResponses && existingToolResponses.length > 0) {
      for (const response of existingToolResponses) {
        messages.push({
          role: "tool",
          content: cleanString(
            `${
              response.success ? "✓" : response.success === false ? "✗" : "⚠"
            } ${response.message}`
          ),
          tool_call_id: response.toolCallId,
        });
      }

      // Add assistant acknowledgment after tool responses (required by Mistral)
      messages.push({
        role: "assistant",
        content: "Tools executed. Reviewing if additional changes are needed.",
      });
    }

    // Ask if anything else is needed
    const toolCallSummary = existingToolCalls
      .map((t, i) => {
        // Handle arguments that could be string or already-parsed object
        const args =
          typeof t.function.arguments === "string"
            ? JSON.parse(t.function.arguments || "{}")
            : t.function.arguments || {};
        const argsStr = Object.entries(args)
          .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
          .join(", ");
        return `${i + 1}. ${t.function.name}(${argsStr})`;
      })
      .join("\n");

    messages.push({
      role: "user",
      content: cleanString(
        `You already called these tools:\n${toolCallSummary}\n\nAnything else needed? Review the story and game state carefully. Return NO tool calls if everything is handled, or call additional tools if you missed something.`
      ),
    });
  }

  return { messages };
}

// Stage 2b: Choices generation
export function buildChoicesPrompt({
  storyData,
  storyContent,
  embeddingContext,
  usePrefill = true,
}: {
  storyData: StoryData;
  storyContent: string; // The story text just generated
  embeddingContext?: EmbeddingContext;
  usePrefill?: boolean;
}): { messages: ChatMessage[] } {
  const systemPrompt = `You are a choice designer for an interactive text-based adventure game.
Your role is to create meaningful player choices based on the narrative that was just written.

OUTPUT FORMAT:
Return a plain list of choices, one per line, starting with a dash:
\`\`\`
- Choice 1
- Choice 2
- Choice 3
\`\`\`

IMPORTANT: Choices are PLAIN TEXT only. Do NOT include:
- Skill checks or DCs (e.g., "[Strength DC 15]")
- Item tags (e.g., "<use: Sword>")
- Resource costs (e.g., "<cost: 5 Stamina>")
- Any bracketed metadata

The Game Master stage will determine if dice rolls are needed based on the player's chosen action.

CHOICE DESIGN GUIDELINES:
- Offer 3-6 meaningful choices that reflect different approaches
- Each choice should describe what the player WANTS TO DO
- Include a mix of safe options and risky options
- Make choices reflect the player's agency and current situation
- Avoid dead-end choices that just say "Continue..."
- Write choices as clear action statements:
  - GOOD: "Climb the wall to reach the balcony"
  - GOOD: "Try to convince the guard to let you pass"
  - GOOD: "Attack the goblin with your sword"
  - BAD: "Climb wall [Athletics DC 12]" (no brackets!)
  - BAD: "Attack <use: Sword>" (no item tags!)

NARRATIVE FLOW:
- If the player JUST succeeded at something, choices should build on that success
- If the player JUST failed, choices should deal with consequences or try different approaches
- Don't offer choices that repeat the same challenge they just faced`;

  const infoMessage = buildInfoMessage(storyData, embeddingContext);

  const messages: ChatMessage[] = [
    { role: "system", content: cleanString(systemPrompt) },
    { role: "user", content: cleanString(infoMessage) },
  ];

  // Add scene parts within token budget for context
  const recentParts = getPartsWithinTokenBudget(
    storyData.scene.parts,
    CHOICES_STAGE_TOKEN_BUDGET
  );
  for (const part of recentParts) {
    if (part.user) {
      messages.push({
        role: "user",
        content: cleanString(part.content),
      });
    } else {
      const assistantContent = part.raw || part.content;
      messages.push({
        role: "assistant",
        content: cleanString(assistantContent),
      });
    }
  }

  // Add the new story content
  messages.push({
    role: "user",
    content: cleanString(
      `Story content that was just generated:\n\n${storyContent}\n\nBased on this narrative and the current game state, what meaningful choices should the player have?`
    ),
  });

  // Add role affirmation (prefill) if enabled
  if (usePrefill) {
    messages.push({
      role: "assistant",
      content: CHOICES_AFFIRMATION,
    });
  }

  return { messages };
}

// Stage for freeform action analysis
export function buildActionAnalysisPrompt({
  storyData,
  userAction,
}: {
  storyData: StoryData;
  userAction: string;
}): { messages: ChatMessage[] } {
  const rpgSystem = getRPGSystem(storyData.rpgSystem || "3d6");

  // Build unified table list - custom tables first, then agmt tables
  const customTableNames = storyData.customTables?.map((t) => t.name) || [];
  const agmtTableNames = storyData.agmtState
    ? [
        "adventure_tone",
        "alien_species",
        "animal_actions",
        "army",
        "cavern",
        "character_actions_combat",
        "character_actions_general",
        "character_appearance",
        "character_background",
        "character_conversations",
        "character_descriptors",
        "character_identity",
        "character_motivations",
        "character_personality",
        "character_skills",
        "character_traits_flaws",
        "characters",
        "city",
        "civilization",
        "creature_abilities",
        "creature_descriptors",
        "cryptic_message",
        "curses",
        "domicile",
        "dungeon",
        "dungeon_traps",
        "forest",
        "gods",
        "legends",
        "locations",
        "magic_item",
        "mutation",
        "names",
        "noble_house",
        "objects",
        "plot_twists",
        "powers",
        "scavenging_results",
        "smells",
        "sounds",
        "spell_effects",
        "starship",
        "terrain",
        "undead",
        "visions_dreams",
      ]
    : [];
  const hasAnyTables = customTableNames.length > 0 || agmtTableNames.length > 0;

  const systemPrompt = `You are the Game Mechanics Engine. Your job is to translate player intent into strict game logic.

INPUT: Player's raw text + Current Game State.
OUTPUT: A single valid JSON object.

CONTEXTUAL ANALYSIS RULES:
1.  **Stat Selection (skill_used):** Stats are character ATTRIBUTES for skill checks (e.g., Strength, Intelligence, Charisma). Pick the stat that best matches the action type.
2.  **Resource Consumption (resource_used):** Resources are EXPENDABLE POOLS like Stamina, Mana, Health, Sanity. If the action is physically/mentally taxing (sprinting, climbing, spellcasting), assign the relevant resource to be consumed.
3.  **Implicit Item Usage:** If the player implies using an item they have (e.g., "I shoot him" -> implies Bow/Gun), assign that item.
4.  **Implicit Ability Usage:** If the player describes using a skill/spell/technique they have (e.g., "I cast fireball", "I use my lockpicking expertise"), assign that ability. Only assign abilities that are READY (not on cooldown).
5.  **Skill Continuity:** If the player *just* succeeded at a check (see history), do NOT call for a new check for the same continuous action. Set \`is_plain_action: true\`.
6.  **No God-Moding:** If the player attempts an impossible action (flying without wings), set \`is_plain_action: false\` but \`skill_used: null\` (The story engine will handle the narrative failure).

KEY DISTINCTION - STATS vs RESOURCES:
- STATS = Character attributes used for SKILL CHECKS. They do NOT get consumed. (e.g., Strength, Dexterity, Intelligence, Charisma, Perception)
- RESOURCES = Expendable pools that get SPENT when doing actions. (e.g., Stamina, Mana, Health, Energy, Sanity, Gold)

JSON STRUCTURE:
{
  "action_summary": "Objective description of intent (e.g., 'Attack guard with Longsword')",
  "skill_used": "Exact Stat Name" OR null,
  "skill_dc": Tier name ("trivial" | "easy" | "average" | "hard" | "very_hard" | "impossible") OR null,
  "stat_bonus": Number OR null (bonus/penalty to the stat value, e.g., +10 from terrain advantage, -5 from injury),
  "item_used": "Exact Item Name" OR null,
  "ability_used": "Exact Ability Name" OR null,
  "resource_used": "Exact Resource Name" OR null,
  "agmt_check": "Question (Likelihood)" OR null,
  "table": "Table Name" OR null,
  "is_plain_action": Boolean (true = dialogue/looking/flavor, false = mechanic needed),
  "challenge_handling": {
    "is_complex_event": Boolean (true = multi-step task like combat with group, chase, heist),
    "challenge_name": "Descriptive name" OR null (e.g., "Battle with the Bandits", "Escape the Collapsing Mine"),
    "contributes_to_challenge": Boolean (true = if there's an ACTIVE challenge, this action's skill check counts toward it)
  },
  "rolls": [ { "dice": "1d4", "description": "How many guards are present" } ] OR null (contextual dice rolls for the scene)
}

DC TIER GUIDELINES:
- "trivial": Routine task, almost automatic
- "easy": Simple challenge, most succeed
- "average": Standard difficulty, 50/50 chance  
- "hard": Significant challenge, skill required
- "very_hard": Extreme difficulty, only skilled succeed
- "impossible": Near-impossible, requires exceptional luck

SCENE CHALLENGES (PROGRESS CLOCKS) - CRITICAL:
⚠️ ALWAYS create a Challenge when the player engages in:
1. **ANY COMBAT** - Fighting enemies, attacking creatures, battle with opponents (unless 1 weak enemy)
2. **Chase/Escape** - Fleeing pursuers, racing against time
3. **Heists/Infiltration** - Sneaking past multiple guards, breaking into secure areas
4. **Complex Negotiations** - Convincing hostile parties, multi-stage persuasion
5. **Survival Situations** - Navigating dangerous terrain, enduring harsh conditions
6. **Multi-step Tasks** - Disarming complex traps, ritual magic, crafting under pressure

CHALLENGE THRESHOLDS:
- 1 enemy/obstacle = Single roll OK, but consider challenge if enemy is tough
- 2+ enemies OR significant threat = ALWAYS a Challenge ("Battle with Zombies", "Fight in the Alley")
- Named/Boss enemies = ALWAYS a Challenge
- Player uses combat language ("fight", "attack", "battle") = Very likely a Challenge

Set \`challenge_handling.is_complex_event: true\` and provide a descriptive \`challenge_name\`.

CONTRIBUTING TO ACTIVE CHALLENGES:
- If a Challenge is ALREADY ACTIVE (see game state below), this action is a "step" in that challenge
- Set \`is_complex_event: false\` (don't start new challenge)
- Set \`contributes_to_challenge: true\` → the skill check result will count as +1 success or +1 failure toward the challenge
- Examples: Swinging sword at zombies during "Battle with Zombies" → contributes. Running away → does NOT contribute (would use cancel_challenge).

STAT BONUS RULES:
- Use \`stat_bonus\` when situational factors modify the character's effective skill level (NOT difficulty).
- Positive bonus: High ground, favorable terrain, enemy distracted, magical enhancement.
- Negative penalty: Darkness, slippery surface, wounded arm, fear effect.
- This adjusts the STAT VALUE before calculating the modifier, not the DC.
- Example: Fighting with high ground gives +10 to the stat, not -10 to DC.

CONTEXT ROLLS:
- Use \`rolls\` when the scene needs random elements determined BEFORE the action resolves.
- Examples: "How many enemies?" (1d4), "How much treasure?" (2d6 x 10 gold), "Distance to cover" (1d20 x 5 feet).
- These rolls add narrative texture and are reported to the player with the action result.
- Standard dice: d4, d6, d8, d10, d12, d20, d100. Can include modifiers (1d6+2).

DECISION PRIORITY:
1. Is this just dialogue or looking around? -> \`is_plain_action: true\`
2. Is this COMBAT or a DANGEROUS situation? -> **FIRST check if Challenge needed** (see rules above)
3. Is the player trying to overcome an obstacle or opponent? -> Set \`skill_used\` + \`skill_dc\`.
4. Does the situation grant bonuses/penalties? -> Set \`stat_bonus\`.
5. Does the scene need random context? -> Add to \`rolls\` array.
6. Is it an AGMT (Oracle) question? (e.g., "Is the door locked?") -> Set \`agmt_check\`.
7. Is it a random discovery? (e.g., "Loot the body") -> Set \`table\`.

AVAILABLE DATA:
STATS (for skill_used - pick one for skill checks):
${
  storyData.stats.length > 0
    ? storyData.stats
        .map(
          (s) =>
            `  • ${s.name} (${s.value}): ${s.description || "No description"}`
        )
        .join("\n")
    : "  None"
}

RESOURCES (for resource_used - expendable pools):
${
  storyData.resources.length > 0
    ? storyData.resources
        .map(
          (r) =>
            `  • ${r.name} (${r.value}/${r.maxValue}): ${
              r.description || "No description"
            }`
        )
        .join("\n")
    : "  None"
}

ITEMS (for item_used):
${
  storyData.inventory.length > 0
    ? storyData.inventory
        .map((i) => {
          const typeInfo = i.type ? ` [${i.type}]` : "";
          const gradeInfo =
            i.grade && i.grade !== "common" ? ` (${i.grade})` : "";
          return `  • ${i.name}${gradeInfo}${typeInfo}: ${
            i.description || "No description"
          }`;
        })
        .join("\n")
    : "  None"
}

ABILITIES (for ability_used):
${
  storyData.abilities?.length
    ? storyData.abilities
        .map((a) => {
          const readyStatus =
            (a.currentCooldown || 0) > 0
              ? ` [on cooldown ${a.currentCooldown}/${a.cooldown}]`
              : " [ready]";
          const costInfo = a.cost?.length
            ? ` (costs: ${a.cost
                .map((c) => `${c.amount} ${c.name}`)
                .join(", ")})`
            : "";
          return `  • ${a.name}${readyStatus}${costInfo}: ${
            a.description || "No description"
          }`;
        })
        .join("\n")
    : "  None"
}

RESPOND WITH JSON ONLY.`;

  // Build minimal context within token budget for situational awareness
  const recentParts = getPartsWithinTokenBudget(
    storyData.scene.parts,
    ACTION_ANALYSIS_TOKEN_BUDGET
  );
  const recentContext = recentParts
    .map((p) =>
      p.user ? `Player: ${p.content}` : `Story: ${p.content.slice(0, 300)}...`
    )
    .join("\n\n");

  const userMessage = `Recent story context:
${recentContext}

Player's action: "${userAction}"

Analyze this action and return the JSON object.`;

  const messages: ChatMessage[] = [
    { role: "system", content: cleanString(systemPrompt) },
    { role: "user", content: cleanString(userMessage) },
  ];

  // Debug: Log action analysis context
  console.log(`[buildActionAnalysisPrompt] Context breakdown:`);
  console.log(`  - System prompt: ${estimateTokens(systemPrompt)} tokens`);
  console.log(`  - Scene parts included: ${recentParts.length}`);
  console.log(`  - Recent context: ${estimateTokens(recentContext)} tokens`);
  console.log(`  - User action: ${estimateTokens(userAction)} tokens`);
  console.log(
    `  - Total estimated tokens: ${messages.reduce(
      (sum, m) => sum + estimateTokens(m.content),
      0
    )}`
  );

  return { messages };
}

// ============================================
// GM STAGE PROMPT BUILDER
// ============================================

export const GM_STAGE_AFFIRMATION = `Understood. I am the Game Master, deciding what mechanical checks and consequences apply.

My responsibilities:
- Determine if a skill check is needed and set appropriate difficulty
- Start challenges for complex multi-step tasks (combat, chases, negotiations)
- Call for opposed checks when player faces active NPC resistance
- Use take_rest when player rests (if no active challenge)
- Call no_check_needed for trivial actions that auto-succeed

I will now call the appropriate tool(s):`;

/**
 * Build the GM stage prompt for determining game mechanics
 * This stage runs BEFORE the story stage and uses tool calls instead of JSON output
 *
 * Supports two modes:
 * 1. Legacy mode: Uses rpgSystem + stats for skill_check, opposed_check, etc.
 * 2. Schema mode: Uses characterSchema + characterData for formula_roll, opposed_formula, etc.
 */
export function buildGMStagePrompt({
  storyData,
  userChoice,
}: {
  storyData: StoryData;
  userChoice: string;
}): { messages: ChatMessage[]; tools: any[] } {
  const difficulty = storyData.difficulty || "medium";

  // Import GM tools dynamically to avoid circular deps
  const { GM_TOOL_SCHEMAS } = require("./gmTools");

  // Detect which mode we're in
  const hasCharacterSchema = !!storyData.characterSchema;
  const hasCharacterData = !!storyData.characterData;
  const useSchemaMode = hasCharacterSchema && hasCharacterData;

  // Get recent story parts for context
  const recentParts = getPartsWithinTokenBudget(
    storyData.scene.parts,
    ACTION_ANALYSIS_TOKEN_BUDGET
  );

  // Build lore/notes section for GM stage (mechanics and always-on lore)
  // GM needs to know game rules and important world details for setting DCs
  const mechanicsLore = (storyData.lore || []).filter(
    (l) => l.enabled !== false && l.type === "mechanics"
  );
  const alwaysOnLore = (storyData.lore || []).filter(
    (l) => l.enabled !== false && l.type !== "mechanics" && l.alwaysOn === true
  );

  let loreSection = "";
  if (mechanicsLore.length > 0) {
    loreSection += `## GAME RULES & MECHANICS\nThese rules define how the game works. Use them to set appropriate DCs and determine what actions are possible.\n`;
    for (const l of mechanicsLore) {
      loreSection += `\n### ${l.title}\n${cleanString(l.content)}\n`;
    }
  }
  if (alwaysOnLore.length > 0) {
    loreSection += `\n## IMPORTANT WORLD DETAILS\n`;
    for (const l of alwaysOnLore) {
      loreSection += `\n### ${l.title}\n${cleanString(l.content)}\n`;
    }
  }

  let systemPrompt: string;
  let toolsToUse: any[];

  if (useSchemaMode) {
    // ============================================
    // SCHEMA MODE: Use formula-based tools
    // ============================================
    const schema = storyData.characterSchema!;
    const charData = storyData.characterData!;

    // Build character data summary for the AI
    const fieldSummaries: string[] = [];
    for (const field of schema.fields) {
      const value = charData.values[field.id];
      if (value === undefined) continue;

      switch (field.type) {
        case "number":
        case "derived":
          fieldSummaries.push(`${field.name}: ${value}`);
          break;
        case "resource":
          if (typeof value === "object" && "current" in value) {
            fieldSummaries.push(`${field.name}: ${value.current}/${value.max}`);
          }
          break;
        case "boolean":
          if (value === true) fieldSummaries.push(`${field.name}: ✓`);
          break;
        case "list":
          if (Array.isArray(value) && value.length > 0) {
            fieldSummaries.push(`${field.name}: ${value.join(", ")}`);
          }
          break;
        case "select":
        case "text":
          if (value) fieldSummaries.push(`${field.name}: ${value}`);
          break;
      }
    }

    // Build usable variable list for formulas
    const variableList: string[] = [];
    for (const field of schema.fields) {
      if (field.type === "number" || field.type === "derived") {
        variableList.push(`{{${field.id}}}`);
      }
    }

    systemPrompt = `You are the GAME MASTER for a custom RPG using the "${
      schema.name
    }" character system at ${difficulty} difficulty.

Your role is to DETERMINE MECHANICS before the story is written. You decide:
1. Whether the player's action requires a roll
2. What formula to use and what DC to set
3. Whether to start/continue a challenge
4. Stakes and consequences
${loreSection ? `\n${loreSection}` : ""}
## CHARACTER SYSTEM: ${schema.name}
${schema.description || "Custom character sheet system"}

## CURRENT CHARACTER
${fieldSummaries.join("\n") || "No character data"}

## AVAILABLE VARIABLES FOR FORMULAS
You can use these in dice formulas: ${variableList.join(", ")}

## DECISION FRAMEWORK

**ALWAYS call a tool.** Choose ONE of:

1. **formula_roll** - Player attempts something with meaningful risk
   - Build a formula using dice and character variables
   - Example: "1d20+{{STR_mod}}+{{proficiency}}" for a strength check
   - Example: "2d6+{{Combat}}" for a combat roll
   - Set DC based on difficulty (easy: 10, medium: 15, hard: 20, very hard: 25)
   - Set stakes based on danger level

2. **formula_challenge_check** - There's an ACTIVE challenge; this action counts toward it
   - Use when continuing a fight, chase, or multi-step task
   - Specify formula and DC for this specific check

3. **start_challenge** - This action begins a complex multi-step task
   - Combat = 3-5 rounds, Boss fight = 5-7 rounds
   - After starting, ALSO call formula_challenge_check for the first action

4. **opposed_formula** - Player vs NPC in direct contest
   - Player formula uses variables: "1d20+{{Dexterity_mod}}"
   - Opponent formula is usually fixed: "1d20+5"
   - Set opponent skill appropriately (novice: +2, competent: +5, skilled: +8, master: +12)

5. **roll_dice** - Random determination (not a skill check)
   - Simple dice notation: "1d6", "2d10", "1d100"
   - For NPC reactions, loot quality, random encounters

6. **take_rest** - Player is resting
   - Cannot rest during active challenge

7. **no_check_needed** - Action is trivial or pure roleplay
   - Walking, talking, continuing a success

8. **fate_question** - Ask the Oracle a yes/no question
   - Use when uncertainty exists about world state, NPC knowledge, or events
   - Set likelihood: "impossible", "no_way", "very_unlikely", "unlikely", "fifty_fifty", "likely", "somewhat_likely", "very_likely", "near_sure_thing", "has_to_be"
   - Higher chaos = more extreme answers and random events

9. **roll_table** - Roll on a custom table
   - Use for random encounters, loot, NPC generation, etc.
   - Specify table name exactly as defined in story settings

10. **request_continuation** - Request another GM round
   - Use when you need to chain rolls (attack → damage, spot → identify)
   - Explain what you're waiting for in contextMessage
   - The frontend will run another GM round with your results

11. **ask_player** - Ask the player a question
   - Use when you need player input to proceed (targeting, resource spending choices)
   - Player must answer before generation continues
   - Can be multiple choice or free-form

## FORMULA EXAMPLES

For a ${schema.name} character, typical formulas might be:
- Attack roll: "1d20+{{attack_bonus}}" or "1d20+{{Strength_mod}}+{{proficiency}}"
- Skill check: "1d20+{{skill_name}}" or "2d6+{{stat_name}}"
- Damage: "{{weapon_damage}}+{{Strength_mod}}"
- Saving throw: "1d20+{{Constitution_mod}}"

## IMPORTANT RULES

- **Build formulas from character data.** Use {{variable}} syntax for character fields.
- **Passives provide narrative advantages.** Lower difficulty instead of adding bonuses.
- **Challenges are "Best of X".** Winner = first to majority.
- **Keep formulas simple.** Don't overcomplicate - use the most relevant stat/skill.`;

    // Filter tools for schema mode
    const schemaToolNames = [
      "formula_roll",
      "opposed_formula",
      "formula_challenge_check",
      "start_challenge",
      "roll_dice",
      "calculate",
      "no_check_needed",
      "take_rest",
      "fate_question",
      "roll_table",
      "request_continuation",
      "ask_player",
    ];
    toolsToUse = GM_TOOL_SCHEMAS.filter((t: any) =>
      schemaToolNames.includes(t.function.name)
    );
  } else {
    // ============================================
    // LEGACY MODE: Use stat-based tools
    // ============================================
    const rpgSystem = getRPGSystem(storyData.rpgSystem || "3d6");

    // Build stat list
    const statList = (storyData.stats || [])
      .map((s) => `${s.name}: ${s.value}`)
      .join(", ");

    // Build resource list
    const resourceList = (storyData.resources || [])
      .map((r) => `${r.name}: ${r.value}/${r.maxValue}`)
      .join(", ");

    // Build inventory list (only items that could be used in checks)
    const usableItems = (storyData.inventory || [])
      .filter((i) => i.type !== "misc" && i.quantity > 0)
      .map((i) => {
        const parts = [i.name];
        if (i.grade && i.grade !== "common") parts.push(`(${i.grade})`);
        if (i.durability !== undefined && i.maxDurability)
          parts.push(`[${i.durability}/${i.maxDurability}]`);
        return parts.join(" ");
      })
      .join(", ");

    // Build ability list (only ready abilities)
    const readyAbilities = (storyData.abilities || [])
      .filter((a) => !a.currentCooldown || a.currentCooldown === 0)
      .map((a) => {
        const parts = [a.name];
        if (a.grade && a.grade !== "novice") parts.push(`(${a.grade})`);
        if (a.cost && a.cost.length > 0) {
          const costs = a.cost.map((c) => `${c.amount} ${c.name}`).join(", ");
          parts.push(`[costs: ${costs}]`);
        }
        return parts.join(" ");
      })
      .join(", ");

    systemPrompt = `You are the GAME MASTER for a ${rpgSystem.name} (${
      rpgSystem.id
    }) game at ${difficulty} difficulty.

Your role is to DETERMINE MECHANICS before the story is written. You decide:
1. Whether the player's action requires a skill check
2. What stat, difficulty, items, and abilities apply
3. Whether to start/continue a challenge
4. Stakes and consequences
${loreSection ? `\n${loreSection}` : ""}
## RPG SYSTEM: ${rpgSystem.name}
${rpgSystem.aiInstructions.diceSystem}

## DIFFICULTY GUIDELINES
${rpgSystem.aiInstructions.dcGuidelines}

## CURRENT GAME STATE

**Stats:** ${statList || "None"}
**Resources:** ${resourceList || "None"}
**Usable Items:** ${usableItems || "None"}
**Ready Abilities:** ${readyAbilities || "None"}

## DECISION FRAMEWORK

**ALWAYS call a tool.** Choose ONE of:

1. **skill_check** - Player attempts something with meaningful risk
   - Match stat to action type
   - Set difficulty based on circumstances
   - Include items/abilities if player implies using them
   - Set stakes based on danger level

2. **challenge_check** - There's an ACTIVE challenge; this action counts toward it
   - Use when continuing a fight, chase, or multi-step task
   - Can override stat/difficulty for this specific check

3. **start_challenge** - This action begins a complex multi-step task
   - Combat against multiple enemies = 3-5 rounds
   - Dangerous chase = 3 rounds
   - Boss fight = 5-7 rounds
   - After starting, ALSO call challenge_check for the first action

4. **opposed_check** - Player vs NPC in direct contest
   - Haggling, arm wrestling, stealth vs perception
   - Set opponent skill (30=novice, 50=competent, 70=skilled, 90=master)

5. **roll_dice** - Random determination needed (not a skill check)
   - NPC reactions, encounter tables, loot quality

6. **take_rest** - Player is resting
   - Cannot rest during active challenge
   - Check rest limits before allowing

7. **no_check_needed** - Action is trivial or pure roleplay
   - Walking, talking, looking around
   - Continuing a successful action without new risk
   - Player already succeeded at this exact thing

8. **fate_question** - Ask the Oracle a yes/no question
   - Use when uncertainty exists about world state, NPC knowledge, or events
   - Set likelihood: "impossible", "no_way", "very_unlikely", "unlikely", "fifty_fifty", "likely", "somewhat_likely", "very_likely", "near_sure_thing", "has_to_be"
   - Higher chaos = more extreme answers and random events

9. **roll_table** - Roll on a custom table
   - Use for random encounters, loot, NPC generation, etc.
   - Specify table name exactly as defined in story settings

10. **request_continuation** - Request another GM round
   - Use when you need to chain rolls (attack → damage, spot → identify)
   - Explain what you're waiting for in contextMessage
   - The frontend will run another GM round with your results

11. **ask_player** - Ask the player a question
   - Use when you need player input to proceed (targeting, resource spending choices)
   - Player must answer before generation continues
   - Can be multiple choice or free-form

## IMPORTANT RULES

- **Passives provide narrative advantages, not mechanical bonuses.** Example: "Wolf Slayer" makes fighting wolves EASIER narratively (lower difficulty tier) but doesn't add +X to rolls.
- **Item/Ability bonuses are calculated by the frontend.** Just specify what's used.
- **Challenges are "Best of X".** Winner = first to majority. Don't end challenge early.
- **If action continues a just-succeeded check, call no_check_needed.**
- **Resource costs are determined by item/ability specs.** Just name them.`;

    // Use legacy tools only
    const legacyToolNames = [
      "skill_check",
      "challenge_check",
      "start_challenge",
      "opposed_check",
      "roll_dice",
      "calculate",
      "no_check_needed",
      "take_rest",
      "fate_question",
      "roll_table",
      "request_continuation",
      "ask_player",
    ];
    toolsToUse = GM_TOOL_SCHEMAS.filter((t: any) =>
      legacyToolNames.includes(t.function.name)
    );
  }

  const messages: ChatMessage[] = [
    { role: "system", content: cleanString(systemPrompt) },
  ];

  // Build chat history from scene parts (like Tools stage)
  // This gives the GM better context about the ongoing story
  for (const part of recentParts) {
    if (part.user) {
      messages.push({
        role: "user",
        content: cleanString(part.content),
      });
    } else {
      // For assistant (story) messages, include a summary
      // Full content would be too long, but we need narrative context
      const storyContent =
        part.content.length > 500
          ? part.content.slice(0, 500) + "..."
          : part.content;
      messages.push({
        role: "assistant",
        content: cleanString(`[Story narration]\n${storyContent}`),
      });
    }
  }

  // Add the current player action as the final user message
  messages.push({
    role: "user",
    content: cleanString(
      `## PLAYER'S ACTION\n"${userChoice}"\n\nCall the appropriate tool(s) to determine mechanics for this action.`
    ),
  });

  // Add prefill for tool calling
  messages.push({ role: "assistant", content: GM_STAGE_AFFIRMATION });

  // Debug logging
  console.log(
    `[buildGMStagePrompt] Mode: ${useSchemaMode ? "schema" : "legacy"}`
  );
  console.log(`  - System prompt: ${estimateTokens(systemPrompt)} tokens`);
  console.log(`  - Chat history: ${recentParts.length} parts`);
  console.log(`  - Available tools: ${toolsToUse.length}`);

  return {
    messages,
    tools: toolsToUse.map((t: any) => ({
      type: "function",
      function: t.function,
    })),
  };
}
