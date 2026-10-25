/**
 * Rung 4 of the judge ladder, the gate before a rewrite (docs/judge-layer-v2-design.md
 * section 2 and 11.5, decision 228, plan slice 3).
 *
 * A rung-3 judge saying "major" is not enough to replace prose the player has
 * not read: a judge favours its own family's writing, and a rewrite given only
 * an opinion often makes text worse. So before a rewrite a second judge, from
 * another model family, is asked the same rubric for that one finding
 * (`confirmFinding`, the combined call's own `callJudges` with one judge). It
 * agrees when it also says major and its quote overlaps the first judge's.
 *
 * What this file decides:
 * - which model confirms (`resolveConfirmModel`): the player's pick, GLM 5.3 by
 *   default; no key for it means no rewrite, and a pick of the first judge's own
 *   family is refused, naming the family. The finding then stays a flag.
 * - how many are confirmed: the two highest-priority rewritable majors
 *   (`MAX_CONFIRMATIONS`), run together; the rest stay flags.
 * - what facts the rewrite is handed (`rewriterFactsFor`): only those the
 *   finding cites, never a secret's truth, a clock or a hidden roll. The
 *   confirming judge sees what the first judge saw; the rewriter sees less.
 *
 * A confirmation that fails, cannot be read or is cancelled-then-not is
 * "unknown": never a rewrite. A Stop (AbortError) passes through.
 */
import type { ObserverFlag, ObserverFlagType } from "../structs";
import { logger } from "../logger";
import {
  confirmModelFamily,
  hasKeyForModel,
  isKnownModelKey,
  resolveModelKeyAlias,
} from "../ai_prices";
import { canRunClaudeCliModel, isClaudeCliModel } from "../claudeCliModels";
import { publicSummary } from "../turnTimeline";
import type { ObserverApiOptions, ObserverSettings } from "../observer";
import type { ProviderKeys } from "../sideModelCall";
import type { ReasoningEffort } from "../reasoningTiers";
import {
  JUDGE_FLAG_TYPE,
  callJudges,
  majorFlagsInOrder,
  type JudgeTurn,
} from "./combined";
import type {
  ConfirmedFinding,
  Fact,
  FactTopic,
  JudgeId,
  JudgeToolResult,
} from "./types";

/** Per turn, at most this many findings are confirmed (design 11.5). */
export const MAX_CONFIRMATIONS = 2;

// ---------------------------------------------------------------------------
// Which model confirms
// ---------------------------------------------------------------------------

export type ConfirmModelResolution =
  | { ok: true; model: string; reasoningEffort: ReasoningEffort; family: string }
  | {
      ok: false;
      reason: "no_key" | "cannot_run" | "same_family";
      model: string;
      family?: string;
    };

/**
 * The confirming model for this turn. `pick` is the player's choice (or the
 * default, `getRewriteConfirmModel`), `judgeModel` the model the first judge
 * ran on, `keys` the provider keys the call would carry.
 */
export function resolveConfirmModel(args: {
  judgeModel: string;
  keys: ProviderKeys;
  pick: { model: string; reasoningEffort: ReasoningEffort };
  fallbackModel: string;
}): ConfirmModelResolution {
  // A saved pick the catalog dropped reads as unset, as every saved choice does.
  const model = isKnownModelKey(args.pick.model)
    ? resolveModelKeyAlias(args.pick.model)
    : args.fallbackModel;
  if (isClaudeCliModel(model)) {
    if (!canRunClaudeCliModel()) return { ok: false, reason: "cannot_run", model };
  } else if (!hasKeyForModel(model, args.keys)) {
    return { ok: false, reason: "no_key", model };
  }
  const family = confirmModelFamily(model);
  if (family === confirmModelFamily(args.judgeModel)) {
    return { ok: false, reason: "same_family", model, family };
  }
  return { ok: true, model, reasoningEffort: args.pick.reasoningEffort, family };
}

// ---------------------------------------------------------------------------
// Agreement
// ---------------------------------------------------------------------------

function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[‘’‛]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[^\p{L}\p{N}']+/gu, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
}

