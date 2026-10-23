/**
 * getAbortableProviderFetch (design 3.3, decision 134): on Android a request to
 * a CORS-capable host goes through the WebView's own fetch, which streams and
 * honours an AbortSignal. Everything else keeps today's transport.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const env = vi.hoisted(() => ({ platform: "android", tauri: false }));
vi.mock("@capacitor/core", () => ({
  Capacitor: { getPlatform: () => env.platform, isNativePlatform: () => env.platform !== "web" },
  CapacitorHttp: { request: vi.fn() },
}));
vi.mock("@tauri-apps/api/core", () => ({ isTauri: () => env.tauri }));
const tauriFetch = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/plugin-http", () => ({ fetch: tauriFetch }));

import {
  getAbortableProviderFetch,
  getProviderFetch,
  markHostDown,
  resetDownHostsForTests,
} from "@/app/misc/platformFetch";

const webFetch = vi.fn();
const patchedFetch = vi.fn();

beforeEach(() => {
  env.platform = "android";
  env.tauri = false;
  resetDownHostsForTests();
  vi.stubGlobal("fetch", patchedFetch);
  vi.stubGlobal("window", { CapacitorWebFetch: webFetch });
});

afterEach(() => {
  vi.unstubAllGlobals();
  webFetch.mockReset();
  patchedFetch.mockReset();
});

/** Which fetch came back, by calling it. */
async function whichFetch(url: string): Promise<string> {
  webFetch.mockResolvedValue("web");
  patchedFetch.mockResolvedValue("patched");
  tauriFetch.mockResolvedValue("tauri");
  return (await getAbortableProviderFetch(url)(url)) as unknown as string;
}

describe("getAbortableProviderFetch", () => {
  it.each([
    "https://openrouter.ai/api/v1/chat/completions",
    "https://api.mistral.ai/v1/chat/completions",
    "https://api.deepinfra.com/v1/openai/chat/completions",
    "https://api.deepseek.com/chat/completions",
  ])("Android, listed host %s: the WebView's own fetch", async (url) => {
    expect(await whichFetch(url)).toBe("web");
  });

  it("Android, unlisted host: the patched fetch", async () => {
    expect(await whichFetch("https://generativelanguage.googleapis.com/v1beta/x")).toBe("patched");
    expect(await whichFetch("https://api.z.ai/api/paas/v4/chat/completions")).toBe("patched");
  });

  it("iOS and the web: unchanged", async () => {
    env.platform = "ios";
    expect(await whichFetch("https://openrouter.ai/api/v1/chat/completions")).toBe("patched");
    env.platform = "web";
    expect(await whichFetch("https://openrouter.ai/api/v1/chat/completions")).toBe("patched");
  });

  it("Tauri: unchanged", async () => {
    env.tauri = true;
    expect(await whichFetch("https://openrouter.ai/api/v1/chat/completions")).toBe("tauri");
  });

  it("a host marked down goes native, others stay on the WebView", async () => {
    markHostDown("openrouter.ai");
    expect(await whichFetch("https://openrouter.ai/api/v1/chat/completions")).toBe("patched");
    expect(await whichFetch("https://api.mistral.ai/v1/chat/completions")).toBe("web");
  });

  it("no CapacitorWebFetch: native", async () => {
    vi.stubGlobal("window", {});
    expect(await whichFetch("https://openrouter.ai/api/v1/chat/completions")).toBe("patched");
  });

  it("an unparsable url is native", () => {
    expect(getAbortableProviderFetch("not a url")).toBe(getProviderFetch());
  });
});
