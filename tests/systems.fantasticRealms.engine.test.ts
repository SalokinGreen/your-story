/**
 * Fantastic Realms, plan slice 2 (docs/fantastic-realms-plan.md): the pure
 * arithmetic, the five tools run against a stand-in system (the real one is
 * registered in slice 6), the outcome judge's view of feat_roll and the
 * heroes' line in the live block.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { formatHeroFeatsState } from "@/app/misc/ai_staged";
import type {
  GMAwardXpResult,
  GMFeatRollResult,
  GMTakeRestResult,
} from "@/app/misc/gmExecutor";
import { setMeterMax } from "@/app/misc/metersAndTracks";
import { extractOutcomeVerdicts } from "@/app/misc/observer";
import type { Meter, StoryData } from "@/app/misc/structs";
import { BUILTIN_SYSTEMS } from "@/app/misc/systems";
import {
  applyXp,
  countSuccesses,
  foeDamage,
  levelCost,
  normaliseFeat,
  resultFor,
} from "@/app/misc/systems/fantastic-realms/engine";
import type { BuiltinSystem } from "@/app/misc/systems/types";
import { mockStory, run } from "./helpers/systemsHarness";

afterEach(() => vi.restoreAllMocks());

const FR: BuiltinSystem = {
  id: "fantastic-realms",
  title: "Fantastic Realms (test)",
  description: "",
  packs: [],
  starters: [],
  meterSets: [
    {
      name: "Fantastic Realms hero",
      meters: [
        { name: "Hearts", min: 0, max: 3, start: 3 },
        { name: "Level", min: 1, max: 20, start: 1 },
        { name: "XP", min: 0, max: 2000, start: 0 },
      ],
    },
  ],
  tools: ["manage_meter", "manage_feats", "feat_roll", "initiative_roll", "award_xp", "take_rest"],
  rests: { meadow: "A few hours.", marsh: "Weeks, somewhere safe." },
};

beforeAll(() => {
  BUILTIN_SYSTEMS.push(FR);
});
afterAll(() => {
  BUILTIN_SYSTEMS.splice(BUILTIN_SYSTEMS.indexOf(FR), 1);
});

function frStory(overrides: Partial<StoryData> = {}): StoryData {
  return mockStory({
    systemState: { systemId: "fantastic-realms", sessionCount: 0, dedupKeys: [] },
    ...overrides,
  });
}

const MANUAL = () => frStory({ diceMode: "manual" });

/** Runs calls one after another, each on the story the last one left. */
async function chain(
  story: StoryData,
  calls: [string, Record<string, unknown>][],
) {
  let s = story;
  const results = [];
  for (const [name, args] of calls) {
    const out = await run(s, name, args);
    s = out.story;
    results.push(out.result);
  }
  return { story: s, results };
}

const BRYN_FEATS = ["Brave", "Quick", "Sword", "Armor"];
const addFeats = (hero = "Bryn", feats = BRYN_FEATS): [string, Record<string, unknown>][] =>
  feats.map((feat) => ["manage_feats", { hero, action: "add", feat }]);

async function brynStory(base: StoryData = MANUAL()): Promise<StoryData> {
  return (await chain(base, addFeats())).story;
}

function meter(s: StoryData, owner: string, name: string): Meter {
  return s.meters!.find((m) => m.owner === owner && m.name === name)!;
}

