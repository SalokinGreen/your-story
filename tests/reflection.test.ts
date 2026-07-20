import { describe, it, expect, vi, afterEach } from "vitest";
import {
  planReflection,
  applyReflection,
  ensureStoryReflected,
  ReflectionPlan,
} from "../app/misc/reflection";
import { StoryData, MemoryEntry } from "../app/misc/structs";

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

function memoryEntry(overrides: Partial<MemoryEntry> = {}): MemoryEntry {
  return {
    content: "Something happened.",
    ...overrides,
  };
}

describe("planReflection", () => {
  it("returns null when there is no new memory since the last pass", () => {
    const storyData = createMockStoryData({ memory: [] });
    expect(planReflection(storyData)).toBeNull();
  });

  it("returns null when cumulative importance hasn't crossed the threshold", () => {
    const storyData = createMockStoryData({
      memory: [
        memoryEntry({ content: "A minor detail.", importance: 2 }),
        memoryEntry({ content: "Another minor detail.", importance: 3 }),
      ],
    });
    expect(planReflection(storyData)).toBeNull();
  });

  it("returns a plan once cumulative importance crosses the threshold", () => {
    const storyData = createMockStoryData({
      memory: [
        memoryEntry({ content: "The player betrayed Marcus.", importance: 9 }),
        memoryEntry({ content: "The player betrayed the guild too.", importance: 9 }),
        memoryEntry({ content: "The player lied to the king.", importance: 9 }),
        memoryEntry({ content: "The player broke another promise.", importance: 9 }),
      ],
    });
    const plan = planReflection(storyData);
    expect(plan).not.toBeNull();
    expect(plan?.cutoffIndex).toBe(4);
    expect(plan?.sourceEntries).toHaveLength(4);
  });

  it("treats memories with no self-rated importance as a moderate default", () => {
    // 6 memories x default importance 5 = 30, exactly at the threshold.
    const storyData = createMockStoryData({
      memory: Array.from({ length: 6 }, (_, i) =>
        memoryEntry({ content: `Event ${i}` })
      ),
    });
    expect(planReflection(storyData)).not.toBeNull();
  });

  it("only considers memory added since memoryReflectedThroughIndex", () => {
    const storyData = createMockStoryData({
      memory: [
        memoryEntry({ content: "Already reflected on.", importance: 10 }),
        memoryEntry({ content: "Also already reflected on.", importance: 10 }),
        memoryEntry({ content: "New, but not enough on its own.", importance: 5 }),
      ],
      memoryReflectedThroughIndex: 2,
    });
    // Only the one new low-importance entry remains - below threshold.
    expect(planReflection(storyData)).toBeNull();
  });

  it("supports legacy string-format memory entries", () => {
    const storyData = createMockStoryData({
      memory: [
        "A plain legacy memory string.",
        "Another plain legacy memory string.",
        "Yet another one.",
        "And one more for good measure.",
        "And another to be sure.",
        "The sixth to cross the default-importance threshold.",
      ],
    });
    const plan = planReflection(storyData);
    expect(plan).not.toBeNull();
    expect(plan?.sourceEntries[0].content).toBe("A plain legacy memory string.");
  });
});

describe("applyReflection", () => {
  function plan(sourceEntries: MemoryEntry[] = []): ReflectionPlan {
    return { cutoffIndex: sourceEntries.length, sourceEntries };
  }

  it("appends each insight as a new high-importance memory entry", () => {
    const storyData = createMockStoryData({
      memory: [memoryEntry({ content: "Some prior memory." })],
      scene: { parts: [{ content: "part 1" } as StoryData["scene"]["parts"][0]] },
    });

    applyReflection(storyData, plan(), [
      "The player consistently prefers negotiation over combat.",
      "Marcus's betrayal has left the player distrustful of authority.",
    ]);

    expect(storyData.memory).toHaveLength(3);
    const insight1 = storyData.memory[1] as MemoryEntry;
    expect(insight1.content).toBe(
      "The player consistently prefers negotiation over combat."
    );
    expect(insight1.isReflection).toBe(true);
    expect(insight1.importance).toBe(8);
    expect(insight1.sceneIndex).toBe(1);
  });

  it("sets memoryReflectedThroughIndex to the plan's cutoff even with zero insights", () => {
    const storyData = createMockStoryData({
      memory: [memoryEntry(), memoryEntry()],
    });
    applyReflection(storyData, plan([memoryEntry(), memoryEntry()]), []);
    expect(storyData.memoryReflectedThroughIndex).toBe(2);
    expect(storyData.memory).toHaveLength(2);
  });

  it("caps insights at the max-per-pass limit", () => {
    const storyData = createMockStoryData({ memory: [] });
    applyReflection(storyData, plan(), [
      "Insight one.",
      "Insight two.",
      "Insight three.",
      "Insight four - should be dropped.",
    ]);
    expect(storyData.memory).toHaveLength(3);
  });

  it("skips blank insight lines", () => {
    const storyData = createMockStoryData({ memory: [] });
    applyReflection(storyData, plan(), ["Real insight.", "   ", ""]);
    expect(storyData.memory).toHaveLength(1);
  });
});

describe("ensureStoryReflected", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  function highImportanceMemories(): MemoryEntry[] {
    return [
      memoryEntry({ content: "The player negotiated with the guard.", importance: 9 }),
      memoryEntry({ content: "The player negotiated with the merchant.", importance: 9 }),
      memoryEntry({ content: "The player negotiated with the bandit chief.", importance: 9 }),
      memoryEntry({ content: "The player negotiated their way past the sentry.", importance: 9 }),
    ];
  }

  it("is a no-op when reflection isn't due yet", async () => {
    const storyData = createMockStoryData({
      memory: [memoryEntry({ content: "Minor event.", importance: 1 })],
    });
    const fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await ensureStoryReflected(storyData, {
      model: "test-model",
      token: "tok",
    });

    expect(result.ran).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("synthesizes and applies insights when reflection is due", async () => {
    const storyData = createMockStoryData({ memory: highImportanceMemories() });

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        content:
          "The player consistently prefers negotiation over combat.\nThe player is skilled at reading social situations.",
      }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await ensureStoryReflected(storyData, {
      model: "test-model",
      token: "tok",
    });

    expect(result.ran).toBe(true);
    expect(result.insights).toHaveLength(2);
    expect(storyData.memory).toHaveLength(6);
    expect(storyData.memoryReflectedThroughIndex).toBe(4);
    expect(
      (storyData.memory[4] as MemoryEntry).content
    ).toBe("The player consistently prefers negotiation over combat.");
  });

  it("strips leading bullet/numbering markers from synthesized lines", async () => {
    const storyData = createMockStoryData({ memory: highImportanceMemories() });

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        content: "- The player values loyalty.\n1. The player fears betrayal.",
      }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await ensureStoryReflected(storyData, {
      model: "test-model",
      token: "tok",
    });

    expect(result.insights).toEqual([
      "The player values loyalty.",
      "The player fears betrayal.",
    ]);
  });

  it("is non-fatal when the API call fails", async () => {
    const storyData = createMockStoryData({ memory: highImportanceMemories() });
    const fetchMock = vi.fn().mockResolvedValue({ ok: false });
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await ensureStoryReflected(storyData, {
      model: "test-model",
      token: "tok",
    });

    expect(result.ran).toBe(false);
    expect(storyData.memory).toHaveLength(4);
    expect(storyData.memoryReflectedThroughIndex).toBeUndefined();
  });
});
