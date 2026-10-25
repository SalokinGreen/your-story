/**
 * The campaign record (docs/campaign-format-design.md section 3, decisions
 * 222-225). `StoryData.campaign` is optional: its absence means a story that
 * runs exactly as it did before the format existed.
 *
 * Every part has a stable id made with `crypto.randomUUID()` inside an
 * executor or a migration (never during render), with a prefix: `clk_`,
 * `fac_`, `frt_`, `sec_`, `clu_`, `loc_`, `end_`, plus `bt_` for beats and
 * `saf_` for lines and veils.
 */

export type CampaignStyle =
  | "sandbox"
  | "adventure_path"
  | "mystery"
  | "horror"
  | "episodic"
  | "slice_of_life"
  | "solo";

export const CAMPAIGN_STYLES: readonly CampaignStyle[] = [
  "sandbox",
  "adventure_path",
  "mystery",
  "horror",
  "episodic",
  "slice_of_life",
  "solo",
];

export type ClockTrigger = "miss" | "scene" | "rest" | "session" | "manual";

export const CLOCK_TRIGGERS: readonly ClockTrigger[] = [
  "miss",
  "scene",
  "rest",
  "session",
  "manual",
];

/** A grim portent: reported once, when the clock's fill reaches `at`. */
export interface Portent {
  at: number;
  text: string;
}

/** A line (never appears) or a veil (happens off screen). */
export interface SafetyItem {
  id: string;
  text: string;
  keywords: string[];
}

export interface Faction {
  id: string;
  name: string;
  goal: string;
  methods?: string;
  clockId?: string;
}

export interface FrontDanger {
  name: string;
  impulse: string;
}

export type FrontStatus = "active" | "resolved" | "doomed";

export interface Front {
  id: string;
  name: string;
  dangers: FrontDanger[];
  portents: Portent[];
  doom: string;
  stakes: string[];
  clockId?: string;
  status: FrontStatus;
}

export type ClockLinkKind = "front" | "faction" | "thread";

export interface Clock {
  id: string;
  name: string;
  segments: number;
  filled: number;
  triggers: ClockTrigger[];
  link?: { kind: ClockLinkKind; id: string };
  /** What happens when it fills. The engine never writes the prose. */
  onFill?: string;
  visible: boolean;
  paused: boolean;
  /** The `at` of every portent already reported, so none is reported twice. */
  crossed: number[];
  migratedFromTimerId?: string;
  cancelled?: boolean;
}

/** Extra text for a person; joins `StoryData.npcs` by `npcId`. */
export interface PersonExtra {
  npcId: string;
  want?: string;
  secret?: string;
  voice?: string;
}

export interface Clue {
  id: string;
  text: string;
  where?: string;
  found: boolean;
}

export interface Secret {
  id: string;
  title: string;
  truth: string;
  keyPhrases: string[];
  revealed: boolean;
  clues: Clue[];
}

export interface CampaignLocation {
  id: string;
  name: string;
  features: string[];
  noteId?: string;
  npcIds: string[];
}

export type BeatStatus = "pending" | "current" | "done" | "suspended";

export interface Beat {
  id: string;
  title: string;
  summary: string;
  status: BeatStatus;
}

export interface EndState {
  id: string;
  text: string;
}

export interface CampaignRecord {
  version: 1;
  /** "migrated" on a record the timer migration made and nothing else has; "starter" on one a built-in starter shipped (session zero reviews it). */
  origin?: "migrated" | "starter";
  style?: CampaignStyle;
  pitch?: { premise: string; tone: string[] };
  safety?: { lines: SafetyItem[]; veils: SafetyItem[] };
  factions: Faction[];
  fronts: Front[];
  clocks: Clock[];
  people: PersonExtra[];
  secrets: Secret[];
  locations: CampaignLocation[];
  beats?: { list: Beat[]; currentId?: string; suspendedId?: string };
  endStates: EndState[];
}

/** An empty record, the shape every executor and migration starts from. */
export function emptyCampaign(): CampaignRecord {
  return {
    version: 1,
    factions: [],
    fronts: [],
    clocks: [],
    people: [],
    secrets: [],
    locations: [],
    endStates: [],
  };
}