describe("the arithmetic", () => {
  it("counts a die that equals or beats the DC", () => {
    expect(countSuccesses([5, 2, 3, 1], 3)).toBe(2);
    expect(countSuccesses([3, 3], 3)).toBe(2);
    expect(countSuccesses([1, 2], 3)).toBe(0);
  });

  it("maps successes 0 to 6 onto the tiers and the magnitude", () => {
    expect(resultFor(0)).toEqual({ tier: "miss", magnitude: 0 });
    expect(resultFor(1)).toEqual({ tier: "weak_hit", magnitude: 0 });
    expect(resultFor(2)).toEqual({ tier: "hit", magnitude: 0 });
    expect(resultFor(3)).toEqual({ tier: "strong_hit", magnitude: 0 });
    expect(resultFor(4)).toEqual({ tier: "strong_hit", magnitude: 1 });
    expect(resultFor(5)).toEqual({ tier: "strong_hit", magnitude: 2 });
    expect(resultFor(6)).toEqual({ tier: "strong_hit", magnitude: 3 });
  });

  it("the damage table: weak 1, hit 1, strong 2 plus the magnitude, miss 0", () => {
    expect([0, 1, 2, 3, 4, 5].map((n) => foeDamage(resultFor(n)))).toEqual([0, 1, 1, 2, 3, 4]);
  });

  it("level costs (level + 1) x 1000", () => {
    expect(levelCost(1)).toBe(2000);
    expect(levelCost(2)).toBe(3000);
  });

  it("levels across two levels at once, carrying over", () => {
    // 2,000 for level 2, 3,000 for level 3, 500 left over
    expect(applyXp(1, 0, 5500)).toEqual({
      level: 3,
      xp: 500,
      levelsGained: [2, 3],
      heartLevels: [3],
    });
    expect(applyXp(1, 1500, 400)).toEqual({ level: 1, xp: 1900, levelsGained: [], heartLevels: [] });
  });

  it("gives a heart at levels 3 and 6 and caps at level 20", () => {
    expect(applyXp(5, 0, 6000).heartLevels).toEqual([6]);
    const capped = applyXp(19, 0, 1_000_000);
    expect(capped.level).toBe(20);
    expect(capped.xp).toBe(levelCost(20));
    expect(applyXp(20, levelCost(20), 500).xp).toBe(levelCost(20));
  });

  it("matches feats loosely", () => {
    expect(normaliseFeat("  Dragon-Scarred! ")).toBe("dragon scarred");
    expect(normaliseFeat("SWORD")).toBe(normaliseFeat("sword"));
  });

  it("setMeterMax refuses a max below the floor and moves the cap only on request", () => {
    const hearts: Meter = {
      id: "b::hearts", owner: "B", name: "Hearts", min: 0, max: 3, cap: 3, floor: 0, value: 3,
    };
    expect(() => setMeterMax(hearts, -1)).toThrow();
    const raised = setMeterMax(hearts, 4, { raiseCap: true }).meter;
    expect([raised.max, raised.cap, raised.value]).toEqual([4, 4, 3]);
    const plain = setMeterMax(hearts, 4).meter;
    expect([plain.max, plain.cap]).toEqual([4, 3]);
    const lowered = setMeterMax(hearts, 2).meter;
    expect([lowered.max, lowered.cap, lowered.value]).toEqual([2, 2, 2]);
  });
});

describe("manage_feats", () => {
  it("adds, renames keeping the id and the burn, and removes", async () => {
    const { story, results } = await chain(MANUAL(), [
      ...addFeats(),
      ["feat_roll", { hero: "Bryn", feats: ["Sword"], dc: 3, burn: "Sword", reason: "x", dice: [4, 4] }],
      ["manage_feats", { hero: "Bryn", action: "rename", feat: "sword", new_wording: "Ancestral Sword" }],
    ]);
    expect(results.every((r) => r.success)).toBe(true);
    const feats = story.systemState!.fantasticRealms!.heroes["bryn"].feats;
    const sword = feats.find((f) => f.wording === "Ancestral Sword")!;
    expect(sword.id).toBe("feat-3");
    expect(sword.burned).toBe(true);
    const removed = await run(story, "manage_feats", { hero: "Bryn", action: "remove", feat: "armor" });
    expect(removed.story.systemState!.fantasticRealms!.heroes["bryn"].feats).toHaveLength(3);
  });

  it("refuses a duplicate wording, loosely matched", async () => {
    const s = await brynStory();
    const dup = await run(s, "manage_feats", { hero: "Bryn", action: "add", feat: "SWORD!" });
    expect(dup.result.success).toBe(false);
    expect(dup.result.contextForStory).toContain("already has");
  });

  it("is refused in a story that does not run the system", async () => {
    const out = await run(mockStory(), "manage_feats", { hero: "Bryn", action: "add", feat: "Brave" });
    expect(out.result.success).toBe(false);
    expect(out.result.contextForStory).toContain("not part of this story's system");
  });
});

