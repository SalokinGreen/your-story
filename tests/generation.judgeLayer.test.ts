/**
 * The judge layer, as it runs inside generateStoryTurn (judge-layer design,
 * decisions 187-188; Codex review 2026-10-24). Each test here fails without the
 * fix it names:
 *
 * - the defaults are flag only (decision 187): no speculative rewrite, no
 *   blocking judge, no rewrite, nothing re-rolled;
 * - an Observer reset on the reword path never re-runs the tools (finding 3);
 * - a failed or rejected prose rewrite keeps the turn instead of rerolling it
 *   (finding 8);
 * - a rewrite makes no choices call when Suggested Choices are off, and the
 *   background pass returns choices as data instead of firing UI callbacks
 *   (finding 7);
 * - a Stop reaches the caller through the judges (finding 8);
 * - the background wave reports what it changed as a delta, by part id
 *   (finding 1).
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { generateStoryTurn, GenerationOptions } from "@/app/misc/generation";
import { createMockGMFetch, sseStreamResponse } from "./helpers/mockGMFetch";
import {
  LEGACY_OBSERVER_SETTINGS,
  FLAG_ONLY_OBSERVER_SETTINGS,
} from "./helpers/observerSettings";
import { isJudgeCall, judgeReply, requestedJudges } from "./helpers/combinedJudges";
import type { ObserverSettings } from "@/app/misc/observer";
import type { ObserverFlag, StoryData } from "@/app/misc/structs";
import type { ResolvedTier } from "@/app/misc/reasoningTiers";

const SHORT = "The lock clicks open. The corridor beyond is dark.";
const LONG = Array(400).fill("word").join(" ");
const REWRITTEN = "You force the lock. It gives.";
const CHOICES = "- Step into the corridor\n- Listen at the door\n- Walk away";
const PART_ID = "part-under-test";

const ALL_CLEAR = JSON.stringify({
  justified: true,
  violation: false,
  severity: "minor",
  reason: "",
  mismatch: false,
  missed_oracle_or_table: false,
  missed_scene_increment: false,
  should_escalate: false,
});
const LENGTH_UNJUSTIFIED = JSON.stringify({ justified: false, reason: "padding" });
const TIER_NEEDED = JSON.stringify({ should_escalate: true, reason: "This needed more care." });

function story(overrides: Partial<StoryData> = {}): StoryData {
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
  openRouterKey: "openrouter-test-key",
  scenePartId: PART_ID,
};

interface Call {
  url: string;
  body: { messages: { role: string; content: string }[]; tools?: unknown[] };
}

const first = (c: Call) => c.body.messages[0]?.content ?? "";
const last = (c: Call) => c.body.messages[c.body.messages.length - 1]?.content ?? "";
const isRewrite = (c: Call) => last(c).includes("flagged by an automated reviewer");
const judgesOf = (c: Call): string[] => (isJudgeCall(c.body) ? requestedJudges(c.body) : []);
const isLengthJudge = (c: Call) => judgesOf(c).includes("length");
const isTierJudge = (c: Call) => judgesOf(c).includes("tier_gap");
const isChoices = (c: Call) =>
  c.url === "/api/generate-stream" && !c.body.tools && first(c).includes("choice designer");

/**
 * A fetch mock for one turn: scripted GM rounds, side calls answered by
 * `respond`, and any choices call answered with a fixed list.
 */
