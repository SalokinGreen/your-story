/**
 * The campaign record in the Game Designer (campaign-format-plan slice 4):
 * `write_campaign`, the draft <-> adventure round trip, the draft summary with
 * its authoring warnings, starting a story from the adventure, and old
 * adventures without a record.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import {
  createEmptyDraft,
  adventureToDraft,
  draftToAdventure,
  executeDesignerTool,
  executeDesignerTools,
  summarizeDraft,
} from "@/app/misc/designer_executor";
import type { AdventureDraft, DesignerToolCall } from "@/app/misc/designer_executor";
import { DESIGNER_TOOLS, getDesignerToolsForAPI } from "@/app/misc/designer_tools";
import { buildDesignerMessages } from "@/app/misc/designer_ai";
import { campaignWarnings } from "@/app/misc/campaign/validate";
import { emptyCampaign } from "@/app/misc/campaign/types";
import { removeCampaignPart, resetCampaignPlayState } from "@/app/misc/campaign/designer";
import { getLocalStory, startAdventureLocally } from "@/app/misc/localStoryManager";

class MemoryStorage {
  private map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.has(key) ? this.map.get(key)! : null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, String(value));
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
  clear(): void {
    this.map.clear();
  }
}

beforeEach(() => {
  vi.stubGlobal("indexedDB", new IDBFactory());
  vi.stubGlobal("localStorage", new MemoryStorage());
});

let n = 0;
function write(args: Record<string, unknown>, draft: AdventureDraft) {
  const call: DesignerToolCall = { id: `c${++n}`, name: "write_campaign", arguments: args };
  return executeDesignerTool(call, draft);
}

function withNpc(draft: AdventureDraft): AdventureDraft {
  return {
    ...draft,
    npcs: [
      {
        id: "npc_runa",
        name: "Runa",
        description: "A courier",
        role: "Witness",
        status: "alive",
        relationship: "",
        attitude: "neutral",
        createdAt: 1,
      },
    ],
  };
}

/** A mystery with a front, its clock, a secret with three clues and a person. */
function buildMystery(): AdventureDraft {
  let d = withNpc(createEmptyDraft());
  const steps: Record<string, unknown>[] = [
    { action: "add", part: "style", data: { style: "mystery" } },
    { action: "add", part: "pitch", data: { premise: "Who sank the ferry?", tone: ["wet", "tense"] } },
    { action: "add", part: "safety", data: { lines: [{ text: "harm to children", keywords: ["child"] }], veils: [] } },
    { action: "add", part: "clock", data: { name: "The tide turns", segments: 6, triggers: ["scene"] } },
    {
      action: "add",
      part: "secret",
      data: {
        title: "The ferryman lied",
        truth: "He opened the sluice himself.",
        keyPhrases: ["sluice"],
        clues: [{ text: "A wet key", where: "his coat" }, { text: "A log with a torn page" }, { text: "Runa's sketch" }],
      },
    },
    { action: "add", part: "person", data: { npcId: "npc_runa", want: "to leave town" } },
  ];
  for (const s of steps) {
    const out = write(s, d);
    expect(out.result.error, JSON.stringify(s)).toBeUndefined();
    d = out.draft;
  }
  const clockId = d.campaign!.clocks[0].id;
  const front = write(
    {
      action: "add",
      part: "front",
      data: { name: "The Flood", doom: "The quarter drowns", dangers: [{ name: "The tide", impulse: "to rise" }], clockId },
    },
    d,
  );
  expect(front.result.error).toBeUndefined();
  return front.draft;
}

