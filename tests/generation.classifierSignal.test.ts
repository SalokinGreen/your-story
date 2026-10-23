/**
 * The tier classifier's call is handed the turn's abort signal, so Stop
 * cancels it too (slice 3, decision 134). The classifier is the one side call
 * made before the GM's first round, and it ran uncancellable.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { generateStoryTurn, GenerationOptions } from "@/app/misc/generation";
import { NARRATION_MODEL_KEY } from "@/app/misc/reasoningTiers";
import { createMockGMFetch, sseStreamResponse } from "./helpers/mockGMFetch";
import type { StoryData } from "@/app/misc/structs";

/** No state signal and a long input: the one case that spends a classifier call. */
const LONG_INPUT = "I study the door, the hinges and the lock for a long while, ".repeat(5);

const originalFetch = global.fetch;
afterEach(() => {
  global.fetch = originalFetch;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("the tier classifier call", () => {
  it("receives the turn's abort signal", async () => {
    const story = {
      story_name: "Test Story",
      premise: "Test premise",
      player_name: "Test Player",
      scene: { parts: [] },
      lore: [],
      memory: [],
      npcs: [],
      sessionZeroActive: false,
    } as unknown as StoryData;
    const gm = createMockGMFetch([
      { content: "The lock clicks open.", meta: { model: "z-ai/glm-5.3", modelName: NARRATION_MODEL_KEY, provider: "openrouter" } },
    ]);
    const abort = new AbortController();
    let classifierSignal: AbortSignal | null | undefined;
    global.fetch = vi.fn(async (url: unknown, init?: RequestInit) => {
      const body = JSON.parse(init!.body as string) as { messages: { content: string }[] };
      if (String(url) === "/api/generate") {
        if (body.messages[0]?.content?.includes("Classify the following player action")) {
          classifierSignal = init?.signal;
        }
        return { ok: true, json: async () => ({ content: "[]" }) } as unknown as Response;
      }
      if (!("tools" in body) || !(body as { tools?: unknown }).tools) {
        return sseStreamResponse({
          content: "The lock clicks open.",
          meta: { model: "z-ai/glm-5.3", modelName: NARRATION_MODEL_KEY, provider: "openrouter" },
        });
      }
      return (gm.fetchMock as unknown as typeof fetch)(url as RequestInfo, init);
    }) as unknown as typeof fetch;
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const options: GenerationOptions = {
      storyModel: NARRATION_MODEL_KEY,
      toolsModel: NARRATION_MODEL_KEY,
      choicesModel: NARRATION_MODEL_KEY,
      enableTools: true,
      skipChoices: true,
      replyLength: "medium",
      openRouterKey: "openrouter-test-key",
      abortSignal: abort.signal,
    };
    await generateStoryTurn(story, LONG_INPUT, options, {});
    for (let i = 0; i < 30; i++) await new Promise((r) => setTimeout(r, 0));

    expect(classifierSignal).toBe(abort.signal);
  });
});
