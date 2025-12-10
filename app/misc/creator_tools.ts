/**
 * Creator Tools - Tool definitions for the Creator AI
 *
 * These tools allow the AI to modify adventure data through structured
 * tool calls instead of raw JSON output.
 */

import {
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
  SkillTree,
  CustomTable,
  UpgradeSettings,
  LevelingSettings,
  StartingChoice,
} from "@/app/misc/structs";

// Tool parameter types
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, JSONSchemaProperty>;
    required: string[];
  };
}

interface JSONSchemaProperty {
  type: string;
  description?: string;
  items?: JSONSchemaProperty;
  properties?: Record<string, JSONSchemaProperty>;
  required?: string[];
  enum?: string[];
  default?: unknown;
}

// ============================================
// DEPRECATED: STATS TOOLS (Use Character Schema Fields instead)
// These tools modify the legacy stats[] array which is deprecated.
// Use add_schema_fields with type: "number" for attributes.
// ============================================

// DEPRECATED - kept for backwards compatibility but removed from CREATOR_TOOLS
export const add_stats: ToolDefinition = {
  name: "add_stats",
  description:
    "DEPRECATED: Use add_schema_fields instead. Add character attributes as schema fields with type 'number'.",
  parameters: {
    type: "object",
    properties: {
      stats: {
        type: "array",
        description: "Array of stats to add",
        items: {
          type: "object",
          properties: {
            name: {
              type: "string",
              description: "Stat name (e.g., 'Strength')",
            },
            value: { type: "number", description: "Starting value (1-100)" },
            description: {
              type: "string",
              description: "What this stat represents",
            },
            symbol: {
              type: "string",
              description: "Emoji symbol (e.g., '💪')",
            },
          },
          required: ["name", "value", "description", "symbol"],
        },
      },
    },
    required: ["stats"],
  },
};

// DEPRECATED
export const modify_stats: ToolDefinition = {
  name: "modify_stats",
  description: "DEPRECATED: Use modify_schema_fields instead.",
  parameters: {
    type: "object",
    properties: {
      stats: {
        type: "array",
        description: "Array of stat modifications",
        items: {
          type: "object",
          properties: {
            name: {
              type: "string",
              description: "Name of stat to modify (must match existing)",
            },
            new_name: { type: "string", description: "New name (if renaming)" },
            value: { type: "number", description: "New value" },
            description: { type: "string", description: "New description" },
            symbol: { type: "string", description: "New symbol" },
          },
          required: ["name"],
        },
      },
    },
    required: ["stats"],
  },
};

// DEPRECATED
export const remove_stats: ToolDefinition = {
  name: "remove_stats",
  description: "DEPRECATED: Use remove_schema_fields instead.",
  parameters: {
    type: "object",
    properties: {
      names: {
        type: "array",
        description: "Names of stats to remove",
        items: { type: "string" },
      },
    },
    required: ["names"],
  },
};

// ============================================
// DEPRECATED: RESOURCES TOOLS (Use Character Schema Fields instead)
// These tools modify the legacy resources[] array which is deprecated.
// Use add_schema_fields with type: "resource" for pools with current/max.
// ============================================

// DEPRECATED
export const add_resources: ToolDefinition = {
  name: "add_resources",
  description:
    "DEPRECATED: Use add_schema_fields with type 'resource' instead.",
  parameters: {
    type: "object",
    properties: {
      resources: {
        type: "array",
        description: "Array of resources to add",
        items: {
          type: "object",
          properties: {
            name: {
              type: "string",
              description: "Resource name (e.g., 'Health')",
            },
            value: { type: "number", description: "Starting current value" },
            maxValue: { type: "number", description: "Maximum value" },
            description: {
              type: "string",
              description: "What this resource represents",
            },
            symbol: {
              type: "string",
              description: "Emoji symbol (e.g., '❤️')",
            },
          },
          required: ["name", "value", "maxValue", "description", "symbol"],
        },
      },
    },
    required: ["resources"],
  },
};

// DEPRECATED
export const modify_resources: ToolDefinition = {
  name: "modify_resources",
  description: "DEPRECATED: Use modify_schema_fields instead.",
  parameters: {
    type: "object",
    properties: {
      resources: {
        type: "array",
        description: "Array of resource modifications",
        items: {
          type: "object",
          properties: {
            name: { type: "string", description: "Name of resource to modify" },
            new_name: { type: "string", description: "New name (if renaming)" },
            value: { type: "number", description: "New current value" },
            maxValue: { type: "number", description: "New max value" },
            description: { type: "string", description: "New description" },
            symbol: { type: "string", description: "New symbol" },
          },
          required: ["name"],
        },
      },
    },
    required: ["resources"],
  },
};

// DEPRECATED
export const remove_resources: ToolDefinition = {
  name: "remove_resources",
  description: "DEPRECATED: Use remove_schema_fields instead.",
  parameters: {
    type: "object",
    properties: {
      names: {
        type: "array",
        description: "Names of resources to remove",
        items: { type: "string" },
      },
    },
    required: ["names"],
  },
};

// ============================================
// ITEMS TOOLS
// ============================================

export const add_items: ToolDefinition = {
  name: "add_items",
  description:
    "Add items to the starting inventory. Types: normal (breaks on fail), consumable (used once), story (quest items), misc (no break).",
  parameters: {
    type: "object",
    properties: {
      items: {
        type: "array",
        description: "Array of items to add",
        items: {
          type: "object",
          properties: {
            name: { type: "string", description: "Item name" },
            quantity: { type: "number", description: "Stack quantity" },
            description: { type: "string", description: "Item description" },
            type: {
              type: "string",
              enum: ["normal", "consumable", "story", "misc"],
              description: "Item behavior type",
            },
            grade: {
              type: "string",
              enum: [
                "common",
                "uncommon",
                "rare",
                "epic",
                "legendary",
                "mythic",
              ],
              description: "Item rarity/grade",
            },
            stat: { type: "string", description: "Associated stat (optional)" },
            symbol: { type: "string", description: "Emoji symbol" },
          },
          required: ["name", "quantity", "description", "type", "symbol"],
        },
      },
    },
    required: ["items"],
  },
};

export const modify_items: ToolDefinition = {
  name: "modify_items",
  description: "Modify existing items by name.",
  parameters: {
    type: "object",
    properties: {
      items: {
        type: "array",
        description: "Array of item modifications",
        items: {
          type: "object",
          properties: {
            name: { type: "string", description: "Name of item to modify" },
            new_name: { type: "string", description: "New name (if renaming)" },
            quantity: { type: "number", description: "New quantity" },
            description: { type: "string", description: "New description" },
            type: {
              type: "string",
              enum: ["normal", "consumable", "story", "misc"],
            },
            grade: {
              type: "string",
              enum: [
                "common",
                "uncommon",
                "rare",
                "epic",
                "legendary",
                "mythic",
              ],
            },
            stat: { type: "string", description: "New associated stat" },
            symbol: { type: "string", description: "New symbol" },
          },
          required: ["name"],
        },
      },
    },
    required: ["items"],
  },
};

