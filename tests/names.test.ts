/**
 * Names only from tables (randomness plan R2, decision 260): the sources, the
 * rolls, the acceptance rule, the refusals in add_npc / update_npc / campaign
 * locations, generate_name, and the prose flag.
 */
import { describe, expect, it } from "vitest";
import { executeGMTools } from "@/app/misc/gmExecutor";
import { executeCampaign } from "@/app/misc/campaign/executor";
import { runRung1 } from "@/app/misc/judges/rung1";
import { isNameAccepted, newNameTurn, pushOffered, NAME_LEDGER_SIZE } from "@/app/misc/names/accept";
import {
  BUILTIN_NAME_LISTS,
  NAME_STYLES,
  OVERUSED_NAMES,
} from "@/app/misc/names/builtinLists";
import { rollNames } from "@/app/misc/names/roll";
import { nameSourcesFor } from "@/app/misc/names/sources";
import type { StoryData, StoryLore } from "@/app/misc/structs";
import { BLOOD_AND_BONE } from "@/app/misc/systems/blood-and-bone";
import { PEOPLE_NOTE } from "@/app/misc/systems/blood-and-bone/oracles/people";
import { NAMES_TABLE } from "@/app/misc/systems/fantastic-realms/world/tables";
import { parseTableNote } from "@/app/misc/tableRoll";
import { snapshotJudgeView } from "@/app/misc/judges/facts";
import { withRolledNames } from "./helpers/names";

