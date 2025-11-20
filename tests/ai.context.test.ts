import { describe, it, expect } from "vitest";
import { storyDataToString, buildMessages } from "../app/misc/ai";
import { StoryData, StoryLore } from "../app/misc/structs";

describe("AI Context Building", () => {
  const baseLore: Omit<StoryLore, "title" | "content" | "on"> = {
    relatedCharacters: [],
    relatedLocations: [],
    secrtet: false,
    keys: [],
  };

  const mockStoryData: StoryData = {
    story_name: "Test Story",
    premise: "Test Premise",
    player_name: "Test Player",
    player_summary: "Test Summary",
    intro: "Starting content.",
    stats: [],
    resources: [],
    inventory: [],
    achievements: [],
    plot_beats: [],
    lore: [
      {
        ...baseLore,
        title: "Active Lore",
        content: "This lore is active.",
        on: true,
      },
      {
        ...baseLore,
        title: "Inactive Lore",
        content: "This lore is inactive.",
        on: false,
      },
    ],
    memory: [],
    scene: {
      parts: [
        {
          content: "Scene content.",
          imageUrl: "",
          user: false,
          role: "assistant",
          choices: [],
        },
      ],
    },
    chapters: [],
    currentChapter: 1,
    max_chapters: 10,
    quests: [],
    points: 0,
    momentum: 0,
    maxMomentum: 10,
    earnedPointsFromBeats: [],
    earnedPointsFromChapters: [],
    earnedPointsFromQuests: [],
  };

  describe("storyDataToString", () => {
    it("should include active lore in the output", () => {
      const result = storyDataToString(mockStoryData);
      expect(result).toContain("Lore: Active Lore");
      expect(result).toContain("This lore is active.");
    });

    it("should NOT include inactive lore in the output", () => {
      const result = storyDataToString(mockStoryData);
      expect(result).not.toContain("Lore: Inactive Lore");
      expect(result).not.toContain("This lore is inactive.");
    });
  });

  describe("buildMessages", () => {
    it("should include story data in the user message", () => {
      const messages = buildMessages({ storyData: mockStoryData });
      const userMessage = messages.find((m) => m.role === "user");
      expect(userMessage).toBeDefined();
      expect(userMessage?.content).toContain("Lore: Active Lore");
      expect(userMessage?.content).not.toContain("Lore: Inactive Lore");
    });
  });
});
