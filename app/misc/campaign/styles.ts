/**
 * What each campaign style expects the GM to build (docs/campaign-format-design.md
 * section 5). Prep rules warn, never block (research section 7): `start_game`
 * refuses only on the minimal requirements and reports what a style still
 * lacks as a warning (`styleWarningLine`), and session zero's block tells the
 * GM what to build.
 */

import type { CampaignRecord, CampaignStyle, ClockTrigger } from "./types";

/** A part of the record a style may expect. */
export type ExpectedPart =
  | "pitch"
  | "safety"
  | "factions"
  | "fronts"
  | "clocks"
  | "people"
  | "secrets"
  | "locations"
  | "beats"
  | "end_states";

export interface StyleSpec {
  label: string;
  /** One line for the player: how this style plays. */
  blurb: string;
  expects: readonly ExpectedPart[];
  /** Clock triggers that suit the style. */
  triggers: readonly ClockTrigger[];
  /** Said after the parts, when the style has a rule worth stating. */
  note?: string;
}

export const STYLE_SPECS: Record<CampaignStyle, StyleSpec> = {
  sandbox: {
    label: "Sandbox",
    blurb: "a place full of factions and secrets; the player picks the thread",
    expects: ["pitch", "factions", "fronts", "locations", "people", "secrets"],
    triggers: ["scene", "rest"],
  },
  adventure_path: {
    label: "Adventure path",
    blurb: "a story with a shape: beats, a villain, an ending",
    expects: ["pitch", "beats", "fronts", "people", "secrets", "end_states"],
    triggers: ["miss", "scene"],
    note: "Beats are for this style only: add them one at a time, the first as the current beat.",
  },
  mystery: {
    label: "Mystery",
    blurb: "a truth to uncover from clues",
    expects: ["pitch", "secrets", "people", "fronts", "end_states"],
    triggers: ["scene", "miss"],
    note: "Every secret wants three clues, found in different places.",
  },
  horror: {
    label: "Horror",
    blurb: "dread that grows; something is coming",
    expects: ["pitch", "safety", "fronts", "people", "secrets"],
    triggers: ["miss", "scene"],
    note: "A front's portents are the grim steps; its clock times them.",
  },
  episodic: {
    label: "Episodic",
    blurb: "self-contained episodes in a shared world",
    expects: ["pitch", "fronts", "locations", "people"],
    triggers: ["scene"],
    note: "One front per episode.",
  },
  slice_of_life: {
    label: "Slice of life",
    blurb: "a season of days, people and small stakes",
    expects: ["pitch", "people", "locations", "clocks"],
    triggers: ["session", "rest"],
    note: "People with wants, small clocks, and threads for what the player cares about.",
  },
  solo: {
    label: "Solo / oracle",
    blurb: "the oracles drive it; you steer",
    expects: ["pitch", "people"],
    triggers: ["scene"],
    note: "Threads and the oracle tables carry the story.",
  },
};

const PART_LABEL: Record<ExpectedPart, string> = {
  pitch: "a pitch (part pitch)",
  safety: "lines and veils (part safety)",
  factions: "factions",
  fronts: "a front with a clock",
  clocks: "small clocks",
  people: "people with wants",
  secrets: "secrets with clues",
  locations: "locations",
  beats: "beats",
  end_states: "end states",
};

export function expectedPartLabel(part: ExpectedPart): string {
  return PART_LABEL[part];
}

/** Whether the record holds at least one of a part. */
export function hasPart(record: CampaignRecord, part: ExpectedPart): boolean {
  switch (part) {
    case "pitch":
      return !!record.pitch;
    case "safety":
      return !!record.safety;
    case "factions":
      return record.factions.length > 0;
    case "fronts":
      return record.fronts.length > 0;
    case "clocks":
      return record.clocks.length > 0;
    case "people":
      return record.people.length > 0;
    case "secrets":
      return record.secrets.length > 0;
    case "locations":
      return record.locations.length > 0;
    case "beats":
      return (record.beats?.list.length ?? 0) > 0;
    case "end_states":
      return record.endStates.length > 0;
  }
}

/** The expected parts the record's style has none of yet. */
export function missingStyleParts(record: CampaignRecord): ExpectedPart[] {
  if (!record.style) return [];
  return STYLE_SPECS[record.style].expects.filter((p) => !hasPart(record, p));
}

/**
 * Whether the record has a part beyond the pitch and the safety lists: the
 * minimum a campaign needs before `start_game` (design section 8).
 */
export function hasPartBeyondPitch(record: CampaignRecord): boolean {
  return (
    record.factions.length > 0 ||
    record.fronts.length > 0 ||
    record.clocks.length > 0 ||
    record.people.length > 0 ||
    record.secrets.length > 0 ||
    record.locations.length > 0 ||
    (record.beats?.list.length ?? 0) > 0 ||
    record.endStates.length > 0
  );
}

/**
 * A line for `start_game`'s result naming what the style still lacks, or an
 * empty string. It names parts, never the contents of one, so it is safe for
 * the narrator's summary too.
 */
export function styleWarningLine(record: CampaignRecord): string {
  const missing = missingStyleParts(record);
  if (missing.length === 0 || !record.style) return "";
  return `Prep warning: a ${STYLE_SPECS[record.style].label.toLowerCase()} campaign also expects ${missing.map(expectedPartLabel).join(", ")}. Add them in play with campaign (add) as the story needs them.`;
}
