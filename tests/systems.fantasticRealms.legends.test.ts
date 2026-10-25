/**
 * Fantastic Realms expansion E4 (docs/fr-expansion-plan.md): the three new
 * realms (Thornmere, Emberhold, the Hollow Sky) and the six legends.
 */
import { describe, expect, it } from "vitest";
import { getEncoding } from "js-tiktoken";
import { FANTASTIC_REALMS } from "@/app/misc/systems/fantastic-realms";
import { BUILTIN_NOTE_HISTORY } from "@/app/misc/systems/builtinNoteHistory";
import { REALM_NOTES } from "@/app/misc/systems/fantastic-realms/world/realms";
import { wolfwillowCampaign } from "@/app/misc/systems/fantastic-realms/starters/wolfwillow-crossing/campaign";

const enc = getEncoding("cl100k_base");
const tokens = (s: string) => enc.encode(s).length;
const world = FANTASTIC_REALMS.packs[1].notes;
const legends = FANTASTIC_REALMS.packs[0].notes.find((n) => n.id === "builtin:fantastic-realms:legends")!;

const NEW_REALMS = ["thornmere", "emberhold", "hollow-sky"];

const PHASE =
  /^\*\*(.+?), Phase (\d)\*\* — DC (\d) · ([A-Za-z' -]+(?:, [A-Za-z' -]+){1,3}) · Hearts mark \((\d)\) · Threat: \S.*$/;
