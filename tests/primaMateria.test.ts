/**
 * Prima Materia oracle: the portent mechanism, Frames, Tint and the Lens
 * Shift, plus the director's complication seeds. The book's appendix word
 * tables are no longer shipped (see the provenance banner in
 * primaMateria.ts), so nothing here pins table contents.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  ARCHETYPE_ORDER,
  RELATION_ORDER,
  RELATION_GROUP,
  applyLensShift,
  formatPortentForModel,
  keywordsFor,
  rollComplication,
  rollPortent,
  selectFrame,
  type Tint,
} from "@/app/misc/primaMateria";
import type { StoryData } from "@/app/misc/structs";

afterEach(() => {
  vi.restoreAllMocks();
});

/**
 * Feed rollPortent a fixed sequence of die faces. Values are
 * mid-bucket for the same floating-point reason mythicFateChart.test.ts
 * documents - `(face - 1) / sides` can floor back to the previous face.
 */
function mockRolls(faces: Array<{ face: number; sides: number }>) {
  let i = 0;
  vi.spyOn(Math, "random").mockImplementation(() => {
    const next = faces[Math.min(i, faces.length - 1)];
    i++;
    return (next.face - 0.5) / next.sides;
  });
}

/** Math.random values that pick sol/nox on the engine's coin flips. */
const SOL_COIN = 0.25;
const NOX_COIN = 0.75;

function emptyStory(overrides: Partial<StoryData> = {}): StoryData {
  return {
    lore: [],
    npcs: [],
    ...overrides,
  } as unknown as StoryData;
}

describe("symbol sets", () => {
  it("has twelve archetypes and six relations", () => {
    expect(ARCHETYPE_ORDER).toHaveLength(12);
    expect(new Set(ARCHETYPE_ORDER).size).toBe(12);
    expect(RELATION_ORDER).toHaveLength(6);
    expect(new Set(RELATION_ORDER).size).toBe(6);
  });

  it("splits the relations evenly into celestial and chthonic", () => {
    const groups = RELATION_ORDER.map((r) => RELATION_GROUP[r]);
    expect(groups.filter((g) => g === "celestial")).toHaveLength(3);
    expect(groups.filter((g) => g === "chthonic")).toHaveLength(3);
  });

  it("gives every archetype a distinct bright and shadow reading", () => {
    for (const archetype of ARCHETYPE_ORDER) {
      const sol = keywordsFor(archetype, "sol");
      const nox = keywordsFor(archetype, "nox");
      expect(sol.length).toBeGreaterThan(0);
      expect(nox.length).toBeGreaterThan(0);
      // The whole point of two dice bearing the same twelve symbols is
      // that the two readings genuinely differ.
      expect(sol).not.toBe(nox);
    }
  });
});

describe("complication seeds", () => {
  it("returns a non-empty seed from every face", () => {
    const seeds = new Set<string>();
    // 24 entries - walk every face via mid-bucket values.
    for (let face = 1; face <= 24; face++) {
      vi.spyOn(Math, "random").mockReturnValue((face - 0.5) / 24);
      const seed = rollComplication();
      expect(seed.length, `face ${face}`).toBeGreaterThan(0);
      seeds.add(seed);
      vi.restoreAllMocks();
    }
    expect(seeds.size).toBe(24);
  });
});

