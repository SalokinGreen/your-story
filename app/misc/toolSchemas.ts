/**
 * Tool (Function Calling) Schemas for AI Story Commands
 *
 * These schemas define structured function interfaces for the AI to modify game state.
 * They work in parallel with the existing XML command system, providing better validation
 * and type safety while maintaining backward compatibility.
 */

import { MYTHIC_TOOLS } from "@/app/misc/mythicTools";

export interface ToolSchema {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, any>;
      required?: string[];
    };
  };
}

// Goal Management Tools
const createGoalTool: ToolSchema = {
  type: "function",
  function: {
    name: "create_goal",
    description:
      "Create a new goal for the player with title and description",
    parameters: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description: "Goal title (must be unique)",
        },
        shortDescription: {
          type: "string",
          description: "Brief goal summary (1-2 sentences)",
        },
        description: {
          type: "string",
          description: "Detailed goal objectives and context",
        },
      },
      required: ["title", "shortDescription", "description"],
    },
  },
};

const completeGoalTool: ToolSchema = {
  type: "function",
  function: {
    name: "complete_goal",
    description: "Mark a goal as completed",
    parameters: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description: "Exact goal title (fuzzy matching supported)",
        },
      },
      required: ["title"],
    },
  },
};

const failGoalTool: ToolSchema = {
  type: "function",
  function: {
    name: "fail_goal",
    description: "Mark a goal as failed",
    parameters: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description: "Exact goal title (fuzzy matching supported)",
        },
      },
      required: ["title"],
    },
  },
};

const updateGoalTool: ToolSchema = {
  type: "function",
  function: {
    name: "update_goal",
    description: "Update goal description or details (keeps same status)",
    parameters: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description: "Exact goal title (fuzzy matching supported)",
        },
        shortDescription: {
          type: "string",
          description: "New brief summary (optional)",
        },
        description: {
          type: "string",
          description: "New detailed description (optional)",
        },
      },
      required: ["title"],
    },
  },
};

const deleteGoalTool: ToolSchema = {
  type: "function",
  function: {
    name: "delete_goal",
    description: "Remove a goal entirely from the goal log",
    parameters: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description: "Exact goal title (fuzzy matching supported)",
        },
      },
      required: ["title"],
    },
  },
};

// Ability Management Tools
const addAbilityTool: ToolSchema = {
  type: "function",
  function: {
    name: "add_ability",
    description:
      "Grant the player a new ability (spell, skill, special move). Abilities provide bonuses to skill checks and may have resource/variable costs. Grades: novice (+0), apprentice (+1), adept (+2), expert (+3), master (+4), legendary (+5)",
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description:
            "Ability name (e.g., 'Fireball', 'Power Strike', 'Lockpicking')",
        },
        description: {
          type: "string",
          description: "What the ability does and any narrative effects",
        },
        grade: {
          type: "string",
          enum: [
            "novice",
            "apprentice",
            "adept",
            "expert",
            "master",
            "legendary",
          ],
          description:
            "Ability grade determines bonus: novice (+0), apprentice (+1), adept (+2), expert (+3), master (+4), legendary (+5). Default: novice",
        },
        stat: {
          type: "string",
          description:
            "Optional: which stat this ability relates to (e.g., 'Strength', 'Magic')",
        },
        cooldown: {
          type: "number",
          description:
            "Turns before ability can be used again (0 = no cooldown). Default: 0",
          minimum: 0,
        },
        cost: {
          type: "array",
          description:
            "Array of costs to use this ability (can be empty for free abilities)",
          items: {
            type: "object",
            properties: {
              type: {
                type: "string",
                enum: ["resource", "variable"],
                description:
                  "Whether cost is from a resource or number variable",
              },
              name: {
                type: "string",
                description: "Name of the resource or variable to deduct from",
              },
              amount: {
                type: "number",
                description: "Amount to deduct when ability is used",
                minimum: 1,
              },
            },
            required: ["type", "name", "amount"],
          },
        },
      },
      required: ["name", "description"],
    },
  },
};

const removeAbilityTool: ToolSchema = {
  type: "function",
  function: {
    name: "remove_ability",
    description:
      "Remove an ability from the player (lost through curse, injury, story events, etc.)",
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Ability name (fuzzy matching supported)",
        },
      },
      required: ["name"],
    },
  },
};

