import {
  StoryData,
  Choice,
  CommandResponse,
  StoryLore,
  REST_CONFIG,
  getMemoryContent,
  MemoryEntry,
  CombatState,
  Combatant,
  CountdownTimer,
  PendingDirectorMove,
} from "@/app/misc/structs";
import { formatResponsesForAI } from "@/app/misc/commandResponses";
import { getModelConfig } from "@/app/misc/ai_prices";
import { MYTHIC_TABLE_NAMES } from "@/app/misc/mythic";
import { ARCHETYPE_INFO } from "@/app/misc/gmAdvice";
import { cleanString } from "@/app/misc/textUtils";
import { GM_TOOL_SCHEMAS } from "@/app/misc/gmTools";
import { TOOL_SCHEMAS } from "@/app/misc/toolSchemas";
import { estimateTokens } from "@/app/misc/tokenCounter";
import { ChatMessage } from "@/app/misc/chatMessage";

export type { ChatMessage };

// Storyteller mode: "narrator" (literary prose) vs "dm" (game master with inline mechanics)
export type StorytellerMode = "narrator" | "dm";

// ============================================
// ROLE AFFIRMATION MESSAGES (Prefills)
// ============================================
// These "fake" assistant messages prime the model to follow output constraints
// by making it appear the model has already committed to the rules.

/**
 * Two-Pass Visibility (see docs/research-paper-ttrpg-theory-gap-analysis.md
 * §2.3 and gmExecutor.ts's executeReadNotes): strips everything between
 * [[HIDDEN_LORE:...]]...[[/HIDDEN_LORE]] markers out of GM reasoning before
 * it ever reaches the Narrator stage. The GM Stage can read and reason
 * about hidden/to_be_revealed/check_per_turn lore while deciding what
 * happens; the Narrator - the agent that actually writes player-facing
 * prose - must never see it unless the GM has explicitly revealed it
 * (flipped the entry's visibility to "always_reveal" via edit_note, at
 * which point future read_notes calls return it unwrapped). This is the
 * "second pass" - a structural filter applied before generation, not a
 * post-hoc contradiction check like consistencyCheck.ts.
 */
export function stripHiddenLoreContent(text: string): string {
  if (!text || text.indexOf("[[HIDDEN_LORE:") === -1) return text;
  return text.replace(/\[\[HIDDEN_LORE:[^\]]*\]\][\s\S]*?\[\[\/HIDDEN_LORE\]\]/g, "");
}

/**
 * Renders a single pending director move as an instruction line, including
 * its hardness dimensions when set (see PendingDirectorMove.hardnessTarget/
 * hardnessForcesChoice in structs.ts) - the Director-layer counterpart to
 * describeHardness in gmExecutor.ts. Shared by both the info-message and
 * GM-stage renderings of pendingDirectorMoves so the two can't drift.
 */
export function formatDirectorMoveLine(m: PendingDirectorMove): string {
  const label = m.move.replace(/_/g, " ");
  const context = m.context ? ` (${m.context})` : "";
  let hardness = "";
  if (m.hardnessTarget && m.hardnessTarget !== "self") {
    hardness +=
      m.hardnessTarget === "someone_they_love"
        ? " [land this on someone the character loves, not the character directly]"
        : " [land this on someone else present, not the character directly]";
  }
  if (m.hardnessForcesChoice) {
    hardness += " [present this as a dilemma between two costs]";
  }
  return `- [${m.id}] ${label}${context}${hardness} - render this as prose without naming it, then call acknowledge_director_move(id: "${m.id}")`;
}

// How many recent reflection insights (reflection.ts's synthesized, higher-
// level memories - MemoryEntry.isReflection: true) to guarantee-surface
// unconditionally, same treatment character_sheet lore already gets. Kept
// small and bounded (prompt budget - see docs/architecture-frontier.md's
// "cross-cutting concern: prompt budget"): a reflection pass was previously
// invisible unless the model happened to search_memory for exactly the
// right query, even though it can spend a real API call synthesizing it.
const MAX_SURFACED_REFLECTIONS = 3;

/**
 * Renders the memory summary line (entry count) plus, when any exist, the
 * most recent reflection insights inline - unconditional, not gated behind
 * search_memory. Shared by buildInfoMessage (Choices stage) and
 * buildGMStagePrompt (GM stage) so the two can't drift.
 */
export function formatMemorySection(
  memory: (string | MemoryEntry)[] | undefined,
): string {
  const entries = memory || [];
  if (entries.length === 0) return "";

  let section = `## 🧠 MEMORY (${entries.length} entries - use search_memory to find specific facts)`;

  const reflections = entries.filter(
    (m): m is MemoryEntry => typeof m !== "string" && m.isReflection === true,
  );
  if (reflections.length > 0) {
    const recent = reflections.slice(-MAX_SURFACED_REFLECTIONS);
    section += `\n**Key insights:**\n${recent
      .map((r) => `- ${getMemoryContent(r)}`)
      .join("\n")}`;
  }

  return section;
}

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

const FEW_SHOT_GM_REASONING_2 = `[GAME MASTER]
**1. UNDERSTANDING THE ACTION**
The player wants to distract Farouk and snatch the amulet. This is a two-part action: social deception (distraction) followed by theft (grab). Given the tension, I'll focus on the critical first part—if the distraction fails, the grab never happens.

**2. ASSESSING DIFFICULTY & CONTEXT**
- Farouk is already suspicious—he noticed the player's interest in that spot under the silk
- The robed figures are closing in, adding time pressure
- Player has Persuasion: Average (+0), which is mediocre for fooling an alert, experienced merchant
- Difficulty: Hard—Farouk is on guard and the stakes are high

**3. CONSIDERING OUTCOMES**
- Success: The distraction works, giving a brief window to grab the amulet. But then what? The robed figures will still react.
- Failure: Farouk sees through the ploy immediately. His reaction should be physical and threatening—merchants in this bazaar don't survive by being passive.

**4. PLANNING CONSEQUENCES**
On failure, I want to escalate WITHOUT ending the scene. Farouk grabs the player (they're caught but not defeated). This creates a tense standoff with multiple escape routes (negotiation, violence, escape). The player still has agency.`;

const FEW_SHOT_GM_TOOLS_2 = `[GAME MASTER]
[Persuasion Check: 3d6 → 7 + 0 (stat) = 7 vs DC 14 (hard) → FAILURE (margin: -7)]
[Reason: Distract the merchant to create opportunity for theft]
[Stakes: medium]

[Summary: Persuasion failed by 7. Farouk saw through the distraction instantly and physically restrained the player. Two armed figures approaching. Standoff situation with multiple escape options visible.]
[Outcome: failure]
[Narrative Hooks: Farouk's cobra-fast grab, the hiss of accusation, dagger at hip, melon cart blocking exit, rooftops as escape route]`;

