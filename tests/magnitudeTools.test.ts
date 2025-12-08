/**
 * Magnitude-Based Tool Tests
 *
 * Tests the new word-based magnitude system for GM tools:
 * - modify_relationship: greatly_damage, damage, slightly_damage, slightly_improve, improve, greatly_improve
 * - adjust_resource: fully_deplete, greatly_drain, drain, slightly_drain, slightly_restore, restore, greatly_restore, fully_restore
 * - adjust_stat: greatly_weaken, weaken, slightly_weaken, slightly_strengthen, strengthen, greatly_strengthen
 * - damage_item: scratch, damage, heavily_damage, destroy
 * - repair_item: patch, repair, fully_repair
 *
 * All magnitudes are scaled by adventure difficulty.
 */

import { describe, test, expect } from "vitest";
import { executeTools, ToolCall } from "@/app/misc/toolExecutor";
import type { StoryData, AdventureDifficulty } from "@/app/misc/structs";

// Helper to create minimal story data with configurable difficulty
function createTestStory(
  difficulty: AdventureDifficulty = "medium"
): StoryData {
  return {
    story_name: "Test Story",
    premise: "A test premise",
    player_name: "Test Player",
    player_summary: "A test character",
    intro: "Test intro",
    memory: [],
    max_chapters: 10,
    currentChapter: 0,
    scene: {
      parts: [],
    },
    chapters: [],
    quests: [],
    stats: [
      {
        name: "Strength",
        description: "Physical power",
        value: 50,
        symbol: "💪",
      },
      {
        name: "Intelligence",
        description: "Mental acuity",
        value: 50,
        symbol: "🧠",
      },
    ],
    resources: [
      {
        name: "Health",
        description: "Physical vitality",
        value: 50,
        maxValue: 100,
        symbol: "❤️",
      },
      {
        name: "Mana",
        description: "Magical energy",
        value: 80,
        maxValue: 100,
        symbol: "💧",
      },
    ],
    inventory: [
      {
        name: "Iron Sword",
        description: "A sturdy blade",
        type: "normal",
        quantity: 1,
        grade: "common",
        durability: 80,
        maxDurability: 100,
        symbol: "⚔️",
      },
      {
        name: "Steel Shield",
        description: "A defensive tool",
        type: "normal",
        quantity: 1,
        grade: "uncommon",
        durability: 100,
        maxDurability: 100,
        symbol: "🛡️",
      },
    ],
    abilities: [],
    achievements: [],
    lore: [],
    momentum: 0,
    maxMomentum: 10,
    points: 0,
    level: 1,
    upgradesSpent: 0,
    earnedPointsFromChapters: [],
    relationships: [
      {
        name: "Aldric",
        description: "A mysterious merchant",
        value: 0,
        symbol: "🧔",
      },
      {
        name: "Elena",
        description: "A friendly healer",
        value: 50,
        symbol: "👩‍⚕️",
      },
      {
        name: "Viktor",
        description: "A rival warrior",
        value: -30,
        symbol: "⚔️",
      },
    ],
    conditions: [],
    earnedPointsFromQuests: [],
    rpgSystem: "3d6",
    difficulty,
  } as StoryData;
}

