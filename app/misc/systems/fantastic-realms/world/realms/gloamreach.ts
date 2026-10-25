/**
 * Gloamreach, the grim realm (docs/fr-expansion-design.md sections 2, 5-7,
 * slice E3): the realm note and its tables note, in the shape of Aurelane's.
 * Original text (decision 3).
 */
import type { BuiltinNote } from "../../../types";
import { CROSSROADS_SCOPE } from "../crossroads";

export const GLOAMREACH_NOTE: BuiltinNote = {
  id: "builtin:fantastic-realms:realm-gloamreach",
  title: "FR — Gloamreach",
  type: "lore",
  tags: ["Fantastic Realms", "realm"],
  scope: CROSSROADS_SCOPE,
  keys: ["Gloamreach", "Hollowgate", "Ashen Road", "Morwen", "Saltgrave", "Black Orchard", "Lamplighter", "Penitent"],
  content: `# FR — Gloamreach

**Realm id:** gloamreach. **Rest:** weeks, somewhere safe. A locked room, a friend at the door and a long stretch with no pressing need to move. Nothing less restores a hero. Its tables are in FR — Gloamreach tables (miscasts, treasure, the road).

## Look and tone
A grim realm. Ash on the wind, fog in the valleys, and the sun a pale coin that rarely shows. Plague came three generations ago and never entirely left. Towns lock their gates at dusk. People are tired, frightened and stubborn, and small kindnesses count for a great deal. Run it as dark, costly and quiet. Fights hurt and take time to recover from, so heroes pick them. Death is possible when the stakes are said before the roll. Magic is expensive and whispered; those who use it pay.

## People
- **Lady Morwen Crake**, the Bone-Warden of Hollowgate. Stern, fair and exhausted; she keeps the plague-rolls and decides who is let in.
- **Sexton Ulric Mourne**, who buries the dead of three parishes and knows which graves have been dug up.
- **Sister Venna Ashgrave**, a penitent who walks the Ashen Road tending the sick. Strong in faith, short on sleep.
- **Corvin Dray**, a smuggler of medicine and secrets. Smiles too much and charges too little.
- **Old Neeve**, a ferrywoman on the Saltgrave Marsh. Knows every path and every lie told about them.
- **Ysolt, the Pale Magistrate**, who tries the cases the living cannot afford to hear. Sits in a court that is slightly too cold.
- **Garrow Thorne**, a mercenary captain whose company has not been paid in a year and is beginning to think of other ways.
- **Little Piet Cinders**, an orphan guide who sells directions to travellers and tells the truth when it matters.

## Places
- **Hollowgate**, a walled town of black stone and lamplight, where the gates shut at dusk and the bells ring for the dead.
- **The Ashen Road**, a long pilgrim route through burned country, with shrines every mile and watchers in every shrine.
- **The Drowned Abbey**, a half-sunk monastery whose bells still ring when the tide is low.
- **Saltgrave Marsh**, grey water, rushes and the bones of ships.
- **The Black Orchard**, an orchard whose fruit is always ripe and which nobody dares to eat.

## Troubles
- **The plague-rolls are wrong.** Names of the living have been written among the dead, and someone is collecting the difference.
- **The Pale Magistrate is hearing a case** against a hero, for a crime they have not yet done.
- **The Drowned Abbey's bell is ringing** out of season, and the dead of the marsh are walking to it.
- **The Black Orchard has a new grave** in it, with a name that is only half-carved.

## Magic here
Rare, whispered and costly. Few cast, and everyone remembers what it cost them; a caster is feared, needed and rarely thanked. The dead listen, and the fog remembers. Spells work, but they take something to do it: breath, warmth, a name. Pick or roll the d12 in FR — Gloamreach tables; its miscasts lean to marks and hollowness, and the one you choose is the whole cost of the miss.

## Local callings
Two more than the twelve in FR — Callings, in the same shape: the signature plus three of the kit is the start, and the path is for levels.

**Lamplighter.** Keeps the lamps lit against the fog and what walks in it. Signature: *Lamp-Bearer*. Kit: Hooded Lamp; Oil-Flask; Long Pole; Knows the Safe Streets; Steady Nerve. Path: Never Let It Gutter; Reads the Fog; Lamp-Lore; Beacon-Keeper; Signal Fire; Night Walker; Dowse and Hide; Saint of the Last Lamp. Move *Light the Lamp*: for the scene everyone in its light clears *Afraid* or *Lost*, and fog-things do not close on them.

**Penitent.** Bears pain for others and calls it a vow. Signature: *Scourged Faith*. Kit: Hair Shirt; Prayer-Beads; Bare Feet; Bandages; Stubborn. Path: Bear the Weight; Fast and Pray; Sinner's Insight; Confessor's Ear; Mend the Wounded; Holy Scorn; Pilgrim's Road; Blessed Wound. Move *Offered Pain*: take a condition of your choice, once; an ally's miss this scene becomes a weak hit.

## Foes
**Ashen Cultist** — DC 2 · Fanatic, Pack · Hearts 1 · XP 100
*Tactics:* prays aloud and rushes in numbers; a miss is a heart and a stolen relic.
**Plague Rat Swarm** — DC 3 · Pack, Venomous, Fast · Hearts 1 · XP 150
*Tactics:* floods the room and bites the ankle; a miss is *Poisoned* (an antidote or a healer).
**Carrion Ghoul** — DC 3 · Hungry, Venomous · Hearts 1 · XP 150
*Tactics:* drags the nearest wounded away from the light; a miss costs 2.
**Grave-Robber Crew** — DC 3 · Pack, Ambusher · Hearts 1 · XP 150
*Tactics:* lamps out, then knives; a miss costs the purse or a heart.
**Gibbet Crow Flock** — DC 3 · Swarm, Flying, Cruel · Hearts 1 · XP 150
*Tactics:* picks at eyes and torches; a miss is *Dazed* or a doused light.
**Bone-Warden Soldier** — DC 4 · Armored, Cruel, Pack · Hearts 3 · XP 800
*Tactics:* forms a line and enforces a curfew; a miss is a heart and a name taken.
**Drowned Priest** — DC 4 · Cunning, Cursed Touch, Cold · Hearts 3 · XP 800
*Tactics:* offers a baptism; a miss costs 2 and is *Cursed*.
**Hollow-Eyed Inquisitor** — DC 4 · Cunning, Cruel, Frightening · Hearts 3 · XP 800
*Tactics:* asks a quiet question whose answer hurts; a miss is *Afraid*.
**Fog Stalker** — DC 4 · Ambusher, Venomous, Slippery · Hearts 3 · XP 800
*Tactics:* takes the last in the line from the dark; a miss costs 2 and is *Lost*.
**Pale Magistrate** — DC 5 · Cunning, Cursed Touch, Armored · Hearts 3 · XP 1000
*Tactics:* reads a charge and waits; a miss is a sentence: *Cursed*.
**Hollow Bishop** — DC 5 · Cunning, Frightening, Cursed Touch · Hearts 5 · XP 5000
*Tactics:* preaches to the doubting heart; a miss costs 2, and a lit lamp makes his voice fail.
**The Weeping Colossus** — DC 6 · Crushing, Armored, Tireless · Hearts 6 · XP 6000
*Tactics:* walks and does not stop; a miss costs 2, and only its weeping face can be reasoned with.`,
};

