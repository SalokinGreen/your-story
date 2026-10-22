/**
 * fal.ai image calls (docs/image-generation-design.md §4.1). The request shape
 * (header, sync_mode, image_urls only when references are sent) and every
 * failure mapping the queue turns into a card state. Goes through
 * getProviderFetch, which is mocked here: no network.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const fetchMock = vi.fn();
vi.mock("@/app/misc/platformFetch", () => ({
  getProviderFetch: () => fetchMock,
}));

import { generateFalImage, FAL_TIMEOUT_MS } from "@/app/misc/falImageCall";

const PNG_URI = "data:image/png;base64,iVBORw0KGgo=";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const baseReq = {
  falKey: "key-123",
  model: "fal-ai/flux/schnell",
  prompt: "a harbour at dawn",
  imageSize: { width: 1024, height: 768 },
};

beforeEach(() => {
  fetchMock.mockReset();
});

describe("generateFalImage request", () => {
  it("posts to fal.run/<model> with the Key header and sync_mode", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, { images: [{ url: PNG_URI, width: 1024, height: 768 }], seed: 7 }),
    );
    const result = await generateFalImage(baseReq);
    expect(result).toEqual({ ok: true, dataUri: PNG_URI, width: 1024, height: 768, seed: 7 });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://fal.run/fal-ai/flux/schnell");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Key key-123");
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({
      prompt: "a harbour at dawn",
      image_size: { width: 1024, height: 768 },
      num_images: 1,
      sync_mode: true,
      output_format: "png",
      enable_safety_checker: true,
    });
    // No references were given, so no image_urls.
    expect("image_urls" in body).toBe(false);
  });

  it("sends image_urls only when reference pictures are given", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { images: [{ url: PNG_URI }] }));
    await generateFalImage({
      ...baseReq,
      model: "fal-ai/flux-2-pro/edit",
      referenceDataUris: ["data:image/webp;base64,AAAA", "data:image/webp;base64,BBBB"],
    });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.image_urls).toEqual([
      "data:image/webp;base64,AAAA",
      "data:image/webp;base64,BBBB",
    ]);
  });

  it("falls back to the requested size when the response omits it", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { images: [{ url: PNG_URI }] }));
    const result = await generateFalImage(baseReq);
    expect(result).toMatchObject({ ok: true, width: 1024, height: 768 });
  });

  it("fetches a CDN URL once when a model ignores sync_mode", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse(200, { images: [{ url: "https://v3.fal.media/files/x.png", content_type: "image/png" }] }),
      )
      .mockResolvedValueOnce(new Response(new Uint8Array([1, 2, 3]), { status: 200 }));
    const result = await generateFalImage(baseReq);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.dataUri.startsWith("data:image/png;base64,")).toBe(true);
    expect(fetchMock.mock.calls[1][0]).toBe("https://v3.fal.media/files/x.png");
  });
});

describe("generateFalImage failures", () => {
  it("maps a 422 content_policy_violation to declined, with its categories", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(422, {
        detail: [
          {
            type: "content_policy_violation",
            msg: "blocked",
            ctx: { categories: ["sexual", "gore"] },
          },
        ],
      }),
    );
    const result = await generateFalImage(baseReq);
    expect(result).toMatchObject({
      ok: false,
      kind: "declined",
      categories: ["sexual", "gore"],
    });
  });

  it("treats has_nsfw_concepts as declined and never returns the black picture", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, { images: [{ url: PNG_URI }], has_nsfw_concepts: [true] }),
    );
    const result = await generateFalImage(baseReq);
    expect(result).toMatchObject({ ok: false, kind: "declined", billed: true });
    expect("dataUri" in result).toBe(false);
  });

  it("maps 401 and 403 to key, 429 to busy", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(401, { detail: "no" }));
    expect(await generateFalImage(baseReq)).toMatchObject({ ok: false, kind: "key" });
    fetchMock.mockResolvedValueOnce(jsonResponse(403, { detail: "no" }));
    expect(await generateFalImage(baseReq)).toMatchObject({ ok: false, kind: "key" });
    fetchMock.mockResolvedValueOnce(jsonResponse(429, { detail: "concurrent_requests_limit" }));
    expect(await generateFalImage(baseReq)).toMatchObject({ ok: false, kind: "busy" });
  });

  it("maps a 504, a validation 422 and an empty response to failed", async () => {
    fetchMock.mockResolvedValueOnce(new Response("gateway timeout", { status: 504 }));
    expect(await generateFalImage(baseReq)).toMatchObject({ ok: false, kind: "failed" });
    fetchMock.mockResolvedValueOnce(
      jsonResponse(422, { detail: [{ type: "value_error", msg: "bad size" }] }),
    );
    expect(await generateFalImage(baseReq)).toMatchObject({ ok: false, kind: "failed" });
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { images: [] }));
    expect(await generateFalImage(baseReq)).toMatchObject({ ok: false, kind: "failed" });
  });

  it("reports a network error as failed with its message", async () => {
    fetchMock.mockRejectedValue(new Error("network down"));
    expect(await generateFalImage(baseReq)).toMatchObject({
      ok: false,
      kind: "failed",
      message: "network down",
    });
  });
});

describe("generateFalImage cancellation and timeout", () => {
  it("returns cancelled without calling fal when the signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const result = await generateFalImage({ ...baseReq, signal: controller.signal });
    expect(result).toMatchObject({ ok: false, kind: "cancelled" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns cancelled when the caller aborts mid-request", async () => {
    const controller = new AbortController();
    fetchMock.mockImplementation(
      (_url: string, init: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError")),
          );
        }),
    );
    const pending = generateFalImage({ ...baseReq, signal: controller.signal });
    controller.abort();
    expect(await pending).toMatchObject({ ok: false, kind: "cancelled" });
  });

  it("gives up after the timeout and says so", async () => {
    vi.useFakeTimers();
    try {
      fetchMock.mockImplementation(
        (_url: string, init: { signal: AbortSignal }) =>
          new Promise((_resolve, reject) => {
            init.signal.addEventListener("abort", () =>
              reject(new DOMException("aborted", "AbortError")),
            );
          }),
      );
      const pending = generateFalImage(baseReq);
      await vi.advanceTimersByTimeAsync(FAL_TIMEOUT_MS + 1);
      const result = await pending;
      expect(result).toMatchObject({ ok: false, kind: "failed" });
      if (!result.ok) expect(result.message).toMatch(/90 seconds/);
    } finally {
      vi.useRealTimers();
    }
  });
});
