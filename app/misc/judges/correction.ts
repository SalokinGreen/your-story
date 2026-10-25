/**
 * The correction of a judged turn: confirm, then rewrite (docs/judge-layer-v2-design.md
 * 11.1, plan slice 3). The one place the end-of-turn pass and the pass before a
 * pause both go through, so every rewrite is gated the same way:
 *
 *   major flags -> up to two confirmed by a judge of another family
 *               -> ONE rewrite, handed every confirmed finding and its facts
 *               -> re-checked (the fix plan, validateRewriteResponse, rung 1)
 *
 * Whatever is not confirmed, or whose rewrite fails a check, stays a flag, and
 * the caller releases the original text with it. Nothing here re-runs a tool or
 * a die.
 */
import type { ObserverFlag, ObserverFlagType } from "../structs";
import {
  getRewriteConfirmModel,
  REWRITE_CONFIRM_DEFAULT_MODEL_KEY,
} from "../layerSettings";
import {
  judgeTurnFor,
  rewriteFlaggedNarration,
  type ObserverApiOptions,
  type ObserverParams,
  type RewriteNarrationParams,
} from "../observer";
import { confirmMajorFlags } from "./confirm";
import type { ConfirmedFinding } from "./types";

export type CorrectionRewriteParams = Pick<
  RewriteNarrationParams,
  | "playerChoice"
  | "replyLength"
  | "storytellerMode"
  | "characterContext"
  | "narrationContext"
  | "narrationThoughts"
  | "gmStoryContext"
  | "deAiifyWords"
  | "alreadyRead"
  | "endsAtPause"
>;

export interface CorrectionArgs {
  flags: readonly ObserverFlag[];
  rewritable: ReadonlySet<ObserverFlagType>;
  /** What the judges read (narration, facts, settings): the confirming judge reads it too. */
  judged: ObserverParams;
  /** The first judge's call options; the confirming call carries its keys and cost turn. */
  judgeApi: ObserverApiOptions;
  rewriteApi: ObserverApiOptions;
  hiddenRefs: ReadonlySet<string>;
  rewrite: CorrectionRewriteParams;
  recheck: (rewritten: string) => string | null;
}

export interface CorrectionResult {
  /** The new text, or null: nothing confirmed, or the rewrite failed a check. */
  rewritten: string | null;
  /** The findings two families agreed on (the ones the rewrite addressed). */
  confirmed: ConfirmedFinding[];
  skipped?: string;
}

export async function confirmAndRewrite(args: CorrectionArgs): Promise<CorrectionResult> {
  const pick = getRewriteConfirmModel();
  const run = await confirmMajorFlags({
    flags: args.flags,
    settings: args.judged.settings,
    rewritable: args.rewritable,
    turn: judgeTurnFor(args.judged),
    judgeModel: args.judgeApi.model,
    base: args.judgeApi,
    pick,
    fallbackModel: REWRITE_CONFIRM_DEFAULT_MODEL_KEY,
    hiddenRefs: args.hiddenRefs,
  });
  if (run.confirmed.length === 0) {
    return { rewritten: null, confirmed: [], skipped: run.skipped };
  }
  const rewritten = await rewriteFlaggedNarration({
    ...args.rewrite,
    narration: args.judged.narration,
    flag: run.confirmed[0].flag,
    findings: run.confirmed,
    recheck: args.recheck,
    apiOptions: args.rewriteApi,
  });
  return { rewritten, confirmed: run.confirmed };
}
