/**
 * Slice 6 of docs/campaign-format-plan.md: the player's view of the campaign.
 * The panel is given only publicCampaignView's projection; the guest snapshot
 * carries a record rebuilt from it. A canary sits in every hidden field.
 */
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import CampaignBody from "@/app/story/CampaignBody";
import CampaignPanel from "@/app/story/CampaignPanel";
import { publicCampaignView } from "@/app/misc/campaign/publicView";
import { guestCampaignRecord, withGuestCampaign } from "@/app/misc/campaign/guestView";
import { emptyCampaign } from "@/app/misc/campaign/types";
import type { StoryData } from "@/app/misc/structs";
import { canaryCampaign, HIDDEN, PUBLIC } from "./helpers/campaignCanaries";

const SHOWN_IN_PANEL = ["premise", "tone", "line", "veil", "clock", "clue"] as const;

describe("CampaignPanel", () => {
  const view = publicCampaignView(canaryCampaign());
  const html = renderToStaticMarkup(createElement(CampaignPanel, { view }));

  it("shows the pitch, tone, lines and veils, visible clocks and what we know", () => {
    for (const key of SHOWN_IN_PANEL) expect(html, key).toContain(PUBLIC[key]);
    expect(html).toContain("What we know");
    expect(html).toContain("Mystery");
    expect(html).toContain("2 / 6");
  });

  it("holds no canary from any hidden field", () => {
    for (const [what, canary] of Object.entries(HIDDEN)) {
      expect(html, what).not.toContain(canary);
    }
  });

  it("lists neither the hidden clock nor the cancelled one", () => {
    expect(html).not.toContain(HIDDEN.hiddenClock);
    expect(html).not.toContain(HIDDEN.cancelledClock);
  });

  it("renders nothing without a record, or with a record that has nothing public yet", () => {
    expect(renderToStaticMarkup(createElement(CampaignPanel, { view: null }))).toBe("");
    expect(renderToStaticMarkup(createElement(CampaignPanel, { view: undefined }))).toBe("");
    const bare = publicCampaignView(emptyCampaign());
    expect(renderToStaticMarkup(createElement(CampaignPanel, { view: bare }))).toBe("");
  });

  it("uses only ys-* colour tokens", () => {
    for (const file of ["app/story/CampaignPanel.tsx", "app/story/CampaignBody.tsx"]) {
      const src = readFileSync(file, "utf8");
      expect(src, file).not.toMatch(/\b(?:bg|text|border)-(?:white|black|purple|blue|red|green|amber|gray|slate)\b/);
      expect(src, file).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgb\(/);
    }
  });

  it("is built from the projection: neither component can be handed the record", () => {
    for (const file of ["app/story/CampaignPanel.tsx", "app/story/CampaignBody.tsx"]) {
      const src = readFileSync(file, "utf8");
      expect(src, file).not.toContain("CampaignRecord");
    }
  });
});

describe("CampaignBody (the party phone's markup)", () => {
  it("renders the same content without icons or state, and no canary", () => {
    const html = renderToStaticMarkup(
      createElement(CampaignBody, { view: publicCampaignView(canaryCampaign()) }),
    );
    for (const key of SHOWN_IN_PANEL) expect(html, key).toContain(PUBLIC[key]);
    for (const canary of Object.values(HIDDEN)) expect(html).not.toContain(canary);
    expect(html).not.toContain("<svg");
  });
});

describe("the Lore page", () => {
  async function lorePage(campaign: ReturnType<typeof canaryCampaign> | undefined): Promise<string> {
    const { default: LorePage } = await import("@/app/story/lore");
    const { NotificationProvider } = await import("@/app/misc/NotificationContext");
    const story = {
      story_name: "T",
      lore: [],
      npcs: [],
      memory: [],
      goals: [],
      chapters: [],
      scene: { parts: [] },
      ...(campaign ? { campaign } : {}),
    } as unknown as StoryData;
    return renderToStaticMarkup(
      createElement(NotificationProvider, null, createElement(LorePage, { ...story })),
    );
  }

  it("shows the Campaign panel from the projection and leaks no canary", async () => {
    const html = await lorePage(canaryCampaign());
    expect(html).toContain('aria-label="Campaign"');
    for (const key of SHOWN_IN_PANEL) expect(html, key).toContain(PUBLIC[key]);
    for (const [what, canary] of Object.entries(HIDDEN)) expect(html, what).not.toContain(canary);
  });

  it("shows no panel for a story without a record", async () => {
    expect(await lorePage(undefined)).not.toContain('aria-label="Campaign"');
  });
});

describe("guestCampaignRecord", () => {
  it("rebuilds a record whose player view is identical and whose hidden fields are empty", () => {
    const record = canaryCampaign();
    const guest = guestCampaignRecord(record);
    expect(publicCampaignView(guest)).toEqual(publicCampaignView(record));
    const json = JSON.stringify(guest);
    for (const [what, canary] of Object.entries(HIDDEN)) expect(json, what).not.toContain(canary);
    expect(guest.secrets.every((s) => s.truth === "" && s.title === "")).toBe(true);
    expect(guest.clocks.every((c) => c.visible)).toBe(true);
    expect(guest.beats).toBeUndefined();
    expect(guest.endStates).toEqual([]);
    expect(guest.people).toEqual([]);
  });

  it("copies and leaves the host's record alone", () => {
    const record = canaryCampaign();
    const before = JSON.stringify(record);
    guestCampaignRecord(record);
    expect(JSON.stringify(record)).toBe(before);
  });

  it("keeps an empty record empty and a story without one unchanged", () => {
    const empty = guestCampaignRecord(emptyCampaign());
    expect(publicCampaignView(empty)).toEqual(publicCampaignView(emptyCampaign()));
    const story = { name: "x" } as { name: string; campaign?: ReturnType<typeof canaryCampaign> };
    expect(withGuestCampaign(story)).toBe(story);
  });

  it("keeps lines and veils asked-but-empty distinct from not asked", () => {
    const asked = { ...emptyCampaign(), safety: { lines: [], veils: [] } };
    expect(publicCampaignView(guestCampaignRecord(asked)).safetyAsked).toBe(true);
    expect(publicCampaignView(guestCampaignRecord(emptyCampaign())).safetyAsked).toBe(false);
  });
});
