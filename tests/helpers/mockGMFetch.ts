/**
 * Reusable fetch mock for exercising `generateStoryTurn`'s GM stage
 * (app/misc/generation.ts) through real `global.fetch` calls, without
 * hitting a network or a Next.js API route.
 *
 * generateStoryTurn's GM stage streams SSE frames from POST
 * /api/generate-stream, parsed by that file's `parseSSEStream` generator:
 * lines of `data: <json>\n\n`, where the JSON is `{type, content?,
 * details?, toolCalls?, meta?, error?}`, terminated by `data: [DONE]\n\n`.
 * This helper scripts a fixed sequence of GM-stage "rounds" - each either
 * prose with no tool calls (ends the GM's turn) or a set of tool calls
 * (continues the loop) - and replays them as real ReadableStream bodies in
 * that exact wire format.
 *
 * Scope is deliberately narrow: this only speaks for GM-stage calls,
 * identified by the presence of a `tools` array in the request body (only
 * buildGmRequestBody in generation.ts sends one - the Choices/Story-stage
 * fallback fetches never do). Any other fetch call - an unrecognized URL, a
 * non-GM-stage /api/generate-stream call, or a GM-stage call beyond the
 * scripted rounds - throws immediately naming what it got, instead of
 * silently returning a generic success. A test that trips this needs
 * either another scripted round or a narrower scenario (e.g.
 * `skipChoices: true`, no combat/embeddings), not a looser mock.
 */
import { vi } from "vitest";
import type { GenerationMeta } from "@/app/misc/generation";

export interface ScriptedToolCall {
  id?: string;
  name: string;
  arguments?: Record<string, unknown>;
}

export interface ScriptedGMRound {
  /** GM "thinking"/prose content streamed this round. */
  content?: string;
  /** Tool calls the GM makes this round. Omit/empty => a turn-ending round (no tool calls). */
  toolCalls?: ScriptedToolCall[];
  /** Overrides for this round's usage/meta; a minimal valid GenerationMeta fills in the rest. */
  meta?: Partial<GenerationMeta>;
}

function defaultMeta(overrides?: Partial<GenerationMeta>): GenerationMeta {
  return {
    model: "test-model",
    modelName: "Test Model",
    provider: "test-provider",
    usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 },
    tokenCost: 0,
    balance: 1000,
    ...overrides,
  };
}

function sseFrame(event: unknown): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

/** Builds a real ReadableStream<Uint8Array> in parseSSEStream's expected wire format. */
function buildGMRoundStream(round: ScriptedGMRound): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const frames: string[] = [];

  if (round.content) {
    frames.push(sseFrame({ type: "content", content: round.content }));
  }
  if (round.toolCalls && round.toolCalls.length > 0) {
    frames.push(
      sseFrame({
        type: "tool_calls",
        toolCalls: round.toolCalls.map((tc, i) => ({
          id: tc.id || `call_${i}`,
          type: "function",
          function: {
            name: tc.name,
            arguments: JSON.stringify(tc.arguments ?? {}),
          },
        })),
      }),
    );
  }
  frames.push(sseFrame({ type: "done", meta: defaultMeta(round.meta) }));
  frames.push("data: [DONE]\n\n");

  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const frame of frames) controller.enqueue(encoder.encode(frame));
      controller.close();
    },
  });
}

export interface RecordedRequestBody {
  messages: { role: string; content: string; [key: string]: unknown }[];
  tools?: unknown[];
  model?: string;
  [key: string]: unknown;
}

export interface RecordedFetchCall {
  url: string;
  body: RecordedRequestBody;
}

export interface MockGMFetch {
  /** Drop-in replacement for global.fetch. */
  fetchMock: ReturnType<typeof vi.fn>;
  /** Every call made to /api/generate-stream, in request order, with parsed JSON bodies. */
  allCalls: () => RecordedFetchCall[];
  /** Subset of allCalls() that carry a `tools` array - the GM stage's fingerprint (see buildGmRequestBody, generation.ts). */
  gmStageCalls: () => RecordedFetchCall[];
}

/**
 * Scripts `rounds` as consecutive responses to GM-stage calls
 * (POST /api/generate-stream with a `tools` array in the body).
 *
 * `otherResponses`, if supplied, handles fetch calls that don't match the
 * GM-stage fingerprint (e.g. a future test exercising the Choices stage,
 * which also hits /api/generate-stream but without `tools`, or the Story
 * stage's own separate call). Keyed by a substring of the request URL;
 * matched in array order. Not needed for GM-stage-only scenarios where the
 * GM stage's own final prose becomes the story content directly (see
 * `gmFinalStoryContent` in generation.ts) and `skipChoices: true` is passed
 * - the cheapest, most honest way to exercise the M2 gate without also
 * having to fabricate Story/Choices-stage response shapes.
 */
export function createMockGMFetch(
  rounds: ScriptedGMRound[],
  otherResponses: { urlIncludes: string; response: () => Response | Promise<Response> }[] = [],
): MockGMFetch {
  let nextRound = 0;
  const calls: RecordedFetchCall[] = [];

  const fetchMock = vi.fn(async (url: unknown, init?: RequestInit) => {
    const urlStr = String(url);
    const body: RecordedRequestBody = init?.body
      ? JSON.parse(init.body as string)
      : ({ messages: [] } as RecordedRequestBody);
    calls.push({ url: urlStr, body });

    const otherHandler = otherResponses.find((r) => urlStr.includes(r.urlIncludes));
    if (otherHandler) {
      return otherHandler.response();
    }

    if (!urlStr.includes("/api/generate-stream")) {
      throw new Error(
        `mockGMFetch: unscripted fetch to "${urlStr}" - this helper only speaks for GM-stage ` +
          `/api/generate-stream calls by default. Pass an "otherResponses" entry matching this URL ` +
          `if the scenario legitimately needs it.`,
      );
    }
    if (!body?.tools) {
      throw new Error(
        `mockGMFetch: unscripted /api/generate-stream call without a "tools" array in the body ` +
          `(not a GM-stage request, e.g. the Choices stage) - pass "skipChoices: true" in generation ` +
          `options, or an "otherResponses" entry, if this call is expected. Body: ${JSON.stringify(body)}`,
      );
    }
    if (nextRound >= rounds.length) {
      throw new Error(
        `mockGMFetch: GM stage made an extra fetch call (this would be round ${nextRound + 1}) beyond ` +
          `the ${rounds.length} scripted round(s). If this is expected, script another round; if not, ` +
          `the mechanism under test looped more than expected.`,
      );
    }
    const round = rounds[nextRound];
    nextRound++;
    return {
      ok: true,
      status: 200,
      text: async () => "",
      body: buildGMRoundStream(round),
    } as unknown as Response;
  });

  return {
    fetchMock,
    allCalls: () => calls,
    gmStageCalls: () => calls.filter((c) => c.body?.tools),
  };
}
