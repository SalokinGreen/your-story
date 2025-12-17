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

// Quest Management Tools
const createQuestTool: ToolSchema = {
  type: "function",
  function: {
    name: "create_quest",
    description:
      "Create a new quest for the player with title, description, and optional point reward",
    parameters: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description: "Quest title (must be unique)",
        },
        shortDescription: {
          type: "string",
          description: "Brief quest summary (1-2 sentences)",
        },
        description: {
          type: "string",
          description: "Detailed quest objectives and context",
        },
        points: {
          oneOf: [
            { type: "number", minimum: 1 },
            {
              type: "string",
              enum: ["trivial", "minor", "moderate", "major", "legendary"],
            },
          ],
          description:
            "Point reward tier: trivial (5-25), minor (15-60), moderate (30-100), major (60-200), legendary (100-500). Or exact number for legacy.",
        },
      },
      required: ["title", "shortDescription", "description"],
    },
  },
};

const completeQuestTool: ToolSchema = {
  type: "function",
  function: {
    name: "complete_quest",
    description: "Mark a quest as completed and award points to the player",
    parameters: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description: "Exact quest title (fuzzy matching supported)",
        },
      },
      required: ["title"],
    },
  },
};

const failQuestTool: ToolSchema = {
  type: "function",
  function: {
    name: "fail_quest",
    description: "Mark a quest as failed (no points awarded)",
    parameters: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description: "Exact quest title (fuzzy matching supported)",
        },
      },
      required: ["title"],
    },
  },
};

const updateQuestTool: ToolSchema = {
  type: "function",
  function: {
    name: "update_quest",
    description: "Update quest description or details (keeps same status)",
    parameters: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description: "Exact quest title (fuzzy matching supported)",
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

const deleteQuestTool: ToolSchema = {
  type: "function",
  function: {
    name: "delete_quest",
    description: "Remove a quest entirely from the quest log",
    parameters: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description: "Exact quest title (fuzzy matching supported)",
        },
      },
      required: ["title"],
    },
  },
};

// Item Management Tools
const addItemTool: ToolSchema = {
  type: "function",
  function: {
    name: "add_item",
    description:
      "Add an item to player's inventory. Item types: normal (has durability, breaks when depleted), consumable (one-use, consumed immediately), story (quest item, tracks durability but never breaks), misc (prevents disadvantage, tracks durability). Grades: common (3 dur), uncommon (5 dur, +bonus), rare (8 dur, +bonus), epic (12 dur, +bonus), legendary (20 dur, +bonus), mythic (infinite dur, +max bonus)",
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Item name",
        },
        description: {
          type: "string",
          description: "Item description and effects",
        },
        type: {
          type: "string",
          enum: ["normal", "consumable", "story", "misc"],
          description:
            "Item type: normal (breaks when durability depleted), consumable (one-use), story (quest item, never breaks), misc (prevents disadvantage only)",
        },
        grade: {
          type: "string",
          enum: ["common", "uncommon", "rare", "epic", "legendary", "mythic"],
          description:
            "Item grade/rarity. Affects durability and bonus: common (3 dur, +0), uncommon (5 dur, small bonus), rare (8 dur, medium bonus), epic (12 dur, good bonus), legendary (20 dur, great bonus), mythic (infinite dur, max bonus). Default: common",
        },
        quantity: {
          type: "number",
          description: "Number of items to add",
          minimum: 1,
        },
      },
      required: ["name", "description", "type", "quantity"],
    },
  },
};

const removeItemTool: ToolSchema = {
  type: "function",
  function: {
    name: "remove_item",
    description: "Remove items from player's inventory",
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Item name (fuzzy matching supported)",
        },
        quantity: {
          type: "number",
          description: "Number to remove",
          minimum: 1,
        },
      },
      required: ["name", "quantity"],
    },
  },
};

const modifyItemTool: ToolSchema = {
  type: "function",
  function: {
    name: "modify_item",
    description:
      "Change an existing item's description, type, grade, or durability",
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Item name (fuzzy matching supported)",
        },
        description: {
          type: "string",
          description: "New description (optional)",
        },
        type: {
          type: "string",
          enum: ["normal", "consumable", "story", "misc"],
          description: "New item type (optional)",
        },
        grade: {
          type: "string",
          enum: ["common", "uncommon", "rare", "epic", "legendary", "mythic"],
          description:
            "New item grade (optional) - upgrading increases max durability",
        },
        durability: {
          type: "number",
          description:
            "Set specific durability value (optional) - for repairs or damage",
          minimum: 0,
        },
      },
      required: ["name"],
    },
  },
};

