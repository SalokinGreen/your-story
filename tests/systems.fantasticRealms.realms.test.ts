/**
 * Fantastic Realms expansion E3 (docs/fr-expansion-plan.md): the three
 * original realms grown. Each has a realm note (magic, two local callings, a
 * twelve-foe roster with a tactics line each) and a tables note (a d12
 * miscast, a d20 treasure and a d20 road table).
 */
import { describe, expect, it } from "vitest";
import { getEncoding } from "js-tiktoken";
import { BUILTIN_NOTE_HISTORY } from "@/app/misc/systems/builtinNoteHistory";
import { hashNoteContent } from "@/app/misc/systems/builtinNotes";
import { FANTASTIC_REALMS } from "@/app/misc/systems/fantastic-realms";
import {
  REALM_IDS,
  REALM_NOTES,
  REALM_TABLE_NOTES,
} from "@/app/misc/systems/fantastic-realms/world/realms";
import { checkTableShape } from "./helpers/tableShape";

const enc = getEncoding("cl100k_base");
const tokens = (s: string) => enc.encode(s).length;
const world = FANTASTIC_REALMS.packs[1].notes;

const FOE_LINE =
  /^\*\*(.+?)\*\* — DC (\d) · ([A-Za-z' -]+(?:, [A-Za-z' -]+){1,3}) · Hearts (\d+) · XP (\d+)$/;

const LOCAL_CALLINGS: Record<string, string[]> = {
  aurelane: ["Herald", "Dragon-Sworn"],
  larkenfell: ["Reeve", "Barrow-Warden"],
  gloamreach: ["Lamplighter", "Penitent"],
  thornmere: ["Fen-Pilot", "Bell-Diver"],
  emberhold: ["Forgewright", "Ash-Delver"],
  "hollow-sky": ["Sky-Rigger", "Cloud-Reader"],
};

