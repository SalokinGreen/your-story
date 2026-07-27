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
  /**
   * How long the stream may go *silent* before it counts as dead (web build
   * only). Deliberately an idle timeout rather than a wall-clock cap on the
   * whole attempt: a big document legitimately takes several minutes of
   * continuous streaming, and cutting a healthy extraction off mid-flight
   * just restarts it from nothing (see `streamSummarizeOCR`).
   */
  idleTimeoutMs?: number;
  maxRetries?: number;
  /** Caller-owned cancellation - aborts immediately, no retry. */
  signal?: AbortSignal;
}

/**
 * A stream that has gone quiet this long has stopped, not slowed down: the
 * gap between deltas is milliseconds while the model writes, and the longest
 * legitimate silence is the pause between two rounds (one provider request's
 * time-to-first-token).
 */
export const DEFAULT_STREAM_IDLE_TIMEOUT_MS = 90000;
export const DEFAULT_STREAM_MAX_RETRIES = 2;

/**
 * How much the model has to have written before a failed attempt is worth
 * more than a retry (see `streamSummarizeOCR`). A stream that died in its
 * first couple of notes has produced nothing a fresh attempt won't produce
 * again in seconds; one that died several notes in has minutes of work in it
 * that restarting would throw away.
 */
const SALVAGE_OVER_RETRY_CHARS = 2000;

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
 *
 * A retry starts the whole extraction over, so it is deliberately limited to
 * attempts that produced *nothing*: a connection that drops after the model
 * has already written notes gets reported to the caller (which can keep the
 * partial) rather than silently restarting from zero. Restarting a long
 * extraction that ran out of time only walks into the same wall again - from
 * the outside that looks like the importer looping forever.
 */
export async function streamSummarizeOCR(
  body: OCRSummarizeRequestBody,
  options: StreamSummarizeOptions = {},
): Promise<OCRSummarizeSuccess | OCRSummarizeError> {
  const {
    onEvent,
    onRetry,
    idleTimeoutMs = DEFAULT_STREAM_IDLE_TIMEOUT_MS,
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
    let idleTimer: ReturnType<typeof setTimeout> | null = null;
    // Every byte that arrives is proof the stream is alive, so the clock
    // starts again from there.
    const armIdleTimer = () => {
      if (idleTimer !== null) clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, idleTimeoutMs);
    };
    armIdleTimer();
    const abortOuter = () => controller.abort();
    signal?.addEventListener("abort", abortOuter);
    let charsWritten = 0;

    try {
      return await runStreamRequest(body, onEvent, controller.signal, {
        onActivity: armIdleTimer,
        onModelOutput: (chars) => {
          charsWritten += chars;
        },
      });
    } catch (error) {
      const failure =
        error instanceof Error ? error : new Error(String(error));
      if (failure.name === "AbortError") {
        // Only our own timeout is retryable; a caller-driven abort has to
        // propagate straight away.
        if (!timedOut) throw error;
        lastError = new Error(
          `Note extraction stalled - nothing received for ${idleTimeoutMs / 1000}s`,
        );
      } else {
        lastError = failure;
      }

      // Work already streamed is worth more than another full attempt.
      if (charsWritten >= SALVAGE_OVER_RETRY_CHARS) throw lastError;

      if (attempt < maxRetries) {
        const delay = Math.min(1000 * Math.pow(2, attempt), 5000);
        console.log(
          `Summarize stream failed (${lastError.message}), retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})...`,
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    } finally {
      if (idleTimer !== null) clearTimeout(idleTimer);
      signal?.removeEventListener("abort", abortOuter);
    }
  }

  throw lastError;
}

interface StreamHooks {
  /** Called for every piece of data read off the wire. */
  onActivity: () => void;
  /** Called with the size of each piece of content the model wrote. */
  onModelOutput: (chars: number) => void;
}

async function runStreamRequest(
  body: OCRSummarizeRequestBody,
  onEvent: OCRSummarizeEventHandler | undefined,
  signal: AbortSignal,
  hooks: StreamHooks,
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
      if (event.type === "delta") hooks.onModelOutput(event.text.length);
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

  // A silent stream is the case the idle timeout exists for, and a pending
  // `read()` on one resolves only when the body is torn down - which an
  // abort is not guaranteed to do promptly. Racing the signal makes the
  // abort take effect there and then.
  let abortPending: (reason: Error) => void = () => {};
  const aborted = new Promise<never>((_, reject) => {
    abortPending = reject;
  });
  aborted.catch(() => {});
  const onAbort = () => {
    const error = new Error("The note extraction stream was aborted");
    error.name = "AbortError";
    abortPending(error);
  };
  if (signal.aborted) onAbort();
  signal.addEventListener("abort", onAbort, { once: true });

  try {
    for (;;) {
      const { done, value } = await Promise.race([reader.read(), aborted]);
      if (done) break;
      hooks.onActivity();
      buffer += decoder.decode(value, { stream: true });
      drainLines(false);
    }
  } finally {
    signal.removeEventListener("abort", onAbort);
    reader.cancel().catch(() => {});
  }
  drainLines(true);

  if (!result) {
    // Stream ended without a terminator - the connection dropped mid-flight,
    // which is exactly the case retrying is for.
    throw new Error("Note extraction stream ended unexpectedly");
  }

  return result;
}
