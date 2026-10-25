/**
 * Layer 5 hardening, active variant: checkResponseLength's word-count trip
 * is deterministic (same PACING_BANDS pacingFeedback.ts already uses, just
 * applied to a single turn instead of a trailing average), but a trip is
 * now followed by an LLM justification pass before it becomes a flag - see
 * the "with a justification judge" describe block below. checkResponseLength
 * (when apiOptions is passed), checkPlayerAgencyViolation, and runObserver
 * hit /api/generate - mocked the same way reflection.test.ts mocks
 * callReflectionApi's fetch call.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  checkResponseLength,
  checkPlayerAgencyViolation,
  checkOutcomeMismatch,
  checkToolUsageGaps,
  checkTierEscalation,
  runObserver,
  prospectiveLengthFlag,
  observerSuspensionReason,
  hasCharacterSheetNote,
  buildObserverCharacterContext,
  formatCharacterContextBlock,
  formatMechanicsBlock,
  buildObserverWarningNote,
  buildObserverCorrectionNote,
  reconcileGmConversationAfterRewrite,
  reconcileGmThinkingAfterRewrite,
  rewriteFlaggedNarration,
  settingsFor,
  plausibleResetFlagTypes,
  splitObserverSettings,
  DEFAULT_OBSERVER_SETTINGS,
  FLAG_ONLY_FLAG_TYPES,
  canObserverTriggerReset,
  cloneDefaultObserverSettings,
  countJudgeCalls,
  extractOutcomeVerdicts,
  observerModeOf,
  observerModePatch,
  validateRewriteResponse,
  ObserverCheckSettings,
  ObserverSettings,
  OutcomeTier,
  OutcomeVerdict,
} from "../app/misc/observer";
import {
  LEGACY_OBSERVER_SETTINGS,
  FLAG_ONLY_OBSERVER_SETTINGS,
} from "./helpers/observerSettings";
import type {
  ObserverFlag,
  GMConversationMessage,
  StoryData,
} from "../app/misc/structs";
import { extractVisibleText } from "../app/misc/turnTimeline";
import { TOP_TIER } from "../app/misc/reasoningTiers";

function checkSettings(overrides: Partial<ObserverCheckSettings> = {}): ObserverCheckSettings {
  return { enabled: true, triggersReset: true, sensitivity: 5, ...overrides };
}

let verdictCounter = 0;
/** One engine ruling, typed the way extractOutcomeVerdicts hands it to the judge. */
function verdict(
  toolName: string,
  tier: OutcomeTier,
  contextForStory: string,
): OutcomeVerdict {
  verdictCounter += 1;
  return { checkId: `check-${verdictCounter}`, toolName, tier, contextForStory };
}

/**
 * runObserver with every judge on and allowed to rewrite - what the defaults
 * were before decision 187. The suites below exercise the judges themselves;
 * the defaults have their own describe block.
 */
function runAllJudges(params: Parameters<typeof runObserver>[0]) {
  return runObserver({ settings: LEGACY_OBSERVER_SETTINGS, ...params });
}

describe("checkResponseLength", () => {
  // No apiOptions passed in this block - the justification judge is skipped
  // entirely (see the dedicated describe block below), so these exercise
  // only the deterministic word-count trip, same as before that judge
  // existed.

  it("does not flag narration within the reply-length ceiling", async () => {
    const narration = "You duck behind the crate as the guard's light sweeps past.";
    expect(await checkResponseLength(narration, "", "short")).toBeNull();
  });

  it("does not flag empty narration", async () => {
    expect(await checkResponseLength("", "", "medium")).toBeNull();
    expect(await checkResponseLength("   ", "", "medium")).toBeNull();
  });

  it("flags a single turn that blows way past the medium ceiling", async () => {
    // PACING_BANDS.medium.high = 85, multiplier = 2 -> ceiling 170.
    const narration = Array(400).fill("word").join(" ");
    const flag = await checkResponseLength(narration, "", "medium");
    expect(flag).not.toBeNull();
    expect(flag?.type).toBe("response_length");
    expect(flag?.severity).toBe("major");
    expect(flag?.detail).toContain("400 words");
  });

  it("includes the flagged narration itself in the corrective prompt", async () => {
    const narration = `The lantern flickers wildly. ${Array(400).fill("word").join(" ")}`;
    const flag = await checkResponseLength(narration, "", "medium");
    expect(flag?.correctivePrompt).toContain(narration);
    expect(flag?.correctivePrompt).toContain("what you wrote last time");
  });

  it("does not flag a turn that's long but still under the hard ceiling", async () => {
    // Under 2x the "long" band's high (170 -> ceiling 340), e.g. a climax beat.
    const narration = Array(280).fill("word").join(" ");
    expect(await checkResponseLength(narration, "", "long")).toBeNull();
  });

  it("scales the ceiling to the short reply-length setting", async () => {
    // PACING_BANDS.short.high = 45, multiplier = 2 -> ceiling 90.
    const narration = Array(200).fill("word").join(" ");
    const flag = await checkResponseLength(narration, "", "short");
    expect(flag).not.toBeNull();
    expect(flag?.detail).toContain("~45 words");
  });

  it("does not flag anything when disabled, even a huge blowout", async () => {
    const narration = Array(1000).fill("word").join(" ");
    expect(
      await checkResponseLength(
        narration,
        "",
        "medium",
        undefined,
        checkSettings({ enabled: false }),
      ),
    ).toBeNull();
  });

  it("higher sensitivity flags a smaller overage", async () => {
    // PACING_BANDS.medium.high = 85. At sensitivity 5 (default) the
    // ceiling is 2x = 170, so 130 words doesn't flag; at sensitivity 10
    // the multiplier drops to 1x = 85, so the same 130 words should flag.
    const narration = Array(130).fill("word").join(" ");
    expect(
      await checkResponseLength(
        narration,
        "",
        "medium",
        undefined,
        checkSettings({ sensitivity: 5 }),
      ),
    ).toBeNull();
    expect(
      await checkResponseLength(
        narration,
        "",
        "medium",
        undefined,
        checkSettings({ sensitivity: 10 }),
      ),
    ).not.toBeNull();
  });

  it("lower sensitivity requires a bigger overage to flag", async () => {
    // At sensitivity 0 the multiplier is 3x = 255 - 220 words shouldn't
    // flag even though it would at the default sensitivity of 5 (2x = 170).
    const narration = Array(220).fill("word").join(" ");
    expect(
      await checkResponseLength(
        narration,
        "",
        "medium",
        undefined,
        checkSettings({ sensitivity: 5 }),
      ),
    ).not.toBeNull();
    expect(
      await checkResponseLength(
        narration,
        "",
        "medium",
        undefined,
        checkSettings({ sensitivity: 0 }),
      ),
    ).toBeNull();
  });
});

describe("prospectiveLengthFlag", () => {
  // The deterministic half of checkResponseLength, split out so generation.ts
  // can know what a length flag WOULD say before the justification judge has
  // answered - that's what makes the speculative shortened rewrite possible.
  // It must never make an API call and must agree exactly with the flag
  // checkResponseLength ends up returning on an unjustified overage.

  it("returns null for narration within the ceiling", () => {
    expect(
      prospectiveLengthFlag("You duck behind the crate.", "short"),
    ).toBeNull();
  });

  it("returns null for empty narration", () => {
    expect(prospectiveLengthFlag("", "medium")).toBeNull();
    expect(prospectiveLengthFlag("   ", "medium")).toBeNull();
  });

  it("returns null when the check is disabled", () => {
    expect(
      prospectiveLengthFlag(
        Array(400).fill("word").join(" "),
        "medium",
        checkSettings({ enabled: false }),
      ),
    ).toBeNull();
  });

  it("returns a major response_length flag once the turn blows past the ceiling", () => {
    const flag = prospectiveLengthFlag(Array(400).fill("word").join(" "), "medium");
    expect(flag?.type).toBe("response_length");
    expect(flag?.severity).toBe("major");
    expect(flag?.detail).toContain("400 words");
  });

  it("respects sensitivity the same way the check does", () => {
    // medium band high = 85; sensitivity 0 => 3x (255), sensitivity 10 => 1x (85)
    const narration = Array(200).fill("word").join(" ");
    expect(
      prospectiveLengthFlag(narration, "medium", checkSettings({ sensitivity: 0 })),
    ).toBeNull();
    expect(
      prospectiveLengthFlag(narration, "medium", checkSettings({ sensitivity: 10 })),
    ).not.toBeNull();
  });

  it("makes no API call", () => {
    const fetchMock = vi.fn();
    const originalFetch = global.fetch;
    global.fetch = fetchMock as unknown as typeof fetch;
    try {
      prospectiveLengthFlag(Array(400).fill("word").join(" "), "medium");
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("produces exactly the flag checkResponseLength returns for an unjustified overage", async () => {
    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        content: JSON.stringify({ justified: false, reason: "" }),
      }),
    }) as unknown as typeof fetch;

    try {
      const narration = Array(400).fill("word").join(" ");
      const judged = await checkResponseLength(narration, "I look around", "medium", {
        model: "test-model",
        token: "tok",
      });
      expect(judged).toEqual(prospectiveLengthFlag(narration, "medium"));
    } finally {
      global.fetch = originalFetch;
      vi.restoreAllMocks();
    }
  });
});

