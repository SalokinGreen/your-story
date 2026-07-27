/**
 * Streaming twin of /api/ocr/summarize.
 *
 * Same extraction, same result - the difference is that the notes are
 * reported as the model writes them (see OCRSummarizeEvent) instead of
 * arriving in one lump when the whole multi-round call resolves, so the
 * importer can show notes filling in live. The final `done` event carries
 * exactly the payload the non-streaming route returns.
 */

import { NextRequest } from "next/server";
import {
  summarizeOCR,
  OCRSummarizeRequestBody,
  OCRSummarizeEvent,
} from "@/app/misc/ocrSummarizeCall";

export const runtime = "nodejs";
// Match /api/ocr/summarize - the work is identical, only the reporting differs.
export const maxDuration = 300;

const SSE_HEADERS = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache, no-store, must-revalidate",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no", // Disable nginx buffering
};

/** Events the client sees: extraction progress, then exactly one terminator. */
type StreamEvent =
  | OCRSummarizeEvent
  | { type: "done"; result: unknown }
  | { type: "error"; error: string; status: number };

export async function POST(request: NextRequest) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const emit = (event: StreamEvent) => {
        if (closed) return;
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(event)}\n\n`),
          );
        } catch {
          // Client went away mid-stream - stop trying to write to it.
          closed = true;
        }
      };

      try {
        const body: OCRSummarizeRequestBody = await request.json();
        const result = await summarizeOCR(body, emit);

        if ("error" in result) {
          emit({ type: "error", error: result.error, status: result.status });
        } else {
          emit({ type: "done", result });
        }
      } catch (error) {
        console.error("OCR summarize stream error:", error);
        emit({
          type: "error",
          error:
            error instanceof Error && error.message
              ? error.message
              : "Summarization failed",
          status: 500,
        });
      } finally {
        closed = true;
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: SSE_HEADERS });
}
