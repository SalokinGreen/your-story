/**
 * Rung 1 of the judge layer (app/misc/judges/, docs/judge-layer-v2-plan.md
 * slice 1): the facts, each check as a minimal hit-and-miss pair, and the
 * Fantastic Realms foe-damage contract. Pure: no model, no network.
 */
import { describe, it, expect } from "vitest";
import { collectTurnFacts, snapshotJudgeView } from "@/app/misc/judges/facts";
import {
  buildReask,
  pacingNoteFor,
  runRung1,
  PACING_CLOCK_IDLE_TURNS,
  PACING_SPOTLIGHT_TURNS,
  type PriorPartView,
  type Rung1Turn,
} from "@/app/misc/judges/rung1";
import type { JudgeStoryView, JudgeToolResult } from "@/app/misc/judges/types";
import { FANTASTIC_REALMS } from "@/app/misc/systems/fantastic-realms";
import { emptyCampaign } from "@/app/misc/campaign/types";
import type { Meter, NPC } from "@/app/misc/structs";

const FR = { eventContracts: FANTASTIC_REALMS.eventContracts };

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

function view(over: Partial<JudgeStoryView> = {}): JudgeStoryView {
  return { npcs: [], meters: [], campaign: undefined, ...over };
}

function featRoll(
  id: string,
  outcome: "miss" | "weak_hit" | "hit" | "strong_hit",
  target: string | undefined,
  magnitude = 0,
): JudgeToolResult {
  return {
    toolName: "feat_roll",
    toolCallId: id,
    success: outcome !== "miss",
    contextForStory: `[Feat roll - Ayla DC 3 → ${outcome}]`,
    result: {
      type: "feat_roll",
      hero: "Ayla",
      feats: ["Sword"],
      dc: 3,
      dice: [4, 5],
      successes: 2,
      outcome,
      magnitude,
      ...(target ? { target } : {}),
    },
  };
}

function meterAdjust(
  id: string,
  owner: string,
  requested: number,
  before: number,
  overrides: { success?: boolean; meter?: string; action?: string } = {},
): JudgeToolResult {
  const after = Math.max(0, before + requested);
  return {
    toolName: "manage_meter",
    toolCallId: id,
    success: overrides.success ?? true,
    contextForStory: `[Meter ${owner} Hearts ${before} → ${after}]`,
    result: {
      type: "manage_meter",
      action: overrides.action ?? "adjust",
      owner,
      meter: overrides.meter ?? "Hearts",
      change: {
        before,
        after,
        requested,
        clampedBy: before + requested < 0 ? -(before + requested) : 0,
        crossedUp: [],
        crossedDown: [],
        atCap: false,
        atFloor: after === 0,
      },
    },
  };
}

function turn(over: Partial<Rung1Turn>): Rung1Turn {
  const storyAfter = over.storyAfter ?? view();
  return {
    storyBefore: over.storyBefore ?? storyAfter,
    storyAfter,
    results: [],
    prose: "",
    ...over,
  };
}

