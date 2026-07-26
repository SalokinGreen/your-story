# RPG Systems Documentation (Removed)

The 8-system dice picker described in this document (3d6, 1d20, 1d100,
percentile, PbtA, Fate Core, YZE, Explosive Dice) has been removed. There
is no `storyData.rpgSystem` setting anymore - the GM improvises dice
formulas per-adventure via the `formula_roll` / `opposed_formula` tools, and
compares the results against whatever target the adventure's mechanics note
calls for using `calculate`, instead of a fixed client-side system.

See [`game-mechanics.md`](./game-mechanics.md) for how dice resolution
actually works now, and its "What Changed From the Old System" section for
what was removed.

`app/misc/rpgSystems.ts` still exists but now only exports a handful of
generic parsing helpers (`parseDCValue`, `parsePointsValue`,
`parseChallengeRoundsValue`) used by the live tool executor; the 8 system
definitions and their `rollDice`/`checkSuccess` logic are no longer called
from anywhere in the app.

The dice tools have since stopped comparing against a DC at all - they report
what the dice showed, and `calculate` answers whether that beat the target.
That's what finally made genuinely different resolution shapes work
(Starforged's action die vs. its challenge dice, roll-under systems, degrees
of success) rather than only the ones expressible as "one roll ≥ one number".
