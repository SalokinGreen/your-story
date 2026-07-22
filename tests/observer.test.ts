/**
 * Layer 5 hardening, active variant: checkResponseLength is deterministic
 * (same PACING_BANDS pacingFeedback.ts already uses, just applied to a
 * single turn instead of a trailing average). checkPlayerAgencyViolation
 * and runObserver hit /api/generate - mocked the same way reflection.test.ts
 * mocks callReflectionApi's fetch call.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  checkResponseLength,
  checkPlayerAgencyViolation,
  checkOutcomeMismatch,
  checkToolUsageGaps,
  runObserver,
  buildObserverWarningNote,
  rewriteFlaggedNarration,
  settingsFor,
  DEFAULT_OBSERVER_SETTINGS,
  ObserverCheckSettings,
} from "../app/misc/observer";
import type { ObserverFlag } from "../app/misc/structs";

function checkSettings(overrides: Partial<ObserverCheckSettings> = {}): ObserverCheckSettings {
  return { enabled: true, triggersReset: true, sensitivity: 5, ...overrides };
}

describe("checkResponseLength", () => {
  it("does not flag narration within the reply-length ceiling", () => {
    const narration = "You duck behind the crate as the guard's light sweeps past.";
    expect(checkResponseLength(narration, "short")).toBeNull();
  });

  it("does not flag empty narration", () => {
    expect(checkResponseLength("", "medium")).toBeNull();
    expect(checkResponseLength("   ", "medium")).toBeNull();
  });

  it("flags a single turn that blows way past the medium ceiling", () => {
    // PACING_BANDS.medium.high = 170, multiplier = 2 -> ceiling 340.
    const narration = Array(400).fill("word").join(" ");
    const flag = checkResponseLength(narration, "medium");
    expect(flag).not.toBeNull();
    expect(flag?.type).toBe("response_length");
    expect(flag?.severity).toBe("major");
    expect(flag?.detail).toContain("400 words");
  });

  it("does not flag a turn that's long but still under the hard ceiling", () => {
    // Under 2x the "long" band's high (300), e.g. a legitimate climax beat.
    const narration = Array(280).fill("word").join(" ");
    expect(checkResponseLength(narration, "long")).toBeNull();
  });

  it("scales the ceiling to the short reply-length setting", () => {
    // PACING_BANDS.short.high = 85, multiplier = 2 -> ceiling 170.
    const narration = Array(200).fill("word").join(" ");
    const flag = checkResponseLength(narration, "short");
    expect(flag).not.toBeNull();
    expect(flag?.detail).toContain("~85 words");
  });

  it("does not flag anything when disabled, even a huge blowout", () => {
    const narration = Array(1000).fill("word").join(" ");
    expect(
      checkResponseLength(narration, "medium", checkSettings({ enabled: false })),
    ).toBeNull();
  });

  it("higher sensitivity flags a smaller overage", () => {
    // PACING_BANDS.medium.high = 170. At sensitivity 5 (default) the
    // ceiling is 2x = 340, so 250 words doesn't flag; at sensitivity 10
    // the multiplier drops to 1x = 170, so the same 250 words should flag.
    const narration = Array(250).fill("word").join(" ");
    expect(
      checkResponseLength(narration, "medium", checkSettings({ sensitivity: 5 })),
    ).toBeNull();
    expect(
      checkResponseLength(narration, "medium", checkSettings({ sensitivity: 10 })),
    ).not.toBeNull();
  });

  it("lower sensitivity requires a bigger overage to flag", () => {
    // At sensitivity 0 the multiplier is 3x = 510 - 400 words shouldn't
    // flag even though it would at the default sensitivity of 5 (2x = 340).
    const narration = Array(400).fill("word").join(" ");
    expect(
      checkResponseLength(narration, "medium", checkSettings({ sensitivity: 5 })),
    ).not.toBeNull();
    expect(
      checkResponseLength(narration, "medium", checkSettings({ sensitivity: 0 })),
    ).toBeNull();
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
          toolName: "formula_roll",
          success: false,
          contextForStory: "[Athletics: 8 vs DC 15 -> FAILURE]",
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
      [{ toolName: "formula_roll", success: false, contextForStory: "FAILURE" }],
      { model: "test-model", token: "tok" },
    );

    expect(flag).toBeNull();
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
        { toolName: "formula_roll", success: false, contextForStory: "first: FAILURE" },
        { toolName: "formula_roll", success: true, contextForStory: "second: SUCCESS" },
      ],
      { model: "test-model", token: "tok" },
    );

    const sentBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    const userMessage = sentBody.messages[1].content;
    expect(userMessage).toContain("SUCCESS");
    expect(userMessage).toContain("second: SUCCESS");
  });

  it("fails open (returns null) when the API call errors", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("network down"));
    global.fetch = fetchMock as unknown as typeof fetch;

    const flag = await checkOutcomeMismatch(
      "Something happens.",
      [{ toolName: "npc_roll", success: true, contextForStory: "SUCCESS" }],
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
