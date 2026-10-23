import { describe, expect, it } from "vitest";
import {
  formatTurnWork,
  rollHeadline,
  summarizeTurnWork,
} from "@/app/story/turnWork";
import type { TimelineBlock } from "@/app/misc/turnTimeline";

// Each fixture is the text the executor writes into contextForStory, copied
// from app/misc/gmExecutor.ts (the function named beside it), so a change to
// an executor's wording breaks these rather than leaving a stale headline.

// executeActionRoll: owner, move, stat
const ACTION = `[Action roll - Ana: Face Danger +Iron: d6 4 + Iron 2 = 6 vs 3 and 8 → WEAK HIT]\n[Reason: leaping the gap]\n[Stakes: high]`;
// executeActionRoll: no owner, no move, adds, capped, a match
const ACTION_BARE = `[Action roll - +Heart: d6 6 + Heart 3 + adds 2 = 10 (capped at 10) vs 4 and 4 → STRONG HIT]\n[MATCH: both challenge dice show 4. Something unexpected enters the scene: a complication on a hit, a turn for the worse on a miss.]\n[Reason: calming the crowd]`;
const ACTION_MISS = `[Action roll - Ana: Secure an Advantage +Wits: d6 1 + Wits 1 = 2 vs 7 and 9 → MISS]\n[Reason: reading the room]`;
// executeFormulaRoll, one pool (describePool)
const FORMULA_ONE = `[Roll: 1d20+3: [14] = **17**]\n[Reason: sneaking past the guard]\n[No verdict was computed. Compare against the target with \`calculate\` before narrating an outcome.]`;
const FORMULA_NAMED = `[Sneak: Stealth 1d20+3: [14] = **17**]\n[Reason: sneaking past the guard]`;
// executeFormulaRoll, several pools
const FORMULA_MANY = `[Starforged roll - 2 separate pools, NOT added together:]\n[  1d6+2: [3] = **5**]\n[  2d10: [3, 8] = **11**]\n[Reason: gather information]\n[No verdict was computed. Compare against the target with \`calculate\` before narrating an outcome.]`;
// executeOpposedFormula
const OPPOSED = `[Arm wrestle: who bends first]\n[Player: 1d20+3 = 14]\n[Guard: 1d20+2 = 11]\n[No winner was computed. Compare the two totals with \`calculate\` (e.g. "14 > 11") per this adventure's rules before narrating who came out ahead.]`;
const OPPOSED_BREAKDOWN = `[Opposed Roll: a duel]\n[Player: 2d6+1 → 4+3+1 = 8]\n[Captain Voss: 1d20 = 12]\n[No winner was computed.]`;
// executeNPCRoll
const NPC = `[NPC Roll: Guard rolled 1d20+4 vs AC 14 = 17 - swings the halberd]\n[No hit/miss verdict was computed. Compare it with \`calculate\` (e.g. "17 >= 15") before narrating the outcome.]`;
// executeFateQuestion
const FATE = `[Fate Question: "Is the door locked?"]\n[Likelihood: 50/50 | Chaos Factor: 5]\n[Roll: 37 → Normal Yes]`;
const FATE_STRONG = `[Fate Question: "Is anyone home?"]\n[Likelihood: Unlikely | Chaos Factor: 5]\n[Roll: 3 → Exceptional No]`;

function tool(
  id: string,
  toolName: string,
  contextForStory: string,
  extra: Partial<TimelineBlock> = {},
): TimelineBlock {
  return { id, kind: "tool", toolName, success: true, contextForStory, ...extra };
}

