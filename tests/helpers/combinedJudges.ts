/**
 * Test helpers for the combined judge call (app/misc/judges/combined.ts).
 *
 * A suite that mocks the provider recognises the judges' call by its system
 * prompt (`isJudgeCall`), reads which judges it asks (`requestedJudges`) and
 * answers with `judgeReply`, a keyed JSON verdict per judge: none unless the
 * spec names the judge. A named judge quotes the first words of the narration by
 * default, which is always a quote that is really in it.
 */
import type { JudgeId } from "@/app/misc/judges/types";

export interface JudgeCallBody {
  messages: { role: string; content: string }[];
}

export interface JudgeSpec {
  severity: "none" | "minor" | "major";
  evidence?: string;
  fix?: string;
  factIds?: string[];
}

export function isJudgeCall(body: JudgeCallBody | undefined): boolean {
  return (body?.messages?.[0]?.content ?? "").includes(
    "You review one turn of a tabletop-style interactive fiction game",
  );
}

export function requestedJudges(body: JudgeCallBody): JudgeId[] {
  const system = body.messages[0]?.content ?? "";
  return [...system.matchAll(/^JUDGE (\w+):/gm)].map((m) => m[1] as JudgeId);
}

/** The narration the call asks about (the last quoted block of the user message). */
export function narrationOf(body: JudgeCallBody): string {
  const user = body.messages[body.messages.length - 1]?.content ?? "";
  const m = /NARRATION\n"""\n([\s\S]*?)\n"""\s*$/.exec(user);
  return m ? m[1] : "";
}

/** A reply that answers every requested judge, none unless `spec` says otherwise. */
export function judgeReply(
  body: JudgeCallBody,
  spec: Partial<Record<JudgeId, JudgeSpec | "major" | "minor">> = {},
): string {
  const narration = narrationOf(body);
  const firstWords = narration.split(/\s+/).slice(0, 4).join(" ");
  const out: Record<string, unknown> = {};
  for (const id of requestedJudges(body)) {
    const raw = spec[id];
    const s: JudgeSpec | undefined =
      raw === "major" || raw === "minor" ? { severity: raw } : raw;
    if (!s || s.severity === "none") {
      out[id] = { reasoning: "nothing in the input rules it out: NONE", severity: "none", evidence: "", factIds: [], fix: "" };
    } else {
      out[id] = {
        reasoning: `the narration shows the problem: ${s.severity.toUpperCase()}`,
        severity: s.severity,
        evidence: s.evidence ?? firstWords,
        factIds: s.factIds ?? [],
        fix: s.fix ?? `Fix the ${id} problem.`,
      };
    }
  }
  return JSON.stringify(out);
}
