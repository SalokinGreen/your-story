/**
 * Story Creator AI - Creative Assistant for in-game story editing
 *
 * Extends the creator AI to include recent story history context
 * and converts Adventure-style changes to StoryData updates
 */

import {
  StoryData,
  ScenePart,
  Stat,
  Resource,
  InventoryItem,
  Ability,
  Achievement,
  StoryLore,
  Quest,
  Relationship,
  Variable,
  Preset,
  CustomTable,
  AGMTThread,
  AGMTCharacter,
} from "@/app/misc/structs";
import { ChatMessage } from "@/app/misc/ai";
import { buildCreatorMessages, CreatorOutputData } from "@/app/misc/creator_ai";

export interface StoryCreatorAIInput {
  messages: ChatMessage[];
  storyData: StoryData;
  recentHistory?: ScenePart[]; // Recent story parts for context
  maxHistoryParts?: number; // How many recent parts to include (default 10)
}

/**
 * Build messages for the story creative assistant
 * Includes full story state plus recent narrative history
 */
export function buildStoryCreatorMessages({
  messages,
  storyData,
  recentHistory,
  maxHistoryParts = 10,
}: StoryCreatorAIInput): ChatMessage[] {
  // Extract the relevant StoryData fields (excluding runtime state)
  const storyDataForCreator: Partial<StoryData> = {
    story_name: storyData.story_name,
    premise: storyData.premise,
    player_name: storyData.player_name,
    player_summary: storyData.player_summary,
    intro: storyData.intro,
    author_notes: storyData.author_notes,
    stats: storyData.stats,
    resources: storyData.resources,
    inventory: storyData.inventory,
    abilities: storyData.abilities,
    achievements: storyData.achievements,
    lore: storyData.lore,
    quests: storyData.quests,
    relationships: storyData.relationships,
    variables: storyData.variables,
    presets: storyData.presets,
    customTables: storyData.customTables,
    agmtState: storyData.agmtState,
    upgradeSettings: storyData.upgradeSettings,
    rpgSystem: storyData.rpgSystem,
    momentum: storyData.momentum,
    maxMomentum: storyData.maxMomentum,
    points: storyData.points,
    conditions: storyData.conditions,
  };

  // Build the base creator messages
  const baseMessages = buildCreatorMessages({
    messages,
    currentStoryData: storyDataForCreator,
    // No adventure metadata for in-story editing
  });

  // Build recent story history context
  let historyContext = "";
  if (recentHistory && recentHistory.length > 0) {
    const partsToInclude = recentHistory.slice(-maxHistoryParts);
    const historyLines: string[] = [];

    for (const part of partsToInclude) {
      // User parts contain the player's choice
      if (part.user && part.content) {
        historyLines.push(`[Player]: ${part.content}`);
      }
      // Assistant parts contain the narrator's text
      if (!part.user && part.content) {
        // Truncate very long text
        const text =
          part.content.length > 500
            ? part.content.slice(0, 500) + "..."
            : part.content;
        historyLines.push(`[Narrator]: ${text}`);
      }
      if (part.stateChanges && part.stateChanges.length > 0) {
        historyLines.push(`[State Changes]: ${part.stateChanges.join(", ")}`);
      }
    }

    if (historyLines.length > 0) {
      historyContext = `

### Recent Story History (last ${partsToInclude.length} turns):
${historyLines.join("\n")}
`;
    }
  }

  // Add memory context
  let memoryContext = "";
  if (storyData.memory && storyData.memory.length > 0) {
    const recentMemories = storyData.memory.slice(-20);
    memoryContext = `

### Story Memories (key events and details):
${recentMemories.map((m) => `• ${m}`).join("\n")}
`;
  }

  // Inject the story history and memory into the system prompt
  if (historyContext || memoryContext) {
    const systemMessage = baseMessages[0];
    if (systemMessage && systemMessage.role === "system") {
      // Insert before the "Context - Current Adventure State" section
      const insertPoint = systemMessage.content.indexOf(
        "### Context - Current Adventure State:"
      );
      if (insertPoint !== -1) {
        const storyContextHeader = `
### Story-Specific Context:
This is an ACTIVE STORY with ongoing gameplay. The player is editing their current game.
${historyContext}${memoryContext}
`;
        systemMessage.content =
          systemMessage.content.slice(0, insertPoint) +
          storyContextHeader +
          systemMessage.content.slice(insertPoint);
      }
    }
  }

  return baseMessages;
}

