// The feedback client (docs/feedback-design.md §5-§6): where it posts, what it
// sends, how replies map, and that it neither authenticates nor retries.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const fetchMock = vi.fn();
vi.mock("@/app/misc/platformFetch", () => ({
  getProviderFetch: () => fetchMock,
}));

import {
  feedbackAvailable,
  feedbackUrl,
  sendFeedback,
} from "@/app/misc/feedbackClient";
import { buildSubmission } from "@/app/misc/feedback";

const sub = buildSubmission({
  id: "abcdef0123456789",
  kind: "app",
  text: "hello",
  app: { version: "0.1.0", platform: "desktop" },
});

function reply(status: number, body: unknown): Response {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubEnv("NEXT_PUBLIC_SYNC_API_URL", "https://your-story-sync.example.workers.dev/");
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("feedbackAvailable", () => {
  it("is the Worker URL being set, and nothing about sync being on", () => {
    expect(feedbackAvailable()).toBe(true);
    vi.stubEnv("NEXT_PUBLIC_SYNC_API_URL", "");
    expect(feedbackAvailable()).toBe(false);
  });

  it("sends nothing when there is no address", async () => {
    vi.stubEnv("NEXT_PUBLIC_SYNC_API_URL", "");
    expect(await sendFeedback(sub)).toEqual({ ok: false, reason: "disabled" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("sendFeedback", () => {
  it("POSTs the JSON to <url>/feedback with only a content type", async () => {
    fetchMock.mockResolvedValue(reply(200, { ok: true, ref: "abcdef01" }));
    const result = await sendFeedback(sub);
    expect(result).toEqual({ ok: true, ref: "abcdef01" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://your-story-sync.example.workers.dev/feedback");
    expect(feedbackUrl()).toBe(url);
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual(sub);
    expect(Object.keys(init.headers).map((h) => h.toLowerCase())).toEqual(["content-type"]);
  });

  it("falls back to the first 8 characters of the id when the reply names no ref", async () => {
    fetchMock.mockResolvedValue(reply(200, { ok: true }));
    expect(await sendFeedback(sub)).toEqual({ ok: true, ref: "abcdef01" });
  });

  it.each([
    [400, { error: "invalid", field: "text" }, "invalid"],
    [400, { error: "invalid_json" }, "invalid"],
    [413, { error: "too_large" }, "too_large"],
    [429, { error: "rate_limited" }, "rate_limited"],
    [429, { error: "daily_cap" }, "daily_cap"],
    [429, "not json", "rate_limited"],
    [503, { error: "disabled" }, "disabled"],
    [500, { error: "boom" }, "server"],
    [502, "<html>bad gateway</html>", "server"],
    [200, "<html>not ours</html>", "server"],
    [200, { ok: false }, "server"],
  ])("maps %s %j to %s", async (status, body, reason) => {
    fetchMock.mockResolvedValue(reply(status as number, body));
    expect(await sendFeedback(sub)).toEqual({ ok: false, reason });
  });

  it("maps a network failure (a TypeError, or a bare string from the native client) to offline, once", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    expect(await sendFeedback(sub)).toEqual({ ok: false, reason: "offline" });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fetchMock.mockReset();
    fetchMock.mockRejectedValue("error sending request");
    expect(await sendFeedback(sub)).toEqual({ ok: false, reason: "offline" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("never retries by itself, whatever the failure", async () => {
    for (const status of [429, 500, 503]) {
      fetchMock.mockReset();
      fetchMock.mockResolvedValue(reply(status, { error: "x" }));
      await sendFeedback(sub);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    }
  });

  it("lets an abort through instead of reporting it as offline", async () => {
    const abort = new DOMException("aborted", "AbortError");
    fetchMock.mockRejectedValue(abort);
    await expect(sendFeedback(sub, new AbortController().signal)).rejects.toBe(abort);
  });

  it("passes the abort signal on", async () => {
    fetchMock.mockResolvedValue(reply(200, { ok: true, ref: "r" }));
    const controller = new AbortController();
    await sendFeedback(sub, controller.signal);
    expect(fetchMock.mock.calls[0][1].signal).toBe(controller.signal);
  });
});

describe("the client imports nothing from sync", () => {
  const src = readFileSync(join(__dirname, "..", "app/misc/feedbackClient.ts"), "utf-8");
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  it("has no import of the sync manager, a sync key or an Authorization header", () => {
    expect(code).not.toMatch(/from\s+["'][^"']*sync/i);
    expect(code).not.toMatch(/getSyncKey|syncKey|SYNC_KEY/);
    expect(code).not.toMatch(/authorization/i);
  });
});