describe("feat_roll", () => {
  const roll = (s: StoryData, extra: Record<string, unknown>) =>
    run(s, "feat_roll", {
      hero: "Bryn",
      feats: ["Quick", "Sword", "Brave"],
      dc: 3,
      reason: "Attack the goblin",
      ...extra,
    });

  it("reads the worked example: a burned Sword plus two successes is a strong hit", async () => {
    const s = await brynStory();
    const out = await roll(s, { burn: "Sword", dice: [5, 2, 3, 1] });
    const res = out.result.result as GMFeatRollResult;
    expect(res.successes).toBe(3);
    expect(res.outcome).toBe("strong_hit");
    expect(out.result.success).toBe(true);
    expect(out.result.contextForStory).toContain("STRONG HIT");
    expect(out.result.contextForStory).toContain("loses 2 hearts");
    const sword = out.story.systemState!.fantasticRealms!.heroes["bryn"].feats.find((f) => f.wording === "Sword")!;
    expect(sword.burned).toBe(true);
  });

  it("puts the magnitude in the text: four successes is STRONG HIT +1", async () => {
    const s = await brynStory();
    const out = await roll(s, { dice: [6, 6, 6, 6] });
    expect(out.result.contextForStory).toContain("STRONG HIT +1");
    expect((out.result.result as GMFeatRollResult).magnitude).toBe(1);
  });

  it("a miss is a failed check, not an engine error", async () => {
    const s = await brynStory();
    const out = await roll(s, { dice: [1, 2, 1, 2] });
    expect(out.result.success).toBe(false);
    expect(out.result.contextForStory).toContain("MISS");
    expect(out.result.contextForStory).not.toContain("ERROR");
  });

  it("a burned feat adds nothing: the next roll naming it is refused", async () => {
    const s = await brynStory();
    const first = await roll(s, { burn: "Sword", dice: [5, 2, 3, 1] });
    const again = await roll(first.story, { dice: [5, 2, 3, 1] });
    expect(again.result.success).toBe(false);
    expect(again.result.contextForStory).toContain("burned");
    // The same call without the burned feat is fine.
    const ok = await roll(first.story, { feats: ["Quick", "Brave"], dice: [5, 2, 3] });
    expect(ok.result.contextForStory).not.toContain("ERROR");
  });

  it("burns only when the roll completes: a refused roll burns nothing", async () => {
    const s = await brynStory();
    // wrong number of dice: refused
    const bad = await roll(s, { burn: "Sword", dice: [5, 2] });
    expect(bad.result.success).toBe(false);
    expect(bad.story.systemState!.fantasticRealms!.heroes["bryn"].feats.some((f) => f.burned)).toBe(false);
  });

  it("refuses a burn that is not in the roll, and a burn on the base die alone", async () => {
    const s = await brynStory();
    const notIn = await roll(s, { feats: ["Quick"], burn: "Sword", dice: [4, 4] });
    expect(notIn.result.contextForStory).toContain("must be one of the feats");
    const baseOnly = await roll(s, { feats: [], burn: "Sword", dice: [4] });
    expect(baseOnly.result.contextForStory).toContain("Nothing to burn");
  });

  it("validates the feats, the DC and a repeat", async () => {
    const s = await brynStory();
    expect((await roll(s, { feats: ["Flying"], dice: [4, 4] })).result.contextForStory).toContain('no feat "Flying"');
    expect((await roll(s, { feats: ["Quick", "quick"], dice: [4, 4, 4] })).result.contextForStory).toContain("named twice");
    expect((await roll(s, { dc: 1, dice: [4, 4, 4, 4] })).result.contextForStory).toContain("2 to 6");
    expect((await roll(s, { dc: 7, dice: [4, 4, 4, 4] })).result.success).toBe(false);
    const stranger = await run(s, "feat_roll", { hero: "Nobody", feats: [], dc: 3, reason: "x" });
    expect(stranger.result.contextForStory).toContain("no feats recorded");
  });

  it("validates manual faces, and refuses them outside manual mode", async () => {
    const s = await brynStory();
    for (const dice of [[7, 1, 1, 1], [0, 1, 1, 1], [1.5, 1, 1, 1], [1, 1, 1]]) {
      expect((await roll(s, { dice })).result.success).toBe(false);
    }
    const digital = await brynStory(frStory());
    const refused = await roll(digital, { dice: [4, 4, 4, 4] });
    expect(refused.result.contextForStory).toContain("manual dice mode");
  });

  it("rolls the pool digitally when no faces are given", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99); // every d6 shows 6
    const s = await brynStory(frStory());
    const out = await roll(s, {});
    const res = out.result.result as GMFeatRollResult;
    expect(res.dice).toEqual([6, 6, 6, 6]);
    expect(res.outcome).toBe("strong_hit");
    expect(res.magnitude).toBe(1);
  });

  it("goes through the physical toss when it is wired up", async () => {
    const s = await brynStory(frStory());
    const requestDiceThrow = vi.fn(async ({ groups }: { groups: { count: number; sides: number }[] }) =>
      groups.map((g) => Array.from({ length: g.count }, () => 5)),
    );
    const { executeGMTools } = await import("@/app/misc/gmExecutor");
    const out = await executeGMTools(
      [{ id: "t1", function: { name: "feat_roll", arguments: JSON.stringify({ hero: "Bryn", feats: ["Quick"], dc: 5, reason: "x" }) } }],
      s,
      {},
      { requestDiceThrow } as never,
    );
    expect(requestDiceThrow).toHaveBeenCalledTimes(1);
    expect((out.results[0].result as GMFeatRollResult).dice).toEqual([5, 5]);
  });
});