function installFetch(
  rounds: Parameters<typeof createMockGMFetch>[0],
  respond: (call: Call) => Promise<string> | string,
): { calls: Call[] } {
  const gm = createMockGMFetch(rounds);
  const calls: Call[] = [];
  global.fetch = vi.fn(async (url: unknown, init?: RequestInit) => {
    const call: Call = { url: String(url), body: JSON.parse(init!.body as string) };
    calls.push(call);
    if (call.url === "/api/generate") {
      const scripted = await respond(call);
      // The judges are one call that answers a keyed verdict per judge: the
      // scripted strings below stand for "this judge says major".
      const content = isJudgeCall(call.body)
        ? judgeReply(call.body, {
            ...(scripted === LENGTH_UNJUSTIFIED && { length: "major" as const }),
            ...(scripted === TIER_NEEDED && { tier_gap: "major" as const }),
          })
        : scripted;
      return { ok: true, json: async () => ({ content }) } as unknown as Response;
    }
    if (isChoices(call)) return sseStreamResponse({ content: CHOICES });
    return (gm.fetchMock as unknown as typeof fetch)(url as RequestInfo, init);
  }) as unknown as typeof fetch;
  vi.spyOn(console, "warn").mockImplementation(() => {});
  return { calls };
}

async function settle(): Promise<void> {
  for (let i = 0; i < 30; i++) await new Promise((r) => setTimeout(r, 0));
}

