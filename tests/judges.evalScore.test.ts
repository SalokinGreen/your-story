/**
 * Scoring the judges on the labelled set (app/misc/judges/evalScore.ts): the
 * confusion counts, the denominated figures, the flag-only rule, the noise
 * rule and the cost table. Pure arithmetic; no model.
 */
import { describe, it, expect } from "vitest";
import {
  denominated,
  percentile,
  risesBeyondNoise,
  scoreJudges,
  summarizeCosts,
  type RunRecord,
  type RunSeverity,
  type RunVerdict,
} from "@/app/misc/judges/evalScore";
import type { JudgeFixture } from "@/app/misc/judges/evalFormat";
import type { JudgeId } from "@/app/misc/judges/types";

function fixture(id: string, labels: JudgeFixture["labels"]): JudgeFixture {
  return {
    v: 1,
    kind: "judge",
    id,
    published: true,
    storyBefore: { npcs: [], meters: [] },
    storyAfter: { npcs: [], meters: [] },
    toolResults: [],
    playerLine: "I open the door.",
    narration: "You open the door and the hinge shrieks twice.",
    labels,
  };
}

const AGENCY_SPAN = "You open the door and the hinge shrieks";

function record(
  fixtureId: string,
  run: number,
  agency: RunSeverity,
  evidence = "",
  extra: Partial<RunRecord> = {},
): RunRecord {
  const verdicts: Partial<Record<JudgeId, RunVerdict>> = { agency: { severity: agency, evidence } };
  return {
    fixtureId,
    mode: "combined",
    run,
    verdicts,
    turnKind: "clean",
    costUsd: 0.001,
    costUnknown: false,
    promptTokens: 100,
    completionTokens: 10,
    cachedTokens: 0,
    calls: 1,
    ms: 100,
    ...extra,
  };
}

const agencyOf = (scores: ReturnType<typeof scoreJudges>) => scores.find((s) => s.judge === "agency")!;

describe("scoreJudges", () => {
  const bad = fixture("bad", [{ judge: "agency", severity: "major", span: AGENCY_SPAN }]);
  const good = fixture("good", []);

  it("counts a located flag on a labelled turn as a true positive", () => {
    const s = agencyOf(scoreJudges([bad], [record("bad", 1, "major", AGENCY_SPAN)], "combined"));
    expect(s.any).toMatchObject({ tp: 1, fp: 0, fn: 0, tn: 0, precision: 1, recall: 1 });
  });

  it("counts a flag on a good turn as a false positive and a quiet good turn as a true negative", () => {
    const s = agencyOf(
      scoreJudges([good], [record("good", 1, "major", "anything at all here"), record("good", 2, "none")], "combined"),
    );
    expect(s.any).toMatchObject({ tp: 0, fp: 1, fn: 0, tn: 1, precision: 0, falseFlagRate: 0.5 });
  });

  it("counts a quiet labelled turn, an unreadable answer and a judge that did not run as misses", () => {
    const s = agencyOf(
      scoreJudges(
        [bad],
        [record("bad", 1, "none"), record("bad", 2, "unknown"), record("bad", 3, "not_run")],
        "combined",
      ),
    );
    expect(s.any).toMatchObject({ tp: 0, fn: 3, recall: 0, precision: null });
    expect(s.unknownRuns).toBe(1);
  });

  it("counts a flag that points somewhere else as both a false positive and a miss", () => {
    const s = agencyOf(scoreJudges([bad], [record("bad", 1, "major", "the quay was empty by then")], "combined"));
    expect(s.any).toMatchObject({ tp: 0, fp: 1, fn: 1 });
  });

  it("accepts a split-mode flag, which asks no quote, on the label alone", () => {
    const s = agencyOf(scoreJudges([bad], [{ ...record("bad", 1, "major", ""), mode: "split" }], "split"));
    expect(s.any.tp).toBe(1);
  });

  it("scores the major threshold apart from any flag", () => {
    const s = agencyOf(
      scoreJudges(
        [bad, good],
        [record("bad", 1, "minor", AGENCY_SPAN), record("good", 1, "minor", "some other words here")],
        "combined",
      ),
    );
    expect(s.any).toMatchObject({ tp: 1, fp: 1, precision: 0.5 });
    expect(s.major).toMatchObject({ tp: 0, fp: 0, fn: 1, precision: null });
  });

  it("ships flag-only below 0.7 precision at major, and not above", () => {
    const flaggedGood = (n: number) => Array.from({ length: n }, (_, i) => record("good", i + 1, "major", "some words that are not it"));
    const hits = Array.from({ length: 7 }, (_, i) => record("bad", i + 1, "major", AGENCY_SPAN));
    expect(agencyOf(scoreJudges([bad, good], [...hits, ...flaggedGood(4)], "combined")).shipsFlagOnly).toBe(true); // 7 of 11
    expect(agencyOf(scoreJudges([bad, good], [...hits, ...flaggedGood(3)], "combined")).shipsFlagOnly).toBe(false); // 7 of 10
    expect(agencyOf(scoreJudges([bad], [record("bad", 1, "none")], "combined")).shipsFlagOnly).toBeNull();
  });

  it("lists the failing runs per turn, worst first", () => {
    const s = agencyOf(
      scoreJudges(
        [bad, good],
        [record("bad", 1, "none"), record("bad", 2, "major", AGENCY_SPAN), record("good", 1, "major", "words not in it at all"), record("good", 2, "major", "words not in it at all")],
        "combined",
      ),
    );
    expect(s.cases.map((c) => [c.fixtureId, c.wrongRuns, c.runs])).toEqual([
      ["good", 2, 2],
      ["bad", 1, 2],
    ]);
  });

  it("scores the judges of the record only in the combined form", () => {
    const split = scoreJudges([bad], [], "split").map((s) => s.judge);
    expect(split).toEqual(["length", "agency", "outcome", "oracle_gap", "tier_gap"]);
    expect(scoreJudges([bad], [], "combined")).toHaveLength(8);
  });
});

