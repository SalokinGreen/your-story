/**
 * The three realms of Fantastic Realms' world pack: Aurelane (bright and
 * heroic), Larkenfell (a folk frontier) and Gloamreach (grim). Each note holds
 * its look, tone, rest rule, people, places, troubles and a foe roster in the
 * stat-line format "**Name** — DC n · Words · Hearts n · XP n". Original text
 * (decision 3).
 */
import type { BuiltinNote } from "../../types";
import { CROSSROADS_SCOPE } from "./crossroads";

export const REALM_IDS = ["aurelane", "larkenfell", "gloamreach"] as const;

/** Realm id to its rest condition, for take_rest (BuiltinSystem.rests). */
export const FANTASTIC_REALMS_RESTS: Record<string, string> = {
  aurelane: "A few hours.",
  larkenfell: "A night by a fire with a full meal.",
  gloamreach: "Weeks, somewhere safe.",
};

export const AURELANE_NOTE: BuiltinNote = {
  id: "builtin:fantastic-realms:realm-aurelane",
  title: "FR — Aurelane",
  type: "lore",
  tags: ["Fantastic Realms", "realm"],
  scope: CROSSROADS_SCOPE,
  keys: ["Aurelane", "Valemont", "Sunstair", "Emberwing", "Isaura", "Cassian"],
  content: `# FR — Aurelane

**Realm id:** aurelane. **Rest:** a few hours. Lie down in a safe, comfortable place, eat something, and by the afternoon you are whole.

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

## Foes
**Tourney Brute** — DC 2 · Strong, Boasting · Hearts 1 · XP 100
**Gilded Highwayman** — DC 3 · Quick, Charming · Hearts 1 · XP 150
**Sun-Cult Zealot** — DC 3 · Fanatic, Pack · Hearts 1 · XP 150
**Lacquer Knight** — DC 4 · Armored, Honourable, Mounted · Hearts 3 · XP 800
**Mirror Duchess** — DC 4 · Sly, Illusions, Cruel · Hearts 3 · XP 800
**Storm-Hawk Rider** — DC 4 · Flying, Fast, Deadly · Hearts 3 · XP 800
**The Hollow Knight** — DC 5 · Armored, Deadly, Tireless · Hearts 5 · XP 5000
**Emberwing, the Gold Dragon** — DC 6 · Flying, Fire-Breath, Armored, Proud · Hearts 6 · XP 6000`,
};

export const LARKENFELL_NOTE: BuiltinNote = {
  id: "builtin:fantastic-realms:realm-larkenfell",
  title: "FR — Larkenfell",
  type: "lore",
  tags: ["Fantastic Realms", "realm"],
  scope: CROSSROADS_SCOPE,
  keys: ["Larkenfell", "Wolfwillow", "Sallow", "Thornwick", "Hushwood", "Greyhill", "barrow"],
  content: `# FR — Larkenfell

**Realm id:** larkenfell. **Rest:** a night by a fire with a full meal. Shelter, warmth, a hot supper and a night's sleep; a cold camp or an empty stomach is not enough.

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

## Foes
**Redthistle Goblin** — DC 2 · Pack, Sly · Hearts 1 · XP 100
**Hedge Bandit** — DC 3 · Ambusher, Pack · Hearts 1 · XP 150
**Marsh Wolf** — DC 3 · Fast, Pack, Hungry · Hearts 1 · XP 150
**Briar Hag** — DC 4 · Cunning, Cruel, Venomous · Hearts 3 · XP 800
**Goblin Warchief** — DC 4 · Pack, Cruel, Armored · Hearts 3 · XP 800
**Barrow Wight** — DC 4 · Cursed Touch, Frightening, Cold · Hearts 3 · XP 800
**Mire Troll** — DC 5 · Crushing, Regenerating, Hungry · Hearts 5 · XP 5000
**Hollin Greycrown, the Barrow King** — DC 6 · Armored, Cursed Touch, Frightening, Tireless · Hearts 6 · XP 6000`,
};

export const GLOAMREACH_NOTE: BuiltinNote = {
  id: "builtin:fantastic-realms:realm-gloamreach",
  title: "FR — Gloamreach",
  type: "lore",
  tags: ["Fantastic Realms", "realm"],
  scope: CROSSROADS_SCOPE,
  keys: ["Gloamreach", "Hollowgate", "Ashen Road", "Morwen", "Saltgrave", "Black Orchard"],
  content: `# FR — Gloamreach

**Realm id:** gloamreach. **Rest:** weeks, somewhere safe. A locked room, a friend at the door and a long stretch with no pressing need to move. Nothing less restores a hero.

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

## Foes
**Ashen Cultist** — DC 2 · Fanatic, Pack · Hearts 1 · XP 100
**Plague Rat Swarm** — DC 3 · Pack, Venomous, Fast · Hearts 1 · XP 150
**Carrion Ghoul** — DC 3 · Hungry, Venomous · Hearts 1 · XP 150
**Bone-Warden Soldier** — DC 4 · Armored, Cruel, Pack · Hearts 3 · XP 800
**Drowned Priest** — DC 4 · Cunning, Cursed Touch, Cold · Hearts 3 · XP 800
**Hollow-Eyed Inquisitor** — DC 4 · Cunning, Cruel, Frightening · Hearts 3 · XP 800
**Pale Magistrate** — DC 5 · Cunning, Cursed Touch, Armored · Hearts 3 · XP 1000
**The Weeping Colossus** — DC 6 · Crushing, Armored, Tireless · Hearts 6 · XP 6000`,
};

export const REALM_NOTES: BuiltinNote[] = [AURELANE_NOTE, LARKENFELL_NOTE, GLOAMREACH_NOTE];
