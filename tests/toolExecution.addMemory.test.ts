/**
 * add_memory now populates timestamp/sceneIndex/entityIds/importance on the
 * MemoryEntry it creates (structs.ts), not just content/embedded - a
 * lightweight version of Generative Agents' recency/importance/entity-
 * relevance memory scoring. entityIds is derived by exact-name-matching
 * against tracked NPCs/threads (reusing compaction.ts's countNameMentions),
 * not NLP-style extraction.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { executeTools, ToolCall } from "@/app/misc/toolExecutor";
import type { StoryData } from "@/app/misc/structs";

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
    npcs: [],
    threads: [],
    ...overrides,
  } as StoryData;
}

function addMemoryCall(args: Record<string, unknown>): ToolCall {
  return { type: "function", function: { name: "add_memory", arguments: args } };
}

describe("add_memory: memory structure fields", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("populates timestamp and sceneIndex", () => {
    vi.spyOn(Date, "now").mockReturnValue(1700000000000);
    const storyData = createTestStory({
      scene: { parts: [{ content: "a" }, { content: "b" }] as any },
    });

    executeTools([addMemoryCall({ entry: "Owes the blacksmith 50 gold" })], storyData);

    const entry = storyData.memory[0] as any;
    expect(entry.timestamp).toBe(1700000000000);
    expect(entry.sceneIndex).toBe(2);
  });

  it("derives entityIds from tracked NPCs mentioned in the entry", () => {
    const storyData = createTestStory({
      npcs: [
        {
          id: "n1",
          name: "Aldric",
          description: "",
          role: "Merchant",
          status: "alive",
          relationship: "Stranger",
          attitude: "neutral",
          createdAt: Date.now(),
        },
      ],
    });

    executeTools(
      [addMemoryCall({ entry: "Aldric promised a discount next visit" })],
      storyData
    );

    const entry = storyData.memory[0] as any;
    expect(entry.entityIds).toEqual(["Aldric"]);
  });

  it("derives entityIds from tracked threads mentioned in the entry", () => {
    const storyData = createTestStory({
      threads: [
        {
          id: "t1",
          title: "The Missing Heir",
          description: "",
          status: "active",
          createdAt: Date.now(),
        },
      ],
    });

    executeTools(
      [addMemoryCall({ entry: "New clue points to The Missing Heir thread" })],
      storyData
    );

    const entry = storyData.memory[0] as any;
    expect(entry.entityIds).toEqual(["The Missing Heir"]);
  });

  it("leaves entityIds undefined when nothing tracked is mentioned", () => {
    const storyData = createTestStory({
      npcs: [
        {
          id: "n1",
          name: "Aldric",
          description: "",
          role: "Merchant",
          status: "alive",
          relationship: "Stranger",
          attitude: "neutral",
          createdAt: Date.now(),
        },
      ],
    });

    executeTools([addMemoryCall({ entry: "The password is MOONRISE" })], storyData);

    const entry = storyData.memory[0] as any;
    expect(entry.entityIds).toBeUndefined();
  });

  it("stores a valid importance value", () => {
    const storyData = createTestStory();
    executeTools([addMemoryCall({ entry: "Critical deadline", importance: 9 })], storyData);
    expect((storyData.memory[0] as any).importance).toBe(9);
  });

  it("omits importance when not provided", () => {
    const storyData = createTestStory();
    executeTools([addMemoryCall({ entry: "Minor detail" })], storyData);
    expect((storyData.memory[0] as any).importance).toBeUndefined();
  });

  it("rejects an out-of-range importance at the schema validation layer", () => {
    const storyData = createTestStory();
    const { responses } = executeTools(
      [addMemoryCall({ entry: "Critical deadline", importance: 15 })],
      storyData
    );
    expect(responses[0].success).toBe(false);
    expect(storyData.memory).toHaveLength(0);
  });
});
