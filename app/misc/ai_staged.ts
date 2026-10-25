import {
  StoryData,
  Choice,
  CommandResponse,
  StoryLore,
  getMemoryContent,
  MemoryEntry,
  CombatState,
  Combatant,
  CountdownTimer,
  SceneChallenge,
  PendingDirectorMove,
  StoryThread,
} from "@/app/misc/structs";
import { formatResponsesForAI } from "@/app/misc/commandResponses";
import { getModelConfig } from "@/app/misc/ai_prices";
import {
  ARCHETYPE_INFO,
  selectGMAdviceForTurn,
  formatGMAdviceNote,
} from "@/app/misc/gmAdvice";
import { formatOracleRecencyLine } from "@/app/misc/mythic";
import { formatTintLine } from "@/app/misc/primaMateria";
import {
  getSetupProgress,
  getSetupReminder,
  type SetupProgress,
} from "@/app/misc/campaignPlan";
import { cleanString } from "@/app/misc/textUtils";
import { currentThreshold, filledBoxes, normalizeKey } from "@/app/misc/metersAndTracks";
import { resolveSystem } from "@/app/misc/systems/resolve";
import {
  getCreationProgress,
  getRequiredSteps,
  isPremade,
  isStepCovered,
  setupParticipants,
  type CreationStep,
} from "@/app/misc/setupSteps";
import { GM_TOOL_SCHEMAS } from "@/app/misc/gmTools";
import {
  PINNED_TOTAL_CAP_TOKENS,
  capPinnedForGM,
  pinnedNoteWarning,
} from "@/app/misc/contextLimits";
import { TOOL_SCHEMAS } from "@/app/misc/toolSchemas";
import { estimateTokens } from "@/app/misc/tokenCounter";
import { formatCampaignBrief } from "@/app/misc/campaign/brief";
import {
  estimateRenderedPartTokens,
  renderHistoryPart,
} from "@/app/misc/historyStubs";
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
// max_tokens a GM stage round requests when no Response Length is set.
export const GM_STAGE_DEFAULT_OUTPUT = 12000;
// Floor for the GM stage's input budget, so a tiny model window or a tiny
// custom Memory Size can never leave the GM with zero (or negative) history.
export const GM_STAGE_MIN_BUDGET = 4000;

/**
 * The max_tokens a GM stage round actually requests: the user's Response
 * Length (customMaxOutput), capped by the model's own output limit.
 * `multiplier` raises it for the rest of a turn after a round was cut off
 * with nothing usable (roundCutOffEmpty, decision 196); the model's limit
 * still caps it.
 */
export function getGMStageOutputTokens(
  customMaxOutput: number | undefined,
  modelName: string,
  multiplier = 1,
): number {
  return Math.min(
    (customMaxOutput || GM_STAGE_DEFAULT_OUTPUT) * multiplier,
    getModelConfig(modelName).maxOutputTokens || 4000,
  );
}

/**
 * True when the provider cut a GM round off at max_tokens before it gave the
 * turn anything to use: no visible words, and no tool call whose arguments
 * finished (a cut-off one carries `argsTruncated`, providerCall.ts). A model
 * that thinks at a heavy effort can spend the whole Response Length thinking,
 * since thinking counts against max_tokens (decision 196).
 */
export function roundCutOffEmpty(
  finishReason: string | undefined,
  visibleText: string,
  toolCalls: readonly { argsTruncated?: boolean }[],
): boolean {
  return (
    finishReason === "length" &&
    !visibleText.trim() &&
    toolCalls.every((tc) => tc.argsTruncated === true)
  );
}

/**
 * GM Stage context budget: customMaxContext (Memory Size slider), split 60%
 * story history / 40% lore-mechanics-state. Memory Size is an *input* budget,
 * so the output reservation comes out of the model's context window, not out
 * of Memory Size - and it reserves what the round actually requests
 * (getGMStageOutputTokens), not the model's declared max output, which is
 * 100k+ on several tier models and used to push the budget negative.
 * Shared by buildGMStagePrompt and compaction.ts's compaction-budget check so
 * the two can't drift apart on what "the GM stage's history budget" means.
 */
export function computeGMStageBudget(
  customMaxContext: number | undefined,
  modelName: string,
  customMaxOutput?: number,
): { historyBudget: number; infoBudget: number; totalContextBudget: number } {
  const inputBudget =
    customMaxContext && customMaxContext > 0
      ? customMaxContext
      : GM_STAGE_DEFAULT_BUDGET;
  const modelInputLimit =
    getModelConfig(modelName).maxTokens -
    getGMStageOutputTokens(customMaxOutput, modelName);

  const totalContextBudget = Math.max(
    GM_STAGE_MIN_BUDGET,
    Math.min(inputBudget, modelInputLimit),
  );
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
 * @param measure - "prose" (default) counts the part's text plus a flat amount
 *   per tool call, which is what the choices/narration prompts send. "rendered"
 *   counts what the GM's history actually replays (historyStubs.ts: stubs, no
 *   <thinking>), so the window budgets what is sent. Rendered mode never skips
 *   a part, so the result is always a contiguous tail of `parts`.
 * @returns Array of parts that fit, preserving chronological order
 */
export function getPartsWithinTokenBudget(
  parts: StoryData["scene"]["parts"],
  tokenBudget: number,
  measure: "prose" | "rendered" = "prose",
): StoryData["scene"]["parts"] {
  if (!parts || parts.length === 0) return [];

  // Start from the end (most recent) and work backwards
  const selectedParts: StoryData["scene"]["parts"] = [];
  let totalTokens = 0;

  for (let i = parts.length - 1; i >= 0; i--) {
    const part = parts[i];
    const partText = part.raw || part.content;

    let totalPartTokens: number;
    if (measure === "rendered") {
      totalPartTokens = estimateRenderedPartTokens(part, i);
    } else {
      // Comment-only user parts have empty content; never include them in AI context.
      if (part.user && !cleanString(partText).trim()) {
        continue;
      }

      const partTokens = estimateTokens(partText);

      // Include tool call/response overhead if present
      const toolOverhead =
        (part.toolCalls?.length || 0) * 50 +
        (part.toolResponses?.length || 0) * 30;

      totalPartTokens = partTokens + toolOverhead;
    }

    if (totalTokens + totalPartTokens > tokenBudget) {
      break; // Can't fit any more
    }

    selectedParts.unshift(part); // Add to front to maintain order
    totalTokens += totalPartTokens;
  }

  return selectedParts;
}

/**
 * The GM's history (token-savings plan, slice 3; decision 94): every part after
 * `scene.summarizedThroughIndex`, a FIXED start, so between summaries the
 * history only grows at its end and the cached prefix survives. If that is over
 * `historyBudget` (a summary failed this turn, or none has run yet) it falls
 * back to the sliding window over the rendered sizes, for this turn only.
 * `startIndex` is the first returned part's position in `scene.parts`.
 */
