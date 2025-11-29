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
    id: "test-story",
    name: "Test Story",
    userId: "test-user",
    adventureId: "test-adventure",
    state: "playing",
    points: 0,
    earnedPointsFromQuests: [],
    earnedPointsFromBeats: [],
    lastPlayedAt: new Date(),
    createdAt: new Date(),
    currentChapter: 0,
    scene: {
      title: "Test Scene",
      parts: [],
    },
    chapters: [],
    quests: [],
    stats: [],
    resources: [],
    inventory: [],
    achievements: [],
    lore: [],
    plot_beats: [],
    memory: [],
    momentum: 0,
    maxMomentum: 10,
    relationships: [],
    rpgSystem: "3d6",
  };
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
      expect(storyData.memory[0]).toBe(
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
      expect(storyData.memory[0]).toBe("First memory");
      expect(storyData.memory[1]).toBe("Second memory");
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
      expect(storyData.memory[0]).toBe(longEntry); // Full entry stored
    });
  });

  describe("create_lore tool", () => {
    test("should create lore entry with triggers", () => {
      const storyData = createTestStory();
      const toolCalls: ToolCall[] = [
        {
          type: "function",
          function: {
            name: "create_lore",
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
      expect(responses[0].message).toContain("Created lore entry");
      expect(storyData.lore).toHaveLength(1);
      expect(storyData.lore[0].title).toBe("The Ancient Temple");
      expect(storyData.lore[0].content).toBe(
        "A forgotten temple deep in the forest"
      );
      expect(storyData.lore[0].on_triggers).toEqual(["temple", "ruins"]);
      expect(storyData.lore[0].off_triggers).toEqual(["forget"]);
    });

    test("should create lore entry without triggers", () => {
      const storyData = createTestStory();
      const toolCalls: ToolCall[] = [
        {
          type: "function",
          function: {
            name: "create_lore",
            arguments: {
              title: "Simple Lore",
              content: "Basic lore content",
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

    test("should reject duplicate lore titles", () => {
      const storyData = createTestStory();
      storyData.lore.push({
        title: "Existing Lore",
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
            name: "create_lore",
            arguments: {
              title: "Existing Lore",
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
    test("should handle memory and lore tools together", () => {
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
            name: "create_lore",
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
            name: "create_lore",
            arguments: {
              title: "Valid Lore",
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
      expect(storyData.memory[0]).toBe("Memory from JSON string");
    });

    test("should parse JSON string arguments for create_lore", () => {
      const storyData = createTestStory();
      const toolCalls: ToolCall[] = [
        {
          type: "function",
          function: {
            name: "create_lore",
            arguments: JSON.stringify({
              title: "Lore Title",
              content: "Lore content",
              onTriggers: ["trigger1", "trigger2"],
            }),
          },
        },
      ];

      const { responses } = executeTools(toolCalls, storyData);

      expect(responses).toHaveLength(1);
      expect(responses[0].success).toBe(true);
      expect(storyData.lore[0].title).toBe("Lore Title");
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

  describe("Resource Management Tools", () => {
    test("should adjust resource current value only", () => {
      const storyData = createTestStory();
      storyData.resources.push({
        name: "Health",
        description: "Life force",
        value: 50,
        maxValue: 100,
        symbol: "❤️",
      });

      const toolCalls: ToolCall[] = [
        {
          type: "function",
          function: {
            name: "adjust_resource",
            arguments: {
              name: "Health",
              currentDelta: -10,
            },
          },
        },
      ];

      const { responses } = executeTools(toolCalls, storyData);

      expect(responses).toHaveLength(1);
      expect(responses[0].success).toBe(true);
      expect(responses[0].message).toContain("Health");
      expect(storyData.resources[0].value).toBe(40);
    });

    test("should adjust resource with maxDelta", () => {
      const storyData = createTestStory();
      storyData.resources.push({
        name: "Mana",
        description: "Magic power",
        value: 30,
        maxValue: 50,
        symbol: "✨",
      });

      const toolCalls: ToolCall[] = [
        {
          type: "function",
          function: {
            name: "adjust_resource",
            arguments: {
              name: "Mana",
              currentDelta: 10,
              maxDelta: 20,
            },
          },
        },
      ];

      const { responses } = executeTools(toolCalls, storyData);

      expect(responses).toHaveLength(1);
      expect(responses[0].success).toBe(true);
      expect(storyData.resources[0].value).toBe(40);
      expect(storyData.resources[0].maxValue).toBe(70);
    });

    test("should handle resource not found", () => {
      const storyData = createTestStory();

      const toolCalls: ToolCall[] = [
        {
          type: "function",
          function: {
            name: "adjust_resource",
            arguments: {
              name: "NonExistent",
              currentDelta: 10,
            },
          },
        },
      ];

      const { responses } = executeTools(toolCalls, storyData);

      expect(responses).toHaveLength(1);
      expect(responses[0].success).toBe(false);
      expect(responses[0].message).toContain("not found");
    });

    test("should create new resource", () => {
      const storyData = createTestStory();

      const toolCalls: ToolCall[] = [
        {
          type: "function",
          function: {
            name: "create_resource",
            arguments: {
              name: "Stamina",
              description: "Physical energy",
              currentValue: 75,
              maxValue: 100,
            },
          },
        },
      ];

      const { responses } = executeTools(toolCalls, storyData);

      expect(responses).toHaveLength(1);
      expect(responses[0].success).toBe(true);
      expect(storyData.resources).toHaveLength(1);
      expect(storyData.resources[0].name).toBe("Stamina");
      expect(storyData.resources[0].value).toBe(75);
      expect(storyData.resources[0].maxValue).toBe(100);
    });

    test("should set resource max value", () => {
      const storyData = createTestStory();
      storyData.resources.push({
        name: "Health",
        description: "Life force",
        value: 50,
        maxValue: 100,
        symbol: "❤️",
      });

      const toolCalls: ToolCall[] = [
        {
          type: "function",
          function: {
            name: "set_resource",
            arguments: {
              name: "Health",
              maxValue: 150,
            },
          },
        },
      ];

      const { responses } = executeTools(toolCalls, storyData);

      expect(responses).toHaveLength(1);
      expect(responses[0].success).toBe(true);
      // Only maxValue can be set directly via /set_resource_max
      expect(storyData.resources[0].maxValue).toBe(150);
      // Current value remains unchanged
      expect(storyData.resources[0].value).toBe(50);
    });

    test("should delete resource", () => {
      const storyData = createTestStory();
      storyData.resources.push({
        name: "TempResource",
        description: "Temporary",
        value: 10,
        maxValue: 10,
        symbol: "⚡",
      });

      const toolCalls: ToolCall[] = [
        {
          type: "function",
          function: {
            name: "delete_resource",
            arguments: {
              name: "TempResource",
            },
          },
        },
      ];

      const { responses } = executeTools(toolCalls, storyData);

      expect(responses).toHaveLength(1);
      expect(responses[0].success).toBe(true);
      expect(storyData.resources).toHaveLength(0);
    });
  });

  describe("stateChanges tracking", () => {
    test("should generate stateChanges for stat modifications", () => {
      const storyData = createTestStory();
      storyData.stats.push({
        name: "Strength",
        description: "Physical power",
        value: 10,
        symbol: "💪",
      });

      const toolCalls: ToolCall[] = [
        {
          type: "function",
          function: {
            name: "adjust_stat",
            arguments: {
              name: "Strength",
              valueDelta: 5,
            },
          },
        },
      ];

      const { responses, stateChanges } = executeTools(toolCalls, storyData);

      expect(responses).toHaveLength(1);
      expect(responses[0].success).toBe(true);
      expect(stateChanges).toHaveLength(1);
      expect(stateChanges[0]).toContain("Strength");
    });

    test("should generate stateChanges for item additions", () => {
      const storyData = createTestStory();

      const toolCalls: ToolCall[] = [
        {
          type: "function",
          function: {
            name: "add_item",
            arguments: {
              name: "Magic Sword",
              description: "A glowing blade",
              type: "normal",
              quantity: 1,
            },
          },
        },
      ];

      const { responses, stateChanges } = executeTools(toolCalls, storyData);

      expect(responses).toHaveLength(1);
      expect(responses[0].success).toBe(true);
      expect(stateChanges).toHaveLength(1);
      expect(stateChanges[0]).toContain("Magic Sword");
    });

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

    test("should generate multiple stateChanges for multiple tools", () => {
      const storyData = createTestStory();
      storyData.stats.push({
        name: "Health",
        description: "Life force",
        value: 100,
        symbol: "❤️",
      });

      const toolCalls: ToolCall[] = [
        {
          type: "function",
          function: {
            name: "adjust_stat",
            arguments: {
              name: "Health",
              valueDelta: -10,
            },
          },
        },
        {
          type: "function",
          function: {
            name: "add_item",
            arguments: {
              name: "Health Potion",
              description: "Restores health",
              type: "consumable",
              quantity: 1,
            },
          },
        },
      ];

      const { responses, stateChanges } = executeTools(toolCalls, storyData);

      expect(responses).toHaveLength(2);
      expect(responses[0].success).toBe(true);
      expect(responses[1].success).toBe(true);
      expect(stateChanges).toHaveLength(2);
      expect(stateChanges[0]).toContain("Health");
      expect(stateChanges[1]).toContain("Health Potion");
    });

    test("should NOT generate stateChanges for failed tool calls", () => {
      const storyData = createTestStory();
      // No stats exist, so adjust_stat should fail

      const toolCalls: ToolCall[] = [
        {
          type: "function",
          function: {
            name: "adjust_stat",
            arguments: {
              name: "NonExistentStat",
              valueDelta: 5,
            },
          },
        },
      ];

      const { responses, stateChanges } = executeTools(toolCalls, storyData);

      expect(responses).toHaveLength(1);
      expect(responses[0].success).toBe(false);
      expect(stateChanges).toHaveLength(0);
    });
  });});