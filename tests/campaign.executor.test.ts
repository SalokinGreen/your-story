import { beforeEach, describe, expect, it, vi } from "vitest";
import { executeCampaign } from "@/app/misc/campaign/executor";
import { validatePart, type ValidationContext } from "@/app/misc/campaign/validate";
import type { CampaignParams } from "@/app/misc/gmTools";
import type { StoryData } from "@/app/misc/structs";
import { clock, drownedKingStory, front, record, stubUuids, story } from "./helpers/campaignFixtures";

beforeEach(() => {
  vi.restoreAllMocks();
  stubUuids();
});

function call(s: StoryData, p: CampaignParams) {
  const r = executeCampaign("c", p, s);
  return r;
}
const msg = (r: ReturnType<typeof call>) => r.contextForStory;

function fresh() {
  return story({
    npcs: [{ id: "npc-1", name: "Callum" }] as unknown as StoryData["npcs"],
    threads: [{ id: "thr-1", title: "The mill" }] as unknown as StoryData["threads"],
  });
}

describe("read", () => {
  it("says there is no record yet, without creating one", () => {
    const s = story();
    const r = call(s, { action: "read" });
    expect(r.success).toBe(true);
    expect(msg(r)).toContain("No campaign record yet");
    expect(s.campaign).toBeUndefined();
  });

  it("answers an empty part with its data shape", () => {
    const s = story({ campaign: record() });
    expect(msg(call(s, { action: "read", part: "faction" }))).toContain('"name", "goal"');
    expect(msg(call(s, { action: "read", part: "clock" }))).toContain("4|6|8");
  });

  it("reads a part, one item, and an overview", () => {
    const s = drownedKingStory();
    expect(msg(call(s, { action: "read", part: "front" }))).toContain("The Drowned King");
    expect(msg(call(s, { action: "read", part: "clock", id: "clk_a" }))).toContain("The barrow wakes");
    expect(msg(call(s, { action: "read" }))).toContain("clock: 1");
  });

  it("refuses an unknown part and an unknown id", () => {
    const s = drownedKingStory();
    expect(msg(call(s, { action: "read", part: "dragon" }))).toContain("Unknown part");
    const r = call(s, { action: "read", part: "front", id: "frt_zzz" });
    expect(r.success).toBe(false);
    expect(msg(r)).toContain("Valid ids: frt_a");
  });
});

