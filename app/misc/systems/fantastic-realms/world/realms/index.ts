/**
 * The six realms of Fantastic Realms' world pack: Aurelane (bright and
 * heroic), Larkenfell (a folk frontier), Gloamreach (grim), and, from slice E4,
 * Thornmere (a drowned kingdom of fen-cities), Emberhold (a volcanic realm of
 * forge-halls) and the Hollow Sky (cloud-islands). Each realm is one file here
 * and two notes: the realm (look, people, places, troubles, magic, local
 * callings, a twelve-foe roster with tactics, in the stat-line format
 * "**Name** — DC n · Words · Hearts n · XP n") and its tables (a d12 miscast
 * table, a d20 treasure table and a d20 road table). Split from the single
 * realms.ts in slice E3; the realm note ids are unchanged. Original text
 * (decision 3).
 */
import type { BuiltinNote } from "../../../types";
import { AURELANE_NOTE, AURELANE_TABLES_NOTE } from "./aurelane";
import { EMBERHOLD_NOTE, EMBERHOLD_TABLES_NOTE } from "./emberhold";
import { GLOAMREACH_NOTE, GLOAMREACH_TABLES_NOTE } from "./gloamreach";
import { HOLLOW_SKY_NOTE, HOLLOW_SKY_TABLES_NOTE } from "./hollow-sky";
import { LARKENFELL_NOTE, LARKENFELL_TABLES_NOTE } from "./larkenfell";
import { THORNMERE_NOTE, THORNMERE_TABLES_NOTE } from "./thornmere";

export const REALM_IDS = [
  "aurelane",
  "larkenfell",
  "gloamreach",
  "thornmere",
  "emberhold",
  "hollow-sky",
] as const;

/** Realm id to its rest condition, for take_rest (BuiltinSystem.rests). */
export const FANTASTIC_REALMS_RESTS: Record<string, string> = {
  aurelane: "A few hours.",
  larkenfell: "A night by a fire with a full meal.",
  gloamreach: "Weeks, somewhere safe.",
  thornmere: "A dry night under a roof.",
  emberhold: "A day at a forge-hall's hearth.",
  "hollow-sky": "One turn of the sky-wheel, about six hours.",
};

export {
  AURELANE_NOTE,
  AURELANE_TABLES_NOTE,
  EMBERHOLD_NOTE,
  EMBERHOLD_TABLES_NOTE,
  GLOAMREACH_NOTE,
  GLOAMREACH_TABLES_NOTE,
  HOLLOW_SKY_NOTE,
  HOLLOW_SKY_TABLES_NOTE,
  LARKENFELL_NOTE,
  LARKENFELL_TABLES_NOTE,
  THORNMERE_NOTE,
  THORNMERE_TABLES_NOTE,
};

/** The six realm notes (lore). */
export const REALM_NOTES: BuiltinNote[] = [
  AURELANE_NOTE,
  LARKENFELL_NOTE,
  GLOAMREACH_NOTE,
  THORNMERE_NOTE,
  EMBERHOLD_NOTE,
  HOLLOW_SKY_NOTE,
];

/** Each realm's tables note (miscasts, treasure, the road). */
export const REALM_TABLE_NOTES: BuiltinNote[] = [
  AURELANE_TABLES_NOTE,
  LARKENFELL_TABLES_NOTE,
  GLOAMREACH_TABLES_NOTE,
  THORNMERE_TABLES_NOTE,
  EMBERHOLD_TABLES_NOTE,
  HOLLOW_SKY_TABLES_NOTE,
];
