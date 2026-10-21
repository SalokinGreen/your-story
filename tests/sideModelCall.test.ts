/**
 * callSideModel() (app/misc/sideModelCall.ts) is the one path every AI side
 * call takes - Observer, Memory Keeper, Reflection, Compaction, Director
 * Assistant, Story Progress Observer, sub-agents, the Designer. These pin the
 * three things it exists to guarantee: every provider key is forwarded, a
 * failure is logged rather than swallowed, and the standalone (native) build
 * reaches the provider without an /api/* route.
 */
import { describe, it, expect, vi, afterEach } from "vitest";

// A model whose provider these tests hold the key for - not the default narration
// model, which moves with the catalog (decision 50).
const MISTRAL_MODEL = "Mistral Small 3.2";

const mockPlatformFetch = vi.fn();
vi.mock("@/app/misc/platformFetch", () => ({
  getProviderFetch: () => mockPlatformFetch,
}));

import { callSideModel, pickProviderKeys } from "@/app/misc/sideModelCall";
import { logger } from "@/app/misc/logger";

const ALL_KEYS = {
  openRouterKey: "or-key",
  deepseekKey: "ds-key",
  googleKey: "g-key",
  mistralKey: "mistral-key",
  deepinfraKey: "di-key",
  zaiKey: "zai-key",
};

const MESSAGES = [
  { role: "system" as const, content: "You are a judge." },
  { role: "user" as const, content: "Judge this." },
];

function okResponse(content: string) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ content, meta: {} }),
  } as unknown as Response;
}

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
  delete process.env.NEXT_PUBLIC_STANDALONE;
  mockPlatformFetch.mockReset();
  vi.restoreAllMocks();
});

describe("pickProviderKeys", () => {
  it("copies exactly the six AI-provider keys and drops everything else", () => {
    const picked = pickProviderKeys({
      ...ALL_KEYS,
      // The APIKeys context also holds these - they must never ride along.
      braveSearchKey: "brave",
      cartesiaKey: "cartesia",
      elevenlabsKey: "eleven",
    } as Parameters<typeof pickProviderKeys>[0]);
    expect(picked).toEqual(ALL_KEYS);
  });
});

describe("callSideModel - web build", () => {
  it("posts to /api/generate with all six provider keys", async () => {
    const fetchMock = vi.fn(async () => okResponse("verdict"));
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await callSideModel({
      stage: "observer",
      label: "test judge",
      model: MISTRAL_MODEL,
      messages: MESSAGES,
      keys: { ...ALL_KEYS, cartesiaKey: "cartesia" } as typeof ALL_KEYS,
      maxTokens: 200,
      temperature: 0,
      reasoningEffort: "low",
    });

    expect(result).toEqual({ ok: true, data: { content: "verdict", meta: {} } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/generate");
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({
      messages: MESSAGES,
      model: MISTRAL_MODEL,
      maxTokens: 200,
      temperature: 0,
      reasoningEffort: "low",
      ...ALL_KEYS,
    });
    expect(body.cartesiaKey).toBeUndefined();
  });

  it("returns the proxy's error and logs it to Debug Logs instead of swallowing it", async () => {
    global.fetch = vi.fn(async () => ({
      ok: false,
      status: 400,
      json: async () => ({
        error: "No API key configured for Mistral.",
        code: "NO_API_KEY",
      }),
    })) as unknown as typeof fetch;
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => {});

    const result = await callSideModel({
      stage: "compaction",
      label: "History summarization",
      model: MISTRAL_MODEL,
      messages: MESSAGES,
      keys: {},
    });

    expect(result).toEqual({
      ok: false,
      status: 400,
      error: "No API key configured for Mistral.",
      code: "NO_API_KEY",
    });
    expect(warn).toHaveBeenCalledWith(
      "Side call failed: History summarization",
      expect.objectContaining({
        stage: "compaction",
        model: MISTRAL_MODEL,
        status: 400,
        code: "NO_API_KEY",
      }),
    );
  });

  it("turns a network failure into a logged { ok: false } rather than a throw", async () => {
    global.fetch = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    }) as unknown as typeof fetch;
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => {});

    const result = await callSideModel({
      label: "Memory Keeper",
      model: MISTRAL_MODEL,
      messages: MESSAGES,
      keys: ALL_KEYS,
    });

    expect(result).toEqual({ ok: false, error: "Failed to fetch" });
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("re-throws a cancellation instead of logging it as a failure", async () => {
    global.fetch = vi.fn(async () => {
      throw new DOMException("The operation was aborted.", "AbortError");
    }) as unknown as typeof fetch;
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => {});

    await expect(
      callSideModel({
        label: "Game Designer",
        model: MISTRAL_MODEL,
        messages: MESSAGES,
        keys: ALL_KEYS,
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(warn).not.toHaveBeenCalled();
  });
});

describe("callSideModel - standalone (Tauri/Capacitor) build", () => {
  it("calls the provider directly with its key and never touches an /api/* route", async () => {
    process.env.NEXT_PUBLIC_STANDALONE = "true";
    const fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    mockPlatformFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { role: "assistant", content: "summary" } }],
        usage: { prompt_tokens: 5, completion_tokens: 3, total_tokens: 8 },
      }),
    });

    const result = await callSideModel({
      stage: "compaction",
      label: "History summarization",
      model: MISTRAL_MODEL,
      messages: MESSAGES,
      keys: { mistralKey: "mistral-key" },
    });

    expect(result.ok).toBe(true);
    expect(result.ok && result.data.content).toBe("summary");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mockPlatformFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockPlatformFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("api.mistral.ai");
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer mistral-key",
    );
  });
});
