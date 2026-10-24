/**
 * Blood & Bone's AI edition (default-systems plan, slice 8): the budgets, the
 * titles, the references the core makes, the originality guard, and the core's
 * tool recipes run against the real engine.
 */
import { BLOOD_AND_BONE_KINDS } from "@/app/misc/systems/blood-and-bone/kindList";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { getEncoding } from "js-tiktoken";
import BuiltinSystemsSection from "@/app/library/BuiltinSystemsSection";
import MetersPanel from "@/app/story/MetersPanel";
import type { StoryData, StoryLore } from "@/app/misc/structs";
import {
  BUILTIN_SYSTEMS,
  builtinAdventureToLocal,
  getBuiltinNote,
  isBuiltinId,
} from "@/app/misc/systems";
import { BLOOD_AND_BONE } from "@/app/misc/systems/blood-and-bone";
import { BLOOD_AND_BONE_SHEET_TEMPLATE } from "@/app/misc/systems/blood-and-bone/sheet";
import { resolveSystem } from "@/app/misc/systems/resolve";
import { createMeterSet } from "@/app/misc/metersAndTracks";
import {
  createCharacterSheetTemplate,
  fillTemplate,
  getDefaultValues,
  validateTemplate,
} from "@/app/misc/characterSheetTemplate";
import { ensureStoryDataArrays } from "@/app/misc/storyDataDefaults";
import { mergeImportedLore } from "@/app/misc/localNotesLibraryManager";
import { libraryNoteToStoryLore } from "@/app/misc/localNotesLibraryManager";
import { builtinPackToLibraryNotes } from "@/app/misc/systems";
import { startAdventureLocally, getLocalStory } from "@/app/misc/localStoryManager";
import { GM_TOOL_MAP, GM_TOOL_NAMES } from "@/app/misc/gmTools";
import { TOOL_MAP } from "@/app/misc/toolSchemas";
import { MYTHIC_TOOLS } from "@/app/misc/mythicTools";
import {
  DM_INSTRUCTIONS_CAP_TOKENS,
  capPinnedForGM,
} from "@/app/misc/contextLimits";
import { call, mockStory, run } from "./helpers/systemsHarness";
import { checkTableShape } from "./helpers/tableShape";

const enc = getEncoding("cl100k_base");
const tokens = (s: string) => enc.encode(s).length;

const sys = BLOOD_AND_BONE;
const rules = sys.packs[0];
const europe = sys.packs[1];
const allNotes = [...rules.notes, ...europe.notes];
const starter = sys.starters[0];
const core = rules.notes.find((n) => n.title === "B&B — Core rules")!;

describe("the registry", () => {
  it("holds Blood & Bone, with two packs, one starter, a sheet and meter sets", () => {
    expect(BUILTIN_SYSTEMS).toContain(sys);
    expect(sys.packs.map((p) => p.id)).toEqual([
      "blood-and-bone:rules",
      "blood-and-bone:europe",
    ]);
    expect(sys.starters).toHaveLength(1);
    expect(sys.sheetTemplate).toBe(BLOOD_AND_BONE_SHEET_TEMPLATE);
    expect(sys.meterSets.map((s) => s.name)).toEqual([
      "Blood & Bone character",
      "Witch",
      "Wendigo",
      "City",
    ]);
    expect(sys.endOfSessionReminder).toMatch(/Reckoning/);
  });

  it("gives every note a stable built-in id that getBuiltinNote finds", () => {
    const ids = allNotes.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const n of allNotes) {
      expect(isBuiltinId(n.id)).toBe(true);
      expect(n.id.startsWith("builtin:blood-and-bone:")).toBe(true);
      expect(getBuiltinNote(n.id)?.title).toBe(n.title);
    }
    expect(core.id).toBe("builtin:blood-and-bone:core");
  });

  it("scopes every setting note to the cross-Europe set or one city, and no rules note", () => {
    for (const n of rules.notes) expect(n.scope, n.title).toBeUndefined();
    const scopes = europe.notes.map((n) => n.scope);
    expect(scopes.every((x) => typeof x === "string")).toBe(true);
    // The overview and E2's three continent notes reach every story.
    expect(
      europe.notes.filter((n) => n.scope === "cross-europe").map((n) => n.title).sort(),
    ).toEqual([
      "Europe by Night — Overview",
      "Europe by Night — Powers of the continent",
      "Europe by Night — The Hollow Roads",
      "Europe by Night — Who's who",
    ]);
    for (const n of europe.notes.filter((x) => x.scope !== "cross-europe")) {
      expect(n.title, n.title).toContain(n.scope!);
    }
  });

  it("keeps titles unique across both packs and the starter", () => {
    const titles = [
      ...allNotes.map((n) => n.title),
      ...(starter.adventure.storyTemplate?.lore ?? []).map((l) => l.title),
    ];
    const starterOnly = (starter.adventure.storyTemplate?.lore ?? []).filter(
      (l) => !allNotes.some((n) => n.title === l.title),
    );
    expect(starterOnly.map((l) => l.title).sort()).toEqual([
      "The Hollow Hour — Running it",
      "The truth about Runa",
    ]);
    expect(new Set(allNotes.map((n) => n.title)).size).toBe(allNotes.length);
    // The starter copies the notes it carries (not every city's, E1) plus
    // its two own notes, so the list is never longer than a copy of both.
    const carried = (starter.adventure.storyTemplate?.lore ?? []).filter((l) =>
      allNotes.some((n) => n.title === l.title),
    );
    expect(titles.length).toBe(allNotes.length + carried.length + 2);
    expect(carried.length).toBeLessThanOrEqual(allNotes.length);
  });
});

