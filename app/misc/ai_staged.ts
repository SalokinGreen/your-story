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
import {
  ARCHETYPE_INFO,
  selectGMAdviceForTurn,
  formatGMAdviceNote,
} from "@/app/misc/gmAdvice";
import { formatOracleRecencyLine } from "@/app/misc/mythic";
import {
  getSetupReminder,
  SETUP_REMINDER_URGENT_TURNS,
} from "@/app/misc/campaignPlan";
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

export const CHOICES_AFFIRMATION = `Understood. I will generate player choices following these rules:
- **Format:** Plain list with dashes, one choice per line.
- **Mechanics:** Use exact stat/resource/item names from game state.
- **Balance:** Include safe options and risky-but-rewarding options.
- **No Repeat Rolls:** Avoid re-testing the same skill check that just resolved.

Generating choices:`;

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
export const CHOICES_STAGE_TOKEN_BUDGET = 4000; // ~4k tokens for choices stage history
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
  // The campaign plan/spine + per-player arcs. Pinned so the GM re-reads the
  // beat it's currently running every turn (see docs/gm-plan-notes-design.md).
  "gm_plan",
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
- Scene Count: ${storyData.agmtState.sceneCount}
${formatOracleRecencyLine(storyData)}`
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

// ============================================
// GAME MASTER STAGE PROMPT BUILDER
// ============================================

export const GM_STAGE_AFFIRMATION = `<thinking>
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
 * "medium": 1-2 sentences typical, a short paragraph when the moment needs it.
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
        routine: "1 short sentence (roughly 8-25 words)",
        notable: "1-2 sentences (up to ~45 words)",
        climax: "a short paragraph (up to ~80 words)",
        paragraphs:
          "Keep it to one or two sentences. Only a genuinely big beat earns a short paragraph - never more than that.",
      };
    case "long":
      return {
        routine: "1 paragraph (roughly 40-90 words)",
        notable: "up to 2 paragraphs (90-160 words)",
        climax: "up to 3 paragraphs (160-260 words)",
        paragraphs:
          "Write 1 paragraph by default. Use a second only if the moment really needs it, and a third only for a big beat like a combat climax or major reveal.",
      };
    case "medium":
    default:
      return {
        routine: "1-2 sentences (roughly 15-45 words)",
        notable: "a short paragraph (up to ~90 words)",
        climax: "1-2 tight paragraphs (up to ~130 words)",
        paragraphs:
          "Keep it to a single short paragraph - a sentence or two is often enough. Use a second paragraph only for a genuinely big moment.",
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
  storyProgressNote,
  repetitionNote,
  knowledgeNote,
  usesNativeReasoning = false,
}: {
  storyData: StoryData;
  userChoice: string;
  customMaxContext?: number; // Memory Size slider - this is the main context control now
  modelName?: string; // Used to get model's actual context limit
  replyLength?: ReplyLength; // Reply Length setting - controls narration verbosity
  pacingNote?: string; // Deterministic pacing nudge (see pacingFeedback.ts)
  // True when the resolved tier is a reasoning model that emits its chain of
  // thought in a native `reasoning` channel (reasoningEffort !== "none").
  // Such models don't need - and are muddled by - the literal <thinking>
  // prefill, which forces the *content* channel to open a thinking tag that
  // competes with their native reasoning. Non-reasoning models keep the
  // prefill (it's what makes them structure their reasoning at all). Defaults
  // false so callers that don't know the tier get today's behavior.
  usesNativeReasoning?: boolean;
  // Layer 5 hardening (see observer.ts): explains an observer flag so the
  // GM doesn't just repeat the mistake. Two sources, mutually exclusive per
  // call - generateStoryTurn (generation.ts) picks whichever applies: a
  // same-turn reset's corrective note (this exact attempt was just
  // discarded for THIS reason) while a retry is in progress, or the PRIOR
  // turn's surviving flags (buildObserverWarningNote) carried forward as a
  // warning otherwise - without the latter, a minor flag (which never
  // triggers a reset) or a major flag whose reset budget ran out would
  // reach the player via a toast but never reach the GM at all.
  observerNote?: string;
  // Layer 3 periodic check-in (see storyProgressObserver.ts): a holistic
  // read on the story's overall pacing/momentum over recent turns, produced
  // every N turns rather than every turn. GM-facing only, never mentioned
  // to the player.
  storyProgressNote?: string;
  // Same check-in's repeated-phrase callout (see storyProgressObserver.ts's
  // findRepeatedPhrases): word/phrase tics the deterministic counter caught
  // recurring across recent turns and the judge confirmed worth flagging.
  // GM-facing only, never mentioned to the player.
  repetitionNote?: string;
  // Same check-in's NPC knowledge-consistency callout: an NPC the judge
  // believes displayed knowledge it had no established way of having,
  // going only by the visible narration window. Advisory only - GM-facing,
  // never mentioned to the player.
  knowledgeNote?: string;
}): { messages: ChatMessage[]; tools: any[] } {
  const lengthGuidance = getLengthGuidance(replyLength);
  const pacingFeedbackLine = pacingNote ? `\n${pacingNote}` : "";
  const observerNoteBlock = observerNote
    ? `\n\n## OBSERVER FEEDBACK\n${observerNote}`
    : "";
  const storyProgressNoteBlock = storyProgressNote
    ? `\n\n## STORY PROGRESS CHECK-IN\n${storyProgressNote}`
    : "";
  const repetitionNoteBlock = repetitionNote
    ? `\n\n## REPEATED PHRASES\n${repetitionNote}`
    : "";
  const knowledgeNoteBlock = knowledgeNote
    ? `\n\n## NPC KNOWLEDGE CHECK\n${knowledgeNote}`
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

  // 📌 Campaign Plan - Always loaded in full (spine + per-player arcs + any
  // open side beat). See docs/gm-plan-notes-design.md.
  const gmPlanLore = (storyData.lore || []).filter(
    (l) => l.enabled !== false && l.type === "gm_plan",
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
    loreSection += `\n## 📌 CHARACTER SHEET\nThe player's character details - traits, background, abilities, resources.\nThis is not opening-scene set dressing: the player picked these, and they expect them to keep mattering. Every turn, let the sheet decide something concrete - which skill/stat a roll uses and at what difficulty, whether an NPC recognises a title or a reputation, what a flaw or bond costs them right now, what their background lets them notice that someone else wouldn't. If a turn could have gone the same way for any character at all, you didn't use it.\nTo update: edit_note("title", content="new content") - Keep stats, HP, XP, etc. current!\n`;
    for (const l of characterSheetLore) {
      loreSection += `\n### ${l.title}.md\n${cleanString(l.content)}\n`;
    }
  }

  // Campaign Plan: Full content. This is the GM's living plan - the campaign
  // spine (only the current beat detailed, future beats one-liners) plus one
  // arc note per player. The GM follows it one beat ahead and edits it as the
  // story advances. See docs/gm-plan-notes-design.md.
  if (gmPlanLore.length > 0) {
    const activeSideBeat = storyData.activeSideBeatTitle;
    const plan = storyData.planState;
    loreSection += `\n## 📌 CAMPAIGN PLAN\nYour living plan for this campaign - a situation, not a script. Keep it current with edit_note.\n- The Spine is a PREDICTION of the drama, not a track: when play diverges, rewrite the remaining beats rather than steering players back.\n- Detail ONLY the current beat in full; future beats stay one-liners until you reach them.\n- Tick checklist items ([ ] -> [x]) as they happen. When the current beat's "advance-on" trigger (player action OR time/consequence) is met: call \`advance_plan\` (complete_current), then \`advance_plan\` (write_next) with the next beat detailed - do both before narrating onward.\n- Fronts advance on their own via their doom clocks (manage_timer); tick them on time triggers or failures, and rewrite a Front's steps when the players neutralize its cause.\n`;
    if (plan) {
      const beatName = plan.beats[plan.currentBeatIndex] ?? "?";
      loreSection += `- Current beat: **${beatName}** (${
        plan.currentBeatIndex + 1
      }/${plan.beats.length}).\n`;
      if (plan.awaitingNextBeat) {
        loreSection += `- ⏭ You marked this beat COMPLETE. You must call \`advance_plan\` (write_next) with the next beat detailed before this turn can end.\n`;
      }
    }
    if (activeSideBeat) {
      loreSection += `- ⚡ FOCUS: side beat "${activeSideBeat}" is active - run it now; the main spine beat is paused until you call close_side_beat.\n`;
    }
    for (const l of gmPlanLore) {
      const focusMark = l.title === activeSideBeat ? " ⚡ (ACTIVE FOCUS)" : "";
      loreSection += `\n### ${l.title}.md${focusMark}\n${cleanString(l.content)}\n`;
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

  // Player archetype(s) - self-selected playstyle (Robin Laws taxonomy). The
  // GM stage is the decision-maker, so it needs this facilitation guidance
  // too - previously only buildInfoMessage (Choices/story stage) surfaced it,
  // leaving the "brain" blind to how the player wants to be engaged. Advisory
  // only; never feeds the deterministic director. Read fresh every turn.
  const gmArchetypeLines: string[] = [];
  const gmCouchArchetypes = (storyData.multiplayer?.couchPlayers || []).filter(
    (p) => p.archetype,
  );
  if (gmCouchArchetypes.length > 0) {
    for (const p of gmCouchArchetypes) {
      const info = ARCHETYPE_INFO[p.archetype!];
      gmArchetypeLines.push(
        `- ${p.name} (${info.label}): ${info.facilitation}`,
      );
    }
  } else if (storyData.playerArchetype) {
    const info = ARCHETYPE_INFO[storyData.playerArchetype];
    gmArchetypeLines.push(
      `- ${cleanString(storyData.player_name || "The player")} (${
        info.label
      }): ${info.facilitation}`,
    );
  }
  const gmArchetypeSection = gmArchetypeLines.length
    ? `## 🎭 Player Archetype (self-selected playstyle - lean into this)\n${gmArchetypeLines.join(
        "\n",
      )}`
    : "";

  // 🧍 Who the player character IS. The GM stage - the "brain" that decides
  // rolls, NPC reactions, and what the world does - never saw player_name or
  // player_summary at all: the only identity signal it got was whatever the
  // character_sheet note happened to spell out, which is why the GM would
  // drift into calling the PC by a generic label, or forget the traits the
  // player chose after the opening scene. The profile tags (curated at story
  // start, GuidedStoryStart.tsx) are here for the same reason: they were
  // durable state read only by the director layer's spotlight_tag move, so
  // the GM itself never knew what the player said they wanted out of play.
  const gmPlayerLines: string[] = [];
  const gmPlayerName = cleanString(storyData.player_name || "").trim();
  if (gmPlayerName) {
    gmPlayerLines.push(
      `- **${gmPlayerName}** is the player character. You never speak, think, or decide for them.`,
    );
  }
  if (storyData.player_summary?.trim()) {
    gmPlayerLines.push(`- Summary: ${cleanString(storyData.player_summary)}`);
  }
  const gmCouchRoster = (storyData.multiplayer?.couchPlayers || []).filter(
    (p) => p.name?.trim(),
  );
  if (gmCouchRoster.length > 0) {
    gmPlayerLines.push(
      `- At the table: ${gmCouchRoster
        .map((p) => cleanString(p.name))
        .join(", ")} - each one is a player character, not an NPC.`,
    );
  }
  // Tags: couch players carry their own; solo play keeps them on StoryData.
  const gmPersonalityTags = gmCouchRoster.length
    ? gmCouchRoster.flatMap((p) =>
        (p.personalityTags || []).map((t) => `${cleanString(p.name)}: ${t}`),
      )
    : storyData.playerPersonalityTags || [];
  const gmWishTags = gmCouchRoster.length
    ? gmCouchRoster.flatMap((p) =>
        (p.wishTags || []).map((t) => `${cleanString(p.name)}: ${t}`),
      )
    : storyData.playerWishTags || [];
  if (gmPersonalityTags.length > 0) {
    gmPlayerLines.push(
      `- Character traits the player chose: ${gmPersonalityTags.join(
        ", ",
      )} - give these something to bite on, don't just let them sit on the sheet.`,
    );
  }
  if (gmWishTags.length > 0) {
    gmPlayerLines.push(
      `- What the player wants out of this story: ${gmWishTags.join(
        ", ",
      )} - steer toward this when you have a free choice about what happens next.`,
    );
  }
  const gmPlayerSection = gmPlayerLines.length
    ? `## 🧍 PLAYER CHARACTER\n${gmPlayerLines.join("\n")}`
    : "";

  // Active goals + story threads: the GM creates and updates these, so it
  // must see the live set every turn. Previously absent from the GM stage's
  // state message entirely (only the Choices/story info message had them),
  // so the brain could lose track of its own open plotlines/objectives.
  const gmActiveGoals = (storyData.goals || []).filter(
    (g) => g.active && !g.fulfilled,
  );
  const gmGoalsSection = gmActiveGoals.length
    ? `## 🎯 Active Goals\n${gmActiveGoals
        .map((g) => `- ${g.title}: ${g.description}`)
        .join("\n")}`
    : "";

  const gmTruncateDesc = (desc: string, max = 200) =>
    desc.length > max ? desc.slice(0, max).trim() + "..." : desc;
  const gmActiveThreads = (storyData.threads || []).filter(
    (t) => t.status === "active",
  );
  const gmThreadsSection = gmActiveThreads.length
    ? `## 🧵 Active Story Threads\n${gmActiveThreads
        .map(
          (t) =>
            `- [${t.priority || "side"}] ${t.title}: ${gmTruncateDesc(
              t.description,
            )}`,
        )
        .join("\n")}`
    : "";

  // Oracle/chaos state (Mythic chaos factor): drives fate_question odds and
  // signals how unpredictable the world should feel right now. The GM rolls
  // the oracle, so it needs the current factor - another buildInfoMessage-only
  // section the GM stage was missing.
  const gmOracleSection = storyData.agmtState
    ? `## 🎲 Oracle State\n- Chaos Factor: ${
        storyData.agmtState.chaosFactor
      }/9 (${getChaosDescription(storyData.agmtState.chaosFactor)})\n- Scene Count: ${
        storyData.agmtState.sceneCount
      }\n${formatOracleRecencyLine(storyData)}`
    : "";

  // 🆕 Fresh story setup: no character_sheet note exists yet, meaning this
  // story hasn't been set up (e.g. a "Freeform Story" started with no
  // premise/adventure). Nudge the GM to interview the player briefly before
  // establishing the world, instead of narrating a full opening blind.
  const freshStorySetupBlock =
    characterSheetLore.length === 0
      ? `\n## 🆕 FRESH STORY - SETUP NEEDED
This is a brand-new story with no established setting or character yet - the player skipped adventure creation to talk to you directly.
- If the player's message doesn't give you enough to go on (genre, tone, character concept), ask up to 1-3 concise, friendly questions before creating anything. Do NOT narrate a full opening scene yet - just respond conversationally (use OOC round-brackets or plain text).
- Once you have enough to work with (even a vague idea like "surprise me" or a one-line pitch), use \`create_note\` to establish a \`character_sheet\` note (name, starting stats/resources/abilities fitting the genre and tone), a \`mechanics\` note (dice system + core resolution rules), and a \`gm_plan\` note titled "Campaign Plan" (premise + a beat spine sized to the campaign's scope, with ONLY the Opening Image beat detailed - see the CAMPAIGN PLAN section for the length presets and how to pick one). Then call \`start_game\` with a title for the story and a short premise summary, and narrate the opening scene. The plan note must come BEFORE \`start_game\` - \`start_game\` is blocked until it exists.
- If ANY lore/mechanics/dm_instructions notes already exist on this story (e.g. from an adventure template), \`read_notes\` or \`search_notes\` them before writing the character sheet, mechanics, or plan notes - ground what you create in what's already established instead of inventing a setting from scratch. This is ENFORCED for the plan: \`create_note\` will refuse to create the "Campaign Plan" note until you've called \`read_notes\`/\`search_notes\` this turn, if any such notes exist.
- Keep the interview short - one or two exchanges at most before diving in.
`
      : "";

  // Session zero already done via the creation wizard (character_sheet note
  // exists), but the story hasn't formally started yet - freshStorySetupBlock
  // above doesn't fire in this case, so this is the only nudge telling the GM
  // to call start_game before narrating the opening scene.
  const sessionZeroStartGameReminder =
    storyData.sessionZeroActive && characterSheetLore.length > 0
      ? `\n## 🎬 START OF PLAY\nThis story already has its setup (character sheet/premise) from the creation wizard, but hasn't formally started yet. Two things, in this order, before you narrate the opening scene:\n1. Create the campaign spine - \`read_notes\`/\`search_notes\` the existing notes, then \`create_note({ type: "gm_plan", title: "Campaign Plan", planSpineLength: ..., ... })\` with ONLY the Opening Image beat detailed (see the CAMPAIGN PLAN section).\n2. Call \`start_game\` with a title for the story (and a short premise summary if useful) to kick off play. **\`start_game\` is BLOCKED until the Campaign Plan note exists** - it will return an error if you call it first.\n`
      : "";

  // ⏳ Setup-overdue reminder (getSetupReminder, campaignPlan.ts): the two
  // blocks above are one-shot nudges aimed at turn one, and a GM that talks
  // past them can run a whole campaign with no spine and no start_game (the
  // bug this exists for). This escalates a reminder every turn instead, from
  // SETUP_REMINDER_SOFT_TURNS on, so unfinished setup stays in front of it.
  const setupReminder = getSetupReminder(storyData);
  const setupOverdueBlock = setupReminder
    ? `\n## ${
        setupReminder.level === "urgent"
          ? `🚨 SETUP OVERDUE - FINISH IT THIS TURN (${setupReminder.turns} turns in)`
          : `⏳ SETUP UNFINISHED (${setupReminder.turns} turns in)`
      }\nThis story is ${setupReminder.turns} player turns old and setup still isn't done:
${
  setupReminder.missingPlan
    ? `- **No campaign plan exists.** \`read_notes\`/\`search_notes\` any existing lore/mechanics/dm_instructions notes, then \`create_note({ type: "gm_plan", title: "Campaign Plan", planSpineLength: "short"|"medium"|"long", content: ... })\` with the premise and ONLY the current/Opening Image beat detailed - later beats stay one-line placeholders. See the CAMPAIGN PLAN section.\n`
    : ""
}${
        setupReminder.missingStart
          ? `- **\`start_game\` has not been called**, so this story is still unnamed and stuck in session zero (which pins your reasoning tier at maximum every turn). Call it with a title once the plan exists.${
              setupReminder.missingPlan
                ? " It is BLOCKED until the Campaign Plan note exists, so do the plan first."
                : ""
            }\n`
          : ""
      }${
        setupReminder.level === "urgent"
          ? `Do this NOW, in this turn's tool calls, before any further narration - setup should have been finished by turn ${SETUP_REMINDER_URGENT_TURNS} at the very latest.`
          : `Handle it this turn alongside your normal narration - don't put it off again.`
      }\n`
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
- Use \`ask_for_roll\` (NOT formula_roll) - the game pauses while the player rolls physically and reports what came up
- Pre-compute their modifiers and tell them exactly what to roll in \`formula\` (e.g. "1d20+3"), and give the roll a clear \`title\` and \`description\`
- In co-op, always set \`player_name\` so the right person rolls
- **Their answer comes back as their own words, not a number.** "17", "4 and 6", "20 and a 3 on the challenge die" - read it against what you asked for, do the arithmetic with \`calculate\`, and compare with \`calculate\` too. Nothing is parsed for you and nothing is judged for you
- If their answer genuinely doesn't answer the roll (they reported one die when you asked for three, or it's unreadable), ask again in (round brackets) - never invent a number for them
- NPC/enemy/secret rolls are still YOURS: keep using \`formula_roll\` / \`npc_roll\` (show_to_player: false for hidden rolls)
- If the player skips the roll prompt, roll it for them with \`formula_roll\` and move on`
    : "";

  // Per-turn facilitation nudge (see gmAdvice.ts): 1-2 rotating tips woven
  // into the live prompt so the curated advice bank actually reaches the GM
  // every turn, not only at scene boundaries via increment_scene.
  // Deterministic (seeded on turn count, filtered by combat context) so it's
  // stable across a turn's rounds and safe to compute on every prompt build.
  const gmAdviceSection = formatGMAdviceNote(
    selectGMAdviceForTurn(
      storyData.scene?.parts?.length ?? 0,
      !!storyData.combatState?.active,
    ),
  );

  const systemPrompt = `You ARE the Game Master. Run this like a real tabletop session.
${freshStorySetupBlock}${sessionZeroStartGameReminder}${setupOverdueBlock}
## CORE STANCE (read this first)
1. **You resolve, the player decides.** Never narrate what the player character says, thinks, feels, chooses, or does next - only the outcome of the action they already declared. (Full agency rules below.)
2. **Roll dice only when they matter.** Call a *dice* tool (\`formula_roll\`, \`opposed_formula\`, \`npc_roll\`) ONLY when the player has declared an action whose outcome is genuinely uncertain AND a failure would change the fiction. Casual talk, description, simple movement, and foregone conclusions need no roll - just narrate them. Never invent a check to look busy.
   - **The dice tools don't judge - they report.** None of them takes a DC. They tell you what came up; \`calculate\` tells you what it means ('17+3 >= 15' → TRUE). Roll, then compare, then narrate - never skip the middle step and eyeball the verdict yourself, and never state an outcome your comparison didn't give you. Whatever the target actually is comes from this adventure's mechanics note, not from D&D habits.
3. **Ask the oracle whenever you don't already know.** This is the opposite instruction from #2, and it is not a contradiction: #2 governs *dice checks on what the player is attempting*. It does not govern the oracle. \`fate_question\` and \`roll_table\` answer *your* questions about the world, and a solo GM leans on them constantly - several times a scene is normal, not excessive. Every time you are about to invent something you don't already know - is the door locked, did the guard notice, what's waiting in the next room, how does this NPC really feel, what does the search turn up, what complication lands - that is the oracle's job, not yours. There is no such thing as "too many" oracle calls; there is only inventing answers you should have rolled for.
   - **The tell:** you're deciding by what feels safe, pleasant, or convenient rather than by what's already established. That's manufactured certainty. Stop and roll.
   - **Calibrate honestly:** don't default to 50/50 out of habit - pick Very Unlikely/Unlikely or Very Likely/Likely when you actually believe the odds lean that way.
   - **Take the answer as given.** The oracle exists to hand you results you wouldn't have picked yourself. An unfavorable or inconvenient result is the point - narrate it as rolled instead of writing around it.
4. **Keep it short.** A few sentences, then hand the mic back. (Length limits below.)

## VISIBILITY RULES
**Everything you write is shown to the player, EXCEPT text inside <thinking>...</thinking> tags.**
- ALWAYS start with <thinking> for your private reasoning (dice math, difficulty calls, which notes to check)
- After you close </thinking>, just write the story prose directly - no wrapper tag needed, it's shown to the player as-is
- Tool calls are invisible to the player - they just see results narratively
- The DM Instructions, Character Sheet, and Known NPCs are already provided IN FULL below - don't spend a tool call re-reading them.
- Everything else (Game Mechanics rules, and the individual NPC/location/item/faction/lore/secret notes) is listed by TITLE only. Use read_notes to open the ones this action actually touches BEFORE you roll dice or state a fact about them - never guess their contents.

## PLAYER AGENCY (NON-NEGOTIABLE)
- NEVER decide what the player character says, thinks, feels, or does next. You resolve outcomes for the action they already declared - you don't invent their next action.
- You control NPCs, monsters, the environment, and dice/table results. Everything about the player character's choices belongs to the player.
- Know which one is which: the player character is named in the PLAYER CHARACTER section of the game state below, and "you" in your narration always means them. Give NPCs all the dialogue and initiative you like - that's your job - but the moment a line puts words, a decision, or a next move into the player character's mouth, you've taken their turn for them.
- Use the character sheet and their chosen traits every turn (see the CHARACTER SHEET section): pick difficulties from it, let NPCs react to who they actually are, and give their traits, flaws, and background something to push against. Referencing what a character IS is not the same as deciding what they DO.
- Resolve ONE beat at a time: the current action and its immediate consequence. Don't chain a second unrequested event, enemy turn, or complication onto the same turn "for free" - stop and hand control back at the next decision point.
- Only call \`request_continuation\` to chain mechanically-linked rolls (e.g. attack succeeded, now roll damage) - never to skip ahead narratively past the point where the player should act.${observerNoteBlock}${storyProgressNoteBlock}${repetitionNoteBlock}${knowledgeNoteBlock}

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

## RUNNING THE GAME WELL
The tools resolve mechanics; these principles are what make you a *good* GM.

**Adjudicate with teeth.**
- Stakes before dice: before any roll, know what an interesting success AND an interesting failure look like in the fiction. If you can't picture a failure worth narrating, don't roll - just say what happens.
- Fail forward: a failed roll never dead-ends the story. It costs something - time, position, a resource, a new complication - and the scene keeps moving. Frame failure as bad luck or a capable opponent, never the character being incompetent.
- Prefer graduated outcomes (success at a cost, partial success) over flat pass/fail, and let a crit or a fumble bend the scene somewhere you didn't plan.

**Keep the world alive.**
- NPCs want things. Play them pursuing their own goals and viewpoint - they can refuse, lie, misjudge, or change their mind. They are not quest-dispensers.
- Don't be a yes-man: when the world or an NPC would resist the player's plan, let it resist. Real stakes need real friction and the genuine possibility of failure.
- Consequences persist and compound. A wound, a lie, a favor, a burned bridge carries into later scenes - make the player's last action visibly matter instead of quietly resetting.
- Reincorporate earlier NPCs, objects, and details so the world feels authored, not generated turn by turn.

**Narrate with craft.**
- Show, don't announce - reveal mood, a threat, or a lie through action and one concrete detail, not a label.
- Be specific: one telling detail beats three vague ones. Vary your phrasing - don't reuse the same openers and images every turn.
- End on a hook: close on a live decision or open question, never a tidy loop that leaves the player nothing to push against.

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
- Use \`get_game_state\` to re-check the CURRENT live volatile state (active challenge counts, combat HP/turn order, timers, goals, threads) after you've changed it this turn - the state shown above is a snapshot from turn-start and goes stale once you roll or advance combat

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
- **Skill checks**: Use \`formula_roll\` for risky actions with meaningful stakes, then \`calculate\` to compare the result against the target
- **Player self-reports a roll**: If the player tells you their result in freeform text or voice (e.g. "I rolled a 17, plus 3 is 20") instead of you rolling for them, take their numbers and settle it with \`calculate\` ('17+3 >= 15') - don't judge success/failure yourself
- **Systems that roll several pools**: pass them as separate \`formulas\` entries in ONE \`formula_roll\` (e.g. formulas: ["1d6+2", "2d10"]) so they're thrown together and reported separately, then compare with one \`calculate\` call per target. Never add dissimilar pools into a single formula string
- **Challenges**: inside an active challenge, each check is \`formula_roll\` → \`calculate\` → \`record_challenge_result\`
- **Enemy attacks**: Roll for them using their stats, compare with \`calculate\`, apply damage to player resources
- **Multiple enemies**: Start formal combat with \`start_combat\` for initiative tracking
- **In combat, on the player's turn**: Still use \`formula_roll\` for the player's attacks/checks, never \`npc_roll\` - \`npc_roll\` is for NPC combatants only and resolves silently with no animation, so using it for the player would hide their own roll from them (the tool rejects this)
- **Routine actions**: No roll needed - just narrate success${manualDiceSection}

### Tables (USE THEM - DON'T JUST IMPROVISE)
- Before inventing random content (loot, encounters, NPC traits, weather, complications, plot twists, rumors, etc.), check whether a relevant table exists and roll on it with \`roll_table\` instead of making it up.
- **Custom tables** defined by this adventure take priority - check those first.
- **Built-in AGMT tables** are always available as a fallback (character traits, locations, plot twists, magic items, and more - see the \`roll_table\` tool description for the full list).
- Only improvise freely when no matching table exists. Tables keep the world feeling alive and unpredictable instead of relying on the same GM instincts every time.

### Naming (DON'T REACH FOR THE FIRST NAME THAT COMES TO MIND)
- **Before naming any new NPC, place, faction, creature or notable object**, call \`generate_name\` and build the name from the pointers it gives you. The first name that surfaces on its own is almost always one you've used a hundred times before - Elara, Kael, Lyra, Thorne, Ravenwood - and a cast of those reads as generic no matter how good the prose around it is.
- The pointers are a starting letter and syllable count per part (**binding** - the name you write must match them), plus seed sounds (**inspiration only** - reshape them completely if that's what the setting needs).
- The roll deliberately steers away from letters already used in this story, so the cast stays distinguishable. Pass \`flavor\` to keep the result in the right cultural register, and \`starts_with\` only when a letter genuinely must be fixed (a sibling of an existing NPC, a clan naming convention).
- A name the player already knows is a name that exists - don't re-roll established NPCs or places, only new ones.

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
| \`gm_plan\` | 📌 Campaign spine + per-player arcs (always loaded) | "Campaign Plan", "Arc — Kael" |

**📌 Pinned types** are loaded in FULL every turn - use sparingly!

**Example:** \`create_note({ title: "Captain Aldric", content: "...", type: "npc" })\`

## 📋 CAMPAIGN PLAN (situations, not scripts)
You keep a living plan the way a modern tabletop GM does: it describes a **situation** the players act on, not a **plot** they get marched through. It's the single \`gm_plan\` note titled "Campaign Plan", plus one \`gm_plan\` arc note per player - all loaded in full above and visible to the player. The plan has four parts: a **Spine** (your prediction of the drama), **Fronts** (threats that move on their own), **Secrets & Clues** (facts to discover), and **Character Arcs**.
- **Escalate reasoning for plan-shaping work.** Creating or editing the plan (including \`advance_plan\`), refreshing character arcs, standing up or advancing a Front, and opening/closing a side beat are campaign-shaping calls, not ordinary narration - call \`set_reasoning_tier({ tier: 3, reason: "..." })\` (the top tier) before making them. You don't need to set it back down - it decays toward baseline on its own.
- **Read before you plan (ENFORCED).** Before creating the spine, \`read_notes\`/\`search_notes\` any existing \`lore\`, \`mechanics\`, and \`dm_instructions\` notes for this adventure - the beats, Fronts, and character arcs must reflect the established setting, tone, and rules, not a generic plan invented in a vacuum. If any such notes exist, \`create_note\` will refuse to create "Campaign Plan" until you've called \`read_notes\`/\`search_notes\` this turn - do that first, THEN create the plan in the same or a later turn.
- **Let the oracle seed what you're unsure of.** Writing the premise, a beat's likely shape, a Front's motive, or a candidate arc direction often means inventing something you don't actually know yet (who the antagonist really is, how a complication resolves, which of a character's directions the fiction is leaning toward). Don't just default to the first idea that comes to mind - call \`fate_question\` (with an honestly calibrated likelihood) or \`roll_table\` for it, same discipline as CORE STANCE's "manufactured certainty" rule, just applied to plan-writing instead of in-scene narration.

### The Spine - a PREDICTION, not a track
- **Pick a spine length that fits the campaign, then create it once, early.** During setup / Session 0, after the character(s) exist, judge the scope from the premise, any adventure-length hints, and what the player has said they want, then call \`create_note({ type: "gm_plan", title: "Campaign Plan", planSpineLength: "short"|"medium"|"long", ... })\`:
  - **short** (~5 beats) - a one-shot or short arc: **Opening Image (Session 0)**, **Inciting Incident**, **Rising Action**, **Climax**, **Resolution**.
  - **medium** (~7 beats, default when scope is unclear) - an ordinary multi-session campaign: **Opening Image (Session 0)**, **Inciting Incident (Session 1)**, **Rising Complications**, **Midpoint Turn**, **Crisis**, **Climax**, **Resolution**.
  - **long** (~15 beats) - an extended, multi-arc campaign that needs more medium-horizon texture than a single "Rising Complications" beat can hold: **Opening Image (Session 0)**, **Setup / Ordinary World**, **Theme Stated**, **Inciting Incident (Session 1)**, **Debate**, **Break Into Rising Action**, **B-Story (Allies & Relationships)**, **Fun and Games (Early Wins)**, **Midpoint Turn**, **Bad Guys Close In (Escalating Complications)**, **All Is Lost**, **Dark Night of the Soul**, **Break Into Finale**, **Climax**, **Resolution (Final Image)**.
  Use the FIXED beat names for whichever preset you pick, in order - don't rename or reorder them. At creation, detail ONLY the first beat ("Opening Image", goal: establish/create the character(s) and their ordinary world); leave the rest as one-line placeholders. Do not plan further yet.
- **The spine is a hard prerequisite for \`start_game\` (ENFORCED).** Session zero is not over until the "Campaign Plan" note exists: \`start_game\` returns an error while it's missing. Order is always character(s) -> plan -> \`start_game\` -> narrate the opening scene.
- **The spine is your best GUESS at where the drama goes - not gates the players must trip.** It exists to give tone and pacing a target for the narration. When play diverges from what a beat predicted, **rewrite the remaining spine** to fit what actually happened - never steer the players back toward it. The one-beat-ahead gate enforces *bookkeeping* (keep the plan current), not *plot adherence*.
- **One beat ahead, never more.** The current beat gets a short goal, a \`[ ]\` checklist, and an **advance-on** block (below). Future beats stay one-liners. Never script beats the player hasn't reached.
- **Advance-on triggers, never a scripted "advance-when" moment.** A beat advances on player ACTION or on TIME/consequence - never on the players producing one specific pre-decided event:
  - **action:** list 2+ OR'd routes - e.g. "advance when the players decode the broadcast OR destroy the antenna OR expose the baron". Multiple routes to the same state change, so no single missed action can stall the game (the Three-Clue Rule applied to progression).
  - **time:** e.g. "if the session ends with the broadcast still ignored, Front <name> ticks a step". The world moves whether or not the players engage.
- **Advance at the boundary.** Tick \`[ ]\` -> \`[x]\` with \`edit_note\` as things happen. When the current beat's advance-on is satisfied, call \`advance_plan\` (action "complete_current"), then \`advance_plan\` (action "write_next") with the next beat detailed - and refresh arc directions and Fronts - BEFORE narrating onward. (If you mark a beat complete but don't write the next one, the turn won't be allowed to end until you do.) Ending Session 0 specifically: write one \`gm_plan\` arc note per player (current state + 2-3 candidate directions + active hooks) and detail the Inciting Incident.
- **A tag is NOT a trigger. \`advance_plan\` fires only on the beat's own advance-on.** \`[Neutralized]\`/\`[Clock]\`/\`[Goal]\`/\`[Arc]\` insights are *inputs you consume when write_next runs*, not signals to advance now - they accumulate mid-beat and get read at the boundary. Seeing one does NOT mean call \`advance_plan\`. Only advance when the CURRENT beat's own advance-on condition is met (which may itself be a player action that happens to also neutralize something - then it's the trigger firing, not the tag). If the current beat still isn't satisfied, leave the spine where it is.
- **Mid-beat neutralization → fix the Front, not the spine.** When players defuse/kill/ally-with a threat partway through a beat, react in real time on the FRONT's own state: rewrite or \`resolve_thread\`/\`abandon_thread\` its steps and stop/adjust its \`manage_timer\` clock immediately. That's live world-state and correct to do mid-beat. It does NOT advance the spine - the beat only moves at its own advance-on. The \`[Neutralized]\` tag from that moment just waits in memory for the next write_next.

### Fronts - threats that advance on their own
A Front is a danger with its own agenda that moves in the background whether or not the players engage it. This is how you avoid railroading: rather than scripting what the players do, you set volatile forces in motion and react logically to their interventions.
- **Build a Front from existing tools, not plan prose:** \`create_thread\` (priority "background") carries its motive + cast; \`manage_timer\` is its **doom clock** (its \`description\` = what happens when it fills). Give the thread 2-4 **escalation steps** (Step 1 -> 2 -> 3) in its description, each tied to a clock position.
- **Advance a Front** by ticking its clock (\`manage_timer\`) on a time trigger or a player failure, and telegraph the next step before it lands. When the players neutralize a Front's cause, **rewrite or resolve/abandon** its steps - a defused threat does not limp forward to the next one.
- The plan note's **Fronts** section only INDEXES each active Front (name, motive, current step, clock state) - the real state lives in the thread + timer, the same way you index threads/goals rather than restating them.

### Secrets & Clues - facts, decoupled from how they're found
- Keep a list of 5-10 disconnected facts the players COULD discover, written independent of route. A clue like "the tapes emit a low-frequency hum" can surface via an audiophile NPC, a break-in, or examining a tape - do NOT pre-bind a clue to one location or action. Hand a clue out whenever the fiction earns it, tick it off, and if it matters mechanically spawn a \`Goal\`/\`create_thread\` for it.

### Character Arcs - possibilities, not scripts
- Hold 2-3 candidate arc directions per player and let their choices collapse them - don't steer toward a predetermined one.

- **Don't duplicate threads/goals/Fronts.** The plan is your private intent and an index; when a beat, arc, or Front goes live, spawn the concrete \`create_thread\`/\`create_goal\`/timer for it rather than restating it in the plan body.
- **Side beats = detours.** To pull focus off the spine for a side quest or character detour, call \`open_side_beat\` (it creates the beat and marks it the active focus); run it; call \`close_side_beat\` when it resolves to return to the paused spine beat. Use these instead of quietly wandering off-plan.

## IMPORTANT BEHAVIORS
- Look up notes BEFORE making assumptions about enemy stats or NPC details
- If no stat sheet exists for an enemy, create one before combat rolls
- Record significant moments so you remember them in future turns
- The player's character sheet and game rules are in the pinned notes - reference them

Write immersive prose. The player should experience the story, not see game mechanics.
Keep every turn tight and short: one action, one consequence, then stop and hand control back - never decide what the player character does next, and never write more than the moment calls for.${gmAdviceSection}`;

  // Use tools + state tools
  const legacyToolNames = [
    // Rolling tools (formula-based)
    "formula_roll",
    // Manual dice mode: player rolls real dice, GM asks for the result
    ...(manualDiceMode ? ["ask_for_roll"] : []),
    // Pause and ask the player(s) a predefined-choice + free-text question
    "ask_question",
    // Report a resolved check against the active challenge (rolls nothing)
    "record_challenge_result",
    "opposed_formula",
    "fate_question",
    "roll_table",
    "generate_name",
    // Calculator - also the only thing that turns a roll into a pass/fail
    // verdict, since no dice tool takes a DC any more
    "calculate",
    // Lookup
    "read_notes",
    "search_memory",
    // Re-read current live volatile state (challenge/combat/timers/goals/
    // threads) mid-turn, after the GM's own tool calls have mutated it - the
    // injected state message is only a turn-start snapshot.
    "get_game_state",
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
    // Session-zero -> real-play handoff: names the story and clears
    // sessionZeroActive. The START OF PLAY / fresh-story-setup prompt blocks
    // instruct the GM to call this, so it MUST be offered here - without it the
    // model is told to call a tool it doesn't have.
    "start_game",
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
    // Campaign plan focus: open/close a side beat (side quest / detour)
    "open_side_beat",
    "close_side_beat",
    // Campaign plan: advance the spine one beat (Phase 2 re-planning gate)
    "advance_plan",
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

  // Who the player character is - first, before the notes, because every
  // other section is read in relation to them.
  if (gmPlayerSection) {
    stateMessage += "\n" + gmPlayerSection + "\n\n";
  }

  // Add lore/notes section
  if (loreSection) {
    stateMessage += loreSection + "\n";
  }

  // Add NPCs
  if (npcList) {
    stateMessage += `## 👥 NPCs Summary (read their notes for more details)\n- ${npcList}\n\n`;
  }

  // Player archetype - how the player wants to be engaged (advisory)
  if (gmArchetypeSection) {
    stateMessage += gmArchetypeSection + "\n\n";
  }

  // Active goals + story threads - the GM's own open objectives/plotlines
  if (gmGoalsSection) {
    stateMessage += gmGoalsSection + "\n\n";
  }
  if (gmThreadsSection) {
    stateMessage += gmThreadsSection + "\n\n";
  }

  // Oracle/chaos state
  if (gmOracleSection) {
    stateMessage += gmOracleSection + "\n\n";
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
        "<thinking>I've reviewed the current game state. Ready to process the player's action.</thinking>",
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

  // Reasoning/thought-signature replay (Gemini's `reasoning.encrypted` in
  // particular) is only meaningful for the round immediately being
  // continued - not for every past round concatenated into history.
  // Re-sending an old encrypted reasoning blob from an already-completed
  // round is exactly the failure mode reported against OpenRouter's own
  // Gemini integration: stale `reasoning.encrypted` replayed from history
  // causes a 400 on a later, unrelated request (OpenRouterTeam/ai-sdk-
  // provider#491). So only the LAST assistant part in history keeps its
  // reasoning/reasoning_details; everything older keeps its content and
  // tool_calls (needed for narrative/tool-call continuity) but drops the
  // reasoning metadata.
  let lastAssistantPartIndex = -1;
  for (let j = partsToInclude.length - 1; j >= 0; j--) {
    if (!partsToInclude[j].user) {
      lastAssistantPartIndex = j;
      break;
    }
  }

  // Process parts in pairs: user choice followed by assistant story
  // We need to reconstruct the full GM conversation flow
  for (let i = 0; i < partsToInclude.length; i++) {
    const part = partsToInclude[i];
    const isMostRecentRound = i === lastAssistantPartIndex;

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
              ...(isMostRecentRound
                ? {
                    reasoning: msg.reasoning,
                    reasoning_details: msg.reasoning_details,
                  }
                : {}),
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
                content: cleanString(`<thinking>\n${thinking}\n</thinking>`),
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
              content: `Executing ${toolResult.toolName}`,
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
          content: cleanString(
            `<thinking>\n${part.gmStoryContext}\n</thinking>`,
          ),
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
  )}\n\n**HOW TO HANDLE THIS TURN:**
1. In <thinking>, plan the outcome. Read any titles-only Game Mechanics or notes this action actually touches first.
2. Decide whether a tool is even needed:
   - Call a dice/oracle tool ONLY if the outcome is uncertain AND a failure would change the fiction.
   - If you're about to invent an unresolved world fact, a hidden NPC reaction, or how an uncertain beat lands based on what feels safe or convenient, that's oracle territory - call \`fate_question\` with an honestly calibrated likelihood (not a reflexive 50/50) or \`roll_table\`, rather than deciding it yourself.
   - Call a state tool ONLY if something must actually change (edit the character sheet after a real stat change, update an NPC's attitude, adjust HP in combat, record a new note, etc.).
   - If neither is true, DON'T call a tool - a quiet, descriptive, or foregone-conclusion beat just gets narrated.
3. Write the short prose the player sees, reflecting any tool results.

**CRITICAL:** Keep private reasoning inside <thinking>...</thinking> tags. Everything else you write is shown to the player as-is - do not wrap it in any tag.`;

  messages.push({
    role: "user",
    content: cleanString(playerActionMessage),
  });

  // Add the <thinking> prefill ONLY for non-reasoning models. It nudges them
  // to externalize reasoning in the content channel before answering.
  // Reasoning-tier models emit their chain of thought in a native `reasoning`
  // field, so prefilling the content channel with an open <thinking> tag just
  // competes with that and risks leaking half-thoughts into player-facing
  // prose - skip it and let them answer cleanly. (May still be stripped by
  // some providers regardless.)
  if (!usesNativeReasoning) {
    messages.push({ role: "assistant", content: GM_STAGE_AFFIRMATION });
  }

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
Write immersive prose - show, don't tell, and no dice results or mechanical language.
Reveal through one concrete, specific detail rather than a label or a pile of adjectives. Vary your phrasing - don't reuse images or sentence openers from earlier turns. Stay within the length above and end on something the player can react to.`;

  const dmGuidelines = `
Write as a Dungeon Master narrating to the player. You may reference dice results naturally.
Use second person ("You swing your sword..."). Favor concrete, specific detail over generic flourish, don't recycle phrasing from earlier turns, and stay within the length above.`;

  return (
    basePrompt + (storytellerMode === "dm" ? dmGuidelines : narratorGuidelines)
  );
}
