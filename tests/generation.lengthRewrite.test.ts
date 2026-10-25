/**
 * The length rewrite as it runs inside generateStoryTurn after the combined
 * judge call (app/misc/generation.ts; judge layer v2, plan slice 2 and
 * "Revised after Codex's review", finding 12). It replaced the speculative
 * shortened rewrite, which started a rewrite before the length judge had
 * answered and threw it away when the judge disagreed. There is one path now:
 * the judges answer, the highest-priority major flag is chosen
 * (judges/combined.ts FLAG_PRIORITY), and only then is a rewrite asked for.
 *
 * Every scenario here scripts a single prose-only GM round, so the GM's own
 * output becomes the story content directly (gmFinalStoryContent in
 * generation.ts) and the only other fetches are the judges' /api/generate call
 * plus the rewrite. The story fixture carries a character_sheet note on
 * purpose: without one the observer suspends itself entirely
 * (observerSuspensionReason - "still in setup"), and nothing here would run.
 *
 * The choices regeneration that follows a successful rewrite is deliberately
 * NOT scripted - it's a separate concern, and generateStoryTurn already
 * swallows its failure ("keeping original choices") by design.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { generateStoryTurn, GenerationOptions } from "@/app/misc/generation";
import {
  createMockGMFetch,
  sseStreamResponse,
  type ScriptedGMRound,
} from "./helpers/mockGMFetch";
import { LEGACY_OBSERVER_SETTINGS } from "./helpers/observerSettings";
import {
  isJudgeCall,
  judgeReply,
  rewriteReply,
  requestedJudges,
  type JudgeSpec,
} from "./helpers/combinedJudges";
import type { JudgeId } from "@/app/misc/judges/types";
import type { StoryData } from "@/app/misc/structs";

/** Well past the "medium" band's 85-word high, times the default 2x overage multiplier. */
const LONG_NARRATION = Array(400).fill("word").join(" ");
const SHORT_NARRATION = "The lock clicks open. The corridor beyond is dark.";
const REWRITTEN = "You force the lock. It gives.";

function createTestStory(overrides: Partial<StoryData> = {}): StoryData {
  return {
    story_name: "Test Story",
    premise: "Test premise",
    player_name: "Test Player",
    player_summary: "Test summary",
    intro: "Test intro",
    points: 0,
    earnedPointsFromQuests: [],
    earnedPointsFromChapters: [],
    currentChapter: 0,
    max_chapters: 10,
    scene: { parts: [] },
    chapters: [],
    quests: [],
    stats: [],
    resources: [],
    inventory: [],
    achievements: [],
    // A character sheet means setup is over, so the observer judges this turn
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
    momentum: 0,
    maxMomentum: 10,
    relationships: [],
    rpgSystem: "3d6",
    abilities: [],
    level: 1,
    upgradesSpent: 0,
    conditions: [],
    npcs: [],
    sessionZeroActive: false,
    ...overrides,
  } as unknown as StoryData;
}

const baseOptions: GenerationOptions = {
  storyModel: "test-model",
  toolsModel: "test-model",
  choicesModel: "test-model",
  enableTools: true,
  skipChoices: true,
  replyLength: "medium",
  observerSettings: LEGACY_OBSERVER_SETTINGS,
  // A rewrite needs a second judge from another family (GLM 5.3, through OpenRouter).
  openRouterKey: "test-key",
};

interface ObserverCall {
  body: { messages: { role: string; content: string }[] };
  signal?: AbortSignal;
}

const judgesOf = (call: ObserverCall): JudgeId[] =>
  isJudgeCall(call.body) ? requestedJudges(call.body) : [];
const isLengthJudge = (call: ObserverCall) => judgesOf(call).includes("length");

function isRewrite(call: ObserverCall): boolean {
  const last = call.body.messages[call.body.messages.length - 1];
  return last?.content?.includes("flagged by an automated reviewer") ?? false;
}

/** What the side agents that are not judges are answered with: JSON that says nothing. */
const OTHER_SIDE_CALL = JSON.stringify({});

/**
 * Routes the observer's non-streaming /api/generate calls to `respond`, and
 * everything else to a single-prose-round GM-stage mock. Written as a wrapper
 * rather than createMockGMFetch's own `otherResponses` because "/api/generate"
 * is a substring of "/api/generate-stream" - matching on it there would
 * swallow the GM-stage calls too.
 */
