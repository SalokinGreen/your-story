/**
 * streamSummarizeOCR tests - the client half of the streaming note
 * extraction: SSE parsing, event dispatch, error handling and the retry
 * that a dropped connection triggers (see ocrSummarizeStream.ts).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { streamSummarizeOCR } from "@/app/misc/ocrSummarizeStream";
import { OCRSummarizeEvent } from "@/app/misc/ocrSummarizeCall";

/** Build an SSE response body out of pre-baked events. */
function sseResponse(events: unknown[], { split = false } = {}): Response {
  const payload = events
    .map((event) => `data: ${JSON.stringify(event)}\n\n`)
    .join("");
  const encoder = new TextEncoder();
  const bytes = encoder.encode(payload);

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      if (split) {
        // Deliver in awkward slices so a `data:` line spans two chunks -
        // the case a naive per-chunk parser gets wrong.
        for (let i = 0; i < bytes.length; i += 7) {
          controller.enqueue(bytes.slice(i, i + 7));
        }
      } else {
        controller.enqueue(bytes);
      }
      controller.close();
    },
  });

  return new Response(stream, { status: 200 });
}

const BODY = { markdown: "# A rulebook", openRouterKey: "test-key" };

const DONE_RESULT = {
  success: true,
  summary: "A rulebook.",
  lore: [{ title: "Karth", content: "A port city." }],
  mechanicNotes: [],
  customTables: [],
  detectedContentType: "rulebook",
  rawExtractedTables: 0,
  extractionRounds: 1,
  incomplete: false,
};

describe("streamSummarizeOCR", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("dispatches progress events and returns the final result", async () => {
    fetchMock.mockResolvedValueOnce(
      sseResponse([
        { type: "round_start", round: 1, part: 0, totalParts: 1, reason: "initial" },
        { type: "delta", text: '{"lore":[{"title":"Karth"' },
        { type: "delta", text: ',"content":"A port city."}]}' },
        { type: "round_end", round: 1, lore: 1, mechanicNotes: 0, customTables: 0 },
        { type: "done", result: DONE_RESULT },
      ]),
    );

    const events: OCRSummarizeEvent[] = [];
    const result = await streamSummarizeOCR(BODY, {
      onEvent: (event) => events.push(event),
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/ocr/summarize-stream");
    expect(events.map((e) => e.type)).toEqual([
      "round_start",
      "delta",
      "delta",
      "round_end",
    ]);
    expect(result).toEqual(DONE_RESULT);
  });

  it("reassembles events split across chunk boundaries", async () => {
    fetchMock.mockResolvedValueOnce(
      sseResponse(
        [
          { type: "delta", text: "the quick brown fox jumps over the lazy dog" },
          { type: "done", result: DONE_RESULT },
        ],
        { split: true },
      ),
    );

    const events: OCRSummarizeEvent[] = [];
    const result = await streamSummarizeOCR(BODY, {
      onEvent: (event) => events.push(event),
    });

    expect(events).toEqual([
      { type: "delta", text: "the quick brown fox jumps over the lazy dog" },
    ]);
    expect("error" in result).toBe(false);
  });

  it("returns a failed extraction as an error result, without retrying", async () => {
    fetchMock.mockResolvedValueOnce(
      sseResponse([
        { type: "error", error: "No openrouter API key provided", status: 400 },
      ]),
    );

    const result = await streamSummarizeOCR(BODY, {});

    expect(result).toEqual({
      error: "No openrouter API key provided",
      status: 400,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries a stream that ends without a result, and resets the listener", async () => {
    fetchMock
      .mockResolvedValueOnce(
        sseResponse([{ type: "delta", text: '{"lore":[{"title":"Half' }]),
      )
      .mockResolvedValueOnce(sseResponse([{ type: "done", result: DONE_RESULT }]));

    const retries: number[] = [];
    const result = await streamSummarizeOCR(BODY, {
      onRetry: (attempt) => retries.push(attempt),
      maxRetries: 1,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(retries).toEqual([1]);
    expect(result).toEqual(DONE_RESULT);
  });

  it("gives up after the retry budget is spent", async () => {
    // A fresh Response per attempt - a body stream can only be read once.
    fetchMock.mockImplementation(async () =>
      sseResponse([{ type: "delta", text: "…" }]),
    );

    await expect(
      streamSummarizeOCR(BODY, { maxRetries: 1 }),
    ).rejects.toThrow(/ended unexpectedly/);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("reports a platform-level rejection as an error result", async () => {
    fetchMock.mockResolvedValueOnce(new Response("", { status: 413 }));

    const result = await streamSummarizeOCR(BODY, {});

    expect(result).toMatchObject({ status: 413 });
    expect("error" in result && result.error).toMatch(/too large/i);
  });
});