describe("budgets (cl100k)", () => {
  it("keeps the core under 3,000 tokens", () => {
    expect(tokens(core.content)).toBeLessThanOrEqual(3000);
  });

  it("keeps every note under 2,500 tokens, so one read_notes never costs more", () => {
    for (const n of allNotes) {
      expect(tokens(n.content), n.title).toBeLessThanOrEqual(2500);
    }
  });

  it("keeps the sheet, filled with its defaults, under 1,000 tokens", () => {
    const tpl = createCharacterSheetTemplate(BLOOD_AND_BONE_SHEET_TEMPLATE);
    expect(validateTemplate(BLOOD_AND_BONE_SHEET_TEMPLATE)).toEqual([]);
    const filled = fillTemplate(tpl.template, getDefaultValues(tpl));
    expect(filled).not.toContain("{{");
    expect(tokens(filled)).toBeLessThanOrEqual(1000);
  });

  it("keeps the notes pinned in full under the DM-instructions cap together", () => {
    const running = (starter.adventure.storyTemplate?.lore ?? []).find(
      (l) => l.title === "The Hollow Hour — Running it",
    )!;
    expect(tokens(core.content) + tokens(running.content)).toBeLessThan(
      DM_INSTRUCTIONS_CAP_TOKENS,
    );
  });

  it("is carried whole by the GM prompt's pinned-note cap in the starter", () => {
    const lore = starter.adventure.storyTemplate!.lore!;
    const capped = capPinnedForGM(lore);
    const dm = lore.filter((l) => l.type === "dm_instructions");
    expect(dm.map((l) => l.title).sort()).toEqual([
      "B&B — Core rules",
      "The Hollow Hour — Running it",
    ]);
    for (const l of dm) {
      expect(capped.get(l)?.cutTokens, l.title).toBe(0);
      expect(capped.get(l)?.content).toBe(l.content);
    }
  });

  it("types the core as the one pinned dm_instructions note of the pack", () => {
    expect(core.type).toBe("dm_instructions");
    expect(
      rules.notes.filter((n) => n.type === "dm_instructions").map((n) => n.title),
    ).toEqual(["B&B — Core rules"]);
    expect(
      allNotes.filter((n) => n.type === "character_sheet" || n.type === "gm_plan"),
    ).toEqual([]);
  });
});

