/**
 * Fantastic Realms, grown: slice E1 (docs/fr-expansion-plan.md, decisions
 * 243-256). The pure rules, the new manage_feats actions, feat_roll's help,
 * team burns, hindrances and refusal order, take_rest, the three counters,
 * the tally's `hit`, the damage contract with Keen, the hero line, and an old
 * save that must roll exactly as before. Deterministic: manual dice, no model.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import MetersPanel from "@/app/story/MetersPanel";
import { formatHeroFeatsState } from "@/app/misc/ai_staged";
import type { GMFeatRollResult, GMTakeRestResult } from "@/app/misc/gmExecutor";
import { runRung1, type Rung1Turn } from "@/app/misc/judges/rung1";
import type { JudgeStoryView, JudgeToolResult } from "@/app/misc/judges/types";
import type { HeroFeat, Meter, StoryData } from "@/app/misc/structs";
import { BUILTIN_SYSTEMS } from "@/app/misc/systems";
import { FANTASTIC_REALMS } from "@/app/misc/systems/fantastic-realms";
import {
  CONDITIONS_TO_BE_DOWN,
  attackDamage,
  featUsable,
  isDown,
  poolSize,
  resetUses,
  resultFor,
  tallyScore,
} from "@/app/misc/systems/fantastic-realms/engine";
import { FANTASTIC_REALMS_METER_SETS } from "@/app/misc/systems/fantastic-realms/sheet";
import type { BuiltinSystem } from "@/app/misc/systems/types";
import { mockStory, run } from "./helpers/systemsHarness";

afterEach(() => vi.restoreAllMocks());

const FR: BuiltinSystem = {
  id: "fantastic-realms",
  title: "Fantastic Realms (test)",
  description: "",
  packs: [],
  starters: [],
  meterSets: FANTASTIC_REALMS_METER_SETS,
  tools: [
    "manage_meter",
    "manage_feats",
    "feat_roll",
    "initiative_roll",
    "award_xp",
    "take_rest",
    "end_session",
  ],
  rests: { meadow: "A few hours.", marsh: "Weeks, somewhere safe." },
};

let registered: BuiltinSystem | undefined;
let slot = -1;
beforeAll(() => {
  slot = BUILTIN_SYSTEMS.findIndex((s) => s.id === FR.id);
  if (slot >= 0) {
    registered = BUILTIN_SYSTEMS[slot];
    BUILTIN_SYSTEMS[slot] = FR;
  } else {
    BUILTIN_SYSTEMS.push(FR);
  }
});
afterAll(() => {
  if (registered) BUILTIN_SYSTEMS[slot] = registered;
  else BUILTIN_SYSTEMS.splice(BUILTIN_SYSTEMS.indexOf(FR), 1);
});

function frStory(): StoryData {
  return mockStory({
    diceMode: "manual",
    systemState: { systemId: "fantastic-realms", sessionCount: 0, dedupKeys: [] },
  });
}

type Call = [string, Record<string, unknown>];

async function chain(story: StoryData, calls: Call[]) {
  let s = story;
  const results = [];
  for (const [name, args] of calls) {
    const out = await run(s, name, args);
    s = out.story;
    results.push(out.result);
  }
  return { story: s, results };
}

const feats = (hero: string, list: string[]): Call[] =>
  list.map((feat) => ["manage_feats", { hero, action: "add", feat }]);
const heroSet = (owner: string): Call => [
  "manage_meter",
  { action: "create_set", owner, set: "Fantastic Realms hero", reason: "x" },
];
const hurt = (owner: string, by: number): Call => [
  "manage_meter",
  { action: "adjust", owner, meter: "Hearts", by, reason: "x" },
];

/** Bryn (Brave, Quick, Sword, Armor) and Mira (Healer, Lantern), each with hearts. */
async function party(): Promise<StoryData> {
  return (
    await chain(frStory(), [
      heroSet("Bryn"),
      heroSet("Mira"),
      ...feats("Bryn", ["Brave", "Quick", "Sword", "Armor"]),
      ...feats("Mira", ["Healer", "Lantern"]),
    ])
  ).story;
}

const fr = (s: StoryData) => s.systemState!.fantasticRealms!;
const bryn = (s: StoryData) => fr(s).heroes["bryn"];
const mira = (s: StoryData) => fr(s).heroes["mira"];
const featOf = (h: { feats: HeroFeat[] }, wording: string) =>
  h.feats.find((f) => f.wording === wording)!;
const text = (r: { contextForStory: string }) => r.contextForStory;
const snapshot = (s: StoryData) => JSON.stringify({ fr: fr(s), meters: s.meters });

describe("the pure rules", () => {
  it("isDown: hearts at 0, or three conditions that are not scars", () => {
    expect(isDown(0, [])).toBe(true);
    expect(isDown(1, [])).toBe(false);
    // Unknown hearts are not zero hearts.
    expect(isDown(undefined, [])).toBe(false);
    const w = (word: string) => ({ word });
    expect(CONDITIONS_TO_BE_DOWN).toBe(3);
    expect(isDown(3, [w("a"), w("b")])).toBe(false);
    expect(isDown(3, [w("a"), w("b"), w("c")])).toBe(true);
    // Scars are not counted.
    expect(isDown(3, [w("a"), w("b"), { word: "Fear of Fire", scar: true }])).toBe(false);
    expect(isDown(3, [w("a"), w("b"), w("c"), { word: "s", scar: true }])).toBe(true);
  });

  it("featUsable: refuses a burned feat, a broken item and a lost item", () => {
    const base: HeroFeat = { id: "feat-1", wording: "Sword", burned: false };
    expect(featUsable(base)).toEqual({ ok: true });
    expect(featUsable({ ...base, burned: true })).toMatchObject({ ok: false });
    expect(featUsable({ ...base, kind: "item", status: "broken" })).toMatchObject({ ok: false });
    expect(featUsable({ ...base, kind: "item", status: "lost" })).toMatchObject({ ok: false });
  });

  it("poolSize: 1 plus feats plus a helper, minus hindrances, never below 1; a team burn adds no dice", () => {
    expect(poolSize({ feats: 3 })).toBe(4);
    expect(poolSize({ feats: 3, helped: true })).toBe(5);
    expect(poolSize({ feats: 3, helped: true, hindrances: 2 })).toBe(3);
    expect(poolSize({ feats: 1, hindrances: 5 })).toBe(1);
    expect(poolSize({ feats: 0, hindrances: 1 })).toBe(1);
    expect(poolSize({ feats: 2, teamBurn: true })).toBe(poolSize({ feats: 2 }));
  });

  it("attackDamage: Keen adds one heart on a strong hit only", () => {
    const strong = resultFor(3);
    expect(attackDamage(strong, [])).toBe(2);
    expect(attackDamage(strong, ["keen"])).toBe(3);
    expect(attackDamage(resultFor(4), ["keen"])).toBe(4);
    expect(attackDamage(resultFor(2), ["keen"])).toBe(1);
    expect(attackDamage(resultFor(0), ["keen"])).toBe(0);
    expect(attackDamage(strong, ["sturdy"])).toBe(2);
  });

  it("tallyScore: miss -1, weak hit 0, hit and strong hit +1", () => {
    expect(["miss", "weak_hit", "hit", "strong_hit"].map((t) => tallyScore(t as never))).toEqual([
      -1, 0, 1, 1,
    ]);
  });

  it("resetUses drops only the counters of that kind", () => {
    expect(resetUses({ "a:scene": 1, "b:rest": 2 }, "scene")).toEqual({ "b:rest": 2 });
    expect(resetUses({ "a:scene": 1 }, "scene")).toBeUndefined();
    expect(resetUses(undefined, "rest")).toBeUndefined();
  });
});

