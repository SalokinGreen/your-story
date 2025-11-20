import { describe, it, expect, beforeEach } from "vitest";
import type { StoryData, StoryLore } from "@/app/misc/structs";

// Mock the notification system
const mockNotifications: Array<{ message: string; type: string }> = [];
const mockAddNotification = (message: string, type: string) => {
  mockNotifications.push({ message, type });
};

// Mock logger
const mockLogger = {
  action: (msg: string, data?: any) => {},
  warn: (msg: string, data?: any) => {},
};

// Simulate command processing for lore commands
function processLoreCommands(
  commands: string[],
  storyData: StoryData,
  addNotification: typeof mockAddNotification,
  logger: typeof mockLogger
): void {
  for (const command of commands) {
    const trimmed = command.trim();

    // /create_lore: title | content | on_triggers | off_triggers
    const createLoreMatch = trimmed.match(
      /^\/create_lore:\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(.*?)\s*\|\s*(.*)$/i
    );
    if (createLoreMatch) {
      const loreTitle = createLoreMatch[1].trim();
      const loreContent = createLoreMatch[2].trim();
      const onTriggers = createLoreMatch[3].trim();
      const offTriggers = createLoreMatch[4].trim();

      if (!storyData.lore) storyData.lore = [];

      const existingLore = storyData.lore.find((l) => l.title === loreTitle);
      if (existingLore) {
        addNotification(`⚠️ Lore "${loreTitle}" already exists`, "warning");
      } else {
        const onTriggerArray = onTriggers
          ? onTriggers
              .split(",")
              .map((t) => t.trim())
              .filter((t) => t.length > 0)
          : [];
        const offTriggerArray = offTriggers
          ? offTriggers
              .split(",")
              .map((t) => t.trim())
              .filter((t) => t.length > 0)
          : [];

        storyData.lore.push({
          title: loreTitle,
          content: loreContent,
          relatedCharacters: [],
          relatedLocations: [],
          secrtet: false,
          keys: [],
          on_triggers: onTriggerArray,
          off_triggers: offTriggerArray,
          on: onTriggerArray.length === 0,
        });
        logger.action("New lore created via command", { title: loreTitle });
        addNotification(`✨ New lore entry created: ${loreTitle}`, "success");
      }
      continue;
    }

    // /lore_replace_content: lore title | old text | new text
    const loreReplaceMatch = trimmed.match(
      /^\/lore_replace_content:\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(.+)$/i
    );
    if (loreReplaceMatch) {
      const loreTitle = loreReplaceMatch[1].trim();
      const oldText = loreReplaceMatch[2].trim();
      const newText = loreReplaceMatch[3].trim();

      if (!storyData.lore) storyData.lore = [];

      const loreEntry = storyData.lore.find((l) => l.title === loreTitle);
      if (!loreEntry) {
        addNotification(`⚠️ Lore "${loreTitle}" not found`, "warning");
        logger.warn("Lore replace failed: entry not found", {
          title: loreTitle,
        });
      } else if (!loreEntry.content.includes(oldText)) {
        addNotification(`⚠️ Text not found in lore "${loreTitle}"`, "warning");
        logger.warn("Lore replace failed: text not found", {
          title: loreTitle,
          oldText,
        });
      } else {
        loreEntry.content = loreEntry.content.replace(oldText, newText);
        logger.action("Lore content replaced via command", {
          title: loreTitle,
          oldText,
          newText,
        });
        addNotification(`✨ Lore "${loreTitle}" content updated`, "success");
      }
      continue;
    }

    // /lore_add_content: lore title | new text
    const loreAddMatch = trimmed.match(
      /^\/lore_add_content:\s*(.+?)\s*\|\s*(.+)$/i
    );
    if (loreAddMatch) {
      const loreTitle = loreAddMatch[1].trim();
      const newText = loreAddMatch[2].trim();

      if (!storyData.lore) storyData.lore = [];

      const loreEntry = storyData.lore.find((l) => l.title === loreTitle);
      if (!loreEntry) {
        addNotification(`⚠️ Lore "${loreTitle}" not found`, "warning");
        logger.warn("Lore add failed: entry not found", { title: loreTitle });
      } else {
        loreEntry.content = loreEntry.content.trim() + "\n" + newText;
        logger.action("Content added to lore via command", {
          title: loreTitle,
          addedText: newText,
        });
        addNotification(`✨ Content added to lore "${loreTitle}"`, "success");
      }
      continue;
    }

    // /lore_delete_content: lore title | text to delete
    const loreDeleteMatch = trimmed.match(
      /^\/lore_delete_content:\s*(.+?)\s*\|\s*(.+)$/i
    );
    if (loreDeleteMatch) {
      const loreTitle = loreDeleteMatch[1].trim();
      const textToDelete = loreDeleteMatch[2].trim();

      if (!storyData.lore) storyData.lore = [];

      const loreEntry = storyData.lore.find((l) => l.title === loreTitle);
      if (!loreEntry) {
        addNotification(`⚠️ Lore "${loreTitle}" not found`, "warning");
        logger.warn("Lore delete failed: entry not found", {
          title: loreTitle,
        });
      } else if (!loreEntry.content.includes(textToDelete)) {
        addNotification(`⚠️ Text not found in lore "${loreTitle}"`, "warning");
        logger.warn("Lore delete failed: text not found", {
          title: loreTitle,
          textToDelete,
        });
      } else {
        loreEntry.content = loreEntry.content.replace(textToDelete, "").trim();
        // Clean up multiple spaces and newlines that might result from deletion
        loreEntry.content = loreEntry.content.replace(/  +/g, " "); // Replace multiple spaces with single space
        loreEntry.content = loreEntry.content.replace(/\n{3,}/g, "\n\n"); // Max 2 newlines
        logger.action("Content deleted from lore via command", {
          title: loreTitle,
          deletedText: textToDelete,
        });
        addNotification(
          `✨ Content removed from lore "${loreTitle}"`,
          "success"
        );
      }
      continue;
    }
  }
}

