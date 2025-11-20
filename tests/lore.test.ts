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
    plot_beats: [
      { title: "Beat 1", content: "Content 1", fulfilled: true },
      { title: "Beat 2", content: "Content 2", fulfilled: false },
    ],
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
    earnedPointsFromBeats: [],
    earnedPointsFromChapters: [],
    earnedPointsFromQuests: [],
    relationships: [],
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
    expect(mockAddNotification).toHaveBeenCalledWith(
      "📜 Lore discovered: Lore 1",
      "success"
    );
  });

  it("should activate lore when beats_trigger match fulfilled beats", () => {
    const lore: StoryLore[] = [
      {
        ...baseLore,
        title: "Lore 2",
        content: "Content 2",
        beats_trigger: [0], // Beat 1 is fulfilled
        on: false,
      },
    ];
    const storyData = createMockStoryData(lore);

    processLoreTriggers(storyData, mockAddNotification);

    expect(storyData.lore[0].on).toBe(true);
  });

  it("should NOT activate lore when beats_trigger match unfulfilled beats", () => {
    const lore: StoryLore[] = [
      {
        ...baseLore,
        title: "Lore 3",
        content: "Content 3",
        beats_trigger: [1], // Beat 2 is NOT fulfilled
        on: false,
      },
    ];
    const storyData = createMockStoryData(lore);

    processLoreTriggers(storyData, mockAddNotification);

    expect(storyData.lore[0].on).toBe(false);
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
    expect(mockAddNotification).toHaveBeenCalledWith(
      "📜 Lore hidden: Lore 4",
      "info"
    );
  });

  it("should deactivate lore when beats_untrigger match fulfilled beats", () => {
    const lore: StoryLore[] = [
      {
        ...baseLore,
        title: "Lore 5",
        content: "Content 5",
        beats_untrigger: [0], // Beat 1 is fulfilled
        on: true,
      },
    ];
    const storyData = createMockStoryData(lore);

    processLoreTriggers(storyData, mockAddNotification);

    expect(storyData.lore[0].on).toBe(false);
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
