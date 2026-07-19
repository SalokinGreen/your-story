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
});
