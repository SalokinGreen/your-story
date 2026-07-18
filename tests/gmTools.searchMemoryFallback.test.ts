import { describe, it, expect, vi, beforeEach } from "vitest";
import { executeGMTools } from "@/app/misc/gmExecutor";
import { StoryData } from "@/app/misc/structs";
import { searchRelevantContext } from "@/app/misc/embeddings";

vi.mock("@/app/misc/embeddings", () => ({
  searchRelevantContext: vi.fn(),
}));

const mockedSearch = vi.mocked(searchRelevantContext);

function createMockStoryData(overrides: Partial<StoryData> = {}): StoryData {
  return {
    story_name: "Test Story",
    player_name: "Hero",
    premise: "A test adventure",
    scene: { parts: [] },
    stats: [],
    resources: [],
    inventory: [],
    abilities: [],
    achievements: [],
    lore: [],
    memory: [{ content: "Met Gregor Stonebeard, the tavern keeper.", embedded: true }],
    ...overrides,
  } as StoryData;
}

function createToolCall(name: string, args: Record<string, unknown>) {
  return {
    id: `test_${Date.now()}`,
    function: { name, arguments: JSON.stringify(args) },
  };
}

describe("search_memory semantic fallback (via executeGMTools)", () => {
  beforeEach(() => {
    mockedSearch.mockReset();
  });

  it("does not call semantic search when the literal match succeeds", async () => {
    const storyData = createMockStoryData();
    const toolCall = createToolCall("search_memory", { patterns: ["Gregor"] });

    const result = await executeGMTools([toolCall], storyData, {
      enabled: true,
      storyId: "s1",
      token: "t1",
    });

    expect(result.results[0].success).toBe(true);
    expect(mockedSearch).not.toHaveBeenCalled();
  });

  it("falls back to semantic search when the literal match finds nothing, if enabled", async () => {
    mockedSearch.mockResolvedValue({
      lore: [],
      memories: [
        {
          entry_type: "memory",
          entry_key: "mem_0",
          content: "Met Gregor Stonebeard, the tavern keeper.",
          similarity: 0.8,
          importance: 5,
        },
      ],
      totalResults: 1,
    });

    const storyData = createMockStoryData();
    const toolCall = createToolCall("search_memory", { patterns: ["tavern owner"] });

    const result = await executeGMTools([toolCall], storyData, {
      enabled: true,
      storyId: "s1",
      token: "t1",
    });

    expect(mockedSearch).toHaveBeenCalledTimes(1);
    expect(result.results[0].success).toBe(true);
    expect(result.results[0].contextForStory).toContain("semantically related");
    expect(result.results[0].contextForStory).toContain("Gregor");
  });

  it("does not attempt semantic search when not enabled (default behavior unchanged)", async () => {
    const storyData = createMockStoryData();
    const toolCall = createToolCall("search_memory", { patterns: ["tavern owner"] });

    // No semanticContext passed - defaults to {} (disabled)
    const result = await executeGMTools([toolCall], storyData);

    expect(mockedSearch).not.toHaveBeenCalled();
    expect(result.results[0].success).toBe(false);
    expect(result.results[0].contextForStory).toContain("No matching memories found");
  });

  it("reports plain 'no matches' when semantic search also finds nothing", async () => {
    mockedSearch.mockResolvedValue({ lore: [], memories: [], totalResults: 0 });

    const storyData = createMockStoryData();
    const toolCall = createToolCall("search_memory", { patterns: ["nonexistent thing"] });

    const result = await executeGMTools([toolCall], storyData, {
      enabled: true,
      storyId: "s1",
      token: "t1",
    });

    expect(result.results[0].success).toBe(false);
    expect(result.results[0].contextForStory).toContain("No matching memories found");
  });
});
