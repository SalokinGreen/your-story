/**
 * Rung 2 of the judge layer inside generateStoryTurn's GM loop (app/misc/
 * generation.ts, search "Rung 2"; docs/judge-layer-v2-plan.md slice 1). A
 * verified rung-1 hit the GM can fix with its own tools sends it back once:
 * one appended user message, an explicit `auto` tool choice. Fantastic Realms'
 * foe-damage contract is the tools-only case; a campaign line is the prose
 * case. The re-ask never rolls dice again.
 *
 * Every scenario uses skipChoices and manual dice (the faces are given), so
 * the only fetches are GM-stage rounds and nothing is random.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { generateStoryTurn, GenerationOptions } from "@/app/misc/generation";
import { createMockGMFetch } from "./helpers/mockGMFetch";
import { emptyCampaign } from "@/app/misc/campaign/types";
import { logger } from "@/app/misc/logger";
import type { Meter, StoryData, StoryLore } from "@/app/misc/structs";

const originalFetch = global.fetch;
afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

const REASK_MARK = "Do not roll again";
const LINE_MARK = "This table set a line";

function frCore(): StoryLore {
  return {
    title: "Fantastic Realms — Core",
    content: "The core rules.",
    relatedCharacters: [],
    relatedLocations: [],
    secrtet: false,
    keys: [],
    type: "dm_instructions",
    libraryNoteId: "builtin:fantastic-realms:core",
  } as StoryLore;
}

function hearts(owner: string, value: number): Meter {
  return {
    id: `${owner.toLowerCase()}::hearts`,
    owner,
    name: "Hearts",
    min: 0,
    max: 5,
    cap: 5,
    floor: 0,
    value,
  };
}

function frStory(overrides: Partial<StoryData> = {}): StoryData {
  return {
    story_name: "Test Story",
    premise: "Test premise",
    player_name: "Ayla",
    player_summary: "",
    intro: "",
    scene: { parts: [] },
    chapters: [],
    lore: [frCore()],
    memory: [],
    npcs: [],
    diceMode: "manual",
    meters: [hearts("Goblin", 3)],
    systemState: {
      sessionCount: 0,
      dedupKeys: [],
      systemId: "fantastic-realms",
      fantasticRealms: {
        heroes: {
          ayla: {
            name: "Ayla",
            rewards: [],
            feats: [
              { id: "ft_1", wording: "Sword", burned: false },
              { id: "ft_2", wording: "Brave", burned: false },
            ],
          },
        },
      },
    },
    ...overrides,
  } as StoryData;
}

const baseOptions: GenerationOptions = {
  storyModel: "test-model",
  toolsModel: "test-model",
  choicesModel: "test-model",
  enableTools: true,
  skipChoices: true,
};

type Msg = { role: string; content: string };
const reaskCount = (body: { messages: unknown }, mark = REASK_MARK) =>
  (body.messages as Msg[]).filter(
    (m) => m.role === "user" && m.content?.includes(mark),
  ).length;

// Two dice at DC 2, both successes: a hit (1 heart).
const HIT = {
  name: "feat_roll",
  arguments: {
    hero: "Ayla",
    feats: ["Sword"],
    dc: 2,
    reason: "strike the goblin",
    target: "Goblin",
    dice: [5, 6],
  },
};
const GOBLIN_HURT = (by: number) => ({
  name: "manage_meter",
  arguments: { action: "adjust", owner: "Goblin", meter: "Hearts", by, reason: "damage" },
});

async function play(
  story: StoryData,
  line: string,
  rounds: Parameters<typeof createMockGMFetch>[0],
  options: GenerationOptions = baseOptions,
) {
  const mock = createMockGMFetch(rounds);
  global.fetch = mock.fetchMock as unknown as typeof fetch;
  const result = await generateStoryTurn(story, line, options, {});
  return { result, calls: mock.gmStageCalls() };
}

describe("rung 2 re-ask: Fantastic Realms foe-damage", () => {
  it("sends the GM back once when a hit on a foe records no damage, names the call, and keeps the draft", async () => {
    const story = frStory();
    const { result, calls } = await play(story, "I strike the goblin", [
      { toolCalls: [HIT] },
      { content: "Your blade bites the goblin deep." },
      { toolCalls: [GOBLIN_HURT(-1)] },
      { content: "Recorded." },
    ]);

    expect(result.success).toBe(true);
    expect(calls).toHaveLength(4);
    expect(reaskCount(calls[1].body)).toBe(0);
    expect(calls[2].body.toolChoice).toBe("auto");
    expect(reaskCount(calls[2].body)).toBe(1);
    const message = (calls[2].body.messages as Msg[]).find((m) =>
      m.content?.includes(REASK_MARK),
    )!.content;
    expect(message).toContain('"owner":"Goblin"');
    expect(message).toContain('"by":-1');
    // The meter now carries the loss, and the draft stands over the acknowledgement.
    expect(
      result.gmResults?.some(
        (r) => r.toolName === "manage_meter" && r.success,
      ),
    ).toBe(true);
    expect(result.content).toBe("Your blade bites the goblin deep.");
  });

  it("does not re-ask when the damage was recorded", async () => {
    const { calls } = await play(frStory(), "I strike", [
      { toolCalls: [HIT, GOBLIN_HURT(-1)] },
      { content: "The goblin staggers." },
    ]);
    expect(calls).toHaveLength(2);
    for (const c of calls) expect(reaskCount(c.body)).toBe(0);
  });

  it("re-asks when the recorded amount is wrong", async () => {
    const { calls } = await play(frStory(), "I strike", [
      { toolCalls: [HIT, GOBLIN_HURT(-2)] },
      { content: "The goblin staggers." },
      { toolCalls: [GOBLIN_HURT(1)] },
      { content: "ok" },
    ]);
    expect(calls).toHaveLength(4);
    expect(reaskCount(calls[2].body)).toBe(1);
  });

  it("does not re-ask on a clamped write", async () => {
    // A strong hit owes 2 hearts; the goblin has 1 and the write clamps at 0.
    const story = frStory({ meters: [hearts("Goblin", 1)] });
    const strong = {
      ...HIT,
      arguments: { ...HIT.arguments, feats: ["Sword", "Brave"], dice: [5, 6, 4] },
    };
    const { calls } = await play(story, "I finish it", [
      { toolCalls: [strong, GOBLIN_HURT(-2)] },
      { content: "The goblin falls." },
    ]);
    expect(calls).toHaveLength(2);
  });

  it("does not re-ask on a burn: the burned roll's own tier is the damage", async () => {
    // Dice [1,1] at DC 2 are no successes; burning Sword makes one sure
    // success, a weak hit: 1 heart.
    const burned = {
      ...HIT,
      arguments: { ...HIT.arguments, burn: "Sword", dice: [1, 1] },
    };
    const { calls } = await play(frStory(), "I burn my sword", [
      { toolCalls: [burned, GOBLIN_HURT(-1)] },
      { content: "A grand stroke." },
    ]);
    expect(calls).toHaveLength(2);
  });

  it("re-asks once per turn: a second miss in the same turn is only logged", async () => {
    const action = vi.spyOn(logger, "action");
    const { result, calls } = await play(frStory(), "I strike", [
      { toolCalls: [HIT] },
      { content: "Your blade bites deep." },
      // The GM ignores the re-ask and writes prose again.
      { content: "Your blade bites deep, again." },
    ]);
    expect(result.success).toBe(true);
    expect(calls).toHaveLength(3);
    expect(reaskCount(calls[2].body)).toBe(1);
    expect(
      action.mock.calls.filter((c) => String(c[0]).startsWith("Rung 1 hit")),
    ).toHaveLength(1);
    // The post-narration pass still logs the unmet contract.
    expect(
      action.mock.calls.some((c) => String(c[0]) === "Rung 1 check: event_contract"),
    ).toBe(true);
  });

  it("never rolls again in the re-ask round: a dice call is refused with a result", async () => {
    const { result, calls } = await play(frStory(), "I strike", [
      { toolCalls: [HIT] },
      { content: "Your blade bites deep." },
      // The re-ask round tries to reroll and to record.
      {
        toolCalls: [
          { ...HIT, id: "reroll", arguments: { ...HIT.arguments, dice: [6, 6] } },
          GOBLIN_HURT(-1),
        ],
      },
      { content: "Done." },
    ]);
    expect(calls).toHaveLength(4);
    const rolls = (result.gmResults ?? []).filter((r) => r.toolName === "feat_roll");
    expect(rolls).toHaveLength(2);
    expect(rolls.filter((r) => r.contextForStory.startsWith("[ERROR]"))).toHaveLength(1);
    expect(rolls.filter((r) => !r.contextForStory.startsWith("[ERROR]"))).toHaveLength(1);
    // Every call in the round still has its tool message in the next request.
    const toolMessages = (calls[3].body.messages as (Msg & { tool_call_id?: string })[]).filter(
      (m) => m.role === "tool" && (m.tool_call_id === "reroll" || m.tool_call_id === "call_1"),
    );
    expect(toolMessages.length).toBe(2);
    // The damage still landed once.
    expect(
      (result.gmResults ?? []).filter((r) => r.toolName === "manage_meter" && r.success),
    ).toHaveLength(1);
  });

  it("is off in a story that runs no system with a contract", async () => {
    const story = frStory({
      lore: [],
      systemState: { sessionCount: 0, dedupKeys: [], usesSystemTools: false },
    });
    const { calls } = await play(story, "I strike", [
      { content: "You strike the goblin." },
    ]);
    expect(calls).toHaveLength(1);
  });

  it("is off in session zero", async () => {
    const { calls } = await play(frStory({ sessionZeroActive: true }), "begin", [
      { content: "Welcome." },
      { content: "Still setup." },
      { content: "More setup." },
    ]);
    for (const c of calls) expect(reaskCount(c.body)).toBe(0);
  });

  it("leaves a round for the re-ask: none is sent when the budget is spent", async () => {
    const { calls } = await play(
      frStory(),
      "I strike",
      [{ toolCalls: [HIT] }, { content: "Your blade bites deep." }],
      { ...baseOptions, maxToolLoops: 2 },
    );
    expect(calls).toHaveLength(2);
  });
});

describe("rung 2 re-ask: a campaign line", () => {
  const lineStory = () =>
    frStory({
      lore: [],
      systemState: { sessionCount: 0, dedupKeys: [], usesSystemTools: false },
      campaign: {
        ...emptyCampaign(),
        safety: {
          lines: [{ id: "saf_1", text: "No torture on screen", keywords: ["torture"] }],
          veils: [],
        },
      },
    });

  it("asks for the passage again and the new words replace the draft", async () => {
    const { result, calls } = await play(lineStory(), "I question the guard", [
      { content: "The torture begins." },
      { content: "The guard talks, quickly, before it comes to that." },
    ]);
    expect(calls).toHaveLength(2);
    expect(reaskCount(calls[1].body, LINE_MARK)).toBe(1);
    expect(calls[1].body.toolChoice).toBe("auto");
    expect(result.content).toBe("The guard talks, quickly, before it comes to that.");
    expect(result.content).not.toContain("torture");
    // The draft is out of the conversation that is saved with the part.
    const saved = JSON.stringify(result.scenePart?.gmConversation ?? []);
    expect(saved).not.toContain("The torture begins.");
  });

  it("gives the draft back when the GM answers with no words", async () => {
    const { result, calls } = await play(lineStory(), "I question the guard", [
      { content: "The torture begins." },
      { content: "" },
    ]);
    expect(calls).toHaveLength(2);
    expect(result.content).toBe("The torture begins.");
  });

  it("does not re-ask on a clean draft", async () => {
    const { calls } = await play(lineStory(), "I question the guard", [
      { content: "The guard talks." },
    ]);
    expect(calls).toHaveLength(1);
  });
});
