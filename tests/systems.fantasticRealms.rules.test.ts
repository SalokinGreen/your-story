/**
 * Fantastic Realms expansion E2 (docs/fr-expansion-plan.md): the nine rules
 * notes, the rewritten core and what they must agree with in the engine.
 */
import { describe, expect, it } from "vitest";
import { getEncoding } from "js-tiktoken";
import { FANTASTIC_REALMS } from "@/app/misc/systems/fantastic-realms";
import { CORE_NOTE } from "@/app/misc/systems/fantastic-realms/core";
import { BESTIARY_NOTE } from "@/app/misc/systems/fantastic-realms/rules/bestiary";
import { CALLINGS_NOTE } from "@/app/misc/systems/fantastic-realms/rules/callings";
import { CONDITIONS_NOTE } from "@/app/misc/systems/fantastic-realms/rules/conditions";
import { GEAR_NOTE } from "@/app/misc/systems/fantastic-realms/rules/gear";
import { MAGIC_NOTE } from "@/app/misc/systems/fantastic-realms/rules/magic";
import { manageFeatsActions } from "./helpers/frActions";
import { checkTableShape } from "./helpers/tableShape";

const enc = getEncoding("cl100k_base");
const tokens = (s: string) => enc.encode(s).length;
const rules = FANTASTIC_REALMS.packs[0].notes;
const all = FANTASTIC_REALMS.packs.flatMap((p) => p.notes);

const NEW_IDS = [
  "magic",
  "gear",
  "conditions",
  "callings",
  "bestiary",
  "legends",
  "travel",
  "downtime",
  "group",
].map((s) => `builtin:fantastic-realms:${s}`);

describe("Fantastic Realms rules notes (E2)", () => {
  it("gathers the nine new notes into the rules pack as on-demand mechanics notes", () => {
    for (const id of NEW_IDS) {
      const n = rules.find((r) => r.id === id);
      expect(n, id).toBeDefined();
      expect(n!.type).toBe("mechanics");
      expect(n!.scope).toBeUndefined();
    }
    expect(rules).toHaveLength(4 + 9);
  });

  it("keeps the core under 3,000 tokens and every rules note under the 2,500 read cap", () => {
    const sizes = rules.map((n) => `${n.title}: ${tokens(n.content)}`);
    console.log(`FR rules note tokens\n${sizes.join("\n")}`);
    expect(tokens(CORE_NOTE.content)).toBeLessThanOrEqual(3000);
    for (const n of rules) {
      if (n.id === CORE_NOTE.id) continue;
      expect(tokens(n.content), n.title).toBeLessThanOrEqual(2500);
    }
  });

  it("makes every table note pass the shape check", () => {
    for (const t of all.filter((n) => n.type === "table")) {
      expect(checkTableShape(t.title, t.content), t.title).toEqual([]);
    }
  });

  it("names every tool and every manage_feats action in the core", () => {
    for (const t of FANTASTIC_REALMS.tools!) expect(CORE_NOTE.content, t).toContain(t);
    for (const t of ["increment_scene", "start_challenge"]) {
      // start_challenge is taught in FR — Travel; the core names the scene tool.
      if (t === "increment_scene") expect(CORE_NOTE.content).toContain(t);
    }
    for (const a of manageFeatsActions()) {
      expect(CORE_NOTE.content, `manage_feats ${a}`).toContain(a);
    }
    for (const p of ["hindered_by", "help", "team_burn", "target", "burn"]) {
      expect(CORE_NOTE.content, p).toContain(p);
    }
  });

  it("indexes every new note by title in the core", () => {
    for (const title of [
      "FR — Magic",
      "FR — Gear",
      "FR — Conditions",
      "FR — Callings",
      "FR — Bestiary",
      "FR — Legends",
      "FR — Travel",
      "FR — Downtime",
      "FR — Group play",
    ]) {
      expect(CORE_NOTE.content, title).toContain(title);
    }
  });

  it("states the engine's own numbers in the core", () => {
    const c = CORE_NOTE.content;
    expect(c).toContain("never under one die");
    expect(c).toContain("three conditions that are not scars");
    expect(c).toContain("Twice per party rest");
    expect(c).toContain("Never more than two");
  });
});

