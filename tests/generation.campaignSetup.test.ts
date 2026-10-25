/**
 * Session zero's setup gate counts a `campaign` write that changes the
 * record's hash as progress (campaign plan slice 3), the way a sheet or plan
 * note write does; a read, or a write the engine refused, is not.
 */
import { afterEach, describe, expect, it } from "vitest";
import { generateStoryTurn, type GenerationCallbacks, type GenerationOptions } from "@/app/misc/generation";
import { createMockGMFetch } from "./helpers/mockGMFetch";
import { SETUP_APPROVED } from "@/app/misc/setupConfirmAnswer";
import type { StoryData } from "@/app/misc/structs";

const GATE_TEXT = "Next step:";

function sessionZeroStory(): StoryData {
  return {
    story_name: "New Story",
    premise: "Test premise",
    player_name: "Test Player",
    player_summary: "Test summary",
    intro: "Test intro",
    scene: { parts: [] },
    lore: [],
    memory: [],
    npcs: [],
    threads: [],
    sessionZeroActive: true,
  } as unknown as StoryData;
}

const baseOptions: GenerationOptions = {
  storyModel: "test-model",
  toolsModel: "test-model",
  choicesModel: "test-model",
  enableTools: true,
  skipChoices: true,
};

const callbacks: GenerationCallbacks = {
  onRequestSetupConfirmation: async () => SETUP_APPROVED,
};

type Msg = { role: string; content: string };
const hasUser = (call: { body: { messages: unknown } }, text: string) =>
  (call.body.messages as Msg[]).some(
    (m) => m.role === "user" && m.content?.includes(text),
  );

const originalFetch = global.fetch;
afterEach(() => {
  global.fetch = originalFetch;
});

describe("setup gate and the campaign tool", () => {
  it("a campaign write that changed the record is progress: no re-prompt", async () => {
    const story = sessionZeroStory();
    const { fetchMock, gmStageCalls } = createMockGMFetch([
      {
        toolCalls: [
          { name: "campaign", arguments: { action: "add", part: "style", data: { style: "mystery" } } },
        ],
      },
      { content: "A mystery it is. Who do you want to be?" },
    ]);
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await generateStoryTurn(story, "a mystery please", baseOptions, callbacks);

    const calls = gmStageCalls();
    expect(calls).toHaveLength(2);
    for (const c of calls) expect(hasUser(c, GATE_TEXT)).toBe(false);
    expect(result.content).toBe("A mystery it is. Who do you want to be?");
    expect(story.campaign?.style).toBe("mystery");
  });

  it("a read, or a refused write, is no progress: the gate re-prompts", async () => {
    const story = sessionZeroStory();
    const { fetchMock, gmStageCalls } = createMockGMFetch([
      { toolCalls: [{ name: "campaign", arguments: { action: "read" } }] },
      { content: "Nothing yet." },
      {
        toolCalls: [
          { name: "campaign", arguments: { action: "add", part: "faction", data: { name: "Guild" } } },
        ],
      },
      { content: "Still nothing." },
      { toolCalls: [{ name: "campaign", arguments: { action: "add", part: "style", data: { style: "horror" } } }] },
      { content: "Horror, then." },
    ]);
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await generateStoryTurn(story, "go", baseOptions, callbacks);

    const calls = gmStageCalls();
    // The read was no progress: the prose round after it was re-prompted (call 3 carries the gate).
    expect(hasUser(calls[1], GATE_TEXT)).toBe(false);
    expect(hasUser(calls[2], GATE_TEXT)).toBe(true);
    expect(result.content).toBe("Horror, then.");
    expect(story.campaign?.style).toBe("horror");
  });
});
