/**
 * Claude through OpenRouter (docs/claude-gm-design.md §3,
 * docs/claude-gm-implementation-plan.md A2/A3): the request shaping in
 * app/misc/providerCall.ts for `anthropic/…` models.
 *
 * Claude 5.5 returns a 400 for four things this app sends other providers -
 * sampling parameters, a trailing assistant prefill, a forced tool_choice
 * and reasoning effort "none" - so each is asserted absent or remapped here,
 * alongside the regressions that must not follow (a non-Claude OpenRouter
 * model still gets all four, a google/ model still gets its thought
 * signature).
 *
 * The prompt-cache test drives a real scripted GM turn through
 * generateStoryTurn (tests/helpers/mockGMFetch.ts), then replays the request
 * bodies of rounds 1 and 2 through generateStream as Claude Sonnet 5.5 and
 * checks the breakpoint lands on the same message, with the same bytes
 * before it, in both.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  generateNonStreaming,
  generateStream,
  GenerateRequestBody,
  isAnthropicViaOpenRouter,
} from "@/app/misc/providerCall";
import { generateStoryTurn } from "@/app/misc/generation";
import { createMockGMFetch } from "./helpers/mockGMFetch";
import type { StoryData } from "@/app/misc/structs";

const SIMPLE_RESPONSE = {
  choices: [
    { index: 0, message: { role: "assistant", content: "hi" }, finish_reason: "stop" },
  ],
  usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
};

/** Stubs global fetch with a JSON reply (non-streaming) or an empty SSE stream. */
function stubProviderFetch() {
  const fetchMock = vi.fn(async () => ({
    ok: true,
    status: 200,
    statusText: "OK",
    json: async () => SIMPLE_RESPONSE,
    text: async () => JSON.stringify(SIMPLE_RESPONSE),
    body: new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));
        controller.close();
      },
    }),
  }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

interface SentPart {
  type: string;
  text: string;
  cache_control?: unknown;
}

interface SentMessage {
  role: string;
  content: string | SentPart[];
  reasoning_details?: unknown[];
  tool_calls?: { function: { name: string }; extra_content?: unknown }[];
}

interface SentBody {
  messages: SentMessage[];
  [field: string]: unknown;
}

function sentBody(fetchMock: ReturnType<typeof vi.fn>, call = 0): SentBody {
  const init = fetchMock.mock.calls[call][1] as RequestInit;
  return JSON.parse(init.body as string);
}

async function drain(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let out = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    out += decoder.decode(value, { stream: true });
  }
  return out;
}

/** Runs one streaming request and returns the body that reached the provider. */
async function streamedBody(body: GenerateRequestBody): Promise<SentBody> {
  const fetchMock = stubProviderFetch();
  const frames = await drain(generateStream(body));
  expect(frames).not.toContain('"type":"error"');
  return sentBody(fetchMock);
}

const TOOLS = [
  {
    type: "function",
    function: {
      name: "formula_roll",
      description: "Roll dice",
      parameters: { type: "object", properties: {} },
    },
  },
];

const SAMPLING = {
  temperature: 0.9,
  top_p: 0.95,
  presence_penalty: 0.3,
  frequency_penalty: 0.3,
  min_p: 0.05,
  top_k: 40,
  repetition_penalty: 1.1,
};

const SAMPLING_FIELDS = [
  "temperature",
  "top_p",
  "presence_penalty",
  "frequency_penalty",
  "min_p",
  "top_k",
  "repetition_penalty",
];

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("isAnthropicViaOpenRouter", () => {
  it("is true for anthropic/ ids on OpenRouter, catalog or custom", () => {
    expect(isAnthropicViaOpenRouter({ provider: "openrouter", model: "anthropic/claude-sonnet-5.5" })).toBe(true);
    expect(isAnthropicViaOpenRouter({ provider: "openrouter", model: "anthropic/claude-fable-5.1" })).toBe(true);
  });

  it("is false for other OpenRouter models and other providers", () => {
    expect(isAnthropicViaOpenRouter({ provider: "openrouter", model: "google/gemini-3.1-flash-lite" })).toBe(false);
    expect(isAnthropicViaOpenRouter({ provider: "openrouter", model: "z-ai/glm-5.2" })).toBe(false);
    expect(isAnthropicViaOpenRouter({ provider: "mistral", model: "anthropic/claude-sonnet-5.5" })).toBe(false);
  });
});

