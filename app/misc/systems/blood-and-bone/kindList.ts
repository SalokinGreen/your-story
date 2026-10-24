/**
 * Blood & Bone's Kinds, in the order the book lists them: the seven of the
 * first release and the four of the expansion (E4, decision 160). The sheet
 * template, the creation note, the core's note index and the table-shape
 * test all read this list, so a new Kind is added here once.
 */
export const BLOOD_AND_BONE_KINDS = [
  "Vampire",
  "Gargoyle",
  "Wendigo",
  "Werewolf",
  "Witch/Warlock",
  "Hunter",
  "Ghost",
  "Revenant",
  "Changeling",
  "Doppelgänger",
  "Rusalka",
] as const;

/** "A, B, … or K", for running text. */
export function kindsInWords(joiner: "or" | "and" = "or"): string {
  const k = [...BLOOD_AND_BONE_KINDS];
  return `${k.slice(0, -1).join(", ")}, ${joiner} ${k[k.length - 1]}`;
}
