import type { ObserverFlagType } from "../structs";
import { JUDGE_FLAG_TYPE } from "./combined";
import type { JudgeId } from "./types";
import report from "@/evals/results.json";

/**
 * Judge layer v2, slice 5: what the last labelled run measured, for Settings.
 *
 * `evals/results.json` is written by `scripts/eval-judges.mjs --go` and bundled
 * at build time (a static import, so it works in the static export and the
 * native apps, which have no file system to read it from). A stub with no modes
 * ships until the author runs it; every reader here is defensive, so a missing,
 * empty or odd file yields no figures and Settings shows nothing.
 */
export interface MeasuredJudge {
  /** Precision at the severity that rewrites (a major flag), 0 to 1. */
  precision: number;
  /** Recall at that severity, when it could be told. */
  recall: number | null;
  /** How many runs the figures rest on. */
  runs: number;
  /** ISO time of the run. */
  generatedAt: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finiteOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Reads the measured figures out of a run summary. The combined form is the
 * one the app ships, so it wins over the split form when both were run.
 */
export function measuredPrecision(
  raw: unknown,
): Partial<Record<ObserverFlagType, MeasuredJudge>> {
  const out: Partial<Record<ObserverFlagType, MeasuredJudge>> = {};
  if (!isRecord(raw) || !Array.isArray(raw.modes)) return out;
  const generatedAt = typeof raw.generatedAt === "string" ? raw.generatedAt : null;
  const known = new Set<string>(Object.keys(JUDGE_FLAG_TYPE));
  const modes = raw.modes.filter(isRecord);
  // Split first, combined last, so the combined figure overwrites.
  modes.sort(
    (a, b) => (a.mode === "combined" ? 1 : 0) - (b.mode === "combined" ? 1 : 0),
  );
  for (const mode of modes) {
    if (!Array.isArray(mode.judges)) continue;
    for (const judge of mode.judges) {
      if (!isRecord(judge) || typeof judge.judge !== "string") continue;
      if (!known.has(judge.judge) || !isRecord(judge.major)) continue;
      const precision = finiteOrNull(judge.major.precision);
      if (precision === null || precision < 0 || precision > 1) continue;
      out[JUDGE_FLAG_TYPE[judge.judge as JudgeId]] = {
        precision,
        recall: finiteOrNull(judge.major.recall),
        runs: finiteOrNull(judge.totalRuns) ?? 0,
        generatedAt,
      };
    }
  }
  return out;
}

/** The bundled run's figures, per flag type. */
export const MEASURED_JUDGES: Readonly<
  Partial<Record<ObserverFlagType, MeasuredJudge>>
> = measuredPrecision(report);
