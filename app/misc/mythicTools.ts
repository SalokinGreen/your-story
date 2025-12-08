/**
 * Advanced RPG Tools Tool Definitions
 *
 * Tool schemas for AI-driven AGMT Game Master Emulator operations.
 * Enables AI to manage chaos factor and scene tracking.
 * NOTE: Thread management has been deprecated - use StoryThread tools instead.
 */

import { ToolSchema } from "./toolSchemas";

export const MYTHIC_TOOLS: ToolSchema[] = [
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
