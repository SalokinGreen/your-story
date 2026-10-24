/**
 * The generic turn-end check evaluator (app/misc/turnEndChecks.ts, decision
 * 183, docs/dawn-gate-design.md) against Blood & Bone's "night ended"
 * declaration, and against a second, synthetic system to show that nothing in
 * the evaluator is specific to the night.
 */
import { describe, it, expect } from "vitest";
import {
  checkSatisfied,
  pendingCheck,
  satisfiedOnLastTurn,
  splitPlayerLines,
  textCrosses,
} from "@/app/misc/turnEndChecks";
import { NIGHT_ENDED_CHECK } from "@/app/misc/systems/blood-and-bone/turnEndChecks";
import { BLOOD_AND_BONE } from "@/app/misc/systems/blood-and-bone";
import type { SystemTurnEndCheck } from "@/app/misc/systems/types";

const prose = (gmProse: string) => ({ gmProse, playerLines: [] as string[] });
const player = (...playerLines: string[]) => ({ gmProse: "", playerLines });
const crosses = (t: { gmProse: string; playerLines: string[] }) =>
  textCrosses(NIGHT_ENDED_CHECK, t) !== null;

describe("night-ended check: phrases that fire", () => {
  it("fires on the playtest's Grave Watcher line", () => {
    expect(
      crosses(
        player("at dawn I climb down and go to bed. Next morning, I go find Cora"),
      ),
    ).toBe(true);
  });

  it.each([
    "Dawn breaks over the cemetery.",
    "The dawn came grey and thin.",
    "By first light the fog had lifted.",
    "Sunrise paints the rooftops.",
    "The sun rose behind the chapel.",
    "Daybreak finds you still on watch.",
    "The next morning, the square is empty.",
    "By the next day the rumours had spread.",
    "The following morning you wake stiff.",
    "The night passed without incident.",
    "You wait until dawn.",
  ])("fires on GM prose: %s", (line) => {
    expect(crosses(prose(line))).toBe(true);
  });

  it.each([
    "I sleep until the bells ring",
    "we went to bed and slept through the day",
    "I wake up the next day",
    "you wake in the morning",
  ])("fires on a player line: %s", (line) => {
    expect(crosses(player(line))).toBe(true);
  });

  it("counts 'in the morning' and 'come morning' in a player's line only", () => {
    expect(crosses(player("we leave in the morning"))).toBe(true);
    expect(crosses(player("come morning I visit the priest"))).toBe(true);
    expect(crosses(prose("The shop opens in the morning, they say."))).toBe(false);
    expect(crosses(prose("Come morning, he will be gone."))).toBe(false);
  });
});

describe("night-ended check: phrases that do not fire", () => {
  it.each([
    "We need to be inside before dawn.",
    "It is hours before dawn.",
    "It is not yet dawn.",
    "Dawn is still hours away.",
    "Meet me tomorrow at dawn.",
    "Meet me at dawn tomorrow.",
    "I remember the next morning, the smell of ash.",
  ])("ignores %s", (line) => {
    expect(crosses(prose(line))).toBe(false);
    expect(crosses(player(line))).toBe(false);
  });

  it("ignores a question about dawn", () => {
    expect(crosses(player("Do we leave at dawn?"))).toBe(false);
    expect(crosses(player("what if we wait until the next morning?"))).toBe(false);
  });

  it("keeps a question's exclusion to its own sentence", () => {
    expect(crosses(player("Is it safe? At dawn we go."))).toBe(true);
  });

  it("lets the rest of a sentence still count after a local exception", () => {
    expect(crosses(prose("Before dawn we hide; at sunrise we leave."))).toBe(true);
  });

  it("reads nothing from empty text", () => {
    expect(crosses({ gmProse: "", playerLines: [] })).toBe(false);
    expect(crosses({ gmProse: "   ", playerLines: ["  "] })).toBe(false);
  });
});

describe("what a match reports", () => {
  it("names the player line and the phrase", () => {
    const m = textCrosses(
      NIGHT_ENDED_CHECK,
      player("> Mira: we wait here", "> Nik: at dawn I go home"),
    );
    expect(m).toEqual({ source: "player", phrase: "at dawn", lineIndex: 1 });
  });

  it("names the prose when only the prose crosses", () => {
    const m = textCrosses(NIGHT_ENDED_CHECK, {
      gmProse: "The sun rose.",
      playerLines: ["I look around"],
    });
    expect(m?.source).toBe("prose");
    expect(m?.phrase).toBe("The sun rose");
  });
});

describe("each party line is tested on its own", () => {
  it("one player's 'not yet' cannot hide another's crossing", () => {
    const lines = splitPlayerLines(
      "> Mira: it is not yet dawn, keep watch\n> Nik: at dawn I leave",
    );
    expect(lines).toHaveLength(2);
    const m = textCrosses(NIGHT_ENDED_CHECK, { gmProse: "", playerLines: lines });
    expect(m?.lineIndex).toBe(1);
  });

  it("an exception in one line does not reach the next line", () => {
    const lines = ["> Mira: before dawn we hide", "> Nik: sunrise is when I go"];
    expect(textCrosses(NIGHT_ENDED_CHECK, { gmProse: "", playerLines: lines })?.lineIndex).toBe(1);
  });
});

describe("splitPlayerLines", () => {
  it("keeps one custom line whole, newlines and all", () => {
    expect(splitPlayerLines("I go to bed\nand sleep until dawn")).toEqual([
      "I go to bed\nand sleep until dawn",
    ]);
  });

  it("splits at each '>' attribution", () => {
    expect(splitPlayerLines("> A: one\n> B: two\nmore of two")).toEqual([
      "> A: one",
      "> B: two\nmore of two",
    ]);
  });

  it("is empty with no line", () => {
    expect(splitPlayerLines(undefined)).toEqual([]);
    expect(splitPlayerLines("  ")).toEqual([]);
  });
});

