/**
 * The Hollow Sky, the realm of cloud-islands (docs/fr-expansion-design.md
 * sections 5-7, decision 252, slice E4): the realm note and its tables note,
 * in the shape of the original three. Realm id "hollow-sky". Original text
 * (decision 3).
 */
import type { BuiltinNote } from "../../../types";
import { CROSSROADS_SCOPE } from "../crossroads";

export const HOLLOW_SKY_NOTE: BuiltinNote = {
  id: "builtin:fantastic-realms:realm-hollow-sky",
  title: "FR — The Hollow Sky",
  type: "lore",
  tags: ["Fantastic Realms", "realm"],
  scope: CROSSROADS_SCOPE,
  keys: ["Hollow Sky", "sky-wheel", "Skyreach", "Tether Row", "Ouranth", "Stormwhale", "cloud-island", "Sky-Rigger", "Cloud-Reader"],
  content: `# FR — The Hollow Sky

**Realm id:** hollow-sky (pass "hollow-sky" to take_rest). **Rest:** one turn of the sky-wheel, about six hours. Moor on a firm island, eat, and sleep while the wheel turns once; a rest on a drifting raft or in the open gale does not count. Its tables are in FR — The Hollow Sky tables (miscasts, treasure, the road).

## Look and tone
There is no ground here, or none anyone has seen. The world is a tumble of cloud-islands joined by rope-bridges and wind-skiffs, hung under a vast slow ring of light called the sky-wheel that turns once every six hours and decides day, night and the weather. Roofs are sails, streets are gangplanks, and everyone checks their knots. Run it as airy, daring and a little dizzy, with generous strangers and sudden storms. The danger is the fall, the weather and the things that live in the high cloud. Magic is wind and word: sky-singing, weather-binding, knots tied in the air.

## People
- **Captain Odalie Skye**, master of the wind-skiff *Kestrel's Folly*. Weathered, loud and slightly drunk on altitude.
- **Fennick Bramblewick**, a sky-rigger and knot-teacher who has never once dropped anything.
- **The Warden of Tether Row**, a tall, grey figure who keeps the old mooring-chains and says nothing about who put them there.
- **Lyra Cloudwise**, a cloud-reader who sells weather forecasts and is right about two in three.
- **Old Hob Updraft**, a retired kite-rider with one eye and a thousand stories, all true except the endings.
- **Mistress Thessaly Gale**, harbour-master of Skyreach, who counts every landing and every wreck.
- **A child called Wren**, who lives in a crow's nest, knows every sail by sound and never comes down.

## Places
- **Skyreach**, the market-island at the wheel's hub, thick with rigging, banners and bargains.
- **Tether Row**, a line of floating isles joined by iron chains, the oldest road in the sky.
- **The Rainbow Steps**, a stair of slow rain that leads upward if you believe it.
- **The Quiet Deep**, a vast hollow in the cloud where nothing moves and sound dies.
- **Sailmaker's Reach**, an island entirely covered in drying canvas.
- **The Eye**, the stillness at the sky-wheel's centre, where the storm is said to sleep.

## Troubles
- **The sky-wheel has slowed** by a quarter-turn, and days and nights are drifting.
- **Islands are going missing,** cut loose in the night, with all their sleepers.
- **A storm-wall is rolling in** from the Eye, and the old chains are straining.
- **A skiff-race** is about to start, and someone has bet the Warden's chain on it.

## Magic here
Wind-magic. A spell is sung, tied, flown or whistled: a knot that holds the weather, a note that bends a gust, a feather that remembers the way home. It works best with wind in hand and a high place under foot, and badly in the Quiet Deep. Everyone knows a quick whistle against ill luck. Pick or roll the d12 in FR — The Hollow Sky tables; its miscasts lean to gusts, falls and the sky answering back, and the one you choose is the whole cost of the miss.

## Local callings
Two more than the twelve in FR — Callings, in the same shape: the signature plus three of the kit is the start, and the path is for levels.

**Sky-Rigger.** Keeps the knots, sails and lines that hold the sky together. Signature: *Never Drops a Line*. Kit: Marlinspike; Good Rope; Climbing Harness; Sailmaker's Needle; Knows the Weather. Path: Quick Splice; Bind the Mast; Hold on Tight; Cut Cleanly; Heavy Weather; Run the Rigging; Safety Net; Master Knotsman. Move *Catch*: one ally or item falling in the scene is caught, once.

**Cloud-Reader.** Reads the sky for storms, passages and omens. Signature: *Weather-Eye*. Kit: Brass Barometer; Feather Charm; Horn of Warning; Wind-Vane; Old Charts. Path: Hear the Storm Coming; Find the Updraft; Call the Gale; Calm the Air; Hidden Passage; Rain-Prayer; Sense the Eye; Sky-Sworn. Move *Warning*: name the next danger; the party cannot be surprised by it, once.

## Foes
**Cloud Gull Flock** — DC 3 · Swarm, Flying · Hearts 1 · XP 150
*Tactics:* wheels over a deck and pecks at eyes and food; a miss is lost supplies.
**Kite-Thief** — DC 3 · Flying, Sly · Hearts 1 · XP 150
*Tactics:* swoops, grabs a pouch and glides away; a miss is a lost item.
**Wind Imp** — DC 2 · Fast, Sly · Hearts 1 · XP 100
*Tactics:* knocks hats, rattles rigging and unties knots; a miss is a loosened line.
**Tether-Cutter** — DC 3 · Ambusher, Pack · Hearts 1 · XP 150
*Tactics:* slips aboard and hacks a mooring in the dark; a miss sets the island or skiff adrift.
**Rime Sprite** — DC 3 · Flying, Cruel · Hearts 1 · XP 150
*Tactics:* freezes a rope or a hand; a miss costs a heart and the grip.
**Sky Corsair Captain** — DC 4 · Cunning, Cruel, Armored · Hearts 3 · XP 800
*Tactics:* boards from the high side with a crew and demands the cargo; a miss costs a heart and an item.
**Thunder Elemental** — DC 4 · Crushing, Flying, Frightening · Hearts 3 · XP 800
*Tactics:* wraps a skiff in a storm-cell; a miss costs 2, and a lowered sail starves it.
**Gale Harpy** — DC 4 · Flying, Frightening, Cunning · Hearts 3 · XP 800
*Tactics:* sings from a cloud-bank to lure a pilot off course; a miss is *Afraid* or a heading changed.
**Hollow Siren** — DC 4 · Shapeshifter, Cursed Touch, Cunning · Hearts 3 · XP 800
*Tactics:* wears the face of a lost friend on a far mooring; a miss costs 2 and is *Cursed*.
**Skyhook Brute** — DC 4 · Crushing, Armored, Pack · Hearts 3 · XP 800
*Tactics:* swings across on a line and throws a hero overboard; a miss costs 2 and a drop.
**Cloud Roc** — DC 5 · Flying, Crushing, Fast · Hearts 5 · XP 5000
*Tactics:* dives for the largest prize and carries it off; a miss costs 2, and a flare of light turns it away.
**Ouranth, the Stormwhale** — DC 6 · Flying, Crushing, Frightening, Tireless · Hearts 6 · XP 6000
*Tactics:* surfaces from the cloud and swallows an island whole; a miss costs 2, and the Eye's still air drives it back.`,
};

