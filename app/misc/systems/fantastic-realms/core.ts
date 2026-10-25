/**
 * Fantastic Realms: the core rules note, the one the GM carries every round
 * (design section 6, decisions 201-218). Original text (decision 3). Keep it
 * under 3,000 tokens: it is a pinned dm_instructions note.
 */
import type { BuiltinNote } from "../types";

export const FANTASTIC_REALMS_CORE_ID = "builtin:fantastic-realms:core";

export const CORE_NOTE: BuiltinNote = {
  id: FANTASTIC_REALMS_CORE_ID,
  title: "FR — Core rules",
  type: "dm_instructions",
  tags: ["Fantastic Realms"],
  content: `# FR — Core rules

Fantastic Realms is light fantasy where words are power. A hero is a one-line concept and four feats: words or short phrases such as Brave, Sword, Quick Shot or "I hate goblins!". Fiction first. The engine rolls and counts; you narrate. Every number below is final. Keep it warm, vivid and fair.

## 1. Running it
- Ask for a roll only when failing would be interesting and something is at stake. Otherwise narrate it as a hit. An easy task (DC 1) is never rolled.
- Only players roll. Everyone else, from a goblin to a dragon, is a stat line (section 5). NEVER use start_combat, combatant tools, npc_roll or action_roll in this game.
- A miss is never "nothing happens". Say the cost before the roll when you can. Never fudge.
- Call increment_scene at every scene change.
- Setup, for EVERY hero however they were made (full or quick setup, a pre-made hero, a player who joins later), the moment their feats are known: manage_meter create_set "Fantastic Realms hero" with owner = the hero's name, then manage_feats add once for each of the four feats. Look at Meters & tracks and the feats line first, and never set a hero up twice.

## 2. The roll: feat_roll
Call feat_roll with hero, feats (the feats they lean on), dc, burn (optional), reason. The pool is one base d6 plus one d6 for each feat. The player names the feats they lean on and you accept or refuse each. A feat counts when it plausibly helps with what the hero is doing right now. Read feats generously but honestly: a phrase covers what it says, a clever use is welcome, a stretch gets one question ("how does that help?"), and a feat that plainly does not fit is refused. Each feat counts once per roll. A burned feat adds nothing.
- DC, from the situation: 1 Easy, no roll. 2 Average, it can go wrong. 3 Hard. 4 Very hard. 5 Heroic. 6 Almost impossible. A feat_roll takes 2 to 6.
- Each die that equals or beats the DC is a success. Successes give the result: 0 miss, 1 weak hit, 2 hit, 3 strong hit. Beyond three, each extra success is one magnitude more: four is strong +1, five is strong +2.
- Miss: it fails and it costs. Weak hit: it works, with a cost or only partly. Hit: it works. Strong hit: it works well, with something extra. A magnitude is yours to narrate: more damage, more foes affected, further, faster, a lasting edge.
- The engine reports the dice, the successes and the result. Never roll these dice with formula_roll.

## 3. Burning a feat
A grand display of one feat. Pass its name as burn (it must also be in feats, unburned, one per roll). The burned feat counts as one sure success, and its die is still rolled, so it may add another. Then it adds nothing to any roll until the next rest. Burning is recorded only when the roll completes. A refusal from the engine is an error, not a miss: fix the call and roll again.

## 4. Hearts, harm and down
Each hero has meters: Hearts (3 to start), Level and XP.
- A miss costs 1 heart, or 2 when the danger has a harm word that applies (Deadly, Fire-Breath, Venomous). Harm words never stack: a miss costs at most 2.
- A weak hit costs 1 heart only if you choose harm as its cost. Otherwise the cost is something else: a position lost, gear damaged, a foe unhurt, time spent.
- Spend hearts with manage_meter adjust Hearts by a negative number.
- At 0 hearts the hero is down: out of the scene. Pick a cost: captured, scarred (write it on the sheet), a feat lost (manage_feats remove), gear gone. Death comes only when the realm's tone and the stated stakes say so, and you say so before the roll.

## 5. Foes are stat lines
**Name** — DC n · Words, Words · Hearts n · XP n. The DC is the number a hero rolls against to act on that foe, and its permanent words are already counted in it (an Armored knight is printed at DC 4, not DC 3 and +1). Words say what it does, what its miss costs, and its initiative edge. You may move a DC by 1 for the moment (cornered, blinded, on high ground), keeping it within 2 to 6. Hearts: 1 for a mook, 3 for a champion, 5 or more for a legend. Read FR — Foes to write your own, and the realm notes for ready ones. A foe is never rolled for: it is only a number.

## 6. Fights
- Initiative, once, when the fight starts: initiative_roll with each hero and their edge_feats (feats that help them get the edge). A hero's number is 1d6 plus 1 per edge feat. A foe's number is its DC plus 1 per edge word (Fast, Ambusher), with no roll. Highest goes first; ties go to the heroes.
- A hero's turn: they say what they do and feat_roll against the foe's DC. A foe loses hearts by the result: weak hit 1 (and the hero pays a cost), hit 1, strong hit 2, plus 1 for each magnitude. A DC 1 action counts as a hit: 1 heart.
- A foe's turn: foes never roll. Narrate its threat (a charge, a spell, an ambush) aimed at one or more heroes. Each targeted hero who has not yet acted rolls to answer it: feat_roll against the foe's DC, with the feats that help. A miss takes the harm (section 4). A weak hit takes it partly or pays another cost. A hit or better avoids it. A strong hit can also turn it back on the foe. Heroes who beat the foe's number act before its threat lands.
- At 0 hearts a foe is beaten, or flees or yields if its nature allows. After the first round, go back to ordinary turn-taking and move the spotlight.

## 7. Rests
One kind of rest, and the realm sets the condition. Aurelane: a few hours. Larkenfell: a night by a fire with a full meal. Gloamreach: weeks somewhere safe. When the fiction allows it, call take_rest with realm (and heroes, if not everyone present). It heals every heart and un-burns every feat for each hero who takes part, and it returns the realm's condition as a reminder. Whether the fiction allows the rest is your call. Hearts do not come back any other way.

## 8. XP and levels
Call award_xp with amount and source (a short name: "Goblin ambush", "Barrow silver"). Every hero present gets the full amount, no splitting. A source a hero already had is refused, so a foe or a treasure is never counted twice. Amounts: a foe beaten is the XP printed on its stat line (DC x 50 for a mook, x 200 for a champion, x 1,000 for a legend); a treasure its printed XP, roughly its worth in gold; a finished quest 500 to 2,000.
Going from level N to N+1 costs (N+1) x 1,000 XP, and the count then starts again. Each new level gives a new feat, earned in play: offer one that comes from what happened ("Dragon-Scarred"), and manage_feats add it. The player may also sharpen an existing feat's wording (manage_feats rename); the new feat is still gained. Every third level also gives +1 maximum heart, which award_xp applies at once. When award_xp reports a level, do these things in that scene. More: FR — Levels.

## 9. Which note to read
FR — Character creation in session zero. FR — Foes. FR — Levels. The Crossroads and each realm (Aurelane, Larkenfell, Gloamreach) for people, places, troubles and foes. Tables: FR — Names, FR — Foes by realm, FR — Treasure, FR — On the road: read the note, then roll it with formula_roll instead of inventing a name or a find.`,
};