describe("references", () => {
  const titles = allNotes.map((n) => n.title);

  function namedTitles(text: string): string[] {
    const found: string[] = [];
    let i = text.indexOf("B&B — ");
    while (i >= 0) {
      const rest = text.slice(i);
      const hit = titles.find((t) => rest.startsWith(t));
      if (hit) found.push(hit);
      else if (!rest.startsWith("B&B — Creation prompts: <Kind>") && !rest.startsWith("B&B — <Kind>") && !rest.startsWith("B&B — Miss tables: ...")) {
        found.push("MISSING: " + rest.slice(0, 40));
      }
      i = text.indexOf("B&B — ", i + 1);
    }
    return found;
  }

  it("names only notes that exist, in the core and in every rules note", () => {
    for (const n of rules.notes) {
      const bad = namedTitles(n.content).filter((t) => t.startsWith("MISSING"));
      expect(bad, n.title).toEqual([]);
    }
  });

  it("lets the core reach every rules note a GM would need", () => {
    const named = new Set(namedTitles(core.content));
    for (const must of [
      "B&B — Moves",
      "B&B — Vampire",
      "B&B — Gargoyle",
      "B&B — Wendigo",
      "B&B — Werewolf",
      "B&B — Witch/Warlock",
      "B&B — Hunter",
      "B&B — Ghost",
      "B&B — Paths",
      "B&B — Havens",
      "B&B — Companions",
      "B&B — Relics",
      "B&B — Rites",
      "B&B — Progress, vows and XP",
      "B&B — Time Skip and the Turning",
      "B&B — Character creation",
      "B&B — Miss tables: generic moves",
      "B&B — Miss tables: beast and recovery",
      "B&B — Miss tables: skirmish and making",
      "B&B — Miss tables: masquerade and recovery",
      "B&B — Oracles: complication",
      "B&B — Oracles: scene",
      "B&B — Oracles: what they want",
    ]) {
      expect(named.has(must), must).toBe(true);
    }
    expect(core.content).toContain("B&B — Creation prompts: <Kind>");
  });

  it("uses only tool names, actions and arguments the GM tools actually have", () => {
    const known = new Set<string>([
      ...GM_TOOL_NAMES,
      ...MYTHIC_TOOLS.map((t) => t.function.name),
      ...TOOL_MAP.keys(),
    ]);
    for (const schema of [...GM_TOOL_MAP.values(), ...TOOL_MAP.values()]) {
      const props = schema.function.parameters?.properties ?? {};
      for (const [key, value] of Object.entries(props)) {
        known.add(key);
        const enumValues = (value as { enum?: unknown[] }).enum;
        for (const e of enumValues ?? []) if (typeof e === "string") known.add(e);
      }
    }
    for (const n of rules.notes) {
      const tokensInNote = n.content.match(/\b[a-z]+(?:_[a-z]+)+\b/g) ?? [];
      for (const t of tokensInNote) {
        expect(known.has(t), `${n.title}: ${t}`).toBe(true);
      }
    }
  });

  it("forbids the combat tools in the core and offers the tools it names", () => {
    expect(core.content).toMatch(/NEVER use start_combat/);
    for (const tool of [
      "action_roll",
      "manage_meter",
      "manage_track",
      "end_session",
      "start_challenge",
      "record_challenge_result",
      "formula_roll",
      "fate_question",
    ]) {
      expect(GM_TOOL_NAMES).toContain(tool);
      expect(core.content).toContain(tool);
    }
    expect(MYTHIC_TOOLS.map((t) => t.function.name)).toContain("increment_scene");
    expect(core.content).toContain("increment_scene");
  });
});

