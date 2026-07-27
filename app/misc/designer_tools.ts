/**
 * Tool surface for the Game Designer AI.
 *
 * This replaces the old creator_tools.ts, which authored the removed
 * "video-game stat block" model (abilities, skill trees, variables,
 * relationships, upgrade/XP settings). Those fields are still present on old
 * saves for backward compatibility, but the GM never reads them, so the
 * Designer never writes them.
 *
 * Every tool here maps onto something buildGMStagePrompt/buildInfoMessage
 * actually consumes at play time: lore notes (including the mechanics note and
 * the character sheet), NPCs, goals, the premise, starting choices, presets,
 * the character sheet template, and random tables.
 */

export interface JSONSchemaProperty {
  type: string;
  description?: string;
  items?: JSONSchemaProperty;
  properties?: Record<string, JSONSchemaProperty>;
  required?: string[];
  enum?: string[];
  default?: unknown;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, JSONSchemaProperty>;
    required: string[];
  };
}

// ============================================
// ADVENTURE IDENTITY
// ============================================

export const set_adventure_info: ToolDefinition = {
  name: "set_adventure_info",
  description:
    "Set the adventure's outward-facing identity: the title and the blurbs a player reads in the library before starting. Call this once you and the user have settled on a concept, and again whenever the concept shifts. Only include the fields you want to change.",
  parameters: {
    type: "object",
    properties: {
      title: { type: "string", description: "The adventure's title." },
      shortDescription: {
        type: "string",
        description:
          "One-line hook shown on the library card. Under ~120 characters.",
      },
      description: {
        type: "string",
        description:
          "Full description shown on the adventure page. A paragraph or two that sells the premise without spoiling secrets.",
      },
      tags: {
        type: "array",
        items: { type: "string" },
        description:
          "Genre/theme tags for search and filtering, e.g. ['noir', 'mystery', 'urban fantasy'].",
      },
      difficulty: {
        type: "string",
        enum: ["easy", "medium", "hard", "expert"],
        description: "How punishing the adventure is intended to be.",
      },
      estimatedDuration: {
        type: "string",
        description: "Rough play time, e.g. '2-3 hours'.",
      },
      nsfw: {
        type: "boolean",
        description: "Whether the adventure contains adult content.",
      },
    },
    required: [],
  },
};

export const set_premise: ToolDefinition = {
  name: "set_premise",
  description:
    "Set the story's starting conditions. The premise is the GM-facing situation the adventure opens on; the intro is the literal prose the player reads first. Author notes are private guidance for the GM that the player never sees.",
  parameters: {
    type: "object",
    properties: {
      premise: {
        type: "string",
        description:
          "GM-facing setup: where the story starts, what's already in motion, what pressure the player is under.",
      },
      intro: {
        type: "string",
        description:
          "The opening prose shown to the player before their first choice. Write it as finished narration, in second person present tense unless the adventure calls for otherwise.",
      },
      authorNotes: {
        type: "string",
        description:
          "Private notes for the GM about tone, pacing, themes, and things to avoid. Never shown to the player.",
      },
    },
    required: [],
  },
};

// ============================================
// NOTES (lore, secrets, mechanics, character sheet, GM guidance)
// ============================================

const LORE_TYPES = [
  "lore",
  "secret",
  "mechanics",
  "character_sheet",
  "dm_instructions",
  "story_instructions",
  "gm_plan",
];

export const write_note: ToolDefinition = {
  name: "write_note",
  description:
    "Create a new note or overwrite an existing one (matched by title). Notes are the adventure's real content — this one tool covers world lore, secrets, the rules of the game, the player's character sheet, and private GM/narrator guidance. Choose the right `type`:\n" +
    "- 'lore': world, factions, locations, history. The bulk of most adventures.\n" +
    "- 'secret': twists and hidden truths. Same as lore but flagged so it isn't leaked to the player.\n" +
    "- 'mechanics': THE rules note. How dice work in this adventure — what to roll, how to read results, what counts as success. The GM reads this to improvise checks, so write it as instructions to a human GM, not as a rulebook. Every adventure should have exactly one.\n" +
    "- 'character_sheet': who the player is — freeform notes, not a stat block. Skills, gear, ties, and whatever numbers the mechanics note references.\n" +
    "- 'dm_instructions': private pacing/tone guidance for the GM stage.\n" +
    "- 'story_instructions': prose-style guidance for the narrator stage.\n" +
    "- 'gm_plan': the campaign spine and where things are heading.",
  parameters: {
    type: "object",
    properties: {
      title: {
        type: "string",
        description:
          "Unique title. Writing to an existing title replaces that note's content.",
      },
      content: {
        type: "string",
        description:
          "The note body, in markdown. Be concrete and specific — this is the material the GM improvises from at play time.",
      },
      type: {
        type: "string",
        enum: LORE_TYPES,
        description: "Note category. Defaults to 'lore'.",
      },
      keys: {
        type: "array",
        items: { type: "string" },
        description:
          "Keywords that pull this note into context when they appear in play. Omit for notes that should always be loaded.",
      },
      alwaysOn: {
        type: "boolean",
        description:
          "If true, the note is always in the GM's context regardless of keywords. Use for the mechanics note, the character sheet, and core setting facts.",
      },
      secret: {
        type: "boolean",
        description:
          "If true, hide this note from the player's lore browser during play.",
      },
    },
    required: ["title", "content"],
  },
};