/** Two quotes overlap when one holds the other, or they share a run of three words. */
export function evidenceOverlaps(a: string, b: string): boolean {
  const wa = words(a);
  const wb = words(b);
  if (wa.length === 0 || wb.length === 0) return false;
  const run = Math.min(3, wa.length, wb.length);
  const grams = new Set<string>();
  for (let i = 0; i + run <= wa.length; i++) grams.add(wa.slice(i, i + run).join(" "));
  for (let i = 0; i + run <= wb.length; i++) {
    if (grams.has(wb.slice(i, i + run).join(" "))) return true;
  }
  return false;
}

export type Confirmation =
  | { status: "agreed"; evidence: string }
  | { status: "disagreed"; reason: string }
  | { status: "unknown"; reason: string };

/**
 * Asks the confirming model the one judge's rubric for this narration, blind to
 * the first judge's answer. Agreement is a major verdict with overlapping
 * evidence; a verdict that is none or minor is a disagreement; one that could
 * not be read is unknown. Neither is ever a rewrite.
 */
export async function confirmFinding(
  finding: { judge: JudgeId; evidence: string },
  turn: JudgeTurn,
  apiOptions: ObserverApiOptions,
): Promise<Confirmation> {
  const verdicts = await callJudges(turn, [finding.judge], apiOptions, "confirm");
  const v = verdicts[finding.judge];
  if (!v || v.severity === "unknown") {
    return { status: "unknown", reason: "the confirming judge gave no readable verdict" };
  }
  if (v.severity !== "major") {
    return { status: "disagreed", reason: `the confirming judge said ${v.severity}` };
  }
  if (!evidenceOverlaps(v.evidence, finding.evidence)) {
    return { status: "disagreed", reason: "the confirming judge quoted something else" };
  }
  return { status: "agreed", evidence: v.evidence };
}

// ---------------------------------------------------------------------------
// The facts a rewrite is handed
// ---------------------------------------------------------------------------

/**
 * The fact kinds a rewrite of each judge's finding may be handed. A secret
 * leak gets none (the rewrite is told the quoted statement to take out, never
 * the truth behind it), nor does a clock; the sheet and the lines and veils
 * already ride in the narration context.
 */
const REWRITER_TOPICS: Partial<Record<JudgeId, readonly FactTopic[]>> = {
  outcome: ["result"],
  world_consistency: ["person", "location", "result"],
  lines_veils: ["line", "veil"],
};

function wholeWordIn(text: string, name: string): boolean {
  const n = name.trim().toLowerCase();
  if (!n) return false;
  const t = text.toLowerCase();
  let from = 0;
  for (;;) {
    const at = t.indexOf(n, from);
    if (at < 0) return false;
    const before = at === 0 ? "" : t[at - 1];
    const after = t[at + n.length] ?? "";
    if (!/[\p{L}\p{N}]/u.test(before) && !/[\p{L}\p{N}]/u.test(after)) return true;
    from = at + 1;
  }
}

/**
 * The tool calls whose results the player is never shown (a hidden roll, the
 * campaign tool, a hidden clock's tick): their facts never reach a rewrite.
 */
export function hiddenToolRefs(results: readonly JudgeToolResult[]): Set<string> {
  const hidden = new Set<string>();
  for (const r of results) {
    const summary = publicSummary(
      r as Parameters<typeof publicSummary>[0],
      {},
    );
    if (summary === null) hidden.add(r.toolCallId);
  }
  return hidden;
}

/** The facts one confirmed finding hands the rewrite, in the turn's order. */
export function rewriterFactsFor(
  judge: JudgeId,
  factIds: readonly string[],
  facts: readonly Fact[],
  narration: string,
  hiddenRefs: ReadonlySet<string> = new Set(),
): Fact[] {
  const topics = REWRITER_TOPICS[judge];
  if (!topics) return [];
  const cited = new Set(factIds);
  return facts.filter((f) => {
    if (!cited.has(f.id) || !f.topic || !topics.includes(f.topic)) return false;
    if (f.source.kind === "tool" && hiddenRefs.has(f.source.ref)) return false;
    // A person or place the narration does not name is not the rewrite's to introduce.
    if (f.topic === "person" || f.topic === "location") {
      return (f.names ?? []).some((n) => wholeWordIn(narration, n));
    }
    return true;
  });
}