describe("manage_feats: items, conditions, scars and counted uses", () => {
  it("adds an item with qualities and a spell; refuses bad qualities", async () => {
    const s = await party();
    const item = await run(s, "manage_feats", {
      hero: "Bryn", action: "add", feat: "Dwarf-Forged Axe", kind: "item", qualities: ["Keen", "sturdy"],
    });
    expect(item.result.success).toBe(true);
    expect(featOf(bryn(item.story), "Dwarf-Forged Axe")).toMatchObject({
      kind: "item",
      qualities: ["keen", "sturdy"],
    });
    expect(text(item.result)).toContain("Dwarf-Forged Axe (Keen, Sturdy)");
    const spell = await run(s, "manage_feats", { hero: "Bryn", action: "add", feat: "Fireball", kind: "spell" });
    expect(featOf(bryn(spell.story), "Fireball").kind).toBe("spell");
    const bad = (extra: Record<string, unknown>) =>
      run(s, "manage_feats", { hero: "Bryn", action: "add", feat: "Thing", ...extra });
    expect((await bad({ kind: "item", qualities: ["shiny"] })).result.success).toBe(false);
    expect((await bad({ kind: "item", qualities: ["keen", "sturdy", "warded"] })).result.success).toBe(false);
    expect((await bad({ kind: "skill", qualities: ["keen"] })).result.success).toBe(false);
    expect((await bad({ kind: "gadget" })).result.success).toBe(false);
    // A plain skill keeps the old shape.
    const plain = await bad({ kind: "skill" });
    expect(featOf(bryn(plain.story), "Thing")).toEqual({ id: "feat-5", wording: "Thing", burned: false });
  });

  it("burn spends a feat without a roll, and refuses one already spent", async () => {
    const s = await party();
    const out = await run(s, "manage_feats", { hero: "Bryn", action: "burn", feat: "Sword" });
    expect(featOf(bryn(out.story), "Sword").burned).toBe(true);
    const again = await run(out.story, "manage_feats", { hero: "Bryn", action: "burn", feat: "Sword" });
    expect(again.result.success).toBe(false);
  });

  it("an item keeps its id, qualities and burn through lose then recover; mend does not un-burn", async () => {
    let s = await party();
    s = (await run(s, "manage_feats", {
      hero: "Bryn", action: "add", feat: "Lantern of Dawn", kind: "item", qualities: ["bright"],
    })).story;
    s = (await run(s, "manage_feats", { hero: "Bryn", action: "burn", feat: "Lantern of Dawn" })).story;
    const before = featOf(bryn(s), "Lantern of Dawn");
    const lost = await run(s, "manage_feats", { hero: "Bryn", action: "lose", feat: "Lantern of Dawn" });
    expect(featOf(bryn(lost.story), "Lantern of Dawn").status).toBe("lost");
    const back = await run(lost.story, "manage_feats", { hero: "Bryn", action: "recover", feat: "Lantern of Dawn" });
    expect(featOf(bryn(back.story), "Lantern of Dawn")).toEqual(before);
    // Break, then mend: the burn stays.
    const broken = await run(back.story, "manage_feats", { hero: "Bryn", action: "break", feat: "Lantern of Dawn" });
    expect(featOf(bryn(broken.story), "Lantern of Dawn").status).toBe("broken");
    const mended = await run(broken.story, "manage_feats", { hero: "Bryn", action: "mend", feat: "Lantern of Dawn" });
    const m = featOf(bryn(mended.story), "Lantern of Dawn");
    expect(m.status).toBeUndefined();
    expect(m.burned).toBe(true);
    // Wrong-state calls and non-items are refused.
    expect((await run(mended.story, "manage_feats", { hero: "Bryn", action: "mend", feat: "Lantern of Dawn" })).result.success).toBe(false);
    expect((await run(mended.story, "manage_feats", { hero: "Bryn", action: "recover", feat: "Lantern of Dawn" })).result.success).toBe(false);
    expect((await run(mended.story, "manage_feats", { hero: "Bryn", action: "break", feat: "Sword" })).result.success).toBe(false);
  });

  it("stores a condition once; Hungry carries its cure; a second add says already", async () => {
    const s = await party();
    const a = await run(s, "manage_feats", { hero: "Bryn", action: "add_condition", condition: "Wounded" });
    expect(bryn(a.story).conditions).toEqual([{ word: "Wounded" }]);
    const again = await run(a.story, "manage_feats", { hero: "Bryn", action: "add_condition", condition: "wounded!" });
    expect(again.result.success).toBe(true);
    expect(text(again.result)).toContain("already");
    expect(bryn(again.story).conditions).toHaveLength(1);
    const poison = await run(again.story, "manage_feats", {
      hero: "Bryn", action: "add_condition", condition: "Poisoned", cure: "an antidote",
    });
    expect(bryn(poison.story).conditions![1]).toEqual({ word: "Poisoned", cure: "an antidote" });
    const hungry = await run(poison.story, "manage_feats", { hero: "Bryn", action: "add_condition", condition: "Hungry" });
    expect(bryn(hungry.story).conditions![2]).toEqual({ word: "Hungry", cure: "a meal" });
    expect(text(hungry.result)).toContain("conditions: Wounded, Poisoned (needs an antidote), Hungry (needs a meal)");
  });

  it("the third condition puts a hero down, and the result says so", async () => {
    const s = (await chain(await party(), [
      ["manage_feats", { hero: "Bryn", action: "add_condition", condition: "Wounded" }],
      ["manage_feats", { hero: "Bryn", action: "add_condition", condition: "Afraid" }],
    ])).story;
    const third = await run(s, "manage_feats", { hero: "Bryn", action: "add_condition", condition: "Exhausted" });
    expect(text(third.result)).toMatch(/; down\]$/);
    const cleared = await run(third.story, "manage_feats", { hero: "Bryn", action: "clear_condition", condition: "afraid" });
    expect(text(cleared.result)).toContain("is up again");
    expect(text(cleared.result)).not.toMatch(/; down\]$/);
  });

  it("a scar is added only by a hero who is down, and never clears", async () => {
    const s = await party();
    const notDown = await run(s, "manage_feats", { hero: "Bryn", action: "add_scar", condition: "Fear of Fire" });
    expect(notDown.result.success).toBe(false);
    const down = (await run(s, ...hurt("Bryn", -3))).story;
    const scarred = await run(down, "manage_feats", { hero: "Bryn", action: "add_scar", condition: "Fear of Fire" });
    expect(scarred.result.success).toBe(true);
    expect(bryn(scarred.story).conditions).toEqual([{ word: "Fear of Fire", scar: true }]);
    const clear = await run(scarred.story, "manage_feats", { hero: "Bryn", action: "clear_condition", condition: "Fear of Fire" });
    expect(clear.result.success).toBe(false);
    expect(text(clear.result)).toContain("scar");
    // A rest keeps it too.
    const rested = await run(scarred.story, "take_rest", {});
    expect(bryn(rested.story).conditions).toEqual([{ word: "Fear of Fire", scar: true }]);
    // At a level it becomes the level's feat.
    const feat = await run(rested.story, "manage_feats", {
      hero: "Bryn", action: "scar_to_feat", condition: "fear of fire", new_wording: "Fireproof",
    });
    expect(feat.result.success).toBe(true);
    expect(bryn(feat.story).conditions).toBeUndefined();
    expect(featOf(bryn(feat.story), "Fireproof")).toMatchObject({ burned: false });
    // Only a scar can be turned.
    expect((await run(feat.story, "manage_feats", { hero: "Bryn", action: "scar_to_feat", condition: "Wounded", new_wording: "X" })).result.success).toBe(false);
  });

  it("use counts against a limit, and each counter resets on its own event", async () => {
    let s = await party();
    const use = (per: string, feat = "Rally", limit?: number) =>
      run(s, "manage_feats", { hero: "Bryn", action: "use", feat, per, ...(limit ? { limit } : {}) });
    let r = await use("rest");
    expect(r.result.success).toBe(true);
    s = r.story;
    r = await use("rest");
    expect(r.result.success).toBe(false);
    expect(text(r.result)).toContain("already been used 1 of 1");
    // A feat counts by its id; a limit above 1 allows more.
    s = (await use("scene", "Sword", 2)).story;
    s = (await use("scene", "Sword", 2)).story;
    expect((await use("scene", "Sword", 2)).result.success).toBe(false);
    s = (await use("adventure", "Armor")).story;
    expect(Object.keys(bryn(s).uses!).sort()).toEqual(["feat-3:limit:scene", "feat-3:scene", "feat-4:adventure", "feat-4:limit:adventure", "~rally:limit:rest", "~rally:rest"]);

    // A scene ends: only the scene counter goes.
    const scene = await run(s, "increment_scene", {});
    expect(Object.keys(bryn(scene.story).uses!).sort()).toEqual(["feat-4:adventure", "feat-4:limit:adventure", "~rally:limit:rest", "~rally:rest"]);
    // A rest ends the rest counters of the heroes who rested.
    const rest = await run(scene.story, "take_rest", {});
    expect(Object.keys(bryn(rest.story).uses!)).toEqual(["feat-4:adventure", "feat-4:limit:adventure"]);
    // The adventure ends.
    const end = await run(rest.story, "end_session", { reason: "x" });
    expect(bryn(end.story).uses).toBeUndefined();
  });

  it("uses of a broken or lost item are refused", async () => {
    let s = await party();
    s = (await run(s, "manage_feats", { hero: "Bryn", action: "add", feat: "Ward Cloak", kind: "item", qualities: ["warded"] })).story;
    s = (await run(s, "manage_feats", { hero: "Bryn", action: "break", feat: "Ward Cloak" })).story;
    const out = await run(s, "manage_feats", { hero: "Bryn", action: "use", feat: "Ward Cloak", per: "scene" });
    expect(out.result.success).toBe(false);
    expect(text(out.result)).toContain("broken");
  });

  it("party feats (hearth improvements) need no hero; their uses reset at the adventure's end", async () => {
    let s = await party();
    const add = await run(s, "manage_feats", { action: "add_party_feat", feat: "Library" });
    expect(add.result.success).toBe(true);
    s = add.story;
    expect(fr(s).partyFeats).toEqual([{ id: "party-1", wording: "Library", burned: false }]);
    expect((await run(s, "manage_feats", { action: "add_party_feat", feat: "library" })).result.success).toBe(false);
    s = (await run(s, "manage_feats", { hero: "Bryn", action: "use", feat: "Library", per: "adventure" })).story;
    expect(fr(s).partyUses).toEqual({ "party-1:adventure": 1, "party-1:limit:adventure": 1 });
    expect((await run(s, "manage_feats", { hero: "Bryn", action: "use", feat: "Library", per: "adventure" })).result.success).toBe(false);
    const end = await run(s, "end_session", { reason: "x" });
    expect(fr(end.story).partyUses).toBeUndefined();
    const removed = await run(end.story, "manage_feats", { action: "remove_party_feat", feat: "Library" });
    expect(fr(removed.story).partyFeats).toEqual([]);
    expect((await run(s, "manage_feats", { action: "remove_party_feat", feat: "Nothing" })).result.success).toBe(false);
  });

  it("a hero action still needs a hero and a feat, and an unknown action lists the new ones", async () => {
    const s = await party();
    expect(text((await run(s, "manage_feats", { action: "add", feat: "X" })).result)).toContain('needs "hero"');
    expect(text((await run(s, "manage_feats", { hero: "Bryn", action: "add" })).result)).toContain('needs "feat"');
    expect(text((await run(s, "manage_feats", { hero: "Bryn", action: "dance", feat: "X" })).result)).toContain("add_party_feat");
  });
});

