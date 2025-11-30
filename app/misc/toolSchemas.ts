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
          type: "number",
          description: "Point reward for completion (default: 50)",
          minimum: 1,
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
      "Repair an item, restoring its durability. Use for narrative repairs (blacksmith, magic, resting, etc.)",
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Item name (fuzzy matching supported)",
        },
        amount: {
          type: "number",
          description:
            "Amount of durability to restore. If omitted, fully repairs the item.",
          minimum: 1,
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
      "Damage an item, reducing its durability. Use for narrative damage (acid, fire, wear, etc.). Item breaks if durability reaches 0.",
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Item name (fuzzy matching supported)",
        },
        amount: {
          type: "number",
          description: "Amount of durability to remove",
          minimum: 1,
        },
      },
      required: ["name", "amount"],
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

// Resource Management Tools
const adjustResourceTool: ToolSchema = {
  type: "function",
  function: {
    name: "adjust_resource",
    description:
      "Modify a resource's current value and/or max value. Resources are capped at their max value.",
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description:
            "Resource name (fuzzy matching supported, e.g., Health, Stamina, Mana)",
        },
        currentDelta: {
          type: "number",
          description: "Change to current value (can be negative)",
        },
        maxDelta: {
          type: "number",
          description: "Change to max value (optional, can be negative)",
        },
      },
      required: ["name", "currentDelta"],
    },
  },
};

const setResourceTool: ToolSchema = {
  type: "function",
  function: {
    name: "set_resource",
    description:
      "Set a resource to specific current and/or max values (absolute, not delta)",
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Resource name (fuzzy matching supported)",
        },
        currentValue: {
          type: "number",
          description: "New current value (optional)",
          minimum: 0,
        },
        maxValue: {
          type: "number",
          description: "New max value (optional)",
          minimum: 1,
        },
      },
      required: ["name"],
    },
  },
};

const createResourceTool: ToolSchema = {
  type: "function",
  function: {
    name: "create_resource",
    description: "Create a brand new resource type for the character",
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Resource name (must be unique)",
        },
        description: {
          type: "string",
          description: "What this resource represents",
        },
        currentValue: {
          type: "number",
          description: "Starting current value",
          minimum: 0,
        },
        maxValue: {
          type: "number",
          description: "Starting max value",
          minimum: 1,
        },
      },
      required: ["name", "description", "currentValue", "maxValue"],
    },
  },
};

const deleteResourceTool: ToolSchema = {
  type: "function",
  function: {
    name: "delete_resource",
    description: "Remove a resource entirely from the character",
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Resource name (fuzzy matching supported)",
        },
      },
      required: ["name"],
    },
  },
};

// Stat Management Tools
const adjustStatTool: ToolSchema = {
  type: "function",
  function: {
    name: "adjust_stat",
    description:
      "Modify a character stat by a delta amount. Stats are capped at 0-100.",
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description:
            "Stat name (fuzzy matching supported, e.g., Strength, Stealth, Intelligence)",
        },
        valueDelta: {
          type: "number",
          description: "Change amount (can be negative)",
        },
      },
      required: ["name", "valueDelta"],
    },
  },
};

const setStatTool: ToolSchema = {
  type: "function",
  function: {
    name: "set_stat",
    description: "Set a stat to a specific value (absolute, not delta)",
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Stat name (fuzzy matching supported)",
        },
        value: {
          type: "number",
          description: "New stat value",
          minimum: 0,
          maximum: 100,
        },
      },
      required: ["name", "value"],
    },
  },
};

const createStatTool: ToolSchema = {
  type: "function",
  function: {
    name: "create_stat",
    description: "Create a brand new stat for the character",
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Stat name (must be unique)",
        },
        description: {
          type: "string",
          description: "What this stat represents",
        },
        value: {
          type: "number",
          description: "Starting value",
          minimum: 0,
          maximum: 100,
        },
      },
      required: ["name", "description", "value"],
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

