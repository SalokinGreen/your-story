/**
 * Every AI call a turn makes has to carry the key for its model's provider -
 * all six are BYOK and the proxy picks the one it needs (providerCall.ts's
 * resolveProviderAndKey), so a call that forwards only some of them fails
 * with NO_API_KEY whenever the model lives on a provider it left out.
 *
 * Compaction and reflection forwarded only openRouterKey/deepseekKey/
 * googleKey while running on `storyModel`, which then defaulted to the
 * narration model (a Mistral model at the time). The proxy refused every one
 * of those calls and the failure was swallowed, so with default settings a
 * long campaign never got a scene summary or a reflection insight (status
 * report §6.13). This drives a real turn with nothing but a Mistral key, on a
 * story that is due for both, and checks the key reached every call. The
 * defaults have moved to OpenRouter models since (decisions 50 and 51); the
 * mock accepts any model, so what is checked is the forwarding of all six
 * keys, which is independent of which provider a call's model lives on.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { generateStoryTurn, GenerationOptions } from "@/app/misc/generation";
import { NARRATION_MODEL_KEY } from "@/app/misc/reasoningTiers";
import { createMockGMFetch } from "./helpers/mockGMFetch";
import type { MemoryEntry, StoryData } from "@/app/misc/structs";

const MISTRAL_KEY = "mistral-test-key";
const ZAI_KEY = "zai-test-key";
const NARRATION = "The lock clicks open. The corridor beyond is dark.";

/** ~1,500 tokens apiece - several of these age well past a small history budget. */
const LONG_PART = "The party pressed on through the flooded ruins, arguing over the map. ".repeat(
  90,
);

function storyDueForCompactionAndReflection(): StoryData {
  const highImportance = (content: string): MemoryEntry => ({ content, importance: 9 });
  return {
    story_name: "Test Story",
    premise: "Test premise",
    player_name: "Test Player",
    scene: {
      parts: Array.from({ length: 8 }, () => ({
        content: LONG_PART,
        imageUrl: "",
        user: false,
        role: "assistant",
      })),
    },
    stats: [],
    resources: [],
    inventory: [],
    abilities: [],
    achievements: [],
    lore: [],
    // Same batch reflection.test.ts uses to make a pass due.
    memory: [
      highImportance("The player negotiated with the guard."),
      highImportance("The player negotiated with the merchant."),
      highImportance("The player negotiated with the bandit chief."),
      highImportance("The player negotiated their way past the sentry."),
    ],
    npcs: [],
    sessionZeroActive: false,
  } as unknown as StoryData;
}

interface SideCall {
  url: string;
  body: Record<string, unknown> & { messages: { role: string; content: string }[] };
}

const isCompaction = (call: SideCall) =>
  call.body.messages[0]?.content?.includes("running summary") ?? false;
const isReflection = (call: SideCall) =>
  call.body.messages[0]?.content?.includes("memory-reflection layer") ?? false;

/**
 * Non-streaming /api/generate side calls get canned answers keyed on their
 * system prompt; everything else goes to a single prose-only GM round. Split
 * on the exact URL because "/api/generate" is a substring of
 * "/api/generate-stream".
 */
function createFetchMock() {
  const gm = createMockGMFetch([{ content: NARRATION }]);
  const calls: SideCall[] = [];

  const fetchMock = vi.fn(async (url: unknown, init?: RequestInit) => {
    const call: SideCall = { url: String(url), body: JSON.parse(init!.body as string) };
    calls.push(call);
    if (call.url === "/api/generate") {
      const content = isCompaction(call)
        ? "The party crossed the flooded ruins arguing over the map."
        : isReflection(call)
          ? "The player consistently prefers negotiation over combat."
          : "[]";
      return { ok: true, json: async () => ({ content }) } as unknown as Response;
    }
    return (gm.fetchMock as unknown as typeof fetch)(url as RequestInfo, init);
  });

  return { fetchMock, calls };
}

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("side calls forward every provider key", () => {
  it("compacts and reflects, forwarding a Mistral key that is the only one saved", async () => {
    const { fetchMock, calls } = createFetchMock();
    global.fetch = fetchMock as unknown as typeof fetch;

    const storyData = storyDueForCompactionAndReflection();
    const options: GenerationOptions = {
      storyModel: NARRATION_MODEL_KEY,
      toolsModel: NARRATION_MODEL_KEY,
      choicesModel: NARRATION_MODEL_KEY,
      enableTools: true,
      skipChoices: true,
      replyLength: "medium",
      customMaxContext: 8000,
      mistralKey: MISTRAL_KEY,
    };

    await generateStoryTurn(storyData, "I pick the lock", options, {});
    // Let the fire-and-forget background layers land before checking them too.
    for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 0));

    expect(calls.filter(isCompaction).length).toBeGreaterThan(0);
    expect(calls.filter(isReflection).length).toBeGreaterThan(0);

    const missingKey = calls
      .filter((call) => call.body.mistralKey !== MISTRAL_KEY)
      .map((call) => `${call.url}: ${call.body.messages[0]?.content?.slice(0, 60)}`);
    expect(missingKey).toEqual([]);

    // And the results actually landed - the point of the fix.
    expect(storyData.scene.summary).toContain("flooded ruins");
    expect(
      storyData.memory.some(
        (m) => typeof m !== "string" && m.isReflection === true,
      ),
    ).toBe(true);
  });

  it("forwards a Z.ai key to every call, the sixth provider (decision 18)", async () => {
    const { fetchMock, calls } = createFetchMock();
    global.fetch = fetchMock as unknown as typeof fetch;

    const options: GenerationOptions = {
      storyModel: NARRATION_MODEL_KEY,
      toolsModel: NARRATION_MODEL_KEY,
      choicesModel: NARRATION_MODEL_KEY,
      enableTools: true,
      skipChoices: true,
      replyLength: "medium",
      customMaxContext: 8000,
      zaiKey: ZAI_KEY,
    };

    await generateStoryTurn(storyDueForCompactionAndReflection(), "I pick the lock", options, {});
    for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 0));

    expect(calls.length).toBeGreaterThan(2);
    const missingKey = calls
      .filter((call) => call.body.zaiKey !== ZAI_KEY)
      .map((call) => `${call.url}: ${call.body.messages[0]?.content?.slice(0, 60)}`);
    expect(missingKey).toEqual([]);
  });
});