export function getHistoryParts(
  storyData: StoryData,
  historyBudget: number,
): {
  parts: StoryData["scene"]["parts"];
  startIndex: number;
  slidingFallback: boolean;
} {
  const all = storyData.scene.parts || [];
  const startIndex = Math.min(
    Math.max(0, storyData.scene.summarizedThroughIndex || 0),
    all.length,
  );
  const fixed = all.slice(startIndex);

  let total = 0;
  for (let i = 0; i < fixed.length; i++) {
    total += estimateRenderedPartTokens(fixed[i], startIndex + i);
    if (total > historyBudget) break;
  }
  if (total <= historyBudget) {
    return { parts: fixed, startIndex, slidingFallback: false };
  }

  const slid = getPartsWithinTokenBudget(all, historyBudget, "rendered");
  return {
    parts: slid,
    startIndex: all.length - slid.length,
    slidingFallback: true,
  };
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
    // Nothing ticks a timer (status report §6.1), whatever an old save's
    // autoAdvance says (decision 178).
    const advanceNote = " (advance it yourself)";
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

/**
 * The GM's view of meters, progress tracks and the session count: one line
 * per owner for meters (hidden ones included, this is the GM's view), one
 * line per active track. Goes in the live block beside the timers, never the
 * stable prefix, so a meter tick does not re-price the cached history.
 */
export function formatMetersAndTracksState(
  storyData: Pick<StoryData, "meters" | "progressTracks" | "systemState">,
): string {
  const meters = storyData.meters || [];
  const tracks = (storyData.progressTracks || []).filter(
    (t) => t.status === "active",
  );
  const session = storyData.systemState?.sessionCount ?? 0;
  if (meters.length === 0 && tracks.length === 0) return "";

  const lines: string[] = ["## 📊 METERS & TRACKS"];
  if (session > 0) lines.push(`Session ${session + 1}`);

  const owners: string[] = [];
  for (const m of meters) {
    if (!owners.includes(m.owner)) owners.push(m.owner);
  }
  for (const owner of owners) {
    const parts = meters
      .filter((m) => m.owner === owner)
      .map((m) => {
        const t = currentThreshold(m);
        const notes: string[] = [];
        if (m.cap < m.max) notes.push(`cap ${m.cap}`);
        if (m.floor > m.min) notes.push(`floor ${m.floor}`);
        if (t) notes.push(t.label);
        if (m.hidden) notes.push("hidden");
        return `${m.name} ${m.value}/${m.max}${notes.length > 0 ? ` (${notes.join(", ")})` : ""}`;
      });
    lines.push(`${owner} - ${parts.join(" · ")}`);
  }
  for (const t of tracks) {
    const kind = t.kind.charAt(0).toUpperCase() + t.kind.slice(1);
    const boxes = filledBoxes(t.ticks);
    const extra = t.ticks % 4;
    lines.push(
      `${kind}: ${t.name} (${t.owner}) - ${t.rank}, ${boxes} box${boxes === 1 ? "" : "es"}${extra > 0 ? ` + ${extra} tick${extra === 1 ? "" : "s"}` : ""}`,
    );
  }
  return lines.join("\n");
}

/**
 * Fantastic Realms: each hero's feats, burned ones marked, and the realm. A
 * hero's name is spelled as their meters spell it. Empty for every story
 * without hero state, so it appears only in a Fantastic Realms story. Lives
 * in the live block with the meters (the cache rule).
 */
export function formatHeroFeatsState(
  storyData: Pick<StoryData, "meters" | "systemState">,
): string {
  const fr = storyData.systemState?.fantasticRealms;
  const keys = fr ? Object.keys(fr.heroes ?? {}) : [];
  if (!fr || (keys.length === 0 && !fr.realm)) return "";
  const lines: string[] = ["## 🛡️ HEROES' FEATS"];
  for (const key of keys) {
    const hero = fr.heroes[key];
    const name =
      hero.name ??
      (storyData.meters ?? []).find(
        (m) => normalizeKey(m.owner) === key && m.name === "Hearts",
      )?.owner ??
      key;
    const feats =
      hero.feats.length > 0
        ? hero.feats
            .map((f) => (f.burned ? `${f.wording} (burned)` : f.wording))
            .join(", ")
        : "none yet";
    lines.push(`${name} — feats: ${feats}`);
  }
  if (fr.realm) lines.push(`Realm: ${fr.realm}`);
  return lines.join("\n");
}

/** The active challenge as the GM sees it each turn (it used to need get_game_state). */
export function formatActiveChallengeState(
  challenge: SceneChallenge | undefined,
): string {
  if (!challenge || !challenge.active) return "";
  const head = `## ⚔️ ACTIVE CHALLENGE\n"${challenge.name}" - `;
  if (challenge.mode === "tally") {
    const tally = challenge.tally ?? 0;
    return `${head}tally, round ${(challenge.recorded ?? 0) + 1} of ${challenge.rounds}, tally ${tally > 0 ? `+${tally}` : tally} (strong hit +1, weak hit 0, miss -1)`;
  }
  const need = challenge.requiredSuccesses ?? Math.floor(challenge.rounds / 2) + 1;
  const lose = challenge.maxFailures ?? Math.floor(challenge.rounds / 2) + 1;
  return `${head}first to ${need}: ${challenge.currentSuccesses} success${challenge.currentSuccesses === 1 ? "" : "es"}, ${challenge.currentFailures} of ${lose} failures`;
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
// The campaign plan/spine + per-player arcs is pinned so the GM re-reads the
// beat it's currently running every turn (see docs/gm-plan-notes-design.md).
// Exported: the note-type table in the system prompt names these same types
// from this constant, so the text cannot drift from what the builder pins.
export const PINNED_NOTE_TYPES = [
  "dm_instructions",
  "character_sheet",
  "gm_plan",
] as const;
const BASE_PINNED_NOTE_TYPES: string[] = [...PINNED_NOTE_TYPES, "gm_notes"];

/**
 * The note-type table's one line about what the prompt carries in full, built
 * from {@link PINNED_NOTE_TYPES} so the text cannot drift from what the
 * builder pins. Exported for the tests.
 */
export const PINNED_TYPES_LINE = `Only ${PINNED_NOTE_TYPES.map((t) => `\`${t}\``).join(", ")} notes are carried in full every turn, so keep them short. Every other type, \`mechanics\` included, is listed by title: open it with \`read_notes\` when you need it.`;

// Shared pinned-note-type check, parameterized so the GM-Stage/other-stage
// difference is explicit instead of two copy-pasted closures silently
// drifting apart. `includeMechanics` only decides whether a mechanics note is
// left out of the categorised folder lists: the GM Stage lists mechanics notes
// by title in their own "rules" list (to open with read_notes), so it skips
// them there; no stage carries a mechanics note in full (only
// PINNED_NOTE_TYPES are).
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
// - Pinned types (dm_instructions, character_sheet, gm_plan): Always loaded in full
// - Folder types (lore, secret): Show titles only, use read_notes tool
// - story_instructions: NOT included here (only used by Story Stage)
export function buildInfoMessage(
  storyData: StoryData,
  embeddingContext?: EmbeddingContext, // DEPRECATED - kept for backward compat but ignored
): string {
  // ============================================
  // AGENTIC NOTE SYSTEM - Folder-based approach
  // ============================================
  // GM Stage pinned types: dm_instructions, character_sheet, gm_plan
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
      // Tables are GM-side reference material, listed in their own section of
      // the GM Stage prompt. The narrator has no use for a list of tables it
      // can't roll, and mixing them into World Lore just spends context.
      type === "table" ||
      type === "story_instructions" || // Excluded - only for Story Stage
      type === "summary_instructions" // Excluded - only the summariser reads it
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
${[formatTintLine(storyData), formatOracleRecencyLine(storyData)]
  .filter(Boolean)
  .join("\n")}`
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
      `- [${e.id}] [${e.focus || "Event"}] "${e.action} ${e.subject}"${
        e.portent ? ` — condition: ${e.portent}` : ""
      } - work this into the story, then call resolve_random_event(id: "${e.id}")`,
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

const STATE_RULE =
  "═══════════════════════════════════════════════════════════════";

/**
 * The GM request's stable block (decision 91): what changes least within a
 * story, so it sits before history and is cached with it. The player,
 * their archetype, the DM instructions, then the summary of earlier events
 * (which changes only when a summary runs, and then the history start moves
 * with it). Nothing in it may change from turn to turn on its own.
 */
export function buildStableBlock(input: {
  playerSection: string;
  archetypeSection: string;
  dmInstructions: string;
  summary?: string;
}): string {
  let out = `${STATE_RULE}\n📋 THE STORY'S FOUNDATION (changes rarely)\n${STATE_RULE}\n`;
  // Who the player character is - first, because every other section is read
  // in relation to them.
  if (input.playerSection) out += "\n" + input.playerSection + "\n\n";
  // How the player wants to be engaged (advisory)
  if (input.archetypeSection) out += input.archetypeSection + "\n\n";
  if (input.dmInstructions) out += input.dmInstructions + "\n";
  // Story-so-far summary (see compaction.ts): earlier scene history that has
  // been folded in here instead of silently disappearing.
  if (input.summary) {
    out += `\n## 📖 STORY SO FAR (summary of earlier events, no longer shown in full below)\n${input.summary}\n`;
  }
  return out;
}

/**
 * The GM request's live block: everything that can change every turn, sent
 * in the same user message as the player's action, after history. State
 * first (the character sheet and plan are the GM's own to edit, decision
 * 100; the campaign plan and the note-title lists change at beat changes and
 * whenever a note is made, so they stay out of the cached prefix), then the
 * per-turn nudges, right next to the action where models weigh text most.
 */
export interface LiveBlockInput {
  loreSection: string;
  npcList: string;
  goalsSection: string;
  threadsSection: string;
  oracleSection: string;
  combatSection: string;
  timersSection: string;
  // Meters, tracks and the active challenge (default-systems slices 2 and 4);
  // per-turn state, so they live here and never in the stable block.
  metersSection?: string;
  // The campaign brief (campaign/brief.ts): per-turn, so it lives here.
  campaignBrief?: string;
  challengeSection?: string;
  pendingEventsSection: string;
  pendingMovesSection: string;
  freshStorySetupBlock: string;
  // The adventure's character sheet template, for as long as session zero lasts.
  sheetTemplateBlock?: string;
  // The one session-zero section (buildSessionZeroBlock). While session zero
  // lasts it stands in for the four setup blocks around it, which the caller
  // then passes empty.
  sessionZeroBlock?: string;
  sessionZeroStartGameReminder: string;
  setupOverdueBlock: string;
  observerNoteBlock: string;
  storyProgressNoteBlock: string;
  repetitionNoteBlock: string;
  knowledgeNoteBlock: string;
  pacingFeedbackLine: string;
  gmAdviceSection: string;
}

/**
 * The adventure's character sheet template, shown to the GM for all of
 * session zero (so a second player at the table gets it too) and gone once
 * `start_game` ends setup. It rides in the live block because it appears and
 * disappears with the story's state. Empty when there is no template.
 */
