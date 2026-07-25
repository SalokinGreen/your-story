/**
 * Integration test for the speculative shortened rewrite as it actually runs
 * inside generateStoryTurn (app/misc/generation.ts, search "SPECULATIVE
 * SHORTENED REWRITE"), as opposed to the pure-logic coverage of
 * prospectiveLengthFlag in tests/observer.test.ts.
 *
 * The mechanism: the response_length check's word-count trip is deterministic
 * and free, so the moment a turn comes in over the ceiling, generateStoryTurn
 * already knows exactly what a length rewrite would be asked to do - only
 * whether it'll be WANTED is still open, and that's what the justification
 * judge answers. So the shortened version is started immediately, concurrently
 * with the observer, and the verdict decides whether to keep it (judge
 * confirms the turn was too long) or throw it away and abort the call (judge
 * justifies the overage, or a different flag wins).
 *
 * Every scenario here scripts a single prose-only GM round, so the GM's own
 * output becomes the story content directly (gmFinalStoryContent in
 * generation.ts) and the only other fetches are the observer's /api/generate
 * judge calls plus the rewrite. The story fixture carries a character_sheet
 * note on purpose: without one the observer suspends itself entirely
 * (observerSuspensionReason - "still in setup"), and nothing here would run.
 *
 * The choices regeneration that follows a successful rewrite is deliberately
 * NOT scripted - it's a separate concern, and generateStoryTurn already
 * swallows its failure ("keeping original choices") by design.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { generateStoryTurn, GenerationOptions } from "@/app/misc/generation";
import { createMockGMFetch } from "./helpers/mockGMFetch";
import { DEFAULT_OBSERVER_SETTINGS } from "@/app/misc/observer";
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
  observerSettings: DEFAULT_OBSERVER_SETTINGS,
};

interface ObserverCall {
  body: { messages: { role: string; content: string }[] };
  signal?: AbortSignal;
}

function isLengthJudge(call: ObserverCall): boolean {
  return call.body.messages[0]?.content?.includes("usual ceiling of ~") ?? false;
}

function isRewrite(call: ObserverCall): boolean {
  const last = call.body.messages[call.body.messages.length - 1];
  return last?.content?.includes("flagged by an automated reviewer") ?? false;
}

/**
 * Routes the observer's non-streaming /api/generate calls to `respond`, and
 * everything else to a single-prose-round GM-stage mock. Written as a wrapper
 * rather than createMockGMFetch's own `otherResponses` because "/api/generate"
 * is a substring of "/api/generate-stream" - matching on it there would
 * swallow the GM-stage calls too.
 */
