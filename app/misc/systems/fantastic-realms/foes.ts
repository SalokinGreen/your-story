/**
 * Fantastic Realms: FR — Foes (design 2.4 and 2.7, decisions 205, 213, 216)
 * and FR — Levels (design 2.7, decisions 208, 209, 214). Original text
 * (decision 3).
 */
import type { BuiltinNote } from "../types";

export const FOES_NOTE: BuiltinNote = {
  id: "builtin:fantastic-realms:foes",
  title: "FR — Foes",
  type: "mechanics",
  tags: ["Fantastic Realms"],
  content: `# FR — Foes

Only players roll. Every other creature, from a goblin to a dragon, is one line:

**Name** — DC n · Words, Words · Hearts n · XP n

## The four parts
- **DC.** The number a hero rolls against to act on the foe. It is 2 to 6. **Its permanent words are already counted in it.** Start from how hard the foe is to beat on its own, then add 1 for each word that makes it harder (Armored, Fast, Flying, Regenerating), and keep the total at 6 or less. An Armored knight that would be DC 3 is printed DC 4.
- **Words.** Two to four. They tell you what the foe does, what its miss costs, and its edge in a fight.
- **Hearts.** 1 for a mook, 3 for a champion, 5 or more for a legend.
- **XP.** What beating it gives to each hero present (see the scale below).

## Kinds of words
- **Harm words** make a miss cost 2 hearts instead of 1: Deadly, Fire-Breath, Venomous, Crushing, Cursed Touch. They never stack. A miss costs 2 at most.
- **Edge words** add 1 to the foe's initiative number: Fast, Ambusher.
- **Other words** colour what it does and what a weak hit or a miss costs: Pack (it calls friends), Cruel, Armored, Flying, Sly, Hungry, Regenerating, Frightening, Cunning, Mounted. The word is the reminder; you decide what it means in the scene.

## The XP scale
- A mook: DC x 50.
- A champion: DC x 200.
- A legend: DC x 1,000.
Write the number on the line, so nobody has to work it out at the table.

## Fighting a foe
A foe never rolls. On its turn you narrate its threat, and each hero it targets rolls to answer it against its DC. A foe loses hearts as the hero's result says: 1 for a weak hit or a hit, 2 for a strong hit, plus 1 per magnitude. A mook with 1 heart falls to any hit; a champion takes a few rounds; a legend is a scene of its own and needs a plan, allies or a burned feat. You may move a DC by 1 for the moment (cornered, blinded, on high ground), always staying in 2 to 6.

## Three worked lines
**Cutpurse Goblin** — DC 3 · Fast, Sly · Hearts 1 · XP 150
A mook. Fast makes it hard to hit (DC 2 plus 1) and gives it an edge in initiative (4). Its threat is a snatched purse or a nick on the ankle. A miss costs the hero 1 heart or a pocketful.

**Barrow Knight** — DC 4 · Armored, Cursed Touch, Cruel · Hearts 3 · XP 800
A champion. Armored is already in the DC (it would be 3 without it). Cursed Touch is a harm word: a miss costs 2 hearts. Cruel says a weak hit costs the hero something they care about.

**Old Ember, the Mountain Wyrm** — DC 6 · Flying, Fire-Breath, Frightening · Hearts 6 · XP 6000
A legend. Fire-Breath is a harm word, so a miss against its flame costs 2 hearts. Frightening is a reminder that its first threat should shake the heroes' nerve before it burns them. A DC 6 foe is nearly out of reach, so give the heroes a way to bring it down by one: a bridge, a trick, a friend.

## Making one up fast
1. Name the foe and pick mook, champion or legend: that sets the hearts.
2. Pick a base DC from 2 to 5 from how tough it is.
3. Choose 2 to 4 words. Add 1 to the DC for each defensive word. Keep the DC at 6 or less.
4. Multiply for the XP.
5. Write the line, then play it by its words.`,
};

export const LEVELS_NOTE: BuiltinNote = {
  id: "builtin:fantastic-realms:levels",
  title: "FR — Levels",
  type: "mechanics",
  tags: ["Fantastic Realms"],
  content: `# FR — Levels

## Earning XP
- **A foe beaten:** the XP on its stat line (DC x 50 for a mook, x 200 for a champion, x 1,000 for a legend).
- **A treasure gathered:** roughly its worth in gold, written on it.
- **A quest finished:** 500 to 2,000.

Award it with award_xp, with a short name for the source. **Every hero present gets the full amount.** Nothing is split. A hero who already had a source is refused it, so a foe or a treasure is never counted twice. The tool credits everyone else in the same call.

## Levelling up
Going from level N to level N+1 costs **(N+1) x 1,000 XP**, and the count then starts again. Level 2 costs 2,000 XP, then level 3 costs 3,000 more, and so on. Several levels in one go are counted in order. The top is level 20.

Every new level gives:
- **A new feat.** Earn it in play: the GM offers one from what happened, a word or a phrase that tells that story ("Dragon-Scarred", "Friend of the Deep King", "Barrow-Bold"). The player may agree, reword or ask for a different one. Add it with manage_feats add.
- **Sharpening, if wanted.** The player may also reword one of their existing feats to something more exact. This is not a new feat; the new feat is still gained. Use manage_feats rename, which keeps a burned feat burned.
- **+1 maximum heart, every third level** (3, 6, 9 and so on). It is gained at once, so the hero also has the heart. award_xp does this for you and reports it.

## Reading the report
award_xp says plainly what to do: "Bryn: level 3 reached. Offer a new feat. +1 maximum heart." Do each part in the scene: offer the feat, add it, and narrate the change if there is one.`,
};