describe("initiative_roll", () => {
  it("rolls one d6 per hero, plus one per edge feat", async () => {
    vi.spyOn(Math, "random").mockReturnValueOnce(0.5).mockReturnValueOnce(0.2); // 4, then 2
    const s = await brynStory(frStory());
    const out = await run(s, "initiative_roll", {
      heroes: [{ hero: "Bryn", edge_feats: ["Quick"] }, { hero: "Mira" }],
    });
    expect(out.result.success).toBe(true);
    expect(out.result.contextForStory).toContain("Bryn 5 (d6 4 + 1 for Quick)");
    expect(out.result.contextForStory).toContain("Mira 2 (d6 2)");
    expect(out.result.contextForStory).toContain("ties go to the heroes");
  });

  it("refuses a burned or unknown edge feat", async () => {
    const s = await brynStory();
    const burned = await chain(s, [
      ["feat_roll", { hero: "Bryn", feats: ["Quick"], dc: 3, burn: "Quick", reason: "x", dice: [4, 4] }],
    ]);
    const out = await run(burned.story, "initiative_roll", { heroes: [{ hero: "Bryn", edge_feats: ["Quick"] }] });
    expect(out.result.success).toBe(false);
    expect((await run(s, "initiative_roll", { heroes: [] })).result.success).toBe(false);
  });
});

describe("award_xp", () => {
  it("creates the hero set when missing, credits and levels, and adds a heart at level 3", async () => {
    const s = await brynStory();
    const out = await run(s, "award_xp", { amount: 5500, source: "The dragon" });
    expect(out.result.success).toBe(true);
    const res = out.result.result as GMAwardXpResult;
    expect(res.levelUps[0]).toMatchObject({ level: 3, levelsGained: [2, 3], heartsGained: 1 });
    expect(out.result.contextForStory).toContain("Levels 2, 3 reached");
    expect(out.result.contextForStory).toContain("+1 maximum heart");
    const owner = "Bryn";
    const hearts = meter(out.story, owner, "Hearts");
    expect([hearts.value, hearts.max, hearts.cap]).toEqual([4, 4, 4]);
    expect(meter(out.story, owner, "Level").value).toBe(3);
    const xp = meter(out.story, owner, "XP");
    expect([xp.value, xp.max]).toEqual([500, levelCost(3)]);
  });

  it("refuses a repeated source per hero but credits the others", async () => {
    const s = (await chain(MANUAL(), [...addFeats("Bryn"), ...addFeats("Mira")])).story;
    const first = await run(s, "award_xp", { amount: 600, source: "Goblin champion", heroes: ["Bryn"] });
    const second = await run(first.story, "award_xp", { amount: 600, source: "goblin champion!" });
    expect(second.result.success).toBe(true);
    const res = second.result.result as GMAwardXpResult;
    expect(res.refused).toEqual(["Bryn"]);
    expect(res.credited).toEqual(["Mira"]);
    expect(meter(second.story, "Bryn", "XP").value).toBe(600);
    expect(meter(second.story, "Mira", "XP").value).toBe(600);
    // nobody left to credit: an error
    const third = await run(second.story, "award_xp", { amount: 600, source: "Goblin champion" });
    expect(third.result.success).toBe(false);
  });

  it("validates the amount and the source", async () => {
    const s = await brynStory();
    expect((await run(s, "award_xp", { amount: 0, source: "x" })).result.success).toBe(false);
    expect((await run(s, "award_xp", { amount: 100, source: " " })).result.success).toBe(false);
    expect((await run(s, "award_xp", { amount: 100, source: "x", heroes: ["Stranger"] })).result.success).toBe(false);
  });

  it("reads the system's own hero set by name, not the fallback", async () => {
    const original = FR.meterSets[0].meters[0].max;
    FR.meterSets[0].meters[0].max = 5; // a custom Hearts range: the engine must use it
    FR.meterSets[0].meters[0].start = 5;
    try {
      const s = await brynStory();
      const out = await run(s, "award_xp", { amount: 100, source: "x" });
      expect(meter(out.story, "Bryn", "Hearts").max).toBe(5);
    } finally {
      FR.meterSets[0].meters[0].max = original;
      FR.meterSets[0].meters[0].start = original;
    }
  });
});