const breakItemTool: ToolSchema = {
  type: "function",
  function: {
    name: "break_item",
    description:
      "Break an item (usually due to failed skill check). Story and misc items cannot break.",
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Item name (fuzzy matching supported)",
        },
      },
      required: ["name"],
    },
  },
};

const repairItemTool: ToolSchema = {
  type: "function",
  function: {
    name: "repair_item",
    description:
      "Repair an item using narrative magnitude. The actual durability restored is calculated as a percentage of max durability, scaled by difficulty.",
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Item name (fuzzy matching supported)",
        },
        magnitude: {
          type: "string",
          enum: ["patch", "repair", "fully_repair"],
          description:
            "How much to repair the item. 'patch' = 10%, 'repair' = 25%, 'fully_repair' = 100% of max durability.",
        },
      },
      required: ["name"],
    },
  },
};

const damageItemTool: ToolSchema = {
  type: "function",
  function: {
    name: "damage_item",
    description:
      "Damage an item using narrative magnitude. The actual durability loss is calculated as a percentage of max durability, scaled by difficulty. Item breaks if durability reaches 0.",
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Item name (fuzzy matching supported)",
        },
        magnitude: {
          type: "string",
          enum: ["scratch", "damage", "heavily_damage", "destroy"],
          description:
            "How much to damage the item. 'scratch' = 10%, 'damage' = 25%, 'heavily_damage' = 50%, 'destroy' = 100% of max durability.",
        },
      },
      required: ["name", "magnitude"],
    },
  },
};

const upgradeItemTool: ToolSchema = {
  type: "function",
  function: {
    name: "upgrade_item",
    description:
      "Upgrade an item's grade/rarity. Use for crafting, enchanting, or narrative upgrades. Increases max durability and bonuses.",
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Item name (fuzzy matching supported)",
        },
        newGrade: {
          type: "string",
          enum: ["uncommon", "rare", "epic", "legendary", "mythic"],
          description:
            "The new grade to upgrade to (must be higher than current grade)",
        },
      },
      required: ["name", "newGrade"],
    },
  },
};

const consumeItemTool: ToolSchema = {
  type: "function",
  function: {
    name: "consume_item",
    description: "Consume a consumable item (removes from inventory after use)",
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Item name (fuzzy matching supported)",
        },
      },
      required: ["name"],
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

// Passive Effect Tools
const addPassiveTool: ToolSchema = {
  type: "function",
  function: {
    name: "add_passive",
    description:
      "Grant the player a new passive effect. Passives are story/RP traits that influence narrative and AI behavior - they are NOT direct mechanical bonuses. Examples: 'Wolf Slayer' (wolves are easier to fight), 'Noble Blood' (nobles treat you with respect), 'Shadow Walker' (stealth situations favor you).",
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description:
            "Passive name (e.g., 'Wolf Slayer', 'Noble Blood', 'Shadow Walker', 'Fire Touched')",
        },
        description: {
          type: "string",
          description:
            "Narrative description of what this trait means for the character and how it influences situations (e.g., 'Wolves sense your predatory nature and are easier to intimidate or defeat')",
        },
      },
      required: ["name", "description"],
    },
  },
};

const removePassiveTool: ToolSchema = {
  type: "function",
  function: {
    name: "remove_passive",
    description:
      "Remove a passive effect from the player (lost through curse, story events, transformation reversal, etc.)",
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Passive name (fuzzy matching supported)",
        },
      },
      required: ["name"],
    },
  },
};

const modifyPassiveTool: ToolSchema = {
  type: "function",
  function: {
    name: "modify_passive",
    description:
      "Modify an existing passive's name or description. Use when a trait evolves through story events (e.g., 'Wolf Slayer' becomes 'Beast Master' after taming a wolf).",
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Current passive name (fuzzy matching supported)",
        },
        newName: {
          type: "string",
          description: "New name for the passive (optional)",
        },
        newDescription: {
          type: "string",
          description: "New description for the passive (optional)",
        },
      },
      required: ["name"],
    },
  },
};

// Character Field Management Tools (CharacterSchema system)
const modifyFieldTool: ToolSchema = {
  type: "function",
  function: {
    name: "modify_field",
    description:
      "Modify a character sheet field by a delta amount. Works with number fields (add/subtract) and resource fields (adjust current value). Use positive numbers to increase, negative to decrease. For resources, the result is clamped between 0 and max.",
    parameters: {
      type: "object",
      properties: {
        field: {
          type: "string",
          description:
            "Field name from character schema (fuzzy matching supported, e.g., 'Strength', 'Health', 'Mana')",
        },
        delta: {
          type: "integer",
          description:
            "The amount to change the field by. Positive increases, negative decreases. For resources, this adjusts the current value.",
        },
      },
      required: ["field", "delta"],
    },
  },
};

