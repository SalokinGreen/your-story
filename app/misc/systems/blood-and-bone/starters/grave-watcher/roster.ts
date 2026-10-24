/**
 * Grave Watcher: the roster (docs/bb-starters-design.md section 3.4,
 * decision 164). Eight Watchers, each a preset with a complete, legal sheet
 * (stats 3, 2, 2, 1, 1; a Kind, an Archetype, a Path and its first ability, a
 * free Power and its first ability, two Connections, gear), and one note the
 * GM reads to play the ones nobody picked. Original text (decision 3).
 * Spoiler-light: the secrets live in the secret notes, not here.
 */
import type { Preset, StoryLore } from "../../../../structs";
import { starterNote } from "../shared";

interface WatcherSheet {
  name: string;
  kind: string;
  archetype: string;
  path: string;
  nerve: number;
  heart: number;
  bone: number;
  shadow: number;
  wits: number;
  stressTriggers: string;
  recover: string;
  weakness: string;
  xp: string;
  connections: string;
  burdens: string;
  power: string;
  pathAbility: string;
  otherAssets: string;
  gear: string;
  before: string;
  moment: string;
  whoKnows: string;
}

/** The B&B sheet (sheet.ts), every field filled in. */
function sheet(w: WatcherSheet): string {
  return `# ${w.name}
**Kind:** ${w.kind}
**Archetype:** ${w.archetype}
**Path:** ${w.path}

## Stats (each 1-3; assign 3, 2, 2, 1, 1)
Nerve ${w.nerve} | Heart ${w.heart} | Bone ${w.bone} | Shadow ${w.shadow} | Wits ${w.wits}
Adds cap at +2 per roll; the action score caps at 10.

## Your Kind
**Stress triggers:** ${w.stressTriggers}
**Recover move:** ${w.recover}
**Weakness:** ${w.weakness}
**XP triggers in play:** ${w.xp}

## Connections (Weak, Steady or Strong)
${w.connections}

## Burdens
${w.burdens}

## Assets (abilities taken)
**Power:** ${w.power}
**Path ability:** ${w.pathAbility}
**Other assets:** ${w.otherAssets}
**Gear:** ${w.gear}
**Used tonight:** None

## Background
**Before:** ${w.before}
**The moment:** ${w.moment}
**Who knows:** ${w.whoKnows}
`;
}

const MIRABEL = sheet({
  name: "Mirabel Oyelaran",
  kind: "Witch/Warlock",
  archetype: "The Hedge Witch",
  path: "Midwife",
  nerve: 1,
  heart: 3,
  bone: 1,
  shadow: 2,
  wits: 2,
  stressTriggers:
    "A working goes wrong; the source of her power grows displeased; she is cut off from her tools (the fog-cup, a coven, sacred ground)",
  recover:
    "Sate the Beast: a small ritual sacrifice (a drop of blood, a keepsake, a kept secret); for a Hedge Witch it always costs 1 Ledger mark",
  weakness:
    "Her power is tied to her grandmother's pewter fog-cup; lose it and she is mortal until it is back",
  xp: "Archetype XP",
  connections:
    "Ingrid Moss at the apothecary (Steady): taught her the craft and still corrects her; Pearl Whitlock (Weak): her first client in town and her toughest critic",
  burdens: "None",
  power: "The Reading 1: touching an object shows a flash of its recent history; Gather Information that way, add +1",
  pathAbility:
    "Midwife 1: Gather Information from a household, a village or a sickbed, add +1",
  otherAssets: "None yet",
  gear: "Her grandmother's pewter fog-cup (her anchor); a pickup named Gwen; salt in pretty jars",
  before: "A midwife's apprentice in the next county, then two seasons reading the fog on Tower One",
  moment: "The first morning the fog read back to her, a name, in a grandmother's hand",
  whoKnows: "The whole town; it brings her casseroles and asks for weather",
});