// Lore Management Tools
const createLoreTool: ToolSchema = {
  type: "function",
  function: {
    name: "create_lore",
    description:
      "Add a new lore entry. IMPORTANT: Always provide onTriggers for lore that should be discovered during play. Triggers use EXACT word matching (case-insensitive), so include variations like 'dragon', 'dragons', 'Dragon'. Without triggers, lore is visible immediately.",
    parameters: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description: "Lore entry title (must be unique)",
        },
        content: {
          type: "string",
          description: "Lore text content",
        },
        on: {
          type: "boolean",
          description:
            "Whether lore is initially visible (default: false if triggers provided, true otherwise)",
        },
        onTriggers: {
          type: "array",
          items: { type: "string" },
          description:
            "Words that reveal this lore when mentioned in the story. Uses EXACT matching - 'zombie' won't match 'zombies', so include all variations. Example: ['zombie', 'zombies', 'undead', 'Zombie']",
        },
        offTriggers: {
          type: "array",
          items: { type: "string" },
          description: "Words that hide this lore when mentioned (optional)",
        },
        beatsTrigger: {
          type: "array",
          items: { type: "number" },
          description: "Beat indices that reveal this lore (optional)",
        },
        beatsUntrigger: {
          type: "array",
          items: { type: "number" },
          description: "Beat indices that hide this lore (optional)",
        },
      },
      required: ["title", "content"],
    },
  },
};

