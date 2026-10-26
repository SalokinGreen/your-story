/**
 * Fantastic Realms: FR — Magic (docs/fr-expansion-design.md section 2,
 * decisions 246, 254). Original text (decision 3).
 */
import type { BuiltinNote } from "../../types";

export const MAGIC_NOTE: BuiltinNote = {
  id: "builtin:fantastic-realms:magic",
  title: "FR — Magic",
  type: "mechanics",
  tags: ["Fantastic Realms", "magic"],
  content: `# FR — Magic

Read this before the first spell in a story, and again when a miscast is due.

## A spell is a feat
*Fireball*, *Mind Control*, *Speak with the Dead*, *Warding Circle*. Add it with manage_feats add, kind "spell". It adds a die like any feat, when it fits the deed. A hero may hold several spells. There is no spell list and no slots: if the words fit, the player names the spell in feat_roll.
- **It reaches as far as its words.** *Mind Control* does not throw fire. A stretch gets one question, as for any feat.
- **A spell narrated without its feat is a plain action.** No spell die, and no miscast on a miss.
- **The engine notices.** When a named feat is a spell, the roll is magic, and its result carries the miscast reminder on a miss.

## What magic can do
It does what a skilled mundane hand could not: touch a mind, call fire, close a wound, see far, speak with what cannot answer. The DC follows the deed, not the spell. Calming a frightened horse is DC 2. Turning a dragon's will is DC 6. Two heroes casting the same spell face different DCs for different deeds.

## The cost is the miss
A magic miss is a **miscast**, and the miscast is the roll's whole consequence: never a heart on top of it. It spends the one harm budget (FR — Core rules). Choose a kind below, or roll the d12 miscast table in the realm's tables note (FR — Aurelane tables, FR — Larkenfell tables, FR — Gloamreach tables):
- **Backfire.** One heart, or one condition, to the caster.
- **Goes wide.** It hits the wrong target, or the right one in the wrong way.
- **Draws attention.** Something notices, and it is not friendly.
- **Leaves a mark.** A condition such as *Hollow-Eyed*, *Burning* or *Charmed*, until a rest.
- **Costs the spell.** manage_feats burn on that spell: it is out until a rest, and it did not get the burn's sure success.

A weak hit works at a cost. A small miscast is a fine cost, taken from the same list, but never more than one item of it.

**Burning a spell** is the grand version: one sure success and its die, then the spell is out until the rest. A burned spell is not a miscast; a miscast that costs the spell is.

## Setting the DC from the deed
- **DC 2:** a small wonder. Calm a horse, light a damp fire, find what was dropped, read the mood of a room.
- **DC 3:** a real feat. Hold a door shut with a word, call a gust to scatter smoke, mend a wound that is not mortal.
- **DC 4:** it will cost. Hurl fire at a pack, bind a wary mind for a moment, ward a camp against a night.
- **DC 5:** the stuff of songs. Bring down a bridge's worth of stone, turn a captain against his own, see across a realm.
- **DC 6:** almost impossible. Turn a dragon's will, wake the dead for a whole night, close a rift in the sky.
A foe's DC already counts what it can do: a spell struck at a foe rolls against that DC, and the deed's DC only matters for what is not a foe.

## Two miscasts, worked
- *Fireball* in a crowded hall misses. **Goes wide:** the flames catch the tapestries instead, and the party has a fire to fight. The budget is spent; nobody loses a heart.
- *Speak with the Dead* misses in Gloamreach. **Leaves a mark:** the caster is *Hollow-Eyed* until the next rest, and something in the barrow now knows their name. One condition is the whole budget.

## Healing
A healing spell clears a condition that names no cure, or one whose named cure it is (a *Poisoned* hero with the cure "an antidote or a healer" is mended by a healer's spell). It can lift a hero who is down back to 1 heart (manage_meter adjust Hearts). Hearts otherwise return only at a rest, so magic never refills a wounded party in the middle of a fight. A scar is never healed, only turned into a feat at a level.

## Each realm's magic
- **Aurelane.** Bright, courtly, sanctioned. Done in public with a flourish. Miscasts lean to attention and glory gone wrong.
- **Larkenfell.** Folk-magic and bargains: hedge-charms, knots, words said over bread. Miscasts lean to the hedge-folk taking their price.
- **Gloamreach.** Rare and costly. Few cast, and everyone remembers what it cost. Miscasts lean to marks and hollowness.
- **Thornmere.** Tide-work: bells, brine and names said over water. Miscasts lean to the water answering back.
- **Emberhold.** Work-magic: rune and hammer, heat and name. Miscasts lean to heat, flaws in the work and debts.
- **The Hollow Sky.** Wind-magic: sung, tied and whistled. Miscasts lean to gusts, falls and the sky answering back.
Each realm note has a "Magic here" section, and its tables note a d12 miscast table. Outside the six realms, use the lean above.

## Learning magic
A spell is gained like any feat: at creation, when the concept supports it, or at a level, from what happened ("Ghost-Touched" after a night in a barrow). A teacher, a bargain or a scar turned into a feat all work.

## Forty spell feats to borrow
Never a closed list. Reword them, narrow them, make up better ones.
**Bright and public.** Banner of Light; Fanfare of Courage; Gilded Shield; Herald's Voice; Sun-Kiss Healing; Starfall Sparks; Oath of Truth; Mirror Ward; Crown of Flame; Gallant's Leap.
**Folk and bargained.** Speak with Beasts; Hearth-Blessing; Thorn-Tongue; Knot of Luck; Charm against Fire; Whisper to the Well; Hedge-Path; Bargain with the Little Folk; Bread That Keeps; Grandmother's Remedy.
**Dark and costly.** Speak with the Dead; Candle-Sight; Grave-Chill; Shadow-Step; Name the Fear; Bone-Lock; Borrowed Breath; Hollow Gaze; Mist-Walk; Whisper of the Void.
**Plain and everywhere.** Fireball; Mind Control; Warding Circle; Calm the Beast; Lightning Lash; Unseen Servant; Far-Seeing; Mend Flesh; Unlock Anything; Stone Skin.

## Running a spell
1. The player names the spell and says what they want.
2. You set the DC from the deed, and say the cost in the fiction if it fails.
3. feat_roll with the spell among feats (and hindered_by for a condition in the way: *Afraid* does not stop a spell, a gag does).
4. A miss: the miscast. A weak hit: it works, at a cost. A hit: it works. A strong hit: it works well, with a magnitude.`,
};