const modifyAbilityTool: ToolSchema = {
  type: "function",
  function: {
    name: "modify_ability",
    description:
      "Modify an existing ability's description, cost, cooldown, or stat association",
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Ability name (fuzzy matching supported)",
        },
        description: {
          type: "string",
          description: "New description (optional)",
        },
        stat: {
          type: "string",
          description: "New stat association (optional)",
        },
        cooldown: {
          type: "number",
          description: "New cooldown value in turns (optional)",
          minimum: 0,
        },
        cost: {
          type: "array",
          description: "New cost array (optional, replaces existing costs)",
          items: {
            type: "object",
            properties: {
              type: {
                type: "string",
                enum: ["resource", "variable"],
              },
              name: {
                type: "string",
              },
              amount: {
                type: "number",
                minimum: 1,
              },
            },
            required: ["type", "name", "amount"],
          },
        },
      },
      required: ["name"],
    },
  },
};

const upgradeAbilityTool: ToolSchema = {
  type: "function",
  function: {
    name: "upgrade_ability",
    description:
      "Upgrade an ability to a higher grade, increasing its bonus. Use for training, level-ups, or narrative achievements.",
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Ability name (fuzzy matching supported)",
        },
        newGrade: {
          type: "string",
          enum: ["apprentice", "adept", "expert", "master", "legendary"],
          description:
            "The new grade to upgrade to (must be higher than current grade)",
        },
      },
      required: ["name", "newGrade"],
    },
  },
};

const resetAbilityCooldownTool: ToolSchema = {
  type: "function",
  function: {
    name: "reset_ability_cooldown",
    description:
      "Reset an ability's cooldown to 0 (ready to use). Use for narrative reasons like resting, potions, or special events.",
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Ability name (fuzzy matching supported)",
        },
      },
      required: ["name"],
    },
  },
};

// Note Management Tools
const createNoteTool: ToolSchema = {
  type: "function",
  function: {
    name: "create_note",
    description:
      "Add a new note entry to the game world. Notes are detailed reference entries for locations, NPCs, items, lore, or secrets. IMPORTANT: Use the 'type' field to categorize the note so it appears in the correct folder.",
    parameters: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description: "Note entry title (must be unique, e.g., 'The Frozen Wastes')",
        },
        content: {
          type: "string",
          description: "Detailed note text content (1-3 paragraphs recommended)",
        },
        type: {
          type: "string",
          enum: [
            "lore",
            "npc",
            "location",
            "item",
            "faction",
            "event",
            "secret",
            "dm_instructions",
            "character_sheet",
            "mechanics",
            "gm_plan",
          ],
          description: "Category for the note (defaults to 'lore')",
        },
        visibility: {
          type: "string",
          enum: ["always_reveal", "hidden", "to_be_revealed", "check_per_turn"],
          description:
            "Two-Pass Visibility state, independent of `type`. Set 'hidden' or 'to_be_revealed' for anything the Narrator must not be able to describe until you explicitly reveal it (a trap, a hidden villain, a secret motive) - the content is stripped from the Narrator's context entirely until you flip it to 'always_reveal' via edit_note. Use 'check_per_turn' for something that might be noticed passively each turn without the player specifically looking (e.g. a nearby patrol). Omit for ordinary, immediately-narratable content.",
        },
        planSpineLength: {
          type: "string",
          enum: ["short", "medium", "long"],
          description:
            "ONLY used when creating the gm_plan note titled \"Campaign Plan\" - picks how granular the campaign's beat spine is. 'short' (~5 beats) for a one-shot/short arc, 'medium' (~7 beats, default) for an ordinary multi-session campaign, 'long' (~15 beats, full save-the-cat-style structure) for an extended campaign. Judge this from the premise, adventure length/scope, and the player's stated intent - ignored for every other note type.",
        },
      },
      required: ["title", "content"],
    },
  },
};

const deleteNoteTool: ToolSchema = {
  type: "function",
  function: {
    name: "delete_note",
    description: "Remove a note entry entirely",
    parameters: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description: "Note entry title (fuzzy matching supported)",
        },
      },
      required: ["title"],
    },
  },
};

const listInactiveNotesTool: ToolSchema = {
  type: "function",
  function: {
    name: "list_inactive_notes",
    description:
      "List all inactive/hidden note entries that can be revealed. Use this to discover what notes exist before calling show_note. Returns titles and brief descriptions of hidden notes.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
  },
};

