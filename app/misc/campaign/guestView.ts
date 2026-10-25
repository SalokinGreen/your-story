/**
 * What an online guest is sent of the campaign record (plan slice 6).
 *
 * The host broadcasts the whole StoryData to guests (status report 6.12), and
 * the record holds secrets, dooms, portents, people's wants, hidden clocks,
 * beats and end states. A guest's screen shows only `publicCampaignView`, so
 * the snapshot carries a record-shaped copy rebuilt FROM that view: the same
 * type (a guest build keeps reading `storyData.campaign`), with every hidden
 * field empty. It is built from the projection, never by deleting fields from
 * the record, so a field added to the record later is hidden by default.
 */

import type { CampaignRecord } from "./types";
import { publicCampaignView } from "./publicView";

export function guestCampaignRecord(record: CampaignRecord): CampaignRecord {
  const view = publicCampaignView(record);
  const guest: CampaignRecord = {
    version: 1,
    factions: view.factions.map((name, i) => ({ id: `fac_g${i}`, name, goal: "" })),
    fronts: view.fronts.map((f, i) => ({
      id: `frt_g${i}`,
      name: f.name,
      dangers: [],
      portents: [],
      doom: "",
      stakes: [...f.stakes],
      status: "active",
    })),
    clocks: view.clocks.map((c, i) => ({
      id: `clk_g${i}`,
      name: c.name,
      segments: c.segments,
      filled: c.filled,
      triggers: [],
      visible: true,
      paused: false,
      crossed: [],
    })),
    people: [],
    secrets: view.known.length
      ? [
          {
            id: "sec_g",
            title: "",
            truth: "",
            keyPhrases: [],
            revealed: false,
            clues: view.known.map((text, i) => ({ id: `clu_g${i}`, text, found: true })),
          },
        ]
      : [],
    locations: view.locations.map((l, i) => ({
      id: `loc_g${i}`,
      name: l.name,
      features: [...l.features],
      npcIds: [],
    })),
    endStates: [],
  };
  if (view.style) guest.style = view.style;
  if (record.pitch?.premise) guest.pitch = { premise: view.premise ?? "", tone: view.tone };
  else if (view.tone.length) guest.pitch = { premise: "", tone: view.tone };
  if (view.safetyAsked) {
    guest.safety = {
      lines: view.lines.map((text, i) => ({ id: `saf_gl${i}`, text, keywords: [] })),
      veils: view.veils.map((text, i) => ({ id: `saf_gv${i}`, text, keywords: [] })),
    };
  }
  return guest;
}

/** The story as an online guest may see it: only the campaign is changed. */
export function withGuestCampaign<T extends { campaign?: CampaignRecord }>(story: T): T {
  if (!story.campaign) return story;
  return { ...story, campaign: guestCampaignRecord(story.campaign) };
}