export const remove_items: ToolDefinition = {
  name: "remove_items",
  description: "Remove items by name.",
  parameters: {
    type: "object",
    properties: {
      names: {
        type: "array",
        description: "Names of items to remove",
        items: { type: "string" },
      },
    },
    required: ["names"],
  },
};

// ============================================
// ABILITIES TOOLS
// ============================================

export const add_abilities: ToolDefinition = {
  name: "add_abilities",
  description:
    "Add abilities (skills, spells, techniques). Abilities have grades that provide bonuses and can have resource costs.",
  parameters: {
    type: "object",
    properties: {
      abilities: {
        type: "array",
        description: "Array of abilities to add",
        items: {
          type: "object",
          properties: {
            name: { type: "string", description: "Ability name" },
            description: {
              type: "string",
              description: "What the ability does",
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
              description: "Ability grade (determines bonus)",
            },
            cost: {
              type: "array",
              description: "Resource/variable costs to use",
              items: {
                type: "object",
                properties: {
                  type: { type: "string", enum: ["resource", "variable"] },
                  name: {
                    type: "string",
                    description: "Resource/variable name",
                  },
                  amount: { type: "number", description: "Cost amount" },
                },
                required: ["type", "name", "amount"],
              },
            },
            cooldown: {
              type: "number",
              description: "Turns before can use again (0 = no cooldown)",
            },
            stat: { type: "string", description: "Associated stat (optional)" },
            symbol: { type: "string", description: "Emoji symbol" },
          },
          required: ["name", "description", "grade", "cost", "symbol"],
        },
      },
    },
    required: ["abilities"],
  },
};

export const modify_abilities: ToolDefinition = {
  name: "modify_abilities",
  description: "Modify existing abilities by name.",
  parameters: {
    type: "object",
    properties: {
      abilities: {
        type: "array",
        description: "Array of ability modifications",
        items: {
          type: "object",
          properties: {
            name: { type: "string", description: "Name of ability to modify" },
            new_name: { type: "string", description: "New name (if renaming)" },
            description: { type: "string" },
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
            },
            cost: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  type: { type: "string", enum: ["resource", "variable"] },
                  name: { type: "string" },
                  amount: { type: "number" },
                },
              },
            },
            cooldown: { type: "number" },
            stat: { type: "string" },
            symbol: { type: "string" },
          },
          required: ["name"],
        },
      },
    },
    required: ["abilities"],
  },
};

export const remove_abilities: ToolDefinition = {
  name: "remove_abilities",
  description: "Remove abilities by name.",
  parameters: {
    type: "object",
    properties: {
      names: {
        type: "array",
        description: "Names of abilities to remove",
        items: { type: "string" },
      },
    },
    required: ["names"],
  },
};

// ============================================
// PASSIVES TOOLS
// ============================================

export const add_passives: ToolDefinition = {
  name: "add_passives",
  description:
    "Add passive effects/traits. Passives are story/RP traits that influence narrative, difficulty, and NPC reactions - NOT direct mechanical bonuses. Examples: 'Wolf Slayer' makes wolves easier to fight, 'Noble Blood' makes nobles treat you with respect.",
  parameters: {
    type: "object",
    properties: {
      passives: {
        type: "array",
        description: "Array of passives to add",
        items: {
          type: "object",
          properties: {
            name: { type: "string", description: "Passive name" },
            description: {
              type: "string",
              description: "What the passive does/represents",
            },
          },
          required: ["name", "description"],
        },
      },
    },
    required: ["passives"],
  },
};

export const modify_passives: ToolDefinition = {
  name: "modify_passives",
  description: "Modify existing passives by name.",
  parameters: {
    type: "object",
    properties: {
      passives: {
        type: "array",
        description: "Array of passive modifications",
        items: {
          type: "object",
          properties: {
            name: { type: "string", description: "Name of passive to modify" },
            new_name: { type: "string", description: "New name (if renaming)" },
            description: { type: "string", description: "New description" },
          },
          required: ["name"],
        },
      },
    },
    required: ["passives"],
  },
};

export const remove_passives: ToolDefinition = {
  name: "remove_passives",
  description: "Remove passives by name.",
  parameters: {
    type: "object",
    properties: {
      names: {
        type: "array",
        description: "Names of passives to remove",
        items: { type: "string" },
      },
    },
    required: ["names"],
  },
};

// ============================================
// LORE TOOLS
// ============================================

export const add_lore: ToolDefinition = {
  name: "add_lore",
  description:
    "Add lore entries. Lore provides world-building context to the AI. Can be triggered on/off by keywords or variables.",
  parameters: {
    type: "object",
    properties: {
      lore: {
        type: "array",
        description: "Array of lore entries to add",
        items: {
          type: "object",
          properties: {
            title: { type: "string", description: "Lore entry title" },
            content: {
              type: "string",
              description: "Full lore content (2-4 paragraphs recommended)",
            },
            secret: {
              type: "boolean",
              description: "If true, hidden from player but visible to AI",
            },
            alwaysOn: {
              type: "boolean",
              description: "If true, always active regardless of triggers",
            },
            on_triggers: {
              type: "array",
              description: "Keywords that activate this lore",
              items: { type: "string" },
            },
            off_triggers: {
              type: "array",
              description: "Keywords that deactivate this lore",
              items: { type: "string" },
            },
            var_on_triggers: {
              type: "array",
              description: "Variable names that activate when true",
              items: { type: "string" },
            },
            var_off_triggers: {
              type: "array",
              description: "Variable names that deactivate when true",
              items: { type: "string" },
            },
            trigger_lores: {
              type: "array",
              description:
                "Lore titles that activate this entry when they activate",
              items: { type: "string" },
            },
          },
          required: ["title", "content"],
        },
      },
    },
    required: ["lore"],
  },
};

