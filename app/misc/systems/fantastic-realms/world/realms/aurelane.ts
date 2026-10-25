/**
 * Aurelane, the bright realm (docs/fr-expansion-design.md sections 2, 5-7,
 * slice E3). Two notes: the realm (look, people, places, troubles, magic,
 * local callings, a twelve-foe roster with tactics) and its tables (a d12
 * miscast table, a d20 treasure table and a d20 road table). Foes are stat
 * lines "**Name** — DC n · Words · Hearts n · XP n" with a tactics line under
 * each. Original text (decision 3).
 */
import type { BuiltinNote } from "../../../types";
import { CROSSROADS_SCOPE } from "../crossroads";

export const AURELANE_NOTE: BuiltinNote = {
  id: "builtin:fantastic-realms:realm-aurelane",
  title: "FR — Aurelane",
  type: "lore",
  tags: ["Fantastic Realms", "realm"],
  scope: CROSSROADS_SCOPE,
  keys: ["Aurelane", "Valemont", "Sunstair", "Emberwing", "Isaura", "Cassian", "Herald", "Dragon-Sworn"],
  content: `# FR — Aurelane

**Realm id:** aurelane. **Rest:** a few hours. Lie down in a safe, comfortable place, eat something, and by the afternoon you are whole. Its tables are in FR — Aurelane tables (miscasts, treasure, the road).

## Look and tone
A bright, heroic realm. White cities climb hillsides in terraces, banners snap from every tower, and the roads are lined with poplars. Everyone dresses to be seen. Honour is a real currency: promises are kept, duels are fair and a dragon will gladly hold a grudge for a century. Run it as swashbuckling and hopeful, with grand gestures and big laughs. Danger is real but it is the kind that heroes are for. Death is rare and tragic, and the GM says so before the roll.

## People
- **Queen Isaura Valemont**, who sits the Glass Throne. Wise, tired and fond of riddles. Keeps a secret garden of weeds nobody is allowed to pull.
- **Sir Cassian Brightwater**, Lord Marshal of the Sunstair. Loud, loyal and unbeatable in a joust. Terrible at reading letters.
- **Maestra Lucenne Ardath**, court wizard. Dry, precise and never without a sweet in her pocket. Her spells are public performances.
- **Brother Tolliver Ash**, a sun-priest who wanders the roads with a lantern that never needs oil. Heals whoever asks, and asks nothing back.
- **Perrin Quickly, "the Gallant Fox"**, a duellist and charming rogue who steals only from the rude.
- **Tobiah Gleam**, the herald, whose voice carries a mile. He loves a good announcement and has one for every occasion.
- **Dame Odalys Fenn**, a retired knight who keeps a tavern on the Gilded Ford. Her stew is famous and her sword is rumoured.

## Places
- **Valemont**, the white city on seven terraces, with a palace of glass that sings in the wind.
- **The Sunstair**, a stair of pale stone climbing the cliff to the Beacon. A hero is named by climbing it.
- **The Gilded Ford**, a crossing of the golden river with a market that never closes.
- **The Tourney Fields**, a meadow of striped tents where every knight in the realm comes in spring.
- **Mount Halcyon**, home of the Storm-Hawks and, higher still, the dragon Emberwing.
- **The Mirror Lake**, perfectly still, said to show what a person will become.

## Troubles
- **The Hollow Knight** rides the roads at dusk and challenges every champion; nobody has seen his face.
- **Emberwing demands her tithe.** The dragon wants a song she has not heard, and a kingdom is nervous.
- **The Mirror Duchess** is swapping nobles for lookalikes who agree with her.
- **The Beacon has dimmed.** Something at the top of the Sunstair is eating the light, and the Marshal wants brave volunteers.

## Magic here
Bright, courtly and sanctioned. Spells are cast in the open with a flourish: a word aloud, a raised hand, a bow to the crowd. Maestra Ardath's College of the Lamp licenses casters, and an unlicensed one is looked at sideways, not hunted. A spell is a performance, so a miss is seen. Pick or roll the d12 in FR — Aurelane tables; its miscasts lean to attention and glory gone wrong, and the one you choose is the whole cost of the miss.

## Local callings
Two more than the twelve in FR — Callings, in the same shape: the signature plus three of the kit is the start, and the path is for levels.

**Herald.** Carries the realm's voice, on the road and before the throne. Signature: *Voice That Carries*. Kit: Tabard of Office; Banner; Brass Trumpet; Knows the Protocol; Fast Horse. Path: Proclamation; Reads a Crowd; Truce-Bearer; Names Every Noble; Sealed Letters; Right of Passage; Eyewitness; Tireless Rider. Move *Under Truce*: speak first, and a foe that honours law or custom will talk for one scene before it strikes.

**Dragon-Sworn.** Bound by oath or debt to a dragon, and marked by it. Signature: *Ember-Marked*. Kit: Scale Shield; Lance; Fireproof Cloak; Dragon-Tongue; Horn of Summons. Path: Ash-Walker; Wing-Shadow; Hoard-Sense; Scorched Oath; Draconic Pride; Smoke Signal; Kin of Wyrms; Brave as Embers. Move *Cinder Ward*: one ally in the scene takes no cost from fire or from a dragon's dread, once.

## Foes
**Tourney Brute** — DC 2 · Strong, Boasting · Hearts 1 · XP 100
*Tactics:* shoves and shouts; a miss means a bruise and a crowd laughing.
**Gilded Highwayman** — DC 3 · Quick, Charming · Hearts 1 · XP 150
*Tactics:* bows, then lightens a purse; a miss costs the purse or a heart.
**Sun-Cult Zealot** — DC 3 · Fanatic, Pack · Hearts 1 · XP 150
*Tactics:* chants and mobs one hero; a miss pins them in the press.
**Beacon-Moth Swarm** — DC 3 · Swarm, Flying, Hungry · Hearts 1 · XP 150
*Tactics:* drinks lanterns and glow, plunging the scene dark; a miss is *Lost* or a doused light.
**Lacquer Knight** — DC 4 · Armored, Honourable, Mounted · Hearts 3 · XP 800
*Tactics:* names a hero and charges at them alone; a miss is a heart.
**Mirror Duchess** — DC 4 · Sly, Illusions, Cruel · Hearts 3 · XP 800
*Tactics:* wears a friend's face and asks for something small; a miss is a trust betrayed.
**Storm-Hawk Rider** — DC 4 · Flying, Fast, Deadly · Hearts 3 · XP 800
*Tactics:* dives from the sun and climbs away; a miss costs 2.
**Glass Sentinel** — DC 4 · Armored, Crushing, Watchful · Hearts 3 · XP 800
*Tactics:* never moves first, never misses what crosses its line; a miss costs 2.
**Court Poisoner** — DC 4 · Sly, Venomous, Charming · Hearts 3 · XP 800
*Tactics:* toasts a hero, then spikes the cup; a miss is *Poisoned* (an antidote or a healer).
**Halcyon Wyvern** — DC 5 · Flying, Venomous, Fast · Hearts 5 · XP 5000
*Tactics:* strafes the whole party, then circles for the straggler; a miss costs 2.
**The Hollow Knight** — DC 5 · Armored, Deadly, Tireless · Hearts 5 · XP 5000
*Tactics:* walks forward and never speaks; a miss costs 2, and he cannot be outlasted.
**Emberwing, the Gold Dragon** — DC 6 · Flying, Fire-Breath, Armored, Proud · Hearts 6 · XP 6000
*Tactics:* insults first, flame second; a miss against her breath costs 2, and a good song makes her pause.`,
};

