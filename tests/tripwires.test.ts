import { describe, expect, it, vi } from "vitest";
import {
  applyTripwireRoll,
  evaluateTripwire,
  playerTurnsSince,
  travelCrossing,
  tripwireLogLine,
  tripwireOdds,
  type TripwireInput,
} from "@/app/misc/tripwires";
import { buildGMStagePrompt } from "@/app/misc/ai_staged";
import { createAGMTState } from "@/app/misc/mythic";
import type { PendingRandomEvent, StoryData } from "@/app/misc/structs";
import { buildFixtureStory, DESIGN_FIXTURE, runRecordedTurn, warmTokenizer } from "./helpers/turnHarness";

const HIT = () => 0; // die 1
const MISS = () => 0.99; // die N

type S = StoryData & { agmtState: NonNullable<StoryData["agmtState"]> };

/** `turns` player turns (a user part and a reply each); the oracle was last used at the end. */
function story(turns = 3): S {
  const parts = Array.from({ length: turns * 2 }, (_, i) => ({ content: "x", user: i % 2 === 0 }));
  return {
    agmtState: { ...createAGMTState(), lastOracleTurn: parts.length },
    scene: { parts, summary: "" },
    pendingRandomEvents: [],
  } as unknown as S;
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

/** A story whose oracle was last used `ago` player turns back. */
function quietStory(ago: number): S {
  const s = story(ago + 2);
  s.agmtState.lastOracleTurn = 4; // after two player turns
  return s;
}

describe("tripwireOdds", () => {
  it("is 8,7,6,5,4 across chaos 1 to 9", () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9].map(tripwireOdds)).toEqual([8, 8, 7, 7, 6, 5, 5, 4, 4]);
  });
});