const DEE = sheet({
  name: 'Dolores "Dee" Harjo',
  kind: "Hunter",
  archetype: "The Pragmatist",
  path: "Survivor",
  nerve: 1,
  heart: 2,
  bone: 1,
  shadow: 2,
  wits: 3,
  stressTriggers:
    "A hunt goes wrong; she sees how close she has come to becoming what she hunts; (as a Pragmatist, working with monsters is not a trigger unless there is a betrayal or harm)",
  recover:
    "Steel the Resolve: confide in a trusted ally, return to a place of safety, or finish a hunt clean; roll +Heart (a Connection) or +Wits (routine)",
  weakness: "No supernatural healing and no Sate the Beast shortcut; she recovers only through time, medicine and other people",
  xp: "Archetype XP",
  connections:
    "Marisol Ochoa at the Lamplight (Steady): keeps her a booth and a plate; Walt Pruitt (Weak): they have fought over the tower road for thirty years and would be lost without it",
  burdens: "None",
  power: "Monster Lore 1: Gather Information about a supernatural creature, add +1",
  pathAbility: "Survivor 1: Face Defeat, add +1",
  otherAssets: "None yet",
  gear: "A tower-door full of rules in her own hand; reading glasses on a string; a salt-shot twelve-bore; a thermos with a dent",
  before: "Thirty-one seasons on the Watch; a husband, buried in the Founders' Plot",
  moment: "The night in '94 something walked out of the Old Lot wearing his coat",
  whoKnows: "The town, who tease her about the glasses, and the Board, who file her under 'stubborn'",
});

const ODELL = sheet({
  name: "Odell Prewitt",
  kind: "Ghost",
  archetype: "The Anchored",
  path: "Tradesperson",
  nerve: 2,
  heart: 3,
  bone: 1,
  shadow: 2,
  wits: 1,
  stressTriggers:
    "Confronted with how he died (the Tower Five ladder); his tether is threatened or ignored; forced to touch the living world directly (running water, hallowed ground, a handshake)",
  recover:
    "Sate the Beast: reinforce the tether, a night sat in Tower Five or time with the person or place that binds him",
  weakness:
    "His tether is the Tower Five ladder and the post it climbs to; whoever destroys, resolves or claims it can send him on without a fight",
  xp: "Archetype XP",
  connections:
    "Sister Agnes (Steady): fellow dead, harmonises with him on Sunday nights; Tommy Reyes (Weak): the boy who wants his job and will not listen about the ladder",
  burdens: "None",
  power: "The Tether's Reach 1: acting at or near Tower Five, add +1",
  pathAbility: "Tradesperson 1: repair, modify or defeat a mundane mechanism or structure, add +1",
  otherAssets: "None yet",
  gear: "A lineman's belt and spurs that no longer touch the ground; his ledger of thirty-one years of logbook lines; a radio that always gets him",
  before: "A county lineman, then a Watcher: twenty-three seasons on Tower Five",
  moment: "A rung gave way in the rain in '88, hurrying to a call he did not need to answer",
  whoKnows: "Everyone: his name is on the tower door, and his widow still sends pie",
});

const HOBB = sheet({
  name: 'Hobart "Hobb" Sill',
  kind: "Gargoyle",
  archetype: "The Warden",
  path: "Outcast",
  nerve: 1,
  heart: 2,
  bone: 3,
  shadow: 1,
  wits: 2,
  stressTriggers:
    "Exposed to mortals; his disguise slips; the sun begins to rise",
  recover:
    "Sate the Beast: protect his territory (the north ridge and what lies under it); a strong hit also removes one Stress from an ally present",
  weakness:
    "Stone Slumber at sunrise is involuntary and total; anyone who knows where he stands by day has a free hand",
  xp: "Archetype XP",
  connections:
    "Pastor Hal Brewer (Steady): reads Hobb the Sunday paper from the tower step; Wendell Boone (Weak): the retired gravedigger who brings a thermos and bad advice",
  burdens: "None",
  power: "Territorial Sense 1: within his claimed territory, he knows how many are present; Gather Information about who, add +1",
  pathAbility: "Outcast 1: mortal systems do not track him; add +1 to avoid mundane surveillance",
  otherAssets: "None yet",
  gear: "A tower older than the Watch, with a stone ledge he sits on; a folded tarp; a tin of hard candy",
  before: "Carved over the chapel door of the first tower in 1931; woke the winter it was finished",
  moment: "The first night he was asked to keep watch, and wasn't told for how long",
  whoKnows: "The whole valley; the town thinks of him as the one who keeps the north ridge and does not talk",
});