describe("write_campaign tool", () => {
  it("is registered with the Designer's tools and sent to the API", () => {
    expect(DESIGNER_TOOLS.map((t) => t.name)).toContain("write_campaign");
    expect(getDesignerToolsForAPI().map((t) => t.function.name)).toContain("write_campaign");
  });

  it("builds a record part by part, with engine-made ids and linked clocks", () => {
    const d = buildMystery();
    const c = d.campaign!;
    expect(c.version).toBe(1);
    expect(c.style).toBe("mystery");
    expect(c.pitch?.tone).toEqual(["wet", "tense"]);
    expect(c.safety?.lines[0].id).toMatch(/^saf_/);
    expect(c.clocks[0].id).toMatch(/^clk_/);
    expect(c.fronts[0].clockId).toBe(c.clocks[0].id);
    // The front named the clock, so the clock points back at the front.
    expect(c.clocks[0].link).toEqual({ kind: "front", id: c.fronts[0].id });
    expect(c.secrets[0].clues).toHaveLength(3);
    expect(c.secrets[0].clues.every((x) => x.found === false)).toBe(true);
    expect(c.people[0]).toMatchObject({ npcId: "npc_runa", want: "to leave town" });
  });

  it("edits by id and removes by id", () => {
    let d = buildMystery();
    const fid = d.campaign!.fronts[0].id;
    let out = write({ action: "edit", part: "front", id: fid, data: { doom: "Everything drowns" } }, d);
    expect(out.result.error).toBeUndefined();
    d = out.draft;
    expect(d.campaign!.fronts[0].doom).toBe("Everything drowns");
    expect(d.campaign!.fronts[0].name).toBe("The Flood");

    out = write({ action: "remove", part: "clock", id: d.campaign!.clocks[0].id }, d);
    expect(out.result.error).toBeUndefined();
    expect(out.draft.campaign!.clocks).toHaveLength(0);
    // The dangling link is cleared, not left pointing at nothing.
    expect(out.draft.campaign!.fronts[0].clockId).toBeUndefined();
  });

  it("names the repair when validation refuses, and leaves the draft byte-identical", () => {
    const d = buildMystery();
    const before = JSON.stringify(d);
    const cases: [Record<string, unknown>, RegExp][] = [
      [{ action: "add", part: "faction", data: { name: "Guild" } }, /faction needs `goal`/],
      [{ action: "add", part: "clock", data: { name: "x", segments: 5 } }, /4, 6 or 8/],
      [{ action: "add", part: "person", data: { npcId: "nobody", want: "x" } }, /Valid ids: npc_runa/],
      [{ action: "add", part: "beat", data: { title: "a", summary: "b" } }, /adventure_path/],
      [{ action: "edit", part: "front", id: "frt_nope", data: { doom: "x" } }, /Unknown front id/],
      [{ action: "add", part: "clock", data: { name: "x", segments: 4, triggers: ["rest"] } }, /can never fire/],
      [{ action: "add", part: "front" }, /needs `data`/],
      [{ action: "nuke", part: "front" }, /needs `action`/],
      [{ action: "add", part: "wat", data: {} }, /needs `part`/],
    ];
    for (const [args, re] of cases) {
      const out = write(args, d);
      expect(out.result.error, JSON.stringify(args)).toMatch(re);
      expect(out.draft).toBe(d);
      expect(JSON.stringify(out.draft)).toBe(before);
    }
  });

  it("does not mutate the draft's record when a write succeeds", () => {
    const d = buildMystery();
    const before = JSON.stringify(d.campaign);
    const out = write({ action: "add", part: "end_state", data: { text: "The ferry is raised" } }, d);
    expect(out.result.error).toBeUndefined();
    expect(JSON.stringify(d.campaign)).toBe(before);
    expect(out.draft.campaign).not.toBe(d.campaign);
    expect(out.draft.campaign!.endStates).toHaveLength(1);
  });

  it("accepts data as a JSON string", () => {
    const out = write({ action: "add", part: "style", data: '{"style":"horror"}' }, createEmptyDraft());
    expect(out.result.error).toBeUndefined();
    expect(out.draft.campaign?.style).toBe("horror");
  });

  it("allows rest and session triggers once the draft holds a system that fires them", () => {
    const d: AdventureDraft = {
      ...createEmptyDraft(),
      systemState: { usesSystemTools: true, systemId: "blood-and-bone" },
    };
    const out = write({ action: "add", part: "clock", data: { name: "Dawn", segments: 4, triggers: ["session"] } }, d);
    expect(out.result.error).toBeUndefined();
  });

  it("runs in a batch through executeDesignerTools", () => {
    const { draft, results } = executeDesignerTools(
      [
        { id: "1", name: "write_campaign", arguments: { action: "add", part: "style", data: { style: "sandbox" } } },
        { id: "2", name: "write_campaign", arguments: { action: "add", part: "faction", data: { name: "Guild", goal: "own the docks" } } },
      ],
      createEmptyDraft(),
    );
    expect(results.map((r) => r.error)).toEqual([undefined, undefined]);
    expect(draft.campaign?.factions[0].id).toMatch(/^fac_/);
  });
});

describe("campaignWarnings", () => {
  it("flags a missing style, a thin mystery secret and a front with no clock", () => {
    const c = emptyCampaign();
    expect(campaignWarnings(c)).toHaveLength(1);
    c.style = "mystery";
    c.secrets.push({ id: "s", title: "Thin", truth: "t", keyPhrases: [], revealed: false, clues: [{ id: "a", text: "x", found: false }] });
    c.fronts.push({ id: "f", name: "Storm", dangers: [], portents: [], doom: "d", stakes: [], status: "active" });
    const w = campaignWarnings(c);
    expect(w.some((x) => /"Thin" has 1 clue;/.test(x))).toBe(true);
    expect(w.some((x) => /Front "Storm" has no clock/.test(x))).toBe(true);
    expect(w.some((x) => /No style/.test(x))).toBe(false);
  });

  it("is quiet for a complete mystery, and does not ask other styles for three clues", () => {
    expect(campaignWarnings(buildMystery().campaign!)).toEqual([]);
    const c = emptyCampaign();
    c.style = "sandbox";
    c.secrets.push({ id: "s", title: "Thin", truth: "t", keyPhrases: [], revealed: false, clues: [] });
    expect(campaignWarnings(c)).toEqual([]);
  });

  it("treats a clockId that points at a missing clock as no clock", () => {
    const c = emptyCampaign();
    c.style = "horror";
    c.fronts.push({ id: "f", name: "Storm", dangers: [], portents: [], doom: "d", stakes: [], clockId: "gone", status: "active" });
    expect(campaignWarnings(c)).toHaveLength(1);
  });
});

