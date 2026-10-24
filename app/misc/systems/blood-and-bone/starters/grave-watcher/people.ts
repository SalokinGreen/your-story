/**
 * Grave Watcher: the people of Hollins Ferry (docs/bb-starters-design.md 3.5,
 * decisions 171-172). Twenty-five regulars as NPCs and as notes, and
 * thirty-five occasional visitors in two notes. Original text (decision 3).
 */
import type { NPC, NPCAttitude, StoryLore } from "../../../../structs";
import { starterNote } from "../shared";

const STARTED_AT = Date.parse("2026-01-01T00:00:00.000Z");

function npc(
  slug: string,
  name: string,
  role: string,
  description: string,
  relationship: string,
  attitude: NPCAttitude,
  lastSeen: string,
  symbol: string,
  faction?: string,
): NPC {
  return {
    id: `npc-${slug}`,
    name,
    description,
    role,
    status: "alive",
    relationship,
    attitude,
    lastSeen,
    symbol,
    ...(faction ? { faction } : {}),
    createdAt: STARTED_AT,
  };
}

export const GW_REGULARS_NPCS: NPC[] = [
  npc(
    "marisol-ochoa",
    "Marisol Ochoa",
    "Owner of the Lamplight diner",
    "Fifties, quick, a pencil in her hair she never uses. Has refused Wi-Fi for eleven years on the grounds that people should talk. Knows how every Watcher takes their coffee and what they are not telling her.",
    "Keeps a booth for the Watch and a running tab she pretends not to keep.",
    "friendly",
    "the Lamplight",
    "☕",
    "Hollins Ferry",
  ),
  npc(
    "walt-pruitt",
    "Walt Pruitt",
    "Town selectman",
    "Sixties, round, a clipboard like a sidearm. Runs every town meeting as if it were a siege and has put a sign on every door in Hollins Ferry. Means well, loudly.",
    "Wants the Watch at every meeting and signs them up for things without asking.",
    "neutral",
    "the town hall steps",
    "📋",
    "Hollins Ferry",
  ),
  npc(
    "cora-pruitt",
    "Cora Pruitt",
    "Chair of the Founders' Day committee (and every other)",
    "Walt's wife, sixties, immaculate cardigan, a smile that has ended careers. The real power in town, and aware that Walt thinks it is him.",
    "Recruits the Watch for committees with great warmth and no exit.",
    "friendly",
    "the Lamplight, second booth",
    "🥧",
    "Hollins Ferry",
  ),
  npc(
    "june-abernathy",
    "June Abernathy",
    "The Watch's dispatcher in town",
    "Fifties, headset permanently round her neck, a desk in the back of the sheriff's building with a kettle and a police scanner. Knows everything first and tells it in the order she enjoys.",
    "Your link to the towers and the town. Hears your radio, so hears everything.",
    "allied",
    "the dispatch desk",
    "📻",
    "the Watch",
  ),
  npc(
    "lyle-greaves",
    "Lyle Greaves",
    "Funeral director, retiring after forty years",
    "Seventies, tall, gentle, with a dry wit he keeps for the bereaved. Has buried half the town and knows what each family could not say at the service.",
    "Old friend of the Watch: you bring him what the yard gives up, and he keeps it decent.",
    "friendly",
    "Greaves & Sons",
    "⚰️",
    "Hollins Ferry",
  ),
  npc(
    "teddy-vance",
    "Teddy Vance",
    "The new man at Greaves & Sons",
    "Thirties, polite, very well dressed for a small town, a new car that is too clean. Paid cash for the Hendricks place and has not said where from.",
    "Pleasant to the Watch, a little too interested in the yard's old sections.",
    "neutral",
    "Greaves & Sons",
    "🚗",
    "Hollins Ferry",
  ),
  npc(
    "ruth-okafor",
    "Sheriff Ruth Okafor",
    "County sheriff for Hollins Ferry",
    "Forties, tired, fair, shoes she has resoled twice. Hates paperwork about the yard and writes every report as if she will be asked to read it aloud.",
    "Trusts the Watch and would like to be told less.",
    "friendly",
    "the sheriff's office",
    "⭐",
    "Hollins Ferry",
  ),
  npc(
    "gus-brandt",
    "Gus Brandt",
    "Half of Brandt Hardware",
    "Sixties, forearms like fence posts, sells salt by the sack and never asks what for. Runs the left half of the shop, with a painted line down the middle of the floor.",
    "Gives the Watch a discount on salt and a view on his brother.",
    "friendly",
    "Brandt Hardware, left side",
    "🧂",
    "Hollins Ferry",
  ),
  npc(
    "arlo-brandt",
    "Arlo Brandt",
    "The other half of Brandt Hardware",
    "Sixties, spectacles on a cord, runs the right half of the shop. Has not spoken to Gus since 2011 and will tell anyone why, differently each time.",
    "Gives the Watch the better rope and a view on his brother.",
    "friendly",
    "Brandt Hardware, right side",
    "🔧",
    "Hollins Ferry",
  ),
  npc(
    "celeste-marchetti",
    "Celeste Marchetti",
    "Dance teacher, the studio above the bank",
    "Fifties, a former chorus girl from somewhere with an ocean, silver hair, a cane she uses as a baton. Runs the dance marathon every year and has never once let anyone sit down.",
    "Believes the Watch can be taught to waltz. Is mostly right.",
    "friendly",
    "the studio above the bank",
    "💃",
    "Hollins Ferry",
  ),
  npc(
    "desmond-hale",
    "Desmond Hale",
    "The town's one Vampire; night shift at the pharmacy",
    "Looks forty, has been looking forty since 1974. Soft-spoken, spotless white coat, a neat line in dry remarks. Takes the night shift because the town needs someone awake.",
    "Treats the Watch as colleagues. Stays out of the yard on principle.",
    "friendly",
    "the pharmacy, late",
    "💊",
    "Hollins Ferry",
  ),
  npc(
    "sister-agnes",
    "Sister Agnes",
    "A Ghost; still sings at St. Bride's on Sundays",
    "A nun in a grey habit, half see-through in daylight. Sings the alto line a half-beat early and glares at whoever is late. She remembers every wedding in the chapel since 1952, and the ones that did not happen.",
    "Has opinions on the Watch's hours and its manners.",
    "friendly",
    "St. Bride's",
    "🕊️",
    "St. Bride's",
  ),
  npc(
    "owen-lister",
    "Owen Lister",
    "Board of Wardens inspector from the county",
    "Forties, easy smile, good coat, remembers your name after one meeting. Charming in a way that makes you check your pockets, and entirely sincere, which is worse.",
    "Inspects the towers and the logbooks. Likes the Watch and has to write it up anyway.",
    "neutral",
    "the Ferry Motel",
    "🧳",
    "the Board of Wardens",
  ),
  npc(
    "hal-brewer",
    "Pastor Hal Brewer",
    "Minister at St. Bride's",
    "Fifties, enormous voice, sermons that run twenty minutes over and funerals that are perfect. Pretends not to hear Sister Agnes and has never once been fooled.",
    "Buries what the Watch cannot lay quiet. Asks nothing, offers pie.",
    "friendly",
    "St. Bride's",
    "⛪",
    "St. Bride's",
  ),
  npc(
    "bea-lindqvist",
    "Bea Lindqvist",
    "Librarian and keeper of the historical society",
    "Seventies, tiny, cardigan, reading glasses on a chain. The town's memory, and its most dangerous gossip, because she can prove it.",
    "Lends the Watch old maps and asks only for the stories back.",
    "friendly",
    "the library",
    "📚",
    "Hollins Ferry",
  ),
  npc(
    "rocco-tanaka",
    "Rocco Tanaka",
    "Gas station owner and the town's only tow truck",
    "Forties, grease to the elbows, a radio always on the oldies. Has towed every car in the county, including some that were not parked.",
    "Drives the Watch to a tower when the road floods, for coffee.",
    "friendly",
    "the gas station",
    "⛽",
    "Hollins Ferry",
  ),
  npc(
    "nell-fairweather",
    "Nell Fairweather",
    "Runs the Ferry Motel",
    "Sixties, bright lipstick, a front desk with a view of the whole street. Second-best gossip in town and furious about it.",
    "Puts every visitor to the yard in room 6, and tells the Watch who is in it.",
    "friendly",
    "the Ferry Motel",
    "🔑",
    "Hollins Ferry",
  ),
  npc(
    "imani-price",
    "Dr. Imani Price",
    "Town doctor",
    "Forties, calm, a bag she never lets out of reach. Treats the living and, discreetly, the rest. Writes in a hand nobody can read, on purpose.",
    "Patches Watchers up at any hour and bills them in biscuits.",
    "allied",
    "the clinic on Elm",
    "🩺",
    "Hollins Ferry",
  ),
  npc(
    "hank-delgado",
    "Hank Delgado",
    "Bartender at the Low Water",
    "Fifties, a towel on one shoulder, a laugh you can hear from the street. The Watch drinks free on its first night off, and every night after is a debt he will mention.",
    "The Watch's unofficial priest, and quietly the town's.",
    "friendly",
    "the Low Water",
    "🍺",
    "Hollins Ferry",
  ),
  npc(
    "pearl-whitlock",
    "Pearl Whitlock",
    "Ninety-one; three husbands, all in the Long Acre",
    "Tiny, sharp, in a hat with a pin. Visits each husband weekly, brings each a different flower, and reports to each on the others.",
    "Walks into the yard in daylight and has never been stopped. Lectures the Watch.",
    "friendly",
    "the Long Acre, Catholic Rise",
    "🌹",
    "Hollins Ferry",
  ),
  npc(
    "tommy-reyes",
    "Tommy Reyes",
    "Busboy at the Lamplight, seventeen",
    "Gangly, earnest, apron too short. Wants to be a Watcher so badly it is difficult to watch. Reads the Watch's rulebook for fun.",
    "Hero-worships the Watch and keeps running after them.",
    "friendly",
    "the Lamplight, kitchen door",
    "🧹",
    "Hollins Ferry",
  ),
  npc(
    "fiona-gale",
    "Fiona Gale",
    "A Werewolf; runs the bakery with her loud family",
    "Thirties, flour to the elbow, a laugh that fills the shop. Her family argues in four voices at once and the bakery opens at 5 a.m. without exception. Makes a bread called the Full Moon that sells out by nine.",
    "Treats the Watch as neighbours first and as fellow night workers second.",
    "friendly",
    "the bakery",
    "🥖",
    "Hollins Ferry",
  ),
  npc(
    "eli-sandoval",
    "Eli Sandoval",
    "Radio repairman and ham operator; keeps the Watch net running",
    "Fifties, soldering iron in the pocket, a shed full of tubes and a big old antenna. Talks to the net at night in a voice like a late-night DJ.",
    "The reason the towers can hear each other. Fixes anything for a sandwich.",
    "allied",
    "his radio shed",
    "🔌",
    "the Watch",
  ),
  npc(
    "ingrid-moss",
    "Ingrid Moss",
    "A Witch; apothecary and flower shop",
    "Thirties, dark hair, dirt under the nails, a shop that smells of rosemary and rain. Sells wreaths to the funeral home and herbs to everyone else.",
    "Sells the Watch salt, rue and good advice, usually in that order.",
    "friendly",
    "the apothecary",
    "🌿",
    "Hollins Ferry",
  ),
  npc(
    "wendell-boone",
    "Wendell Boone",
    "Retired gravedigger; the bench outside Brandt Hardware",
    "Eighties, large hands, a hat older than the Watch. Dug most of the graves in the Long Acre and remembers where all of them are, including the ones with no records.",
    "Gives the Watch the yard's real history, in the order it occurs to him.",
    "friendly",
    "the bench outside Brandt Hardware",
    "🪦",
    "Hollins Ferry",
  ),
];

