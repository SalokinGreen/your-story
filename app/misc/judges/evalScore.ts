/**
 * Scoring the judges against the labelled turn set (plan slice 4, design
 * section 7). Pure arithmetic over run records; no model, no clock, no files.
 *
 * Every figure is a count with its denominator ("3 failing runs of 20"), then a
 * rate for the table. The unit is one judge on one turn on one run:
 *
 * - **positive**: the turn carries a label for that judge;
 * - **flagged**: the judge answered minor or major (`any`), or major only
 *   (`major`, the severity that rewrites a turn);
 * - **true positive**: flagged on a positive turn, and the judge's quote
 *   overlaps a labelled span (a split-mode flag has no quote, so it is located
 *   by the label alone);
 * - **false positive**: flagged on a negative turn, or flagged on a positive
 *   turn but pointing somewhere else (that run is also a miss);
 * - **false negative**: a positive turn that was not flagged, including a judge
 *   that did not run, or whose answer could not be read ("unknown");
 * - **true negative**: a negative turn that was not flagged.
 *
 * A run is **wrong** when it is a false positive or a false negative. A case
 * "rises beyond noise" when its failing runs rise by more than 2 of 20 on two
 * separate runs (`risesBeyondNoise`).
 */
import { evidenceOverlaps } from "./confirm";
import { JUDGE_IDS } from "./combined";
import type { JudgeFixture } from "./evalFormat";
import type { JudgeId } from "./types";

export type EvalMode = "combined" | "split";

/** What a judge answered on one run; `not_run` means its precondition did not hold or the mode does not cover it. */
export type RunSeverity = "none" | "minor" | "major" | "unknown" | "not_run";

export interface RunVerdict {
  severity: RunSeverity;
  /** The judge's quote; empty in split mode, which asks no quote. */
  evidence: string;
}

/**
 * What kind of turn a run was, for the cost and latency table (plan finding 20).
 * The runner judges; it never confirms or rewrites, so those kinds are not here.
 */
export type TurnKind = "clean" | "flagged" | "split" | "failed" | "no_call";

export interface RunRecord {
  fixtureId: string;
  mode: EvalMode;
  /** 1-based. */
  run: number;
  verdicts: Partial<Record<JudgeId, RunVerdict>>;
  turnKind: TurnKind;
  costUsd: number;
  /** True when a call was sent whose cost the provider never reported, so costUsd is a floor. */
  costUnknown: boolean;
  promptTokens: number;
  completionTokens: number;
  cachedTokens: number;
  calls: number;
  /** Wall time from the first call to the last answer. */
  ms: number;
}

/** The judges the version-1 per-judge runner covers. The judges of the record are combined-only. */
export const SPLIT_JUDGES: readonly JudgeId[] = ["length", "agency", "outcome", "oracle_gap", "tier_gap"];

export function judgesCoveredBy(mode: EvalMode): readonly JudgeId[] {
  return mode === "split" ? SPLIT_JUDGES : JUDGE_IDS;
}

export type FlagThreshold = "any" | "major";

export interface Confusion {
  tp: number;
  fp: number;
  fn: number;
  tn: number;
  /** tp / (tp + fp); null when the judge never flagged. */
  precision: number | null;
  /** tp / (tp + fn); null when no turn carries a label for the judge. */
  recall: number | null;
  /** fp / (fp + tn); null when no turn is good for this judge. */
  falseFlagRate: number | null;
}

export interface CaseScore {
  fixtureId: string;
  positive: boolean;
  /** Runs that were a false positive or a false negative, of `runs`. */
  wrongRuns: number;
  runs: number;
}

export interface JudgeScore {
  judge: JudgeId;
  mode: EvalMode;
  /** Turns scored, and how many of them carry a label for this judge. */
  turns: number;
  positiveTurns: number;
  /** Runs where the answer could not be read. */
  unknownRuns: number;
  totalRuns: number;
  any: Confusion;
  major: Confusion;
  /** The per-turn failing-run counts at the `any` threshold, worst first. */
  cases: CaseScore[];
  /** Decision 233's rule: under 0.7 precision at the severity that rewrites, ship flag-only. Null when it cannot be told. */
  shipsFlagOnly: boolean | null;
}

export const FLAG_ONLY_PRECISION = 0.7;

function ratio(num: number, den: number): number | null {
  return den === 0 ? null : num / den;
}

function confusion(tp: number, fp: number, fn: number, tn: number): Confusion {
  return {
    tp,
    fp,
    fn,
    tn,
    precision: ratio(tp, tp + fp),
    recall: ratio(tp, tp + fn),
    falseFlagRate: ratio(fp, fp + tn),
  };
}

function flagged(v: RunVerdict | undefined, threshold: FlagThreshold): boolean {
  if (!v) return false;
  return threshold === "major" ? v.severity === "major" : v.severity === "major" || v.severity === "minor";
}

/** Whether a flagged run points at one of the turn's labelled problems for this judge. */
function located(v: RunVerdict, spans: readonly string[]): boolean {
  if (!v.evidence.trim()) return true; // split mode asks no quote: the label alone decides
  return spans.some((s) => evidenceOverlaps(v.evidence, s));
}

type Outcome = "tp" | "fp" | "fn" | "tn" | "fp_fn";

function outcomeOf(
  positive: boolean,
  v: RunVerdict | undefined,
  spans: readonly string[],
  threshold: FlagThreshold,
): Outcome {
  const isFlagged = flagged(v, threshold);
  if (!positive) return isFlagged ? "fp" : "tn";
  if (!isFlagged) return "fn";
  return located(v as RunVerdict, spans) ? "tp" : "fp_fn";
}

