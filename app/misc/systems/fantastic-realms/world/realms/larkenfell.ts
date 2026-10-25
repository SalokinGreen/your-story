/**
 * Larkenfell, the folk frontier (docs/fr-expansion-design.md sections 2, 5-7,
 * slice E3): the realm note and its tables note, in the shape of Aurelane's.
 * Original text (decision 3).
 */
import type { BuiltinNote } from "../../../types";
import { CROSSROADS_SCOPE } from "../crossroads";

export const LARKENFELL_NOTE: BuiltinNote = {
  id: "builtin:fantastic-realms:realm-larkenfell",
  title: "FR — Larkenfell",
  type: "lore",
  tags: ["Fantastic Realms", "realm"],
  scope: CROSSROADS_SCOPE,
  keys: ["Larkenfell", "Wolfwillow", "Sallow", "Thornwick", "Hushwood", "Greyhill", "barrow", "Reeve", "Barrow-Warden"],
  content: `# FR — Larkenfell

**Realm id:** larkenfell. **Rest:** a night by a fire with a full meal. Shelter, warmth, a hot supper and a night's sleep; a cold camp or an empty stomach is not enough. Its tables are in FR — Larkenfell tables (miscasts, treasure, the road).

## Look and tone
A folk frontier. Fields and orchards pushed up against old woods, a slow brown river, villages built round a green, and a lot of low hills with older things asleep inside them. People know their neighbours, argue about hedges and show up with casseroles when it counts. Run it as homely, brave and funny, with a real chill in the woods after dark. Kings are far away; the village moot decides, and a person's word still means something. Magic is quiet and neighbourly: a wise woman, a charm on the door, a bargain with the hedge-folk.

## People
- **Orrin Fash**, ferry-keeper at Wolfwillow Crossing. Lean, watchful, a counter of heads. Keeps the visitors' book and misses nothing.
- **Hettie Marlow**, baker and cider-maker, who runs the Lantern Week fair and bullies the whole valley into enjoying it.
- **Wynn Alderby**, the miller at Oakhallow, who built a new dam this spring and is touchy about it.
- **Dunstan Pike**, a hunter and trapper with a lame dog and a long memory of the Hushwood.
- **Maeve Oakhallow**, village wise woman. Kind, blunt and fond of tea. Speaks to the hedge-folk and tells nobody.
- **Tobin Sparrowgate**, a boy of twelve, the village runner. Knows every shortcut and sees too much.
- **Granny Eskel**, the oldest villager and the best storyteller. Half of what she says is true, and she knows which half.
- **Captain Rue Thistledown**, warden of the marches, who has six rangers to guard a hundred miles of woods and a sense of humour about it.

## Places
- **Wolfwillow Crossing**, a village at the long wooden bridge over the Sallow, with a ferry-house, a green, a mill upstream and a willow older than the village.
- **The Sallow River**, slow and brown, rich with eels and with stories.
- **Oakhallow Mill**, a mill and a pond, and the new dam that changed the water.
- **The Barrow on Greyhill**, a green mound with a standing stone, long quiet, and the reason the village keeps lanterns.
- **Thornwick Market**, the biggest town in the valley, with a mayor and a small jail.
- **The Hushwood**, an old forest where sounds are muffled and the hedge-folk keep their own calendar.

## Troubles
- **The goblins are early.** The Redthistle clan usually raids in winter; this year they are in the orchards before the harvest is in.
- **The barrow is restless.** The mill's new dam has changed the water, and something under Greyhill is stirring.
- **A stranger at the ferry** pays in old coins nobody has seen for two hundred years.
- **The hedge-folk have sent a bill.** Not money: a favour, and they are very polite about it.

## Magic here
Quiet, folk and bargained. A charm over the door, a knot in a thread, a word said over bread, a bowl of milk left at the stile. Nobody calls it magic; it is just what the wise woman does. The hedge-folk are always listening, and they keep accounts: every spell borrows something from them. Pick or roll the d12 in FR — Larkenfell tables; its miscasts lean to the hedge-folk taking their price, and the one you choose is the whole cost of the miss.

## Local callings
Two more than the twelve in FR — Callings, in the same shape: the signature plus three of the kit is the start, and the path is for levels.

**Reeve.** Keeps the village's order, its tallies and its tempers. Signature: *Moot-Backed*. Kit: Staff of Office; Tally-Stick; Knows Everyone's Business; Sturdy Boots; Calm Voice. Path: Settle a Dispute; Hue and Cry; Fair Weights; Boundary-Walker; Harvest-Marshal; Quiet Word; Hold the Bridge; Keeper of the Book. Move *Call the Moot*: a neighbour in the scene steps in and helps one roll as a helper, once.

**Barrow-Warden.** Keeps watch over a mound and whatever sleeps in it. Signature: *Lantern-Keeper*. Kit: Hooded Lantern; Iron Nails; Salt and Rowan; Spade; Old Songs. Path: Walk the Mound; Sees the Cold; Rowan Ward; Knows the Name Beneath; Grave-Quiet; Salt Line; Burial-Rites; Last Watch. Move *Shut the Door*: one undead or barrow-thing in view cannot harm anyone until the warden moves again.

## Foes
**Bramble Imp** — DC 2 · Pack, Sly · Hearts 1 · XP 100
*Tactics:* trips, tangles and steals a boot; a miss is a snag and a laugh.
**Redthistle Goblin** — DC 2 · Pack, Sly · Hearts 1 · XP 100
*Tactics:* swarms the one hero who is alone; a miss is a cut or a lost tool.
**Hedge Bandit** — DC 3 · Ambusher, Pack · Hearts 1 · XP 150
*Tactics:* springs from a ditch, takes a bag and runs; a miss costs the bag or a heart.
**Marsh Wolf** — DC 3 · Fast, Pack, Hungry · Hearts 1 · XP 150
*Tactics:* circles, then goes for whoever limps; a miss costs a heart.
**Thornback Boar** — DC 3 · Crushing, Fast, Hungry · Hearts 1 · XP 150
*Tactics:* charges in a straight line and only turns once; a miss costs 2.
**Briar Hag** — DC 4 · Cunning, Cruel, Venomous · Hearts 3 · XP 800
*Tactics:* offers tea, then a bargain; a miss is *Poisoned* (an antidote or a healer).
**Goblin Warchief** — DC 4 · Pack, Cruel, Armored · Hearts 3 · XP 800
*Tactics:* sends the pack first and takes the prize himself; a miss is a heart.
**Barrow Wight** — DC 4 · Cursed Touch, Frightening, Cold · Hearts 3 · XP 800
*Tactics:* drifts through walls and touches; a miss costs 2 and is *Cursed*.
**Hedge-Folk Tithe-Taker** — DC 4 · Sly, Cunning, Iron-Bane · Hearts 3 · XP 800
*Tactics:* names a debt and takes a memory or a name in payment; cold iron, or a gift, ends it.
**Scarecrow of the Last Furrow** — DC 4 · Frightening, Tireless, Cursed Touch · Hearts 3 · XP 800
*Tactics:* stands in the corn, closer each time you look; a miss costs 2 and is *Afraid*.
**Mire Troll** — DC 5 · Crushing, Regenerating, Hungry · Hearts 5 · XP 5000
*Tactics:* grabs and drags toward the water; fire or salt stops its mending.
**The Barrow King** — DC 6 · Armored, Cursed Touch, Frightening, Tireless · Hearts 6 · XP 6000
*Tactics:* walks straight at the one who woke him and talks of oaths; a miss costs 2, and he stops for the lantern's song.`,
};

