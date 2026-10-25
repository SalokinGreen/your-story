/**
 * Thornmere, the drowned kingdom of fen-cities (docs/fr-expansion-design.md
 * sections 5-7, decision 252, slice E4): the realm note and its tables note,
 * in the shape of the original three. Original text (decision 3).
 */
import type { BuiltinNote } from "../../../types";
import { CROSSROADS_SCOPE } from "../crossroads";

export const THORNMERE_NOTE: BuiltinNote = {
  id: "builtin:fantastic-realms:realm-thornmere",
  title: "FR — Thornmere",
  type: "lore",
  tags: ["Fantastic Realms", "realm"],
  scope: CROSSROADS_SCOPE,
  keys: ["Thornmere", "Sedgewick", "Lake Vael", "Bell-Stair", "Drowned Queen", "Fen-Pilot", "Bell-Diver", "mere", "fen"],
  content: `# FR — Thornmere

**Realm id:** thornmere. **Rest:** a dry night under a roof. Walls, a lid on the damp and a dry blanket; a night in a punt, a bog or a leaking loft does not count. Its tables are in FR — Thornmere tables (miscasts, treasure, the road).

## Look and tone
A kingdom the water took by inches. Its cities stand on piles and causeways above a drowned plain: bell-towers wearing reed, streets of black canal, lamps hung low over the mist so the eels can find the way home. Everything is damp and everything keeps. Run it as eerie, courteous and sorrowful, with old grudges settled in whispers across a rowing-boat. The monsters are real, but the worse danger is a polite house with a long memory. Magic is tide-work: bells, brine and names said over water.

## People
- **Warden Sedgewick Mourne**, Harbour-Reeve of the city of Sedgewick. Bone-thin, always dripping, with a dry wit and a ledger of every drowning.
- **Ysmay Corrow**, the Bell-Mistress, who tunes the great bells that keep the water calm. Deaf in one ear, and says the bells talk back.
- **Piet Alder**, a punt-pilot and rumour-seller who will take any fare for a story.
- **Lady Marguerite Vael**, last of the old royal line, who holds court in a half-sunk palace and pretends it is not sinking.
- **Old Nan Cattail**, a peat-cutter and healer who knows what the bog gives back.
- **Brother Lant**, a lamp-monk who lights the eel-lamps and counts them nightly.
- **The Ferryman Without a Name**, who never speaks and is never late.

## Places
- **Sedgewick**, the fen-city of ten thousand piles, built round a cracked bell-tower.
- **Lake Vael**, wide and flat as pewter, over the drowned royal city.
- **The Bell-Stair**, a spiral of green stone that goes down into the lake. Divers say it rings.
- **The Causeway of Sighs**, a mile of boards that moans in the wind and has a toll-house at each end.
- **Peat Hollows**, cut bog where the dead keep their shapes and the rushes grow in rows.
- **The Heron Court**, the guildhall of the great fen-houses, where a deal is a duel.

## Troubles
- **The bells are going out of tune,** and the water is rising a hand a night.
- **The Drowned Queen has sent a summons,** sealed in wax that is still wet.
- **A house is buying debts** and has begun calling them all in the same week.
- **Lights on the mere** that are not eel-lamps, moving in a line toward the city.

## Magic here
Tide-work. Spells need water within reach or a bell struck, and they work in the dark and the damp best: a ward of brine, a word said into a lamp, a name rung from the deep. Dry magic is hard and loud. Everyone in Thornmere knows what a rung bell sounds like when it is wrong. Pick or roll the d12 in FR — Thornmere tables; its miscasts lean to the water answering back, and the one you choose is the whole cost of the miss.

## Local callings
Two more than the twelve in FR — Callings, in the same shape: the signature plus three of the kit is the start, and the path is for levels.

**Fen-Pilot.** Poles the canals, reads the mist and knows every mud-bank by name. Signature: *Reads the Water*. Kit: Punt-Pole; Lantern on a Hook; Rope and Gaff; Oilskin Cloak; Knows the Safe Channel. Path: Slip the Current; Fog-Navigator; Heron-Eyed; Weight on the Pole; Smuggler's Eddy; Night Passage; Quiet Oar; Drowned-Road Memory. Move *Shortcut*: the party reaches the next place by a hidden channel, with no check against the road or the weather, once.

**Bell-Diver.** Goes down the Bell-Stair for what the lake keeps. Signature: *Long Breath*. Kit: Diving-Bell; Brass Helmet; Hand-Bell; Knife and Lamp; Tide-Tables. Path: Hold the Breath; Sound the Depth; Sees in Silt; Ring the Warning; Salvage-Eye; Anchor-Hand; Quiet in the Dark; Lungs of the Lake. Move *Ring Down*: one foe of the water or the dead in view loses its footing and cannot threaten until someone speaks.

## Foes
**Reed Cutpurse** — DC 3 · Fast, Sly · Hearts 1 · XP 150
*Tactics:* slips a hand into a bag from a passing boat; a miss is a lost purse and a splash.
**Leech Swarm** — DC 3 · Swarm, Hungry · Hearts 1 · XP 150
*Tactics:* pours over the legs of anyone wading; a miss is a heart and *Weak* from blood loss.
**Mudcrawler Boggart** — DC 2 · Sly, Pack · Hearts 1 · XP 100
*Tactics:* ties ankles and steals lamp-oil; a miss is a fall into the water.
**Lamp-Eel** — DC 3 · Slippery, Venomous · Hearts 1 · XP 150
*Tactics:* glows like a lamp to lure a boat to the shallows; a miss costs 2 and *Poisoned*.
**Stilt-Raider** — DC 3 · Pack, Ambusher · Hearts 1 · XP 150
*Tactics:* strides out of the mist on poles and cuts a mooring; a miss sets the boat adrift.
**Bell-Drowned Revenant** — DC 4 · Undying, Cursed Touch, Frightening · Hearts 3 · XP 800
*Tactics:* walks out of the water toward the sound of a bell; a miss costs 2 and is *Cursed*, and it stands again until its bell is broken.
**Peat Witch** — DC 4 · Cunning, Cruel, Venomous · Hearts 3 · XP 800
*Tactics:* trades a cure for a promise; a miss is *Poisoned* and a debt.
**Tide-Court Assassin** — DC 5 · Ambusher, Deadly, Sly · Hearts 3 · XP 1000
*Tactics:* strikes from a passing gondola and is gone; a miss costs 2 and the next strike comes sooner.
**Mirror-Water Double** — DC 4 · Shapeshifter, Sly, Cunning · Hearts 3 · XP 800
*Tactics:* wears the face of the nearest friend; it cannot be fought until the reflection gives it away.
**Mere-Gar** — DC 4 · Crushing, Slippery, Hungry · Hearts 3 · XP 800
*Tactics:* surges up under a boat and drags a hero by the leg; a miss costs 2.
**The Great Mere-Serpent** — DC 5 · Crushing, Slippery, Hungry · Hearts 5 · XP 5000
*Tactics:* coils round a causeway or a boat and squeezes; a miss costs 2, and a struck bell drives it off for a round.
**Maurelle, the Drowned Queen** — DC 6 · Cursed Touch, Frightening, Cunning, Tireless · Hearts 6 · XP 6000
*Tactics:* speaks to the heroes first, kindly, and offers a seat at her table; a miss costs 2, and the water rises with her anger.`,
};

