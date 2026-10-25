/**
 * Decision 53: every model call of a turn carries an explicit reasoning
 * effort, chosen alongside its model. This drives real turns through
 * generateStoryTurn and reads the effort each request actually sends:
 *
 *  - the narration's calls (the story continuation, the choices, the
 *    choices re-run after an Observer rewrite, and the rewrite itself when the
 *    Observer is unpinned) carry the Default slot's effort (decision 118),
 *    "none" until the player picks one, and "none" again when Default's model
 *    falls back;
 *  - the side agents carry "none", or their pin's own effort;
 *  - the tier classifier runs on the side-agent model at its effort
 *    (decision 124), or on Default when the player has no key for that.
 *
 * The storage and resolution half is tests/effort.settings.test.ts.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { generateStoryTurn, GenerationOptions } from "@/app/misc/generation";
import { NARRATION_MODEL_KEY, isReasoningEffort } from "@/app/misc/reasoningTiers";
import { SIDE_AGENT_DEFAULT_MODEL_KEY } from "@/app/misc/layerSettings";
import { createMockGMFetch, sseStreamResponse } from "./helpers/mockGMFetch";
import type { StoryData } from "@/app/misc/structs";
import { LEGACY_OBSERVER_SETTINGS } from "./helpers/observerSettings";
import { isJudgeCall, judgeReply, requestedJudges } from "./helpers/combinedJudges";

const NARRATION = "The lock clicks open. The corridor beyond is dark.";
/** Well past the "medium" band's ceiling, so the Observer's length check trips. */
const LONG_NARRATION = Array(400).fill("word").join(" ");
const REWRITTEN = "You force the lock. It gives.";
const CHOICES = "- Step into the corridor\n- Listen at the door\n- Walk away";

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

interface Call {
  url: string;
  body: Record<string, unknown> & {
    model?: string;
    tools?: unknown[];
    reasoningEffort?: string;
    messages: { role: string; content: string }[];
  };
}

function storyWith(overrides: Partial<StoryData> = {}): StoryData {
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
    // A character sheet means setup is over, so the Observer judges the turn
    // instead of suspending itself.
    lore: [
      {
        title: "Character Sheet",
        content: "Test Player, a thief. Nimble 3, Tough 1.",
        type: "character_sheet",
        enabled: true,
      },
    ],
    memory: [],
    npcs: [],
    sessionZeroActive: false,
    // Due for a Story Progress Observer check-in, so a second side agent
    // runs alongside the Memory Keeper.
    turnsSinceStoryProgressCheck: 100,
    ...overrides,
  } as unknown as StoryData;
}

const firstMessage = (call: Call) => call.body.messages[0]?.content ?? "";
const lastMessage = (call: Call) => call.body.messages[call.body.messages.length - 1]?.content ?? "";

const isMemoryKeeper = (c: Call) => firstMessage(c).includes("memory-curation layer");
const isStoryProgress = (c: Call) => firstMessage(c).includes("story-progress reviewer");
const isCompaction = (c: Call) => firstMessage(c).includes("running summary");
const isReflection = (c: Call) => firstMessage(c).includes("memory-reflection layer");
const isClassifier = (c: Call) => firstMessage(c).includes("Classify the following player action");
const isLengthJudge = (c: Call) => isJudgeCall(c.body) && requestedJudges(c.body).includes("length");
const isRewrite = (c: Call) => lastMessage(c).includes("flagged by an automated reviewer");
const isChoices = (c: Call) => c.url === "/api/generate-stream" && !c.body.tools && firstMessage(c).includes("choice designer");
const isNarrationStream = (c: Call) => c.url === "/api/generate-stream" && !c.body.tools && !isChoices(c);
const isGmRound = (c: Call) => c.url === "/api/generate-stream" && !!c.body.tools;

/** The judges are one call; this scripted string stands for "the length judge says major". */
const LENGTH_MAJOR = "LENGTH_MAJOR";
const judgeVerdict = (justified: boolean) => (justified ? "{}" : LENGTH_MAJOR);

function memoryStorage(entries: Record<string, string> = {}) {
  const map = new Map(Object.entries(entries));
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, String(value)),
    removeItem: (key: string) => void map.delete(key),
    clear: () => map.clear(),
  };
}

/** What Settings saves for the Default slot: the same choice in tiers 0, 1 and 2. */
function defaultSlotStorage(modelKey: string, reasoningEffort: string): Record<string, string> {
  const entry = { modelKey, reasoningEffort };
  return { reasoningTierOverrides: JSON.stringify([entry, entry, entry, null]) };
}

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