export const modify_lore: ToolDefinition = {
  name: "modify_lore",
  description: "Modify existing lore entries by title.",
  parameters: {
    type: "object",
    properties: {
      lore: {
        type: "array",
        description: "Array of lore modifications",
        items: {
          type: "object",
          properties: {
            title: { type: "string", description: "Title of lore to modify" },
            new_title: {
              type: "string",
              description: "New title (if renaming)",
            },
            content: { type: "string" },
            secret: { type: "boolean" },
            alwaysOn: { type: "boolean" },
            on_triggers: { type: "array", items: { type: "string" } },
            off_triggers: { type: "array", items: { type: "string" } },
            var_on_triggers: { type: "array", items: { type: "string" } },
            var_off_triggers: { type: "array", items: { type: "string" } },
            trigger_lores: { type: "array", items: { type: "string" } },
          },
          required: ["title"],
        },
      },
    },
    required: ["lore"],
  },
};

export const remove_lore: ToolDefinition = {
  name: "remove_lore",
  description: "Remove lore entries by title.",
  parameters: {
    type: "object",
    properties: {
      titles: {
        type: "array",
        description: "Titles of lore entries to remove",
        items: { type: "string" },
      },
    },
    required: ["titles"],
  },
};

// ============================================
// ACHIEVEMENTS TOOLS
// ============================================

export const add_achievements: ToolDefinition = {
  name: "add_achievements",
  description:
    "Add achievements. Achievements are milestones that award XP when unlocked by the AI during gameplay.",
  parameters: {
    type: "object",
    properties: {
      achievements: {
        type: "array",
        description: "Array of achievements to add",
        items: {
          type: "object",
          properties: {
            title: { type: "string", description: "Achievement title" },
            description: {
              type: "string",
              description: "Player-visible description",
            },
            ai_hint: {
              type: "string",
              description:
                "Precise conditions for AI to trigger this (not shown to player)",
            },
            points: { type: "number", description: "XP awarded when unlocked" },
            hidden: {
              type: "boolean",
              description: "If true, hidden from player until unlocked",
            },
            rewardDescription: {
              type: "string",
              description: "Description of reward (optional)",
            },
            symbol: { type: "string", description: "Emoji symbol" },
          },
          required: ["title", "description", "points", "symbol"],
        },
      },
    },
    required: ["achievements"],
  },
};

export const modify_achievements: ToolDefinition = {
  name: "modify_achievements",
  description: "Modify existing achievements by title.",
  parameters: {
    type: "object",
    properties: {
      achievements: {
        type: "array",
        description: "Array of achievement modifications",
        items: {
          type: "object",
          properties: {
            title: {
              type: "string",
              description: "Title of achievement to modify",
            },
            new_title: {
              type: "string",
              description: "New title (if renaming)",
            },
            description: { type: "string" },
            ai_hint: { type: "string" },
            points: { type: "number" },
            hidden: { type: "boolean" },
            rewardDescription: { type: "string" },
            symbol: { type: "string" },
          },
          required: ["title"],
        },
      },
    },
    required: ["achievements"],
  },
};

export const remove_achievements: ToolDefinition = {
  name: "remove_achievements",
  description: "Remove achievements by title.",
  parameters: {
    type: "object",
    properties: {
      titles: {
        type: "array",
        description: "Titles of achievements to remove",
        items: { type: "string" },
      },
    },
    required: ["titles"],
  },
};

// ============================================
// QUESTS TOOLS
// ============================================

export const add_quests: ToolDefinition = {
  name: "add_quests",
  description:
    "Add quests. Quests are objectives that can be activated, tracked, and completed during gameplay.",
  parameters: {
    type: "object",
    properties: {
      quests: {
        type: "array",
        description: "Array of quests to add",
        items: {
          type: "object",
          properties: {
            id: { type: "string", description: "Unique quest ID" },
            title: { type: "string", description: "Quest title" },
            shortDescription: {
              type: "string",
              description: "Brief summary for quest list",
            },
            description: {
              type: "string",
              description: "Full quest description",
            },
            active: {
              type: "boolean",
              description: "Whether quest starts active",
            },
            points: { type: "number", description: "XP awarded on completion" },
          },
          required: [
            "id",
            "title",
            "shortDescription",
            "description",
            "points",
          ],
        },
      },
    },
    required: ["quests"],
  },
};

export const modify_quests: ToolDefinition = {
  name: "modify_quests",
  description: "Modify existing quests by ID or title.",
  parameters: {
    type: "object",
    properties: {
      quests: {
        type: "array",
        description: "Array of quest modifications",
        items: {
          type: "object",
          properties: {
            id: {
              type: "string",
              description: "ID of quest to modify (or use title)",
            },
            title: {
              type: "string",
              description: "Title of quest to modify (if no ID)",
            },
            new_id: { type: "string" },
            new_title: { type: "string" },
            shortDescription: { type: "string" },
            description: { type: "string" },
            active: { type: "boolean" },
            points: { type: "number" },
          },
          required: [],
        },
      },
    },
    required: ["quests"],
  },
};

export const remove_quests: ToolDefinition = {
  name: "remove_quests",
  description: "Remove quests by ID or title.",
  parameters: {
    type: "object",
    properties: {
      ids: {
        type: "array",
        description: "IDs or titles of quests to remove",
        items: { type: "string" },
      },
    },
    required: ["ids"],
  },
};

// ============================================
// RELATIONSHIPS TOOLS
// ============================================

export const add_relationships: ToolDefinition = {
  name: "add_relationships",
  description:
    "Add relationship trackers for NPCs or factions. Values range from -100 (enemy) to +100 (ally).",
  parameters: {
    type: "object",
    properties: {
      relationships: {
        type: "array",
        description: "Array of relationships to add",
        items: {
          type: "object",
          properties: {
            name: { type: "string", description: "Character/faction name" },
            value: {
              type: "number",
              description: "Starting value (-100 to 100)",
            },
            description: {
              type: "string",
              description: "Relationship description",
            },
            symbol: { type: "string", description: "Emoji symbol" },
          },
          required: ["name", "value", "description", "symbol"],
        },
      },
    },
    required: ["relationships"],
  },
};

export const modify_relationships: ToolDefinition = {
  name: "modify_relationships",
  description: "Modify existing relationships by name.",
  parameters: {
    type: "object",
    properties: {
      relationships: {
        type: "array",
        description: "Array of relationship modifications",
        items: {
          type: "object",
          properties: {
            name: {
              type: "string",
              description: "Name of relationship to modify",
            },
            new_name: { type: "string" },
            value: { type: "number" },
            description: { type: "string" },
            symbol: { type: "string" },
          },
          required: ["name"],
        },
      },
    },
    required: ["relationships"],
  },
};

export const remove_relationships: ToolDefinition = {
  name: "remove_relationships",
  description: "Remove relationships by name.",
  parameters: {
    type: "object",
    properties: {
      names: {
        type: "array",
        description: "Names of relationships to remove",
        items: { type: "string" },
      },
    },
    required: ["names"],
  },
};