describe("feat_roll: refusals write nothing", () => {
  const roll = (s: StoryData, extra: Record<string, unknown>) =>
    run(s, "feat_roll", { hero: "Bryn", feats: ["Brave"], dc: 3, reason: "x", dice: [4, 4], ...extra });

  it("every refusal leaves the state exactly as it was", async () => {
    let s = await party();
    s = (await chain(s, [
      ["manage_feats", { hero: "Bryn", action: "add_condition", condition: "Wounded" }],
      ["manage_feats", { hero: "Mira", action: "add", feat: "Cloak", kind: "item" }],
      ["manage_feats", { hero: "Mira", action: "break", feat: "Cloak" }],
    ])).story;
    const before = snapshot(s);
    const refused: Record<string, unknown>[] = [
      { help: { hero: "Bryn", feat: "Sword" } }, // own roll
      { help: { hero: "Nobody", feat: "x" } },
      { help: { hero: "Mira", feat: "Cloak" } }, // broken
      { help: { hero: "Mira", feat: "Missing" } },
      { burn: "Brave", team_burn: { hero: "Mira", feat: "Healer", own_feat: "Quick" }, dice: [4, 4] },
      { team_burn: { hero: "Bryn", feat: "Sword", own_feat: "Quick" } }, // partner is the roller
      { team_burn: { hero: "Mira", feat: "Healer", own_feat: "Nothing" } },
      { hindered_by: ["Cursed"] }, // not a condition of the roller
      { hindered_by: ["Wounded", "wounded"] }, // named twice
      { dice: [4] }, // wrong face count
    ];
    for (const extra of refused) {
      const out = await roll(s, extra);
      expect(out.result.success, JSON.stringify(extra)).toBe(false);
      expect(text(out.result), JSON.stringify(extra)).toContain("ERROR");
      expect(snapshot(out.story), JSON.stringify(extra)).toBe(before);
    }
  });

  it("a roller who is down cannot roll; neither can a down helper or partner", async () => {
    let s = await party();
    s = (await run(s, ...hurt("Mira", -3))).story;
    const helper = await run(s, "feat_roll", {
      hero: "Bryn", feats: ["Brave"], dc: 3, reason: "x", help: { hero: "Mira", feat: "Healer" }, dice: [4, 4, 4],
    });
    expect(helper.result.success).toBe(false);
    expect(text(helper.result)).toContain("Mira is down");
    const partner = await run(s, "feat_roll", {
      hero: "Bryn", feats: ["Brave"], dc: 3, reason: "x", team_burn: { hero: "Mira", feat: "Healer", own_feat: "Quick" }, dice: [4, 4],
    });
    expect(partner.result.success).toBe(false);
    const roller = await run(s, "feat_roll", { hero: "Mira", feats: ["Healer"], dc: 3, reason: "x", dice: [4, 4] });
    expect(roller.result.success).toBe(false);
    expect(text(roller.result)).toContain("is down");
    // Three conditions put a hero down as well.
    const three = (await chain(s, ["Wounded", "Afraid", "Exhausted"].map((c): Call => ["manage_feats", { hero: "Bryn", action: "add_condition", condition: c }]))).story;
    expect((await roll(three, {})).result.success).toBe(false);
  });

  it("a broken or lost item cannot be named; burn and team_burn are not both given", async () => {
    let s = await party();
    s = (await chain(s, [
      ["manage_feats", { hero: "Bryn", action: "add", feat: "Axe", kind: "item" }],
      ["manage_feats", { hero: "Bryn", action: "break", feat: "Axe" }],
    ])).story;
    const out = await roll(s, { feats: ["Axe"] });
    expect(out.result.success).toBe(false);
    expect(text(out.result)).toContain("broken");
    const both = await roll(s, { burn: "Brave", team_burn: { hero: "Mira", feat: "Healer", own_feat: "Quick" } });
    expect(text(both.result)).toContain("not both");
  });
});

