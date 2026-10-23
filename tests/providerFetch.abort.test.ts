/**
 * Cancellation in the standalone (Tauri/Capacitor) build, where providerFetch
 * runs providerCall.ts in-process instead of fetching an /api/* route. The
 * AbortSignal from the Stop button or the Observer's speculative rewrite used
 * to stop at providerFetch, so the provider call ran - and billed - to the
 * end, and whoever was waiting on it kept waiting.
 *
 * The fetch underneath (platformFetch.ts) is mocked the two ways the native
 * shells behave: like Tauri's plugin-http, which honours the signal but
 * reports it as "Request cancelled" rather than an AbortError, and like
 * Capacitor's patched fetch, which ignores the signal. Either way the caller
 * must get an AbortError, at once.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";

// A model whose provider these tests hold the key for - not the default narration
// model, which moves with the catalog (decision 50).
const MISTRAL_MODEL = "Mistral Small 4";

const mockPlatformFetch = vi.fn();
vi.mock("@/app/misc/platformFetch", () => ({
  getProviderFetch: () => mockPlatformFetch,
  getAbortableProviderFetch: () => mockPlatformFetch,
  markHostDown: vi.fn(),
  hostOf: (url: string) => new URL(url).hostname,
}));

import { providerFetch } from "@/app/misc/providerFetch";
import { callSideModel } from "@/app/misc/sideModelCall";
import { logger } from "@/app/misc/logger";

const MESSAGES = [{ role: "user" as const, content: "Go on." }];
const BODY = { messages: MESSAGES, model: MISTRAL_MODEL, mistralKey: "mistral-key" };

/**
 * Settles with whatever `promise` settles with, or with PENDING if it is
 * still waiting after `ms` - so the unfixed code fails fast instead of
 * hanging the test until its timeout.
 */
const PENDING = Symbol("still pending");
function within<T>(promise: Promise<T>, ms = 250): Promise<T | typeof PENDING> {
  return Promise.race([
    promise,
    new Promise<typeof PENDING>((resolve) => setTimeout(() => resolve(PENDING), ms)),
  ]);
}