export const AURELANE_TABLES_NOTE: BuiltinNote = {
  id: "builtin:fantastic-realms:realm-aurelane-tables",
  title: "FR — Aurelane tables",
  type: "table",
  tags: ["Fantastic Realms", "table", "realm"],
  scope: CROSSROADS_SCOPE,
  keys: ["Aurelane miscast", "Aurelane treasure", "Aurelane road"],
  content: `# FR — Aurelane tables

## Aurelane miscasts (1d12)

1. Backfire. The spell's own light dazzles the caster: *Dazzled* until the scene ends.
2. Backfire. A flourish goes badly: one heart, and a ripple of polite laughter.
3. Goes wide. The effect lands on the nearest banner, statue or noble instead.
4. Goes wide. It works on the right target in the loudest, most embarrassing way.
5. Draws attention. A College licensor, in white, appears and asks to see the licence.
6. Draws attention. Every head in the hall turns; someone important is now interested.
7. Draws attention. A rival caster takes it as a challenge and bows.
8. Leaves a mark. *Gilt-Eyed*: the caster's eyes shine gold until the next rest.
9. Leaves a mark. *Tongue-Tied*: a spell of words will not leave the caster's mouth, until a rest.
10. Costs the spell. It fizzles out with a few sparks; burn the spell feat.
11. Costs the spell. The spell is out until a rest, and the caster is flushed with shame.
12. Glory gone wrong. It works, loudly, and the tale of it is told and grows: the caster owes a favour to the one who tells it.

## Aurelane treasure (1d20)

1. A gilt-edged invitation to the next tourney ball. XP 100.
2. A sun-priest's blessing sewn into a ribbon. XP 150.
3. A banner of a vanished house, in good thread. XP 150.
4. A duellist's glove, soft as cream. XP 150.
5. A silver spur from a famous mount. XP 200.
6. A pot of Gilded Ford honey-wine, sealed. XP 200.
7. A signet ring that opens one noble door. XP 250.
8. A herald's tabard that makes a crowd listen. XP 250.
9. A sheaf of love-poems, signed by a queen. XP 300.
10. A cloak the colour of a Valemont sunrise. XP 300.
11. A bow carved with poplar-leaves; item feat *Poplar Bow (Swift)*. XP 400.
12. A rapier with a mirror-bright blade; item feat *Starlit Rapier (Keen)*. XP 500.
13. A silver trumpet whose note carries a mile; item feat *Herald's Trumpet*. XP 400.
14. A lance of white ash that never splinters; item feat *Sunstair Lance (Sturdy)*. XP 500.
15. A lantern lit from the Beacon; item feat *Beacon Lantern (Bright)*. XP 600.
16. A ring that turns aside one ill word a scene; item feat *Warded Ring (Warded)*. XP 600.
17. A dragon's tooth, polished into a charm. XP 800.
18. A crown-jewel left to the finder in a will. XP 1000.
19. A wonder: the *Glass Throne's Shard*, an item feat with Bright and Warded. XP 1500.
20. A wonder: Emberwing's scale, the item feat *Gold Scale Shield* with Sturdy and Warded. XP 2000.

## On the road in Aurelane (1d20)

1. A herald on a white mule announcing a tourney, out of breath.
2. A troupe of acrobats whose cart has lost a wheel.
3. A shrine to the Sun with a pilgrim who wants a companion on the stair.
4. A toll-gate with a cheerful keeper who accepts only riddles.
5. A passing knight challenges the heroes to a friendly bout.
6. A banner left on the road, with a message sewn into the hem.
7. A dragon's shadow crossing the fields, and every farmer waving.
8. A wedding procession blocking the lane, and a place laid at the table.
9. A fountain whose water answers questions in rhyme.
10. An inn giving away its whole cellar to celebrate something.
11. A young squire in borrowed armour, lost on the way to a knighting.
12. A court of poplars where a mirror-lake has spilled across the road.
13. A duellist's challenge nailed to a milestone, naming one of the heroes.
14. A caravan of gilded wagons, and a merchant who wants an escort.
15. A bridge held by a Lacquer Knight who demands a toll in courtesy.
16. A bonfire festival in a field, with room for three more dancers.
17. A messenger collapsed in a ditch with a sealed letter for the Queen.
18. A hillside of sun-priests singing, and a child who cannot stop smiling.
19. A Storm-Hawk circling low, which has dropped a ribboned scroll.
20. A procession of banners going the wrong way: toward the Beacon.

Use when a spell goes wrong in Aurelane, a find is due, or the road needs a face. Pick when one fits; roll when it does not, with formula_roll.`,
};