describe("feat_roll: hindrances, help, team burns, magic and damage", () => {
  const roll = (s: StoryData, extra: Record<string, unknown>) =>
    run(s, "feat_roll", { hero: "Bryn", feats: ["Brave", "Sword"], dc: 3, reason: "x", ...extra });

  it("a hindrance takes a die; the pool never drops below 1", async () => {
    let s = await party();
    s = (await chain(s, [
      ["manage_feats", { hero: "Bryn", action: "add_condition", condition: "Wounded" }],
      ["manage_feats", { hero: "Bryn", action: "add_condition", condition: "Afraid" }],
    ])).story;
    const one = await roll(s, { hindered_by: ["wounded"], dice: [4, 4] });
    expect(one.result.success).toBe(true);
    expect((one.result.result as GMFeatRollResult).dice).toEqual([4, 4]);
    expect((one.result.result as GMFeatRollResult).hindrances).toEqual(["Wounded"]);
    expect(text(one.result)).toContain("2d6");
    expect(text(one.result)).toContain("Hindered: Wounded cost a die");
    // Two feats and two hindrances: one die.
    const floor = await roll(s, { feats: ["Brave"], hindered_by: ["Wounded", "Afraid"], dice: [5] });
    expect(floor.result.success).toBe(true);
    expect(text(floor.result)).toContain("1d6");
    expect(text(floor.result)).toContain("never drops below 1");
    // Faces for the old pool size are refused.
    expect((await roll(s, { hindered_by: ["Wounded"], dice: [4, 4, 4] })).result.success).toBe(false);
  });

  it("a scar can be named as a hindrance in its own situation", async () => {
    let s = await party();
    s = (await run(s, ...hurt("Bryn", -3))).story;
    s = (await run(s, "manage_feats", { hero: "Bryn", action: "add_scar", condition: "Fear of Fire" })).story;
    s = (await run(s, "take_rest", {})).story;
    const out = await roll(s, { hindered_by: ["Fear of Fire"], dice: [4, 4] });
    expect(out.result.success).toBe(true);
  });

  it("a help adds a die and names the helper; nothing of the helper is burned", async () => {
    const s = await party();
    const out = await roll(s, { feats: ["Brave"], help: { hero: "Mira", feat: "Healer" }, dice: [4, 4, 4] });
    const res = out.result.result as GMFeatRollResult;
    expect(res.helper).toEqual({ hero: "Mira", feat: "Healer" });
    expect(res.dice).toHaveLength(3);
    expect(text(out.result)).toContain("Help: Mira adds a die with \"Healer\"");
    expect(mira(out.story).feats.some((f) => f.burned)).toBe(false);
  });

  it("a team burn gives two sure successes and no dice, burns both feats and counts", async () => {
    const s = await party();
    const out = await roll(s, {
      feats: ["Brave"], team_burn: { hero: "Mira", feat: "Healer", own_feat: "Quick" }, dice: [1, 1],
    });
    const res = out.result.result as GMFeatRollResult;
    // Brave adds a die; the team burn's feats do not.
    expect(res.dice).toHaveLength(2);
    expect(res.successes).toBe(2);
    expect(res.outcome).toBe("hit");
    expect(res.teamBurn).toEqual({ hero: "Mira", feat: "Healer", ownFeat: "Quick" });
    expect(featOf(bryn(out.story), "Quick").burned).toBe(true);
    expect(featOf(mira(out.story), "Healer").burned).toBe(true);
    expect(featOf(bryn(out.story), "Brave").burned).toBe(false);
    expect(fr(out.story).teamBurnsUsed).toBe(1);
    // A strong hit still needs the dice.
    const strong = await roll(s, {
      feats: ["Brave"], team_burn: { hero: "Mira", feat: "Healer", own_feat: "Quick" }, dice: [6, 1],
    });
    expect((strong.result.result as GMFeatRollResult).outcome).toBe("strong_hit");
    // Naming the burned own feat in `feats` too does not give it a die.
    const dup = await roll(s, {
      feats: ["Brave", "Quick"], team_burn: { hero: "Mira", feat: "Healer", own_feat: "Quick" }, dice: [1, 1],
    });
    expect((dup.result.result as GMFeatRollResult).dice).toHaveLength(2);
  });

  it("the third team burn is refused; only a party rest renews them", async () => {
    let s = await party();
    const burn = (hero: string, own: string, partner: string, feat: string) =>
      run(s, "feat_roll", {
        hero, feats: [], dc: 3, reason: "x", dice: [1], team_burn: { hero: partner, feat, own_feat: own },
      });
    s = (await burn("Bryn", "Brave", "Mira", "Healer")).story;
    s = (await burn("Bryn", "Quick", "Mira", "Lantern")).story;
    expect(fr(s).teamBurnsUsed).toBe(2);
    const third = await burn("Bryn", "Sword", "Mira", "Healer");
    expect(third.result.success).toBe(false);
    // Healer is burned too, but the counter is what the message names.
    s = (await run(s, "manage_feats", { hero: "Mira", action: "add", feat: "Song" })).story;
    const third2 = await run(s, "feat_roll", {
      hero: "Bryn", feats: [], dc: 3, reason: "x", dice: [1], team_burn: { hero: "Mira", feat: "Song", own_feat: "Sword" },
    });
    expect(text(third2.result)).toContain("both team burns");
    // A partial rest leaves the counter.
    const partial = await run(s, "take_rest", { heroes: ["Bryn"] });
    expect(fr(partial.story).teamBurnsUsed).toBe(2);
    expect((partial.result.result as GMTakeRestResult).partyRest).toBe(false);
    expect(text(partial.result)).toContain("Partial rest");
    // A rest of everyone renews them.
    const full = await run(partial.story, "take_rest", {});
    expect(fr(full.story).teamBurnsUsed).toBeUndefined();
    expect((full.result.result as GMTakeRestResult).partyRest).toBe(true);
    expect(text(full.result)).toContain("Party rest");
  });

  it("a partner may be the helper with a different feat, but not the same feat", async () => {
    const s = await party();
    const same = await roll(s, {
      feats: ["Brave"], help: { hero: "Mira", feat: "Healer" },
      team_burn: { hero: "Mira", feat: "Healer", own_feat: "Quick" }, dice: [1, 1, 1],
    });
    expect(same.result.success).toBe(false);
    const other = await roll(s, {
      feats: ["Brave"], help: { hero: "Mira", feat: "Healer" },
      team_burn: { hero: "Mira", feat: "Lantern", own_feat: "Quick" }, dice: [1, 1, 1],
    });
    expect((other.result.result as GMFeatRollResult).outcome).toBe("hit");
  });

  it("a spell makes the roll magic; a miss adds the miscast line", async () => {
    let s = await party();
    s = (await run(s, "manage_feats", { hero: "Bryn", action: "add", feat: "Fireball", kind: "spell" })).story;
    const miss = await roll(s, { feats: ["Fireball"], dice: [1, 1] });
    expect((miss.result.result as GMFeatRollResult).magic).toBe(true);
    expect(text(miss.result)).toContain("Miscast: this was magic");
    expect(text(miss.result)).toContain("Cost budget: one heart or condition (two with a harm word)");
    const hit = await roll(s, { feats: ["Fireball"], dice: [6, 6] });
    expect(text(hit.result)).not.toContain("Miscast");
    expect(text(hit.result)).not.toContain("Cost budget");
    // A mundane miss has the budget line and no miscast.
    const plain = await roll(s, { feats: ["Brave"], dice: [1, 1] });
    expect((plain.result.result as GMFeatRollResult).magic).toBeUndefined();
    expect(text(plain.result)).not.toContain("Miscast");
    expect(text(plain.result)).toContain("Cost budget");
    // A weak hit carries the budget too.
    const weak = await roll(s, { feats: ["Brave"], dice: [6, 1] });
    expect(text(weak.result)).toContain("Cost budget");
  });

  it("a Keen item adds a heart on a strong hit, reported as the result's damage when a target is named", async () => {
    let s = await party();
    s = (await run(s, "manage_feats", {
      hero: "Bryn", action: "add", feat: "Keen Axe", kind: "item", qualities: ["keen"],
    })).story;
    const strong = await roll(s, { feats: ["Brave", "Keen Axe"], target: "Goblin", dice: [6, 6, 6] });
    const res = strong.result.result as GMFeatRollResult;
    expect(res.damage).toBe(3);
    expect(text(strong.result)).toContain("If this struck a foe: it loses 3 hearts (Keen +1)");
    // No target: the same line, and no damage field.
    const free = await roll(s, { feats: ["Brave", "Keen Axe"], dice: [6, 6, 6] });
    expect((free.result.result as GMFeatRollResult).damage).toBeUndefined();
    expect(text(free.result)).toContain("If this struck a foe: it loses 3 hearts (Keen +1)");
    // A hit with it: no bonus.
    const hit = await roll(s, { feats: ["Brave", "Keen Axe"], target: "Goblin", dice: [6, 6, 1] });
    expect((hit.result.result as GMFeatRollResult).damage).toBe(1);
    // A miss: none.
    const miss = await roll(s, { feats: ["Brave", "Keen Axe"], target: "Goblin", dice: [1, 1, 1] });
    expect((miss.result.result as GMFeatRollResult).damage).toBeUndefined();
  });
});