describe("Lore Manipulation Commands", () => {
  let storyData: StoryData;

  beforeEach(() => {
    // Reset mock notifications
    mockNotifications.length = 0;

    // Create a minimal StoryData object
    storyData = {
      story_name: "Test Story",
      premise: "Test premise",
      player_name: "Test Player",
      player_summary: "Test summary",
      intro: "Test intro",
      stats: [],
      resources: [],
      inventory: [],
      achievements: [],
      lore: [
        {
          title: "The Ancient Order",
          content: "A secret society of mages who guard ancient knowledge.",
          relatedCharacters: [],
          relatedLocations: [],
          secrtet: false,
          keys: [],
          on_triggers: [],
          off_triggers: [],
          on: true,
        },
      ],
      memory: [],
      scene: {
        parts: [],
      },
      plot_beats: [],
      points: 0,
      earnedPointsFromBeats: [],
      earnedPointsFromChapters: [],
      earnedPointsFromQuests: [],
      currentChapter: 0,
      max_chapters: 10,
      chapters: [],
      quests: [],
      momentum: 0,
      maxMomentum: 100,
      relationships: [],
    } as StoryData;
  });

  describe("/create_lore command", () => {
    it("should create a new lore entry with triggers", () => {
      const commands = [
        "/create_lore: Dragon Lore | Dragons are ancient creatures | dragon,ancient | slain,extinct",
      ];

      processLoreCommands(commands, storyData, mockAddNotification, mockLogger);

      expect(storyData.lore).toHaveLength(2);
      expect(storyData.lore[1]).toMatchObject({
        title: "Dragon Lore",
        content: "Dragons are ancient creatures",
        on_triggers: ["dragon", "ancient"],
        off_triggers: ["slain", "extinct"],
        on: false, // Has triggers, so starts hidden
      });

      expect(mockNotifications).toContainEqual({
        message: "✨ New lore entry created: Dragon Lore",
        type: "success",
      });
    });

    it("should create a new lore entry without triggers (visible from start)", () => {
      const commands = [
        "/create_lore: Basic History | The kingdom was founded 500 years ago | | ",
      ];

      processLoreCommands(commands, storyData, mockAddNotification, mockLogger);

      expect(storyData.lore).toHaveLength(2);
      expect(storyData.lore[1]).toMatchObject({
        title: "Basic History",
        content: "The kingdom was founded 500 years ago",
        on_triggers: [],
        off_triggers: [],
        on: true, // No triggers, so visible from start
      });
    });

    it("should warn if lore entry already exists", () => {
      const commands = [
        "/create_lore: The Ancient Order | Duplicate content | | ",
      ];

      processLoreCommands(commands, storyData, mockAddNotification, mockLogger);

      expect(storyData.lore).toHaveLength(1); // No new entry added
      expect(mockNotifications).toContainEqual({
        message: '⚠️ Lore "The Ancient Order" already exists',
        type: "warning",
      });
    });
  });

  describe("/lore_replace_content command", () => {
    it("should replace text in existing lore entry", () => {
      const commands = [
        "/lore_replace_content: The Ancient Order | secret society | powerful organization",
      ];

      processLoreCommands(commands, storyData, mockAddNotification, mockLogger);

      const lore = storyData.lore.find((l) => l.title === "The Ancient Order");
      expect(lore?.content).toBe(
        "A powerful organization of mages who guard ancient knowledge."
      );

      expect(mockNotifications).toContainEqual({
        message: '✨ Lore "The Ancient Order" content updated',
        type: "success",
      });
    });

    it("should warn if lore entry not found", () => {
      const commands = [
        "/lore_replace_content: Nonexistent Lore | old text | new text",
      ];

      processLoreCommands(commands, storyData, mockAddNotification, mockLogger);

      expect(mockNotifications).toContainEqual({
        message: '⚠️ Lore "Nonexistent Lore" not found',
        type: "warning",
      });
    });

    it("should warn if text to replace not found", () => {
      const commands = [
        "/lore_replace_content: The Ancient Order | nonexistent text | new text",
      ];

      processLoreCommands(commands, storyData, mockAddNotification, mockLogger);

      expect(mockNotifications).toContainEqual({
        message: '⚠️ Text not found in lore "The Ancient Order"',
        type: "warning",
      });

      // Content should remain unchanged
      const lore = storyData.lore.find((l) => l.title === "The Ancient Order");
      expect(lore?.content).toBe(
        "A secret society of mages who guard ancient knowledge."
      );
    });

    it("should handle multiple replacements in sequence", () => {
      const commands = [
        "/lore_replace_content: The Ancient Order | secret | hidden",
        "/lore_replace_content: The Ancient Order | hidden society | mysterious guild",
      ];

      processLoreCommands(commands, storyData, mockAddNotification, mockLogger);

      const lore = storyData.lore.find((l) => l.title === "The Ancient Order");
      expect(lore?.content).toBe(
        "A mysterious guild of mages who guard ancient knowledge."
      );
    });
  });

  describe("/lore_add_content command", () => {
    it("should add new content to existing lore entry", () => {
      const commands = [
        "/lore_add_content: The Ancient Order | Their influence spans across the entire kingdom.",
      ];

      processLoreCommands(commands, storyData, mockAddNotification, mockLogger);

      const lore = storyData.lore.find((l) => l.title === "The Ancient Order");
      expect(lore?.content).toBe(
        "A secret society of mages who guard ancient knowledge.\nTheir influence spans across the entire kingdom."
      );

      expect(mockNotifications).toContainEqual({
        message: '✨ Content added to lore "The Ancient Order"',
        type: "success",
      });
    });

    it("should warn if lore entry not found", () => {
      const commands = [
        "/lore_add_content: Nonexistent Lore | Some new content",
      ];

      processLoreCommands(commands, storyData, mockAddNotification, mockLogger);

      expect(mockNotifications).toContainEqual({
        message: '⚠️ Lore "Nonexistent Lore" not found',
        type: "warning",
      });
    });

    it("should handle multiple additions", () => {
      const commands = [
        "/lore_add_content: The Ancient Order | First addition.",
        "/lore_add_content: The Ancient Order | Second addition.",
      ];

      processLoreCommands(commands, storyData, mockAddNotification, mockLogger);

      const lore = storyData.lore.find((l) => l.title === "The Ancient Order");
      expect(lore?.content).toBe(
        "A secret society of mages who guard ancient knowledge.\nFirst addition.\nSecond addition."
      );
    });
  });

  describe("/lore_delete_content command", () => {
    it("should delete text from existing lore entry", () => {
      const commands = [
        "/lore_delete_content: The Ancient Order | secret society of ",
      ];

      processLoreCommands(commands, storyData, mockAddNotification, mockLogger);

      const lore = storyData.lore.find((l) => l.title === "The Ancient Order");
      expect(lore?.content).toBe("A mages who guard ancient knowledge.");

      expect(mockNotifications).toContainEqual({
        message: '✨ Content removed from lore "The Ancient Order"',
        type: "success",
      });
    });

    it("should warn if lore entry not found", () => {
      const commands = ["/lore_delete_content: Nonexistent Lore | some text"];

      processLoreCommands(commands, storyData, mockAddNotification, mockLogger);

      expect(mockNotifications).toContainEqual({
        message: '⚠️ Lore "Nonexistent Lore" not found',
        type: "warning",
      });
    });

    it("should warn if text to delete not found", () => {
      const commands = [
        "/lore_delete_content: The Ancient Order | nonexistent text",
      ];

      processLoreCommands(commands, storyData, mockAddNotification, mockLogger);

      expect(mockNotifications).toContainEqual({
        message: '⚠️ Text not found in lore "The Ancient Order"',
        type: "warning",
      });

      // Content should remain unchanged
      const lore = storyData.lore.find((l) => l.title === "The Ancient Order");
      expect(lore?.content).toBe(
        "A secret society of mages who guard ancient knowledge."
      );
    });

    it("should clean up multiple newlines after deletion", () => {
      // Setup: Create lore with multiple paragraphs
      storyData.lore[0].content =
        "First paragraph.\n\nSecond paragraph.\n\nThird paragraph.";

      const commands = [
        "/lore_delete_content: The Ancient Order | Second paragraph.",
      ];

      processLoreCommands(commands, storyData, mockAddNotification, mockLogger);

      const lore = storyData.lore.find((l) => l.title === "The Ancient Order");
      // Should clean up to max 2 consecutive newlines
      expect(lore?.content).toBe("First paragraph.\n\nThird paragraph.");
    });
  });

  describe("Combined operations", () => {
    it("should handle create, add, replace, and delete in sequence", () => {
      const commands = [
        "/create_lore: Test Lore | Initial content | | ",
        "/lore_add_content: Test Lore | Added sentence.",
        "/lore_replace_content: Test Lore | Initial | Updated",
        "/lore_delete_content: Test Lore | sentence.",
      ];

      processLoreCommands(commands, storyData, mockAddNotification, mockLogger);

      const lore = storyData.lore.find((l) => l.title === "Test Lore");
      expect(lore?.content).toBe("Updated content\nAdded");

      // Should have 4 success notifications
      const successNotifications = mockNotifications.filter(
        (n) => n.type === "success"
      );
      expect(successNotifications).toHaveLength(4);
    });

    it("should maintain lore structure after multiple operations", () => {
      const commands = [
        "/lore_replace_content: The Ancient Order | mages | wizards",
        "/lore_add_content: The Ancient Order | They meet in secret.",
        "/lore_delete_content: The Ancient Order | secret society of ",
      ];

      processLoreCommands(commands, storyData, mockAddNotification, mockLogger);

      const lore = storyData.lore.find((l) => l.title === "The Ancient Order");

      // Verify lore structure is intact
      expect(lore).toMatchObject({
        title: "The Ancient Order",
        relatedCharacters: [],
        relatedLocations: [],
        secrtet: false,
        keys: [],
        on_triggers: [],
        off_triggers: [],
        on: true,
      });

      // Content should reflect all operations
      expect(lore?.content).toBe(
        "A wizards who guard ancient knowledge.\nThey meet in secret."
      );
    });
  });

  describe("Edge cases", () => {
    it("should handle commands with extra whitespace", () => {
      const commands = [
        "  /lore_add_content:   The Ancient Order   |   Extra spaces here   ",
      ];

      processLoreCommands(commands, storyData, mockAddNotification, mockLogger);

      const lore = storyData.lore.find((l) => l.title === "The Ancient Order");
      expect(lore?.content).toContain("Extra spaces here");
    });

    it("should handle empty lore array", () => {
      storyData.lore = [];

      const commands = ["/lore_replace_content: The Ancient Order | old | new"];

      processLoreCommands(commands, storyData, mockAddNotification, mockLogger);

      expect(mockNotifications).toContainEqual({
        message: '⚠️ Lore "The Ancient Order" not found',
        type: "warning",
      });
    });

    it("should handle pipes in content correctly", () => {
      const commands = [
        "/lore_add_content: The Ancient Order | They use the symbol: | for marking.",
      ];

      processLoreCommands(commands, storyData, mockAddNotification, mockLogger);

      const lore = storyData.lore.find((l) => l.title === "The Ancient Order");
      expect(lore?.content).toContain("They use the symbol: | for marking.");
    });
  });
});
