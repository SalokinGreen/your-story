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
  SkillTree,
  getMemoryContent,
} from "@/app/misc/structs";
import { ChatMessage } from "@/app/misc/ai";
import {
  buildCreatorMessages,
  CreatorOutputData,
  formatStoryDataAsMarkdown,
} from "@/app/misc/creator_ai";
import { getCreatorToolsForAPI } from "@/app/misc/creator_tools";

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
    levelingSettings: storyData.levelingSettings,
    skillTrees: storyData.skillTrees,
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
${recentMemories.map((m) => `• ${getMemoryContent(m)}`).join("\n")}
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
        // Build skill tree summary if exists
        let skillTreeSummary = "";
        if (storyData.skillTrees && storyData.skillTrees.length > 0) {
          const treeNames = storyData.skillTrees.map((t) => t.name).join(", ");
          const totalNodes = storyData.skillTrees.reduce(
            (sum, t) => sum + (t.nodes?.length || 0),
            0
          );
          skillTreeSummary = `
**Progression System:** This story uses SKILL TREES (${storyData.skillTrees.length} trees: ${treeNames}) with ${totalNodes} total nodes.
- 1 upgrade point = 1 skill tree node unlock
- Current levelingSettings.defaultUpgradesPerLevel determines points per level
- Adjust defaultUpgradesPerLevel (1-3 typical) and startingUpgrades based on skill tree depth
`;
        }

        const storyContextHeader = `
### Story-Specific Context:
This is an ACTIVE STORY with ongoing gameplay. The player is editing their current game.
${skillTreeSummary}${historyContext}${memoryContext}
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
  if (changes.level !== undefined) updates.level = changes.level;
  if (changes.upgradesSpent !== undefined)
    updates.upgradesSpent = changes.upgradesSpent;

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

  // Skill trees - merge by id, with special handling for nodes
  if (changes.skillTrees) {
    updates.skillTrees = mergeSkillTrees(
      storyData.skillTrees || [],
      changes.skillTrees
    );
  }

  // Complex objects - direct replacement
  if (changes.upgradeSettings !== undefined) {
    updates.upgradeSettings = changes.upgradeSettings;
  }

  if (changes.agmtState !== undefined) {
    // Merge AGMT state (threads deprecated, only chaos factor and scene count)
    if (storyData.agmtState && changes.agmtState) {
      updates.agmtState = {
        ...storyData.agmtState,
        ...changes.agmtState,
      };
    } else {
      updates.agmtState = changes.agmtState;
    }
  }

  // Leveling settings - merge with existing
  if (changes.levelingSettings !== undefined) {
    if (storyData.levelingSettings && changes.levelingSettings) {
      // Normalize customCurve: handle both 'xp' and 'cumulativeXP' field names
      let normalizedCustomCurve = changes.levelingSettings.customCurve;
      if (normalizedCustomCurve) {
        normalizedCustomCurve = normalizedCustomCurve.map(
          (point: { level: number; cumulativeXP?: number; xp?: number }) => ({
            level: point.level,
            cumulativeXP: point.cumulativeXP ?? point.xp ?? 0,
          })
        );
      }

      updates.levelingSettings = {
        ...storyData.levelingSettings,
        ...changes.levelingSettings,
        // Handle nested objects/arrays carefully
        customCurve:
          normalizedCustomCurve !== undefined
            ? normalizedCustomCurve
            : storyData.levelingSettings.customCurve,
        upgradeOverrides:
          changes.levelingSettings.upgradeOverrides !== undefined
            ? changes.levelingSettings.upgradeOverrides
            : storyData.levelingSettings.upgradeOverrides,
        startingUpgrades:
          changes.levelingSettings.startingUpgrades !== undefined
            ? {
                ...storyData.levelingSettings.startingUpgrades,
                ...changes.levelingSettings.startingUpgrades,
              }
            : storyData.levelingSettings.startingUpgrades,
      };
    } else {
      // Normalize customCurve for new levelingSettings too
      if (changes.levelingSettings?.customCurve) {
        changes.levelingSettings.customCurve =
          changes.levelingSettings.customCurve.map(
            (point: { level: number; cumulativeXP?: number; xp?: number }) => ({
              level: point.level,
              cumulativeXP: point.cumulativeXP ?? point.xp ?? 0,
            })
          );
      }
      updates.levelingSettings = changes.levelingSettings;
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
 * Merge skill trees with special handling for nodes array
 * Each tree is identified by id, nodes within trees are identified by their id
 */
function mergeSkillTrees(
  existing: SkillTree[],
  incoming: (SkillTree & { _command?: string })[]
): SkillTree[] {
  const result = [...existing];

  for (const tree of incoming) {
    const command = (tree as { _command?: string })._command || "merge";
    const cleanTree = { ...tree } as SkillTree & { _command?: string };
    delete cleanTree._command;

    const existingIndex = result.findIndex((t) => t.id === tree.id);

    switch (command) {
      case "delete":
        if (existingIndex !== -1) {
          result.splice(existingIndex, 1);
        }
        break;

      case "replace":
        if (existingIndex !== -1) {
          result[existingIndex] = cleanTree;
        } else {
          result.push(cleanTree);
        }
        break;

      case "add":
        result.push(cleanTree);
        break;

      case "merge":
      default:
        if (existingIndex !== -1) {
          // Merge tree properties, but handle nodes specially
          const existingTree = result[existingIndex];
          const mergedTree = { ...existingTree, ...cleanTree };

          // If incoming has nodes, merge them with existing nodes
          if (cleanTree.nodes && cleanTree.nodes.length > 0) {
            const mergedNodes = [...(existingTree.nodes || [])];

            for (const node of cleanTree.nodes) {
              const nodeCommand =
                (node as { _command?: string })._command || "merge";
              const cleanNode = { ...node } as typeof node & {
                _command?: string;
              };
              delete cleanNode._command;

              const nodeIndex = mergedNodes.findIndex((n) => n.id === node.id);

              switch (nodeCommand) {
                case "delete":
                  if (nodeIndex !== -1) {
                    mergedNodes.splice(nodeIndex, 1);
                  }
                  break;
                case "replace":
                  if (nodeIndex !== -1) {
                    mergedNodes[nodeIndex] = cleanNode;
                  } else {
                    mergedNodes.push(cleanNode);
                  }
                  break;
                case "add":
                  mergedNodes.push(cleanNode);
                  break;
                case "merge":
                default:
                  if (nodeIndex !== -1) {
                    mergedNodes[nodeIndex] = {
                      ...mergedNodes[nodeIndex],
                      ...cleanNode,
                    };
                  } else {
                    mergedNodes.push(cleanNode);
                  }
                  break;
              }
            }

            mergedTree.nodes = mergedNodes;
          }

          result[existingIndex] = mergedTree;
        } else {
          result.push(cleanTree);
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
  describeArrayChanges(changes.skillTrees, "Skill Trees", "id");

  if (changes.upgradeSettings) summaries.push("Updated upgrade settings");
  if (changes.agmtState) summaries.push("Updated AGMT state");

  return summaries;
}

/**
 * Default icons for skill node types
 */
const NODE_TYPE_ICONS: Record<string, string> = {
  stat: "BarChart2",
  ability: "Sparkles",
  item: "Package",
  passive: "Shield",
  resource: "Zap",
};

/**
 * Check if a symbol is a valid icon name (not an emoji)
 * Valid icons are alphanumeric with dashes (e.g., "sword", "magic-swirl")
 */
function isValidIconName(symbol: string | undefined): boolean {
  if (!symbol) return false;
  // Emojis contain non-ASCII characters or specific Unicode ranges
  // Valid icon names are simple alphanumeric strings with dashes
  return /^[a-zA-Z][a-zA-Z0-9-]*$/.test(symbol);
}

/**
 * Sanitize skill trees from AI output
 * - Converts emoji symbols to valid icon names
 * - Ensures all required fields exist
 */
export function sanitizeSkillTrees(trees: SkillTree[]): SkillTree[] {
  return trees.map((tree) => ({
    ...tree,
    // If tree symbol is invalid (emoji), use default
    symbol: isValidIconName(tree.symbol) ? tree.symbol : "GitBranch",
    nodes: tree.nodes.map((node) => ({
      ...node,
      // If node symbol is invalid (emoji), use type-based default
      symbol: isValidIconName(node.symbol)
        ? node.symbol
        : NODE_TYPE_ICONS[node.type] || "Circle",
    })),
  }));
}

/**
 * Build messages for story creator with tool calling support.
 * Combines story history context with the full creator tool system.
 */
export function buildStoryCreatorMessagesWithTools(
  storyData: StoryData,
  userRequest: string,
  conversationHistory: ChatMessage[] = []
): {
  messages: ChatMessage[];
  tools: ReturnType<typeof getCreatorToolsForAPI>;
} {
  // Get recent story history for context
  const recentParts = storyData.scene?.parts?.slice(-15) || [];
  const storyHistory = recentParts
    .map((part) => {
      // User messages show as "> choice text", assistant messages show content directly
      if (part.user || part.role === "user") {
        return `> ${part.content}`;
      }
      return part.content;
    })
    .filter(Boolean)
    .join("\n\n---\n\n");

  // Get recent memories
  const recentMemories =
    storyData.memory?.slice(-10).map(getMemoryContent) || [];

  // Build system prompt with tools focus and story context
  const systemPrompt = `You are an expert game master and story editor assistant. The player is currently in an active story/game and needs help modifying the game state, mechanics, or story elements.

