/**
 * Frozen copies of the pre-E2 Fantastic Realms core and creation note (tests
 * only): the text stories made before the expansion hold.
 */
import type { BuiltinNote } from "@/app/misc/systems/types";

export const PRE_E2_CORE: BuiltinNote = {
  id: "builtin:fantastic-realms:core",
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
- A hero's turn: they say what they do and feat_roll against the foe's DC. A foe loses hearts by the result: weak hit 1 (and the hero pays a cost), hit 1, strong hit 2, plus 1 for each magnitude. A DC 1 action counts as a hit: 1 heart. Pass the foe's name as target, and record the loss on its Hearts meter (manage_meter: create it with the foe's hearts when the fight starts, then adjust by the loss).
- A foe's turn: foes never roll. Narrate its threat (a charge, a spell, an ambush) aimed at one or more heroes. Each targeted hero who has not yet acted rolls to answer it: feat_roll against the foe's DC, with the feats that help. A miss takes the harm (section 4). A weak hit takes it partly or pays another cost. A hit or better avoids it. A strong hit can also turn it back on the foe. Heroes who beat the foe's number act before its threat lands.
- At 0 hearts a foe is beaten, or flees or yields if its nature allows. After the first round, go back to ordinary turn-taking and move the spotlight.

## 7. Rests
One kind of rest, and the realm sets the condition. Aurelane: a few hours. Larkenfell: a night by a fire with a full meal. Gloamreach: weeks somewhere safe. When the fiction allows it, call take_rest with realm (and heroes, if not everyone present). It heals every heart and un-burns every feat for each hero who takes part, and it returns the realm's condition as a reminder. Whether the fiction allows the rest is your call. Hearts do not come back any other way. When a session ends, call end_session.

## 8. XP and levels
Call award_xp with amount and source (a short name: "Goblin ambush", "Barrow silver"). Every hero present gets the full amount, no splitting. A source a hero already had is refused, so a foe or a treasure is never counted twice. Amounts: a foe beaten is the XP printed on its stat line (DC x 50 for a mook, x 200 for a champion, x 1,000 for a legend); a treasure its printed XP, roughly its worth in gold; a finished quest 500 to 2,000.
Going from level N to N+1 costs (N+1) x 1,000 XP, and the count then starts again. Each new level gives a new feat, earned in play: offer one that comes from what happened ("Dragon-Scarred"), and manage_feats add it. The player may also sharpen an existing feat's wording (manage_feats rename); the new feat is still gained. Every third level also gives +1 maximum heart, which award_xp applies at once. When award_xp reports a level, do these things in that scene. More: FR — Levels.

## 9. Which note to read
FR — Character creation in session zero. FR — Foes. FR — Levels. The Crossroads and each realm (Aurelane, Larkenfell, Gloamreach) for people, places, troubles and foes. Tables: FR — Names, FR — Foes by realm, FR — Treasure, FR — On the road: read the note, then roll it with formula_roll instead of inventing a name or a find.`,
};

export const PRE_E2_CREATION: BuiltinNote = {
  id: "builtin:fantastic-realms:character-creation",
  title: "FR — Character creation",
  type: "mechanics",
  tags: ["Fantastic Realms"],
  content: `# FR — Character creation

Read this in session zero. A hero is quick to make: a concept, four feats and a reason to be here. Keep it light and fun. Offer two to four suggestions at every step, drawn from the player's own words and the realm they start in, and always leave room for their own idea.

## What a hero starts with
- A one-line concept ("a retired caravan guard with a bad knee and a good shield").
- Four feats. At least one is about who they are, and at least one is about something they carry. A feat may be a single word or a short phrase.
- 3 hearts, level 1, 0 XP.
- A little gear that fits the concept. Gear is just words on the sheet; it is not counted or weighed.

## Good feats
- Single words that do a lot: Brave, Quick, Sneaky, Sword, Bow, Armor, Healer, Clever, Strong, Lucky.
- Short phrases that tell a story: "I hate goblins!", "Knows every road", "Quick Shot", "Friend of the river folk".
- Mix kinds: one who they are (Brave), one they carry (Old Sword), one they can do (Quick Shot), and one free choice.
- A feat helps when it fits what the hero is doing. If a feat would fit almost every roll, ask for a narrower wording. If it would almost never fit, ask for a wider one. Magic is a feat like any other: "Mind Control", "Fire Spark", "Whispers to Beasts".

