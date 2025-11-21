import { describe, it, expect } from "vitest";
import { storyDataToString } from "../app/misc/ai";
import { StoryData } from "../app/misc/structs";

describe("Plot Beat Context", () => {
  const createMockStoryData = (
    beats: Array<{ title: string; content: string; fulfilled: boolean }>
  ): StoryData => ({
    story_name: "Test Story",
    premise: "Test Premise",
    player_name: "Test Player",
    player_summary: "Test Summary",
    intro: "Starting content.",
    stats: [],
    resources: [],
    inventory: [],
    achievements: [],
    plot_beats: beats.map((beat) => ({
      title: beat.title,
      content: beat.content,
      fulfilled: beat.fulfilled,
      points: 10,
    })),
    lore: [],
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
    relationships: [],
    points: 0,
    momentum: 0,
    maxMomentum: 10,
    earnedPointsFromBeats: [],
    earnedPointsFromChapters: [],
    earnedPointsFromQuests: [],
  });

  it("should show only current beat when no beats are fulfilled", () => {
    const storyData = createMockStoryData([
      { title: "First Beat", content: "First beat content", fulfilled: false },
      {
        title: "Second Beat",
        content: "Second beat content",
        fulfilled: false,
      },
      { title: "Third Beat", content: "Third beat content", fulfilled: false },
    ]);

    const result = storyDataToString(storyData);

    expect(result).toContain("### Current Plot Beat");
    expect(result).toContain("1. First Beat");
    expect(result).toContain("First beat content");
    expect(result).not.toContain("### Previous Plot Beat");
  });

  it("should show previous beat when at least one beat is fulfilled", () => {
    const storyData = createMockStoryData([
      { title: "First Beat", content: "First beat content", fulfilled: true },
      {
        title: "Second Beat",
        content: "Second beat content",
        fulfilled: false,
      },
      { title: "Third Beat", content: "Third beat content", fulfilled: false },
    ]);

    const result = storyDataToString(storyData);

    expect(result).toContain("### Previous Plot Beat (Recently Completed)");
    expect(result).toContain("1. First Beat");
    expect(result).toContain("First beat content");
    expect(result).toContain("### Current Plot Beat");
    expect(result).toContain("2. Second Beat");
    expect(result).toContain("Second beat content");
  });

  it("should show correct previous and current when multiple beats are fulfilled", () => {
    const storyData = createMockStoryData([
      { title: "First Beat", content: "First beat content", fulfilled: true },
      { title: "Second Beat", content: "Second beat content", fulfilled: true },
      { title: "Third Beat", content: "Third beat content", fulfilled: false },
      {
        title: "Fourth Beat",
        content: "Fourth beat content",
        fulfilled: false,
      },
    ]);

    const result = storyDataToString(storyData);

    // Previous should be Second Beat (most recently completed)
    expect(result).toContain("### Previous Plot Beat (Recently Completed)");
    expect(result).toContain("2. Second Beat");
    expect(result).toContain("Second beat content");

    // Current should be Third Beat (first unfulfilled)
    expect(result).toContain("### Current Plot Beat");
    expect(result).toContain("3. Third Beat");
    expect(result).toContain("Third beat content");

    // First Beat should NOT appear (only most recent previous shown)
    const firstBeatMatches = result.match(/First Beat/g);
    expect(firstBeatMatches).toBeNull();
  });

  it("should show next beat after current", () => {
    const storyData = createMockStoryData([
      { title: "First Beat", content: "First beat content", fulfilled: false },
      {
        title: "Second Beat",
        content: "Second beat content",
        fulfilled: false,
      },
      { title: "Third Beat", content: "Third beat content", fulfilled: false },
    ]);

    const result = storyDataToString(storyData);

    expect(result).toContain("### Next Plot Beat");
    expect(result).toContain("2. Second Beat");
    expect(result).toContain("Second beat content");
  });

  it("should show future beats as titles only", () => {
    const storyData = createMockStoryData([
      { title: "First Beat", content: "First beat content", fulfilled: false },
      {
        title: "Second Beat",
        content: "Second beat content",
        fulfilled: false,
      },
      { title: "Third Beat", content: "Third beat content", fulfilled: false },
      {
        title: "Fourth Beat",
        content: "Fourth beat content",
        fulfilled: false,
      },
    ]);

    const result = storyDataToString(storyData);

    expect(result).toContain("### Future Plot Beats:");
    expect(result).toContain("- 3. Third Beat");
    expect(result).toContain("- 4. Fourth Beat");
    // Should NOT contain the full content of future beats
    expect(result).not.toContain("Third beat content");
    expect(result).not.toContain("Fourth beat content");
  });

  it("should handle all beats fulfilled", () => {
    const storyData = createMockStoryData([
      { title: "First Beat", content: "First beat content", fulfilled: true },
      { title: "Second Beat", content: "Second beat content", fulfilled: true },
      { title: "Third Beat", content: "Third beat content", fulfilled: true },
    ]);

    const result = storyDataToString(storyData);

    // When all beats are fulfilled, currentBeatIndex will be -1 (not found)
    // So there should be NO previous beat shown (since previous requires currentBeatIndex > 0)
    // And NO current beat (since currentBeatIndex === -1)
    expect(result).not.toContain("### Previous Plot Beat");
    expect(result).not.toContain("### Current Plot Beat");
  });

  it("should handle empty plot beats array", () => {
    const storyData = createMockStoryData([]);

    const result = storyDataToString(storyData);

    expect(result).toContain("## Plot Beats:");
    expect(result).not.toContain("### Previous Plot Beat");
    expect(result).not.toContain("### Current Plot Beat");
    expect(result).not.toContain("### Next Plot Beat");
  });

  it("should provide context for AI to reference recently completed objectives", () => {
    const storyData = createMockStoryData([
      {
        title: "Infiltrate the Castle",
        content: "Sneak into the enemy fortress and retrieve the documents",
        fulfilled: true,
      },
      {
        title: "Escape the City",
        content: "Make your way out of the city before the guards find you",
        fulfilled: false,
      },
    ]);

    const result = storyDataToString(storyData);

    // AI should see both the recently completed beat and the current objective
    expect(result).toContain("Infiltrate the Castle");
    expect(result).toContain("retrieve the documents");
    expect(result).toContain("Escape the City");
    expect(result).toContain("before the guards find you");

    // Verify proper labeling
    expect(result).toContain("Previous Plot Beat");
    expect(result).toContain("Infiltrate the Castle");
    expect(result).toContain("Current Plot Beat");
    expect(result).toContain("Escape the City");
  });
});