const REGULARS_PARTS: StoryLore[] = [
  starterNote(
    "Grave Watcher — Town regulars, A–H",
    "lore",
    `# Hollins Ferry regulars, A–H (by first name)

Each: running bit, wants, soft spot, the web, where to find them. Use one a scene.

**Agnes, Sister** (Ghost). Bit: sings the alto half a beat early and glares at latecomers. Wants: the hymn board changed back to the old numbers. Soft spot: remembers every wedding in St. Bride's since 1952, and the ones that never happened. Web: Pastor Hal pretends not to hear her; Bea has her in the records as "resident, chapel". Find: Sundays at ten, the chapel at dusk.

**Arlo Brandt** (right half of the hardware store). Bit: tells why he and Gus stopped speaking, differently every time. Wants: Gus to speak first. Soft spot: keeps Gus's old birthday card in the till. Web: the painted line down the shop floor; the brothers pass messages through Wendell. Find: the shop, weekdays; Thursday evenings at the Low Water.

**Bea Lindqvist** (library, historical society). Bit: answers a question with the book and the page. Wants: the Old Lot's records, which do not exist. Soft spot: has never lent out the town's first ledger. Web: Wendell is her living archive and refuses to be indexed; Sister Agnes corrects her dates. Find: the library; Mondays at the Lamplight with a stack.

**Celeste Marchetti** (dance teacher). Bit: counts everyone in, out loud, in the street. Wants: the dance marathon to run to dawn this year with no one sitting. Soft spot: has not danced with a partner since her husband, and will not say why. Web: Hank donates the punch; Pastor Hal blesses the floor; Cora sits on the committee. Find: the studio above the bank, evenings.

**Cora Pruitt** (committees). Bit: "I'll just put you down." Wants: a perfect Founders' Day and Walt kept away from the microphone. Soft spot: hid the last Halloween committee's notes because of what they said about the Old Lot. Web: runs Walt; clashes with Marisol over the pie table; Celeste's marathon rival. Find: the Lamplight, second booth, mornings.

**Desmond Hale** (Vampire, night pharmacist). Bit: says "good morning" at midnight. Wants: Dr. Price's blood-bank arrangement kept quiet and tidy. Soft spot: keeps a photo of the pharmacy's 1974 sign. Web: Dr. Price supplies him; Marisol sends a late coffee he does not drink; Fiona waves from the bakery at 5 a.m. Find: the pharmacy after dark.

**Eli Sandoval** (radio repair, ham operator). Bit: calls the net "the party line" and reads the weather to it like poetry. Wants: one night when every tower answers. Soft spot: still hears Tower Six's last transmission some nights. Web: June's closest friend on the net; teaches Tommy radio; owes Rocco a favour. Find: his shed, any hour; the net, nightly.

**Fiona Gale** (Werewolf, bakery). Bit: loses an argument with her mother every dawn by 5:10. Wants: her bakery to stay normal through the full moon. Soft spot: the Watch's fence-line runner is the only one who knows how she runs. Web: Rocco is sweet on her and tows her van for free; Desmond waves. Find: the bakery from five; the fence at the full moon.

**Gus Brandt** (left half of the hardware store). Bit: sells you the salt and tells you how to use it. Wants: an apology Arlo will not give. Soft spot: leaves the shop lights on all night in case someone needs him. Web: feuds with Arlo; Wendell sits outside; Teddy bought a lot of paint here. Find: the shop; the bench with Wendell at noon.

**Hal Brewer, Pastor** (St. Bride's). Bit: finishes a sermon, then adds "one more thing". Wants: Sister Agnes to take a seat at last. Soft spot: has said the same prayer for the Old Lot every Sunday for nineteen years. Web: Cora, committees; Pearl, husbands; Lyle, funerals. Find: the chapel; the Lamplight after services.

**Hank Delgado** (the Low Water). Bit: the first drink is on him, the second is on a story. Wants: quiet nights and the dance marathon's punch contract. Soft spot: the Watch's best listener; has never repeated a word. Web: Arlo drinks Thursdays; Celeste owes him; Owen Lister tips like a king. Find: the Low Water, four till close.`,
    {
      characters: [
        "Sister Agnes",
        "Arlo Brandt",
        "Bea Lindqvist",
        "Celeste Marchetti",
        "Cora Pruitt",
        "Desmond Hale",
        "Eli Sandoval",
        "Fiona Gale",
        "Gus Brandt",
        "Pastor Hal Brewer",
        "Hank Delgado",
      ],
    },
  ),
  starterNote(
    "Grave Watcher — Town regulars, I–Z",
    "lore",
    `# Hollins Ferry regulars, I–Z (by first name)

Each: running bit, wants, soft spot, the web, where to find them. Use one a scene.

**Imani Price, Dr.** (town doctor). Bit: writes in a hand nobody can read, on purpose. Wants: Watchers to come in before the infection, not after. Soft spot: keeps a drawer of every tooth the yard ever cost her patients. Web: supplies Desmond; bickers with Ingrid about herbs and is usually wrong. Find: the clinic on Elm; Wednesdays at the Lamplight.

**Ingrid Moss** (Witch, apothecary). Bit: "that'll be rue" without being asked. Wants: the Founders' Day wreath contract away from the funeral home's florist cousin. Soft spot: dreams in the yard's old languages. Web: Dr. Price; Fiona buys herbs for the family's moon week; Teddy ordered an odd wreath. Find: the shop; the Catholic Rise at dawn for cuttings.

**June Abernathy** (Watch dispatcher). Bit: "I heard that before you said it." Wants: Tower Six's silence explained. Soft spot: keeps Tower Six's coffee mug washed on her shelf. Web: Eli (the net); Nell (gossip rival); the Sheriff next door; Owen Lister sends flowers she says she hates. Find: the dispatch desk; the net every night.

**Lyle Greaves** (funeral director). Bit: fits a quiet joke into every goodbye. Wants: to retire without a bad last funeral. Soft spot: keeps a list of the unclaimed. Web: Teddy, his successor, bought the Hendricks place in cash and does not seem to notice it matters; Pastor Hal; Wendell. Find: Greaves & Sons; the Low Water on the first of the month.

**Marisol Ochoa** (the Lamplight). Bit: refuses Wi-Fi; hands you a menu and a newspaper. Wants: the Watch to eat something green. Soft spot: knows who left town and why, and keeps their booths in her head. Web: Tommy works for her; Cora, the pie table; Walt, parking; Dee Harjo's booth. Find: the Lamplight, six till three.

**Nell Fairweather** (Ferry Motel). Bit: gossip that begins "I shouldn't say". Wants: to be first with one thing, once. Soft spot: puts a lamp in the window of room 6 for anyone who arrives after dark. Web: June, rival; Owen Lister, her favourite guest; Bea, source. Find: the front desk; the Lamplight at breakfast.

**Owen Lister** (Board inspector). Bit: compliments the logbook, then the Watcher, then asks the hard question. Wants: a clean report and a reason to come back. Soft spot: has never filed a finding against a tower he liked. Web: June; Nell; Sheriff Okafor, who distrusts him politely. Find: the Ferry Motel; the Lamplight on inspection weeks.

**Pearl Whitlock** (91). Bit: gives each husband a different flower and tells him about the others. Wants: a fourth husband, as a joke only she finds funny. Soft spot: knows which of the three she loved. Web: Wendell dug all three graves; Pastor Hal visits her; Tommy carries her bag. Find: the Catholic Rise, Tuesdays, Thursdays, Saturdays.

**Rocco Tanaka** (gas station, tow truck). Bit: oldies on every radio, tells you the year of the song. Wants: Fiona to say yes to dinner. Soft spot: tows the Watch out of the yard in flood season and never charges. Web: Fiona; Eli; Gus (fuel for the hardware van). Find: the gas station; the Lamplight at noon.

**Ruth Okafor, Sheriff.** Bit: "Put it in writing. Short." Wants: no paperwork about the yard. Soft spot: has a drawer of reports she never filed. Web: Walt (permits), June next door, Owen Lister at arm's length. Find: the sheriff's office; the Lamplight, third stool.

**Teddy Vance** (Greaves & Sons). Bit: perfect manners; asks the Watch how the yard "feels". Wants: the Hendricks place finished. Soft spot: the GM decides what the cash is, and what he wants with the old sections. Web: Lyle; Gus (paint); Ingrid (wreath). Find: Greaves & Sons; the yard gate at dusk, alone.

**Tommy Reyes** (busboy, 17). Bit: knows the Watch's rulebook by heart. Wants: a tower of his own, or a ride in Rocco's truck. Soft spot: his mother thinks he is saving for college. Web: Marisol; Eli teaches him radio. Find: the Lamplight; Eli's shed after school.

**Walt Pruitt** (selectman). Bit: "As the chair, I'm going to rule that…". Wants: the parking vote. Soft spot: Cora; he knows who runs him and loves it. Web: Marisol (parking); Sheriff Okafor; Arlo and Gus (zoning). Find: the town hall; any door with a sign on it.

**Wendell Boone** (retired gravedigger). Bit: answers every question with a different one, then the right one an hour later. Wants: the Old Lot left alone. Soft spot: dug there once, and has never said what he found. Web: Pearl, three graves; Bea; Gus and Arlo. Find: the bench outside Brandt Hardware, ten till four.`,
    {
      characters: [
        "Dr. Imani Price",
        "Ingrid Moss",
        "June Abernathy",
        "Lyle Greaves",
        "Marisol Ochoa",
        "Nell Fairweather",
        "Owen Lister",
        "Pearl Whitlock",
        "Rocco Tanaka",
        "Sheriff Ruth Okafor",
        "Teddy Vance",
        "Tommy Reyes",
        "Walt Pruitt",
        "Wendell Boone",
      ],
    },
  ),
];