const updateNoteTool: ToolSchema = {
  type: "function",
  function: {
    name: "edit_note",
    description:
      "Update an existing note entry's content, title, type, or visibility. Use this to modify notes as the story reveals more information - most importantly, to REVEAL a hidden/to_be_revealed note by setting visibility to 'always_reveal' once the player has actually discovered it.",
    parameters: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description: "Current note entry title (fuzzy matching supported)",
        },
        newTitle: {
          type: "string",
          description: "New title for the note entry (optional)",
        },
        content: {
          type: "string",
          description: "New content for the note entry (optional)",
        },
        type: {
          type: "string",
          enum: [
            "lore",
            "npc",
            "location",
            "item",
            "faction",
            "event",
            "secret",
            "dm_instructions",
            "mechanics",
          ],
          description: "Update the note category (optional)",
        },
        visibility: {
          type: "string",
          enum: ["always_reveal", "hidden", "to_be_revealed", "check_per_turn"],
          description:
            "Update the Two-Pass Visibility state (optional). Set to 'always_reveal' to reveal a hidden/to_be_revealed note once the player has genuinely discovered it - this is the only way that content ever reaches the Narrator.",
        },
      },
      required: ["title"],
    },
  },
};

// Lore Editing Tools (fine-grained content manipulation)
const editLoreReplaceTool: ToolSchema = {
  type: "function",
  function: {
    name: "edit_lore_replace",
    description:
      "Replace a specific string in a lore entry's content. Use for surgical edits without rewriting the entire entry. Supports case-insensitive matching.",
    parameters: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description: "Lore entry title (fuzzy matching supported)",
        },
        find: {
          type: "string",
          description: "Text to find (case-insensitive, first occurrence)",
        },
        replace: {
          type: "string",
          description: "Replacement text",
        },
        replaceAll: {
          type: "boolean",
          description:
            "Replace all occurrences instead of just the first (default: false)",
        },
      },
      required: ["title", "find", "replace"],
    },
  },
};

const editLoreAppendTool: ToolSchema = {
  type: "function",
  function: {
    name: "edit_lore_append",
    description:
      "Append content to the end of a lore entry. Use for adding new information to existing notes.",
    parameters: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description: "Lore entry title (fuzzy matching supported)",
        },
        content: {
          type: "string",
          description: "Content to append at the end",
        },
        separator: {
          type: "string",
          description:
            "Separator between existing and new content (default: newline)",
        },
      },
      required: ["title", "content"],
    },
  },
};

const editLorePrependTool: ToolSchema = {
  type: "function",
  function: {
    name: "edit_lore_prepend",
    description:
      "Prepend content to the beginning of a lore entry. Use for adding important updates at the top.",
    parameters: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description: "Lore entry title (fuzzy matching supported)",
        },
        content: {
          type: "string",
          description: "Content to prepend at the beginning",
        },
        separator: {
          type: "string",
          description:
            "Separator between new and existing content (default: newline)",
        },
      },
      required: ["title", "content"],
    },
  },
};

const toggleLoreTool: ToolSchema = {
  type: "function",
  function: {
    name: "toggle_lore",
    description:
      "Toggle a lore entry's visibility (on→off or off→on). Simpler than show_lore/hide_lore when you don't know current state.",
    parameters: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description: "Lore entry title (fuzzy matching supported)",
        },
      },
      required: ["title"],
    },
  },
};

const editLoreInsertTool: ToolSchema = {
  type: "function",
  function: {
    name: "edit_lore_insert",
    description:
      "Find a line matching a pattern in a lore entry and insert new content above or below it. Useful for inserting new sections or updating specific parts of structured notes.",
    parameters: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description: "Lore entry title (fuzzy matching supported)",
        },
        pattern: {
          type: "string",
          description:
            "Text or regex pattern to match a line (case-insensitive). First matching line is used.",
        },
        content: {
          type: "string",
          description: "Content to insert",
        },
        position: {
          type: "string",
          enum: ["above", "below"],
          description:
            "Insert above or below the matching line (default: below)",
        },
        isRegex: {
          type: "boolean",
          description: "Treat pattern as regex (default: false, plain text)",
        },
      },
      required: ["title", "pattern", "content"],
    },
  },
};

const mergeLoreTool: ToolSchema = {
  type: "function",
  function: {
    name: "merge_lore",
    description:
      "Merge multiple lore entries into one. The target entry receives all content from source entries, which are then deleted.",
    parameters: {
      type: "object",
      properties: {
        targetTitle: {
          type: "string",
          description:
            "Title of the entry to merge INTO (fuzzy matching supported)",
        },
        sourcesTitles: {
          type: "array",
          items: { type: "string" },
          description:
            "Titles of entries to merge FROM (will be deleted after merge)",
        },
        separator: {
          type: "string",
          description:
            "Separator between merged content (default: two newlines)",
        },
      },
      required: ["targetTitle", "sourcesTitles"],
    },
  },
};