const FEW_SHOT_STORY_EXAMPLE_2 = {
  gmReasoning: FEW_SHOT_GM_REASONING_2,
  gmTools: FEW_SHOT_GM_TOOLS_2,
  user: `[PLAYER] Distract the merchant and grab the amulet.`,
  userWithContext: `[PLAYER] Distract the merchant and grab the amulet.

${FEW_SHOT_GM_REASONING_2}

${FEW_SHOT_GM_TOOLS_2}`,
  assistant: `"Those saffron threads," you say, gesturing to the upper shelf. "Are they from the southern provinces? The color seems—"

Farouk's hand shoots out, faster than a striking cobra. His fingers close around your wrist like a vice.

"You think me a fool?" His voice drops to a hiss. The crowd noise swallows his words, but his grip doesn't waver. "I know what you're reaching for, *thief*."

The two robed figures are moving now, cutting through the crowd with purpose. One of them has a hand beneath his cloak.

Your curved dagger presses against your hip. The exit is three stalls away, blocked by a cart of melons. The rooftops—if you could reach them—offer another path.

Farouk's grip tightens. "Now. We talk price. Or we talk to the Caliph's men."
[STOP]`,
  stateChanges: [
    "New thread: Escape Farouk's Grip (side) - the merchant has you by the wrist and is threatening to call the Caliph's men",
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
      name: "create_goal",
      arguments: JSON.stringify({
        title: "Silver Tongue",
        shortDescription: "Talk your way out of three dangerous situations.",
        description:
          "You've shown a knack for smooth talk under pressure. Pull off two more silver-tongued escapes to prove the skill is no fluke.",
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
    message: 'Created goal "Silver Tongue"',
  },
];



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
        "Analyzing the narrative for game state changes:\n1. A memory should be added about the amulet's location\n2. Nazim noticed and is ready to help - this is a significant moment worth recording\n3. This persuasive streak is worth tracking as a new goal\n\nCalling tools:",
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
// Since each turn creates ~2 parts (user + assistant), threshold of 8 means
// few-shot examples are used until the player has made 3-4 inputs
export const FEW_SHOT_THRESHOLD = 20;

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
// Real BPE-based token counting (with a chars/4 fallback before the
// tokenizer finishes loading) - see tokenCounter.ts for details.
export { estimateTokens };

// Token budgets for different stages (these are for scene history only)
// GM Stage uses customMaxContext (Memory Size slider) - it does the heavy lifting
export const TOOL_STAGE_TOKEN_BUDGET = 12000; // ~12k tokens for tool stage history
export const CHOICES_STAGE_TOKEN_BUDGET = 4000; // ~4k tokens for choices stage history
export const ACTION_ANALYSIS_TOKEN_BUDGET = 4000; // ~4k tokens for action analysis (legacy)
export const GM_STAGE_DEFAULT_BUDGET = 36000; // Default GM context if no customMaxContext set

/**
 * GM Stage context budget: customMaxContext (Memory Size slider), capped by
 * the model's real limit, split 60% story history / 40% lore-mechanics-state.
 * Shared by buildGMStagePrompt and compaction.ts's compaction-budget check so
 * the two can't drift apart on what "the GM stage's history budget" means.
 */
export function computeGMStageBudget(
  customMaxContext: number | undefined,
  modelName: string,
): { historyBudget: number; infoBudget: number; totalContextBudget: number } {
  const modelConfig = getModelConfig(modelName);
  const modelMaxTokens = modelConfig.maxTokens;
  const maxOutputTokens = modelConfig.maxOutputTokens || 4000;

  const effectiveMaxTokens = Math.min(
    customMaxContext && customMaxContext > 0
      ? customMaxContext
      : GM_STAGE_DEFAULT_BUDGET,
    modelMaxTokens,
  );

  const totalContextBudget = effectiveMaxTokens - maxOutputTokens;
  return {
    historyBudget: Math.floor(totalContextBudget * 0.6),
    infoBudget: Math.floor(totalContextBudget * 0.4),
    totalContextBudget,
  };
}

/**
 * Get scene parts that fit within a token budget, taking most recent first
 * @param parts - Array of scene parts
 * @param tokenBudget - Maximum tokens to include
 * @returns Array of parts that fit, preserving chronological order
 */
export function getPartsWithinTokenBudget(
  parts: StoryData["scene"]["parts"],
  tokenBudget: number,
): StoryData["scene"]["parts"] {
  if (!parts || parts.length === 0) return [];

  // Start from the end (most recent) and work backwards
  const selectedParts: StoryData["scene"]["parts"] = [];
  let totalTokens = 0;

  for (let i = parts.length - 1; i >= 0; i--) {
    const part = parts[i];
    const partText = part.raw || part.content;

    // Comment-only user parts have empty content; never include them in AI context.
    if (part.user && !cleanString(partText).trim()) {
      continue;
    }

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

// cleanString moved to textUtils.ts (shared with ai.ts) - re-exported here
// since callers in this file historically import it from ai_staged.ts.
export { cleanString };

/**
 * Format combat state for AI context
 */
export function formatCombatState(
  combatState: CombatState | undefined,
): string {
  if (!combatState?.active) return "";

  const lines: string[] = [];
  lines.push(`## ⚔️ ACTIVE COMBAT: ${combatState.name || "Combat"}`);
  lines.push(`**Round:** ${combatState.round}`);

  // Current turn
  const currentId = combatState.turnOrder[combatState.currentTurnIndex];
  const currentCombatant = combatState.combatants.find(
    (c) => c.id === currentId,
  );
  if (currentCombatant) {
    lines.push(
      `**Current Turn:** ${currentCombatant.name} (${currentCombatant.type})`,
    );
  }

  lines.push("");
  lines.push("### COMBATANTS");

  // Group by type
  const byType: Record<string, Combatant[]> = {
    player: [],
    ally: [],
    enemy: [],
    neutral: [],
  };

  for (const c of combatState.combatants) {
    byType[c.type].push(c);
  }

  for (const [type, combatants] of Object.entries(byType)) {
    if (combatants.length === 0) continue;

    lines.push(`\n**${type.charAt(0).toUpperCase() + type.slice(1)}s:**`);
    for (const c of combatants) {
      const status = c.isActive ? "" : " [INACTIVE]";
      const statsStr = Object.entries(c.stats)
        .map(([k, v]) => `${k}: ${v}`)
        .join(", ");
      const conditionsStr =
        c.conditions.length > 0
          ? ` | Conditions: ${c.conditions
              .map((cond) =>
                cond.duration ? `${cond.name}(${cond.duration}t)` : cond.name,
              )
              .join(", ")}`
          : "";
      const initStr =
        c.initiativeRoll !== undefined ? ` [Init: ${c.initiativeRoll}]` : "";
      lines.push(`- ${c.name}${status}: ${statsStr}${conditionsStr}${initStr}`);
      if (c.notes) {
        lines.push(`  Notes: ${c.notes}`);
      }
    }
  }

  lines.push("");
  lines.push("### INITIATIVE ORDER");
  const activeOrder = combatState.turnOrder
    .map((id, idx) => {
      const c = combatState.combatants.find((cb) => cb.id === id);
      if (!c || !c.isActive) return null;
      const marker = idx === combatState.currentTurnIndex ? "→ " : "  ";
      return `${marker}${c.name} (${c.initiativeRoll ?? "?"})`;
    })
    .filter(Boolean);
  lines.push(activeOrder.join("\n"));

  // Recent combat log
  if (combatState.log && combatState.log.length > 0) {
    lines.push("");
    lines.push("### RECENT COMBAT LOG");
    const recentLog = combatState.log.slice(-10);
    lines.push(recentLog.join("\n"));
  }

  return lines.join("\n");
}

/**
 * Format countdown timers for AI context
 */
export function formatTimersState(
  timers: CountdownTimer[] | undefined,
): string {
  if (!timers || timers.length === 0) return "";

  // Only show active or paused timers (not triggered/cancelled)
  const activeTimers = timers.filter(
    (t) => t.status === "active" || t.status === "paused",
  );
  if (activeTimers.length === 0) return "";

  const lines: string[] = [];
  lines.push(`## ⏱️ ACTIVE TIMERS`);

  for (const timer of activeTimers) {
    const statusIcon = timer.status === "paused" ? "⏸️" : "⏰";
    const advanceNote = timer.autoAdvance ? " (auto)" : " (manual)";
    const visibilityNote = timer.visibility === "hidden" ? " [HIDDEN]" : "";

    lines.push(
      `${statusIcon} **${timer.name}**: ${timer.currentTicks}/${timer.totalTicks} ticks${advanceNote}${visibilityNote}`,
    );
    if (timer.description) {
      lines.push(`   → When triggered: ${timer.description}`);
    }
  }

  return lines.join("\n");
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

// Note types that are pinned (loaded in full every turn) for every stage.
const BASE_PINNED_NOTE_TYPES = [
  "dm_instructions",
  "character_sheet",
  "gm_notes",
];

// Shared pinned-note-type check, parameterized so the GM-Stage/other-stage
// difference is explicit instead of two copy-pasted closures silently
// drifting apart. `includeMechanics` differs on purpose: the GM Stage needs
// the full mechanics rules pinned every round to run dice checks correctly;
// other stages (Choices, legacy Tools) only propose/parse actions and treat
// mechanics as a lazy-loaded folder note (fetched via read_notes) instead.
function isPinnedNoteType(
  type: string | undefined,
  includeMechanics: boolean,
): boolean {
  return (
    BASE_PINNED_NOTE_TYPES.includes(type as string) ||
    (includeMechanics && type === "mechanics")
  );
}

// Build info message for GM Stage
// Note: Stats, resources, abilities, and rpgSystem are DEPRECATED.
// All mechanics are now defined in "mechanics" type lore entries and handled by GM stage formula_roll.
// AGENTIC NOTE SYSTEM:
// - Pinned types (dm_instructions, character_sheet, mechanics): Always loaded in full
// - Folder types (lore, secret): Show titles only, use read_notes tool
// - story_instructions: NOT included here (only used by Story Stage)
export function buildInfoMessage(
  storyData: StoryData,
  embeddingContext?: EmbeddingContext, // DEPRECATED - kept for backward compat but ignored
): string {
  // ============================================
  // AGENTIC NOTE SYSTEM - Folder-based approach
  // ============================================
  // GM Stage pinned types: dm_instructions, character_sheet, mechanics
  // Folder types: lore, secret (show titles only, use read_notes tool)

  // Helper to check if a note type is "pinned" (always loaded in full).
  // mechanics is NOT pinned for this consumer - it uses read_notes like other
  // folders (see isPinnedNoteType's doc comment for why this differs from
  // buildGMStagePrompt's version below).
  const isPinnedType = (type?: string): boolean =>
    isPinnedNoteType(type, false);

  // Helper to check if a note type should be excluded from World Lore folder
  const isExcludedFromWorldLore = (type?: string): boolean => {
    return (
      isPinnedType(type) ||
      type === "mechanics" ||
      type === "secret" ||
      type === "story_instructions" // Excluded - only for Story Stage
    );
  };

  // Helper to check if a note type is "secret" (hidden from player)
  const isSecretType = (type?: string): boolean => {
    return type === "secret";
  };

  // Helper to add .md suffix to note titles (helps AI understand they're readable files)
  const formatNoteTitle = (title: string): string => {
    return title.endsWith(".md") ? title : `${title}.md`;
  };

  // 📌 DM Instructions - Always loaded in full (read every turn like copilot-instructions.md)
  const dmInstructionsLore = storyData.lore.filter(
    (l) =>
      l.enabled !== false &&
      (l.type === "dm_instructions" || l.type === "gm_notes"),
  );
  const dmInstructionsSection = dmInstructionsLore.length
    ? `## 📌 DM Instructions\nGuidelines for running this adventure. Follow these precisely.\n${dmInstructionsLore
        .map(
          (l) => `### ${formatNoteTitle(l.title)}\n${cleanString(l.content)}`,
        )
        .join("\n\n")}`
    : "";

  // 📌 Character Sheet - Always loaded in full
  const characterSheetLore = storyData.lore.filter(
    (l) => l.enabled !== false && l.type === "character_sheet",
  );
  const characterSheetSection = characterSheetLore.length
    ? `## 📌 Character Sheet\nThe player's character details. Reference these for personality, abilities, and backstory.\n${characterSheetLore
        .map(
          (l) => `### ${formatNoteTitle(l.title)}\n${cleanString(l.content)}`,
        )
        .join("\n\n")}`
    : "";

  // � Game Mechanics - Titles only (use read_notes to view rules)
  const mechanicsLore = storyData.lore.filter(
    (l) => l.enabled !== false && l.type === "mechanics",
  );
  const mechanicsSection = mechanicsLore.length
    ? `## 📁 Game Mechanics (use read_notes to view rules)\n${mechanicsLore
        .map((l) => `- ${formatNoteTitle(l.title)}`)
        .join("\n")}`
    : "";

  // ============================================
  // WORLD LORE - Split by category for clarity
  // ============================================
  // Filter out pinned types, mechanics, secrets, and story-stage-only types
  const worldLoreNotes = storyData.lore.filter((l) => {
    if (l.enabled === false) return false;
    if (isExcludedFromWorldLore(l.type)) return false;
    return true;
  });

  // Group world lore by type/category
  const loreByCategory: Record<string, typeof worldLoreNotes> = {
    npc: [],
    location: [],
    item: [],
    faction: [],
    event: [],
    lore: [], // Default/untyped
  };

  for (const note of worldLoreNotes) {
    const category = note.type || "lore";
    if (loreByCategory[category]) {
      loreByCategory[category].push(note);
    } else {
      loreByCategory.lore.push(note); // Unknown types go to default
    }
  }

  // Build categorized world lore sections
  const worldLoreSections: string[] = [];

  // 📁 NPCs from lore notes
  if (loreByCategory.npc.length > 0) {
    worldLoreSections.push(
      `### 📁 NPCs (use read_notes to view)\n${loreByCategory.npc
        .map((l) => `- ${formatNoteTitle(l.title)}`)
        .join("\n")}`,
    );
  }

  // 📁 Locations
  if (loreByCategory.location.length > 0) {
    worldLoreSections.push(
      `### 📁 Locations (use read_notes to view)\n${loreByCategory.location
        .map((l) => `- ${formatNoteTitle(l.title)}`)
        .join("\n")}`,
    );
  }

  // 📁 Items
  if (loreByCategory.item.length > 0) {
    worldLoreSections.push(
      `### 📁 Items (use read_notes to view)\n${loreByCategory.item
        .map((l) => `- ${formatNoteTitle(l.title)}`)
        .join("\n")}`,
    );
  }

  // 📁 Factions
  if (loreByCategory.faction.length > 0) {
    worldLoreSections.push(
      `### 📁 Factions (use read_notes to view)\n${loreByCategory.faction
        .map((l) => `- ${formatNoteTitle(l.title)}`)
        .join("\n")}`,
    );
  }

  // 📁 Events
  if (loreByCategory.event.length > 0) {
    worldLoreSections.push(
      `### 📁 Events (use read_notes to view)\n${loreByCategory.event
        .map((l) => `- ${formatNoteTitle(l.title)}`)
        .join("\n")}`,
    );
  }

  // 📁 Other Lore (default type)
  if (loreByCategory.lore.length > 0) {
    worldLoreSections.push(
      `### 📁 World Notes (use read_notes to view)\n${loreByCategory.lore
        .map((l) => `- ${formatNoteTitle(l.title)}`)
        .join("\n")}`,
    );
  }

  const worldLoreSection = worldLoreSections.length
    ? `## 📁 WORLD LORE\n${worldLoreSections.join("\n\n")}`
    : "";

  // ============================================
  // KNOWN NPCs - From storyData.npcs (tracked characters)
  // ============================================
  const knownNPCs =
    storyData.npcs?.filter((npc) => npc.status !== "unknown") || [];
  const npcsSection = knownNPCs.length
    ? `## 👥 Known NPCs\n${knownNPCs
        .map((npc) => {
          const status = npc.status !== "alive" ? ` [${npc.status}]` : "";
          const attitude =
            npc.attitude !== "neutral" ? ` (${npc.attitude})` : "";
          const role = npc.role ? ` - ${npc.role}` : "";
          const lastSeen = npc.lastSeen ? ` | Last seen: ${npc.lastSeen}` : "";
          return `- **${npc.name}**${status}${attitude}${role}${lastSeen}`;
        })
        .join("\n")}`
    : "";

  // 🔒 Secrets - Titles only (hidden from player, use read_notes to view)
  const secretNotes = storyData.lore.filter(
    (l) => l.enabled !== false && isSecretType(l.type),
  );
  const secretsSection = secretNotes.length
    ? `## 🔒 Secrets (use read_notes to view)\n${secretNotes
        .map((l) => `- ${formatNoteTitle(l.title)}`)
        .join("\n")}`
    : "";

  // 🧠 Memory - count plus any guarantee-surfaced reflection insights (see
  // formatMemorySection - unconditional, not gated behind search_memory).
  const memorySection = formatMemorySection(storyData.memory);

  // Build goals section if any exist
  const activeGoals =
    storyData.goals?.filter((g) => g.active && !g.fulfilled) || [];
  const inactiveGoals =
    storyData.goals?.filter((g) => !g.active && !g.fulfilled) || [];
  const goalsSection =
    activeGoals.length || inactiveGoals.length
      ? `## Goals\n${
          activeGoals.length
            ? `### Active\n${activeGoals
                .map((g) => `- ${g.title}: ${g.description}`)
                .join("\n")}`
            : ""
        }${
          inactiveGoals.length
            ? `${activeGoals.length ? "\n" : ""}### Inactive\n${inactiveGoals
                .map((g) => `- ${g.title}`)
                .join("\n")}`
            : ""
        }`
      : "";

  // Player archetype(s) - Robin Laws' player-type taxonomy, explicitly
  // self-selected (GuidedStoryStart wizard / CouchPlayersEditor /
  // BasicSettings), distinct from the inferred PlayerStyleType signal.
  // Prompt-only: shapes how the GM engages each player, never feeds
  // selectDirectorMove. Read fresh every turn so an in-menu edit takes
  // effect immediately.
  const archetypeLines: string[] = [];
  const couchPlayersWithArchetype = (
    storyData.multiplayer?.couchPlayers || []
  ).filter((p) => p.archetype);
  if (couchPlayersWithArchetype.length > 0) {
    for (const p of couchPlayersWithArchetype) {
      const info = ARCHETYPE_INFO[p.archetype!];
      archetypeLines.push(`- ${p.name} (${info.label}): ${info.facilitation}`);
    }
  } else if (storyData.playerArchetype) {
    const info = ARCHETYPE_INFO[storyData.playerArchetype];
    archetypeLines.push(
      `- ${cleanString(storyData.player_name || "The player")} (${
        info.label
      }): ${info.facilitation}`,
    );
  }
  const archetypeSection = archetypeLines.length
    ? `## Player Archetypes (self-selected playstyle - lean into this)\n${archetypeLines.join(
        "\n",
      )}`
    : "";

  // Build Advanced RPG Tools section if enabled
  const agmtSection = storyData.agmtState
    ? `## Advanced RPG Tools
- Chaos Factor: ${storyData.agmtState.chaosFactor}/9 (${getChaosDescription(
        storyData.agmtState.chaosFactor,
      )})
- Scene Count: ${storyData.agmtState.sceneCount}`
    : "";

  // Pending random events (from fate_question/scene checks) - shown every
  // turn, not just the one that triggered them, until resolve_random_event
  // is called. This is what keeps an oracle-triggered event from being a
  // one-shot hint that's easy to silently drop.
  const pendingEvents = storyData.pendingRandomEvents || [];
  const pendingEventsSection = pendingEvents.length
    ? `## ⚡ Unresolved Random Events (must be addressed)
${pendingEvents
  .map(
    (e) =>
      `- [${e.id}] [${e.focus || "Event"}] "${e.action} ${
        e.subject
      }" - work this into the story, then call resolve_random_event(id: "${e.id}")`,
  )
  .join("\n")}`
    : "";

  // Pending director moves (the deterministic pacing layer's chosen GM
  // move) - same persist-until-acknowledged shape as pendingEventsSection
  // above. Render the move as prose ("make your move, but never speak its
  // name") - never narrate "the director wants me to..." or name the move.
  const pendingMoves = storyData.pendingDirectorMoves || [];
  const pendingDirectorMovesSection = pendingMoves.length
    ? `## 🎬 Pending Director Moves (must be addressed)
