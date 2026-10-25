/**
 * Slice 5 of the campaign format (docs/campaign-format-plan.md, decision 224):
 * the four built-in starters ship a complete campaign record. Each is checked
 * the way the Designer's and the GM's tools would check it (every part through
 * `validatePart`), for the authoring rules (a mystery secret has three clues,
 * a front has a clock), for the links between its parts, for what the player
 * and the setup card may see, and for the `campaign_review` step.
 */
import { describe, expect, it } from "vitest";
import { campaignRecordReady, hasCampaignPlan } from "@/app/misc/campaignPlan";
import { formatCampaignBrief } from "@/app/misc/campaign/brief";
import { publicCampaignView } from "@/app/misc/campaign/publicView";
import { STYLE_SPECS, missingStyleParts } from "@/app/misc/campaign/styles";
import type { CampaignRecord, CampaignStyle } from "@/app/misc/campaign/types";
import { campaignWarnings, validatePart } from "@/app/misc/campaign/validate";
import type { CampaignPart, ValidationContext } from "@/app/misc/campaign/validate";
import { buildSessionZeroBlock } from "@/app/misc/ai_staged";
import { executeCampaign } from "@/app/misc/campaign/executor";
import { adventureToDraft, draftToAdventure } from "@/app/misc/designer_executor";
import { estimateTokens } from "@/app/misc/tokenCounter";
import { getCreationSteps } from "@/app/misc/setupSteps";
import type { StoryData } from "@/app/misc/structs";
import { BLOOD_AND_BONE } from "@/app/misc/systems/blood-and-bone";
import { FANTASTIC_REALMS } from "@/app/misc/systems/fantastic-realms";
import { resolveSystem } from "@/app/misc/systems/resolve";
import type { BuiltinAdventure } from "@/app/misc/systems/types";

interface Spec {
  id: string;
  style: CampaignStyle;
  starter: BuiltinAdventure;
  /** Words a player must not meet on the setup card: culprits' names and truths. */
  banned: string[];
}

const byId = (list: BuiltinAdventure[], id: string): BuiltinAdventure => {
  const found = list.find((s) => s.id === id);
  if (!found) throw new Error(`missing starter ${id}`);
  return found;
};

const SPECS: Spec[] = [
  {
    id: "The Hollow Hour",
    style: "mystery",
    starter: byId(BLOOD_AND_BONE.starters, "builtin:blood-and-bone:hollow-hour"),
    banned: ["Runa", "Sandhu", "Callum", "fledgling", "maker", "Salon", "nest", "Mum"],
  },
  {
    id: "Grave Watcher",
    style: "slice_of_life",
    starter: byId(BLOOD_AND_BONE.starters, "builtin:blood-and-bone:grave-watcher"),
    banned: ["Tally", "Teddy", "Vance", "Ashcombe", "strongbox", "Hendricks", "sixty-three", "Annabel", "Ines", "Pell", "hearse", "cellar", "buried", "Greaves"],
  },
  {
    id: "The Last Resort",
    style: "sandbox",
    starter: byId(BLOOD_AND_BONE.starters, "builtin:blood-and-bone:last-resort"),
    banned: ["Boarder", "Room 0", "Corbin", "Vane", "Last Dance", "Gideon", "Sunday plate", "service stairs", "spa"],
  },
  {
    id: "Wolfwillow Crossing",
    style: "adventure_path",
    starter: byId(FANTASTIC_REALMS.starters, "builtin:fantastic-realms:wolfwillow-crossing"),
    banned: ["Hollin", "Greycrown", "king", "lantern promise", "grandfather", "Warchief", "Redthistle"],
  },
];

/** The story a player would start: the template's own fields, as a story. */
function storyFor(spec: Spec): StoryData {
  const tpl = structuredClone(spec.starter.adventure.storyTemplate!);
  return { ...tpl, threads: [], lore: tpl.lore ?? [], npcs: tpl.npcs ?? [] } as unknown as StoryData;
}

function ctxFor(story: StoryData, record: CampaignRecord): ValidationContext {
  return {
    isNew: true,
    record,
    npcs: story.npcs.map((n) => ({ id: n.id, name: n.name })),
    threads: [],
    beatsAllowed: record.style === "adventure_path",
    fireableTriggers: ["manual", "scene", "miss", ...resolveSystem(story).tools.filter((t) => t === "take_rest" || t === "end_session").map((t) => (t === "take_rest" ? "rest" : "session"))],
  };
}

/** Every string the player must never see, per part of the record. */
function secretTexts(record: CampaignRecord): string[] {
  return [
    ...record.secrets.flatMap((s) => [s.truth, ...s.clues.map((c) => c.text)]),
    ...record.fronts.flatMap((f) => [f.doom, ...f.portents.map((p) => p.text), ...f.dangers.map((d) => d.impulse)]),
    ...record.people.flatMap((p) => [p.want, p.secret, p.voice].filter((x): x is string => !!x)),
    ...record.clocks.map((c) => c.onFill).filter((x): x is string => !!x),
    ...(record.beats?.list.map((b) => b.summary) ?? []),
    ...record.endStates.map((e) => e.text),
  ];
}

