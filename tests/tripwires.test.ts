import { describe, expect, it, vi } from "vitest";
import {
  TRAVEL_CHECK,
  applyTripwireRoll,
  evaluateTripwire,
  tripwireLogLine,
  tripwireOdds,
  type TripwireInput,
} from "@/app/misc/tripwires";
import { textCrosses } from "@/app/misc/turnEndChecks";
import { buildGMStagePrompt } from "@/app/misc/ai_staged";
import { createAGMTState } from "@/app/misc/mythic";
import type { PendingRandomEvent, StoryData } from "@/app/misc/structs";
import { buildFixtureStory, DESIGN_FIXTURE, runRecordedTurn, warmTokenizer } from "./helpers/turnHarness";

const HIT = () => 0; // die 1
const MISS = () => 0.99; // die N

function story(parts = 3): StoryData & { agmtState: NonNullable<StoryData["agmtState"]> } {
  return {
    agmtState: { ...createAGMTState(), lastOracleTurn: parts },
    scene: { parts: Array.from({ length: parts }, () => ({ content: "x" })), summary: "" },
    pendingRandomEvents: [],
  } as unknown as StoryData & { agmtState: NonNullable<StoryData["agmtState"]> };
}

function input(over: Partial<TripwireInput> = {}): TripwireInput {
  return {
    story: story(),
    results: [],
    gmProse: "",
    playerLines: [],
    eventsBefore: [],
    resolvedThisTurn: false,
    sessionZero: false,
    ...over,
  };
}

const ok = (toolName: string) => ({ toolName, success: true });

function event(id: string): PendingRandomEvent {
  return { id, source: "scene_check", action: "a", subject: "b", createdAt: 1 };
}

describe("tripwireOdds", () => {
  it("is 8,7,6,5,4 across chaos 1 to 9", () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9].map(tripwireOdds)).toEqual([8, 8, 7, 7, 6, 5, 5, 4, 4]);
  });
});

describe("the crossings", () => {
  it("session, rest, travel and quiet_run each roll, with a hit and a miss", () => {
    const quiet = story(10);
    quiet.agmtState.lastOracleTurn = 2;
    const cases: Array<[string, TripwireInput]> = [
      ["session", input({ results: [ok("end_session")] })],
      ["rest", input({ results: [ok("take_rest")] })],
      ["travel", input({ gmProse: "By evening they reach the gates." })],
      ["quiet_run", input({ story: quiet })],
    ];
    for (const [name, inp] of cases) {
      const hit = evaluateTripwire(inp, HIT);
      expect(hit).toMatchObject({ rolled: true, tripwire: name, die: 1, hit: true, odds: 6 });
      const miss = evaluateTripwire(inp, MISS);
      expect(miss).toMatchObject({ rolled: true, tripwire: name, die: 6, hit: false });
    }
  });

  it("the first match wins: session over rest over travel", () => {
    const both = input({ results: [ok("take_rest"), ok("end_session")], gmProse: "By evening." });
    expect(evaluateTripwire(both, HIT)).toMatchObject({ tripwire: "session" });
    expect(evaluateTripwire(input({ results: [ok("take_rest")], gmProse: "By evening." }), HIT)).toMatchObject({
      tripwire: "rest",
    });
  });

  it("a failed take_rest is no crossing", () => {
    const r = evaluateTripwire(input({ results: [{ toolName: "take_rest", success: false }] }), HIT);
    expect(r).toMatchObject({ rolled: false });
  });

  it("a quiet run needs six turns since the later of the oracle and the last roll", () => {
    const s = story(10);
    s.agmtState.lastOracleTurn = 5;
    expect(evaluateTripwire(input({ story: s }), HIT).rolled).toBe(false);
    s.agmtState.lastOracleTurn = 4;
    expect(evaluateTripwire(input({ story: s }), HIT).rolled).toBe(true);
    s.agmtState.lastQuietRunRoll = 8;
    expect(evaluateTripwire(input({ story: s }), HIT).rolled).toBe(false);
  });

  it("a quiet-run roll restarts its counter, hit or miss", () => {
    const s = story(10);
    s.agmtState.lastOracleTurn = 1;
    const miss = evaluateTripwire(input({ story: s }), MISS);
    if (!miss.rolled) throw new Error("no roll");
    expect(applyTripwireRoll(s, miss)).toBeNull();
    expect(s.agmtState.lastQuietRunRoll).toBe(10);
    expect(s.pendingRandomEvents).toHaveLength(0);
  });

  it("a hit queues a tripwire event with a focus, a meaning and a portent", () => {
    const s = story();
    const hit = evaluateTripwire(input({ story: s, results: [ok("take_rest")] }), HIT);
    if (!hit.rolled) throw new Error("no roll");
    const e = applyTripwireRoll(s, hit);
    expect(e).toMatchObject({ source: "tripwire", tripwire: "rest" });
    expect(e?.focus && e.action && e.subject && e.portent).toBeTruthy();
    expect(s.pendingRandomEvents).toEqual([e]);
    expect(tripwireLogLine(hit)).toBe("Tripwire rest: d6=1 vs 1-in-6, event queued");
  });

  it("logs a miss in the plan's form", () => {
    const miss = evaluateTripwire(input({ results: [ok("take_rest")] }), () => 0.2);
    expect(tripwireLogLine(miss)).toBe("Tripwire rest: d6=2 vs 1-in-6, no event");
  });
});

