/**
 * A whole turn on the Claude subscription (docs/claude-gm-design.md §4, plan
 * B2/B3), through generateStoryTurn with every reasoning tier set to "Claude
 * Sonnet (subscription)" and the `claude` CLI scripted
 * (tests/helpers/fakeClaudeCli.ts). The GM loop is the app's own (decision
 * 11): rounds run in structured mode, the engine executes the tool calls,
 * the roll gate still forces a roll (as the schema's minItems), and a usage
 * limit ends the turn with its message instead of moving it to a paid
 * provider.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@tauri-apps/api/core", async () => (await import("./helpers/fakeClaudeCli")).fakeTauriCore);

import { fakeCli, CliRunRequest } from "./helpers/fakeClaudeCli";
import { generateStoryTurn, GenerationOptions } from "@/app/misc/generation";
import type { StoryData } from "@/app/misc/structs";

class MemoryStorage {
  private map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.has(key) ? this.map.get(key)! : null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, String(value));
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
  clear(): void {
    this.map.clear();
  }
}

const SUBSCRIPTION_TIER = { modelKey: "Claude Sonnet (subscription)", reasoningEffort: "high" };

function createStory(overrides: Partial<StoryData> = {}): StoryData {
  return {
    story_name: "Test Story",
    premise: "A goblin ambush on a rope bridge.",
    player_name: "Test Player",
    player_summary: "A sellsword.",
    intro: "The bridge sways.",
    points: 0,
    earnedPointsFromQuests: [],
    earnedPointsFromChapters: [],
    currentChapter: 0,
    max_chapters: 10,
    scene: { parts: [] },
    chapters: [],
    quests: [],
    stats: [],
    resources: [],
    inventory: [],
    achievements: [],
    lore: [],
    memory: [],
    momentum: 0,
    maxMomentum: 10,
    relationships: [],
    rpgSystem: "3d6",
    abilities: [],
    level: 1,
    upgradesSpent: 0,
    conditions: [],
    npcs: [],
    ...overrides,
  } as StoryData;
}

const COMBAT = {
  combatState: { active: true, combatants: [], turnOrder: [], currentTurnIndex: 0, round: 1 },
} as Partial<StoryData>;

const OPTIONS: GenerationOptions = {
  storyModel: "test-model",
  toolsModel: "test-model",
  choicesModel: "test-model",
  enableTools: true,
  skipChoices: true,
};

/** Every HTTP call the turn makes - none of them may be a GM round. */
let httpCalls: { url: string; body: { tools?: unknown } }[];

