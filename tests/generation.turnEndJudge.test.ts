/**
 * The night-ended check with its judge switched on, as generateStoryTurn runs
 * it (GM prompt plan slice 5; app/misc/generation.ts, search "turn-end
 * judge"). The judge call is mocked; no model is called.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";

const askMock = vi.hoisted(() => vi.fn());

import { generateStoryTurn, GenerationOptions } from "@/app/misc/generation";
import { TURN_END_JUDGE_KEY } from "@/app/misc/turnEndChecks";
import { createMockGMFetch } from "./helpers/mockGMFetch";
import type { StoryData, StoryLore } from "@/app/misc/structs";

const prose = "Pale light creeps over the rooftops and the bells begin to ring.";

vi.mock("@/app/misc/judges/turnEndJudge", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/app/misc/judges/turnEndJudge")>();
  return { ...actual, askTurnEndJudge: askMock };
});

const REMINDER = "The text may say the night ended this turn";
const originalFetch = global.fetch;

function story(): StoryData {
  const core = {
    title: "Blood & Bone — Core",
    content: "The core rules.",
    relatedCharacters: [],
    relatedLocations: [],
    secrtet: false,
    keys: [],
    type: "dm_instructions",
    libraryNoteId: "builtin:blood-and-bone:core",
  } as StoryLore;
  return {
    story_name: "T",
    premise: "p",
    player_name: "P",
    player_summary: "s",
    intro: "i",
    scene: { parts: [] },
    chapters: [],
    lore: [core],
    memory: [],
    npcs: [],
  } as unknown as StoryData;
}

const options: GenerationOptions = {
  storyModel: "test-model",
  toolsModel: "test-model",
  choicesModel: "test-model",
  enableTools: true,
  skipChoices: true,
};

async function play(content: string) {
  const mock = createMockGMFetch([
    { content },
    { toolCalls: [{ name: "end_session", arguments: { reason: "dawn" } }] },
    { content: "The Reckoning leaves you hollow-eyed." },
  ]);
  global.fetch = mock.fetchMock as unknown as typeof fetch;
  await generateStoryTurn(story(), "I keep watch", options, {});
  return mock.gmStageCalls();
}
const reminded = (call: { body: { messages: unknown } }) =>
  (call.body.messages as Array<{ role: string; content: string }>).some(
    (m) => m.role === "user" && m.content?.includes(REMINDER),
  );

describe("night-ended through generateStoryTurn with the judge", () => {
  beforeEach(() => askMock.mockReset());
  afterEach(() => {
    global.fetch = originalFetch;
    vi.unstubAllGlobals();
  });
  const on = () => vi.stubGlobal("localStorage", { getItem: (k: string) => (k === TURN_END_JUDGE_KEY ? "on" : null), setItem: () => {}, removeItem: () => {} });

  it("off: no judge call and the phrase table decides, as before", async () => {
    const calls = await play("Dawn breaks over the cemetery.");
    expect(askMock).not.toHaveBeenCalled();
    expect(calls).toHaveLength(3);
    expect(reminded(calls[1])).toBe(true);
  });
  it("on, yes: a dawn with no phrase in it sends the GM back once", async () => {
    on();
    askMock.mockResolvedValue({ answer: "yes", quote: "Pale light" });
    const calls = await play(prose);
    expect(askMock).toHaveBeenCalledTimes(1);
    expect(askMock.mock.calls[0][0].question).toMatch(/night end/i);
    expect(reminded(calls[1])).toBe(true);
  });
  it("on, no: a phrase in a plan does not send the GM back", async () => {
    on();
    askMock.mockResolvedValue({ answer: "no", quote: "" });
    const calls = await play("Dawn breaks over the cemetery.");
    expect(calls).toHaveLength(1);
  });
  it("on, unknown: the phrase table is the fallback", async () => {
    on();
    askMock.mockResolvedValue({ answer: "unknown", quote: "" });
    const calls = await play("Dawn breaks over the cemetery.");
    expect(askMock).toHaveBeenCalledTimes(1);
    expect(reminded(calls[1])).toBe(true);
  });

  it("asks nothing when fewer than three rounds are left (a yes could not act)", async () => {
    on();
    askMock.mockResolvedValue({ answer: "yes", quote: "Pale light" });
    const mock = createMockGMFetch([{ content: prose }, { content: "more" }]);
    global.fetch = mock.fetchMock as unknown as typeof fetch;
    await generateStoryTurn(story(), "I keep watch", { ...options, maxToolLoops: 3 }, {});
    expect(askMock).not.toHaveBeenCalled();
    expect(mock.gmStageCalls()).toHaveLength(1);
  });
  it("reads once per turn: one call even when the turn runs several rounds", async () => {
    on();
    askMock.mockResolvedValue({ answer: "unknown", quote: "" });
    const calls = await play("Dawn breaks over the cemetery.");
    expect(askMock).toHaveBeenCalledTimes(1);
    expect(calls).toHaveLength(3);
  });
});
