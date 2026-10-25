/**
 * Fantastic Realms: FR — Bestiary (docs/fr-expansion-design.md section 7,
 * decisions 216, 217; section 14). The general foe rules past FR — Foes: the
 * twenty words, tactics and phases. Original text (decision 3).
 */
import type { BuiltinNote } from "../../types";

export const BESTIARY_NOTE: BuiltinNote = {
  id: "builtin:fantastic-realms:bestiary",
  title: "FR — Bestiary",
  type: "mechanics",
  tags: ["Fantastic Realms", "foes"],
  content: `# FR — Bestiary

FR — Foes tells you how to write a foe line. This note is for the words a foe carries and for the fights that run long. Each realm note holds its own roster.

## The line, with a tactic
**Name** — DC n · Words, Words · Hearts n · XP n
*Tactics:* one line on what it does on its turn: the threat you will narrate. Write it down before the fight and the foe's turn takes five seconds.

## The twenty words
Four kinds. A word is a reminder; you decide what it looks like in the scene.

**Harm words** (a miss against the foe's threat costs 2 instead of 1; they never stack, and the roll's one harm budget still holds): **Deadly** (kills if it can); **Fire-Breath** (flame, from a distance); **Venomous** (a bite or a sting that lingers: give *Poisoned*); **Crushing** (weight and grip); **Cursed Touch** (a touch that marks: give *Cursed*).

**Edge words** (+1 to the foe's initiative number each): **Fast** (moves before it is seen); **Ambusher** (strikes first from hiding); **Hair-Trigger** (acts the moment anything moves); **Watchful** (never caught flat).

**Guard words** (already counted in the printed DC; they colour the scene, do not add them again): **Armored** (plate, hide or shell); **Swarm** (many bodies; a clever sweep beats it); **Flying** (out of reach until it dives); **Regenerating** (wounds close; give the heroes a reason, like fire or salt); **Slippery** (hard to hold or pin).

**Strange words** (beating it needs a specific feat or item, named in the roll): **Undying** (stands again unless its bond is broken); **Shapeshifter** (cannot be fought until its true shape shows); **Invisible** (cannot be struck until revealed); **Ethereal** (cannot be struck by the mundane); **Iron-Bane** (only cold iron or a blessed edge hurts it); **Moon-Bound** (can be hurt only under the moon, or by its token). A hit without the key holds the foe off but removes no hearts: do not adjust its Hearts meter. Tell the player why, and what would help. Strange words are a puzzle, not a wall.

## Tactics by kind
- **Mooks** hit once and fall. Their turn is a nuisance, not a danger: a nick, a snatch, a shove.
- **Champions** pick a target and press. Alternate between one hard threat and one trick.
- **Packs** threaten several heroes at once. Each targeted hero answers separately, and one miss cannot cost more than the roll's budget.
- **Legends** change as they bleed. Use phases.

## Phases (for legends)
A legend has 2 or 3 phases. Each states its own DC, words and next threat, and is worse than the one before.
- The legend's remaining hearts decide the phase. Damage is never capped at a mark; if a heavy blow crosses two, the middle phase is skipped.
- A new phase starts when its hearts fall to the mark. Narrate the change before the next threat.
- A legend falls at 0 hearts with no free threat. Beating it is its own reward: award_xp.
- Format: **Name, Phase 2** — DC n · Words · Hearts mark (n) · Threat: one line.
FR — Legends holds the legends.

## Encounters that work
Two to four foes at a time, one stronger. A fight longer than five rounds wants a way out for either side: a retreat, a deal, a collapsing roof. Reward clever play with a lowered DC for a scene; punish carelessness with a raised one. A foe is a number and a few words: let the rest come from the table.`,
};
