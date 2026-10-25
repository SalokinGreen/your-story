/**
 * Step-by-step session zero inside generateStoryTurn's loop
 * (docs/session-zero-detail-design.md 3.5-3.6): a setup turn shows only its
 * latest words, an empty reply is not an end, approval starts the game and the
 * intro follows in the same turn, and a closed card is not forced open again.
 * Same harness as generation.setupGate.test.ts.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { generateStoryTurn, GenerationOptions } from "@/app/misc/generation";
import type { GenerationCallbacks } from "@/app/misc/generation";
import { createMockGMFetch, sseStreamResponse } from "./helpers/mockGMFetch";
import type { ScriptedGMRound } from "./helpers/mockGMFetch";
import { SETUP_APPROVED, SETUP_DISMISSED } from "@/app/misc/setupConfirmAnswer";
import { setupEngineLine } from "@/app/misc/campaignPlan";
import type { StoryData, StoryLore } from "@/app/misc/structs";

const GATE_TEXT = "Next step:";

function note(title: string, type: StoryLore["type"], content: string): StoryLore {
  return {
    title,
    content,
    relatedCharacters: [],
    relatedLocations: [],
    secrtet: false,
    keys: [],
    type,
  } as StoryLore;
}

const SHEET = note("Character: Mara", "character_sheet", "Mara, a courier.");
const PLAN = note("Campaign Plan", "gm_plan", "# Campaign Plan\n## Current beat - Opening Image");

function story(overrides: Partial<StoryData> = {}): StoryData {
  return {
    story_name: "New Story",
    premise: "Test premise",
    player_name: "Mara",
    player_summary: "",
    intro: "",
    scene: { parts: [] },
    lore: [],
    memory: [],
    npcs: [],
    sessionZeroActive: true,
    ...overrides,
  } as unknown as StoryData;
}

const baseOptions: GenerationOptions = {
  storyModel: "test-model",
  toolsModel: "test-model",
  choicesModel: "test-model",
  enableTools: true,
  skipChoices: true,
};

const askStep = (step: string) => ({
  name: "ask_question",
  arguments: {
    questions: [
      { question: `About ${step}?`, options: [{ label: "A" }, { label: "B" }], setup_step: step, intro: "Why it matters." },
    ],
  },
});

const CONFIRM = {
  name: "confirm_setup",
  arguments: { character_summary: "Mara", campaign_hook: "A debt.", story_name: "The Debt" },
};

interface Recorded {
  gmContent: string[];
  live: string[];
  storyComplete: string[];
  thinking: string[][];
  confirmations: number;
}

function callbacksWith(
  confirm: () => Promise<typeof SETUP_APPROVED | typeof SETUP_DISMISSED> = async () => SETUP_APPROVED,
): { cb: GenerationCallbacks; rec: Recorded } {
  const rec: Recorded = { gmContent: [], live: [], storyComplete: [], thinking: [], confirmations: 0 };
  const cb: GenerationCallbacks = {
    onGMContent: (_d, full) => rec.gmContent.push(full),
    onLiveNarrationUpdate: (visible) => rec.live.push(visible),
    onStoryComplete: (content) => rec.storyComplete.push(content),
    onGMStageComplete: (_r, _c, _u, thinking) => rec.thinking.push(thinking ?? []),
    onAskQuestion: async () => ({ answers: [{ selectedLabel: "A", skipped: false }] }),
    onRequestSetupConfirmation: async () => {
      rec.confirmations++;
      return confirm();
    },
  };
  return { cb, rec };
}

type Msg = { role: string; content: string };
const hasUser = (call: { body: { messages: unknown } }, text: string) =>
  (call.body.messages as Msg[]).some((m) => m.role === "user" && m.content?.includes(text));

/** The GM script, plus a narration stream for a turn whose GM round ends empty. */
function withNarration(rounds: ScriptedGMRound[], narration: string) {
  const gm = createMockGMFetch(rounds);
  let narrationCalls = 0;
  const fetchMock = vi.fn(async (url: unknown, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(init.body as string) : {};
    if (String(url).includes("/api/generate-stream") && !body.tools) {
      narrationCalls++;
      return sseStreamResponse({ content: narration });
    }
    return (gm.fetchMock as unknown as typeof fetch)(url as RequestInfo, init);
  });
  return { fetchMock, gmStageCalls: gm.gmStageCalls, narrationCalls: () => narrationCalls };
}

const originalFetch = global.fetch;
afterEach(() => {
  global.fetch = originalFetch;
});

/** A full-mode story with no system: six steps (setting, tone, campaign, name_look, history, drives). */
const fullStory = (overrides: Partial<StoryData> = {}) =>
  story({ setup: { mode: "full" }, ...overrides });

