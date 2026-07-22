/**
 * formatMemorySection (Frontier 2, item 1 - see
 * docs/architecture-frontier.md): the GM/Choices stage prompts used to show
 * only a bare memory count ("use search_memory to find specific facts"), so
 * a reflection.ts insight the app already spent an API call synthesizing
 * could go unseen for the rest of the campaign if the model never happened
 * to search for the right query. This guarantee-surfaces the most recent
 * reflection entries unconditionally, same treatment character_sheet lore
 * already gets.
 */
import { describe, it, expect } from "vitest";
import { formatMemorySection, buildGMStagePrompt } from "@/app/misc/ai_staged";
import type { StoryData, MemoryEntry } from "@/app/misc/structs";

function memoryEntry(overrides: Partial<MemoryEntry> = {}): MemoryEntry {
  return { content: "Something happened.", ...overrides };
}

describe("formatMemorySection", () => {
  it("returns an empty string when there is no memory", () => {
    expect(formatMemorySection([])).toBe("");
    expect(formatMemorySection(undefined)).toBe("");
  });

  it("shows just the count when there are no reflection entries", () => {
    const section = formatMemorySection([
      memoryEntry({ content: "A plain fact." }),
      "A legacy string memory",
    ]);
    expect(section).toContain("2 entries");
    expect(section).not.toContain("Key insights");
  });

  it("surfaces reflection entries unconditionally", () => {
    const section = formatMemorySection([
      memoryEntry({ content: "A plain fact." }),
      memoryEntry({
        content: "The player consistently prefers negotiation over combat.",
        isReflection: true,
      }),
    ]);
    expect(section).toContain("Key insights");
    expect(section).toContain(
      "The player consistently prefers negotiation over combat.",
    );
  });

  it("caps surfaced reflections at the most recent MAX_SURFACED_REFLECTIONS", () => {
    const reflections = Array.from({ length: 6 }, (_, i) =>
      memoryEntry({ content: `Insight ${i}`, isReflection: true }),
    );
    const section = formatMemorySection(reflections);
    const insightLines = section
      .split("\n")
      .filter((line) => line.startsWith("- Insight"));
    expect(insightLines).toHaveLength(3);
    // Most recent (last-added) insights, not the oldest.
    expect(section).toContain("Insight 5");
    expect(section).toContain("Insight 3");
    expect(section).not.toContain("Insight 0");
  });

  it("supports legacy string-format memory entries mixed with reflections", () => {
    const section = formatMemorySection([
      "A legacy memory string",
      memoryEntry({ content: "A synthesized insight", isReflection: true }),
    ]);
    expect(section).toContain("2 entries");
    expect(section).toContain("A synthesized insight");
  });
});

describe("buildGMStagePrompt surfaces reflection insights", () => {
  function createTestStory(overrides: Partial<StoryData> = {}): StoryData {
    return {
      story_name: "Test Story",
      premise: "Test premise",
      player_name: "Test Player",
      player_summary: "Test summary",
      intro: "Test intro",
      points: 0,
      earnedPointsFromQuests: [],
      earnedPointsFromChapters: [],
      currentChapter: 0,
      max_chapters: 10,
      scene: { parts: [] },
      chapters: [],
      quests: [],
      stats: [],
      resources: [],
      inventory: [],
      achievements: [],
      lore: [],
      memory: [],
      momentum: 0,
      maxMomentum: 10,
      relationships: [],
      rpgSystem: "3d6",
      abilities: [],
      level: 1,
      upgradesSpent: 0,
      conditions: [],
      npcs: [],
      ...overrides,
    } as StoryData;
  }

  it("includes a reflection insight in the live GM-stage prompt", () => {
    const storyData = createTestStory({
      memory: [
        memoryEntry({
          content: "Marcus no longer trusts the player after the warehouse incident.",
          isReflection: true,
        }),
      ],
    });

    const { messages } = buildGMStagePrompt({
      storyData,
      userChoice: "Ask Marcus for help",
    });

    // The dynamic state block (lore/mechanics/memory) is its own "user"
    // message, separate from the fixed system prompt - see ai_staged.ts's
    // "Add state as a separate user message (keeps system prompt lean)".
    const allContent = messages.map((m) => m.content || "").join("\n");
    expect(allContent).toContain(
      "Marcus no longer trusts the player after the warehouse incident.",
    );
  });
});