describe("take_rest", () => {
  it("heals every heart, clears burns, records the realm and returns its condition", async () => {
    const s = await brynStory();
    const hurt = await chain(s, [
      ["award_xp", { amount: 10, source: "setup" }],
      ["manage_meter", { owner: "Bryn", meter: "Hearts", action: "adjust", by: -2, reason: "a goblin bit" }],
      ["feat_roll", { hero: "Bryn", feats: ["Sword"], dc: 3, burn: "Sword", reason: "x", dice: [4, 4] }],
    ]);
    expect(meter(hurt.story, "Bryn", "Hearts").value).toBe(1);
    const out = await run(hurt.story, "take_rest", { realm: "marsh" });
    expect(out.result.success).toBe(true);
    expect(meter(out.story, "Bryn", "Hearts").value).toBe(3);
    expect(out.story.systemState!.fantasticRealms!.heroes["bryn"].feats.some((f) => f.burned)).toBe(false);
    expect(out.story.systemState!.fantasticRealms!.realm).toBe("marsh");
    expect((out.result.result as GMTakeRestResult).condition).toBe("Weeks, somewhere safe.");
    expect(out.result.contextForStory).toContain("Weeks, somewhere safe.");
  });

  it("refuses an unknown realm and says when none is recorded", async () => {
    const s = await brynStory();
    expect((await run(s, "take_rest", { realm: "moon" })).result.success).toBe(false);
    const none = await run(s, "take_rest", {});
    expect(none.result.success).toBe(true);
    expect(none.result.contextForStory).toContain("No realm is recorded");
  });
});

describe("the outcome judge", () => {
  it("reads feat_roll tiers, with the magnitude in the text, and skips a refusal", async () => {
    const s = await brynStory();
    const strong = await run(s, "feat_roll", { hero: "Bryn", feats: ["Quick", "Sword", "Brave"], dc: 3, reason: "x", dice: [6, 6, 6, 6] });
    const miss = await run(s, "feat_roll", { hero: "Bryn", feats: [], dc: 3, reason: "x", dice: [1] });
    const hit = await run(s, "feat_roll", { hero: "Bryn", feats: ["Quick"], dc: 3, reason: "x", dice: [6, 6] });
    const refused = await run(s, "feat_roll", { hero: "Bryn", feats: ["Nope"], dc: 3, reason: "x" });
    const verdicts = extractOutcomeVerdicts([strong.result, miss.result, hit.result, refused.result]);
    expect(verdicts.map((v) => v.tier)).toEqual(["strong_hit", "miss", "hit"]);
    expect(verdicts[0].contextForStory).toContain("STRONG HIT +1");
    expect(verdicts.every((v) => v.toolName === "feat_roll")).toBe(true);
  });
});

describe("the heroes' line in the live block", () => {
  it("lists feats with burned ones marked, and the realm", async () => {
    const s = await brynStory();
    const after = await chain(s, [
      ["award_xp", { amount: 10, source: "setup" }],
      ["feat_roll", { hero: "Bryn", feats: ["Sword"], dc: 3, burn: "Sword", reason: "x", dice: [4, 4] }],
      ["take_rest", { realm: "meadow" }],
      ["feat_roll", { hero: "Bryn", feats: ["Sword"], dc: 3, burn: "Sword", reason: "x", dice: [4, 4] }],
    ]);
    const text = formatHeroFeatsState(after.story);
    expect(text).toContain("Bryn — feats: Brave, Quick, Sword (burned), Armor");
    expect(text).toContain("Realm: meadow");
  });

  it("is empty for a story with no hero state", () => {
    expect(formatHeroFeatsState(mockStory())).toBe("");
  });
});
