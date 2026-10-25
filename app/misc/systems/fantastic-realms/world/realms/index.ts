/**
 * The three realms of Fantastic Realms' world pack: Aurelane (bright and
 * heroic), Larkenfell (a folk frontier) and Gloamreach (grim). Each realm is
 * one file here and two notes: the realm (look, people, places, troubles,
 * magic, local callings, a twelve-foe roster with tactics, in the stat-line
 * format "**Name** — DC n · Words · Hearts n · XP n") and its tables (a d12
 * miscast table, a d20 treasure table and a d20 road table). Split from the
 * single realms.ts in slice E3; the realm note ids are unchanged. Original
 * text (decision 3).
 */
import type { BuiltinNote } from "../../../types";
import { AURELANE_NOTE, AURELANE_TABLES_NOTE } from "./aurelane";
import { GLOAMREACH_NOTE, GLOAMREACH_TABLES_NOTE } from "./gloamreach";
import { LARKENFELL_NOTE, LARKENFELL_TABLES_NOTE } from "./larkenfell";

export const REALM_IDS = ["aurelane", "larkenfell", "gloamreach"] as const;

/** Realm id to its rest condition, for take_rest (BuiltinSystem.rests). */
export const FANTASTIC_REALMS_RESTS: Record<string, string> = {
  aurelane: "A few hours.",
  larkenfell: "A night by a fire with a full meal.",
  gloamreach: "Weeks, somewhere safe.",
};

export {
  AURELANE_NOTE,
  AURELANE_TABLES_NOTE,
  GLOAMREACH_NOTE,
  GLOAMREACH_TABLES_NOTE,
  LARKENFELL_NOTE,
  LARKENFELL_TABLES_NOTE,
};

/** The three realm notes (lore). */
export const REALM_NOTES: BuiltinNote[] = [AURELANE_NOTE, LARKENFELL_NOTE, GLOAMREACH_NOTE];

/** Each realm's tables note (miscasts, treasure, the road). */
export const REALM_TABLE_NOTES: BuiltinNote[] = [
  AURELANE_TABLES_NOTE,
  LARKENFELL_TABLES_NOTE,
  GLOAMREACH_TABLES_NOTE,
];
