/**
 * Blood & Bone E5 (docs/bb-starters-design.md, decisions 163-173): the two
 * campaign starters in their own worlds, Grave Watcher and The Last Resort.
 * Each is checked for what the engine and the GM rely on: its setting, the
 * Rules notes it copies (and the Europe by Night ones it leaves out), the
 * pinned-note cap, note sizes, table shapes, legal pre-made sheets and the
 * starter's own meters.
 */
import { describe, expect, it } from "vitest";
import { getEncoding } from "js-tiktoken";
import { DM_INSTRUCTIONS_CAP_TOKENS } from "@/app/misc/contextLimits";
import { adventureToDraft, draftToAdventure } from "@/app/misc/designer_executor";
import { hasPremadeCharacters } from "@/app/misc/presets";
import type { StoryData } from "@/app/misc/structs";
import { BLOOD_AND_BONE } from "@/app/misc/systems/blood-and-bone";
import { BLOOD_AND_BONE_KINDS } from "@/app/misc/systems/blood-and-bone/kindList";
import { EUROPE_TABLE_FAMILY_IDS } from "@/app/misc/systems/blood-and-bone/starters/shared";
import {
  BLOOD_AND_BONE_CORE_ID,
  missingBuiltinNotes,
  seedBuiltinNotesOffered,
} from "@/app/misc/systems/builtinNotes";
import { resolveSystem } from "@/app/misc/systems/resolve";
import { checkTableShape } from "./helpers/tableShape";

const enc = getEncoding("cl100k_base");
const tokens = (s: string) => enc.encode(s).length;
const sys = BLOOD_AND_BONE;
const core = sys.packs[0].notes.find((n) => n.id === BLOOD_AND_BONE_CORE_ID)!;

const STARTERS = [
  { id: "builtin:blood-and-bone:grave-watcher", setting: "grave-watch", world: "Unrest", presets: 8 },
  { id: "builtin:blood-and-bone:last-resort", setting: "last-resort", world: "Vacancy", presets: 5 },
] as const;

const ICONS = new Set(
  "Ghost Skull Shield Moon Flame Crosshair TreePine Anchor Wand Heart User Key Building Crown Search Compass Drama Laugh Star Sun BookOpen Sword".split(
    " ",
  ),
);

