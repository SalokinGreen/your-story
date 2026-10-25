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
import {
  generateStoryTurn,
  GenerationOptions,
  reaskRefusal,
  storyHasLineKeywords,
} from "@/app/misc/generation";
import { FLAG_ONLY_OBSERVER_SETTINGS } from "./helpers/observerSettings";
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

  it("re-asks for the missing hearts when too few were recorded", async () => {
    // A strong hit owes 2; the GM recorded 1.
    const strong = {
      ...HIT,
      arguments: { ...HIT.arguments, feats: ["Sword", "Brave"], dice: [5, 6, 4] },
    };
    const { calls } = await play(frStory(), "I strike", [
      { toolCalls: [strong, GOBLIN_HURT(-1)] },
      { content: "The goblin staggers." },
      { toolCalls: [GOBLIN_HURT(-1)] },
      { content: "ok" },
    ]);
    expect(calls).toHaveLength(4);
    expect(reaskCount(calls[2].body)).toBe(1);
    const message = (calls[2].body.messages as Msg[]).find((m) =>
      m.content?.includes(REASK_MARK),
    )!.content;
    expect(message).toContain('"by":-1');
  });

  it("never asks the GM to give hearts back when too many were recorded", async () => {
    const action = vi.spyOn(logger, "action");
    const { calls } = await play(frStory(), "I strike", [
      { toolCalls: [HIT, GOBLIN_HURT(-2)] },
      { content: "The goblin staggers." },
    ]);
    expect(calls).toHaveLength(2);
    expect(reaskCount(calls[1].body)).toBe(0);
    // It is still flagged, in the Debug Logs.
    expect(
      action.mock.calls.some((c) => String(c[0]) === "Rung 1 check: event_contract"),
    ).toBe(true);
  });

  it("does not treat a hero named as the target as a foe", async () => {
    const story = frStory({ meters: [hearts("Goblin", 3), hearts("Ayla", 3)] });
    const strike = { ...HIT, arguments: { ...HIT.arguments, target: "Ayla" } };
    const { calls } = await play(story, "I strike", [
      { toolCalls: [strike] },
      { content: "You swing at a friend." },
    ]);
    expect(calls).toHaveLength(2);
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
    const shown: string[] = [];
    const mock = createMockGMFetch([
      { toolCalls: [HIT] },
      { content: "Your blade bites deep." },
      // The re-ask round tries to reroll, to draw an oracle, to roll a track,
      // to stop and ask the player, and to record.
      {
        toolCalls: [
          { ...HIT, id: "reroll", arguments: { ...HIT.arguments, dice: [6, 6] } },
          { id: "oracle", name: "fate_question", arguments: { question: "Does it die?" } },
          { id: "track", name: "manage_track", arguments: { action: "progress_roll", owner: "Ayla", track: "x" } },
          { id: "ask", name: "ask_question", arguments: { questions: [] } },
          { ...GOBLIN_HURT(-1), id: "record" },
        ],
      },
      { content: "Done." },
    ]);
    global.fetch = mock.fetchMock as unknown as typeof fetch;
    const result = await generateStoryTurn(frStory(), "I strike", baseOptions, {
      onGMToolResult: (r) => shown.push(r.toolCallId),
    });
    const calls = mock.gmStageCalls();
    expect(calls).toHaveLength(4);
    // Only the first roll is a result: the refused calls are no part of the turn.
    const rolls = (result.gmResults ?? []).filter((r) => r.toolName === "feat_roll");
    expect(rolls).toHaveLength(1);
    expect(
      (result.gmResults ?? []).some((r) =>
        ["fate_question", "manage_track", "ask_question"].includes(r.toolName),
      ),
    ).toBe(false);
    // The player's tool log never saw the refusals ...
    expect(shown).not.toEqual(expect.arrayContaining(["reroll"]));
    for (const id of ["reroll", "oracle", "track", "ask"]) expect(shown).not.toContain(id);
    expect(shown).toContain("record");
    // ... but every call in the round still has its tool message for the provider.
    const toolMessages = (calls[3].body.messages as (Msg & { tool_call_id?: string })[]).filter(
      (m) => m.role === "tool",
    );
    for (const id of ["reroll", "oracle", "track", "ask", "record"]) {
      expect(toolMessages.some((m) => m.tool_call_id === id), id).toBe(true);
    }
    expect(
      toolMessages.find((m) => m.tool_call_id === "reroll")?.content,
    ).toContain("[ERROR]");
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

  const STATE = { name: "get_game_state", arguments: {} };

  it("quotes every unseen round and replaces all of it, even when the reply repeats an earlier round", async () => {
    const { result, calls } = await play(lineStory(), "I question the guard", [
      { content: "The gate opens.", toolCalls: [STATE] },
      { content: "The torture begins." },
      // The reply says the opening again, on purpose: nothing may swallow it.
      { content: "The gate opens. The guard talks, quickly, before it comes to that." },
    ]);
    expect(calls).toHaveLength(3);
    const message = (calls[2].body.messages as Msg[]).find((m) =>
      m.content?.includes(LINE_MARK),
    )!.content;
    expect(message).toContain("The gate opens.");
    expect(message).toContain("The torture begins.");
    expect(result.content).toBe(
      "The gate opens. The guard talks, quickly, before it comes to that.",
    );
    // The saved conversation carries the new passage once and the draft's
    // prose nowhere (its tool call and reasoning stay).
    const saved = (result.scenePart?.gmConversation ?? []) as (Msg & { tool_calls?: unknown[] })[];
    const proseOf = (m: Msg) => (m.role === "assistant" ? m.content ?? "" : "");
    expect(saved.map(proseOf).join("\n")).not.toContain("The torture begins.");
    expect(saved.map(proseOf).join("\n").split("The gate opens.").length - 1).toBe(1);
    expect(saved.some((m) => m.role === "assistant" && m.tool_calls?.length)).toBe(true);
  });

  it("catches a line's word in an earlier round, not only the final one", async () => {
    const { result, calls } = await play(lineStory(), "I question the guard", [
      { content: "The torture begins.", toolCalls: [STATE] },
      { content: "The guard waits." },
      { content: "The guard speaks before it comes to that, and waits." },
    ]);
    expect(calls).toHaveLength(3);
    expect(reaskCount(calls[2].body, LINE_MARK)).toBe(1);
    expect(result.content).toBe("The guard speaks before it comes to that, and waits.");
    expect(result.content).not.toContain("torture");
  });

  it("gives every unseen round back when the GM answers with no words", async () => {
    const { result } = await play(lineStory(), "I question the guard", [
      { content: "The gate opens.", toolCalls: [STATE] },
      { content: "The torture begins." },
      { content: "" },
    ]);
    expect(result.content).toContain("The gate opens.");
    expect(result.content).toContain("The torture begins.");
  });

  it("does not re-ask on a round the roll gate removed", async () => {
    const story = lineStory();
    story.combatState = {
      active: true,
      combatants: [],
      turnOrder: [],
      currentTurnIndex: 0,
      round: 1,
    } as StoryData["combatState"];
    const { result, calls } = await play(story, "I try to end the fight", [
      { content: "The goblin lunges, blade flashing." },
      // The roll gate asks; the GM declines with prose, which the gate removes.
      { content: "The torture ends the fight." },
    ]);
    expect(calls).toHaveLength(2);
    expect(reaskCount(calls[1].body, LINE_MARK)).toBe(0);
    expect(result.content).not.toContain("torture");
  });

  it("never lets a line's word stream, even with every judge set to flag", async () => {
    const live: string[] = [];
    const mock = createMockGMFetch([
      { content: "The torture begins." },
      { content: "The guard talks, before it comes to that." },
    ]);
    global.fetch = mock.fetchMock as unknown as typeof fetch;
    const result = await generateStoryTurn(
      lineStory(),
      "I question the guard",
      { ...baseOptions, observerSettings: FLAG_ONLY_OBSERVER_SETTINGS },
      {
        onGMContent: (t) => live.push(t),
        onLiveNarrationUpdate: (t) => live.push(t),
        onStoryContent: (t) => live.push(t),
      },
    );
    expect(mock.gmStageCalls()).toHaveLength(2);
    expect(live.join("\n")).not.toContain("torture");
    expect(result.content).toBe("The guard talks, before it comes to that.");
    expect(storyHasLineKeywords(lineStory())).toBe(true);
    expect(storyHasLineKeywords(frStory())).toBe(false);
  });
});