// ============================================
// VARIABLES TOOLS
// ============================================

export const add_variables: ToolDefinition = {
  name: "add_variables",
  description:
    "Add tracked variables. Types: number, boolean, string, list. Used for game state tracking.",
  parameters: {
    type: "object",
    properties: {
      variables: {
        type: "array",
        description: "Array of variables to add",
        items: {
          type: "object",
          properties: {
            id: { type: "string", description: "Unique variable ID" },
            name: { type: "string", description: "Display name" },
            description: {
              type: "string",
              description: "What this variable tracks",
            },
            type: {
              type: "string",
              enum: ["number", "boolean", "string", "list"],
            },
            value: {
              type: "string",
              description: "Initial value (as string, will be parsed)",
            },
            minValue: {
              type: "number",
              description: "For numbers: minimum value",
            },
            maxValue: {
              type: "number",
              description: "For numbers: maximum value",
            },
            options: {
              type: "array",
              description: "For strings: predefined options",
              items: { type: "string" },
            },
          },
          required: ["id", "name", "description", "type"],
        },
      },
    },
    required: ["variables"],
  },
};

export const modify_variables: ToolDefinition = {
  name: "modify_variables",
  description: "Modify existing variables by ID or name.",
  parameters: {
    type: "object",
    properties: {
      variables: {
        type: "array",
        description: "Array of variable modifications",
        items: {
          type: "object",
          properties: {
            id: { type: "string", description: "ID of variable to modify" },
            name: {
              type: "string",
              description: "Name of variable (if no ID)",
            },
            new_id: { type: "string" },
            new_name: { type: "string" },
            description: { type: "string" },
            type: {
              type: "string",
              enum: ["number", "boolean", "string", "list"],
            },
            value: { type: "string" },
            minValue: { type: "number" },
            maxValue: { type: "number" },
            options: { type: "array", items: { type: "string" } },
          },
          required: [],
        },
      },
    },
    required: ["variables"],
  },
};

export const remove_variables: ToolDefinition = {
  name: "remove_variables",
  description: "Remove variables by ID or name.",
  parameters: {
    type: "object",
    properties: {
      ids: {
        type: "array",
        description: "IDs or names of variables to remove",
        items: { type: "string" },
      },
    },
    required: ["ids"],
  },
};

// ============================================
// PRESETS TOOLS
// ============================================

export const add_presets: ToolDefinition = {
  name: "add_presets",
  description:
    "Add character presets. Presets are predefined character builds players can choose at story start.",
  parameters: {
    type: "object",
    properties: {
      presets: {
        type: "array",
        description: "Array of presets to add",
        items: {
          type: "object",
          properties: {
            id: { type: "string", description: "Unique preset ID" },
            name: {
              type: "string",
              description: "Preset name (e.g., 'Warrior')",
            },
            description: { type: "string", description: "Preset description" },
            icon: { type: "string", description: "Emoji icon" },
            playerName: {
              type: "string",
              description: "Default character name (optional)",
            },
            playerSummary: {
              type: "string",
              description: "Character background summary",
            },
            intro: {
              type: "string",
              description: "Custom intro text for this preset (optional)",
            },
            authorNotes: {
              type: "string",
              description: "Notes for AI about this preset",
            },
            stats: {
              type: "array",
              description: "Starting stats for this preset",
              items: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  value: { type: "number" },
                  description: { type: "string" },
                  symbol: { type: "string" },
                },
              },
            },
            resources: {
              type: "array",
              description: "Starting resources for this preset",
              items: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  value: { type: "number" },
                  maxValue: { type: "number" },
                  description: { type: "string" },
                  symbol: { type: "string" },
                },
              },
            },
            inventory: {
              type: "array",
              description: "Starting items for this preset",
              items: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  quantity: { type: "number" },
                  description: { type: "string" },
                  type: { type: "string" },
                  symbol: { type: "string" },
                },
              },
            },
            abilities: {
              type: "array",
              description: "Starting abilities for this preset",
              items: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  description: { type: "string" },
                  grade: { type: "string" },
                  cost: { type: "array" },
                  symbol: { type: "string" },
                },
              },
            },
            relationships: {
              type: "array",
              description: "Starting relationships for this preset",
              items: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  value: { type: "number" },
                  description: { type: "string" },
                  symbol: { type: "string" },
                },
              },
            },
          },
          required: ["id", "name", "description", "icon", "playerSummary"],
        },
      },
    },
    required: ["presets"],
  },
};

export const modify_presets: ToolDefinition = {
  name: "modify_presets",
  description: "Modify existing presets by ID or name.",
  parameters: {
    type: "object",
    properties: {
      presets: {
        type: "array",
        description: "Array of preset modifications",
        items: {
          type: "object",
          properties: {
            id: { type: "string", description: "ID of preset to modify" },
            name: { type: "string", description: "Name of preset (if no ID)" },
            new_id: { type: "string" },
            new_name: { type: "string" },
            description: { type: "string" },
            icon: { type: "string" },
            playerName: { type: "string" },
            playerSummary: { type: "string" },
            intro: { type: "string" },
            authorNotes: { type: "string" },
            stats: { type: "array" },
            resources: { type: "array" },
            inventory: { type: "array" },
            abilities: { type: "array" },
            relationships: { type: "array" },
          },
          required: [],
        },
      },
    },
    required: ["presets"],
  },
};

export const remove_presets: ToolDefinition = {
  name: "remove_presets",
  description: "Remove presets by ID or name.",
  parameters: {
    type: "object",
    properties: {
      ids: {
        type: "array",
        description: "IDs or names of presets to remove",
        items: { type: "string" },
      },
    },
    required: ["ids"],
  },
};

// ============================================
// SKILL TREES TOOLS
// ============================================