describe("portent rolls", () => {
  it("returns one term and no relation for a peek", () => {
    mockRolls([{ face: 1, sides: 2 }, { face: 5, sides: 12 }]);
    const result = rollPortent("peek", "literal");
    expect(result.terms).toHaveLength(1);
    expect(result.relation).toBeUndefined();
    expect(result.lensShift).toBeUndefined();
  });

  it("returns both terms and no relation for a pinch", () => {
    mockRolls([
      { face: 1, sides: 12 },
      { face: 5, sides: 12 },
      { face: 1, sides: 2 },
    ]);
    const result = rollPortent("pinch", "personal");
    expect(result.terms).toHaveLength(2);
    expect(result.terms[0].polarity).toBe("sol");
    expect(result.terms[1].polarity).toBe("nox");
    expect(result.relation).toBeUndefined();
  });

  it("joins two terms with a relation for a portent", () => {
    let call = 0;
    vi.spyOn(Math, "random").mockImplementation(() => {
      // sol d12 -> Fortune(1), nox d12 -> Mind(5), prime coin -> sol,
      // syzygy d6 -> against(2)
      const seq = [0.5 / 12, 4.5 / 12, SOL_COIN, 1.5 / 6];
      return seq[Math.min(call++, seq.length - 1)];
    });
    const result = rollPortent("portent", "structural");
    expect(result.statement).toBe("Fortune (Sol) against Mind (Nox)");
    expect(result.relation).toBe("against");
    expect(result.relationGroup).toBe("chthonic");
    expect(result.frame).toBe("structural");
  });

  it("reads the prime die first, so nox can lead the statement", () => {
    let call = 0;
    vi.spyOn(Math, "random").mockImplementation(() => {
      const seq = [0.5 / 12, 4.5 / 12, NOX_COIN, 0.5 / 6];
      return seq[Math.min(call++, seq.length - 1)];
    });
    const result = rollPortent("portent", "literal");
    expect(result.primeDie).toBe("nox");
    expect(result.statement).toBe("Mind (Nox) within Fortune (Sol)");
    // Terms stay in Sol/Nox order regardless of which one leads.
    expect(result.terms[0].polarity).toBe("sol");
  });
});

describe("lens shift", () => {
  it("moves neutral toward whichever die won", () => {
    expect(applyLensShift("neutral", "sol")).toBe("day");
    expect(applyLensShift("neutral", "nox")).toBe("night");
  });

  it("settles back to neutral when the same principle repeats", () => {
    expect(applyLensShift("day", "sol")).toBe("neutral");
    expect(applyLensShift("night", "nox")).toBe("neutral");
  });

  it("crosses all the way over when the opposite principle wins", () => {
    expect(applyLensShift("day", "nox")).toBe("night");
    expect(applyLensShift("night", "sol")).toBe("day");
  });

  it("never returns an invalid tint from any starting position", () => {
    const tints: Tint[] = ["day", "neutral", "night"];
    for (const from of tints) {
      for (const prime of ["sol", "nox"] as const) {
        expect(tints).toContain(applyLensShift(from, prime));
      }
    }
  });

  it("fires on doubles and reports the doubled symbol", () => {
    let call = 0;
    vi.spyOn(Math, "random").mockImplementation(() => {
      // both d12s land on Fortune, prime coin -> nox
      const seq = [0.5 / 12, 0.5 / 12, NOX_COIN, 0.5 / 6];
      return seq[Math.min(call++, seq.length - 1)];
    });
    const result = rollPortent("portent", "literal", "neutral");
    expect(result.lensShift).toBeDefined();
    expect(result.lensShift!.symbol).toBe("Fortune");
    expect(result.lensShift!.from).toBe("neutral");
    expect(result.lensShift!.to).toBe("night");
  });

  it("does not report a shift that lands where it started", () => {
    // Doubles while already at Day, with Sol winning, resolves back to...
    // Day is wrong - it resolves to Neutral, so that IS a shift. The
    // no-op case is unreachable through applyLensShift by construction;
    // assert that rather than fake it, so the guard's intent is recorded.
    const tints: Tint[] = ["day", "neutral", "night"];
    for (const from of tints) {
      for (const prime of ["sol", "nox"] as const) {
        expect(applyLensShift(from, prime)).not.toBe(from);
      }
    }
  });

  it("does not fire when the two dice differ", () => {
    let call = 0;
    vi.spyOn(Math, "random").mockImplementation(() => {
      const seq = [0.5 / 12, 4.5 / 12, SOL_COIN, 0.5 / 6];
      return seq[Math.min(call++, seq.length - 1)];
    });
    expect(rollPortent("portent", "literal", "neutral").lensShift).toBeUndefined();
  });
});