const CASS = sheet({
  name: 'Cassidy "Cass" Moreno',
  kind: "Hunter",
  archetype: "The Penitent",
  path: "Athlete",
  nerve: 3,
  heart: 2,
  bone: 1,
  shadow: 1,
  wits: 2,
  stressTriggers:
    "A hunt goes wrong; she is forced to work with or spare a monster; she sees how close she has come to becoming what she hunts",
  recover:
    "Steel the Resolve (+Heart or +Wits), or by penance (once a night): a vigil, a debt paid or a hardship the GM names as a real cost, roll +Heart; a strong hit takes Stress down by 3, a weak hit by 1. Stress Relief: a small act of amends nobody will know about, a night of honest work for someone who needs it, or a confession heard in silence",
  weakness: "No supernatural healing and no Sate the Beast shortcut; only time, medicine and other people",
  xp: "Archetype XP",
  connections:
    "Hank Delgado at the Low Water (Steady): gave her a job, a loan and the benefit of the doubt; Tommy Reyes (Weak): the Lamplight busboy who thinks she is a hero",
  burdens: "None",
  power: "The Field Kit 1: once a session, she brought exactly the right tool; add +1 to the roll that uses it",
  pathAbility: "Athlete 1: Face Danger involving speed, endurance or physical control, add +1",
  otherAssets: "None yet",
  gear: "A running bike with a bell; a head-torch; a pocket notebook of everything she owes",
  before: "A college runner who needed money, now on her first season on Tower Seven",
  moment: "A dare in the Long Acre at nineteen, after which her friend Jess came out different and stopped speaking to her",
  whoKnows: "Hank, who covered for her, and Tommy, who wants her to say it was brave",
});

const BRAM = sheet({
  name: "Bram Gale",
  kind: "Werewolf",
  archetype: "The Packbound",
  path: "Shepherd",
  nerve: 2,
  heart: 2,
  bone: 3,
  shadow: 1,
  wits: 1,
  stressTriggers:
    "Isolated from the pack; challenged for dominance; the moon waxes toward full (on the full moon every trigger applies)",
  recover:
    "Sate the Beast: a physical release of dominance, a hunt, a fight or a challenge won within the pack",
  weakness: "Silver wounds cannot be healed supernaturally and scar for good",
  xp: "Archetype XP",
  connections:
    "Fiona Gale at the bakery (Steady): cousin, pack elder, the one he tries hardest to impress; Eli Sandoval (Weak): fixes his radio and wins every ball-score bet",
  burdens: "Indebted: to the Gale pack, for the early bakery shifts he owes (starts at Stress 1 in exchange)",
  power: "Hunter's Nose 1: Undertake a Journey following a trail, ignore the cost of a weak hit",
  pathAbility: "Shepherd 1: Slip Away and Undertake a Journey across open country, add +1",
  otherAssets: "None yet",
  gear: "A fence-line map worn soft; two big dogs that are not exactly his; a thermos of Fiona's coffee",
  before: "Raised in the bakery, a sheepdog among cousins, on Tower Four for three seasons",
  moment: "His first full moon on the fence line, when the dogs followed him and the fence held",
  whoKnows: "The pack, the town, and the dogs",
});