describe("add", () => {
  it("creates the record on the first write, with the style", () => {
    const s = fresh();
    const r = call(s, { action: "add", part: "style", data: { style: "mystery" } });
    expect(r.success).toBe(true);
    expect(s.campaign).toMatchObject({ version: 1, style: "mystery" });
  });

  it("migrates timers into the record it creates", () => {
    const s = fresh();
    s.timers = [{ id: "t1", name: "Doom", totalTicks: 4, currentTicks: 1, autoAdvance: false, status: "active", visibility: "visible", createdAt: 1 }];
    call(s, { action: "add", part: "style", data: { style: "sandbox" } });
    expect(s.campaign!.clocks.map((c) => c.id)).toEqual(["t1"]);
    expect(s.campaign!.origin).toBeUndefined();
  });

  it("leaves no record behind when the first write is refused", () => {
    const s = fresh();
    const r = call(s, { action: "add", part: "faction", data: { name: "Guild" } });
    expect(r.success).toBe(false);
    expect(s.campaign).toBeUndefined();
  });

  it("names the exact repair for each part", () => {
    const s = story({ campaign: record() });
    const err = (part: string, data: Record<string, unknown>) => msg(call(s, { action: "add", part, data }));
    expect(err("faction", { name: "Guild" })).toBe("[ERROR: faction needs `goal`]");
    expect(err("faction", { goal: "x" })).toBe("[ERROR: faction needs `name`]");
    expect(err("clock", { name: "C", segments: 5 })).toContain("clock `segments` must be 4, 6 or 8 for a new clock");
    expect(err("clock", { name: "C", segments: 6, triggers: ["often"] })).toContain('clock trigger "often"');
    expect(err("front", { name: "F" })).toContain("front needs `doom`");
    expect(err("front", { name: "F", doom: "d", dangers: [{ name: "x" }] })).toContain('front danger "x" needs `impulse`');
    expect(err("secret", { title: "S" })).toContain("secret needs `truth`");
    expect(err("pitch", { premise: "p" })).toContain("pitch needs `tone`");
    expect(err("style", { style: "epic" })).toContain("style needs `style`, one of");
    expect(err("end_state", {})).toContain("end_state needs `text`");
    expect(err("location", { features: [] })).toContain("location needs `name`");
  });

  it("rejects an unknown person's NPC and lists the valid ids", () => {
    const s = fresh();
    s.campaign = record();
    const r = call(s, { action: "add", part: "person", data: { npcId: "npc-9", want: "x" } });
    expect(r.success).toBe(false);
    expect(msg(r)).toContain("Valid ids: npc-1 (Callum)");
    expect(call(s, { action: "add", part: "person", data: { npc: "callum", want: "to leave" } }).success).toBe(true);
    expect(s.campaign.people[0]).toMatchObject({ npcId: "npc-1", want: "to leave" });
    expect(msg(call(s, { action: "add", part: "person", data: { npcId: "npc-1", want: "again" } }))).toContain("already has an entry");
  });

  it("adds a front, then a clock linked to it, and both sides point at each other", () => {
    const s = story({ campaign: record({ style: "mystery" }) });
    const f = call(s, { action: "add", part: "front", data: { name: "The Drowned King", doom: "the drowned walk", portents: ["a", "b"], dangers: [{ name: "Hollin", impulse: "his river" }] } });
    expect(f.success).toBe(true);
    const fid = s.campaign!.fronts[0].id;
    expect(fid).toMatch(/^frt_/);
    const c = call(s, { action: "add", part: "clock", data: { name: "The barrow wakes", segments: 6, triggers: ["scene", "miss"], link: { kind: "front", id: fid } } });
    expect(c.success).toBe(true);
    const clk = s.campaign!.clocks[0];
    expect(clk.id).toMatch(/^clk_/);
    expect(clk.visible).toBe(false); // mystery default
    expect(s.campaign!.fronts[0].clockId).toBe(clk.id);
  });

  it("rejects a clock link to an unknown front with the valid ids", () => {
    const s = drownedKingStory();
    const r = call(s, { action: "add", part: "clock", data: { name: "X", segments: 4, link: { kind: "front", id: "frt_nope" } } });
    expect(msg(r)).toContain('unknown front id "frt_nope". Valid ids: frt_a (The Drowned King)');
  });

  it("adds a secret with clues, each with an id, none found", () => {
    const s = story({ campaign: record() });
    call(s, { action: "add", part: "secret", data: { title: "Who drowned him", truth: "Runa", clues: ["a muddy glove", { text: "a torn page", where: "the study" }] } });
    const sec = s.campaign!.secrets[0];
    expect(sec.id).toMatch(/^sec_/);
    expect(sec.clues.map((c) => c.found)).toEqual([false, false]);
    expect(new Set(sec.clues.map((c) => c.id)).size).toBe(2);
    expect(sec.clues[0].id).toMatch(/^clu_/);
  });

  it("adds factions, locations, end states and safety, with their prefixes", () => {
    const s = story({ campaign: record() });
    call(s, { action: "add", part: "faction", data: { name: "Guild", goal: "own the river" } });
    call(s, { action: "add", part: "location", data: { name: "The mill", features: ["a", "b", "c"] } });
    call(s, { action: "add", part: "end_state", data: { text: "The river is freed" } });
    call(s, { action: "add", part: "safety", data: { lines: [{ text: "no harm to children", keywords: ["child"] }], veils: ["torture"] } });
    expect(s.campaign!.factions[0].id).toMatch(/^fac_/);
    expect(s.campaign!.locations[0].id).toMatch(/^loc_/);
    expect(s.campaign!.endStates[0].id).toMatch(/^end_/);
    expect(s.campaign!.safety!.lines[0]).toMatchObject({ text: "no harm to children", keywords: ["child"] });
    expect(s.campaign!.safety!.veils[0].text).toBe("torture");
  });

  it("adds beats only for the adventure path", () => {
    const s = story({ campaign: record({ style: "mystery" }) });
    expect(msg(call(s, { action: "add", part: "beat", data: { title: "t", summary: "s" } }))).toContain("adventure_path");
    call(s, { action: "edit", part: "style", data: { style: "adventure_path" } });
    expect(call(s, { action: "add", part: "beat", data: { title: "Opening", summary: "s" } }).success).toBe(true);
    expect(s.campaign!.beats!.currentId).toBe(s.campaign!.beats!.list[0].id);
  });
});

