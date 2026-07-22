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
  runObserver,
} from "../app/misc/observer";

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
});
