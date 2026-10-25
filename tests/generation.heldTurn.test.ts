/**
 * A turn held for the judges (decision 221), as it runs inside generateStoryTurn:
 * when a judge may rewrite the turn, nothing the player could see, hear or be
 * sent reaches a live callback until the judging is done; the text is then
 * released once, as the rewrite when a judge flagged it. Mirrors
 * tests/generation.judgeLayer.test.ts: scripted GM rounds through
 * tests/helpers/mockGMFetch.ts, side calls answered by `respond`.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { generateStoryTurn, GenerationOptions } from "@/app/misc/generation";
import type { GenerationCallbacks } from "@/app/misc/generation";
import { createMockGMFetch, sseStreamResponse } from "./helpers/mockGMFetch";
import { FLAG_ONLY_OBSERVER_SETTINGS } from "./helpers/observerSettings";
import { cloneDefaultObserverSettings } from "@/app/misc/observer";
import type { StoryData } from "@/app/misc/structs";
import type { ObserverSettings } from "@/app/misc/observer";

const SHORT = "The lock clicks open. The corridor beyond is dark.";
const LONG = Array(400).fill("word").join(" ");
const REWRITTEN = "You force the lock. It gives.";
const CHOICES = "- Step into the corridor\n- Listen at the door\n- Walk away";

const ALL_CLEAR = JSON.stringify({
  justified: true,
  violation: false,
  severity: "minor",
  reason: "",
  mismatch: false,
  missed_oracle_or_table: false,
  missed_scene_increment: false,
  should_escalate: false,
});
const LENGTH_UNJUSTIFIED = JSON.stringify({ justified: false, reason: "padding" });
const AGENCY_VIOLATION = JSON.stringify({
  violation: true,
  severity: "major",
  reason: "Spoke for the player.",
});

function story(): StoryData {
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
  } as unknown as StoryData;
}

// Decision 237: agency rewrites by default and is plausible on every turn with
// a player line. These two settle it down for the tests about the other judges.
const AGENCY_OFF: ObserverSettings = {
  ...cloneDefaultObserverSettings(),
  player_agency: { enabled: false, triggersReset: false, sensitivity: 3 },
};
const AGENCY_FLAG: ObserverSettings = {
  ...cloneDefaultObserverSettings(),
  player_agency: { enabled: true, triggersReset: false, sensitivity: 3 },
};

const baseOptions: GenerationOptions = {
  storyModel: "test-model",
  toolsModel: "test-model",
  choicesModel: "test-model",
  enableTools: true,
  skipChoices: true,
  replyLength: "medium",
  openRouterKey: "openrouter-test-key",
  scenePartId: "part-under-test",
  observerSettings: cloneDefaultObserverSettings(),
};

interface Call {
  url: string;
  body: { messages: { role: string; content: string }[]; tools?: unknown[] };
}
const first = (c: Call) => c.body.messages[0]?.content ?? "";
const last = (c: Call) => c.body.messages[c.body.messages.length - 1]?.content ?? "";
const isRewrite = (c: Call) => last(c).includes("flagged by an automated reviewer");
const isLengthJudge = (c: Call) => first(c).includes("usual ceiling of ~");
const isAgencyJudge = (c: Call) => first(c).includes("took a decision away from the player");
const isChoices = (c: Call) =>
  c.url === "/api/generate-stream" && !c.body.tools && first(c).includes("choice designer");

let choicesFail = false;
let storyStageContent: string | null = null;
const isAnyJudge = (c: Call) => isLengthJudge(c) || isAgencyJudge(c);

/** One shared, ordered log of what the judges were asked and what the player was shown. */
function installFetch(
  events: string[],
  rounds: Parameters<typeof createMockGMFetch>[0],
  respond: (call: Call) => Promise<string> | string,
): { calls: Call[] } {
  const gm = createMockGMFetch(rounds);
  const calls: Call[] = [];
  global.fetch = vi.fn(async (url: unknown, init?: RequestInit) => {
    const call: Call = { url: String(url), body: JSON.parse(init!.body as string) };
    calls.push(call);
    if (call.url === "/api/generate") {
      if (isRewrite(call)) events.push("call:rewrite");
      else if (isAnyJudge(call)) events.push("call:judge");
      else events.push("call:other");
      const content = await respond(call);
      return { ok: true, json: async () => ({ content }) } as unknown as Response;
    }
    if (isChoices(call)) {
      if (choicesFail) {
        return {
          ok: false,
          status: 500,
          text: async () => "boom",
          json: async () => ({ error: "boom" }),
        } as unknown as Response;
      }
      return sseStreamResponse({ content: CHOICES });
    }
    if (call.url === "/api/generate-stream" && !call.body.tools && storyStageContent !== null) {
      return sseStreamResponse({ content: storyStageContent });
    }
    return (gm.fetchMock as unknown as typeof fetch)(url as RequestInfo, init);
  }) as unknown as typeof fetch;
  vi.spyOn(console, "warn").mockImplementation(() => {});
  return { calls };
}