beforeEach(() => {
  fakeCli.reset();
  const storage = new MemoryStorage();
  storage.setItem(
    "reasoningTierOverrides",
    JSON.stringify([SUBSCRIPTION_TIER, SUBSCRIPTION_TIER, SUBSCRIPTION_TIER, SUBSCRIPTION_TIER]),
  );
  vi.stubGlobal("localStorage", storage);
  vi.stubGlobal("window", {
    localStorage: storage,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  });
  httpCalls = [];
  // Side agents run on their own (non-subscription) models over HTTP; they
  // are not what this test is about, so they fail quietly as they would
  // without a key.
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: unknown, init?: RequestInit) => {
      httpCalls.push({ url: String(url), body: init?.body ? JSON.parse(init.body as string) : {} });
      throw new Error("no HTTP provider in this test");
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function structuredRuns(): CliRunRequest[] {
  return fakeCli.runs.filter((r) => r.mode.kind === "structured");
}

function schemaOf(run: CliRunRequest) {
  return JSON.parse((run.mode as { schema: string }).schema);
}

describe("a turn on the Claude subscription", () => {
  it("runs a roll round and then the narration, with the engine executing the call", async () => {
    let round = 0;
    fakeCli.respond = (req) => {
      expect(req.mode.kind).toBe("structured");
      round++;
      return round === 1
        ? { lines: fakeCli.structured({ narration: "", tool_calls: [{ name: "calculate", arguments: { expression: "14+3 >= 15" } }] }) }
        : { lines: fakeCli.structured({ narration: "Your blade bites deep; the goblin staggers back.", tool_calls: [] }) };
    };

    const result = await generateStoryTurn(createStory(), "I attack the goblin", OPTIONS, {});

    expect(result.success).toBe(true);
    expect(result.content).toContain("Your blade bites deep");
    const runs = structuredRuns();
    expect(runs).toHaveLength(2);
    expect(runs[0].model).toBe("sonnet");
    expect(runs[0].effort).toBe("high");
    // Round 2 carries the engine's result for round 1's call, and only
    // appends to round 1: the same system prompt, the same prompt prefix.
    expect(runs[1].prompt).toMatch(/\[Tool result · calculate · cli\w+_0\]\n\S/);
    expect(runs[1].prompt.startsWith(runs[0].prompt)).toBe(true);
    expect(runs[1].systemPrompt).toBe(runs[0].systemPrompt);
    // The prompt is the live block and the action in one user message; the
    // stable block and history (here none) went to the system file.
    expect(runs[0].prompt.startsWith("[User]\n")).toBe(true);
    expect(runs[0].prompt).toContain("> I attack the goblin");
    expect(runs[0].prompt).toContain("LIVE GAME STATE");
    expect(runs[0].systemPrompt).toContain("THE STORY'S FOUNDATION");
    expect(runs[0].systemPrompt).not.toContain("> I attack the goblin");
    // No GM round went to an HTTP provider.
    expect(httpCalls.filter((c) => c.body.tools)).toHaveLength(0);
  });

  it("forces the next round's schema when the roll gate fires", async () => {
    let round = 0;
    fakeCli.respond = () => {
      round++;
      if (round === 1) {
        return { lines: fakeCli.structured({ narration: "The goblin lunges at you.", tool_calls: [] }) };
      }
      if (round === 2) {
        return {
          lines: fakeCli.structured({
            narration: "",
            tool_calls: [{ name: "formula_roll", arguments: { formulas: ["1d20+5"], reason: "Strike the goblin" } }],
          }),
        };
      }
      return { lines: fakeCli.structured({ narration: "You parry and strike back.", tool_calls: [] }) };
    };

    const result = await generateStoryTurn(createStory(COMBAT), "I fight", OPTIONS, {});

    expect(result.success).toBe(true);
    const runs = structuredRuns();
    expect(runs.length).toBeGreaterThanOrEqual(3);
    expect(schemaOf(runs[0]).properties.tool_calls.minItems).toBeUndefined();
    expect(schemaOf(runs[1]).properties.tool_calls.minItems).toBe(1);
    expect(runs[1].prompt).toContain("This scene requires a roll before the turn can end");
    expect(schemaOf(runs[2]).properties.tool_calls.minItems).toBeUndefined();
  });

  it("ends the turn on a usage limit with that message, and no paid fallback", async () => {
    fakeCli.respond = () => ({ lines: fakeCli.failed("You've hit your session limit · resets 3pm") });
    const onError = vi.fn();

    await expect(
      generateStoryTurn(createStory(), "I attack the goblin", OPTIONS, { onError }),
    ).rejects.toThrow(/usage limit is reached/);

    expect(onError).toHaveBeenCalledTimes(1);
    expect(structuredRuns()).toHaveLength(1);
    expect(httpCalls.filter((c) => c.body.tools)).toHaveLength(0);
  });
});

describe("the first round of a fresh story (a miss and its retry)", () => {
  const OOC = "(OOC: my dice and note tools aren't responding on my end, so I haven't set up your character sheet.)";

  it("retries the round once, forced, and the story is the retried turn - not the apology", async () => {
    let round = 0;
    fakeCli.respond = () => {
      round++;
      if (round === 1) return { lines: fakeCli.structured({ narration: OOC, tool_calls: [] }) };
      if (round === 2) {
        return { lines: fakeCli.structured({ narration: "", tool_calls: [{ name: "calculate", arguments: { expression: "14+3 >= 15" } }] }) };
      }
      return { lines: fakeCli.structured({ narration: "The goblin falls from the bridge.", tool_calls: [] }) };
    };

    const result = await generateStoryTurn(createStory(), "I attack the goblin", OPTIONS, {});

    expect(result.success).toBe(true);
    const runs = structuredRuns();
    expect(runs).toHaveLength(3);
    expect(schemaOf(runs[0]).properties.tool_calls.minItems).toBeUndefined();
    expect(schemaOf(runs[1]).properties.tool_calls.minItems).toBe(1);
    expect(schemaOf(runs[2]).properties.tool_calls.minItems).toBeUndefined();
    expect(result.content).toContain("The goblin falls from the bridge.");
    expect(result.content).not.toContain("OOC");
    // The engine executed the retried call.
    expect(runs[2].prompt).toMatch(/\[Tool result · calculate · cli\w+_0\]\n\S/);
  });

  // Decision 178 (the 2026-10-24 playtest): a later round that claims its
  // tools are down is retried once too; the retry is never retried.
  it("retries a later round that claims its tools are down, once", async () => {
    let round = 0;
    fakeCli.respond = () => {
      round++;
      return round === 1
        ? { lines: fakeCli.structured({ narration: "", tool_calls: [{ name: "calculate", arguments: { expression: "1+1" } }] }) }
        : { lines: fakeCli.structured({ narration: `${OOC} The bridge sways.`, tool_calls: [] }) };
    };

    const result = await generateStoryTurn(createStory(), "I attack the goblin", OPTIONS, {});

    expect(result.success).toBe(true);
    expect(structuredRuns()).toHaveLength(3);
  });

  it("does not retry an ordinary tool-less first reply", async () => {
    fakeCli.respond = () => ({
      lines: fakeCli.structured({ narration: "Welcome, Tester! What kind of story are you in the mood for?", tool_calls: [] }),
    });
    const result = await generateStoryTurn(createStory(), "Hello", OPTIONS, {});
    expect(result.success).toBe(true);
    expect(structuredRuns()).toHaveLength(1);
  });
});