describe("the foe-damage contract reads the engine's damage", () => {
  const goblin: Meter = {
    id: "goblin::hearts", owner: "Goblin", name: "Hearts", min: 0, max: 5, cap: 5, floor: 0, value: 5,
  };
  const view = (): JudgeStoryView => ({ npcs: [], meters: [goblin], campaign: undefined });
  const keenRoll = (): JudgeToolResult => ({
    toolName: "feat_roll",
    toolCallId: "r1",
    success: true,
    contextForStory: "[Feat roll]",
    result: {
      type: "feat_roll", hero: "Ayla", feats: ["Axe"], dc: 3, dice: [6, 6, 6], successes: 3,
      outcome: "strong_hit", magnitude: 0, target: "Goblin", damage: 3,
    },
  });
  const adjust = (by: number): JudgeToolResult => ({
    toolName: "manage_meter",
    toolCallId: "m1",
    success: true,
    contextForStory: "[Meter]",
    result: {
      type: "manage_meter", action: "adjust", owner: "Goblin", meter: "Hearts",
      change: { before: 5, after: 5 + by, requested: by, clampedBy: 0, crossedUp: [], crossedDown: [], atCap: false, atFloor: false },
    },
  });
  const turn = (results: JudgeToolResult[]): Rung1Turn => ({
    storyBefore: view(), storyAfter: view(), results, prose: "", system: { eventContracts: FANTASTIC_REALMS.eventContracts },
  });

  it("passes without a flag when the Keen damage was recorded", () => {
    expect(runRung1(turn([keenRoll(), adjust(-3)]))).toEqual([]);
  });

  it("asks for the Keen heart the GM left out", () => {
    const hits = runRung1(turn([keenRoll(), adjust(-2)]));
    expect(hits).toHaveLength(1);
    expect(hits[0].reask).toContain('"by":-1');
  });
});