function sse(data: unknown): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(data)}\n\n`);
}

/** Tauri's plugin-http: sends the first chunk, then errors its body on abort. */
function tauriStreamingFetch(_url: string, init: RequestInit) {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(sse({ choices: [{ delta: { content: "Once" } }] }));
      // ...and stays open, like a provider still generating.
      init.signal?.addEventListener("abort", () => controller.error("Request cancelled"));
    },
  });
  return Promise.resolve(new Response(body, { status: 200 }));
}

/** Tauri's plugin-http before the response headers arrive. */
function tauriPendingFetch(_url: string, init: RequestInit) {
  return new Promise<Response>((_resolve, reject) => {
    init.signal?.addEventListener("abort", () => reject(new Error("Request cancelled")));
  });
}

/** Capacitor's patched fetch: never looks at the signal. */
function capacitorPendingFetch() {
  return new Promise<Response>(() => {});
}

let warn: ReturnType<typeof vi.spyOn>;
let error: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  process.env.NEXT_PUBLIC_STANDALONE = "true";
  warn = vi.spyOn(logger, "warn").mockImplementation(() => {});
  error = vi.spyOn(logger, "error").mockImplementation(() => {});
});

afterEach(() => {
  delete process.env.NEXT_PUBLIC_STANDALONE;
  mockPlatformFetch.mockReset();
  vi.restoreAllMocks();
});

describe("standalone streamed call (the GM and story stages)", () => {
  it("errors the reader with an AbortError mid-stream and aborts Tauri's fetch", async () => {
    mockPlatformFetch.mockImplementation(tauriStreamingFetch);
    const abort = new AbortController();

    const response = await providerFetch("/api/generate-stream", BODY, abort.signal);
    const reader = response.body!.getReader();
    const first = await within(reader.read());
    expect(first).not.toBe(PENDING);
    expect(new TextDecoder().decode((first as ReadableStreamReadResult<Uint8Array>).value)).toContain(
      '"content":"Once"',
    );

    abort.abort();

    await expect(within(reader.read())).rejects.toMatchObject({ name: "AbortError" });
    const [, init] = mockPlatformFetch.mock.calls[0] as [string, RequestInit];
    expect(init.signal?.aborted).toBe(true);
    expect(error).not.toHaveBeenCalled();
  });

  it("errors the reader even when the fetch underneath ignores the signal (Capacitor)", async () => {
    mockPlatformFetch.mockImplementation(capacitorPendingFetch);
    const abort = new AbortController();

    const response = await providerFetch("/api/generate-stream", BODY, abort.signal);
    const reader = response.body!.getReader();
    const read = reader.read();
    abort.abort();

    await expect(within(read)).rejects.toMatchObject({ name: "AbortError" });
  });
});

describe("standalone non-streaming call (side calls, the Designer)", () => {
  it("rejects with an AbortError that callSideModel re-throws instead of logging", async () => {
    mockPlatformFetch.mockImplementation(tauriPendingFetch);
    const abort = new AbortController();

    const call = callSideModel({
      label: "Game Designer",
      model: MISTRAL_MODEL,
      messages: MESSAGES,
      keys: { mistralKey: "mistral-key" },
      abortSignal: abort.signal,
    });
    abort.abort();

    await expect(within(call)).rejects.toMatchObject({ name: "AbortError" });
    expect(mockPlatformFetch).toHaveBeenCalledTimes(1);
    const [, init] = mockPlatformFetch.mock.calls[0] as [string, RequestInit];
    expect(init.signal?.aborted).toBe(true);
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it("rejects at once even when the fetch underneath ignores the signal (Capacitor)", async () => {
    mockPlatformFetch.mockImplementation(capacitorPendingFetch);
    const abort = new AbortController();

    const call = providerFetch("/api/generate", BODY, abort.signal);
    abort.abort();

    await expect(within(call)).rejects.toMatchObject({ name: "AbortError" });
  });
});

it("leaves a finished call's fetch alone when Stop comes later in the turn", async () => {
  // Tauri's plugin-http never removes its abort listeners, so a fetch still
  // linked to the turn's signal would try to cancel a finished request -
  // an "Uncaught (in promise)" in the console for each one.
  mockPlatformFetch.mockImplementation(async (_url: string, init: RequestInit) =>
    init.body && JSON.parse(init.body as string).stream
      ? new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(sse({ choices: [{ delta: { content: "Done." }, finish_reason: "stop" }] }));
              controller.close();
            },
          }),
        )
      : new Response(
          JSON.stringify({
            choices: [{ message: { role: "assistant", content: "Done." } }],
            usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
          }),
        ),
  );
  const turn = new AbortController();

  const nonStreaming = await providerFetch("/api/generate", BODY, turn.signal);
  expect(nonStreaming.ok).toBe(true);
  const streamed = await providerFetch("/api/generate-stream", BODY, turn.signal);
  await streamed.text();
  turn.abort();

  const signals = mockPlatformFetch.mock.calls.map(([, init]) => (init as RequestInit).signal);
  expect(signals).toHaveLength(2);
  for (const signal of signals) {
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(signal?.aborted).toBe(false);
  }
});

it("never reaches the provider with a signal that is already aborted", async () => {
  mockPlatformFetch.mockImplementation(capacitorPendingFetch);
  const abort = new AbortController();
  abort.abort();

  await expect(within(providerFetch("/api/generate", BODY, abort.signal))).rejects.toMatchObject({
    name: "AbortError",
  });
  const response = await providerFetch("/api/generate-stream", BODY, abort.signal);
  await expect(within(response.body!.getReader().read())).rejects.toMatchObject({
    name: "AbortError",
  });
  expect(mockPlatformFetch).not.toHaveBeenCalled();
});
