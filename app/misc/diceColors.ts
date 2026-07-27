// Colours for the 3D dice tray, so a roll made of more than one pool reads as
// the separate handfuls it is: "1d6+2d10" puts one green d6 in the tray next
// to two red d10s rather than three anonymous dice the player has to count by
// shape.
//
// dice-box applies these per die via the `themeColor` on each notation entry -
// the bundled `default` theme declares a `"type": "color"` material, which is
// what makes a per-die tint possible at all (see its theme.config.json). The
// colour rides along on the die objects dice-box hands back, so it survives a
// reroll of the same dice.

/**
 * The colour a die type gets whenever it can. Chosen to stay distinct from
 * each other under the tray's lighting. Numerals stay legible on all of them
 * without any care here: dice-box swaps between a light and a dark numeral
 * texture per die based on the colour's luminance.
 */
export const DIE_TYPE_COLORS: Readonly<Record<number, string>> = {
  4: "#f59e0b", // amber
  6: "#22c55e", // green
  8: "#06b6d4", // cyan
  10: "#ef4444", // red
  12: "#a855f7", // violet
  20: "#3b82f6", // blue
  100: "#ec4899", // pink
};

/**
 * Spare colours for pools that can't have their die type's own colour because
 * an earlier pool in the same roll already took it - an opposed check rolling
 * 1d20 against 1d20 is two pools of the same type, and they still have to be
 * tellable apart in the tray.
 */
// Deliberately not more shades of the seven above: a spare's whole job is to
// not be mistaken for a die type's own colour, so these sit in the gaps the
// type palette leaves - two neutrals and two off-hues.
export const SPARE_COLORS: readonly string[] = [
  "#e2e8f0", // bone (light enough that dice-box gives it dark numerals, like real ivory)
  "#475569", // graphite
  "#84cc16", // lime
  "#b45309", // rust
];

/**
 * Picks one colour per requested pool, in the same order as the pools.
 *
 * A die type keeps its own colour (d6 green, d10 red) so the mapping is stable
 * from roll to roll. Only a pool whose colour was already claimed by an
 * earlier pool of the same type falls back to a spare, and the spares skip
 * anything another pool in this roll is already using, so no two pools in one
 * throw ever come out the same colour.
 */
export function colorsForGroups(groups: { sides: number }[]): string[] {
  const claimed = new Set<string>();
  const colors: (string | null)[] = groups.map((group) => {
    const own = DIE_TYPE_COLORS[group.sides];
    if (!own || claimed.has(own)) return null;
    claimed.add(own);
    return own;
  });

  // Spares first, then any die-type colour this roll didn't claim - reaching
  // for "some other die type's colour" is a last resort, since it's the one
  // choice that can make a d10 look like a d4.
  const spares = [...SPARE_COLORS, ...Object.values(DIE_TYPE_COLORS)].filter(
    (color) => !claimed.has(color)
  );

  let next = 0;
  return colors.map((color, i) => {
    if (color) return color;
    const spare = spares[next++];
    if (spare) {
      claimed.add(spare);
      return spare;
    }
    // More pools than colours (nine-plus pools in one roll has never happened,
    // but a repeat beats undefined).
    return SPARE_COLORS[i % SPARE_COLORS.length];
  });
}
