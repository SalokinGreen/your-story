/**
 * Campaign slice 2 (design 14.1, status report 6.16 and 6.22): the narration
 * call and every rewrite are given an allowlisted context, not the GM's
 * conversation.
 *
 *  - publicSummary: the per-tool line the narrator may be told of a result;
 *  - buildNarrationContext: what the context holds and leaves out;
 *  - a real turn through generateStoryTurn, with a canary string in the GM's
 *    reasoning, in a tool call's arguments, in a note the GM read and in a
 *    campaign secret: none of them reaches the narration request or the
 *    rewrite request, and a story_instructions note does.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { generateStoryTurn, type GenerationOptions } from "@/app/misc/generation";
import {
  buildNarrationContext,
  recentProse,
  NARRATION_RECENT_PARTS,
} from "@/app/misc/campaign/narrationContext";
import { emptyCampaign } from "@/app/misc/campaign/types";
import { publicSummary } from "@/app/misc/turnTimeline";
import {
  createMockGMFetch,
  sseStreamResponse,
  type ScriptedGMRound,
} from "./helpers/mockGMFetch";
import { LEGACY_OBSERVER_SETTINGS } from "./helpers/observerSettings";
import type { StoryData } from "@/app/misc/structs";

const CANARY_REASONING = "CANARY_REASONING_the_baron_poisoned_the_well";
const CANARY_ARG = "CANARY_ARG_note_to_self";
const CANARY_NOTE = "CANARY_NOTE_the_ledger_names_the_traitor";
const CANARY_CAMPAIGN = "CANARY_CAMPAIGN_the_abbot_is_the_vampire";
const CANARY_PRIOR_HIDDEN = "CANARY_PRIOR_HIDDEN_span";
const CANARY_PLAN = "CANARY_PLAN_the_ending_is_a_betrayal";
const CANARY_DM = "CANARY_DM_instructions_secret";
const CANARY_NPC_NOTES = "CANARY_NPC_NOTES_gm_only";
const STYLE = "STYLE_CANARY write clipped, rain-soaked noir";

function story(overrides: Partial<StoryData> = {}): StoryData {
  const campaign = emptyCampaign();
  campaign.pitch = { premise: "A town with a secret", tone: ["noir", "dread"] };
  campaign.safety = {
    lines: [{ id: "saf_1", text: "No harm to children", keywords: [] }],
    veils: [{ id: "saf_2", text: "Torture happens off screen", keywords: [] }],
  };
  campaign.secrets = [
    {
      id: "sec_1",
      title: "The abbot",
      truth: CANARY_CAMPAIGN,
      keyPhrases: [],
      revealed: false,
      clues: [{ id: "clu_1", text: `Clue: ${CANARY_CAMPAIGN}`, found: false }],
    },
  ];
  return {
    story_name: "Rainfall",
    premise: "A courier arrives in a drowned town.",
    player_name: "Ines",
    player_summary: "",
    intro: "",
    scene: {
      parts: [
        { content: "The ferry leaves you at the pier.", imageUrl: "", user: false, role: "assistant" },
        { content: "> I walk to the inn", imageUrl: "", user: true, role: "user" },
        {
          content: `The inn is warm. [[HIDDEN_LORE:Ledger]]${CANARY_PRIOR_HIDDEN}[[/HIDDEN_LORE]] A man nods at you.`,
          imageUrl: "",
          user: false,
          role: "assistant",
        },
        { content: "> I pick the lock", imageUrl: "", user: true, role: "user" },
      ],
    },
    chapters: [],
    stats: [],
    resources: [],
    inventory: [],
    abilities: [],
    achievements: [],
    lore: [
      {
        title: "Character Sheet",
        content: "Ines, a courier. Nimble 3.",
        type: "character_sheet",
        enabled: true,
      },
      {
        title: "Ledger",
        content: CANARY_NOTE,
        type: "secret",
        enabled: true,
      },
      {
        title: "Narrator style",
        content: STYLE,
        type: "story_instructions",
        enabled: true,
      },
      { title: "Plan", content: CANARY_PLAN, type: "gm_plan", enabled: true },
      { title: "DM", content: CANARY_DM, type: "dm_instructions", enabled: true },
    ],
    memory: [],
    npcs: [
      {
        id: "n1",
        name: "Marta the ferrywoman",
        description: "A weathered woman with a lantern.",
        role: "Ferrywoman",
        status: "alive",
        relationship: "",
        attitude: "neutral",
        notes: CANARY_NPC_NOTES,
        createdAt: 0,
      },
    ],
    timers: [
      { id: "t1", name: "Tide", totalTicks: 3, currentTicks: 0, autoAdvance: false, status: "triggered", visibility: "visible", createdAt: 0 },
      { id: "t2", name: "Poison", totalTicks: 3, currentTicks: 0, autoAdvance: false, status: "triggered", visibility: "hidden", createdAt: 0 },
    ],
    sessionZeroActive: false,
    campaign,
    ...overrides,
  } as unknown as StoryData;
}

describe("publicSummary", () => {
  it("keeps a dice line and redacts hidden spans", () => {
    expect(
      publicSummary({
        toolName: "formula_roll",
        success: true,
        contextForStory: "[Roll: 1d20+3 = 19]",
      }),
    ).toBe("[Roll: 1d20+3 = 19]");
    expect(
      publicSummary({
        toolName: "formula_roll",
        success: true,
        contextForStory: "[Roll 19] [[HIDDEN_LORE:X]]secret[[/HIDDEN_LORE]]",
      }),
    ).toBe("[Roll 19] (hidden note)");
  });

  it("gives nothing for a note read, a memory search, the campaign tool, a hidden roll or an unknown tool", () => {
    for (const toolName of [
      "read_notes",
      "search_memory",
      "get_game_state",
      "campaign",
      "gm_roll",
      "create_note",
      "edit_note",
      "manage_timer",
      "some_future_tool",
    ]) {
      expect(
        publicSummary({ toolName, success: true, contextForStory: `${CANARY_NOTE}` }),
      ).toBeNull();
    }
    expect(
      publicSummary({
        toolName: "formula_roll",
        success: true,
        contextForStory: "[Roll 4]",
        hiddenFromPlayer: true,
      }),
    ).toBeNull();
  });

  it("gives nothing for an error, which echoes the GM's arguments", () => {
    expect(
      publicSummary({
        toolName: "formula_roll",
        success: false,
        contextForStory: `[ERROR: formula_roll failed - bad]\n[Debug: params={"x":"${CANARY_ARG}"}]`,
      }),
    ).toBeNull();
  });

  it("keeps a visible clock's tick and never a hidden clock's", () => {
    const reports = [
      { visible: true, line: '[Clock "Dread" 2/6 → 3/6 (miss). Portent reached: bells]' },
      { visible: false, line: `[Clock (hidden) "Secret" 1/4 → 2/4 (miss): ${CANARY_CAMPAIGN}]` },
    ];
    // A dice tool: contextForStory already carries the visible line only.
    const dice = publicSummary({
      toolName: "action_roll",
      success: false,
      contextForStory: `[Action roll: miss]\n${reports[0].line}`,
      clockReports: reports,
    });
    expect(dice).toContain("Portent reached: bells");
    expect(dice).not.toContain(CANARY_CAMPAIGN);
    // A tool outside the allowlist that ticked a clock: the visible line alone.
    const other = publicSummary({
      toolName: "increment_scene",
      success: true,
      contextForStory: "scene advanced",
      clockReports: reports,
    });
    expect(other).toBe(reports[0].line);
  });
});

describe("buildNarrationContext", () => {
  const turn = {
    playerLine: "I pick the lock",
    results: [
      { toolName: "formula_roll", success: true, contextForStory: "[Roll: 1d20+3 = 19]" },
      { toolName: "read_notes", success: true, contextForStory: `Ledger: ${CANARY_NOTE}` },
    ],
  };

  it("holds the player's line, public summaries, tone, lines, veils and the style notes", () => {
    const messages = buildNarrationContext(turn, story());
    const text = messages.map((m) => m.content).join("\n");
    expect(text).toContain("I pick the lock");
    expect(text).toContain("[Roll: 1d20+3 = 19]");
    expect(text).toContain("noir, dread");
    expect(text).toContain("No harm to children");
    expect(text).toContain("Torture happens off screen");
    expect(text).toContain(STYLE);
  });

  it("leaves out a read note, a secret, an unfound clue and a hidden span in earlier prose", () => {
    const text = buildNarrationContext(turn, story())
      .map((m) => m.content)
      .join("\n");
    expect(text).not.toContain(CANARY_NOTE);
    expect(text).not.toContain(CANARY_CAMPAIGN);
    expect(text).not.toContain(CANARY_PRIOR_HIDDEN);
    // ...but the visible earlier prose is there.
    expect(text).toContain("The inn is warm.");
  });

  it("strips <thinking> and hidden spans from the GM's prose", () => {
    const text = buildNarrationContext(
      {
        ...turn,
        gmProse: `<thinking>${CANARY_REASONING}</thinking>The lock yields. [[HIDDEN_LORE:Ledger]]${CANARY_NOTE}[[/HIDDEN_LORE]]`,
      },
      story(),
    )
      .map((m) => m.content)
      .join("\n");
    expect(text).toContain("The lock yields.");
    expect(text).not.toContain(CANARY_REASONING);
    expect(text).not.toContain(CANARY_NOTE);
  });

  it("is byte-identical in its first two messages from turn to turn", () => {
    const a = buildNarrationContext(turn, story());
    const b = buildNarrationContext(
      { ...turn, playerLine: "I open the door", results: [] },
      story({
        scene: {
          parts: [
            { content: "Something else entirely.", imageUrl: "", user: false, role: "assistant" },
          ],
        },
      } as Partial<StoryData>),
    );
    expect(a[0]).toEqual(b[0]);
    expect(a[1]).toEqual(b[1]);
    expect(a[1].cacheBreakpoint).toBe("prefix");
    expect(a[2]).not.toEqual(b[2]);
  });

  it("works for a story with no campaign record and no style notes", () => {
    const plain = story({ campaign: undefined, lore: [] } as Partial<StoryData>);
    const messages = buildNarrationContext(turn, plain);
    expect(messages).toHaveLength(3);
    expect(messages[1].content).toContain("Rainfall");
    expect(messages[1].content).not.toContain("Tone");
  });
});

describe("a timer that fires", () => {
  const fired = (timer: string, text: string) => ({
    toolName: "trigger_timer",
    success: true,
    contextForStory: text,
    result: { type: "trigger_timer", timer },
  });
  const turnWith = (r: ReturnType<typeof fired>) => ({
    playerLine: "I wait",
    results: [r],
  });

  it("is told to the narrator when the player can see the timer", () => {
    const text = buildNarrationContext(
      turnWith(fired("Tide", '[⏰ TIMER TRIGGERED: "Tide" | Effect: the water floods the cellar]')),
      story(),
    )
      .map((m) => m.content)
      .join("\n");
    expect(text).toContain("the water floods the cellar");
  });

  it("stays out when the timer is hidden", () => {
    const text = buildNarrationContext(
      turnWith(fired("Poison", '[⏰ TIMER TRIGGERED: "Poison" | Effect: CANARY_HIDDEN_TIMER]')),
      story(),
    )
      .map((m) => m.content)
      .join("\n");
    expect(text).not.toContain("CANARY_HIDDEN_TIMER");
  });

  it("covers a visible clock filled through manage_timer, and a hidden one stays out", () => {
    const s = story();
    s.campaign!.clocks.push(
      { id: "c1", name: "Alarm", segments: 4, filled: 4, triggers: [], visible: true, paused: false, crossed: [] },
      { id: "c2", name: "Cult", segments: 4, filled: 4, triggers: [], visible: false, paused: false, crossed: [] },
    );
    const adv = (timer: string) => ({
      toolName: "manage_timer",
      success: true,
      contextForStory: `[Clock "${timer}" 3/4 → 4/4. FULL: bells ring]`,
      result: { type: "advance_timer", timer, triggered: true },
    });
    const wire = (r: ReturnType<typeof adv>) =>
      buildNarrationContext({ playerLine: "x", results: [r] }, s)
        .map((m) => m.content)
        .join("\n");
    expect(wire(adv("Alarm"))).toContain("bells ring");
    expect(wire(adv("Cult"))).not.toContain("bells ring");
  });
});

describe("the character sheet and roster", () => {
  it("puts the sheet in the stable block, byte-identical across turns while it is unchanged", () => {
    const a = buildNarrationContext({ playerLine: "a", results: [] }, story());
    const b = buildNarrationContext({ playerLine: "b", results: [] }, story());
    expect(a[1].content).toContain("Nimble 3");
    expect(a[1].content).toBe(b[1].content);
    expect(a[2].content).toContain("Marta the ferrywoman");
  });

  it("includes every enabled sheet, and never gm_plan, dm_instructions or NPC notes", () => {
    const s = story();
    s.lore.push({ title: "Character: Bram", content: "Bram, a sailor. Tough 2.", type: "character_sheet", enabled: true } as StoryData["lore"][number]);
    const text = buildNarrationContext({ playerLine: "x", results: [] }, s)
      .map((m) => m.content)
      .join("\n");
    expect(text).toContain("Nimble 3");
    expect(text).toContain("Tough 2");
    for (const c of [CANARY_PLAN, CANARY_DM, CANARY_NPC_NOTES, CANARY_NOTE]) {
      expect(text).not.toContain(c);
    }
  });
});

describe("recentProse", () => {
  it("is bounded to the last few parts and leaves out this turn's own part", () => {
    const parts = Array.from({ length: 20 }, (_, i) => ({
      content: `Turn ${i} prose.`,
      imageUrl: "",
      user: false,
      role: "assistant" as const,
      id: `p${i}`,
    }));
    const out = recentProse({ scene: { parts } } as Pick<StoryData, "scene">, "p19");
    expect(out).toContain("Turn 18 prose.");
    expect(out).not.toContain("Turn 19 prose.");
    expect(out.split("\n\n")).toHaveLength(NARRATION_RECENT_PARTS);
  });
});

// ---- A real turn -----------------------------------------------------------

const LONG_NARRATION = Array(400).fill("word").join(" ");
const REWRITTEN = "You force the lock. It gives.";

interface Req {
  url: string;
  body: { messages: { role: string; content: string }[]; tools?: unknown[]; reasoningEffort?: string };
}

function judge(justified: boolean): string {
  return JSON.stringify({
    justified,
    violation: false,
    severity: "minor",
    reason: "",
    contradicts: false,
    missed_oracle_or_table: false,
    missed_scene_increment: false,
    should_escalate: false,
  });
}

const rounds: ScriptedGMRound[] = [
  {
    reasoning: CANARY_REASONING,
    toolCalls: [
      { id: "c1", name: "read_notes", arguments: { titles: ["Ledger"] } },
      {
        id: "c2",
        name: "formula_roll",
        arguments: { formulas: ["1d20+3"], reason: "Pick the lock", note_to_self: CANARY_ARG },
      },
    ],
  },
  // Terminal round, no prose: the separate narration call writes the turn.
  {},
];

const originalFetch = global.fetch;
afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

async function runTurn(narration: string, lengthJudgeJustified: boolean) {
  const gm = createMockGMFetch(rounds);
  const narrationCalls: Req[] = [];
  const rewriteCalls: Req[] = [];
  const allCalls: Req[] = [];
  const fetchMock = vi.fn(async (url: unknown, init?: RequestInit) => {
    const req: Req = { url: String(url), body: JSON.parse(init!.body as string) };
    allCalls.push(req);
    if (req.url === "/api/generate") {
      const messages = req.body.messages;
      const last = messages[messages.length - 1]?.content ?? "";
      let content = judge(true);
      if (last.includes("flagged by an automated reviewer")) {
        rewriteCalls.push(req);
        content = REWRITTEN;
      } else if (messages[0]?.content?.includes("usual ceiling of ~")) {
        content = judge(lengthJudgeJustified);
      }
      return { ok: true, json: async () => ({ content }) } as unknown as Response;
    }
    if (req.url.includes("/api/generate-stream") && !req.body.tools) {
      narrationCalls.push(req);
      return sseStreamResponse({ content: narration });
    }
    return (gm.fetchMock as unknown as typeof fetch)(url as RequestInfo, init);
  });
  global.fetch = fetchMock as unknown as typeof fetch;
  vi.spyOn(console, "warn").mockImplementation(() => {});
  const options: GenerationOptions = {
    storyModel: "test-model",
    toolsModel: "test-model",
    choicesModel: "test-model",
    enableTools: true,
    skipChoices: true,
    replyLength: "medium",
    observerSettings: LEGACY_OBSERVER_SETTINGS,
  };
  const result = await generateStoryTurn(story(), "I pick the lock", options, {});
  for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 0));
  return { result, narrationCalls, rewriteCalls, allCalls };
}

const CANARIES = [
  CANARY_REASONING,
  CANARY_ARG,
  CANARY_NOTE,
  CANARY_CAMPAIGN,
  CANARY_PRIOR_HIDDEN,
  CANARY_PLAN,
  CANARY_DM,
  CANARY_NPC_NOTES,
];

describe("the narration request of a real turn", () => {
  it("holds none of the GM's reasoning, tool arguments, read notes or campaign secrets, and the style notes", async () => {
    const { narrationCalls, allCalls } = await runTurn("The lock clicks open.", true);
    // The premise: the GM did see the canaries (its second round carries them).
    const gmWire = JSON.stringify(allCalls.filter((c) => c.body.tools).map((c) => c.body.messages));
    expect(gmWire).toContain(CANARY_NOTE);
    expect(gmWire).toContain(CANARY_ARG);
    expect(narrationCalls).toHaveLength(1);
    const wire = JSON.stringify(narrationCalls[0].body);
    for (const canary of CANARIES) expect(wire).not.toContain(canary);
    expect(wire).toContain("STYLE_CANARY");
    // The sheet and the visible roster reach it.
    expect(wire).toContain("Nimble 3");
    expect(wire).toContain("Marta the ferrywoman");
    // The roll the GM made is there, as its public summary.
    expect(wire).toContain("1d20+3");
    // No GM tool list, no GM system prompt.
    expect(narrationCalls[0].body.tools).toBeUndefined();
    expect(narrationCalls[0].body.messages[0].content).toContain("narrator");
    expect(narrationCalls[0].body.reasoningEffort).toBeDefined();
  });

  it("builds the rewrite request from the same context", async () => {
    const { narrationCalls, rewriteCalls, result } = await runTurn(LONG_NARRATION, false);
    expect(result.content).toBe(REWRITTEN);
    expect(rewriteCalls).toHaveLength(1);
    const wire = JSON.stringify(rewriteCalls[0].body);
    for (const canary of CANARIES) expect(wire).not.toContain(canary);
    expect(wire).toContain("STYLE_CANARY");
    // The sheet and the visible roster reach it.
    expect(wire).toContain("Nimble 3");
    expect(wire).toContain("Marta the ferrywoman");

    // The rewrite continues the narration's own messages: the system message,
    // the stable block and the live block are the narration request's, verbatim.
    const narration = narrationCalls[0].body.messages;
    const rewrite = rewriteCalls[0].body.messages;
    expect(rewrite.slice(0, 3)).toEqual(narration.slice(0, 3));
    expect(rewrite[rewrite.length - 1].content).toContain("flagged by an automated reviewer");
  });
});