export const delete_note: ToolDefinition = {
  name: "delete_note",
  description: "Delete notes by title.",
  parameters: {
    type: "object",
    properties: {
      titles: {
        type: "array",
        items: { type: "string" },
        description: "Titles of the notes to delete.",
      },
    },
    required: ["titles"],
  },
};

// ============================================
// NPCS
// ============================================

export const write_npcs: ToolDefinition = {
  name: "write_npcs",
  description:
    "Create or update NPCs (matched by name). NPCs are tracked characters the GM keeps continuity on — their status and attitude change during play, so set the starting state here.",
  parameters: {
    type: "object",
    properties: {
      npcs: {
        type: "array",
        description: "The NPCs to create or update.",
        items: {
          type: "object",
          properties: {
            name: { type: "string", description: "The NPC's name." },
            description: {
              type: "string",
              description: "Who they are — appearance, personality, motives.",
            },
            role: {
              type: "string",
              description:
                "Their function in the story, e.g. 'Antagonist', 'Village Elder', 'Rival'.",
            },
            relationship: {
              type: "string",
              description:
                "Their tie to the player in plain words, e.g. 'Estranged mentor'.",
            },
            attitude: {
              type: "string",
              enum: ["hostile", "unfriendly", "neutral", "friendly", "allied"],
              description: "How they treat the player at the start.",
            },
            status: {
              type: "string",
              enum: ["alive", "dead", "missing", "unknown", "departed"],
              description: "Their state at the start. Usually 'alive'.",
            },
            faction: {
              type: "string",
              description: "Group or organisation they belong to.",
            },
            symbol: { type: "string", description: "An emoji for the UI." },
            notes: {
              type: "string",
              description: "Private GM notes — secrets, agenda, betrayals.",
            },
          },
          required: ["name", "description", "role"],
        },
      },
    },
    required: ["npcs"],
  },
};

export const delete_npcs: ToolDefinition = {
  name: "delete_npcs",
  description: "Delete NPCs by name.",
  parameters: {
    type: "object",
    properties: {
      names: {
        type: "array",
        items: { type: "string" },
        description: "Names of the NPCs to delete.",
      },
    },
    required: ["names"],
  },
};

// ============================================
// GOALS
// ============================================

export const write_goals: ToolDefinition = {
  name: "write_goals",
  description:
    "Create or update player-facing objectives (matched by title). Goals are what the player is trying to achieve — no points or XP are attached to them.",
  parameters: {
    type: "object",
    properties: {
      goals: {
        type: "array",
        description: "The goals to create or update.",
        items: {
          type: "object",
          properties: {
            title: { type: "string", description: "Short goal name." },
            shortDescription: {
              type: "string",
              description: "One-line summary shown in the goal list.",
            },
            description: {
              type: "string",
              description: "Full description of what achieving this involves.",
            },
            active: {
              type: "boolean",
              description:
                "Whether the goal is visible from the start. Set false for goals unlocked later.",
            },
          },
          required: ["title", "shortDescription"],
        },
      },
    },
    required: ["goals"],
  },
};

export const delete_goals: ToolDefinition = {
  name: "delete_goals",
  description: "Delete goals by title.",
  parameters: {
    type: "object",
    properties: {
      titles: {
        type: "array",
        items: { type: "string" },
        description: "Titles of the goals to delete.",
      },
    },
    required: ["titles"],
  },
};

// ============================================
// OPENING CHOICES
// ============================================