describe("a setup turn shows only its latest words", () => {
  it("the export's case: answers, then an empty round - the gate fires and no stale step line shows", async () => {
    const s = fullStory();
    const { fetchMock, gmStageCalls } = createMockGMFetch([
      { content: "(Step one: where is it set?)", toolCalls: [askStep("setting")] },
      { content: "(Step two: what tone?)", toolCalls: [askStep("tone")] },
      {}, // the GM says nothing
      { content: "Which kind of campaign do you want?" },
    ]);
    global.fetch = fetchMock as unknown as typeof fetch;
    const { cb, rec } = callbacksWith();

    const result = await generateStoryTurn(s, "go", baseOptions, cb);

    const calls = gmStageCalls();
    expect(calls).toHaveLength(4);
    // The empty round hit the gate even though the turn had made progress,
    // and the gate named the next step, not the card.
    expect(hasUser(calls[3], GATE_TEXT)).toBe(true);
    expect(hasUser(calls[3], 'setup_step "style"')).toBe(true);
    expect(hasUser(calls[3], "Do not call confirm_setup yet")).toBe(true);
    expect(calls[3].body.toolChoice).toBe("required");
    expect(result.content).toBe("Which kind of campaign do you want?");
    expect(result.content).not.toContain("Step one");
    expect(JSON.stringify(rec.thinking)).not.toContain("Step one");
    expect(JSON.stringify(rec.thinking)).not.toContain("Step two");
    expect(rec.gmContent).toEqual([]); // held until the end
    expect(s.setup?.covered?.table).toEqual(["setting", "tone"]);
  });

  it("only the latest round's text is the turn's text, even with text in every round", async () => {
    const s = fullStory();
    const { fetchMock } = createMockGMFetch([
      { content: "(old line one)", toolCalls: [askStep("setting")] },
      { content: "(old line two)", toolCalls: [askStep("tone")] },
      { content: "The newest question: how long a campaign?" },
    ]);
    global.fetch = fetchMock as unknown as typeof fetch;
    const { cb } = callbacksWith();

    const result = await generateStoryTurn(s, "go", baseOptions, cb);

    expect(result.content).toBe("The newest question: how long a campaign?");
    expect(JSON.stringify(result.gmThinking ?? null)).not.toContain("old line");
    // The earlier rounds stay in the GM's own conversation.
    expect(JSON.stringify(result.scenePart.gmConversation ?? null)).toContain("old line one");
  });

  it("after the cap, empty replies end the turn on the engine line naming the step", async () => {
    const s = fullStory();
    const { fetchMock, gmStageCalls } = createMockGMFetch([
      { content: "(Step one: where is it set?)", toolCalls: [askStep("setting")] },
      {},
      {},
      {},
    ]);
    global.fetch = fetchMock as unknown as typeof fetch;
    const { cb, rec } = callbacksWith();

    const result = await generateStoryTurn(s, "go", baseOptions, cb);

    // Round 1 asks; rounds 2-4 are empty: two re-prompts, then the engine line.
    expect(gmStageCalls()).toHaveLength(4);
    expect(result.content).toBe("Next up: Tone. Anything you want to tell me first? Or just say go on.");
    expect(result.content).not.toContain("Step one");
    expect(rec.storyComplete).toEqual([result.content]);
    expect(s.sessionZeroActive).toBe(true);
  });
});

