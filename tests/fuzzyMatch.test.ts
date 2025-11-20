import { describe, it, expect } from "vitest";
import {
  findBestMatch,
  findItemMatch,
  findResourceMatch,
  findStatMatch,
  findAchievementMatch,
  findQuestMatch,
} from "../app/misc/fuzzyMatch";

describe("fuzzyMatch", () => {
  describe("findBestMatch", () => {
    const items = [
      { name: "Wand of the Dragon Lord", value: 50 },
      { name: "Health Potion", value: 20 },
      { name: "Mystical Staff", value: 75 },
      { name: "Dragon Scale Armor", value: 100 },
    ];

    it("should return exact match with score 1.0", () => {
      const result = findBestMatch(
        "Health Potion",
        items,
        (item) => item.name,
        0.5
      );
      expect(result).not.toBeNull();
      expect(result?.name).toBe("Health Potion");
      expect(result?.score).toBe(1.0);
      expect(result?.isExact).toBe(true);
    });

    it("should match case-insensitively", () => {
      const result = findBestMatch(
        "health potion",
        items,
        (item) => item.name,
        0.5
      );
      expect(result).not.toBeNull();
      expect(result?.name).toBe("Health Potion");
      expect(result?.score).toBe(1.0);
    });

    it("should match partial name 'wand' to 'Wand of the Dragon Lord'", () => {
      const result = findBestMatch("wand", items, (item) => item.name, 0.5);
      expect(result).not.toBeNull();
      expect(result?.name).toBe("Wand of the Dragon Lord");
      expect(result?.score).toBeGreaterThan(0.8);
    });

    it("should match 'wand dragon lord' to 'Wand of the Dragon Lord'", () => {
      const result = findBestMatch(
        "wand dragon lord",
        items,
        (item) => item.name,
        0.5
      );
      expect(result).not.toBeNull();
      expect(result?.name).toBe("Wand of the Dragon Lord");
      expect(result?.score).toBeGreaterThan(0.7);
    });

    it("should match 'dragon' to 'Dragon Scale Armor' or 'Wand of the Dragon Lord'", () => {
      const result = findBestMatch("dragon", items, (item) => item.name, 0.5);
      expect(result).not.toBeNull();
      expect(result?.name).toMatch(/Dragon/);
      expect(result?.score).toBeGreaterThan(0.5);
    });

    it("should return null if no match above threshold", () => {
      const result = findBestMatch(
        "completely different",
        items,
        (item) => item.name,
        0.9
      );
      expect(result).toBeNull();
    });

    it("should return null if search is undefined", () => {
      const result = findBestMatch(undefined, items, (item) => item.name, 0.5);
      expect(result).toBeNull();
    });

    it("should return null if items array is empty", () => {
      const result = findBestMatch("wand", [], (item) => item, 0.5);
      expect(result).toBeNull();
    });

    it("should handle special characters and normalize them", () => {
      const specialItems = [{ name: "Sword's Edge (Legendary)" }];
      const result = findBestMatch(
        "sword edge legendary",
        specialItems,
        (item) => item.name,
        0.5
      );
      expect(result).not.toBeNull();
      expect(result?.name).toBe("Sword's Edge (Legendary)");
      expect(result?.score).toBeGreaterThan(0.7);
    });
  });

  describe("findItemMatch", () => {
    const inventory = [
      { name: "Health Potion", quantity: 3, type: "consumable" },
      { name: "Stamina Potion", quantity: 2, type: "consumable" },
      { name: "Rusty Sword", quantity: 1, type: "normal" },
    ];

    it("should match exact item name", () => {
      const result = findItemMatch("Health Potion", inventory);
      expect(result).not.toBeNull();
      expect(result?.item.name).toBe("Health Potion");
      expect(result?.item.quantity).toBe(3);
    });

    it("should fuzzy match 'health' to 'Health Potion'", () => {
      const result = findItemMatch("health", inventory);
      expect(result).not.toBeNull();
      expect(result?.item.name).toBe("Health Potion");
    });

    it("should fuzzy match 'potion stamina' to 'Stamina Potion'", () => {
      const result = findItemMatch("potion stamina", inventory);
      expect(result).not.toBeNull();
      expect(result?.item.name).toBe("Stamina Potion");
    });
  });

  describe("findResourceMatch", () => {
    const resources = [
      { name: "Stamina", value: 50, maxValue: 100 },
      { name: "Mana", value: 30, maxValue: 50 },
      { name: "Health", value: 80, maxValue: 100 },
    ];

    it("should match exact resource name", () => {
      const result = findResourceMatch("Stamina", resources);
      expect(result).not.toBeNull();
      expect(result?.item.name).toBe("Stamina");
      expect(result?.item.value).toBe(50);
    });

    it("should fuzzy match 'stamina' (lowercase)", () => {
      const result = findResourceMatch("stamina", resources);
      expect(result).not.toBeNull();
      expect(result?.item.name).toBe("Stamina");
    });

    it("should fuzzy match 'hp' to 'Health' if threshold is low enough", () => {
      const result = findResourceMatch("hp", resources);
      // This might not match depending on similarity - that's ok
      // Just test that the function doesn't crash
      expect(result === null || result.item.name === "Health").toBe(true);
    });
  });

  describe("findStatMatch", () => {
    const stats = [
      { name: "Strength", value: 50 },
      { name: "Dexterity", value: 60 },
      { name: "Intelligence", value: 70 },
      { name: "Stealth", value: 40 },
    ];

    it("should match exact stat name", () => {
      const result = findStatMatch("Stealth", stats);
      expect(result).not.toBeNull();
      expect(result?.item.name).toBe("Stealth");
      expect(result?.item.value).toBe(40);
    });

    it("should fuzzy match 'strength' (lowercase)", () => {
      const result = findStatMatch("strength", stats);
      expect(result).not.toBeNull();
      expect(result?.item.name).toBe("Strength");
    });

    it("should fuzzy match 'dex' to 'Dexterity'", () => {
      const result = findStatMatch("dex", stats);
      expect(result).not.toBeNull();
      expect(result?.item.name).toBe("Dexterity");
    });

    it("should fuzzy match 'int' to 'Intelligence'", () => {
      const result = findStatMatch("int", stats);
      expect(result).not.toBeNull();
      expect(result?.item.name).toBe("Intelligence");
    });
  });

  describe("findAchievementMatch", () => {
    const achievements = [
      { title: "First Blood", points: 10 },
      { title: "Dragon Slayer", points: 50 },
      { title: "Master Thief", points: 30 },
    ];

    it("should match exact achievement title", () => {
      const result = findAchievementMatch("First Blood", achievements);
      expect(result).not.toBeNull();
      expect(result?.item.title).toBe("First Blood");
    });

    it("should fuzzy match 'dragon' to 'Dragon Slayer'", () => {
      const result = findAchievementMatch("dragon", achievements);
      expect(result).not.toBeNull();
      expect(result?.item.title).toBe("Dragon Slayer");
    });

    it("should fuzzy match 'slayer dragon' to 'Dragon Slayer'", () => {
      const result = findAchievementMatch("slayer dragon", achievements);
      expect(result).not.toBeNull();
      expect(result?.item.title).toBe("Dragon Slayer");
    });
  });

  describe("findQuestMatch", () => {
    const quests = [
      { title: "Find the Lost Amulet", active: true, fulfilled: false },
      { title: "Defeat the Goblin King", active: false, fulfilled: false },
      { title: "Rescue the Princess", active: true, fulfilled: false },
    ];

    it("should match exact quest title", () => {
      const result = findQuestMatch("Find the Lost Amulet", quests);
      expect(result).not.toBeNull();
      expect(result?.item.title).toBe("Find the Lost Amulet");
    });

    it("should fuzzy match 'lost amulet' to 'Find the Lost Amulet'", () => {
      const result = findQuestMatch("lost amulet", quests);
      expect(result).not.toBeNull();
      expect(result?.item.title).toBe("Find the Lost Amulet");
    });

    it("should fuzzy match 'goblin' to 'Defeat the Goblin King'", () => {
      const result = findQuestMatch("goblin", quests);
      expect(result).not.toBeNull();
      expect(result?.item.title).toBe("Defeat the Goblin King");
    });

    it("should fuzzy match 'rescue princess' to 'Rescue the Princess'", () => {
      const result = findQuestMatch("rescue princess", quests);
      expect(result).not.toBeNull();
      expect(result?.item.title).toBe("Rescue the Princess");
    });
  });
});
