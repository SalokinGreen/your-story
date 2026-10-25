/**
 * The labelled-set format (evalFormat.ts), the draft exporter (evalExport.ts)
 * and the scripts' plain helpers (scripts/eval-lib.mjs). No model, no network.
 */
import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { containsKeyLikeText, parseFixture, parseFixtureText, judgeInputsOf } from "@/app/misc/judges/evalFormat";
import { exportJudgeFixture } from "@/app/misc/judges/evalExport";
import { parseArgs, parseEnvFile, providerKeysFrom, readTurnFiles, turnDirs, PUBLIC_TURNS_DIR } from "../scripts/eval-lib.mjs";

function judgeFixture(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    v: 1,
    kind: "judge",
    id: "case-one",
    published: false,
    storyBefore: { npcs: [], meters: [] },
    storyAfter: { npcs: [], meters: [] },
    toolResults: [],
    playerLine: "I open the door.",
    narration: "You open the door and the hinge shrieks twice.",
    labels: [],
    ...over,
  };
}

describe("parseFixture", () => {
  it("accepts a judge fixture and a generation fixture", () => {
    expect(parseFixture(judgeFixture()).ok).toBe(true);
    expect(
      parseFixture({
        v: 1,
        kind: "generation",
        id: "gen-one",
        published: false,
        storySnapshot: {},
        playerLine: "I look around",
        expect: { calls: ["increment_scene"] },
      }).ok,
    ).toBe(true);
  });

  it("names what is wrong rather than throwing", () => {
    const bad = parseFixture(judgeFixture({ v: 2, id: "Bad Id", published: "yes", narration: " ", labels: "none" }));
    expect(bad.ok).toBe(false);
    if (!bad.ok) {
      expect(bad.errors.join("\n")).toContain("v must be 1");
      expect(bad.errors.join("\n")).toContain("id must be");
      expect(bad.errors.join("\n")).toContain("published must be");
      expect(bad.errors.join("\n")).toContain("narration must be");
      expect(bad.errors.join("\n")).toContain("labels must be a list");
    }
    expect(parseFixtureText("{not json").ok).toBe(false);
    expect(parseFixture([]).ok).toBe(false);
  });

  it("refuses a label whose judge is unknown, whose severity is off or whose span is not in the turn", () => {
    const errors = (labels: unknown[]) => {
      const r = parseFixture(judgeFixture({ labels }));
      return r.ok ? [] : r.errors;
    };
    expect(errors([{ judge: "mood", severity: "major", span: "the hinge shrieks twice" }]).join()).toContain("judge must be one of");
    expect(errors([{ judge: "agency", severity: "huge", span: "the hinge shrieks twice" }]).join()).toContain("severity must be");
    expect(errors([{ judge: "agency", severity: "major", span: "words the narration never says" }]).join()).toContain("not in the narration");
    expect(errors([{ judge: "agency", severity: "major", span: "the hinge shrieks twice" }])).toEqual([]);
  });

  it("lets the tier judge's span come from the player's line", () => {
    const r = parseFixture(judgeFixture({ labels: [{ judge: "tier_gap", severity: "major", span: "I open the door" }] }));
    expect(r.ok).toBe(true);
  });

  it("refuses a file that holds something shaped like a provider key", () => {
    const r = parseFixture(judgeFixture({ note: "sk-abcdefghijklmnopqrstuvwx1234" }));
    expect(r.ok).toBe(false);
    expect(containsKeyLikeText("Authorization: Bearer abcdefghijklmnopqrstuvwxyz0123")).toBe(true);
    expect(containsKeyLikeText("api_key: abcdefghijklmnopqrstuvwxyz012345")).toBe(true);
    expect(containsKeyLikeText("The key to the cellar hangs by the door.")).toBe(false);
  });

  it("validates the rung-1 expectation and the label status", () => {
    expect(parseFixture(judgeFixture({ rung1Expect: ["line", "secret_phrase"] })).ok).toBe(true);
    expect(parseFixture(judgeFixture({ rung1Expect: ["vibes"] })).ok).toBe(false);
    expect(parseFixture(judgeFixture({ labelStatus: "guessed" })).ok).toBe(false);
  });
});

describe("judgeInputsOf", () => {
  it("rebuilds the facts, the typed rulings and the tool names with the app's own code", () => {
    const parsed = parseFixture(
      judgeFixture({
        toolResults: [
          {
            toolName: "action_roll",
            toolCallId: "r1",
            success: false,
            contextForStory: "[Action roll -> MISS]",
            result: { type: "action_roll", outcome: "miss" },
          },
        ],
      }),
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok || parsed.fixture.kind !== "judge") return;
    const inputs = judgeInputsOf(parsed.fixture);
    expect(inputs.toolNames).toEqual(["action_roll"]);
    expect(inputs.rollResults).toEqual([
      { checkId: "r1", toolName: "action_roll", tier: "miss", contextForStory: "[Action roll -> MISS]" },
    ]);
  });
});

