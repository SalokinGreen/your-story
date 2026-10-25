/**
 * The engine review of judge layer v2 slice 2: each finding has a test here.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { JUDGE_IDS, judgeMaxTokens, quoteAppearsIn } from "@/app/misc/judges/combined";
import { collectTurnFacts } from "@/app/misc/judges/facts";
import type { Fact } from "@/app/misc/judges/types";
import {
  runObserver,
  cloneDefaultObserverSettings,
  countJudgeCalls,
} from "@/app/misc/observer";
import { alsoFixTypes, executedRandomness } from "@/app/misc/generation";
import type { GMToolResult } from "@/app/misc/gmExecutor";
import type { ObserverFlag } from "@/app/misc/structs";
import { emptyCampaign } from "@/app/misc/campaign/types";
import { judgeReply } from "./helpers/combinedJudges";

const apiOptions = { model: "test-model", token: "tok" };
const LONG = Array(400).fill("word").join(" ");

function fact(id: string, topic: Fact["topic"], text: string, names?: string[]): Fact {
  return { id, source: { kind: "record", ref: id }, when: "before", text, topic, names };
}

const originalFetch = global.fetch;
afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("a secret revealed this turn (finding 1)", () => {
  it("is not handed to the secret-leak judge as unrevealed", () => {
    const before = emptyCampaign();
    before.secrets = [
      { id: "s1", title: "The clerk", truth: "The warden did it", keyPhrases: [], revealed: false, clues: [] },
      { id: "s2", title: "The vault", truth: "It is empty", keyPhrases: [], revealed: false, clues: [] },
    ];
    const after = structuredClone(before);
    after.secrets[0].revealed = true; // reveal_secret this turn
    const view = (campaign: typeof before) =>
      ({ npcs: [], meters: [], campaign }) as unknown as Parameters<typeof collectTurnFacts>[0];
    const secrets = collectTurnFacts(view(before), view(after), []).filter((f) => f.topic === "secret");
    expect(secrets).toHaveLength(1);
    expect(secrets[0].text).toContain("The vault");
  });
});

describe("GM-only text in a flag's detail (finding 2)", () => {
  it("never reaches any flag detail, whatever a judge writes in its fix", async () => {
    const CANARY = "CANARY_ZEBRA";
    const facts: Fact[] = [
      fact("f1", "secret", `Unrevealed secret "S": ${CANARY} secret truth`),
      fact("f2", "person", `${CANARY} Marta is dead`, ["Marta"]),
      { ...fact("f3", "result", `gm_roll: ${CANARY} hidden roll`), source: { kind: "tool", ref: "c9" } },
      fact("f4", "line", `Line: ${CANARY} line text`),
    ];
    const fix = `Remove ${CANARY} from the narration.`;
    const spec = Object.fromEntries(JUDGE_IDS.map((id) => [id, { severity: "major", fix }])) as Parameters<
      typeof judgeReply
    >[1];
    global.fetch = vi.fn(async (_u: unknown, init?: RequestInit) => ({
      ok: true,
      json: async () => ({ content: judgeReply(JSON.parse(init!.body as string), spec) }),
    })) as unknown as typeof fetch;
    const flags = await runObserver({
      narration: `${LONG} Marta nods. You take the ladder and tell her you will stay.`,
      playerChoice: "I climb down",
      rollResults: [{ checkId: "c9", toolName: "action_roll", tier: "miss", contextForStory: "miss" }],
      tierUsed: 1,
      facts,
      apiOptions,
    });
    expect(flags.length).toBeGreaterThanOrEqual(7);
    for (const f of flags) {
      expect(f.detail).not.toContain(CANARY);
      expect(f.detail).not.toContain("hidden roll");
    }
  });
});

describe("quoting (finding 3)", () => {
  const text = "*She* said — quietly — that the _gate_ was shut, and the lamp went out.";
  it("matches surrounding quote marks, dropped emphasis and a folded dash", () => {
    expect(quoteAppearsIn('"the gate was shut"', text)).toBe(true);
    expect(quoteAppearsIn("She said - quietly - that", text)).toBe(true);
    expect(quoteAppearsIn("She said ... the lamp went out", text)).toBe(true);
  });
  it("refuses a trivial quote and fragments out of order", () => {
    expect(quoteAppearsIn("the", text)).toBe(false);
    expect(quoteAppearsIn("gate was", text)).toBe(false);
    expect(quoteAppearsIn("the lamp went out ... She said", text)).toBe(false);
  });
});

describe("the reply cap (finding 4)", () => {
  it("grows with the narration so span lists fit, and stays bounded", () => {
    const short = judgeMaxTokens(3, "You take the ladder.");
    const long = judgeMaxTokens(3, "word ".repeat(1500));
    expect(long).toBeGreaterThan(short);
    expect(long).toBeGreaterThanOrEqual(Math.ceil((1500 * 5) / 3));
    expect(judgeMaxTokens(8, "x".repeat(200000))).toBeLessThanOrEqual(8000);
  });
});

describe("the cost count (finding 5)", () => {
  it("counts the two passes of a default turn", () => {
    expect(countJudgeCalls(cloneDefaultObserverSettings())).toEqual({
      always: 2,
      sometimes: 0,
      rewrites: true,
    });
  });
});

describe("one rewrite for several majors (finding 6)", () => {
  const flag = (type: ObserverFlag["type"], severity: ObserverFlag["severity"] = "major"): ObserverFlag => ({
    type,
    severity,
    detail: type,
    correctivePrompt: type,
  });
  it("names the other rewritable majors, not the chosen one, minors or flag-only types", () => {
    const chosen = flag("player_agency");
    const flags = [
      flag("response_length"),
      chosen,
      flag("outcome_narration_mismatch", "minor"),
      flag("secret_leak"),
      flag("missing_oracle_or_table"),
    ];
    expect(alsoFixTypes(flags, chosen)).toEqual(["response_length"]);
  });
});

describe("randomness a retry would repeat (finding 7)", () => {
  const result = (toolName: string): GMToolResult =>
    ({ toolName, toolCallId: "c", success: true, contextForStory: "ok" }) as GMToolResult;
  it("counts a name draw", () => {
    expect(executedRandomness([result("generate_name")])).toBe(true);
    expect(executedRandomness([result("calculate")])).toBe(false);
  });
});
