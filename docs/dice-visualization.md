# Dice Roll Visualization

**Removed.** The GM's dice rolls (`formula_roll`, `opposed_formula`,
`npc_roll`, `reaction_check`, `negotiate_price`) no longer trigger any
on-screen animation. `app/components/DiceVisualizer.tsx`
and the `show_to_player`/`showToPlayer` plumbing that drove it have been
deleted.

The GM narrates roll outcomes in prose as part of normal story generation,
and full roll details (each pool's formula, its individual dice and its
total, plus the `calculate` comparison that settled the check) remain visible
in the tool-call log (`gmToolCalls` / `ContextViewer`) for players who want to
inspect the math.

Two modes do put real dice in the player's hands, and both are unaffected by
this removal:

- **Manual Dice Mode** (`ask_for_roll`) pauses the game and asks the player
  what their physical dice came up. Their answer reaches the GM as verbatim
  text - "17", "4 and 6", "natural 20!" - with no number parsed out of it,
  because pulling one total from the text broke every system that rolls more
  than a single pool. See `app/misc/gmTools.ts` (`askForRollTool`),
  `app/misc/gmExecutor.ts`, and `app/components/ManualRollModal.tsx`.
- **Physical Dice Mode** (`DiceThrowModal`) throws the roll on a 3D physics
  tray. Every pool in the roll goes into the *same* toss - `2d6+1d4` puts
  three dice in the tray at once, and Starforged's 1d6 lands next to its
  2d10 - then the settled faces are split back out per pool. See
  `DiceThrowRequest.groups` in `app/misc/gmExecutor.ts` and the batched
  `DiceResolver` in `app/misc/diceFormula.ts`.

## How a throw is made

The dice drop into the tray when it opens and sit there at rest. Pressing
anywhere takes them **into your hand**: they follow the pointer around the
tray as real physics bodies, knocking against each other and the walls, and
letting go throws them along the drag **at the speed the hand was moving at
the moment it let go** - measured over the last ~90ms, so carrying them slowly
across the tray and stopping drops them where you left them, while a flick
sends them flying. Nothing about the throw is randomized on the app's side;
where the dice end up is the physics simulation's answer to the gesture.

The release preserves the hand's speed *exactly* (bar a small gain that puts
back what averaging over 90ms shaves off the peak of a flick), because while
the dice are held the physics worker is already carrying them at that speed -
so any other release speed shows up as the dice changing pace at the instant
you let go. Two things used to throw that away and made a thrown die look like
it had hit an invisible brake:

- The throw's power was spent on **travel distance**, budgeted against the room
  left in the tray so that even a full-strength flick stopped short of the far
  wall. On a phone tray that capped every throw at ~6.7 units/sec against a
  hand carrying the dice at ~7.7. Gone: dice reach the walls of a tray, and
  bouncing off one is what dice do.
- The tray had **no physics material of its own**, so it ran on dice-box's
  defaults, which are built for dice that drop in and stop dead:
  `linearDamping: 0.5` bleeds half a die's speed every second in mid-air,
  and `restitution: 0.1` becomes 0.01 once Bullet multiplies the two bodies'
  values, so dice landed without a bounce. `TRAY_PHYSICS` in `diceThrow.ts`
  replaces them with a felt-lined tray. Measured on a phone-sized tray, the
  same flick now carries the dice **~5.7 world units instead of ~1.9**.

A roll also used to take a flat five seconds however fast the dice stopped:
dice-box ends a roll when a die's speed drops under 0.01, which is below the
solver's own resting jitter, so the check never fired and every roll ran out
its `settleTimeout` instead. The patched worker waits for a *run* of near-still
steps (~0.2s) instead, which fires on dice that have actually stopped while
refusing to freeze one still slowly toppling; `settleTimeout` is now only the
backstop it was meant to be.

Each pool also gets its own colour (`app/misc/diceColors.ts`) - d6 green, d10
red, and so on - so a mixed handful can be read at a glance. A die type keeps
its colour from roll to roll; only a second pool of the *same* type in one
roll (an opposed 1d20 vs 1d20) falls back to a spare colour so the two pools
stay tellable apart.

Three pieces make that work:

- `app/misc/diceThrow.ts` - the screen-to-tray geometry and all the tuning:
  where the hand holds the dice, how a hand speed in screen px/sec becomes a
  throw in world units/sec, and `TRAY_PHYSICS`, the tray's physics material
  (which has to be passed to the DiceBox *constructor* - the physics worker
  builds the floor and wall bodies from it during `init()`).
- `app/misc/diceControlChannel.ts` - a `BroadcastChannel` into dice-box's
  physics worker carrying grab/move/release. dice-box's own `updateConfig` is
  the only supported route to that worker and it rebuilds the tray's walls on
  every call, which is far too heavy to run per pointer-move.
- `scripts/patchDiceBox.mjs` - the postinstall patch that makes holding a die
  possible at all: dice-box has no notion of a die that isn't in flight, so
  the patch teaches its physics worker to servo held dice toward the hand and
  to exempt them from the settle check (a hand holding still is not a die
  coming to rest). It also replaces that settle check with the sustained-quiet
  one described above. It fails loudly on a dice-box version bump rather than
  silently leaving the dependency unpatched - and since it runs from
  `postinstall`, a tree that was already patched by an *older* revision needs
  an `npm install` (or a direct `node scripts/patchDiceBox.mjs`) to pick up
  changes to the patch itself.

`app/dev/dice-spike` is a standalone harness for the whole gesture - the tray
fills the viewport and rolls happen without a GM turn behind them, which is
what to use when retuning the constants in `diceThrow.ts`.