const deleteLoreTool: ToolSchema = {
  type: "function",
  function: {
    name: "delete_lore",
    description: "Remove a lore entry entirely",
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

const showLoreTool: ToolSchema = {
  type: "function",
  function: {
    name: "show_lore",
    description: "Make a lore entry visible to the player",
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

const hideLoreTool: ToolSchema = {
  type: "function",
  function: {
    name: "hide_lore",
    description: "Hide a lore entry from the player",
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

const listInactiveLoreTool: ToolSchema = {
  type: "function",
  function: {
    name: "list_inactive_lore",
    description:
      "List all inactive/hidden lore entries that can be revealed. Use this to discover what lore exists before calling show_lore. Returns titles and brief descriptions of hidden lore.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
  },
};

const updateLoreTool: ToolSchema = {
  type: "function",
  function: {
    name: "update_lore",
    description:
      "Update an existing lore entry's content or triggers. Use this to modify lore as the story reveals more information.",
    parameters: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description: "Lore entry title to update (fuzzy matching supported)",
        },
        newTitle: {
          type: "string",
          description: "New title for the lore entry (optional)",
        },
        content: {
          type: "string",
          description: "New content for the lore entry (optional)",
        },
        on: {
          type: "boolean",
          description: "Whether lore is visible (optional)",
        },
        onTriggers: {
          type: "array",
          items: { type: "string" },
          description: "New words that reveal this lore (replaces existing)",
        },
        offTriggers: {
          type: "array",
          items: { type: "string" },
          description: "New words that hide this lore (replaces existing)",
        },
      },
      required: ["title"],
    },
  },
};

// Plot Beat Tools
const markBeatTool: ToolSchema = {
  type: "function",
  function: {
    name: "mark_beat",
    description:
      "Mark a story beat as completed. This tracks major plot progression and can trigger lore reveals.",
    parameters: {
      type: "object",
      properties: {
        beatIndex: {
          type: "number",
          description: "Beat index (1-based)",
          minimum: 1,
        },
      },
      required: ["beatIndex"],
    },
  },
};

const unmarkBeatTool: ToolSchema = {
  type: "function",
  function: {
    name: "unmark_beat",
    description: "Unmark a story beat (mark as incomplete)",
    parameters: {
      type: "object",
      properties: {
        beatIndex: {
          type: "number",
          description: "Beat index (1-based)",
          minimum: 1,
        },
      },
      required: ["beatIndex"],
    },
  },
};

const createBeatTool: ToolSchema = {
  type: "function",
  function: {
    name: "create_beat",
    description: "Add a new story beat to track plot progression",
    parameters: {
      type: "object",
      properties: {
        description: {
          type: "string",
          description: "What this beat represents",
        },
      },
      required: ["description"],
    },
  },
};

const deleteBeatTool: ToolSchema = {
  type: "function",
  function: {
    name: "delete_beat",
    description: "Remove a story beat entirely",
    parameters: {
      type: "object",
      properties: {
        beatIndex: {
          type: "number",
          description: "Beat index (1-based)",
          minimum: 1,
        },
      },
      required: ["beatIndex"],
    },
  },
};

const editBeatTool: ToolSchema = {
  type: "function",
  function: {
    name: "edit_beat",
    description: "Change a story beat's description",
    parameters: {
      type: "object",
      properties: {
        beatIndex: {
          type: "number",
          description: "Beat index (1-based)",
          minimum: 1,
        },
        description: {
          type: "string",
          description: "New beat description",
        },
      },
      required: ["beatIndex", "description"],
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
    description: "Change an existing relationship value and/or description",
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Character name (fuzzy matching supported)",
        },
        valueDelta: {
          type: "number",
          description:
            "Change to relationship value (can be negative, capped at -100 to 100)",
        },
        description: {
          type: "string",
          description: "New relationship description (optional)",
        },
      },
      required: ["name", "valueDelta"],
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

// Memory Management Tool
const addMemoryTool: ToolSchema = {
  type: "function",
  function: {
    name: "add_memory",
    description:
      "Add a new detailed memory entry to help the AI remember important story events. Be SPECIFIC with names, locations, consequences, and emotional context.",
    parameters: {
      type: "object",
      properties: {
        entry: {
          type: "string",
          description:
            "Detailed memory entry (e.g., 'Met Aldric, suspicious merchant in Darkwater who tried to sell cursed artifacts and fled when confronted')",
        },
      },
      required: ["entry"],
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

// Variable Management Tools
const setVariableTool: ToolSchema = {
  type: "function",
  function: {
    name: "set_variable",
    description:
      "Set a variable to a specific value. For numbers, supports dice notation (e.g., '3d6+5'). For booleans, set true/false. For strings, set any text value. Cannot be used on list variables.",
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Variable name (fuzzy matching supported)",
        },
        value: {
          oneOf: [
            { type: "number" },
            { type: "boolean" },
            {
              type: "string",
              description:
                "Text value for string variables, or dice notation like '2d6+3' for numbers",
            },
          ],
          description:
            "Value to set: number, boolean, string text, or dice notation",
        },
      },
      required: ["name", "value"],
    },
  },
};

const modifyVariableTool: ToolSchema = {
  type: "function",
  function: {
    name: "modify_variable",
    description:
      "Modify a number variable by adding/subtracting. Supports dice notation (e.g., '-1d8+2' for damage, '+2d6' for healing). Only works on number variables.",
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Variable name (fuzzy matching supported)",
        },
        amount: {
          oneOf: [
            { type: "number" },
            {
              type: "string",
              description: "Dice notation like '-1d8+2' or '+2d6'",
            },
          ],
          description:
            "Amount to add/subtract: number or dice notation (negative for subtraction)",
        },
      },
      required: ["name", "amount"],
    },
  },
};

const toggleVariableTool: ToolSchema = {
  type: "function",
  function: {
    name: "toggle_variable",
    description:
      "Toggle a boolean variable between true and false. Only works on boolean variables.",
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Variable name (fuzzy matching supported)",
        },
      },
      required: ["name"],
    },
  },
};

const addToListTool: ToolSchema = {
  type: "function",
  function: {
    name: "add_to_list",
    description:
      "Add an item to a list variable. Respects maxSize if defined. Only works on list variables.",
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "List variable name (fuzzy matching supported)",
        },
        item: {
          type: "string",
          description: "Item to add to the list",
        },
      },
      required: ["name", "item"],
    },
  },
};

const removeFromListTool: ToolSchema = {
  type: "function",
  function: {
    name: "remove_from_list",
    description:
      "Remove an item from a list variable. Uses fuzzy matching to find the item. Only works on list variables.",
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "List variable name (fuzzy matching supported)",
        },
        item: {
          type: "string",
          description: "Item to remove (fuzzy matching supported)",
        },
      },
      required: ["name", "item"],
    },
  },
};

