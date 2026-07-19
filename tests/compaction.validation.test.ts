import { describe, it, expect, vi, afterEach } from "vitest";
import {
  validateCompactionSummary,
  applyCompaction,
  ensureStoryCompacted,
  CompactionPlan,
} from "../app/misc/compaction";
import { StoryData, NPC, InventoryItem, StoryLore } from "../app/misc/structs";

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

function npc(overrides: Partial<NPC>): NPC {
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

function item(overrides: Partial<InventoryItem>): InventoryItem {
  return {
    name: "Rusty Sword",
    quantity: 1,
    description: "An old blade",
    type: "normal",
    symbol: "🗡️",
    ...overrides,
  };
}

function lore(overrides: Partial<StoryLore>): StoryLore {
  return {
    title: "The Old War",
    content: "A long-past conflict.",
    relatedCharacters: [],
    relatedLocations: [],
    secrtet: false,
    keys: [],
    ...overrides,
  };
}

function plan(textToSummarize: string, priorSummary?: string): CompactionPlan {
  return { cutoffIndex: 3, textToSummarize, priorSummary };
}

describe("validateCompactionSummary", () => {
  it("returns no warnings for a clean summary that preserves referenced entities", () => {
    const storyData = createMockStoryData({
      npcs: [npc({ name: "Marcus", status: "alive" })],
      inventory: [item({ name: "Rusty Sword" })],
    });
    const source = "Marcus greeted the party. Marcus led them to the shop. The party took the Rusty Sword.";
    const summary = "The party met Marcus and acquired the Rusty Sword.";

    const warnings = validateCompactionSummary(plan(source), summary, storyData);
    expect(warnings).toEqual([]);
  });

  it("flags an entity mentioned repeatedly in the source but absent from the summary", () => {
    const storyData = createMockStoryData({
      npcs: [npc({ name: "Marcus", status: "alive" })],
    });
    const source =
      "Marcus warned the party about the ruins. Marcus then vanished into the fog.";
    const summary = "The party explored the ruins and found a locked door.";

    const warnings = validateCompactionSummary(plan(source), summary, storyData);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject({ type: "dropped_entity", entity: "Marcus" });
  });

  it("does not flag a single incidental mention that later disappears", () => {
    const storyData = createMockStoryData({
      npcs: [npc({ name: "Marcus", status: "alive" })],
    });
    const source = "A stranger named Marcus pointed the party toward the gate.";
    const summary = "The party found their way to the gate.";

    const warnings = validateCompactionSummary(plan(source), summary, storyData);
    expect(warnings).toEqual([]);
  });

  it("flags a dead NPC described as actively present in the new summary", () => {
    const storyData = createMockStoryData({
      npcs: [npc({ name: "Marcus", status: "dead" })],
    });
    const source = "Marcus died defending the gate. The party mourned him.";
    // Hallucinated: describes the dead NPC as if still active.
    const summary = "Marcus arrives and hands you the map before the party moves on.";

    const warnings = validateCompactionSummary(plan(source), summary, storyData);
    expect(warnings.some((w) => w.type === "status_contradiction" && w.entity === "Marcus")).toBe(
      true
    );
  });

  it("does not flag a dead NPC mentioned only retrospectively", () => {
    const storyData = createMockStoryData({
      npcs: [npc({ name: "Marcus", status: "dead" })],
    });
    const source = "Marcus died defending the gate.";
    const summary = "Marcus died defending the gate, and the party pressed on without him.";

    const warnings = validateCompactionSummary(plan(source), summary, storyData);
    expect(warnings.some((w) => w.type === "status_contradiction")).toBe(false);
  });

  it("flags a departed NPC (not just dead) described as actively present", () => {
    const storyData = createMockStoryData({
      npcs: [npc({ name: "Elena", status: "departed" })],
    });
    const source = "Elena left the party to return home.";
    const summary = "Elena joins you again and attacks you out of nowhere.";

    const warnings = validateCompactionSummary(plan(source), summary, storyData);
    expect(warnings.some((w) => w.type === "status_contradiction" && w.entity === "Elena")).toBe(
      true
    );
  });

  it("checks items and lore titles for dropped-entity warnings too", () => {
    const storyData = createMockStoryData({
      inventory: [item({ name: "Ancient Amulet" })],
      lore: [lore({ title: "The Sunken City" })],
    });
    const source =
      "The Ancient Amulet glowed brightly. The Ancient Amulet seemed to react to The Sunken City. The Sunken City was mentioned twice more.";
    const summary = "The party continued their journey through the swamp.";

    const warnings = validateCompactionSummary(plan(source), summary, storyData);
    const droppedNames = warnings.filter((w) => w.type === "dropped_entity").map((w) => w.entity);
    expect(droppedNames).toContain("Ancient Amulet");
    expect(droppedNames).toContain("The Sunken City");
  });
});

describe("applyCompaction with warnings", () => {
  it("persists warnings onto scene.summaryWarnings", () => {
    const storyData = createMockStoryData({
      npcs: [npc({ name: "Marcus", status: "dead" })],
    });
    const source = "Marcus died defending the gate. Marcus was well-liked.";
    const testPlan = plan(source);
    const summary = "Marcus arrives and hands you the map.";
    const warnings = validateCompactionSummary(testPlan, summary, storyData);
    expect(warnings.length).toBeGreaterThan(0);

    applyCompaction(storyData, testPlan, summary, warnings);
    expect(storyData.scene.summaryWarnings).toEqual(warnings.map((w) => w.detail));
  });

  it("clears prior warnings when a new compaction pass is clean", () => {
    const storyData = createMockStoryData({
      scene: { parts: [], summaryWarnings: ["stale warning from a previous pass"] },
    });
    const testPlan = plan("some text");
    applyCompaction(storyData, testPlan, "clean summary", []);
    expect(storyData.scene.summaryWarnings).toBeUndefined();
  });

  it("defaults to no warnings when the caller omits the argument", () => {
    const storyData = createMockStoryData();
    const testPlan = plan("some text");
    applyCompaction(storyData, testPlan, "a summary");
    expect(storyData.scene.summaryWarnings).toBeUndefined();
  });
});

describe("ensureStoryCompacted validation + retry", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  function partsForSummarization() {
    const longParagraph =
      "Marcus died defending the gate while the party pressed onward through the ruins. ".repeat(
        40
      );
    return [
      { content: longParagraph, imageUrl: "", user: false, role: "assistant" },
      { content: longParagraph, imageUrl: "", user: false, role: "assistant" },
      { content: "recent short line", imageUrl: "", user: false, role: "assistant" },
    ];
  }

  it("accepts a clean first summary without retrying", async () => {
    const storyData = createMockStoryData({
      npcs: [npc({ name: "Marcus", status: "dead" })],
      scene: { parts: partsForSummarization() as StoryData["scene"]["parts"] },
    });

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ content: "Marcus died defending the gate against the horde." }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await ensureStoryCompacted(storyData, 50, {
      model: "test-model",
      token: "tok",
    });

    expect(result.ran).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.warnings).toEqual([]);
    expect(storyData.scene.summaryWarnings).toBeUndefined();
  });

  it("retries once when the first summary contradicts tracked NPC status, and accepts an improved revision", async () => {
    const storyData = createMockStoryData({
      npcs: [npc({ name: "Marcus", status: "dead" })],
      scene: { parts: partsForSummarization() as StoryData["scene"]["parts"] },
    });

    const fetchMock = vi
      .fn()
      // First attempt: hallucinated - describes dead Marcus as active.
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          content: "Marcus arrives and hands you the map before leading the party onward.",
        }),
      })
      // Second attempt (revision): corrected.
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          content: "Marcus died defending the gate; the party pressed onward without him.",
        }),
      });
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await ensureStoryCompacted(storyData, 50, {
      model: "test-model",
      token: "tok",
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.ran).toBe(true);
    expect(result.summary).toBe(
      "Marcus died defending the gate; the party pressed onward without him."
    );
    expect(result.warnings).toEqual([]);
    expect(storyData.scene.summaryWarnings).toBeUndefined();
  });

  it("keeps the original summary and records warnings when the revision doesn't improve things", async () => {
    const storyData = createMockStoryData({
      npcs: [npc({ name: "Marcus", status: "dead" })],
      scene: { parts: partsForSummarization() as StoryData["scene"]["parts"] },
    });

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          content: "Marcus arrives and hands you the map.",
        }),
      })
      // Revision attempt is just as bad (still contradicts status).
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          content: "Marcus greets you warmly and joins you again.",
        }),
      });
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await ensureStoryCompacted(storyData, 50, {
      model: "test-model",
      token: "tok",
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.ran).toBe(true);
    // First attempt is kept since the revision wasn't an improvement.
    expect(result.summary).toBe("Marcus arrives and hands you the map.");
    expect(result.warnings?.length).toBeGreaterThan(0);
    expect(storyData.scene.summaryWarnings?.length).toBeGreaterThan(0);
  });

  it("does not call fetch a second time when the first summary is already clean", async () => {
    const storyData = createMockStoryData({
      scene: { parts: partsForSummarization() as StoryData["scene"]["parts"] },
    });

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ content: "The party fought through the ruins and moved on." }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await ensureStoryCompacted(storyData, 50, {
      model: "test-model",
      token: "tok",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.ran).toBe(true);
  });
});
