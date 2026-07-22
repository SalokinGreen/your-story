/**
 * Layer 4 hardening: runMemoryAgent decides what from a completed turn is
 * worth persisting to storyData.memory - taking that judgment off the GM's
 * own tool-calling loop (add_memory is no longer in its live tool set, see
 * ai_staged.ts's stateToolNames). Same fetch("/api/generate") pattern as
 * reflection.test.ts mocks callReflectionApi's fetch call.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { runMemoryAgent } from "../app/misc/memoryAgent";
import { StoryData, NPC, MemoryEntry } from "../app/misc/structs";

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
    memory: [],
    npcs: [],
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

describe("runMemoryAgent", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("is a no-op for empty narration without calling the API", async () => {
    const storyData = createMockStoryData();
    const fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await runMemoryAgent(storyData, "", "I look around", {
      model: "test-model",
      token: "tok",
    });

    expect(result.ran).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(storyData.memory).toHaveLength(0);
  });

  it("appends candidate memories with clamped importance", async () => {
    const storyData = createMockStoryData();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        content: JSON.stringify([
          { content: "Owes the blacksmith 50 gold", importance: 7 },
          { content: "Vault password: MOONRISE", importance: 15 }, // out of range
        ]),
      }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await runMemoryAgent(
      storyData,
      "The blacksmith agrees to the loan, and whispers the vault code.",
      "Ask the blacksmith for a loan",
      { model: "test-model", token: "tok" },
    );

    expect(result.ran).toBe(true);
    expect(result.entriesAdded).toBe(2);
    expect(storyData.memory).toHaveLength(2);
    const entries = storyData.memory as MemoryEntry[];
    expect(entries[0].content).toBe("Owes the blacksmith 50 gold");
    expect(entries[0].importance).toBe(7);
    expect(entries[1].importance).toBe(10); // clamped from 15
    expect(entries[0].embedded).toBe(false);
  });

  it("caps entries at MAX_ENTRIES_PER_TURN even if the model returns more", async () => {
    const storyData = createMockStoryData();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        content: JSON.stringify([
          { content: "Fact one" },
          { content: "Fact two" },
          { content: "Fact three" },
          { content: "Fact four - should be dropped" },
        ]),
      }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await runMemoryAgent(storyData, "A busy turn.", "Do a lot", {
      model: "test-model",
      token: "tok",
    });

    expect(result.entriesAdded).toBe(3);
    expect(storyData.memory).toHaveLength(3);
  });

  it("returns ran: true with zero entries when nothing is worth remembering", async () => {
    const storyData = createMockStoryData();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ content: "[]" }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await runMemoryAgent(
      storyData,
      "You walk down the corridor. Nothing happens.",
      "Walk down the corridor",
      { model: "test-model", token: "tok" },
    );

    expect(result.ran).toBe(true);
    expect(result.entriesAdded).toBe(0);
    expect(storyData.memory).toHaveLength(0);
  });

  it("tags entityIds by matching tracked NPC names, same as the old add_memory handler", async () => {
    const storyData = createMockStoryData({ npcs: [npc({ name: "Marcus" })] });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        content: JSON.stringify([
          { content: "Marcus is secretly working for the thieves' guild", importance: 8 },
        ]),
      }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    await runMemoryAgent(storyData, "...", "...", {
      model: "test-model",
      token: "tok",
    });

    const entry = storyData.memory[0] as MemoryEntry;
    expect(entry.entityIds).toEqual(["Marcus"]);
  });

  it("parses a response wrapped in a markdown code fence", async () => {
    const storyData = createMockStoryData();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        content: '```json\n[{"content": "Deadline: reach the temple by dawn", "importance": 8}]\n```',
      }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await runMemoryAgent(storyData, "...", "...", {
      model: "test-model",
      token: "tok",
    });

    expect(result.entriesAdded).toBe(1);
    expect(storyData.memory[0]).toMatchObject({
      content: "Deadline: reach the temple by dawn",
    });
  });

  it("fails open (no entries, ran: false) when the API call errors", async () => {
    const storyData = createMockStoryData();
    const fetchMock = vi.fn().mockRejectedValue(new Error("network down"));
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await runMemoryAgent(storyData, "Something happens.", "Do it", {
      model: "test-model",
      token: "tok",
    });

    expect(result.ran).toBe(false);
    expect(storyData.memory).toHaveLength(0);
  });

  it("fails open when the API response isn't ok", async () => {
    const storyData = createMockStoryData();
    const fetchMock = vi.fn().mockResolvedValue({ ok: false });
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await runMemoryAgent(storyData, "Something happens.", "Do it", {
      model: "test-model",
      token: "tok",
    });

    expect(result.ran).toBe(false);
  });

  it("skips a candidate with an empty content string", async () => {
    const storyData = createMockStoryData();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        content: JSON.stringify([{ content: "   " }, { content: "A real fact" }]),
      }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await runMemoryAgent(storyData, "...", "...", {
      model: "test-model",
      token: "tok",
    });

    expect(result.entriesAdded).toBe(1);
    expect(storyData.memory[0]).toMatchObject({ content: "A real fact" });
  });
});
