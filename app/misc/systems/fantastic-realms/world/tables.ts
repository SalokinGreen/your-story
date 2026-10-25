/**
 * Fantastic Realms' four table notes: names, foes by realm, treasure (each
 * with its XP) and what is on the road. Each sub-table names its die in its
 * heading and the note ends on a "Use when " paragraph, so checkTableShape
 * (tests/helpers/tableShape.ts) accepts them. Original text (decision 3).
 */
import type { BuiltinNote } from "../../types";
import { CROSSROADS_SCOPE } from "./crossroads";

const table = (
  slug: string,
  title: string,
  keys: string[],
  content: string,
): BuiltinNote => ({
  id: `builtin:fantastic-realms:table-${slug}`,
  title,
  type: "table",
  tags: ["Fantastic Realms", "table"],
  scope: CROSSROADS_SCOPE,
  keys,
  content,
});

export const NAMES_TABLE = table(
  "names",
  "FR — Names",
  ["name", "names", "who is that"],
  `# FR — Names

Roll once for a full name in the realm. Mix two rolls for a nickname or a family feud.

## Aurelane names (1d20)

1. Lysander Brightwater
2. Calla Venn
3. Orsino Gale
4. Marigold Ardent
5. Tiberius Sunfield
6. Evadne Lark
7. Cassius Whitlow
8. Rosalind Fairbanks
9. Aurelio Dunmore
10. Philippa Starling
11. Leander Gold
12. Isolde Tarn
13. Barnabas Clearwater
14. Cordelia Vance-Ames
15. Dorian Hale
16. Seraphina Wick
17. Gideon Flint
18. Ottoline Marsh
19. Percival Sunder
20. Beatrix Ashby

## Larkenfell names (1d20)

1. Wat Thistlewood
2. Maud Fennimore
3. Hob Alderfield
4. Nell Bramblecott
5. Piers Hollowell
6. Dilly Marsh
7. Gunnar Oaksby
8. Tansy Bell
9. Jory Appleby
10. Edda Longmeadow
11. Rafe Wickham
12. Bess Cartwright
13. Alder Penhallow
14. Winnie Tuck
15. Hamnet Reed
16. Ysabeau Ford
17. Cuthbert Pike
18. Lark Dunnock
19. Ferris Underhill
20. Poppy Greenslade

## Gloamreach names (1d20)

1. Harl Ashworth
2. Wren Salter
3. Morvyn Crake
4. Isbel Gaunt
5. Edric Mourne
6. Tamsin Pale
7. Corwyn Dray
8. Ottilie Thorne
9. Ansel Grimsby
10. Venna Ashgrave
11. Silas Murk
12. Brannoch Kell
13. Hester Cole
14. Lorcan Fenn
15. Maren Cinders
16. Dunmow Vane
17. Odette Rook
18. Piet Hallow
19. Greta Stone
20. Aldous Wraith

Use when you need a name on the spot, for a stranger at an inn, a messenger, a bandit chief or a traveller who turns out to matter.`,
);

export const FOES_TABLE = table(
  "foes",
  "FR — Foes by realm",
  ["foe", "foes", "enemy", "ambush", "encounter"],
  `# FR — Foes by realm

Roll for what the heroes meet. The realm note holds its stat line; the numbers below are how many, or the particular foe. Modify the roll for the situation, or pick the one that fits.

## Aurelane foes (1d6)

1. A Tourney Brute and two cronies spoiling for a bar fight.
2. A Gilded Highwayman, polite, flourishing a sword.
3. Four Sun-Cult Zealots in yellow robes, singing.
4. A Lacquer Knight on a white horse, who challenges you by name.
5. The Mirror Duchess, in the guise of someone the heroes trust.
6. A Storm-Hawk Rider dropping out of the clouds, with a message or a grudge.

## Larkenfell foes (1d6)

1. Five Redthistle Goblins in the hedgerow.
2. A Hedge Bandit with a pack, springing a trap on the lane.
3. A Marsh Wolf pack, hungry and bold.
4. A Briar Hag at a lonely cottage, kindly until you eat.
5. A Goblin Warchief with a dozen followers and a stolen cart.
6. A Barrow Wight, drifting out of the mist with cold hands.

## Gloamreach foes (1d6)

1. A knot of Ashen Cultists in the fog, praying aloud.
2. A Plague Rat Swarm pouring out of a cellar.
3. A Carrion Ghoul gnawing on something it should not.
4. A Bone-Warden Soldier and his pack, enforcing a curfew.
5. A Drowned Priest at the water's edge, dripping and smiling.
6. A Hollow-Eyed Inquisitor, quietly asking for your papers.

Use when a fight is needed, an ambush is due, or the road has been too quiet. Read the realm note for the foe's stat line, then run it by its words.`,
);

