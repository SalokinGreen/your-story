/**
 * The judge eval runner (app/misc/judges/evalRunner.ts) against a mocked
 * provider: it never reaches a model. The mock plays a "perfect judge" that
 * flags exactly what each turn's labels say, and an over-eager one that flags
 * everything, and the report must tell them apart.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  buildReport,
  estimateCalls,
  formatReport,
  runEval,
  runFixtureOnce,
} from "@/app/misc/judges/evalRunner";
import type { JudgeFixture } from "@/app/misc/judges/evalFormat";
import type { JudgeId } from "@/app/misc/judges/types";
import { isJudgeCall, judgeReply, narrationOf, requestedJudges, type JudgeCallBody } from "./helpers/combinedJudges";
import { loadPublicJudgeTurns } from "./helpers/evalTurns";

const all = loadPublicJudgeTurns();
const byId = (id: string) => all.find((f) => f.id === id) as JudgeFixture;
const API = { model: "test-model", token: null, openRouterKey: "test-key-not-real" };

const originalFetch = global.fetch;
afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

type Calls = { bodies: JudgeCallBody[] };

/** Answers every judge call by the labels of the turn whose narration it is asked about. */
function mockProvider(mode: "perfect" | "everything"): Calls {
  const seen: Calls = { bodies: [] };
  global.fetch = vi.fn(async (_url: unknown, init?: { body?: string }) => {
    const body = JSON.parse(init?.body ?? "{}") as JudgeCallBody;
    seen.bodies.push(body);
    let content = "{}";
    if (isJudgeCall(body)) {
      const narration = narrationOf(body);
      const fixture = all.find((f) => f.narration.trim() === narration.trim());
      const spec: Partial<Record<JudgeId, { severity: "major"; evidence?: string }>> = {};
      for (const judge of requestedJudges(body)) {
        const label = fixture?.labels.find((l) => l.judge === judge);
        if (mode === "perfect" && label) spec[judge] = { severity: "major", evidence: label.span };
        if (mode === "everything") spec[judge] = { severity: "major" };
      }
      content = judgeReply(body, spec);
    }
    return {
      ok: true,
      json: async () => ({
        content,
        meta: { usage: { promptTokens: 1000, completionTokens: 100, cachedTokens: 400 }, estimatedCost: 0.002 },
      }),
    } as unknown as Response;
  }) as unknown as typeof fetch;
  return seen;
}

describe("runFixtureOnce", () => {
  it("returns the judge's verdict with its quote, and the run's cost from the ledger", async () => {
    mockProvider("perfect");
    const f = byId("agency-pc-speaks-a-promise");
    const rec = await runFixtureOnce(f, "combined", 1, API, () => 5);
    expect(rec.verdicts.agency).toEqual({ severity: "major", evidence: f.labels[0].span });
    expect(rec.verdicts.secret_leak?.severity).toBe("not_run"); // no secret on this turn
    expect(rec.turnKind).toBe("flagged");
    expect(rec.calls).toBe(1);
    expect(rec.costUsd).toBeCloseTo(0.002);
    expect(rec.promptTokens).toBe(1000);
    expect(rec.cachedTokens).toBe(400);
  });

  it("measures time with the clock it is given", async () => {
    mockProvider("perfect");
    let t = 0;
    const rec = await runFixtureOnce(byId("agency-clean-implied-steps"), "combined", 1, API, () => (t += 250));
    expect(rec.ms).toBe(250);
  });

  it("calls nothing for a turn no judge has anything to judge", async () => {
    const seen = mockProvider("perfect");
    const f: JudgeFixture = { ...byId("agency-no-player-line"), tierUsed: 3 };
    const rec = await runFixtureOnce({ ...f, settings: undefined }, "combined", 1, API);
    // The oracle judge still applies (no oracle ran); the tier judge and agency do not.
    expect(rec.verdicts.agency?.severity).toBe("not_run");
    expect(rec.verdicts.tier_gap?.severity).toBe("not_run");
    expect(seen.bodies.length).toBeLessThanOrEqual(1);
  });

  it("records a failed provider as a failed run, not a clean one", async () => {
    global.fetch = vi.fn(async () => ({ ok: false, status: 500, json: async () => ({ error: "down" }) })) as unknown as typeof fetch;
    const rec = await runFixtureOnce(byId("agency-pc-speaks-a-promise"), "combined", 1, API);
    expect(rec.turnKind).toBe("failed");
    expect(rec.verdicts.agency?.severity).toBe("unknown");
  });

  it("runs the version-1 judges in the split form and leaves the judges of the record unrun", async () => {
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ content: JSON.stringify({ violation: true, severity: "major", reason: "Spoke for the player." }) }),
    })) as unknown as typeof fetch;
    const rec = await runFixtureOnce(byId("agency-pc-speaks-a-promise"), "split", 1, API);
    expect(rec.verdicts.agency?.severity).toBe("major");
    expect(rec.verdicts.world_consistency?.severity).toBe("not_run");
    expect(rec.verdicts.secret_leak?.severity).toBe("not_run");
  });
});