const EMMETT = sheet({
  name: "Emmett Roake",
  kind: "Revenant",
  archetype: "The Oathkeeper",
  path: "Sailor",
  nerve: 1,
  heart: 2,
  bone: 2,
  shadow: 3,
  wits: 1,
  stressTriggers:
    "A dawn passes with no step toward his promise (idle dawn); someone from the life he lost recognises him; the promise is left unkept",
  recover:
    "Sate the Beast: advance the promise, a step taken, a kindness done for the one he swore to; Shadow if quiet, Bone if by force",
  weakness:
    "His body is a corpse and heals only as fast as the promise lets it; at Stress 4+ the decay shows (-1 to Compel with anyone close); fire and long running water are hard on him",
  xp: "Archetype XP",
  connections:
    "June Abernathy (Steady): the only voice on the net that says good night to him; Bea Lindqvist (Weak): lets him read in the back of the library after closing",
  burdens: "None",
  power: "Dead Man's Patience 1: you do not sleep, tire or need to be fed; when he Faces Danger by outlasting something (cold, hunger, a long stakeout), add +1",
  pathAbility: "Sailor 1: Undertake a Journey by water, and Face Danger on a deck or in a swell, add +1",
  otherAssets: "None yet",
  gear: "A slicker that never dries; a coil of rope he knots when thinking; a stub of pencil and a page with one name on it",
  before: "A deckhand on the river boats, long ago; since September the new voice on Tower Six",
  moment: "He woke in the ground in spring, with a promise still in his mouth",
  whoKnows: "June, who has not asked; the rest of the net, who have been told he is shy",
});

const LISE = sheet({
  name: 'Liesel "Lise" Varga',
  kind: "Rusalka",
  archetype: "The Willing Tide",
  path: "Performer",
  nerve: 1,
  heart: 3,
  bone: 1,
  shadow: 2,
  wits: 2,
  stressTriggers:
    "A night without touching her water; a lure fails or is refused; she hears her own death named aloud",
  recover:
    "Sate the Beast: draw a life into the water without taking it: a mortal's breath, a vow sworn at the shore, a willing swim",
  weakness:
    "Dryness: each dawn without touching her water (the reservoir, or a bath drawn from it) raises Stress by 1; holding a church bell's rope, a cut willow branch or a hand-held flame, she cannot Compel",
  xp: "Archetype XP",
  connections:
    "Nell Fairweather at the Ferry Motel (Steady): lets her use room 6's tub every Thursday and asks no questions, aloud; Celeste Marchetti (Weak): trades singing for dance lessons",
  burdens: "None",
  power: "The Drowned Eye 1: Gather Information at the edge of her water, add +1; on a hit she learns what fell in there last",
  pathAbility: "Performer 1: Compel through performance, disguise or misdirection, add +1",
  otherAssets: "None yet",
  gear: "A gramophone horn she sings through; a jar of reservoir water; a green wool coat that is somehow always damp",
  before: "A dance-hall singer in the old low town, which the reservoir covered in 1958",
  moment: "The water coming up the street in the night, and her voice carrying over it",
  whoKnows: "The town; it keeps a pew by the window for her, and the Drowned Ground gate is hers",
});

function preset(
  id: string,
  name: string,
  description: string,
  icon: string,
  characterSheet: string,
  authorNotes: string,
): Preset {
  return { id, name, description, icon, characterSheet, authorNotes };
}

