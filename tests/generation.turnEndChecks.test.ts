/**
 * The system turn-end check as it runs inside generateStoryTurn's GM loop
 * (app/misc/generation.ts, search "turn-end checks"; decision 183,
 * docs/dawn-gate-design.md). A story running Blood & Bone whose turn ends on
 * prose that says the night is over, with no end_session this turn, sends the
 * GM back once: a conditional user message and an explicit `auto` tool choice.
 *
 * Every scenario uses skipChoices, so the only fetches are GM-stage rounds.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { generateStoryTurn, GenerationOptions } from "@/app/misc/generation";
import { createMockGMFetch } from "./helpers/mockGMFetch";
import { CAMPAIGN_SPINE_BEATS } from "@/app/misc/campaignPlan";
import { logger } from "@/app/misc/logger";
import type { StoryData, StoryLore } from "@/app/misc/structs";

const REMINDER = "The text may say the night ended this turn";

const originalFetch = global.fetch;
afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

function bloodAndBoneLore(): StoryLore {
  return {
    title: "Blood & Bone — Core",
    content: "The core rules.",
    relatedCharacters: [],
    relatedLocations: [],
    secrtet: false,
    keys: [],
    type: "dm_instructions",
    libraryNoteId: "builtin:blood-and-bone:core",
  } as StoryLore;
}

function planNote(): StoryLore {
  return {
    title: "Campaign Plan",
    content: "# Campaign Plan\n## Current beat — Opening Image (Session 0)",
    relatedCharacters: [],
    relatedLocations: [],
    secrtet: false,
    keys: [],
    type: "gm_plan",
  } as StoryLore;
}

function createStory(overrides: Partial<StoryData> = {}): StoryData {
  return {
    story_name: "Test Story",
    premise: "Test premise",
    player_name: "Test Player",
    player_summary: "Test summary",
    intro: "Test intro",
    scene: { parts: [] },
    chapters: [],
    lore: [bloodAndBoneLore()],
    memory: [],
    npcs: [],
    ...overrides,
  } as StoryData;
}

const baseOptions: GenerationOptions = {
  storyModel: "test-model",
  toolsModel: "test-model",
  choicesModel: "test-model",
  enableTools: true,
  skipChoices: true,
};

type Msg = { role: string; content: string };
const hasReminder = (body: { messages: unknown }) =>
  (body.messages as Msg[]).some(
    (m) => m.role === "user" && m.content?.includes(REMINDER),
  );
const reminderCount = (body: { messages: unknown }) =>
  (body.messages as Msg[]).filter(
    (m) => m.role === "user" && m.content?.includes(REMINDER),
  ).length;

async function play(
  story: StoryData,
  line: string,
  rounds: Parameters<typeof createMockGMFetch>[0],
  options: GenerationOptions = baseOptions,
) {
  const mock = createMockGMFetch(rounds);
  global.fetch = mock.fetchMock as unknown as typeof fetch;
  const result = await generateStoryTurn(story, line, options, {});
  return { result, calls: mock.gmStageCalls() };
}

describe("night-ended turn-end check - generateStoryTurn integration", () => {
  it("sends the GM back once when the prose crosses dawn, then lets end_session settle it", async () => {
    const story = createStory();
    const { result, calls } = await play(story, "I keep watch", [
      { content: "Dawn breaks over the cemetery and the fog lifts." },
      { toolCalls: [{ name: "end_session", arguments: { reason: "dawn" } }] },
      { content: "The Reckoning leaves you hollow-eyed in the new light." },
    ]);

    expect(result.success).toBe(true);
    expect(calls).toHaveLength(3);
    expect(hasReminder(calls[0].body)).toBe(false);
    expect(calls[0].body.toolChoice).toBeUndefined();
    expect(hasReminder(calls[1].body)).toBe(true);
    expect(calls[1].body.toolChoice).toBe("auto");
    expect(reminderCount(calls[2].body)).toBe(1);
    expect(calls[2].body.toolChoice).toBeUndefined();
    expect(result.gmResults?.some((r) => r.toolName === "end_session")).toBe(true);
  });

  it("fires on the player's own line when the prose says nothing of dawn", async () => {
    const story = createStory();
    const { calls } = await play(
      story,
      "at dawn I climb down and go to bed. Next morning, I go find Cora",
      [
        { content: "You climb down the tower and lie down in the crypt." },
        { toolCalls: [{ name: "end_session", arguments: { reason: "dawn" } }] },
        { content: "Morning finds you stiff, and Cora is already awake." },
      ],
    );
    expect(calls).toHaveLength(3);
    expect(hasReminder(calls[1].body)).toBe(true);
  });

  it("lets the GM decline: one reminder, then the turn ends", async () => {
    const story = createStory();
    const { result, calls } = await play(story, "I wait", [
      { content: "Sunrise is hours away, you tell yourself, though the sky lightens." },
      { content: "It is not dawn yet. The watch goes on, and at sunrise nothing is settled." },
    ]);
    expect(result.success).toBe(true);
    expect(calls).toHaveLength(2);
    expect(reminderCount(calls[1].body)).toBe(1);
    expect(calls[1].body.toolChoice).toBe("auto");
    expect(result.gmResults?.some((r) => r.toolName === "end_session")).toBeFalsy();
  });

  it("does not prompt again after the reminder when the next prose still says dawn", async () => {
    const story = createStory();
    const { calls } = await play(story, "I wait", [
      { content: "The sun rose." },
      { content: "Sunrise, and still nothing moves." },
    ]);
    expect(calls).toHaveLength(2);
  });

  it("still prompts once when the GM's end_session call fails, and not again", async () => {
    const story = createStory();
    const { result, calls } = await play(story, "I keep watch", [
      { content: "Dawn breaks over the cemetery." },
      // No "reason": the call is refused, which does not settle the check.
      { toolCalls: [{ name: "end_session", arguments: {} }] },
      { content: "The light grows." },
    ]);
    expect(calls).toHaveLength(3);
    expect(reminderCount(calls[2].body)).toBe(1);
    expect(result.gmResults?.find((r) => r.toolName === "end_session")?.success).toBe(false);
  });

  it("does nothing when end_session already ran earlier in the turn", async () => {
    const story = createStory();
    const { calls } = await play(story, "I wait for morning", [
      { toolCalls: [{ name: "end_session", arguments: { reason: "dawn" } }] },
      { content: "Dawn breaks and the Reckoning is done." },
    ]);
    expect(calls).toHaveLength(2);
    for (const c of calls) expect(hasReminder(c.body)).toBe(false);
  });

  it("logs and sends no reminder when the round budget is spent", async () => {
    const action = vi.spyOn(logger, "action");
    const story = createStory();
    const { result, calls } = await play(
      story,
      "I keep watch",
      [{ content: "Dawn breaks over the cemetery." }],
      { ...baseOptions, maxToolLoops: 1 },
    );
    expect(result.success).toBe(true);
    expect(calls).toHaveLength(1);
    expect(
      action.mock.calls.some((c) =>
        String(c[0]).includes("night-ended could not run: no rounds left"),
      ),
    ).toBe(true);
  });

  it("runs after the plan gate's re-prompts, whose order is unchanged", async () => {
    const story = createStory({
      lore: [bloodAndBoneLore(), planNote()],
      planState: {
        beats: [...CAMPAIGN_SPINE_BEATS],
        currentBeatIndex: 0,
        awaitingNextBeat: true,
      },
    });
    const { calls } = await play(story, "I keep watch", [
      { content: "Dawn breaks." }, // plan gate (1)
      { content: "The light grows." }, // plan gate (2)
      { content: "Morning comes fully." }, // cap reached -> turn-end check
      { toolCalls: [{ name: "end_session", arguments: { reason: "dawn" } }] },
      { content: "The Reckoning is done." },
    ]);
    expect(calls).toHaveLength(5);
    expect(calls[1].body.toolChoice).toBe("required");
    expect(calls[2].body.toolChoice).toBe("required");
    expect(hasReminder(calls[2].body)).toBe(false);
    expect(hasReminder(calls[3].body)).toBe(true);
    expect(calls[3].body.toolChoice).toBe("auto");
  });

  it("stays off in a session-zero turn, which has its own gate", async () => {
    const story = createStory({ sessionZeroActive: true });
    const { calls } = await play(story, "Let's begin", [
      { content: "Dawn breaks over the cemetery." },
      { content: "At sunrise we begin." },
      { content: "The next morning, still setup." },
    ]);
    for (const c of calls) expect(hasReminder(c.body)).toBe(false);
  });

  it("does nothing for a story with no system", async () => {
    const story = createStory({ lore: [] });
    const { calls } = await play(story, "I wait", [
      { content: "Dawn breaks over the hills." },
    ]);
    expect(calls).toHaveLength(1);
  });

  it("does nothing when the system tools are switched off", async () => {
    const story = createStory({
      systemState: { usesSystemTools: false },
    } as Partial<StoryData>);
    const { calls } = await play(story, "I wait", [
      { content: "Dawn breaks over the hills." },
    ]);
    expect(calls).toHaveLength(1);
  });

  it("keeps the system prompt and the tool list byte-identical with and without the reminder", async () => {
    const story = createStory();
    const { calls } = await play(story, "I keep watch", [
      { content: "Dawn breaks over the cemetery." },
      { content: "Carrying on." },
    ]);
    expect(calls).toHaveLength(2);
    const first = calls[0].body;
    const second = calls[1].body;
    expect(JSON.stringify(second.tools)).toBe(JSON.stringify(first.tools));
    const m1 = first.messages as Msg[];
    const m2 = second.messages as Msg[];
    // Everything the first request sent is the unchanged start of the second;
    // the reminder arrives only as appended messages.
    expect(m2.slice(0, m1.length - 1)).toEqual(m1.slice(0, m1.length - 1));
    expect(m2[0]).toEqual(m1[0]);
    expect(hasReminder(first)).toBe(false);
    expect(hasReminder(second)).toBe(true);
  });
});