describe("the notes follow the decided rules", () => {
  const note = (t: string) => rules.notes.find((n) => n.title === t)!.content;

  it("renames the four colliding names", () => {
    expect(note("B&B — Havens")).toContain("THE FORGOTTEN ROOM");
    expect(note("B&B — Havens")).not.toContain("THE HOLLOW**");
    expect(note("B&B — Rites")).toContain("THE CALLING DUE");
    expect(note("B&B — Rites")).toContain("THE WAKE");
    expect(note("B&B — Rites")).not.toContain("THE RECKONING");
    expect(note("B&B — Rites")).not.toContain("THE VIGIL");
    expect(note("B&B — Werewolf")).toContain("Beast Meter track — The Wild");
    expect(note("B&B — Werewolf")).not.toMatch(/The Turning/);
    expect(note("B&B — Wendigo")).toContain("Beast Meter track — The Hollow");
  });

  it("puts the Ledger, the Mask, the Fading and the Rogue where the decisions said", () => {
    expect(note("B&B — Witch/Warlock")).toMatch(/Ledger \(meter, 0-10\)/);
    expect(note("B&B — Witch/Warlock")).toMatch(/drops the Ledger to 5/);
    expect(note("B&B — Wendigo")).toMatch(/Slipping Mask \(meter, 0-3\)/);
    expect(note("B&B — Wendigo")).toMatch(/third foodless dawn/);
    expect(note("B&B — Wendigo")).toMatch(/next dawn does not advance it/);
    expect(note("B&B — Ghost")).toMatch(/begins at Stress 4 \(5 for the Anchored, 3 for the Unraveling\)/);
    expect(note("B&B — Ghost")).toMatch(/count your Stress as 2 lower/);
    expect(note("B&B — Werewolf")).toMatch(/complication from your Doomed burden/);
    expect(note("B&B — Moves")).toMatch(/Resist the Hunger/);
    expect(note("B&B — Moves")).toMatch(/Resisting the Change/);
  });

  it("states the spike, the Rule of 3 and the Reckoning plainly in the core", () => {
    expect(core.content).toMatch(/A spike is \+2/);
    expect(core.content).toMatch(/mode "tally", rounds 3/);
    expect(core.content).toMatch(/count the 1s yourself/);
    expect(core.content).toMatch(/Feed the Beast \(Stress \+2\)/);
  });

  it("gives every table note a die the GM can roll, with every entry present", () => {
    const tables = allNotes.filter((x) => x.type === "table");
    expect(tables.length).toBeGreaterThanOrEqual(14);
    for (const n of tables) {
      expect(checkTableShape(n.title, n.content), n.title).toEqual([]);
    }
  });

  it("keeps the three oracles, the miss tables and their moves", () => {
    const oracles = allNotes.filter((n) => n.title.startsWith("B&B — Oracles"));
    expect(oracles.map((o) => o.title)).toEqual(
      expect.arrayContaining([
        "B&B — Oracles: complication",
        "B&B — Oracles: scene",
        "B&B — Oracles: what they want",
      ]),
    );
    for (const o of oracles) {
      expect(o.content.match(/^\d+\. /gm)?.length ?? 0, o.title).toBeGreaterThanOrEqual(10);
    }
    const miss = allNotes.filter((n) => n.title.startsWith("B&B — Miss tables"));
    expect(miss.length).toBeGreaterThanOrEqual(4);
    const moves = miss.flatMap((n) => n.content.match(/^\*\*.* — miss/gm) ?? []);
    expect(moves.length).toBeGreaterThanOrEqual(18);
  });

  it("gives each Kind a creation-prompts table", () => {
    expect(
      allNotes
        .filter((n) => n.title.startsWith("B&B — Creation prompts: "))
        .map((n) => n.title.replace("B&B — Creation prompts: ", "")),
    ).toEqual([...BLOOD_AND_BONE_KINDS]);
  });
});

describe("originality guard (decision 3)", () => {
  // Names and phrases from the Ironsworn family that this game deliberately
  // does not use. The moves it shares with the SRD are credited under CC BY
  // 4.0 (decisions 69, 82); nothing else from it should creep in.
  const NOT_HERE = [
    "swear an iron vow",
    "iron vow",
    "reach a milestone",
    "endure harm",
    "endure stress",
    "face death",
    "face desolation",
    "take decisive action",
    "gain ground",
    "make camp",
    "momentum",
    "compare your action score to each challenge die",
    "set a course",
    "withstand damage",
  ];

  it("keeps SRD phrases that the game does not use out of every note", () => {
    const all = [
      ...allNotes.map((n) => n.content),
      starter.adventure.storyTemplate?.premise ?? "",
      starter.adventure.storyTemplate?.intro ?? "",
    ]
      .join("\n")
      .toLowerCase();
    for (const phrase of NOT_HERE) {
      expect(all.includes(phrase), phrase).toBe(false);
    }
  });

  it("carries the CC BY 4.0 credit and the not-official statement", () => {
    const moves = rules.notes.find((n) => n.title === "B&B — Moves")!.content;
    expect(moves).toMatch(/Creative Commons Attribution 4\.0/);
    expect(moves).toMatch(/not an official Ironsworn product/);
    expect(sys.description).toMatch(/CC BY 4\.0/);
    expect(sys.description).toMatch(/not an official Ironsworn product/);
  });
});