describe("the skip rules", () => {
  const crossing = { results: [ok("take_rest")] };
  it("session zero, including the start-game turn, never rolls", () => {
    const r = evaluateTripwire(input({ ...crossing, sessionZero: true }), HIT);
    expect(r).toMatchObject({ rolled: false });
    expect(tripwireLogLine(r)).toBeNull();
  });
  it("a pending event skips, and logs the crossing", () => {
    const s = story();
    s.pendingRandomEvents = [event("e1")];
    const r = evaluateTripwire(input({ ...crossing, story: s, eventsBefore: ["e1"] }), HIT);
    expect(r).toMatchObject({ rolled: false, tripwire: "rest" });
    expect(tripwireLogLine(r)).toContain("skipped");
  });
  it("an event added this turn skips", () => {
    const s = story();
    s.pendingRandomEvents = [event("e2")];
    expect(evaluateTripwire(input({ ...crossing, story: s, eventsBefore: [] }), HIT)).toMatchObject({
      rolled: false,
      why: "an event was added this turn",
    });
  });
  it("an event resolved this turn skips", () => {
    expect(evaluateTripwire(input({ ...crossing, resolvedThisTurn: true }), HIT)).toMatchObject({ rolled: false });
  });
  it("an old save's five queued events are left alone", () => {
    const s = story();
    s.pendingRandomEvents = ["a", "b", "c", "d", "e"].map(event);
    const before = JSON.stringify(s.pendingRandomEvents);
    const r = evaluateTripwire(input({ ...crossing, story: s, eventsBefore: ["a", "b", "c", "d", "e"] }), HIT);
    expect(r.rolled).toBe(false);
    expect(JSON.stringify(s.pendingRandomEvents)).toBe(before);
  });
});

describe("the travel phrases", () => {
  const check = { id: "travel", trigger: TRAVEL_CHECK, satisfiedBy: { toolName: "", resultType: "" }, message: "" };
  const crosses = (gm: string, player = ""): boolean =>
    !!textCrosses(check, { gmProse: gm, playerLines: player ? [player] : [] });

  const crossings = [
    "We ride to Esk and make camp.",
    "By evening the road bends toward the coast.",
    "Three days later, the caravan arrives at the border.",
    "The next morning the fog has lifted.",
    "You arrive at the inn as the bell tolls.",
    "Hours later they reach the village gates.",
    "We walked to the harbour together.",
    "They sailed for Larkenfell at dawn.",
    "By nightfall you have reached the town.",
    "Several hours pass in silence.",
  ];
  const nonCrossings = [
    "Should we ride to Esk?",
    "If we ride to Esk we lose a day.",
    "Let's ride to Esk tomorrow.",
    "I plan to arrive at the inn by evening.",
    "We will travel to the coast next week.",
    "We did not ride to Esk after all.",
    "Remember when we rode to Esk?",
    "I remember how we walked to the harbour.",
    "We need to be there by evening.",
    "Can we reach the town by nightfall?",
  ];

  it("fires on ten completed crossings", () => {
    for (const line of crossings) expect(crosses(line), line).toBe(true);
  });
  it("stays quiet on ten plans, questions, negations and memories", () => {
    for (const line of nonCrossings) expect(crosses(line), line).toBe(false);
  });
  it("reads a player line too", () => {
    expect(crosses("", "> We ride to Esk.")).toBe(true);
  });
});

describe("in the live block", () => {
  it("renders a tripwire event under the unresolved events", async () => {
    await warmTokenizer();
    const s = buildFixtureStory(DESIGN_FIXTURE);
    s.sessionZeroActive = false;
    s.pendingRandomEvents = [
      { id: "event_t", source: "tripwire", tripwire: "travel", focus: "NPC action", action: "Betray", subject: "A rival", createdAt: 1 },
    ];
    const text = JSON.stringify(buildGMStagePrompt({ storyData: s, userChoice: "I go" }).messages);
    expect(text).toContain("Unresolved Random Events");
    expect(text).toContain("event_t");
    expect(text).toContain("Betray A rival");
  }, 120_000);
});

describe("in a played turn", () => {
  async function played(sessionZero: boolean): Promise<StoryData> {
    await warmTokenizer();
    const s = buildFixtureStory(DESIGN_FIXTURE);
    s.sessionZeroActive = sessionZero;
    s.agmtState = { ...createAGMTState(), lastOracleTurn: s.scene.parts.length } as unknown as StoryData["agmtState"];
    s.pendingRandomEvents = [];
    const spy = vi.spyOn(Math, "random").mockReturnValue(0);
    try {
      await runRecordedTurn(s, {
        rounds: Array.from({ length: sessionZero ? 3 : 1 }, () => ({
          content: "<thinking>Fine.</thinking>\nBy evening the road bends toward the coast.",
        })),
      });
    } finally {
      spy.mockRestore();
    }
    return s;
  }

  it("a travel line on a quiet turn queues a tripwire event when the die hits", async () => {
    const s = await played(false);
    expect(s.pendingRandomEvents?.map((e) => e.source)).toEqual(["tripwire"]);
  }, 120_000);

  it("session zero queues none", async () => {
    const s = await played(true);
    expect(s.pendingRandomEvents ?? []).toHaveLength(0);
  }, 120_000);
});