const originalFetch = global.fetch;
afterEach(() => {
  global.fetch = originalFetch;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("the flag-only table (decision 187, a choice since decision 220)", () => {
  it("makes no judge call and no rewrite for a long, plain turn", async () => {
    const { calls } = installFetch([{ content: LONG }], () => ALL_CLEAR);
    const result = await generateStoryTurn(
      story(),
      "I pick the lock",
      { ...baseOptions, observerSettings: FLAG_ONLY_OBSERVER_SETTINGS },
      {},
    );
    await settle();

    expect(result.content).toBe(LONG);
    // The side agents (memory, progress) may call; no Observer judge or rewrite does.
    expect(calls.filter(isLengthJudge)).toHaveLength(0);
    expect(calls.filter(isRewrite)).toHaveLength(0);
    expect(calls.some((c) => judgesOf(c).includes("agency"))).toBe(false);
  });

  it("starts no speculative rewrite when the length judge may only flag", async () => {
    const flagOnlyLength: ObserverSettings = {
      ...LEGACY_OBSERVER_SETTINGS,
      response_length: { enabled: true, triggersReset: false, sensitivity: 5 },
      player_agency: { enabled: false, triggersReset: false, sensitivity: 5 },
      outcome_narration_mismatch: { enabled: false, triggersReset: false, sensitivity: 5 },
      tier_escalation_missed: { enabled: false, triggersReset: false, sensitivity: 5 },
    };
    const { calls } = installFetch([{ content: LONG }], (call) =>
      isLengthJudge(call) ? LENGTH_UNJUSTIFIED : ALL_CLEAR,
    );
    const flagged: ObserverFlag[][] = [];
    const result = await generateStoryTurn(
      story(),
      "I pick the lock",
      { ...baseOptions, observerSettings: flagOnlyLength },
      { onBackgroundObserverFlags: (flags) => flagged.push(flags) },
    );
    await settle();

    expect(result.content).toBe(LONG);
    expect(calls.filter(isLengthJudge)).toHaveLength(1);
    // The overage is flagged, never rewritten, and no discarded rewrite is billed.
    expect(calls.filter(isRewrite)).toHaveLength(0);
    expect(flagged).toHaveLength(1);
    expect(flagged[0][0].type).toBe("response_length");
  });
});

describe("a prose problem never reaches the mechanics (finding 8)", () => {
  it("keeps the turn, with its flag, when the rewrite call fails - no rollback, no reroll", async () => {
    // Only one scripted GM round: a rollback and a rerun would run out of
    // rounds and throw.
    const { calls } = installFetch([{ content: LONG }], (call) => {
      if (isRewrite(call)) throw new Error("rewrite unavailable");
      if (isLengthJudge(call)) return LENGTH_UNJUSTIFIED;
      return ALL_CLEAR;
    });
    const resets: ObserverFlag[] = [];
    const result = await generateStoryTurn(
      story(),
      "I pick the lock",
      { ...baseOptions, observerSettings: LEGACY_OBSERVER_SETTINGS },
      { onObserverReset: (_f, flag) => resets.push(flag) },
    );
    await settle();

    expect(resets).toHaveLength(0);
    expect(result.content).toBe(LONG);
    expect(result.scenePart.observerFlags?.map((f) => f.type)).toContain("response_length");
    expect(calls.filter((c) => c.url === "/api/generate-stream" && !!c.body.tools)).toHaveLength(1);
  });

  it("keeps the turn when the rewrite comes back as a refusal", async () => {
    const { calls } = installFetch([{ content: LONG }], (call) => {
      if (isRewrite(call)) return "I'm sorry, but I can't rewrite that scene.";
      if (isLengthJudge(call)) return LENGTH_UNJUSTIFIED;
      return ALL_CLEAR;
    });
    const result = await generateStoryTurn(
      story(),
      "I pick the lock",
      { ...baseOptions, observerSettings: LEGACY_OBSERVER_SETTINGS },
      {},
    );
    await settle();

    expect(calls.filter(isRewrite).length).toBeGreaterThan(0);
    expect(result.content).toBe(LONG);
    expect(result.scenePart.correctedObserverFlags).toBeUndefined();
  });

  it("keeps the turn when the length judge itself is down - the dice are not re-rolled", async () => {
    installFetch([{ content: LONG }], (call) => {
      if (isLengthJudge(call)) throw new Error("judge unavailable");
      return ALL_CLEAR;
    });
    const resets: ObserverFlag[] = [];
    const result = await generateStoryTurn(
      story(),
      "I pick the lock",
      { ...baseOptions, observerSettings: LEGACY_OBSERVER_SETTINGS },
      { onObserverReset: (_f, flag) => resets.push(flag) },
    );
    await settle();

    expect(resets).toHaveLength(0);
    expect(result.content).toBe(LONG);
    // An unknown is no flag.
    expect(result.scenePart.observerFlags?.some((f) => f.type === "response_length")).toBeFalsy();
  });
});

describe("a Stop reaches the caller through the judges (finding 8)", () => {
  it("throws the turn's cancellation instead of committing past a cancelled judge", async () => {
    const controller = new AbortController();
    installFetch([{ content: LONG }], (call) => {
      if (isLengthJudge(call)) {
        controller.abort();
        throw Object.assign(new Error("aborted"), { name: "AbortError" });
      }
      return ALL_CLEAR;
    });

    await expect(
      generateStoryTurn(
        story(),
        "I pick the lock",
        {
          ...baseOptions,
          observerSettings: LEGACY_OBSERVER_SETTINGS,
          abortSignal: controller.signal,
        },
        {},
      ),
    ).rejects.toThrow(/cancelled/i);
  });
});

describe("a rewrite respects Suggested Choices (finding 7)", () => {
  const rewriting = (skipChoices: boolean): GenerationOptions => ({
    ...baseOptions,
    skipChoices,
    observerSettings: LEGACY_OBSERVER_SETTINGS,
  });
  const respond = (call: Call) => {
    if (isRewrite(call)) return REWRITTEN;
    if (isLengthJudge(call)) return LENGTH_UNJUSTIFIED;
    return ALL_CLEAR;
  };

  it("makes no choices call after a rewrite when they are off", async () => {
    const { calls } = installFetch([{ content: LONG }], respond);
    const result = await generateStoryTurn(story(), "I pick the lock", rewriting(true), {});
    await settle();

    expect(result.content).toBe(REWRITTEN);
    expect(calls.filter(isChoices)).toHaveLength(0);
  });

  it("re-derives them after a rewrite when they are on", async () => {
    const { calls } = installFetch([{ content: LONG }], respond);
    const result = await generateStoryTurn(story(), "I pick the lock", rewriting(false), {});
    await settle();

    expect(result.content).toBe(REWRITTEN);
    // The turn's own choices, then the ones re-derived from the new text.
    expect(calls.filter(isChoices)).toHaveLength(2);
  });

  it("shows only the re-derived choices, never the first draft's (decision 221)", async () => {
    const { calls } = installFetch([{ content: LONG }], respond);
    const uiChoices: number[] = [];
    const result = await generateStoryTurn(story(), "I pick the lock", rewriting(false), {
      onChoicesComplete: (choices) => uiChoices.push(choices.length),
    });
    await settle();

    expect(result.content).toBe(REWRITTEN);
    // Generated twice (the draft's, then the rewrite's); the UI is told once.
    expect(calls.filter(isChoices)).toHaveLength(2);
    expect(uiChoices).toEqual([3]);
  });
});

describe("the reword path never re-runs the tools (finding 3)", () => {
  const FIRST_NARRATION = "The lock clicks open. The corridor beyond is dark.";
  const RETRY_NARRATION = "You work the pick with care, and the tumblers give.";

  function challengeStory(): StoryData {
    return story({
      activeChallenge: {
        id: "c1",
        name: "The lock",
        rounds: 3,
        currentSuccesses: 0,
        currentFailures: 0,
        active: true,
        createdAt: 0,
      },
    } as unknown as Partial<StoryData>);
  }

  async function runFlagged(options: Partial<GenerationOptions>, withDice = false) {
    const rollRound = {
      toolCalls: [
        { name: "formula_roll", arguments: { formulas: ["1d20"], reason: "Pick the lock" } },
      ],
    };
    let issued = false;
    // A scene with a challenge asks for a roll (the roll gate): a turn with no
    // dice answers that prompt with prose twice, once per attempt.
    const rounds = withDice
      ? [rollRound, { content: FIRST_NARRATION }, rollRound, { content: RETRY_NARRATION }]
      : [
          { content: FIRST_NARRATION },
          { content: FIRST_NARRATION },
          { content: RETRY_NARRATION },
          { content: RETRY_NARRATION },
        ];
    installFetch(
      rounds,
      (call) => {
        const tier = isTierJudge(call);
        if (tier && !issued) {
          issued = true;
          return TIER_NEEDED;
        }
        return ALL_CLEAR;
      },
    );
    const tiers: number[] = [];
    const resets: unknown[] = [];
    const result = await generateStoryTurn(
      challengeStory(),
      "I pick the lock",
      { ...baseOptions, observerSettings: LEGACY_OBSERVER_SETTINGS, ...options },
      {
        onReasoningTierResolved: (r: ResolvedTier) => tiers.push(r.tier),
        onObserverReset: () => resets.push(1),
      },
    );
    return { result, resets: resets.length };
  }

  it("rolls back and reruns the tools by default, for the heavier-tier retry, when no dice were thrown", async () => {
    const run = await runFlagged({});
    expect(run.resets).toBe(1);
    expect(run.result.content).toBe(RETRY_NARRATION);
  });

  it("keeps the turn when the retry would throw the dice again (judge layer v2)", async () => {
    const run = await runFlagged({}, true);
    expect(run.resets).toBe(0);
    expect(run.result.content).toBe(FIRST_NARRATION);
  });

  it("keeps the turn when allowMechanicalRetry is false: its mechanics are already applied", async () => {
    const run = await runFlagged({ allowMechanicalRetry: false });
    expect(run.resets).toBe(0);
    expect(run.result.content).toBe(FIRST_NARRATION);
  });
});

describe("the background wave reports a delta by part id (finding 1)", () => {
  it("hands the page what the layers changed, naming the turn's part", async () => {
    installFetch([{ content: SHORT }], () => ALL_CLEAR);
    const deltas: Array<{ partId?: string; turnsSinceStoryProgressCheck?: number }> = [];
    const storyData = story();
    await generateStoryTurn(storyData, "I pick the lock", baseOptions, {
      onBackgroundLayersUpdate: (delta) => deltas.push(delta),
    });
    await settle();

    // The Story Progress Observer advanced its turn counter this turn.
    expect(deltas).toHaveLength(1);
    expect(deltas[0].partId).toBe(PART_ID);
    expect(deltas[0].turnsSinceStoryProgressCheck).toBe(1);
  });
});
