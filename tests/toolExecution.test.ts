/**
 * Tool Execution Tests
 *
 * Tests the tool calling system's ability to execute tools and convert them
 * to XML commands correctly.
 */

import { describe, test, expect } from "vitest";
import { executeTools, ToolCall } from "@/app/misc/toolExecutor";
import type { StoryData } from "@/app/misc/structs";
import { getMemoryContent } from "@/app/misc/structs";

// Helper to create minimal story data
function createTestStory(): StoryData {
  return {
    story_name: "Test Story",
    premise: "Test premise",
    player_name: "Test Player",
    player_summary: "Test summary",
    intro: "Test intro",
    points: 0,
    earnedPointsFromQuests: [],
    earnedPointsFromChapters: [],
    currentChapter: 0,
    max_chapters: 10,
    scene: {
      parts: [],
    },
    chapters: [],
    quests: [],
    stats: [],
    resources: [],
    inventory: [],
    achievements: [],
    lore: [],
    memory: [],
    momentum: 0,
    maxMomentum: 10,
    relationships: [],
    rpgSystem: "3d6",
    abilities: [],
    level: 1,
    upgradesSpent: 0,
    conditions: [],
  } as StoryData;
}

describe("Tool Execution", () => {
  describe("add_memory tool", () => {
    test("should add memory directly to array", () => {
      const storyData = createTestStory();
      const toolCalls: ToolCall[] = [
        {
          type: "function",
          function: {
            name: "add_memory",
            arguments: {
              entry: "Met the mysterious merchant Aldric in the tavern",
            },
          },
        },
      ];

      const { responses } = executeTools(toolCalls, storyData);

      expect(responses).toHaveLength(1);
      expect(responses[0].success).toBe(true);
      expect(responses[0].message).toContain("Added memory");
      expect(storyData.memory).toHaveLength(1);
      expect(getMemoryContent(storyData.memory[0])).toBe(
        "Met the mysterious merchant Aldric in the tavern"
      );
    });

    test("should handle multiple memory additions", () => {
      const storyData = createTestStory();
      const toolCalls: ToolCall[] = [
        {
          type: "function",
          function: {
            name: "add_memory",
            arguments: {
              entry: "First memory",
            },
          },
        },
        {
          type: "function",
          function: {
            name: "add_memory",
            arguments: {
              entry: "Second memory",
            },
          },
        },
      ];

      const { responses } = executeTools(toolCalls, storyData);

      expect(responses).toHaveLength(2);
      expect(responses[0].success).toBe(true);
      expect(responses[1].success).toBe(true);
      expect(storyData.memory).toHaveLength(2);
      expect(getMemoryContent(storyData.memory[0])).toBe("First memory");
      expect(getMemoryContent(storyData.memory[1])).toBe("Second memory");
    });

    test("should truncate long memory entries in message", () => {
      const storyData = createTestStory();
      const longEntry = "A".repeat(100);
      const toolCalls: ToolCall[] = [
        {
          type: "function",
          function: {
            name: "add_memory",
            arguments: { entry: longEntry },
          },
        },
      ];

      const { responses } = executeTools(toolCalls, storyData);

      expect(responses[0].success).toBe(true);
      expect(responses[0].message).toContain("...");
      expect(responses[0].message.length).toBeLessThan(100);
      expect(getMemoryContent(storyData.memory[0])).toBe(longEntry); // Full entry stored
    });
  });

  describe("create_note tool", () => {
    test("should create note entry with triggers", () => {
      const storyData = createTestStory();
      const toolCalls: ToolCall[] = [
        {
          type: "function",
          function: {
            name: "create_note",
            arguments: {
              title: "The Ancient Temple",
              content: "A forgotten temple deep in the forest",
              onTriggers: ["temple", "ruins"],
              offTriggers: ["forget"],
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
      expect(storyData.lore[0].on_triggers).toEqual(["temple", "ruins"]);
      expect(storyData.lore[0].off_triggers).toEqual(["forget"]);
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
    test("should handle memory and note tools together", () => {
      const storyData = createTestStory();
      const toolCalls: ToolCall[] = [
        {
          type: "function",
          function: {
            name: "add_memory",
            arguments: {
              entry: "Discovered ancient ruins",
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
      expect(storyData.memory).toHaveLength(1);
      expect(storyData.lore).toHaveLength(1);
    });

    test("should continue execution after failures", () => {
      const storyData = createTestStory();
      const toolCalls: ToolCall[] = [
        {
          type: "function",
          function: {
            name: "add_memory",
            arguments: {
              entry: "Valid memory",
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
      expect(storyData.memory).toHaveLength(1);
      expect(storyData.lore).toHaveLength(1);
    });
  });

  describe("JSON string arguments", () => {
    test("should parse JSON string arguments for add_memory", () => {
      const storyData = createTestStory();
      const toolCalls: ToolCall[] = [
        {
          type: "function",
          function: {
            name: "add_memory",
            arguments: JSON.stringify({
              entry: "Memory from JSON string",
            }),
          },
        },
      ];

      const { responses } = executeTools(toolCalls, storyData);

      expect(responses).toHaveLength(1);
      expect(responses[0].success).toBe(true);
      expect(getMemoryContent(storyData.memory[0])).toBe(
        "Memory from JSON string"
      );
    });

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
              onTriggers: ["trigger1", "trigger2"],
            }),
          },
        },
      ];

      const { responses } = executeTools(toolCalls, storyData);

      expect(responses).toHaveLength(1);
      expect(responses[0].success).toBe(true);
      expect(storyData.lore[0].title).toBe("Note Title");
      expect(storyData.lore[0].on_triggers).toEqual(["trigger1", "trigger2"]);
    });

    test("should handle invalid JSON gracefully", () => {
      const storyData = createTestStory();
      const toolCalls: ToolCall[] = [
        {
          type: "function",
          function: {
            name: "add_memory",
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
    test("should NOT generate stateChanges for memory additions", () => {
      const storyData = createTestStory();

      const toolCalls: ToolCall[] = [
        {
          type: "function",
          function: {
            name: "add_memory",
            arguments: {
              entry: "Met the blacksmith",
            },
          },
        },
      ];

      const { responses, stateChanges } = executeTools(toolCalls, storyData);

      expect(responses).toHaveLength(1);
      expect(responses[0].success).toBe(true);
      // Memory is not in STATE_CHANGE_TOOLS, so no stateChange
      expect(stateChanges).toHaveLength(0);
    });
  });

  describe("Note Visibility Tools", () => {
    test("should show note entry that exists", () => {
      const storyData = createTestStory();
      storyData.lore = [
        {
          title: "Containment Wards",
          content: "Ancient magical barriers that keep evil at bay",
          on: false,
          relatedCharacters: [],
          relatedLocations: [],
          secrtet: false,
          keys: [],
          on_triggers: [],
          off_triggers: [],
        },
      ];
      storyData.scene.parts.push({
        content: "You discover ancient writing on the wall.",
        imageUrl: "",
        user: false,
        role: "assistant",
      });

      const toolCalls: ToolCall[] = [
        {
          type: "function",
          function: {
            name: "show_note",
            arguments: {
              title: "Containment Wards",
            },
          },
        },
      ];

      const { responses, stateChanges } = executeTools(toolCalls, storyData);

      expect(responses).toHaveLength(1);
      expect(responses[0].success).toBe(true);
      expect(responses[0].message).toContain("Revealed note");
      expect(storyData.lore[0].on).toBe(true);
      expect(storyData.scene.parts[0].revealedLore).toContain(
        "Containment Wards"
      );
      // Note: Lore tools don't generate stateChanges (removed to reduce AI context noise)
      expect(stateChanges.length).toBe(0);
    });

    test("should handle show_note with fuzzy matching", () => {
      const storyData = createTestStory();
      storyData.lore = [
        {
          title: "The Ancient Prophecy",
          content: "A prophecy about the chosen one",
          on: false,
          relatedCharacters: [],
          relatedLocations: [],
          secrtet: false,
          keys: [],
          on_triggers: [],
          off_triggers: [],
        },
      ];
      storyData.scene.parts.push({
        content: "You find an old scroll.",
        imageUrl: "",
        user: false,
        role: "assistant",
      });

      const toolCalls: ToolCall[] = [
        {
          type: "function",
          function: {
            name: "show_note",
            arguments: {
              title: "Ancient Prophecy", // Missing "The" - should still match
            },
          },
        },
      ];

      const { responses } = executeTools(toolCalls, storyData);

      expect(responses).toHaveLength(1);
      expect(responses[0].success).toBe(true);
      expect(storyData.lore[0].on).toBe(true);
    });

    test("should fail show_note when note not found", () => {
      const storyData = createTestStory();
      storyData.lore = [];

      const toolCalls: ToolCall[] = [
        {
          type: "function",
          function: {
            name: "show_note",
            arguments: {
              title: "Nonexistent Note",
            },
          },
        },
      ];

      const { responses } = executeTools(toolCalls, storyData);

      expect(responses).toHaveLength(1);
      expect(responses[0].success).toBe(false);
      expect(responses[0].message).toContain("not found");
    });

    test("should return partial success if note already visible", () => {
      const storyData = createTestStory();
      storyData.lore = [
        {
          title: "Known Secret",
          content: "Something everyone knows",
          on: true,
          relatedCharacters: [],
          relatedLocations: [],
          secrtet: false,
          keys: [],
          on_triggers: [],
          off_triggers: [],
        },
      ];

      const toolCalls: ToolCall[] = [
        {
          type: "function",
          function: {
            name: "show_note",
            arguments: {
              title: "Known Secret",
            },
          },
        },
      ];

      const { responses } = executeTools(toolCalls, storyData);

      expect(responses).toHaveLength(1);
      expect(responses[0].success).toBe("partial");
      expect(responses[0].message).toContain("already visible");
    });

    test("should hide note entry that exists", () => {
      const storyData = createTestStory();
      storyData.lore = [
        {
          title: "Temporary Knowledge",
          content: "Information that fades from memory",
          on: true,
          relatedCharacters: [],
          relatedLocations: [],
          secrtet: false,
          keys: [],
          on_triggers: [],
          off_triggers: [],
        },
      ];

      const toolCalls: ToolCall[] = [
        {
          type: "function",
          function: {
            name: "hide_note",
            arguments: {
              title: "Temporary Knowledge",
            },
          },
        },
      ];

      const { responses, stateChanges } = executeTools(toolCalls, storyData);

      expect(responses).toHaveLength(1);
      expect(responses[0].success).toBe(true);
      expect(responses[0].message).toContain("Hidden note");
      expect(storyData.lore[0].on).toBe(false);
      // Note: Lore tools don't generate stateChanges (removed to reduce AI context noise)
      expect(stateChanges.length).toBe(0);
    });

    test("should return partial success if note already hidden", () => {
      const storyData = createTestStory();
      storyData.lore = [
        {
          title: "Hidden Note",
          content: "Already hidden",
          on: false,
          relatedCharacters: [],
          relatedLocations: [],
          secrtet: false,
          keys: [],
          on_triggers: [],
          off_triggers: [],
        },
      ];

      const toolCalls: ToolCall[] = [
        {
          type: "function",
          function: {
            name: "hide_note",
            arguments: {
              title: "Hidden Note",
            },
          },
        },
      ];

      const { responses } = executeTools(toolCalls, storyData);

      expect(responses).toHaveLength(1);
      expect(responses[0].success).toBe("partial");
      expect(responses[0].message).toContain("already hidden");
    });
  });
});