${pendingMoves.map(formatDirectorMoveLine).join("\n")}`
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
      (t) => t.status === "resolved" || t.status === "abandoned",
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
              t.description,
            )}`,
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

  // Combine all sections
  // Note: statsSection, resourcesSection, abilitiesSection are DEPRECATED
  // All character data is now in character_sheet lore entries
  const sections = [
    `# ${cleanString(storyData.story_name || "Untitled Story")}`,
    storyData.premise ? `**Premise:** ${cleanString(storyData.premise)}` : "",
    `**Player:** ${cleanString(storyData.player_name || "Hero")}${
      storyData.player_summary
        ? ` - ${cleanString(storyData.player_summary)}`
        : ""
    }`,
    archetypeSection, // Self-selected player archetype(s) - advisory only
    // Pinned notes - always loaded in full
    dmInstructionsSection, // DM Instructions - highest priority, read every turn
    characterSheetSection, // Character sheet - player details
    mechanicsSection, // Game mechanics - titles only, read with read_notes
    // Folder notes - titles only, use read_notes tool
    worldLoreSection, // World Lore folder (split by category)
    npcsSection, // Known NPCs with key details
    secretsSection, // Secrets folder
    // Memory - summary only, use search_memory tool
    memorySection,
    // Other game state
    goalsSection,
    variablesSection,
    threadsSection,
    agmtSection,
    pendingEventsSection,
    pendingDirectorMovesSection,
    storyData.author_notes
      ? `## Author Notes\n${cleanString(storyData.author_notes)}`
      : "",
    storyData.player_notes
      ? `## Player Notes\n${cleanString(storyData.player_notes)}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  return cleanString(sections);
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
  // Note: rpgSystem is DEPRECATED - all mechanics are in "mechanics" type lore entries

  const systemPrompt = `You are the Game State Manager.
Your role is to read the latest narrative output and ensure the Game Database matches the story exactly.

User will not see your output. Use your message content to "Think Step-by-Step" before calling tools.

## CRITICAL: Existing Game Data
The info message contains the CURRENT game state - these are entries that ALREADY EXIST:
- **"## Notes/Lore"** = Note entries that exist. Use \`edit_note\` to add info, NOT \`create_note\`
- **"### Threads"** = Plotlines/storylines that exist. Use \`update_thread\` to progress, NOT \`create_thread\`
- **"## Memory"** = Facts already saved. Don't duplicate them.
- **"## NPCs"** = Characters already tracked. Don't recreate them.
- **"## Goals"** = Goals already active. Update status as needed.

Only use CREATE tools for GENUINELY NEW content not shown in the info message.

═══════════════════════════════════════════════════════════════
THE THREE TRACKING SYSTEMS: NOTES vs MEMORIES vs NPCs
═══════════════════════════════════════════════════════════════

**📝 NOTES (\`create_note\` / \`edit_note\`)** — World Reference Database
Use for DETAILED information you'll need to reference later:
- **Location details**: Layout, features, dangers, history
- **Faction information**: Goals, members, relationships, territory
- **Creature/Monster stats**: Combat abilities, weaknesses, behavior patterns
- **World lore**: History, magic systems, political structures
- **Significant objects**: Artifacts, puzzles, mechanisms

Notes should be 2-4 paragraphs with rich detail. Think "GM reference sheet."

**🧠 MEMORIES (\`add_memory\`)** — Quick Facts & Plot Points
Use for SHORT, ACTIONABLE facts the player might need:
- Promises/debts: "Owes blacksmith 50 gold"
- Codes/passwords: "Vault password: MOONRISE"
- Deadlines: "Must reach temple by dawn"
- Quick facts: "Mayor's daughter is kidnapped"
- Plot clues: "The killer has a limp"

Memories are 1-2 sentences MAX. If it needs more detail, make it a Note instead.

**👤 NPCs (\`add_npc\`)** — Character Tracking
Use for ANY named character the player interacts with:
- First meeting with a named NPC → \`add_npc\` immediately
- Include: name, role, attitude (friendly/neutral/hostile), brief description
- NPCs are people, monsters, or creatures with personality/agency

═══════════════════════════════════════════════════════════════
WHEN TO CREATE WHAT (Decision Tree)
═══════════════════════════════════════════════════════════════

**New named character appears?**
→ \`add_npc\` with name, role, attitude, description

**Character has COMBAT STATS or special abilities?**
→ ALSO \`create_note\` titled "[Name] - Combat Stats" with:
  - Health/wounds capacity
  - Attack methods and damage
  - Defenses, armor, resistances
  - Special abilities or magic
  - Weaknesses or vulnerabilities
  - Behavior patterns (aggressive, cowardly, tactical)

**New location discovered?**
→ \`create_note\` with layout, atmosphere, dangers, notable features

**Important world lore revealed?**
→ \`create_note\` with detailed explanation

**Quick fact player needs to remember?**
→ \`add_memory\` (1-2 sentences only)

**No changes needed?**
→ \`skip_tools\` (MOST turns need zero changes!)

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

**Quality standard:** Write as if this entry appears in a published sourcebook. Rich enough to roleplay, concise enough to reference mid-scene.

═══════════════════════════════════════════════════════════════
ANALYSIS STEPS (Apply ONLY to the latest STORY TEXT)
═══════════════════════════════════════════════════════════════

1. **New NPCs?** Named character appeared for the first time? → \`add_npc\`
   - If they have combat potential, ALSO create a stats note!

2. **Combat Stats Revealed?** Did we learn how tough/dangerous something is? → \`create_note\` with stats

3. **Resource Delta:** Did the player lose or gain resources? → reflect it in the character sheet note (\`edit_note\`)

4. **Quick Facts:** Codes, deadlines, debts, clues? → \`add_memory\` (keep it SHORT)

5. **World Building:** New location, faction, or detailed lore? → \`create_note\`
6. **Thread Progress:** Plotline started, progressed, or resolved? → thread tools
7. **Goal Progress:** Goal started, progressed, completed, or failed? → goal tools

8. **Nothing Significant?** → \`skip_tools\` (this is the most common case!)

## ⛔ ANTI-PATTERNS (NEVER DO THESE)

**Memory Anti-Patterns:**
- BAD: "A crow perches on the angel statue, watching with beady eyes" ← Story text, not useful
- BAD: "The graveyard is eerie and misty" ← Atmospheric description
- BAD: "The battle was intense" ← Summary, not actionable
- GOOD: "Crows seem to follow me since the helicopter crash" ← Plot clue

**Note Anti-Patterns:**
- BAD: Creating a note for every minor detail
- BAD: One-sentence notes (use memory for quick facts)
- BAD: Recreating notes that already exist (use \`edit_note\`!)
- GOOD: Detailed reference sheets for important subjects

**NPC Anti-Patterns:**
- BAD: Adding unnamed "the guard" or "a merchant"
- BAD: Adding crowd members with no significance
- GOOD: Any named character with personality or role

## TOOL USAGE GUIDELINES
- **Exact Matching:** Use exact string matching for field/note names.
- **Fail Forward:** If the narrative described a failure, ensure the *cost* is applied.
- **Parallel Calls:** Call ALL needed tools in ONE response, not one at a time.

## NOTE MANAGEMENT (formerly "Lore")

⚠️ **CRITICAL: Check existing notes before creating new ones!**
- If a note exists with similar title → \`edit_note\` to add information
- Only \`create_note\` for COMPLETELY NEW topics

**When to CREATE a Note:**
- New significant location discovered
- New faction/organization introduced
- Creature/monster stats need tracking
- Important world lore revealed
- Complex mechanism or puzzle encountered

**When to UPDATE a Note:**
- New information about an EXISTING topic
- Circumstances change (location destroyed, faction shifts allegiance)
- More details learned about a creature's abilities

**Note Quality Guidelines:**
- 2-4 paragraphs minimum for important subjects
- Include: description, significance, connections, secrets
- Combat stats notes: health, attacks, defenses, weaknesses, behavior

═══════════════════════════════════════════════════════════════
NOTE TYPES REFERENCE (use the 'type' parameter!)
═══════════════════════════════════════════════════════════════

**ALWAYS specify a type when creating notes!** The type determines how the note is displayed and used.

| Type | Icon | Purpose | Example |
|------|------|---------|---------|
| \`lore\` | 📁 | General world-building, history, culture | "The Great War", "Elven Customs" |
| \`npc\` | 👤 | Character details, backstory, stats | "Captain Aldric", "The Merchant Zara" |
| \`location\` | 📍 | Places, regions, buildings | "The Frozen Wastes", "Tavern of the Lost" |
| \`item\` | 🎒 | Items, artifacts, equipment details | "Sword of Flames", "Ancient Amulet" |
| \`faction\` | ⚔️ | Organizations, groups, guilds | "The Shadow Guild", "Royal Guard" |
| \`event\` | 📜 | Historical events, plot points | "The Fall of the Empire" |
| \`secret\` | 🔒 | GM-only info hidden from player | "The villain's true identity" |
| \`dm_instructions\` | 📌 | GM guidance notes (always referenced) | "Combat Rules", "Session Guidelines" |
| \`character_sheet\` | 📌 | Player character sheet (always referenced) | "Hero Stats", "Character Background" |
| \`mechanics\` | 📌 | Game rules and dice formulas | "Magic System", "Combat Rules" |

**Example usage:**
\`create_note({ title: "The Shadow Guild", content: "...", type: "faction" })\`
\`create_note({ title: "Captain Aldric", content: "...", type: "npc" })\`
\`create_note({ title: "The Frozen Wastes", content: "...", type: "location" })\`

**📌 Pinned types** (dm_instructions, character_sheet, mechanics) are ALWAYS loaded in full every turn.
Use these sparingly - only for content that must be referenced constantly.

## THREAD MANAGEMENT

⚠️ **Threads are quest trackers, NOT story summaries!**
- Keep descriptions to 1-2 sentences max
- State ONLY the current objective and status
- When updating, REPLACE with new summary - don't append

**Thread Priorities:**
- **main:** Central story quests
- **side:** Optional objectives
- **background:** Ambient events, rumors, distant threats

## CHARACTER LIST FIELDS

For freeform lists on the character sheet (Equipment, Languages, etc. that
aren't tracked by the dedicated Inventory/Abilities tools), edit the
character sheet note directly with \`edit_note\` to add or remove the entry.

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
      `[buildToolPrompt] Using few-shot examples (${storyData.scene.parts.length} parts < ${FEW_SHOT_THRESHOLD} threshold)`,
    );
  }

  // Add the actual info message
  messages.push({ role: "user", content: cleanString(infoMessage) });

  // Add scene parts within token budget for context (INCLUDING PAST TOOL CALLS)
  const recentParts = getPartsWithinTokenBudget(
    storyData.scene.parts,
    TOOL_STAGE_TOKEN_BUDGET,
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
          reasoning: part.reasoning,
          reasoning_details: part.reasoning_details,
          tool_calls: part.toolCalls.map(
            (tc: {
              id: string;
              type?: string;
              function: { name: string; arguments: string };
              extra_content?: any;
            }) => ({
              id: tc.id,
              type: "function" as const,
              function: tc.function,
              // Preserve extra_content for Google (contains thought_signature for thinking models)
              ...(tc.extra_content ? { extra_content: tc.extra_content } : {}),
            }),
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
          } calls, ${part.toolResponses?.length || 0} responses`,
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
      `Story content that was just generated:\n\n${storyContent}\n\nBased on this narrative, what game state changes (commands and memory) should happen? Think out loud in your message content, then call all necessary tools.`,
    ),
  });

  // Debug: Log tool context details
  const totalTokens = messages.reduce(
    (sum, m) => sum + estimateTokens(m.content),
    0,
  );
  console.log(`[buildToolPrompt] Context breakdown:`);
  console.log(`  - System prompt: ${estimateTokens(systemPrompt)} tokens`);
  console.log(`  - Info message: ${estimateTokens(infoMessage)} tokens`);
  console.log(`  - Scene parts included: ${recentParts.length}`);
  console.log(
    `  - Scene parts tokens: ${recentParts.reduce(
      (sum, p) => sum + estimateTokens(p.raw || p.content),
      0,
    )} tokens`,
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
          extra_content?: any;
        }) => ({
          id: tc.id,
          type: "function" as const,
          function: tc.function,
          // Preserve extra_content for Google (contains thought_signature for thinking models)
          ...(tc.extra_content ? { extra_content: tc.extra_content } : {}),
        }),
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
            } ${response.message}`,
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
        `You already called these tools:\n${toolCallSummary}\n\nAnything else needed? Review the story and game state carefully. Return NO tool calls if everything is handled, or call additional tools if you missed something.`,
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
  customBudget,
}: {
  storyData: StoryData;
  storyContent: string; // The story text just generated
  embeddingContext?: EmbeddingContext;
  usePrefill?: boolean;
  customBudget?: number; // Overrides CHOICES_STAGE_TOKEN_BUDGET (used to retry smaller on context overflow)
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
    customBudget || CHOICES_STAGE_TOKEN_BUDGET,
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
      `Story content that was just generated:\n\n${storyContent}\n\nBased on this narrative and the current game state, what meaningful choices should the player have?`,
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
  // Note: rpgSystem is DEPRECATED - all mechanics are in "mechanics" type lore entries

  // Build unified table list - custom tables first, then agmt tables
  // (single source of truth: MYTHIC_TABLE_NAMES, derived from mythic.ts's
  // ELEMENT_TABLES so it can't drift from the tables that actually exist)
  const customTableNames = storyData.customTables?.map((t) => t.name) || [];
  const agmtTableNames = storyData.agmtState ? [...MYTHIC_TABLE_NAMES] : [];
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
            `  • ${s.name} (${s.value}): ${s.description || "No description"}`,
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
            }`,
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
    ACTION_ANALYSIS_TOKEN_BUDGET,
  );
  const recentContext = recentParts
    .map((p) =>
      p.user ? `Player: ${p.content}` : `Story: ${p.content.slice(0, 300)}...`,
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
      0,
    )}`,
  );

  return { messages };
}

// ============================================
// GAME MASTER STAGE PROMPT BUILDER
// ============================================

export const GM_STAGE_AFFIRMATION = `[GAME MASTER]
Alright, let me think through this...`;

// ============================================
// GM STAGE FEW-SHOT EXAMPLES (NOT CURRENTLY USED)
// ============================================
// These example constants are preserved but the actual examples
// are embedded directly in the system prompt for natural DM behavior.

/**
 * Build the GM stage prompt for determining game mechanics
 * This stage runs BEFORE the story stage and uses tool calls instead of JSON output
 *
 * Uses formula_roll, opposed_formula, etc. for dice mechanics with character sheet data.
 *
 * The GM Stage is the "brain" - it gets the Memory Size slider context (customMaxContext)
 * because it needs to read mechanics notes, character sheets, lore, and understand the story.
 */
/** User-facing "Reply Length" setting controlling narration verbosity. */
export type ReplyLength = "short" | "medium" | "long";

/**
 * Central source of truth for how long narration should run. Shared by the GM
 * stage prompt (word ceilings) and the story-continuation prompt (paragraph
 * guidance) so the two stages never contradict each other. Default is
 * "medium": 1 paragraph typical, 2 when the moment needs it, 3 for big beats.
 */
export function getLengthGuidance(replyLength: ReplyLength = "medium"): {
  routine: string;
  notable: string;
  climax: string;
  paragraphs: string;
} {
  switch (replyLength) {
    case "short":
      return {
        routine: "1-2 sentences (roughly 15-45 words)",
        notable: "a short paragraph (up to ~90 words)",
        climax: "1-2 tight paragraphs (up to ~130 words)",
        paragraphs:
          "Keep it to a single short paragraph - a sentence or two is often enough. Use a second paragraph only for a genuinely big moment.",
      };
    case "long":
      return {
        routine: "1-2 paragraphs (40-100 words)",
        notable: "2-3 paragraphs (100-200 words)",
        climax: "3-4 paragraphs (200-320 words)",
        paragraphs: "2-4 paragraphs.",
      };
    case "medium":
    default:
      return {
        routine: "1 paragraph (roughly 40-90 words)",
        notable: "up to 2 paragraphs (90-160 words)",
        climax: "up to 3 paragraphs (160-260 words)",
        paragraphs:
          "Write 1 paragraph by default. Use a second only if the moment really needs it, and a third only for a big beat like a combat climax or major reveal.",
      };
  }
}

export function buildGMStagePrompt({
  storyData,
  userChoice,
  customMaxContext,
  modelName = "DeepSeek V4 Flash",
  replyLength = "medium",
  pacingNote,
  observerNote,
}: {
  storyData: StoryData;
  userChoice: string;
  customMaxContext?: number; // Memory Size slider - this is the main context control now
  modelName?: string; // Used to get model's actual context limit
  replyLength?: ReplyLength; // Reply Length setting - controls narration verbosity
  pacingNote?: string; // Deterministic pacing nudge (see pacingFeedback.ts)
  // Layer 5 hardening (see observer.ts): set only when generateStoryTurn is
  // retrying after the observer flagged the previous attempt at this same
  // turn as a major violation - explains exactly what was flagged so the GM
  // doesn't just repeat the mistake.
  observerNote?: string;
}): { messages: ChatMessage[]; tools: any[] } {
  const lengthGuidance = getLengthGuidance(replyLength);
  const pacingFeedbackLine = pacingNote ? `\n${pacingNote}` : "";
  const observerNoteBlock = observerNote
    ? `\n\n## PREVIOUS ATTEMPT RESET\n${observerNote}`
    : "";
  const difficulty = storyData.difficulty || "medium";

  // Calculate GM context budget from customMaxContext (Memory Size slider)
  // This is where the real context allocation happens now
  const { historyBudget, infoBudget, totalContextBudget } =
    computeGMStageBudget(customMaxContext, modelName);

  // Get recent story parts for context - now uses the calculated history budget
  const recentParts = getPartsWithinTokenBudget(
    storyData.scene.parts,
    historyBudget,
  );

  // ============================================
  // AGENTIC NOTE SYSTEM for GM Stage
  // ============================================
  // Helper to check if a note type is "pinned" (always loaded in full).
  // mechanics IS pinned here (unlike buildInfoMessage's version above) - the
  // GM Stage needs the full rules text every round to run dice checks.
  const isPinnedType = (type?: string): boolean => isPinnedNoteType(type, true);

  // Helper to check if a note type is "secret" (hidden from player)
  const isSecretType = (type?: string): boolean => {
    return type === "secret";
  };

  // 📌 DM Instructions - Always loaded in full
  const dmInstructionsLore = (storyData.lore || []).filter(
    (l) =>
      l.enabled !== false &&
      (l.type === "dm_instructions" || l.type === "gm_notes"),
  );

  // 📌 Character Sheet - Always loaded in full
  const characterSheetLore = (storyData.lore || []).filter(
    (l) => l.enabled !== false && l.type === "character_sheet",
  );

  // 📌 Game Mechanics - Always loaded in full
  const mechanicsLore = (storyData.lore || []).filter(
    (l) => l.enabled !== false && l.type === "mechanics",
  );

  // Categorize notes by type for better organization
  const categorizeNotes = (notes: typeof storyData.lore) => {
    const categories: Record<string, typeof notes> = {
      lore: [],
      npc: [],
      location: [],
      item: [],
      faction: [],
      event: [],
      secret: [],
    };
    for (const l of notes || []) {
      if (l.enabled === false) continue;
      if (isPinnedType(l.type)) continue; // Skip pinned types
      const type = l.type || "lore";
      if (type === "secret") {
        categories.secret.push(l);
      } else if (type === "npc") {
        categories.npc.push(l);
      } else if (type === "location") {
        categories.location.push(l);
      } else if (type === "item") {
        categories.item.push(l);
      } else if (type === "faction") {
        categories.faction.push(l);
      } else if (type === "event") {
        categories.event.push(l);
      } else {
        categories.lore.push(l);
      }
    }
    return categories;
  };

  const noteCategories = categorizeNotes(storyData.lore);

  // Build the lore/notes section
  let loreSection = "";

  // Pinned notes: Full content (DM Instructions and Character Sheet only)
  if (dmInstructionsLore.length > 0) {
    loreSection += `## 📌 DM INSTRUCTIONS\nRead these guidelines every turn. They define how to run this adventure.\n`;
    for (const l of dmInstructionsLore) {
      loreSection += `\n### ${l.title}.md\n${cleanString(l.content)}\n`;
    }
  }
  if (characterSheetLore.length > 0) {
    loreSection += `\n## 📌 CHARACTER SHEET\nThe player's character details. Reference these for abilities, background, and personality.\nTo update: edit_note("title", content="new content") - Keep stats, HP, XP, etc. current!\n`;
    for (const l of characterSheetLore) {
      loreSection += `\n### ${l.title}.md\n${cleanString(l.content)}\n`;
    }
  }

  // Mechanics notes: Titles only (use read_notes to view)
  if (mechanicsLore.length > 0) {
    loreSection += `\n## 📁 GAME MECHANICS (use read_notes to view rules, always read the rules before doing anything with mechanics.)\n`;
    loreSection += mechanicsLore.map((l) => `- ${l.title}.md`).join("\n");
    loreSection += "\n";
  }

  // Folder notes by category: Titles only
  if (noteCategories.npc.length > 0) {
    loreSection += `\n## 👤 NPC NOTES (use read_notes to view, read them for details on NPCs beyond NPC summary.)\n`;
    loreSection += noteCategories.npc.map((l) => `- ${l.title}.md`).join("\n");
    loreSection += "\n";
  }
  if (noteCategories.location.length > 0) {
    loreSection += `\n## 📍 LOCATION NOTES (use read_notes to view)\n`;
    loreSection += noteCategories.location
      .map((l) => `- ${l.title}.md`)
      .join("\n");
    loreSection += "\n";
  }
  if (noteCategories.item.length > 0) {
    loreSection += `\n## 🎒 ITEM NOTES (use read_notes to view)\n`;
    loreSection += noteCategories.item.map((l) => `- ${l.title}.md`).join("\n");
    loreSection += "\n";
  }
  if (noteCategories.faction.length > 0) {
    loreSection += `\n## ⚔️ FACTION NOTES (use read_notes to view)\n`;
    loreSection += noteCategories.faction
      .map((l) => `- ${l.title}.md`)
      .join("\n");
    loreSection += "\n";
  }
  if (noteCategories.event.length > 0) {
    loreSection += `\n## 📜 EVENT NOTES (use read_notes to view)\n`;
    loreSection += noteCategories.event
      .map((l) => `- ${l.title}.md`)
      .join("\n");
    loreSection += "\n";
  }
  if (noteCategories.lore.length > 0) {
    loreSection += `\n## 📁 WORLD LORE (use read_notes to view)\n`;
    loreSection += noteCategories.lore.map((l) => `- ${l.title}.md`).join("\n");
    loreSection += "\n";
  }
  if (noteCategories.secret.length > 0) {
    loreSection += `\n## 🔒 SECRETS (use read_notes to view)\n`;
    loreSection += noteCategories.secret
      .map((l) => `- ${l.title}.md`)
      .join("\n");
    loreSection += "\n";
  }

  // Memory count plus any guarantee-surfaced reflection insights (see
  // formatMemorySection - unconditional, not gated behind search_memory).
  const memorySection = formatMemorySection(storyData.memory);
  if (memorySection) {
    loreSection += `\n${memorySection}\n`;
  }

  // Format combat state for context
  const combatSection = formatCombatState(storyData.combatState);

  // Format timers state for context
  const timersSection = formatTimersState(storyData.timers);

  // Pending random events and director moves - must be surfaced here (the
  // live GM stage, which is what actually calls resolve_random_event/
  // acknowledge_director_move), not just in buildInfoMessage's story-stage
  // context. Same persist-until-acknowledged shape/lifecycle in both places.
  const gmStagePendingEvents = storyData.pendingRandomEvents || [];
  const gmStagePendingEventsSection = gmStagePendingEvents.length
    ? `## ⚡ Unresolved Random Events (must be addressed)
${gmStagePendingEvents
  .map(
    (e) =>
      `- [${e.id}] [${e.focus || "Event"}] "${e.action} ${
        e.subject
      }" - work this into the story, then call resolve_random_event(id: "${e.id}")`,
  )
  .join("\n")}`
    : "";

  const gmStagePendingMoves = storyData.pendingDirectorMoves || [];
  const gmStagePendingDirectorMovesSection = gmStagePendingMoves.length
    ? `## 🎬 Pending Director Moves (must be addressed)