describe("plausibleResetFlagTypes", () => {
  // The gate that decides whether the player WAITS on the observer for a
  // given turn (generation.ts's resetPossible). It must answer from free
  // deterministic signals only - never a fetch - and must never claim a type
  // is plausible when that type's own check would bail out without a call.

  const LONG = Array(400).fill("word").join(" ");
  const SHORT = "The lock clicks open.";

  function observerSettings(
    overrides: Partial<ObserverSettings> = {},
  ): ObserverSettings {
    return { ...LEGACY_OBSERVER_SETTINGS, ...overrides };
  }

  // The turn-level questions below are asked of a config where the judges can
  // reset (the old defaults); under the new defaults nothing is plausible.
  const plausible = (params: Parameters<typeof plausibleResetFlagTypes>[0]) =>
    plausibleResetFlagTypes({ settings: LEGACY_OBSERVER_SETTINGS, ...params });

  it("returns nothing for an ordinary turn - short, no comparisons, top tier", () => {
    expect(
      plausible({
        narration: SHORT,
        replyLength: "medium",
        rollResults: [],
        toolNames: ["fate_question", "increment_scene"],
        tierUsed: TOP_TIER,
      }),
    ).toEqual([]);
  });

  it("returns nothing for empty narration", () => {
    expect(plausible({ narration: "   " })).toEqual([]);
  });

  it("makes no API call", () => {
    const fetchMock = vi.fn();
    const originalFetch = global.fetch;
    global.fetch = fetchMock as unknown as typeof fetch;
    try {
      plausible({
        narration: LONG,
        rollResults: [
          verdict("calculate", "success", "17 >= 15"),
        ],
        tierUsed: 0,
      });
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("flags response_length exactly when the free word count trips", () => {
    expect(
      plausible({ narration: LONG, replyLength: "medium" }),
    ).toContain("response_length");
    expect(
      plausible({ narration: SHORT, replyLength: "medium" }),
    ).not.toContain("response_length");
  });

  it("never lists player_agency - it has no free pre-signal, so it is judged in the background", () => {
    // Deliberate: listing it would make every turn "plausible" and restore the
    // always-block behavior this gate exists to end.
    expect(
      plausible({
        narration: "You decide to run, heart hammering, and you shout for help.",
        replyLength: "medium",
      }),
    ).not.toContain("player_agency");
  });

  it("flags outcome_narration_mismatch only when a verdict-bearing comparison resolved", () => {
    // Dice tools report what the dice showed and never judge it, so their
    // success is not a verdict - only calculate/record_challenge_result are.
    expect(
      plausible({
        narration: SHORT,
        rollResults: [
          verdict("formula_roll", "success", "3d6 = 11"),
        ],
      }),
    ).not.toContain("outcome_narration_mismatch");

    expect(
      plausible({
        narration: SHORT,
        rollResults: [
          verdict("calculate", "failure", "11 >= 15"),
        ],
      }),
    ).toContain("outcome_narration_mismatch");
  });

  it("still flags outcome_narration_mismatch for a mixed set of results - each is judged on its own", () => {
    // The old turn-wide cap (mixed results are always advisory) is gone:
    // one honoured roll must not excuse a reversed second one.
    expect(
      plausible({
        narration: SHORT,
        rollResults: [
          verdict("action_roll", "strong_hit", "attack"),
          verdict("action_roll", "miss", "escape"),
        ],
      }),
    ).toContain("outcome_narration_mismatch");
  });

  it("flags tier_escalation_missed only below the top tier AND with real stakes on the table", () => {
    expect(
      plausible({ narration: SHORT, tierUsed: 0, highStakes: true }),
    ).toContain("tier_escalation_missed");

    // Nowhere to escalate to.
    expect(
      plausible({
        narration: SHORT,
        tierUsed: TOP_TIER,
        highStakes: true,
      }),
    ).not.toContain("tier_escalation_missed");

    // Below the top tier is true on nearly every turn, so on its own it is a
    // precondition, not a signal - without stakes this stays deferred, or the
    // observer would go straight back to blocking every turn.
    expect(
      plausible({ narration: SHORT, tierUsed: 0 }),
    ).not.toContain("tier_escalation_missed");
    expect(
      plausible({
        narration: SHORT,
        tierUsed: 0,
        highStakes: false,
      }),
    ).not.toContain("tier_escalation_missed");

    // Caller didn't say which tier ran - checkTierEscalation is skipped too.
    expect(
      plausible({ narration: SHORT, highStakes: true }),
    ).not.toContain("tier_escalation_missed");
  });

  it("never lists a tool-usage gap - they are flag-only by type (finding 4)", () => {
    const base = {
      narration: SHORT,
      replyLength: "medium" as const,
      tierUsed: TOP_TIER,
      toolNames: [],
    };

    // Even at the sensitivity that used to make them "major" and with a
    // stored config that allows a reset, a missing tool is never something
    // the player waits on: a rewrite cannot call a tool.
    expect(
      plausible({
        ...base,
        settings: observerSettings({
          missing_oracle_or_table: { enabled: true, triggersReset: true, sensitivity: 9 },
          missing_scene_increment: { enabled: true, triggersReset: true, sensitivity: 9 },
        }),
      }),
    ).toEqual([]);
  });

  it("respects enabled and triggersReset per type", () => {
    const turn = {
      narration: LONG,
      replyLength: "medium" as const,
      tierUsed: 0,
    };

    expect(
      plausible({
        ...turn,
        settings: observerSettings({
          response_length: { enabled: false, triggersReset: true, sensitivity: 5 },
        }),
      }),
    ).not.toContain("response_length");

    expect(
      plausible({
        ...turn,
        highStakes: true,
        settings: observerSettings({
          tier_escalation_missed: {
            enabled: true,
            triggersReset: false,
            sensitivity: 5,
          },
        }),
      }),
    ).not.toContain("tier_escalation_missed");
  });
});

describe("checkResponseLength with a justification judge", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("does not flag an overage the judge says was justified", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        content: JSON.stringify({
          justified: true,
          reason: "This is the opening session-zero scene establishing the world.",
        }),
      }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const narration = Array(400).fill("word").join(" ");
    const flag = await checkResponseLength(narration, "", "medium", {
      model: "test-model",
      token: "tok",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(flag).toBeNull();
  });

  it("still flags an overage the judge says was not justified", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        content: JSON.stringify({
          justified: false,
          reason: "The turn just restates the same beat several times.",
        }),
      }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const narration = Array(400).fill("word").join(" ");
    const flag = await checkResponseLength(narration, "", "medium", {
      model: "test-model",
      token: "tok",
    });

    expect(flag).not.toBeNull();
    expect(flag?.type).toBe("response_length");
  });

  it("skips the judge call entirely when the turn is within the ceiling", async () => {
    const fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    const narration = "A short, unremarkable reply.";
    const flag = await checkResponseLength(narration, "", "medium", {
      model: "test-model",
      token: "tok",
    });

    expect(flag).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("treats a judge call that errors as unknown - no flag (finding 8)", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("network down"));
    global.fetch = fetchMock as unknown as typeof fetch;

    const narration = Array(400).fill("word").join(" ");
    const flag = await checkResponseLength(narration, "", "medium", {
      model: "test-model",
      token: "tok",
    });

    // It used to keep the major length flag here, and a failed rewrite after
    // it rolled the turn back and re-rolled its dice because the prose was long.
    expect(flag).toBeNull();
  });

  it("treats a judge response that isn't ok as unknown - no flag", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false });
    global.fetch = fetchMock as unknown as typeof fetch;

    const narration = Array(400).fill("word").join(" ");
    const flag = await checkResponseLength(narration, "", "medium", {
      model: "test-model",
      token: "tok",
    });

    expect(flag).toBeNull();
  });

  it("treats a judge whose JSON can't be parsed as unknown - no flag", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ content: "not json at all" }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const narration = Array(400).fill("word").join(" ");
    const flag = await checkResponseLength(narration, "", "medium", {
      model: "test-model",
      token: "tok",
    });

    expect(flag).toBeNull();
  });

  it("lets a Stop through instead of reading it as a failed judge (finding 8)", async () => {
    const abort = Object.assign(new Error("aborted"), { name: "AbortError" });
    global.fetch = vi.fn().mockRejectedValue(abort) as unknown as typeof fetch;

    await expect(
      checkResponseLength(Array(400).fill("word").join(" "), "", "medium", {
        model: "test-model",
        token: "tok",
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
  });

  it("still keeps the word-count flag when there is no judge to ask", async () => {
    const flag = await checkResponseLength(Array(400).fill("word").join(" "), "", "medium");
    expect(flag?.type).toBe("response_length");
  });

  it("passes the player's declared action to the judge for context", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        content: JSON.stringify({ justified: false, reason: "" }),
      }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const narration = Array(400).fill("word").join(" ");
    await checkResponseLength(narration, "I open the ancient door", "medium", {
      model: "test-model",
      token: "tok",
    });

    const sentBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    const userMessage = sentBody.messages[1].content;
    expect(userMessage).toContain("I open the ancient door");
  });
});

describe("checkPlayerAgencyViolation", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("returns null for empty narration without calling the API", async () => {
    const fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    const flag = await checkPlayerAgencyViolation("Open the door", "", {
      model: "test-model",
      token: "tok",
    });

    expect(flag).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("skips the API call entirely when disabled", async () => {
    const fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    const flag = await checkPlayerAgencyViolation(
      "I draw my sword",
      "You draw your sword and say, \"I'm sorry it has to be this way.\"",
      { model: "test-model", token: "tok" },
      checkSettings({ enabled: false }),
    );

    expect(flag).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns a flag when the observer model reports a violation", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        content: JSON.stringify({
          violation: true,
          severity: "major",
          reason: "The GM had the player character apologize, which the player never said.",
        }),
      }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const flag = await checkPlayerAgencyViolation(
      "I draw my sword",
      "You draw your sword. \"I'm sorry it has to be this way,\" you say.",
      { model: "test-model", token: "tok" },
    );

    expect(flag).not.toBeNull();
    expect(flag?.type).toBe("player_agency");
    expect(flag?.severity).toBe("major");
    expect(flag?.correctivePrompt).toContain("PLAYER AGENCY");
    expect(flag?.correctivePrompt).toContain("apologize");
  });

  it("returns null when the model reports no violation", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        content: JSON.stringify({ violation: false, severity: "minor", reason: "" }),
      }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const flag = await checkPlayerAgencyViolation(
      "I draw my sword",
      "You draw your sword and step forward.",
      { model: "test-model", token: "tok" },
    );

    expect(flag).toBeNull();
  });

  it("parses a response wrapped in a markdown code fence", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        content: '```json\n{"violation": true, "severity": "minor", "reason": "Borderline."}\n```',
      }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const flag = await checkPlayerAgencyViolation("I look around", "You look around.", {
      model: "test-model",
      token: "tok",
    });

    expect(flag?.severity).toBe("minor");
  });

  it("fails open (returns null) when the API call errors", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("network down"));
    global.fetch = fetchMock as unknown as typeof fetch;

    const flag = await checkPlayerAgencyViolation("I look around", "You look around.", {
      model: "test-model",
      token: "tok",
    });

    expect(flag).toBeNull();
  });

  it("fails open (returns null) when the API response isn't ok", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false });
    global.fetch = fetchMock as unknown as typeof fetch;

    const flag = await checkPlayerAgencyViolation("I look around", "You look around.", {
      model: "test-model",
      token: "tok",
    });

    expect(flag).toBeNull();
  });

  it("fails open (returns null) when the model's JSON can't be parsed", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ content: "not json at all" }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const flag = await checkPlayerAgencyViolation("I look around", "You look around.", {
      model: "test-model",
      token: "tok",
    });

    expect(flag).toBeNull();
  });
});

