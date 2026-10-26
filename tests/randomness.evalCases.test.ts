import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { rollDecisionChain } from "@/app/misc/gmPromptChains";
import { parseFixtureText, type GenerationFixture } from "@/app/misc/judges/evalFormat";
import {
  buildGenerationReport,
  buildGenerationRequest,
  checkGenerationExpect,
  checkNameFrom,
  runDetailOf,
  type GenerationRecord,
} from "@/app/misc/judges/generationEval";

const DIR = join(__dirname, "..", "evals", "generation");
const NEW_IDS = [
  "names-new-npc-uses-drawer",
  "table-undescribed-room-rolls-note",
  "tripwire-pending-event-resolved",
  "drawer-quiet-turn-forces-nothing",
];

function load(id: string): GenerationFixture {
  const parsed = parseFixtureText(readFileSync(join(DIR, `${id}.json`), "utf8"));
  if (!parsed.ok || parsed.fixture.kind !== "generation") throw new Error(`${id}: ${JSON.stringify(parsed)}`);
  return parsed.fixture;
}

const SLOT = { model: "test-model", effort: "none" };
const text = (f: GenerationFixture): string => JSON.stringify(buildGenerationRequest(f, SLOT).messages);

describe("the roll chain's person-who-knows clause", () => {
  it("says a knowing person is narrated, and gives the cellar pair", () => {
    const chain = rollDecisionChain();
    expect(chain).toContain("A person in the scene who knows the answer and would say it is not an oracle question: narrate what they say.");
    expect(chain).toContain("What is behind the locked cellar door?");
  });
});

describe("the new generation cases", () => {
  it("all load", () => {
    for (const id of NEW_IDS) expect(load(id).id).toBe(id);
    expect(readdirSync(DIR).filter((f) => NEW_IDS.includes(f.replace(".json", ""))).length).toBe(4);
  });

  it("the drawer cases put the drawer in the live block; the others do not", () => {
    expect(text(load("names-new-npc-uses-drawer"))).toContain("Maret Hollin");
    expect(text(load("drawer-quiet-turn-forces-nothing"))).toContain("Names: Maret Hollin");
    expect(text(load("table-undescribed-room-rolls-note"))).not.toContain("DICE DRAWER");
  });

  it("the table case lists the room table and the tripwire case shows its event", () => {
    expect(text(load("table-undescribed-room-rolls-note"))).toContain("Toll-house rooms");
    const t = text(load("tripwire-pending-event-resolved"));
    expect(t).toContain("event_tripwire_1");
    expect(t).toContain("a surprise the dice raised");
  });
});

describe("nameFrom", () => {
  const drawer = { names: ["Maret Hollin", "Corvane Aldis", "Yssa Bren"] };
  const add = (name: string) => ({ name: "add_npc", args: { name } });
  const gen = { name: "generate_name", result: '{"names":["Tamsin Orrel"]}' };

  it("accepts a drawer name, and a rolled one", () => {
    expect(checkNameFrom("drawer", { callArgs: [add("Maret Hollin")] }, drawer)).toEqual([]);
    expect(checkNameFrom("drawer", { callArgs: [add("Tamsin Orrel")], results: [gen] }, drawer)).toEqual([]);
  });
  it("refuses an invented one, and a drawer name when only rolls count", () => {
    expect(checkNameFrom("drawer", { callArgs: [add("Elara Voss")] }, drawer)).toHaveLength(1);
    expect(checkNameFrom("rolled", { callArgs: [add("Maret Hollin")] }, drawer)).toHaveLength(1);
  });
  it("is part of checkGenerationExpect", () => {
    const failures = checkGenerationExpect(
      { nameFrom: "drawer" },
      { calls: ["add_npc"], prose: "", callArgs: [add("Elara Voss")] },
      undefined,
      drawer,
    );
    expect(failures[0]).toContain("Elara Voss");
  });
  it("a fixture asking for the drawer must carry one", () => {
    const f = JSON.parse(readFileSync(join(DIR, "names-new-npc-uses-drawer.json"), "utf8"));
    delete f.drawer;
    expect(parseFixtureText(JSON.stringify(f)).ok).toBe(false);
  });
});

describe("the report keeps each run's prose and calls", () => {
  const record: GenerationRecord = {
    fixtureId: "x",
    slot: "Default",
    model: "m",
    run: 1,
    calls: ["add_npc"],
    callArgs: [{ name: "add_npc", args: { name: "A".repeat(500) } }],
    prose: "p".repeat(3000),
    rounds: 1,
    failures: [],
    passed: true,
    costUsd: 0,
    ms: 1,
  };
  it("truncates prose to 2,000 characters and arguments to 300", () => {
    const detail = runDetailOf(record);
    expect(detail.prose).toHaveLength(2000);
    expect(detail.calls[0].name).toBe("add_npc");
    expect(detail.calls[0].arguments.length).toBe(300);
    const report = buildGenerationReport([record], { runs: 1, generatedAt: "t" });
    expect(report.runDetails).toHaveLength(1);
  });
});
