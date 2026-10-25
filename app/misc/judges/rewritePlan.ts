/**
 * The rewrite with facts (docs/judge-layer-v2-design.md section 4 and 11.5, plan
 * slice 3): the prompt block that hands the rewriter the confirmed findings and
 * their facts, and the fix plan it must write before any prose.
 *
 * A rewrite replies in two parts: a fix plan (a JSON array, one entry per
 * problem: the quoted span, the problem, what stands there instead), a separator
 * line, then the whole corrected narration. Code checks the plan before the
 * prose is trusted: every quoted span must be in the original, and a long span
 * the plan replaces must not survive in the prose. `recheckRewrite` then runs
 * the deterministic checks of rung 1 on the new text.
 *
 * Secrets: the facts a rewrite is handed come from `rewriterFactsFor`
 * (confirm.ts), which never includes a secret's truth, a clock or a hidden
 * roll. A secret-leak finding is told only the quoted statement to take out.
 */
import type { ObserverFlagType } from "../structs";
import { extractVisibleText } from "../turnTimeline";
import { runRung1 } from "./rung1";
import type {
  ConfirmedFinding,
  JudgeStoryView,
  Rung1Hit,
} from "./types";

/** The line that ends the fix plan and begins the prose. */
export const PROSE_SEPARATOR = "===PROSE===";

export interface FixPlanEntry {
  span: string;
  problem: string;
  replacement: string;
}

export type FixPlanResult =
  | { ok: true; plan: FixPlanEntry[]; prose: string }
  | { ok: false; reason: string };

const SEPARATOR_LINE = /^[ \t]*={3,}[ \t]*PROSE[ \t]*={3,}[ \t]*$/im;
const MAX_PLAN_ENTRIES = 12;
/** A span shorter than this many words is too small to say whether it "survived". */
const SURVIVAL_CHECK_MIN_WORDS = 4;