describe("checkOutcomeMismatch", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  function mockMismatch(mismatch: boolean, reason = "") {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ content: JSON.stringify({ mismatch, reason }) }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    return fetchMock;
  }

  it("returns null for empty narration without calling the API", async () => {
    const fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    const flag = await checkOutcomeMismatch(
      "",
      [verdict("action_roll", "miss", "MISS")],
      { model: "test-model", token: "tok" },
    );

    expect(flag).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns null when there are no roll/oracle results to check against", async () => {
    const fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    const flag = await checkOutcomeMismatch("You succeed effortlessly.", [], {
      model: "test-model",
      token: "tok",
    });

    expect(flag).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("skips the API call entirely when disabled", async () => {
    const fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    const flag = await checkOutcomeMismatch(
      "You leap the gap easily.",
      [verdict("action_roll", "miss", "MISS")],
      { model: "test-model", token: "tok" },
      checkSettings({ enabled: false }),
    );

    expect(flag).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("ignores the dice tools - they report numbers, they don't judge", async () => {
    // formula_roll/opposed_formula/npc_roll report what the dice showed and
    // never judge it, so checking narration against them would flag every
    // legitimately-failed roll. The verdict lives on the engine's rulings.
    const fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    const flag = await checkOutcomeMismatch(
      "You leap the gap easily.",
      [
        verdict("formula_roll", "success", "[Roll: 8]"),
        verdict("npc_roll", "success", "[NPC Roll: 4]"),
        verdict("opposed_formula", "success", "[Player: 8] [Guard: 19]"),
      ],
      { model: "test-model", token: "tok" },
    );

    expect(flag).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("flags a mismatch when the model finds narration contradicts a MISS", async () => {
    mockMismatch(true, "The roll missed but the narration describes a clean success.");

    const flag = await checkOutcomeMismatch(
      "You leap the gap easily and land without a scratch.",
      [verdict("action_roll", "miss", "[Athletics: 4 vs 6, 9]")],
      { model: "test-model", token: "tok" },
    );

    expect(flag?.type).toBe("outcome_narration_mismatch");
    expect(flag?.severity).toBe("major");
    expect(flag?.correctivePrompt).toContain("ground truth");
    expect(flag?.correctivePrompt).toContain("MISS");
  });

  it("returns null when the model finds no mismatch", async () => {
    mockMismatch(false);

    const flag = await checkOutcomeMismatch(
      "You stumble and fall short of the ledge.",
      [verdict("calculate", "failure", "**FALSE**")],
      { model: "test-model", token: "tok" },
    );

    expect(flag).toBeNull();
  });

  it("checks a recorded challenge outcome too", async () => {
    const fetchMock = mockMismatch(false);

    await checkOutcomeMismatch(
      "You slip, and the ledge crumbles under your boot.",
      [verdict("record_challenge_result", "miss", "[Challenge Check MISS: Vault over the gap]")],
      { model: "test-model", token: "tok" },
    );

    expect(fetchMock).toHaveBeenCalled();
  });

  it("shows the judge every ruling on its own numbered line, with its tier", async () => {
    const fetchMock = mockMismatch(false);

    await checkOutcomeMismatch(
      "You land the blow, but the guard slips away.",
      [
        verdict("action_roll", "strong_hit", "attack: strong"),
        verdict("action_roll", "miss", "escape: miss"),
      ],
      { model: "test-model", token: "tok" },
    );

    const sentBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    const userMessage = sentBody.messages[1].content as string;
    expect(userMessage).toContain("1. STRONG HIT");
    expect(userMessage).toContain("attack: strong");
    expect(userMessage).toContain("2. MISS");
    expect(userMessage).toContain("escape: miss");
    // Each ruling is its own; one honoured result does not excuse another.
    expect(sentBody.messages[0].content).toContain("EACH NUMBERED RESULT IS ITS OWN RULING");
  });

  it("does not cap a reversed second roll at minor because the first one succeeded", async () => {
    // The old turn-wide cap: one success + one failure made every mismatch
    // advisory, so a completely reversed escape was waved through whenever the
    // attack hit (Codex finding 6).
    mockMismatch(true, "Result 2 was a miss but the narration has the escape succeed cleanly.");

    const flag = await checkOutcomeMismatch(
      "You cut him down and slip out the back door without a sound.",
      [
        verdict("action_roll", "strong_hit", "attack"),
        verdict("action_roll", "miss", "escape"),
      ],
      { model: "test-model", token: "tok" },
    );

    expect(flag?.severity).toBe("major");
    expect(flag?.detail).toContain("Result 2");
  });

  it("describes a weak hit to the judge as a partial success, not a failure", async () => {
    const fetchMock = mockMismatch(false);

    await checkOutcomeMismatch(
      "You get through, but the alarm trips.",
      [verdict("action_roll", "weak_hit", "score 7 beat one die")],
      { model: "test-model", token: "tok" },
    );

    const sentBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(sentBody.messages[1].content).toContain("WEAK HIT");
    expect(sentBody.messages[1].content).toContain("partial success");
    expect(sentBody.messages[0].content).toContain("PARTIAL success");
  });

  it("gives the judge the adventure's own rules and the GM's reasoning", async () => {
    const fetchMock = mockMismatch(false);

    await checkOutcomeMismatch(
      "You get through, but the alarm trips.",
      [verdict("calculate", "failure", "die 2: FALSE")],
      { model: "test-model", token: "tok" },
      checkSettings(),
      "Sneak past the sentry",
      {
        mechanicsNote:
          "Beat both challenge dice for a strong hit, one for a weak hit, neither for a miss.",
      },
      "Action score 7 beat the first die but not the second - that's a weak hit.",
    );

    const sentBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    const userMessage = sentBody.messages[1].content;
    expect(userMessage).toContain("Sneak past the sentry");
    expect(userMessage).toContain("one for a weak hit");
    expect(userMessage).toContain("that's a weak hit");
    // The reasoning is testimony, not evidence - the numbers still outrank it.
    expect(userMessage).toContain("numbers outrank the explanation");
  });

  it("fails open (returns null) when the API call errors", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("network down"));
    global.fetch = fetchMock as unknown as typeof fetch;

    const flag = await checkOutcomeMismatch(
      "Something happens.",
      [verdict("calculate", "success", "TRUE")],
      { model: "test-model", token: "tok" },
    );

    expect(flag).toBeNull();
  });

  it("lets a Stop through instead of reading it as 'the judge had nothing to say'", async () => {
    const abort = Object.assign(new Error("aborted"), { name: "AbortError" });
    global.fetch = vi.fn().mockRejectedValue(abort) as unknown as typeof fetch;

    await expect(
      checkOutcomeMismatch(
        "Something happens.",
        [verdict("calculate", "success", "TRUE")],
        { model: "test-model", token: "tok" },
      ),
    ).rejects.toMatchObject({ name: "AbortError" });
  });
});

describe("extractOutcomeVerdicts", () => {
  const calc = (
    expression: string,
    result: Record<string, unknown>,
    context: string,
    success = true,
  ) => ({
    toolName: "calculate",
    toolCallId: `calc-${expression}`,
    success,
    result: { type: "calculate", expression, ...result },
    contextForStory: context,
  });

  it("gives a comparison that evaluated as success or failure", () => {
    const verdicts = extractOutcomeVerdicts([
      calc("17+3 >= 15", { result: 20, comparison: { operator: ">=", left: 20, right: 15, isTrue: true } }, "TRUE"),
      calc("8 >= 15", { result: 8, comparison: { operator: ">=", left: 8, right: 15, isTrue: false } }, "FALSE", false),
    ]);
    expect(verdicts.map((v) => v.tier)).toEqual(["success", "failure"]);
    expect(verdicts.map((v) => v.checkId)).toEqual(["calc-17+3 >= 15", "calc-8 >= 15"]);
  });

  it("never turns a plain sum into a SUCCESS (finding 6)", () => {
    // Arithmetic returns success:true; "you still cannot afford passage" after
    // a remaining-gold sum must not be judged against a "SUCCESS".
    expect(
      extractOutcomeVerdicts([calc("50 - 20", { result: 30 }, "[Gold left: 50 - 20 = 30]")]),
    ).toEqual([]);
  });

  it("never turns an evaluation error into a FAILURE (finding 6)", () => {
    expect(
      extractOutcomeVerdicts([
        calc("min(12,10", { result: 0 }, '[ERROR: Could not evaluate "min(12,10"]', false),
      ]),
    ).toEqual([]);
  });

  it("reads action_roll and progress_roll by the engine's outcome tier", () => {
    const verdicts = extractOutcomeVerdicts([
      {
        toolName: "action_roll",
        toolCallId: "a1",
        success: true,
        result: { type: "action_roll", outcome: "weak_hit" },
        contextForStory: "weak",
      },
      {
        toolName: "action_roll",
        toolCallId: "a2",
        success: false,
        result: { type: "action_roll", outcome: "miss" },
        contextForStory: "miss",
      },
      {
        toolName: "manage_track",
        toolCallId: "t1",
        success: true,
        result: { type: "manage_track", action: "progress_roll", outcome: "strong_hit" },
        contextForStory: "progress",
      },
      {
        // A track update is not a roll.
        toolName: "manage_track",
        toolCallId: "t2",
        success: true,
        result: { type: "manage_track", action: "mark_progress" },
        contextForStory: "marked",
      },
    ]);
    expect(verdicts.map((v) => [v.toolName, v.tier])).toEqual([
      ["action_roll", "weak_hit"],
      ["action_roll", "miss"],
      ["progress_roll", "strong_hit"],
    ]);
  });

  it("reads a recorded challenge outcome, and skips a refused one", () => {
    const verdicts = extractOutcomeVerdicts([
      {
        toolName: "record_challenge_result",
        toolCallId: "c1",
        success: false,
        result: { type: "record_challenge_result", outcome: "failure" },
        contextForStory: "[Challenge Check FAILURE]",
      },
      {
        toolName: "record_challenge_result",
        toolCallId: "c2",
        success: false,
        result: { type: "record_challenge_result", outcome: "success" },
        contextForStory: "[ERROR: no active challenge]",
      },
    ]);
    expect(verdicts.map((v) => [v.checkId, v.tier])).toEqual([["c1", "failure"]]);
  });

  it("ignores the dice tools and the oracle", () => {
    expect(
      extractOutcomeVerdicts([
        { toolName: "formula_roll", toolCallId: "f", success: true, result: { type: "formula_roll" }, contextForStory: "3d6 = 11" },
        { toolName: "fate_question", toolCallId: "q", success: true, result: { type: "fate_question" }, contextForStory: "No" },
      ]),
    ).toEqual([]);
  });
});

describe("checkToolUsageGaps", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("returns no flags for empty narration without calling the API", async () => {
    const fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    const flags = await checkToolUsageGaps("", [], {
      model: "test-model",
      token: "tok",
    });

    expect(flags).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("skips the API call entirely when both tools were already used this turn", async () => {
    const fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    const flags = await checkToolUsageGaps(
      "The sun sets over the ruined tower.",
      ["fate_question", "increment_scene"],
      { model: "test-model", token: "tok" },
    );

    expect(flags).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("skips the API call entirely when both flag types are disabled", async () => {
    const fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    const flags = await checkToolUsageGaps(
      "You guess the door is unlocked, and it is.",
      [],
      { model: "test-model", token: "tok" },
      checkSettings({ enabled: false }),
      checkSettings({ enabled: false }),
    );

    expect(flags).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("only asks about the enabled type when one is disabled", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        content: JSON.stringify({ missed_scene_increment: true, scene_reason: "Time skip." }),
      }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const flags = await checkToolUsageGaps(
      "The next morning, you wake in a new city.",
      [],
      { model: "test-model", token: "tok" },
      checkSettings({ enabled: false }), // oracle disabled
      checkSettings(), // scene enabled
    );

    const sentBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    const systemPrompt = sentBody.messages[0].content;
    expect(systemPrompt).not.toContain("THE ORACLE");
    expect(systemPrompt).toContain("SCENE TRANSITIONS");
    expect(flags).toHaveLength(1);
    expect(flags[0].type).toBe("missing_scene_increment");
  });

  it("elevates severity to major once sensitivity crosses the threshold", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        content: JSON.stringify({
          missed_oracle_or_table: true,
          oracle_reason: "Invented an outcome instead of rolling.",
        }),
      }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const lenientFlags = await checkToolUsageGaps(
      "You guess the door is unlocked, and it is.",
      [],
      { model: "test-model", token: "tok" },
      checkSettings({ sensitivity: 5 }),
    );
    expect(lenientFlags[0].severity).toBe("minor");

    const strictFlags = await checkToolUsageGaps(
      "You guess the door is unlocked, and it is.",
      [],
      { model: "test-model", token: "tok" },
      checkSettings({ sensitivity: 9 }),
    );
    expect(strictFlags[0].severity).toBe("major");
  });

  it("flags a missing oracle/table use", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        content: JSON.stringify({
          missed_oracle_or_table: true,
          oracle_reason: "The GM decided the guard didn't notice without any roll.",
        }),
      }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const flags = await checkToolUsageGaps(
      "You slip past. The guard doesn't notice a thing.",
      [],
      { model: "test-model", token: "tok" },
    );

    expect(flags).toHaveLength(1);
    expect(flags[0].type).toBe("missing_oracle_or_table");
    expect(flags[0].severity).toBe("minor");
    expect(flags[0].detail).toContain("guard didn't notice");
  });

  it("flags a missing scene increment", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        content: JSON.stringify({
          missed_scene_increment: true,
          scene_reason: "The narration time-skipped to the next morning.",
        }),
      }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const flags = await checkToolUsageGaps(
      "The next morning, you wake in a new city entirely.",
      [],
      { model: "test-model", token: "tok" },
    );

    expect(flags).toHaveLength(1);
    expect(flags[0].type).toBe("missing_scene_increment");
    expect(flags[0].severity).toBe("minor");
  });

  it("only reports the gap that was actually asked about, even if the model answers both", async () => {
    // increment_scene was already called this turn - only the oracle/table
    // half should be asked about, so a spurious missed_scene_increment:true
    // from the model must be ignored.
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        content: JSON.stringify({
          missed_oracle_or_table: true,
          oracle_reason: "Invented an uncertain outcome.",
          missed_scene_increment: true,
          scene_reason: "Should not be reported.",
        }),
      }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const flags = await checkToolUsageGaps(
      "You guess the lock is unlocked, and it is.",
      ["increment_scene"],
      { model: "test-model", token: "tok" },
    );

    expect(flags).toHaveLength(1);
    expect(flags[0].type).toBe("missing_oracle_or_table");
  });

  it("reports nothing when the model finds no gap", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        content: JSON.stringify({
          missed_oracle_or_table: false,
          oracle_reason: "",
          missed_scene_increment: false,
          scene_reason: "",
        }),
      }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const flags = await checkToolUsageGaps("You nod and walk on.", [], {
      model: "test-model",
      token: "tok",
    });

    expect(flags).toEqual([]);
  });

  it("fails open (empty array) when the API call errors", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("network down"));
    global.fetch = fetchMock as unknown as typeof fetch;

    const flags = await checkToolUsageGaps("Something happens.", [], {
      model: "test-model",
      token: "tok",
    });

    expect(flags).toEqual([]);
  });
});