const duplicateLoreTool: ToolSchema = {
  type: "function",
  function: {
    name: "duplicate_lore",
    description:
      "Create a copy of a lore entry with a new title. Useful for creating variations or templates.",
    parameters: {
      type: "object",
      properties: {
        sourceTitle: {
          type: "string",
          description: "Title of entry to copy (fuzzy matching supported)",
        },
        newTitle: {
          type: "string",
          description: "Title for the new copy (must be unique)",
        },
      },
      required: ["sourceTitle", "newTitle"],
    },
  },
};

const searchNotesTool: ToolSchema = {
  type: "function",
  function: {
    name: "search_notes",
    description:
      "Search through all notes (lore entries) for content matching a query. Matches individual words anywhere in a note (title, content, trigger keywords, aliases, tags, related characters/locations) - not just one exact phrase - and returns the strongest matches first with the relevant excerpt. Use to find information before updating notes.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "Text to search for (case-insensitive). Words are matched individually as well as together, so 'tavern owner' will find notes mentioning both words even if not adjacent; an exact phrase match still ranks highest.",
        },
        includeHidden: {
          type: "boolean",
          description: "Include hidden (on=false) notes (default: true)",
        },
        maxResults: {
          type: "number",
          description: "Maximum number of matches to return (default: 10)",
        },
        type: {
          type: "string",
          description:
            "Optional: restrict results to one note type, e.g. 'lore', 'character_sheet', 'mechanics', 'secret'",
        },
        tags: {
          type: "array",
          items: { type: "string" },
          description: "Optional: restrict results to notes with at least one of these tags",
        },
      },
      required: ["query"],
    },
  },
};

// Note: this file used to also define add_relationship/modify_relationship/
// delete_relationship/edit_relationship tools operating on the legacy
// top-level `StoryData.relationships` array. They were never added to
// TOOL_SCHEMAS below, so the model could never call them - fully dead
// code. They've been removed rather than revived: `npcs[]`/update_npc is
// the live, model-facing NPC-disposition tracker (see game-mechanics.md),
// and reviving a second tool surface for the same concept on a different
// array would just recreate the exact "two competing mechanisms" problem
// documented for the old agmtState.threads/characters vs.
// StoryData.threads/npcs split. The legacy `relationships` array itself
// is untouched - it's still populated by old presets/saves and rendered
// in the UI, just no longer exposed to the GM as a second tool-callable
// system alongside update_npc.

// NPC Management Tool - creates lore entry for NPCs
const addNpcTool: ToolSchema = {
  type: "function",
  function: {
    name: "add_npc",
    description:
      "Add a new NPC to the story by creating a detailed lore entry. Use this when introducing important named characters who may appear again.",
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description:
            "NPC's name (e.g., 'Captain Mira', 'Old Tom the Innkeeper')",
        },
        role: {
          type: "string",
          description:
            "Brief role/title (e.g., 'Town guard captain', 'Mysterious merchant')",
        },
        disposition: {
          type: "string",
          description:
            "Initial disposition toward player (e.g., 'hostile', 'neutral', 'friendly', 'suspicious', 'grateful')",
        },
        appearance: {
          type: "string",
          description:
            "Physical description (age, build, distinguishing features, clothing)",
        },
        personality: {
          type: "string",
          description: "Key personality traits, mannerisms, speech patterns",
        },
        motivation: {
          type: "string",
          description: "What the NPC wants, their goals, what drives them",
        },
        secret: {
          type: "string",
          description:
            "Hidden information about the NPC (optional - only GM will see until revealed)",
        },
        location: {
          type: "string",
          description: "Where this NPC can typically be found (optional)",
        },
      },
      required: ["name", "role", "disposition", "appearance", "personality"],
    },
  },
};

// Thread Management Tools - track story plotlines independently
const createThreadTool: ToolSchema = {
  type: "function",
  function: {
    name: "create_thread",
    description:
      "Create a new story thread to track a plotline, mystery, quest, or goal. Use when a new narrative arc emerges that the player might pursue.",
    parameters: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description:
            "Short title for the thread (e.g., 'The Missing Artifact', 'Baron's Conspiracy', 'Find the Cure')",
        },
        description: {
          type: "string",
          description:
            "1-2 sentence summary of the objective and current state. Keep concise - this is a quest tracker, not a story recap.",
        },
        priority: {
          type: "string",
          enum: ["main", "side", "background"],
          description:
            "Thread importance: 'main' (central plot), 'side' (optional subplot), 'background' (ambient/world events)",
        },
      },
      required: ["title", "description"],
    },
  },
};

