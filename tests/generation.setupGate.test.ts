/**
 * Integration test for session zero's setup gate, buffering and the other
 * gates' suspension, as they run inside generateStoryTurn's GM-stage loop
 * (app/misc/generation.ts, search "Session zero's setup gate"; design
 * docs/session-zero-design.md 3.6, plan slice 4). Same harness as the M2 and
 * plan gate tests: scripted GM rounds through mockGMFetch, which throws on any
 * fetch it was not given - so a story-continuation call, which has no `tools`
 * array, fails these tests loudly.
 */
import { FLAG_ONLY_OBSERVER_SETTINGS } from "./helpers/observerSettings";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { generateStoryTurn, GenerationOptions } from "@/app/misc/generation";
import type { GenerationCallbacks } from "@/app/misc/generation";
import { createMockGMFetch } from "./helpers/mockGMFetch";
import { SETUP_APPROVED, SETUP_DISMISSED } from "@/app/misc/setupConfirmAnswer";
import { setSlotOverride } from "@/app/misc/reasoningTiers";
import { CAMPAIGN_SPINE_BEATS, setupEngineLine } from "@/app/misc/campaignPlan";
import type { StoryData, StoryLore } from "@/app/misc/structs";

const GATE_TEXT = "Setup is not finished and this turn has not moved it forward";
const M2_TEXT = "This scene requires a roll before the turn can end";
const PLAN_TEXT = "write the next beat before the turn can end";

