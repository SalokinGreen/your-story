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
    npcs: [],
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

  describe("game_over tool", () => {
    test("rejects game_over with no matching tier 6 condition or downed player", () => {
      const storyData = createTestStory();
      const toolCalls: ToolCall[] = [
        {
          type: "function",
          function: {
            name: "game_over",
            arguments: {
              reason: "The character succumbs to their wounds",
              condition: "Dying",
            },
          },
        },
      ];

      const { responses } = executeTools(toolCalls, storyData);

      expect(responses).toHaveLength(1);
      expect(responses[0].success).toBe(false);
      expect(responses[0].message).toContain("tier 6");
      expect(storyData.gameOver).toBeUndefined();
    });

    test("rejects game_over with no condition arg and no downed player", () => {
      const storyData = createTestStory();
      const toolCalls: ToolCall[] = [
        {
          type: "function",
          function: {
            name: "game_over",
            arguments: {
              reason: "The story reaches a definitive fatal end",
            },
          },
        },
      ];

      const { responses } = executeTools(toolCalls, storyData);

      expect(responses[0].success).toBe(false);
      expect(storyData.gameOver).toBeUndefined();
    });

    test("accepts game_over when a matching tier 6 condition exists", () => {
      const storyData = createTestStory();
      storyData.conditions.push({
        id: "cond-1",
        name: "Dying",
        tier: 6,
        description: "Fatal wounds with no chance of recovery",
        affects: [],
        permanent: true,
        createdAt: Date.now(),
      });
      const toolCalls: ToolCall[] = [
        {
          type: "function",
          function: {
            name: "game_over",
            arguments: {
              reason: "Succumbed to wounds after the battle",
              condition: "Dying",
            },
          },
        },
      ];

      const { responses } = executeTools(toolCalls, storyData);

      expect(responses[0].success).toBe(true);
      expect(storyData.gameOver).toBeDefined();
      expect(storyData.gameOver?.reason).toBe(
        "Succumbed to wounds after the battle"
      );
    });

    test("accepts game_over when the player's combatant is downed in active combat", () => {
      const storyData = createTestStory();
      storyData.combatState = {
        active: true,
        combatants: [
          {
            id: "player-1",
            name: "Player",
            type: "player",
            stats: { HP: 0 },
            conditions: [],
            initiative: "10",
            isActive: true,
          },
        ],
        turnOrder: ["player-1"],
        currentTurnIndex: 0,
        round: 1,
      };
      const toolCalls: ToolCall[] = [
        {
          type: "function",
          function: {
            name: "game_over",
            arguments: {
              reason: "Falls in battle against overwhelming odds",
            },
          },
        },
      ];

      const { responses } = executeTools(toolCalls, storyData);

      expect(responses[0].success).toBe(true);
      expect(storyData.gameOver).toBeDefined();
    });

    test("rejects game_over when a non-tier-6 condition is named", () => {
      const storyData = createTestStory();
      storyData.conditions.push({
        id: "cond-1",
        name: "Wounded",
        tier: 2,
        description: "A minor injury",
        affects: [],
        createdAt: Date.now(),
      });
      const toolCalls: ToolCall[] = [
        {
          type: "function",
          function: {
            name: "game_over",
            arguments: {
              reason: "The wound proves too much to bear somehow",
              condition: "Wounded",
            },
          },
        },
      ];

      const { responses } = executeTools(toolCalls, storyData);

      expect(responses[0].success).toBe(false);
      expect(storyData.gameOver).toBeUndefined();
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
});
