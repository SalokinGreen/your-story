/**
 * Tests for the delegate_task tool (app/misc/subagentExecutor.ts,
 * dispatched via app/misc/gmExecutor.ts's executeGMTools). Exercises the
 * sub-call's fetch behavior directly rather than through the full
 * generateStoryTurn GM-stage loop, since delegate_task's sub-call hits
 * /api/generate (and, for web_research, /api/web-search) independently of
 * the main GM stage's own /api/generate-stream call.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { executeGMTools } from "@/app/misc/gmExecutor";
import { StoryData } from "@/app/misc/structs";

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

function createToolCall(name: string, args: Record<string, unknown>) {
  return {
    id: `test_${Date.now()}`,
    function: { name, arguments: JSON.stringify(args) },
  };
}

function jsonResponse(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => body,
  } as unknown as Response;
}

describe("delegate_task", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("generate_npc: registers the NPC the sub-call returns", async () => {
    const fetchMock = vi.fn(async (url: unknown) => {
      expect(String(url)).toBe("/api/generate");
      return jsonResponse({
        content: JSON.stringify({
          name: "Bob",
          description: "A grizzled dockworker with a gambling habit.",
          role: "Debtor",
          attitude: "neutral",
          relationship: "Owes the player money",
        }),
      });
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const storyData = createMockStoryData();
    const toolCall = createToolCall("delegate_task", {
      task_type: "generate_npc",
      brief: "an NPC called Bob, a dockworker who owes the player money",
    });

    const execution = await executeGMTools([toolCall], storyData);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(execution.results[0].success).toBe(true);
    expect(execution.results[0].toolName).toBe("delegate_task");
    expect(execution.modifiedStoryData.npcs?.[0]?.name).toBe("Bob");
    expect(execution.modifiedStoryData.npcs?.[0]?.role).toBe("Debtor");
  });

  it("generate_location: saves the sub-call's writeup as a note", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        content: JSON.stringify({
          title: "The Sunken Cathedral",
          content: "A flooded ruin, half-swallowed by the tide...",
        }),
      }),
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    const storyData = createMockStoryData();
    const toolCall = createToolCall("delegate_task", {
      task_type: "generate_location",
      brief: "the Sunken Cathedral the player is about to enter",
    });

    const execution = await executeGMTools([toolCall], storyData);

    expect(execution.results[0].success).toBe(true);
    const note = execution.modifiedStoryData.lore.find(
      (l) => l.title === "The Sunken Cathedral",
    );
    expect(note).toBeDefined();
    expect(note?.type).toBe("location");
  });

  it("research: returns a synthesized summary without mutating state", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        content: JSON.stringify({
          summary: "The notes establish that the Duke is secretly a vampire.",
        }),
      }),
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    const storyData = createMockStoryData({
      lore: [
        {
          title: "Duke Aldric",
          content: "The Duke is secretly a vampire.",
          relatedCharacters: [],
          relatedLocations: [],
          secrtet: false,
          keys: [],
        },
      ],
    });
    const toolCall = createToolCall("delegate_task", {
      task_type: "research",
      brief: "everything we know about Duke Aldric",
    });

    const execution = await executeGMTools([toolCall], storyData);

    expect(execution.results[0].success).toBe(true);
    expect(execution.results[0].contextForStory).toContain("vampire");
    expect(execution.modifiedStoryData.lore).toHaveLength(1);
    expect(execution.modifiedStoryData.npcs).toHaveLength(0);
  });

  it("web_research: fails closed without any network call when disabled", async () => {
    const fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    const storyData = createMockStoryData();
    const toolCall = createToolCall("delegate_task", {
      task_type: "web_research",
      brief: "how medieval blacksmithing actually worked",
    });

    const execution = await executeGMTools(
      [toolCall],
      storyData,
      {},
      {},
      { webResearchEnabled: false },
    );

    expect(execution.results[0].success).toBe(false);
    expect(execution.results[0].contextForStory).toContain("Web research is disabled");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("web_research: fails closed without a search key even when enabled", async () => {
    const fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    const storyData = createMockStoryData();
    const toolCall = createToolCall("delegate_task", {
      task_type: "web_research",
      brief: "how medieval blacksmithing actually worked",
    });

    const execution = await executeGMTools(
      [toolCall],
      storyData,
      {},
      {},
      { webResearchEnabled: true },
    );

    expect(execution.results[0].success).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("web_research: searches then synthesizes when enabled and configured", async () => {
    const fetchMock = vi.fn(async (url: unknown) => {
      const urlStr = String(url);
      if (urlStr === "/api/web-search") {
        return jsonResponse({
          results: [
            {
              title: "Medieval Blacksmithing",
              url: "https://example.com/smithing",
              description: "Blacksmiths forged iron using a forge and anvil.",
            },
          ],
        });
      }
      if (urlStr === "/api/generate") {
        return jsonResponse({
          content: JSON.stringify({
            summary: "Medieval blacksmiths used a forge and anvil to work iron.",
          }),
        });
      }
      throw new Error(`unexpected fetch to ${urlStr}`);
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const storyData = createMockStoryData();
    const toolCall = createToolCall("delegate_task", {
      task_type: "web_research",
      brief: "how medieval blacksmithing actually worked",
    });

    const execution = await executeGMTools(
      [toolCall],
      storyData,
      {},
      {},
      { webResearchEnabled: true, braveSearchKey: "test-key" },
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(execution.results[0].success).toBe(true);
    expect(execution.results[0].contextForStory).toContain("forge and anvil");
  });

  it("reports a clear failure when the sub-call's response can't be parsed", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ content: "not json" }));
    global.fetch = fetchMock as unknown as typeof fetch;

    const storyData = createMockStoryData();
    const toolCall = createToolCall("delegate_task", {
      task_type: "generate_npc",
      brief: "an NPC called Bob",
    });

    const execution = await executeGMTools([toolCall], storyData);

    expect(execution.results[0].success).toBe(false);
    expect(execution.results[0].contextForStory).toContain("Delegated Task Failed");
  });
});
