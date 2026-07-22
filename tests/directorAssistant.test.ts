/**
 * Director-layer spotlight tracking: runDirectorAssistant judges which
 * active threads/NPCs meaningfully got the spotlight in a completed turn and
 * updates storyData.directorAssistant's neglect ledger accordingly. Same
 * fetch("/api/generate") mocking pattern as memoryAgent.test.ts.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { runDirectorAssistant } from "../app/misc/directorAssistant";
import { StoryData, NPC, StoryThread } from "../app/misc/structs";

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
    lore: [],
    memory: [],
    npcs: [],
    threads: [],
    ...overrides,
  } as StoryData;
}

function npc(overrides: Partial<NPC> = {}): NPC {
  return {
    id: "npc-1",
    name: "Marcus",
    description: "A merchant",
    role: "Merchant",
    status: "alive",
    relationship: "Stranger",
    attitude: "neutral",
    createdAt: Date.now(),
    ...overrides,
  };
}

function thread(overrides: Partial<StoryThread> = {}): StoryThread {
  return {
    id: "thread-1",
    title: "The Missing Artifact",
    description: "Someone stole the artifact",
    status: "active",
    createdAt: Date.now(),
    ...overrides,
  };
}

describe("runDirectorAssistant", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("is a no-op without calling the API when there are no active threads or alive NPCs", async () => {
    const storyData = createMockStoryData();
    const fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await runDirectorAssistant(storyData, "Something happens.", "Look around", {
      model: "test-model",
      token: "tok",
    });

    expect(result.ran).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(storyData.directorAssistant).toBeUndefined();
  });

  it("is a no-op without calling the API for empty narration, even with active threads", async () => {
    const storyData = createMockStoryData({ threads: [thread()] });
    const fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await runDirectorAssistant(storyData, "", "Look around", {
      model: "test-model",
      token: "tok",
    });

    expect(result.ran).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("ignores resolved/abandoned threads and dead/departed NPCs entirely", async () => {
    const storyData = createMockStoryData({
      threads: [thread({ id: "t1", status: "resolved" })],
      npcs: [npc({ name: "Ghost", status: "dead" })],
    });
    const fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await runDirectorAssistant(storyData, "Something happens.", "Look around", {
      model: "test-model",
      token: "tok",
    });

    expect(result.ran).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("increments neglect for every active thread/NPC, resetting whichever the model flagged", async () => {
    const storyData = createMockStoryData({
      threads: [
        thread({ id: "t1", title: "The Missing Artifact" }),
        thread({ id: "t2", title: "The Duke's Debt" }),
      ],
      npcs: [npc({ name: "Marcus" }), npc({ name: "Elira" })],
    });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        content: JSON.stringify({ threads: ["The Missing Artifact"], npcs: ["Elira"] }),
      }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await runDirectorAssistant(
      storyData,
      "You find a clue about the missing artifact while Elira looks on.",
      "Search the room",
      { model: "test-model", token: "tok" },
    );

    expect(result.ran).toBe(true);
    expect(result.spotlightedThreadIds).toEqual(["t1"]);
    expect(result.spotlightedNpcNames).toEqual(["Elira"]);
    expect(storyData.directorAssistant?.threadSpotlight).toEqual({ t1: 0, t2: 1 });
    expect(storyData.directorAssistant?.npcSpotlight).toEqual({ Marcus: 1, Elira: 0 });
  });

  it("accumulates neglect across repeated calls for a thread that never gets flagged", async () => {
    const storyData = createMockStoryData({
      threads: [thread({ id: "t1", title: "The Missing Artifact" })],
    });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ content: JSON.stringify({ threads: [], npcs: [] }) }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    await runDirectorAssistant(storyData, "Turn one.", "Do something", {
      model: "test-model",
      token: "tok",
    });
    await runDirectorAssistant(storyData, "Turn two.", "Do something else", {
      model: "test-model",
      token: "tok",
    });

    expect(storyData.directorAssistant?.threadSpotlight).toEqual({ t1: 2 });
  });

  it("matches the model's returned title/name case-insensitively", async () => {
    const storyData = createMockStoryData({
      threads: [thread({ id: "t1", title: "The Missing Artifact" })],
    });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        content: JSON.stringify({ threads: ["  the missing artifact  "], npcs: [] }),
      }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await runDirectorAssistant(storyData, "...", "...", {
      model: "test-model",
      token: "tok",
    });

    expect(result.spotlightedThreadIds).toEqual(["t1"]);
    expect(storyData.directorAssistant?.threadSpotlight).toEqual({ t1: 0 });
  });

  it("parses a response wrapped in a markdown code fence", async () => {
    const storyData = createMockStoryData({
      threads: [thread({ id: "t1", title: "The Missing Artifact" })],
    });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        content: '```json\n{"threads": ["The Missing Artifact"], "npcs": []}\n```',
      }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await runDirectorAssistant(storyData, "...", "...", {
      model: "test-model",
      token: "tok",
    });

    expect(result.spotlightedThreadIds).toEqual(["t1"]);
  });

  it("fails open (ran: false, ledger untouched) when the API call errors", async () => {
    const storyData = createMockStoryData({
      threads: [thread({ id: "t1" })],
    });
    const fetchMock = vi.fn().mockRejectedValue(new Error("network down"));
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await runDirectorAssistant(storyData, "Something happens.", "Do it", {
      model: "test-model",
      token: "tok",
    });

    expect(result.ran).toBe(false);
    expect(storyData.directorAssistant).toBeUndefined();
  });

  it("fails open when the API response isn't ok", async () => {
    const storyData = createMockStoryData({ threads: [thread({ id: "t1" })] });
    const fetchMock = vi.fn().mockResolvedValue({ ok: false });
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await runDirectorAssistant(storyData, "Something happens.", "Do it", {
      model: "test-model",
      token: "tok",
    });

    expect(result.ran).toBe(false);
  });

  it("fails open when the response isn't valid JSON", async () => {
    const storyData = createMockStoryData({ threads: [thread({ id: "t1" })] });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ content: "not json at all" }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await runDirectorAssistant(storyData, "Something happens.", "Do it", {
      model: "test-model",
      token: "tok",
    });

    expect(result.ran).toBe(false);
    expect(storyData.directorAssistant).toBeUndefined();
  });
});
