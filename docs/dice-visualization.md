# Dice Roll Visualization

**Removed.** The GM's dice rolls (`formula_roll`, `opposed_formula`,
`formula_challenge_check`, `npc_roll`, `reaction_check`, `negotiate_price`) no
longer trigger any on-screen animation. `app/components/DiceVisualizer.tsx`
and the `show_to_player`/`showToPlayer` plumbing that drove it have been
deleted.

The GM narrates roll outcomes in prose as part of normal story generation,
and full roll details (formula, individual dice, total, DC, success) remain
visible in the tool-call log (`gmToolCalls` / `ContextViewer`) for players who
want to inspect the math.

Players who want to physically roll dice and have the result matter should
use **Manual Dice Mode** (`ask_for_roll`), which pauses the game for the
player to enter their own roll. That flow is unaffected by this change; see
`app/misc/gmTools.ts` (`askForRollTool`) and `app/misc/gmExecutor.ts`.
