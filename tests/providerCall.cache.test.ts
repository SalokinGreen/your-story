/**
 * Provider caching and reasoning replay (token-savings plan slice 6,
 * design 4.6-4.7): Mistral's prompt_cache_key (with its one-shot retry),
 * OpenRouter's session_id, Claude's four breakpoints, and reasoning replayed
 * for the current turn only.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import {
  generateNonStreaming,
  resetMistralCacheKeyRejected,
  type GenerateRequestBody,
} from "@/app/misc/providerCall";

const OK_RESPONSE = {
  choices: [{ index: 0, message: { role: "assistant", content: "hi" }, finish_reason: "stop" }],
  usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
};

function okResponse() {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    json: async () => OK_RESPONSE,
    text: async () => JSON.stringify(OK_RESPONSE),
  };
}

function errorResponse(status: number, body: string) {
  const make = () => ({
    ok: false,
    status,
    statusText: "Error",
    text: async () => body,
    clone: () => make(),
  });
  return make();
}

type SentBody = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

function bodyOf(fetchMock: ReturnType<typeof vi.fn>, call = 0): SentBody {
  return JSON.parse((fetchMock.mock.calls[call][1] as RequestInit).body as string);
}

const TOOLS = [{ type: "function", function: { name: "calculate", parameters: { type: "object" } } }];
const MESSAGES: GenerateRequestBody["messages"] = [{ role: "user", content: "hello" }];

beforeEach(() => {
  resetMistralCacheKeyRejected();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("cache keys", () => {
  it("sends Mistral a prompt_cache_key", async () => {
    const fetchMock = vi.fn(async () => okResponse());
    vi.stubGlobal("fetch", fetchMock);
    await generateNonStreaming({
      messages: MESSAGES,
      model: "Mistral Small 4",
      mistralKey: "k",
      cacheKey: "ys:story-1:gm",
    });
    expect(bodyOf(fetchMock).prompt_cache_key).toBe("ys:story-1:gm");
  });

  it("retries a Mistral 422 naming prompt_cache_key once without it, and stops sending it", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(errorResponse(422, '{"detail":"Extra inputs are not permitted: prompt_cache_key"}'))
      .mockResolvedValue(okResponse());
    vi.stubGlobal("fetch", fetchMock);

    const first = await generateNonStreaming({
      messages: MESSAGES,
      model: "Mistral Small 4",
      mistralKey: "k",
      cacheKey: "ys:story-1:gm",
    });
    expect("error" in first).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(bodyOf(fetchMock, 0).prompt_cache_key).toBe("ys:story-1:gm");
    expect(bodyOf(fetchMock, 1).prompt_cache_key).toBeUndefined();

    await generateNonStreaming({
      messages: MESSAGES,
      model: "Mistral Small 4",
      mistralKey: "k",
      cacheKey: "ys:story-1:gm",
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(bodyOf(fetchMock, 2).prompt_cache_key).toBeUndefined();
  });

  it("does not retry a Mistral error that does not name the key", async () => {
    const fetchMock = vi.fn().mockResolvedValue(errorResponse(422, '{"detail":"bad tool schema"}'));
    vi.stubGlobal("fetch", fetchMock);
    const result = await generateNonStreaming({
      messages: MESSAGES,
      model: "Mistral Small 4",
      mistralKey: "k",
      cacheKey: "ys:story-1:gm",
    });
    expect("error" in result).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("sends OpenRouter a session_id, Claude's included, and nothing without a key", async () => {
    const fetchMock = vi.fn(async () => okResponse());
    vi.stubGlobal("fetch", fetchMock);
    await generateNonStreaming({
      messages: MESSAGES,
      model: "GLM 5.2",
      openRouterKey: "k",
      cacheKey: "ys:story-1:narration",
    });
    await generateNonStreaming({
      messages: MESSAGES,
      model: "Claude Sonnet 5.5",
      openRouterKey: "k",
      cacheKey: "ys:story-1:gm",
    });
    await generateNonStreaming({ messages: MESSAGES, model: "GLM 5.2", openRouterKey: "k" });
    expect(bodyOf(fetchMock, 0).session_id).toBe("ys:story-1:narration");
    expect(bodyOf(fetchMock, 1).session_id).toBe("ys:story-1:gm");
    expect(bodyOf(fetchMock, 2).session_id).toBeUndefined();
  });

  it("sends neither field to a provider with automatic caching", async () => {
    const fetchMock = vi.fn(async () => okResponse());
    vi.stubGlobal("fetch", fetchMock);
    await generateNonStreaming({
      messages: MESSAGES,
      model: "DeepSeek V4 Flash",
      deepseekKey: "k",
      cacheKey: "ys:story-1:gm",
    });
    const body = bodyOf(fetchMock);
    expect(body.session_id).toBeUndefined();
    expect(body.prompt_cache_key).toBeUndefined();
    expect(body.cacheKey).toBeUndefined();
  });
});

describe("Claude's four cache breakpoints", () => {
  const cachedIndexes = (messages: { content: unknown }[]) =>
    messages
      .map((m, i) => (Array.isArray(m.content) && m.content.some((p: { cache_control?: unknown }) => p.cache_control) ? i : -1))
      .filter((i) => i >= 0);

  it("marks the system message and the last message of each kind, four at most", async () => {
    const fetchMock = vi.fn(async () => okResponse());
    vi.stubGlobal("fetch", fetchMock);
    await generateNonStreaming({
      messages: [
        { role: "system", content: "system" },
        { role: "user", content: "stable" },
        { role: "assistant", content: "ack" },
        { role: "user", content: "old action" },
        { role: "assistant", content: "end of history", cacheBreakpoint: "prefix" },
        { role: "user", content: "live and action", cacheBreakpoint: "turn" },
        {
          role: "assistant",
          content: "Checking.",
          cacheBreakpoint: "round",
          tool_calls: [{ id: "c1", type: "function", function: { name: "calculate", arguments: "{}" } }],
        },
        { role: "tool", content: "result", tool_call_id: "c1" },
      ],
      tools: TOOLS,
      model: "Claude Sonnet 5.5",
      openRouterKey: "k",
    });
    expect(cachedIndexes(bodyOf(fetchMock).messages)).toEqual([0, 4, 5, 6]);
  });

  it("never marks an empty message, and collapses marks that land together", async () => {
    const fetchMock = vi.fn(async () => okResponse());
    vi.stubGlobal("fetch", fetchMock);
    await generateNonStreaming({
      messages: [
        { role: "system", content: "system" },
        { role: "user", content: "action", cacheBreakpoint: "turn" },
        { role: "assistant", content: "", cacheBreakpoint: "prefix" },
        { role: "user", content: "next", cacheBreakpoint: "turn" },
      ],
      tools: TOOLS,
      model: "Claude Sonnet 5.5",
      openRouterKey: "k",
    });
    expect(cachedIndexes(bodyOf(fetchMock).messages)).toEqual([0, 3]);
  });

  it("marks nothing without tools", async () => {
    const fetchMock = vi.fn(async () => okResponse());
    vi.stubGlobal("fetch", fetchMock);
    await generateNonStreaming({
      messages: [
        { role: "system", content: "system" },
        { role: "user", content: "action", cacheBreakpoint: "turn" },
      ],
      model: "Claude Sonnet 5.5",
      openRouterKey: "k",
    });
    expect(JSON.stringify(bodyOf(fetchMock))).not.toContain("cache_control");
  });
});

describe("reasoning replay", () => {
  const history: GenerateRequestBody["messages"] = [
    { role: "user", content: "old action" },
    {
      role: "assistant",
      content: "",
      reasoning: "old thoughts",
      reasoning_details: [{ type: "reasoning.text", text: "old" }],
      tool_calls: [{ id: "c0", type: "function", function: { name: "calculate", arguments: "{}" } }],
    },
    { role: "tool", content: "1", tool_call_id: "c0" },
    { role: "user", content: "new action" },
    {
      role: "assistant",
      content: "",
      reasoning: "new thoughts",
      reasoning_details: [{ type: "reasoning.text", text: "new" }],
      tool_calls: [{ id: "c1", type: "function", function: { name: "calculate", arguments: "{}" } }],
    },
    { role: "tool", content: "2", tool_call_id: "c1" },
  ];

  it("gives a non-Claude OpenRouter model the current turn's reasoning only", async () => {
    const fetchMock = vi.fn(async () => okResponse());
    vi.stubGlobal("fetch", fetchMock);
    await generateNonStreaming({
      messages: history,
      tools: TOOLS,
      model: "GLM 5.2",
      openRouterKey: "k",
    });
    const sent = bodyOf(fetchMock).messages;
    expect(sent[1].reasoning).toBeUndefined();
    expect(sent[1].reasoning_details).toBeUndefined();
    expect(sent[4].reasoning).toBe("new thoughts");
    expect(sent[4].reasoning_details).toEqual([{ type: "reasoning.text", text: "new" }]);
  });

  it("keeps DeepSeek's reasoning_content on every assistant tool call", async () => {
    const fetchMock = vi.fn(async () => okResponse());
    vi.stubGlobal("fetch", fetchMock);
    await generateNonStreaming({
      messages: history,
      tools: TOOLS,
      model: "DeepSeek V4 Flash",
      deepseekKey: "k",
      reasoningEffort: "high",
    });
    const sent = bodyOf(fetchMock).messages;
    expect(sent[1].reasoning_content).toBe("old thoughts");
    expect(sent[4].reasoning_content).toBe("new thoughts");
  });
});