describe("event contract: foe-damage (Fantastic Realms)", () => {
  const withGoblin = view({ meters: [hearts("Goblin", 3)] });

  it("hits when a landed roll on a foe records no damage", () => {
    const hits = runRung1(
      turn({
        storyAfter: withGoblin,
        system: FR,
        results: [featRoll("c1", "hit", "Goblin")],
      }),
    );
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({
      check: "event_contract",
      contractId: "foe-damage",
      verified: true,
    });
    // It names the exact call that fixes it.
    expect(hits[0].reask).toContain('"owner":"Goblin"');
    expect(hits[0].reask).toContain('"by":-1');
    expect(hits[0].reask).toContain("Do not roll again");
    expect(hits[0].factIds.length).toBeGreaterThan(0);
  });

  it("misses (passes) when the Hearts change equals the damage", () => {
    const hits = runRung1(
      turn({
        storyAfter: withGoblin,
        system: FR,
        results: [featRoll("c1", "hit", "Goblin"), meterAdjust("c2", "Goblin", -1, 3)],
      }),
    );
    expect(hits).toEqual([]);
  });

  it("hits when the recorded amount differs, and asks for the difference", () => {
    const hits = runRung1(
      turn({
        storyAfter: withGoblin,
        system: FR,
        results: [
          featRoll("c1", "strong_hit", "Goblin", 1), // 2 + 1 = 3 hearts
          meterAdjust("c2", "Goblin", -1, 3),
        ],
      }),
    );
    expect(hits).toHaveLength(1);
    expect(hits[0].reask).toContain('"by":-2');
  });

  it("is not tripped by a burn: the result already counts it", () => {
    // A burned feat made this a weak hit; the contract reads the result's tier.
    const burned = featRoll("c1", "weak_hit", "Goblin");
    (burned.result as { burned?: string }).burned = "Sword";
    const hits = runRung1(
      turn({
        storyAfter: withGoblin,
        system: FR,
        results: [burned, meterAdjust("c2", "Goblin", -1, 3)],
      }),
    );
    expect(hits).toEqual([]);
  });

  it("is not tripped by a clamp: the request is what counts", () => {
    const hits = runRung1(
      turn({
        storyAfter: view({ meters: [hearts("Goblin", 0)] }),
        system: FR,
        results: [
          featRoll("c1", "strong_hit", "Goblin"), // 2 hearts
          meterAdjust("c2", "Goblin", -2, 1), // the foe had 1: clamps at 0
        ],
      }),
    );
    expect(hits).toEqual([]);
  });

  it("counts two rolls on one foe together, and reports once", () => {
    const hits = runRung1(
      turn({
        storyAfter: withGoblin,
        system: FR,
        results: [featRoll("c1", "hit", "Goblin"), featRoll("c2", "hit", "Goblin")],
      }),
    );
    expect(hits).toHaveLength(1);
    expect(hits[0].reask).toContain('"by":-2');
  });

  it("does not apply to a miss, to a roll with no target or to a foe with no Hearts meter", () => {
    expect(
      runRung1(turn({ storyAfter: withGoblin, system: FR, results: [featRoll("c1", "miss", "Goblin")] })),
    ).toEqual([]);
    expect(
      runRung1(turn({ storyAfter: withGoblin, system: FR, results: [featRoll("c1", "hit", undefined)] })),
    ).toEqual([]);
    expect(
      runRung1(turn({ storyAfter: view(), system: FR, results: [featRoll("c1", "hit", "Goblin")] })),
    ).toEqual([]);
  });

  it("ignores a refused meter call", () => {
    const refused = meterAdjust("c2", "Goblin", -1, 3, { success: false });
    const hits = runRung1(
      turn({
        storyAfter: withGoblin,
        system: FR,
        results: [featRoll("c1", "hit", "Goblin"), refused],
      }),
    );
    expect(hits).toHaveLength(1);
  });

  it("does nothing for a system that declares no contract", () => {
    const hits = runRung1(
      turn({
        storyAfter: withGoblin,
        system: {},
        results: [featRoll("c1", "hit", "Goblin")],
      }),
    );
    expect(hits).toEqual([]);
  });
});

describe("departed people", () => {
  const dead: NPC = {
    id: "n1",
    name: "Marcus",
    description: "",
    role: "",
    status: "dead",
    relationship: "",
    attitude: "neutral",
    createdAt: 0,
  };

  it("flags a dead person narrated as present, and never re-asks", () => {
    const hits = runRung1(
      turn({
        storyAfter: view({ npcs: [dead] }),
        prose: "Marcus arrives at the door with news.",
      }),
    );
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ check: "departed_person", verified: false });
    expect(hits[0].reask).toBeUndefined();
  });

  it("passes a dead person who is only remembered", () => {
    const hits = runRung1(
      turn({
        storyAfter: view({ npcs: [dead] }),
        prose: "Marcus never arrives, and nobody speaks of him.",
      }),
    );
    expect(hits).toEqual([]);
  });
});

describe("lines", () => {
  const record = {
    ...emptyCampaign(),
    safety: {
      lines: [{ id: "saf_1", text: "No torture on screen", keywords: ["torture", "flay"] }],
      veils: [],
    },
  };
  const story = view({ campaign: record });

  it("hits a keyword as a whole word and re-asks for new prose with the span", () => {
    const hits = runRung1(
      turn({ storyAfter: story, prose: "The guard begins the torture of the prisoner." }),
    );
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ check: "line", verified: true, replacesProse: true });
    expect(hits[0].reask).toContain("No torture on screen");
    expect(hits[0].reask).toContain("begins the torture of");
    expect(hits[0].factIds).toEqual(["f1"]);
  });

  it("passes a word that only contains the keyword", () => {
    const hits = runRung1(
      turn({ storyAfter: story, prose: "She is tortured by doubt, and tortuous roads." }),
    );
    expect(hits).toEqual([]);
  });

  it("is case-insensitive", () => {
    const hits = runRung1(turn({ storyAfter: story, prose: "TORTURE, he says." }));
    expect(hits).toHaveLength(1);
  });

  it("does nothing without a record", () => {
    expect(runRung1(turn({ prose: "torture" }))).toEqual([]);
  });
});