${gmStagePendingMoves.map(formatDirectorMoveLine).join("\n")}`
    : "";

  // Build NPC list (tracked characters with relationship info)
  const npcList = (storyData.npcs || [])
    .filter((n) => n.status !== "departed") // Don't show departed NPCs
    .map((n) => {
      const parts = [n.name];
      if (n.role) parts.push(`(${n.role})`);
      if (n.attitude && n.attitude !== "neutral") parts.push(`[${n.attitude}]`);
      if (n.relationship && n.relationship !== "Stranger")
        parts.push(`- ${n.relationship}`);
      if (n.status && n.status !== "alive") parts.push(`{${n.status}}`);
      return parts.join(" ");
    })
    .join("\n- ");

  // 🆕 Fresh story setup: no character_sheet note exists yet, meaning this
  // story hasn't been set up (e.g. a "Freeform Story" started with no
  // premise/adventure). Nudge the GM to interview the player briefly before
  // establishing the world, instead of narrating a full opening blind.
  const freshStorySetupBlock =
    characterSheetLore.length === 0
      ? `\n## 🆕 FRESH STORY - SETUP NEEDED
This is a brand-new story with no established setting or character yet - the player skipped adventure creation to talk to you directly.
- If the player's message doesn't give you enough to go on (genre, tone, character concept), ask up to 1-3 concise, friendly questions before creating anything. Do NOT narrate a full opening scene yet - just respond conversationally (use OOC round-brackets or plain text).
- Once you have enough to work with (even a vague idea like "surprise me" or a one-line pitch), use \`create_note\` to establish a \`character_sheet\` note (name, starting stats/resources/abilities fitting the genre and tone) and a \`mechanics\` note (dice system + core resolution rules), then narrate the opening scene.
- Keep the interview short - one or two exchanges at most before diving in.
`
      : "";

  // 🎲 Manual dice mode: the players roll physical dice at the table. The
  // GM collects player-facing rolls through ask_for_roll (which pauses the
  // loop for input) instead of rolling digitally; NPC/hidden rolls stay
  // digital. Only injected (and ask_for_roll only offered) when the story
  // was created with diceMode === "manual".
  const manualDiceMode = storyData.diceMode === "manual";
  const manualDiceSection = manualDiceMode
    ? `

### 🎲 MANUAL DICE MODE (ACTIVE)
The players roll REAL dice at the table. For ANY roll a player character makes:
- Use \`ask_for_roll\` (NOT formula_roll) - the game pauses while the player rolls physically and types in their total
- Pre-compute their modifiers and tell them exactly what to roll in \`formula\` (e.g. "1d20+3"), and give the roll a clear \`title\` and \`description\`
- In co-op, always set \`player_name\` so the right person rolls
- NPC/enemy/secret rolls are still YOURS: keep using \`formula_roll\` / \`npc_roll\` (show_to_player: false for hidden rolls)
- If the player skips the roll prompt, roll it for them with \`formula_roll\` and move on`
    : "";

  const systemPrompt = `You ARE the Game Master. Run this like a real tabletop session.
${freshStorySetupBlock}
## VISIBILITY RULES
**Everything you write is shown to the player, EXCEPT text inside <thinking>...</thinking> tags.**
- ALWAYS start with <thinking> for your private reasoning (dice math, difficulty calls, which notes to check)
- After you close </thinking>, just write the story prose directly - no wrapper tag needed, it's shown to the player as-is
- Tool calls are invisible to the player - they just see results narratively
- Always read the DM Instructions and Character Sheet and Game Mechanics notes before acting or rolling dice.
- Remember to check notes for NPCs, enemies, locations, items, and lore before making assumptions.

## PLAYER AGENCY (NON-NEGOTIABLE)
- NEVER decide what the player character says, thinks, feels, or does next. You resolve outcomes for the action they already declared - you don't invent their next action.
- You control NPCs, monsters, the environment, and dice/table results. Everything about the player character's choices belongs to the player.
- Resolve ONE beat at a time: the current action and its immediate consequence. Don't chain a second unrequested event, enemy turn, or complication onto the same turn "for free" - stop and hand control back at the next decision point.
- Only call \`request_continuation\` to chain mechanically-linked rolls (e.g. attack succeeded, now roll damage) - never to skip ahead narratively past the point where the player should act.${observerNoteBlock}

## LENGTH & PACING
A real tabletop GM talks in a few sentences and hands the mic back - they don't narrate a mini scene around every action. Match your narration length to the moment, and end the instant the player has something to react to:
- Routine action or quick line of dialogue: ${lengthGuidance.routine}
- Notable action with an NPC reaction: ${lengthGuidance.notable}
- Combat beat, big reveal, or emotional climax: ${lengthGuidance.climax}
These are hard ceilings, not targets to fill. Never pad a turn to hit a length bracket, and never write a second scene/beat "for free" just because you have room left - stop at the decision point even if that's one sentence of NPC dialogue.${pacingFeedbackLine}

**Cut the flavor, keep the beat.** Don't build out a whole vignette (extra sensory detail, incidental banter with a background character, describing actions no one asked about) around the actual outcome - state the outcome and stop.
- Bad (too much staging): "You slide your hand into the paint case with the practiced ease of a man who's done this a thousand times. As you lift the tube, you tilt it just so, letting the light catch the crimp. There. A tiny roll of microfilm. 'Saving that blue for the next one, Bob?' calls Danny, the cameraman. 'Oh, you know me,' you say, flashing that gentle smile. 'Phthalo Blue waits for no one.' Danny chuckles and disappears. The microfilm is pressed between your fingers as you hum a tune."
- Good (same beat, no padding): "You palm the tube - there's a grain of microfilm tucked against the cap. Danny glances over but doesn't clock it. Read it now, or wait till you're alone?"
Same information, same stakes, a third of the words.

## OUT-OF-CHARACTER (OOC) COMMUNICATION
You and the player can talk OOC by wrapping text in (round brackets).
- **(GM asking)**: "(Quick question: do you want to use your potion now or save it?)"
- **(Player answering)**: "(I'll save it for now)"
- Use OOC when you need clarification, want to offer meta-choices, or explain rules.
- OOC text is visible to the player but clearly separate from the story narration.
- After OOC exchanges, continue with the story based on their answer.

## RESPONSE STRUCTURE
1. <thinking>Your private GM reasoning - dice math, difficulty decisions, what notes to check</thinking>
2. Story prose describing the action, written directly with no wrapper tag (player sees this)
3. Call tools as needed (player doesn't see these)
4. Continue the story prose based on results, again with no wrapper tag

## WHEN TO USE TOOLS

### Information Lookup (DO THIS FIRST!)
- **Before any combat**: Search notes for enemy/monster stat sheets
- **Before NPC interactions**: Check if notes exist about that character
- **When player asks about lore**: Search notes for relevant world info
- Use \`search_notes\` when unsure what exists, \`read_notes\` when you know the title

### Creating Records
- **New enemy encountered without stats**: Create a note with their combat stats (HP, attacks, abilities)
- **Important event happens**: Add a memory entry (discoveries, decisions, plot twists)
- **Meet a named NPC**: Use \`add_npc\` to track them (name, role, attitude, description)
- **Discover new location/faction/item**: Create a note documenting it

### Updating Records
- **Enemy HP changes**: Use \`update_combatant_stat\` during combat
- **NPC attitude/relationship changes**: Use \`update_npc\`
- **Character sheet changes**: Use \`edit_note\` to keep stats, resources, abilities current
- **Small note edits**: Use \`edit_lore_replace\` (find/replace), \`edit_lore_append\` (add to end), \`edit_lore_prepend\` (add to top), or \`edit_lore_insert\` (insert near a pattern)
- **Large note rewrites**: Use \`edit_note\` with full new content
- **Merge related notes**: Use \`merge_lore\` to combine multiple entries

### Combat & Mechanics
- **Skill checks**: Use \`formula_roll\` for risky actions with meaningful stakes
- **Player self-reports a roll**: If the player tells you their result in freeform text or voice (e.g. "I rolled a 17, plus 3 is 20") instead of you rolling for them, use \`check_dc\` to compare it against the DC - don't judge success/failure yourself
- **Enemy attacks**: Roll for them using their stats, apply damage to player resources
- **Multiple enemies**: Start formal combat with \`start_combat\` for initiative tracking
- **Routine actions**: No roll needed - just narrate success${manualDiceSection}

### Tables (USE THEM - DON'T JUST IMPROVISE)
- Before inventing random content (loot, encounters, NPC traits, weather, complications, plot twists, rumors, etc.), check whether a relevant table exists and roll on it with \`roll_table\` instead of making it up.
- **Custom tables** defined by this adventure take priority - check those first.
- **Built-in AGMT tables** are always available as a fallback (character traits, locations, plot twists, magic items, and more - see the \`roll_table\` tool description for the full list).
- Only improvise freely when no matching table exists. Tables keep the world feeling alive and unpredictable instead of relying on the same GM instincts every time.

### State Changes
- **Player Stats:** Update their character sheet with \`edit_note\` as needed
- **NPC Status:** Use \`update_npc\` to change attitudes, relationships, or conditions, or \`edit_note\` for detailed changes on their note
- **Combatants:** Use \`update_combatant_stat\` or \`toggle_combatant_condition\` to adjust HP, conditions, or status effects during combat
- **Timers:** Manage timed events with \`manage_timer\` (action: create/advance/toggle_pause/cancel/trigger)

### Story Progression
- **Thread progress**: \`create_thread\`, \`update_thread\`, \`resolve_thread\`, \`abandon_thread\`
- **Goal progress**: \`create_goal\`, \`update_goal\`, \`complete_goal\`, \`fail_goal\`

## NOTE TYPES (ALWAYS specify type when creating!)
When using \`create_note\`, always set the \`type\` parameter:

| Type | Use For | Example Titles |
|------|---------|----------------|
| \`npc\` | Character details, stats | "Captain Aldric", "The Merchant Zara" |
| \`location\` | Places, regions, buildings | "The Frozen Wastes", "Tavern of the Lost" |
| \`item\` | Artifacts, equipment | "Sword of Flames", "Ancient Amulet" |
| \`faction\` | Organizations, guilds | "The Shadow Guild", "Royal Guard" |
| \`event\` | Historical events | "The Fall of the Empire" |
| \`lore\` | General world-building | "Elven Customs", "The Great War" |
| \`secret\` | GM-only hidden info | "The villain's true identity" |
| \`dm_instructions\` | 📌 GM guidance (always loaded) | "Combat Rules", "Session Guidelines" |
| \`character_sheet\` | 📌 Player character (always loaded) | "Hero Stats", "Character Background" |
| \`mechanics\` | 📌 Game rules (always loaded) | "Magic System", "Dice Formulas" |

**📌 Pinned types** are loaded in FULL every turn - use sparingly!

**Example:** \`create_note({ title: "Captain Aldric", content: "...", type: "npc" })\`

## IMPORTANT BEHAVIORS
- Look up notes BEFORE making assumptions about enemy stats or NPC details
- If no stat sheet exists for an enemy, create one before combat rolls
- Record significant moments so you remember them in future turns
- The player's character sheet and game rules are in the pinned notes - reference them

Write immersive prose. The player should experience the story, not see game mechanics.
Keep every turn tight and short: one action, one consequence, then stop and hand control back - never decide what the player character does next, and never write more than the moment calls for.`;

  // Use tools + state tools
  const legacyToolNames = [
    // Rolling tools (formula-based)
    "formula_roll",
    // Manual dice mode: player rolls real dice, GM asks for the result
    ...(manualDiceMode ? ["ask_for_roll"] : []),
    // Pause and ask the player(s) a predefined-choice + free-text question
    "ask_question",
    // Pure numeric DC check for totals the player self-reports in freeform text/voice
    "check_dc",
    "formula_challenge_check",
    "opposed_formula",
    "fate_question",
    "roll_table",
    // Calculator
    "calculate",
    // Lookup
    "read_notes",
    "search_memory",
    // Flow control
    "start_challenge",
    "cancel_challenge",
    "take_rest",
    // Combat tools
    "start_combat",
    "add_combatant",
    "remove_combatant",
    "update_combatant_stat",
    "toggle_combatant_condition",
    "npc_roll",
    "advance_turn",
    "end_combat",
    // NPC management tools
    "add_npc",
    "update_npc",
    "remove_npc",
    "npc_reaction",
    // Timer tool (unified create/advance/toggle_pause/cancel/trigger)
    "manage_timer",
    // Reasoning-tier self-escalation
    "set_reasoning_tier",
  ];

  // (TOOL_SCHEMAS imported statically at the top of this file)
  const stateToolNames = [
    // Goal tools
    "create_goal",
    "complete_goal",
    "fail_goal",
    "update_goal",
    "delete_goal",
    // Note management tools
    "search_notes",
    "create_note",
    "delete_note",
    "edit_note",
    // Note editing tools (fine-grained content manipulation)
    "edit_lore_replace",
    "edit_lore_append",
    "edit_lore_prepend",
    "edit_lore_insert",
    "merge_lore",
    "duplicate_lore",
    // Memory: add_memory deliberately NOT whitelisted here - a dedicated
    // memory agent (memoryAgent.ts) now decides what's worth persisting
    // after each turn instead of the GM calling this itself mid-generation.
    // Retrieval is unchanged - search_memory (in legacyToolNames above)
    // still lets the GM look memory up on demand.
    // Thread tools
    "create_thread",
    "update_thread",
    "resolve_thread",
    "abandon_thread",
    // Advanced RPG Tools scene check (was missing from this whitelist
    // entirely - the schema, executor, and prompt section all existed,
    // but the model could never actually call it in the live GM stage)
    "increment_scene",
    // Random event acknowledgement
    "resolve_random_event",
    // Director move acknowledgement
    "acknowledge_director_move",
  ];

  const gmTools = GM_TOOL_SCHEMAS.filter((t: any) =>
    legacyToolNames.includes(t.function.name),
  );
  const stateTools = TOOL_SCHEMAS.filter((t: any) =>
    stateToolNames.includes(t.function.name),
  );
  const toolsToUse = [...gmTools, ...stateTools];

  // Build the state/info message (separate from system prompt for cleaner context)
  let stateMessage = `═══════════════════════════════════════════════════════════════
📋 CURRENT GAME STATE
═══════════════════════════════════════════════════════════════
`;

  // Story-so-far summary (see compaction.ts): earlier scene history that has
  // aged out of the history budget below gets folded in here instead of
  // silently disappearing.
  if (storyData.scene.summary) {
    stateMessage += `\n## 📖 STORY SO FAR (summary of earlier events, no longer shown in full below)\n${storyData.scene.summary}\n`;
  }

  // Add lore/notes section
  if (loreSection) {
    stateMessage += loreSection + "\n";
  }

  // Add NPCs
  if (npcList) {
    stateMessage += `## 👥 NPCs Summary (read their notes for more details)\n- ${npcList}\n\n`;
  }

  // Add combat state
  if (combatSection) {
    stateMessage += combatSection + "\n";
  }

  // Add timers
  if (timersSection) {
    stateMessage += timersSection + "\n";
  }

  // Add pending random events / director moves - must be addressed
  if (gmStagePendingEventsSection) {
    stateMessage += gmStagePendingEventsSection + "\n\n";
  }
  if (gmStagePendingDirectorMovesSection) {
    stateMessage += gmStagePendingDirectorMovesSection + "\n\n";
  }

  const messages: ChatMessage[] = [
    { role: "system", content: cleanString(systemPrompt) },
  ];

  // Add state as a separate user message (keeps system prompt lean)
  if (stateMessage.trim().length > 100) {
    messages.push({
      role: "user",
      content: cleanString(stateMessage),
    });
    messages.push({
      role: "assistant",
      content:
        "[GAME MASTER] I've reviewed the current game state. Ready to process the player's action.",
    });
  }

  // Examples are now embedded in the system prompt for natural reading
  // No separate few-shot messages needed

  // Build chat history from scene parts
  // GM Stage needs to see its own reasoning and tool calls from previous turns
  // Format: user choice → GM thinking + tool calls → story output (summarized)
  // Then next user choice continues the pattern
  const partsToInclude = [...recentParts];

  // Helper to normalize user choice for comparison
  // Strips >, [Voice Input...] tags, skill check brackets, etc.
  const normalizeForComparison = (text: string) => {
    return text
      .replace(/^>\s*/, "") // Remove leading >
      .replace(/\[Voice Input[^\]]*\]/gi, "") // Remove voice input tag
      .replace(/\[[^\]]+:\s*[^\]]+\]/g, "") // Remove skill check brackets like [Perception: 25]
      .trim()
      .split("\n")[0] // Just the first line (the actual action)
      .trim();
  };

  // Remove the last user part if it matches current userChoice (will be added separately)
  if (
    partsToInclude.length > 0 &&
    partsToInclude[partsToInclude.length - 1].user
  ) {
    const lastPart = partsToInclude[partsToInclude.length - 1];
    const lastPartNormalized = normalizeForComparison(lastPart.content);
    const userChoiceNormalized = normalizeForComparison(userChoice);
    if (lastPartNormalized === userChoiceNormalized) {
      partsToInclude.pop();
    }
  }

  // Process parts in pairs: user choice followed by assistant story
  // We need to reconstruct the full GM conversation flow
  for (let i = 0; i < partsToInclude.length; i++) {
    const part = partsToInclude[i];

    if (part.user) {
      // User action - simple format, story context comes after GM response
      messages.push({
        role: "user",
        content: cleanString(`> ${part.content.replace(/^>\s*/, "")}`),
      });
    } else {
      // Assistant (story) part - reconstruct GM's conversation
      // NEW: Use gmConversation if available (has actual tool_calls and tool role messages)
      if (part.gmConversation && part.gmConversation.length > 0) {
        // Use the actual saved conversation - this preserves exact tool_calls and tool responses
        for (const msg of part.gmConversation) {
          if (msg.role === "assistant") {
            const assistantMsg: ChatMessage = {
              role: "assistant",
              content: cleanString(msg.content),
              reasoning: msg.reasoning,
              reasoning_details: msg.reasoning_details,
            };
            if (msg.tool_calls && msg.tool_calls.length > 0) {
              assistantMsg.tool_calls = msg.tool_calls;
            }
            messages.push(assistantMsg);
          } else if (msg.role === "tool") {
            messages.push({
              role: "tool",
              content: msg.content,
              tool_call_id: msg.tool_call_id,
            });
          }
        }
      } else if (part.gmThinking && part.gmThinking.length > 0) {
        // LEGACY FALLBACK: Synthesize conversation from gmThinking + gmToolCalls
        // This is for backward compatibility with stories saved before gmConversation was added

        // gmToolCalls contains GMToolResult[] objects, not raw tool_calls
        // Each entry has: toolName, toolCallId, success, contextForStory
        const gmToolResults = (part.gmToolCalls || []) as Array<{
          toolName: string;
          toolCallId: string;
          success: boolean;
          contextForStory: string;
        }>;

        // If we have tool results, reconstruct the conversation properly
        if (gmToolResults.length > 0) {
          const thinkingEntries = part.gmThinking;

          // Simple approach: One assistant message per GM round, with its tool responses
          for (
            let roundIdx = 0;
            roundIdx < thinkingEntries.length;
            roundIdx++
          ) {
            const thinking = thinkingEntries[roundIdx];
            const toolResult = gmToolResults[roundIdx];

            if (toolResult) {
              // Create synthetic tool_call object for this round
              const syntheticToolCall = {
                id:
                  toolResult.toolCallId ||
                  `call_${i}_${roundIdx}_${toolResult.toolName}`,
                type: "function",
                function: {
                  name: toolResult.toolName,
                  arguments: "{}", // We don't have the original args, but this is for context
                },
              };

              // Assistant message with this round's thinking and tool call
              messages.push({
                role: "assistant",
                content: cleanString(thinking),
                tool_calls: [syntheticToolCall],
              });

              // Tool response with matching ID
              messages.push({
                role: "tool",
                content:
                  toolResult.contextForStory ||
                  `[Tool: ${toolResult.toolName}] ${
                    toolResult.success ? "Success" : "Failed"
                  }`,
                tool_call_id: syntheticToolCall.id,
              });
            } else {
              // No tool result for this thinking entry - just add as assistant
              messages.push({
                role: "assistant",
                content: cleanString(`[GAME MASTER]\n${thinking}`),
              });
            }
          }

          // Handle any remaining tool results that didn't have matching thinking
          for (
            let toolIdx = thinkingEntries.length;
            toolIdx < gmToolResults.length;
            toolIdx++
          ) {
            const toolResult = gmToolResults[toolIdx];
            const syntheticToolCall = {
              id:
                toolResult.toolCallId ||
                `call_${i}_${toolIdx}_${toolResult.toolName}`,
              type: "function",
              function: {
                name: toolResult.toolName,
                arguments: "{}",
              },
            };

            messages.push({
              role: "assistant",
              content: `[GAME MASTER] Executing ${toolResult.toolName}`,
              tool_calls: [syntheticToolCall],
            });

            messages.push({
              role: "tool",
              content:
                toolResult.contextForStory ||
                `[Tool: ${toolResult.toolName}] ${
                  toolResult.success ? "Success" : "Failed"
                }`,
              tool_call_id: syntheticToolCall.id,
            });
          }
        } else {
          // Just thinking, no tool calls - combine into single assistant message
          // This happens when GM produces final content with <thinking> tags
          const thinkingText = part.gmThinking.join("\n\n");
          messages.push({
            role: "assistant",
            content: cleanString(`<thinking>\n${thinkingText}\n</thinking>`),
          });
        }
      } else if (part.gmStoryContext) {
        // No thinking but has GM context - include as assistant summary
        messages.push({
          role: "assistant",
          content: cleanString(`[GAME MASTER]\n${part.gmStoryContext}`),
        });
      }

      // Add the story output as assistant response AFTER GM thinking
      // This shows the GM what narrative was generated from their decisions
      // Skip if gmConversation was used (story is already in there)
      // Also skip if this is a GM-direct output (gmThinking exists but no gmToolCalls)
      const hasGmConversation =
        part.gmConversation && part.gmConversation.length > 0;
      const isGMDirectOutput =
        part.gmThinking?.length && !part.gmToolCalls?.length;
      if (
        part.content &&
        part.content.trim() &&
        !hasGmConversation &&
        !isGMDirectOutput
      ) {
        messages.push({
          role: "assistant",
          content: cleanString(`[STORY OUTPUT]\n${part.content}`),
        });
      } else if (
        part.content &&
        part.content.trim() &&
        !hasGmConversation &&
        isGMDirectOutput
      ) {
        // GM wrote the story directly - just add it without the [STORY OUTPUT] marker
        // since it's a continuation of the GM's response
        messages.push({
          role: "assistant",
          content: cleanString(part.content),
        });
      }
    }
  }

  // Add the current player action as the final user message
  // Story context is now in the previous assistant message, so just include the action
  const playerActionMessage = `> ${userChoice.replace(
    /^>\s*/,
    "",
  )}\n\n**INSTRUCTIONS:**
1. First, read through the Game Mechanics Notes if needed.
2. Use reasoning and planning before talking back to the player.
3. **Call the tool(s)** with correct parameters. You MUST call at least one tool or as many as you need to handle the player's action properly. Do not skip tool calls! *Remember:* You have to edit the player character sheets when their stats change.
4. Finally, write the story prose the player will see, based on the tool results.

**CRITICAL:** Keep private reasoning inside <thinking>...</thinking> tags. Everything else you write is shown to the player as-is - do not wrap it in any tag.`;

  messages.push({
    role: "user",
    content: cleanString(playerActionMessage),
  });

  // Add prefill for tool calling (may be stripped by API for some providers)
  messages.push({ role: "assistant", content: GM_STAGE_AFFIRMATION });

  // Count how many parts have GM history (new or legacy format)
  const partsWithGMHistory = partsToInclude.filter(
    (p) =>
      !p.user &&
      (p.gmConversation?.length ||
        p.gmThinking?.length ||
        p.gmToolCalls?.length),
  ).length;
  const partsWithNewFormat = partsToInclude.filter(
    (p) => !p.user && p.gmConversation?.length,
  ).length;

  // Debug logging
  console.log(
    `[buildGMStagePrompt] Context budget: ${totalContextBudget} tokens (history: ${historyBudget}, info: ${infoBudget})`,
  );
  console.log(`  - System prompt: ${estimateTokens(systemPrompt)} tokens`);
  console.log(`  - State message: ${estimateTokens(stateMessage)} tokens`);
  console.log(
    `  - Chat history: ${recentParts.length} parts (${partsWithGMHistory} with GM data, ${partsWithNewFormat} with new gmConversation format)`,
  );
  console.log(`  - Available tools: ${toolsToUse.length}`);

  return {
    messages,
    tools: toolsToUse.map((t: any) => ({
      type: "function",
      function: t.function,
    })),
  };
}
/**
 * Builds a simple continuation prompt for story writing after GM thinking completes.
 * This is appended to the GM conversation to continue in the same context.
 */
export function buildStoryContinuationPrompt(
  storytellerMode: StorytellerMode = "narrator",
  replyLength: ReplyLength = "medium",
  pacingNote?: string,
): string {
  const { paragraphs } = getLengthGuidance(replyLength);
  const pacingFeedbackLine = pacingNote ? `\n\n${pacingNote}` : "";

  const basePrompt = `Now write the story from the player's perspective. Write only the prose the player should see - no meta-commentary, no notes to yourself.

Keep it tight and hand the mic back - this is a back-and-forth roleplay, not a monologue. ${paragraphs} End the instant the player has something to react to; never write what the player character does next.${pacingFeedbackLine}`;

  const narratorGuidelines = `
Write immersive prose - show, don't tell. No dice results or mechanical language.
Use vivid sensory details, but stay within the length above.`;

  const dmGuidelines = `
Write as a Dungeon Master narrating to the player. You may reference dice results naturally.
Use second person ("You swing your sword..."), but stay within the length above.`;

  return (
    basePrompt + (storytellerMode === "dm" ? dmGuidelines : narratorGuidelines)
  );
}
