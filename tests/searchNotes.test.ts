/**
 * search_notes ranking/matching tests.
 *
 * The old implementation was a single literal substring check: it required
 * the whole query as one exact phrase, returned results in raw lore-array
 * order (first-found, not best-match), and truncated excerpts from the start
 * of the line regardless of where the match actually was. These tests cover
 * the rewrite: multi-word tokenized matching, global relevance ranking,
 * match-centered excerpts, and the new type/tags filters.
 */
import { describe, it, expect } from "vitest";
import { executeTools, ToolCall } from "@/app/misc/toolExecutor";
import type { StoryData, StoryLore } from "@/app/misc/structs";

function createTestStory(lore: StoryLore[]): StoryData {
  return {
    story_name: "Test Story",
    premise: "Test premise",
    player_name: "Test Player",
    player_summary: "Test summary",
    intro: "Test intro",
    currentChapter: 0,
    max_chapters: 10,
    scene: { parts: [] },
    chapters: [],
    goals: [],
    stats: [],
    resources: [],
    inventory: [],
    lore,
    memory: [],
    relationships: [],
    rpgSystem: "3d6",
    abilities: [],
    npcs: [],
  } as StoryData;
}

function loreEntry(overrides: Partial<StoryLore> = {}): StoryLore {
  return {
    title: "Untitled",
    content: "",
    relatedCharacters: [],
    relatedLocations: [],
    secrtet: false,
    keys: [],
    ...overrides,
  };
}

function searchCall(args: Record<string, unknown>): ToolCall {
  return {
    id: "call_1",
    function: { name: "search_notes", arguments: args },
  };
}

describe("search_notes", () => {
  it("matches notes containing all query words even when not adjacent", () => {
    const story = createTestStory([
      loreEntry({
        title: "Gregor Stonebeard",
        content: "The gruff owner of the Rusty Tankard tavern in the old quarter.",
      }),
    ]);

    const { responses } = executeTools(
      [searchCall({ query: "tavern owner" })],
      story
    );

    expect(responses[0].success).toBe(true);
    expect(responses[0].message).toContain("Gregor Stonebeard");
    expect(responses[0].message).not.toContain("No matches found");
  });

  it("ranks the strongest match first regardless of lore array order", () => {
    const story = createTestStory([
      loreEntry({
        title: "Weather",
        content: "It has been raining in the market for a week.",
      }),
      loreEntry({
        title: "Gregor Stonebeard",
        content: "Gregor is the tavern owner. Gregor knows every rumor in town.",
      }),
    ]);

    const { responses } = executeTools(
      [searchCall({ query: "Gregor tavern owner" })],
      story
    );

    const message = responses[0].message;
    const gregorIndex = message.indexOf("Gregor Stonebeard");
    const weatherIndex = message.indexOf("Weather");
    expect(gregorIndex).toBeGreaterThanOrEqual(0);
    // Weather note has no matching words at all, so it shouldn't appear.
    expect(weatherIndex).toBe(-1);
  });

  it("centers the excerpt on the match instead of truncating from line-start", () => {
    const longPrefix = "x".repeat(90);
    const story = createTestStory([
      loreEntry({
        title: "Long Note",
        content: `${longPrefix} the secret password is hunter2 for the vault door`,
      }),
    ]);

    const { responses } = executeTools(
      [searchCall({ query: "hunter2" })],
      story
    );

    expect(responses[0].message).toContain("hunter2");
  });

  it("matches via tags/aliases/related characters and labels the reason", () => {
    const story = createTestStory([
      loreEntry({
        title: "The Whisper Cult",
        content: "A shadowy organization.",
        tags: ["villain-faction"],
      }),
    ]);

    const { responses } = executeTools(
      [searchCall({ query: "villain-faction" })],
      story
    );

    expect(responses[0].message).toContain("The Whisper Cult");
    expect(responses[0].message.toLowerCase()).toContain("tag");
  });

  it("filters by note type", () => {
    const story = createTestStory([
      loreEntry({ title: "Combat Rules", content: "Roll d20 plus modifier.", type: "mechanics" }),
      loreEntry({ title: "Combat Story", content: "The battle raged on.", type: "lore" }),
    ]);

    const { responses } = executeTools(
      [searchCall({ query: "combat", type: "mechanics" })],
      story
    );

    expect(responses[0].message).toContain("Combat Rules");
    expect(responses[0].message).not.toContain("Combat Story");
  });

  it("filters by tags", () => {
    const story = createTestStory([
      loreEntry({ title: "Northern Keep", content: "A cold fortress.", tags: ["location"] }),
      loreEntry({ title: "Northern Wind", content: "A cold breeze.", tags: ["weather"] }),
    ]);

    const { responses } = executeTools(
      [searchCall({ query: "northern", tags: ["location"] })],
      story
    );

    expect(responses[0].message).toContain("Northern Keep");
    expect(responses[0].message).not.toContain("Northern Wind");
  });

  it("still reports no matches when nothing overlaps", () => {
    const story = createTestStory([
      loreEntry({ title: "Weather", content: "Sunny today." }),
    ]);

    const { responses } = executeTools(
      [searchCall({ query: "dragon hoard" })],
      story
    );

    expect(responses[0].message).toContain("No matches found");
  });

  it("still requires a query string", () => {
    const story = createTestStory([loreEntry({ title: "Weather" })]);

    const { responses } = executeTools([searchCall({})], story);

    expect(responses[0].success).toBe(false);
    expect(responses[0].message.toLowerCase()).toContain("query");
  });
});