describe("edit", () => {
  it("changes a field and keeps the rest", () => {
    const s = drownedKingStory();
    const r = call(s, { action: "edit", part: "front", id: "frt_a", data: { doom: "the river takes the village" } });
    expect(r.success).toBe(true);
    expect(s.campaign!.fronts[0]).toMatchObject({ doom: "the river takes the village", name: "The Drowned King", clockId: "clk_a" });
  });

  it("finds a part by name as well as by id", () => {
    const s = drownedKingStory();
    expect(call(s, { action: "edit", part: "clock", id: "the barrow wakes", data: { onFill: "x" } }).success).toBe(true);
    expect(s.campaign!.clocks[0].onFill).toBe("x");
  });

  it("an edit of a migrated clock's capacity is allowed, a new clock's is not", () => {
    const s = drownedKingStory();
    s.campaign!.clocks[0].segments = 11;
    expect(call(s, { action: "edit", part: "clock", id: "clk_a", data: { name: "Renamed" } }).success).toBe(true);
    expect(s.campaign!.clocks[0].segments).toBe(11);
  });

  it("rejects unknown ids with the valid ones, and edit without id", () => {
    const s = drownedKingStory();
    expect(msg(call(s, { action: "edit", part: "front", id: "frt_x", data: { doom: "d" } }))).toContain("Valid ids: frt_a (The Drowned King)");
    expect(msg(call(s, { action: "edit", part: "front", data: { doom: "d" } }))).toContain("edit front needs `id`");
  });

  it("will not edit a secret's clues or revealed flag", () => {
    const s = story({ campaign: record() });
    call(s, { action: "add", part: "secret", data: { title: "S", truth: "t", clues: ["a"] } });
    const id = s.campaign!.secrets[0].id;
    expect(msg(call(s, { action: "edit", part: "secret", id, data: { revealed: true } }))).toContain("reveal_secret");
    expect(call(s, { action: "edit", part: "secret", id, data: { truth: "new" } }).success).toBe(true);
    expect(s.campaign!.secrets[0].clues).toHaveLength(1);
  });

  it("leaves the record untouched when an edit is refused", () => {
    const s = drownedKingStory();
    const before = JSON.stringify(s.campaign);
    call(s, { action: "edit", part: "front", id: "frt_a", data: { dangers: [1, 2, 3, 4] } });
    expect(JSON.stringify(s.campaign)).toBe(before);
  });
});

describe("tick, pause, resume, advance_front", () => {
  it("tick needs a reason, ticks by id or name, and reports the portent", () => {
    const s = drownedKingStory();
    expect(msg(call(s, { action: "tick", id: "clk_a" }))).toContain("needs `reason`");
    const r = call(s, { action: "tick", id: "The barrow wakes", by: 2, reason: "the dam cracks" });
    expect(r.success).toBe(true);
    expect(msg(r)).toContain("Portent reached: the river runs backwards at night");
    expect(msg(r)).toContain("GM: the dam cracks");
    expect(s.campaign!.clocks[0].filled).toBe(2);
    expect(call(s, { action: "tick", id: "clk_a", by: -1, reason: "a wound is bound" }).success).toBe(true);
    expect(s.campaign!.clocks[0].filled).toBe(1);
  });

  it("refuses a tick on a paused clock, a full one, and an unknown id", () => {
    const s = drownedKingStory();
    call(s, { action: "pause", id: "clk_a" });
    expect(msg(call(s, { action: "tick", id: "clk_a", reason: "x" }))).toContain("resume it first");
    call(s, { action: "resume", id: "clk_a" });
    s.campaign!.clocks[0].filled = 6;
    expect(msg(call(s, { action: "tick", id: "clk_a", reason: "x" }))).toContain("already full");
    expect(msg(call(s, { action: "tick", id: "clk_q", reason: "x" }))).toContain("Valid ids: clk_a (The barrow wakes)");
  });

  it("without a record, every non-read action says to start one", () => {
    const r = call(story(), { action: "tick", id: "x", reason: "y" });
    expect(r.success).toBe(false);
    expect(msg(r)).toContain("no campaign record yet");
  });

  it("advance_front ticks the front's clock, or sets a status, or says it has no clock", () => {
    const s = drownedKingStory();
    expect(call(s, { action: "advance_front", id: "frt_a", reason: "the cult digs" }).success).toBe(true);
    expect(s.campaign!.clocks[0].filled).toBe(1);
    expect(call(s, { action: "advance_front", id: "The Drowned King", data: { status: "resolved" } }).success).toBe(true);
    expect(s.campaign!.fronts[0].status).toBe("resolved");
    s.campaign!.fronts[0].clockId = undefined;
    expect(msg(call(s, { action: "advance_front", id: "frt_a", reason: "x" }))).toContain("has no clock");
  });
});

