/**
 * The side agents a turn kicks off - the Observer's judges, the Memory
 * Keeper, the Story Progress Observer, compaction and reflection - run on
 * their own default (SIDE_AGENT_DEFAULT_MODEL_KEY, Claude Haiku 5.5, decision
 * 51) unless the player pinned one in Settings > Architecture
 * (layerSettings.ts). Decision 19 had them follow the narration model; they no
 * longer do, so neither the narration voice nor the GM's tier model moves them.
 *
 * They used to take their model from the turn's GenerationMeta.model, which
 * is the provider's own model id ("z-ai/glm-5.3"), not the AI_MODELS key
 * ("GLM 5.3") the proxy resolves a request by. No key equals its provider id,
 * so getModelConfig() missed on every side call and fell back to DeepSeek V4
 * Flash - which needs a DeepSeek key, so a player without one got NO_API_KEY
 * from every side agent.
 *
 * This drives real turns and checks the model each side call actually sends.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { generateStoryTurn, GenerationOptions } from "@/app/misc/generation";
import { NARRATION_MODEL_KEY } from "@/app/misc/reasoningTiers";
import { SIDE_AGENT_DEFAULT_MODEL_KEY } from "@/app/misc/layerSettings";
import { createMockGMFetch, sseStreamResponse } from "./helpers/mockGMFetch";
import type { StoryData } from "@/app/misc/structs";

const NARRATION = "The lock clicks open. The corridor beyond is dark.";

// The GM round and the narration call report models that differ from each
// other and from the side-agent default, so a side call that inherits either
// of them shows up.
const GM_META = {
  model: "anthropic/claude-sonnet-5.5",
  modelName: "Claude Sonnet 5.5",
  provider: "openrouter",
};
const NARRATION_META = {
  model: "z-ai/glm-5.3",
  modelName: NARRATION_MODEL_KEY,
  provider: "openrouter",
};

function minimalStory(): StoryData {
  return {
    story_name: "Test Story",
    premise: "Test premise",
    player_name: "Test Player",
    scene: { parts: [] },
    stats: [],
    resources: [],
    inventory: [],
    abilities: [],
    achievements: [],
    lore: [],
    memory: [],
    npcs: [],
    sessionZeroActive: false,
    // Due for a Story Progress Observer check-in, so a second side agent
    // runs alongside the Memory Keeper.
    turnsSinceStoryProgressCheck: 100,
  } as unknown as StoryData;
}

interface Call {
  url: string;
  body: Record<string, unknown> & {
    model?: string;
    tools?: unknown[];
    messages: { role: string; content: string }[];
  };
}

const systemPromptIncludes = (call: Call, text: string) =>
  call.body.messages[0]?.content?.includes(text) ?? false;
const isMemoryKeeper = (call: Call) => systemPromptIncludes(call, "memory-curation layer");
const isStoryProgress = (call: Call) => systemPromptIncludes(call, "story-progress reviewer");
// Same markers generation.sideCallKeys.test.ts uses.
const isCompaction = (call: Call) => systemPromptIncludes(call, "running summary");
const isReflection = (call: Call) => systemPromptIncludes(call, "memory-reflection layer");

/**
 * GM-stage calls (the ones carrying `tools`) go to the scripted GM round; a
 * /api/generate-stream call without tools is the separate narration call;
 * every /api/generate call is a side call and gets an empty JSON answer,
 * which each side agent treats as "nothing to report".
 */
function createFetchMock(gmRoundContent: string) {
  const gm = createMockGMFetch([{ content: gmRoundContent, meta: GM_META }]);
  const calls: Call[] = [];

  const fetchMock = vi.fn(async (url: unknown, init?: RequestInit) => {
    const call: Call = { url: String(url), body: JSON.parse(init!.body as string) };
    calls.push(call);
    if (call.url === "/api/generate") {
      return { ok: true, json: async () => ({ content: "[]" }) } as unknown as Response;
    }
    if (call.url === "/api/generate-stream" && !call.body.tools) {
      return sseStreamResponse({ content: NARRATION, meta: NARRATION_META });
    }
    return (gm.fetchMock as unknown as typeof fetch)(url as RequestInfo, init);
  });

  return {
    fetchMock,
    calls,
    sideCalls: () => calls.filter((c) => c.url === "/api/generate"),
  };
}

function memoryStorage(entries: Record<string, string> = {}) {
  const map = new Map(Object.entries(entries));
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, String(value)),
    removeItem: (key: string) => void map.delete(key),
    clear: () => map.clear(),
  };
}

/**
 * layerSettings.ts and reasoningTiers.ts read through `typeof window`
 * guards; the logger then wants sessionStorage too.
 */
function stubBrowserStorage(entries: Record<string, string>) {
  const storage = memoryStorage(entries);
  vi.stubGlobal("localStorage", storage);
  vi.stubGlobal("sessionStorage", memoryStorage());
  vi.stubGlobal("window", {
    localStorage: storage,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  });
}

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** Every request the last runTurn made, side calls and the narration stream alike. */
let lastTurnCalls: Call[] = [];