/**
 * Apply creator output to StoryData
 * Handles the _command field for merge/replace/delete/add operations
 */
export function applyCreatorChangesToStoryData(
  storyData: StoryData,
  changes: CreatorOutputData
): Partial<StoryData> {
  const updates: Partial<StoryData> = {};

  // Scalar fields - direct replacement
  if (changes.story_name !== undefined) updates.story_name = changes.story_name;
  if (changes.premise !== undefined) updates.premise = changes.premise;
  if (changes.player_name !== undefined)
    updates.player_name = changes.player_name;
  if (changes.player_summary !== undefined)
    updates.player_summary = changes.player_summary;
  if (changes.intro !== undefined) updates.intro = changes.intro;
  if (changes.author_notes !== undefined)
    updates.author_notes = changes.author_notes;
  if (changes.rpgSystem !== undefined)
    updates.rpgSystem = changes.rpgSystem as StoryData["rpgSystem"];
  if (changes.momentum !== undefined) updates.momentum = changes.momentum;
  if (changes.maxMomentum !== undefined)
    updates.maxMomentum = changes.maxMomentum;
  if (changes.points !== undefined) updates.points = changes.points;

  // Array fields - handle merge/replace/delete/add commands
  if (changes.stats) {
    updates.stats = mergeArrayWithCommands(
      storyData.stats || [],
      changes.stats,
      "name"
    );
  }

  if (changes.resources) {
    updates.resources = mergeArrayWithCommands(
      storyData.resources || [],
      changes.resources,
      "name"
    );
  }

  if (changes.inventory) {
    updates.inventory = mergeArrayWithCommands(
      storyData.inventory || [],
      changes.inventory,
      "name"
    );
  }

  if (changes.abilities) {
    updates.abilities = mergeArrayWithCommands(
      storyData.abilities || [],
      changes.abilities,
      "name"
    );
  }

  if (changes.achievements) {
    updates.achievements = mergeArrayWithCommands(
      storyData.achievements || [],
      changes.achievements,
      "title"
    );
  }

  if (changes.lore) {
    updates.lore = mergeArrayWithCommands(
      storyData.lore || [],
      changes.lore,
      "title"
    );
  }

  if (changes.quests) {
    updates.quests = mergeArrayWithCommands(
      storyData.quests || [],
      changes.quests,
      "title"
    );
  }

  if (changes.relationships) {
    updates.relationships = mergeArrayWithCommands(
      storyData.relationships || [],
      changes.relationships,
      "name"
    );
  }

  if (changes.variables) {
    updates.variables = mergeArrayWithCommands(
      storyData.variables || [],
      changes.variables,
      "id"
    );
  }

  if (changes.presets) {
    updates.presets = mergeArrayWithCommands(
      storyData.presets || [],
      changes.presets,
      "id"
    );
  }

  if (changes.customTables) {
    updates.customTables = mergeArrayWithCommands(
      storyData.customTables || [],
      changes.customTables,
      "name"
    );
  }

  // Complex objects - direct replacement
  if (changes.upgradeSettings !== undefined) {
    updates.upgradeSettings = changes.upgradeSettings;
  }

  if (changes.agmtState !== undefined) {
    // Merge AGMT state carefully
    if (storyData.agmtState && changes.agmtState) {
      updates.agmtState = {
        ...storyData.agmtState,
        ...changes.agmtState,
        threads: changes.agmtState.threads
          ? mergeArrayWithCommands(
              storyData.agmtState.threads || [],
              changes.agmtState.threads,
              "description"
            )
          : storyData.agmtState.threads,
        characters: changes.agmtState.characters
          ? mergeArrayWithCommands(
              storyData.agmtState.characters || [],
              changes.agmtState.characters,
              "name"
            )
          : storyData.agmtState.characters,
      };
    } else {
      updates.agmtState = changes.agmtState;
    }
  }

  return updates;
}

