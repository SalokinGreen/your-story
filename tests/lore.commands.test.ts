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

// Simulate command processing for note commands
function processNoteCommands(
  commands: string[],
  storyData: StoryData,
  addNotification: typeof mockAddNotification,
  logger: typeof mockLogger
): void {
  for (const command of commands) {
    const trimmed = command.trim();

    // /create_note: title | content | on_triggers | off_triggers
    const createNoteMatch = trimmed.match(
      /^\/create_note:\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(.*?)\s*\|\s*(.*)$/i
    );
    if (createNoteMatch) {
      const noteTitle = createNoteMatch[1].trim();
      const noteContent = createNoteMatch[2].trim();
      const onTriggers = createNoteMatch[3].trim();
      const offTriggers = createNoteMatch[4].trim();

      if (!storyData.lore) storyData.lore = [];

      const existingNote = storyData.lore.find((l) => l.title === noteTitle);
      if (existingNote) {
        addNotification(`⚠️ Note "${noteTitle}" already exists`, "warning");
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
          title: noteTitle,
          content: noteContent,
          relatedCharacters: [],
          relatedLocations: [],
          secrtet: false,
          keys: [],
          on_triggers: onTriggerArray,
          off_triggers: offTriggerArray,
          on: onTriggerArray.length === 0,
        });
        logger.action("New note created via command", { title: noteTitle });
        addNotification(`✨ New note entry created: ${noteTitle}`, "success");
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
      abilities: [],
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
      currentChapter: 0,
      max_chapters: 10,
      chapters: [],
      goals: [],
      relationships: [],
      npcs: [],
    } as StoryData;
  });

  describe("/create_note command", () => {
    it("should create a new note entry with triggers", () => {
      const commands = [
        "/create_note: Dragon Lore | Dragons are ancient creatures | dragon,ancient | slain,extinct",
      ];

      processNoteCommands(commands, storyData, mockAddNotification, mockLogger);

      expect(storyData.lore).toHaveLength(2);
      expect(storyData.lore[1]).toMatchObject({
        title: "Dragon Lore",
        content: "Dragons are ancient creatures",
        on_triggers: ["dragon", "ancient"],
        off_triggers: ["slain", "extinct"],
        on: false, // Has triggers, so starts hidden
      });

      expect(mockNotifications).toContainEqual({
        message: "✨ New note entry created: Dragon Lore",
        type: "success",
      });
    });

    it("should create a new note entry without triggers (visible from start)", () => {
      const commands = [
        "/create_note: Basic History | The kingdom was founded 500 years ago | | ",
      ];

      processNoteCommands(commands, storyData, mockAddNotification, mockLogger);

      expect(storyData.lore).toHaveLength(2);
      expect(storyData.lore[1]).toMatchObject({
        title: "Basic History",
        content: "The kingdom was founded 500 years ago",
        on_triggers: [],
        off_triggers: [],
        on: true, // No triggers, so visible from start
      });
    });

    it("should warn if note entry already exists", () => {
      const commands = [
        "/create_note: The Ancient Order | Duplicate content | | ",
      ];

      processNoteCommands(commands, storyData, mockAddNotification, mockLogger);

      expect(storyData.lore).toHaveLength(1); // No new entry added
      expect(mockNotifications).toContainEqual({
        message: '⚠️ Note "The Ancient Order" already exists',
        type: "warning",
      });
    });
  });

  describe("/lore_replace_content command", () => {
    it("should replace text in existing lore entry", () => {
      const commands = [
        "/lore_replace_content: The Ancient Order | secret society | powerful organization",
      ];

      processNoteCommands(commands, storyData, mockAddNotification, mockLogger);

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

      processNoteCommands(commands, storyData, mockAddNotification, mockLogger);

      expect(mockNotifications).toContainEqual({
        message: '⚠️ Lore "Nonexistent Lore" not found',
        type: "warning",
      });
    });

    it("should warn if text to replace not found", () => {
      const commands = [
        "/lore_replace_content: The Ancient Order | nonexistent text | new text",
      ];

      processNoteCommands(commands, storyData, mockAddNotification, mockLogger);

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

      processNoteCommands(commands, storyData, mockAddNotification, mockLogger);

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

      processNoteCommands(commands, storyData, mockAddNotification, mockLogger);

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

      processNoteCommands(commands, storyData, mockAddNotification, mockLogger);

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

      processNoteCommands(commands, storyData, mockAddNotification, mockLogger);

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

      processNoteCommands(commands, storyData, mockAddNotification, mockLogger);

      const lore = storyData.lore.find((l) => l.title === "The Ancient Order");
      expect(lore?.content).toBe("A mages who guard ancient knowledge.");

      expect(mockNotifications).toContainEqual({
        message: '✨ Content removed from lore "The Ancient Order"',
        type: "success",
      });
    });

    it("should warn if lore entry not found", () => {
      const commands = ["/lore_delete_content: Nonexistent Lore | some text"];

      processNoteCommands(commands, storyData, mockAddNotification, mockLogger);

      expect(mockNotifications).toContainEqual({
        message: '⚠️ Lore "Nonexistent Lore" not found',
        type: "warning",
      });
    });

    it("should warn if text to delete not found", () => {
      const commands = [
        "/lore_delete_content: The Ancient Order | nonexistent text",
      ];

      processNoteCommands(commands, storyData, mockAddNotification, mockLogger);

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

      processNoteCommands(commands, storyData, mockAddNotification, mockLogger);

      const lore = storyData.lore.find((l) => l.title === "The Ancient Order");
      // Should clean up to max 2 consecutive newlines
      expect(lore?.content).toBe("First paragraph.\n\nThird paragraph.");
    });
  });

  describe("Combined operations", () => {
    it("should handle create, add, replace, and delete in sequence", () => {
      const commands = [
        "/create_note: Test Note | Initial content | | ",
        "/lore_add_content: Test Note | Added sentence.",
        "/lore_replace_content: Test Note | Initial | Updated",
        "/lore_delete_content: Test Note | sentence.",
      ];

      processNoteCommands(commands, storyData, mockAddNotification, mockLogger);

      const note = storyData.lore.find((l) => l.title === "Test Note");
      expect(note?.content).toBe("Updated content\nAdded");

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

      processNoteCommands(commands, storyData, mockAddNotification, mockLogger);

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

      processNoteCommands(commands, storyData, mockAddNotification, mockLogger);

      const lore = storyData.lore.find((l) => l.title === "The Ancient Order");
      expect(lore?.content).toContain("Extra spaces here");
    });

    it("should handle empty lore array", () => {
      storyData.lore = [];

      const commands = ["/lore_replace_content: The Ancient Order | old | new"];

      processNoteCommands(commands, storyData, mockAddNotification, mockLogger);

      expect(mockNotifications).toContainEqual({
        message: '⚠️ Lore "The Ancient Order" not found',
        type: "warning",
      });
    });

    it("should handle pipes in content correctly", () => {
      const commands = [
        "/lore_add_content: The Ancient Order | They use the symbol: | for marking.",
      ];

      processNoteCommands(commands, storyData, mockAddNotification, mockLogger);

      const lore = storyData.lore.find((l) => l.title === "The Ancient Order");
      expect(lore?.content).toContain("They use the symbol: | for marking.");
    });
  });
});