export const add_skill_trees: ToolDefinition = {
  name: "add_skill_trees",
  description:
    "Add skill trees for character progression. Each tree contains nodes that grant bonuses, abilities, or items when unlocked. 1 upgrade point = 1 node unlock.",
  parameters: {
    type: "object",
    properties: {
      skill_trees: {
        type: "array",
        description: "Array of skill trees to add",
        items: {
          type: "object",
          properties: {
            id: { type: "string", description: "Unique tree ID" },
            name: {
              type: "string",
              description: "Tree name (e.g., 'Warrior Path')",
            },
            description: { type: "string", description: "Tree description" },
            symbol: { type: "string", description: "Emoji symbol" },
            nodes: {
              type: "array",
              description: "Nodes in this tree",
              items: {
                type: "object",
                properties: {
                  id: {
                    type: "string",
                    description: "Unique node ID within tree",
                  },
                  name: { type: "string", description: "Node name" },
                  description: {
                    type: "string",
                    description: "Node description",
                  },
                  symbol: { type: "string", description: "Node symbol" },
                  type: {
                    type: "string",
                    enum: ["stat", "ability", "item", "passive", "resource"],
                    description: "Primary effect type",
                  },
                  position: {
                    type: "object",
                    description: "Visual position (x: 0-100, y: 0-100)",
                    properties: {
                      x: { type: "number" },
                      y: { type: "number" },
                    },
                  },
                  prerequisites: {
                    type: "array",
                    description:
                      "Node IDs that must be unlocked first (empty = root)",
                    items: { type: "string" },
                  },
                  effects: {
                    type: "array",
                    description: "Effects granted when unlocked",
                    items: {
                      type: "object",
                      properties: {
                        type: {
                          type: "string",
                          enum: [
                            "stat_bonus",
                            "resource_bonus",
                            "grant_ability",
                            "grant_item",
                            "passive",
                          ],
                        },
                        target: {
                          type: "string",
                          description:
                            "Stat/resource/ability/item name or passive description",
                        },
                        value: {
                          type: "number",
                          description: "Bonus amount (for stat/resource)",
                        },
                        quantity: {
                          type: "number",
                          description: "Item quantity (for grant_item)",
                        },
                        abilityData: {
                          type: "object",
                          description: "Full ability data (for grant_ability)",
                        },
                        itemData: {
                          type: "object",
                          description: "Full item data (for grant_item)",
                        },
                      },
                      required: ["type", "target"],
                    },
                  },
                },
                required: [
                  "id",
                  "name",
                  "description",
                  "symbol",
                  "type",
                  "position",
                  "prerequisites",
                  "effects",
                ],
              },
            },
          },
          required: ["id", "name", "description", "symbol", "nodes"],
        },
      },
    },
    required: ["skill_trees"],
  },
};

export const modify_skill_trees: ToolDefinition = {
  name: "modify_skill_trees",
  description:
    "Modify existing skill trees by ID or name. Can update tree metadata or individual nodes.",
  parameters: {
    type: "object",
    properties: {
      skill_trees: {
        type: "array",
        description: "Array of skill tree modifications",
        items: {
          type: "object",
          properties: {
            id: { type: "string", description: "ID of tree to modify" },
            name: { type: "string", description: "Name of tree (if no ID)" },
            new_id: { type: "string" },
            new_name: { type: "string" },
            description: { type: "string" },
            symbol: { type: "string" },
            nodes: {
              type: "array",
              description: "Nodes to add/modify (matched by id)",
            },
            remove_nodes: {
              type: "array",
              description: "Node IDs to remove",
              items: { type: "string" },
            },
          },
          required: [],
        },
      },
    },
    required: ["skill_trees"],
  },
};

export const remove_skill_trees: ToolDefinition = {
  name: "remove_skill_trees",
  description: "Remove entire skill trees by ID or name.",
  parameters: {
    type: "object",
    properties: {
      ids: {
        type: "array",
        description: "IDs or names of skill trees to remove",
        items: { type: "string" },
      },
    },
    required: ["ids"],
  },
};

// ============================================
// CUSTOM TABLES TOOLS
// ============================================

export const add_custom_tables: ToolDefinition = {
  name: "add_custom_tables",
  description:
    "Add custom random tables for the AI to roll on. Each entry has text and a weight (higher = more likely).",
  parameters: {
    type: "object",
    properties: {
      tables: {
        type: "array",
        description: "Array of tables to add",
        items: {
          type: "object",
          properties: {
            id: { type: "string", description: "Unique table ID" },
            name: { type: "string", description: "Table name" },
            description: {
              type: "string",
              description: "What this table is for",
            },
            entries: {
              type: "array",
              description: "Table entries",
              items: {
                type: "object",
                properties: {
                  text: { type: "string", description: "Result text" },
                  weight: { type: "number", description: "Probability weight" },
                },
                required: ["text", "weight"],
              },
            },
          },
          required: ["id", "name", "description", "entries"],
        },
      },
    },
    required: ["tables"],
  },
};

export const modify_custom_tables: ToolDefinition = {
  name: "modify_custom_tables",
  description: "Modify existing custom tables by ID or name.",
  parameters: {
    type: "object",
    properties: {
      tables: {
        type: "array",
        description: "Array of table modifications",
        items: {
          type: "object",
          properties: {
            id: { type: "string", description: "ID of table to modify" },
            name: { type: "string", description: "Name of table (if no ID)" },
            new_id: { type: "string" },
            new_name: { type: "string" },
            description: { type: "string" },
            entries: { type: "array", description: "Replace all entries" },
            add_entries: { type: "array", description: "Add new entries" },
            remove_entries: {
              type: "array",
              description: "Entry texts to remove",
              items: { type: "string" },
            },
          },
          required: [],
        },
      },
    },
    required: ["tables"],
  },
};

export const remove_custom_tables: ToolDefinition = {
  name: "remove_custom_tables",
  description: "Remove custom tables by ID or name.",
  parameters: {
    type: "object",
    properties: {
      ids: {
        type: "array",
        description: "IDs or names of tables to remove",
        items: { type: "string" },
      },
    },
    required: ["ids"],
  },
};

// ============================================
// SETTINGS TOOLS
// ============================================

export const update_basic_info: ToolDefinition = {
  name: "update_basic_info",
  description:
    "Update basic adventure info: story name, premise, default player name/summary, intro text, author notes.",
  parameters: {
    type: "object",
    properties: {
      story_name: { type: "string", description: "Adventure/story name" },
      premise: {
        type: "string",
        description: "Story premise/setting description",
      },
      player_name: {
        type: "string",
        description: "Default player character name",
      },
      player_summary: {
        type: "string",
        description: "Default player background",
      },
      intro: { type: "string", description: "Opening narration text" },
      author_notes: {
        type: "string",
        description: "Instructions for the AI narrator",
      },
    },
    required: [],
  },
};

export const update_adventure_metadata: ToolDefinition = {
  name: "update_adventure_metadata",
  description:
    "Update adventure metadata shown in the library: title, short description, full description.",
  parameters: {
    type: "object",
    properties: {
      title: {
        type: "string",
        description: "Adventure title for library display",
      },
      shortDescription: {
        type: "string",
        description: "Brief tagline (1-2 sentences)",
      },
      description: {
        type: "string",
        description: "Full description for adventure page",
      },
    },
    required: [],
  },
};