interface RunOptions {
  /** What the GM's round wrote; "" makes a separate narration call write the prose. */
  gmRound?: string;
  story?: StoryData;
  userInput?: string;
  extra?: Partial<GenerationOptions>;
  /** Answer to a side call (default: "[]", which each side agent treats as nothing to report). */
  respond?: (call: Call) => string;
}

async function runTurn({
  gmRound = NARRATION,
  story = storyWith(),
  userInput = "I pick the lock",
  extra = {},
  respond = () => "[]",
}: RunOptions = {}): Promise<Call[]> {
  const gm = createMockGMFetch([{ content: gmRound, meta: GM_META }]);
  const calls: Call[] = [];

  const fetchMock = vi.fn(async (url: unknown, init?: RequestInit) => {
    const call: Call = { url: String(url), body: JSON.parse(init!.body as string) };
    calls.push(call);
    if (call.url === "/api/generate") {
      const scripted = respond(call);
      const content = isJudgeCall(call.body)
        ? judgeReply(call.body, scripted === LENGTH_MAJOR ? { length: "major" } : {})
        : scripted;
      return { ok: true, json: async () => ({ content }) } as unknown as Response;
    }
    if (isChoices(call)) {
      return sseStreamResponse({ content: CHOICES, meta: NARRATION_META });
    }
    if (isNarrationStream(call)) {
      return sseStreamResponse({ content: NARRATION, meta: NARRATION_META });
    }
    return (gm.fetchMock as unknown as typeof fetch)(url as RequestInfo, init);
  });
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
    ...extra,
  };

  await generateStoryTurn(story, userInput, options, {});
  // Let the fire-and-forget background layers land before checking them too.
  for (let i = 0; i < 30; i++) await new Promise((r) => setTimeout(r, 0));
  return calls;
}

const effortsOf = (calls: Call[]) => [...new Set(calls.map((c) => c.body.reasoningEffort))];

describe("every request of a turn carries an effort", () => {
  it("by default, side calls, narration, choices and the GM round alike", async () => {
    const calls = await runTurn({ gmRound: "", extra: { skipChoices: false } });

    // The calls this is about were all made.
    expect(calls.some(isGmRound)).toBe(true);
    expect(calls.some(isNarrationStream)).toBe(true);
    expect(calls.some(isChoices)).toBe(true);
    expect(calls.some(isMemoryKeeper)).toBe(true);
    expect(calls.some(isStoryProgress)).toBe(true);

    for (const call of calls) {
      expect(isReasoningEffort(call.body.reasoningEffort), `${call.url} ${firstMessage(call).slice(0, 40)}`).toBe(
        true,
      );
    }
  });
});

describe("the side agents carry none, or their pin's effort (decision 53)", () => {
  it("none when unpinned, whatever the narration effort is", async () => {
    stubBrowserStorage({ narrationEffortOverride: "xhigh" });
    const calls = await runTurn();
    const sideCalls = calls.filter((c) => c.url === "/api/generate");
    expect(sideCalls.some(isMemoryKeeper)).toBe(true);
    expect(sideCalls.some(isStoryProgress)).toBe(true);
    expect(effortsOf(sideCalls)).toEqual(["none"]);
    expect([...new Set(sideCalls.map((c) => c.body.model))]).toEqual([SIDE_AGENT_DEFAULT_MODEL_KEY]);
  });

  it("a pinned layer keeps its own effort and the others stay on none", async () => {
    stubBrowserStorage({
      memoryKeeperModelOverride: JSON.stringify({ modelKey: "Mistral Medium 3.5", reasoningEffort: "high" }),
    });
    const calls = await runTurn();
    const sideCalls = calls.filter((c) => c.url === "/api/generate");
    expect(effortsOf(sideCalls.filter(isMemoryKeeper))).toEqual(["high"]);
    expect(effortsOf(sideCalls.filter((c) => !isMemoryKeeper(c)))).toEqual(["none"]);
  });

  it("compaction and reflection carry none, or the reflection pin's effort", async () => {
    const longPart = "The party pressed on through the flooded ruins, arguing over the map. ".repeat(90);
    const dueStory = () =>
      storyWith({
        scene: {
          parts: Array.from({ length: 8 }, () => ({
            content: longPart,
            imageUrl: "",
            user: false,
            role: "assistant",
          })),
        },
        memory: [
          "The player negotiated with the guard.",
          "The player negotiated with the merchant.",
          "The player negotiated with the bandit chief.",
          "The player negotiated their way past the sentry.",
        ].map((content) => ({ content, importance: 9 })),
      } as Partial<StoryData>);

    let calls = await runTurn({ story: dueStory(), extra: { customMaxContext: 8000 } });
    expect(calls.filter(isCompaction).length).toBeGreaterThan(0);
    expect(calls.filter(isReflection).length).toBeGreaterThan(0);
    expect(effortsOf(calls.filter(isCompaction))).toEqual(["none"]);
    expect(effortsOf(calls.filter(isReflection))).toEqual(["none"]);

    stubBrowserStorage({
      reflectionModelOverride: JSON.stringify({ modelKey: "Mistral Medium 3.5", reasoningEffort: "low" }),
    });
    calls = await runTurn({ story: dueStory(), extra: { customMaxContext: 8000 } });
    expect(effortsOf(calls.filter(isReflection))).toEqual(["low"]);
    expect(effortsOf(calls.filter(isCompaction))).toEqual(["none"]);
  });
});

