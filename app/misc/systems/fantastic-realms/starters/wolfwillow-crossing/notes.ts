/**
 * Wolfwillow Crossing: the starter's own notes (design section 4): the
 * "Running it" note, the village, and the secret outline the GM turns into a
 * Campaign Plan. Original text (decision 3).
 */
import type { StoryLore } from "../../../../structs";
import { starterNote } from "../../../blood-and-bone/starters/shared";

const RUNNING_IT = `# Wolfwillow Crossing — Running it

A short campaign in Larkenfell, the folk frontier. The heroes arrive at Wolfwillow Crossing on Lantern Eve, in the last gold hour of the day. The tone is homely, brave and funny, with something old waking under the hill. Real danger comes later, and slowly.

**Open on the arrival.** After session zero and the briefing, play the authored opening: the bridge, the paper lanterns, the fiddle, Orrin Fash on the ferry-house steps. Nothing is wrong yet. Give the heroes a supper, a bed and a few people to meet before the first trouble. The first goblin comes on the second day, not the first hour.

**Rest, in Larkenfell:** a night by a fire with a full meal. Pass realm "larkenfell" to take_rest. A cold camp or an empty stomach is not enough. The Cider Barn by the green has beds, and Hettie Marlow will not let a hero go hungry.

**Rhythm.** Three kinds of scene. The village: meetings, suppers, a favour, a quarrel about the mill dam. The road: a patrol, a trail, a stretch of the Hushwood. The danger: a goblin raid, the barrow, the dark. Alternate them. Never two fights in a row without a laugh in between. Give every hero a person in the village to care about.

**Foes.** Read FR — Larkenfell for stat lines. Mooks (Redthistle Goblin, Hedge Bandit, Marsh Wolf) are the bulk of the early fights; a champion (Goblin Warchief, Barrow Wight, Briar Hag) is a session's climax; the king under the hill is the season's legend and needs a plan (below). Only players roll, so a foe is a stat line, and its turn is a threat the heroes answer. Each foe's XP is on its line; award it with award_xp. A finished quest is 500 to 2,000.

**Callings.** The three pre-made heroes follow callings (Maro the Sellsword, Ilsabet the Witch, Jory the Bard), each with its move on the sheet. A move is played with manage_feats use (the move's name as the feat, per rest) and is not a feat. A hero built from scratch may take a calling or a personal move of the same size (FR — Callings); Larkenfell's own are the Reeve and the Barrow-Warden, and either would suit this valley.

**The journey.** One real trip is built in: the trail from the stolen things into the Hushwood (the third beat). Run it as a tally challenge of three rounds, one per day, route DC 3 (rough country): the farms and the ford, the Hushwood proper, the hedge-folk's gate and the way back. On the first day manage_meter create_set "Fantastic Realms party" (owner "world"): Supplies start at 3, exactly the three days, so a miss that costs a second Supply can leave the party Hungry. Hettie packs a basket for anyone who asks (adjust Supplies up by 2 before they leave), and Dunstan Pike's hut is hospitality on the way back. Roll one feat_roll per day for its hardest part and record it; the hero whose feat fits the day leads it (Hedge-Craft among the hedges, Hard Eyes on a trail, Silver Tongue at the hedge-folk's gate). Read FR — Travel.

**The legend.** The king under the hill is a legend (FR — Legends, "The Barrow King"): DC 6 with 6 hearts, then DC 5 at 4 hearts (his guard rise) and DC 4 at 2 hearts (he stops and asks for his oath). The shared notes call him only the Barrow King; here his name is Hollin Greycrown, and finding it is the quest. Play the lair as half the fight: the oath-stones, the throne of roots, the lantern in the wall. The weakness lowers his DC by 1 for a scene or ends a threat: the oath he was killed to keep, spoken aloud, or the lantern's song, which Granny Eskel holds. Put those clues three scenes away.

**Setup.** For each hero, the moment their feats are known: manage_meter create_set "Fantastic Realms hero" (owner = their name), then manage_feats add for each of the four feats. A pre-made hero is no exception. The campaign ships built: an adventure-path record with the seven beats (the third holds the journey, the sixth the legend), the barrow king's front, the goblins' flight, two secrets with clues and four endings (campaign read; set_beat moves the current beat when one is done). Session zero reviews it with the player, and start_game follows the setup card. The secret "Wolfwillow Crossing — The week and after" keeps the XP guide and who knows what.

**The Crossroads.** The wider world is in "FR — The Crossroads". The Waymeet is two days upriver. A hero who walks a Thin Mile into another realm (Aurelane, Gloamreach or one of the three beyond) leaves this story for the next one; keep the road in sight as the last beat, not the first.

**Voice.** Short sentences. Warm and dry. Let neighbours argue about hedges. Let the lanterns matter.`;