const FIRST = /^\*\*[^*]+\*\* — DC (\d) · [A-Za-z' ,-]+ · Hearts (\d+) · XP (\d+)$/;

describe("the new realms (E4)", () => {
  it("knows the three new realms to take_rest, by id and by condition", () => {
    const rests = FANTASTIC_REALMS.rests!;
    expect(rests.thornmere).toMatch(/dry night under a roof/);
    expect(rests.emberhold).toMatch(/day at a forge-hall's hearth/);
    expect(rests["hollow-sky"]).toMatch(/sky-wheel/);
    for (const r of NEW_REALMS) {
      const note = REALM_NOTES.find((n) => n.id.endsWith(`realm-${r}`))!;
      expect(note.content, r).toContain(`**Realm id:** ${r}`);
      expect(note.scope, r).toBe("crossroads");
    }
  });

  it("puts the new realms in the Crossroads pack and mentions them in the Crossroads and travel notes", () => {
    for (const r of NEW_REALMS) {
      expect(world.some((n) => n.id === `builtin:fantastic-realms:realm-${r}`), r).toBe(true);
      expect(world.some((n) => n.id === `builtin:fantastic-realms:realm-${r}-tables`), r).toBe(true);
    }
    const crossroads = world.find((n) => n.id.endsWith(":crossroads"))!;
    const travel = FANTASTIC_REALMS.packs[0].notes.find((n) => n.id.endsWith(":travel"))!;
    for (const w of ["Thornmere", "Emberhold", "Hollow Sky"]) {
      expect(crossroads.content, w).toContain(w);
      expect(travel.content, w).toContain(w);
    }
  });

  it("gives the shared foes table a d12 for each new realm, naming each roster foe", () => {
    const foes = world.find((n) => n.id.endsWith("table-foes"))!.content;
    const realms: [string, string][] = [
      ["thornmere", "Thornmere"],
      ["emberhold", "Emberhold"],
      ["hollow-sky", "Hollow Sky"],
    ];
    for (const [realm, heading] of realms) {
      const section = foes.split(`## ${heading} foes (1d12)`)[1].split("## ")[0];
      const rows = section.split("\n").filter((l) => /^\d+\. /.test(l));
      expect(rows, heading).toHaveLength(12);
      const note = REALM_NOTES.find((n) => n.id.endsWith(`realm-${realm}`))!;
      const names = [...note.content.matchAll(/^\*\*(.+?)\*\* — DC /gm)].map((m) => m[1]);
      expect(names).toHaveLength(12);
      for (const n of names) expect(section, n).toContain(n.split(",")[0].replace(/^The /, ""));
    }
  });

  it("starts a history of one for every new note and appends to the changed ones", () => {
    for (const r of NEW_REALMS) {
      expect(BUILTIN_NOTE_HISTORY[`builtin:fantastic-realms:realm-${r}`], r).toHaveLength(1);
      expect(BUILTIN_NOTE_HISTORY[`builtin:fantastic-realms:realm-${r}-tables`], r).toHaveLength(1);
    }
    expect(BUILTIN_NOTE_HISTORY["builtin:fantastic-realms:legends"].length).toBeGreaterThanOrEqual(2);
    expect(BUILTIN_NOTE_HISTORY["builtin:fantastic-realms:crossroads"].length).toBeGreaterThanOrEqual(2);
  });
});

describe("built-in Fantastic Realms notes keep the starter's secrets", () => {
  // Rules and realm notes are player-visible (Lore page, party phones), so
  // they must not carry what a starter's campaign hides: Wolfwillow Crossing's
  // secrets name the barrow king, and finding his name is the best ending.
  // Common words that must stay in the shared notes (the Barrow King is a
  // legend's title) are allowed explicitly.
  const ALLOWED = new Set(["king"]);
  const phrases = (wolfwillowCampaign().secrets ?? [])
    .flatMap((s) => s.keyPhrases ?? [])
    .map((p) => p.toLowerCase())
    .filter((p) => !ALLOWED.has(p));

  it("finds the secrets' key phrases to check", () => {
    expect(phrases).toEqual(expect.arrayContaining(["hollin", "greycrown", "lantern promise", "grandfather"]));
  });

  it("puts no starter secret key phrase in any rules, realm, legend or table note", () => {
    for (const pack of FANTASTIC_REALMS.packs) {
      for (const note of pack.notes) {
        const text = note.content.toLowerCase();
        for (const p of phrases) expect(text, `${note.title} contains "${p}"`).not.toContain(p);
      }
    }
  });

  it("titles the Larkenfell legend without a name and says the name is lost", () => {
    expect(legends.content).toContain("## The Barrow King (Larkenfell)");
    expect(legends.content).toContain("His name is lost");
  });
});

describe("FR — Legends (E4)", () => {
  it("is under the 2,500-token read cap", () => {
    const t = tokens(legends.content);
    console.log(`FR — Legends tokens: ${t}`);
    expect(t).toBeLessThanOrEqual(2500);
  });

  it("gives each realm one legend, its first line the realm roster's last line verbatim", () => {
    expect(REALM_NOTES).toHaveLength(6);
    for (const note of REALM_NOTES) {
      const lines = note.content.split("\n").filter((l) => l.startsWith("**") && l.includes(" — DC "));
      expect(legends.content, note.title).toContain(lines[lines.length - 1]);
    }
  });

  it("gives every legend a lair, a weakness and phases whose heart marks descend", () => {
    const sections = legends.content
      .split(/^## /m)
      .filter((s) => /\((?:Aurelane|Larkenfell|Gloamreach|Thornmere|Emberhold|the Hollow Sky)\)$/.test(s.split("\n")[0]));
    expect(sections).toHaveLength(6);
    for (const s of sections) {
      const name = s.split("\n")[0];
      expect(s, name).toContain("**Lair:**");
      expect(s, name).toContain("**Weakness:**");
      const lines = s.split("\n");
      const first = FIRST.exec(lines.find((l) => FIRST.test(l)) ?? "")!;
      expect(first, name).not.toBeNull();
      const dc = Number(first[1]);
      const hearts = Number(first[2]);
      expect(Number(first[3]), name).toBe(dc * 1000);
      expect(hearts, name).toBeGreaterThanOrEqual(5);
      const phases = lines.map((l) => PHASE.exec(l)).filter((x): x is RegExpExecArray => x !== null);
      expect(phases.length, name).toBeGreaterThanOrEqual(1);
      expect(phases.length, name).toBeLessThanOrEqual(2);
      let prevMark = hearts;
      let prevPhase = 1;
      for (const p of phases) {
        expect(Number(p[2]), `${name} phase order`).toBe(prevPhase + 1);
        const pdc = Number(p[3]);
        const mark = Number(p[5]);
        expect(pdc, p[0]).toBeGreaterThanOrEqual(2);
        expect(pdc, p[0]).toBeLessThanOrEqual(6);
        expect(mark, `${p[0]} mark descends`).toBeLessThan(prevMark);
        expect(mark, p[0]).toBeGreaterThanOrEqual(1);
        prevMark = mark;
        prevPhase = Number(p[2]);
      }
    }
  });
});