export function buildSheetTemplateBlock(
  storyData: Pick<StoryData, "sessionZeroActive" | "characterSheetTemplate">,
): string {
  const template = storyData.characterSheetTemplate?.template;
  if (!storyData.sessionZeroActive || !template) return "";
  return `
## CHARACTER SHEET TEMPLATE
This adventure comes with a character sheet template. Build each player's sheet in this shape: fill in every field with the player in conversation. The \`| default\` values are examples, not choices made for the player. Write the finished sheet with \`create_note\` (type \`character_sheet\`), titled "Character: <name>" when more than one person is playing, one note per player.
\`\`\`
${template}
\`\`\`
`;
}

// ---- the session-zero block (docs/session-zero-design.md 3.3-3.4) ----------

/** Most tokens of read notes the setup reference carries in full. */
export const SETUP_REFERENCE_CAP_TOKENS = 6000;
/** From this many answered setup questions on, the GM is nudged to propose. */
export const SETUP_QUESTION_NUDGE_AT = 6;

// Note types the prompt already carries in full every turn.
const SETUP_REFERENCE_SKIP_TYPES: ReadonlySet<string> = new Set([
  "dm_instructions",
  "gm_notes",
  "character_sheet",
  "gm_plan",
]);

function referenceTitleKey(t: string): string {
  return t.toLowerCase().replace(/\.md$/i, "").trim();
}

function setupChecklist(p: SetupProgress): string {
  const rows: Array<[string, boolean]> = [
    ["Concept (the player's style and idea)", p.concept],
    ...(p.creation.total > 0
      ? ([
          [
            `Setup steps (${p.creation.covered}/${p.creation.total} asked and answered)`,
            p.creation.missing.length === 0,
          ],
        ] as Array<[string, boolean]>)
      : []),
    ["Character (a sheet for every player)", p.character],
    ["Campaign (the Campaign Plan note)", p.campaign],
    ["Approval (the player pressed Start on the setup card)", p.approved],
    ["Start (start_game)", p.started],
  ];
  let arrowPlaced = false;
  return rows
    .map(([label, done]) => {
      if (done) return `✓ ${label}`;
      if (!arrowPlaced) {
        arrowPlaced = true;
        return `→ ${label}`;
      }
      return `· ${label}`;
    })
    .join("\n");
}

/**
 * The creation steps this mode requires, with a mark for each (step, player):
 * ✓ covered, → the next to ask, · still to come (setupSteps.ts). Empty when
 * the mode requires none.
 */
function creationStepList(story: StoryData): string {
  const { missing, total } = getCreationProgress(story);
  if (total === 0) return "";
  const first = missing[0];
  const people = setupParticipants(story);
  const mark = (step: CreationStep, playerId?: string): string => {
    if (isStepCovered(story, step, playerId)) return "✓";
    return first && first.step.id === step.id && first.playerId === playerId
      ? "→"
      : "·";
  };
  const rows = getRequiredSteps(story).map((step) =>
    step.scope === "table"
      ? `- ${step.id}: ${mark(step)}`
      : `- ${step.id}: ${people.map((p) => `${p.name} ${isPremade(story, p.id) ? "(covered by the pre-made sheet)" : mark(step, p.id)}`).join(", ")}`,
  );
  return `SETUP STEPS (✓ asked and answered, → ask next, · still to come):\n${rows.join("\n")}`;
}

/** The rules for asking the steps, and the one to ask now. */
function creationRules(
  progress: SetupProgress,
  mode: "quick" | "full",
): string {
  const next = progress.creation.missing[0];
  const lines: string[] = [];
  lines.push(
    `TAGGING: put \`setup_step\` (the step's id, from the list) on every \`ask_question\` item that covers a step. The engine counts a step only when it is tagged and answered; an untagged question counts for nothing.${mode === "quick" ? " In quick setup the steps are setting and tone: ask both, tagged." : ""}`,
  );
  if (mode === "full") {
    lines.push(
      "- Table and world steps (setting, tone, campaign, cohort) may be batched in one `ask_question`, each under its own tag. A character step (name and look, history, drives, abilities) is asked one at a time: never two different character tags in one call, and never mixed with another. Several questions under the same tag are fine (all must be answered).",
      "- Always give `intro`: one or two sentences on what is being chosen and why it matters. Give 2-4 options whose descriptions say what each does in play, mechanics and flavour.",
      "- Creative steps (the table, world, name and look, history, drives): offer 2-4 suggestions and set allow_custom true. Tone is a multi_select.",
      "- With several players, a player step carries target_player_name (the player it is for) on every item; table steps are untargeted. Table steps first, then each player in turn.",
    );
  }
  if (next) {
    lines.push(
      `NEXT STEP TO ASK: ${next.step.id}${next.player ? ` (${next.player})` : ""}. ${next.step.hint}`,
    );
  } else if (mode === "full") {
    lines.push(
      "Every step is covered: write the sheet and the plan from the answers, then confirm_setup.",
    );
  }
  return lines.join("\n");
}

function setupNextStep(
  progress: SetupProgress,
  mode: "quick" | "full",
): string {
  switch (progress.next) {
    case "interview":
      return mode === "full"
        ? `NEXT: the setup steps, one at a time (list and rules below). Do not write the sheet or the plan, and do not call confirm_setup, until every step is covered.`
        : `NEXT: ask the setup questions below, tagged, with \`ask_question\` (2-4 short questions in all; choices the player can tap, a custom answer allowed). Then move on to the character.`;
    case "concept":
      return mode === "full"
        ? `NEXT: the concept. Ask the player the first creation step with \`ask_question\` (2-4 options plus a custom answer; allow several answers where that fits (multi_select)). One question per step.`
        : `NEXT: the concept. Ask 2-4 short questions with \`ask_question\` (genre or setting, tone, the kind of character) - choices the player can tap, with a custom answer allowed; allow several answers where that fits (multi_select). Then move on to the character.`;
    case "character": {
      const who =
        progress.missingSheetFor.length > 0
          ? ` Still missing a sheet: ${progress.missingSheetFor.join(", ")}.`
          : "";
      return mode === "full"
        ? `NEXT: the character. Every step is covered, so write the sheet from the template with \`create_note\` (type \`character_sheet\`), titled "Character: <name>" when more than one person is playing, one per player.${who}`
        : `NEXT: the character. Propose a complete one from the answers so far and write it from the template with \`create_note\` (type \`character_sheet\`), titled "Character: <name>" when more than one person is playing, one per player.${who}`;
    }
    case "campaign":
      return `NEXT: the campaign. \`read_notes\` the existing lore, mechanics and setting notes, then \`create_note({ type: "gm_plan", title: "Campaign Plan", planSpineLength: "short"|"medium"|"long", content: ... })\` with the premise and ONLY the Opening Image beat detailed (see the CAMPAIGN PLAN section for the rules). The player sees this plan on the setup card: write it in what the characters know, and put the truths, the secrets and the possible endings in a \`secret\` note instead.`;
    case "confirm":
      return `NEXT: ask the player's OK. Call \`confirm_setup({ character_summary, campaign_hook, story_name, premise })\` with a short summary of the character (name, kind, the hook of their background), one or two sentences on the campaign (what the characters know, no secrets or endings), a short title for the story and a one-to-three sentence premise. The player sees a card with Start the story / Change something. When they press Start the game starts by itself: write the campaign intro in that same turn. If they ask for changes, edit the sheet or the plan, then call \`confirm_setup\` again.`;
    case "start_game":
      return `NEXT: the player approved. Call \`start_game\` now with a title for the story and a short premise summary. After it succeeds, give the campaign intro: a short briefing (who they are, where they are, what is at stake and why they are here), then the opening scene, ending on a clear first choice.`;
    default:
      return "";
  }
}

function setupModeLines(mode: "quick" | "full"): string {
  if (mode === "full") {
    return `MODE: step by step.
- Ask the setup steps (listed below) in order before writing anything: character steps one per \`ask_question\` call, table and world steps may share a call.
- Each question offers 2-4 options and a custom answer; never fill in a choice the player did not make.
- Write the sheet only after every step is covered, then the plan from what you learned.
- Keep each reply short: the question, no story.`;
  }
  return `MODE: quick setup.
- Ask only 2-4 short questions with \`ask_question\`, then PROPOSE: make the choices the player left open yourself.
- Write the sheet and the plan without asking about every field. The player can change anything on the setup card.
- Use the creation rules (below, when present) as grounding for what is legal, not as a script to walk through.
- Keep each reply short: the question or the proposal, no story.`;
}

function findEnabledNoteByTitle(
  lore: StoryLore[],
  title: string,
): StoryLore | undefined {
  const key = referenceTitleKey(title);
  return lore.find(
    (n) => n.enabled !== false && referenceTitleKey(n.title) === key,
  );
}

function renderReferenceNote(n: StoryLore): string {
  const hidden =
    n.visibility === "hidden" ||
    n.visibility === "to_be_revealed" ||
    n.visibility === "check_per_turn";
  return hidden
    ? `### ${n.title} [[HIDDEN_LORE:${n.title}]]\n(HIDDEN FROM PLAYER - do not narrate this content or reveal its existence.)\n${n.content}[[/HIDDEN_LORE]]`
    : `### ${n.title}\n${n.content}`;
}

