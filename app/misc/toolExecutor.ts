/**
 * Tool Executor - Maps AI tool calls to existing command execution logic
 *
 * This module bridges the gap between structured tool calling and our existing
 * commandResponses.ts implementation, reusing all validation and fuzzy matching logic.
 */

import {
  StoryData,
  CommandResponse,
  AdventureDifficulty,
  RestType,
  REST_CONFIG,
  StoryThread,
  StoryLore,
  MAX_PENDING_RANDOM_EVENTS,
  PendingRandomEvent,
  MAX_PENDING_DIRECTOR_MOVES,
  SpineLength,
} from "@/app/misc/structs";
import {
  applyCompleteGoal,
  applyFailGoal,
  applyUpdateGoal,
  applyDeleteGoal,
  applyDeleteNote,
  applyRemoveAbility,
  applyModifyAbility,
  applyUpgradeAbility,
  applyResetAbilityCooldown,
  applyReduceCooldown,
  applyAdjustResource,
} from "@/app/misc/commandResponses";
import { TOOL_MAP } from "@/app/misc/toolSchemas";
import { logger } from "@/app/misc/logger";
import {
  checkScene,
  adjustChaosFactor,
  adjustTension,
  selectDirectorMove,
  generateEventFocus,
  generateEventMeaning,
} from "@/app/misc/mythic";
import {
  currentTint,
  rollPortent,
  selectFrame,
} from "@/app/misc/primaMateria";
import { selectGMAdviceForScene, formatGMAdviceNote } from "@/app/misc/gmAdvice";
import {
  findSpinePlanNote,
  initPlanState,
  CAMPAIGN_SPINE_PRESETS,
} from "@/app/misc/campaignPlan";
import { findBestMatch, findStatMatch } from "@/app/misc/fuzzyMatch";
import { countNameMentions } from "@/app/misc/compaction";
import { validateToolArgs, formatValidationErrors } from "@/app/misc/toolValidation";
import { parseChallengeRoundsValue } from "@/app/misc/rpgSystems";
import { initializeAbility } from "@/app/misc/abilitySystem";

/**
 * Calculate relationship value change based on magnitude, difficulty, and current value.
 * Enemies are hard to befriend (small gains), friends are easy to lose (big losses).
 */
function calculateRelationshipDelta(
  magnitude: string,
  currentValue: number,
  difficulty: AdventureDifficulty = "medium"
): number {
  // Base changes by magnitude
  const baseMagnitudes: Record<string, number> = {
    greatly_damage: -25,
    damage: -15,
    slightly_damage: -8,
    slightly_improve: 8,
    improve: 15,
    greatly_improve: 25,
  };

  // Difficulty multipliers (harder = slower relationship gains, faster losses)
  const difficultyMultipliers: Record<
    AdventureDifficulty,
    { gain: number; loss: number }
  > = {
    easy: { gain: 1.3, loss: 0.7 },
    medium: { gain: 1.0, loss: 1.0 },
    hard: { gain: 0.7, loss: 1.3 },
    expert: { gain: 0.5, loss: 1.5 },
  };

  const baseChange = baseMagnitudes[magnitude] || 0;
  const isImproving = baseChange > 0;
  const diffMult =
    difficultyMultipliers[difficulty] || difficultyMultipliers.medium;

  // Current relationship affects how easy it is to change
  // Negative relationships: hard to improve, easy to damage further
  // Positive relationships: easy to improve more, hard to damage
  let relationshipModifier = 1.0;

  if (isImproving) {
    // Improving relationships
    if (currentValue <= -50) {
      // Nemesis/enemy: very hard to improve (they hate you)
      relationshipModifier = 0.3;
    } else if (currentValue <= -25) {
      // Hostile: hard to improve
      relationshipModifier = 0.5;
    } else if (currentValue <= 0) {
      // Unfriendly/stranger: somewhat hard to improve
      relationshipModifier = 0.7;
    } else if (currentValue <= 50) {
      // Acquaintance/friendly: normal improvement
      relationshipModifier = 1.0;
    } else {
      // Already friends: diminishing returns
      relationshipModifier = 0.8;
    }
  } else {
    // Damaging relationships
    if (currentValue >= 75) {
      // Trusted friend/ally: takes a lot to damage
      relationshipModifier = 0.6;
    } else if (currentValue >= 50) {
      // Friendly: somewhat resistant to damage
      relationshipModifier = 0.8;
    } else if (currentValue >= 0) {
      // Acquaintance/stranger: normal damage
      relationshipModifier = 1.0;
    } else {
      // Already negative: easy to damage further
      relationshipModifier = 1.2;
    }
  }

  const finalChange = Math.round(
    baseChange *
      (isImproving ? diffMult.gain : diffMult.loss) *
      relationshipModifier
  );

  return finalChange;
}

export interface ToolCall {
  id?: string;
  type: "function";
  function: {
    name: string;
    arguments: string | Record<string, any>;
  };
}

export interface ExecuteToolsResult {
  responses: CommandResponse[];
  stateChanges: string[];
}

/**
 * Tools whose successful execution should generate state change notifications
 * for the story generation stage. Includes both tool names and their command equivalents.
 *
 * Exported for reuse by generation.ts's leniency audit (a soft, always-on
 * widening of the M2 roll-invariant gate) - reusing this list rather than
 * inventing a second, possibly-drifting one for "consequential state-changing
 * tool."
 */
export const STATE_CHANGE_TOOLS = new Set([
  // Abilities - tool names and command names
  "add_ability",
  "remove_ability",
  "modify_ability",
  "upgrade_ability",
  "reset_ability_cooldown",
  "reduce_cooldown",
  "refresh_ability",
  // NPC Management
  "add_npc",
  // Game state
  "game_over",
  // Scene Challenges
  "start_challenge",
  "update_challenge",
  "resolve_challenge",
  "cancel_challenge",
  // Rest System
  "take_rest",
  // Thread Management
  "create_thread",
  "update_thread",
  "resolve_thread",
  "abandon_thread",
  // Goals
  "complete_goal",
  "fail_goal",
  "create_goal",
]);

/**
 * Direct typed dispatch table for tools that used to be converted into a
 * pipe-delimited `/command: args` string and then re-parsed by a regex in
 * commandResponses.ts's executeCommandWithResponse. Each entry here takes
 * the already-parsed tool `args` object directly - no string round trip.
 *
 * `reset_ability_cooldown` and `refresh_ability` share a single
 * implementation since their behavior is identical.
 */
const TOOL_DISPATCH: Record<
  string,
  (
    args: Record<string, unknown>,
    storyData: StoryData
  ) => Omit<CommandResponse, "toolCallId"> | null
> = {
  complete_goal: applyCompleteGoal,
  fail_goal: applyFailGoal,
  update_goal: applyUpdateGoal,
  delete_goal: applyDeleteGoal,
  delete_note: applyDeleteNote,
  remove_ability: applyRemoveAbility,
  modify_ability: applyModifyAbility,
  upgrade_ability: applyUpgradeAbility,
  reset_ability_cooldown: applyResetAbilityCooldown,
  refresh_ability: applyResetAbilityCooldown,
  reduce_cooldown: applyReduceCooldown,
  adjust_resource: applyAdjustResource,
};

/**
 * Parse dice notation (e.g., "2d6+3", "-1d8+2", "3d6-5") and return the rolled value
 * Returns null if the string is not valid dice notation
 */
function parseDiceNotation(
  input: string | number
): { value: number; notation: string } | null {
  // If it's already a number, return it directly
  if (typeof input === "number") {
    return { value: input, notation: input.toString() };
  }

  // Check if it's a plain number string
  const plainNum = parseFloat(input);
  if (!isNaN(plainNum) && /^[+-]?\d+(\.\d+)?$/.test(input.trim())) {
    return { value: plainNum, notation: input };
  }

  // Dice notation regex: optional sign, optional count, d, sides, optional modifier
  // Examples: 1d6, 2d8+3, -1d8, d20-2, +3d6+5
  const diceRegex = /^([+-])?(\d*)d(\d+)([+-]\d+)?$/i;
  const match = input.trim().match(diceRegex);

  if (!match) {
    return null;
  }

  const [, sign, countStr, sidesStr, modifierStr] = match;
  const negative = sign === "-";
  const count = countStr ? parseInt(countStr) : 1;
  const sides = parseInt(sidesStr);
  const modifier = modifierStr ? parseInt(modifierStr) : 0;

  // Validate dice parameters
  if (count < 1 || count > 100 || sides < 2 || sides > 1000) {
    return null;
  }

  // Roll the dice
  let total = 0;
  const rolls: number[] = [];
  for (let i = 0; i < count; i++) {
    const roll = Math.floor(Math.random() * sides) + 1;
    rolls.push(roll);
    total += roll;
  }

  // Apply modifier
  total += modifier;

  // Apply negative sign if present
  if (negative) {
    total = -total;
  }

  // Build notation string for display
  const rollsStr = rolls.join("+");
  const modStr =
    modifier > 0 ? `+${modifier}` : modifier < 0 ? modifier.toString() : "";
  const notation = `${negative ? "-" : ""}(${rollsStr}${modStr}) = ${total}`;

  return { value: total, notation };
}

// --- search_notes: tokenized, relevance-ranked note search ---
//
// Splits the query into tokens so multi-word queries ("tavern owner") match
// notes containing those words anywhere, not just as one literal phrase.
// Every note is scored (title/keys/aliases weighted above tags/related-*,
// content lowest) and results are ranked globally by score before slicing to
// maxResults, so the strongest matches win regardless of which note they're
// in. A literal whole-phrase hit still gets a large bonus over scattered
// token hits so exact matches keep priority.

const NOTE_SEARCH_FIELD_WEIGHTS = {
  title: 10,
  keys: 8,
  aliases: 8,
  tags: 5,
  relatedCharacters: 5,
  relatedLocations: 5,
  content: 1,
} as const;

type NoteSearchMatchField = keyof typeof NOTE_SEARCH_FIELD_WEIGHTS;

function tokenizeSearchQuery(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .filter(Boolean);
}

// Builds an excerpt around the match position instead of always truncating
// from the start of the line - a line whose match falls past character 77
// used to produce an excerpt that didn't contain the match at all.
function centeredExcerpt(
  line: string,
  matchIndex: number,
  matchLength: number,
  windowSize = 80
): string {
  const trimmed = line.trim();
  if (trimmed.length <= windowSize) return trimmed;

  const halfWindow = Math.max(0, Math.floor((windowSize - matchLength) / 2));
  let start = Math.max(0, matchIndex - halfWindow);
  const end = Math.min(line.length, start + windowSize);
  start = Math.max(0, end - windowSize);

  let excerpt = line.slice(start, end).trim();
  if (start > 0) excerpt = "..." + excerpt;
  if (end < line.length) excerpt = excerpt + "...";
  return excerpt;
}

function noteSearchFieldLabel(field: NoteSearchMatchField): string {
  switch (field) {
    case "keys":
      return "trigger keyword";
    case "aliases":
      return "alias";
    case "tags":
      return "tag";
    case "relatedCharacters":
      return "related character";
    case "relatedLocations":
      return "related location";
    default:
      return field;
  }
}

interface NoteSearchResult {
  title: string;
  excerpt: string;
  lineNum: number;
}

