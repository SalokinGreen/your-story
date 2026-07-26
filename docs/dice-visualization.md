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
