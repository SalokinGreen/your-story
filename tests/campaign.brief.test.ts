import { beforeAll, describe, expect, it, vi } from "vitest";
import { buildGMStagePrompt, estimateTokens } from "@/app/misc/ai_staged";
import { formatCampaignBrief } from "@/app/misc/campaign/brief";
import { deriveStoryProgress } from "@/app/misc/campaign/progress";
import { selectDirectorMove, storyProgress } from "@/app/misc/mythic";
import type { StoryData } from "@/app/misc/structs";
import { DESIGN_FIXTURE, buildFixtureStory, warmTokenizer } from "./helpers/turnHarness";
import { clock, drownedKingStory, front, record, story } from "./helpers/campaignFixtures";

vi.setConfig({ testTimeout: 120_000 });

beforeAll(async () => {
  await warmTokenizer();
});

/** A campaign with far more than 800 tokens of material. */
function bigCampaign(): StoryData {
  const clocks = Array.from({ length: 14 }, (_, i) =>
    clock({
      id: `clk_${i}`,
      name: `Clock number ${i} of the long campaign`,
      segments: 6,
      filled: i % 6,
      triggers: ["scene", "miss"],
      visible: i % 2 === 0,
    }),
  );
  const secrets = Array.from({ length: 40 }, (_, i) => ({
    id: `sec_${i}`,
    title: `Secret ${i}: what the keeper hid under the old chapel`,
    truth: "the hidden truth",
    keyPhrases: [],
    revealed: false,
    clues: Array.from({ length: 3 }, (_, j) => ({ id: `clu_${i}_${j}`, text: "a clue", found: j < i % 3 })),
  }));
  const fronts = Array.from({ length: 6 }, (_, i) =>
    front({ id: `frt_${i}`, name: `Front ${i}`, clockId: `clk_${i}`, stakes: [`Will the people of village ${i} survive the winter?`] }),
  );
  return story({
    campaign: record({
      style: "mystery",
      pitch: { premise: "A drowned king stirs", tone: ["eerie", "quiet"] },
      safety: {
        lines: [{ id: "saf_1", text: "no harm to children", keywords: ["child"] }],
        veils: [{ id: "saf_2", text: "torture happens off screen", keywords: ["torture"] }],
      },
      clocks,
      secrets,
      fronts,
    }),
  });
}