function searchLoreEntries(
  lore: StoryLore[],
  query: string,
  options: {
    includeHidden: boolean;
    maxResults: number;
    type?: string;
    tags?: string[];
  }
): NoteSearchResult[] {
  const tokens = tokenizeSearchQuery(query);
  if (tokens.length === 0) return [];

  const phrase = query.toLowerCase().trim();
  const filterTags = options.tags?.map((t) => t.toLowerCase());

  const candidates: {
    title: string;
    excerpt: string;
    lineNum: number;
    score: number;
    matchedVia?: NoteSearchMatchField;
  }[] = [];

  for (const entry of lore) {
    if (!entry.title) continue;
    if (!options.includeHidden && entry.on === false) continue;
    if (options.type && (entry.type || "lore") !== options.type) continue;
    if (filterTags && filterTags.length > 0) {
      const entryTags = (entry.tags || []).map((t) => t.toLowerCase());
      if (!filterTags.some((t) => entryTags.includes(t))) continue;
    }

    let score = 0;
    let matchedVia: NoteSearchMatchField | undefined;
    const titleLower = entry.title.toLowerCase();

    if (phrase && titleLower.includes(phrase)) {
      score += NOTE_SEARCH_FIELD_WEIGHTS.title * 2;
      matchedVia = "title";
    }
    for (const token of tokens) {
      if (titleLower.includes(token)) {
        score += NOTE_SEARCH_FIELD_WEIGHTS.title;
        matchedVia = matchedVia || "title";
      }
    }

    const checkFieldList = (
      values: string[] | undefined,
      field: NoteSearchMatchField
    ) => {
      if (!values || values.length === 0) return;
      const lowerValues = values.map((v) => v.toLowerCase());
      for (const token of tokens) {
        if (lowerValues.some((v) => v.includes(token))) {
          score += NOTE_SEARCH_FIELD_WEIGHTS[field];
          matchedVia = matchedVia || field;
        }
      }
    };

    checkFieldList(entry.keys, "keys");
    checkFieldList(entry.aliases, "aliases");
    checkFieldList(entry.tags, "tags");
    checkFieldList(entry.relatedCharacters, "relatedCharacters");
    checkFieldList(entry.relatedLocations, "relatedLocations");

    let bestLine:
      | { text: string; index: number; score: number; matchIndex: number; matchLength: number }
      | null = null;

    if (entry.content) {
      const lines = entry.content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const lineLower = lines[i].toLowerCase();
        let lineScore = 0;
        let matchIndex = -1;
        let matchLength = 0;

        const phraseIndex = phrase ? lineLower.indexOf(phrase) : -1;
        if (phraseIndex !== -1) {
          lineScore += NOTE_SEARCH_FIELD_WEIGHTS.content * 3;
          matchIndex = phraseIndex;
          matchLength = phrase.length;
        }

        for (const token of tokens) {
          const idx = lineLower.indexOf(token);
          if (idx !== -1) {
            lineScore += NOTE_SEARCH_FIELD_WEIGHTS.content;
            if (matchIndex === -1) {
              matchIndex = idx;
              matchLength = token.length;
            }
          }
        }

        if (lineScore > 0 && (!bestLine || lineScore > bestLine.score)) {
          bestLine = { text: lines[i], index: i, score: lineScore, matchIndex, matchLength };
        }
      }
    }

    if (bestLine) {
      score += bestLine.score;
      matchedVia = matchedVia || "content";
    }

    if (score <= 0) continue;

    let excerpt: string;
    if (bestLine) {
      excerpt = centeredExcerpt(bestLine.text, bestLine.matchIndex, bestLine.matchLength);
    } else if (matchedVia === "title") {
      excerpt = "[Title match]";
    } else {
      excerpt = `[Matched via ${noteSearchFieldLabel(matchedVia as NoteSearchMatchField)}, no literal text match]`;
    }

    candidates.push({
      title: entry.title,
      excerpt,
      lineNum: bestLine ? bestLine.index + 1 : 0,
      score,
      matchedVia,
    });
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates
    .slice(0, options.maxResults)
    .map(({ title, excerpt, lineNum }) => ({ title, excerpt, lineNum }));
}

/**
 * Execute multiple tool calls and return command responses with state changes
 * Converts tool calls to XML command format and reuses existing validation
 */