function normalize(text: string): string {
  return text
    .replace(/[‘’‛]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[‐-―−]/g, "-")
    .replace(/[*_]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * Splits a rewrite reply into its fix plan and its prose, and checks that every
 * quoted span is really in the original. A reply with no separator, no plan, a
 * plan that is not a list of entries, or a span that is not in the original is
 * rejected: the original text is then released with its flags.
 */
export function parseFixPlan(content: string, original: string): FixPlanResult {
  const match = SEPARATOR_LINE.exec(content);
  if (!match) return { ok: false, reason: "the reply has no prose separator" };
  const planText = content.slice(0, match.index);
  const prose = content.slice(match.index + match[0].length).trim();
  if (!prose) return { ok: false, reason: "the reply has no prose after the separator" };

  const open = planText.indexOf("[");
  const close = planText.lastIndexOf("]");
  if (open < 0 || close < open) return { ok: false, reason: "the reply has no fix plan" };
  let raw: unknown;
  try {
    raw = JSON.parse(planText.slice(open, close + 1));
  } catch {
    return { ok: false, reason: "the fix plan is not valid JSON" };
  }
  if (!Array.isArray(raw) || raw.length === 0) {
    return { ok: false, reason: "the fix plan is empty" };
  }
  if (raw.length > MAX_PLAN_ENTRIES) {
    return { ok: false, reason: "the fix plan has too many entries" };
  }

  const haystack = normalize(original);
  const plan: FixPlanEntry[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      return { ok: false, reason: "a fix plan entry is not an object" };
    }
    const e = entry as Record<string, unknown>;
    const span = typeof e.span === "string" ? e.span.trim() : "";
    if (!span) return { ok: false, reason: "a fix plan entry has no span" };
    if (!haystack.includes(normalize(span))) {
      return { ok: false, reason: "a fix plan span is not in the original text" };
    }
    plan.push({
      span,
      problem: typeof e.problem === "string" ? e.problem.trim() : "",
      replacement: typeof e.replacement === "string" ? e.replacement.trim() : "",
    });
  }
  return { ok: true, plan, prose };
}

/**
 * Whether the prose follows its own plan: a long span the plan replaces is not
 * still in the text word for word. A short span is too small to tell.
 */
export function planFollowed(
  plan: readonly FixPlanEntry[],
  prose: string,
): { ok: true } | { ok: false; reason: string } {
  const text = normalize(extractVisibleText(prose) || prose);
  for (const entry of plan) {
    const span = normalize(entry.span);
    if (span.split(" ").length < SURVIVAL_CHECK_MIN_WORDS) continue;
    if (normalize(entry.replacement) === span) continue;
    if (text.includes(span)) {
      return { ok: false, reason: "a span the fix plan replaces is still in the prose" };
    }
  }
  return { ok: true };
}

/** The sentence each kind of finding adds to what the rewriter must do. */
const FINDING_RULES: Partial<Record<ObserverFlagType, string>> = {
  response_length:
    "Cut scenery, repeated beats and anything the player did not ask for. Keep every event and every result.",
  player_agency:
    "Give the player character no new dialogue, no significant choice and no decided feeling. Narrating them carrying out what they declared stays, in second person.",
  outcome_narration_mismatch:
    "Make the narration agree with the engine's result. The result is ground truth and never changes to suit the prose.",
  world_consistency:
    "Make the narration agree with the facts listed. A dead or departed person does not speak, act or appear. A person stays where the facts put them.",
  secret_leak:
    "Take the quoted statement out. Show only what the player character could notice, and do not state or hint at what lies behind it.",
  lines_and_veils:
    "Take the quoted content out of the story. A line is not depicted at all. A veil happens off screen: close the door, cut away, or say it in a clause.",
};

/**
 * The block the rewrite prompt carries: each confirmed finding, most serious
 * first, with its quote, the rule for fixing it and the facts it must keep true.
 */
export function buildFindingsBlock(findings: readonly ConfirmedFinding[]): string {
  const items = findings.map((f, i) => {
    const lines = [`${i + 1}. ${f.flag.detail}`, `   Quote: "${f.evidence}"`];
    const rule = FINDING_RULES[f.flag.type];
    if (rule) lines.push(`   How to fix it: ${rule}`);
    if (f.fix) lines.push(`   What to change: ${f.fix}`);
    if (f.facts.length > 0) {
      lines.push("   Facts to keep true:");
      for (const fact of f.facts) lines.push(`   - ${fact.text}`);
    }
    return lines.join("\n");
  });
  return `Problems found, most serious first. One rewrite fixes them all:\n${items.join("\n")}`;
}

/** The reply format the rewrite is asked for. */
export const FIX_PLAN_INSTRUCTION = `Reply in two parts.
Part one is the fix plan: a JSON array with one entry per problem, each {"span": "<words copied exactly from the text above>", "problem": "<what is wrong with them>", "replacement": "<what stands there instead, or an empty string to cut it>"}.
Then a line holding only ${PROSE_SEPARATOR}
Part two is the whole corrected narration, with every planned change made.`;

/**
 * Re-checks a rewrite with the deterministic checks of rung 1 (design 11.5): a
 * line's keyword or a secret's key phrase in the new text, or a departed person
 * the original did not have acting, fails it and the original is released with
 * its flags. Pacing and the event contracts are not part of this check.
 */
export function recheckRewrite(args: {
  rewritten: string;
  original: string;
  storyBefore: JudgeStoryView;
  storyAfter: JudgeStoryView;
}): { ok: true } | { ok: false; reason: string; hits: Rung1Hit[] } {
  const base = { storyBefore: args.storyBefore, storyAfter: args.storyAfter, results: [] };
  const hits = runRung1({ ...base, prose: args.rewritten }).filter(
    (h) => h.check === "line" || h.check === "secret_phrase" || h.check === "departed_person",
  );
  const hadBefore = new Set(
    runRung1({ ...base, prose: args.original })
      .filter((h) => h.check === "departed_person")
      .map((h) => h.evidence),
  );
  const failed = hits.filter(
    (h) => h.check !== "departed_person" || !hadBefore.has(h.evidence),
  );
  return failed.length === 0
    ? { ok: true }
    : { ok: false, reason: `the rewrite fails a rung 1 check (${failed.map((h) => h.check).join(", ")})`, hits: failed };
}
