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
 * story that is due for both, and checks the key reached every call.
 *
 * The defaults are OpenRouter models now (decisions 50 and 51), so a player
 * with only a Mistral key has pointed the narration voice at a Mistral model
 * in Settings, and the unpinned side agents - which would otherwise run on
 * Claude Haiku 5.5 and fail with NO_API_KEY - must follow it (decision 51's
 * fallback for a player with no key for the side-agent default's provider).
 * The mock answers any model, so the test reads the model each call names and
 * checks it is that Mistral model, not just that the key rode along.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { generateStoryTurn, GenerationOptions } from "@/app/misc/generation";
import { getModelConfig } from "@/app/misc/ai_prices";
import { NARRATION_MODEL_KEY } from "@/app/misc/reasoningTiers";
import { createMockGMFetch } from "./helpers/mockGMFetch";
import type { MemoryEntry, StoryData } from "@/app/misc/structs";
import { LEGACY_OBSERVER_SETTINGS } from "./helpers/observerSettings";
import { isJudgeCall } from "./helpers/combinedJudges";

const MISTRAL_KEY = "mistral-test-key";
const ZAI_KEY = "zai-test-key";
/** The Default model a Mistral-only player picks in Settings; narration follows it (decision 118). */
const MISTRAL_NARRATION_MODEL = "Mistral Small 4";
/** What Settings saves for Default: the same choice in tiers 0, 1 and 2. */
const MISTRAL_DEFAULT_SLOT = {
  reasoningTierOverrides: JSON.stringify(
    [0, 1, 2, 3].map((i) => (i < 3 ? { modelKey: MISTRAL_NARRATION_MODEL, reasoningEffort: "none" } : null)),
  ),
};
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
    // Due for a Story Progress Observer check-in too, so one more side agent
    // runs on whatever model the others do.
    turnsSinceStoryProgressCheck: 100,
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
const isMemoryKeeper = (call: SideCall) =>
  call.body.messages[0]?.content?.includes("memory-curation layer") ?? false;
const isStoryProgress = (call: SideCall) =>
  call.body.messages[0]?.content?.includes("story-progress reviewer") ?? false;
const isDirectorAssistant = (call: SideCall) =>
  call.body.messages[0]?.content?.includes("spotlight-tracking layer") ?? false;
const isObserverJudge = (call: SideCall) =>
  isJudgeCall(call.body);

/**
 * Non-streaming /api/generate side calls get canned answers keyed on their
 * system prompt; everything else goes to a single prose-only GM round. Split
 * on the exact URL because "/api/generate" is a substring of
 * "/api/generate-stream".
 */
function createFetchMock(gmRounds: Parameters<typeof createMockGMFetch>[0] = [{ content: NARRATION }]) {
  const gm = createMockGMFetch(gmRounds);
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
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/**
 * layerSettings.ts and reasoningTiers.ts read the player's settings through
 * `typeof window` guards, and the logger then wants sessionStorage too.
 */
function stubBrowserStorage(entries: Record<string, string>) {
  const map = new Map(Object.entries(entries));
  const storage = {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, String(value)),
    removeItem: (key: string) => void map.delete(key),
    clear: () => map.clear(),
  };
  vi.stubGlobal("localStorage", storage);
  vi.stubGlobal("sessionStorage", { ...storage, clear: () => {} });
  vi.stubGlobal("window", {
    localStorage: storage,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  });
}

describe("side calls forward every provider key", () => {
  it("compacts and reflects with only a Mistral key saved and Default on a Mistral model", async () => {
    stubBrowserStorage(MISTRAL_DEFAULT_SLOT);
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

    // The model each call names is the Mistral narration voice, the one model
    // this player's only key can call - not Claude Haiku 5.5 on OpenRouter,
    // which the real proxy would refuse with NO_API_KEY.
    const modelsNamed = (list: SideCall[]) => [...new Set(list.map((c) => c.body.model))];
    expect(modelsNamed(calls.filter(isCompaction))).toEqual([MISTRAL_NARRATION_MODEL]);
    expect(modelsNamed(calls.filter(isReflection))).toEqual([MISTRAL_NARRATION_MODEL]);
    expect(modelsNamed(calls.filter(isMemoryKeeper))).toEqual([MISTRAL_NARRATION_MODEL]);
    expect(modelsNamed(calls.filter(isStoryProgress))).toEqual([MISTRAL_NARRATION_MODEL]);
    const sideCalls = calls.filter((call) => call.url === "/api/generate");
    expect(modelsNamed(sideCalls)).toEqual([MISTRAL_NARRATION_MODEL]);
    expect(getModelConfig(MISTRAL_NARRATION_MODEL).provider).toBe("mistral");
    expect(getModelConfig(MISTRAL_NARRATION_MODEL).model).not.toBe("anthropic/claude-haiku-5.5");

    // And the results actually landed - the point of the fix.
    expect(storyData.scene.summary).toContain("flooded ruins");
    expect(
      storyData.memory.some(
        (m) => typeof m !== "string" && m.isReflection === true,
      ),
    ).toBe(true);
  });

  it("runs the Observer's judges and the Director Assistant on that voice too", async () => {
    stubBrowserStorage(MISTRAL_DEFAULT_SLOT);
    // An increment_scene call makes the Director Assistant due; an active
    // thread gives it something to judge; the character sheet keeps the
    // Observer from suspending itself.
    const { fetchMock, calls } = createFetchMock([
      { toolCalls: [{ name: "increment_scene", arguments: {} }] },
      { content: NARRATION },
    ]);
    global.fetch = fetchMock as unknown as typeof fetch;

    const storyData = storyDueForCompactionAndReflection();
    storyData.lore = [
      {
        title: "Character Sheet",
        content: "Test Player, a thief. Nimble 3, Tough 1.",
        type: "character_sheet",
        enabled: true,
      },
    ] as unknown as StoryData["lore"];
    storyData.threads = [
      {
        id: "thread-1",
        title: "The flooded ruins",
        description: "What drowned the old keep?",
        status: "active",
        createdAt: 0,
      },
    ];

    await generateStoryTurn(
      storyData,
      "I pick the lock",
      {
        storyModel: NARRATION_MODEL_KEY,
        toolsModel: NARRATION_MODEL_KEY,
        choicesModel: NARRATION_MODEL_KEY,
        enableTools: true,
        skipChoices: true,
        replyLength: "medium",
        customMaxContext: 8000,
        mistralKey: MISTRAL_KEY,
        // The judges are off by default (decision 187); this suite is about
        // which model they run on when a player has them on.
        observerSettings: LEGACY_OBSERVER_SETTINGS,
      },
      {},
    );
    for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 0));

    const modelsNamed = (list: SideCall[]) => [...new Set(list.map((c) => c.body.model))];
    expect(calls.filter(isObserverJudge).length).toBeGreaterThan(0);
    expect(calls.filter(isDirectorAssistant).length).toBeGreaterThan(0);
    expect(modelsNamed(calls.filter(isObserverJudge))).toEqual([MISTRAL_NARRATION_MODEL]);
    expect(modelsNamed(calls.filter(isDirectorAssistant))).toEqual([MISTRAL_NARRATION_MODEL]);
    const sideCalls = calls.filter((call) => call.url === "/api/generate");
    expect(modelsNamed(sideCalls)).toEqual([MISTRAL_NARRATION_MODEL]);
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