describe("checkTierEscalation", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("returns null for empty narration without calling the API", async () => {
    const fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    const flag = await checkTierEscalation("", "I open the door", 0, {
      model: "test-model",
      token: "tok",
    });

    expect(flag).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("skips the API call entirely when disabled", async () => {
    const fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    const flag = await checkTierEscalation(
      "You strike a bargain with the ancient spirit.",
      "Negotiate with the spirit",
      0,
      { model: "test-model", token: "tok" },
      checkSettings({ enabled: false }),
    );

    expect(flag).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("skips the API call entirely when already at the top tier - nothing to escalate to", async () => {
    const fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    const flag = await checkTierEscalation(
      "The final confrontation begins.",
      "Attack the boss",
      TOP_TIER,
      { model: "test-model", token: "tok" },
    );

    expect(flag).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("flags a turn the judge says needed a higher tier", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        content: JSON.stringify({
          should_escalate: true,
          reason: "This was a campaign-shaping decision that deserved careful adjudication.",
        }),
      }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const flag = await checkTierEscalation(
      "You decide whether to betray the kingdom, forever changing the war's course.",
      "Decide whether to betray the kingdom",
      0,
      { model: "test-model", token: "tok" },
    );

    expect(flag).not.toBeNull();
    expect(flag?.type).toBe("tier_escalation_missed");
    expect(flag?.severity).toBe("major");
    expect(flag?.detail).toContain("campaign-shaping decision");
    expect(flag?.correctivePrompt).toContain("higher reasoning tier");
  });

  it("returns null when the judge says the tier used was fine", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        content: JSON.stringify({ should_escalate: false, reason: "" }),
      }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const flag = await checkTierEscalation(
      "You chat with the innkeeper about the weather.",
      "Ask the innkeeper about the weather",
      0,
      { model: "test-model", token: "tok" },
    );

    expect(flag).toBeNull();
  });

  it("fails open (returns null) when the API call errors", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("network down"));
    global.fetch = fetchMock as unknown as typeof fetch;

    const flag = await checkTierEscalation(
      "Something happens.",
      "Do something",
      0,
      { model: "test-model", token: "tok" },
    );

    expect(flag).toBeNull();
  });
});

describe("observerSuspensionReason", () => {
  it("suspends every check while session zero is still active", () => {
    expect(observerSuspensionReason({ sessionZeroActive: true })).toContain(
      "session zero",
    );
  });

  it("suspends the start_game turn itself, even once the flag has flipped", () => {
    // start_game sets sessionZeroActive false mid-turn, so by the time the
    // observer runs the flag is already down - the tool name is what keeps
    // the wrap-up turn (the longest, most setup-heavy of the campaign) out
    // of the judges' hands.
    expect(
      observerSuspensionReason({
        sessionZeroActive: false,
        toolNames: ["create_note", "start_game"],
      }),
    ).toContain("start_game");
  });

  it("suspends a story that has no character sheet yet, whatever created it", () => {
    // startAdventureLocally never sets sessionZeroActive, so an adventure
    // still in character creation has only this signal to protect it - the
    // same "FRESH STORY - SETUP NEEDED" condition the GM's own prompt uses.
    expect(
      observerSuspensionReason({
        sessionZeroActive: false,
        toolNames: ["create_note"],
        hasCharacterSheet: false,
      }),
    ).toContain("character sheet");
  });

  it("does not suspend an ordinary turn of play", () => {
    expect(
      observerSuspensionReason({
        sessionZeroActive: false,
        toolNames: ["formula_roll", "increment_scene"],
        hasCharacterSheet: true,
      }),
    ).toBeNull();
    expect(observerSuspensionReason({})).toBeNull();
  });
});

describe("hasCharacterSheetNote", () => {
  function story(lore: unknown[]): StoryData {
    return { lore } as unknown as StoryData;
  }

  it("is true only for an enabled, non-empty character sheet note", () => {
    expect(
      hasCharacterSheetNote(
        story([{ title: "Sheet", content: "Traits: bold", type: "character_sheet" }]),
      ),
    ).toBe(true);
    expect(hasCharacterSheetNote(story([]))).toBe(false);
    expect(
      hasCharacterSheetNote(
        story([{ title: "Sheet", content: "   ", type: "character_sheet" }]),
      ),
    ).toBe(false);
    expect(
      hasCharacterSheetNote(
        story([
          { title: "Sheet", content: "Traits", type: "character_sheet", enabled: false },
        ]),
      ),
    ).toBe(false);
    expect(
      hasCharacterSheetNote(story([{ title: "Town", content: "A town", type: "lore" }])),
    ).toBe(false);
  });
});

describe("buildObserverCharacterContext", () => {
  function storyWith(overrides: Partial<StoryData> = {}): StoryData {
    return {
      player_name: "Kira Vance",
      player_summary: "A disgraced ranger hunting the thing that took her sister",
      lore: [
        {
          title: "Kira Vance",
          content: "Traits: reckless, loyal. Bond: her sister Mira.",
          type: "character_sheet",
        },
        { title: "The Ashen Court", content: "A hidden faction", type: "faction" },
      ],
      npcs: [{ name: "Bram" }, { name: "Sister Oleth" }],
      ...overrides,
    } as unknown as StoryData;
  }

  it("pulls the player character, their sheet, and the NPC roster out of StoryData", () => {
    const context = buildObserverCharacterContext(storyWith());
    expect(context.playerName).toBe("Kira Vance");
    expect(context.playerSummary).toContain("disgraced ranger");
    expect(context.characterSheet).toContain("Bond: her sister Mira.");
    expect(context.characterSheet).not.toContain("The Ashen Court");
    expect(context.npcNames).toEqual(["Bram", "Sister Oleth"]);
  });

  it("skips disabled character sheet notes", () => {
    const context = buildObserverCharacterContext(
      storyWith({
        lore: [
          {
            title: "Old Sheet",
            content: "Stale character data",
            type: "character_sheet",
            enabled: false,
          },
        ] as unknown as StoryData["lore"],
      }),
    );
    expect(context.characterSheet).toBeUndefined();
  });

  it("truncates a very long character sheet rather than blowing up the judge prompt", () => {
    const context = buildObserverCharacterContext(
      storyWith({
        lore: [
          {
            title: "Sheet",
            content: Array(2000).fill("trait").join(" "),
            type: "character_sheet",
          },
        ] as unknown as StoryData["lore"],
      }),
    );
    expect(context.characterSheet!.length).toBeLessThan(1600);
    expect(context.characterSheet!.endsWith("...")).toBe(true);
  });

  it("pulls the mechanics note out too, so the judges know the dice system in play", () => {
    const context = buildObserverCharacterContext(
      storyWith({
        lore: [
          {
            title: "Starforged Rolls",
            content:
              "Roll 1d6+stat against 2d10. Beat both = strong hit, one = weak hit, neither = miss.",
            type: "mechanics",
          },
          { title: "Kira", content: "Traits: reckless", type: "character_sheet" },
        ] as unknown as StoryData["lore"],
      }),
    );
    expect(context.mechanicsNote).toContain("weak hit");
    // The two notes stay in their own fields - the sheet is a casting
    // question, the mechanics note a rules question.
    expect(context.mechanicsNote).not.toContain("Traits: reckless");
    expect(context.characterSheet).not.toContain("weak hit");
  });

  it("skips disabled mechanics notes and leaves the field unset when there are none", () => {
    expect(
      buildObserverCharacterContext(
        storyWith({
          lore: [
            {
              title: "Old Rules",
              content: "Stale d20 system",
              type: "mechanics",
              enabled: false,
            },
          ] as unknown as StoryData["lore"],
        }),
      ).mechanicsNote,
    ).toBeUndefined();

    expect(buildObserverCharacterContext(storyWith()).mechanicsNote).toBeUndefined();
  });

  it("truncates a very long mechanics note rather than blowing up the judge prompt", () => {
    const context = buildObserverCharacterContext(
      storyWith({
        lore: [
          {
            title: "Rules",
            content: Array(3000).fill("rule").join(" "),
            type: "mechanics",
          },
        ] as unknown as StoryData["lore"],
      }),
    );
    expect(context.mechanicsNote!.length).toBeLessThan(2600);
    expect(context.mechanicsNote!.endsWith("...")).toBe(true);
  });

  it("treats couch co-op players as additional player characters", () => {
    const context = buildObserverCharacterContext(
      storyWith({
        multiplayer: {
          enabled: true,
          couchPlayers: [{ id: "a", name: "Ren" }, { id: "b", name: "Sol" }],
        } as unknown as StoryData["multiplayer"],
      }),
    );
    expect(context.playerAliases).toEqual(["Ren", "Sol"]);
  });
});