describe("frame selection", () => {
  it("picks literal when combat is running", () => {
    expect(
      selectFrame(
        emptyStory({
          combatState: { active: true, combatants: [], turnOrder: [], currentTurnIndex: 0, round: 1 },
          timers: [{ status: "active" } as never],
        })
      )
    ).toBe("literal");
  });

  it("picks literal during a challenge, outranking a moving world", () => {
    expect(
      selectFrame(
        emptyStory({
          activeChallenge: { id: "c1" } as never,
          threads: [{ status: "active" }, { status: "active" }] as never,
        })
      )
    ).toBe("literal");
  });

  it("picks structural when a timer is running", () => {
    expect(
      selectFrame(
        emptyStory({
          timers: [{ status: "active" }] as never,
          npcs: [{ name: "Bram" }] as never,
        })
      )
    ).toBe("structural");
  });

  it("picks structural once two or more threads are open", () => {
    expect(
      selectFrame(
        emptyStory({
          threads: [{ status: "active" }, { status: "active" }] as never,
        })
      )
    ).toBe("structural");
  });

  it("does not go structural on a single open thread", () => {
    expect(
      selectFrame(
        emptyStory({
          threads: [{ status: "active" }] as never,
          npcs: [{ name: "Bram" }] as never,
        })
      )
    ).toBe("personal");
  });

  it("ignores resolved threads and cancelled timers", () => {
    expect(
      selectFrame(
        emptyStory({
          threads: [{ status: "resolved" }, { status: "abandoned" }] as never,
          timers: [{ status: "cancelled" }] as never,
        })
      )
    ).toBe("literal");
  });

  it("picks personal when people are in play and nothing else is moving", () => {
    expect(selectFrame(emptyStory({ npcs: [{ name: "Bram" }] as never }))).toBe(
      "personal"
    );
  });

  it("falls back to literal on a stalled scene with nothing in it", () => {
    expect(selectFrame(emptyStory())).toBe("literal");
  });

  it("is a pure function of state - same story, same frame", () => {
    const story = emptyStory({ npcs: [{ name: "Bram" }] as never });
    const frames = new Set(Array.from({ length: 20 }, () => selectFrame(story)));
    expect(frames.size).toBe(1);
  });
});

describe("model-facing formatting", () => {
  it("spells out keywords, relation polarity and frame guidance", () => {
    let call = 0;
    vi.spyOn(Math, "random").mockImplementation(() => {
      const seq = [0.5 / 12, 4.5 / 12, SOL_COIN, 1.5 / 6];
      return seq[Math.min(call++, seq.length - 1)];
    });
    const text = formatPortentForModel(rollPortent("portent", "personal"));

    // A bare "Fortune against Mind" invites the model to fall back on the
    // most obvious reading of two common nouns - the keyword sets are what
    // stop that, so they must actually reach the prompt.
    expect(text).toContain("Fortune (Sol) against Mind (Nox)");
    expect(text).toContain(keywordsFor("Fortune", "sol"));
    expect(text).toContain(keywordsFor("Mind", "nox"));
    expect(text).toContain("chthonic");
    expect(text).toContain("Character psychology & motivation");
  });

  it("tells the model not to name the mechanism", () => {
    mockRolls([{ face: 1, sides: 2 }, { face: 1, sides: 12 }]);
    const text = formatPortentForModel(rollPortent("peek", "literal"));
    expect(text.toLowerCase()).toContain("do not name the dice");
  });

  it("frames a lens shift as a change of register, not an event", () => {
    let call = 0;
    vi.spyOn(Math, "random").mockImplementation(() => {
      const seq = [0.5 / 12, 0.5 / 12, NOX_COIN, 0.5 / 6];
      return seq[Math.min(call++, seq.length - 1)];
    });
    const text = formatPortentForModel(
      rollPortent("portent", "literal", "neutral")
    );
    expect(text).toContain("LENS SHIFT");
    expect(text).toContain("not an event");
  });
});