describe("secret phrases", () => {
  const secret = {
    id: "sec_1",
    title: "The mayor's debt",
    truth: "The mayor owes the Coven.",
    keyPhrases: ["owes the Coven"],
    revealed: false,
    clues: [],
  };
  const with_ = (revealed: boolean) =>
    view({ campaign: { ...emptyCampaign(), secrets: [{ ...secret, revealed }] } });

  it("flags an unrevealed secret's phrase and does not re-ask", () => {
    const hits = runRung1(
      turn({ storyAfter: with_(false), prose: "Everyone knows he owes the Coven now." }),
    );
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ check: "secret_phrase", verified: false });
    expect(hits[0].reask).toBeUndefined();
  });

  it("passes once the secret is revealed", () => {
    const hits = runRung1(
      turn({ storyAfter: with_(true), prose: "Everyone knows he owes the Coven now." }),
    );
    expect(hits).toEqual([]);
  });

  it("passes a secret the turn itself revealed", () => {
    const hits = runRung1(
      turn({
        storyBefore: with_(false),
        storyAfter: with_(true),
        prose: "He owes the Coven, and he says so.",
      }),
    );
    expect(hits).toEqual([]);
  });
});

describe("pacing counters", () => {
  const quiet = (n: number): PriorPartView[] =>
    Array.from({ length: n }, () => ({ content: "Nothing much happens.", gmConversation: [] }));
  const clockStory = view({
    campaign: {
      ...emptyCampaign(),
      clocks: [
        {
          id: "clk_1",
          name: "The Vigil closes in",
          segments: 6,
          filled: 2,
          triggers: ["miss"],
          visible: true,
          paused: false,
          crossed: [],
        },
      ],
    },
  });

  it("notes a clock that has not moved for the threshold, for the GM's next turn", () => {
    const hits = runRung1(
      turn({ storyAfter: clockStory, prose: "A quiet street.", priorParts: quiet(PACING_CLOCK_IDLE_TURNS) }),
    );
    const hit = hits.find((h) => h.check === "pacing_clock");
    expect(hit).toBeDefined();
    expect(hit?.reask).toBeUndefined();
    expect(pacingNoteFor(hits)).toContain("The Vigil closes in");
  });

  it("passes when a clock moved recently, or this turn", () => {
    const moved: PriorPartView[] = [
      ...quiet(3),
      { content: "x", gmConversation: [{ role: "tool", content: '[feat_roll] ...\n[Clock "The Vigil" 1/6 → 2/6]' }] },
      ...quiet(3),
    ];
    expect(
      runRung1(turn({ storyAfter: clockStory, prose: "x", priorParts: moved })).some(
        (h) => h.check === "pacing_clock",
      ),
    ).toBe(false);
    const now = { ...featRoll("c1", "miss", undefined), clockReports: [{ line: "x" }] };
    expect(
      runRung1(
        turn({
          storyAfter: clockStory,
          prose: "x",
          priorParts: quiet(PACING_CLOCK_IDLE_TURNS + 2),
          results: [now as JudgeToolResult],
        }),
      ).some((h) => h.check === "pacing_clock"),
    ).toBe(false);
  });

  it("ignores paused, full and cancelled clocks", () => {
    const stopped = view({
      campaign: {
        ...emptyCampaign(),
        clocks: [
          { ...clockStory.campaign!.clocks[0], paused: true },
          { ...clockStory.campaign!.clocks[0], id: "clk_2", filled: 6 },
          { ...clockStory.campaign!.clocks[0], id: "clk_3", cancelled: true },
        ],
      },
    });
    expect(
      runRung1(turn({ storyAfter: stopped, prose: "x", priorParts: quiet(20) })).some(
        (h) => h.check === "pacing_clock",
      ),
    ).toBe(false);
  });

  it("notes a player not addressed by name in the last turns, only with two or more players", () => {
    const players = [
      { id: "p1", name: "Ayla" },
      { id: "p2", name: "Bram" },
    ];
    const parts: PriorPartView[] = Array.from({ length: PACING_SPOTLIGHT_TURNS }, () => ({
      content: "Ayla watches the door.",
    }));
    const hits = runRung1(turn({ prose: "Ayla ducks.", priorParts: parts, players }));
    const hit = hits.find((h) => h.check === "pacing_spotlight");
    expect(hit?.evidence).toContain("Bram");
    expect(hit?.evidence).not.toContain("Ayla");
    // Named in this turn's prose: no hit.
    expect(
      runRung1(turn({ prose: "Ayla ducks; Bram does not.", priorParts: parts, players })).some(
        (h) => h.check === "pacing_spotlight",
      ),
    ).toBe(false);
    // One player: nothing to balance.
    expect(
      runRung1(turn({ prose: "x", priorParts: parts, players: [players[0]] })).some(
        (h) => h.check === "pacing_spotlight",
      ),
    ).toBe(false);
  });

  it("notes a phrase repeated across recent turns and in this one", () => {
    const parts: PriorPartView[] = Array.from({ length: 4 }, () => ({
      content: "The amber eyes of the cat follow you across the gloom.",
    }));
    const hits = runRung1(
      turn({ prose: "Again the amber eyes of the cat follow you.", priorParts: parts }),
    );
    expect(hits.some((h) => h.check === "repeated_phrase")).toBe(true);
    const fresh = runRung1(
      turn({ prose: "Rain hammers the slates and a bell tolls.", priorParts: parts }),
    );
    expect(fresh.some((h) => h.check === "repeated_phrase")).toBe(false);
  });
});