// ---------------------------------------------------------------------------
// The gate
// ---------------------------------------------------------------------------

const FLAG_JUDGE: ReadonlyMap<ObserverFlagType, JudgeId> = new Map(
  (Object.entries(JUDGE_FLAG_TYPE) as [JudgeId, ObserverFlagType][]).map(([judge, type]) => [
    type,
    judge,
  ]),
);

export interface ConfirmRun {
  /** Findings both judges agreed on, in priority order. */
  confirmed: ConfirmedFinding[];
  /** Why nothing was confirmed when nothing could be asked. */
  skipped?: string;
  attempted: number;
}

/**
 * Confirms up to two of a pass's major, rewritable flags. The candidates are the
 * flags the player let correct the turn (`rewritable` and the type's own
 * `triggersReset`), highest priority first; a flag with no finding behind it
 * cannot be confirmed and stays a flag.
 */
export async function confirmMajorFlags(args: {
  flags: readonly ObserverFlag[];
  settings: ObserverSettings | undefined;
  rewritable: ReadonlySet<ObserverFlagType>;
  turn: JudgeTurn;
  /** The model the first judge ran on. */
  judgeModel: string;
  /** The first judge's call options: the keys, the cost turn and the abort signal. */
  base: ObserverApiOptions;
  pick: { model: string; reasoningEffort: ReasoningEffort };
  fallbackModel: string;
  hiddenRefs?: ReadonlySet<string>;
}): Promise<ConfirmRun> {
  const candidates = majorFlagsInOrder(args.flags, args.settings, (t) =>
    args.rewritable.has(t),
  )
    .filter((f) => f.finding && FLAG_JUDGE.has(f.type))
    .slice(0, MAX_CONFIRMATIONS);
  if (candidates.length === 0) {
    return { confirmed: [], skipped: "no rewritable major finding", attempted: 0 };
  }

  const resolved = resolveConfirmModel({
    judgeModel: args.judgeModel,
    keys: args.base,
    pick: args.pick,
    fallbackModel: args.fallbackModel,
  });
  if (!resolved.ok) {
    const skipped =
      resolved.reason === "same_family"
        ? `the confirming model (${resolved.model}) is of the first judge's family (${resolved.family})`
        : resolved.reason === "no_key"
          ? `there is no key for the confirming model (${resolved.model})`
          : `the confirming model (${resolved.model}) cannot run here`;
    logger.action("Rewrite skipped: no second judge to confirm the finding", {
      reason: resolved.reason,
      model: resolved.model,
      family: resolved.family,
      types: candidates.map((f) => f.type),
    });
    return { confirmed: [], skipped, attempted: 0 };
  }

  const confirmApi: ObserverApiOptions = {
    ...args.base,
    model: resolved.model,
    reasoningEffort: resolved.reasoningEffort,
  };
  const answers = await Promise.all(
    candidates.map(async (flag) => {
      const judge = FLAG_JUDGE.get(flag.type) as JudgeId;
      const finding = flag.finding as NonNullable<ObserverFlag["finding"]>;
      const outcome = await confirmFinding(
        { judge, evidence: finding.evidence },
        args.turn,
        confirmApi,
      );
      return { flag, judge, finding, outcome };
    }),
  );

  const confirmed: ConfirmedFinding[] = [];
  for (const { flag, judge, finding, outcome } of answers) {
    logger.action(
      outcome.status === "agreed"
        ? "Confirming judge agreed - the finding may be rewritten"
        : "Confirming judge did not agree - the finding stays a flag",
      {
        judge,
        model: resolved.model,
        family: resolved.family,
        status: outcome.status,
        ...(outcome.status === "agreed" ? {} : { reason: outcome.reason }),
      },
    );
    if (outcome.status !== "agreed") continue;
    confirmed.push({
      flag,
      judge,
      evidence: finding.evidence,
      fix: finding.fix,
      facts: rewriterFactsFor(
        judge,
        finding.factIds,
        args.turn.facts,
        args.turn.narration,
        args.hiddenRefs,
      ),
    });
  }
  return { confirmed, attempted: candidates.length };
}