describe("take_rest", () => {
  it("clears conditions that name no cure; keeps cure-needing ones, scars and Hungry", async () => {
    let s = await party();
    s = (await chain(s, [
      ["manage_feats", { hero: "Bryn", action: "add_condition", condition: "Wounded" }],
      ["manage_feats", { hero: "Bryn", action: "add_condition", condition: "Poisoned", cure: "an antidote" }],
      ["manage_feats", { hero: "Bryn", action: "add_condition", condition: "Hungry" }],
    ])).story;
    const out = await run(s, "take_rest", {});
    expect(bryn(out.story).conditions).toEqual([
      { word: "Poisoned", cure: "an antidote" },
      { word: "Hungry", cure: "a meal" },
    ]);
    expect(text(out.result)).toContain("Bryn cleared Wounded; kept Poisoned (needs an antidote), Hungry (needs a meal)");
    // A hand-set Hungry with no cure stays too.
    const hand = structuredClone(s);
    fr(hand).heroes["bryn"].conditions = [{ word: "Hungry" }];
    const kept = await run(hand, "take_rest", {});
    expect(bryn(kept.story).conditions).toEqual([{ word: "Hungry" }]);
  });

  it("lifts a hero who was down at 0 hearts, and says so when three cure-needing conditions keep one down", async () => {
    let s = await party();
    s = (await run(s, ...hurt("Bryn", -3))).story;
    const lifted = await run(s, "take_rest", {});
    expect(text(lifted.result)).not.toContain("Still down");
    const stuck = (await chain(await party(), ["A", "B", "C"].map((c): Call => ["manage_feats", { hero: "Bryn", action: "add_condition", condition: c, cure: "a priest" }]))).story;
    const out = await run(stuck, "take_rest", {});
    expect(text(out.result)).toContain("Still down");
    expect(text(out.result)).toContain("Bryn");
  });

  it("a hero rested alone leaves the others' rest counters", async () => {
    let s = await party();
    s = (await run(s, "manage_feats", { hero: "Mira", action: "use", feat: "Prayer", per: "rest" })).story;
    s = (await run(s, "manage_feats", { hero: "Bryn", action: "use", feat: "Rally", per: "rest" })).story;
    const out = await run(s, "take_rest", { heroes: ["Bryn"] });
    expect(bryn(out.story).uses).toBeUndefined();
    expect(mira(out.story).uses).toEqual({ "~prayer:rest": 1, "~prayer:limit:rest": 1 });
  });
});

describe("initiative_roll", () => {
  it("refuses a burned, broken or lost edge feat, and a hero who is down", async () => {
    let s = await party();
    s = (await chain(s, [
      ["manage_feats", { hero: "Bryn", action: "add", feat: "Boots", kind: "item" }],
      ["manage_feats", { hero: "Bryn", action: "break", feat: "Boots" }],
    ])).story;
    const broken = await run(s, "initiative_roll", { heroes: [{ hero: "Bryn", edge_feats: ["Boots"] }], dice: [3] });
    expect(broken.result.success).toBe(false);
    expect(text(broken.result)).toContain("broken");
    const down = (await run(s, ...hurt("Mira", -3))).story;
    const out = await run(down, "initiative_roll", { heroes: [{ hero: "Mira" }], dice: [3] });
    expect(out.result.success).toBe(false);
    expect(text(out.result)).toContain("down");
  });

  it("a usable Swift item counts as an edge on its own, once", async () => {
    let s = await party();
    s = (await run(s, "manage_feats", { hero: "Bryn", action: "add", feat: "Winged Boots", kind: "item", qualities: ["swift"] })).story;
    const plain = await run(s, "initiative_roll", { heroes: [{ hero: "Bryn" }], dice: [3] });
    expect(text(plain.result)).toContain("Bryn 4 (d6 3 + 1 for Winged Boots)");
    const named = await run(s, "initiative_roll", { heroes: [{ hero: "Bryn", edge_feats: ["Winged Boots", "Quick"] }], dice: [3] });
    expect(text(named.result)).toContain("Bryn 5 (d6 3 + 2 for Winged Boots, Quick)");
    // Broken, it does not count.
    s = (await run(s, "manage_feats", { hero: "Bryn", action: "break", feat: "Winged Boots" })).story;
    const broken = await run(s, "initiative_roll", { heroes: [{ hero: "Bryn" }], dice: [3] });
    expect(text(broken.result)).toContain("Bryn 3 (d6 3)");
  });
});

describe("record_challenge_result: hit", () => {
  const journey = (s: StoryData) =>
    run(s, "start_challenge", {
      name: "The Long Road", description: "x", mode: "tally", rounds: 3, primary_stat: "Nerve", difficulty: "hard",
    });

  it("is scored +1 in Fantastic Realms, in a tally; the error names hit there", async () => {
    let s = (await journey(frStory())).story;
    const hit = await run(s, "record_challenge_result", { outcome: "hit", description: "the ford" });
    expect(hit.result.success).toBe(true);
    expect(hit.story.activeChallenge!.tally).toBe(1);
    expect(text(hit.result)).toContain("HIT");
    s = hit.story;
    const weak = await run(s, "record_challenge_result", { outcome: "weak_hit", description: "the fog" });
    expect(weak.story.activeChallenge!.tally).toBe(1);
    const bad = await run(s, "record_challenge_result", { outcome: "success", description: "x" });
    expect(text(bad.result)).toContain("strong_hit, hit, weak_hit or miss");
  });

  it("is an error in any other story, without naming hit as an option", async () => {
    // Another system that scores a tally (the system tools on, no feat_roll).
    const plain = mockStory({ systemState: { usesSystemTools: true, sessionCount: 0, dedupKeys: [] } });
    const s = (await journey(plain)).story;
    const out = await run(s, "record_challenge_result", { outcome: "hit", description: "x" });
    expect(out.result.success).toBe(false);
    expect(text(out.result)).toContain("ERROR");
    expect(text(out.result)).toContain("strong_hit, weak_hit or miss");
    expect(out.story.activeChallenge!.tally ?? 0).toBe(0);
    expect(out.story.activeChallenge!.recorded ?? 0).toBe(0);
  });

  it("in a first_to challenge a hit is a success, in Fantastic Realms only", async () => {
    const start = (s: StoryData) =>
      run(s, "start_challenge", {
        name: "The Bridge", description: "x", required_successes: 2, max_failures: 2, primary_stat: "Nerve", difficulty: "hard",
      });
    const s = (await start(frStory())).story;
    const out = await run(s, "record_challenge_result", { outcome: "hit", description: "x" });
    expect(out.result.success).toBe(true);
    const other = (await start(mockStory({ systemState: { usesSystemTools: true, sessionCount: 0, dedupKeys: [] } }))).story;
    expect((await run(other, "record_challenge_result", { outcome: "hit", description: "x" })).result.success).toBe(false);
  });
});