const updateThreadTool: ToolSchema = {
  type: "function",
  function: {
    name: "update_thread",
    description:
      "Update a thread's description or priority when circumstances change. Replace the description with a new concise summary - do NOT append to it.",
    parameters: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description: "Thread title to update (fuzzy matching supported)",
        },
        description: {
          type: "string",
          description:
            "New 1-2 sentence summary replacing the old one. State CURRENT objective/situation only - history is tracked elsewhere.",
        },
        priority: {
          type: "string",
          enum: ["main", "side", "background"],
          description: "Updated priority (optional)",
        },
      },
      required: ["title"],
    },
  },
};

const resolveThreadTool: ToolSchema = {
  type: "function",
  function: {
    name: "resolve_thread",
    description:
      "Mark a thread as resolved when the plotline concludes successfully or reaches a satisfying endpoint.",
    parameters: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description: "Thread title to resolve (fuzzy matching supported)",
        },
        resolution: {
          type: "string",
          description:
            "Brief description of how the thread was resolved (optional)",
        },
      },
      required: ["title"],
    },
  },
};

const abandonThreadTool: ToolSchema = {
  type: "function",
  function: {
    name: "abandon_thread",
    description:
      "Mark a thread as abandoned when the plotline becomes irrelevant, impossible, or the player explicitly gives up on it.",
    parameters: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description: "Thread title to abandon (fuzzy matching supported)",
        },
        reason: {
          type: "string",
          description:
            "Brief explanation of why the thread was abandoned (optional)",
        },
      },
      required: ["title"],
    },
  },
};

const resolveRandomEventTool: ToolSchema = {
  type: "function",
  function: {
    name: "resolve_random_event",
    description:
      "Confirm a pending oracle-triggered random event has been incorporated into the narrative. Random events (from fate_question or a scene check) persist and keep reappearing in context every turn until resolved this way - call it once you've woven the event into the story, or it will keep showing up as unfinished.",
    parameters: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description:
            "The pending event's id, given in the event's context message",
        },
        how_incorporated: {
          type: "string",
          description:
            "Brief note on how the event was worked into the narrative (optional, for the log)",
        },
      },
      required: ["id"],
    },
  },
};

const acknowledgeDirectorMoveTool: ToolSchema = {
  type: "function",
  function: {
    name: "acknowledge_director_move",
    description:
      "Confirm a pending director move has been incorporated into the narrative. The engine - not you - decides when to announce future badness, tick a clock, or put someone in a spot; you only render the chosen move as prose ('make your move, but never speak its name' - never say 'the director wants me to...'). The move persists and keeps reappearing in context every turn until resolved this way.",
    parameters: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description:
            "The pending move's id, given in the move's context message",
        },
        how_incorporated: {
          type: "string",
          description:
            "Brief note on how the move was worked into the narrative (optional, for the log)",
        },
      },
      required: ["id"],
    },
  },
};

// Memory Management Tool
const addMemoryTool: ToolSchema = {
  type: "function",
  function: {
    name: "add_memory",
    description:
      "RARELY USED. Add memory ONLY for: debts/promises ('Owes blacksmith 50g'), codes ('Password: MOONRISE'), deadlines ('Must reach temple by dawn'). NEVER for descriptions, atmosphere, or story summaries. Most turns need ZERO memories. Use skip_tools instead.",
    parameters: {
      type: "object",
      properties: {
        entry: {
          type: "string",
          description:
            "Factual note only. GOOD: 'Mayor's daughter kidnapped by bandits'. BAD: 'The crow watches from the statue' (this is story text, not memory).",
        },
        importance: {
          type: "number",
          minimum: 0,
          maximum: 10,
          description:
            "Optional: how significant this memory is to the story (0-10). Higher values should be reserved for facts that will clearly matter later (a debt, a deadline, a betrayal). Omit if unsure - most memories are mid-importance.",
        },
      },
      required: ["entry"],
    },
  },
};