const VILLAGE = `# Wolfwillow Crossing — The village

Twelve chimneys, a green, a ferry-house, a cider barn and the longest wooden bridge in the valley, over the slow brown Sallow. A great willow older than the village leans from the far bank. Lantern Week begins at dusk on Lantern Eve and runs seven days: paper lanterns on the bridge rails, a fair on the green, and on the last night every family floats a lantern down the river for the people they have lost. The village has done it for as long as the barrow on Greyhill has been quiet.

## People
- **Orrin Fash**, ferry-keeper. Counts every face over the bridge and keeps the visitors' book. He is careful because he knows something about the barrow, and has told no one.
- **Hettie Marlow**, baker and cider-maker, runs the fair. Warm, loud, and owed a favour by half the valley.
- **Wynn Alderby**, miller at Oakhallow. Built a dam this spring and is touchy about it.
- **Maeve Oakhallow**, wise woman at the cottage by the ford. Reads the signs and drinks too much tea.
- **Tobin Sparrowgate**, twelve, the village runner. Knows every shortcut.
- **Granny Eskel**, oldest in the village, best storyteller.
- **Captain Rue Thistledown**, warden of the marches, with six rangers for a hundred miles of woods.

## Places
- **The bridge**, long and wooden, hung with lanterns.
- **The ferry-house**, where Orrin keeps the visitors' book and a bed for guests.
- **The Cider Barn**, beds and supper, run by Hettie.
- **The green**, where the fair is held.
- **Oakhallow Mill**, a mile upriver, with the new dam.
- **Greyhill**, a green hill above the village, with a barrow and a standing stone.

Use the Larkenfell note for the rest of the valley.`;

const SEASON = `# Wolfwillow Crossing — The week and after

The campaign outline (GM only). A few weeks around Lantern Week in Wolfwillow Crossing. The new dam at Oakhallow Mill has changed the water, and the river no longer fills the moat of the old barrow on Greyhill. The thing in the barrow, Hollin Greycrown, a king who was buried alive by his own people, is waking. The Redthistle goblins, who have always known he was there, are fleeing south from his stirring, which is why they raid early. Orrin Fash knows part of the story: his grandfather swore the village to keep a lantern on the bridge so the king would know the way home and not come looking.

Medium spine. Seven beats, each laid over the week and what follows:

1. **Lantern Eve.** The heroes arrive. A supper, a bed, the visitors' book, a quarrel about the dam. Plant: Orrin's careful look; the lantern on the bridge's middle post that is never lit; Tobin's story of a light on Greyhill. Nothing is wrong yet.
2. **The Fair.** A day of games, contests and gossip. A goblin scout is caught stealing a pie. Hettie wants it kept quiet. Maeve reads a sign. Plant: the Redthistle goblins are afraid, not hungry. A first fight, small: a mook or two.
3. **Stolen Things.** Sheep missing, a cart gone, a farmer's boy lost for a night. Tracks lead to the Hushwood. Captain Thistledown asks for help. The heroes meet the hedge-folk, who have a polite message: leave the hill alone. **The journey:** a three-day tally challenge into the wood and back, route DC 3, Supplies from the "Fantastic Realms party" set (see Running it). A good total finds the boy asleep in a hollow tree and the party home with a day to spare; a bad one brings them back late and Hungry.
4. **The Raid on the Mill.** A real goblin raid at Oakhallow, at night, with the Warchief. The mill is damaged, the dam is cracked, the barrow's moat starts to drain. XP for the fight; a rest by the fire after.
5. **What Orrin Knows.** Orrin tells the story of the king, the lantern and the promise. Granny Eskel tells the other half. The heroes learn what the barrow needs: a light, a name, a burial done right.
6. **Greyhill.** The barrow opens on the night of the last lantern. Barrow Wights, then Hollin Greycrown, the season's legend. He can be fought (FR — Legends: DC 6 with 6 hearts, then DC 5 at 4 hearts and DC 4 at 2 hearts, each phase a threat to several heroes), laid to rest by giving him back his name, his oath and a funeral, or bargained with. Fighting costs more than anyone has; the best endings are clever, and the oath or the lantern's song lowers his DC by 1 for the scene.
7. **The Last Lantern.** The lanterns go down the river, one more than there were. Whatever the heroes chose, the village changes. One last scene at the Cider Barn. An old coin arrives from the Waymeet with a message for a hero: a road, if they want it.

**XP guide.** Each mook is 100 to 150. Each champion is 800 to 1,000. The Warchief and the Wights 800. The legend is 6,000, but laying him to rest by name is a finished quest worth 2,000, and doing both is not forbidden. Treasure: use FR — Treasure. A level up is 2,000 XP for the first; the whole campaign should bring each hero close to level 2.

**Who knows what.** Orrin knows the lantern promise. Maeve guesses a king. Granny Eskel has the name, Hollin, and the old song. Wynn Alderby does not know his dam woke anything and will be crushed when he finds out. The hedge-folk know everything and tell it as a riddle.

**If the heroes go elsewhere.** Let the goblins grow bolder, the water drain, and the lanterns go out one by one. The barrow wakes on the last night either way.`;

export const WOLFWILLOW_NOTES: StoryLore[] = [
  starterNote("Wolfwillow Crossing — Running it", "dm_instructions", RUNNING_IT, {
    characters: ["Orrin Fash", "Hettie Marlow", "Maeve Oakhallow"],
  }),
  starterNote("Wolfwillow Crossing — The village", "lore", VILLAGE, {
    keys: ["Wolfwillow", "village", "Orrin", "Hettie", "Cider Barn", "ferry-house", "Lantern Week"],
  }),
  starterNote("Wolfwillow Crossing — The week and after", "secret", SEASON, {
    secret: true,
    keys: ["campaign", "plan", "beats", "outline", "Greycrown", "barrow"],
    characters: ["Orrin Fash", "Maeve Oakhallow", "Granny Eskel"],
  }),
];