export const update_upgrade_settings: ToolDefinition = {
  name: "update_upgrade_settings",
  description:
    "Configure the upgrade/shop system. Controls what players can purchase with upgrade points.",
  parameters: {
    type: "object",
    properties: {
      enabled: {
        type: "boolean",
        description: "Master toggle for upgrade system",
      },
      allowStatUpgrade: {
        type: "boolean",
        description: "Allow upgrading stats",
      },
      allowResourceUpgrade: {
        type: "boolean",
        description: "Allow upgrading resource max",
      },
      allowAddItem: { type: "boolean", description: "Allow purchasing items" },
      statUpgradeCost: { type: "number", description: "Cost per stat upgrade" },
      statUpgradeAmount: {
        type: "number",
        description: "Stat increase per upgrade",
      },
      resourceUpgradeCost: {
        type: "number",
        description: "Cost per resource upgrade",
      },
      resourceUpgradeAmount: {
        type: "number",
        description: "Resource max increase per upgrade",
      },
      addItemCost: { type: "number", description: "Cost to add an item" },
      statShopEnabled: { type: "boolean", description: "Enable stat shop" },
      resourceShopEnabled: {
        type: "boolean",
        description: "Enable resource shop",
      },
      itemShopEnabled: { type: "boolean", description: "Enable item shop" },
      abilityShopEnabled: {
        type: "boolean",
        description: "Enable ability shop",
      },
      statShop: { type: "array", description: "Stats available in shop" },
      resourceShop: {
        type: "array",
        description: "Resources available in shop",
      },
      itemShop: { type: "array", description: "Items available in shop" },
      abilityShop: {
        type: "array",
        description: "Abilities available in shop",
      },
    },
    required: [],
  },
};

export const set_progression: ToolDefinition = {
  name: "set_progression",
  description:
    "Set the player's current progression: level, XP (points), and upgrade points spent. Use this to level up a player, give them XP, or adjust their progression.",
  parameters: {
    type: "object",
    properties: {
      level: {
        type: "number",
        description:
          "Set player's level directly (1+). If not provided, level will be recalculated from XP.",
      },
      points: {
        type: "number",
        description:
          "Set player's XP/points directly. Use this to give or remove XP.",
      },
      add_points: {
        type: "number",
        description:
          "Add this amount of XP/points to current total (can be negative to remove).",
      },
      upgradesSpent: {
        type: "number",
        description:
          "Set how many upgrade points have been spent (affects available upgrades).",
      },
    },
    required: [],
  },
};

export const update_leveling_settings: ToolDefinition = {
  name: "update_leveling_settings",
  description:
    "Configure the leveling/XP system. Controls XP curve and upgrade points per level.",
  parameters: {
    type: "object",
    properties: {
      xpBase: {
        type: "number",
        description: "Base multiplier for XP curve (default 100)",
      },
      levelCap: { type: "number", description: "Maximum level (default 20)" },
      defaultUpgradesPerLevel: {
        type: "number",
        description:
          "Upgrade points per level up (1 point = 1 skill tree node)",
      },
      useCustomCurve: {
        type: "boolean",
        description: "Use custom XP thresholds instead of formula",
      },
      customCurve: {
        type: "array",
        description: "Custom XP requirements per level",
        items: {
          type: "object",
          properties: {
            level: { type: "number" },
            cumulativeXP: { type: "number" },
          },
        },
      },
      upgradeOverrides: {
        type: "array",
        description: "Per-level upgrade point overrides",
        items: {
          type: "object",
          properties: {
            level: { type: "number" },
            upgrades: { type: "number" },
          },
        },
      },
      startingUpgrades: {
        type: "object",
        description:
          "Starting upgrades by difficulty: { easy: 3, medium: 2, hard: 1, expert: 0 }",
      },
    },
    required: [],
  },
};

// ============================================
// STARTING CHOICES TOOLS
// ============================================

export const add_starting_choices: ToolDefinition = {
  name: "add_starting_choices",
  description:
    "Add custom starting choices. These replace the default 'Start Story' button with multiple options.",
  parameters: {
    type: "object",
    properties: {
      choices: {
        type: "array",
        description: "Array of starting choices to add",
        items: {
          type: "object",
          properties: {
            text: { type: "string", description: "Choice button text" },
            intro_override: {
              type: "string",
              description: "Custom intro for this path (optional)",
            },
            skill_used: {
              type: "string",
              description: "Skill check on selection (optional)",
            },
            skill_dc: { type: "number", description: "DC for skill check" },
            resource_used: {
              type: "string",
              description: "Resource cost (optional)",
            },
            item_used: {
              type: "string",
              description: "Required item (optional)",
            },
            item_loss: {
              type: "boolean",
              description: "Whether item is consumed",
            },
          },
          required: ["text"],
        },
      },
    },
    required: ["choices"],
  },
};

export const modify_starting_choices: ToolDefinition = {
  name: "modify_starting_choices",
  description: "Modify existing starting choices by text match.",
  parameters: {
    type: "object",
    properties: {
      choices: {
        type: "array",
        description: "Array of choice modifications",
        items: {
          type: "object",
          properties: {
            text: {
              type: "string",
              description: "Current choice text to find",
            },
            new_text: { type: "string", description: "New text" },
            intro_override: { type: "string" },
            skill_used: { type: "string" },
            skill_dc: { type: "number" },
            resource_used: { type: "string" },
            item_used: { type: "string" },
            item_loss: { type: "boolean" },
          },
          required: ["text"],
        },
      },
    },
    required: ["choices"],
  },
};

export const remove_starting_choices: ToolDefinition = {
  name: "remove_starting_choices",
  description: "Remove starting choices by text.",
  parameters: {
    type: "object",
    properties: {
      texts: {
        type: "array",
        description: "Choice texts to remove",
        items: { type: "string" },
      },
    },
    required: ["texts"],
  },
};

// ============================================
// CHARACTER SCHEMA TOOLS
// ============================================

