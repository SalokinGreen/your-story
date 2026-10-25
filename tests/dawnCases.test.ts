/**
 * The dawn judge's behavioural cases (evals/dawn/cases.json, GM prompt plan
 * slice 5). Free: it checks the file's shape and pins what the phrase table
 * (the fallback and today's behaviour) says of each case, so a change to the
 * table shows up as a changed case. The judge's own answers need a model and
 * wait for the author's go (scripts/eval-dawn.mjs --go).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { textCrosses } from "@/app/misc/turnEndChecks";
import { NIGHT_ENDED_CHECK } from "@/app/misc/systems/blood-and-bone/turnEndChecks";

interface DawnCase {
  id: string;
  dawn: boolean;
  phrase: boolean;
  gmProse: string;
  playerLines: string[];
}
const file = JSON.parse(
  readFileSync(join(process.cwd(), "evals", "dawn", "cases.json"), "utf8"),
) as { v: number; cases: DawnCase[] };

describe("evals/dawn/cases.json", () => {
  it("has unique ids and both kinds of case", () => {
    const ids = file.cases.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(file.cases.filter((c) => c.dawn).length).toBeGreaterThanOrEqual(4);
    expect(file.cases.filter((c) => !c.dawn).length).toBeGreaterThanOrEqual(6);
    // The cases the phrase table gets wrong are the point of the judge.
    expect(file.cases.some((c) => c.dawn && !c.phrase)).toBe(true);
    expect(file.cases.some((c) => !c.dawn && c.phrase)).toBe(true);
  });
  it.each(file.cases.map((c) => [c.id, c] as const))(
    "%s: the phrase table says what the file records",
    (_id, c) => {
      const crossed = textCrosses(NIGHT_ENDED_CHECK, {
        gmProse: c.gmProse,
        playerLines: c.playerLines,
      });
      expect(Boolean(crossed)).toBe(c.phrase);
    },
  );
});
