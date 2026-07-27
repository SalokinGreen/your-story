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
letting go throws them along the drag **as hard as the hand was moving at the
moment it let go** - measured over the last ~90ms, so carrying them slowly
across the tray and stopping drops them where you left them, while a flick
sends them flying. Nothing about the throw is randomized on the app's side;
where the dice end up is the physics simulation's answer to the gesture.

Each pool also gets its own colour (`app/misc/diceColors.ts`) - d6 green, d10
red, and so on - so a mixed handful can be read at a glance. A die type keeps
its colour from roll to roll; only a second pool of the *same* type in one
roll (an opposed 1d20 vs 1d20) falls back to a spare colour so the two pools
stay tellable apart.

Three pieces make that work:

- `app/misc/diceThrow.ts` - the screen-to-tray geometry and all the tuning:
  where the hand holds the dice, how release speed becomes throw power, and
  how power is budgeted against the room available so even a full-strength
  flick spends itself before the far wall instead of rebounding off it.
- `app/misc/diceControlChannel.ts` - a `BroadcastChannel` into dice-box's
  physics worker carrying grab/move/release. dice-box's own `updateConfig` is
  the only supported route to that worker and it rebuilds the tray's walls on
  every call, which is far too heavy to run per pointer-move.
- `scripts/patchDiceBox.mjs` - the postinstall patch that makes holding a die
  possible at all: dice-box has no notion of a die that isn't in flight, so
  the patch teaches its physics worker to servo held dice toward the hand and
  to exempt them from the settle check (a hand holding still is not a die
  coming to rest). It fails loudly on a dice-box version bump rather than
  silently leaving the dependency unpatched.

`app/dev/dice-spike` is a standalone harness for the whole gesture - the tray
fills the viewport and rolls happen without a GM turn behind them, which is
what to use when retuning the constants in `diceThrow.ts`.