function seeded(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function note(over: Partial<StoryLore>): StoryLore {
  return {
    title: "Note",
    content: "",
    relatedCharacters: [],
    relatedLocations: [],
    secrtet: false,
    keys: [],
    type: "lore",
    ...over,
  };
}

function builtinNote(n: { id: string; title: string; content: string }): StoryLore {
  return note({ title: n.title, content: n.content, type: "table", libraryNoteId: n.id });
}

function story(over: Record<string, unknown> = {}): StoryData {
  return {
    story_name: "S",
    premise: "",
    player_name: "",
    player_summary: "",
    scene: { parts: [] },
    lore: [],
    memory: [],
    npcs: [],
    ...over,
  } as unknown as StoryData;
}

function entriesOf(content: string, heading: string): string[] {
  const p = parseTableNote(content);
  if (!p.ok) throw new Error(p.reason);
  const t = p.tables.find((x) => x.path.join(" > ") === heading);
  if (!t) throw new Error(`no ${heading}`);
  return t.entries.map((e) => e.text);
}

const bbStory = () => story({ lore: [builtinNote(PEOPLE_NOTE)], systemState: { systemId: "blood-and-bone", sessionCount: 0, dedupKeys: [] } });

describe("name sources", () => {
  it("Blood & Bone rolls its People table's Names", () => {
    const s = bbStory();
    const sources = nameSourcesFor(s, "person");
    expect(sources).toHaveLength(1);
    expect(sources[0].compose).toEqual([["Names"]]);
    const table = new Set(entriesOf(PEOPLE_NOTE.content, "Names"));
    for (const n of rollNames(s, "person", 3, { rng: seeded(3) })) expect(table.has(n), n).toBe(true);
  });

  it("Grave Watcher composes a first name and a family name from its own note", () => {
    const gw = BLOOD_AND_BONE.starters.find((st) => st.id.includes("grave-watcher"));
    const lore = (gw?.adventure.storyTemplate?.lore ?? []) as StoryLore[];
    const namesNote = lore.find((l) => l.title === "Grave Watcher — Names");
    expect(namesNote).toBeDefined();
    const s = story({ lore, systemState: { systemId: "blood-and-bone", setting: "grave-watch", sessionCount: 0, dedupKeys: [] } });
    const first = new Set(entriesOf(namesNote!.content, "First names"));
    const family = new Set(entriesOf(namesNote!.content, "Family names"));
    const names = rollNames(s, "person", 3, { rng: seeded(5) });
    expect(names).toHaveLength(3);
    for (const n of names) {
      const [f, ...rest] = n.split(" ");
      expect(first.has(f), n).toBe(true);
      expect(family.has(rest.join(" ")), n).toBe(true);
    }
  });

  const frStory = (realm?: string) =>
    story({
      lore: [builtinNote(NAMES_TABLE)],
      systemState: {
        systemId: "fantastic-realms",
        sessionCount: 0,
        dedupKeys: [],
        ...(realm ? { fantasticRealms: { heroes: {}, realm } } : {}),
      },
    });

  it("Fantastic Realms rolls the scene's realm, the pool when none is set, the pool for a realm with no table", () => {
    const lark = new Set(entriesOf(NAMES_TABLE.content, "Larkenfell names"));
    const all = new Set([
      ...lark,
      ...entriesOf(NAMES_TABLE.content, "Aurelane names"),
      ...entriesOf(NAMES_TABLE.content, "Gloamreach names"),
    ]);
    const inRealm = rollNames(frStory("larkenfell"), "person", 3, { rng: seeded(9) });
    for (const n of inRealm) expect(lark.has(n), n).toBe(true);
    expect(nameSourcesFor(frStory(), "person")).toHaveLength(3);
    expect(nameSourcesFor(frStory("thornmere"), "person")).toHaveLength(3);
    for (const n of rollNames(frStory(), "person", 3, { rng: seeded(2) })) expect(all.has(n), n).toBe(true);
  });

  it("a story's own name table beats the system's", () => {
    const own = note({ title: "Town Names", type: "table", content: "## Names (1d2)\n1. Orrin Quill\n2. Pell Dray" });
    const s = bbStory();
    s.lore.push(own);
    expect(nameSourcesFor(s, "person")[0].tier).toBe("story");
    for (const n of rollNames(s, "person", 2, { rng: seeded(1) })) expect(["Orrin Quill", "Pell Dray"]).toContain(n);
  });

  it("falls back to the built-in lists, in the story's style, for a person and a place", () => {
    const s = story({ nameStyle: "nordic" });
    expect(nameSourcesFor(s, "person")).toEqual([]);
    const list = BUILTIN_NAME_LISTS.nordic;
    for (const n of rollNames(s, "person", 3, { rng: seeded(4) })) {
      const [g, f] = n.split(" ");
      expect(list.given).toContain(g);
      expect(list.family).toContain(f);
    }
    for (const n of rollNames(s, "place", 3, { rng: seeded(4) })) expect(list.places).toContain(n);
    // Fantastic Realms has no place table: a place uses the fallback.
    expect(nameSourcesFor(frStoryPlace(), "place")).toEqual([]);
  });

  it("skips names already in the record and never repeats one in a call", () => {
    const s = story({ npcs: [{ name: "Brannoch Dray" }], nameLedger: ["Ysmay Crane"] });
    const names = rollNames(s, "person", 25, { rng: seeded(8) });
    expect(new Set(names).size).toBe(25);
    expect(names).not.toContain("Brannoch Dray");
    expect(names).not.toContain("Ysmay Crane");
  });

  function frStoryPlace(): StoryData {
    return story({ lore: [builtinNote(NAMES_TABLE)], systemState: { systemId: "fantastic-realms", sessionCount: 0, dedupKeys: [] } });
  }
});

describe("the built-in lists", () => {
  it("are original in size, unique, and free of the names a model reaches for", () => {
    for (const style of NAME_STYLES) {
      const l = BUILTIN_NAME_LISTS[style];
      expect(l.given.length, style).toBeGreaterThanOrEqual(70);
      expect(l.family.length, style).toBeGreaterThanOrEqual(45);
      expect(l.places.length, style).toBeGreaterThanOrEqual(35);
      for (const list of [l.given, l.family, l.places]) {
        expect(new Set(list).size, style).toBe(list.length);
        for (const bad of OVERUSED_NAMES) {
          expect(list.some((n) => n.toLowerCase().split(/\s+/).includes(bad.toLowerCase())), `${style}: ${bad}`).toBe(false);
        }
      }
    }
  });
});

describe("isNameAccepted", () => {
  const base = () =>
    story({
      npcs: [{ name: "Old Hob" }],
      lore: [
        note({ title: "The mill", content: "Run by Dorrit Penn for years.", type: "lore" }),
        note({ title: "Sheet", content: "Name: Tobias Wren", type: "character_sheet" }),
        note({ title: "Names", content: "## N (1d2)\n1. Zed Aldous\n2. Quo Verity", type: "table" }),
      ],
      scene: {
        parts: [
          { content: "> I introduce myself as Calla Brisk.", imageUrl: "", user: true, role: "user" },
          {
            content: "...",
            imageUrl: "",
            user: false,
            role: "assistant",
            gmConversation: [
              {
                role: "assistant",
                content: "",
                tool_calls: [{ id: "q1", type: "function", function: { name: "ask_question", arguments: "{}" } }],
              },
              { role: "tool", tool_call_id: "q1", content: 'Q: "Your companion?" → Fenwick Marsh' },
            ],
          },
        ],
      },
    });

  it("accepts the record, a note, a sheet, a player's line and an earlier answer", () => {
    const s = base();
    for (const n of ["Old Hob", "Dorrit Penn", "Tobias Wren", "calla brisk", "Fenwick Marsh"]) {
      expect(isNameAccepted(n, s), n).toBe(true);
    }
  });

  it("does not accept a table entry, or a name nobody gave", () => {
    const s = base();
    expect(isNameAccepted("Zed Aldous", s)).toBe(false);
    expect(isNameAccepted("Brannoch Voss", s)).toBe(false);
  });

  it("does not accept a name from a note made this turn", () => {
    const s = base();
    s.lore.push(note({ title: "Fresh", content: "Meet Ottoline Spry.", type: "lore" }));
    expect(isNameAccepted("Ottoline Spry", s)).toBe(true);
    expect(isNameAccepted("Ottoline Spry", s, { notesCreatedThisTurn: ["Fresh"] })).toBe(false);
  });

  it("accepts the ledger, a rolled name with a title, and this turn's player words", () => {
    const s = base();
    pushOffered(s, ["Anka Dorn"]);
    expect(isNameAccepted("Anka Dorn", s)).toBe(true);
    expect(isNameAccepted("Captain Anka Dorn", s)).toBe(true);
    expect(isNameAccepted("Kit Rooke", s, { playerTextThisTurn: ["call him Kit Rooke"] })).toBe(true);
  });

  it("keeps the last 30 on the ledger", () => {
    const s = story();
    pushOffered(s, Array.from({ length: 40 }, (_, i) => `Name${i} Test`));
    expect(s.nameLedger).toHaveLength(NAME_LEDGER_SIZE);
    expect(s.nameLedger![0]).toBe("Name10 Test");
  });
});

const call = (name: string, args: Record<string, unknown>, id = `c-${name}`) => ({
  id,
  function: { name, arguments: JSON.stringify(args) },
});

describe("add_npc and update_npc", () => {
  const npc = (name: string) => call("add_npc", { name, description: "d", role: "r" });

  it("refuses a name that was not rolled, offers three, and accepts one of them next", async () => {
    const out = await executeGMTools([npc("Zorbo Quillfeather")], story());
    const r = out.results[0];
    expect(r.success).toBe(false);
    expect(r.contextForStory).toMatch(/That name wasn't rolled\. Use one of: [^,]+, [^,]+, [^,]+, or call generate_name\./);
    expect(out.modifiedStoryData.npcs).toHaveLength(0);
    const offered = out.modifiedStoryData.nameLedger!;
    expect(offered).toHaveLength(3);
    const again = await executeGMTools([npc(offered[0])], out.modifiedStoryData);
    expect(again.results[0].success).toBe(true);
  });

  it("accepts a name through the test helper's ledger", async () => {
    const out = await executeGMTools([npc("Zorbo Quillfeather")], withRolledNames(story(), ["Zorbo Quillfeather"]));
    expect(out.results[0].success).toBe(true);
  });

  it("refuses a rename that was not rolled, and allows one that was", async () => {
    const s = withRolledNames(story(), ["Old Hob"]);
    const added = await executeGMTools([npc("Old Hob")], s);
    expect(added.results[0].success).toBe(true);
    const bad = await executeGMTools([call("update_npc", { npc: "Old Hob", name: "Zorbo Quill" })], added.modifiedStoryData);
    expect(bad.results[0].success).toBe(false);
    expect(bad.modifiedStoryData.npcs[0].name).toBe("Old Hob");
    const good = await executeGMTools(
      [call("update_npc", { npc: "Old Hob", name: bad.modifiedStoryData.nameLedger![0] })],
      bad.modifiedStoryData,
    );
    expect(good.results[0].success).toBe(true);
  });

  it("does not take a name from a note the GM made in the same turn", async () => {
    const out = await executeGMTools(
      [
        call("create_note", { title: "Mill", content: "The miller is Ottoline Spry.", type: "lore" }),
        npc("Ottoline Spry"),
      ],
      story(),
    );
    expect(out.results[1].success).toBe(false);
    expect(out.nameTurn?.notesCreatedThisTurn).toContain("Mill");
  });

  it("carries the turn's notes across rounds", async () => {
    const first = await executeGMTools(
      [call("create_note", { title: "Mill", content: "The miller is Ottoline Spry.", type: "lore" })],
      story(),
    );
    const second = await executeGMTools([npc("Ottoline Spry")], first.modifiedStoryData, {}, {}, { nameTurn: first.nameTurn });
    expect(second.results[0].success).toBe(false);
  });

  it("accepts a name the player typed this turn, in session zero too", async () => {
    const s = story({ sessionZeroActive: true });
    const out = await executeGMTools([npc("Tobias Wren")], s, {}, {}, { nameTurn: newNameTurn(["My character is Tobias Wren"]) });
    expect(out.results[0].success).toBe(true);
  });

  it("accepts a couch co-op player's typed name (a user part) and their seat name", async () => {
    const s = story({
      sessionZeroActive: true,
      scene: { parts: [{ content: "> Mara: I am Wendeline Ash, the ferrywoman.", imageUrl: "", user: true, role: "user" }] },
      multiplayer: { enabled: true, couchPlayers: [{ id: "p2", name: "Corvin Hale" }] },
    });
    const a = await executeGMTools([npc("Wendeline Ash")], s);
    expect(a.results[0].success).toBe(true);
    const b = await executeGMTools([npc("Corvin Hale")], s);
    expect(b.results[0].success).toBe(true);
  });
});

describe("campaign locations", () => {
  const loc = (name: string) =>
    call("campaign", { action: "add", part: "location", data: { name, features: ["a bell"], npcIds: [] } });

  it("refuses an unrolled location name from the GM, and accepts a rolled one", async () => {
    const bad = await executeGMTools([loc("Zorbo's Rest")], story());
    expect(bad.results[0].success).toBe(false);
    expect(bad.results[0].contextForStory).toContain("wasn't rolled");
    const place = bad.modifiedStoryData.nameLedger![0];
    const good = await executeGMTools([loc(place)], bad.modifiedStoryData);
    expect(good.results[0].success).toBe(true);
  });

  it("refuses a rename too, but not the Designer's own writes", async () => {
    const s = withRolledNames(story(), ["Millbrook"]);
    const added = await executeGMTools([loc("Millbrook")], s);
    expect(added.results[0].success).toBe(true);
    const renamed = await executeGMTools(
      [call("campaign", { action: "edit", part: "location", id: "Millbrook", data: { name: "Zorbo's Rest", features: ["a bell"], npcIds: [] } })],
      added.modifiedStoryData,
    );
    expect(renamed.results[0].success).toBe(false);
    const designer = executeCampaign(
      "designer",
      { action: "add", part: "location", data: { name: "Zorbo's Rest", features: ["x"], npcIds: [] } } as never,
      story(),
    );
    expect(designer.success).toBe(true);
  });
});

describe("generate_name", () => {
  it("returns three names, puts them on the ledger and remembers the style once", async () => {
    const out = await executeGMTools([call("generate_name", { kind: "person", style: "nordic", reason: "a smith" })], story());
    const r = out.results[0];
    expect(r.success).toBe(true);
    const names = (r.result as { names: string[] }).names;
    expect(names).toHaveLength(3);
    expect(out.modifiedStoryData.nameLedger).toEqual(names);
    expect(out.modifiedStoryData.nameStyle).toBe("nordic");
    const again = await executeGMTools([call("generate_name", { style: "modern" })], out.modifiedStoryData);
    expect(again.modifiedStoryData.nameStyle).toBe("nordic");
    const place = await executeGMTools([call("generate_name", { kind: "place" })], story());
    expect((place.results[0].result as { kind: string }).kind).toBe("place");
  });
});

describe("the prose flag (unrolled_name)", () => {
  const turn = (prose: string, s: StoryData, extra: Partial<Record<string, unknown>> = {}) =>
    runRung1({
      storyBefore: snapshotJudgeView(s),
      storyAfter: snapshotJudgeView(s),
      results: [],
      prose,
      nameCheck: { story: s, notesCreatedThisTurn: [], playerTextThisTurn: [] },
      ...extra,
    } as never).filter((h) => h.check === "unrolled_name");

  it("flags a capitalised name mid-sentence that nothing gave, unverified and never re-asked", () => {
    const hits = turn("The ferry slid in, and old Brannoch Voss threw the line.", story());
    expect(hits).toHaveLength(1);
    expect(hits[0].verified).toBe(false);
    expect(hits[0].reask).toBeUndefined();
    expect(hits[0].evidence).toContain("Brannoch Voss");
  });

  it("stays quiet for known names, sentence starts, common words and a missing check", () => {
    const s = story({ npcs: [{ name: "Old Hob" }], nameLedger: ["Anka Dorn"] });
    expect(turn("She nodded to Hob. Then Anka walked on. \"Wait,\" said Hob. On Tuesday, I left.", s)).toHaveLength(0);
    expect(
      runRung1({
        storyBefore: snapshotJudgeView(s),
        storyAfter: snapshotJudgeView(s),
        results: [],
        prose: "He met Brannoch Voss.",
      } as never).filter((h) => h.check === "unrolled_name"),
    ).toHaveLength(0);
  });
});