describe("the refusal lists a re-ask round uses", () => {
  const call = (name: string, args: unknown = {}) => ({
    function: { name, arguments: JSON.stringify(args) },
  });

  it("refuses every roll and draw and every pause", () => {
    for (const name of [
      "formula_roll",
      "gm_roll",
      "npc_roll",
      "opposed_formula",
      "initiative_roll",
      "feat_roll",
      "action_roll",
      "fate_question",
      "roll_table",
      "roll_portent",
    ]) {
      expect(reaskRefusal(call(name)), name).toBe("roll");
    }
    expect(reaskRefusal(call("manage_track", { action: "progress_roll" }))).toBe("roll");
    for (const name of ["ask_question", "ask_for_roll", "confirm_setup"]) {
      expect(reaskRefusal(call(name)), name).not.toBeNull();
    }
    expect(reaskRefusal(call("ask_question"))).toBe("pause");
  });

  it("lets state tools through", () => {
    for (const name of ["manage_meter", "edit_note", "update_npc", "increment_scene"]) {
      expect(reaskRefusal(call(name)), name).toBeNull();
    }
    expect(reaskRefusal(call("manage_track", { action: "mark" }))).toBeNull();
  });
});

describe("the pacing note", () => {
  const assistantPart = (id: string, extra: Record<string, unknown> = {}) => ({
    id,
    content: "Nothing much happens.",
    imageUrl: "",
    user: false,
    role: "assistant" as const,
    ...extra,
  });
  const clock = {
    id: "clk_1",
    name: "The Vigil closes in",
    segments: 6,
    filled: 2,
    triggers: ["miss" as const],
    visible: true,
    paused: false,
    crossed: [],
  };
  const quietStory = (parts: unknown[]) =>
    frStory({
      lore: [],
      meters: [],
      systemState: { sessionCount: 0, dedupKeys: [], usesSystemTools: false },
      scene: { parts } as StoryData["scene"],
      campaign: { ...emptyCampaign(), clocks: [clock] },
    });

  it("reaches the next turn's prompt from the previous part", async () => {
    const note = "Nobody has named Bram in four turns; give him the next beat.";
    const story = quietStory([assistantPart("a1", { pacingNote: note })]);
    const { calls } = await play(story, "I look around", [{ content: "A quiet street." }]);
    expect(JSON.stringify(calls[0].body.messages)).toContain(note);
  });

  it("is made on crossing the threshold and counts the turn's own part once", async () => {
    // Nine earlier turns plus this turn's part, already pushed by the page.
    const parts = [
      ...Array.from({ length: 9 }, (_, i) => assistantPart(`p${i}`)),
      assistantPart("current"),
    ];
    const mock = createMockGMFetch([{ content: "A quiet street." }]);
    global.fetch = mock.fetchMock as unknown as typeof fetch;
    const result = await generateStoryTurn(
      quietStory(parts),
      "I look around",
      { ...baseOptions, scenePartId: "current" },
      {},
    );
    expect(result.scenePart?.pacingNote).toContain("No clock has moved in 10 turns");
  });

  it("is not made on the turn after the threshold", async () => {
    const parts = Array.from({ length: 10 }, (_, i) => assistantPart(`p${i}`));
    const { result } = await play(quietStory(parts), "I look around", [
      { content: "A quiet street." },
    ]);
    expect(result.scenePart?.pacingNote).toBeUndefined();
  });
});
