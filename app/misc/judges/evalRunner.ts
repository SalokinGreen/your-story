/**
 * The judge eval runner (plan slice 4): runs the judges over the labelled turn
 * set and scores them (evalScore.ts). `scripts/eval-judges.mjs` is its command
 * line; the tests drive it with a mocked provider.
 *
 * **Every call here is a real model call on the caller's keys**, so nothing in
 * the app imports this file, CI never runs it, and the script makes no call
 * without `--go` (the author's go is the rule, CLAUDE.md "Verification").
 *
 * Two forms are run on each turn:
 * - **combined**, the shipped form: `runCombinedJudges`, one call (or two);
 * - **split**, the version-1 form kept for this comparison: `runObserverSplit`,
 *   one call per judge. It covers five of the eight judges; the judges of the
 *   record exist only in the combined form.
 *
 * Calls go through `callSideModel`, so the cost ledger bills each run: every
 * run opens its own ledger turn and reads it straight back.
 */
import {
  judgeTurnFor,
  runObserverSplit,
  type ObserverApiOptions,
} from "../observer";
import { JUDGE_IDS, JUDGE_FLAG_TYPE, planCalls, runCombinedJudges, selectJudges } from "./combined";
import { observerParamsFor, type JudgeFixture } from "./evalFormat";
import {
  FLAG_ONLY_PRECISION,
  SPLIT_JUDGES,
  denominated,
  judgesCoveredBy,
  scoreJudges,
  summarizeCosts,
  type EvalMode,
  type JudgeScore,
  type KindCost,
  type RunRecord,
  type RunVerdict,
  type TurnKind,
} from "./evalScore";
import { beginTurnCost, getTurnCostReport } from "../turnCost";
import type { JudgeId } from "./types";

export const DEFAULT_RUNS = 20;
export const MAX_CONCURRENCY = 8; // the cost ledger keeps twelve turns open at most

export interface EvalOptions {
  fixtures: readonly JudgeFixture[];
  modes: readonly EvalMode[];
  /** Runs per turn and mode. */
  runs: number;
  /** The model, keys and effort the judges run on (the side-agent default, as shipped). */
  apiOptions: Omit<ObserverApiOptions, "costTurnId">;
  concurrency?: number;
  /** Wall clock in ms; injectable so a test is deterministic. */
  now?: () => number;
  onProgress?: (done: number, total: number) => void;
}

function emptyVerdicts(): Partial<Record<JudgeId, RunVerdict>> {
  const out: Partial<Record<JudgeId, RunVerdict>> = {};
  for (const id of JUDGE_IDS) out[id] = { severity: "not_run", evidence: "" };
  return out;
}

/** One run of one form on one turn, billed to its own ledger turn. */
export async function runFixtureOnce(
  fixture: JudgeFixture,
  mode: EvalMode,
  run: number,
  apiOptions: Omit<ObserverApiOptions, "costTurnId">,
  now: () => number = Date.now,
): Promise<RunRecord> {
  const costTurnId = beginTurnCost();
  const options: ObserverApiOptions = { ...apiOptions, costTurnId };
  const params = observerParamsFor(fixture, options);
  const verdicts = emptyVerdicts();
  const started = now();
  let turnKind: TurnKind;

  if (mode === "combined") {
    const result = await runCombinedJudges(judgeTurnFor(params), options);
    for (const id of result.ran) {
      const v = result.verdicts[id];
      verdicts[id] = v
        ? { severity: v.severity, evidence: v.severity === "minor" || v.severity === "major" ? v.evidence : "" }
        : { severity: "unknown", evidence: "" };
    }
    const answered = result.ran.map((id) => verdicts[id]?.severity);
    if (result.ran.length === 0) turnKind = "no_call";
    else if (answered.every((s) => s === "unknown")) turnKind = "failed";
    else if (answered.some((s) => s === "minor" || s === "major")) turnKind = "flagged";
    else turnKind = result.calls > 1 ? "split" : "clean";
    // A flagged turn that also took two calls is still reported as flagged; the
    // call count is in the record.
    if (result.calls > 1 && turnKind === "flagged") turnKind = "split";
  } else {
    const flags = await runObserverSplit(params);
    for (const id of SPLIT_JUDGES) verdicts[id] = { severity: "none", evidence: "" };
    for (const flag of flags) {
      const judge = SPLIT_JUDGES.find((id) => JUDGE_FLAG_TYPE[id] === flag.type);
      if (judge) verdicts[judge] = { severity: flag.severity, evidence: "" };
    }
    turnKind = flags.some((f) => SPLIT_JUDGES.some((id) => JUDGE_FLAG_TYPE[id] === f.type))
      ? "flagged"
      : "clean";
  }
  const ms = Math.max(0, now() - started);

  const ledger = getTurnCostReport(costTurnId);
  if (ledger && ledger.calls === 0 && turnKind === "clean") turnKind = "no_call";
  return {
    fixtureId: fixture.id,
    mode,
    run,
    verdicts,
    turnKind,
    costUsd: ledger?.totalUsd ?? 0,
    costUnknown: ledger?.hasUnpricedCalls ?? false,
    promptTokens: ledger?.promptTokens ?? 0,
    completionTokens: ledger?.completionTokens ?? 0,
    cachedTokens: ledger?.cachedTokens ?? 0,
    calls: ledger?.calls ?? 0,
    ms,
  };
}