function createFetchMock(
  narration: string | ScriptedGMRound[],
  respond: (call: ObserverCall) => Promise<unknown>,
) {
  const gm = createMockGMFetch(
    typeof narration === "string" ? [{ content: narration }] : narration,
  );
  const observerCalls: ObserverCall[] = [];

  const fetchMock = vi.fn(async (url: unknown, init?: RequestInit) => {
    if (String(url) === "/api/generate") {
      const call: ObserverCall = {
        body: JSON.parse(init!.body as string),
        signal: init?.signal ?? undefined,
      };
      observerCalls.push(call);
      const content = await respond(call);
      return {
        ok: true,
        json: async () => ({ content }),
      } as unknown as Response;
    }
    // createMockGMFetch types fetchMock as a bare vi.fn(), which erases its
    // signature - it really is a (url, init) => Promise<Response>.
    const gmFetch = gm.fetchMock as unknown as (
      url: unknown,
      init?: RequestInit,
    ) => Promise<Response>;
    return gmFetch(url, init);
  });

  return { fetchMock, observerCalls };
}

/** The judges' answer: every judge none, except those named. */
function judges(call: ObserverCall, spec: Partial<Record<JudgeId, JudgeSpec | "major" | "minor">>) {
  return judgeReply(call.body, spec);
}

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("the length rewrite - generateStoryTurn integration", () => {
  it("asks for the rewrite only after the judges have answered, and keeps it", async () => {
    let judgeAnswered = false;
    let rewriteAskedBeforeJudges: boolean | null = null;

    const { fetchMock, observerCalls } = createFetchMock(
      LONG_NARRATION,
      async (call) => {
        if (isRewrite(call)) {
          rewriteAskedBeforeJudges = !judgeAnswered;
          return rewriteReply(call.body, REWRITTEN);
        }
        if (isLengthJudge(call)) {
          // Slow, so a rewrite started alongside it would show.
          await new Promise((resolve) => setTimeout(resolve, 30));
          judgeAnswered = true;
          return judges(call, { length: "major" });
        }
        return OTHER_SIDE_CALL;
      },
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    const onObserverRewrite = vi.fn();
    const result = await generateStoryTurn(
      createTestStory(),
      "I pick the lock",
      baseOptions,
      { onObserverRewrite },
    );

    expect(rewriteAskedBeforeJudges).toBe(false);
    expect(result.content).toBe(REWRITTEN);
    expect(onObserverRewrite).toHaveBeenCalledTimes(1);
    expect(observerCalls.filter(isRewrite)).toHaveLength(1);
    expect(result.scenePart.correctedObserverFlags?.[0]?.type).toBe("response_length");
    // The player can still put the original back.
    expect(result.scenePart.observerRewriteOriginal?.content).toBe(LONG_NARRATION);
  });

  it("makes no rewrite call at all when the judge says the length is earned", async () => {
    const { fetchMock, observerCalls } = createFetchMock(
      LONG_NARRATION,
      async (call) => {
        if (isRewrite(call)) return rewriteReply(call.body, REWRITTEN);
        if (isLengthJudge(call)) return judges(call, {});
        return OTHER_SIDE_CALL;
      },
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    const onObserverRewrite = vi.fn();
    const result = await generateStoryTurn(
      createTestStory(),
      "I pick the lock",
      baseOptions,
      { onObserverRewrite },
    );

    // No speculation: nothing is billed for a rewrite nobody asked for.
    expect(observerCalls.filter(isRewrite)).toHaveLength(0);
    expect(result.content).toBe(LONG_NARRATION);
    expect(onObserverRewrite).not.toHaveBeenCalled();
    expect(result.scenePart.observerRewriteOriginal).toBeUndefined();
  });

  it("never asks the length judge about a turn inside the length ceiling", async () => {
    const { fetchMock, observerCalls } = createFetchMock(
      SHORT_NARRATION,
      async (call) => (isJudgeCall(call.body) ? judges(call, {}) : OTHER_SIDE_CALL),
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await generateStoryTurn(
      createTestStory(),
      "I pick the lock",
      baseOptions,
      {},
    );

    expect(result.content).toBe(SHORT_NARRATION);
    expect(observerCalls.filter(isRewrite)).toHaveLength(0);
    // The free word count already settled it.
    expect(observerCalls.filter(isLengthJudge)).toHaveLength(0);
  });

  it("does not hand the rewrite the GM's reasoning behind the draft it's cutting", async () => {
    // The GM's reasoning (native tokens, or thinking written inline in
    // <thinking> tags) can name a secret, so a rewrite is built from the
    // allowlisted narration context and never sees either channel (campaign
    // design 14.1). Only a separate narrator's own reasoning is passed on, and
    // that is tested below.
    const { fetchMock, observerCalls } = createFetchMock(
      [
        {
          reasoning: "NATIVE_COT: Bram's flinch is the betrayal setup - keep it.",
          content: `<thinking>TAGGED_COT: hold the storm back until scene four.</thinking>${LONG_NARRATION}`,
        },
      ],
      async (call) => {
        if (isRewrite(call)) return rewriteReply(call.body, REWRITTEN);
        if (isLengthJudge(call)) return judges(call, { length: "major" });
        return OTHER_SIDE_CALL;
      },
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await generateStoryTurn(
      createTestStory(),
      "I pick the lock",
      baseOptions,
      {},
    );

    expect(result.content).toBe(REWRITTEN);

    const rewritePrompt = observerCalls
      .filter(isRewrite)[0]
      .body.messages.map((m) => m.content)
      .join("\n");
    expect(rewritePrompt).not.toContain("Your reasoning while writing it");
    expect(rewritePrompt).not.toContain("NATIVE_COT");
    expect(rewritePrompt).not.toContain("TAGGED_COT");
  });

  it("acts on the higher-priority major flag: agency before length, one rewrite", async () => {
    // Both judges say major, and a second family confirms each. The design's
    // order puts the player's agency ahead of length; the one rewrite the turn
    // gets is for both, agency first.
    const { fetchMock, observerCalls } = createFetchMock(
      LONG_NARRATION,
      async (call) => {
        if (isRewrite(call)) return rewriteReply(call.body, "You hesitate at the lock.");
        if (isJudgeCall(call.body)) {
          return judges(call, {
            length: "major",
            agency: { severity: "major", fix: "Spoke for the player." },
          });
        }
        return OTHER_SIDE_CALL;
      },
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await generateStoryTurn(
      createTestStory(),
      "I pick the lock",
      baseOptions,
      {},
    );

    expect(observerCalls.filter(isRewrite)).toHaveLength(1);
    // Each major was confirmed by its own call to the other family's model.
    const confirmations = observerCalls.filter(
      (c) => isJudgeCall(c.body) && (c.body as { model?: string }).model === "GLM 5.3",
    );
    expect(confirmations.map((c) => requestedJudges(c.body)).sort()).toEqual([
      ["agency"],
      ["length"],
    ]);
    // The one rewrite is handed both confirmed findings, most serious first.
    const prompt = observerCalls
      .filter(isRewrite)[0]
      .body.messages.map((m) => m.content)
      .join("\n");
    expect(prompt).toContain("Problems found, most serious first");
    expect(prompt).toContain("Cut scenery, repeated beats");
    expect(prompt).toContain("Give the player character no new dialogue");
    expect(prompt.indexOf("Give the player character")).toBeLessThan(
      prompt.indexOf("Cut scenery, repeated beats"),
    );
    expect(result.content).toBe("You hesitate at the lock.");
    expect(result.scenePart.correctedObserverFlags?.map((f) => f.type)).toEqual([
      "player_agency",
      "response_length",
    ]);
  });
});

/**
 * The other path through Stage 1: the GM's terminal round makes tool calls and
 * writes no prose, so narration comes from a SEPARATE continuation call
 * (generation.ts, "Stage 1: Continuing GM conversation for story generation")
 * rather than from the GM's own output.
 *
 * That call used to leave no trace in gmPromptMessages, which was snapshotted
 * from gmConversationHistory before it ran - so the observer's rewrite
 * "continued" a conversation that stopped immediately before the narration, and
 * only ever saw the flagged prose as text quoted at it in the correction
 * message, with none of the reasoning that produced it.
 */
describe("the narration turn in the rewrite's conversation", () => {
  /**
   * Speaks for all three stages: the GM stage (via createMockGMFetch's script,
   * fingerprinted by a `tools` array), the story stage (the same endpoint with
   * no `tools`), and the observer's non-streaming /api/generate calls.
   *
   * The story stage is served exactly once. The post-rewrite choices
   * regeneration hits the same endpoint the same way, and letting it collect a
   * second copy of the narration would quietly make this mock lie about what
   * the story stage returned; generateStoryTurn swallows that failure by
   * design ("keeping original choices").
   */
  function createNarrationStageFetchMock(
    gmRounds: ScriptedGMRound[],
    story: ScriptedGMRound,
    respond: (call: ObserverCall) => Promise<unknown>,
  ) {
    const gm = createMockGMFetch(gmRounds);
    const observerCalls: ObserverCall[] = [];
    let storyServed = false;

    const fetchMock = vi.fn(async (url: unknown, init?: RequestInit) => {
      const urlStr = String(url);
      const body = init?.body ? JSON.parse(init.body as string) : {};

      if (urlStr === "/api/generate") {
        const call: ObserverCall = {
          body,
          signal: init?.signal ?? undefined,
        };
        observerCalls.push(call);
        return {
          ok: true,
          json: async () => ({ content: await respond(call) }),
        } as unknown as Response;
      }

      if (urlStr.includes("/api/generate-stream") && !body.tools) {
        if (storyServed) {
          throw new Error(
            "unscripted non-GM /api/generate-stream call (the choices stage, most likely)",
          );
        }
        storyServed = true;
        return sseStreamResponse(story);
      }

      const gmFetch = gm.fetchMock as unknown as (
        url: unknown,
        init?: RequestInit,
      ) => Promise<Response>;
      return gmFetch(url, init);
    });

    return { fetchMock, observerCalls };
  }

  const gmRounds: ScriptedGMRound[] = [
    {
      toolCalls: [
        {
          name: "formula_roll",
          arguments: { formula: "1d20+3", dc: 12, reason: "Pick the lock" },
        },
      ],
    },
    // Terminal round: tools done, no prose - which is what sends Stage 1 down
    // the separate-call path.
    {},
  ];

  const storyRound: ScriptedGMRound = {
    reasoning: "STORY_COT: the draft plants the cold draft for the reveal.",
    content: LONG_NARRATION,
  };

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("ends the rewrite's conversation with the narration it's being asked to rewrite", async () => {
    const { fetchMock, observerCalls } = createNarrationStageFetchMock(
      gmRounds,
      storyRound,
      async (call) => {
        if (isRewrite(call)) return rewriteReply(call.body, REWRITTEN);
        if (isLengthJudge(call)) return judges(call, { length: "major" });
        return OTHER_SIDE_CALL;
      },
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await generateStoryTurn(
      createTestStory(),
      "I pick the lock",
      baseOptions,
      {},
    );

    expect(result.content).toBe(REWRITTEN);

    const messages = observerCalls.filter(isRewrite)[0].body.messages as {
      role: string;
      content: string;
    }[];

    // Last message is the correction; the two before it are the story stage's
    // own round trip - the prompt that asked for narration, and the narration.
    const correction = messages[messages.length - 1];
    expect(correction.role).toBe("user");
    expect(correction.content).toContain("flagged by an automated reviewer");

    const narrationTurn = messages[messages.length - 2];
    expect(narrationTurn.role).toBe("assistant");
    expect(narrationTurn.content).toBe(LONG_NARRATION);
    expect(messages[messages.length - 3].role).toBe("user");

    // The GM's tool round trip is NOT in there: the rewrite continues the
    // allowlisted narration context, which holds public summaries only.
    expect(
      messages.some((m) => m.role === "tool" || Boolean((m as { tool_calls?: unknown[] }).tool_calls)),
    ).toBe(false);
  });

  it("carries the story stage's own reasoning into the rewrite prompt", async () => {
    // The narration turn above also carries `reasoning`, but sanitizeMessages
    // (providerCall.ts) only forwards that field to OpenRouter and Google - so
    // the prompt text is what actually guarantees delivery.
    const { fetchMock, observerCalls } = createNarrationStageFetchMock(
      gmRounds,
      storyRound,
      async (call) => {
        if (isRewrite(call)) return rewriteReply(call.body, REWRITTEN);
        if (isLengthJudge(call)) return judges(call, { length: "major" });
        return OTHER_SIDE_CALL;
      },
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    await generateStoryTurn(
      createTestStory(),
      "I pick the lock",
      baseOptions,
      {},
    );

    const rewriteCall = observerCalls.filter(isRewrite)[0];
    const prompt = rewriteCall.body.messages
      .map((m) => m.content)
      .join("\n");
    expect(prompt).toContain("Your reasoning while writing it");
    expect(prompt).toContain("STORY_COT");

    const narrationTurn = rewriteCall.body.messages[
      rewriteCall.body.messages.length - 2
    ] as { reasoning?: string };
    expect(narrationTurn.reasoning).toContain("STORY_COT");
  });
});
