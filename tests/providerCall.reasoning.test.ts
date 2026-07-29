/**
 * Reasoning-effort request shaping and reasoning-content response parsing
 * in app/misc/providerCall.ts - the shared request/response logic behind
 * both /api/generate(-stream) and the standalone build's direct provider
 * calls.
 *
 * Focused on the two things that most directly decide whether a
 * reasoning-tier assignment (app/misc/reasoningTiers.ts) actually does what
 * it claims to:
 *  - applyReasoningEffort's per-provider translation, especially OpenRouter's
 *    "none" case - it must send an explicit `reasoning: {effort: "none"}`,
 *    not just omit the field. Omitting it falls back to the model's own
 *    default, and some OpenRouter models default to reasoning ON (e.g. Grok
 *    4.5 defaults to "high" effort even with no reasoning param sent at
 *    all) - a "none" tier would otherwise silently keep paying for
 *    reasoning tokens while turnCost.ts's REASONING_OUTPUT_MULTIPLIER
 *    assumes "none" means no reasoning overhead.
 *  - reasoning/reasoning_details response parsing, both non-streaming and
 *    streaming, across the OpenRouter-normalized and DeepSeek-native shapes.
 *
 * Not covered here: the reasoning.encrypted -> thought_signature replay
 * scoping fix, which lives in ai_staged.ts's history builder and is
 * exercised in tests/aiStaged.reasoningReplayScope.test.ts.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  generateNonStreaming,
  generateStream,
  GenerateRequestBody,
} from "@/app/misc/providerCall";

function mockJsonFetchOnce(responseBody: unknown) {
  const fetchMock = vi.fn(async () => ({
    ok: true,
    status: 200,
    statusText: "OK",
    json: async () => responseBody,
    text: async () => JSON.stringify(responseBody),
  }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function capturedBody(fetchMock: ReturnType<typeof vi.fn>): any {
  const call = fetchMock.mock.calls[0];
  const init = call[1] as RequestInit;
  return JSON.parse(init.body as string);
}

const BASE_MESSAGES: GenerateRequestBody["messages"] = [
  { role: "user", content: "hello" },
];

const SIMPLE_RESPONSE = {
  choices: [
    {
      index: 0,
      message: { role: "assistant", content: "hi" },
      finish_reason: "stop",
    },
  ],
  usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
};

describe("applyReasoningEffort (via generateNonStreaming)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends an explicit reasoning.effort:none for OpenRouter instead of omitting the field", async () => {
    const fetchMock = mockJsonFetchOnce(SIMPLE_RESPONSE);

    await generateNonStreaming({
      messages: BASE_MESSAGES,
      model: "GLM 5.2",
      openRouterKey: "test-key",
      reasoningEffort: "none",
    });

    const body = capturedBody(fetchMock);
    expect(body.reasoning).toEqual({ effort: "none" });
  });

  it.each([
    ["low", "low"],
    ["normal", "medium"],
    ["high", "high"],
    ["xhigh", "xhigh"],
  ])("maps tier effort %s to OpenRouter's reasoning.effort %s", async (tierEffort, apiEffort) => {
    const fetchMock = mockJsonFetchOnce(SIMPLE_RESPONSE);

    await generateNonStreaming({
      messages: BASE_MESSAGES,
      model: "GLM 5.2",
      openRouterKey: "test-key",
      reasoningEffort: tierEffort,
    });

    const body = capturedBody(fetchMock);
    expect(body.reasoning).toEqual({ effort: apiEffort });
  });

  it("omits reasoning entirely for OpenRouter when no reasoningEffort is set", async () => {
    // Undefined means the caller has no opinion (see layerSettings.ts) -
    // distinct from an explicit "none", which must actively disable
    // reasoning. Omitting here lets the model's own default apply.
    const fetchMock = mockJsonFetchOnce(SIMPLE_RESPONSE);

    await generateNonStreaming({
      messages: BASE_MESSAGES,
      model: "GLM 5.2",
      openRouterKey: "test-key",
    });

    const body = capturedBody(fetchMock);
    expect(body.reasoning).toBeUndefined();
  });

  it("still disables DeepSeek's own thinking toggle at effort none (unaffected by the OpenRouter fix)", async () => {
    const fetchMock = mockJsonFetchOnce(SIMPLE_RESPONSE);

    await generateNonStreaming({
      messages: BASE_MESSAGES,
      model: "DeepSeek V4 Flash",
      deepseekKey: "test-key",
      reasoningEffort: "none",
    });

    const body = capturedBody(fetchMock);
    expect(body.thinking).toEqual({ type: "disabled" });
    expect(body.reasoning).toBeUndefined();
    expect(body.reasoning_effort).toBeUndefined();
  });

  it("maps xhigh to DeepSeek's max thinking effort", async () => {
    const fetchMock = mockJsonFetchOnce(SIMPLE_RESPONSE);

    await generateNonStreaming({
      messages: BASE_MESSAGES,
      model: "DeepSeek V4 Flash",
      deepseekKey: "test-key",
      reasoningEffort: "xhigh",
    });

    const body = capturedBody(fetchMock);
    expect(body.thinking).toEqual({ type: "enabled" });
    expect(body.reasoning_effort).toBe("max");
  });

  it("collapses Mistral's effort scale to high|none", async () => {
    const fetchMock = mockJsonFetchOnce(SIMPLE_RESPONSE);

    await generateNonStreaming({
      messages: BASE_MESSAGES,
      model: "Mistral Small 3.2",
      mistralKey: "test-key",
      reasoningEffort: "low",
    });

    const body = capturedBody(fetchMock);
    expect(body.reasoning_effort).toBe("high");
  });
});

describe("reasoning response parsing (non-streaming)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reads OpenRouter's top-level reasoning/reasoning_details fields", async () => {
    mockJsonFetchOnce({
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: "The door creaks open.",
            reasoning: "The player wants to open the door.",
            reasoning_details: [{ type: "reasoning.text", text: "..." }],
          },
          finish_reason: "stop",
        },
      ],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    });

    const result = await generateNonStreaming({
      messages: BASE_MESSAGES,
      model: "GLM 5.2",
      openRouterKey: "test-key",
    });

    if ("error" in result) throw new Error(result.error);
    expect(result.reasoning).toBe("The player wants to open the door.");
    expect(result.reasoning_details).toEqual([
      { type: "reasoning.text", text: "..." },
    ]);
  });

  it("falls back to DeepSeek's native reasoning_content field when reasoning is absent", async () => {
    mockJsonFetchOnce({
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: "The door creaks open.",
            reasoning_content: "Chain of thought here.",
          },
          finish_reason: "stop",
        },
      ],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    });

    const result = await generateNonStreaming({
      messages: BASE_MESSAGES,
      model: "DeepSeek V4 Flash",
      deepseekKey: "test-key",
    });

    if ("error" in result) throw new Error(result.error);
    expect(result.reasoning).toBe("Chain of thought here.");
  });
});

describe("reasoning response parsing (streaming)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function sseResponse(frames: unknown[]): Response {
    const encoder = new TextEncoder();
    return {
      ok: true,
      status: 200,
      text: async () => "",
      body: new ReadableStream<Uint8Array>({
        start(controller) {
          for (const frame of frames) {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify(frame)}\n\n`),
            );
          }
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        },
      }),
    } as unknown as Response;
  }

  async function collectEvents(stream: ReadableStream<Uint8Array>) {
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    const events: any[] = [];
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (value) buffer += decoder.decode(value, { stream: true });
      if (done) break;
    }
    const lines = buffer.split("\n\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const data = trimmed.slice(5).trim();
      if (data === "[DONE]" || !data) continue;
      events.push(JSON.parse(data));
    }
    return events;
  }

  it("emits a reasoning event from OpenRouter's delta.reasoning", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        sseResponse([
          { choices: [{ delta: { reasoning: "Thinking about the door..." } }] },
          { choices: [{ delta: { content: "The door creaks open." } }] },
          {
            choices: [{ delta: {}, finish_reason: "stop" }],
            usage: { prompt_tokens: 10, completion_tokens: 5 },
          },
        ]),
      ),
    );

    const stream = generateStream({
      messages: BASE_MESSAGES,
      model: "GLM 5.2",
      openRouterKey: "test-key",
    });

    const events = await collectEvents(stream);
    expect(
      events
        .filter((e) => e.type === "reasoning")
        .map((e) => e.content),
    ).toEqual(["Thinking about the door..."]);
    expect(
      events.some(
        (e) => e.type === "content" && e.content === "The door creaks open.",
      ),
    ).toBe(true);
  });

  it("emits a reasoning event from DeepSeek-native delta.reasoning_content", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        sseResponse([
          { choices: [{ delta: { reasoning_content: "DeepSeek chain of thought" } }] },
          {
            choices: [{ delta: {}, finish_reason: "stop" }],
            usage: { prompt_tokens: 10, completion_tokens: 5 },
          },
        ]),
      ),
    );

    const stream = generateStream({
      messages: BASE_MESSAGES,
      model: "DeepSeek V4 Flash",
      deepseekKey: "test-key",
    });

    const events = await collectEvents(stream);
    expect(
      events
        .filter((e) => e.type === "reasoning")
        .map((e) => e.content),
    ).toEqual(["DeepSeek chain of thought"]);
  });

  it("forwards reasoning_details deltas untouched", async () => {
    const details = [
      { type: "reasoning.encrypted", id: "rs_1", data: "opaque-blob" },
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        sseResponse([
          { choices: [{ delta: { reasoning_details: details } }] },
          {
            choices: [{ delta: {}, finish_reason: "stop" }],
            usage: { prompt_tokens: 10, completion_tokens: 5 },
          },
        ]),
      ),
    );

    const stream = generateStream({
      messages: BASE_MESSAGES,
      model: "GLM 5.2",
      openRouterKey: "test-key",
    });

    const events = await collectEvents(stream);
    const detailEvents = events.filter((e) => e.type === "reasoning_details");
    expect(detailEvents).toHaveLength(1);
    expect(detailEvents[0].details).toEqual(details);
  });
});

describe("reasoning field forwarding on outgoing messages (buildRequestMessages)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("restores reasoning/reasoning_details on outgoing OpenRouter messages", async () => {
    const fetchMock = mockJsonFetchOnce(SIMPLE_RESPONSE);

    await generateNonStreaming({
      messages: [
        { role: "user", content: "go north" },
        {
          role: "assistant",
          content: "You head north.",
          reasoning: "The player chose north.",
          reasoning_details: [{ type: "reasoning.text", text: "north" }],
        },
        { role: "user", content: "look around" },
      ],
      model: "GLM 5.2",
      openRouterKey: "test-key",
    });

    const body = capturedBody(fetchMock);
    const assistantMsg = body.messages.find((m: any) => m.role === "assistant");
    expect(assistantMsg.reasoning).toBe("The player chose north.");
    expect(assistantMsg.reasoning_details).toEqual([
      { type: "reasoning.text", text: "north" },
    ]);
  });

  it("does not attach reasoning fields for a provider without a reasoning replay lever (Mistral)", async () => {
    const fetchMock = mockJsonFetchOnce(SIMPLE_RESPONSE);

    await generateNonStreaming({
      messages: [
        { role: "user", content: "go north" },
        {
          role: "assistant",
          content: "You head north.",
          reasoning: "The player chose north.",
        },
      ],
      model: "Mistral Small 3.2",
      mistralKey: "test-key",
    });

    const body = capturedBody(fetchMock);
    const assistantMsg = body.messages.find((m: any) => m.role === "assistant");
    expect(assistantMsg.reasoning).toBeUndefined();
  });
});

/**
 * DeepSeek's thinking mode rejects a request whose assistant messages carried
 * tool calls without their `reasoning_content` - "The `reasoning_content` in
 * the thinking mode must be passed back to the API", HTTP 400
 * (api-docs.deepseek.com/guides/thinking_mode). The GM stage is a tool loop,
 * so every round after the first hit this: the CoT was captured off the
 * response but never sent back under the name DeepSeek expects.
 */