/** Runs every turn, every requested form, `runs` times; records come back in a fixed order. */
export async function runEval(options: EvalOptions): Promise<RunRecord[]> {
  const concurrency = Math.max(1, Math.min(options.concurrency ?? 4, MAX_CONCURRENCY));
  const now = options.now ?? Date.now;
  const tasks: { fixture: JudgeFixture; mode: EvalMode; run: number }[] = [];
  for (const mode of options.modes) {
    for (const fixture of options.fixtures) {
      for (let run = 1; run <= options.runs; run++) tasks.push({ fixture, mode, run });
    }
  }
  const records: RunRecord[] = [];
  let next = 0;
  let done = 0;
  const worker = async () => {
    while (next < tasks.length) {
      const task = tasks[next++];
      records.push(await runFixtureOnce(task.fixture, task.mode, task.run, options.apiOptions, now));
      done += 1;
      options.onProgress?.(done, tasks.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, worker));
  return records.sort(
    (a, b) =>
      a.mode.localeCompare(b.mode) || a.fixtureId.localeCompare(b.fixtureId) || a.run - b.run,
  );
}

/**
 * How many calls a run makes, without making any: the combined form's calls
 * are known from the preconditions; the split form's are at most one per
 * covered judge. For the script's dry run and its confirmation line.
 */
export function estimateCalls(
  fixture: JudgeFixture,
  mode: EvalMode,
): { min: number; max: number } {
  if (mode === "split") return { min: 0, max: SPLIT_JUDGES.length };
  const params = observerParamsFor(fixture, { model: "", token: null });
  const turn = judgeTurnFor(params);
  const n = planCalls(selectJudges(turn), turn.facts).length;
  return { min: n, max: n };
}

// ---------------------------------------------------------------------------
// The report
// ---------------------------------------------------------------------------

export interface ModeReport {
  mode: EvalMode;
  judges: JudgeScore[];
  total: Omit<KindCost, "kind">;
  byKind: KindCost[];
}

export interface EvalReport {
  v: 1;
  generatedAt: string;
  model: string;
  effort: string | undefined;
  runsPerTurn: number;
  turns: number;
  /** Turns the author has not published: counted, never named in a committed report. */
  privateTurns: number;
  modes: ModeReport[];
}

/**
 * The summary a run writes to `evals/results.json`. A turn that is not
 * published is counted but never named, so the file is safe to commit.
 */
export function buildReport(
  fixtures: readonly JudgeFixture[],
  records: readonly RunRecord[],
  meta: { model: string; effort: string | undefined; runs: number; generatedAt: string },
): EvalReport {
  const published = new Set(fixtures.filter((f) => f.published).map((f) => f.id));
  const modes = [...new Set(records.map((r) => r.mode))].sort() as EvalMode[];
  return {
    v: 1,
    generatedAt: meta.generatedAt,
    model: meta.model,
    effort: meta.effort,
    runsPerTurn: meta.runs,
    turns: fixtures.length,
    privateTurns: fixtures.length - published.size,
    modes: modes.map((mode) => {
      const modeRecords = records.filter((r) => r.mode === mode);
      const cost = summarizeCosts(modeRecords);
      return {
        mode,
        judges: scoreJudges(fixtures, modeRecords, mode).map((j) => ({
          ...j,
          cases: j.cases.filter((c) => published.has(c.fixtureId)),
        })),
        total: cost.total,
        byKind: cost.byKind,
      };
    }),
  };
}

function pct(x: number | null): string {
  return x === null ? "n/a" : x.toFixed(2);
}

function usd(x: number): string {
  return `$${x.toFixed(4)}`;
}

/** The report as the text the script prints. */
export function formatReport(report: EvalReport): string {
  const lines: string[] = [];
  lines.push(
    `Judge eval - ${report.turns} turns (${report.privateTurns} private), ${report.runsPerTurn} runs each, ${report.model}${report.effort ? ` (effort ${report.effort})` : ""}`,
  );
  for (const m of report.modes) {
    lines.push("", `== ${m.mode} form ==`);
    lines.push("judge              precision(any/major)  recall(any)  false-flag(any)  unreadable        ships");
    for (const j of m.judges) {
      const wrongTurns = j.cases.filter((c) => c.wrongRuns > 0);
      lines.push(
        `${j.judge.padEnd(18)} ${`${pct(j.any.precision)}/${pct(j.major.precision)}`.padEnd(21)} ${pct(j.any.recall).padEnd(12)} ${pct(j.any.falseFlagRate).padEnd(16)} ${denominated(j.unknownRuns, j.totalRuns).padEnd(17)} ${
          j.shipsFlagOnly === null ? "n/a" : j.shipsFlagOnly ? `flag-only (<${FLAG_ONLY_PRECISION})` : "rewrite ok"
        }`,
      );
      lines.push(
        `  tp ${j.any.tp}  fp ${j.any.fp}  fn ${j.any.fn}  tn ${j.any.tn}   (${denominated(j.any.tp + j.any.fp, j.totalRuns, "flagged runs")}, ${j.positiveTurns} of ${j.turns} turns labelled)`,
      );
      for (const c of wrongTurns.slice(0, 5)) {
        lines.push(`    ${c.fixtureId}: ${c.wrongRuns} failing runs of ${c.runs}`);
      }
    }
    lines.push(
      "",
      `cost ${usd(m.total.totalUsd)} over ${m.total.runs} runs, ${m.total.calls} calls, ${m.total.promptTokens} prompt (${m.total.cachedTokens} cached) + ${m.total.completionTokens} completion tokens${m.total.costUnknownRuns > 0 ? `; ${m.total.costUnknownRuns} runs unpriced, so a floor` : ""}`,
    );
    for (const k of m.byKind) {
      lines.push(
        `  ${k.kind.padEnd(8)} ${String(k.runs).padStart(5)} runs  ${usd(k.totalUsd)}  p50 ${k.p50Ms ?? "n/a"} ms  p95 ${k.p95Ms ?? "n/a"} ms`,
      );
    }
  }
  const combined = report.modes.find((m) => m.mode === "combined");
  const split = report.modes.find((m) => m.mode === "split");
  if (combined && split) {
    lines.push("", "== combined against split (judges both cover) ==");
    for (const id of judgesCoveredBy("split")) {
      const c = combined.judges.find((j) => j.judge === id);
      const s = split.judges.find((j) => j.judge === id);
      if (!c || !s) continue;
      lines.push(
        `${id.padEnd(18)} precision ${pct(c.any.precision)} vs ${pct(s.any.precision)}   recall ${pct(c.any.recall)} vs ${pct(s.any.recall)}`,
      );
    }
    lines.push(
      `cost ${usd(combined.total.totalUsd)} vs ${usd(split.total.totalUsd)}   p95 ${combined.total.p95Ms ?? "n/a"} vs ${split.total.p95Ms ?? "n/a"} ms`,
    );
  }
  return lines.join("\n");
}