describe("the crossings", () => {
  it("session, rest, travel and quiet_run each roll, with a hit and a miss", () => {
    const cases: Array<[string, TripwireInput]> = [
      ["session", input({ results: [ok("end_session")] })],
      ["rest", input({ results: [ok("take_rest")] })],
      ["travel", input({ gmProse: "By evening they reach the gates." })],
      ["quiet_run", input({ story: quietStory(6) })],
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

describe("the quiet run counts player turns", () => {
  it("needs six player turns since the later of the oracle and the last roll", () => {
    // 5 player turns since the oracle (4 parts) in a story of 7 turns: no roll.
    expect(evaluateTripwire(input({ story: quietStory(5) }), HIT).rolled).toBe(false);
    expect(evaluateTripwire(input({ story: quietStory(6) }), HIT).rolled).toBe(true);
    const s = quietStory(6);
    s.agmtState.lastQuietRunRoll = s.scene.parts.length - 4; // two player turns ago
    expect(evaluateTripwire(input({ story: s }), HIT).rolled).toBe(false);
  });

  it("counts user parts, not scene parts", () => {
    const s = story(10);
    expect(playerTurnsSince(s, 0)).toBe(10);
    expect(playerTurnsSince(s, 12)).toBe(4);
  });

  it("a quiet-run roll restarts its counter, hit or miss", () => {
    const s = quietStory(6);
    const miss = evaluateTripwire(input({ story: s }), MISS);
    if (!miss.rolled) throw new Error("no roll");
    expect(applyTripwireRoll(s, miss)).toBeNull();
    expect(s.agmtState.lastQuietRunRoll).toBe(s.scene.parts.length);
    expect(s.pendingRandomEvents).toHaveLength(0);
  });

  it("with no oracle use and no earlier roll, the first look only stamps the base", () => {
    const s = story(12);
    delete s.agmtState.lastOracleTurn;
    const r = evaluateTripwire(input({ story: s }), HIT);
    expect(r.rolled).toBe(false);
    expect(s.agmtState.lastQuietRunRoll).toBe(s.scene.parts.length);
    // The base now stands, so six more player turns would roll.
    expect(evaluateTripwire(input({ story: s }), HIT).rolled).toBe(false);
  });

  it("session zero, the start-game turn included, stamps the base without rolling", () => {
    const s = story(2);
    delete s.agmtState.lastOracleTurn;
    const r = evaluateTripwire(input({ story: s, sessionZero: true, results: [ok("take_rest")] }), HIT);
    expect(r).toMatchObject({ rolled: false });
    expect(s.agmtState.lastQuietRunRoll).toBe(s.scene.parts.length);
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

describe("at most one roll of any kind per three player turns", () => {
  it("skips, with a logged reason, until three player turns have passed", () => {
    const s = story(10);
    const first = evaluateTripwire(input({ story: s, results: [ok("take_rest")] }), MISS);
    if (!first.rolled) throw new Error("no roll");
    applyTripwireRoll(s, first);
    expect(s.agmtState.lastTripwireRoll).toBe(s.scene.parts.length);
    const again = evaluateTripwire(input({ story: s, results: [ok("end_session")] }), HIT);
    expect(again).toMatchObject({ rolled: false, tripwire: "session" });
    expect(tripwireLogLine(again)).toContain("skipped (a tripwire rolled within the last 3 player turns)");
    // Two more player turns: still skipped. A third: rolls.
    const addTurn = () => s.scene.parts.push({ content: "u", user: true } as never, { content: "a", user: false } as never);
    addTurn();
    addTurn();
    expect(evaluateTripwire(input({ story: s, results: [ok("take_rest")] }), HIT).rolled).toBe(false);
    addTurn();
    expect(evaluateTripwire(input({ story: s, results: [ok("take_rest")] }), HIT).rolled).toBe(true);
  });
});

describe("the travel check errs toward not firing", () => {
  // [text, fires]. The reviewer's lines first, then ordinary prose.
  const gm: Array<[string, boolean]> = [
    ["You walk to the bar and lean on it.", false],
    ["You drive the stake into its heart.", false],
    ["They head into the back room.", false],
    ["You set off the alarm, and guards pour into the hall.", false],
    ["\"Be gone by nightfall,\" she says.", false],
    ["Be gone by nightfall, she says.", false],
    ["Hours later, in her telling, the road was empty.", false],
    ["We take the train to Paris.", true],
    ["I leave for Budapest.", true],
    ["We fly to Lisbon.", true],
    ["We spend the week on the road.", true],
    ["The caravan travels to Esk and makes camp.", true],
    ["You ride to the coast in silence.", true],
    ["By nightfall the road bends toward the coast.", true],
    ["The next morning the fog has lifted.", true],
    ["Three days later, the caravan arrives.", true],
    ["Hours later the gates come into view.", true],
    ["You step into the corridor and listen.", false],
    ["He leans toward you and lowers his voice.", false],
    ["The ogre swings; you duck and drive your shoulder into its ribs.", false],
    ["She sails a coin across the table.", false],
    ["You ride the wave of noise into the kitchen.", false],
    ["The innkeeper walks to the stove and stirs the pot.", false],
    ["A rider flies past you toward the gate, and the crowd parts.", false],
    ["You fight your way across the courtyard.", false],
    ["\"We ride to Esk at dawn,\" he mutters. The fire pops.", false],
    ["Should we ride to Esk?", false],
    ["If we travel to Esk we lose a day.", false],
    ["Let's leave for Esk tomorrow.", false],
    ["We will fly to Lisbon next week.", false],
    ["We did not travel to Esk after all.", false],
    ["Remember when we sailed to Esk?", false],
    ["She recalls how they fled to Esk.", false],
    ["The stranger tells you that hours later the road was empty.", false],
    ["By the way, the soup is cold.", false],
    ["You sit by the stove and wait for the morning.", false],
    ["Mid-conversation, a day later is not a thing anyone says.", false],
  ];

  it("has at least thirty lines", () => {
    expect(gm.length).toBeGreaterThanOrEqual(30);
  });
  for (const [line, fires] of gm) {
    it(`${fires ? "fires on" : "ignores"} ${JSON.stringify(line)}`, () => {
      expect(!!travelCrossing(line, [])).toBe(fires);
    });
  }

  it("ignores everything inside quotation marks, straight or curly", () => {
    expect(travelCrossing("“We take the train to Paris,” she says. You nod.", [])).toBeNull();
    expect(travelCrossing('The sign reads "Arrive in Paris" and nothing else. "By nightfall we sail to Esk"', [])).toBeNull();
  });

  it("reads a player's own line, time skips included", () => {
    expect(travelCrossing("", ["> We ride to Esk."])).not.toBeNull();
    expect(travelCrossing("", ["> The next morning we set out for Esk."])).not.toBeNull();
    expect(travelCrossing("", ["> What if we ride to Esk?"])).toBeNull();
  });

  it("a time skip must open the GM's sentence", () => {
    expect(travelCrossing("The soup is cold by nightfall.", [])).toBeNull();
    expect(travelCrossing("The door is shut. By nightfall the snow has buried it.", [])).not.toBeNull();
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