describe("DeepSeek thinking-mode reasoning_content round-trip", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const TOOL_ROUND: GenerateRequestBody["messages"] = [
    { role: "user", content: "> try the door" },
    {
      role: "assistant",
      content: "",
      reasoning: "Locked door, opposed roll against the lock.",
      tool_calls: [
        {
          id: "call_1",
          type: "function",
          function: { name: "formula_roll", arguments: '{"formulas":["1d20+3"]}' },
        },
      ],
    },
    { role: "tool", content: "Rolled 17.", tool_call_id: "call_1" },
  ];

  it("sends the captured reasoning back as reasoning_content", async () => {
    const fetchMock = mockJsonFetchOnce(SIMPLE_RESPONSE);

    await generateNonStreaming({
      messages: TOOL_ROUND,
      model: "DeepSeek V4 Flash",
      deepseekKey: "test-key",
      reasoningEffort: "high",
    });

    const assistantMsg = capturedBody(fetchMock).messages.find(
      (m: { role: string }) => m.role === "assistant",
    );
    expect(assistantMsg.reasoning_content).toBe(
      "Locked door, opposed roll against the lock.",
    );
    // Verbatim - truncating or summarizing it is rejected too.
    expect(assistantMsg.tool_calls).toHaveLength(1);
  });

  it("still sends the key on a tool-call message whose reasoning is gone", async () => {
    // Compaction prunes reasoning off aged scene parts, and legacy saves
    // synthesize tool calls with none. Omitting the field is a guaranteed
    // 400, so an empty value is the only remaining shot.
    const fetchMock = mockJsonFetchOnce(SIMPLE_RESPONSE);

    await generateNonStreaming({
      messages: [
        TOOL_ROUND[0],
        { ...TOOL_ROUND[1], reasoning: undefined },
        TOOL_ROUND[2],
      ],
      model: "DeepSeek V4 Flash",
      deepseekKey: "test-key",
      reasoningEffort: "high",
    });

    const assistantMsg = capturedBody(fetchMock).messages.find(
      (m: { role: string }) => m.role === "assistant",
    );
    expect(assistantMsg.reasoning_content).toBe("");
  });

  it("leaves an ordinary assistant message without tool calls alone", async () => {
    const fetchMock = mockJsonFetchOnce(SIMPLE_RESPONSE);

    await generateNonStreaming({
      messages: [
        { role: "user", content: "go north" },
        { role: "assistant", content: "You head north." },
        { role: "user", content: "look around" },
      ],
      model: "DeepSeek V4 Flash",
      deepseekKey: "test-key",
      reasoningEffort: "high",
    });

    const assistantMsg = capturedBody(fetchMock).messages.find(
      (m: { role: string }) => m.role === "assistant",
    );
    expect(assistantMsg.reasoning_content).toBeUndefined();
  });

  it("does not put reasoning_content on a prefill the model is still writing", async () => {
    const fetchMock = mockJsonFetchOnce(SIMPLE_RESPONSE);

    await generateNonStreaming({
      messages: [
        { role: "user", content: "go north" },
        {
          role: "assistant",
          content: "<thinking>",
          reasoning: "leftover from an earlier round",
        },
      ],
      model: "DeepSeek V4 Flash",
      deepseekKey: "test-key",
    });

    const messages = capturedBody(fetchMock).messages;
    const prefill = messages[messages.length - 1];
    expect(prefill.prefix).toBe(true);
    expect(prefill.reasoning_content).toBeUndefined();
  });

  it("does not leak reasoning_content into other providers' requests", async () => {
    const fetchMock = mockJsonFetchOnce(SIMPLE_RESPONSE);

    await generateNonStreaming({
      messages: TOOL_ROUND,
      model: "GLM 5.2",
      openRouterKey: "test-key",
    });

    const assistantMsg = capturedBody(fetchMock).messages.find(
      (m: { role: string }) => m.role === "assistant",
    );
    expect(assistantMsg.reasoning_content).toBeUndefined();
    expect(assistantMsg.reasoning).toBe(
      "Locked door, opposed roll against the lock.",
    );
  });
});