describe("the realms, grown", () => {
  it("keeps the realm ids and adds a tables note per realm to the world pack", () => {
    expect(REALM_NOTES.map((n) => n.id)).toEqual(
      REALM_IDS.map((r) => `builtin:fantastic-realms:realm-${r}`),
    );
    expect(REALM_TABLE_NOTES.map((n) => n.id)).toEqual(
      REALM_IDS.map((r) => `builtin:fantastic-realms:realm-${r}-tables`),
    );
    for (const n of [...REALM_NOTES, ...REALM_TABLE_NOTES]) expect(world, n.id).toContain(n);
  });

  it("holds every realm note and tables note under the 2,500 read cap", () => {
    const sizes: string[] = [];
    for (const n of [...REALM_NOTES, ...REALM_TABLE_NOTES]) {
      const t = tokens(n.content);
      sizes.push(`${n.title}: ${t}`);
      expect(t, n.title).toBeLessThanOrEqual(2500);
    }
    console.log(`FR realm note tokens\n${sizes.join("\n")}`);
  });

  it("gives every realm twelve foes, each a parseable line followed by tactics", () => {
    for (const note of REALM_NOTES) {
      const lines = note.content.split("\n");
      const foeAt = lines.map((l, i) => (l.includes(" — DC ") && l.startsWith("**") ? i : -1)).filter((i) => i >= 0);
      expect(foeAt.length, note.title).toBe(12);
      for (const i of foeAt) {
        expect(FOE_LINE.test(lines[i]), lines[i]).toBe(true);
        expect(lines[i + 1], `${lines[i]} needs a tactics line`).toMatch(/^\*Tactics:\* \S/);
      }
      // No duplicate foe names.
      const names = foeAt.map((i) => lines[i].split("**")[1]);
      expect(new Set(names).size, note.title).toBe(12);
    }
  });

  it("gives every realm Magic here and its two local callings in the callings format", () => {
    for (const [realm, callings] of Object.entries(LOCAL_CALLINGS)) {
      const note = REALM_NOTES.find((n) => n.id.endsWith(`realm-${realm}`))!;
      expect(note.content, realm).toContain("## Magic here");
      expect(note.content, realm).toContain("## Local callings");
      for (const c of callings) {
        const m = new RegExp(`\\*\\*${c}\\.\\*\\* .+ Signature: \\*[^*]+\\*\\. Kit: ([^.]+)\\. Path: ([^.]+)\\. Move \\*[^*]+\\*: .+`).exec(note.content);
        expect(m, `${realm} / ${c}`).not.toBeNull();
        expect(m![1].split(";").length, `${c} kit`).toBe(5);
        expect(m![2].split(";").length, `${c} path`).toBe(8);
      }
    }
  });

  it("gives every tables note a d12 miscast, a d20 treasure and a d20 road table that pass the shape check", () => {
    for (const note of REALM_TABLE_NOTES) {
      expect(checkTableShape(note.title, note.content), note.title).toEqual([]);
      expect(note.content).toMatch(/## [\w ]+ miscasts \(1d12\)/);
      expect(note.content).toMatch(/## [\w ]+ treasure \(1d20\)/);
      expect(note.content).toMatch(/## On the road in [\w ]+ \(1d20\)/);
      // Treasure carries its XP on every row.
      const treasure = note.content.split("## ").find((s) => / treasure /.test(s.split("\n")[0]))!;
      const rows = treasure.split("\n").filter((l) => /^\d+\. /.test(l));
      expect(rows).toHaveLength(20);
      for (const r of rows) expect(r, r).toMatch(/XP \d+\.$/);
    }
  });

  it("covers every miscast kind of FR — Magic in each miscast table", () => {
    for (const note of REALM_TABLE_NOTES) {
      for (const kind of ["Backfire", "Goes wide", "Draws attention", "Leaves a mark", "Costs the spell"]) {
        expect(note.content, `${note.title} / ${kind}`).toContain(`. ${kind}.`);
      }
    }
  });

  it("grew the shared treasure table and the shared foes table", () => {
    const treasure = world.find((n) => n.id.endsWith("table-treasure"))!;
    expect(treasure.content).toContain("## Items with a quality (1d12)");
    expect(treasure.content).toContain("## Great finds (1d10)");
    const foes = world.find((n) => n.id.endsWith("table-foes"))!;
    expect(foes.content.match(/\(1d12\)/g)).toHaveLength(6);
  });

  it("appends the new hash to each changed note's history and keeps the earlier ones", () => {
    // Shipped by E3 (the first entry), changed again by E4 (the third).
    const earlier: Record<string, string> = {
      "builtin:fantastic-realms:magic": "a896c79a9cb30da8-5742",
      "builtin:fantastic-realms:callings": "f15cd47a0320d7d3-5395",
      "builtin:fantastic-realms:travel": "013120c154eb0e9c-2586",
      "builtin:fantastic-realms:table-foes": "63b4d6dd61c07f6b-1475",
    };
    const all = world.concat(FANTASTIC_REALMS.packs[0].notes);
    for (const [id, old] of Object.entries(earlier)) {
      const list = BUILTIN_NOTE_HISTORY[id];
      expect(list[0], id).toBe(old);
      const note = all.find((n) => n.id === id)!;
      expect(list[list.length - 1], id).toBe(hashNoteContent(note.content));
      expect(list.length, id).toBe(3);
    }
    // The original three realm notes did not change in E4.
    for (const r of ["aurelane", "larkenfell", "gloamreach"]) {
      expect(BUILTIN_NOTE_HISTORY[`builtin:fantastic-realms:realm-${r}`], r).toHaveLength(2);
    }
    // The new realms start a history of one.
    for (const r of ["thornmere", "emberhold", "hollow-sky"]) {
      expect(BUILTIN_NOTE_HISTORY[`builtin:fantastic-realms:realm-${r}`], r).toHaveLength(1);
      expect(BUILTIN_NOTE_HISTORY[`builtin:fantastic-realms:realm-${r}-tables`], r).toHaveLength(1);
    }
  });
});