function createTestStory(overrides: Partial<StoryData> = {}): StoryData {
  return {
    story_name: "New Story",
    premise: "Test premise",
    player_name: "Test Player",
    player_summary: "Test summary",
    intro: "Test intro",
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

function sessionZeroStory(overrides: Partial<StoryData> = {}): StoryData {
  // No mode chosen: no creation step is required (setupSteps.ts), so these
  // tests exercise the gate itself. The steps have their own test files.
  return createTestStory({
    sessionZeroActive: true,
    ...overrides,
  });
}

function note(
  title: string,
  type: StoryLore["type"],
  content: string,
): StoryLore {
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

const baseOptions: GenerationOptions = {
  storyModel: "test-model",
  toolsModel: "test-model",
  choicesModel: "test-model",
  enableTools: true,
  skipChoices: true,
};

const ASK = {
  name: "ask_question",
  arguments: {
    questions: [
      {
        question: "What kind of story?",
        options: [{ label: "Gritty" }, { label: "Heroic" }],
      },
    ],
  },
};

interface Recorded {
  gmContent: string[];
  live: string[];
  storyContent: string[];
  storyComplete: string[];
  thinking: string[][];
}

function recordingCallbacks(): { cb: GenerationCallbacks; rec: Recorded } {
  const rec: Recorded = {
    gmContent: [],
    live: [],
    storyContent: [],
    storyComplete: [],
    thinking: [],
  };
  const cb: GenerationCallbacks = {
    onGMContent: (_delta, full) => rec.gmContent.push(full),
    onLiveNarrationUpdate: (visible) => rec.live.push(visible),
    onStoryContent: (_delta, full) => rec.storyContent.push(full),
    onStoryComplete: (content) => rec.storyComplete.push(content),
    onGMStageComplete: (_r, _c, _u, thinking) => rec.thinking.push(thinking ?? []),
    onAskQuestion: async () => ({
      answers: [{ selectedLabel: "Gritty", skipped: false }],
    }),
    onRequestSetupConfirmation: async () => SETUP_APPROVED,
  };
  return { cb, rec };
}

type Msg = { role: string; content: string };
const messagesOf = (call: { body: { messages: unknown } }) =>
  call.body.messages as Msg[];
const hasUser = (call: { body: { messages: unknown } }, text: string) =>
  messagesOf(call).some((m) => m.role === "user" && m.content?.includes(text));

const originalFetch = global.fetch;
afterEach(() => {
  global.fetch = originalFetch;
});

describe("setup gate - a session-zero turn may not end on prose alone", () => {
  it("re-prompts with the next step and a forced tool choice, and a rejected round never reaches anyone", async () => {
    const story = sessionZeroStory();
    const { fetchMock, gmStageCalls } = createMockGMFetch([
      { content: "REJECTED: here is my wall of setup chatter." },
      { toolCalls: [ASK] },
      { content: "Gritty it is. Tell me more about who you are." },
    ]);
    global.fetch = fetchMock as unknown as typeof fetch;
    const { cb, rec } = recordingCallbacks();

    const result = await generateStoryTurn(story, "I want a game", baseOptions, cb);

    expect(result.success).toBe(true);
    const calls = gmStageCalls();
    expect(calls).toHaveLength(3);

    // Round 2 carries the gate's message, naming the next step and its tool,
    // and is forced to call a tool. Round 1 predates it.
    expect(hasUser(calls[0], GATE_TEXT)).toBe(false);
    expect(calls[0].body.toolChoice).toBeUndefined();
    expect(hasUser(calls[1], GATE_TEXT)).toBe(true);
    expect(hasUser(calls[1], "ask_question")).toBe(true);
    expect(calls[1].body.toolChoice).toBe("required");

    // The rejected text is gone from the next request ...
    for (const call of calls.slice(1)) {
      expect(JSON.stringify(call.body.messages)).not.toContain("REJECTED");
    }
    // ... from every live callback, the delivered story and the stored turn.
    expect(rec.gmContent.join("|")).not.toContain("REJECTED");
    expect(rec.live.join("|")).not.toContain("REJECTED");
    expect(rec.storyContent.join("|")).not.toContain("REJECTED");
    expect(JSON.stringify(rec.thinking)).not.toContain("REJECTED");
    expect(JSON.stringify(result.scenePart.gmConversation ?? null)).not.toContain("REJECTED");
    expect(JSON.stringify(result.gmThinking ?? null)).not.toContain("REJECTED");
    expect(result.gmStoryContext).not.toContain("REJECTED");
    expect(result.content).not.toContain("REJECTED");
  });

  it("buffers: nothing streams live in a setup turn, and the final text is delivered once", async () => {
    const story = sessionZeroStory();
    const { fetchMock } = createMockGMFetch([
      { toolCalls: [ASK], content: "First, a question." },
      { content: "Thanks. Now the character." },
    ]);
    global.fetch = fetchMock as unknown as typeof fetch;
    const { cb, rec } = recordingCallbacks();

    const result = await generateStoryTurn(story, "start", baseOptions, cb);

    expect(rec.gmContent).toEqual([]);
    expect(rec.live).toEqual([]);
    // Delivered once, whole, through the normal completion path.
    expect(rec.storyComplete).toHaveLength(1);
    expect(rec.storyComplete[0]).toBe(result.content);
    expect(result.content).toContain("Thanks. Now the character.");
  });

  it("prose plus an unrelated or failed tool is still a violation", async () => {
    const story = sessionZeroStory();
    const { fetchMock, gmStageCalls } = createMockGMFetch([
      // A refused start_game: a failed tool is no progress.
      { toolCalls: [{ name: "start_game", arguments: { story_name: "Early" } }] },
      { content: "Straight to the story!" },
      { toolCalls: [ASK] },
      { content: "Now we are talking." },
    ]);
    global.fetch = fetchMock as unknown as typeof fetch;
    const { cb } = recordingCallbacks();

    const result = await generateStoryTurn(story, "go", baseOptions, cb);

    const calls = gmStageCalls();
    expect(calls).toHaveLength(4);
    expect(hasUser(calls[2], GATE_TEXT)).toBe(true);
    expect(result.content).toBe("Now we are talking.");
    expect(story.sessionZeroActive).toBe(true);
  });

  it("an answered question is progress: no re-prompt, and the state records it", async () => {
    const story = sessionZeroStory();
    const { fetchMock, gmStageCalls } = createMockGMFetch([
      { toolCalls: [ASK] },
      { content: "Gritty, noted. What is your character like?" },
    ]);
    global.fetch = fetchMock as unknown as typeof fetch;
    const { cb } = recordingCallbacks();

    const result = await generateStoryTurn(story, "start", baseOptions, cb);

    const calls = gmStageCalls();
    expect(calls).toHaveLength(2);
    for (const call of calls) expect(hasUser(call, GATE_TEXT)).toBe(false);
    expect(result.content).toBe("Gritty, noted. What is your character like?");
    expect(story.setup?.conceptDone).toBe(true);
    expect(story.setup?.questionsAsked).toBe(1);
  });

  it("a skipped question is not progress", async () => {
    const story = sessionZeroStory();
    const { fetchMock, gmStageCalls } = createMockGMFetch([
      { toolCalls: [ASK] },
      { content: "Fine, nothing then." },
      { toolCalls: [ASK] },
      { content: "Better." },
    ]);
    global.fetch = fetchMock as unknown as typeof fetch;
    let asked = 0;
    const { cb } = recordingCallbacks();
    cb.onAskQuestion = async () => {
      asked++;
      return asked === 1
        ? { answers: [{ skipped: true }] }
        : { answers: [{ selectedLabel: "Heroic", skipped: false }] };
    };

    const result = await generateStoryTurn(story, "start", baseOptions, cb);

    const calls = gmStageCalls();
    expect(calls).toHaveLength(4);
    expect(hasUser(calls[2], GATE_TEXT)).toBe(true);
    expect(result.content).toBe("Better.");
    expect(story.setup?.questionsAsked).toBe(1);
  });

  it("a whole setup in one turn passes, and the intro after start_game narrates", async () => {
    const story = sessionZeroStory();
    const { fetchMock, gmStageCalls } = createMockGMFetch([
      {
        content: "Writing it all down.",
        toolCalls: [
          {
            name: "create_note",
            arguments: {
              title: "Character: Mara",
              type: "character_sheet",
              content: "Mara, a courier. Nerve 2.",
            },
          },
          {
            name: "create_note",
            arguments: {
              title: "Campaign Plan",
              type: "gm_plan",
              content: "# Campaign Plan\n## Current beat - Opening Image",
              planSpineLength: "short",
            },
          },
        ],
      },
      {
        toolCalls: [
          {
            name: "confirm_setup",
            arguments: {
              character_summary: "Mara",
              campaign_hook: "A debt.",
              story_name: "The Debt",
            },
          },
        ],
      },
      // Approval starts the game itself: no start_game call is needed.
      { content: "INTRO: The rain on the courier road." },
    ]);
    global.fetch = fetchMock as unknown as typeof fetch;
    const { cb, rec } = recordingCallbacks();

    const result = await generateStoryTurn(story, "ready", baseOptions, cb);

    expect(result.success).toBe(true);
    const calls = gmStageCalls();
    expect(calls).toHaveLength(3); // no story-continuation call
    for (const call of calls) {
      expect(hasUser(call, GATE_TEXT)).toBe(false);
      expect(call.body.toolChoice).toBeUndefined();
    }
    expect(story.sessionZeroActive).toBe(false);
    expect(story.story_name).toBe("The Debt");
    expect(result.content).toContain("INTRO: The rain on the courier road.");
    // Setup chatter before start_game was held; the intro (the story) streamed.
    expect(rec.gmContent.join("|")).not.toContain("Writing it all down.");
    expect(rec.gmContent.join("|")).toContain("INTRO:");
  });

  it("approval starts the game: no start_game call, and the intro is the turn's text", async () => {
    const story = sessionZeroStory({
      lore: [
        note("Character: Mara", "character_sheet", "Mara, a courier."),
        note("Campaign Plan", "gm_plan", "# Campaign Plan\n## Current beat - Opening Image"),
      ],
    });
    const { fetchMock, gmStageCalls } = createMockGMFetch([
      {
        toolCalls: [
          {
            name: "confirm_setup",
            arguments: { character_summary: "Mara", campaign_hook: "A debt." },
          },
        ],
      },
      { content: "INTRO: it begins." },
    ]);
    global.fetch = fetchMock as unknown as typeof fetch;
    const { cb } = recordingCallbacks();

    const result = await generateStoryTurn(story, "ok", baseOptions, cb);

    const calls = gmStageCalls();
    expect(calls).toHaveLength(2);
    for (const call of calls) expect(hasUser(call, GATE_TEXT)).toBe(false);
    expect(story.sessionZeroActive).toBe(false);
    expect(result.content).toBe("INTRO: it begins.");
  });

  it("a closed card is progress: prose ends the turn without re-opening it", async () => {
    const story = sessionZeroStory({
      lore: [
        note("Character: Mara", "character_sheet", "Mara, a courier."),
        note("Campaign Plan", "gm_plan", "# Campaign Plan\n## Current beat - Opening Image"),
      ],
    });
    const { fetchMock, gmStageCalls } = createMockGMFetch([
      {
        toolCalls: [
          {
            name: "confirm_setup",
            arguments: { character_summary: "Mara", campaign_hook: "A debt." },
          },
        ],
      },
      { content: "No problem. What would you like to change?" },
    ]);
    global.fetch = fetchMock as unknown as typeof fetch;
    const { cb } = recordingCallbacks();
    cb.onRequestSetupConfirmation = async () => SETUP_DISMISSED;

    const result = await generateStoryTurn(story, "ok", baseOptions, cb);

    const calls = gmStageCalls();
    expect(calls).toHaveLength(2);
    for (const call of calls) expect(hasUser(call, GATE_TEXT)).toBe(false);
    expect(result.content).toBe("No problem. What would you like to change?");
    expect(story.sessionZeroActive).toBe(true);
  });

  it("a session-zero precomputed conversation never reaches the narration call", async () => {
    const story = sessionZeroStory();
    const { fetchMock } = createMockGMFetch([]);
    global.fetch = fetchMock as unknown as typeof fetch;
    const { cb } = recordingCallbacks();

    // The saved turn ended on prose: that text is kept, nothing is narrated.
    const kept = await generateStoryTurn(
      story,
      "go",
      {
        ...baseOptions,
        precomputedGMConversation: [{ role: "assistant", content: "Saved reply." }],
        precomputedGMResults: [],
      },
      cb,
    );
    expect(kept.content).toBe("Saved reply.");

    // No usable text: the engine line for the next step.
    const line = await generateStoryTurn(
      sessionZeroStory(),
      "go",
      {
        ...baseOptions,
        precomputedGMConversation: [],
        precomputedGMResults: [],
      },
      cb,
    );
    expect(line.content).toBe(setupEngineLine("concept"));
  });

  it("after the cap the turn ends on the engine line: no narration, no continuation call", async () => {
    const story = sessionZeroStory();
    const { fetchMock, gmStageCalls } = createMockGMFetch([
      { content: "REJECTED one" },
      { content: "REJECTED two" },
      { content: "REJECTED three" },
    ]);
    global.fetch = fetchMock as unknown as typeof fetch;
    const { cb, rec } = recordingCallbacks();

    const result = await generateStoryTurn(story, "hello", baseOptions, cb);

    expect(result.success).toBe(true);
    // Round 3 is the last one; a story-continuation call would be a 4th fetch
    // (and mockGMFetch throws on it).
    expect(gmStageCalls()).toHaveLength(3);
    expect(result.content).toBe(setupEngineLine("concept"));
    expect(result.content).toBe(
      "Next up: a few questions about the game. Anything you want to tell me first? Or just say go on.",
    );
    expect(rec.storyComplete).toEqual([result.content]);
    expect(JSON.stringify(result.scenePart.gmConversation ?? null)).not.toContain("REJECTED");
    expect(JSON.stringify(rec.thinking)).not.toContain("REJECTED");
    expect(rec.gmContent).toEqual([]);
    expect(story.sessionZeroActive).toBe(true);
  });

  it("round-limit exhaustion with no progress narrates nothing", async () => {
    const story = sessionZeroStory();
    const refused = {
      name: "start_game",
      arguments: { story_name: "Too early" },
    };
    const { fetchMock, gmStageCalls } = createMockGMFetch([
      { content: "REJECTED narrating while calling tools", toolCalls: [refused] },
      { content: "REJECTED more narrating", toolCalls: [refused] },
    ]);
    global.fetch = fetchMock as unknown as typeof fetch;
    const { cb, rec } = recordingCallbacks();

    const result = await generateStoryTurn(
      story,
      "hello",
      { ...baseOptions, maxToolLoops: 2 },
      cb,
    );

    expect(gmStageCalls()).toHaveLength(2);
    expect(result.content).toBe(setupEngineLine("concept"));
    expect(JSON.stringify(result.scenePart.gmConversation ?? null)).not.toContain("REJECTED");
    expect(JSON.stringify(rec.thinking)).not.toContain("REJECTED");
    expect(rec.gmContent).toEqual([]);
  });

  it("a model that rejects a forced tool choice gets the message only", async () => {
    const storage = new Map<string, string>();
    const ls = {
      getItem: (k: string) => (storage.has(k) ? storage.get(k)! : null),
      setItem: (k: string, v: string) => void storage.set(k, String(v)),
      removeItem: (k: string) => void storage.delete(k),
    };
    vi.stubGlobal("localStorage", ls);
    vi.stubGlobal("window", {
      localStorage: ls,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    });
    try {
      // Session zero runs on the top tier, which is the Advanced slot.
      setSlotOverride("advanced", {
        modelKey: "Qwen 3.8 Max",
        reasoningEffort: "none",
      });
      const story = sessionZeroStory();
      const { fetchMock, gmStageCalls } = createMockGMFetch([
        { content: "REJECTED prose" },
        { toolCalls: [ASK] },
        { content: "Good." },
      ]);
      global.fetch = fetchMock as unknown as typeof fetch;
      const { cb } = recordingCallbacks();

      await generateStoryTurn(story, "start", baseOptions, cb);

      const calls = gmStageCalls();
      expect(calls).toHaveLength(3);
      expect(calls[1].body.model).toBe("Qwen 3.8 Max");
      expect(hasUser(calls[1], GATE_TEXT)).toBe(true);
      expect(calls[1].body.toolChoice).toBeUndefined();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("combat or a plan beat pending during session zero: only the setup gate acts", async () => {
    const story = sessionZeroStory({
      combatState: {
        active: true,
        combatants: [],
        turnOrder: [],
        currentTurnIndex: 0,
        round: 1,
      },
      lore: [note("Campaign Plan", "gm_plan", "# Campaign Plan")],
      planState: {
        beats: [...CAMPAIGN_SPINE_BEATS],
        currentBeatIndex: 0,
        awaitingNextBeat: true,
      },
    });
    const { fetchMock, gmStageCalls } = createMockGMFetch([
      { content: "REJECTED prose" },
      { toolCalls: [ASK] },
      { content: "Done." },
    ]);
    global.fetch = fetchMock as unknown as typeof fetch;
    const { cb } = recordingCallbacks();

    const result = await generateStoryTurn(story, "start", baseOptions, cb);

    const calls = gmStageCalls();
    expect(calls).toHaveLength(3);
    expect(hasUser(calls[1], GATE_TEXT)).toBe(true);
    for (const call of calls) {
      expect(hasUser(call, M2_TEXT)).toBe(false);
      expect(hasUser(call, PLAN_TEXT)).toBe(false);
    }
    expect(result.content).toBe("Done.");
  });
});

describe("outside session zero the gates are unchanged", () => {
  let consoleLog: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    consoleLog = vi.spyOn(console, "log").mockImplementation(() => {});
  });
  afterEach(() => consoleLog.mockRestore());

  it("prose-only ends the turn, streams live, and the setup gate stays silent", async () => {
    const story = createTestStory(); // sessionZeroActive unset
    const { fetchMock, gmStageCalls } = createMockGMFetch([
      { content: "You wander through the quiet market." },
    ]);
    global.fetch = fetchMock as unknown as typeof fetch;
    const { cb, rec } = recordingCallbacks();

    // Flag-only judges: no judge may rewrite, so the prose streams live
    // (under the defaults it is held for the judges, decision 221).
    const result = await generateStoryTurn(
      story,
      "I look around",
      { ...baseOptions, observerSettings: FLAG_ONLY_OBSERVER_SETTINGS },
      cb,
    );

    const calls = gmStageCalls();
    expect(calls).toHaveLength(1);
    expect(hasUser(calls[0], GATE_TEXT)).toBe(false);
    expect(result.content).toBe("You wander through the quiet market.");
    expect(rec.gmContent.length).toBeGreaterThan(0);
    expect(rec.live.length).toBeGreaterThan(0);
  });

  it("the M2 gate still fires in a gated scene", async () => {
    const story = createTestStory({
      combatState: {
        active: true,
        combatants: [],
        turnOrder: [],
        currentTurnIndex: 0,
        round: 1,
      },
    });
    const { fetchMock, gmStageCalls } = createMockGMFetch([
      { content: "The goblin lunges." },
      { content: "It presses." },
      { content: "The fight hangs." },
    ]);
    global.fetch = fetchMock as unknown as typeof fetch;

    await generateStoryTurn(story, "attack", baseOptions, {});

    const calls = gmStageCalls();
    expect(calls).toHaveLength(3);
    expect(hasUser(calls[1], M2_TEXT)).toBe(true);
    expect(hasUser(calls[1], GATE_TEXT)).toBe(false);
  });
});
