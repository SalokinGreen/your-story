/**
 * Advanced RPG Tools Tool Definitions
 *
 * Tool schemas for AI-driven Mythic Game Master Emulator operations.
 * Enables AI to manage story threads, NPCs, chaos factor, and scene tracking.
 */

import { ToolSchema } from "./toolSchemas";

export const MYTHIC_TOOLS: ToolSchema[] = [
  {
    type: "function",
    function: {
      name: "add_thread",
      description:
        "Add a new story thread to track in the Advanced RPG Tools system. Use when a new plotline, mystery, or goal emerges.",
      parameters: {
        type: "object",
        properties: {
          description: {
            type: "string",
            description:
              "Clear description of the thread/plotline (e.g., 'Find the missing artifact', 'Investigate the haunted mansion')",
          },
        },
        required: ["description"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "close_thread",
      description:
        "Mark a story thread as resolved/closed. Use when a plotline concludes or becomes irrelevant.",
      parameters: {
        type: "object",
        properties: {
          threadId: {
            type: "string",
            description:
              "ID of the thread to close (from Advanced RPG Tools State)",
          },
        },
        required: ["threadId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "reopen_thread",
      description:
        "Reopen a closed thread. Use when a resolved plotline becomes relevant again.",
      parameters: {
        type: "object",
        properties: {
          threadId: {
            type: "string",
            description: "ID of the thread to reopen",
          },
        },
        required: ["threadId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_thread",
      description:
        "Update a thread's description to reflect story developments.",
      parameters: {
        type: "object",
        properties: {
          threadId: {
            type: "string",
            description: "ID of the thread to update",
          },
          description: {
            type: "string",
            description: "New description for the thread",
          },
        },
        required: ["threadId", "description"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_character",
      description:
        "Add a new NPC to track in the Advanced RPG Tools system. Use when an important character is introduced.",
      parameters: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "Character's name",
          },
          role: {
            type: "string",
            description:
              "Character's role/description (e.g., 'Village blacksmith', 'Mysterious stranger')",
          },
        },
        required: ["name", "role"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_character",
      description:
        "Update an NPC's role/description to reflect character development.",
      parameters: {
        type: "object",
        properties: {
          characterId: {
            type: "string",
            description: "ID of the character to update",
          },
          name: {
            type: "string",
            description: "Updated name (optional)",
          },
          role: {
            type: "string",
            description: "Updated role/description (optional)",
          },
        },
        required: ["characterId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_character_status",
      description:
        "Change an NPC's status. Use when characters die, leave, or return.",
      parameters: {
        type: "object",
        properties: {
          characterId: {
            type: "string",
            description: "ID of the character to update",
          },
          status: {
            type: "string",
            enum: ["active", "deceased", "departed"],
            description:
              "New status: 'active' (present), 'deceased' (dead), 'departed' (left the story)",
          },
        },
        required: ["characterId", "status"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "increment_scene",
      description:
        "Increment the scene counter. Use when a major scene transition occurs (new location, time skip, etc.).",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
] as const;