describe("approval starts the game", () => {
  const ready = () => story({ setup: { mode: "quick", covered: { table: ["setting", "tone", "tone_safety"], players: {} } }, lore: [SHEET, PLAN] });

  it("the intro streams in the same turn, and the pre-start chatter is dropped", async () => {
    const s = ready();
    const { fetchMock, gmStageCalls } = createMockGMFetch([
      { content: "Here is the card.", toolCalls: [CONFIRM] },
      { content: "INTRO: The rain on the courier road." },
    ]);
    global.fetch = fetchMock as unknown as typeof fetch;
    const { cb, rec } = callbacksWith();

    const result = await generateStoryTurn(s, "ready", baseOptions, cb);

    expect(gmStageCalls()).toHaveLength(2); // no start_game call, no gate
    expect(hasUser(gmStageCalls()[1], GATE_TEXT)).toBe(false);
    expect(s.sessionZeroActive).toBe(false);
    expect(s.story_name).toBe("The Debt");
    expect(rec.confirmations).toBe(1);
    expect(result.content).toBe("INTRO: The rain on the courier road.");
    expect(result.content).not.toContain("Here is the card");
    expect(JSON.stringify(result.gmThinking ?? null)).not.toContain("Here is the card");
    // The intro streamed live; the chatter never did.
    expect(rec.gmContent.join("|")).toContain("INTRO:");
    expect(rec.gmContent.join("|")).not.toContain("Here is the card");
    expect(rec.live.join("|")).toContain("INTRO:");
    expect(rec.live.join("|")).not.toContain("Here is the card");
  });

  it("the intro can have prose before and after a tool call", async () => {
    const s = ready();
    const { fetchMock } = createMockGMFetch([
      { toolCalls: [CONFIRM] },
      {
        content: "INTRO part one.",
        toolCalls: [{ name: "calculate", arguments: { expression: "1+1", reason: "x" } }],
      },
      { content: "INTRO part two." },
    ]);
    global.fetch = fetchMock as unknown as typeof fetch;
    const { cb } = callbacksWith();

    const result = await generateStoryTurn(s, "ready", baseOptions, cb);

    expect(result.content).toContain("INTRO part one.");
    expect(result.content).toContain("INTRO part two.");
  });

  it("an empty intro after the start falls through to the narration call, not the gate", async () => {
    const s = ready();
    const h = withNarration([{ toolCalls: [CONFIRM] }, {}], "NARRATED: the courier road.");
    global.fetch = h.fetchMock as unknown as typeof fetch;
    const { cb } = callbacksWith();

    const result = await generateStoryTurn(s, "ready", baseOptions, cb);

    expect(s.sessionZeroActive).toBe(false);
    expect(h.narrationCalls()).toBe(1);
    expect(h.gmStageCalls().every((c) => !hasUser(c, GATE_TEXT))).toBe(true);
    expect(result.content).toBe("NARRATED: the courier road.");
  });

  it("approval on the last allowed round still starts the game and narrates the intro", async () => {
    const s = ready();
    const h = withNarration([{ content: "chatter", toolCalls: [CONFIRM] }], "NARRATED: it begins.");
    global.fetch = h.fetchMock as unknown as typeof fetch;
    const { cb } = callbacksWith();

    const result = await generateStoryTurn(s, "ready", { ...baseOptions, maxToolLoops: 1 }, cb);

    expect(s.sessionZeroActive).toBe(false);
    expect(h.gmStageCalls()).toHaveLength(1);
    expect(h.narrationCalls()).toBe(1);
    expect(result.content).toBe("NARRATED: it begins.");
    expect(result.content).not.toContain(setupEngineLine("confirm"));
  });

  it("hitting the round limit on chained answered questions ends on the engine line, not the last round's text", async () => {
    const s = story({ setup: { mode: "quick" } });
    const { fetchMock } = createMockGMFetch([
      { content: "Where is it set? (stale)", toolCalls: [askStep("setting")] },
      { content: "And the tone? (stale)", toolCalls: [askStep("tone")] },
      { content: "Any lines? (stale)", toolCalls: [askStep("tone_safety")] },
    ]);
    global.fetch = fetchMock as unknown as typeof fetch;
    const { cb, rec } = callbacksWith();

    const result = await generateStoryTurn(s, "hi", { ...baseOptions, maxToolLoops: 3 }, cb);

    expect(s.sessionZeroActive).toBe(true);
    expect(result.content).not.toContain("stale");
    expect(result.content).toBe(setupEngineLine("character", { covered: 3, total: 3, missing: [] }));
    expect(rec.storyComplete.join("")).not.toContain("stale");
  });

  it("Stop on the card cancels the turn: nothing is committed and the game has not started", async () => {
    const s = ready();
    const { fetchMock } = createMockGMFetch([
      { content: "Here is the card.", toolCalls: [CONFIRM] },
    ]);
    global.fetch = fetchMock as unknown as typeof fetch;
    const { cb } = callbacksWith(async () => ({ stopped: true }) as never);

    await expect(generateStoryTurn(s, "ready", baseOptions, cb)).rejects.toThrow(
      /cancelled by user/,
    );
    expect(s.sessionZeroActive).toBe(true);
    expect(s.setup?.approval).toBeUndefined();
    expect(s.story_name).toBe("New Story");
  });

  it("an approval whose sheet is missing is refused, not started", async () => {
    const s = story({
      setup: { mode: "quick", covered: { table: ["setting", "tone", "tone_safety"], players: {} } },
      lore: [PLAN],
    });
    const { fetchMock, gmStageCalls } = createMockGMFetch([
      { toolCalls: [CONFIRM] },
      { content: "REJECTED: no progress yet." }, // a refusal is no progress
      { toolCalls: [askStep("campaign")] },
      { content: "I still need the sheet." },
    ]);
    global.fetch = fetchMock as unknown as typeof fetch;
    const { cb, rec } = callbacksWith();

    const result = await generateStoryTurn(s, "ready", baseOptions, cb);

    expect(rec.confirmations).toBe(0);
    expect(s.sessionZeroActive).toBe(true);
    expect(gmStageCalls()).toHaveLength(4);
    expect(hasUser(gmStageCalls()[2], GATE_TEXT)).toBe(true);
    expect(result.content).toBe("I still need the sheet.");
  });
});

