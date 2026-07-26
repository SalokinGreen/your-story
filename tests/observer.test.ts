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
  buildObserverWarningNote,
  buildObserverCorrectionNote,
  reconcileGmConversationAfterRewrite,
  reconcileGmThinkingAfterRewrite,
  rewriteFlaggedNarration,
  settingsFor,
  DEFAULT_OBSERVER_SETTINGS,
  ObserverCheckSettings,
} from "../app/misc/observer";
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

  it("fails open to the mechanical flag when the judge API call errors", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("network down"));
    global.fetch = fetchMock as unknown as typeof fetch;

    const narration = Array(400).fill("word").join(" ");
    const flag = await checkResponseLength(narration, "", "medium", {
      model: "test-model",
      token: "tok",
    });

    expect(flag).not.toBeNull();
    expect(flag?.type).toBe("response_length");
  });

  it("fails open to the mechanical flag when the judge response isn't ok", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false });
    global.fetch = fetchMock as unknown as typeof fetch;

    const narration = Array(400).fill("word").join(" ");
    const flag = await checkResponseLength(narration, "", "medium", {
      model: "test-model",
      token: "tok",
    });

    expect(flag).not.toBeNull();
  });

  it("fails open to the mechanical flag when the judge's JSON can't be parsed", async () => {
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

    expect(flag).not.toBeNull();
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

  it("returns null for empty narration without calling the API", async () => {
    const fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    const flag = await checkOutcomeMismatch(
      "",
      [{ toolName: "formula_roll", success: false, contextForStory: "FAILURE" }],
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
      [{ toolName: "formula_roll", success: false, contextForStory: "FAILURE" }],
      { model: "test-model", token: "tok" },
      checkSettings({ enabled: false }),
    );

    expect(flag).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("ignores the dice tools - they report numbers, they don't judge", async () => {
    // formula_roll/opposed_formula/npc_roll always come back success=true now
    // (the dice were thrown), so checking narration against that would flag
    // every legitimately-failed roll. The verdict lives on calculate.
    const fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    const flag = await checkOutcomeMismatch(
      "You leap the gap easily.",
      [
        { toolName: "formula_roll", success: true, contextForStory: "[Roll: 8]" },
        { toolName: "npc_roll", success: true, contextForStory: "[NPC Roll: 4]" },
        {
          toolName: "opposed_formula",
          success: true,
          contextForStory: "[Player: 8] [Guard: 19]",
        },
      ],
      { model: "test-model", token: "tok" },
    );

    expect(flag).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("ignores fate_question results (not a SUCCESS/FAILURE check)", async () => {
    const fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    const flag = await checkOutcomeMismatch(
      "The omens are unclear.",
      [{ toolName: "fate_question", success: true, contextForStory: "Answer: No" }],
      { model: "test-model", token: "tok" },
    );

    expect(flag).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("flags a mismatch when the model finds narration contradicts a FAILURE", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        content: JSON.stringify({
          mismatch: true,
          reason: "The roll failed but the narration describes a clean success.",
        }),
      }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const flag = await checkOutcomeMismatch(
      "You leap the gap easily and land without a scratch.",
      [
        {
          toolName: "calculate",
          success: false,
          contextForStory: "[Athletics check: 8 >= 15 -> **FALSE**]",
        },
      ],
      { model: "test-model", token: "tok" },
    );

    expect(flag).not.toBeNull();
    expect(flag?.type).toBe("outcome_narration_mismatch");
    expect(flag?.severity).toBe("major");
    expect(flag?.correctivePrompt).toContain("ground truth");
  });

  it("returns null when the model finds no mismatch", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        content: JSON.stringify({ mismatch: false, reason: "" }),
      }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const flag = await checkOutcomeMismatch(
      "You stumble and fall short of the ledge.",
      [{ toolName: "calculate", success: false, contextForStory: "**FALSE**" }],
      { model: "test-model", token: "tok" },
    );

    expect(flag).toBeNull();
  });

  it("checks a recorded challenge outcome too", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        content: JSON.stringify({ mismatch: false, reason: "" }),
      }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    await checkOutcomeMismatch(
      "You slip, and the ledge crumbles under your boot.",
      [
        {
          toolName: "record_challenge_result",
          success: false,
          contextForStory: "[Challenge Check FAILURE: Vault over the gap]",
        },
      ],
      { model: "test-model", token: "tok" },
    );

    expect(fetchMock).toHaveBeenCalled();
  });

  it("only checks the last relevant roll when multiple rolls happened this turn", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        content: JSON.stringify({ mismatch: false, reason: "" }),
      }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    await checkOutcomeMismatch(
      "You succeed on the second attempt.",
      [
        { toolName: "calculate", success: false, contextForStory: "first: FALSE" },
        { toolName: "calculate", success: true, contextForStory: "second: TRUE" },
      ],
      { model: "test-model", token: "tok" },
    );

    const sentBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    const userMessage = sentBody.messages[1].content;
    expect(userMessage).toContain("SUCCESS");
    expect(userMessage).toContain("second: TRUE");
  });

  it("fails open (returns null) when the API call errors", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("network down"));
    global.fetch = fetchMock as unknown as typeof fetch;

    const flag = await checkOutcomeMismatch(
      "Something happens.",
      [{ toolName: "calculate", success: true, contextForStory: "TRUE" }],
      { model: "test-model", token: "tok" },
    );

    expect(flag).toBeNull();
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
});