describe("Claude 5.5 request shaping", () => {
  it("sends no sampling parameters on the streaming path, even with the story stage's settings", async () => {
    const body = await streamedBody({
      messages: [{ role: "user", content: "hello" }],
      model: "Claude Sonnet 5.5",
      openRouterKey: "test-key",
      temperature: 0.8,
      samplingSettings: SAMPLING,
    });
    for (const field of SAMPLING_FIELDS) expect(body).not.toHaveProperty(field);
    expect(body.model).toBe("anthropic/claude-sonnet-5.5");
  });

  it("sends no temperature on the non-streaming path", async () => {
    const fetchMock = stubProviderFetch();
    await generateNonStreaming({
      messages: [{ role: "user", content: "hello" }],
      model: "Claude Haiku 5.5",
      openRouterKey: "test-key",
      temperature: 0.3,
    });
    expect(sentBody(fetchMock)).not.toHaveProperty("temperature");
  });

  it("sends tool_choice auto when a gate forces a tool call, on both paths", async () => {
    const streamed = await streamedBody({
      messages: [{ role: "user", content: "roll" }],
      tools: TOOLS,
      toolChoice: "required",
      model: "Claude Opus 5.5",
      openRouterKey: "test-key",
    });
    expect(streamed.tool_choice).toBe("auto");

    const fetchMock = stubProviderFetch();
    await generateNonStreaming({
      messages: [{ role: "user", content: "roll" }],
      tools: TOOLS,
      toolChoice: "required",
      model: "Claude Opus 5.5",
      openRouterKey: "test-key",
    });
    expect(sentBody(fetchMock).tool_choice).toBe("auto");
  });

  it.each([
    ["with tools", TOOLS],
    ["without tools", undefined],
  ])("strips a trailing assistant prefill %s", async (_label, tools) => {
    const body = await streamedBody({
      messages: [
        { role: "system", content: "sys" },
        { role: "user", content: "> I open the door" },
        { role: "assistant", content: "<thinking>" },
      ],
      tools,
      model: "Claude Sonnet 5.5",
      openRouterKey: "test-key",
    });
    const last = body.messages[body.messages.length - 1];
    expect(last.role).toBe("user");
    expect(body.messages).toHaveLength(2);
  });

  it("drops a mid-history prefill that would open the tool loop's assistant turn", async () => {
    const body = await streamedBody({
      messages: [
        { role: "system", content: "sys" },
        { role: "user", content: "> I attack" },
        { role: "assistant", content: "<thinking>" },
        {
          role: "assistant",
          content: "",
          reasoning_details: [{ type: "reasoning.text", text: "", signature: "sig-1" }],
          tool_calls: [{ id: "call_1", type: "function", function: { name: "formula_roll", arguments: "{}" } }],
        },
        { role: "tool", content: "rolled 14", tool_call_id: "call_1" },
      ],
      tools: TOOLS,
      model: "Claude Sonnet 5.5",
      openRouterKey: "test-key",
    });
    expect(body.messages.map((m) => m.role)).toEqual(["system", "user", "assistant", "tool"]);
    expect(body.messages[2].tool_calls).toHaveLength(1);
  });

  it("keeps an earlier turn's prose that sits directly before a tool-calling message", async () => {
    // A round the roll gate sent back is saved without the gate's re-prompt,
    // so an earlier turn can hold prose followed directly by a tool call.
    // Only the current turn's prefill is dropped.
    const body = await streamedBody({
      messages: [
        { role: "system", content: "sys" },
        { role: "user", content: "> earlier attack" },
        { role: "assistant", content: "The goblin circles you, blade low." },
        {
          role: "assistant",
          content: "",
          tool_calls: [{ id: "call_0", type: "function", function: { name: "formula_roll", arguments: "{}" } }],
        },
        { role: "tool", content: "rolled 9", tool_call_id: "call_0" },
        { role: "assistant", content: "Your swing goes wide." },
        { role: "user", content: "> I attack again" },
      ],
      tools: TOOLS,
      model: "Claude Sonnet 5.5",
      openRouterKey: "test-key",
    });
    expect(body.messages.map((m) => m.content)).toContain("The goblin circles you, blade low.");
    expect(body.messages).toHaveLength(7);
  });

  it("raises a small max_tokens to the Claude floor and leaves larger caps alone", async () => {
    const small = await streamedBody({
      messages: [{ role: "user", content: "verdict?" }],
      model: "Claude Haiku 5.5",
      openRouterKey: "test-key",
      maxTokens: 200,
    });
    expect(small.max_tokens).toBe(4096);

    const large = await streamedBody({
      messages: [{ role: "user", content: "narrate" }],
      model: "Claude Haiku 5.5",
      openRouterKey: "test-key",
      maxTokens: 8000,
    });
    expect(large.max_tokens).toBe(8000);

    const fetchMock = stubProviderFetch();
    await generateNonStreaming({
      messages: [{ role: "user", content: "verdict?" }],
      model: "Claude Haiku 5.5",
      openRouterKey: "test-key",
      maxTokens: 10,
    });
    expect(sentBody(fetchMock).max_tokens).toBe(4096);

    const glm = await streamedBody({
      messages: [{ role: "user", content: "verdict?" }],
      model: "GLM 5.2",
      openRouterKey: "test-key",
      maxTokens: 200,
    });
    expect(glm.max_tokens).toBe(200);
  });

  it("maps effort none to low, and keeps the other levels", async () => {
    const none = await streamedBody({
      messages: [{ role: "user", content: "hi" }],
      model: "Claude Sonnet 5.5",
      openRouterKey: "test-key",
      reasoningEffort: "none",
    });
    expect(none.reasoning).toEqual({ effort: "low" });

    const high = await streamedBody({
      messages: [{ role: "user", content: "hi" }],
      model: "Claude Sonnet 5.5",
      openRouterKey: "test-key",
      reasoningEffort: "high",
    });
    expect(high.reasoning).toEqual({ effort: "high" });
  });

  it("replays only the current turn's signed thinking, never plain-text reasoning", async () => {
    const body = await streamedBody({
      messages: [
        { role: "system", content: "sys" },
        { role: "user", content: "> earlier action" },
        {
          role: "assistant",
          content: "Earlier narration.",
          reasoning: "old plain thoughts",
          reasoning_details: [{ type: "reasoning.text", text: "", signature: "old-sig" }],
        },
        { role: "user", content: "> I attack" },
        {
          role: "assistant",
          content: "",
          reasoning: "new plain thoughts",
          reasoning_details: [{ type: "reasoning.text", text: "", signature: "new-sig" }],
          tool_calls: [{ id: "call_1", type: "function", function: { name: "formula_roll", arguments: "{}" } }],
        },
        { role: "tool", content: "rolled 14", tool_call_id: "call_1" },
      ],
      tools: TOOLS,
      model: "Claude Sonnet 5.5",
      openRouterKey: "test-key",
    });
    expect(body.messages[2].reasoning_details).toBeUndefined();
    expect(body.messages[4].reasoning_details).toEqual([
      { type: "reasoning.text", text: "", signature: "new-sig" },
    ]);
    for (const m of body.messages) expect(m).not.toHaveProperty("reasoning");
  });

  it("never turns Claude's reasoning into a Gemini thought_signature", async () => {
    const body = await streamedBody({
      messages: [
        { role: "user", content: "> I attack" },
        {
          role: "assistant",
          content: "",
          reasoning_details: [{ type: "reasoning.encrypted", data: "redacted-blob" }],
          tool_calls: [{ id: "call_1", type: "function", function: { name: "formula_roll", arguments: "{}" } }],
        },
        { role: "tool", content: "rolled 14", tool_call_id: "call_1" },
      ],
      tools: TOOLS,
      model: "Claude Sonnet 5.5",
      openRouterKey: "test-key",
    });
    expect(body.messages[1].tool_calls?.[0].extra_content).toBeUndefined();
  });

  it("applies to a custom OpenRouter model with an anthropic/ id", async () => {
    const body = await streamedBody({
      messages: [
        { role: "user", content: "hi" },
        { role: "assistant", content: "<thinking>" },
      ],
      model: "0f8fad5b-d9cb-469f-a165-70867728950e",
      customModel: {
        id: "0f8fad5b-d9cb-469f-a165-70867728950e",
        name: "Claude Fable 5.1",
        modelId: "anthropic/claude-fable-5.1",
        contextSize: 1000000,
        maxOutputTokens: 128000,
      } as GenerateRequestBody["customModel"],
      openRouterKey: "test-key",
      temperature: 0.7,
      reasoningEffort: "none",
    });
    expect(body.model).toBe("anthropic/claude-fable-5.1");
    expect(body).not.toHaveProperty("temperature");
    expect(body.reasoning).toEqual({ effort: "low" });
    expect(body.messages).toHaveLength(1);
  });
});