export const set_starting_choices: ToolDefinition = {
  name: "set_starting_choices",
  description:
    "Set the choices offered at the very start, which let the player pick how they enter the story. Replaces the existing list. Pass an empty array to drop them entirely, in which case the player just sees a 'Start Story' button.",
  parameters: {
    type: "object",
    properties: {
      choices: {
        type: "array",
        description: "The opening choices, in display order.",
        items: {
          type: "object",
          properties: {
            text: {
              type: "string",
              description: "The choice text the player reads.",
            },
            introOverride: {
              type: "string",
              description:
                "Alternate opening prose for this path. Leave empty to use the main intro.",
            },
          },
          required: ["text"],
        },
      },
    },
    required: ["choices"],
  },
};

// ============================================
// CHARACTER OPTIONS
// ============================================

export const write_presets: ToolDefinition = {
  name: "write_presets",
  description:
    "Create or update pre-made characters the player can pick at the start (matched by name). Each preset carries its own character sheet, so the player can start as a ready-made protagonist instead of filling in a blank sheet.",
  parameters: {
    type: "object",
    properties: {
      presets: {
        type: "array",
        description: "The presets to create or update.",
        items: {
          type: "object",
          properties: {
            name: {
              type: "string",
              description: "Character name or archetype, e.g. 'The Burned Spy'.",
            },
            description: {
              type: "string",
              description: "Who they are and how they play differently.",
            },
            icon: { type: "string", description: "An emoji for the UI." },
            characterSheet: {
              type: "string",
              description:
                "This character's full sheet in markdown — freeform notes covering skills, gear and ties, consistent with the mechanics note.",
            },
            intro: {
              type: "string",
              description:
                "Opening prose specific to this character. Leave empty to use the main intro.",
            },
          },
          required: ["name", "description"],
        },
      },
    },
    required: ["presets"],
  },
};

export const delete_presets: ToolDefinition = {
  name: "delete_presets",
  description: "Delete presets by name.",
  parameters: {
    type: "object",
    properties: {
      names: {
        type: "array",
        items: { type: "string" },
        description: "Names of the presets to delete.",
      },
    },
    required: ["names"],
  },
};

export const set_character_sheet_template: ToolDefinition = {
  name: "set_character_sheet_template",
  description:
    "Set the fill-in-the-blanks template used when a player makes their own character instead of picking a preset. Use {{Field Name | what it's for | default value}} placeholders; the app turns each into a form field.",
  parameters: {
    type: "object",
    properties: {
      template: {
        type: "string",
        description:
          "Markdown sheet with {{...}} placeholders, e.g. '# {{Name | Your character's name | Alex}}\\n\\n**Background:** {{Background | Where you came from | Drifter}}'. Should match what the mechanics note expects.",
      },
    },
    required: ["template"],
  },
};

// ============================================
// RANDOM TABLES
// ============================================

export const write_tables: ToolDefinition = {
  name: "write_tables",
  description:
    "Create or update random tables the GM can roll on during play (matched by name), e.g. encounters, complications, rumours, weather.",
  parameters: {
    type: "object",
    properties: {
      tables: {
        type: "array",
        description: "The tables to create or update.",
        items: {
          type: "object",
          properties: {
            name: { type: "string", description: "Table name." },
            description: {
              type: "string",
              description: "What the table is for and when to roll on it.",
            },
            entries: {
              type: "array",
              description: "The possible results.",
              items: {
                type: "object",
                properties: {
                  text: { type: "string", description: "The result text." },
                  weight: {
                    type: "number",
                    description:
                      "Relative likelihood. Use 1 for an even table; raise it to make a result more common.",
                  },
                },
                required: ["text"],
              },
            },
          },
          required: ["name", "entries"],
        },
      },
    },
    required: ["tables"],
  },
};

export const delete_tables: ToolDefinition = {
  name: "delete_tables",
  description: "Delete random tables by name.",
  parameters: {
    type: "object",
    properties: {
      names: {
        type: "array",
        items: { type: "string" },
        description: "Names of the tables to delete.",
      },
    },
    required: ["names"],
  },
};

// ============================================
// REGISTRY
// ============================================

export const DESIGNER_TOOLS: ToolDefinition[] = [
  set_adventure_info,
  set_premise,
  write_note,
  delete_note,
  write_npcs,
  delete_npcs,
  write_goals,
  delete_goals,
  set_starting_choices,
  write_presets,
  delete_presets,
  set_character_sheet_template,
  write_tables,
  delete_tables,
];

export function getDesignerToolsForAPI(): {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: ToolDefinition["parameters"];
  };
}[] {
  return DESIGNER_TOOLS.map((tool) => ({
    type: "function" as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }));
}
