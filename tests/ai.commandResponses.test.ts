import { describe, it, expect } from "vitest";
import { buildMessages } from "@/app/misc/ai";
import type { StoryData, CommandResponse } from "@/app/misc/structs";

describe("buildMessages - Command Response Integration", () => {
  // Base story data fixture
  const baseStoryData: StoryData = {
    story_name: "Test Adventure",
    premise: "A test adventure",
    player_name: "Hero",
    player_summary: "A brave hero",
    intro: "Welcome to the adventure!",
    rpgSystem: "3d6",
    stats: [
      {
        name: "Strength",
        value: 50,
        description: "Physical power",
        symbol: "💪",
      },
      {
        name: "Stealth",
        value: 60,
        description: "Sneaking ability",
        symbol: "🥷",
      },
    ],
    resources: [
      {
        name: "Health",
        value: 80,
        maxValue: 100,
        description: "Life force",
        symbol: "❤️",
      },
      {
        name: "Stamina",
        value: 50,
        maxValue: 100,
        description: "Energy",
        symbol: "⚡",
      },
    ],
    inventory: [
      {
        name: "Sword",
        quantity: 1,
        description: "A sharp blade",
        type: "normal",
        symbol: "⚔️",
      },
    ],
    achievements: [],
    abilities: [],
    level: 1,
    upgradesSpent: 0,
    conditions: [],
    relationships: [],
    lore: [],
    memory: [],
    npcs: [],
    chapters: [],
    currentChapter: 0,
    scene: {
      parts: [
        {
          content: "You stand at the entrance.",
          imageUrl: "",
          user: false,
          role: "assistant",
        },
      ],
    },
    max_chapters: 10,
    momentum: 0,
    maxMomentum: 10,
    points: 0,
    earnedPointsFromChapters: [],
    quests: [],
    earnedPointsFromQuests: [],
  };

  describe("First Interaction (scene.parts.length === 1)", () => {
    it("should add command responses as new user message after intro", () => {
      const commandResponses: CommandResponse[] = [
        {
          command: "/modify_stat Strength +10",
          success: true,
          message: "Strength increased from 50 to 60",
          timestamp: Date.now(),
        },
        {
          command: "/add_item Potion",
          success: true,
          message: "Added Health Potion to inventory",
          timestamp: Date.now(),
        },
      ];

      const { messages } = buildMessages({
        storyData: baseStoryData,
        commandResponses,
      });

      // Should have: system, assistant (intro), user (scene), user (command responses)
      expect(messages.length).toBeGreaterThanOrEqual(3);

      const lastMessage = messages[messages.length - 1];
      expect(lastMessage.role).toBe("user");
      expect(lastMessage.content).toContain("<commands_response>");
      expect(lastMessage.content).toContain("✓ Strength increased");
      expect(lastMessage.content).toContain("✓ Added Health Potion");
    });

    it("should add userChoice as new user message when no command responses", () => {
      const { messages } = buildMessages({
        storyData: baseStoryData,
        userChoice: "[Stealth: success (12 vs DC 10)]",
      });

      const lastMessage = messages[messages.length - 1];
      expect(lastMessage.role).toBe("user");
      expect(lastMessage.content).toBe("[Stealth: success (12 vs DC 10)]");
      expect(lastMessage.content).not.toContain("<commands_response>");
    });

    it("should combine command responses and userChoice in new user message", () => {
      const commandResponses: CommandResponse[] = [
        {
          command: "/use_resource Stamina",
          success: true,
          message: "Stamina decreased to 40",
          timestamp: Date.now(),
        },
      ];

      const { messages } = buildMessages({
        storyData: baseStoryData,
        userChoice: "[Athletics: success]",
        commandResponses,
      });

      const lastMessage = messages[messages.length - 1];
      expect(lastMessage.role).toBe("user");
      expect(lastMessage.content).toContain("<commands_response>");
      expect(lastMessage.content).toContain("✓ Stamina decreased");
      expect(lastMessage.content).toContain("[Athletics: success]");

      // Command responses should come BEFORE user choice
      const responsesIndex = lastMessage.content.indexOf("<commands_response>");
      const choiceIndex = lastMessage.content.indexOf("[Athletics: success]");
      expect(responsesIndex).toBeLessThan(choiceIndex);
    });
  });

  describe("Ongoing Story (scene.parts.length > 1)", () => {
    const ongoingStoryData: StoryData = {
      ...baseStoryData,
      scene: {
        parts: [
          {
            content: "You stand at the entrance.",
            imageUrl: "",
            user: false,
            role: "assistant",
            choices: [],
          },
          {
            content: "[Stealth: success]",
            imageUrl: "",
            user: true,
            role: "user",
          },
          {
            content: "You sneak past the guards successfully.",
            imageUrl: "",
            user: false,
            role: "assistant",
            choices: [],
          },
          {
            content: "[Strength: failure]",
            imageUrl: "",
            user: true,
            role: "user",
          },
          {
            content: "You fail to break down the door.",
            imageUrl: "",
            user: false,
            role: "assistant",
            choices: [],
          },
        ],
      },
    };

    it("should add command responses as new user message after conversation history", () => {
      const commandResponses: CommandResponse[] = [
        {
          command: "/unlock_achievement Silent Shadow",
          success: true,
          message: "Achievement unlocked: Silent Shadow",
          timestamp: Date.now(),
        },
      ];

      const { messages } = buildMessages({
        storyData: ongoingStoryData,
        commandResponses,
      });

      // Last message should be the new user message with command responses
      const lastMessage = messages[messages.length - 1];
      expect(lastMessage.role).toBe("user");
      expect(lastMessage.content).toContain("<commands_response>");
      expect(lastMessage.content).toContain("✓ Achievement unlocked");

      // Second to last should be the assistant's previous response
      const secondLast = messages[messages.length - 2];
      expect(secondLast.role).toBe("assistant");
      expect(secondLast.content).toBe("You fail to break down the door.");
    });

    it("should not corrupt assistant's last message with command responses", () => {
      const commandResponses: CommandResponse[] = [
        {
          command: "/modify_resource Health -10",
          success: true,
          message: "Health decreased to 70",
          timestamp: Date.now(),
        },
      ];

      const { messages } = buildMessages({
        storyData: ongoingStoryData,
        commandResponses,
      });

      // Find the assistant's last story response
      const assistantMessages = messages.filter((m) => m.role === "assistant");
      const lastAssistantMessage =
        assistantMessages[assistantMessages.length - 1];

      // Should NOT contain command responses
      expect(lastAssistantMessage.content).not.toContain("<commands_response>");
      expect(lastAssistantMessage.content).toBe(
        "You fail to break down the door."
      );
    });

    it("should handle multiple command responses with different statuses", () => {
      const commandResponses: CommandResponse[] = [
        {
          command: "/modify_stat Strength +5",
          success: true,
          message: "Strength increased to 55",
          timestamp: Date.now(),
        },
        {
          command: "/add_item Invalid Item Name",
          success: false,
          message: "Item not found in adventure template",
          timestamp: Date.now(),
        },
        {
          command: "/use_resource Health",
          success: "partial",
          message: "Health penalty applied due to low value",
          timestamp: Date.now(),
        },
      ];

      const { messages } = buildMessages({
        storyData: ongoingStoryData,
        commandResponses,
      });

      const lastMessage = messages[messages.length - 1];
      expect(lastMessage.role).toBe("user");
      expect(lastMessage.content).toContain("✓ Strength increased");
      expect(lastMessage.content).toContain("✗ Item not found");
      expect(lastMessage.content).toContain("⚠ Health penalty applied");
    });

    it("should combine command responses and userChoice in correct order", () => {
      const commandResponses: CommandResponse[] = [
        {
          command: "/add_memory Met the merchant",
          success: true,
          message: "Memory added",
          timestamp: Date.now(),
        },
      ];

      const { messages } = buildMessages({
        storyData: ongoingStoryData,
        userChoice: "[Persuasion: success (14 vs DC 12)]",
        commandResponses,
      });

      const lastMessage = messages[messages.length - 1];
      expect(lastMessage.role).toBe("user");

      // Command responses should come first
      const responsesMatch = lastMessage.content.match(
        /<commands_response>[\s\S]*?<\/commands_response>/
      );
      expect(responsesMatch).toBeTruthy();

      // User choice should come after
      expect(lastMessage.content).toContain("[Persuasion: success");

      // Verify order
      const responsesIndex = lastMessage.content.indexOf("<commands_response>");
      const choiceIndex = lastMessage.content.indexOf("[Persuasion:");
      expect(responsesIndex).toBeLessThan(choiceIndex);
    });
  });

  describe("Edge Cases", () => {
    it("should handle empty command responses array", () => {
      const { messages } = buildMessages({
        storyData: baseStoryData,
        commandResponses: [],
        userChoice: "[Stealth: success]",
      });

      const lastMessage = messages[messages.length - 1];
      expect(lastMessage.role).toBe("user");
      expect(lastMessage.content).toBe("[Stealth: success]");
      expect(lastMessage.content).not.toContain("<commands_response>");
    });

    it("should handle undefined command responses", () => {
      const { messages } = buildMessages({
        storyData: baseStoryData,
        commandResponses: undefined,
        userChoice: "[Athletics: failure]",
      });

      const lastMessage = messages[messages.length - 1];
      expect(lastMessage.role).toBe("user");
      expect(lastMessage.content).toBe("[Athletics: failure]");
    });

    it("should handle neither command responses nor userChoice", () => {
      const { messages } = buildMessages({
        storyData: baseStoryData,
      });

      // Should have system, assistant (intro), user (scene), but NO extra user message
      const userMessages = messages.filter((m) => m.role === "user");
      const lastMessage = messages[messages.length - 1];

      // Last message should be user with scene content, not empty
      if (lastMessage.role === "user") {
        expect(lastMessage.content.length).toBeGreaterThan(0);
        expect(lastMessage.content).not.toContain("<commands_response>");
      }
    });

    it("should handle command responses with special characters", () => {
      const commandResponses: CommandResponse[] = [
        {
          command: '/add_lore "The Dragon\'s Lair"',
          success: true,
          message: 'Lore entry added: "The Dragon\'s Lair" (chapter 1)',
          timestamp: Date.now(),
        },
      ];

      const { messages } = buildMessages({
        storyData: baseStoryData,
        commandResponses,
      });

      const lastMessage = messages[messages.length - 1];
      expect(lastMessage.content).toContain("The Dragon's Lair");
      expect(lastMessage.content).toContain("chapter 1");
    });

    it("should clean userChoice string of control characters", () => {
      const { messages } = buildMessages({
        storyData: baseStoryData,
        userChoice: "[Stealth:\x00 success\x1F (with\u00A0weird\u2000spacing)]",
      });

      const lastMessage = messages[messages.length - 1];
      // cleanString should remove control characters and normalize spaces
      expect(lastMessage.content).not.toContain("\x00");
      expect(lastMessage.content).not.toContain("\x1F");
      expect(lastMessage.content).toContain("[Stealth: success");
    });
  });

  describe("Message Order and Structure", () => {
    it("should maintain correct conversation flow with command responses", () => {
      const ongoingStory: StoryData = {
        ...baseStoryData,
        scene: {
          parts: [
            {
              content: "Start",
              imageUrl: "",
              user: false,
              role: "assistant",
              choices: [],
            },
            { content: "[Action 1]", imageUrl: "", user: true, role: "user" },
            {
              content: "Response 1",
              imageUrl: "",
              user: false,
              role: "assistant",
              choices: [],
            },
            { content: "[Action 2]", imageUrl: "", user: true, role: "user" },
            {
              content: "Response 2",
              imageUrl: "",
              user: false,
              role: "assistant",
              choices: [],
            },
          ],
        },
      };

      const commandResponses: CommandResponse[] = [
        {
          command: "/modify_stat Strength +10",
          success: true,
          message: "Strength increased",
          timestamp: Date.now(),
        },
      ];

      const { messages } = buildMessages({
        storyData: ongoingStory,
        userChoice: "[Action 3]",
        commandResponses,
      });

      // Find the sequence of roles
      const roles = messages.map((m) => m.role);

      // Should end with: ...assistant, user (with command responses + action)
      expect(roles[roles.length - 2]).toBe("assistant");
      expect(roles[roles.length - 1]).toBe("user");

      // Last user message should have both
      const lastMessage = messages[messages.length - 1];
      expect(lastMessage.content).toContain("Strength increased");
      expect(lastMessage.content).toContain("[Action 3]");
    });

    it("should not add empty user message when no new content", () => {
      const { messages } = buildMessages({
        storyData: baseStoryData,
        commandResponses: [],
        userChoice: "",
      });

      // Count user messages
      const userMessages = messages.filter((m) => m.role === "user");

      // Should only have the initial scene user message, not an empty one
      const emptyUserMessages = userMessages.filter(
        (m) => m.content.trim() === ""
      );
      expect(emptyUserMessages.length).toBe(0);
    });
  });

  describe("Format Verification", () => {
    it("should format command responses with correct XML structure", () => {
      const commandResponses: CommandResponse[] = [
        {
          command: "/modify_stat Agility +5",
          success: true,
          message: "Agility increased to 65",
          timestamp: Date.now(),
        },
        {
          command: "/add_item Shield",
          success: false,
          message: "Shield not found in template",
          timestamp: Date.now(),
        },
      ];

      const { messages } = buildMessages({
        storyData: baseStoryData,
        commandResponses,
      });

      const lastMessage = messages[messages.length - 1];

      // Should have proper XML tags
      expect(lastMessage.content).toMatch(/<commands_response>\n/);
      expect(lastMessage.content).toMatch(/\n<\/commands_response>/);

      // Should have status icons
      expect(lastMessage.content).toContain("✓");
      expect(lastMessage.content).toContain("✗");

      // Should have messages
      expect(lastMessage.content).toContain("Agility increased to 65");
      expect(lastMessage.content).toContain("Shield not found in template");
    });

    it("should separate command responses and userChoice with double newline", () => {
      const commandResponses: CommandResponse[] = [
        {
          command: "/test_command",
          success: true,
          message: "Command executed",
          timestamp: Date.now(),
        },
      ];

      const { messages } = buildMessages({
        storyData: baseStoryData,
        userChoice: "[Test: success]",
        commandResponses,
      });

      const lastMessage = messages[messages.length - 1];

      // Should have double newline between closing tag and user choice
      expect(lastMessage.content).toContain("</commands_response>");
      expect(lastMessage.content).toContain("[Test: success]");

      // Verify there's proper spacing (at least one blank line) between them
      const parts = lastMessage.content.split("</commands_response>");
      expect(parts.length).toBe(2);
      expect(parts[1]).toMatch(/^\n\n\[Test: success\]/);
    });
  });
});