describe("summarizeDraft and the Designer prompt", () => {
  it("lists the record with ids and the warnings", () => {
    let d = buildMystery();
    expect(summarizeDraft(d)).toContain("Campaign record: style mystery");
    expect(summarizeDraft(d)).toContain(d.campaign!.fronts[0].id);
    expect(summarizeDraft(d)).toContain('"Runa"');
    expect(summarizeDraft(d)).not.toContain("WARNING");
    d = write({ action: "remove", part: "clock", id: d.campaign!.clocks[0].id }, d).draft;
    expect(summarizeDraft(d)).toMatch(/WARNING: Front "The Flood" has no clock/);
  });

  it("says plainly when there is no record yet", () => {
    expect(summarizeDraft(createEmptyDraft())).toContain("Campaign record: none yet");
  });

  it("teaches session zero, the campaign and reading notes by title", () => {
    const [system] = buildDesignerMessages({ history: [], draft: createEmptyDraft() });
    const text = String(system.content);
    expect(text).toContain("session zero");
    expect(text).toContain("write_campaign");
    expect(text).toContain("by title");
    expect(text).not.toContain("pulled in by keyword");
    for (const style of ["Sandbox", "Adventure path", "Mystery", "Horror", "Episodic", "Slice of life", "Solo"]) {
      expect(text).toContain(`**${style}**`);
    }
    for (const starter of ["Hollow Hour", "Grave Watcher", "Last Resort", "Wolfwillow"]) {
      expect(text).toContain(starter);
    }
  });
});

describe("conversions", () => {
  it("round-trips the record through draftToAdventure and adventureToDraft", () => {
    const d = buildMystery();
    const adventure = draftToAdventure(d);
    expect(adventure.storyTemplate?.campaign).toEqual(d.campaign);
    // A copy, not the draft's own object.
    expect(adventure.storyTemplate?.campaign).not.toBe(d.campaign);
    const back = adventureToDraft(JSON.parse(JSON.stringify(adventure)));
    expect(back.campaign).toEqual(d.campaign);
    expect(draftToAdventure(back).storyTemplate?.campaign).toEqual(d.campaign);
  });

  it("an adventure with no record converts to a draft and back with no campaign key", () => {
    const d = createEmptyDraft();
    const adventure = draftToAdventure(d);
    expect("campaign" in (adventure.storyTemplate ?? {})).toBe(false);
    const back = adventureToDraft(adventure);
    expect("campaign" in back).toBe(false);
    expect("campaign" in draftToAdventure(back).storyTemplate!).toBe(false);
  });
});

describe("starting a story from an adventure with a record", () => {
  it("gives the story its own copy of the record", async () => {
    const adventure = draftToAdventure(buildMystery());
    const id = await startAdventureLocally(adventure);
    const saved = await getLocalStory(id);
    const story = saved!.storyData;
    expect(story.campaign).toEqual(adventure.storyTemplate!.campaign);
    expect(story.campaign).not.toBe(adventure.storyTemplate!.campaign);
    story.campaign!.clocks[0].filled = 3;
    expect(adventure.storyTemplate!.campaign!.clocks[0].filled).toBe(0);
  });

  it("an old adventure without a record starts a story with none", async () => {
    const id = await startAdventureLocally(draftToAdventure(createEmptyDraft()));
    const saved = await getLocalStory(id);
    expect(saved!.storyData.campaign).toBeUndefined();
    expect("campaign" in saved!.storyData).toBe(false);
  });
});

describe("removeCampaignPart and resetCampaignPlayState", () => {
  it("removes by name and lists valid ids on a miss", () => {
    const c = buildMystery().campaign!;
    const bad = removeCampaignPart(c, "secret", "nope");
    expect(bad.ok).toBe(false);
    const ok = removeCampaignPart(c, "secret", "The ferryman lied");
    expect(ok.ok).toBe(true);
    expect(c.secrets).toHaveLength(0);
  });

  it("puts clocks, clues and beats back at the start", () => {
    const c = buildMystery().campaign!;
    c.clocks[0].filled = 4;
    c.clocks[0].crossed = [2];
    c.clocks[0].paused = true;
    c.secrets[0].clues[0].found = true;
    c.secrets[0].revealed = true;
    c.fronts[0].status = "doomed";
    c.beats = {
      list: [
        { id: "a", title: "A", summary: "", status: "done" },
        { id: "b", title: "B", summary: "", status: "current" },
      ],
      currentId: "b",
    };
    const fresh = resetCampaignPlayState(c);
    expect(fresh.clocks[0]).toMatchObject({ filled: 0, crossed: [], paused: false });
    expect(fresh.secrets[0].clues.every((x) => !x.found)).toBe(true);
    expect(fresh.secrets[0].revealed).toBe(false);
    expect(fresh.fronts[0].status).toBe("active");
    expect(fresh.beats?.currentId).toBe("a");
    expect(fresh.beats?.list.map((b) => b.status)).toEqual(["current", "pending"]);
    // The input is untouched.
    expect(c.clocks[0].filled).toBe(4);
  });
});