describe("regressions on other models", () => {
  it("still sends sampling, forced tool_choice, effort none and the prefill for a non-Claude OpenRouter model", async () => {
    const body = await streamedBody({
      messages: [
        { role: "user", content: "hi" },
        { role: "assistant", content: "<thinking>" },
      ],
      tools: TOOLS,
      toolChoice: "required",
      model: "GLM 5.2",
      openRouterKey: "test-key",
      samplingSettings: SAMPLING,
      reasoningEffort: "none",
    });
    expect(body.temperature).toBe(0.9);
    expect(body.top_k).toBe(40);
    expect(body.tool_choice).toBe("required");
    expect(body.reasoning).toEqual({ effort: "none" });
    expect(body.messages[body.messages.length - 1].role).toBe("assistant");
    for (const m of body.messages) expect(typeof m.content).toBe("string");
  });

  it("still attaches the thought_signature for a google/ model on OpenRouter", async () => {
    const body = await streamedBody({
      messages: [
        { role: "user", content: "> I attack" },
        {
          role: "assistant",
          content: "",
          reasoning_details: [{ type: "reasoning.encrypted", data: "gemini-sig" }],
          tool_calls: [{ id: "call_1", type: "function", function: { name: "formula_roll", arguments: "{}" } }],
        },
        { role: "tool", content: "rolled 14", tool_call_id: "call_1" },
      ],
      tools: TOOLS,
      model: "Gemini 3.1 Flash Lite",
      openRouterKey: "test-key",
    });
    expect(body.messages[1].tool_calls?.[0].extra_content).toEqual({
      google: { thought_signature: "gemini-sig" },
    });
  });

  it("never sends cache_control to a non-Claude model, even with a marked message", async () => {
    const body = await streamedBody({
      messages: [
        { role: "system", content: "sys" },
        { role: "user", content: "> I attack", cacheBreakpoint: "turn" },
      ],
      tools: TOOLS,
      model: "GLM 5.2",
      openRouterKey: "test-key",
    });
    expect(JSON.stringify(body)).not.toContain("cache_control");
    expect(JSON.stringify(body)).not.toContain("cacheBreakpoint");
  });
});

