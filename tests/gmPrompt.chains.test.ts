/**
 * GM prompt plan slice 2: the roll chain, the agency chain, the thinking rule,
 * the acknowledgement, the live block's roll tool, and the generation-case
 * runner (mocked provider: no model is called).
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildGMStagePrompt } from "@/app/misc/ai_staged";
import { AGENCY_CHAIN } from "@/app/misc/judges/prompts";
import { rollDecisionChain, rollToolFor } from "@/app/misc/gmPromptChains";
import { createAGMTState } from "@/app/misc/mythic";
import { BLOOD_AND_BONE_ID } from "@/app/misc/systems/blood-and-bone";
import { FANTASTIC_REALMS_ID } from "@/app/misc/systems/fantastic-realms";
import type { StoryData } from "@/app/misc/structs";
import { parseFixtureText, type GenerationFixture } from "@/app/misc/judges/evalFormat";
import { GM_TOOL_SCHEMAS } from "@/app/misc/gmTools";

const callSideModel = vi.fn();
vi.mock("@/app/misc/sideModelCall", async (orig) => ({
  ...(await orig<typeof import("@/app/misc/sideModelCall")>()),
  callSideModel: (...args: unknown[]) => callSideModel(...args),
}));

function story(overrides: Partial<StoryData> = {}): StoryData {
  return {
    story_name: "T",
    premise: "p",
    player_name: "Hero",
    scene: { parts: [] },
    lore: [],
    memory: [],
    npcs: [],
    goals: [],
    agmtState: createAGMTState(),
    ...overrides,
  } as unknown as StoryData;
}

const withSystem = (id: string): Partial<StoryData> => ({
  systemState: { sessionCount: 0, dedupKeys: [], systemId: id, usesSystemTools: true },
});

function prompt(s: StoryData, native = false) {
  const { messages } = buildGMStagePrompt({ storyData: s, userChoice: "Look around", usesNativeReasoning: native });
  return {
    system: messages[0].content as string,
    ack: messages[2].content as string,
    last: messages[messages.length - (native ? 1 : 2)].content as string,
  };
}

describe("the roll chain and the cache rule", () => {
  it("leaves the system prompt identical for every system", () => {
    const none = prompt(story()).system;
    expect(prompt(story(withSystem(BLOOD_AND_BONE_ID))).system).toBe(none);
    expect(prompt(story(withSystem(FANTASTIC_REALMS_ID))).system).toBe(none);
    expect(prompt(story({ diceMode: "manual" } as Partial<StoryData>)).system).not.toBe(undefined);
  });

  it("names the roll tool from the resolved system, in the live block only", () => {
    expect(prompt(story()).last).toContain("`formula_roll` for the player character's declared risky action");
    expect(prompt(story(withSystem(BLOOD_AND_BONE_ID))).last).toContain("`action_roll`");
    expect(prompt(story(withSystem(FANTASTIC_REALMS_ID))).last).toContain("`feat_roll`");
    expect(rollToolFor(story({ diceMode: "manual" } as Partial<StoryData>)).tool).toBe("ask_for_roll");
    const system = prompt(story(withSystem(FANTASTIC_REALMS_ID))).system;
    expect(system).not.toContain("feat_roll");
    expect(system).not.toContain("action_roll");
  });

  it("states the chain once, in step order, with both example pairs", () => {
    const chain = rollDecisionChain();
    expect(chain.indexOf("1. Read")).toBeLessThan(chain.indexOf("2. Did the player declare"));
    expect(chain.indexOf("2. Did the player declare")).toBeLessThan(chain.indexOf("3. Does your narration"));
    expect(chain.indexOf("3. Does your narration")).toBeLessThan(chain.indexOf("4. Narrate"));
    expect(chain).toContain("I lie to the innkeeper");
    expect(chain).toContain("fog");
    const { system } = prompt(story());
    expect(system.split("WHEN TO ROLL, ASK THE ORACLE, OR NARRATE")).toHaveLength(2);
  });
});

describe("the agency chain", () => {
  it("is the judge's own text, steps and all", () => {
    const { system } = prompt(story());
    for (const step of AGENCY_CHAIN) expect(system).toContain(step);
    expect(system).toContain('"Go on"');
    expect(system).toContain('"I attack the guard"');
  });

  it("drops the old statements and the closing restatements", () => {
    const { system } = prompt(story());
    expect(system).not.toContain("CORE STANCE");
    expect(system).not.toContain("Never narrate what the player character says");
    expect(system).not.toContain("Keep every turn tight and short");
  });
});

describe("the thinking rule and the acknowledgement", () => {
  it("asks for a thinking block only from a model that does not reason natively", () => {
    expect(prompt(story(), false).last).toContain("inside <thinking>");
    expect(prompt(story(), true).last).not.toContain("<thinking>");
    expect(prompt(story(), false).system).not.toContain("ALWAYS start with <thinking>");
  });

  it("acknowledges with a plain Ready.", () => {
    expect(prompt(story()).ack).toBe("Ready.");
  });

  it("walks the turn in causal order", () => {
    const { last } = prompt(story());
    const order = ["1. Read", "2. Decide", "3. Roll", "4. Write"].map((s) => last.indexOf(s));
    expect(order.every((n) => n > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });
});

describe("the stakes description", () => {
  it("says high and deadly last the scene", () => {
    const tool = GM_TOOL_SCHEMAS.find((t) => t.function.name === "formula_roll");
    const props = (tool?.function.parameters as { properties: Record<string, { description?: string }> }).properties;
    expect(props.stakes.description).toMatch(/high or deadly lasts the scene/);
  });
});

describe("the generation cases", () => {
  const dir = join(process.cwd(), "evals", "generation");
  const files = readdirSync(dir).filter((f) => f.endsWith(".json"));

  it("all parse as generation fixtures (the slice-2 cases are published, being invented)", () => {
    expect(files.length).toBeGreaterThanOrEqual(8);
    for (const f of files) {
      const parsed = parseFixtureText(readFileSync(join(dir, f), "utf8"));
      expect(parsed.ok, f).toBe(true);
      if (parsed.ok) {
        expect(parsed.fixture.kind).toBe("generation");
      }
    }
  });

  it("validates narrationExcludes and rejects an empty expect", () => {
    const base = { v: 1, kind: "generation", id: "x", published: true, storySnapshot: {}, playerLine: "go" };
    expect(parseFixtureText(JSON.stringify({ ...base, expect: { narrationExcludes: ["a"] } })).ok).toBe(true);
    expect(parseFixtureText(JSON.stringify({ ...base, expect: { narrationExcludes: "a" } })).ok).toBe(false);
    expect(parseFixtureText(JSON.stringify({ ...base, expect: {} })).ok).toBe(false);
    expect(parseFixtureText(JSON.stringify({ ...base, expect: { proseMatching: ["("] } })).ok).toBe(false);
  });
});

describe("the generation runner", () => {
  beforeEach(() => callSideModel.mockReset());

  async function load(id: string): Promise<GenerationFixture> {
    const text = readFileSync(join(process.cwd(), "evals", "generation", `${id}.json`), "utf8");
    const parsed = parseFixtureText(text);
    if (!parsed.ok || parsed.fixture.kind !== "generation") throw new Error(`bad fixture ${id}`);
    return parsed.fixture;
  }
  const slot = { label: "Default", model: "GLM 5.3", effort: "none" };
  const ok = (content: string, toolCalls: unknown[] = []) => ({
    ok: true,
    data: { content, reasoning: "", reasoning_details: [], toolCalls, meta: { usage: {} } },
  });

  it("checks calls and prose against expect", async () => {
    const { checkGenerationExpect } = await import("@/app/misc/judges/generationEval");
    expect(checkGenerationExpect({ noCalls: ["formula_roll"] }, { calls: ["formula_roll"], prose: "" })).toEqual([
      "called formula_roll",
    ]);
    expect(checkGenerationExpect({ callsAny: ["a", "b"] }, { calls: [], prose: "" })).toHaveLength(1);
    expect(checkGenerationExpect({ proseNotMatching: ["\\byou say\\b"] }, { calls: [], prose: "You say hi" })).toHaveLength(1);
    expect(checkGenerationExpect({ narrationExcludes: ["Vault Key"] }, { calls: [], prose: "the vault key" })).toHaveLength(1);
    expect(checkGenerationExpect({ narrationExcludes: ["x"] }, { calls: [], prose: "fine" })).toEqual([]);
  });

  it("checks the arguments of a tool's calls (one setup step per call, an intro on it)", async () => {
    const { checkArgumentRules } = await import("@/app/misc/judges/generationEval");
    const rules = {
      tool: "ask_question",
      maxDistinctSetupStepsPerCall: 1,
      everyFirstItemPerTagHas: ["intro"],
      setupStepIn: ["name_look", "history"],
    };
    const call = (questions: unknown[]) => [{ name: "ask_question", args: { questions } }];
    expect(checkArgumentRules(rules, call([{ setup_step: "history", intro: "Where from?" }]))).toEqual([]);
    expect(
      checkArgumentRules(rules, call([{ setup_step: "history", intro: "x" }, { setup_step: "name_look", intro: "y" }])),
    ).toHaveLength(1);
    expect(checkArgumentRules(rules, call([{ setup_step: "history" }]))).toEqual(["first history question has no intro"]);
    expect(checkArgumentRules(rules, call([{ setup_step: "drives", intro: "x" }]))).toHaveLength(1);
    expect(checkArgumentRules(rules, [{ name: "other", args: {} }])).toEqual([]);
  });

  it("scores a roll case across rounds, answering the call from the script", async () => {
    const { runGenerationOnce } = await import("@/app/misc/judges/generationEval");
    const fixture = await load("agency-i-attack");
    callSideModel
      .mockResolvedValueOnce(ok("", [{ id: "c1", function: { name: "formula_roll", arguments: "{}" } }]))
      .mockResolvedValueOnce(ok("<thinking>x</thinking>Brannoch Veil staggers back from the cudgel."));
    const record = await runGenerationOnce(fixture, slot, 1, {});
    expect(callSideModel).toHaveBeenCalledTimes(2);
    const secondMessages = callSideModel.mock.calls[1][0].messages as { role: string; content: string }[];
    expect(secondMessages[secondMessages.length - 1]).toMatchObject({ role: "tool", tool_call_id: "c1" });
    expect(secondMessages[secondMessages.length - 1].content).toContain("total");
    expect(record.passed).toBe(true);
    expect(record.calls).toEqual(["formula_roll"]);
    expect(record.prose).not.toContain("thinking");
  });

  it("fails a case that rolls when it should narrate, and keeps a provider error apart", async () => {
    const { runGenerationOnce } = await import("@/app/misc/judges/generationEval");
    const fixture = await load("roll-vs-narrate-ask-gossip");
    callSideModel.mockResolvedValueOnce(ok("", [{ id: "c1", function: { name: "formula_roll", arguments: "{}" } }]));
    callSideModel.mockResolvedValueOnce(ok("He says Wen Tarrow."));
    const failed = await runGenerationOnce(fixture, slot, 1, {});
    expect(failed.passed).toBe(false);
    expect(failed.failures).toEqual(["called formula_roll"]);
    callSideModel.mockResolvedValueOnce({ ok: false, error: "boom" });
    const errored = await runGenerationOnce(fixture, slot, 2, {});
    expect(errored.error).toBe("boom");
    expect(errored.passed).toBe(false);
    const { buildGenerationReport } = await import("@/app/misc/judges/generationEval");
    const report = buildGenerationReport([failed, errored], { runs: 2, generatedAt: "t" });
    expect(report.cases[0]).toMatchObject({ runs: 1, failing: 1, errors: 1 });
  });

  it("builds the request the GM would get, with the tools the story is offered", async () => {
    const { buildGenerationRequest } = await import("@/app/misc/judges/generationEval");
    const fixture = await load("roll-vs-narrate-lie-for-key");
    const { messages, tools } = buildGenerationRequest(fixture, slot);
    expect(messages[0].role).toBe("system");
    expect(JSON.stringify(messages)).toContain("I lie to Odrell Pim");
    expect(JSON.stringify(tools)).toContain("formula_roll");
  });
});
