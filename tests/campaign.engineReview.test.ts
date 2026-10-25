import { beforeEach, describe, expect, it, vi } from "vitest";
import { executeCampaign } from "@/app/misc/campaign/executor";
import { formatCampaignBrief } from "@/app/misc/campaign/brief";
import { googleSafeToolSchema, filterToolsForGoogle } from "@/app/misc/providerCall";
import { GM_TOOL_MAP } from "@/app/misc/gmTools";
import { selectFrame } from "@/app/misc/primaMateria";
import { run, clock, drownedKingStory, record, story, stubUuids } from "./helpers/campaignFixtures";
import type { CampaignParams } from "@/app/misc/gmTools";

beforeEach(() => {
  vi.restoreAllMocks();
  stubUuids();
});

const call = (s: ReturnType<typeof story>, p: CampaignParams) => executeCampaign("c", p, s);

describe("a full clock", () => {
  it("is one compact line at the end of the brief, not a line of its own", () => {
    const s = story({
      campaign: record({
        clocks: [clock({ id: "clk_a", name: "Done", filled: 6 }), clock({ id: "clk_b", name: "Rising", filled: 2 })],
      }),
    });
    const brief = formatCampaignBrief(s);
    expect(brief).not.toContain("FULL");
    expect(brief).toContain("- Rising 2/6");
    expect(brief).not.toContain("- Done");
    const lines = brief.split("\n");
    expect(lines[lines.length - 1]).toBe("Filled (cancel one to clear it): Done");
  });

  it("can be cancelled by campaign and by manage_timer", async () => {
    const s = story({ campaign: record({ clocks: [clock({ filled: 6 })] }) });
    expect(call(s, { action: "cancel", id: "clk_a" }).success).toBe(true);
    expect(s.campaign!.clocks[0].cancelled).toBe(true);
    expect(call(s, { action: "cancel", id: "clk_a" }).success).toBe(false);
    const s2 = story({ campaign: record({ clocks: [clock({ filled: 6 })] }) });
    const out = await run(s2, [{ name: "manage_timer", args: { action: "cancel", timer: "clk_a" } }]);
    expect(out.results[0].success).toBe(true);
    expect(out.modifiedStoryData.campaign!.clocks[0].cancelled).toBe(true);
  });
});

describe("stale story.timers once a record exists", () => {
  it("do not make the portent Frame structural", () => {
    const timers = [{ id: "t", name: "t", totalTicks: 6, currentTicks: 3, autoAdvance: false, status: "active", visibility: "visible", createdAt: 1 }];
    const old = story({ timers } as never);
    expect(selectFrame(old)).toBe("structural");
    const migrated = story({ timers, campaign: record({ clocks: [clock({ cancelled: true, paused: true })] }) } as never);
    expect(selectFrame(migrated)).toBe("literal");
    const live = story({ timers: [], campaign: record({ clocks: [clock()] }) } as never);
    expect(selectFrame(live)).toBe("structural");
  });
});

describe("triggers no tool can fire", () => {
  it("refuses rest and session on a story with no system, naming the ones that can", () => {
    const s = story({ campaign: record() });
    const r = call(s, { action: "add", part: "clock", data: { name: "x", segments: 4, triggers: ["rest"] } });
    expect(r.success).toBe(false);
    expect(r.contextForStory).toContain("can never fire");
    expect(r.contextForStory).toContain("manual, scene, miss");
    expect(call(s, { action: "add", part: "clock", data: { name: "y", segments: 4, triggers: ["session"] } }).success).toBe(false);
    expect(call(s, { action: "add", part: "clock", data: { name: "z", segments: 4, triggers: ["miss", "scene"] } }).success).toBe(true);
  });
});

describe("edit clock", () => {
  it("refuses `filled`, pointing at tick", () => {
    const s = drownedKingStory();
    const r = call(s, { action: "edit", part: "clock", id: "clk_a", data: { name: "x", segments: 6, filled: 6 } });
    expect(r.success).toBe(false);
    expect(r.contextForStory).toContain("tick");
    expect(s.campaign!.clocks[0].filled).toBe(0);
  });
});

describe("the Google tool list", () => {
  it("gives the campaign data parameter a schema Gemini accepts, leaving the shared list alone", async () => {
    const campaign = GM_TOOL_MAP.get("campaign")!;
    const safe = googleSafeToolSchema(campaign);
    expect((safe.function.parameters.properties as Record<string, { type: string }>).data.type).toBe("string");
    expect((campaign.function.parameters.properties as Record<string, { type: string }>).data.type).toBe("object");
    expect(filterToolsForGoogle([campaign])[0].function.parameters.properties.data.type).toBe("string");
  });

  it("parses data sent as a JSON string back into an object", async () => {
    const s = story({ campaign: record() });
    const out = await run(s, [
      { name: "campaign", args: { action: "add", part: "clock", data: JSON.stringify({ name: "Str", segments: 4, triggers: ["scene"] }) } },
    ]);
    expect(out.results[0].success).toBe(true);
    expect(out.modifiedStoryData.campaign!.clocks[0].name).toBe("Str");
  });
});
