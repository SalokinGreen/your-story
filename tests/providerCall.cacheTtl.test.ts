/**
 * Decision 186: Claude through OpenRouter caches the breakpoints reused
 * across turns for an hour. The field was written from the docs and not seen
 * working live, so a 400 naming it must never stop the turn: the request is
 * sent once more without it, and the session falls back to the 5-minute cache.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  generateNonStreaming,
  resetCacheTtlRejected,
  type GenerateRequestBody,
} from "@/app/misc/providerCall";

const OK = {
  ok: true,
  status: 200,
  statusText: "OK",
  json: async () => ({
    choices: [{ index: 0, message: { role: "assistant", content: "hi" }, finish_reason: "stop" }],
    usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
  }),
  text: async () => "",
};

const REJECTED = {
  ok: false,
  status: 400,
  statusText: "Bad Request",
  json: async () => ({}),
  text: async () => '{"error":{"message":"cache_control.ttl: Extra inputs are not permitted"}}',
  clone() {
    return this;
  },
};

/** A Claude GM request with the marks the GM stage sets. */
function claudeRequest(): GenerateRequestBody {
  return {
    model: "Claude Sonnet 5.5",
    openRouterKey: "test-key",
    tools: [{ type: "function", function: { name: "calculate", description: "x", parameters: { type: "object", properties: {} } } }],
    messages: [
      { role: "system", content: "You are the GM." },
      { role: "user", content: "The stable block." },
      { role: "assistant", content: "Understood.", cacheBreakpoint: "prefix" },
      { role: "user", content: "> I pick the lock", cacheBreakpoint: "turn" },
    ],
  } as unknown as GenerateRequestBody;
}

function sentBodies(fetchMock: ReturnType<typeof vi.fn>) {
  return fetchMock.mock.calls.map((c) => JSON.parse((c[1] as { body: string }).body));
}

afterEach(() => {
  vi.unstubAllGlobals();
  resetCacheTtlRejected();
});

describe("the 1-hour cache TTL (decision 186)", () => {
  it("sends ttl 1h on the system and prefix marks, and 5 minutes on the turn", async () => {
    const fetchMock = vi.fn(async () => OK);
    vi.stubGlobal("fetch", fetchMock);
    await generateNonStreaming(claudeRequest());
    const [body] = sentBodies(fetchMock);
    const cc = (i: number) => body.messages[i].content[0].cache_control;
    expect(cc(0)).toEqual({ type: "ephemeral", ttl: "1h" });
    expect(cc(2)).toEqual({ type: "ephemeral", ttl: "1h" });
    expect(cc(3)).toEqual({ type: "ephemeral" });
  });

  it("retries once without the ttl when OpenRouter refuses it, and leaves it out afterwards", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(async () => REJECTED)
      .mockImplementation(async () => OK);
    vi.stubGlobal("fetch", fetchMock);

    const result = await generateNonStreaming(claudeRequest());
    expect("error" in result).toBe(false);
    const [first, retry] = sentBodies(fetchMock);
    expect(JSON.stringify(first.messages)).toContain('"ttl"');
    expect(JSON.stringify(retry.messages)).not.toContain('"ttl"');
    // The breakpoints themselves stay: only the TTL goes.
    expect(retry.messages[0].content[0].cache_control).toEqual({ type: "ephemeral" });

    await generateNonStreaming(claudeRequest());
    const later = sentBodies(fetchMock)[2];
    expect(JSON.stringify(later.messages)).not.toContain('"ttl"');
  });

  it("does not retry a 400 that is about something else", async () => {
    const other = { ...REJECTED, text: async () => '{"error":{"message":"max_tokens too large"}}' };
    const fetchMock = vi.fn(async () => other);
    vi.stubGlobal("fetch", fetchMock);
    await generateNonStreaming(claudeRequest());
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
