/**
 * The published labelled turn set (evals/turns/public/, judge layer v2 slice 4,
 * decisions 229 and 233): every file is a valid fixture, the set covers every
 * judge with at least one problem and one good turn, nothing in it looks like a
 * key, and the deterministic rung-1 checks give on each turn exactly what the
 * turn says they should. No model is called.
 */
import { describe, it, expect } from "vitest";
import { JUDGE_IDS, selectJudges } from "@/app/misc/judges/combined";
import { judgeInputsOf, observerParamsFor, parseFixtureText } from "@/app/misc/judges/evalFormat";
import { judgeTurnFor } from "@/app/misc/observer";
import { runRung1 } from "@/app/misc/judges/rung1";
import { BUILTIN_SYSTEMS } from "@/app/misc/systems";
import { loadPublicJudgeTurns, readPublicTurnFiles } from "./helpers/evalTurns";

const fixtures = loadPublicJudgeTurns();

describe("the published turn files", () => {
  const files = readPublicTurnFiles();

  it("holds between 30 and 50 turns", () => {
    expect(files.length).toBeGreaterThanOrEqual(30);
    expect(files.length).toBeLessThanOrEqual(50);
  });

  it.each(files.map((f) => [f.file, f.text] as const))("%s is a valid published turn named for its file", (file, text) => {
    const parsed = parseFixtureText(text);
    expect(parsed.ok, parsed.ok ? "" : parsed.errors.join("; ")).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.fixture.published).toBe(true);
    expect(`${parsed.fixture.id}.json`).toBe(file);
  });

  it("has unique ids", () => {
    expect(new Set(fixtures.map((f) => f.id)).size).toBe(fixtures.length);
  });
});

describe("what the set covers", () => {
  it.each(JUDGE_IDS.map((id) => [id] as const))("%s has a problem turn and a good turn", (judge) => {
    const positive = fixtures.filter((f) => f.labels.some((l) => l.judge === judge));
    const negative = fixtures.filter((f) => !f.labels.some((l) => l.judge === judge));
    expect(positive.length).toBeGreaterThanOrEqual(1);
    expect(negative.length).toBeGreaterThanOrEqual(5);
  });

  it("has an adversarial turn for each case the plan names", () => {
    const ids = fixtures.map((f) => f.id);
    // A player line that decides its own outcome (the declared action carries the result), a narration that
    // names a secret, a dead NPC talking.
    expect(ids).toContain("secret-narrator-states-the-truth");
    expect(ids).toContain("world-dead-npc-speaks");
    expect(ids.filter((id) => id.startsWith("agency-")).length).toBeGreaterThanOrEqual(5);
  });

  it("marks every label as drafted until the author has checked it", () => {
    expect(fixtures.every((f) => f.labelStatus === "drafted" || f.labelStatus === "checked")).toBe(true);
  });

  it("gives each labelled judge a turn its precondition actually selects", () => {
    // A label on a turn the combined call would never ask the judge about is a
    // recall miss the set built in, not one the judge made.
    const unreachable: string[] = [];
    for (const f of fixtures) {
      const turn = judgeTurnFor(observerParamsFor(f, { model: "m", token: null }));
      const selected = selectJudges(turn);
      for (const label of f.labels) {
        if (!selected.includes(label.judge)) unreachable.push(`${f.id}: ${label.judge}`);
      }
    }
    expect(unreachable).toEqual([]);
  });
});

describe("the deterministic checks over the set (free)", () => {
  it.each(fixtures.map((f) => [f.id, f] as const))("%s: rung 1 gives what the turn expects", (_id, f) => {
    // Rebuilding the facts must never throw on a published turn.
    expect(() => judgeInputsOf(f)).not.toThrow();
    if (f.rung1Expect === undefined) return;
    const system = BUILTIN_SYSTEMS.find((s) => s.id === f.systemId);
    const hits = runRung1({
      storyBefore: f.storyBefore,
      storyAfter: f.storyAfter,
      results: f.toolResults,
      prose: f.narration,
      ...(system ? { system: { eventContracts: system.eventContracts } } : {}),
    });
    const kinds = [...new Set(hits.map((h) => h.check))].sort();
    expect(kinds).toEqual([...f.rung1Expect].sort());
  });
});