describe("meter sets", () => {
  it("pass createMeterSet and match the decided numbers", () => {
    for (const set of sys.meterSets) {
      const { created, skipped } = createMeterSet(set, set.name === "City" ? "world" : "Mira", []);
      expect(skipped).toEqual([]);
      expect(created).toHaveLength(set.meters.length);
    }
    const pc = sys.meterSets[0].meters;
    const by = (n: string) => pc.find((m) => m.name === n)!;
    expect([by("Stress").min, by("Stress").max, by("Stress").start]).toEqual([0, 6, 2]);
    expect([by("Beast").max, by("Beast").onlyUp]).toEqual([10, true]);
    expect(by("Beast").thresholds?.map((t) => t.at)).toEqual([3, 6, 9, 10]);
    expect(by("Exposure").thresholds?.map((t) => t.at)).toEqual([3, 4, 5, 6]);
    expect([by("XP").min, by("XP").max]).toEqual([0, 999]);
    const witch = sys.meterSets.find((s) => s.name === "Witch")!.meters[0];
    expect([witch.name, witch.max, witch.thresholds?.[0].at]).toEqual(["Ledger", 10, 10]);
    const wendigo = sys.meterSets.find((s) => s.name === "Wendigo")!.meters[0];
    expect([wendigo.name, wendigo.max, wendigo.thresholds?.map((t) => t.at)]).toEqual(["Slipping Mask", 3, [1, 2, 3]]);
  });
});

describe("the starter, The Hollow Hour", () => {
  const template = starter.adventure.storyTemplate!;

  it("carries the rules, the cross-Europe notes and London, so the system is found", () => {
    const linked = (template.lore ?? []).filter((l) => l.libraryNoteId);
    const expected = allNotes.filter(
      (n) => n.scope === undefined || n.scope === "cross-europe" || n.scope === "London",
    );
    expect(linked.map((l) => l.libraryNoteId)).toEqual(expected.map((n) => n.id));
    expect(linked.length).toBeLessThan(allNotes.length);
    for (const l of linked) expect(getBuiltinNote(l.libraryNoteId!)?.title).toBe(l.title);
    const resolved = resolveSystem({ lore: template.lore!, systemState: template.systemState });
    expect(resolved.system?.id).toBe("blood-and-bone");
    expect(resolved.usesSystemTools).toBe(true);
    expect(resolved.meterSets.length).toBe(4);
  });

  it("has Runa, Callum and Margot, Heat at 3 and three Cohort tracks", () => {
    expect((template.npcs ?? []).map((n) => n.name)).toEqual([
      "Runa Sandhu",
      "Callum Reyes",
      "Margot Severin",
    ]);
    const heat = template.meters?.[0];
    expect([heat?.owner, heat?.name, heat?.value, heat?.max]).toEqual(["world", "Heat", 3, 6]);
    expect(heat?.thresholds?.map((t) => t.at)).toEqual([3, 4, 5, 6]);
    expect(template.progressTracks?.map((t) => [t.owner, t.rank])).toEqual([
      ["Cohort", "dangerous"],
      ["Cohort", "dangerous"],
      ["Cohort", "formidable"],
    ]);
  });

  it("keeps the truth about Runa hidden, and out of her public NPC entry", () => {
    const secret = (template.lore ?? []).find((l) => l.title === "The truth about Runa")!;
    expect(secret.type).toBe("secret");
    expect(secret.visibility).toBe("hidden");
    expect(secret.libraryNoteId).toBeUndefined();
    const runa = template.npcs!.find((n) => n.name === "Runa Sandhu")!;
    expect(runa.description).not.toMatch(/fledgling|vampire|maker/i);
  });

  it("is a LocalAdventure the Play flow can start, with a sheet template", () => {
    const local = builtinAdventureToLocal(starter);
    expect(local.id).toBe("builtin:blood-and-bone:hollow-hour");
    expect(local.title).toBe("The Hollow Hour");
    expect(starter.adventure.characterSheetTemplate?.fields.length).toBeGreaterThan(10);
  });

  it("passes ensureStoryDataArrays and is not duplicated by attaching the packs again", () => {
    const data = ensureStoryDataArrays({
      ...template,
      story_name: "x",
      player_name: "P",
    } as unknown as StoryData);
    expect(Array.isArray(data.lore)).toBe(true);
    expect(data.meters).toHaveLength(1);
    const again = mergeImportedLore(
      template.lore!,
      builtinPackToLibraryNotes(rules).map(libraryNoteToStoryLore),
    );
    expect(again.lore).toHaveLength(template.lore!.length);
    expect(again.added).toEqual([]);
  });
});