const clearListTool: ToolSchema = {
  type: "function",
  function: {
    name: "clear_list",
    description:
      "Remove all items from a list variable. Only works on list variables.",
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "List variable name (fuzzy matching supported)",
        },
      },
      required: ["name"],
    },
  },
};

const createVariableTool: ToolSchema = {
  type: "function",
  function: {
    name: "create_variable",
    description:
      "Create a new variable to track custom game state. Types: 'number' for counters/timers, 'boolean' for flags, 'string' for text values (day, location, etc.), 'list' for collections.",
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description:
            "Variable name (e.g., 'Days Until Festival', 'Current Weather', 'Allies Met')",
        },
        type: {
          type: "string",
          enum: ["number", "boolean", "string", "list"],
          description: "Variable type: number, boolean, string, or list",
        },
        value: {
          oneOf: [{ type: "number" }, { type: "boolean" }, { type: "string" }],
          description:
            "Initial value (for number/boolean/string types). Lists start empty.",
        },
        description: {
          type: "string",
          description: "What this variable tracks (shown to player)",
        },
        options: {
          type: "array",
          items: { type: "string" },
          description:
            "For string variables only: predefined options (e.g., ['Monday', 'Tuesday', ...])",
        },
        minValue: {
          type: "number",
          description: "For number variables only: minimum allowed value",
        },
        maxValue: {
          type: "number",
          description: "For number variables only: maximum allowed value",
        },
        maxSize: {
          type: "number",
          description: "For list variables only: maximum number of items",
        },
      },
      required: ["name", "type"],
    },
  },
};

const deleteVariableTool: ToolSchema = {
  type: "function",
  function: {
    name: "delete_variable",
    description:
      "Delete a variable that is no longer needed. Use when a tracked value becomes irrelevant to the story.",
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Variable name to delete (fuzzy matching supported)",
        },
      },
      required: ["name"],
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

  // Item Management (8 tools)
  addItemTool,
  removeItemTool,
  modifyItemTool,
  breakItemTool,
  consumeItemTool,
  repairItemTool,
  damageItemTool,
  upgradeItemTool,

  // Ability Management (5 tools)
  addAbilityTool,
  removeAbilityTool,
  modifyAbilityTool,
  upgradeAbilityTool,
  resetAbilityCooldownTool,

  // Resource Management (4 tools)
  adjustResourceTool,
  setResourceTool,
  createResourceTool,
  deleteResourceTool,

  // Stat Management (3 tools)
  adjustStatTool,
  setStatTool,
  createStatTool,

  // Achievement (1 tool)
  triggerAchievementTool,

  // Lore Management (6 tools)
  createLoreTool,
  deleteLoreTool,
  showLoreTool,
  hideLoreTool,
  updateLoreTool,
  listInactiveLoreTool,

  // Plot Beats (5 tools)
  markBeatTool,
  unmarkBeatTool,
  createBeatTool,
  deleteBeatTool,
  editBeatTool,

  // Momentum (1 tool)
  modifyMomentumTool,

  // Relationships (4 tools)
  addRelationshipTool,
  modifyRelationshipTool,
  deleteRelationshipTool,
  editRelationshipTool,

  // Memory (1 tool)
  addMemoryTool,

  // Conditions (6 tools)
  addConditionTool,
  upgradeConditionTool,
  downgradeConditionTool,
  removeConditionTool,
  modifyConditionTool,
  gameOverTool,

  // Variable Management (8 tools)
  setVariableTool,
  modifyVariableTool,
  toggleVariableTool,
  addToListTool,
  removeFromListTool,
  clearListTool,
  createVariableTool,
  deleteVariableTool,

  // Mythic GME (9 tools)
  ...MYTHIC_TOOLS,
];

// Export map for quick lookup by name
export const TOOL_MAP = new Map(
  TOOL_SCHEMAS.map((tool) => [tool.function.name, tool])
);

// Export just function names for easy reference
export const TOOL_NAMES = TOOL_SCHEMAS.map((tool) => tool.function.name);