describe("runEval and the report", () => {
  const sample = [
    "agency-pc-speaks-a-promise",
    "agency-clean-implied-steps",
    "world-dead-npc-speaks",
    "world-dead-npc-remembered",
    "secret-narrator-states-the-truth",
    "secret-character-notices-only",
  ].map(byId);

  it("scores a judge that follows the labels as precise and complete", async () => {
    mockProvider("perfect");
    const records = await runEval({ fixtures: sample, modes: ["combined"], runs: 3, apiOptions: API, concurrency: 3 });
    expect(records).toHaveLength(sample.length * 3);
    const report = buildReport(sample, records, { model: "m", effort: "none", runs: 3, generatedAt: "t" });
    const combined = report.modes[0];
    const agency = combined.judges.find((j) => j.judge === "agency")!;
    const world = combined.judges.find((j) => j.judge === "world_consistency")!;
    const secret = combined.judges.find((j) => j.judge === "secret_leak")!;
    for (const j of [agency, world, secret]) {
      expect(j.any).toMatchObject({ fp: 0, fn: 0, precision: 1, recall: 1 });
      expect(j.shipsFlagOnly).toBe(false);
    }
    expect(agency.any.tp).toBe(3); // one labelled turn, three runs
    expect(combined.total.totalUsd).toBeGreaterThan(0);
  });

  it("scores an over-eager judge as flag-only, with its failing runs counted per turn", async () => {
    mockProvider("everything");
    const records = await runEval({ fixtures: sample, modes: ["combined"], runs: 2, apiOptions: API });
    const report = buildReport(sample, records, { model: "m", effort: "none", runs: 2, generatedAt: "t" });
    const agency = report.modes[0].judges.find((j) => j.judge === "agency")!;
    expect(agency.any.fp).toBeGreaterThan(0);
    expect(agency.any.precision).toBeLessThan(0.7);
    expect(agency.shipsFlagOnly).toBe(true);
    expect(agency.cases.find((c) => c.fixtureId === "agency-clean-implied-steps")).toMatchObject({ wrongRuns: 2, runs: 2 });
  });

  it("returns records in a fixed order whatever the concurrency", async () => {
    mockProvider("perfect");
    const a = await runEval({ fixtures: sample, modes: ["combined"], runs: 2, apiOptions: API, concurrency: 1 });
    const b = await runEval({ fixtures: sample, modes: ["combined"], runs: 2, apiOptions: API, concurrency: 6 });
    expect(a.map((r) => [r.fixtureId, r.run])).toEqual(b.map((r) => [r.fixtureId, r.run]));
  });

  it("counts a private turn but never names it in the report", async () => {
    mockProvider("everything");
    const secretTurn: JudgeFixture = { ...byId("agency-clean-implied-steps"), id: "my-private-story-turn", published: false };
    const fixtures = [byId("agency-pc-speaks-a-promise"), secretTurn];
    const records = await runEval({ fixtures, modes: ["combined"], runs: 1, apiOptions: API });
    const report = buildReport(fixtures, records, { model: "m", effort: undefined, runs: 1, generatedAt: "t" });
    expect(report.privateTurns).toBe(1);
    expect(JSON.stringify(report)).not.toContain("my-private-story-turn");
    expect(report.modes[0].judges.find((j) => j.judge === "agency")!.any.fp).toBe(2); // still scored: the private turn's flag, and the labelled turn's, whose quote is not the labelled span
  });

  it("prints a report that says what each rate is out of", async () => {
    mockProvider("perfect");
    const records = await runEval({ fixtures: sample, modes: ["combined", "split"], runs: 1, apiOptions: API });
    const text = formatReport(buildReport(sample, records, { model: "m", effort: "none", runs: 1, generatedAt: "t" }));
    expect(text).toContain("== combined form ==");
    expect(text).toContain("== split form ==");
    expect(text).toContain("== combined against split");
    expect(text).toMatch(/\d+ of \d+ runs/);
    expect(text).toMatch(/cost \$\d/);
  });
});

describe("estimateCalls", () => {
  it("knows the combined form's calls from the preconditions, without making any", () => {
    const seen = mockProvider("perfect");
    expect(estimateCalls(byId("agency-pc-speaks-a-promise"), "combined").max).toBeGreaterThanOrEqual(1);
    expect(estimateCalls(byId("agency-pc-speaks-a-promise"), "split").max).toBe(5);
    expect(seen.bodies).toHaveLength(0);
  });
});
