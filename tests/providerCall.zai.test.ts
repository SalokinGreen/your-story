/**
 * Z.ai as a direct provider (docs/claude-gm-design.md §8, plan §7 C1,
 * decision 18): GLM-5.3 on the player's own pay-as-you-go Z.ai key, through
 * Z.ai's general endpoint only - never the GLM Coding Plan's, which Z.ai
 * limits to its supported coding tools.
 *
 * Z.ai's chat completions differ from the other OpenAI-style providers in
 * ways a request has to respect: GLM-5.3 always thinks and takes
 * reasoning_effort low/high/max only, tool_choice is "auto" only, and
 * temperature is [0, 1]; its thinking guide asks for reasoning_content back
 * inside a tool loop.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  generateNonStreaming,
  generateStream,
  GenerateRequestBody,
  ZAI_CHAT_COMPLETIONS_URL,
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

interface SentRequest {
  url: string;
  headers: Record<string, string>;
  body: {
    model: string;
    messages: { role: string; content: unknown; reasoning_content?: string }[];
    [field: string]: unknown;
  };
}

function sent(fetchMock: ReturnType<typeof vi.fn>): SentRequest {
  const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
  return {
    url,
    headers: init.headers as Record<string, string>,
    body: JSON.parse(init.body as string),
  };
}

async function nonStreaming(body: Partial<GenerateRequestBody>): Promise<SentRequest> {
  const fetchMock = stubFetch();
  await generateNonStreaming({
    messages: [{ role: "user", content: "hello" }],
    model: "GLM 5.3 (Z.ai)",
    zaiKey: "zai-key",
    ...body,
  });
  return sent(fetchMock);
}

async function streaming(body: Partial<GenerateRequestBody>): Promise<SentRequest> {
  const fetchMock = stubFetch();
  const reader = generateStream({
    messages: [{ role: "user", content: "hello" }],
    model: "GLM 5.3 (Z.ai)",
    zaiKey: "zai-key",
    ...body,
  }).getReader();
  while (!(await reader.read()).done) {
    // drain
  }
  return sent(fetchMock);
}

const TOOLS = [
  { type: "function", function: { name: "formula_roll", description: "Roll.", parameters: { type: "object" } } },
];

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the endpoint", () => {
  it("is Z.ai's general pay-as-you-go endpoint, with the player's key as a bearer token", async () => {
    const request = await nonStreaming({});
    expect(request.url).toBe("https://api.z.ai/api/paas/v4/chat/completions");
    expect(request.url).toBe(ZAI_CHAT_COMPLETIONS_URL);
    expect(request.url).not.toContain("/coding/");
    expect(request.url).not.toContain("/anthropic");
    expect(request.headers.Authorization).toBe("Bearer zai-key");
    expect(request.body.model).toBe("glm-5.3");
  });

  it("sends the Flash model by its Z.ai id", async () => {
    expect((await streaming({ model: "GLM 5.3 Flash (Z.ai)" })).body.model).toBe("glm-5.3-flash");
  });

  it("asks for the Z.ai key when none is saved", async () => {
    stubFetch();
    const result = await generateNonStreaming({
      messages: [{ role: "user", content: "hello" }],
      model: "GLM 5.3 (Z.ai)",
      openRouterKey: "or-key",
    });
    expect(result).toMatchObject({ code: "NO_API_KEY" });
    expect("error" in result && result.error).toContain("Z.ai");
  });
});

describe("thinking", () => {
  it.each([
    ["none", "low"],
    ["low", "low"],
    ["normal", "high"],
    ["high", "high"],
    ["xhigh", "max"],
    [undefined, "low"],
  ])("maps tier effort %s to reasoning_effort %s, with thinking always on", async (effort, expected) => {
    const request = await streaming({ reasoningEffort: effort });
    expect(request.body.thinking).toEqual({ type: "enabled" });
    expect(request.body.reasoning_effort).toBe(expected);
  });

  it("hands the model's reasoning back inside a tool loop", async () => {
    const request = await streaming({
      tools: TOOLS,
      messages: [
        { role: "user", content: "> I attack" },
        {
          role: "assistant",
          content: "",
          reasoning: "The goblin is wounded; roll to hit.",
          tool_calls: [{ id: "call_1", type: "function", function: { name: "formula_roll", arguments: "{}" } }],
        },
        { role: "tool", content: "rolled 14", tool_call_id: "call_1" },
      ],
    });
    expect(request.body.messages[1].reasoning_content).toBe("The goblin is wounded; roll to hit.");
  });

  it("keeps a small output cap above what thinking needs", async () => {
    expect((await nonStreaming({ maxTokens: 200 })).body.max_tokens).toBe(4096);
    expect((await nonStreaming({ maxTokens: 8000 })).body.max_tokens).toBe(8000);
  });
});

describe("what Z.ai accepts", () => {
  it("sends tool_choice auto even when a gate forces a tool call", async () => {
    const request = await streaming({ tools: TOOLS, toolChoice: "required" });
    expect(request.body.tool_choice).toBe("auto");
  });

  it("strips a trailing prefill when tools are offered", async () => {
    const request = await streaming({
      tools: TOOLS,
      messages: [
        { role: "user", content: "> I attack" },
        { role: "assistant", content: "<thinking>" },
      ],
    });
    expect(request.body.messages.map((m) => m.role)).toEqual(["user"]);
  });

  it("clamps temperature into [0, 1]", async () => {
    expect((await streaming({ temperature: 1.3 })).body.temperature).toBe(1);
    expect((await streaming({ temperature: 0.4 })).body.temperature).toBe(0.4);
  });
});

describe("a GLM-5.3 tool loop on Z.ai", () => {
  it("sends one stop word at most", async () => {
    const request = await streaming({ stop: ["[GAME MASTER State Update]", "[GAME MASTER State", "[STOP]"] });
    expect(request.body.stop).toEqual(["[GAME MASTER State Update]"]);
  });

  it("drops the <thinking> prefill once a round follows it", async () => {
    const request = await streaming({
      tools: TOOLS,
      messages: [
        { role: "user", content: "> I attack" },
        { role: "assistant", content: "<thinking>" },
        {
          role: "assistant",
          content: "",
          tool_calls: [{ id: "call_1", type: "function", function: { name: "formula_roll", arguments: "{}" } }],
        },
        { role: "tool", content: "rolled 14", tool_call_id: "call_1" },
      ],
    });
    expect(request.body.messages.map((m) => m.role)).toEqual(["user", "assistant", "tool"]);
  });

  it("hands back only the current turn's reasoning", async () => {
    const request = await streaming({
      tools: TOOLS,
      messages: [
        { role: "user", content: "> earlier" },
        {
          role: "assistant",
          content: "",
          reasoning: "old reasoning",
          tool_calls: [{ id: "old", type: "function", function: { name: "formula_roll", arguments: "{}" } }],
        },
        { role: "tool", content: "rolled 3", tool_call_id: "old" },
        { role: "assistant", content: "You miss." },
        { role: "user", content: "> again" },
        {
          role: "assistant",
          content: "",
          reasoning: "new reasoning",
          tool_calls: [{ id: "new", type: "function", function: { name: "formula_roll", arguments: "{}" } }],
        },
        { role: "tool", content: "rolled 17", tool_call_id: "new" },
      ],
    });
    expect(request.body.messages[1].reasoning_content).toBeUndefined();
    expect(request.body.messages[5].reasoning_content).toBe("new reasoning");
  });
});

describe("GLM 5.3 through OpenRouter", () => {
  it("is handled as a model that always thinks", async () => {
    const fetchMock = stubFetch();
    await generateNonStreaming({
      messages: [{ role: "user", content: "verdict?" }],
      model: "GLM 5.3",
      openRouterKey: "or-key",
      maxTokens: 200,
      reasoningEffort: "none",
    });
    const request = sent(fetchMock);
    expect(request.body.max_tokens).toBe(4096);
    expect(request.body.reasoning).toEqual({ effort: "low" });
  });

  it("runs a side call with no effort of its own at low, not the model's default", async () => {
    const fetchMock = stubFetch();
    await generateNonStreaming({
      messages: [{ role: "user", content: "verdict?" }],
      model: "GLM 5.3 Flash",
      openRouterKey: "or-key",
    });
    expect(sent(fetchMock).body.reasoning).toEqual({ effort: "low" });
  });

  it("leaves GLM 5.2 as it was", async () => {
    const fetchMock = stubFetch();
    await generateNonStreaming({
      messages: [{ role: "user", content: "verdict?" }],
      model: "GLM 5.2",
      openRouterKey: "or-key",
      maxTokens: 200,
      reasoningEffort: "none",
    });
    const request = sent(fetchMock);
    expect(request.body.max_tokens).toBe(200);
    expect(request.body.reasoning).toEqual({ effort: "none" });
  });

  it("routes the OpenRouter entries to OpenRouter with Z.ai's model ids", async () => {
    const fetchMock = stubFetch();
    await generateNonStreaming({
      messages: [{ role: "user", content: "hello" }],
      model: "GLM 5.3 Flash",
      openRouterKey: "or-key",
    });
    const request = sent(fetchMock);
    expect(request.url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(request.body.model).toBe("z-ai/glm-5.3-flash");
    expect(AI_MODELS["GLM 5.3"].model).toBe("z-ai/glm-5.3");
  });
});

describe("the Coding Plan stays out of reach", () => {
  it("lets the desktop app reach Z.ai's general API and nothing else on api.z.ai", () => {
    const capabilities = JSON.parse(
      readFileSync(join(__dirname, "..", "src-tauri", "capabilities", "default.json"), "utf8"),
    );
    const http = capabilities.permissions.find(
      (p: { identifier?: string }) => p.identifier === "http:default",
    );
    const zaiUrls = (http.allow as { url: string }[])
      .map((entry) => entry.url)
      .filter((url) => url.includes("z.ai"));
    expect(zaiUrls).toEqual(["https://api.z.ai/api/paas/*"]);
  });

  it("never names a Coding Plan endpoint anywhere in the app", () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) {
          walk(path);
        } else if (/\.(ts|tsx)$/.test(name)) {
          const text = readFileSync(path, "utf8");
          if (/api\.z\.ai\/api\/(coding|anthropic)/.test(text)) offenders.push(path);
        }
      }
    };
    walk(join(__dirname, "..", "app"));
    expect(offenders).toEqual([]);
  });
});

describe("GLM 5.3 through DeepInfra", () => {
  // https://deepinfra.com/zai-org/GLM-5.3 (read 2026-10-25): reasoning_effort
  // low, high or max, max when it is left out, and no way to turn thinking off.
  async function deepInfra(body: Partial<GenerateRequestBody>): Promise<SentRequest> {
    const fetchMock = stubFetch();
    await generateNonStreaming({
      messages: [{ role: "user", content: "verdict?" }],
      model: "DeepInfra GLM 5.3",
      deepinfraKey: "di-key",
      ...body,
    });
    return sent(fetchMock);
  }

  it.each([
    ["none", "low"],
    ["low", "low"],
    ["normal", "high"],
    ["high", "high"],
    ["xhigh", "max"],
    [undefined, "low"],
  ])("maps tier effort %s to reasoning_effort %s, never leaving DeepInfra's max default", async (effort, expected) => {
    const request = await deepInfra({ reasoningEffort: effort });
    expect(request.url).toBe("https://api.deepinfra.com/v1/openai/chat/completions");
    expect(request.body.model).toBe("zai-org/GLM-5.3");
    expect(request.body.reasoning_effort).toBe(expected);
  });

  it("keeps a small output cap above what thinking needs", async () => {
    expect((await deepInfra({ maxTokens: 200 })).body.max_tokens).toBe(4096);
    expect((await deepInfra({ maxTokens: 8000 })).body.max_tokens).toBe(8000);
  });

  it("leaves the other DeepInfra models without a reasoning parameter", async () => {
    const fetchMock = stubFetch();
    await generateNonStreaming({
      messages: [{ role: "user", content: "verdict?" }],
      model: "DeepInfra GLM 4.6",
      deepinfraKey: "di-key",
      maxTokens: 200,
      reasoningEffort: "none",
    });
    const request = sent(fetchMock);
    expect(request.body.reasoning_effort).toBeUndefined();
    expect(request.body.max_tokens).toBe(200);
  });
});
