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

// ============================================
// LORE TOOLS
// ============================================

export const add_lore: ToolDefinition = {
  name: "add_lore",
  description:
    "Add lore entries. Lore provides world-building context to the AI. Can be triggered on/off by keywords or variables. Use type='character_sheet' for character sheets (highest AI priority).",
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
            type: {
              type: "string",
              enum: ["lore", "character_sheet", "mechanics"],
              description:
                "Note type. 'character_sheet' = highest priority (stats, HP, abilities, equipment), 'mechanics' = game rules, 'lore' = world-building (default)",
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
            type: {
              type: "string",
              enum: ["lore", "character_sheet", "mechanics"],
              description: "Note type priority",
            },
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
            characterSheet: {
              type: "string",
              description:
                "Pre-filled character sheet in markdown format. This is added to the player's Notes when they select this preset.",
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
          required: ["id", "name", "description", "icon", "characterSheet"],
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
            characterSheet: {
              type: "string",
              description: "Pre-filled character sheet in markdown format",
            },
            intro: { type: "string" },
            authorNotes: { type: "string" },
            stats: { type: "array" },
            resources: { type: "array" },
            inventory: { type: "array" },
            abilities: { type: "array" },
            relationships: { type: "array" },
            characterData: {
              type: "object",
              description:
                "Character schema data including values. Use to modify list fields like inventory, equipment, etc.",
              properties: {
                values: {
                  type: "object",
                  description:
                    "Field values - keys are field IDs, values can be numbers, strings, arrays (for list fields), or {current, max} objects for resources",
                },
              },
            },
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
// CHARACTER SHEET TOOLS
// ============================================

export const update_character_sheet: ToolDefinition = {
  name: "update_character_sheet",
  description:
    "Update the player's filled character sheet markdown. Use this to modify the player's current character information, stats displayed on the sheet, backstory, etc. The character sheet is a markdown document that gets added to AI context as the player's primary character information.",
  parameters: {
    type: "object",
    properties: {
      character_sheet: {
        type: "string",
        description:
          "The complete character sheet in markdown format. Use headers (##, ###) to organize sections. Include key character info like name, class, race, stats, abilities, equipment, backstory, etc.",
      },
      mode: {
        type: "string",
        enum: ["replace", "append", "prepend"],
        description:
          "How to update the sheet. 'replace' (default) replaces the entire sheet, 'append' adds to the end, 'prepend' adds to the beginning.",
      },
    },
    required: ["character_sheet"],
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
    "Update basic adventure info: story name, premise, character sheet, intro text, author notes.",
  parameters: {
    type: "object",
    properties: {
      story_name: { type: "string", description: "Adventure/story name" },
      premise: {
        type: "string",
        description: "Story premise/setting description",
      },
      character_sheet: {
        type: "string",
        description: "Player's character sheet in markdown format",
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
// CHARACTER SHEET TOOLS
// ============================================

export const update_character_sheet_template: ToolDefinition = {
  name: "update_character_sheet_template",
  description:
    "Update the adventure's character sheet template. Templates use {{FieldName | Description | DefaultValue}} syntax for fillable fields. Use {{FieldName (Category) | Description | DefaultValue}} to group fields into pages (e.g., 'Stats', 'Story', 'Equipment'). IMPORTANT: The FieldName and Description are NOT displayed - they are metadata only! You MUST include visible labels in the markdown. Example: '- **Strength**: {{Strength (Stats) | Physical power | 10}}' NOT just '- {{Strength (Stats) | Physical power | 10}}'",
  parameters: {
    type: "object",
    properties: {
      template: {
        type: "string",
        description:
          "The new template content using {{FieldName | Description | DefaultValue}} or {{FieldName (Category) | Description | DefaultValue}} syntax. Fields with the same category appear on the same page. Use markdown formatting. ALWAYS include visible labels before fields (e.g., '**Strength**: {{Strength...').",
      },
      preset_id: {
        type: "string",
        description:
          "Optional: Use a preset template. Options: 'generic', 'dnd5e', 'coc' (Call of Cthulhu), 'traveller', 'monsterhearts', 'fate', 'pbta', 'bitd' (Blades in the Dark), 'wod' (World of Darkness)",
      },
    },
    required: [],
  },
};

export const update_preset_character_sheet: ToolDefinition = {
  name: "update_preset_character_sheet",
  description:
    "Update a preset's pre-filled character sheet. This is the completed character sheet shown in the player's Notes when they select a preset. Use markdown formatting with the filled-in values (not template syntax).",
  parameters: {
    type: "object",
    properties: {
      preset_id: {
        type: "string",
        description: "ID of the preset to update",
      },
      preset_name: {
        type: "string",
        description: "Name of the preset (if ID not known)",
      },
      character_sheet: {
        type: "string",
        description:
          "The completed character sheet in markdown format. This should be a filled-in version of the template with actual values for this preset.",
      },
    },
    required: ["character_sheet"],
  },
};

// ============================================
// ALL TOOLS EXPORT
// ============================================

export const CREATOR_TOOLS: ToolDefinition[] = [
  // Abilities
  add_abilities,
  modify_abilities,
  remove_abilities,
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
  // Character Sheet
  update_character_sheet,
  update_character_sheet_template,
  update_preset_character_sheet,
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
