/**
 * Confirmation and the rewrite with facts, as generateStoryTurn runs them
 * (judge layer v2, plan slice 3): a major finding is rewritten only after a
 * judge of another model family agrees, the rewrite is handed the confirmed
 * findings and a fix plan is checked, a failed confirmation or re-check keeps
 * the turn with its flag, and no secret reaches the rewrite or the player.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { generateStoryTurn, type GenerationOptions } from "@/app/misc/generation";
import { createMockGMFetch } from "./helpers/mockGMFetch";
import {
  isJudgeCall,
  isRewriteCall,
  judgeReply,
  requestedJudges,
  rewriteReply,
} from "./helpers/combinedJudges";
import { emptyCampaign } from "@/app/misc/campaign/types";
import { withoutPrivateFindings } from "@/app/misc/judges/publicView";
import type { ObserverSettings } from "@/app/misc/observer";
import type { StoryData } from "@/app/misc/structs";

const TRUTH = "The warden killed the clerk";
const HIDDEN_CLOCK = "The Vigil closes in";
const GM_REASONING = "PRIVATE_REASONING the warden is the killer";
const NARRATION =
  "Marta sets the lamp down and tells you to hurry. The warden, who killed the clerk, locks the gate.";
const FIXED = "The warden locks the gate and says nothing.";

function story(): StoryData {
  const record = emptyCampaign();
  record.safety = { lines: [{ id: "l1", text: "no harm to children", keywords: ["orphan"] }], veils: [] };
  record.secrets = [
    { id: "s1", title: "The clerk", truth: TRUTH, keyPhrases: ["killed the clerk"], revealed: false, clues: [] },
  ];
  return {
    story_name: "Test Story",
    premise: "Test premise",
    player_name: "Test Player",
    scene: { parts: [] },
    lore: [
      { title: "Character Sheet", content: "Test Player, a thief.", type: "character_sheet", enabled: true },
    ],
    memory: [],
    npcs: [{ id: "n1", name: "Marta", status: "dead", description: "", disposition: 0 }],
    campaign: record,
    sessionZeroActive: false,
  } as unknown as StoryData;
}

/** The three judges of the record and the prose judges all rewrite, as a player may set them. */
const REWRITING: ObserverSettings = {
  response_length: { enabled: true, triggersReset: true, sensitivity: 5 },
  player_agency: { enabled: true, triggersReset: true, sensitivity: 5 },
  outcome_narration_mismatch: { enabled: true, triggersReset: true, sensitivity: 5 },
  missing_oracle_or_table: { enabled: false, triggersReset: false, sensitivity: 5 },
  missing_scene_increment: { enabled: false, triggersReset: false, sensitivity: 5 },
  tier_escalation_missed: { enabled: false, triggersReset: false, sensitivity: 5 },
  world_consistency: { enabled: true, triggersReset: true, sensitivity: 5 },
  secret_leak: { enabled: true, triggersReset: true, sensitivity: 5 },
  lines_and_veils: { enabled: true, triggersReset: true, sensitivity: 5 },
};

const baseOptions: GenerationOptions = {
  storyModel: "test-model",
  toolsModel: "test-model",
  choicesModel: "test-model",
  enableTools: true,
  skipChoices: true,
  replyLength: "medium",
  openRouterKey: "openrouter-test-key",
  observerSettings: REWRITING,
};

interface Call {
  body: { model?: string; messages: { role: string; content: string }[] };
}

const isConfirmation = (c: Call) => isJudgeCall(c.body) && c.body.model === "GLM 5.3";

type JudgeSpec = Parameters<typeof judgeReply>[1];

interface Script {
  /** The first judge's verdicts. */
  first: JudgeSpec;
  /** What the confirming judge says (a spec, or a raw reply to send as-is). */
  confirm?: JudgeSpec | string;
  rewrite?: (call: Call) => string;
  narration?: string;
}