export const set_character_schema: ToolDefinition = {
  name: "set_character_schema",
  description:
    "Create or replace the character schema. Defines the structure of the character sheet including all fields, categories, and optional custom template.",
  parameters: {
    type: "object",
    properties: {
      name: {
        type: "string",
        description: "Schema name (e.g., 'D&D 5e', 'Call of Cthulhu')",
      },
      description: {
        type: "string",
        description: "Description of the character system",
      },
      fields: {
        type: "array",
        description: "Field definitions for the character sheet",
        items: {
          type: "object",
          properties: {
            id: {
              type: "string",
              description: "Unique field ID (alphanumeric_underscore)",
            },
            name: { type: "string", description: "Display name" },
            type: {
              type: "string",
              enum: [
                "number",
                "derived",
                "resource",
                "text",
                "list",
                "boolean",
                "select",
              ],
              description: "Field type",
            },
            description: { type: "string", description: "Field description" },
            category: {
              type: "string",
              description: "Category ID for grouping",
            },
            order: { type: "number", description: "Display order" },
            hidden: { type: "boolean", description: "Hidden from player" },
            readonly: {
              type: "boolean",
              description: "Read-only (calculated)",
            },
            defaultValue: {
              type: "string",
              description: "Default value (parsed based on type)",
            },
            min: { type: "number", description: "For numbers: minimum" },
            max: { type: "number", description: "For numbers: maximum" },
            step: { type: "number", description: "For numbers: step" },
            formula: {
              type: "string",
              description:
                "For derived: formula using {{fieldId}} syntax (e.g., 'floor(({{Strength}} - 10) / 2)')",
            },
            defaultMax: {
              type: "number",
              description: "For resources: default max value",
            },
            regenerates: {
              type: "boolean",
              description: "For resources: regenerates on rest",
            },
            maxLength: { type: "number", description: "For text: max length" },
            multiline: {
              type: "boolean",
              description: "For text: use textarea",
            },
            placeholder: {
              type: "string",
              description: "For text: placeholder",
            },
            maxItems: { type: "number", description: "For lists: max items" },
            options: {
              type: "array",
              description: "For lists/selects: predefined options",
              items: { type: "string" },
            },
            selectOptions: {
              type: "array",
              description: "For select: options with values and labels",
              items: {
                type: "object",
                properties: {
                  value: { type: "string" },
                  label: { type: "string" },
                },
              },
            },
            trueLabel: {
              type: "string",
              description: "For boolean: true label",
            },
            falseLabel: {
              type: "string",
              description: "For boolean: false label",
            },
          },
          required: ["id", "name", "type"],
        },
      },
      categories: {
        type: "array",
        description: "Category definitions for organizing fields",
        items: {
          type: "object",
          properties: {
            id: { type: "string", description: "Unique category ID" },
            name: { type: "string", description: "Display name" },
            order: { type: "number", description: "Display order" },
            collapsed: {
              type: "boolean",
              description: "Start collapsed",
            },
          },
          required: ["id", "name"],
        },
      },
    },
    required: ["name", "fields"],
  },
};

export const add_schema_fields: ToolDefinition = {
  name: "add_schema_fields",
  description: "Add new fields to the character schema.",
  parameters: {
    type: "object",
    properties: {
      fields: {
        type: "array",
        description: "Fields to add (same structure as set_character_schema)",
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            name: { type: "string" },
            type: {
              type: "string",
              enum: [
                "number",
                "derived",
                "resource",
                "text",
                "list",
                "boolean",
                "select",
              ],
            },
            description: { type: "string" },
            category: { type: "string" },
            order: { type: "number" },
            hidden: { type: "boolean" },
            readonly: { type: "boolean" },
            defaultValue: { type: "string" },
            min: { type: "number" },
            max: { type: "number" },
            formula: { type: "string" },
            defaultMax: { type: "number" },
            options: { type: "array", items: { type: "string" } },
          },
          required: ["id", "name", "type"],
        },
      },
    },
    required: ["fields"],
  },
};

export const modify_schema_fields: ToolDefinition = {
  name: "modify_schema_fields",
  description: "Modify existing fields in the character schema by ID.",
  parameters: {
    type: "object",
    properties: {
      fields: {
        type: "array",
        description: "Field modifications",
        items: {
          type: "object",
          properties: {
            id: { type: "string", description: "Field ID to modify" },
            new_id: { type: "string", description: "New ID (if renaming)" },
            name: { type: "string" },
            type: { type: "string" },
            description: { type: "string" },
            category: { type: "string" },
            order: { type: "number" },
            hidden: { type: "boolean" },
            readonly: { type: "boolean" },
            defaultValue: { type: "string" },
            min: { type: "number" },
            max: { type: "number" },
            formula: { type: "string" },
            defaultMax: { type: "number" },
            options: { type: "array", items: { type: "string" } },
          },
          required: ["id"],
        },
      },
    },
    required: ["fields"],
  },
};

export const remove_schema_fields: ToolDefinition = {
  name: "remove_schema_fields",
  description: "Remove fields from the character schema by ID.",
  parameters: {
    type: "object",
    properties: {
      ids: {
        type: "array",
        description: "Field IDs to remove",
        items: { type: "string" },
      },
    },
    required: ["ids"],
  },
};

export const add_schema_categories: ToolDefinition = {
  name: "add_schema_categories",
  description: "Add categories to organize fields in the character sheet.",
  parameters: {
    type: "object",
    properties: {
      categories: {
        type: "array",
        description: "Categories to add",
        items: {
          type: "object",
          properties: {
            id: { type: "string", description: "Unique category ID" },
            name: { type: "string", description: "Display name" },
            order: { type: "number", description: "Display order" },
            collapsed: { type: "boolean", description: "Start collapsed" },
          },
          required: ["id", "name"],
        },
      },
    },
    required: ["categories"],
  },
};

export const modify_schema_categories: ToolDefinition = {
  name: "modify_schema_categories",
  description: "Modify existing categories by ID.",
  parameters: {
    type: "object",
    properties: {
      categories: {
        type: "array",
        description: "Category modifications",
        items: {
          type: "object",
          properties: {
            id: { type: "string", description: "Category ID to modify" },
            new_id: { type: "string" },
            name: { type: "string" },
            order: { type: "number" },
            collapsed: { type: "boolean" },
          },
          required: ["id"],
        },
      },
    },
    required: ["categories"],
  },
};

export const remove_schema_categories: ToolDefinition = {
  name: "remove_schema_categories",
  description: "Remove categories from the schema by ID.",
  parameters: {
    type: "object",
    properties: {
      ids: {
        type: "array",
        description: "Category IDs to remove",
        items: { type: "string" },
      },
    },
    required: ["ids"],
  },
};

export const set_schema_template: ToolDefinition = {
  name: "set_schema_template",
  description:
    'Set the custom HTML/CSS/JS template for the main character sheet. Template syntax: {{fieldId}} for values, {{fieldId.current}}/{{fieldId.max}} for resources, {{percent fieldId}} for percentage, {{modifier fieldId}} for D&D-style modifier, {{#if fieldId}}...{{/if}}, {{#each fieldId}}...{{/each}}, {{#compare fieldId "op" value}}...{{/compare}}, {{resource:id}} for uploaded resource URLs.',
  parameters: {
    type: "object",
    properties: {
      html: {
        type: "string",
        description:
          "HTML template with {{fieldId}} placeholders and conditionals",
      },
      css: {
        type: "string",
        description:
          "CSS styles for the template (can include @import for fonts)",
      },
      js: {
        type: "string",
        description:
          "Optional JavaScript for interactivity (runs in sandboxed iframe, has access to window.characterData and window.getField(id))",
      },
    },
    required: ["html", "css"],
  },
};