describe("formatCampaignBrief", () => {
  it("is empty without a record", () => {
    expect(formatCampaignBrief(story())).toBe("");
  });

  it("is empty for a record with nothing to show", () => {
    expect(formatCampaignBrief(story({ campaign: record() }))).toBe("");
  });

  it("renders the worked example: the clock, its fill and the next portent", () => {
    const s = drownedKingStory();
    s.campaign!.clocks[0].filled = 4;
    s.campaign!.clocks[0].crossed = [2, 4];
    const brief = formatCampaignBrief(s);
    expect(brief).toContain("The barrow wakes 4/6");
    expect(brief).toContain("(hidden)");
    expect(brief).toContain("next: the drowned walk into the village");
    expect(brief).toContain("Style: mystery");
    expect(brief).toContain("Will the Marlows sell the mill?");
  });

  it("keeps lines and veils whole and first, then the style", () => {
    const brief = formatCampaignBrief(bigCampaign(), 120);
    const lines = brief.split("\n");
    expect(lines[1]).toBe("Lines (never on screen): no harm to children");
    expect(lines[2]).toBe("Veils (happen off screen): torture happens off screen");
    expect(lines[3]).toContain("Style: mystery - eerie, quiet");
    expect(brief).toContain("read with campaign)");
  });

  it("stays near 800 tokens however much there is, and names what it left out", () => {
    const brief = formatCampaignBrief(bigCampaign());
    expect(estimateTokens(brief)).toBeLessThanOrEqual(800);
    expect(estimateTokens(brief)).toBeGreaterThan(300);
    expect(brief).toMatch(/\(\+\d+ [a-z ]+(, \+\d+ [a-z ]+)*, read with campaign\)/);
  });

  it("orders clocks nearest to full first, and secrets by fewest clues found", () => {
    const brief = formatCampaignBrief(bigCampaign());
    const full = brief.indexOf("number 5 ");
    const empty = brief.indexOf("number 0 ");
    expect(full).toBeGreaterThan(-1);
    if (empty > -1) expect(full).toBeLessThan(empty);
  });

  it("does not show a cancelled clock, a revealed secret, or the secret's truth", () => {
    const s = drownedKingStory();
    s.campaign!.clocks.push(clock({ id: "clk_dead", name: "Dead clock", cancelled: true, paused: true }));
    s.campaign!.secrets.push(
      { id: "sec_a", title: "Old news", truth: "SECRET-CANARY-TRUTH", keyPhrases: [], revealed: true, clues: [] },
      { id: "sec_b", title: "Live secret", truth: "SECRET-CANARY-TRUTH-2", keyPhrases: [], revealed: false, clues: [{ id: "c1", text: "CLUE-CANARY", found: false }] },
    );
    const brief = formatCampaignBrief(s);
    expect(brief).not.toContain("Dead clock");
    expect(brief).not.toContain("Old news");
    expect(brief).toContain("Live secret: 0 of 1 clues found");
    expect(brief).not.toContain("CANARY");
  });

  it("names the people here, with their want, when the latest scene mentions their location", () => {
    const s = drownedKingStory();
    s.npcs = [{ id: "npc-1", name: "Hettie", lastSeen: "" }] as unknown as StoryData["npcs"];
    s.campaign!.locations.push({ id: "loc_1", name: "The Cider Barn", features: [], npcIds: ["npc-1"] });
    s.campaign!.people.push({ npcId: "npc-1", want: "to keep the barn" });
    s.scene = { parts: [{ content: "You push open the door of the Cider Barn.", imageUrl: "", user: false, role: "assistant" }] } as unknown as StoryData["scene"];
    expect(formatCampaignBrief(s)).toContain("- Hettie: wants to keep the barn");
    s.scene = { parts: [{ content: "You walk the empty road.", imageUrl: "", user: false, role: "assistant" }] } as unknown as StoryData["scene"];
    expect(formatCampaignBrief(s)).not.toContain("Hettie");
  });
});

describe("the brief in the GM request (the cache rule)", () => {
  function messagesFor(s: StoryData) {
    return buildGMStagePrompt({ storyData: s, userChoice: "I go" }).messages as { role: string; content: string }[];
  }

  it("goes in the live block only: everything before it is byte-identical when the campaign changes", () => {
    const a = buildFixtureStory({ ...DESIGN_FIXTURE, priorTurns: 4 });
    a.campaign = bigCampaign().campaign;
    const b = structuredClone(a);
    b.campaign!.clocks[0].filled = 5;
    b.campaign!.secrets[0].revealed = true;
    const ma = messagesFor(a);
    const mb = messagesFor(b);
    expect(ma.length).toBe(mb.length);
    const liveIndex = ma.findIndex((m) => String(m.content).includes("LIVE GAME STATE"));
    expect(liveIndex).toBeGreaterThan(1);
    for (let i = 0; i < liveIndex; i++) expect(JSON.stringify(ma[i])).toBe(JSON.stringify(mb[i]));
    expect(JSON.stringify(ma[liveIndex])).not.toBe(JSON.stringify(mb[liveIndex]));
    expect(String(ma[0].content)).not.toContain("CAMPAIGN (read");
  });

  it("reports the live block's growth for a full brief", () => {
    const plain = buildFixtureStory({ ...DESIGN_FIXTURE, priorTurns: 4 });
    const withBrief = structuredClone(plain);
    withBrief.campaign = bigCampaign().campaign;
    const live = (s: StoryData) =>
      estimateTokens(String(messagesFor(s).find((m) => String(m.content).includes("LIVE GAME STATE"))!.content));
    const growth = live(withBrief) - live(plain);
    console.log(`Campaign brief: the live block grows by ${growth} tokens`);
    expect(growth).toBeGreaterThan(300);
    expect(growth).toBeLessThanOrEqual(850);
  });
});