for (const spec of STARTERS) {
  describe(spec.id, () => {
    const starter = sys.starters.find((s) => s.id === spec.id)!;
    const tpl = () => starter.adventure.storyTemplate!;
    const lore = () => tpl().lore ?? [];
    const own = () => lore().filter((l) => !l.libraryNoteId);

    it("is registered after The Hollow Hour", () => {
      expect(starter).toBeDefined();
      expect(sys.starters[0].id).toBe("builtin:blood-and-bone:hollow-hour");
    });

    it("carries its setting, and runs Blood & Bone with the tools on", () => {
      expect(tpl().systemState?.setting).toBe(spec.setting);
      const story = { ...tpl(), lore: lore() } as StoryData;
      const resolved = resolveSystem(story);
      expect(resolved.system?.id).toBe(sys.id);
      expect(resolved.usesSystemTools).toBe(true);
    });

    it("copies the Rules mechanics but no Europe by Night note", () => {
      const ids = new Set(lore().map((l) => l.libraryNoteId).filter(Boolean));
      expect(ids.has(BLOOD_AND_BONE_CORE_ID)).toBe(true);
      expect(ids.has("builtin:blood-and-bone:character-creation")).toBe(true);
      for (const id of EUROPE_TABLE_FAMILY_IDS) expect(ids.has(id), id).toBe(false);
      const europeIds = new Set(sys.packs[1].notes.map((n) => n.id));
      for (const id of ids) expect(europeIds.has(id!), id).toBe(false);
    });

    it("is given no Europe by Night note on load", () => {
      const story = {
        ...structuredClone(tpl()),
        lore: structuredClone(lore()),
      } as StoryData;
      seedBuiltinNotesOffered(story);
      expect(missingBuiltinNotes(story, sys)).toEqual([]);
      expect(story.systemState?.setting).toBe(spec.setting);
    });

    it("keeps its Running-it note and the core under the DM-instructions cap", () => {
      const dm = own().filter((l) => l.type === "dm_instructions");
      expect(dm).toHaveLength(1);
      expect(dm[0].title.endsWith("— Running it")).toBe(true);
      expect(tokens(core.content) + tokens(dm[0].content)).toBeLessThan(DM_INSTRUCTIONS_CAP_TOKENS);
    });

    it("keeps every note it writes under 2,500 tokens, with unique titles", () => {
      for (const l of own()) expect(tokens(l.content), l.title).toBeLessThanOrEqual(2500);
      const titles = lore().map((l) => l.title.trim().toLowerCase());
      expect(new Set(titles).size).toBe(titles.length);
    });

    it("ships no campaign plan: the GM writes it in session zero", () => {
      expect(lore().some((l) => l.type === "gm_plan")).toBe(false);
      expect(tpl().sessionZeroActive).toBe(true);
    });

    it("has secrets that are hidden", () => {
      const secrets = own().filter((l) => l.type === "secret");
      expect(secrets.length).toBeGreaterThanOrEqual(2);
      for (const s of secrets) expect(s.visibility, s.title).toBe("hidden");
    });

    it("has well-formed tables", () => {
      const tables = own().filter((l) => l.type === "table");
      expect(tables.length).toBeGreaterThanOrEqual(4);
      for (const t of tables) expect(checkTableShape(t.title, t.content), t.title).toEqual([]);
    });

    it("offers its roster as presets, each a filled, legal sheet", () => {
      const presets = starter.adventure.presets ?? [];
      expect(presets).toHaveLength(spec.presets);
      expect(tpl().presets).toEqual(presets);
      expect(hasPremadeCharacters({ presets })).toBe(true);
      const ids = presets.map((p) => p.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const p of presets) {
        expect(ICONS.has(p.icon), `${p.name}: icon ${p.icon}`).toBe(true);
        const sheet = p.characterSheet ?? "";
        expect(sheet, p.name).not.toContain("{{");
        const kind = /\*\*Kind:\*\*\s*(.+)/.exec(sheet)?.[1]?.trim();
        expect(BLOOD_AND_BONE_KINDS as readonly string[], `${p.name}: Kind ${kind}`).toContain(kind);
        const stats = /Nerve\s+(\d)\s*\|\s*Heart\s+(\d)\s*\|\s*Bone\s+(\d)\s*\|\s*Shadow\s+(\d)\s*\|\s*Wits\s+(\d)/.exec(sheet);
        expect(stats, `${p.name}: stats line`).not.toBeNull();
        expect(stats!.slice(1).map(Number).sort().join(""), `${p.name}: stats`).toBe("11223");
      }
    });

    it("makes its world meter, and its NPCs have unique ids", () => {
      const meter = (tpl().meters ?? []).find((m) => m.name === spec.world);
      expect(meter?.owner).toBe("world");
      const npcIds = (tpl().npcs ?? []).map((n) => n.id);
      expect(npcIds.length).toBeGreaterThanOrEqual(10);
      expect(new Set(npcIds).size).toBe(npcIds.length);
    });

    it("keeps its setting through the Designer", () => {
      const back = draftToAdventure(adventureToDraft(starter.adventure));
      expect(back.storyTemplate?.systemState?.setting).toBe(spec.setting);
    });
  });
}

describe("Grave Watcher's town (decision 172)", () => {
  const tpl = () =>
    sys.starters.find((s) => s.id === "builtin:blood-and-bone:grave-watcher")!.adventure.storyTemplate!;

  it("has the twenty-five regulars as NPCs", () => {
    expect(tpl().npcs ?? []).toHaveLength(25);
  });

  it("has the hundred kinds of people as a d100 table", () => {
    const people = (tpl().lore ?? []).find((l) => l.title === "Grave Watcher — People you might meet");
    expect(people?.content).toContain("(1d100)");
    expect(people?.content).toMatch(/^100\. /m);
  });

  it("has thirty-five occasional visitors across its visitor notes", () => {
    const visitors = (tpl().lore ?? []).filter((l) => l.title.startsWith("Grave Watcher — Occasional visitors"));
    expect(visitors).toHaveLength(2);
    const entries = visitors.flatMap((v) => v.content.split("\n").filter((ln) => /^\d+\. \*\*/.test(ln)));
    expect(entries).toHaveLength(35);
  });
});