/** Callbacks that log what the player would see, hear or be sent. */
function watching(events: string[], extra: GenerationCallbacks = {}): GenerationCallbacks {
  return {
    onGMContent: () => events.push("shown:gm"),
    onLiveNarrationUpdate: () => events.push("shown:live"),
    onStoryStart: () => events.push("shown:start"),
    onStoryContent: () => events.push("shown:story"),
    onStoryComplete: () => events.push("shown:complete"),
    onChoicesComplete: () => events.push("shown:choices"),
    onObserverRewrite: () => events.push("rewrite-applied"),
    onTurnPhase: (phase) => events.push(`phase:${phase}`),
    onComplete: () => events.push("complete"),
    ...extra,
  };
}

async function settle(): Promise<void> {
  for (let i = 0; i < 30; i++) await new Promise((r) => setTimeout(r, 0));
}

const originalFetch = global.fetch;
afterEach(() => {
  global.fetch = originalFetch;
  choicesFail = false;
  storyStageContent = null;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const lastIndex = (events: string[], prefix: string) =>
  events.reduce((acc, e, i) => (e.startsWith(prefix) ? i : acc), -1);
const firstIndex = (events: string[], prefix: string) =>
  events.findIndex((e) => e.startsWith(prefix));

describe("under the defaults a turn a judge may rewrite is held (decision 221)", () => {
  const respond = (call: Call) => {
    if (isRewrite(call)) return REWRITTEN;
    if (isLengthJudge(call)) return LENGTH_UNJUSTIFIED;
    return ALL_CLEAR;
  };

  it("shows nothing before the judges finish, then releases the rewrite once", async () => {
    const events: string[] = [];
    installFetch(events, [{ content: LONG }], respond);
    const shown: string[] = [];
    const result = await generateStoryTurn(
      story(),
      "I pick the lock",
      baseOptions,
      watching(events, {
        onStoryContent: (_c, full) => {
          events.push("shown:story");
          shown.push(full);
        },
        onStoryComplete: (content) => {
          events.push("shown:complete");
          shown.push(content);
        },
      }),
    );
    await settle();

    expect(result.content).toBe(REWRITTEN);
    // The GM's live text and the live narration never fired at all.
    expect(events).not.toContain("shown:gm");
    expect(events).not.toContain("shown:live");
    // Nothing was shown until the last judge and the rewrite had answered.
    const lastCall = Math.max(lastIndex(events, "call:judge"), lastIndex(events, "call:rewrite"));
    expect(lastCall).toBeGreaterThan(-1);
    expect(firstIndex(events, "shown:story")).toBeGreaterThan(lastCall);
    expect(firstIndex(events, "shown:complete")).toBeGreaterThan(lastCall);
    // What was shown is the rewrite, never the first draft.
    expect(shown.length).toBeGreaterThan(0);
    expect(shown.every((t) => t === REWRITTEN)).toBe(true);
    // The page's part exists before it is told about the revision, and the
    // text is released exactly once.
    expect(firstIndex(events, "shown:story")).toBeLessThan(firstIndex(events, "rewrite-applied"));
    expect(events.filter((e) => e === "shown:story")).toHaveLength(1);
  });

  it("fires the phases in order: writing, checking, revising", async () => {
    const events: string[] = [];
    installFetch(events, [{ content: LONG }], respond);
    await generateStoryTurn(story(), "I pick the lock", baseOptions, watching(events));
    await settle();

    expect(events.filter((e) => e.startsWith("phase:"))).toEqual([
      "phase:writing",
      "phase:checking",
      "phase:revising",
    ]);
    expect(firstIndex(events, "phase:checking")).toBeLessThan(firstIndex(events, "call:judge"));
    expect(firstIndex(events, "phase:revising")).toBeLessThan(firstIndex(events, "shown:story"));
  });

  it("releases an unflagged turn as written, with no checking phase when no judge could fire", async () => {
    const events: string[] = [];
    installFetch(events, [{ content: SHORT }], () => ALL_CLEAR);
    const result = await generateStoryTurn(
      story(),
      "I pick the lock",
      { ...baseOptions, observerSettings: AGENCY_OFF },
      watching(events),
    );
    await settle();

    expect(result.content).toBe(SHORT);
    expect(events).not.toContain("shown:gm");
    expect(events.filter((e) => e.startsWith("phase:"))).toEqual(["phase:writing"]);
    expect(events.filter((e) => e === "shown:story")).toHaveLength(1);
    expect(firstIndex(events, "shown:complete")).toBeLessThan(firstIndex(events, "complete"));
  });

  it("makes no rewrite in the background wave: an agency finding there is a flag (agency set to flag)", async () => {
    const events: string[] = [];
    const { calls } = installFetch(events, [{ content: SHORT }], (call) => {
      if (isRewrite(call)) return REWRITTEN;
      if (isAgencyJudge(call)) return AGENCY_VIOLATION;
      return ALL_CLEAR;
    });
    const flagged: string[] = [];
    const result = await generateStoryTurn(
      story(),
      "I pick the lock",
      { ...baseOptions, observerSettings: AGENCY_FLAG },
      watching(events, { onBackgroundObserverFlags: (flags) => flagged.push(flags[0].type) }),
    );
    await settle();

    expect(result.content).toBe(SHORT);
    expect(calls.filter(isRewrite)).toHaveLength(0);
    expect(flagged).toEqual(["player_agency"]);
    expect(events).not.toContain("rewrite-applied");
  });

  it("shows only the re-derived choices after a rewrite", async () => {
    const events: string[] = [];
    const { calls } = installFetch(events, [{ content: LONG }], respond);
    await generateStoryTurn(
      story(),
      "I pick the lock",
      { ...baseOptions, skipChoices: false },
      watching(events),
    );
    await settle();

    expect(calls.filter(isChoices)).toHaveLength(2);
    expect(events.filter((e) => e === "shown:choices")).toHaveLength(1);
    expect(firstIndex(events, "shown:choices")).toBeGreaterThan(firstIndex(events, "shown:story"));
  });

  it("shows nothing at all when the player stops during the hold", async () => {
    const events: string[] = [];
    const controller = new AbortController();
    installFetch(events, [{ content: LONG }], (call) => {
      if (isLengthJudge(call)) {
        controller.abort();
        throw Object.assign(new Error("aborted"), { name: "AbortError" });
      }
      return ALL_CLEAR;
    });

    await expect(
      generateStoryTurn(
        story(),
        "I pick the lock",
        { ...baseOptions, abortSignal: controller.signal },
        watching(events),
      ),
    ).rejects.toThrow(/cancelled/i);

    expect(events.filter((e) => e.startsWith("shown:"))).toEqual([]);
    expect(events).not.toContain("complete");
  });
});

describe("with every judge on flag only the text streams live, as before", () => {
  it("fires the live callbacks while writing and no phases", async () => {
    const events: string[] = [];
    installFetch(events, [{ content: SHORT }], () => ALL_CLEAR);
    await generateStoryTurn(
      story(),
      "I pick the lock",
      { ...baseOptions, observerSettings: FLAG_ONLY_OBSERVER_SETTINGS },
      watching(events),
    );
    await settle();

    expect(events).toContain("shown:gm");
    expect(events).toContain("shown:live");
    expect(events.filter((e) => e.startsWith("phase:"))).toEqual([]);
    expect(firstIndex(events, "shown:gm")).toBeLessThan(firstIndex(events, "shown:story"));
  });
});

describe("the blocking pass waits only on the judges that can rewrite (follow-up to 221)", () => {
  it("runs the rewriting judges before release and every other judge once, after it", async () => {
    const events: string[] = [];
    const { calls } = installFetch(events, [{ content: LONG }], (call) => {
      if (isRewrite(call)) return REWRITTEN;
      if (isLengthJudge(call)) return LENGTH_UNJUSTIFIED;
      return ALL_CLEAR;
    });
    await generateStoryTurn(story(), "I pick the lock", baseOptions, watching(events));
    await settle();

    const release = firstIndex(events, "shown:story");
    expect(release).toBeGreaterThan(-1);
    // Before the player sees anything: only the rewriting judges and the rewrite.
    const before = events.slice(0, release);
    expect(before).not.toContain("call:other");
    expect(calls.filter(isLengthJudge)).toHaveLength(1);
    expect(calls.filter(isAgencyJudge)).toHaveLength(1);
    // The flag-only judges (tool usage, tier) ran, once each, after release.
    const others = calls.filter(
      (c) => c.url === "/api/generate" && !isRewrite(c) && !isAnyJudge(c),
    );
    expect(others.length).toBeGreaterThan(0);
    const afterRelease = events.slice(release).filter((e) => e === "call:other");
    expect(afterRelease).toHaveLength(others.length);
    const bodies = others.map((c) => first(c));
    expect(new Set(bodies).size).toBe(bodies.length);
  });
});

describe("the agency judge can rewrite (decision 237)", () => {
  it("checks every turn with a player line before release, and releases its rewrite", async () => {
    const events: string[] = [];
    installFetch(events, [{ content: SHORT }], (call) => {
      if (isRewrite(call)) return REWRITTEN;
      if (isAgencyJudge(call)) return AGENCY_VIOLATION;
      return ALL_CLEAR;
    });
    const shown: string[] = [];
    const result = await generateStoryTurn(
      story(),
      "I pick the lock",
      baseOptions,
      watching(events, { onStoryContent: (_c, full) => { shown.push(full); events.push("shown:story"); } }),
    );
    await settle();

    expect(result.content).toBe(REWRITTEN);
    expect(shown).toEqual([REWRITTEN]);
    expect(events.filter((e) => e.startsWith("phase:"))).toEqual([
      "phase:writing",
      "phase:checking",
      "phase:revising",
    ]);
    expect(firstIndex(events, "call:judge")).toBeLessThan(firstIndex(events, "shown:story"));
  });
});

describe("prose before a pause is released before the pause shows (decision 240)", () => {
  const PRE = "You stand at the door and say you will wait.";
  const POST = "The door opens. A cold draught follows.";
  const PRE_FIXED = "You stand at the door.";
  const ASK = {
    name: "ask_question",
    arguments: { questions: [{ question: "Open it?", options: [{ label: "Yes" }, { label: "No" }] }] },
  };
  const answer = { answers: [{ selectedLabel: "Yes", skipped: false }] };

  function run(respond: (call: Call) => string, events: string[]) {
    installFetch(events, [{ content: PRE, toolCalls: [ASK] }, { content: POST }], respond);
    return generateStoryTurn(
      story(),
      "I wait",
      baseOptions,
      watching(events, {
        onAskQuestion: async () => {
          events.push("pause");
          return answer;
        },
      }),
    );
  }

  it("shows the prose first, unchanged when nothing is flagged, then holds the rest", async () => {
    const events: string[] = [];
    const result = await run(() => ALL_CLEAR, events);
    await settle();

    expect(result.content).toBe(PRE + "\n\n" + POST);
    // The prose reached the screen before the pause handler ran...
    expect(firstIndex(events, "shown:gm")).toBeGreaterThan(-1);
    expect(firstIndex(events, "shown:gm")).toBeLessThan(firstIndex(events, "pause"));
    expect(firstIndex(events, "shown:live")).toBeLessThan(firstIndex(events, "pause"));
    // ...and the final story, with the post-pause prose, was held until the end.
    expect(firstIndex(events, "shown:story")).toBeGreaterThan(firstIndex(events, "pause"));
    expect(events.filter((e) => e === "shown:story")).toHaveLength(1);
  });

  it("releases the rewrite when a judge flags the prose major, and holds what follows", async () => {
    const events: string[] = [];
    const gmText: string[] = [];
    const storyText: string[] = [];
    installFetch(
      events,
      [{ content: PRE, toolCalls: [ASK] }, { content: POST }],
      (call) => {
        if (isRewrite(call)) return PRE_FIXED;
        // Only the stretch before the pause is flagged; the tail is clean.
        if (isAgencyJudge(call) && JSON.stringify(call.body.messages).includes("say you will wait")) {
          return AGENCY_VIOLATION;
        }
        return ALL_CLEAR;
      },
    );
    const result = await generateStoryTurn(
      story(),
      "I wait",
      baseOptions,
      watching(events, {
        onGMContent: (_c, full) => {
          gmText.push(full);
          events.push("shown:gm");
        },
        onStoryContent: (_c, full) => {
          storyText.push(full);
          events.push("shown:story");
        },
        onAskQuestion: async () => {
          events.push("pause");
          return answer;
        },
      }),
    );
    await settle();

    // What the player read before the pause is the rewrite, never the draft.
    expect(gmText[0]).toBe(PRE_FIXED);
    expect(gmText.some((t) => t.includes("say you will wait"))).toBe(false);
    expect(firstIndex(events, "call:rewrite")).toBeLessThan(firstIndex(events, "shown:gm"));
    expect(firstIndex(events, "shown:gm")).toBeLessThan(firstIndex(events, "pause"));
    // The finished turn begins with it, and the post-pause prose follows.
    expect(result.content).toBe(PRE_FIXED + "\n\n" + POST);
    expect(storyText).toEqual([PRE_FIXED + "\n\n" + POST]);
    expect(firstIndex(events, "shown:story")).toBeGreaterThan(firstIndex(events, "pause"));
    // The page is told the turn was revised, after its part exists.
    expect(firstIndex(events, "rewrite-applied")).toBeGreaterThan(firstIndex(events, "shown:story"));
    expect(result.scenePart.observerRewriteOriginal?.content).toBe(PRE + "\n\n" + POST);
  });
});

describe("a failed choices call keeps a finished narration", () => {
  it("logs, uses no choices and still releases the text", async () => {
    choicesFail = true;
    const events: string[] = [];
    installFetch(events, [{ content: SHORT }], () => ALL_CLEAR);
    const result = await generateStoryTurn(
      story(),
      "I pick the lock",
      { ...baseOptions, skipChoices: false, observerSettings: AGENCY_OFF },
      watching(events),
    );
    await settle();

    expect(result.content).toBe(SHORT);
    expect(result.choices).toEqual([]);
    expect(events).toContain("shown:story");
    expect(events).toContain("complete");
  });
});

describe("an empty held turn appends nothing", () => {
  it("tells the page the narration is complete but never calls onStoryContent", async () => {
    storyStageContent = "";
    const events: string[] = [];
    installFetch(events, [{ content: "" }], () => ALL_CLEAR);
    const result = await generateStoryTurn(
      story(),
      "I pick the lock",
      baseOptions,
      watching(events),
    );
    await settle();

    expect(result.content.trim()).toBe("");
    expect(events).not.toContain("shown:story");
    expect(events).toContain("complete");
  });
});
