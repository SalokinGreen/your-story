import type { EventContract } from "../judges/types";
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
  // Which part of a setting the note belongs to: "cross-europe" for notes
  // every story of the setting uses, else a place name ("London"). A starter
  // copies only its own place, and a story that loads gains only the notes
  // scoped "cross-europe" (missingBuiltinNotes). Unset means the note is
  // not scoped (a rules note).
  scope?: "cross-europe" | string;
  // A Rules note written for one setting (the E1 table families are Europe
  // by Night's): pushed on load only to stories in that setting, and left out
  // of the starters set elsewhere. Unset means every setting (design E5 §5).
  setting?: string;
}

/** `SystemState.setting` for Europe by Night, the setting an unset field means. */
export const EUROPE_BY_NIGHT_SETTING = "europe-by-night";

/** Blood & Bone's four tools: its own list, and the legacy tools-on set (resolve.ts). */
export const LEGACY_SYSTEM_TOOLS: readonly string[] = [
  "manage_meter",
  "manage_track",
  "end_session",
  "action_roll",
];
/** Defaults for a system that declares no core note or cross-setting scope: Blood & Bone's. */
export const LEGACY_CORE_NOTE_ID = "builtin:blood-and-bone:core";
export const LEGACY_CROSS_SETTING_SCOPE = "cross-europe";

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

/**
 * A check the engine runs when the GM ends a turn on prose (decision 183,
 * docs/dawn-gate-design.md). The system declares what in the turn's words sets
 * it off, which tool result settles it and what to say to the GM; the one
 * evaluator in turnEndChecks.ts and the one gate in generation.ts run every
 * system's declarations, so a new system adds data, not engine code.
 */
export interface SystemTurnEndCheck {
  id: string; // "night-ended"
  trigger: {
    /**
     * "phrases" (the default) reads the phrase table below. "judge" asks
     * `question` of one cheap model call (judges/turnEndJudge.ts) when the
     * judge is switched on, and uses the phrase table as the fallback when the
     * call fails or is unsure, and always while the judge is off (GM prompt
     * plan slice 5). Either way the tool result is checked in code.
     */
    kind?: "phrases" | "judge";
    /** The yes/no question a "judge" trigger asks ("Did the night end in this turn's text?"). */
    question?: string;
    /** Phrases that count in the GM's visible prose and in a player's line. */
    phrases: RegExp[];
    /** Phrases that count only in a player's line ("in the morning" is a plan in prose). */
    playerOnly?: RegExp[];
    /** Local exclusions: a match inside one of these spans does not count. */
    exceptions: RegExp[];
  };
  /** Satisfied when this turn has an executed result of this tool and type. */
  satisfiedBy: { toolName: string; resultType: string };
  /** The message sent back to the GM. Conditional ("may"): the GM can decline. */
  message: string;
}

/**
 * Where a system's names come from (randomness plan R2, decision 260): one
 * table note and the table paths rolled and joined with a space. The note is
 * named by its built-in id (`noteId`, the story's `libraryNoteId`) or, for a
 * starter's own note, its exact title. A source whose note the story does not
 * hold is skipped.
 */
export interface NameSourceDecl {
  kind: "person" | "place";
  noteId?: string;
  noteTitle?: string;
  /** Table paths, each rolled once: [["First names"], ["Family names"]]. */
  compose: string[][];
  /** Fantastic Realms: only while the story is in this realm (or none is set). */
  realm?: string;
  /** A starter's source: only for a story in this setting. Listed before the system's own. */
  setting?: string;
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
  // Checks the engine runs when a turn ends on prose (turnEndChecks.ts).
  turnEndChecks?: SystemTurnEndCheck[];
  // Promises the rules make that a tool result can prove (judges/rung1.ts,
  // judge layer design 11.2). A broken one earns one re-ask of the GM.
  eventContracts?: EventContract[];
  // The GM tools a story of this system is offered (resolveSystem). Unset
  // means Blood & Bone's four, the legacy tools-on set.
  tools?: string[];
  // Holding this built-in note keeps the system's notes up to date
  // (builtinNotes.ts). Unset means Blood & Bone's core.
  coreNoteId?: string;
  // What an unset systemState.setting means. Unset means Europe by Night.
  defaultSetting?: string;
  // The scope of the notes every story of the default setting is given on
  // load. Unset means "cross-europe".
  crossSettingScope?: string;
  // Per-system hints for the shared creation steps ("history"), applied over
  // the shared hint by getCreationSteps.
  stepHints?: Partial<Record<string, string>>;
  // Realm id to the condition of a rest there (take_rest).
  rests?: Record<string, string>;
  // Where a new person's or place's name is rolled from (names/sources.ts).
  nameSources?: NameSourceDecl[];
}
