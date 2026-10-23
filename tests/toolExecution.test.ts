/**
 * Tool Execution Tests
 *
 * Tests the tool calling system's ability to execute tools and convert them
 * to XML commands correctly.
 */

import { describe, test, expect } from "vitest";
import { executeTools, ToolCall } from "@/app/misc/toolExecutor";
import type { StoryData } from "@/app/misc/structs";

// Helper to create minimal story data
function createTestStory(): StoryData {
  return {
    story_name: "Test Story",
    premise: "Test premise",
    player_name: "Test Player",
    player_summary: "Test summary",
    intro: "Test intro",
    currentChapter: 0,
    max_chapters: 10,
    scene: {
      parts: [],
    },
    chapters: [],
    goals: [],
    stats: [],
    resources: [],
    inventory: [],
    lore: [],
    memory: [],
    relationships: [],
    rpgSystem: "3d6",
    abilities: [],
    npcs: [],
  } as StoryData;
}

describe("Tool Execution", () => {
  describe("create_note tool", () => {
    test("should create note entry (agentic notes are always visible)", () => {
      const storyData = createTestStory();
      const toolCalls: ToolCall[] = [
        {
          type: "function",
          function: {
            name: "create_note",
            arguments: {
              title: "The Ancient Temple",
              content: "A forgotten temple deep in the forest",
              type: "location",
            },
          },
        },
      ];

      const { responses } = executeTools(toolCalls, storyData);

      expect(responses).toHaveLength(1);
      expect(responses[0].success).toBe(true);
      expect(responses[0].message).toContain("Created note entry");
      expect(storyData.lore).toHaveLength(1);
      expect(storyData.lore[0].title).toBe("The Ancient Temple");
      expect(storyData.lore[0].content).toBe(
        "A forgotten temple deep in the forest"
      );
      // Agentic notes are always visible with no triggers
      expect(storyData.lore[0].on).toBe(true);
      expect(storyData.lore[0].alwaysOn).toBe(true);
      expect(storyData.lore[0].on_triggers).toEqual([]);
      expect(storyData.lore[0].off_triggers).toEqual([]);
    });

    test("should create note entry without triggers", () => {
      const storyData = createTestStory();
      const toolCalls: ToolCall[] = [
        {
          type: "function",
          function: {
            name: "create_note",
            arguments: {
              title: "Simple Note",
              content: "Basic note content",
            },
          },
        },
      ];

      const { responses } = executeTools(toolCalls, storyData);

      expect(responses).toHaveLength(1);
      expect(responses[0].success).toBe(true);
      expect(storyData.lore).toHaveLength(1);
      expect(storyData.lore[0].on_triggers).toEqual([]);
      expect(storyData.lore[0].off_triggers).toEqual([]);
      expect(storyData.lore[0].on).toBe(true); // Visible by default when no triggers
    });

    test("should reject duplicate note titles", () => {
      const storyData = createTestStory();
      storyData.lore.push({
        title: "Existing Note",
        content: "Already exists",
        relatedCharacters: [],
        relatedLocations: [],
        secrtet: false,
        keys: [],
        on_triggers: [],
        off_triggers: [],
        on: true,
      });

      const toolCalls: ToolCall[] = [
        {
          type: "function",
          function: {
            name: "create_note",
            arguments: {
              title: "Existing Note",
              content: "Trying to duplicate",
            },
          },
        },
      ];

      const { responses } = executeTools(toolCalls, storyData);

      expect(responses).toHaveLength(1);
      expect(responses[0].success).toBe(false);
      expect(responses[0].message).toContain("already exists");
      expect(storyData.lore).toHaveLength(1); // No duplicate added
    });
  });

  describe("Mixed tool execution", () => {
    test("should handle goal and note tools together", () => {
      const storyData = createTestStory();
      const toolCalls: ToolCall[] = [
        {
          type: "function",
          function: {
            name: "create_goal",
            arguments: {
              title: "Find the ruins",
              shortDescription: "Locate the ruins",
              description: "Discovered ancient ruins",
            },
          },
        },
        {
          type: "function",
          function: {
            name: "create_note",
            arguments: {
              title: "The Ruins",
              content: "Ancient civilization remains",
              onTriggers: ["ruins"],
            },
          },
        },
      ];

      const { responses } = executeTools(toolCalls, storyData);

      expect(responses).toHaveLength(2);
      expect(responses[0].success).toBe(true);
      expect(responses[1].success).toBe(true);
      expect(storyData.goals).toHaveLength(1);
      expect(storyData.lore).toHaveLength(1);
    });

    test("should continue execution after failures", () => {
      const storyData = createTestStory();
      const toolCalls: ToolCall[] = [
        {
          type: "function",
          function: {
            name: "create_goal",
            arguments: {
              title: "Valid goal",
              shortDescription: "Locate the ruins",
              description: "Discovered ancient ruins",
            },
          },
        },
        {
          type: "function",
          function: {
            name: "unknown_tool",
            arguments: {},
          },
        },
        {
          type: "function",
          function: {
            name: "create_note",
            arguments: {
              title: "Valid Note",
              content: "Valid content",
            },
          },
        },
      ];

      const { responses } = executeTools(toolCalls, storyData);

      expect(responses).toHaveLength(3);
      expect(responses[0].success).toBe(true);
      expect(responses[1].success).toBe(false);
      expect(responses[1].message).toContain("Unknown tool");
      expect(responses[2].success).toBe(true);
      expect(storyData.goals).toHaveLength(1);
      expect(storyData.lore).toHaveLength(1);
    });

    test("a removed tool name returns the unknown-tool error and changes nothing", () => {
      const storyData = createTestStory();
      const before = JSON.stringify(storyData);
      const removed = ["add_memory", "game_over", "take_rest", "add_ability"];
      const { responses, stateChanges } = executeTools(
        removed.map((name) => ({
          type: "function" as const,
          function: { name, arguments: {} },
        })),
        storyData
      );

      expect(responses).toHaveLength(removed.length);
      for (const response of responses) {
        expect(response.success).toBe(false);
        expect(response.message).toContain("Unknown tool");
      }
      expect(stateChanges).toHaveLength(0);
      expect(JSON.stringify(storyData)).toBe(before);
    });
  });

  describe("JSON string arguments", () => {
    test("should parse JSON string arguments for create_note", () => {
      const storyData = createTestStory();
      const toolCalls: ToolCall[] = [
        {
          type: "function",
          function: {
            name: "create_note",
            arguments: JSON.stringify({
              title: "Note Title",
              content: "Note content",
              type: "lore",
            }),
          },
        },
      ];

      const { responses } = executeTools(toolCalls, storyData);

      expect(responses).toHaveLength(1);
      expect(responses[0].success).toBe(true);
      expect(storyData.lore[0].title).toBe("Note Title");
      expect(storyData.lore[0].content).toBe("Note content");
      // Agentic notes are always visible (no triggers needed)
      expect(storyData.lore[0].on).toBe(true);
      expect(storyData.lore[0].alwaysOn).toBe(true);
    });

    test("should handle invalid JSON gracefully", () => {
      const storyData = createTestStory();
      const toolCalls: ToolCall[] = [
        {
          type: "function",
          function: {
            name: "create_note",
            arguments: "{invalid json",
          },
        },
      ];

      const { responses } = executeTools(toolCalls, storyData);

      expect(responses).toHaveLength(1);
      expect(responses[0].success).toBe(false);
      expect(responses[0].message).toContain("Invalid tool arguments");
    });
  });

  describe("stateChanges tracking", () => {
    test("should NOT generate stateChanges for a read-only tool", () => {
      const storyData = createTestStory();

      const toolCalls: ToolCall[] = [
        {
          type: "function",
          function: {
            name: "search_notes",
            arguments: { query: "blacksmith" },
          },
        },
      ];

      const { responses, stateChanges } = executeTools(toolCalls, storyData);

      expect(responses).toHaveLength(1);
      expect(responses[0].success).toBe(true);
      // search_notes is not in STATE_CHANGE_TOOLS, so no stateChange
      expect(stateChanges).toHaveLength(0);
    });
  });
});