describe("the Supplies set", () => {
  it("is made by create_set for the world: 0 to 6, starting at 3", async () => {
    const out = await run(frStory(), "manage_meter", {
      action: "create_set", owner: "world", set: "Fantastic Realms party", reason: "the road",
    });
    expect(out.result.success).toBe(true);
    const supplies = out.story.meters!.find((m) => m.name === "Supplies")!;
    expect([supplies.owner, supplies.min, supplies.max, supplies.value]).toEqual(["world", 0, 6, 3]);
  });
});

describe("the heroes' line in the live block", () => {
  it("shows qualities, status, conditions, scars, DOWN and the party line", async () => {
    let s = await party();
    s = (await chain(s, [
      ["manage_feats", { hero: "Bryn", action: "add", feat: "Axe", kind: "item", qualities: ["keen", "sturdy"] }],
      ["manage_feats", { hero: "Bryn", action: "break", feat: "Axe" }],
      ["manage_feats", { hero: "Bryn", action: "add_condition", condition: "Wounded" }],
      hurt("Bryn", -3),
      ["manage_feats", { hero: "Bryn", action: "add_scar", condition: "Fear of Fire" }],
      ["manage_feats", { action: "add_party_feat", feat: "Library" }],
      ["manage_feats", { action: "add_party_feat", feat: "Stables" }],
    ])).story;
    const out = formatHeroFeatsState(s);
    expect(out).toContain("Bryn — feats: Brave, Quick, Sword, Armor, Axe (Keen, Sturdy, broken); conditions: Wounded; scars: Fear of Fire; DOWN");
    expect(out).toContain("Mira — feats: Healer, Lantern");
    expect(out).not.toContain("Mira — feats: Healer, Lantern;");
    expect(out).toContain("Party: Library, Stables; team burns left 2 of 2");
  });

  it("a story with none of the new state reads exactly as before", async () => {
    const s = await party();
    expect(formatHeroFeatsState(s)).toBe(
      "## 🛡️ HEROES' FEATS\nBryn — feats: Brave, Quick, Sword, Armor\nMira — feats: Healer, Lantern",
    );
  });
});

describe("engine review fixes", () => {
  it("retire takes a hero out of the party rest, default selections, rolls and the hero line; rejoin undoes it", async () => {
    let s = await party();
    const burn = (hero: string, own: string, partner: string, feat: string) =>
      run(s, "feat_roll", { hero, feats: [], dc: 3, reason: "x", dice: [1], team_burn: { hero: partner, feat, own_feat: own } });
    s = (await burn("Bryn", "Brave", "Mira", "Healer")).story;
    expect(fr(s).teamBurnsUsed).toBe(1);
    const retired = await run(s, "manage_feats", { hero: "Mira", action: "retire" });
    expect(retired.result.success).toBe(true);
    s = retired.story;
    expect(mira(s).retired).toBe(true);
    expect((await run(s, "manage_feats", { hero: "Mira", action: "retire" })).result.success).toBe(false);
    // A rest of everyone still in the party is a party rest.
    const rest = await run(s, "take_rest", {});
    expect((rest.result.result as GMTakeRestResult).partyRest).toBe(true);
    expect(fr(rest.story).teamBurnsUsed).toBeUndefined();
    expect(rest.story.meters!.find((m) => m.owner === "Mira" && m.name === "Hearts")!.value).toBe(3);
    // Awards skip them by default, and naming them is refused.
    const xp = await run(s, "award_xp", { amount: 100, source: "goblins" });
    expect((xp.result.result as { credited: string[] }).credited).toEqual(["Bryn"]);
    expect((await run(s, "award_xp", { amount: 100, source: "x", heroes: ["Mira"] })).result.success).toBe(false);
    // They cannot roll, help or be a partner, and are not on the hero line.
    expect((await run(s, "feat_roll", { hero: "Mira", feats: [], dc: 3, reason: "x", dice: [4] })).result.success).toBe(false);
    expect((await run(s, "feat_roll", { hero: "Bryn", feats: [], dc: 3, reason: "x", dice: [4, 4], help: { hero: "Mira", feat: "Lantern" } })).result.success).toBe(false);
    expect(formatHeroFeatsState(s)).not.toContain("Mira");
    // Back in.
    const back = await run(s, "manage_feats", { hero: "Mira", action: "rejoin" });
    expect(mira(back.story).retired).toBeUndefined();
    expect(formatHeroFeatsState(back.story)).toContain("Mira");
    expect((await run(back.story, "manage_feats", { hero: "Mira", action: "rejoin" })).result.success).toBe(false);
  });

  it("a partial rest names who did not rest", async () => {
    const s = await party();
    const out = await run(s, "take_rest", { heroes: ["Bryn"] });
    expect(text(out.result)).toContain("Mira did not rest");
  });

  it("a condition or scar for a name with no hero record is refused and creates nothing", async () => {
    const s = await party();
    for (const action of ["add_condition", "add_scar"]) {
      const out = await run(s, "manage_feats", { hero: "Goblin", action, condition: "Frightened" });
      expect(out.result.success, action).toBe(false);
      expect(fr(out.story).heroes["goblin"]).toBeUndefined();
    }
  });

  it("Keen on a team-burned item gives the same damage whether or not it was also in feats", async () => {
    let s = await party();
    s = (await run(s, "manage_feats", { hero: "Bryn", action: "add", feat: "Keen Axe", kind: "item", qualities: ["keen"] })).story;
    const swing = (feats: string[]) =>
      run(s, "feat_roll", {
        hero: "Bryn", feats, dc: 3, reason: "x", target: "Goblin", dice: [6, 1],
        team_burn: { hero: "Mira", feat: "Healer", own_feat: "Keen Axe" },
      });
    const listed = await swing(["Brave", "Keen Axe"]);
    const unlisted = await swing(["Brave"]);
    expect((listed.result.result as GMFeatRollResult).damage).toBe(3);
    expect((unlisted.result.result as GMFeatRollResult).damage).toBe(3);
  });

  it("Down reads the Hearts meter the way the executors do, a hand-made lower-case one included", async () => {
    const s = (await chain(frStory(), feats("Bryn", ["Brave"]))).story;
    s.meters = [
      { id: "bryn::hearts", owner: "Bryn", name: "hearts", min: 0, max: 3, cap: 3, floor: 0, value: 0 },
    ] as Meter[];
    expect(formatHeroFeatsState(s)).toContain("DOWN");
    expect(html(s)).toContain("Down");
    expect((await run(s, "feat_roll", { hero: "Bryn", feats: [], dc: 3, reason: "x", dice: [4] })).result.success).toBe(false);
  });

  it("removing a feat drops its counters, so a reused id starts clean", async () => {
    let s = await party();
    s = (await run(s, "manage_feats", { hero: "Bryn", action: "use", feat: "Armor", per: "rest" })).story;
    expect(bryn(s).uses).toBeDefined();
    s = (await run(s, "manage_feats", { hero: "Bryn", action: "remove", feat: "Armor" })).story;
    expect(bryn(s).uses).toBeUndefined();
    s = (await run(s, "manage_feats", { hero: "Bryn", action: "add", feat: "Shield" })).story;
    expect(featOf(bryn(s), "Shield").id).toBe("feat-4");
    expect((await run(s, "manage_feats", { hero: "Bryn", action: "use", feat: "Shield", per: "rest" })).result.success).toBe(true);
  });

  it("the first use fixes the limit; a different one is refused until the counter resets", async () => {
    let s = await party();
    const use = (limit?: number) =>
      run(s, "manage_feats", { hero: "Bryn", action: "use", feat: "Rally", per: "scene", ...(limit ? { limit } : {}) });
    s = (await use(2)).story;
    const bigger = await use(5);
    expect(bigger.result.success).toBe(false);
    expect(text(bigger.result)).toContain("counted at 2 per scene");
    // Omitting it uses the stored one.
    s = (await use()).story;
    const full = await use();
    expect(text(full.result)).toContain("already been used 2 of 2");
    // After the scene ends it may be chosen again.
    s = (await run(s, "increment_scene", {})).story;
    expect((await use(5)).result.success).toBe(true);
  });
});