describe("the figures stay denominated", () => {
  it("says what a count is out of", () => {
    expect(denominated(3, 20)).toBe("3 of 20 runs");
    expect(denominated(2, 9, "flagged runs")).toBe("2 of 9 flagged runs");
  });
});

describe("risesBeyondNoise", () => {
  it("needs more than 2 of 20, on two separate runs", () => {
    const base = { failing: 2, runs: 20 };
    expect(risesBeyondNoise(base, [{ failing: 5, runs: 20 }, { failing: 6, runs: 20 }])).toBe(true);
    expect(risesBeyondNoise(base, [{ failing: 5, runs: 20 }, { failing: 4, runs: 20 }])).toBe(false); // 4 is exactly 2 above
    expect(risesBeyondNoise(base, [{ failing: 9, runs: 20 }])).toBe(false); // only one run
  });

  it("compares rates when the run counts differ", () => {
    expect(risesBeyondNoise({ failing: 1, runs: 10 }, [{ failing: 5, runs: 20 }, { failing: 4, runs: 10 }])).toBe(true);
  });
});

describe("cost and latency", () => {
  it("takes nearest-rank percentiles", () => {
    expect(percentile([], 50)).toBeNull();
    expect(percentile([10, 20, 30, 40], 50)).toBe(20);
    expect(percentile([10, 20, 30, 40], 95)).toBe(40);
  });

  it("sums by turn kind and keeps an unpriced run visible", () => {
    const { total, byKind } = summarizeCosts([
      record("a", 1, "none", "", { costUsd: 0.01, ms: 100, turnKind: "clean" }),
      record("a", 2, "none", "", { costUsd: 0.02, ms: 300, turnKind: "clean", costUnknown: true }),
      record("a", 3, "none", "", { costUsd: 0.05, ms: 900, turnKind: "split", calls: 2 }),
    ]);
    expect(total.runs).toBe(3);
    expect(total.totalUsd).toBeCloseTo(0.08);
    expect(total.costUnknownRuns).toBe(1);
    expect(byKind.map((k) => [k.kind, k.runs])).toEqual([["clean", 2], ["split", 1]]);
    expect(byKind[0].p95Ms).toBe(300);
  });
});
