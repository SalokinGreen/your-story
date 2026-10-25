/**
 * The combined judge call (app/misc/judges/combined.ts, prompts.ts; judge layer
 * v2, plan slice 2): the prompt each judge is written to, the facts handed to
 * each, the parsing and validation of the keyed JSON reply, the split when the
 * facts are large, each judge's precondition, and what runObserver does with it.
 * No model is called: fetch is a mock.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  JUDGE_IDS,
  FLAG_PRIORITY,
  JUDGE_FACT_BUDGET_TOKENS,
  parseJudgeVerdicts,
  pickMajorFlag,
  planCalls,
  quoteAppearsIn,
  runCombinedJudges,
  sceneIncrementFlag,
  selectJudges,
  type JudgeTurn,
} from "@/app/misc/judges/combined";
import {
  AGENCY_CHAIN,
  RUBRICS,
  buildJudgeSystemPrompt,
  buildJudgeUserPrompt,
} from "@/app/misc/judges/prompts";
import { collectTurnFacts, selectFactsFor } from "@/app/misc/judges/facts";
import type { Fact, JudgeId } from "@/app/misc/judges/types";
import { runObserver, cloneDefaultObserverSettings } from "@/app/misc/observer";
import type { ObserverSettings, OutcomeVerdict } from "@/app/misc/observer";
import type { ObserverFlag } from "@/app/misc/structs";
import { emptyCampaign } from "@/app/misc/campaign/types";
import { judgeReply, narrationOf, requestedJudges } from "./helpers/combinedJudges";

const apiOptions = { model: "test-model", token: "tok" };
const LONG = Array(400).fill("word").join(" ");

function turn(overrides: Partial<JudgeTurn> = {}): JudgeTurn {
  return {
    narration: "You take the ladder, rung by rung, and drop to the cellar floor.",
    playerChoice: "I climb down",
    toolNames: [],
    rollResults: [],
    facts: [],
    ...overrides,
  };
}

function fact(id: string, topic: Fact["topic"], text: string, names?: string[]): Fact {
  return { id, source: { kind: "record", ref: id }, when: "before", text, topic, names };
}

const originalFetch = global.fetch;
afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

function mockReply(spec: Parameters<typeof judgeReply>[1] = {}) {
  const calls: { messages: { role: string; content: string }[]; reasoningEffort?: string }[] = [];
  global.fetch = vi.fn(async (_url: unknown, init?: RequestInit) => {
    const body = JSON.parse(init!.body as string);
    calls.push(body);
    return { ok: true, json: async () => ({ content: judgeReply(body, spec) }) } as unknown as Response;
  }) as unknown as typeof fetch;
  return calls;
}

describe("the judges' prompt (design section 4)", () => {
  it("gives every judge its decision chain and its minimal pair", () => {
    const system = buildJudgeSystemPrompt(JUDGE_IDS);
    for (const id of JUDGE_IDS) {
      expect(system).toContain(`JUDGE ${id}:`);
      for (const step of RUBRICS[id].chain) expect(system).toContain(step);
      expect(system).toContain(RUBRICS[id].pair[0]);
      expect(system).toContain(RUBRICS[id].pair[1]);
    }
  });

  it("states the agency chain once, as the shared constant", () => {
    expect(RUBRICS.agency.chain).toBe(AGENCY_CHAIN);
    const system = buildJudgeSystemPrompt(["agency"]);
    for (const step of AGENCY_CHAIN) expect(system).toContain(step);
  });

  it("asks for the named facts and the reasoning before the verdict, in that order", () => {
    const system = buildJudgeSystemPrompt(["agency"]);
    const shape = system.slice(system.indexOf('"agency": {'));
    const order = ['"declared"', '"spans"', '"reasoning"', '"severity"', '"evidence"', '"factIds"', '"fix"'];
    const at = order.map((k) => shape.indexOf(k));
    expect(at.every((i) => i >= 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
  });

  it("keeps rationale out of the prompt text: no decision numbers, dates or history", () => {
    const system = buildJudgeSystemPrompt(JUDGE_IDS);
    expect(system).not.toMatch(/decision \d+/i);
    expect(system).not.toMatch(/\b20\d\d-\d\d-\d\d\b/);
    expect(system).not.toMatch(/\bused to\b/i);
  });

  it("puts the facts before the narration, and the narration last", () => {
    const facts = [fact("f1", "line", "Line: no harm to animals")];
    const user = buildJudgeUserPrompt({
      judges: ["lines_veils"],
      factsByJudge: { lines_veils: facts },
      sensitivity: { lines_veils: 5 },
      narration: "The dog barks once.",
      playerLine: "I open the gate",
    });
    expect(user.indexOf("FACTS")).toBeGreaterThanOrEqual(0);
    expect(user.indexOf("FACTS")).toBeLessThan(user.indexOf("JUDGE INPUTS"));
    expect(user.indexOf("JUDGE INPUTS")).toBeLessThan(user.indexOf("NARRATION"));
    expect(user.indexOf("f1 | line")).toBeLessThan(user.indexOf("The dog barks once."));
    expect(user.trimEnd().endsWith('"""')).toBe(true);
  });

  it("never breaks a sentence across lines in a rubric", () => {
    for (const id of JUDGE_IDS) {
      for (const step of RUBRICS[id].chain) expect(step).not.toContain("\n");
      for (const line of RUBRICS[id].pair) expect(line).not.toContain("\n");
    }
  });
});

describe("the facts each judge reads", () => {
  const facts: Fact[] = [
    fact("f1", "result", "Action roll: a miss"),
    fact("f2", "secret", "Unrevealed secret"),
    fact("f3", "line", "Line: x"),
    fact("f4", "person", "Marta is dead", ["Marta"]),
    fact("f5", "sheet", "Character sheet"),
  ];

  it("hands a judge only its own kinds", () => {
    expect(selectFactsFor("secret_leak", facts).map((f) => f.id)).toEqual(["f2"]);
    expect(selectFactsFor("lines_veils", facts).map((f) => f.id)).toEqual(["f3"]);
    expect(selectFactsFor("world_consistency", facts).map((f) => f.id)).toEqual(["f1", "f4", "f5"]);
    expect(selectFactsFor("agency", facts)).toEqual([]);
    expect(selectFactsFor("tier_gap", facts)).toEqual([]);
  });

  it("collects the sheet, the record's locations and the topics from the story", () => {
    const record = emptyCampaign();
    record.safety = { lines: [{ id: "l1", text: "no harm to children", keywords: ["child"] }], veils: [] };
    record.locations = [
      { id: "loc1", name: "The Mill", features: ["a waterwheel"], npcIds: ["n1"] },
    ];
    const story = {
      npcs: [{ id: "n1", name: "Marta", status: "dead" }],
      meters: [],
      campaign: record,
      lore: [{ title: "Sheet", content: "Gear: a lantern", type: "character_sheet", enabled: true }],
    } as unknown as Parameters<typeof collectTurnFacts>[0];
    const out = collectTurnFacts(story, story, []);
    expect(out.map((f) => f.topic)).toEqual(["line", "person", "location", "sheet"]);
    expect(out.find((f) => f.topic === "location")?.names).toEqual(["The Mill", "Marta"]);
    expect(out.find((f) => f.topic === "sheet")?.text).toContain("a lantern");
  });
});

describe("parsing the keyed reply (design 11.5)", () => {
  const ctx = {
    narration: "She says she will stay, and the lamp gutters.",
    playerLine: "I climb down",
    allowedFactIds: { agency: new Set(["f1"]), outcome: new Set<string>() } as Partial<
      Record<JudgeId, ReadonlySet<string>>
    >,
  };

  it("reads a good reply", () => {
    const { verdicts, problems } = parseJudgeVerdicts(
      JSON.stringify({
        agency: { severity: "major", evidence: "She says she will stay", factIds: ["f1"], fix: "Cut the promise." },
        outcome: { severity: "none" },
      }),
      ["agency", "outcome"],
      ctx,
    );
    expect(problems).toEqual([]);
    expect(verdicts.agency).toEqual({
      severity: "major",
      evidence: "She says she will stay",
      factIds: ["f1"],
      fix: "Cut the promise.",
    });
    expect(verdicts.outcome?.severity).toBe("none");
  });

  it("calls a missing key unknown, and says so", () => {
    const { verdicts, problems } = parseJudgeVerdicts(
      JSON.stringify({ agency: { severity: "none" } }),
      ["agency", "outcome"],
      ctx,
    );
    expect(verdicts.outcome?.severity).toBe("unknown");
    expect(problems).toEqual([{ judge: "outcome", reason: expect.stringContaining("no verdict") }]);
  });

  it("calls malformed JSON unknown for every judge", () => {
    const { verdicts, problems } = parseJudgeVerdicts("not json at all", ["agency", "outcome"], ctx);
    expect(verdicts.agency?.severity).toBe("unknown");
    expect(verdicts.outcome?.severity).toBe("unknown");
    expect(problems).toHaveLength(2);
  });

  it("calls a quote that is not in the narration unknown", () => {
    const { verdicts, problems } = parseJudgeVerdicts(
      JSON.stringify({ agency: { severity: "major", evidence: "He draws his sword", factIds: [] } }),
      ["agency"],
      ctx,
    );
    expect(verdicts.agency?.severity).toBe("unknown");
    expect(problems[0].reason).toContain("not in the narration");
  });

  it("calls a flag with no quote unknown", () => {
    const { verdicts } = parseJudgeVerdicts(
      JSON.stringify({ agency: { severity: "major", evidence: "  ", factIds: [] } }),
      ["agency"],
      ctx,
    );
    expect(verdicts.agency?.severity).toBe("unknown");
  });

  it("calls a fact id that does not exist unknown", () => {
    const { verdicts, problems } = parseJudgeVerdicts(
      JSON.stringify({
        agency: { severity: "major", evidence: "she will stay", factIds: ["f9"] },
      }),
      ["agency"],
      ctx,
    );
    expect(verdicts.agency?.severity).toBe("unknown");
    expect(problems[0].reason).toContain("f9");
  });

  it("calls an unlisted severity unknown", () => {
    const { verdicts } = parseJudgeVerdicts(
      JSON.stringify({ agency: { severity: "catastrophic", evidence: "she will stay" } }),
      ["agency"],
      ctx,
    );
    expect(verdicts.agency?.severity).toBe("unknown");
  });

  it("lets the tier judge quote the player's line", () => {
    const { verdicts } = parseJudgeVerdicts(
      JSON.stringify({ tier_gap: { severity: "major", evidence: "I climb down", factIds: [] } }),
      ["tier_gap"],
      { ...ctx, allowedFactIds: {} },
    );
    expect(verdicts.tier_gap?.severity).toBe("major");
  });

  it("matches a quote through curly quotes, case and ellipses", () => {
    expect(quoteAppearsIn("“she says”", 'The old woman: "She says" nothing more')).toBe(true);
    expect(quoteAppearsIn("She says ... the lamp", ctx.narration)).toBe(true);
    expect(quoteAppearsIn("the lamp ... She says", ctx.narration)).toBe(true); // fragments, not order
    expect(quoteAppearsIn("", ctx.narration)).toBe(false);
  });
});

describe("each judge's precondition", () => {
  const settings = (patch: Partial<ObserverSettings> = {}): ObserverSettings => ({
    ...cloneDefaultObserverSettings(),
    ...patch,
  });
  const verdict: OutcomeVerdict = { checkId: "c1", toolName: "action_roll", tier: "miss", contextForStory: "miss" };

  it("runs nothing for an empty narration", () => {
    expect(selectJudges(turn({ narration: "  " }))).toEqual([]);
  });

  it("runs the agency judge only when there is a player line", () => {
    expect(selectJudges(turn())).toContain("agency");
    expect(selectJudges(turn({ playerChoice: "" }))).not.toContain("agency");
  });

  it("runs the length judge only past the ceiling", () => {
    expect(selectJudges(turn())).not.toContain("length");
    expect(selectJudges(turn({ narration: LONG, replyLength: "medium" }))).toContain("length");
  });

  it("runs the outcome judge only with a typed ruling", () => {
    expect(selectJudges(turn())).not.toContain("outcome");
    expect(selectJudges(turn({ rollResults: [verdict] }))).toContain("outcome");
  });

  it("runs the oracle judge only when no oracle or table was consulted", () => {
    expect(selectJudges(turn())).toContain("oracle_gap");
    expect(selectJudges(turn({ toolNames: ["fate_question"] }))).not.toContain("oracle_gap");
  });

  it("runs the tier judge only below the top tier", () => {
    expect(selectJudges(turn())).not.toContain("tier_gap");
    expect(selectJudges(turn({ tierUsed: 1 }))).toContain("tier_gap");
    expect(selectJudges(turn({ tierUsed: 3 }))).not.toContain("tier_gap");
  });

  it("runs the world judge only when the narration names a person or place of the record", () => {
    const facts = [fact("f1", "person", "Marta is dead", ["Marta"])];
    expect(selectJudges(turn({ facts }))).not.toContain("world_consistency");
    expect(
      selectJudges(turn({ facts, narration: "Marta sets the lamp down." })),
    ).toContain("world_consistency");
    // A whole word, not a part of one.
    expect(
      selectJudges(turn({ facts, narration: "The Martan guard waves." })),
    ).not.toContain("world_consistency");
  });

  it("runs the secret and line judges only when the record holds a fact of their kind", () => {
    expect(selectJudges(turn())).not.toContain("secret_leak");
    expect(selectJudges(turn())).not.toContain("lines_veils");
    const facts = [fact("f1", "secret", "Unrevealed secret"), fact("f2", "veil", "Veil: x")];
    const picked = selectJudges(turn({ facts }));
    expect(picked).toContain("secret_leak");
    expect(picked).toContain("lines_veils");
  });

  it("leaves out a judge the player turned off", () => {
    const off = { enabled: false, triggersReset: false, sensitivity: 5 };
    const s = settings({ player_agency: off, missing_oracle_or_table: off });
    const picked = selectJudges(turn({ settings: s }));
    expect(picked).not.toContain("agency");
    expect(picked).not.toContain("oracle_gap");
  });

  it("keeps the call order of the eight judges", () => {
    const facts = [
      fact("f1", "person", "Marta is dead", ["Marta"]),
      fact("f2", "secret", "s"),
      fact("f3", "line", "l"),
    ];
    const picked = selectJudges(
      turn({ facts, narration: `Marta ${LONG}`, rollResults: [verdict], tierUsed: 1, replyLength: "medium" }),
    );
    expect(picked).toEqual(JUDGE_IDS.filter((j) => picked.includes(j)));
    expect(picked).toEqual([...JUDGE_IDS]);
  });
});

describe("the split when the facts are large", () => {
  const big = (id: string, topic: Fact["topic"], chars: number) =>
    fact(id, topic, "x".repeat(chars), ["Marta"]);

  it("is one call while the facts fit", () => {
    const facts = [fact("f1", "secret", "short"), fact("f2", "result", "short")];
    expect(planCalls(["agency", "secret_leak"], facts)).toEqual([["agency", "secret_leak"]]);
  });

  it("splits into two calls by judge group, cutting no fact", () => {
    const facts = [
      big("f1", "sheet", JUDGE_FACT_BUDGET_TOKENS * 4 + 400),
      fact("f2", "result", "Action roll: a miss"),
    ];
    const plan = planCalls(["agency", "outcome", "world_consistency"], facts);
    expect(plan).toEqual([["agency", "outcome"], ["world_consistency"]]);
  });

  it("keeps one group whole when it is the only group", () => {
    const facts = [big("f1", "secret", JUDGE_FACT_BUDGET_TOKENS * 4 + 400)];
    expect(planCalls(["secret_leak", "lines_veils"], facts)).toEqual([["secret_leak", "lines_veils"]]);
  });

  it("makes two calls and gives the world call the large fact in full", async () => {
    const hugeSheet = "lantern ".repeat(JUDGE_FACT_BUDGET_TOKENS + 200);
    const facts = [
      fact("f1", "person", "Marta is dead", ["Marta"]),
      { ...fact("f2", "sheet", `Character sheet "S": ${hugeSheet}`), source: { kind: "sheet" as const, ref: "S" } },
    ];
    const calls = mockReply();
    const result = await runCombinedJudges(
      turn({ facts, narration: "Marta sets the lamp down.", playerChoice: "I wait" }),
      apiOptions,
    );
    expect(result.calls).toBe(2);
    const world = calls.find((c) => requestedJudges(c).includes("world_consistency"))!;
    const engine = calls.find((c) => requestedJudges(c).includes("agency"))!;
    expect(world.messages[1].content).toContain(hugeSheet);
    expect(engine.messages[1].content).not.toContain("lantern");
    expect(requestedJudges(world)).not.toContain("agency");
  });
});

describe("runCombinedJudges", () => {
  it("makes no call when no judge has anything to judge", async () => {
    const calls = mockReply();
    const result = await runCombinedJudges(turn({ playerChoice: "", toolNames: ["fate_question"] }), apiOptions);
    expect(calls).toHaveLength(0);
    expect(result.ran).toEqual([]);
  });

  it("puts every judge whose precondition holds into one call, with an explicit effort", async () => {
    const calls = mockReply({ agency: "major" });
    const result = await runCombinedJudges(turn({ tierUsed: 1 }), apiOptions);
    expect(calls).toHaveLength(1);
    expect(requestedJudges(calls[0])).toEqual(["agency", "oracle_gap", "tier_gap"]);
    expect(calls[0].reasoningEffort).toBeTruthy();
    expect(result.verdicts.agency?.severity).toBe("major");
    expect(result.verdicts.oracle_gap?.severity).toBe("none");
  });

  it("states the narration last and the player's line before it", async () => {
    const calls = mockReply();
    await runCombinedJudges(turn(), apiOptions);
    const user = calls[0].messages[1].content;
    expect(narrationOf(calls[0])).toContain("rung by rung");
    expect(user.indexOf("PLAYER'S LINE")).toBeLessThan(user.indexOf("NARRATION"));
  });

  it("calls every judge unknown when the call fails, and raises no flag", async () => {
    global.fetch = vi.fn(async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const flags = await runObserver({
      narration: "You take the ladder.",
      playerChoice: "I climb down",
      tierUsed: 1,
      apiOptions,
    });
    expect(flags).toEqual([]);
  });

  it("lets a Stop through", async () => {
    global.fetch = vi.fn(async () => {
      throw Object.assign(new Error("aborted"), { name: "AbortError" });
    }) as unknown as typeof fetch;
    await expect(
      runCombinedJudges(turn(), apiOptions),
    ).rejects.toMatchObject({ name: "AbortError" });
  });
});

describe("runObserver on the combined call", () => {
  it("makes one call for the whole turn and raises each judge's flag", async () => {
    const calls = mockReply({
      agency: { severity: "major", fix: "Cut the promise." },
      oracle_gap: "minor",
    });
    const flags = await runObserver({
      narration: "You take the ladder and tell her you will stay.",
      playerChoice: "I climb down",
      apiOptions,
    });
    expect(calls).toHaveLength(1);
    expect(flags.map((f) => [f.type, f.severity])).toEqual([
      ["player_agency", "major"],
      ["missing_oracle_or_table", "minor"],
    ]);
    expect(flags[0].detail).toBe("Cut the promise.");
  });

  it("never quotes a secret in a flag the player can see", async () => {
    mockReply({
      secret_leak: { severity: "major", evidence: "who killed the clerk", fix: "Remove: the warden killed the clerk." },
    });
    const flags = await runObserver({
      narration: "The warden, who killed the clerk three nights ago, locks the door.",
      playerChoice: "",
      toolNames: ["fate_question"],
      facts: [fact("f1", "secret", 'Unrevealed secret "The clerk": the warden killed the clerk')],
      phraseHits: ['"killed the clerk" (a key phrase of "The clerk") appears before the secret is revealed'],
      apiOptions,
    });
    expect(flags).toHaveLength(1);
    expect(flags[0].type).toBe("secret_leak");
    expect(JSON.stringify(flags[0])).not.toContain("warden");
  });

  it("hands the key-phrase hits to the secret judge", async () => {
    const calls = mockReply();
    await runObserver({
      narration: "The warden locks the door.",
      playerChoice: "",
      toolNames: ["fate_question"],
      facts: [fact("f1", "secret", "Unrevealed secret")],
      phraseHits: ['"locks the door" (a key phrase of "The clerk")'],
      apiOptions,
    });
    expect(calls[0].messages[1].content).toContain('PHRASE HITS: "locks the door"');
  });

  it("flags a scene skip with no increment, free of any call", async () => {
    const calls = mockReply();
    const flags = await runObserver({
      narration: "Hours later, you wake in the cart.",
      playerChoice: "",
      toolNames: ["fate_question"],
      apiOptions,
    });
    expect(calls).toHaveLength(0);
    expect(flags.map((f) => f.type)).toEqual(["missing_scene_increment"]);
    expect(flags[0].severity).toBe("minor");
  });

  it("raises no scene flag when increment_scene ran or the check is off", () => {
    const on = { enabled: true, triggersReset: false, sensitivity: 5 };
    expect(sceneIncrementFlag("The next morning, rain.", ["increment_scene"], on)).toBeNull();
    expect(sceneIncrementFlag("The next morning, rain.", [], { ...on, enabled: false })).toBeNull();
    expect(sceneIncrementFlag("You wait by the fire.", [], on)).toBeNull();
    expect(sceneIncrementFlag("The next morning, rain.", [], { ...on, sensitivity: 9 })?.severity).toBe("major");
  });

  it("suspends the judges in session zero without a call", async () => {
    const calls = mockReply();
    const flags = await runObserver({
      narration: "You take the ladder.",
      playerChoice: "I climb down",
      sessionZeroActive: true,
      apiOptions,
    });
    expect(flags).toEqual([]);
    expect(calls).toHaveLength(0);
  });
});

describe("acting on several major flags (design 11.5)", () => {
  const flag = (type: ObserverFlag["type"]): ObserverFlag => ({
    type,
    severity: "major",
    detail: type,
    correctivePrompt: type,
  });
  const rewriting = cloneDefaultObserverSettings();

  it("picks by priority, not by list order", () => {
    const flags = [flag("response_length"), flag("player_agency"), flag("outcome_narration_mismatch")];
    expect(pickMajorFlag(flags, rewriting)?.type).toBe("outcome_narration_mismatch");
    expect(pickMajorFlag(flags.slice(0, 2), rewriting)?.type).toBe("player_agency");
  });

  it("orders safety, secrets, outcome, world, agency, length", () => {
    expect(FLAG_PRIORITY.slice(0, 6)).toEqual([
      "lines_and_veils",
      "secret_leak",
      "outcome_narration_mismatch",
      "world_consistency",
      "player_agency",
      "response_length",
    ]);
  });

  it("skips a flag whose type may not correct the turn, and a minor one", () => {
    const flags = [
      flag("lines_and_veils"), // flag-only in this slice
      { ...flag("outcome_narration_mismatch"), severity: "minor" as const },
      flag("response_length"),
    ];
    expect(pickMajorFlag(flags, rewriting)?.type).toBe("response_length");
    expect(pickMajorFlag(flags, rewriting, (t) => t !== "response_length")).toBeUndefined();
  });
});
