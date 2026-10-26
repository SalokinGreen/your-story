/**
 * Fantastic Realms expansion E5 (docs/fr-expansion-plan.md): the Wolfwillow
 * Crossing starter grown with the system: callings on the presets, the
 * journey and the legend in the plan, and no instruction that contradicts the
 * grown core.
 */
import { describe, expect, it } from "vitest";
import { FANTASTIC_REALMS } from "@/app/misc/systems/fantastic-realms";
import { ITEM_QUALITIES } from "@/app/misc/systems/fantastic-realms/engine";
import { WOLFWILLOW_HEROES } from "@/app/misc/systems/fantastic-realms/starters/wolfwillow-crossing/heroes";
import { wolfwillowCampaign } from "@/app/misc/systems/fantastic-realms/starters/wolfwillow-crossing/campaign";
import { WOLFWILLOW_NOTES } from "@/app/misc/systems/fantastic-realms/starters/wolfwillow-crossing/notes";
import { publicCampaignView } from "@/app/misc/campaign/publicView";

const rules = FANTASTIC_REALMS.packs[0].notes;
const callings = rules.find((n) => n.id === "builtin:fantastic-realms:callings")!.content;
const legends = rules.find((n) => n.id === "builtin:fantastic-realms:legends")!.content;

/** The calling's paragraph in FR — Callings: signature, kit and move. */
function callingLine(name: string): string {
  const line = callings.split("\n").find((l) => l.startsWith(`**${name}.**`));
  expect(line, `calling ${name}`).toBeDefined();
  return line!;
}

describe("Wolfwillow Crossing heroes follow callings (E5)", () => {
  it("gives each hero a real calling: the signature plus three from its kit", () => {
    expect(WOLFWILLOW_HEROES.map((h) => h.calling)).toEqual(["Sellsword", "Witch", "Bard"]);
    for (const h of WOLFWILLOW_HEROES) {
      const line = callingLine(h.calling);
      const signature = /Signature: \*([^*]+)\*/.exec(line)![1];
      const kit = /Kit: ([^.]+)\./.exec(line)![1].split(";").map((k) => k.trim());
      expect(h.feats[0], h.name).toBe(signature);
      for (const f of h.feats.slice(1)) {
        expect(kit.some((k) => k === f || f.endsWith(k)), `${h.name}: ${f}`).toBe(true);
      }
      expect(new Set(h.feats).size).toBe(4);
    }
  });

  it("writes the calling's own move on the sheet and in the engine notes", () => {
    for (const h of WOLFWILLOW_HEROES) {
      expect(callingLine(h.calling), h.move.name).toContain(`Move *${h.move.name}*: ${h.move.effect}`);
      const preset = FANTASTIC_REALMS.starters[0].adventure.presets!.find((p) => p.id === h.id)!;
      expect(preset.characterSheet).toContain(`**Calling:** ${h.calling}`);
      expect(preset.characterSheet).toContain(`*${h.move.name}*`);
      expect(preset.authorNotes).toContain(`manage_feats use (feat "${h.move.name}", per rest)`);
    }
  });

  it("names item feats among the four, with at most two valid qualities", () => {
    for (const h of WOLFWILLOW_HEROES) {
      expect(h.items.length).toBeGreaterThan(0);
      for (const i of h.items) {
        expect(h.feats).toContain(i.feat);
        expect(i.qualities.length).toBeLessThanOrEqual(2);
        for (const q of i.qualities) expect(ITEM_QUALITIES as readonly string[]).toContain(q);
      }
    }
  });
});

describe("Wolfwillow Crossing's plan carries a journey and a legend (E5)", () => {
  const record = wolfwillowCampaign();
  const beat = (id: string) => record.beats!.list.find((b) => b.id === id)!;

  it("runs the Hushwood trail as a tally journey on the party Supplies set", () => {
    expect(beat("bt_ww_3").summary).toMatch(/tally challenge/);
    expect(beat("bt_ww_3").summary).toContain("Fantastic Realms party");
    const running = WOLFWILLOW_NOTES.find((n) => n.title.endsWith("Running it"))!.content;
    expect(running).toContain('manage_meter create_set "Fantastic Realms party"');
    expect(running).toMatch(/tally challenge of three rounds/);
    // A tally journey is two to five rounds (FR — Travel).
    expect(running).toMatch(/route DC 3/);
  });

  it("plays the barrow king as FR — Legends' Barrow King, phases and all", () => {
    expect(legends).toContain("## The Barrow King (Larkenfell)");
    expect(legends).toContain("**The Barrow King** — DC 6");
    expect(legends).toMatch(/Phase 2\*\* — DC 5 · [^\n]*Hearts mark \(4\)/);
    expect(legends).toMatch(/Phase 3\*\* — DC 4 · [^\n]*Hearts mark \(2\)/);
    expect(beat("bt_ww_6").summary).toMatch(/DC 6 and 6 hearts, DC 5 at 4 hearts, DC 4 at 2/);
    const running = WOLFWILLOW_NOTES.find((n) => n.title.endsWith("Running it"))!.content;
    expect(running).toMatch(/DC 6 with 6 hearts, then DC 5 at 4 hearts[^.]*DC 4 at 2 hearts/);
  });

  it("keeps the king's name and the journey's secrets off the player's card", () => {
    const shown = JSON.stringify(publicCampaignView(record));
    for (const w of ["Hollin", "Greycrown", "king", "Barrow King", "Legends", "tally"]) {
      expect(shown.toLowerCase(), w).not.toContain(w.toLowerCase());
    }
  });

  it("does not tell the GM that the Mire Troll is the season's legend, or to roll for a foe", () => {
    const all = WOLFWILLOW_NOTES.map((n) => n.content).join("\n");
    expect(all).not.toMatch(/Mire Troll are legends/);
    expect(all).toContain("Only players roll");
  });
});