describe("Claude prompt caching on the GM stage (A3)", () => {
  function createTestStory(): StoryData {
    return {
      story_name: "Test Story",
      premise: "A heist in a floating city.",
      player_name: "Test Player",
      player_summary: "A nimble thief.",
      intro: "The vault door looms.",
      points: 0,
      earnedPointsFromQuests: [],
      earnedPointsFromChapters: [],
      currentChapter: 0,
      max_chapters: 10,
      scene: { parts: [] },
      chapters: [],
      quests: [],
      stats: [],
      resources: [],
      inventory: [],
      achievements: [],
      lore: [],
      memory: [],
      momentum: 0,
      maxMomentum: 10,
      relationships: [],
      rpgSystem: "3d6",
      abilities: [],
      level: 1,
      upgradesSpent: 0,
      conditions: [],
      npcs: [],
    } as unknown as StoryData;
  }

  /** Runs a two-round scripted GM turn and returns the request bodies of both rounds. */
  async function scriptedTurnBodies(): Promise<GenerateRequestBody[]> {
    const { fetchMock, gmStageCalls } = createMockGMFetch([
      { content: "", toolCalls: [{ name: "calculate", arguments: { expression: "12+3 >= 15" } }] },
      { content: "The lock clicks open under your fingers." },
    ]);
    vi.stubGlobal("fetch", fetchMock);
    const result = await generateStoryTurn(
      createTestStory(),
      "I pick the vault lock",
      {
        storyModel: "test-model",
        toolsModel: "test-model",
        choicesModel: "test-model",
        enableTools: true,
        skipChoices: true,
      },
      {},
    );
    expect(result.success).toBe(true);
    vi.unstubAllGlobals();
    const calls = gmStageCalls();
    expect(calls).toHaveLength(2);
    return calls.map((c) => c.body as unknown as GenerateRequestBody);
  }

  function breakpointIndexes(messages: SentMessage[]): number[] {
    return messages
      .map((m, i) => (Array.isArray(m.content) && m.content.some((p) => p.cache_control) ? i : -1))
      .filter((i) => i >= 0);
  }

  it("puts the breakpoints on the system message, the end of history and the player's action, the same messages in rounds 1 and 2", async () => {
    const [round1, round2] = await scriptedTurnBodies();
    const asClaude = (b: GenerateRequestBody): GenerateRequestBody => ({
      ...b,
      model: "Claude Sonnet 5.5",
      openRouterKey: "test-key",
    });

    const sent1 = await streamedBody(asClaude(round1));
    const sent2 = await streamedBody(asClaude(round2));

    const marks1 = breakpointIndexes(sent1.messages);
    const marks2 = breakpointIndexes(sent2.messages);
    // Round 1 has no round history yet: system, the end of history (here the
    // acknowledgement after the stable block) and the action. Round 1 here
    // made a tool call with no text, and a round mark never lands on a tool
    // message (or an empty one), so round 2 carries the same three.
    expect(marks1).toHaveLength(3);
    expect(marks2).toEqual(marks1);
    expect(marks1[0]).toBe(0);
    expect(sent1.messages[0].role).toBe("system");
    expect(sent1.messages[marks1[1]].role).toBe("assistant");

    // marks1[2] is the action; keep the older names below.
    marks1.splice(1, 1);
    const action1 = sent1.messages[marks1[1]];
    expect(action1.role).toBe("user");
    const actionPart = (action1.content as SentPart[])[0];
    expect(actionPart.text).toContain("I pick the vault lock");
    expect(actionPart.cache_control).toEqual({ type: "ephemeral" });

    // Everything up to and including the second breakpoint is byte-identical
    // between the rounds - the cached prefix never varies inside a turn.
    const prefix = (m: SentMessage[]) => JSON.stringify(m.slice(0, marks1[1] + 1));
    expect(prefix(sent2.messages)).toBe(prefix(sent1.messages));

    // Round 2 continues the tool loop: the default tier's <thinking> prefill
    // was dropped from mid-history, so the round's own assistant message
    // follows the player's action directly.
    const afterAction = sent2.messages[marks1[1] + 1];
    expect(afterAction.role).toBe("assistant");
    expect(afterAction.tool_calls?.[0]?.function?.name).toBe("calculate");
    expect(sent1.messages[sent1.messages.length - 1].role).toBe("user");
  });

  it("puts no breakpoint on the story stage's tool-less request", async () => {
    const [round1] = await scriptedTurnBodies();
    const sent = await streamedBody({
      ...round1,
      tools: undefined,
      model: "Claude Sonnet 5.5",
      openRouterKey: "test-key",
    });
    expect(JSON.stringify(sent)).not.toContain("cache_control");
  });
});

