/**
 * Fantastic Realms: the core rules note, the one the GM carries every round
 * (design section 6, decisions 201-218; the operational section of the
 * expansion, docs/fr-expansion-plan.md E2, decisions 243-256). Original text
 * (decision 3). Keep it under 3,000 tokens: it is a pinned dm_instructions
 * note. A change here needs the old text's hash in BUILTIN_NOTE_HISTORY
 * (builtinNotes.ts), so older stories can be updated.
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
Call feat_roll with hero, feats (the feats they lean on), dc, reason, and where they apply burn, target, hindered_by, help, team_burn. The pool is one base d6 plus one d6 for each feat, plus one for a helper, minus one for each condition in the way (never under one die). The player names the feats and you accept or refuse each. A feat counts when it plausibly helps with what the hero is doing right now. Read feats generously but honestly: a phrase covers what it says, a clever use is welcome, a stretch gets one question ("how does that help?"), and a feat that plainly does not fit is refused. Each feat counts once per roll. A burned, broken or lost feat adds nothing.
- DC, from the situation: 1 Easy, no roll. 2 Average, it can go wrong. 3 Hard. 4 Very hard. 5 Heroic. 6 Almost impossible. A feat_roll takes 2 to 6.
- Each die that equals or beats the DC is a success. Successes give the result: 0 miss, 1 weak hit, 2 hit, 3 strong hit. Beyond three, each extra success is one magnitude more: four is strong +1, five is strong +2.
- Miss: it fails and it costs. Weak hit: it works, with a cost or only partly. Hit: it works. Strong hit: it works well, with something extra (a magnitude is more damage, more foes, further, faster, a lasting edge).
- The engine reports the dice and the result. Never roll these dice with formula_roll. A refusal from the engine is an error, not a miss: fix the call and roll again.

## 3. Burns, help and team burns
- **Burn.** A grand display of one feat. Pass its name as burn (also in feats, unburned, one per roll). It is one sure success, and its die is still rolled. Then it adds nothing until the next rest. manage_feats burn spends a feat with no roll (a miscast that costs a spell).
- **Helping.** help { hero, feat }: another hero, not down, whose feat fits adds one die. One helper per roll. The helper's feat is not burned.
- **Team burn.** team_burn { hero, feat, own_feat }: two sure successes and no dice from the two burned feats. The partner is not the roller. Twice per party rest. It takes the place of the roller's own burn.
- Burns and helpers are recorded only when the roll completes.

## 4. Hearts, harm and down
Each hero has meters: Hearts (3 to start), Level and XP.
- **One harm budget per roll.** A miss costs one heart or one condition, or two when the danger has a harm word (Deadly, Fire-Breath, Venomous). Never more than two. Everyone in the roll shares it: a cursed item's price, an item lost or broken, a helper's share and a miscast all spend it. A weak hit costs at most one of it, and only if you choose harm.
- Hearts: manage_meter adjust Hearts by a negative number.
- **Conditions.** A word on a hero (Wounded, Afraid, Poisoned): manage_feats add_condition, with a cure only if a rest will not do. It costs one die in a roll it gets in the way of: put its word in hindered_by. See FR — Conditions.
- **Down.** A hero is down at 0 hearts or at three conditions that are not scars, and cannot roll, help or burn. A rest, a healing spell or a cleared condition lifts them. Pick a cost, or let the player take a scar (manage_feats add_scar, only when down): captured, a feat lost (manage_feats remove), gear gone. Death comes only when the tone and the stated stakes say so, and you say so before the roll.
- **Healing.** Hearts return only at a rest. A healing spell clears a condition, or lifts a hero who is down to 1 heart. A scar clears only at a level: manage_feats scar_to_feat.
- **Magic.** A spell is a feat of kind "spell". A magic miss is a miscast, and the miscast is the roll's whole consequence. Read FR — Magic before the first spell.
- **Items.** A good item is a feat of kind "item" with up to two qualities. A cost on a miss may be to break it or lose it: manage_feats break, lose, recover, mend. Read FR — Gear.
- **Counted uses** (Warded, Bright, a calling's move, a hearth improvement away from home): manage_feats use, with per scene, rest or adventure.
- manage_feats also has rename (sharpen a wording), retire and rejoin (a hero who died or left), add_party_feat and remove_party_feat (the hearth), clear_condition.

## 5. Foes are stat lines
**Name** — DC n · Words, Words · Hearts n · XP n. The DC is the number a hero rolls against to act on that foe, and its permanent words are already counted in it (an Armored knight is printed at DC 4, not DC 3 and +1). Words say what it does, what its miss costs, and its initiative edge. You may move a DC by 1 for the moment (cornered, blinded, on high ground), keeping it within 2 to 6. Hearts: 1 for a mook, 3 for a champion, 5 or more for a legend. Read FR — Foes to write your own and FR — Bestiary for the twenty words. A foe is never rolled for: it is only a number.

## 6. Fights
- Initiative, once, when the fight starts: initiative_roll with each hero and their edge_feats. A hero's number is 1d6 plus 1 per edge feat (a Swift item counts). A foe's number is its DC plus 1 per edge word (Fast, Ambusher), with no roll. Highest goes first; ties go to the heroes.
- A hero's turn: they say what they do and feat_roll against the foe's DC, with the foe's name as target. A foe loses hearts by the result: weak hit 1 (and the hero pays a cost), hit 1, strong hit 2, plus 1 per magnitude, plus 1 for a Keen item on a strong hit. The result states the damage. If a hit cannot hurt the foe (a strange word's key is missing), leave target out. Record it on the foe's Hearts meter (manage_meter: create it with the foe's hearts when the fight starts, then adjust by the loss).
- A foe's turn: foes never roll. Narrate its threat aimed at one or more heroes. Each targeted hero who has not yet acted rolls to answer it: feat_roll against the foe's DC. A miss takes the harm (section 4). A weak hit takes it partly or pays another cost. A hit or better avoids it. A strong hit can turn it back on the foe.
- At 0 hearts a foe is beaten, or flees or yields. A legend changes by phase (FR — Bestiary).

## 7. Rests
The realm sets the condition. Aurelane: a few hours. Larkenfell: a night by a fire with a full meal. Gloamreach: weeks somewhere safe. When the fiction allows it, call take_rest with realm (and heroes, if not everyone present). It heals every heart and un-burns every feat for each hero who takes part, clears conditions that name no cure (never a scar, never Hungry), and returns the realm's condition. A rest with every hero is a party rest and renews the team burns. Hearts come back no other way. When a session ends, call end_session.

## 8. XP and levels
Call award_xp with amount and source (a short name: "Goblin ambush", "Barrow silver"). Every hero present gets the full amount, no splitting. A source a hero already had is refused. Amounts: a foe beaten is the XP printed on its stat line (DC x 50 for a mook, x 200 for a champion, x 1,000 for a legend); a treasure its printed XP; a finished quest 500 to 2,000. Going from level N to N+1 costs (N+1) x 1,000 XP. Each new level gives a new feat from what happened ("Dragon-Scarred"): manage_feats add it. Every third level gives +1 maximum heart, which award_xp applies. More: FR — Levels.

## 9. Which note to read
FR — Character creation in session zero. FR — Foes, FR — Bestiary, FR — Legends, FR — Levels. FR — Magic, FR — Gear, FR — Conditions. FR — Callings (offer them at the feats step). FR — Travel (a journey is a tally challenge; Supplies), FR — Downtime, FR — Group play. The Crossroads and each realm for people, places and foes. Tables: FR — Names, Foes by realm, Treasure, On the road: read the note, then roll it with formula_roll instead of inventing a find.`,
};