// No-op Tool - for when no game state changes are needed
const skipToolsTool: ToolSchema = {
  type: "function",
  function: {
    name: "skip_tools",
    description:
      "Call this when NO game state changes are needed this turn. Use when the story segment is purely dialogue, travel narration, or atmospheric description with no mechanical consequences.",
    parameters: {
      type: "object",
      properties: {
        reason: {
          type: "string",
          description:
            "Brief reason why no changes needed (e.g., 'Purely atmospheric description' or 'Dialogue only, no state changes')",
        },
      },
      required: ["reason"],
    },
  },
};

// Game Over Tool
const gameOverTool: ToolSchema = {
  type: "function",
  function: {
    name: "game_over",
    description:
      "End the game due to character death or permanent incapacitation. Requires the player's combatant being downed (HP 0 or inactive) in active combat - this call is rejected otherwise. Resolve combat down to 0 HP before calling this. This is a major decision - only use when there is no reasonable way to continue.",
    parameters: {
      type: "object",
      properties: {
        reason: {
          type: "string",
          description:
            "Narrative reason for game over (e.g., 'Succumbed to wounds', 'Fell in battle')",
        },
      },
      required: ["reason"],
    },
  },
};

// Scene Challenge (Progress Clock) Tools
const startChallengeTool: ToolSchema = {
  type: "function",
  function: {
    name: "start_challenge",
    description:
      "Start a new Scene Challenge (Best of X) for multi-step tasks like combat, chases, heists, or complex negotiations. Use when a task is too significant to resolve in one roll. Guidelines: Small brawl/locked door = don't use (simple check). Dangerous combat = quick (best of 3). Boss fight = standard/extended (best of 5-7). Epic battle = epic (best of 9). Only one challenge can be active at a time.",
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description:
            "Challenge name (e.g., 'Battle with the Orcs', 'Escape the Burning Inn', 'Convince the Council')",
        },
        description: {
          type: "string",
          description:
            "Brief description of the challenge and win/lose conditions",
        },
        rounds: {
          oneOf: [
            { type: "number", minimum: 3, maximum: 9 },
            {
              type: "string",
              enum: ["quick", "standard", "extended", "epic"],
            },
          ],
          description:
            'Challenge length: prefer a plain unquoted tier string - "quick" (best of 3), "standard" (best of 5), "extended" (best of 7), or "epic" (best of 9). Only pass a bare odd number 3-9 (no quotes) if you need an exact custom length instead of a tier.',
        },
        points: {
          oneOf: [
            { type: "number", minimum: 0 },
            {
              type: "string",
              enum: ["trivial", "minor", "moderate", "major", "legendary"],
            },
          ],
          description:
            'Points tier awarded on victory: prefer a plain unquoted tier string - "trivial", "minor", "moderate" (default), "major", or "legendary". Only pass a bare number (no quotes) if you need an exact custom value instead of a tier.',
        },
        initialSuccesses: {
          type: "number",
          description:
            "Starting successes (use when the triggering action already counts as a success)",
          minimum: 0,
          maximum: 3,
        },
        initialFailures: {
          type: "number",
          description:
            "Starting failures (use when the triggering action already counts as a failure)",
          minimum: 0,
          maximum: 3,
        },
      },
      required: ["name", "rounds"],
    },
  },
};

const updateChallengeTool: ToolSchema = {
  type: "function",
  function: {
    name: "update_challenge",
    description:
      "Update the active challenge progress after a skill check. Call this after each roll during a challenge. Add successes when player succeeds, failures when they fail. Challenge auto-resolves when either side reaches majority (best of X).",
    parameters: {
      type: "object",
      properties: {
        successIncrement: {
          type: "number",
          description: "Successes to add (typically 1, or 2 for crits)",
          minimum: 0,
          maximum: 3,
        },
        failureIncrement: {
          type: "number",
          description: "Failures to add (typically 1, or 2 for crits)",
          minimum: 0,
          maximum: 3,
        },
      },
      required: [],
    },
  },
};

const resolveChallengeTool: ToolSchema = {
  type: "function",
  function: {
    name: "resolve_challenge",
    description:
      "Manually resolve the active challenge. Usually called automatically when success/failure thresholds are met, but can be called manually for narrative reasons (e.g., enemy surrenders, unexpected rescue).",
    parameters: {
      type: "object",
      properties: {
        result: {
          type: "string",
          enum: ["won", "lost"],
          description: "Challenge outcome",
        },
        reason: {
          type: "string",
          description:
            "Why the challenge ended (optional, for non-standard resolutions)",
        },
      },
      required: ["result"],
    },
  },
};