describe("the narration's calls carry Default's effort (decisions 53 and 118)", () => {
  it("the story continuation and the choices: none by default", async () => {
    const calls = await runTurn({ gmRound: "", extra: { skipChoices: false } });
    const story = calls.filter(isNarrationStream);
    const choices = calls.filter(isChoices);
    expect(story).toHaveLength(1);
    expect(choices).toHaveLength(1);
    expect(story[0].body.model).toBe(NARRATION_MODEL_KEY);
    expect(story[0].body.reasoningEffort).toBe("none");
    expect(choices[0].body.reasoningEffort).toBe("none");
  });

  it("the story continuation and the choices: Default's effort, for the shipped model", async () => {
    stubBrowserStorage(defaultSlotStorage("GLM 5.3", "high"));
    const calls = await runTurn({ gmRound: "", extra: { skipChoices: false } });
    expect(calls.filter(isNarrationStream).map((c) => c.body.reasoningEffort)).toEqual(["high"]);
    expect(calls.filter(isChoices).map((c) => c.body.reasoningEffort)).toEqual(["high"]);
    // The GM's own round is tier 1, which is Default too: the same effort.
    expect(calls.filter(isGmRound).map((c) => c.body.reasoningEffort)).toEqual(["high"]);
  });

  it("the saved narration voice and effort are stored but no longer used", async () => {
    stubBrowserStorage({ narrationModelOverride: "Claude Sonnet 5.5", narrationEffortOverride: "high" });
    const calls = await runTurn({ gmRound: "", extra: { skipChoices: false } });
    const story = calls.filter(isNarrationStream);
    expect(story.map((c) => c.body.model)).toEqual([NARRATION_MODEL_KEY]);
    expect(story.map((c) => c.body.reasoningEffort)).toEqual(["none"]);
    expect(calls.filter(isChoices).map((c) => c.body.reasoningEffort)).toEqual(["none"]);
  });

  it("the story continuation and the choices: Default's model and effort, for a model the player picked", async () => {
    stubBrowserStorage(defaultSlotStorage("Claude Sonnet 5.5", "normal"));
    const calls = await runTurn({ gmRound: "", extra: { skipChoices: false } });
    const story = calls.filter(isNarrationStream);
    expect(story.map((c) => c.body.model)).toEqual(["Claude Sonnet 5.5"]);
    expect(story.map((c) => c.body.reasoningEffort)).toEqual(["normal"]);
    expect(calls.filter(isChoices).map((c) => c.body.reasoningEffort)).toEqual(["normal"]);
  });

  it("falls back to none with the model, when Default's saved model is one the catalog dropped", async () => {
    stubBrowserStorage(defaultSlotStorage("Grok Code Fast 1", "high"));
    const calls = await runTurn({ gmRound: "", extra: { skipChoices: false } });
    const story = calls.filter(isNarrationStream);
    expect(story.map((c) => c.body.model)).toEqual([NARRATION_MODEL_KEY]);
    expect(story.map((c) => c.body.reasoningEffort)).toEqual(["none"]);
    expect(calls.filter(isChoices).map((c) => c.body.reasoningEffort)).toEqual(["none"]);
  });

  describe("the Observer's rewrite and the choices re-run after it", () => {
    // The rewrite only runs for a player who allowed it (decision 187).
    const REWRITING_OBSERVER = { observerSettings: LEGACY_OBSERVER_SETTINGS, skipChoices: false };
    const respond = (call: Call) => {
      if (isRewrite(call)) return REWRITTEN;
      if (isLengthJudge(call)) return judgeVerdict(false);
      return judgeVerdict(true);
    };

    it("take Default's model and effort when the Observer is unpinned", async () => {
      stubBrowserStorage(defaultSlotStorage("GLM 5.3", "high"));
      const calls = await runTurn({ gmRound: LONG_NARRATION, respond, extra: REWRITING_OBSERVER });

      const rewrites = calls.filter(isRewrite);
      expect(rewrites).toHaveLength(1);
      expect(rewrites[0].body.model).toBe(NARRATION_MODEL_KEY);
      expect(rewrites[0].body.reasoningEffort).toBe("high");

      // The judges stay on the side-agent default at none.
      const judges = calls.filter((c) => c.url === "/api/generate" && isLengthJudge(c));
      expect(judges.length).toBeGreaterThan(0);
      expect(effortsOf(judges)).toEqual(["none"]);
      expect(judges[0].body.model).toBe(SIDE_AGENT_DEFAULT_MODEL_KEY);

      // The turn's own choices and the ones re-derived after the rewrite are
      // both the narrator's call.
      const choices = calls.filter(isChoices);
      expect(choices).toHaveLength(2);
      expect(choices[1].body.model).toBe(NARRATION_MODEL_KEY);
      expect(choices[1].body.reasoningEffort).toBe("high");
    });

    it("take none when no narration effort was chosen", async () => {
      const calls = await runTurn({ gmRound: LONG_NARRATION, respond, extra: REWRITING_OBSERVER });
      expect(calls.filter(isRewrite).map((c) => c.body.reasoningEffort)).toEqual(["none"]);
      expect(calls.filter(isChoices).map((c) => c.body.reasoningEffort)).toEqual(["none", "none"]);
    });

    it("keep a pinned Observer's own model and effort for the rewrite, but not for the choices", async () => {
      stubBrowserStorage({
        ...defaultSlotStorage("GLM 5.3", "high"),
        observerModelOverride: JSON.stringify({ modelKey: "Mistral Medium 3.5", reasoningEffort: "low" }),
      });
      const calls = await runTurn({ gmRound: LONG_NARRATION, respond, extra: { ...REWRITING_OBSERVER, mistralKey: "mistral-key" } });

      const rewrites = calls.filter(isRewrite);
      expect(rewrites).toHaveLength(1);
      expect(rewrites[0].body.model).toBe("Mistral Medium 3.5");
      expect(rewrites[0].body.reasoningEffort).toBe("low");
      // The choices re-run is the narrator's, pin or no pin.
      expect(calls.filter(isChoices).map((c) => c.body.reasoningEffort)).toEqual(["high", "high"]);
    });
  });
});

