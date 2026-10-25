/**
 * A GM round the provider cut off at max_tokens with nothing usable (no
 * visible words, no tool call whose arguments finished) is retried once per
 * turn at double the output cap (decision 196). The case that prompted it: a
 * session-zero round on Claude at xhigh effort spent the whole Response
 * Length thinking about the character sheet, and the setup gate read the
 * empty round as "said nothing".
 */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { generateStoryTurn, GenerationOptions } from "@/app/misc/generation";
import { getGMStageOutputTokens, roundCutOffEmpty } from "@/app/misc/ai_staged";
import { getModelConfig } from "@/app/misc/ai_prices";
import { sentMaxTokens } from "@/app/misc/providerCall";
import { createMockGMFetch } from "./helpers/mockGMFetch";
import type { StoryData } from "@/app/misc/structs";

function story(overrides: Partial<StoryData> = {}): StoryData {
  return {
    story_name: "Test",
    premise: "Test premise",
    player_name: "Test Player",
    player_summary: "",
    intro: "",
    scene: { parts: [] },
    lore: [],
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
  customMaxOutput: 8000,
};

const CUT_OFF = { meta: { finishReason: "length" } };

describe("roundCutOffEmpty", () => {
  it("is true only for a length finish with no words and no finished call", () => {
    expect(roundCutOffEmpty("length", "", [])).toBe(true);
    expect(roundCutOffEmpty("length", "  ", [{ argsTruncated: true }])).toBe(true);
    expect(roundCutOffEmpty("length", "Some words", [])).toBe(false);
    expect(roundCutOffEmpty("length", "", [{}])).toBe(false);
    expect(roundCutOffEmpty("stop", "", [])).toBe(false);
    expect(roundCutOffEmpty(undefined, "", [])).toBe(false);
  });
});

describe("getGMStageOutputTokens with a multiplier", () => {
  it("doubles the Response Length, capped by the model's own maximum", () => {
    const max = getModelConfig("test-model").maxOutputTokens || 4000;
    expect(getGMStageOutputTokens(8000, "test-model", 2)).toBe(
      Math.min(16000, max),
    );
    expect(getGMStageOutputTokens(10 ** 9, "test-model", 2)).toBe(max);
  });
});

describe("sentMaxTokens", () => {
  it("applies the 4,096 floor of a model that always thinks, and only that", () => {
    // Claude at a 1K Response Length: 1,000 and its double both go out as
    // 4,096, so the GM loop must see no raise and not pay for a twin round.
    expect(sentMaxTokens("Claude Sonnet 5.5", 1000)).toBe(4096);
    expect(sentMaxTokens("Claude Sonnet 5.5", 2000)).toBe(4096);
    expect(sentMaxTokens("Claude Sonnet 5.5", 16000)).toBe(16000);
    expect(sentMaxTokens("DeepSeek V4 Flash", 1000)).toBe(1000);
  });
});

describe("GM round cut off at the output cap", () => {
  const originalFetch = global.fetch;
  beforeEach(() => vi.spyOn(console, "log").mockImplementation(() => {}));
  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("retries an empty cut-off round once at double the cap", async () => {
    const mock = createMockGMFetch([CUT_OFF, { content: "The door opens." }]);
    global.fetch = mock.fetchMock as unknown as typeof fetch;

    const result = await generateStoryTurn(story(), "I knock", baseOptions, {});

    const calls = mock.gmStageCalls();
    expect(calls).toHaveLength(2);
    const first = calls[0].body.maxTokens as number;
    expect(calls[1].body.maxTokens).toBeGreaterThan(first);
    expect(result.content).toContain("The door opens.");
  });

  it("retries a round whose only tool call was cut off", async () => {
    const mock = createMockGMFetch([
      { ...CUT_OFF, toolCalls: [{ name: "create_note" }] },
      { content: "Done." },
    ]);
    // The mock sends finished JSON; mark the call as the provider would.
    const original = mock.fetchMock.getMockImplementation() as (
      ...args: unknown[]
    ) => Promise<Response>;
    let first = true;
    mock.fetchMock.mockImplementation(async (...args: unknown[]) => {
      const res = await original(...args);
      if (!first) return res;
      first = false;
      const text = await new Response(res.body).text();
      const patched = text.replace(
        '"type":"function"',
        '"argsTruncated":true,"type":"function"',
      );
      return { ...res, body: new Response(patched).body } as Response;
    });
    global.fetch = mock.fetchMock as unknown as typeof fetch;

    const result = await generateStoryTurn(story(), "I knock", baseOptions, {});

    const calls = mock.gmStageCalls();
    expect(calls).toHaveLength(2);
    // Asked again at the raised cap, not executed as a cut-off call.
    expect(calls[1].body.maxTokens as number).toBeGreaterThan(
      calls[0].body.maxTokens as number,
    );
    expect(result.content).toContain("Done.");
  });

  it("does not retry a cut-off round that wrote words", async () => {
    const mock = createMockGMFetch([
      { ...CUT_OFF, content: "The door opens and" },
    ]);
    global.fetch = mock.fetchMock as unknown as typeof fetch;

    await generateStoryTurn(story(), "I knock", baseOptions, {});

    expect(mock.gmStageCalls()).toHaveLength(1);
  });

  it("retries only once per turn", async () => {
    const mock = createMockGMFetch([CUT_OFF, CUT_OFF, { content: "Fallback." }]);
    global.fetch = mock.fetchMock as unknown as typeof fetch;

    await generateStoryTurn(story(), "I knock", baseOptions, {}).catch(() => undefined);

    // The second cut-off round is not retried: it ends the GM stage as an
    // ordinary empty round would, so the third scripted round is never asked.
    expect(mock.gmStageCalls()).toHaveLength(2);
  });
});