export function executeTools(
  toolCalls: ToolCall[],
  storyData: StoryData
): ExecuteToolsResult {
  logger.action(
    `Executing ${toolCalls.length} tool call${
      toolCalls.length !== 1 ? "s" : ""
    }`,
    { toolNames: toolCalls.map((tc) => tc.function.name) }
  );

  const responses: CommandResponse[] = [];
  const stateChanges: string[] = [];

  // Helper to serialize arguments (string or object) in a compact form for failure diagnostics
  function serializeArgs(raw: string | Record<string, any>): string {
    try {
      if (typeof raw === "string") {
        // Return raw string (trimmed) if already JSON string / invalid JSON
        return raw.length > 160 ? raw.substring(0, 157) + "..." : raw;
      }
      const json = JSON.stringify(raw);
      return json.length > 160 ? json.substring(0, 157) + "..." : json;
    } catch {
      return "<unserializable args>";
    }
  }

  // Extract difficulty for tier conversion (used by challenge and other tools)
  const difficulty: AdventureDifficulty = storyData.difficulty || "medium";

  for (const toolCall of toolCalls) {
    const toolName = toolCall.function.name;
    const toolId = toolCall.id || "unknown";

    logger.action(`Processing tool call: ${toolName}`, {
      toolCallId: toolId,
      argsPreview: serializeArgs(toolCall.function.arguments),
    });

    try {
      // Parse arguments if they're a string (some APIs send JSON strings)
      let args: Record<string, any>;
      if (typeof toolCall.function.arguments === "string") {
        try {
          args = JSON.parse(toolCall.function.arguments);
        } catch (e) {
          const errorMsg = `Invalid tool arguments: ${
            e instanceof Error ? e.message : "Parse error"
          } (tool ${toolCall.function.name} rawArgs=${serializeArgs(
            toolCall.function.arguments
          )})`;
          logger.error(`Tool call failed: ${errorMsg}`, {
            toolCallId: toolId,
            toolName,
          });
          responses.push({
            command: toolCall.function.name,
            success: false,
            message: errorMsg,
            timestamp: Date.now(),
            toolCallId: toolCall.id,
          });
          continue;
        }
      } else {
        args = toolCall.function.arguments;
      }

      // Validate tool exists
      const toolSchema = TOOL_MAP.get(toolCall.function.name);
      if (!toolSchema) {
        const errorMsg = `Unknown tool: ${
          toolCall.function.name
        } (called with args=${serializeArgs(args)})`;
        logger.error(`Tool call failed: ${errorMsg}`, {
          toolCallId: toolId,
          toolName,
        });
        responses.push({
          command: toolCall.function.name,
          success: false,
          message: errorMsg,
          timestamp: Date.now(),
          toolCallId: toolCall.id,
        });
        continue;
      }

      // Validate arguments against the tool's declared schema (required
      // params, types, enums) - driven off the same schema sent to the LLM,
      // so the model gets a specific, correctable error instead of a
      // generic crash deep inside the tool's executor.
      const validationErrors = validateToolArgs(toolSchema, args);
      if (validationErrors.length > 0) {
        const errorMsg = `${formatValidationErrors(
          toolCall.function.name,
          validationErrors
        )} (args=${serializeArgs(args)})`;
        logger.error(`Tool call failed: ${errorMsg}`, {
          toolCallId: toolId,
          toolName,
          validationErrors,
        });
        responses.push({
          command: toolCall.function.name,
          success: false,
          message: errorMsg,
          timestamp: Date.now(),
          toolCallId: toolCall.id,
        });
        continue;
      }

      // Special handling for skip_tools (no-op when no changes needed)
      if (toolCall.function.name === "skip_tools") {
        const reason = args.reason || "No changes needed";
        logger.action(`Tool stage skipped: ${reason}`, { toolCallId: toolId });
        responses.push({
          command: toolCall.function.name,
          success: true,
          message: `Skipped: ${reason}`,
          timestamp: Date.now(),
          toolCallId: toolCall.id,
        });
        continue;
      }

      // Special handling for add_memory (direct array manipulation)
      if (toolCall.function.name === "add_memory") {
        logger.action("Special handling: add_memory", {
          toolCallId: toolId,
          entry: args.entry.substring(0, 100),
        });
        if (!storyData.memory) storyData.memory = [];
        const entry = args.entry;

        // Exact-name-matching against tracked entities (same approach
        // compaction.ts's dropped-entity check already uses) - a
        // lightweight version of Generative Agents' recency/importance/
        // entity-relevance memory scoring, not NLP-style extraction.
        const entityIds: string[] = [];
        for (const npc of storyData.npcs || []) {
          if (npc.name && countNameMentions(entry, npc.name) > 0) {
            entityIds.push(npc.name);
          }
        }
        for (const thread of storyData.threads || []) {
          if (thread.title && countNameMentions(entry, thread.title) > 0) {
            entityIds.push(thread.title);
          }
        }

        const rawImportance = args.importance;
        const importance =
          typeof rawImportance === "number" && !isNaN(rawImportance)
            ? Math.max(0, Math.min(10, rawImportance))
            : undefined;

        // Add as MemoryEntry with embedded: false so it gets embedded on next sync
        storyData.memory.push({
          content: entry,
          embedded: false,
          timestamp: Date.now(),
          sceneIndex: storyData.scene.parts.length,
          entityIds: entityIds.length > 0 ? entityIds : undefined,
          importance,
        });
        const successMsg = `Added memory: "${entry.substring(0, 50)}${
          entry.length > 50 ? "..." : ""
        }"`;
        logger.action(`Tool call succeeded: ${successMsg}`, {
          toolCallId: toolId,
          toolName,
        });
        responses.push({
          command: toolCall.function.name,
          success: true,
          message: successMsg,
          timestamp: Date.now(),
          toolCallId: toolCall.id,
        });
        continue;
      }

      // Special handling for list_inactive_notes (query tool - returns data directly)
      if (toolCall.function.name === "list_inactive_notes") {
        logger.action("Special handling: list_inactive_notes", {
          toolCallId: toolId,
        });

        if (!storyData.lore || storyData.lore.length === 0) {
          responses.push({
            command: toolCall.function.name,
            success: true,
            message: "No note entries defined in this adventure.",
            timestamp: Date.now(),
            toolCallId: toolCall.id,
          });
          continue;
        }

        // Find inactive notes (not revealed, not always-on, on=false or no triggers matched)
        const currentPartIndex = storyData.scene.parts.length;
        const inactiveNotes = storyData.lore.filter((l) => {
          if (l.enabled === false) return false; // Completely disabled in editor
          if (l.alwaysOn) return false; // Always visible, not "inactive"

          // Check if already revealed via show_note
          const wasRevealed = storyData.scene.parts.some((p) =>
            p.revealedLore?.some(
              (title) => title.toLowerCase() === l.title.toLowerCase()
            )
          );
          if (wasRevealed) return false;

          // Check standard activation
          if (l.on === true) {
            // If recently triggered, it's active
            if (
              l.lastTriggeredIndex &&
              currentPartIndex - l.lastTriggeredIndex <= 15
            ) {
              return false;
            }
          }

          // If we get here, note is inactive
          return true;
        });

        if (inactiveNotes.length === 0) {
          responses.push({
            command: toolCall.function.name,
            success: true,
            message:
              "All note entries are currently active/visible. No hidden notes available.",
            timestamp: Date.now(),
            toolCallId: toolCall.id,
          });
          continue;
        }

        // Format inactive notes for AI
        const noteList = inactiveNotes
          .map((l) => {
            const preview =
              l.content.length > 80
                ? l.content.substring(0, 77) + "..."
                : l.content;
            return `- ${l.title}: ${preview}`;
          })
          .join("\n");

        const successMsg = `Inactive/Hidden Note Entries (${inactiveNotes.length}):\n${noteList}\n\nUse show_note({ title: "..." }) to reveal any of these to the player.`;

        logger.action(
          `Tool call succeeded: list_inactive_notes found ${inactiveNotes.length} entries`,
          {
            toolCallId: toolId,
            count: inactiveNotes.length,
          }
        );

        responses.push({
          command: toolCall.function.name,
          success: true,
          message: successMsg,
          timestamp: Date.now(),
          toolCallId: toolCall.id,
        });
        continue;
      }

      // Special handling for create_note (content may contain | characters like markdown tables)
      if (toolCall.function.name === "create_note") {
        logger.action("Special handling: create_note", {
          toolCallId: toolId,
          title: args.title,
        });

        if (!storyData.lore) storyData.lore = [];

        const existingNote = storyData.lore.find((l) => l.title === args.title);
        if (existingNote) {
          responses.push({
            command: toolCall.function.name,
            success: false,
            message: `Note "${args.title}" already exists`,
            timestamp: Date.now(),
            toolCallId: toolCall.id,
          });
          continue;
        }

        const noteType = args.type || "lore";

        // Phase 4 grounding gate (docs/gm-plan-notes-design.md): refuse to
        // create the gm_plan "Campaign Plan" spine note until the GM has
        // called read_notes/search_notes THIS turn, but only when there's
        // something to ground against - a story with no existing
        // lore/mechanics/dm_instructions notes has nothing to read, so the
        // gate is a no-op there. Prompt-only nudging for this (Phase 3)
        // didn't hold up in practice, so this mirrors the Phase 2
        // advance_plan gate in being an actual block, not just advice.
        if (
          noteType === "gm_plan" &&
          /campaign plan/i.test(args.title) &&
          !storyData.notesReadThisTurn
        ) {
          const groundingNoteExists = storyData.lore.some(
            (l) =>
              l.enabled !== false &&
              ["lore", "mechanics", "dm_instructions"].includes(
                l.type || "lore",
              ),
          );
          if (groundingNoteExists) {
            responses.push({
              command: toolCall.function.name,
              success: false,
              message:
                "Cannot create the Campaign Plan spine note yet - this story has existing lore/mechanics/dm_instructions notes you haven't read this turn. Call read_notes or search_notes on them first, then retry create_note for the Campaign Plan.",
              timestamp: Date.now(),
              toolCallId: toolCall.id,
            });
            continue;
          }
        }

        storyData.lore.push({
          title: args.title,
          content: args.content,
          relatedCharacters: [],
          relatedLocations: [],
          secrtet: false,
          keys: [],
          type: noteType,
          visibility: args.visibility || undefined, // Two-Pass Visibility - defaults to always_reveal when unset
          on: true, // Agentic notes are visible by default
          alwaysOn: true, // No more triggers needed with read_notes
          on_triggers: [], // Empty for agentic notes
          off_triggers: [], // Empty for agentic notes
          embedded: false, // New entry needs embedding
        });

        // Mark lore embeddings as dirty for re-sync
        storyData.loreEmbeddingsDirty = true;

        // Phase 2: auto-initialize the campaign-plan tracker when the spine
        // note is created (a gm_plan note titled like "Campaign Plan"), so the
        // structured re-planning gate layers onto the prompt-driven Phase 1
        // bootstrap with no extra setup step. See campaignPlan.ts.
        if (
          noteType === "gm_plan" &&
          !storyData.planState &&
          /campaign plan/i.test(args.title)
        ) {
          const requestedLength = args.planSpineLength as
            | SpineLength
            | undefined;
          const spineLength =
            requestedLength && requestedLength in CAMPAIGN_SPINE_PRESETS
              ? requestedLength
              : "medium";
          storyData.planState = initPlanState(args.title, spineLength);
        }

        logger.action("New note created via direct tool handling", {
          title: args.title,
        });

        const stateChange = `📝 Created note entry "${args.title}"`;
        stateChanges.push(stateChange);

        responses.push({
          command: toolCall.function.name,
          success: true,
          message: stateChange,
          timestamp: Date.now(),
          toolCallId: toolCall.id,
        });
        continue;
      }

      // Campaign Plan focus: open a side beat (side quest / detour) and make
      // it the active focus. See docs/gm-plan-notes-design.md.
      if (toolCall.function.name === "open_side_beat") {
        logger.action("Special handling: open_side_beat", {
          toolCallId: toolId,
          title: args.title,
        });

        if (storyData.activeSideBeatTitle) {
          responses.push({
            command: toolCall.function.name,
            success: false,
            message: `A side beat ("${storyData.activeSideBeatTitle}") is already active - resolve it with close_side_beat before opening another.`,
            timestamp: Date.now(),
            toolCallId: toolCall.id,
          });
          continue;
        }

        if (!storyData.lore) storyData.lore = [];
        const existingBeat = storyData.lore.find(
          (l) => l.title === args.title,
        );
        if (!existingBeat) {
          const beatBody = [
            `**Side Beat** (detour off the main spine)`,
            ``,
            `- Goal: ${args.goal}`,
            args.return_when ? `- Return when: ${args.return_when}` : null,
            args.owner ? `- Focus on: ${args.owner}` : null,
            ``,
            `## Checklist`,
            `- [ ] `,
          ]
            .filter((line) => line !== null)
            .join("\n");
          storyData.lore.push({
            title: args.title,
            content: beatBody,
            relatedCharacters: [],
            relatedLocations: [],
            secrtet: false,
            keys: [],
            type: "gm_plan",
            on: true,
            alwaysOn: true,
            on_triggers: [],
            off_triggers: [],
            embedded: false,
            ownerCouchPlayerId: args.owner || undefined,
          });
          storyData.loreEmbeddingsDirty = true;
        }

        storyData.activeSideBeatTitle = args.title;

        const stateChange = `⚡ Opened side beat "${args.title}" (main story paused)`;
        stateChanges.push(stateChange);
        responses.push({
          command: toolCall.function.name,
          success: true,
          message: stateChange,
          timestamp: Date.now(),
          toolCallId: toolCall.id,
        });
        continue;
      }

      // Campaign Plan focus: resolve the active side beat and return focus to
      // the paused main-spine beat. See docs/gm-plan-notes-design.md.
      if (toolCall.function.name === "close_side_beat") {
        logger.action("Special handling: close_side_beat", {
          toolCallId: toolId,
        });

        const activeTitle = storyData.activeSideBeatTitle;
        if (!activeTitle) {
          responses.push({
            command: toolCall.function.name,
            success: false,
            message: `No side beat is active - nothing to close.`,
            timestamp: Date.now(),
            toolCallId: toolCall.id,
          });
          continue;
        }

        const beat = (storyData.lore || []).find(
          (l) => l.title === activeTitle,
        );
        if (beat) {
          beat.content = `${beat.content}\n\n**Resolved:** ${args.resolution}`;
          beat.embedded = false;
          storyData.loreEmbeddingsDirty = true;
        }

        storyData.activeSideBeatTitle = undefined;

        const stateChange = `✅ Closed side beat "${activeTitle}" (back to the main story)`;
        stateChanges.push(stateChange);
        responses.push({
          command: toolCall.function.name,
          success: true,
          message: stateChange,
          timestamp: Date.now(),
          toolCallId: toolCall.id,
        });
        continue;
      }

      // Campaign Plan (Phase 2): advance the plan through its fixed spine.
      // complete_current marks the current beat done (the gate then requires
      // the next beat before the turn can end); write_next details and moves
      // to the next beat. See docs/gm-plan-notes-design.md, campaignPlan.ts.
      if (toolCall.function.name === "advance_plan") {
        logger.action("Special handling: advance_plan", {
          toolCallId: toolId,
          action: args.action,
        });

        const spineNote = findSpinePlanNote(storyData);
        if (!spineNote) {
          responses.push({
            command: toolCall.function.name,
            success: false,
            message: `No campaign plan exists yet - create a gm_plan note titled "Campaign Plan" before advancing it.`,
            timestamp: Date.now(),
            toolCallId: toolCall.id,
          });
          continue;
        }

        // Late-init the tracker for plans created before Phase 2 / by hand.
        if (!storyData.planState) {
          storyData.planState = initPlanState(spineNote.title);
        }
        const plan = storyData.planState;
        const curName = plan.beats[plan.currentBeatIndex] ?? "the current beat";

        if (args.action === "complete_current") {
          plan.awaitingNextBeat = true;
          spineNote.content = `${spineNote.content}\n\n✓ **${curName} — complete.** ${
            args.summary || ""
          }`.trimEnd();
          spineNote.embedded = false;
          storyData.loreEmbeddingsDirty = true;

          const stateChange = `✓ Beat complete: ${curName} — now write the next beat (advance_plan write_next)`;
          stateChanges.push(stateChange);
          responses.push({
            command: toolCall.function.name,
            success: true,
            message: stateChange,
            timestamp: Date.now(),
            toolCallId: toolCall.id,
          });
          continue;
        }

        if (args.action === "write_next") {
          const atLastBeat = plan.currentBeatIndex >= plan.beats.length - 1;
          plan.awaitingNextBeat = false;

          if (atLastBeat) {
            // Resolution reached - nothing after it. Record and stop.
            spineNote.content =
              `${spineNote.content}\n\n🏁 **Campaign spine complete.** ${args.detail || ""}`.trimEnd();
            spineNote.embedded = false;
            storyData.loreEmbeddingsDirty = true;

            const stateChange = `🏁 Campaign spine complete (${curName} was the final beat)`;
            stateChanges.push(stateChange);
            responses.push({
              command: toolCall.function.name,
              success: true,
              message: stateChange,
              timestamp: Date.now(),
              toolCallId: toolCall.id,
            });
            continue;
          }

          plan.currentBeatIndex += 1;
          const newName = plan.beats[plan.currentBeatIndex];
          spineNote.content = `${spineNote.content}\n\n## Current beat — ${newName}\n${
            args.detail || ""
          }`.trimEnd();
          spineNote.embedded = false;
          storyData.loreEmbeddingsDirty = true;

          const stateChange = `⏭ Advanced to beat: ${newName}`;
          stateChanges.push(stateChange);
          responses.push({
            command: toolCall.function.name,
            success: true,
            message: stateChange,
            timestamp: Date.now(),
            toolCallId: toolCall.id,
          });
          continue;
        }

        // Unknown action (schema enum should prevent this, but be explicit).
        responses.push({
          command: toolCall.function.name,
          success: false,
          message: `Unknown advance_plan action "${args.action}" - use "complete_current" or "write_next".`,
          timestamp: Date.now(),
          toolCallId: toolCall.id,
        });
        continue;
      }

      // Special handling for create_goal (description may contain | characters)
      if (toolCall.function.name === "create_goal") {
        logger.action("Special handling: create_goal", {
          toolCallId: toolId,
          title: args.title,
        });

        if (!storyData.goals) storyData.goals = [];

        const existing = storyData.goals.find((g) => g.title === args.title);
        if (existing) {
          responses.push({
            command: toolCall.function.name,
            success: false,
            message: `Goal "${args.title}" already exists`,
            timestamp: Date.now(),
            toolCallId: toolCall.id,
          });
          continue;
        }

        const newGoal = {
          id: `goal_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          title: args.title,
          shortDescription: args.shortDescription,
          description: args.description,
          active: true,
          fulfilled: false,
          createdAt: new Date(),
        };

        storyData.goals.push(newGoal);

        logger.action("Goal created via direct tool handling", {
          title: args.title,
        });

        const stateChange = `📜 Created goal "${args.title}"`;
        stateChanges.push(stateChange);

        responses.push({
          command: toolCall.function.name,
          success: true,
          message: stateChange,
          timestamp: Date.now(),
          toolCallId: toolCall.id,
        });
        continue;
      }

      // Special handling for add_ability (description may contain | characters)
      if (toolCall.function.name === "add_ability") {
        logger.action("Special handling: add_ability", {
          toolCallId: toolId,
          name: args.name,
        });

        // Initialize abilities array if needed
        if (!storyData.abilities) {
          storyData.abilities = [];
        }

        const existing = storyData.abilities.find(
          (a) => a.name.toLowerCase() === args.name.toLowerCase()
        );
        if (existing) {
          responses.push({
            command: toolCall.function.name,
            success: false,
            message: `Ability "${args.name}" already exists`,
            timestamp: Date.now(),
            toolCallId: toolCall.id,
          });
          continue;
        }

        // Parse costs array (already structured from tool args)
        const costs: Array<{
          type: "resource" | "variable";
          name: string;
          amount: number;
        }> = args.costs || [];

        // Validate stat exists if specified
        const stat = args.stat?.trim() || undefined;
        let statWarning = "";
        if (
          stat &&
          !storyData.stats.find((s) => s.name.toLowerCase() === stat.toLowerCase())
        ) {
          statWarning = ` (note: stat "${stat}" not found, ability will work with any skill check)`;
        }

        const ability = initializeAbility({
          name: args.name,
          description: args.description,
          grade: args.grade || "novice",
          stat,
          cost: costs,
          cooldown: args.maxCooldown || 0,
          symbol: "✨",
        });

        storyData.abilities.push(ability);

        logger.action("Ability added via direct tool handling", {
          name: args.name,
          grade: args.grade || "novice",
          costs,
          maxCooldown: args.maxCooldown || 0,
        });

        const costDesc =
          costs.length > 0
            ? ` (costs: ${costs.map((c) => `${c.amount} ${c.name}`).join(", ")})`
            : "";
        const cooldownDesc =
          args.maxCooldown > 0 ? `, ${args.maxCooldown} turn cooldown` : "";
        const stateChange = `✨ Added ${args.grade || "novice"} ability "${args.name}"${costDesc}${cooldownDesc}${statWarning}`;
        stateChanges.push(stateChange);

        responses.push({
          command: toolCall.function.name,
          success: statWarning ? "partial" as const : true,
          message: stateChange,
          timestamp: Date.now(),
          toolCallId: toolCall.id,
        });
        continue;
      }

      // Special handling for edit_note (content may contain | characters like markdown tables)
      if (toolCall.function.name === "edit_note") {
        logger.action("Special handling: edit_note", {
          toolCallId: toolId,
          title: args.title,
        });

        if (!storyData.lore || storyData.lore.length === 0) {
          responses.push({
            command: toolCall.function.name,
            success: false,
            message: "No note entries defined.",
            timestamp: Date.now(),
            toolCallId: toolCall.id,
          });
          continue;
        }

        const match = findBestMatch(args.title, storyData.lore, (l) => l.title);
        if (!match) {
          responses.push({
            command: toolCall.function.name,
            success: false,
            message: `Could not find note entry matching "${args.title}"`,
            timestamp: Date.now(),
            toolCallId: toolCall.id,
          });
          continue;
        }

        const noteEntry = match.item;
        const changes: string[] = [];

        // Update title if provided and different
        if (args.newTitle && args.newTitle !== noteEntry.title) {
          noteEntry.title = args.newTitle;
          changes.push("title");
        }

        // Update content if provided
        if (args.content !== undefined) {
          noteEntry.content = args.content;
          noteEntry.embedded = false; // Mark for re-embedding
          storyData.loreEmbeddingsDirty = true;
          changes.push("content");
        }

        // Update type if provided
        if (args.type) {
          noteEntry.type = args.type;
          changes.push("type");
        }

        // Update visibility if provided (Two-Pass Visibility - see structs.ts LoreVisibility)
        if (args.visibility) {
          noteEntry.visibility = args.visibility;
          changes.push("visibility");
        }

        // Agentic notes are always on
        noteEntry.on = true;
        noteEntry.alwaysOn = true;
        noteEntry.on_triggers = [];
        noteEntry.off_triggers = [];

        if (changes.length === 0) {
          responses.push({
            command: toolCall.function.name,
            success: false,
            message: `No changes specified for note "${noteEntry.title}"`,
            timestamp: Date.now(),
            toolCallId: toolCall.id,
          });
          continue;
        }

        const stateChange = `📝 Updated note "${noteEntry.title}" (${changes.join(", ")})`;
        stateChanges.push(stateChange);

        responses.push({
          command: toolCall.function.name,
          success: true,
          message: stateChange,
          timestamp: Date.now(),
          toolCallId: toolCall.id,
        });
        continue;
      }

      // Special handling for edit_lore_replace
      if (toolCall.function.name === "edit_lore_replace") {
        logger.action("Special handling: edit_lore_replace", {
          toolCallId: toolId,
        });

        if (!storyData.lore || storyData.lore.length === 0) {
          responses.push({
            command: toolCall.function.name,
            success: false,
            message: "No lore entries defined.",
            timestamp: Date.now(),
            toolCallId: toolCall.id,
          });
          continue;
        }

        const match = findBestMatch(args.title, storyData.lore, (l) => l.title);
        if (!match) {
          responses.push({
            command: toolCall.function.name,
            success: false,
            message: `Could not find lore entry matching "${args.title}"`,
            timestamp: Date.now(),
            toolCallId: toolCall.id,
          });
          continue;
        }

        const lore = match.item;

        const findStr = args.find as string;
        const replaceStr = args.replace as string;
        const replaceAll = args.replaceAll === true;

        // Case-insensitive search
        const regex = new RegExp(
          findStr.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
          replaceAll ? "gi" : "i"
        );

        if (!regex.test(lore.content)) {
          responses.push({
            command: toolCall.function.name,
            success: false,
            message: `Could not find "${findStr}" in lore entry "${lore.title}"`,
            timestamp: Date.now(),
            toolCallId: toolCall.id,
          });
          continue;
        }

        const oldContent = lore.content;
        lore.content = lore.content.replace(regex, replaceStr);
        lore.embedded = false; // Mark for re-embedding

        const count = (oldContent.match(regex) || []).length;
        const stateChange = `📝 Updated note "${lore.title}": replaced ${
          replaceAll ? `all ${count} occurrences of` : ""
        }"${findStr}" with "${replaceStr}"`;
        stateChanges.push(stateChange);

        responses.push({
          command: toolCall.function.name,
          success: true,
          message: stateChange,
          timestamp: Date.now(),
          toolCallId: toolCall.id,
        });
        continue;
      }

      // Special handling for edit_lore_append
      if (toolCall.function.name === "edit_lore_append") {
        logger.action("Special handling: edit_lore_append", {
          toolCallId: toolId,
        });

        if (!storyData.lore || storyData.lore.length === 0) {
          responses.push({
            command: toolCall.function.name,
            success: false,
            message: "No lore entries defined.",
            timestamp: Date.now(),
            toolCallId: toolCall.id,
          });
          continue;
        }

        const match = findBestMatch(args.title, storyData.lore, (l) => l.title);
        if (!match) {
          responses.push({
            command: toolCall.function.name,
            success: false,
            message: `Could not find lore entry matching "${args.title}"`,
            timestamp: Date.now(),
            toolCallId: toolCall.id,
          });
          continue;
        }

        const lore = match.item;

        const separator = args.separator ?? "\n";
        const appendContent = args.content as string;
        lore.content = lore.content + separator + appendContent;
        lore.embedded = false; // Mark for re-embedding

        const preview =
          appendContent.length > 50
            ? appendContent.substring(0, 47) + "..."
            : appendContent;
        const stateChange = `📝 Appended to note "${lore.title}": "${preview}"`;
        stateChanges.push(stateChange);

        responses.push({
          command: toolCall.function.name,
          success: true,
          message: stateChange,
          timestamp: Date.now(),
          toolCallId: toolCall.id,
        });
        continue;
      }

      // Special handling for edit_lore_prepend
      if (toolCall.function.name === "edit_lore_prepend") {
        logger.action("Special handling: edit_lore_prepend", {
          toolCallId: toolId,
        });

        if (!storyData.lore || storyData.lore.length === 0) {
          responses.push({
            command: toolCall.function.name,
            success: false,
            message: "No lore entries defined.",
            timestamp: Date.now(),
            toolCallId: toolCall.id,
          });
          continue;
        }

        const match = findBestMatch(args.title, storyData.lore, (l) => l.title);
        if (!match) {
          responses.push({
            command: toolCall.function.name,
            success: false,
            message: `Could not find lore entry matching "${args.title}"`,
            timestamp: Date.now(),
            toolCallId: toolCall.id,
          });
          continue;
        }

        const lore = match.item;

        const separator = args.separator ?? "\n";
        const prependContent = args.content as string;
        lore.content = prependContent + separator + lore.content;
        lore.embedded = false; // Mark for re-embedding

        const preview =
          prependContent.length > 50
            ? prependContent.substring(0, 47) + "..."
            : prependContent;
        const stateChange = `📝 Prepended to note "${lore.title}": "${preview}"`;
        stateChanges.push(stateChange);

        responses.push({
          command: toolCall.function.name,
          success: true,
          message: stateChange,
          timestamp: Date.now(),
          toolCallId: toolCall.id,
        });
        continue;
      }

      // Special handling for toggle_lore
      if (toolCall.function.name === "toggle_lore") {
        logger.action("Special handling: toggle_lore", {
          toolCallId: toolId,
        });

        if (!storyData.lore || storyData.lore.length === 0) {
          responses.push({
            command: toolCall.function.name,
            success: false,
            message: "No lore entries defined.",
            timestamp: Date.now(),
            toolCallId: toolCall.id,
          });
          continue;
        }

        const match = findBestMatch(args.title, storyData.lore, (l) => l.title);
        if (!match) {
          responses.push({
            command: toolCall.function.name,
            success: false,
            message: `Could not find lore entry matching "${args.title}"`,
            timestamp: Date.now(),
            toolCallId: toolCall.id,
          });
          continue;
        }

        const lore = match.item;

        const wasOn = lore.on !== false;
        lore.on = !wasOn;

        const stateChange = wasOn
          ? `📝 Hid note "${lore.title}"`
          : `📝 Revealed note "${lore.title}"`;
        stateChanges.push(stateChange);

        responses.push({
          command: toolCall.function.name,
          success: true,
          message: stateChange,
          timestamp: Date.now(),
          toolCallId: toolCall.id,
        });
        continue;
      }

      // Special handling for edit_lore_insert
      if (toolCall.function.name === "edit_lore_insert") {
        logger.action("Special handling: edit_lore_insert", {
          toolCallId: toolId,
        });

        if (!storyData.lore || storyData.lore.length === 0) {
          responses.push({
            command: toolCall.function.name,
            success: false,
            message: "No lore entries defined.",
            timestamp: Date.now(),
            toolCallId: toolCall.id,
          });
          continue;
        }

        const match = findBestMatch(args.title, storyData.lore, (l) => l.title);
        if (!match) {
          responses.push({
            command: toolCall.function.name,
            success: false,
            message: `Could not find lore entry matching "${args.title}"`,
            timestamp: Date.now(),
            toolCallId: toolCall.id,
          });
          continue;
        }

        const lore = match.item;
        const searchPattern = args.search_line as string;
        const newContent = args.content as string;
        const position = (args.position as "above" | "below") || "below";

        // Split content into lines
        const lines = lore.content.split("\n");
        let foundIndex = -1;

        // Find the line that matches (case-insensitive contains)
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].toLowerCase().includes(searchPattern.toLowerCase())) {
            foundIndex = i;
            break;
          }
        }

        if (foundIndex === -1) {
          responses.push({
            command: toolCall.function.name,
            success: false,
            message: `Could not find line containing "${searchPattern}" in note "${lore.title}"`,
            timestamp: Date.now(),
            toolCallId: toolCall.id,
          });
          continue;
        }

        // Insert content above or below the found line
        if (position === "above") {
          lines.splice(foundIndex, 0, newContent);
        } else {
          lines.splice(foundIndex + 1, 0, newContent);
        }

        lore.content = lines.join("\n");
        lore.embedded = false; // Mark for re-embedding

        const preview =
          newContent.length > 40
            ? newContent.substring(0, 37) + "..."
            : newContent;
        const stateChange = `📝 Inserted "${preview}" ${position} line in "${lore.title}"`;
        stateChanges.push(stateChange);

        responses.push({
          command: toolCall.function.name,
          success: true,
          message: stateChange,
          timestamp: Date.now(),
          toolCallId: toolCall.id,
        });
        continue;
      }

      // Special handling for merge_lore
      if (toolCall.function.name === "merge_lore") {
        logger.action("Special handling: merge_lore", {
          toolCallId: toolId,
        });

        if (!storyData.lore || storyData.lore.length === 0) {
          responses.push({
            command: toolCall.function.name,
            success: false,
            message: "No lore entries defined.",
            timestamp: Date.now(),
            toolCallId: toolCall.id,
          });
          continue;
        }

        const sourceTitles = args.source_titles as string[];
        const targetTitle = args.target_title as string;
        const separator = (args.separator as string) || "\n\n---\n\n";
        const deleteSourcesFlag = args.delete_sources !== false; // Default true

        if (!sourceTitles || sourceTitles.length < 2) {
          responses.push({
            command: toolCall.function.name,
            success: false,
            message: "Need at least 2 source titles to merge.",
            timestamp: Date.now(),
            toolCallId: toolCall.id,
          });
          continue;
        }

        // Find all source lore entries
        const sourceLore: { item: StoryLore; index: number }[] = [];
        const notFound: string[] = [];

        for (const title of sourceTitles) {
          const match = findBestMatch(title, storyData.lore, (l) => l.title);
          if (match) {
            const index = storyData.lore.indexOf(match.item);
            sourceLore.push({ item: match.item, index });
          } else {
            notFound.push(title);
          }
        }

        if (notFound.length > 0) {
          responses.push({
            command: toolCall.function.name,
            success: false,
            message: `Could not find lore entries: ${notFound.join(", ")}`,
            timestamp: Date.now(),
            toolCallId: toolCall.id,
          });
          continue;
        }

        // Merge content
        const mergedContent = sourceLore
          .map((s) => `## ${s.item.title}\n\n${s.item.content}`)
          .join(separator);

        // Create new merged lore entry
        const newLore: StoryLore = {
          title: targetTitle,
          content: mergedContent,
          relatedCharacters: [],
          relatedLocations: [],
          secrtet: sourceLore.some((s) => s.item.secrtet),
          keys: [],
          on: sourceLore.every((s) => s.item.on !== false),
          embedded: false,
        };

        // Add the merged entry
        storyData.lore.push(newLore);

        // Delete source entries if requested (in reverse order to preserve indices)
        if (deleteSourcesFlag) {
          const indices = sourceLore.map((s) => s.index).sort((a, b) => b - a);
          for (const idx of indices) {
            storyData.lore.splice(idx, 1);
          }
        }

        const stateChange = `📝 Merged ${
          sourceTitles.length
        } notes into "${targetTitle}"${
          deleteSourcesFlag ? " (sources deleted)" : ""
        }`;
        stateChanges.push(stateChange);

        responses.push({
          command: toolCall.function.name,
          success: true,
          message: stateChange,
          timestamp: Date.now(),
          toolCallId: toolCall.id,
        });
        continue;
      }

      // Special handling for duplicate_lore
      if (toolCall.function.name === "duplicate_lore") {
        logger.action("Special handling: duplicate_lore", {
          toolCallId: toolId,
        });

        if (!storyData.lore || storyData.lore.length === 0) {
          responses.push({
            command: toolCall.function.name,
            success: false,
            message: "No lore entries defined.",
            timestamp: Date.now(),
            toolCallId: toolCall.id,
          });
          continue;
        }

        const match = findBestMatch(
          args.source_title,
          storyData.lore,
          (l) => l.title
        );
        if (!match) {
          responses.push({
            command: toolCall.function.name,
            success: false,
            message: `Could not find lore entry matching "${args.source_title}"`,
            timestamp: Date.now(),
            toolCallId: toolCall.id,
          });
          continue;
        }

        const sourceLore = match.item;
        const newTitle = args.new_title as string;

        // Check if new title already exists
        const existingMatch = findBestMatch(
          newTitle,
          storyData.lore,
          (l) => l.title
        );
        if (existingMatch && existingMatch.score > 0.9) {
          responses.push({
            command: toolCall.function.name,
            success: false,
            message: `A note with title "${newTitle}" already exists`,
            timestamp: Date.now(),
            toolCallId: toolCall.id,
          });
          continue;
        }

        // Create duplicate with new title
        const newLore: StoryLore = {
          title: newTitle,
          content: sourceLore.content,
          relatedCharacters: sourceLore.relatedCharacters
            ? [...sourceLore.relatedCharacters]
            : [],
          relatedLocations: sourceLore.relatedLocations
            ? [...sourceLore.relatedLocations]
            : [],
          secrtet: sourceLore.secrtet,
          keys: sourceLore.keys ? [...sourceLore.keys] : [],
          on: sourceLore.on,
          on_triggers: sourceLore.on_triggers
            ? [...sourceLore.on_triggers]
            : undefined,
          off_triggers: sourceLore.off_triggers
            ? [...sourceLore.off_triggers]
            : undefined,
          var_on_triggers: sourceLore.var_on_triggers
            ? [...sourceLore.var_on_triggers]
            : undefined,
          var_off_triggers: sourceLore.var_off_triggers
            ? [...sourceLore.var_off_triggers]
            : undefined,
          type: sourceLore.type,
          tags: sourceLore.tags ? [...sourceLore.tags] : undefined,
          folder: sourceLore.folder,
          embedded: false, // New copy needs embedding
        };

        storyData.lore.push(newLore);

        const stateChange = `📝 Duplicated "${sourceLore.title}" as "${newTitle}"`;
        stateChanges.push(stateChange);

        responses.push({
          command: toolCall.function.name,
          success: true,
          message: stateChange,
          timestamp: Date.now(),
          toolCallId: toolCall.id,
        });
        continue;
      }

      // Special handling for search_notes (read-only)
      if (toolCall.function.name === "search_notes") {
        logger.action("Special handling: search_notes", {
          toolCallId: toolId,
          args,
        });

        // Phase 4 grounding gate (campaignPlan.ts / docs/gm-plan-notes-design.md):
        // mark that the GM has looked at existing notes this turn, whatever
        // the search finds - the point is the GM made the effort to check.
        storyData.notesReadThisTurn = true;

        if (!storyData.lore || storyData.lore.length === 0) {
          responses.push({
            command: toolCall.function.name,
            success: true,
            message: "No lore entries to search.",
            timestamp: Date.now(),
            toolCallId: toolCall.id,
          });
          continue;
        }

        // Validate required query parameter
        if (!args.query || typeof args.query !== "string") {
          responses.push({
            command: toolCall.function.name,
            success: false,
            message: `search_notes requires a 'query' string parameter (got: ${JSON.stringify(
              args
            )})`,
            timestamp: Date.now(),
            toolCallId: toolCall.id,
          });
          continue;
        }

        const includeHidden = args.includeHidden !== false; // Default true
        const maxResults = (args.maxResults as number) || 10;
        const type = typeof args.type === "string" ? args.type : undefined;
        const tags = Array.isArray(args.tags)
          ? (args.tags as unknown[]).filter((t): t is string => typeof t === "string")
          : undefined;

        const results = searchLoreEntries(storyData.lore, args.query, {
          includeHidden,
          maxResults,
          type,
          tags,
        });

        const message =
          results.length > 0
            ? `Found ${results.length} match${
                results.length === 1 ? "" : "es"
              }:\n${results
                .map((r) =>
                  r.lineNum > 0
                    ? `• "${r.title}" (L${r.lineNum}): ${r.excerpt}`
                    : `• "${r.title}": ${r.excerpt}`
                )
                .join("\n")}`
            : `No matches found for "${args.query}"`;

        responses.push({
          command: toolCall.function.name,
          success: true,
          message: message,
          timestamp: Date.now(),
          toolCallId: toolCall.id,
        });
        continue;
      }

      // === Advanced RPG Tools TOOL HANDLERS ===

      // Increment scene
      if (toolCall.function.name === "increment_scene") {
        storyData.agmtState = storyData.agmtState || {
          chaosFactor: 5,
          sceneCount: 0,
          skillCheckHistory: [],
          currentStreak: 0,
          lastChaosAdjustment: -999,
        };

        const oldCount = storyData.agmtState.sceneCount;
        const oldChaos = storyData.agmtState.chaosFactor;

        // Increment scene
        storyData.agmtState.sceneCount++;

        // Record this as a scene boundary for compaction.ts to prefer over
        // an arbitrary token-budget cutoff (see §3.2 in
        // docs/research-paper-ttrpg-theory-gap-analysis.md).
        storyData.scene.lastSceneBoundaryIndex = storyData.scene.parts.length;

        // Scene check (Mythic-style): roll against the current chaos
        // factor to see whether the new scene proceeds as expected
        // (Normal), is subverted (Altered), or is replaced entirely by a
        // random event (Interrupted). Chaos then moves toward whichever
        // direction that outcome implies - up when control was lost,
        // down when the scene resolved as expected - the same external,
        // roll-driven signal in both directions, not a model self-report
        // of "did things go well" (which would just reopen the leniency
        // problem this mechanic exists to prevent).
        const { sceneType, roll: sceneRoll } = checkScene(oldChaos);
        const newChaos = adjustChaosFactor(
          oldChaos,
          sceneType === "Normal" ? -1 : 1
        );
        storyData.agmtState.chaosFactor = newChaos;
        storyData.agmtState.lastChaosAdjustment = storyData.agmtState.sceneCount;

        // Director-layer tension estimate: same hook point as chaos,
        // nudged by the same scene check plus combat/timer pressure - see
        // adjustTension (mythic.ts).
        const oldTension = storyData.agmtState.tension ?? 5;
        storyData.agmtState.tension = adjustTension(oldTension, {
          sceneType,
          combatActive: storyData.combatState?.active,
          timerNearZero: (storyData.timers || []).some(
            (t) => t.status === "active" && t.currentTicks <= 1
          ),
        });

        // Director move selection: a deterministic policy, not the model's
        // own choice (see selectDirectorMove's doc comment). Persisted the
        // same way pendingRandomEvents is, so it keeps reappearing until
        // acknowledge_director_move is called.
        const directorMove = selectDirectorMove(storyData, sceneType);
        if (directorMove) {
          storyData.pendingDirectorMoves = storyData.pendingDirectorMoves || [];
          storyData.pendingDirectorMoves.push(directorMove);
          if (
            storyData.pendingDirectorMoves.length > MAX_PENDING_DIRECTOR_MOVES
          ) {
            storyData.pendingDirectorMoves = storyData.pendingDirectorMoves.slice(
              -MAX_PENDING_DIRECTOR_MOVES
            );
          }
        }

        // Build response message
        let message = `✓ Scene count: ${oldCount} → ${oldCount + 1}`;
        message += `\n🎲 Scene Check: rolled ${sceneRoll} vs chaos ${oldChaos} → ${sceneType}`;

        if (newChaos !== oldChaos) {
          message +=
            newChaos > oldChaos
              ? `\n⚠️ Chaos increased to ${newChaos} (scene ${sceneType.toLowerCase()} - control was lost)`
              : `\n📉 Chaos decreased to ${newChaos} (scene resolved as expected)`;
        }

        let eventFocus: string | undefined;
        let eventMeaning: { action: string; subject: string } | undefined;
        if (sceneType === "Interrupted") {
          eventFocus = generateEventFocus().focus;
          const meaning = generateEventMeaning();
          eventMeaning = { action: meaning.action, subject: meaning.subject };

          // Persist as tracked state rather than a one-line hint that
          // vanishes whether or not this turn's narration used it - see
          // the matching fate_question path in gmExecutor.ts.
          storyData.pendingRandomEvents = storyData.pendingRandomEvents || [];
          const pendingEvent: PendingRandomEvent = {
            id: `event_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            source: "scene_check",
            focus: eventFocus,
            action: eventMeaning.action,
            subject: eventMeaning.subject,
            // Same pairing as the fate_question path: the action/subject
            // says what happens, the portent says what it's about.
            portent: rollPortent(
              "portent",
              selectFrame(storyData),
              currentTint(storyData)
            ).statement,
            context: `Scene ${storyData.agmtState.sceneCount} interrupted (roll ${sceneRoll} vs chaos ${oldChaos})`,
            createdAt: Date.now(),
          };
          storyData.pendingRandomEvents.push(pendingEvent);
          if (
            storyData.pendingRandomEvents.length > MAX_PENDING_RANDOM_EVENTS
          ) {
            storyData.pendingRandomEvents = storyData.pendingRandomEvents.slice(
              -MAX_PENDING_RANDOM_EVENTS
            );
          }

          message += `\n⚡ SCENE INTERRUPTED! The expected scene doesn't happen - replace it with a random event: [${eventFocus}] "${eventMeaning.action} ${eventMeaning.subject}". Incorporate this into the next narration, then call resolve_random_event(id: "${pendingEvent.id}"). It will keep reappearing every turn until resolved.`;
        } else if (sceneType === "Altered") {
          message += `\n🔀 Scene Altered: the expected scene happens, but with an unexpected twist - don't play it exactly as planned.`;
        }

        if (directorMove) {
          const label = directorMove.move.replace(/_/g, " ");
          message += `\n🎬 Director move: ${label}${
            directorMove.context ? ` (${directorMove.context})` : ""
          }`;

          // spotlight_tag carries sampled inspiration (3 of the tag's 10
          // curated examples, each with a suggested roll_table table_name -
          // see tagFocusExamples.ts) that the generic context string above
          // doesn't have room for. Listed as optional inspiration, not a
          // script: the model picks one, blends them, or ignores all three
          // and improvises its own take on the tag - same "engine decides
          // when, model decides how" split every other move uses.
          if (
            directorMove.move === "spotlight_tag" &&
            directorMove.tagFocusExamples?.length
          ) {
            const examplesText = directorMove.tagFocusExamples
              .map(
                (ex, i) =>
                  `  ${i + 1}. ${ex.prompt} (optional: roll_table table_name="${ex.table}" for inspiration)`
              )
              .join("\n");
            message += `\nInspiration - pick one, blend them, or improvise your own take on the tag:\n${examplesText}`;
          }

          // The two pressure moves carry a rolled complication (see
          // primaMateria.ts). Same status as the tag examples above: a
          // seed the model shapes to fit, not a line to reproduce. Its
          // job is to break the handful of complications the model
          // otherwise reaches for every time.
          if (directorMove.complicationSeed) {
            message += `\nComplication seed (shape this to fit the fiction - don't reproduce the wording, and don't name the mechanism): "${directorMove.complicationSeed}"`;
          }

          message += ` - render this as prose without naming it, then call acknowledge_director_move(id: "${directorMove.id}"). It will keep reappearing every turn until resolved.`;
        }

        // GM advice: 1-2 curated facilitation tips for the scene that's
        // about to start (see gmAdvice.ts). Purely advisory - unlike pending
        // random events/director moves, there's nothing to acknowledge; it's
        // delivered once via this tool result and never repeated.
        const { tips: gmAdviceTips, updatedShownIds } = selectGMAdviceForScene(
          storyData.shownGMAdviceIds,
          !!storyData.combatState?.active
        );
        storyData.shownGMAdviceIds = updatedShownIds;
        message += formatGMAdviceNote(gmAdviceTips);

        logger.action("Scene count incremented via tool", {
          toolCallId: toolId,
          oldCount,
          newCount: oldCount + 1,
          oldChaos,
          newChaos,
          sceneType,
          sceneRoll,
          chaosAdjusted: newChaos !== oldChaos,
        });
        responses.push({
          command: `/increment_scene: ${oldCount} → ${oldCount + 1}`,
          success: true,
          message,
          timestamp: Date.now(),
          toolCallId: toolCall.id,
        });
        continue;
      }

      // Resolve a pending random event (from fate_question or a scene
      // check) - the explicit acknowledgement that closes the loop this
      // tool exists for: an event persists and keeps reappearing in
      // context every turn until the GM confirms it was addressed here,
      // rather than a one-line hint that's just as easy to miss as to use.
      if (toolCall.function.name === "resolve_random_event") {
        const id = args.id?.trim();
        const howIncorporated = args.how_incorporated?.trim();

        if (!id) {
          responses.push({
            command: "/resolve_random_event",
            success: false,
            message: "✗ Event id is required",
            timestamp: Date.now(),
            toolCallId: toolCall.id,
          });
          continue;
        }

        const events = storyData.pendingRandomEvents || [];
        const eventIndex = events.findIndex((e) => e.id === id);

        if (eventIndex === -1) {
          responses.push({
            command: `/resolve_random_event: ${id}`,
            success: false,
            message: `✗ No pending random event with id "${id}" (it may already be resolved)`,
            timestamp: Date.now(),
            toolCallId: toolCall.id,
          });
          continue;
        }

        const [resolved] = events.splice(eventIndex, 1);
        storyData.pendingRandomEvents = events;

        logger.action("Random event resolved via tool", {
          toolCallId: toolId,
          id,
          focus: resolved.focus,
          howIncorporated,
        });
        responses.push({
          command: `/resolve_random_event: ${id}`,
          success: true,
          message: `✓ Random event resolved: [${resolved.focus}] "${
            resolved.action
          } ${resolved.subject}"${
            howIncorporated ? ` - ${howIncorporated}` : ""
          }`,
          timestamp: Date.now(),
          toolCallId: toolCall.id,
        });
        continue;
      }

      // Acknowledge a pending director move - same close-the-loop shape as
      // resolve_random_event above: the move persists and keeps
      // reappearing in context every turn until the GM confirms it was
      // rendered into the narration.
      if (toolCall.function.name === "acknowledge_director_move") {
        const id = args.id?.trim();
        const howIncorporated = args.how_incorporated?.trim();

        if (!id) {
          responses.push({
            command: "/acknowledge_director_move",
            success: false,
            message: "✗ Move id is required",
            timestamp: Date.now(),
            toolCallId: toolCall.id,
          });
          continue;
        }

        const moves = storyData.pendingDirectorMoves || [];
        const moveIndex = moves.findIndex((m) => m.id === id);

        if (moveIndex === -1) {
          responses.push({
            command: `/acknowledge_director_move: ${id}`,
            success: false,
            message: `✗ No pending director move with id "${id}" (it may already be resolved)`,
            timestamp: Date.now(),
            toolCallId: toolCall.id,
          });
          continue;
        }

        const [resolved] = moves.splice(moveIndex, 1);
        storyData.pendingDirectorMoves = moves;

        logger.action("Director move acknowledged via tool", {
          toolCallId: toolId,
          id,
          move: resolved.move,
          howIncorporated,
        });
        responses.push({
          command: `/acknowledge_director_move: ${id}`,
          success: true,
          message: `✓ Director move acknowledged: ${resolved.move.replace(
            /_/g,
            " "
          )}${howIncorporated ? ` - ${howIncorporated}` : ""}`,
          timestamp: Date.now(),
          toolCallId: toolCall.id,
        });
        continue;
      }

      // Game over
      if (toolCall.function.name === "game_over") {
        const reason = args.reason?.trim();

        if (!reason || reason.length < 10) {
          const errorMsg = "Game over reason must be at least 10 characters";
          logger.error(`Tool call failed: ${errorMsg}`, {
            toolCallId: toolId,
            toolName,
          });
          responses.push({
            command: `/game_over`,
            success: false,
            message: errorMsg,
            timestamp: Date.now(),
            toolCallId: toolCall.id,
          });
          continue;
        }

        // Deterministic gate: game_over is a fatal, irreversible outcome and
        // must be earned through state the engine already tracks - the
        // player's own combatant being downed in active combat - not
        // narrative say-so alone. This mirrors the tool's own schema
        // description.
        const playerCombatant = storyData.combatState?.active
          ? storyData.combatState.combatants.find((c) => c.type === "player")
          : undefined;
        const playerIsDowned =
          !!playerCombatant &&
          (!playerCombatant.isActive ||
            (typeof playerCombatant.stats?.HP === "number" &&
              playerCombatant.stats.HP <= 0));

        if (!playerIsDowned) {
          const errorMsg =
            "Cannot end the game: no downed player combatant was found. Reduce the player's HP to 0 in active combat before calling game_over.";
          logger.error(`Tool call failed: ${errorMsg}`, {
            toolCallId: toolId,
            toolName,
          });
          responses.push({
            command: `/game_over`,
            success: false,
            message: errorMsg,
            timestamp: Date.now(),
            toolCallId: toolCall.id,
          });
          continue;
        }

        // Mark story as game over
        storyData.gameOver = {
          reason,
          timestamp: Date.now(),
        };

        logger.action("Game over triggered via tool", {
          toolCallId: toolId,
          reason,
        });
        responses.push({
          command: `/game_over: ${reason}`,
          success: true,
          message: `⚠️ GAME OVER: ${reason}`,
          timestamp: Date.now(),
          toolCallId: toolCall.id,
        });
        continue;
      }

      // === SCENE CHALLENGE (PROGRESS CLOCK) TOOL HANDLERS ===

      // Start a new challenge
      if (toolCall.function.name === "start_challenge") {
        const name = args.name?.trim();
        const description = args.description?.trim();
        // Rounds can be a tier string or number - convert using tier system
        let rounds = parseChallengeRoundsValue(args.rounds ?? "standard");
        const initialSuccesses = Math.min(args.initialSuccesses ?? 0, 3);
        const initialFailures = Math.min(args.initialFailures ?? 0, 3);

        // Ensure rounds is odd and within bounds (3, 5, 7, or 9)
        if (rounds < 3) rounds = 3;
        if (rounds > 9) rounds = 9;
        if (rounds % 2 === 0) rounds += 1; // Make odd

        if (!name || name.length < 3) {
          const errorMsg = "Challenge name must be at least 3 characters";
          logger.error(`Tool call failed: ${errorMsg}`, {
            toolCallId: toolId,
            toolName,
          });
          responses.push({
            command: `/start_challenge: ${name || ""}`,
            success: false,
            message: errorMsg,
            timestamp: Date.now(),
            toolCallId: toolCall.id,
          });
          continue;
        }

        // Check if there's already an active challenge
        if (storyData.activeChallenge?.active) {
          const errorMsg = `Cannot start new challenge: "${storyData.activeChallenge.name}" is still active`;
          logger.error(`Tool call failed: ${errorMsg}`, {
            toolCallId: toolId,
            toolName,
          });
          responses.push({
            command: `/start_challenge: ${name}`,
            success: false,
            message: errorMsg,
            timestamp: Date.now(),
            toolCallId: toolCall.id,
          });
          continue;
        }

        const majority = Math.ceil(rounds / 2);

        // Create the new challenge
        storyData.activeChallenge = {
          id: crypto.randomUUID(),
          name,
          description,
          rounds,
          currentSuccesses: initialSuccesses,
          currentFailures: initialFailures,
          active: true,
          createdAt: Date.now(),
        };

        logger.action("Challenge started via tool", {
          toolCallId: toolId,
          name,
          rounds,
          majority,
          initialSuccesses,
          initialFailures,
        });
        responses.push({
          command: `/start_challenge: ${name}`,
          success: true,
          message: `🎯 CHALLENGE STARTED: ${name} (Best of ${rounds} - first to ${majority}) [Score: ${initialSuccesses}-${initialFailures}]`,
          timestamp: Date.now(),
          toolCallId: toolCall.id,
        });
        continue;
      }

      // Update challenge progress
      if (toolCall.function.name === "update_challenge") {
        const successIncrement = args.successIncrement ?? 0;
        const failureIncrement = args.failureIncrement ?? 0;

        if (!storyData.activeChallenge?.active) {
          const errorMsg = "No active challenge to update";
          logger.error(`Tool call failed: ${errorMsg}`, {
            toolCallId: toolId,
            toolName,
          });
          responses.push({
            command: `/update_challenge`,
            success: false,
            message: errorMsg,
            timestamp: Date.now(),
            toolCallId: toolCall.id,
          });
          continue;
        }

        if (successIncrement === 0 && failureIncrement === 0) {
          const errorMsg = "Must specify successIncrement or failureIncrement";
          logger.error(`Tool call failed: ${errorMsg}`, {
            toolCallId: toolId,
            toolName,
          });
          responses.push({
            command: `/update_challenge`,
            success: false,
            message: errorMsg,
            timestamp: Date.now(),
            toolCallId: toolCall.id,
          });
          continue;
        }

        const challenge = storyData.activeChallenge;
        const oldSuccesses = challenge.currentSuccesses;
        const oldFailures = challenge.currentFailures;

        challenge.currentSuccesses += successIncrement;
        challenge.currentFailures += failureIncrement;

        // Check for automatic resolution (best of X - first to majority wins)
        const majority = Math.ceil(challenge.rounds / 2);
        let autoResolved = false;
        let autoResult: "won" | "lost" | null = null;

        if (challenge.currentSuccesses >= majority) {
          autoResolved = true;
          autoResult = "won";
          challenge.active = false;
          challenge.resolvedAt = Date.now();
          challenge.result = "won";
        } else if (challenge.currentFailures >= majority) {
          autoResolved = true;
          autoResult = "lost";
          challenge.active = false;
          challenge.resolvedAt = Date.now();
          challenge.result = "lost";
        }

        const scoreStr = `[Score: ${challenge.currentSuccesses}-${challenge.currentFailures}]`;
        let message = "";

        if (successIncrement > 0 && failureIncrement > 0) {
          message = `${challenge.name}: +${successIncrement} success, +${failureIncrement} failure ${scoreStr}`;
        } else if (successIncrement > 0) {
          message = `${challenge.name}: +${successIncrement} success${
            successIncrement > 1 ? "es" : ""
          } ${scoreStr}`;
        } else {
          message = `${challenge.name}: +${failureIncrement} failure${
            failureIncrement > 1 ? "s" : ""
          } ${scoreStr}`;
        }

        if (autoResolved) {
          if (autoResult === "won") {
            message += `\n🏆 CHALLENGE WON: ${challenge.name}!`;
          } else {
            message += `\n💀 CHALLENGE LOST: ${challenge.name}!`;
          }
        }

        logger.action("Challenge updated via tool", {
          toolCallId: toolId,
          name: challenge.name,
          oldSuccesses,
          newSuccesses: challenge.currentSuccesses,
          oldFailures,
          newFailures: challenge.currentFailures,
          autoResolved,
          autoResult,
        });
        responses.push({
          command: `/update_challenge: +${successIncrement}s, +${failureIncrement}f`,
          success: true,
          message,
          timestamp: Date.now(),
          toolCallId: toolCall.id,
        });
        continue;
      }

      // Manually resolve challenge
      if (toolCall.function.name === "resolve_challenge") {
        const result = args.result as "won" | "lost";
        const reason = args.reason?.trim();

        if (!storyData.activeChallenge?.active) {
          const errorMsg = "No active challenge to resolve";
          logger.error(`Tool call failed: ${errorMsg}`, {
            toolCallId: toolId,
            toolName,
          });
          responses.push({
            command: `/resolve_challenge`,
            success: false,
            message: errorMsg,
            timestamp: Date.now(),
            toolCallId: toolCall.id,
          });
          continue;
        }

        if (result !== "won" && result !== "lost") {
          const errorMsg = "Result must be 'won' or 'lost'";
          logger.error(`Tool call failed: ${errorMsg}`, {
            toolCallId: toolId,
            toolName,
          });
          responses.push({
            command: `/resolve_challenge`,
            success: false,
            message: errorMsg,
            timestamp: Date.now(),
            toolCallId: toolCall.id,
          });
          continue;
        }

        const challenge = storyData.activeChallenge;
        challenge.active = false;
        challenge.resolvedAt = Date.now();
        challenge.result = result;

        let message = "";
        if (result === "won") {
          message = `🏆 CHALLENGE WON: ${challenge.name}!${
            reason ? ` - ${reason}` : ""
          }`;
        } else {
          message = `💀 CHALLENGE LOST: ${challenge.name}!${
            reason ? ` - ${reason}` : ""
          }`;
        }

        logger.action("Challenge resolved via tool", {
          toolCallId: toolId,
          name: challenge.name,
          result,
          reason,
        });
        responses.push({
          command: `/resolve_challenge: ${result}`,
          success: true,
          message,
          timestamp: Date.now(),
          toolCallId: toolCall.id,
        });
        continue;
      }

      // Cancel challenge (no win/loss)
      if (toolCall.function.name === "cancel_challenge") {
        const reason = args.reason?.trim();

        if (!storyData.activeChallenge?.active) {
          const errorMsg = "No active challenge to cancel";
          logger.error(`Tool call failed: ${errorMsg}`, {
            toolCallId: toolId,
            toolName,
          });
          responses.push({
            command: `/cancel_challenge`,
            success: false,
            message: errorMsg,
            timestamp: Date.now(),
            toolCallId: toolCall.id,
          });
          continue;
        }

        if (!reason || reason.length < 5) {
          const errorMsg = "Cancellation reason must be at least 5 characters";
          logger.error(`Tool call failed: ${errorMsg}`, {
            toolCallId: toolId,
            toolName,
          });
          responses.push({
            command: `/cancel_challenge`,
            success: false,
            message: errorMsg,
            timestamp: Date.now(),
            toolCallId: toolCall.id,
          });
          continue;
        }

        const challenge = storyData.activeChallenge;
        const challengeName = challenge.name;

        // Clear the challenge without setting a result
        challenge.active = false;
        challenge.resolvedAt = Date.now();
        // Note: result remains undefined for cancelled challenges

        const message = `⏹️ CHALLENGE CANCELLED: ${challengeName} - ${reason}`;

        logger.action("Challenge cancelled via tool", {
          toolCallId: toolId,
          name: challengeName,
          reason,
          score: `${challenge.currentSuccesses}-${challenge.currentFailures}`,
        });
        responses.push({
          command: `/cancel_challenge: ${reason}`,
          success: true,
          message,
          timestamp: Date.now(),
          toolCallId: toolCall.id,
        });
        continue;
      }

      // === ADD NPC TOOL HANDLER ===
      // Creates a lore entry for important NPCs
      if (toolCall.function.name === "add_npc") {
        const name = args.name?.trim();
        const role = args.role?.trim();
        const disposition = args.disposition?.trim() || "neutral";
        const appearance = args.appearance?.trim();
        const personality = args.personality?.trim();
        const motivation = args.motivation?.trim();
        const secret = args.secret?.trim();
        const location = args.location?.trim();

        // Validate required fields
        if (!name || name.length < 2) {
          const errorMsg = "NPC name must be at least 2 characters";
          logger.error(`Tool call failed: ${errorMsg}`, {
            toolCallId: toolId,
            toolName,
          });
          responses.push({
            command: `/add_npc: ${name || ""}`,
            success: false,
            message: errorMsg,
            timestamp: Date.now(),
            toolCallId: toolCall.id,
          });
          continue;
        }

        if (!role || role.length < 3) {
          const errorMsg = "NPC role must be at least 3 characters";
          logger.error(`Tool call failed: ${errorMsg}`, {
            toolCallId: toolId,
            toolName,
          });
          responses.push({
            command: `/add_npc: ${name}`,
            success: false,
            message: errorMsg,
            timestamp: Date.now(),
            toolCallId: toolCall.id,
          });
          continue;
        }

        if (!appearance || appearance.length < 10) {
          const errorMsg = "NPC appearance must be at least 10 characters";
          logger.error(`Tool call failed: ${errorMsg}`, {
            toolCallId: toolId,
            toolName,
          });
          responses.push({
            command: `/add_npc: ${name}`,
            success: false,
            message: errorMsg,
            timestamp: Date.now(),
            toolCallId: toolCall.id,
          });
          continue;
        }

        // Check for duplicate lore
        if (!storyData.lore) {
          storyData.lore = [];
        }
        const existingLore = storyData.lore.find(
          (l) => l.title.toLowerCase() === name.toLowerCase()
        );
        if (existingLore) {
          const errorMsg = `Lore entry "${name}" already exists`;
          logger.error(`Tool call failed: ${errorMsg}`, {
            toolCallId: toolId,
            toolName,
          });
          responses.push({
            command: `/add_npc: ${name}`,
            success: false,
            message: errorMsg,
            timestamp: Date.now(),
            toolCallId: toolCall.id,
          });
          continue;
        }

        // Build lore content
        let loreContent = `**${role}**\n\n`;
        loreContent += `**Disposition:** ${disposition}\n\n`;
        loreContent += `**Appearance:** ${appearance}\n\n`;
        loreContent += `**Personality:** ${personality}\n\n`;
        if (motivation) {
          loreContent += `**Motivation:** ${motivation}\n\n`;
        }
        if (location) {
          loreContent += `**Usually Found:** ${location}\n\n`;
        }
        if (secret) {
          loreContent += `**Secret:** ${secret}\n`;
        }

        // Create lore entry with the NPC's name as a trigger
        const nameParts = name.split(/\s+/);
        const triggers: string[] = [name.toLowerCase()];
        // Add first name and last name as separate triggers if multi-word
        if (nameParts.length > 1) {
          nameParts.forEach((part: string) => {
            if (part.length > 2) {
              triggers.push(part.toLowerCase());
            }
          });
        }

        storyData.lore.push({
          title: name,
          content: loreContent.trim(),
          relatedCharacters: [],
          relatedLocations: location ? [location] : [],
          secrtet: !!secret, // Note: typo in interface
          keys: [],
          enabled: true,
          alwaysOn: false,
          on: true, // Start visible since they were just introduced
          on_triggers: triggers,
          off_triggers: [],
          embedded: false, // Mark for embedding sync
        });

        // Mark lore as dirty for embedding sync
        storyData.loreEmbeddingsDirty = true;

        logger.action("NPC added via tool", {
          toolCallId: toolId,
          name,
          role,
          disposition,
          hasSecret: !!secret,
        });

        responses.push({
          command: `/add_npc: ${name}`,
          success: true,
          message: `✓ Added NPC: ${name} (${role}) - ${disposition}`,
          timestamp: Date.now(),
          toolCallId: toolCall.id,
        });

        // Add state change for the story stage
        stateChanges.push(
          `New NPC introduced: ${name} (${role}, ${disposition})`
        );
        continue;
      }

      // === REST SYSTEM TOOL HANDLER ===
      if (toolCall.function.name === "take_rest") {
        const restResult = executeRestTool(args, storyData, toolId);
        responses.push({
          ...restResult,
          toolCallId: toolCall.id,
        });
        continue;
      }

      // === THREAD MANAGEMENT TOOL HANDLERS ===
      if (toolCall.function.name === "create_thread") {
        const { title, description, priority } = args;

        if (!title || !description) {
          responses.push({
            command: "/create_thread",
            success: false,
            message: "✗ Thread title and description are required",
            timestamp: Date.now(),
            toolCallId: toolCall.id,
          });
          continue;
        }

        // Initialize threads array if needed
        if (!storyData.threads) {
          storyData.threads = [];
        }

        // Check for duplicate title
        const existingThread = storyData.threads.find(
          (t) => t.title.toLowerCase() === title.toLowerCase()
        );
        if (existingThread) {
          responses.push({
            command: `/create_thread: ${title}`,
            success: false,
            message: `✗ Thread '${title}' already exists`,
            timestamp: Date.now(),
            toolCallId: toolCall.id,
          });
          continue;
        }

        const newThread: StoryThread = {
          id: `thread_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          title,
          description,
          status: "active",
          priority: priority || "side",
          createdAt: Date.now(),
        };

        storyData.threads.push(newThread);

        responses.push({
          command: `/create_thread: ${title}`,
          success: true,
          message: `✓ Created ${priority || "side"} thread: ${title}`,
          timestamp: Date.now(),
          toolCallId: toolCall.id,
        });
        stateChanges.push(`New thread: ${title} (${priority || "side"})`);
        continue;
      }

      if (toolCall.function.name === "update_thread") {
        const { title, description, priority } = args;

        if (!title) {
          responses.push({
            command: "/update_thread",
            success: false,
            message: "✗ Thread title is required",
            timestamp: Date.now(),
            toolCallId: toolCall.id,
          });
          continue;
        }

        if (!storyData.threads || storyData.threads.length === 0) {
          responses.push({
            command: `/update_thread: ${title}`,
            success: false,
            message: "✗ No threads exist",
            timestamp: Date.now(),
            toolCallId: toolCall.id,
          });
          continue;
        }

        // Find thread (fuzzy match)
        const thread = storyData.threads.find(
          (t) =>
            t.title.toLowerCase().includes(title.toLowerCase()) ||
            title.toLowerCase().includes(t.title.toLowerCase())
        );

        if (!thread) {
          responses.push({
            command: `/update_thread: ${title}`,
            success: false,
            message: `✗ Thread '${title}' not found`,
            timestamp: Date.now(),
            toolCallId: toolCall.id,
          });
          continue;
        }

        if (thread.status !== "active") {
          responses.push({
            command: `/update_thread: ${thread.title}`,
            success: false,
            message: `✗ Thread '${thread.title}' is ${thread.status}, cannot update`,
            timestamp: Date.now(),
            toolCallId: toolCall.id,
          });
          continue;
        }

        const changes: string[] = [];
        if (description) {
          thread.description = description;
          changes.push("description");
        }
        if (priority) {
          thread.priority = priority;
          changes.push(`priority → ${priority}`);
        }

        if (changes.length === 0) {
          responses.push({
            command: `/update_thread: ${thread.title}`,
            success: false,
            message: "✗ No changes provided",
            timestamp: Date.now(),
            toolCallId: toolCall.id,
          });
          continue;
        }

        responses.push({
          command: `/update_thread: ${thread.title}`,
          success: true,
          message: `✓ Updated thread '${thread.title}': ${changes.join(", ")}`,
          timestamp: Date.now(),
          toolCallId: toolCall.id,
        });
        stateChanges.push(`Thread updated: ${thread.title}`);
        continue;
      }

      if (toolCall.function.name === "resolve_thread") {
        const { title, resolution } = args;

        if (!title) {
          responses.push({
            command: "/resolve_thread",
            success: false,
            message: "✗ Thread title is required",
            timestamp: Date.now(),
            toolCallId: toolCall.id,
          });
          continue;
        }

        if (!storyData.threads || storyData.threads.length === 0) {
          responses.push({
            command: `/resolve_thread: ${title}`,
            success: false,
            message: "✗ No threads exist",
            timestamp: Date.now(),
            toolCallId: toolCall.id,
          });
          continue;
        }

        // Find thread (fuzzy match)
        const thread = storyData.threads.find(
          (t) =>
            t.title.toLowerCase().includes(title.toLowerCase()) ||
            title.toLowerCase().includes(t.title.toLowerCase())
        );

        if (!thread) {
          responses.push({
            command: `/resolve_thread: ${title}`,
            success: false,
            message: `✗ Thread '${title}' not found`,
            timestamp: Date.now(),
            toolCallId: toolCall.id,
          });
          continue;
        }

        if (thread.status !== "active") {
          responses.push({
            command: `/resolve_thread: ${thread.title}`,
            success: false,
            message: `✗ Thread '${thread.title}' is already ${thread.status}`,
            timestamp: Date.now(),
            toolCallId: toolCall.id,
          });
          continue;
        }

        thread.status = "resolved";
        thread.resolvedAt = Date.now();
        if (resolution) {
          thread.description = `${thread.description}\n\n[RESOLVED: ${resolution}]`;
        }

        responses.push({
          command: `/resolve_thread: ${thread.title}`,
          success: true,
          message: `✓ Resolved thread: ${thread.title}`,
          timestamp: Date.now(),
          toolCallId: toolCall.id,
        });
        stateChanges.push(`Thread resolved: ${thread.title}`);
        continue;
      }

      if (toolCall.function.name === "abandon_thread") {
        const { title, reason } = args;

        if (!title) {
          responses.push({
            command: "/abandon_thread",
            success: false,
            message: "✗ Thread title is required",
            timestamp: Date.now(),
            toolCallId: toolCall.id,
          });
          continue;
        }

        if (!storyData.threads || storyData.threads.length === 0) {
          responses.push({
            command: `/abandon_thread: ${title}`,
            success: false,
            message: "✗ No threads exist",
            timestamp: Date.now(),
            toolCallId: toolCall.id,
          });
          continue;
        }

        // Find thread (fuzzy match)
        const thread = storyData.threads.find(
          (t) =>
            t.title.toLowerCase().includes(title.toLowerCase()) ||
            title.toLowerCase().includes(t.title.toLowerCase())
        );

        if (!thread) {
          responses.push({
            command: `/abandon_thread: ${title}`,
            success: false,
            message: `✗ Thread '${title}' not found`,
            timestamp: Date.now(),
            toolCallId: toolCall.id,
          });
          continue;
        }

        if (thread.status !== "active") {
          responses.push({
            command: `/abandon_thread: ${thread.title}`,
            success: false,
            message: `✗ Thread '${thread.title}' is already ${thread.status}`,
            timestamp: Date.now(),
            toolCallId: toolCall.id,
          });
          continue;
        }

        thread.status = "abandoned";
        thread.resolvedAt = Date.now();
        if (reason) {
          thread.description = `${thread.description}\n\n[ABANDONED: ${reason}]`;
        }

        responses.push({
          command: `/abandon_thread: ${thread.title}`,
          success: true,
          message: `✓ Abandoned thread: ${thread.title}`,
          timestamp: Date.now(),
          toolCallId: toolCall.id,
        });
        stateChanges.push(`Thread abandoned: ${thread.title}`);
        continue;
      }

      // Direct typed dispatch - no string command round trip. Handles
      // complete_goal, fail_goal, update_goal, delete_goal,
      // delete_note, remove_ability, modify_ability,
      // upgrade_ability, reset_ability_cooldown, refresh_ability,
      // reduce_cooldown, and adjust_resource.
      const dispatchFn = TOOL_DISPATCH[toolCall.function.name];
      if (dispatchFn) {
        const response = dispatchFn(args, storyData);
        if (response) {
          const fullResponse: CommandResponse = {
            ...response,
            toolCallId: toolCall.id,
          };
          logger.action(
            `Tool call ${fullResponse.success ? "succeeded" : "failed"}: ${
              fullResponse.message
            }`,
            {
              toolCallId: toolId,
              toolName,
              success: fullResponse.success,
            }
          );
          responses.push(fullResponse);
        } else {
          const errorMsg = `Tool dispatch returned null (tool ${
            toolCall.function.name
          } args=${serializeArgs(args)})`;
          logger.error(`Tool call failed: ${errorMsg}`, {
            toolCallId: toolId,
            toolName,
          });
          responses.push({
            command: toolCall.function.name,
            success: false,
            message: errorMsg,
            timestamp: Date.now(),
            toolCallId: toolCall.id,
          });
        }
        continue;
      }

      // Every tool name present in TOOL_MAP is handled either by one of the
      // inline special-case blocks above or by TOOL_DISPATCH, both of which
      // `continue` before reaching this point. If we get here, a tool was
      // added to the schema without wiring up an executor for it.
      const errorMsg = `Tool has no executor wired up (tool ${
        toolCall.function.name
      } args=${serializeArgs(args)})`;
      logger.error(`Tool call failed: ${errorMsg}`, {
        toolCallId: toolId,
        toolName,
      });
      responses.push({
        command: toolCall.function.name,
        success: false,
        message: errorMsg,
        timestamp: Date.now(),
        toolCallId: toolCall.id,
      });
    } catch (error: any) {
      const errorMsg = `Execution error: ${error.message} (tool ${
        toolCall.function.name
      } args=${serializeArgs(toolCall.function.arguments)})`;
      logger.error(`Tool call exception: ${errorMsg}`, {
        toolCallId: toolId,
        toolName,
        error: error.message,
        stack: error.stack,
      });
      responses.push({
        command: toolCall.function.name,
        success: false,
        message: errorMsg,
        timestamp: Date.now(),
        toolCallId: toolCall.id,
      });
    }
  }

  const successCount = responses.filter((r) => r.success).length;
  const failureCount = responses.length - successCount;
  logger.action(
    `Tool execution complete: ${successCount} succeeded, ${failureCount} failed`,
    {
      totalCalls: toolCalls.length,
      successCount,
      failureCount,
      responses: responses.map((r) => ({
        tool: r.command,
        success: r.success,
        message: r.message.substring(0, 100),
      })),
    }
  );

  // Generate state changes from successful tool calls that modify game state
  for (const response of responses) {
    if (!response.success) continue;

    // Extract tool name from command (may be in format "/command_name: args" or just "tool_name")
    const commandMatch = response.command.match(/^\/(\w+):|^(\w+)$/);
    const toolName = commandMatch
      ? commandMatch[1] || commandMatch[2]
      : response.command;

    // Check if this tool should generate state change notification
    if (STATE_CHANGE_TOOLS.has(toolName)) {
      // Clean up message for state changes (remove emoji prefixes like ✓ or ⚠️)
      const cleanMessage = response.message.replace(/^[✓✗⚠️\s]+/, "").trim();
      if (cleanMessage) {
        stateChanges.push(cleanMessage);
      }
    }
  }

  if (stateChanges.length > 0) {
    logger.action(
      `Generated ${stateChanges.length} state change notifications`,
      {
        stateChanges,
      }
    );
  }

  return { responses, stateChanges };
}

/**
 * Execute rest tool - handles resource recovery, cooldown reduction, condition healing, item repair
 * Returns CommandResponse for the operation
 */
function executeRestTool(
  args: Record<string, any>,
  storyData: StoryData,
  toolId: string
): Omit<CommandResponse, "toolCallId"> {
  const restType = args.type as RestType;
  const narrativeSummary = args.narrative_summary?.trim() || "";
  const resourcesArg = args.resources as
    | Array<{ name: string; amount: number; percentage?: boolean }>
    | undefined;
  const difficulty = storyData.difficulty || "medium";
  const config = REST_CONFIG[difficulty];

  // Initialize rest state if not present
  if (!storyData.restState) {
    storyData.restState = {
      quickRestsUsed: 0,
      shortRestsUsed: 0,
    };
  }

  // Check if rest is available
  if (
    restType === "quick" &&
    storyData.restState.quickRestsUsed >= config.maxQuickRests
  ) {
    return {
      command: "take_rest",
      success: false,
      message: `Cannot quick rest: ${config.maxQuickRests} quick rests already used (long rest required to recharge)`,
      timestamp: Date.now(),
    };
  }

  if (
    restType === "short" &&
    storyData.restState.shortRestsUsed >= config.maxShortRests
  ) {
    return {
      command: "take_rest",
      success: false,
      message: `Cannot short rest: ${config.maxShortRests} short rests already used (long rest required to recharge)`,
      timestamp: Date.now(),
    };
  }

  // Check for active challenge - cannot rest during challenges
  if (storyData.activeChallenge?.active) {
    return {
      command: "take_rest",
      success: false,
      message: `Cannot rest while "${storyData.activeChallenge.name}" challenge is active`,
      timestamp: Date.now(),
    };
  }

  // Track effects for summary message
  const effects: string[] = [];

  // 1. Resource Recovery (GM-specified list only)
  if (resourcesArg && resourcesArg.length > 0 && storyData.resources?.length) {
    for (const resourceReq of resourcesArg) {
      // Find matching resource using fuzzy match
      const match = findBestMatch(
        resourceReq.name,
        storyData.resources,
        (r) => r.name,
        0.6
      );

      if (!match) {
        // Resource not found - skip silently (don't fail the whole rest)
        continue;
      }

      const resource = match.item;
      if (resource.value >= resource.maxValue) {
        // Already at max - skip
        continue;
      }

      // Calculate recovery amount
      const isPercentage = resourceReq.percentage !== false; // Default to true
      let recoveryAmount: number;
      if (isPercentage) {
        recoveryAmount = Math.ceil(
          (resource.maxValue * resourceReq.amount) / 100
        );
      } else {
        recoveryAmount = Math.ceil(resourceReq.amount);
      }

      const oldValue = resource.value;
      resource.value = Math.min(
        resource.maxValue,
        resource.value + recoveryAmount
      );
      const actualRecovery = resource.value - oldValue;
      if (actualRecovery > 0) {
        effects.push(`${resource.name} +${actualRecovery}`);
      }
    }
  }

  // 2. Stress Reduction
  const stressReduction = config.stressReduction[restType];
  if (stressReduction > 0 && (storyData.stress ?? 0) > 0) {
    const oldStress = storyData.stress ?? 0;
    storyData.stress = Math.max(0, oldStress - stressReduction);
    const actualReduction = oldStress - (storyData.stress ?? 0);
    if (actualReduction > 0) {
      effects.push(`Stress -${actualReduction}`);
    }
  }

  // 3. Cooldown Reduction
  const cooldownReduction = config.cooldownReduction[restType];
  if (cooldownReduction > 0 && storyData.abilities?.length) {
    let cooldownsReset = 0;
    for (const ability of storyData.abilities) {
      if ((ability.currentCooldown ?? 0) > 0) {
        if (cooldownReduction >= 999) {
          // Full reset
          ability.currentCooldown = 0;
          cooldownsReset++;
        } else {
          const oldCooldown = ability.currentCooldown ?? 0;
          ability.currentCooldown = Math.max(
            0,
            oldCooldown - cooldownReduction
          );
          if (ability.currentCooldown < oldCooldown) {
            cooldownsReset++;
          }
        }
      }
    }
    if (cooldownsReset > 0) {
      if (cooldownReduction >= 999) {
        effects.push(
          `${cooldownsReset} ability cooldown${
            cooldownsReset > 1 ? "s" : ""
          } reset`
        );
      } else {
        effects.push(
          `${cooldownsReset} ability cooldown${
            cooldownsReset > 1 ? "s" : ""
          } reduced`
        );
      }
    }
  }

  // 4. Update rest state tracking
  if (restType === "long") {
    // Long rest resets quick/short rest counts
    storyData.restState.quickRestsUsed = 0;
    storyData.restState.shortRestsUsed = 0;
  } else if (restType === "short") {
    storyData.restState.shortRestsUsed++;
    // Short rest also resets quick rest count
    storyData.restState.quickRestsUsed = 0;
  } else {
    storyData.restState.quickRestsUsed++;
  }

  storyData.restState.lastRestType = restType;
  storyData.restState.lastRestTimestamp = Date.now();

  // Build summary message
  const restTypeLabel =
    restType === "quick"
      ? "Quick Rest"
      : restType === "short"
      ? "Short Rest"
      : "Long Rest";
  const durationLabel =
    restType === "quick"
      ? "~30 minutes"
      : restType === "short"
      ? "4-8 hours"
      : "several days";

  let summary = `🛏️ ${restTypeLabel} (${durationLabel})`;
  if (narrativeSummary) {
    summary += `: ${narrativeSummary}`;
  }

  if (effects.length > 0) {
    summary += `\nEffects: ${effects.join(" | ")}`;
  } else {
    summary += "\nNo recovery needed - already at full capacity";
  }

  // Add remaining rest counts
  if (restType !== "long") {
    const remainingQuick =
      config.maxQuickRests - storyData.restState.quickRestsUsed;
    const remainingShort =
      config.maxShortRests - storyData.restState.shortRestsUsed;
    summary += `\n[Rests remaining: ${remainingQuick} quick, ${remainingShort} short]`;
  }

  logger.action(`Rest executed: ${restType}`, {
    toolId,
    restType,
    difficulty,
    effects: effects.length,
    quickRestsRemaining:
      config.maxQuickRests - storyData.restState.quickRestsUsed,
    shortRestsRemaining:
      config.maxShortRests - storyData.restState.shortRestsUsed,
  });

  return {
    command: `take_rest: ${restType}`,
    success: true,
    message: summary,
    timestamp: Date.now(),
  };
}

/**
 * Validate tool call parameters against schema
 * Returns error message if validation fails, null if valid
 */
export function validateToolCall(toolCall: ToolCall): string | null {
  const toolSchema = TOOL_MAP.get(toolCall.function.name);
  if (!toolSchema) {
    return `Unknown tool: ${toolCall.function.name}`;
  }

  // Parse arguments
  let args: Record<string, any>;
  try {
    if (typeof toolCall.function.arguments === "string") {
      args = JSON.parse(toolCall.function.arguments);
    } else {
      args = toolCall.function.arguments;
    }
  } catch (e) {
    return `Invalid JSON arguments: ${
      e instanceof Error ? e.message : "Parse error"
    }`;
  }

  // Check required parameters
  const required = toolSchema.function.parameters.required || [];
  const missingParams = required.filter((param) => !(param in args));
  if (missingParams.length > 0) {
    return `Missing required parameters: ${missingParams.join(", ")}`;
  }

  // Basic type validation
  const properties = toolSchema.function.parameters.properties;
  for (const [key, value] of Object.entries(args)) {
    if (!(key in properties)) {
      return `Unknown parameter: ${key}`;
    }

    const propSchema = properties[key];
    const actualType = Array.isArray(value) ? "array" : typeof value;

    if (propSchema.type && actualType !== propSchema.type) {
      return `Parameter '${key}' expected type ${propSchema.type}, got ${actualType}`;
    }

    // Validate enum
    if (propSchema.enum && !propSchema.enum.includes(value)) {
      return `Parameter '${key}' must be one of: ${propSchema.enum.join(", ")}`;
    }

    // Validate number ranges
    if (propSchema.type === "number") {
      if (propSchema.minimum !== undefined && value < propSchema.minimum) {
        return `Parameter '${key}' must be >= ${propSchema.minimum}`;
      }
      if (propSchema.maximum !== undefined && value > propSchema.maximum) {
        return `Parameter '${key}' must be <= ${propSchema.maximum}`;
      }
    }
  }

  return null;
}