export const TREASURE_TABLE = table(
  "treasure",
  "FR — Treasure",
  ["treasure", "loot", "reward", "find", "hoard"],
  `# FR — Treasure

Each find is worth about its weight in gold, and that is its XP. Award it with award_xp, with the find's name as the source. Every hero present gets the full amount, once.

## Everyday finds (1d20)

1. A pouch of old silver coins. XP 100.
2. A silver ladle with a family crest on it. XP 100.
3. A hand-drawn map to a nearby ruin. XP 150.
4. A set of silk gloves, still sweet-smelling. XP 100.
5. A pair of good boots that fit the finder. XP 150.
6. A jar of honey from the hedge-folk's bees. XP 100.
7. A small bell that rings once if anyone lies near it. XP 200.
8. A fiddle, slightly out of tune but a good one. XP 200.
9. A bundle of letters, tied with red thread. XP 150.
10. A jewelled hair-comb, stolen from somebody. XP 250.
11. A long, thin dagger with a bone handle. XP 200.
12. A crate of travelling-wine, sealed with wax. XP 250.
13. A ring of plain iron that is warm to the touch. XP 300.
14. A compass that points at the owner's heart's desire. XP 300.
15. A chest of mouldy but valuable books. XP 300.
16. A wolf-pelt cloak, heavy and warm. XP 200.
17. A lantern that burns without oil. XP 400.
18. A silver mirror that shows a stranger's face. XP 400.
19. A gold chain worn by a long-dead knight. XP 500.
20. A deed to a small mill in a faraway valley. XP 500.

## Great finds (1d6)

1. A sword that sings when drawn in anger. XP 1000.
2. A crown with a missing jewel and a long history. XP 1500.
3. A hoard of old coin, a full cartload. XP 2000.
4. A cloak of feathers that lets the wearer glide. XP 1500.
5. A horn that calls a friendly beast when blown. XP 1000.
6. A key that opens any lock once, and then crumbles. XP 1200.

Use when the heroes search a corpse, a chest or a ruin, finish a job, or find something worth a story. A great find belongs at the end of a long road, not a short one.`,
);

export const ROAD_TABLE = table(
  "road",
  "FR — On the road",
  ["road", "travel", "journey", "on the road", "wayfarers"],
  `# FR — On the road

Roll when the heroes travel a day or a night. Most of these are scenes, not fights. Pick one when it suits; roll when the road is a blank.

## On the road in Aurelane (1d10)

1. A herald on a white mule, announcing a tourney, who is out of breath.
2. A troupe of acrobats whose cart has lost a wheel.
3. A shrine to the Sun with a pilgrim who wants a companion on the stair.
4. A toll-gate with a cheerful keeper who accepts only riddles.
5. A passing knight challenges the heroes to a friendly bout.
6. A banner left on the road, with a message sewn into the hem.
7. A dragon's shadow crossing the fields, and every farmer waving.
8. A wedding procession blocking the lane, and a place laid at the table.
9. A fountain whose water answers questions in rhyme.
10. An inn whose whole cellar is being given away to celebrate something.

## On the road in Larkenfell (1d10)

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

## On the road in Gloamreach (1d10)

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

Use when the heroes travel with no destination in sight, to give the road a face. Let them avoid, join or ignore the scene, and play what they choose.`,
);

export const TABLE_NOTES: BuiltinNote[] = [
  NAMES_TABLE,
  FOES_TABLE,
  TREASURE_TABLE,
  ROAD_TABLE,
];