/**
 * The setup reference: the notes the GM read during session zero, newest
 * first, one per title, in full until `capTokens`, then listed by title. The
 * creation note and the notes the prompt already carries in full are left out,
 * as are disabled and deleted ones.
 */
export function buildSetupReference(
  story: Pick<StoryData, "lore" | "setup">,
  skipNoteId?: string,
  capTokens: number = SETUP_REFERENCE_CAP_TOKENS,
): string {
  const lore = story.lore ?? [];
  const seen = new Set<string>();
  const notes: StoryLore[] = [];
  for (const title of story.setup?.referenceTitles ?? []) {
    const key = referenceTitleKey(title);
    if (seen.has(key)) continue;
    seen.add(key);
    const n = findEnabledNoteByTitle(lore, title);
    if (!n) continue;
    if (skipNoteId && n.libraryNoteId === skipNoteId) continue;
    if (SETUP_REFERENCE_SKIP_TYPES.has(n.type ?? "lore")) continue;
    notes.push(n);
  }
  if (notes.length === 0) return "";

  let used = 0;
  let overflow = false;
  const full: string[] = [];
  const byTitle: string[] = [];
  for (const n of notes) {
    const rendered = renderReferenceNote(n);
    const cost = estimateTokens(rendered);
    if (!overflow && used + cost <= capTokens) {
      full.push(rendered);
      used += cost;
    } else {
      overflow = true;
      byTitle.push(`- ${n.title}: read_notes it again if you need it`);
    }
  }
  let out = `## SETUP REFERENCE (notes you read during setup, newest first)\n`;
  if (full.length > 0) out += full.join("\n\n") + "\n";
  if (byTitle.length > 0) {
    out += `\nToo long to carry here:\n${byTitle.join("\n")}\n`;
  }
  return out;
}

/**
 * The one session-zero section of the live block: where setup stands, what to
 * do next, the rule that nothing is narrated yet, the mode, the sheet
 * template, the system's creation rules and the notes read so far. Per-turn
 * by nature, so it rides in the live block and leaves with `start_game`.
 */
export function buildSessionZeroBlock(story: StoryData): string {
  const progress = getSetupProgress(story);
  const mode = story.setup?.mode ?? "quick";
  const resolved = resolveSystem(story);
  const lore = story.lore ?? [];

  let out = `\n## 🎭 SESSION ZERO - SETTING UP THE STORY\n${setupChecklist(progress)}\n\n${setupNextStep(progress, mode)}\n\n`;
  out += `RULE: until \`start_game\` succeeds you never narrate the story. Every turn you either ask the player (\`ask_question\`), do a setup step (write the sheet or the plan) or call \`confirm_setup\`. A short out-of-character line is fine. Do not describe scenes, play out events or roll for the story yet.\n\n`;
  out += setupModeLines(mode) + "\n";

  const stepList = creationStepList(story);
  if (stepList) out += `\n${stepList}\n`;
  out += `\n${creationRules(progress, mode)}\n`;

  const template =
    story.characterSheetTemplate?.template || resolved.system?.sheetTemplate;
  if (template) {
    out += `\n## CHARACTER SHEET TEMPLATE\nBuild each player's sheet in this shape: fill in every field with the player in conversation. The \`| default\` values are examples, not choices made for the player. Write the finished sheet with \`create_note\` (type \`character_sheet\`), titled "Character: <name>" when more than one person is playing, one note per player.\n\`\`\`\n${template}\n\`\`\`\n`;
  }

  const creationId = resolved.system?.creationNoteId;
  if (creationId) {
    const creation = lore.find(
      (n) => n.enabled !== false && n.libraryNoteId === creationId,
    );
    if (creation) {
      out += `\n## CREATION RULES (carried in full while you set up; no need to read_notes this)\n${renderReferenceNote(creation)}\n`;
    }
  }

  const reference = buildSetupReference(story, creationId);
  if (reference) out += "\n" + reference;

  const asked = story.setup?.questionsAsked ?? 0;
  // Step by step has its own end: every step covered (creationRules). The
  // nudge to propose is for quick setup only.
  if (mode !== "full" && asked >= SETUP_QUESTION_NUDGE_AT) {
    out += `\nYou have asked ${asked} setup questions. Enough: stop asking, make the remaining choices yourself and propose the character and the campaign now.\n`;
  }
  return out;
}

/** One thread's description is cut past this many characters. */
export const THREAD_DESCRIPTION_CAP_CHARS = 600;
/** The threads section as a whole is held to about this many tokens. */
export const THREADS_SECTION_CAP_TOKENS = 2000;

/**
 * A thread description cut at a sentence boundary within the cap. The thread
 * keeps its whole text; there is no tool that reads it back, so the marker
 * only says the text was cut for length.
 */
function capThreadDescription(description: string): string {
  const text = description ?? "";
  if (text.length <= THREAD_DESCRIPTION_CAP_CHARS) return text;
  const head = text.slice(0, THREAD_DESCRIPTION_CAP_CHARS);
  const sentenceEnd = Math.max(
    ...[". ", "! ", "? ", ".\n", "!\n", "?\n"].map((s) => head.lastIndexOf(s)),
  );
  const cutAt =
    sentenceEnd > 0 ? sentenceEnd + 1 : Math.max(head.lastIndexOf(" "), 1);
  return `${head.slice(0, cutAt).trimEnd()} … (cut for length)`;
}

/**
 * The live block's active-threads section: every description whole up to the
 * cap, main threads first, and the section held to
 * THREADS_SECTION_CAP_TOKENS. Threads that do not fit are counted, not shown.
 */
export function renderThreadsSection(
  threads: readonly StoryThread[],
): string {
  if (threads.length === 0) return "";
  const rank = { main: 0, side: 1, background: 2 } as const;
  const ordered = [...threads].sort(
    (a, b) => rank[a.priority || "side"] - rank[b.priority || "side"],
  );
  const heading = "## 🧵 Active Story Threads";
  const lines: string[] = [];
  let used = estimateTokens(heading);
  let left = 0;
  for (const t of ordered) {
    const line = `- [${t.priority || "side"}] ${t.title}: ${capThreadDescription(t.description)}`;
    const cost = estimateTokens(line);
    if (left === 0 && used + cost <= THREADS_SECTION_CAP_TOKENS) {
      lines.push(line);
      used += cost;
    } else {
      left++;
    }
  }
  if (left > 0) {
    lines.push(
      `- … ${left} more active thread${left === 1 ? "" : "s"} not shown here (lowest priority first cut).`,
    );
  }
  return `${heading}\n${lines.join("\n")}`;
}

export function buildLiveBlock(input: LiveBlockInput): string {
  let out = `${STATE_RULE}\n📋 LIVE GAME STATE (this turn)\n${STATE_RULE}\n`;
  if (input.loreSection) out += "\n" + input.loreSection + "\n";
  if (input.npcList) {
    out += `## 👥 NPCs Summary (read their notes for more details)\n- ${input.npcList}\n\n`;
  }
  if (input.goalsSection) out += input.goalsSection + "\n\n";
  if (input.threadsSection) out += input.threadsSection + "\n\n";
  if (input.oracleSection) out += input.oracleSection + "\n\n";
  if (input.combatSection) out += input.combatSection + "\n";
  if (input.timersSection) out += input.timersSection + "\n";
  if (input.metersSection) out += input.metersSection + "\n";
  if (input.campaignBrief) out += input.campaignBrief + "\n";
  if (input.challengeSection) out += input.challengeSection + "\n";
  // Pending random events / director moves - must be addressed
  if (input.pendingEventsSection) out += input.pendingEventsSection + "\n\n";
  if (input.pendingMovesSection) out += input.pendingMovesSection + "\n\n";

  // Per-turn nudges, kept verbatim (they used to sit inside the system
  // prompt, which made it different every turn).
  const nudges =
    (input.sessionZeroBlock ?? "") +
    input.freshStorySetupBlock +
    (input.sheetTemplateBlock ?? "") +
    input.sessionZeroStartGameReminder +
    input.setupOverdueBlock +
    input.observerNoteBlock +
    input.storyProgressNoteBlock +
    input.repetitionNoteBlock +
    input.knowledgeNoteBlock +
    (input.pacingFeedbackLine
      ? `\n\n## 📏 PACING NOTE (this turn)${input.pacingFeedbackLine}`
      : "") +
    input.gmAdviceSection;
  if (nudges) out += nudges.replace(/^\n+/, "\n") + "\n";
  return out;
}

/**
 * The title list for one category of notes in the live block (Blood & Bone
 * expansion E1, design 3.1). A note the story wrote keeps its own line. Notes
 * that came from a built-in pack (`libraryNoteId` starting "builtin:") are
 * folded into one line per shared title prefix: the part before " — " said
 * once, the rest joined with "; " (a title may hold a comma). A pack that
 * grows to hundreds of notes then costs a few lines, not one per note, and
 * the line says how to rebuild the exact title. Pure, and per-turn text, so
 * it belongs in the live block only.
 */