const cancelChallengeTool: ToolSchema = {
  type: "function",
  function: {
    name: "cancel_challenge",
    description:
      "Cancel the active challenge without a win/loss result. Use when the challenge becomes irrelevant (e.g., both parties flee, the objective changes, scene transitions, or the situation fundamentally changes so the challenge no longer applies). No points are awarded.",
    parameters: {
      type: "object",
      properties: {
        reason: {
          type: "string",
          description:
            "Why the challenge was cancelled (e.g., 'Enemies fled the scene', 'Negotiation interrupted by dragon attack')",
        },
      },
      required: ["reason"],
    },
  },
};

// Rest System Tool
const takeRestTool: ToolSchema = {
  type: "function",
  function: {
    name: "take_rest",
    description: `Allow the player to rest and recover. Three types available:
- QUICK (30 min): Brief break. Reduces cooldowns slightly. Limited uses before long rest.
- SHORT (4-8 hours): Sleep/extended rest. Resets most cooldowns. Limited uses before long rest.
- LONG (several days): Extended downtime/time skip. All cooldowns reset. Resets quick/short rest counts.

IMPORTANT: Resource recovery is NOT automatic. You must specify which resources to restore using the 'resources' parameter. Only include resources that make sense to recover during rest (e.g., Health, Stamina, Mana). Do NOT include non-regenerating resources like Gold, Coins, Ammo, etc.

Long rests involve a time skip. Use when narratively appropriate (safe haven, end of chapter, travel montage). Cannot rest during active danger/combat.`,
    parameters: {
      type: "object",
      properties: {
        type: {
          type: "string",
          enum: ["quick", "short", "long"],
          description:
            "Type of rest: quick (30 min), short (4-8 hours sleep), long (several days)",
        },
        narrative_summary: {
          type: "string",
          description:
            "Brief description of how the rest happens narratively (e.g., 'You find a quiet corner to catch your breath', 'The party makes camp for the night', 'Several peaceful days pass at the inn')",
        },
        resources: {
          type: "array",
          description:
            "List of resources to restore. Only include regenerating resources (Health, Stamina, Mana, Energy, etc). Do NOT include non-regenerating resources (Gold, Coins, Ammo, Arrows, etc).",
          items: {
            type: "object",
            properties: {
              name: {
                type: "string",
                description: "Resource name (fuzzy matching supported)",
              },
              amount: {
                type: "number",
                description:
                  "Amount to restore. Use percentage of max for rest-type scaling (quick: 5-15%, short: 30-50%, long: 100%)",
              },
              percentage: {
                type: "boolean",
                description:
                  "If true, 'amount' is treated as a percentage of max value. If false, it's a flat amount. Default: true",
              },
            },
            required: ["name", "amount"],
          },
        },
      },
      required: ["type", "narrative_summary"],
    },
  },
};

const openSideBeatTool: ToolSchema = {
  type: "function",
  function: {
    name: "open_side_beat",
    description: `Pull focus off the main campaign spine into a self-contained side beat - a side quest, a character-focused detour, a one-off episode - and make it the active focus. Creates a \`gm_plan\` note for the side beat (its own short goal + checklist + a "return_when" condition) and marks it active; the main spine beat is paused (not lost) until you call close_side_beat. Use this instead of quietly wandering off-plan, so the detour is tracked and has a way back. Only ONE side beat is active at a time.`,
    parameters: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description:
            "Short title for the side beat, e.g. 'Side Beat — The Missing Caravan'. Becomes the gm_plan note title.",
        },
        goal: {
          type: "string",
          description:
            "What this detour is about and what it's meant to accomplish in the fiction.",
        },
        return_when: {
          type: "string",
          description:
            "The condition that means the side beat is done and focus should return to the main spine.",
        },
        owner: {
          type: "string",
          description:
            "Optional: in co-op, the player/character this detour is focused on (matches a character's ownerCouchPlayerId). Omit for a party-wide side beat.",
        },
      },
      required: ["title", "goal"],
    },
  },
};

const closeSideBeatTool: ToolSchema = {
  type: "function",
  function: {
    name: "close_side_beat",
    description: `Resolve the active side beat and return focus to the paused main campaign spine beat. Records the outcome on the side beat's gm_plan note and clears the active focus. Call this when the side beat's return_when condition is met (or the detour is otherwise done).`,
    parameters: {
      type: "object",
      properties: {
        resolution: {
          type: "string",
          description:
            "How the side beat resolved / what came of it, for the record.",
        },
      },
      required: ["resolution"],
    },
  },
};

