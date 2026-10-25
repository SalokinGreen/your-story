/**
 * The facts reach the combined judge call as generateStoryTurn runs it (judge
 * layer v2, plan slice 2): the campaign record's unrevealed secret and its
 * key-phrase hit, its lines, and a dead person named in the prose go to the
 * judges that read them, before the narration; the judges of the record flag
 * and never rewrite in this slice; and the flags reach the page by the
 * background channel, with no secret in them.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { generateStoryTurn, type GenerationOptions } from "@/app/misc/generation";
import { createMockGMFetch } from "./helpers/mockGMFetch";
import { LEGACY_OBSERVER_SETTINGS } from "./helpers/observerSettings";
import { isJudgeCall, judgeReply, requestedJudges } from "./helpers/combinedJudges";
import { emptyCampaign } from "@/app/misc/campaign/types";
import type { ObserverFlag, StoryData } from "@/app/misc/structs";

const NARRATION =
  "Marta sets the lamp down and tells you to hurry. The warden, who killed the clerk, locks the gate.";

function story(): StoryData {
  const record = emptyCampaign();
  record.safety = { lines: [{ id: "l1", text: "no harm to children", keywords: ["orphan"] }], veils: [] };
  record.secrets = [
    {
      id: "s1",
      title: "The clerk",
      truth: "The warden killed the clerk",
      keyPhrases: ["killed the clerk"],
      revealed: false,
      clues: [],
    },
  ];
  return {
    story_name: "Test Story",
    premise: "Test premise",
    player_name: "Test Player",
    scene: { parts: [] },
    lore: [
      {
        title: "Character Sheet",
        content: "Test Player, a thief. Nimble 3, Tough 1.",
        type: "character_sheet",
        enabled: true,
      },
    ],
    memory: [],
    npcs: [{ id: "n1", name: "Marta", status: "dead", description: "", disposition: 0 }],
    campaign: record,
    sessionZeroActive: false,
  } as unknown as StoryData;
}

const baseOptions: GenerationOptions = {
  storyModel: "test-model",
  toolsModel: "test-model",
  choicesModel: "test-model",
  enableTools: true,
  skipChoices: true,
  replyLength: "medium",
  openRouterKey: "openrouter-test-key",
  observerSettings: LEGACY_OBSERVER_SETTINGS,
};

interface Call {
  body: { messages: { role: string; content: string }[] };
}

const originalFetch = global.fetch;
afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

async function runTurn(spec: Parameters<typeof judgeReply>[1]) {
  const gm = createMockGMFetch([{ content: NARRATION }]);
  const judgeCalls: Call[] = [];
  const rewriteCalls: Call[] = [];
  global.fetch = vi.fn(async (url: unknown, init?: RequestInit) => {
    if (String(url) === "/api/generate") {
      const call: Call = { body: JSON.parse(init!.body as string) };
      const last = call.body.messages[call.body.messages.length - 1]?.content ?? "";
      if (last.includes("flagged by an automated reviewer")) rewriteCalls.push(call);
      if (isJudgeCall(call.body)) {
        judgeCalls.push(call);
        return { ok: true, json: async () => ({ content: judgeReply(call.body, spec) }) } as unknown as Response;
      }
      return { ok: true, json: async () => ({ content: "{}" }) } as unknown as Response;
    }
    return (gm.fetchMock as unknown as typeof fetch)(url as RequestInfo, init);
  }) as unknown as typeof fetch;
  vi.spyOn(console, "warn").mockImplementation(() => {});

  const background: ObserverFlag[] = [];
  const result = await generateStoryTurn(story(), "I follow her", baseOptions, {
    onBackgroundObserverFlags: (flags) => background.push(...flags),
  });
  for (let i = 0; i < 30; i++) await new Promise((r) => setTimeout(r, 0));
  return { result, judgeCalls, rewriteCalls, background };
}

describe("the record's facts in the judge call", () => {
  it("hands the secret, its key-phrase hit, the line and the dead person to the judges, before the narration", async () => {
    const { judgeCalls } = await runTurn({});
    const record = judgeCalls.filter((c) =>
      requestedJudges(c.body).some((j) => ["world_consistency", "secret_leak", "lines_veils"].includes(j)),
    );
    expect(record.length).toBeGreaterThan(0);
    const user = record[0].body.messages[1].content;
    expect(user).toContain("Unrevealed secret \"The clerk\": The warden killed the clerk");
    expect(user).toContain("Line: no harm to children");
    expect(user).toContain("Marta is dead");
    expect(user).toContain('PHRASE HITS: "killed the clerk"');
    expect(user.indexOf("Marta is dead")).toBeLessThan(user.indexOf("NARRATION"));
    expect(requestedJudges(record[0].body)).toEqual(
      expect.arrayContaining(["world_consistency", "secret_leak", "lines_veils"]),
    );
  });

  it("flags a world contradiction and a secret leak without rewriting, and the flags carry no secret", async () => {
    const { result, rewriteCalls, background } = await runTurn({
      world_consistency: { severity: "major", evidence: "Marta sets the lamp down", fix: "Marta is dead." },
      secret_leak: { severity: "major", evidence: "who killed the clerk", factIds: [] },
    });
    // Flag-only in this slice: nothing is rewritten, and the prose stands.
    expect(rewriteCalls).toHaveLength(0);
    expect(result.content).toBe(NARRATION);

    const flags = [...(result.scenePart.observerFlags ?? []), ...background];
    const types = flags.map((f) => f.type);
    expect(types).toContain("world_consistency");
    expect(types).toContain("secret_leak");
    expect(JSON.stringify(flags.filter((f) => f.type === "secret_leak"))).not.toContain("warden");
  });

  it("treats a quote that is not in the prose as unknown, with no flag", async () => {
    const { result, background } = await runTurn({
      secret_leak: { severity: "major", evidence: "a sentence the narration never wrote" },
    });
    const flags = [...(result.scenePart.observerFlags ?? []), ...background];
    expect(flags.map((f) => f.type)).not.toContain("secret_leak");
  });
});
