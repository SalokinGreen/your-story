/**
 * The player's view of the campaign record (docs/campaign-format-design.md
 * section 10, plan slice 3). This is the ONE projection used for any view the
 * player sees: the setup card now, the Lore page panel and the party phones
 * later (slice 6). It is an explicit field list, never a spread of the record.
 *
 * It holds the pitch, the tone, the style, the lines and veils (their text,
 * not their keywords), the names of the factions and fronts, a front's stakes
 * questions, locations with their features, the clocks marked visible, and
 * the clues the party has found. It never holds a secret's title or truth, an
 * unfound clue, a front's doom, dangers or portents, a person's want, secret
 * or voice, a hidden clock, a clock's fill text, or the beats and end states.
 */

import type { CampaignRecord, CampaignStyle } from "./types";
import { STYLE_SPECS } from "./styles";

export interface PublicCampaignView {
  style?: CampaignStyle;
  styleLabel?: string;
  premise?: string;
  tone: string[];
  /** True once the safety step has been recorded (empty lists count). */
  safetyAsked: boolean;
  lines: string[];
  veils: string[];
  factions: string[];
  fronts: { name: string; stakes: string[] }[];
  locations: { name: string; features: string[] }[];
  clocks: { name: string; segments: number; filled: number }[];
  /** Found clues: "What we know". */
  known: string[];
}

export function publicCampaignView(record: CampaignRecord): PublicCampaignView {
  const view: PublicCampaignView = {
    tone: [...(record.pitch?.tone ?? [])],
    safetyAsked: !!record.safety,
    lines: (record.safety?.lines ?? []).map((l) => l.text),
    veils: (record.safety?.veils ?? []).map((v) => v.text),
    factions: record.factions.map((f) => f.name),
    fronts: record.fronts.map((f) => ({ name: f.name, stakes: [...f.stakes] })),
    locations: record.locations.map((l) => ({ name: l.name, features: [...l.features] })),
    clocks: record.clocks
      .filter((c) => c.visible && !c.cancelled)
      .map((c) => ({ name: c.name, segments: c.segments, filled: c.filled })),
    known: record.secrets.flatMap((s) => s.clues.filter((c) => c.found).map((c) => c.text)),
  };
  if (record.style) {
    view.style = record.style;
    view.styleLabel = STYLE_SPECS[record.style].label;
  }
  if (record.pitch?.premise) view.premise = record.pitch.premise;
  return view;
}
