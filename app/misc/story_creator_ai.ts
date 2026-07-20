/**
 * Story Creator AI - Creative Assistant for in-game story editing
 *
 * Extends the creator AI to include recent story history context
 * and converts Adventure-style changes to StoryData updates
 */

import {
  StoryData,
  ScenePart,
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
    intro: storyData.intro,
    author_notes: storyData.author_notes,
    abilities: storyData.abilities,
    lore: storyData.lore,
    goals: storyData.goals,
    relationships: storyData.relationships,
    variables: storyData.variables,
    presets: storyData.presets,
    customTables: storyData.customTables,
    agmtState: storyData.agmtState,
    upgradeSettings: storyData.upgradeSettings,
    skillTrees: storyData.skillTrees,
    characterSheet: storyData.characterSheet,
    characterSheetTemplate: storyData.characterSheetTemplate,
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
  if (changes.intro !== undefined) updates.intro = changes.intro;
  if (changes.author_notes !== undefined)
    updates.author_notes = changes.author_notes;
  if (changes.characterSheet !== undefined)
    updates.characterSheet = changes.characterSheet;

  // Array fields - handle merge/replace/delete/add commands
  if (changes.abilities) {
    updates.abilities = mergeArrayWithCommands(
      storyData.abilities || [],
      changes.abilities,
      "name"
    );
  }

  if (changes.lore) {
    updates.lore = mergeArrayWithCommands(
      storyData.lore || [],
      changes.lore,
      "title"
    );
  }

  if (changes.goals) {
    updates.goals = mergeArrayWithCommands(
      storyData.goals || [],
      changes.goals,
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
  if (changes.intro) summaries.push("Updated intro");
  if (changes.author_notes) summaries.push("Updated author notes");
  if (changes.characterSheet) summaries.push("Updated character sheet");

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

  describeArrayChanges(changes.abilities, "Abilities", "name");
  describeArrayChanges(changes.lore, "Lore", "title");
  describeArrayChanges(changes.goals, "Goals", "title");
  describeArrayChanges(changes.relationships, "Relationships", "name");
  describeArrayChanges(changes.variables, "Variables", "id");
  describeArrayChanges(changes.presets, "Presets", "id");
  describeArrayChanges(changes.customTables, "Custom Tables", "name");
  describeArrayChanges(changes.skillTrees, "Skill Trees", "id");

  if (changes.upgradeSettings) summaries.push("Updated upgrade settings");
  if (changes.agmtState) summaries.push("Updated AGMT state");
  if ((changes as any).characterSchema)
    summaries.push("Updated character schema");
  if ((changes as any).characterData) summaries.push("Updated character data");

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

**STYLE RULE: Do NOT use emojis in any content you generate.** Use :icon: syntax for icons (e.g., :sword:, :fire:, :shield:), or text symbols where appropriate. Emojis look unprofessional in game content.

## YOUR ROLE
You help players by using tools to make precise changes to their story's data. You have access to a comprehensive set of tools for modifying:
- **Abilities** - Skills, spells, techniques
- **Lore** - World-building entries
- **Goals & Threads** - Active objectives and open plotlines
- **Variables** - Story flags
- **Game Settings** - RPG system, difficulty, etc.

## TOOL USAGE GUIDELINES
1. **Always use tools** to make changes - never output raw JSON
2. **Be precise** - use exact names when modifying existing elements
3. **Batch related changes** - make multiple tool calls in one response when logical
4. **Confirm understanding** before making changes if the request is ambiguous
5. **Explain what you did** after making changes

## TOOL CATEGORIES
### Lore & Story
- add_lore, modify_lore, remove_lore
  **LORE TYPES:** Use the 'type' field to set note priority:
  - "character_sheet" - HIGHEST PRIORITY. Use for the player's character sheet! Contains stats, attributes, HP, abilities, equipment. Appears at top of AI context.
  - "mechanics" - Game rules. Second priority.
  - "lore" (default) - World-building, NPCs, locations.
  **THREAT PROFILES:** When creating lore for enemies/threats, include in the content:
  - Challenge Difficulty (Easy/Medium/Hard/Boss)
  - Approach DCs (e.g., "Combat: hard, Stealth: average")
  - Per-Failure Consequence (e.g., "Claw Wound - narrative injury, hinders melee")
  - Challenge Loss Stakes (e.g., "Devoured - fatal, game over")
- add_memory

### Goals
- add_goals, modify_goals, remove_goals

### Variables
- add_variable, modify_variable, remove_variable

### Character Presets & Character Sheets
- add_presets, modify_presets, remove_presets - Character builds/classes
- update_character_sheet - Update the player's active character sheet markdown (replace, append, or prepend content)
- update_character_sheet_template - Set the adventure's fillable template. Use {{FieldName (Category) | Description | Default}} syntax. IMPORTANT: Include visible labels (e.g., '**Strength**: {{Strength...}}' NOT just '{{Strength...}}'). Supports preset styles: D&D 5e, Call of Cthulhu, Traveller, Monsterhearts, Fate, PbtA, Blades in the Dark, World of Darkness
- update_preset_character_sheet - Update a preset's pre-filled character sheet

### Game Configuration
- update_settings (difficulty, etc.)
- update_upgrade_settings

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
- "Added that Fireball ability - now you can really bring the heat! Just watch your mana usage."
- "Created a new lore entry for the Shadow Council. I've set it as secret for now since the player hasn't discovered them yet."
- "Cleared that poison condition. You were cutting it close there!"`;

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