const setFieldTool: ToolSchema = {
  type: "function",
  function: {
    name: "set_field",
    description:
      "Set a character sheet field to a specific value. Works with all field types: number (set value), resource (set current and/or max), text (set string), boolean (set true/false), select (set option). Cannot modify derived fields (they are calculated automatically).",
    parameters: {
      type: "object",
      properties: {
        field: {
          type: "string",
          description:
            "Field name from character schema (fuzzy matching supported)",
        },
        value: {
          oneOf: [
            { type: "number" },
            { type: "boolean" },
            { type: "string" },
            {
              type: "object",
              properties: {
                current: { type: "number" },
                max: { type: "number" },
              },
              description: "For resource fields: { current, max }",
            },
          ],
          description:
            "The value to set. Type depends on field: number for number fields, boolean for boolean fields, string for text/select fields, { current, max } for resource fields.",
        },
      },
      required: ["field", "value"],
    },
  },
};

const addListItemTool: ToolSchema = {
  type: "function",
  function: {
    name: "add_list_item",
    description:
      "Add an item to a list field in the character sheet. Supports both simple strings and structured objects with name, emoji, description, and quantity.",
    parameters: {
      type: "object",
      properties: {
        field: {
          type: "string",
          description: "List field name from character schema",
        },
        item: {
          oneOf: [
            {
              type: "string",
              description: "Simple string item",
            },
            {
              type: "object",
              description:
                "Structured item object with name and optional emoji/description/quantity",
              properties: {
                name: {
                  type: "string",
                  description: "Item name (required)",
                },
                emoji: {
                  type: "string",
                  description:
                    "Single emoji representing the item (e.g., ⚔️, 📜, 💎, 🧪)",
                },
                description: {
                  type: "string",
                  description: "Item description",
                },
                quantity: {
                  type: "number",
                  description: "Quantity (default 1)",
                },
              },
              required: ["name"],
            },
          ],
          description:
            "Item to add - either a string or object with { name, emoji?, description?, quantity? }",
        },
      },
      required: ["field", "item"],
    },
  },
};

const removeListItemTool: ToolSchema = {
  type: "function",
  function: {
    name: "remove_list_item",
    description:
      "Remove an item from a list field in the character sheet. Uses fuzzy matching to find the item.",
    parameters: {
      type: "object",
      properties: {
        field: {
          type: "string",
          description: "List field name from character schema",
        },
        item: {
          type: "string",
          description: "Item to remove (fuzzy matching supported)",
        },
      },
      required: ["field", "item"],
    },
  },
};

// Achievement Tool
const triggerAchievementTool: ToolSchema = {
  type: "function",
  function: {
    name: "trigger_achievement",
    description:
      "Unlock an achievement and award progression points. Only locked achievements can be triggered.",
    parameters: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description: "Exact achievement title (fuzzy matching supported)",
        },
      },
      required: ["title"],
    },
  },
};

// Note Management Tools
const createNoteTool: ToolSchema = {
  type: "function",
  function: {
    name: "create_note",
    description:
      "Add a new note entry. IMPORTANT: Always provide onTriggers for notes that should be discovered during play. Triggers use EXACT word matching (case-insensitive), so include variations like 'dragon', 'dragons', 'Dragon'. Without triggers, note is visible immediately.",
    parameters: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description: "Note entry title (must be unique)",
        },
        content: {
          type: "string",
          description: "Note text content",
        },
        on: {
          type: "boolean",
          description:
            "Whether note is initially visible (default: false if triggers provided, true otherwise)",
        },
        onTriggers: {
          type: "array",
          items: { type: "string" },
          description:
            "Words that reveal this note when mentioned in the story. Uses EXACT matching - 'zombie' won't match 'zombies', so include all variations. Example: ['zombie', 'zombies', 'undead', 'Zombie']",
        },
        offTriggers: {
          type: "array",
          items: { type: "string" },
          description: "Words that hide this note when mentioned (optional)",
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
      "Update an existing note entry's content or triggers. Use this to modify notes as the story reveals more information.",
    parameters: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description: "Note entry title to update (fuzzy matching supported)",
        },
        newTitle: {
          type: "string",
          description: "New title for the note entry (optional)",
        },
        content: {
          type: "string",
          description: "New content for the note entry (optional)",
        },
        on: {
          type: "boolean",
          description: "Whether note is visible (optional)",
        },
        onTriggers: {
          type: "array",
          items: { type: "string" },
          description: "New words that reveal this note (replaces existing)",
        },
        offTriggers: {
          type: "array",
          items: { type: "string" },
          description: "New words that hide this note (replaces existing)",
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
      "Search through all notes (lore entries) for content matching a query. Returns matching excerpts with context. Use to find information before updating notes.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "Text to search for in note titles and content (case-insensitive)",
        },
        includeHidden: {
          type: "boolean",
          description: "Include hidden (on=false) notes (default: true)",
        },
        maxResults: {
          type: "number",
          description: "Maximum number of matches to return (default: 10)",
        },
      },
      required: ["query"],
    },
  },
};