describe("formatCharacterContextBlock", () => {
  it("returns nothing when there is no character data to give", () => {
    expect(formatCharacterContextBlock(undefined)).toBe("");
    expect(formatCharacterContextBlock({})).toBe("");
  });

  it("names the player character and separates them from the NPCs", () => {
    const block = formatCharacterContextBlock({
      playerName: "Kira Vance",
      playerSummary: "A disgraced ranger",
      npcNames: ["Bram", "Sister Oleth"],
    });
    expect(block).toContain("PLAYER CHARACTER is **Kira Vance**");
    expect(block).toContain("Bram, Sister Oleth");
    expect(block).toContain("NOT a violation");
  });

  it("lists every player character in couch co-op", () => {
    const block = formatCharacterContextBlock({
      playerName: "Kira",
      playerAliases: ["Kira", "Ren"],
    });
    expect(block).toContain("PLAYER CHARACTERS are **Kira**, **Ren**");
  });

  it("leaves the mechanics note out - WHO IS WHO answers a casting question, not a rules one", () => {
    const block = formatCharacterContextBlock({
      playerName: "Kira",
      mechanicsNote: "Beat both dice for a strong hit.",
    });
    expect(block).not.toContain("strong hit");
  });
});

describe("formatMechanicsBlock", () => {
  it("returns nothing when the adventure has no mechanics note", () => {
    expect(formatMechanicsBlock(undefined)).toBe("");
    expect(formatMechanicsBlock({})).toBe("");
    expect(formatMechanicsBlock({ mechanicsNote: "   " })).toBe("");
  });

  it("hands over the rules and tells the judge to prefer them over generic assumptions", () => {
    const block = formatMechanicsBlock({
      mechanicsNote: "Beat both challenge dice for a strong hit, one for a weak hit.",
    });
    expect(block).toContain("one for a weak hit");
    expect(block).toContain("not against generic pass/fail");
    // The outcome tiers between success and failure are the point.
    expect(block).toContain("outcome tiers");
  });
});

describe("character context reaches the judges", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  function mockJudge(payload: Record<string, unknown>) {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ content: JSON.stringify(payload) }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    return fetchMock;
  }

  it("tells the agency judge who the player character is and who the NPCs are", async () => {
    const fetchMock = mockJudge({ violation: false, severity: "minor", reason: "" });

    await checkPlayerAgencyViolation(
      "I ask Bram about the road north",
      "Bram spits into the fire. 'Nobody takes that road twice,' he says.",
      { model: "test-model", token: "tok" },
      checkSettings(),
      {
        playerName: "Kira Vance",
        npcNames: ["Bram"],
        characterSheet: "Traits: reckless, loyal.",
      },
    );

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    const userMessage = body.messages[1].content;
    expect(userMessage).toContain("Kira Vance");
    expect(userMessage).toContain("Bram");
    expect(userMessage).toContain("Traits: reckless, loyal.");
  });

  it("gives the length judge the turn's mechanical results as context", async () => {
    const fetchMock = mockJudge({ justified: false, reason: "" });

    await checkResponseLength(
      Array(400).fill("word").join(" "),
      "I fight the whole patrol",
      "medium",
      { model: "test-model", token: "tok" },
      checkSettings(),
      { playerName: "Kira Vance" },
      "formula_roll: 18 vs DC 14 - SUCCESS\nnpc_roll: 7 vs DC 12 - FAILURE",
    );

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    const userMessage = body.messages[1].content;
    expect(userMessage).toContain("Kira Vance");
    expect(userMessage).toContain("18 vs DC 14");
    expect(body.messages[0].content).toContain("Answering the player out-of-character");
  });

  it("prompts identically to before when no character context is available", async () => {
    const fetchMock = mockJudge({ violation: false, severity: "minor", reason: "" });

    await checkPlayerAgencyViolation("I wait", "The rain keeps falling.", {
      model: "test-model",
      token: "tok",
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.messages[1].content).not.toContain("WHO IS WHO");
  });

  it("gives the tool-usage judge the adventure's rules, so a built-in oracle isn't mistaken for a gap", async () => {
    const fetchMock = mockJudge({
      missed_oracle_or_table: false,
      oracle_reason: "",
      missed_scene_increment: false,
      scene_reason: "",
    });

    await checkToolUsageGaps(
      "You ask the ship's oracle and it answers in static.",
      [],
      { model: "test-model", token: "tok" },
      checkSettings(),
      checkSettings(),
      { mechanicsNote: "Ask the Oracle: roll 2d10 on the Starforged oracle tables." },
    );

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.messages[1].content).toContain("Starforged oracle tables");
  });

  it("does not leak the GM's reasoning into the agency judge", async () => {
    // The reasoning there is as likely to hold the violation ("I'll have her
    // decide to run") as an exoneration, so only the outcome judge gets it.
    const fetchMock = mockJudge({ violation: false, severity: "minor", reason: "" });

    await runAllJudges({
      narration: "The rain keeps falling.",
      playerChoice: "I wait",
      narrationThoughts: "I'll have her decide to run for the treeline.",
      apiOptions: { model: "test-model", token: "tok" },
    });

    const agencyCalls = fetchMock.mock.calls.filter((call) =>
      JSON.parse(call[1].body).messages[0].content.includes("PLAYER AGENCY") ||
      JSON.parse(call[1].body).messages[0].content.includes("took a decision away from the player"),
    );
    expect(agencyCalls.length).toBeGreaterThan(0);
    for (const call of agencyCalls) {
      expect(call[1].body).not.toContain("run for the treeline");
    }
  });
});

describe("runObserver", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("combines a length flag with an agency flag when both trigger", async () => {
    // The length judge has to answer "not justified" for the flag to stand
    // (an unanswered judge is unknown, not a flag).
    const fetchMock = vi.fn().mockImplementation(async (_url, init) => {
      const system = JSON.parse(init.body).messages[0].content as string;
      return {
        ok: true,
        json: async () => ({
          content: system.includes("usual ceiling of ~")
            ? JSON.stringify({ justified: false, reason: "" })
            : JSON.stringify({
                violation: true,
                severity: "major",
                reason: "Spoke for the player.",
              }),
        }),
      };
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const flags = await runAllJudges({
      narration: Array(400).fill("word").join(" "),
      playerChoice: "I draw my sword",
      replyLength: "medium",
      apiOptions: { model: "test-model", token: "tok" },
    });

    expect(flags.map((f) => f.type).sort()).toEqual(["player_agency", "response_length"]);
  });

  it("issues every check's API call concurrently, not one after another", async () => {
    // The five checks are independent and each fails open on its own, so
    // awaiting them in sequence only ever stacked round trips between the end
    // of narration and the choices the player is waiting on. Every call should
    // be in flight before any of them has resolved.
    const resolvers: Array<(value: unknown) => void> = [];
    const fetchMock = vi.fn().mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvers.push(resolve);
        }),
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    const pending = runAllJudges({
      narration: Array(400).fill("word").join(" "),
      playerChoice: "I draw my sword",
      replyLength: "medium",
      toolNames: ["formula_roll", "calculate"],
      rollResults: [
        verdict("calculate", "success", "Climb check: 14 >= 12 -> **TRUE**"),
      ],
      tierUsed: 1,
      apiOptions: { model: "test-model", token: "tok" },
    });

    // Nothing has been allowed to resolve yet: length judge, agency, outcome,
    // tool-usage and tier should all already have fired.
    expect(fetchMock).toHaveBeenCalledTimes(5);

    const passing = {
      ok: true,
      json: async () => ({
        content: JSON.stringify({
          justified: true,
          violation: false,
          severity: "minor",
          reason: "",
          contradicts: false,
          missed_oracle_or_table: false,
          missed_scene_increment: false,
          should_escalate: false,
        }),
      }),
    };
    for (const resolve of resolvers) resolve(passing);

    expect(await pending).toEqual([]);
  });

  it("keeps flag order fixed no matter which judge answers first", async () => {
    // generateStoryTurn corrects the FIRST major flag, so the order has to be
    // deterministic rather than a race between judges. Here the agency judge
    // answers long before the length judge, and the length flag must still
    // come first.
    let releaseLengthJudge: (() => void) | null = null;
    const lengthJudgeGate = new Promise<void>((resolve) => {
      releaseLengthJudge = resolve;
    });

    const fetchMock = vi.fn().mockImplementation(async (_url, init) => {
      const system = JSON.parse(init.body).messages[0].content as string;
      if (system.includes("usual ceiling of ~")) {
        await lengthJudgeGate;
        return {
          ok: true,
          json: async () => ({
            content: JSON.stringify({ justified: false, reason: "" }),
          }),
        };
      }
      return {
        ok: true,
        json: async () => ({
          content: JSON.stringify({
            violation: true,
            severity: "major",
            reason: "Spoke for the player.",
            contradicts: false,
            missed_oracle_or_table: false,
            missed_scene_increment: false,
            should_escalate: false,
          }),
        }),
      };
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const pending = runAllJudges({
      narration: Array(400).fill("word").join(" "),
      playerChoice: "I draw my sword",
      replyLength: "medium",
      apiOptions: { model: "test-model", token: "tok" },
    });

    // Let every other judge settle before the length judge is unblocked.
    await new Promise((resolve) => setTimeout(resolve, 0));
    releaseLengthJudge!();

    const flags = await pending;
    expect(flags.map((f) => f.type)).toEqual([
      "response_length",
      "player_agency",
    ]);
  });

  it("judges nothing during session zero, not even the free length check", async () => {
    const fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    const flags = await runAllJudges({
      narration: Array(800).fill("word").join(" "), // a setup dump, legitimately huge
      playerChoice: "A grim lighthouse mystery, please",
      replyLength: "medium",
      sessionZeroActive: true,
      tierUsed: 0,
      apiOptions: { model: "test-model", token: "tok" },
    });

    expect(flags).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("judges nothing on the start_game turn", async () => {
    const fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    const flags = await runAllJudges({
      narration: Array(800).fill("word").join(" "),
      playerChoice: "Let's begin",
      replyLength: "medium",
      sessionZeroActive: false,
      toolNames: ["create_note", "start_game"],
      apiOptions: { model: "test-model", token: "tok" },
    });

    expect(flags).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("judges nothing while the story still has no character sheet", async () => {
    const fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    const flags = await runAllJudges({
      narration: Array(800).fill("word").join(" "),
      playerChoice: "Something gothic, I think",
      replyLength: "medium",
      hasCharacterSheet: false,
      apiOptions: { model: "test-model", token: "tok" },
    });

    expect(flags).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("resumes judging on the first turn after the game has started", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        content: JSON.stringify({ justified: false, violation: false, severity: "minor", reason: "" }),
      }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const flags = await runAllJudges({
      narration: Array(400).fill("word").join(" "),
      playerChoice: "I head for the cliffs",
      replyLength: "medium",
      sessionZeroActive: false,
      toolNames: ["formula_roll"],
      apiOptions: { model: "test-model", token: "tok" },
    });

    expect(fetchMock).toHaveBeenCalled();
    expect(flags.some((f) => f.type === "response_length")).toBe(true);
  });

  it("returns an empty array when neither check flags anything", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        content: JSON.stringify({ violation: false, severity: "minor", reason: "" }),
      }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const flags = await runAllJudges({
      narration: "You draw your sword.",
      playerChoice: "I draw my sword",
      replyLength: "medium",
      apiOptions: { model: "test-model", token: "tok" },
    });

    expect(flags).toEqual([]);
  });

  it("includes tool-usage-gap flags when toolNames is passed and a gap is found", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        content: JSON.stringify({
          violation: false,
          severity: "minor",
          reason: "",
          missed_oracle_or_table: true,
          oracle_reason: "Invented whether the trap was disarmed.",
        }),
      }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const flags = await runAllJudges({
      narration: "You guess the trap is disarmed, and it is.",
      playerChoice: "Disarm the trap",
      replyLength: "medium",
      toolNames: ["increment_scene"], // scene already handled, oracle wasn't
      apiOptions: { model: "test-model", token: "tok" },
    });

    expect(flags.some((f) => f.type === "missing_oracle_or_table")).toBe(true);
    expect(flags.some((f) => f.type === "missing_scene_increment")).toBe(false);
  });

  it("skips the tier check entirely when tierUsed is not passed", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        content: JSON.stringify({ violation: false, severity: "minor", reason: "" }),
      }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const flags = await runAllJudges({
      narration: "You decide whether to betray the kingdom.",
      playerChoice: "Decide whether to betray the kingdom",
      apiOptions: { model: "test-model", token: "tok" },
    });

    expect(flags.some((f) => f.type === "tier_escalation_missed")).toBe(false);
  });

  it("includes a tier_escalation_missed flag when tierUsed is passed and the judge flags it", async () => {
    const fetchMock = vi.fn().mockImplementation(async (_url, init) => {
      const body = JSON.parse(init.body);
      const isTierCall = (body.messages[0].content as string).includes(
        "reasoning tier",
      );
      return {
        ok: true,
        json: async () =>
          isTierCall
            ? {
                content: JSON.stringify({
                  should_escalate: true,
                  reason: "Deserved more careful adjudication.",
                }),
              }
            : {
                content: JSON.stringify({ violation: false, severity: "minor", reason: "" }),
              },
      };
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const flags = await runAllJudges({
      narration: "You decide whether to betray the kingdom.",
      playerChoice: "Decide whether to betray the kingdom",
      tierUsed: 0,
      apiOptions: { model: "test-model", token: "tok" },
    });

    expect(flags.some((f) => f.type === "tier_escalation_missed")).toBe(true);
  });

  it("threads the rules note and the GM's reasoning through to the outcome judge", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        content: JSON.stringify({ mismatch: false, reason: "" }),
      }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    await runAllJudges({
      narration: "You slip aboard, but the hatch seals behind you.",
      playerChoice: "Board the derelict",
      rollResults: [
        verdict("calculate", "success", "die 1: TRUE"),
        verdict("calculate", "failure", "die 2: FALSE"),
      ],
      characterContext: {
        playerName: "Kira Vance",
        mechanicsNote: "Beat one challenge die for a weak hit.",
      },
      narrationThoughts: "One die beaten, one not - weak hit, so she's in but trapped.",
      apiOptions: { model: "test-model", token: "tok" },
    });

    const outcomeCall = fetchMock.mock.calls.find((call) =>
      JSON.parse(call[1].body).messages[1].content.includes("die 2: FALSE"),
    );
    expect(outcomeCall).toBeDefined();
    const userMessage = JSON.parse(outcomeCall![1].body).messages[1].content;
    expect(userMessage).toContain("Beat one challenge die for a weak hit.");
    expect(userMessage).toContain("weak hit, so she's in but trapped");
    expect(userMessage).toContain("Board the derelict");
  });
});