describe("exportJudgeFixture", () => {
  const story = {
    player_name: "Wren",
    npcs: [{ id: "n1", name: "Marta", status: "dead" }],
    meters: [],
    lore: [
      { title: "Character: Wren", type: "character_sheet", enabled: true, content: "Wren. A short knife." },
      { title: "The Quay", type: "lore", enabled: true, content: "Private world notes that stay out of a draft." },
    ],
    scene: {
      parts: [
        { user: true, role: "user", content: "I look at the lamp.", imageUrl: "" },
        {
          user: false,
          role: "assistant",
          content: "The lamp is cold. Marta left it.",
          imageUrl: "",
          gmToolCalls: [
            { toolName: "formula_roll", toolCallId: "t1", success: true, contextForStory: "[Roll 1d6 = 4]", result: { type: "formula_roll" } },
          ],
        },
      ],
    },
  };

  it("drafts an unpublished, unlabelled fixture from a story export", () => {
    const r = exportJudgeFixture(story, { id: "lamp-turn" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.fixture).toMatchObject({
      v: 1,
      kind: "judge",
      id: "lamp-turn",
      published: false,
      labels: [],
      playerLine: "I look at the lamp.",
      narration: "The lamp is cold. Marta left it.",
    });
    expect(r.fixture.toolResults[0]).toMatchObject({ toolName: "formula_roll", toolCallId: "t1" });
    expect(r.fixture.storyAfter.npcs).toHaveLength(1);
    // Only the sheet is carried; the rest of the lore stays out of a draft.
    expect(r.fixture.storyAfter.lore?.map((n) => n.title)).toEqual(["Character: Wren"]);
    expect(parseFixture(JSON.parse(JSON.stringify(r.fixture))).ok).toBe(true);
  });

  it("falls back to the conversation when a part kept no typed results", () => {
    const old = structuredClone(story);
    delete (old.scene.parts[1] as Record<string, unknown>).gmToolCalls;
    (old.scene.parts[1] as Record<string, unknown>).gmConversation = [
      { role: "assistant", content: "", tool_calls: [{ id: "c1", type: "function", function: { name: "calculate", arguments: "{}" } }] },
      { role: "tool", tool_call_id: "c1", content: "[ERROR: bad formula]" },
    ];
    const r = exportJudgeFixture(old, { id: "old-turn" });
    expect(r.ok && r.fixture.toolResults).toEqual([
      { toolName: "calculate", toolCallId: "c1", success: false, contextForStory: "[ERROR: bad formula]" },
    ]);
  });

  it("reads a Copy GM context message list", () => {
    const r = exportJudgeFixture(
      [
        { role: "user", content: "I knock." },
        { role: "assistant", content: "<thinking>plan</thinking>The door opens a hand's width." },
      ],
      { id: "ctx-turn" },
    );
    expect(r.ok && r.fixture.narration).toBe("The door opens a hand's width.");
    expect(r.ok && r.fixture.playerLine).toBe("I knock.");
  });

  it("says plainly what it cannot read", () => {
    expect(exportJudgeFixture({ message: "hi" }, { id: "x" }).ok).toBe(false);
    expect(exportJudgeFixture({ scene: { parts: [] } }, { id: "x" }).ok).toBe(false);
  });
});

describe("the scripts' helpers", () => {
  it("parses an env file", () => {
    expect(parseEnvFile('# keys\nOPENROUTER_API_KEY="abc"\nEVAL_TURNS_DIR=C:/private\n\nbad line\n')).toEqual({
      OPENROUTER_API_KEY: "abc",
      EVAL_TURNS_DIR: "C:/private",
    });
    expect(providerKeysFrom({ OPENROUTER_API_KEY: "k", ZAI_API_KEY: "z", OTHER: "x" })).toEqual({ openRouterKey: "k", zaiKey: "z" });
  });

  it("parses flags in both spellings", () => {
    expect(parseArgs(["file.json", "--id", "a", "--runs=5", "--go"])).toEqual({
      flags: { id: "a", runs: "5", go: true },
      positional: ["file.json"],
    });
  });

  it("reads the published folder, and a private one only when named and asked for", () => {
    expect(turnDirs({}, false)).toEqual([PUBLIC_TURNS_DIR]);
    expect(turnDirs({ EVAL_TURNS_DIR: "somewhere" }, false)).toHaveLength(2);
    expect(turnDirs({ EVAL_TURNS_DIR: "somewhere" }, true)).toEqual([PUBLIC_TURNS_DIR]);
    expect(readTurnFiles(join(tmpdir(), "no-such-folder-for-eval-tests"))).toEqual([]);
    const dir = mkdtempSync(join(tmpdir(), "eval-turns-"));
    try {
      mkdirSync(join(dir, "sub"));
      writeFileSync(join(dir, "b.json"), "{}");
      writeFileSync(join(dir, "a.json"), "{}");
      writeFileSync(join(dir, "notes.txt"), "x");
      expect(readTurnFiles(dir).map((f: { name: string }) => f.name)).toEqual(["a.json", "b.json"]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