describe("a closed or sent-back card", () => {
  const ready = () => story({ setup: { mode: "quick", covered: { table: ["setting", "tone", "tone_safety"], players: {} } }, lore: [SHEET, PLAN] });

  it("dismissed, then an empty round: the turn ends on the engine's question, no card forced", async () => {
    const s = ready();
    const { fetchMock, gmStageCalls } = createMockGMFetch([
      { content: "Here is the card.", toolCalls: [CONFIRM] },
      {},
    ]);
    global.fetch = fetchMock as unknown as typeof fetch;
    const { cb, rec } = callbacksWith(async () => SETUP_DISMISSED);

    const result = await generateStoryTurn(s, "ready", baseOptions, cb);

    const calls = gmStageCalls();
    expect(calls).toHaveLength(2);
    for (const call of calls) expect(hasUser(call, GATE_TEXT)).toBe(false);
    expect(rec.confirmations).toBe(1);
    expect(result.content).toBe("(What would you like to change?)");
    expect(s.sessionZeroActive).toBe(true);
  });

  it("sent back with changes, then an empty round: same", async () => {
    const s = ready();
    const { fetchMock, gmStageCalls } = createMockGMFetch([{ toolCalls: [CONFIRM] }, {}]);
    global.fetch = fetchMock as unknown as typeof fetch;
    const { cb } = callbacksWith(async () => ({ approved: false, note: "Make her older" }) as never);

    const result = await generateStoryTurn(s, "ready", baseOptions, cb);

    expect(gmStageCalls()).toHaveLength(2);
    expect(result.content).toBe("(What would you like to change?)");
  });

  it("a non-empty reply after the card is shown as it is", async () => {
    const s = ready();
    const { fetchMock } = createMockGMFetch([
      { toolCalls: [CONFIRM] },
      { content: "Of course. What should change?" },
    ]);
    global.fetch = fetchMock as unknown as typeof fetch;
    const { cb } = callbacksWith(async () => SETUP_DISMISSED);

    const result = await generateStoryTurn(s, "ready", baseOptions, cb);

    expect(result.content).toBe("Of course. What should change?");
  });
});

describe("a Retry in session zero", () => {
  it("shows the latest round's text, not an earlier tool-less one", async () => {
    const s = fullStory();
    const { fetchMock } = createMockGMFetch([]);
    global.fetch = fetchMock as unknown as typeof fetch;
    const { cb } = callbacksWith();

    const result = await generateStoryTurn(
      s,
      "go",
      {
        ...baseOptions,
        precomputedGMConversation: [
          { role: "assistant", content: "(Step one: where is it set?)" },
          {
            role: "assistant",
            content: "Latest: what tone do you want?",
            tool_calls: [
              { id: "t1", type: "function", function: { name: "ask_question", arguments: "{}" } },
            ],
          },
          { role: "tool", content: "[ask_question] ok", tool_call_id: "t1" },
        ],
        precomputedGMResults: [],
      },
      cb,
    );

    expect(result.content).toBe("Latest: what tone do you want?");
  });

  it("an empty latest round gives the engine line naming the step, never old text", async () => {
    const s = fullStory();
    const { fetchMock } = createMockGMFetch([]);
    global.fetch = fetchMock as unknown as typeof fetch;
    const { cb } = callbacksWith();

    const result = await generateStoryTurn(
      s,
      "go",
      {
        ...baseOptions,
        precomputedGMConversation: [
          { role: "assistant", content: "(Step one: where is it set?)" },
          { role: "assistant", content: "" },
        ],
        precomputedGMResults: [],
      },
      cb,
    );

    expect(result.content).toBe("Next up: Setting. Anything you want to tell me first? Or just say go on.");
  });

  it("a conversation that started the game through the card is narrated, not held", async () => {
    const s = story({
      sessionZeroActive: true,
      lore: [SHEET, PLAN],
    });
    const h = withNarration([], "NARRATED intro.");
    global.fetch = h.fetchMock as unknown as typeof fetch;
    const { cb } = callbacksWith();

    // Session zero is still on in the stored story; only the confirm_setup result's `started` flag says the game began.
    const result = await generateStoryTurn(
      s,
      "go",
      {
        ...baseOptions,
        precomputedGMConversation: [{ role: "assistant", content: "" }],
        precomputedGMResults: [
          {
            toolName: "confirm_setup",
            toolCallId: "c1",
            success: true,
            result: { type: "confirm_setup", outcome: "approved", started: true },
            contextForStory: "",
          },
        ],
      },
      cb,
    );
    expect(result.content).toBe("NARRATED intro.");
  });
});