describe("buildObserverWarningNote", () => {
  function flag(overrides: Partial<ObserverFlag> = {}): ObserverFlag {
    return {
      type: "missing_scene_increment",
      severity: "minor",
      detail: "Narrated a time skip without calling increment_scene.",
      correctivePrompt: "unused for this note",
      ...overrides,
    };
  }

  it("returns undefined when there are no flags", () => {
    expect(buildObserverWarningNote(undefined)).toBeUndefined();
    expect(buildObserverWarningNote([])).toBeUndefined();
  });

  it("builds a warning from a single surviving flag's detail", () => {
    const note = buildObserverWarningNote([flag()]);
    expect(note).toContain("flagged by the observer");
    expect(note).toContain("Narrated a time skip without calling increment_scene.");
  });

  it("lists every surviving flag's detail, not just the first", () => {
    const note = buildObserverWarningNote([
      flag({ detail: "First issue." }),
      flag({ type: "missing_oracle_or_table", detail: "Second issue." }),
    ]);
    expect(note).toContain("First issue.");
    expect(note).toContain("Second issue.");
  });
});

describe("buildObserverCorrectionNote", () => {
  function flag(overrides: Partial<ObserverFlag> = {}): ObserverFlag {
    return {
      type: "response_length",
      severity: "major",
      detail: "This turn ran 900 words, well past the ceiling.",
      correctivePrompt: "unused for this note",
      ...overrides,
    };
  }

  it("returns undefined when there are no corrected flags", () => {
    expect(buildObserverCorrectionNote(undefined)).toBeUndefined();
    expect(buildObserverCorrectionNote([])).toBeUndefined();
  });

  it("builds a correction note from a single fixed flag's detail", () => {
    const note = buildObserverCorrectionNote([flag()]);
    expect(note).toContain("corrected by the observer");
    expect(note).toContain("This turn ran 900 words, well past the ceiling.");
  });

  it("lists every corrected flag's detail, not just the first", () => {
    const note = buildObserverCorrectionNote([
      flag({ detail: "First issue." }),
      flag({ type: "player_agency", detail: "Second issue." }),
    ]);
    expect(note).toContain("First issue.");
    expect(note).toContain("Second issue.");
  });
});

describe("reconcileGmConversationAfterRewrite", () => {
  const flag: ObserverFlag = {
    type: "response_length",
    severity: "major",
    detail: "This turn ran 900 words, well past the ceiling.",
    correctivePrompt: "unused",
  };

  it("returns the input untouched when there's no conversation", () => {
    expect(
      reconcileGmConversationAfterRewrite(undefined, "short prose", flag),
    ).toBeUndefined();
    expect(
      reconcileGmConversationAfterRewrite([], "short prose", flag),
    ).toEqual([]);
  });

  it("drops the discarded draft prose and splices in the corrected narration", () => {
    const convo: GMConversationMessage[] = [
      {
        role: "assistant",
        content:
          "<thinking>The guard is distracted; DC 12.</thinking>\n\nA long, overwrought paragraph of the original draft that ran way too long and needs cutting.",
      },
    ];
    const out = reconcileGmConversationAfterRewrite(convo, "You slip past.", flag)!;
    // The original long draft prose is gone...
    expect(out[0].content).not.toContain("overwrought");
    // ...the reasoning is preserved...
    expect(out[0].content).toContain("The guard is distracted; DC 12.");
    // ...and the corrected narration is the only visible (non-thinking) text.
    expect(extractVisibleText(out[0].content)).toBe("You slip past.");
  });

  it("keeps the correction marker inside <thinking> so it never renders as narration", () => {
    const convo: GMConversationMessage[] = [
      { role: "assistant", content: "The long original draft prose." },
    ];
    const out = reconcileGmConversationAfterRewrite(convo, "You slip past.", flag)!;
    // Marker text is present for the model to read as context...
    expect(out[0].content).toContain("OBSERVER CORRECTION");
    expect(out[0].content).toContain(flag.detail);
    // ...but only the corrected prose is player-visible - the marker is hidden.
    expect(extractVisibleText(out[0].content)).toBe("You slip past.");
  });

  it("strips prose from every assistant round but attaches the fix to the last one", () => {
    const convo: GMConversationMessage[] = [
      {
        role: "assistant",
        content: "<thinking>Roll to hit.</thinking>\n\nDraft narration round one.",
        tool_calls: [
          { id: "abc123xyz", type: "function", function: { name: "formula_roll", arguments: "{}" } },
        ],
      },
      { role: "tool", content: "[formula_roll] 15 vs DC 12 - success", tool_call_id: "abc123xyz" },
      { role: "assistant", content: "Draft narration round two, the long finish." },
    ];
    const out = reconcileGmConversationAfterRewrite(convo, "The blade lands.", flag)!;
    // Same length / same tool message, pairing preserved.
    expect(out).toHaveLength(3);
    expect(out[1]).toEqual(convo[1]);
    // Tool-round assistant keeps its reasoning + tool_calls, loses its prose.
    expect(out[0].content).toContain("Roll to hit.");
    expect(extractVisibleText(out[0].content)).toBe("");
    expect(out[0].tool_calls).toEqual(convo[0].tool_calls);
    // Only the final assistant round carries the corrected narration.
    expect(extractVisibleText(out[2].content)).toBe("The blade lands.");
    expect(out[2].content).toContain("OBSERVER CORRECTION");
  });

  it("preserves native reasoning when content was pure prose (reasoning-tier model)", () => {
    const convo: GMConversationMessage[] = [
      {
        role: "assistant",
        content: "Pure prose draft with no thinking tags, quite long.",
        reasoning: "native chain of thought",
      },
    ];
    const out = reconcileGmConversationAfterRewrite(convo, "Done.", flag)!;
    expect(out[0].reasoning).toBe("native chain of thought");
    expect(extractVisibleText(out[0].content)).toBe("Done.");
    expect(out[0].content).not.toContain("Pure prose draft");
  });
});

describe("reconcileGmThinkingAfterRewrite", () => {
  const flag: ObserverFlag = {
    type: "response_length",
    severity: "major",
    detail: "This turn ran 900 words, well past the ceiling.",
    correctivePrompt: "unused",
  };

  it("passes through empty input", () => {
    expect(reconcileGmThinkingAfterRewrite(undefined, "x", flag)).toBeUndefined();
    expect(reconcileGmThinkingAfterRewrite([], "x", flag)).toEqual([]);
  });

  it("strips the draft, keeps array length, and appends the fix to the last entry", () => {
    const thinking = [
      "<thinking>Round one reasoning.</thinking>\n\nRound one draft prose.",
      "<thinking>Round two reasoning.</thinking>\n\nThe long round two draft.",
    ];
    const out = reconcileGmThinkingAfterRewrite(thinking, "You escape.", flag)!;
    expect(out).toHaveLength(2);
    expect(extractVisibleText(out[0])).toBe(""); // prose gone
    expect(out[0]).toContain("Round one reasoning.");
    expect(extractVisibleText(out[1])).toBe("You escape."); // corrected prose only
    expect(out[1]).toContain("OBSERVER CORRECTION");
    // The discarded draft prose is gone from every entry (the word "draft"
    // still appears in the marker copy, so assert on the draft's actual text).
    expect(out.join("\n")).not.toContain("Round one draft prose");
    expect(out.join("\n")).not.toContain("The long round two draft");
  });
});