describe("starting the starter", () => {
  beforeEach(() => {
    const map = new Map<string, string>();
    vi.stubGlobal("indexedDB", new IDBFactory());
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
      setItem: (k: string, v: string) => void map.set(k, String(v)),
      removeItem: (k: string) => void map.delete(k),
      clear: () => map.clear(),
    });
  });

  it("creates a story that resolves to Blood & Bone and keeps its secret hidden", async () => {
    const id = await startAdventureLocally(starter.adventure, "Mira");
    const story = (await getLocalStory(id))!.storyData as StoryData;
    expect(story.player_name).toBe("Mira");
    expect(story.sessionZeroActive).toBe(true);
    expect(resolveSystem(story).usesSystemTools).toBe(true);
    const secret = story.lore.find((l) => l.title === "The truth about Runa");
    expect(secret?.visibility).toBe("hidden");
    expect(story.characterSheetTemplate?.template).toContain("Nerve");
    expect(story.progressTracks).toHaveLength(3);
  });
});

describe("the screens, rendered with the real registry", () => {
  it("shows Blood & Bone, both packs and The Hollow Hour in the library section", () => {
    const out = renderToStaticMarkup(
      createElement(BuiltinSystemsSection, { onPlay: () => {}, onOpenCopy: () => {} }),
    );
    expect(out).toContain("Blood &amp; Bone");
    expect(out).toContain("Blood &amp; Bone — Rules");
    expect(out).toContain("Blood &amp; Bone — Europe by Night");
    expect(out).toContain("The Hollow Hour");
    expect(out).toContain("Open a copy in the Designer");
  });

  it("lists the packs in the picker as one virtual folder each", () => {
    for (const pack of sys.packs) {
      expect(builtinPackToLibraryNotes(pack)).toHaveLength(pack.notes.length);
    }
  });

  it("shows the starter's Heat and Cohort vows in the meters panel", () => {
    const t = starter.adventure.storyTemplate!;
    const out = renderToStaticMarkup(
      createElement(MetersPanel, { meters: t.meters, progressTracks: t.progressTracks }),
    );
    expect(out).toContain("Heat");
    expect(out).toContain("3/6");
    expect(out).toContain("A pattern");
    expect(out).toContain("Find Runa before Callum does");
    expect(out).toContain("0 of 10 boxes filled");
  });
});

// ---------------------------------------------------------------------------
// The core's recipes, run against the engine as the GM would call them.
// ---------------------------------------------------------------------------

function bbStory(over: Partial<StoryData> = {}): StoryData {
  const lore: StoryLore[] = [
    {
      title: core.title,
      content: core.content,
      relatedCharacters: [],
      relatedLocations: [],
      secrtet: false,
      keys: [],
      type: "dm_instructions",
      libraryNoteId: core.id,
    },
  ];
  return mockStory({ lore, ...over });
}

