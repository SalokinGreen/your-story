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
        "Increment the scene counter and run a Mythic-style scene check. Use when a major scene transition occurs (new location, time skip, etc.). This automatically rolls to determine if the new scene proceeds normally, is altered with a twist, or is interrupted by a random event (in which case the event details are returned and MUST be incorporated into your next narration), and adjusts the chaos factor accordingly - you don't call a separate tool for any of that.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
] as const;