describe("checkSatisfied and pendingCheck", () => {
  const endSessionOk = {
    toolName: "end_session",
    success: true,
    result: { type: "end_session", sessionCount: 2, reset: [] },
  };
  const turn = (over: Partial<Parameters<typeof pendingCheck>[1]> = {}) => ({
    text: prose("Dawn breaks."),
    results: [],
    prompted: new Set<string>(),
    ...over,
  });

  it("is satisfied by an executed end_session result", () => {
    expect(checkSatisfied(NIGHT_ENDED_CHECK, [endSessionOk])).toBe(true);
    expect(pendingCheck(BLOOD_AND_BONE, turn({ results: [endSessionOk] }))).toBeNull();
  });

  it("is not satisfied by a failed call or by the wrong result type", () => {
    const failed = { ...endSessionOk, success: false };
    const wrongType = { ...endSessionOk, result: { type: "system_error" } };
    expect(checkSatisfied(NIGHT_ENDED_CHECK, [failed])).toBe(false);
    expect(checkSatisfied(NIGHT_ENDED_CHECK, [wrongType])).toBe(false);
    expect(pendingCheck(BLOOD_AND_BONE, turn({ results: [failed] }))?.check.id).toBe(
      "night-ended",
    );
  });

  it("returns a check once: not again after it was prompted", () => {
    expect(pendingCheck(BLOOD_AND_BONE, turn())?.check.id).toBe("night-ended");
    expect(
      pendingCheck(BLOOD_AND_BONE, turn({ prompted: new Set(["night-ended"]) })),
    ).toBeNull();
  });

  it("does nothing for no system or a system with no checks", () => {
    expect(pendingCheck(undefined, turn())).toBeNull();
    expect(pendingCheck({}, turn())).toBeNull();
  });
});

describe("a second system runs through the same evaluator", () => {
  const expeditionReturned: SystemTurnEndCheck = {
    id: "expedition-returned",
    trigger: {
      phrases: [/\bthe expedition (?:has )?returned\b/i],
      exceptions: [/\bwhen the expedition returned\b/i],
    },
    satisfiedBy: { toolName: "end_expedition", resultType: "expedition_ended" },
    message: "The expedition may be home. If so, call end_expedition.",
  };
  const system = { turnEndChecks: [expeditionReturned] };

  it("fires on its own phrase and not on the night's", () => {
    const hit = pendingCheck(system, {
      text: prose("The expedition returned at last."),
      results: [],
      prompted: new Set(),
    });
    expect(hit?.check.id).toBe("expedition-returned");
    expect(
      pendingCheck(system, {
        text: prose("Dawn breaks over the camp."),
        results: [],
        prompted: new Set(),
      }),
    ).toBeNull();
  });

  it("honours its own exception and its own satisfying tool", () => {
    expect(
      pendingCheck(system, {
        text: prose("Remember when the expedition returned? Never mind."),
        results: [],
        prompted: new Set(),
      }),
    ).toBeNull();
    expect(
      pendingCheck(system, {
        text: prose("The expedition returned."),
        results: [
          {
            toolName: "end_expedition",
            success: true,
            result: { type: "expedition_ended" },
          },
        ],
        prompted: new Set(),
      }),
    ).toBeNull();
  });
});

// Engine review of decision 184.
describe("night-ended check: the review's lines", () => {
  it.each([
    "You have until sunrise to find her.",
    "Get back to the haven before sunrise.",
    "Sunrise is hours away.",
    "Hours before first light, the bells start.",
    "Before the sun rises, you must feed.",
    "Not until daybreak will the gate open.",
    "The ship sails at dawn.",
    "The Concord meets at dawn.",
    "He died the next day, they say.",
  ])("does not fire on a dawn still to come: %s", (line) => {
    expect(crosses(prose(line))).toBe(false);
  });

  it.each([
    "Dawn breaks over Whitechapel, grey and cold, what do you do?",
    "As first light creeps over the rooftops, do you run for the crypt?",
    "I sleep until sunrise.",
  ])("fires on a crossing that ends in the GM's hand-off: %s", (line) => {
    expect(crosses(line.startsWith("I ") ? player(line) : prose(line))).toBe(true);
  });

  it("stays fast on a long run with no sentence break", () => {
    const long = "and the fog, ".repeat(800) + "at sunrise?";
    const t0 = performance.now();
    textCrosses(NIGHT_ENDED_CHECK, prose(long));
    expect(performance.now() - t0).toBeLessThan(300);
  });
});

describe("satisfiedOnLastTurn", () => {
  const gm = (content: string) => ({ user: false, gmConversation: [{ role: "tool", content }] });
  it("sees an executed end_session on the GM's previous turn", () => {
    expect(satisfiedOnLastTurn(NIGHT_ENDED_CHECK, [gm("[end_session] [Session 1 ended]"), { user: true }])).toBe(true);
  });
  it("ignores a failed one, and one from an earlier turn", () => {
    expect(satisfiedOnLastTurn(NIGHT_ENDED_CHECK, [gm("**ERROR** in end_session: reason missing")])).toBe(false);
    expect(satisfiedOnLastTurn(NIGHT_ENDED_CHECK, [gm("[end_session] [Session 1 ended]"), { user: true }, gm("[formula_roll] 3")])).toBe(false);
  });
});
