/**
 * Integration coverage for the observer's deferral gate and the background
 * rewrite it enables, as they actually run inside generateStoryTurn
 * (app/misc/generation.ts, search "resetPossible"). Since decision 221 the
 * background wave only flags: it never rewrites.
 *
 * The mechanism: the observer used to block every single turn behind a full
 * round of judge calls, because the only gate was a config question
 * (canObserverTriggerReset) that is true by default. It is now also gated on
 * observer.ts's plausibleResetFlagTypes - a free, deterministic read of the
 * finished turn that answers "could any reset-eligible check actually fire
 * HERE". When the answer is no, generateStoryTurn hands control back to the
 * player immediately and runs the whole observer in its fire-and-forget
 * background wave, which can still rewrite the narration in place (it just
 * can't roll the turn back and re-roll the dice underneath a player who has
 * already read it).
 *
 * Every scenario scripts a single prose-only GM round, so the GM's own output
 * becomes the story content directly (gmFinalStoryContent in generation.ts).
 * The story fixture carries a character_sheet note on purpose: without one the
 * observer suspends itself entirely (observerSuspensionReason - "still in
 * setup") and none of this would run at all.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { generateStoryTurn, GenerationOptions } from "@/app/misc/generation";
import { createMockGMFetch } from "./helpers/mockGMFetch";
import { LEGACY_OBSERVER_SETTINGS } from "./helpers/observerSettings";
import type { ObserverSettings } from "@/app/misc/observer";
import {
  applyBackgroundFlags,
} from "@/app/misc/backgroundPatch";
import type { ObserverFlag, StoryData } from "@/app/misc/structs";

const PART_ID = "part-under-test";

/** Comfortably inside the "medium" band's ceiling, so the word count never trips. */
const SHORT_NARRATION = "The lock clicks open. The corridor beyond is dark.";
/** Past the "medium" band's 85-word high times the default 2x overage multiplier. */
const LONG_NARRATION = Array(400).fill("word").join(" ");
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
    // No combat, no active challenge, and no high/deadly-stakes roll declared
    // this scene - so isSceneGatedForRoll is false and tier_escalation_missed
    // stays deferred. That's the ordinary-turn shape these tests are about.
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
  // The id the page gives the turn's part: a late result is applied by id.
  scenePartId: PART_ID,
};

// Decision 237: agency is plausible on every turn with a player line while it
// can rewrite, so it would make every turn here block. The deferral tests opt
// it down to a flag, which leaves it to the background wave.
const AGENCY_FLAGS_ONLY: ObserverSettings = {
  ...LEGACY_OBSERVER_SETTINGS,
  player_agency: { enabled: true, triggersReset: false, sensitivity: 5 },
};

interface ObserverCall {
  body: { messages: { role: string; content: string }[] };
}

function isRewrite(call: ObserverCall): boolean {
  const last = call.body.messages[call.body.messages.length - 1];
  return last?.content?.includes("flagged by an automated reviewer") ?? false;
}

function isAgencyJudge(call: ObserverCall): boolean {
  return call.body.messages[0]?.content?.includes("took a decision away from the player") ?? false;
}

/**
 * Same wrapper the speculative-rewrite suite uses: the observer's
 * non-streaming /api/generate calls go to `respond`, everything else to a
 * single-prose-round GM-stage mock. Split on the exact URL rather than
 * createMockGMFetch's `otherResponses` because "/api/generate" is a substring
 * of "/api/generate-stream".
 */
function createFetchMock(
  narration: string,
  respond: (call: ObserverCall) => Promise<unknown>,
) {
  const gm = createMockGMFetch([{ content: narration }]);
  const observerCalls: ObserverCall[] = [];

  const fetchMock = vi.fn(async (url: unknown, init?: RequestInit) => {
    if (String(url) === "/api/generate") {
      const call: ObserverCall = { body: JSON.parse(init!.body as string) };
      observerCalls.push(call);
      const content = await respond(call);
      return { ok: true, json: async () => ({ content }) } as unknown as Response;
    }
    const gmFetch = gm.fetchMock as unknown as (
      url: unknown,
      init?: RequestInit,
    ) => Promise<Response>;
    return gmFetch(url, init);
  });

  return { fetchMock, observerCalls };
}

