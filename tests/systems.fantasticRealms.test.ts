/**
 * Fantastic Realms content (slices 3-5): the rules pack, the world pack and
 * the Wolfwillow Crossing starter. Checks the core's budget, the table
 * shapes, the foe stat lines, the note ids and the starter's contents.
 */
import { describe, expect, it } from "vitest";
import { getEncoding } from "js-tiktoken";
import { FANTASTIC_REALMS } from "@/app/misc/systems/fantastic-realms";
import { REALM_NOTES } from "@/app/misc/systems/fantastic-realms/world/realms";
import { checkTableShape } from "./helpers/tableShape";

const enc = getEncoding("cl100k_base");
const tokens = (s: string) => enc.encode(s).length;
const sys = FANTASTIC_REALMS;
const allNotes = sys.packs.flatMap((p) => p.notes);
const core = allNotes.find((n) => n.id === "builtin:fantastic-realms:core")!;
const starter = sys.starters[0];
const tpl = starter.adventure.storyTemplate!;

const FOE_LINE =
  /^\*\*(.+?)\*\* — DC (\d) · ([A-Za-z' -]+(?:, [A-Za-z' -]+){1,3}) · Hearts (\d+) · XP (\d+)$/;

describe("Fantastic Realms content", () => {
  it("is the system it says it is", () => {
    expect(sys.id).toBe("fantastic-realms");
    expect(sys.title).toBe("Fantastic Realms");
    expect(sys.description.endsWith(
      "Inspired by EZD6, Stonetop, Tiny RPG, Mythic Bastion Land and Legends of the Mist.",
    )).toBe(true);
    expect(sys.creationSteps?.map((s) => s.id)).toEqual(["concept", "feats", "realm_tie"]);
    expect(sys.meterSets[0].name).toBe("Fantastic Realms hero");
  });

  it("keeps the core under 3,000 tokens and names every tool", () => {
    const n = tokens(core.content);
    console.log(`core tokens: ${n}`);
    expect(n).toBeLessThanOrEqual(3000);
    expect(core.type).toBe("dm_instructions");
    for (const t of [
      "feat_roll",
      "initiative_roll",
      "award_xp",
      "take_rest",
      "manage_feats",
      "manage_meter",
    ]) {
      expect(core.content, t).toContain(t);
    }
    expect(core.content).toContain('create_set "Fantastic Realms hero"');
  });

  it("gives every note a unique builtin:fantastic-realms: id", () => {
    const ids = allNotes.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id.startsWith("builtin:fantastic-realms:"), id).toBe(true);
    expect(sys.coreNoteId).toBe("builtin:fantastic-realms:core");
  });

  it("scopes the whole world pack to the crossroads and the rules to nothing", () => {
    for (const n of sys.packs[0].notes) expect(n.scope, n.id).toBeUndefined();
    for (const n of sys.packs[1].notes) expect(n.scope, n.id).toBe("crossroads");
    expect(sys.packs[1].id).toBe("fantastic-realms:crossroads");
    expect(sys.packs[0].id).toBe("fantastic-realms:rules");
  });

  it("makes every table pass the shape check", () => {
    const tables = allNotes.filter((n) => n.type === "table");
    expect(tables.length).toBe(7);
    for (const t of tables) expect(checkTableShape(t.title, t.content), t.title).toEqual([]);
  });

  it("writes every realm foe as a parseable stat line on the XP scale", () => {
    expect(REALM_NOTES.length).toBe(3);
    for (const note of REALM_NOTES) {
      const lines = note.content.split("\n").filter((l) => l.startsWith("**") && l.includes(" — DC "));
      expect(lines.length, note.title).toBe(12);
      for (const l of lines) {
        const m = FOE_LINE.exec(l);
        expect(m, l).not.toBeNull();
        const dc = Number(m![2]);
        const hearts = Number(m![4]);
        const xp = Number(m![5]);
        expect(dc, l).toBeGreaterThanOrEqual(2);
        expect(dc, l).toBeLessThanOrEqual(6);
        const scale = hearts === 1 ? 50 : hearts === 3 ? 200 : hearts >= 5 ? 1000 : 0;
        expect(scale, `${l}: hearts ${hearts} is not a mook, champion or legend`).toBeGreaterThan(0);
        expect(xp, l).toBe(dc * scale);
      }
    }
  });

  it("gives each realm a rest condition", () => {
    const rests = sys.rests ?? {};
    expect(Object.keys(rests).sort()).toEqual(["aurelane", "gloamreach", "larkenfell"]);
    for (const note of REALM_NOTES) expect(note.content).toContain("**Rest:**");
  });

  it("holds the core, the creation note and its setting in the starter", () => {
    const lore = tpl.lore ?? [];
    const linked = new Set(lore.map((l) => l.libraryNoteId).filter(Boolean));
    expect(linked.has("builtin:fantastic-realms:core")).toBe(true);
    expect(linked.has("builtin:fantastic-realms:character-creation")).toBe(true);
    // Every realm travels with the story: the loader cannot add one later,
    // since a starter's story is seeded as already offered them.
    for (const realm of ["aurelane", "larkenfell", "gloamreach"]) {
      expect(linked.has(`builtin:fantastic-realms:realm-${realm}`)).toBe(true);
    }
    expect(starter.id.startsWith("builtin:fantastic-realms:")).toBe(true);
    const state = tpl.systemState!;
    expect(state.systemId).toBe("fantastic-realms");
    expect(state.setting).toBe("crossroads");
    expect(tpl.sessionZeroActive).toBe(true);
    const own = lore.filter((l) => !l.libraryNoteId);
    expect(own.some((l) => l.type === "dm_instructions" && /Running it/.test(l.title))).toBe(true);
    const plan = own.find((l) => l.type === "secret");
    expect(plan?.content).toMatch(/Seven beats|seven beats/);
    expect(own.find((l) => /Running it/.test(l.title))?.content).toContain("a night by a fire with a full meal");
    expect(own.find((l) => /Running it/.test(l.title))?.content).toContain("Open on the arrival");
  });

  it("has a 150-200 word second-person arrival intro", () => {
    const intro = tpl.intro ?? "";
    expect(intro.length).toBeGreaterThan(0);
    const words = intro.split(/\s+/).filter(Boolean).length;
    expect(words).toBeGreaterThanOrEqual(150);
    expect(words).toBeLessThanOrEqual(200);
    expect(intro).toMatch(/\byou\b/i);
    expect(tpl.scene?.parts ?? []).toEqual([]);
  });

  it("offers three pre-made heroes with four feats each", () => {
    const presets = starter.adventure.presets ?? [];
    expect(presets.length).toBe(3);
    expect(tpl.presets?.length).toBe(3);
    for (const p of presets) {
      const m = /## Feats[^\n]*\n([^\n]+)/.exec(p.characterSheet ?? "");
      expect(m, p.name).not.toBeNull();
      const feats = m![1].split(";").map((f) => f.trim()).filter(Boolean);
      expect(feats.length, p.name).toBe(4);
      expect(new Set(feats).size).toBe(4);
      expect(p.characterSheet).toContain("**Concept:**");
      expect(p.characterSheet).toContain("**Hearts:** 3");
      expect(p.authorNotes).toContain("manage_feats add");
    }
  });
});
