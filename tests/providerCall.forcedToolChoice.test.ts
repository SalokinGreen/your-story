/**
 * Forced tool choice (`tool_choice: "required"`) on the models the 2026-10-21
 * catalog refresh added (docs/research/gm-models-2026-10-21.md §6).
 *
 * The roll and plan gates send `toolChoice: "required"`. Claude (a 400) and
 * Z.ai (accepts "auto" only) already get "auto" instead, with the gate's own
 * user message doing the forcing. Qwen 3.8 thinks by default and is reported
 * to 400 on a forced tool call with thinking on, though OpenRouter lists
 * `tool_choice` among its supported parameters, so it gets "auto" too. Every
 * other model added in the refresh lists `tool_choice` on OpenRouter (or, for
 * the direct Google, Mistral and DeepSeek routes, takes it natively) and keeps
 * getting the forced value.
 *
 * Also checks that the new DeepSeek entries go through the same
 * `reasoning_content` replay as the old ones.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  generateNonStreaming,
  generateStream,
  modelRejectsForcedToolChoice,
  GenerateRequestBody,
} from "@/app/misc/providerCall";
import { AI_MODELS } from "@/app/misc/ai_prices";

const SIMPLE_RESPONSE = {
  choices: [{ index: 0, message: { role: "assistant", content: "hi" }, finish_reason: "stop" }],
  usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
};

function stubFetch() {
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

interface SentBody {
  model: string;
  messages: { role: string; reasoning_content?: string; tool_calls?: unknown[] }[];
  tool_choice?: string;
  [field: string]: unknown;
}

function sent(fetchMock: ReturnType<typeof vi.fn>): { url: string; body: SentBody } {
  const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
  return { url, body: JSON.parse(init.body as string) };
}

const KEYS = {
  openRouterKey: "or-key",
  deepseekKey: "ds-key",
  googleKey: "g-key",
  mistralKey: "m-key",
};

const TOOLS = [
  { type: "function", function: { name: "formula_roll", description: "Roll.", parameters: { type: "object" } } },
];

async function toolChoiceSent(
  path: "streaming" | "non-streaming",
  body: Partial<GenerateRequestBody>,
): Promise<string | undefined> {
  const fetchMock = stubFetch();
  const request: GenerateRequestBody = {
    messages: [{ role: "user", content: "roll for the lock" }],
    tools: TOOLS,
    ...KEYS,
    ...body,
  };
  if (path === "non-streaming") {
    await generateNonStreaming(request);
  } else {
    const reader = generateStream(request).getReader();
    while (!(await reader.read()).done) {
      // drain
    }
  }
  return sent(fetchMock).body.tool_choice;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("modelRejectsForcedToolChoice", () => {
  it("is true for the Qwen 3.8 family on OpenRouter", () => {
    for (const model of ["qwen/qwen3.8-max-0902", "qwen/qwen3.8-flash", "qwen/qwen3.8-max", "Qwen/Qwen3.8-27B"]) {
      expect(modelRejectsForcedToolChoice({ provider: "openrouter", model }), model).toBe(true);
    }
  });

  it("is false for other models, other Qwens, and other providers", () => {
    for (const model of ["x-ai/grok-4.7", "openai/gpt-6.1-sol", "google/gemini-4-argon", "qwen/qwen3-max-thinking"]) {
      expect(modelRejectsForcedToolChoice({ provider: "openrouter", model }), model).toBe(false);
    }
    expect(modelRejectsForcedToolChoice({ provider: "deepinfra", model: "qwen/qwen3.8-max" })).toBe(false);
  });

  it("covers every Qwen 3.8 entry the catalog has", () => {
    const qwen38 = Object.values(AI_MODELS).filter((m) => m.model.toLowerCase().startsWith("qwen/qwen3.8"));
    expect(qwen38.length).toBeGreaterThanOrEqual(2);
    for (const m of qwen38) expect(modelRejectsForcedToolChoice(m), m.name).toBe(true);
  });
});

describe.each(["streaming", "non-streaming"] as const)("a gate's forced tool call, %s", (path) => {
  it.each(["Qwen 3.8 Max", "Qwen 3.8 Flash"])("goes to %s as tool_choice auto", async (model) => {
    expect(await toolChoiceSent(path, { model, toolChoice: "required" })).toBe("auto");
  });

  it("goes to a custom Qwen 3.8 model as auto too", async () => {
    const id = "123e4567-e89b-42d3-a456-426614174000";
    const choice = await toolChoiceSent(path, {
      model: id,
      toolChoice: "required",
      customModel: {
        id,
        modelId: "qwen/qwen3.8-27b",
        name: "Qwen 27B",
        contextSize: 1000000,
        maxOutputTokens: 8000,
      },
    });
    expect(choice).toBe("auto");
  });

  it.each([
    "Grok 4.7",
    "GPT-6.1 Sol",
    "GPT-6 Luna",
    "DeepSeek V4.1 Flash",
    "Mistral Large 4",
    "Kimi K3",
  ])("still goes to %s as required", async (model) => {
    expect(await toolChoiceSent(path, { model, toolChoice: "required" })).toBe("required");
  });

  it("is auto without a forced choice, on Qwen and on everything else", async () => {
    expect(await toolChoiceSent(path, { model: "Qwen 3.8 Max" })).toBe("auto");
    expect(await toolChoiceSent(path, { model: "Grok 4.7" })).toBe("auto");
  });
});

// A system's turn-end reminder (decision 183) asks for an explicit "auto" so
// the GM can decline. An unset choice still means "required" on Google, which
// is why the explicit value exists.
describe.each(["streaming", "non-streaming"] as const)("an explicit auto, %s", (path) => {
  it("reaches Google as auto, where an unset choice is required", async () => {
    const google = "Google Gemini 2.5 Flash";
    expect(await toolChoiceSent(path, { model: google, toolChoice: "auto" })).toBe("auto");
    expect(await toolChoiceSent(path, { model: google })).toBe("required");
  });

  it("is auto on every other provider too", async () => {
    for (const model of ["Grok 4.7", "Mistral Large 4", "DeepSeek V4 Flash", "Qwen 3.8 Max"]) {
      expect(await toolChoiceSent(path, { model, toolChoice: "auto" }), model).toBe("auto");
    }
  });
});

describe("the new DeepSeek entries replay reasoning_content like the old ones", () => {
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

  it.each(["DeepSeek V4.1 Flash", "DeepSeek V4 Flash", "DeepSeek V4 Pro"])(
    "%s sends the model's reasoning back, to DeepSeek, by its documented API name",
    async (model) => {
      const fetchMock = stubFetch();
      await generateNonStreaming({
        messages: TOOL_ROUND,
        model,
        deepseekKey: "ds-key",
        reasoningEffort: "high",
      });
      const { url, body } = sent(fetchMock);
      expect(url).toBe("https://api.deepseek.com/chat/completions");
      expect(body.model).toMatch(/^deepseek-(flash|v4-pro)$/);
      const assistant = body.messages.find((m) => m.role === "assistant");
      expect(assistant?.reasoning_content).toBe("Locked door, opposed roll against the lock.");
    },
  );
});