describe("Magnitude-Based Tools", () => {
  describe("modify_relationship", () => {
    test("should improve relationship with 'slightly_improve'", () => {
      const storyData = createTestStory();
      const initialValue = storyData.relationships![0].value;

      const toolCalls: ToolCall[] = [
        {
          type: "function",
          function: {
            name: "modify_relationship",
            arguments: {
              name: "Aldric",
              magnitude: "slightly_improve",
            },
          },
        },
      ];

      const { responses } = executeTools(toolCalls, storyData);

      expect(responses).toHaveLength(1);
      expect(responses[0].success).toBe(true);
      expect(responses[0].message).toContain("slightly improve");
      expect(storyData.relationships![0].value).toBeGreaterThan(initialValue);
    });

    test("should damage relationship with 'greatly_damage'", () => {
      const storyData = createTestStory();
      const elenaRel = storyData.relationships!.find(
        (r) => r.name === "Elena"
      )!;
      const initialValue = elenaRel.value;

      const toolCalls: ToolCall[] = [
        {
          type: "function",
          function: {
            name: "modify_relationship",
            arguments: {
              name: "Elena",
              magnitude: "greatly_damage",
            },
          },
        },
      ];

      const { responses } = executeTools(toolCalls, storyData);

      expect(responses).toHaveLength(1);
      expect(responses[0].success).toBe(true);
      expect(responses[0].message).toContain("greatly damage");
      expect(elenaRel.value).toBeLessThan(initialValue);
      // Greatly damage should be a significant change (around -25 at medium difficulty)
      expect(initialValue - elenaRel.value).toBeGreaterThanOrEqual(15);
    });

    test("should apply larger changes on easy difficulty", () => {
      const easyStory = createTestStory("easy");
      const hardStory = createTestStory("hard");

      const toolCalls: ToolCall[] = [
        {
          type: "function",
          function: {
            name: "modify_relationship",
            arguments: {
              name: "Aldric",
              magnitude: "improve",
            },
          },
        },
      ];

      executeTools(toolCalls, easyStory);
      executeTools(toolCalls, hardStory);

      // Easy difficulty should give larger positive changes
      expect(easyStory.relationships![0].value).toBeGreaterThan(
        hardStory.relationships![0].value
      );
    });

    test("should cap relationship at boundaries (-100 to 100)", () => {
      const storyData = createTestStory();
      // Set Elena to near max
      storyData.relationships!.find((r) => r.name === "Elena")!.value = 95;

      const toolCalls: ToolCall[] = [
        {
          type: "function",
          function: {
            name: "modify_relationship",
            arguments: {
              name: "Elena",
              magnitude: "greatly_improve",
            },
          },
        },
      ];

      const { responses } = executeTools(toolCalls, storyData);

      expect(responses[0].success).toBe(true);
      // Should be capped at 100
      expect(
        storyData.relationships!.find((r) => r.name === "Elena")!.value
      ).toBeLessThanOrEqual(100);
    });

    test("should update description when provided", () => {
      const storyData = createTestStory();

      const toolCalls: ToolCall[] = [
        {
          type: "function",
          function: {
            name: "modify_relationship",
            arguments: {
              name: "Aldric",
              magnitude: "improve",
              description: "Now considers you a trusted ally",
            },
          },
        },
      ];

      const { responses } = executeTools(toolCalls, storyData);

      expect(responses[0].success).toBe(true);
      expect(responses[0].message).toContain("updated description");
      expect(storyData.relationships![0].description).toBe(
        "Now considers you a trusted ally"
      );
    });
  });

  describe("adjust_resource", () => {
    test("should drain resource with 'drain'", () => {
      const storyData = createTestStory();
      const health = storyData.resources!.find((r) => r.name === "Health")!;
      const initialValue = health.value;

      const toolCalls: ToolCall[] = [
        {
          type: "function",
          function: {
            name: "adjust_resource",
            arguments: {
              name: "Health",
              magnitude: "drain",
            },
          },
        },
      ];

      const { responses, stateChanges } = executeTools(toolCalls, storyData);

      expect(responses).toHaveLength(1);
      expect(responses[0].success).toBe(true);
      expect(responses[0].message).toContain("drain");
      expect(health.value).toBeLessThan(initialValue);
      expect(stateChanges.length).toBeGreaterThan(0);
    });

    test("should restore resource with 'greatly_restore'", () => {
      const storyData = createTestStory();
      const health = storyData.resources!.find((r) => r.name === "Health")!;
      health.value = 20; // Set low
      const initialValue = health.value;

      const toolCalls: ToolCall[] = [
        {
          type: "function",
          function: {
            name: "adjust_resource",
            arguments: {
              name: "Health",
              magnitude: "greatly_restore",
            },
          },
        },
      ];

      const { responses } = executeTools(toolCalls, storyData);

      expect(responses[0].success).toBe(true);
      expect(health.value).toBeGreaterThan(initialValue);
      // Greatly restore should be significant (around 50% of max)
      expect(health.value - initialValue).toBeGreaterThanOrEqual(30);
    });

    test("should fully deplete resource", () => {
      const storyData = createTestStory();
      const mana = storyData.resources!.find((r) => r.name === "Mana")!;

      const toolCalls: ToolCall[] = [
        {
          type: "function",
          function: {
            name: "adjust_resource",
            arguments: {
              name: "Mana",
              magnitude: "fully_deplete",
            },
          },
        },
      ];

      const { responses } = executeTools(toolCalls, storyData);

      expect(responses[0].success).toBe(true);
      expect(mana.value).toBe(0);
    });

    test("should fully restore resource", () => {
      const storyData = createTestStory();
      const health = storyData.resources!.find((r) => r.name === "Health")!;
      health.value = 10;

      const toolCalls: ToolCall[] = [
        {
          type: "function",
          function: {
            name: "adjust_resource",
            arguments: {
              name: "Health",
              magnitude: "fully_restore",
            },
          },
        },
      ];

      const { responses } = executeTools(toolCalls, storyData);

      expect(responses[0].success).toBe(true);
      expect(health.value).toBe(health.maxValue);
    });

    test("should fail gracefully for non-existent resource", () => {
      const storyData = createTestStory();

      const toolCalls: ToolCall[] = [
        {
          type: "function",
          function: {
            name: "adjust_resource",
            arguments: {
              name: "Stamina",
              magnitude: "drain",
            },
          },
        },
      ];

      const { responses } = executeTools(toolCalls, storyData);

      expect(responses[0].success).toBe(false);
      expect(responses[0].message).toContain("not found");
    });

    test("should scale drain by difficulty (harder = more drain)", () => {
      const easyStory = createTestStory("easy");
      const hardStory = createTestStory("hard");

      const toolCalls: ToolCall[] = [
        {
          type: "function",
          function: {
            name: "adjust_resource",
            arguments: {
              name: "Health",
              magnitude: "drain",
            },
          },
        },
      ];

      executeTools(toolCalls, easyStory);
      executeTools(toolCalls, hardStory);

      // Hard difficulty should drain more (lower remaining value)
      const easyHealth = easyStory.resources!.find(
        (r) => r.name === "Health"
      )!.value;
      const hardHealth = hardStory.resources!.find(
        (r) => r.name === "Health"
      )!.value;
      expect(easyHealth).toBeGreaterThan(hardHealth);
    });
  });

  describe("adjust_stat", () => {
    test("should strengthen stat with 'strengthen'", () => {
      const storyData = createTestStory();
      const strength = storyData.stats!.find((s) => s.name === "Strength")!;
      const initialValue = strength.value;

      const toolCalls: ToolCall[] = [
        {
          type: "function",
          function: {
            name: "adjust_stat",
            arguments: {
              name: "Strength",
              magnitude: "strengthen",
            },
          },
        },
      ];

      const { responses, stateChanges } = executeTools(toolCalls, storyData);

      expect(responses).toHaveLength(1);
      expect(responses[0].success).toBe(true);
      expect(strength.value).toBeGreaterThan(initialValue);
      // Strengthen should add around 10 points
      expect(strength.value - initialValue).toBeGreaterThanOrEqual(5);
      expect(stateChanges.length).toBeGreaterThan(0);
    });

    test("should weaken stat with 'greatly_weaken'", () => {
      const storyData = createTestStory();
      const intel = storyData.stats!.find((s) => s.name === "Intelligence")!;
      const initialValue = intel.value;

      const toolCalls: ToolCall[] = [
        {
          type: "function",
          function: {
            name: "adjust_stat",
            arguments: {
              name: "Intelligence",
              magnitude: "greatly_weaken",
            },
          },
        },
      ];

      const { responses } = executeTools(toolCalls, storyData);

      expect(responses[0].success).toBe(true);
      expect(intel.value).toBeLessThan(initialValue);
      // Greatly weaken should remove around 15 points
      expect(initialValue - intel.value).toBeGreaterThanOrEqual(10);
    });

    test("should cap stat at 0 minimum (no upper cap)", () => {
      const storyData = createTestStory();
      const strength = storyData.stats!.find((s) => s.name === "Strength")!;
      strength.value = 5;

      const toolCalls: ToolCall[] = [
        {
          type: "function",
          function: {
            name: "adjust_stat",
            arguments: {
              name: "Strength",
              magnitude: "greatly_weaken",
            },
          },
        },
      ];

      executeTools(toolCalls, storyData);

      // Stats are capped at 0 minimum but have no upper cap
      expect(strength.value).toBeGreaterThanOrEqual(0);
    });

    test("should scale by difficulty", () => {
      const easyStory = createTestStory("easy");
      const expertStory = createTestStory("expert");

      const toolCalls: ToolCall[] = [
        {
          type: "function",
          function: {
            name: "adjust_stat",
            arguments: {
              name: "Strength",
              magnitude: "strengthen",
            },
          },
        },
      ];

      executeTools(toolCalls, easyStory);
      executeTools(toolCalls, expertStory);

      // Easy should give more stat gains
      const easyStrength = easyStory.stats!.find(
        (s) => s.name === "Strength"
      )!.value;
      const expertStrength = expertStory.stats!.find(
        (s) => s.name === "Strength"
      )!.value;
      expect(easyStrength).toBeGreaterThan(expertStrength);
    });
  });

  describe("damage_item", () => {
    test("should scratch item with minimal damage", () => {
      const storyData = createTestStory();
      const sword = storyData.inventory!.find((i) => i.name === "Iron Sword")!;
      const initialDurability = sword.durability!;

      const toolCalls: ToolCall[] = [
        {
          type: "function",
          function: {
            name: "damage_item",
            arguments: {
              name: "Iron Sword",
              magnitude: "scratch",
            },
          },
        },
      ];

      const { responses, stateChanges } = executeTools(toolCalls, storyData);

      expect(responses[0].success).toBe(true);
      expect(responses[0].message).toContain("scratch");
      expect(sword.durability!).toBeLessThan(initialDurability);
      // Scratch should be ~10% of max durability
      expect(initialDurability - sword.durability!).toBeLessThanOrEqual(15);
      expect(stateChanges.length).toBeGreaterThan(0);
    });

    test("should heavily damage item", () => {
      const storyData = createTestStory();
      const shield = storyData.inventory!.find(
        (i) => i.name === "Steel Shield"
      )!;
      const initialDurability = shield.durability!;

      const toolCalls: ToolCall[] = [
        {
          type: "function",
          function: {
            name: "damage_item",
            arguments: {
              name: "Steel Shield",
              magnitude: "heavily_damage",
            },
          },
        },
      ];

      const { responses } = executeTools(toolCalls, storyData);

      expect(responses[0].success).toBe(true);
      expect(shield.durability!).toBeLessThan(initialDurability);
      // Heavily damage should be ~50% of max durability
      expect(initialDurability - shield.durability!).toBeGreaterThanOrEqual(40);
    });

    test("should destroy item (set durability to 0)", () => {
      const storyData = createTestStory();
      const sword = storyData.inventory!.find((i) => i.name === "Iron Sword")!;

      const toolCalls: ToolCall[] = [
        {
          type: "function",
          function: {
            name: "damage_item",
            arguments: {
              name: "Iron Sword",
              magnitude: "destroy",
            },
          },
        },
      ];

      const { responses } = executeTools(toolCalls, storyData);

      expect(responses[0].success).toBe(true);
      expect(sword.durability).toBe(0);
    });

    test("should fail for non-existent item", () => {
      const storyData = createTestStory();

      const toolCalls: ToolCall[] = [
        {
          type: "function",
          function: {
            name: "damage_item",
            arguments: {
              name: "Magic Staff",
              magnitude: "damage",
            },
          },
        },
      ];

      const { responses } = executeTools(toolCalls, storyData);

      expect(responses[0].success).toBe(false);
      expect(responses[0].message).toContain("not found");
    });

    test("should scale damage by difficulty (harder = more damage)", () => {
      const easyStory = createTestStory("easy");
      const hardStory = createTestStory("hard");

      const toolCalls: ToolCall[] = [
        {
          type: "function",
          function: {
            name: "damage_item",
            arguments: {
              name: "Iron Sword",
              magnitude: "damage",
            },
          },
        },
      ];

      executeTools(toolCalls, easyStory);
      executeTools(toolCalls, hardStory);

      // Hard difficulty should cause more damage (lower durability)
      const easySword = easyStory.inventory!.find(
        (i) => i.name === "Iron Sword"
      )!;
      const hardSword = hardStory.inventory!.find(
        (i) => i.name === "Iron Sword"
      )!;
      expect(easySword.durability!).toBeGreaterThan(hardSword.durability!);
    });
  });

  describe("repair_item", () => {
    test("should patch item with minimal repair", () => {
      const storyData = createTestStory();
      const sword = storyData.inventory!.find((i) => i.name === "Iron Sword")!;
      sword.durability = 50;
      const initialDurability = sword.durability;

      const toolCalls: ToolCall[] = [
        {
          type: "function",
          function: {
            name: "repair_item",
            arguments: {
              name: "Iron Sword",
              magnitude: "patch",
            },
          },
        },
      ];

      const { responses, stateChanges } = executeTools(toolCalls, storyData);

      expect(responses[0].success).toBe(true);
      expect(responses[0].message).toContain("patch");
      expect(sword.durability!).toBeGreaterThan(initialDurability);
      // Patch should be ~10% of max durability
      expect(sword.durability! - initialDurability).toBeLessThanOrEqual(15);
      expect(stateChanges.length).toBeGreaterThan(0);
    });

    test("should repair item moderately", () => {
      const storyData = createTestStory();
      const sword = storyData.inventory!.find((i) => i.name === "Iron Sword")!;
      sword.durability = 30;
      const initialDurability = sword.durability;

      const toolCalls: ToolCall[] = [
        {
          type: "function",
          function: {
            name: "repair_item",
            arguments: {
              name: "Iron Sword",
              magnitude: "repair",
            },
          },
        },
      ];

      const { responses } = executeTools(toolCalls, storyData);

      expect(responses[0].success).toBe(true);
      expect(sword.durability!).toBeGreaterThan(initialDurability);
      // Repair should be ~25% of max durability
      expect(sword.durability! - initialDurability).toBeGreaterThanOrEqual(15);
    });

    test("should fully repair item", () => {
      const storyData = createTestStory();
      const sword = storyData.inventory!.find((i) => i.name === "Iron Sword")!;
      sword.durability = 10;

      const toolCalls: ToolCall[] = [
        {
          type: "function",
          function: {
            name: "repair_item",
            arguments: {
              name: "Iron Sword",
              magnitude: "fully_repair",
            },
          },
        },
      ];

      const { responses } = executeTools(toolCalls, storyData);

      expect(responses[0].success).toBe(true);
      expect(sword.durability).toBe(sword.maxDurability);
    });

    test("should fail for non-existent item", () => {
      const storyData = createTestStory();

      const toolCalls: ToolCall[] = [
        {
          type: "function",
          function: {
            name: "repair_item",
            arguments: {
              name: "Magic Staff",
              magnitude: "repair",
            },
          },
        },
      ];

      const { responses } = executeTools(toolCalls, storyData);

      expect(responses[0].success).toBe(false);
      expect(responses[0].message).toContain("not found");
    });

    test("should scale repair by difficulty (easier = more repair)", () => {
      const easyStory = createTestStory("easy");
      const hardStory = createTestStory("hard");

      // Set both swords to same low durability
      easyStory.inventory!.find(
        (i) => i.name === "Iron Sword"
      )!.durability = 30;
      hardStory.inventory!.find(
        (i) => i.name === "Iron Sword"
      )!.durability = 30;

      const toolCalls: ToolCall[] = [
        {
          type: "function",
          function: {
            name: "repair_item",
            arguments: {
              name: "Iron Sword",
              magnitude: "repair",
            },
          },
        },
      ];

      executeTools(toolCalls, easyStory);
      executeTools(toolCalls, hardStory);

      // Easy difficulty should repair more
      const easySword = easyStory.inventory!.find(
        (i) => i.name === "Iron Sword"
      )!;
      const hardSword = hardStory.inventory!.find(
        (i) => i.name === "Iron Sword"
      )!;
      expect(easySword.durability!).toBeGreaterThan(hardSword.durability!);
    });
  });

  describe("Cross-tool magnitude consistency", () => {
    test("'slightly' magnitudes should produce small changes", () => {
      const storyData = createTestStory();

      const toolCalls: ToolCall[] = [
        {
          type: "function",
          function: {
            name: "adjust_stat",
            arguments: { name: "Strength", magnitude: "slightly_strengthen" },
          },
        },
        {
          type: "function",
          function: {
            name: "adjust_resource",
            arguments: { name: "Health", magnitude: "slightly_drain" },
          },
        },
        {
          type: "function",
          function: {
            name: "modify_relationship",
            arguments: { name: "Aldric", magnitude: "slightly_improve" },
          },
        },
      ];

      executeTools(toolCalls, storyData);

      const strength = storyData.stats!.find((s) => s.name === "Strength")!;
      const health = storyData.resources!.find((r) => r.name === "Health")!;
      const aldric = storyData.relationships!.find((r) => r.name === "Aldric")!;

      // All "slightly" changes should be modest (around 5-10 points/percent)
      expect(strength.value - 50).toBeLessThanOrEqual(10);
      expect(50 - health.value).toBeLessThanOrEqual(15);
      expect(aldric.value).toBeLessThanOrEqual(15);
    });

    test("'greatly' magnitudes should produce large changes", () => {
      const storyData = createTestStory();

      const toolCalls: ToolCall[] = [
        {
          type: "function",
          function: {
            name: "adjust_stat",
            arguments: { name: "Strength", magnitude: "greatly_strengthen" },
          },
        },
        {
          type: "function",
          function: {
            name: "adjust_resource",
            arguments: { name: "Health", magnitude: "greatly_drain" },
          },
        },
        {
          type: "function",
          function: {
            name: "modify_relationship",
            arguments: { name: "Aldric", magnitude: "greatly_improve" },
          },
        },
      ];

      executeTools(toolCalls, storyData);

      const strength = storyData.stats!.find((s) => s.name === "Strength")!;
      const health = storyData.resources!.find((r) => r.name === "Health")!;
      const aldric = storyData.relationships!.find((r) => r.name === "Aldric")!;

      // All "greatly" changes should be significant (15+ points/percent)
      expect(strength.value - 50).toBeGreaterThanOrEqual(10);
      expect(50 - health.value).toBeGreaterThanOrEqual(30);
      expect(aldric.value).toBeGreaterThanOrEqual(15);
    });
  });
});