## YOUR ROLE
You help players by using tools to make precise changes to their story's data. You have access to a comprehensive set of tools for modifying:
- **Stats & Resources** - Character attributes, health, mana, etc.
- **Inventory & Abilities** - Items, skills, spells, techniques
- **Lore & Achievements** - World-building entries, unlockable achievements
- **Quests & Relationships** - Active objectives, NPC relationships
- **Variables & Conditions** - Story flags, character afflictions
- **Game Settings** - RPG system, difficulty, etc.

## TOOL USAGE GUIDELINES
1. **Always use tools** to make changes - never output raw JSON
2. **Be precise** - use exact names when modifying existing elements
3. **Batch related changes** - make multiple tool calls in one response when logical
4. **Confirm understanding** before making changes if the request is ambiguous
5. **Explain what you did** after making changes

## TOOL CATEGORIES
### Stats & Resources
- add_stat, modify_stat, remove_stat, rename_stat
- add_resource, modify_resource, remove_resource, rename_resource

### Inventory & Abilities  
- add_item, modify_item, remove_item
- add_ability, modify_ability, remove_ability

### Lore & Story
- add_lore, modify_lore, remove_lore
  **THREAT PROFILES:** When creating lore for enemies/threats, include in the content:
  - Challenge Difficulty (Easy/Medium/Hard/Boss)
  - Approach DCs (e.g., "Combat: hard, Stealth: average")
  - Per-Failure Condition (e.g., "Claw Wound Tier II")
  - Challenge Loss Stakes (e.g., "Devoured - Tier VI, game over")