for (const spec of SPECS) {
  describe(`${spec.id}: its campaign record`, () => {
    const story = storyFor(spec);
    const record = story.campaign!;

    it("is shipped as a starter's record, in the style the design assigns", () => {
      expect(record).toBeDefined();
      expect(record.version).toBe(1);
      expect(record.origin).toBe("starter");
      expect(record.style).toBe(spec.style);
    });

    it("is ready to start on, with every part its style expects and no authoring warning", () => {
      expect(campaignRecordReady(story)).toBe(true);
      expect(hasCampaignPlan(story)).toBe(true);
      expect(missingStyleParts(record)).toEqual([]);
      expect(campaignWarnings(record)).toEqual([]);
    });

    it("has every part valid through validatePart", () => {
      const ctx = ctxFor(story, record);
      const check = (part: CampaignPart, data: unknown) => {
        const v = validatePart(part, data, ctx);
        expect(v.ok, `${part}: ${v.ok ? "" : v.error}`).toBe(true);
      };
      check("style", { style: record.style });
      check("pitch", record.pitch);
      for (const f of record.factions) check("faction", f);
      for (const f of record.fronts) check("front", f);
      for (const c of record.clocks) check("clock", c);
      for (const p of record.people) check("person", p);
      for (const s of record.secrets) check("secret", s);
      for (const l of record.locations) check("location", l);
      for (const b of record.beats?.list ?? []) check("beat", b);
      for (const e of record.endStates) check("end_state", e);
      if (record.safety) check("safety", record.safety);
    });

    it("links its parts by ids that exist, each id once", () => {
      const ids = [
        ...record.factions.map((x) => x.id),
        ...record.fronts.map((x) => x.id),
        ...record.clocks.map((x) => x.id),
        ...record.secrets.flatMap((s) => [s.id, ...s.clues.map((c) => c.id)]),
        ...record.locations.map((x) => x.id),
        ...record.endStates.map((x) => x.id),
        ...(record.beats?.list.map((b) => b.id) ?? []),
      ];
      expect(new Set(ids).size).toBe(ids.length);
      for (const f of record.fronts) {
        const clk = record.clocks.find((c) => c.id === f.clockId);
        expect(clk, `front ${f.name} has a clock`).toBeDefined();
        expect(clk!.link).toEqual({ kind: "front", id: f.id });
        for (const p of f.portents) {
          expect(p.at, `portent "${p.text}"`).toBeGreaterThanOrEqual(1);
          expect(p.at).toBeLessThanOrEqual(clk!.segments);
        }
      }
      for (const fac of record.factions) {
        if (!fac.clockId) continue;
        const clk = record.clocks.find((c) => c.id === fac.clockId);
        expect(clk?.link).toEqual({ kind: "faction", id: fac.id });
      }
      for (const c of record.clocks) {
        if (!c.link) continue;
        const pool = c.link.kind === "front" ? record.fronts : record.factions;
        expect(pool.some((p) => p.id === c.link!.id), `clock ${c.name}`).toBe(true);
      }
      const npcIds = new Set(story.npcs.map((n) => n.id));
      for (const p of record.people) expect(npcIds.has(p.npcId), p.npcId).toBe(true);
      expect(new Set(record.people.map((p) => p.npcId)).size).toBe(record.people.length);
      for (const l of record.locations) for (const id of l.npcIds) expect(npcIds.has(id), id).toBe(true);
      if (record.beats) {
        expect(record.beats.list.filter((b) => b.status === "current")).toHaveLength(1);
        expect(record.beats.list.some((b) => b.id === record.beats!.currentId)).toBe(true);
      }
    });

    it("starts with nothing played: no fill, no found clue, no revealed secret, no crossed portent", () => {
      for (const c of record.clocks) {
        expect(c.filled).toBe(0);
        expect(c.paused).toBe(false);
        expect(c.crossed).toEqual([]);
      }
      for (const s of record.secrets) {
        expect(s.revealed).toBe(false);
        expect(s.clues.every((c) => !c.found)).toBe(true);
      }
      for (const f of record.fronts) expect(f.status).toBe("active");
    });

    it("gives every secret three clues, found in different places", () => {
      expect(record.secrets.length).toBeGreaterThan(0);
      for (const s of record.secrets) {
        expect(s.clues.length, s.title).toBeGreaterThanOrEqual(3);
        const wheres = s.clues.map((c) => c.where);
        expect(wheres.every((w) => !!w)).toBe(true);
        expect(new Set(wheres).size, s.title).toBe(wheres.length);
      }
    });

    it("keeps secrets, dooms, portents and wants off the player's view", () => {
      const shown = JSON.stringify(publicCampaignView(record));
      for (const text of secretTexts(record)) expect(shown).not.toContain(text);
      for (const s of record.secrets) expect(shown).not.toContain(s.truth);
    });

    it("shows the player only what the characters can know at the start", () => {
      const shown = JSON.stringify(publicCampaignView(record));
      const words = [...spec.banned, ...record.secrets.flatMap((sec) => [sec.title, ...sec.keyPhrases])];
      for (const w of words) {
        const escaped = w.replace(/[^A-Za-z0-9 ]/g, "\$&");
        const re = new RegExp(`(^|[^A-Za-z])${escaped}([^A-Za-z]|$)`, "i");
        expect(re.test(shown), `"${w}" appears on the card`).toBe(false);
      }
    });

    it("has a brief inside its budget that holds no secret's truth", () => {
      const brief = formatCampaignBrief(story);
      expect(brief.length).toBeGreaterThan(0);
      expect(estimateTokens(brief)).toBeLessThanOrEqual(900);
      for (const s of record.secrets) expect(brief).not.toContain(s.truth);
    });

    it("survives the Designer round trip, and a started copy is independent", () => {
      const back = draftToAdventure(adventureToDraft(spec.starter.adventure));
      expect(back.storyTemplate?.campaign).toEqual(record);
      const copy = structuredClone(spec.starter.adventure.storyTemplate!.campaign!);
      copy.clocks[0].filled = 3;
      expect(spec.starter.adventure.storyTemplate!.campaign!.clocks[0].filled).toBe(0);
    });

    it("reviews the campaign in session zero instead of building it", () => {
      const steps = getCreationSteps({ ...story, setup: { mode: "full" } } as StoryData);
      const ids = steps.map((s) => s.id);
      expect(ids).toContain("campaign_review");
      expect(ids).not.toContain("campaign");
      const style = steps.find((s) => s.id === "style")!;
      expect(style.hint).toContain(STYLE_SPECS[spec.style].label);
      // A story without a shipped record still builds one.
      const plain = getCreationSteps({ ...story, campaign: undefined, setup: { mode: "full" } } as StoryData);
      expect(plain.map((s) => s.id)).toContain("campaign");
      expect(plain.map((s) => s.id)).not.toContain("campaign_review");
    });
  });
}