describe("rollHeadline", () => {
  it("action_roll: the move, the stat, the score and the dice", () => {
    expect(rollHeadline("action_roll", ACTION)).toBe(
      "Face Danger +Iron 6 vs 3, 8 — weak hit",
    );
    expect(rollHeadline("action_roll", ACTION_BARE)).toBe(
      "+Heart 10 vs 4, 4 — strong hit",
    );
    expect(rollHeadline("action_roll", ACTION_MISS)).toBe(
      "Secure an Advantage +Wits 2 vs 7, 9 — miss",
    );
  });

  it("formula_roll with one pool: the formula and its total", () => {
    expect(rollHeadline("formula_roll", FORMULA_ONE)).toBe("1d20+3 = 17");
    expect(rollHeadline("formula_roll", FORMULA_NAMED)).toBe(
      "Sneak: Stealth 1d20+3 = 17",
    );
  });

  it("formula_roll with several pools keeps each pool separate", () => {
    expect(rollHeadline("formula_roll", FORMULA_MANY)).toBe(
      "1d6+2 = 5 · 2d10: 3, 8",
    );
  });

  it("opposed_formula: you against the opponent", () => {
    expect(rollHeadline("opposed_formula", OPPOSED)).toBe("You 14 vs Guard 11");
    expect(rollHeadline("opposed_formula", OPPOSED_BREAKDOWN)).toBe(
      "You 8 vs Captain Voss 12",
    );
  });

  it("npc_roll: the first line without its brackets", () => {
    expect(rollHeadline("npc_roll", NPC)).toBe(
      "NPC Roll: Guard rolled 1d20+4 vs AC 14 = 17 - swings the halberd",
    );
  });

  it("fate_question: the oracle's answer", () => {
    expect(rollHeadline("fate_question", FATE)).toBe("Oracle: Yes");
    expect(rollHeadline("fate_question", FATE_STRONG)).toBe(
      "Oracle: Exceptional No",
    );
  });

  it("an unrecognised shape falls back to the first bracketed line, cut to 80", () => {
    expect(rollHeadline("formula_roll", "[Weird: no pool here]")).toBe(
      "Weird: no pool here",
    );
    const cutOut = rollHeadline("npc_roll", `[${"x".repeat(120)}]\n[Reason: y]`);
    expect(cutOut).not.toBeNull();
    expect(cutOut!.length).toBeLessThanOrEqual(80);
    expect(rollHeadline("action_roll", "[Action roll - something new]")).toBe(
      "Action roll - something new",
    );
  });

  it("is null for a tool that is not a roll, and for a roll that errored", () => {
    expect(rollHeadline("read_notes", "[Note: Lore]")).toBeNull();
    expect(rollHeadline("gm_roll", "[Hidden Roll: 1d20 = 4]")).toBeNull();
    expect(
      rollHeadline("formula_roll", '[ERROR: Invalid formula in "1d" - bad]'),
    ).toBeNull();
  });
});

describe("summarizeTurnWork", () => {
  it("is empty for no blocks and for text only", () => {
    expect(summarizeTurnWork([]).isEmpty).toBe(true);
    const text: TimelineBlock = { id: "a", kind: "text", content: "Hello" };
    expect(summarizeTurnWork([text]).isEmpty).toBe(true);
  });

  it("a hidden gm_roll contributes nothing: no roll and no count", () => {
    const hidden = tool("h", "gm_roll", "", { hidden: true });
    const s = summarizeTurnWork([hidden]);
    expect(s.rolls).toEqual([]);
    expect(s.counts).toEqual([]);
    expect(s.isEmpty).toBe(true);
    expect(formatTurnWork(s)).toBe("");
  });

  it("collects rolls in order and groups the other tools by label", () => {
    const blocks: TimelineBlock[] = [
      { id: "th", kind: "thinking", content: "hm", isReasoning: true },
      tool("n1", "read_notes", "[Note A]"),
      tool("r1", "action_roll", ACTION),
      tool("n2", "read_notes", "[Note B]"),
      tool("r2", "fate_question", FATE),
      { id: "th2", kind: "thinking", content: "again" },
    ];
    const s = summarizeTurnWork(blocks);
    expect(s.rolls).toEqual([
      "Face Danger +Iron 6 vs 3, 8 — weak hit",
      "Oracle: Yes",
    ]);
    expect(s.counts).toEqual([
      { label: "thought", n: 2 },
      { label: "Reading notes", n: 2 },
    ]);
    expect(s.live).toBeUndefined();
    expect(s.isEmpty).toBe(false);
  });

  it("shows at most two headlines and then +N more", () => {
    const blocks = [
      tool("1", "formula_roll", FORMULA_ONE),
      tool("2", "fate_question", FATE),
      tool("3", "npc_roll", NPC),
      tool("4", "opposed_formula", OPPOSED),
    ];
    expect(formatTurnWork(summarizeTurnWork(blocks))).toBe(
      "1d20+3 = 17 · Oracle: Yes · +2 more",
    );
  });

  it("sets live only while a block streams", () => {
    const streaming: TimelineBlock = {
      id: "s",
      kind: "thinking",
      content: "so far",
      streaming: true,
    };
    const s = summarizeTurnWork([streaming]);
    expect(s.live).toBe("Thinking…");
    expect(s.isEmpty).toBe(false);
    expect(
      summarizeTurnWork([{ ...streaming, streaming: false }]).live,
    ).toBeUndefined();
  });
});
