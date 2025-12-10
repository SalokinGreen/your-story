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
    id: "test-story",
    name: "Test Story",
    userId: "test-user",
    adventureId: "test-adventure",
    state: "playing",
    points: 0,
    earnedPointsFromQuests: [],
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
      expect(getMemoryContent(storyData.memory[0])).toBe(
        "Memory from JSON string"
      );
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

  describe("Character Field Tools", () => {
    test("should modify number field with delta", () => {
      const storyData = createTestStory();
      storyData.characterSchema = {
        fields: [
          {
            id: "strength",
            name: "Strength",
            type: "number",
            min: 0,
            max: 100,
          },
        ],
      };
      storyData.characterData = {
        values: {
          strength: 50,
        },
      };

      const toolCalls: ToolCall[] = [
        {
          type: "function",
          function: {
            name: "modify_field",
            arguments: {
              field: "strength",
              delta: -10,
            },
          },
        },
      ];

      const { responses } = executeTools(toolCalls, storyData);

      expect(responses).toHaveLength(1);
      expect(responses[0].success).toBe(true);
      expect(responses[0].message).toContain("Strength");
      expect(storyData.characterData!.values.strength).toBe(40);
    });

    test("should modify resource field current value", () => {
      const storyData = createTestStory();
      storyData.characterSchema = {
        fields: [
          {
            id: "health",
            name: "Health",
            type: "resource",
          },
        ],
      };
      storyData.characterData = {
        values: {
          health: { current: 50, max: 100 },
        },
      };

      const toolCalls: ToolCall[] = [
        {
          type: "function",
          function: {
            name: "modify_field",
            arguments: {
              field: "health",
              delta: 20,
            },
          },
        },
      ];

      const { responses } = executeTools(toolCalls, storyData);

      expect(responses).toHaveLength(1);
      expect(responses[0].success).toBe(true);
      const healthValue = storyData.characterData!.values.health as {
        current: number;
        max: number;
      };
      expect(healthValue.current).toBe(70);
      expect(healthValue.max).toBe(100); // Max unchanged
    });

    test("should set resource field max value with set_field", () => {
      const storyData = createTestStory();
      storyData.characterSchema = {
        fields: [
          {
            id: "mana",
            name: "Mana",
            type: "resource",
          },
        ],
      };
      storyData.characterData = {
        values: {
          mana: { current: 30, max: 50 },
        },
      };

      const toolCalls: ToolCall[] = [
        {
          type: "function",
          function: {
            name: "set_field",
            arguments: {
              field: "mana",
              value: { current: 30, max: 70 },
            },
          },
        },
      ];

      const { responses } = executeTools(toolCalls, storyData);

      expect(responses).toHaveLength(1);
      expect(responses[0].success).toBe(true);
      const manaValue = storyData.characterData!.values.mana as {
        current: number;
        max: number;
      };
      expect(manaValue.current).toBe(30);
      expect(manaValue.max).toBe(70);
    });

    test("should handle field not found", () => {
      const storyData = createTestStory();
      storyData.characterSchema = { fields: [] };
      storyData.characterData = { values: {} };

      const toolCalls: ToolCall[] = [
        {
          type: "function",
          function: {
            name: "modify_field",
            arguments: {
              field: "nonexistent",
              delta: 10,
            },
          },
        },
      ];

      const { responses } = executeTools(toolCalls, storyData);

      expect(responses).toHaveLength(1);
      expect(responses[0].success).toBe(false);
      expect(responses[0].message).toContain("not found");
    });

    test("should set field to absolute value", () => {
      const storyData = createTestStory();
      storyData.characterSchema = {
        fields: [
          {
            id: "level",
            name: "Level",
            type: "number",
            min: 1,
          },
        ],
      };
      storyData.characterData = {
        values: {
          level: 5,
        },
      };

      const toolCalls: ToolCall[] = [
        {
          type: "function",
          function: {
            name: "set_field",
            arguments: {
              field: "level",
              value: 10,
            },
          },
        },
      ];

      const { responses } = executeTools(toolCalls, storyData);

      expect(responses).toHaveLength(1);
      expect(responses[0].success).toBe(true);
      expect(storyData.characterData!.values.level).toBe(10);
    });

    test("should set resource field max value", () => {
      const storyData = createTestStory();
      storyData.characterSchema = {
        fields: [
          {
            id: "health",
            name: "Health",
            type: "resource",
          },
        ],
      };
      storyData.characterData = {
        values: {
          health: { current: 50, max: 100 },
        },
      };

      const toolCalls: ToolCall[] = [
        {
          type: "function",
          function: {
            name: "set_field",
            arguments: {
              field: "health",
              value: { current: 50, max: 150 },
            },
          },
        },
      ];

      const { responses } = executeTools(toolCalls, storyData);

      expect(responses).toHaveLength(1);
      expect(responses[0].success).toBe(true);
      const healthValue = storyData.characterData!.values.health as {
        current: number;
        max: number;
      };
      expect(healthValue.max).toBe(150);
      expect(healthValue.current).toBe(50); // Current unchanged
    });

    test("should add item to list field", () => {
      const storyData = createTestStory();
      storyData.characterSchema = {
        fields: [
          {
            id: "skills",
            name: "Skills",
            type: "list",
          },
        ],
      };
      storyData.characterData = {
        values: {
          skills: ["Swordfighting"],
        },
      };

      const toolCalls: ToolCall[] = [
        {
          type: "function",
          function: {
            name: "add_list_item",
            arguments: {
              field: "skills",
              item: "Archery",
            },
          },
        },
      ];

      const { responses } = executeTools(toolCalls, storyData);

      expect(responses).toHaveLength(1);
      expect(responses[0].success).toBe(true);
      const skillsValue = storyData.characterData!.values.skills as string[];
      expect(skillsValue).toContain("Archery");
      expect(skillsValue).toHaveLength(2);
    });

    test("should remove item from list field", () => {
      const storyData = createTestStory();
      storyData.characterSchema = {
        fields: [
          {
            id: "languages",
            name: "Languages",
            type: "list",
          },
        ],
      };
      storyData.characterData = {
        values: {
          languages: ["Common", "Elvish", "Dwarvish"],
        },
      };

      const toolCalls: ToolCall[] = [
        {
          type: "function",
          function: {
            name: "remove_list_item",
            arguments: {
              field: "languages",
              item: "Elvish",
            },
          },
        },
      ];

      const { responses } = executeTools(toolCalls, storyData);

      expect(responses).toHaveLength(1);
      expect(responses[0].success).toBe(true);
      const languagesValue = storyData.characterData!.values
        .languages as string[];
      expect(languagesValue).not.toContain("Elvish");
      expect(languagesValue).toHaveLength(2);
    });

    test("should set boolean field", () => {
      const storyData = createTestStory();
      storyData.characterSchema = {
        fields: [
          {
            id: "isNoble",
            name: "Noble Status",
            type: "boolean",
          },
        ],
      };
      storyData.characterData = {
        values: {
          isNoble: false,
        },
      };

      const toolCalls: ToolCall[] = [
        {
          type: "function",
          function: {
            name: "set_field",
            arguments: {
              field: "isNoble",
              value: true,
            },
          },
        },
      ];

      const { responses } = executeTools(toolCalls, storyData);

      expect(responses).toHaveLength(1);
      expect(responses[0].success).toBe(true);
      expect(storyData.characterData!.values.isNoble).toBe(true);
    });

    test("should set text field", () => {
      const storyData = createTestStory();
      storyData.characterSchema = {
        fields: [
          {
            id: "backstory",
            name: "Backstory",
            type: "text",
          },
        ],
      };
      storyData.characterData = {
        values: {
          backstory: "A humble farmer",
        },
      };

      const toolCalls: ToolCall[] = [
        {
          type: "function",
          function: {
            name: "set_field",
            arguments: {
              field: "backstory",
              value: "Once a humble farmer, now a legendary hero",
            },
          },
        },
      ];

      const { responses } = executeTools(toolCalls, storyData);

      expect(responses).toHaveLength(1);
      expect(responses[0].success).toBe(true);
      expect(storyData.characterData!.values.backstory).toBe(
        "Once a humble farmer, now a legendary hero"
      );
    });

    test("should set select field", () => {
      const storyData = createTestStory();
      storyData.characterSchema = {
        fields: [
          {
            id: "class",
            name: "Class",
            type: "select",
            options: [
              { value: "warrior", label: "Warrior" },
              { value: "mage", label: "Mage" },
              { value: "rogue", label: "Rogue" },
            ],
          },
        ],
      };
      storyData.characterData = {
        values: {
          class: "warrior",
        },
      };

      const toolCalls: ToolCall[] = [
        {
          type: "function",
          function: {
            name: "set_field",
            arguments: {
              field: "class",
              value: "Mage", // Uses label for fuzzy matching
            },
          },
        },
      ];

      const { responses } = executeTools(toolCalls, storyData);

      expect(responses).toHaveLength(1);
      expect(responses[0].success).toBe(true);
      expect(storyData.characterData!.values.class).toBe("mage"); // Stored as value
    });

    test("should reject invalid select option", () => {
      const storyData = createTestStory();
      storyData.characterSchema = {
        fields: [
          {
            id: "class",
            name: "Class",
            type: "select",
            options: [
              { value: "warrior", label: "Warrior" },
              { value: "mage", label: "Mage" },
              { value: "rogue", label: "Rogue" },
            ],
          },
        ],
      };
      storyData.characterData = {
        values: {
          class: "warrior",
        },
      };

      const toolCalls: ToolCall[] = [
        {
          type: "function",
          function: {
            name: "set_field",
            arguments: {
              field: "class",
              value: "Bard", // Not in options
            },
          },
        },
      ];

      const { responses } = executeTools(toolCalls, storyData);

      expect(responses).toHaveLength(1);
      expect(responses[0].success).toBe(false);
      expect(responses[0].message).toContain("invalid option");
    });
  });

  describe("stateChanges tracking", () => {
    test("should generate stateChanges for character field modifications", () => {
      const storyData = createTestStory();
      // Set up character schema and data for the new system
      storyData.characterSchema = {
        name: "Test Schema",
        fields: [
          {
            id: "strength",
            name: "Strength",
            type: "number",
            min: 0,
            max: 100,
          },
        ],
        categories: [],
      };
      storyData.characterData = {
        values: {
          strength: 10,
        },
      };

      const toolCalls: ToolCall[] = [
        {
          type: "function",
          function: {
            name: "modify_field",
            arguments: {
              field: "Strength",
              delta: 5,
            },
          },
        },
      ];

      const { responses, stateChanges } = executeTools(toolCalls, storyData);

      expect(responses).toHaveLength(1);
      expect(responses[0].success).toBe(true);
      // Check that the expected state change is present
      expect(stateChanges.some((s) => s.includes("Strength"))).toBe(true);
      expect(storyData.characterData.values.strength).toBe(15);
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
      storyData.characterSchema = {
        fields: [
          {
            id: "Health",
            name: "Health",
            type: "resource",
            description: "Life force",
          },
          {
            id: "Mana",
            name: "Mana",
            type: "resource",
            description: "Magic energy",
          },
        ],
      };
      storyData.characterData = {
        values: {
          Health: { current: 100, max: 100 },
          Mana: { current: 50, max: 50 },
        },
      };

      const toolCalls: ToolCall[] = [
        {
          type: "function",
          function: {
            name: "modify_field",
            arguments: {
              field: "Health",
              delta: -10,
            },
          },
        },
        {
          type: "function",
          function: {
            name: "modify_field",
            arguments: {
              field: "Mana",
              delta: -5,
            },
          },
        },
      ];

      const { responses, stateChanges } = executeTools(toolCalls, storyData);

      expect(responses).toHaveLength(2);
      expect(responses[0].success).toBe(true);
      expect(responses[1].success).toBe(true);
      // Check that expected state changes are present
      expect(stateChanges.some((s) => s.includes("Health"))).toBe(true);
      expect(stateChanges.some((s) => s.includes("Mana"))).toBe(true);
    });

    test("should NOT generate stateChanges for failed tool calls", () => {
      const storyData = createTestStory();
      // No characterSchema or characterData defined, so modify_field should fail

      const toolCalls: ToolCall[] = [
        {
          type: "function",
          function: {
            name: "modify_field",
            arguments: {
              field: "NonExistentField",
              delta: 5,
            },
          },
        },
      ];

      const { responses, stateChanges } = executeTools(toolCalls, storyData);

      expect(responses).toHaveLength(1);
      expect(responses[0].success).toBe(false);
      expect(stateChanges).toHaveLength(0);
    });
  });

  describe("Lore Visibility Tools", () => {
    test("should show lore entry that exists", () => {
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
        text: "You discover ancient writing on the wall.",
      });

      const toolCalls: ToolCall[] = [
        {
          type: "function",
          function: {
            name: "show_lore",
            arguments: {
              title: "Containment Wards",
            },
          },
        },
      ];

      const { responses, stateChanges } = executeTools(toolCalls, storyData);

      expect(responses).toHaveLength(1);
      expect(responses[0].success).toBe(true);
      expect(responses[0].message).toContain("Revealed lore");
      expect(storyData.lore[0].on).toBe(true);
      expect(storyData.scene.parts[0].revealedLore).toContain(
        "Containment Wards"
      );
      // Note: Lore tools don't generate stateChanges (removed to reduce AI context noise)
      expect(stateChanges.length).toBe(0);
    });

    test("should handle show_lore with fuzzy matching", () => {
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
        text: "You find an old scroll.",
      });

      const toolCalls: ToolCall[] = [
        {
          type: "function",
          function: {
            name: "show_lore",
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

    test("should fail show_lore when lore not found", () => {
      const storyData = createTestStory();
      storyData.lore = [];

      const toolCalls: ToolCall[] = [
        {
          type: "function",
          function: {
            name: "show_lore",
            arguments: {
              title: "Nonexistent Lore",
            },
          },
        },
      ];

      const { responses } = executeTools(toolCalls, storyData);

      expect(responses).toHaveLength(1);
      expect(responses[0].success).toBe(false);
      expect(responses[0].message).toContain("not found");
    });

    test("should return partial success if lore already visible", () => {
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
            name: "show_lore",
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

    test("should hide lore entry that exists", () => {
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
            name: "hide_lore",
            arguments: {
              title: "Temporary Knowledge",
            },
          },
        },
      ];

      const { responses, stateChanges } = executeTools(toolCalls, storyData);

      expect(responses).toHaveLength(1);
      expect(responses[0].success).toBe(true);
      expect(responses[0].message).toContain("Hidden lore");
      expect(storyData.lore[0].on).toBe(false);
      // Note: Lore tools don't generate stateChanges (removed to reduce AI context noise)
      expect(stateChanges.length).toBe(0);
    });

    test("should return partial success if lore already hidden", () => {
      const storyData = createTestStory();
      storyData.lore = [
        {
          title: "Hidden Lore",
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
            name: "hide_lore",
            arguments: {
              title: "Hidden Lore",
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