/**
 * Scores every judge the mode covers over the records of that mode. Turns with
 * no record are left out, so a partial run scores what it ran.
 */
export function scoreJudges(
  fixtures: readonly JudgeFixture[],
  records: readonly RunRecord[],
  mode: EvalMode,
): JudgeScore[] {
  const byFixture = new Map(fixtures.map((f) => [f.id, f] as const));
  const modeRecords = records.filter((r) => r.mode === mode && byFixture.has(r.fixtureId));
  const scores: JudgeScore[] = [];

  for (const judge of judgesCoveredBy(mode)) {
    const tally = { any: [0, 0, 0, 0], major: [0, 0, 0, 0] } as Record<FlagThreshold, number[]>;
    const perCase = new Map<string, CaseScore>();
    let unknownRuns = 0;
    let totalRuns = 0;

    for (const rec of modeRecords) {
      const fixture = byFixture.get(rec.fixtureId) as JudgeFixture;
      const spans = fixture.labels.filter((l) => l.judge === judge).map((l) => l.span);
      const positive = spans.length > 0;
      const verdict = rec.verdicts[judge];
      totalRuns += 1;
      if (verdict?.severity === "unknown") unknownRuns += 1;

      for (const threshold of ["any", "major"] as const) {
        const o = outcomeOf(positive, verdict, spans, threshold);
        const t = tally[threshold];
        if (o === "tp") t[0] += 1;
        else if (o === "fp") t[1] += 1;
        else if (o === "fn") t[2] += 1;
        else if (o === "tn") t[3] += 1;
        else {
          t[1] += 1;
          t[2] += 1;
        }
        if (threshold === "any") {
          const c = perCase.get(rec.fixtureId) ?? {
            fixtureId: rec.fixtureId,
            positive,
            wrongRuns: 0,
            runs: 0,
          };
          c.runs += 1;
          if (o !== "tp" && o !== "tn") c.wrongRuns += 1;
          perCase.set(rec.fixtureId, c);
        }
      }
    }

    const major = confusion(...(tally.major as [number, number, number, number]));
    scores.push({
      judge,
      mode,
      turns: perCase.size,
      positiveTurns: [...perCase.values()].filter((c) => c.positive).length,
      unknownRuns,
      totalRuns,
      any: confusion(...(tally.any as [number, number, number, number])),
      major,
      cases: [...perCase.values()].sort(
        (a, b) => b.wrongRuns / (b.runs || 1) - a.wrongRuns / (a.runs || 1) || a.fixtureId.localeCompare(b.fixtureId),
      ),
      shipsFlagOnly: major.precision === null ? null : major.precision < FLAG_ONLY_PRECISION,
    });
  }
  return scores;
}

/** "3 of 20 runs": a rate is never given without what it is a rate of. */
export function denominated(count: number, total: number, noun = "runs"): string {
  return `${count} of ${total} ${noun}`;
}

/**
 * Whether a case's failing runs rose beyond noise: more than 2 of 20 above the
 * baseline on two separate runs of the set. Rates are compared, so a different
 * number of runs per case scales (2 of 20 is 0.1).
 */
export function risesBeyondNoise(
  baseline: { failing: number; runs: number },
  later: readonly { failing: number; runs: number }[],
): boolean {
  if (baseline.runs <= 0) return false;
  const base = baseline.failing / baseline.runs;
  const risen = later.filter((l) => l.runs > 0 && l.failing / l.runs - base > 2 / 20 + 1e-9);
  return risen.length >= 2;
}

// ---------------------------------------------------------------------------
// Cost and latency
// ---------------------------------------------------------------------------

/** The value at a percentile by nearest rank; null for an empty list. */
export function percentile(values: readonly number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.max(1, Math.ceil((p / 100) * sorted.length));
  return sorted[Math.min(sorted.length, rank) - 1];
}

export interface KindCost {
  kind: TurnKind;
  runs: number;
  totalUsd: number;
  /** Runs whose cost the provider did not report: the total is a floor. */
  costUnknownRuns: number;
  promptTokens: number;
  completionTokens: number;
  cachedTokens: number;
  calls: number;
  p50Ms: number | null;
  p95Ms: number | null;
}

const KIND_ORDER: readonly TurnKind[] = ["clean", "flagged", "split", "failed", "no_call"];

export function summarizeCosts(records: readonly RunRecord[]): {
  total: Omit<KindCost, "kind">;
  byKind: KindCost[];
} {
  const summarize = (kind: TurnKind, rs: readonly RunRecord[]): KindCost => ({
    kind,
    ...totals(rs),
  });
  const totals = (rs: readonly RunRecord[]): Omit<KindCost, "kind"> => ({
    runs: rs.length,
    totalUsd: rs.reduce((s, r) => s + r.costUsd, 0),
    costUnknownRuns: rs.filter((r) => r.costUnknown).length,
    promptTokens: rs.reduce((s, r) => s + r.promptTokens, 0),
    completionTokens: rs.reduce((s, r) => s + r.completionTokens, 0),
    cachedTokens: rs.reduce((s, r) => s + r.cachedTokens, 0),
    calls: rs.reduce((s, r) => s + r.calls, 0),
    p50Ms: percentile(rs.map((r) => r.ms), 50),
    p95Ms: percentile(rs.map((r) => r.ms), 95),
  });
  return {
    total: totals(records),
    byKind: KIND_ORDER.map((k) => summarize(k, records.filter((r) => r.turnKind === k))).filter((k) => k.runs > 0),
  };
}