export const add_schema_pages: ToolDefinition = {
  name: "add_schema_pages",
  description:
    "Add custom pages to the character sheet. Each page gets its own tab in the Stats view with custom HTML/CSS/JS template.",
  parameters: {
    type: "object",
    properties: {
      pages: {
        type: "array",
        description: "Pages to add",
        items: {
          type: "object",
          properties: {
            id: { type: "string", description: "Unique page ID" },
            name: { type: "string", description: "Tab display name" },
            icon: {
              type: "string",
              description:
                "Icon name from lucide-react (e.g., 'Sword', 'Book')",
            },
            order: { type: "number", description: "Tab order" },
            html: { type: "string", description: "HTML template" },
            css: { type: "string", description: "CSS styles" },
            js: { type: "string", description: "Optional JavaScript" },
          },
          required: ["id", "name", "html", "css"],
        },
      },
    },
    required: ["pages"],
  },
};

export const modify_schema_pages: ToolDefinition = {
  name: "modify_schema_pages",
  description: "Modify existing schema pages by ID.",
  parameters: {
    type: "object",
    properties: {
      pages: {
        type: "array",
        description: "Page modifications",
        items: {
          type: "object",
          properties: {
            id: { type: "string", description: "Page ID to modify" },
            new_id: { type: "string" },
            name: { type: "string" },
            icon: { type: "string" },
            order: { type: "number" },
            html: { type: "string" },
            css: { type: "string" },
            js: { type: "string" },
          },
          required: ["id"],
        },
      },
    },
    required: ["pages"],
  },
};

export const remove_schema_pages: ToolDefinition = {
  name: "remove_schema_pages",
  description: "Remove custom pages from the schema by ID.",
  parameters: {
    type: "object",
    properties: {
      ids: {
        type: "array",
        description: "Page IDs to remove",
        items: { type: "string" },
      },
    },
    required: ["ids"],
  },
};

export const add_schema_resources: ToolDefinition = {
  name: "add_schema_resources",
  description:
    "Add uploaded resources (images, fonts) for use in schema templates. Resources can be referenced in templates using {{resource:id}}.",
  parameters: {
    type: "object",
    properties: {
      resources: {
        type: "array",
        description: "Resources to add",
        items: {
          type: "object",
          properties: {
            id: { type: "string", description: "Unique resource ID" },
            name: { type: "string", description: "Display name" },
            url: { type: "string", description: "URL to the resource" },
            type: {
              type: "string",
              enum: ["image", "font", "other"],
              description: "Resource type",
            },
          },
          required: ["id", "name", "url", "type"],
        },
      },
    },
    required: ["resources"],
  },
};

export const remove_schema_resources: ToolDefinition = {
  name: "remove_schema_resources",
  description: "Remove resources from the schema by ID.",
  parameters: {
    type: "object",
    properties: {
      ids: {
        type: "array",
        description: "Resource IDs to remove",
        items: { type: "string" },
      },
    },
    required: ["ids"],
  },
};

export const set_character_values: ToolDefinition = {
  name: "set_character_values",
  description:
    "Set or update character data values. Use this during gameplay to modify character sheet fields.",
  parameters: {
    type: "object",
    properties: {
      values: {
        type: "object",
        description:
          "Object mapping field IDs to values. For resources use {current: number, max: number}.",
      },
    },
    required: ["values"],
  },
};

export const modify_character_values: ToolDefinition = {
  name: "modify_character_values",
  description:
    "Modify specific character values by field ID. Can increment/decrement numbers or set values directly.",
  parameters: {
    type: "object",
    properties: {
      modifications: {
        type: "array",
        description: "Array of value modifications",
        items: {
          type: "object",
          properties: {
            field_id: { type: "string", description: "Field ID to modify" },
            value: {
              type: "string",
              description: "New value (parsed based on field type)",
            },
            add: {
              type: "number",
              description: "For numbers: add this amount (can be negative)",
            },
            set_current: {
              type: "number",
              description: "For resources: set current value",
            },
            set_max: {
              type: "number",
              description: "For resources: set max value",
            },
            add_current: {
              type: "number",
              description: "For resources: add to current",
            },
            add_max: {
              type: "number",
              description: "For resources: add to max",
            },
            append: {
              type: "string",
              description: "For lists: add this item",
            },
            remove_item: {
              type: "string",
              description: "For lists: remove this item",
            },
          },
          required: ["field_id"],
        },
      },
    },
    required: ["modifications"],
  },
};

// ============================================
// ALL TOOLS EXPORT
// ============================================

export const CREATOR_TOOLS: ToolDefinition[] = [
  // Character Schema (replaces deprecated stats/resources)
  set_character_schema,
  add_schema_fields,
  modify_schema_fields,
  remove_schema_fields,
  add_schema_categories,
  modify_schema_categories,
  remove_schema_categories,
  add_schema_pages,
  modify_schema_pages,
  remove_schema_pages,
  set_schema_template,
  // Items & Abilities
  add_items,
  modify_items,
  remove_items,
  add_abilities,
  modify_abilities,
  remove_abilities,
  // Passives
  add_passives,
  modify_passives,
  remove_passives,
  // Lore
  add_lore,
  modify_lore,
  remove_lore,
  // Achievements
  add_achievements,
  modify_achievements,
  remove_achievements,
  // Quests
  add_quests,
  modify_quests,
  remove_quests,
  // Relationships
  add_relationships,
  modify_relationships,
  remove_relationships,
  // Variables
  add_variables,
  modify_variables,
  remove_variables,
  // Presets
  add_presets,
  modify_presets,
  remove_presets,
  // Skill Trees
  add_skill_trees,
  modify_skill_trees,
  remove_skill_trees,
  // Custom Tables
  add_custom_tables,
  modify_custom_tables,
  remove_custom_tables,
  // Character Schema values
  set_character_values,
  modify_character_values,
  add_schema_resources,
  remove_schema_resources,
  // Settings
  update_basic_info,
  update_adventure_metadata,
  update_upgrade_settings,
  update_leveling_settings,
  // Progression
  set_progression,
  // Starting Choices
  add_starting_choices,
  modify_starting_choices,
  remove_starting_choices,
];

/**
 * Convert tool definitions to OpenAI/Anthropic function format
 */
export function getCreatorToolsForAPI(): {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: ToolDefinition["parameters"];
  };
}[] {
  return CREATOR_TOOLS.map((tool) => ({
    type: "function" as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }));
}
