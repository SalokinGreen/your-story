/**
 * Blood & Bone, AI edition: B&B — Core rules.
 * Original text for the GM, condensed from the author's rulebook
 * (docs/blood-and-bone/rulebook.md). Not copied from any other product
 * (decision 3).
 */
import { BLOOD_AND_BONE_KINDS } from "./kindList";
import type { BuiltinNote } from "../types";

export const CORE_NOTE: BuiltinNote = {
  id: "builtin:blood-and-bone:core",
  title: "B&B — Core rules",
  type: "dm_instructions",
  tags: ["Blood & Bone"],
  content: `# B&B — Core rules

Blood & Bone: modern supernatural horror. The players are monsters holding on to something human, or hunters of them. Fiction first; the engine does the arithmetic, you narrate. Every number below is final.

## 1. Running it
- Roll only when the outcome is truly in doubt and both results are interesting; one roll covers a beat. Otherwise just narrate.
- You never roll against players. Antagonists have a rank, a want and one or two things they can do that players cannot. No sheets. NEVER use start_combat, combatant tools or npc_roll in this game.
- Never fudge. A miss is a door to somewhere new, never "nothing happens". Name the cost before the roll when you can. Ask "what does your Beast want?"
- Call increment_scene at every scene change; every once-a-scene limit counts scenes.
- Setup, at the start of play and for any new character: look at Meters & tracks. If the character has none, manage_meter create_set (owner = their name) with the set "Blood & Bone character", plus "Witch" (the Ledger) or "Wendigo" (the Slipping Mask) for those Kinds, and manage_track create their Vow (kind vow). If there is no Heat, create_set "City" for owner world. In a party, each player gets their own sets.

## 2. The action roll
Call action_roll: stat_name, stat_value (from the sheet), adds (any number of sources; only +2 applies), penalty (1 per Condition that plausibly applies), move (the move's name), owner (whose roll in a party). The engine caps the score at 10, ties go to the dice, and reports strong hit, weak hit or miss and a match (both d10s equal). Never roll these dice with formula_roll.
- Strong hit: they do it and choose what happens next. Weak hit: they do it, but it costs or comes back at them. Miss: pay the price. A matched strong hit is something memorable going right; on a matched miss roll the table twice or apply one result at double severity.
- Pay the price: read the move's miss table (section 12), roll it with formula_roll ["1d6"], and make the result specific to the scene. If nothing fits, Stress +1. Never let a miss cost nothing.
- Moves and stats: Face Danger (best fit), Secure an Advantage (best fit), Gather Information (Wits), Compel (Heart or Shadow), Slip Away (Nerve), Aid Another (best fit), Undertake a Journey (Wits or Nerve), Face Defeat (Heart), Sate the Beast (Shadow covert, Bone by force), Steel the Resolve (Hunters: Heart or Wits), Resist the Hunger (Heart), Resisting the Change (Heart), Clean Up (Shadow or Wits), Repair a Bond (Heart). Outcomes: B&B — Moves.

## 3. Stress (meter Stress, 0-6)
- Each Kind has Stress triggers (its note, repeated on the sheet). A trigger is manage_meter adjust Stress by 1 with once_per "scene" and key = the trigger's name, so each distinct trigger counts once a scene. A spike is +2, the same way. The full moon applies every Werewolf trigger.
- Sate the Beast: strong hit -2, weak hit -1 and a complication, miss pay the price (adjust with a negative by). Archetype Stress Relief: -1, no roll, once a session each (once_per "session", key = the relief), never below 1.
- The engine reports reaching the cap. Stress at its cap is a Time Skip: read B&B — Time Skip and the Turning.

## 4. The Beast (meter Beast, 0-10, only rises)
The engine reports each threshold crossed. Apply it at once and narrate the Kind's change (in the Kind's note) as already true:
- 3 First Crack: the player lowers one stat by 1 (minimum 1); edit the sheet.
- 6 The Slipping: manage_meter set_cap Stress to 5.
- 9 The Last Warning: set_cap Stress to 4 and set_floor Stress to 1.
- 10: the character is gone, no roll. They become an Epic antagonist and the player makes a Successor with an Epic Vow (Time Skip note).

## 5. The night
A session is one night. When dawn comes in the fiction:
1. Call end_session (reason).
2. The Reckoning, per character, before anything else: formula_roll ["<their Stress>d6"] (skip the roll at Stress 0: no 1s), count the 1s yourself, manage_meter adjust Beast by that count. Never skip it, never roll it mid-scene.
3. Wendigo: if no feed this night, Slipping Mask +1 (+2 for the Graverobber); a Predator who killed living prey this night holds it. Check "starving" (Wendigo note).
4. Heat -1 if nobody breached the masquerade and someone worked to suppress attention.
5. Offer each player two downtime actions (B&B — Progress, vows and XP). Clear every "used tonight" on the sheets.

## 6. Fights
Rank sets the fight: Troublesome is one action_roll of the fitting move (strong hit: dealt with; weak hit: dealt with, with a minor cost; miss: pay the price and it becomes a Rule of 3). Dangerous is a Rule of 3 and a Decisive Victory ends them. Formidable and above is a Rule of 3 whose Decisive Victory only manage_track marks their progress track (kind enemy): they withdraw or escalate. Epic cannot be beaten head on.
Rule of 3: ask the objective, then start_challenge with name, description, primary_stat (the lead stat), difficulty (the enemy's rank), mode "tally", rounds 3. Each player turn: they say what they do and the stat; action_roll; record_challenge_result with its outcome. Strong hit +1 Advantage; weak hit 0 and a minor cost (a hit taken, gear lost); miss -1 and pay the price (B&B — Miss tables: skirmish and making). The engine closes it after the third result and reports the tally:
- +1 or more: Decisive Victory, objective met.
- 0: Success at a Cost. The player picks one: Feed the Beast (Stress +2), Collateral Damage, The Mask Slips (Exposure +1), Flesh and Bone (a Dangerous Condition).
- -1 or less: Defeat. They Face Defeat.

## 7. Progress
manage_track for Vows, Conditions (at most three; a fourth is Broken: out of the scene), journeys and Formidable-or-higher enemies. mark when the fiction earns it, never on a miss. Fulfil a Vow, Clear a Condition and arrive on a journey are manage_track progress_roll: the engine counts filled boxes only and compares. Outcomes and downtime: B&B — Progress, vows and XP.

## 8. Exposure and Heat
Exposure (meter, per character, 0-6) +1 for: The Mask Slips; a mortal witnesses something unexplained and lives; physical evidence; a Power used openly before talkers. The engine reports thresholds: 3 Attention (a pursuer gets the scent; -1 Slip Away at home), 4 Pressure (a Haven is watched; a Connection drops a rank), 5 Hunted (no Stress recovery at home until pursuit is dealt with), 6 Burned (leave the city; take Doomed). Clean Up, once a session: strong hit -2, weak hit -1 with a cost, miss +1 and pay the price.
Heat (world meter, 0-6) rises when anyone breaks the masquerade badly: 3 authorities see a pattern; 4 a dedicated unit, and factions enforce the Concord; 5 public awareness; 6 the city is lost.

## 9. Connections, Burdens, XP
Connections are Weak, Steady or Strong (sheet). Strong: +1 or an automatic weak hit once a session. Weak: calling needs a Heart roll and a miss breaks it. Burn a Connection: drop it a rank (a Weak one is removed) for an automatic strong hit, no roll. Burdens: Doomed (a complication from the doom; +1 defying it), Indebted (favours; refusing: Stress +1).
XP is a meter. Each XP trigger on the sheet pays once a session: adjust XP by 1, 3 or 5 with once_per "session" and key = the trigger. A fulfilled Vow pays 1-5 by rank.

## 10. Oracles
Yes or no: fate_question. Otherwise the d20 oracles (section 12), rolled with formula_roll. When you need a name, a face, a place, a rumour, a hunter, a job or a clue, roll the B&B table for it (People, Places, Rumours… section 12) instead of inventing one or calling generate_name.

## 11. Table etiquette
Predation, violence and moral collapse are the game. Run feeding and killing scenes as written, with weight and consequence, not gore for its own sake. Respect the table's lines from session zero.

## 12. Which note to read
Moves: B&B — Moves. A Kind: ${BLOOD_AND_BONE_KINDS.map((k) => `B&B — ${k}`).join(", ")}. Third Archetypes, with two more Kind Powers each: B&B — Vampire: The Courtier, B&B — Gargoyle: The Pilgrim, B&B — Wendigo: The Shepherd, B&B — Werewolf: The Hound, B&B — Witch/Warlock: The Apostate, B&B — Hunter: The Penitent, B&B — Ghost: The Seeker. Assets: B&B — Paths, B&B — Havens, B&B — Companions, B&B — Relics, B&B — Rites, and B&B — More Paths, More Havens, More Companions, More Relics, More Rites. B&B — Progress, vows and XP. B&B — Time Skip and the Turning. Session zero: B&B — Character creation and B&B — Creation prompts: <Kind>. Misses: B&B — Miss tables: generic moves, B&B — Miss tables: beast and recovery, B&B — Miss tables: skirmish and making, B&B — Miss tables: masquerade and recovery. Oracles: B&B — Oracles: complication, B&B — Oracles: scene, B&B — Oracles: what they want. Tables: B&B — People, The night, Places, The Concord and the factions, The Vigil and hunters, The Masquerade, Rumours, Feeding and hunger, Hooks, Objects and relics, Investigation, The Hollow Roads.`,
};