describe("deriveStoryProgress", () => {
  it("adventure path: beats done over beats", () => {
    const r = record({
      style: "adventure_path",
      beats: {
        list: [
          { id: "1", title: "a", summary: "", status: "done" },
          { id: "2", title: "b", summary: "", status: "done" },
          { id: "3", title: "c", summary: "", status: "current" },
          { id: "4", title: "d", summary: "", status: "pending" },
        ],
      },
    });
    expect(deriveStoryProgress(r)).toBe(0.5);
  });
  it("mystery: secrets revealed over secrets", () => {
    const s = (revealed: boolean) => ({ id: "x", title: "t", truth: "", keyPhrases: [], revealed, clues: [] });
    expect(deriveStoryProgress(record({ style: "mystery", secrets: [s(true), s(false), s(false), s(true)] }))).toBe(0.5);
  });
  it("other styles: fronts resolved or doomed over fronts, never above 90%", () => {
    const f = (status: "active" | "resolved" | "doomed") => front({ id: status + Math.random(), status });
    expect(deriveStoryProgress(record({ style: "sandbox", fronts: [f("resolved"), f("active")] }))).toBe(0.5);
    expect(deriveStoryProgress(record({ style: "horror", fronts: [f("resolved"), f("doomed")] }))).toBe(0.9);
  });
  it("is 0 when there is nothing to count", () => {
    expect(deriveStoryProgress(record({ style: "adventure_path" }))).toBe(0);
    expect(deriveStoryProgress(record({ style: "mystery" }))).toBe(0);
    expect(deriveStoryProgress(record({ style: "sandbox" }))).toBe(0);
  });
});

describe("storyProgress", () => {
  it("uses the record when it has a style", () => {
    const s = story({ currentChapter: 5, max_chapters: 10, campaign: record({ style: "mystery" }) } as Partial<StoryData>);
    expect(storyProgress(s)).toBe(0);
  });
  it("keeps the chapter-based value for an old save, and for a migrated record with no style", () => {
    expect(storyProgress(story({ currentChapter: 5, max_chapters: 10 } as Partial<StoryData>))).toBe(0.5);
    expect(
      storyProgress(story({ currentChapter: 5, max_chapters: 10, campaign: record({ origin: "migrated" }) } as Partial<StoryData>)),
    ).toBe(0.5);
  });
});

describe("the director targets clocks first", () => {
  it("offers tick_a_clock on a campaign clock one segment from full, with targetClockId", () => {
    const s = drownedKingStory();
    s.campaign!.clocks[0].filled = 5;
    const move = selectDirectorMove(s, "Normal");
    expect(move).toMatchObject({ move: "tick_a_clock", targetClockId: "clk_a" });
    expect(move?.targetTimerId).toBeUndefined();
    expect(move?.context).toContain("The barrow wakes");
  });
  it("links the thread a clock is linked to", () => {
    const s = drownedKingStory();
    s.campaign!.clocks[0].filled = 5;
    s.campaign!.clocks[0].link = { kind: "thread", id: "thr-1" };
    s.threads = [{ id: "thr-1", title: "The mill", description: "", status: "active", createdAt: 1 }];
    expect(selectDirectorMove(s, "Normal")?.targetThreadId).toBe("thr-1");
  });
  it("ignores a paused clock and a clock far from full", () => {
    const s = drownedKingStory();
    s.campaign!.clocks[0].filled = 5;
    s.campaign!.clocks[0].paused = true;
    expect(selectDirectorMove(s, "Normal")?.move).not.toBe("tick_a_clock");
    s.campaign!.clocks[0].paused = false;
    s.campaign!.clocks[0].filled = 1;
    expect(selectDirectorMove(s, "Normal")?.move).not.toBe("tick_a_clock");
  });
  it("falls back to a legacy timer, as before, when no record exists", () => {
    const s = story({
      timers: [{ id: "t1", name: "Doom", totalTicks: 4, currentTicks: 1, autoAdvance: false, status: "active", visibility: "visible", createdAt: 1 }],
    });
    expect(selectDirectorMove(s, "Normal")).toMatchObject({ move: "tick_a_clock", targetTimerId: "t1" });
  });
  it("does not offer a timer the migration already turned into a clock", () => {
    const s = story({
      timers: [{ id: "t1", name: "Doom", totalTicks: 4, currentTicks: 2, autoAdvance: false, status: "active", visibility: "visible", createdAt: 1 }],
      campaign: record({ clocks: [clock({ id: "t1", migratedFromTimerId: "t1", segments: 4, filled: 2 })] }),
    });
    expect(selectDirectorMove(s, "Normal")?.move).not.toBe("tick_a_clock");
  });
});