describe("secrets and clues", () => {
  function withSecret() {
    const s = story({ campaign: record() });
    call(s, { action: "add", part: "secret", data: { title: "S", truth: "t", clues: ["a", "b"] } });
    return s;
  }
  it("place_clue, find_clue and reveal_secret", () => {
    const s = withSecret();
    const sec = s.campaign!.secrets[0];
    expect(call(s, { action: "place_clue", id: sec.id, data: { text: "c", where: "attic" } }).success).toBe(true);
    expect(sec.clues).toHaveLength(3);
    const cid = sec.clues[0].id;
    const found = call(s, { action: "find_clue", id: cid });
    expect(msg(found)).toContain("1 of 3 clues found");
    expect(call(s, { action: "find_clue", id: cid }).success).toBe(false);
    expect(call(s, { action: "reveal_secret", id: "S" }).success).toBe(true);
    expect(sec.revealed).toBe(true);
    expect(call(s, { action: "reveal_secret", id: sec.id }).success).toBe(false);
  });
  it("names the valid ids for an unknown secret or clue", () => {
    const s = withSecret();
    expect(msg(call(s, { action: "reveal_secret", id: "sec_zz" }))).toContain("Valid ids: ");
    expect(msg(call(s, { action: "find_clue", id: "clu_zz" }))).toContain("Unknown clue id");
    expect(msg(call(s, { action: "place_clue", id: "S", data: {} }))).toContain("needs `data.text`");
  });
});

describe("beats", () => {
  function path() {
    const s = story({ campaign: record({ style: "adventure_path" }) });
    for (const t of ["One", "Two", "Three"]) call(s, { action: "add", part: "beat", data: { title: t, summary: `${t} happens` } });
    return s;
  }
  it("set_beat completes the current beat and sets the next, never appending", () => {
    const s = path();
    const b = s.campaign!.beats!.list;
    expect(b.map((x) => x.status)).toEqual(["current", "pending", "pending"]);
    call(s, { action: "set_beat", id: b[1].id });
    expect(b.map((x) => x.status)).toEqual(["done", "current", "pending"]);
    expect(s.campaign!.beats!.list).toHaveLength(3);
  });
  it("a side beat suspends the main beat and close restores it", () => {
    const s = path();
    const b = s.campaign!.beats!;
    const main = b.list[0].id;
    expect(call(s, { action: "open_side_beat", data: { title: "Detour", summary: "a side quest" } }).success).toBe(true);
    expect(b.suspendedId).toBe(main);
    expect(b.list[0].status).toBe("suspended");
    expect(msg(call(s, { action: "set_beat", id: b.list[1].id }))).toContain("close_side_beat first");
    expect(msg(call(s, { action: "open_side_beat", data: { title: "x", summary: "y" } }))).toContain("already open");
    expect(call(s, { action: "close_side_beat" }).success).toBe(true);
    expect(b.currentId).toBe(main);
    expect(b.list[0].status).toBe("current");
    expect(b.suspendedId).toBeUndefined();
    expect(msg(call(s, { action: "close_side_beat" }))).toContain("No side beat is open");
  });
  it("refuses beat actions on another style", () => {
    const s = story({ campaign: record({ style: "mystery" }) });
    expect(msg(call(s, { action: "set_beat", id: "x" }))).toContain("adventure_path");
  });
});

describe("validatePart", () => {
  const ctx: ValidationContext = { isNew: true, record: record(), npcs: [], threads: [], beatsAllowed: true };
  it("rejects non-objects", () => {
    expect(validatePart("faction", "x", ctx)).toEqual({ ok: false, error: "faction needs `data`, an object" });
  });
  it("accepts a clock of 4, 6 and 8 and no other new size", () => {
    for (const n of [4, 6, 8]) expect(validatePart("clock", { name: "c", segments: n }, ctx).ok).toBe(true);
    for (const n of [3, 5, 7, 10]) expect(validatePart("clock", { name: "c", segments: n }, ctx).ok).toBe(false);
    expect(validatePart("clock", { name: "c", segments: 11 }, { ...ctx, isNew: false }).ok).toBe(true);
  });
  it("front portents may be strings or {text, at}", () => {
    const r = validatePart("front", { name: "f", doom: "d", portents: ["a", { text: "b", at: 3 }] }, ctx);
    expect(r.ok && (r.value as { portents: unknown[] }).portents).toEqual([{ at: 0, text: "a" }, { at: 3, text: "b" }]);
    expect(validatePart("front", { name: "f", doom: "d", portents: [{ text: "b", at: -1 }] }, ctx).ok).toBe(false);
  });
});

describe("misc", () => {
  it("clock() fixture sanity: the executor does not need a story's timers", () => {
    expect(clock().segments).toBe(6);
    expect(front().clockId).toBe("clk_a");
  });
});