export const GLOAMREACH_TABLES_NOTE: BuiltinNote = {
  id: "builtin:fantastic-realms:realm-gloamreach-tables",
  title: "FR — Gloamreach tables",
  type: "table",
  tags: ["Fantastic Realms", "table", "realm"],
  scope: CROSSROADS_SCOPE,
  keys: ["Gloamreach miscast", "Gloamreach treasure", "Gloamreach road"],
  content: `# FR — Gloamreach tables

## Gloamreach miscasts (1d12)

1. Backfire. The spell takes the caster's breath: one heart.
2. Backfire. Cold floods the caster: *Frozen* until warmed.
3. Goes wide. It reaches the dead beneath the floor, not the living before you.
4. Goes wide. It works, and every candle in the room gutters out.
5. Draws attention. The nearest shrine's watcher sees, and says nothing yet.
6. Draws attention. Something in the fog turns its head to the caster.
7. Draws attention. A bell rings somewhere, once, and nobody rang it.
8. Leaves a mark. *Hollow-Eyed* until the next rest: the caster's eyes see too much and show less.
9. Leaves a mark. *Ash-Lipped*: every word tastes of cinders, until a rest.
10. Costs the spell. The spell is spent, and a little of the caster with it; burn the spell feat.
11. Costs the spell. Out until a rest, and the caster forgets a small name.
12. The dead take notice. It works, and one of the dead now knows the caster's name and will call.

## Gloamreach treasure (1d20)

1. A tin of pilgrim-medals, mostly saints. XP 100.
2. A pouch of coin stamped with a plague-year. XP 100.
3. A rosary of black wood. XP 150.
4. A sexton's key to a gate nobody mentions. XP 150.
5. A plague-doctor's gloves, waxed and surprisingly clean. XP 150.
6. A cask of grave-ale, brewed in a crypt. XP 200.
7. A leather-bound parish ledger with some names crossed out in red. XP 200.
8. A bell-rope from the Drowned Abbey, still damp. XP 250.
9. A pair of candles that burn blue. XP 250.
10. A smuggler's flask of medicine that works. XP 300.
11. A bone-handled knife; item feat *Sexton's Knife (Keen)*. XP 400.
12. A black umbrella that sheds ash and fog; item feat *Ashen Umbrella (Warded)*. XP 400.
13. A hooded lamp that burns steady in any wind; item feat *Lamplighter's Lamp (Bright)*. XP 500.
14. A chain-mail shirt, mended many times; item feat *Warden's Mail (Sturdy)*. XP 500.
15. A pilgrim's staff with a hidden blade; item feat *Staff of Mercy (Swift)*. XP 600.
16. A bell that rings once near the dead; item feat *Mourner's Bell*. XP 600.
17. A saint's finger-bone in a silver case. XP 800.
18. A chest of gold from a drowned strongroom. XP 1000.
19. A wonder: the *Pale Magistrate's Seal*, an item feat with Warded and Cursed. XP 1500.
20. A wonder: the Black Orchard's last fruit, a one-use marvel that lifts a hero who is down back to 1 heart, and carries a debt. XP 2000.

## On the road in Gloamreach (1d20)

1. A shrine with a candle freshly lit and nobody near.
2. A cart of covered bodies, and a driver who will not speak of them.
3. A crossroads gibbet with a note pinned to its occupant.
4. A fire in the fog, and a stranger offering soup.
5. A dog following the party, who will not enter a certain village.
6. A burned farmstead with something living in the cellar.
7. A pilgrim who needs help to reach the next shrine before dark.
8. A toll-collector who takes memories, not coin.
9. A ruined bridge and a ferry-woman who says the river is hungry today.
10. A lantern left on the road, still warm.
11. A plague-gate shut for the night, and a guard who wants a bribe or a prayer.
12. A well that answers questions, badly.
13. A chorus of children singing in a locked house.
14. A band of flagellants moving slowly in the fog, and a gap in their line.
15. A signpost with the names of villages that no longer exist.
16. A priest burying a stranger and asking for a fourth to carry.
17. A mercenary camp, quiet, with a wounded man who knows a route.
18. A cart abandoned with a full load of medicine and nobody near.
19. An apple tree growing from a grave, the fruit already ripe.
20. A peal of bells from the marsh, and the road beginning to slope toward it.

Use when a spell goes wrong in Gloamreach, a find is due, or the road needs a face. Pick when one fits; roll when it does not, with formula_roll.`,
};