## The steps
Step by step setup asks each player these, then the shared steps. Quick setup asks only for the world and the tone, and fills the rest from a short chat.
1. **Concept.** One line: who they are and what they do.
2. **Feats.** The four feats, with suggestions drawn from the concept and the realm.
3. **Realm tie.** Why the hero is in the starting realm: an errand, a debt, a flight, a promise, a curiosity. It should point at the first scene.
4. **Name and look.** A name, and two things people notice.
5. **History.** Where they come from, in three short questions: who raised them, what did they leave behind, what are they proud of.
6. **Drives.** What they want from this adventure, and one thing they will not do.

## When the feats are known
Call manage_meter create_set "Fantastic Realms hero" with owner = the hero's name, then manage_feats add once for each of the four feats, however the hero was made. Write the sheet (a character_sheet note, titled "Character: <name>" in a group) with the concept, the four feats, hearts 3, level 1, XP 0 and the gear. A pre-made hero still needs the meter set and the four feats added before the first roll. Tell the player once how a roll works: one die, plus one for each feat that fits, and a result of 2 or more successes is a clean win.

## A hero who joins later
Make them the same way, in a short chat, in the scene they arrive in. They start at level 1 even in a story that is far along; the table can agree to start them with a feat or two earned along the way.`,
};

/**
 * The Fantastic Realms core as the first release shipped it (commit bcc2c735,
 * PRs #252 to #255): stories started then hold this text.
 */
export const FIRST_RELEASE_CORE: BuiltinNote = {
  ...PRE_E2_CORE,
  content: "# FR — Core rules\n\nFantastic Realms is light fantasy where words are power. A hero is a one-line concept and four feats: words or short phrases such as Brave, Sword, Quick Shot or \"I hate goblins!\". Fiction first. The engine rolls and counts; you narrate. Every number below is final. Keep it warm, vivid and fair.\n\n## 1. Running it\n- Ask for a roll only when failing would be interesting and something is at stake. Otherwise narrate it as a hit. An easy task (DC 1) is never rolled.\n- Only players roll. Everyone else, from a goblin to a dragon, is a stat line (section 5). NEVER use start_combat, combatant tools, npc_roll or action_roll in this game.\n- A miss is never \"nothing happens\". Say the cost before the roll when you can. Never fudge.\n- Call increment_scene at every scene change.\n- Setup, for EVERY hero however they were made (full or quick setup, a pre-made hero, a player who joins later), the moment their feats are known: manage_meter create_set \"Fantastic Realms hero\" with owner = the hero's name, then manage_feats add once for each of the four feats. Look at Meters & tracks and the feats line first, and never set a hero up twice.\n\n## 2. The roll: feat_roll\nCall feat_roll with hero, feats (the feats they lean on), dc, burn (optional), reason. The pool is one base d6 plus one d6 for each feat. The player names the feats they lean on and you accept or refuse each. A feat counts when it plausibly helps with what the hero is doing right now. Read feats generously but honestly: a phrase covers what it says, a clever use is welcome, a stretch gets one question (\"how does that help?\"), and a feat that plainly does not fit is refused. Each feat counts once per roll. A burned feat adds nothing.\n- DC, from the situation: 1 Easy, no roll. 2 Average, it can go wrong. 3 Hard. 4 Very hard. 5 Heroic. 6 Almost impossible. A feat_roll takes 2 to 6.\n- Each die that equals or beats the DC is a success. Successes give the result: 0 miss, 1 weak hit, 2 hit, 3 strong hit. Beyond three, each extra success is one magnitude more: four is strong +1, five is strong +2.\n- Miss: it fails and it costs. Weak hit: it works, with a cost or only partly. Hit: it works. Strong hit: it works well, with something extra. A magnitude is yours to narrate: more damage, more foes affected, further, faster, a lasting edge.\n- The engine reports the dice, the successes and the result. Never roll these dice with formula_roll.\n\n## 3. Burning a feat\nA grand display of one feat. Pass its name as burn (it must also be in feats, unburned, one per roll). The burned feat counts as one sure success, and its die is still rolled, so it may add another. Then it adds nothing to any roll until the next rest. Burning is recorded only when the roll completes. A refusal from the engine is an error, not a miss: fix the call and roll again.\n\n## 4. Hearts, harm and down\nEach hero has meters: Hearts (3 to start), Level and XP.\n- A miss costs 1 heart, or 2 when the danger has a harm word that applies (Deadly, Fire-Breath, Venomous). Harm words never stack: a miss costs at most 2.\n- A weak hit costs 1 heart only if you choose harm as its cost. Otherwise the cost is something else: a position lost, gear damaged, a foe unhurt, time spent.\n- Spend hearts with manage_meter adjust Hearts by a negative number.\n- At 0 hearts the hero is down: out of the scene. Pick a cost: captured, scarred (write it on the sheet), a feat lost (manage_feats remove), gear gone. Death comes only when the realm's tone and the stated stakes say so, and you say so before the roll.\n\n## 5. Foes are stat lines\n**Name** — DC n · Words, Words · Hearts n · XP n. The DC is the number a hero rolls against to act on that foe, and its permanent words are already counted in it (an Armored knight is printed at DC 4, not DC 3 and +1). Words say what it does, what its miss costs, and its initiative edge. You may move a DC by 1 for the moment (cornered, blinded, on high ground), keeping it within 2 to 6. Hearts: 1 for a mook, 3 for a champion, 5 or more for a legend. Read FR — Foes to write your own, and the realm notes for ready ones. A foe is never rolled for: it is only a number.\n\n## 6. Fights\n- Initiative, once, when the fight starts: initiative_roll with each hero and their edge_feats (feats that help them get the edge). A hero's number is 1d6 plus 1 per edge feat. A foe's number is its DC plus 1 per edge word (Fast, Ambusher), with no roll. Highest goes first; ties go to the heroes.\n- A hero's turn: they say what they do and feat_roll against the foe's DC. A foe loses hearts by the result: weak hit 1 (and the hero pays a cost), hit 1, strong hit 2, plus 1 for each magnitude. A DC 1 action counts as a hit: 1 heart.\n- A foe's turn: foes never roll. Narrate its threat (a charge, a spell, an ambush) aimed at one or more heroes. Each targeted hero who has not yet acted rolls to answer it: feat_roll against the foe's DC, with the feats that help. A miss takes the harm (section 4). A weak hit takes it partly or pays another cost. A hit or better avoids it. A strong hit can also turn it back on the foe. Heroes who beat the foe's number act before its threat lands.\n- At 0 hearts a foe is beaten, or flees or yields if its nature allows. After the first round, go back to ordinary turn-taking and move the spotlight.\n\n## 7. Rests\nOne kind of rest, and the realm sets the condition. Aurelane: a few hours. Larkenfell: a night by a fire with a full meal. Gloamreach: weeks somewhere safe. When the fiction allows it, call take_rest with realm (and heroes, if not everyone present). It heals every heart and un-burns every feat for each hero who takes part, and it returns the realm's condition as a reminder. Whether the fiction allows the rest is your call. Hearts do not come back any other way. When a session ends, call end_session.\n\n## 8. XP and levels\nCall award_xp with amount and source (a short name: \"Goblin ambush\", \"Barrow silver\"). Every hero present gets the full amount, no splitting. A source a hero already had is refused, so a foe or a treasure is never counted twice. Amounts: a foe beaten is the XP printed on its stat line (DC x 50 for a mook, x 200 for a champion, x 1,000 for a legend); a treasure its printed XP, roughly its worth in gold; a finished quest 500 to 2,000.\nGoing from level N to N+1 costs (N+1) x 1,000 XP, and the count then starts again. Each new level gives a new feat, earned in play: offer one that comes from what happened (\"Dragon-Scarred\"), and manage_feats add it. The player may also sharpen an existing feat's wording (manage_feats rename); the new feat is still gained. Every third level also gives +1 maximum heart, which award_xp applies at once. When award_xp reports a level, do these things in that scene. More: FR — Levels.\n\n## 9. Which note to read\nFR — Character creation in session zero. FR — Foes. FR — Levels. The Crossroads and each realm (Aurelane, Larkenfell, Gloamreach) for people, places, troubles and foes. Tables: FR — Names, FR — Foes by realm, FR — Treasure, FR — On the road: read the note, then roll it with formula_roll instead of inventing a name or a find.",
};