describe("the starters' clock pacing", () => {
  const rec = (id: string) => storyFor(SPECS.find((x) => x.id === id)!).campaign!;
  const clk = (id: string, cid: string) => rec(id).clocks.find((c) => c.id === cid)!;

  it("ticks the hunter on scenes only, and the goblins on scenes rather than every miss", () => {
    expect(clk("The Hollow Hour", "clk_hh_hunter").triggers).toEqual(["scene"]);
    expect(clk("Wolfwillow Crossing", "clk_ww_goblins").triggers).toEqual(["scene"]);
  });

  it("leaves the season and bank clocks to the GM, who ticks them with the calendar", () => {
    expect(clk("Grave Watcher", "clk_gw_season").triggers).toEqual(["manual"]);
    expect(clk("The Last Resort", "clk_lr_bank").triggers).toEqual(["manual"]);
  });
});

describe("the brief names a style without underscores", () => {
  it("prints slice of life", () => {
    const story = storyFor(SPECS[1]);
    expect(formatCampaignBrief(story)).toContain("slice of life");
    expect(formatCampaignBrief(story)).not.toContain("slice_of");
  });
});

describe("the starters' triggers can fire", () => {
  it("uses no `rest` trigger in Blood & Bone, which has no take_rest", () => {
    for (const spec of SPECS.filter((s) => s.starter.id.includes("blood-and-bone"))) {
      for (const c of storyFor(spec).campaign!.clocks) expect(c.triggers).not.toContain("rest");
    }
  });
});

describe("a started starter in session zero", () => {
  const spec = SPECS[0];

  it("tells the GM the campaign is built, and to review it rather than rebuild it", () => {
    const story = { ...storyFor(spec), sessionZeroActive: true, setup: { mode: "full" } } as StoryData;
    const block = buildSessionZeroBlock(story);
    expect(block).toContain("shipped with its campaign already built");
    expect(block).toContain("campaign_review");
    expect(block).not.toContain("build it with the `campaign` tool");
    expect(block).not.toContain("then build the campaign");
    expect(block).toContain("review the shipped campaign");
  });

  it("does not tell the GM to build the campaign once every step is covered", () => {
    const base = { ...storyFor(spec), sessionZeroActive: true, setup: { mode: "full" } } as StoryData;
    const steps = getCreationSteps(base);
    const covered = {
      table: steps.filter((st) => st.scope === "table").map((st) => st.id),
      players: { solo: steps.filter((st) => st.scope === "player").map((st) => st.id) },
    };
    const block = buildSessionZeroBlock({ ...base, setup: { mode: "full", covered } } as StoryData);
    expect(block).toContain("The campaign is already built");
    expect(block).not.toContain("write the sheet and build the campaign");
  });

  it("keeps the starter mark when the player changes the style, so the review step stays", () => {
    const story = storyFor(spec);
    const r = executeCampaign("c", { action: "edit", part: "style", data: { style: "horror" } }, story);
    expect(r.success).toBe(true);
    expect(story.campaign!.style).toBe("horror");
    expect(story.campaign!.origin).toBe("starter");
  });
});
