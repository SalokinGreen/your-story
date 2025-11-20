/**
 * Tests for relationship management commands in the story system
 */

import { describe, it, expect, beforeEach } from "vitest";
import type { StoryData, Relationship } from "../app/misc/structs";
import { processCommands } from "../app/story/page";

describe("Relationship Commands", () => {
  let storyData: StoryData;
  let notifications: Array<{ message: string; type: string }>;

  const addNotification = (message: string, type: string) => {
    notifications.push({ message, type });
  };

  beforeEach(() => {
    notifications = [];
    storyData = {
      story_name: "Test Story",
      premise: "A test story",
      player_name: "Hero",
      player_summary: "A brave hero",
      intro: "The adventure begins",
      plot_beats: [],
      memory: [],
      max_chapters: 10,
      currentChapter: 0,
      chapters: [],
      scene: { parts: [] },
      stats: [],
      resources: [],
      inventory: [],
      achievements: [],
      lore: [],
      momentum: 50,
      maxMomentum: 100,
      points: 0,
      earnedPointsFromBeats: [],
      earnedPointsFromChapters: [],
      quests: [],
      earnedPointsFromQuests: [],
      relationships: [],
    };
  });

  describe("Add Relationship", () => {
    it("should add a new relationship with correct symbol", () => {
      const commands = [
        "/add_relationship: King's Guard | 30 | Respected by the royal guards",
      ];
      processCommands(commands, storyData, addNotification);

      expect(storyData.relationships).toHaveLength(1);
      expect(storyData.relationships[0].name).toBe("King's Guard");
      expect(storyData.relationships[0].value).toBe(30);
      expect(storyData.relationships[0].description).toBe(
        "Respected by the royal guards"
      );
      expect(storyData.relationships[0].symbol).toBe("😊"); // Friend symbol (25-49)
      expect(notifications[0].type).toBe("success");
    });

    it("should assign correct symbols based on relationship value", () => {
      const testCases = [
        { value: 85, expectedSymbol: "💚" }, // Strong ally (75+)
        { value: 60, expectedSymbol: "💙" }, // Ally (50-74)
        { value: 30, expectedSymbol: "😊" }, // Friend (25-49)
        { value: 10, expectedSymbol: "🤝" }, // Neutral (0-24)
        { value: -10, expectedSymbol: "😐" }, // Tension (-1 to -24)
        { value: -40, expectedSymbol: "😠" }, // Unfriendly (-25 to -49)
        { value: -60, expectedSymbol: "💔" }, // Enemy (-50 to -74)
        { value: -85, expectedSymbol: "⚔️" }, // Hostile (-75 to -100)
      ];

      for (const { value, expectedSymbol } of testCases) {
        const commands = [
          `/add_relationship: Test ${value} | ${value} | Test description`,
        ];
        processCommands(commands, storyData, addNotification);

        const relationship = storyData.relationships.find(
          (r) => r.name === `Test ${value}`
        );
        expect(relationship?.symbol).toBe(expectedSymbol);
      }
    });

    it("should prevent duplicate relationships", () => {
      const commands = [
        "/add_relationship: Thieves Guild | -20 | Suspicious of outsiders",
        "/add_relationship: Thieves Guild | 40 | Trying to add again",
      ];
      processCommands(commands, storyData, addNotification);

      expect(storyData.relationships).toHaveLength(1);
      expect(storyData.relationships[0].value).toBe(-20); // Original value
      expect(
        notifications.some(
          (n) => n.type === "warning" && n.message.includes("already exists")
        )
      ).toBe(true);
    });

    it("should reject invalid relationship values", () => {
      const commands = [
        "/add_relationship: Too High | 150 | Invalid value",
        "/add_relationship: Too Low | -150 | Invalid value",
      ];
      processCommands(commands, storyData, addNotification);

      expect(storyData.relationships).toHaveLength(0);
      expect(
        notifications.filter(
          (n) =>
            n.type === "warning" && n.message.includes("between -100 and 100")
        )
      ).toHaveLength(2);
    });

    it("should handle negative values correctly", () => {
      const commands = [
        "/add_relationship: Dark Brotherhood | -75 | Sworn enemies",
      ];
      processCommands(commands, storyData, addNotification);

      expect(storyData.relationships[0].value).toBe(-75);
      expect(storyData.relationships[0].symbol).toBe("💔");
    });
  });

  describe("Modify Relationship", () => {
    beforeEach(() => {
      storyData.relationships = [
        {
          name: "Merchants Guild",
          value: 25,
          description: "Regular trading partner",
          symbol: "😊",
        },
        {
          name: "City Watch",
          value: 50,
          description: "Trusted by the guards",
          symbol: "💙",
        },
      ];
    });

    it("should increase relationship value", () => {
      const commands = ["/modify_relationship: Merchants Guild | 30"];
      processCommands(commands, storyData, addNotification);

      const relationship = storyData.relationships.find(
        (r) => r.name === "Merchants Guild"
      );
      expect(relationship?.value).toBe(55);
      expect(relationship?.symbol).toBe("💙"); // Changed from 😊 to 💙
      expect(notifications[0].message).toContain("📈"); // Upward arrow
      expect(notifications[0].message).toContain("25 → 55");
    });

    it("should decrease relationship value", () => {
      const commands = ["/modify_relationship: City Watch | -30"];
      processCommands(commands, storyData, addNotification);

      const relationship = storyData.relationships.find(
        (r) => r.name === "City Watch"
      );
      expect(relationship?.value).toBe(20);
      expect(relationship?.symbol).toBe("🤝"); // Changed from 💙 to 🤝
      expect(notifications[0].message).toContain("📉"); // Downward arrow
    });

    it("should cap relationship value at 100", () => {
      const commands = ["/modify_relationship: City Watch | 60"];
      processCommands(commands, storyData, addNotification);

      expect(storyData.relationships[1].value).toBe(100);
      expect(storyData.relationships[1].symbol).toBe("💚");
    });

    it("should cap relationship value at -100", () => {
      storyData.relationships[0].value = -80;
      const commands = ["/modify_relationship: Merchants Guild | -30"];
      processCommands(commands, storyData, addNotification);

      expect(storyData.relationships[0].value).toBe(-100);
      expect(storyData.relationships[0].symbol).toBe("⚔️");
    });

    it("should use fuzzy matching for relationship names", () => {
      const commands = ["/modify_relationship: merchant | 10"];
      processCommands(commands, storyData, addNotification);

      const relationship = storyData.relationships.find(
        (r) => r.name === "Merchants Guild"
      );
      expect(relationship?.value).toBe(35); // 25 + 10
    });

    it("should warn when relationship not found", () => {
      const commands = ["/modify_relationship: Nonexistent Group | 10"];
      processCommands(commands, storyData, addNotification);

      expect(
        notifications.some(
          (n) => n.type === "warning" && n.message.includes("not found")
        )
      ).toBe(true);
    });

    it("should handle large positive delta", () => {
      storyData.relationships[0].value = -50;
      const commands = ["/modify_relationship: Merchants Guild | 75"];
      processCommands(commands, storyData, addNotification);

      expect(storyData.relationships[0].value).toBe(25);
      expect(storyData.relationships[0].symbol).toBe("😊");
    });

    it("should handle large negative delta", () => {
      storyData.relationships[1].value = 60;
      const commands = ["/modify_relationship: City Watch | -80"];
      processCommands(commands, storyData, addNotification);

      expect(storyData.relationships[1].value).toBe(-20);
      expect(storyData.relationships[1].symbol).toBe("😐");
    });
  });

  describe("Remove Relationship", () => {
    beforeEach(() => {
      storyData.relationships = [
        {
          name: "Temple of Light",
          value: 70,
          description: "Holy alliance",
          symbol: "💙",
        },
        {
          name: "Assassins Guild",
          value: -60,
          description: "Blood feud",
          symbol: "💔",
        },
      ];
    });

    it("should remove a relationship", () => {
      const commands = ["/remove_relationship: Temple of Light"];
      processCommands(commands, storyData, addNotification);

      expect(storyData.relationships).toHaveLength(1);
      expect(storyData.relationships[0].name).toBe("Assassins Guild");
      expect(notifications[0].message).toContain("removed");
    });

    it("should use fuzzy matching", () => {
      const commands = ["/remove_relationship: temple"];
      processCommands(commands, storyData, addNotification);

      expect(storyData.relationships).toHaveLength(1);
      expect(
        storyData.relationships.find((r) => r.name === "Temple of Light")
      ).toBeUndefined();
    });

    it("should warn when relationship not found", () => {
      const commands = ["/remove_relationship: Nonexistent"];
      processCommands(commands, storyData, addNotification);

      expect(storyData.relationships).toHaveLength(2);
      expect(
        notifications.some(
          (n) => n.type === "warning" && n.message.includes("not found")
        )
      ).toBe(true);
    });
  });

  describe("Update Relationship Description", () => {
    beforeEach(() => {
      storyData.relationships = [
        {
          name: "Royal Court",
          value: 40,
          description: "Neutral standing",
          symbol: "😊",
        },
      ];
    });

    it("should update relationship description", () => {
      const commands = [
        "/update_relationship_description: Royal Court | Now trusted advisors to the throne",
      ];
      processCommands(commands, storyData, addNotification);

      expect(storyData.relationships[0].description).toBe(
        "Now trusted advisors to the throne"
      );
      expect(notifications[0].type).toBe("success");
    });

    it("should use fuzzy matching", () => {
      const commands = [
        "/update_relationship_description: royal | Gained the king's favor",
      ];
      processCommands(commands, storyData, addNotification);

      expect(storyData.relationships[0].description).toBe(
        "Gained the king's favor"
      );
    });

    it("should warn when relationship not found", () => {
      const commands = [
        "/update_relationship_description: Nonexistent | New description",
      ];
      processCommands(commands, storyData, addNotification);

      expect(
        notifications.some(
          (n) => n.type === "warning" && n.message.includes("not found")
        )
      ).toBe(true);
    });

    it("should not change relationship value or symbol", () => {
      const originalValue = storyData.relationships[0].value;
      const originalSymbol = storyData.relationships[0].symbol;

      const commands = [
        "/update_relationship_description: Royal Court | Updated description",
      ];
      processCommands(commands, storyData, addNotification);

      expect(storyData.relationships[0].value).toBe(originalValue);
      expect(storyData.relationships[0].symbol).toBe(originalSymbol);
    });
  });

  describe("Combined Operations", () => {
    it("should handle multiple relationship commands in sequence", () => {
      const commands = [
        "/add_relationship: Dragon Clan | 0 | Cautious neutrality",
        "/modify_relationship: Dragon Clan | 40",
        "/update_relationship_description: Dragon Clan | Strong alliance forged through battle",
        "/add_relationship: Shadow Syndicate | -30 | Criminal organization",
        "/modify_relationship: Shadow Syndicate | -20",
      ];
      processCommands(commands, storyData, addNotification);

      expect(storyData.relationships).toHaveLength(2);

      const dragonClan = storyData.relationships.find(
        (r) => r.name === "Dragon Clan"
      );
      expect(dragonClan?.value).toBe(40);
      expect(dragonClan?.description).toBe(
        "Strong alliance forged through battle"
      );
      expect(dragonClan?.symbol).toBe("😊");

      const shadowSyndicate = storyData.relationships.find(
        (r) => r.name === "Shadow Syndicate"
      );
      expect(shadowSyndicate?.value).toBe(-50);
      expect(shadowSyndicate?.symbol).toBe("😠");
    });

    it("should handle adding and removing relationships", () => {
      const commands = [
        "/add_relationship: Temporary Ally | 50 | Short-term partnership",
        "/remove_relationship: Temporary Ally",
      ];
      processCommands(commands, storyData, addNotification);

      expect(storyData.relationships).toHaveLength(0);
    });

    it("should handle relationship value transitions across boundaries", () => {
      const commands = [
        "/add_relationship: Evolving Faction | -80 | Started as enemies",
      ];
      processCommands(commands, storyData, addNotification);

      // Simulate redemption arc
      const evolutionCommands = [
        "/modify_relationship: Evolving Faction | 30", // -50
        "/modify_relationship: Evolving Faction | 30", // -20
        "/modify_relationship: Evolving Faction | 30", // 10
        "/modify_relationship: Evolving Faction | 40", // 50
        "/modify_relationship: Evolving Faction | 30", // 80
      ];
      processCommands(evolutionCommands, storyData, addNotification);

      const faction = storyData.relationships.find(
        (r) => r.name === "Evolving Faction"
      );
      expect(faction?.value).toBe(80);
      expect(faction?.symbol).toBe("💚");
    });
  });

  describe("Error Handling", () => {
    it("should handle empty relationship name", () => {
      const commands = ["/add_relationship:  | 50 | Description"];
      processCommands(commands, storyData, addNotification);

      expect(storyData.relationships).toHaveLength(0);
    });

    it("should handle invalid value format", () => {
      const commands = ["/add_relationship: Test | invalid | Description"];
      processCommands(commands, storyData, addNotification);

      // Should fail to parse or create invalid entry
      const validRelationships = storyData.relationships.filter(
        (r) => !isNaN(r.value)
      );
      expect(validRelationships).toHaveLength(0);
    });

    it("should handle missing pipe separators", () => {
      const commands = ["/add_relationship: Test 50 Description"];
      processCommands(commands, storyData, addNotification);

      // Command should not match pattern
      expect(storyData.relationships).toHaveLength(0);
    });

    it("should initialize relationships array if undefined", () => {
      // @ts-expect-error Testing undefined state
      storyData.relationships = undefined;

      const commands = ["/add_relationship: New Group | 25 | Description"];
      processCommands(commands, storyData, addNotification);

      expect(Array.isArray(storyData.relationships)).toBe(true);
      expect(storyData.relationships).toHaveLength(1);
    });
  });

  describe("Edge Cases", () => {
    it("should handle relationship at exactly 0", () => {
      const commands = [
        "/add_relationship: Neutral Party | 0 | Completely neutral",
      ];
      processCommands(commands, storyData, addNotification);

      expect(storyData.relationships[0].value).toBe(0);
      expect(storyData.relationships[0].symbol).toBe("🤝");
    });

    it("should handle relationship at exactly 100", () => {
      const commands = [
        "/add_relationship: Best Friend | 100 | Ultimate trust",
      ];
      processCommands(commands, storyData, addNotification);

      expect(storyData.relationships[0].value).toBe(100);
      expect(storyData.relationships[0].symbol).toBe("💚");
    });

    it("should handle relationship at exactly -100", () => {
      const commands = ["/add_relationship: Nemesis | -100 | Mortal enemies"];
      processCommands(commands, storyData, addNotification);

      expect(storyData.relationships[0].value).toBe(-100);
      expect(storyData.relationships[0].symbol).toBe("⚔️");
    });

    it("should handle modifying to exactly 0", () => {
      storyData.relationships = [
        {
          name: "Shifting Alliance",
          value: 30,
          description: "Unstable",
          symbol: "😊",
        },
      ];

      const commands = ["/modify_relationship: Shifting Alliance | -30"];
      processCommands(commands, storyData, addNotification);

      expect(storyData.relationships[0].value).toBe(0);
      expect(storyData.relationships[0].symbol).toBe("🤝");
    });

    it("should handle names with special characters", () => {
      const commands = ["/add_relationship: O'Malley's Gang | -40 | Irish mob"];
      processCommands(commands, storyData, addNotification);

      expect(storyData.relationships[0].name).toBe("O'Malley's Gang");
    });

    it("should handle very long descriptions", () => {
      const longDesc = "A ".repeat(200) + "very long description";
      const commands = [`/add_relationship: Test | 25 | ${longDesc}`];
      processCommands(commands, storyData, addNotification);

      expect(storyData.relationships[0].description).toBe(longDesc);
    });
  });
});