function createFetchMock(
  narration: string,
  respond: (call: ObserverCall) => Promise<unknown>,
) {
  const gm = createMockGMFetch([{ content: narration }]);
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

/** Every LLM-judged check passing; the length judge's verdict is set per-test. */
function passingJudgeContent(justified: boolean): string {
  return JSON.stringify({
    justified,
    violation: false,
    severity: "minor",
    reason: "",
    contradicts: false,
    missed_oracle_or_table: false,
    missed_scene_increment: false,
    should_escalate: false,
  });
}

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("speculative shortened rewrite - generateStoryTurn integration", () => {
  it("has the rewrite already in flight before the length judge answers, and keeps it once the judge confirms", async () => {
    // The whole point of the mechanism: the rewrite must already be in flight
    // at the moment the judge is asked. Recorded synchronously when the length
    // judge's call arrives rather than inferred from timing - under the old
    // sequential design (judge first, rewrite only once a flag came back) this
    // is false, and it can't be made true by anything racing.
    let rewriteInFlightWhenJudgeAsked: boolean | null = null;

    // The judge also holds its answer until the rewrite has responded, so the
    // two calls genuinely overlap rather than merely being issued in order.
    let markRewriteAnswered: () => void = () => {};
    const rewriteAnswered = new Promise<void>((resolve) => {
      markRewriteAnswered = resolve;
    });

    const { fetchMock, observerCalls } = createFetchMock(
      LONG_NARRATION,
      async (call) => {
        if (isRewrite(call)) {
          markRewriteAnswered();
          return REWRITTEN;
        }
        if (isLengthJudge(call)) {
          rewriteInFlightWhenJudgeAsked = observerCalls.some(isRewrite);
          // Guarded so a regression stalls the assertion below instead of
          // hanging the suite.
          await Promise.race([
            rewriteAnswered,
            new Promise((resolve) => setTimeout(resolve, 2000)),
          ]);
          return passingJudgeContent(false);
        }
        return passingJudgeContent(true);
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

    expect(rewriteInFlightWhenJudgeAsked).toBe(true);
    expect(result.content).toBe(REWRITTEN);
    expect(onObserverRewrite).toHaveBeenCalledTimes(1);

    // The turn only gets one rewrite, and the speculation starts before the
    // other reviewers have answered - so their complaints ride along as
    // conditional instructions instead of being lost.
    const speculativePrompt = observerCalls
      .filter(isRewrite)[0]
      .body.messages.map((m) => m.content)
      .join("\n");
    expect(speculativePrompt).toContain("beyond what the player actually declared");
    expect(speculativePrompt).toContain("Do not invent a problem to fix");

    // Exactly one rewrite call - the speculation was reused, not re-issued
    // alongside a second one once the flag came back.
    expect(observerCalls.filter(isRewrite)).toHaveLength(1);
    expect(result.scenePart.correctedObserverFlags?.[0]?.type).toBe(
      "response_length",
    );
    // The player can still put the original back.
    expect(result.scenePart.observerRewriteOriginal?.content).toBe(
      LONG_NARRATION,
    );
  });

  it("discards and aborts the speculation when the judge justifies the overage", async () => {
    const { fetchMock, observerCalls } = createFetchMock(
      LONG_NARRATION,
      async (call) => {
        if (isRewrite(call)) return REWRITTEN;
        if (isLengthJudge(call)) return passingJudgeContent(true);
        return passingJudgeContent(true);
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

    // The speculation still fired (the word counter tripped) - it just wasn't
    // used, and the long narration the judge blessed is what the player keeps.
    const rewriteCalls = observerCalls.filter(isRewrite);
    expect(rewriteCalls).toHaveLength(1);
    expect(result.content).toBe(LONG_NARRATION);
    expect(onObserverRewrite).not.toHaveBeenCalled();
    expect(result.scenePart.observerRewriteOriginal).toBeUndefined();

    // Cancelled rather than left running - an unwanted speculation shouldn't
    // keep burning tokens after the verdict is in.
    expect(rewriteCalls[0].signal?.aborted).toBe(true);
  });

  it("never speculates for a turn inside the length ceiling", async () => {
    const { fetchMock, observerCalls } = createFetchMock(
      SHORT_NARRATION,
      async () => passingJudgeContent(true),
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
    // The length judge isn't asked either - the free word count already
    // settled it (this is unchanged behavior, asserted here so a future
    // "speculate earlier" change can't quietly start paying for both).
    expect(observerCalls.filter(isLengthJudge)).toHaveLength(0);
  });

  it("does not reuse the speculation for a different major flag", async () => {
    // The length judge justifies the overage, but the agency judge flags the
    // turn: the corrective prompt is a different complaint entirely, so the
    // shortened version must be thrown away and a fresh rewrite issued
    // against the agency flag.
    const { fetchMock, observerCalls } = createFetchMock(
      LONG_NARRATION,
      async (call) => {
        if (isRewrite(call)) {
          return call.body.messages.some((m) =>
            m.content?.includes("Spoke for the player"),
          )
            ? "You hesitate at the lock."
            : REWRITTEN;
        }
        if (isLengthJudge(call)) return passingJudgeContent(true);
        if (call.body.messages[0]?.content?.includes("non-negotiable rule")) {
          return JSON.stringify({
            violation: true,
            severity: "major",
            reason: "Spoke for the player.",
          });
        }
        return passingJudgeContent(true);
      },
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await generateStoryTurn(
      createTestStory(),
      "I pick the lock",
      baseOptions,
      {},
    );

    const rewriteCalls = observerCalls.filter(isRewrite);
    expect(rewriteCalls).toHaveLength(2);
    // The speculative one was aborted; the agency rewrite is what landed.
    expect(rewriteCalls[0].signal?.aborted).toBe(true);
    expect(result.content).toBe("You hesitate at the lock.");
    expect(result.scenePart.correctedObserverFlags?.[0]?.type).toBe(
      "player_agency",
    );
  });
});