export const THORNMERE_TABLES_NOTE: BuiltinNote = {
  id: "builtin:fantastic-realms:realm-thornmere-tables",
  title: "FR — Thornmere tables",
  type: "table",
  tags: ["Fantastic Realms", "table", "realm"],
  scope: CROSSROADS_SCOPE,
  keys: ["Thornmere miscast", "Thornmere treasure", "Thornmere road"],
  content: `# FR — Thornmere tables

## Thornmere miscasts (1d12)

1. Backfire. The water turns on the caster: *Waterlogged* until a rest, and a cough.
2. Backfire. A rung bell cracks and the sound goes through the caster: one heart.
3. Goes wide. The spell lands on the nearest boat, which promptly sinks politely.
4. Goes wide. It works on the reflection and not the thing: the wrong twin answers.
5. Draws attention. Every bell in the district rings once, and a window opens somewhere.
6. Draws attention. Something in the water surfaces to look.
7. Draws attention. A house's lamp-bearer takes note of the caster's name.
8. Leaves a mark. *Brine-Lipped*: every word tastes of salt, until a rest.
9. Leaves a mark. *Bell-Struck*: a faint ringing in the head that only the dead can hear, until a rest.
10. Costs the spell. The tide takes it back; burn the spell feat.
11. Costs the spell. It slips down into the lake and is out until a rest.
12. The water's price. It works, and a name goes into the lake's ledger; someone below will answer to it.

## Thornmere treasure (1d20)

1. A pouch of salted eel-jerky. XP 100.
2. A tin of lamp-oil, sealed with wax. XP 100.
3. A coil of tarred rope, well kept. XP 150.
4. A clay whistle that sounds like a heron. XP 150.
5. A brass bell small enough to pocket. XP 150.
6. A cask of peat-whisky, aged in the cellar of a drowned inn. XP 200.
7. A map of canals that no longer exist. XP 200.
8. A fisher's net of silver thread. XP 250.
9. A pearl the size of a thumbnail, smelling of the lake. XP 250.
10. A fen-house signet ring, still wanted somewhere. XP 300.
11. A gaff-hook of black iron; item feat *Heron Gaff (Keen)*. XP 400.
12. A punt-pole carved with eels; item feat *Eel-Pole (Swift)*. XP 400.
13. A hooded eel-lamp that cannot be put out; item feat *Mere-Lamp (Bright)*. XP 500.
14. A cloak of oiled sealskin; item feat *Sealskin Cloak (Warded)*. XP 500.
15. A diver's helmet from the Bell-Stair; item feat *Brass Helmet (Sturdy)*. XP 600.
16. A hand-bell that rings once at a lie; item feat *Truth-Bell (Bright)*. XP 600.
17. A chest of old royal coin, green with age. XP 800.
18. A drowned noble's crown, dripping. XP 1000.
19. A wonder: the *Queen's Tide-Pearl*, an item feat with Warded and Cursed. XP 1500.
20. A wonder: the *Bell of the Calm*, an item feat with Bright and Warded; rung once, it lifts a hero who is down back to 1 heart. XP 2000.

## On the road in Thornmere (1d20)

1. A punt adrift with a lantern lit and nobody aboard.
2. A boat-toll collected by a child with a very large ledger.
3. Fog so thick the lanterns hum.
4. A half-sunk shrine with a candle burning under the water.
5. A peat-cutter who found something in the cut and wants help to lift it.
6. A procession of lamp-monks on the causeway, singing without mouths.
7. A bell ringing in the wrong key, and nobody to ring it.
8. A merchant's barge stuck on a mud-bank, with a cargo of live eels.
9. A fisher-girl who sells lucky charms and means it.
10. A wedding on a flat boat with no groom.
11. Lights on the water, moving in a line.
12. A heron the size of a man, standing on one leg, watching.
13. A drowned road under clear water, with a lantern at every mile.
14. A gondolier who offers a fare for a rumour.
15. An inn on stilts with one dry room left.
16. A bog-body in a cutting, wearing a crown of rushes.
17. A school of fish all swimming against the current.
18. A ferryman who will take you only if you give a name.
19. A rowing-boat of masked nobles, off to a duel at dawn.
20. A door in the water-line, open, with a lamp lit on the other side.

Use when a spell goes wrong in Thornmere, a find is due, or the road needs a face. Pick when one fits; roll when it does not, with formula_roll.`,
};