/**
 * Merge arrays handling _command field
 * Supports: merge (default), replace, delete, add
 */
function mergeArrayWithCommands<T>(
  existing: T[],
  incoming: (T & { _command?: string })[],
  identifierKey: keyof T
): T[] {
  const result = [...existing];

  for (const item of incoming) {
    const command = (item as { _command?: string })._command || "merge";
    const identifier = item[identifierKey];

    // Clean the _command field from the item
    const cleanItem = { ...item } as T & { _command?: string };
    delete cleanItem._command;

    const existingIndex = result.findIndex(
      (e) => e[identifierKey] === identifier
    );

    switch (command) {
      case "delete":
        if (existingIndex !== -1) {
          result.splice(existingIndex, 1);
        }
        break;

      case "replace":
        if (existingIndex !== -1) {
          result[existingIndex] = cleanItem as T;
        } else {
          // If not found, add as new
          result.push(cleanItem as T);
        }
        break;

      case "add":
        // Always add as new, even if identifier matches
        result.push(cleanItem as T);
        break;

      case "merge":
      default:
        if (existingIndex !== -1) {
          // Merge properties
          result[existingIndex] = { ...result[existingIndex], ...cleanItem };
        } else {
          // Add as new
          result.push(cleanItem as T);
        }
        break;
    }
  }

  return result;
}

/**
 * Get a summary of changes for display
 */
export function summarizeChanges(changes: CreatorOutputData): string[] {
  const summaries: string[] = [];

  // Scalar changes
  if (changes.story_name) summaries.push(`Story name: "${changes.story_name}"`);
  if (changes.premise) summaries.push("Updated premise");
  if (changes.player_name)
    summaries.push(`Player name: "${changes.player_name}"`);
  if (changes.player_summary) summaries.push("Updated player summary");
  if (changes.intro) summaries.push("Updated intro");
  if (changes.author_notes) summaries.push("Updated author notes");
  if (changes.rpgSystem) summaries.push(`RPG system: ${changes.rpgSystem}`);
  if (changes.momentum !== undefined)
    summaries.push(`Momentum: ${changes.momentum}`);
  if (changes.points !== undefined) summaries.push(`Points: ${changes.points}`);

  // Array changes with command awareness
  const describeArrayChanges = (
    items: any[] | undefined,
    label: string,
    idKey: string
  ) => {
    if (!items || items.length === 0) return;

    const adds = items.filter(
      (i) => i._command === "add" || (!i._command && !i[idKey])
    );
    const deletes = items.filter((i) => i._command === "delete");
    const replaces = items.filter((i) => i._command === "replace");
    const merges = items.filter(
      (i) =>
        !i._command ||
        (i._command === "merge" &&
          !adds.includes(i) &&
          !deletes.includes(i) &&
          !replaces.includes(i))
    );

    const parts: string[] = [];
    if (adds.length > 0) parts.push(`+${adds.length} new`);
    if (merges.length > 0) parts.push(`~${merges.length} updated`);
    if (replaces.length > 0) parts.push(`⟳${replaces.length} replaced`);
    if (deletes.length > 0) parts.push(`-${deletes.length} removed`);

    if (parts.length > 0) {
      summaries.push(`${label}: ${parts.join(", ")}`);
    }
  };

  describeArrayChanges(changes.stats, "Stats", "name");
  describeArrayChanges(changes.resources, "Resources", "name");
  describeArrayChanges(changes.inventory, "Inventory", "name");
  describeArrayChanges(changes.abilities, "Abilities", "name");
  describeArrayChanges(changes.achievements, "Achievements", "title");
  describeArrayChanges(changes.lore, "Lore", "title");
  describeArrayChanges(changes.quests, "Quests", "title");
  describeArrayChanges(changes.relationships, "Relationships", "name");
  describeArrayChanges(changes.variables, "Variables", "id");
  describeArrayChanges(changes.presets, "Presets", "id");
  describeArrayChanges(changes.customTables, "Custom Tables", "name");

  if (changes.upgradeSettings) summaries.push("Updated upgrade settings");
  if (changes.agmtState) summaries.push("Updated AGMT state");

  return summaries;
}
