/**
 * The Observer's tier_escalation_missed retry asks for the nearest tier that is
 * a different call, not "tier + 1" (model-picker design §3, decision 124):
 * with Default filling tiers 0-2 alike, +1 could be the same model at the same
 * effort, and a retry on it would be a reroll, not more care. Run through
 * generateStoryTurn, reading the tier the retry's GM rounds resolve to.
 *
 * The scene is gated by an active challenge (a deterministic stakes marker
 * that keeps the turn at tier 1, the baseline), so the Observer judges the
 * turn before the player gets it and the full-turn reset is available.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { generateStoryTurn, GenerationOptions } from "@/app/misc/generation";
import { createMockGMFetch } from "./helpers/mockGMFetch";
import { DEFAULT_OBSERVER_SETTINGS } from "@/app/misc/observer";
import type { ResolvedTier } from "@/app/misc/reasoningTiers";
import type { StoryData } from "@/app/misc/structs";

const FIRST_NARRATION = "The lock clicks open. The corridor beyond is dark.";
const RETRY_NARRATION = "You work the pick with care, and the tumblers give.";
const ALL_CLEAR = JSON.stringify({
  justified: true,
  violation: false,
  severity: "minor",
  reason: "",
  contradicts: false,
  missed_oracle_or_table: false,
  missed_scene_increment: false,
  should_escalate: false,
});

function createStory(): StoryData {
  return {
    story_name: "Test Story",
    premise: "Test premise",
    player_name: "Test Player",
    scene: { parts: [] },
    stats: [],
    resources: [],
    inventory: [],
    abilities: [],
    achievements: [],
    lore: [
      {
        title: "Character Sheet",
        content: "Test Player, a thief. Nimble 3, Tough 1.",
        type: "character_sheet",
        enabled: true,
      },
    ],
    memory: [],
    npcs: [],
    sessionZeroActive: false,
    activeChallenge: {
      id: "c1",
      name: "The lock",
      rounds: 3,
      currentSuccesses: 0,
      currentFailures: 0,
      active: true,
      createdAt: 0,
    },
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
  observerSettings: DEFAULT_OBSERVER_SETTINGS,
};

function storage(entries: Record<string, string>) {
  const map = new Map(Object.entries(entries));
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, String(value)),
    removeItem: (key: string) => void map.delete(key),
  };
}

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** Runs one turn whose first attempt the Observer sends back for more care; returns the tiers the GM resolved. */
async function tiersAcrossTheRetry(saved: Record<string, string>): Promise<number[]> {
  const s = storage(saved);
  vi.stubGlobal("localStorage", s);
  vi.stubGlobal("sessionStorage", storage({}));
  vi.stubGlobal("window", {
    localStorage: s,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  });

  const rollRound = {
    toolCalls: [{ name: "formula_roll", arguments: { formulas: ["1d20"] } }],
  };
  const gm = createMockGMFetch([
    rollRound,
    { content: FIRST_NARRATION },
    rollRound,
    { content: RETRY_NARRATION },
  ]);
  let escalationIssued = false;
  global.fetch = vi.fn(async (url: unknown, init?: RequestInit) => {
    if (String(url) === "/api/generate") {
      const body = JSON.parse(init!.body as string) as {
        messages: { content: string }[];
      };
      const isTierJudge = body.messages[0]?.content?.includes("reasoning tier") ?? false;
      // Only the FIRST attempt is flagged, so the retry can finish.
      const escalate = isTierJudge && !escalationIssued;
      if (escalate) escalationIssued = true;
      return {
        ok: true,
        json: async () => ({
          content: escalate
            ? JSON.stringify({ should_escalate: true, reason: "This needed more care." })
            : ALL_CLEAR,
        }),
      } as unknown as Response;
    }
    return (gm.fetchMock as unknown as typeof fetch)(url as RequestInfo, init);
  }) as unknown as typeof fetch;
  vi.spyOn(console, "warn").mockImplementation(() => {});

  const tiers: number[] = [];
  const resets: unknown[] = [];
  const result = await generateStoryTurn(createStory(), "I pick the lock", baseOptions, {
    onReasoningTierResolved: (resolved: ResolvedTier) => tiers.push(resolved.tier),
    onObserverReset: () => resets.push(1),
  });
  expect(resets).toHaveLength(1);
  expect(result.content).toBe(RETRY_NARRATION);
  return tiers;
}

describe("the Observer's escalation retry", () => {
  it("on the shipped ladder reruns on tier 2, which differs from tier 1 by its high effort", async () => {
    const tiers = await tiersAcrossTheRetry({});
    expect(tiers[0]).toBe(1);
    expect(tiers[tiers.length - 1]).toBe(2);
  });

  it("skips a tier that is the same call: Default at high everywhere sends the retry to Advanced", async () => {
    const high = { modelKey: "GLM 5.3", reasoningEffort: "high" };
    const tiers = await tiersAcrossTheRetry({
      reasoningTierOverrides: JSON.stringify([high, high, high, null]),
    });
    expect(tiers[0]).toBe(1);
    // Tier 2 is the identical call; the retry goes past it to tier 3.
    expect(tiers[tiers.length - 1]).toBe(3);
  });
});