describe("buildReask", () => {
  it("is null with nothing fixable, and joins the verified hits' messages", () => {
    expect(buildReask([])).toBeNull();
    expect(
      buildReask([{ check: "secret_phrase", verified: false, evidence: "x", factIds: [] }]),
    ).toBeNull();
    const plan = buildReask([
      { check: "event_contract", verified: true, evidence: "a", factIds: [], reask: "Fix A." },
      { check: "line", verified: true, evidence: "b", factIds: [], reask: "Fix B.", replacesProse: true },
    ]);
    expect(plan?.message).toBe("Fix A.\n\nFix B.");
    expect(plan?.replacesProse).toBe(true);
  });
});

describe("facts", () => {
  it("numbers facts f1..fn with source and time, and does not mutate", () => {
    const before = view({
      campaign: {
        ...emptyCampaign(),
        safety: { lines: [{ id: "saf_1", text: "No torture", keywords: ["torture"] }], veils: [] },
        secrets: [
          { id: "sec_1", title: "T", truth: "Truth", keyPhrases: ["p"], revealed: false, clues: [] },
          { id: "sec_2", title: "Done", truth: "Out", keyPhrases: ["q"], revealed: true, clues: [] },
        ],
      },
    });
    const after = view({
      ...before,
      npcs: [
        {
          id: "n1",
          name: "Marcus",
          description: "",
          role: "",
          status: "dead",
          relationship: "",
          attitude: "neutral",
          createdAt: 0,
        },
      ],
    });
    const facts = collectTurnFacts(before, after, [featRoll("c1", "hit", "Goblin")]);
    expect(facts.map((f) => f.id)).toEqual(facts.map((_, i) => `f${i + 1}`));
    expect(facts[0]).toMatchObject({ source: { kind: "tool", ref: "c1" }, when: "after" });
    expect(facts.some((f) => f.source.kind === "record" && f.text.includes("Line: No torture"))).toBe(true);
    expect(facts.some((f) => f.text.includes('"T"'))).toBe(true);
    expect(facts.some((f) => f.text.includes('"Done"'))).toBe(false); // revealed
    expect(facts.find((f) => f.source.kind === "npc")).toMatchObject({
      when: "after",
      text: "Marcus is dead",
    });
  });

  it("snapshots a story so later changes do not reach it", () => {
    const story = view({ meters: [hearts("Goblin", 3)] });
    const snap = snapshotJudgeView(story);
    story.meters![0].value = 0;
    expect(snap.meters![0].value).toBe(3);
  });
});
