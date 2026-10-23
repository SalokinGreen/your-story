import type { CreationStep } from "../setupSteps";
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
  // Built-in note id of the system's character-creation rules. Session zero
  // carries that note in full while it runs (buildSessionZeroBlock).
  creationNoteId?: string;
  // The system's own character-creation steps, in order (setupSteps.ts). Full
  // step-by-step setup asks each once per player and records it.
  creationSteps?: CreationStep[];
  meterSets: MeterSet[];
  endOfSessionReminder?: string; // returned by end_session
}