export const GW_PRESETS: Preset[] = [
  preset(
    "gw-dee-harjo",
    'Dolores "Dee" Harjo',
    "Tower Two. Human, Hunter (the Pragmatist). Thirty-one seasons. Knees gone, eyes not. Knows every section by the way its fog smells, and has a rule for each one written on the inside of her tower's door. Vow: find out who walked out of the Old Lot in '94 wearing her husband's coat. Connection: Marisol at the diner, who keeps her a booth.",
    "Crosshair",
    DEE,
    "Usual tower: Two (the Catholic Rise). Vow (Dangerous): find out who walked out of the Old Lot in '94 wearing her husband's coat. Stress starts at 2, Beast 0.",
  ),
  preset(
    "gw-mirabel-oyelaran",
    "Mirabel Oyelaran",
    "Tower One. Witch, Hedge Witch. Reads the fog from the founders' end of the yard, and the town reads her tea leaves in return. A midwife's apprentice who found her way to the Watch. Vow: find out why Pearl Whitlock lights a candle every May and will not say. Connection: Ingrid Moss at the apothecary, who taught her and still corrects her.",
    "Wand",
    MIRABEL,
    "Usual tower: One (the Founders' Plot and the gate). Vow (Dangerous): find out why Pearl Whitlock lights a candle every May. Needs the Witch meter set (Ledger) as well. Stress starts at 2.",
  ),
  preset(
    "gw-lise-varga",
    'Liesel "Lise" Varga',
    "Tower Three. Rusalka, Willing Tide. Drowned when the reservoir covered the old low town, and keeps the Drowned Ground now. Sings at the Sweetheart Supper if asked, and the whole room leaves in tears. Vow: teach Celeste Marchetti's grandson to swim, in the town pool, before the winter carnival. Connection: Nell Fairweather, who lets her use the motel's bath.",
    "Anchor",
    LISE,
    "Usual tower: Three (the Drowned Ground). Vow (Troublesome): teach Celeste Marchetti's grandson to swim before the winter carnival. Her water is the reservoir. Stress starts at 2.",
  ),
  preset(
    "gw-bram-gale",
    "Bram Gale",
    "Tower Four. Werewolf, Packbound. Runs the east fence line at every full moon and talks the whole net through it. Raised in the bakery, never quite grown out of the pack's early shifts. Vow: win Fiona Gale's blessing to run the fence line with the pack on the next full moon. Connection: Fiona, cousin and pack elder.",
    "TreePine",
    BRAM,
    "Usual tower: Four (the east fence line); the voice on the net. Vow (Dangerous): win Fiona Gale's blessing to run the pack on the fence line. Took the Indebted Burden (to the Gale pack), so Stress starts at 1.",
  ),
  preset(
    "gw-odell-prewitt",
    "Odell Prewitt",
    "Tower Five. Ghost, Anchored. A lineman who fell from his own tower's ladder in '88 and kept the post. Still takes the check-in on the hour. Vow: teach Tommy Reyes the ladder and the rules before the boy does something stupid. Connection: Sister Agnes, who sings with him on Sundays.",
    "Ghost",
    ODELL,
    "Usual tower: Five (the Paupers' Field). Vow (Troublesome): teach Tommy Reyes the ladder and the rules. His tether is the Tower Five ladder. Stress starts at 2.",
  ),
  preset(
    "gw-emmett-roake",
    "Emmett Roake",
    "Tower Six. Revenant, Oathkeeper. Took over the post the Watch had written off, and answers the net in two clicks of the mic. Quiet, courteous, damp at the cuffs. Vow: keep a promise made on a boat, long ago. Connection: June Abernathy, who says good night to him on the radio.",
    "Skull",
    EMMETT,
    "Usual tower: Six (the Old Lot side), which went quiet last spring. Vow (Dangerous): keep a promise made on a boat (the GM has the details in the secret). Stress starts at 2.",
  ),
  preset(
    "gw-cass-moreno",
    'Cassidy "Cass" Moreno',
    "Tower Seven. Human, Hunter (the Penitent). A runner in her first season, on the Watch for the money and for the debt she owes a friend. Fast, anxious and kind. Vow: pay back Hank Delgado, who covered for her, before the winter carnival. Connection: Tommy Reyes, who thinks she is brave.",
    "Star",
    CASS,
    "Usual tower: Seven (the Children's Hill). Vow (Dangerous): pay back Hank Delgado before the winter carnival. Stress starts at 2.",
  ),
  preset(
    "gw-hobb-sill",
    'Hobart "Hobb" Sill',
    "Tower Eight. Gargoyle, Warden. Came with the oldest tower in 1931 and has never left the north ridge. Says little, hears everything, hands out hard candy. Vow: get Arlo and Gus Brandt speaking again, before one of them dies of pride. Connection: Pastor Hal Brewer, who reads him the paper.",
    "Building",
    HOBB,
    "Usual tower: Eight (the north ridge). Vow (Dangerous): get Arlo and Gus Brandt speaking. He is stone by day (Stone Slumber). Stress starts at 2.",
  ),
];