export const LARKENFELL_TABLES_NOTE: BuiltinNote = {
  id: "builtin:fantastic-realms:realm-larkenfell-tables",
  title: "FR — Larkenfell tables",
  type: "table",
  tags: ["Fantastic Realms", "table", "realm"],
  scope: CROSSROADS_SCOPE,
  keys: ["Larkenfell miscast", "Larkenfell treasure", "Larkenfell road"],
  content: `# FR — Larkenfell tables

## Larkenfell miscasts (1d12)

1. Backfire. The charm bites back: *Hex-Itch* until a rest, and a good scratch.
2. Backfire. A bargain made in haste: one heart, and the hedge-folk are sorry for it.
3. Goes wide. The luck meant for a friend lands on the nearest goat.
4. Goes wide. It works on the right thing in the wrong season: apples in snow, thaw in a sealed cellar.
5. Draws attention. A hedge-folk messenger turns up with a very polite note.
6. Draws attention. Every dog in the valley starts to bark at the caster.
7. Draws attention. Something in the Hushwood sits up and listens.
8. Leaves a mark. *Thorn-Tongued*: every word the caster says comes out sharp, until a rest.
9. Leaves a mark. *Fey-Marked*: small lights follow the caster, until a rest.
10. Costs the spell. The hedge-folk take it as their due; burn the spell feat.
11. Costs the spell. The spell turns to bread and the caster eats it: out until a rest.
12. The hedge-folk's price. It works, and a favour is owed to them; they will name it later, and sweetly.

## Larkenfell treasure (1d20)

1. A jar of Hettie's plum preserve. XP 100.
2. A knot of red thread, tied by a wise woman. XP 100.
3. A fox-fur collar, still warm. XP 150.
4. A tin whistle with a tune that calms geese. XP 150.
5. A gamekeeper's horn, brass and dented. XP 150.
6. A wheel of hard cheese, well aged. XP 200.
7. A horseshoe nailed over a door, and a rumour of what hangs behind it. XP 200.
8. A basket of hedge-folk bread that never goes stale. XP 250.
9. A mill-stone chip that hums near water. XP 250.
10. A fisher's net, mended with silver wire. XP 300.
11. A reaping-hook with an ash handle; item feat *Harvest Hook (Keen)*. XP 400.
12. A smith's hammer from Thornwick; item feat *Village Hammer (Sturdy)*. XP 400.
13. A hooded lantern from the barrow; item feat *Greyhill Lantern (Bright)*. XP 500.
14. A shepherd's crook carved with wolves; item feat *Wolf-Crook (Swift)*. XP 500.
15. A cloak of Hushwood moss that turns the rain; item feat *Moss Cloak (Warded)*. XP 600.
16. A tinker's bell that never rings for lies; item feat *Truth-Bell*. XP 600.
17. A sack of old coin from before the kings. XP 800.
18. A goblin chieftain's torc, hammered gold. XP 1000.
19. A wonder: the *Barrow King's Ring*, an item feat with Warded and Cursed. XP 1500.
20. A wonder: the hedge-folk's thank-you, *Thistledown Cloak* with Swift and Bright. XP 2000.

## On the road in Larkenfell (1d20)

1. A farmer with a stuck cart, a lame ox and a pie to share.
2. Smoke over the next ridge, from a chimney or from a burning.
3. A peddler with a tray of useful oddments and a nose for gossip.
4. A fork in the lane with one signpost, turned the wrong way.
5. A stile with a hedge-folk offering: a bowl of milk. Taking it is a promise.
6. A hunter's snare with something alive and angry in it.
7. A runaway child, sulking in a barn, who knows a short cut.
8. A haystack that is not a haystack, and snoring.
9. A village fete with a competition the heroes could win.
10. A wagon of goblin spoils, abandoned, and tracks leading off.
11. A ford in flood, and a ferryman who wants a story for the crossing.
12. An orchard heavy with fruit, and a sign that says "take what you need".
13. A beekeeper stung and sitting by her hives, and the swarm is leaving.
14. A scarecrow wearing a stranger's coat.
15. A moot in session on the green, short a juror.
16. A lane lined with lanterns lit for no reason anyone remembers.
17. Wolf tracks that stop at a circle of toadstools.
18. A tinker's wagon, its horse asleep, its owner nowhere.
19. A wedding party lost in the woods, one hour from the wedding.
20. A barrow-mound with a door, open, and a lantern left on the step.

Use when a spell goes wrong in Larkenfell, a find is due, or the road needs a face. Pick when one fits; roll when it does not, with formula_roll.`,
};