describe("runObserver", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("combines a length flag with an agency flag when both trigger", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        content: JSON.stringify({
          violation: true,
          severity: "major",
          reason: "Spoke for the player.",
        }),
      }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const flags = await runObserver({
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

    const pending = runObserver({
      narration: Array(400).fill("word").join(" "),
      playerChoice: "I draw my sword",
      replyLength: "medium",
      toolNames: ["formula_roll", "calculate"],
      rollResults: [
        {
          toolName: "calculate",
          success: true,
          contextForStory: "Climb check: 14 >= 12 -> **TRUE**",
        },
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

    const pending = runObserver({
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

    const flags = await runObserver({
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

    const flags = await runObserver({
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

    const flags = await runObserver({
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

    const flags = await runObserver({
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

    const flags = await runObserver({
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

    const flags = await runObserver({
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

    const flags = await runObserver({
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

    const flags = await runObserver({
      narration: "You decide whether to betray the kingdom.",
      playerChoice: "Decide whether to betray the kingdom",
      tierUsed: 0,
      apiOptions: { model: "test-model", token: "tok" },
    });

    expect(flags.some((f) => f.type === "tier_escalation_missed")).toBe(true);
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
  it("reproduces today's shipped reset behavior by default", () => {
    // The three checks that can naturally be "major" reset by default...
    expect(DEFAULT_OBSERVER_SETTINGS.response_length.triggersReset).toBe(true);
    expect(DEFAULT_OBSERVER_SETTINGS.player_agency.triggersReset).toBe(true);
    expect(
      DEFAULT_OBSERVER_SETTINGS.outcome_narration_mismatch.triggersReset,
    ).toBe(true);
    // ...the two tool-usage-gap checks stay log-only, exactly as before.
    expect(
      DEFAULT_OBSERVER_SETTINGS.missing_oracle_or_table.triggersReset,
    ).toBe(false);
    expect(
      DEFAULT_OBSERVER_SETTINGS.missing_scene_increment.triggersReset,
    ).toBe(false);
    // Every check is on and at the balanced default sensitivity.
    for (const type of Object.keys(DEFAULT_OBSERVER_SETTINGS) as Array<
      keyof typeof DEFAULT_OBSERVER_SETTINGS
    >) {
      expect(DEFAULT_OBSERVER_SETTINGS[type].enabled).toBe(true);
      expect(DEFAULT_OBSERVER_SETTINGS[type].sensitivity).toBe(5);
    }
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
    expect(merged.sensitivity).toBe(5);
  });

  it("does not let an override for one type leak into another", () => {
    const settings = { response_length: { enabled: false } } as any;
    expect(settingsFor(settings, "response_length").enabled).toBe(false);
    expect(settingsFor(settings, "player_agency").enabled).toBe(true);
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
    expect(prompt).toContain("beyond what the player actually declared");
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