/** Every LLM-judged check passing. */
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

/** The agency judge finding a major violation; every other judge passing. */
const AGENCY_VIOLATION = JSON.stringify({
  violation: true,
  severity: "major",
  reason: "Spoke for the player.",
});

/** Lets the fire-and-forget background wave settle before asserting on it. */
async function flushBackground(): Promise<void> {
  for (let i = 0; i < 20; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

/**
 * Stands in for page.tsx, which publishes the assistant part into
 * scene.parts as narration streams. generateStoryTurnOnce never does this
 * itself, and a late result is applied to the part by id - so without it
 * these tests would exercise the headless shape (nothing to patch) rather
 * than the one the app actually runs.
 */
function scenePartPublisher(storyData: StoryData) {
  return (_chunk: string, fullContent: string) => {
    const last = storyData.scene.parts[storyData.scene.parts.length - 1];
    if (last && !last.user && last.role === "assistant") {
      last.content = fullContent;
      return;
    }
    storyData.scene.parts.push({
      content: fullContent,
      imageUrl: "",
      user: false,
      role: "assistant",
      choices: [],
      id: PART_ID,
    });
  };
}

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("observer deferral - generateStoryTurn integration", () => {
  it("returns the turn without waiting for the judges to answer when no check could fire", async () => {
    // Short narration, no comparisons resolved, nothing at stake: the free
    // signals say nothing is reset-eligible. Every judge is held open here, so
    // the turn can only come back if generateStoryTurn never awaited them.
    let releaseJudges: () => void = () => {};
    const judgesHeld = new Promise<void>((resolve) => {
      releaseJudges = resolve;
    });

    const { fetchMock, observerCalls } = createFetchMock(
      SHORT_NARRATION,
      async () => {
        await judgesHeld;
        return ALL_CLEAR;
      },
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await generateStoryTurn(
      createTestStory(),
      "I pick the lock",
      { ...baseOptions, observerSettings: AGENCY_FLAGS_ONLY },
      {},
    );

    // The point of the whole change: the turn is back while every judge call
    // is still in flight. The checks still run - just on the caller's own time.
    expect(result.content).toBe(SHORT_NARRATION);
    expect(observerCalls.length).toBeGreaterThan(0);

    releaseJudges();
    await flushBackground();
  });

  it("still blocks when a free signal says a check really could fire", async () => {
    // Same story, same settings - the only difference is that this turn blew
    // past the reply-length ceiling, which is exactly the case the player
    // should keep waiting for. The length judge answering at all proves the
    // blocking path ran: the background pass never gets to it here, because
    // the turn is asserted the moment generateStoryTurn returns.
    const { fetchMock, observerCalls } = createFetchMock(
      LONG_NARRATION,
      async () => ALL_CLEAR,
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await generateStoryTurn(
      createTestStory(),
      "I pick the lock",
      baseOptions,
      {},
    );

    expect(result.content).toBe(LONG_NARRATION);
    expect(
      observerCalls.filter((call) =>
        call.body.messages[0]?.content?.includes("usual ceiling of ~"),
      ).length,
    ).toBe(1);
  });
});

// Decision 185: the page sends a typed action as "" (it is already the last
// part of the story); the Observer must still judge against it, not against
// "(none - opening scene)".
describe("the player's line reaches the Observer on a typed turn", () => {
  it("reads it from the story when the page passes an empty choice", async () => {
    const { fetchMock, observerCalls } = createFetchMock(SHORT_NARRATION, async () => ALL_CLEAR);
    global.fetch = fetchMock as unknown as typeof fetch;
    const storyData = createTestStory();
    storyData.scene.parts = [
      ...(storyData.scene.parts ?? []),
      { content: ">Like, go on.", user: true } as unknown as StoryData["scene"]["parts"][number],
    ];
    await generateStoryTurn(storyData, "", baseOptions, {
      onStoryContent: scenePartPublisher(storyData),
    });
    await flushBackground();
    const agency = observerCalls.filter(isAgencyJudge);
    expect(agency.length).toBeGreaterThan(0);
    const user = String(agency[0].body.messages[1]?.content ?? "");
    expect(user).toContain("Like, go on.");
    expect(user).not.toContain("none - opening scene");
  });
});

describe("the background observer never rewrites (decision 221) - generateStoryTurn integration", () => {
  it("flags a violation found in the background, makes no rewrite call and leaves the text alone", async () => {
    // With agency set to flag only (it does not wait, decision 237) it is
    // judged in the background. The player already has the turn by then, and
    // text they have read is not replaced behind them: the finding is an
    // advisory flag.
    const { fetchMock, observerCalls } = createFetchMock(
      SHORT_NARRATION,
      async (call) => {
        if (isRewrite(call)) return REWRITTEN;
        if (isAgencyJudge(call)) return AGENCY_VIOLATION;
        return ALL_CLEAR;
      },
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    const storyData = createTestStory();
    const advisory: Array<{ flags: ObserverFlag[]; partId: string }> = [];
    let completedContent: string | undefined;

    await generateStoryTurn(
      storyData,
      "I pick the lock",
      { ...baseOptions, observerSettings: AGENCY_FLAGS_ONLY },
      {
        onStoryContent: scenePartPublisher(storyData),
        onComplete: (result) => {
          completedContent = result.content;
        },
        onBackgroundObserverFlags: (flags, partId) =>
          advisory.push({ flags, partId }),
      },
    );

    expect(completedContent).toBe(SHORT_NARRATION);
    await flushBackground();

    expect(observerCalls.filter(isRewrite)).toHaveLength(0);
    expect(advisory).toHaveLength(1);
    expect(advisory[0].flags[0].type).toBe("player_agency");
    expect(advisory[0].partId).toBe(PART_ID);

    const patched = applyBackgroundFlags(
      storyData,
      advisory[0].partId,
      advisory[0].flags,
    );
    const part = patched.scene.parts[patched.scene.parts.length - 1];
    expect(part.content).toBe(SHORT_NARRATION);
    expect(part.observerFlags?.[0]?.type).toBe("player_agency");
    expect(part.observerRewriteOriginal).toBeUndefined();
  });

  it("surfaces a background tier_escalation_missed as advisory instead of rewriting it", async () => {
    // The turn ran below the top tier, so checkTierEscalation runs - but with
    // nothing at stake it's deferred rather than blocking, and the background
    // pass has no full-turn reset available. Rewriting the prose at the same
    // (insufficient) tier would add no brainpower, so the flag stands.
    const { fetchMock, observerCalls } = createFetchMock(
      SHORT_NARRATION,
      async (call) => {
        if (isRewrite(call)) return REWRITTEN;
        if (call.body.messages[0]?.content?.includes("reasoning tier")) {
          return JSON.stringify({
            should_escalate: true,
            reason: "This turn needed more careful adjudication.",
          });
        }
        return ALL_CLEAR;
      },
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    const storyData = createTestStory();
    const advisory: Array<{ flags: ObserverFlag[]; partId: string }> = [];

    await generateStoryTurn(
      storyData,
      "I pick the lock",
      { ...baseOptions, observerSettings: AGENCY_FLAGS_ONLY },
      {
        onStoryContent: scenePartPublisher(storyData),
        onBackgroundObserverFlags: (flags, partId) =>
          advisory.push({ flags, partId }),
      },
    );

    await flushBackground();

    expect(observerCalls.filter(isRewrite)).toHaveLength(0);
    expect(advisory).toHaveLength(1);
    expect(advisory[0].flags[0].type).toBe("tier_escalation_missed");

    const patched = applyBackgroundFlags(
      storyData,
      advisory[0].partId,
      advisory[0].flags,
    );
    const part = patched.scene.parts[patched.scene.parts.length - 1];
    expect(part.content).toBe(SHORT_NARRATION);
    expect(part.observerFlags?.[0]?.type).toBe("tier_escalation_missed");
  });

  it("still blocks and resets for tier_escalation_missed when the scene has real stakes", async () => {
    // Active combat is a deterministic stakes marker, so this turn is judged
    // before the player gets it back and the full-turn retry at a higher tier
    // is still on the table - the case the check was built for.
    const RETRY_NARRATION = "You parry, and the blade skates off your bracer.";
    // Two rounds per attempt: a roll (combat is a gated scene, so the M2
    // roll-invariant gate would force another round without one) and then the
    // prose that ends the turn. Two attempts, because the first gets reset.
    const rollRound = {
      toolCalls: [{ name: "formula_roll", arguments: { formulas: ["1d20"] } }],
    };
    const gm = createMockGMFetch([
      rollRound,
      { content: SHORT_NARRATION },
      rollRound,
      { content: RETRY_NARRATION },
    ]);
    const observerCalls: ObserverCall[] = [];
    let escalationIssued = false;
    const fetchMock = vi.fn(async (url: unknown, init?: RequestInit) => {
      if (String(url) === "/api/generate") {
        const call: ObserverCall = { body: JSON.parse(init!.body as string) };
        observerCalls.push(call);
        // Only the FIRST attempt is flagged - the retry has to be allowed to
        // finish, or the turn would loop until the reset budget ran out.
        const isTierJudge =
          call.body.messages[0]?.content?.includes("reasoning tier") ?? false;
        const escalate = isTierJudge && !escalationIssued;
        if (escalate) escalationIssued = true;
        return {
          ok: true,
          json: async () => ({
            content: escalate
              ? JSON.stringify({
                  should_escalate: true,
                  reason: "A boss fight deserves careful adjudication.",
                })
              : ALL_CLEAR,
          }),
        } as unknown as Response;
      }
      const gmFetch = gm.fetchMock as unknown as (
        url: unknown,
        init?: RequestInit,
      ) => Promise<Response>;
      return gmFetch(url, init);
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const storyData = createTestStory({
      combatState: {
        active: true,
        name: "Ogre at the ford",
        combatants: [
          {
            id: "pc",
            name: "Test Player",
            type: "player",
            isActive: true,
            initiative: 14,
            stats: {},
            conditions: [],
          },
          // Two enemies, so hardRuleFloor treats this as regular combat
          // (tier 2) rather than a boss fight (TOP_TIER) - the turn has to run
          // BELOW the top tier for there to be anywhere to escalate to.
          {
            id: "e1",
            name: "Ogre",
            type: "enemy",
            isActive: true,
            initiative: 9,
            stats: {},
            conditions: [],
          },
          {
            id: "e2",
            name: "Ogre's hound",
            type: "enemy",
            isActive: true,
            initiative: 7,
            stats: {},
            conditions: [],
          },
        ],
        turnOrder: ["pc", "e1", "e2"],
        currentTurnIndex: 0,
        round: 1,
      },
    } as unknown as Partial<StoryData>);

    const resets: ObserverFlag[] = [];
    const result = await generateStoryTurn(
      storyData,
      "I attack the ogre",
      baseOptions,
      { onObserverReset: (_flags, triggeringFlag) => resets.push(triggeringFlag) },
    );

    expect(resets).toHaveLength(1);
    expect(resets[0].type).toBe("tier_escalation_missed");
    expect(result.content).toBe(RETRY_NARRATION);
  });
});
