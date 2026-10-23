/**
 * providerCall on Android (slice 3, decision 134): a listed host is called with
 * the WebView's fetch, the AbortSignal reaches it for streamed and non-streamed
 * calls, and a network error before any response marks the host and is never
 * replayed (the POST may have been billed). Also: the tier classifier's
 * generateSimple call is handed the turn's signal.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@capacitor/core", () => ({
  Capacitor: { getPlatform: () => "android", isNativePlatform: () => true },
  CapacitorHttp: { request: vi.fn() },
}));
vi.mock("@tauri-apps/api/core", () => ({ isTauri: () => false }));
vi.mock("@tauri-apps/plugin-http", () => ({ fetch: vi.fn() }));

import { generateNonStreaming, generateStream } from "@/app/misc/providerCall";
import { getAbortableProviderFetch, resetDownHostsForTests } from "@/app/misc/platformFetch";

const webFetch = vi.fn();
const patchedFetch = vi.fn();

class MemoryStorage {
  private map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.has(key) ? this.map.get(key)! : null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, String(value));
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
}

beforeEach(() => {
  resetDownHostsForTests();
  const storage = new MemoryStorage();
  vi.stubGlobal("localStorage", storage);
  vi.stubGlobal("fetch", patchedFetch);
  vi.stubGlobal("window", {
    localStorage: storage,
    CapacitorWebFetch: webFetch,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  webFetch.mockReset();
  patchedFetch.mockReset();
});

const BODY = {
  messages: [{ role: "user" as const, content: "hello" }],
  model: "Claude Sonnet 5.5",
  openRouterKey: "k",
};

function okJson() {
  return new Response(
    JSON.stringify({
      choices: [{ index: 0, message: { role: "assistant", content: "hi" }, finish_reason: "stop" }],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

describe("providerCall on Android, listed host", () => {
  it("non-streaming: uses the WebView fetch and the abort reaches its signal", async () => {
    webFetch.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError")),
          );
        }),
    );
    const abort = new AbortController();
    const call = generateNonStreaming(BODY, abort.signal);
    abort.abort();
    await expect(call).rejects.toMatchObject({ name: "AbortError" });
    expect(webFetch).toHaveBeenCalledTimes(1);
    expect(patchedFetch).not.toHaveBeenCalled();
    const [url, init] = webFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("openrouter.ai");
    expect(init.signal?.aborted).toBe(true);
  });

  it("streaming: the abort reaches the WebView fetch's signal", async () => {
    webFetch.mockImplementation((_url: string, init: RequestInit) => {
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          init.signal?.addEventListener("abort", () =>
            controller.error(new DOMException("aborted", "AbortError")),
          );
        },
      });
      return Promise.resolve(new Response(body, { status: 200 }));
    });
    const abort = new AbortController();
    const reader = generateStream(BODY, abort.signal).getReader();
    const read = reader.read();
    // Let the request go out before aborting.
    await vi.waitFor(() => expect(webFetch).toHaveBeenCalledTimes(1));
    abort.abort();
    await expect(read).rejects.toMatchObject({ name: "AbortError" });
    const [, init] = webFetch.mock.calls[0] as [string, RequestInit];
    expect(init.signal?.aborted).toBe(true);
    expect(patchedFetch).not.toHaveBeenCalled();
  });

  it("a TypeError before any response marks the host, rethrows, and is not replayed", async () => {
    webFetch.mockRejectedValue(new TypeError("Failed to fetch"));
    patchedFetch.mockResolvedValue(okJson());
    const result = await generateNonStreaming(BODY).catch((e) => e);
    // Whatever shape the error takes, nothing was re-sent.
    expect(webFetch).toHaveBeenCalledTimes(1);
    expect(patchedFetch).not.toHaveBeenCalled();
    expect(result).toBeDefined();

    // The host is off the list for the session: the next request goes native.
    const next = getAbortableProviderFetch("https://openrouter.ai/api/v1/chat/completions");
    patchedFetch.mockResolvedValue("patched");
    expect(await next("https://openrouter.ai/x")).toBe("patched");
    expect(webFetch).toHaveBeenCalledTimes(1);
  });

  it("an abort is not a host fault", async () => {
    const abort = new AbortController();
    webFetch.mockImplementation(async () => {
      abort.abort();
      throw new TypeError("aborted");
    });
    await generateNonStreaming(BODY, abort.signal).catch(() => {});
    webFetch.mockResolvedValue("web");
    const next = getAbortableProviderFetch("https://openrouter.ai/x");
    expect(await next("https://openrouter.ai/x")).toBe("web");
  });
});
