/**
 * Small constructors for the campaign records the built-in starters ship
 * (docs/campaign-format-design.md section 9, decision 224). A starter's record
 * is written out as data with fixed ids (a starter is built in memory, never
 * stored, so a fixed id is safe and keeps the records diffable), and
 * `tests/campaign.starters.test.ts` runs every part through `validatePart`.
 *
 * `origin: "starter"` marks a record the author shipped: session zero then
 * reviews it (the `campaign_review` step) instead of building one.
 */

import { emptyCampaign } from "./types";
import type {
  Beat,
  CampaignLocation,
  CampaignRecord,
  CampaignStyle,
  Clock,
  ClockLinkKind,
  ClockTrigger,
  Faction,
  Front,
  FrontDanger,
  PersonExtra,
  Secret,
} from "./types";

export function starterClock(c: {
  id: string;
  name: string;
  segments: 4 | 6 | 8;
  triggers: ClockTrigger[];
  link?: { kind: ClockLinkKind; id: string };
  onFill: string;
  visible: boolean;
}): Clock {
  return { ...c, filled: 0, paused: false, crossed: [] };
}

/** `portents` are `[at, text]` pairs, `at` being the segment that reports it. */
export function starterFront(f: {
  id: string;
  name: string;
  doom: string;
  dangers: FrontDanger[];
  portents: [number, string][];
  stakes: string[];
  clockId: string;
}): Front {
  return {
    id: f.id,
    name: f.name,
    dangers: f.dangers,
    portents: f.portents.map(([at, text]) => ({ at, text })),
    doom: f.doom,
    stakes: f.stakes,
    clockId: f.clockId,
    status: "active",
  };
}

export function starterFaction(f: Faction): Faction {
  return f;
}

/** `clues` are `[id, text, where]` triples; every clue starts unfound. */
export function starterSecret(s: {
  id: string;
  title: string;
  truth: string;
  keyPhrases: string[];
  clues: [string, string, string][];
}): Secret {
  return {
    id: s.id,
    title: s.title,
    truth: s.truth,
    keyPhrases: s.keyPhrases,
    revealed: false,
    clues: s.clues.map(([id, text, where]) => ({ id, text, where, found: false })),
  };
}

export function starterLocation(l: CampaignLocation): CampaignLocation {
  return l;
}

export function starterPerson(p: PersonExtra): PersonExtra {
  return p;
}

export function starterBeats(
  list: [string, string, string][],
): { list: Beat[]; currentId: string } {
  return {
    list: list.map(([id, title, summary], i) => ({
      id,
      title,
      summary,
      status: i === 0 ? ("current" as const) : ("pending" as const),
    })),
    currentId: list[0][0],
  };
}

/** A shipped record: marked `origin: "starter"`, play state untouched. */
export function starterRecord(
  style: CampaignStyle,
  parts: Partial<Omit<CampaignRecord, "version" | "origin" | "style">>,
): CampaignRecord {
  return { ...emptyCampaign(), ...parts, style, origin: "starter" };
}
