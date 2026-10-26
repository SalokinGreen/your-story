/**
 * The model reading behind a "judge" turn-end check (GM prompt plan slice 5,
 * app/misc/judges/turnEndJudge.ts): the reply parser, the call's failure
 * modes, the evaluator's use of the answer and the off-by-default switch. The judge call itself is mocked; no
 * model is called.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";

const sideCallMock = vi.hoisted(() => vi.fn());

vi.mock("@/app/misc/sideModelCall", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/app/misc/sideModelCall")>();
  return { ...actual, callSideModel: sideCallMock };
});

import {
  askTurnEndJudge,
  buildTurnEndJudgePrompt,
  parseTurnEndAnswer,
  TURN_END_JUDGE_SYSTEM,
} from "@/app/misc/judges/turnEndJudge";
import {
  isTurnEndJudgeEnabled,
  judgeChecksToAsk,
  pendingCheck,
  TURN_END_JUDGE_KEY,
} from "@/app/misc/turnEndChecks";
import { NIGHT_ENDED_CHECK } from "@/app/misc/systems/blood-and-bone/turnEndChecks";
import { BLOOD_AND_BONE } from "@/app/misc/systems/blood-and-bone";

const SYSTEM = { turnEndChecks: [NIGHT_ENDED_CHECK] };
const prose = "Pale light creeps over the rooftops and the bells begin to ring.";
const input = { gmProse: prose, playerLines: ["I keep watch"] };

describe("parseTurnEndAnswer", () => {
  it("trusts a yes only with a quote that is in the text", () => {
    const ok = parseTurnEndAnswer(
      JSON.stringify({ reasoning: "r", answer: "yes", quote: "Pale light creeps over the rooftops" }),
      input,
    );
    expect(ok.answer).toBe("yes");
    expect(
      parseTurnEndAnswer(JSON.stringify({ answer: "yes", quote: "The sun blazes" }), input).answer,
    ).toBe("unknown");
    expect(parseTurnEndAnswer(JSON.stringify({ answer: "yes" }), input).answer).toBe("unknown");
  });
  it("reads no, and treats anything else as unknown", () => {
    expect(parseTurnEndAnswer('```json\n{"answer":"no","quote":""}\n```', input).answer).toBe("no");
    expect(parseTurnEndAnswer("maybe", input).answer).toBe("unknown");
    expect(parseTurnEndAnswer(JSON.stringify({ answer: "perhaps" }), input).answer).toBe("unknown");
  });
  it("accepts a quote from the player's line", () => {
    const r = parseTurnEndAnswer(
      JSON.stringify({ answer: "yes", quote: "I sleep until dusk" }),
      { gmProse: "The inn is quiet.", playerLines: ["I sleep until dusk"] },
    );
    expect(r.answer).toBe("yes");
  });
});

describe("an unsettled text", () => {
  it("is unknown, not no, so the phrase table decides", () => {
    expect(TURN_END_JUDGE_SYSTEM).toContain('answer "unknown"');
    expect(parseTurnEndAnswer(JSON.stringify({ answer: "unknown", quote: "" }), input).answer).toBe("unknown");
  });
});

describe("askTurnEndJudge", () => {
  beforeEach(() => sideCallMock.mockReset());
  const api = { model: "m", reasoningEffort: "none" as const };
  const ask = () => askTurnEndJudge({ question: "q", ...input }, api);

  it("sends one call with an explicit effort and temperature 0", async () => {
    sideCallMock.mockResolvedValue({
      ok: true,
      data: { content: JSON.stringify({ answer: "no", quote: "" }) },
    });
    expect((await ask()).answer).toBe("no");
    expect(sideCallMock).toHaveBeenCalledTimes(1);
    const req = sideCallMock.mock.calls[0][0];
    expect(req.reasoningEffort).toBe("none");
    expect(req.temperature).toBe(0);
    expect(req.messages[0].content).toBe(TURN_END_JUDGE_SYSTEM);
    expect(req.messages[1].content).toContain("Question: q");
  });
  it("a failed call, an empty reply and a thrown error are unknown, never a yes", async () => {
    sideCallMock.mockResolvedValueOnce({ ok: false, error: "boom" });
    expect((await ask()).answer).toBe("unknown");
    sideCallMock.mockResolvedValueOnce({ ok: true, data: { content: "" } });
    expect((await ask()).answer).toBe("unknown");
    sideCallMock.mockRejectedValueOnce(new Error("network"));
    expect((await ask()).answer).toBe("unknown");
  });
  it("lets a Stop pass through", async () => {
    const abort = Object.assign(new Error("aborted"), { name: "AbortError" });
    sideCallMock.mockRejectedValueOnce(abort);
    await expect(ask()).rejects.toBe(abort);
  });
  it("builds a prompt with the question, the player's line and the text", () => {
    const p = buildTurnEndJudgePrompt({ question: "Did it end?", ...input });
    expect(p).toContain("Did it end?");
    expect(p).toContain("I keep watch");
    expect(p).toContain(prose);
  });
});

describe("the evaluator with a judge reading", () => {
  const turn = (judged?: Parameters<typeof pendingCheck>[1]["judged"], gmProse = prose) => ({
    text: { gmProse, playerLines: [] as string[] },
    results: [],
    prompted: new Set<string>(),
    judged,
  });
  it("night-ended declares a judge trigger and keeps its phrase table and message", () => {
    expect(NIGHT_ENDED_CHECK.trigger.kind).toBe("judge");
    expect(NIGHT_ENDED_CHECK.trigger.question).toMatch(/night end/i);
    expect(NIGHT_ENDED_CHECK.trigger.phrases.length).toBeGreaterThan(5);
    expect(NIGHT_ENDED_CHECK.message).toContain("The text may say the night ended this turn");
    expect(BLOOD_AND_BONE.turnEndChecks).toContain(NIGHT_ENDED_CHECK);
  });
  it("yes makes it pending even with no phrase; no clears it even with a phrase", () => {
    expect(pendingCheck(SYSTEM, turn({ "night-ended": { answer: "yes", quote: "Pale light" } }))).not.toBeNull();
    expect(
      pendingCheck(SYSTEM, turn({ "night-ended": { answer: "no" } }, "Dawn breaks over the cemetery.")),
    ).toBeNull();
  });
  it("unknown or absent falls back to the phrase table", () => {
    const dawn = "Dawn breaks over the cemetery.";
    expect(pendingCheck(SYSTEM, turn({ "night-ended": { answer: "unknown" } }, dawn))).not.toBeNull();
    expect(pendingCheck(SYSTEM, turn(undefined, dawn))).not.toBeNull();
    expect(pendingCheck(SYSTEM, turn({ "night-ended": { answer: "unknown" } }, prose))).toBeNull();
  });
  it("a yes still yields to a satisfied tool, the previous turn and the prompted set", () => {
    const judged = { "night-ended": { answer: "yes" as const, quote: "x" } };
    expect(
      pendingCheck(SYSTEM, {
        ...turn(judged),
        results: [{ toolName: "end_session", success: true, result: { type: "end_session" } }],
      }),
    ).toBeNull();
    expect(pendingCheck(SYSTEM, { ...turn(judged), prompted: new Set(["night-ended"]) })).toBeNull();
  });
});

describe("the switch and the questions to ask", () => {
  afterEach(() => vi.unstubAllGlobals());
  const base = { text: { gmProse: prose, playerLines: [] as string[] }, results: [], prompted: new Set<string>() };

  it("is off by default and on only for the stored value on", () => {
    expect(isTurnEndJudgeEnabled()).toBe(false);
    vi.stubGlobal("localStorage", { getItem: (k: string) => (k === TURN_END_JUDGE_KEY ? "on" : null) });
    expect(isTurnEndJudgeEnabled()).toBe(true);
    vi.stubGlobal("localStorage", { getItem: () => "off" });
    expect(isTurnEndJudgeEnabled()).toBe(false);
  });
  it("asks nothing while off, and the judge checks when on", () => {
    expect(judgeChecksToAsk(SYSTEM, base, false)).toEqual([]);
    expect(judgeChecksToAsk(SYSTEM, base, true).map((c) => c.id)).toEqual(["night-ended"]);
  });
  it("asks nothing for a prompted or satisfied check or an empty turn", () => {
    expect(judgeChecksToAsk(SYSTEM, { ...base, prompted: new Set(["night-ended"]) }, true)).toEqual([]);
    expect(
      judgeChecksToAsk(
        SYSTEM,
        { ...base, results: [{ toolName: "end_session", success: true, result: { type: "end_session" } }] },
        true,
      ),
    ).toEqual([]);
    expect(judgeChecksToAsk(SYSTEM, { ...base, text: { gmProse: " ", playerLines: [] } }, true)).toEqual([]);
  });
});