describe("Claude's billed cost", () => {
  function stubJsonUsage(usage: Record<string, unknown>) {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => ({ ...SIMPLE_RESPONSE, usage }),
        text: async () => "",
      })),
    );
  }

  const CACHED_ROUND_USAGE = {
    prompt_tokens: 36000,
    completion_tokens: 400,
    total_tokens: 36400,
    prompt_tokens_details: { cached_tokens: 35000, cache_write_tokens: 0 },
    cost: 0.0095,
  };

  it("reports OpenRouter's billed cost for Claude, which prices the cache", async () => {
    stubJsonUsage(CACHED_ROUND_USAGE);
    const result = await generateNonStreaming({
      messages: [{ role: "user", content: "hi" }],
      model: "Claude Sonnet 5.5",
      openRouterKey: "test-key",
    });
    if ("error" in result) throw new Error(result.error);
    expect(result.meta.estimatedCost).toBe(0.0095);
  });

  it("adds the provider's charge to OpenRouter's fee under OpenRouter BYOK", async () => {
    stubJsonUsage({
      ...CACHED_ROUND_USAGE,
      cost: 0.0005,
      is_byok: true,
      cost_details: { upstream_inference_cost: 0.009 },
    });
    const result = await generateNonStreaming({
      messages: [{ role: "user", content: "hi" }],
      model: "Claude Sonnet 5.5",
      openRouterKey: "test-key",
    });
    if ("error" in result) throw new Error(result.error);
    expect(result.meta.estimatedCost).toBeCloseTo(0.0095, 10);
  });

  it("carries the billed cost on the streaming path's done frame", async () => {
    const encoder = new TextEncoder();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        statusText: "OK",
        text: async () => "",
        body: new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ choices: [{ delta: { content: "The lock clicks." } }] })}\n\n` +
                  `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: null }], usage: CACHED_ROUND_USAGE })}\n\n` +
                  "data: [DONE]\n\n",
              ),
            );
            controller.close();
          },
        }),
      })),
    );
    const frames = await drain(
      generateStream({
        messages: [{ role: "user", content: "hi" }],
        model: "Claude Sonnet 5.5",
        openRouterKey: "test-key",
      }),
    );
    const done = frames
      .split("\n\n")
      .map((f) => f.replace(/^data: /, ""))
      .filter((f) => f.startsWith("{"))
      .map((f) => JSON.parse(f))
      .find((e) => e.type === "done");
    expect(done.meta.estimatedCost).toBe(0.0095);
  });

  it("leaves other OpenRouter models on list-price arithmetic", async () => {
    stubJsonUsage(CACHED_ROUND_USAGE);
    const result = await generateNonStreaming({
      messages: [{ role: "user", content: "hi" }],
      model: "GLM 5.2",
      openRouterKey: "test-key",
    });
    if ("error" in result) throw new Error(result.error);
    expect(result.meta.estimatedCost).toBeUndefined();
  });
});