// Momentum Tool
const modifyMomentumTool: ToolSchema = {
  type: "function",
  function: {
    name: "modify_momentum",
    description:
      "Change momentum value. Momentum represents forward story progress and player agency.",
    parameters: {
      type: "object",
      properties: {
        amount: {
          type: "number",
          description: "Momentum change (can be negative)",
        },
      },
      required: ["amount"],
    },
  },
};

// Relationship Management Tools
const addRelationshipTool: ToolSchema = {
  type: "function",
  function: {
    name: "add_relationship",
    description:
      "Create a new character relationship with initial value and description",
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Character name (must be unique)",
        },
        value: {
          type: "number",
          description:
            "Initial relationship value (-100 to 100, where negative is hostile and positive is friendly)",
          minimum: -100,
          maximum: 100,
        },
        description: {
          type: "string",
          description: "Current relationship status and context",
        },
      },
      required: ["name", "value", "description"],
    },
  },
};

const modifyRelationshipTool: ToolSchema = {
  type: "function",
  function: {
    name: "modify_relationship",
    description:
      "Change an existing relationship using narrative magnitude. The actual change is calculated based on difficulty and current relationship - enemies improve slowly, friends damage easily.",
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Character name (fuzzy matching supported)",
        },
        magnitude: {
          type: "string",
          enum: [
            "greatly_damage",
            "damage",
            "slightly_damage",
            "slightly_improve",
            "improve",
            "greatly_improve",
          ],
          description:
            "How much to change the relationship. Negative relationships are harder to improve, positive relationships are easier to damage.",
        },
        description: {
          type: "string",
          description: "New relationship description (optional)",
        },
      },
      required: ["name", "magnitude"],
    },
  },
};

const deleteRelationshipTool: ToolSchema = {
  type: "function",
  function: {
    name: "delete_relationship",
    description: "Remove a character relationship entirely",
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Character name (fuzzy matching supported)",
        },
      },
      required: ["name"],
    },
  },
};

const editRelationshipTool: ToolSchema = {
  type: "function",
  function: {
    name: "edit_relationship",
    description: "Update a relationship's description without changing value",
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Character name (fuzzy matching supported)",
        },
        description: {
          type: "string",
          description: "New relationship description",
        },
      },
      required: ["name", "description"],
    },
  },
};

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

// Condition Management Tools
const addConditionTool: ToolSchema = {
  type: "function",
  function: {
    name: "add_condition",
    description:
      "Inflict a condition/affliction on the character. Conditions impose penalties on skill checks based on their tier. Tier VI is permanent (often results in game over). Choose appropriate tier based on severity: I (minor inconvenience), II (noticeable hindrance), III (significant impairment), IV (severe debilitation), V (critical injury), VI (permanent disability).",
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description:
            "Condition name (e.g., 'Broken Arm', 'Poisoned', 'Exhausted', 'Blinded', 'Cursed')",
        },
        tier: {
          type: "number",
          enum: [1, 2, 3, 4, 5, 6],
          description:
            "Severity tier (1-6). Higher tiers impose greater penalties. Tier 6 is permanent.",
        },
        description: {
          type: "string",
          description: "Description of the condition and its narrative effects",
        },
        affects: {
          type: "array",
          items: { type: "string" },
          description:
            "List of stat names this condition affects (e.g., ['Strength', 'Acrobatics']). Use affectsAll for conditions affecting all checks.",
        },
        affectsAll: {
          type: "boolean",
          description:
            "If true, this condition affects ALL skill checks regardless of stat (optional, default: false)",
        },
        source: {
          type: "string",
          description:
            "What caused this condition (e.g., 'Dragon fire breath', 'Fell from cliff')",
        },
      },
      required: ["name", "tier", "description", "affects"],
    },
  },
};