describe("FR — Magic", () => {
  it("offers about forty example spell feats", () => {
    const section = MAGIC_NOTE.content.split("## Forty spell feats to borrow")[1].split("## Running a spell")[0];
    const names = section
      .split("\n")
      .filter((l) => l.startsWith("**"))
      .flatMap((l) => l.replace(/^\*\*[^*]+\*\*\s*/, "").replace(/\.$/, "").split(";"))
      .map((s) => s.trim())
      .filter(Boolean);
    expect(names.length).toBe(40);
    expect(new Set(names.map((n) => n.toLowerCase())).size).toBe(40);
  });
});

describe("FR — Gear", () => {
  it("defines all twelve item qualities named in structs.ts", () => {
    for (const q of [
      "Keen",
      "Sturdy",
      "Warded",
      "Swift",
      "Bright",
      "Cursed",
      "Hardy",
      "Silent",
      "Blessed",
      "Returning",
      "Masterwork",
      "Heirloom",
    ]) {
      expect(GEAR_NOTE.content, q).toContain(`**${q}.**`);
    }
  });
});

describe("FR — Conditions", () => {
  it("lists sixteen conditions with their cures", () => {
    const section = CONDITIONS_NOTE.content.split("## Sixteen conditions")[1].split("## Scars")[0];
    const lines = section.split("\n").filter((l) => l.startsWith("- **"));
    expect(lines).toHaveLength(16);
    expect(section).toContain("Cure: an antidote or a healer");
    expect(section).toContain("Cure: the curse broken");
  });
});

describe("FR — Callings", () => {
  const section = CALLINGS_NOTE.content.split("## The twelve")[1].split("## Using a move")[0];
  const blocks = section.split("\n\n").map((b) => b.trim()).filter((b) => b.startsWith("**"));

  it("has twelve callings with a signature, a kit of five, eight path feats and a move", () => {
    expect(blocks).toHaveLength(12);
    const names = blocks.map((b) => b.match(/^\*\*([^.]+)\.\*\*/)![1]);
    expect(names).toEqual([
      "Knight",
      "Witch",
      "Rogue",
      "Bard",
      "Ranger",
      "Priest",
      "Tinker",
      "Sellsword",
      "Scholar",
      "Hedge-Walker",
      "Duelist",
      "Wanderer",
    ]);
    for (const b of blocks) {
      expect(b, b).toMatch(/Signature: \*[^*]+\*\./);
      const kit = b.match(/Kit: ([^.]+)\./)![1].split(";");
      expect(kit, b).toHaveLength(5);
      const path = b.match(/Path: ([^.]+)\./)![1].split(";");
      expect(path, b).toHaveLength(8);
      expect(b, b).toMatch(/Move \*[^*]+\*:/);
    }
  });
});

describe("FR — Bestiary", () => {
  it("lists twenty words in four kinds", () => {
    const section = BESTIARY_NOTE.content.split("## The twenty words")[1].split("## Tactics by kind")[0];
    const words = [...section.matchAll(/\*\*([A-Z][A-Za-z-]+(?: [A-Za-z-]+)?)\*\* \(/g)].map((m) => m[1])
      .filter((w) => !w.endsWith(" words"));
    expect(words).toHaveLength(20);
    expect(new Set(words).size).toBe(20);
    for (const kind of ["Harm words", "Edge words", "Guard words", "Strange words"]) {
      expect(section).toContain(`**${kind}**`);
    }
  });
});

describe("review fixes", () => {
  const byId = (id: string) => rules.find((n) => n.id === `builtin:fantastic-realms:${id}`)!;

  it("tells the GM to leave target out when a hit cannot hurt the foe", () => {
    expect(BESTIARY_NOTE.content).toContain("leave target out of that feat_roll");
    expect(CORE_NOTE.content).toContain("leave target out");
  });

  it("hedges what the realms add later", () => {
    expect(MAGIC_NOTE.content).toContain("added with the realms in a later release");
    expect(CALLINGS_NOTE.content).toContain("with the realms in a later release");
  });

  it("states the journey length and names the hero for a hearth use", () => {
    expect(byId("travel").content).toContain("rounds = the days, 2 to 5");
    expect(byId("downtime").content).toContain("manage_feats use with hero");
  });
});