- add_achievement, modify_achievement, remove_achievement
- add_memory

### Quests & Relationships
- add_quest, modify_quest, remove_quest
- add_relationship, modify_relationship, remove_relationship

### Variables & Conditions
- add_variable, modify_variable, remove_variable
- add_condition, modify_condition, remove_condition

### Game Configuration
- update_settings (rpgSystem, difficulty, etc.)
- update_leveling_settings, update_upgrade_settings

### Player Progression
- set_progression - Set player level, XP (points), or upgrade points spent directly. Use for leveling up, giving XP rewards, etc.

## STORY CONTEXT
The player is currently in an active story. Here's what's been happening recently:

${storyHistory || "(No story history yet)"}

${
  recentMemories.length > 0
    ? `## RECENT MEMORIES\n${recentMemories.map((m) => `- ${m}`).join("\n")}`
    : ""
}

## CURRENT GAME STATE
${formatStoryDataAsMarkdown(storyData)}

## RESPONSE FORMAT
1. If the request is clear, use the appropriate tools to make changes
2. **Be conversational and friendly!** You're their game master buddy helping them tweak their story. After using tools, write a warm response about what you did - share your thinking, point out interesting implications, or suggest related ideas. Don't just say "I made the changes" - be personable!
3. If the request is ambiguous, ask clarifying questions BEFORE using tools
4. Keep responses concise but engaging - a sentence or two of friendly commentary goes a long way!

Examples of good responses after tool calls:
- "Bumped your Strength to 75 - you're definitely hitting harder now! That goblin chief won't know what hit him."
- "Added that cursed amulet to your inventory. Fair warning: I set it as a 'story' item so you can't just drop it... the curse has to be dealt with properly!"
- "Healed you up and cleared that poison condition. You were cutting it close there!"`;

  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    ...conversationHistory,
    { role: "user", content: userRequest },
  ];

  return {
    messages,
    tools: getCreatorToolsForAPI(),
  };
}