export const HOLLOW_SKY_TABLES_NOTE: BuiltinNote = {
  id: "builtin:fantastic-realms:realm-hollow-sky-tables",
  title: "FR — The Hollow Sky tables",
  type: "table",
  tags: ["Fantastic Realms", "table", "realm"],
  scope: CROSSROADS_SCOPE,
  keys: ["Hollow Sky miscast", "Hollow Sky treasure", "Hollow Sky road"],
  content: `# FR — The Hollow Sky tables

## Hollow Sky miscasts (1d12)

1. Backfire. The wind turns on the caster: *Windblown* until a rest, and a hat gone for good.
2. Backfire. A gust slams the caster against a rail: one heart.
3. Goes wide. The breeze lifts the nearest sail, or the nearest pig.
4. Goes wide. It works on the wrong direction: the skiff turns about.
5. Draws attention. Every wind-vane in sight swings to point at the caster.
6. Draws attention. A storm-cell on the horizon changes course.
7. Draws attention. Something in the high cloud turns its head.
8. Leaves a mark. *Static-Haired*: sparks crawl through the hair, until a rest.
9. Leaves a mark. *Feather-Light*: the caster floats an inch off the deck, until a rest.
10. Costs the spell. The wind takes it away; burn the spell feat.
11. Costs the spell. The spell unravels like a knot pulled loose and is out until a rest.
12. The sky's price. It works, and a debt of air is owed to the wind; it will be collected at the worst moment.

## Hollow Sky treasure (1d20)

1. A coil of well-oiled rope. XP 100.
2. A pocket compass whose needle spins. XP 100.
3. A handful of cloud-silk thread. XP 150.
4. A brass whistle for calling birds. XP 150.
5. A sailor's tin cup that never spills. XP 150.
6. A jar of cloud-honey. XP 200.
7. A chart of the Tether Row, with notes. XP 200.
8. A kite of painted silk, signed by its maker. XP 250.
9. A feather that floats upward when let go. XP 250.
10. A spyglass that sees a mile farther than it should. XP 300.
11. A climbing-hook of sky-iron; item feat *Skyhook (Keen)*. XP 400.
12. A rigger's harness of tarred leather; item feat *Rigger's Harness (Sturdy)*. XP 400.
13. A hooded lantern that burns in the Quiet Deep; item feat *Deep Lamp (Bright)*. XP 500.
14. A cloak woven from storm-gull down; item feat *Gale Cloak (Warded)*. XP 500.
15. A pair of boots with wind in the heels; item feat *Updraft Boots (Swift)*. XP 600.
16. A cutlass of bright steel; item feat *Skywind Cutlass (Keen)*. XP 600.
17. A sealed chest of coins from a sunken sky-city. XP 800.
18. A captain's brass sextant, studded with jewels. XP 1000.
19. A wonder: the *Gale-Crown*, an item feat with Swift and Warded. XP 1500.
20. A wonder: the *Wheel's Own Feather*, an item feat with Bright and Warded; spun once over a hero who is down, it lifts them back to 1 heart. XP 2000.

## On the road in the Hollow Sky (1d20)

1. A skiff adrift with its sail furled and nobody at the tiller.
2. A rope-bridge with a toll-keeper, a sign and a very small dog.
3. A rain-cloud that follows the party, politely.
4. A storm-wall on the horizon, moving fast.
5. A trader's balloon shaped like a fish, with a cargo of live birds.
6. A floating shrine with a gong and a keeper who wants it rung.
7. A rainbow that holds weight, for exactly as long as the wheel allows.
8. A lost kite-child, tethered to nothing, asking for the way down.
9. A chain bridge missing three links.
10. A cloud-island with one tree, one cottage and one very friendly goat.
11. A skiff race that the party is invited, or ordered, to join.
12. A fog-bank full of bells, none of them on a boat.
13. A signal flag in a code no one knows.
14. A mooring where every rope is cut, and a lantern lit.
15. A tall figure on a cloud who counts the passers-by.
16. An updraft strong enough to lift a skiff a mile, free of charge.
17. A message in a bottle, tied to a gull.
18. A wreck, freshly fallen, still smoking.
19. A cloud-reader selling a forecast for a favour.
20. A door in the sky, open, with a gangplank down.

Use when a spell goes wrong in the Hollow Sky, a find is due, or the road needs a face. Pick when one fits; roll when it does not, with formula_roll.`,
};