const advancePlanTool: ToolSchema = {
  type: "function",
  function: {
    name: "advance_plan",
    description: `Advance the campaign plan through its fixed dramatic spine (docs/gm-plan-notes-design.md). The spine is a PREDICTION of the drama, not a track the players must follow - use these to keep it current, rewriting the next beat to fit what actually happened rather than what was forecast. Two actions, meant to be used together the moment a beat wraps:
- action "complete_current": mark the CURRENT beat done, once its advance-on trigger (a player ACTION, or a TIME/consequence trigger) is satisfied. After this, the turn will NOT be allowed to end until you write the next beat - so follow it with write_next this same turn.
- action "write_next": detail the NEXT beat and move focus onto it. Provide the next beat's name and its full writeup (goal + a [ ] checklist + an advance-on block: OR'd action triggers and/or a time trigger). Ground it in what changed since the last boundary - recent reflection insights tagged [Neutralized]/[Clock]/[Goal]/[Arc], current Fronts and their clocks, and where the players actually went. This keeps the plan exactly one beat ahead - never write beats further out than the next one.
IMPORTANT: those tags are INPUTS you read here, not reasons to call this tool. A [Neutralized]/[Clock]/[Goal]/[Arc] insight appearing mid-beat is NOT an advance trigger - do not call complete_current just because you saw one. Only advance when the current beat's own advance-on condition is met. Neutralizing a threat mid-beat is handled on the Front itself (resolve/abandon its thread, adjust its timer), not by advancing the spine.
Beat names are fixed and advance in order: Opening Image (Session 0), Inciting Incident (Session 1), Rising Complications, Midpoint Turn, Crisis, Climax, Resolution.`,
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["complete_current", "write_next"],
          description:
            "complete_current: mark the current beat finished. write_next: detail and move to the next beat.",
        },
        summary: {
          type: "string",
          description:
            "For complete_current: how the current beat resolved / what it accomplished.",
        },
        next_beat: {
          type: "string",
          description:
            "For write_next: the name of the next beat (should match the next fixed spine beat).",
        },
        detail: {
          type: "string",
          description:
            "For write_next: the full writeup of the next beat - its goal, a [ ] checklist, and an advance-on block (OR'd action triggers and/or a time trigger).",
        },
      },
      required: ["action"],
    },
  },
};

// Export all tools as array
export const TOOL_SCHEMAS: ToolSchema[] = [
  // Goal Management (5 tools)
  createGoalTool,
  completeGoalTool,
  failGoalTool,
  updateGoalTool,
  deleteGoalTool,

  // Ability Management (5 tools)
  addAbilityTool,
  removeAbilityTool,
  modifyAbilityTool,
  upgradeAbilityTool,
  resetAbilityCooldownTool,

  // Note Management (8 tools)
  createNoteTool,
  deleteNoteTool,
  updateNoteTool,
  listInactiveNotesTool,
  editLoreReplaceTool,
  editLoreAppendTool,
  editLorePrependTool,
  toggleLoreTool,
  editLoreInsertTool,
  mergeLoreTool,
  duplicateLoreTool,
  searchNotesTool,

  // Campaign Plan focus (2 tools) - see docs/gm-plan-notes-design.md
  openSideBeatTool,
  closeSideBeatTool,

  // Campaign Plan advance (1 tool) - Phase 2 re-planning gate
  advancePlanTool,

  // NPC Management (1 tool - creates lore for NPCs)
  addNpcTool,

  // Thread Management (4 tools)
  createThreadTool,
  updateThreadTool,
  resolveThreadTool,
  abandonThreadTool,

  // Random event acknowledgement (1 tool)
  resolveRandomEventTool,

  // Director move acknowledgement (1 tool)
  acknowledgeDirectorMoveTool,

  // Memory (1 tool)
  addMemoryTool,

  gameOverTool,

  // Scene Challenges (4 tools)
  startChallengeTool,
  updateChallengeTool,
  resolveChallengeTool,
  cancelChallengeTool,

  // Rest System (1 tool)
  takeRestTool,

  // No-op Tool (1 tool) - for when no changes are needed
  skipToolsTool,

  // Advanced RPG Tools (9 tools)
  ...MYTHIC_TOOLS,
];

// Export map for quick lookup by name
export const TOOL_MAP = new Map(
  TOOL_SCHEMAS.map((tool) => [tool.function.name, tool])
);

// Export just function names for easy reference
export const TOOL_NAMES = TOOL_SCHEMAS.map((tool) => tool.function.name);