describe("the tier classifier runs on the side-agent model (decisions 53 and 124)", () => {
  /** No state signal and a long input: the one case that spends a classifier call. */
  const LONG_INPUT = "I study the door, the hinges and the lock for a long while, ".repeat(5);

  it("the side-agent default and its effort", async () => {
    const calls = await runTurn({ userInput: LONG_INPUT, story: storyWith({ lore: [] } as Partial<StoryData>) });
    const classifier = calls.filter(isClassifier);
    expect(classifier).toHaveLength(1);
    expect(classifier[0].body.model).toBe(SIDE_AGENT_DEFAULT_MODEL_KEY);
    expect(classifier[0].body.reasoningEffort).toBe("none");
  });

  it("whatever the player gave tier 0 and Default", async () => {
    stubBrowserStorage({
      reasoningTierOverrides: JSON.stringify([
        { modelKey: "Claude Sonnet 5.5", reasoningEffort: "high" },
        { modelKey: "Claude Sonnet 5.5", reasoningEffort: "high" },
        { modelKey: "Claude Sonnet 5.5", reasoningEffort: "high" },
        null,
      ]),
    });
    const calls = await runTurn({ userInput: LONG_INPUT, story: storyWith({ lore: [] } as Partial<StoryData>) });
    const classifier = calls.filter(isClassifier);
    expect(classifier).toHaveLength(1);
    expect(classifier[0].body.model).toBe(SIDE_AGENT_DEFAULT_MODEL_KEY);
    expect(classifier[0].body.reasoningEffort).toBe("none");
  });

  it("falls to Default, at Default's effort, when the player has no key for the side-agent model", async () => {
    // No OpenRouter key, only Mistral's: the side-agent default (OpenRouter
    // Haiku) cannot run, and neither can Default (an OpenRouter model), so the
    // classifier takes Default as it always took tier 0's model.
    stubBrowserStorage(defaultSlotStorage("Grok 4.5", "low"));
    const calls = await runTurn({
      userInput: LONG_INPUT,
      story: storyWith({ lore: [] } as Partial<StoryData>),
      extra: { openRouterKey: undefined, mistralKey: "mistral-key" },
    });
    const classifier = calls.filter(isClassifier);
    expect(classifier).toHaveLength(1);
    expect(classifier[0].body.model).toBe("Grok 4.5");
    expect(classifier[0].body.reasoningEffort).toBe("low");
  });
});