const upgradeConditionTool: ToolSchema = {
  type: "function",
  function: {
    name: "upgrade_condition",
    description:
      "Worsen a condition by increasing its tier. Use when a condition becomes more severe due to neglect, failed treatment, or story events. Cannot go above tier 6.",
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Condition name (fuzzy matching supported)",
        },
        tiers: {
          type: "number",
          description: "Number of tiers to increase (default: 1)",
          minimum: 1,
        },
        description: {
          type: "string",
          description:
            "Updated description reflecting worsened state (optional)",
        },
      },
      required: ["name"],
    },
  },
};

const downgradeConditionTool: ToolSchema = {
  type: "function",
  function: {
    name: "downgrade_condition",
    description:
      "Improve a condition by decreasing its tier. Use when healing, treatment, or recovery occurs. If tier reaches 0, the condition is removed. Tier 6 (permanent) conditions cannot be downgraded.",
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Condition name (fuzzy matching supported)",
        },
        tiers: {
          type: "number",
          description: "Number of tiers to decrease (default: 1)",
          minimum: 1,
        },
        description: {
          type: "string",
          description:
            "Updated description reflecting improved state (optional)",
        },
      },
      required: ["name"],
    },
  },
};

const removeConditionTool: ToolSchema = {
  type: "function",
  function: {
    name: "remove_condition",
    description:
      "Completely remove a condition (full recovery or cure). Tier 6 (permanent) conditions cannot be removed without extraordinary circumstances (e.g., divine intervention, powerful magic).",
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Condition name (fuzzy matching supported)",
        },
        force: {
          type: "boolean",
          description:
            "Force removal of permanent (tier 6) condition due to extraordinary circumstances (default: false)",
        },
      },
      required: ["name"],
    },
  },
};

const modifyConditionTool: ToolSchema = {
  type: "function",
  function: {
    name: "modify_condition",
    description:
      "Update a condition's affected stats or description without changing tier",
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Condition name (fuzzy matching supported)",
        },
        description: {
          type: "string",
          description: "New description (optional)",
        },
        affects: {
          type: "array",
          items: { type: "string" },
          description: "New list of affected stats (optional)",
        },
        affectsAll: {
          type: "boolean",
          description: "New value for affectsAll flag (optional)",
        },
      },
      required: ["name"],
    },
  },
};

// Game Over Tool
const gameOverTool: ToolSchema = {
  type: "function",
  function: {
    name: "game_over",
    description:
      "End the game due to character death or permanent incapacitation. Use when a tier 6 condition narratively prevents the character from continuing, or when the story reaches a definitive fatal end. This is a major decision - only use when there is no reasonable way to continue.",
    parameters: {
      type: "object",
      properties: {
        reason: {
          type: "string",
          description:
            "Narrative reason for game over (e.g., 'Succumbed to wounds', 'Permanent blindness makes adventuring impossible')",
        },
        condition: {
          type: "string",
          description:
            "Name of the tier 6 condition causing game over (if applicable)",
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
            "Challenge tier: quick (best of 3), standard (best of 5), extended (best of 7), epic (best of 9). Or exact odd number 3-9.",
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
            "Points tier awarded on victory: trivial, minor, moderate (default), major, legendary. Or exact number.",
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
- SHORT (4-8 hours): Sleep/extended rest. Resets most cooldowns, downgrades minor conditions by 1 tier. Limited uses before long rest.
- LONG (several days): Extended downtime/time skip. All cooldowns reset, conditions improve 1-2 tiers. Resets quick/short rest counts.

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

// Export all tools as array
export const TOOL_SCHEMAS: ToolSchema[] = [
  // Quest Management (5 tools)
  createQuestTool,
  completeQuestTool,
  failQuestTool,
  updateQuestTool,
  deleteQuestTool,

  // Ability Management (5 tools)
  addAbilityTool,
  removeAbilityTool,
  modifyAbilityTool,
  upgradeAbilityTool,
  resetAbilityCooldownTool,

  // Passive Effect Management (3 tools)
  addPassiveTool,
  removePassiveTool,
  modifyPassiveTool,

  // Character Field Management (4 tools - CharacterSchema system)
  modifyFieldTool,
  setFieldTool,
  addListItemTool,
  removeListItemTool,

  // Achievement (1 tool)
  triggerAchievementTool,

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

  // Momentum (1 tool)
  modifyMomentumTool,

  // NPC Management (1 tool - creates lore for NPCs)
  addNpcTool,

  // Thread Management (4 tools)
  createThreadTool,
  updateThreadTool,
  resolveThreadTool,
  abandonThreadTool,

  // Memory (1 tool)
  addMemoryTool,

  // Conditions (5 tools) - add_condition moved to GM Stage
  upgradeConditionTool,
  downgradeConditionTool,
  removeConditionTool,
  modifyConditionTool,
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
