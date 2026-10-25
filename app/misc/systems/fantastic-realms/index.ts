/**
 * Fantastic Realms, the second built-in system (docs/fantastic-realms-design.md,
 * decisions 201-219): light fantasy where words are power. Two packs (the
 * rules, and a world of three realms meeting at the Crossroads), one starter,
 * the sheet template, the creation steps and the hero meter set. The text is
 * original (decision 3). Not registered in systems/index.ts here: the
 * registration is its own step.
 */
import type { BuiltinNote, BuiltinPack, BuiltinSystem } from "../types";
import { CORE_NOTE, FANTASTIC_REALMS_CORE_ID } from "./core";
import { CREATION_NOTE } from "./creation";
import { FOES_NOTE, LEVELS_NOTE } from "./foes";
import {
  FANTASTIC_REALMS_CREATION_STEPS,
  FANTASTIC_REALMS_HISTORY_HINT,
  FANTASTIC_REALMS_METER_SETS,
  FANTASTIC_REALMS_SHEET_TEMPLATE,
} from "./sheet";
import { buildWolfwillowCrossing } from "./starters/wolfwillow-crossing";
import { CROSSROADS_NOTE, CROSSROADS_SCOPE } from "./world/crossroads";
import { FANTASTIC_REALMS_RESTS, REALM_NOTES } from "./world/realms";
import { TABLE_NOTES } from "./world/tables";

export const FANTASTIC_REALMS_ID = "fantastic-realms";

export const FANTASTIC_REALMS_RULES_NOTES: BuiltinNote[] = [
  CORE_NOTE,
  CREATION_NOTE,
  FOES_NOTE,
  LEVELS_NOTE,
];

export const FANTASTIC_REALMS_WORLD_NOTES: BuiltinNote[] = [
  CROSSROADS_NOTE,
  ...REALM_NOTES,
  ...TABLE_NOTES,
];

export const FANTASTIC_REALMS_RULES_PACK: BuiltinPack = {
  id: "fantastic-realms:rules",
  systemId: FANTASTIC_REALMS_ID,
  title: "Fantastic Realms — Rules",
  description:
    "The rules of Fantastic Realms: a small core the GM always carries, and character creation, foes and levels it reads on demand. Importing it turns on the feat, initiative, XP and rest tools.",
  notes: FANTASTIC_REALMS_RULES_NOTES,
};

export const FANTASTIC_REALMS_CROSSROADS_PACK: BuiltinPack = {
  id: "fantastic-realms:crossroads",
  systemId: FANTASTIC_REALMS_ID,
  title: "Fantastic Realms — The Crossroads",
  description:
    "A world of realms with different rules, meeting at the Waymeet: bright Aurelane, folk Larkenfell and grim Gloamreach, with their people, places, troubles and foes, and tables for names, foes, treasure and the road.",
  notes: FANTASTIC_REALMS_WORLD_NOTES,
};

/**
 * The fields below `tools` do not exist on BuiltinSystem in this branch yet
 * (the systems plumbing slice adds `tools`, `coreNoteId`, `defaultSetting`,
 * `crossSettingScope`, `stepHints` and `rests`). The type assertion lets this
 * object compile now; remove it once types.ts has them.
 */
export const FANTASTIC_REALMS = {
  id: FANTASTIC_REALMS_ID,
  title: "Fantastic Realms",
  description:
    "A light fantasy game in which words are power. A hero is a one-line concept and four feats, such as Brave, Sword or \"I hate goblins!\", and every feat that fits what you are doing adds a die. Roll against a difficulty of 2 to 6: more successes mean a better result, and burning a feat is a grand gesture that guarantees one. Three hearts, no stat blocks, and foes are just a number and a few words. The world is a crossroads of realms with different rules: bright Aurelane, folk Larkenfell and grim Gloamreach. Inspired by EZD6, Stonetop, Tiny RPG, Mythic Bastion Land and Legends of the Mist.",
  packs: [FANTASTIC_REALMS_RULES_PACK, FANTASTIC_REALMS_CROSSROADS_PACK],
  starters: [
    buildWolfwillowCrossing([
      ...FANTASTIC_REALMS_RULES_NOTES,
      ...FANTASTIC_REALMS_WORLD_NOTES,
    ]),
  ],
  sheetTemplate: FANTASTIC_REALMS_SHEET_TEMPLATE,
  creationNoteId: "builtin:fantastic-realms:character-creation",
  creationSteps: FANTASTIC_REALMS_CREATION_STEPS,
  meterSets: FANTASTIC_REALMS_METER_SETS,
  endOfSessionReminder:
    "A session is over. Offer each hero a rest if the realm allows it (take_rest), award any XP not yet given (award_xp), and say where the story picks up.",
  tools: [
    "manage_meter",
    "manage_feats",
    "feat_roll",
    "initiative_roll",
    "award_xp",
    "take_rest",
  ],
  coreNoteId: FANTASTIC_REALMS_CORE_ID,
  defaultSetting: CROSSROADS_SCOPE,
  crossSettingScope: CROSSROADS_SCOPE,
  stepHints: { history: FANTASTIC_REALMS_HISTORY_HINT },
  rests: FANTASTIC_REALMS_RESTS,
} as BuiltinSystem;