async function runTurn(
  gmRoundContent: string,
  storyData: StoryData = minimalStory(),
  extraOptions: Partial<GenerationOptions> = {},
): Promise<Call[]> {
  const { fetchMock, calls: allCalls, sideCalls } = createFetchMock(gmRoundContent);
  lastTurnCalls = allCalls;
  global.fetch = fetchMock as unknown as typeof fetch;
  vi.spyOn(console, "warn").mockImplementation(() => {});

  const options: GenerationOptions = {
    storyModel: NARRATION_MODEL_KEY,
    toolsModel: NARRATION_MODEL_KEY,
    choicesModel: NARRATION_MODEL_KEY,
    enableTools: true,
    skipChoices: true,
    replyLength: "medium",
    openRouterKey: "openrouter-test-key",
    mistralKey: "mistral-test-key",
    ...extraOptions,
  };

  await generateStoryTurn(storyData, "I pick the lock", options, {});
  // Let the fire-and-forget background layers land before checking them too.
  for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 0));

  const calls = sideCalls();
  expect(calls.some(isMemoryKeeper)).toBe(true);
  return calls;
}

/** ~1,500 tokens apiece - several of these age well past a small history budget. */
const LONG_PART = "The party pressed on through the flooded ruins, arguing over the map. ".repeat(
  90,
);

/** Due for both compaction and reflection, as in generation.sideCallKeys.test.ts. */
function storyDueForCompactionAndReflection(): StoryData {
  const story = minimalStory();
  story.scene.parts = Array.from({ length: 8 }, () => ({
    content: LONG_PART,
    imageUrl: "",
    user: false,
    role: "assistant",
  })) as StoryData["scene"]["parts"];
  story.memory = [
    "The player negotiated with the guard.",
    "The player negotiated with the merchant.",
    "The player negotiated with the bandit chief.",
    "The player negotiated their way past the sentry.",
  ].map((content) => ({ content, importance: 9 }));
  return story;
}

const modelsOf = (calls: Call[]) => [...new Set(calls.map((c) => c.body.model))];

describe("side calls default to Claude Haiku 5.5, not the narration model (decision 51)", () => {
  it("is not the narration default, so the two cannot be confused below", () => {
    expect(SIDE_AGENT_DEFAULT_MODEL_KEY).toBe("Claude Haiku 5.5");
    expect(SIDE_AGENT_DEFAULT_MODEL_KEY).not.toBe(NARRATION_MODEL_KEY);
  });

  it("when the GM's own round wrote the prose", async () => {
    const calls = await runTurn(NARRATION);
    expect(calls.some(isStoryProgress)).toBe(true);
    expect(modelsOf(calls)).toEqual([SIDE_AGENT_DEFAULT_MODEL_KEY]);
  });

  it("when a separate narration call wrote the prose, which stays on the narration model", async () => {
    const calls = await runTurn("");
    expect(calls.some(isStoryProgress)).toBe(true);
    expect(modelsOf(calls)).toEqual([SIDE_AGENT_DEFAULT_MODEL_KEY]);

    const narrationCalls = lastTurnCalls.filter(
      (c) => c.url === "/api/generate-stream" && !c.body.tools,
    );
    expect(narrationCalls.length).toBeGreaterThan(0);
    expect(modelsOf(narrationCalls)).toEqual([NARRATION_MODEL_KEY]);
  });

  it("ignore the player's narration override, and a pinned stage override beats the default", async () => {
    stubBrowserStorage({
      narrationModelOverride: "Ministral 3 8B",
      memoryKeeperModelOverride: JSON.stringify({
        modelKey: "Mistral Medium 3.5",
        reasoningEffort: "none",
      }),
    });

    const calls = await runTurn(NARRATION);
    expect(calls.some(isStoryProgress)).toBe(true);
    expect(modelsOf(calls.filter(isMemoryKeeper))).toEqual(["Mistral Medium 3.5"]);
    expect(modelsOf(calls.filter((c) => !isMemoryKeeper(c)))).toEqual([
      SIDE_AGENT_DEFAULT_MODEL_KEY,
    ]);
  });

  it("compaction and reflection ignore the narration override too", async () => {
    stubBrowserStorage({ narrationModelOverride: "Ministral 3 8B" });

    const calls = await runTurn(NARRATION, storyDueForCompactionAndReflection(), {
      customMaxContext: 8000,
    });
    expect(calls.filter(isCompaction).length).toBeGreaterThan(0);
    expect(calls.filter(isReflection).length).toBeGreaterThan(0);
    expect(modelsOf(calls.filter(isCompaction))).toEqual([SIDE_AGENT_DEFAULT_MODEL_KEY]);
    expect(modelsOf(calls.filter(isReflection))).toEqual([SIDE_AGENT_DEFAULT_MODEL_KEY]);
  });
});