const ROSTER = `# Grave Watcher — The roster

Eight Watchers, one to a tower. Each has a pre-made sheet (a preset). A player who picks one is reassigned to Tower Nine; a relief covers their old tower. The ones nobody picks are yours to play on the radio and in town. Hand a sheet to a player who joins later. Details below are spoiler-light; the secrets are in the secret notes.

Mirabel Oyelaran, Tower One. Witch/Warlock, Hedge Witch, Midwife. Voice: warm and dry, speaks in weather. Reads the fog by touch and says what it said back. Vow: find out why Pearl Whitlock lights a candle every May. Connections: Ingrid Moss (Steady), Pearl Whitlock (Weak). Likes: tea, a good argument about the weather. Wants: one night without a working.

Dee Harjo, Tower Two. Hunter, Pragmatist, Survivor, human. Voice: flat, wry, a nature documentary: "And here we see the Catholic Rise at dusk." Rules on the door. Vow: who walked out of the Old Lot in '94 in her husband's coat. Connections: Marisol Ochoa (Steady), Walt Pruitt (Weak). Wants: her booth; one night off.

Lise Varga, Tower Three. Rusalka, Willing Tide, Performer. Voice: soft, humming under the words, over-polite. Keeps the Drowned Ground. Vow: teach Celeste Marchetti's grandson to swim. Connections: Nell Fairweather (Steady), Celeste Marchetti (Weak). Wants: to sing without scaring a room; dry days she can bear.

Bram Gale, Tower Four. Werewolf, Packbound, Shepherd. Voice: loud, cheerful, sings off-key, calls everyone by the wrong nickname. Runs the fence line. Vow: Fiona's blessing for the fence line. Connections: Fiona Gale (Steady), Eli Sandoval (Weak). Burden: Indebted to the pack. Wants: to be taken seriously; to eat.

Odell Prewitt, Tower Five. Ghost, Anchored, Tradesperson. Voice: deep, patient, a little formal, dead since '88 and not over the radio's slang. Takes the hour's check-in. Vow: teach Tommy Reyes the ladder. Connections: Sister Agnes (Steady), Tommy Reyes (Weak). Wants: the boy to be careful; to hear his widow's pie described.

Emmett Roake, Tower Six. Revenant, Oathkeeper, Sailor. Voice: almost none; two clicks, then a clipped yes or no. Courteous. Vow: a promise made on a boat. Connections: June Abernathy (Steady), Bea Lindqvist (Weak). Wants: the name on his page written down. Never volunteer why.

Cass Moreno, Tower Seven. Hunter, Penitent, Athlete, human. Voice: quick, nervous, funny when scared, over-thanks people. On her first season. Vow: pay back Hank Delgado. Connections: Hank Delgado (Steady), Tommy Reyes (Weak). Wants: to be useful; to stop owing.

Hobb Sill, Tower Eight. Gargoyle, Warden, Outcast. Voice: stone, slow, a few words per hour; a book's last line. By day he is stone: no one answers Eight at noon. Vow: get the Brandt brothers speaking. Connections: Pastor Hal Brewer (Steady), Wendell Boone (Weak). Wants: peace on the north ridge; hard candy.

How to play the ones nobody picked. Give each a radio bit (Dee's documentary, Bram's nicknames, Hobb's last lines). Let them turn up in town on their days off and bring their Vow into a scene. Do not let them solve the plot; let them hold their towers and have problems. When a player wants to swap to one, do it at the start of a scene and move their old sheet into the roster.

Solo or two players: pick two relief Watchers as above to fill the team to three or four. A good default is Dee (the veteran, who teaches) and Bram (the chatty one, who talks).`;

export const GW_ROSTER_NOTE: StoryLore = starterNote(
  "Grave Watcher — The roster",
  "lore",
  ROSTER,
  {
    keys: [
      "roster",
      "Watchers",
      "Mirabel",
      "Dee Harjo",
      "Lise",
      "Bram Gale",
      "Odell",
      "Emmett",
      "Cass Moreno",
      "Hobb",
    ],
  },
);
