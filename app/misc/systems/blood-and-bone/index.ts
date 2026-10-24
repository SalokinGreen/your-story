/**
 * Blood & Bone, the first built-in default system (decisions 62-89): two
 * packs (the rules and the Europe by Night setting), one starter adventure,
 * the character sheet template, the meter sets and the end-of-session
 * reminder. The AI edition is original text for the GM, condensed from the
 * author's rulebook (docs/blood-and-bone/rulebook.md). It is built on the
 * Ironsworn and Ironsworn: Starforged engine by Shawn Tomkin (Tomkin Press),
 * licensed under CC BY 4.0, and is not an official Ironsworn product.
 */
import type { BuiltinNote, BuiltinPack, BuiltinSystem } from "../types";
import { ASSET_NOTES } from "./assets";
import { CORE_NOTE } from "./core";
import { CREATION_NOTE } from "./creation";
import { CREATION_PROMPT_NOTES } from "./creationPrompts";
import { BLOOD_AND_BONE_CREATION_STEPS } from "./creationSteps";
import { EUROPE_NOTES } from "./europe";
import { buildHollowHour } from "./hollowHour";
import { KIND_NOTES } from "./kinds";
import { REVENANT_NOTE } from "./kinds-more/revenant";
import { REVENANT_PROMPTS_NOTE } from "./kinds-more/revenant-prompts";
import { CHANGELING_NOTE } from "./kinds-more/changeling";
import { CHANGELING_PROMPTS_NOTE } from "./kinds-more/changeling-prompts";
import { DOPPELGANGER_NOTE } from "./kinds-more/doppelganger";
import { DOPPELGANGER_PROMPTS_NOTE } from "./kinds-more/doppelganger-prompts";
import { RUSALKA_NOTE } from "./kinds-more/rusalka";
import { RUSALKA_PROMPTS_NOTE } from "./kinds-more/rusalka-prompts";
import { BLOOD_AND_BONE_METER_SETS } from "./meterSets";
import { MOVES_NOTE } from "./moves";
import { PROGRESS_NOTE } from "./progress";
import { BLOOD_AND_BONE_SHEET_TEMPLATE } from "./sheet";
import { TABLE_NOTES } from "./tables";
import { PEOPLE_NOTE } from "./oracles/people";
import { NIGHT_NOTE } from "./oracles/night";
import { PLACES_NOTE } from "./oracles/places";
import { FACTIONS_NOTE } from "./oracles/factions";
import { VIGIL_NOTE } from "./oracles/vigil";
import { MASQUERADE_NOTE } from "./oracles/masquerade";
import { RUMOURS_NOTE } from "./oracles/rumours";
import { FEEDING_NOTE } from "./oracles/feeding";
import { HOOKS_NOTE } from "./oracles/hooks";
import { OBJECTS_NOTE } from "./oracles/objects";
import { INVESTIGATION_NOTE } from "./oracles/investigation";
import { ROADS_NOTE } from "./oracles/roads";
import { TIME_SKIP_NOTE } from "./timeSkip";

export const BLOOD_AND_BONE_ID = "blood-and-bone";

const RULES_NOTES: BuiltinNote[] = [
  CORE_NOTE,
  MOVES_NOTE,
  ...KIND_NOTES,
  // The expansion's four new Kinds (E4, decision 160).
  REVENANT_NOTE,
  CHANGELING_NOTE,
  DOPPELGANGER_NOTE,
  RUSALKA_NOTE,
  ...ASSET_NOTES,
  PROGRESS_NOTE,
  TIME_SKIP_NOTE,
  CREATION_NOTE,
  ...TABLE_NOTES,
  // The expansion's table families (E1, decisions 150-159).
  PEOPLE_NOTE,
  NIGHT_NOTE,
  PLACES_NOTE,
  FACTIONS_NOTE,
  VIGIL_NOTE,
  MASQUERADE_NOTE,
  RUMOURS_NOTE,
  FEEDING_NOTE,
  HOOKS_NOTE,
  OBJECTS_NOTE,
  INVESTIGATION_NOTE,
  ROADS_NOTE,
  ...CREATION_PROMPT_NOTES,
  REVENANT_PROMPTS_NOTE,
  CHANGELING_PROMPTS_NOTE,
  DOPPELGANGER_PROMPTS_NOTE,
  RUSALKA_PROMPTS_NOTE,
];

export const BLOOD_AND_BONE_RULES_PACK: BuiltinPack = {
  id: "blood-and-bone:rules",
  systemId: BLOOD_AND_BONE_ID,
  title: "Blood & Bone — Rules",
  description:
    "The AI edition of Blood & Bone: a small core the GM always carries, and the moves, Kinds, assets, miss tables and oracles it reads on demand. Importing it turns on the meter, track, session and action-roll tools.",
  notes: RULES_NOTES,
};

export const BLOOD_AND_BONE_EUROPE_PACK: BuiltinPack = {
  id: "blood-and-bone:europe",
  systemId: BLOOD_AND_BONE_ID,
  title: "Blood & Bone — Europe by Night",
  description:
    "A setting for the rules: the Concord, the Vigil and the Hollow Roads, and six cities (London, Paris, Prague, Rome, Berlin, Vienna) with factions, threats and hooks.",
  notes: EUROPE_NOTES,
};

export const BLOOD_AND_BONE: BuiltinSystem = {
  id: BLOOD_AND_BONE_ID,
  title: "Blood & Bone",
  description:
    "A modern supernatural horror game of monsters holding on to something human, and the hunters who stalk them. Roll a d6 plus a stat against two d10s; keep Stress, Beast and Exposure in check; fight in three exchanges. Built on the Ironsworn engine (CC BY 4.0, Tomkin Press); not an official Ironsworn product.",
  packs: [BLOOD_AND_BONE_RULES_PACK, BLOOD_AND_BONE_EUROPE_PACK],
  starters: [
    buildHollowHour([...RULES_NOTES, ...EUROPE_NOTES]),
  ],
  sheetTemplate: BLOOD_AND_BONE_SHEET_TEMPLATE,
  creationNoteId: "builtin:blood-and-bone:character-creation",
  creationSteps: BLOOD_AND_BONE_CREATION_STEPS,
  meterSets: BLOOD_AND_BONE_METER_SETS,
  endOfSessionReminder:
    "Dawn. Run the Reckoning for each character now: formula_roll [\"<Stress>d6\"] (skip it at Stress 0: no 1s), count the 1s, manage_meter adjust Beast by that count. Then: Wendigo Slipping Mask +1 (+2 Graverobber) for a foodless night; Heat -1 if nobody breached and someone suppressed attention; offer two downtime actions; clear every \"used tonight\" on the sheets.",
};
