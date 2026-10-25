/**
 * The pieces of confirmation and the rewrite with facts (judge layer v2, plan
 * slice 3): the confirming model and its family rule, agreement, the facts a
 * rewrite may be handed, the fix plan, the re-check, and what leaves the host.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import {
  MAX_CONFIRMATIONS,
  confirmFinding,
  confirmMajorFlags,
  evidenceOverlaps,
  resolveConfirmModel,
  rewriterFactsFor,
} from "@/app/misc/judges/confirm";
import {
  PROSE_SEPARATOR,
  buildFindingsBlock,
  parseFixPlan,
  planFollowed,
  recheckRewrite,
} from "@/app/misc/judges/rewritePlan";
import { kindOnlyFlag, withoutPrivateFindings } from "@/app/misc/judges/publicView";
import { combinedResultToFlags, type JudgeTurn } from "@/app/misc/judges/combined";
import { collectTurnFacts } from "@/app/misc/judges/facts";
import type { ConfirmedFinding, Fact } from "@/app/misc/judges/types";
import { confirmModelFamily } from "@/app/misc/ai_prices";
import {
  DEFAULT_OBSERVER_SETTINGS,
  REWRITABLE_FLAG_TYPES,
  cloneDefaultObserverSettings,
  observerModeOf,
  settingsFor,
  type ObserverSettings,
} from "@/app/misc/observer";
import { SYNCABLE_SETTINGS_KEYS } from "@/app/misc/syncableSettingsKeys";
import { emptyCampaign } from "@/app/misc/campaign/types";
import type { ObserverFlag, StoryData } from "@/app/misc/structs";
import { judgeReply } from "./helpers/combinedJudges";

const NARRATION = "Marta sets the lamp down. The warden, who killed the clerk, locks the gate.";
const SECRET = "The warden killed the clerk";

const fact = (
  id: string,
  topic: Fact["topic"],
  text: string,
  extra: Partial<Fact> = {},
): Fact => ({
  id,
  source: { kind: "record", ref: id },
  when: "before",
  text,
  topic,
  ...extra,
});

describe("model families", () => {
  it("names a family from the catalog, not from the key's spelling", () => {
    expect(confirmModelFamily("Claude Haiku 5.5")).toBe("anthropic");
    expect(confirmModelFamily("Claude Haiku (subscription)")).toBe("anthropic");
    expect(confirmModelFamily("GLM 5.3")).toBe("zai");
    expect(confirmModelFamily("GLM 5.3 (Z.ai)")).toBe("zai");
    expect(confirmModelFamily("GLM 5.3")).not.toBe(confirmModelFamily("Claude Haiku 5.5"));
    expect(confirmModelFamily("Mistral Medium 3.5")).toBe("mistral");
  });
  it("gives a custom model the family of its OpenRouter id's vendor, else its own", () => {
    const uuid = "123e4567-e89b-12d3-a456-426614174000";
    expect(confirmModelFamily(uuid)).toBe(`custom:${uuid}`);
    const store = new Map<string, string>([
      [
        "customModels",
        JSON.stringify([
          { id: uuid, modelId: "anthropic/claude-sonnet-4", name: "x", contextSize: 1, maxOutputTokens: 1 },
        ]),
      ],
    ]);
    const storage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: () => {},
      removeItem: () => {},
      clear: () => {},
    };
    vi.stubGlobal("localStorage", storage);
    vi.stubGlobal("window", { localStorage: storage, addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn() });
    try {
      expect(confirmModelFamily(uuid)).toBe("anthropic");
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("the confirming model", () => {
  const pick = { model: "GLM 5.3", reasoningEffort: "none" as const };
  it("is GLM 5.3 when the player has an OpenRouter key and the first judge is Claude", () => {
    const r = resolveConfirmModel({
      judgeModel: "Claude Haiku 5.5",
      keys: { openRouterKey: "k" },
      pick,
      fallbackModel: "GLM 5.3",
    });
    expect(r).toMatchObject({ ok: true, model: "GLM 5.3", family: "zai" });
  });
  it("falls back to another family the player has a key for when the pick has no key", () => {
    const r = resolveConfirmModel({
      judgeModel: "Claude Haiku 5.5",
      keys: { mistralKey: "k" },
      pick,
      fallbackModel: "GLM 5.3",
    });
    expect(r).toMatchObject({ ok: true, family: "mistral", fellBackFrom: { model: "GLM 5.3", reason: "no_key" } });
  });
  it("falls back when the pick is the first judge's own family, never to that family", () => {
    const r = resolveConfirmModel({
      judgeModel: "GLM 5.3 (Z.ai)",
      keys: { openRouterKey: "k", zaiKey: "k" },
      pick,
      fallbackModel: "GLM 5.3",
    });
    expect(r).toMatchObject({ ok: true, fellBackFrom: { reason: "same_family" } });
    expect(r.ok && r.family).not.toBe("zai");
  });
  it("falls back from a subscription pick that cannot run here, and never picks a subscription model", () => {
    const r = resolveConfirmModel({
      judgeModel: "GLM 5.3",
      keys: { openRouterKey: "k" },
      pick: { model: "Claude Haiku (subscription)", reasoningEffort: "none" },
      fallbackModel: "GLM 5.3",
    });
    expect(r).toMatchObject({ ok: true, fellBackFrom: { reason: "cannot_run" } });
    expect(r.ok && r.model).not.toMatch(/subscription/);
  });
  it("has no confirmer when no other family has a key, and names why the pick failed", () => {
    const r = resolveConfirmModel({
      judgeModel: "GLM 5.3 (Z.ai)",
      keys: { zaiKey: "k" },
      pick,
      fallbackModel: "GLM 5.3",
    });
    expect(r).toMatchObject({ ok: false, reason: "no_key", model: "GLM 5.3" });
    const same = resolveConfirmModel({
      judgeModel: "GLM 5.3 (Z.ai)",
      keys: { zaiKey: "k" },
      pick: { model: "GLM 5.3 (Z.ai)", reasoningEffort: "none" },
      fallbackModel: "GLM 5.3",
    });
    expect(same).toMatchObject({ ok: false, reason: "same_family", family: "zai" });
  });
  it("reads a pick the catalog dropped as the default", () => {
    const r = resolveConfirmModel({
      judgeModel: "Claude Haiku 5.5",
      keys: { openRouterKey: "k" },
      pick: { model: "A Model That Was Removed", reasoningEffort: "none" },
      fallbackModel: "GLM 5.3",
    });
    expect(r).toMatchObject({ ok: true, model: "GLM 5.3" });
  });
});

describe("agreement", () => {
  it("is quotes that hold each other or share a run of three words", () => {
    expect(evidenceOverlaps("who killed the clerk", "the warden, who killed the clerk, locks")).toBe(true);
    expect(evidenceOverlaps("Marta sets the lamp down", "marta sets the lamp")).toBe(true);
    expect(evidenceOverlaps("tells you to hurry", "locks the gate quietly")).toBe(false);
    expect(evidenceOverlaps("", "anything at all")).toBe(false);
  });
});

describe("confirmFinding", () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });
  const turn = (): JudgeTurn => ({
    narration: NARRATION,
    playerChoice: "I follow her",
    toolNames: [],
    rollResults: [],
    facts: [fact("f1", "secret", `Unrevealed secret "The clerk": ${SECRET}`)],
  });
  const api = { model: "GLM 5.3", token: null, openRouterKey: "k", reasoningEffort: "none" };
  function reply(content: string) {
    global.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ content }) }) as unknown as Response) as unknown as typeof fetch;
  }

  it("agrees on a major verdict with overlapping evidence", async () => {
    global.fetch = vi.fn(async (_u: unknown, init?: RequestInit) => ({
      ok: true,
      json: async () => ({
        content: judgeReply(JSON.parse(init!.body as string), {
          secret_leak: { severity: "major", evidence: "who killed the clerk, locks the gate", factIds: ["f1"] },
        }),
      }),
    }) as unknown as Response) as unknown as typeof fetch;
    const r = await confirmFinding({ judge: "secret_leak", evidence: "who killed the clerk" }, turn(), api);
    expect(r.status).toBe("agreed");
  });
  it("disagrees on a minor verdict", async () => {
    global.fetch = vi.fn(async (_u: unknown, init?: RequestInit) => ({
      ok: true,
      json: async () => ({
        content: judgeReply(JSON.parse(init!.body as string), {
          secret_leak: { severity: "minor", evidence: "who killed the clerk, locks" },
        }),
      }),
    }) as unknown as Response) as unknown as typeof fetch;
    const r = await confirmFinding({ judge: "secret_leak", evidence: "who killed the clerk" }, turn(), api);
    expect(r.status).toBe("disagreed");
  });
  it("is unknown for a reply it cannot read, and for a failed call", async () => {
    reply("no json here");
    expect((await confirmFinding({ judge: "secret_leak", evidence: "who killed the clerk" }, turn(), api)).status).toBe("unknown");
    global.fetch = vi.fn(async () => ({ ok: false, status: 500, json: async () => ({ error: "boom" }) }) as unknown as Response) as unknown as typeof fetch;
    expect((await confirmFinding({ judge: "secret_leak", evidence: "who killed the clerk" }, turn(), api)).status).toBe("unknown");
  });
  it("lets a Stop through", async () => {
    global.fetch = vi.fn(async () => {
      throw Object.assign(new Error("aborted"), { name: "AbortError" });
    }) as unknown as typeof fetch;
    await expect(
      confirmFinding({ judge: "secret_leak", evidence: "who killed the clerk" }, turn(), api),
    ).rejects.toMatchObject({ name: "AbortError" });
  });
});

describe("confirmMajorFlags", () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });
  const flag = (type: ObserverFlag["type"]): ObserverFlag => ({
    type,
    severity: "major",
    detail: "fixed sentence",
    correctivePrompt: "x",
    finding: { evidence: "Marta sets the lamp down", factIds: [], fix: "" },
  });
  const rewriting: ObserverSettings = (() => {
    const s = cloneDefaultObserverSettings();
    s.secret_leak.triggersReset = true;
    s.world_consistency.triggersReset = true;
    s.lines_and_veils.triggersReset = true;
    return s;
  })();
  const base = { model: "Claude Haiku 5.5", token: null, openRouterKey: "k" };

  it("confirms no more than two, and makes no call at all with no key", async () => {
    const fetchMock = vi.fn(async (_u: unknown, init?: RequestInit) => ({
      ok: true,
      json: async () => ({
        content: judgeReply(JSON.parse(init!.body as string), {
          agency: "major",
          length: "major",
          outcome: "major",
        }),
      }),
    }) as unknown as Response);
    global.fetch = fetchMock as unknown as typeof fetch;
    const turn: JudgeTurn = {
      narration: "Marta sets the lamp down and tells you to hurry onward.",
      playerChoice: "I go",
      toolNames: [],
      rollResults: [],
      facts: [],
    };
    const flags = [flag("player_agency"), flag("response_length"), flag("outcome_narration_mismatch")];
    const run = await confirmMajorFlags({
      flags,
      settings: rewriting,
      rewritable: REWRITABLE_FLAG_TYPES,
      turn,
      judgeModel: "Claude Haiku 5.5",
      base,
      pick: { model: "GLM 5.3", reasoningEffort: "none" },
      fallbackModel: "GLM 5.3",
    });
    expect(MAX_CONFIRMATIONS).toBe(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(run.attempted).toBe(2);
    expect(run.confirmed.map((c) => c.flag.type)).toEqual(["outcome_narration_mismatch", "player_agency"]);

    fetchMock.mockClear();
    const none = await confirmMajorFlags({
      flags,
      settings: rewriting,
      rewritable: REWRITABLE_FLAG_TYPES,
      turn,
      judgeModel: "Claude Haiku 5.5",
      base: { ...base, openRouterKey: undefined },
      pick: { model: "GLM 5.3", reasoningEffort: "none" },
      fallbackModel: "GLM 5.3",
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(none.confirmed).toEqual([]);
    expect(none.skipped).toContain("no key");
  });

  it("skips a flag with no finding behind it", async () => {
    const fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    const bare: ObserverFlag = { type: "player_agency", severity: "major", detail: "d", correctivePrompt: "c" };
    const run = await confirmMajorFlags({
      flags: [bare],
      settings: rewriting,
      rewritable: REWRITABLE_FLAG_TYPES,
      turn: { narration: NARRATION, playerChoice: "I go", toolNames: [], rollResults: [], facts: [] },
      judgeModel: "Claude Haiku 5.5",
      base,
      pick: { model: "GLM 5.3", reasoningEffort: "none" },
      fallbackModel: "GLM 5.3",
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(run.attempted).toBe(0);
  });
});

describe("the facts a rewrite is handed", () => {
  const facts: Fact[] = [
    fact("f1", "secret", `Unrevealed secret "The clerk": ${SECRET}`),
    fact("f2", "clock", `Clock "The Vigil closes in" 3/6`),
    fact("f3", "person", "Marta is dead", { source: { kind: "npc", ref: "n1" }, names: ["Marta"] }),
    fact("f4", "person", "Hollis is dead", { source: { kind: "npc", ref: "n2" }, names: ["Hollis"] }),
    fact("f6", "result", "action_roll: weak hit", { source: { kind: "tool", ref: "c-public" } }),
    fact("f7", "line", "Line: no harm to children"),
    fact("f8", "sheet", 'Character sheet "Sheet": private notes'),
  ];
  const all = facts.map((f) => f.id);

  it("never includes a secret or a clock, whatever the finding cites", () => {
    for (const judge of ["secret_leak", "world_consistency", "outcome", "lines_veils", "length", "agency"] as const) {
      const text = JSON.stringify(rewriterFactsFor(judge, all, facts, NARRATION));
      expect(text).not.toContain(SECRET);
      expect(text).not.toContain("Vigil");
    }
    expect(rewriterFactsFor("secret_leak", all, facts, NARRATION)).toEqual([]);
  });
  it("leaves out the sheet and a person the narration does not name", () => {
    const world = rewriterFactsFor("world_consistency", all, facts, NARRATION);
    expect(world.map((f) => f.id)).toEqual(["f3", "f6"]);
    expect(JSON.stringify(world)).not.toContain("private notes");
    expect(JSON.stringify(world)).not.toContain("Hollis");
  });
  it("hands over only the facts the finding cites", () => {
    expect(rewriterFactsFor("world_consistency", ["f3"], facts, NARRATION).map((f) => f.id)).toEqual(["f3"]);
    expect(rewriterFactsFor("lines_veils", ["f7"], facts, NARRATION).map((f) => f.id)).toEqual(["f7"]);
    expect(rewriterFactsFor("outcome", ["f6"], facts, NARRATION).map((f) => f.id)).toEqual(["f6"]);
  });
  it("builds tool facts from the player-facing summary: no hidden roll, no GM reason", () => {
    const view = { npcs: [], meters: [], campaign: undefined };
    const REASON = "she is lying to hide that she poisoned the abbot";
    const built = collectTurnFacts(view, view, [
      {
        toolName: "npc_roll",
        toolCallId: "c1",
        success: true,
        contextForStory: `[NPC Roll: Sister Ana rolled 1d20 = 14 - ${REASON}]\n[No hit/miss verdict was computed. Compare it with \`calculate\`.]`,
      },
      { toolName: "gm_roll", toolCallId: "c2", success: true, contextForStory: "gm_roll: 4 vs the abbot's guilt" },
      { toolName: "campaign", toolCallId: "c3", success: true, contextForStory: "clock moved: the Vigil" },
      { toolName: "action_roll", toolCallId: "c4", success: true, contextForStory: "action_roll: weak hit" },
    ]);
    const text = JSON.stringify(built);
    expect(text).toContain("Sister Ana rolled 1d20 = 14");
    expect(text).toContain("weak hit");
    expect(text).not.toContain("poisoned");
    expect(text).not.toContain("guilt");
    expect(text).not.toContain("Vigil");
    // So whatever a judge cites, the rewrite is handed none of it.
    const ids = built.map((f) => f.id);
    const handed = rewriterFactsFor("world_consistency", ids, built, "Sister Ana rolled");
    expect(JSON.stringify(handed)).not.toContain("poisoned");
  });
});

describe("the findings block", () => {
  const flag = (type: ObserverFlag["type"], detail: string): ObserverFlag => ({
    type,
    severity: "major",
    detail,
    correctivePrompt: "c",
  });
  it("lists each finding with its quote, its rule and its facts, and never a secret", () => {
    const findings: ConfirmedFinding[] = [
      {
        flag: flag("secret_leak", "The narration may state part of a secret that has not been revealed yet."),
        judge: "secret_leak",
        evidence: "who killed the clerk",
        fix: "",
        facts: [],
      },
      {
        flag: flag("world_consistency", "The narration may contradict a fact the story holds."),
        judge: "world_consistency",
        evidence: "Marta sets the lamp down",
        fix: "Marta is dead.",
        facts: [fact("f3", "person", "Marta is dead")],
      },
    ];
    const block = buildFindingsBlock(findings);
    expect(block).toContain("Problems found, most serious first");
    expect(block).toContain('Quote: "who killed the clerk"');
    expect(block).toContain("Take the quoted statement out");
    expect(block).toContain("- Marta is dead");
    expect(block.indexOf("who killed")).toBeLessThan(block.indexOf("Marta sets"));
    expect(block).not.toContain(SECRET);
  });
});

describe("the fix plan", () => {
  const original = "Marta sets the lamp down. The warden locks the gate.";
  const plan = `[{"span":"Marta sets the lamp down","problem":"Marta is dead","replacement":"you take the lamp she left"}]`;
  it("splits a reply into its plan and its prose", () => {
    const r = parseFixPlan(`${plan}\n${PROSE_SEPARATOR}\nYou take the lamp she left. The warden locks the gate.`, original);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.plan).toHaveLength(1);
      expect(r.prose).toBe("You take the lamp she left. The warden locks the gate.");
    }
  });
  it("rejects a span that is not in the original", () => {
    const r = parseFixPlan(`[{"span":"Marta lights the lamp","problem":"x","replacement":""}]\n${PROSE_SEPARATOR}\nProse.`, original);
    expect(r).toEqual({ ok: false, reason: "a fix plan span is not in the original text" });
  });
  it("matches a span through quote style and case", () => {
    const r = parseFixPlan(`[{"span":"MARTA SETS THE LAMP DOWN","problem":"x","replacement":""}]\n${PROSE_SEPARATOR}\nProse.`, original);
    expect(r.ok).toBe(true);
  });
  it("rejects a reply with no separator, no plan, an empty plan or no prose", () => {
    expect(parseFixPlan("Just prose.", original).ok).toBe(false);
    expect(parseFixPlan(`${PROSE_SEPARATOR}\nProse.`, original).ok).toBe(false);
    expect(parseFixPlan(`[]\n${PROSE_SEPARATOR}\nProse.`, original).ok).toBe(false);
    expect(parseFixPlan(`${plan}\n${PROSE_SEPARATOR}\n`, original).ok).toBe(false);
    expect(parseFixPlan(`not json\n${PROSE_SEPARATOR}\nProse.`, original).ok).toBe(false);
  });
  it("follows its plan when a long replaced span is gone, and only then", () => {
    const entries = [{ span: "Marta sets the lamp down", problem: "", replacement: "x" }];
    expect(planFollowed(entries, "You take the lamp she left.")).toEqual({ ok: true });
    expect(planFollowed(entries, "Marta sets the lamp down, gently.").ok).toBe(false);
    // A span of fewer than four words is too small to tell.
    expect(planFollowed([{ span: "Marta sets", problem: "", replacement: "" }], "Marta sets out.")).toEqual({ ok: true });
  });
});

describe("the re-check of a rewrite", () => {
  const record = emptyCampaign();
  record.safety = { lines: [{ id: "l1", text: "no harm to children", keywords: ["orphan"] }], veils: [] };
  record.secrets = [
    { id: "s1", title: "The clerk", truth: SECRET, keyPhrases: ["killed the clerk"], revealed: false, clues: [] },
  ];
  const story = {
    npcs: [{ id: "n1", name: "Marta", status: "dead", description: "", disposition: 0 }],
    meters: [],
    campaign: record,
  } as unknown as Pick<StoryData, "npcs" | "meters" | "campaign">;
  const check = (rewritten: string, original = "The warden locks the gate.") =>
    recheckRewrite({ rewritten, original, storyBefore: story, storyAfter: story });

  it("passes clean prose", () => {
    expect(check("The warden bars the gate and says nothing.")).toEqual({ ok: true });
  });
  it("fails a line's keyword", () => {
    expect(check("The orphan watches the gate.").ok).toBe(false);
  });
  it("fails a key phrase of an unrevealed secret", () => {
    expect(check("The warden, who killed the clerk, bars the gate.").ok).toBe(false);
  });
  it("fails a dead person acting that the first draft did not have", () => {
    expect(check("Marta arrives at the gate.").ok).toBe(false);
    // Already in the original: the rewrite is not blamed for it.
    expect(check("Marta arrives at the gate.", "Marta arrives at the gate, again.")).toEqual({ ok: true });
  });
});

describe("what leaves the host", () => {
  const flag: ObserverFlag = {
    type: "secret_leak",
    severity: "major",
    detail: "fixed",
    correctivePrompt: "c",
    finding: { evidence: "who killed the clerk", factIds: ["f1"], fix: "" },
  };
  const story = {
    story_name: "t",
    scene: {
      parts: [
        { id: "a", user: false, role: "assistant", content: "x", observerFlags: [flag] },
        { id: "b", user: false, role: "assistant", content: "y", publicNotice: "revised", observerRewriteOriginal: { content: "draft with the secret", flag } },
        { id: "c", user: false, role: "assistant", content: "z" },
      ],
    },
  } as unknown as StoryData;

  it("gives a guest the notice and nothing else", () => {
    const guest = withoutPrivateFindings(story);
    const wire = JSON.stringify(guest);
    expect(wire).not.toContain("secret_leak");
    expect(wire).not.toContain("draft with the secret");
    expect(wire).not.toContain("who killed");
    expect(guest.scene.parts.map((p) => p.publicNotice)).toEqual(["checked", "revised", undefined]);
  });
  it("shares a story that has nothing private, and never touches the host's own", () => {
    const plain = { ...story, scene: { parts: [story.scene.parts[2]] } } as StoryData;
    expect(withoutPrivateFindings(plain)).toBe(plain);
    withoutPrivateFindings(story);
    expect(story.scene.parts[0].observerFlags).toBeDefined();
  });
  it("keeps only a flag's kind in a rewrite original", () => {
    expect(kindOnlyFlag(flag)).toEqual({ type: "secret_leak", severity: "major", detail: "", correctivePrompt: "" });
  });
  it("carries a finding on a combined-call flag, with no fix for a leak or a line", () => {
    const flags = combinedResultToFlags(
      {
        ran: ["secret_leak", "agency"],
        calls: 1,
        verdicts: {
          secret_leak: { severity: "major", evidence: "who killed the clerk", factIds: ["f1"], fix: "Remove: the warden did it" },
          agency: { severity: "major", evidence: "tells you to hurry", factIds: [], fix: "Cut the order." },
        },
      },
      { narration: NARRATION, rollResults: [] },
    );
    const leak = flags.find((f) => f.type === "secret_leak")!;
    const agency = flags.find((f) => f.type === "player_agency")!;
    expect(leak.finding).toEqual({ evidence: "who killed the clerk", factIds: ["f1"], fix: "" });
    expect(agency.finding?.fix).toBe("Cut the order.");
    expect(JSON.stringify(leak)).not.toContain("the warden did it");
  });
});

describe("settings", () => {
  it("lets the three judges of the record rewrite, and defaults them to flag", () => {
    for (const type of ["world_consistency", "secret_leak", "lines_and_veils"] as const) {
      expect(REWRITABLE_FLAG_TYPES.has(type)).toBe(true);
      expect(observerModeOf(DEFAULT_OBSERVER_SETTINGS[type])).toBe("flag");
      // A player who sets Rewrite gets it.
      const s = cloneDefaultObserverSettings();
      s[type].triggersReset = true;
      expect(settingsFor(s, type).triggersReset).toBe(true);
    }
  });
  it("keeps an older stored config working: the six legacy keys, the rest from the defaults", () => {
    const legacy = {
      response_length: { enabled: true, triggersReset: true, sensitivity: 5 },
      player_agency: { enabled: true, triggersReset: true, sensitivity: 3 },
      outcome_narration_mismatch: { enabled: true, triggersReset: true, sensitivity: 2 },
      missing_oracle_or_table: { enabled: true, triggersReset: false, sensitivity: 5 },
      missing_scene_increment: { enabled: true, triggersReset: false, sensitivity: 5 },
      tier_escalation_missed: { enabled: true, triggersReset: false, sensitivity: 5 },
    } as ObserverSettings;
    expect(settingsFor(legacy, "secret_leak")).toEqual({ enabled: true, triggersReset: false, sensitivity: 5 });
    expect(settingsFor(legacy, "player_agency").triggersReset).toBe(true);
  });
  it("syncs the confirming model's pick across devices", () => {
    expect(SYNCABLE_SETTINGS_KEYS).toContain("rewriteConfirmModelOverride");
  });
});

describe("facts the rewriter's tests rely on", () => {
  it("collectTurnFacts still lists a secret and a clock under their own topics", () => {
    const record = emptyCampaign();
    record.secrets = [{ id: "s1", title: "T", truth: SECRET, keyPhrases: [], revealed: false, clues: [] }];
    const view = { npcs: [], meters: [], campaign: record };
    const facts = collectTurnFacts(view, view, []);
    expect(facts.find((f) => f.topic === "secret")?.text).toContain(SECRET);
  });
});