describe("DEFAULT_OBSERVER_SETTINGS / settingsFor", () => {
  it("has every judge on; the three prose judges rewrite, the rest flag (decision 220)", () => {
    for (const type of Object.keys(DEFAULT_OBSERVER_SETTINGS) as Array<
      keyof typeof DEFAULT_OBSERVER_SETTINGS
    >) {
      expect(DEFAULT_OBSERVER_SETTINGS[type].enabled).toBe(true);
    }
    expect(DEFAULT_OBSERVER_SETTINGS.response_length).toEqual({
      enabled: true,
      triggersReset: true,
      sensitivity: 5,
    });
    expect(DEFAULT_OBSERVER_SETTINGS.player_agency).toEqual({
      enabled: true,
      triggersReset: true,
      sensitivity: 3,
    });
    expect(DEFAULT_OBSERVER_SETTINGS.outcome_narration_mismatch).toEqual({
      enabled: true,
      triggersReset: true,
      sensitivity: 2,
    });
    for (const type of [
      "missing_oracle_or_table",
      "missing_scene_increment",
      "tier_escalation_missed",
    ] as const) {
      expect(DEFAULT_OBSERVER_SETTINGS[type].triggersReset).toBe(false);
      expect(DEFAULT_OBSERVER_SETTINGS[type].sensitivity).toBe(5);
    }
    // ...so a turn can wait on a judge that may rewrite it.
    expect(canObserverTriggerReset(undefined)).toBe(true);
    // The decision 187 table is still reachable, and cannot rewrite.
    expect(canObserverTriggerReset(FLAG_ONLY_OBSERVER_SETTINGS)).toBe(false);
  });

  it("is frozen, and settingsFor hands out copies so no caller can change it", () => {
    expect(Object.isFrozen(DEFAULT_OBSERVER_SETTINGS)).toBe(true);
    expect(Object.isFrozen(DEFAULT_OBSERVER_SETTINGS.player_agency)).toBe(true);

    const copy = settingsFor(undefined, "player_agency");
    copy.enabled = false;
    copy.sensitivity = 9;
    expect(DEFAULT_OBSERVER_SETTINGS.player_agency.enabled).toBe(true);
    expect(DEFAULT_OBSERVER_SETTINGS.player_agency.sensitivity).toBe(3);
    expect(settingsFor(undefined, "player_agency").enabled).toBe(true);

    const fresh = cloneDefaultObserverSettings();
    fresh.response_length.enabled = false;
    expect(DEFAULT_OBSERVER_SETTINGS.response_length.enabled).toBe(true);
  });

  it("falls back to defaults when no settings object is provided", () => {
    expect(settingsFor(undefined, "player_agency")).toEqual(
      DEFAULT_OBSERVER_SETTINGS.player_agency,
    );
  });

  it("merges a partial override with that type's defaults", () => {
    const merged = settingsFor(
      { player_agency: { enabled: false } } as any,
      "player_agency",
    );
    expect(merged.enabled).toBe(false);
    // Fields the override didn't specify still fall back to the default.
    expect(merged.triggersReset).toBe(true);
    expect(merged.sensitivity).toBe(3);
  });

  it("does not let an override for one type leak into another", () => {
    const settings = { response_length: { enabled: false } } as any;
    expect(settingsFor(settings, "response_length").enabled).toBe(false);
    expect(settingsFor(settings, "player_agency").enabled).toBe(true);
    expect(settingsFor(settings, "outcome_narration_mismatch").enabled).toBe(true);
  });

  it("reports the tool-usage gaps as unable to reset whatever a stored config says (finding 4)", () => {
    const stored = {
      missing_oracle_or_table: { enabled: true, triggersReset: true, sensitivity: 9 },
      missing_scene_increment: { enabled: true, triggersReset: true, sensitivity: 9 },
      response_length: { enabled: false },
      player_agency: { enabled: false },
      outcome_narration_mismatch: { enabled: false },
    } as any;
    for (const type of ["missing_oracle_or_table", "missing_scene_increment"] as const) {
      expect(FLAG_ONLY_FLAG_TYPES.has(type)).toBe(true);
      expect(settingsFor(stored, type).triggersReset).toBe(false);
    }
    expect(canObserverTriggerReset(stored)).toBe(false);
  });

  it("maps a check to Off / Flag / Rewrite for Settings and back", () => {
    expect(observerModeOf({ enabled: false, triggersReset: false, sensitivity: 5 })).toBe("off");
    expect(observerModeOf({ enabled: true, triggersReset: false, sensitivity: 5 })).toBe("flag");
    expect(observerModeOf({ enabled: true, triggersReset: true, sensitivity: 5 })).toBe("rewrite");
    expect(observerModePatch("off")).toEqual({ enabled: false, triggersReset: false });
    expect(observerModePatch("flag")).toEqual({ enabled: true, triggersReset: false });
    expect(observerModePatch("rewrite")).toEqual({ enabled: true, triggersReset: true });
  });

  it("counts the calls the enabled judges can add, for the cost line", () => {
    // Defaults: every judge on and the prose judges rewrite.
    expect(countJudgeCalls(cloneDefaultObserverSettings())).toEqual({
      always: 3,
      sometimes: 2,
      rewrites: true,
    });
    // The flag-only table: the outcome judge only, and only on a turn with a ruling.
    expect(countJudgeCalls(FLAG_ONLY_OBSERVER_SETTINGS)).toEqual({
      always: 0,
      sometimes: 1,
      rewrites: false,
    });
    expect(countJudgeCalls(LEGACY_OBSERVER_SETTINGS)).toEqual({
      always: 3,
      sometimes: 2,
      rewrites: true,
    });
  });
});

describe("runObserver with the flag-only settings (decision 187's table)", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("makes no judge call on a turn with no engine ruling", async () => {
    const fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    const flags = await runObserver({
      settings: FLAG_ONLY_OBSERVER_SETTINGS,
      narration: Array(400).fill("word").join(" "),
      playerChoice: "I draw my sword",
      replyLength: "medium",
      toolNames: [],
      tierUsed: 0,
      apiOptions: { model: "test-model", token: "tok" },
    });

    expect(flags).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("judges only the outcome, once, on a turn with a ruling", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        content: JSON.stringify({ mismatch: true, reason: "Result 1 was a miss." }),
      }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const flags = await runObserver({
      settings: FLAG_ONLY_OBSERVER_SETTINGS,
      narration: "You clear the gap cleanly.",
      playerChoice: "I jump",
      rollResults: [verdict("action_roll", "miss", "MISS")],
      tierUsed: 0,
      apiOptions: { model: "test-model", token: "tok" },
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(flags.map((f) => f.type)).toEqual(["outcome_narration_mismatch"]);
    // Flag only: never reset-eligible under this table.
    expect(
      flags.some(
        (f) =>
          f.severity === "major" &&
          settingsFor(FLAG_ONLY_OBSERVER_SETTINGS, f.type).triggersReset,
      ),
    ).toBe(false);
  });

  it("is not plausible-to-reset on any turn, so the player never waits on a judge", () => {
    expect(
      plausibleResetFlagTypes({
        settings: FLAG_ONLY_OBSERVER_SETTINGS,
        narration: Array(400).fill("word").join(" "),
        rollResults: [verdict("action_roll", "miss", "MISS")],
        tierUsed: 0,
        highStakes: true,
        replyLength: "medium",
      }),
    ).toEqual([]);
  });
});

describe("a rewrite is checked before it replaces anything (finding 5)", () => {
  const original = "You draw your sword and apologize.";

  it("accepts a clean replacement and strips the thinking the story stage would strip", () => {
    const checked = validateRewriteResponse(
      { content: "<thinking>keep the flinch</thinking>You draw your sword.", finishReason: "stop" },
      original,
    );
    expect(checked).toEqual({ ok: true, text: "You draw your sword." });
  });

  it("rejects a reply cut off at the token limit", () => {
    expect(
      validateRewriteResponse({ content: "You draw your", finishReason: "length" }, original),
    ).toMatchObject({ ok: false, reason: expect.stringContaining("token limit") });
  });

  it("rejects a reply that carries tool calls", () => {
    expect(
      validateRewriteResponse(
        { content: "You draw your sword.", toolCalls: [{ id: "1" }] },
        original,
      ),
    ).toMatchObject({ ok: false, reason: expect.stringContaining("tool calls") });
  });

  it("rejects a refusal or an introduction instead of prose", () => {
    for (const reply of [
      "I'm sorry, but I can't rewrite that scene.",
      "I cannot continue with this request.",
      "Here is the rewritten narration: You draw your sword.",
      "Sure! You draw your sword.",
      "As an AI, I should note that...",
    ]) {
      expect(validateRewriteResponse({ content: reply }, original), reply).toMatchObject({
        ok: false,
      });
    }
  });

  it("rejects a reply that is empty once the normal cleanup has run", () => {
    expect(validateRewriteResponse({ content: "   " }, original)).toMatchObject({ ok: false });
    expect(
      validateRewriteResponse({ content: "<thinking>only thoughts</thinking>" }, original),
    ).toMatchObject({ ok: false });
  });

  it("rejects the original text handed back unchanged", () => {
    expect(
      validateRewriteResponse({ content: `  ${original.toUpperCase()}  ` }, original),
    ).toMatchObject({ ok: false, reason: expect.stringContaining("unchanged") });
  });

  it("makes rewriteFlaggedNarration return null (the original is kept) for a rejected reply", async () => {
    const originalFetch = global.fetch;
    try {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ content: "I'm sorry, I can't help with that.", toolCalls: [] }),
      }) as unknown as typeof fetch;
      const rewritten = await rewriteFlaggedNarration({
        narration: original,
        playerChoice: "I draw my sword",
        flag: {
          type: "player_agency",
          severity: "major",
          detail: "Spoke for the player.",
          correctivePrompt: "x",
        },
        apiOptions: { model: "test-model", token: "tok" },
      });
      expect(rewritten).toBeNull();
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("never rewrites for a tool that did not run, and never would mark it corrected (finding 4)", async () => {
    const originalFetch = global.fetch;
    const fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    try {
      for (const type of [
        "missing_oracle_or_table",
        "missing_scene_increment",
        "tier_escalation_missed",
      ] as const) {
        const rewritten = await rewriteFlaggedNarration({
          narration: original,
          playerChoice: "I draw my sword",
          flag: { type, severity: "major", detail: "x", correctivePrompt: "x" },
          apiOptions: { model: "test-model", token: "tok" },
        });
        expect(rewritten).toBeNull();
      }
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      global.fetch = originalFetch;
    }
  });
});