const originalFetch = global.fetch;
afterEach(() => {
  global.fetch = originalFetch;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function runTurn(script: Script, options: Partial<GenerationOptions> = {}, userLine = "I follow her") {
  const narration = script.narration ?? NARRATION;
  const gm = createMockGMFetch([{ content: narration, reasoning: GM_REASONING }]);
  const calls: Call[] = [];
  global.fetch = vi.fn(async (url: unknown, init?: RequestInit) => {
    if (String(url) === "/api/generate") {
      const call: Call = { body: JSON.parse(init!.body as string) };
      calls.push(call);
      let content: string;
      if (isRewriteCall(call.body)) {
        content = script.rewrite ? script.rewrite(call) : rewriteReply(call.body, FIXED);
      } else if (isConfirmation(call)) {
        const c = script.confirm ?? script.first;
        content = typeof c === "string" ? c : judgeReply(call.body, c);
      } else if (isJudgeCall(call.body)) {
        content = judgeReply(call.body, script.first);
      } else {
        content = "{}";
      }
      return { ok: true, json: async () => ({ content }) } as unknown as Response;
    }
    return (gm.fetchMock as unknown as typeof fetch)(url as RequestInfo, init);
  }) as unknown as typeof fetch;
  vi.spyOn(console, "warn").mockImplementation(() => {});

  const shown: string[] = [];
  const completes: number[] = [];
  const revisions: unknown[] = [];
  const result = await generateStoryTurn(
    story(),
    userLine,
    { ...baseOptions, ...options },
    {
      onStoryContent: (_c, full) => shown.push(full),
      onComplete: () => completes.push(1),
      onObserverRewrite: (...args) => revisions.push(args),
    },
  );
  for (let i = 0; i < 30; i++) await new Promise((r) => setTimeout(r, 0));
  return { result, calls, shown, completes, revisions };
}

const LEAK = { secret_leak: { severity: "major" as const, evidence: "who killed the clerk" } };

describe("a rewrite waits for a judge of another family", () => {
  it("asks GLM 5.3 about the finding, then rewrites once with the fix plan, and releases once", async () => {
    const { result, calls, shown, completes, revisions } = await runTurn({ first: LEAK });

    const confirmations = calls.filter(isConfirmation);
    expect(confirmations).toHaveLength(1);
    expect(requestedJudges(confirmations[0].body)).toEqual(["secret_leak"]);
    expect(calls.filter((c) => isRewriteCall(c.body))).toHaveLength(1);

    expect(result.content).toBe(FIXED);
    expect(result.scenePart.correctedObserverFlags?.map((f) => f.type)).toEqual(["secret_leak"]);
    expect(result.scenePart.publicNotice).toBe("revised");
    expect(revisions).toHaveLength(1);
    // The held text is shown once, as the rewrite, never the draft.
    expect(shown).toEqual([FIXED]);
    expect(completes).toHaveLength(1);
  });

  it("keeps the turn with its flag when the other family does not agree", async () => {
    const { result, calls, shown } = await runTurn({ first: LEAK, confirm: {} });
    expect(calls.filter(isConfirmation)).toHaveLength(1);
    expect(calls.filter((c) => isRewriteCall(c.body))).toHaveLength(0);
    expect(result.content).toBe(NARRATION);
    expect(shown).toEqual([NARRATION]);
    expect(result.scenePart.observerFlags?.map((f) => f.type)).toContain("secret_leak");
    expect(result.scenePart.publicNotice).toBe("checked");
    expect(result.scenePart.observerRewriteOriginal).toBeUndefined();
  });

  it("keeps the turn when the confirming judge quotes something else", async () => {
    const { result, calls } = await runTurn({
      first: LEAK,
      confirm: { secret_leak: { severity: "major", evidence: "tells you to hurry" } },
    });
    expect(calls.filter((c) => isRewriteCall(c.body))).toHaveLength(0);
    expect(result.content).toBe(NARRATION);
  });

  it("treats a confirmation that cannot be read as unknown, never a rewrite", async () => {
    const { result, calls } = await runTurn({ first: LEAK, confirm: "not json at all" });
    expect(calls.filter(isConfirmation)).toHaveLength(1);
    expect(calls.filter((c) => isRewriteCall(c.body))).toHaveLength(0);
    expect(result.content).toBe(NARRATION);
    expect(result.scenePart.observerFlags?.map((f) => f.type)).toContain("secret_leak");
  });

  it("confirms at most two findings, the highest priority first, and one rewrite fixes both", async () => {
    const { result, calls } = await runTurn(
      {
        first: {
          ...LEAK,
          world_consistency: { severity: "major", evidence: "Marta sets the lamp down" },
          agency: { severity: "major", evidence: "tells you to hurry" },
        },
      },
      {},
      "I follow her",
    );
    const confirmed = calls.filter(isConfirmation).flatMap((c) => requestedJudges(c.body));
    expect(confirmed.sort()).toEqual(["secret_leak", "world_consistency"]);
    const rewrites = calls.filter((c) => isRewriteCall(c.body));
    expect(rewrites).toHaveLength(1);
    expect(result.scenePart.correctedObserverFlags?.map((f) => f.type)).toEqual([
      "secret_leak",
      "world_consistency",
    ]);
    // The third major (agency) was not confirmed and stays a flag.
    expect(result.scenePart.observerFlags?.map((f) => f.type)).toContain("player_agency");
  });

  it("makes no confirmation call when the player's pick has no key", async () => {
    const entries = { rewriteConfirmModelOverride: JSON.stringify({ modelKey: "Mistral Medium 3.5", reasoningEffort: "none" }) };
    const map = new Map(Object.entries(entries));
    const storage = {
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => void map.set(k, String(v)),
      removeItem: (k: string) => void map.delete(k),
      clear: () => map.clear(),
    };
    vi.stubGlobal("localStorage", storage);
    vi.stubGlobal("sessionStorage", storage);
    vi.stubGlobal("window", {
      localStorage: storage,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    });
    const { result, calls } = await runTurn({ first: LEAK });
    expect(calls.filter(isConfirmation)).toHaveLength(0);
    expect(calls.filter((c) => c.body.model === "Mistral Medium 3.5")).toHaveLength(0);
    expect(calls.filter((c) => isRewriteCall(c.body))).toHaveLength(0);
    expect(result.content).toBe(NARRATION);
    expect(result.scenePart.observerFlags?.map((f) => f.type)).toContain("secret_leak");
  });

  it("refuses a confirming model of the first judge's own family", async () => {
    const storage = {
      getItem: (k: string) =>
        k === "rewriteConfirmModelOverride"
          ? JSON.stringify({ modelKey: "Claude Sonnet 5.5", reasoningEffort: "none" })
          : null,
      setItem: () => {},
      removeItem: () => {},
      clear: () => {},
    };
    vi.stubGlobal("localStorage", storage);
    vi.stubGlobal("sessionStorage", storage);
    vi.stubGlobal("window", {
      localStorage: storage,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    });
    const { result, calls } = await runTurn({ first: LEAK });
    // The first judge is Claude Haiku 5.5; Sonnet is the same family.
    expect(calls.filter((c) => c.body.model === "Claude Sonnet 5.5")).toHaveLength(0);
    expect(calls.filter((c) => isRewriteCall(c.body))).toHaveLength(0);
    expect(result.content).toBe(NARRATION);
  });

  it("passes a Stop during the confirmation through and shows nothing", async () => {
    const controller = new AbortController();
    const gm = createMockGMFetch([{ content: NARRATION }]);
    const shown: string[] = [];
    global.fetch = vi.fn(async (url: unknown, init?: RequestInit) => {
      if (String(url) === "/api/generate") {
        const body = JSON.parse(init!.body as string);
        if (isJudgeCall(body) && body.model === "GLM 5.3") {
          controller.abort();
          throw Object.assign(new Error("aborted"), { name: "AbortError" });
        }
        return { ok: true, json: async () => ({ content: isJudgeCall(body) ? judgeReply(body, LEAK) : "{}" }) } as unknown as Response;
      }
      return (gm.fetchMock as unknown as typeof fetch)(url as RequestInfo, init);
    }) as unknown as typeof fetch;
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(
      generateStoryTurn(
        story(),
        "I follow her",
        { ...baseOptions, abortSignal: controller.signal },
        { onStoryContent: (_c, full) => shown.push(full) },
      ),
    ).rejects.toThrow(/cancelled/i);
    expect(shown).toEqual([]);
  });
});

describe("the rewrite is checked before it replaces anything", () => {
  it("releases the original with its flag when the fix plan names words the text never had", async () => {
    const { result, calls, shown } = await runTurn({
      first: LEAK,
      rewrite: () =>
        `[{"span":"words that are not in the text","problem":"x","replacement":""}]\n===PROSE===\n${FIXED}`,
    });
    expect(calls.filter((c) => isRewriteCall(c.body))).toHaveLength(1);
    expect(result.content).toBe(NARRATION);
    expect(shown).toEqual([NARRATION]);
    expect(result.scenePart.observerFlags?.map((f) => f.type)).toContain("secret_leak");
    expect(result.scenePart.observerRewriteOriginal).toBeUndefined();
  });

  it("releases the original when the prose still holds a span the plan replaces", async () => {
    const original = "Marta nods and the warden locks the gate quietly tonight.";
    const { result, calls } = await runTurn({
      first: { secret_leak: { severity: "major", evidence: "locks the gate quietly tonight" } },
      rewrite: () =>
        `[{"span":"locks the gate quietly tonight","problem":"x","replacement":"nothing"}]\n===PROSE===\nMarta nods and the warden locks the gate quietly tonight, then waits.`,
      narration: original,
    });
    expect(calls.filter((c) => isRewriteCall(c.body))).toHaveLength(1);
    expect(result.content).toBe(original);
  });

  it("releases the original when the rewrite carries a line's keyword (rung 1 re-check)", async () => {
    const { result, shown } = await runTurn({
      first: LEAK,
      rewrite: (call) => rewriteReply(call.body, "The orphan watches the warden lock the gate."),
    });
    expect(result.content).toBe(NARRATION);
    expect(shown).toEqual([NARRATION]);
    expect(result.scenePart.observerFlags?.map((f) => f.type)).toContain("secret_leak");
  });

  it("releases the original when the rewrite carries a key phrase of the unrevealed secret", async () => {
    const { result } = await runTurn({
      first: LEAK,
      rewrite: (call) => rewriteReply(call.body, "The warden, who killed the clerk, bars the gate."),
    });
    expect(result.content).toBe(NARRATION);
  });

  it("releases the original when the reply has no fix plan at all", async () => {
    const { result } = await runTurn({ first: LEAK, rewrite: () => FIXED });
    expect(result.content).toBe(NARRATION);
  });
});

describe("no secret reaches the rewrite or the player", () => {
  it("keeps the secret's truth out of the rewrite request and of what the turn shows the player", async () => {
    const { result, calls } = await runTurn({ first: LEAK });
    const rewrite = calls.find((c) => isRewriteCall(c.body));
    expect(rewrite).toBeDefined();
    const wire = JSON.stringify(rewrite!.body);
    // The truth, its title as a fact and the GM's reasoning are not in the request.
    expect(wire).not.toContain(TRUTH);
    expect(wire).not.toContain("Unrevealed secret");
    expect(wire).not.toContain("PRIVATE_REASONING");
    expect(wire).not.toContain(HIDDEN_CLOCK);
    // The confirming judge, like the first, is shown the secret it must compare against.
    expect(JSON.stringify(calls.find(isConfirmation)!.body)).toContain(TRUTH);

    // What the turn keeps for the player: the text, the generic kind-only original, a public notice.
    expect(result.content).not.toContain("killed the clerk");
    const original = result.scenePart.observerRewriteOriginal!;
    expect(original.flag.detail).toBe("");
    expect(original.flag.correctivePrompt).toBe("");
    expect(original.flag.finding).toBeUndefined();
    expect(result.scenePart.publicNotice).toBe("revised");
    // The GM's next-turn note is the flag's fixed sentence.
    expect(JSON.stringify(result.scenePart.correctedObserverFlags)).not.toContain(TRUTH);
  });

  it("strips every finding and the replaced draft from what an online guest is sent", async () => {
    const { result } = await runTurn({ first: LEAK, confirm: {} });
    const withFlags = {
      ...story(),
      scene: { parts: [{ ...result.scenePart, user: false, role: "assistant" }] },
    } as unknown as StoryData;
    expect(JSON.stringify(withFlags)).toContain("secret_leak");
    const guestView = withoutPrivateFindings(withFlags);
    const wire = JSON.stringify(guestView);
    expect(wire).not.toContain("observerFlags");
    expect(wire).not.toContain("secret_leak");
    expect(wire).not.toContain("evidence");
    expect(guestView.scene.parts[0].publicNotice).toBe("checked");
    // The host's own story is untouched.
    expect(JSON.stringify(withFlags)).toContain("observerFlags");
  });
});
