import type {
  Adventure,
  LoreType,
  LoreVisibility,
  MeterSet,
} from "../structs";

export interface BuiltinNote {
  id: string; // stable: "builtin:blood-and-bone:core"
  title: string;
  type: LoreType;
  content: string;
  tags?: string[];
  keys?: string[];
  visibility?: LoreVisibility;
}

export interface BuiltinPack {
  id: string; // "blood-and-bone:rules"
  systemId: string; // "blood-and-bone"
  title: string; // "Blood & Bone - Rules"
  description: string;
  notes: BuiltinNote[];
}

export interface BuiltinAdventure {
  id: string; // "builtin:blood-and-bone:hollow-hour"
  adventure: Partial<Adventure>; // storyTemplate.lore holds copies of the packs' notes
}

export interface BuiltinSystem {
  id: string;
  title: string;
  description: string; // one paragraph, also shown to the Designer
  packs: BuiltinPack[];
  starters: BuiltinAdventure[];
  sheetTemplate?: string; // {{Field | description | default}} markdown
  meterSets: MeterSet[];
  endOfSessionReminder?: string; // returned by end_session
}
