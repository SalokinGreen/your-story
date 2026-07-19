/**
 * Random events triggered by the oracle (fate_question doubles, or a scene
 * check's Interrupted result) used to be a single advisory line in the
 * prompt with nothing checking it was ever addressed - easy to silently
 * drop. They're now persisted as StoryData.pendingRandomEvents and only
 * cleared by an explicit resolve_random_event call.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { executeGMTools } from "@/app/misc/gmExecutor";
import { executeTools, ToolCall } from "@/app/misc/toolExecutor";
import { StoryData, MAX_PENDING_RANDOM_EVENTS } from "@/app/misc/structs";

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
    conditions: [],
    ...overrides,
  } as StoryData;
}

function createGMToolCall(name: string, args: Record<string, unknown>) {
  return {
    id: `test_${Math.random().toString(36).slice(2)}`,
    function: { name, arguments: JSON.stringify(args) },
  };
}

function mockRandom(value: number) {
  vi.spyOn(Math, "random").mockReturnValue(value);
}

describe("fate_question - pending random events", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("persists a pending random event on a doubles roll", async () => {
    mockRandom(0.1); // -> roll 11, a "doubles" random event
    const storyData = createMockStoryData();

    const result = await executeGMTools(
      [
        createGMToolCall("fate_question", {
          question: "Is the door locked?",
          likelihood: "50/50",
        }),
      ],
      storyData
    );

    expect(result.modifiedStoryData.pendingRandomEvents).toHaveLength(1);
    const event = result.modifiedStoryData.pendingRandomEvents![0];
    expect(event.source).toBe("fate_question");
    expect(event.focus).toBeDefined();
    expect(event.action).toBeDefined();
    expect(event.subject).toBeDefined();
    expect(result.results[0].contextForStory).toContain("resolve_random_event");
    expect(result.results[0].contextForStory).toContain(event.id);
  });

  it("does not persist an event on a non-doubles roll", async () => {
    mockRandom(0.5); // -> roll 51, not doubles
    const storyData = createMockStoryData();

    const result = await executeGMTools(
      [
        createGMToolCall("fate_question", {
          question: "Is the door locked?",
          likelihood: "50/50",
        }),
      ],
      storyData
    );

    expect(
      result.modifiedStoryData.pendingRandomEvents || []
    ).toHaveLength(0);
  });

  it("caps the pending list, dropping the oldest", async () => {
    mockRandom(0.1); // always a doubles roll
    const storyData = createMockStoryData();

    const calls = Array.from({ length: MAX_PENDING_RANDOM_EVENTS + 3 }, () =>
      createGMToolCall("fate_question", {
        question: "Something uncertain?",
        likelihood: "50/50",
      })
    );

    const result = await executeGMTools(calls, storyData);

    expect(result.modifiedStoryData.pendingRandomEvents).toHaveLength(
      MAX_PENDING_RANDOM_EVENTS
    );
  });
});

describe("resolve_random_event", () => {
  it("removes a pending event by id and reports success", () => {
    const storyData = createMockStoryData({
      pendingRandomEvents: [
        {
          id: "event_123",
          source: "fate_question",
          focus: "NPC action",
          action: "Betray",
          subject: "A rival",
          createdAt: Date.now(),
        },
      ],
    });

    const toolCalls: ToolCall[] = [
      {
        type: "function",
        function: {
          name: "resolve_random_event",
          arguments: { id: "event_123", how_incorporated: "The rival showed up and betrayed the party" },
        },
      },
    ];

    const { responses } = executeTools(toolCalls, storyData);

    expect(responses[0].success).toBe(true);
    expect(storyData.pendingRandomEvents).toHaveLength(0);
  });

  it("fails with an unknown id and leaves other pending events untouched", () => {
    const storyData = createMockStoryData({
      pendingRandomEvents: [
        {
          id: "event_real",
          source: "scene_check",
          focus: "Move toward a thread",
          action: "Reveal",
          subject: "A secret",
          createdAt: Date.now(),
        },
      ],
    });

    const toolCalls: ToolCall[] = [
      {
        type: "function",
        function: { name: "resolve_random_event", arguments: { id: "does_not_exist" } },
      },
    ];

    const { responses } = executeTools(toolCalls, storyData);

    expect(responses[0].success).toBe(false);
    expect(storyData.pendingRandomEvents).toHaveLength(1);
  });
});