const htmlOf = (s: StoryData) =>
  renderToStaticMarkup(createElement(MetersPanel, { meters: s.meters, heroFeats: fr(s).heroes }));
const html = htmlOf;

describe("the Meters panel", () => {
  const html = (s: StoryData) =>
    renderToStaticMarkup(
      createElement(MetersPanel, { meters: s.meters, heroFeats: fr(s).heroes }),
    );

  it("shows condition chips, scars, a struck-through broken item, hides a lost one and badges Down", async () => {
    let s = await party();
    s = (await chain(s, [
      ["manage_feats", { hero: "Bryn", action: "add", feat: "Broken Axe", kind: "item", qualities: ["keen"] }],
      ["manage_feats", { hero: "Bryn", action: "break", feat: "Broken Axe" }],
      ["manage_feats", { hero: "Bryn", action: "add", feat: "Stolen Ring", kind: "item" }],
      ["manage_feats", { hero: "Bryn", action: "lose", feat: "Stolen Ring" }],
      ["manage_feats", { hero: "Bryn", action: "add_condition", condition: "Poisoned", cure: "an antidote" }],
      hurt("Bryn", -3),
      ["manage_feats", { hero: "Bryn", action: "add_scar", condition: "Fear of Fire" }],
    ])).story;
    const out = html(s);
    expect(out).toContain("Down");
    expect(out).toContain("Poisoned");
    expect(out).toContain("Needs an antidote");
    expect(out).toContain("Fear of Fire");
    expect(out).toContain("(scar)");
    expect(out).toMatch(/line-through text-ys-danger[^>]*>Broken Axe/);
    expect(out).toContain("(Keen)");
    expect(out).not.toContain("Stolen Ring");
    // Mira, up and unmarked, gets no badge and no condition list.
    const miraOnly = html({ ...s, meters: s.meters!.filter((m) => m.owner === "Mira") } as StoryData);
    expect(miraOnly).not.toContain("Down");
  });

  it("is unchanged for a hero with only plain feats", async () => {
    const out = html(await party());
    expect(out).toContain("Brave");
    expect(out).not.toContain("Down");
    expect(out).not.toContain('aria-label="Conditions"');
  });
});

describe("a Fantastic Realms story saved before this slice rolls exactly as before", () => {
  it("keeps its pool, its dice, its text and its state shape", async () => {
    // The state exactly as the base system wrote it: no kind, no conditions, no counters.
    const old = frStory();
    old.systemState!.fantasticRealms = {
      heroes: {
        bryn: {
          name: "Bryn",
          rewards: [],
          feats: [
            { id: "feat-1", wording: "Brave", burned: false },
            { id: "feat-2", wording: "Sword", burned: false },
            { id: "feat-3", wording: "Armor", burned: true },
          ],
        },
      },
      realm: "meadow",
    };
    const out = await run(old, "feat_roll", {
      hero: "Bryn", feats: ["Brave", "Sword"], dc: 3, burn: "Sword", reason: "Strike the goblin", target: "Goblin", dice: [5, 2, 3],
    });
    expect(out.result.success).toBe(true);
    expect(out.result.result).toEqual({
      type: "feat_roll",
      hero: "Bryn",
      feats: ["Brave", "Sword"],
      burned: "Sword",
      dc: 3,
      dice: [5, 2, 3],
      successes: 3,
      outcome: "strong_hit",
      magnitude: 0,
      target: "Goblin",
      damage: 2,
    });
    expect(text(out.result)).toBe(
      "[Feat roll - Bryn (Brave, Sword) DC 3: 3d6 [5, 2, 3] → 2 successes + burned Sword (1 sure success) = 3 → STRONG HIT]\n" +
        "[Burned: Sword adds nothing until a rest]\n" +
        "[If this struck a foe: it loses 2 hearts]\n" +
        "[Reason: Strike the goblin]",
    );
    // The burn is the only change to the state; no new field appears.
    expect(fr(out.story)).toEqual({
      heroes: {
        bryn: {
          name: "Bryn",
          rewards: [],
          feats: [
            { id: "feat-1", wording: "Brave", burned: false },
            { id: "feat-2", wording: "Sword", burned: true },
            { id: "feat-3", wording: "Armor", burned: true },
          ],
        },
      },
      realm: "meadow",
    });
    // A rest still un-burns and keeps the shape clean.
    const rested = await run(out.story, "take_rest", {});
    expect(bryn(rested.story)).toEqual({
      name: "Bryn",
      rewards: [],
      feats: [
        { id: "feat-1", wording: "Brave", burned: false },
        { id: "feat-2", wording: "Sword", burned: false },
        { id: "feat-3", wording: "Armor", burned: false },
      ],
    });
    expect(text(rested.result)).toContain("Every heart is healed");
    expect(formatHeroFeatsState(out.story)).toBe(
      "## 🛡️ HEROES' FEATS\nBryn — feats: Brave, Sword (burned), Armor (burned)\nRealm: meadow",
    );
  });

  it("the other rolls are unchanged: a miss, a hit with no target", async () => {
    const old = frStory();
    old.systemState!.fantasticRealms = {
      heroes: { bryn: { name: "Bryn", rewards: [], feats: [{ id: "feat-1", wording: "Brave", burned: false }] } },
    };
    const miss = await run(old, "feat_roll", { hero: "Bryn", feats: ["Brave"], dc: 4, reason: "x", dice: [1, 2] });
    expect(text(miss.result)).toContain("→ 0 successes → MISS]");
    const hit = await run(old, "feat_roll", { hero: "Bryn", feats: ["Brave"], dc: 4, reason: "x", dice: [6, 5] });
    expect(text(hit.result)).toContain("[If this struck a foe: it loses 1 heart]");
    expect((hit.result.result as GMFeatRollResult).damage).toBeUndefined();
  });
});