describe("rewriteFlaggedNarration", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  const flag: ObserverFlag = {
    type: "player_agency",
    severity: "major",
    detail: "The GM had the player character apologize, which the player never said.",
    correctivePrompt: "Rewrite this turn so you don't speak for the player character.",
  };

  it("sends the flagged narration and violation reason, and returns the model's rewrite", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ content: "You draw your sword, saying nothing." }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const rewritten = await rewriteFlaggedNarration({
      narration: "You draw your sword. \"I'm sorry it has to be this way,\" you say.",
      playerChoice: "I draw my sword",
      gmStoryContext: "formula_roll: SUCCESS (used to inform the narration)",
      flag,
      apiOptions: { model: "test-model", token: "tok" },
    });

    expect(rewritten).toBe("You draw your sword, saying nothing.");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [, requestInit] = fetchMock.mock.calls[0];
    const body = JSON.parse(requestInit.body);
    const userMessage = body.messages.find(
      (m: { role: string; content: string }) => m.role === "user",
    ).content;
    // The rewrite call must show the model its own flagged text, the
    // specific reason, and the mechanical ground truth - not just a vague
    // instruction to try again blind.
    expect(userMessage).toContain("I'm sorry it has to be this way");
    expect(userMessage).toContain(flag.detail);
    expect(userMessage).toContain("formula_roll: SUCCESS");
  });

  it("adds conditional 'fix this too' clauses for the checks named in alsoFixIfPresent", async () => {
    // The speculative rewrite starts before the other reviewers have answered,
    // and the turn only gets one rewrite - so their complaints ride along
    // conditionally rather than being lost.
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ content: "You draw your sword, saying nothing." }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    await rewriteFlaggedNarration({
      narration: Array(400).fill("word").join(" "),
      playerChoice: "I draw my sword",
      flag: {
        type: "response_length",
        severity: "major",
        detail: "This turn ran 400 words.",
        correctivePrompt: "Shorter.",
      },
      alsoFixIfPresent: ["player_agency", "outcome_narration_mismatch"],
      apiOptions: { model: "test-model", token: "tok" },
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    const prompt = body.messages
      .map((m: { content: string }) => m.content)
      .join("\n");
    expect(prompt).toContain("makes a significant choice for them");
    expect(prompt).toContain("contradicts what a roll or check mechanically");
    // Conditional, never asserted as found - a clean narration must not be
    // "corrected" for a problem it doesn't have.
    expect(prompt).toContain("have NOT necessarily been found here");
    expect(prompt).toContain("Do not invent a problem to fix");
  });

  it("skips alsoFixIfPresent entries a rewrite could not fix, and the flag's own type", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ content: "You draw your sword, saying nothing." }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    await rewriteFlaggedNarration({
      narration: "You draw your sword and apologize.",
      playerChoice: "I draw my sword",
      flag,
      // The tool-usage and tier checks are complaints about tool calls and
      // reasoning tier, not about the prose - no clause exists for them.
      // player_agency is the flag being fixed already.
      alsoFixIfPresent: [
        "player_agency",
        "missing_oracle_or_table",
        "missing_scene_increment",
        "tier_escalation_missed",
      ],
      apiOptions: { model: "test-model", token: "tok" },
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    const prompt = body.messages
      .map((m: { content: string }) => m.content)
      .join("\n");
    expect(prompt).not.toContain("have NOT necessarily been found here");
  });

  it("produces the unchanged prompt when alsoFixIfPresent is omitted", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ content: "You draw your sword, saying nothing." }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    await rewriteFlaggedNarration({
      narration: "You draw your sword and apologize.",
      playerChoice: "I draw my sword",
      flag,
      apiOptions: { model: "test-model", token: "tok" },
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    const prompt = body.messages
      .map((m: { content: string }) => m.content)
      .join("\n");
    expect(prompt).not.toContain("have NOT necessarily been found here");
    expect(prompt).toContain("Fix only what was flagged.");
  });

  it("continues the turn's own conversation when one is handed over", async () => {
    // The whole point: a rewrite prompted from scratch knows nothing about
    // the premise, the scene, the notes, or who anyone is, so it writes prose
    // for a story it can't see. Continuing the conversation that produced the
    // turn gives it all of that for free.
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ content: "You draw your sword, saying nothing." }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const conversation = [
      { role: "system" as const, content: "You ARE the Game Master. [premise, lore, notes]" },
      { role: "user" as const, content: "CURRENT GAME STATE: the lighthouse, Bram, the storm" },
      { role: "assistant" as const, content: "You draw your sword and apologize." },
    ];

    await rewriteFlaggedNarration({
      narration: "You draw your sword and apologize.",
      playerChoice: "I draw my sword",
      flag,
      conversationMessages: conversation,
      apiOptions: { model: "test-model", token: "tok" },
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    // Original conversation preserved in order, correction appended last.
    expect(body.messages).toHaveLength(4);
    expect(body.messages.slice(0, 3)).toEqual(conversation);
    expect(body.messages[3].role).toBe("user");
    expect(body.messages[3].content).toContain(flag.detail);
    expect(body.messages[3].content).toContain("You draw your sword and apologize.");
    // No second system prompt competing with the GM's own.
    expect(body.messages.filter((m: { role: string }) => m.role === "system")).toHaveLength(1);
  });

  it("forbids the rewrite from advancing the story instead of rewriting the beat", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ content: "You draw your sword." }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    await rewriteFlaggedNarration({
      narration: "You draw your sword and apologize.",
      playerChoice: "I draw my sword",
      flag,
      conversationMessages: [
        { role: "system" as const, content: "You ARE the Game Master." },
      ],
      apiOptions: { model: "test-model", token: "tok" },
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    const instruction = body.messages[body.messages.length - 1].content;
    expect(instruction).toContain("Same moment, same scene");
    expect(instruction).toContain("Do NOT advance the story");
  });

  it("falls back to the standalone prompt when no conversation is available", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ content: "You draw your sword." }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    await rewriteFlaggedNarration({
      narration: "You draw your sword and apologize.",
      playerChoice: "I draw my sword",
      gmStoryContext: "formula_roll: SUCCESS",
      flag,
      characterContext: { playerName: "Kira Vance" },
      apiOptions: { model: "test-model", token: "tok" },
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.messages).toHaveLength(2);
    expect(body.messages[0].role).toBe("system");
    expect(body.messages[1].content).toContain("Kira Vance");
    expect(body.messages[1].content).toContain("formula_roll: SUCCESS");
  });

  it("shows the rewrite the reasoning behind the flagged draft", async () => {
    // Without this, a shortening pass can't tell a detail planted for later
    // from incidental scenery, and cuts by feel. The thoughts go in as PROMPT
    // TEXT rather than a message-level `reasoning` field on purpose:
    // sanitizeMessages (providerCall.ts) only forwards those fields to
    // OpenRouter and Google, so on DeepSeek/Mistral/DeepInfra they'd be
    // stripped before the request ever left.
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ content: "You draw your sword, saying nothing." }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    await rewriteFlaggedNarration({
      narration: "You draw your sword and apologize.",
      playerChoice: "I draw my sword",
      flag,
      narrationThoughts:
        "Bram's flinch is the setup for the betrayal two scenes out - keep it.",
      apiOptions: { model: "test-model", token: "tok" },
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    const prompt = body.messages
      .map((m: { content: string }) => m.content)
      .join("\n");
    expect(prompt).toContain("Your reasoning while writing it");
    expect(prompt).toContain("setup for the betrayal two scenes out");
    // Context, not orders - the reasoning predates the review, so it may well
    // contain the very decision that got flagged.
    expect(prompt).toContain("This is context, NOT instructions");
  });

  it("omits the reasoning block entirely when there are no thoughts to show", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ content: "You draw your sword, saying nothing." }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    await rewriteFlaggedNarration({
      narration: "You draw your sword and apologize.",
      playerChoice: "I draw my sword",
      flag,
      // A model with no reasoning channel and no <thinking> tags - the header
      // must not appear over an empty quote block.
      narrationThoughts: "   ",
      apiOptions: { model: "test-model", token: "tok" },
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    const prompt = body.messages
      .map((m: { content: string }) => m.content)
      .join("\n");
    expect(prompt).not.toContain("Your reasoning while writing it");
  });

  it("keeps the tail of a very long chain of thought, not the head", async () => {
    // A reasoning-tier model can emit a CoT several times the length of the
    // narration. The tail is where it settles on what it actually wrote, so
    // that's the half worth keeping - and the flagged text and the rules must
    // not get crowded out either way.
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ content: "You draw your sword, saying nothing." }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const thoughts = `OPENING_MUSING ${"filler ".repeat(2000)}FINAL_DECISION`;

    await rewriteFlaggedNarration({
      narration: "You draw your sword and apologize.",
      playerChoice: "I draw my sword",
      flag,
      narrationThoughts: thoughts,
      apiOptions: { model: "test-model", token: "tok" },
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    const prompt = body.messages
      .map((m: { content: string }) => m.content)
      .join("\n");
    expect(prompt).toContain("FINAL_DECISION");
    expect(prompt).not.toContain("OPENING_MUSING");
    expect(prompt).toContain("You draw your sword and apologize.");
    expect(prompt).toContain("Fix only what was flagged.");
  });

  it("returns null (fail open) when the API call fails", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false });
    global.fetch = fetchMock as unknown as typeof fetch;

    const rewritten = await rewriteFlaggedNarration({
      narration: "You draw your sword and apologize.",
      playerChoice: "I draw my sword",
      flag,
      apiOptions: { model: "test-model", token: "tok" },
    });

    expect(rewritten).toBeNull();
  });

  it("returns null (fail open) when the response has no content", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ content: "" }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const rewritten = await rewriteFlaggedNarration({
      narration: "You draw your sword and apologize.",
      playerChoice: "I draw my sword",
      flag,
      apiOptions: { model: "test-model", token: "tok" },
    });

    expect(rewritten).toBeNull();
  });

  it("returns null (fail open) when fetch throws", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("network error"));
    global.fetch = fetchMock as unknown as typeof fetch;

    const rewritten = await rewriteFlaggedNarration({
      narration: "You draw your sword and apologize.",
      playerChoice: "I draw my sword",
      flag,
      apiOptions: { model: "test-model", token: "tok" },
    });

    expect(rewritten).toBeNull();
  });
});

describe("agency is plausible with a player line (decision 237)", () => {
  const rewriting = cloneDefaultObserverSettings();

  it("lists player_agency when the turn has a non-empty player line", () => {
    expect(
      plausibleResetFlagTypes({
        narration: "The lock clicks open.",
        playerChoice: "I pick the lock",
        settings: rewriting,
      }),
    ).toContain("player_agency");
  });

  it("does not list it for an empty line, or when agency is off or only flags", () => {
    const base = { narration: "The lock clicks open.", playerChoice: "I pick the lock" };
    expect(
      plausibleResetFlagTypes({ ...base, playerChoice: "  ", settings: rewriting }),
    ).not.toContain("player_agency");
    expect(
      plausibleResetFlagTypes({
        ...base,
        settings: { ...rewriting, player_agency: { enabled: false, triggersReset: false, sensitivity: 3 } },
      }),
    ).not.toContain("player_agency");
    expect(
      plausibleResetFlagTypes({
        ...base,
        settings: { ...rewriting, player_agency: { enabled: true, triggersReset: false, sensitivity: 3 } },
      }),
    ).not.toContain("player_agency");
  });
});

describe("splitObserverSettings: each judge runs once", () => {
  it("gives the blocking pass the rewriting judges and the background the rest", () => {
    const { blocking, background } = splitObserverSettings(cloneDefaultObserverSettings(), true);
    for (const type of ["response_length", "player_agency", "outcome_narration_mismatch"] as const) {
      expect(blocking[type].enabled).toBe(true);
      expect(background[type].enabled).toBe(false);
    }
    for (const type of ["missing_oracle_or_table", "missing_scene_increment", "tier_escalation_missed"] as const) {
      expect(blocking[type].enabled).toBe(false);
      expect(background[type].enabled).toBe(true);
    }
  });

  it("keeps the whole config in the background when no blocking pass runs", () => {
    const { background } = splitObserverSettings(cloneDefaultObserverSettings(), false);
    expect(background.player_agency.enabled).toBe(true);
    expect(background.response_length.enabled).toBe(true);
  });
});
