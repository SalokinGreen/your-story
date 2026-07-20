import { describe, it, expect, vi, beforeEach } from "vitest";
import { semanticSearchFallback } from "../app/misc/semanticSearchFallback";
import { searchRelevantContext } from "../app/misc/embeddings";

vi.mock("../app/misc/embeddings", () => ({
  searchRelevantContext: vi.fn(),
}));

const mockedSearch = vi.mocked(searchRelevantContext);

describe("semanticSearchFallback", () => {
  beforeEach(() => {
    mockedSearch.mockReset();
  });

  it("reports not_configured when disabled", async () => {
    const result = await semanticSearchFallback("memory", "tavern owner", {
      enabled: false,
      storyId: "s1",
      token: "t1",
    });
    expect(result).toEqual({ status: "not_configured", matches: [] });
    expect(mockedSearch).not.toHaveBeenCalled();
  });

  it("reports not_configured when storyId or token is missing", async () => {
    expect(
      await semanticSearchFallback("memory", "tavern owner", { enabled: true, token: "t1" })
    ).toEqual({ status: "not_configured", matches: [] });
    expect(
      await semanticSearchFallback("memory", "tavern owner", { enabled: true, storyId: "s1" })
    ).toEqual({ status: "not_configured", matches: [] });
    expect(mockedSearch).not.toHaveBeenCalled();
  });

  it("reports not_configured for an empty query", async () => {
    const result = await semanticSearchFallback("memory", "   ", {
      enabled: true,
      storyId: "s1",
      token: "t1",
    });
    expect(result).toEqual({ status: "not_configured", matches: [] });
    expect(mockedSearch).not.toHaveBeenCalled();
  });

  it("maps memory search results", async () => {
    mockedSearch.mockResolvedValue({
      lore: [],
      memories: [
        {
          entry_type: "memory",
          entry_key: "mem_1",
          content: "Gregor the tavern keeper offered a room for the night.",
          similarity: 0.81,
          importance: 5,
        },
      ],
      totalResults: 1,
    });

    const result = await semanticSearchFallback("memory", "tavern owner", {
      enabled: true,
      storyId: "s1",
      token: "t1",
    });

    expect(result.status).toBe("ok");
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0].key).toBe("mem_1");
    expect(result.matches[0].content).toContain("Gregor");
    expect(mockedSearch).toHaveBeenCalledWith(
      "s1",
      "tavern owner",
      "t1",
      expect.objectContaining({ memoryLimit: 5, loreLimit: 0 })
    );
  });

  it("maps lore search results", async () => {
    mockedSearch.mockResolvedValue({
      lore: [
        {
          entry_type: "lore",
          entry_key: "Gregor Stonebeard",
          content: "Owns the Salty Anchor tavern.",
          similarity: 0.77,
          importance: 5,
        },
      ],
      memories: [],
      totalResults: 1,
    });

    const result = await semanticSearchFallback("lore", "tavern owner", {
      enabled: true,
      storyId: "s1",
      token: "t1",
    });

    expect(result.status).toBe("ok");
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0].key).toBe("Gregor Stonebeard");
    expect(mockedSearch).toHaveBeenCalledWith(
      "s1",
      "tavern owner",
      "t1",
      expect.objectContaining({ loreLimit: 5, memoryLimit: 0 })
    );
  });

  it("reports status: error (with a message) rather than an indistinguishable empty result", async () => {
    mockedSearch.mockRejectedValue(new Error("network down"));

    const result = await semanticSearchFallback("memory", "tavern owner", {
      enabled: true,
      storyId: "s1",
      token: "t1",
    });
    expect(result).toEqual({ status: "error", matches: [], message: "network down" });
  });

  it("returns matches: [] alongside status: ok when the search legitimately finds nothing", async () => {
    mockedSearch.mockResolvedValue({ lore: [], memories: [], totalResults: 0 });

    const result = await semanticSearchFallback("memory", "tavern owner", {
      enabled: true,
      storyId: "s1",
      token: "t1",
    });
    expect(result).toEqual({ status: "ok", matches: [] });
  });

  describe("reranking by recency/importance/entity-relevance (memoryEntries param)", () => {
    it("re-orders a lower-similarity but more recent/important match ahead of a stale one", async () => {
      mockedSearch.mockResolvedValue({
        lore: [],
        memories: [
          { entry_type: "memory", entry_key: "a", content: "Old debt to the blacksmith", similarity: 0.7, importance: 5 },
          { entry_type: "memory", entry_key: "b", content: "Fresh warning about the ambush", similarity: 0.65, importance: 5 },
        ],
        totalResults: 2,
      });

      const memoryEntries = [
        { content: "Old debt to the blacksmith", sceneIndex: 1, importance: 0 },
        { content: "Fresh warning about the ambush", sceneIndex: 20, importance: 10 },
      ];

      const result = await semanticSearchFallback(
        "memory",
        "what's going on",
        { enabled: true, storyId: "s1", token: "t1" },
        memoryEntries
      );

      expect(result.status).toBe("ok");
      // "Fresh warning" starts behind on raw similarity (0.65 < 0.7) but
      // should be reranked ahead once recency+importance are factored in.
      expect(result.matches[0].content).toContain("Fresh warning");
      expect(result.matches[1].content).toContain("Old debt");
    });

    it("boosts a match whose entityIds are mentioned in the query", async () => {
      mockedSearch.mockResolvedValue({
        lore: [],
        memories: [
          { entry_type: "memory", entry_key: "a", content: "General rumor about the town", similarity: 0.7, importance: 5 },
          { entry_type: "memory", entry_key: "b", content: "Aldric owes 50 gold", similarity: 0.68, importance: 5 },
        ],
        totalResults: 2,
      });

      const memoryEntries = [
        { content: "General rumor about the town", sceneIndex: 5 },
        { content: "Aldric owes 50 gold", sceneIndex: 5, entityIds: ["Aldric"] },
      ];

      const result = await semanticSearchFallback(
        "memory",
        "what does Aldric want",
        { enabled: true, storyId: "s1", token: "t1" },
        memoryEntries
      );

      expect(result.matches[0].content).toContain("Aldric owes");
    });

    it("does not rerank when memoryEntries is omitted (unchanged existing behavior)", async () => {
      mockedSearch.mockResolvedValue({
        lore: [],
        memories: [
          { entry_type: "memory", entry_key: "a", content: "First", similarity: 0.9, importance: 5 },
          { entry_type: "memory", entry_key: "b", content: "Second", similarity: 0.5, importance: 5 },
        ],
        totalResults: 2,
      });

      const result = await semanticSearchFallback("memory", "query", {
        enabled: true,
        storyId: "s1",
        token: "t1",
      });

      expect(result.matches.map((m) => m.content)).toEqual(["First", "Second"]);
    });

    it("does not rerank lore matches even if memoryEntries is passed", async () => {
      mockedSearch.mockResolvedValue({
        lore: [
          { entry_type: "lore", entry_key: "a", content: "First", similarity: 0.9, importance: 5 },
          { entry_type: "lore", entry_key: "b", content: "Second", similarity: 0.5, importance: 5 },
        ],
        memories: [],
        totalResults: 2,
      });

      const result = await semanticSearchFallback(
        "lore",
        "query",
        { enabled: true, storyId: "s1", token: "t1" },
        [{ content: "Second", sceneIndex: 100, importance: 10 }]
      );

      expect(result.matches.map((m) => m.content)).toEqual(["First", "Second"]);
    });
  });
});
