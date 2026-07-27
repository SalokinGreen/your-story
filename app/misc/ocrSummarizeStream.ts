/**
 * Client-side entry point for a streaming OCR summarize call - the
 * drop-in replacement for `ocrFetch("/api/ocr/summarize", ...)` used by the
 * PDF importer.
 *
 * Same two-build split as ocrFetch.ts: the web build talks to the
 * /api/ocr/summarize-stream SSE route, while the standalone
 * (Tauri/Capacitor) build runs `summarizeOCR` in-process and gets the same
 * events straight from the callback. Either way the caller sees one
 * `onEvent` stream and one final result.
 */

import { isStandalone } from "./standalone";
import {
  summarizeOCR,
  OCRSummarizeRequestBody,
  OCRSummarizeSuccess,
  OCRSummarizeError,
  OCRSummarizeEvent,
  OCRSummarizeEventHandler,
} from "./ocrSummarizeCall";

export interface StreamSummarizeOptions {
  /** Progress events - rounds starting/ending and raw content deltas. */
  onEvent?: OCRSummarizeEventHandler;
  /**
   * A network failure restarts the extraction from scratch, so anything the
   * listener accumulated from the failed attempt must be thrown away. Called
   * just before the retry starts.
   */
  onRetry?: (attempt: number, error: string) => void;
  /** Wall-clock cap per attempt (web build only). */
  timeoutMs?: number;
  maxRetries?: number;
  /** Caller-owned cancellation - aborts immediately, no retry. */
  signal?: AbortSignal;
}

/** Matches the PDF importer's own summarize timeout (server allows 5 min). */
export const DEFAULT_STREAM_TIMEOUT_MS = 240000;
export const DEFAULT_STREAM_MAX_RETRIES = 2;

type StreamEnvelope =
  | OCRSummarizeEvent
  | { type: "done"; result: OCRSummarizeSuccess }
  | { type: "error"; error: string; status: number };

/**
 * Run one extraction, reporting progress as it goes.
 *
 * Returns `{ error, status }` for a refused/failed extraction (the
 * equivalent of a non-OK response) and throws only for network-level
 * failures that survived every retry, so callers can keep the same
 * error handling they had around the non-streaming call.
 */
export async function streamSummarizeOCR(
  body: OCRSummarizeRequestBody,
  options: StreamSummarizeOptions = {},
): Promise<OCRSummarizeSuccess | OCRSummarizeError> {
  const {
    onEvent,
    onRetry,
    timeoutMs = DEFAULT_STREAM_TIMEOUT_MS,
    maxRetries = DEFAULT_STREAM_MAX_RETRIES,
    signal,
  } = options;

  if (isStandalone()) {
    // In-process: no HTTP hop to time out or retry, and summarizeOCR
    // already bounds itself with its own continuation budget.
    return summarizeOCR(body, onEvent);
  }

  let lastError: Error = new Error("Request failed after retries");

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) onRetry?.(attempt, lastError.message);

    const controller = new AbortController();
    let timedOut = false;
    const timeoutId = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    const abortOuter = () => controller.abort();
    signal?.addEventListener("abort", abortOuter);

    try {
      return await runStreamRequest(body, onEvent, controller.signal);
    } catch (error) {
      const failure =
        error instanceof Error ? error : new Error(String(error));
      if (failure.name === "AbortError") {
        // Only our own timeout is retryable; a caller-driven abort has to
        // propagate straight away.
        if (!timedOut) throw error;
        lastError = new Error(`Request timed out after ${timeoutMs / 1000}s`);
      } else {
        lastError = failure;
      }

      if (attempt < maxRetries) {
        const delay = Math.min(1000 * Math.pow(2, attempt), 5000);
        console.log(
          `Summarize stream failed (${lastError.message}), retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})...`,
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    } finally {
      clearTimeout(timeoutId);
      signal?.removeEventListener("abort", abortOuter);
    }
  }

  throw lastError;
}

async function runStreamRequest(
  body: OCRSummarizeRequestBody,
  onEvent: OCRSummarizeEventHandler | undefined,
  signal: AbortSignal,
): Promise<OCRSummarizeSuccess | OCRSummarizeError> {
  const response = await fetch("/api/ocr/summarize-stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok) {
    // The route answers errors as stream events, so a non-OK status here is
    // the platform (payload too large, gateway timeout) rather than us.
    return {
      error:
        response.status === 413
          ? "Document too large for the server to accept. Try fewer pages per chunk."
          : `Note extraction failed (HTTP ${response.status})`,
      status: response.status,
    };
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error("No response body");

  const decoder = new TextDecoder();
  let buffer = "";
  let result: OCRSummarizeSuccess | OCRSummarizeError | null = null;

  const handleEvent = (event: StreamEnvelope) => {
    if (event.type === "done") {
      result = event.result;
    } else if (event.type === "error") {
      result = { error: event.error, status: event.status };
    } else {
      onEvent?.(event);
    }
  };

  const drainLines = (flush: boolean) => {
    const lines = buffer.split("\n");
    buffer = flush ? "" : lines.pop() || "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      try {
        handleEvent(JSON.parse(trimmed.slice(5).trim()));
      } catch {
        // Skip malformed events rather than failing the whole extraction.
      }
    }
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    drainLines(false);
  }
  drainLines(true);

  if (!result) {
    // Stream ended without a terminator - the connection dropped mid-flight,
    // which is exactly the case retrying is for.
    throw new Error("Note extraction stream ended unexpectedly");
  }

  return result;
}
