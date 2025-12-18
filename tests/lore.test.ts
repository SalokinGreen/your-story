import { describe, it, expect, vi } from "vitest";
import { processLoreTriggers } from "../app/misc/lore";
import { StoryData, StoryLore } from "../app/misc/structs";

describe("processLoreTriggers", () => {
  const mockAddNotification = vi.fn();

  const createMockStoryData = (lore: StoryLore[]): StoryData => ({
    story_name: "Test Story",
    premise: "Test Premise",
    player_name: "Test Player",
    player_summary: "Test Summary",
    intro: "Starting content with keyword1.",
    stats: [],
    resources: [],
    inventory: [],
    achievements: [],
    abilities: [],
    level: 1,
    upgradesSpent: 0,
    conditions: [],
    lore: lore,
    memory: [],
    scene: {
      parts: [
        {
          content: "Scene content with keyword2.",
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
    earnedPointsFromChapters: [],
    earnedPointsFromQuests: [],
    relationships: [],
    npcs: [],
  });

  const baseLore: Omit<StoryLore, "title" | "content" | "on"> = {
    relatedCharacters: [],
    relatedLocations: [],
    secrtet: false,
    keys: [],
  };

  it("should activate lore when on_triggers match content", () => {
    const lore: StoryLore[] = [
      {
        ...baseLore,
        title: "Lore 1",
        content: "Content 1",
        on_triggers: ["keyword1"],
        on: false,
      },
    ];
    const storyData = createMockStoryData(lore);

    processLoreTriggers(storyData, mockAddNotification);

    expect(storyData.lore[0].on).toBe(true);
    // Notification removed - granular lore notifications no longer shown
  });

  it("should deactivate lore when off_triggers match content", () => {
    const lore: StoryLore[] = [
      {
        ...baseLore,
        title: "Lore 4",
        content: "Content 4",
        off_triggers: ["keyword2"],
        on: true,
      },
    ];
    const storyData = createMockStoryData(lore);

    processLoreTriggers(storyData, mockAddNotification);

    expect(storyData.lore[0].on).toBe(false);
    // Notification removed - granular lore notifications no longer shown
  });

  it("should respect manual disable (enabled: false)", () => {
    const lore: StoryLore[] = [
      {
        ...baseLore,
        title: "Lore 6",
        content: "Content 6",
        on_triggers: ["keyword1"],
        enabled: false,
        on: false,
      },
    ];
    const storyData = createMockStoryData(lore);

    processLoreTriggers(storyData, mockAddNotification);

    expect(storyData.lore[0].on).toBe(false);
  });

  it("should respect alwaysOn", () => {
    const lore: StoryLore[] = [
      {
        ...baseLore,
        title: "Lore 7",
        content: "Content 7",
        off_triggers: ["keyword1"],
        alwaysOn: true,
        on: false,
      },
    ];
    const storyData = createMockStoryData(lore);

    processLoreTriggers(storyData, mockAddNotification);

    expect(storyData.lore[0].on).toBe(true);
  });

  it("should handle cross-lore triggers (trigger_lores)", () => {
    const lore: StoryLore[] = [
      {
        ...baseLore,
        title: "Parent Lore",
        content: "Parent",
        on: true,
      },
      {
        ...baseLore,
        title: "Child Lore",
        content: "Child",
        trigger_lores: ["Parent Lore"],
        on: false,
      },
    ];
    const storyData = createMockStoryData(lore);

    processLoreTriggers(storyData, mockAddNotification);

    expect(storyData.lore[1].on).toBe(true);
  });

  it("should handle cross-lore suppression (untrigger_lores)", () => {
    const lore: StoryLore[] = [
      {
        ...baseLore,
        title: "Killer Lore",
        content: "Killer",
        on: true,
      },
      {
        ...baseLore,
        title: "Victim Lore",
        content: "Victim",
        untrigger_lores: ["Killer Lore"],
        on: true,
      },
    ];
    const storyData = createMockStoryData(lore);

    processLoreTriggers(storyData, mockAddNotification);

    expect(storyData.lore[1].on).toBe(false);
  });
});