export function renderNoteTitleList(
  notes: { title: string; libraryNoteId?: string }[],
  noun: string,
): string {
  const lines: string[] = [];
  const groups = new Map<string, string[]>();
  for (const n of notes) {
    const sep = n.title.indexOf(" — ");
    if (!isBuiltinNote(n) || sep <= 0 || sep + 3 >= n.title.length) {
      lines.push(`- ${n.title}.md`);
      continue;
    }
    const prefix = n.title.slice(0, sep);
    const list = groups.get(prefix) ?? [];
    list.push(n.title.slice(sep + 3));
    groups.set(prefix, list);
  }
  for (const [prefix, rest] of groups) {
    lines.push(
      `- ${prefix} ${noun} (read_notes "${prefix} — <name>", <name> as listed here): ${rest.join("; ")}`,
    );
  }
  return lines.join("\n");
}

const isBuiltinNote = (l: { libraryNoteId?: string }) =>
  typeof l.libraryNoteId === "string" && l.libraryNoteId.startsWith("builtin:");
const isBuiltinCreationPrompts = (l: { title: string; libraryNoteId?: string }) =>
  isBuiltinNote(l) && l.title.includes(" — Creation prompts: ");

export function buildGMStagePrompt({
  storyData,
  userChoice,
  customMaxContext,
  customMaxOutput,
  modelName = "DeepSeek V4 Flash",
  replyLength = "medium",
  pacingNote,
  observerNote,
  storyProgressNote,
  repetitionNote,
  knowledgeNote,
  usesNativeReasoning = false,
  imageToolAvailable = false,
  imagesPerScene = 2,
}: {
  storyData: StoryData;
  userChoice: string;
  // generate_image (docs/image-generation-design.md §3.1): offered, and its
  // prompt section written, only when pictures are on and the player has a key
  // for a provider that could paint them (imageSettings.isImageToolAvailable).
  // Otherwise the model would be told about a tool it cannot call. Fixed for a
  // turn, so the base messages stay byte-identical across its rounds.
  imageToolAvailable?: boolean;
  imagesPerScene?: number; // The per-scene cap the prompt states
  customMaxContext?: number; // Memory Size slider - this is the main context control now
  customMaxOutput?: number; // Response Length - the output reserved out of the model's window
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
    computeGMStageBudget(customMaxContext, modelName, customMaxOutput);

  // History is every part after the summary (a fixed start, so the prefix only
  // grows at its end between summaries); only if that overflows the budget
  // (a summary failed this turn) does it fall back to a sliding window.
  const {
    parts: recentParts,
    startIndex: historyStartIndex,
    slidingFallback: historySlidingFallback,
  } = getHistoryParts(storyData, historyBudget);

  // ============================================
  // AGENTIC NOTE SYSTEM for GM Stage
  // ============================================
  // Helper to check if a note type is "pinned" (always loaded in full).
  // The flag only keeps mechanics notes out of the categorised lists below:
  // they are listed by title as "rules" (renderNoteTitleList), not carried in
  // full. Only PINNED_NOTE_TYPES go in full.
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

  // 📌 Game Mechanics - listed by title only below; read with read_notes
  const mechanicsLore = (storyData.lore || []).filter(
    (l) => l.enabled !== false && l.type === "mechanics",
  );

  // 📌 Campaign Plan - sent in full (shortened only past the pinned cap, which
  // keeps its current beat; spine + per-player arcs + any open side beat). See docs/gm-plan-notes-design.md.
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
      table: [],
    };
    for (const l of notes || []) {
      if (l.enabled === false) continue;
      if (isPinnedType(l.type)) continue; // Skip pinned types
      if (l.type === "summary_instructions") continue; // The summariser's, never the GM's
      const type = l.type || "lore";
      if (type === "secret") {
        categories.secret.push(l);
      } else if (type === "table") {
        categories.table.push(l);
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

  // Pinned notes: Full content. The DM instructions rarely change, so they go
  // in the stable block (before history); the character sheet and the plan
  // are edited by the GM itself, so they ride in the live block (decision 100).
  // Together the pinned notes are capped (decision 96): past the cap each is
  // shortened in this prompt only, with a pointer to read_notes for the rest.
  const pinnedForGM = [...dmInstructionsLore, ...characterSheetLore, ...gmPlanLore];
  const cappedPinned = capPinnedForGM(storyData.lore || []);
  const pinnedCutTokens = [...cappedPinned.values()].reduce((sum, n) => sum + n.cutTokens, 0);
  const pinnedContent = (l: (typeof pinnedForGM)[number]): string =>
    cleanString(cappedPinned.get(l)?.content ?? l.content);

  let dmInstructionsSection = "";
  if (dmInstructionsLore.length > 0) {
    dmInstructionsSection += `## 📌 DM INSTRUCTIONS\nRead these guidelines every turn. They define how to run this adventure.\n`;
    for (const l of dmInstructionsLore) {
      dmInstructionsSection += `\n### ${l.title}.md\n${pinnedContent(l)}\n`;
    }
  }
  if (characterSheetLore.length > 0) {
    loreSection += `\n## 📌 CHARACTER SHEET\nThe player's character details - traits, background and whatever the sheet note tracks (wounds, resources, gear).\nThis is not opening-scene set dressing: the player picked these, and they expect them to keep mattering. Every turn, let the sheet decide something concrete - which skill/stat a roll uses and at what difficulty, whether an NPC recognises a title or a reputation, what a flaw or bond costs them right now, what their background lets them notice that someone else wouldn't. If a turn could have gone the same way for any character at all, you didn't use it.\nTo update: edit_note("title", content="new content") - keep what changes (wounds, resources, gear) current in the sheet!\n`;
    for (const l of characterSheetLore) {
      loreSection += `\n### ${l.title}.md\n${pinnedContent(l)}\n`;
    }
  }

  // Campaign Plan: Full content. This is the GM's living plan - the campaign
  // spine (only the current beat detailed, future beats one-liners) plus one
  // arc note per player. The GM follows it one beat ahead and edits it as the
  // story advances. See docs/gm-plan-notes-design.md.
  if (gmPlanLore.length > 0) {
    const activeSideBeat = storyData.activeSideBeatTitle;
    const plan = storyData.planState;
    loreSection += `\n## 📌 CAMPAIGN PLAN\nYour living plan for this campaign - a situation, not a script. Keep it current with edit_note.\n- The Spine is a PREDICTION of the drama, not a track: when play diverges, rewrite the remaining beats rather than steering players back.\n- Detail ONLY the current beat in full; future beats stay one-liners until you reach them.\n- Tick checklist items ([ ] -> [x]) as they happen. When the current beat's "advance-on" trigger (player action OR time/consequence) is met: call \`advance_plan\` (complete_current), then \`advance_plan\` (write_next) with the next beat detailed - do both before narrating onward.\n- A Front is a \`front\` part plus a clock, kept with \`campaign\`. The engine ticks a clock on its triggers (miss, scene, rest, session); tick a [manual] clock yourself with \`campaign\` tick (or \`manage_timer\` advance), and rewrite a Front's steps when the players neutralize its cause.\n`;
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
      loreSection += `\n### ${l.title}.md${focusMark}\n${pinnedContent(l)}\n`;
    }
  }

  // Mechanics notes: Titles only (use read_notes to view)
  if (mechanicsLore.length > 0) {
    loreSection += `\n## 📁 GAME MECHANICS (use read_notes to view rules, always read the rules before doing anything with mechanics.)\n`;
    loreSection += renderNoteTitleList(mechanicsLore, "rules");
    loreSection += "\n";
  }

  // Folder notes by category: Titles only
  if (noteCategories.npc.length > 0) {
    loreSection += `\n## 👤 NPC NOTES (NPC summaries; read the note for more)\n`;
    loreSection += renderNoteTitleList(noteCategories.npc, "NPC notes");
    loreSection += "\n";
  }
  if (noteCategories.location.length > 0) {
    loreSection += `\n## 📍 LOCATION NOTES (use read_notes to view)\n`;
    loreSection += renderNoteTitleList(noteCategories.location, "locations");
    loreSection += "\n";
  }
  if (noteCategories.item.length > 0) {
    loreSection += `\n## 🎒 ITEM NOTES (use read_notes to view)\n`;
    loreSection += renderNoteTitleList(noteCategories.item, "items");
    loreSection += "\n";
  }
  if (noteCategories.faction.length > 0) {
    loreSection += `\n## ⚔️ FACTION NOTES (use read_notes to view)\n`;
    loreSection += renderNoteTitleList(noteCategories.faction, "factions");
    loreSection += "\n";
  }
  if (noteCategories.event.length > 0) {
    loreSection += `\n## 📜 EVENT NOTES (use read_notes to view)\n`;
    loreSection += renderNoteTitleList(noteCategories.event, "events");
    loreSection += "\n";
  }
  if (noteCategories.lore.length > 0) {
    loreSection += `\n## 📁 WORLD LORE (use read_notes to view)\n`;
    loreSection += renderNoteTitleList(noteCategories.lore, "lore");
    loreSection += "\n";
  }
  if (noteCategories.secret.length > 0) {
    loreSection += `\n## 🔒 SECRETS (use read_notes to view)\n`;
    loreSection += renderNoteTitleList(noteCategories.secret, "secrets");
    loreSection += "\n";
  }
  // This adventure's random tables. They're notes, so `roll_table` doesn't
  // touch them - the GM reads one and rolls it with formula_roll. A built-in
  // pack's character-creation prompts are tables too, but are used while
  // building a character, not rolled mid-scene, so they get their own label.
  const creationPromptNotes = noteCategories.table.filter(isBuiltinCreationPrompts);
  const rollableTables = noteCategories.table.filter(
    (l) => !isBuiltinCreationPrompts(l),
  );
  if (rollableTables.length > 0) {
    loreSection += `\n## 🎲 TABLES (use read_notes to view, then roll the die the note names with formula_roll and read off the result. When one of these covers what you need, such as a name, a face, a place or a rumour, roll it rather than inventing the answer or calling generate_name)\n`;
    loreSection += renderNoteTitleList(rollableTables, "tables");
    loreSection += "\n";
  }
  if (creationPromptNotes.length > 0) {
    loreSection += `\n## 🎭 CHARACTER CREATION PROMPTS (use read_notes to view; for building a character)\n`;
    loreSection += renderNoteTitleList(creationPromptNotes, "character creation prompts");
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
  // With a campaign record the timers are clocks, shown in the campaign brief.
  const timersSection = storyData.campaign
    ? ""
    : formatTimersState(storyData.timers);

  // Meters, tracks and the active challenge: shown whenever there is
  // something to show, whether or not the system tools are offered.
  const metersSection = [
    formatMetersAndTracksState(storyData),
    formatHeroFeatsState(storyData),
  ]
    .filter(Boolean)
    .join("\n");
  const challengeSection = formatActiveChallengeState(storyData.activeChallenge);

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
      `- [${e.id}] [${e.focus || "Event"}] "${e.action} ${e.subject}"${
        e.portent ? ` — condition: ${e.portent}` : ""
      } - work this into the story, then call resolve_random_event(id: "${e.id}")`,
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

  const gmActiveThreads = (storyData.threads || []).filter(
    (t) => t.status === "active",
  );
  const gmThreadsSection = renderThreadsSection(gmActiveThreads);

  // Oracle/chaos state (Mythic chaos factor): drives fate_question odds and
  // signals how unpredictable the world should feel right now. The GM rolls
  // the oracle, so it needs the current factor - another buildInfoMessage-only
  // section the GM stage was missing.
  const gmOracleSection = storyData.agmtState
    ? `## 🎲 Oracle State\n- Chaos Factor: ${
        storyData.agmtState.chaosFactor
      }/9 (${getChaosDescription(storyData.agmtState.chaosFactor)})\n- Scene Count: ${
        storyData.agmtState.sceneCount
      }\n${[formatTintLine(storyData), formatOracleRecencyLine(storyData)]
        .filter(Boolean)
        .join("\n")}`
    : "";

  // 🆕 Fresh story setup: no character_sheet note exists yet, meaning this
  // story hasn't been set up (e.g. a "Freeform Story" started with no
  // premise/adventure). Nudge the GM to interview the player briefly before
  // establishing the world, instead of narrating a full opening blind.
  const freshStorySetupBlock =
    characterSheetLore.length === 0
      ? `\n## 🆕 FRESH STORY - SETUP NEEDED
This story has no character sheet yet.
- If the player's message gives no genre, tone or character concept, ask up to three short questions with \`ask_question\` and do not narrate an opening scene yet.
- \`read_notes\` any notes the story already holds, then write the \`character_sheet\` note (from the CHARACTER SHEET TEMPLATE below when there is one) and the "Campaign Plan" note (type \`gm_plan\`, only the Opening Image beat detailed), both with \`create_note\`.
- Then narrate the opening scene.
`
      : "";

  // Session zero already done via the creation wizard (character_sheet note
  // exists), but the story hasn't formally started yet - freshStorySetupBlock
  // above doesn't fire in this case, so this is the only nudge telling the GM
  // to call start_game before narrating the opening scene.
  const sessionZeroStartGameReminder =
    storyData.sessionZeroActive && characterSheetLore.length > 0
      ? `\n## 🎬 START OF PLAY\nThis story has its character sheet but not its campaign plan. \`read_notes\` the notes it holds, write the "Campaign Plan" note (type \`gm_plan\`, only the Opening Image beat detailed) with \`create_note\`, then call \`confirm_setup\` so the player can approve the setup and start the game.\n`
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
      }\nThis story is ${setupReminder.turns} player turns old and setup is not done:
${
  setupReminder.missingPlan
    ? `- **No campaign plan exists.** \`read_notes\` the notes the story holds, then write the "Campaign Plan" note (type \`gm_plan\`, only the Opening Image beat detailed) with \`create_note\`.\n`
    : ""
}${
        setupReminder.missingStart
          ? `- **The player has not approved the setup.** Call \`confirm_setup\` so they can review the sheet and the plan and start the game.\n`
          : ""
      }${
        setupReminder.level === "urgent"
          ? `Do this in this turn's tool calls, before any further narration.`
          : `Do this alongside this turn's narration.`
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

  // Pictures (generate_image): the prompt section exists only when the tool is
  // offered, so a player without pictures sees exactly the prompt they had.
  const imageSection = imageToolAvailable
    ? `### Pictures (generate_image)
- You can paint a picture for the player with \`generate_image\`: a scene, an NPC's portrait, the player character's portrait, or a place. Use it at moments that matter - the first arrival somewhere that matters, an NPC's first time on screen, a reveal or a set piece - and never on routine turns. The engine allows at most ${imagesPerScene} per scene and refuses the rest.
- The picture is made in the background and appears under this turn. **Don't describe it in your prose** and don't mention that you made it - narrate as you normally would.
- Describe what a camera would see (who, where, the light, the mood). No text, captions or lettering in the picture. Keep it non-explicit: nothing sexual, and no gore beyond what a fantasy book cover would show.
- A named NPC who already has a portrait is refused ("already has one"); pass \`featuring\` with NPC ids (and "player") for anyone who appears in a scene picture.

`
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

  // Nothing per-turn lives in the system prompt (decision 91): the setup
  // blocks, the observer/progress/repetition/knowledge notes, the pacing line
  // and the GM tip all ride in the live block next to the player's action
  // (buildLiveBlock), so this text is byte-identical from turn to turn.
  const systemPrompt = `You ARE the Game Master. Run this like a real tabletop session.

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

## LENGTH & PACING
A real tabletop GM talks in a few sentences and hands the mic back - they don't narrate a mini scene around every action. Match your narration length to the moment, and end the instant the player has something to react to:
- Routine action or quick line of dialogue: ${lengthGuidance.routine}
- Notable action with an NPC reaction: ${lengthGuidance.notable}
- Combat beat, big reveal, or emotional climax: ${lengthGuidance.climax}
These are hard ceilings, not targets to fill. Never pad a turn to hit a length bracket, and never write a second scene/beat "for free" just because you have room left - stop at the decision point even if that's one sentence of NPC dialogue.

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
- Answer what the player asks. When the character has learned or can see a thing (a name on a stone, a number, a face) and the player asks for it, say it plainly; keep the mystery in why it matters.
- Show every roll's outcome in the prose: a strong hit visibly gets the character what they wanted, a match visibly adds its extra.
- No bookkeeping in the story: never a table's result number ("the fourteenth line"), never a note to the player such as "(Nothing has been rolled yet)". A round that only reads notes or rolls writes no prose; tell the beat once, after the results.

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
- Use \`get_game_state\` to re-check the CURRENT live volatile state (active challenge counts, combat HP/turn order, timers, goals, threads) after you've changed it this turn - the state in the live block is a snapshot from turn-start and goes stale once you roll or advance combat

### Creating Records
- **New enemy encountered without stats**: Create a note with their combat stats (HP, attacks, abilities)
- **Meet a named NPC**: Use \`add_npc\` to track them (name, role, attitude, description)
- **Discover new location/faction/item**: Create a note documenting it

### Updating Records
- **Enemy HP changes**: Use \`update_combatant_stat\` during combat
- **NPC attitude/relationship changes**: Use \`update_npc\`
- **Character sheet changes**: Use \`edit_note\` to keep the character sheet note current (wounds, resources, gear)
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
- **Behind the screen**: use \`gm_roll\` when the player *knowing a roll happened* would itself give the game away - a hidden Perception check, whether a lie lands, whether the patrol notices them, whether something offscreen goes their way. A player who sees you roll knows there was something to find, whatever the total said. Then narrate only what the character perceives: on a failed hidden check describe the scene as ordinary, never "you notice nothing unusual". Everything the player openly attempts stays on \`formula_roll\` - secrecy protects surprises, it isn't for dodging scrutiny.
- **Routine actions**: No roll needed - just narrate success${manualDiceSection}

### Tables (USE THEM - DON'T JUST IMPROVISE)
- Before inventing random content (loot, encounters, NPC traits, weather, complications, plot twists, rumors, etc.), check whether a relevant table exists and roll on it instead of making it up.
- **This adventure's own tables are notes** (the 🎲 Tables section of your notes) and take priority - check those first. You roll them yourself: read the note, roll the die it names with \`formula_roll\`, and read off the entry that came up. The note is prose, so read what it says around the listing too - when to roll it, what the results mean, whether an entry sends you somewhere else.
- **Built-in AGMT tables** are the fallback, rolled with \`roll_table\` (character traits, locations, plot twists, magic items, and more - see the tool description for the full list).
- Only improvise freely when no matching table exists. Tables keep the world feeling alive and unpredictable instead of relying on the same GM instincts every time.

### Naming (DON'T REACH FOR THE FIRST NAME THAT COMES TO MIND)
- **Before naming any new NPC, place, faction, creature or notable object**, call \`generate_name\` and build the name from the pointers it gives you. The first name that surfaces on its own is almost always one you've used a hundred times before - Elara, Kael, Lyra, Thorne, Ravenwood - and a cast of those reads as generic no matter how good the prose around it is.
- The pointers are a starting letter and syllable count per part (**binding** - the name you write must match them), plus seed sounds (**inspiration only** - reshape them completely if that's what the setting needs).
- The roll deliberately steers away from letters already used in this story, so the cast stays distinguishable. Pass \`flavor\` to keep the result in the right cultural register, and \`starts_with\` only when a letter genuinely must be fixed (a sibling of an existing NPC, a clan naming convention).
- A name the player already knows is a name that exists - don't re-roll established NPCs or places, only new ones.

${imageSection}### State Changes
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
| \`npc\` | Character details, stats | "<NPC name>", "<NPC name and role>" |
| \`location\` | Places, regions, buildings | "<Region name>", "<Building name>" |
| \`item\` | Artifacts, equipment | "<Item name>", "<Item name and place>" |
| \`faction\` | Organizations, guilds | "<Faction name>", "<Faction name and rank>" |
| \`event\` | Historical events | "<Event name>" |
| \`lore\` | General world-building | "<Custom or topic>", "<War or era name>" |
| \`secret\` | GM-only hidden info | "The villain's true identity" |
| \`dm_instructions\` | GM guidance | "<Rule set> Guidelines" |
| \`character_sheet\` | The player character | "<Character name>" |
| \`mechanics\` | Game rules | "<System> Rules" |
| \`gm_plan\` | Campaign spine and per-player arcs | "Campaign Plan", "Arc - <Character name>" |

${PINNED_TYPES_LINE}

**Example:** \`create_note({ title: "<NPC name>", content: "...", type: "npc" })\`

## 📋 CAMPAIGN PLAN (situations, not scripts)
You keep a living plan the way a modern tabletop GM does: it describes a **situation** the players act on, not a **plot** they get marched through. It's the single \`gm_plan\` note titled "Campaign Plan", plus one \`gm_plan\` arc note per player, all visible to the player. The plan has four parts: a **Spine** (your prediction of the drama), **Fronts** (threats that move on their own), **Secrets & Clues** (facts to discover), and **Character Arcs**.
- **Escalate reasoning for plan-shaping work.** Creating or editing the plan (including \`advance_plan\`), refreshing character arcs, standing up or advancing a Front, and opening/closing a side beat are campaign-shaping calls, not ordinary narration - call \`set_reasoning_tier({ tier: 3, reason: "..." })\` (the top tier) before making them. You don't need to set it back down - it decays toward baseline on its own.
- **Read before you plan (ENFORCED).** Before creating the spine, \`read_notes\`/\`search_notes\` any existing \`lore\`, \`mechanics\`, and \`dm_instructions\` notes for this adventure - the beats, Fronts, and character arcs must reflect the established setting, tone, and rules, not a generic plan invented in a vacuum. If any such notes exist, \`create_note\` will refuse to create "Campaign Plan" until you've called \`read_notes\`/\`search_notes\` this turn - do that first, THEN create the plan in the same or a later turn.
- **Let the oracle seed what you're unsure of.** Writing the premise, a beat's likely shape, a Front's motive, or a candidate arc direction often means inventing something you don't actually know yet (who the antagonist really is, how a complication resolves, which of a character's directions the fiction is leaning toward). Don't just default to the first idea that comes to mind - call \`fate_question\` (with an honestly calibrated likelihood) or \`roll_table\` for it, same discipline as CORE STANCE's "manufactured certainty" rule, just applied to plan-writing instead of in-scene narration.

### The Spine - a PREDICTION, not a track
- **Pick a spine length that fits the campaign, then create it once, early.** During setup / Session 0, after the character(s) exist, judge the scope from the premise, any adventure-length hints, and what the player has said they want, then call \`create_note({ type: "gm_plan", title: "Campaign Plan", planSpineLength: "short"|"medium"|"long", ... })\`:
  - **short** (~5 beats) - a one-shot or short arc: **Opening Image (Session 0)**, **Inciting Incident**, **Rising Action**, **Climax**, **Resolution**.
  - **medium** (~7 beats, default when scope is unclear) - an ordinary multi-session campaign: **Opening Image (Session 0)**, **Inciting Incident (Session 1)**, **Rising Complications**, **Midpoint Turn**, **Crisis**, **Climax**, **Resolution**.
  - **long** (~15 beats) - an extended, multi-arc campaign that needs more medium-horizon texture than a single "Rising Complications" beat can hold: **Opening Image (Session 0)**, **Setup / Ordinary World**, **Theme Stated**, **Inciting Incident (Session 1)**, **Debate**, **Break Into Rising Action**, **B-Story (Allies & Relationships)**, **Fun and Games (Early Wins)**, **Midpoint Turn**, **Bad Guys Close In (Escalating Complications)**, **All Is Lost**, **Dark Night of the Soul**, **Break Into Finale**, **Climax**, **Resolution (Final Image)**.
  Use the FIXED beat names for whichever preset you pick, in order - don't rename or reorder them. At creation, detail ONLY the first beat ("Opening Image", goal: establish/create the character(s) and their ordinary world); leave the rest as one-line placeholders. Do not plan further yet.
- **The spine is a hard prerequisite for \`start_game\` (ENFORCED).** Session zero is not over until the "Campaign Plan" note exists: \`start_game\` returns an error while it's missing. Order is always character(s) -> plan -> \`confirm_setup\` (the player's OK starts the game; pass \`story_name\` and \`premise\`) -> the campaign intro (a short briefing, then the opening scene). \`start_game\` is only the direct path.
- **The spine is your best GUESS at where the drama goes - not gates the players must trip.** It exists to give tone and pacing a target for the narration. When play diverges from what a beat predicted, **rewrite the remaining spine** to fit what actually happened - never steer the players back toward it. The one-beat-ahead gate enforces *bookkeeping* (keep the plan current), not *plot adherence*.
- **One beat ahead, never more.** The current beat gets a short goal, a \`[ ]\` checklist, and an **advance-on** block (below). Future beats stay one-liners. Never script beats the player hasn't reached.
- **Advance-on triggers, never a scripted "advance-when" moment.** A beat advances on player ACTION or on TIME/consequence - never on the players producing one specific pre-decided event:
  - **action:** list 2+ OR'd routes - e.g. "advance when the players decode the broadcast OR destroy the antenna OR expose the baron". Multiple routes to the same state change, so no single missed action can stall the game (the Three-Clue Rule applied to progression).
  - **time:** e.g. "if the session ends with the broadcast still ignored, Front <name> ticks a step". The world moves whether or not the players engage.
- **Advance at the boundary.** Tick \`[ ]\` -> \`[x]\` with \`edit_note\` as things happen. When the current beat's advance-on is satisfied, call \`advance_plan\` (action "complete_current"), then \`advance_plan\` (action "write_next") with the next beat detailed - and refresh arc directions and Fronts - BEFORE narrating onward. (If you mark a beat complete but don't write the next one, the turn won't be allowed to end until you do.) Ending Session 0 specifically: write one \`gm_plan\` arc note per player (current state + 2-3 candidate directions + active hooks) and detail the Inciting Incident.
- **A tag is NOT a trigger. \`advance_plan\` fires only on the beat's own advance-on.** \`[Neutralized]\`/\`[Clock]\`/\`[Goal]\`/\`[Arc]\` insights are *inputs you consume when write_next runs*, not signals to advance now - they accumulate mid-beat and get read at the boundary. Seeing one does NOT mean call \`advance_plan\`. Only advance when the CURRENT beat's own advance-on condition is met (which may itself be a player action that happens to also neutralize something - then it's the trigger firing, not the tag). If the current beat still isn't satisfied, leave the spine where it is.
- **Mid-beat neutralization → fix the Front, not the spine.** When players defuse/kill/ally-with a threat partway through a beat, react in real time on the FRONT's own state: rewrite or \`resolve_thread\`/\`abandon_thread\` its steps and pause or cancel its clock (\`campaign\` pause or cancel) immediately. That's live world-state and correct to do mid-beat. It does NOT advance the spine - the beat only moves at its own advance-on. The \`[Neutralized]\` tag from that moment just waits in memory for the next write_next.

### Fronts - threats that advance on their own
A Front is a danger with its own agenda that moves in the background whether or not the players engage it. This is how you avoid railroading: rather than scripting what the players do, you set volatile forces in motion and react logically to their interventions.
- **Build a Front with \`campaign\`, not plan prose:** a \`front\` part carries its motive, cast and 2-4 **portents** (escalation steps), and a \`clock\` part linked to it is its **doom clock** (its \`onFill\` = what happens when it fills). A \`create_thread\` (priority "background") may carry the cast too.
- **Advance a Front:** the engine ticks a clock on its triggers (miss, scene, rest, session); tick a [manual] one yourself with \`campaign\` tick (or \`manage_timer\` advance), and telegraph the next step before it lands. When the players neutralize a Front's cause, **rewrite or resolve/abandon** its steps - a defused threat does not limp forward to the next one.
- The plan note's **Fronts** section only INDEXES each active Front (name, motive, current step, clock state) - the real state lives in the front + clock, the same way you index threads/goals rather than restating them.

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
- The player's character sheet is in the pinned notes - reference it; read the rules notes with \`read_notes\` when a check needs them

Write immersive prose. The player should experience the story, not see game mechanics.
Keep every turn tight and short: one action, one consequence, then stop and hand control back - never decide what the player character does next, and never write more than the moment calls for.`;

  // Use tools + state tools
  const legacyToolNames = [
    // Rolling tools (formula-based)
    "formula_roll",
    // Rolls the player never sees - hidden checks, offscreen events
    "gm_roll",
    // Manual dice mode: player rolls real dice, GM asks for the result
    ...(manualDiceMode ? ["ask_for_roll"] : []),
    // Meters, tracks, sessions and action rolls: only for stories that use a
    // system (decision 79), so other adventures do not pay for four schemas
    ...resolveSystem(storyData).tools,
    // Pause and ask the player(s) a predefined-choice + free-text question
    "ask_question",
    // Report a resolved check against the active challenge (rolls nothing)
    "record_challenge_result",
    "opposed_formula",
    "fate_question",
    "roll_table",
    "roll_portent",
    "generate_name",
    // Pictures: only when pictures are on and a provider key exists
    ...(imageToolAvailable ? ["generate_image"] : []),
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
    // The campaign record (always offered, so the tool list is one stable list)
    "campaign",
    // Session-zero -> real-play handoff: names the story and clears
    // sessionZeroActive. The START OF PLAY / fresh-story-setup prompt blocks
    // instruct the GM to call this, so it MUST be offered here - without it the
    // model is told to call a tool it doesn't have.
    // confirm_setup is the player's OK that start_game requires; like
    // start_game it is always offered (a story-level setting would flip
    // mid-story and break the cached tool list).
    "confirm_setup",
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

  // The request is laid out by how often each piece changes (decision 91), so
  // each request matches the one before it as far as possible:
  //   system prompt (nothing per-turn) -> stable block + ack -> history
  //   -> live block + the player's action -> this turn's rounds.
  // See buildStableBlock / buildLiveBlock.
  const stableBlock = buildStableBlock({
    playerSection: gmPlayerSection,
    archetypeSection: gmArchetypeSection,
    dmInstructions: dmInstructionsSection,
    summary: storyData.scene.summary,
  });

  // During session zero one block replaces the four setup blocks (they keep
  // firing outside it, for a started story that lacks a sheet or a plan).
  const inSessionZero = storyData.sessionZeroActive === true;

  const liveBlock = buildLiveBlock({
    loreSection,
    npcList,
    goalsSection: gmGoalsSection,
    threadsSection: gmThreadsSection,
    oracleSection: gmOracleSection,
    combatSection,
    timersSection,
    metersSection,
    campaignBrief: formatCampaignBrief(storyData),
    challengeSection,
    pendingEventsSection: gmStagePendingEventsSection,
    pendingMovesSection: gmStagePendingDirectorMovesSection,
    sessionZeroBlock: inSessionZero ? buildSessionZeroBlock(storyData) : "",
    freshStorySetupBlock: inSessionZero ? "" : freshStorySetupBlock,
    sheetTemplateBlock: inSessionZero ? "" : buildSheetTemplateBlock(storyData),
    sessionZeroStartGameReminder: inSessionZero
      ? ""
      : sessionZeroStartGameReminder,
    setupOverdueBlock: inSessionZero ? "" : setupOverdueBlock,
    observerNoteBlock,
    storyProgressNoteBlock,
    repetitionNoteBlock,
    knowledgeNoteBlock,
    pacingFeedbackLine,
    gmAdviceSection,
  });

  const messages: ChatMessage[] = [
    { role: "system", content: cleanString(systemPrompt) },
  ];

  // The stable block is its own user message, followed by a short assistant
  // acknowledgement (keeps the system prompt lean, and the roles alternating).
  messages.push({
    role: "user",
    content: cleanString(stableBlock),
  });
  messages.push({
    role: "assistant",
    content:
      "<thinking>I've reviewed the current game state. Ready to process the player's action.</thinking>",
  });

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

  // Each past part is rendered by renderHistoryPart (historyStubs.ts): long
  // tool results and arguments become one-line stubs, <thinking> is dropped.
  // Reasoning/thought-signature replay (Gemini's `reasoning.encrypted` in
  // particular) is only meaningful for the round immediately being continued;
  // re-sending an older blob causes a 400 on OpenRouter's Gemini integration
  // (OpenRouterTeam/ai-sdk-provider#491), so only the LAST assistant part keeps
  // its reasoning/reasoning_details - see RenderHistoryOptions.
  let lastAssistantPartIndex = -1;
  for (let j = partsToInclude.length - 1; j >= 0; j--) {
    if (!partsToInclude[j].user) {
      lastAssistantPartIndex = j;
      break;
    }
  }

  for (let i = 0; i < partsToInclude.length; i++) {
    messages.push(
      ...renderHistoryPart(partsToInclude[i], historyStartIndex + i, {
        isMostRecentRound: i === lastAssistantPartIndex,
      }),
    );
  }

  // The end of history (or the acknowledgement, when there is none) closes the
  // prefix the next turn can reuse: stable block + history, byte for byte.
  messages[messages.length - 1] = {
    ...messages[messages.length - 1],
    cacheBreakpoint: "prefix",
  };

  // The live block and the player's action go out as ONE user message (some
  // providers reject consecutive user messages).
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
    content: cleanString(`${liveBlock}\n\n${playerActionMessage}`),
    // Everything up to here is reused unchanged by every round of this turn
    // (generation.ts keeps gmBaseMessages), so it is where Claude's second
    // cache breakpoint goes ("prefix" above is the first). Ignored by every
    // other provider.
    cacheBreakpoint: "turn",
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
  console.log(`  - Stable block: ${estimateTokens(stableBlock)} tokens`);
  console.log(`  - Live block: ${estimateTokens(liveBlock)} tokens`);
  console.log(
    `  - Chat history: ${recentParts.length} parts from #${historyStartIndex}${historySlidingFallback ? " (sliding-window fallback)" : ""} (${partsWithGMHistory} with GM data, ${partsWithNewFormat} with new gmConversation format)`,
  );
  console.log(`  - Available tools: ${toolsToUse.length}`);
  if (pinnedCutTokens > 0) {
    console.log(
      `  - Pinned notes over the ${PINNED_TOTAL_CAP_TOKENS}-token cap: ${pinnedCutTokens} tokens left out of the prompt (the GM can read_notes them)`,
    );
  }
  for (const l of pinnedForGM) {
    const warning = pinnedNoteWarning(l);
    if (warning) console.log(`  - Pinned note "${l.title}": ${warning}`);
  }

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
  // Prima Materia's standing tonal register. Repeated here rather than
  // left to the GM stage alone because this is the stage that actually
  // writes the prose - a register the narrator never sees is a register
  // that doesn't affect the words the player reads. Empty at Neutral tint,
  // which is the common case and costs nothing.
  tintLine?: string,
): string {
  const { paragraphs } = getLengthGuidance(replyLength);
  const pacingFeedbackLine = pacingNote ? `\n\n${pacingNote}` : "";
  const tintFeedbackLine = tintLine
    ? `\n\nTonal register for this stretch of the story (colour the prose with it - do not announce it, do not let it flatten the scene's own content):\n${tintLine}`
    : "";

  const basePrompt = `Now write the story from the player's perspective. Write only the prose the player should see - no meta-commentary, no notes to yourself.

Keep it tight and hand the mic back - this is a back-and-forth roleplay, not a monologue. ${paragraphs} End the instant the player has something to react to; never write what the player character does next.${pacingFeedbackLine}${tintFeedbackLine}`;

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
