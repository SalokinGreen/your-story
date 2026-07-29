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
  tableNotes: [],
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
        { type: "round_end", round: 1, lore: 1, mechanicNotes: 0, tableNotes: 0 },
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

  it("retries a stream that dies before the model wrote anything worth keeping", async () => {
    fetchMock
      .mockResolvedValueOnce(
        sseResponse([
          { type: "round_start", round: 1, part: 0, totalParts: 1, reason: "initial" },
          { type: "delta", text: '{"lore":[{"title":"Ha' },
        ]),
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

  it("does not restart an extraction that had already written notes", async () => {
    // Retrying here would throw away everything streamed so far and start
    // the document again from the first note - the restart loop the caller
    // salvages the partial to avoid.
    fetchMock.mockImplementation(async () =>
      sseResponse([
        {
          type: "delta",
          text: `{"lore":[${'{"title":"A note","content":"Some prose."},'.repeat(60)}{"title":"Half`,
        },
      ]),
    );

    const retries: number[] = [];
    await expect(
      streamSummarizeOCR(BODY, {
        onRetry: (attempt) => retries.push(attempt),
        maxRetries: 2,
      }),
    ).rejects.toThrow(/ended unexpectedly/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(retries).toEqual([]);
  });

  it("gives up after the retry budget is spent", async () => {
    // A fresh Response per attempt - a body stream can only be read once.
    fetchMock.mockImplementation(async () => sseResponse([]));

    await expect(
      streamSummarizeOCR(BODY, { maxRetries: 1 }),
    ).rejects.toThrow(/ended unexpectedly/);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("keeps a slow but steadily streaming extraction alive", async () => {
    // The bug this guards: a wall-clock cap on the whole attempt aborted
    // healthy long extractions and restarted them from zero notes.
    const encoder = new TextEncoder();
    const line = (event: unknown) =>
      encoder.encode(`data: ${JSON.stringify(event)}\n\n`);

    fetchMock.mockResolvedValueOnce(
      new Response(
        new ReadableStream<Uint8Array>({
          async start(controller) {
            for (let i = 0; i < 8; i++) {
              await new Promise((resolve) => setTimeout(resolve, 20));
              controller.enqueue(line({ type: "delta", text: `note ${i}` }));
            }
            controller.enqueue(line({ type: "done", result: DONE_RESULT }));
            controller.close();
          },
        }),
        { status: 200 },
      ),
    );

    // Well under the total time the stream takes, but never exceeded
    // between two deltas.
    const result = await streamSummarizeOCR(BODY, { idleTimeoutMs: 60 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result).toEqual(DONE_RESULT);
  });

  it("aborts a stream that goes silent", async () => {
    fetchMock.mockImplementation(
      async () =>
        new Response(
          new ReadableStream<Uint8Array>({
            start() {
              // Opened, then nothing - a connection that died without
              // closing.
            },
          }),
          { status: 200 },
        ),
    );

    await expect(
      streamSummarizeOCR(BODY, { idleTimeoutMs: 30, maxRetries: 0 }),
    ).rejects.toThrow(/stalled/);
  });

  it("reports a platform-level rejection as an error result", async () => {
    fetchMock.mockResolvedValueOnce(new Response("", { status: 413 }));

    const result = await streamSummarizeOCR(BODY, {});

    expect(result).toMatchObject({ status: 413 });
    expect("error" in result && result.error).toMatch(/too large/i);
  });
});