const NL = String.fromCharCode(10);

/** The 25 regulars as one note (they fit under the cap). */
export const GW_REGULARS_NOTE: StoryLore = starterNote(
  "Grave Watcher — Town regulars",
  "lore",
  `# Hollins Ferry regulars (by first name)

Each: running bit, wants, soft spot, the web, where to find them. Use one a scene.

${REGULARS_PARTS.map((p) => p.content.split(NL).slice(4).join(NL).trim()).join(NL + NL)}`,
  { characters: REGULARS_PARTS.flatMap((p) => p.relatedCharacters) },
);

export const GW_VISITORS_NOTES: StoryLore[] = [
  starterNote(
    "Grave Watcher — Occasional visitors (1)",
    "lore",
    `# Occasional visitors (1 of 2)

People who come and go, each with a when. They become NPCs only when you bring one in; name them with the Names table.

1. **The knife-sharpener.** Every second Tuesday, a bicycle cart with a bell. Sharpens the Lamplight's knives and the Watch's tools, trades gossip from three counties.
2. **The November mourners.** A family of nine, the first week of November. Visit one grave in the Paupers' Field and will not say whose.
3. **The honey woman.** At every festival, a folding table. Her honey is the best in the state; she will not say where her hives are.
4. **The bookmobile.** First Saturday of the month. The county librarian lends Bea a book she has not read, which Bea resents.
5. **The college kids.** The week before Halloween, in a car with a broken tail-light. Come to see the yard on a dare; one always stays behind.
6. **A Watcher on leave.** From another yard, late winter, looks tired. Wants a quiet booth and a listener, and says nothing useful until the third coffee.
7. **The visiting preacher.** The last Sunday of each quarter. Hal hosts; Sister Agnes hates him.
8. **The county nurse.** Every second month, vaccination day at the clinic. Knows Dr. Price's secret and likes her for it.
9. **The salt truck.** Every first snow. The driver is a Werewolf who sleeps in the cab and tips in pastries.
10. **The fireworks man.** The week before Founders' Day, a van with a hand-lettered sign. Walt tries to ban him; Cora hires him.
11. **The ghost-tour couple.** Summer weekends, with a lantern and a script. Their tour is wrong and they are happy; do the Watch correct it?
12. **The widow from the coast.** Every spring. Comes to lay a stone for a husband who is not buried here.
13. **The travelling dentist.** The third Thursday of each month, in the church basement. People line up and fib about flossing.
14. **The Board's courier.** Quarterly, a grey envelope. Never says what is in it. Nell insists she can read through paper.
15. **The tourist photographer.** Late October. Wants one clear picture of the fog in the Drowned Ground. Never gets it, always comes back.
16. **The pilgrims.** A family of Rusalka who travel by river, at every high-water spring, and ask the Watch's leave to touch the reservoir.
17. **The hitchhiker.** Whenever the weather turns. Walks the highway, always the same age and the same coat. Rocco will not stop for her.`,
  ),
  starterNote(
    "Grave Watcher — Occasional visitors (2)",
    "lore",
    `# Occasional visitors (2 of 2)

People who come and go, each with a when. They become NPCs only when you bring one in; name them with the Names table.

18. **The pie judge.** Founders' Day, a big-city food writer in a bad hat. Marisol and Fiona each want the prize and lie to him sweetly.
19. **The estate lawyer.** Odd Tuesdays in winter. Handles the wills of the old; knows what Pearl's husbands left.
20. **The carnival crew.** Winter carnival week, with rides in trailers. A Changeling runs the ticket booth and has never been on a ride.
21. **The ham-radio contest.** The first weekend of summer: forty operators in tents behind Eli's shed, and a stranger on the net with no call sign.
22. **The dry-cleaner's van.** Every Monday. The driver tips the Watch his cigarettes and a warning, and will not say what about.
23. **The grandson.** Visits Wendell at Christmas, a city lawyer, tries to get him to move. Wendell offers him a shovel.
24. **The marathon couple.** The dance marathon: two students from the next county who dance the last night all the way to dawn and vanish.
25. **The vet.** Every second Friday, large-animal rounds. Rocco pays him in tows. Speaks of the Werewolf families as "patients".
26. **A Hunter in civilian clothes.** Once a season, passing through, polite and buying nothing. Keeps an eye on the Watch's logbook.
27. **The salvage buyer.** Late summer, a man in a suit asking after the Hendricks place and the Old Lot's stone. Teddy takes his calls.
28. **The knitting circle.** The second Wednesday, six women from three towns and a flask of something. Gossip faster than Nell.
29. **The Girl Scouts.** Cookie season, door to door. One of them is a Ghost who never ages out.
30. **The old soldier.** Memorial Day, in a wheelchair, laid beside the Paupers' Field with a flag he was never given.
31. **The census taker.** Every ten years, a cheerful man who counts the Long Acre's dead alongside the living and gets a different number every time.
32. **The motorcycle club.** The Fourth of July weekend, thirty riders on a charity run; one Wendigo rides in the middle, quietly hungry for pancakes.
33. **The wedding party.** June Saturdays, a couple who want the Lantern Walk for photos. Sister Agnes officiates without being asked.
34. **The man who sells umbrellas.** When the reservoir is low: a van, a patter, a Doppelgänger's smile. Sells to the Watch at cost.
35. **The traveller who asks directions.** A different person each time, the same question every time: where is the Old Lot? Whoever answers should think twice.`,
  ),
];