describe("the core's recipes against the engine", () => {
  it("setup: create_set makes the character's meters, the Witch ledger and the city's Heat", async () => {
    let s = bbStory();
    let r = await run(s, "manage_meter", { action: "create_set", owner: "Mira", set: "Blood & Bone character", reason: "setup" });
    expect(r.result.success).toBe(true);
    s = r.story;
    expect(s.meters?.map((m) => m.name)).toEqual(["Stress", "Beast", "Exposure", "XP"]);
    expect(s.meters?.find((m) => m.name === "Stress")?.value).toBe(2);
    r = await run(s, "manage_meter", { action: "create_set", owner: "Mira", set: "Witch", reason: "kind" });
    expect(r.result.success).toBe(true);
    r = await run(r.story, "manage_meter", { action: "create_set", owner: "world", set: "City", reason: "city" });
    expect(r.result.success).toBe(true);
    expect(r.story.meters?.some((m) => m.owner === "world" && m.name === "Heat")).toBe(true);
  });

  it("stress: a trigger is +1 once a scene, a repeat is refused, a new scene allows it again", async () => {
    let s = bbStory();
    s = (await run(s, "manage_meter", { action: "create_set", owner: "Mira", set: "Blood & Bone character", reason: "setup" })).story;
    const trigger = { action: "adjust", owner: "Mira", meter: "Stress", by: 1, once_per: "scene", key: "sunlight", reason: "sunlight" };
    let r = await run(s, "manage_meter", trigger);
    expect(r.result.success).toBe(true);
    expect(r.story.meters?.find((m) => m.name === "Stress")?.value).toBe(3);
    const again = await run(r.story, "manage_meter", trigger);
    expect(JSON.stringify(again.result)).toMatch(/refusedAsRepeat/);
    expect(again.story.meters?.find((m) => m.name === "Stress")?.value).toBe(3);
    r = await run(again.story, "increment_scene", {});
    const next = await run(r.story, "manage_meter", trigger);
    expect(next.result.success).toBe(true);
    expect(next.story.meters?.find((m) => m.name === "Stress")?.value).toBe(4);
  });

  it("the Beast: thresholds are reported with their instructions, and caps follow", async () => {
    let s = bbStory();
    s = (await run(s, "manage_meter", { action: "create_set", owner: "Mira", set: "Blood & Bone character", reason: "setup" })).story;
    const r = await run(s, "manage_meter", { action: "adjust", owner: "Mira", meter: "Beast", by: 3, reason: "reckoning" });
    expect(r.result.success).toBe(true);
    expect(JSON.stringify(r.result)).toMatch(/First Crack/);
    expect(JSON.stringify(r.result)).toMatch(/lowers one stat/);
    const capped = await run(r.story, "manage_meter", { action: "set_cap", owner: "Mira", meter: "Stress", value: 5, reason: "Beast 6" });
    expect(capped.result.success).toBe(true);
    expect(capped.story.meters?.find((m) => m.name === "Stress")?.cap).toBe(5);
    const fall = await run(capped.story, "manage_meter", { action: "adjust", owner: "Mira", meter: "Beast", by: -1, reason: "no" });
    expect(fall.result.success).toBe(false);
  });

  it("the Held Line: Stress can be recreated with a range of 0-7", async () => {
    let s = bbStory();
    s = (await run(s, "manage_meter", { action: "create_set", owner: "Mira", set: "Blood & Bone character", reason: "setup" })).story;
    s = (await run(s, "manage_meter", { action: "remove", owner: "Mira", meter: "Stress", reason: "The Held Line" })).story;
    const r = await run(s, "manage_meter", { action: "create", owner: "Mira", meter: "Stress", min: 0, max: 7, value: 2, reason: "The Held Line" });
    expect(r.result.success).toBe(true);
    expect(r.story.meters?.find((m) => m.name === "Stress")?.max).toBe(7);
  });

  it("the Rule of 3: a tally challenge closes after three results and reports the tally", async () => {
    let s = bbStory();
    let r = await run(s, "start_challenge", {
      name: "The tunnel fight",
      description: "get Runa out",
      primary_stat: "Bone",
      difficulty: "dangerous",
      mode: "tally",
      rounds: 3,
    });
    expect(r.result.success).toBe(true);
    s = r.story;
    for (const outcome of ["strong_hit", "weak_hit", "strong_hit"]) {
      r = await run(s, "record_challenge_result", { outcome, description: "an exchange" });
      expect(r.result.success).toBe(true);
      s = r.story;
    }
    expect(s.activeChallenge?.active).toBe(false);
    expect(s.activeChallenge?.tally).toBe(2);
    expect(s.activeChallenge?.recorded).toBe(3);
    expect(JSON.stringify(r.result)).toMatch(/tally|Decisive|won/i);
  });

  it("progress: a vow is created, marked by rank and rolled", async () => {
    const s = bbStory();
    let r = await run(s, "manage_track", { action: "create", owner: "Mira", track: "Find the maker", kind: "vow", rank: "dangerous", reason: "vow" });
    expect(r.result.success).toBe(true);
    r = await run(r.story, "manage_track", { action: "mark", owner: "Mira", track: "Find the maker", times: 3, reason: "lead" });
    expect(r.story.progressTracks?.[0].ticks).toBe(24);
    r = await run(r.story, "manage_track", { action: "progress_roll", owner: "Mira", track: "Find the maker", reason: "fulfil" });
    expect(JSON.stringify(r.result)).toMatch(/strong hit|weak hit|miss/i);
  });

  it("dawn: end_session returns the Reckoning reminder from the system", async () => {
    const r = await run(bbStory(), "end_session", { reason: "Dawn over the tunnels" });
    expect(r.result.success).toBe(true);
    expect(JSON.stringify(r.result)).toMatch(/Reckoning/);
    expect(r.story.systemState?.sessionCount).toBe(1);
  });

  it("an action roll names a move and reports an outcome", async () => {
    const r = await run(bbStory(), "action_roll", { stat_name: "Shadow", stat_value: 3, adds: 5, move: "Sate the Beast", reason: "feeding" });
    expect(r.result.success !== undefined).toBe(true);
    expect(JSON.stringify(r.result)).toMatch(/strong hit|weak hit|miss/i);
  });
});

void call;
